import { canvasSize, scene, sceneIconSvgs, sceneLogoSvgs, sceneTexts } from '../core/scene';
import type { SceneState, TextLayer } from '../core/types';
import { svgForRaster } from './fonts';

/** SVG 字符串 → data URI（encodeURIComponent 路线，中文安全；btoa 会炸 Unicode） */
export function svgToDataUri(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * 栅格化到 canvas：SVG → <img> 解码 → drawImage。
 * 字体必须已由 svgForRaster 内嵌（<img> 上下文自取，跨设备一致）。
 * 传入既有 canvas 则复用（GIF 逐帧导出时只持有一块画布，省数百 MB）。
 */
export async function rasterizeToCanvas(
  svg: string,
  w: number,
  h: number,
  canvas?: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = svgToDataUri(svg);
  try {
    await img.decode();
  } catch (err) {
    throw new Error(`SVG 解码失败：${err instanceof Error ? err.message : String(err)}`);
  }
  const target = canvas ?? document.createElement('canvas');
  // 只在尺寸真的变化时重设：每帧重置 width/height 会让画布的绘制上下文与
  // 已提交的 VideoFrame 引用失效（MP4 的 CanvasSource 长期持有同一块画布）
  if (target.width !== w) target.width = w;
  if (target.height !== h) target.height = h;
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('无法获取 2D 画布上下文');
  ctx.clearRect(0, 0, w, h); // 显式清空，逐帧全量重绘无残留
  ctx.drawImage(img, 0, 0, w, h);
  return target;
}

/** 栅格化 → PNG Blob（下载路径） */
export async function rasterize(svg: string, w: number, h: number): Promise<Blob> {
  const canvas = await rasterizeToCanvas(svg, w, h);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/png');
  });
  if (!blob) throw new Error('PNG 编码失败');
  return blob;
}

// —— 字体竞态防护 ——
//
// 实测（M4）：`<img>` 里的内嵌字体是异步解码的，首次栅格化可能整块空白
// （font-display:block）或静默回退系统字体（swap，且不会重绘）。
// 小尺寸探针字形会假阳性（小图先就位、大图仍空白），唯一可信的信号是
// **真实产物的像素**：标题区域必须出现与背景不同的墨迹，否则等待重试。

const INK_DEADLINE_MS = 10_000;
const INK_RETRY_MS = 60;
/** 文本盒内「墨迹」占比阈值：正文字形覆盖远超此值，空白则接近 0 */
const INK_MIN_RATIO = 0.002;

function parseHex(color: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  if (!m) return [0, 0, 0];
  return [parseInt(m[1] as string, 16), parseInt(m[2] as string, 16), parseInt(m[3] as string, 16)];
}

/** 第一个文本图层在画布上的像素盒（无可校验文本时返回 null） */
function primaryTextBox(
  state: SceneState,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } | null {
  const layer = state.template.layers.find((l): l is TextLayer => l.type === 'text');
  if (!layer) return null;
  const [bx, by, bw, bh] = layer.box;
  return { x: Math.round(bx * w), y: Math.round(by * h), w: Math.round(bw * w), h: Math.round(bh * h) };
}

/** 文本盒内与背景不同的像素占比 */
function inkRatio(
  canvas: HTMLCanvasElement,
  box: { x: number; y: number; w: number; h: number },
  bg: [number, number, number],
): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 1; // 无法读取时不做判定，放行
  const region = ctx.getImageData(box.x, box.y, Math.max(1, box.w), Math.max(1, box.h)).data;
  let ink = 0;
  for (let i = 0; i < region.length; i += 4) {
    const dr = Math.abs((region[i] ?? 0) - bg[0]);
    const dg = Math.abs((region[i + 1] ?? 0) - bg[1]);
    const db = Math.abs((region[i + 2] ?? 0) - bg[2]);
    if (dr + dg + db > 24) ink++;
  }
  return ink / (region.length / 4);
}

/**
 * 主文本图层的「墨迹占比」：文本盒内与背景不同的像素比例。
 * 导出前的字体竞态校验与导出自检页都以此判定「文字真的画出来了」。
 */
export function textInkRatio(canvas: HTMLCanvasElement, state: SceneState): number {
  const box = primaryTextBox(state, canvas.width, canvas.height);
  if (!box) return 1; // 模板无文本图层 → 无从判定，放行
  const bg = parseHex(state.palette?.bg ?? state.template.palette.bg);
  return inkRatio(canvas, box, bg);
}

/**
 * 导出用栅格化：渲染后校验文本盒确有墨迹，没有则等待重试（字体加载中）。
 * 超时抛错——宁可导出失败得响亮，也不允许静默产出缺字的 PNG / GIF。
 */
export async function rasterizeScene(
  svg: string,
  w: number,
  h: number,
  state: SceneState,
  canvas?: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const deadline = Date.now() + INK_DEADLINE_MS;
  for (;;) {
    const target = await rasterizeToCanvas(svg, w, h, canvas);
    if (textInkRatio(target, state) > INK_MIN_RATIO) return target;
    if (Date.now() > deadline) {
      throw new Error('文本图层未渲染：内嵌字体加载超时（导出已中止，避免产出缺字图片）');
    }
    await new Promise((resolve) => setTimeout(resolve, INK_RETRY_MS));
  }
}

/** 静态 PNG 导出：t = 0，画布取模板自然像素（basePx） */
export async function exportPng(state: SceneState, t: number): Promise<Blob> {
  const { w, h } = canvasSize(state.template, state.ratio);
  const iconSvgs = await sceneIconSvgs(state);
  // 官方完整字标（有则替代「符号 + 品牌名」）；变体按背景亮度挑，
  // 否则深底会拿到黑色字标直接消失
  const bg = state.palette?.bg ?? state.template.palette.bg;
  const { svgs: logoSvgs, aspect: logoAspect, ink: logoInk } = await sceneLogoSvgs(state, bg);
  const enriched: SceneState = { ...state, iconSvgs, logoSvgs, logoAspect, logoInk };
  const svg = await svgForRaster(scene(enriched, t), sceneTexts(enriched));
  const canvas = await rasterizeScene(svg, w, h, enriched);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/png');
  });
  if (!blob) throw new Error('PNG 编码失败');
  return blob;
}
