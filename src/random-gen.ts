/**
 * 随机 / 惊喜生成器（O2）：纯前端，零后端，无上传。
 */
import type { DefaultStateOptions } from './app-state';
import type { Locale } from './core/types';
import { DEFAULT_TEMPLATE_ID } from './templates';

const JOKE_OPTIONS = [
  { en: 'SPONSORED BY OPEN SOURCE', zh: '由开源项目赞助' },
  { en: 'MADE POSSIBLE BY YOUR TAXES', zh: '由你的税款创造' },
  { en: 'PRESENTED BY A CAT', zh: '由一只猫呈现' },
  { en: 'POWERED BY NOTHING', zh: '由虚无驱动' },
  { en: 'THANKS TO THE INTERNET', zh: '感谢互联网' },
];

const COLORS = [
  { bg: '#1c1917', fg: '#f5f3ee' },
  { bg: '#f5f3ee', fg: '#111111' },
  { bg: '#111827', fg: '#ffffff' },
];

const SIMPLE_ICONS = [
  'simple-icons:github',
  'simple-icons:vercel',
  'simple-icons:openai',
  'simple-icons:google',
  'simple-icons:spotify',
  'simple-icons:nvidia',
];

function pickOne<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] ?? list[0]!;
}

/** 洗牌副本：不能就地 sort 上面的常量（会改变下次随机的候选顺序） */
function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

export function randomOption(locale: Locale): Partial<DefaultStateOptions> {
  const templateId = pickOne([DEFAULT_TEMPLATE_ID, 'made-by-gang', 'no-sponsors'] as const);
  const localeChoice: Locale = locale === 'zh' ? (Math.random() > 0.5 ? 'zh' : 'en') : locale;
  const color = pickOne(COLORS);
  const iconPool = shuffled(SIMPLE_ICONS).slice(0, 3 + Math.floor(Math.random() * 3));
  const joke = pickOne(JOKE_OPTIONS);
  const textVal = localeChoice === 'zh' ? joke.zh : joke.en;

  return {
    templateId,
    locale: localeChoice,
    ratio: pickOne(['1:1', '4:5', '16:9'] as const),
    palette: { bg: color.bg, fg: color.fg },
    // 文案必须是**两层**结构（版式层 id → 语言 → 文本）。2026-11-01 修：
    // 原来这里写成扁平的 `{en: '…'}`，而渲染层按 `text[layerId][locale]` 取值，
    // 永远取不到 → 随机的五句玩笑一句都没出现过。
    text: { title: { [localeChoice]: textVal } },
    icons: iconPool.map((ic) => ({ icon: ic, label: ic.replace('simple-icons:', '') })),
    rows: 3 + Math.floor(Math.random() * 2),
    // 速度必须是有限有理数（loopSecondsFor 的 LCM 前提），否则页脚会显示
    // 「循环 3.522222222222222 秒」这种调试浮点。量化到 0.05，与滑块同粒度。
    speed: Math.round((0.5 + Math.random() * 1.5) * 20) / 20,
  };
}
