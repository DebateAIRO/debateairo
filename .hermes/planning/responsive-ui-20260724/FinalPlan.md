# FinalPlan.md — responsive-ui-20260724

- mission: responsive-ui-20260724
- artifact: C4 consolidated final plan (collapsed C4+G5 hop, part 1), folded from the approved `Plan.md` (H2 PASS + G3 PASS through the planning diamond)
- author: Claude planning worker (sdk-subagent-C4), a fresh session distinct from the C2 author per stage law
- upstream: `.hermes/planning/responsive-ui-20260724/Plan.md`, `.hermes/reports/responsive-ui-20260724/00-intake.md`
- scope: `apps/dialectical-engine/web` (Next.js 15 / React 19 app: `app/`, `components/`, `lib/`, single stylesheet `app/globals.css`). This is the only frontend in the repo (`apps/` contains only `dialectical-engine`); the Python `coordinator/`, `worker/`, `scripts/` surfaces have no UI and are out of scope.

All file paths are relative to `apps/dialectical-engine/web` unless prefixed otherwise. Every audit claim carries a file:line citation verified against the repo on 2026-07-24.

---

## 1) MISSION AND BINDING V RULINGS

### 1.1 Mission (V, verbatim intent)

> For now, our app does not have so much in terms of responsiveness. On phones, text is overly wrapped and instead of phrases, we have columns that resemble japanese more than english. Also, a phone user cannot use the tree well, due to how small the screen is, and a Zoom in/out that is application native would help mobile phone users see the debate tree better. Start the process that implements this responsiveness on ALL devices, and ALL screens. The app should be visible no matter what device or browser we use. So also make it nice on any browser.

V also requires a final report to V on completion.

### 1.2 Binding rulings

1. **Hard-pinch ruling (V, 2026-07-24, via ARCH→REQ return; an earlier contrary answer is VOID as a recorded misclick): "Pinch is a hard requirement."** Two-finger pinch-zoom on the debate tree MUST WORK on iOS Safari, Android Chrome, and desktop trackpads as a **mission completion condition**. No residual, waiver, or per-UA disable path exists for pinch anywhere in this plan; a floor browser where pinch cannot be delivered is a mission BLOCKER escalated to V. §3.2 and §5.5 are designed to that ruling.
2. **Zoom buttons and ctrl+wheel are also required — necessary but NOT sufficient.** They are the no-gesture/assistive path on every device and never a substitute for pinch (§3.2).
3. **Support floor (binding, from intake): evergreen + mobile** — latest Chrome, Edge, Firefox, Safari on desktop; iOS Safari + Android Chrome on mobile; screens 320px phones up to 4K. No dead browsers.
4. **Kanban custody (V standing ruling, this mission):** Hermes owns the Hermes Kanban, creates the Kanban tickets, and manages the board via its own heartbeat protocol. Per-ticket `risk_tier` is Hermes's write at H6; this plan's slice risk tiers (§6) are suggestions only.

---

## 2) CURRENT-STATE AUDIT

### 2.1 Global responsive posture

- **Stylesheet**: one 3,295-line file, `app/globals.css`. It contains exactly **three** `@media` blocks — `(max-width: 920px)` at `globals.css:2568`, `(max-width: 640px)` at `:2577`, `(max-width: 760px)` at `:3281` — and **zero** `@container` or `@supports` rules (grep-verified). Outside those blocks, sizing is predominantly absolute px; a handful of fluid expressions already exist (`min(52vw, 680px)` `:1052-1054`, `clamp(88px, 12vw, 180px)` `:1075`, `min(36vh, 360px)` `:1143`, `calc(100vw - 36px)` `:2546`, `minmax()` grids `:450,1977`), but none of them form a system — they are point fixes around the scoring toolbar and token dock.
- **Viewport meta**: `app/layout.tsx:27-30` exports `metadata` with no `viewport` export and no manual meta tag. Next.js App Router injects its default `width=device-width, initial-scale=1`, so the viewport itself is *not* the over-wrap root cause; the layout is. Two consequences: the export must become explicit so the default can't regress, and it must add `viewportFit: "cover"` because **`env(safe-area-inset-*)` evaluates to 0 on iOS unless the viewport is cover** — today the codebase has zero `env(`/`safe-area` usage (grep-verified), so all fixed chrome (`.tokenDock` `globals.css:2540-2547`, drawers `:1791-1811`, toast `:2633-2639`) can sit under the home indicator.
- **Viewport units & shell model**: `.appShell { min-height: 100vh }` (`globals.css:187`) and `.debateView { height: 100vh; overflow: hidden; padding-bottom: 58px }` (`globals.css:989-997`). On iOS Safari / Android Chrome the dynamic URL bar makes `100vh` taller than the visible viewport. The `58px` padding-bottom is a hard-coded clearance for the token dock (mounted at `DebatePageClient.tsx:1273-1301`; the code comment says "bottom-left" but the CSS pins it `right: 18px; bottom: 18px` — `globals.css:2540-2547`), not a safe-area model. A bare vh→dvh swap is **not** sufficient: the shell needs an explicit flex-column model with a variable-driven clearance (§3.1).
- **Type scale**: font sizes are absolute px (e.g. `.display.lg { font-size: 34px }` `globals.css:539-541`); no `clamp()`/`rem` type scale. At 320px, 34px display headings wrap awkwardly; at 4K content max-widths (680/880/1040px, `globals.css:521-529`, `:2807`) leave a narrow ribbon with no larger tier.

### 2.2 Why phone text wraps into "Japanese-looking" columns (root causes with evidence)

The symptom V describes — one-to-few characters per line — is produced by **fixed-width flex siblings squeezing a `flex: 1; min-width: 0` text column, combined with `overflow-wrap: anywhere` which then breaks words mid-character** instead of overflowing. Verified instances:

1. **Library debate cards** (`app/page.tsx:51-86`): `.debateCard` is a one-row flex with `gap: 18px` (`globals.css:641-651`) containing text body + `.modelStack` + status `.pill` (`white-space: nowrap`, `globals.css:400-415`) + arrow. At 320px, `.screenInner` padding `52px 28px` (`globals.css:517-519`) leaves 264px; after card padding (2×19px), three gaps (54px), dots (~40px), pill (~70px) and arrow, `.debateCardClaim` gets ≈45–60px. With `overflow-wrap: anywhere` (`globals.css:660-668`) a 16.5px serif claim renders ~3–4 characters per line — the exact "Japanese column" effect. The squeeze persists (less severely) through the 641–920px band, so the fix covers it too (§3.1).
2. **Debate top bar** (`app/debate/[id]/DebatePageClient.tsx:962-1030`): a single 60px-high non-wrapping flex row (`globals.css:999-1010`) holding brand, back link, title, status pill, scoring switch (`.topSwitch` capped at `min(52vw, 680px)` = 166px at 320px, `globals.css:1048-1054`), a 4-button view segment, Replay, Workspace, Export, ?, ⚙. Total intrinsic width ≈ 900px+. Inside `.debateView { overflow: hidden }`, at phone widths the flex children crush to near-zero and clip — the debate chrome is effectively unusable below ~900px. This exact cluster is pinned by a live source-test (`app/debate/headerToolbarResilience.source-test.mjs:8-47`) that asserts scoring switch + view segment live in the same `.debateTopActions` cluster and asserts specific `.topSwitch`/`.topSwitchStatus` CSS — S3 rewrites that contract RED-first, never breaks it silently (§2.6, §6 S3).
3. **Thread view indentation** (`components/DebateThread.tsx` + `globals.css:2694-2711`): each depth level spends a fixed 30px lane (`.threadLane { flex: 0 0 30px }`). At depth 4 on a 320px phone: 320 − 2×30 (`threadInner` padding, `:2656`) − 120 (lanes) − 32 (card padding) ≈ 108px of text column; `.threadClaim` has `overflow-wrap: anywhere` (`globals.css:2750-2758`) → 1–3 words/line at best, character-columns for long words.
4. **Split view meter** (`globals.css:2936-2951`): `.splitMeterSide { flex: 0 0 130px }` twice + 2×14px gaps = 288px fixed inside ~268px of content width at 320px — the bar collapses to 0 and the row overflows. The 760px media query stacks `.splitColumns` (`globals.css:3281-3295`) but does not touch the meter or `.splitChip` rows.
5. **New-debate options** (`app/new/page.tsx`, `globals.css:757-790`): `.optionRow` is `justify-content: space-between` with a fixed `160px` range input; at 320px the label+hint column gets ≈90px and wraps per-word. Inline fixed width also at `app/new/page.tsx:225` (`style={{ width: step === 1 ? 18 : 44 }}`).
6. **Settings model table** (`app/settings/page.tsx`, `globals.css:848-942`): `.modelRow` packs `modelName` (`flex: 0 0 130px`, `:866`), role chips, spend (`64px`, `:896`), `.capInput` (`90px`, `:901`), switch (`38px`) plus five 16px gaps into one non-wrapping row ≈ 480px intrinsic — clipped by `.modelTable { overflow: hidden }` (`:845`) at phone widths, so controls are cut off, not just wrapped.
7. **Scoring insight strips** (`globals.css:1205-1208`): `.scoringIssueIntro { flex: 0 0 210px }` — partially mitigated at ≤640 (`:2593-2605`), but the 641–920px band keeps the fixed 210px column against squeezed pills.

Conclusion: the fix class is "remove fixed-width flex reservations + allow wrapping at defined breakpoints", **not** removing `overflow-wrap: anywhere` (which stays as a safety net). **Residual, stated honestly:** pathologically long unbroken tokens (URLs, model IDs) will still mid-break via `anywhere` — that is correct behavior and out of scope to "fix". The acceptance metric for the squeeze bug itself is defined in §5.4.

### 2.3 How the debate tree is rendered, and why it is unusable on phones

- The "Tree" view is `components/DebateCanvas.tsx` (selected at `DebatePageClient.tsx:1146-1165`; `view` state defaults to `"tree"` at `:415` on every device).
- Layout is computed in `lib/debatePresentation.ts:120-277`: absolute pixel placement with hard constants `CARD_W = 320`, `COL = 404`, `PADX = 44` (`:122-126`). Canvas width = `408 + 404 × depth` px — a depth-3 tree is ~1,620px, depth-5 ~2,430px. Cards are absolutely positioned (`.nodeWrap { position: absolute }`, `globals.css:1296-1299`) over an SVG connector layer (`DebateCanvas.tsx:148-161`), inside `.canvas { overflow: auto }` (`globals.css:1267-1275`).
- **No zoom or gesture support exists anywhere**: grep for `onTouch|onPointer|onWheel|PointerEvent|TouchEvent|gesture|touch-action` across `app/` and `components/` returns zero product hits. Navigation is native scroll only. On a 320–430px phone the user sees <20% of the tree with no way to shrink it; browser pinch-zoom zooms the whole page (top bar included).
- Card heights are measured post-render via `offsetHeight` and fed back into layout (`DebateCanvas.tsx:95-109`, read at `:101`). `offsetHeight` reports **untransformed** layout size, so a CSS `transform: scale()` wrapper does not disturb this loop — but this invariant must be proven in a **real browser** test (Playwright), not jsdom, because jsdom has no layout engine (§5.3).
- The sticky "Show set-aside paths" toggle (`DebateCanvas.tsx:122-147`) is a **sibling rendered before** `.canvasInner` (`:148`). This matters structurally: `position: sticky` breaks inside a transformed ancestor, so the zoom transform must be applied to `.canvasInner` only, never to a shared ancestor of the toggle (§3.2).
- **Map view** (`components/DebateMap.tsx`) is a scalable SVG sunburst (`viewBox="0 0 600 600" width="100%"`, `:116`) — size-responsive already, but its inspect interaction is hover-only (`onMouseEnter` `:127`, `onMouseLeave` `:115`); on touch, tap both selects and *navigates* (`onClick → onOpenSplit`, `:126`) — no way to inspect without committing.
- Dead code note: `components/DebateTree.tsx`, `components/DebateOutline.tsx`, `components/ArgumentFocusView.tsx` are unreachable from any page (only `ArgumentFocusView.tsx:5` imports from `DebateTree`; nothing imports either). They must not be restyled — but their **source-tests still run** (e.g. `DebateTree.lowStrength.source-test.mjs`, `DebateOutline.scoring.source-test.mjs`) and must stay green (§2.6).

### 2.4 Existing breakpoint behavior (complete inventory)

| Query | Effects | Gap |
|---|---|---|
| `max-width: 920px` (`globals.css:2568-2575`) | hides `.synthPanel` entirely; caps `.debateTopTitle` at 220px | **Synthesis/verdict — the product's payoff — is simply removed on tablets/phones**, with no alternative surface |
| `max-width: 640px` (`:2577-2640`) | stacks composer, single-shot grids, ws columns; drawer → `100vw`; scoring strips stack; toast repositions | top bar, canvas, thread lanes, settings table, split meter untouched |
| `max-width: 760px` (`:3281-3295`) | stacks split columns and perspectives; hides battle line | split meter/chips untouched |

### 2.5 Browser-specific hazards vs the evergreen floor

- **`oklch()` colors everywhere** (`globals.css:6-88` and inline): supported across the floor (Chrome/Edge 111+, Firefox 113+, Safari 15.4+); no fallbacks — pre-evergreen browsers get uncolored UI, accepted per intake floor, stated in the final report.
- **`100vh`** (`:187`, `:992`): iOS/Android dynamic-toolbar bug. Fix is the shell model in §3.1 (not a bare unit swap).
- **Safe-area insets are currently inert**: no `viewport-fit=cover` (§2.1) → `env(safe-area-inset-*)` ≡ 0 on iOS.
- **iOS input auto-zoom**: focused inputs with font-size <16px zoom the page. `.input` is safe at 16px (`:358-369`) but `.fieldGroup input/textarea` 13px (`:811-826`), `.capInput` 12px (`:899-910`), `.tokenInput` 12px (`:2553-2562`), `.segment button` 12px are not.
- **`-webkit-line-clamp` + `display: -webkit-box`** (`:2765-2772`, `:2133-2135`): the prefixed combo is the interoperable form; keep prefixed.
- **`::-webkit-scrollbar`** (`:126-137`): cosmetic non-parity in Firefox; no action.
- **`100vw` drawer at ≤640** (`:2590-2592`): includes scrollbar gutter on Windows → possible 10px overflow; use `width: 100%`.
- **Hover-only affordances**: DebateMap inspect (§2.3); `title` tooltips (`app/page.tsx:73`). Only the Map readout is informational and needs a tap path.
- **Fixed-position popover with no viewport clamping**: `ChallengePopover` places `.popAnchor` at raw coordinates with `transform: translate(-50%, -100%)` (`components/ChallengePopover.tsx:17`, `globals.css:2324-2339`; card fixed 252px `:2330`) — clips off-screen on phones.
- **No `text-size-adjust`** declaration: add `-webkit-text-size-adjust: 100%`.
- **Native page pinch-zoom must stay enabled** (WCAG): never `user-scalable=no` / `maximumScale`. The app-native tree zoom is additive.
- **Multi-touch Pointer-Event delivery on iOS Safari over natively-scrollable regions is NOT reliable** (a second concurrent pointer stream may never arrive once native pan claims the first pointer; `touch-action: pan-x pan-y` arbitration is refuted as a delivery path). Since pinch is a **hard requirement** (V ruling), the design does not depend on that path at all: §3.2 uses canvas-only `touch-action: none` with custom pan, plus WebKit's native GestureEvents (`gesturestart/gesturechange/gestureend`, shipped in Safari since iPhone OS 2) on iOS/macOS Safari.

### 2.6 Existing test infrastructure (the regression floor)

- **43 `node:test` files** exist under `web/` (`*.test.mjs`, `*.source-test.mjs`; full list via `find . \( -name "*.test.mjs" -o -name "*.source-test.mjs" \) -not -path "*/node_modules/*"`). Convention (documented in `docs/superpowers/plans/2026-07-07-phase9-verdict-first-ui.md:15,30`): `node:test` + `node:assert/strict`, regex assertions against **source text** read with `readFileSync`, run ad hoc via `node --test <file>` from `web/`; no npm script wires them; no jest/vitest/playwright anywhere (`web/package.json:5-21` confirmed).
- **5 files read `app/globals.css` directly** and will break under any file partition unless migrated: `app/debate/headerToolbarResilience.source-test.mjs:6`, `app/debate/scoringTreePrimary.source-test.mjs`, `components/DebateCanvas.responsive.test.mjs:6` (regex-extracts `.nodeHeader`/`.scoreBadgeButton` blocks), `components/RecommendedInvestigations.source-test.mjs`, `lib/scoreBandTokens.test.mjs`.
- **18 files regex the `DebatePageClient.tsx` source** (grep-verified: `headerToolbarResilience`, `scoreAwareNavigation`, `scoringTreePrimary`, `scoringTreeUsability`, `cachedScoringDisplay`, `scoringFailureDisplay`, `scoringToggle`, `sseFailureSafety`, `transientSsrRecovery`, `scoringDiagnostics`, `scoringErrorBoundary`, `scoringFeedbackControls`, both `VerdictBanner` tests, `adaptiveDepthDryRun`, `frontendCorrectness`, `recommendation`, `scoringHolesSummary`). Any slice editing `DebatePageClient.tsx` inherits these as its regression floor.
- **Direct S3 conflict**: `headerToolbarResilience.source-test.mjs:8-19` requires scoring switch + Thread/Split/Tree/Map segment in one `.debateTopActions` cluster inside one `<header>`; `:21-47` pins exact `.topSwitch`/`.topSwitchStatus` CSS. The two-row/overflow-menu design **contradicts these assertions by design** — S3 rewrites them RED-first to the new DOM contract (§6 S3).
- **Strategy consequence**: these tests are the only harness that can fail a slice *today*, before any new tooling lands. Every slice keeps `node --test` green as a hard gate; the new vitest/Playwright harness is additive (§5).

---

## 3) TARGET DESIGN

### 3.1 Responsive strategy (320px–4K, all surfaces)

**Mechanism choice: media queries + fluid primitives (flex-wrap, `minmax()`, `clamp()`), not container queries.** Justification: the floor does support `@container` (Chrome 105+, Safari 16+, Firefox 110+), but every layout-shifting component here appears in exactly one container; the codebase already uses `max-width` queries; Safari 15.4 is inside our floor for `dvh` but not for container queries. Container queries remain permitted for exactly one case: SynthesisPanel if rendered docked and as a sheet.

**Canonical breakpoint set** (desktop-first `max-width`, matching existing code): `480`, `640`, `768` (absorbs the stray 760), `920`, `1200`. ≥1600/4K handled fluidly: content max-widths bumped one tier and prose capped at `72ch`.

**Viewport export (S1b)**: `app/layout.tsx` gains
`export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" }` — **`viewportFit: "cover"` is required** or every `env(safe-area-inset-*)` rule in this plan is a no-op on notched iPhones. No `maximumScale`, no `userScalable: false`, ever. Every safe-area CSS rule below carries a comment noting this dependency.

**Debate shell layout model (beyond a unit swap)**:
```css
.debateView {
  min-height: 100vh;            /* fallback */
  min-height: 100dvh;
  height: 100dvh;
  display: flex; flex-direction: column;   /* already true */
  padding-bottom: calc(var(--token-dock-clearance) + env(safe-area-inset-bottom, 0px));
}
```
with `.debateMain` keeping `flex: 1; min-height: 0` (already true, `globals.css:1257-1261`) and `--token-dock-clearance` defined once in the collision-map variables (§3.4) — replacing the magic `padding-bottom: 58px` (`:996`) with the cap-derived clearance `calc(18px + var(--dock-max-h))`. `.appShell` gets the same dvh treatment. Nested scrollers (`.canvas`, `.drawerBody`, etc.) stay internal scroll containers; the shell never scrolls. Known iOS residual: dynamic-toolbar resize jitter with nested scrollers is mitigated by `dvh` + internal scrolling but is explicitly on the S8 real-device checklist.

**Fluid type**: `clamp()` on display/lede/hero sizes only (e.g. `.display.lg: clamp(24px, 5.5vw, 34px)`; `.outlineRoot`, `.threadRootClaim`, `.drawerClaim` similar). Body/label px sizes stay. All focusable form controls get `font-size: 16px` at ≤768 (fixes iOS auto-zoom, §2.5).

**Layout rules (per root cause in §2.2)**:
- `.debateCard` wraps meta/pill row under the claim at **≤768** (not ≤640 — the 641–920 band still squeezes). Acceptance metric in §5.4.
- `.optionRow`, `.modelRow` become stacked (label above control) at ≤640; `.splitMeterSide` → `flex: 0 1 auto; min-width: 64px`; `.scoringIssueIntro` drops the 210px reservation at ≤920.
- `.screenInner` padding `52px 28px` → `32px 16px` at ≤640.
- Thread lanes: `--thread-lane: 30px` → `14px` at ≤480; cap visual indent depth (deeper levels reuse max indent + depth badge) so text keeps ≥60% of viewport width.
- Drawer `100vw` → `100%`; `html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }`.

**Debate chrome (top bar)**: two-row responsive header at ≤920: row 1 = brand (icon-only ≤640) + title (ellipsized, `flex: 1`) + status pill; row 2 = view segment + primary actions, with secondary actions (Workspace, Export, ?, ⚙) in a "⋯" overflow menu at ≤640; scoring status text relocates to the scoring insights strip on phones. All tap targets ≥44×44px. This intentionally rewrites the `headerToolbarResilience` source-test contract (§2.6, §6 S3).

### 3.2 Mobile tree UX — application-native zoom with pan

New presentation component `components/CanvasViewport.tsx` + pure-math module `lib/canvasViewport.ts`, wrapping the existing `.canvasInner` content inside `DebateCanvas`.

**Contract (V ruling — pinch is a hard requirement):**
1. **Two-finger pinch-zoom MUST WORK** on iOS Safari, Android Chrome, and desktop trackpads (macOS Safari trackpad; Windows precision touchpads on Chrome/Edge/Firefox). This is a **mission completion condition** with per-browser hard acceptance gates in §5.5. There is no residual, waiver, or per-UA disable path anywhere in this plan; if a floor browser cannot be made to deliver pinch, the mission is **BLOCKED and escalated to V** with the evidence.
2. **Zoom buttons are also required** (necessary, not sufficient): `+`, `−`, `Fit` (overview), `1:1` and a live `%` readout, floating cluster at the collision-map rectangle (§3.4). Buttons ≥44px, `aria-label`s, keyboard operable — they remain the no-gesture/assistive path on every device.
3. **Desktop trackpad zoom is required**: `ctrl+wheel` (Chromium/Firefox pinch emits it) via a non-passive `wheel` listener, `preventDefault()` only when `ctrlKey`; macOS Safari trackpad pinch via GestureEvents (below).

**Per-platform pinch delivery** (the `touch-action: pan-x pan-y` arbitration approach is refuted and NOT used):
- **Canvas-only `touch-action: none`** on `.canvas`. With native touch handling fully suppressed *on the canvas element only*, gesture delivery is deterministic: no browser arbitration can steal the first pointer before a second arrives. Page-level pinch zoom, scrolling, and all WCAG zoom behavior remain fully available **outside the canvas** (header, drawers, all other routes). `user-scalable`/`maximumScale` restrictions remain forbidden globally.
- **Custom pan (touch)**: single-pointer drag pans via `scrollLeft/scrollTop` deltas (Pointer Events; supported iOS Safari 13+, Android Chrome, all desktop floor browsers). Desktop input is untouched: `touch-action` does not affect mouse wheel or scrollbars, so native wheel scroll, scrollbar drag, and keyboard scrolling keep working. Known tradeoff, stated: touch pan loses native momentum/rubber-banding; inertia is a non-goal polish item.
- **Chromium-class touch (Android Chrome, Win touchscreen Chrome/Edge)**: Pointer-Events two-pointer tracking under `touch-action: none` — the standard, reliable pattern on Chromium.
- **iOS Safari + macOS Safari**: WebKit's native **`gesturestart` / `gesturechange` / `gestureend`** events with `event.scale` (proprietary but shipped and stable since iPhone OS 2; fires for trackpad pinch on macOS Safari too). `preventDefault()` on `gesturestart`/`gesturechange` within the canvas suppresses Safari's page zoom for canvas-originated gestures only. Feature-detect (`"ongesturestart" in window` / `typeof GestureEvent !== "undefined"`); when the GestureEvent path is active, the PE two-pointer path is disabled to prevent double-handling.
  - **Focal-coordinate contract**: `GestureEvent` supplies `scale`/`rotation` only — it has no touch points, so it cannot feed the focal-preservation formula by itself. The centroid comes from **concurrent TouchEvents**: the canvas also registers `touchstart`/`touchmove` (non-passive, below), and while a gesture is active the focal point `p` = midpoint of `event.touches[0..1]` from the latest touch event, converted to canvas-content coordinates. Truthful fallback: if touch coordinates are unavailable in a frame (macOS Safari trackpad pinch emits GestureEvents without TouchEvents), the focal point degrades to the **canvas viewport center** — the designed behavior for trackpads, not a bug.
  - **Event-ownership handover**: `gesturestart` **atomically suspends the PE path** before any zoom mutation — release all pointer captures, clear pan/pinch tracking state, set a single `gestureOwner = "webkit"` flag; while it is set, every PE and tier-3 handler is a no-op, so exactly one path mutates `zoom`/`scrollLeft/Top` per frame (no double mutation). `gestureend` clears the flag and re-arms the PE path from `idle`.
  - **Registration discipline**: React exposes no gesture props and defaults touch listeners to passive, so **React synthetic handlers are explicitly NOT used for any zoom-critical stream**. S4 binds natively on the canvas ref: `canvasEl.addEventListener("gesturestart" | "gesturechange" | "gestureend" | "touchstart" | "touchmove", handler, { passive: false })`, with matching `removeEventListener` cleanup on unmount (the non-passive `wheel` listener follows the same rule). Without `{ passive: false }`, `preventDefault()` is a no-op and iOS page-zooms during canvas pinch — the exact §5.5 hard-gate failure mode.
  - **Handler-contract tests (in addition to real-device proof)**: pan→pinch promotion (2nd pointer while panning); gesture ownership handover (`gesturestart` mid-pan suspends PE exactly once, releases captures, no further PE mutations until `gestureend`); `preventDefault` invoked on cancelable synthetic `gesturestart`/`gesturechange`/`touchmove`; listener registration verified non-passive (assert bound options, or integration-assert `defaultPrevented` on a cancelable synthetic event).
- **Tier-3 fallback (defense in depth, same requirement)**: if a floor browser build delivers neither reliable two-pointer PE nor GestureEvents, a non-passive two-`touchmove` distance tracker (canvas-only, `preventDefault()`) is the third implementation path — under canvas-only `touch-action: none` there is no native-zoom conflict to arbitrate. If all three paths fail on a floor browser: mission BLOCKER, escalate to V (never ship "buttons-only" as satisfaction of the pinch requirement).

**Gesture state machine**: `idle → panning(1 pointer) → pinching(2 pointers) → panning/idle`.
- `pointerdown`: register in a Map by `pointerId`; 1st pointer starts pan; 2nd concurrent pointer enters `pinching` (pan stops; baseline distance + centroid recorded; `setPointerCapture` on both).
- `pointermove` in `pinching`: `zoom' = clampZoom(zoom × d'/d)`; focal-point preservation `scroll' = (scroll + p) × zoom'/zoom − p` (pure, unit-tested) in the same frame. In `panning`: scroll by pointer delta.
- **`pointercancel`/`pointerup` policy**: on any event dropping the pointer count below 2 — exit `pinching`, **commit current zoom** (no snap-back), release captures, fall back to `panning` or `idle`. GestureEvent path lifecycle: `gesturestart` records base zoom → `gesturechange` applies `clampZoom(base × e.scale)` with focal preservation → `gestureend` commits. Both paths share `setZoom`/focal math.

**Pointer-intent matrix** — custom pan must never swallow the canvas's existing interactions (`onClick={openIfDone}` on cards `DebateCanvas.tsx:262-281`, control buttons `:387-420`, sticky checkbox `:122-147`):

| Pointer event | Intent resolution |
|---|---|
| `pointerdown` on an interactive target (`closest()` hit-test against the sticky set-aside toggle/label, the zoom cluster, and card controls: `.nodeCtrl`, `.scoreBadgeButton`, `input`, `button`, `a`) | pan is **never initiated**; normal event flow proceeds — this keeps the sticky toggle tappable inside the `touch-action: none` canvas (taps still synthesize clicks; only pan initiation is excluded) |
| `pointerdown` elsewhere, movement < **8px** (drag threshold), then `pointerup` | a **tap**: outside overview, existing card/control `click` behavior fires exactly as today; in `data-zoom-band="overview"`, tap on a card = **focal-preserving zoom-to-card at 1.0** (first activation zooms; it does not open) |
| movement ≥ 8px | **pan**; a `didPan` guard suppresses the subsequent synthesized `click` (capture-phase `click` listener checks the guard), so a drag never opens a drawer or fires a control |
| 2nd concurrent pointer at any time during `panning` | promotion to `pinching` (pan stops; no click will fire) |

**Controls parity in overview (never removal)**: below `READABLE_ZOOM`, card actions (open/challenge/regenerate/expand) are **deferred, not removed** — the first tap zooms to the card at 1.0 (≥ `READABLE_ZOOM`), where the full control set is active again; capability-parity invariant §4.4 is satisfied via this two-step path. Tests: unit/handler-contract for the threshold and `didPan` suppression state machine; Playwright smoke: "drag pans without opening drawer" and "overview tap zooms, then open works at 1.0".

**Rendering**: outer *sizer* div `width/height = layout.width/height × zoom`; inner div `transform: scale(zoom); transform-origin: 0 0` containing the SVG connector layer + cards unchanged. Pan writes to the native scroll position of `.canvas { overflow: auto }` — scroll geometry stays the single source of truth for both native (desktop) and custom (touch) pan.

**Structural invariant**: the sticky set-aside toggle stays a **sibling before** the sizer (as today, `DebateCanvas.tsx:122-148`); only `.canvasInner` content is inside the transform (sticky breaks inside transformed ancestors). Z-order pinned via collision-map variables. A DOM test asserts the toggle has no transformed ancestor.

**Measurement invariant**: the `offsetHeight` measure loop (`DebateCanvas.tsx:95-109`) reads untransformed layout size, so scaling cannot corrupt layout — proven by a **Playwright** assertion (card `offsetHeight` constant across zoom levels while `getBoundingClientRect().height` scales), NOT a jsdom unit test (jsdom has no layout engine). A lint-grade source assertion additionally pins that the measure loop never switches to `getBoundingClientRect`.

**Zoom bounds and truthful fit policy** — all in `lib/canvasViewport.ts`, unit-tested:
- **Global bounds**: `ZOOM_MIN = 0.1`, `ZOOM_MAX = 2.0`; every path (buttons, pinch, wheel, fit) clamps to them. `READABLE_ZOOM = 0.5` is the defined readability floor.
- **Overview fit (the `Fit` button)**: `fitZoom = clamp(availableWidth / layout.width, ZOOM_MIN, 1)` — the **computed** fit, deliberately allowed below the readability floor. Honest arithmetic: depth-3 = 1,620px → 0.198 at 320px; depth-5 = 2,428px → 0.132; the full tree width fits within ZOOM_MIN down to depth 6 (2,832px → 0.113) at 320px; deeper trees clamp at 0.1 and the remainder pans. **Readability treatment**: overview is an orientation/navigation mode, not a reading mode — below `READABLE_ZOOM` the viewport sets `data-zoom-band="overview"` and cards render simplified (role-colored blocks + connectors remain), and **tapping/clicking a card zooms to it at 1.0 with focal preservation** (zoom-to-card; intent matrix above). The button's accessible name is "Fit whole tree (overview)".
- **Overview layout stability — pinned mechanism: layout-stable hiding.** Overview simplification must not change any card's used layout size, because the live measure loop (`DebateCanvas.tsx:95-109`) feeds `offsetHeight` back into `layoutTree` (`debatePresentation.ts:206-214`) — a height change in overview would reflow the whole tree mid-gesture and invalidate the focal math. Therefore: claim text and controls are hidden **only** with size-preserving techniques (`visibility: hidden` / `opacity: 0`, or clipping inside the card's fixed chrome); **`display: none` (and any other used-size-changing property) is FORBIDDEN on height-contributing card children in overview CSS**. The alternative (freezing the measure loop below `READABLE_ZOOM`) was considered and rejected — layout-stable hiding keeps one invariant instead of two code paths. **S4 Playwright assertion: every card's `offsetHeight` is unchanged when `data-zoom-band` toggles between `overview` and normal.**
- **Column fit (mobile default)**: `colZoom = clamp(availableWidth / (CARD_W + 48), READABLE_ZOOM, 1)` (≈0.87 at 320px) — one full card column, readable. This is the `auto` default when viewport ≤768 and `canvas.clientWidth < layout.width`; desktop default stays 1.0.
- **`1:1`** = 1.0.
- **Re-fit with split auto modes**: `fitPolicy` has **three** modes — `column-auto` (mobile default entry), `overview-auto` (entered by pressing `Fit`), and `user-owned` (entered by `+`/`−`/pinch/wheel/`1:1`). While in either auto mode, a `resize`/`orientationchange`/ResizeObserver width change beyond a 32px threshold recomputes **that same mode's** fit — `column-auto` re-runs column fit, `overview-auto` re-runs overview fit; **a resize can never silently convert an overview Fit into column fit** (or vice versa). `Fit` always (re-)enters `overview-auto`; unit tests pin mode preservation across resize in each mode. Pure `fitPolicy(state, event)` function owns all transitions.

**Accessibility**: zoom cluster is a labelled `role="group"`; the `%` readout is `aria-live="polite"`; canvas region gets an `aria-label` naming the zoom level; `prefers-reduced-motion: reduce` disables the `.nodeWrap` position transitions and any zoom animation; zoom without gestures is always possible via the buttons; page-level browser zoom is never restricted.

### 3.3 Degradation strategy per surface

| Surface | ≥920 | 640–920 | ≤640 |
|---|---|---|---|
| Nav/top bars | as today | 2-row header | 2-row + overflow menu, icon brand |
| Tree (Canvas) | zoom buttons + ctrl+wheel/trackpad pinch, default 100% | column-fit default ≤768; pinch + custom pan | column-fit default; pinch + custom pan (hard requirement, §3.2); overview fit + zoom-to-card; buttons always |
| Thread | as today | as today | narrow lanes, capped indent |
| Split | two columns | stacked (existing, moved to 768) | stacked + fluid meter/chips |
| Map | hover inspect + click navigate | same | tap = select/readout; the existing "Open in Split" readout button (`DebateMap.tsx:170`) becomes the only navigation trigger on touch |
| Synthesis | docked 360px panel | **bottom sheet replaces `display:none`** | same sheet, full-width |
| Forms (new/settings) | rows | rows | stacked; 16px inputs |
| Drawers | 468px right panel | same | full-screen, `width: 100%`, safe-area padding |
| Modals/popover | centered / anchored | same | popover viewport-clamped; bottom-sheet style ≤480 |
| Toast/tokenDock | fixed corners | same | toast relocates top-center under chrome; dock at collision-map rectangle + `env(safe-area-inset-bottom)` |

### 3.4 Chrome collision model (reserved RECTANGLES, including expanded states)

Fixed/floating chrome on the debate route is coordinated by **disjoint reserved rectangles**, not anchor points. Variables defined **once** in the S1b foundation file (`styles/base.css`); no slice invents its own offsets:

```css
:root {
  --safe-b: env(safe-area-inset-bottom, 0px);      /* requires viewportFit: "cover" (§3.1) */
  --dock-w: min(360px, calc(100vw - 36px));        /* EXPANDED (unlock form) width cap */
  --dock-collapsed-w: 168px;                       /* hard cap on the COLLAPSED dock button */
  --dock-max-h: 96px;                              /* CAP for the EXPANDED unlock form (wrap allowed,
                                                      internal scroll beyond cap); collapsed ≈ 44px */
  --dock-offset-b: calc(18px + var(--safe-b));
  --zoom-cluster-w: 52px;                          /* 44px controls + padding, vertical stack */
  --zoom-cluster-offset-b: calc(var(--dock-offset-b) + var(--dock-max-h) + 12px);
  --token-dock-clearance: calc(18px + var(--dock-max-h));  /* .debateView padding-bottom input */
  --z-canvas-sticky: 4; --z-zoom-cluster: 5; --z-dock: 40; --z-sheet: 50;
  --z-drawer: 55; --z-pop: 60; --z-modal: 70;
}
```

Reserved rectangles (all states):

| Element (owner) | Rectangle | Expanded state handled |
|---|---|---|
| Set-aside toggle (S4 file, existing) | top-left, sticky, `--z-canvas-sticky` | n/a |
| tokenDock (mount S3 file; style S7) | bottom-right: `right: 18px; bottom: var(--dock-offset-b); width ≤ var(--dock-w); max-height: var(--dock-max-h)` — the unlock form (`DebatePageClient.tsx:1279-1295`, `.tokenForm` wraps) gets `max-height` + internal overflow so the **cap is a hard guarantee**, no live measurement needed (cap-based clearance chosen over a ResizeObserver variable to avoid cross-slice JS). The stale "bottom-left" comment at `:1273` is corrected by S3 | yes — clearance uses the cap |
| Zoom cluster (S4) | bottom-right, `right: 18px; bottom: var(--zoom-cluster-offset-b); width: var(--zoom-cluster-w)` — sits above the dock's **expanded** cap by construction, at any viewport | yes — by construction |
| Toast (S7) | at ≤640 relocates to **top-center under the chrome** (replacing today's `left:14/right:14/bottom:76` band, `globals.css:2633-2639`, which physically intersects any bottom cluster); ≥640 keeps its current position | n/a |
| Synthesis sheet (S5) | collapsed: **bottom-LEFT tab**: `left: 14px; bottom: var(--dock-offset-b); height: 36px; max-width: calc(100vw - 14px - var(--dock-collapsed-w) - 30px)` with the `--dock-collapsed-w: 168px` hard cap on the **collapsed** dock button (CSS `max-width` + ellipsis). Disjointness from the **expanded** dock (which spans nearly full width at 320px) is by **mutually-exclusive-open states**: `.debateView:has(.tokenForm) [data-synth-tab] { visibility: hidden }` — the open unlock form (`.tokenForm` renders only while open, `DebatePageClient.tsx:1279-1295`) hides the tab, pure CSS, no cross-slice JS (`:has()` is safely inside the evergreen floor: Chrome 105+, Safari 15.4+, Firefox 121+). Expanded sheet: overlay ≤ `70dvh` with scrim at `--z-sheet` (50: above dock 40, below drawer 55) — deliberate overlap allowed **only** in this scrimmed, dismissible state | yes — collapsed vs dock-collapsed disjoint by geometry; collapsed vs dock-expanded disjoint by mutual exclusivity |

**Disjointness arithmetic (verified at the required cells; global `box-sizing: border-box`, `globals.css:90-92`, makes the max-width outer-box calculations truthful):**
- **320px**: tab x = 14…122 (max-width 108px); collapsed dock x = 134…302 (168px cap, right:18) → 12px gap, disjoint. Expanded dock x = 18…302 (`--dock-w` = 284) → tab hidden by the `:has()` rule, disjoint. Zoom cluster y starts at `18 + 96 + 12 = 126px` from bottom; tab occupies y = 18…54 → vertically disjoint from zoom at every width.
- **568px**: tab x = 14…370 (max-width 356px); collapsed dock x = 382…550 → 12px gap, disjoint. Expanded dock x = 190…550 (360px) → tab hidden, disjoint.

**Short-height compact zoom arrangement**: the default vertical stack of four ≥44px buttons (~200px tall) starting 126px above the bottom does not fit the 320px-height landscape cell. At `@media (max-height: 480px)` the zoom cluster becomes a **horizontal row** (4×44px buttons + gaps ≈ 208×52px, `%` readout inline), anchored `right: 18px; bottom: var(--zoom-cluster-offset-b)` → occupies y = 126…178, fitting the 568×320 and 844×390 cells with the same disjointness (tab and dock live in y = 18…114).

**Collision testing is an owning-slice gate, not S8-only**: S4 asserts zoom-cluster ∩ dock-expanded = ∅ (unlock form forced open in the fixture) in both cluster orientations; S5 asserts collapsed-tab ∩ (dock-collapsed ∪ zoom) = ∅ **and** that the tab is hidden while `.tokenForm` is open; S7 asserts toast ∩ (dock ∪ zoom) = ∅ at ≤640 and owns the `--dock-collapsed-w` cap enforcement on the collapsed dock button. S8 re-runs the union of these assertions at every matrix cell, including the landscape/short-height cells (§5.6).

---

## 4) DDD IMPACT STATEMENT

- **Bounded context**: Debate Presentation (frontend view layer) only. No domain, API, coordinator, scoring, or persistence surface. DTOs and `lib/types.ts` unchanged.
- **Domain terms**: unchanged, per `apps/dialectical-engine/docs/ddd/ddd-00b-ux-language-map.md`. No DDD renames in this mission.
- **New term**: *Canvas Viewport* (zoom level + fit state of the tree canvas) — presentation vocabulary only; never crosses `lib/api.ts`.
- **Invariants the implementation must preserve (verifiable)**:
  1. *Abandoned paths stay visible*: set-aside/abandoned claims remain rendered, distinguishable, and toggleable at every viewport and zoom level (doctrine `lib/debatePresentation.ts:341-346`; toggle `DebateCanvas.tsx:82,91`). Zoom/fit must never filter nodes.
  2. *Scoring honesty*: a missing score is never presented as low strength; the `SCORING N/A` badge survives small-screen truncation (`DebateCanvas.tsx:22-26, 358-362`; `lib/debateTreeUtils.isLowStrengthNode`).
  3. *Verdict-first flag semantics*: with `NEXT_PUBLIC_VERDICT_FIRST_UI` off, no verdict-first behavior appears — no low-strength dimming, no `VerdictBanner`, no verdict-gate surfaces (`DebateCanvas.tsx:26,231`, `DebatePageClient.tsx:1033,1187`); with it on, those behaviors work unchanged at every width and zoom. Responsive CSS and the CanvasViewport wrapper are flag-independent chrome and may restructure DOM around these surfaces — the invariant is **flag-conditional semantics preserved**, not byte-identical DOM.
  4. *Capability parity across devices*: every desktop action (challenge, regenerate, expand/read, view switching, export, workspace, scoring diagnostics, token unlock) stays reachable on phones — relocation allowed, removal not. The synthesis verdict, currently deleted below 920px (§2.4), is restored on mobile — fixing an existing parity violation. In canvas overview, parity is satisfied via the two-step zoom-to-card path (§3.2): controls are deferred, never removed.
  5. *Existing behavioral contracts*: the 43-file `node:test` suite (§2.6) encodes prior missions' invariants (scoring display, SSE safety, verdict suppression…); every slice leaves it green, rewriting individual contracts RED-first only where this mission's design intentionally changes them (S3 header contract).

---

## 5) TDD / VERIFICATION STRATEGY

### 5.1 Baseline

`web/` has **no vitest/Playwright harness, but a 43-file `node:test` source-test suite that is the regression floor** (§2.6), runnable today via `node --test` from `web/`. The suite asserts source shape, not rendered geometry — it can prove "the CSS rule/DOM contract exists", not "it renders correctly". New tooling is additive in exactly two layers: vitest (+ @testing-library) for logic/component behavior, Playwright for real-browser geometry.

### 5.2 Ordering: no behavioral change lands before its RED vehicle exists — and S2 commits no cross-slice expected failures

- S1a (partition) is **strictly non-behavioral** and is gated by the *existing* suite: all 43 `node:test` files green after the loader migration, plus a build-output equivalence check (§6 S1a).
- S2 (harness) lands before all behavioral slices and lands **green**: runner installs, configs, scripts, and harness **self-tests only** (loader sanity, a boot smoke at the three smoke widths, golden-capture plumbing). S2 does NOT commit failing assertions for unimplemented slices — a suite red with other slices' expected failures would destroy the per-slice green gates and the parallel plan.
- **Each behavioral slice (S1b included) authors its own targeted RED immediately before its implementation**, demonstrates the failure, implements, and returns the entire shared suite (`test:src` + unit + smoke) to green within the slice. Example S1b REDs written in-slice: "stylesheet clearance calc contains `env(safe-area-inset-bottom` and `app/layout.tsx` exports `viewportFit: "cover"`" (structural — fails before S1b); "no focusable form control has computed font-size <16px at ≤768" (geometry — fails before S1b). S1b's safe-area GREEN is **structural/CSS-level**; computed non-zero inset values are an S8 real-device gate (§5.5), because standard Playwright device profiles commonly report `env(safe-area-inset-*) = 0` even with `viewport-fit=cover`.
- S3–S7 same pattern (rewritten source-tests count as RED vehicles where they pin the new contract).

### 5.3 Honest RED assertion classes

Page-level `scrollWidth <= innerWidth` alone is insufficient — `.screen` is itself an overflow container (`globals.css:511-515`) and `.modelTable { overflow: hidden }` (`:842-845`) hides crushed children while the document stays "green". Assertions are therefore **component-geometry** level, in Playwright:

- *Squeeze/readability*: metric in §5.4 — fails today on `/` (library cards) and thread view at 320/375.
- *Clipping/visibility*: every `.modelRow` control (`.capInput`, `.switch`) has a non-clipped bounding box inside `.modelTable` at 320/375 — fails today. Debate top bar: all four view-segment buttons and the scoring-diagnostics trigger visible and clickable (bounding box fully in viewport, non-zero width) at 320/375 — fails today.
- *Capability parity*: at 375, on a completed-debate fixture, verdict content is present and reachable — fails today (`.synthPanel` display:none, `globals.css:2568-2571`).
- *Overflow*: per-container (not just document) horizontal-overflow checks on `.screenInner`, `.debateTopBar`, `.splitMeter`.
- *Transform invariant*: browser-level only (§3.2) — card `offsetHeight` unchanged across zoom while visual bounds scale; sticky toggle has no transformed ancestor.
- *Tap targets*: interactive controls ≥44×44 on touch profiles (fails today for `.iconBtn` 32px, `.nodeCtrl`s).
- Screenshot goldens: captured **GREEN-only** after each slice, as regression nets — never claimed as RED.
- Component gesture tests (vitest + synthetic PointerEvents) are labelled **"handler contract"** — they prove the state-machine math, not that any mobile browser delivers the events.

### 5.4 Flex-squeeze acceptance metric

For a fixture debate whose topic/claims are ordinary English words (no token >12ch): at widths 320 and 375, on `/`, thread view, split view, and canvas cards — **no claim-text element (`.debateCardClaim`, `.threadClaim`, `.splitCardClaim`, `.nodeClaim`) renders a mid-word break** (detector: with `overflow-wrap: anywhere` neutralized in the probe, the element's `scrollWidth` must not exceed its `clientWidth` for the fixture strings — i.e. the column is wide enough that `anywhere` never fires), **and** each such element's content box is ≥12ch in its own font. Residual per §2.2: pathological tokens may still mid-break by design.

### 5.5 Browser-floor evidence gates (pinch rows are hard gates per the V ruling — no pinch residual exists)

**Rendering/layout evidence** (visual correctness at the matrix widths):

| Floor browser | Evidence vehicle | Gate type |
|---|---|---|
| Chrome, Edge, Firefox (Windows desktop) | Playwright chromium/firefox + agent-browser runs on the real installed browsers | hard gate, S8 |
| Desktop Safari (latest) | no macOS in the fleet (env: Windows 11). Named paths, in order: (1) V-provided macOS hardware session with a written checklist; (2) cloud real-browser service (BrowserStack/LambdaTest) if V approves spend; (3) if neither: **formal BLOCKED residual at H9** with Playwright WebKit results attached as approximation | hard gate **or** formal residual — never silent |
| iOS Safari (real) | same three paths; includes the computed non-zero `env(safe-area-inset-*)` check on notched hardware | hard gate **or** formal residual |
| Android Chrome (real) | (1) any available Android handset via `chrome://inspect` remote debugging + checklist; (2) cloud service; (3) DevTools emulation ONLY as approximation + formal residual | hard gate **or** formal residual |

**Pinch acceptance** (V ruling: completion condition — this table has **no residual column by design**):

| Platform | Required evidence | On failure |
|---|---|---|
| iOS Safari, real device | two-finger pinch zooms the tree (GestureEvent path §3.2): recorded interaction (video/agent-driven) at 375-class width — zoom % changes, focal point preserved, page chrome does NOT zoom during canvas pinch, page pinch-zoom still works outside canvas | mission **BLOCKER → escalate to V** (device/spend/decision); never a residual, never buttons-as-substitute |
| Android Chrome, real device | same, via PE two-pointer path §3.2 | same |
| Desktop trackpad — Windows precision touchpad on Chrome/Edge/Firefox | pinch (ctrl+wheel stream) zooms the tree; real hardware run | same |
| Desktop trackpad — macOS Safari | pinch (GestureEvent) zooms the tree; acquired via the desktop-Safari hardware/cloud path above | same (if no macOS access at all: the PINCH gate — unlike rendering — cannot degrade to residual; it escalates to V as BLOCKED) |

The S8 report enumerates every row with verdict {proven / BLOCKED-escalated} for pinch and {proven / residual+reason} for rendering; H9 (V acceptance) sees both tables explicitly. Emulation and compatibility tables are never presented as product truth; synthetic-event tests remain "handler contract" evidence only (§5.3).

### 5.6 Tiered test gates

- **S2 gate**: harness installed and **fully green** — `pnpm test:src` (= `node --test` over the 43 legacy files), `pnpm test:unit` (vitest harness self-tests), `pnpm test:e2e:smoke` (Playwright **chromium only × {320, 375, 1440}**, boot smoke). No cross-slice expected failures are committed (§5.2). Playwright browser download (~1GB, WebKit-on-Windows quirks) is scheduled inside S2, not discovered later.
- **Per-slice gate (S1b, S3–S7)**: that slice's own RED→GREEN tests (authored in-slice) + `test:src` green + smoke subset green + the slice's collision assertions where §3.4 assigns them. NOT the full matrix.
- **S8 gate**: full matrix — chromium+firefox+webkit × widths {320, 375, 768, 1024, 1440, 2560} **plus short-height width×height cells: 844×390 (phone landscape), 568×320 (small-phone landscape), 507×1024 (tablet split-view pane)** + device profiles (custom 320×568, iPhone 12, Pixel 7, iPad, desktop) + §5.5 real-browser and pinch evidence + §5.7 acceptance matrix + collision-assertion union (§3.4) + agent-browser product-truth runs. The short-height cells specifically exercise the two-row chrome, bottom sheet, dock/zoom band, and internal scrollers under constrained height.

### 5.7 Route × state × width acceptance matrix — the definition of "ALL screens" for H9

All cells at widths **320 / 375 / 768 / 1024 / 1440 / 2560**, plus the three **short-height width×height cells** of §5.6 (844×390, 568×320, 507×1024) for the height-sensitive rows (debate views, sheet, dock band, AuthGate form):

| Route | States to verify |
|---|---|
| `/` (library) | empty (no debates), populated, error (coordinator unreachable), composer focus/submit |
| `/new` | **AuthGate row (below)**, then: default, options panel open, validation error, submitting |
| `/settings` | **AuthGate row (below)**, then: loaded model table, cap editing, toggles, error |
| `/admin/workers` | **AuthGate row (below)**, then: loaded metrics, empty, error |
| AuthGate (shared, `components/AuthGate.tsx:55-102`) | checking ("Checking token…", `:55-63`); locked form (`:65-102`); locked + invalid-token error (`:26,49`); submitting ("Checking…" button state, `:94-96`) — exercised through **all three** protected route shells (`app/new/page.tsx:20`, `app/settings/page.tsx:44`, `app/admin/workers/page.tsx:10`) |
| `/debate/[id]` | loading/connecting; generating (progress strip + streaming cards); completed (+synthesis); error banner; no-tree/single-shot; **each view** Thread/Split/Tree/Map; Tree × zoom {overview-fit, column-fit, 100%, ZOOM_MIN, ZOOM_MAX} incl. the `data-zoom-band="overview"` simplified rendering + zoom-to-card tap; scoring insights open/closed; each overlay open (NodeDetailDrawer, InvestigationDrawer, WorkspaceDrawer, ScoringDiagnostics, ChallengePopover, GuideModal, toast, tokenDock unlock form expanded) |

Automated where fixtures allow (Playwright with mocked API per existing `lib/api.ts` shapes); remainder in the S8 agent-browser checklist.

---

## 6) SLICE SPECIFICATIONS

**Ordering law: S1a → S2 → S1b → {S3, S4, S5, S6, S7 parallel} → S8.** The only slice before the harness is the strictly non-behavioral partition, gated by the pre-existing suite.

**File-disjointness**: S3–S7 are disjoint given S1a's partition and the constraints below (`DebatePageClient.tsx` — S3 only; `SynthesisPanel.tsx` — S5 only; collision variables — defined in S1b, consumed read-only by S4/S5/S7). Legacy test files belong to the slice that owns the product file they read.

Risk tiers below are **suggestions with reasons**; Hermes assigns the binding `risk_tier` at H6.

### S1a — CSS partition (partition ONLY)

- **Goal**: split `globals.css` → `styles/*.css` with `globals.css` as `@import` hub; **zero selector/value/order changes**. This is the parallelization enabler for S3–S7.
- **File contract** — allowed: `app/globals.css`, new `styles/*.css`, new `tests/loadCss.mjs`, the 5 CSS-reading test files (§2.6). readonly: everything else. forbidden: any selector/value/order change; any product `.tsx` edit.
- **Dependencies**: none (first slice).
- **RED-first obligations**: none — strictly non-behavioral; gated by the *existing* 43-file suite. Contract includes the test-consumer migration: (i) inventory every `.mjs` reading `app/globals.css` (the 5 files in §2.6, re-verified at slice time); (ii) add shared loader `tests/loadCss.mjs` that concatenates hub + all `@import` targets in order; (iii) migrate those 5 tests to the loader **in this slice**; (iv) the on-disk `globals.css` is NOT required to remain a rule superset — only the loader's concatenation is.
- **Acceptance checks**: all 43 `node:test` files green; loader concatenation byte-identical to the pre-split file; `next build` CSS output equivalence recorded.
- **Risk tier suggestion**: **low** — mechanical move with byte-identity and build-equivalence gates; behavior change is structurally excluded from the slice.

### S2 — Test harness (lands GREEN, harness self-tests only)

- **Goal**: vitest + @testing-library + Playwright devDeps/configs; scripts `test:src` (legacy node:test — a first-class gate forever), `test:unit`, `test:e2e:smoke`, `test:e2e:full`; harness self-tests (loader sanity, boot smoke at the three smoke widths, golden plumbing).
- **File contract** — allowed: `web/package.json`, `web/pnpm-lock.yaml`, `web/playwright.config.ts`, `web/vitest.config.ts`, new `web/tests/**` (harness scaffolding only). readonly: all product code. forbidden: product-code edits; **committing any cross-slice RED assertion** — each behavioral slice authors its own RED in-slice (§5.2).
- **Dependencies**: S1a.
- **RED-first obligations**: none — lands green by design.
- **Acceptance checks**: §5.6 S2 gate — `test:src`, `test:unit`, `test:e2e:smoke` (chromium × {320, 375, 1440}) all green; Playwright browser download completed inside this slice; GREEN goldens at 1440 captured here, before behavioral slices.
- **Risk tier suggestion**: **low** — additive tooling only, no product code; schedule risk (Playwright bootstrap, WebKit-on-Windows quirks) is contained here deliberately.

### S1b — Foundation behavior

- **Goal**: explicit `viewport` export **with `viewportFit: "cover"`**; shell layout model per §3.1 (dvh + flex + `--token-dock-clearance` calc); `text-size-adjust`; drawer `100%`; collision-map rectangle variables (§3.4) in `styles/base.css`; breakpoint tokens + fluid type clamps; 16px form-control floor at ≤768.
- **File contract** — allowed: `app/layout.tsx`, `styles/base.css` (+ the specific section files whose rules change, enumerated at ticket time), own test files. readonly: everything else. forbidden: component JSX beyond `app/layout.tsx`.
- **Dependencies**: S2 (first behavioral slice after the harness).
- **RED-first obligations**: authors its own RED in-slice, e.g. structural: "stylesheet clearance calc contains `env(safe-area-inset-bottom` and `app/layout.tsx` exports `viewportFit: "cover"`"; geometry: "no focusable form control has computed font-size <16px at ≤768" — both fail before S1b.
- **Acceptance checks**: per-slice gate (§5.6). **Safe-area GREEN definition: structural asserts only** (viewport export present; clearance calc contains `env(safe-area-inset-bottom`); computed non-zero inset values are S8's real-device gate, not an S1b CI requirement.
- **Risk tier suggestion**: **medium** — touches every route's shell (viewport export, dvh model, type clamps); cross-browser sensitivity, though fully gated by structural + geometry tests.

### S3 — Debate chrome

- **Goal**: two-row header + overflow menu + ≥44px tap targets per §3.1; scoring status text relocates to the scoring insights strip on phones (a JSX move, not a pure CSS hide); fixes the stale "bottom-left" tokenDock comment at `DebatePageClient.tsx:1273`.
- **File contract** — allowed: `app/debate/[id]/DebatePageClient.tsx` (**header/top-bar region + scoring-status presentation — both the `.topSwitch` cluster and the `scoringInsightsPanel` summary region, `DebatePageClient.tsx:962-1090` — plus the tokenDock comment**), `styles/debate-chrome.css`, `app/debate/headerToolbarResilience.source-test.mjs`, possibly new `components/OverflowMenu.tsx`; updates to the other 17 `DebatePageClient`-reading tests where regexes break incidentally. readonly: everything else. forbidden: `DebatePageClient.tsx` regions outside those named; loosening the scoring/safety semantics any legacy test encodes.
- **Dependencies**: S1b; parallel with S4–S7.
- **RED-first obligations**: **RED-first rewrite of `app/debate/headerToolbarResilience.source-test.mjs`** to the new two-row/overflow DOM + CSS contract (the old contract contradicts this design by intent, §2.6); plus a sweep of the other 17 `DebatePageClient`-reading tests for incidental regex breakage — updating structural assertions deliberately, never loosening semantics.
- **Acceptance checks**: per-slice gate; §5.3 clipping/visibility assertions for the top bar (all four view-segment buttons + scoring-diagnostics trigger visible and clickable at 320/375) go GREEN; `test:src` green.
- **Risk tier suggestion**: **medium** — rewrites a pinned test contract and edits the most test-entangled file in the app (18 regex consumers), but within a tightly named region.

### S4 — Canvas zoom/pan viewport (pinch is this slice's completion condition)

- **Goal**: implement §3.2 in full — `CanvasViewport` with PE two-pointer + GestureEvent + tier-3 touch paths, custom pan, gesture state machine, pointer-intent matrix, zoom cluster, fit policy, overview band.
- **File contract** — allowed: new `components/CanvasViewport.tsx`, new `lib/canvasViewport.ts` (`clampZoom`/bounds/overview-fit/column-fit/`fitPolicy`/focal math, unit-tested), `components/DebateCanvas.tsx`, `styles/canvas.css` (incl. layout-stable `data-zoom-band="overview"` rendering — `display:none` forbidden on height-contributing children, §3.2), own test files. readonly: `lib/debatePresentation.ts` (**explicitly read-only**); collision variables (consume only). forbidden: `DebatePageClient.tsx`; redefining collision variables.
- **Dependencies**: S1b; parallel with S3/S5–S7.
- **RED-first obligations**: authored in-slice per §5.2 — geometry REDs (tree unusable/no zoom at 320/375), then implementation. **Registration mandate: all gesture/touch/wheel listeners bound natively on the canvas ref with `{ passive: false }` and removed on unmount; React synthetic props not used for zoom-critical streams.**
- **Acceptance checks** (slice gate): zoom cluster ∩ expanded dock = ∅ in both cluster orientations (§3.4); sticky-outside-transform DOM test; Playwright transform-invariant; **per-card `offsetHeight` unchanged across `data-zoom-band` toggle**; zoom-controls; zoom-to-card; "drag pans without opening drawer"; "overview tap zooms then open works at 1.0"; handler-contract tests for all three delivery paths + pan→pinch promotion + gesture ownership handover + non-passive/`preventDefault` verification + drag-threshold/`didPan` suppression; `fitPolicy` mode-preservation unit tests. Real-device pinch proof happens at S8 gates, but the slice must pass on-device spot-checks available to the lane (Windows precision touchpad at minimum).
- **Risk tier suggestion**: **high** — carries the mission completion condition (hard pinch), three delivery paths with an ownership handover, a measurement-loop invariant, and the largest novel-code surface in the mission.

### S5 — Reading views + synthesis on mobile

- **Goal**: thread lanes/indent cap, split meter/chips fluidity, map tap-to-inspect (the "Open in Split" readout button `DebateMap.tsx:170` becomes the only navigation trigger on touch), synthesis bottom sheet per the §3.4 rectangle (bottom-left collapsed tab + `:has(.tokenForm)` mutual-exclusion rule + scrimmed expanded state) — restoring verdict parity below 920px.
- **File contract** — allowed: `components/DebateThread.tsx`, `components/DebateSplit.tsx`, `components/DebateMap.tsx`, `components/SynthesisPanel.tsx`, `styles/{thread,split,map,synth}.css`, own test files. readonly: everything else, notably `DebatePageClient.tsx`. forbidden: `DebatePageClient.tsx` — **binding constraint: the sheet is implemented entirely inside `components/SynthesisPanel.tsx` + `styles/synth.css`** (panel is always-mounted, `DebatePageClient.tsx:1178-1192`); if impossible, the slice **STOPS and returns for re-slicing** — it does not edit `DebatePageClient.tsx`.
- **Dependencies**: S1b; parallel with S3/S4/S6/S7.
- **RED-first obligations**: in-slice REDs — capability-parity assertion (verdict reachable at 375 on a completed-debate fixture — fails today, §5.3); thread/split geometry REDs at 320/375.
- **Acceptance checks** (slice gate): collapsed tab ∩ (dock-collapsed ∪ zoom cluster) = ∅; tab hidden while the unlock form is open; parity assertion GREEN; per-slice gate (§5.6).
- **Risk tier suggestion**: **medium** — restores a user-facing parity violation and owns collision geometry, but under a hard stop-and-reslice constraint that bounds the blast radius.

### S6 — Library/forms/settings/admin

- **Goal**: card wrap ≤768 (§3.1), option/model row stacking, `.screenInner` padding tier, admin metrics check; AuthGate screens verified through all three shells (§5.7).
- **File contract** — allowed: `app/page.tsx`, `app/new/page.tsx`, `app/settings/page.tsx`, `app/admin/workers/page.tsx`, `styles/{forms,library}.css`, `components/LibraryComposer.tsx`, own test files. readonly: `components/AuthGate.tsx` (expected unchanged; its screens are covered by the `.screenInner` foundation work — if edits prove necessary, add it to this contract at ticket time). forbidden: everything else.
- **Dependencies**: S1b; parallel with S3–S5/S7.
- **RED-first obligations**: **the §5.4 squeeze metric is this slice's headline RED test** (fails today on `/` at 320/375); `.modelRow` clipping assertions (§5.3, fail today).
- **Acceptance checks**: §5.4 metric GREEN at 320/375 on the fixture; model-table controls non-clipped; AuthGate states rendered through all three shells; per-slice gate.
- **Risk tier suggestion**: **low** — well-bounded CSS/stacking changes across four simple routes, with the mission's clearest before/after metric as its gate.

### S7 — Overlays

- **Goal**: popover viewport clamping; drawer/modal safe-area; toast relocation to top-center at ≤640; tokenDock expanded-state cap (`--dock-max-h` + internal overflow) and collapsed-button cap (`--dock-collapsed-w` + ellipsis) per §3.4 — all via collision-map variables only.
- **File contract** — allowed: `components/ChallengePopover.tsx`, `components/NodeDetailDrawer.tsx`, `components/GuideModal.tsx`, `components/Toast.tsx` (if DOM change needed), `styles/{drawers,overlays}.css`, own test files. readonly: collision variables (consume only), `DebatePageClient.tsx` (the dock mount is S3's file; S7 styles it via `styles/*`). forbidden: redefining collision variables; `DebatePageClient.tsx` edits.
- **Dependencies**: S1b; parallel with S3–S6.
- **RED-first obligations**: in-slice REDs — popover clipping at 320/375 (fails today, §2.5); toast/dock band intersection at ≤640 (fails today, `globals.css:2633-2639`).
- **Acceptance checks** (slice gate): toast ∩ (dock ∪ zoom) = ∅ at ≤640; dock expanded height ≤ `--dock-max-h` with internal overflow; popover fully within viewport at 320/375; drawers full-screen `width: 100%` with safe-area padding; per-slice gate.
- **Risk tier suggestion**: **medium** — fixed-position chrome with cross-slice collision guarantees; geometry is variable-driven and slice-gated, but errors here surface as overlap regressions in other slices' territory.

### S8 — Full-matrix evidence & closure QA

- **Goal**: produce the complete evidence bundle for C8/H9 — §5.5 rendering gates (or formal residuals) **and pinch hard gates (BLOCKER on failure — no residual)**, §5.6 full matrix incl. short-height cells, §5.7 acceptance matrix incl. AuthGate rows, collision-assertion union, agent-browser product-truth runs, real-device checks (computed safe-area insets on notched hardware; iOS dynamic-toolbar jitter checklist).
- **File contract** — allowed: `web/tests/**`, `.hermes/reports/responsive-ui-20260724/**`. readonly: all product code. forbidden: product-code edits (defects found here route back as rework to the owning slice).
- **Dependencies**: S3–S7 all complete.
- **RED-first obligations**: none — evidence stage; it runs and extends assertions, it does not change behavior.
- **Acceptance checks**: the S8 report enumerates every §5.5 row with verdict {proven / BLOCKED-escalated} for pinch and {proven / residual+reason} for rendering; full matrix green; collision union green at every cell; agent-browser bundle attached.
- **Risk tier suggestion**: **medium** — no product-code risk, but it carries the mission's evidence-acquisition risk (iOS/macOS device access) and the authority to BLOCK the mission on a pinch failure.

---

## 7) RISKS AND NON-GOALS

**Risks**
1. *Partition regression* (S1a): mitigated by loader byte-identity + 43-test green gate + build-output equivalence; behavior changes are structurally excluded from the slice.
2. *Legacy source-test brittleness*: 18 tests regex `DebatePageClient.tsx`; S3's rework may break regexes encoding still-valid semantics. Mitigation: per-test triage in S3 (rewrite structural, preserve semantic), `test:src` green gate on every slice.
3. *iOS Safari fidelity gap*: WebKit-on-Windows ≠ real iOS Safari (dvh chrome, safe-area, gestures). Rendering evidence: formal gates with named acquisition paths and explicit BLOCKED residuals (§5.5). **Pinch evidence: hard gates only — no residual exists; unobtainable device access is itself a mission BLOCKER escalated to V** (§5.5).
4. *Pinch delivery risk (hard requirement)*: the design does not depend on the refuted `pan-x pan-y` arbitration path — canvas-only `touch-action: none` + custom pan makes delivery deterministic on Chromium; iOS/macOS Safari uses native GestureEvents; a tier-3 touch tracker backstops both (§3.2). Residual risk is real-device confirmation timing, not mechanism plausibility; failure on any floor browser is a mission BLOCKER escalated to V, never shipped around. Secondary tradeoff accepted: custom touch pan loses native momentum (non-goal polish).
5. *Zoom vs measurement loop*: pinned by Playwright browser assertions + source pin (§5.3); jsdom explicitly not trusted for this. Overview simplification is constrained to layout-stable hiding (§3.2) so the measure loop can never reflow mid-gesture.
6. *Chrome collisions*: S4/S5/S7 all target the bottom band; mitigated by single-source collision variables + reserved-rectangle arithmetic (§3.4), owning-slice collision gates, and the S8 union re-run.
7. *Playwright bootstrap cost* (S2): browser downloads + WebKit-on-Windows setup is real schedule risk for the Codex lane; contained in S2 with the smoke tier as the working set (§5.6).
8. *Desktop-regression risk while fixing mobile*: GREEN goldens at 1440 captured after S2, before behavioral slices; smoke tier runs at 1440 as well as 320/375.
9. *4K under-specification*: "nice on 4K" is subjective; treated as fluid max-width tiers + zoom-in (§3.1), as reviewed and approved.

**Non-goals**
- No DDD renames, no backend/API/coordinator changes, no scoring semantics changes.
- No UI framework adoption (no Tailwind/CSS-in-JS); plain CSS stays.
- No dark mode, RTL, i18n, PWA/offline, or font changes.
- **Print styles and `forced-colors`/Windows High Contrast are out of scope** for this mission; landscape phones and tablet split-view/Slide Over are **in scope via width-driven breakpoints + the re-fit policy** (§3.2), not via separate orientation stylesheets.
- No restyling of dead components `DebateTree.tsx` / `DebateOutline.tsx` / `ArgumentFocusView.tsx` (their source-tests stay green untouched); removal is a separate cleanup ticket for Hermes to raise.
- No persistence of zoom state (session-local only); no minimap/birds-eye; no touch-pan momentum/inertia (accepted tradeoff of canvas-only `touch-action: none`, §3.2).
- No `user-scalable`/`maximumScale` restrictions ever; page-level pinch zoom outside the canvas is never impaired.
- `overflow-wrap: anywhere` on pathological tokens is retained by design (residual, §2.2/§5.4).

---

## Appendix — Consolidation notes (C4)

Consolidation-only readings taken while folding the approved Plan.md; no design decisions were made.

1. **`--token-dock-clearance` value.** Plan.md's shell-model prose (§b.1) described the variable as `58px` ("replacing the magic `padding-bottom: 58px`"), while the approved collision-variable block (§b.4) defines `--token-dock-clearance: calc(18px + var(--dock-max-h))` = 114px. These conflict. This document adopts the §b.4 definition (§3.1/§3.4 here): it is the later, reviewer-verified design — the disjointness arithmetic and the "cap is a hard guarantee" clearance model both depend on `--dock-max-h`, and both reviewers verified that arithmetic in the final round. The `58px` reading is the legacy magic number the variable replaces, surviving in prose from an earlier revision; it is not carried forward.
2. **Degradation-table column granularity.** The §3.3 table keeps Plan.md's ≥920 / 640–920 / ≤640 columns while several rules bind at ≤768 (card wrap, column-fit default, 16px inputs, split stacking moved to 768). This is presentation granularity, not a contradiction — the canonical breakpoint set (§3.1) and the per-rule thresholds govern; the table cells note their own thresholds where they differ.
3. **Reviewer-tag removal.** All H2/G3 finding tags, round annotations, and the §g disposition history were removed per the C4 artifact spec. Where a tag carried binding content (the V hard-pinch ruling, the voided misclick record, the stop-and-reslice constraint on S5, the S3 test-rewrite mandate), the content itself is preserved in the relevant section. No requirement, gate, invariant, or forbidden-path was dropped or weakened in the fold.
