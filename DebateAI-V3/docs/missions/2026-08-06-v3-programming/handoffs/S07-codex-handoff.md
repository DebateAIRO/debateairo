# S07 · Codex handoff — SPLIT loop, defeaters, WAIT drain, and live lifecycle

Worker session: `019fe1fe-bc09-7541-9279-ad3b77871043`  
Ticket: `t_4e7228af`  
Workdir: `/Users/vladmihaimiron/Documents/DebateAI-V3` (legacy DR-123 working-tree flow; no Git operation performed)  
Comments read through: `#235 / 2026-08-08 18:56:52 claude-orchestrator`.

## Outcome

S07's pure and impure seams are attached without creating a second store or a second decision source:

- `battery/decision` is a kernel-only pure function over the two typed signal bundles plus materialised path state. It validates availability/freshness and all six grounded identity fields, applies `reopen → challenge → seek_evidence → deepen → abandon → continue`, excludes blockers from classification while preventing blocked abandonment, fails unclassified/ungrounded input closed to scalar, carries the next path/stopping state, and permits only categorical challenge/evidence decisions to carry a spawn.
- `SplitStageRunner` records the decision before invoking graph spawn. `decision_record` is append-only and idempotent; its canonical replay hash covers signals, path state, action, firing reasons and blockers, while deliberately excluding the idempotency key, classification and spawn count. Same-key/different-content fails typed-loud.
- A pending child and its live placeholder arrow are written under one graph advisory-lock transaction. Retry reuses the parent/sibling slot only when the pending child and edge identity agree.
- Node lifecycle events are projections over existing authoritative facts: pending node + placeholder edge → `node.spawned`/`node.generating`; `JUDGEMENT_SCHEDULED` ledger row → `node.being_judged`; `node_strength_record` → provenance-bearing `node.scored`. Each run-stream event carries its node `subject_ref`; bare lifecycle payloads stay bare. `node.generating` is not stored in SQL or a new column.
- `TERMINAL` is rejected in PostgreSQL while any latest activation event is `WAIT`. The runner accepts no default: every latest WAIT requires one explicit evaluated transition or it raises `WAIT_RESOLUTION_INCOMPLETE`; absence of the runner evaluator raises `TERMINAL_ACTIVATION_EVALUATOR_UNRESOLVED`. The firing fixture uses Q30's real `{Q45_operator, child_values}` dependencies, records the transition, then proves TERMINAL succeeds.
- Defeater completeness is typed: a non-empty set or exhaustion is required, exhaustion serves visibly as `UNFALSIFIED-AFTER-ROTATION`, and the skeptic rejects any unaddressed attack. The configured 2-round/3-attempt cap produces the existing `not runnable` abstention with rejection evidence.
- Rival-carver selection uses different-maker availability alone and always records measured behavioural difference as `UNAVAILABLE`; there is no proxy. DR-050's first parent/run deepening re-enters and every later one halts with `LEVERAGE_UNRESOLVED` naming the carrying piece.

## Rework round 1 — migration-ledger test repair

The orchestrator's first real-PostgreSQL gate returned **205/206**. The only failure was the recurring frozen expected-migration-name list in `tests/integration/graph-database.test.ts`, which ended at `0009_s06_rework.sql` and therefore omitted S07's `0010_s07.sql`. The production migrator and S07 assertions were not the failing path.

The test now derives its expected ordered ledger from the same `migrations/*.sql` filename domain, filtered by the migrator's numeric-SQL rule and sorted, then compares PostgreSQL's applied ledger to that directory result. This fixes the current `0010` instance and removes the stale-literal failure class for future forward migrations; replay safety remains independently enforced by the migration lint.

## TDD evidence

Initial focused RED:

```text
Test Files  2 failed (2)
Tests       2 failed | 1 passed (3)
- @debateai/battery-decision was not resolvable
- NODE_LIFECYCLE_EVENT_CONSUMERS was undefined
- migrations/0010_s07.sql did not exist
```

Focused GREEN after implementation:

```text
Test Files  2 passed (2)
Tests       8 passed (8)
```

Final focused cold-reader set after attachment, path-state hardening, and K=1 coverage:

```text
Test Files  3 passed (3)
Tests       15 passed (15)
```

## Gate map

| Gate / law | Firing evidence |
|---|---|
| FX-LED-06 / AC-48 | Pure tests show a categorical reason survives a scalar blocker and spawns; unclassified input becomes scalar/zero-spawn. Real-PG integration records two decisions differing only in excluded idempotency/classification/spawn fields and asserts equal replay hashes. DDL independently forbids scalar spawn counts. |
| FX-HR-H3D | Package manifest depends on kernel only. Source audit rejects every non-kernel import and clock/randomness use in `battery/decision`. |
| DR-076 / FX-LG-17 | Real-PG integration observes `node.spawned → node.generating → node.being_judged → node.scored` before run settlement. Spawn payload carries node/parent/placeholder refs; score payload is labeled. The API SSE projection consumes the same fact-derived events. |
| DR-089 / FX-LG-18 | Raw PostgreSQL refuses TERMINAL over Q30 WAIT. A real append-only activation event supplies Q45's operator plus a child-strength reference; latest WAIT becomes ACTIVE; the same raw TERMINAL insert succeeds. No busy poll or default transition exists. |
| FX-LG-14 | Empty/non-exhausted defeaters remain incomplete; exhaustion yields the visible mark and serves; 2/3 cap yields typed `not runnable` with all rejection refs. |
| FX-HR-H7 | Even a non-empty defeater set fails skeptic certification while an unaddressed attack remains. |
| DR-090 | Different maker is selected; measured behavioural difference is literally `{status: "UNAVAILABLE"}` and never read or approximated. |
| DR-050 | Round zero returns exactly one scoped re-entry; round one and above halt with `LEVERAGE_UNRESOLVED`. |

## Inventory

- `packages/battery/decision/src/index.ts` — pure decision policy, defeater certification, falsifier-rotation cap, and maker-only rival selection.
- `packages/battery/src/split.ts` — materialise/compute/persist/spawn orchestration and the API-facing lifecycle projection facade.
- `packages/ledger/src/index.ts` — canonical replay hashing and idempotent append-only decision records.
- `packages/graph/src/index.ts` — atomic pending-child/placeholder-edge spawn plus fact-derived lifecycle projection.
- `packages/db/src/index.ts`, `apps/runner/src/index.ts` — explicit evaluated WAIT transitions and terminal-evaluator refusal/default-free policy.
- `packages/valuation/src/index.ts` — ruled K=1 parent/run deepening resolution.
- `packages/contract/src/index.ts`, `apps/api/src/index.ts` — four canonical lifecycle names, declared W6/W8/W10 consumers, and SSE projection.
- `migrations/0010_s07.sql` — decision record, scalar-cannot-spawn CHECK, child-slot retry identity, append-only protection, and TERMINAL/WAIT trigger.
- `tests/unit/s07-split.test.ts`, `tests/architecture/s07-contract.test.ts`, `tests/integration/database.test.ts` — all S07 firing fixtures.
- `tools/orphan-audit/src/index.ts`, `reports/orphan-audit.json` — truthful S07 attachment inventory: the API lifecycle projection and runner WAIT drain are `ATTACHED`; the four test-only SPLIT/deepening rows are `UNATTACHED`; all seven test-only decision/write/deepening helpers are listed in `neverCalled` with their later-runner owner.

## Exact local verification

```text
pnpm exec vitest run tests/unit tests/architecture
Test Files  28 passed (28)
Tests       164 passed (164)

pnpm run typecheck
PASS

pnpm run lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }

pnpm run build
Compiled successfully; static pages 7/7
```

## PostgreSQL environment tail

The full database file was invoked and selected all 26 tests, including the two new S07 real-PostgreSQL cases. Embedded PostgreSQL failed during `initdb`, before migrations or assertions, because this managed sandbox denied SysV shared memory:

```text
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(...)

Test Files  1 failed (1)
Tests       26 skipped (26)
```

This handoff does not claim local PostgreSQL green. Peer review must run the full suite outside this sandbox; S06's orchestrator precedent is to clear stale SysV segments if the host has exhausted its segment table.

The first outside-sandbox run completed **205/206**; its sole failure was the stale expected migration-name literal described in rework round 1. After the self-updating ledger repair, the orchestrator and both independent review lanes completed **207/207 GREEN** against real embedded PostgreSQL 18.4.

## Rework round 2 — attachment honesty

The review diamond found an audit-ledger accuracy defect: `decide`, `recordDecision`, `spawnPendingChild`, and `resolveDeepeningReentry` were labeled `ATTACHED` even though their callers are test fixtures and no production composition root constructs `SplitStageRunner`. The correction is intentionally audit-only:

- those four S07 surface rows are now `UNATTACHED`;
- they and `certifyDefeaterCompleteness`, `resolveRegeneration`, and `selectRivalCarver` are all present in `neverCalled`;
- their owner text is explicit: production SPLIT-loop attachment belongs to a later runner slice;
- `readNodeLifecycleEvents` remains genuinely attached through the API, and `drainWaitsForCompletion` remains genuinely attached through the runner;
- the architecture fixture pins this exact boundary, removing the former contradiction where `addEdge` was test-only while its only caller `spawnPendingChild` was labeled attached.

No decision, graph, lifecycle, WAIT-drain, or valuation behavior changed. Rework verification is focused architecture **8/8**, full unit+architecture **164/164**, typecheck PASS, lint **27 edges / 0 violations** and **0 source blockers**, and build **7/7 pages**.

## Boundaries and carry-forwards

- No generated judgement, evidence, score, or served artifact was added. Lifecycle projection reads real graph/ledger facts, and runtime completion refuses missing activation evaluation instead of manufacturing it. Synthetic values exist only in labeled test fixtures.
- `node.generating` remains derived-only. Migration `0010` contains no lifecycle state column or `node.generating` event row.
- The measured behavioural-difference criterion has no register row, numeric proxy, or scoring effect.
- The S05 dead `BLOCKED` answer terminal, unreachable OPERATOR session branch, and unruled composition-budget unit were not touched.
- Q61 remains outside the run lifecycle for S12; S07 creates no intra-run Q61 WAIT.

There are no new V questions and no remaining execution gate in the worker handoff; the corrected audit boundary now awaits the review diamond.
