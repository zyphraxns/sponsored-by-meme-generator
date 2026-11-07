import type { SceneState, SvgInkBox, Template, TextLayer, TickerLayer, TickerItem } from './types';
import { estimateTextWidth, fitTextLayout, LINE_HEIGHT_RATIO } from './layout';
import { loopDuration, tickerPositions } from './ticker';
import type { TickerSlot } from './ticker';
import { isEmoji, isSimpleIcons, isSvglIcon, isUpload } from './simple-icons';
import { isMonochromeSvg, scopeSvgIds } from './svg-ids';
import { measureSvgInk } from './svg-ink';

/**
 * 预览期字体栈（system font stack 秒开，不等字体加载；导出字体策略见 SPEC 3.2）。
 *
 * 顺序即优先级，M4 踩过的坑：系统 CJK 字体（PingFang SC / Microsoft YaHei）
 * 若排在 "Noto Sans SC" 之前，导出时内嵌切片永远轮不到——同一台机器看不出问题，
 * 换台电脑字形就漂移。因此 Noto 必须紧跟 Inter，系统 CJK 只作末位回退。
 */
const DISPLAY_FONT = '"Inter", "Noto Sans SC", "PingFang SC", "Helvetica Neue", Arial, sans-serif';
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** loopSeconds: 'auto' 时的基准周期（秒）。M3 起由各行速度反推全局 LCM 周期。 */
const BASE_LOOP_SECONDS = 4;

/** ticker 图标默认缩放（相对行高）；可被模板 iconScale 覆盖 */
export const DEFAULT_ICON_SCALE = 0.62;

/**
 * 品牌 logo 的**视觉高度**（实际墨迹）相对 logoH 的比例。
 *
 * 原实现直接拿 logoH 当高度：官方字标填满 116，文字兜底只有 0.62×116，
 * OpenAI 的 viewBox 留白又让墨迹只剩 42% —— 同一行高矮差 2.38 倍。
 * 现在官方字标、符号、文字兜底都归一到这个视觉高度；0.78 让 ticker 略低于
 * 大标题的 cap height（114.59 × 0.727 ≈ 83），保住标题的主次。
 */
const LOGO_OPTICAL_RATIO = 0.78;
/** Inter 的 cap height / font-size；文字兜底按它换算字号 */
const CAP_RATIO = 0.727;
/** 文字兜底字号相对 logoH 的比例（视觉高度 ÷ cap 比例） */
const LABEL_FONT_SCALE = LOGO_OPTICAL_RATIO / CAP_RATIO;
/** 符号与品牌名之间的间距（相对视觉高度） */
const LABEL_GAP = 0.28;

/** 一个 logo 的视觉高度（实际墨迹要占多高） */
function opticalHeight(logoH: number): number {
  return logoH * LOGO_OPTICAL_RATIO;
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);
}

/** 数值属性统一保留 2 位小数：输出干净且确定性（纯函数要求） */
function f(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}

function hexRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const raw = match[1] as string;
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function channelLuminance(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(a: string, b: string): number {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  if (!ca || !cb) return 0;
  const la = 0.2126 * channelLuminance(ca[0]) + 0.7152 * channelLuminance(ca[1]) + 0.0722 * channelLuminance(ca[2]);
  const lb = 0.2126 * channelLuminance(cb[0]) + 0.7152 * channelLuminance(cb[1]) + 0.0722 * channelLuminance(cb[2]);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * accent 是画在背景上的装饰线，不是正文：只要和背景的对比度 ≥ 3:1 就可见。
 * 用户在取色器里选到接近背景的 accent 时退回前景色，避免「选了但看不见」。
 */
function visibleAccent(accent: string, bg: string, fg: string): string {
  return contrastRatio(accent, bg) >= 3 ? accent : fg;
}

export function canvasSize(template: Template, ratio: SceneState['ratio']): { w: number; h: number } {
  const w = template.canvas.basePx;
  const [rw, rh] = ratio.split(':').map(Number);
  if (!rw || !rh) throw new Error(`invalid ratio: ${ratio}`);
  // 16:9 → 607.5 取整为 608（0.5px 误差）；M1 像素导出时按偶数对齐处理
  return { w, h: Math.round((w * rh) / rw) };
}

/**
 * 场景内文本图层的实际文案（含用户覆盖）。
 * 导出层用它决定中文字体切片：只内嵌这段文本命中的切片。
 */
export function sceneTexts(state: SceneState): string[] {
  return state.template.layers
    .filter((l): l is TextLayer => l.type === 'text')
    .map((l) => state.text[l.id]?.[state.locale] ?? l.default[state.locale]);
}

/**
 * 场景内实际会渲染的非 emoji 图标 key（去重）。
 *
 * scene() 用 state.icons（空则回退模板 layer.items），
 * 这里镜像同一份取值逻辑——否则导出层预取的图标覆盖不到真正被渲染的那些。
 */
export function collectIconKeys(state: SceneState): string[] {
  const keys = new Set<string>();
  for (const layer of state.template.layers) {
    if (layer.type !== 'ticker') continue;
    const items: TickerItem[] = state.icons.length > 0 ? state.icons : layer.items;
    for (const item of items) {
      if (!isEmoji(item.icon)) keys.add(item.icon);
    }
  }
  return [...keys];
}

/**
 * 预取场景内 simple-icons 图标 SVG（导出链路用，与 fonts.ts 的切片预取同款模式）。
 *
 * 只处理 simple-icons: 前缀（走 CDN）；upload: 图标由用户直接提供内容，
 * 调用方自行写入 iconSvgs。返回空对象表示场景无 SVG 图标。
 */
export async function sceneIconSvgs(state: SceneState): Promise<Record<string, string>> {
  // 先带上 state 里已有的内容（用户上传的 SVG / dataURL 必须原样进导出，
  // 否则 enriched state 会把它们覆盖丢失）；再为缺失的键补预取。
  const out: Record<string, string> = { ...(state.iconSvgs ?? {}) };
  const keys = collectIconKeys(state);
  if (keys.length === 0) return out;
  const { getIconSvg } = await import('./simple-icons');
  const { isDarkColor, loadSvglAssets, getLogoAsset, pickVariant, fetchLogo } = await import('./logos');
  const darkBg = isDarkColor(state.palette?.bg ?? state.template.palette.bg);
  await loadSvglAssets();
  await Promise.all(
    keys.map(async (k) => {
      if (out[k] !== undefined) return; // upload 内容 / 上一轮预取，原样保留
      try {
        if (isSimpleIcons(k)) {
          out[k] = await getIconSvg(k.slice('simple-icons:'.length));
        } else if (isSvglIcon(k)) {
          // SVGL 独有品牌：key 本身就是规范化品牌名，直接查符号（按背景选明暗）
          const asset = getLogoAsset(k.slice('svgl:'.length));
          const url = pickVariant(asset?.symbol, darkBg);
          if (url) out[k] = await fetchLogo(url);
        }
      } catch {
        /* 单个图标失败不拖垮整批；scene() 对缺内容的图标静默跳过 */
      }
    }),
  );
  return out;
}

/**
 * 预取官方字标 SVG（导出 / 预览共用）。
 *
 * 与 sceneIconSvgs 同一套「先取好、再注入 state」的模式，保证 scene() 仍是纯函数。
 * 变体按背景亮度选（深底→dark 版白字标），否则黑底上黑色字标直接看不见。
 * 取不到的品牌由调用方回退成「符号 + 程序排版品牌名」，不会空白。
 */
export async function sceneLogoSvgs(
  state: SceneState,
  bg: string,
): Promise<{
  svgs: Record<string, string>;
  aspect: Record<string, number>;
  ink: Record<string, SvgInkBox>;
}> {
  const items = collectLogoItems(state);
  const svgs: Record<string, string> = {};
  const aspect: Record<string, number> = {};
  const ink: Record<string, SvgInkBox> = {};
  if (items.length === 0) return { svgs, aspect, ink };

  const { loadSvglAssets, getLogoAsset, pickVariant, fetchLogo, svgAspect, isDarkColor } = await import('./logos');
  await loadSvglAssets();
  const darkBg = isDarkColor(bg);

  await Promise.all(
    items.map(async ({ key, label }) => {
      const asset = getLogoAsset(label);
      const url = pickVariant(asset?.wordmark, darkBg);
      if (!url) return;
      try {
        const text = await fetchLogo(url);
        svgs[key] = text;
        const a = svgAspect(text);
        if (a) aspect[key] = a;
        // 墨迹包围盒：裁掉 viewBox 留白，并给布局一个真实的宽高比
        const box = measureSvgInk(text);
        if (box) ink[key] = box;
      } catch {
        /* 单个失败 → 回退符号+文字 */
      }
    }),
  );
  return { svgs, aspect, ink };
}

/** 场景内所有「非 emoji 且有品牌名」的单元（去重，key = icon 字符串） */
function collectLogoItems(state: SceneState): { key: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const layer of state.template.layers) {
    if (layer.type !== 'ticker') continue;
    const items: TickerItem[] = state.icons.length > 0 ? state.icons : layer.items;
    for (const item of items) {
      if (isEmoji(item.icon)) continue;
      if (!item.label) continue;
      if (!seen.has(item.icon)) seen.set(item.icon, item.label);
    }
  }
  return [...seen].map(([key, label]) => ({ key, label }));
}

/**
 * 全局无缝循环周期（秒）。
 * 'auto' 时由各行周期取 LCM；当前各行同速（速度倍率统一），
 * 故等于基准周期除以速度倍率。M3 启用 speedJitter 后各行周期分化，
 * LCM 自动拉长到公共周期——这就是「duration 由 speed 反推」的落点。
 */
export function loopSecondsFor(state: SceneState): number {
  const rowCount = Math.max(
    1,
    ...state.template.layers
      .filter((l): l is TickerLayer => l.type === 'ticker')
      .map((l) => state.rows || l.rows),
  );
  const speed = state.speed || 1;
  return state.template.animation.loopSeconds === 'auto'
    ? loopDuration(Array.from({ length: rowCount }, () => BASE_LOOP_SECONDS / Math.abs(speed)))
    : state.template.animation.loopSeconds;
}

/**
 * scene(state, t) → SVG 字符串：全项目唯一渲染真源。
 * 静态导出 = t 取常数；动画 = t 从 0 推进到 loop。
 */
export function scene(state: SceneState, t: number): string {
  const { template } = state;
  const { w, h } = canvasSize(template, state.ratio);
  const bg = state.palette?.bg ?? template.palette.bg;
  const fg = state.palette?.fg ?? template.palette.fg;
  // 模板 / 主题里的 accent 真正参与渲染：作为标题下方的一条强调线。
  const accent = visibleAccent(state.palette?.accent ?? template.palette.accent, bg, fg);
  const loop = loopSecondsFor(state);

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} ${f(h)}" width="${f(w)}" height="${f(h)}" role="img" aria-label="${escapeXml(template.name[state.locale])}">`,
    `<title>${escapeXml(template.name[state.locale])}</title>`,
  ];
  // 透明底：PNG / SVG 需要叠到视频或照片上时不留白底。GIF / MP4 在导出器内部强制关掉。
  if (!state.transparentBg) {
    out.push(`<rect x="0" y="0" width="${f(w)}" height="${f(h)}" fill="${bg}"/>`);
  }

  for (const layer of template.layers) {
    if (layer.type === 'text') {
      out.push(renderText(layer, state, w, h, fg, accent));
    } else {
      out.push(renderTicker(layer, state, w, h, loop, t, fg));
    }
  }
  out.push('</svg>');
  return out.join('\n');
}

function renderText(
  layer: TextLayer,
  state: SceneState,
  w: number,
  h: number,
  fg: string,
  accent: string,
): string {
  const text = state.text[layer.id]?.[state.locale] ?? layer.default[state.locale];
  const [bx, by, bw, bh] = layer.box;
  const layout = fitTextLayout(text, bw * w, bh * h * 0.92);
  const cx = (bx + bw / 2) * w;
  const cy = (by + bh / 2) * h;
  const tracking = layer.letterSpacing
    ? ` letter-spacing="${f(layer.letterSpacing * layout.fontSize)}"`
    : '';
  const attrs =
    `font-family='${DISPLAY_FONT}' font-size="${f(layout.fontSize)}" font-weight="${layer.weight ?? 800}" fill="${fg}" text-anchor="middle"${tracking}`;
  const lh = layout.fontSize * LINE_HEIGHT_RATIO;

  let body: string;
  let bottom: number;
  // 单行：保持最朴素的 <text>（导出到任何查看器都一样）
  if (layout.lines.length <= 1) {
    // 手算基线（不用 dominant-baseline）：导出 SVG 在任何查看器里表现一致
    const baseline = cy + layout.fontSize * 0.35;
    body = `<text x="${f(cx)}" y="${f(baseline)}" ${attrs}>${escapeXml(text)}</text>`;
    bottom = baseline + layout.fontSize * 0.18;
  } else {
    // 多行：整块垂直居中，逐行 <tspan>。行高与字号同源，改字号不会错位。
    const top = cy - (layout.lines.length * lh) / 2;
    const spans = layout.lines
      .map(
        (line, i) =>
          `<tspan x="${f(cx)}" y="${f(top + (i + 0.5) * lh + layout.fontSize * 0.35)}">${escapeXml(line)}</tspan>`,
      )
      .join('');
    body = `<text ${attrs}>${spans}</text>`;
    bottom = top + (layout.lines.length - 1 + 0.5) * lh + layout.fontSize * 0.53;
  }

  // accent 用于标题下方的强调线：长度跟着最长一行走，短标题不会拖一条长线，
  // 长标题也不会超出安全区。空标题不画线，避免留下一根“悬浮”的装饰。
  // 副标题层（accent: false）不画线，否则每条文字下面都挂一根杠。
  if (layer.accent === false || text.trim() === '') return body;
  const textW = Math.max(...layout.lines.map((line) => estimateTextWidth(line, layout.fontSize)));
  const barH = Math.max(3, layout.fontSize * 0.055);
  const barW = Math.min(bw * w * 0.86, Math.max(16, textW));
  const barY = Math.min(by * h + bh * h - barH, bottom + layout.fontSize * 0.06);
  const bar =
    `<rect x="${f(cx - barW / 2)}" y="${f(barY)}" width="${f(barW)}" height="${f(barH)}" rx="${f(barH / 2)}" fill="${accent}"/>`;
  return body + bar;
}

function renderTicker(
  layer: TickerLayer,
  state: SceneState,
  w: number,
  h: number,
  loop: number,
  t: number,
  fg: string,
): string {
  const items: TickerItem[] = state.icons.length > 0 ? state.icons : layer.items;
  const rows = Math.max(1, state.rows || layer.rows);
  const [bx, by, bw, bh] = layer.box;
  const boxX = bx * w;
  const boxY = by * h;
  const boxW = bw * w;
  const boxH = bh * h;
  const rowSlot = boxH / rows;
  // 视觉高度基准：图标、字标、符号+文字都以它为准，整墙才是齐的
  const logoH = rowSlot * (layer.iconScale ?? DEFAULT_ICON_SCALE);
  // 品牌 logo 归一后间距也按视觉高度算，否则缝会比 logo 还大；
  // 纯 emoji 卡保持原来的间距，避免默认卡的 GIF 体积与预估标定被打偏。
  const allEmoji = items.every((item) => isEmoji(item.icon));
  const gap = (allEmoji ? logoH : opticalHeight(logoH)) * layer.gap;

  // 单元宽度只依赖 logoH 与已注入的度量 → 纯函数
  const slots: TickerSlot[] = items.map((item) => ({
    item,
    width: slotWidth(item, logoH, state),
  }));

  const defs: string[] = [];
  const body: string[] = [];
  for (let i = 0; i < rows; i++) {
    const rowTop = boxY + i * rowSlot;
    const cy = rowTop + rowSlot / 2;
    const dir = i % 2 === 0 ? 1 : -1; // 隔行反向（经典跑马灯观感；周期不受方向影响）
    const rowPhase = (((i * layer.phaseJitter) % 1) + 1) % 1; // 行间错相
    // 速度倍率**只**体现在 loopSeconds（BASE/speed，见 loopSecondsFor）：
    // 周期变短 → 同样时间内走完一个周期 → 线性变快。
    // 这里不能再乘一次 speed，否则速度变成平方关系（调到 2× 实际是 4 倍速）。
    const rowSpeed = dir;
    const clipId = `clip-${layer.id}-${i}`;

    defs.push(
      `<clipPath id="${clipId}"><rect x="${f(boxX)}" y="${f(rowTop)}" width="${f(boxW)}" height="${f(rowSlot)}"/></clipPath>`,
    );
    body.push(`<g clip-path="url(#${clipId})">`);
    for (const p of tickerPositions(slots, gap, boxW, rowPhase, t, rowSpeed, loop)) {
      // 每个实例一个 id 前缀：同一 logo 一行里会重复出现，id 撞了 mask/clip 就错乱
      const scope = `${layer.id}-${i}-${Math.round(p.x)}`;
      const cell = renderLogoSlot(p.item, boxX + p.x, cy, logoH, p.width, state, fg, scope);
      if (cell) body.push(cell);
    }
    body.push('</g>');
  }
  return [`<g id="${layer.id}">`, `<defs>${defs.join('')}</defs>`, ...body, '</g>'].join('\n');
}

/**
 * 单个 logo 单元的占宽。三种形态宽度差异极大（`X` vs `Tailwind CSS`），
 * 布局必须按实际宽度累积——这是 ticker.ts 从等距改成变宽的原因。
 */
/** 单元里「品牌名」占的额外宽度（含图标与文字之间的间距） */
function labelWidth(item: TickerItem, logoH: number, state: SceneState): number {
  if (!item.label) return 0;
  const em = state.labelEm?.[item.icon] ?? item.label.length * 0.58;
  return opticalHeight(logoH) * LABEL_GAP + logoH * LABEL_FONT_SCALE * em;
}

/** 品牌名文字（与标题同一套字体与手算基线，保证导出跨查看器一致） */
function renderLabel(label: string, startX: number, cy: number, logoH: number, fg: string): string {
  // 字号按 cap height 反推：让文字兜底的视觉高度和官方字标一致
  const fontSize = logoH * LABEL_FONT_SCALE;
  const opticalH = opticalHeight(logoH);
  const textX = startX + opticalH * LABEL_GAP;
  // baseline 落在 cap 底部 → cap 的视觉中心与 cy 对齐
  const baseline = cy + opticalH / 2;
  return `<text x="${f(textX)}" y="${f(baseline)}" font-family='${DISPLAY_FONT}' font-size="${f(fontSize)}" font-weight="700" fill="${fg}" text-anchor="start">${escapeXml(label)}</text>`;
}

function slotWidth(item: TickerItem, logoH: number, state: SceneState): number {
  const key = item.icon;
  // emoji 保持原来的字号：默认卡就是 emoji 三行，不动它的观感
  if (isEmoji(key)) return logoH;
  const opticalH = opticalHeight(logoH);
  // 用户上传：位图按原始宽高比给宽度（上限 4，防极端长图挤爆一行），
  // 若配了自定义文字还要再加上文字宽度
  if (isUpload(key)) {
    const a = state.logoAspect?.[key];
    const logoW = a ? opticalH * Math.min(a, 4) : opticalH;
    return logoW + labelWidth(item, logoH, state);
  }
  // 官方字标：优先用墨迹宽高比（裁掉 viewBox 留白），没有测量时退回 viewBox
  const ink = state.logoInk?.[key];
  const aspect = ink ? ink.w / ink.h : state.logoAspect?.[key];
  const hasWordmark = state.logoSvgs?.[key] !== undefined && aspect !== undefined;
  if (hasWordmark) {
    // 字标前拼符号时，符号单独占一个视觉宽度的位置
    const symbolW = state.logoWithSymbol && state.iconSvgs?.[key]
      ? opticalH + opticalH * LABEL_GAP * 0.6
      : 0;
    return symbolW + opticalH * (aspect ?? 1);
  }
  if (!item.label) return opticalH;
  return opticalH + labelWidth(item, logoH, state);
}

/** 渲染一个 logo 单元：官方字标 → 优先；否则符号（+ 程序排版品牌名） */
function renderLogoSlot(
  item: TickerItem,
  x: number,
  cy: number,
  logoH: number,
  width: number,
  state: SceneState,
  fg: string,
  scope: string,
): string {
  const key = item.icon;
  if (isEmoji(key)) {
    return renderIcon(key, x + logoH / 2, cy, logoH, state.iconSvgs, fg);
  }

  const opticalH = opticalHeight(logoH);

  // 用户上传：内容已在 iconSvgs（SVG 文本或位图 dataURL）。
  // 位图用 <image> + meet 保比例铺满 logo 区；SVG 文本按 viewBox fit。
  // 之后可以跟自定义文字（用户给上传的图配名字）。
  if (isUpload(key)) {
    const content = state.iconSvgs?.[key] ?? '';
    if (!content) return '';
    const logoW = width - labelWidth(item, logoH, state);
    const logo = content.startsWith('data:')
      ? `<image href="${escapeXml(content)}" x="${f(x)}" y="${f(cy - opticalH / 2)}" width="${f(logoW)}" height="${f(opticalH)}" preserveAspectRatio="xMidYMid meet"/>`
      : renderFittedSvg(
          content,
          x + logoW / 2,
          cy,
          // 按高度归一：宽字标用槽宽当长边，高/方标用视觉高度当长边
          Math.max(opticalH, logoW),
          fg,
          false,
          scope,
          state.logoInk?.[key],
        );
    return logo + (item.label ? renderLabel(item.label, x + logoW, cy, logoH, fg) : '');
  }

  const logoSvg = state.logoSvgs?.[key];
  const ink = state.logoInk?.[key];
  if (logoSvg && (ink || state.logoAspect?.[key] !== undefined)) {
    // 可选：字标前拼一个符号。
    // SVGL 的字标不统一——Gemini / Mistral 自带符号，OpenAI / GitHub 只有文字。
    const useSymbol = state.logoWithSymbol && state.iconSvgs?.[key] !== undefined;
    if (useSymbol) {
      const gap = opticalH * LABEL_GAP * 0.6;
      const symbolW = opticalH + gap;
      const logoW = Math.max(1, width - symbolW);
      const symbol = renderIcon(key, x + opticalH / 2, cy, opticalH, state.iconSvgs, fg, false, scope);
      return symbol + renderWordmark(logoSvg, x + symbolW, cy, logoW, opticalH, state.logoMode, fg, scope, ink);
    }
    return renderWordmark(logoSvg, x, cy, width, opticalH, state.logoMode, fg, scope, ink);
  }

  const symbol = renderIcon(
    key,
    x + opticalH / 2,
    cy,
    opticalH,
    state.iconSvgs,
    fg,
    state.logoMode === 'mono',
    scope,
  );
  if (!item.label) return symbol;
  return symbol + renderLabel(item.label, x + opticalH, cy, logoH, fg);
}

/** 内联官方字标：剥掉原 <svg> 外壳，按目标尺寸重包一层 */
function renderWordmark(
  svg: string,
  x: number,
  cy: number,
  width: number,
  height: number,
  mode: SceneState['logoMode'],
  fg: string,
  scope: string,
  ink?: SvgInkBox,
): string {
  const wrapped = svg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i);
  const inner0 = wrapped?.[1];
  if (!inner0) return '';
  const vb = svg.match(/viewBox=["']([^"']+)["']/i)?.[1];
  // 有墨迹盒就裁到墨迹盒：viewBox 留白不会被算进视觉高度
  const viewBox = ink ? `${f(ink.x)} ${f(ink.y)} ${f(ink.w)} ${f(ink.h)}` : vb ?? `0 0 ${width} ${height}`;
  const aspect = ink ? ink.w / ink.h : width / height;
  const renderW = Math.max(1, height * aspect);
  // brand 模式保留原填充（多数是黑/白双色设计，单色化会把镂空填死、logo 变形）
  const inner = scopeSvgIds(mode === 'mono' ? forceFill(inner0, fg) : inner0, scope);
  return `<svg x="${f(x)}" y="${f(cy - height / 2)}" width="${f(renderW)}" height="${f(height)}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

/** mono 模式：把内部实色填充改成前景色（fill="none" 必须保留，否则镂空消失） */
function forceFill(inner: string, color: string): string {
  return inner.replace(/fill=(["'])(?!none)[^"']*\1/gi, `fill="${color}"`);
}

/**
 * 把任意 SVG（SVGL 符号 / 用户上传的 SVG 文件）fit 进一个方形槽。
 *
 * 与 renderSimpleIconsSvg 不同：SVGL/上传的 SVG 不是 24×24 单 path，
 * viewBox 各异且可能多 path、带 clipPath——必须按自身 viewBox 缩放居中，
 * 而不是套 24 的假设。
 */
function renderFittedSvg(
  svg: string,
  cx: number,
  cy: number,
  size: number,
  fg: string,
  mono = true,
  scope = '',
  ink?: SvgInkBox,
): string {
  const wrapped = svg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i);
  if (!wrapped) return '';
  const vb = svg.match(/viewBox=["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*["']/i);
  if (!ink && !vb) return '';
  const vx = ink ? ink.x : Number(vb?.[1]);
  const vy = ink ? ink.y : Number(vb?.[2]);
  const vw = ink ? ink.w : Number(vb?.[3]);
  const vh = ink ? ink.h : Number(vb?.[4]);
  if (!(vw > 0 && vh > 0)) return '';
  const s = size / Math.max(vw, vh);
  // mono 只对**真正的单色标**成立（见 svg-ids.ts）：多色 / 带白色挖空 / 带渐变
  // 的 logo 必须原样渲染，否则内层细节会被一起填成前景色，整块变成实心色块。
  // 用户上传的 logo 一律不染色——那是人家设计好的成品。
  const raw = mono ? forceFill(wrapped[1] ?? '', fg) : wrapped[1] ?? '';
  const inner = scope ? scopeSvgIds(raw, scope) : raw;
  return `<g transform="translate(${f(cx - (vx + vw / 2) * s)},${f(cy - (vy + vh / 2) * s)}) scale(${f(s)})">${inner}</g>`;
}

/**
 * 图标渲染（scene() 内部调用）。
 *
 * 来源与渲染方式：
 * - emoji:            → <text> 字素，走 EMOJI_FONT
 * - simple-icons:slug → 提取 path，强制单色（fg），避免 GIF 调色板被图标自带 hex 吃掉
 * - svgl:<brand>      → 整段内联并按 viewBox fit（可能多 path 带 clipPath），单色化
 * - upload:<name>     → SVG 文本按 viewBox fit；位图 dataURL 用 <image>（meet 保比例）
 *
 * iconSvgs 由预览/导出层预取注入；缺内容时静默跳过（不炸渲染）。
 */
function renderIcon(
  icon: string,
  cx: number,
  cy: number,
  size: number,
  iconSvgs?: Record<string, string>,
  fg = '#ffffff',
  forceMono = false,
  scope = '',
): string {
  if (isEmoji(icon)) {
    const glyph = icon.slice('emoji:'.length);
    const baseline = cy + size * 0.36;
    return `<text x="${f(cx)}" y="${f(baseline)}" font-family='${EMOJI_FONT}' font-size="${f(size)}" text-anchor="middle">${escapeXml(glyph)}</text>`;
  }

  const svg = iconSvgs?.[icon];
  if (!svg) return '';

  if (isSimpleIcons(icon)) {
    return renderSimpleIconsSvg(svg, cx, cy, size, fg);
  }
  if (isSvglIcon(icon)) {
    // 单色标染成前景色（换背景也看得见）；多色标保持原样，否则会被填实
    return renderFittedSvg(svg, cx, cy, size, fg, forceMono || isMonochromeSvg(svg), scope);
  }
  return '';
}

/** 从 simple-icons SVG 提取 path d，包成内联 svg（viewBox 0 0 24 24，强制单色） */
function renderSimpleIconsSvg(svg: string, cx: number, cy: number, size: number, fg: string): string {
  const d = extractPathD(svg);
  if (!d) return '';
  const half = size / 2;
  return [
    `<svg x="${f(cx - half)}" y="${f(cy - half)}" width="${f(size)}" height="${f(size)}" viewBox="0 0 24 24">`,
    `<path d="${escapeXml(d)}" fill="${fg}"/>`,
    `</svg>`,
  ].join('');
}


/** 提取首个 <path> 的 d 属性（simple-icons 均为单路径） */
function extractPathD(svg: string): string | null {
  const m = svg.match(/<path\b[^>]*\bd="([^"]*)"/);
  return m?.[1] ?? null;
}
