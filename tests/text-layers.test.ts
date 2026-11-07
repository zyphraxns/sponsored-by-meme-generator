import { describe, it, expect } from 'vitest';
import { createDefaultState } from '../src/app-state';
import { getTemplate } from '../src/templates';
import { scene } from '../src/core/scene';
import { decodeShare, encodeShare } from '../src/share-link';
import type { TextLayer } from '../src/core/types';

function textLayers(templateId: string): TextLayer[] {
  return getTemplate(templateId).layers.filter((l): l is TextLayer => l.type === 'text');
}

describe('第二文本层', () => {
  it('sponsored-by 有标题 + 副标题，no-sponsors 只有标题', () => {
    expect(textLayers('sponsored-by').map((l) => l.id)).toEqual(['title', 'subtitle']);
    expect(textLayers('made-by-gang').map((l) => l.id)).toEqual(['title', 'subtitle']);
    expect(textLayers('no-sponsors').map((l) => l.id)).toEqual(['title']);
  });

  it('副标题默认文案进入 SVG，且不画强调线', () => {
    const svg = scene(createDefaultState({ templateId: 'sponsored-by' }), 0);
    expect(svg).toContain('no budget, all vibes');
    // 副标题层 accent: false；sponsored-by 只有标题下方那一根强调线
    const accentLines = svg.match(/height="[0-9.]+" fill="#[0-9a-f]{6}"\/>/g) ?? [];
    expect(accentLines.length).toBe(1);
  });

  it('用户覆盖副标题后进入 SVG（中英各走各的）', () => {
    const state = createDefaultState({
      templateId: 'sponsored-by',
      text: { subtitle: { zh: '零预算，全靠热爱' } },
      locale: 'zh',
    });
    expect(scene(state, 0)).toContain('零预算，全靠热爱');
  });
});

describe('透明背景', () => {
  it('透明时不画背景矩形，不透明时画', () => {
    const opaque = scene(createDefaultState({ templateId: 'sponsored-by' }), 0);
    const clear = scene(
      { ...createDefaultState({ templateId: 'sponsored-by' }), transparentBg: true },
      0,
    );
    expect(opaque).toContain('fill="#f5f3ee"');
    expect(clear).not.toContain('fill="#f5f3ee"');
  });

  it('分享链接往返保留副标题与透明开关', () => {
    const link = encodeShare({
      templateId: 'sponsored-by',
      text: { title: { en: 'SPONSORED BY' }, subtitle: { en: '@handle' } },
      transparentBg: true,
    });
    const out = decodeShare(link);
    expect(out?.text?.subtitle?.en).toBe('@handle');
    expect(out?.transparentBg).toBe(true);
  });

  it('分享链接里非布尔 true 的 tb 被丢弃', () => {
    const hash = `#${encodeURIComponent(JSON.stringify({ t: 'sponsored-by', tb: '1' }))}`;
    expect(decodeShare(hash)?.transparentBg).toBeUndefined();
  });
});
