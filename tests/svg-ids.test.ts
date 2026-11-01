import { describe, it, expect } from 'vitest';
import { isMonochromeSvg, scopeSvgIds, svgFillColors } from '../src/core/svg-ids';
import { scene } from '../src/core/scene';
import { sponsoredBy } from '../src/templates';
import type { SceneState } from '../src/core/types';

function makeState(icons: SceneState['icons'], iconSvgs: Record<string, string>): SceneState {
  return {
    template: sponsoredBy,
    locale: 'en',
    text: {},
    ratio: '1:1',
    rows: 1,
    speed: 1,
    icons,
    iconSvgs,
    palette: {},
  };
}

/** 真实 SVGL 片段：底色块 + 白色挖空（Behance 同构） */
const TWO_TONE =
  '<svg viewBox="0 0 32 32" fill="none"><g clip-path="url(#clip0_2_55)"><path d="M4 4h24v24H4z" fill="#000B1D"/><path d="M9 12h8v3H9z" fill="white"/></g><defs><clipPath id="clip0_2_55"><rect width="32" height="32" fill="white"/></clipPath></defs></svg>';

const MONO = '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z" fill="#181717"/></svg>';

describe('svg-ids：id 隔离', () => {
  it('给 id 与 url(#…) 引用加同一个前缀', () => {
    const out = scopeSvgIds('<g clip-path="url(#clip0_2_55)"><clipPath id="clip0_2_55"/></g>', 'behance');
    expect(out).toContain('id="behance__clip0_2_55"');
    expect(out).toContain('url(#behance__clip0_2_55)');
  });

  it('不同前缀互不干扰（同一文档里 90 个 logo 不打架）', () => {
    const a = scopeSvgIds(TWO_TONE, 'a');
    const b = scopeSvgIds(TWO_TONE, 'b');
    const idA = a.match(/id="([^"]+)"/)?.[1];
    const idB = b.match(/id="([^"]+)"/)?.[1];
    expect(idA).not.toBe(idB);
  });

  it('href="#x" 形式的引用同样被改写', () => {
    const out = scopeSvgIds('<use href="#s1"/><g id="s1"/>', 'x');
    expect(out).toContain('href="#x__s1"');
  });

  it('没有 id 的 SVG 原样返回（不做无谓改写）', () => {
    const plain = '<path d="M0 0h24v24H0z"/>';
    expect(scopeSvgIds(plain, 'k')).toBe(plain);
  });

  it('前缀里的非法字符被替换成下划线', () => {
    const out = scopeSvgIds('<g id="a"/>', 'simple-icons:github');
    expect(out).toContain('id="simple-icons_github__a"');
  });
});

describe('svg-ids：能不能染色', () => {
  it('无 fill 的单色标可染', () => {
    expect(isMonochromeSvg('<path d="M0 0h10v10H0z"/>')).toBe(true);
  });

  it('单一填充色可染（换背景要跟前景色）', () => {
    expect(isMonochromeSvg(MONO)).toBe(true);
    expect(svgFillColors(MONO)).toEqual(new Set(['#181717']));
  });

  it('底色 + 白色挖空**不可**染（染了就成实心块）', () => {
    expect(isMonochromeSvg(TWO_TONE)).toBe(false);
  });

  it('带渐变的不可染', () => {
    expect(isMonochromeSvg('<path fill="url(#paint0_radial_2_214)"/>')).toBe(false);
    expect(isMonochromeSvg('<path fill="#fff"/><path fill="url(#paint1)"/>')).toBe(false);
  });

  it('内联 style 的填充色也算数', () => {
    expect(svgFillColors('<path style="fill:#0C4B33"/>')).toEqual(new Set(['#0c4b33']));
  });
});

describe('scene：多色 logo 保留原样，单色 logo 跟随前景色', () => {
  it('双色 logo 的白色挖空不被填成前景色', () => {
    const out = scene(makeState([{ icon: 'svgl:behance' }], { 'svgl:behance': TWO_TONE }), 0);
    expect(out).toContain('fill="#000B1D"');
    expect(out).toContain('fill="white"');
  });

  it('单色 logo 被染成前景色（深底上仍可见）', () => {
    const out = scene(makeState([{ icon: 'svgl:mono' }], { 'svgl:mono': MONO }), 0);
    expect(out).toContain('fill="#111111"');
    expect(out).not.toContain('fill="#181717"');
  });

  it('同一 logo 重复出现时 id 不重复（重复的 mask/clip 会互相指错）', () => {
    const out = scene(makeState([{ icon: 'svgl:behance' }], { 'svgl:behance': TWO_TONE }), 0);
    const ids = [...out.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
