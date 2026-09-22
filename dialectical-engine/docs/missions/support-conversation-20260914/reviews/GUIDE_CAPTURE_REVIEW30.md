# GUIDE_CAPTURE_REVIEW30

Overall verdict: **REWORK_BOUNDED_ROW1_PAYMENT_CLAIM** at exact clean product revision `456cafb9e56a737de550570b5736ec52d79ddf48`.

Screenshot subverdict: **PASS_COMPLETE_FULL_ANSWER_CAPTURE_FINAL_BINDING**.

FIX30 closes the REVIEW29 screenshot defect. Its corrected full-mode long image visibly paints the target top, entire answer, source and action footer; the old clipped behavior is retained as a discriminating RED; success and exception paths restore styles, scroll state and viewport. The still-unused LIVE29/GUIDE22 binding is mechanically coherent.

A separate newly authorized check blocks the paid31 run: the already observed LIVE28 Pricing answer adds the unsupported claim that “paying for a debate happens through the debate creator after you sign in.” The selected `app-navigation` authority supports the creator for starting a debate after sign-in and says Pricing is informational rather than checkout. It does not establish any payment location or payment operation in the creator.

## Complete full-mode capture — PASS

The helper now walks the selected article’s real ancestor chain through the exact root, saving each ancestor’s full inline `cssText` and scroll offsets. During expanded capture it releases height and overflow constraints, adjusts full-desk and agent grid rows, expands the pane, and temporarily grows the viewport. Its `finally` path restores the viewport, every saved style, ancestor scroll offsets and page scroll. The outer helper separately restores the original conversation-pane scroll after top/footer/complete capture, including failure paths.

This directly addresses the actual public structure:

`supportDesk → supportDeskBody → supportAgent → supportChatScroll → supportConversation → current assistant article`

The corrected full-RO image is:

`.hermes/reports/support-conversation-20260914/probes/GUIDE_CAPTURE_FIX30/control-fixtures/full-ro-long-complete.png`

- SHA-256: `abdeeab4d41d685bf0571d3e6f770e74ded82065120de02dc12e9a46bdc286b6`
- bytes: `137087`
- dimensions: `760x562`

Independent visual inspection confirms the green top marker, full Romanian long answer, gray footer, red `Navighează în Dialectical Engine` source and blue `Deschide Ajutor` action are all painted. There is no clipped blank remainder.

The controls are discriminating:

- the FIX29 pane-only helper gives the same clipped PNG hash before and after footer/source/action paint mutations;
- the FIX30 image hash changes independently for top, footer, source and action mutations;
- forced screenshot failure restores ancestor styles, ancestor/page scroll and viewport;
- all four full/compact EN/RO cases restore state;
- twelve previous-article, wrong-index and stale-projection negatives remain;
- the source-label identity correction and contained-short-footer rule remain unchanged;
- Support attempts remain zero.

These controls establish that the complete fixture image is influenced by every required painted region rather than merely existing with nonzero dimensions.

## Literal successor binding — PASS

- Command contract SHA-256: `e6b6ef591e8574e65af4b3eca2351f58ac67ed0940774a80bcd1aa997c168f0d`.
- Operator contract SHA-256: `006190e7f386db5a5698f54b77809676b2fa2a98ef02d11df709f752c235799e`.
- Screenshot helper SHA-256: `824e780a1817c198a6ca6ebc6215948241ecccbb5611617a033e650799ac4b29`.
- Seven phase `argv[2]` values self-bind the exact FIX30 command contract.
- Fixed31 remains 31 unique rows; GUIDE22 retains 93 screenshot paths; the operator retains 123 unique future paths.
- Every LIVE29 phase, UI, capacity, gate, row-proof, capture, idle, profile and operator path remains unused.
- GUIDE22 provenance, Runtime7, product456, KB7ef, private LIVE20 log, FIX22 owner command/output and LIVE25 owner-testability path remain unchanged.
- Binding proof passes 34/34.

The natural five-session `NOT_BEFORE` remains `2026-09-21T03:21:15.789581Z`, planning-only. Its elapsed state at review time does not itself establish current capacity.

## Actual LIVE28 Pricing answer — REWORK

The observed answer says:

> “creating or paying for a debate happens through the debate creator after you sign in.”

Its sole selected source is `app-navigation`. The exact reviewed source says:

- Pricing is informational, not a checkout;
- Start a round and New debate open the debate creator after sign-in.

The creator source describes a debate form and run creation. It contains no payment or checkout operation. Adjacent reviewed `budget-tier-choice` authority explicitly says the Premium selection does not prove a paid subscription, checkout or payment. The landing page contains placeholder pricing text and links Start a round to sign-in; it does not route payment into the creator. A product-tree search at revision456 finds no supported checkout/payment flow for the creator.

Therefore:

- “creating a debate happens through the debate creator after sign-in” is supported;
- “paying for a debate happens through the debate creator” is unsupported and conflicts with the explicit no-checkout qualification.

`ANSWER_GROUNDED`, the `app-navigation` citation, and API/DOM equality prove transport, source identity and presentation equality. They do not prove the added sentence is entailed by the cited source.

Minimum correction before another paid31 run:

1. Strengthen the reviewed Pricing authority/context to state that the signed-in creator creates/starts a debate and that the public guide establishes no payment or checkout location.
2. Add a source-bound response-quality guard at the actual Support answer boundary so a Pricing draft asserting that payment happens in the creator is rejected and uses the reviewed safe recovery instead of being returned as `ANSWER_GROUNDED`.
3. Add full-real-context regressions: the exact observed unsupported sentence must reject; a safe answer stating “Pricing is informational, creation starts in the signed-in creator, and this guide does not establish checkout/payment” must pass; ordinary negated “not a checkout” wording must remain allowed.
4. Re-review any changed projection/fallback bytes and rebind the KB snapshot and successor contract before spending the fresh31 frame.

Changing only the harness oracle would detect the defect after another model call and would not prevent the public API from returning it, so it is insufficient as the product correction.

## Custody and limits

- FIX30 manifest: 39/39 artifacts match recorded hashes and sizes.
- FIX30 receipt: 40/40 artifacts match recorded hashes and sizes.
- REVIEW30 indexed inputs: 160/160 match recorded hashes and sizes.
- Product checkout is clean at `456cafb9e56a737de550570b5736ec52d79ddf48`.
- Review traffic: runtime, browser, HTTP, status, capacity, database, Support and model all zero.

All LIVE28 partial evidence and failed-attempt custody remain preserved. LIVE29/GUIDE22 remain unused. This review establishes neither current capacity nor readiness, completion or acceptance. Forgot remains unresolved and actionless; CP2 remains gated. Prior source-custody and typecheck limitations remain.
