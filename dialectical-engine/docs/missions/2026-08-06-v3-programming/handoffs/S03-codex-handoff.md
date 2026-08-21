# S03 · Codex handoff — scoring engine

Worker sessions: original `019fe026-d04b-7880-9634-871de1064717`; resumed sticky rework `019fe0ad-de0d-75f1-823a-3144013a874c` (Hermes run 36)  
Ticket: `t_626f46aa`  
Workdir: `/Users/vladmihaimiron/Documents/DebateAI-V3` (existing V-provided workdir; no branch/worktree/commit/push operation)  
Comments read through: `2026-08-08 12:27` (`CODEX HEARTBEAT`)

## Inventory

- `migrations/0003_s03.sql` — position-label carrier, full per-number scoring receipts, append-only removal-sensitivity records, boolean-total operator/rival constraints and runtime/replay grants.
- `packages/kernel/src/index.ts` — the single closed vocabularies for scoring operators and supplying levels.
- `packages/published-arithmetic/src/index.ts` — exactly the three shared symbols: probabilistic `agg`, tie-safe DF-QuAD `σ`, and no-identity strict `product`.
- `packages/propagation/src/index.ts` — pure scoring strategies, graph validation, transmission reductions, folder-then-ancestor lifting, both-polarity provenance collapse, unjudged/strict withholding, rival reading, canonical fingerprint material and removal sensitivity.
- `packages/graph/src/index.ts` — S02 review entry fixes: typed τ absence via lateral left join; one repeatable-read/read-only client transaction; structural/provenance/position facts; typed provenance key derivation when evidence-producing artifact facts resolve.
- `packages/register/src/index.ts` — mandatory, nonblank/closed operator resolution from parent → run → deployment rows with supplying-level receipt; no operator default or source-literal selection.
- `packages/ledger/src/index.ts`, `packages/db/src/schema.ts` — persistence and Drizzle carriers for every ruled outcome and post-propagation sensitivity rows.
- `apps/runner/src/index.ts`, `apps/scheduler/src/index.ts` — runner records computed cluster/operator/reduction/lift/fingerprint/sensitivity outcomes; replay scheduler consumes the typed operator receipt.
- `tests/unit/scoring.test.ts` — FX-LV-01…09, seeded FX-PT-D1, P-D2/D3, recorded-order/opaque-id bit witnesses, DR-071/DR-127 and DR-072…075, strict withholding, rival reading, fingerprint/flag/position, leverage and both-operator fixtures.
- `tests/architecture/s03-contract.test.ts`, `tests/architecture/scaffold.test.ts`, `tools/orphan-audit/src/index.ts`, `reports/orphan-audit.json` — code-unit/DR-127 source pin, DDL vocabulary parity, purity fence, and the two explicit S02 never-called honesty rows plus their generated report.
- `tests/unit/graph-snapshot.test.ts` — single-client MVCC and typed-absence proof without requiring a local database process.
- `tests/integration/graph-database.test.ts`, `tests/integration/database.test.ts` — migrated PostgreSQL entry/receipt fixtures and compatibility updates.
- `package.json`, `pnpm-lock.yaml` — root test dependency on the published arithmetic package.

## TDD RED → GREEN evidence

First focused RED was a real package-boundary failure:

```text
FAIL tests/unit/scoring.test.ts
Error: Cannot find package '@debateai/published-arithmetic'
Test Files 1 failed | 1 passed (2)
Tests      4 passed (4)
```

The behavior/refactor RED caught a real counterfactual lift defect:

```text
FAIL ... DR-072 applies folder lift before judged-ancestor lift with markers at both ends
TypedDomainError: Folder folder has no structural parent
FAIL ... AC-29 reports removal-based leverage and fragility without feeding either back
expected difference 0.32; received 0.32000000000000006
Test Files 1 failed | 2 passed (3)
Tests      2 failed | 15 passed (17)
```

The fix reparents structural children through a removed node for the removal counterfactual and uses precision-aware assertions. Final focused scoring output:

```text
Test Files  1 passed (1)
Tests       16 passed (16)
```

Rework 1 captured two further genuine REDs before the final GREEN:

```text
DR-127 citation + S02 orphan-honesty contract:
Test Files  2 failed | 1 passed (3)
Tests       2 failed | 23 passed (25)

P13 collapsed-cluster survivor-index witness:
expected 0.30000000000000027 to be 0.30000000000000016
Test Files  1 failed (1)
Tests       1 failed | 19 passed (20)
```

## Fixture-by-fixture status

| Fixture / law | Status | Evidence |
|---|---|---|
| S02 entry 1 | GREEN locally + DB-authored | `LEFT JOIN LATERAL` retains every non-stale node and represents absent τ as `null`; unit client fixture and migrated-DB fixture cover it. |
| S02 entry 2 | GREEN locally + DB-authored | One client owns `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` → both reads → `COMMIT`; rollback/release are explicit. |
| FX-LV-01 / FX-LV-02 | GREEN locally | Required literature values reproduce through `propagation`; the three symbol functions are also asserted directly. |
| FX-LV-03…09 | GREEN locally | Seeded fast-check determinism, non-strict monotonicity, empty/isolated behavior, strict preconditions, and `va == vs` tie behavior. |
| DR-071 / DR-127 | GREEN locally; DB receipt authored-dormant | A typed per-edge reduction applies the ruled subtractive `max(0, contribution - reduction)` form inside propagation, carries the in-code DR-127 citation, serves exactly `0.75` in the named fixture, and is recorded on `propagation_run`. |
| DR-072 / DR-075 | GREEN locally; DB receipt authored-dormant | Folder lift precedes judged-ancestor lift; both records have markers at source and target plus ordinal; pending/unjudged nodes get no τ and children lift transparently. |
| DR-073 / FX-PT-D3 | GREEN locally; DB receipt authored-dormant | Both support and attack clusters collapse; typed key uses evidence provenance + producing run/model family; keyless members get real singleton records; strongest propagated contribution survives. |
| DR-074 / FX-PT-D2 | GREEN locally; DB receipt authored-dormant | Mandatory deployment row, optional run/parent overrides, closed-value validation, supplying level and operator recorded; missing deployment row fails loudly. |
| AC-26 | GREEN locally | Strict-and with an unjudged/abstained surviving conjunct returns a typed withheld record and no parent number; no product identity/default τ is invented. |
| FX-PT-FLG / FX-PT-POS | GREEN locally | The restatement flag is structurally absent and changes no strength; position is carried descriptively and never re-encoded into arithmetic. |
| FX-HR-H4 | GREEN locally | One four-support tree produces `0.96875` under accumulate and `0.53125` under strict-and, with the rival number and both operator receipts. |
| Graph fingerprint | GREEN locally | Canonical material ignores input-array order, changes with τ, and changes with operator; all structural outcomes are included. |
| AC-29 / FX-C52-09 | GREEN locally; DB receipt authored-dormant | Removal-based difference yields leverage ranking + fragility rows without feedback; K=1 residual is exactly `LEVERAGE_UNRESOLVED` and names the carrying node. |
| Replay receipts | AUTHORED-DORMANT | The real-PostgreSQL fixture reads operator/level, rival, support ids, position, cluster/operator run JSON and sensitivity row count from migrated tables. |

## Acceptance / design evidence

- AC-14/80: one propagation engine uses the published three-symbol arithmetic and reproduces both literature vectors.
- AC-21/26: τ absence stays typed; no default exists; accumulate transparency and strict-and withholding remain distinct.
- AC-22/74: operator selection is a strategy selected only from resolved register data; mandatory deployment and supplying level are enforced and recorded.
- AC-23: cluster key is a typed provenance value object, scoped by target and polarity; strongest propagated member wins; keyless singleton is explicit.
- AC-25/31: restatement flag cannot enter the snapshot type; position label is carried but never changes arithmetic.
- AC-29: sensitivity is computed after propagation as removal-based output, stored after its propagation run, and is absent from `EvaluationSnapshot`.
- AC-63/P13: produced numbers retain τ origin, way of knowing, judgement/abstention facts, supporting/attacking ids, operator/level, position, lift markers, rival and replay metadata.
- DDD/SOLID: kernel owns closed vocabulary; graph owns materialization; register owns resolution; strategy objects own operator variation; propagation is pure; ledger owns append-only receipts.
- DR-115: no runtime fixture/default score/evidence/judgement path was added. Unknown magnitude and τ absence remain typed non-numbers or withheld outcomes. Source audit is green.

## Exact runnable verification

```text
pnpm exec vitest run tests/unit tests/architecture

Test Files  19 passed (19)
Tests       73 passed (73)
```

```text
pnpm typecheck
$ tsc --noEmit
```

```text
pnpm lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }
```

```text
pnpm build
✓ Compiled successfully
✓ Generating static pages (7/7)
```

## S01/S02 review findings acknowledged

- Fixed both explicit S03 entry conditions from the S02 diamond: judgement-less-node loss and split MVCC reads.
- Removed the dead S02 `continue`; every required DDL string is now asserted.
- Added honest never-called rows for `packages/graph.constructEdge` and `packages/graph.GraphWriter.addEdge`, whose present callers are fixtures.
- Kernel/DDL scoring-vocabulary parity is pinned. S02's concurrency stress fixture, legacy nonempty-baseline caveat, and extra raw-unknown-member cases remain acknowledged and outside this correction.
- S01 findings 5 and 10 were already fixed in S02. Other S01 carry-forward items remain acknowledged as recorded in the S02 handoff; S03 does not touch their replay/eviction/claim/pagination scopes.

## ENVIRONMENT TAIL

The complete local run reached the protocol-predicted environment failure, not a test assertion:

```text
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(...)
Test Files 2 failed | 19 passed (21)
Tests      73 passed | 34 skipped (107)
```

Run outside the sandbox and return the exact result before approval:

```text
pnpm exec vitest run tests/integration/graph-database.test.ts tests/integration/database.test.ts
```

The first outside run subsequently returned `20 files / 101 tests PASS` against embedded PostgreSQL 18.4. Rework 1 then extended migration `0003_s03.sql` with the ruled folder carrier and added six local tests, so one final outside rerun of the current `107`-test suite is required by the orchestrator.

## Rework round 1

The first diamond returned two convergent implementation blockers plus one newly discovered ruling gap.

- FX-PT-D1 is now a named seeded fast-check property over arbitrary unjudged/abstained subsets. It asserts no number for those nodes and byte-identical accumulate output to the graph containing judged children alone.
- Recorded `arrowOrder` now supplies an explicit index carried through collapse; the selected surviving member's index governs support/attack folding. Cluster ties retain the first recorded member. Opaque-id renaming is bit-invariant, no locale ordering participates in a number, and canonical fingerprint sorting uses the named code-unit comparator.
- Real RED witness:

```text
P13 consumes recorded arrow order in the IEEE-754 aggregation fold
expected 0.30000000000000027 to be 0.30000000000000016
Test Files 1 failed (1)
Tests      1 failed | 17 passed (18)
```

- DR-127 closes the former arithmetic ruling gap: the clamp site cites the ruling and the named DR-071/DR-127 fixture asserts exact `0.75`.
- Cheap directed findings fixed: abstained interior transparency, production `is_folder` carrier, named FX-LV-09, stronger general multi-arrow monotonicity generators, kernel/DDL scoring-vocabulary parity, S02's dead `continue`, S02 orphan honesty rows, and clock/randomness purity auditing.
- Current local evidence: `19 files / 73 tests PASS`; typecheck PASS; 27 architecture rows / 0 violations; source `blocking: []`; production build PASS.
- Acknowledged without churn: graph snapshot operator attachment still requires an upstream register-backed resolution carrier before it can have a production call site; the currently nullable receipt fields identified by Claude remain visible technical debt. Entry conditions, functional-core purity, P8 resolution behavior, and DR-115 were reviewer-verified and were not redesigned in this rework.

## QUESTIONS FOR V

None for this rework. DR-127 is implemented exactly. The mandatory deployment operator's value remains V's at DR-023; no register value was invented, and evaluation without a supplied register-backed resolution still fails loudly as `OPERATOR_RESOLUTION_MISSING`.
