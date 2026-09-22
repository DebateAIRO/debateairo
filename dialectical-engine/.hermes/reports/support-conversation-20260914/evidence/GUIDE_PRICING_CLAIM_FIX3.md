# GUIDE_PRICING_CLAIM_FIX3 evidence

Verdict: `IMPLEMENTED_REVIEW_REQUIRED` at `8cdb75d75055ccb41b6325da23bf233b24e2614b`.

The prior financial guard still scanned backward for negation. In reverse order, a later checkout claim inherited negation that followed an earlier payment subject. It also rejected direct after-subject negatives such as “Payment cannot…” and “Payment isn't…”.

The correction removes arbitrary lookback. Negation before a financial mention must use a tightly anchored construction ending at that mention; negation after the subject must begin with an anchored direct or modal auxiliary. Anything else conservatively falls back to reviewed guidance. Both financial-term orderings, causal, comma, `yet`, `or`, Romanian equivalents, and direct/modal EN/RO negatives now discriminate correctly.

RED: one file, 8 failed and 231 passed. Policy GREEN: 239/239. Final affected policy/full44-answer/real-POST frame: 3 files, 468/468. The exact original LIVE28 recovery, reviewed fallback usefulness, pre-storage/HTTP rejection, and model-usage accounting regressions stayed green.

No separate typecheck was repeated: the changed TypeScript and its new literal cases compiled in Vitest, while the inherited 76-diagnostic repository baseline remains qualified only at the parent revision. KB7ef and all 44 review bindings remain unchanged. No live, model, browser, runtime, or database-publication action occurred. Separate review remains required; Forgot password is unresolved/actionless and CP2 remains gated.
