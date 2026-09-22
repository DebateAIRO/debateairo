# GUIDE_ACTION_COMPOSE evidence

- Verdict: `COMPOSED_MEASURED_PENDING_SEPARATE_REVIEWS_AND_LIVE2`
- Product revision: `c8784902f78ed4ba1d637d122e1f32f598415f4e` (clean), from `b0b91a01cf161d17eef75577cbae94c629b7bc49` by one test-only commit.
- Exact required union: 33/33 files passed; 1,633 tests passed and 1 TODO.
- Typecheck: exit 1 with exactly the attributed 76-diagnostic intake baseline; the final output is byte-identical to the indexed baseline and adds zero diagnostics. The preserved pre-fix output had two additional mock tuple diagnostics.
- Controlled structural evaluation: measured once at the base revision, three runs of 60/60; rubric remains `PENDING`, real first token is `NOT_APPLICABLE`. It is retained rather than relabeled because the only later change is test mock typing.
- Strict snapshot: 44 records, KB `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`, reviewed recovery owner fields remain blank.
- Frozen FIX2 harness: schema 2, 62/62 controls, final revision and unchanged harness `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917`.
- Preserved failure: the first eval attempt could not create the TSX IPC listener in the sandbox; the executable run is separately captured.
- Limits: no live model, browser, HTTP, database, preview, or row-proof adapter execution occurred. LIVE2 still owns fresh-runtime all-54 action proof. Forgot-password destination remains unresolved and actionless. No owner acceptance or checkpoint readiness is claimed.
