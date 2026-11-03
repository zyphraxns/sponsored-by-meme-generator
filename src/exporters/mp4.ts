/**
 * MP4 导出（SPEC 5.2）：WebCodecs `VideoEncoder` + mediabunny 1.62.1 封装。
 *
 * 为什么不是 MediaRecorder（SPEC 已排除）：videoBitsPerSecond 只是 hint、
 * 容器由浏览器决定、只能实时录制无法离线加速、关键帧不可控。
 *
 * 帧率 30 而非 GIF 的 16：GIF 的低帧率是为体积妥协，MP4 每帧成本低一个
 * 量级，没有理由沿用那个限制。时间戳直接用 i/fps 秒，不经 10ms 量化。
 */
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import type { VideoCodec } from 'mediabunny';
import { canvasSize, loopSecondsFor, scene, sceneIconSvgs, sceneLogoSvgs, sceneTexts } from '../core/scene';
import type { ExportProgress } from '../core/frames';
import type { SceneState } from '../core/types';
import { rasterizeScene, rasterizeToCanvas } from './png';
import { svgForRaster } from './fonts';

/** MP4 帧率：与 GIF 的 16fps 解耦，滚动更顺 */
export const MP4_FPS = 30;

/** 候选编码器按兼容性排序：H.264 几乎全平台可播，其次 VP9 / AV1 */
const CODEC_PREFERENCE: VideoCodec[] = ['avc', 'vp9', 'av1'];

/** WebCodecs 是否可用（Firefox for Android 等不支持 → UI 需降级提示，SPEC 5.2） */
export function webCodecsAvailable(): boolean {
  return typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';
}

/** 挑第一个能编码的 codec；null = 本浏览器没有可用视频编码器 */
export async function pickMp4Codec(width: number, height: number): Promise<VideoCodec | null> {
  if (!webCodecsAvailable()) return null;
  return getFirstEncodableVideoCodec(CODEC_PREFERENCE, {
    width,
    height,
    frameRate: MP4_FPS,
    quality: QUALITY_HIGH,
  });
}

export interface Mp4Result {
  blob: Blob;
  codec: VideoCodec;
  frames: number;
  /** 实际使用的画布尺寸（平台档位可能降档） */
  width: number;
  height: number;
}

export interface Mp4Options {
  /** 覆盖帧率（默认 MP4_FPS）。仅供自检页缩放与低端设备降档，UI 不暴露 */
  fps?: number;
}

/**
 * MP4 导出：逐帧 SVG → canvas → CanvasSource → mp4 封装。
 *
 * 关键帧间隔设为**整个循环时长**：循环点落在关键帧上，播放器重播时无需
 * 回退解码，接缝干净（与 GIF 的无缝循环是同一目标的不同实现）。
 */
export async function exportMp4(
  state: SceneState,
  onProgress?: ExportProgress,
  options: Mp4Options = {},
): Promise<Mp4Result> {
  const { w, h } = canvasSize(state.template, state.ratio);
  const loop = loopSecondsFor(state);
  const fps = options.fps ?? MP4_FPS;
  const total = Math.max(1, Math.round(loop * fps));

  const codec = await pickMp4Codec(w, h);
  if (!codec) {
    throw new Error(
      webCodecsAvailable()
        ? '此浏览器没有可用的视频编码器，请改用 GIF'
        : '此浏览器不支持 WebCodecs 视频编码，请改用 GIF',
    );
  }

  // 复用同一块画布逐帧重绘（与 GIF 路径同策略，避免百帧级内存堆积）
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const target = new BufferTarget();
  const output = new Output({
    // fastStart 放 moov 到文件头：网页 <video> 可边下边播，不被 3.5 MB 卡住
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });
  const source = new CanvasSource(canvas, {
    codec,
    quality: QUALITY_HIGH,
    keyFrameInterval: loop,
  });
  output.addVideoTrack(source, { frameRate: fps });

  await output.start();

  const texts = sceneTexts(state);
  const iconSvgs = await sceneIconSvgs(state);
  // 官方完整字标（有则替代「符号 + 品牌名」）；变体按背景亮度挑，
  // 否则深底会拿到黑色字标直接消失
  const bg = state.palette?.bg ?? state.template.palette.bg;
  const { svgs: logoSvgs, aspect: logoAspect, ink: logoInk } = await sceneLogoSvgs(state, bg);
  const enriched: SceneState = { ...state, iconSvgs, logoSvgs, logoAspect, logoInk };
  for (let i = 0; i < total; i++) {
    const t = i / fps;
    const svg = await svgForRaster(scene(enriched, t), texts);
    // 首帧走带墨迹校验的路径（字体在 <img> 里异步解码），后续帧共用字体缓存
    if (i === 0) {
      await rasterizeScene(svg, w, h, enriched, canvas);
    } else {
      await rasterizeToCanvas(svg, w, h, canvas);
    }
    await source.add(t, 1 / fps);
    onProgress?.(i + 1, total);
    // 让出主线程：保持 UI 响应与进度刷新
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  source.close();
  await output.finalize();

  const buffer = target.buffer;
  if (!buffer) throw new Error('MP4 封装失败：输出缓冲为空');
  return { blob: new Blob([buffer], { type: 'video/mp4' }), codec, frames: total, width: w, height: h };
}

export function mp4Filename(state: SceneState): string {
  const { w, h } = canvasSize(state.template, state.ratio);
  return `${state.template.id}-${w}x${h}.mp4`;
}
