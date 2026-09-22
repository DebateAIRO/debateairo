# GUIDE_HARNESS_FIX8 evidence report

## Result

- Node/ticket/session: `GUIDE_HARNESS_FIX8` / `t_37e21e94` / `/root/preview`
- Product revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13` (clean)
- Verdict: `PASS_BOUNDED_INERT_COMPATIBILITY_CORRECTION`
- Ordered-eight harness SHA-256: `be7a0ca7f0b4f768ac40a2ecb020a7f17f96df5a8f32100b43e3b85e3752047c`
- Control proof: 111/111; all 105 FIX7 purposes retained, six added
- Adapter-negative controls: 3/3, `importerCalls=0`, `successfulRows=0`
- Syntax checks: 10 files
- Traffic: zero browser, runtime, HTTP, database, Support, and model activity

## Resolved finding

FIX7 required both decoration arrays before it could project any API response. Production intentionally permits three legacy deterministic branches to omit `sources` and `actions`, and the shipped UI normalizes those omissions to empty arrays. The copied FIX7 projector reproduced that mismatch under the RED fixture with `GUIDE_HARNESS_API_PROJECTION_INVALID`.

FIX8 makes projection branch-aware. `MODEL` still requires both arrays. `DETERMINISTIC_PRIVATE_REFUSAL`, `DETERMINISTIC_INJECTION_REFUSAL`, and `DETERMINISTIC_RECOVERY` normalize only absent arrays to `[]`. Present arrays remain strict for every branch: at most three members, exact public keys, non-empty identifiers and labels, unique identifiers, and first-party action hrefs. Malformed, oversized, duplicate, extra-key, empty, and external-action members are rejected rather than coerced.

The staged consumer now checkpoints `API_RECEIVED` before full projection. It retains only canonical row identity, a valid numeric HTTP status or `null`, a closed outcome or `UNKNOWN`, and fixed field-state enums for body, status, outcome, text, sources, and actions. It does not retain response text, decoration members, headers, cookies, capabilities, identifiers, or arbitrary values. Projection failures use closed predicate codes for body, status, outcome, text, sources, or actions and retain the safe checkpoint. Completed-row accounting remains unchanged.

The English and Romanian injection rows pass the same omitted-decoration compatibility control while preserving the strict runtime contract: HTTP 200, `REFUSE_INJECTION`, empty decorations, exact API/DOM equality, no model diagnostic candidate, and no action.

## Exact delta and verification

Changed copied harness files are `README.md`, `capture-public-guide.mjs`, `controls.mjs`, and `verify-guide-harness.mjs`. New harness-only support files are `verify-fix8-red.mjs`, `run-final-controls.mjs`, and `package-evidence.mjs`. `gate-contract.json`, `matrix.mjs`, `pre-request-verifier.ts`, `runtime-capacity.mjs`, `session-lifecycle.mjs`, and `verify-final-branches.ts` are byte-identical to FIX7.

The copied adapter changes only namespace/digest custody in `README.md`, `replay-row-proofs.mjs`, `reviewed-harness-custody.mjs`, and `verify-negative-fixture.mjs`. Matrix SHA-256 remains `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`; pre-request verifier SHA-256 remains `c74a64f7dcbd6b17ffb0b6c2f4a281a4af0ee89d925e2ae509fdc3bffcc89733`.

The first final frame stopped because a new privacy test replaced the valid model source array while leaving the visible source label, correctly triggering `GUIDE_HARNESS_API_DOM_MISMATCH`. That rc1 log is preserved. The fixture was corrected only to add private extras to the valid baseline; the assertion and production-facing code were unchanged. The named rework frame then passed 111/111 plus adapter-negative and syntax controls.

Future capture outputs are isolated as `GUIDE_LIVE_GUIDE8-actual-receipt.json`, `GUIDE_LIVE_GUIDE8-row-01..54.png`, and temporary `GUIDE_HARNESS_FIX8/browser-profile`. All 56 paths were absent; no capture ran.

## Retained dispositions and limits

The actual LIVE4 row-43 response and exact cause remain `UNKNOWN_UNAVAILABLE_NOT_PERSISTED`. This correction does not relabel LIVE4, patch product behavior, change the matrix, source policy, navigation, limits, or counters, or authorize a live retry. Forgot remains unresolved/actionless and CP2 remains gated. No readiness, acceptance, or checkpoint claim is made.

