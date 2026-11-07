import { describe, it, expect } from 'vitest';
import {
  PLATFORMS,
  colorFactor,
  deriveExportState,
  estimateGifBytes,
  estimateGifSeconds,
  estimateSize,
  exceedsLimit,
  formatBytes,
  getPreset,
  iconFactor,
} from '../src/core/presets';
import { createDefaultState } from '../src/app-state';
import { canvasSize } from '../src/core/scene';
import { frameCount } from '../src/core/frames';
import type { TickerLayer } from '../src/core/types';

const base = createDefaultState();

/** 把 ticker 的图标缩放改掉（预估的第三根杠杆） */
function withIconScale(scale: number) {
  const state = createDefaultState();
  return {
    ...state,
    template: {
      ...state.template,
      layers: state.template.layers.map((l) => (l.type === 'ticker' ? { ...l, iconScale: scale } : l)),
    },
  };
}

describe('平台预设表', () => {
  it('每个平台 id 唯一且可按 id 取回', () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PLATFORMS) expect(getPreset(p.id)).toBe(p);
  });

  it('未知平台明确报错（不静默回退）', () => {
    // @ts-expect-error 故意传非法值
    expect(() => getPreset('weibo')).toThrow(/weibo/);
  });

  it('主平台都有限额，小红书明确不承诺 GIF', () => {
    expect(getPreset('x').gifLimitBytes).toBe(5 * 1024 * 1024);
    expect(getPreset('github').gifLimitBytes).toBe(10 * 1024 * 1024);
    expect(getPreset('discord').gifLimitBytes).toBe(20 * 1024 * 1024);
    expect(getPreset('wechat').gifLimitBytes).toBe(2 * 1024 * 1024);
    expect(getPreset('xiaohongshu').gifLimitBytes).toBeNull();
    expect(getPreset('reddit').gifLimitBytes).toBe(20 * 1024 * 1024);
    expect(getPreset('instagram').gifLimitBytes).toBeNull();
    expect(getPreset('tiktok').gifLimitBytes).toBeNull();
  });

  it('Instagram / TikTok / Reddit 带 2026 规格的推荐比例与格式', () => {
    // Instagram 信息流竖图 4:5 → PNG；Stories / Reels 由用户手动切 9:16
    expect(getPreset('instagram').ratio).toBe('4:5');
    expect(getPreset('instagram').format).toBe('png');
    // TikTok 图文 / 视频统一 9:16 → MP4
    expect(getPreset('tiktok').ratio).toBe('9:16');
    expect(getPreset('tiktok').format).toBe('mp4');
    // Reddit 信息流竖图 4:5 → GIF 内联播放
    expect(getPreset('reddit').ratio).toBe('4:5');
    expect(getPreset('reddit').format).toBe('gif');
    expect(canvasSize(base.template, '9:16')).toEqual({ w: 1080, h: 1920 });
  });

  it('每个平台都有中英文名与提示（UI 双语不漏字）', () => {
    for (const p of PLATFORMS) {
      expect(p.name.en.length).toBeGreaterThan(0);
      expect(p.name.zh.length).toBeGreaterThan(0);
      expect(p.note.en.length).toBeGreaterThan(0);
      expect(p.note.zh.length).toBeGreaterThan(0);
    }
  });
});

describe('deriveExportState', () => {
  it('微信档只降 GIF：720px / 12fps，PNG 保持原尺寸', () => {
    const gif = deriveExportState(base, 'wechat', 'gif');
    expect(canvasSize(gif.template, gif.ratio)).toEqual({ w: 720, h: 720 });
    expect(gif.template.animation.fps).toBe(12);

    const png = deriveExportState(base, 'wechat', 'png');
    expect(canvasSize(png.template, png.ratio)).toEqual({ w: 1080, h: 1080 });
    expect(png.template.animation.fps).toBe(base.template.animation.fps);
  });

  it('无档位的平台原样返回（同一引用，无谓拷贝为零）', () => {
    expect(deriveExportState(base, 'x', 'gif')).toBe(base);
    expect(deriveExportState(base, 'github', 'mp4')).toBe(base);
  });

  it('派生不修改输入（纯函数）', () => {
    const snapshot = JSON.stringify(base);
    deriveExportState(base, 'wechat', 'gif');
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it('模板自身声明的 iconScale 保留（微信档只降像素/帧率）', () => {
    const state = deriveExportState(base, 'wechat', 'gif');
    const ticker = state.template.layers.find((l): l is TickerLayer => l.type === 'ticker');
    expect(ticker?.iconScale).toBe(0.62);
  });
});

describe('快速 GIF 档', () => {
  it('降到 720px / 12fps，且只影响 GIF', () => {
    const gif = deriveExportState(base, 'none', 'gif', true);
    expect(canvasSize(gif.template, gif.ratio)).toEqual({ w: 720, h: 720 });
    expect(gif.template.animation.fps).toBe(12);
    // 快速档是 GIF 的体积手段，不该把 PNG 也降成 720px
    expect(deriveExportState(base, 'none', 'png', true)).toBe(base);
  });

  it('与微信档同时选时取更小值（不会反而变大）', () => {
    const both = deriveExportState(base, 'wechat', 'gif', true);
    expect(canvasSize(both.template, both.ratio)).toEqual({ w: 720, h: 720 });
    expect(both.template.animation.fps).toBe(12);
  });

  it('体积与预计耗时都随快速档下降', () => {
    const standard = estimateGifBytes(base);
    const quick = estimateSize(base, 'none', 'gif', true).bytes;
    expect(quick).not.toBeNull();
    expect(quick ?? Infinity).toBeLessThan(standard);
    expect(estimateGifSeconds(base, 'none')).toBe(67);
    expect(estimateGifSeconds(base, 'none', true)).toBeLessThan(67);
  });
});

describe('体积预估模型', () => {
  it('锚点复现实测：默认卡 ≈ 4.0 MB（2026-11-01 实测 4 152 364 B）', () => {
    const bytes = estimateGifBytes(base);
    // 锚点即实测值，默认参数下预估应等同实测（±1%）
    expect(Math.abs(bytes - 4152364) / 4152364).toBeLessThan(0.01);
    // 帧数与锚点一致（16fps / 4s → 67 帧）
    expect(frameCount(base.template.animation.fps, 4)).toBe(67);
  });

  it('行数因子：五档实测（1/3/5/8/12 行）误差 < 5%', () => {
    const measured: [number, number][] = [
      [1, 3054606],
      [3, 4152364],
      [5, 4742336],
      [8, 5475831],
      [12, 6004810],
    ];
    for (const [rows, actual] of measured) {
      const est = estimateGifBytes({ ...base, rows });
      expect(Math.abs(est - actual) / actual, `rows=${rows}`).toBeLessThan(0.05);
    }
  });

  it('颜色因子：32 色 = 1，16 色 = 实测 -14%', () => {
    expect(colorFactor(32)).toBe(1);
    expect(colorFactor(16)).toBeCloseTo(0.859, 3);
    expect(colorFactor(8)).toBeCloseTo(0.859, 3); // 低于 16 色无实测，钳住
    expect(colorFactor(64)).toBe(1); // 高于 32 色无实测，钳住
  });

  it('图标因子：0.62 = 1，0.45 = 实测 -21%', () => {
    expect(iconFactor(0.62)).toBe(1);
    expect(iconFactor(0.45)).toBeCloseTo(0.786, 3);
    expect(iconFactor(0.8)).toBe(1);
  });

  it('单变量影响与 M3 杠杆表一致', () => {
    const anchor = estimateGifBytes(base);
    expect(estimateGifBytes(withIconScale(0.45)) / anchor).toBeCloseTo(0.786, 3);
  });

  it('面积按实测指数缩放（小画布每像素更贵，不按平方）', () => {
    const small = deriveExportState(base, 'wechat', 'gif');
    // 微信档同时把 fps 降到 12（50 帧 vs 67 帧）
    const ratio = estimateGifBytes(small) / estimateGifBytes(base);
    expect(ratio).toBeCloseTo(((720 * 720) / (1080 * 1080)) ** 0.8 * (50 / 67), 3);
  });

  it('标定复核：720px / 12fps 预估贴近实测 1 611 508 B（误差 < 5%）', () => {
    const est = estimateGifBytes(deriveExportState(base, 'wechat', 'gif'));
    const measured = 1611508;
    expect(Math.abs(est - measured) / measured).toBeLessThan(0.05);
  });

  it('微信档预估落在 2 MB 上限内（M5 判据的前置条件）', () => {
    const est = estimateSize(base, 'wechat', 'gif');
    expect(est.bytes).not.toBeNull();
    expect(est.bytes ?? Infinity).toBeLessThan(2 * 1024 * 1024);
    expect(est.over).toBe(false);
  });

  it('默认档在 X / GitHub / Discord 上限内，小红书不判定', () => {
    for (const id of ['x', 'github', 'discord'] as const) {
      expect(estimateSize(base, id, 'gif').over).toBe(false);
    }
    const xhs = estimateSize(base, 'xiaohongshu', 'gif');
    expect(xhs.limit).toBeNull();
    expect(xhs.over).toBe(false);
  });

  it('超限能被识别（4K 画布在 X 5 MB 上限下必然超限）', () => {
    // 注意用不降档的平台：微信档会把 basePx 强制拉回 720，构造不出超限
    const huge = {
      ...createDefaultState(),
      template: {
        ...base.template,
        canvas: { ...base.template.canvas, basePx: 2160 },
      },
    };
    expect(estimateSize(huge, 'x', 'gif').over).toBe(true);
    expect(estimateSize(huge, 'none', 'gif').over).toBe(false); // 无上限 → 不判
  });

  it('MP4 不编造预估数字，但带上限', () => {
    const est = estimateSize(base, 'x', 'mp4');
    expect(est.bytes).toBeNull();
    expect(est.limit).toBe(512 * 1024 * 1024);
  });
});

describe('formatBytes / exceedsLimit', () => {
  it('MB 与 KB 分档', () => {
    // 3576 KB = 3.49 MiB → 3.5 MB（平台限额本身按 MB 口径，量级一致即可）
    expect(formatBytes(3576 * 1024)).toBe('3.5 MB');
    expect(formatBytes(800 * 1024)).toBe('800 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  it('null 上限永远不判超限', () => {
    expect(exceedsLimit(99 * 1024 * 1024, null)).toBe(false);
    expect(exceedsLimit(3 * 1024 * 1024, 2 * 1024 * 1024)).toBe(true);
  });
});
