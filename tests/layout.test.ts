import { describe, it, expect } from 'vitest';
import { estimateTextWidth, fitTextLayout, MIN_READABLE_RATIO } from '../src/core/layout';
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

describe('手动换行与自动折行共存', () => {
  it('输入换行符成为硬换行', () => {
    const layout = fitTextLayout('FIRST LINE\nSECOND LINE', box.w, box.h);
    expect(layout.lines).toEqual(['FIRST LINE', 'SECOND LINE']);
  });

  it('CRLF 也识别为硬换行', () => {
    expect(fitTextLayout('A\r\nB', box.w, box.h).lines).toEqual(['A', 'B']);
  });

  it('末尾换行不产生多余空行', () => {
    expect(fitTextLayout('A\nB\n', box.w, box.h).lines).toEqual(['A', 'B']);
  });

  it('硬换行的每个片段内部仍继续自动折行', () => {
    const first = 'THIS SEGMENT IS LONG ENOUGH THAT IT CANNOT FIT ON ONE LINE INSIDE THE BOX';
    const layout = fitTextLayout(`${first}\nSHORT`, box.w, box.h);

    expect(layout.lines.length).toBeGreaterThan(2);
    expect(layout.lines[layout.lines.length - 1]).toBe('SHORT');
    // 被折开的第一段拼回去仍是原文（不吞字）
    expect(layout.lines.slice(0, -1).join(' ')).toBe(first);
    for (const line of layout.lines) {
      expect(estimateTextWidth(line, layout.fontSize)).toBeLessThanOrEqual(box.w + 1);
    }
  });

  it('无换行文本仍走原来的自动折行结果', () => {
    const layout = fitTextLayout('SPONSORED BY', box.w, box.h);
    expect(layout.lines).toEqual(['SPONSORED BY']);
    expect(layout.fontSize).toBeGreaterThan(0);
  });

  it('场景输出把硬换行渲染成独立 tspan', () => {
    const out = scene(makeState('FIRST\nSECOND'), 0);
    expect(out).toContain('>FIRST</tspan>');
    expect(out).toContain('>SECOND</tspan>');
  });
});

describe('超长标题的可读溢出信号', () => {
  it('短标题：未压缩、无溢出', () => {
    const layout = fitTextLayout('HI', box.w, box.h);
    expect(layout.fontSize).toBe(box.h);
    expect(layout.compressed).toBe(false);
    expect(layout.scale).toBe(1);
    expect(layout.overflow).toBe(false);
  });

  it('行数太多、压到可读下限以下时给出 overflow', () => {
    const many = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'].join('\n');
    const layout = fitTextLayout(many, box.w, box.h);

    expect(layout.lines).toHaveLength(8);
    expect(layout.compressed).toBe(true);
    expect(layout.scale).toBeLessThan(MIN_READABLE_RATIO);
    expect(layout.overflow).toBe(true);
    expect(layout.scale).toBeCloseTo(layout.fontSize / box.h, 5);
  });

  it('单行超长且无处折行时也给出 overflow，不再静默缩到 8px 了事', () => {
    const layout = fitTextLayout('X'.repeat(4000), box.w, box.h);
    expect(layout.fontSize).toBe(8);
    expect(layout.scale).toBeLessThan(MIN_READABLE_RATIO);
    expect(layout.overflow).toBe(true);
  });
});
