import { describe, it, expect, vi } from 'vitest';
import { frameCount, frameDelayMs, frameTime, gifFilename } from '../src/exporters/gif';
import { sponsoredBy } from '../src/templates';
import type { SceneState } from '../src/core/types';

const state: SceneState = {
  template: sponsoredBy,
  locale: 'en',
  text: {},
  ratio: '1:1',
  rows: 3,
  speed: 1,
  icons: [],
  palette: {},
};

describe('GIF 帧调度（SPEC 5.1）', () => {
  it('16fps → delay 取整到 10ms 粒度（60ms）', () => {
    expect(frameDelayMs(16)).toBe(60);
  });

  it('帧数由取整后的 delay 反推：67 帧 × 60ms ≈ 4.02s', () => {
    const total = frameCount(16, 4);
    expect(total).toBe(67);
    expect(total * frameDelayMs(16)).toBe(4020);
  });

  it('末帧时间严格小于 loop（循环缝由 scene 不变量保证）', () => {
    const total = frameCount(16, 4);
    expect(frameTime(total - 1, 60)).toBeCloseTo(3.96, 2);
    expect(frameTime(total - 1, 60)).toBeLessThan(4);
  });

  it('12fps → 80ms / 50 帧', () => {
    expect(frameDelayMs(12)).toBe(80);
    expect(frameCount(12, 4)).toBe(50);
  });

  it('文件名按标题 + 日期 + 画布尺寸', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12));
    try {
      expect(gifFilename(state)).toBe('sponsored-by-2026-11-07-1080x1080.gif');
      expect(gifFilename({ ...state, ratio: '4:5' })).toBe('sponsored-by-2026-11-07-1080x1350.gif');
    } finally {
      vi.useRealTimers();
    }
  });
});
