G3 CHANGES REQUESTED

Independent adversarial review of Plan.md for mission responsive-ui-20260724.
Upstream contract: `.hermes/reports/responsive-ui-20260724/00-intake.md`.
Product code inspected under `apps/dialectical-engine/web` (read-only). H2 / Hermes review outputs were not read.

---

## Findings

### 1. [blocker] S1 CSS partition silently breaks existing `readFileSync("app/globals.css")` consumers

**Evidence**
- Plan.md:150–153 claims S1 is a “pure move” that carves `globals.css` into `@import`-ed section files so S3–S7 can parallelize, with mitigation Plan.md:167 “byte-diff check (concatenated output equals original minus the listed fixes)”.
- Product tests already parse the monofile with Node `readFileSync` (no `@import` resolution):
  - `components/DebateCanvas.responsive.test.mjs:6` — `readFileSync(..., "app", "globals.css")` then `blockFor(selector)` regex on the raw file body.
  - `app/debate/headerToolbarResilience.source-test.mjs:6,22-45` — asserts `.debateTopBar` / `.debateTopActions` / `.topSwitch` rule text inside `globalsSource`.
  - `app/debate/scoringTreePrimary.source-test.mjs:6,32-40` — asserts `.scoringInsightsBody` / `.debateMain` inside `globalsSource`.
  - `lib/scoreBandTokens.test.mjs:6` — token/color extraction from the same path.
  - `components/RecommendedInvestigations.source-test.mjs:8,53,66-74` — grid/summary rules from `app/globals.css`.
- After a hub-only `globals.css` of `@import` lines, every such test fails: the rules move to `styles/*.css` and `readFileSync` does not expand imports.

**Exact modification required**
In S1 (and Risk 1), replace “pure move + byte-diff” with an explicit consumer contract:
1. Inventory every `*.mjs` that reads `app/globals.css`.
2. Ship a single shared loader (e.g. `tests/loadCss.mjs`) that concatenates the hub + every `@import` target in order (or keeps a build-time concat fixture).
3. Migrate those tests in **S1** (or a hard dependency ticket before any partition lands).
4. State that the permanent on-disk `globals.css` need **not** remain a superset of all rules for tests — only the loader must.

Without this, S1 is a greenfield refactor that fails the repo’s existing node:test suite on day one.

---

### 2. [blocker] S1 is not a pure relocation — behavior changes are co-mingled with the partition, and the stated mitigation is self-contradictory

**Evidence**
- Plan.md:150–153: “pure move, no rule changes” / “pure relocation + the listed fixes only”.
- Same slice (Plan.md:153) also ships: explicit `viewport` export, `100dvh`, `text-size-adjust`, drawer-width fixes, canonical breakpoints, fluid type tokens.
- Risk 1 (Plan.md:167) still sells “pure-move refactor” and “concatenated output equals original **minus the listed fixes**” — i.e. the byte-diff is not pure, and reviewers cannot tell which delta is partition noise vs intentional behavior.
- Product baseline: `.appShell { min-height: 100vh }` at `app/globals.css:187`; `.debateView { height: 100vh; … padding-bottom: 58px }` at `:989-997`; drawer `width: 100vw` at `:2590-2592` under `@media (max-width: 640px)`.

**Exact modification required**
Split S1 into two serial contracts (or two slices):
- **S1a — Partition only**: move rules with zero selector/value changes; byte-identical concat; update CSS-reading tests (Finding 1).
- **S1b — Foundation tokens**: `viewport` export, `100dvh`/`100vh` fallback, `text-size-adjust`, drawer `100%`, breakpoint token table, fluid type — each with named acceptance checks.
Do not call a mixed slice a pure move.

---

### 3. [major] Pinch design overclaims evergreen support; `touch-action: pan-x pan-y` + Pointer Events is not a guaranteed iOS Safari path

**Evidence**
- Plan.md:97: “Pointer Events + `touch-action` are fully supported across the floor.”
- Plan.md:97 mechanism: `touch-action: pan-x pan-y` on `.canvas` so two-finger pinch “arrives as Pointer Events”; Plan.md:100 then calls pinch progressive enhancement.
- Product: `.canvas { overflow: auto; … }` at `globals.css:1267-1275`; zero gesture handlers today (grep of `onTouch|onPointer|onWheel|PointerEvent|TouchEvent|touch-action` under `web/` returns no product hits). Measurement loop uses `offsetHeight` only (`DebateCanvas.tsx:101`) — transform scale is fine for layout, but does not validate gesture delivery.
- Contradiction: Plan.md:169–170 correctly flags Playwright WebKit ≠ real iOS Safari and “per-browser edge cases (pointer capture during scroll)”, yet b.2 still asserts floor-wide PE support.
- Accessibility tension: Plan.md:65–66 / :181 forbid `user-scalable=no`, so **page** pinch-zoom remains enabled. On many iOS Safari builds, multi-touch over a scrollable region still participates in browser zoom / does not reliably deliver a second concurrent PointerEvent stream the way Chromium does. Android Chrome is closer to the plan’s model; iOS is the weak link.

**Exact modification required**
Rewrite b.2 pinch subsection:
1. Drop “fully supported across the floor.”
2. Acceptance: **buttons (+/−/Fit/100%) are the contract**; pinch is best-effort on Chromium-class browsers; iOS Safari success is evidence-gated in S8, not assumed at design time.
3. Specify a concrete fallback implementation order: (a) Pointer Events two-pointer tracker; (b) if multi-pointer count never exceeds 1 on a UA, do not ship a broken half-gesture; optional (c) non-passive `touchmove` distance tracker only if PE fails — with explicit conflict analysis vs native page zoom.
4. Keep `ctrl+wheel` (non-passive, `ctrlKey` only) as the desktop trackpad path — that part is sound.
5. Document collision policy: app zoom must not set `touch-action: none` on the whole debate shell (would break scroll and fight WCAG zoom).

---

### 4. [major] `env(safe-area-inset-*)` plan without `viewport-fit=cover` is a no-op on notched iPhones

**Evidence**
- Plan.md:85 viewport export: `{ width: "device-width", initialScale: 1 }` only — no `viewportFit: "cover"`.
- Plan.md:117 / S7: drawers/toast/tokenDock get `env(safe-area-inset-bottom)` (and related).
- Product: zero `safe-area` / `env(` usage today (`globals.css` / layout); `layout.tsx:27-30` exports only `metadata`, no `viewport`.
- On iOS Safari, `env(safe-area-inset-*)` stays **0** unless the viewport is `viewport-fit=cover`. Fixed chrome (`.tokenDock` `position: fixed; bottom: 18px` at `globals.css:2540-2547`; drawers `position: fixed` at `:1791-1811`; toast rules at `:2633-2639`) will still sit under the home indicator after S7 “safe-area” CSS alone.

**Exact modification required**
In b.1 / S1 viewport export, set Next.js `viewport` to include `viewportFit: "cover"` (and keep no `maximumScale` / no `userScalable: false`). Pair every `env(safe-area-inset-*)` rule with a short note that it depends on that export. Add a Playwright/WebKit (or agent-browser) check that computed `padding-bottom` on `.tokenDock` / debate chrome includes a non-zero inset under a notched device profile **or** document residual if the runner cannot emulate notches.

---

### 5. [major] Plan misstates “zero test infrastructure” and ignores hard conflicts with existing node:test contracts (especially S3 chrome)

**Evidence**
- Plan.md:135: “Current state: **zero test infrastructure in `web/`** (`web/package.json` has no test deps, no Playwright/vitest/jest configs…)”.
- True: `web/package.json:5-21` has only `dev`/`build`/`start`/`lint` and no vitest/playwright deps.
- False as a strategy premise: `web/` already has **40+** `node:test` files (`*.source-test.mjs`, `*.test.mjs`), including layout/resilience contracts that S3 will rewrite:
  - `headerToolbarResilience.source-test.mjs:8-18` requires Scoring + Thread/Split/Tree/Map **in the same** `debateTopActions` cluster inside one `<header>` — Plan.md:87 moves secondary actions into a “⋯” overflow at ≤640 and relocates scoring status text off the top bar.
  - `DebateCanvas.responsive.test.mjs` already asserts wrap behavior for score badges.
  - Many tests read `DebatePageClient.tsx` structure (S3 exclusive file).
- S2 (Plan.md:154) only bootstraps vitest + Playwright; it never says “preserve and green the existing node:test suite after each slice.”

**Exact modification required**
1. Correct d) to: “No vitest/Playwright harness; **existing node:test source-tests are the regression floor** and remain runnable via `node --test`.”
2. S2 must add scripts that run **both** legacy node:test and new vitest/Playwright, and fail the slice if either is red.
3. S3 contract must include updating `headerToolbarResilience.source-test.mjs` (and any sibling) to the new two-row / overflow DOM — with RED-first rewrite of the structural assertions, not hope they still pass.

---

### 6. [major] S3–S7 “file-disjoint” claim under-sells shared layout surfaces (tokenDock vs zoom chrome; synthesis capability)

**Evidence**
- Plan.md:162: “S3–S7 are file-disjoint (given S1's partition) except `DebatePageClient.tsx`, which only S3 may edit.”
- Zoom controls: Plan.md:96 floating cluster **bottom-right** of the canvas, “above the token dock.”
- Product token dock: fixed **right: 18px; bottom: 18px** (`globals.css:2540-2547`), mounted in `DebatePageClient.tsx:1273-1301` (comment incorrectly says “bottom-left”). S4 owns `styles/canvas.css`; S7 owns `styles/overlays.css` + safe-area on the same corner — parallel slices can both “pass” while controls overlap ≥44px targets.
- Synthesis: currently always mounted in `DebatePageClient.tsx:1178-1192` as sibling of the main stage; CSS hides it at ≤920 (`globals.css:2568-2571` `.synthPanel { display: none }`). S5 (Plan.md:157) must restore mobile verdict via bottom sheet. A pure CSS sheet **inside** `SynthesisPanel.tsx` can avoid `DebatePageClient` edits, but Plan never locks that constraint; any open-state lift, portal, or “Synthesis” entry in the overflow menu immediately collides with S3’s exclusive `DebatePageClient` ownership and capability-parity invariant Plan.md:129.

**Exact modification required**
1. Publish a shared **chrome collision map** (owned by S1 or a tiny S0): reserved rectangles for set-aside toggle (top-left), zoom cluster, tokenDock, toast — with CSS variables (`--zoom-controls-offset-bottom`, etc.) defined once in `styles/base.css`.
2. S4 and S7 both consume those variables; neither invents independent `bottom/right` magic numbers.
3. Explicitly state: S5 synthesis sheet is implemented **only** inside `SynthesisPanel` + `styles/synth.css` (CSS + internal state), OR grant S5 a narrow, listed `DebatePageClient` edit surface (mount point / overflow entry) and drop “only S3 may edit.”

---

### 7. [major] Canvas fit-width is first-layout-only; orientation / resize / split-view width changes will leave wrong zoom

**Evidence**
- Plan.md:99: “on first layout, if `canvas.clientWidth < layout.width` and viewport ≤768, set `zoom = clamp(...)`.”
- No re-fit on `resize`, `orientationchange`, or visualViewport changes; no “user has manually zoomed” flag to avoid fighting the user.
- Intake (00-intake.md:16-18) and Plan support floor (Plan.md:7) include phones and tablets where rotation and multitasking resize are normal.
- Tree layout is huge (`CARD_W = 320`, `COL = 404` in `lib/debatePresentation.ts:122-126`); a depth-3 canvas is ~1620px — fit math is the product feature, not a nicety.

**Exact modification required**
In b.2 / S4:
1. Define policy: auto-fit runs on first layout **and** when `canvas.clientWidth` changes by more than a threshold **while** `zoom` is still at an auto-managed value.
2. Any manual ±/pinch/Fit/100% marks zoom as user-owned until Fit is pressed again.
3. Unit-test the policy function in `lib/canvasViewport.ts`.

---

### 8. [major] `100dvh` swap does not fix the debate shell layout model; fixed `padding-bottom: 58px` remains a trap with dynamic toolbars + safe areas

**Evidence**
- Plan.md:83: “Viewport units: `100vh` → `100dvh` (with `100vh` fallback…)”.
- Product `.debateView` is `height: 100vh; overflow: hidden; padding-bottom: 58px` (`globals.css:989-997`) — absolute viewport height, not `flex: 1; min-height: 0` inside a column shell.
- On debate routes `TopBar` returns null (`components/TopBar.tsx:30-31`), so full-viewport height is intentional, but:
  - `padding-bottom: 58px` is a hard-coded dock clearance, not `max(58px, env(safe-area-inset-bottom) + dockHeight)`.
  - iOS dynamic URL bar still interacts badly with **nested** scrollers (`.canvas { overflow: auto }`) inside a fixed `100dvh` + `overflow: hidden` parent; plan does not call out `min-height: 100dvh` vs `height: 100dvh` or `visualViewport` resize for the shell.
- S7 safe-area on the dock does not automatically grow `.debateView` padding.

**Exact modification required**
Specify shell layout as: `.debateView { min-height: 100dvh; height: 100dvh; display: flex; flex-direction: column; }` with **main stage `flex: 1; min-height: 0`** (already partly true for `.debateMain` at `:1257-1261`) and **padding-bottom: calc(var(--token-dock-clearance) + env(safe-area-inset-bottom, 0px))`** defined once. Do not treat “replace vh with dvh” as sufficient mobile chrome work.

---

### 9. [major] Flex-squeeze diagnosis is largely correct, but residual one-word / mid-word break causes are under-specified for acceptance

**Evidence**
- Plan root-cause chain (Plan.md:23-34) matches product:
  - `.debateCard` row flex + `.debateCardClaim { overflow-wrap: anywhere }` (`globals.css:641-668`; structure `app/page.tsx:51-86`).
  - `.pill { white-space: nowrap }` (`globals.css:400-415`).
  - Thread lanes `flex: 0 0 30px` twice per depth (`:2694-2710`) + `.threadClaim { overflow-wrap: anywhere }` (`:2750-2757`).
  - Split meter `flex: 0 0 130px` twice (`:2943-2945`).
  - Settings `.modelName { flex: 0 0 130px }` + table `overflow: hidden` (`:842-871`).
- Plan conclusion (Plan.md:34): keep `overflow-wrap: anywhere`; fix squeeze only.
- Gaps:
  1. Card wrap is only specified at ≤640 (Plan.md:80); the 641–920 band can still squeeze claims + nowrap pill + modelStack.
  2. No acceptance metric for “not Japanese columns” (e.g. at 320/375, claim text line boxes must average ≥ N ch / no mid-word break for ordinary Latin tokens under typical topics).
  3. Long unbreakable tokens (URLs, model IDs) will still mid-break via `anywhere` — fine as safety, but should be called residual, not “cured.”
  4. Viewport meta is correctly non-causal (`layout.tsx:27-30`); good.

**Exact modification required**
In a.2/b.1 and S6 acceptance:
1. Extend debate-card wrap/stack rules through **≤768** (or prove 641–920 has ≥12ch claim column under worst pill+stack).
2. Add a Playwright assert beyond `scrollWidth <= innerWidth`: e.g. for a fixture topic of normal English words, no element matching `.debateCardClaim` / `.threadClaim` has a client width &lt; 12ch while containing a space-separated word longer than that width (mid-word break detector), **or** computed style does not produce single-glyph columns for the fixture string.
3. Explicit residual: `overflow-wrap: anywhere` may still break pathologically long tokens — out of scope to remove.

---

### 10. [major] Test strategy: vitest+Playwright bootstrap cost and screenshot-golden role are only half-honest; RED-first for CSS is oversold outside pure functions

**Evidence**
- Plan.md:137-145: RED-first for pure math (good), component PE tests (optimistic for gestures), Playwright layout asserts written before CSS fix (good where geometry is measurable), screenshots “only GREEN” (good honesty).
- Gaps:
  1. No estimate that Playwright browser download + WebKit on Windows is a real S2 schedule risk for the Codex lane.
  2. Matrix Plan.md:142 (3 browsers × 6 widths × device profiles) as written is an S8 cost bomb if every parallel slice must stay green on full matrix; slices need a **smoke subset** vs S8 full matrix.
  3. “Pinch handler updates zoom given synthetic PointerEvents” (Plan.md:140) unit-tests the handler math, **not** that iOS delivers those events (Finding 3) — risk of false confidence.
  4. Existing node:test suite (Finding 5) is the only harness that can fail S1/S3 **today** without S2 — unmentioned.

**Exact modification required**
Rewrite d) gates:
- S2: install harness + wire `node --test` + vitest unit + Playwright smoke (chromium × {320, 375, 1440}).
- S3–S7: each owns targeted RED/GREEN tests + must keep `node --test` green; not the full matrix.
- S8: full matrix + agent-browser product-truth.
- Label component PE tests as “handler contract,” not “mobile gesture proof.”

---

### 11. [minor] Responsive mechanism choice (media queries + fluid primitives) is sound vs container queries for this floor

**Evidence**
- Plan.md:73 justification: single container per shifting surface; existing `max-width` queries; Safari 15.4 in floor for `dvh` but container queries need Safari 16+.
- Product: exactly three `@media` blocks (`globals.css:2568`, `:2577`, `:3281`); zero `@container` / `@supports` (inventory verified).
- Evergreen floor from intake (00-intake.md:38-40) matches Plan.md:7.

**Judgment**
No defect. Optional container queries only for dual-mode Synthesis (Plan.md:73) remains appropriately optional. Do not block on CQ adoption.

---

### 12. [minor] CanvasViewport scale + native-scroll pan + focal math are directionally correct; a11y gaps remain

**Evidence**
- Plan.md:94-98: sizer `width/height × zoom`, inner `transform: scale(zoom); transform-origin: 0 0`, pan via existing `.canvas { overflow: auto }`, focal `scroll' = (scroll + p) × zoom'/zoom − p`.
- Product invariant holds: `DebateCanvas.tsx:101` uses `offsetHeight` (untransformed); no `getBoundingClientRect` in the measure loop.
- Controls ≥44px + aria-labels (Plan.md:96); reduced motion (Plan.md:101).

**Residual gaps (require plan text, not a redesign)**
1. Keyboard: buttons-only is minimum; state whether canvas region gets `aria-label` / live region for zoom %.
2. Sticky set-aside (`DebateCanvas.tsx:122-147`) vs zoom cluster: plan says no overlap — pin z-index and sticky containing block when an intermediate scaled ancestor is introduced (sticky inside a transformed ancestor breaks — **CanvasViewport must not put `transform` on an ancestor of the sticky toggle**). Plan.md:91 says wrap `canvasInner`; sticky is currently a **sibling** before `canvasInner` (`DebateCanvas.tsx:122-148`) — preserve that sibling relationship explicitly in S4 so sticky is outside the scaled node.

**Exact modification required**
Add one S4 invariant: set-aside toggle remains **outside** the `transform: scale` node; only `canvasInner` (connectors + cards) scales. Add a unit/DOM test that sticky parent has no transformed ancestor.

---

### 13. [minor] Intake breadth (“any device or browser”) vs binding evergreen floor — mostly honest; a few material gaps

**Evidence**
- Intake 00-intake.md:11-18 V wants “ALL devices… visible no matter what device or browser… nice on any browser.”
- Intake 00-intake.md:38-40 binding design answer narrows to evergreen + mobile 320–4K — Plan.md:7 correctly treats that as binding.
- Silently light / missing relative to that floor (materiality judged):
  | Gap | Materiality |
  |---|---|
  | Print styles | Low — not V’s phone/tree pain |
  | `forced-colors` / Windows HCM | Low–medium a11y; not in floor text |
  | Landscape phones | Medium — width breakpoints help; shell/zoom re-fit (Finding 7) is the real gap |
  | Tablet split-view / Slide Over | Medium — media queries on viewport width handle this if widths are correct; no extra work if Finding 7 done |
  | Pre-evergreen browsers / no `oklch` | Plan.md:57 correctly accepts uncolored legacy — OK |
  | 4K “nice” | Plan.md:173 treats as fluid max-width + zoom-in — subjective but disclosed |

**Exact modification required**
In Non-goals or Risks, one explicit sentence: print and forced-colors are **out of scope** for this mission; landscape/split-view are in scope **via** width-driven breakpoints + re-fit zoom policy (Finding 7), not separate orientation stylesheets. That turns a silent drop into an honest scope line without ballooning the mission.

---

## Verdict rationale

Multiple **blocker** defects (S1 partition vs live CSS-reading tests; S1 pure-move fiction) and several **major** defects (pinch overclaim, safe-area without `viewport-fit`, false “zero tests,” chrome collision / exclusive-file fiction, fit-width once, incomplete shell/`dvh` model, incomplete flex-squeeze acceptance, test matrix realism) mean the plan is not ready for H3 merge / A7 ticketization.

Mechanism choice (media queries), overall slice shape, and flex-squeeze root-cause story are salvageable and often strong — but independence requires **CHANGES REQUESTED**, not PASS.

---

## What would change my verdict

All of the following:

1. S1 split into partition-only vs foundation behavior; CSS `readFileSync` consumers migrated in-partition (Findings 1–2).
2. Pinch language and acceptance demoted to progressive enhancement with buttons as contract (Finding 3).
3. `viewportFit: "cover"` wired with safe-area (Finding 4).
4. Existing node:test suite acknowledged; S3 updates `headerToolbarResilience` (Finding 5).
5. Shared chrome collision variables + explicit SynthesisPanel-only or shared DebatePageClient contract (Finding 6).
6. Fit-width resize/orientation policy (Finding 7).
7. Debate shell padding/safe-area model beyond raw `100dvh` (Finding 8).
8. Flex-squeeze acceptance metrics + ≤768 card wrap clarification (Finding 9).
9. Tiered Playwright smoke vs S8 matrix; honest RED-first boundaries (Finding 10).

Minor findings 11–13 alone would not block PASS once the above are fixed.

---

## Attack-surface coverage checklist

| # | Surface | Treatment |
|---|---|---|
| 1 | Media queries vs CQ + iOS quirks (dvh, 100vh, safe-area, fixed, pinch vs page zoom) | Findings 4, 8, 11; pinch vs page zoom in 3 |
| 2 | CanvasViewport zoom/pan/focal/PE/ctrl+wheel/a11y | Findings 3, 7, 12 |
| 3 | Flex-squeeze vs residual one-word causes | Finding 9 |
| 4 | S3–S7 disjointness + S1 partition safety | Findings 1, 2, 6 |
| 5 | vitest/Playwright cost, goldens, RED-first realism | Findings 5, 10 |
| 6 | Intake gaps vs “any device/browser” | Finding 13 |

---

mission/step: responsive-ui-20260724 / G3  
artifact reviewed: `.hermes/planning/responsive-ui-20260724/Plan.md`  
REWORK ROUND: 0 of 3  
comments read through: not ticketed (pre-board stage)
