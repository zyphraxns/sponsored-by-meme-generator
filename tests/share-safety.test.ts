import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { decodeShare, encodeShare, sanitizeTickerItems } from '../src/share-link';
import { createDefaultState } from '../src/app-state';
import { loadDraft } from '../src/draft';

/** 草稿模块内部的存储 key（与 src/draft.ts 保持一致） */
const DRAFT_KEY = 'sponsored-by:draft:v1';

/** 把任意对象编成分享链接，避免手写转义引号时出错 */
function hashOf(payload: unknown): string {
  return '#' + encodeURIComponent(JSON.stringify(payload));
}

function installLocalStorage(): void {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  });
}

describe('分享链接：非法 / 篡改输入一律回退到安全值', () => {
  it('未知模板被丢弃，不会抛异常', () => {
    expect(() => decodeShare(hashOf({ t: '../../etc/passwd' }))).not.toThrow();
    const decoded = decodeShare(hashOf({ t: '../../etc/passwd' }));
    expect(decoded?.templateId).toBeUndefined();
  });

  it('合法模板配未知变体时只保留模板', () => {
    const decoded = decodeShare(hashOf({ t: 'sponsored-by', v: 'not-a-variant' }));
    expect(decoded?.templateId).toBe('sponsored-by');
    expect(decoded?.variantId).toBeUndefined();
  });

  it('变体必须属于该模板（跨模板的变体 id 不认）', () => {
    const decoded = decodeShare(hashOf({ t: 'sponsored-by', v: 'made-by-friends' }));
    expect(decoded?.templateId).toBe('sponsored-by');
    expect(decoded?.variantId).toBeUndefined();
  });

  it('非法 locale / ratio 被丢弃', () => {
    const decoded = decodeShare(hashOf({ t: 'sponsored-by', l: 'de', r: '21:9' }));
    expect(decoded?.locale).toBeUndefined();
    expect(decoded?.ratio).toBeUndefined();
  });

  it('rows 越界被钳制到 1–12，而不是原样透传', () => {
    expect(decodeShare(hashOf({ rows: -5 }))?.rows).toBe(1);
    expect(decodeShare(hashOf({ rows: 0.4 }))?.rows).toBe(1);
    expect(decodeShare(hashOf({ rows: 12.6 }))?.rows).toBe(12);
    expect(decodeShare(hashOf({ rows: 1e9 }))?.rows).toBe(12);
  });

  it('rows 不是有限数字时整项丢弃', () => {
    expect(decodeShare(hashOf({ rows: '3' }))?.rows).toBeUndefined();
    expect(decodeShare(hashOf({ rows: null }))?.rows).toBeUndefined();
  });

  it('speed 越界被钳制到 0.5–2，并量化到 0.05 步长', () => {
    expect(decodeShare(hashOf({ s: 0.01 }))?.speed).toBe(0.5);
    expect(decodeShare(hashOf({ s: 3 }))?.speed).toBe(2);
    expect(decodeShare(hashOf({ s: 1.234 }))?.speed).toBe(1.25);
    expect(decodeShare(hashOf({ s: '1.5' }))?.speed).toBeUndefined();
  });

  it('颜色字段里的注入串被丢弃，合法颜色保留', () => {
    const decoded = decodeShare(
      hashOf({ pal: { bg: '#fff" onload=alert(1)', fg: '#123456' } }),
    );
    expect(decoded?.palette).toEqual({ fg: '#123456' });
    expect(JSON.stringify(decoded)).not.toContain('onload');
  });

  it('只认 #RGB / #RRGGBB：3 位扩展成 6 位并转小写', () => {
    expect(decodeShare(hashOf({ pal: { bg: '#ABC', fg: ' #A1B2C3 ' } }))?.palette).toEqual({
      bg: '#aabbcc',
      fg: '#a1b2c3',
    });
    for (const bad of ['#abcd', 'red', '#fff; background:url(x)', 'rgb(0,0,0)', '#12345']) {
      expect(decodeShare(hashOf({ pal: { bg: bad } }))?.palette).toBeUndefined();
    }
  });

  it('__proto__ / constructor / prototype 文案键被忽略，且不污染原型', () => {
    const decoded = decodeShare(
      hashOf({
        tx: {
          // 计算属性才能生成真正的 own property（对象字面量的 __proto__ 会改原型）
          ['__proto__']: { en: 'POLLUTED' },
          constructor: { prototype: { polluted: true } },
          prototype: { en: 'POLLUTED' },
          title: { en: 'SAFE', zh: '安全' },
        },
      }),
    );
    expect(decoded?.text).toEqual({ title: { en: 'SAFE', zh: '安全' } });
    expect(({} as Record<string, unknown>).en).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('超长文案层 id 与非对象文案值被忽略', () => {
    const decoded = decodeShare(
      hashOf({ tx: { ['a'.repeat(65)]: { en: 'TOO LONG' }, title: 42, ok: null } }),
    );
    expect(decoded?.text).toBeUndefined();
  });

  it('损坏的 JSON / 非对象根节点返回 null，不抛异常', () => {
    expect(() => decodeShare('#{%zz')).not.toThrow();
    expect(decodeShare('#{%zz')).toBeNull();
    expect(decodeShare('#null')).toBeNull();
    expect(decodeShare('#[1,2]')).toBeNull();
    expect(decodeShare('#')).toBeNull();
  });

  it('图标白名单：非法前缀、超长内容、超长 label、异常相位都丢弃', () => {
    const items = sanitizeTickerItems([
      { icon: 'javascript:alert(1)' },
      { icon: 'https://evil.example/logo.svg' },
      { icon: `emoji:${'x'.repeat(201)}` },
      { icon: 'emoji:💸', label: 'y'.repeat(161), phase: 1000 },
      { icon: 'simple-icons:openai', label: 'OpenAI', phase: 0.5, speed: 1.5 },
    ]);
    expect(items).toEqual([
      { icon: 'emoji:💸' },
      { icon: 'simple-icons:openai', label: 'OpenAI', phase: 0.5, speed: 1.5 },
    ]);
  });

  it('sanitizeTickerItems 对非数组输入返回 undefined', () => {
    expect(sanitizeTickerItems(null)).toBeUndefined();
    expect(sanitizeTickerItems({ icon: 'emoji:💸' })).toBeUndefined();
    expect(sanitizeTickerItems('emoji:💸')).toBeUndefined();
  });

  it('分享链接丢弃 upload: 图标（上传内容不随 URL 走）', () => {
    const decoded = decodeShare(hashOf({ i: [{ icon: 'upload:mine.svg' }, { icon: 'emoji:💸' }] }));
    expect(decoded?.icons).toEqual([{ icon: 'emoji:💸' }]);
  });

  it('整条链接的解码结果不含脚本片段', () => {
    const decoded = decodeShare(
      hashOf({
        t: '<script>alert(1)</script>',
        pal: { bg: '#fff" onload=alert(1)' },
        i: [{ icon: 'javascript:alert(1)' }],
      }),
    );
    const serialized = JSON.stringify(decoded).toLowerCase();
    for (const fragment of ['onload', 'javascript:', '<script']) {
      expect(serialized).not.toContain(fragment);
    }
  });
});

describe('分享链接：合法参数往返', () => {
  it('完整合法参数能原样恢复（上传项除外）', () => {
    const input = {
      templateId: 'sponsored-by',
      variantId: 'made-possible',
      locale: 'zh' as const,
      ratio: '4:5' as const,
      platform: 'x' as const,
      icons: [
        { icon: 'emoji:💸' },
        { icon: 'simple-icons:openai', label: 'OpenAI', phase: 0.25, speed: 1.5 },
        { icon: 'svgl:github', label: 'GitHub' },
        { icon: 'upload:mine.svg' },
      ],
      text: { title: { en: 'HI', zh: '你好' } },
      palette: { bg: '#ABC', fg: '#123456' },
      rows: 5,
      speed: 1.25,
      logoWithSymbol: true,
    };
    const decoded = decodeShare(encodeShare(input));
    expect(decoded).toEqual({
      templateId: 'sponsored-by',
      variantId: 'made-possible',
      locale: 'zh',
      ratio: '4:5',
      platform: 'x',
      icons: input.icons.slice(0, 3),
      text: { title: { en: 'HI', zh: '你好' } },
      palette: { bg: '#aabbcc', fg: '#123456' },
      rows: 5,
      speed: 1.25,
      logoWithSymbol: true,
    });
  });

  it('9:16 在分享编码中往返，不会回落成 1:1', () => {
    expect(decodeShare(encodeShare({ ratio: '9:16' }))?.ratio).toBe('9:16');
    expect(decodeShare(hashOf({ r: '9:16' }))?.ratio).toBe('9:16');
  });

  it('未知平台预设被丢弃，其余字段不受影响', () => {
    const decoded = decodeShare(encodeShare({ templateId: 'made-by-gang', platform: 'myspace' as never }));
    expect(decoded?.templateId).toBe('made-by-gang');
    expect(decoded?.platform).toBeUndefined();
  });
});

describe('草稿清洗：与分享链接共用同一套白名单', () => {
  beforeEach(installLocalStorage);
  afterEach(() => vi.unstubAllGlobals());

  it('草稿里的脏配色 / 未知模板 / 越界 rows / 注入串被清洗', () => {
    const dirtyShare = hashOf({
      t: 'evil-template',
      pal: { bg: '#fff" onload=alert(1)', fg: 'red' },
      rows: 999,
      s: 9,
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, s: dirtyShare }));

    const draft = loadDraft();
    expect(draft?.state.templateId).toBeUndefined();
    expect(draft?.state.palette).toBeUndefined();
    expect(draft?.state.rows).toBe(12);
    expect(draft?.state.speed).toBe(2);
  });

  it('旧格式草稿（裸分享串）走同样的清洗规则', () => {
    localStorage.setItem(DRAFT_KEY, hashOf({ pal: { bg: 'javascript:alert(1)' }, r: '21:9' }));
    const draft = loadDraft();
    expect(draft?.state.palette).toBeUndefined();
    expect(draft?.state.ratio).toBeUndefined();
  });

  it('草稿里的脏 icons 经过 sanitizeTickerItems 后只剩合法项（upload: 在草稿中保留）', () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 1,
        s: hashOf({ t: 'sponsored-by' }),
        i: [
          { icon: 'javascript:alert(1)' },
          { icon: 'upload:mine.svg', label: 'Mine' },
          { icon: 'emoji:💸' },
        ],
      }),
    );
    const draft = loadDraft();
    expect(sanitizeTickerItems(draft?.icons)).toEqual([
      { icon: 'upload:mine.svg', label: 'Mine' },
      { icon: 'emoji:💸' },
    ]);
  });

  it('草稿内容损坏 / 缺少分享编码时返回 null', () => {
    localStorage.setItem(DRAFT_KEY, '{not json');
    expect(loadDraft()).toBeNull();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1 }));
    expect(loadDraft()).toBeNull();
  });

  it('localStorage 读取抛异常时返回 null，不拖垮页面', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage denied');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    });
    expect(loadDraft()).toBeNull();
  });
});

describe('app-state：解码结果回退到默认态', () => {
  it('未知模板 / 非法比例解码为空后，默认态仍可构建', () => {
    const decoded = decodeShare(hashOf({ t: '__bad__', r: '21:9' })) ?? {};
    const state = createDefaultState(decoded);
    expect(state.template.id).toBe('sponsored-by');
    expect(state.ratio).toBe('1:1');
    expect(state.rows).toBe(3);
    expect(state.speed).toBe(1);
  });

  it('合法解码结果能落到默认态上', () => {
    const state = createDefaultState(
      decodeShare(hashOf({ t: 'made-by-gang', v: 'made-by-friends', r: '16:9', rows: 7, s: 1.5 })) ?? {},
    );
    expect(state.template.id).toBe('made-by-gang');
    const title = state.template.layers.find((l) => l.id === 'title');
    expect(title && 'default' in title ? title.default.en : undefined).toBe('MADE BY FRIENDS');
    expect(state.ratio).toBe('16:9');
    expect(state.rows).toBe(7);
    expect(state.speed).toBe(1.5);
  });
});
