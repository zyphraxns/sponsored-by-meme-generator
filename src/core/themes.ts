import type { Locale } from './types';

/** 一键主题：背景 / 前景 / accent 三色成组，只换颜色，不动用户的图标和文案。 */
export interface ColorTheme {
  id: string;
  name: Record<Locale, string>;
  bg: string;
  fg: string;
  accent: string;
}

/**
 * 主题全部人工挑选并保证可读性：
 * 浅色主题配深字，深色主题配浅字；accent 与背景的对比度都 ≥ 3:1（大标题强调线够用）。
 */
export const COLOR_THEMES: readonly ColorTheme[] = [
  {
    id: 'ivory',
    name: { en: 'Ivory', zh: '象牙' },
    bg: '#f5f3ee',
    fg: '#111111',
    accent: '#b45309',
  },
  {
    id: 'paper',
    name: { en: 'Paper', zh: '纸白' },
    bg: '#ffffff',
    fg: '#1a1a1a',
    accent: '#2563eb',
  },
  {
    id: 'sand',
    name: { en: 'Sand', zh: '沙色' },
    bg: '#e7dcc8',
    fg: '#241c12',
    accent: '#9a3412',
  },
  {
    id: 'ink',
    name: { en: 'Ink', zh: '墨黑' },
    bg: '#101114',
    fg: '#f7f7f5',
    accent: '#ffd166',
  },
  {
    id: 'cobalt',
    name: { en: 'Cobalt', zh: '钴蓝' },
    bg: '#0b1f3a',
    fg: '#eef4ff',
    accent: '#7dd3fc',
  },
  {
    id: 'forest',
    name: { en: 'Forest', zh: '森林' },
    bg: '#14251c',
    fg: '#f0f7ef',
    accent: '#a7f3d0',
  },
  {
    id: 'sunset',
    name: { en: 'Sunset', zh: '日落' },
    bg: '#2b1020',
    fg: '#fff1f5',
    accent: '#fb7185',
  },
];

/** 当前色板是否正好等于某套主题（大小写不敏感） */
export function themeMatches(
  theme: ColorTheme,
  palette: Partial<{ bg: string; fg: string; accent: string }> | undefined,
): boolean {
  if (!palette?.bg || !palette.fg || !palette.accent) return false;
  return (
    palette.bg.toLowerCase() === theme.bg &&
    palette.fg.toLowerCase() === theme.fg &&
    palette.accent.toLowerCase() === theme.accent
  );
}

/** 用户是否动过任何颜色（false = 仍是模板自带色板） */
export function hasCustomPalette(
  palette: Partial<{ bg: string; fg: string; accent: string }> | undefined,
): boolean {
  return Boolean(palette?.bg || palette?.fg || palette?.accent);
}
