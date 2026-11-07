/**
 * 导出文件名：标题 slug + 本地日期 + 画布尺寸，四种格式共用。
 *
 * 之前一律叫 `sponsored-by-1080x1080.gif`，同一天导出多次只能靠系统自动
 * 加 `(1)(2)` 区分，贴进 README 后根本不知道哪张是哪张。
 *
 * - 中文标题保留汉字（macOS / Windows / GitHub 文件名都支持，不要为了
 *   ASCII 把整段标题丢成空字符串）；
 * - 标题只有符号 / emoji 时 Slug 会变空，回落到模板 id；
 * - 长度按**码点**截断，避免把 emoji 或代理对劈成半个字符；
 * - 日期用本地时间（用户看到的「今天」就是文件名里的日期）。
 */
import { canvasSize } from '../core/scene';
import type { SceneState } from '../core/types';

/** 标题 slug 的最大长度（码点）；加上日期与尺寸后仍是可读的文件名 */
const MAX_SLUG_LENGTH = 48;

/** 标题被清洗后什么都不剩时的兜底 */
const FALLBACK_SLUG = 'sponsored-by';

function currentTitle(state: SceneState): string {
  const layer = state.template.layers.find((item) => item.type === 'text');
  if (!layer) return '';
  return state.text[layer.id]?.[state.locale] ?? layer.default[state.locale];
}

/**
 * 把标题变成文件名安全的 slug。
 *
 * 只允许 Unicode 字母 / 数字（含中日韩文字），其余一律折成单个连字符：
 * 空白、标点、emoji、路径分隔符都会消失，不会出现 `--__--` 这种串。
 */
export function slugifyTitle(title: string): string {
  const slug = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  const truncated = Array.from(slug).slice(0, MAX_SLUG_LENGTH).join('').replace(/-+$/g, '');
  return truncated || FALLBACK_SLUG;
}

/** 本地日期 YYYY-MM-DD（不用 toISOString：那是 UTC，晚上会差一天） */
function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 统一的导出文件名：`<标题 slug>-<YYYY-MM-DD>-<宽>x<高>.<扩展名>`。
 *
 * @param date 仅测试注入用；正常导出省略，取当前时间。
 */
export function exportFilename(state: SceneState, extension: string, date: Date = new Date()): string {
  const { w, h } = canvasSize(state.template, state.ratio);
  return `${slugifyTitle(currentTitle(state))}-${localDate(date)}-${w}x${h}.${extension}`;
}
