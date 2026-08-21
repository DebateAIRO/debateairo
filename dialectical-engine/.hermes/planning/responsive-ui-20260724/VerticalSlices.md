# VerticalSlices.md — responsive-ui-20260724

- mission: responsive-ui-20260724
- artifact: G5 ticket-ready vertical slice deck (collapsed C4+G5 hop, part 2)
- source of truth: `.hermes/planning/responsive-ui-20260724/FinalPlan.md` (§3 design, §5 verification, §6 slice specs)
- binding intake: `.hermes/reports/responsive-ui-20260724/00-intake.md` (V rulings as already reflected in FinalPlan)
- scope root: `apps/dialectical-engine/web` (all paths relative to this root unless prefixed with `apps/` or `.hermes/`)
- parallel block file-disjointness: **yes** (verified against FinalPlan §6 allowed-path sets; see matrix below)
- SLICING DEFECT: none

---

## (a) Slice dependency DAG

```text
S1a  CSS partition (non-behavioral)
 │
 ▼
S2   Test harness (lands GREEN)
 │
 ▼
S1b  Foundation behavior
 │
 ├──────────┬──────────┬──────────┬──────────┐
 ▼          ▼          ▼          ▼          ▼
S3         S4         S5         S6         S7
Debate     Canvas     Reading    Library/   Overlays
chrome     zoom/pan   + synth    forms/
(parallel block — file-disjoint by contract)
 │          │          │          │          │
 └──────────┴──────────┴──────────┴──────────┘
                     │
                     ▼
                    S8  Full-matrix evidence & closure QA
```

**Ordering law (FinalPlan §6):** `S1a → S2 → S1b → {S3, S4, S5, S6, S7 parallel} → S8`.

---

## (b) File-ownership matrix — parallel block S3–S7

Allowed product / style / named legacy-test paths from FinalPlan §6, **plus exclusive new-test roots** bound by this deck (H5 finding 1). New behavioral/geometry/handler tests for each parallel slice **must** live only under that slice’s bound directory; pairwise disjointness is provable from the contracts alone (no shared-namespace convention).

| Owned path | S3 | S4 | S5 | S6 | S7 |
|---|:---:|:---:|:---:|:---:|:---:|
| `app/debate/[id]/DebatePageClient.tsx` | ✓ | | | | |
| `styles/debate-chrome.css` | ✓ | | | | |
| `app/debate/headerToolbarResilience.source-test.mjs` | ✓ | | | | |
| `components/OverflowMenu.tsx` (new, optional) | ✓ | | | | |
| Other 17 `DebatePageClient`-reading tests (regex updates only where needed) | ✓ | | | | |
| `tests/s3-chrome/**` (exclusive new tests) | ✓ | | | | |
| `components/CanvasViewport.tsx` (new) | | ✓ | | | |
| `lib/canvasViewport.ts` (new) | | ✓ | | | |
| `components/DebateCanvas.tsx` | | ✓ | | | |
| `styles/canvas.css` | | ✓ | | | |
| `tests/s4-canvas/**` (exclusive new tests) | | ✓ | | | |
| `components/DebateThread.tsx` | | | ✓ | | |
| `components/DebateSplit.tsx` | | | ✓ | | |
| `components/DebateMap.tsx` | | | ✓ | | |
| `components/SynthesisPanel.tsx` | | | ✓ | | |
| `styles/thread.css` | | | ✓ | | |
| `styles/split.css` | | | ✓ | | |
| `styles/map.css` | | | ✓ | | |
| `styles/synth.css` | | | ✓ | | |
| `tests/s5-reading/**` (exclusive new tests) | | | ✓ | | |
| `app/page.tsx` | | | | ✓ | |
| `app/new/page.tsx` | | | | ✓ | |
| `app/settings/page.tsx` | | | | ✓ | |
| `app/admin/workers/page.tsx` | | | | ✓ | |
| `styles/forms.css` | | | | ✓ | |
| `styles/library.css` | | | | ✓ | |
| `components/LibraryComposer.tsx` | | | | ✓ | |
| `tests/s6-library/**` (exclusive new tests) | | | | ✓ | |
| `components/ChallengePopover.tsx` | | | | | ✓ |
| `components/NodeDetailDrawer.tsx` | | | | | ✓ |
| `components/GuideModal.tsx` | | | | | ✓ |
| `components/Toast.tsx` (if DOM change needed) | | | | | ✓ |
| `styles/drawers.css` | | | | | ✓ |
| `styles/overlays.css` | | | | | ✓ |
| `tests/s7-overlays/**` (exclusive new tests) | | | | | ✓ |

**Pairwise disjointness proof (allowed product/style/legacy-test/new-test paths):** every non-empty cell is unique to one column. No path appears in more than one of S3–S7. New-test roots are exclusive directories: `tests/s3-chrome/**` ∩ `tests/s4-canvas/**` ∩ `tests/s5-reading/**` ∩ `tests/s6-library/**` ∩ `tests/s7-overlays/**` = empty by path prefix.

**Read-only cross-slice consumptions (not ownership conflicts):**

| Resource | Defined by | Consumed read-only by |
|---|---|---|
| Collision-map CSS variables (`styles/base.css`) | S1b | S4, S5, S7 |
| `lib/debatePresentation.ts` | (pre-existing) | S4 (explicitly read-only) |
| `DebatePageClient.tsx` dock mount region | S3 | S7 styles only via `styles/*`; S5 sheet must not edit it |
| `components/AuthGate.tsx` | (pre-existing) | S6 expected unchanged |

**Serial-slice exclusivity (not in parallel matrix):** S1a owns the CSS partition + 5 CSS-reading test migrations + `tests/loadCss.mjs`; S2 owns harness configs/`package.json` and `tests/**` harness scaffolding **except** the five reserved parallel roots (`tests/s3-chrome/**` … `tests/s7-overlays/**`); S1b owns `app/layout.tsx` + `styles/base.css` (+ foundation section-file edits enumerated at ticket time) and may place its own new tests under `tests/s1b-foundation/**` only; S8 may extend non-reserved `tests/**` for matrix evidence + `.hermes/reports/responsive-ui-20260724/**` only (does not reassign S3–S7 exclusive roots).

---

## (c) Merge order into the closure target

**Closure / integration target (proposed):** branch `integrate/responsive-ui-20260724`, created off current working branch **`lane/roadmap-p0-p3`** (parent = tip of `lane/roadmap-p0-p3` at lane-plan approval).

All approved lane work for this mission integrates **into that single target** in the order below (parallel slices may land in any mutual order after S1b, but all five must be in the target before S8). This is a sequencing plan for **H6 / V approval only** — **no worker gains merge authority** from this deck; Hermes (and V on the lane-plan gate) own when and how integration happens.

Suggested integration order (respects the DAG; each lane must be HERMES-approved and file-contract clean before fan-in):

1. `lane/resp-s1a` → S1a → merge into `integrate/responsive-ui-20260724`
2. `lane/resp-s2` → S2 → merge into `integrate/responsive-ui-20260724`
3. `lane/resp-s1b` → S1b → merge into `integrate/responsive-ui-20260724`
4. Parallel fan-in (any order among the five, then all required before S8) into `integrate/responsive-ui-20260724`:
   - `lane/resp-s3` → S3
   - `lane/resp-s4` → S4
   - `lane/resp-s5` → S5
   - `lane/resp-s6` → S6
   - `lane/resp-s7` → S7
5. `lane/resp-s8` → S8 → merge into `integrate/responsive-ui-20260724` (closure evidence; no product edits)

Hermes assigns binding `risk_tier` at H6; tiers below are suggestions only (FinalPlan §1.2 / §6).

---

## Shared verification commands (FinalPlan §5.6)

All commands run from `apps/dialectical-engine/web` unless noted.

| Gate | Commands / scope |
|---|---|
| Legacy source-test floor (pre-S2) | `node --test "**/*.test.mjs" "**/*.source-test.mjs"` — single exact command; dual globs required because bare `node --test` default patterns omit `*.source-test.mjs` (29 of 43 files). Verified: 14 `*.test.mjs` + 29 `*.source-test.mjs` = **43** under `web/`. |
| Legacy source-test floor (post-S2) | `pnpm test:src` (script wires the same 43-file floor) |
| Unit harness | `pnpm test:unit` (vitest) |
| Smoke e2e | `pnpm test:e2e:smoke` — Playwright chromium only × widths `{320, 375, 1440}` |
| Full e2e matrix (S8) | `pnpm test:e2e:full` — chromium+firefox+webkit × widths `{320, 375, 768, 1024, 1440, 2560}` **plus** short-height cells `{844×390, 568×320, 507×1024}` + device profiles |
| Ad-hoc legacy single file | `node --test <path>` (pre-S2 or targeted) |
| Build equivalence (S1a) | `pnpm build` (or `pnpm exec next build`) with CSS-output equivalence recorded — **not** bare `next build` (not on PATH) |

**Per-slice behavioral gate (S1b, S3–S7):** that slice’s own RED→GREEN tests (under its bound `tests/s*-*/**` root where applicable) + `pnpm test:src` green (post-S2) + smoke subset green + collision assertions where §3.4 assigns them. Not the full matrix.
---

## Slice S1a — Partition globals.css into styles/* hub

### Goal

Split the monolithic `app/globals.css` into `styles/*.css` with `globals.css` remaining an `@import` hub only. Selector values, cascade order, and product behavior must be byte-identical after partition. This is the strictly non-behavioral enabler that makes S3–S7 file-disjoint parallel work possible.

### File contract

| | Paths |
|---|---|
| **Allowed to edit** | `app/globals.css`; new `styles/*.css`; new `tests/loadCss.mjs`; the 5 CSS-reading test files (§2.6): `app/debate/headerToolbarResilience.source-test.mjs`, `app/debate/scoringTreePrimary.source-test.mjs`, `components/DebateCanvas.responsive.test.mjs`, `components/RecommendedInvestigations.source-test.mjs`, `lib/scoreBandTokens.test.mjs` |
| **Read-only** | everything else |
| **Forbidden** | all_others; any selector/value/order change; any product `.tsx` edit |
| **Verification** | From `apps/dialectical-engine/web`, pre-S2 exact command: `node --test "**/*.test.mjs" "**/*.source-test.mjs"` (all 43 legacy files green). Post-S2 equivalent: `pnpm test:src`. Prove loader concatenation is byte-identical to the pre-split file; record `pnpm build` (or `pnpm exec next build`) CSS-output equivalence |

### Dependencies

- HERMES-approved first: **none** (first slice).

### RED-first obligations

- **None** — strictly non-behavioral; gated by the *existing* 43-file suite.
- Contract still requires, in this slice: (i) re-inventory every `.mjs` reading `app/globals.css` (the 5 files above, re-verified at slice time); (ii) add shared loader `tests/loadCss.mjs` that concatenates hub + all `@import` targets in order; (iii) migrate those 5 tests to the loader; (iv) on-disk `globals.css` is **not** required to remain a rule superset — only the loader's concatenation is.

### Acceptance checks

- [ ] All 43 `node:test` files green after migration.
- [ ] Loader concatenation byte-identical to the pre-split file.
- [ ] `pnpm build` (or `pnpm exec next build`) CSS output equivalence recorded.
- [ ] Zero intentional selector/value/order changes; zero product `.tsx` edits.

### Worktree lane

- Lane id: `resp-s1a`
- Branch: `lane/resp-s1a`

### Risk-tier suggestion

**low** — mechanical move with byte-identity and build-equivalence gates; behavior change is structurally excluded.

### Codex-readiness note

Do not "improve" CSS while partitioning. The 5 CSS-reading tests must migrate to `tests/loadCss.mjs` in this slice or they will fail once rules leave `globals.css`. Legacy tests that still regex product TSX are out of scope here. Partition file boundaries should anticipate the S3–S7 style ownership rows (`debate-chrome`, `canvas`, `thread`/`split`/`map`/`synth`, `forms`/`library`, `drawers`/`overlays`, plus `base` for S1b).

---

## Slice S2 — Install vitest/Playwright harness green

### Goal

Add vitest (+ @testing-library) and Playwright as additive tooling with configs and npm scripts. Land the harness fully green with self-tests only — loader sanity, boot smoke at the three smoke widths, and golden-capture plumbing. Do not commit any failing assertions that belong to later behavioral slices.

### File contract

| | Paths |
|---|---|
| **Allowed to edit** | `package.json`, `pnpm-lock.yaml`, `playwright.config.ts`, `vitest.config.ts`, new `tests/**` (harness scaffolding only) — all under `apps/dialectical-engine/web` |
| **Read-only** | all product code |
| **Forbidden** | all_others; product-code edits; **committing any cross-slice RED assertion** |
| **Verification** | `pnpm test:src`; `pnpm test:unit`; `pnpm test:e2e:smoke` (chromium × `{320, 375, 1440}`); Playwright browser download completed inside this slice |

### Dependencies

- HERMES-approved first: **S1a**.

### RED-first obligations

- **None** — lands green by design (§5.2). Harness self-tests only.

### Acceptance checks

- [ ] Scripts exist: `test:src` (legacy node:test — first-class gate forever), `test:unit`, `test:e2e:smoke`, `test:e2e:full`.
- [ ] §5.6 S2 gate: `test:src`, `test:unit`, `test:e2e:smoke` all green.
- [ ] Playwright browsers downloaded (incl. WebKit-on-Windows schedule risk contained here).
- [ ] GREEN goldens at 1440 captured here, before behavioral slices.
- [ ] No committed expected failures for unimplemented S1b/S3–S7 behavior.

### Worktree lane

- Lane id: `resp-s2`
- Branch: `lane/resp-s2`

### Risk-tier suggestion

**low** — additive tooling only, no product code; schedule risk (Playwright bootstrap, WebKit-on-Windows) is deliberately contained here.

### Codex-readiness note

A suite red with other slices' expected failures would destroy per-slice green gates and the parallel plan — never commit those REDs here. Smoke widths are exactly `{320, 375, 1440}` on chromium only. Keep `test:src` as a permanent first-class gate over the 43 legacy files.

---

## Slice S1b — Land foundation viewport shell and tokens

### Goal

Introduce the explicit Next.js `viewport` export with `viewportFit: "cover"`, the debate shell layout model (dvh + flex + `--token-dock-clearance`), `text-size-adjust`, drawer width `100%`, collision-map rectangle variables in `styles/base.css`, breakpoint tokens, fluid type clamps, and the 16px form-control floor at ≤768. This is the first behavioral slice and the shared foundation every later surface consumes.

### File contract

| | Paths |
|---|---|
| **Allowed to edit** | `app/layout.tsx`; `styles/base.css`; the specific section files whose rules change (enumerated at ticket time from §3.1 foundation scope); **new tests only under** `tests/s1b-foundation/**` |
| **Read-only** | everything else |
| **Forbidden** | all_others; component JSX beyond `app/layout.tsx` |
| **Verification** | Per-slice gate (§5.6): own RED→GREEN tests + `pnpm test:src` + smoke subset. Safe-area GREEN = **structural asserts only** |

### Dependencies

- HERMES-approved first: **S2** (first behavioral slice after the harness).

### RED-first obligations

Author in-slice REDs that fail before implementation, e.g.:

1. **Structural:** stylesheet clearance calc contains `env(safe-area-inset-bottom` **and** `app/layout.tsx` exports `viewportFit: "cover"`.
2. **Geometry:** no focusable form control has computed font-size <16px at ≤768.

### Acceptance checks

- [ ] `export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" }` present — **no** `maximumScale`, **no** `userScalable: false`.
- [ ] Shell model per §3.1: `.debateView` / `.appShell` use `100dvh` with `100vh` fallback; `.debateView` padding-bottom uses `calc(var(--token-dock-clearance) + env(safe-area-inset-bottom, 0px))` (or equivalent that includes both clearance and safe-area).
- [ ] `--token-dock-clearance: calc(18px + var(--dock-max-h))` and full §3.4 collision-map variables defined **once** in `styles/base.css`.
- [ ] Canonical breakpoints available: `480`, `640`, `768`, `920`, `1200`.
- [ ] Fluid type clamps on display/lede/hero sizes; 16px form-control floor at ≤768.
- [ ] `html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }`; drawer `100vw` → `100%` where applicable.
- [ ] Safe-area GREEN is structural only; computed non-zero insets are **S8** real-device gates, not S1b CI.
- [ ] Per-slice gate green (`test:src` + unit + smoke subset).

### Worktree lane

- Lane id: `resp-s1b`
- Branch: `lane/resp-s1b`

### Risk-tier suggestion

**medium** — touches every route's shell (viewport export, dvh model, type clamps); cross-browser sensitivity, gated by structural + geometry tests.

### Codex-readiness note

`viewportFit: "cover"` is mandatory or every `env(safe-area-inset-*)` rule in this plan is a no-op on notched iPhones. Never add `user-scalable=no` / `maximumScale`. Collision variables are single-source in `styles/base.css` — later slices must **consume**, not redefine. Clearance is the cap-derived formula (`18px + --dock-max-h`), not the legacy magic `58px`. Annotate safe-area CSS with the viewportFit dependency comment required by §3.1.

---

## Slice S3 — Rewrite debate chrome for two-row header

### Goal

Implement the responsive debate top bar: two-row header at ≤920, overflow menu for secondary actions at ≤640, ≥44×44px tap targets, and relocation of scoring status text into the scoring insights strip on phones (JSX move, not pure CSS hide). Correct the stale tokenDock "bottom-left" comment at `DebatePageClient.tsx:1273`. Intentionally rewrite the pinned header source-test contract RED-first.

### File contract

| | Paths |
|---|---|
| **Allowed to edit** | `app/debate/[id]/DebatePageClient.tsx` (**only** header/top-bar region + scoring-status presentation — `.topSwitch` cluster and `scoringInsightsPanel` summary region, approximately `:962-1090` — **plus** the tokenDock comment); `styles/debate-chrome.css`; `app/debate/headerToolbarResilience.source-test.mjs`; possibly new `components/OverflowMenu.tsx`; updates to the other 17 `DebatePageClient`-reading tests where regexes break incidentally; **new tests only under** `tests/s3-chrome/**` |
| **Read-only** | everything else |
| **Forbidden** | all_others; `DebatePageClient.tsx` regions outside those named; loosening the scoring/safety semantics any legacy test encodes |
| **Verification** | Own REDs green; `pnpm test:src`; smoke subset; §5.3 top-bar clipping/visibility at 320/375 |

### Dependencies

- HERMES-approved first: **S1b**.
- Parallel with: S4, S5, S6, S7.

### RED-first obligations

1. **RED-first rewrite** of `app/debate/headerToolbarResilience.source-test.mjs` to the new two-row / overflow DOM + CSS contract (old contract contradicts this design by intent, §2.6).
2. Sweep the other 17 `DebatePageClient`-reading tests for incidental regex breakage — update structural assertions deliberately; **never loosen semantics**.

Named consumers (§2.6): `headerToolbarResilience`, `scoreAwareNavigation`, `scoringTreePrimary`, `scoringTreeUsability`, `cachedScoringDisplay`, `scoringFailureDisplay`, `scoringToggle`, `sseFailureSafety`, `transientSsrRecovery`, `scoringDiagnostics`, `scoringErrorBoundary`, `scoringFeedbackControls`, both `VerdictBanner` tests, `adaptiveDepthDryRun`, `frontendCorrectness`, `recommendation`, `scoringHolesSummary`.

### Acceptance checks

- [ ] Two-row responsive header at ≤920: row 1 = brand (icon-only ≤640) + title (ellipsized, `flex: 1`) + status pill; row 2 = view segment + primary actions.
- [ ] Secondary actions (Workspace, Export, ?, ⚙) in a "⋯" overflow menu at ≤640.
- [ ] Scoring status text relocated to scoring insights strip on phones (JSX, not pure CSS hide).
- [ ] All tap targets ≥44×44px.
- [ ] §5.3 clipping/visibility GREEN: all four view-segment buttons + scoring-diagnostics trigger visible and clickable (bounding box fully in viewport, non-zero width) at **320 and 375**.
- [ ] Stale "bottom-left" tokenDock comment corrected.
- [ ] `pnpm test:src` green (rewritten + non-loosened legacy contracts).

### Worktree lane

- Lane id: `resp-s3`
- Branch: `lane/resp-s3`

### Risk-tier suggestion

**medium** — rewrites a pinned test contract and edits the most test-entangled file (18 regex consumers), but within a tightly named region.

### Codex-readiness note

Stay inside the named `DebatePageClient.tsx` regions only — dock **mount** stays in this file for comment fix / ownership of mount site, but S7 owns dock **styling** via collision variables. Do not loosen scoring/SSE/verdict semantics when repairing regex tests. The old single-cluster `.debateTopActions` assertion is intentionally retired; the new contract must pin the two-row / overflow structure.

---

## Slice S4 — Implement canvas zoom/pan viewport with hard pinch

### Goal

Deliver the full §3.2 Canvas Viewport: pinch-zoom (PE two-pointer + WebKit GestureEvent + tier-3 touch), custom pan under canvas-only `touch-action: none`, gesture state machine, pointer-intent matrix, zoom control cluster, fit policy, and overview band with layout-stable hiding. Pinch is a **mission completion condition**; buttons and ctrl+wheel are necessary but not sufficient.

### File contract

| | Paths |
|---|---|
| **Allowed to edit** | new `components/CanvasViewport.tsx`; new `lib/canvasViewport.ts` (`clampZoom` / bounds / overview-fit / column-fit / `fitPolicy` / focal math — unit-tested); `components/DebateCanvas.tsx`; `styles/canvas.css` (incl. layout-stable `data-zoom-band="overview"` rendering); **new tests only under** `tests/s4-canvas/**` |
| **Read-only** | `lib/debatePresentation.ts` (**explicitly**); collision variables (consume only); everything else |
| **Forbidden** | all_others; `DebatePageClient.tsx`; redefining collision variables |
| **Verification** | Own REDs + unit/handler-contract + Playwright slice assertions; `pnpm test:src`; smoke subset; collision gate for zoom ∩ expanded dock. Real-device pinch proof is S8, but lane must pass available on-device spot-checks (Windows precision touchpad minimum) |

### Dependencies

- HERMES-approved first: **S1b**.
- Parallel with: S3, S5, S6, S7.

### RED-first obligations

Author in-slice REDs per §5.2 before implementation, including:

1. Geometry REDs: tree unusable / no zoom at 320/375.
2. Handler-contract suite for delivery paths and state machine (listed in acceptance).
3. **Registration mandate tests:** listeners bound natively with `{ passive: false }`; `preventDefault` works on cancelable synthetic events.

### Acceptance checks

**Zoom math / policy (unit-tested in `lib/canvasViewport.ts`):**

- [ ] Global bounds: `ZOOM_MIN = 0.1`, `ZOOM_MAX = 2.0`; every path clamps.
- [ ] `READABLE_ZOOM = 0.5` is the readability floor; overview may go below it.
- [ ] Overview fit: `fitZoom = clamp(availableWidth / layout.width, ZOOM_MIN, 1)` — e.g. depth-3 ≈ 0.198 at 320px; depth-5 ≈ 0.132; deeper may clamp at 0.1.
- [ ] Column fit (mobile default ≤768 when `clientWidth < layout.width`): `colZoom = clamp(availableWidth / (CARD_W + 48), READABLE_ZOOM, 1)` (≈0.87 at 320px); desktop default 1.0.
- [ ] `fitPolicy` modes: `column-auto` | `overview-auto` | `user-owned`; resize preserves mode (never silently converts overview Fit into column fit); 32px width-change threshold; unit tests pin mode preservation.

**DOM / geometry / collision:**

- [ ] Sticky set-aside toggle remains a **sibling before** the sizer; no transformed ancestor (DOM test).
- [ ] Transform on `.canvasInner` only; sizer size = layout × zoom; `transform-origin: 0 0`.
- [ ] Playwright: card `offsetHeight` constant across zoom while visual bounds scale; measure loop never switches to `getBoundingClientRect` (source pin).
- [ ] **Per-card `offsetHeight` unchanged when `data-zoom-band` toggles** overview ↔ normal.
- [ ] Overview simplification: **`display: none` FORBIDDEN** on height-contributing card children — use size-preserving hide only.
- [ ] Zoom cluster ∩ expanded dock = ∅ in both vertical and short-height horizontal orientations (§3.4); cluster uses `--zoom-cluster-*` variables.
- [ ] Controls: `+`, `−`, `Fit` (name "Fit whole tree (overview)"), `1:1`, live `%` (`aria-live="polite"`); buttons ≥44px; `role="group"`.

**Gesture / intent:**

- [ ] Canvas-only `touch-action: none`; page pinch outside canvas remains enabled.
- [ ] Non-passive native listeners for gesture/touch/wheel; React synthetic props **not** used for zoom-critical streams; cleanup on unmount.
- [ ] Paths: PE two-pointer (Chromium); GestureEvent + touch focal (Safari); tier-3 two-touchmove fallback.
- [ ] Gesture ownership: `gesturestart` suspends PE exactly once; no double mutation; `gestureend` re-arms.
- [ ] Pointer-intent: interactive hit-test never starts pan; drag threshold **8px**; `didPan` suppresses click; overview tap = zoom-to-card at 1.0 then open works.
- [ ] Playwright smokes: "drag pans without opening drawer"; "overview tap zooms, then open works at 1.0".
- [ ] Handler-contract: pan→pinch promotion; ownership handover; `preventDefault` on cancelable gesture/touchmove; non-passive registration; drag-threshold/`didPan`.
- [ ] `prefers-reduced-motion: reduce` disables position/zoom animation.

### Worktree lane

- Lane id: `resp-s4`
- Branch: `lane/resp-s4`

### Risk-tier suggestion

**high** — carries the mission completion condition (hard pinch), three delivery paths with ownership handover, the measurement-loop invariant, and the largest novel-code surface.

### Codex-readiness note

**Easy to miss and fatal if missed:**

1. Register `gesturestart`/`gesturechange`/`gestureend`/`touchstart`/`touchmove`/`wheel` with `addEventListener(..., { passive: false })` on the canvas ref — React defaults are passive; without this, iOS page-zooms during canvas pinch.
2. **`display: none` is forbidden** on height-contributing overview children; overview must not reflow the measure loop.
3. **`offsetHeight` must stay constant** across zoom and across overview band toggles; prove in Playwright, not jsdom.
4. Do not transform a shared ancestor of the sticky set-aside toggle.
5. Do not edit `lib/debatePresentation.ts` or `DebatePageClient.tsx`.
6. Consume collision variables; do not redefine. Zoom cluster sits above expanded dock by construction (`--zoom-cluster-offset-b`).
7. Pinch cannot be waived or substituted by buttons; floor-browser failure escalates as mission BLOCKER at S8.

---

## Slice S5 — Restore mobile reading views and synthesis sheet

### Goal

Make Thread, Split, and Map usable on phones (narrow lanes / indent cap, fluid meter/chips, tap-to-inspect on Map) and restore synthesis/verdict parity below 920px via a bottom sheet that follows the §3.4 reserved rectangles. The sheet lives entirely inside `SynthesisPanel` + `styles/synth.css` without editing `DebatePageClient.tsx`.

### File contract

| | Paths |
|---|---|
| **Allowed to edit** | `components/DebateThread.tsx`; `components/DebateSplit.tsx`; `components/DebateMap.tsx`; `components/SynthesisPanel.tsx`; `styles/thread.css`; `styles/split.css`; `styles/map.css`; `styles/synth.css`; **new tests only under** `tests/s5-reading/**` |
| **Read-only** | everything else, notably `DebatePageClient.tsx` |
| **Forbidden** | all_others; **`DebatePageClient.tsx`** — binding: sheet implemented entirely inside `SynthesisPanel.tsx` + `styles/synth.css` (panel always-mounted at `DebatePageClient.tsx:1178-1192`). **If impossible: STOP and return for re-slicing** — do not edit `DebatePageClient.tsx` |
| **Verification** | Own REDs + collision asserts; `pnpm test:src`; smoke subset |

### Dependencies

- HERMES-approved first: **S1b**.
- Parallel with: S3, S4, S6, S7.

### RED-first obligations

1. Capability-parity assertion: verdict content present and reachable at **375** on a completed-debate fixture — fails today (`.synthPanel { display: none }` at ≤920).
2. Thread/split geometry REDs at 320/375 (lane squeeze, split meter collapse).

### Acceptance checks

- [ ] Thread: `--thread-lane` 30px → 14px at ≤480; visual indent depth capped so text keeps ≥60% of viewport width.
- [ ] Split: meter sides `flex: 0 1 auto; min-width: 64px`; chips fluid; stacking moved to **768** (absorbs stray 760).
- [ ] Map: on touch, tap selects/readout; **only** the existing "Open in Split" button (`DebateMap.tsx:170`) navigates — no hover-only inspect dependency.
- [ ] Synthesis: bottom sheet replaces `display:none` below 920; collapsed **bottom-left tab** per §3.4 geometry; expanded ≤ `70dvh` with scrim at `--z-sheet`.
- [ ] `:has(.tokenForm)` hides synth tab while unlock form open (mutual exclusion).
- [ ] Collision: collapsed tab ∩ (dock-collapsed ∪ zoom cluster) = ∅; tab hidden while `.tokenForm` open.
- [ ] Parity assertion GREEN at 375; per-slice gate green.
- [ ] **Stop-and-reslice** honored if `DebatePageClient.tsx` would be required.

### Worktree lane

- Lane id: `resp-s5`
- Branch: `lane/resp-s5`

### Risk-tier suggestion

**medium** — restores a user-facing parity violation and owns collision geometry, but the hard stop-and-reslice constraint bounds blast radius.

### Codex-readiness note

If the sheet cannot be implemented without touching `DebatePageClient.tsx`, **stop** — do not "just edit the parent." Collapsed-tab max-width arithmetic depends on `--dock-collapsed-w: 168px` (S1b variables). Disjointness vs expanded dock is via `:has(.tokenForm)` mutual exclusion, not geometry alone. Do not restyle dead components `DebateTree` / `DebateOutline` / `ArgumentFocusView`.

---

## Slice S6 — Unsqueeze library forms settings admin routes

### Goal

Fix flex-squeeze "Japanese column" layout on library cards and stack form/settings rows for small screens. Apply `.screenInner` padding tiers and verify AuthGate states through all three protected route shells without changing AuthGate semantics unless ticket-time contract expansion is approved.

### File contract

| | Paths |
|---|---|
| **Allowed to edit** | `app/page.tsx`; `app/new/page.tsx`; `app/settings/page.tsx`; `app/admin/workers/page.tsx`; `styles/forms.css`; `styles/library.css`; `components/LibraryComposer.tsx`; **new tests only under** `tests/s6-library/**` |
| **Read-only** | `components/AuthGate.tsx` (expected unchanged; screens covered by `.screenInner` foundation — if edits prove necessary, add it to this contract at ticket time) |
| **Forbidden** | all_others |
| **Verification** | §5.4 squeeze metric + model-row clipping; `pnpm test:src`; smoke subset |

### Dependencies

- HERMES-approved first: **S1b**.
- Parallel with: S3, S4, S5, S7.

### RED-first obligations

1. **Headline RED:** §5.4 flex-squeeze metric on `/` at 320/375 (fails today).
2. `.modelRow` clipping assertions (§5.3) — every `.capInput` / `.switch` has non-clipped bounding box inside `.modelTable` at 320/375 (fails today).

### Acceptance checks

- [ ] §5.4 GREEN at widths **320 and 375** on fixture ordinary English: no mid-word break on `.debateCardClaim` (and covered claim selectors on thread/split/canvas when exercised by this slice's surfaces on `/`); content box ≥12ch. Residual: pathological tokens may still mid-break via `overflow-wrap: anywhere` by design.
- [ ] `.debateCard` wraps meta/pill row under the claim at **≤768** (not only ≤640).
- [ ] `.optionRow` / `.modelRow` stacked (label above control) at ≤640.
- [ ] `.screenInner` padding `52px 28px` → `32px 16px` at ≤640.
- [ ] Model-table controls non-clipped at 320/375.
- [ ] AuthGate states exercised through all three shells: `app/new/page.tsx`, `app/settings/page.tsx`, `app/admin/workers/page.tsx` (checking / locked / invalid-token / submitting per §5.7).
- [ ] Admin metrics layout checked; per-slice gate green.

### Worktree lane

- Lane id: `resp-s6`
- Branch: `lane/resp-s6`

### Risk-tier suggestion

**low** — well-bounded CSS/stacking across four simple routes, with the mission's clearest before/after metric as its gate.

### Codex-readiness note

Do **not** remove `overflow-wrap: anywhere` — the fix is removing fixed-width flex reservations so `anywhere` never fires on ordinary English. Card wrap threshold is **≤768**, not ≤640. Page-level `scrollWidth <= innerWidth` alone is insufficient (§5.3) — assert component geometry. Keep AuthGate read-only unless ticket expands the contract.

---

## Slice S7 — Clamp overlays drawers toast and token dock

### Goal

Make fixed chrome safe on small viewports: viewport-clamp ChallengePopover, full-screen drawers with safe-area padding, relocate toast to top-center at ≤640, and enforce tokenDock expanded/collapsed caps via collision-map variables only. Own the toast ∩ (dock ∪ zoom) empty assertion at ≤640.

### File contract

| | Paths |
|---|---|
| **Allowed to edit** | `components/ChallengePopover.tsx`; `components/NodeDetailDrawer.tsx`; `components/GuideModal.tsx`; `components/Toast.tsx` (if DOM change needed); `styles/drawers.css`; `styles/overlays.css`; **new tests only under** `tests/s7-overlays/**` |
| **Read-only** | collision variables (consume only); `DebatePageClient.tsx` (dock **mount** is S3's file; S7 styles it via `styles/*`) |
| **Forbidden** | all_others; redefining collision variables; `DebatePageClient.tsx` edits |
| **Verification** | Own REDs + collision asserts; `pnpm test:src`; smoke subset |

### Dependencies

- HERMES-approved first: **S1b**.
- Parallel with: S3, S4, S5, S6.

### RED-first obligations

1. Popover clipping at 320/375 (fails today, §2.5).
2. Toast/dock band intersection at ≤640 (fails today, legacy `left:14/right:14/bottom:76` toast band).

### Acceptance checks

- [ ] ChallengePopover fully within viewport at 320/375 (no off-screen clip).
- [ ] Drawers: full-screen `width: 100%` with safe-area padding on small screens.
- [ ] Toast relocates to **top-center under chrome** at ≤640; ≥640 keeps current position.
- [ ] tokenDock: expanded height ≤ `--dock-max-h` (96px) with internal overflow; collapsed button cap `--dock-collapsed-w` (168px) + ellipsis; positioned with `--dock-offset-b`.
- [ ] Collision: toast ∩ (dock ∪ zoom) = ∅ at ≤640.
- [ ] Uses collision-map variables only — no invented offsets.
- [ ] Per-slice gate green.

### Worktree lane

- Lane id: `resp-s7`
- Branch: `lane/resp-s7`

### Risk-tier suggestion

**medium** — fixed-position chrome with cross-slice collision guarantees; geometry is variable-driven and slice-gated, but errors surface as overlap regressions in other slices' territory.

### Codex-readiness note

Style the dock via CSS variables and `styles/*` — do **not** edit `DebatePageClient.tsx` even though the dock mounts there. Do not redefine `--dock-*` / `--zoom-cluster-*` / z-index tokens (S1b owns them). Expanded dock cap is a hard guarantee via `max-height` + internal scroll, not live ResizeObserver measurement. Toast must leave the bottom band at ≤640 or it intersects zoom/dock by construction.

---

## Slice S8 — Produce full-matrix evidence and closure QA

### Goal

Produce the complete evidence bundle for C8/H9: browser-floor rendering gates (or formal residuals), **pinch hard gates with no residual path**, full width/height matrix including short-height cells, §5.7 route×state acceptance matrix, collision-assertion union, agent-browser product-truth runs, and real-device checks (non-zero safe-area on notched hardware; iOS dynamic-toolbar jitter checklist). Defects found here route back as rework to the owning slice — no product-code fixes in S8.

### File contract

| | Paths |
|---|---|
| **Allowed to edit** | `tests/**` under `apps/dialectical-engine/web`; `.hermes/reports/responsive-ui-20260724/**` |
| **Read-only** | all product code |
| **Forbidden** | all_others; product-code edits (rework returns to owning slice) |
| **Verification** | Full §5.6 S8 gate: `pnpm test:e2e:full` (and related matrix runners); real-browser / real-device checklists; pinch evidence paths; collision union at every matrix cell |

### Dependencies

- HERMES-approved first: **S3, S4, S5, S6, S7** (all complete).

### RED-first obligations

- **None** — evidence stage; runs and extends assertions; does not change behavior.

### Acceptance checks

- [ ] S8 report enumerates every §5.5 **rendering** row with verdict `{proven | residual+reason}` (named acquisition paths for Safari/iOS/Android).
- [ ] S8 report enumerates every §5.5 **pinch** row with verdict `{proven | BLOCKED-escalated}` — **no residual column**; failure or unobtainable device access → mission BLOCKER escalate to V.
- [ ] Full matrix green: chromium+firefox+webkit × `{320, 375, 768, 1024, 1440, 2560}` **plus** short-height `{844×390, 568×320, 507×1024}` + device profiles (custom 320×568, iPhone 12, Pixel 7, iPad, desktop).
- [ ] Collision-assertion union green at every cell (S4 zoom∩dock, S5 tab∩(dock∪zoom)+`:has` hide, S7 toast∩(dock∪zoom)).
- [ ] §5.7 route × state matrix covered (library, new, settings, admin/workers, AuthGate through three shells, debate views × zoom bands × overlays).
- [ ] Real-device: computed non-zero `env(safe-area-inset-*)` on notched hardware; iOS dynamic-toolbar jitter checklist.
- [ ] Agent-browser product-truth bundle attached.
- [ ] Emulation never presented as product truth for pinch; synthetic tests remain "handler contract" only.

### Worktree lane

- Lane id: `resp-s8`
- Branch: `lane/resp-s8`

### Risk-tier suggestion

**medium** — no product-code risk, but carries evidence-acquisition risk (iOS/macOS device access) and authority to BLOCK the mission on pinch failure.

### Codex-readiness note

Do not "fix" product bugs in this lane — file rework to the owning slice. Pinch has **no residual waiver**; buttons-only is never satisfaction of the V hard-pinch ruling. Desktop Safari / iOS acquisition order is fixed: (1) V-provided hardware, (2) cloud real-browser if V approves spend, (3) for **rendering only** formal BLOCKED residual with WebKit approximation — pinch cannot take path (3). Computed safe-area non-zero is an S8 real-device gate, not something S1b CI was allowed to fake.

---

## Appendix — Slicing notes

Integrity rule: slicing, not redesigning. Notes below record ticket-time gaps or readings chosen from FinalPlan §3 when §6 is under-specified. No invented design.

1. **S1b section-file enumeration.** FinalPlan §6 S1b allows "`styles/base.css` (+ the specific section files whose rules change, enumerated at ticket time)" without listing those section files. **Reading:** bound the ticket to §3.1 foundation rules only (viewport/shell/dvh/clearance, `text-size-adjust`, drawer `100%`, collision variables, breakpoint tokens, fluid type, 16px form floor). Prefer placing shared tokens and shell rules in `styles/base.css` when S1a's partition allows; if a foundation rule already lives in a section file after S1a, S1b may edit that file for that rule only. Do not pull S3–S7 feature work into S1b.

2. **S3 optional `OverflowMenu.tsx`.** FinalPlan says "possibly new `components/OverflowMenu.tsx`". **Reading:** implementer may colocate overflow UI in `DebatePageClient.tsx` within the allowed region or extract the component; both stay inside S3's contract. Not a design open.

3. **S6 AuthGate contingency.** FinalPlan marks `AuthGate.tsx` read-only with "if edits prove necessary, add it to this contract at ticket time". **Reading:** default ship is zero AuthGate edits; expanding the allowed list requires Hermes ticket amendment, not silent lane expansion.

4. **Legacy test ownership after S1a.** FinalPlan: "Legacy test files belong to the slice that owns the product file they read." S1a migrates the 5 CSS-reading tests to the loader; later S3 owns further rewrites of `headerToolbarResilience` (and incidental DebatePageClient consumers); S4 owns DebateCanvas-related tests. Sequential ownership handoff, not a parallel overlap.

5. **Parallel new-test roots (H5 rework 1).** FinalPlan §6 says only "own test files" for S3–S7. **Binding chosen by this deck (not a redesign of product scope):** exclusive directories `tests/s3-chrome/**`, `tests/s4-canvas/**`, `tests/s5-reading/**`, `tests/s6-library/**`, `tests/s7-overlays/**` — listed in each Allowed contract and in the ownership matrix so parallel disjointness is path-provable. S1b uses `tests/s1b-foundation/**` (serial). S2 harness scaffolding must not claim the five reserved roots; S8 may extend other `tests/**` for matrix evidence after fan-in.

**Slicing notes count: 5** (ticket-time clarifications; zero SLICING DEFECTs on parallel product/style/new-test ownership).
