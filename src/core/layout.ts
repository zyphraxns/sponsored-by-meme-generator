/**
 * 自动排版估算（M0 启发式版）：
 * 在无 canvas 测量的前提下，按字符类别估算文本宽度，驱动 auto-shrink。
 * M1 接入真实测量（canvas measureText）后可平滑替换本文件。
 */

/** CJK 及全角标点按全宽（1em）计 */
const CJK = /[\u3000-\u303e\uff00-\uffef\u4e00-\u9fff\u3400-\u4dbf]/;

/** 估算文本像素宽度 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    if (CJK.test(ch)) em += 1.0;
    else if (ch === ' ') em += 0.32;
    else if (ch >= 'A' && ch <= 'Z') em += 0.66;
    else if (ch >= '0' && ch <= '9') em += 0.6;
    else em += 0.56; // 小写与常见符号
  }
  return em * fontSize * 1.04; // 粗体膨胀
}

/** 字号硬下限：再小就真的看不清了，此时靠 overflow 信号让调用方提示用户 */
const MIN_FONT_SIZE = 8;

/** 可读下限：最终字号低于文本盒高度的这个比例时，视为已经压到看不清 */
export const MIN_READABLE_RATIO = 0.2;

/** auto-shrink：不超过高度上限的前提下，逐级收缩到宽度上限内 */
export function fitFontSize(text: string, boxW: number, boxH: number): number {
  let size = boxH;
  while (size > MIN_FONT_SIZE && estimateTextWidth(text, size) > boxW) size -= 1;
  return size;
}

/** 行高相对字号（含行间空隙） */
export const LINE_HEIGHT_RATIO = 1.12;

/** 折行上限：三行之后字号已经小到没有意义，再多不如让用户删字 */
const MAX_LINES = 3;

/** 单行就能拿到框高的这个比例时，不再折行（折了也不会更大） */
const GOOD_ENOUGH_RATIO = 0.55;

/** 折行后必须比单行大到这个倍数才值得折（否则观感更差） */
const WRAP_WIN_RATIO = 1.08;

export interface TextLayout {
  lines: string[];
  fontSize: number;
  /** 是否发生过自动收缩（fontSize 小于文本盒高度） */
  compressed: boolean;
  /** 压缩比例 = fontSize / boxH；1 表示完全没缩 */
  scale: number;
  /**
   * 是否已经压到可读下限以下。
   * 调用方拿到 true 时应提示「标题太长，建议删字或手动换行」，
   * 而不是继续静默缩小字号。
   */
  overflow: boolean;
}

function makeLayout(lines: string[], fontSize: number, boxH: number): TextLayout {
  const scale = boxH > 0 ? Math.min(1, fontSize / boxH) : 1;
  return {
    lines,
    fontSize,
    compressed: scale < 1,
    scale,
    overflow: scale < MIN_READABLE_RATIO,
  };
}

/** 切成可单独断行的碎片：CJK 逐字，拉丁按词 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let buf = '';
  for (const ch of text) {
    if (/\s/.test(ch)) {
      if (buf) {
        tokens.push(buf);
        buf = '';
      }
      continue;
    }
    if (CJK.test(ch)) {
      if (buf) {
        tokens.push(buf);
        buf = '';
      }
      tokens.push(ch);
    } else {
      buf += ch;
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

/** 一个 token 在给定字号下超宽时，按字符硬切成若干段 */
function splitWide(token: string, boxW: number, size: number): string[] {
  if (estimateTextWidth(token, size) <= boxW) return [token];
  const out: string[] = [];
  let cur = '';
  for (const ch of token) {
    const next = cur + ch;
    if (cur && estimateTextWidth(next, size) > boxW) {
      out.push(cur);
      cur = ch;
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * 贪心折行；行数超过 maxLines 返回 null（说明这个字号折不下）。
 */
function wrapToLines(text: string, maxLines: number, boxW: number, size: number): string[] | null {
  const tokens = tokenize(text).flatMap((t) => splitWide(t, boxW, size));
  const lines: string[] = [];
  let cur = '';
  let lastWasWord = false;
  for (const token of tokens) {
    const isWord = token.length > 1 && !CJK.test(token);
    const joiner = cur && lastWasWord && isWord ? ' ' : '';
    const next = cur ? cur + joiner + token : token;
    if (estimateTextWidth(next, size) <= boxW) {
      cur = next;
      lastWasWord = isWord || (lastWasWord && !isWord);
      continue;
    }
    if (cur) {
      lines.push(cur);
      if (lines.length >= maxLines) return null;
      cur = token;
      lastWasWord = isWord;
      continue;
    }
    // 单个 token 已经超宽且无法再切（理论上不会到这里）
    return null;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) return null;
  return lines;
}

/**
 * 单行装不下时的排版决策：先试折行，折出来的字号明显更大就用折行版本。
 *
 * 2026-11-01 加：原来只有单行 auto-shrink，下限 8px，一句长一点的梗在
 * 1080 画布上会被压成 8px 的细线——内容废了，用户只能回去删字。
 *
 * 折行的字号不能直接取「高度上限」（boxH/n）：那个尺寸往往一行塞不下几个词，
 * 反而折不成。真正要找的是「能让这段文字折成 n 行的最大字号」，
 * 对字号做二分即可（折得越多行 → 字号越大 → 每行越窄，单调）。
 */
export function fitTextLayout(text: string, boxW: number, boxH: number): TextLayout {
  const key = `${text}\u0000${boxW}\u0000${boxH}`;
  const cached = layoutCache.get(key);
  if (cached) return cached;

  // 用户输入的换行符（\n / \r\n）是硬断点；没有换行时走原来的纯自动折行逻辑，
  // 保证现有模板的排版结果一个字都不变。
  const layout = /[\r\n]/.test(text) ? fitWithHardBreaks(text, boxW, boxH) : fitAuto(text, boxW, boxH);
  remember(key, layout);
  return layout;
}

/** 纯自动折行（无手动换行时的原有逻辑） */
function fitAuto(text: string, boxW: number, boxH: number): TextLayout {
  const single = makeLayout([text], fitFontSize(text, boxW, boxH), boxH);
  if (text.trim() === '' || single.fontSize >= boxH * GOOD_ENOUGH_RATIO) {
    return single;
  }

  // 折行必须比单行明显大，否则观感更差（多一行、字没大多少）
  const floor = Math.max(single.fontSize * WRAP_WIN_RATIO, 9);

  let best: TextLayout | null = null;
  for (let n = 2; n <= MAX_LINES; n++) {
    const size = bestWrapSize(text, n, boxW, boxH, floor);
    if (size === null) continue;
    if (!best || size > best.fontSize) {
      best = makeLayout(wrapToLines(text, n, boxW, size) ?? [text], size, boxH);
    }
  }
  return best ?? single;
}

/**
 * 手动换行模式：每个 `\n` 都是硬断点，片段内部继续自动折行。
 *
 * 字号取「所有行都能装进文本框」的最大值；行数由用户决定，不再套用 3 行上限。
 * 如果压到字号下限都装不下，仍然返回全部行（不偷偷丢内容），
 * 同时把 overflow 标成 true，交给调用方提示用户删字。
 */
function fitWithHardBreaks(text: string, boxW: number, boxH: number): TextLayout {
  const segments = text.replace(/\r\n?/g, '\n').split('\n');
  // 输入框末尾常带一个换行，别把它当成额外的空白行
  while (segments.length > 1 && (segments[segments.length - 1] ?? '').trim() === '') segments.pop();

  // 最少行数就是硬断点数量，据此算出字号的理论上限
  const ceiling = boxH / (Math.max(1, segments.length) * LINE_HEIGHT_RATIO);
  const top = Math.max(1, ceiling);

  const fits = (size: number): boolean => {
    const lines = wrapSegments(segments, boxW, size);
    return lines.length * size * LINE_HEIGHT_RATIO <= boxH;
  };

  if (ceiling <= MIN_FONT_SIZE) {
    // 文本框本身很矮（缩略图等），先保证高度，可读性交给 overflow 信号
    return makeLayout(wrapSegments(segments, boxW, top), top, boxH);
  }

  if (!fits(ceiling)) {
    if (!fits(MIN_FONT_SIZE)) {
      return makeLayout(wrapSegments(segments, boxW, MIN_FONT_SIZE), MIN_FONT_SIZE, boxH);
    }
    let lo = MIN_FONT_SIZE;
    let hi = ceiling;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    return makeLayout(wrapSegments(segments, boxW, lo), lo, boxH);
  }
  return makeLayout(wrapSegments(segments, boxW, ceiling), ceiling, boxH);
}

/** 每个硬断片段内部继续贪心折行，并按顺序拼成最终行列表 */
function wrapSegments(segments: string[], boxW: number, size: number): string[] {
  const out: string[] = [];
  for (const segment of segments) {
    if (segment.trim() === '') {
      out.push(''); // 连续两个换行 = 用户想要的空行
      continue;
    }
    const wrapped = wrapToLines(segment, Number.MAX_SAFE_INTEGER, boxW, size);
    out.push(...(wrapped ?? [segment]));
  }
  return out;
}

/** 能把 text 折成 ≤n 行（每行不超宽）的最大字号；折不下返回 null */
function bestWrapSize(text: string, n: number, boxW: number, boxH: number, floor: number): number | null {
  const hi = boxH / (n * LINE_HEIGHT_RATIO);
  if (hi <= floor) return null;
  const fits = (size: number): boolean => {
    const lines = wrapToLines(text, n, boxW, size);
    return lines !== null && lines.length >= 1;
  };
  if (!fits(floor)) return null;
  if (fits(hi)) return hi;
  let lo = floor;
  let top = hi;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + top) / 2;
    if (fits(mid)) lo = mid;
    else top = mid;
  }
  return lo;
}

/**
 * 排版结果缓存：scene() 每帧都会调用，没缓存的话 60fps 下每秒要做
 * 几十次折行计算。只留最近 8 条（通常是同一个标题在重复问）。
 */
const layoutCache = new Map<string, TextLayout>();
function remember(key: string, layout: TextLayout): void {
  layoutCache.set(key, layout);
  if (layoutCache.size > 8) {
    const oldest = layoutCache.keys().next().value;
    if (oldest !== undefined) layoutCache.delete(oldest);
  }
}
