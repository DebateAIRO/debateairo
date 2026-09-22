# GUIDE_COMPLETION_REVIEW42 — completion predicate review

- Ticket: `t_6d597fc2`
- Product revision: `0d34f82f4a2188d0ce1db04655b693798ffd2169`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Date: `2026-09-21`
- Verdict: `REWORK_BOUNDED_COMPLETION_STATE_INITIALIZATION`

## Remaining defect

The new completion function has the correct call ordering, but its valid state does not match the actual capture producer.

`commitCaptureSuccess` rejects whenever `result?.sessionVersionFailure !== null`. The actual `result` initializer in `capture-public-guide.mjs` defines failure, UI and timestamp fields but does not define `sessionVersionFailure`. On an otherwise successful run with no response-listener error, that property remains `undefined`. Since `undefined !== null`, the completion function always throws `GUIDE_CONTINUATION_SESSION_VERSION_FAILURE` and the future remaining21 run cannot complete.

The focused positive control manually constructs `{ sessionVersionFailure: null }`. That stand-in masks the actual producer-shape mismatch; it does not demonstrate that the real initialized capture state reaches success, which the packet explicitly requires.

### Minimum correction

Initialize `sessionVersionFailure: null` in the actual capture result before any response. Keep the catch assigning a fixed error code. The valid completion control must consume the same actual initialized shape, preferably through one shared initializer/factory, so omission regresses red. Retain the accumulated-failure negative, exact-three timestamp validation, and the proven ordering before `completed=true`, checkpoint and composition.

Only capture initialization, the producer-shaped control and dependent hashes/contracts need to change.

## Retained passing dispositions

- `commitCaptureSuccess` rejects a non-null accumulated session failure and validates the shared exact-three timestamp contract before setting `completed=true`.
- It checkpoints only after those validations and restores `completed=false` if checkpointing throws.
- The actual capture calls it before `createComposedManifest`; no earlier `completed=true` remains in the success block.
- Missing, extra, malformed and out-of-order timestamp stand-ins and the explicit accumulated-failure state reject without a success checkpoint.
- FIX41 recorder/composer behavior, exact remaining21 plan, retained10 provenance, UI transition, budgets, helper, process/schema and product evidence remain unchanged.
- All seven phase argv select the FIX42 contract; command SHA-256 is `2fb449ede1f9fdb76ce8f951625feff6dff57f4505cb707866e11c506a167a45`, and operator SHA-256 is `5187a482b7d35132c8a953a4dd02f0d948f69f9f061dc1a2b3528406d37d97df`.
- All 115 future paths remain unique and absent; current/stale digest guards and operator ownership pass without operational I/O.

Actual remaining21, composed31 quality, fresh capacity and owner availability remain unproved. Forgot remains unresolved. No CP1 completion/acceptance or CP2 claim follows.
