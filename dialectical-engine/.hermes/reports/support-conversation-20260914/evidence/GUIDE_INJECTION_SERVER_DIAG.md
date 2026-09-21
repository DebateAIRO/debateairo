# GUIDE_INJECTION_SERVER_DIAG — restricted-role refusal failure

Revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`

Verdict: **a guaranteed reachable product defect is proved; the first exception thrown during LIVE6 remains unobserved.** The deterministic injection route always invokes a session-state `UPDATE` before sending its response. The supported API starts with the restricted `debateai_support` capability, whose attested contract deliberately forbids `UPDATE(state)` on `support.session`. PostgreSQL checks statement privilege even when the `WHERE` condition would update zero rows, so every admitted injection request reaching this call is structurally unable to return its intended HTTP 200 under the supported role. LIVE6's HTTP 500 is consistent with that defect, but its exact body and fixed diagnostic were not retained; this report does not claim that PostgreSQL code `42501`, or this particular statement, was the first LIVE6 exception.

## Sealed observation

The immutable LIVE6 receipt sent 15 messages and completed 14. Canonical row 43, the Romanian injection request, reached `API_RECEIVED` with HTTP 500 and then failed `GUIDE_HARNESS_API_OUTCOME_INVALID`: body `OBJECT`, status `VALID`, outcome `UNKNOWN`, text `INVALID`, sources/actions absent. No exact response body, diagnostic projection, or private runtime exception was persisted. Thirty-nine rows were unattempted; forty were unfinished when the failed row is included. The healthy runtime and private stack log were not touched.

## Exact producer trace

1. `apps/api/src/support/index.ts:328-339` calls `sessions.admitMessage` with the classifier's `injection` flag.
2. `packages/db/src/support.ts:306-417` serializes admission, inserts an immutable `admission_event`, inserts `INJECTION`, and inserts `LOCK` when the configured threshold is reached. It already refuses later messages from the immutable injection count at lines 341-357.
3. Both deterministic refusal branches persist user and assistant messages before reply (`apps/api/src/support/index.ts:441-477` and `:555-599`). Each injection branch then calls `finalizeInjectionLock` (`:459-465`, `:584-590`). No model call is needed.
4. `packages/db/src/support.ts:468-482` executes `UPDATE support.session SET state='LOCKED' ...`. This needs `UPDATE(state)` even below the threshold.
5. Migration `0050_support_foundation.sql:80-84` grants only `SELECT, INSERT`; `0054_support_keys_audit.sql:822-852,874-885` permits named update columns but excludes `session.state`. `assertSupportDatabaseRole` enforces the exclusion at `packages/db/src/support.ts:2228-2280,2310-2366`; `apps/api/src/main.ts:368-385,576-583` uses and attests that restricted pool before listen. `tests/integration/dev-database-principals.test.ts:267-274` already proves granting `UPDATE(state)` invalidates startup attestation.
6. Generic route errors are serialized by `apps/api/src/index.ts:507-540` as an HTTP 500 object with no Support outcome envelope. That matches the retained LIVE6 projection. The safe diagnostic could distinguish a PostgreSQL dependency error, but LIVE6 did not retain it and this node did not inspect private logs.

The current `tests/integration/support-routes.test.ts:182-255` fixture binds the repositories to the embedded database's administrative pool. Its injection tests therefore pass the forbidden state update and mask the production-role defect.

## Required correction contract

Do not grant `UPDATE(state)`, add a privileged function, or bypass `assertSupportDatabaseRole`. Remove `finalizeInjectionLock` from the Support session port, route calls, production binding, repository, and support-eval binding. Keep the immutable `INJECTION` and `LOCK` events as the lock source:

- `admitMessage` remains the serialized admission boundary and rejects the fourth/default-threshold message from the injection count.
- `read(...lockAfterInjections)` continues to expose effective `LOCKED` from that count.
- refusal message writes remain before effective lock finalization, so the threshold injection stores both encrypted messages and the abuse rows.
- `admitIpSession` continues to calculate cooldown from immutable `LOCK` events.
- `PostgresSupportStatusRepository.status` must count effective open sessions by excluding immutable `LOCK` events rather than relying on the removed mutable state transition.
- no model call, quota, admission, abuse-accounting, encrypted-storage, threshold, privacy, or human-case contract changes. Case repositories stay untouched; route admission prevents later locked-session messages.

The complete current `support.session.state` consumer census is bounded to `packages/db/src/support.ts`: public read derives `LOCKED` from injection rows (`:284-304`); message admission rejects stored non-open state and independently rejects the immutable injection count (`:306-417`); the defective finalizer mutates state (`:468-482`); encrypted message write checks the physical lifecycle row (`:559-595`); the two case-creation entry points check the physical parent lifecycle (`:674-688`, `:766-783`); and status counts physical open rows (`:2000`). No other application or package consumer reads a persisted `LOCKED` session state. The correction changes only the defective finalizer and the status metric: message write must continue to accept the threshold refusal after `LOCK` is inserted, while case/handoff guards remain unchanged. A lone injection explicitly does not escalate (`apps/api/src/support/escalation.ts:30-64`; `tests/unit/support-escalation.test.ts:81-83`), and later HTTP requests are stopped by `admitMessage`. No case/handoff file is needed for this defect.

## Exact minimum write scope for the fix packet

Production and compile consumers:

1. `apps/api/src/support/index.ts`
2. `apps/api/src/support/session.ts`
3. `apps/api/src/main.ts`
4. `packages/db/src/support.ts`
5. `tests/support-eval/run.ts`

Meaningful tests:

6. `tests/integration/support-routes.test.ts`
7. `tests/integration/support-metrics.test.ts`
8. `tests/integration/dev-database-principals.test.ts`
9. `tests/architecture/sup-01-boundary.test.ts`

No migration, catalog, KB, UI, classifier, model, preview, or harness file is required.

## Required RED/GREEN proof

Use the existing real restricted-role bootstrap in `dev-database-principals.test.ts`: `startTestDatabase()`, `migrate(database.pool)`, `provisionDevelopmentDatabasePrincipals(...)`, parse `SUPPORT_DATABASE_URL`, and `createPool(...)`. Add one route-level regression whose session repository uses that real support pool and whose message/model ports are deterministic synthetic fixtures. At the current revision its first admitted injection must capture HTTP 500; after the fix it must assert HTTP 200 `REFUSE_INJECTION`, zero model calls, two stored-message calls, one immutable `INJECTION`, and no requirement for `UPDATE(state)`. Extend it through the configured threshold to assert one immutable `LOCK`, derived `LOCKED`, and a subsequent `429 RATE_LIMITED`. Keep the existing principal assertion that adding `UPDATE(state)` is rejected.

Retain and strengthen the existing route tests for first refusal storage, three-injection/fourth-message lock, concurrent threshold admission, configured threshold, hashed-only abuse storage, and no model transit. Add the status metric assertion that event-locked sessions are excluded from `openSessions`. Add an architecture assertion that the route/repository source contains no session-state lock update or privileged substitute.

Existing bounded regression command/bootstrap for the correction:

```sh
TSX_DISABLE_CACHE=1 pnpm exec vitest run tests/architecture/sup-01-boundary.test.ts tests/integration/dev-database-principals.test.ts tests/integration/support-routes.test.ts tests/integration/support-metrics.test.ts --maxWorkers=1
```

The fix packet should capture a focused restricted-role RED before implementation, then the exact four-file GREEN. A later composed gate can run its existing broader suite/typecheck contracts. No runtime replay or model request is needed to prove this correction.

## Unknowns and limits

- The exact first exception, database code, fixed diagnostic, and response body from LIVE6 are unavailable.
- The prior LIVE4 response-loss is not retrospectively explained.
- This diagnosis does not complete the 54-row guide capture or establish CP1 readiness.
- The unresolved Forgot destination remains actionless, and CP2 remains gated.
