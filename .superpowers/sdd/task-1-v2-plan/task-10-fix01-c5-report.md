# FIX-01 C5 implementation report

Date: 2026-09-04

Authority: controller-approved FIX-01 SPEC-v3 R09-R15

Starting code commit: `bd3efffa8343041926703c1d8c59754b8d4271e2`

## Result

C5 adds scheduler execution receipts, strict lifecycle redaction, a generation-safe runtime-ready waiter, one shared CLI deadline, and migration 0061. It also brings in the approved FIX-03 declared-kind projection before C5.

This report is implementation evidence only. It is not a production admission, production attestation, launch approval, cadence decision, or scheduler-host decision. `scheduled(next_due)` remains OPEN.

## Required earlier commits

- `4b18f71c` — `docs(obs): allocate FIX-01 C5 migration 0061`
- `6649fd7d` — `feat(obs): integrate FIX-03 declared-kind projection`

The allocation followed a fresh collision audit of 76 registered worktrees, 59 local and remote refs, all migration files, active plans, pending branches, and the only open PR (#8). The allocation row was committed before migration 0061 was created.

## TDD evidence

The first C5 run happened before product changes:

```text
Test Files: 3 failed, 2 passed
Tests: 27 failed, 30 passed
```

The REDs covered missing lifecycle codes and bindings, unsafe parameters, missing readiness outcomes, wrong CLI import/deadline shape, missing cancellation, and missing migration allocation/use.

The later source audit also caught two C5 REDs: an unaudited scheduler switch and an unguarded constraint replacement. Both were fixed before the final runs.

## Implemented contract

- Four exact lifecycle codes and registry-owned bindings.
- Closed job names and a safe integer NOOP count.
- Whole-event minimization for missing, extra, wrong, out-of-range, or binding-mismatched lifecycle input.
- Error objects stay in memory, are rethrown unchanged, and are not serialized or fingerprinted.
- Five scheduler correlation refs are projected as `NOT_APPLICABLE`.
- Replay, liveness, and settlement NOOP counts use each report's authoritative `checked` field.
- `runLivenessSweep()` now returns `{ checked, archived }`.
- Runtime readiness is generation-safe and reports `installed`, `start_failed`, `stopped`, or `timed_out`.
- `installed` is settled immediately after the emitter swap, before transfer, first flush, or drain.
- The scheduler installer has only the narrow, idempotent cancel API with checks before and after import.
- The CLI imports the installer first, has no static runtime import, and uses one caught dynamic import with one monotonic 5,000 ms budget.
- Lifecycle output starts only after `installed`. All other readiness outcomes fail open without lifecycle output.
- CLI cleanup order is cancel, bounded runtime stop, then pool close.
- Migration 0061 replaces only the occurrence taxonomy check, preserving the old 12 values and adding `JOB_LIFECYCLE`.
- Spool drain accepts the registry taxonomy and rejects changed lifecycle bindings, even when a changed taxonomy has a matching recomputed fingerprint.

## Mutant checks

Each change below made its named test fail. Exact source bytes were then restored.

| Mutant | Failing proof |
|---|---|
| Emit FAILED without STARTED | lifecycle order/count |
| Count independent `OBS_CAPTURE_SELF` as lifecycle | filtered database count |
| Add job/count to fingerprint | fingerprint stability |
| Serialize planted error | secret-byte absence |
| Accept an extra parameter | whole-event minimization |
| Use affected rows for replay/settlement NOOP | authoritative count |
| Remove liveness `checked` | scheduler report contract |
| Set installed after startup work | blocked-transfer readiness |
| Reuse an old generation | restart isolation |
| Give the waiter a second 5,000 ms budget | one-budget source check |
| Remove pre-import cancellation check | before-import race |
| Remove post-import cancellation check | after-import race |
| Change frozen API installer bytes | S05 byte equality |
| Add a scheduled receipt/cadence code | open schedule ownership |
| Remove the 0061 allocation row | migration admission |

## Final test evidence

Focused repeated runs on final code:

```text
lifecycle + registry + scheduler: 49/49, three runs
readiness + CLI/installer architecture + S05: 52/52, three runs
scheduler/migration database: 9/9, three repeated runs plus the final combined run
```

Final database run on the exact product bytes:

```text
tests/integration/fix01-scheduler-row.test.ts
tests/integration/fix01-spool-drain.test.ts
Test Files: 2 passed
Tests: 61 passed
```

The migration test proves `JOB_LIFECYCLE` succeeds, unknown taxonomy fails, and writer grants plus non-internal mutation triggers are unchanged. The spool tests prove valid lifecycle drain and changed-binding rejection.

Nearby and frozen-contract run:

```text
C1-C4 + FIX-03 + S03b + S05 boot/import: 219/219
FIX-03 focused projection before C5: 35/35
contract generation: passed; no generated diff
text-byte audit: REPOSITORY_TEXT_CONTROL_BYTES=0
git diff --check: passed
frozen API/runner installers, emit, flusher, runtime sink, migration 0034,
root barrel, zone code, and register code: no byte diff from C5 base
```

## Known baseline-only gate output

`pnpm typecheck` reports only the same eight pinned sparse-worktree diagnostics in `tests/unit/s14-ui.test.ts` at lines 19, 122, 128, 199, 200, 230, and twice at 232. It reports no C5 or FIX-01 diagnostic.

`pnpm audit:source` reports only the pinned five process-environment reads in the three installers, `runtime/config.ts`, and `runtime/index.ts`. The two temporary C5 findings are gone.

`pnpm audit:architecture` reports only the known sparse-worktree `ENOENT` for absent `web/package.json`. Executable FIX-01 and S05 architecture suites are green above.

## Scope

Product edits are limited to the C5-approved scheduler CLI/index, scheduler installer cancel seam, registry, redactor, runtime readiness/drain, and migration 0061. Test edits are limited to the named C5 and nearby contract suites. Existing untracked `.hermes` files were not changed, staged, or used as the report location.
