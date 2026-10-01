# Watch UI notes for AuroraChess (round-screen PWA)

Legend: **[M]** = manufacturer/standard published number · **[I]** = inferred by us from the documented rendering model (arithmetic shown) · **[E]** = estimate, verify on device.

---

## 1. Viewport + device facts for round watch browsing

### 1.1 Device table (physical spec published; CSS px + DPR derived)

All Wear OS watches below are **round** (`isScreenRound() == true`); Tizen Gear-era models are round too. No current round-face Wear OS watch is square.

| Device | Physical px (round) | Physical diameter | DPR [I] | CSS viewport px [I] | Shape |
|---|---|---|---|---|---|
| Galaxy Watch 4 40mm | 396 × 396 | 1.2" (30.4 mm) | 2.0625 → ~2 | ~192 | round |
| Galaxy Watch 4 44mm / 4 Classic 46mm | 450 × 450 | 1.4" (35.6 mm) | 2.344 → ~2.25–2.5 | ~180–200 | round |
| Galaxy Watch 5 40mm | 396 × 396 | 1.19" (30 mm) | 2.0625 | ~192 | round |
| Galaxy Watch 5 44mm / 5 Pro 45mm | 450 × 450 | 1.36" (35 mm) | 2.344 | ~192–200 | round |
| Galaxy Watch 6 40mm / 6 Classic 43mm | 432 × 432 | 1.31" (33.3 mm) | 2.25 | ~192 | round |
| Galaxy Watch 6 44mm / 6 Classic 47mm | 480 × 480 | 1.47" (37.3 mm) | 2.5 | ~192 | round |
| Galaxy Watch 7 40mm | 432 × 432 | 1.31" (33 mm) | 2.25 | ~192 | round |
| Galaxy Watch 7 44mm / Ultra 47mm | 480 × 480 | 1.47" (37 mm) | 2.5 | ~192 | round |
| Galaxy Watch 8 40mm | 438 × 438 | 1.34" (34 mm) | ~2.28 | ~192 | round |
| Galaxy Watch 8 44mm / Ultra 2 47mm | 480 × 480 | 1.47" (37.3 mm) | 2.5 | ~192 | round |
| Pixel Watch 1 / 2 | 450 × 450 (PW1 listed only as 320 ppi) | 41 mm case | 2.344 | ~192–200 | round |
| Pixel Watch 3 41mm | ~408 × 408 (10% more area than 384²) | 41 mm | ~2.125 | ~192 | round |
| Pixel Watch 3 45mm | ~480 × 480 (40% more area than 41mm) | 45 mm | 2.5 | ~192 | round |

Sources: [Galaxy Watch 4 (Wikipedia)](https://en.wikipedia.org/wiki/Samsung_Galaxy_Watch_4), [Galaxy Watch 5](https://en.wikipedia.org/wiki/Samsung_Galaxy_Watch_5), [Galaxy Watch 6](https://en.wikipedia.org/wiki/Samsung_Galaxy_Watch_6), [Galaxy Watch 7](https://en.wikipedia.org/wiki/Samsung_Galaxy_Watch_7), [Galaxy Watch 8](https://en.wikipedia.org/wiki/Samsung_Galaxy_Watch_8), [Pixel Watch](https://en.wikipedia.org/wiki/Pixel_Watch), [Pixel Watch 2](https://en.wikipedia.org/wiki/Pixel_Watch_2), [Pixel Watch 3](https://en.wikipedia.org/wiki/Pixel_Watch_3), [Pixel Watch summary (round dome display)](https://en.wikipedia.org/api/rest_v1/page/summary/Pixel_Watch).

**How DPR / CSS px were derived [I]:** Google's own Wear OS guidance says to design for the smallest round emulator at **192 dp**, with real devices living in **192 dp – 240+ dp** and **225 dp** as the small/large breakpoint ([Wear: Screen sizes](https://developer.android.com/design/ui/wear/guides/m2-5/foundations/screen-sizes), [Wear: Adaptive design](https://developer.android.com/design/ui/wear/guides/foundations/adaptive-design)). Wear OS 1 dp == 1 CSS px, so `DPR = physical px / dp width`: 396/192 = 2.0625, 432/192 = 2.25, 450/192 = 2.344, 480/192 = 2.5. **Do not hardcode physical px anywhere** — pick `--d: min(100vw, 100vh)` and let DPR do the work.

**Working assumption for AuroraChess: CSS viewport ≈ 192 × 192 on every watch above; `--d: 192`.** Use `@media (min-width: 225px)` as the "big watch" branch. [I], from the two Android pages above.

### 1.2 How a page renders on a round display

- The web is a **rectangle box model**; on a round device the *page is not reshaped*, it is **clipped**: the CSS Round Display spec shows "the part of the page that's currently shown on-screen is round but the viewport is rectangular… some part of the page may be clipped." [W3C CSS Round Display L1 §4.1](https://drafts.csswg.org/css-round-display/)
- `viewport-fit` on the `<meta name="viewport">` controls the layout viewport: **`contain`** = "largest rectangle which is inscribed in the display"; **`cover`** = "circumscribed rectangle of the physical screen" (corners clipped); **`auto`** = initial unchanged, "what the UA paints outside of the viewport is undefined." [same spec](https://drafts.csswg.org/css-round-display/)
- **The four corners are unusable.** For an inscribed square of the circle of diameter `D`, the corners touch the circle exactly, so *anything* placed in a corner is half-clipped. Region of the circle that lies **outside** the inscribed square = **36.4 %** of the circle's area (`1 − 2/π`); inside the square but outside the circle = **21.5 %** of the square (`1 − π/4`). [I]
- Inscribed-square side = `D·(√2)/2 = 0.707·D`. For D = 454 px that is **321 px**; for D = 396 px, **280 px**. [I]
- Safe band actually usable by content: a centered square of side `0.80·D` (15.6 % of the circle outside), diameter `D`, or the industry margin convention below.
- Screen density note for watch faces: "Background images for Wear devices with a screen density of hdpi should be **320 by 320 pixels**… The corners of the background image aren't visible on round devices." ([Wear: Design watch faces](https://developer.android.com/training/wearables/watch-faces/designing)) — i.e. 320 px half-clipping ≈ 2 px per corner at hdpi.

### 1.3 Shape-specific CSS: what actually works

| Feature | Status | Usable on Wear OS? |
|---|---|---|
| `@media (shape: round)` / `(shape: rect)` | Standardized in [W3C CSS Round Display L1 §3.1](https://drafts.csswg.org/css-round-display/), values `round`/`rect` (originally proposed as `device-radius`/`-webkit-device-radius`; **renamed away** in the 2016 draft, [W3C rounddisplay minutes 2014-10-29](https://www.w3.org/2014/10/29-rounddisplay-irc), [spec §8.2](https://drafts.csswg.org/css-round-display/)) | **NO.** MDN: "Currently, no browsers support this feature" ([MDN @media/shape](https://raw.githubusercontent.com/mdn/content/refs/heads/main/files/en-us/web/css/reference/at-rules/%40media/shape/index.md)). Confirmed in Blink source: `shape` is absent from Chromium's media-feature list ([media_feature_names.json5](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/css/media_feature_names.json5), [media_query_exp.cc](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/css/media_query_exp.cc)) |
| `-webkit-device-radius` | Never shipped as a media feature in Blink; not in the Chromium media-feature list above | **NO** |
| `-tizen-device-radius` / Tizen circular-ui media queries | Tizen-web-only legacy (`max-device-aspect-ratio: 1/1` era) ([Tizen online-doc commit](https://git.tizen.org/cgit/sdk/online-doc/commit/org.tizen.guides/html/web/w3c/ui/ui_layout_ww.htm?id=3f5f24332527a46de3f642f6dbaf30af1b45f2aa)) | **NO** on Wear OS |
| `shape-inside: display`, `border-boundary: display` | In the round-display spec (§5.1, §6.1) | **NO** — MDN: "Currently, no browsers support these features" ([MDN round display](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/css/guides/round_display/index.md)) |
| `viewport-fit=cover` / `contain` / `auto` | In the round-display spec §4.1; `viewport-fit` itself is widely implemented | Yes for the meta value; **behaviour on a round watch viewport is not documented anywhere we could source** — treat as **[E]** and test |
| `env(safe-area-inset-*)` | Specified in CSS Env 1; the four `safe-area-inset-*` values are "the safe distance from the top/right/bottom/left inset edge of the viewport, defining where it is safe to place content into without risking it being cut off by the shape of a non-rectangular display" ([MDN env()](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/css/reference/values/env/index.md)); "implemented in all major browsers since 2020", high WPT interop ([csswg-drafts #12780](https://github.com/w3c/csswg-drafts/issues/12780)) | **The only shape-aware primitive to rely on.** It is designed exactly for notch/round-corner clipping, but **do not assume Chrome populates non-zero insets on a round Wear watch** — always supply a fallback: `padding: max(5.2%, env(safe-area-inset-top, 0px))` |

**Practical conclusion: shape detection must be geometric (`vmin` + `aspect-ratio`), never via media features.**

---

## 2. Design guidance for round screens (numbers)

- **Never absolute outer margins on a round screen — always percentages**: "All top, bottom, and side margins should be defined in percentages to avoid clipping and provide proportional scaling of elements." ([Wear: Adaptive design](https://developer.android.com/design/ui/wear/guides/foundations/adaptive-design), [Wear: Design quality tiers](https://developer.android.com/design/ui/wear/guides/foundations/quality-tiers))
- **Minimum margins:** **5.2 % of device size for round screens**, 2.5 % for rectangular ([SAP Fiori for Wear OS — Layout](https://www.sap.com/design-system/fiori-design-android/v26-4/sap-fiori-for-wear-os/foundation/wear-os-layout)).
- **Touch targets:** **minimum 48 × 48 dp**; the system auto-expands any `Clickable` in a Tile to "at least 48dp x 48dp around each Clickable element for accessibility purposes" and warns to keep spacing so targets don't overlap ([Wear Tiles: Interactions](https://developer.android.com/training/wearables/tiles/interactions), [SAP Fiori for Wear OS](https://www.sap.com/design-system/fiori-design-android/v26-4/sap-fiori-for-wear-os/foundation/wear-os-layout)). Apple's platform minimum is 44 pt ([iOS tap target guideline](https://raw.githubusercontent.com/pproenca/dot-skills/refs/heads/master/skills/.experimental/ios-hig/references/inter-touch-targets.md)).
- **Design small first:** "Always design for small supported round-screen emulator first: **204dp – 216dp**. If the layout is dense render it at **192dp** to ensure nothing breaks — be sure to also test it as 192dp with **larger font sizes**." ([Wear: Adaptive design](https://developer.android.com/design/ui/wear/guides/foundations/adaptive-design))
- **Breakpoint:** "It's beneficial to use **225 dp** as a breakpoint between smaller screens and larger screens." ([Wear: Screen sizes](https://developer.android.com/design/ui/wear/guides/m2-5/foundations/screen-sizes))
- **Text alignment for round:** short text **centered** (visually balanced on a circle), long text **left-aligned** for readability ([SAP Fiori for Wear OS — Layout](https://www.sap.com/design-system/fiori-design-android/v26-4/sap-fiori-for-wear-os/foundation/wear-os-layout)).
- **Arc text is a first-class Wear type role** ("fixed height page titles or descriptors with limited space, such as confirmation overlays"), plus a dedicated numerals role for pickers ([Wear: Typography](https://developer.android.com/design/ui/wear/guides/styles/typography)).
- **Edge-hugging buttons** are the platform's "iconic design pattern for round devices" ([Wear: Design quality tiers](https://developer.android.com/design/ui/wear/guides/foundations/quality-tiers)).
- **Never let a larger screen show less:** "A larger display size should *never* display less information than ones that are smaller than it." ([Wear: Design quality tiers](https://developer.android.com/design/ui/wear/guides/foundations/quality-tiers))
- **Engine cost budgets from the same docs:** keep the drawing code in ambient mode simple to increase battery life; fetch data rarely and cache it ([Wear: Design watch faces](https://developer.android.com/training/wearables/watch-faces/designing)).

### 2.1 Geometry numbers to design against (all [I], pure circle math)

| Quantity | Value | At D = 454 px | At D = 396 px |
|---|---|---|---|
| Inscribed square side (`0.7071·D`) | 70.7 % of D | 321 px | 280 px |
| Area outside inscribed square | 36.4 % of circle | — | — |
| Safe content square, side `0.80·D` | 80 % | 363 px | 317 px |
| Safe content circle, diameter `0.896·D` (5.2 % margin/side) | 89.6 % | 407 px | 355 px |
| Per-side inset for a centered square of side `s` | `(D − s)/2` | e.g. 46 px for `s = 0.80·D` | 40 px |
| Circle chord at vertical offset `y` from center | `2·√(r² − y²)`, `r = D/2` | at top edge y = 0.45·D: usable width 0.89·D | same ratio |

---

## 3. Making a web UI fit a circle — CSS techniques

**3.1 Circular stage with the platform margin baked in.** Keep the arithmetic in one custom-property block; everything else reads `--d`.

```css
:root { --d: min(100vw, 100vh); --m: .052; --content: calc(var(--d) * (1 - 2*var(--m))); }
.stage {
  inline-size: var(--d); aspect-ratio: 1;      /* height comes from the ratio */
  margin: auto; border-radius: 50%;            /* visible edge */
  clip-path: circle(50%);                      /* hard clip, 50% = inscribed */
  display: grid; place-items: center;
  padding: calc(var(--d) * var(--m)); box-sizing: border-box;
}
```

**3.2 `clip-path` vs `border-radius` vs mask.** `clip-path: circle(50%)` clips children *and* hit-testing; `border-radius` only rounds the paint box (children still receive events in the clipped corner) — use both. `mask-image: radial-gradient(circle, #000 99%, transparent)` gives an antialiased edge; `clip-path` is cheaper on watch GPUs.

**3.3 Inset a square that must fit the inscribed square (57 % / 29 % rule).**

```css
.fit-square { width: calc(var(--d) * .707); aspect-ratio: 1; margin: auto; }
```

`0.707 = √2/2`; this is the largest axis-aligned square fully inside the circle. For margin, use `calc(var(--d) * .707 * .9)`.

**3.4 Radial layout — trigonometry, no JS needed for a fixed ring.**

```css
.chip { --r: calc(var(--d) * .34);                 /* ring radius            */
  --a: calc(var(--i) * 45deg);                    /* 8 chips, 45° apart      */
  position: absolute; top: 50%; left: 50%;
  translate: calc(cos(var(--a)) * var(--r) - 50%) calc(sin(var(--a)) * var(--r) - 50%);
}
```

`cos()`/`sin()` in `calc()` are CSS Values 4 and ship in current Chromium — verify on the watch; otherwise precompute `--x`/`--y` per index with `translate: ...` literal values. [E]

**3.5 Safe-corner avoidance.** Anything that must not be clipped goes inside a centered box of side `0.707·D`; anything outside it must be radially symmetric (arc text, edge-hugging ring buttons) so the clipping is intentional.

**3.6 Scrolling inside a circle.** Constrain the scroller to the inscribed width, not the viewport, so rows never start under the clip:

```css
.list { width: calc(var(--d) * .8); margin: auto; overflow-y: auto;
  scroll-snap-type: y mandatory; overscroll-behavior: contain; }
```

`overscroll-behavior: contain` stops scroll-chaining into the OS back gesture.

### 3.7 Chessboard legibility math

Square size for an 8 × 8 board, two candidate fits. Diameters here are **panel (physical) px**, so these are physical sizes; scale to CSS px by dividing by DPR (≈2.06–2.5):

| Method | Formula | D = 454 | D = 450 | D = 480 | D = 396 |
|---|---|---|---|---|---|
| Inscribed square (board width = 0.707·D) | `0.707·D/8` | **40.1 px** | 39.8 px | 42.4 px | **35.0 px** |
| Board diagonal fits the safe circle (`0.896·D/√2/8`) | `0.0792·D` | **36.0 px** | 35.6 px | 38.0 px | **31.4 px** |
| 4 × 4 zoomed board, width `0.707·D` | `0.707·D/4` | **80.2 px** | — | — | 70.0 px |
| 8 × 4 strip, width `0.707·D` | `0.707·D/4` | 80.2 px | — | — | 70.0 px |

**Verdict:** a full 8 × 8 board lands at **31–42 CSS px per square** (physical px, since these are panel resolutions), i.e. **below the 48 dp minimum touch target** on every round Wear watch, and a piece glyph drawn at ~⅔ of a square is only **21–28 px** — at or under the ~24 px floor where piece silhouettes stop being distinguishable. (On the recommended 4 × 4 board the square is 80 px and the glyph ~54 px.) **Do not ship a full 8 × 8 board on a round watch.** Recommended instead:

1. **Primary: 4 × 4 viewport board** ("window on the board"), 80 px squares at D = 454, pinch-drag or edge arrows to pan, with auto-pan to the destination file/rank after each move. Comfortable target, biggest glyphs.
2. **Alternative: 8 × 4 strip** — full width, half the rank axis; scroll-snap vertically one rank at a time (vertical is the platform-preferred scroll direction and never collides with the swipe-back gesture).
3. **Fallback for 396 px and older watches:** radial "pick a piece" wheel (≤ 8 chips on a ring, 45° apart, ≥ 48 px each) → then a highlighted legal-destination list, i.e. no board at all, only the target squares shown as large chips.

---

## 4. Interaction constraints

### 4.1 Gestures and targeting

- **No hover, no right-click.** Use `@media (hover: none) and (pointer: coarse)` (Chromium supports `hover`/`any-hover` and `pointer` as media features — [media_feature_names.json5](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/css/media_feature_names.json5)) and never gate anything on `:hover`.
- **Swipes collide with the OS.** Wear OS app navigation is **swipe from the left edge to go back** and **swipe down to dismiss** ([Wear Tiles: deep links / `SwipeDismissableNavHost`](https://developer.android.com/training/wearables/tiles/interactions) shows the platform's own swipe-dismiss model). Keep the leftmost ~10 % and the top strip free of draggables; set `overscroll-behavior: contain` and `touch-action: pan-y` on the stage.
- **Long-press** opens system surfaces (watch-face picker) — never use long-press as the only path to a command.
- **Tap accuracy:** the platform guarantee is a **48 dp** target ([Wear Tiles: Interactions](https://developer.android.com/training/wearables/tiles/interactions)); an 8 × 8 board gives 31–42 px, which is why §3.7 rejects it. Keep ≥ 8 dp of dead space between adjacent targets so the auto-expanded hit areas can't overlap.
- **Keyboard is unusable** — no typing anywhere; no `<input>`; no PGN/FEN text entry on watch. Search/choice must be taps or voice (platform dictation exists: "Natural language command and dictation" is a listed device feature, [Galaxy Watch 6](https://en.wikipedia.org/wiki/Samsung_Galaxy_Watch_6)).
- **Tap-tap move entry:** first tap selects the source square (highlight it + paint every legal destination with a filled dot), second tap on a legal destination commits; second tap on an illegal square re-selects instead of erroring. Give a full-screen "confirm move?" state for the destination tap if mis-taps show up in testing.
- **Promotion:** do **not** show a 4-item modal on a 192 px circle. Options, best first: (a) radial 4-chip ring (Q/R/B/N) at radius `0.34·D` from center, each chip ≥ 48 px, 90° apart; (b) 4-edge-hugging buttons (the platform's round-native pattern, [Design quality tiers](https://developer.android.com/design/ui/wear/guides/foundations/quality-tiers)); (c) default to queen with an "undo/change" chip. Under-promotion, if offered, must be a separate explicit step, never a long-press.
- **Feedback without hover:** animate on `:active` only, respect `prefers-reduced-motion` (supported in Chromium, per the media-feature list), and keep transitions ≤ 150 ms.
- **No right-click / contextmenu, no `title=` tooltips.**

### 4.2 Engine placement — battery and CPU

- **Client-side WASM is possible but heavy.** Stockfish.js WASM flavours ([nmrugg/stockfish.js README](https://raw.githubusercontent.com/nmrugg/stockfish.js/master/README.md), [npm README](https://app.unpkg.com/stockfish@17.1.0/files/README.md)): full multi-threaded ≈ **94 MB** and requires CORS/cross-origin-isolation headers (COOP/COEP, which a watch browser is very unlikely to give you); full single-threaded ≈ same size; **lite single-threaded ≈ 1.6 MB**, "far stronger than any human will ever be", and the README's own recommendation for this situation; ASM-JS ≈ 3 MB, "very slow and weak… last resort". Multi-threaded requires `setoption name Threads`, i.e. `SharedArrayBuffer` + cross-origin isolation.
- **Watch hardware budget:** the SoCs are Cortex-A55 ×2 @1.18 GHz (W920) / ×5 A78+A55 (W1000) with **1.5–2 GB RAM** and a **284–590 mAh** battery ([Galaxy Watch 5](https://en.wikipedia.org/wiki/Samsung_Galaxy_Watch_5), [Galaxy Watch 7](https://en.wikipedia.org/wiki/Samsung_Galaxy_Watch_7), [Galaxy Watch 8](https://en.wikipedia.org/wiki/Samsung_Galaxy_Watch_8), [Pixel Watch 2](https://en.wikipedia.org/wiki/Pixel_Watch_2)); Google's own wearable guidance is to keep continuous drawing/data work minimal for battery ([Design watch faces](https://developer.android.com/training/wearables/watch-faces/designing)).
- **Recommendation: run the engine server-side.** Watch sends the position (FEN/`position`+`go`), server returns the move; costs the watch a few kB of JSON and ~0 ms CPU. Cache the last N replies offline (IndexedDB) so airplane mode can still replay.
- **Offline fallback:** bundle the **lite single-threaded** Stockfish WASM (≈1.6 MB) and cap it — `setoption name MultiPV value 1` + `go depth 6 movetime 600` — inside a Web Worker, never on the main thread, and pause it whenever the page is backgrounded (`visibilitychange`). If even that is too heavy on a 396 px/1.5 GB device, fall back to a tiny JS opening book + random-weighted legal move so the app is never unrunnable.
- **Do not** attempt multi-threaded WASM on watch: it needs COOP/COEP ([cross-origin isolation guide](https://web.dev/articles/cross-origin-isolation-guide) referenced by the README) and burns a 300 mAh battery on 5 threads.
- **Apple Watch:** there is no Safari on watchOS and no official browser; web access is indirect (links in Messages/Mail, Siri), "single-window", "limited to a single tab with no address bar", "many complex websites may not load properly" ([iGeeksBlog, Aug 2025](https://www.igeeksblog.com/how-to-use-internet-on-apple-watch/)). Ship AuroraChess watch UI as a **view-only / move-confirm** surface there; full play only on Wear OS.

---

## 5. Concrete recommendation for AuroraChess watch UI

**Detection & breakpoints (exact values)**

```html
<!-- set viewport-fit=cover so the layout viewport is the full circumscribed
     square, then inset 5.2% ourselves; viewport-fit=contain would shrink the
     viewport to the inscribed square and waste diameter (spec §4.1) -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

```css
/* watch branch: round Wear OS, viewport ~192 CSS px */
@media (hover: none) and (pointer: coarse) and (max-width: 320px) and (orientation: portrait) { ... }
/* small watch  (396–432 physical px): platform's 192–224 dp band */
@media (max-width: 224px) { --sq: 4; --m: .052; }
/* large watch  (450–480 physical px) — platform 225 dp breakpoint */
@media (min-width: 225px) { --sq: 4; --m: .052; }
/* big-watch branch may show one extra row of context, never less content */
```

- **Content diameter:** `0.896·D` where `D = min(100vw, 100vh)`; margins **5.2 % per side** (SAP/Fiori for Wear OS convention). At D = 192 px: content circle **172 px**, inscribed square **136 px**.
- **Board concept — the honest numbers at D = 192 CSS px** (board width = `0.707·D` = 136 px):

| Board window | Square (CSS px) | vs 48 dp floor |
|---|---|---|
| 8 × 8 (full) | **17.0** | unusable |
| 4 × 4 | **33.9** | below floor (≈ 80 physical px) |
| 4 × 2 | **33.9 × 67.9** | passes on one axis |
| 2 × 2 | **67.9** | comfortably passes |

  **Ship a 4 × 4 pannable board** (a window on the 8 × 8): 33.9 CSS px squares — **2× the full board**, ~54 px piece glyphs, a comfortable visual size — and compensate for the sub-48 dp target with `Clickable`-style hit expansion (each square's hit area extended into its gutter), a persistent source-square highlight, and legal-destination dots that are themselves ≥ 24 px. Keep the 2 × 2 / "single piece at a time" view as the low-vision / hand-shake fallback. Reject the full 8 × 8 board: **17 CSS px** squares at 192 px viewport (**31–42 physical px**, still below the floor on every watch) — see §3.7.
- **Font sizes (CSS px at a 192 px viewport):** page title/arc text **16 px**, section label **14 px**, body/status **12 px** minimum, coordinate labels **10 px** only for non-critical annotations. Never below 12 px for anything the user must read.
- **Tap targets:** **≥ 48 × 48 CSS px for every interactive element** (hard floor; also the platform's guaranteed hit area), ≥ 8 px of dead space between neighbours, edge-hugging buttons on the circle rim where possible.
- **What's on screen:** (1) 4 × 4 board filling the safe circle, coordinates only on the two outer edges; (2) a single status arc at the top of the rim — "White to move" / "Check"; (3) edge-hugging chips at the rim for the primary actions.
- **What's behind a tap:** source→destination selection lives on the board (tap-tap, legal destinations shown as dots). A single rim chip opens a **radial engine bar** (hint / undo / flip); **promotion** opens a 4-chip radial ring (Q R B N) at `0.34·D`; **settings, PGN/FEN, clock configuration, game list, and any text entry are phone-only** and are reached via a "open on phone" chip — never via on-watch typing.
- **Engine location: server-side** (primary), with a **cached offline book + lite SingleThreaded Stockfish WASM ≈ 1.6 MB capped at `depth 6 / 600 ms` in a Web Worker** as the airplane-mode fallback; disable the worker while `document.hidden`. No `SharedArrayBuffer`, no COOP/COEP requirement.
- **Never rely on** `@media (shape: round)`, `device-radius`, `-webkit-device-radius`, `-tizen-device-radius`, `shape-inside`, `border-boundary` — none are implemented in any browser ([MDN shape](https://raw.githubusercontent.com/mdn/content/refs/heads/main/files/en-us/web/css/reference/at-rules/%40media/shape/index.md), [MDN round display](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/css/guides/round_display/index.md), [Chromium media features](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/css/media_feature_names.json5)). Use `env(safe-area-inset-*, 0px)` **as a max() supplement only**, with the geometric 5.2 % margin as the guaranteed baseline.
