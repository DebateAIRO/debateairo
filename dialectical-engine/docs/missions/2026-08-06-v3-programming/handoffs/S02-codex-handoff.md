# S02 · Codex handoff — graph and the cycle law

Worker session: `019fe026-d04b-7880-9634-871de1064717`  
Ticket: `t_f2f404cb`  
Workdir: `/Users/vladmihaimiron/Documents/DebateAI-V3` (`main`; no branch/worktree/commit/push operation)  
Comments read through: `2026-08-08 10:08` (`CODEX HEARTBEAT`)

## Inventory

- `migrations/0002_s02.sql` — canonical S02 lifecycle/path/edge DDL and constraints.
- `migrations/0001_s01.sql` + `packages/db/src/index.ts` — S01 finding 5: applied-migration ledger, serialized migrator, and safe one-time baseline of a pre-ledger S01 database.
- `packages/db/src/schema.ts` — Drizzle node/edge carriers and S01 finding 10's six missing ledger-entry columns.
- `packages/kernel/src/index.ts` — the ruled graph/lifecycle vocabularies minted once.
- `packages/graph/src/index.ts` — construction refusal/redirect, aggregate write API, collapse-vs-conflict, recursive write-time cycle rejection, snapshot/order materialization.
- `packages/propagation/src/index.ts` — total-order validation, typed compute-cycle error, pure per-edge transmission reductions, and loud S03 boundary instead of fabricated multi-node scores.
- `apps/runner/src/index.ts` — supplies explicit root lifecycle values and persists computed reductions (empty for its legal one-node S00 path).
- `tests/unit/{graph,propagation}.test.ts` — cycle layers 1/3 and DR-071 pure-core fixtures.
- `tests/integration/graph-database.test.ts` + `tests/integration/database.test.ts` — raw migrated-DB fixtures and existing root construction update.
- `tests/architecture/s02-contract.test.ts` — DDL ownership, stable non-identity order, migration-baseline, and Drizzle carrier audits.
- `S02-progress.log` — durable milestone/TDD timeline.

## TDD RED → GREEN evidence

RED command:

```text
pnpm exec vitest run tests/unit/graph.test.ts tests/unit/propagation.test.ts tests/integration/graph-database.test.ts
```

Real RED excerpt:

```text
FAIL tests/unit/graph.test.ts ... constructEdge is not a function
FAIL tests/unit/propagation.test.ts ... expected GRAPH_CYCLE_DETECTED; received S00_PROPAGATION_ONLY_ACCEPTS_ONE_NODE_WITHOUT_ARROWS
FAIL tests/unit/propagation.test.ts ... S00_PROPAGATION_ONLY_ACCEPTS_ONE_NODE_WITHOUT_ARROWS
Test Files 3 failed (3)
Tests 4 failed | 2 passed | 11 skipped (17)
```

The migrated-DB limb independently reached the ruled environment RED:

```text
Error: EMBEDDED_POSTGRES_PROVISIONING_FAILED
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(...)
```

GREEN focused command and real output:

```text
pnpm exec vitest run tests/unit/graph.test.ts tests/unit/propagation.test.ts

Test Files  2 passed (2)
Tests       6 passed (6)
```

## Fixture-by-fixture status

| Fixture | Status | Evidence |
|---|---|---|
| FX-C52-10 layer 1 | GREEN locally | `constructEdge` refuses a cycle and returns `CIRCULAR_DEPENDENCY_FOUND` + typed `shared-crux sub-claim` redirect. |
| FX-C52-10 layer 2 | AUTHORED-DORMANT; outside run required | Recursive reachability executes inside `withGraphWrite` under the per-run advisory transaction lock; DB fixture expects `GRAPH_CYCLE_WRITE_REJECTED`. |
| FX-C52-10 layer 3 | GREEN locally | Pure `evaluate` raises typed `GRAPH_CYCLE_DETECTED` before the S03 arithmetic boundary. |
| FX-DB-03a/03b | AUTHORED-DORMANT | Raw SQL rejects null/empty/whitespace and accepts content; migration retains `NOT NULL` + trimmed-length CHECK. |
| FX-DB-04a/04b | AUTHORED-DORMANT | Raw SQL accepts undercut→support and rejects undercut→attack through graph-scoped composite FK + CHECK. |
| FX-DB-05a/05b | AUTHORED-DORMANT | Aggregate returns the existing id only when `(strength, magnitude_status, strength_source, kind)` matches in full; otherwise typed `EDGE_IDENTITY_CONFLICT`. |
| FX-DB-06a/06b | AUTHORED-DORMANT | Raw SQL covers foreign source, foreign node target, cross-run support-edge undercut, and all in-run complements. |
| FX-DB-08 | AUTHORED-DORMANT + static GREEN | Raw SQL covers malformed polymorphic target, magnitude mismatch, self-edge, polarity/kind mismatch, and illegal producer placement; static DDL contract test is green. |
| FX-PT-ORD | AUTHORED-DORMANT + static GREEN | `graph.materialiseSnapshot` owns `(target_kind, polarity, kind NULLS FIRST, source path, sibling ordinal, created_at_seq)`; two derivations and `propagation_run.arrow_order` persistence are fixtured. |
| DR-071 end to end | Pure limb GREEN; DB limb AUTHORED-DORMANT | Real undercut row → materialized snapshot → pure `deriveTransmissionReductions` → `propagation_run.transmission_reductions`, with no invented S03 score. |

## Acceptance-criteria / design evidence

- AC-15/18/19: one first-class `core.edge` store with node-or-edge target; no parallel undercut table.
- AC-20: all three layers exist and have dedicated fixtures; no fixed-point approximation.
- AC-27/28/35: central closed vocabularies, writable/fenced `UNDERCUT_TRANSMISSION`, typed unknown magnitude, full-payload duplicate comparison.
- AC-32/33/69: migration-owned checks/composite FKs, three lifecycle fields, parent-consistent materialized path, graph-scoped endpoints.
- AC-08/85: one order owner (`graph.materialiseSnapshot`), explicit NULL placement, recorded order, no opaque-id ordering.
- SOLID: graph policy, transactional repository, and pure computation are separate single-purpose seams; callers depend on typed interfaces.
- DDD: the graph aggregate owns node/edge invariants and cycle policy; propagation owns only pure graph computation; migration owns database invariants.
- P7/P12/P13/P17: advisory aggregate transaction; algebraic vocabularies in kernel; recorded deterministic order/reduction; hand-authored canonical DDL with raw fixtures.
- DR-115: no test/fixture import from production (source audit GREEN). Multi-node scoring refuses with `PROPAGATION_SCORING_NOT_IMPLEMENTED` until S03 rather than returning fabricated/default strengths.

## Exact runnable verification

```text
pnpm exec vitest run tests/unit tests/architecture

Test Files  16 passed (16)
Tests       50 passed (50)
```

```text
pnpm run typecheck
$ tsc --noEmit
```

```text
pnpm run lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }
```

```text
pnpm run build
✓ Compiled successfully
✓ Generating static pages (7/7)
```

## S01 non-blocking findings acknowledged

- Fixed where S02 intersects: finding 5 (migration ledger/idempotence, including legacy baseline) and finding 10 (six missing Drizzle ledger columns).
- Partially intersecting P13 finding 3: S02 now derives/validates/records arrow order and transmission reductions; scheduler consumption of lift/selection/cluster behavior remains correctly reachable at S3 and is not invented here.
- Acknowledged, outside this ticket: findings 1/2/7 (replay audit/import proof), 4/8 (S5 eviction behavior), 6 (claim-test ordering), and 9 (FX-WIRE-02 requires the still-missing ruled pagination limit). Grok's live-model/foreign-run ceremony tail remains deferred by DR-126.

## ENVIRONMENT TAIL

Run outside the sandbox, where embedded PostgreSQL is permitted:

```text
pnpm exec vitest run tests/integration/graph-database.test.ts tests/integration/database.test.ts
```

The first file is the S02 gate suite; the second proves no S00/S01 database regression. This handoff does not claim those DB fixtures green until their real output is returned.

### Rework round 1 — outside DB gate 81/82

The outside run returned one FX-DB-08 assertion as unexpectedly resolved. The canonical migration was audited for SQL three-valued `CHECK` behavior. The legal AC-28 pair remains `UNKNOWN + NULL`; `MEASURED + NULL` is now an explicit false branch. Three sibling predicates were also made boolean-total: attack requires non-null kind, an EDGE target requires non-null `undercutting`, and `UNDERCUT_TRANSMISSION` requires a non-null undercut kind. Outside-sandbox rerun evidence is pending.

Local rework verification:

```text
Test Files  3 passed (3)
Tests       10 passed (10)
typecheck  PASS
architecture audit  27 rows / 0 violations
source audit        0 blocking
```

## QUESTIONS FOR V

None. No Git operation, product-data write, Docker-family action, provider call, or invented register value was used.
