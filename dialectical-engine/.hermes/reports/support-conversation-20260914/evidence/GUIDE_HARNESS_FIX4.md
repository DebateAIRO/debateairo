# GUIDE_HARNESS_FIX4 evidence

- Node: `GUIDE_HARNESS_FIX4`
- Ticket: `t_4e6af872`
- Session: `/root/preview`
- Product revision: `f3be0af81f1691db6c23494f9e286bb6b10f13bf`
- KB version: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- Verdict: `PASS_INERT_SAME_DESTINATION_CORRECTION_SEPARATE_RECHECK_REQUIRED`

## Finding disposition

The consumed REVIEW3 finding was correct: row 53 begins on `/help` and activates a verified `/help` action, so the prior unconditional URL-change wait could never prove completion. FIX4 keeps exact action id, label, and href validation and real pointer or keyboard activation. The new helper resolves the expected absolute destination, waits only when the initial and expected destinations differ, and always requires the final absolute URL to equal the expected destination.

The 54-row matrix is byte-identical to FIX3 at SHA-256 `4614aae275462568eed6277c78193d252c441cd47c28bd37021de4d43ba91957`. Product and KB bytes are unchanged. In the harness, only documentation, capture orchestration, the existing hashed controls module, and the inert verifier changed. The copied adapter changes only documentation, FIX4 namespace/node bindings, its ordered-eight digest, and the fixture namespace. Exact old/new hashes are in `GUIDE_HARNESS_FIX4-delta.json`.

## Verification

The product-bound inert frame passed 69/69. It retained all 65 FIX3 controls and added four discriminating navigation controls:

1. same-destination pointer activation succeeds with no transition wait;
2. changed-destination keyboard activation waits for the exact destination;
3. a wrong final destination fails;
4. a missing requested activation fails before destination proof.

- Schema-2 proof: `GUIDE_HARNESS_FIX4-control-proof.json`
- Executable harness digest: `4768a8b5296ca5838fa6e2588be5cebc537b2613513239e434f0cd60bd7c7c9e`
- Copied adapter digest: `bc265096f5211771c214c0aa63af1977618a1f536aeb1ec0be3b36017ddbb97a`
- Replay adapter SHA-256: `8f1c0930bc6e92c2bad6ee2a9e515f2bc478101968c5f6bc898303ce18ee9627`
- Adapter mutation negative: 3/3 PASS, `importerCalls=0`, `successfulRows=0`, zero traffic
- Replay adapter syntax: PASS

Full ordered-eight verification still occurs before dynamic adapter import, and constructor proof digest equality remains required before row projection. The five sessions, 31-second pacing, 42-model ceiling, 120-second freshness, capacity/custody, API-DOM equality, no-retry, action, and recovery-safety contracts remain unchanged.

## Limits

No valid runtime gate was fabricated and no all-54 actual-product row replay occurred. No browser, HTTP, database, Support, model, provider, lifecycle, counter, limit, credential, private-record, product, or Git action occurred. The fixed future capture receipt, screenshots, and FIX4 browser profile remain absent. The running stack log was not copied. Separate original-baseline recheck is required before LIVE3; this node makes no readiness, acceptance, or live-behavior claim.
