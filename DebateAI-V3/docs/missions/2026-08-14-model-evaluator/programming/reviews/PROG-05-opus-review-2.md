# PROG-05 review 2 — Opus reviewer A — lane `codex/eval-05-harvest`

Round 2 (rework review). Branch: `codex/eval-05-harvest` @ `720303d`
"fix(evaluator): reconcile late settlements safely", on top of `50b1a17`.
Rework diff: 5 files, +558/-75 (worker, evaluator package, README, one new
integration test file, unit-test snapshot updates).
Round 1 review: `PROG-05-opus-review-1.md` (REWORK, 3 blockers + 7 findings).

## Verdict

**REWORK.** Round-1 blockers 1 and 2 are genuinely closed and blocker 3 is
implemented — but the supersession implementation introduced in this commit is
**not time-safe**, and the batch reconciler still has **no per-run isolation**.
Together these reproduce, one layer up, the exact property round 1 asked to be
removed: one unprocessable run permanently blocks unrelated runs. Both are
confirmed against a real database, not inferred.

## Round-1 blockers — status

| # | Round-1 blocker | Status | Evidence |
|---|---|---|---|
| B1 | Malformed usage poisons metering and blocks all harvest | **CLOSED** | My round-1 stub-pool probe re-run verbatim: all four malformed shapes now reach the write path instead of throwing at parse. `readObservedUsage` runs `assertObservedUsage` as a filter and returns `null` (→ UNMETERED); the projection loop is per-row `try/catch` with a `callsFailed` counter; the worker wraps metering in `reconcileMeteringBestEffort` so metering can no longer block harvest at all. The lane's new DB test lands all three malformed shapes as `UNMETERED` and still harvests an unrelated run. |
| B2 | Zero-provider-call proof only argued | **CLOSED, and stronger than asked** | `expectNoProviderEvidenceDuring` asserts `ledger.raw_artifact` and `MODEL_CALL` `ledger.ledger_entry` counts are invariant across `runEvaluatorTerminalHarvest`, **plus a negative control** that injects an artifact and proves the assertion fails. That is a real gate, not a restatement of a type signature. |
| B3 | Late settlements unharvestable; supersession unimplemented | **Implemented, but incorrect — see B4** | Settlement revisit pass added: the batch selector also picks previously harvested runs holding an accepted `answer_outcome` with no observation referencing it; `supersedes_observation_id` is populated (projector match + in-transaction DB fallback, settlement rows ordered last); the consensus row stays append-only; Q59 untouched (the test asserts the `answer_outcome` count is unchanged). |

Round-1 findings: F1 closed (`MODEL_IDENTITY_INCOMPLETE:<artifact>` SKIPPED
receipt, tested); F2 closed by documentation (README now states relative-cost
cells are first-write snapshots per identity/window/derivation version); F3 closed
(batch capped at 100, validated integer); F4 closed (untargeted `ON CONFLICT`,
fallback SELECT on either key, pending query excludes on either key); F5 closed by
comment; F7 improved (the settlement re-pass now exercises the observation natural
key). F6 (`serve.answer` unread) stands as a note only.

## New blockers

### B4. Settlement supersession is not time-safe — ordinary settled runs fail to harvest

`evaluator.validate_observation_supersession()` refuses
`NEW.observed_at < prior.observed_at`. The settlement observation carries
`observed_at = scorecard.answer_outcome.resolved_at` — a **caller-supplied
external-resolver timestamp** (`packages/settlement/src/index.ts` takes
`resolvedAt` as input; it is not `now()`), while the consensus row it supersedes
carries the **harvest clock**. Whenever a settlement resolved before the harvest
ran, the insert raises and the whole run fails.

This is not an exotic ordering. It is the default for any already-settled run on
the first backfill pass. Confirmed on a real database (my probe, not the lane's
tests):

```
D first harvest of a historically-settled run:
   THREW OBSERVATION_SUPERSESSION_INVALID: prior cbbd8324… new 2cf4d7f6…
```

Fixture: terminal run + authored node + strength + accepted `answer_outcome`
(`resolved_at = 2026-08-10`), harvested for the first time at
`observedAt = 2026-08-15T09:00Z`. Consensus and settlement rows are written in the
**same pass**, so no "late arrival" is needed — the run simply never harvests.

The late-arrival variant fails identically:

```
A backdated settlement:              THREW OBSERVATION_SUPERSESSION_INVALID
A batch reconciler after failure:    THREW OBSERVATION_SUPERSESSION_INVALID
A receipts: STARTED, SUCCEEDED, STARTED, FAILED, STARTED, FAILED
```

The receipt trail shows the second consequence: the run stays selected by the
batch query forever (its settlement is still unprojected), so every pass re-fails
and appends another STARTED+FAILED pair — unbounded receipt growth with no
progress and no backoff.

Note this defect is **new in `720303d`**: round 1 never populated
`supersedes_observation_id`, so the trigger always returned early.

Fix: keep the audit fact where it belongs and stop feeding `resolved_at` to a
column the trigger orders on — e.g. set the settlement row's `observed_at` to the
harvest clock (or `max(resolved_at, prior.observed_at)`) and keep `resolved_at`
in `outcome_json`/`provenance_json`. Add a regression test with
`resolved_at < observedAt` in both shapes (same-pass and late-arrival).

### B5. Batch reconciler has no per-run isolation — one bad run blocks every later run

`reconcileEvaluatorTerminalRuns` loops `for (const row of terminal.rows)` with no
`try/catch`. The first failing run aborts the batch, and because the selector is
`ORDER BY event.run_id`, the same runs are blocked on every subsequent pass —
deterministically and permanently. Confirmed:

```
C batch: THREW OBSERVATION_SUPERSESSION_INVALID …
C later-run observations: 0
```

The healthy run in probe C was created *after* the poisoned one, is entirely
unrelated to it, and harvests fine on its own — it received zero observations
purely because an earlier run in the batch threw.

This is the same property round 1 flagged as B1 ("one malformed artifact anywhere
blocks harvest for every run"), fixed at the metering layer and left intact at the
harvest layer. The machinery to close it already exists in this commit: the FAILED
receipt path. Wrap the per-run call, record FAILED, continue the batch, and return
the failures in the result so a scheduler can see them.

## Findings (non-blocking)

1. **STARTED receipt describes a different read than the write.**
   `harvestTerminalRun` is now two transactions: phase 1 takes the advisory lock,
   reads the snapshot, computes `inputHash`, writes STARTED, and **commits**;
   phase 2 re-takes the lock, **re-reads the snapshot**, and writes rows — but
   stamps the phase-1 hash onto the SUCCEEDED/FAILED/SKIPPED receipts. The receipt
   hash therefore need not describe what was actually inserted. Also, every
   single-run call against an already-harvested run appends a STARTED + SKIPPED
   pair even when nothing changes.
2. **Two accepted settlements, one consensus prior:** the second settlement row
   silently gets `supersedes_observation_id = NULL` (verified: probe B returned
   `SETTLEMENTS_RECONCILED, observationsInserted: 2`, one row superseding and one
   null). No crash — the projector's splice plus the in-transaction fallback avoid
   the `supersedes_observation_id` UNIQUE collision I expected — but which
   settlement wins is undocumented.
3. **`reconcileMeteringBestEffort` swallows everything.** `catch {}` around the
   whole reconciliation returns a fabricated `{ callsProjected: 0, callsFailed: 1 }`.
   A database outage, a bug, and one bad row are indistinguishable, and nothing is
   recorded. Given FR-0.5's "no fabricated meters" posture, report a real count or
   a typed failure receipt rather than a hardcoded `1`.
4. **Metric collision by design.** `authoring.strength.v1` was renamed to
   `prowess.outcome.v1` so the supersession trigger's `prior.metric = NEW.metric`
   check passes — so consensus rows now carry a propagated strength and settlement
   rows a 0/1 outcome **under the same metric name**. That is the correct
   mechanism, but ticket 07 aggregation must treat superseded rows as replaced, not
   pooled. Please state that explicitly in the README/handoff.
5. `serve.answer` still unread (Architecture §5.2 lists it) — note only; it now
   appears in fixtures purely as a settlement carrier.

## Verification I ran myself

| Check | Result |
|---|---|
| `pnpm run typecheck` | clean |
| `pnpm run lint` | architecture 27 edge rows / 0 violations; source no blockers |
| `npx vitest run` (full suite) | 87 files / 639 tests passed, exit 0 — including all 5 new `evaluator-harvest-rework` tests |
| Round-1 stub-pool poison probe, re-run verbatim | all malformed shapes now reach the write path (B1 closed) |
| Probe A/B/C (real embedded Postgres, my fixtures) | B4 + B5 reproduced; probe B clean |
| Probe D (first harvest of a historically-settled run) | B4 reproduced in its most ordinary form |

Test honesty: the lane's five new tests are real — they assert receipt rows,
`metering_status`/`raw_usage` contents, `supersedes_observation_id` identity, and
provider-evidence invariance, and the zero-provider-call test carries its own
negative control. What they do not cover is the time ordering of `resolved_at`
versus the harvest clock: every settlement fixture in the suite resolves *after*
the consensus rows were written, which is precisely why B4 is green in CI and red
on ordinary data.

## Posture

Unchanged and clean: no BOUND state, no API keys (DR-179), no migration, no board
mutation, no push, no product behavior change. Two local commits on the lane
branch.

## Rework scope

B4 is a one-line choice about which timestamp lands in `observed_at`, plus a
regression test in both orderings. B5 is a `try/catch` + FAILED receipt + continue
inside the existing loop, plus failure reporting in the batch result. Findings 1
and 3 are small. The lane's structure — reconciler, projector, receipts,
supersession pass, four handoffs — is right; this is the last mile of it.

---

Reviewer: Opus reviewer A. Read-only outside this file and my self-report; probe
scripts were written to scratchpad, never to the worktree. No commits.
