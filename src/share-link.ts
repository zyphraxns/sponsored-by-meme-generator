/**
 * 分享链接：State ↔ URL hash（纯前端，零后端，不上传数据）。
 * 只序列化 Selection 可恢复部分；上传图片（iconSvgs 里的 SVG 字符串 / 位图 dataURL）
 * 不含在链接里——打开链接时若状态指向上传内容则提示「需要原设备」。
 */
import type { DefaultStateOptions } from './app-state';
import type { PlatformId } from './core/presets';
import type { Locale, Ratio, SceneState } from './core/types';

/** 可携带的选择：DefaultStateOptions 再加上平台预设（它只影响导出，不参与渲染） */
export interface ShareableState extends DefaultStateOptions {
  platform?: PlatformId;
}

export interface ShareStateCompact {
  t?: string; // templateId
  v?: string; // variantId
  l?: Locale;
  r?: Ratio;
  p?: string; // platform
  i?: Array<{ icon: string; label?: string; phase?: number; speed?: number }>;
  tx?: Record<string, unknown>; // 文案覆盖：{版式层 id: {语言: 文本}}
  pal?: { bg?: string; fg?: string };
  rows?: number;
  s?: number; // speed
}

export function encodeShare(options: ShareableState): string {
  const c: ShareStateCompact = {};
  if (options.templateId) c.t = options.templateId;
  if (options.variantId) c.v = options.variantId;
  if (options.locale) c.l = options.locale;
  if (options.ratio) c.r = options.ratio;
  if (options.platform) c.p = options.platform;
  if (options.icons && options.icons.length > 0) {
    // 只保留可回复的图标引用（emoji / simple-icons / svgl:），放弃 upload 引用
    c.i = options.icons.map((it) => ({
      icon: it.icon,
      label: it.label,
      phase: it.phase,
      speed: it.speed,
    })).filter((it) =>
      !it.icon.startsWith('upload:')
    );
  }
  if (options.text && Object.keys(options.text).length > 0) {
    const tx: Record<string, string> = {};
    for (const [k, v] of Object.entries(options.text as Partial<Record<string, string>>)) {
      if (v) tx[k] = v;
    }
    if (Object.keys(tx).length > 0) c.tx = tx as Record<string, string>;
  }
  if (options.palette && (options.palette.bg || options.palette.fg)) {
    c.pal = {
      bg: options.palette.bg,
      fg: options.palette.fg,
    };
  }
  if (options.rows !== undefined) c.rows = options.rows;
  if (options.speed !== undefined) c.s = options.speed;
  return '#' + encodeURIComponent(JSON.stringify(c));
}

export function decodeShare(hash: string): Partial<ShareableState> | null {
  const raw = hash.replace(/^#/, '');
  if (!raw) return null;
  try {
    const c = JSON.parse(decodeURIComponent(raw)) as ShareStateCompact;
    const out: Partial<ShareableState> = {};
    if (c.t) out.templateId = c.t;
    if (c.v) out.variantId = c.v;
    if (c.l) out.locale = c.l;
    if (c.r) out.ratio = c.r;
    // 平台预设不参与渲染，但它决定导出参数与预估上限——带进链接/草稿，
    // 收链接的人看到的「预估 / 上限」才和分享者一致。
    if (c.p) out.platform = c.p as ShareableState['platform'];
    if (c.i) out.icons = c.i.map((it) => ({
      icon: it.icon,
      label: it.label,
      phase: it.phase,
      speed: it.speed,
    }));
    if (c.tx) {
      // 文案是**两层**结构：{版式层 id: {语言: 文本}}。
      //
      // 2026-11-01 修的 bug：这里原来只保留 `typeof v === 'string'` 的条目，
      // 而真实结构里 v 是 `{en, zh}` 对象 → 整段文案被过滤成 `{}`，
      // 分享链接永远丢失标题（用户改的那句话）。同时兼容更早的扁平链接
      // （{en: '…'}），把它归到 title 层——三份模板的文案层 id 都是 title。
      const text: SceneState['text'] = {};
      for (const [layerId, value] of Object.entries(c.tx as Record<string, unknown>)) {
        if (typeof value === 'string') {
          text.title = { ...(text.title ?? {}), [layerId]: value };
          continue;
        }
        if (!value || typeof value !== 'object') continue;
        const perLocale: Partial<Record<Locale, string>> = {};
        for (const [locale, s] of Object.entries(value as Record<string, unknown>)) {
          if (typeof s === 'string' && s !== '') perLocale[locale as Locale] = s;
        }
        if (Object.keys(perLocale).length > 0) text[layerId] = perLocale;
      }
      if (Object.keys(text).length > 0) out.text = text;
    }
    if (c.pal) out.palette = { bg: c.pal.bg, fg: c.pal.fg };
    if (c.rows !== undefined) out.rows = c.rows;
    if (c.s !== undefined) out.speed = c.s;
    return out;
  } catch {
    return null;
  }
}
