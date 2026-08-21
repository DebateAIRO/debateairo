# Opus reviewer A — PROG-05 peer review (lane `codex/eval-05-harvest`)

Seat: Opus reviewer A, PROGRAMMING loop, mission model-evaluator.
Rounds: 1 (`50b1a17`) REWORK → 2 (`720303d`) REWORK → 3 (`8764ac6`) PASS →
4 (`1859b75`, narrow delta after Hermes withheld stage approval) **PASS**.
Reviews: `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-05-opus-review-{1,2,3,4}.md`.

## Current verdict (round 4, commit `1859b75`)

**PASS.** Hermes's phase-1 strike gap is genuinely closed, verified with my own
fixture rather than the lane's, and nothing on my round-3 green surface regressed.

### The gap

`harvestTerminalRun` ran validation and the whole prepare transaction (advisory
lock, snapshot, hash, durable STARTED insert) outside its `try`; the catch that
persists `TERMINAL_HARVEST_FAILED` covered phase 2 only. The batch reported such
runs as `FAILED` but no strike persisted, so the three-strike selector never
parked them. I missed this in round 3: my isolation probe, like the lane's,
poisoned an observation INSERT in phase 2. Hermes caught it by reading the `try`
boundary rather than the failure symptom — the right kind of catch.

### The fix, verified

Validation and the prepare transaction now sit inside the `try`, and a
deterministic `sha256({run_id, observed_at, failure_phase:"PREPARE"})` stands in
for the receipt hash when the failure predates `inputHash`. My independent probe
(trigger keyed on `reason='TERMINAL_HARVEST_STARTED'`, not the lane's
`state='STARTED'`, poisoned run sorting strictly before the healthy one):

- pass 1 → `FAILED(poison)` + `HARVESTED(healthy)`, healthy run got its observation;
- after pass 1 the poisoned run holds exactly one receipt, `FAILED`, with **no**
  `STARTED` — the strike survives the rollback that erased the rest of phase 1;
- exactly three strikes, then parked: pass 4 no longer selects it;
- all three strike hashes identical and `^[0-9a-f]{64}$` (CHECK-valid, deterministic);
- parked run does not resurrect, and a run created later still harvests;
- moving validation inside the `try` did not swallow anything: blank `runId` and
  invalid `observedAt` still throw their typed errors to the caller.

### Collateral check

Round-3 probes D (time-safe supersession) and 4 (phase-2 poison isolation +
parking) re-run green. `pnpm run typecheck` clean; `pnpm run lint` clean (27 edge
rows / 0 violations, no source blockers); `npx vitest run` 87 files / **645** tests,
exit 0 — the +1 versus `8764ac6` is exactly the new phase-1 parking regression.
The delta touches only one method's control flow; projector, snapshot reads,
supersession, metering, and all four handoffs are byte-identical to round 3.

### Note (not merge-blocking)

The strike stays best-effort in one degenerate case: if the same condition that
fails phase 1 also makes the FAILED receipt unwritable for that run, the
deliberate best-effort `catch {}` swallows it and the run is re-attempted every
pass. Probed directly — it retries unbounded but **cannot** starve or block any
other run (isolation held) and writes nothing incorrect. Suggested one-line
ticket-11 handoff: a run re-attempted every pass with no receipt movement is the
observable signature.

## Posture

No BOUND state, no API keys (DR-179), no migration, no board mutation, no push, no
product behavior change. Four local commits on the lane branch.

## Constraint compliance

Read-only outside my review files and this self-report, plus Hermes's stage verdict
read at the coordinator's explicit instruction; probe scripts written to scratchpad
only, never into the worktree. No commits, no branch or board mutation.
