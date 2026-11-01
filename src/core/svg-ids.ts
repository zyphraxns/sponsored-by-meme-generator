/**
 * 内联 SVG 的两个必要处理：id 隔离与「能不能染色」的判断。
 *
 * 为什么需要 id 隔离：SVGL 的 logo 大量使用 `<clipPath>` / `<mask>` /
 * 渐变，它们靠 `url(#id)` 互相引用，而 id 是**文档全局**的。一个面板里
 * 同时内联 90 个 logo、一张卡片上同一个 logo 重复 6 次——只要两个文件用了
 * 同一个 id（Angular 直接用了 `a` / `b` / `c` / `d`，Adobe 全家共用
 * `clip0_2_*` 命名），后者的引用就会指向前者的定义，渲染结果是一块黑方块
 * 或者干脆没有。
 *
 * 为什么需要「能不能染色」：Adobe 那套应用图标本身就是「圆角方块 + 挖空
 * 字形」，Behance / Binance / Nano 同理——底色块 + 白色内层。无条件把
 * 所有 fill 改成前景色，白色内层一起变黑，logo 就成了一块实心色块。
 * 只有**真正的单色标**才适合染色（GitHub 的猫头、Vercel 的三角）。
 */

/** 把 SVG 内部的 id 与引用统一加前缀，避免同一文档里互相踩 */
export function scopeSvgIds(inner: string, prefix: string): string {
  if (!/\bid\s*=|url\(#|href\s*=\s*["']#/.test(inner)) return inner;
  const safe = prefix.replace(/[^a-zA-Z0-9_-]/g, '_') || 'svg';
  const map = new Map<string, string>();
  const rename = (id: string): string => {
    let next = map.get(id);
    if (next === undefined) {
      next = `${safe}__${id}`;
      map.set(id, next);
    }
    return next;
  };

  // 先收集全部 id（引用可能写在定义之前）
  for (const m of inner.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) {
    const id = m[1];
    if (id) rename(id);
  }
  if (map.size === 0) return inner;

  return inner
    .replace(/\bid\s*=\s*["']([^"']+)["']/g, (whole, id: string) => (map.has(id) ? `id="${rename(id)}"` : whole))
    .replace(/url\(\s*#([^)"']+)\s*\)/g, (whole, id: string) => (map.has(id) ? `url(#${rename(id)})` : whole))
    .replace(/\b(xlink:href|href)\s*=\s*["']#([^"']+)["']/g, (whole, attr: string, id: string) =>
      map.has(id) ? `${attr}="#${rename(id)}"` : whole,
    );
}

/** SVG 里出现过的填充色（统一小写；忽略 none / 透明 / 继承） */
export function svgFillColors(svg: string): Set<string> {
  const out = new Set<string>();
  // 同时覆盖 fill="…"（呈现属性）与 style="fill:#fff"（内联样式）
  const re = /fill\s*[=:]\s*["']?\s*([^"';>\s)]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    const value = (m[1] ?? '').trim().toLowerCase();
    if (!value || value === 'none' || value === 'transparent' || value === 'inherit' || value === 'currentcolor') {
      continue;
    }
    out.add(value);
  }
  return out;
}

/**
 * 这个 SVG 能不能安全地染成前景色？
 *
 * 只有单色标可以：没有 fill（走默认黑）、只有一种颜色。
 * 两种以上（底色 + 白色挖空）、带渐变/图案、带 mask 的，都必须原样渲染，
 * 否则内层细节会被一起填掉——这正是搜索面板里一片实心色块的成因。
 */
export function isMonochromeSvg(svg: string): boolean {
  if (/url\(\s*#\s*(paint|gradient|pattern)/i.test(svg)) return false;
  const colors = svgFillColors(svg);
  if (colors.size === 0) return true;
  if (colors.size === 1) {
    const only = [...colors][0] ?? '';
    // 单独一个白色/黑色仍然可染：染色本来就是为了适配背景
    return !only.startsWith('url(');
  }
  return false;
}
