/**
 * simple-icons 图标源（SPEC §4.1 / §10.2）。
 *
 * 运行时从 CDN 拉取，仓库零字节——正好落在法务建议的「第三方行为」安全线内。
 * 单色单路径 SVG，与低色约束（GIF 256 色）天作之合。
 *
 * ── 索引来源（2026-10-26 重写，原来的两个来源全部失效）──
 *
 * ① slug 列表：unpkg 的 `icons/?meta`
 *    旧方案读 `data/simple-icons.json` 里的 `{ icons: { slug: … } }`，
 *    但该文件现在是**数组** `[{ title, hex, source }]`，`data.icons` 恒为
 *    undefined → 解析出空 Map → 索引为空，而且 `res.ok` 为真所以不会回退，
 *    表现为「面板里只有 emoji，一个品牌都没有」。
 *    旧的回退源 `data.jsdelivr.com/.../@latest` 也对 `@latest` 直接 404。
 *
 * ② 展示名：jsdelivr 的 `data/simple-icons.json`（数组），用
 *    「规范化 title → title」建映射，再用规范化 slug 去查。
 *    命中率很高（GitHub / OpenAI / McDonald's），少数特例（`.NET` → slug
 *    是 `dotnet` 而非 `net`）查不到，回退成 slug 首字母大写。
 *
 * ③ 兜底：CDN 全挂时用内置的 POPULAR 列表，保证面板永不空白。
 */
import { aliasedBrandIds } from './brand-aliases';

/** emoji 快捷面板 */export const EMOJI_PRESETS = [
  '💸', '🚀', '🫡', '💎', '🍕', '🎮', '🍔', '☕',
  '🎁', '🎉', '🔥', '⚡', '🏆', '👑', '🎯', '📦',
  '🏠', '🚗', '✈️', '🚢', '💻', '📱', '🎵', '🎬',
  '🎨', '🍺', '🌈', '⭐', '💪', '🦄', '🛸',
];

/**
 * 内置兜底 + 「空搜索时展示的热门品牌」。
 *
 * 一举两得：索引能加载时它决定面板首屏显示什么（而不是按字母序挤满
 * `1001tracklists` 这类冷门 slug）；索引加载失败时它就是全部内容。
 */
const POPULAR: ReadonlyArray<readonly [string, string]> = [
  ['github', 'GitHub'], ['google', 'Google'], ['apple', 'Apple'],
  ['anthropic', 'Anthropic'], ['shopify', 'Shopify'], ['netflix', 'Netflix'],
  ['spotify', 'Spotify'], ['tesla', 'Tesla'], ['nvidia', 'NVIDIA'],
  ['cursor', 'Cursor'], ['vercel', 'Vercel'], ['stripe', 'Stripe'],
  ['figma', 'Figma'], ['telegram', 'Telegram'], ['discord', 'Discord'],
  ['reddit', 'Reddit'], ['youtube', 'YouTube'], ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'], ['x', 'X'], ['pinterest', 'Pinterest'],
  ['twitch', 'Twitch'], ['docker', 'Docker'], ['kubernetes', 'Kubernetes'],
  ['react', 'React'], ['vuedotjs', 'Vue.js'], ['svelte', 'Svelte'],
  ['nextdotjs', 'Next.js'], ['tailwindcss', 'Tailwind CSS'], ['typescript', 'TypeScript'],
  ['javascript', 'JavaScript'], ['python', 'Python'], ['rust', 'Rust'],
  ['go', 'Go'], ['nodedotjs', 'Node.js'], ['npm', 'npm'],
  ['git', 'Git'], ['linux', 'Linux'], ['ubuntu', 'Ubuntu'],
  ['nike', 'Nike'], ['adidas', 'Adidas'], ['mcdonalds', "McDonald's"],
  ['cocacola', 'Coca-Cola'], ['starbucks', 'Starbucks'], ['sega', 'Sega'],
  ['playstation', 'PlayStation'], ['steam', 'Steam'], ['epicgames', 'Epic Games'],
  ['unity', 'Unity'], ['godotengine', 'Godot Engine'], ['blender', 'Blender'],
  ['notion', 'Notion'], ['zoom', 'Zoom'], ['paypal', 'PayPal'],
  ['visa', 'Visa'], ['mastercard', 'Mastercard'], ['bitcoin', 'Bitcoin'],
  ['ethereum', 'Ethereum'], ['uber', 'Uber'], ['airbnb', 'Airbnb'],
];

/** unpkg 的目录 meta：支持 @latest，返回 { files: [{ path: '/icons/x.svg' }] } */
const SLUG_LIST_URL = 'https://unpkg.com/simple-icons@latest/icons/?meta';
/** 元数据（数组）：只为拿展示名 */
const ICON_META_URL = 'https://unpkg.com/simple-icons@latest/data/simple-icons.json';
/**
 * 取图也走 unpkg —— 与列表同源。
 *
 * 踩过的坑：jsdelivr 的 `@latest` 报的版本号同为 16.36.0，但它按文件 URL 缓存，
 * 仍能取到 simple-icons **已经下架**的图标（openai / microsoft / amazon /
 * slack / linkedin / nintendo —— 商标方要求移除的）。列表用新的、取图用旧的，
 * 会拿到一批官方已删除的品牌，属于法务风险，不只是 404。同源最安全。
 */
const ICON_SVG_URL = (slug: string) => `https://unpkg.com/simple-icons@latest/icons/${slug}.svg`;

interface UnpkgMeta {
  files?: { path?: string }[];
}

let indexCache: string[] | null = null;
let indexPromise: Promise<string[]> | null = null;
/** 索引是否真的来自 CDN（false = 退回了内置 POPULAR 兜底，面板要提示"加载失败"） */
let indexFromCdn = true;
let titleMap: Map<string, string> | null = null;
let metaPromise: Promise<Map<string, string>> | null = null;

/** 规范化：小写 + 只留字母数字，用于 title↔slug 配对 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** slug → 兜底展示名（首字母大写） */
function prettify(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

async function loadSlugs(): Promise<string[]> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(SLUG_LIST_URL, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return [];
    const data = (await res.json()) as UnpkgMeta;
    return (data.files ?? [])
      .map((f) => f.path ?? '')
      .filter((p) => p.startsWith('/icons/') && p.endsWith('.svg'))
      .map((p) => p.slice('/icons/'.length, -'.svg'.length));
  } catch {
    return [];
  }
}

async function loadTitles(): Promise<Map<string, string>> {
  if (titleMap) return titleMap;
  if (metaPromise) return metaPromise;
  metaPromise = (async () => {
    const m = new Map<string, string>();
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(ICON_META_URL, { signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) {
        const data: unknown = await res.json();
        // 数组是当前格式；对象格式（旧版 { icons: {...} }）顺手兼容，避免 CDN 回滚时又瞎
        const items: { title?: string }[] = Array.isArray(data)
          ? (data as { title?: string }[])
          : Object.values((data as { icons?: Record<string, { title?: string }> }).icons ?? {});
        for (const item of items) {
          const title = item?.title;
          if (typeof title === 'string' && title) m.set(normalize(title), title);
        }
      }
    } catch {
      /* 拿不到展示名就用 slug，不阻塞 */
    }
    titleMap = m;
    return m;
  })();
  return metaPromise;
}

async function loadIndex(): Promise<string[]> {
  if (indexCache) return indexCache;
  if (indexPromise) return indexPromise;

  indexPromise = (async () => {
    const [slugs, titles] = await Promise.all([loadSlugs(), loadTitles()]);
    if (slugs.length > 0) {
      // 热门品牌的展示名以 titleMap 为准；这里只决定顺序
      indexCache = slugs;
      titleMap = titles;
      indexFromCdn = true;
      return indexCache;
    }
    // CDN 全挂：退回内置列表，功能不空白
    indexCache = POPULAR.map(([slug]) => slug);
    indexFromCdn = false;
    return indexCache;
  })();

  return indexPromise;
}

/**
 * 搜索图标（按 slug / 展示名），返回 slug 列表（上限 60）。
 *
 * 空查询返回**热门品牌**而不是字母序前 60——打开面板时满屏 `1001tracklists`
 * 之类的冷门 slug 对用户没有意义。
 */
export async function searchIcons(query: string): Promise<string[]> {
  const index = await loadIndex();
  const q = query.trim().toLowerCase();
  if (!q) {
    const known = POPULAR.map(([slug]) => slug).filter((s) => index.includes(s));
    // 索引是兜底列表时 known 就是全部；否则补足到 60
    return known.length >= 24 ? known : index.slice(0, 60);
  }
  const nq = normalize(q);
  return index
    .filter((s) => {
      if (s.toLowerCase().includes(q)) return true;
      const name = getIconName(s);
      return name.toLowerCase().includes(q) || normalize(name).includes(nq);
    })
    .slice(0, 60);
}

/** 获取图标 SVG 内容（带缓存） */
const svgCache = new Map<string, Promise<string>>();

export function getIconSvg(slug: string): Promise<string> {
  let task = svgCache.get(slug);
  if (!task) {
    task = fetch(ICON_SVG_URL(slug)).then((r) => {
      if (!r.ok) throw new Error(`图标 ${slug} 加载失败（HTTP ${r.status}）`);
      return r.text();
    });
    // 失败的不留在缓存里：否则「重试」会一直拿到同一个 rejected promise
    task.catch(() => svgCache.delete(slug));
    svgCache.set(slug, task);
  }
  return task;
}

/**
 * 清掉取图失败留下的缓存（重试按钮用）。
 * 只清失败的：成功的图没必要重新下载，CDN 也不会凭空变好。
 */
export function forgetFailedIcons(): void {
  for (const [slug, task] of [...svgCache]) {
    task.catch(() => svgCache.delete(slug));
  }
}

export function getIconName(slug: string): string {
  return titleMap?.get(normalize(slug)) ?? POPULAR.find(([s]) => s === slug)?.[1] ?? prettify(slug);
}

export function isEmoji(icon: string): boolean {
  return icon.startsWith('emoji:');
}

export function isSimpleIcons(icon: string): boolean {
  return icon.startsWith('simple-icons:');
}

/** SVGL 独有品牌（simple-icons 里没有的，如 OpenAI）——符号与字标都来自 SVGL */
export function isSvglIcon(icon: string): boolean {
  return icon.startsWith('svgl:');
}

export function isUpload(icon: string): boolean {
  return icon.startsWith('upload:');
}

/** 搜索结果单元：key 直接用作 TickerItem.icon */
export interface BrandHit {
  key: string;
  label: string;
}

/**
 * 合并两个来源的品牌搜索。
 *
 * 只用 simple-icons 做索引会漏掉 SVGL 独有的品牌（OpenAI 被商标方要求从
 * simple-icons 下架，但 SVGL 一直有它的官方符号和字标）。所以：
 * - simple-icons 全集 → `simple-icons:<slug>`
 * - SVGL 里 normalize 后不在 simple-icons 集合的 → `svgl:<品牌名规范化>`
 *   （这类品牌没有 simple-icons 符号，符号与字标都从 SVGL 取）
 */
export async function searchBrands(query: string): Promise<BrandHit[]> {
  const { loadSvglAssets } = await import('./logos');
  const [index, svgl] = await Promise.all([loadIndex(), loadSvglAssets()]);
  const slugSet = new Set(index);

  const pool: BrandHit[] = index.map((s) => ({ key: `simple-icons:${s}`, label: getIconName(s) }));
  for (const [nk, asset] of svgl) {
    if (!slugSet.has(nk)) pool.push({ key: `svgl:${nk}`, label: asset.title });
  }

  const q = query.trim().toLowerCase();
  if (!q) {
    // 空搜索显示热门品牌（而不是字母序排头的冷门 slug）
    const popular = new Set(POPULAR.map(([slug]) => `simple-icons:${slug}`));
    const known = pool.filter((h) => popular.has(h.key));
    return known.length >= 24 ? known : pool.slice(0, 60);
  }

  // 中文别名优先：品牌名是英文的，中文用户输「苹果」必须能命中 Apple
  const aliasIds = aliasedBrandIds(q);
  if (aliasIds.length > 0) {
    const hits = pool.filter((h) => aliasIds.includes(h.key.split(':')[1] ?? ''));
    if (hits.length > 0) return hits.slice(0, 60);
  }

  const nq = q.replace(/[^a-z0-9]/g, '');
  return pool
    .filter((h) => {
      const id = h.key.split(':')[1] ?? '';
      if (id.includes(q) || h.label.toLowerCase().includes(q)) return true;
      // nq 必须非空：中文等非拉丁搜索词规范化后是空串，而
      // "任意字符串".includes("") 恒为 true —— 不判空会把全部品牌当成命中，
      // 表现为「搜中文出来一堆不相关的品牌」。
      if (!nq) return false;
      return h.label.toLowerCase().replace(/[^a-z0-9]/g, '').includes(nq);
    })
    .slice(0, 60);
}

/** 索引是否退回了内置兜底（CDN 不可用）——面板据此显示"加载失败"而不是假装正常 */
export function iconIndexIsFallback(): boolean {
  return !indexFromCdn;
}
