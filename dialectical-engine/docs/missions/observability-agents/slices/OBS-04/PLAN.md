# PLAN — OBS-04 Capture health, blind periods, and spool

> **Worker skills:** `superpowers:subagent-driven-development` or `superpowers:executing-plans`; every coder also uses `superpowers:test-driven-development` and `superpowers:verification-before-completion`.

SKILLS LOADED: superpowers:using-superpowers, superpowers:brainstorming, superpowers:writing-plans, superpowers:verification-before-completion

**Status:** READY FOR PEER REVIEW. **Base:** merged OBS-02. No migration.

## Dispatch boundary

- Create only capture/spool modules, `targets.dev.d/OBS-04.json`, defaults, OBS-04 tests, and the stimulus-only fixture. Do not edit OBS-01 registries or product/FixAgent code.
- Before future runtime wiring, zero FLUSH_OK rows means exactly NOT WIRED. Isolated typed gap proof is runnable now; live FLUSH_OK and blind recovery remain successor observations, not source-defect gates.
- Never use directory permission changes as loss evidence. Read spool metadata only; never read content or excluded-zone paths.
- `tests/acceptance/obs-agent-04-fixture.ts` uses a unique isolated database, writes no `debateai` row, and cannot inspect/assert output. V personally runs the SPEC's 10 steps.

## SPEC trace

| Requirement | Steps | Acceptance test | File surface |
|---|---|---|---|
| R01–R02 | C1-1..C1-3 | relation/error/NOT-WIRED tests | capture-health module |
| R03 | C3-1 | FLUSH_OK silence tests | capture-health module |
| R04 | C2-1..C2-3 | typed gap/17s/band tests | module and fixture |
| R05 | C3-2 | spool age/receipt/metadata tests | spool-health and target fragment |
| R06–R07 | C2-4, C3-3 | lifecycle/defect-exclusion/privacy tests | modules/architecture tests |
| R08 | C1-4, C3-4 | defaults/status/digest tests | defaults/projections |

## Implementation clusters

### C1 — read cursors and NOT WIRED authority

1. **C1-1 RED:** cover the three capture-health relations, own-schema cursor, and UNKNOWN on every read failure.
2. **C1-2 GREEN:** implement read-only polling and cursor persistence in `observation` only.
3. **C1-3 GREEN:** emit daily-deduped NOT WIRED until a positive FLUSH_OK row exists; no FixAgent prerequisite.
4. **C1-4 REFUTE:** substitute process liveness for FLUSH_OK and duplicate the daily line; require RED, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-04-cursor.test.ts tests/integration/obs-agent-04-not-wired.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-04-c1.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C2 — typed capture-gap lifecycle

1. **C2-1 RED→GREEN:** detect the causal typed gap row within 17s and apply the 100-in-5m severity band.
2. **C2-2 GREEN:** implement one OPEN identity, immutable clear, fixed copy, and allow-listed numeric metadata.
3. **C2-3 GREEN:** implement isolated input/recovery actions in `tests/acceptance/obs-agent-04-fixture.ts` without reading outputs or targeting `debateai`.
4. **C2-4 REFUTE:** add capture content and route a gap into `defect_signal_v`; privacy/boundary tests must fail, then revert.

```zsh
set -o pipefail; test_paths=(tests/integration/obs-agent-04-gap-drill.test.ts tests/unit/obs-agent-04-gap.test.ts tests/integration/obs-agent-04-fixture.test.ts tests/architecture/obs-agent-04-acceptance-boundary.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-04-c2.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C3 — blind windows, spool, projections

1. **C3-1 RED→GREEN:** open BLIND_PERIOD only for runtime UP plus ≥120s FLUSH_OK silence; clear on positive authority.
2. **C3-2 RED→GREEN:** validate spool directories from the OBS-04 fragment and detect unreceipted `.spool` metadata older than 10m.
3. **C3-3 GREEN:** enforce dedup/clear, zone exclusions, metadata-only evidence, and capture-class exclusion from the defect view.
4. **C3-4 REFUTE:** add defaults/status/digest; try reading a spool body and a chmod stimulus, require RED, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-04-blind-spool.test.ts tests/integration/obs-agent-04-status.test.ts tests/architecture/obs-agent-04-zone.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-04-c3.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

## Acceptance handoff

The canonical V gate is exactly current `SPEC.md` lines 60–73, numbered 1–10. Steps 5–7 use the isolated preparer but V reads the outputs. Future live FLUSH_OK/blind observations remain named successor observations without blocking this slice's isolated implementation.
