/**
 * 工具界面双语字典（决策 2：中英双语切换）。
 *
 * 只放「工具 chrome」的字符串；版式内的文案属于模板 JSON（name / default），
 * 平台名与播放行为提示属于 presets（与阈值同源），这里不重复。
 */
import type { Locale, Ratio } from './core/types';

export interface CaptionInfo {
  template: string;
  ratio: Ratio;
  w: number;
  h: number;
  /** 已按一位小数格式化过的循环秒数 */
  loop: string;
}

/** 体积预估文案的输入（数字与单位已在外部格式化，字典只管措辞） */
export interface EstimateInfo {
  format: string;
  w: number;
  h: number;
  /** null = 无法预估（MP4 体积由编码器决定） */
  estimate: string | null;
  /** null = 该平台无口径 */
  limit: string | null;
  over: boolean;
}

export interface UiStrings {
  docTitle: string;
  htmlLang: string;
  layoutLabel: string;
  languageLabel: string;
  ratioLabel: string;
  platformLabel: string;
  /** 图标按钮标签 */
  iconLabel: string;
  /** 标题输入框标签 */
  titleLabel: string;
  /** 行数标签 */
  rowsLabel: string;
  /** 速度标签 */
  speedLabel: string;
  /** 色板标签 */
  paletteLabel: string;
  /** 图标面板标题 */
  iconPanelTitle: string;
  /** 图标面板搜索占位 */
  iconPanelSearch: string;
  /** 图标面板加载中 */
  iconPanelLoading: string;
  /** 图标面板清空按钮 */
  iconPanelClear: string;
  /** 上传 logo 按钮 */
  uploadBtn: string;
  /** 搜索无结果提示 */
  iconNoResult: string;
  /** 上传项的文字标签占位提示 */
  uploadLabelPlaceholder: string;
  /** 「符号 + 字标」开关 */
  logoWithSymbolLabel: string;
  /** 图标面板关闭按钮 */
  iconPanelClose: string;
  /** 图标面板底部提示 */
  iconPanelHint: string;
  /** 已选区域的标题 */
  selectedTitle: string;
  /** 已选数量 */
  selectedCount: (n: number) => string;
  /** 移除已选项（无障碍标签） */
  removeLabel: (name: string) => string;
  /** 预览图加载失败的数量提示 */
  panelLoadFailed: (n: number) => string;
  /** 重试按钮 */
  retryLabel: string;
  exportGif: string;
  exportMp4: string;
  exportPng: string;
  exportSvg: string;
  exporting: (kind: string, pct?: number) => string;
  /** 带剩余时间的进度（秒） */
  exportingEta: (kind: string, pct: number, remain: number) => string;
  exported: (kind: string, size: string) => string;
  /** 产物超过平台上限时的追加警告 */
  overLimit: (platform: string, size: string, limit: string) => string;
  /** 导出被用户取消 */
  cancelled: string;
  /** 取消按钮 */
  cancelLabel: string;
  mp4Unsupported: string;
  mp4LimitHint: string;
  failed: (message: string) => string;
  /** 复制链接按钮 */
  shareLabel: string;
  /** 复制成功 */
  shareCopied: string;
  /** 复制成功，但有上传内容无法随链接带走 */
  shareCopiedDropped: (n: number) => string;
  /** 随机按钮 */
  randomLabel: string;
  /** 随机之后的状态行 */
  randomApplied: string;
  /** 撤销按钮 */
  undoLabel: string;
  /** 窄屏工具条开关 */
  settingsLabel: string;
  /** 恢复草稿时的提示 */
  draftRestored: string;
  caption: (info: CaptionInfo) => string;
  estimate: (info: EstimateInfo) => string;
}

export const UI: Record<Locale, UiStrings> = {
  en: {
    docTitle: 'sponsored-by — live preview',
    htmlLang: 'en',
    layoutLabel: 'Layout',
    languageLabel: 'Language',
    ratioLabel: 'Ratio',
    platformLabel: 'Post to',
    iconLabel: 'Icons',
    titleLabel: 'Title',
    rowsLabel: 'Rows',
    speedLabel: 'Speed',
    paletteLabel: 'Palette',
    iconPanelTitle: 'Choose icons',
    iconPanelSearch: 'Search brands…',
    iconPanelLoading: 'Loading…',
    iconPanelClear: 'Clear',
    uploadBtn: 'Upload',
    uploadLabelPlaceholder: 'Text next to it (optional)',
    logoWithSymbolLabel: 'Symbol + wordmark',
    iconNoResult: 'No brand matches. Brand names are mostly English — or upload your own logo.',
    iconPanelClose: 'Close',
    iconPanelHint: 'Click to toggle. 3000+ brand marks from simple-icons, plus SVGL logotypes that keep their own colours.',
    selectedTitle: 'Selected',
    selectedCount: (n) => `${n} selected`,
    removeLabel: (name) => `Remove ${name}`,
    panelLoadFailed: (n) => `${n} icons failed to load — the icon CDN is unreachable.`,
    retryLabel: 'Retry',
    exportGif: 'Export GIF',
    exportMp4: 'Export MP4',
    exportPng: 'Export PNG',
    exportSvg: 'Export SVG',
    exporting: (kind, pct) => (pct === undefined ? `Exporting ${kind}…` : `Exporting ${kind}… ${pct}%`),
    exportingEta: (kind, pct, remain) => `Exporting ${kind}… ${pct}% · ~${remain}s left`,
    exported: (kind, size) => `${kind} exported · ${size}`,
    overLimit: (platform, size, limit) => `over ${platform} limit (${limit}): ${size}`,
    cancelled: 'Export cancelled',
    cancelLabel: 'Cancel',
    mp4Unsupported: 'MP4 needs WebCodecs — use GIF in this browser',
    mp4LimitHint: 'MP4 does not loop on its own; most feeds replay it once',
    failed: (message) => `Export failed: ${message}`,
    shareLabel: 'Copy link',
    shareCopied: 'Share link copied',
    shareCopiedDropped: (n) => `Link copied — ${n} uploaded logo(s) cannot travel in a link`,
    randomLabel: 'Surprise me',
    randomApplied: 'Randomised — undo?',
    undoLabel: 'Undo',
    settingsLabel: 'Settings',
    draftRestored: 'Restored your last edit',
    caption: (i) => `${i.template} · ${i.ratio} · canvas ${i.w} × ${i.h} · ${i.loop}s loop`,
    estimate: (i) => {
      const head = `${i.format} ${i.w}×${i.h}`;
      if (i.estimate && i.limit) return `${head} · ~${i.estimate} / ${i.limit}${i.over ? ' · over limit' : ''}`;
      if (i.estimate) return `${head} · ~${i.estimate}`;
      if (i.limit) return `${head} · limit ${i.limit}`;
      return '';
    },
  },
  zh: {
    docTitle: 'sponsored-by — 实时预览',
    htmlLang: 'zh-CN',
    layoutLabel: '版式',
    languageLabel: '语言',
    ratioLabel: '比例',
    platformLabel: '发到',
    iconLabel: '图标',
    titleLabel: '标题',
    rowsLabel: '行数',
    speedLabel: '速度',
    paletteLabel: '色板',
    iconPanelTitle: '选择图标',
    iconPanelSearch: '搜索品牌…',
    iconPanelLoading: '加载中…',
    iconPanelClear: '清空',
    uploadBtn: '上传',
    uploadLabelPlaceholder: '图旁边的文字（可选）',
    logoWithSymbolLabel: '符号 + 字标',
    iconNoResult: '没有匹配的品牌。品牌名多用英文，也可以直接上传自己的 logo。',
    iconPanelClose: '关闭',
    iconPanelHint: '点击切换选中状态。simple-icons 3000+ 品牌矢量；SVGL 的 logo 保留原品牌色。',
    selectedTitle: '已选',
    selectedCount: (n) => `已选 ${n} 个`,
    removeLabel: (name) => `移除 ${name}`,
    panelLoadFailed: (n) => `${n} 个图标没能加载——图标源连不上。`,
    retryLabel: '重试',
    exportGif: '导出 GIF',
    exportMp4: '导出 MP4',
    exportPng: '导出 PNG',
    exportSvg: '导出 SVG',
    exporting: (kind, pct) => (pct === undefined ? `正在导出 ${kind}…` : `正在导出 ${kind}… ${pct}%`),
    exportingEta: (kind, pct, remain) => `正在导出 ${kind}… ${pct}% · 约剩 ${remain} 秒`,
    exported: (kind, size) => `已导出 ${kind}，${size}`,
    overLimit: (platform, size, limit) => `超出「${platform}」上限 ${limit}：产物 ${size}`,
    cancelled: '已取消导出',
    cancelLabel: '取消',
    mp4Unsupported: '此浏览器不支持 WebCodecs，请改用 GIF',
    mp4LimitHint: 'MP4 不会自动循环；多数信息流只播一遍',
    failed: (message) => `导出失败：${message}`,
    shareLabel: '复制链接',
    shareCopied: '已复制分享链接',
    shareCopiedDropped: (n) => `已复制链接——上传的 ${n} 个 logo 无法随链接分享`,
    randomLabel: '随机',
    randomApplied: '已随机，可撤销',
    undoLabel: '撤销',
    settingsLabel: '设置',
    draftRestored: '已恢复上次的编辑',
    caption: (i) => `${i.template} · ${i.ratio} · 画布 ${i.w} × ${i.h} · 循环 ${i.loop} 秒`,
    estimate: (i) => {
      const head = `${i.format} ${i.w}×${i.h}`;
      if (i.estimate && i.limit) return `${head} · 预估 ~${i.estimate} / 上限 ${i.limit}${i.over ? ' · 超出' : ''}`;
      if (i.estimate) return `${head} · 预估 ~${i.estimate}`;
      if (i.limit) return `${head} · 上限 ${i.limit}`;
      return '';
    },
  },
};

export function ui(locale: Locale): UiStrings {
  return UI[locale];
}
