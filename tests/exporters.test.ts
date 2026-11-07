import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scene } from '../src/core/scene';
import { svgForRaster, svgForFile, notoSlicesFor } from '../src/exporters/fonts';
import { exportFilename, slugifyTitle } from '../src/exporters/filename';
import { svgToDataUri } from '../src/exporters/png';
import { pngFilename, svgFileContent, svgFilename, svgToBlob } from '../src/exporters/svg';
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
const svg = scene(state, 0);

describe('svgForRaster', () => {
  it('在根 <svg> 开标签后注入 @font-face', async () => {
    const out = await svgForRaster(svg);
    expect(out.startsWith('<svg')).toBe(true);
    expect(out).toContain('@font-face');
    expect(out).toContain("font-family:'Inter'");
    expect(out).toContain('font-weight:800');
  });

  it('内嵌 data-URI woff2（跨设备一致的关键）', async () => {
    expect(await svgForRaster(svg)).toContain('data:font/woff2;base64,');
  });

  it('保留原始场景内容且更长', async () => {
    const out = await svgForRaster(svg);
    expect(out).toContain('SPONSORED BY');
    expect(out).toContain('</svg>');
    expect(out.length).toBeGreaterThan(svg.length);
  });

  it('确定性：同输入同输出', async () => {
    expect(await svgForRaster(svg)).toBe(await svgForRaster(svg));
  });

  it('非 SVG 输入原样返回', async () => {
    expect(await svgForRaster('not an svg')).toBe('not an svg');
  });

  it('英文文本不选任何中文切片（不白背中文字体）', async () => {
    const out = await svgForRaster(svg, ['SPONSORED BY']);
    expect(notoSlicesFor(['SPONSORED BY'])).toEqual([]);
    expect(out.match(/data:font\/woff2;base64,/g)?.length).toBe(1); // 仅 Inter
  });

  it('中文文本选出的切片非空且只含 CJK 命中项', () => {
    const slices = notoSlicesFor(['由以下品牌赞助']);
    expect(slices.length).toBeGreaterThan(0);
    expect(slices.every((s) => s.file.startsWith('noto-sans-sc-'))).toBe(true);
  });
});

describe('svgForFile', () => {
  it('CDN 引用而非内嵌字节', () => {
    const out = svgForFile(svg);
    expect(out).toContain('https://cdn.jsdelivr.net/npm/@fontsource/inter@5.3.0/');
    expect(out).not.toContain('data:font/woff2;base64,');
  });

  it('中文文本追加 Noto CDN 切片（带 unicode-range）', () => {
    const out = svgForFile(svg, ['由以下品牌赞助']);
    expect(out).toContain('cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.3.1/');
    expect(out).toContain('unicode-range:');
    expect(out.match(/@font-face/g)?.length).toBeGreaterThan(1);
  });
});

describe('svgFileContent', () => {
  it('带 XML 声明', async () => {
    expect((await svgFileContent(state, 0)).startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});

describe('svgToDataUri', () => {
  it('中文安全（encodeURIComponent 路线，拒绝 btoa）', () => {
    const uri = svgToDataUri('<svg>由以下品牌赞助</svg>');
    const prefix = 'data:image/svg+xml;charset=utf-8,';
    expect(uri.startsWith(prefix)).toBe(true);
    expect(decodeURIComponent(uri.slice(prefix.length))).toBe('<svg>由以下品牌赞助</svg>');
  });
});

describe('filenames', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('标题 slug + 日期 + 画布尺寸', () => {
    expect(pngFilename(state)).toBe('sponsored-by-2026-11-07-1080x1080.png');
    expect(svgFilename(state)).toBe('sponsored-by-2026-11-07-1080x1080.svg');
  });

  it('16:9 尺寸进文件名', () => {
    expect(pngFilename({ ...state, ratio: '16:9' })).toBe('sponsored-by-2026-11-07-1080x608.png');
  });

  it('中文标题保留汉字，只有符号时回落到模板 id', () => {
    expect(slugifyTitle('由以下品牌赞助')).toBe('由以下品牌赞助');
    expect(slugifyTitle('  💸💸  ')).toBe('sponsored-by');
    expect(slugifyTitle('Hello, World!')).toBe('hello-world');
    const filename = exportFilename(
      { ...state, text: { title: { zh: '由以下品牌赞助' } }, locale: 'zh' },
      'gif',
      new Date(2026, 10, 7),
    );
    expect(filename).toBe('由以下品牌赞助-2026-11-07-1080x1080.gif');
  });

  it('超长标题按码点截断，不留尾部连字符', () => {
    const slug = slugifyTitle('a'.repeat(60));
    expect(slug.length).toBe(48);
  });
});

describe('svgToBlob', () => {
  it('正确的 MIME', () => {
    expect(svgToBlob('<svg/>').type).toBe('image/svg+xml;charset=utf-8');
  });
});
