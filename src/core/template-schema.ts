/**
 * 模板运行时校验（SPEC §7 的代码化身）。
 *
 * 为什么不用 JSON Schema 库：模板是社区贡献的主战场（SPEC §8），
 * 错误信息必须指到具体路径（layers[1].items[0].icon），ajv 的默认报错对贡献者不友好；
 * 且字段集很小，手写校验约 120 行，零依赖。
 *
 * 约定：校验通过返回强类型 Template；任何不满足抛 TemplateError（带路径）。
 */
import type { Layer, Locale, Ratio, Template, TextLayer, TickerItem } from './types';

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

const RATIOS: Ratio[] = ['1:1', '4:5', '9:16', '16:9'];
const LOCALES: Locale[] = ['en', 'zh'];
const HEX = /^#[0-9a-f]{6}$/i;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(path: string, msg: string): never {
  throw new TemplateError(`模板校验失败 @ ${path}: ${msg}`);
}

function wantString(v: unknown, path: string, opts: { min?: number } = {}): string {
  if (typeof v !== 'string' || (opts.min !== undefined && v.trim().length < opts.min)) {
    fail(path, `期望非空字符串，实际 ${JSON.stringify(v)}`);
  }
  return v;
}

function wantNumber(v: unknown, path: string, range?: [number, number]): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, `期望有限数字，实际 ${JSON.stringify(v)}`);
  if (range && (v < range[0] || v > range[1])) {
    fail(path, `期望 ${range[0]}~${range[1]}，实际 ${v}`);
  }
  return v;
}

function wantBoolean(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, `期望布尔，实际 ${JSON.stringify(v)}`);
  return v;
}

function wantLocaleMap(v: unknown, path: string): Record<Locale, string> {
  if (!isRecord(v)) fail(path, '期望 { en, zh } 对象');
  const out = {} as Record<Locale, string>;
  for (const l of LOCALES) {
    out[l] = wantString(v[l], `${path}.${l}`, { min: 1 });
  }
  return out;
}

function wantBox(v: unknown, path: string): [number, number, number, number] {
  if (!Array.isArray(v) || v.length !== 4) fail(path, '期望 [x, y, w, h] 四元组');
  return v.map((n, i) => wantNumber(n, `${path}[${i}]`, [0, 1])) as [number, number, number, number];
}

function wantItem(v: unknown, path: string): TickerItem {
  if (!isRecord(v)) fail(path, '期望图标项对象');
  const item: TickerItem = { icon: wantString(v.icon, `${path}.icon`, { min: 1 }) };
  if (v.phase !== undefined) item.phase = wantNumber(v.phase, `${path}.phase`);
  if (v.speed !== undefined) item.speed = wantNumber(v.speed, `${path}.speed`, [0.01, 16]);
  return item;
}

function wantLayer(v: unknown, path: string): Layer {
  if (!isRecord(v)) fail(path, '期望图层对象');
  const type = v.type;
  if (type === 'text') {
    // 字体/适应/对齐当前仅支持单一实现：模板写了别的值 = 响亮失败，而不是静默忽略
    if (v.font !== undefined && v.font !== 'display') fail(`${path}.font`, `仅支持 'display'，实际 ${JSON.stringify(v.font)}`);
    if (v.fit !== undefined && v.fit !== 'auto-shrink') {
      fail(`${path}.fit`, `仅支持 'auto-shrink'，实际 ${JSON.stringify(v.fit)}`);
    }
    if (v.align !== undefined && v.align !== 'center') {
      fail(`${path}.align`, `仅支持 'center'，实际 ${JSON.stringify(v.align)}`);
    }
    const layer: TextLayer = {
      type: 'text',
      id: wantString(v.id, `${path}.id`, { min: 1 }),
      default: wantLocaleMap(v.default, `${path}.default`),
      font: 'display',
      fit: 'auto-shrink',
      box: wantBox(v.box, `${path}.box`),
      align: 'center',
    };
    // 可选的表现层字段：只接受明确写出的值，缺省由渲染端 decide（标题 800 / 无字距 / 有强调线）
    if (v.label !== undefined) layer.label = wantLocaleMap(v.label, `${path}.label`);
    if (v.accent !== undefined) {
      if (typeof v.accent !== 'boolean') fail(`${path}.accent`, '期望布尔值');
      layer.accent = v.accent;
    }
    if (v.weight !== undefined) layer.weight = wantNumber(v.weight, `${path}.weight`, [100, 900]);
    if (v.letterSpacing !== undefined) {
      layer.letterSpacing = wantNumber(v.letterSpacing, `${path}.letterSpacing`, [-0.1, 0.5]);
    }
    return layer;
  }
  if (type === 'ticker') {
    const items = v.items;
    if (!Array.isArray(items) || items.length === 0) fail(`${path}.items`, '期望非空数组');
    const ticker: Extract<Layer, { type: 'ticker' }> = {
      type: 'ticker',
      id: wantString(v.id, `${path}.id`, { min: 1 }),
      rows: wantNumber(v.rows, `${path}.rows`, [1, 12]),
      box: wantBox(v.box, `${path}.box`),
      gap: wantNumber(v.gap, `${path}.gap`, [0, 4]),
      phaseJitter: wantNumber(v.phaseJitter, `${path}.phaseJitter`, [-4, 4]),
      speedJitter: wantNumber(v.speedJitter, `${path}.speedJitter`, [-4, 4]),
      items: items.map((it, i) => wantItem(it, `${path}.items[${i}]`)),
    };
    if (v.iconScale !== undefined) ticker.iconScale = wantNumber(v.iconScale, `${path}.iconScale`, [0.05, 2]);
    return ticker;
  }
  fail(`${path}.type`, `未知图层类型 ${JSON.stringify(type)}（支持 text / ticker）`);
}

/**
 * 校验并归一化一份模板 JSON。
 * source 用于错误信息前缀（如 'made-by-gang.json' 或 'no-sponsors#still-no-sponsors'）。
 */
export function validateTemplate(value: unknown, source = 'template'): Template {
  const p = (sub: string) => `${source}${sub}`;
  if (!isRecord(value)) fail(source, '根值必须是对象');

  const id = wantString(value.id, p('.id'), { min: 1 });
  const version = wantNumber(value.version, p('.version'), [1, 999]);

  const name = wantLocaleMap(value.name, p('.name'));

  const canvasV = value.canvas;
  if (!isRecord(canvasV)) fail(p('.canvas'), '期望对象');
  const ratiosV = canvasV.ratios;
  if (!Array.isArray(ratiosV) || ratiosV.length === 0) fail(p('.canvas.ratios'), '期望非空数组');
  const ratios = ratiosV.map((r, i) => {
    if (typeof r !== 'string' || !RATIOS.includes(r as Ratio)) {
      fail(p(`.canvas.ratios[${i}]`), `期望 ${RATIOS.join(' / ')}，实际 ${JSON.stringify(r)}`);
    }
    return r as Ratio;
  });
  const basePx = wantNumber(canvasV.basePx, p('.canvas.basePx'), [16, 8192]);

  const constraintsV = value.constraints;
  if (!isRecord(constraintsV)) fail(p('.constraints'), '期望对象');
  const constraints = {
    maxColors: wantNumber(constraintsV.maxColors, p('.constraints.maxColors'), [2, 256]),
    allowGradient: wantBoolean(constraintsV.allowGradient, p('.constraints.allowGradient')),
    allowAlpha: wantBoolean(constraintsV.allowAlpha, p('.constraints.allowAlpha')),
  };

  const paletteV = value.palette;
  if (!isRecord(paletteV)) fail(p('.palette'), '期望对象');
  const palette = {
    bg: wantString(paletteV.bg, p('.palette.bg')),
    fg: wantString(paletteV.fg, p('.palette.fg')),
    accent: wantString(paletteV.accent, p('.palette.accent')),
  };
  for (const [k, c] of Object.entries(palette)) {
    if (!HEX.test(c)) fail(p(`.palette.${k}`), `期望 #rrggbb，实际 ${c}`);
  }

  const layersV = value.layers;
  if (!Array.isArray(layersV) || layersV.length === 0) fail(p('.layers'), '期望非空数组');
  const layers = layersV.map((l, i) => wantLayer(l, `.layers[${i}]`));
  const ids = layers.map((l) => l.id);
  if (new Set(ids).size !== ids.length) fail(p('.layers'), `图层 id 重复：${ids.join(', ')}`);

  const variantsV = value.variants;
  let variants: Template['variants'];
  if (variantsV !== undefined) {
    if (!Array.isArray(variantsV)) fail(p('.variants'), '期望数组');
    variants = variantsV.map((v, i) => {
      const vp = `.variants[${i}]`;
      if (!isRecord(v)) fail(p(vp), '期望变体对象');
      const patch = v.patch;
      if (!Array.isArray(patch) || patch.length === 0) fail(p(`${vp}.patch`), '期望非空补丁数组');
      return {
        id: wantString(v.id, p(`${vp}.id`), { min: 1 }),
        name: wantLocaleMap(v.name, p(`${vp}.name`)),
        patch,
      };
    });
    const vids = variants.map((v) => v.id);
    if (new Set(vids).size !== vids.length) fail(p('.variants'), `变体 id 重复：${vids.join(', ')}`);
  }

  const animV = value.animation;
  if (!isRecord(animV)) fail(p('.animation'), '期望对象');
  const loopRaw = animV.loopSeconds;
  const loopSeconds: number | 'auto' =
    loopRaw === 'auto' ? 'auto' : wantNumber(loopRaw, p('.animation.loopSeconds'), [0.1, 600]);
  const animation = {
    loopSeconds,
    fps: wantNumber(animV.fps, p('.animation.fps'), [1, 60]),
    loop: wantBoolean(animV.loop, p('.animation.loop')),
  };

  const exportV = value.export;
  if (!isRecord(exportV)) fail(p('.export'), '期望对象');
  const formatsV = exportV.formats;
  if (!Array.isArray(formatsV) || formatsV.length === 0) fail(p('.export.formats'), '期望非空数组');
  const exp = {
    formats: formatsV.map((f, i) => wantString(f, p(`.export.formats[${i}]`), { min: 1 })),
    gifMaxColors: wantNumber(exportV.gifMaxColors, p('.export.gifMaxColors'), [2, 256]),
    dither: wantString(exportV.dither, p('.export.dither'), { min: 1 }),
  };

  return { id, version, name, canvas: { ratios, basePx }, constraints, palette, layers, variants, animation, export: exp };
}
