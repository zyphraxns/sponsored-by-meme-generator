import { canvasSize, loopSecondsFor, scene, sceneIconSvgs, sceneLogoSvgs } from './core/scene';
import { createDefaultState } from './app-state';
import { DEFAULT_TEMPLATE_ID, getTemplate, templateChoices } from './templates';
import {
  PLATFORMS,
  deriveExportState,
  estimateGifSeconds,
  estimateSize,
  exceedsLimit,
  formatBytes,
  getPreset,
} from './core/presets';
import type { PlatformId } from './core/presets';
import { ui } from './i18n';
import { History } from './core/history';
import { fitTextLayout } from './core/layout';
import type { Locale, Ratio, SceneState, TextLayer, TickerItem } from './core/types';
import type { BrandHit } from './core/simple-icons';
import { encodeShare, decodeShare, sanitizeTickerItems } from './share-link';
import type { ShareableState } from './share-link';
import { loadDraft, saveDraft } from './draft';
import { COLOR_THEMES, hasCustomPalette, themeMatches } from './core/themes';
import { scopeSvgIds } from './core/svg-ids';
import { measureSvgInk } from './core/svg-ink';

/** 当前选择（UI 的唯一真源；state 由它派生，切换 = 重建） */
interface Selection {
  templateId: string;
  variantId?: string;
  locale: Locale;
  ratio: Ratio;
  platform: PlatformId;
  /** 用户选中的图标列表（空 = 用模板默认） */
  icons: TickerItem[];
  /** 用户文案覆盖 */
  text: SceneState['text'];
  /** 用户色板覆盖：bg / fg / accent（accent 用于标题下的强调线） */
  palette: NonNullable<SceneState['palette']>;
  /** 用户覆盖的行数；undefined = 跟随模板默认（不能硬编码 3，否则将来 4 行的模板会被压回去） */
  rows?: number;
  /** 用户覆盖的速度倍率（有理数，保证 LCM 周期有限） */
  speed: number;
  /** 官方字标前是否再拼一个符号（OpenAI / GitHub 的字标本身只有文字） */
  logoWithSymbol: boolean;
  /** 品牌色 / 单色（只影响预览与导出，不改变用户选的图标） */
  logoMode: NonNullable<SceneState['logoMode']>;
  /** PNG / SVG 是否使用透明背景（GIF / MP4 忽略） */
  transparentBg: boolean;
}

function defaultSelection(): Selection {
  return {
    templateId: DEFAULT_TEMPLATE_ID,
    locale: 'en',
    ratio: '1:1',
    platform: 'none',
    icons: [],
    text: {},
    palette: {},
    logoWithSymbol: false,
    logoMode: 'brand',
    speed: 1,
    transparentBg: false,
  };
}

/** state 由 sel 派生；logoMode 不在 app-state 的默认参数里，这里补上。 */
function buildState(): SceneState {
  const next = createDefaultState(sel);
  next.logoMode = sel.logoMode;
  return next;
}

let sel: Selection = defaultSelection();
let state: SceneState = buildState();

/** 编辑历史：只存 Selection 纯数据快照，最多 50 步 */
const editHistory = new History<Selection>({
  limit: 50,
  // 点已激活的主题 / 重复取同一个颜色不该塞进撤销栈，否则 Cmd+Z 会「按了没反应」
  equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
});

/** 启动时的状态来源：分享链接 > 本地草稿 > 默认。 */
let restoredFromDraft = false;
/**
 * 本次是从分享链接（URL hash）恢复的吗。
 *
 * hash 在启动阶段优先于草稿（这是「打开别人的卡」的正确行为）。但用户
 * 一旦真的开始编辑，就必须让草稿接管：否则刷新后又回到链接里的旧状态，
 * 改了半天等于白改。接管发生在 commitSelection 里（只对真实编辑生效，
 * 不碰启动时的还原）。
 */
let restoredFromHash = false;
/** 本次从草稿里恢复了几个上传 logo（用于提示「恢复了什么」） */
let restoredUploadCount = 0;
/** 「上传图太大、刷新后不保留」只提示一次，避免每次编辑都刷状态行 */
let warnedTooLarge = false;

/**
 * 把可恢复字段灌进 sel，并重建 state。
 *
 * 这里只做数据，不碰 DOM：本函数在模块顶部执行，此时下面那些
 * `const textFieldsHost = …` 还在 TDZ 里，任何 refreshChrome() 调用都会抛
 * ReferenceError（旧代码靠一个空 catch 吞掉，表现为「分享链接无效」）。
 * chrome 由模块末尾那次 refreshChrome() 统一刷新。
 */
function applyRestored(d: Partial<ShareableState>): void {
  if (d.templateId) sel.templateId = d.templateId;
  if (d.variantId) sel.variantId = d.variantId;
  if (d.locale) sel.locale = d.locale;
  if (d.ratio) sel.ratio = d.ratio;
  if (d.platform) sel.platform = d.platform;
  if (d.icons) sel.icons = sanitizeTickerItems(d.icons) ?? [];
  if (d.text) sel.text = d.text;
  if (d.palette) sel.palette = d.palette as NonNullable<SceneState['palette']>;
  if (d.rows !== undefined) sel.rows = d.rows;
  if (d.speed !== undefined) sel.speed = d.speed;
  if (d.logoWithSymbol !== undefined) sel.logoWithSymbol = d.logoWithSymbol;
  if (d.logoMode === 'brand' || d.logoMode === 'mono') sel.logoMode = d.logoMode;
  if (d.transparentBg !== undefined) sel.transparentBg = d.transparentBg === true;
  state = buildState();
}

// 分享链接：URL hash 优先；没有则尝试上次的本地草稿
(function initState(): void {
  try {
    // 统一走 decodeShare：旧格式（JSON 后接 &mono=1&accent=…）的兼容
    // 也收在解码层，这里不再自己按 & 切字符串。
    const decoded = decodeShare(location.hash);
    if (decoded) {
      restoredFromHash = true;
      applyRestored(decoded);
      return;
    }
    const draft = loadDraft();
    if (draft) {
      // 草稿里的 icons 含 upload: 项；decodeShare 为了分享会过滤它们，这里补回来
      applyRestored({
        ...draft.state,
        ...(draft.icons ? { icons: draft.icons } : {}),
        ...(draft.logoMode ? { logoMode: draft.logoMode } : {}),
        ...(draft.ratio ? { ratio: draft.ratio } : {}),
        ...(draft.accent
          ? { palette: { ...(draft.state.palette ?? {}), accent: draft.accent } }
          : {}),
      });
      if (draft.uploads) {
        state.iconSvgs = { ...(state.iconSvgs ?? {}), ...draft.uploads };
        if (draft.aspects) {
          state.logoAspect = { ...(state.logoAspect ?? {}), ...draft.aspects };
        }
        if (draft.ink) {
          state.logoInk = { ...(state.logoInk ?? {}), ...draft.ink };
        }
        // 旧草稿没存尺寸：SVG 上传图就地重量一次；位图没有 aspect 只能按方形
        for (const [key, content] of Object.entries(draft.uploads)) {
          if (content.startsWith('data:') || state.logoInk?.[key]) continue;
          const ink = measureSvgInk(content);
          if (ink) {
            state.logoInk = { ...(state.logoInk ?? {}), [key]: ink };
            state.logoAspect = { ...(state.logoAspect ?? {}), [key]: ink.w / ink.h };
          }
        }
        restoredUploadCount = Object.keys(draft.uploads).length;
      }
      restoredFromDraft = true;
    }
  } catch (err) {
    // 任何解析/恢复异常都不该让页面白屏；退回一套确定可渲染的默认状态
    console.warn('[sponsored-by] 恢复分享链接/草稿失败，已回退默认状态', err);
    sel = defaultSelection();
    state = buildState();
    restoredFromDraft = false;
    restoredUploadCount = 0;
  }
})();

// 历史基线：第一次编辑之前的状态也要能撤销回来
editHistory.push(sel);

/** 草稿写入去抖：滑块拖动会连续触发，别每个 input 都写一次 localStorage */
let draftTimer: number | undefined;

/** 立刻把当前选择写进草稿（取消防抖中的那次，避免重复写） */
function persistDraft(): void {
  if (draftTimer !== undefined) {
    window.clearTimeout(draftTimer);
    draftTimer = undefined;
  }
  const result = saveDraft(sel, state.iconSvgs, state.logoAspect, state.logoInk);
  if (!result.uploadsSaved && !warnedTooLarge) {
    warnedTooLarge = true;
    flashStatus(ui(state.locale).uploadTooLarge, 4000);
  }
}

function scheduleDraftSave(): void {
  if (draftTimer !== undefined) window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    draftTimer = undefined;
    persistDraft();
  }, 400);
}

/**
 * 从分享链接进来后，第一次真实编辑就让草稿接管。
 *
 * 顺序必须是「先落草稿、再清 hash」：反过来的话，浏览器若在 400ms 去抖
 * 窗口内刷新，hash 已删、草稿还没写，用户改动就真丢了。
 * 用 replaceState 而不是 pushState：不给用户多一条无意义的历史记录。
 */
function takeOverDraftFromHash(): void {
  if (!restoredFromHash) return;
  restoredFromHash = false;
  persistDraft();
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

let loopSeconds = loopSecondsFor(state);
let start = performance.now();

const stageHost = document.getElementById('canvas');
if (!stageHost) throw new Error('#canvas mount point not found');
// 显式标注：narrowed 类型在闭包内不保留，renderAt 需要非空引用
const stage: HTMLElement = stageHost;

function renderAt(t: number): void {
  // 逐帧整段重渲：SVG 约 5 KB / 25 个节点，60fps 预算内；
  // 预览与导用同一个 scene()，架构上不可能漂移。
  stage.innerHTML = scene(state, t);
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// M2 时间轴：t 随真实时间推进，循环播放。无缝性由 ticker 数学 + scene 级单测保证。
let rafId: number | null = null;
/** 导出期间的暂停时刻；null = 预览正在播放 */
let previewPausedAt: number | null = null;
/** 用户手动暂停：画面停在 pausedAt；与导出暂停互不干扰 */
let manualPaused = false;
/** 手动暂停时停留的帧时间（秒） */
let pausedAt = 0;
/** 播放中时间轴的节流重绘时间戳 */
let lastTimelinePaint = 0;
/** 导出进行中：预览控制整体禁用 */
let exporting = false;

/** 当前播放相位（秒） */
function playTime(now = performance.now()): number {
  return ((now - start) / 1000) % loopSeconds;
}

/** 当前画面时间：暂停时就是拖到的那一帧 */
function currentPreviewTime(): number {
  return manualPaused ? pausedAt : playTime();
}

/** 同步暂停按钮、时间轴和秒数标签 */
function paintPreviewControls(t = currentPreviewTime()): void {
  const strings = ui(state.locale);
  if (previewToggle) {
    const label = manualPaused ? strings.previewPlay : strings.previewPause;
    previewToggle.textContent = label;
    previewToggle.title = label;
    previewToggle.setAttribute('aria-pressed', String(manualPaused));
    previewToggle.disabled = exporting;
  }
  if (previewScrub) {
    // 只有暂停后才能拖：播放时拖动会和 rAF 抢同一根时间轴
    previewScrub.disabled = exporting || !manualPaused;
    previewScrub.setAttribute('aria-label', strings.previewTimelineAria);
    // 原生 range 只报 0..1000，屏幕阅读器需要「当前秒 / 总秒」的可读值
    previewScrub.setAttribute('aria-valuetext', strings.previewTime(t, loopSeconds));
    // 拖拽过程中不要回写 value，否则会和正在拖的拇指较劲
    if (!manualPaused || document.activeElement !== previewScrub) {
      const ratio = loopSeconds > 0 ? Math.min(1, Math.max(0, t / loopSeconds)) : 0;
      previewScrub.value = String(Math.round(ratio * 1000));
    }
  }
  if (previewTimeEl) previewTimeEl.textContent = strings.previewTime(t, loopSeconds);
}

/** 暂停 / 继续：继续时从当前帧接上，不跳回 0 */
function setManualPaused(paused: boolean): void {
  if (paused === manualPaused) return;
  manualPaused = paused;
  if (paused) {
    pausedAt = playTime();
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    renderAt(pausedAt);
  } else if (!reducedMotion && previewPausedAt === null) {
    start = performance.now() - pausedAt * 1000;
    if (rafId === null) rafId = requestAnimationFrame(frame);
  } else {
    // 「减少动态」或导出中：没有动画可恢复，保持当前帧
    renderAt(pausedAt);
  }
  paintPreviewControls();
}

function frame(now: number): void {
  rafId = null;
  const t = playTime(now);
  renderAt(t);
  // 播放中每 150ms 同步一次时间轴，别每帧写 DOM
  if (now - lastTimelinePaint > 150) {
    lastTimelinePaint = now;
    paintPreviewControls(t);
  }
  rafId = requestAnimationFrame(frame);
}

/**
 * 导出期间停掉预览的逐帧重渲。
 *
 * 实测 1080² GIF 要 67 秒、峰值内存约 300 MB；期间预览还在 60fps 重画整段
 * SVG，纯属抢 CPU/GPU 并让风扇转起来。暂停只停 rAF，导出路径不受影响。
 */
function pausePreview(): void {
  // 已经手动暂停：画面本来就停在 pausedAt，导出结束后不要把它推进走
  if (manualPaused) return;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (!reducedMotion) previewPausedAt = performance.now();
}

function resumePreview(): void {
  if (manualPaused) {
    renderAt(pausedAt);
    paintPreviewControls();
    return;
  }
  if (reducedMotion) {
    // 「减少动态」档本来就没有循环，恢复时补一张静态帧即可
    renderAt(0);
    return;
  }
  if (previewPausedAt === null) return;
  // 暂停期间动画时间不该继续走：把起点顺延，恢复时接上原来的相位。
  start += performance.now() - previewPausedAt;
  previewPausedAt = null;
  if (rafId === null) rafId = requestAnimationFrame(frame);
}

if (reducedMotion) {
  // 预览尊重系统「减少动态」偏好：渲染静态帧。
  // 导出路径不受影响——导出 GIF 是显式用户动作，产物仍会动。
  renderAt(0);
} else {
  rafId = requestAnimationFrame(frame);
}

// —— 平台预设 / 版式 / 语言 / 比例切换 ——
const platformSelect = document.getElementById('platform-select') as HTMLSelectElement | null;
const templateSelect = document.getElementById('template-select') as HTMLSelectElement | null;
const localeBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('#locale-switch .seg'));
const ratioBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('#ratio-switch .seg'));
const caption = document.getElementById('caption');
const presetNote = document.getElementById('preset-note');
const estimateEl = document.getElementById('estimate');
const quickGifInput = document.getElementById('quick-gif') as HTMLInputElement | null;
const quickGifLabel = document.getElementById('quick-gif-label');
const quickGifHintEl = document.getElementById('quick-gif-hint');
const quickGifWrap = document.getElementById('quick-gif-wrap');

/** 快速 GIF 档：默认关（保持现有标准档） */
let quickGif = false;

function selectValue(): string {
  return `${sel.templateId}|${sel.variantId ?? ''}`;
}

/** 平台下拉：文案随语言，值域固定（来自 presets 表） */
function renderPlatformOptions(locale: Locale): void {
  if (!platformSelect) return;
  platformSelect.replaceChildren();
  for (const preset of PLATFORMS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.name[locale];
    platformSelect.append(option);
  }
}

/** 重建版式下拉：按模板分组（optgroup），文案随语言 */
function renderTemplateOptions(locale: Locale): void {
  if (!templateSelect) return;
  templateSelect.replaceChildren();
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const choice of templateChoices(locale)) {
    let group = groups.get(choice.group);
    if (!group) {
      group = document.createElement('optgroup');
      group.label = choice.group;
      groups.set(choice.group, group);
      templateSelect.append(group);
    }
    const option = document.createElement('option');
    option.value = `${choice.templateId}|${choice.variantId ?? ''}`;
    // 变体项加缩进前缀，视觉上从属于所属模板
    option.textContent = choice.variantId ? `　${choice.label}` : choice.label;
    group.append(option);
  }
}

/**
 * 页脚元信息：版式摘要 / 平台播放行为提示 / 体积预估。
 * 预估走 presets 的标定模型，任何时候都显示「预估 vs 上限」——
 * 这是 SPEC §5 要求的「导出前显示」。
 */
function refreshMeta(): void {
  const t = ui(state.locale);
  const preset = getPreset(sel.platform);

  if (caption) {
    const size = canvasSize(state.template, state.ratio);
    const base = state.template.name[state.locale];
    const variant = getTemplate(sel.templateId).variants?.find((v) => v.id === sel.variantId);
    const name = variant ? `${base} / ${variant.name[state.locale]}` : base;
    caption.textContent = t.caption({
      template: name,
      ratio: state.ratio,
      w: size.w,
      h: size.h,
      // 一位小数：速度是 0.05 步长的有理数，原始浮点会印出 3.522222222222222
      loop: String(Math.round(loopSeconds * 10) / 10),
    });
  }

  if (presetNote) presetNote.textContent = preset.note[state.locale];

  // 页脚预估跟随**平台推荐的导出格式**（不只是 GIF）。
  // GIF 额外给预计耗时；快速档的预估必须走同一份派生状态，否则数字对不上。
  const format = preset.format;
  const derived = deriveExportState(state, sel.platform, format, quickGif && format === 'gif');
  const size = canvasSize(derived.template, derived.ratio);
  const est = estimateSize(state, sel.platform, format, quickGif);
  const seconds = format === 'gif' ? estimateGifSeconds(state, sel.platform, quickGif) : null;
  if (estimateEl) {
    const text = t.estimate({
      format: format.toUpperCase(),
      w: size.w,
      h: size.h,
      estimate: est.bytes === null ? null : formatBytes(est.bytes),
      limit: est.limit === null ? null : formatBytes(est.limit),
      over: est.over,
      seconds,
    });
    estimateEl.textContent = text;
    estimateEl.classList.toggle('over', est.over);
  }

  updateQuickGifHint();
}

/** 快速档开关旁一直显示「当前 GIF 档位」的体积与预计耗时——默认也能看到标准档的代价 */
function updateQuickGifHint(): void {
  if (!quickGifHintEl) return;
  const bytes = estimateSize(state, sel.platform, 'gif', quickGif).bytes;
  if (bytes === null) {
    quickGifHintEl.textContent = '';
    return;
  }
  quickGifHintEl.textContent = ui(state.locale).quickGifHint(
    formatBytes(bytes),
    estimateGifSeconds(state, sel.platform, quickGif),
  );
}

/** 平台推荐的导出格式：给对应按钮挂描边 + 徽标，而不是只写在页脚小字里 */
function refreshFormatBadge(): void {
  const preset = getPreset(sel.platform);
  const t = ui(state.locale);
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.actions .btn[data-format]')) {
    // 推荐的是当前不可用的格式（如浏览器没有 WebCodecs 时的 MP4）时不要挂徽标，
    // 否则等于把用户指向一个点不动的按钮。
    const recommended = !btn.disabled && btn.dataset.format === preset.format;
    btn.classList.toggle('is-recommended', recommended);
    if (recommended) btn.dataset.badge = t.recommendedLabel;
    else delete btn.dataset.badge;
  }
}

/** 切换语言时重算的全部 chrome */
function refreshChrome(): void {
  const t = ui(state.locale);
  document.documentElement.lang = t.htmlLang;
  document.title = t.docTitle;

  for (const [id, text] of [
    ['label-platform', t.platformLabel],
    ['label-layout', t.layoutLabel],
    ['label-language', t.languageLabel],
    ['label-ratio', t.ratioLabel],
    ['label-icons', t.iconLabel],
    ['label-rows', t.rowsLabel],
    ['label-speed', t.speedLabel],
    ['label-palette', t.paletteLabel],
    ['label-theme', t.themeLabel],
    ['icon-panel-title', t.iconPanelTitle],
    ['export-gif', t.exportGif],
    ['export-mp4', t.exportMp4],
    ['export-png', t.exportPng],
    ['export-svg', t.exportSvg],
    ['share-card', t.shareCardLabel],
    ['readme-snippet-label', t.readmeSnippetLabel],
    ['readme-snippet-copy', t.readmeSnippetCopy],
    ['readme-snippet-hint', t.readmeSnippetHint],
    ['quick-gif-label', t.quickGifLabel],
    ['icon-close', t.iconPanelClose],
    ['icon-clear', t.iconPanelClear],
    ['icon-upload-btn', t.uploadBtn],
    ['icon-retry', t.retryLabel],
    ['share-link', t.shareLabel],
    ['random-btn', t.randomLabel],
    ['undo-btn', t.undoLabel],
    ['export-cancel', t.cancelLabel],
    ['toolbar-toggle', t.settingsLabel],
    ['toolbar-edit', t.editTitleLabel],
    ['stage-hint-text', t.stageHint],
    ['title-editor-hint', t.titleEditorHint],
    ['brand-demo', t.brandDemo],
  ] as const) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  const hintDismissEl = document.getElementById('hint-dismiss');
  if (hintDismissEl) hintDismissEl.setAttribute('aria-label', t.dismissHint);
  const snippetCloseEl = document.getElementById('readme-snippet-close');
  if (snippetCloseEl) snippetCloseEl.setAttribute('aria-label', t.dismissHint);
  stage.title = t.stageHint;

  const symLabel = document.getElementById('logo-with-symbol-label');
  if (symLabel) symLabel.textContent = t.logoWithSymbolLabel;
  if (logoWithSymbolInput) logoWithSymbolInput.checked = sel.logoWithSymbol;
  const monoLabel = document.getElementById('mono-logos-label');
  if (monoLabel) monoLabel.textContent = t.monoLogosLabel;
  if (monoInput) {
    monoInput.checked = sel.logoMode === 'mono';
    monoInput.title = t.monoLogosHint;
  }
  if (iconSearch) {
    iconSearch.placeholder = t.iconPanelSearch;
    iconSearch.setAttribute('aria-label', t.iconPanelSearch);
  }
  if (iconGrid) iconGrid.setAttribute('aria-label', t.iconPanelTitle);
  // 走 updatePanelNotice：加载失败时这里不能被"使用说明"覆盖掉
  updatePanelNotice();
  // 按钮本体也是 chrome：index.html 里的静态文字是中文，英文界面下会露出来
  const iconBtnEl = document.getElementById('icon-btn');
  if (iconBtnEl) {
    iconBtnEl.textContent = t.iconLabel;
    iconBtnEl.title = t.iconPanelTitle;
    iconBtnEl.setAttribute('aria-label', `${t.iconLabel} — ${t.iconPanelTitle}`);
  }

  // 行数 / 速度滑块同步 UI（读 state 而非 sel：sel.rows 可能是 undefined）
  if (rowsRange) {
    rowsRange.value = String(state.rows);
    // 屏幕阅读器读「3 行」而不是裸数字
    rowsRange.setAttribute('aria-valuetext', t.rowsValueText(state.rows));
  }
  if (rowsVal) rowsVal.textContent = String(state.rows);
  if (speedRange) {
    speedRange.value = String(Math.round(sel.speed * 100));
    speedRange.setAttribute('aria-valuetext', t.speedValueText(sel.speed));
  }
  if (speedVal) speedVal.textContent = speedLabel(sel.speed);

  renderPaletteSwatches();
  renderThemeChips();

  renderPlatformOptions(state.locale);
  if (platformSelect) platformSelect.value = sel.platform;

  renderTemplateOptions(state.locale);
  if (templateSelect) templateSelect.value = selectValue();

  for (const btn of localeBtns) {
    btn.setAttribute('aria-pressed', String(btn.dataset.locale === state.locale));
  }
  for (const btn of ratioBtns) {
    btn.setAttribute('aria-pressed', String(btn.dataset.ratio === state.ratio));
  }

  if (mp4Btn) {
    mp4Btn.disabled = !webCodecsOk;
    mp4Btn.title = webCodecsOk ? t.mp4LimitHint : t.mp4Unsupported;
    // 触屏没有 hover：原因必须能在界面上看到，不能只放 title
    if (webCodecsOk) mp4Btn.removeAttribute('aria-describedby');
    else mp4Btn.setAttribute('aria-describedby', 'mp4-note');
  }
  if (mp4Note) {
    mp4Note.hidden = webCodecsOk;
    mp4Note.textContent = webCodecsOk ? '' : t.mp4Unsupported;
  }
  if (quickGifInput) quickGifInput.checked = quickGif;
  if (quickGifLabel) quickGifLabel.textContent = t.quickGifLabel;
  if (quickGifWrap) quickGifWrap.title = t.quickGifLabel;

  // 透明背景：只影响 PNG / SVG，GIF / MP4 会忽略（导出器内部强制不透明）
  if (transparentBgLabel) transparentBgLabel.textContent = t.transparentBgLabel;
  if (transparentBgWrap) transparentBgWrap.title = t.transparentBgHint;
  if (transparentBgInput) transparentBgInput.checked = sel.transparentBg;
  stage.classList.toggle('is-transparent', sel.transparentBg);
  refreshFormatBadge();

  // 文本层输入框：按模板里真实的 text layer 生成（没有副标题的版式不会多一个空框）
  renderTextFields();
  // 卡片内编辑器：语言/版式/比例/撤销后面板文案与位置都要跟上
  if (titleEditorInput) {
    const layer = activeTextLayer();
    titleEditorInput.setAttribute(
      'aria-label',
      layer ? t.textEditorAria(textLayerLabel(layer)) : t.titleEditorAria,
    );
    if (titleEditor && !titleEditor.hidden && document.activeElement !== titleEditorInput) {
      if (layer) titleEditorInput.value = layerText(layer);
    }
  }
  if (titleEditor && !titleEditor.hidden) {
    if (!activeTextLayer()) closeTextEditor();
    else positionTextEditor();
  }
  updateTextOverflowWarning();
  updateHistoryButtons();
  paintPreviewControls();
  // README 片段只属于 GitHub 预设；换平台后立刻收起来，别误导别的场景
  if (sel.platform !== 'github') hideReadmeSnippet();

  refreshMeta();
}

/** 上次 hydrate 时背景的明暗——变了就得按新背景重挑字标的 light/dark 变体 */
let lastDarkBg: boolean | null = null;
/** 最近一次提示过的失败集合，避免每次改色/改速度都重复弹同一条状态 */
let iconFailureKey = '';
let iconFailureTimer: number | undefined;

/** 画布侧只提示一次；重试按钮就在状态行里，不额外弹窗 */
function showIconLoadFailure(count: number, key: string): void {
  if (!status || count <= 0 || key === iconFailureKey) return;
  iconFailureKey = key;
  if (iconFailureTimer !== undefined) window.clearTimeout(iconFailureTimer);
  const t = ui(state.locale);
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'status__retry';
  retry.textContent = t.retryLabel;
  retry.addEventListener('click', () => void retryIconAssets(), { once: true });
  status.replaceChildren(`${t.panelLoadFailed(count)} `, retry);
  iconFailureTimer = window.setTimeout(() => {
    iconFailureTimer = undefined;
    if (status?.contains(retry)) setStatus('');
  }, 12000);
}

async function retryIconAssets(): Promise<void> {
  const t = ui(state.locale);
  iconFailureKey = '';
  if (iconFailureTimer !== undefined) {
    window.clearTimeout(iconFailureTimer);
    iconFailureTimer = undefined;
  }
  setStatus(t.iconPanelLoading);
  try {
    const [{ forgetFailedIcons }, { resetLogoCache }] = await Promise.all([
      import('./core/simple-icons'),
      import('./core/logos'),
    ]);
    forgetFailedIcons();
    resetLogoCache();
    await hydrateIcons();
    if (status?.textContent === t.iconPanelLoading) setStatus('');
  } catch (err) {
    console.warn('[sponsored-by] 重试品牌图标失败', err);
    setStatus('');
  }
}

/**
 * 预览期补齐品牌图标 SVG。
 *
 * scene() 对「没有出现在 iconSvgs 里的非 emoji 图标」是**静默跳过**的（首屏不等 CDN）。
 * 所以选了品牌图标却不预取，画布上什么都不会出现——用户会以为功能坏了。
 * 取完写回 state 即可：rAF 循环每帧重渲染，下一帧自动出现。
 */
async function hydrateIcons(): Promise<void> {
  // 只处理需要走网络的品牌图标；emoji 与上传图已有本地资源
  const need = state.icons.map((i) => i.icon).filter((k) => !k.startsWith('emoji:'));
  const brandNeed = need.filter((k) => !k.startsWith('upload:'));
  if (brandNeed.length === 0) {
    iconFailureKey = '';
    return;
  }
  try {
    const bg = state.palette?.bg ?? state.template.palette.bg;
    const { isDarkColor } = await import('./core/logos');
    const darkBg = isDarkColor(bg);
    // 背景明暗翻转时（白底 ↔ 深底）必须换变体，否则深字标在深底上直接消失。
    if (lastDarkBg !== null && lastDarkBg !== darkBg) {
      // 背景明暗翻转只需重挑品牌字标的 light/dark 变体；
      // 上传图的墨迹盒/宽高比与背景无关，清掉会让它缩回正方形。
      state.logoSvgs = {};
      state.logoAspect = Object.fromEntries(
        Object.entries(state.logoAspect ?? {}).filter(([key]) => key.startsWith('upload:')),
      );
      state.logoInk = Object.fromEntries(
        Object.entries(state.logoInk ?? {}).filter(([key]) => key.startsWith('upload:')),
      );
    }
    lastDarkBg = darkBg;
    // 符号：sceneIconSvgs 会保留已有内容（上传的 SVG / dataURL）并补齐
    // simple-icons 与 svgl: 的缺口（含按背景挑明暗变体）。
    state.iconSvgs = await sceneIconSvgs(state);
    // 官方完整字标：有则替代「符号 + 文字」。
    const { svgs, aspect, ink } = await sceneLogoSvgs(state, bg);
    if (Object.keys(svgs).length > 0) {
      state.logoSvgs = { ...(state.logoSvgs ?? {}), ...svgs };
      state.logoAspect = { ...(state.logoAspect ?? {}), ...aspect };
      state.logoInk = { ...(state.logoInk ?? {}), ...ink };
    }
    // 符号和字标都没有才算真的失败（只有字标失败时仍会显示“符号 + 文字”）
    const missing = brandNeed.filter((k) => !state.iconSvgs?.[k] && !state.logoSvgs?.[k]);
    if (missing.length > 0) showIconLoadFailure(missing.length, missing.join('|'));
    else iconFailureKey = '';
  } catch (err) {
    // 例如动态 import 失败 / CDN 请求抛出；不要让 hydrate 变成未捕获 rejection
    console.warn('[sponsored-by] 品牌图标加载失败', err);
    showIconLoadFailure(brandNeed.length, 'error:' + brandNeed.join('|'));
  }
}

/**
 * 把异步预取来的资源带过重建。
 *
 * iconSvgs / logoSvgs / logoAspect 是渲染前从 CDN 抓的，不来自 sel，
 * 而 createDefaultState 只会按 sel 重算 state——不带过来就会把 logo 全丢光，
 * 表现为「拖一下滑块，logo 没了，只剩排版出来的品牌名」。
 */
function carryAssets(next: SceneState, prev: SceneState): SceneState {
  return {
    ...next,
    iconSvgs: prev.iconSvgs,
    logoSvgs: prev.logoSvgs,
    logoAspect: prev.logoAspect,
    logoInk: prev.logoInk,
    labelEm: prev.labelEm,
  };
}

interface CommitOptions {
  /** 连续同类操作合并键（拖动滑杆 / 取色器 / 输入标题） */
  coalesceKey?: string;
  /** false = 本次变更不进入撤销栈（恢复历史等内部操作用） */
  history?: boolean;
}

/** 把当前 Selection 压进撤销栈。任何新编辑都会收掉旧的「随机撤销」按钮 */
function commitSelection(coalesceKey?: string): void {
  // 分享链接 → 首次真实编辑：草稿接管（清掉 hash），刷新后不再被旧链接覆盖
  takeOverDraftFromHash();
  editHistory.push(sel, coalesceKey === undefined ? {} : { coalesceKey });
  clearLegacyUndo();
  updateHistoryButtons();
}

/** 工具栏撤销 / 重做按钮：禁用态与 tooltip 跟随历史深度和语言 */
function updateHistoryButtons(): void {
  const strings = ui(state.locale);
  if (historyButtons) historyButtons.setAttribute('aria-label', strings.historyGroupLabel);
  if (historyUndoBtn) {
    historyUndoBtn.disabled = !editHistory.canUndo();
    historyUndoBtn.title = strings.undoActionLabel;
    historyUndoBtn.setAttribute('aria-label', strings.undoActionLabel);
  }
  if (historyRedoBtn) {
    historyRedoBtn.disabled = !editHistory.canRedo();
    historyRedoBtn.title = strings.redoActionLabel;
    historyRedoBtn.setAttribute('aria-label', strings.redoActionLabel);
  }
}

/**
 * 滑块 / 取色器这类连续输入的轻量重建。
 *
 * 与 apply() 的两点区别，都是踩过的坑：
 * - **不重置时间轴**：滑块用 input 事件连续触发，每次重置 start 会让画面僵在 t=0；
 * - **不刷全量 chrome**：refreshChrome() 会重建版式/平台下拉与色板 DOM，
 *   拖动过程中把正在操作的 <input> 销毁掉。
 */
function rebuildLive(partial: Partial<Selection>, commit: CommitOptions = {}): void {
  const prev = state;
  sel = { ...sel, ...partial };
  state = carryAssets(buildState(), prev);
  loopSeconds = loopSecondsFor(state);
  // 暂停时循环长度可能被滑块改短：夹住当前帧并重画新状态
  if (manualPaused) {
    pausedAt = Math.min(pausedAt, Math.max(0, loopSeconds - 0.001));
    renderAt(pausedAt);
  } else if (reducedMotion) {
    renderAt(0);
  }
  refreshMeta();
  paintPreviewControls();
  scheduleDraftSave();
  if (commit.history !== false) commitSelection(commit.coalesceKey);
  // 背景色一变，字标的 light/dark 变体就得重新挑（深字标在深底上会消失）
  if (partial.palette) void hydrateIcons();
}

/** 切换版式 / 语言 / 比例时重建 state。用户内容（icons/text/palette）透传，
 *  避免换版式时把已选图标和文案清空——切换的是版式，不是用户的作品。 */
function apply(partial: Partial<Selection>, commit: CommitOptions = {}): void {
  const prev = state;
  sel = { ...sel, ...partial };
  state = carryAssets(buildState(), prev);
  loopSeconds = loopSecondsFor(state);
  start = performance.now(); // 切换后从 t=0 起播，动作干净
  if (manualPaused) {
    pausedAt = Math.min(pausedAt, Math.max(0, loopSeconds - 0.001));
    renderAt(pausedAt);
  } else if (reducedMotion) {
    renderAt(0);
  }
  refreshChrome();
  setStatus('');
  scheduleDraftSave();
  if (commit.history !== false) commitSelection(commit.coalesceKey);
  void hydrateIcons(); // 品牌图标是异步 CDN 拉取，不阻塞首帧
}

/**
 * 用历史快照恢复：画布、工具条、草稿、图标面板都要跟着回来。
 * 不经过 apply()，避免把「恢复」本身又当成一次新编辑。
 */
function restoreSelection(next: Selection): void {
  const prev = state;
  sel = {
    ...next,
    icons: next.icons.map((item) => ({ ...item })),
    text: structuredClone(next.text),
    palette: { ...next.palette },
  };
  state = carryAssets(buildState(), prev);
  loopSeconds = loopSecondsFor(state);
  start = performance.now();
  if (manualPaused) {
    pausedAt = Math.min(pausedAt, Math.max(0, loopSeconds - 0.001));
    renderAt(pausedAt);
  } else if (reducedMotion) {
    renderAt(0);
  }
  refreshChrome();
  setStatus('');
  scheduleDraftSave();
  if (iconPanel && !iconPanel.hidden) void renderIconGrid();
  void hydrateIcons();
}

/** Cmd/Ctrl+Z */
function performUndo(): void {
  const prev = editHistory.undo();
  if (prev === undefined) return;
  clearLegacyUndo();
  restoreSelection(prev);
  updateHistoryButtons();
  flashStatus(ui(state.locale).undoDone, 1600);
}

/** Cmd/Ctrl+Shift+Z 或 Ctrl+Y */
function performRedo(): void {
  const next = editHistory.redo();
  if (next === undefined) return;
  clearLegacyUndo();
  restoreSelection(next);
  updateHistoryButtons();
  flashStatus(ui(state.locale).redoDone, 1600);
}

platformSelect?.addEventListener('change', () => {
  const id = platformSelect.value as PlatformId;
  const preset = getPreset(id);
  // 平台预设带推荐比例时顺手套用（换平台 = 明确的发布意图）；
  // 用户之后仍可点比例按钮改回来，不会被锁死。
  if (preset.ratio && preset.ratio !== sel.ratio) {
    apply({ platform: id, ratio: preset.ratio });
    return;
  }
  // 比例不变时只换导出参数：不重建 state、不重置时间轴
  sel = { ...sel, platform: id };
  refreshChrome();
  setStatus('');
  scheduleDraftSave();
  commitSelection();
});

quickGifInput?.addEventListener('change', () => {
  quickGif = quickGifInput.checked;
  refreshMeta();
});

templateSelect?.addEventListener('change', () => {
  const [templateId, variantId] = templateSelect.value.split('|');
  if (!templateId) return;
  // 色板是版式属性而非用户内容：把 sponsored-by 改成白底再切到 no-sponsors（近黑底），
  // 若继续透传覆盖色，新版式直接糊成一片。换版式一律回到新模板的默认色板。
  apply({ templateId, variantId: variantId || undefined, palette: {} });
});

for (const btn of localeBtns) {
  btn.addEventListener('click', () => {
    const locale = btn.dataset.locale as Locale | undefined;
    if (locale && locale !== state.locale) apply({ locale });
  });
}

for (const btn of ratioBtns) {
  btn.addEventListener('click', () => {
    const ratio = btn.dataset.ratio as Ratio | undefined;
    if (ratio && ratio !== state.ratio) apply({ ratio });
  });
}

// —— 图标面板 ——
//
// 图标选择是本项目区别于「纯 emoji 梗图生成器」的关键能力（SPEC §1 立柱）。
// 面板是异步的（CDN 索引 + 逐个 SVG 预取），所以不阻塞首屏；
// 选中图标后写入 sel.icons → apply() 重建 state → scene() 据此渲染。
const iconBtn = document.getElementById('icon-btn') as HTMLButtonElement | null;
const iconPanel = document.getElementById('icon-panel') as HTMLElement | null;
const iconClose = document.getElementById('icon-close') as HTMLButtonElement | null;
const iconSearch = document.getElementById('icon-search') as HTMLInputElement | null;
const iconGrid = document.getElementById('icon-grid') as HTMLElement | null;
const iconHint = document.getElementById('icon-hint') as HTMLElement | null;
const iconClear = document.getElementById('icon-clear') as HTMLButtonElement | null;
const iconUploads = document.getElementById('icon-uploads') as HTMLElement | null;
const logoWithSymbolInput = document.getElementById('logo-with-symbol') as HTMLInputElement | null;
const monoInput = document.getElementById('mono-logos') as HTMLInputElement | null;
const iconSelected = document.getElementById('icon-selected') as HTMLElement | null;
const iconRetry = document.getElementById('icon-retry') as HTMLButtonElement | null;
/** 按模板实际文本层动态生成的输入框容器（标题 / 副标题 / 署名…） */
const textFieldsHost = document.getElementById('text-fields') as HTMLElement | null;
/** 当前模板的输入框：key = TextLayer.id（refreshChrome 重建） */
const textInputs = new Map<string, HTMLTextAreaElement>();
// 卡片内标题编辑器（覆盖当前文本层的实际范围；输入实时写回 sel.text）
const titleEditor = document.getElementById('title-editor') as HTMLElement | null;
const titleEditorInput = document.getElementById('title-editor-input') as HTMLTextAreaElement | null;
const titleEditorHint = document.getElementById('title-editor-hint') as HTMLElement | null;
/** 当前正在卡片上编辑的文本层 id；null = 编辑器关闭 */
let activeTextLayerId: string | null = null;
const stageWarn = document.getElementById('stage-warn') as HTMLElement | null;
// 透明背景开关（只影响 PNG / SVG）
const transparentBgInput = document.getElementById('transparent-bg') as HTMLInputElement | null;
const transparentBgLabel = document.getElementById('transparent-bg-label');
const transparentBgWrap = document.getElementById('transparent-bg-wrap');

// 透明背景：只影响 PNG / SVG；开着时给一条「撞色请自己确认」的轻提示，不阻止导出
transparentBgInput?.addEventListener('change', () => {
  const value = transparentBgInput.checked;
  apply({ transparentBg: value });
  if (value) flashStatus(ui(state.locale).transparentBgNotice, 3500);
});
// 撤销 / 重做按钮与预览控制（暂停 + 时间轴）
const historyUndoBtn = document.getElementById('history-undo') as HTMLButtonElement | null;
const historyRedoBtn = document.getElementById('history-redo') as HTMLButtonElement | null;
const historyButtons = document.getElementById('history-buttons') as HTMLElement | null;
const previewToggle = document.getElementById('preview-toggle') as HTMLButtonElement | null;
const previewScrub = document.getElementById('preview-scrub') as HTMLInputElement | null;
const previewTimeEl = document.getElementById('preview-time') as HTMLElement | null;

let iconSearchQuery = '';
let iconIndexPromise: Promise<string[]> | null = null;
/** 本轮网格里预览图拉失败的格子数（用于错误提示与重试按钮） */
let previewFailures = 0;

// —— 最近用过的品牌 ——
//
// 常用品牌每次都要重新搜索才能找到。只记品牌（simple-icons / svgl），
// emoji 和上传图不进这个列表——它们本来就在面板最前面。
const RECENT_ICONS_KEY = 'sponsored-by:recent-icons:v1';
const RECENT_ICONS_LIMIT = 8;

interface RecentIcon {
  icon: string;
  label: string;
}

function isBrandIconKey(key: string): boolean {
  return key.startsWith('simple-icons:') || key.startsWith('svgl:');
}

function loadRecentIcons(): RecentIcon[] {
  try {
    const raw = localStorage.getItem(RECENT_ICONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RecentIcon[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const icon = rec.icon;
      if (typeof icon !== 'string' || !isBrandIconKey(icon)) continue;
      const label = typeof rec.label === 'string' ? rec.label : (icon.split(':')[1] ?? icon);
      out.push({ icon, label });
      if (out.length >= RECENT_ICONS_LIMIT) break;
    }
    return out;
  } catch {
    return [];
  }
}

let recentIcons = loadRecentIcons();

/** 选中一个品牌后记入最近列表（最新在前，去重、限长） */
function rememberIcon(item: TickerItem): void {
  if (!isBrandIconKey(item.icon)) return;
  const next: RecentIcon[] = [
    { icon: item.icon, label: item.label || chipLabel(item) },
    ...recentIcons.filter((rec) => rec.icon !== item.icon),
  ].slice(0, RECENT_ICONS_LIMIT);
  recentIcons = next;
  try {
    localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(next));
  } catch {
    /* 隐私模式 / 配额满：最近列表是加分项，不阻塞主流程 */
  }
}

/** 打开面板前的焦点位置：关闭时按原路返回，键盘用户不会「丢在山里」 */
let iconPanelTrigger: HTMLElement | null = null;

/** 面板内所有可聚焦元素（动态网格也算，打开后 Tab 不应逃出对话框） */
function iconPanelFocusables(): HTMLElement[] {
  if (!iconPanel) return [];
  return [
    ...iconPanel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => el.getClientRects().length > 0);
}

/** 打开面板：首次加载索引（simple-icons + SVGL 元数据），之后只渲染缓存结果 */
async function openIconPanel(): Promise<void> {
  if (!iconPanel) return;
  const active = document.activeElement;
  iconPanelTrigger =
    active instanceof HTMLElement && active !== document.body && !iconPanel.contains(active)
      ? active
      : iconBtn;
  if (!iconIndexPromise) iconIndexPromise = loadIconIndex();
  iconPanel.hidden = false;
  blurTextInputs();
  iconSearch?.focus();
  await renderIconGrid();
}

/** 关闭面板并把焦点还给触发它的按钮（Esc / Close / 点遮罩都走这里） */
function closeIconPanel(): void {
  if (!iconPanel || iconPanel.hidden) return;
  iconPanel.hidden = true;
  const target = iconPanelTrigger ?? iconBtn;
  iconPanelTrigger = null;
  target?.focus();
}

async function loadIconIndex(): Promise<string[]> {
  const { searchBrands } = await import('./core/simple-icons');
  await searchBrands(''); // 预热：simple-icons 索引 + SVGL 元数据
  return [];
}

/**
 * 预览用的并发池：一次最多 8 个 SVG 请求。
 * 搜索会一次铺满 60 个格子，全并发会被 CDN 限流打回，表现为大片空白格子。
 */
const PREVIEW_PARALLEL = 8;
let previewActive = 0;
const previewWaiting: Array<() => void> = [];

async function withPreviewSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (previewActive >= PREVIEW_PARALLEL) {
    await new Promise<void>((resolve) => previewWaiting.push(resolve));
  }
  previewActive++;
  try {
    return await fn();
  } finally {
    previewActive--;
    previewWaiting.shift()?.();
  }
}

/** 面板预览用的符号 SVG：simple-icons 走自己的 CDN；svgl: 走 SVGL（浅色 UI 用 light 变体） */
async function brandPreviewSvg(hit: BrandHit): Promise<string | undefined> {
  const { getIconSvg } = await import('./core/simple-icons');
  return withPreviewSlot(async () => {
    if (hit.key.startsWith('simple-icons:')) {
      return getIconSvg(hit.key.slice('simple-icons:'.length)).catch(() => undefined);
    }
    if (hit.key.startsWith('svgl:')) {
      const { loadSvglAssets, getLogoAsset, pickVariant, fetchLogo } = await import('./core/logos');
      await loadSvglAssets();
      const url = pickVariant(getLogoAsset(hit.label)?.symbol, false);
      return url ? fetchLogo(url).catch(() => undefined) : undefined;
    }
    return undefined;
  });
}

/**
 * 面板底部提示区：正常时是使用说明，有格子加载失败时换成错误态 + 重试。
 *
 * 断网 / CDN 不可达时（实测阻断后 92 格里 60 格空白）原来什么提示都没有，
 * 用户无法判断是自己点坏了还是网站坏了。
 */
function updatePanelNotice(): void {
  if (!iconHint) return;
  const t = ui(state.locale);
  if (previewFailures > 0) {
    iconHint.textContent = t.panelLoadFailed(previewFailures);
    iconHint.classList.add('is-warn');
    if (iconRetry) iconRetry.hidden = false;
    return;
  }
  iconHint.textContent = t.iconPanelHint;
  iconHint.classList.remove('is-warn');
  if (iconRetry) iconRetry.hidden = true;
}

/** 已选图标的清单：能核对顺序、能拖动 / 键盘调整顺序、能单独移除。 */
function renderSelected(): void {
  if (!iconSelected) return;
  const t = ui(state.locale);
  iconSelected.replaceChildren();
  if (sel.icons.length === 0) {
    iconSelected.hidden = true;
    return;
  }
  iconSelected.hidden = false;
  const head = document.createElement('span');
  head.className = 'icon-selected__label';
  head.textContent = t.selectedCount(sel.icons.length);
  iconSelected.appendChild(head);

  sel.icons.forEach((item, idx) => {
    const text = chipLabel(item);
    const chip = document.createElement('span');
    chip.className = 'chip';
    // 原始下标存在 DOM 上：拖动只改 DOM 顺序，松手后按 dataset 还原成新数组
    chip.dataset.index = String(idx);
    // chip 本身可聚焦：方向键上下移动是键盘用户唯一的排序方式
    chip.tabIndex = 0;
    chip.title = t.chipMoveHint(text);
    chip.setAttribute('aria-label', t.chipMoveHint(text));
    chip.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowUp' && event.key !== 'ArrowRight' && event.key !== 'ArrowDown') {
        return;
      }
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      moveSelectedIcon(idx, idx + delta);
    });

    const grip = document.createElement('span');
    grip.className = 'chip__grip';
    grip.textContent = '⠿';
    grip.setAttribute('aria-hidden', 'true');
    chip.appendChild(grip);
    attachChipDrag(chip, grip);

    const name = document.createElement('span');
    name.textContent = text;
    chip.appendChild(name);

    const kill = document.createElement('button');
    kill.type = 'button';
    kill.textContent = '×';
    kill.title = t.removeLabel(text);
    kill.setAttribute('aria-label', t.removeLabel(text));
    kill.addEventListener('click', () => {
      const next = sel.icons.filter((_, i) => i !== idx);
      sel.icons = next;
      apply({ icons: next });
      renderIconGrid();
    });
    chip.appendChild(kill);
    iconSelected.appendChild(chip);
  });
}

/** 键盘排序：把第 from 项移到 to；越界直接忽略，不产生空撤销步 */
function moveSelectedIcon(from: number, to: number): void {
  if (to < 0 || to >= sel.icons.length || from === to) return;
  const next = [...sel.icons];
  const [moved] = next.splice(from, 1);
  if (!moved) return;
  next.splice(to, 0, moved);
  sel.icons = next;
  apply({ icons: next });
  void renderIconGrid();
  // 重新渲染后把焦点还给同一项，键盘用户可以连续按方向键
  requestAnimationFrame(() => {
    iconSelected?.querySelectorAll<HTMLElement>('.chip')[to]?.focus();
  });
}

/** 一次只可能有一个 chip 在拖：模块级共享状态，避免每个手柄各存一份 */
let chipDrag: {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
} | null = null;

/**
 * 拖动排序（鼠标 / 触屏共用 Pointer Events）。
 *
 * 只有手柄吃手势（`touch-action: none`），chip 其余部分保持可滚动。
 * 拖动过程中只给被拖 chip 加位移（不改 DOM 顺序），松手时按落点算一次新
 * 顺序——整次拖拽只产生一步撤销，也不会因为节点来回挪动而抖动。
 */
function attachChipDrag(chip: HTMLElement, grip: HTMLElement): void {
  const resetVisual = (): void => {
    chip.classList.remove('is-dragging');
    chip.style.transform = '';
    chip.style.zIndex = '';
  };

  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    chipDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    grip.setPointerCapture(event.pointerId);
    chip.classList.add('is-dragging');
    chip.style.zIndex = '2';
  });

  grip.addEventListener('pointermove', (event) => {
    if (!chipDrag || chipDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - chipDrag.startX;
    const dy = event.clientY - chipDrag.startY;
    // 小位移算点击/误触，不进入拖拽态，避免轻点手柄也重排
    if (!chipDrag.moved && Math.hypot(dx, dy) < 6) return;
    chipDrag.moved = true;
    chipDrag.lastX = event.clientX;
    chipDrag.lastY = event.clientY;
    chip.style.transform = `translate(${dx}px, ${dy}px)`;
  });

  grip.addEventListener('pointerup', (event) => {
    if (!chipDrag || chipDrag.pointerId !== event.pointerId) return;
    const drag = chipDrag;
    chipDrag = null;
    resetVisual();
    try {
      grip.releasePointerCapture(event.pointerId);
    } catch {
      /* 指针已被系统释放 */
    }
    if (!drag.moved || !iconSelected) return;

    const chips = [...iconSelected.querySelectorAll<HTMLElement>('.chip')];
    const from = Number(chip.dataset.index);
    if (!Number.isInteger(from) || from < 0 || from >= sel.icons.length) return;

    // 落点最近的非拖拽 chip：指针在它的「后面」就插到它之后，否则插到它之前
    const others = chips.filter((el) => el !== chip);
    let nearest: HTMLElement | null = null;
    let nearestDist = Infinity;
    for (const el of others) {
      const rect = el.getBoundingClientRect();
      const dist = Math.hypot(drag.lastX - (rect.left + rect.width / 2), drag.lastY - (rect.top + rect.height / 2));
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = el;
      }
    }
    const items = [...sel.icons];
    const [moved] = items.splice(from, 1);
    if (!moved) return;
    let insertAt = from;
    if (nearest) {
      const rect = nearest.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      // 横向 / 纵向哪个位移更明显就用哪个判断前后，兼顾换行后的网格
      const after = Math.abs(drag.lastX - centerX) >= Math.abs(drag.lastY - centerY)
        ? drag.lastX > centerX
        : drag.lastY > centerY;
      const anchorPos = others.indexOf(nearest);
      insertAt = after ? anchorPos + 1 : anchorPos;
    }
    items.splice(insertAt, 0, moved);
    if (items.some((item, i) => item !== sel.icons[i])) {
      sel.icons = items;
      apply({ icons: items });
      void renderIconGrid();
    }
  });

  grip.addEventListener('pointercancel', (event) => {
    if (!chipDrag || chipDrag.pointerId !== event.pointerId) return;
    chipDrag = null;
    // 系统取消（来电 / 手势冲突）：恢复到拖动前的顺序，不写历史
    resetVisual();
  });
}

/** 已选项的显示名：emoji 用字形本身，其余用品牌名或上传文件名 */
function chipLabel(item: TickerItem): string {
  if (item.icon.startsWith('emoji:')) return item.icon.slice('emoji:'.length);
  if (item.label) return item.label;
  if (item.icon.startsWith('upload:')) return item.icon.slice('upload:'.length);
  return item.icon.split(':')[1] ?? item.icon;
}

/** 上传格子：正常网格与「搜索无结果」两处复用，避免两套外观走样 */
function iconUploadCell(label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-cell is-upload';
  btn.dataset.key = '__upload__';
  const plus = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  plus.setAttribute('viewBox', '0 0 24 24');
  plus.setAttribute('fill', 'none');
  plus.setAttribute('stroke', 'currentColor');
  plus.setAttribute('stroke-width', '1.8');
  plus.setAttribute('stroke-linecap', 'round');
  plus.innerHTML = '<path d="M12 5v14M5 12h14"/>';
  const visual = document.createElement('span');
  visual.className = 'icon-visual';
  visual.appendChild(plus);
  btn.appendChild(visual);
  const text = document.createElement('span');
  text.textContent = label;
  btn.appendChild(text);
  btn.addEventListener('click', () => document.getElementById('icon-upload')?.click());
  return btn;
}

async function renderIconGrid(): Promise<void> {
  if (!iconGrid) return;
  const t = ui(state.locale);
  // 选中/取消图标后这里会整块重建网格，被聚焦的格子会随 DOM 一起消失。
  // 记住它的 key，重建完再把焦点放回去——否则键盘用户每选一个就要
  // 从面板开头重新 Tab。
  const focusedKey =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.closest<HTMLElement>('.icon-cell')?.dataset.key
      : undefined;
  const restoreFocus = (): void => {
    if (!focusedKey || !iconGrid) return;
    // 异步加载期间用户可能已经点去搜索框，只有焦点仍掉在 body 或还在网格里时才接管
    const active = document.activeElement;
    if (active && active !== document.body && !iconGrid.contains(active)) return;
    iconGrid
      .querySelector<HTMLElement>(`.icon-cell[data-key="${CSS.escape(focusedKey)}"]`)
      ?.focus();
  };
  iconGrid.replaceChildren();
  previewFailures = 0;
  updatePanelNotice();
  renderSelected();
  renderUploads();
  iconGrid.textContent = t.iconPanelLoading;

  const { searchBrands, EMOJI_PRESETS } = await import('./core/simple-icons');
  const allHits = await searchBrands(iconSearchQuery);
  // 非搜索态把最近用过的品牌置顶，并从普通结果里剔掉，避免同一个图标出现两次
  const pinnedKeys = new Set(iconSearchQuery ? [] : recentIcons.map((rec) => rec.icon));
  const hits = allHits.filter((hit) => !pinnedKeys.has(hit.key));

  // emoji 快捷面板 + 品牌结果，共用同一网格。
  // 搜索时不再显示 emoji——用户在找品牌，emoji 只是噪音。
  // 上传格子放在最前面：用户找「上传图标」会先看图标列表，而不是面板角落。
  // 只在非搜索态显示（搜索时用户明确在找已有品牌）。
  const cells: Array<{
    key?: string;
    label?: string;
    svg?: Promise<string | undefined>;
    emoji?: string;
    upload?: boolean;
    heading?: string;
  }> = [];
  if (!iconSearchQuery) {
    if (recentIcons.length > 0) {
      cells.push({ heading: t.recentIconsLabel });
      for (const rec of recentIcons) {
        cells.push({ key: rec.icon, label: rec.label, svg: brandPreviewSvg({ key: rec.icon, label: rec.label }) });
      }
    }
    cells.push({ key: '__upload__', label: t.uploadBtn, upload: true });
    for (const e of EMOJI_PRESETS) cells.push({ key: `emoji:${e}`, label: '', emoji: e });
  }
  for (const h of hits) cells.push({ key: h.key, label: h.label, svg: brandPreviewSvg(h) });

  if (cells.length === 0) {
    // 空结果不只给一句说明：直接摆出「上传自己的 logo」入口——搜不到的品牌
    // 往往只能上传用户自己的文件。
    const empty = document.createElement('p');
    empty.className = 'icon-empty';
    empty.textContent = t.iconNoResult;
    iconGrid.replaceChildren(empty, iconUploadCell(t.uploadOwnLabel));
    restoreFocus();
    return;
  }

  iconGrid.replaceChildren();
  for (const cell of cells) {
    if (cell.heading) {
      const heading = document.createElement('p');
      heading.className = 'icon-grid__label';
      heading.textContent = cell.heading;
      iconGrid.appendChild(heading);
      continue;
    }

    // 上传格子：不参与选中状态，点它直接开文件选择
    if (cell.upload) {
      iconGrid.appendChild(iconUploadCell(cell.label ?? t.uploadBtn));
      continue;
    }
    if (!cell.key) continue;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-cell';
    btn.setAttribute('role', 'option');
    btn.dataset.key = cell.key;
    // emoji 格子没有文字标签，但屏幕阅读器仍需一个可读名称
    btn.setAttribute('aria-label', cell.label || cell.emoji || cell.key);
    const key = cell.key;

    const selected = sel.icons.some((i) => i.icon === key);
    btn.setAttribute('aria-pressed', String(selected));

    const visual = document.createElement('span');
    visual.className = 'icon-visual';
    if (cell.emoji) {
      visual.className = 'icon-visual emoji';
      visual.textContent = cell.emoji;
    } else if (cell.svg) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.style.width = '32px';
      svg.style.height = '32px';
      cell.svg
        .then((text) => {
          if (!text) {
            // 拉不到就标红，别留一个空框让用户猜
            btn.classList.add('is-failed');
            previewFailures += 1;
            updatePanelNotice();
            return;
          }
          const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
          // 视口必须用 SVG 自己的 viewBox：simple-icons 是 24×24，但 SVGL 的符号
          // 视口各异（如 256×222）。写死 24×24 会让后者只显示左上角一小块，
          // 看起来就是一个黑方块。
          const vb = doc.documentElement.getAttribute('viewBox');
          if (vb) svg.setAttribute('viewBox', vb);
          // 整段内联而不是只取第一个 path：SVGL 的符号是多 path + clipPath/mask
          // 的组合，只取第一个会把 logo 缺一半。颜色一律用文件自带值（见 index.html
          // 的注释）；id 必须加前缀，否则 90 个 logo 共享一个文档时
          // url(#a) 会指到别人的定义上。
          svg.innerHTML = scopeSvgIds(doc.documentElement.innerHTML, cell.key ?? '');
        })
        .catch(() => {});
      visual.appendChild(svg);
    }
    btn.appendChild(visual);

    // emoji 格子不带文字标签（label 为空）——emoji 本身就是图标，重复显示两遍纯属噪音
    if (cell.label) {
      const label = document.createElement('span');
      label.textContent = cell.label;
      btn.appendChild(label);
    }

    btn.addEventListener('click', () => {
      const idx = sel.icons.findIndex((i) => i.icon === key);
      const item: TickerItem = { icon: key, label: cell.label || undefined };
      // 不可变更新：sel.icons 可能与 state.icons 共用同一个数组引用，
      // 就地 splice 会让「撤销快照」跟着一起变
      const next = idx >= 0 ? sel.icons.filter((_, i) => i !== idx) : [...sel.icons, item];
      if (idx < 0) rememberIcon(item);
      sel.icons = next;
      apply({ icons: next });
      renderIconGrid();
    });
    iconGrid.appendChild(btn);
  }
  restoreFocus();
}

/**
 * 「已上传」列表：缩略图 + 可编辑的文字标签 + 移除。
 *
 * 文字只改 sel.icons 里同一个对象（state.icons 与它共享引用），下一帧 rAF
 * 就会按新 label 重排——不调 apply()，否则会重建面板把正在输入的框销毁。
 */
function renderUploads(): void {
  if (!iconUploads) return;
  const t = ui(state.locale);
  const ups = sel.icons.filter((i) => i.icon.startsWith('upload:'));
  iconUploads.replaceChildren();
  iconUploads.hidden = ups.length === 0;

  for (const item of ups) {
    const row = document.createElement('div');
    row.className = 'icon-upload-row';

    const thumb = document.createElement('span');
    thumb.className = 'thumb';
    const content = state.iconSvgs?.[item.icon];
    if (content?.startsWith('data:')) {
      const img = document.createElement('img');
      img.src = content;
      img.alt = '';
      thumb.appendChild(img);
    } else if (content) {
      const doc = new DOMParser().parseFromString(content, 'image/svg+xml');
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const vb = doc.documentElement.getAttribute('viewBox');
      s.setAttribute('viewBox', vb ?? '0 0 24 24');
      s.innerHTML = scopeSvgIds(doc.documentElement.innerHTML, item.icon);
      thumb.appendChild(s);
    }
    row.appendChild(thumb);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = item.label ?? '';
    input.placeholder = t.uploadLabelPlaceholder;
    input.addEventListener('input', () => {
      item.label = input.value.trim() || undefined;
    });
    row.appendChild(input);

    const kill = document.createElement('button');
    kill.type = 'button';
    kill.className = 'kill';
    kill.textContent = '×';
    kill.title = t.iconPanelClear;
    kill.setAttribute('aria-label', t.iconPanelClear);
    kill.addEventListener('click', () => {
      const next = sel.icons.filter((i) => i.icon !== item.icon);
      sel.icons = next;
      apply({ icons: next });
      renderIconGrid();
    });
    row.appendChild(kill);

    iconUploads.appendChild(row);
  }
}

iconBtn?.addEventListener('click', () => openIconPanel());
iconClose?.addEventListener('click', closeIconPanel);
iconPanel?.addEventListener('click', (e) => {
  if (e.target === iconPanel) closeIconPanel();
});

/** Tab / Shift+Tab 在面板首尾循环，焦点不逃到背后的页面 */
iconPanel?.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab' || !iconPanel) return;
  const items = iconPanelFocusables();
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!first || !last) return;
  if (event.shiftKey) {
    if (active === first || !iconPanel.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last || !iconPanel.contains(active)) {
    event.preventDefault();
    first.focus();
  }
});

/**
 * 图标网格键盘：方向键按几何位置找最近的邻格，不依赖列数。
 *
 * Enter / Space 必须显式触发点击：格子带 `role="option"`（listbox 语义），
 * 浏览器因此不再执行 <button> 的原生键盘激活，不手动处理的话键盘用户
 * 只能移动焦点、选不了图标。
 */
function handleIconGridArrows(event: KeyboardEvent): void {
  const key = event.key;
  if (!iconGrid) return;
  const current = (event.target as HTMLElement | null)?.closest<HTMLElement>('.icon-cell');
  if (!current) return;
  if (key === 'Enter' || key === ' ') {
    event.preventDefault();
    current.click();
    return;
  }
  if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') return;
  const cells = [...iconGrid.querySelectorAll<HTMLElement>('.icon-cell')].filter(
    (el) => el.getClientRects().length > 0,
  );
  if (cells.length < 2) return;
  const rect = current.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of cells) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    // 只考虑该方向上的格子，横向移动允许少量纵向漂移
    if (key === 'ArrowRight' && dx <= 4) continue;
    if (key === 'ArrowLeft' && dx >= -4) continue;
    if (key === 'ArrowDown' && dy <= 4) continue;
    if (key === 'ArrowUp' && dy >= -4) continue;
    const main = horizontal ? Math.abs(dx) : Math.abs(dy);
    const cross = horizontal ? Math.abs(dy) : Math.abs(dx);
    const score = main + cross * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    event.preventDefault();
    best.focus();
  }
}
iconGrid?.addEventListener('keydown', handleIconGridArrows);

// 视觉上是模态框，键盘用户按 Esc 应该能关；不拦截的话只能去右上角找 Close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && iconPanel && !iconPanel.hidden) {
    e.preventDefault();
    closeIconPanel();
  }
});
iconSearch?.addEventListener('input', () => {
  iconSearchQuery = iconSearch.value.trim();
  renderIconGrid();
});
iconClear?.addEventListener('click', () => {
  if (sel.icons.length === 0) return;
  // 清空是破坏性动作：给一次撤销快照，别让 9 个品牌一键消失
  const before = captureSelection();
  sel.icons = [];
  apply({ icons: [] });
  setLegacyUndo(before);
  renderIconGrid();
  flashStatus(ui(state.locale).iconsCleared, 2500);
});

// 重试：丢掉失败缓存后重新渲染一次网格。成功的图不重下（CDN 也不会凭空变好，
// 但重下同一张图纯属浪费）。
iconRetry?.addEventListener('click', () => {
  void (async () => {
    const [{ forgetFailedIcons }, { resetLogoCache }] = await Promise.all([
      import('./core/simple-icons'),
      import('./core/logos'),
    ]);
    forgetFailedIcons();
    resetLogoCache();
    previewFailures = 0;
    await renderIconGrid();
  })();
});

// —— 窄屏工具条 ——
// 手机上九个控件要占 376px（屏高 45%），默认收起，让卡片回到主角位置。
const toolbar = document.getElementById('toolbar');
const toolbarToggle = document.getElementById('toolbar-toggle') as HTMLButtonElement | null;
toolbarToggle?.addEventListener('click', () => {
  const open = toolbar?.classList.toggle('is-open') ?? false;
  toolbarToggle.setAttribute('aria-expanded', String(open));
});

// —— 第一分钟 ——
//
// 第一次打开的人不知道「这句台词」在哪改：卡片占屏 34%，标题输入框只有
// 168×30 缩在工具栏最右。这里做三件事：点卡片直接聚焦标题、手机给一个直达
// 标题的按钮、首屏只显示一次的提示 + 一键品牌示例。
const stageHint = document.getElementById('stage-hint');
const brandDemoBtn = document.getElementById('brand-demo') as HTMLButtonElement | null;
const hintDismiss = document.getElementById('hint-dismiss') as HTMLButtonElement | null;
const toolbarEdit = document.getElementById('toolbar-edit') as HTMLButtonElement | null;

const ONBOARD_KEY = 'sponsored-by:onboarded:v1';
function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARD_KEY) === '1';
  } catch {
    return false;
  }
}
function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARD_KEY, '1');
  } catch {
    /* 隐私模式下写不进去：提示每次出现，不阻塞主流程 */
  }
}
function dismissHint(): void {
  if (stageHint) stageHint.hidden = true;
  markOnboarded();
}
function openToolbar(): void {
  if (!toolbar || !toolbarToggle) return;
  if (!toolbar.classList.contains('is-open')) {
    toolbar.classList.add('is-open');
    toolbarToggle.setAttribute('aria-expanded', 'true');
  }
}
function focusTitle(): void {
  const input = firstTextInput();
  input?.focus();
  input?.select();
  dismissHint();
}

/** 与 README / demo 对齐的一组品牌；点一下就能看到「品牌版」长什么样 */
const DEMO_ICONS: TickerItem[] = [
  { icon: 'simple-icons:github', label: 'GitHub' },
  { icon: 'simple-icons:vercel', label: 'Vercel' },
  { icon: 'simple-icons:google', label: 'Google' },
  { icon: 'simple-icons:spotify', label: 'Spotify' },
  { icon: 'simple-icons:nvidia', label: 'NVIDIA' },
  { icon: 'simple-icons:tailwindcss', label: 'Tailwind CSS' },
  { icon: 'simple-icons:tesla', label: 'Tesla' },
  { icon: 'simple-icons:nike', label: 'Nike' },
  { icon: 'simple-icons:figma', label: 'Figma' },
];

toolbarEdit?.addEventListener('click', () => {
  openToolbar();
  focusTitle();
});
stage.addEventListener('click', (event) => {
  if (window.matchMedia('(max-width: 780px)').matches) openToolbar();
  // 点哪一层文字就在卡片上编辑哪一层（标题 / 副标题 / 署名共用同一套编辑器）
  const layer = textLayerAtPoint(event);
  if (layer) {
    openTextEditor(layer);
    return;
  }
  focusTitle();
});
brandDemoBtn?.addEventListener('click', () => {
  const icons = DEMO_ICONS.map((icon) => ({ ...icon }));
  // 示例品牌也算「用过」：下次打开面板直接置顶，符合直觉
  for (const icon of icons) rememberIcon(icon);
  apply({ icons });
  flashStatus(ui(state.locale).brandDemoApplied, 2500);
  dismissHint();
});
hintDismiss?.addEventListener('click', dismissHint);

// —— 上传 logo ——
//
// SVG 文件读文本（渲染走 renderFittedSvg，按 viewBox fit）；
// 位图读 dataURL（渲染走 <image>，meet 保比例），宽高比记进 logoAspect 供布局用。
// 内容直接写 state.iconSvgs：apply() 重建时 carryAssets 会原样带过去，导出链路
// 的 sceneIconSvgs 也以 state.iconSvgs 为底合并——上传内容全程不丢。
const uploadInput = document.getElementById('icon-upload') as HTMLInputElement | null;
const uploadBtn = document.getElementById('icon-upload-btn') as HTMLButtonElement | null;

uploadBtn?.addEventListener('click', () => uploadInput?.click());

// 「符号 + 字标」：SVGL 的字标有的自带符号（Gemini/Mistral），有的只有文字
// （OpenAI/GitHub），无法可靠自动判断，所以给用户手动切。
logoWithSymbolInput?.addEventListener('change', () => {
  apply({ logoWithSymbol: logoWithSymbolInput.checked });
  renderIconGrid();
});

// 「单色 logo」：scene 早就支持 logoMode:'mono'，这里把它接到 UI 与草稿/链接。
monoInput?.addEventListener('change', () => {
  apply({ logoMode: monoInput.checked ? 'mono' : 'brand' });
});

uploadInput?.addEventListener('change', () => {
  const files = [...(uploadInput.files ?? [])];
  uploadInput.value = '';
  // 新上传可能换掉了上一次的超限原因，重新给一次提示机会
  warnedTooLarge = false;
  void (async () => {
    for (const file of files) {      const key = `upload:${file.name}`;
      try {
        if (file.type.includes('svg') || file.name.toLowerCase().endsWith('.svg')) {
          const text = await file.text();
          state.iconSvgs = { ...(state.iconSvgs ?? {}), [key]: text };
          // 按墨迹盒量一次：自带留白的上传图也能按视觉高度对齐；
          // 同时把墨迹宽高比给布局，宽字标才不会只占一个正方形槽。
          const ink = measureSvgInk(text);
          if (ink) {
            state.logoInk = { ...(state.logoInk ?? {}), [key]: ink };
            state.logoAspect = { ...(state.logoAspect ?? {}), [key]: ink.w / ink.h };
          }
        } else {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(r.error ?? new Error('read failed'));
            r.readAsDataURL(file);
          });
          state.iconSvgs = { ...(state.iconSvgs ?? {}), [key]: dataUrl };
          // 原始宽高比 → 布局给这个槽合适的宽度（上限 4，防极端长图）
          const aspect = await new Promise<number | undefined>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : undefined);
            img.onerror = () => resolve(undefined);
            img.src = dataUrl;
          });
          if (aspect) state.logoAspect = { ...(state.logoAspect ?? {}), [key]: aspect };
        }
        // 不默认填文字标签：多数人传的就是带品牌名的完整字标，再自动加一行
        // 文件名（"acme.svg"）只会和图案里的 "ACME" 重复。需要时可在已上传列表里补。
        sel.icons = [...sel.icons, { icon: key }];
      } catch {
        /* 单个文件失败跳过，不中断批量 */
      }
    }
    if (files.length > 0) {
      apply({ icons: sel.icons });
      renderIconGrid();
    }
  })();
});

// —— 文本层：工具条输入框 + 卡片内直接编辑 ——
//
// 文本层数量由模板决定（title / subtitle / 署名…），界面按实际层动态生成输入框，
// 不写死「一个标题」。渲染、撤销、草稿、分享链接都按 layer.id 统一处理。

/** 模板里所有文本层（标题在前，副标题 / 署名随后） */
function textLayers(): TextLayer[] {
  return state.template.layers.filter((item): item is TextLayer => item.type === 'text');
}

/** 当前模板的标题层（第一个 text layer） */
function titleLayer(): TextLayer | null {
  return textLayers()[0] ?? null;
}

function textLayerById(id: string | null): TextLayer | null {
  if (!id) return null;
  return textLayers().find((layer) => layer.id === id) ?? null;
}

/** 卡片编辑器当前正在编辑的文本层 */
function activeTextLayer(): TextLayer | null {
  return textLayerById(activeTextLayerId);
}

/** 某个文本层在当前语言下的文案（用户覆盖优先） */
function layerText(layer: TextLayer): string {
  return state.text[layer.id]?.[state.locale] ?? layer.default[state.locale];
}

/** 标题文案（导出文件名 / README 片段等只需要第一层） */
function currentTitle(): string {
  const layer = titleLayer();
  return layer ? layerText(layer) : '';
}

/** 输入框显示名：模板自带 label 优先，其次按层 id 兜底 */
function textLayerLabel(layer: TextLayer): string {
  const t = ui(state.locale);
  if (layer.label?.[state.locale]) return layer.label[state.locale];
  if (layer.id === 'title') return t.titleLabel;
  if (layer.id === 'subtitle') return t.subtitleLabel;
  return t.titleLabel;
}

function firstTextInput(): HTMLTextAreaElement | null {
  const first = textLayers()[0];
  return first ? textInputs.get(first.id) ?? null : null;
}

/** 收起所有文本输入（打开图标面板前避免键盘 / 焦点打架） */
function blurTextInputs(): void {
  for (const input of textInputs.values()) {
    if (document.activeElement === input) input.blur();
  }
  if (document.activeElement === titleEditorInput) titleEditorInput?.blur();
}

/** 立刻重画一帧；编辑输入必须肉眼可见，不能等下一次 rAF */
function renderNow(): void {
  if (manualPaused) {
    renderAt(pausedAt);
    return;
  }
  if (reducedMotion || previewPausedAt !== null) {
    renderAt(0);
    return;
  }
  renderAt(playTime());
}

/** textarea 随内容自动长高（上限由 CSS max-height 收住） */
function autoGrowTextInput(input: HTMLTextAreaElement): void {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
}

/**
 * 按模板真实的文本层重建工具条输入框。
 * 只有标题的版式（如 no-sponsors）不会多出空的副标题框。
 */
function renderTextFields(): void {
  if (!textFieldsHost) return;
  const focusedId = document.activeElement instanceof HTMLTextAreaElement
    ? document.activeElement.id
    : '';
  textInputs.clear();
  textFieldsHost.replaceChildren();

  for (const layer of textLayers()) {
    const field = document.createElement('div');
    field.className = 'field';

    const label = document.createElement('span');
    label.className = 'field-label';
    label.id = `text-label-${layer.id}`;
    label.textContent = textLayerLabel(layer);

    const input = document.createElement('textarea');
    input.className = 'title-input';
    input.id = `text-input-${layer.id}`;
    input.rows = 1;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.value = layerText(layer);
    // 清空文字时画布真的会变空白——placeholder 让用户看到「这里原本是什么」
    input.placeholder = layer.default[state.locale];
    input.setAttribute('aria-labelledby', label.id);
    input.addEventListener('input', () => {
      autoGrowTextInput(input);
      setLayerText(layer, input.value);
      dismissHint();
    });
    input.addEventListener('keydown', (event) => {
      // 回车换行（textarea 原生行为）；Cmd/Ctrl+Enter 或 Esc 结束输入
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        input.blur();
      }
    });
    // 输入框失焦 = 结束这一组输入，下一次输入重新算一步撤销
    input.addEventListener('blur', () => editHistory.endCoalesce());

    field.append(label, input);
    textFieldsHost.appendChild(field);
    textInputs.set(layer.id, input);
    autoGrowTextInput(input);
  }

  // 换语言会重建输入框：把焦点还给原来那个，别让用户输入到一半丢焦点
  if (focusedId) {
    const again = document.getElementById(focusedId) as HTMLTextAreaElement | null;
    again?.focus();
  }
}

/**
 * 写入 sel.text（重建 state 的唯一来源）并同步 state.text，实时预览。
 * **必须两边都写**——只写 state.text 的话，用户随后拖任意滑块触发
 * rebuildLive() 重建 state 时，文字会静默退回模板默认值。
 *
 * 同一次连续输入共用 `edit:text:<层 id>` 合并键，撤销时回到「开始输入前」，
 * 而不是一个字一步。
 */
function setLayerText(layer: TextLayer, value: string): void {
  const text = { ...sel.text, [layer.id]: { ...sel.text[layer.id], [state.locale]: value } };
  sel.text = text;
  state.text = text;
  // 同步另一个入口（工具条 ↔ 卡片内编辑器），但不抢当前焦点
  const toolbarInput = textInputs.get(layer.id);
  if (toolbarInput && document.activeElement !== toolbarInput) {
    toolbarInput.value = value;
    autoGrowTextInput(toolbarInput);
  }
  if (activeTextLayerId === layer.id && titleEditorInput && document.activeElement !== titleEditorInput) {
    titleEditorInput.value = value;
  }
  renderNow();
  scheduleDraftSave();
  commitSelection(`edit:text:${layer.id}`);
  updateTextOverflowWarning();
}

/** 任一文本层压到可读下限时给一条不打断的提示（不弹窗、不抢焦点） */
function updateTextOverflowWarning(): void {
  if (!stageWarn) return;
  const layers = textLayers();
  if (layers.length === 0) {
    stageWarn.hidden = true;
    return;
  }
  const { w, h } = canvasSize(state.template, state.ratio);
  // 与 scene.ts 的 renderText 保持同一套文本盒尺寸
  const overflow = layers.find((layer) => {
    const [, , boxW, boxH] = layer.box;
    return fitTextLayout(layerText(layer), boxW * w, boxH * h * 0.92).overflow;
  });
  stageWarn.hidden = !overflow;
  stageWarn.textContent = overflow ? ui(state.locale).textOverflowHint : '';
}

/** 编辑器位置 = 当前文本层的实际范围（盒模型百分比，跟随卡片缩放） */
function positionTextEditor(): void {
  if (!titleEditor) return;
  const layer = activeTextLayer() ?? titleLayer();
  if (!layer) return;
  const [x, y, w, h] = layer.box;
  titleEditor.style.left = `${x * 100}%`;
  titleEditor.style.top = `${y * 100}%`;
  titleEditor.style.width = `${w * 100}%`;
  titleEditor.style.height = `${h * 100}%`;
}

function syncTextEditor(): void {
  if (!titleEditorInput) return;
  const layer = activeTextLayer();
  if (!layer) return;
  const value = layerText(layer);
  if (document.activeElement !== titleEditorInput) titleEditorInput.value = value;
  titleEditorInput.rows = Math.min(6, Math.max(2, value.split('\n').length));
}

function openTextEditor(layer: TextLayer): void {
  if (!titleEditor || !titleEditorInput) return;
  activeTextLayerId = layer.id;
  positionTextEditor();
  syncTextEditor();
  if (titleEditorHint) titleEditorHint.textContent = ui(state.locale).titleEditorHint;
  titleEditorInput.setAttribute('aria-label', ui(state.locale).textEditorAria(textLayerLabel(layer)));
  titleEditor.hidden = false;
  updateTextOverflowWarning();
  titleEditorInput.focus({ preventScroll: true });
  titleEditorInput.setSelectionRange(titleEditorInput.value.length, titleEditorInput.value.length);
  dismissHint();
}

function closeTextEditor(): void {
  if (!titleEditor || titleEditor.hidden) return;
  titleEditor.hidden = true;
  editHistory.endCoalesce();
  const layer = activeTextLayer();
  activeTextLayerId = null;
  if (layer) {
    const input = textInputs.get(layer.id);
    if (input) {
      input.value = layerText(layer);
      autoGrowTextInput(input);
    }
  }
  updateTextOverflowWarning();
}

/** 点击落在哪一层文字的实际范围（而不是整张卡片） */
function textLayerAtPoint(event: MouseEvent): TextLayer | null {
  const rect = stage.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  for (const layer of textLayers()) {
    const [bx, by, bw, bh] = layer.box;
    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return layer;
  }
  return null;
}

// —— 预览控制：暂停 / 继续 + 时间轴选帧 ——
previewToggle?.addEventListener('click', () => setManualPaused(!manualPaused));
previewScrub?.addEventListener('input', () => {
  if (!manualPaused || !previewScrub) return;
  const ratio = Number(previewScrub.value) / 1000;
  pausedAt = Math.min(Math.max(ratio, 0), 0.999) * loopSeconds;
  renderAt(pausedAt);
  paintPreviewControls(pausedAt);
});

// —— 工具栏撤销 / 重做按钮：与快捷键走同一套 performUndo / performRedo ——
historyUndoBtn?.addEventListener('click', () => performUndo());
historyRedoBtn?.addEventListener('click', () => performRedo());

titleEditorInput?.addEventListener('input', () => {
  if (!titleEditorInput) return;
  const layer = activeTextLayer();
  if (!layer) return;
  setLayerText(layer, titleEditorInput.value);
  titleEditorInput.rows = Math.min(6, Math.max(2, titleEditorInput.value.split('\n').length));
  dismissHint();
});
titleEditorInput?.addEventListener('keydown', (event) => {
  // 回车本身换行；Cmd/Ctrl+Enter 或 Esc 结束编辑（Esc 保留已输入内容）
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    titleEditorInput?.blur();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    titleEditorInput?.blur();
  }
});
titleEditorInput?.addEventListener('blur', () => closeTextEditor());
titleEditor?.addEventListener('click', (event) => {
  // 点击面板外的空白也要保持编辑状态，而不是穿透回画布
  if (event.target === titleEditor) titleEditorInput?.focus();
});

// —— 行数 / 速度 / 色板 ——
const rowsRange = document.getElementById('rows-range') as HTMLInputElement | null;
const rowsVal = document.getElementById('rows-val') as HTMLElement | null;
const speedRange = document.getElementById('speed-range') as HTMLInputElement | null;
const speedVal = document.getElementById('speed-val') as HTMLElement | null;
const paletteSwatches = document.getElementById('palette-swatches') as HTMLElement | null;
const themeChips = document.getElementById('theme-chips') as HTMLElement | null;

/** 把速度滑块值（50..200）映射到有理数倍率，保证 loopDuration 的 LCM 周期有限 */
function quantizeSpeed(pct: number): number {
  // 50→0.5, 100→1, 200→2；中间取 0.05 步长，分母 ≤20
  const raw = pct / 100;
  return Math.round(raw * 20) / 20;
}

function speedLabel(v: number): string {
  return `${Math.round(v * 100) / 100}×`;
}

/**
 * 界面上可调的色板键。
 *
 * accent 已接入场景渲染：标题下方那条强调线（见 core/scene.ts）。
 * 它和 bg / fg 一起被主题成组写入，用户也可以单独微调。
 */
const COLOR_KEYS = [
  { key: 'bg', label: { en: 'Background', zh: '背景' } },
  { key: 'fg', label: { en: 'Foreground', zh: '前景' } },
  { key: 'accent', label: { en: 'Accent', zh: '强调色' } },
] as const;

function renderPaletteSwatches(): void {
  if (!paletteSwatches) return;
  const p = state.template.palette;
  paletteSwatches.replaceChildren();
  for (const { key, label } of COLOR_KEYS) {
    const current = sel.palette[key] ?? p[key];
    const name = label[state.locale];
    // 用 <label> 而不是 <button>：色块里要嵌 <input type="color">，
    // 而 button 内嵌交互元素是非法 HTML 嵌套。label 原生把点击转给 input。
    const sw = document.createElement('label');
    sw.className = 'swatch';
    sw.style.background = current;
    sw.classList.toggle('is-custom', sel.palette[key] !== undefined);
    sw.title = `${name}: ${current}`;

    const pick = document.createElement('input');
    pick.type = 'color';
    pick.value = current;
    pick.setAttribute('aria-label', name);
    pick.addEventListener('input', () => {
      sel.palette = { ...sel.palette, [key]: pick.value };
      // 就地改当前色块，不重建 DOM——重建会在拖动中销毁正在操作的 input
      sw.style.background = pick.value;
      sw.classList.add('is-custom');
      sw.title = `${name}: ${pick.value}`;
      // 拖动取色器会连发几十次 input：同一个 key 合并成一步撤销
      rebuildLive({ palette: sel.palette }, { coalesceKey: `palette:${key}` });
      // 手动改任何一色后，主题高亮要立刻跟着失效（不必重建整个工具条）
      renderThemeChips();
    });
    // 原生取色器关闭 / 失焦 = 松手，结束这一组颜色拖拽
    pick.addEventListener('change', () => editHistory.endCoalesce());
    pick.addEventListener('blur', () => editHistory.endCoalesce());
    sw.appendChild(pick);
    paletteSwatches.appendChild(sw);
  }
}

/**
 * 一键主题：每个色片同时显示背景 / 前景 / accent。
 * 点击只改 sel.palette，不碰图标、文案和版式——这是本功能的核心承诺。
 */
function renderThemeChips(): void {
  if (!themeChips) return;
  themeChips.replaceChildren();
  const locale = state.locale;
  for (const theme of COLOR_THEMES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-chip';
    btn.dataset.theme = theme.id;
    btn.style.setProperty('--theme-bg', theme.bg);
    btn.style.setProperty('--theme-fg', theme.fg);
    btn.style.setProperty('--theme-accent', theme.accent);
    btn.title = theme.name[locale];
    btn.setAttribute('aria-label', theme.name[locale]);
    btn.setAttribute('aria-pressed', String(themeMatches(theme, sel.palette)));
    const mark = document.createElement('span');
    mark.className = 'theme-chip__mark';
    const accent = document.createElement('span');
    accent.className = 'theme-chip__accent';
    btn.append(mark, accent);
    themeChips.appendChild(btn);
  }
  // 回到当前版式自带的配色；没有动过任何颜色时它就是激活态。
  const auto = document.createElement('button');
  auto.type = 'button';
  auto.className = 'theme-chip theme-chip--auto';
  auto.dataset.auto = '1';
  auto.textContent = ui(locale).themeDefault;
  auto.title = ui(locale).themeDefaultHint;
  auto.setAttribute('aria-label', ui(locale).themeDefaultHint);
  auto.setAttribute('aria-pressed', String(!hasCustomPalette(sel.palette)));
  themeChips.appendChild(auto);
}

themeChips?.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const chip = event.target.closest<HTMLButtonElement>('.theme-chip');
  if (!chip) return;
  const theme = COLOR_THEMES.find((item) => item.id === chip.dataset.theme);
  if (theme) {
    // 三个色一起写入；不传 templateId / icons / text，所以内容原样保留。
    apply({ palette: { bg: theme.bg, fg: theme.fg, accent: theme.accent } });
    return;
  }
  if (chip.dataset.auto === '1') apply({ palette: {} });
});

rowsRange?.addEventListener('input', () => {
  const n = parseInt(rowsRange.value, 10);
  if (rowsVal) rowsVal.textContent = String(n);
  rowsRange.setAttribute('aria-valuetext', ui(state.locale).rowsValueText(n));
  // 拖滑块期间合并为一步撤销；松手/失焦时收尾
  rebuildLive({ rows: n }, { coalesceKey: 'drag:rows' });
});
speedRange?.addEventListener('input', () => {
  const v = quantizeSpeed(parseInt(speedRange.value, 10));
  if (speedVal) speedVal.textContent = speedLabel(v);
  speedRange.setAttribute('aria-valuetext', ui(state.locale).speedValueText(v));
  rebuildLive({ speed: v }, { coalesceKey: 'drag:speed' });
});
for (const range of [rowsRange, speedRange]) {
  range?.addEventListener('change', () => editHistory.endCoalesce());
  range?.addEventListener('pointerup', () => editHistory.endCoalesce());
  range?.addEventListener('blur', () => editHistory.endCoalesce());
}

// —— 分享链接 ——
function copyShareLink(): void {
  const t = ui(state.locale);
  // 只序列化可恢复的部分（不含上传内容，见 share-link.ts 注释）；
  // mono / accent 已并入编码，不再在链接尾部挂 & 旁路。
  const encoded = encodeShare(sel);
  const url = location.origin + location.pathname + encoded;
  navigator.clipboard?.writeText(url).catch(() => {
    // 降级：用临时隐藏的 textarea
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
  // 上传的 logo 进不了链接（内容不是可序列化的引用）。不告诉用户的话，
  // 收链接的人会看到一张少了几个 logo、甚至退回默认 emoji 的卡。
  const dropped = sel.icons.filter((i) => i.icon.startsWith('upload:')).length;
  setStatus(dropped > 0 ? t.shareCopiedDropped(dropped) : t.shareCopied);
  window.setTimeout(() => setStatus(''), dropped > 0 ? 3400 : 1500);
}

const shareBtn = document.getElementById('share-link') as HTMLButtonElement | null;
const shareCardBtn = document.getElementById('share-card') as HTMLButtonElement | null;
shareBtn?.addEventListener('click', () => copyShareLink());
shareCardBtn?.addEventListener('click', () => void shareCard());

// —— 随机 / 撤销 ——
//
// 随机是一次整体重写（版式、配色、图标、文案全换），没有撤销就是
// 「手滑一下，五分钟白做」。快照只存 sel，资源（state.iconSvgs）由
// carryAssets 透传，所以撤销回来的上传图不会丢。
let undoSnapshot: Selection | null = null;
let undoTimer: number | undefined;
const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement | null;

function showUndo(visible: boolean): void {
  if (undoBtn) undoBtn.hidden = !visible;
}

/** 当前 Selection 的独立副本（legacy 15 秒撤销用） */
function captureSelection(): Selection {
  return {
    ...sel,
    icons: sel.icons.map((item) => ({ ...item })),
    text: structuredClone(sel.text),
    palette: { ...sel.palette },
  };
}

/** 显示「随机 / 清空后 15 秒内可撤销」的旧入口 */
function setLegacyUndo(snapshot: Selection): void {
  undoSnapshot = snapshot;
  showUndo(true);
  if (undoTimer !== undefined) window.clearTimeout(undoTimer);
  undoTimer = window.setTimeout(() => {
    undoTimer = undefined;
    undoSnapshot = null;
    showUndo(false);
  }, 15000);
}

/**
 * 收掉旧入口。任何新编辑、键盘撤销/重做都会把它清掉，
 * 避免「15 秒按钮」和全局撤销栈同时指向两个不同的过去。
 */
function clearLegacyUndo(): void {
  if (undoTimer !== undefined) {
    window.clearTimeout(undoTimer);
    undoTimer = undefined;
  }
  undoSnapshot = null;
  showUndo(false);
}

const randomBtn = document.getElementById('random-btn') as HTMLButtonElement | null;
randomBtn?.addEventListener('click', () => {
  import('./random-gen')
    .then((m) => {
      const before = captureSelection();
      const r = m.randomOption(state.locale);
      apply(r as Partial<Selection>);
      // apply() 会清状态行，所以旧入口与提示都写在它后面
      setLegacyUndo(before);
      setStatus(ui(state.locale).randomApplied);
    })
    .catch(() => {
      /* ignore */
    });
});

undoBtn?.addEventListener('click', () => {
  if (!undoSnapshot) return;
  const snap = undoSnapshot;
  clearLegacyUndo();
  apply({ ...snap });
  // 面板还开着时，已选 chips 与格子的选中态要跟着回来
  void renderIconGrid();
});

// —— 导出 ——
const gifBtn = document.getElementById('export-gif') as HTMLButtonElement | null;
const mp4Btn = document.getElementById('export-mp4') as HTMLButtonElement | null;
const mp4Note = document.getElementById('mp4-note') as HTMLElement | null;
const pngBtn = document.getElementById('export-png') as HTMLButtonElement | null;
const svgBtn = document.getElementById('export-svg') as HTMLButtonElement | null;
const cancelBtn = document.getElementById('export-cancel') as HTMLButtonElement | null;
const status = document.getElementById('status');
const readmeSnippet = document.getElementById('readme-snippet') as HTMLElement | null;
const readmeSnippetCode = document.getElementById('readme-snippet-code') as HTMLElement | null;
const readmeSnippetCopyBtn = document.getElementById('readme-snippet-copy') as HTMLButtonElement | null;
const readmeSnippetCloseBtn = document.getElementById('readme-snippet-close') as HTMLButtonElement | null;
/** 当前展示的 Markdown 片段（复制按钮读它，不读 DOM） */
let readmeSnippetText = '';

/** 属性值转义：标题可能带引号或 `<`，不能直接拼进 HTML 片段 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * GitHub README 片段：`<img src="文件名">`。
 *
 * GitHub 会把 README 里的 GIF 自动循环播放（`<video>` 不行），所以只给这
 * 一种最省心的写法；src 用导出的文件名，用户把它放进仓库根目录 /
 * `docs/` 后改成相对路径即可。
 */
function buildReadmeSnippet(filename: string): string {
  const alt = currentTitle().replace(/\s+/g, ' ').trim() || state.template.name[state.locale];
  return `<img src="${filename}" alt="${escapeAttribute(alt)}" />`;
}

function showReadmeSnippet(filename: string): void {
  if (!readmeSnippet || !readmeSnippetCode) return;
  readmeSnippetText = buildReadmeSnippet(filename);
  readmeSnippetCode.textContent = readmeSnippetText;
  readmeSnippet.hidden = false;
}

function hideReadmeSnippet(): void {
  if (!readmeSnippet) return;
  readmeSnippet.hidden = true;
  readmeSnippetText = '';
}

function copyReadmeSnippet(): void {
  if (!readmeSnippetText) return;
  const t = ui(state.locale);
  const done = (): void => flashStatus(t.readmeSnippetCopied, 2000);
  const fallback = (): void => {
    const ta = document.createElement('textarea');
    ta.value = readmeSnippetText;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    done();
  };
  const clipboard = navigator.clipboard;
  if (clipboard?.writeText) clipboard.writeText(readmeSnippetText).then(done, fallback);
  else fallback();
}

readmeSnippetCopyBtn?.addEventListener('click', copyReadmeSnippet);
readmeSnippetCloseBtn?.addEventListener('click', hideReadmeSnippet);

// WebCodecs 能力探测不 import mp4.ts（那会把 mediabunny 的 130KB gzip 拖进首屏）；
// 真正的 codec 协商在点击时由 exportMp4 完成，失败会给出明确文案。
const webCodecsOk = typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';

function setStatus(text: string): void {
  if (status) status.textContent = text;
}

/** 一次性状态：到点自动清空；期间用户触发了别的状态就不动它 */
function flashStatus(text: string, ms = 2500): void {
  setStatus(text);
  window.setTimeout(() => {
    if (status?.textContent === text) setStatus('');
  }, ms);
}

function setBusy(busy: boolean): void {
  if (gifBtn) gifBtn.disabled = busy;
  if (mp4Btn) mp4Btn.disabled = busy || !webCodecsOk;
  if (pngBtn) pngBtn.disabled = busy;
  if (svgBtn) svgBtn.disabled = busy;
  // 导出期间这几颗按钮仍可点的话，画面会在中途被换掉，产物和结果对不上
  if (shareCardBtn) shareCardBtn.disabled = busy;
  if (shareBtn) shareBtn.disabled = busy;
  if (randomBtn) randomBtn.disabled = busy;
  if (quickGifInput) quickGifInput.disabled = busy;
  if (transparentBgInput) transparentBgInput.disabled = busy;

  // 导出期间预览控制也锁住，避免中途换帧导致产物和状态栏对不上
  exporting = busy;
  paintPreviewControls();

  // 导出期间停掉预览逐帧重渲：实测 GIF 67 秒 / 峰值 300 MB 时，
  // 预览还在 60fps 抢 CPU。恢复时按暂停时长顺延起点，画面不跳帧。
  if (busy) pausePreview();
  else resumePreview();
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * 导出后的分享动作：系统分享面板 › 复制图片 › 下载。
 *
 * 移动端（Safari / Chrome Android）走 navigator.share 带 PNG 文件，直接进
 * 微信 / Instagram / TikTok 的系统面板；桌面不支持文件分享时复制 PNG 到剪贴板；
 * 两者都不可用就安静地退回下载。用户取消分享不算失败，不报错也不卡住。
 */
async function shareCard(): Promise<void> {
  const t = ui(state.locale);
  setBusy(true);
  setStatus(t.sharePreparing);
  try {
    const [{ exportPng }, { pngFilename }] = await Promise.all([
      import('./exporters/png'),
      import('./exporters/svg'),
    ]);
    const blob = await exportPng(state, 0);
    const file = new File([blob], pngFilename(state), { type: 'image/png' });

    // 1) 手机：系统分享面板，带真实图片文件
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    let canShareFiles = false;
    if (typeof nav.share === 'function') {
      if (typeof nav.canShare !== 'function') {
        canShareFiles = true;
      } else {
        try {
          canShareFiles = nav.canShare({ files: [file] });
        } catch {
          // canShare 本身抛错也按「不支持文件分享」处理，继续降级而不是报错卡住
          canShareFiles = false;
        }
      }
    }
    if (canShareFiles) {
      try {
        await nav.share({ files: [file], title: state.template.name[state.locale] });
        setStatus(t.shareDone);
        return;
      } catch (err) {
        // 用户点「取消」：静默退出，不降级成下载（那会像在强迫人保存）
        if (err instanceof DOMException && err.name === 'AbortError') {
          setStatus('');
          return;
        }
        // 其他失败继续走剪贴板 / 下载
      }
    }

    // 2) 桌面：复制 PNG 到剪贴板
    if (navigator.clipboard?.write && typeof ClipboardItem === 'function') {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setStatus(t.shareCopiedImage);
        return;
      } catch {
        /* 权限被拒 / 非安全上下文 → 继续降级 */
      }
    }

    // 3) 兜底：下载。不抛错，用户总能拿到文件
    download(blob, pngFilename(state));
    setStatus(t.shareFallbackDownloaded);
  } catch (err) {
    setStatus(t.shareFailed(err instanceof Error ? err.message : String(err)));
  } finally {
    setBusy(false);
  }
}

/** 导出完成的状态行：超过平台上限时追加警告（不阻断，用户已拿到文件） */
function reportExported(kind: string, bytes: number, limit: number | null): void {
  const t = ui(state.locale);
  const size = formatBytes(bytes);
  const base = t.exported(kind, size);
  if (exceedsLimit(bytes, limit) && limit !== null) {
    const platform = getPreset(sel.platform).name[state.locale];
    setStatus(`${base} · ${t.overLimit(platform, size, formatBytes(limit))}`);
  } else {
    setStatus(base);
  }
}

gifBtn?.addEventListener('click', async () => {
  const t = ui(state.locale);
  setBusy(true);
  setStatus(t.exporting('GIF'));
  // 默认档 67 帧实测 30 秒以上：必须给退出口，否则用户只能等着
  const controller = new AbortController();
  if (cancelBtn) {
    cancelBtn.hidden = false;
    cancelBtn.onclick = () => controller.abort();
  }
  const startedAt = performance.now();
  try {
    // 导出器按需加载：不看 GIF 的人不付首屏体积
    const { exportGif, gifFilename } = await import('./exporters/gif');
    // 平台预设 + 快速档在此生效：微信档 / 快速档导出 720px / 12fps，
    // 默认档保持模板参数；两者同时选时取更小值。
    const gifState = deriveExportState(state, sel.platform, 'gif', quickGif);
    const blob = await exportGif(
      gifState,
      (done, total) => {
        const pct = Math.round((done / total) * 100);
        const elapsed = (performance.now() - startedAt) / 1000;
        const remain = done > 0 ? Math.max(1, Math.round((elapsed / done) * (total - done))) : 0;
        setStatus(t.exportingEta('GIF', pct, remain));
      },
      controller.signal,
    );
    const filename = gifFilename(gifState);
    download(blob, filename);
    reportExported('GIF', blob.size, getPreset(sel.platform).gifLimitBytes);
    // GitHub 是唯一「贴进 README 就能循环播放」的预设，导出后顺手给可复制的
    // Markdown 片段；别的平台给了也没地方用，不显示。
    // 片段里的文件名必须和刚下载的完全一致，所以复用同一个变量（跨零点也不会错位）。
    if (sel.platform === 'github') showReadmeSnippet(filename);
    else hideReadmeSnippet();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      setStatus(t.cancelled);
    } else {
      setStatus(t.failed(err instanceof Error ? err.message : String(err)));
    }
  } finally {
    if (cancelBtn) {
      cancelBtn.hidden = true;
      cancelBtn.onclick = null;
    }
    setBusy(false);
  }
});

mp4Btn?.addEventListener('click', async () => {
  const t = ui(state.locale);
  setBusy(true);
  setStatus(t.exporting('MP4'));
  try {
    // mediabunny 按需加载：不用 MP4 的人不为它付首屏体积
    const { exportMp4, mp4Filename } = await import('./exporters/mp4');
    const mp4State = deriveExportState(state, sel.platform, 'mp4');
    const result = await exportMp4(mp4State, (done, total) => {
      setStatus(t.exporting('MP4', Math.round((done / total) * 100)));
    });
    download(result.blob, mp4Filename(mp4State));
    reportExported('MP4', result.blob.size, getPreset(sel.platform).mp4LimitBytes);
  } catch (err) {
    setStatus(t.failed(err instanceof Error ? err.message : String(err)));
  } finally {
    setBusy(false);
  }
});

pngBtn?.addEventListener('click', async () => {
  const t = ui(state.locale);
  // 先在 setBusy(true) 之前锁定当前帧：暂停会顺延时间轴起点
  const frameT = currentPreviewTime();
  const loop = loopSeconds;
  setBusy(true);
  setStatus(t.exporting('PNG'));
  try {
    const [{ exportPng }, { pngFilename }] = await Promise.all([
      import('./exporters/png'),
      import('./exporters/svg'),
    ]);
    const blob = await exportPng(state, frameT);
    download(blob, pngFilename(state));
    // 状态行说清楚这一帧对应哪一秒，避免「导出的到底是哪一帧」的疑问
    setStatus(t.exportedFrame('PNG', formatBytes(blob.size), frameT, loop));
  } catch (err) {
    setStatus(t.failed(err instanceof Error ? err.message : String(err)));
  } finally {
    setBusy(false);
  }
});

svgBtn?.addEventListener('click', async () => {
  const t = ui(state.locale);
  try {
    const { svgFilename, svgFileContent, svgToBlob } = await import('./exporters/svg');
    const blob = svgToBlob(await svgFileContent(state, 0));
    download(blob, svgFilename(state));
    setStatus(t.exported('SVG', formatBytes(blob.size)));
  } catch (err) {
    setStatus(t.failed(err instanceof Error ? err.message : String(err)));
  }
});

/**
 * 导出器预热：首屏只加载编辑器，PNG/GIF/SVG 在浏览器空闲时再取。
 * 这样 modulepreload 列表里不再有这三个 chunk，首次导出仍有本地缓存可用。
 */
function prefetchExporters(): void {
  const load = (): void => {
    void Promise.allSettled([
      import('./exporters/png'),
      import('./exporters/gif'),
      import('./exporters/svg'),
    ]);
  };
  // Safari 16.4 之前没有 requestIdleCallback；用 typeof 判断，避免
  // `'x' in window` 把 else 分支收窄成 never
  const idle = window.requestIdleCallback;
  if (typeof idle === 'function') idle.call(window, load, { timeout: 3000 });
  else window.setTimeout(load, 1500);
}

// —— 全局撤销 / 重做快捷键 ——
// 输入框（含文本框、下拉、contenteditable）里保留系统原生文本撤销：
// 用户在标题框里打错字，Cmd+Z 应该撤字符，而不是把整张卡片退回去。
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  // 下拉框没有原生文本撤销，选中版式后立刻 Cmd+Z 应该能撤回来
  if (target instanceof HTMLSelectElement) return false;
  if (!(target instanceof HTMLInputElement)) return false;
  // 滑杆 / 取色器 / 勾选框没有原生文本撤销，不该拦掉全局撤销
  return !['range', 'color', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file'].includes(target.type);
}

document.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
  if (isTextEntryTarget(event.target)) return;
  const key = event.key.toLowerCase();
  if (key === 'z') {
    event.preventDefault();
    if (event.shiftKey) performRedo();
    else performUndo();
    return;
  }
  // Windows / Linux 习惯的 Ctrl+Y（Mac 上 Cmd+Shift+Z 已覆盖）
  if (key === 'y' && event.ctrlKey) {
    event.preventDefault();
    performRedo();
  }
});

refreshChrome();
prefetchExporters();

// 启动时也要预取一次图标：分享链接 / 本地草稿里可能带着品牌图标，
// 而 hydrateIcons 原本只在 apply() 里调用 → 打开链接看到的是一排纯文字，
// 直到用户碰一下任何控件才补齐（表现为「图标加载不出来」）。
void hydrateIcons();

// 草稿恢复发生在模块顶部（DOM 引用还在 TDZ 里），提示要等这里才说得出。
// 提示 3 秒后自动消失：长期挂在状态行会被误读成「当前状态」。
if (restoredFromDraft) {
  const t = ui(state.locale);
  flashStatus(
    restoredUploadCount > 0 ? t.draftRestoredUploads(restoredUploadCount) : t.draftRestored,
    3000,
  );
}
// 第一次打开：给一句话提示 + 一键品牌示例；做过任意一次编辑后不再出现
if (!hasOnboarded() && stageHint) stageHint.hidden = false;
