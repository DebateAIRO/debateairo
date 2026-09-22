# PLAN — OBS-03 Stall detectors and read-only defect view

> **Worker skills:** `superpowers:subagent-driven-development` or `superpowers:executing-plans`; every coder also uses `superpowers:test-driven-development` and `superpowers:verification-before-completion`.

SKILLS LOADED: superpowers:using-superpowers, superpowers:brainstorming, superpowers:writing-plans, superpowers:verification-before-completion

**Status:** READY FOR PEER REVIEW. **Base:** merged OBS-02. **Migration:** `0058_observation_safe_views.sql`. **External gate:** D4 token only for live Hatchet REST.

## Dispatch boundary

- `core.work_item.state` is exactly `READY|CLAIMED|DONE|FAILED`; only `READY|CLAIMED` are in flight. Bind to `DECISIONS.md`; invent no state.
- STOP/WORKER_LOST and infrastructure suppression are separate from the four healthy-infrastructure defect predicates. Frozen source defects are disposed.
- `tests/acceptance/obs-agent-03-fixture.ts` and `tests/acceptance/obs-agent-03-query-budget.sql` use a unique isolated database and never write `debateai`; they may prepare inputs/run cycles but cannot inspect/assert signal, delivery, status, digest, defect-view, or EXPLAIN output.
- Worker Vitest is not V acceptance. V personally runs the current 14 steps.

## SPEC trace

| Requirement | Steps | Acceptance test | File surface |
|---|---|---|---|
| R01, R07 | C1-1..C1-3 | exact-column/grant/view-only tests | migration 0058, defect interface |
| R02 | C2-1 | heartbeat age/UNKNOWN tests | stall-detectors |
| R03–R06 | C3-1..C3-4 | four predicate tests | stall-detectors |
| R08 | C2-2, C3-4 | identity/suppression/clear tests | modules |
| R09 | C1-4 | hostile-column/evidence tests | architecture tests |
| R10 | C4-2 | 220/210 direct EXPLAIN tests | query-budget SQL |
| R11–R12 | C2-3, C4-3 | defaults/routing/status/timestamp tests | defaults/projections |

## Implementation clusters

### C1 — security-barrier projections and defect interface

1. **C1-1 RED:** assert exact safe-view columns and absence of private product fields.
2. **C1-2 GREEN:** implement migration 0058 security-barrier views and relation-only grants.
3. **C1-3 GREEN:** expose read-only `observation.defect_signal_v`; prove no `obs.occurrence` write or direct product grant.
4. **C1-4 REFUTE:** add one private column and direct grant; require RED, then revert.

```zsh
set -o pipefail; test_paths=(tests/integration/obs-agent-03-views.test.ts tests/architecture/obs-agent-03-grants.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-03-c1.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C2 — heartbeat and infrastructure suppression

1. **C2-1 RED→GREEN:** project Hatchet heartbeat age; open WORKER_LOST at 30s on a 10s poll and return UNKNOWN without facts.
2. **C2-2 RED→GREEN:** suppress defects unless runner, Postgres, and Hatchet are healthy; clear immutably.
3. **C2-3 GREEN:** expose freshness, first failure, detection, and latency timestamps in fixed projections.
4. **C2-4 REFUTE:** combine stale heartbeat with expired claim; require WORKER_LOST and zero defect rows, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-03-heartbeat.test.ts tests/integration/obs-agent-03-suppression.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-03-c2.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C3 — four healthy-infrastructure predicates

1. **C3-1 RED→GREEN:** implement claim-deadline STALL using only pinned in-flight states.
2. **C3-2 RED→GREEN:** implement READY age ≥120s QUEUE_NOT_DRAINING with fresh runner.
3. **C3-3 RED→GREEN:** implement ≥300s progress-sequence stasis for an in-flight run.
4. **C3-4 RED→GREEN/REFUTE:** implement DONE-without-artifact SUSPICIOUS_SUCCESS; prove one identity, four clears, exact SEVERE routing, and infrastructure exclusion.

```zsh
set -o pipefail; test_paths=(tests/integration/obs-agent-03-defect-detectors.test.ts tests/unit/obs-agent-03-detectors.test.ts tests/integration/obs-agent-03-lifecycle.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-03-c3.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C4 — stimulus helpers, budgets, defaults

1. **C4-1 RED→GREEN:** implement `tests/acceptance/obs-agent-03-fixture.ts` for create/recover/query-input only; reject output reads/assertions and `debateai` writes.
2. **C4-2 RED→GREEN:** load exactly 220 runs/210 work items and add runtime-equivalent labelled EXPLAIN SQL in `tests/acceptance/obs-agent-03-query-budget.sql` at ≤100ms.
3. **C4-3 GREEN:** add target fragment, defaults, status/digest, 2s statements, and ≤2 sessions.
4. **C4-4 REFUTE:** point the helper at `debateai` and assert a signal; both guard tests must fail, then revert.

```zsh
set -o pipefail; test_paths=(tests/integration/obs-agent-03-fixture.test.ts tests/integration/obs-agent-03-query-budget.test.ts tests/architecture/obs-agent-03-acceptance-boundary.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-03-c4.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

## Acceptance handoff

The canonical V gate is exactly current `SPEC.md` lines 74–91, numbered 1–14. V reads PSQL/status/digest and four labelled EXPLAIN values. Missing D4 gates only live REST observations; it does not reopen defects or block C1/C3/C4.
