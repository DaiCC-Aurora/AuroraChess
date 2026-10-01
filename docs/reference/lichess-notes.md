# Lichess engineering notes for AuroraChess

Source: `lichess-org/lila@master` + `lichess-org/scalachess@master`, read via GitHub API / raw endpoints on 2026-02.
**Legend: `[V]` = verified by reading the source file at the linked URL. `[I]` = inferred / not found in source. `[X]` = verified ABSENCE.**

Method note: no git access; every `[V]` claim has the raw URL inline. Line counts are of the files as fetched.

---

## 1. Engine strength / ELO control

### 1.1 The classic "Stockfish level 1-8" UCI table no longer exists
- `[X]` There is **no `modules/ai`** and no `Skill Level` / `UCI_LimitStrength` / `UCI_Elo` / `nodestime` string anywhere in the paths reachable by tree/dir listing (module list: <https://api.github.com/repos/lichess-org/lila/contents/modules>). The historical server-side AI module was removed; `aiLevel` survives only as legacy game JSON (`"aiLevel" -> pov.player.aiLevel`, <https://raw.githubusercontent.com/lichess-org/lila/master/modules/bot/src/main/BotJsonView.scala>).
- `[V]` The **only UCI option lila ever sends** for a browser engine is the variant: `setoption name UCI_Variant value <v>`, plus loading NNUE buffers via `setNnueBuffer`. Threads / Hash / MultiPV / movetime are *not* UCI strings from lila; they ride in the `Work` object consumed by the engine wrapper — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/ceval/engines/stockfishWebEngine.ts>.
- `[V]` "Play with computer" bots are defined by JSON fetched at runtime from `/bots` (`xhr.json('/bots').then(res => res.bots)`) and assets from `data/bot/{net,book,sound,image}/…`; bot definitions are **not** in the repo tree — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/bot/botLoader.ts>.

### 1.2 What replaced it: strength = search budget × move-selection filters
`[V]` Bot shape (`BotInfo`, <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/bot/types.ts>):
`{ uid, name, description, version, ratings:{blitz,rapid,…}, image, books?, sounds?, filters?, zero?:{multipv,net,nodes}, fish?:{multipv,depth} }`
`zero` = zerofish (in-browser NNUE engine); `fish` = Stockfish WASM analysis sidecar. `rating(bot, speed) = bot.ratings[speed] ?? ratings.classical ?? 1500`.

- `[V]` Search budget defaults (<https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/bot/bot.ts>): `zero.multipv` raised to `max(zero.multipv, avoid.length + 1)`; fish search `{ multipv: fish?.multipv ?? 1, by: { depth: max(10, fish?.depth ?? 10) } }`; `zero.nodes` optional (node budget = the weak-level knob).
- `[V]` Eval used for filters: `this.cp = fishResults.lines[last][0].score`.
- `[V]` CPL target filter (`scoreByCpl`, same file):
  - `cplTarget = |mean + stdev * getNormal()|`, `stdev = facetWeight('cplStdev') ?? 80`
  - weight per candidate move = `distance === 0 ? 1 : 1 / (1 + e^(gain * (distance - threshold)))`, `gain = 0.06`, `threshold = 80`, `distance = |mv.cpl - cplTarget|`
  - `getNormal()` = Box–Muller, caches the second variate.
- `[V]` Move-quality decay (`scoreByMoveQualityDecay`): moves are sorted by summed filter weights, then one is picked by weighted random with `P_i = decay^i` (`decay` from the `moveDecay` filter, default `0`). Sum of weights = `Σ decay^i`.
- `[V]` Book usage (`bookMove`): `bookChance = random() * Σ book.weight` picks the book; inside the book another `random()` walks the move weights. Book weights are per-bot JSON.
- `[V]` Humanising tricks:
  - **Capture short-circuit**: if the best move captures the square the opponent just moved to, play it immediately and return `movetime / 2`.
  - **Threefold avoidance**: `makeThreefoldMoves` enumerates all legal moves, plays them, hashes the board and marks moves that would repeat a position more than twice as `avoid` — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/botPlay/src/play/botMove.ts>.
  - **Sound events** chosen by `chance`/`delay`/`mix` per bot, priority `playerWin > botWin > playerCheck > botCheck > playerCapture > botCapture > playerMove > botMove > greeting` (bot.ts).
- `[V]` Filters are interpolated curves over three facets (<https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/bot/filter.ts>): `move` domain 1..60 (fullmove), `score` domain 0..1 (= outcome expectancy), `time` domain −2..8 (= `log2(movetimeSeconds)`), combined by `max | min | avg`. Only two custom filters ship: `ui/lib/src/bot/filters/aggression.ts`, `ui/lib/src/bot/filters/pawnStructure.ts`.
- `[V]` Score facet uses the Elo logistic: `outcomeExpectancy(turn, cp) = 1 / (1 + 10 ** ((turn === 'black' ? cp : -cp) / 400))` (bot.ts).

### 1.3 Human-like thinking time
`[V]` `<https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/bot/movetime.ts>`:
- `if (!Number.isFinite(initial)) return 2` (untimed ⇒ 2 s); `if (ply < 2) return 0`.
- Mean movetime per **half-move** from keyframes mined from Jan-2025 lichess DB, per initial time (0, 15, 30, 60, 180, 300, 600, 3600 s), each frame = `{first:{m,b}, peak:{m,b}, tail:{m,b}}` linear in **rating**: e.g. `[180, first: m=-0.0005 b=2.25, peak: m=-0.0003 b=5.7, tail: m=0 b=1]`, `[60, first: m=-0.00038 b=1.33, peak: m=-0.0006 b=3.28, tail: m=-0.00007 b=0.34]`, `[0, first: m=-0.0002 b=0.6, peak: m=-0.0003 b=1.0, tail: m=-0.00016 b=0.46]`.
- Curve: `turn <= peakTurn ? first + (peak-first) * sin(π·turn / peakTurn / 2)² : tail + (peak-tail) / (1 + ((turn-peakTurn)/15)²)`.
- `peakTurn` (increment > 0) = `max(12 + (2 - increment)(rating - 1000)/1300, 7)`; (increment = 0, initial ≤ 60) = `min(4 + (initial/15)^1.2 + ((15 - (initial/15)^1.2)(rating-600))/1800, 19)`; else `min(12 + (initial-180)/60 + (rating-600)/138, 19)`.
- Increment tweaks `peak.m += (increment - 1.3)*0.0012`, `peak.b -= initial <= 180 ? 0 : increment*0.25`.
- Situational jitter: `unitDrift = sin(π·random())`; above/below clock-target: `target*(1+unitDrift)` or `target - unitDrift*(target - meanMovetimeAt(240))`.

### 1.4 Analysis-engine resource limits (reuse these numbers)
`[V]` <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/ceval/ctrl.ts>
- localStorage keys: `ceval.multipv` (default **1**), `ceval.search-ms` (default **8000**), `ceval.threads`, `ceval.hash-size`, `ceval.engine.<variant>`, `ceval.fen` (cross-tab mutex).
- `hashSize` clamped `{min: 16, max: engine.maxHash}`; threads clamped `{min: engine.minThreads, max: maxThreads}`; recommended threads = `hardwareConcurrency - (even ? 1 : 0)`; `maxThreads` = `min(engine.maxThreads ?? 32, hardwareConcurrency)` on mobile/ChromeOS.
- Emit throttle **125 ms**; `canGoDeeper` allowed while `localEval.depth < 245`; "deeper" = infinite movetime.
- `[V]` No `.exe`/binary engine; browsers run WASM SF + a `simpleEngine` (single-thread) fallback — <https://api.github.com/repos/lichess-org/lila/contents/ui/lib/src/ceval/engines>.
- `[I]` A published UCI_Elo→strength mapping for lichess levels was **not found** in master (the table lived with the removed server AI module).

---

## 2. Evaluation display

### 2.1 Winning-chances sigmoid (the important constant)
`[V]` <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/ceval/winningChances.ts>
```
MULTIPLIER = -0.00368208            // per https://github.com/lichess-org/lila/pull/11148
rawWinningChances(cp) = 2 / (1 + exp(MULTIPLIER * cp)) - 1     // range [-1, +1]
cpWinningChances(cp) = rawWinningChances(clamp(cp, -1000, 1000))
mateWinningChances(mate) = rawWinningChances(sign(mate) * (21 - min(10, |mate|)) * 100)
povDiff(color, e1, e2) = (povChances(color,e1) - povChances(color,e2)) / 2
```
- `[V]` Scalachess equivalent (0-100 scale, used by server accuracy + move judgements):
  `WinPercent.fromCentiPawns(cp) = 50 + 50 * winningChances(cp.ceiled)`, same constant `-0.00368208`, `.atLeast(-1).atMost(+1)`;
  `Cp.CEILING = 1000`, `Cp.initial = 15`, `fromMate(m) = fromCentiPawns(±1000)` — <https://raw.githubusercontent.com/lichess-org/scalachess/master/core/src/main/scala/eval.scala>.
- `[V]` Puzzle-fault thresholds (same TS file): `areSimilarEvals = povDiff < 0.14`; `hasMultipleSolutions = povChances(secondBest) >= 0.3524 || areSimilarEvals`.

### 2.2 Clamping, mate rendering, gauge maths
- `[V]` `renderEval(e)`: `e = clamp(round(e/10)/10, -99, 99)`, printed `(e>0?'+':'') + e.toFixed(1)` — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/ceval/util.ts>.
- `[V]` Pearl (eval number): centipawns → `renderEval(cp)`; mate → `'#' + mate` (e.g. `#5`); no eval → spinner; game over/threefold → `-` — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/ceval/view/main.ts>.
- `[V]` PGN comment: `[%eval 0.17]` from `cp.pawns` (2 dp) or `[%eval #5]` from mate; `Info.LineMaxPlies = 12`; PV text truncates at `MAX_NUM_MOVES = 16` — <https://raw.githubusercontent.com/lichess-org/lila/master/modules/tree/src/main/Info.scala>, main.ts.
- `[V]` **Eval gauge** (the vertical bar): `ev = povChances('white', bestEv)`; CSS var set to `--eval-percent: ${100 - (ev + 1) * 50}%`; `reverse` class when orientation is black; 7 tick marks at `(i+1)*12.5%` height, `i === 3` is `.zero`. ⇒ white's share = `(ev+1)*50 %` = `WinPercent/100` (main.ts).
- `[V]` Progress bar under the engine = `100 * millis / searchMovetime` (or depth/nodes ratio), `Math.min(100, …)` (main.ts).
- `[V]` MultiPV lines are re-sorted by `povChances(color, b) - povChances(color, a)` before display (ctrl.ts).

### 2.3 Move-quality classification — thresholds
`[V]` **Server/PGN judgements are computed on winning-chance delta, not centipawns** — <https://raw.githubusercontent.com/lichess-org/lila/master/modules/tree/src/main/Advice.scala>:
```
winningChanceJudgements = List( 0.3 -> Blunder, 0.2 -> Mistake, 0.1 -> Inaccuracy )   // first d <= delta wins
delta = (WinPercent(infoCp) - WinPercent(prevCp)) * (info.color == white ? +1 : -1)
```
- `[V]` Judgement enum + PGN glyph: `Inaccuracy → Glyph.MoveAssessment.dubious ("?!"), Mistake → mistake ("?"), Blunder → blunder ("??")`. Comment format: `(<eval> → <eval>) <Judgement>. <best move> was best.`; variation `take(20)` plies (Advice.scala, Annotator.scala).
- `[V]` Mate advice uses **cp thresholds 999 / 700** instead of win%: `MateCreated` with prev pov cp `< -999` → Inaccuracy, `< -700` → Mistake, else Blunder; `MateLost` with new pov cp `> 999` → Inaccuracy, `> 700` → Mistake, else Blunder; `MateDelayed` → no advice. Sequences: "Checkmate is now unavoidable", "Lost forced checkmate sequence", "Not the best checkmate sequence" (Advice.scala).
- `[V]` **No "Best/Excellent/Good/Book/Forced" enum in the server annotator** — only those three judgements exist there. The wider palette exists only as CSS colours: `--c-inaccuracy: hsl(202 78% 62%)`, `--c-mistake: hsl(41 100% 45%)`, `--c-blunder: hsl(0 69% 60%)`, `--c-good-move: var(--c-good)` = `hsl(88 62% 37%)`, `--c-brilliant: hsl(129 71% 45%)`, `--c-interesting: hsl(307 80% 70%)` — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/css/theme/_theme.default.scss>. `[I]` the brilliant/interesting classifiers themselves were not located.
- `[V]` `MateAdvice`/`CpAdvice` fallback order: `CpAdvice` first, then `MateAdvice` (Advice.scala).

### 2.4 Accuracy & ACPL
`[V]` <https://raw.githubusercontent.com/lichess-org/lila/master/modules/analyse/src/main/AccuracyPercent.scala>
- Per-move accuracy = 100 if the move did not decrease win% (for the mover), else
  `103.1668100711649 * exp(-0.04354415386753951 * winDiff) - 3.166924740191411 + 1` (the `+1` is an "uncertainty bonus"), clamped to `[0, 100]`. Constants obtained by `scipy.optimize.curve_fit` on sample points `xs=[0,5,10,20,40,60,80,90,100]`, `ys=[100,75,60,42,20,5,0,0,0]` (comment in file).
- Game accuracy = mean of a **volatility-weighted mean** and the **harmonic mean**; sliding `windowSize = (nbMoves/10).squeeze(2, 8)`; weight per window = `standardDeviation(raw win percents).squeeze(0.5, 12)`; the first `windowSize` windows are prepended (deque bias).
- `[V]` ACPL (<https://raw.githubusercontent.com/lichess-org/lila/master/modules/analyse/src/main/AccuracyCP.scala>): pair consecutive info evals, `(cp2.ceiled - cp1.ceiled) * povSign`, `.atLeast(0)`, then mean ⇒ average centipawn loss, only counting real losses.
- Phase split: `opening | middlegame | endgame` cut at `div.middle` / `div.end`, reusing the same gameAccuracy (AccuracyPercent.scala).

---

## 3. Tutor / coaching feature

### 3.1 What it actually is (correcting the brief)
- `[V]` **`modules/tutor` is a post-game statistical report, not an in-game coach.** It builds a `TutorFullReport` (per-perf) from the *insight* index + fishnet analysis, caches it in Mongo and notifies the user ("Tutor report ready") — <https://raw.githubusercontent.com/lichess-org/lila/master/modules/tutor/src/main/TutorBuilder.scala>.
- `[V]` **`ui/tutor` contains no coaching logic at all**: it wires click-to-navigate cards (`site.redirect`, 60 s reload while waiting) and PGN-viewer boards; an animated wall of games plays at `setInterval(… , 270 - nbMoves)` with per-board animation `duration: 100` — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/tutor/src/tutor.ts>.
- `[V]` So: **no intervention, no in-game phrases, no engine calls from the tutor UI.** The explanations are "metric vs peer group" comparisons.

### 3.2 The metrics it computes (reimplementable rubric)
`[V]` <https://raw.githubusercontent.com/lichess-org/lila/master/modules/tutor/src/main/TutorPerfReport.scala>: `accuracy, awareness, resourcefulness, conversion, globalClock, clockUsage, openings, phases, pieces, flagging`. Computed via `InsightMetric.MeanAccuracy`, `Awareness`, `ClockPercent` (filtered to Phase Middle+End), plus `TutorResourcefulness`, `TutorConversion`, `TutorClockUsage`, `TutorOpening`, `TutorPhases`, `TutorPieces`, `TutorFlagging`. Comparisons are split into `skillCompares` (accuracy/awareness/resourcefulness/conversion), `clockCompares` (pressure, time usage), `openingCompares` (per colour: accuracy/awareness/performance) and `phases.compares`; each list is reduced to highlights via `TutorCompare.mixedBag`.

### 3.3 Eligibility & peering rules (thresholds worth copying)
`[V]` TutorBuilder.scala / TutorConfig.scala:
- A perf is eligible only if `perf.nb >= 30` games and last game after `insight.minDate`.
- Peer cohort = other users' cached reports within **±2 rating** of the same perf, at most `Max(5_000)` games, report newer than 1 month.
- Report period defaults to **last 6 months** (`LocalDates(now.minusMonths(6), now)`), date range parsed from `yyyy-MM-dd_yyyy-MM-dd` in the URL, end-of-day is `23:59:59.999`.
- `estimatedTotalTime = stats.time * 2`; report id = `s"$user:$rangeStr"`.

---

## 4. Board interaction & rendering (chessground)

### 4.1 Config surface actually used
`[V]` Coordinate trainer board — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/coordinateTrainer/src/chessground.ts>:
`{ fen, orientation, blockTouchScroll: true, coordinates, coordinatesOnSquares, addPieceZIndex, jsHover: isSafari(), movable: { free: false, color: undefined }, drawable: { enabled: false }, draggable: { enabled: false }, selectable: { enabled: false }, events: { insert(elements), select(key) } }`.
`[V]` Read-only PV mini-board — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/ceval/view/main.ts>: `{ fen, lastMove, orientation, coordinates: false, viewOnly: true, drawable: { enabled: false, visible: false } }`.
- Mounting pattern: `div('.cg-wrap' | '.cg-wrap.is2d')` + `makeChessground(el, cfg)`, kept on `el._cg` / ctrl field; `cg.set(cfg)`, `cg.setShapes([...])`, `cg.toggleOrientation()`, `cg.redrawAll()`, `cg.destroy()`, state via `cg.state.orientation`, `cg.state.addPieceZIndex`.
- `[V]` Shapes API for drill targets: `setShapes([{ orig: key, customSvg: { html: '<g transform="translate(50,50)"><rect class="current-target" fill="none" stroke-width="10" x="-50" y="-50" width="100" height="100" rx="5"/></g>' } }])` (coordinateTrainer ctrl.ts).
- `[V]` Resize handle: `resizeHandle(elements, prefs, playing ? 2 : 0)` (chessground.ts).
- `[V]` Orientation from a `random` colour choice is resolved once via `COLORS[Math.round(Math.random())]`; 3D mode toggles `state.addPieceZIndex` via a `pubsub` `board.change` event.
- `[V]` Sound cue vocabulary (`SoundEvent`): `greeting, playerWin, botWin, playerCheck, botCheck, botCapture, playerCapture, playerMove, botMove`, each a list of `{key, chance, delay, mix}` — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/bot/types.ts>, bot.ts.
- `[X]` Keyboard side-to-move / pawn-drop bindings and the promotion *flow* live in `ui/keyboardMove` and `ui/round`, which were **not read in this pass** — treat those specifics as unverified.

### 4.2 Chessground defaults: moves, premoves, animation, annotations
`[V]` `defaults()` — <https://raw.githubusercontent.com/lichess-org/chessground/master/src/state.ts> (config surface: <https://raw.githubusercontent.com/lichess-org/chessground/master/src/config.ts>):
- `coordinates: true`, `coordinatesOnSquares: false`, `ranksPosition: 'right'`, `viewOnly: false`, `disableContextMenu: false`, `autoCastle: true`, `blockTouchScroll: false`, `touchIgnoreRadius: 1`, `pieceKey: false`, `trustAllEvents: false`, `jsHover: false`.
- `highlight: { lastMove: true, check: true }` (plus `highlight.custom: SquareClasses` for arbitrary square classes).
- `animation: { enabled: true, duration: 200 }`; a duration `< 70` ms auto-disables animation entirely (`applyAnimation`).
- `movable: { free: true, color: 'both', showDests: true, rookCastle: true }` — `dests` is `{"a2": ["a3","a4"], …}` and drives the `move-dest` class; `rookCastle: true` casts by moving the king onto the rook, and when false the a1/h1 dests are stripped if c1/g1 are available.
- `premovable: { enabled: true, showDests: true, castle: true, additionalPremoveRequirements: () => true }` with `set/unset` events and `customDests`; `predroppable: { enabled: false }`.
- `draggable: { enabled: true, distance: 3, autoDistance: true, showGhost: true, deleteOnDropOff: false }`; `selectable: { enabled: true }` — **both are on, so click-click and drag coexist**; `stats.dragged = !('ontouchstart' in window)` ⇒ touchscreens default to tap-tap.
- `dropmode: { active: false }` for crazyhouse-style pockets.
- `[V]` **Annotation brushes** (drawable defaults, same file): `green #15781B`, `red #882020`, `blue #003088`, `yellow #e68f00` (all opacity 1, lineWidth 10); pale `paleBlue #003088`, `paleGreen #15781B`, `paleRed #882020` (opacity 0.4, width 15), `paleGrey #4a4a4a` (0.35/15); `purple #68217a` (0.65), `pink #ee2080` (0.5), `white`/`paleWhite` (opacity 1/0.6), `variation` (white, 0.5, width 12). `defaultSnapToValidMove: true`, `eraseOnMovablePieceClick: true`.
- `[V]` **Brush selection by modifier key** — <https://raw.githubusercontent.com/lichess-org/chessground/master/src/draw.ts>: index = `(shift||ctrl) && rightButton ? 1 : 0` + `(alt||meta||AltGraph) ? 2 : 0` into `[green, red, blue, yellow]`. So: right-drag = green, ⇧/ctrl+right = red, alt+right = blue, ⇧+alt+right = yellow. A circle is drawn when `dest === orig`; re-drawing the same endpoints with a different brush replaces the shape; `DrawShape` supports `customSvg` (100×100 viewBox), `label.text`, `piece {role,color,scale}`, `below`, `modifiers.lineWidth|hilite`.
- `[I]` Keyboard move entry (`ui/keyboardMove`), the promotion-picker *trigger*, and crazyhouse pocket drops were not read.

### 4.3 Highlight / shape CSS (copyable geometry & colours)
`[V]` <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/css/theme/board/_chessground.scss> — squares are `12.5% × 12.5%` absolutely positioned; pieces the same, `background-size: cover`.
| Class | Value |
|---|---|
| `square.move-dest` | `radial-gradient(rgb(20 85 30 / 0.5) 19%, rgb(0 0 0 / 0) 20%)` (dot = 19% radius) |
| `square.move-dest:hover` | `rgb(20 85 30 / 0.3)` |
| `square.oc.move-dest` (capture ring) | `radial-gradient(transparent 0%, transparent 79%, rgb(20 85 0 / 0.3) 80%)` |
| `square.premove-dest` | `radial-gradient(rgb(20 30 85 / 0.5) 19%, rgb(0 0 0 / 0) 20%)`; hover `rgb(20 30 85 / 0.2)`; ring `rgb(20 30 85 / 0.2)` |
| `square.last-move` | `rgb(155 199 0 / 0.41)`; overridden to `rgb(0 155 199 / 0.41)` on boards `green`, `green-plastic`, `marble`; custom PNG on `horsey` |
| `square.check` | `radial-gradient(ellipse at center, rgb(255 0 0/1) 0%, rgb(231 0 0/1) 25%, rgb(169 0 0/0) 89%, rgb(158 0 0/0) 100%)` |
| `square.selected` | `rgb(20 85 30 / 0.5)` |
| `square.current-premove` | `rgb(20 30 85 / 0.5) !important` |
| `piece.dragging` / `.anim` / `.fading` / `.ghost` | z-index 204 (`!important`) / 3 / 1 / –, fading opacity 0.5, ghost 0.3 |
| shape layers | `.cg-shapes` opacity 0.6, `.cg-shapes-below`, `.cg-custom-svgs`, `.cg-custom-below`, `cg-auto-pieces` (auto pieces opacity 0.3) |
| board surface | `cg-board::before { background-size: cover }` + `filter: brightness(var(---board-brightness)/100) contrast(var(---board-contrast)/100) hue-rotate(calc(var(---board-hue)*3.6deg))`; transp themes use `---board-opacity` |
| coords-on-all-squares | `coords.squares { width: 12.5% }`, `coord { padding: 6% 4% }`, `.rank2…rank8 { transform: translateX(100%…700%) }`, `.black { flex-flow: column }`, `.left { text-align: left }` |

### 4.4 Colours & sprite structure
`[V]` **Promotion picker** (this is a real hex source) — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/css/chess/_promotion.scss>:
`#promotion-choice` covers the board, `background: rgb(from $c-bg r g b / alpha*0.7)`, `z-index: $z-cg__promotion-205`, size `var(---cg-width,100%) × var(---cg-height,100%)`; each `square` is a **circle** (`border-radius: 50%`) with `background-color: #b0b0b0` and `box-shadow: inset 0 0 25px 3px #808080`; on `:hover` `box-shadow: inset 0 0 48px 8px $c-accent; border-radius: 0`; `.is2d piece { width:100%; height:100%; transform: scale(0.8) }` → `transform: none` on hover.
`[V]` **Pieces are CSS background-images on `<piece class="<role> <color>">` elements**, driven by custom properties `---white-pawn … ---black-king` — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/css/theme/_pieces.scss>. `[I]` the default piece *set name* (commonly "cburnett") was not found in the files read; sets are just directories of SVGs referenced by those vars.
`[V]` **Board themes** — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/css/theme/board/_boards.scss>: 2D themes are **image textures** (`file-ext: png|jpg|webp|svg`) plus two coordinate colours; there are **no light/dark square hex values in CSS**. 28 2D themes exist (`blue, blue2, blue3, blue-marble, canvas, wood…wood4, maple, maple2, leather, green, brown, pink, marble, green-plastic, grey, metal, olive, newspaper, purple, purple-diag, ic, horsey, wood-worn, putt-putt, cocoa, parchment`) and 19 3D themes.
- `[V]` `brown` is `{ file-ext: png, coord-color-white: #f0d9b5, coord-color-black: #946f51 }`; `green` `{#ffd, #6d8753}`; `wood` `{#d8a45b, #9b4d0f}`; `blue` `{#dee3e6, #788a94}`; `grey` `{#b8b8b8, #7d7d7d}`.
- `[V]` Rendering plumbing — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/css/theme/board/_board-2d.scss>: `body[data-board='<name>'] .is2d cg-board::before { background-image: url(../images/board/<name>.<ext>) }` (SVG themes live in `board/svg/`), coordinates styled via `coords { ---cg-ccw: <white>; ---cg-ccb: <black>; ---cg-cs: none }`; `.is2d piece { left:0; top:0; width:12.5%; height:12.5% }`; `cg-board::before { top:0; height:100% }`.
- `[I]` The dark square of the brown board (`#b58863` in many clones) is **not** in lila source — it is baked into `public/images/board/brown.png`. Only `#f0d9b5` is verifiable as a lila hex.
- `[V]` Dark theme accent palette (usable for an app shell): `---site-hue: 37deg`, `--c-bg: hsl(37 7% 14%)`, `--c-bg-page: hsl(37 10% 8%)`, `--c-primary: hsl(209 79% 56%)`, `--c-secondary: hsl(88 62% 37%)`, `--c-good: hsl(88 62% 37%)`, `--c-bad: hsl(0 60% 50%)`, `--c-accent: hsl(22 100% 42%)` (_theme.default.scss).

### 4.5 Accessibility conventions observed
- `[V]` Screen-reader / keyboard support is a first-class module: `ui/lib/src/nvui/` (with `ui/analyse/src/analyse.nvui.ts`, `ui/analyse/src/nvuiUtil.ts`, `ui/learn/src/learn.nvui.ts`, `ui/lib/src/keyboardMove`) — <https://api.github.com/repos/lichess-org/lila/contents/ui/lib/src>, <https://api.github.com/repos/lichess-org/lila/contents/ui/analyse/src>.
- `[V]` Every control is a real form element with `id` + `name` + `<label for>`, `title` for the a11y/explanation text, and `keyup` handlers so Enter on a radio starts the drill (`onRadioInputKeyUp`, coordinateTrainer ctrl.ts/side.ts).
- `[V]` Icon buttons use `role: 'button'` and move focus explicitly for NVUI: `setTimeout(() => document.querySelector<HTMLElement>('#select-engine')?.focus()); // nvui` (ceval/view/main.ts).
- `[V]` `site.mousetrap.bind('z', …)` for zen mode; documented single-key shortcuts in `title` (e.g. `i18n.site.toggleLocalEvaluation + ' (L)'`, `showThreat + ' (x)'`).
- `[V]` Kid mode changes defaults: un-timed coordinate drill, coordinates and coordinates-on-squares on — `document.body.classList.contains('kid')` (coordinateTrainer ctrl.ts).
- `[V]` Board state is also exposed to assistive tech through a hidden board (`showCoordsOnAllSquares` → `coordinatesOnSquares`) and a text input (`coordinateInputMethod: 'text' | 'buttons'`, default `text` when width ≥ 980).

---

## 5. Opening knowledge & training modes

### 5.1 Opening data & lookup
`[V]` Data originates from **`lichess-org/chess-openings` TSVs** (`a.tsv`…`e.tsv`), 3 tab-separated columns `eco \t name \t pgn`, converted by `sync-openings.py` into Scala `Opening(eco, name, epdFen, uciMoves, pgn)` — <https://raw.githubusercontent.com/lichess-org/scalachess/master/sync-openings.py>.
`[V]` Lookup is a **FEN map**, not a trie — <https://raw.githubusercontent.com/lichess-org/scalachess/master/core/src/main/scala/opening/OpeningDb.scala>:
- `byFen: Map[StandardFen, Opening]` built from `openingDbPartA..E` (`all`); `shortestLines` keeps the shortest UCI line per `OpeningKey`; `isShortest` guards duplicates.
- `SEARCH_MAX_PLIES = 40`, `SEARCH_MIN_PIECES = 20`.
- `searchInPositions` walks positions **right-to-left** (`foldRight`) and returns the **deepest** matching opening, skipping positions with `< 20` pieces, as `Opening.AtPly(opening, ply)`; searches stop at the first `@` (drops/variants).
- `[V]` Display format: `s"${o.opening.eco} ${o.opening.name}"`, attached to the move at `o.ply` — <https://raw.githubusercontent.com/lichess-org/lila/master/modules/analyse/src/main/Annotator.scala>.
- `[I]` "Is this move book?" as a separate UI concept was not located; the equivalent is *"an opening was found for this ply"* (plus the bot's own polyglot `books`).
- `[V]` Bot books are polyglot `.bin` files (`makeBookFromPolyglot`) plus a built-in "lichess" book (`makeLichessBook`), addressed by key and filtered by `book.color` vs side to move (botLoader.ts, bot.ts).

### 5.2 Drill-loop structures
- `[V]` **Learn (`/learn`)**: score atoms `apple = 50`, `capture = 50`, `scenario = 50`; level bonus by lateness `1 → 500, 2 → 300, 3 → 100` where `late = nbMoves - level.nbMoves`, rank 2 if `0 < late <= max(1, nbMoves/8)`, else 3; `levelMaxScore = pointsAwarded*50 + (pointsForCapture ? captures*50 : 0) + 500`; level rank = 1 star at max, 2 stars within 200, else 3; stage rank = 1 at max, 2 within `max(200, levels.length * 150)`, else 3 — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/learn/src/score.ts>. Piece values for captures: `queen 90, rook 50, bishop 30, knight 30, pawn 10`.
- `[V]` **Learn persistence**: localStorage key **`learn.progress`** holding `{ stages: { <stageKey>: { scores: number[] } } }` (index = `level.id - 1`); a score is only written if it beats the stored one; logged-in users POST `/learn/score` (`stage`, `level`, `score`) and POST `/learn/reset` instead — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/learn/src/storage.ts>.
- `[V]` **Coordinate trainer**: 2 modes (`findSquare`, `nameSquare`), 2 time controls (`untimed`, `thirtySeconds` with `DURATION = 30_000` ms, `TICK_DELAY = 50` ms); score = number of correct squares in 30 s, starting coordinates are advanced twice and play begins after a `1000` ms delay; wrong answers flash for `500` ms and **do not** advance; next-square generator avoids repeating the previous file *or* rank (one of the two, randomly) and honours optional file/rank subsets — <https://raw.githubusercontent.com/lichess-org/lila/master/ui/coordinateTrainer/src/ctrl.ts>.
- `[V]` Coordinate localStorage keys: `coordinateTrainer.colorChoice`, `coordinateTrainer.mode`, `coordinateTrainer.selectionEnabled`, `coordinateTrainer.timeControl` (default `thirtySeconds`, `untimed` in kid mode), `coordinateTrainer.showCoordinates`, `coordinateTrainer.showCoordsOnAllSquares`, `coordinateTrainer.showPieces`, `coordinateTrainer.coordinateInputMethod` (default `text` if width ≥ 980 else `buttons`); only the **last 20 scores** per mode/colour are kept and charted as a sparkline; logged-in scores are POSTed to `/training/coordinate/score` (`mode`, `color`, `score`) (same file, plus <https://raw.githubusercontent.com/lichess-org/lila/master/ui/coordinateTrainer/src/side.ts>).
- `[V]` Keyboard input normalisation: 1 char must be `a-h`; 2 chars must equal the target else `handleWrong()`; input like `"ab"` collapses to `"b"` (ctrl.ts). Voice input maps rank words `one…eight` and the keywords `start` / `stop`.
- `[V]` **Puzzle rating** is **Glicko-2**, not Elo — <https://raw.githubusercontent.com/lichess-org/lila/master/modules/puzzle/src/main/PuzzleFinisher.scala>: solve = a game where the player is white and the puzzle is black; `calculator.computeGame(Game(players, Outcome(white = win)))`.
  - The computed rating is then **averaged with the previous one by a per-theme weight** (`ponder`): `mix/other → 1`; obvious themes (en passant, attacking f2/f7, double check, mate in 1, castling, all mates) → `0.1` on win / `0.4` on loss; hinting themes → `0.2` / `0.7`; non-hinting themes (opening, middlegame, *-endgame, master, superGM) → `0.7` / `0.8`.
  - Provisional puzzles subtract `0.2` (win) / `0.7` (loss); weights are floored at `0.1`.
  - The **puzzle's own rating** updates with the same weight only when the solver is not "clueless"/dubious, is capped to `±lila.rating.Glicko.maxRatingDelta` per game and must pass `sanityCheck`; puzzle-rating writes are rate-limited to 300/day.
  - Replayed/again-solved puzzles: `prevRound => prev.updateWithWin(win)` (no rating change) — replay rounds never re-rate.

---

## 6. Actionable defaults for AuroraChess

Copy-paste values, all `[V]` unless marked.

**Win-chance / eval pipeline**
- `winChances(cp) = 2 / (1 + Math.exp(-0.00368208 * cp)) - 1`, clamp `cp` to `±1000` first. `winPercent = 50 + 50 * winChances` → `0..100`.
- Mate: `cp = sign(mate) * (21 - min(10, |mate|)) * 100` before feeding the sigmoid; display as `#N`.
- Reject "wrong" move suggestions with `povDiff < 0.14`; flag ambiguity when `povChances(secondBest) >= 0.3524`.
- Eval number: `round(cp/10)/10`, clamp `±99`, one decimal, `+` prefix for positive.
- Eval bar: white height = `(winChances(povWhite) + 1) * 50` %.
- Accuracy: `after >= before ? 100 : clamp(103.1668100711649*exp(-0.04354415386753951*(before-after)) - 3.166924740191411 + 1, 0, 100)`; game accuracy = mean of volatility-weighted mean and harmonic mean.

**Move classification (win-chance deltas, not centipawns)**
| Judgement | Δ win% (mover POV, negative = worse) | Glyph |
|---|---|---|
| Inaccuracy | ≥ 0.10 | `?!` |
| Mistake | ≥ 0.20 | `?` |
| Blunder | ≥ 0.30 | `??` |
| Mate created, prev pov cp < −999 / < −700 / else | Inaccuracy / Mistake / Blunder | as above |
| Mate lost, new pov cp > 999 / > 700 / else | Inaccuracy / Mistake / Blunder | as above |
Colours: inaccuracy `hsl(202 78% 62%)`, mistake `hsl(41 100% 45%)`, blunder `hsl(0 69% 60%)`, good `hsl(88 62% 37%)`, brilliant `hsl(129 71% 45%)`.

**Engine strength per band (browser SF/zerofish — the lichess-style recipe)**
`[V]` the *mechanism* (fields, formulas, defaults `stdev = 80`, `gain = 0.06`, `threshold = 80`, `decay^i` weighted pick, capture short-circuit, threefold avoidance) is from bot.ts/filter.ts.
`[I]` the *per-band numbers below are our recommended starting values*, not read from lichess — lichess ships actual bot definitions as JSON served from `/bots`, which is not in the repo tree. Tune by playing games, not by trusting this table.

| Band | Search budget | Selection filter |
|---|---|---|
| Very weak (<1000) | fish `depth 10`, MultiPV 1; or zerofish `nodes` small | `cplTarget` 250–400, `cplStdev` 80, `moveDecay` 0.3–0.5 |
| Weak (1000–1400) | `depth 10`, MultiPV 1 | `cplTarget` 150–250, `cplStdev` 80, `moveDecay` 0.6 |
| Intermediate (1400–1800) | `depth 12`, MultiPV 1 | `cplTarget` 90–150, `moveDecay` 0.8 |
| Strong (1800–2200) | `depth 16`, MultiPV 1 | `cplTarget` 50–90, `moveDecay` 0.9 |
| Full strength | `depth` unlimited / movetime | none (or MultiPV-weighted quality decay 1.0 = always best) |
Selection algorithm: score candidates → sort by summed weights → weighted-random pick with `P_i = decay^i`; **always take a capture of the opponent's last-moved square** and move in `movetime/2`; filter out moves that repeat a position for the 3rd time.
Thinking time: `movetime = clamp(first + (peak-first)*sin(π·turn/peakTurn/2)², …)` per the keyframe table in §1.3; untimed ⇒ **2 s**, ply < 2 ⇒ **0**; CPL weight `1/(1+e^{0.06·(|cpl−cplTarget|−80)})`; `cplTarget = |mean + 80·N(0,1)|`.
Analysis engine resources: MultiPV 1 default, movetime 8000 ms default, Hash min 16, threads `hardwareConcurrency − (even ? 1 : 0)`, UI throttle 125 ms, stop deepening at depth 245.

**Board hex values a developer can copy directly**
- Light square (lichess "brown" coord colour, verified): **`#f0d9b5`**; its verified dark partner in lila is only the coord colour **`#946f51`**. `[I]` `#b58863` (the usual dark square) is baked into lila's PNG texture, not present as a hex in source — safe to use, but note it is inferred.
- Alternatives straight from source: green `#ffd`/`#6d8753`, wood `#d8a45b`/`#9b4d0f`, blue `#dee3e6`/`#788a94`, grey `#b8b8b8`/`#7d7d7d`.
- Promotion picker: `background:#b0b0b0`, `box-shadow: inset 0 0 25px 3px #808080`, hover `inset 0 0 48px 8px <accent>`, circle → square radius, piece `scale(0.8)` → `1`.
- Board interaction defaults worth copying verbatim: animation **200 ms** (auto-off below 70 ms), `highlight.lastMove` and `highlight.check` on, drag **and** click-click both enabled (`draggable.distance 3`, `autoDistance`, `showGhost`), premoves on with `castle`, `rookCastle: true`, `autoCastle: true`, tap-tap default on touch, `touchIgnoreRadius 1`.
- Highlight CSS: legal-move dot `radial-gradient(rgb(20 85 30 / .5) 19%, transparent 20%)`; capture ring `…transparent 79%, rgb(20 85 0 / .3) 80%`; last move `rgb(155 199 0 / .41)` (`rgb(0 155 199 / .41)` on green boards); check `radial-gradient(ellipse at center, #ff0000 0%, #e70000 25%, transparent 89%)`; selected `rgb(20 85 30 / .5)`; premove `rgb(20 30 85 / .5)`; shape layer opacity 0.6; fading piece 0.5, ghost 0.3.
- Annotation brushes: green `#15781B`, red `#882020`, blue `#003088`, yellow `#e68f00` (opacity 1, width 10); pale variants opacity 0.4 width 15 (`#003088`, `#15781B`, `#882020`, `#4a4a4a`@0.35); purple `#68217a`, pink `#ee2080`. Modifier → brush: right-drag green, ⇧/ctrl+right red, alt+right blue, ⇧+alt+right yellow; drag to the same square = circle; same endpoints + different colour replaces the shape.
- Shell palette: `--c-bg: hsl(37 7% 14%)`, `--c-bg-page: hsl(37 10% 8%)`, `--c-primary: hsl(209 79% 56%)`, `--c-secondary/--c-good: hsl(88 62% 37%)`, `--c-bad: hsl(0 60% 50%)`, `--c-accent: hsl(22 100% 42%)`.
- Pieces: one SVG per role/colour (12 files), referenced as CSS custom properties `---white-pawn … ---black-king` on `<piece class="pawn white">`; board = one background image per theme on `cg-board::before`, coordinates coloured by `---cg-ccw`/`---cg-ccb`; piece box `12.5% × 12.5%`.

**Openings & drills**
- Opening index: `Map<epdFen, {eco, name, uci, pgn}>`; search right-to-left over the game, max 40 plies, stop below 20 pieces, return the deepest hit; display `"<ECO> <Name>"`.
- Opening source: `lichess-org/chess-openings` TSVs, columns `eco, name, pgn`.
- Learn: 50 pts per apple/capture, level bonus 500/300/100 by lateness (`late ≤ 0 / ≤ max(1, nbMoves/8) / else`), 1★ at max, 2★ within 200; stage 2★ within `max(200, levels·150)`; persist best score per level under one key (`learn.progress`).
- Coordinate drill: 30 s, tick 50 ms, start after 1 s, count correct answers, avoid repeating the previous file or rank (one of the two at random), keep last 20 scores.
- Puzzle rating: Glicko-2, then blend with a theme weight (obvious 0.1/0.4, hinting 0.2/0.7, quiet 0.7/0.8, mix 1.0), cap puzzle delta per game, don't re-rate replays.
