/**
 * 量 SVG 内容的实际墨迹包围盒。
 *
 * SVGL 的字标 viewBox 经常带大量留白（OpenAI 实测墨迹只占盒高 42%），
 * 只按 viewBox 等比缩放会让同一行里的品牌高矮差一倍。布局需要按「看得见
 * 的图案」归一，所以在浏览器里用 getBBox() 量一次，把结果注入 state；
 * scene() 仍是纯函数，不碰 DOM。
 *
 * Node / vitest 环境没有 DOM，返回 undefined，调用方回退到 viewBox。
 */
import type { SvgInkBox } from './types';

export function measureSvgInk(svg: string): SvgInkBox | undefined {
  if (typeof document === 'undefined') return undefined;
  const inner = svg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i)?.[1];
  if (!inner) return undefined;

  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.setAttribute('width', '1');
  host.setAttribute('height', '1');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'absolute';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.overflow = 'hidden';
  // 不设 viewBox：子元素的坐标就是原始 viewBox 坐标，量出来的盒子可直接用于
  // 裁切（renderWordmark 把 viewBox 设成这个盒子）。
  host.innerHTML = inner;
  document.body.appendChild(host);

  try {
    const b = host.getBBox();
    if (!(b.width > 0 && b.height > 0)) return undefined;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  } catch {
    return undefined;
  } finally {
    host.remove();
  }
}
