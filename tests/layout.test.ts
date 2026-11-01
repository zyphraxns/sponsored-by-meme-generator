import { describe, it, expect } from 'vitest';
import { estimateTextWidth, fitTextLayout } from '../src/core/layout';
import { scene } from '../src/core/scene';
import { sponsoredBy } from '../src/templates';
import type { SceneState } from '../src/core/types';

const box = { w: 900, h: 200 };

function makeState(text: string): SceneState {
  return {
    template: sponsoredBy,
    locale: 'en',
    text: { title: { en: text } },
    ratio: '1:1',
    rows: 3,
    speed: 1,
    icons: [],
    palette: {},
  };
}

describe('标题排版：先折行再缩字号', () => {
  it('短标题保持单行（不给默认卡加 tspan 噪音）', () => {
    const layout = fitTextLayout('SPONSORED BY', box.w, box.h);
    expect(layout.lines).toHaveLength(1);
    expect(scene(makeState('SPONSORED BY'), 0)).toContain('>SPONSORED BY</text>');
  });

  it('长标题折成多行，字号明显大于单行 auto-shrink 的下限', () => {
    const long = 'SPONSORED BY ABSOLUTELY NOBODY AND EVERYBODY ALL AT ONCE FOR A VERY LONG TIME';
    const layout = fitTextLayout(long, box.w, box.h);
    expect(layout.lines.length).toBeGreaterThan(1);
    // 旧实现会一路缩到 8px，这里必须明显更大
    expect(layout.fontSize).toBeGreaterThan(30);
    for (const line of layout.lines) {
      expect(estimateTextWidth(line, layout.fontSize)).toBeLessThanOrEqual(box.w + 1);
    }
  });

  it('折行结果拼回去等于原文（不吞字）', () => {
    const long = 'MADE POSSIBLE BY YOUR TAXES AND EVERY VIEWER WHO EVER WATCHED THIS';
    const layout = fitTextLayout(long, box.w, box.h);
    expect(layout.lines.join(' ')).toBe(long);
  });

  it('中文按字折行，不出现空格拼接', () => {
    const zh = '本节目由绝对没有人在背后赞助播出感谢每一位看完的观众';
    const layout = fitTextLayout(zh, box.w, box.h);
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.join('')).toBe(zh);
  });

  it('场景输出多行 tspan，且每行都带 x/y', () => {
    const out = scene(makeState('MADE POSSIBLE BY YOUR TAXES AND EVERY SINGLE VIEWER OF THIS'), 0);
    expect(out).toContain('<tspan');
    expect((out.match(/<tspan/g) ?? []).length).toBeGreaterThan(1);
  });

  it('多行块垂直居中（不越过文本盒）', () => {
    const out = scene(makeState('MADE POSSIBLE BY YOUR TAXES AND EVERY SINGLE VIEWER OF THIS'), 0);
    const ys = [...out.matchAll(/<tspan[^>]*\by="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
    expect(ys.length).toBeGreaterThan(1);
    // 标题盒 y ∈ [0.10, 0.32] × 1080 = [108, 345.6]
    for (const y of ys) {
      expect(y).toBeGreaterThan(108);
      expect(y).toBeLessThan(346);
    }
  });
});
