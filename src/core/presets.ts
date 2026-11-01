/**
 * 平台预设（M5）：把 SPEC §5 的平台阈值表变成可执行的派生规则。
 *
 * 两条职责严格分开：
 * 1. **派生**（deriveExportState）——「发到哪」决定导出参数，且只影响对应的
 *    导出格式。微信档降到 720px / 12fps 是为了动画体积，不该把 PNG 也降成
 *    720px（静态图没有体积压力，用户要的是原尺寸）。
 * 2. **预估**（estimateSize）——导出前给出「预估体积 vs 上限」。模型来自 M3
 *    的实测锚点，因子全部有测量依据（见下方常量注释），不是拍脑袋。
 *
 * 上游数据：SPEC §5「平台阈值（2026-10-24 核实）」+ 决策 18（2026-10-25，
 * 微信从「最苛刻」降为可选档，X/GitHub/Discord 为主）。
 */
import { canvasSize, DEFAULT_ICON_SCALE, loopSecondsFor } from './scene';
import { frameCount } from './frames';
import type { Locale, SceneState, TickerLayer } from './types';

const MIB = 1024 * 1024;

export type PlatformId = 'none' | 'x' | 'github' | 'discord' | 'wechat' | 'xiaohongshu';
export type ExportFormat = 'gif' | 'mp4' | 'png' | 'svg';

/** 派生档位：只写要覆盖的字段，未写的沿用模板值 */
export interface PresetOverrides {
  basePx?: number;
  fps?: number;
  maxColors?: number;
  iconScale?: number;
}

export interface PlatformPreset {
  id: PlatformId;
  name: Record<Locale, string>;
  /** GIF 体积上限（字节）；null = 该平台不适用 GIF 或口径未知 */
  gifLimitBytes: number | null;
  mp4LimitBytes: number | null;
  /** GIF 派生档位；缺省表示沿用模板默认 */
  gif?: PresetOverrides;
  /** 播放行为提示（逐字对应 SPEC §5「播放行为」列） */
  note: Record<Locale, string>;
}

export const PLATFORMS: PlatformPreset[] = [
  {
    id: 'none',
    name: { en: 'No preset', zh: '不预设' },
    gifLimitBytes: null,
    mp4LimitBytes: null,
    note: { en: 'Template defaults.', zh: '按模板默认参数导出。' },
  },
  {
    id: 'x',
    name: { en: 'X / Twitter', zh: 'X / 推特' },
    // 网页 15 MB / App 5 MB，取 App 的保守口径
    gifLimitBytes: 5 * MIB,
    mp4LimitBytes: 512 * MIB,
    note: {
      en: 'Only a GIF post loops forever; an MP4 becomes a video post with a progress bar.',
      zh: '只有 GIF 帖无限循环；MP4 会变成带进度条的视频帖。',
    },
  },
  {
    id: 'github',
    name: { en: 'GitHub', zh: 'GitHub' },
    gifLimitBytes: 10 * MIB,
    mp4LimitBytes: null,
    note: {
      en: 'GIF loops automatically in README; video cannot be inlined there.',
      zh: 'README 里 GIF 自动循环；视频不能内联。',
    },
  },
  {
    id: 'discord',
    name: { en: 'Discord', zh: 'Discord' },
    gifLimitBytes: 20 * MIB,
    mp4LimitBytes: null,
    note: {
      en: 'GIF plays inline; an MP4 needs a click.',
      zh: 'GIF 内联自动播放；MP4 需点击。',
    },
  },
  {
    id: 'wechat',
    name: { en: 'WeChat (safe)', zh: '微信（安全档）' },
    // 官方口径 10 MB，但实测 > 1~2 MB 会静默降级成静态图 → 取 2 MB 为实用线
    gifLimitBytes: 2 * MIB,
    mp4LimitBytes: null,
    // 只降像素与帧率，保留 32 色：M3 杠杆表证明颜色只值 -14%，面积/帧数才是主杠杆
    gif: { basePx: 720, fps: 12 },
    note: {
      en: 'Above ~1–2 MB WeChat may silently downgrade to a still image.',
      zh: '超过 1~2 MB 微信可能静默降级成静态图。',
    },
  },
  {
    id: 'xiaohongshu',
    name: { en: 'Xiaohongshu', zh: '小红书' },
    gifLimitBytes: null,
    mp4LimitBytes: null,
    note: {
      en: 'Use MP4; GIF support is unreliable.',
      zh: '走 MP4；GIF 支持不可靠。',
    },
  },
];

export function getPreset(id: PlatformId): PlatformPreset {
  const preset = PLATFORMS.find((p) => p.id === id);
  if (!preset) throw new Error(`未知平台预设：${id}`);
  return preset;
}

/**
 * 按「平台 + 导出格式」派生一份导出专用状态。
 *
 * 预览与 PNG/SVG 用原始状态（保持模板自然像素）；只有 GIF 吃平台档位。
 * MP4 暂不降档——编码器效率比 GIF 高一个量级，1080p 也远在限额内。
 */
export function deriveExportState(
  state: SceneState,
  presetId: PlatformId,
  format: ExportFormat,
): SceneState {
  const over = format === 'gif' ? getPreset(presetId).gif : undefined;
  if (!over) return state;

  const { template } = state;
  const layers =
    over.iconScale === undefined
      ? template.layers
      : template.layers.map((l): TickerLayer | typeof l =>
          l.type === 'ticker' ? { ...l, iconScale: over.iconScale } : l,
        );

  return {
    ...state,
    template: {
      ...template,
      canvas: { ...template.canvas, basePx: over.basePx ?? template.canvas.basePx },
      animation: { ...template.animation, fps: over.fps ?? template.animation.fps },
      export: { ...template.export, gifMaxColors: over.maxColors ?? template.export.gifMaxColors },
      layers,
    },
  };
}

// —— 体积预估 ——
//
// 锚点：2026-11-01 实测 1080×1080 / 16fps（67 帧）/ 32 色 / iconScale 0.62 /
// 3 行默认 emoji → 4 152 364 B（旧锚点 3576 KB 是 M3 时代的卡，内容变过，
// 预估一直偏低 12%）。
// 其余因子都有实测依据（同一卡、单变量）：
//   · 32 色 → 16 色：×0.859
//   · iconScale 0.62 → 0.45：×0.786
//   · 面积：1080² → 720² 时每帧从 53.4 KB 降到 27.9 KB，只有 0.52 倍而非
//     面积比 0.44 倍——小画布「每像素」更贵（文字边缘在总像素里占比上升）。
//     两点拟合得指数 ≈0.80，故面积不按平方缩放。
//   · 行数（2026-11-01 实测 1/3/5/8/12 行）：1→0.736、5→1.142、8→1.319、
//     12→1.446（相对 3 行）。拟合 (rows/3)^0.264，四点误差均 <2%。
//     旧模型完全不含行数，「拉满 12 行」和「1 行」预估一模一样。
// 帧数近似线性（M3 三档测量支持）。仍有 ±10% 量级误差，故预估只作档位提示，
// 超限与否最终以导出后的实际字节判定（见 exceedsLimit）。

const GIF_ANCHOR = {
  px: 1080,
  frames: 67,
  colors: 32,
  iconScale: 0.62,
  rows: 3,
  bytes: 4152364,
};
const COLOR_FACTOR_16 = 3073 / 3576;
const ICON_FACTOR_045 = 2811 / 3576;
/** 面积指数：由 1080² / 720² 两个实测点拟合（0.44 面积 → 0.52 体积） */
const AREA_EXPONENT = 0.8;
/** 行数指数：由 1/3/5/8/12 行五档实测拟合 */
const ROWS_EXPONENT = 0.264;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 行数因子：行越多，同样的帧里要挤压的内容越多，体积涨，但涨得很慢（幂 0.264） */
export function rowsFactor(rows: number): number {
  const safe = Number.isFinite(rows) && rows > 0 ? rows : GIF_ANCHOR.rows;
  return (safe / GIF_ANCHOR.rows) ** ROWS_EXPONENT;
}

/** 调色板名额减少的收益（16→32 色之间线性；低于 16 色无实测，按下界钳住） */
export function colorFactor(colors: number): number {
  const t = clamp01((colors - 16) / (GIF_ANCHOR.colors - 16));
  return COLOR_FACTOR_16 + (1 - COLOR_FACTOR_16) * t;
}

/** 图标面积减少的收益（0.45→0.62 之间线性；更大尺寸按下界钳住） */
export function iconFactor(scale: number): number {
  const t = clamp01((GIF_ANCHOR.iconScale - scale) / (GIF_ANCHOR.iconScale - 0.45));
  return 1 - (1 - ICON_FACTOR_045) * t;
}

/** ticker 图层实际使用的图标缩放（模板覆盖优先） */
function stateIconScale(state: SceneState): number {
  const ticker = state.template.layers.find((l): l is TickerLayer => l.type === 'ticker');
  return ticker?.iconScale ?? DEFAULT_ICON_SCALE;
}

/** GIF 体积预估（字节） */
export function estimateGifBytes(state: SceneState): number {
  const { w, h } = canvasSize(state.template, state.ratio);
  const frames = frameCount(state.template.animation.fps, loopSecondsFor(state));
  const area = (w * h) / (GIF_ANCHOR.px * GIF_ANCHOR.px);
  return Math.round(
    GIF_ANCHOR.bytes *
      (frames / GIF_ANCHOR.frames) *
      area ** AREA_EXPONENT *
      rowsFactor(state.rows) *
      colorFactor(state.template.export.gifMaxColors) *
      iconFactor(stateIconScale(state)),
  );
}

export interface SizeEstimate {
  /** 预估字节；null = 无法预估（MP4 体积由编码器与质量档决定） */
  bytes: number | null;
  limit: number | null;
  over: boolean;
}

/**
 * 导出前预估：GIF 走标定模型；MP4 不给数字（编码器相关，硬编一个数就是骗人），
 * 只回上限，由导出后的实际字节做最后判定。
 */
export function estimateSize(
  state: SceneState,
  presetId: PlatformId,
  format: ExportFormat,
): SizeEstimate {
  const preset = getPreset(presetId);
  if (format === 'gif') {
    const bytes = estimateGifBytes(deriveExportState(state, presetId, 'gif'));
    return { bytes, limit: preset.gifLimitBytes, over: preset.gifLimitBytes !== null && bytes > preset.gifLimitBytes };
  }
  if (format === 'mp4') {
    return { bytes: null, limit: preset.mp4LimitBytes, over: false };
  }
  return { bytes: null, limit: null, over: false };
}

/** 人类可读体积：>= 1 MB 用 MB（一位小数），否则用 KB */
export function formatBytes(bytes: number): string {
  if (bytes >= MIB) return `${(bytes / MIB).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** 导出后判定：实际字节 vs 平台上限 */
export function exceedsLimit(bytes: number, limit: number | null): boolean {
  return limit !== null && bytes > limit;
}
