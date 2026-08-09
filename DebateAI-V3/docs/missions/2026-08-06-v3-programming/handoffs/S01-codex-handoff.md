# S01 Codex handoff — ledger and replay hardening

Status: **READY FOR PEER REVIEW (ENVIRONMENT TAIL OPEN)**  
Ticket: `t_24c030d2`  
Worker/session: Codex GPT-5.6 Sol / `019fdff1-e127-7a92-bbf7-eaa468e7c2a8`  
Workspace: `/Users/vladmihaimiron/Documents/DebateAI-V3`  
Git: untouched; no branch, worktree, commit, push, merge, or other Git operation performed.  
Comments read through: board comment `CODEX: GREEN MILESTONE` at 2026-08-08 09:14 Europe/Bucharest.

## Outcome

S01's code and test carriers are implemented. The ledger now carries the raw-artifact input/contract/content hash triple, a closed action vocabulary including `JUDGEMENT_SCHEDULED` and the `UNCLASSIFIED_ACTION` fall-through, and an allocator-cutoff completeness gate. Four reconstruction APIs refuse missing evidence rather than manufacturing scores. The launch replay ceremony reads Postgres directly, imports exactly `agg`, `σ`, and `product` from the zero-dependency published-arithmetic package, validates a falsifiable read-only operator attestation, consumes all currently recorded structural outcomes as frozen data, and compares IEEE-754 bytes.

The continuous scheduler limb now consumes recorded `arrow_order`, `cluster_records`, and `operator_by_parent` and calls the `serve` eviction writer. It refuses a future structural shape it cannot yet reconstruct instead of silently substituting empty data.

## Inventory

Production/runtime:

- `migrations/0001_s01.sql` — raw hash triple, closed ledger action check, frozen propagation structural columns.
- `packages/kernel/src/index.ts` — ledger action vocabulary, scope classification, unclassified fall-through.
- `packages/ledger/src/index.ts` — normalized append, hash-triple persistence, allocator-cutoff completeness gate, four reconstruction paths.
- `packages/published-arithmetic/src/index.ts` — exported surface exactly `agg`, `σ`, `product`.
- `apps/replay/src/index.ts`, `apps/replay/src/cli.ts`, `apps/replay/package.json` — isolation receipt, operator attestation, exact ceremony, read-only CLI.
- `apps/scheduler/src/index.ts`, `packages/serve/src/index.ts` — recorded-order continuous replay and single-owner eviction write.
- `packages/providers/src/index.ts`, `apps/runner/src/index.ts` — input/contract hashes on every real raw artifact and `JUDGEMENT_SCHEDULED` before the gateway call.
- `packages/db/src/index.ts`, `packages/db/src/schema.ts` — ordered migration loading and Drizzle carriers aligned with touched SQL schema.
- `tools/orphan-audit/src/index.ts` — symbol-granularity import pin, exported-surface pin, local-arithmetic rejection.
- `packages/battery/src/index.ts`, `packages/register/src/{index,runtime-environment}.ts` — unknown predicate-input rows fail loud; dead environment exports removed.
- root `package.json` — replay ceremony command.

Tests/evidence:

- `tests/unit/replay.test.ts` — FX-IND-01/02/03 and FX-LG-01b.
- `tests/unit/kernel.test.ts` — FX-LED-03.
- `tests/unit/scheduler.test.ts` — P13 recorded-order regression.
- `tests/integration/database.test.ts` — FX-DB-01a/01b/02, FX-LED-01a/01b/02/04/05, allocator order, raw immutability, and BLOCKED-artifact redelivery.
- `docs/missions/2026-08-06-v3-programming/handoffs/S01-progress.log` — durable heartbeat.

## TDD RED → GREEN

RED command:

```text
pnpm exec vitest run tests/unit/replay.test.ts tests/unit/kernel.test.ts
```

RED output (real):

```text
Test Files  2 failed (2)
Tests       5 failed | 4 passed (9)
Missing: LEDGER_ACTION_KINDS/classifyLedgerActionKind,
REPLAY_ISOLATION_PROOF, validateOperatorAttestation,
runLaunchReplayCeremony.
```

Adjacent P13 RED command/output (real):

```text
pnpm exec vitest run tests/unit/scheduler.test.ts
Test Files  1 failed (1)
Tests       1 failed | 1 passed (2)
Failure: promise resolved { checked: 1, evicted: [] } instead of rejecting
the unsupported recorded arrow order.
```

Final in-sandbox GREEN command:

```text
pnpm run typecheck && pnpm exec vitest run tests/unit tests/architecture && pnpm run lint
```

Final output (real, 2026-08-08 09:15 Europe/Bucharest):

```text
$ tsc --noEmit

Test Files  14 passed (14)
Tests       42 passed (42)

architecture audit:
{ "edgeRowsChecked": 27, "violations": [] }

source audit:
{ "blocking": [] }
```

## Fixture evidence

| Fixture | Evidence | Status |
|---|---|---|
| FX-LG-01b | `tests/unit/replay.test.ts`; Float64 byte comparison; no model/provider import; frozen structural-field list asserted | code path GREEN; real foreign-run ceremony in Environment Tail |
| FX-IND-01 | Runtime isolation receipt plus source audit checks exact imported symbols and rejects local `agg`/`σ`/`product` declarations | GREEN |
| FX-IND-02 | Source audit parses the actual `published-arithmetic` exports; unit test checks module keys | GREEN |
| FX-IND-03 | Validator requires named principal, exact `READ_ONLY` scope, non-empty replayed ids, and zero overlap with produced ids | GREEN; real operator artifact in Environment Tail |
| FX-LED-01a | Real-Postgres test schedules an item without an artifact; propagation rejects and row count stays zero | authored; outside-sandbox run owed |
| FX-LED-01b | Real-Postgres test links an `UNPARSED` raw artifact and proves propagation is admitted | authored; outside-sandbox run owed |
| FX-LED-02 | `rebuildFromArtifacts`, `readStoredResultVerbatim`, `resumePartial`, `assertComplete`; missing-evidence codes asserted | authored; outside-sandbox run owed |
| FX-LED-03 | Unknown action maps to stored `UNCLASSIFIED_ACTION`; original spelling is retained in `call_site_key`; DDL vocabulary closed | unit GREEN; DB limb authored |
| FX-LED-04 | Both stamps asserted over MODEL_CALL, JUDGEMENT_SCHEDULED, PROPAGATION, SERVE, and unknown fall-through | authored; outside-sandbox run owed |
| FX-LED-05 | Two artifacts with equal input/content hashes and different contract hashes remain distinct new rows; UPDATE/DELETE rejected | authored; outside-sandbox run owed |
| FX-DB-01a/01b | Raw SQL UPDATE and DELETE against `core.run` both reject | authored; outside-sandbox run owed |
| FX-DB-02 | Existing atomic run-start fixture proves three initial progress events + 71 activation events; empty stream is a typed error | authored; outside-sandbox run owed |
| P13 carry-forward | Scheduler consumes recorded arrow order and refuses unsupported non-empty order; eviction write delegated to `ServeRepository` | unit GREEN |

## Acceptance-criteria evidence

- AC-05 / AC-45: existing grants + raising triggers remain on the run/event/ledger/raw tables; new raw immutability fixtures exercise the migrated database directly.
- AC-06 / AC-07: ceremony has no model path, reads frozen rows only, and compares stored/recomputed Float64 bytes.
- AC-08: ledger order remains the dedicated allocator; propagation takes the allocator lock before its completeness cutoff, so no timestamp or empty interleaving decides the gate.
- AC-10: raw artifacts persist separate input, contract, and content hashes; input construction excludes contract; differing contract identities create distinct rows.
- AC-11: required set is the distinct `JUDGEMENT_SCHEDULED` population; any linked raw artifact satisfies regardless of parse status.
- AC-14 / AC-85: one published arithmetic implementation; replay has no local arithmetic; continuous replay calls propagation and serve owners.
- AC-47: all four reconstruction paths expose persisted evidence/values or typed absence, never a synthetic score.
- AC-50 / AC-74 / AC-83: run-head immutability remains enforced; no values were invented; no reconstruction/cache path mutates activation state.

## DDD / SOLID / patterns

- DDD: ledger owns reconstruction and completeness; serve owns eviction; replay reads frozen facts without importing context packages; domain terms mirror ADR-0006/0012.
- SOLID: the ceremony, attestation validator, ledger repository, and serve writer each have one responsibility; Pool and provider boundaries stay injected.
- P10: allocator order, named hashes, distinct contract identity, append-only correction.
- P13: recorded structure consumed; unsupported structure refused, never re-derived/defaulted.
- P18: isolation and operator evidence are typed and falsifiable rather than prose/log assertions.
- DR-115: test rows stay in tests; runtime reconstruction contains no fixture fallback and no fabricated score path.

## Deferrals acknowledged

- DR-121: no Docker-family or container action was taken.
- S00 rev-1 deferrals 10/13/17/19/20 remain outside touched scope. Drizzle divergence (12) was repaired for every S01-touched table. Scheduler arrow order (18) was repaired here.
- Multi-node scoring lands in S3. Both replay limbs now fail loud on a non-empty structural shape they cannot yet evaluate; they do not fabricate an empty snapshot.
- The architecture-wide S1 fixture map also mentions FX-WIRE-02, while this ticket's verbatim gate list does not. No pagination limit/default was invented because the required DR-023 register values are absent; no API/contract file was touched.

## ENVIRONMENT TAIL

1. Run the authored real-PostgreSQL suite through the outside-sandbox seam and paste the complete output into this handoff/review:

   ```text
   pnpm exec vitest run tests/integration/database.test.ts
   ```

   Expected inventory: one file, 20 tests; no Docker-family runtime is used.

2. Run the ceremony against at least one pre-existing served run that S01 did not produce, using the database's read-only replay principal and a real JSON attestation:

   ```text
   pnpm run replay:ceremony -- <read-only-postgres-url> <operator-attestation.json>
   ```

   The attestation must name the actual principal, `credentialScope: "READ_ONLY"`, the replayed run ids, and the run ids that principal produced. A replayed/produced overlap is rejected.

3. NQ-3 remains the external prerequisite for producing a new real served run: no non-Docker model runtime/API credential exists. This does not authorize a fixture-backed run (DR-115).

### Rework round 1 — orchestrator DB gate

The 2026-08-08 09:25 outside-sandbox gate reported 61/62 and an append-only
`ledger_entry` mutation. A repository-wide SQL search found no runtime mutation;
the only `UPDATE ledger.ledger_entry` is the P17 raw-connection negative fixture
that proves the trigger raises. The fixture is now explicit about the complete
repair law: the attempted UPDATE rejects, a correction is appended under a later
allocator sequence, and a raw read proves the original row remains `OK` while
the new row carries `FAILED`. No synthetic terminal action kind was invented,
and the exhausted-attempt runtime path continues to append provider attempt rows
while mutating only the expressly mutable `core.work_item` queue.

### Rework round 2 — queue-test isolation

The outside DB rerun proved the append correction, then exposed that FX-DB-01
created a READY work item merely to obtain a run id. The later `claimNext` test
correctly chose that older READY item under ADR-0017, so its expectation was not
hermetic. The run fixture now creates only the frozen run head/events; it does
not enqueue unrelated work. Queue semantics were not weakened: FAILED remains
non-claimable, while `claimNext` still selects the oldest READY or expired
CLAIMED item under `SKIP LOCKED`.

## QUESTIONS FOR V

None. The known live-model prerequisite remains recorded as NQ-3; no question gates the code handoff.

READY FOR PEER REVIEW — S01 (ENVIRONMENT TAIL OPEN)
