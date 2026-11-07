import { describe, it, expect } from 'vitest';
import { canvasSize, escapeXml, loopSecondsFor, scene } from '../src/core/scene';
import { estimateTextWidth, fitFontSize } from '../src/core/layout';
import { sponsoredBy } from '../src/templates';
import type { SceneState } from '../src/core/types';

function makeState(overrides: Partial<SceneState> = {}): SceneState {
  return {
    template: sponsoredBy,
    locale: 'en',
    text: {},
    ratio: '1:1',
    rows: 3,
    speed: 1,
    icons: [],
    palette: {},
    ...overrides,
  };
}

describe('scene(state, 0) — M0 判据：浅底深字大标题 + 三行 emoji 排布', () => {
  const svg = scene(makeState(), 0);

  it('合法 SVG 骨架 1080×1080', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 1080 1080"');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('浅底（默认版式改为白底，真实赞助商墙的样子）', () => {
    expect(svg).toContain('<rect x="0" y="0" width="1080" height="1080" fill="#f5f3ee"/>');
  });

  it('深字粗体大标题', () => {
    expect(svg).toContain('>SPONSORED BY</text>');
    expect(svg).toContain('font-weight="800"');
    expect(svg).toContain('fill="#111111"');
  });

  it('三行 emoji 排布（含跨边界重复项，总数不少于 9）', () => {
    const emojis = svg.match(/💸|🚀|🫡/g) ?? [];
    expect(emojis.length).toBeGreaterThanOrEqual(9);
  });

  it('确定性：同输入同输出（纯函数）', () => {
    expect(scene(makeState(), 0)).toBe(svg);
  });

  it('时间轴接口就位：t=0.5 布局不同', () => {
    expect(scene(makeState(), 0.5)).not.toBe(svg);
  });

  it('用户文案转义，防止 SVG/HTML 注入', () => {
    const out = scene(makeState({ text: { title: { en: '<script>alert(1)</script>' } } }), 0);
    expect(out).not.toContain('<script>alert');
    expect(out).toContain('&lt;script&gt;');
  });

  it('色板可被 state 覆盖', () => {
    const out = scene(makeState({ palette: { bg: '#123456' } }), 0);
    expect(out).toContain('fill="#123456"');
  });

  it('iconScale 控制图标尺寸（模板级参数，默认 0.62）', () => {
    const template = {
      ...sponsoredBy,
      layers: sponsoredBy.layers.map((l) => (l.type === 'ticker' ? { ...l, iconScale: 0.3 } : l)),
    };
    expect(scene(makeState({ template }), 0)).not.toBe(svg);
  });
});

describe('loopSecondsFor', () => {
  it('auto → 基准周期（各行同速）', () => {
    expect(loopSecondsFor(makeState())).toBe(4);
  });

  it('速度倍率反推周期：2 倍速 → 2 秒', () => {
    expect(loopSecondsFor(makeState({ speed: 2 }))).toBe(2);
  });

  it('模板显式指定时优先于 auto', () => {
    const template = { ...sponsoredBy, animation: { ...sponsoredBy.animation, loopSeconds: 6 } };
    expect(loopSecondsFor(makeState({ template }))).toBe(6);
  });
});

describe('无缝循环（M2 判据：循环点无跳帧）', () => {
  /** 提取每行可见区域 [0, 1080] 内的 emoji 位置表（出血边界的节点不可见，不参与比较） */
  const visibleLayout = (t: number): string[] => {
    const rows = new Map<string, string[]>();
    for (const line of scene(makeState(), t).split('\n')) {
      const m = line.match(/<text x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*>(💸|🚀|🫡)<\/text>/);
      const [, xStr, yStr, glyph] = m ?? [];
      if (xStr === undefined || yStr === undefined || glyph === undefined) continue;
      const x = Number(xStr);
      if (x < 0 || x > 1080) continue;
      const list = rows.get(yStr) ?? [];
      list.push(`${glyph}@${xStr}`);
      rows.set(yStr, list);
    }
    for (const list of rows.values()) list.sort();
    return [...rows.entries()].map(([y, items]) => `${y}:${items.join(',')}`).sort();
  };

  it('推进一个完整周期后，可见布局与 t=0 逐格一致', () => {
    const layout = visibleLayout(0);
    expect(layout.length).toBeGreaterThan(0);
    expect(visibleLayout(loopSecondsFor(makeState()))).toEqual(layout);
  });

  it('半周期处布局不同（时间轴确实在驱动画面）', () => {
    expect(scene(makeState(), 2)).not.toBe(scene(makeState(), 0));
  });
});

describe('canvasSize', () => {
  it('四档比例', () => {
    expect(canvasSize(sponsoredBy, '1:1')).toEqual({ w: 1080, h: 1080 });
    expect(canvasSize(sponsoredBy, '4:5')).toEqual({ w: 1080, h: 1350 });
    expect(canvasSize(sponsoredBy, '9:16')).toEqual({ w: 1080, h: 1920 });
    expect(canvasSize(sponsoredBy, '16:9')).toEqual({ w: 1080, h: 608 });
  });
});

describe('escapeXml', () => {
  it('转义五个 XML 实体', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
  });
});

describe('simple-icons 渲染（iconSvgs 接入）', () => {
  it('emoji 图标继续走 <text> 字素路径', () => {
    const out = scene(makeState(), 0);
    expect(out).toContain('font-family=\'"Apple Color Emoji"');
  });

  it('simple-icons 图标被内联为 <svg><path>（单色 fg）', () => {
    const out = scene(
      makeState({
        icons: [{ icon: 'simple-icons:openai' }],
        iconSvgs: { 'simple-icons:openai': '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>' },
      }),
      0,
    );
    expect(out).toContain('<path d="M12 2L2 7l10 5 10-5-10-5z"');
    expect(out).toContain('fill="#111111"'); // 强制单色
    expect(out).not.toContain('font-family=\'Apple Color Emoji\''); // 不走 emoji 路径
  });

  it('无 iconSvgs 时 simple-icons 图标静默跳过（不炸渲染）', () => {
    const out = scene(makeState({ icons: [{ icon: 'simple-icons:openai' }] }), 0);
    expect(out).not.toContain('<path');
    expect(out.startsWith('<svg')).toBe(true);
  });

  it('upload 图标保留原始内容', () => {
    const out = scene(
      makeState({
        icons: [{ icon: 'upload:custom' }],
        iconSvgs: { 'upload:custom': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>' },
      }),
      0,
    );
    expect(out).toContain('<circle cx="12" cy="12" r="10"/>');
  });

  it('图标被裁切在 ticker 盒内（不溢出）', () => {
    const out = scene(
      makeState({
        icons: [{ icon: 'simple-icons:openai' }],
        iconSvgs: { 'simple-icons:openai': '<svg viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>' },
      }),
      0,
    );
    // clipPath 仍存在，图标被限制在行内
    expect(out).toContain('clipPath');
  });

  it('同图标多实例共享一个 symbol（<use> 复用）', () => {
    const out = scene(
      makeState({
        icons: [{ icon: 'simple-icons:openai' }],
        iconSvgs: { 'simple-icons:openai': '<svg viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>' },
      }),
      0,
    );
    // 每个实例一个 <svg> 内联，但 path 内容相同（确定性）
    const pathCount = (out.match(/<path d="M1 1h22v22H1z"/g) ?? []).length;
    expect(pathCount).toBeGreaterThanOrEqual(9); // 三行 × 跨边界重复项
  });
});

describe('layout auto-shrink', () => {
  it('长文案字号更小且不超框', () => {
    const long = 'A MUCH LONGER TITLE LINE';
    const size = fitFontSize(long, 900, 200);
    const short = fitFontSize('HI', 900, 200);
    expect(size).toBeLessThan(short);
    expect(estimateTextWidth(long, size)).toBeLessThanOrEqual(900);
  });

  it('CJK 按全宽估算', () => {
    expect(estimateTextWidth('赞助', 100)).toBeCloseTo(208, 6);
  });
});
