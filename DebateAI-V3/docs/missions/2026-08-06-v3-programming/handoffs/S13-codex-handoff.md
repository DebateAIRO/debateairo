# S13 Codex handoff — Cross-run memory

Ticket: `t_e4081556`  
Worker session: `codex-goal-019fe2f7-7ff8-7843-98b4-8592fff6af1d` / Kanban run 49  
Assignment: first pass; session ticket 2/2  
Git: shared working tree only; no Git write operation was performed.

## Outcome

S13 lands an append-only cross-run memory aggregate: frozen question-key
projections, a PostgreSQL four-tier match ladder, directed link and link-event
records, confirmed alias/revocation carriers, content-pinned pulls, weak-candidate
records, current disclosure projection, and asker-owned unlink.

PostgreSQL selects the highest firing tier in the order `EXACT_QUESTION`,
`SAME_BINDING`, `PARTIAL_BINDING`, `TERM_OVERLAP`; the domain matcher independently
reconstructs the typed agreement fact and fails with
`MEMORY_MATCH_PREDICATE_DRIFT` if the two declarations diverge. `NULL` is never
agreement. Exact/same-binding facts auto-link, while weaker facts append a visible
candidate-not-linked record. No closure table, closure function, or closure job
exists.

Every actual pull is pinned with artifact id/version/hash/as-of/staleness plus the
supplying cap row/version/source. A prior verdict is recorded with
`DISCLOSURE_ONLY` admissibility and is not introduced as evidence. Pull-cap values
are supplied by a provenance-bearing policy; no production number or unstated
register value was invented.

The runner reads persisted memory before building the fact bundle and adds a
reserved, deterministic `memory:disclosure` segment. Its validator makes the
three disclosure gates executable: no sentence without a typed match/candidate
fact, non-exact tier and differences survive exactly, and pull-time staleness is
inside the sentence. The composition model cannot claim the reserved segment id.
A later served-verdict disagreement appends a `CONTRADICTS_PRIOR` successor link,
copies the frozen pins, supersedes the earlier relation by event, and fires a
typed revision trigger for the prior answer. Unlink is also an event; no frozen
answer, run, link, alias, or pull row is mutated.

## Inventory

- Domain aggregate and repositories: `packages/memory/src/index.ts` and
  `packages/memory/package.json`.
- Append-only PostgreSQL carriers and grants: `migrations/0016_s13.sql`.
- Complete Drizzle mirrors: `packages/db/src/schema.ts`.
- API/serve/runner attachment: `apps/api/src/index.ts`,
  `apps/runner/src/index.ts`, `packages/serve/src/index.ts`, and the API, runner,
  serve workspace manifests.
- Wire disclosure schema and generated contract: `packages/contract/src/index.ts`
  and generated contract output.
- Reachability: `tools/orphan-audit/src/index.ts` and generated
  `reports/orphan-audit.json`.
- Tests: `tests/unit/memory-s13.test.ts`, updated API/contract/serve fixtures,
  `tests/architecture/s13-contract.test.ts`, and
  `tests/integration/memory-database.test.ts`.
- Shared terminal answer fixture: `tests/support/settledRun.ts`; it persists
  through `ServeRepository.persist` exactly once and then settles the work item.
- Workspace dependency/lock updates: `package.json` and `pnpm-lock.yaml`.

## Fixture and AC evidence

- **FX-S22-04 / AC-68:** empty disclosure attachment is byte-inert; no match fact
  renders no sentence. The four ordered PostgreSQL predicates and pure parity
  matcher cover exact, complete binding, declared-subset agreement, and frozen-term
  overlap. Same-asker partitioning and null-not-agreement are asserted.
- **FX-S22-04 / AC-70 / AC-75:** the real-DB fixture creates the prior Answer only
  through `ServeRepository.persist`, then settles it through
  `SettlementRepository`. The repeat creates one content-hashed pull carrying the
  complete cap receipt, serves the disclosure, and rejects mutation directly at
  PostgreSQL.
- **FX-S22-04 / AC-71:** question keys and pulls carry the requesting user's
  `asker_id`; a different asker produces no match. The unlink lookup also joins
  answer → run and requires that same asker identity.
- **FX-PT-MEM / AC-69:** a property test proves A→B plus B→C never manufactures
  A→C. The real-DB fixture additionally asserts exactly one direct current→prior
  link and zero links to any third run.
- **Three serve gates:** focused tests show exact and non-exact positive sentences,
  negative candidate disclosure, typed refusal of a sentence without facts, and
  refusal when staleness is changed. The production runner calls the same validator.
- **Contradiction wake:** reachability derives the runner call to
  `observeAnswerContradiction`; the write appends `CONTRADICTS_PRIOR` plus
  `core.revision_trigger(trigger_kind='CONTRADICTS_PRIOR', state='FIRED')`.
- **Unlink:** API unit coverage proves authentication and principal forwarding;
  the DB fixture proves read-time disappearance and append-only mutation rejection.

## TDD RED → GREEN

Initial focused RED:

```text
$ pnpm vitest run tests/unit/memory-s13.test.ts tests/architecture/s13-contract.test.ts
Test Files 2 failed (2)
Failures: Cannot find package '@debateai/memory'; ENOENT migrations/0016_s13.sql;
s13Surface absent.
```

Final local gates:

```text
$ pnpm typecheck
$ tsc --noEmit
exit 0

$ pnpm run lint
edgeRowsChecked: 27
violations: []
blocking: []

$ pnpm vitest run tests/unit tests/architecture
Test Files 42 passed (42)
Tests 234 passed (234)

$ pnpm run audit:orphans
s13Surface: matcher, record/match, disclosure read, disclosure validator,
unlink, and contradiction observer all ATTACHED
exit 0

$ pnpm run build
Next.js: Compiled successfully; 7/7 static pages generated
exit 0
```

## Real PostgreSQL gate / environment tail

`tests/integration/memory-database.test.ts` is authored behind the one real
PostgreSQL seam and uses the real answer persistence path required by the S13
orchestrator note. The managed-sandbox attempt stopped before migration or the
test body:

```text
$ pnpm vitest run tests/integration/memory-database.test.ts
[S00 DB] Testcontainers DEFERRED BY DR-121; starting real embedded PostgreSQL directly
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(...)
Error: EMBEDDED_POSTGRES_PROVISIONING_FAILED
Test Files 1 failed (1)
Tests 1 skipped (1)
```

This is the standing protocol's known SysV sandbox tail, not a claimed DB-green
result. The orchestrator must run outside the managed sandbox:

```text
pnpm vitest run tests/integration/memory-database.test.ts
pnpm test:s00
```

### Database-gate rework 1 — PostgreSQL JSON predicate

The first outside-sandbox inventory ran **282/283** and reached the real S13
match query. PostgreSQL correctly rejected `jsonb_object_length(jsonb)`: that
function does not exist. This was a production SQL defect, not a fixture issue.

The complete-binding predicate needs only prove that the already-checked JSON
object is non-empty. It now uses the native comparison
`current.normalized_binding <> '{}'::jsonb`. The architecture test forbids the
nonexistent spelling and pins the replacement. The S13 SQL audit found the
remaining JSON calls to be PostgreSQL 18 functions: `jsonb_each`,
`jsonb_array_elements_text`, and `jsonb_typeof`. Focused/type/lint gates are
green.

### Database-gate rework 2 — one terminal event and a shared fixture path

The second outside-sandbox inventory again ran **282/283**. It confirmed the
production JSON predicate fix, then exposed a test-fixture defect: the S13 test
called `ServeRepository.persist`, which correctly emits the run's sole terminal
event, and then inserted a second terminal event by hand. PostgreSQL correctly
rejected the duplicate under `run_one_terminal_event`.

The direct insert is removed. S13 now uses the shared
`tests/support/settledRun.ts::persistTerminalRun` helper for both prior and
current answers. The helper owns one production `ServeRepository.persist` call
and one `WorkItemRepository.settle` call; it contains no progress-event insert.
An architecture regression requires S13 to import that helper and forbids a
direct `core.run_progress_event` insert in the fixture. Fresh evidence:

```text
$ pnpm vitest run tests/unit/memory-s13.test.ts tests/architecture/s13-contract.test.ts
Test Files 2 passed (2)
Tests 9 passed (9)

$ pnpm vitest run tests/unit tests/architecture
Test Files 42 passed (42)
Tests 234 passed (234)

$ pnpm typecheck
$ tsc --noEmit
exit 0

$ pnpm run lint
edgeRowsChecked: 27
violations: []
blocking: []
```

The fresh managed-sandbox database attempt again stopped in `initdb` at the
known SysV `shmget(...): Operation not permitted` boundary before any migration
or test body. The corrected fixture therefore requires the same outside-sandbox
rerun.

## Carry-forwards and deferrals

- S04 rev2's Drizzle-lag carry-forward intersects this carrier-heavy slice and is
  fixed here: all seven memory tables and the Answer disclosure column have
  Drizzle mirrors, enforced by the S13 architecture test.
- S04's unattached panel/dispersion/correlation/declared-disagreement/non-answer
  seams remain honestly reported and were not in the files S13 needed to change.
- The orchestrator's settlement-watch resolver-ingress adapter and runner
  fail-closed evaluator carry-forwards do not intersect the memory write/read
  path and remain acknowledged for their recorded owners.
- The register states the memory pull cap's form but supplies no numeric value or
  key spelling. S13 therefore accepts only an explicitly supplied, fully printed
  policy and creates no source-literal fallback. The labeled test-layer policy is
  unreachable from production configuration.
- Prior served prose is never placed in the disclosure or composer packet. Only
  typed link/pull metadata enters the fact bundle. A match never marks work
  satisfied and changes no battery activation.
- The existing user change to `docs/founding/requirements-spec.md` and unrelated
  working-tree material were preserved.

## Questions for V

None. The missing production pull-cap value is explicitly V-owned; the lawful
implementation is the complete supplied-policy seam with no fabricated default.

## Review focus

Please run the database gate outside the sandbox, then scrutinize the SQL/domain
predicate parity, pull pin completeness, contradiction supersession transaction,
asker ownership on unlink, reserved disclosure segment, migration replay, and
source-derived S13 attachment rows. No Git operation was performed.
