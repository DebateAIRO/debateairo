# S09 Codex handoff — Budget and envelope

Ticket: `t_c5e8ec5a`  
Worker session: `019fe271-41d7-7dc2-b283-9ffc90aea8e4` / Kanban run 44  
Assignment: first pass  
Git: working tree only; no Git write operation was performed.

## Outcome

S09 now has a production-attached, register-supplied run cost envelope whose basis is frozen on `core.run`, whose consumption is folded from `ledger.ledger_entry` model-attempt facts, and whose exhaustion produces typed enrichment skips before a visible hard stop. The hard stop serves verified components with `ENVELOPE_EXHAUSTED`; it does not reuse the independent composition-budget `DEFECT` terminal.

The DR-108 split is exact: Q27 and Q49 are enrichment; the remaining 69 rows are correctness. R9 is explicitly protected core and refuses a skip as a ledgered gate outcome. DR-094 tier authority resolves parent → run → deployment, can only raise the asker's declaration, records the asker declaration as provenance, and prints risk tier/source/provenance on Answer. Unreachable `DERIVED` is removed from kernel, contract, and the forward database constraint.

## Inventory

- Domain and runtime: `packages/budget/src/index.ts`, `packages/register/src/index.ts`, `packages/kernel/src/index.ts`, `packages/db/src/index.ts`, `packages/serve/src/index.ts`, `apps/api/src/index.ts`, `apps/api/src/main.ts`, `apps/runner/src/index.ts`.
- Contract and configuration: `packages/contract/src/index.ts`, generated contract artifacts, `packages/register/src/runtime-environment.ts`.
- Workspace wiring: root `package.json`, `pnpm-lock.yaml`, `packages/budget/package.json`, `apps/runner/package.json`.
- Forward DDL: `migrations/0012_s09.sql` replaces the tier-source and ledger-action closed checks replay-safely. No new table was added; the touched `core.run`, `ledger.ledger_entry`, `serve.condition_mark`, and `serve.condition_mark_node` carriers already exist in Drizzle, so S09 introduces no touched-table Drizzle gap.
- Tests: `tests/unit/budget-s09.test.ts`, `tests/unit/register-s09.test.ts`, `tests/architecture/s09-contract.test.ts`, S09 additions to `tests/integration/database.test.ts`, and contract/honesty assertions.
- Honesty: `tools/orphan-audit/src/index.ts`, `reports/orphan-audit.json`, `tests/architecture/scaffold.test.ts`.

The pre-existing modification to `docs/founding/requirements-spec.md` and unrelated working-tree files were not changed or reverted by this ticket.

## Fixture status

- FX-C52-06 — GREEN in pure tests; real-Postgres fixture authored. Q27/Q49 emit `SKIPPED_BY_BUDGET`; R9 emits `REFUSED / PROTECTED_CORE_REFUSES_SKIP`.
- FX-C52-07 — GREEN in pure tests; real-Postgres fixture authored. Exhaustion becomes `COMPONENTS_ONLY + ENVELOPE_EXHAUSTED`, never a timeout and never `DEFECT`.
- FX-LG-05 — GREEN in pure/architecture tests; real-Postgres fixture authored. It inspects ordered progress states `WITHIN → ENRICHMENT_SKIPPED → EXHAUSTED`, ledger outcomes, Answer visibility, and affected nodes.
- FX-LG-06 — GREEN structurally. The exact resolved member is frozen into the immutable run head; a policy change can affect only a later run created against a later sealed register version.
- FX-HR-H8 — GREEN. First evaluation, semantics change, topology/evidence-topology change, and unavailable strengths are typed non-comparisons. Epsilon and the one consolidated defaults row are mandatory typed register reads; no values are defaulted.
- FX-DB-07 — forward DDL plus dormant real-Postgres assertions cover ASKER and policy raise round-trip, lowering refusal, and `DERIVED` refusal.
- FX-SRV-16 — typed mark records require a non-empty affected-node set, persist through both condition-mark tables, and the dormant fixture inspects the actual node projection.
- AC-49 — Answer prints the cost-envelope basis, state, ledger-derived consumption, and `protected_core: NEVER_SKIPPABLE`.
- AC-50 — the resolved depth/risk member, register version, row key, and provenance are copied to the immutable run head and never re-derived during the run.

## TDD RED → GREEN evidence

Initial focused RED:

```text
FAIL tests/unit/budget-s09.test.ts
Error: Cannot find package '@debateai/budget'

FAIL tests/architecture/s09-contract.test.ts
ENOENT migrations/0012_s09.sql
expected runner source to contain 'BudgetRepository'
expected serve source to contain 'INSERT INTO serve.condition_mark'

Test Files 2 failed (2)
Tests 3 failed (3)
```

Register-source audit RED:

```text
FAIL tests/unit/register-s09.test.ts
readRunCostEnvelopePolicy is not a function
readConvergenceControls is not a function

Test Files 1 failed (1)
Tests 3 failed (3)
```

Final runnable GREEN:

```text
$ pnpm run generate:contract
$ pnpm run typecheck
$ pnpm run lint
edgeRowsChecked: 27
violations: []
blocking: []

$ pnpm exec vitest run tests/unit tests/architecture
Test Files 33 passed (33)
Tests 193 passed (193)
```

Focused S09 GREEN before the full runnable suite:

```text
Test Files 5 passed (5)
Tests 22 passed (22)
```

## Environment tail

The real-Postgres fixture is authored behind `tests/support/testDatabase.ts`. Sandbox execution cannot reach the fixture because embedded PostgreSQL fails during `initdb`, exactly as the standing protocol predicts:

```text
$ pnpm exec vitest run tests/integration/database.test.ts
[S00 DB] Testcontainers DEFERRED BY DR-121; starting real embedded PostgreSQL directly
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(key=5144350, size=56, 03600).
Error: EMBEDDED_POSTGRES_PROVISIONING_FAILED
Test Files 1 failed (1)
Tests 27 skipped (27)
```

No test body ran, so this is an environment deferral, not a claimed database green. The orchestrator must run the integration suites outside the sandbox.

## Pattern / quality evidence

- P5: append-only progress-event folds expose current envelope state and consumption.
- P8: risk and cost policy come through typed register resolution with printed supplying provenance.
- P9: budget behavior is an explicit decision pipeline, not exception-as-policy; provider refusal is caught only to materialize the typed hard stop.
- P11 / ADR-0017: budget consumption is `count(MODEL_CALL)` over the attempt ledger, not an in-memory counter. Skip and protected-refusal actions are separately ledgered.
- DR-115: production generates no fixture data. The runner continues to call the one real provider gateway; test provider responses remain test-layer-only.
- AC-76: production contains no envelope, convergence, or tier threshold defaults. Missing rows or unmatched depth/risk members fail loudly.

## S04 review carry-forwards

Intersecting cheap fixes completed:

- Replaced source-literal tier arithmetic in `apps/api/src/main.ts` with the P8 resolver.
- Preserved the already-separated register invalid/provenance error paths.
- Closed the missing S09 condition-mark write path through both existing Drizzle-modeled tables.
- Verified all schema carriers touched by S09 already have Drizzle declarations.

Acknowledged, not expanded into S09: the old CHECK-function dump/restore footgun, migration-parity test breadth, single-judge dispersion wording, uncomposed panel/disagreement helpers, and the production runner's still-missing S04/S05 judgement/serve/terminal register compositions. Those remain honest fail-closed or UNATTACHED rows and need their owning consolidation/composition tickets; inventing their missing register values here would violate AC-76.

## Questions for V

None blocking. Deployment must supply sealed `runCostEnvelope`, `convergenceEpsilon`, and consolidated `convergenceStopDefaults` values; this ticket intentionally supplies types and loud absence behavior, not numeric values.
