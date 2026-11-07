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
  /** GIF 预计耗时（秒）；非 GIF 或无法预估时为 null */
  seconds?: number | null;
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
  /** 副标题 / 署名输入框的兜底标签（模板给了 label 时优先用模板的） */
  subtitleLabel: string;
  /** 行数标签 */
  rowsLabel: string;
  /** 行数滑杆的可读值（如「3 行」/「3 rows」） */
  rowsValueText: (rows: number) => string;
  /** 速度标签 */
  speedLabel: string;
  /** 速度滑杆的可读值（如「1.5 倍速」/「1.5× speed」） */
  speedValueText: (speed: number) => string;
  /** 色板标签 */
  paletteLabel: string;
  /** 一键主题标签 */
  themeLabel: string;
  /** 主题组里的「恢复模板自带色板」 */
  themeDefault: string;
  /** 「恢复模板自带色板」的悬停说明 */
  themeDefaultHint: string;
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
  /** 「单色 logo」开关 */
  monoLogosLabel: string;
  /** 「单色 logo」开关的悬停说明 */
  monoLogosHint: string;
  /** 图标面板关闭按钮 */
  iconPanelClose: string;
  /** 图标面板底部提示 */
  iconPanelHint: string;
  /** 已选区域的标题 */
  selectedTitle: string;
  /** 已选数量 */
  selectedCount: (n: number) => string;
  /** 已选 chip 的拖动 / 键盘排序提示（无障碍标签） */
  chipMoveHint: (name: string) => string;
  /** 图标面板里「最近用过」分组标题 */
  recentIconsLabel: string;
  /** 搜索无结果时的「上传自己的 logo」入口 */
  uploadOwnLabel: string;
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
  /** 平台推荐格式的按钮徽标 */
  recommendedLabel: string;
  /** 快速 GIF 开关 */
  quickGifLabel: string;
  /** 静态导出透明背景开关 */
  transparentBgLabel: string;
  /** 透明背景开关的悬停说明 */
  transparentBgHint: string;
  /** 打开透明背景后的轻提示（不阻止） */
  transparentBgNotice: string;
  /** 快速 / 标准档的体积与耗时提示 */
  quickGifHint: (size: string, seconds: number) => string;
  /** 导出后分享卡片（图片） */
  shareCardLabel: string;
  /** GitHub 预设导出 GIF 后的 README Markdown 片段 */
  readmeSnippetLabel: string;
  /** README 片段的用途说明 */
  readmeSnippetHint: string;
  /** 复制 README 片段 */
  readmeSnippetCopy: string;
  /** README 片段已复制 */
  readmeSnippetCopied: string;
  /** 正在生成分享用的 PNG */
  sharePreparing: string;
  /** 系统分享面板已打开 / 分享完成 */
  shareDone: string;
  /** 已把 PNG 复制到剪贴板 */
  shareCopiedImage: string;
  /** 分享与剪贴板都不可用，退回下载 */
  shareFallbackDownloaded: string;
  /** 分享图片失败 */
  shareFailed: (message: string) => string;
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
  /** 窄屏工具条上直达标题的按钮 */
  editTitleLabel: string;
  /** 首屏一次性提示 */
  stageHint: string;
  /** 卡片内标题编辑器的操作提示（回车换行…） */
  titleEditorHint: string;
  /** 卡片内标题编辑器的无障碍标签 */
  titleEditorAria: string;
  /** 任意文本层编辑器的无障碍标签（传入层名） */
  textEditorAria: (name: string) => string;
  /** 标题压到可读下限时的提示 */
  titleOverflowHint: string;
  /** 任意文本层压到可读下限时的提示 */
  textOverflowHint: string;
  /** 撤销 / 重做后的状态行 */
  undoDone: string;
  redoDone: string;
  /** 工具栏撤销按钮的 tooltip / 无障碍标签 */
  undoActionLabel: string;
  /** 工具栏重做按钮的 tooltip / 无障碍标签 */
  redoActionLabel: string;
  /** 撤销 / 重做按钮组的无障碍组名 */
  historyGroupLabel: string;
  /** 预览暂停 / 继续 */
  previewPause: string;
  previewPlay: string;
  /** 预览时间轴的无障碍标签 */
  previewTimelineAria: string;
  /** 当前帧 / 总时长（秒） */
  previewTime: (second: number, loop: number) => string;
  /** PNG 导出后：说清楚导出的是哪一帧 */
  exportedFrame: (kind: string, size: string, second: number, loop: number) => string;
  /** 一键换成品牌示例 */
  brandDemo: string;
  /** 关闭首屏提示（无障碍标签） */
  dismissHint: string;
  /** 品牌示例已套用 */
  brandDemoApplied: string;
  /** 清空图标后的提示 */
  iconsCleared: string;
  /** 上传图太大、无法随草稿保留 */
  uploadTooLarge: string;
  /** 恢复草稿时的提示 */
  draftRestored: string;
  /** 恢复草稿时的提示（含上传图） */
  draftRestoredUploads: (n: number) => string;
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
    subtitleLabel: 'Subtitle',
    rowsLabel: 'Rows',
    rowsValueText: (rows) => `${rows} ${rows === 1 ? 'row' : 'rows'}`,
    speedLabel: 'Speed',
    speedValueText: (speed) => `${speed}× speed`,
    paletteLabel: 'Palette',
    themeLabel: 'Theme',
    themeDefault: 'Template',
    themeDefaultHint: "Back to this layout's built-in colours",
    iconPanelTitle: 'Choose icons',
    iconPanelSearch: 'Search brands…',
    iconPanelLoading: 'Loading…',
    iconPanelClear: 'Clear',
    uploadBtn: 'Upload',
    uploadLabelPlaceholder: 'Text next to it (optional)',
    logoWithSymbolLabel: 'Symbol + wordmark',
    monoLogosLabel: 'Mono logos',
    monoLogosHint: 'Render every logo in the foreground colour',
    iconNoResult: 'No brand matches. Brand names are mostly English — or upload your own logo.',
    iconPanelClose: 'Close',
    iconPanelHint: 'Click to toggle. 3000+ brand marks from simple-icons, plus SVGL logotypes that keep their own colours.',
    selectedTitle: 'Selected',
    selectedCount: (n) => `${n} selected`,
    chipMoveHint: (name) => `${name} — drag the handle, or use arrow keys to reorder`,
    recentIconsLabel: 'Recently used',
    uploadOwnLabel: 'Upload your own logo',
    removeLabel: (name) => `Remove ${name}`,
    panelLoadFailed: (n) => `${n} icons failed to load — the icon CDN is unreachable.`,
    retryLabel: 'Retry',
    exportGif: 'Export GIF',
    exportMp4: 'Export MP4',
    exportPng: 'Export PNG',
    exportSvg: 'Export SVG',
    recommendedLabel: 'Recommended',
    quickGifLabel: 'Quick GIF (720p / 12fps)',
    transparentBgLabel: 'Transparent PNG/SVG',
    transparentBgHint: 'PNG and SVG only. GIF / MP4 always keep a solid background.',
    transparentBgNotice: 'Transparent background on — check how foreground text reads over your video or photo.',
    quickGifHint: (size, seconds) => `≈ ${size} · ≈ ${seconds}s`,
    shareCardLabel: 'Share card',
    readmeSnippetLabel: 'README snippet',
    readmeSnippetHint: 'Paste this into your README — GitHub plays the GIF on loop.',
    readmeSnippetCopy: 'Copy Markdown',
    readmeSnippetCopied: 'Markdown copied',
    sharePreparing: 'Preparing image…',
    shareDone: 'Shared',
    shareCopiedImage: 'PNG copied to clipboard',
    shareFallbackDownloaded: 'Sharing not supported here — PNG downloaded',
    shareFailed: (message) => `Could not share: ${message}`,
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
    editTitleLabel: 'Edit title',
    stageHint: 'Click the headline to change it.',
    titleEditorHint: 'Enter for a new line · Cmd/Ctrl+Enter to finish',
    titleEditorAria: 'Edit title on the card',
    textEditorAria: (name) => `Edit ${name} on the card`,
    titleOverflowHint: 'Long title — it has been shrunk to fit. Remove a few words or press Enter to break the line.',
    textOverflowHint: 'This text is too long — it has been shrunk to fit. Remove a few words or press Enter to break the line.',
    undoDone: 'Undone',
    redoDone: 'Redone',
    undoActionLabel: 'Undo (Cmd/Ctrl+Z)',
    redoActionLabel: 'Redo (Cmd/Ctrl+Shift+Z)',
    historyGroupLabel: 'Edit history',
    previewPause: 'Pause',
    previewPlay: 'Play',
    previewTimelineAria: 'Preview timeline',
    previewTime: (second, loop) => `${second.toFixed(1)} / ${loop.toFixed(1)}s`,
    exportedFrame: (kind, size, second, loop) =>
      `${kind} exported · ${size} · frame at ${second.toFixed(1)}s / ${loop.toFixed(1)}s`,
    brandDemo: 'Try a brand demo',
    dismissHint: 'Dismiss',
    brandDemoApplied: 'Brand demo loaded',
    iconsCleared: 'Icons cleared — undo available',
    uploadTooLarge: 'This logo is too large to keep after a reload.',
    draftRestored: 'Restored your last edit',
    draftRestoredUploads: (n) => `Restored your last edit, including ${n} uploaded logo(s)`,
    caption: (i) => `${i.template} · ${i.ratio} · canvas ${i.w} × ${i.h} · ${i.loop}s loop`,
    estimate: (i) => {
      const head = `${i.format} ${i.w}×${i.h}`;
      const time = i.seconds ? ` · ~${i.seconds}s` : '';
      if (i.estimate && i.limit) return `${head} · ~${i.estimate} / ${i.limit}${i.over ? ' · over limit' : ''}${time}`;
      if (i.estimate) return `${head} · ~${i.estimate}${time}`;
      if (i.limit) return `${head} · limit ${i.limit}${time}`;
      return `${head}${time}`;
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
    subtitleLabel: '副标题',
    rowsLabel: '行数',
    rowsValueText: (rows) => `${rows} 行`,
    speedLabel: '速度',
    speedValueText: (speed) => `${speed} 倍速`,
    paletteLabel: '色板',
    themeLabel: '主题',
    themeDefault: '模板默认',
    themeDefaultHint: '回到这套版式自带的配色',
    iconPanelTitle: '选择图标',
    iconPanelSearch: '搜索品牌…',
    iconPanelLoading: '加载中…',
    iconPanelClear: '清空',
    uploadBtn: '上传',
    uploadLabelPlaceholder: '图旁边的文字（可选）',
    logoWithSymbolLabel: '符号 + 字标',
    monoLogosLabel: '单色 logo',
    monoLogosHint: '把所有 logo 统一成前景色',
    iconNoResult: '没有匹配的品牌。品牌名多用英文，也可以直接上传自己的 logo。',
    iconPanelClose: '关闭',
    iconPanelHint: '点击切换选中状态。simple-icons 3000+ 品牌矢量；SVGL 的 logo 保留原品牌色。',
    selectedTitle: '已选',
    selectedCount: (n) => `已选 ${n} 个`,
    chipMoveHint: (name) => `${name}——拖动左侧手柄，或用方向键上下移动`,
    recentIconsLabel: '最近使用',
    uploadOwnLabel: '上传自己的 logo',
    removeLabel: (name) => `移除 ${name}`,
    panelLoadFailed: (n) => `${n} 个图标没能加载——图标源连不上。`,
    retryLabel: '重试',
    exportGif: '导出 GIF',
    exportMp4: '导出 MP4',
    exportPng: '导出 PNG',
    exportSvg: '导出 SVG',
    recommendedLabel: '推荐',
    quickGifLabel: '快速 GIF（720p / 12fps）',
    transparentBgLabel: '透明 PNG/SVG',
    transparentBgHint: '只影响 PNG 和 SVG；GIF / MP4 始终保持不透明背景。',
    transparentBgNotice: '已开启透明背景——前景文字叠到视频或照片上是否看得清，请自己确认一下。',
    quickGifHint: (size, seconds) => `约 ${size} · 约 ${seconds} 秒`,
    shareCardLabel: '分享卡片',
    readmeSnippetLabel: 'README 片段',
    readmeSnippetHint: '贴进 README，GitHub 里会自动循环播放。',
    readmeSnippetCopy: '复制 Markdown',
    readmeSnippetCopied: '已复制 Markdown',
    sharePreparing: '正在生成图片…',
    shareDone: '已打开分享',
    shareCopiedImage: '已复制 PNG 到剪贴板',
    shareFallbackDownloaded: '当前浏览器不支持分享或复制，已改为下载 PNG',
    shareFailed: (message) => `分享失败：${message}`,
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
    editTitleLabel: '编辑标题',
    stageHint: '点卡片上的标题就能改字。',
    titleEditorHint: '回车换行 · Cmd/Ctrl+Enter 完成',
    titleEditorAria: '在卡片上编辑标题',
    textEditorAria: (name) => `在卡片上编辑${name}`,
    titleOverflowHint: '标题太长，已经缩得很小了——删掉几个字，或按回车换行。',
    textOverflowHint: '这段文字太长，已经缩得很小了——删掉几个字，或按回车换行。',
    undoDone: '已撤销',
    redoDone: '已重做',
    undoActionLabel: '撤销（Cmd/Ctrl+Z）',
    redoActionLabel: '重做（Cmd/Ctrl+Shift+Z）',
    historyGroupLabel: '编辑历史',
    previewPause: '暂停',
    previewPlay: '继续',
    previewTimelineAria: '预览时间轴',
    previewTime: (second, loop) => `${second.toFixed(1)} / ${loop.toFixed(1)} 秒`,
    exportedFrame: (kind, size, second, loop) =>
      `已导出 ${kind}，${size} · 第 ${second.toFixed(1)} / ${loop.toFixed(1)} 秒这一帧`,
    brandDemo: '换成品牌示例',
    dismissHint: '关闭提示',
    brandDemoApplied: '已换成品牌示例',
    iconsCleared: '已清空图标，可撤销',
    uploadTooLarge: '这个 logo 太大，刷新后无法保留。',
    draftRestored: '已恢复上次的编辑',
    draftRestoredUploads: (n) => `已恢复上次的编辑，含 ${n} 个上传的 logo`,
    caption: (i) => `${i.template} · ${i.ratio} · 画布 ${i.w} × ${i.h} · 循环 ${i.loop} 秒`,
    estimate: (i) => {
      const head = `${i.format} ${i.w}×${i.h}`;
      const time = i.seconds ? ` · 约 ${i.seconds} 秒` : '';
      if (i.estimate && i.limit) return `${head} · 预估 ~${i.estimate} / 上限 ${i.limit}${i.over ? ' · 超出' : ''}${time}`;
      if (i.estimate) return `${head} · 预估 ~${i.estimate}${time}`;
      if (i.limit) return `${head} · 上限 ${i.limit}${time}`;
      return `${head}${time}`;
    },
  },
};

export function ui(locale: Locale): UiStrings {
  return UI[locale];
}
