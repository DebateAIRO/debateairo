# GUIDE_SIGNIN_CLASSIFIER_REVIEW — bounded ingress correction review

- Ticket: `t_fb5b4064`
- Reviewer: Sol, native session `01a09ef7-e096-7c31-9b35-806840028cf0`, agent `/root/baseline`
- Base: `5d6e028ae5defc24e0690219d6128949e73b750d`
- Revision: `0f4290c290fd38caa0ccfb3b6781fb8c33999a22`
- Reviewed at: `2026-09-20T23:00:06Z`
- Verdict: **PASS_SIGNIN_CLASSIFIER_DELTA**

The correction closes the row-57 ingress gap without changing the previously approved REVIEW2 code/metadata or focused-31 plan decisions.

## Source-to-outcome disposition

`classify.ts` marks the existing sign-in/login/authentication zone rule as eligible for the public-location exception. `public-guide-boundary.ts` adds the same bounded lexical family to both the location target and account-operation relation. This is not an unconditional login exemption: a message must still contain a location predicate and the sign-in target, every affirmative account operation must belong to a location clause, and an affirmative Support/direct-assistant actor relation still prevents the exception.

Accordingly, `Where can I sign in?`, `Where is the login page?`, `Unde mă pot autentifica?`, and `Unde găsesc pagina de autentificare?` continue on the ordinary answer path. `Sign in to my account for me`, `Where can Support sign in to my account?`, `Where can you log in to my account for me?`, and their Romanian counterparts remain deterministic `REFUSE_ZONE` with `/login`. Password/recovery rules retain earlier precedence, so the new exception does not admit credential disclosure, submission, reset, or unresolved Forgot operations. Injection, private-record, unrelated restricted-topic, account-operation, and trusted-context controls are unchanged and remain in the affected frame.

The two EN/RO integration cases exercise the real POST support-message route, ingress classifier, answer service, opaque source/action references, canonical translation, and HTTP result. Both return `ANSWER_GROUNDED`, source `account-access`, action `sign-in`, and server-owned `/login`; the model fixture receives only the public reviewed projection. This composes with the unchanged strict-corpus and lower-service proof from REVIEW2 rather than claiming a new factual corpus audit.

Row 58 (`Unde îmi pot crea un cont?`) and both exact branded-overview prompts retain ordinary classification. Their reviewed source/action behavior remains the unchanged REVIEW2 proof. Forgot password remains unresolved and actionless.

## Custody and verification

The detached product lane is clean at `0f4290c2`. The delta is exactly five paths: two production classifier/boundary files and three focused unit/integration test files; `git diff --check` passes. All 39 frozen review inputs match their recorded SHA-256 and byte counts. FINAL12 is nonempty and binds 145 unique changed paths, 145 product files, and three deleted paths.

The preserved RED run has eight expected sign-in failures with 471 passes. The final affected command passes three files and 648 tests. A preceding full-frame attempt retained one ordering-sensitive aggregate assertion after new model fixtures were inserted before that assertion; moving those fixtures after the aggregate assertion produced the passing frame without a product-code change. Typecheck remains rc1 with 76 diagnostics; all normalized diagnostic lines equal the inherited baseline and none names an owned path. Raw log bytes differ only by capture-control text, so they are not represented as byte-identical.

The strict 44-entry corpus, KB version `7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af`, component file, and review manifest are unchanged.

## Limits

This is a static delta review of recorded tests. It does not claim a complete offline 58-row producer replay, live model success, browser quality, screenshots, runtime corpus loading, capacity, readiness, CP1 completion, or owner acceptance. No heavy command, runtime, browser, HTTP, Support/model, capacity, database, product, KB, harness, or Git mutation was performed by this reviewer.

The avoidable token cost was the separation between lower answer-service proof and the earlier ingress classifier. Future one-prompt verification should trace every owner case through a generated ingress → route → context → opaque-reference → response contract before browser or paid traffic, while retaining an independent review gate.
