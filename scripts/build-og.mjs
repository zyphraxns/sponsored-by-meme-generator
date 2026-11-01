/**
 * 生成站点社交分享图 public/og.png（1200×630）。
 *
 * 为什么不用截图：页面截图会带工具栏和阴影，而链接预览要的是"这张卡本身"。
 * 这里直接取 scene() 渲染出的 SVG，放进一个只有背景色的页面里重新排版，
 * 再把 Inter 的 base64 字体内联进去（headless 机器上没装 Inter）。
 *
 *   node scripts/build-og.mjs [baseUrl]
 *
 * 需要本地 dev server 在跑（默认 http://127.0.0.1:5199/）。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5199/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9050 + (process.pid % 90);
const dir = mkdtempSync(join(tmpdir(), 'cdp-og-'));
const chrome = spawn(
  CHROME,
  [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-proxy-server',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${dir}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

let nextId = 1;
const pending = new Map();
let ws = null;
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? 'eval failed');
  return res.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const target = await (async () => {
    for (let i = 0; i < 80; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        const t = list.find((x) => x.type === 'page') ?? list.find((x) => x.webSocketDebuggerUrl);
        if (t) return t;
      } catch {
        /* 端口未就绪 */
      }
      await sleep(200);
    }
    throw new Error('devtools endpoint unreachable');
  })();

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
  });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: baseUrl });
  await sleep(4000);

  // 选几个有官方字标的品牌：默认 emoji 版看起来像草稿，分享图要像成品
  await evaluate(`document.getElementById('icon-btn').click()`);
  await sleep(3000);
  for (const brand of ['github', 'vercel', 'nvidia', 'spotify', 'figma']) {
    await evaluate(
      `(() => { const s = document.getElementById('icon-search'); s.value = ${JSON.stringify(brand)}; s.dispatchEvent(new Event('input')); })()`,
    );
    await sleep(2200);
    await evaluate(`(() => { const c = document.querySelectorAll('.icon-cell')[0]; if (c) c.click(); })()`);
    await sleep(1500);
  }
  await evaluate(`document.getElementById('icon-close').click()`);
  await sleep(5000);

  // 16:9 + 默认卡
  await evaluate(`document.querySelector('#ratio-switch .seg[data-ratio="16:9"]').click()`);
  await sleep(2000);
  const svg = await evaluate(`document.querySelector('#canvas svg').outerHTML`);
  if (typeof svg !== 'string' || !svg.startsWith('<svg')) throw new Error('拿不到场景 SVG');

  const inter = readFileSync('src/assets/fonts/inter-latin-800-normal.woff2.b64', 'utf8').trim();
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:"Inter";font-weight:800;src:url(data:font/woff2;base64,${inter}) format("woff2")}
  html,body{margin:0;width:1200px;height:630px;background:#e7e6e1;overflow:hidden}
  .wrap{width:1200px;height:630px;display:flex;align-items:center;justify-content:center}
  /* 留出卡片边框：整幅铺满时两侧 logo 被卡片自身裁切，看起来像图片被截断 */
  svg{display:block !important;height:520px !important;width:auto !important;
      box-shadow:0 2px 6px rgb(20 20 18 / 10%), 0 18px 44px rgb(20 20 18 / 16%)}
  </style></head><body><div class="wrap">${svg}</div></body></html>`;

  // 同页替换内容（不导航）：导航会重置 device metrics，截出来就变成 1080 宽
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  await evaluate(`document.open(); document.write(${JSON.stringify(html)}); document.close();`);
  await sleep(1500);
  await evaluate('document.fonts.ready.then(() => true)');
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('public/og.png', Buffer.from(shot.data, 'base64'));
  console.log('public/og.png 已生成');
}

main()
  .catch((e) => {
    console.error('生成 OG 图失败：' + e.message);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    chrome.kill();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
