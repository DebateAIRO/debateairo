# FIX-01 C5 zone-veto fix report

Date: 2026-09-04

Review: `task-15-fix01-c5-sol-review.md`, finding `C5-SOL-01`

## Result

Scheduler lifecycle entries now keep an outer `zone_context: true` veto. They never copy outer correlation refs.

The wrapper reads only the outer context's own `zone_context` data descriptor. An absent field or own boolean `false` uses the frozen five-`NOT_APPLICABLE` lifecycle context. Boolean `true`, an accessor, a non-boolean value, or a descriptor/read failure uses a second frozen context with the same five safe declarations plus `zone_context: true`.

The redactor then applies the existing zone rule and writes `UNKNOWN:DECLARED_KIND_REQUIRED` for all six durable correlation fields.

No controller addendum is needed. This report makes no production admission, launch, host, cadence, or schedule claim. `scheduled(next_due)` remains OPEN.

## TDD evidence

Tests were added before the product fix. The first real-code run was:

```text
Test Files: 1 failed
Tests: 4 failed, 25 passed
```

The four RED cases were outer true, accessor, non-boolean value, and descriptor trap. The absent and own-false controls already passed.

After the minimal product change:

```text
tests/unit/fix01-scheduler-lifecycle.test.ts
Tests: 29 passed
```

## Mutant checks

Each mutant failed before exact source restoration:

- Clearing an outer boolean `true` failed the zone-veto test.
- Reading and trusting an accessor called its getter twice and failed the no-read test.
- Copying an outer run ref failed the exact safe-context test.

## Final checks

```text
lifecycle + registry + scheduler: 55/55, three runs
scheduler row + full spool drain: 61/61
C1-C5 + FIX-03 + S03b + S05: 236/236
contract generation: passed, no generated diff
text bytes: REPOSITORY_TEXT_CONTROL_BYTES=0
git diff --check: passed
```

`pnpm typecheck` reports only the same eight pinned sparse-worktree errors in `tests/unit/s14-ui.test.ts`; it reports no zone-fix error.

`pnpm audit:source` reports only the same five pinned process-environment reads. `pnpm audit:architecture` reports only the known sparse-worktree `ENOENT` for missing `web/package.json`.

The change touches only `apps/scheduler/src/index.ts`, its lifecycle unit test, and this report. The CLI, installers, registry, redactor, runtime, spool writer, migrations, root barrel, zone code, and register code remain byte-identical to C5 commit `3d51e5b3`.
