# S11 Codex handoff — Staleness and liveness

Ticket: `t_0413fb85`  
Worker session: `019fe299-ee1e-7322-8510-887dd71bb7a9` / Kanban run 47  
Assignment: first pass; session ticket 2/2  
Git: shared working tree only; no Git write operation was performed.

## Outcome

S11 adds append-only snapshot, wake, current-read projection, retirement, and
revival behavior under DR-015/016. Node and Answer wire records now require
`relevant_as_of` and the closed current staleness projection
`FRESH | UNDER_REVIEW | STALE | ARCHIVED_REVIVED`. `ServeRepository` folds the
current trigger, clock, and state streams on every Answer and Node read; it
adds `STALE` for a fired revision trigger and `UNDER-REVIEW` for an expired
clock or revived archive without mutating a frozen answer.

The production `job:liveness-sweep` entry point reads each run-pinned register
version, fails loudly when `livenessPolicy` or its `standard` class member is
absent, creates provenance-bearing class review clocks, detects real recorded
provider `model_version` transitions from `ledger.raw_artifact`, emits
`honesty.staleness_trigger_fired`, and archives only after the register window
when no fired trigger remains open. A repeat sweep cannot append a second
archive event without an intervening query.

Run creation atomically records the new query at database time, while
`POST /v1/asks` records exact-question revisit activity within the same asker
boundary before accepting a new run. If the prior graph is archived, it appends
`ARCHIVED_REVIVED` per retained Answer/Node plus a typed `REVIVED` question
event. No graph row is deleted or rewritten. `UNDER-EXPLORED` is deliberately
absent from the retirement predicate.

The child-to-parent affected-set and execution seam is pure and tested:
machine arithmetic receives only the changed node plus ancestors and the
recorded arrow order, then the model callback is invoked for exactly those
same nodes. The honesty report leaves these two callback-composition helpers
`UNATTACHED`; the shipped scheduler attaches recorded-trigger detection,
state/event emission, read projection, clocks, retirement, and revival, but it
does not manufacture model calls merely to turn the callback seam green.

## Inventory

- Domain and persistence behavior: `packages/liveness/src/index.ts`.
- Register authority: `packages/register/src/index.ts` and
  `packages/register/src/runtime-environment.ts`.
- Scheduler entry point: `apps/scheduler/src/index.ts`,
  `apps/scheduler/src/cli.ts`, and root `job:liveness-sweep`.
- Pull and push surfaces: `packages/serve/src/index.ts`,
  `apps/api/src/index.ts`, and `packages/contract/src/index.ts`.
- Persistence: `migrations/0014_s11.sql` and complete Drizzle mirrors in
  `packages/db/src/schema.ts`.
- Tests: `tests/unit/liveness-s11.test.ts`,
  `tests/unit/register-s11.test.ts`,
  `tests/architecture/s11-contract.test.ts`, and the S11 block in
  `tests/integration/database.test.ts`.
- Honesty: `tools/orphan-audit/src/index.ts` and generated
  `reports/orphan-audit.json`.

## Carrier and behavior evidence

- `core.revision_trigger` is an ordered WATCHING/FIRED/RESOLVED event stream;
  provider version changes are detected only from persisted raw artifacts.
- `core.review_clock` prints question class, due time, register key/version,
  and source reference. No production TTL or retirement number exists outside
  a supplied row.
- `core.staleness_state` is an append-only state event stream, including the
  internal archival state; the wire vocabulary remains the ruled four-member
  projection.
- `core.question_liveness_event` records QUERY, ARCHIVED, and REVIVED. All four
  new tables reject UPDATE/DELETE and carry explicit runtime/replay grants.
- `core.node.relevant_as_of` and `serve.answer.relevant_as_of` are stamped by
  PostgreSQL at spawn and returned on reads.
- `honesty.staleness_trigger_fired` carries projection-grade trigger identity
  and affected subjects; `HONESTY_EVENT_CONSUMERS` declares W6 and W11, and the
  existing SSE route projects the persisted run-progress event.
- Composite retirement uses the latest recorded QUERY event, the exact
  run-pinned register member, and latest trigger state.
  It does not inspect `UNDER-EXPLORED` and never deletes graph data.

## TDD RED → GREEN

Initial focused RED:

```text
$ pnpm exec vitest run tests/unit/liveness-s11.test.ts tests/architecture/s11-contract.test.ts
Test Files 2 failed (2)
Failures 4: package export absent; staleness vocabulary absent; migration absent;
S11 reachability report absent.
```

Final local gates:

```text
$ pnpm run generate:contract
exit 0

$ pnpm run typecheck
exit 0

$ pnpm run lint
edgeRowsChecked: 27
violations: []
blocking: []

$ pnpm exec vitest run tests/unit tests/architecture
Test Files 38 passed (38)
Tests 214 passed (214)
```

The final generated S11 reachability report derives these production
attachments from `apps/api/src/main.ts` and `apps/scheduler/src/cli.ts`:

- attached: `recordQuery`, `recordTriggerFired`,
  `detectProviderModelVersionTriggers`, `sweep`, `foldStaleness`, and
  `readLivenessPolicy`;
- unattached and described truthfully: the pure affected-only planner and its
  callback execution seam.

## Real PostgreSQL gate

The existing real-database runner fixture now additionally proves:

1. a freshly served Answer and Node carry snapshot timestamps and read FRESH;
2. a fired watched condition appends typed trigger/state/progress events;
3. two consecutive Answer reads both expose STALE plus the visible badge;
4. the persisted stream event is named
   `honesty.staleness_trigger_fired` with its trigger key;
5. resolving the trigger permits composite retirement after the supplied
   180-day test-layer receipt;
6. the next same-asker exact query appends revival and reads
   ARCHIVED_REVIVED / UNDER-REVIEW;
7. the graph node count is byte-for-byte unchanged; and
8. DELETE against `core.staleness_state` is rejected.

The managed sandbox cannot start embedded PostgreSQL. The attempted complete
integration command reached `initdb` in all five suites, then failed before a
migration or test body because SysV `shmget` returned `Operation not
permitted`. This is an environment deferral, not a database-green claim.
Review must run outside the sandbox:

```text
pnpm test:s00
```

Expected current inventory: 43 files / 261 tests, with the 47 real-PostgreSQL
tests executing rather than skipping behind failed provisioning.

### Review rework 1 — recorded query age and provider version identity

The first orchestrator database gate returned **260/261**. Every S00-S10
assertion in the shared runner lifecycle remained green; only the new S11
`archivedRuns` assertion returned `[]`.

The retirement clock was not the defect. The run legitimately had more than
180 days between its recorded test query and the pinned 2030 sweep instant.
The provider gateway had historically stored each OpenAI-compatible response
`id` (a per-request completion identifier) in `model_version`. The five real
provider calls therefore appeared to be four model-version changes. S11's
observer correctly fired a revision trigger, and composite retirement
correctly refused a run with that open trigger.

A focused RED now asserts that a response with id `fixture-response` and model
`fixture-maker/fixture-model` reports the latter as `modelVersion`; it failed
with the former. The gateway now stores and returns the response's stable
`model` identity as `model_version`, leaving request ids in the raw response.
The S11 observer therefore reacts to actual recorded model identity changes,
not ordinary request traffic.

Retirement was hardened at the same boundary: `RunRepository.startRun`
atomically appends the initial QUERY event using PostgreSQL time, and sweep no
longer falls back to caller-supplied content `as_of`. A run with no recorded
query is conservatively ineligible rather than assigned fabricated activity.
The fixture's age is now derived from the real QUERY event plus its pinned
sweep instant. Post-fix focused typecheck, lint, and 18 tests are green; the
fresh outside-sandbox 261-test rerun is pending.

## Carry-forwards

- The intersecting Drizzle carrier lag is closed for every S11 table and both
  snapshot columns.
- The runner-main fail-closed omissions for `judgementPolicy`, `servePolicy`,
  and `resolveTerminalActivations` do not intersect S11's scheduler/API roots
  and remain acknowledged for their owning composition work.
- The S10 `sensitivity_record` live-upgrade backfill advisory does not
  intersect S11 and remains acknowledged.
- The pre-existing change to `docs/founding/requirements-spec.md` and all
  unrelated working-tree material were preserved.

## Review focus

Please run the full suite outside the sandbox and scrutinize: migration 0014
constraint names on replay; run-pinned multi-version clock/sweep behavior;
provider-version transition deduplication; every-read badge projection; the
SSE event consumer declaration; and archive/revival preservation of the full
graph. No Git operation was performed.
