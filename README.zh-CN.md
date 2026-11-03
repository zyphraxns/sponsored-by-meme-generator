<h1 align="center">sponsored-by</h1>

<p align="center">写一句台词，得到一张「假赞助商滚过屏幕」的卡片。<br>
全程在浏览器里跑 —— 无后端、不上传、不用注册。<br>
<b><a href="https://zyphraxns.github.io/sponsored-by-meme-generator/">在线试用 →</a></b></p>

<p align="center">
  <a href="https://zyphraxns.github.io/sponsored-by-meme-generator/">
    <img src="docs/demo.gif" alt="一张写着 SPONSORED BY 的动态卡片，下方多行官方品牌字标（GitHub、Vercel、Google、Spotify、NVIDIA、Tailwind CSS、Tesla、Nike、Figma）滚动而过" width="600">
  </a>
</p>

<p align="center">
  <a href="https://github.com/zyphraxns/sponsored-by-meme-generator/actions/workflows/ci.yml"><img src="https://github.com/zyphraxns/sponsored-by-meme-generator/actions/workflows/ci.yml/badge.svg" alt="CI 状态"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-57606a.svg" alt="许可证：MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" alt="TypeScript：strict"></a>
  <br>
  <sub><a href="#快速开始">快速开始</a> · <a href="#导出格式">导出格式</a> · <a href="#实现结构">实现结构</a> · <a href="README.md">English</a> | <b>简体中文</b></sub>
</p>

> [!WARNING]
> **恶搞作品 —— 与任何品牌无关。** 本项目不暗示任何真实赞助或背书关系，也没有任何品牌为本项目背书。默认内容是 emoji；你也可以从 [simple-icons](https://simpleicons.org) 里挑真实品牌标志插进去——这些标志的商标权归各品牌所有，怎么使用由你负责。如果某个品牌希望移除相关内容，开个 issue 就能处理。

---

## 这是什么

「SPONSORED BY」加上一排 logo 在底下滚动的图，到处都是，但真要做一张，通常得开视频剪辑软件。这个工具只干一件事：在浏览器里把这张卡片精确地渲染出来，并导出成「发到哪儿都能循环播放」的格式。

真正有意思的不是梗本身，而是**预览和四种导出格式共用同一个渲染函数**。卡片长什么样只有一处定义，所以预览看着对，导出就不可能是另一个样子。

## 特性

- **一份渲染器，四种导出** —— `scene(state, t) → SVG` 同时驱动实时预览、PNG、SVG、GIF、MP4。没有独立的「导出渲染器」可以跟预览慢慢走偏。
- **无缝循环** —— 滚动数学保证 `t = loop` 时的版面与 `t = 0` 完全一致，循环点不会跳一下。
- **自托管字体、按需取片** —— 拉丁文字用打包内的 Inter 切片；中文用 Noto Sans SC 的 97 个 `unicode-range` 切片，只把屏幕上真正出现的那几个字对应的切片取下来内嵌。导出的 PNG / GIF 在没装这个字体的机器上打开也一模一样。
- **版式即数据** —— 一套版式就是一个 JSON 文件；语气变体是对同一个文件打 RFC 6902 JSON Patch。加版式 = 加一个 JSON，不碰渲染代码。
- **平台预设** —— 选「发到哪」，导出参数自动跟着变，并且在**导出前**就给出预估体积对比该平台上限。
- **真实品牌字标** —— simple-icons 的 3000+ 单色标志，加上 SVGL 的 153 个官方字标，按背景明暗自动选变体；也可以上传自己的 SVG 或位图。
- **分享链接与一键随机** —— 整套选择压进 URL hash，卡片可以分享或收藏；随机重写版式、配色、图标和文案，一步撤销就能全退回来。
- **海报就是编辑器** —— 点卡片上的标题就能改字；首次打开还有一键换成品牌示例的入口。
- **刷新不丢作品** —— 当前选择（含上传的 logo，受本地存储上限约束）存在本地，误关标签页还能找回来（同时有分享链接时以链接为准）。
- **界面双语**（English / 简体中文），卡片文案也跟随语言。

## 快速开始

需要 Node.js ≥ 20。

```bash
git clone https://github.com/zyphraxns/sponsored-by-meme-generator.git
cd sponsored-by-meme-generator
npm install
npm run dev          # http://localhost:5173
```

构建静态站（产物用相对路径，可以放到任意静态托管，GitHub Pages 的项目子路径也能直接跑）：

```bash
npm run build        # → dist/
```

## 导出格式

以下数字是默认版式、1:1、4 秒循环，在无头 Chrome 里实测得到的（完整取证链见 [`docs/SPEC.md`](docs/SPEC.md) §9）：

| 格式 | 参数 | 结果 | 说明 |
| --- | --- | --- | --- |
| **GIF** | 1080×1080 · 16 fps · 32 色 · Atkinson 抖动 | 4.0 MB · 67 帧 · 编码约 30 秒 | 真正到处都能循环的格式。调色板采样自全部帧，帧间不闪。导出中途可以取消。 |
| GIF（微信档） | 720×720 · 12 fps | 1.5 MB · 50 帧 | 微信对超过 ~1–2 MB 的动图会静默降级成静态图，所以这一档刻意做小。 |
| **MP4** | 1080×1080 · 30 fps · H.264 | 1.2 MB · 120 帧 | WebCodecs 编码约 2 秒，比 GIF 快一个量级。关键帧间隔等于循环时长，重播接缝不卡。 |
| **PNG** | 原始尺寸 | ~250 KB | 静态帧，字体以 data URI 内嵌。 |
| **SVG** | 原始尺寸 | ~5 KB | 矢量，字体走 CDN 引用而非内嵌。 |

## 平台预设

| 预设 | GIF 上限 | 预设做了什么 |
| --- | --- | --- |
| X / 推特 | App 5 MB · 网页 15 MB | 保持 1080p。只有以 GIF 发的帖才无限循环——发 MP4 会变成带进度条的视频帖。 |
| GitHub | 10 MB | 保持 1080p。README 里 GIF 自动循环，视频无法内联。 |
| Discord | 20 MB | 保持 1080p。GIF 内联自动播放，MP4 要点击。 |
| 微信 | 2 MB（实用线） | 降到 720×720 / 12 fps。 |
| 小红书 | — | 建议 MP4；GIF 支持不可靠。 |

体积预估不是拍脑袋，而是拿真实导出结果标定的模型：1 / 3 / 5 / 8 / 12 行五档都实测过，预估值和实测值差几个百分点——所以「超限」提醒在你花 30 秒导出之前就是可信的。

## 实现结构

```
state + t ──► scene() ──► SVG 字符串 ──┬──► innerHTML               （实时预览，60 fps）
                                      ├──► canvas.toBlob()          （PNG）
                                      ├──► modern-gif               （GIF，67 帧）
                                      └──► WebCodecs + mediabunny   （MP4，120 帧）
```

- `src/core/scene.ts` —— 卡片唯一的渲染处。纯函数：同样的输入，同样的字符串。
- `src/core/ticker.ts` —— 无缝滚动数学（周期 = 图标数 × 间距；多行异速用有理数 LCM）。
- `src/core/presets.ts` —— 平台阈值、派生导出参数、标定过的体积预估。
- `src/exporters/` —— 一种格式一个文件，全都只消费 `scene()` 的输出。
- `src/templates/*.json` —— 版式与其 JSON Patch 变体。

设计决策与取舍理由写在 [`docs/SPEC.md`](docs/SPEC.md)（开写第一行代码之前写的）。

## 浏览器支持

预览、PNG、SVG、GIF 在所有现代浏览器里都能用。**MP4 需要 WebCodecs**（Chrome/Edge 94+、Safari 16.4+、Firefox 桌面 130+；Firefox for Android 不支持）。没有 WebCodecs 时 MP4 按钮会被禁用并说明原因，GIF 依然可用——不会静默产出一个坏文件。

## 文档

- [设计规格与决策台账](docs/SPEC.md) —— 为什么架构长这样
- [贡献指南](CONTRIBUTING.md) —— 开发环境、验证工具、good first issues
- [变更日志](CHANGELOG.md)

## 参与贡献

欢迎提 issue 和 PR。动手之前请先读 [CONTRIBUTING.md](CONTRIBUTING.md)，里面写了这个项目依赖的几个验证脚本怎么用。用中文提 issue / PR 完全没问题。

没有响应时间承诺：这是个人项目，有空才维护。

## 致谢

基于 [modern-gif](https://github.com/niclasvaneyk/modern-gif)（MIT）与 [mediabunny](https://mediabunny.dev)（MPL-2.0）；字体为 [Inter](https://rsms.me/inter/) 与 [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC)（均为 SIL OFL 1.1，切片来自 [Fontsource](https://fontsource.org)）。

## 许可证

[MIT](LICENSE) © 2026 zyphraxns
