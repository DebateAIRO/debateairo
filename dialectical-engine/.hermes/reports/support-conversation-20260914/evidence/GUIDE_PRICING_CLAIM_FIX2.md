# GUIDE_PRICING_CLAIM_FIX2 evidence

Verdict: `IMPLEMENTED_REVIEW_REQUIRED` at `130adf47da2e889005e73c3adb7ebb49fd50b529`.

The first financial guard attached any preceding negation within a fixed character window to the next financial term. That allowed a negated checkout claim to license a later positive payment claim, and it missed modal negation after the financial subject.

The correction now evaluates each financial predicate independently. A preceding negation applies only when no earlier financial predicate intervenes; this rule does not depend on enumerating connectors. Modal negation after the current predicate is handled directly. Causal, comma, `yet`, `or`, and Romanian equivalents with a later positive claim are rejected, while “Payment may not…” and “Plata poate să nu…” remain valid limitations. Supported creation guidance remains valid.

Initial RED: one file, 6 failed and 215 passed. The first connector-based attempt passed 225/225 but retained three adjacent bypasses; the preserved second RED is 3 failed and 228 passed. Connector-independent policy GREEN is 231/231. Final affected policy/full44-answer/real-POST frame is 3 files, 460/460. The existing full44 fallback, pre-storage/HTTP rejection, and model-usage accounting regressions stayed green.

No separate typecheck was repeated: the changed TypeScript and its new literal cases compiled in Vitest, while the inherited 76-diagnostic repository baseline remains qualified only at the parent revision. KB7ef and all 44 review bindings remain unchanged. No live, model, browser, runtime, or database-publication action occurred. Separate review remains required; Forgot password is unresolved/actionless and CP2 remains gated.
