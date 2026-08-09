# S10 Codex handoff — Value overlay

Ticket: `t_5920e52d`  
Worker sessions: `019fe299-ee1e-7322-8510-887dd71bb7a9` / Kanban run 45 (first pass + instance rework); `019fe2ba-38dc-7381-bbbd-21e803e00fee` / run 46 (recurring-class rework)  
Assignment: first pass plus directed rework  
Git: shared working tree only; no Git write operation was performed.

## Outcome

S10 now has a complete, test-covered value-overlay seam over a frozen
propagation receipt. It is staged behind
`WalkingSkeletonRunner.executeValueOverlay`, but no production task or route
dispatches that method yet; the generated honesty report therefore classifies
the value surfaces as **UNATTACHED** and lists the undispatched runner method in
`neverCalled`. No value inputs or production route were invented to turn that
staging seam into a false attachment claim.

When invoked, the seam reads the recorded arrow order, operator resolutions,
cluster records, and node strengths; recomputes the graph with the overlay
detached; requires byte-identical strength records; then projects criteria,
Pareto options, real trade-off hinges, reversal boundaries, at most one swing
question per hinge, and an optional owner-marked recommendation. No overlay
input is fed into propagation or written back to the graph.

The weight source is the closed, kernel-owned discriminated union
`owner_elicited | org_policy | none`. `none` has no vector field. Supplied
weights require a non-empty owner and exact accepted-criterion coverage;
organization policy additionally requires explicit profile, version, and
signature references. Production contains no default weights, value cells,
criteria, evidence, option scores, findings, or recommendation owner.

DR-053 is represented as one typed `DUAL_ACT`: phase 2 is refused without a
same-run empirical propagation receipt, and the returned answer contains the
machine-ordered sections `what is true` then `what follows given your values`.

## Inventory

- Domain vocabulary and behavior: `packages/kernel/src/index.ts`,
  `packages/valuation/src/index.ts`.
- Staged composition seam: `apps/runner/src/index.ts` defines the frozen-read,
  overlay-persist, and typed-dual-answer orchestration, but the method has no
  production dispatcher and is honestly reported as never-called.
- Persistence: `migrations/0013_s10.sql`, `packages/db/src/schema.ts`, and the
  sensitivity write-order addition in `packages/ledger/src/index.ts`.
- Tests: `tests/unit/valuation-s10.test.ts`,
  `tests/architecture/s10-contract.test.ts`, and
  `tests/integration/valuation-database.test.ts`.
- Honesty: `tools/orphan-audit/src/index.ts`, generated
  `reports/orphan-audit.json`, and assertions in
  `tests/architecture/scaffold.test.ts`.

The pre-existing modification to `docs/founding/requirements-spec.md` and all
unrelated working-tree material were left in place and were not reverted.

## Carrier and fixture evidence

- `core.value_hinge` stores the option pair, accepted criterion ids, exact
  reversal boundary, typed weight source/owner/vector tuple, and total-order
  sequence.
- `core.reversal_point` stores the structured reversal boundary plus rejected
  criteria, so degraded rendering does not depend on composed prose.
- `ledger.overlay_run` references the frozen `propagation_run` and stores the
  recorded order, recorded strengths, detached strengths, and a database check
  that permits only a true byte-identity receipt.
- The already-present `ledger.sensitivity_record` is retained at its PRE-02
  ledger home and gains an `at_seq` written only after the propagation receipt.
  Repository code rejects any sensitivity row whose order is not later before
  writing an overlay. All four touched carriers now have Drizzle declarations;
  the S04 `reducedJudgementRef` foreign-key mirror remains closed as well.
- All new S10 tables are append-only, runtime/replay grants are explicit, and
  migration lint accepts the replay-safe DDL.
- FX-LG-07 fires both ways: the happy path asserts byte identity; a mismatched
  recorded strength raises `OVERLAY_DETACHMENT_VIOLATION`. A pinned property
  test repeats the invariant across generated positive weight pairs.
- FX-LG-11 fires: blank owner-elicited ownership raises
  `EMPTY_OVERLAY_OWNER`; a recommendation is emitted only with a visible named
  owner. SQL independently rejects the `none + owner` invalid tuple.
- DR-043's model-proposed criteria require real evidence links; absent and
  unresolved links are rejected with distinct typed reasons and remain in the
  structured served projection. Asker-steered criteria are preserved.
- AC-29: sensitivity remains an output, not an EvaluationSnapshot input, and
  its sequence is after the propagation run. AC-30: the detached recomputation
  consumes the stored order and all stored strengths must match byte-for-byte.

## TDD RED → GREEN evidence

Initial focused RED:

```text
$ pnpm exec vitest run tests/unit/valuation-s10.test.ts tests/architecture/s10-contract.test.ts
Test Files 2 failed (2)
Tests 9 failed (9)

Failures covered missing valuation exports/behavior, kernel vocabulary,
migration 0013, runner attachment, and generated honesty rows.
```

Final focused GREEN after adding the detachment property:

```text
$ pnpm exec vitest run tests/unit/valuation-s10.test.ts tests/architecture/s10-contract.test.ts
Test Files 2 passed (2)
Tests 10 passed (10)
```

Final runnable gates:

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
Test Files 35 passed (35)
Tests 203 passed (203)
```

## Real-PostgreSQL fixture and environment tail

`tests/integration/valuation-database.test.ts` is a raw, real-PostgreSQL
fixture. It migrates from the full lineage, writes a run/graph/propagation and
post-propagation sensitivity receipts through production repositories, reads
the frozen receipt back, persists an overlay, and inspects phase order, all
four carriers, append-only rejection, detachment identity, and the invalid
`none + owner` storage tuple.

The sandbox cannot start embedded PostgreSQL. The full suite reaches `initdb`
for all five integration files and fails before any integration test body:

```text
$ pnpm test:s00
[S00 DB] Testcontainers DEFERRED BY DR-121; starting real embedded PostgreSQL directly
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(..., size=56, 03600).
Error: EMBEDDED_POSTGRES_PROVISIONING_FAILED

Test Files 5 failed | 35 passed (40)
Tests 203 passed | 47 skipped (250)
```

This local result remains an environment deferral, not a local database green.
After the fixture topology correction below, the orchestrator reran the full
suite outside the sandbox: **40 files, 250/250 tests GREEN, 0 skipped**.

## Rework cycle 1 — valid graph fixture topology

The orchestrator's first external database run reached **249/250** and stopped
only in the new S10 fixture before valuation assertions. The second graph node
had been declared as another root with `siblingOrdinal: 1`; the existing S02
law correctly raised `GRAPH_ROOT_STRUCTURE_INVALID`.

The fixture now creates one legal root (`childKind: null`, ordinal 0) and one
real support child (`parentNodeId` set, `childKind: "support"`, ordinal 1).
No graph or product invariant changed. Post-fix local evidence:

```text
$ pnpm run typecheck
exit 0

$ pnpm run lint
edgeRowsChecked: 27
violations: []
blocking: []

$ pnpm exec vitest run tests/unit/valuation-s10.test.ts \
    tests/architecture/s10-contract.test.ts \
    tests/unit/graph.test.ts tests/architecture/s02-contract.test.ts
Test Files 4 passed (4)
Tests 16 passed (16)
```

The orchestrator's corrected-fixture rerun subsequently passed **250/250**
against real embedded PostgreSQL. The pre-fix 249/250 result remains recorded
above so the evidence chain is not rewritten.

## Rework cycle 2 — truthful production reachability

Claude's first diamond found one blocking P18 honesty defect. The generated
`s10Surface` rows said ATTACHED because the valuation functions were composed
inside `WalkingSkeletonRunner.executeValueOverlay`; full-tree reachability
showed that no Hatchet task, API route, scheduler job, or other entry point
calls that method. Grok's approval had assumed source-level runner composition
was sufficient, while Claude correctly applied the established entry-point
reachability standard.

Option (b) from the directed finding was selected. V has deferred value inputs,
and S10 has no served-origin dispatcher to wire without inventing scope. The
three S10 surfaces are now `UNATTACHED`, their evidence names the later
value-serving composition owner, and
`apps/runner.WalkingSkeletonRunner.executeValueOverlay` appears in
`neverCalled`. Both S10 and scaffold architecture tests assert that exact
honesty shape.

RED then GREEN:

```text
$ pnpm exec vitest run tests/architecture/s10-contract.test.ts \
    tests/architecture/scaffold.test.ts
Test Files 2 failed (2)
Tests 2 failed | 6 passed (8)

$ pnpm exec vitest run tests/architecture/s10-contract.test.ts \
    tests/architecture/scaffold.test.ts
Test Files 2 passed (2)
Tests 8 passed (8)

$ pnpm exec vitest run tests/unit tests/architecture
Test Files 35 passed (35)
Tests 203 passed (203)
```

`pnpm run typecheck` and `pnpm run lint` also pass with 27 dependency edges,
zero violations, and zero blocking source findings. No overlay behavior,
frozen-graph invariant, migration, or database fixture changed in this cycle.

Claude's two non-blockers are acknowledged: live-upgrade backfill of existing
`sensitivity_record.at_seq` values deserves a later migration hardening pass,
and option-criterion scores have no production producer while the pipeline is
undispatched. Grok's secondary-vocabulary and floating-boundary notes are also
carried forward; none justifies fabricating a production route or values here.

## Rework cycle 3 — recurring attachment-honesty class fix

The instance-only handoff above was incomplete against V's directed class fix.
`tools/orphan-audit` now walks production call references from the declared API,
Hatchet runner, and scheduler entry files. Tests and the audit's own evidence
are excluded from the graph. Every `s04Surface` through `s10Surface` attachment
label is derived from that walk; the surface declarations no longer contain a
human-authored `ATTACHED` or `UNATTACHED` literal. The source audit rejects any
future attempt to restore such a literal, and `pnpm run lint` executes the walk,
regenerates the report, and fails if an entry point or declared surface target
cannot be resolved.

This is intentionally a conservative static walk. Ambiguous method names do not
confer reachability merely because some unrelated class uses the same name. A
method or function is attached only when a declared production root reaches its
call chain. Therefore `WalkingSkeletonRunner.executeWorkItem` is reachable while
`executeValueOverlay`, `buildValueOverlay`, and `serveMixedAnswer` are not.

The class-wide derivation also exposed the older S06 evidence surface: its pure
functions are staged behind `EvidenceRepository`, but no declared production
entry reaches that repository. Those nine rows now truthfully derive as
`UNATTACHED`, and the S06 architecture expectation records that fact. No S06
domain behavior, persistence, or runtime code changed.

Class-fix RED then GREEN:

```text
$ pnpm exec vitest run tests/architecture/scaffold.test.ts \
    tests/architecture/s10-contract.test.ts
Test Files 1 failed | 1 passed (2)
Tests 1 failed | 8 passed (9)
Failure: auditSurfaceReachability is not a function

$ pnpm exec vitest run tests/architecture/scaffold.test.ts \
    tests/architecture/s10-contract.test.ts
Test Files 2 passed (2)
Tests 10 passed (10)
```

The first full runnable pass then failed only the stale S06 hard-coded
`ATTACHED` expectation (1 failed, 204 passed), proving the class fix found a
pre-existing false claim. After correcting that expectation, final evidence is:

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
Test Files 35 passed (35)
Tests 205 passed (205)
```

The already-recorded orchestrator database gate remains **250/250 GREEN**. This
cycle changed only the audit, architecture expectations, generated report, and
handoff evidence; it did not change database, overlay, graph, or migration code.

## S04 rev-2 quality carry-forwards

Cheap intersecting items closed:

- S10's closed weight-source vocabulary is tested against the S10 migration
  itself rather than against concatenated migration text.
- The new storage tuple and the TypeScript discriminated union both reject
  default/empty ownership; typed absence is `{ source: "none" }` with no
  vector field and SQL NULLs only as that union's storage projection.
- No S10 CHECK calls a mutable user-defined validator, avoiding the cited
  dump/restore footgun.
- Every schema carrier touched by S10 has a Drizzle declaration with the ruled
  foreign-key edges, closing the touched-surface lag noted by both reviewers.

Acknowledged, not expanded into S10: the older claim-composition SQL/reader
strength mismatch and broad 0005 parity test; the 0005 UDF-CHECK restore risk;
the S04 register error wording and boot-gate-only composition read; the old
single-judge dispersion wording; and rev-1 findings 4–7, 9–10, 12–13, and 15.
Those concern the S04 judgement/register composition and its deferred panel
surface. S10 neither weakens nor falsely attaches them, and inventing their
missing policy values here would violate AC-76.

## Questions for V

None blocking. Organization profiles and owner-elicited vectors remain explicit
inputs; the implementation intentionally supplies no value defaults or standing
profile cells.
