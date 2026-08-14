# POL-03 Codex handoff — typed DB pool failure policy

Worker session: `codex-goal-019ff5de-1f8e-7eb0-97fb-90adcb5b71aa`  
Ticket: `t_5faad0ce`  
Workdir: `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3` (existing workdir; no branch, worktree, commit, push, merge, or other Git mutation)  
Comments read through: `2026-08-12 15:12` (`CODEX HEARTBEAT`)  
Review route: DR-153 dual diamond — Opus 5 and Grok must both greenlight.

## Inventory and attribution

POL-03 changes:

- `packages/db/src/index.ts` — attaches the pool `error` listener, records a terminal typed-loud pool state, wraps connection-class failures from pool and checked-out-client queries as `TypedDomainError` code `DATABASE_POOL_FAILED`, and refuses subsequent pool work without retry.
- `tests/support/testDatabase.ts` — exposes the already-created real test database connection string to a child-process fixture.
- `tests/support/poolFailureChild.ts` — child process that terminates one active and one idle PostgreSQL backend and reports typed receipts.
- `tests/support/poolFailureHarness.ts` — child launcher and receipt reader.
- `tests/unit/pol03-pool-resilience.test.ts` — fast process-survival regression for an emitted idle-pool error.
- `tests/integration/pol03-pool-resilience.test.ts` — real embedded-PostgreSQL backend termination proof plus ordinary-SQLSTATE preservation.
- `docs/missions/2026-08-06-v3-programming/handoffs/POL-03-progress.log` — append-only progress evidence.
- This handoff.

Pre-existing dirt preserved and not claimed by POL-03:

- `packages/db/src/index.ts` already contained the unrelated `readFrozenHead().agentCount` change around the old lines 284–307.
- `tests/integration/database.test.ts` and `apps/runner/src/index.ts` already contained PANEL/PRO maker-count work and failures described under Environment tail.
- All other dirty/untracked repository paths were left untouched.

## Delivered behavior / AC evidence

1. `createPool` always owns an `error` listener. An idle-client/backend error no longer becomes Node's unhandled EventEmitter error.
2. The first pool error is retained as terminal state and emitted loudly to stderr as `[DATABASE_POOL_FAILED] ...`; later `query`/`connect` calls reject that same typed state. There is no retry, replacement health claim, or fabricated success.
3. Active checked-out-client and direct-pool query failures are translated only for PostgreSQL connection/shutdown classes (`08*`, `57P01..03`, and named transport failures). Ordinary SQL errors preserve their original SQLSTATE.
4. A real PostgreSQL 18.4 child proof terminates a backend during `pg_sleep(30)`, then terminates an idle pooled backend. The process survives; in-flight and subsequent failures are both `TypedDomainError/DATABASE_POOL_FAILED`.
5. No HTTP-layer, pooling-policy, retry-policy, persistence, migration, or runtime-data change was made. DR-115 remains intact.

## TDD RED → GREEN

RED, before the production edit:

```text
$ pnpm vitest run tests/unit/pol03-pool-resilience.test.ts
× ... keeps a child process alive and rejects subsequent queries typed after an idle pool error
Error: POL03_SIMULATED_IDLE_BACKEND_RESET
Emitted 'error' event on BoundPool instance
expected 1 to be +0
Test Files  1 failed (1)
Tests       1 failed (1)
```

This is the incident shape: the child exited `1` because the pool had zero error listeners.

GREEN after the smallest production change and under-green narrowing:

```text
$ pnpm vitest run tests/unit/pol03-pool-resilience.test.ts tests/integration/pol03-pool-resilience.test.ts
✓ ... does not mislabel an ordinary SQL failure as a pool failure
✓ ... survives an idle backend termination and reports in-flight and subsequent failures typed
✓ ... keeps a child process alive and rejects subsequent queries typed after an idle pool error
Test Files  2 passed (2)
Tests       3 passed (3)
Duration    2.01s
```

Real PostgreSQL evidence printed during that GREEN run:

```text
[S00 DB] Testcontainers DEFERRED BY DR-121; starting real embedded PostgreSQL directly
PostgreSQL 18.4 ... database system is ready to accept connections
FATAL: terminating connection due to administrator command
STATEMENT: SELECT pg_sleep(30)
FATAL: terminating connection due to administrator command
```

The child additionally asserted stderr contained:

```text
[DATABASE_POOL_FAILED] PostgreSQL pool operation failed: terminating connection due to administrator command
```

## Gates / fixture-by-fixture status

### POL-03 unit + real-DB incident fixtures — GREEN

```text
Test Files  2 passed (2)
Tests       3 passed (3)
```

### Architecture and source audits — GREEN

```text
$ pnpm run lint
{"edgeRowsChecked":27,"violations":[]}
{"blocking":[]}
```

### Patch whitespace — GREEN

```text
$ git diff --check
<no output>
```

### Broad unit/integration/architecture gate — POL-03 GREEN; one attributed pre-existing failure

```text
$ pnpm test:s00
Test Files  1 failed | 64 passed (65)
Tests       1 failed | 458 passed (459)
```

The only failure is outside POL-03 and existed in the pre-existing dirty PANEL/PRO work:

```text
tests/integration/database.test.ts:768
expected RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE
received RUN_MAKER_CONFIGURATION_MISMATCH
```

POL-03's unit and real-DB files passed within the same broad run.

### Typecheck / build environment tail — attributed pre-existing failure

```text
$ pnpm run typecheck
apps/runner/src/index.ts(914,104): error TS18048: 'unservedRoot' is possibly 'undefined'.
apps/runner/src/index.ts(914,131): error TS18048: 'unservedRoot' is possibly 'undefined'.
apps/runner/src/index.ts(917,62): error TS18048: 'unservedRoot' is possibly 'undefined'.
```

No diagnostic names a POL-03 file. `build` is not separately claimed green because it invokes this same typecheck.

## Acknowledged deferrals

- Testcontainers execution remains `DEFERRED BY DR-121`; the required proof ran against real embedded PostgreSQL 18.4 instead.
- The unrelated runner maker-count expectation and `unservedRoot` type errors belong to the already-active PANEL/PRO dirt and were not modified under POL-03's surgical contract.

## SOLID / DDD / patterns / DR-115 self-check for reviewers

- SOLID: pool-failure translation is localized at the DB adapter construction seam; consumers keep the `Pool` contract.
- DDD: `DATABASE_POOL_FAILED` is the single typed infrastructure failure language exposed upward; ordinary SQL/domain failures are not conflated with it.
- TDD: child-process RED precedes production code; real backend termination and SQLSTATE-preservation GREEN are pasted above.
- Pattern register: fail-closed adapter boundary; no retry, no fallback health fabrication, no new service bag.
- DR-115: no runtime/test data crosses layers, no scaffolded health, and no successful result is invented.

## Risks / open questions

- Residual risk: the pool intentionally remains terminal after an idle-client error. Recovery policy is explicitly not invented here; a future V-ratified restart/reconnect policy would be a separate slice.
- QUESTIONS FOR V: none.
