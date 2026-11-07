/**
 * 本地草稿：刷新 / 误关标签页后还能找回上一次的编辑。
 *
 * 2026-11-03 起，上传的 logo 也随草稿保存：只存 `upload:` 内容（CDN 拉来的
 * 品牌 SVG 不存），总大小超过 localStorage 的实用上限时**明确告诉调用方**，
 * 不再静默丢失。
 */
import { decodeShare, encodeShare } from './share-link';
import type { ShareableState } from './share-link';
import type { Ratio, SvgInkBox, TickerItem } from './core/types';

const KEY = 'sponsored-by:draft:v1';

/**
 * 9:16 是第二批新增比例，SHARE 编码（由另一条线维护）还没收录它。
 * 草稿因此单独存一份比例，避免刷新后 9:16 被静默打回 1:1。
 */
const RATIO_VALUES: readonly Ratio[] = ['1:1', '4:5', '9:16', '16:9'];

function normalizeRatio(value: unknown): Ratio | undefined {
  return typeof value === 'string' && (RATIO_VALUES as readonly string[]).includes(value)
    ? (value as Ratio)
    : undefined;
}

/**
 * 上传内容的存储上限。localStorage 通常 5MB（UTF-16 字符串按字符计），
 * 留出选择编码与其它键的空间；超过就只保存能带走的，并让 UI 提示。
 */
const MAX_UPLOAD_CHARS = 3 * 1024 * 1024;

/** 分享编码不带的 UI 状态，草稿需要额外保存 */
type DraftSelection = ShareableState & { logoMode?: 'brand' | 'mono' };

const HEX_ACCENT = /^#([0-9a-f]{6})$/i;

function normalizeAccent(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = HEX_ACCENT.exec(value);
  return match ? `#${match[1]!.toLowerCase()}` : undefined;
}

interface DraftPayload {
  v: 1;
  /** 分享编码（不含上传项，沿用既有格式） */
  s: string;
  /** 完整选择，含 `upload:` 项；分享编码会过滤它们，草稿必须保留 */
  i?: TickerItem[];
  /** 上传内容，key = `upload:文件名` */
  u?: Record<string, string>;
  /** 上传图的宽高比（位图 / SVG 都需要；丢了会让宽字标缩成正方形） */
  a?: Record<string, number>;
  /** 上传 SVG 的墨迹盒（按真实图案高度归一） */
  k?: Record<string, SvgInkBox>;
  /** 单色 logo（'brand' 是默认值，不写） */
  m?: 'mono';
  /** accent 色（分享编码只带 bg / fg） */
  ac?: string;
  /** 比例（分享编码还没收录 9:16，草稿单独存一份） */
  r?: string;
}

export interface LoadedDraft {
  state: Partial<ShareableState>;
  /** 含 upload: 的完整选择 */
  icons?: TickerItem[];
  /** 只含上传内容 */
  uploads?: Record<string, string>;
  aspects?: Record<string, number>;
  ink?: Record<string, SvgInkBox>;
  /** 单色 logo（旧草稿没有该字段 = brand） */
  logoMode?: 'brand' | 'mono';
  /** accent 色（旧草稿没有该字段时跟随模板默认） */
  accent?: string;
  /** 比例（旧草稿没有该字段时沿用分享编码里的值） */
  ratio?: Ratio;
}

export interface SaveResult {
  /** false = 有上传图太大 / 写不进去，刷新后不会恢复 */
  uploadsSaved: boolean;
}

export function saveDraft(
  selection: DraftSelection,
  assets?: Record<string, string>,
  aspects?: Record<string, number>,
  ink?: Record<string, SvgInkBox>,
): SaveResult {
  const selected = new Set((selection.icons ?? []).map((i) => i.icon));
  const uploads: Record<string, string> = {};
  let chars = 0;
  let uploadsSaved = true;

  for (const [key, value] of Object.entries(assets ?? {})) {
    // 只存当前选择里、且是用户上传的内容；CDN 品牌图不重复存
    if (!key.startsWith('upload:') || !selected.has(key)) continue;
    if (chars + value.length > MAX_UPLOAD_CHARS) {
      uploadsSaved = false;
      continue;
    }
    uploads[key] = value;
    chars += value.length;
  }

  // 带不走的上传项从草稿选择里剔除，避免刷新后出现点不亮的空格子
  const icons = uploadsSaved
    ? selection.icons
    : (selection.icons ?? []).filter((i) => !i.icon.startsWith('upload:') || uploads[i.icon] !== undefined);
  const state: ShareableState = { ...selection, icons };
  // 只存实际保留下来的上传图的尺寸信息，CDN 品牌图不重复存
  const savedAspect: Record<string, number> = {};
  const savedInk: Record<string, SvgInkBox> = {};
  for (const key of Object.keys(uploads)) {
    if (aspects?.[key] !== undefined) savedAspect[key] = aspects[key];
    if (ink?.[key]) savedInk[key] = ink[key];
  }
  const accent = normalizeAccent(selection.palette?.accent);
  const payload: DraftPayload = {
    v: 1,
    s: encodeShare(state),
    i: icons,
    u: uploads,
    ...(Object.keys(savedAspect).length > 0 ? { a: savedAspect } : {}),
    ...(Object.keys(savedInk).length > 0 ? { k: savedInk } : {}),
    ...(selection.logoMode === 'mono' ? { m: 'mono' as const } : {}),
    ...(accent ? { ac: accent } : {}),
    r: selection.ratio,
  };

  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
    return { uploadsSaved };
  } catch {
    // 配额满 / 隐私模式：草稿是加分项，不能拖垮主流程
    return { uploadsSaved: false };
  }
}

export function loadDraft(): LoadedDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    if (raw.startsWith('{')) {
      const p = JSON.parse(raw) as Partial<DraftPayload>;
      if (typeof p.s !== 'string') return null;
      const state = decodeShare(p.s);
      if (!state) return null;
      const accent = normalizeAccent(p.ac);
      const ratio = normalizeRatio(p.r);
      return {
        state,
        icons: p.i,
        uploads: p.u,
        aspects: p.a,
        ink: p.k,
        ...(p.m === 'mono' ? { logoMode: 'mono' as const } : {}),
        ...(accent ? { accent } : {}),
        ...(ratio ? { ratio } : {}),
      };
    }
    // 2026-11-03 之前的旧草稿：直接是分享编码字符串
    const legacy = decodeShare(raw);
    return legacy ? { state: legacy } : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
