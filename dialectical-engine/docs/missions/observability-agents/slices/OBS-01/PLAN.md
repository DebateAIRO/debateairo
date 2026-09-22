# PLAN — OBS-01 Agent foundation and liveness

> **Worker skills:** `superpowers:subagent-driven-development` or `superpowers:executing-plans`; every coder also uses `superpowers:test-driven-development` and `superpowers:verification-before-completion`.

SKILLS LOADED: superpowers:using-superpowers, superpowers:brainstorming, superpowers:writing-plans, superpowers:verification-before-completion

**Status:** READY FOR PEER REVIEW. **Base:** reviewed `dev` after WAR-PLAN Op 0.2 remeasures the stale `TYPECHECK-BASELINE.md` pin (`3503dcf8` versus reviewed `2b670d30`). **Migration:** `0057_observation_foundation.sql`. **Postgres:** 18.6.

## Dispatch boundary

- This slice runs alone. OBS-02 starts only from merged, V-approved OBS-01.
- Create `apps/observation-agent/**`, `deploy/observation-agent/**`, `migrations/0057_observation_foundation.sql`, and OBS-01 tests. Append only `loadObservationAgentEnvironment()` in `packages/register/src/runtime-environment.ts`; do not edit product entry points or root workspace manifests.
- The loader owns exactly four agent environment inputs; `OBSERVATION_TARGETS_PATH` is an absolute `targets.dev.d` directory. There is no `.state` sidecar.
- Freeze the exact `ObservationModuleManifest` recorded in `DECISIONS.md` and export `type Module = ObservationModuleManifest`: name, cadence, optional target basename, optional module-owned `oactl` contributions, `probe`, `samples`, and `signals`. Lexical discovery rejects duplicate modules, targets, and verbs.
- Worker Vitest is a milestone only. V personally runs the SPEC's 13 numbered acceptance steps.

## SPEC trace

| Requirement | Steps | Acceptance test | File surface |
|---|---|---|---|
| R01 | C2-1, C2-2 | discovery/duplicate architecture tests | `src/core/modules.ts`, module-owned `oactl/**` |
| R02 | C1-1, C1-2 | four-key environment test | register loader, `src/core/environment.ts` |
| R03 | C1-3, C1-4 | schema/grant/trigger integration tests | migration 0057, `src/store/**` |
| R04–R05 | C2-3, C2-4 | four probes and fake-clock transitions | target fragment, `core-liveness/**` |
| R06–R07 | C1-4, C3-1, C3-2 | vocabulary and crash-order tests | migration 0057, journal/store |
| R08–R09 | C3-3, C3-4 | rate-limit/digest/atomic-status tests | notify and status modules |
| R10–R11 | C4-1, C4-3 | verb/custody/liveness tests | core oactl, launchd, launch script |
| R12 | C1-4, C2-2 | grants/import/argv architecture tests | tests, Docker wrapper |
| R13–R15 | C4-2, C4-3, C4-4 | thresholds/resource/self/heartbeat tests | defaults, self module, runtime |

## Implementation clusters

### C1 — package, environment, schema, privacy wall

1. **C1-1 RED:** add bootstrap tests that require an independent process and register-only environment access.
2. **C1-2 GREEN:** implement the four-key loader and frozen absolute state/target paths; reject `process.env` below the agent.
3. **C1-3 RED→GREEN:** implement migration 0057 with the `observation` role/schema, seven tables, views, append-only triggers, and least-privilege grants.
4. **C1-4 REFUTE:** mutate one out-of-schema grant, fifth env key, and open enum; require RED, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-01-environment.test.ts tests/integration/obs-agent-01-foundation.test.ts tests/architecture/obs-agent-01-boundaries.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-01-c1.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C2 — manifest, discovery, targets, probes

1. **C2-1 RED:** specify the exact manifest, its explicit `type Module = ObservationModuleManifest` alias, and lexical module/verb/target discovery with deterministic duplicate errors.
2. **C2-2 GREEN:** implement discovery and the Docker argv allow-list; reject shell execution and mutating verbs.
3. **C2-3 GREEN:** add the OBS-01 fragment and Postgres, Hatchet, Docker-engine, and self probes.
4. **C2-4 REFUTE:** prove 5s/2s cadence and two-fail/two-ok transitions; duplicate a target and verb, require closed failure, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-01-discovery.test.ts tests/integration/obs-agent-01-liveness.test.ts tests/architecture/obs-agent-01-docker.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-01-c2.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C3 — journal, mirror, delivery, projections

1. **C3-1 RED:** inject crash points around append/fsync/mirror and require journal-first ordering.
2. **C3-2 GREEN:** implement typed identities, append-only journal, ≤5s mirror lag, ≤10s catch-up, and immutable clear successors.
3. **C3-3 GREEN:** implement ≥SEVERE/CLEARED osascript delivery and the ten-minute key rate limit using fixed templates.
4. **C3-4 REFUTE:** implement exact digest and atomic status; a mirror-before-fsync mutant and hostile evidence fixture must fail, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-01-journal.test.ts tests/integration/obs-agent-01-delivery.test.ts tests/architecture/obs-agent-01-privacy.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-01-c3.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C4 — controls, thresholds, supervision, self-observation

1. **C4-1 RED→GREEN:** implement core provision/install/start/status/kill/mute/unmute verbs with SPEC exit codes and fixed state path.
2. **C4-2 RED→GREEN:** implement validated defaults, append-only threshold versions, apply diff, fail-closed reload, and lexical merge.
3. **C4-3 GREEN:** add launchd custody, start/stop/journal-failure self-signals, and the 5s heartbeat.
4. **C4-4 REFUTE:** verify external liveness witnesses, 2s statement timeout, ≤2 sessions, CPU/RSS bounds, and product survival; break custody once, require RED, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-01-oactl.test.ts tests/integration/obs-agent-01-supervision.test.ts tests/architecture/obs-agent-01-runtime.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-01-c4.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

## Acceptance handoff

The canonical V gate is exactly `SPEC.md` lines 83–99, numbered 1–13. Do not copy or renumber it here. Also run `pnpm audit:source` and compare `pnpm typecheck` only against the fresh Op 0.2 baseline. Missing implementation leaves these commands **UNVERIFIED**.
