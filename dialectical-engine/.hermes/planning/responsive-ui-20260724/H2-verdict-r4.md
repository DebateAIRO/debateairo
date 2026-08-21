HERMES STAGE REVIEW PASS

- mission/step: responsive-ui-20260724 / H2 scoped verification, round 4
- artifact reviewed: `.hermes/planning/responsive-ui-20260724/Plan.md` (REWORK ROUND 4, scoped)
- independence boundary: current `Plan.md`, prior Hermes verdict `H2-verdict-r3.md`, cited product source, arithmetic probe, and MDN/Can I Use compatibility data only; no `PlanReview*.md`, G3, or Grok artifact was read.

## Per-closure disposition

1. **NEW-5 — RESOLVED.** The iOS hard seam is now complete and internally truthful. The Safari path explicitly takes its focal point from the midpoint of the latest concurrent `TouchEvent.touches[0..1]`, converted to canvas-content coordinates, and defines canvas viewport center as the deliberate fallback for trackpad GestureEvents that have no touch coordinates (`Plan.md:130-131`). `gesturestart` performs one atomic ownership handover: releases captures, clears PE state, sets the single `gestureOwner = "webkit"` flag, and makes PE/tier-3 handlers no-ops until `gestureend`, establishing one mutator per frame (`Plan.md:132`). Zoom-critical gesture, touch, and wheel streams are native non-passive listeners with matching unmount cleanup; React synthetic handlers are expressly excluded (`Plan.md:133`). Named handler-contract classes cover pan→pinch promotion, mid-pan ownership handover and capture release, mutation exclusion until end, cancelable-event `preventDefault`, and non-passive registration (`Plan.md:134`, reinforced in S4 at `Plan.md:321`). Real-device iOS/macOS pinch remains a hard S8 `{proven / BLOCKED-escalated}` gate, so these synthetic tests are not overclaimed as browser-delivery proof (`Plan.md:279-288`).

   The pointer-intent contract is also complete: interactive descendants are excluded through `closest()` including the sticky set-aside label/input, zoom controls, and card controls; sub-8px motion remains a tap; motion at or above 8px becomes pan; a capture-phase `didPan` guard suppresses the synthesized click; a second pointer promotes pan to pinch; overview card activation focal-zooms to 1.0 first; and actions are deferred rather than removed, restoring full controls after that first activation (`Plan.md:142-151`). Current source confirms the sticky control is a `<label>` wrapping the checkbox and is a sibling before `.canvasInner` (`DebateCanvas.tsx:121-148`), matching the matrix's seam.

2. **NEW-6 — RESOLVED.** Independent arithmetic reproduces the claimed rectangles. At 320px, tab max width is `320 - 14 - 168 - 30 = 108`, hence x=14…122; the 168px right-18 dock is x=134…302, leaving 12px. At 568px, tab max width is 356, hence x=14…370; dock x=382…550, again leaving 12px. Existing global `box-sizing: border-box` makes those max-width outer-box calculations truthful (`globals.css:90-92`). The expanded dock is x=18…302 at 320 and x=190…550 at 568, but `.debateView:has(.tokenForm) [data-synth-tab]` hides the tab whenever the unlock form is open (`Plan.md:184-216`). Current source confirms `.tokenForm` exists only in the open dock branch and both it and the always-mounted `SynthesisPanel` are descendants of `.debateView` (`DebatePageClient.tsx:1178-1192,1273-1301`), so the selector covers every required width/height cell rather than one breakpoint. `:has()` clears the stated evergreen floor: support begins at Chrome/Edge 105, Safari/iOS Safari 15.4, and Firefox 121; MDN marks it Baseline/Widely available.

   Short-height coverage is explicit: at `max-height: 480px` the four ≥44px controls become a horizontal row; with bottom offset `18 + 96 + 12 = 126`, its stated 52px band is y=126…178, leaving 142px headroom even in the 568×320 cell and also fitting 844×390 (`Plan.md:218`). S4 tests both zoom orientations against the expanded dock; S5 tests tab versus collapsed dock/zoom and hidden-during-`.tokenForm`; S7 owns the collapsed cap; S8 repeats the union over the full matrix (`Plan.md:220,321-325`).

3. **Outside-scope spot-check — PASS.** The dual-reviewer-clean material sampled from untouched sections remains intact: the 43-file legacy suite and green-only S2 harness law (`Plan.md:71-79,240-249,317-318`); truthful overview/column-fit bounds and arithmetic (`Plan.md:159-165`); hard real-device pinch gates with no waiver (`Plan.md:268-288`); the three short-height cells and complete AuthGate state/route matrix (`Plan.md:290-309`); and the previously clean S1a/S1b/S3/S6/S7/S8 slice contracts (`Plan.md:317-320,323-325`). No collateral contradiction was found.

## New defects

- **None.** The round contains material corrective change, so the stagnation law does not freeze it and `CHANGES REQUESTED` is not warranted.

- ROUND: 4 (stagnation 0 of 3)
- comments read through: not ticketed (pre-board stage)
