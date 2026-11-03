import { describe, it, expect } from 'vitest';
import { decodeShare, encodeShare } from '../src/share-link';
import { randomOption } from '../src/random-gen';
import { aliasedBrandIds } from '../src/core/brand-aliases';

describe('分享链接：文案必须能往返', () => {
  it('两层结构（版式层 id → 语言）原样还原', () => {
    const encoded = encodeShare({
      templateId: 'sponsored-by',
      locale: 'en',
      text: { title: { en: 'BROUGHT TO YOU BY NOBODY' } },
      rows: 5,
      speed: 1,
    });
    const decoded = decodeShare(encoded);
    expect(decoded?.text).toEqual({ title: { en: 'BROUGHT TO YOU BY NOBODY' } });
    expect(decoded?.rows).toBe(5);
  });

  // 2026-11-01 的 bug：过滤条件只留 string，嵌套文案被整段丢成 {}，
  // 分享出去的卡片标题永远是模板默认值。
  it('不再把嵌套文案过滤成空对象（回归）', () => {
    const decoded = decodeShare('#{"tx":{"title":{"en":"HELLO","zh":"你好"}}}');
    expect(decoded?.text).toEqual({ title: { en: 'HELLO', zh: '你好' } });
    expect(Object.keys(decoded?.text ?? {})).toHaveLength(1);
  });

  it('兼容更早的扁平链接（{en: …}）', () => {
    const decoded = decodeShare('#{"tx":{"en":"OLD FORMAT"}}');
    expect(decoded?.text).toEqual({ title: { en: 'OLD FORMAT' } });
  });

  it('空文案不产生空条目', () => {
    const decoded = decodeShare('#{"tx":{"title":{"en":""}}}');
    expect(decoded?.text).toBeUndefined();
  });

  it('平台预设随链接走（收链接的人看到同样的上限）', () => {
    const decoded = decodeShare(encodeShare({ templateId: 'sponsored-by', platform: 'x' }));
    expect(decoded?.platform).toBe('x');
  });

  it('「符号 + 字标」开关随链接 / 草稿往返', () => {
    const decoded = decodeShare(encodeShare({ templateId: 'sponsored-by', logoWithSymbol: true }));
    expect(decoded?.logoWithSymbol).toBe(true);
  });
});

describe('随机生成器', () => {
  it('文案写进真实的版式层结构（不再是扁平的 {语言: 文本}）', () => {
    for (let i = 0; i < 20; i++) {
      const r = randomOption('en');
      const text = r.text as Record<string, Record<string, string>>;
      expect(Object.keys(text)).toEqual(['title']);
      const val = text.title?.[r.locale as string];
      expect(typeof val).toBe('string');
      expect((val ?? '').length).toBeGreaterThan(0);
    }
  });

  it('速度是 0.05 步长的有理数（否则页脚会印出 3.522222222222222）', () => {
    for (let i = 0; i < 20; i++) {
      const speed = randomOption('zh').speed ?? 1;
      expect(Math.round(speed * 20)).toBeCloseTo(speed * 20, 6);
    }
  });
});

describe('品牌中文别名', () => {
  it('常见中文名能映射到 slug', () => {
    expect(aliasedBrandIds('苹果')).toContain('apple');
    expect(aliasedBrandIds('英伟达')).toContain('nvidia');
    expect(aliasedBrandIds('哔哩哔哩')).toContain('bilibili');
  });

  it('包含式输入也能命中（苹果公司）', () => {
    expect(aliasedBrandIds('苹果公司')).toContain('apple');
  });

  it('英文输入不会被别名表干扰', () => {
    expect(aliasedBrandIds('github')).toEqual([]);
  });
});
