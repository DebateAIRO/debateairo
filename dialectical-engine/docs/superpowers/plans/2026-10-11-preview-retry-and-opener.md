# Plan: preview retry fix (option B) + opener rotation

Spec: `docs/superpowers/specs/2026-10-11-preview-retry-and-opener-rotation-design.md` (owner rulings R1-R9 at the
top win over the design text). Branch `fix/2026-10-11-preview-retry-and-opener` off origin/dev b89300463.
Test-first throughout: every task starts with a test that fails on today's code for the stated reason.

## Part 1 — retry fix

1. **Red: the real-wiring integration test.** New `tests/integration/preview-unbilled-retry-ledger.test.ts` on
   embedded Postgres (model: `tests/integration/t17-envelope-ledger.test.ts`). Build the gateway exactly as
   `apps/runner/src/main.ts` (~318-349) does: `withPreviewProviderCallPolicy(createPostgresProviderGateway(pool, {
   fetchImplementation: createPreviewGuardedFetch(scripted port) … }), previewConfig, target)` with
   `previewRunnerPolicy` over the sealed bounds and an injected no-op sleep. Cases (spec 1.8): (a) unbilled then
   answer → succeeds, 2 sends, 1 REFUSED + 1 OK row, `countModelAttempts` 1 (today: CALL_BUDGET_EXHAUSTED);
   (b) `withCooldownRetry` with a no-op hold, script unbilled ×3 then answer → AUTHORED, waits [60 s, hold, 60 s];
   (c) timeout then answer → the cooldown's final retry sends (today: CALL_BUDGET_EXHAUSTED after the hold);
   (d) four REFUSED rows seeded on JUDGE → `findExhaustedModelAttempt` null and a new call sends; (e) the gate's own
   concurrency refusal (R4) behaves like (a); (f) hosted wiring (no preview config) with maxAttempts 3 and three
   transport failures → 3 POSTs inside one call, as today. Also assert a REFUSED MODEL_CALL row inserts on the fully
   migrated database (R8).
2. **Marker + REFUSED row.** `ProviderUnbilledRefusal` (code stays `PROVIDER_CALL_FAILED`) in
   `packages/providers/src/index.ts`; `PreviewUnbilledRefusal` extends it, and the gate's concurrency refusal maps to
   it too (R4). The HTTP gateway's catch writes `outcome: "REFUSED"` for it; the thrown error keeps `FAILED`.
3. **One POST per call.** Optional request field `maxAttemptsThisCall`; the HTTP loop and the repair test use
   `min(bound.maxAttempts, maxAttemptsThisCall ?? bound.maxAttempts)`. The counting gateway forwards it.
4. **Preview policy.** `previewCallBound` keeps `maxAttempts` (token floor + deadline only); the wrapper sets
   `maxAttemptsThisCall` 1 (storyteller repair: 2) and resends once after 60 s on an unbilled refusal for every call
   except the storyteller's.
5. **Counts skip REFUSED.** `countModelAttempts`, `findExhaustedModelAttempt` (count and last-row pick),
   `readSeatMarkedModelCalls`/`seatKeyHistory`, `BudgetRepository.countRunModelAttempts`.
6. **Estimate (R3).** No number changes. Update only the comment near the unbilled-retry count in
   `apps/api/src/preview-budget-estimate.ts` to say the post-cooldown final retry is left to the margin by owner ruling
   2026-10-11. `tests/unit/preview-budget-estimate.test.ts` must pass unchanged.
7. **Existing tests.** Update `tests/unit/preview-budget-gate-refusals.test.ts` (add the counting-gateway case; "never a
   second retry" becomes per-call), `tests/unit/provider-preview-readiness.test.ts`,
   `tests/unit/provider-preview-story-repair.test.ts`, `tests/unit/preview-multi-model.test.ts`,
   `tests/unit/model-scorecard-provider-targets.test.ts` only where they assert the old bound of 1. Never weaken an
   assertion that still describes intended behaviour.

## Part 2 — opener rotation (spec 2.2 option B, R5-R7)

8. **Red: unit tests** in the role-rotation test file(s): OPENER least share with the seeded tie-break (role
   "OPENER"), the turned order [opener, after…, before…], old pins read as "first entry = opener", no maker constraint
   on the opener, independence from the four roles.
9. **Pick.** `packages/scorecard/src/role-rotation.ts` `pickRotatedRoles` returns the opener and the turned
   `eligibleModelIds`; the API writes the pin's `eligible_model_ids` in that order.
10. **Counts.** `packages/db/src/index.ts` `queryRoleRotationCounts`: add `('OPENER', eligible_model_ids[1])` to picked
    and `'OPENER'` to the eligible roles; integration test in `tests/integration/database.test.ts`.
11. **Runner.** Near `apps/runner/src/index.ts` ~5038: when a rotation pin exists and there is no scorecard
    assignment, stable-sort the legacy seat book's debaters by their index in `rotationPin.eligibleModelIds` (unlisted
    last, panel order); `configuredMakers` keeps panel order. Unit tests: a pin turns `seatBook.position`; an absent
    opener falls to the next member; no pin / assigned runs unchanged.
12. **Comments** in `db/src/index.ts`, `db/src/schema.ts`, `scorecard/role-rotation.ts` state the new meaning of the
    array order (0114's file is pinned and is not edited).

## Verification (inside the heavy lock, one at a time)

- Typecheck the project; `tests/architecture` (whole folder); every unit file touched or guarding touched files.
- Integration by hand (CI skips them): `preview-unbilled-retry-ledger`, `database`, `preview-estimate-database`,
  `t17-envelope-ledger`, and any integration file that imports the changed ledger/budget queries.
- `sh …/mm-round3/secret-line-check.sh origin/dev` before every push.
