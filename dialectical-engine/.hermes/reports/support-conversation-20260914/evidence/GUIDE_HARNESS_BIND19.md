# GUIDE_HARNESS_BIND19 — finite rework handoff

Verdict: `REWORK_PRODUCT_ACCOUNT_ACCESS_RETRIEVAL` at exact product `0f4290c290fd38caa0ccfb3b6781fb8c33999a22` and KB `7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af`.

The full 58-row offline proof reached owner row 58 and stopped. The public Romanian prompt `Unde îmi pot crea un cont?` remains model-eligible and requests the canonical `sign-up` action, but the real 44-entry corpus selected `settings-help-menus`, `app-navigation`, and `support-cases`; the required `account-access` source was absent. Row 57 passed before this failure, so the consumed sign-in correction is active.

This is a product retrieval defect. The existing row in `tests/unit/support-answer-context.test.ts:229-252` filters the drafted corpus to `account-access` before building context, so it cannot detect competition from the other 43 entries. The smallest corrective scope is `packages/support-kb/src/context.ts` plus a full-corpus regression in `tests/unit/support-answer-context.test.ts`. The likely divergence is between action recognition and source ranking: `sign-up` is recognized, while its bound article does not survive full-corpus selection. This handoff does not prescribe an oracle relaxation.

The reviewed 58-row matrix and fixed 31-row plan remain reusable. The new BIND19 matrix, verifier copy, offline replay, and fixed-field diagnostic are preserved. Final screenshot/capture and seven-phase command binding intentionally stopped after the required offline proof failed. The first attempt failed before row evaluation because the append-only verifier dependency had not yet been copied; that rc1 log is retained separately from the product failure.

Zero browser, runtime, HTTP, status, capacity, database, Support, or model traffic occurred. No product or Git bytes were changed. No runtime readiness, live response quality, manual capacity, owner acceptance, CP1 readiness, or CP2 readiness is claimed. Forgot password remains unresolved and actionless.
