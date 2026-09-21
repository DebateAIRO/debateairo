# GUIDE_HARNESS_FIX5 evidence

- Node: `GUIDE_HARNESS_FIX5`
- Ticket: `t_f0f7a223`
- Session: `/root/preview`
- Product revision: `5731eb6faac25f9712f04aea029a021f6eee9352`
- KB version: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- Verdict: `PASS_INERT_SAFE_OBSERVATION_AND_SOURCE_POLICY_SEPARATE_REVIEW_REQUIRED`

## Correction

The LIVE3 receipt lost the final public response because the capture asserted the result before it appended or checkpointed that row. FIX5 now projects and checkpoints a fixed-key `failureObservation` immediately after the public API/DOM comparison and fixed diagnostic capture. A failing predicate adds a closed code to a second checkpoint; `rows` still counts only completed rows. The shared projector retains canonical row identity, public API/rendered text and source/action projections, HTTP status/outcome, equality booleans, and fixed diagnostic status/counts/category. It strips extra/private fields, raw drafts, headers, session identifiers, capabilities, and runtime bytes, and rejects malformed public shapes.

Model assertions now distinguish branch proof, HTTP status, outcome, expected source, proof membership, diagnostic attribution, action policy, and action binding. API/DOM mismatch records the false equality before failing. The original LIVE3 predicate and response origin remain unknown because those fields were never retained; FIX5 does not infer them retrospectively.

The frozen source amendment changes only canonical rows 7 and 8. Both require `app-navigation`, allow optional `browse-public-debates` in either order, recover exactly from `app-navigation`, and reject `getting-started-debate`. The verifier checks the context declaration against the reviewed arrays, uses the production exports `supportSourceIdsSatisfyPolicy` and `selectSupportRecoveryEntry`, and records the actual selected reviewed fallback hash. The other 52 row contracts are unchanged.

## Verification

- Final inert harness: 91/91 PASS at exact product `5731eb6faac25f9712f04aea029a021f6eee9352` and 44-entry KB.
- Retained controls: all 69 FIX4 names/purposes; added 22 safe-observation and source-policy controls.
- Copied adapter mutation negative: 3/3 PASS, `importerCalls=0`, `successfulRows=0`, zero traffic.
- Future capture syntax: PASS inside the 91-control frame.
- Ordered-eight harness digest: `238db0310eb2bdc34245f213f458c35e6e86a0e74efa669548ae3b5125138341`.
- Matrix SHA-256: `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`.
- Pre-request verifier SHA-256: `c74a64f7dcbd6b17ffb0b6c2f4a281a4af0ee89d925e2ae509fdc3bffcc89733`.
- Copied adapter digest: `a35b3565a376bf6605465c7e5cbba800a3f216fbefac2a6e1749edbe07a6fec1`.

The first interim f3 frame is preserved as RED. It stopped before the adapter negative because a new fixture used noncanonical diagnostic category `RESPONSE_POLICY`; the strict projector correctly returned `null`. The fixture was corrected to the consumer's canonical `SOURCE_MEMBERSHIP`, then the final 91/91 frame passed on the amended product. This RED is a harness-fixture defect, not a product or runtime finding.

## Limits

No valid gate, browser, runtime, capacity/status read, HTTP, database, Support request, model request, provider call, lifecycle action, counter change, limit change, private record, credential, product edit, or Git action occurred. `GUIDE_LIVE_GUIDE5-actual-receipt.json`, all GUIDE5 screenshots, and the FIX5 browser profile remain absent. Five-session capacity must be measured freshly in the later LIVE node; the historical expiry calculation is not capacity evidence. Forgot remains unresolved/actionless. Separate baseline review and a later fresh live gate remain mandatory; this node makes no readiness, acceptance, or CP2 claim.
