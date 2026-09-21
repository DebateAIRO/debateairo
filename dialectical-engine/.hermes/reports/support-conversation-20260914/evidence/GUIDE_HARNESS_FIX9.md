# GUIDE_HARNESS_FIX9 evidence report

## Result

- Node/ticket/session: `GUIDE_HARNESS_FIX9` / `t_6fce3fbf` / `/root/preview`
- Product revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13` (clean)
- Verdict: `PASS_BOUNDED_PARSE_CLASSIFICATION_CORRECTION`
- Ordered-eight harness SHA-256: `acc2c2cdf503f185ce8a43fcc6b262d144314708085a80e79ac262d99fed6fbc`
- Control proof: 112/112; all 111 FIX8 purposes retained, one added
- Adapter-negative controls: 3/3, `importerCalls=0`, `successfulRows=0`
- Syntax checks: 10 files
- Traffic: zero browser, runtime, HTTP, capacity, database, Support, and model activity

## Resolved finding

FIX8's downstream staged consumer already classified a non-object body as `GUIDE_HARNESS_API_BODY_INVALID`. The actual capture erased that condition: a rejected `response.json()` was replaced with `{}`, producing body `OBJECT` and the later `GUIDE_HARNESS_API_OUTCOME_INVALID` code.

FIX9 adds `readGuidePublicResponse` at the actual capture boundary. It retains the numeric response status, returns `null` only when JSON parsing rejects, discards the exception, and passes legitimate parsed bodies unchanged. The capture uses this helper before the shared staged consumer. A parse rejection now produces two safe `API_RECEIVED` checkpoints; the final checkpoint contains body `INVALID`, status `VALID`, outcome `UNKNOWN`, and `GUIDE_HARNESS_API_BODY_INVALID`. It contains no raw response, rejected content, parse exception, headers, cookies, identifiers, or private values.

The RED frame failed because the copied FIX8 controls had no `readGuidePublicResponse` export. The final inert frame exercised both rejected and successful JSON reads through that helper and passed 112/112.

## Preservation and custody

The 54-row matrix, source policy, pre-request verifier, session lifecycle, navigation, pacing, limits, diagnostic schemas, strict MODEL decorations, deterministic omission compatibility, staged accounting, and closed predicate codes are unchanged. `gate-contract.json`, `matrix.mjs`, `pre-request-verifier.ts`, `runtime-capacity.mjs`, `session-lifecycle.mjs`, and `verify-final-branches.ts` are byte-identical to FIX8.

Matrix SHA-256 remains `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`; pre-request verifier SHA-256 remains `c74a64f7dcbd6b17ffb0b6c2f4a281a4af0ee89d925e2ae509fdc3bffcc89733`. The copied row-proof adapter verifies the full ordered-eight digest before dynamic import and rejects its mutation fixture before importer or row execution.

Future outputs remain isolated as `GUIDE_LIVE_GUIDE9-actual-receipt.json`, `GUIDE_LIVE_GUIDE9-row-01..54.png`, and `GUIDE_HARNESS_FIX9/browser-profile`. All 56 paths were absent; no capture ran. The independently restored preview supervisor PID `20420` was untouched.

## Limits

The actual LIVE3/LIVE4 failures remain unknown and are not relabeled. This harness-only correction does not change product behavior, authorize live traffic, or establish readiness or acceptance. Forgot remains unresolved/actionless and CP2 remains gated.
