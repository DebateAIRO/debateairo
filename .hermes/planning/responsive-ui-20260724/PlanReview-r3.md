G3 CHANGES REQUESTED

Scoped re-review (REWORK ROUND 2) of redesigned gesture/zoom material in Plan.md.
Prior artifacts retained (append-only): `PlanReview.md`, `PlanReview-r2.md`.
Scope only: §b.2 redesign, truthful zoom model, §d.5 pinch hard gates vs rendering residuals, G3-r2 minors #14–16.
Round-1 finding #3 (buttons binding / pinch best-effort) is **superseded by V’s hard-pinch ruling** and is not re-litigated; this review attacks the **new** delivery design.
Independence: H2-verdict*, Hermes review outputs not read. Product spot-checks under `apps/dialectical-engine/web`.

---

## Scope judgments

### 1. §b.2 redesign — credibility of hard iOS/Android/trackpad pinch

**What improved (sound):**
- Abandoning `touch-action: pan-x pan-y` arbitration (Plan.md:126–127) is correct; that path was the weak link in r1.
- **Canvas-only** `touch-action: none` (Plan.md:127) is a credible Chromium multi-pointer delivery pattern and keeps page-level pinch/zoom/scroll **outside** the canvas (WCAG line preserved; no `user-scalable=no`).
- **iOS/macOS Safari via `gesturestart` / `gesturechange` / `gestureend` + `event.scale`** (Plan.md:130) is a real, long-shipped WebKit path used by map/canvas apps; feature-detect + disable PE two-pointer when active avoids double-handling. This is substantially more credible as a **hard** iOS gate than PE-only.
- Tier-3 two-`touchmove` backstop under the same `touch-action: none` (Plan.md:131) is coherent defense-in-depth; “buttons-only ≠ pinch satisfaction” matches V’s ruling.
- Custom pan writes `scrollLeft`/`scrollTop` on `.canvas { overflow: auto }` (Plan.md:128, 138; product `globals.css:1267-1275`) keeps one scroll geometry for native wheel/scrollbar/keyboard (desktop) and touch drag — good.
- Momentum/rubber-band loss is **honestly** accepted as non-goal (Plan.md:128, §f:325) — not hidden.
- Sticky-outside-transform invariant preserved (Plan.md:140; product sibling before `.canvasInner` at `DebateCanvas.tsx:122-148`) — custom pan does not introduce a transformed ancestor of the sticky toggle.
- Measure loop still reads `offsetHeight` (Plan.md:142; `DebateCanvas.tsx:101`) — scale transform on `.canvasInner` alone does not, by itself, corrupt measurement.

**What breaks under adversarial attack (defects below):**
- Overview simplification × measure loop (Finding A).
- No pan/tap/zoom-to-card/open-node intent model under custom pan (Finding B).
- GestureEvent `preventDefault` requires non-passive native listeners; plan under-specifies registration (Finding C — major only as completeness for a hard gate).

**Custom pan tradeoffs:** momentum loss is acceptable given V’s pinch primacy. Keyboard/wheel/scrollbar paths remain — a11y floor for non-gesture users is buttons (§b.2:123) + page zoom outside canvas. No defect there.

---

### 2. Truthful zoom model — sound and honest?

**Arithmetic verified against product** (`lib/debatePresentation.ts:122-126, 206, 272-276`: `width = max(x+CARD_W)+PADX` with `x = PADX + depth*COL` ⇒ `408 + 404×depth`):

| Depth | Width (px) | Fit @320 | Plan claim |
|------:|-----------:|---------:|---|
| 3 | 1620 | 0.198 | Plan.md:146 ✓ |
| 5 | 2428 | 0.132 | ✓ |
| 6 | 2832 | 0.113 | ✓ within ZOOM_MIN 0.1 |
| col-fit | 320/(320+48) | **0.870** | ≈0.87 @320 ✓ |

**Honest parts:** `ZOOM_MIN=0.1` / `READABLE_ZOOM=0.5` / `ZOOM_MAX=2.0`; Fit = **computed** overview (not fake-clamped to 0.5); overview as navigation mode with simplified chrome + zoom-to-card; mobile **column-fit** default readable; depth-6 boundary stated. This repairs the untruthful “fit floor 0.5” design.

**Not yet sound:** overview “hide claim text and controls via CSS” is unspecified relative to the live `offsetHeight` measure loop — see Finding A. Until that is pinned, the zoom model is only half-honest.

---

### 3. §d.5 pinch hard gates vs rendering residuals

**Consistent with V ruling and internally coherent:**
- Rendering table (Plan.md:247–254) keeps formal residual paths for Safari/iOS/Android when hardware is missing — unchanged posture.
- Pinch table (Plan.md:256–263) has **no residual column**; unobtainable device or platform failure = **BLOCKER → V**; buttons never substitute.
- S8 report split `{proven|BLOCKED-escalated}` for pinch vs `{proven|residual}` for rendering (Plan.md:265) is the right dual ledger.
- Fleet Windows-only constraint is handled as process (escalate), not as silent waiver — appropriate for a hard requirements change.

**No consistency defect.** Pinch-hard + rendering-soft is intentional, not contradictory.

---

### 4. Minors #14–16 dispositions

| Minor | Disposition in Plan.md | Judgment |
|-------|------------------------|----------|
| #14 safe-area S1b GREEN | Structural asserts only; non-zero inset = S8 real-device/rendering residual (§d.2:225, §e S1b, §g) | **sane** |
| #15 S3 DPC surface | Widened to header + scoring-status presentation `:962-1090` as JSX move (§e S3, §g) | **sane** |
| #16 dock expansion | `--dock-max-h: 96px` hard cap; zoom offset above expanded dock; toast moved top-center ≤640 (§b.4, §g) | **sane** |

---

## Findings (this scoped round)

### A. [major] Overview simplified-card CSS can collapse measured heights and reflow the tree

**Evidence**
- Plan.md:146: below `READABLE_ZOOM`, `data-zoom-band="overview"` and “claim text and controls **hidden via CSS**”; role-colored blocks + connectors remain.
- Product measure loop (`DebateCanvas.tsx:95-109`, read at `:101`) always remeasures `el.offsetHeight` and feeds `layoutTree` — there is no freeze/guard for zoom band.
- Layout positions depend on measured heights (`debatePresentation.ts:206-214` vertical packing). If overview CSS uses `display:none` / removes content that currently contributes to height, cards shrink → tree reflows mid-overview → connectors/positions jump → zoom-to-card focal math aims at wrong geometry; Fit arithmetic using `layout.width` is width-stable, but **height** and per-card `y` are not.

**Why this blocks PASS:** the plan’s own measurement invariant (Plan.md:142) assumes transform-only scaling is safe; overview mode is a **second, layout-affecting** channel the invariant does not cover. That is a genuine design hole, not polish.

**Exact modification required**
In §b.2 overview treatment, hard-pin **one** of:
1. **Layout-stable simplification only**: hide claim/controls with techniques that do **not** change used layout size (`visibility`/`opacity`/`content-visibility` with reserved min-height, or clip within fixed card chrome), **and** assert in S4 Playwright that `offsetHeight` of each card is unchanged when toggling `data-zoom-band`; **or**
2. **Measure freeze**: while `zoom < READABLE_ZOOM` (or `data-zoom-band="overview"`), the measure loop must not write new heights (use last readable-band heights / `estimateHeight` only); unit + Playwright pin this.
3. Explicitly forbid `display:none` on height-contributing card children in overview CSS.

---

### B. [major] No pointer-intent model under custom pan — pan vs tap vs zoom-to-card vs `openNode` collide

**Evidence**
- Custom pan: single-pointer drag updates scroll (Plan.md:128, 134–135).
- Overview: “tapping/clicking a card zooms to it at 1.0” (Plan.md:146).
- Product cards already use `onClick={openIfDone}` → `onOpenNode` (`DebateCanvas.tsx:262-280`) plus multiple control `onClick`s (challenge/regen/expand ~:391+).
- Capability parity invariant (Plan.md:210): challenge, expand/read, open remain required on phones.
- Plan never specifies: drag threshold; click suppression after pan; whether overview first activation is zoom-to-card only; how challenge/regen remain reachable in overview (controls are **hidden**); second tap after zoom-to-1.0 restores full handlers.

**Why this blocks PASS:** with `touch-action: none` + synthetic pan, every finger movement risks swallowing clicks; overview hides the very controls parity requires. Without an explicit intent matrix, S4 implementers will ship either broken pan, broken open, or broken zoom-to-card — all three are in the V-facing contract.

**Exact modification required**
Add a **pointer-intent subsection** to §b.2 (and S4 acceptance):
1. Pan starts only after movement ≥ N px (e.g. 8–10); below threshold, pointerup is a tap.
2. In `data-zoom-band="overview"`: tap on a card = zoom-to-card at 1.0 (focal-preserving); card chrome actions (open/challenge/regen) are deferred until zoom ≥ `READABLE_ZOOM` (or until after zoom-to-card lands) — state this as the parity path, not removal.
3. Outside overview: existing card `onClick` / controls behave as today; pan must not fire `click` after a drag (`preventDefault`/`stopPropagation` or a `didPan` guard).
4. Sticky set-aside toggle and zoom cluster: pointer targets excluded from pan initiation (hit-test / `closest` guard).
5. Unit/handler-contract tests for threshold + overview tap path; Playwright smoke for “drag pans without opening drawer” and “overview tap zooms then open works at 1.0”.

---

### C. [major] Hard iOS path under-specifies non-passive GestureEvent registration (and React binding)

**Evidence**
- Plan.md:130 requires `preventDefault()` on `gesturestart`/`gesturechange` to suppress Safari page zoom for canvas-originated pinches — this is necessary for the hard gate’s “page chrome does NOT zoom during canvas pinch” criterion (§d.5:260).
- On modern browsers, `preventDefault()` on touch/gesture streams is a no-op unless the listener is registered with **`{ passive: false }`**. React’s prop system does not expose `onGestureStart` and defaults many touch listeners to passive.
- Plan does not mandate `addEventListener(..., { passive: false })` on the canvas ref (or equivalent), nor that the PE `wheel` path (already non-passive in text) is mirrored for GestureEvents/tier-3 `touchmove`.

**Why this is major (not polish) under a hard pinch gate:** if S4 attaches passive listeners, iOS will page-zoom the whole UI during canvas pinch — exactly the S8 failure mode that escalates to V as BLOCKER. Specifying registration is part of making the redesign *credible*, not ticket-level trivia.

**Exact modification required**
In §b.2 / §e S4: require native `canvasEl.addEventListener("gesturestart"|"gesturechange"|"gestureend"|"touchmove", handler, { passive: false })` (and matching remove on cleanup); document that React synthetic gesture props are not used; handler-contract test that the bound options object includes `passive: false` (or integration test that `preventDefault` is invoked on a synthetic cancelable GestureEvent).

---

### D. [minor] Sticky set-aside lives *inside* the `touch-action: none` canvas

**Evidence:** sticky label is a child of `.canvas` (`DebateCanvas.tsx:122-147`), so it inherits canvas touch-action suppression. Checkbox taps still synthesize clicks; no structural sticky/transform conflict.

**Disposition:** acceptable if Finding B’s hit-test guard includes the sticky control. Not independently blocking.

---

## What is explicitly *not* a defect this round

- V supersession of r1 #3 / r2 buttons-as-floor — accepted; redesign direction is right.
- GestureEvent as primary iOS mechanism — **credible** if Findings A–C are closed.
- Chromium PE two-pointer under `touch-action: none` — standard and sound.
- Custom pan momentum loss — honestly non-goal.
- Zoom arithmetic / ZOOM_MIN / column-fit / depth-6 boundary — verified sound.
- §d.5 dual table (pinch hard / rendering residual) — consistent.
- Minors #14–16 — sane dispositions.
- Sticky-outside-transform + transform-only scale — still correct for the scale channel.

---

## Verdict rationale

The redesign **correctly answers** the old PE-arbitration failure mode and raises a **plausible** hard path for iOS (GestureEvents) and Chromium (PE + `touch-action: none`). Zoom bounds honesty is a real upgrade.

However, three **major** gaps remain in the material that changed: overview simplification vs the live measure loop; missing pan/tap/zoom-to-card/open intent under custom pan; and non-passive GestureEvent binding required for the hard gate’s preventDefault semantics. These are genuine design defects that would freeze S4/S8 into rework or false BLOCKERs — not polish.

Therefore: **G3 CHANGES REQUESTED** (scoped). Prior PASS on unscoped material stands; only this surface needs another Plan.md pass.

---

## What would change my verdict

1. §b.2 pins layout-stable overview **or** measure freeze (Finding A) with an S4 test.
2. §b.2 adds the pointer-intent matrix for pan / overview zoom-to-card / open / controls / sticky (Finding B).
3. §b.2/S4 mandates non-passive native GestureEvent (and tier-3 touchmove) registration (Finding C).

Minors alone would not block PASS.

---

mission/step: responsive-ui-20260724 / G3-r3 (scoped)  
artifacts retained: PlanReview.md, PlanReview-r2.md  
artifact reviewed: Plan.md REWORK ROUND 2 (§b.2, zoom model, §d.5, minors 14–16)  
REWORK ROUND: 2 of 3  
comments read through: not ticketed (pre-board stage)
