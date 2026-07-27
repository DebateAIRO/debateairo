G3 PASS

Scoped verification (ROUND 4) of Plan.md closures for G3-r3 findings A–D, plus adversarial pass on r4-only intersections (TouchEvent centroid; `:has(.tokenForm)` mutual-exclusion).
Prior artifacts retained append-only: `PlanReview.md`, `PlanReview-r2.md`, `PlanReview-r3.md`.
Independence: H2-verdict* / Hermes review outputs not read.
Product spot-checks: `DebateCanvas.tsx` measure/sticky/`openIfDone`, `DebatePageClient.tsx` `.tokenForm` conditional mount, `debatePresentation.ts` height packing (cited by plan).

Stagnation law: material plan change present; PASS if closures hold without inventing polish freezes.

---

## Per-closure disposition (A–D)

### A — Overview vs measure loop → **closed**

**Plan closure (Plan.md:162, §e S4):**
- Single pinned mechanism: **layout-stable hiding** (`visibility: hidden` / `opacity: 0` / clip inside fixed chrome).
- **`display: none` and any used-size-changing property FORBIDDEN** on height-contributing card children in overview CSS.
- Measure-freeze alternative considered and rejected (one invariant preferred).
- S4 Playwright: every card’s `offsetHeight` unchanged when `data-zoom-band` toggles overview ↔ normal.

**Product truth the pin addresses:** live measure loop always remeasures `offsetHeight` (`DebateCanvas.tsx:95-109`) and feeds vertical packing (`debatePresentation.ts:206-214`). A used-size change mid-overview would reflow the tree and break focal math — that was the r3 hole.

**Does it genuinely close the reflow hole?** **Yes.** Size-preserving hide techniques do not alter used box size; the explicit ban on used-size-changing properties covers the broader class beyond `display:none`; the Playwright pin is the right browser-level proof (not jsdom). Residual implementer risk (accidental `line-clamp`/`max-height` that still changes height) is enforcement via the stated forbid + the height assertion — not an open design hole.

---

### B — Pointer-intent matrix → **closed**

**Plan closure (Plan.md:142-151, §e S4):**

| Required from r3 | Present |
|---|---|
| 8px drag threshold | Plan.md:147 ✓ |
| Capture-phase `didPan` click suppression | Plan.md:148 ✓ |
| `closest()` exclusion: sticky / zoom cluster / card controls | Plan.md:146 (sticky label, zoom cluster, `.nodeCtrl`, `.scoreBadgeButton`, `input`, `button`, `a`) ✓ |
| Overview tap = focal-preserving zoom-to-card at 1.0 (not open) | Plan.md:147, 151 ✓ |
| Controls deferred, not removed (two-step parity) | Plan.md:151 ✓ |
| Playwright smokes: drag without open; overview zoom then open | Plan.md:151 ✓ |

**Product alignment:** cards use `onClick={openIfDone}` on `.node` (`DebateCanvas.tsx:262-280`); controls have separate `onClick`s; sticky is inside `.canvas` (`:122-147`). The matrix preserves those paths outside overview and re-enables them after zoom-to-card.

**Matrix completeness:** pan / tap / pinch-promotion / overview first-activation / post-zoom open are covered. Interactive-target exclusion prevents pan from eating sticky and control taps (Finding D). No remaining hole that would re-open B as a design defect. (Implementation still needs careful overview interception of the React `onClick` path when zooming — the plan’s capture-phase + threshold rules are a complete enough contract for S4.)

---

### C — Non-passive registration → **closed**

**Plan closure (Plan.md:133-134, §e S4):**
- Native `canvasEl.addEventListener(..., { passive: false })` for `gesturestart` | `gesturechange` | `gestureend` | `touchstart` | `touchmove` (+ non-passive `wheel`).
- Matching `removeEventListener` on unmount.
- React synthetic props **explicitly not used** for zoom-critical streams (no `onGesture*` / default-passive touch props).
- Handler-contract tests: `preventDefault` on cancelable synthetic gesture/touch events; non-passive registration assertable.

**Sufficient for the hard iOS gate at plan level?** **Yes.** Without non-passive binding, `preventDefault` is inert and Safari page-zooms — the exact §d.5 failure mode. Specifying native registration + cleanup + tests is the necessary design contract; real-device S8 still proves delivery (already required by V hard-pinch table). No remaining C-class design gap.

---

### D — Sticky inside `touch-action: none` canvas → **closed**

**Plan closure (Plan.md:146):** `pointerdown` on sticky set-aside toggle/label → pan **never initiated**; normal event flow (checkbox click synthesis) proceeds.

**Sane?** **Yes.** `touch-action: none` on `.canvas` does not block click synthesis for form controls; excluding pan initiation is exactly the right fix. Covered by the intent matrix, not a free-floating footnote.

---

## Fresh attack: r4-only intersections

### 1. Concurrent TouchEvent centroid during GestureEvent lifecycle (iOS)

**Plan claim (Plan.md:131-132):** `GestureEvent` has scale only (no points); focal `p` = midpoint of concurrent `touches[0..1]` from latest non-passive `touchstart`/`touchmove`; if touches unavailable (macOS trackpad), fall back to **canvas viewport center** (designed, not a bug); `gesturestart` sets `gestureOwner = "webkit"` and suspends PE so one mutator per frame.

**Attack:**
- On **real iOS multi-touch**, TouchEvents and GestureEvents co-fire; reading `event.touches` for a two-finger pinch is the standard map/canvas pattern and is **credible** for hard-gate zoom + reasonable focal preservation.
- Frame skew (gesturechange before the latest touchmove) may briefly use a stale midpoint or center — degrades focal quality, not zoom delivery; hard gate still met if scale updates and page chrome does not zoom.
- Trackpad center fallback is **honest** (no invented touch points).
- `gestureOwner` atomic PE suspend closes double-mutation risk between PE pinch and WebKit gesture paths.

**Disposition:** no new major/blocker. Credible for the hard iOS path; residual is quality-of-focal under edge timing, not plan falsehood.

### 2. CSS `:has(.tokenForm)` mutual-exclusion (synth tab vs expanded dock)

**Plan claim (Plan.md:212-216, §e S5):** collapsed synth tab bottom-LEFT; expanded dock full-width at 320 overlaps tab geometry → `.debateView:has(.tokenForm) [data-synth-tab] { visibility: hidden }`; `:has()` inside evergreen floor (Chrome 105+, Safari 15.4+, Firefox 121+); S5 asserts tab hidden while form open.

**Product:** `.tokenForm` mounts **only** while unlock form is open (`DebatePageClient.tsx:1279-1295`); collapsed unlock is a plain button (no `.tokenForm`); unlocked state is also not `.tokenForm`. Selector matches open-form state only.

**Attack:**
- **Evergreen floor:** mission floor is latest evergreen + mobile Safari/Chrome. Safari 15.4+ and current Chrome/Firefox all support `:has()`. Acceptable (same class of floor as `dvh` / existing oklch posture).
- **Both visible?** With form open → `:has(.tokenForm)` true → tab `visibility: hidden` → mutual exclusion holds. Collapsed dock (button only) → no `.tokenForm` → tab visible; geometry caps (`--dock-collapsed-w: 168px`) keep tab and collapsed dock disjoint at 320/568 (arithmetic stated Plan.md:215-216). Expanded **sheet** may overlay dock by design under scrim — separate, already allowed.
- `visibility: hidden` (not `display:none`) is fine for a fixed/positioned tab and matches collision tests.

**Disposition:** no genuine defect. Mutual-exclusion model is sound and product-aligned.

---

## Verdict rationale

All four r3 findings (A major, B major, C major, D minor) are **genuinely closed** with pinned mechanisms, product-grounded invariants, and S4/S5 tests. New r4 material (TouchEvent centroid + ownership handover; `:has(.tokenForm)` exclusion) survives adversarial review without raising a blocker/major under stagnation law.

**G3 PASS** (scoped). Prior reviews remain historical record; this file is the ROUND 4 closure verdict.

---

## Summary table

| Item | Disposition |
|------|-------------|
| A overview × measure | **closed** |
| B pointer-intent matrix | **closed** |
| C non-passive registration | **closed** |
| D sticky × touch-action none | **closed** |
| NEW TouchEvent centroid | sound / no defect |
| NEW `:has(.tokenForm)` | sound / no defect |
| NEW findings this round | **none** |

---

mission/step: responsive-ui-20260724 / G3-r4 (scoped)  
ROUND 4 (stagnation 0 of 3)  
comments read through: not ticketed (pre-board stage)
