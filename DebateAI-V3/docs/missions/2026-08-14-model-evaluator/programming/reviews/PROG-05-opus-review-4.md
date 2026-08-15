# PROG-05 review 4 — Opus reviewer A — lane `codex/eval-05-harvest`

Round 4, **narrow delta review**. Branch: `codex/eval-05-harvest` @ `1859b75`
"fix(evaluator): bound prepare-phase harvest failures", on top of `8764ac6`.
Delta: 2 files, +79/-17 — `packages/evaluator/src/index.ts` (control flow of
`harvestTerminalRun` only) and one new regression in
`tests/integration/evaluator-harvest-rework.test.ts`.
Scope of this review: the phase-1 strike gap Hermes withheld approval on
(`PROG-05-hermes-stage-verdict.md`), plus collateral damage to my round-3 green
surface. Prior rounds: reviews 1–3 (REWORK, REWORK, PASS).

## Verdict

**PASS.**

Hermes's finding is real and is now closed at the right level: the strike is
recorded for *any* failure of the repository call the batch wraps, not only for
phase-2 failures. I verified it with my own phase-1 fixture (a different trigger
predicate than the lane's) and confirmed the round-3 surface is intact.

## The gap and the fix

Before `1859b75`, `harvestTerminalRun` ran validation and the whole prepare
transaction — advisory lock, snapshot read, hash, durable STARTED insert —
*outside* its `try`. The `catch` that persists `TERMINAL_HARVEST_FAILED` covered
phase 2 only. The batch caught the phase-1 throw and reported `FAILED`, but the
selector's three-strike bound counts persisted FAILED receipts, so such a run
retried on every pass forever and never parked. The pre-existing poison regression
raised from an observation INSERT in phase 2 and therefore could not see it.

The fix moves validation and the entire prepare transaction inside the `try`, and
synthesizes a deterministic `sha256({run_id, observed_at, failure_phase:"PREPARE"})`
receipt hash when the failure happened before `inputHash` existed. One definition
of failure now feeds both the batch result and the circuit breaker.

## Verification of the fix (my own fixture, not the lane's)

The lane's new test poisons `evaluator.pipeline_event` on `NEW.state='STARTED'`. I
wrote an independent probe keyed on `NEW.reason='TERMINAL_HARVEST_STARTED'`
instead, with my own two-run fixture ordered so the poisoned run sorts strictly
**before** the healthy one in the reconciler's `ORDER BY run_id`:

```
A poison sorts before healthy: true
A pass1: [["FAILED","poison"],["HARVESTED","healthy"]]
A healthy observations after pass1: 1
A poison receipts after pass1: [{"state":"FAILED","c":"1"}]
A pass4 still selects poison: false
A poison receipt trail: FAILED, FAILED, FAILED
A strike hashes: distinct=1 wellFormed=true
A pass5 resurrects parked poison: false
A pass5 harvested the later run: ["HARVESTED"]
```

Each required property, checked directly:

- **Durable strike from a phase-1 failure.** After pass 1 the poisoned run holds
  exactly one receipt and it is `FAILED` — no `STARTED`, because that insert rolled
  back with the prepare transaction. The strike survives the rollback that erased
  the rest of phase 1. This is precisely what was missing.
- **Parks after exactly three attempts.** Three FAILED receipts, then the selector
  stops choosing the run; pass 4 does not contain it.
- **Healthy run in the same batch is isolated**, harvests, and gets its observation
  even though the poisoned run precedes it in the loop.
- **No resurrection, no starvation.** After the poison is removed the parked run
  stays parked (by design — ticket 11 owns the operator surface), and a run created
  afterwards still harvests normally.
- **Synthesized hash is well-formed and stable.** All three strikes share one
  `^[0-9a-f]{64}$` hash, so it satisfies the `input_hash` CHECK and is deterministic
  across attempts for a pinned clock.
- **No swallowing regression from moving validation inside the `try`.** Blank
  `runId` still throws `EVALUATOR_HARVEST_RUN_ID_INVALID` and an invalid
  `observedAt` still throws `EVALUATOR_HARVEST_TIME_INVALID` to the caller; the
  best-effort receipt attempt for an unusable runId fails and is swallowed without
  masking the original typed error.

## Collateral check on my round-3 green surface

| Round-3 probe | Round 4 |
|---|---|
| D — first harvest of a historically-settled run (B4) | still `HARVESTED, 3 observations`, settlement supersedes consensus |
| 4 — phase-2 poison before a healthy run (B5) | still FAILED+HARVESTED, parks at 3, no resurrection, later run harvests |
| `pnpm run typecheck` | clean |
| `pnpm run lint` | architecture 27 edge rows / 0 violations; source no blockers |
| `npx vitest run` | 87 files / **645** tests passed, exit 0 (644 at `8764ac6`) — the delta is exactly the new phase-1 parking regression |

The delta touches only the control flow of one method; the projector, snapshot
reads, supersession logic, metering path, and all four handoffs are byte-identical
to the version I passed in round 3.

## Note (not merge-blocking)

**The strike remains best-effort in one degenerate case.** If the condition that
fails phase 1 also makes the FAILED receipt unwritable for that run, the inner
`catch {}` swallows it and no strike persists, so that run is re-attempted on every
pass indefinitely. Probed directly (a trigger raising on *every* `pipeline_event`
insert for one run):

```
B strike-unwritable run still selected on pass5: true
B healthy run observations (isolation holds): 1
```

I am not treating this as a blocker: it requires `evaluator.pipeline_event` to be
unwritable for a specific run while the rest of the database works, it cannot
starve or block any other run (isolation held throughout), it writes nothing
incorrect, and the swallow is the deliberate, commented "receipt persistence is
best-effort if the database itself is unavailable" path — the alternative would be
to let a receipt-write failure mask the original error. Worth one line in the
ticket-11 handoff: a run that is re-attempted every pass with no receipt movement
is the observable signature of this case.

## Posture

No BOUND state, no API keys (DR-179), no migration, no board mutation, no push, no
product behavior change. Four local commits on the lane branch.

---

Reviewer: Opus reviewer A. Read-only outside this file and my self-report (plus
Hermes's stage verdict, read at the coordinator's instruction); probe scripts
written to scratchpad only, never into the worktree. No commits.
