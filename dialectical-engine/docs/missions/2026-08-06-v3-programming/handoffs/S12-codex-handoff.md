# S12 Codex handoff — Settlement and scorecards

Ticket: `t_53f024c1`  
Worker session: `codex-goal-019fe2f7-7ff8-7843-98b4-8592fff6af1d` / Kanban run 48  
Assignment: first pass; session ticket 1/2  
Git: shared working tree only; no Git write operation was performed.

## Outcome

S12 lands immutable resolution attempts, complete read-back verification, a
registered proper-score seam, pure ledger-derived scorecard cells, model
identity and routing ledgers, all eight recorded routing guards, DR-080 task
class mapping resolution, and VR-1's descriptive rate-consistency monitor.

Settlement is first-settled-wins under an identity-scoped transaction lock.
The winner remains accepted; a later attempt is not erased or silently
ignored, but is appended with a pointer to the winning outcome and its own
`SETTLEMENT_ATTEMPT_SUPERSEDED` plus read-back action. Scorecard cells are new
derivation versions over accepted frozen outcome rows. No scorecard update or
delete path exists, and database triggers reject mutation of all five S12
tables. The model/version/provider identity is separately recorded, so a
provider model-version change wakes a distinct cell instead of borrowing old
calibration.

The DR-089 standing watch is now a published third scheduler job. It is
outside the run lifecycle, refuses supplied outcomes without a registered
policy, checks for a persisted TERMINAL event before writing, and has a
separate `SETTLEMENT_DATABASE_URL` credential surface. Migration grants scope
that principal to the completion predicate, scorecard reads/inserts, ledger
append, and sequence allocation. The orphan audit derives the watch,
repository, and pure scorecard fold as ATTACHED from the scheduler CLI; no
hand-authored attachment assertion can make them green.

DR-080's VG-02 card explicitly defers mapping contents to a later ruling. S12
therefore ships the provenance-carrying exact-pair resolver and fails typed
loud on an absent or ambiguous `(settlement act, question type)` pair; it does
not invent production entries. Likewise, routing exploration share and
detectability sample thresholds are supplied through a versioned policy
receipt. All synthetic values are labeled test-layer fixtures and are
unreachable from production configuration.

## Inventory

- Pure settlement, scorecard, DR-080, VR-1, routing, and repository behavior:
  `packages/settlement/src/index.ts`.
- Append-only carriers and least-privilege principals:
  `migrations/0015_s12.sql`.
- Complete Drizzle mirrors: `packages/db/src/schema.ts`.
- Independent watch: `apps/scheduler/src/index.ts`,
  `apps/scheduler/src/cli.ts`, root `job:settlement-watch`, and
  `packages/register/src/runtime-environment.ts`.
- Reachability: `tools/orphan-audit/src/index.ts` and generated
  `reports/orphan-audit.json`.
- Tests: `tests/unit/settlement-s12.test.ts`, the updated scheduler unit,
  `tests/architecture/s12-contract.test.ts`, and
  `tests/integration/settlement-database.test.ts`.
- Workspace dependency/lock updates: `package.json` and `pnpm-lock.yaml`.

## Fixture and AC evidence

- **FX-S22-03 / AC-40..43:** at t=0 the exact cell has `basis=NONE`, null
  value/interval, and `n=0`. One labeled resolved outcome receives the
  registered decomposed score and produces a different, replay-stable cell
  with its outcome/sequence derivation input.
- **FX-PT-D5 / DR-077:** the same reduced judgements under constant `1.0`
  versus ledger-earned weights select different actual judgements. The test
  asserts the real served-selection target, not an intermediate arithmetic
  curiosity.
- **FX-ORPH-05:** fallback, exploration, and learned routing are all produced
  by valid test-layer configuration; cold routing is byte-identical to having
  no scorecard.
- **FX-LG-09:** the decision receipt records G1..G8, exact task class,
  propensity, and policy provenance. Panel routing stays uniform, critic
  routing is exempt, interval overlap falls back, self-routing is refused,
  and no expected-answer value enters the interface.
- **FX-LG-10 / AC-73:** cell value, interval, population carrier,
  decomposition, exact model identity, derivation input/hash, strategy
  receipt, and derivation version are pure functions of immutable outcome
  rows. The read surface returns latest cells only and exposes no leaderboard.
- **DR-089 / Q61:** the real-database fixture covers incomplete-run refusal,
  accepted winner, recorded superseded loser, separate read-back actions,
  scorecard materialisation after completion, append-only rejection, and an
  unchanged MODEL_CALL attempt count through settlement.
- **VR-1:** zero observations produce typed `NONE`; observed disagreement
  produces `MEASURED_PROCESS`, rate, declared price, absolute difference, and
  `n`. No unruled pass/fail threshold was minted.
- **DR-080:** one provenance-bearing supplied pair resolves; missing or
  duplicate pairs fail loud. VG-02-deferred values remain unsupplied.

## TDD RED → GREEN

Initial focused RED:

```text
$ pnpm exec vitest run tests/unit/settlement-s12.test.ts tests/architecture/s12-contract.test.ts
Test Files 2 failed (2)
Failures: Cannot find package '@debateai/settlement'; ENOENT migrations/0015_s12.sql;
published settlement-watch entry point absent.
```

Final local gates:

```text
$ pnpm typecheck
$ tsc --noEmit
exit 0

$ pnpm lint
edgeRowsChecked: 27
violations: []
blocking: []

$ pnpm exec vitest run tests/unit tests/architecture
Test Files 40 passed (40)
Tests 223 passed (223)

$ pnpm run audit:orphans
s12Surface:
  packages/settlement.deriveScorecardCell               ATTACHED
  packages/settlement.SettlementRepository.settle       ATTACHED
  apps/scheduler.runSettlementWatch                     ATTACHED
exit 0

$ pnpm build
Next.js: Compiled successfully; 7/7 static pages generated
exit 0
```

## Real PostgreSQL gate / environment tail

`tests/integration/settlement-database.test.ts` is authored behind the one
real-PostgreSQL seam. The local attempt failed during embedded PostgreSQL
bootstrap, before migration or either test body executed:

```text
$ pnpm exec vitest run tests/integration/settlement-database.test.ts
[S00 DB] Testcontainers DEFERRED BY DR-121; starting real embedded PostgreSQL directly
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(...)
Error: EMBEDDED_POSTGRES_PROVISIONING_FAILED
Test Files 1 failed (1)
Tests 2 skipped (2)
```

This is the mission protocol's known sandbox tail and is not represented as a
database-green result. The orchestrator must run outside the managed sandbox:

```text
pnpm exec vitest run tests/integration/settlement-database.test.ts
pnpm test:s00
```

### Review rework 1 — valid answer identity in the database fixture

The first outside-sandbox gate executed the full database inventory and
returned **271/272**. Production settlement had not run in the one failing
test: its hand-written `serve.answer` fixture omitted the schema-required
`answer_version`, so PostgreSQL correctly rejected the setup before the
settlement assertions.

The fixture now supplies `answer_version = 1`, matching both the subsequent
settlement envelope and the identity written by `ServeRepository.persist`.
No production code or NOT NULL constraint was relaxed. Local typecheck and
the 223 unit/architecture tests remain green; the fresh outside-sandbox
settlement-database rerun is pending.

### Review rework 2 — S12 execution-ledger closed vocabulary

The second outside-sandbox gate again returned **271/272** and reached the
production settlement transaction. PostgreSQL correctly rejected
`SETTLEMENT_OUTCOME_RECORDED` because S12 had not forward-expanded the
closed `ledger_entry_action_kind_closed` vocabulary.

All four emitted S12 siblings are now minted once in
`kernel.LEDGER_ACTION_KINDS`: outcome recorded, superseded attempt, read-back
verified, and scorecard derived. They are `PRE_ITEM` for the existing symmetry
census because they are post-debate settlement/control facts rather than
support/attack item work. Migration 0015 replay-safely drops and re-adds the
full CHECK member set. The S12 architecture test enforces kernel/DDL parity
for every sibling and the intended scope. The fresh outside-sandbox database
rerun is pending.

## Carry-forwards and deferrals

- S04 rev2's Drizzle lag intersects this carrier-heavy slice. The current
  `reducedJudgementRef` foreign reference was already forward-corrected, and
  S12 adds complete Drizzle mirrors for every new table.
- S04 rev2's production composition-map read/discard issue was already closed
  in the current runner, which passes the resolved row into judgement. S12
  does not reopen that path.
- S04's panel/dispersion/correlation/declared-disagreement/non-answer pure
  seams remain honestly listed as UNATTACHED; attaching those runner paths is
  outside S12. VR-1 consumes recorded disagreement facts only.
- The orchestrator's runner-main fail-closed evaluator carry-forward does not
  intersect the independent scheduler root and remains acknowledged.
- S11's QUERY timestamp and sticky STALE advisories do not intersect S12;
  settlement reads only the persisted TERMINAL predicate and never liveness
  state.
- The existing user change to `docs/founding/requirements-spec.md` and all
  unrelated working-tree material were preserved.

## Questions for V

None. VG-02 explicitly records the DR-080 mapping values as deferred, so the
conservative lawful result is a complete loud mechanism with no fabricated
production contents.

## Review focus

Please run the database gate outside the sandbox, then scrutinize migration
0015 grants/replay, first-wins concurrency, the full read-back comparison,
derivation-version append behavior, model-version cell separation, exact
propensity receipts, and the source-derived S12 attachment report. No Git
operation was performed.
