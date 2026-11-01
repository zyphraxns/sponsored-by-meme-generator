<h1 align="center">sponsored-by</h1>

<p align="center">Type a line, get a card where a fake sponsor scrolls across it.<br>
Runs entirely in your browser — no server, no upload, no account.</p>

<p align="center">
  <img src="docs/demo.gif" alt="An animated card reading SPONSORED BY, with rows of official brand logotypes — GitHub, Vercel, Google, Spotify, NVIDIA, Tailwind CSS, Tesla, Nike, Figma — scrolling underneath" width="600">
</p>

<p align="center">
  <a href="https://github.com/zyphraxns/sponsored-by-meme-generator/actions/workflows/ci.yml"><img src="https://github.com/zyphraxns/sponsored-by-meme-generator/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-57606a.svg" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" alt="TypeScript: strict"></a>
  <br>
  <sub><a href="#quick-start">Quick start</a> · <a href="#export-formats">Export formats</a> · <a href="#how-it-works">How it works</a> · <b>English</b> | <a href="README.zh-CN.md">简体中文</a></sub>
</p>

> [!WARNING]
> **Parody — not affiliated with anyone.** Nothing here implies sponsorship or endorsement, and no brand has endorsed this project. The default content is emoji. You can also drop in real brand marks sourced from [simple-icons](https://simpleicons.org) — those marks stay the trademarks of their owners, and how you use them is your responsibility. If you are a brand and want something removed, open an issue and it will be handled.

---

## What it is

Meme cards like *"SPONSORED BY"* with logos scrolling underneath are everywhere, but making one usually means opening a video editor. This tool does one thing well: render that card in your browser, exactly, and export it in a format that loops wherever you post it.

The interesting part is not the meme — it's that **the same rendering function produces the preview and all four export formats**. There is one source of truth for what the card looks like, so a preview that looks right cannot export wrong.

## Features

- **One renderer, four exports** — `scene(state, t) → SVG` drives live preview, PNG, SVG, GIF and MP4. No separate "export renderer" to drift out of sync.
- **Seamless looping** — ticker math guarantees the layout at `t = loop` is identical to `t = 0`, so the loop point does not jump.
- **Self-hosted fonts, on demand** — Latin text uses a bundled Inter slice; Chinese uses 97 `unicode-range` slices of Noto Sans SC, fetched and embedded only for the characters actually on screen. Exported PNGs/GIFs look the same on a machine that has never installed the font.
- **Templates are data** — a layout is one JSON file; tonal variants are RFC 6902 JSON Patches applied to the same file. Adding a layout means adding a JSON file, not touching the renderer.
- **Platform presets** — pick where you are posting and the export parameters adapt, with a size estimate against that platform's limit *before* you export.
- **Real brand logotypes** — 3000+ single-colour marks from simple-icons plus 153 official wordmarks from SVGL, picked by background luminance so a dark card gets the light-on-dark variant. You can also upload your own SVG or bitmap.
- **Share link and one-click random** — the whole selection fits in the URL hash, so a card can be shared or bookmarked; the randomiser rewrites layout, palette, icons and copy, and one undo puts it all back.
- **Your work survives a reload** — the current selection is kept in local storage (share links win over the draft when both exist).
- **Bilingual UI** (English / 简体中文) with per-locale card text.

## Quick start

Requires Node.js ≥ 20.

```bash
git clone https://github.com/zyphraxns/sponsored-by-meme-generator.git
cd sponsored-by-meme-generator
npm install
npm run dev          # http://localhost:5173
```

Build a static site (deployable to any static host — the output uses relative paths, so a project subpath like GitHub Pages works):

```bash
npm run build        # → dist/
```

## Export formats

Measured on the default layout, 1:1, 4-second loop, in headless Chrome (see `docs/SPEC.md` §9 for the full evidence trail):

| Format | Settings | Result | Notes |
| --- | --- | --- | --- |
| **GIF** | 1080×1080 · 16 fps · 32 colours · Atkinson dithering | 4.0 MB · 67 frames · ~30 s to encode | The format that actually loops everywhere. Palette is sampled from all frames, so there is no flicker between frames. Export can be cancelled mid-run. |
| GIF (WeChat preset) | 720×720 · 12 fps | 1.5 MB · 50 frames | WeChat may silently downgrade animations over ~1–2 MB, so this preset is deliberately small. |
| **MP4** | 1080×1080 · 30 fps · H.264 | 1.2 MB · 120 frames | Encoded via WebCodecs in ~2 s — an order of magnitude faster than the GIF path. Keyframe interval equals the loop length, so a rewind does not stutter. |
| **PNG** | native size | ~250 KB | Static frame, fonts embedded as data URIs. |
| **SVG** | native size | ~5 KB | Vector, fonts referenced from a CDN rather than embedded. |

## Platform presets

| Preset | GIF limit | What the preset does |
| --- | --- | --- |
| X / Twitter | 5 MB (app) · 15 MB (web) | Keeps 1080p. Only a GIF post loops forever — an MP4 becomes a video post with a progress bar. |
| GitHub | 10 MB | Keeps 1080p. GIF animates inline in READMEs; video cannot be inlined. |
| Discord | 20 MB | Keeps 1080p. GIF plays inline; MP4 needs a click. |
| WeChat | 2 MB (practical) | Drops to 720×720 / 12 fps. |
| Xiaohongshu | — | MP4 recommended; GIF support is unreliable. |

Size estimates come from a model calibrated against real exports at 1, 3, 5, 8 and 12 rows — the estimate lands within a few percent of the measured file, so the "over limit" warning is trustworthy before you spend 30 seconds exporting.

## How it works

```
state + t ──► scene() ──► SVG string ──┬──► innerHTML            (live preview, 60 fps)
                                       ├──► canvas.toBlob()      (PNG)
                                       ├──► modern-gif           (GIF, 67 frames)
                                       └──► WebCodecs + mediabunny (MP4, 120 frames)
```

- `src/core/scene.ts` — the only place the card is rendered. Pure function: same input, same string.
- `src/core/ticker.ts` — seamless scroll math (period = items × spacing; rational LCM for multi-speed rows).
- `src/core/presets.ts` — platform thresholds, derived export settings, calibrated size estimation.
- `src/exporters/` — one file per format; all of them consume `scene()` output.
- `src/templates/*.json` — layouts and their JSON-Patch variants.

Design decisions and the reasoning behind them live in [`docs/SPEC.md`](docs/SPEC.md) (Chinese, written before the first line of code).

## Browser support

Preview, PNG, SVG and GIF work in any modern browser. **MP4 needs WebCodecs** (Chrome/Edge 94+, Safari 16.4+, Firefox 130+ desktop; Firefox for Android does not support it). When WebCodecs is missing the MP4 button is disabled with an explanation and GIF remains available — the app never silently produces a broken file.

## Documentation

- [Design spec & decision log](docs/SPEC.md) — why the architecture looks like this
- [Contributing guide](CONTRIBUTING.md) — dev setup, verification tooling, good first issues
- [Changelog](CHANGELOG.md)

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first — it explains the verification scripts this project relies on. Chinese is fine in issues and PRs.

There is no response-time commitment: this is a side project, maintained when there is time.

## Credits

Built on [modern-gif](https://github.com/niclasvaneyk/modern-gif) (MIT) and [mediabunny](https://mediabunny.dev) (MPL-2.0), bundled with [Inter](https://rsms.me/inter/) and [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) (both SIL OFL 1.1, subset via [Fontsource](https://fontsource.org)).

## License

[MIT](LICENSE) © 2026 zyphraxns
