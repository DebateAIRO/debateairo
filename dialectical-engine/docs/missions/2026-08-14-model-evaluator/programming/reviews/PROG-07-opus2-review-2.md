# PROG-07 peer review 2 — opus2 seat (second independent reviewer)

- **Lane:** `codex/eval-07-profiles` @ `6a05f47` ("fix(evaluator): correct profile derivation semantics")
- **Previous review:** `PROG-07-opus2-review-1.md` @ `a2b1f4e` — REWORK, 4 blockers
- **Worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-07-profiles`
- **Reviewer:** opus2 (independent; no other PROG-07 review file read in either round)
- **Date:** 2026-08-15
- **Verdict: PASS**

Rework surface: new `migrations/0027_evaluator_rank_metric.sql`, `packages/db/src/schema.ts` (+1
column), `packages/evaluator/src/index.ts` (±225), the selector-unbound architecture test widened,
the profiles integration test adjusted, one unit test removed, and a new
`tests/integration/evaluator-profiles-rework.test.ts` (+307) that builds fixtures through the **real**
lane-05 harvest repository.

---

## 1. What I ran this round

| Check | Result |
|---|---|
| `pnpm run typecheck` | exit 0 |
| Full repository suite `npx vitest run` | **96 files / 693 tests passed**, exit 0 (was 95/690) |
| My own round-2 adversarial pure suite — 22 assertions, all re-derived by hand against the **new** formulas | passed |
| My own round-2 adversarial live-Postgres suite — 4 scenarios (embedded PostgreSQL, DR-121) | passed |
| My own migration-0027 constraint-surface probe on live Postgres | passed |
| Repo-wide selector / derivation call-site grep | zero production callers |
| Clock / `BOUND` / API-key hunt over the rework diff | clean |
| Worktree after my run | clean (`git status` empty, HEAD `6a05f47`); scratch tests lived under gitignored `coverage/` and were deleted |

I rebuilt every fixture from scratch for the new semantics rather than re-running round 1's — the
rework changed what leniency, contradiction, and lineage residue *mean*, so round-1 numbers are no
longer the right oracle.

---

## 2. Blocker-by-blocker verification

### B1 — cross-metric prowess ladder → **FIXED**

`prowessRankGroups` is now keyed `(domainId, step, metric)`, the `metricPriority` ladder is deleted,
every cell of a metric is ranked inside its own series, and `EvaluatorDerivedRank` carries a `metric`
that is persisted through migration 0027.

Re-ran my round-1 proofs against the new code:

```
prowess.consensus-strength.v1 : A 0.99 (n=2) #1 , B 0.50 (n=1) #2
prowess.settlement-outcome.v1 : A 0.40 (n=1) #1
```

and the JUDGING case that was sharpest last round:

```
prowess.blind-judge-grade.v1 : J2 0.20 #1
prowess.judging-tau.v1       : J1 0.95 #1 , J2 0.90 #2
```

A judge's add-on quality grade no longer competes against another judge's mean tau. On live
Postgres I confirmed two different models hold `PROWESS` ordinal 1 inside one
`(rank_kind, domain_id=NULL, step='JUDGING', as_of, derivation_version)` group — a row shape the
pre-0027 unique key would have rejected outright, which is precisely the constraint change B1
required. `bias.composite-rank.v1` labels the judge ladder, so a composite is now self-declaring
rather than silently mixed.

**Migration 0027 itself checks out.** On live Postgres the surviving unique constraints are exactly
`rank_snapshot_at_seq_key UNIQUE (at_seq)`,
`rank_snapshot_ordinal_key UNIQUE NULLS NOT DISTINCT (rank_kind, domain_id, step, metric, ordinal, as_of, derivation_version)`
and
`rank_snapshot_identity_key UNIQUE NULLS NOT DISTINCT (rank_kind, provider, model_id, model_version, domain_id, step, metric, as_of, derivation_version)`;
no non-metric `rank_kind` unique key survives the dynamic drop loop, `at_seq` uniqueness is
untouched, and re-running the migration leaves the constraint count unchanged (no drift). The
`'legacy.mixed.v0'` backfill default is an honest label for any pre-existing mixed ladder.

### B2 — automatic consensus discount → **FIXED**

The priority table that gave consensus evidence weight zero is gone. My round-1 proof fixture now
behaves correctly:

```
A: two unsettled consensus samples at 0.99 + one settlement sample at 0.4
B: one consensus sample at 0.5
-> prowess.consensus-strength.v1 : A #1 (0.99, n=2) , B #2 (0.5, n=1)
-> prowess.settlement-outcome.v1 : A #1 (0.4, n=1)
```

A's consensus evidence now leads its own ladder at full weight and n=2, instead of being discarded.
Ruling 4 / FR-3.2 AC1 / Architecture §5.2 satisfied.

### B3 — silent discard of a changed re-derivation → **FIXED**

`insertProfileCell` now re-reads `derivation_hash` on conflict and raises
`TypedDomainError("EVALUATOR_PROFILE_DERIVATION_CONFLICT")` when it differs;
`insertRankSnapshot` does the same against `source_hash` with
`EVALUATOR_RANK_DERIVATION_CONFLICT`. I re-ran my exact round-1 scenario on live Postgres and
checked four things, not one:

1. **No false positive.** An unchanged re-run at the same `as_of`/version still resolves
   `{ profileCellsInserted: 0, rankSnapshotsInserted: 0 }` without throwing.
2. **Typed refusal on changed input.** After inserting a second in-window observation, re-deriving at
   the same `as_of`/version rejects with `code: "EVALUATOR_PROFILE_DERIVATION_CONFLICT"` — the silent
   `0/0` that round 1 produced is gone.
3. **The refusal is atomic.** Every persisted row (values, n, `derivation_hash`) is byte-identical
   before and after the rejected call, and the row count is unchanged — the surrounding
   `withWriteTransaction` rolls the partial snapshot back.
4. **Recovery works and is correct.** Bumping `derivationVersion` to 2 produces the corrected
   `value 0.75 / n = 2` cell that the changed inputs actually imply.

I also proved the **rank-level** guard is reachable rather than dead code: a brand-new identity in a
new run leaves every pre-existing cell hash untouched (so no cell conflict fires) but displaces
ordinal 1 in the consensus-strength ladder. That re-derivation rejects with
`EVALUATOR_RANK_DERIVATION_CONFLICT`, the prior ordinal-1 holder is still in place, and the new
identity left zero orphan cells behind.

### B4 — bias intervals computed at the wrong range → **FIXED**

`boundedMeanInterval` now scales the Hoeffding radius by `(upperBound - lowerBound)`. Hand check at
a sample size large enough that the bound does not saturate (n=10, leniency 0.8, support `[-1,1]`):

| | radius | interval lower |
|---|---|---|
| hand, range-2 | `2·sqrt(ln40/20)` = 0.85893876 | **−0.0589388** |
| code | — | −0.0589388 (matched to 6 dp) |
| round-1 unit-range bug would have given | 0.42946938 | +0.3705312 (explicitly excluded by my test) |

The lineage-residue metric was additionally re-based to a non-negative `[0,1]` support, so its bounds
and its formula now agree.

---

## 3. Re-verification of the previously-green surface

The rework redefined three of the four bias metrics, so I recomputed all of it by hand.

**Leniency (redefined).** Round 1 used "grade minus panel median on the same item". I checked the
foundation and that formula is structurally vacuous on production data: `apps/runner/src/index.ts:1496`
records **one** reduced judgement per node, attributed to `judged.provenanceRef` — the same artifact
as the node's author — so a per-item panel has exactly one grade and the median is always the grade
itself. The rework replaces it with one independent sample per run: this identity's run mean minus the
mean of the other identities' run means. Hand-checked on a 3-identity / 2-run fixture:

| | R1 mean | R2 mean | hand leniency | code |
|---|---|---|---|---|
| A | .625 | .5 | mean(.25, 0) = **0.125**, n=2 | 0.125, n=2 |
| B | .25 | .5 | mean(−.3125, 0) = **−0.15625**, n=2 | −0.15625, n=2 |
| C | .5 | — | **0.0625**, n=1 | 0.0625, n=1 |

A single-identity run is now recorded as `n=0 / basis NONE` rather than as a fabricated zero — the
right call, and the formula string is written into `derivation_input`.

**Settlement contradiction (redefined).** Now one sample per settlement *event*, linked to the same
exact model identity, with `tau > 0.5` positive and an exact `0.5` mean excluded as neutral.
Hand-verified: identity A (run mean .7) against a false and a true outcome credited to A →
**0.5, n=2**; identity Z (mean .2) against a false outcome → **0, n=1**; identity N (mean exactly .5)
→ **NONE, n=0**. Given that both the tau observation and the settlement observation are keyed to the
authoring model, this linkage is coherent and strictly better attribution than round 1, which charged
every model in a run with a settlement it had no connection to. See §4.1 for the coverage consequence.

**Lineage-favoritism residue (redefined).** Now derived from `NODE_REVIEW` outcomes grouped by the
reviewed node's author lineage, as the mean absolute deviation of each lineage's mean from the mean
of the others. Hand check — reviewer with lineage means `mA=1, mB=0, mC=0.5`:
`|1−.25| = .75`, `|0−.75| = .75`, `|.5−.5| = 0` → **0.5, n=3**. Code: 0.5, n=3. A reviewer touching a
single lineage is `NONE`, not zero.

**Replace, never pool — still holds.** `activeProfileObservations` is untouched and remains the single
choke point. I re-ran the whole round-1 attack set against the new derivations: the replaced row
produces no cell, is cited in no `derivation_input` anywhere, supersession chains resolve to the last
link only, an after-`as_of` replacement correctly leaves the replaced row active, and — the
discriminating probe — the identity-linked contradiction is driven by the replacement's value (1),
not by the replaced 0.95 (which would have given 0).

**Versioned history — still clean.** On live Postgres, every v1 `profile_cell` column and every v1
`rank_snapshot` row is byte-identical after a v2 derivation; zero duplicate
`(model_id, metric, derivation_version)` groups; ranks are per-version independent.

**Degenerate panels — still well-defined.** All-identical grades (deterministic identity tie-break, all
scores 1), single-identity runs, review-only identities, add-on-only identities, and an empty
observation set all produce explicit `NONE`/null cells or empty results. Full sweep across every
fixture: no NaN, `n = consensus + settlement + addon` everywhere, `(basis='NONE') = (value IS NULL)`,
interval null-pairing and `lower <= upper` all hold, and a SQL-side sweep for `value <> value` and the
same invariants over everything I persisted returned zero rows. Typed refusals for invalid derivation
version and invalid `as_of` are unchanged.

**Determinism.** Output is byte-identical under input shuffling on a mixed fixture (taus, settlement,
reviews, strength) — the new `Map`-ordered means are fed from the `at_seq`-sorted active set, so
insertion order is input-order independent, and `stableNumber` absorbs summation-order noise.

**Dark launch.** `selectJudgesByBiasRank` still has zero production callers repo-wide by my own grep
(definition + two unit tests + the architecture test's own string literal). The architecture test now
walks `apps/**` recursively instead of four hard-coded files — my round-1 minor 1, addressed. No
`BOUND` state, no API keys, no `Date.now()` / zero-arg `new Date()` in the rework.

---

## 4. Findings carried forward (none blocking)

1. **Contradiction coverage is now sparse, and that should be visible to V.** Because a sample requires
   a settlement credited to the *same* model identity, only models whose answer actually settled get
   contradiction samples; panel peers who judged in the same run get `NONE`. I verified this directly
   ("a judge with no settlement credited to its own identity is unmeasured"), and the lane accepted it
   by changing its own integration expectations from `{1, 0}` to `{null, null}`. The linkage is
   defensible — it is honest non-attribution rather than the round-1 over-attribution — but it means
   one of FR-5.1's three mandated bias measures will be empty for most judges and will therefore
   contribute nothing to the composite rank. The identity-matching rule is *not* in the disclosed
   `formula:` string (the threshold and neutral rules are). Name it for V before bind.
2. **Landing: review-only identities receive `step='JUDGING'` bias cells.** `judgeIdentities` now
   includes `NODE_REVIEW` producers, so a reviewer gets three `JUDGING`-step bias cells whose
   `derivation_input` is entirely `REVIEWING` observations, and it competes in the `JUDGE` composite
   ladder. Keeping the bias family on one step is defensible, but FR-3.5 demands exactly one
   *documented* landing and Architecture §3.5 does not state which step bias cells live on. Document it.
3. **The composite judge rank still treats absence of evidence inconsistently.** An identity with no
   valued bias cell scores 0 (ranked last); an identity whose only valued cell is a trivially-zero
   leniency scores 1 (ranked first) — I reproduced both in the same run on live Postgres (`lad:b` 0.7
   #1 vs `lad:a` 0.0 #2) and in a pure fixture where an unmeasured model outranks one that was
   actually blind-graded at 0.9. Two absence-of-evidence states landing at opposite ends of the ladder
   is a bind-readiness wart for ruling 5's rank-and-select. Carried from round-1 minor 4.
4. **Metric names and `PROFILE_DERIVATION_VERSION` did not move despite materially changed formulas.**
   Leniency, contradiction, and lineage residue were all redefined while keeping `.v1` names and
   `PROFILE_DERIVATION_VERSION = 1`. Harmless today (zero rows exist anywhere — the repository still
   has no composition root), but FR-5.2's discipline argues for bumping before any collection starts.
5. **Recovery from a derivation conflict is undocumented.** Once an `(as_of, derivation_version)` pair
   is derived, any later in-window evidence permanently refuses re-derivation at that pair; the escape
   is a version bump (which I proved yields the corrected value). Correct and loud, but it overloads
   the version axis with "inputs changed" as well as "formula changed" and needs a runbook line.
6. **`itemKey` is now dead weight.** Nothing in the derivation reads it, yet `readObservations` still
   computes it and the rework *added* a `review.node_id` fallback for it.
7. **`insertRankSnapshot`'s conflict lookup uses `LIMIT 1` with no `ORDER BY`** over a predicate that
   can match the ordinal-conflict row or the identity-conflict row. Both differ from the new hash so
   it refuses either way, but which row is reported is nondeterministic.
8. **Architecture §3.5 drift has grown.** Its `rank_snapshot` DDL lacks `metric`; its "minimum metric
   names" list still names `prowess.outcome.v1`, which this lane never emits, and does not mention
   `bias.composite-rank.v1`. Reconcile the doc.
9. **The selector-unbound test covers `apps/**` but not `packages/**`.** The property holds today (my
   own repo-wide grep), but a caller added in `packages/runner` or `packages/critique` would not trip it.

---

## 5. Verdict

**PASS.** All four blockers from round 1 are fixed, and I verified each one independently rather than
taking the lane's tests as evidence: per-metric ladders with a persisted `metric` discriminator and a
constraint surface that actually permits them; consensus evidence back at full weight leading its own
ladder with n=2; a hash-aware upsert that refuses changed same-version inputs atomically, recovers
correctly under a version bump, and does not false-positive on an idempotent re-run; and range-correct
Hoeffding intervals matching my hand arithmetic to six decimal places.

The rework also went beyond the blockers and repaired a defect neither review had named — the round-1
leniency formula was structurally vacuous against the production runner's one-reduced-judgement-per-node
shape — and the new integration suite now builds its fixtures through the real harvest repository
rather than hand-inserted observations, which is the right standard for this lane. Everything that was
green in round 1 is still green under the redefined metrics: replace-not-pool survived the full attack
set, versioned history is byte-stable, degenerate panels stay well-defined with no NaN, determinism
holds, and the selector remains provably unbound.

The nine carried findings are documentation, disclosure, and bind-readiness items. None of them
changes a persisted number, and none should hold the merge.
