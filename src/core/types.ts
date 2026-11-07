import type { PatchOp } from './json-patch';

/** 画布比例档位：1:1 → X·Discord·微信 / 4:5 → Instagram·小红书 / 9:16 → TikTok·Reels / 16:9 → 视频封面 */
export type Ratio = '1:1' | '4:5' | '9:16' | '16:9';
export type Locale = 'en' | 'zh';

/** 图标来源：M0 仅 emoji；simple-icons / 用户上传见后续里程碑 */
export interface TickerItem {
  /** 'emoji:💸' | 'simple-icons:openai' | 'upload:<name>' */
  icon: string;
  /**
   * 品牌展示名（如 'GitHub'）。有值时渲染成完整 logo：
   * 优先用官方字标，没有字标则「符号 + 这段文字」。emoji 项留空。
   */
  label?: string;
  /** 项级相位（以「间距」为单位），叠加在行级错相之上 */
  phase?: number;
  /** 项级速度倍率。M3 启用：须为有理数比，保证全局 LCM 周期有限 */
  speed?: number;
}

export interface TextLayer {
  type: 'text';
  id: string;
  default: Record<Locale, string>;
  font: 'display';
  fit: 'auto-shrink';
  /** [x, y, w, h]，均为相对画布的 0..1 比例 */
  box: [number, number, number, number];
  align: 'center';
  /** 界面输入框的显示名；缺省时按层 id 取「标题 / 副标题」 */
  label?: Record<Locale, string>;
  /** 是否在文字下方画强调线；默认 true（副标题层通常设为 false） */
  accent?: boolean;
  /** 字重，默认 800 */
  weight?: number;
  /** 字距（em），默认 0 */
  letterSpacing?: number;
}

export interface TickerLayer {
  type: 'ticker';
  id: string;
  rows: number;
  box: [number, number, number, number];
  /** 图标尺寸 = 行高 × iconScale。GIF 体积对多色图标面积敏感（M3 实测），故入 schema */
  iconScale?: number;
  /** 行内图标间距 = iconSize * (1 + gap) */
  gap: number;
  /** 行间相位错相系数：第 i 行相位 = i * phaseJitter（以「周期」为单位） */
  phaseJitter: number;
  /** 行间速度抖动系数。M3 启用，届时各行速度量化到有限分数集合 */
  speedJitter: number;
  items: TickerItem[];
}

export type Layer = TextLayer | TickerLayer;

/**
 * 变体 = 对同一份模板打 JSON Patch（RFC 6902）。
 * 「语气变体」（made-possible）与「双语文案」走同一机制——一个机制赚两份（SPEC §7）。
 */
export interface TemplateVariant {
  id: string;
  name: Record<Locale, string>;
  patch: PatchOp[];
}

export interface Template {
  id: string;
  version: number;
  name: Record<Locale, string>;
  canvas: { ratios: Ratio[]; basePx: number };
  constraints: { maxColors: number; allowGradient: boolean; allowAlpha: boolean };
  palette: { bg: string; fg: string; accent: string };
  layers: Layer[];
  variants?: TemplateVariant[];
  animation: { loopSeconds: number | 'auto'; fps: number; loop: boolean };
  export: { formats: string[]; gifMaxColors: number; dither: string };
}

/** SVG 内容的实际墨迹包围盒（原始 viewBox 坐标） */
export interface SvgInkBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneState {
  template: Template;
  locale: Locale;
  /** 用户文案覆盖：state.text[layerId][locale] 优先于模板 default */
  text: Record<string, Partial<Record<Locale, string>>>;
  ratio: Ratio;
  /** 覆盖模板 ticker 行数 */
  rows: number;
  /** 全局速度倍率 */
  speed: number;
  /** 用户最终图标列表；为空则用模板默认 */
  icons: TickerItem[];
  palette?: Partial<Template['palette']>;
  /** 预取的图标 SVG（simple-icons / upload），key = icon 字符串。scene() 据此渲染非 emoji 图标 */
  iconSvgs?: Record<string, string>;
  /**
   * 官方完整字标 SVG（SVGL），key = icon 字符串。存在时替代「符号 + 文字」。
   * 由预览/导出层按背景亮度选 light/dark 变体后注入——scene() 保持纯函数。
   */
  logoSvgs?: Record<string, string>;
  /** 字标宽高比（key = icon 字符串），布局算宽度用 */
  logoAspect?: Record<string, number>;
  /**
   * 字标的**实际墨迹**包围盒（viewBox 坐标，key = icon 字符串）。
   *
   * SVGL 的字标 viewBox 自带留白（OpenAI 的墨迹只占盒高 42%），只按 viewBox
   * 等比缩放会让不同品牌高矮差一倍。由调用方在浏览器里量好注入，scene() 用它
   * 裁掉留白并按视觉高度归一。
   */
  logoInk?: Record<string, SvgInkBox>;
  /**
   * 品牌名在 1em 字号下的宽度（key = icon 字符串）。
   * scene() 不能调用 canvas.measureText，故由调用方量好注入。
   */
  labelEm?: Record<string, number>;
  /** logo 着色：brand = 保留原色 / 按背景挑明暗变体；mono = 统一前景色 */
  logoMode?: 'brand' | 'mono';
  /**
   * 官方字标前面再拼一个符号。
   *
   * 需要这个开关的原因：SVGL 的字标**不统一**——Gemini / Mistral 的字标自带符号，
   * 而 OpenAI / GitHub 的字标只有文字（符号是单独的另一个文件）。无法靠宽高比或
   * path 数可靠区分（实测 2.23/2.71/3.12 与 6/2/16 都无规律），所以交给用户决定。
   */
  logoWithSymbol?: boolean;
  /**
   * 导出 PNG / SVG 时不要背景色（透明底）。
   * GIF / MP4 必须不透明（视频编码没有 alpha），导出器会在内部强制关掉。
   */
  transparentBg?: boolean;
}
