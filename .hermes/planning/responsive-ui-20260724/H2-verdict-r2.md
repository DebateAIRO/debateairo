HERMES STAGE REVIEW CHANGES REQUESTED

- mission/step: responsive-ui-20260724 / H2 re-review
- artifact reviewed: `.hermes/planning/responsive-ui-20260724/Plan.md` (REWORK ROUND 1)
- independence boundary: round-1 `H2-verdict.md`, revised `Plan.md`, intake, and product code/tests only; no independent-reviewer or G3/Grok artifact was read.

## Per-finding disposition

1. **RESOLVED — RED ordering.** The new order is `S1a → S2 → S1b → {S3…S7}` (`Plan.md:200-204,258-268`). S1a is now expressly limited to selector/value/order-preserving CSS partition plus migration of the five verified CSS-reading tests, with all 43 existing `node:test` files and build/CSS equivalence as gates (`:202,260`). Product checks confirm 14 `*.test.mjs` + 29 `*.source-test.mjs`, exactly five direct `globals.css` readers, and no current vitest/Playwright dependencies (`web/package.json:5-20`). This genuinely removes behavioral responsive work from the pre-harness slice. A separate new contradiction in what S2 itself lands is reported as NEW-1 below.

2. **RESOLVED — honest RED evidence.** The revision withdraws document-scroll width as sufficient evidence and specifies component-level Playwright checks for clipping, control visibility/clickability, per-container overflow, tap size, mobile synthesis reachability, and real layout geometry (`Plan.md:206-217`). It correctly moves the transform/measurement proof to Playwright and keeps synthetic gesture tests labelled as handler-contract evidence only. The factual premises hold: `.screen` is an internal overflow container (`globals.css:511-515`), `.modelTable` clips (`:842-845`), and the canvas measures `offsetHeight` (`DebateCanvas.tsx:94-109`). The §d.4 probe also tests actual unbroken-token overflow after neutralizing `overflow-wrap:anywhere`, rather than relying only on page width (`Plan.md:219-221`).

3. **NOT RESOLVED — binding pinch support is still weakened to an attempt/residual.** The state machine, focal formula, pointer-cancellation cleanup, and no-silent-UA-disable language are material improvements (`Plan.md:131-137`). But the revised hierarchy still declares buttons alone sufficient for the floor, allows a browser never to enter `pinching`, and sends failed floor-browser pinch to H9 as a residual (`:120-123,136-137,228-232,278`). That is the same substantive escape hatch rejected in round 1: V asked for application-native mobile tree zoom, with pinch explicitly treated by the rework as in-scope, yet the plan does not make successful pinch a completion condition. Moreover, `touch-action: pan-x pan-y` intentionally preserves native pan (`:133`), so the browser may cancel the first pointer for panning before a second pointer can establish the proposed two-pointer state; cleanup makes failure safe but does not make pinch work. A proven platform impossibility may justify a formally blocked decision from V, not a plan-level declaration that buttons satisfy the pinch contract.

4. **RESOLVED — browser-floor evidence gate.** §d.5 now enumerates latest desktop Safari, real iOS Safari, and real Android Chrome with named hardware/cloud paths and explicitly labels emulation/WebKit as approximation (`Plan.md:223-232`). If real evidence cannot be acquired, the plan calls for a formal BLOCKED residual at H9 rather than a silent/best-effort pass. This meets the requested evidence-or-blocked procedure.

5. **WEAKENED — route/state matrix added, but “ALL screens” is still incomplete.** §d.7 now names all five routes, all six widths, the four debate views, lifecycle states, zoom states, scoring states, and overlays (`Plan.md:240-252`), so the original gap is substantially reduced. However, `/new`, `/settings`, and `/admin/workers` are all wrapped in `AuthGate` (`app/new/page.tsx:17-21`; `app/settings/page.tsx:43-45`; `app/admin/workers/page.tsx:9-10`), whose checking, locked, invalid-token, and submitting/error screens are distinct rendered states (`components/AuthGate.tsx:13-35,55-104`); none appears in the matrix. The plan also declares landscape phones and split-view in scope (`Plan.md:289`) while the acceptance matrix varies width only and the listed device profiles do not require a landscape/short-height cell (`:238,242`). See NEW-4.

6. **RESOLVED — flag invariant.** The byte-identical whole-DOM claim is withdrawn. The replacement correctly preserves flag-conditional verdict-first semantics and missing-score honesty while allowing flag-independent responsive wrappers/chrome (`Plan.md:185-190`). Product code supports the revised boundary: the original comment governs additive low-strength dimming (`DebateCanvas.tsx:22-26,223-237`), while the page separately gates `VerdictBanner` and verdict-gate data (`DebatePageClient.tsx:1032-1033,1185-1188`).

7. **RESOLVED — CSS inventory wording.** The audit now says sizing is “predominantly” fixed and explicitly inventories existing `min()`, `clamp()`, `calc()`, and `minmax()` uses (`Plan.md:16-20`). This removes the false universal claim while retaining the verified three-media-block/zero-container-query facts.

## New findings introduced or exposed by the rework

### NEW-1 — HIGH — S2’s committed RED set contradicts the slice gates and parallel plan

- **Evidence:** `Plan.md:203` says S2 first writes S1b’s failing browser assertions. S2 is then defined to include the RED assertion set for **S1b and S3–S7** (`:261`), while its gate is described as “green/RED-as-expected” (`:236`). Yet every later slice must have `test:src` and the smoke subset green (`:237`), and S3–S7 are intended to run in parallel (`:258,270`).
- **Defect:** If S2 lands honest failing tests for all unimplemented behavioral slices, there is no green post-S2 baseline; each parallel slice remains red because the other slices’ product changes do not exist. If those tests are skipped or made green, they are not the promised RED vehicles.
- **Required correction:** S2 should install/configure the runners with green harness self-tests only. Each behavioral slice, including S1b, should add and demonstrate its own targeted RED immediately before its implementation, then return the shared suite to green. Do not commit cross-slice expected failures into S2.

### NEW-2 — HIGH — “Fit” cannot fit the current tree under the specified 0.5 minimum

- **Evidence:** The product layout width is `408 + 404 × depth` from `CARD_W=320`, `COL=404`, and `PADX=44` (`lib/debatePresentation.ts:122-126,205-207,269-276`). The proposed policy is `clamp(clientWidth / layout.width, 0.5, 1)` and is called “fit-width” (`Plan.md:139-143,152`). A depth-3 tree is 1,620px: at 320px the true fit is 0.198, but the plan clamps to 0.5 and renders 810px, 490px wider than the viewport. A depth-5 tree is 2,428px and renders 1,214px at the clamp, 894px wider than 320px.
- **Defect:** The named Fit control and “fit-width default” contract are factually false for ordinary supported tree depths, including the phone case that motivated the mission.
- **Required correction:** Define a truthful fit policy: either permit the computed fit zoom (with an explicit readability floor and UX treatment), fit a bounded subtree/visible depth, or rename the action and acceptance contract to describe partial zoom plus pan. Also specify actual global min/max zoom bounds; the matrix names min/max but the design does not define them.

### NEW-3 — MEDIUM — the chrome collision map does not reserve disjoint rectangles

- **Evidence:** The map puts the token dock at `18px + safe-area`, the zoom cluster at only 52px above that, and the toast at `76px + safe-area` (`Plan.md:162-176`). Current phone toast CSS spans from `left:14px` to `right:14px` at `bottom:76px` (`globals.css:2633-2639`), while the planned zoom cluster contains four controls, each at least 44px (`Plan.md:121,145`). The token dock can also expand from one button to a wrapped unlock form (`DebatePageClient.tsx:1273-1301`). Z-index ordering does not prevent physical overlap.
- **Defect:** The proposed variables coordinate anchor points, not occupied rectangles or expanded states; the toast and zoom cluster are assigned the same bottom band. Deferring the first overlap assertion to S8 allows independently green S4/S7 slices to integrate into a known collision.
- **Required correction:** Specify cluster orientation/dimensions and mutually exclusive horizontal/vertical reserved regions for collapsed and expanded dock states, toast, synthesis sheet, and zoom controls. Put a focused collision test in the owning slice gates as well as S8.

### NEW-4 — MEDIUM — short-height and authentication screens are outside the claimed acceptance closure

- **Evidence:** §f explicitly keeps landscape phones and tablet split-view/Slide Over in scope (`Plan.md:289`), but §d.7 defines cells only by width (`:240-252`), and §d.6 lists device profiles without a required landscape/short-height run (`:238`). Bottom sheets, two-row chrome, internal scrollers, fixed toast/dock, and safe-area padding are height-sensitive. Separately, the three protected routes expose AuthGate checking/locked/invalid/submitting screens (`components/AuthGate.tsx:13-35,55-104`), omitted from §d.7.
- **Required correction:** Add at least representative phone-landscape and tablet split-view dimensions (width × height, not width alone), and add AuthGate states for every protected route or a shared AuthGate acceptance row that is exercised through all three route shells.

- REWORK ROUND: 1 of 3
- comments read through: not ticketed (pre-board stage)
