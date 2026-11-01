/**
 * SVGL 品牌字标源（MIT，https://github.com/pheralb/svgl）。
 *
 * 为什么需要第二个源：simple-icons 只有**符号**（GitHub 猫头、Vercel 三角），
 * 拿不到「符号 + 品牌名」的完整字标。SVGL 的 670 条里有 153 条带 `wordmark`，
 * 正是官方那套组合标（如 OpenAI 的花形 + OpenAI 字样）。
 *
 * 两个源按**规范化品牌名**配对（simple-icons 的 slug ↔ SVGL 的 title），
 * 配对不上的品牌回退成「符号 + 程序排版品牌名」。
 *
 * 配色：SVGL 每条都分 light / dark 两套，单色标在深底上必须用 dark 版
 * （light 版是黑色 fill，黑底上直接消失）。因此变体按背景亮度自动选，
 * 而不是无条件染色——这样自带彩色的品牌（Google / Spotify）能保留原色。
 */

export interface LogoAsset {
  title: string;
  /** 符号（多数与 simple-icons 重复，仅作兜底） */
  symbol?: { light?: string; dark?: string };
  /** 官方完整字标 */
  wordmark?: { light?: string; dark?: string };
}

interface SvglEntry {
  title?: string;
  route?: { light?: string; dark?: string } | string;
  wordmark?: { light?: string; dark?: string } | string;
}

const SVGL_API = 'https://api.svgl.app/';

/** 规范化：小写 + 只留字母数字，用于 slug ↔ title 配对 */
export function normalizeBrand(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

let assets: Map<string, LogoAsset> | null = null;
let loadPromise: Promise<Map<string, LogoAsset>> | null = null;

function pick(v: { light?: string; dark?: string } | string | undefined): { light?: string; dark?: string } | undefined {
  if (!v) return undefined;
  return typeof v === 'string' ? { light: v } : v;
}

/** 加载并索引 SVGL 元数据（规范化 title → 资源），一次成功后永久缓存 */
export function loadSvglAssets(): Promise<Map<string, LogoAsset>> {
  if (assets) return Promise.resolve(assets);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const map = new Map<string, LogoAsset>();
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(SVGL_API, { signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) {
        const data: unknown = await res.json();
        if (Array.isArray(data)) {
          for (const raw of data as SvglEntry[]) {
            const title = raw?.title;
            if (typeof title !== 'string' || !title) continue;
            const key = normalizeBrand(title);
            if (!key) continue;
            map.set(key, {
              title,
              symbol: pick(raw.route),
              wordmark: pick(raw.wordmark),
            });
          }
        }
      }
    } catch {
      /* 拿不到就全部走程序排版，不阻塞 */
    }
    assets = map;
    return map;
  })();
  return loadPromise;
}

/** 同步查询（须先 await loadSvglAssets） */
export function getLogoAsset(brandKey: string): LogoAsset | undefined {
  return assets?.get(normalizeBrand(brandKey));
}

/**
 * 按背景亮度挑变体：深底用 dark（白字标），浅底用 light（黑字标）。
 * 缺失时回退到另一侧，再缺失返回 undefined。
 */
export function pickVariant(
  set: { light?: string; dark?: string } | undefined,
  darkBackground: boolean,
): string | undefined {
  if (!set) return undefined;
  return darkBackground ? (set.dark ?? set.light) : (set.light ?? set.dark);
}

/**
 * svgl.app 把资源放在自己的域名下（https://svgl.app/library/x.svg），但该域名
 * **不发 CORS 头**，浏览器 fetch 会被直接拦下——实测字标全拉不到，静默回退成
 * 「符号 + 文字」。改走 jsdelivr 直连仓库，那里有 `access-control-allow-origin: *`。
 * API 的 route 文件名与仓库 `static/library/` 下的文件名一致，可直接拼。
 */
const SVGL_STATIC_BASE = 'https://cdn.jsdelivr.net/gh/pheralb/svgl@main/static/library/';

function toFetchable(url: string): string {
  const m = url.match(/\/library\/([^/?#]+)/);
  return m ? SVGL_STATIC_BASE + m[1] : url;
}

/** 字标 SVG 内容缓存（URL → 文本） */
const svgCache = new Map<string, Promise<string>>();

export function fetchLogo(url: string): Promise<string> {
  const target = toFetchable(url);
  let task = svgCache.get(target);
  if (!task) {
    // 必须带超时：单个 CDN 请求挂起会让「整批预取」的 Promise.all 永远等下去，
    // 表现是导出/预览卡死而非报错。
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    task = fetch(target, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`logo 加载失败（HTTP ${r.status}）: ${target}`);
        return r.text();
      })
      .finally(() => clearTimeout(tid));
    // 失败不留缓存，否则「重试」永远拿到同一个 rejected promise
    task.catch(() => svgCache.delete(target));
    svgCache.set(target, task);
  }
  return task;
}

/**
 * 重试用：丢掉失败的取图缓存，并允许重新拉一次 SVGL 元数据。
 *
 * 元数据那次失败会被永久缓存成空 Map（`assets = map`），不重置的话
 * 网络恢复后字标也永远不会回来。
 */
export function resetLogoCache(): void {
  for (const [url, task] of [...svgCache]) {
    task.catch(() => svgCache.delete(url));
  }
  if (assets && assets.size === 0) {
    assets = null;
    loadPromise = null;
  }
}

/** 从 SVG 文本读 viewBox 宽高比（读不到返回 undefined，调用方回退到 1:1 估算） */export function svgAspect(svg: string): number | undefined {
  const m = svg.match(/viewBox=["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*["']/i);
  if (m) {
    const w = Number(m[3]);
    const h = Number(m[4]);
    if (w > 0 && h > 0) return w / h;
  }
  const wAttr = svg.match(/\bwidth=["']([\d.]+)["']/i);
  const hAttr = svg.match(/\bheight=["']([\d.]+)["']/i);
  if (wAttr && hAttr) {
    const w = Number(wAttr[1]);
    const h = Number(hAttr[1]);
    if (w > 0 && h > 0) return w / h;
  }
  return undefined;
}

/** 感知背景亮度（只认 #rgb / #rrggbb，其余按"深底"处理） */
export function isDarkColor(color: string): boolean {
  const hex = color.trim();
  const m = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  const h = m?.[1];
  if (!h) return true;
  let r: number;
  let g: number;
  let b: number;
  if (h.length === 3) {
    r = parseInt(h.charAt(0).repeat(2), 16);
    g = parseInt(h.charAt(1).repeat(2), 16);
    b = parseInt(h.charAt(2).repeat(2), 16);
  } else {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  }
  // 相对亮度（sRGB 近似，够用）
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}
