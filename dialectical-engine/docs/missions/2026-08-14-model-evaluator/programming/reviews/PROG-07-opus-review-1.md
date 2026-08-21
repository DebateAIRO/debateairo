# PROG-07 — Opus reviewer A, round 1

- Lane: `codex/eval-07-profiles` (Codex implementation lane, tier 5, wayfinder ticket 07)
- Commit reviewed: `a2b1f4e` (`feat(evaluator): derive versioned profiles and ranks`)
- Diff base: `dev...codex/eval-07-profiles` — 4 files, +1083/-1
- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-07-profiles`
- Binding docs: Architecture §3.4/§3.5/§5.2/§5.4/§6.2/§6.3/§7 tier-5/§8; Requirements FR-5.1, FR-5.2, FR-4.2, FR-0.1, FR-0.5, FR-0.7; goal packet `PROG-07-codex-profiles.md` (three mandatory handoffs)
- Reviewer scope: read-only outside this file and the agent self-report; no commits, no branch mutation

## Verdict

**REWORK** — five blocking findings, all in the derivation mathematics and the
rank layer. The scaffolding (versioning, persistence, append-only discipline,
replace-not-pool, dark-launch isolation) is genuinely sound and non-vacuously
proven. The **metrics themselves** are not: two of the three mandated bias
measures are structurally inoperative against the data shape the merged harvest
lane actually produces, and one of those two fabricates a confident zero rather
than reporting "not measurable". Neither failure is visible in the test suite
because both fixtures hand-write observation shapes the harvest projector cannot
emit.

---

## What I ran myself

| Check | Result |
|---|---|
| `pnpm run typecheck` (`tsc --noEmit`) | clean, no output |
| `npx vitest run` (full repository) | **690 passed / 690, 95 files, exit 0** |
| `tests/unit/evaluator-profiles.test.ts` | pass |
| `tests/integration/evaluator-profiles-database.test.ts` | pass (embedded-postgres, DR-121 path; Docker is down on this host and testcontainers is deferred) |
| FR-0.6 AC5 differential (`tests/integration/evaluator-database.test.ts`) | pass |
| lane-04 / 05 / 06 differentials (`evaluator-tagger`, `evaluator-harvest`, `evaluator-harvest-rework`, `evaluator-addon`, `evaluator-addon-database`) | pass |
| `tests/architecture/` (all 15 files) | pass |
| repo-wide `grep -rn "selectJudgesByBiasRank" --include="*.ts"` | 4 hits: 1 definition, 3 in tests. **Zero production call sites** — confirmed independently of the lane's own test |
| `grep` for `BOUND` in the diff | only the string `UNBOUND` inside a test name; no `BOUND` state authored |
| `grep -inE "sk-\|api[_-]?key\|bearer \|secret\|token="` over the diff | no hits (DR-179 clean) |
| provider/LLM calls inside the added region (lines 2174–2830) | none — no `ProviderGateway`, `.call(`, `fetch(`. All math is code |
| `git status --porcelain` | clean; no push, no board mutation |

---

## Green — verified, not taken on trust

**REPLACE-not-pool (handoff 1) is genuinely enforced.**
`activeProfileObservations` filters to `observedAt <= asOf`, collects every
`supersedesObservationId` named by an *eligible* successor, and drops the named
rows before any grouping. Every downstream aggregate — leniency, contradiction,
lineage, add-on, all prowess groups, both rank ladders — reads only from that
`active` set, so exclusion is structural rather than per-call-site. Supersession
chains work (A←B←C drops both A and B). Double-replacement is impossible:
`evaluator.observation.supersedes_observation_id` is `UNIQUE` and the 0023
`validate_observation_supersession` trigger admits only
`CONSENSUS/AUTHORING → SETTLEMENT/AUTHORING` on identical identity+domain+metric.
The point-in-time behaviour is correct in both directions — a settlement that
arrives after `asOf` correctly leaves the consensus row live at that `asOf`.

The proof is not vacuous. On live Postgres the test asserts the author's cell set
is **exactly** `[{prowess.settlement-outcome.v1, value 0, n 1}]` — i.e. the
consensus-strength cell does not exist at all, not merely that it is
down-weighted — while both observation rows survive in `evaluator.observation`
(`count = 2`). The unit test additionally asserts `consensus:replaced@1` appears
in no cell's `derivationInput`, which catches pooling that a value assertion
alone could miss.

**Handoff 2 holds at the cell layer.** `metricForProwessObservation` routes
`NODE_STRENGTH → prowess.consensus-strength.v1` and
`EXTERNAL_ANSWER_OUTCOME → prowess.settlement-outcome.v1`, so the shared *input*
metric name `prowess.outcome.v1` (which lane 05 writes for both) can never average
across truth semantics inside one cell. The mixed fixture proves the split.
(It does **not** hold at the rank layer — BF-3.)

**Bias-first ordering (handoff 3, ruling 5) holds mechanically.**
`deriveEvaluatorProfiles` computes `biasCells`, then `judgeRanks`, then builds
`judgeRankByIdentity`, then prowess groups — the map is populated before the
prowess loop can read it. `deriveAndPersist` writes bias cells → judge ranks →
prowess cells → prowess ranks in that order inside one advisory-locked write
transaction. No weight multiplier exists anywhere; consequence is rank-and-select
only, per ruling 5. (The *substance* of "prowess can see the bias rank of the
judges that produced it" is only partly delivered — S-2.)

**Versioning (FR-5.2) is real.** On live Postgres, `derivation_version` 1 and 2
coexist on the same `as_of` (`array_agg DISTINCT → ["1","2"]`), the same inputs
under a different version yield a different `derivation_hash`, and re-running an
already-derived `(as_of, version)` inserts `0` cells and `0` ranks — genuine
idempotence via `ON CONFLICT DO NOTHING` against the architecture's
`UNIQUE NULLS NOT DISTINCT (…, as_of, derivation_version)`. The rank-change test
is honest: `judge:a` leads at `FIRST_AS_OF` and `judge:b` leads at `SECOND_AS_OF`
from injected high-leniency/high-contradiction data, with no configuration change.

**Selector isolation (FR-5.1 AC5, §6.2/§6.3, FR-0.1).** Zero production callers,
confirmed by my own repo-wide grep rather than by the lane's test. The
`SELF_ROUTING_FORBIDDEN` precondition is a `TypedDomainError` thrown before any
ordering work and is tested. Health filter and `excludedMakers` filter apply
before rank, matching §6.3 ("after all existing maker/health guards").

**Identity granularity (FR-0.7).** `profileIdentityKey` is the exact
`(provider, model_id, model_version)` triple throughout; no maker-level collapse,
no nullable-version merge.

**Clocks are pinned.** No `Date.now()` and no bare `new Date()` in the added
region. `asOf` is a required caller input, validated finite in both
`deriveEvaluatorProfiles` and `deriveAndPersist`. Every fixture date is a literal
ISO string. No time bombs.

---

## Blocking findings

### BF-1 — `bias.leniency.v1` is a fabricated zero on the real data shape

`apps/runner/src/index.ts:1496` and `:1656` each call
`judgements.recordReduced(...)` immediately after `writer.addNode(...)`, with
`selectReducedJudgement` fed a **one-element** array, `dispersion: null`, and
`createUnmeasuredDisagreement()`. There is exactly **one**
`ledger.reduced_judgement` row per `core.node`. Lane 05 emits one
`REDUCED_JUDGEMENT` observation per reduced judgement, and this lane's reader
derives the item key as
`COALESCE(provenance_json->>'item_key', judgement.node_id::text)` — and harvest
never writes `item_key`, so in production the key **is** `node_id`.

Therefore every `itemGrades` group has exactly one member. `median([v]) = v`.
`row.value - median = 0` for every judgement of every judge, permanently.

The cell that results is not empty — it is worse. `n` = the judge's full
judgement count, `basis` = `MEASURED_PROCESS`, `value` = `0`, and the interval
*tightens as n grows*. The evaluator will report, with increasing confidence,
that every judge has exactly zero leniency. That is a measurement that was never
observed (FR-0.5 / DR-115 no-fabrication) and it is precisely the failure mode
FR-4.2's acceptance criterion forbids — absence of evidence rendered as
"unbiased" instead of as absence.

Neither test catches it: the unit fixture builds two `REDUCED_JUDGEMENT`
observations sharing `item:1`, and the integration fixture inserts two rows
sharing `provenance_json.item_key = "item:boundary"`. Both are shapes the harvest
projector cannot produce. The integration test never asserts a leniency value at
all.

**Required.** Restrict the leniency sample to item groups with ≥2 grades (and
consider excluding the judge's own grade from the comparison median — with the
current self-inclusive median an M=2 item forces exactly symmetric ±half-spread
on the two judges, which is an artifact, not a signal). When no group qualifies,
emit `value NULL` / `basis NONE` / `n = 0`. Then add a fixture that reaches the
derivation through the harvest projector rather than around it.

### BF-2 — `bias.lineage_favoritism_residue.v1` is structurally always empty

For a `REDUCED_JUDGEMENT` observation the reader resolves
`subject_maker` from `ledger.raw_artifact` at `observation.source_raw_artifact_ref`
— which lane 05 sets to the judgement's `raw_artifact_ref` — and `author_maker`
through `judgement.node_id → core.node.provenance_ref → ledger.raw_artifact`.
The runner passes the **same** `judged.provenanceRef` as both
`core.node.provenance_ref` and `reduced_judgement.raw_artifact_ref`. The two
joins therefore land on the identical artifact row on every production
observation, so `subjectMaker === authorMaker` always, `otherLineage` is always
empty, `lineageValues` is always `[]`, and the cell is `NULL`/`NONE`/`n=0`
forever. FR-5.1 AC4 requires the residue to be "at least recorded as a monitor";
a cell that can never carry a value is not a monitor.

The evidence that would actually support this metric is sitting unused: lane 05
stores `author_raw_artifact_ref` in the `provenance_json` of every `NODE_REVIEW`
observation, and migration 0019 guarantees reviewer maker ≠ author maker there by
construction. The reader neither resolves that key to a maker nor includes
`NODE_REVIEW` rows in the lineage population (it computes only over
`identityJudgements`).

Compounding this: the SQL `COALESCE` fallbacks for `item_key`, `subject_maker`
and `author_maker` — the only paths production will ever take, since harvest
writes none of those three keys — are **exercised by no test**. Both fixtures
supply all three via `provenance_json`, short-circuiting the joins entirely. A
silent join failure would degrade leniency and lineage to null with nothing red.

**Required.** Either source the lineage population from `NODE_REVIEW`
(reviewer maker vs stored author artifact's maker) or state in the derivation
that it is unavailable under the current single-judge-per-node panel and emit an
explicit unavailable receipt. Either way, cover the COALESCE/join fallback with a
fixture built by the harvest projector.

### BF-3 — the PROWESS rank ladder pools incommensurable metrics (handoff 2, at the rank layer)

`prowessRankGroups` keys on `JSON.stringify([cell.domainId, cell.step])` — the
metric is **not** in the key. Within a group each identity is collapsed to a
single cell by `metricPriority`, and then all identities are sorted against each
other by raw `value`. So in one `(domain, AUTHORING)` ladder, model A ranked on
`prowess.settlement-outcome.v1` (a 0/1 real-world truth) is ordinally compared
against model B ranked on `prowess.consensus-strength.v1` (a panel strength);
in a `(domain, JUDGING)` ladder, `prowess.blind-judge-grade.v1` is compared
against `prowess.judging-tau.v1`. A model with one settled-false answer scores 0
and ranks below a model with consensus strength 0.6 — those numbers do not mean
the same thing.

This is mandatory handoff 2 — "consensus strength and settlement outcome share
metric names with different value semantics; never mix them in one aggregate" —
relocated from the cell layer to the rank layer. A rank ordering is an aggregate.
`evaluator.rank_snapshot` has no `metric` column, so the snapshot does not even
disclose which metric produced each ordinal; an auditor must chase
`source_profile_cell_ids` back to `profile_cell` to discover the ladder is mixed.

Untested: the only fixture holding two prowess metrics puts both on a *single*
identity, so `metricPriority` picks one and the cross-identity mix never occurs.

**Required.** Put `metric` in the rank group key (one ladder per comparable
metric), or restrict each ladder to a single declared metric and record which.

### BF-4 — the confidence interval is understated 2× for the signed bias cells

`boundedMeanInterval` computes `radius = sqrt(log(40) / (2 * n))`. That is the
Hoeffding half-width at α = 0.05 (`2·exp(-2nt²) = α ⇒ t = sqrt(ln(2/α)/(2n))`,
`2/α = 40`) **for variables of range 1**. The general bound carries the range:
`t = (b − a)·sqrt(ln(2/α)/(2n))`. The function is called with
`intervalBounds [0, 1]` for contradiction, add-on and all prowess cells (range 1
— correct) but with `intervalBounds [-1, 1]` for `bias.leniency.v1` and
`bias.lineage_favoritism_residue.v1`, whose range is 2. Those two get half the
half-width they are entitled to.

Hand-computed: at n = 50 the code reports ±0.192 on a leniency cell; the honest
Hoeffding bound is ±0.384. The `Math.max/Math.min` clamp to the passed bounds
masks the error only while n is small enough for the radius to saturate
(n ≤ 2 at range 2), which is exactly why the tests — which only assert
`intervalLower <= value <= intervalUpper` — do not see it.

Secondary on the same function: `ln(40)` is a bare literal with no comment naming
Hoeffding or α, no register receipt, and no coverage level persisted on
`profile_cell`, so a consumer reading `interval_lower`/`interval_upper` cannot
learn what interval it is looking at.

**Required.** Scale the radius by `(upperBound − lowerBound)`, or change the
declared bounds, or document that the interval is not Hoeffding. Name α in
source. Add an interval test whose n is large enough that the clamp does not
hide the width.

### BF-5 — the settlement-contradiction denominator is not verdicts

`latestSettlementByRun` keys settlement observations by `run_id` alone and keeps
only the highest `at_seq`. Each of the judge's judgements in that run is then
paired with that single settlement:

```
const settlement = latestSettlementByRun.get(row.runId);
… [Number((row.value! >= 0.5) !== (settlement.value! >= 0.5))]
```

Consequences, all wrong against FR-5.1's definition ("verdicts later contradicted
when answers settle"):

1. **Denominator inflation.** One settled answer in a run with 5 judged nodes
   produces `n = 5` from a single settlement event. The samples are perfectly
   correlated, yet the Hoeffding interval narrows by √5 — an interval computed
   under an independence assumption the construction violates by design.
2. **Misattribution and silent evidence loss.** `core.run → core.work_item →
   serve.answer` is 1:N, so a run can carry more than one settled answer. Only
   the last-by-`at_seq` survives, and it is then applied to every node the judge
   graded — including nodes belonging to a different answer with the opposite
   outcome. Settlement observations are also emitted per settling *author*
   identity, so this collapses across authors too.
3. **Inherited filter.** The denominator is built from `identityJudgements`,
   which is pre-filtered to `itemKey !== null` (a leniency concern). A judgement
   whose item key cannot be resolved silently leaves the contradiction
   denominator as well.
4. **Undocumented asymmetric threshold.** `>= 0.5` appears nowhere in
   Architecture or Requirements. It scores an exactly-0.5 tau — a maximally
   uninformative forecast — as *contradicting* a false outcome but *agreeing*
   with a true one. The integration test enshrines this as "the contradiction
   boundary" (`judge:at-boundary` at 0.5 → 1, `judge:below-boundary` at 0.49 → 0)
   without any spec backing the choice.

**Required.** Tie each contradiction sample to the judged item's own settled
answer (via `answer_outcome_id` / the answer the node fed), not to the run. One
settlement event must contribute one sample per judge. Register or document the
threshold and make the tie symmetric or excluded.

---

## Non-blocking findings

**S-1 — missing evidence moves judge rank in both directions.**
`score = max(0, 1 - mean(penalties))` averages a penalty vector whose *length*
varies with which bias cells happen to have values. A judge with no add-on grade
simply omits the `1 - addonQuality` penalty and scores strictly better than an
identically-biased judge that has one; `bias.addon_grade_quality.v1` is also the
only bias cell suppressed entirely when empty (`if (addon.length > 0)`), so there
is not even a zero-n cell disclosing the absence — both halves of FR-4.2's
"absence of add-on data is explicit …, not silently treated as unbiased".
Meanwhile a judge with *no* bias evidence at all falls to `penalties.length === 0
→ score 0` and ranks last. Unknown is treated as maximally biased in one place
and as unbiased in another.

**S-2 — the bias-first receipt misses the case that motivates handoff 3.**
`biasContext` is attached only when `group.step` is `JUDGING` or `REVIEWING`, and
it cites the *profiled model's own* judge ordinal. AUTHORING prowess
(`prowess.consensus-strength.v1`) is the cell actually built from judge-produced
numbers — node strengths propagated from reduced judgements — and it receives no
bias linkage whatsoever. Handoff 3 says "prowess derivations that read
judge-dependent inputs must be able to see the bias ranking of **the judges that
produced them**"; the AUTHORING/strength case is that scenario, and it is the one
excluded. (The self-citation on JUDGING/REVIEWING cells is coherent but is not
what the handoff asks for.)

**S-3 — the selector-unbound guard is narrower than its claim.**
`tests/architecture/evaluator-selector-unbound.test.ts` hand-lists four
`index.ts` files. `apps/` holds ten production `.ts` files; the test never reads
`apps/api/src/main.ts`, `apps/runner/src/main.ts`, `apps/runner/src/migrate-cli.ts`,
`apps/scheduler/src/cli.ts`, `apps/replay/*`, or anything under `packages/`. A
binding added in any of those would leave the test green. The *substance* is fine
— my repo-wide grep found zero call sites — but for the mission's central
invariant the guard should walk the source tree rather than a hand-maintained
list that will rot.

**S-4 — the strategy receipt points at nothing.**
`profile_cell.strategy_row_key` / `strategy_register_version` /
`strategy_source_ref` exist (Architecture §3.5) to bind a derivation to a real
register row; lanes 02 and 06 have `readEvaluatorProviderFamily`,
`readEvaluatorDispatchBinding` and `readEvaluatorJudgeAddonPolicy` for exactly
this. This lane adds no `readEvaluatorProfileStrategy`; the receipt is
caller-supplied and validated only for non-blankness and a positive integer, so
any caller can write an arbitrary row key. Meanwhile the real knobs — the `0.5`
contradiction threshold, `ln(40)`, the `metricPriority` ordering, the penalty
aggregation — sit as source literals with no receipt at all. Architecture's
standing rule for this module is "a register value …, never a hidden literal".

**S-5 — vacuous assertions to replace.**
`resolves.toMatchObject({ profileCellsInserted: expect.any(Number),
rankSnapshotsInserted: expect.any(Number) })` passes for `0`/`0`.
`expect(result.phaseOrder).toEqual(["BIAS","JUDGE_RANK","PROWESS","PROWESS_RANK"])`
and the `derivation: { phaseOrder: […] }` matcher compare a frozen source literal
to itself and prove nothing about execution order — the ordering evidence that
does count is the `bias-rank:` entry in `derivationInput` (asserted, good) and
the DB insert order (not asserted). The live-Postgres test asserts no leniency
value and no lineage value at all.

**S-6 — no `AGGREGATE` pipeline receipt.**
`migrations/0023_evaluator_foundation.sql:89` defines
`pipeline IN ('TAG','HARVEST','ADDON','AGGREGATE','CONSUMER')`, and tag/harvest/
add-on all emit their receipts. The profile derivation emits none, so a
derivation run leaves no inspectable started/succeeded/failed trace. Likewise the
selector writes no `shadow_decision(binding_state='UNBOUND')` receipt (§5.4 step
4, §3.5), so there is no durable dark-launch evidence for it.

**S-7 — comment is inaccurate.** "Bias cells and their rank are durable before
prowess begins" — inside a single `withWriteTransaction` they are *visible*, not
durable; everything commits together.

**S-8 — two prowess metrics do not measure prowess.**
`prowess.judging-tau.v1` is the mean of the judge's raw tau, which reflects the
claims the judge happened to be shown, not competence; `prowess.review-outcome.v1`
scores `agree → 1`, `dispute → 0`, so it ranks a reviewer that never disputes
above one that catches problems — working directly against the purpose of
different-lineage review. Versioned metric names make these fixable later, but
under BF-3 they currently feed an ordinal ladder.

---

## Axis summary

| Axis | Result |
|---|---|
| 1. Deliverables (bias cells, prowess cells with n/intervals, ranks, versioned, deterministic, no LLM) | **Partial.** All artifacts exist, are versioned, and contain no LLM anywhere in the derivation. But leniency (BF-1) and lineage (BF-2) are inoperative or fabricated on the production data shape |
| 2. REPLACE-not-pool with mixed consensus+settlement fixtures | **PASS.** Structural, chain-safe, proven non-vacuously on live Postgres and in the unit derivation-input assertion |
| 3. Bias-first ordering | **PASS mechanically**, partial in substance (S-2) |
| 4. Selector provably UNBOUND, zero production call sites | **PASS on substance** (independent repo-wide grep); guard is narrow (S-3) |
| 5. Mathematical honesty — median math, interval derivation, contradiction denominator | **FAIL.** BF-1, BF-3, BF-4, BF-5 |
| 6. FR-0.6 AC5 + lane-04/05/06 differentials, no BOUND, DR-179, tests + typecheck, vacuous assertions, unpinned clocks | **PASS** on suites (690/690), typecheck, no BOUND, no keys, clocks fully pinned; vacuous assertions found (S-5) |

## Recommendation

REWORK. BF-1, BF-2 and BF-5 are metric-definition corrections in
`deriveEvaluatorProfiles` plus fixtures that reach the derivation through the
harvest projector instead of around it. BF-3 is a one-line change to the rank
group key plus a mixed-metric ladder test. BF-4 is a one-line change to
`boundedMeanInterval` plus a large-n interval test. None require a migration or
touch merged lanes. The versioning, persistence, replace-not-pool and
dark-launch work should be preserved as-is.
