# GUIDE_FOOTER_DIAG38 — saved footer evidence diagnosis

- Ticket: `t_5f09c1e8`
- Product revision: `0d34f82f4a2188d0ce1db04655b693798ffd2169`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Date: `2026-09-21`
- Verdict: `DIAGNOSED_SCREENSHOT_HELPER_BACKWARD_SCROLL_PRODUCT_CHANGE_NOT_PROVEN`

## Finite disposition

The saved row23 top-pane image proves the current export answer's footer was already visible in the real full-mode pane before the footer step failed. It visibly contains the exact current source labels, `Exportă o dezbatere ca JSON` and `Cum citești o dezbatere`, with no action links. Those labels equal the row23 API and DOM records. Production renders the current message's sources and actions inside `footer.supportCitation` (`apps/ui/components/support/Assistant.tsx`, lines 641–666). This is direct screenshot and markup evidence, rather than an inference from HTTP 200.

No product footer usability defect is proved by the saved evidence. The top image shows the footer fully painted inside the 652×700 `.supportChatScroll` pane with space below it. The product pane is the intended scroll container (`Assistant.tsx`, lines 786–805; `apps/ui/app/globals.css`, lines 698–703).

The helper does contain a bounded defect. After capturing the top state, it always invokes `scrollTargetEdgeIntoPane(..., edge: "footer")` even when `topView.footer` is already contained. Its footer delta is `footer.bottom - pane.bottom`, so an already-contained footer produces a negative delta and the helper scrolls backward. It then applies a strict, zero-tolerance `footer.bottom <= pane.bottom` test. The prior successful rows show this backward movement: row15 changes `scrollTop` from 382 to 264 and row19 from 713 to 595. Row19's recorded footer bottom equals the recorded pane bottom at the final pixel boundary. Row2 similarly changes 87 to 0.

For row23, the helper saved the top screenshot and then failed before serializing its geometry. Historical `scrollTop`, `scrollHeight`, `clientHeight`, target/footer rectangles, requested delta, realized scroll position, and post-`finally` restoration state are unavailable. The exact low-level trigger—clamping, fractional geometry/rounding, or a layout shift—therefore remains unproved. Restoration failure is also unproved: a `finally` attempts restoration, but no observation confirms its result after the throw.

## Smallest correction justified

Change only the screenshot helper. Product code and CSS do not require a correction on this evidence.

1. If the current footer is already contained, preserve the current pane position and capture the footer pane there. Identical top/footer PNG bytes are valid when both views are satisfied, as the prior row1 evidence already demonstrates.
2. If the footer is below the pane, scroll forward only by the positive bottom overflow. Never apply a negative footer delta simply to align an already-visible footer with the pane bottom.
3. Keep a real painted-containment requirement. Use a deterministic instant scroll with either a small explicit geometry tolerance or an intentional inside margin; do not loosen the check so clipped content passes.
4. Before any possible throw, persist full floating-point geometry and scrolling facts: before/top/pre-footer/post-footer target, pane and footer rectangles; containment decisions; prior, requested, assigned and realized `scrollTop`; `scrollHeight`, `clientHeight`, maximum scroll and delta.
5. In `finally`, restore the original scroll position and persist the observed restoration result. Preserve the current article identity, API/DOM text, source and action equality checks, plus expanded-capture style, scroll and viewport restoration controls.

## Bounded zero-forwarded-Support verification

The correction should be verified with the production `Assistant.tsx` and `globals.css`, the corrected `screenshot-evidence-successor.mjs`, and the production capture call site. Use a fresh disposable browser profile/UI instance and locally intercept the public support session/message routes. Do not contact real Support, status, capacity or model endpoints; require counters for all such forwarded requests to remain zero. Do not touch private state, product quotas, existing browser profiles or the retained Runtime9.

Replay exactly one full-mode Romanian conversation containing these four saved turns and payloads in order:

1. Row2, `Account`, sources `settings-help-menus` / `Folosește Setările și Ajutorul uman` and `app-navigation` / `Navighează în Dialectical Engine`, actions empty.
2. Row15, `Ce arată diagnosticul de evaluare?`, source `debate-workspace-menus` / `Folosește meniurile spațiului de dezbatere`, actions empty.
3. Row19, `La ce folosește panoul Spațiu de lucru?`, sources `debate-workspace-menus` / `Folosește meniurile spațiului de dezbatere` and `guide-how-it-works` / `Cum citești o dezbatere`, actions empty.
4. Row23, `Cum pot exporta o dezbatere?`, sources `export-json` / `Exportă o dezbatere ca JSON` and `guide-how-it-works` / `Cum citești o dezbatere`, actions empty.

The response text must be the exact four saved `api.text` values from `GUIDE_LIVE_GUIDE22-actual-receipt.json`. Before each screenshot operation, require one newly appended assistant article and strict equality among the row identity, article text, source labels and actions. In particular, row23 must bind the export article and its two labels, not a prior article.

Persist screenshots before and after the attempted footer movement and a failure JSON with exclusive creation before throwing. Include all geometry fields listed above and a final restoration observation. Required discriminating controls are:

- the old helper exhibits its unnecessary backward movement or its row23 failure;
- the corrected helper leaves an already-contained row23 footer in place and captures it;
- a footer genuinely below the pane scrolls forward and becomes painted within the pane;
- an unreachable or clipped footer still fails;
- stale/prior target, source and action mutations fail before capture;
- style, scroll and viewport state are restored on success and failure.

This is a correction verification, not an open-ended diagnostic rerun. It must use the next unused `LIVE31` / `actualGUIDE23` namespaces. LIVE30 partial rows do not carry forward. The timing bound `2026-09-21T09:51:12.590Z` is planning input only and is not capacity evidence.

## Retained and limited

Prior process, schema, operator, product, full58 and unaffected screenshot evidence remains retained. Runtime9 postfailure custody, current capacity, a fresh31 result, Forgot destination resolution, CP1 readiness and CP2 remain unverified. This diagnosis performed no browser, HTTP, runtime, process, status, capacity, database, Support, model, private-log, product, KB or Git action.
