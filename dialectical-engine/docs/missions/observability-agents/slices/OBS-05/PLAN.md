# PLAN — OBS-05 Postgres, host, Docker, and certificate capacity

> **Worker skills:** `superpowers:subagent-driven-development` or `superpowers:executing-plans`; every coder also uses `superpowers:test-driven-development` and `superpowers:verification-before-completion`.

SKILLS LOADED: superpowers:using-superpowers, superpowers:brainstorming, superpowers:writing-plans, superpowers:verification-before-completion

**Status:** READY FOR PEER REVIEW. **Base:** merged OBS-02. **Migration:** `0059_observation_pg_monitor.sql`. **Postgres:** 18.6. **External gate:** V's D5 ruling before applying the membership migration.

## Dispatch boundary

- Create only three capacity modules, OBS-05 target/default/drill files, migration 0059, and OBS-05 tests.
- Select numeric statistics only. Never select SQL text/query ids, read the TLS private key, mutate infrastructure, or delete data.
- Slow-query detection is `NOT OBSERVABLE (pg_stat_statements disabled)`.
- The connection drill records baseline B, opens 25 additional clients, then accepts measured total U only when `U >= B+25`; rendered copy uses that same U and measured max. It is not an exact `25/100` assertion.

## SPEC trace

| Requirement | Steps | Acceptance test | File surface |
|---|---|---|---|
| R01–R04 | C1-1..C1-4 | connection/age/size/privacy tests | Postgres module/migration 0059 |
| R05–R07 | C2-1..C2-4 | host/Docker parser and no-mutation tests | host-capacity module |
| R08–R09 | C3-1..C3-4 | cert/default/drill/rollback tests | certificate module/thresholds |
| R10 | C4-1..C4-4 | lifecycle/status/numeric/budget tests | all projections/tests |

## Implementation clusters

### C1 — Postgres capacity and pg_monitor

1. **C1-1 RED:** test measured connections/max every 30s and 80% SEVERE/95% FATAL bands.
2. **C1-2 GREEN:** add migration 0059 for ruled `pg_monitor` membership and implement lock, transaction-age, and idle detectors without SQL text.
3. **C1-3 GREEN:** sample numeric `debateai`/Hatchet sizes and print slow queries as NOT OBSERVABLE.
4. **C1-4 REFUTE:** select `query`/`query_id` and substitute literal 25 for used count; require RED, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-05-postgres.test.ts tests/integration/obs-agent-05-pg-monitor.test.ts tests/architecture/obs-agent-05-sql-privacy.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-05-c1.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C2 — host and Docker capacity

1. **C2-1 RED→GREEN:** parse `/` free percent and Docker disk bytes with 15%/5% bands.
2. **C2-2 RED→GREEN:** parse host memory below 10% as `IMPACT_MEMORY`; emit load above 2×cores for ten 30-second samples as `IMPACT_LOAD` with numeric load/core/multiplier/300-second evidence and the fixed CPU-contention copy.
3. **C2-3 GREEN:** sample container CPU/memory using the frozen read-only Docker argv allow-list.
4. **C2-4 REFUTE:** inject locale/whitespace fixtures and a Docker prune/remove argv; parsing remains typed and mutation fails closed.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-05-host.test.ts tests/integration/obs-agent-05-docker.test.ts tests/architecture/obs-agent-05-no-mutation.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-05-c2.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C3 — certificate and versioned drills

1. **C3-1 RED→GREEN:** validate the certificate target and sample public-certificate days at boot/daily.
2. **C3-2 GREEN:** add default plus connection/disk/certificate drill JSON with schema-valid exact key paths.
3. **C3-3 GREEN:** apply each drill as a new append-only threshold version and restore through a later default version.
4. **C3-4 REFUTE:** point at `localhost-key.pem` and overwrite a threshold version; require RED, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-05-certificate.test.ts tests/integration/obs-agent-05-drills.test.ts tests/architecture/obs-agent-05-key-boundary.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-05-c3.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C4 — lifecycle, projections, timing

1. **C4-1 RED→GREEN:** implement dedup/clear and closed numeric evidence for every ruled capacity class.
2. **C4-2 GREEN:** render status for every numeric metric and exact fixed-copy digest/banner values.
3. **C4-3 GREEN:** prove the complete cycle stays within 35s and stores numeric sample values only.
4. **C4-4 REFUTE:** run baseline B/U fixture and require U≥B+25 with copy equal to U/max; a literal-value mutant must fail, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-05-lifecycle.test.ts tests/integration/obs-agent-05-status.test.ts tests/integration/obs-agent-05-connection-drill.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-05-c4.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

## Acceptance handoff

The canonical V gate is exactly current `SPEC.md` lines 70–81, numbered 1–12. V executes its baseline/U steps 4–5 and reads measured values; worker Vitest is not a numbered V step.
