# PROG-05 review 3 — Opus reviewer A — lane `codex/eval-05-harvest`

Round 3 (rework review). Branch: `codex/eval-05-harvest` @ `8764ac6`
"fix(evaluator): make settlement harvest time-safe", on top of `720303d` / `50b1a17`.
Rework diff: 5 files, +388/-40 (worker, evaluator package, README, the rework
integration test, projector unit tests). No migration, no product file.
Prior rounds: `PROG-05-opus-review-1.md` (REWORK, B1–B3),
`PROG-05-opus-review-2.md` (REWORK, B4–B5).

## Verdict

**PASS.**

Both round-2 blockers are genuinely closed. I re-ran my own two reproductions
against a real database — the ones that were red in round 2 are green now, and I
added an independent third probe for the batch-isolation claim rather than
trusting the lane's own test. Every round-1 blocker and finding remains closed;
nothing on my previously-passed surface regressed.

## Round-2 blockers — verified closed

### B4 — settlement supersession is now time-safe

Fix: the settlement observation's `observed_at` is
`max(harvest clock, prior consensus row's observed_at)` — computed in the
projector from the snapshot and re-computed in the repository against the prior's
actual `observed_at` read back inside the write transaction, so both the
snapshot-matched and the in-transaction-fallback path are ordered. The resolver's
true `resolved_at` is preserved in `outcome_json` **and** `provenance_json`, so
nothing is lost from the audit trail.

My round-2 reproductions, re-run verbatim on `8764ac6`:

```
D first harvest of a historically-settled run:
   NO THROW -> {"state":"HARVESTED","observationsInserted":3}
D rows: CONSENSUS authoring.artifact.v1 | CONSENSUS prowess.outcome.v1
        | SETTLEMENT prowess.outcome.v1 (supersedes: true)

A backdated late settlement:
   NO THROW -> {"state":"SETTLEMENTS_RECONCILED","observationsInserted":1}
```

Both were `OBSERVATION_SUPERSESSION_INVALID` in round 2. The same-pass form (a run
whose settlement resolved *before* its first harvest — the ordinary case for any
backfill over settled history) now harvests and links the supersession correctly;
the late-arrival form reconciles.

### B5 — batch reconciler isolates failures and bounds retries

Fix: per-run `try/catch` returning a typed
`{ state: "FAILED", runId, reason: "TERMINAL_HARVEST_FAILED" }` element instead of
aborting the loop, plus a selector clause that stops re-selecting a run after
`HARVEST_MAX_CONSECUTIVE_FAILURES = 3` FAILED receipts since its last
SUCCEEDED/SKIPPED. The counter cannot be gamed by the harvest's own SKIPPED
receipts: those are written inside the failing transaction and roll back with it.

I did **not** reuse the lane's test for this. My own probe creates two runs, sorts
them so the poisoned run is strictly **before** the healthy one in the
reconciler's `ORDER BY run_id` sequence, and poisons only the first:

```
poison=1a722dee… < healthy=548405ed… : true
pass1: [["FAILED","poison"],["HARVESTED","healthy"]]
healthy-run observations after pass1: 1
pass4 still selects poisoned run: false
poison FAILED receipts (bounded at 3): 3
pass5 selects parked poison run: false
pass5 harvested later run: [{"state":"HARVESTED","observationsInserted":1}]
```

In round 2 the identical fixture gave `C later-run observations: 0`. The batch now
proceeds past the failure, the poisoned run parks after exactly three attempts
instead of retrying forever, and a run created afterwards still harvests normally.

## Round-2 non-blockers — status

1. **STARTED receipt vs. the write — fixed.** Phase 2 now reuses the frozen phase-1
   snapshot instead of re-reading, so the STARTED and terminal receipts hash the
   same observation set that was actually inserted. `harvestInputHash` also widened
   to cover `value`, `outcome_json`, `provenance_json`, and `observed_at`. A
   settlement landing between the two phases is simply picked up on the next pass
   (the selector re-selects unprojected settlements) — correct, and now consistent.
2. **Second settlement for one prior — documented and receipted.** The second row
   stays auditable with a null link plus a typed
   `SUPERSESSION_PRIOR_UNAVAILABLE:<answer_outcome_id>` receipt; README states one
   consensus row is superseded once. My probe B confirms: two settlement rows, one
   linked, one null, no crash.
3. **`reconcileMeteringBestEffort` — fixed.** No more fabricated `callsFailed: 1`;
   it returns `failureReason: "METERING_RECONCILIATION_FAILED"` with honest zeroes,
   and the lane added a test that drives it through an invalid window. Consistent
   with FR-0.5's no-fabricated-meters posture.
4. **Metric collision guidance — added.** README now instructs ticket 07 to treat a
   settlement row as *replacing* the row named by `supersedes_observation_id` and
   never to pool or average the two.

## Regression check on my previously-passed surface

- Handoffs 1–4 untouched by this commit and still green: `evaluator.` call-site
  exclusion by attempt id, `evaluator.question_domain` as sole domain authority
  with the nullable-domain DB test, the worker-side metering caller, attempt-id
  correlation with the null-run evaluator artifact.
- Q59 separation intact: every `INSERT` in the evaluator package targets an
  `evaluator.*` table (grep-verified across all nine); no `scorecard.*`, `core.*`,
  or `memory.*` write exists on any harvest path.
- Zero-provider-call gate (round-1 B2) still asserted, negative control included.
- FR-0.6 AC5 persisted panel differential still green.
- Fixture clocks are now pinned throughout (`SETTLED_AT` 07:00 < `HARVESTED_AT`
  09:00 < `RECONCILED_AT` 10:00), which is what makes the ordering assertions
  meaningful rather than accidental — the round-2 blind spot is closed at its root.

## Notes (no action required to merge)

1. **`SUPERSESSION_ORDER_INVALID` is unreachable.** Since `safeTime` is a `Math.max`
   of the two timestamps, `safeTime < priorObservedAt` cannot hold, and both dates
   are already validated non-`Invalid`. The ordering problem is solved *by
   construction*, not by the typed receipt — which is the stronger outcome, but the
   branch is dead code and the receipt reason will never appear in production.
   Describe it as "ordering made impossible" rather than "receipt on invalid
   ordering", and consider dropping the branch.
2. **Duplicated `SUPERSESSION_PRIOR_UNAVAILABLE` block.** The two near-identical
   guarded blocks run the same `matchingPrior` query; the second is unreachable
   whenever the first's condition holds, and its query is redundant work per
   settlement row. Fold them into one.
3. **Parked runs have no operator surface** beyond `evaluator.pipeline_event` rows.
   Fine for dark launch; ticket 11's status view should expose "runs parked after N
   failed harvests" so a parked run cannot go unnoticed.
4. `serve.answer` remains unread (Architecture §5.2 lists it) — note only, no
   observable consequence.

## Verification I ran myself

| Check | Result |
|---|---|
| `pnpm run typecheck` | clean |
| `pnpm run lint` | architecture 27 edge rows / 0 violations; source no blockers |
| `npx vitest run` (full suite) | 87 files / **644** tests passed, exit 0 (was 639 at `720303d`) |
| Probe D — first harvest of a historically-settled run | **fixed** (was `OBSERVATION_SUPERSESSION_INVALID`) |
| Probe A — backdated late settlement | **fixed** (was `OBSERVATION_SUPERSESSION_INVALID`) |
| Probe C/4 — poisoned run before a healthy run in one batch | **fixed** (healthy run harvests; retries bounded at 3; parked run does not resurrect) |
| Probe B — two settlements, one prior | clean (one linked, one auditable-null) |
| Write-target grep across the evaluator package | evaluator-owned tables only |

Test honesty: the lane's five new/updated tests assert real state — receipt rows,
`observed_at` equal to the pinned reconcile clock, `provenance_json.resolved_at`
equal to the pinned settle clock, supersession identity, batch result shape, and
an exact FAILED-receipt count of 3. The round-2 blind spot (every fixture settling
*after* harvest) is gone: `SETTLED_AT` now precedes `HARVESTED_AT` in the
supersession tests, which is precisely the ordering that was red.

## Posture

No BOUND state, no API keys (DR-179), no migration, no board mutation, no push, no
product behavior change. Three local commits on the lane branch.

---

Reviewer: Opus reviewer A. Read-only outside this file and my self-report; probe
scripts written to scratchpad only, never into the worktree. No commits.
