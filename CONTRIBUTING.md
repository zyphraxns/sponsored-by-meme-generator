# Contributing

Thanks for taking a look. This is a small project with one strong opinion, so read the first two sections before writing code — they will save you a review round-trip.

中文说明简短版在文末。用中文提 issue / PR 完全没问题。

## The one rule

**There is exactly one renderer: `scene(state, t) → SVG`.**

Preview, PNG, SVG, GIF and MP4 all consume its output. A pull request that renders the card a second time — for a format, for a preview, for a hover state — will be declined, because the whole point of the architecture is that a preview cannot drift from an export.

If you need something to look different in one export, add a parameter to the template or to `state` and let `scene()` handle it.

## Setup

```bash
git clone https://github.com/zyphraxns/sponsored-by-meme-generator.git
cd sponsored-by-meme-generator
npm install
npm run dev            # http://localhost:5173
```

Node.js ≥ 20. There is no `.env`, no database, no service to start.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Static build into `dist/` |
| `npm run typecheck` | `tsc --noEmit` (strict + `noUncheckedIndexedAccess`) |
| `npm run lint` | Biome lint over `src/`, `scripts/`, `tests/` (also runs in CI) |
| `npm run lint:fix` | Biome lint with safe auto-fixes |
| `npm run format` | Biome formatter (writes changes) |
| `npm run format:check` | Biome formatter in check-only mode |
| `npm test` | Vitest, 219 tests |
| `npm run fonts:slices` | Regenerate the Noto Sans SC slices in `public/fonts/` from the installed `@fontsource/noto-sans-sc` package |
| `npm run fonts:b64` | Regenerate the Inter base64 sidecar |

Before opening a PR, all four must be green:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

`npm run format:check` is advisory for now: the existing tree has not had a
formatter pass yet, so it reports drift on legacy files. Run `npm run format`
on files you touch, or wait for the dedicated format-only commit.

## Verification tooling

This project does not trust "it looked fine on my machine". Three self-check pages run the real export pipelines in a real browser and dump machine-checkable evidence:

| Page | Checks |
| --- | --- |
| `/verify-export.html` | PNG pipeline: embedded font vs. no-font control pixel diff, Chinese slice embedding, title ink pixels |
| `/verify-gif.html` | GIF pipeline: decode round-trip, frame count, delays, infinite-loop extension |
| `/verify-mp4.html` | MP4 pipeline: encode, then demux + decode the first frame back with mediabunny |

They are parameterised, e.g. `verify-gif.html?fps=12&basePx=720&zh=0`.

Driving them headlessly needs CDP, not `--dump-dom` (which fires before `img.decode()` / `toBlob()` resolve):

```bash
npm run build
python3 -m http.server 4399 --directory dist --bind 127.0.0.1 &
node scripts/cdp-selfcheck.mjs http://127.0.0.1:4399/verify-gif.html /tmp/out "SELFCHECK:" 180000
```

Two byte-level inspectors exist for the same reason — a file can be structurally broken while the library that wrote it reports success:

```bash
node scripts/gif-inspect.mjs /tmp/out/exported.gif
node scripts/mp4-inspect.mjs /tmp/out/exported.mp4
```

If you change anything in `src/exporters/` or `src/core/scene.ts`, run the matching self-check page and paste the output in your PR. "Tests pass" is not sufficient for pixels.

## Project layout

```
src/
├── core/          scene, ticker math, layout, JSON Patch, template schema, presets
├── exporters/     png · svg · gif · mp4 · font injection
├── templates/     layout JSON + registry
├── assets/        font data (Inter base64 sidecar, Noto slice manifest)
├── i18n.ts        UI strings (English / 中文)
└── main.ts        toolbar, timeline loop, export wiring
scripts/           CDP driver + GIF/MP4 byte inspectors + font slice builder
tests/             Vitest unit tests (pure functions)
docs/              design spec, demo asset
public/fonts/      generated Noto Sans SC slices (committed, so the build is reproducible)
```

## Adding a layout

Layouts are data. Copy `src/templates/sponsored-by.json`, change the copy/palette/layers, and register it in `src/templates/index.ts`. No renderer changes, no new code path.

Requirements:

- The file is validated at load time by `src/core/template-schema.ts` — errors name the exact path (`layers[1].items[0].icon`).
- `loopSeconds: "auto"` derives the loop from row speed. If you add rows with different speeds, use rational speed multipliers, otherwise the global LCM period diverges.
- Test it with `npm test` (template registry tests pick up new files) and look at it in `npm run dev`.

## Code style

- TypeScript strict, no `any` in new code; `noUncheckedIndexedAccess` is on, so array/record access needs handling, not a cast.
- Comments explain **why**, not what. Non-obvious trade-offs, measured numbers, and browser quirks belong in a comment next to the code — several existing comments record things that only showed up in testing (font stack order, async font decoding in `<img>`, GIF delay quantisation).
- Pure functions belong in `src/core/` and get unit tests; anything touching DOM/canvas belongs in `src/exporters/`.
- UI strings go through `src/i18n.ts`, in both locales. A PR that only updates English will be asked to add Chinese.

## Commits and PRs

Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

PRs should state what changed, why, and how it was verified (commands + output). If a change alters an exported file's bytes, mention it — that is a user-visible change.

## Good first issues

- **Multiple logos queued instead of one repeating icon** — the "sponsored by these folks jointly" variant. Touch `ticker.ts` and the ticker layer schema.
- **Icon search box** for `simple-icons` (3000+ monochrome brand icons). Needs a runtime slug index (`data.jsdelivr.com/v1/packages/npm/simple-icons@<ver>`), not a bundled asset list.
- **Content editing UI** — text, icon list, palette, row count, speed. `state` already carries all of it; only the controls are missing.

## 中文说明

- 只有一处渲染：`scene(state, t)`。不要为某一种导出另写渲染逻辑。
- 改完跑 `npm run typecheck && npm test && npm run build`；动了导出或渲染，还要跑对应的 `verify-*.html` 自检页（用 `scripts/cdp-selfcheck.mjs` 驱动，别用 `--dump-dom`）。
- 注释写「为什么」——尤其是实测出来的浏览器怪癖和取舍数字。
- 界面文案要中英两份。

## Code of conduct

Participation is covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
