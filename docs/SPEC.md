# Sponsored by X —— 梗图生成器 技术方案

> 版本 v0.1（开工前草案）｜初稿日期 2026-10-24｜状态：**已实现并发布**（v0.2.0 起持续演进）
>
> **这份文档是项目开工前写下的规格与决策台账，现作为设计文档原样公开。**
> 代码注释、CHANGELOG 与 Issue 里引用的「决策 N」都指向 §2 的编号条目。
> §2 中除核心想法外的详细决策均为**软约束**，允许在实现中调整——实际执行结果见 §9 里程碑表（每条判据都附了实测数据）。
>
> 下文的**正文保持初稿原样**（包括当时的目录结构草案与技术选型）；当前状态集中标在此处，个别已过时的条目（决策 16、§7 的 `canvas.ratios`）在行内加了补注。
> 想知道项目现在长什么样，看 [CHANGELOG](../CHANGELOG.md) 与 [README](../README.md)；想知道当前代码怎么组织，看 `src/`。
>
> **与当前实现的差异（2026-11-07 核对代码后补记）**——以下是对初稿的增补，不是初稿当时的判断：
> - 画布比例从 **1:1 / 4:5 / 16:9** 三档扩为四档，新增 **9:16**（决策 16、§7 的 `canvas.ratios` 均已过时）。
> - 平台预设新增 **Instagram / TikTok / Reddit**（初稿只有 X / GitHub / Discord / 微信 / 小红书）；选中预设会连带套用推荐比例并高亮推荐导出格式。
> - `palette.accent` 已接入渲染，作为标题下方的强调线；另有 7 套一键主题与 `Mono logos` 单色开关。
> - 导出器不再随首屏静态打包：PNG / GIF / SVG 点击时加载，MP4 + mediabunny 只在需要时加载。
> - 「单文字层」已过时：`sponsored-by` 有 `title` + `subtitle` 两层，`made-by-gang` 有 `title` + `subtitle`（署名行）两层，`no-sponsors` 仍只有 `title`。界面按模板实际的 `text` 层逐个生成输入框，点卡片上任一文本层即可编辑；草稿/分享链接按层 id 保存文案。§7 的 `layers` 示例仍只画了一个 text 层，可视为最小示例，不再是“只能有一个”的约束。
> - 导出区新增透明背景开关：只作用于 PNG / SVG，GIF / MP4 在导出器内部强制不透明；PNG 透明时改用 alpha 统计墨迹范围。
> - 分享链接与草稿的字段在进入渲染前会做白名单校验，非法值回退默认卡片（初稿未涉及校验）。
>
> 所有外部事实均已联网核实或本机实测，来源标注在括号内。

---

## 0. 一句话定义

一个**纯浏览器端、零后端**的工具，把「一张图 + 一句台词 + 若干图标」渲染成**会滚动循环的卡片**，导出为 **GIF（主）/ PNG / SVG / MP4（辅）**，并针对微信 / X / 小红书 / Discord / GitHub 各自的体积与播放限制做预设。

---

## 1. 为什么做它（以及为什么这样的形态）

**市场事实**：GitHub / npm / PyPI 搜 `sponsored meme generator` 相关词**全部 0 结果**；唯一同名成品是 Kapwing 的一个模板页。（2026-10-24 查）

**但这是「空坑」不是「蓝海」，必须诚实记下来**：
- 该梗可考峰值是 **2024-09**（X 上的 Stake 隐形广告讽刺潮），Know Your Meme 相关条目停在 **2025-01 / 2025-03**，此后无新病毒案例。判定为**衰退期 / 长尾**。
- 真正的替代品是「假 Instagram 帖子生成器」（brainrotshorts / trywebkits / thefake.design）——Sponsored 标签是现成开关、免登录无水印。
- 因此本项目**不对抗病毒传播**，定位为**作品级**：成功 = 简历能讲清技术决策 + Star 100+。

**三条差异化立得住的地基**：
1. **矢量 / SVG 导出**：全赛道只有 shields.io 能做矢量。（这点先记着，第一版不一定做）
2. **图标自由度**：把 simple-icons 的 3000+ 品牌矢量接到梗图生成器上，**此前无人做**。
3. **中文 + 会动 + 自嘲卡片**这个组合，竞品调研中**未查到有人在明确做**。

---

## 2. 决策台账（全部已确认，改需重新讨论）

| # | 决策 | 结论 | 关键理由 |
|---|---|---|---|
| 1 | 成功标准 | **作品级**，不追流量、不承诺长期维护 | 梗在衰退，把 KPI 绑流量等于拿下降资产考核自己 |
| 2 | 语言 | **中英双语切换** | 纯恶搞向工具无中文界面，是确认空白；i18n 字典成本极低 |
| 3 | 形态 | **纯前端网页 + GitHub Pages** | gh 2.103.0 已登录 `zyphraxns`，权限含 repo/workflow |
| 4 | 图标来源 | **用户上传 + emoji/CC0 内置 + simple-icons CDN 运行时拉取** | 见 §4.1 |
| 5 | 品牌 logo | **仓库一个字节都不放** | 商标核心风险，见 §6.1 |
| 6 | 产物形态 | **独立卡片**（非给任意图贴角标） | 避开与假 IG 帖生成器正面竞争 |
| 7 | 版式 | hero `sponsored-by` + `made-by-gang` + `no-sponsors`；`made-possible` 降为 hero 的**语气变体** | 变体机制同时解决双语文案，一个机制赚两份 |
| 8 | 技术叙事 | **可插拔模板引擎**：一份 JSON 定义一套版式 | 区别于零后端这类「入场券」，且天然解释为什么值得开源 |
| 9 | 动画 | **第一版就带动图**（用户已改主意） | 静态上架后再补的成本更高 |
| 10 | 结构 | **静态大标题 + 多行 logo 各自错相滚动** | 标题是笑点载体必须一眼读到；静态文字不参与逐帧渲染，画质更高 |
| 11 | 导出格式 | **GIF 为主 + MP4 为辅**，另有 PNG / SVG | X 上只有 GIF 帖才无限循环，见 §5 |
| 12 | 视觉约束 | **低色设计**：纯色背景、大字号粗体、纯色文字、禁用渐变与半透明 | 这是 GIF 256 色唯一能保住中文字的办法 |
| 13 | 免责角标 | **默认关闭，导出时一步确认** | 法务上站得住，同时不牺牲默认产物观感 |
| 14 | 首屏空状态 | **emoji 占位**（💸🚀🫡）跑起来 | 零侵权零加载，点一下即可替换 |
| 15 | v1 控件 | 背景色板 / 主文案+副标题 / 图标选择与上传 / 画布比例 / 行数与滚动速度 | 不做「手动调字号」——那是承认自动排版失败 |
| 16 | 画布比例 | **1:1 / 4:5 / 9:16 / 16:9** 四档（初稿为前三档，2026-11 增补 9:16） | 分别对应 X·Discord·微信 / 小红书·Instagram·Reddit / TikTok·Reels·Stories / 视频封面 |
| 17 | 许可证 | **MIT** + README 顶部免责声明 + 移除邮箱 + 「欢迎 PR 但不承诺响应时间」 | 改许可证需全体贡献者同意，不可撤销 |
| 18 | 目标平台 | **X / GitHub / Discord 优先；不主要面向国内社交平台（微信等）** | 用户 2026-10-25 确认。M3 实测 1080p/16fps/32 色 = 3.58 MB，满足 X（网页 15MB / App 5MB）、GitHub（10MB）、Discord（20MB）全部限额；「<2MB」类约束降权，M5 平台预设以 X/GitHub/Discord 为主、微信降为可选档 |

---

## 3. 架构：一个渲染核心，四条导出路径

**核心设计：`scene(state, t) → SVG 字符串`。** 所有导出共用这一个纯函数，这是整个项目的技术支点。

```
                    ┌─→ PNG  （SVG → canvas(dPR)  → toBlob）
scene(state, t) ─→ SVG ─→ ├─→ SVG  （序列化 + @font-face 引用，不内嵌字体）
   ↑                      ├─→ GIF  （t 逐帧推进 → canvas → modern-gif）
   │                      └─→ MP4  （t 逐帧推进 → VideoEncoder + mediabunny）
   │
   └─ state = { 模板 JSON, 文案, 图标列表, 色板, 比例, 行数, 速度 }
```

**这样设计的好处**：加一个导出格式 = 加一个消费器，不碰渲染逻辑；动画只是 `t` 从常数变成变量，静态导出就是 `t = 0`。版式引擎的本职是产出 `state`，渲染引擎的本职是产出画面，两者解耦。

### 3.1 为什么不用 DOM 截图库

| 方案 | 结论 | 依据（2026-10-24 核实） |
|---|---|---|
| html2canvas | ❌ 排除 | npm 1.4.1 停在 **2022-01**，仓库最后 push 2024-07，1055 open issue |
| html-to-image | ❌ 排除 | 1.11.13（2025-02）后**近 20 个月未发新版**，205 open issue |
| dom-to-image-more | ⚠️ 备选 | 3.11.0（2026-09）在更新，但生态薄、star 少 |
| modern-screenshot | ⚠️ 备选 | 4.7.0（2026-04）是 DOM 路线首选，但半年零 commit |
| **原生 SVG 手写** | ✅ **采用** | 零依赖、矢量无损、无 canvas 跨域污染、无需 pip Eff hybrid 架构 |
| satori | ❌ 排除 | 0.63.2 虽活跃，但必须传 FontBuffer、体积达数 MB、只支持 Flexbox 子集 |

### 3.2 字体策略（本项目第二个技术难点）

约束：要「PNG 跨设备像素级一致」，中文字体又大。

**方案**：
- 预览阶段用 **system font stack** 秒开，不等字体。
- 导出前按需加载自托管字体，加载完 `await document.fonts.ready` 再绘制。
- 中文字体采用 **unicode-range 切片**（Google Fonts 处理中文的标准做法）：用 `pyftsubset` 在构建期切成若干片，浏览器只下载实际用到的那几片，通常几百 KB。
- 拉丁字形用 Inter / 类似 SIL OFL 字体；中文用思源黑体 / Noto Sans SC（OFL 授权，可自托管）。
- **静态 SVG 导出不内嵌字体**（已确认：SVG 允许字形差异）。这一条直接消灭了最难的「运行时子集化」工程量。

> 为什么不用 harfbuzzjs / wasm 子集化：那是把同一个问题用十倍复杂度解决一次。这里用「canvas 本地绘制 + 网页字体按需加载」绕开了。

---

## 4. 资产与数据

### 4.1 图标来源（本机实测结论）

```
https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/openai.svg
→ HTTP 200 · image/svg+xml · 1570 bytes · access-control-allow-origin: *
   latest = simple-icons 16.35.0        （data.jsdelivr.com，2026-10-24）
```

四条价值，逐条命中已锁定的决策：
1. **无需 API key** —— 原方案的 logo.dev / Brandfetch 都要 key，纯前端无法安全保管（写进 JS = 公开，额度可被盗刷）。这个问题整个消失。
2. **仓库零字节** —— 运行时从 CDN 拉取，正好落在法务建议的「第三方行为」安全线内。
3. **单色单路径 SVG** —— 与「低色约束 / GIF 友好」天作之合，比多色 logo 更适合 256 色环境。
4. **单文件约 1 KB** —— 索引可放前端，不需要后端搜索。

**代价**：只覆盖科技 / 互联网品牌（Ray-Ban 之流大概率没有）→ **本地上传必须保留在 UI 里**。
**索引**：运行时拉 `data.jsdelivr.com/v1/packages/npm/simple-icons@<ver>` 的文件树获取 slug 列表（仅元数据，非图形资产）。

### 4.2 PALU 色板

因为接受「低色约束」，色板由人工挑选后写死进模板 JSON，不给用户自由取色器。每条色板需**过一遍 GIF 画质验证**后再入库。

---

## 5. 导出流水线（含平台阈值，均为 2026-10-24 核实）

| 平台 | GIF 上限 | 播放行为 | 结论 |
|---|---|---|---|
| **X / Twitter** | 网页 **15 MB** / App **5 MB** / ≤1280×1080 | **只有以 GIF 上传的帖子才无限循环、不带播放控件**；直传 MP4 = 视频帖，有进度条与重播键，**默认不循环** | GIF 必须做 |
| **GitHub** | GIF ≤ **10 MB** | `<img>` 直接自动循环；手写 `<video>` 会被 sanitizer 剥离 | GIF 是唯一免点击方案 |
| **Discord** | GIF ≤ **20 MB**（2026-08 起，原 10 MB） | GIF 内联自动播放；MP4 为附件需点击 | GIF 优先 |
| **微信** | 官方口径（公众号）≤10 MB 且 长×宽×帧数 ≤ 600 万、建议 ≤30 帧；**三方实测 >1~2 MB 会静默降级为静态图** | 单次发 ≥5 张时第 5 张起的动图被强制定格； | **最苛刻**——用户收到静止图且不知情 |
| **小红书** | 官方口径不明（第三方说法互相矛盾） | GIF 支持不确定 | 走 MP4 |

**→ 因此：导出面板做「发到哪」下拉，选中后自动套该国阈值，并在导出前显示「预估体积 vs 上限」。**

> 2026-10-25 更新（决策 18）：用户确认不主要面向国内社交平台。微信从「最苛刻」降为可选档位；导出面板预设以 X / GitHub / Discord 为主。

### 5.1 GIF 流水线

```
for (t = 0; t < loopDuration; t += 1/fps) {
  svg   = scene(state, t)
  frame = rasterize(svg, size)      // SVG → Image → canvas.drawImage
  encoder.writeFrame(frame, delay)
}
```

参数与理由：
- **fps 12~16**（不是 30）：帧数直接线性放大体积，而水平平移在 12fps 下观感可接受。微信「≤30 帧」的建议也应验这点。
- **maxColors 32~64**（不是 256）：把调色板名额集中给文字与 logo，减少量化噪声。这是本项目保住中文字可读性的核心手段。
- **抖动算法**：`atkinson` 或 `stucki`（modern-gif 支持）。
- **全局调色板**：用首帧量化一次，后续帧复用同一张调色板（避免帧间闪烁）。
- **无缝循环**：滚动位移在一个周期后必须整数倍于「logo 间距」，否则循环时会跳帧。duration 由 speed 反推，不由用户直接指定。
- 编码器 **modern-gif 2.1.0**（2026-04）。备选 gifenc（性能更好但**明确不支持抖动**，不适合我们的中文字场景）。已排除 gif.js（npm 0.2.0 停在 **2016-12**）。

### 5.2 MP4 流水线

- **WebCodecs `VideoEncoder`** + **mediabunny 1.62.1**（2026-10-22，7370★，MPL-2.0，零依赖）。
  - `mp4-muxer@5.2.2` 与 `webm-muxer@5.1.4` **已被 npm 官方标记 deprecated**（"superseded by Mediabunny"），不要用。
- 支持面：Chrome/Edge 94+、Safari 16.4+、iOS Safari 16.4+、Firefox 桌面 130+；**Firefox for Android 不支持** → 需显式降级提示并提供 GIF。
- **MediaRecorder 不用于导出**：`videoBitsPerSecond` 只是 hint、容器由浏览器决定、实时录制无法离线加速、关键帧不可控。
- **ffmpeg.wasm 排除**：单线程 core wasm 实测 **23.25 MB**（多线程 30.74 MB，且需 COOP/COEP 响应头，直接破坏纯静态托管）。

---

## 6. 风险登记（每条都有触发信号）

| # | 风险 | 触发信号（看到即说明发生了） | 应对 |
|---|---|---|---|
| R1 | **商标**——"Sponsored by X" 命名本身落在「暗示真实赞助关系」格上 | 收到品牌方邮件 / GitHub takedown | 仓库零 logo；README 顶部免责声明 + 移除邮箱；MIT；不收费、不挂广告、不挂捐赠链接；默认出图可加 `PARODY — NOT AFFILIATED` |
| R2 | **中文字在 GIF 里糊掉** —— 本项目最大的技术不确定性 | 实测 12pt 以下中文字出现色斑 / 边缘毛刺 | 低色设计 + 大字号粗体 + 必要时描边 + maxColors 限制；**若仍不达标，退到「静态版先发布」**（本ماً cut-line） |
| R3 | **体积爆炸**，尤其微信静默降级 | 典型模板导出 > 2 MB | 导出前预估 + 平台阈值警告；提供尺寸档位（720/1080）；限制 fps 与帧数 |
| R4 | **梗继续衰退** → 无人使用 | 上线 6 个月 star < 50 且无外部引用 | 接受——定位是作品级；且模板引擎可低成本换题 |
| R5 | GitHub Pages 构建限制 | 仓库 > 1 GB 或构建 > 10 min | 字体与资产走 CDN，仓库只放源码 |

**注**：应对 R2 的退路要在动手前就设计好——`scene()` 是纯函数，静态导出与 GIF 导出本来就共用它，退到静态版不需要重写。

---

## 7. 模板 Schema 草案（含动画字段）

```jsonc
{
  "id": "sponsored-by",
  "version": 1,
  "name": { "en": "Sponsored by", "zh": "由 XX 赞助" },

  // 2026-11 现状：三份模板均为 ["1:1", "4:5", "9:16", "16:9"]
  "canvas": { "ratios": ["1:1", "4:5", "16:9"], "basePx": 1080 },

  "constraints": { "maxColors": 8, "allowGradient": false, "allowAlpha": false },

  // 2026-11 现状：sponsored-by / made-by-gang 各有两个 text 层；这里保留最小示例
  "layers": [
    {
      "type": "text",
      "id": "title",
      "default": { "en": "SPONSORED BY", "zh": "由" },
      "font": "display",
      "fit": "auto-shrink",
      "box": [0.08, 0.10, 0.84, 0.22],
      "align": "center"
    },
    {
      "type": "ticker",
      "id": "rows",
      "rows": 3,
      "box": [0, 0.38, 1, 0.52],
      "gap": 0.6,
      "phaseJitter": 0.37,     // 行与行不对齐的关键
      "speedJitter": 0.18,
      "items": [{ "icon": "simple-icons:openai", "phase": 0, "speed": 1 }]
    }
  ],

  // 变体 = 对同一份配置打补丁。made-possible 就是 hero 的一个补丁。
  "variants": [
    {
      "id": "made-possible",
      "patch": [
        { "op": "replace", "path": "/layers/0/default",
          "value": { "en": "MADE POSSIBLE BY", "zh": "特别感谢" } }
      ]
    }
  ],

  "animation": { "loopSeconds": "auto", "fps": 16, "loop": true },

  "export": { "formats": ["gif", "png", "svg", "mp4"], "gifMaxColors": 32, "dither": "atkinson" }
}
```

**设计要点**：变体用 JSON Patch 表达，让「语气变体」和「双语文案」走同一套机制——一个机制赚两份，这正是技术上可以讲的点。

---

## 8. 目录结构草案

```
sponsored-by/
├── index.html
├── src/
│   ├── core/scene.ts          # scene(state, t) → SVG 字符串（唯一渲染真源）
│   ├── core/ticker.ts         # 无缝滚动数学（周期、相位、间距整除）
│   ├── core/layout.ts         # 自动排版：文字按 box 自适应缩放
│   ├── templates/             # 版式 JSON —— 社区贡献的主战场
│   │   ├── sponsored-by.json
│   │   ├── made-by-gang.json
│   │   └── no-sponsors.json
│   ├── exporters/
│   │   ├── png.ts  svg.ts  gif.ts  mp4.ts
│   │   └── budgets.ts         # 平台阈值表 + 体积预估
│   ├── assets/icons.ts        # simple-icons 索引与拉取、上传、emoji
│   ├── i18n/{en,zh}.ts
│   └── ui/
├── public/fonts/              # unicode-range 切片后的 woff2
├── scripts/build-fonts.py     # pyftsubset 切片脚本
├── DISCLAIMER.md
├── CONTRIBUTING.md            # 「如何加一个版式」——开源的核心入口
├── LICENSE                    # MIT
└── README.md                  # 双语互链
```

---

## 9. 里程碑（每步都可独立演示）

| 阶段 | 产出 | 完成判据 |
|---|---|---|
| **M0** | `scene()` + 一个版式 + 浏览器实时预览 | 屏幕上出现静态黑底白字标题 + 三行 emoji 排布 |
| **M1** | 静态导出：PNG + SVG | 导出的 PNG 换台电脑打开字体一致 |
| **M2** | **时间轴**：`t` 生效，多行错相滚动在页面上循环播放 | 肉眼滚动平滑，循环点无跳帧 |
| **M3** | **GIF 导出** | 1080×1080 / 16fps / 4s，< 2 MB，中文字看得出 licensed tool 边缘干净（2026-10-25 重语境化：<2MB 服务微信场景，非目标平台后降权；实测 3.58MB，结构/画质/回读判据全过，见决策 18） |
| **M4** | 版式引擎：三个版式 + 变体机制 + i18n | 换一个 JSON 文件就换一套版式，不改代码 |
| **M5** | MP4 导出 + 平台预设 + 体积预估 UI | 选「微信」自动降到 ≤2 MB 档（2026-10-25 实测：微信档 720px/12fps = 1396 KB ✓；默认 1080p/16fps = 3576 KB。MP4 走 WebCodecs+mediabunny：1080p/30fps/120 帧 = 1249 KB、编码 1.2s，字节级 box 解析 + 解封装回读双证） |
| **M6** | 开源发布：README / DISCLAIMER / CONTRIBUTING / Pages 上线 | 链接可直接访问、README 双语互链 |

**M3 是卡点，也是唯一可能返工的地方。到 M3 之前不做任何打磨。**

---

## 10. 待定项与 TN

1. **仓库名**：候选 `sponsored-by`（SEO 与直感最好）／ `not-sponsored`（笑点更足且天然免责）／ `paid-for-by`。建议前者。**注意：不得包含任何真实品牌名。**
2. 是否做**搜索引擎输入框**（搜索 simple-icons 的 3000+ 图标）——建议 M4 之后再做。
3. 是否支持**多个不同 logo 排队滚动**（"由这些金主联合赞助"）——留作 CONTRIBUTING 里的第一个 good first issue。

---

## 11. 会推翻本方案的信号

- **近 90 天内**找到 ≥5 个高传播（X 万赞 / 抖音百万播放）的 "Sponsored by X" **新**二创 → 衰退判断作废，可以更激进地投入传播侧。
- 上线 **6 个月** star < 50 且无外部引用 → 属需求 / 分发问题而非产品问题，停止投入，转作简历素材。
- M3 实测中文字不可读且低色手段无效 → 退到 M1 先发布静态版，动画排到 v2。
