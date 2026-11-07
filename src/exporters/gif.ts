import { Encoder } from 'modern-gif';
import type { DitherMethod } from 'modern-gif';
import { canvasSize, loopSecondsFor, scene, sceneIconSvgs, sceneLogoSvgs, sceneTexts } from '../core/scene';
import { frameCount, frameDelayMs, frameTime } from '../core/frames';
import type { ExportProgress } from '../core/frames';
import type { SceneState } from '../core/types';
import { exportFilename } from './filename';
import { rasterizeScene, rasterizeToCanvas } from './png';
import { svgForRaster } from './fonts';

// 帧调度数学已下沉到 core/frames.ts（MP4 共用同一时间轴口径）；此处保留
// 再导出，导出层调用方与单测无需改 import 路径。
export { frameCount, frameDelayMs, frameTime } from '../core/frames';

export type GifProgress = ExportProgress;

/**
 * GIF 导出（M3 卡点里程碑）。
 *
 * 参数按 SPEC 5.1：fps 16 / maxColors 32 / atkinson 抖动 / 无限循环。
 * modern-gif 的 Encoder 累积全部帧样本后一次性生成全局调色板再编码——
 * 天然满足「帧间不闪烁」（且采样自所有帧而非仅首帧）。
 *
 * 已知代价：flush 前所有帧的 RGBA 同时驻留内存（1080² × 67 帧 ≈ 300 MB），
 * 桌面浏览器可接受；低分辨率档位留给 M5 平台预设（SPEC R3）。
 */
export async function exportGif(
  state: SceneState,
  onProgress?: GifProgress,
  signal?: AbortSignal,
): Promise<Blob> {
  // GIF 没有 alpha 通道：透明底只服务 PNG / SVG，逐帧渲染前强制恢复背景色
  const opaque: SceneState = state.transparentBg ? { ...state, transparentBg: false } : state;
  const { w, h } = canvasSize(opaque.template, opaque.ratio);
  const loop = loopSecondsFor(opaque);
  const fps = opaque.template.animation.fps;
  const delayMs = frameDelayMs(fps);
  const total = frameCount(fps, loop);
  // 文案在整段动画里不变：字体切片选择只做一次（首帧 fetch，其余帧命中缓存）
  const texts = sceneTexts(opaque);
  // 图标同理：整段动画用到的 SVG 图标只预取一次，写入 iconSvgs 供 scene() 渲染
  const iconSvgs = await sceneIconSvgs(opaque);
  // 官方完整字标（有则替代「符号 + 品牌名」）；变体按背景亮度挑，
  // 否则深底会拿到黑色字标直接消失
  const bg = opaque.palette?.bg ?? opaque.template.palette.bg;
  const { svgs: logoSvgs, aspect: logoAspect, ink: logoInk } = await sceneLogoSvgs(opaque, bg);
  const enriched: SceneState = { ...opaque, iconSvgs, logoSvgs, logoAspect, logoInk };

  const encoder = new Encoder({
    width: w,
    height: h,
    maxColors: opaque.template.export.gifMaxColors,
    dither: opaque.template.export.dither as DitherMethod,
    // 默认即 looped:true / loopCount:0（无限循环），显式写出以防上游改默认
    looped: true,
    loopCount: 0,
  });

  // 复用同一块画布逐帧重绘：67 帧只持有一块 1080² 画布
  const canvas = document.createElement('canvas');

  for (let i = 0; i < total; i++) {
    // 取消：默认档 67 帧要跑 30 秒以上，没有退出口就是把用户锁在里面
    if (signal?.aborted) throw new DOMException('export cancelled', 'AbortError');
    const svg = await svgForRaster(scene(enriched, frameTime(i, delayMs)), texts);
    // 首帧走带墨迹校验的路径：字体在 <img> 里异步解码，首帧可能空白；
    // 一旦首帧就位，后续帧共用同一字体缓存，直接栅格化即可。
    if (i === 0) {
      await rasterizeScene(svg, w, h, enriched, canvas);
    } else {
      await rasterizeToCanvas(svg, w, h, canvas);
    }
    await encoder.encode({ data: canvas, delay: delayMs });
    onProgress?.(i + 1, total);
    // 让出主线程：保持 UI 响应与进度刷新
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return encoder.flush('blob');
}

export function gifFilename(state: SceneState): string {
  return exportFilename(state, 'gif');
}
