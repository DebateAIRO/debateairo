# PLAN — OBS-06 Throughput, provider health, and Hatchet metrics

> **Worker skills:** `superpowers:subagent-driven-development` or `superpowers:executing-plans`; every coder also uses `superpowers:test-driven-development` and `superpowers:verification-before-completion`.

SKILLS LOADED: superpowers:using-superpowers, superpowers:brainstorming, superpowers:writing-plans, superpowers:verification-before-completion

**Status:** READY FOR PEER REVIEW. **Base:** merged OBS-02. **Migration:** `0060_observation_throughput_views.sql`. **External gate:** D4 token only for live Hatchet REST.

## Dispatch boundary

- `core.provider_probe` is pinned in `DECISIONS.md`: `probe_id uuid`, `provider_ref text`, `maker text`, `state text` (`HEALTHY|ABSENT`), nullable `model_id text`, nullable `failure_code text`, `probed_at timestamptz`.
- Create only OBS-06 modules, fragment/defaults, migration 0060, worker tests, and two stimulus/query helpers.
- Provider latency remains exactly NOT OBSERVABLE. Never substitute observation delay, expose payload/error text, or read Hatchet vendor tables.
- Queue proof is ≥10 for five minutes after ten asks. `tests/acceptance/obs-agent-06-fixture.ts` and `tests/acceptance/obs-agent-06-query-budget.sql` use unique isolated databases, never write `debateai`, and never judge outputs. V runs 13 steps.

## SPEC trace

| Requirement | Steps | Acceptance test | File surface |
|---|---|---|---|
| R01–R02 | C1-1..C1-4 | exact-view/delta/no-double-count tests | migration 0060/throughput module |
| R03–R05 | C2-1..C2-4 | run/provider bands and NOT OBSERVABLE | provider/throughput modules |
| R06–R08 | C3-1..C3-4 | REST/Prometheus/queue/correlation tests | Hatchet module/target fragment |
| R09 | C2-3, C3-4 | lifecycle/privacy/defect-exclusion tests | modules |
| R10 | C4-1..C4-4 | defaults/status/fixture/query-budget tests | defaults/helpers |

## Implementation clusters

### C1 — safe projections and sequence deltas

1. **C1-1 RED:** assert exact provider/run view columns and reject private fields.
2. **C1-2 GREEN:** implement migration 0060 security-barrier views and relation-only grants.
3. **C1-3 GREEN:** implement sequence cursors, window deltas, and rollups without double-counting.
4. **C1-4 REFUTE:** replay the same sequence and add a payload column; both tests must fail, then revert.

```zsh
set -o pipefail; test_paths=(tests/integration/obs-agent-06-views.test.ts tests/unit/obs-agent-06-deltas.test.ts tests/architecture/obs-agent-06-privacy.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-06-c1.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C2 — run/provider anomalies

1. **C2-1 RED→GREEN:** detect run failure at ≥4 terminal runs/hour and ≥50% with `IMPACT_RUN_FAILURE`.
2. **C2-2 RED→GREEN:** detect provider failure at ≥10 calls/5m and ≥50% using only pinned safe fields.
3. **C2-3 GREEN:** implement dedup/clear, numeric evidence, fixed copy, non-defect classification, and `provider latency: NOT OBSERVABLE`.
4. **C2-4 REFUTE:** substitute observation delay for provider latency and null an impact; require RED, then revert.

```zsh
set -o pipefail; test_paths=(tests/integration/obs-agent-06-anomaly-copy.test.ts tests/unit/obs-agent-06-anomalies.test.ts tests/integration/obs-agent-06-lifecycle.test.ts tests/architecture/obs-agent-06-copy.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-06-c2.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C3 — Hatchet REST and optional Prometheus

1. **C3-1 RED→GREEN:** validate OBS-06 Hatchet target and project only ruled REST fields through 2s timeouts.
2. **C3-2 RED→GREEN:** open queue anomaly only after Q≥10 for ≥300s; implement dispatch p95>30s and failed tasks ≥3/15m.
3. **C3-3 GREEN:** parse optional Prometheus, report REST_ONLY when absent, and correlate numeric queue facts.
4. **C3-4 REFUTE:** emit SOURCE_MISMATCH/UNKNOWN on disagreement/unavailability; attempt vendor-DB fallback, require RED, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-06-hatchet.test.ts tests/integration/obs-agent-06-correlation.test.ts tests/architecture/obs-agent-06-source-boundary.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-06-c3.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C4 — helpers, budget, projections

1. **C4-1 RED→GREEN:** implement anomaly/query inputs in `tests/acceptance/obs-agent-06-fixture.ts`; reject output assertions and `debateai` writes.
2. **C4-2 GREEN:** load 220 runs, 210 work items, and 210 provider fixtures; add runtime-equivalent labelled EXPLAIN SQL in `tests/acceptance/obs-agent-06-query-budget.sql` at ≤100ms.
3. **C4-3 GREEN:** add defaults and status/digest with the fixed impacts and thresholds.
4. **C4-4 REFUTE:** point helper at `debateai`, add a signal assertion, and hard-code historical `5/21`; require RED, then revert.

```zsh
set -o pipefail; test_paths=(tests/integration/obs-agent-06-fixture.test.ts tests/integration/obs-agent-06-query-budget.test.ts tests/architecture/obs-agent-06-acceptance-boundary.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-06-c4.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

## Acceptance handoff

The canonical V gate is exactly current `SPEC.md` lines 68–84, numbered 1–13. V reads PSQL/status/digest and three labelled EXPLAIN values. D4 gates only live REST observations; it does not reopen source defects or block safe-view/provider work.
