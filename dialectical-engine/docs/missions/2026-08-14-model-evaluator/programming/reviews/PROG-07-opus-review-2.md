# PROG-07 — Opus reviewer A, round 2

- Lane: `codex/eval-07-profiles`
- Commit reviewed: `6a05f47` (`fix(evaluator): correct profile derivation semantics`), on top of `a2b1f4e`
- Rework diff: `a2b1f4e...6a05f47` — 7 files, +513/-150, including new `migrations/0027_evaluator_rank_metric.sql`
- Round-1 review: `PROG-07-opus-review-1.md` (REWORK, 5 blockers, 8 non-blocking)
- Verdict: **REWORK** — 1 blocker, and it is a deleted test, not a defect

## Headline

**All five round-1 blockers are genuinely fixed.** I re-derived every corrected
metric by hand and, separately, drove the derivation directly with my own probe
fixtures; every number the lane asserts matches my independent computation, and
each corrected fixture would fail against the round-1 code. The new
`tests/integration/evaluator-profiles-rework.test.ts` builds its data through the
**real write paths** — `core.node` + `ledger.reduced_judgement` sharing one
artifact (the production runner shape), `ledger.node_review`,
`scorecard.answer_outcome` — and then runs the actual
`EvaluatorHarvestRepository.harvestTerminalRun` before deriving. That is the
correction I asked for in round 1, and it is the right one.

The single blocker is that the rework **deleted the lane's only judge-rank-change
assertions** without replacing them, so a merge-gate item (`rank-change tests`)
and FR-5.1 AC2 are now unasserted. The behaviour itself is correct — I proved it
with my own probe. This is one test to restore, no code change.

---

## Verification I ran

| Check | Result |
|---|---|
| `pnpm run typecheck` | clean |
| `npx vitest run` (full repository) | **693 passed / 693, 96 files, exit 0** (was 690/95) |
| `pnpm run lint` (`audit:architecture` + `audit:source`) | 27 edge rows, **0 violations**; **0 source blockers** |
| repo-wide `grep -rn "selectJudgesByBiasRank" --include="*.ts"` | 1 definition + 3 test hits, **0 production call sites** |
| `grep -inE "\bBOUND\b\|sk-\|api[_-]?key\|secret"` over the rework diff | no hits — no `BOUND` state, DR-179 clean |
| `git status --porcelain` | clean; no push, no board mutation |
| migration discovery (`packages/db/src/index.ts:125`) | `readdir` + `sort` over `/^\d+.*\.sql$/`, so `0027` is picked up with no registry edit |
| Independent probe of `deriveEvaluatorProfiles` (my own fixtures, `tsx`) | see BF-1 below |

---

## Blocker-by-blocker

### BF-1 — leniency fabricated zero → **FIXED**, verified two ways

The metric was redesigned to one independent sample **per run**: this identity's
run mean minus the mean of the *other* identities' run means, with no sample at
all when the run holds only this identity. The `itemKey !== null` filter is gone.
The formula is disclosed in the cell's own `derivation_input`
(`formula:bias.leniency.v1=identity-run-mean-minus-other-identities-run-mean`).

Hand-computed against the lane's harvest-driven fixture: `judge:a` grades 0.8 and
0.6 (mean 0.7); the other identities in that run are `judge:b` (0.2) and
`judge:boundary` (0.5), mean of means 0.35; sample = **0.35, n = 1**. That is
exactly what the test asserts and what the database holds.

I then drove the exported function myself with fixtures the lane does not have:

| My fixture | Result | Reading |
|---|---|---|
| one identity, one run | `value=null, n=0, basis=NONE` | **no fabricated zero** |
| one identity, **five** runs | `value=null, n=0, basis=NONE` | still refuses; n never inflates on uncomparable runs |
| two identities, 0.9 vs 0.1, 3 runs | `+0.8 / −0.8, n=3, MEASURED_PROCESS` | **varies, signed, when judges genuinely differ** |
| two identities, 0.5 vs 0.5, 3 runs | `0, n=3, MEASURED_PROCESS` | honest zero — a real measurement of "no differential leniency", and structurally distinguishable from the `null/NONE` above |

The lane's own `judge:solo` case asserts `value: null, n: 0` from a real harvested
single-identity run. The round-1 failure — a confident zero with growing n — is
gone, and the two states ("measured zero" and "not measurable") are now distinct
in `value`, `n` and `basis`.

*Residual, non-blocking:* the comparison is now run-level, not item-level, so it
departs from FR-5.1's literal "on the same items". Since each identity judges its
own nodes, the difference conflates leniency with item difficulty. Given the
runner emits one reduced judgement per node this is the only comparison the data
supports, the code comment explains exactly that, and the formula string is
persisted on every cell — so the deviation is disclosed rather than hidden. Worth
one line in the bind-readiness notes so a future consumer does not read it as an
item-matched measure.

### BF-2 — lineage favoritism structurally empty → **FIXED**, real join now exercised

The residue is now computed from `NODE_REVIEW` observations grouped by the
reviewed author's maker, which is the population that is guaranteed cross-maker
by migration 0019. The reader gained the joins that make this resolvable:
`ledger.node_review` on `source_ref`, then
`review_author_artifact ON raw_artifact_id = review.author_raw_artifact_ref`.
`judgeIdentities` now also admits `NODE_REVIEW`, so reviewers get bias cells.

Critically, harvest writes `{source, node_review_id, author_raw_artifact_ref}`
into `provenance_json` and **no** `author_maker` key — so
`COALESCE(provenance_json->>'author_maker', review_author_artifact.maker, …)`
falls through to the new join. The rework fixture inserts real `ledger.node_review`
rows and harvests them, so the production resolution path is exercised for the
first time. That closes the round-1 complaint that the COALESCE fallbacks were
covered by nothing.

Hand-computed: reviewer `reviewer:r` agrees with a `maker:a` author (1) and
disputes a `maker:b` author (0); lineage means `[1, 0]`; samples
`|1 − 0| = 1` and `|0 − 1| = 1`; cell = **1.0, n = 2** — matches the assertion and
the database.

*Residual, non-blocking:* with k lineages the k samples are deterministic
functions of k means, so at k = 2 the cell reports n = 2 from a single degree of
freedom and the Hoeffding interval is correspondingly √2 too tight. It is a
monitor (FR-5.1 AC4 asks only that it be recorded), and the bound is now
range-correct, so this is a sharpening note rather than a defect.

### BF-3 — mixed-metric prowess ladder → **FIXED**, with schema support

`prowessRankGroups` keys on `[domainId, step, metric]`; the `metricPriority`
collapse is deleted, so each identity is ranked inside every metric ladder it has
a cell in. `metric` is now on `EvaluatorDerivedRank`, persisted, and carried by
`migrations/0027`, which adds the column and rewrites both uniqueness constraints
to include it. Judge ranks are labelled `bias.composite-rank.v1`, so a mixed
composite is disclosed rather than implied.

Migration review: `ADD COLUMN IF NOT EXISTS … DEFAULT 'legacy.mixed.v0'` then
`DROP DEFAULT` (honest marker for any pre-existing row); the `DO` block drops
only unique constraints whose definition mentions `rank_kind`, which correctly
spares `rank_snapshot_at_seq_key`; every `ADD CONSTRAINT` is preceded by a
`DROP … IF EXISTS`, so the migration is replay-safe. Grants in 0023 are
table-level (`GRANT INSERT ON evaluator.rank_snapshot`), so no grant edit is
needed; `reject_mutation` is row-level and unaffected by the DDL. `schema.ts`
carries the new column and the architecture parity suites are green.

The test discriminates the old behaviour: `model:a` has both a settlement cell
and a consensus cell, and is asserted at **ordinal 1 of the consensus-strength
ladder** with `model:b` at ordinal 2. Under the round-1 `metricPriority` code
`model:a` would have been pulled out of the consensus ladder entirely, leaving
`model:b` at ordinal 1. This is also the concrete sense in which consensus is
back at full weight (ruling 4 / FR-3.2): consensus evidence is no longer
discarded from ranking whenever a settlement exists for the same identity.

### BF-4 — interval understated 2× → **FIXED**, and the test proves it

`boundedMeanInterval` now computes
`radius = (upperBound − lowerBound) * sqrt(ln 40 / (2n))`, with a comment naming
the two-sided Hoeffding interval at α = 0.05 and why the range multiplier matters
for `[-1, 1]` supports. Lineage moved to `[0, 1]` bounds, matching its now-absolute
values.

I recomputed the lane's interval fixture independently: 10 harvested runs,
`interval:a` at 0.8 against `interval:b` at 0.2 gives value 0.6, n = 10;
range-2 radius = `2·sqrt(ln 40 / 20)` = **0.8589388**; lower = **−0.2589388**,
upper clamped to 1. The test asserts exactly that lower bound to 10 decimal
places. Under the round-1 code the radius would have been 0.4294694 and the lower
bound 0.1705 — the assertion fails. So the fixture genuinely discriminates the
fix, and n = 10 is large enough that the clamp does not hide the lower side.

### BF-5 — contradiction denominator → **FIXED**, hand-verified on three cases

The denominator is now **one sample per settlement event**, matched to the same
run *and the same exact model identity*, using that identity's mean tau in the
run. `latestSettlementByRun` is gone, so no settlement is silently dropped. A
mean tau of exactly 0.5 is treated as neutral and **excluded**, removing the
round-1 asymmetry, and the rule is persisted in `derivation_input`
(`threshold:tau>0.5;neutral:tau=0.5`). The inherited `itemKey` filter is gone.

Hand-computed against the fixture, which deliberately puts **four** settled
answers in one run:

- `judge:a` (mean tau 0.7) vs settlement `false` → contradiction 1; vs settlement
  `true` → 0 ⇒ **value 0.5, n = 2** — two settlement events, two samples. Under
  the round-1 code only the latest settlement survived and n came from judgement
  count instead.
- `judge:b` (mean tau 0.2) vs settlement `true` ⇒ **value 1, n = 1**.
- `judge:boundary` (mean tau exactly 0.5) ⇒ **value null, n = 0** — neutral,
  excluded, not scored as a contradiction.

All three match my own arithmetic and the persisted rows.

### Round-1 non-blocking items also addressed

- **S-3 fixed.** `evaluator-selector-unbound.test.ts` now walks `apps/`
  recursively over `.ts/.tsx/.js/.mjs/.cjs` instead of a hand-listed four files.
  (`packages/` is still outside its walk — see N-2.)
- **Bonus, unrequested and welcome.** `insertProfileCell` and `insertRankSnapshot`
  are now hash-aware: on a natural-key conflict they compare `derivation_hash` /
  `source_hash` and raise typed `EVALUATOR_PROFILE_DERIVATION_CONFLICT` /
  `EVALUATOR_RANK_DERIVATION_CONFLICT` when the inputs changed, instead of
  silently retaining a stale cell. `source_hash` now covers identity, metric,
  ordinal, score, n and interval rather than just cell ids and ordinal. FR-5.2's
  "do not silently corrupt history" is materially stronger than in round 1, and
  the refusal is proven by a live-Postgres test that harvests extra data and
  re-derives the same version.

---

## Blocking finding

### BF-6 — the judge-rank-change coverage was deleted, not replaced

The rework removed both assertions that tied bias data to judge rank order:

1. `tests/unit/evaluator-profiles.test.ts` — the whole test
   *"derives bias before judge-dependent prowess and changes judge rank from live
   inputs"* was deleted (−54 lines). It carried
   `expect(result.judgeRanks.map(r => r.modelId)).toEqual(["judge:b", "judge:a"])`
   and the only assertion of the `bias-rank:` receipt in prowess
   `derivationInput`.
2. `tests/integration/evaluator-profiles-database.test.ts` — the test was renamed
   from *"records real rank changes"* to *"keeps versioned cells and ranks
   append-only"*, and the three-row leader assertion
   (`judge:a` at `FIRST_AS_OF`, `judge:b` at `SECOND_AS_OF` under both versions)
   was replaced by `expect(versionedRanks.rows).toHaveLength(9)` plus a set of
   derivation versions.

What survives is `firstLeader === "judge:a"` at `FIRST_AS_OF` — and that one is
**degenerate**. At `FIRST_AS_OF` all three judges grade 0.5 in a single run, so
every leniency sample is 0, every score ties at 1, and ordinal 1 is decided by
the identity tiebreak. I confirmed this shape directly with my probe (all-agree
fixture → scores `a=1, b=1, c=1`, order by identity). It asserts the tiebreak,
not that bias moves rank.

So the lane no longer has any test for **FR-5.1 AC2** — "rank order of judges
changes when synthetic high-leniency or high-contradiction data is injected …
without changing panel weight-multiplier configuration" — nor for the goal
packet's merge-gate item *"derivation-version and **rank-change** tests"*. Round 1
satisfied that gate; round 2 does not. (PROWESS rank *ordering* is well covered
from live data by the new rework test; it is the JUDGE-rank response to bias that
is now unasserted, which is the half ruling 5 is actually about.)

The code is correct. My probe injected leniency into an all-agreeing panel and
the ladder reordered as it should:

| Fixture | Judge ranks |
|---|---|
| three judges all at 0.5 over 2 runs | `1:a(1) 2:b(1) 3:c(1)` — tie, identity order |
| same, plus one run where `a` grades 0.95 against 0.1 / 0.1 | `1:b(0.858) 2:c(0.858) 3:a(0.717)` — **`a` falls from 1st to 3rd** |

**Required.** Restore an assertion of that flip — ideally on live Postgres in the
rework file, where the fixtures already go through harvest, so the gate item is
proven end to end. While there, restore an assertion of the `bias-rank:` receipt
in prowess `derivation_input`; it still exists at
`packages/evaluator/src/index.ts:2559` but is now referenced by no test at all,
which is how it would rot away unnoticed.

---

## Non-blocking

- **N-1 — round-1 S-1 unchanged.** `score = max(0, 1 − mean(penalties))` still
  averages a variable-length penalty vector, so a judge with no add-on grade omits
  the `1 − addonQuality` term and outranks an identically-biased judge that has
  one; `bias.addon_grade_quality.v1` is still the only bias cell suppressed
  entirely when empty, so no zero-n cell discloses the absence (FR-4.2 AC). And a
  judge with no bias evidence at all still scores 0 and ranks last, so missing
  evidence moves rank in both directions depending on which metric is missing.
- **N-2 — round-1 S-2 unchanged, and now untested.** `biasContext` is still
  attached only for `JUDGING`/`REVIEWING` and still cites the profiled model's own
  ordinal; `AUTHORING` prowess — the cell actually built from judge-produced node
  strengths, which is handoff 3's scenario — still carries no bias linkage. The
  selector guard also still walks only `apps/`, not `packages/`.
- **N-3 — round-1 S-4 and S-6 unchanged.** No `readEvaluatorProfileStrategy`
  register reader (the `strategy_*` receipt remains caller-supplied and validated
  only for shape), and no `AGGREGATE` `pipeline_event` receipt
  (`migrations/0023:89` defines the member) or `shadow_decision` row for selector
  runs.
- **N-4 — vacuous assertions remain, and one was newly introduced.**
  `expect.any(Number)` on `profileCellsInserted`/`rankSnapshotsInserted` and the
  `phaseOrder` literal-vs-itself comparison both survive from round 1;
  `expect(versionedRanks.rows).toHaveLength(9)` is new and replaced a real
  assertion (BF-6).
- **N-5 — stale fixture semantics.** In `evaluator-profiles-database.test.ts` the
  judges are `provider:judges` while the settlement is `provider:author`, so the
  new identity gate makes both contradiction cells `null`. The assertion is
  honest, but the test's `judge:at-boundary` / `judge:below-boundary` naming and
  its "contradiction boundary" framing now describe coverage that lives in the
  rework file instead. Rename or drop, so it does not read as boundary coverage.
- **N-6 — nondeterministic conflict lookup.** The rank-conflict `SELECT` uses
  `(ordinal=$7 OR (provider=$8 AND model_id=$9 AND model_version=$10))` with
  `LIMIT 1` and no `ORDER BY`, so when the ordinal conflict and the identity
  conflict are different rows the inspected row — and hence the error message —
  is arbitrary. A false pass would require a `source_hash` collision, so this is
  a clarity issue rather than a correctness one, but an `ORDER BY` would settle it.
- **N-7 — dead carried fields.** `itemKey` and `subjectMaker` are still selected
  in SQL and carried on `EvaluatorProfileObservation`, but after the rework no
  derivation reads either. Drop them or note why they are retained.

## Axis summary (round 2)

| Axis | Result |
|---|---|
| 1. Deliverables — bias/prowess cells, counts, intervals, ranks, versioned, deterministic, no LLM | **PASS.** All three mandated bias measures now produce real, varying values on the shape harvest actually emits |
| 2. REPLACE-not-pool, mixed consensus+settlement fixtures | **PASS** (unchanged and still strong; consensus additionally restored to full weight in ranking) |
| 3. Bias-first ordering | **PASS** mechanically; receipt still partial and now untested (N-2, BF-6) |
| 4. Selector provably UNBOUND | **PASS.** Zero call sites by my own grep; test now walks the `apps/` tree |
| 5. Mathematical honesty — leniency, intervals, contradiction denominator | **PASS.** All four round-1 math findings corrected and independently re-derived |
| 6. FR-0.6 AC5 + differentials, no BOUND, DR-179, tests + typecheck, vacuous assertions, clocks | **PASS** on 693/693, typecheck, lint, no BOUND, no keys, clocks pinned; **one gate regression** (BF-6) and residual vacuous assertions (N-4) |

## Recommendation

REWORK, narrowly. Five of six axes are clean and the five round-1 blockers are
closed to my own independent arithmetic — this is a substantively good rework,
and the move to harvest-driven fixtures is exactly right. The one thing standing
between it and a PASS is a test the rework deleted: restore a judge-rank-change
assertion (and the `bias-rank:` receipt assertion) so the named merge-gate item
and FR-5.1 AC2 are proven again. No production code needs to change for that —
I verified the underlying behaviour is already correct.
