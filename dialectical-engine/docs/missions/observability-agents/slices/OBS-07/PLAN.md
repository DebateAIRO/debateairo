# PLAN — OBS-07 Channels, status, routing, and storm control

> **Worker skills:** `superpowers:subagent-driven-development` or `superpowers:executing-plans`; every coder also uses `superpowers:test-driven-development` and `superpowers:verification-before-completion`.

SKILLS LOADED: superpowers:using-superpowers, superpowers:brainstorming, superpowers:writing-plans, superpowers:verification-before-completion

**Status:** READY FOR PEER REVIEW. **Base:** merged OBS-02. No migration. **External gate:** V-created `ops-alerts` board only for live ticket acceptance.

## Dispatch boundary

- Create only channel/routing/status modules, OBS-07 fragment/defaults, tests, and storm fixture. `ack` is module-owned at `src/modules/routing/oactl/ack.ts`.
- `notify.dev_capture_dir` is a validated child of the fixed state directory and is projected only to the sendmail child as `DEBATEAI_DEV_MAIL_CAPTURE_DIR`; it is not a fifth agent env input.
- Hermes uses a top-level list array, create/comment only, and no state-changing verbs. Status binds loopback only.
- Five typed inputs within 60s start the ≤15s summary clock at the fifth `detected_at`; four inputs are the negative control. `tests/acceptance/obs-agent-07-storm-fixture.ts` is isolated, writes no `debateai` row, and judges no output.

## SPEC trace

| Requirement | Steps | Acceptance test | File surface |
|---|---|---|---|
| R01–R02 | C2-1..C2-4 | sendmail/Hermes/idempotency tests | channel modules/target fragment |
| R03 | C3-1..C3-4 | loopback/refresh/escaping tests | status-page module |
| R04–R06 | C1-1..C1-4 | routing/ack/mute/rate/escalation tests | routing module/defaults |
| R07 | C2-3, C2-4 | journal ordering/isolation tests | delivery modules |
| R08 | C4-1..C4-4 | five/four/root/clock/recovery tests | routing/storm fixture |
| R09–R10 | C2-4, C3-3 | template/argv/config/privacy tests | architecture tests |
| R11 | C1-4, C4-3 | defaults/channel status tests | defaults/projections |

## Implementation clusters

### C1 — routing, rate limits, ack, escalation

1. **C1-1 RED→GREEN:** implement the exact severity-to-channel matrix and journal-before-attempt ordering.
2. **C1-2 RED→GREEN:** implement ack/mute and ten-minute `(component,class)` rate limiting.
3. **C1-3 RED→GREEN:** implement FATAL 30m×3 and SEVERE 30m-once escalation, suppressed after ack.
4. **C1-4 REFUTE:** add defaults and per-channel status; attempt a fourth FATAL resend and immediate DEGRADED banner, require RED, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-07-routing.test.ts tests/integration/obs-agent-07-escalation.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-07-c1.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C2 — sendmail and Kanban

1. **C2-1 RED→GREEN:** validate the child-only capture directory and invoke sendmail by argv/template with a 10s timeout.
2. **C2-2 RED→GREEN:** create one Kanban ticket per OPEN and comment-only on clear using top-level `.[]` readback.
3. **C2-3 GREEN:** persist delivery identity before each attempt and isolate channel failures with typed self-signals.
4. **C2-4 REFUTE:** inject shell metacharacters and every Hermes state-changing verb; require fixed escaped copy/argv rejection, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-07-sendmail.test.ts tests/integration/obs-agent-07-kanban.test.ts tests/architecture/obs-agent-07-argv.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-07-c2.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C3 — loopback status and injection wall

1. **C3-1 RED→GREEN:** bind HTML/JSON status to `127.0.0.1:9797` only and refresh HTML every 10s.
2. **C3-2 GREEN:** render component, open signal, ack/mute, storm, and channel fields from fixed typed values.
3. **C3-3 GREEN:** escape hostile HTML/JSON fixtures and reject product/provider/private text and unvalidated config.
4. **C3-4 REFUTE:** bind `0.0.0.0` and render an unescaped evidence string; both tests must fail, then revert.

```zsh
set -o pipefail; test_paths=(tests/unit/obs-agent-07-status.test.ts tests/integration/obs-agent-07-loopback.test.ts tests/architecture/obs-agent-07-injection.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-07-c3.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

### C4 — storm attribution and stimulus helper

1. **C4-1 RED→GREEN:** implement the five-within-60s detector, dependency-root order, membership, and one summary.
2. **C4-2 GREEN:** start the ≤15s clock at the fifth timestamp; prove four inputs remain QUIET.
3. **C4-3 GREEN:** implement isolated five/four/recovery actions in `tests/acceptance/obs-agent-07-storm-fixture.ts` and exact status/digest projections without output reads.
4. **C4-4 REFUTE:** start the clock at the first input and target `debateai`; guard tests must fail, then revert.

```zsh
set -o pipefail; test_paths=(tests/integration/obs-agent-07-storm.test.ts tests/unit/obs-agent-07-storm.test.ts tests/integration/obs-agent-07-storm-fixture.test.ts tests/architecture/obs-agent-07-acceptance-boundary.test.ts); for test_path in "${test_paths[@]}"; do test -f "$test_path" || { printf 'MISSING_TEST %s\n' "$test_path" >&2; exit 1; }; done; for run in 1 2 3; do out="$(mktemp "${TMPDIR:-/tmp}/obs-07-c4.XXXXXX")" || exit 1; NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"; test "${pipestatus[1]}" -eq 0 || exit 1; grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$' "$out" || exit 1; done
```

## Acceptance handoff

The canonical V gate is exactly current `SPEC.md` lines 70–87, numbered 1–14. V reads the five input rows, root/membership/fifth-to-summary delay, four-input negative control, and recovery. A missing board gates only live ticket acceptance.
