# PLAN — OBS-02 Product liveness and witnesses

> **Worker skills:** `superpowers:subagent-driven-development` or `superpowers:executing-plans`; every coder also uses `superpowers:test-driven-development` and `superpowers:verification-before-completion`.

SKILLS LOADED: superpowers:using-superpowers, superpowers:brainstorming, superpowers:writing-plans, superpowers:verification-before-completion

**Status:** READY FOR PEER REVIEW. **Base:** merged, V-approved OBS-01. No migration.

## Dispatch boundary

- Contribute only module directories, `targets.dev.d/OBS-02.json`, OBS-02 defaults, and tests. Do not edit OBS-01 targets, core verbs, or the frozen manifest.
- The job-witness verb is module-owned at `src/modules/job-witness/oactl/witness.ts`; discovery is lexical.
- `THROUGHPUT_ANOMALY` is DEGRADED with `IMPACT_SLOW`; `INFRA_NOT_READY` is live-but-not-ready.
- Worker Vitest is not V acceptance. V personally runs the SPEC's 11 steps.

## SPEC trace

| Requirement | Steps | Acceptance test | File surface |
|---|---|---|---|
| R01–R02 | C1-1..C1-3 | five-probe/expected-set tests | product-liveness, expectations, target fragment |
| R03–R05 | C2-1..C2-3 | root/restart/never-start tests | witness modules |
| R06 | C3-1 | latency/band/copy tests | samples and defaults |
| R07 | C3-2 | exit/report receipt tests | job-witness module/oactl |
| R08, R10 | C3-3 | exact status/digest/default tests | module projections/defaults |
| R09 | C1-4, C2-4 | source/argv boundary tests | architecture tests |

## Implementation clusters

### C1 — five probes and expected set

1. **C1-1 RED:** define exact API 401, UI pair, system-trust TLS, runner `ps`, and 30s Kanban fixtures.
2. **C1-2 GREEN:** implement the module and validated OBS-02 target fragment through the frozen manifest.
3. **C1-3 GREEN:** implement expected-set transitions and one `NOT_RUNNING` INFO per down period.
4. **C1-4 REFUTE:** duplicate a target and add `process.kill`; require RED, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-02-probes.test.ts tests/integration/obs-agent-02-expected-set.test.ts tests/architecture/obs-agent-02-boundaries.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-02-c1.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C2 — attribution and container witnesses

1. **C2-1 RED→GREEN:** collapse a stack-root exit into one dev-stack SEVERE and suppress member OPEN rows.
2. **C2-2 RED→GREEN:** compare Docker start timestamps and emit one restart INFO with two timestamps.
3. **C2-3 RED→GREEN:** emit never-started after 60s without first-seen and clear after appearance.
4. **C2-4 REFUTE:** inject member failures under a root exit and mutating Docker argv; both must fail, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-02-attribution.test.ts tests/integration/obs-agent-02-witness.test.ts tests/architecture/obs-agent-02-docker.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-02-c2.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C3 — latency, completion witness, projections

1. **C3-1 RED→GREEN:** store numeric probe latency and implement the ruled DEGRADED `THROUGHPUT_ANOMALY`/`IMPACT_SLOW` band.
2. **C3-2 RED→GREEN:** implement module-owned `oactl witness`, preserve child exit code, record report status, and print `NO SCHEDULE RULED` pending D10.
3. **C3-3 GREEN:** add defaults, routing, status, and digest projections with exact copy.
4. **C3-4 REFUTE:** force missing report JSON and polluted job title; require typed output and no product signal, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-02-latency.test.ts tests/integration/obs-agent-02-job-witness.test.ts tests/architecture/obs-agent-02-output.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-02-c3.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

## Acceptance handoff

The canonical V gate is exactly `SPEC.md` lines 65–79, numbered 1–11. Do not copy or renumber it here. Missing implementation leaves results **UNVERIFIED**.
