# GUIDE_HARNESS_BIND18 evidence

Verdict: `REWORK_PRODUCT_SIGNIN_CLASSIFIER` at final candidate `5d6e028ae5defc24e0690219d6128949e73b750d`, KB `7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af`.

The reusable matrix layer is prepared and validated: the reviewed canonical 54 rows remain unchanged, owner rows 55–58 are distinct, and the fixed actual plan contains exactly 31 fresh requests in five groups `[1,10,7,8,5]`, with 14 English, 17 Romanian, 27 maximum model calls, all 20 menu families, both broad-guide rows, all eight affected rows, two Help interactions, and four deterministic boundaries.

The real final-code offline proof stopped at row 57, `Where can I sign in?`. Its public-guide boundary is `PUBLIC_GUIDE`, but `classifySupportMessage` returns `REFUSE_ZONE` with `/login`. The route branch in `apps/api/src/support/index.ts` returns refusal text/link without reviewed sources or canonical actions. The required `account-access` authority and `sign-in` action therefore cannot be proved and would not be returned by the current actual service.

This is a product classifier defect, not an oracle or plan amendment. The public account-location exemption in `apps/api/src/support/public-guide-boundary.ts` recognizes bounded settings such as sessions and account deletion but not the exact sign-in location question. Existing answer-context coverage already proves that the downstream context can select `account-access` and `sign-in`; the missing edge is admission through the production classifier and route.

The smallest focused regression scope is `apps/api/src/support/public-guide-boundary.ts`, `apps/api/src/support/classify.ts`, `tests/unit/support-public-guide-boundary.test.ts`, `tests/unit/support-classify.test.ts`, and `tests/integration/support-routes.test.ts`. Preserve credential-operation refusals, Forgot unresolved/actionless behavior, private-record refusal, unrelated zone rules, and passing Romanian owner row 58. `tests/unit/support-answer-context.test.ts:238` is existing downstream positive evidence.

No composed-control or full58 pass is claimed. Attempts 1 and 2 are preserved. No runtime, browser, HTTP, status, capacity, database, Support, model, product, KB, or Git action occurred. The prior synthetic screenshot PASS is retained but not relabeled as a BIND18 execution. The final seven-phase command contract, full58 proof, actual31 capture, and supported reload remain pending a corrected clean product revision.
