/**
 * 分享链接：State ↔ URL hash（纯前端，零后端，不上传数据）。
 * 只序列化 Selection 可恢复部分；上传图片（iconSvgs 里的 SVG 字符串 / 位图 dataURL）
 * 不含在链接里——打开链接时若状态指向上传内容则提示「需要原设备」。
 */
import type { DefaultStateOptions } from './app-state';
import { PLATFORMS } from './core/presets';
import type { PlatformId } from './core/presets';
import type { Locale, Ratio, SceneState, TickerItem } from './core/types';
import { TEMPLATES } from './templates';

/** 可携带的选择：DefaultStateOptions 再加上平台预设（它只影响导出，不参与渲染）
 *  与 logo 着色方式（mono 是纯视觉开关，随链接/草稿一起恢复）。 */
export interface ShareableState extends DefaultStateOptions {
  platform?: PlatformId;
  /** 品牌色 / 单色；缺省 = brand */
  logoMode?: 'brand' | 'mono';
}

export interface ShareStateCompact {
  t?: string; // templateId
  v?: string; // variantId
  l?: Locale;
  r?: Ratio;
  p?: string; // platform
  i?: Array<{ icon: string; label?: string; phase?: number; speed?: number }>;
  tx?: Record<string, unknown>; // 文案覆盖：{版式层 id: {语言: 文本}}
  pal?: { bg?: string; fg?: string; accent?: string };
  rows?: number;
  s?: number; // speed
  sym?: boolean; // logoWithSymbol
  mono?: boolean; // logoMode = 'mono'（只在为 true 时写）
  tb?: boolean; // transparentBg（只在为 true 时写，GIF/MP4 会忽略）
}

/**
 * 外部输入（URL hash / localStorage）都从这里过一遍白名单。
 *
 * 这些字段会直接决定渲染和导出参数，不能只靠类型断言：手工改 hash 就能
 * 传进未知模板、非法比例或带引号的“颜色”。边界上验证完，scene() 继续
 * 保持纯函数，不再为坏输入做防御。
 */
const RATIOS: readonly Ratio[] = ['1:1', '4:5', '9:16', '16:9'];
const LOCALES: readonly Locale[] = ['en', 'zh'];
const PLATFORM_IDS = new Set<PlatformId>(PLATFORMS.map((p) => p.id));
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const ICON_KEY = /^(?:emoji|simple-icons|svgl|upload):/;
const UNSAFE_LAYER_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 只接受 #RGB / #RRGGBB，并统一成小写 6 位，避免下游按 3 位解析出错 */
function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = HEX_COLOR.exec(value.trim());
  if (!match) return undefined;
  const hex = match[1] as string;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return '#' + full.toLowerCase();
}

function normalizeRows(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(12, Math.max(1, Math.round(value)));
}

/** 速度量化到 0.05，保证 loopDuration 的有理数周期有限；上限对齐 UI 的 2× */
function normalizeSpeed(value: unknown, min = 0.5, max = 2): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value * 20) / 20));
}

/** 图标项白名单：分享链接与草稿共用（草稿额外允许 upload:） */
export function sanitizeTickerItems(value: unknown): TickerItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: TickerItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const icon = raw.icon;
    if (typeof icon !== 'string' || icon.length > 200 || !ICON_KEY.test(icon)) continue;
    const item: TickerItem = { icon };
    if (typeof raw.label === 'string' && raw.label.length <= 160) item.label = raw.label;
    if (typeof raw.phase === 'number' && Number.isFinite(raw.phase) && Math.abs(raw.phase) <= 100) {
      item.phase = raw.phase;
    }
    const speed = normalizeSpeed(raw.speed);
    if (speed !== undefined) item.speed = speed;
    items.push(item);
  }
  return items;
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
  if (options.palette && (options.palette.bg || options.palette.fg || options.palette.accent)) {
    // accent 统一写成 #RRGGBB：旧旁路格式用的是不带 # 的 6 位 hex，新格式不再制造歧义
    const accent = normalizeHexColor(options.palette.accent);
    c.pal = {
      bg: options.palette.bg,
      fg: options.palette.fg,
      ...(accent ? { accent } : {}),
    };
  }
  if (options.rows !== undefined) c.rows = options.rows;
  if (options.speed !== undefined) c.s = options.speed;
  // 只在开启时写：旧链接的默认值就是 false，不必占字节
  if (options.logoWithSymbol) c.sym = true;
  if (options.logoMode === 'mono') c.mono = true;
  // 同 sym：只在开启时写；旧链接默认 false
  if (options.transparentBg) c.tb = true;
  return '#' + encodeURIComponent(JSON.stringify(c));
}

/** 旧旁路 accent 是不带 # 的 6 位 hex；补 # 后仍走严格校验 */
function normalizeLegacyAccent(value: string | null): string | undefined {
  if (!value) return undefined;
  return normalizeHexColor(value.startsWith('#') ? value : '#' + value);
}

export function decodeShare(hash: string): Partial<ShareableState> | null {
  const raw = hash.replace(/^#/, '');
  if (!raw) return null;
  try {
    // 旧格式兼容：视觉线一度把 mono/accent 以 `&mono=1&accent=b45309` 拼在 JSON 后面。
    // encodeURIComponent 会转义 JSON 里的 &，所以裸 & 只可能来自那段旁路；
    // 在这里统一收口，initState 不再自己切字符串。
    const amp = raw.indexOf('&');
    const payload = amp >= 0 ? raw.slice(0, amp) : raw;
    const legacy = amp >= 0 ? new URLSearchParams(raw.slice(amp + 1)) : null;
    const parsed: unknown = JSON.parse(decodeURIComponent(payload));
    if (!isRecord(parsed)) return null;
    const c = parsed as ShareStateCompact;
    const out: Partial<ShareableState> = {};

    // 模板 / 变体：都必须能在当前构建里找到；变体只在模板有效时保留
    if (typeof c.t === 'string') {
      const template = TEMPLATES.find((t) => t.id === c.t);
      if (template) {
        out.templateId = template.id;
        if (typeof c.v === 'string' && template.variants?.some((v) => v.id === c.v)) {
          out.variantId = c.v;
        }
      }
    }
    if (c.l === 'en' || c.l === 'zh') out.locale = c.l;
    if (typeof c.r === 'string' && RATIOS.includes(c.r as Ratio)) out.ratio = c.r as Ratio;
    // 平台预设不参与渲染，但它决定导出参数与预估上限——带进链接/草稿，
    // 收链接的人看到的「预估 / 上限」才和分享者一致。
    if (typeof c.p === 'string' && PLATFORM_IDS.has(c.p as PlatformId)) {
      out.platform = c.p as PlatformId;
    }

    const icons = sanitizeTickerItems(c.i);
    if (icons) {
      // 上传图片不在链接里；旧草稿/恶意链接里的 upload: 项在分享态直接丢弃
      const shareableIcons = icons.filter((it) => !it.icon.startsWith('upload:'));
      if (shareableIcons.length > 0) out.icons = shareableIcons;
    }

    if (isRecord(c.tx)) {
      // 文案是**两层**结构：{版式层 id: {语言: 文本}}。
      //
      // 2026-11-01 修的 bug：这里原来只保留 `typeof v === 'string'` 的条目，
      // 而真实结构里 v 是 `{en, zh}` 对象 → 整段文案被过滤成 `{}`，
      // 分享链接永远丢失标题（用户改的那句话）。同时兼容更早的扁平链接
      // （{en: '…'}），把它归到 title 层——三份模板的文案层 id 都是 title。
      const text: SceneState['text'] = {};
      for (const [layerId, value] of Object.entries(c.tx)) {
        if (layerId.length > 64 || UNSAFE_LAYER_IDS.has(layerId)) continue;
        if (typeof value === 'string') {
          if (LOCALES.includes(layerId as Locale)) {
            text.title = { ...(text.title ?? {}), [layerId as Locale]: value };
          }
          continue;
        }
        if (!isRecord(value)) continue;
        const perLocale: Partial<Record<Locale, string>> = {};
        for (const locale of LOCALES) {
          const s = value[locale];
          if (typeof s === 'string' && s !== '') perLocale[locale] = s;
        }
        if (Object.keys(perLocale).length > 0) text[layerId] = perLocale;
      }
      if (Object.keys(text).length > 0) out.text = text;
    }

    // 颜色只接受 #RGB/#RRGGBB；非法值直接丢弃，让模板默认色接管
    if (isRecord(c.pal)) {
      const bg = normalizeHexColor(c.pal.bg);
      const fg = normalizeHexColor(c.pal.fg);
      const accent = normalizeHexColor(c.pal.accent);
      if (bg || fg || accent) {
        out.palette = {
          ...(bg ? { bg } : {}),
          ...(fg ? { fg } : {}),
          ...(accent ? { accent } : {}),
        };
      }
    }

    const rows = normalizeRows(c.rows);
    if (rows !== undefined) out.rows = rows;
    const speed = normalizeSpeed(c.s, 0.5, 2);
    if (speed !== undefined) out.speed = speed;
    if (c.sym === true) out.logoWithSymbol = true;
    // mono 只认布尔 true；字符串 / 数字等一律丢弃（false = 默认 brand）
    if (c.mono === true) out.logoMode = 'mono';
    // 透明背景同样只认布尔 true；缺省 = 不透明
    if (c.tb === true) out.transparentBg = true;

    if (legacy) {
      // 旧旁路的 mono 只认 '1'；accent 走与 JSON 相同的严格校验
      if (legacy.get('mono') === '1') out.logoMode = 'mono';
      const accent = normalizeLegacyAccent(legacy.get('accent'));
      if (accent) out.palette = { ...(out.palette ?? {}), accent };
    }
    return out;
  } catch {
    return null;
  }
}
