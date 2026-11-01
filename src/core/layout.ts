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

/** auto-shrink：不超过高度上限的前提下，逐级收缩到宽度上限内 */
export function fitFontSize(text: string, boxW: number, boxH: number): number {
  let size = boxH;
  while (size > 8 && estimateTextWidth(text, size) > boxW) size -= 1;
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
  const cached = layoutCache.get(`${text}\u0000${boxW}\u0000${boxH}`);
  if (cached) return cached;

  const single: TextLayout = { lines: [text], fontSize: fitFontSize(text, boxW, boxH) };
  if (text.trim() === '' || single.fontSize >= boxH * GOOD_ENOUGH_RATIO) {
    remember(text, boxW, boxH, single);
    return single;
  }

  // 折行必须比单行明显大，否则观感更差（多一行、字没大多少）
  const floor = Math.max(single.fontSize * WRAP_WIN_RATIO, 9);

  let best: TextLayout | null = null;
  for (let n = 2; n <= MAX_LINES; n++) {
    const size = bestWrapSize(text, n, boxW, boxH, floor);
    if (size === null) continue;
    if (!best || size > best.fontSize) {
      best = { lines: wrapToLines(text, n, boxW, size) ?? [text], fontSize: size };
    }
  }
  const out = best ?? single;
  remember(text, boxW, boxH, out);
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
function remember(text: string, boxW: number, boxH: number, layout: TextLayout): void {
  layoutCache.set(`${text}\u0000${boxW}\u0000${boxH}`, layout);
  if (layoutCache.size > 8) {
    const oldest = layoutCache.keys().next().value;
    if (oldest !== undefined) layoutCache.delete(oldest);
  }
}
