# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **A second text layer where the layout has one.** `sponsored-by` now ships a subtitle (`no budget, all vibes`), and `made-by-gang` ships a handle layer (`@the-gang`); `no-sponsors` keeps its single title. The toolbar reads the template's actual text layers and generates one textarea per layer, so a one-text-layer layout does not grow an empty field. Clicking any text layer on the card opens the inline editor for that layer, and drafts / share links store copy per layer id rather than assuming a single title.
- **Transparent background for static exports.** A `Transparent PNG/SVG` switch in the export area hides the background rectangle, and the preview swaps its page colour for a checkerboard so the transparency is visible before exporting. PNG decides ink coverage from alpha (`alpha > 0`) instead of comparing against the background colour; GIF and MP4 force the background back on internally, because neither format carries alpha here. The switch travels in drafts and share links (`tb`), and only a boolean `true` is accepted from a link.
- **Share links and drafts are validated at the boundary.** Anything coming from a URL hash or local storage now passes a whitelist before it reaches the renderer: template and variant ids must exist in this build, ratio is one of `1:1 / 4:5 / 9:16 / 16:9`, locale is `en` or `zh`, rows clamp to 1–12, speed clamps to 0.5–2 and snaps to 0.05, colours accept only `#RGB` / `#RRGGBB`, and icon references must start with `emoji:` / `simple-icons:` / `svgl:` / `upload:`. Unknown values are dropped, not thrown; a corrupt link falls back to the default card instead of a blank page.
- **Seven one-click colour themes.** Ivory, Paper, Sand, Ink, Cobalt, Forest and Sunset each set background, foreground and accent together without touching the user's icons or copy; a `Template` chip returns to the layout's built-in palette. `accent` is now actually rendered as the underline beneath the headline, and falls back to the foreground colour when it would be invisible on the background.
- **9:16 portrait ratio.** Added for TikTok, Reels and Stories. All three templates now declare `1:1 / 4:5 / 9:16 / 16:9`.
- **Instagram, TikTok and Reddit presets.** Instagram applies 4:5 and recommends PNG (the feed does not accept animated GIFs); TikTok applies 9:16 and recommends MP4; Reddit applies 4:5 with a 20 MB image limit. Selecting a preset also applies its recommended ratio, and the matching export button gets a `Recommended` badge — unless that format is unavailable in the current browser.
- **Share the exported card.** After rendering a PNG, `Share card` opens the system share sheet with a real image file on mobile, copies the PNG to the clipboard on desktop, and falls back to a normal download when neither API is available. Cancelling the share sheet is treated as a no-op, not a failure.
- **Quick GIF.** A `720p / 12fps` option next to the export buttons, with estimated size and encoding time shown before you start. It combines with the platform preset by taking the smaller value, so choosing WeChat plus quick never produces a larger file.
- **Undo and redo.** `Cmd/Ctrl+Z` undoes, `Cmd/Ctrl+Shift+Z` or `Ctrl+Y` redoes, and the toolbar has icon buttons with the same behaviour. History keeps up to 50 snapshots; colour pickers, sliders and typing in any text field coalesce into one step per interaction. Inside text fields the shortcuts are left to the browser, so character-level text undo still works.
- **Click a text layer, not the whole poster.** The inline editor opens only when the click lands inside a text layer's actual box (title, subtitle or handle), supports hard line breaks with `Enter`, and closes with `Cmd/Ctrl+Enter` or `Esc` (keeping what was typed). The toolbar renders a textarea per text layer, so line breaks survive either entry point. A one-time first-visit hint explains this and offers a one-click brand demo; on narrow screens there is an `Edit title` shortcut next to `Settings` (it focuses the first text layer of the current layout).
- **Preview pause and timeline.** Pause the loop, scrub to any frame, and `Export PNG` writes exactly the frame currently on screen (the status line reports which second it was).
- **Filenames you can find again.** All four formats use `<title>-<YYYY-MM-DD>-<width>x<height>.<ext>`; Chinese characters are kept, and a title made only of emoji falls back to the template id.
- **GitHub README snippet.** Exporting a GIF with the GitHub preset shows a copy-ready `<img>` tag whose `src` matches the downloaded filename exactly.
- **Reorder icons and see recent ones.** Selected-icon chips can be dragged by a handle or moved with the arrow keys; the icon panel shows a `Recently used` row, persisted separately in local storage.
- **Uploaded logos survive a reload.** Draft storage keeps the upload contents, their aspect ratio and measured ink box (up to ~3 MB); a logo too large to store is reported instead of silently disappearing.
- **Optional symbol in front of a wordmark.** SVGL's wordmarks are inconsistent: Gemini and Mistral ship theirs with the symbol baked in, while OpenAI and GitHub ship text only (the symbol is a separate file). Width ratios and path counts don't separate the two cases reliably (2.23/2.71/3.12 and 6/2/16), so it can't be auto-detected — the icon panel now has a `Symbol + wordmark` switch. Turned on, OpenAI gets its flower back.
- **Titles wrap before they shrink.** A long headline used to be squeezed onto one line until it hit the 8 px floor — on a 1080 canvas that is a grey smear. It now breaks into up to three lines and picks the largest size that fits. Manual `Enter` breaks take precedence over automatic wrapping and are not subject to the three-line cap — the user chooses the line count, and segments still wrap internally. A text layer that still falls below the readable floor raises a non-blocking hint instead of shrinking silently.
- **Undo after `Surprise me`.** The randomiser rewrites layout, palette, icons and copy in one click; a `Undo` button now sits next to it for 15 seconds.
- **Drafts survive a reload.** The current selection is written to local storage (debounced) and restored on the next visit. A share link is loaded first when present, but the first real edit writes the draft and clears the hash, so a refreshed page shows the edited card rather than the old link.
- **Cancel a GIF export, with a time estimate.** The default 1080p export takes ~30 s; the status line now shows the remaining seconds and a cancel button appears while it runs.
- **Selected-icons list in the panel.** Chips at the top of the panel show what is selected, in order, and each one can be removed without hunting for its tile.
- **Chinese brand aliases.** Typing 苹果 / 英伟达 / 哔哩哔哩 now finds Apple / NVIDIA / Bilibili instead of an empty grid.
- **A face for the link.** Added `favicon.svg`, a 1200×630 `og.png` (generated by `scripts/build-og.mjs`), `description` / Open Graph / Twitter meta tags, and a repo link in the footer — links posted to X or Discord used to unfurl as a bare URL.

- **Text next to your own logo.** Uploaded logos can carry an optional text label, editable in the uploads list at the top of the panel; it renders beside the mark and drives the slot width. It is empty by default — most uploads already have their own wordmark baked in.
- **Upload tile in the grid.** The upload action is now the first tile in the icon grid, not just a button in the panel corner.
- **Upload your own logo.** The icon panel now has an upload button: SVG files are inlined and fitted by their own viewBox, bitmaps (PNG/JPEG/WebP) go in as data URLs rendered with `preserveAspectRatio`, and the original aspect ratio drives the slot width. Uploaded artwork keeps its own colours — it is never force-tinted.
- **SVGL-only brands are now searchable.** The brand index is the union of simple-icons and SVGL, so marks that were removed from simple-icons (OpenAI among them) are selectable again under the `svgl:` source; their symbol and wordmark both come from SVGL. Searches hit both sources.
- **Complete brand logotypes.** A ticker item can now render as an official full logotype (mark + name, e.g. OpenAI's flower plus wordmark) when one exists, falling back to the symbol plus the brand name set in the site's own type. 153 official wordmarks come from [SVGL](https://svgl.app) (MIT); everything else stays on simple-icons. Variants are picked by background luminance so a dark card gets the light-on-dark mark. Layout moved from fixed-pitch to variable-width slots to make room.
- **Colour mode.** Logos keep their own colours by default. The `mono` mode that forces the foreground colour is now a `Mono logos` switch in the icon panel, saved with share links and drafts. Colour presets raise the GIF palette headroom to 64.

### Tooling

- **Biome lint gate.** Added a minimal `biome.json` covering `src/`, `scripts/` and `tests/` (formatter settings match the existing style: single quotes, 2-space indent, 120 columns). `npm run lint` now runs in CI next to typecheck and tests. `npm run format` / `format:check` are available, but a repo-wide format pass is deliberately deferred so the current change stays reviewable and does not conflict with work in flight. A few stylistic rules that only flagged pre-existing hand-written code (`useTemplate`, `noNonNullAssertion`, `useShorthandFunctionType`, `noAssignInExpressions`) are off; `noExplicitAny` is relaxed in `tests/` only.

### Fixed

- **A share link no longer overwrites your edits on refresh.** Opening a link still restores the shared card first, but once you change anything the draft is written before the hash is cleared, so a refresh inside the 400 ms debounce window cannot lose the change either.
- **`verify-gif.html` no longer trips Vite's HTML parser.** A literal `<2 MB` in the page copy was read as the start of a tag (`invalid-first-character-of-tag-name`); it is now escaped as `&lt;2 MB`, so the build no longer prints a parse warning for that page.
- **Escape closes the icon panel** and returns focus to the `Icons` button.
- **`Clear` can be undone.** Clearing every selected icon takes an undo snapshot instead of wiping the selection.
- **`Symbol + wordmark` travels in share links and drafts**, so a shared OpenAI card keeps its flower.
- **The "restored your last edit" status clears itself** after a few seconds instead of staying on the status line.
- **Half the icon panel rendered as solid black squares.** Two separate causes. The panel forced `fill: ink` on every `path`, which flattened the "coloured badge + white knockout" designs — Behance, Binance, Nano, and the whole Adobe app-icon family became solid blocks. And every inlined SVG kept its original ids, so logos that happen to use the same id (Angular uses `a`/`b`/`c`/`d`) broke each other's `clipPath`/`mask`. SVGL art now renders in its own colours, ids are namespaced per tile and per ticker instance, and the renderer only recolours *genuinely monochrome* marks (so single-colour logos still flip to the foreground colour on dark cards). Upload thumbnails and wordmarks get the same treatment.
- **Share links dropped the headline.** `decodeShare` kept only entries whose value was a string, but the text map is `{layerId: {locale: string}}` — so the whole headline was filtered out and every shared card opened with the template default. Legacy flat links are still accepted.
- **`Surprise me` never changed the headline.** Same shape mismatch in `random-gen`: it wrote `{en: '…'}`, the renderer reads `text[layerId][locale]`, so all five jokes were silently discarded.
- **The size estimate ignored row count.** 1 → 12 rows all showed the same number, while the real GIF grew from 3.0 MB to 6.0 MB. The model now carries a row factor fitted to five measured points (1/3/5/8/12 rows, all within 2%), and the anchor was re-measured on the current card (4 152 364 B, previously 12% low).
- **Brand logos did not appear when opening a share link or a draft.** Icon pre-fetching only ran from `apply()`, so a restored card rendered as a row of plain text names until something was touched.
- **The icon panel failed silently when the CDN was unreachable.** 60 of 92 tiles rendered blank with the normal help text underneath. Failed tiles are now marked, the panel says how many failed, and a `Retry` button re-fetches only the failures.
- **Mobile was barely usable.** At 390 px the toolbar took 376 px (45% of the screen) and the footer's six buttons were squeezed into 45 px columns with vertical, clipped labels. The toolbar now collapses behind a `Settings` toggle below 780 px and footer buttons keep their natural width and wrap.
- **Two buttons stayed Chinese on the English UI**, and so did the "link copied" status line.
- **Loop length printed as `3.522222222222222s`.** The randomiser now picks a speed on the same 0.05 grid as the slider.
- **Uploaded logos got their file name as a caption by default**, which duplicated whatever was already drawn inside the image.
- **Clearing the title left a blank card with no explanation** — the input now shows the template's default as a placeholder.
- **Export could be edited out from under itself.** `Copy link` and `Surprise me` now disable while an export runs.
- **The icon preview cache kept rejected promises**, so a retry could never succeed even after the network came back.

- **Icon previews were clipped or blank.** Every tile forced its SVG into a `0 0 24 24` viewport (simple-icons' convention), so marks with a different viewBox — most of the SVGL ones — rendered as a black square. The tile now adopts each SVG's own viewBox.
- **Blank tiles when a search returned many results.** All previews were fetched at once and the CDN throttled the burst, leaving silent gaps. Previews now go through a pool of 8 concurrent requests.
- **Searching in Chinese returned every brand.** The normalised term collapsed to an empty string for non-Latin input, and `String.includes('')` is always true, so everything matched. Empty-normalised queries now return nothing, with a hint that brand names are in English.
- **Moving any slider dropped every logo** — the async-fetched icon/wordmark assets don't come from the selection state, so rebuilding the scene for ROWS / SPEED / PALETTE silently discarded them, leaving only the typeset names. Rebuilds now carry assets across.
- **Speed was quadratic, not linear** — the period was already shortened by the speed factor and the scroll offset multiplied by it again (2× behaved as 4×). The offset no longer double-counts.
- **Loop length was inflated for non-integer periods** — the LCM accumulator started from 1, so `LCM(1, 2.5) = 5` reported a 2.5 s loop as 5 s. Harmless while speeds were integers, wrong the moment 1.6× existed.
- Wordmark variants are re-picked when the background luminance flips (a dark mark on a dark card used to disappear).
- **The icon panel showed no brand icons at all** — the simple-icons metadata JSON changed from an object to an array, the old parser silently produced an empty index, and the fallback endpoint 404s on `@latest`. Both sources are replaced (unpkg package meta for the slug list) and a built-in list of 60 popular brands guarantees the panel is never empty.
- **Selected brand icons were invisible in the preview** — `scene()` silently skips icons whose SVG has not been pre-fetched, and nothing ever fetched them outside exports. The preview now hydrates the same way exports do.
- The icon button label leaked Chinese ("图标") on the English UI.
- Two garbage entries (`UGh`, `糖果`) in the emoji quick-pick row.
- A single hung CDN request could stall the whole prefetch batch; all logo fetches now time out after 8 s.
- Documentation and repository metadata still pointed at the old repository name after it was renamed to `sponsored-by-meme-generator`. The README (both languages), CONTRIBUTING guide, Issue-template links and `package.json` now use the new URLs, and the published site is at `https://zyphraxns.github.io/sponsored-by-meme-generator/`.

### Changed

- **Exporters load on demand.** `main.ts` no longer statically imports the GIF, PNG and SVG exporters, and never imports the MP4 path (mediabunny) until the button is pressed. PNG/GIF/SVG are prefetched when the browser is idle, so the first export is still instant on a warm cache. Measured from `dist/`: the entry plus its two preloaded chunks are ~33 KB gzip, down from a bundle that carried every exporter up front.
- **Platform presets now do more than derive export settings.** Selecting Instagram, TikTok or Reddit also applies that platform's ratio, and the recommended export format is highlighted with a badge instead of only being mentioned in the footer copy.
- **The preview stops rendering frames during an export.** GIF encoding at 1080p can take most of a minute and peak around 300 MB; the animation loop is cancelled for the duration and resumes from the same phase afterwards. Manual pause is kept separate from this export pause.
- **Brand logos are normalised by their visible ink, not by their viewBox.** Official wordmarks are cropped to their artwork, and typeset fallback names use the same cap height, so a row no longer swings 2.4× in height. The default emoji card keeps its original spacing, so the calibrated GIF size model stays valid.
- **Layout menu reworked.** The `Inverted` variant is gone — the palette control covers it, and one-click colour switching inside a layout selector was redundant. New copy variants built on the same JSON-patch architecture: **Powered by** on every layout (including `Powered by nothing` on No sponsors, closing the joke), and **Presented by** on Sponsored by. The menu is now nine items where every entry changes something visible.
- The default layout now uses a light background (`#f5f3ee`) with dark text, so dark brand marks stay visible; the former dark scheme moved to the `inverted` variant.
- `scripts/cdp-selfcheck.mjs` works on Chrome 132+ again: `--headless=old` was removed upstream, and the initial DevTools target now reports `type: "other"` instead of `"page"`.

## [0.2.0] - 2026-10-26

### Added

- **Brand icon library.** Ticker items can now be real brand marks from [simple-icons](https://simpleicons.org) instead of emoji: 3000+ single-colour SVGs fetched from the CDN at runtime, forced to one colour so the GIF palette stays small. The export path pre-fetches only the icons a scene actually renders.
- **Icon picker.** A searchable panel for choosing which brand marks appear in the ticker.
- **Title editing.** The headline is editable in the toolbar and updates the preview live.
- **Ticker controls.** Row count (1–12), speed (0.5×–2×, quantised to 1/20 steps so the global loop period stays finite), and background / foreground colour pickers.

### Fixed

- Editing the title and then moving any slider no longer resets the headline to the layout default.
- Dragging a slider no longer freezes the animation at `t = 0`, and no longer rebuilds the colour pickers mid-drag.
- Colour overrides no longer leak across layouts — a custom light background used to follow you into a dark layout.

### Known gaps

- `palette.accent` is declared by every layout but not yet read by the renderer, so the picker exposes only background and foreground. Wiring accent up means recolouring the headline, which would invalidate `docs/demo.gif`.

## [0.1.0] - 2026-10-25

First public release. Built in six milestones, each with a verifiable acceptance criterion (see [`docs/SPEC.md`](docs/SPEC.md) §9).

### Added

**Rendering**

- `scene(state, t) → SVG` as the single rendering source for preview and every export format.
- Seamless ticker scrolling: the layout at `t = loop` is identical to `t = 0`; multi-row phase offsets and per-row reverse scrolling.
- Layout engine driven by JSON: three layouts (`sponsored-by`, `made-by-gang`, `no-sponsors`) plus four tonal variants applied as RFC 6902 JSON Patches (`made-possible`, `inverted`, `made-by-friends`, `still-no-sponsors`).
- Runtime template validation with errors naming the exact failing path.

**Export**

- GIF export via `modern-gif`: 16 fps, 32 colours, Atkinson dithering, palette sampled from all frames (no inter-frame flicker), infinite loop, 65 of 67 frames automatically cropped to their changed region.
- MP4 export via WebCodecs + `mediabunny`: 30 fps, H.264 (VP9/AV1 fallback), fast-start metadata, keyframe interval equal to the loop length. ~1.3 s for 120 frames at 1080p.
- PNG export with fonts embedded as data URIs, so the file renders identically on a machine without the fonts installed.
- SVG export with CDN font references instead of embedded bytes.
- Platform presets (X, GitHub, Discord, WeChat, Xiaohongshu) with pre-export size estimation compared against each platform's limit.
- Built-in Inter (Latin) plus on-demand Noto Sans SC `unicode-range` slices — a Chinese title typically pulls 3–4 slices (~120 KB) instead of the full 2.4 MB set.

**UI**

- Live preview at 60 fps, bilingual (English / 简体中文), responsive to `prefers-reduced-motion`.
- Layout / variant / language / aspect-ratio / platform selectors.
- Footer shows the canvas size, the platform's playback caveat, and estimated vs. allowed export size.

**Tooling**

- `scripts/cdp-selfcheck.mjs` — zero-dependency Chrome DevTools Protocol driver for the self-check pages.
- `scripts/gif-inspect.mjs` and `scripts/mp4-inspect.mjs` — byte-level container parsers that verify exports independently of the libraries that wrote them.
- Three browser self-check pages (`verify-export`, `verify-gif`, `verify-mp4`) that run the real pipelines and dump machine-checkable evidence.
- 113 unit tests covering the pure parts: scroll math, scene determinism, XML escaping, JSON Patch, template validation, font-slice selection, preset derivation and size model.

### Fixed

- **Ticker dropped items near the loop seam.** The tiling range was hard-coded for `scroll ∈ [0, cycle)`, which only held while the preview was static; once the timeline advanced, `scroll` could span nearly two cycles and visible items on the left were skipped. Caught by a scene-level seamless-loop test, not by looking at the screen.
- **Embedded CJK font never applied.** `"PingFang SC"` was listed before `"Noto Sans SC"` in the font stack, so the system font always won — invisible on the author's machine, but it silently broke cross-device consistency.
- **First frame could export blank.** Fonts embedded inside `<img>` decode asynchronously; the first rasterisation sometimes beat them. `font-display: block` produced an empty title and `swap` silently fell back to a system font without repainting. Rasterisation now checks the title box for ink, retries, and fails loudly on timeout rather than shipping a card with a missing title.
- **Size estimator under-predicted small canvases by 18%.** Area scaling was assumed quadratic; measurement showed a 720² canvas costs 0.52× a 1080² one, not 0.44× (text edges are a larger share of pixels at small sizes). Fitted the exponent to 0.80; prediction error dropped below 1%.
- **MP4 inspector misread frame duration.** `stts` deltas are in the media timescale (`mdhd`), not the movie timescale (`mvhd`); the first version reported absurd per-frame durations. Added `mdhd` parsing.

### Notes

- Emoji are the only icon source in this release. `simple-icons` support and a content editing UI are the next planned additions; `state` already carries text, icons, palette, row count and speed.
- Firefox for Android does not support WebCodecs; the MP4 button is disabled there and GIF remains available.
