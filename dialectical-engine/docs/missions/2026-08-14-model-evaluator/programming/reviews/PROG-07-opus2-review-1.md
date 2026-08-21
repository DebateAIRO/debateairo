# PROG-07 peer review 1 — opus2 seat (second independent reviewer, substituting Grok)

- **Lane:** `codex/eval-07-profiles` @ `a2b1f4e` ("feat(evaluator): derive versioned profiles and ranks")
- **Worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-07-profiles`
- **Reviewer:** opus2 (independent; no other PROG-07 review file read)
- **Date:** 2026-08-15
- **Verdict: REWORK**

Diff surface: `packages/evaluator/src/index.ts` (+654), `tests/unit/evaluator-profiles.test.ts` (new),
`tests/integration/evaluator-profiles-database.test.ts` (new),
`tests/architecture/evaluator-selector-unbound.test.ts` (new). No non-evaluator behavior touched.

---

## 1. What I ran (all first-hand, nothing taken on report)

| Check | Result |
|---|---|
| `pnpm run typecheck` (`tsc --noEmit`, whole repo) | exit 0 |
| Full repository suite `npx vitest run` | **95 files / 690 tests passed**, exit 0 |
| Focused evaluator + differential suites (FR-0.6 AC5 in `evaluator-database.test.ts`; lane-04 tagger; lane-05 harvest + harvest-rework; lane-06 add-on; lane-07 profiles) | 11 files / 85 tests passed |
| My own adversarial pure-derivation fixtures (22 assertions, hand-computed) | passed — findings below |
| My own adversarial live-Postgres fixtures (4 scenarios, embedded-postgres per DR-121) | passed — findings below |
| Repo-wide grep for selector call sites | zero production callers |
| `BOUND` / API-key / unpinned-clock hunt over the diff | clean |
| Working tree after my run | clean (`git status` empty; scratch tests were written under gitignored `coverage/` and removed) |

My scratch suites were deliberately built from scratch (my own arithmetic, my own fixtures), not
adapted from the lane's tests.

---

## 2. Hand-computed cell-by-cell verification

### 2.1 Pure derivation — 3-judge panel, 2 items, one settled run

Fixture: judges `J1/J2/J3` (provider `p`, version `v1`), run `R1`, items `I1`/`I2`;
one `EXTERNAL_ANSWER_OUTCOME` for `R1` with value `0` (answer resolved false).

| Item | J1 | J2 | J3 | panel median (by hand) |
|---|---|---|---|---|
| I1 | 0.90 | 0.50 | 0.10 | 0.50 |
| I2 | 0.80 | 0.60 | 0.40 | 0.60 |

Hand values vs. what the code produced — **every cell matched exactly**:

| Cell | Hand | Code |
|---|---|---|
| `bias.leniency.v1` J1 | mean(+0.40, +0.20) = **0.3**, n=2 | 0.3, n=2 |
| `bias.leniency.v1` J2 | 0, n=2 | 0, n=2 |
| `bias.leniency.v1` J3 | mean(−0.40, −0.20) = **−0.3**, n=2 | −0.3, n=2 |
| `bias.settlement_contradiction.v1` J1/J2/J3 | **1 / 1 / 0**, n=2 each | 1 / 1 / 0 |
| `prowess.judging-tau.v1` J1/J2/J3 | **0.85 / 0.55 / 0.25**, n=2 | identical |
| judge ranks (penalty mean → 1−p) | J3 **0.85** > J2 **0.5** > J1 **0.35** | identical ordinals 1/2/3 |

Also verified: output is byte-identical under input shuffling (`JSON.stringify` equality after
reversing the observation array), so the derivation is genuinely order-independent.

### 2.2 Live Postgres — production-shaped rows through the real join path

This is the case the lane's own integration test does **not** exercise. Lane-05 harvest writes
`REDUCED_JUDGEMENT` observations whose `provenance_json` is `{source, reduced_judgement_id}` — it
carries **no** `item_key`, `subject_maker`, or `author_maker`. The lane's `insertJudgement` helper
always supplies all three, so the branch never proves that
`PostgresEvaluatorProfileRepository.readObservations` can recover them from the
`ledger.reduced_judgement` → `core.node` → `ledger.raw_artifact` joins.

I built real `raw_artifact` / `core.node` / `ledger.reduced_judgement` rows plus harvest-shaped
observations (empty provenance hints) and re-derived on live embedded PostgreSQL:

| Item | node author maker | JA (maker:A) | JB (maker:B) | median |
|---|---|---|---|---|
| N1 | maker:A | 0.75 | 0.25 | 0.500 |
| N2 | maker:B | 0.50 | 0.25 | 0.375 |

| Persisted cell | Hand | DB |
|---|---|---|
| `bias.leniency.v1` JA / JB | **+0.1875 / −0.1875**, n=2, consensus_count=2 | identical |
| `bias.lineage_favoritism_residue.v1` JA | same(0.75) − other(0.50) = **0.25**, n=1 | 0.25 |
| `bias.lineage_favoritism_residue.v1` JB | other(0.25) − same(0.25) = **0**, n=1 | 0 |
| `prowess.judging-tau.v1` JA / JB | **0.625 / 0.25**, n=2 | identical |
| `bias.settlement_contradiction.v1` (no settlement in run) | explicit NONE, value NULL, n=0 | identical |
| `rank_snapshot` JUDGE | JB **0.90625** #1, JA **0.78125** #2 | identical |

The join fallback works, and the lineage direction is right (the query's `subject_maker` is in fact
the *judge's* own artifact maker and `author_maker` is the judged node's author — the names are
inverted relative to their meaning, but the comparison `subject === author` is the correct
same-lineage predicate). No NaN reached the database (`value <> value` sweep = 0 rows).

---

## 3. Blockers

### B1 — the prowess rank series mixes metrics with different value semantics (mandatory handoff 2)

`deriveEvaluatorProfiles` correctly keeps `prowess.consensus-strength.v1`,
`prowess.settlement-outcome.v1`, `prowess.judging-tau.v1`, `prowess.blind-judge-grade.v1` and
`prowess.review-outcome.v1` in **separate cells**. It then throws that separation away at rank time:
`prowessRankGroups` is keyed by `(domainId, step)` only, `metricPriority` picks one cell per identity,
and the identities are then sorted against each other by raw `cell.value` — across different metrics.

Proven (pure fixture, one `(null, AUTHORING)` group):

```
B: prowess.consensus-strength.v1  = 0.9  -> ordinal 1
A: prowess.settlement-outcome.v1  = 0.4  -> ordinal 2
```

and in a `(null, JUDGING)` group:

```
J1: prowess.judging-tau.v1         = 0.95 -> ordinal 1   (a probability J1 emitted)
J2: prowess.blind-judge-grade.v1   = 0.20 -> ordinal 2   (a quality grade another model gave J2)
```

The second case is the sharpest: a judge that was actually graded badly by the blind add-on pass is
ranked *below* a judge that was never graded at all and merely emitted confident taus. That is a
direct inversion of what FR-4.2/FR-5.1 want the add-on pass to buy.

Worse, `evaluator.rank_snapshot` has **no metric column**, so the persisted artifact cannot disclose
which semantics each `score` carries; only `source_profile_cell_ids` hints at it. Any downstream
reader (lane 09 consumer, lane 10 seat-share, lane 11 dev menu) sees one ordinal ladder of
incommensurable numbers.

This is exactly what board handoff 2 forbids ("consensus strength and settlement outcome share
metric names with different value semantics — never mix them in one aggregate") and what
Architecture §5.4 step 2 implies by deriving prowess "per exact model identity, nullable domain, and
step".

**Fix direction:** either rank per `(domain, step, metric)` (add `metric` to `rank_snapshot`'s key), or
define and document a single composite prowess metric with an explicit, ruled combination rule.
A silent priority ladder over incompatible scales is not either.

### B2 — automatic consensus discount at the rank layer (ruling 4 / FR-3.2 AC1)

`metricPriority` hard-codes `settlement-outcome > blind-judge-grade > review-outcome >
consensus-strength > judging-tau`. Once an identity has *any* settlement cell, its consensus
evidence is dropped from the rank entirely — not down-weighted, weight zero.

Proven (pure fixture): identity `A` with **two** unsettled `NODE_STRENGTH` samples at 0.99 (runs RC,
RD) and **one** settlement sample at 0.4 (run RA) ranks below identity `B` at 0.5, on
`score = 0.4, n = 1`. The two 0.99 consensus observations — from *different, never-settled runs* —
contribute nothing.

FR-3.2 AC1: "Unsettled consensus-derived observation rows are not down-weighted relative to settled
rows **solely for being consensus** (no automatic 'consensus discount')." Architecture §5.2: "A
consensus-derived row and a settlement-derived row both enter aggregation with weight 1. There is no
hidden consensus discount." The priority ladder is a hidden consensus discount.

Note this is distinct from replace-not-pool, which the lane implements correctly (§4 below): here the
consensus rows were never superseded by anything.

**Fix direction:** rank must not silently prefer one truth basis over another; if a settled/unsettled
distinction is wanted at rank time it needs an explicit V ruling, not an unlabeled constant in
`metricPriority`.

### B3 — a materially different re-derivation is silently discarded (live-Postgres proof)

`insertProfileCell` / `insertRankSnapshot` use `ON CONFLICT DO NOTHING`. The natural key is
`(provider, model_id, model_version, domain_id, step, metric, as_of, derivation_version)` — it does
**not** include `derivation_hash`. So a re-derivation at the same `as_of`/`derivation_version` over a
*different* input set is dropped with no signal.

Live Postgres, my DB4 scenario:

1. one judgement (tau 0.5) → derive at `as_of` v1 → persisted `prowess.judging-tau.v1` = **0.5, n=1**;
2. insert a second judgement (tau 1.0) with `observed_at` **inside** the same as-of window;
3. re-derive at the same `as_of` / same `derivation_version`.

Result logged from the run:

```
[OPUS2 DB4] re-derive result 0 cell value/n now 0.5 1 derivation_hash changed: false
```

The correct value is 0.75 / n=2. `deriveAndPersist` returned `profileCellsInserted: 0`, the stale row
survives, and its `derivation_hash` still advertises the *old* input set as authoritative. There is no
way for a caller or auditor to distinguish "identical idempotent re-run" from "different result thrown
away". This is reachable in production: lane-05 emits settlement observations back-dated to
`max(snapshot.observedAt, prior.observedAt)`, so late-settling answers routinely land with an
`observed_at` behind an already-derived `as_of`.

The lane's own integration test bakes this in as intended behaviour
(`resolves.toMatchObject({ profileCellsInserted: 0, rankSnapshotsInserted: 0 })`), so it will not be
caught by the existing suite.

**Fix direction:** on conflict, compare the stored `derivation_hash`; equal → idempotent no-op, unequal
→ typed refusal (e.g. `EVALUATOR_PROFILE_DERIVATION_CONFLICT`) naming the key. The merge gate's
"history is never corrupted by metric changes" is only half-satisfied while a same-version
re-derivation can silently disagree with what is stored.

### B4 — bias intervals are computed with the wrong range (FR-5.1 AC3)

`boundedMeanInterval` uses `radius = sqrt(log(40) / (2n))`, which is the Hoeffding radius for a
metric bounded in a range of width **1**. It is applied unchanged to `bias.leniency.v1` and
`bias.lineage_favoritism_residue.v1`, whose `intervalBounds` are `[-1, 1]` — width **2**. The correct
radius for those is `2 * sqrt(log(40) / (2n))`.

Proven: leniency J1, value 0.3, n=2 → code emits `[-0.6603228, 1]`. The honest range-2 bound is
`0.3 ± 1.9206456` → `[-1, 1]`. The published interval is roughly half the width it should be, i.e. it
overstates confidence in exactly the bias numbers that feed the judge rank and, once bound, judge
selection. Prowess cells (`intervalBounds [0, 1]`) are unaffected.

**Fix direction:** scale the radius by `(upperBound - lowerBound)`, and pin a test that a leniency
interval at small n saturates to `[-1, 1]` rather than to a narrower band.

---

## 4. What I tried to break and could not (these are solid)

**Replace, never pool (handoff 1).** `activeProfileObservations` is a single choke point: everything
downstream (`judgements`, `itemGrades`, `latestSettlementByRun`, `judgeIdentities`, add-on rows,
`prowessGroups`, every count) reads only from `active`. I attacked it from every angle I could
construct:

- superseded consensus row + settlement replacement → no `prowess.consensus-strength.v1` cell;
  `consensusCount` on the settlement cell is 0; the superseded observation id appears in **zero**
  `derivationInput` entries anywhere (pure), and on live Postgres a
  `derivation_input::text LIKE '%<id>%'` sweep over the whole `profile_cell` table returned 0 rows;
- I checked the *derived* metric too: a judge in the same run computes its contradiction against the
  replacement's value (0), not the replaced 0.95 — had the superseded row survived, the judge's
  contradiction would have flipped from 1 to 0, so the test discriminates;
- supersession chain a←b←c → only `c` survives, `b` is not resurrected;
- replacement dated after `as_of` → the replaced row correctly stays active for that snapshot;
- the replaced observation row itself is still readable in `evaluator.observation` (audit history intact).

**Versioned re-derivation / rank stability.** After deriving v1 and then v2 at the same `as_of` on live
Postgres, every v1 `profile_cell` row (values, intervals, counts, `derivation_hash`, `derivation_input`)
and every v1 `rank_snapshot` row (ordinal, score, `source_hash`) is byte-identical to before; there are
zero duplicate `(model_id, metric, derivation_version)` groups; a repeat v1 derivation returns `0/0`;
both versions coexist. Rank *changes* are real, not asserted into existence: injecting high-leniency
data moved the leader, and my own independent hand-computation reproduced the new ordinals.

**Degenerate panels — no NaN, no divide-by-zero.** Single judge on a single item → leniency exactly 0,
n=1, interval clamped `[-1, 1]`. All-identical grades → all leniency 0, all scores 1, deterministic
tie-break by identity key. Judge with only an add-on grade → leniency/contradiction/lineage cells are
explicit `basis: NONE`, `value: null`, `n: 0`, `interval: null`, and the add-on quality cell is present.
Empty observation set → empty result, no throw. I swept every persisted numeric on every fixture:
all `null` or finite; `n === consensusCount + settlementCount + addonCount` holds everywhere;
`(basis === 'NONE') === (value === null)` holds; interval null-pairing and `lower <= upper` hold. The
DB CHECK constraints on `evaluator.profile_cell` accepted every row, which independently confirms
the invariants.

**Typed refusals.** `derivationVersion` of 0 / −1 / 1.5 / NaN → `EVALUATOR_PROFILE_DERIVATION_VERSION_INVALID`;
invalid `asOf` → `EVALUATOR_PROFILE_TIME_INVALID`; negative/non-integer `seatCount` →
`EVALUATOR_JUDGE_SEAT_COUNT_INVALID`; ordinal 0 → `EVALUATOR_JUDGE_RANK_INVALID`; candidate that
produced its own numeric inputs → `SELF_ROUTING_FORBIDDEN` (`TypedDomainError`).

**Selector stays UNBOUND.** My own repo-wide grep (`--include=*.ts --include=*.tsx`, excluding
`node_modules`): `selectJudgesByBiasRank` appears only at its definition
(`packages/evaluator/src/index.ts:2594`), in `tests/unit/evaluator-profiles.test.ts`, and inside the
architecture test's own string literal. `PostgresEvaluatorProfileRepository` and
`deriveEvaluatorProfiles` likewise have zero production callers. No `BOUND` state anywhere in the
diff; no `shadow_decision` writes; no API keys, bearer tokens, or authorization headers (DR-179 clean).

**Clocks pinned.** No `Date.now()` and no `new Date()` (zero-arg) anywhere in the added region;
`asOf` is injected by the caller and defensively copied (`new Date(input.asOf)`) into every cell and
rank. Both new test files pin every timestamp as a literal.

**FR-0.7 identity granularity.** `profileIdentityKey` is `[provider, modelId, modelVersion]`; two
candidates differing only in `model_version` are distinct profile keys and are ranked separately.

---

## 5. Minor findings (not blocking, but name them in the rework)

1. **The unbound-selector test is much weaker than the merge gate implies.** It `readFileSync`s four
   hard-coded entrypoints (`apps/{api,runner,scheduler,evaluator-worker}/src/index.ts`) and greps for
   `selectJudgesByBiasRank(`. A caller added in `apps/api/src/routes/*`, `packages/runner/*`, or any
   non-`index.ts` file passes. The property holds today (I verified repo-wide by hand), but the test
   does not prove it. Walk `apps/**` and `packages/**` excluding `tests/**` instead.
2. **`prowess.outcome.v1` is never emitted.** Architecture §3.5 lists it under "Minimum metric names".
   The lane substitutes five source-kind-specific names — which is the right call (a single
   `prowess.outcome.v1` cell is precisely the handoff-2 mixing hazard), but it is an undocumented
   deviation from a binding doc. Reconcile §3.5 rather than leaving the drift silent.
3. **No composition root.** `apps/evaluator-worker` wires the tagger, harvest, add-on, catalog and
   metering repositories but not `PostgresEvaluatorProfileRepository`. The tier-5 merge gate does not
   require it, but §6.1 names "aggregate" as a collect-only job and lanes 09/10/11 depend on
   aggregates existing. Carry this as an explicit handoff so it is not lost between lanes.
4. **Rank score conflates "unbiased" with "unmeasured".** A judge with no valued bias cells gets
   `score = 0` and ranks last — indistinguishable from a maximally biased judge. An explicit
   insufficient-evidence state (or exclusion from the rank) would be more honest and would matter at
   bind time.
5. **Leniency penalty uses `|mean|`, not `mean|·|`.** A judge that is +0.9 on one item and −0.9 on
   another scores as perfectly unbiased. Defensible as a *systematic*-leniency measure, but it should
   be stated, because "repeatedly biased judges rank lower" (ruling 5) reads as covering erratic
   judges too.
6. **Contradiction ignores item identity.** `latestSettlementByRun` keeps only the highest-`at_seq`
   settlement per run and compares every judgement in that run against it. With more than one settled
   answer per run, all but one settlement are silently ignored for this metric, and node-level tau is
   compared against answer-level truth without that being documented.
7. **`insertProfileCell` fallback has an untyped crash path.** `existing.rows[0]!.profile_cell_id`
   assumes the `ON CONFLICT DO NOTHING` fired on the natural key. `ON CONFLICT` without a target
   covers every unique constraint (including `at_seq`), and any other conflict yields an undefined
   read rather than a typed refusal. Practically unreachable given `allocateSequence`, but cheap to
   harden.
8. **Two soft assertions in the lane's own integration test.**
   `toMatchObject({ profileCellsInserted: expect.any(Number), rankSnapshotsInserted: expect.any(Number) })`
   asserts nothing, and the interval check is only `count(*) > 0`. Neither is *self-referential* in the
   dangerous sense (the derivation-version, rank-change, contradiction-boundary and replace-not-pool
   assertions all exercise the real code path on live Postgres), but they are dead weight.
9. **Test coverage gap now closed by me, not by the lane:** the branch never exercises the
   `provenance_json`-empty production join path (§2.2). That test belongs in the lane.

---

## 6. Verdict

**REWORK.** The mechanical spine of this lane is genuinely good: replace-not-pool is enforced at one
choke point and survived every attack I could construct, versioned re-derivation is clean and
append-only, degenerate panels are well-defined, the math is deterministic and order-independent, the
selector is provably unbound, and my independent hand-computations matched the implementation cell for
cell on real embedded PostgreSQL.

The rework is about what happens *after* the cells are correct. The rank layer discards the very
semantic separation the cells establish (B1), applies an unruled consensus discount (B2), and the
persistence layer can silently keep a stale snapshot whose `derivation_hash` no longer describes its
inputs (B3). B4 publishes bias intervals at roughly half their honest width. B1 and B2 contradict a
mandatory board handoff and ruling 4 respectively, and both are cheap to fix before this lane becomes
the input to lanes 09, 10 and 11.
