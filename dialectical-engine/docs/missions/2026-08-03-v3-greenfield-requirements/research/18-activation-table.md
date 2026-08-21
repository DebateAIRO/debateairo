RESEARCH HANDOFF COMPLETE: seat=Opus-5 ticket=REQ-V3-GREENFIELD-R1 wayfinder-issue=18

Artifact path: `research/18-activation-table.md`
Sources read (read-only): `research/05-battery-coverage-matrix.md` (row IDs and gists);
`docs/missions/2026-08-02-battery-llm-vs-machine/reports/report-for-llm-agents.md`
(§0A V ruling, §1.2 order of operations, §1.3 ARCH-D1–D5, §1.5 cache keys, §2 per-question
contracts, §3 per-rule contracts, §4 activation semantics, §5 mechanisms, §6 parameters,
§7 unresolved mechanisms, §8 validation, Appendix A);
`docs/missions/2026-08-02-battery-llm-vs-machine/upstream/human-plan.md`
(Part 1 lines 149–155, Part 3 per-question `Fires:` lines, Part 9, Appendix);
this mission's wayfinder tickets 07–15 and 19–25 (for V-DECISION routing only).

Verification method: the `·A·` marker set was extracted mechanically from **both** appendices —
the plan's (`grep -c '·A·'` = 45 lines, minus the two prose lines at 1021 and 1027 = **43**) and
the report's Appendix A (`**Qn** ·A·` = **43**). The two sets are **identical**: Q1–Q8, Q10–Q13,
Q15–Q17, Q20–Q22, Q26–Q30, Q32, Q33, Q36, Q39–Q41, Q44, Q45–Q49, Q51–Q55, Q58, Q59, Q62.
The plan's 62 Part-3 `Fires:` lines were then extracted and mapped stage-by-stage to Q IDs: the
"Fires: always" set is **exactly** the `·A·` set, so the marker carries no information the plan's
own trigger prose does not. Every fire condition below is then re-derived from the report's §2/§3
`Trigger predicate` column under one definition, and each divergence is registered.

Assumptions/risks: this table is the **executable candidate**, not a measured activation model.
The report itself calls its predicates "an unvalidated candidate" (§4) and files the whole
question as UNRESOLVED-D1; the plan calls every type-cost figure "a guess" (Part 9). Nothing here
claims to know what a run costs. What it does claim is narrower and checkable: that one definition,
applied to the rows' own written conditions, produces a single consistent answer for all 62 rows,
and that where the sources disagree the disagreement is named rather than averaged. No contested
disposition is resolved here; no V parameter is given a value; where a contradiction needs a
policy choice it is flagged `V-DECISION` and routed, never settled by this seat.

---

## The single definition

A row is **active** when the run's recorded state already contains everything that row's own
written condition asks about, and what it finds there says yes. That is the whole definition and
it is the only one used below: activation is a fact about the recorded state at the moment the
question is put, never a property of the question itself, never a promise made in advance, and
never an estimate of what questions of this kind usually cost. Four things follow, and the fourth
is the one the sources leave out. **ACTIVE** means the obligation is owed now — the row must
produce its output; if a cache already holds exactly that output the row is *still* active and is
merely satisfied from the archive, because a cache hit saves work without cancelling a duty.
**INACTIVE** means the state contains the answer and the answer is no — the row is legitimately
skipped, and the skip is recorded with the predicate and the evidence that made it false, so a
skipped row remains auditable and remains servable ("nothing could be measured" is an answer, not
a silence). **WAIT** means the state does not yet hold what the condition asks about: the row is
neither owed nor skipped, and — this is the entire reason for having a third value — the system
must not spend a model call guessing the missing input in order to decide. A WAIT ends only when
something *outside the row* writes the missing field: another row's output, a machine computation,
an external event, or a human. No row can end its own wait. And because an undecided human
parameter never means false (report §6.1: "absence is deliberate; null/0/false are not
substitutes"), a fourth state is forced: where the missing input is a V decision, the row is
**POLICY-BLOCKED** — owed but unrunnable — and must never be filed as INACTIVE, because an
inactive row reads as satisfied on a coverage report while a policy-blocked row is a hole in the
specification.

Formally, extending the report's §4 function with the state its own §6.1 law requires:

```ts
type PredicateResult = "TRUE" | "FALSE" | "UNKNOWN" | "POLICY_UNRESOLVED";

function activation(row, state): "ACTIVE" | "INACTIVE" | "WAIT" | "POLICY_BLOCKED" {
  const r = evaluate(row.triggerPredicate, state);
  if (r === "TRUE")  return "ACTIVE";
  if (r === "FALSE") return "INACTIVE";        // recorded skip, with predicate + evidence
  if (r === "POLICY_UNRESOLVED") return "POLICY_BLOCKED"; // owed, unrunnable, visible
  return "WAIT";                               // never spend tokens to guess a missing input
}
```

Three consequences the definition settles by itself, which the sources state only in fragments:

1. **"Always" is a property of a predicate, not of a stage.** A row is ALWAYS only if its
   predicate cannot evaluate FALSE for any run that opens — not "always once its stage is
   entered", which is the plan's third and worst definition (plan Part 1, line 155: "the marker
   means 'always, within a stage that may not happen'"). Under the strict reading exactly three
   rows are ALWAYS: **Q1** (`run_opened`), **Q51** (§4: "the sole never-disabled serving
   invariant for any output, including terminal non-answers"), and **Q62's liveness limb**
   (§4: "SETTLE writes liveness telemetry on every closed run").
2. **A row's activation has a count, not a flag.** Six rows are per-item loops (Q16, Q28, Q29,
   Q32, Q33, Q36) and fire 0..N times. A boolean marker cannot express this, which is the
   structural reason the marker set (a boolean, 43) and the cost table (a per-type count, 13/40/
   48/45/44/7) were never reconcilable — they are not two answers to one question, they are
   answers to two different questions. See CR-22.
3. **Cache state and activation state are orthogonal.** §1.5 defines nine cache keys; §4 defines
   activation; neither says what a hit does to a row. Derived from invariant 10 ("cache hits
   reduce work but never certify truth"): a hit never sets INACTIVE. If it did, the mission's own
   cost measure — *activated rows* (matrix §D2) — would fall as caches warmed and would stop
   measuring anything. See CR-26.

Anchor case, where both sources already agree and which fixes the policy-gated class: **Q56**.
The plan's trigger reads "when somebody has said what 'I don't know' costs"; the report's
predicate reads `abstention_policy_resolved and class_history_sufficient`. Both make a V decision
a literal conjunct of activation. Every other policy-gated row below is read against this one.

---

## Activation table (Q1–Q62)

Columns: **Fires** = the disposition under the single definition (`always` /
`trigger:<source>` / `policy-gated:<parameter>`); **Predicate** = report §2, verbatim where it
fits; **Un-waits when** = what must write state before a WAIT can resolve; **Cache** = the §1.5
artifact class that governs reuse and invalidation for that row, or `—` where §1.5 defines none
(meaning: no cross-run reuse; recompute per run).

Cache classes: `Envelope`, `QueryPlan`, `Source`, `QuoteSpan`, `Cluster`, `InstrumentReceipt`,
`Computation`, `CriticReceipt`, `ServedAnswer`.

### Stage 1 — LOCK (Q1–Q6)

| ID | Fires | Predicate (§2) | Un-waits when | Cache / invalidation (§1.5) |
|---|---|---|---|---|
| Q1 | **always** | `run_opened` | n/a — reads only the P0 run record; never UNKNOWN | `Envelope` = `hash(original) + caller scope + as_of + policy_version`; any component change invalidates. Per-run human input (decision/action owner) may be missing without affecting activation |
| Q2 | trigger:`Q1 verdict` | `Q1=CONTINUE` | Q1 returns CONTINUE or INERT | `Envelope`. Binding becomes the sole scope key and enters `QueryPlan`'s key as `binding_id` |
| Q3 | trigger:`Q1 verdict` | `Q1=CONTINUE` | as Q2 | `Envelope` |
| Q4 | trigger:`Q1 verdict` (+ ordering deadline) | `Q1=CONTINUE and before_first_search` | as Q2. `before_first_search` is a **deadline, not a condition** — see CR-21 | `Envelope`; the rule is frozen/hashed/timestamped, amendments versioned |
| Q5 | trigger:`Q1 verdict` (+ ordering deadline) | `Q1=CONTINUE and before_evidence` | as Q2 | `Envelope`; invariant 7 forbids later upward revision of the prior |
| Q6 | trigger:`Q1 verdict` | `Q1=CONTINUE` | as Q2 | `Envelope` + P2 `resourceHash`. Missing `abstention.price` → run `UNPRICED` (Q6 still ACTIVE); missing `splitIterationLimit` → cap absent, propagates to Q26 |

### Stage 2 — ROUTE (Q7–Q10)

| ID | Fires | Predicate (§2) | Un-waits when | Cache / invalidation |
|---|---|---|---|---|
| Q7 | trigger:`Stage-1 closure` | `LOCK_complete` | every Q1–Q6 row is completed-ACTIVE or recorded-INACTIVE | `Envelope` |
| Q8 | trigger:`Q7 act` | `Q7 not terminal` (act ≠ `value`) | Q7 emits one of six acts | obligation template keyed by `questionSpecVersion`; registry version change invalidates. **Unregistered policy** gates the unresolved-type fallback — CR-24 |
| Q9 | trigger:`live-answer set` | `live_answer_count > 1` | the live-answer set is computed from Q3/Q4 | `Envelope` |
| Q10 | trigger:`Q7 act` | `Q7 not terminal` | as Q8 | `Envelope`. Output `split` is the sole key for all of Stage 6 and for Q48 |

### Stage 3 — AIM (Q11–Q14)

| ID | Fires | Predicate (§2) | Un-waits when | Cache / invalidation |
|---|---|---|---|---|
| Q11 | trigger:`route + Q4` | `research_route and Q4_present` | route resolved at Q7/Q8 and Q4 frozen | `QueryPlan` = `binding_id + type/domain/vantage versions + query policy`; binding, registry, vantage **or amendment-policy** change invalidates |
| Q12 | trigger:`route` | `research_route` | route resolved | — (no §1.5 row; ignorance ledger is per-run) |
| Q13 | trigger:`route` | `research_route` | route resolved | — ; its vantage output enters `QueryPlan`'s key via R8 |
| Q14 | **policy-gated:`lineageEquivalence`** | `research_route and critic_candidate_available` | P2 enumerates critic candidates **and** V defines what counts as a different lineage. With candidates present but the policy unresolved the conjunct is UNKNOWN → **WAIT**, not FALSE | `CriticReceipt` = `packet_hash + critic lineage identity + lineage policy version + context receipt`; packet or lineage-policy change invalidates; never reusable as critique of a changed packet |

### Stage 4 — HARVEST (Q15–Q19)

| ID | Fires | Predicate (§2) | Un-waits when | Cache / invalidation |
|---|---|---|---|---|
| Q15 | trigger:`frozen plan` | `Q11_frozen and research_route` | Q11's plan is frozen and non-empty (empty plan blocks retrieval) | `Source` = `canonical_locator + immutable source version/hash + retrieval adapter version`; version/hash or parser change invalidates; age policy marks stale without deleting bytes. **A hit keeps Q15 ACTIVE** |
| Q16 | trigger:`per candidate source` (0..N) | `for_each_candidate_source` | each locator resolves; count is 0 when Q15 admitted nothing | `QuoteSpan` = `source_hash + exact offsets/span hash + extractor version`. `citationEnforcement` gates the hard-kill branch only |
| Q17 | trigger:`Q15 closure` | `Q15_complete` | every admitted query terminates (hit, zero-result, or access failure) | — (projected from the query/absence ledgers) |
| Q18 | trigger:`volatility class` | `answer_can_change_over_time` | the registry supplies a volatility class; where it does not, the predicate is UNKNOWN → **WAIT**, un-waited by one Q18 classification call — CR-19 | `Source`; age recomputed against `as_of`, never cached. `expiryPolicy` bounds what the row may claim |
| Q19 | trigger:`source count` | `admitted_source_count > 1` | Q15/Q16 close the source ledger | `Cluster` = `member source hashes + cluster algorithm version` |

### Stage 5 — RUN (Q20–Q25)

| ID | Fires | Predicate (§2) | Un-waits when | Cache / invalidation |
|---|---|---|---|---|
| Q20 | trigger:`route` | `empirical_research_route` | route resolved. Stage law preserved as: INACTIVE must be **recorded**, never silent — CR-5 | — ; candidate enumeration is deterministic over P2 `resourceHash` |
| Q21 | trigger:`Q20 selection` | `runnable_selected` | Q20 emits `candidate_id` (ACTIVE) or `none_reason` (INACTIVE) | prediction frozen/hashed/timestamped per run; not reusable across runs |
| Q22 | trigger:`Q20 selection` | `runnable_selected` | as Q21 | `Computation` = `input artifact hashes + operator/version + code version`; any input/operator/code change invalidates |
| Q23 | trigger:`instrument use` | `instrument_used` | Q22 pins an instrument | `InstrumentReceipt` = `instrument version + environment hash + fixture hashes`; any dependency/env/fixture change invalidates |
| Q24 | trigger:`attempt exists` | `measurement_attempted` | the first attempt is appended | — (append-only attempt ledger; per run) |
| Q25 | trigger:`Q20/Q22 failure` | `Q20_no_runnable or Q22_blocked` | both Q20 and Q22 terminate | — |

### Stage 6 — SPLIT (Q26–Q31)

| ID | Fires | Predicate (§2) | Un-waits when | Cache / invalidation |
|---|---|---|---|---|
| Q26 | **policy-gated:`splitIterationLimit`** | `Q10.split=true and cap_available` | Q10 decides split **and** V sets the cap. Cap absent → **POLICY_BLOCKED**, never INACTIVE (§6.1) — CR-20, CR-28 | — (generated children/defeaters are per-run; ARCH-D5 forbids similarity-based reuse) |
| Q27 | trigger:`Q10 split` | `Q10.split=true` | Q10 decides | — . `coverageUpgrade` bounds the claim: diagnostic residual only, `coverage_passed` forbidden |
| Q28 | trigger:`per Q26 child` (0..N) | `for_each_Q26_child` | Q26 emits children. **Secondary policy gate:** §0A note 3 adds a per-node restatement whose scope is `strangerTestCoverage` — CR-23 | — (isolated packet per child) |
| Q29 | trigger:`per Q28 survivor` (0..N) | `for_each_Q28_survivor` | Q28 records pass/kill per child. Retry bound comes from `splitIterationLimit` | — |
| Q30 | trigger:`Q10 split`, **compute-WAIT** | `Q10.split=true; compute when operator_and_values_known` | activation on Q10; **computation waits** for Q45's declared operator and the child values. The canonical WAIT row | `Computation` |
| Q31 | **policy-gated:`lineageEquivalence`** | `Q10.split=true and eligible_second_lineage` | Q10 decides split **and** V defines lineage eligibility | `CriticReceipt` (blinded question-only packet fingerprint) |

### Stage 7 — WEIGH (Q32–Q38)

| ID | Fires | Predicate (§2) | Un-waits when | Cache / invalidation |
|---|---|---|---|---|
| Q32 | trigger:`per evidence item` (0..N) | `for_each_evidence_item` | evidence items are admitted. `subjectRelevance` decides the partial branch and therefore **how many items reach a semantic call** — VD-11 | — ; keyed in practice off binding + evidence hashes, but §1.5 defines no row (CR-27) |
| Q33 | trigger:`per claim or leaf` (0..N) | `for_each_claim_or_leaf` | claims/leaves exist; fires even with zero adverse evidence (→ `UNADJUDICATED`) | — |
| Q34 | trigger:`both-sided evidence` | `evidence_on_both_sides` | Q32 closes on both bearings | — |
| Q35 | trigger:`source weight` | `source_is_load_bearing` | weights are assigned | — |
| Q36 | trigger:`per weighted claim + serve` (1..N) | `for_each_weighted_claim and final_confidence` | a weighted claim exists; the `final_confidence` limb fires on every served answer | rubric selection keyed by `rubricRegistryVersion` |
| Q37 | trigger:`type or act` | **adopted:** `(question_type=causal or settlement_act=measurement) and study_result_used` — §2 as written names `measurement` in the wrong enum, CR-16 | Q8's type and Q7's act are both known | — |
| Q38 | trigger:`numeric answer` | `numeric_answer_planned` | the answer shape is decided at compose/serve | — |

### Stage 8 — CROSS (Q39–Q44)

| ID | Fires | Predicate (§2) | Un-waits when | Cache / invalidation |
|---|---|---|---|---|
| Q39 | trigger:`reaching CROSS` | `research_answer_reaches_CROSS` | a non-terminal researched answer exists. **§4 exempts this row from critic availability**: absence is itself a receipt state and must be recorded | `CriticReceipt` |
| Q40 | **policy-gated:`lineageEquivalence`** | `eligible_critic_run` | an eligible critic actually runs; "eligible" is undeterminable until V rules → **WAIT** | `QuoteSpan` + `Computation` (the recheck reopens both). `citationEnforcement` gates the hard-kill |
| Q41 | **policy-gated:`lineageEquivalence`** | `eligible_critic_run` | as Q40 | `CriticReceipt` |
| Q42 | trigger:`critic agreement` | `critic_agrees` | the critic returns agreement; zero added weight if post-unblinding | `CriticReceipt` + unblinding log |
| Q43 | trigger:`split or composed answer` | **adopted:** `split_or_composed_answer`; §2's extra conjunct `alternate_method_required` is undefined in both appendices — CR-17, VD-10 | a split or composed answer exists | `Computation` (alternate operator run) |
| Q44 | trigger:`CROSS entry` | `CROSS_stage_entered` | Stage 8 is entered — fires even with no critic (objection ledger still resolves) | — (objection ledger, per run) |

### Stage 9 — COMPOSE (Q45–Q50)

| ID | Fires | Predicate (§2) | Un-waits when | Cache / invalidation |
|---|---|---|---|---|
| Q45 | trigger:`component count` | `multiple_components_to_compose` | the component set is closed; a depth-zero single-claim answer makes this FALSE | `Computation` |
| Q46 | trigger:`Q45 computable` | `Q45_computable` | Q45 declares an operator and inputs | `Computation` |
| Q47 | trigger:`variant count` | `approved_variant_count > 1` | the operator registry lists >1 approved variant | `Computation`, keyed by `operator/version` |
| Q48 | trigger:`split + both answers` | `Q10.split=true and both_answers_exist` | Q10 split **and** both the frozen baseline and the decomposed answer exist | `Computation`; matched-compute check must pass or the diff is non-comparable |
| Q49 | trigger:`typed ranges` | `composed_answer_with_typed_ranges` | a composed answer with declared perturbation domains exists | `Computation` |
| Q50 | trigger:`question type` | `question_type in {comparative,design}` | Q8 emits the type. `comparisonValueOwnership` governs the output form, not activation | — |

### Stage 10 — SERVE (Q51–Q58)

| ID | Fires | Predicate (§2) | Un-waits when | Cache / invalidation |
|---|---|---|---|---|
| Q51 | **always** | `any_serve_candidate` — §4: "the sole never-disabled serving invariant for any output, including terminal non-answers" | n/a | `ServedAnswer` = `all load-bearing artifact hashes + serve policy + evidence cutoff`; any dependency, policy, cutoff, objection or resolver change invalidates |
| Q52 | trigger:`serve candidate` | `any_serve_candidate`, read narrower than Q51 per §4 — CR-18 | a serve candidate carrying prose exists | `ServedAnswer` |
| Q53 | trigger:`serve candidate` | `any_serve_candidate` | as Q52; trivially satisfied with an empty objection ledger, but the check still runs | `ServedAnswer` |
| Q54 | trigger:`serve candidate` | `any_serve_candidate` | as Q52; **also requires Q5's prior** — with no recorded prior, movement claims are unavailable, not zero | `ServedAnswer` + belief-event log |
| Q55 | trigger:`open unknowns` | `any_open_unknown_at_serve` | the ignorance ledger closes for serve | `ServedAnswer` |
| Q56 | **policy-gated:`abstention`** | `abstention_policy_resolved and class_history_sufficient` | V prices abstention **and** class history reaches the sample bar. Note: this predicate asks *whether the policy is resolved*, so it evaluates cleanly FALSE today → the row is `POLICY_BLOCKED`/`UNPRICED`, distinct from a WAIT | rolling class history; scoring registry version |
| Q57 | trigger:`value clause detected` | `candidate_contains_or_may_contain_value_clause` | the normative-clause detector runs over the draft | `ServedAnswer` |
| Q58 | trigger:`empirical serve` | `empirical_serve_candidate` | the served answer is empirical. `expiryPolicy` forbids reading the trigger as expiry | `ServedAnswer` + evidence cutoff |

### Stage 11 — SETTLE (Q59–Q62)

| ID | Fires | Predicate (§2) | Un-waits when | Cache / invalidation |
|---|---|---|---|---|
| Q59 | trigger:`answer record` | `answer_record_created` | an answer record exists. Per-run human input: external resolver identity. **Deployment gate:** `stage11Rollout` — VD-7 | — ; `expiryPolicy` and monitoring metadata attach here |
| Q60 | trigger:`Q59 scoreability` | `Q59_scoreable` | Q59 names a legitimate external resolver; no resolver → `PERMANENTLY_UNSCOREABLE` (INACTIVE, recorded) | outcome row; read-back verification is part of activation, not of caching |
| Q61 | trigger:`external clock` | `resolver_outcome_arrived and Q60_valid` | **the outside world reports.** The only cross-run trigger in the battery; may remain WAIT indefinitely without that being a defect | scoring registry version; calibration rows versioned on update |
| Q62 | **always** (liveness limb) + trigger:`wrong outcome` (attribution limb) | `on_run_close for liveness; wrong_resolved_outcome for attribution` | liveness: never waits — §4, "SETTLE writes liveness telemetry on every closed run". Attribution: waits on a resolved-wrong outcome | liveness ledger. `livenessThreshold` gates demote/remove — **this row can edit the activation graph itself** (VD-14) |

### Roll-up (Q1–Q62)

| Fire condition | Count | IDs |
|---|---:|---|
| **always** | **3** | Q1, Q51, Q62 (liveness limb; attribution limb is triggered) |
| **trigger** | **53** | Q2–Q13, Q15–Q25, Q27–Q30, Q32–Q39, Q42–Q50, Q52–Q55, Q57–Q61 |
| **policy-gated** | **6** | Q14, Q26, Q31, Q40, Q41 (`lineageEquivalence` ×4, `splitIterationLimit` ×1), Q56 (`abstention`) |

Trigger sub-shapes, because the coverage proof needs them distinguishable. These partition the 53
exactly — each ID appears once:

| Sub-shape | Count | IDs |
|---|---:|---|
| route / upstream-verdict gated | 16 | Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q10, Q11, Q12, Q13, Q15, Q17, Q20, Q39, Q44 |
| per-item loop, cardinality 0..N | 6 | Q16, Q28, Q29, Q32, Q33, Q36 |
| stage-gated on `Q10.split` | 3 | Q27, Q30, Q48 (Q28/Q29 are loops *inside* the same gate) |
| resource / instrument gated | 6 | Q21, Q22, Q23, Q24, Q25, Q47 |
| answer-, evidence- or type-shape gated | 18 | Q9, Q18, Q19, Q34, Q35, Q37, Q38, Q42, Q43, Q45, Q46, Q49, Q50, Q55, Q57, Q58, Q59, Q60 |
| serve-candidate gated | 3 | Q52, Q53, Q54 |
| external clock | 1 | Q61 — the only cross-run trigger in the battery |

Fourteen rows additionally carry a **secondary** policy interaction that shapes output or
consequence without gating activation: Q6, Q8, Q11, Q15, Q16, Q18, Q27, Q28, Q32, Q50, Q51, Q58,
Q59, Q62.

### Supplementary: the nine rules (R1–R9)

Included because four question rows depend on rule activation (Q11←R1, Q32←R2, Q13←R4/R8,
Q14/Q39←R5, Q28←R9). Not counted in the 62.

| ID | Fires | Predicate (§3) | Note |
|---|---|---|---|
| R1 | trigger:`route` | `research_route before Q15` | `queryAmendment` governs whether the frozen set may grow — VD-12 |
| R2 | **always** (binding limb) + trigger:`per evidence item` | `Q2 then for_each_evidence_item` | binding limb inherits Q2's `Q1=CONTINUE` gate |
| R3 | trigger:`route` + re-fires on new evidence | `research_route at AIM; update on new evidence` | the only row with an explicit re-activation clause |
| R4 | trigger:`route` | `research_route at AIM` | — |
| R5 | trigger:`non-terminal researched answer` | `nonterminal researched answer before confident serve` | `criticUnavailable` decides the consequence — VD-4 |
| R6 | **policy-gated:`lineageEquivalence`** | `after intake, before Q2 binding` — a **time window, not a condition**; the row runs **two** isolated question-only contexts, so eligibility is a lineage question | fires on every run once the lineage rule exists |
| R7 | trigger:`Q8 routing` | `beside Q8 type routing` | unregistered fallback-authorization policy — CR-24, VD-9 |
| R8 | trigger:`AIM` | `AIM before source-plan freeze` | feeds `QueryPlan`'s vantage-version key |
| R9 | trigger:`serve ready` + **policy-gated:`strangerTestCoverage`** (per-node limb) | `serve_candidate_ready`; §0A note 1 extends scope to every node | contract text still says "only top layer" — CR-23; ticket 07 already pulls R9 out of batch ratification |

### Worked case — `LOOKUP-MIN`, the simplest possible run

Stated so the counts below are checkable rather than asserted. Assumptions: Q1=CONTINUE; Q7
act=`lookup` (non-terminal); Q8 type=`factual`; one live answer; Q10 split=false; ≥2 admitted
sources; nothing runnable; registry says volatility=static; no numeric answer; evidence one-sided;
≥1 load-bearing source; ≥1 open unknown at serve; no recommendation clause; the answer is already
settled, so no future resolver.

- **ACTIVE (32):** Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q10, Q11, Q12, Q13, Q15, Q16(×N), Q17, Q19,
  Q20, Q25, Q32(×N), Q33(×N), Q35, Q36, Q39, Q44, Q51, Q52, Q53, Q54, Q55, Q58, Q59, Q62
- **WAIT (3):** Q14, Q40, Q41 — all three blocked on `lineageEquivalence`
- **POLICY_BLOCKED (1):** Q56 — `abstention` unpriced
- **INACTIVE (26):** Q9, Q18, Q21, Q22, Q23, Q24, Q26, Q27, Q28, Q29, Q30, Q31, Q34, Q37, Q38,
  Q42, Q43, Q45, Q46, Q47, Q48, Q49, Q50, Q57, Q60, Q61

32 + 3 + 1 + 26 = 62. With the lineage rule resolved and a critic present the ACTIVE count is 35.
Of those 35, thirty-one carry the `·A·` marker and four do not (Q14, Q19, Q25, Q35). **The plan's
type-cost estimate for this exact case is thirteen.** Nothing in either document derives thirteen.

---

## Reconciliation register

Every place the `·A·` marker, the plan's own trigger prose, the plan's type-cost estimates, or
the report's contract tables contradict each other. **Kind** is `marker↔predicate`,
`estimate↔predicate`, `report-internal`, or `undefined` (an interaction neither source specifies).
Adopted reading is always stated with the one-line reason.

| # | Kind | The contradiction | Adopted | Why (one line) |
|---|---|---|---|---|
| CR-1 | marker↔predicate | Q2–Q6 carry `·A·` and "Fires: always"; §2 gates all five on `Q1=CONTINUE` | predicate | The plan's own Q1 consequence — "stop there, say so, and hand the question back unresearched" — makes an unconditional Q2–Q6 self-contradictory. |
| CR-2 | marker↔predicate | Q7, Q8, Q10 marked always; §2 gates Q7 on `LOCK_complete` and Q8/Q10 on `Q7 not terminal` | predicate | The plan's own Q7 text hands a value question to a person "immediately and stop", so a downstream always-row cannot exist. |
| CR-3 | marker↔predicate | Q11, Q12, Q13 marked always; §2 gates all three on `research_route` | predicate | A terminated question never reaches AIM; the marker has no vocabulary for route. |
| CR-4 | marker↔predicate | Q15, Q16, Q17 marked always; §2 gates them on `Q11_frozen`, per-source iteration, and `Q15_complete` | predicate | An empty query plan blocks retrieval by the plan's own R1, so Q15–Q17 cannot fire unconditionally. |
| CR-5 | marker↔predicate | Q20 marked always **and** the plan's Stage-5 law says "Not answering this one at all is not allowed"; §2 gates it on `empirical_research_route` | predicate, **plus** a preserved obligation: INACTIVE must be recorded with predicate and evidence | The law forbids a *silent* skip, not an INACTIVE state; §5 mechanism 1 already requires "every skip has a predicate/evidence record", which is exactly the reconciliation. |
| CR-6 | marker↔predicate | Q21, Q22 marked `·A·` yet their own text reads "always, once something is actually being run"; §2: `runnable_selected` | predicate | A trigger written with the word "always" is still a trigger; the plan concedes this at Part 1 line 155. |
| CR-7 | marker↔predicate | Q26–Q30 marked always inside a stage that requires `Q10.split=true` | predicate | The stage's own title is "if that was justified"; five of the plan's own seven acknowledged conditionals. |
| CR-8 | marker↔predicate | Q32, Q33, Q36 marked always; §2 makes all three per-item loops | predicate | With zero admitted evidence Q32 fires zero times — a boolean "always" cannot describe a row whose count can be zero. |
| CR-9 | marker↔predicate | Q39, Q40, Q41, Q44 all marked always; §2 gates Q40/Q41 on `eligible_critic_run` while §4 requires Q39 to be recorded even with no critic | predicate, with §4's exemption for Q39 | §4 explicitly separates receipt-recording (machine, unconditional at CROSS) from critic-running (conditional); Q44 likewise runs on the objection ledger without a critic. |
| CR-10 | marker↔predicate | Q45–Q49 marked always; §2 gates them on `multiple_components_to_compose`, `Q45_computable`, `approved_variant_count > 1`, `Q10.split=true and both_answers_exist`, `composed_answer_with_typed_ranges` | predicate | A depth-zero single-claim answer has nothing to compose; **Q48 is explicitly split-gated in §2**, which the plan's "seven conditional" caveat misses entirely. |
| CR-11 | marker↔predicate | Q52, Q54, Q55, Q58, Q59, Q62 marked always; §2 gates them on serve-candidate shape, open unknowns, empiricality, an answer record, and run close | predicate; only Q51 and Q62's liveness limb survive as unconditional | §4 names Q51 "the sole never-disabled serving invariant" and says liveness is written "on every closed run" — everything else in Stage 10/11 is shaped by what the run produced. |
| CR-12 | marker↔estimate | The plan's caveat says **seven** of the 43 markers are conditional in their own text (2 measurement + 5 split) | **twelve** | On a plain researched, unsplit question the INACTIVE marker rows are Q21, Q22, Q26–Q30 **and Q45–Q49** — the compose stage is exactly as conditional as the split stage and was never counted. |
| CR-13 | estimate↔predicate | The plan asserts the 13-row lookup set is a subset of the 43 markers ("those thirteen exclude thirty questions carrying the always-run marker"; 13+30=43) | not a subset | `LOOKUP-MIN` activates Q14, Q19, Q25 and Q35, none of which carries a marker; the arithmetic identity is a coincidence of counting, not a relation between the two sets. |
| CR-14 | estimate↔predicate | The plan costs a simple factual lookup at **about thirteen** questions | **~35** (32 today, with 3 WAIT and 1 POLICY_BLOCKED) — see `LOOKUP-MIN` | No derivation of thirteen exists in either document; removing the three MACHINE rows still leaves 32, and the plan itself calls every one of the six type figures "a guess" (Part 9). The residual — whether a budget may *override* the predicates — is a V choice, VD-8. |
| CR-15 | estimate↔predicate | The plan traces the published "26" to 43 minus the marker rows in four stages (measure 3, split 5, attack 4, recombine 5 = 17) | 26 is wrong in a nameable way; the correct researched-unsplit-critic-present marker count is **31** | Q20 fires on any empirical research route, Q39 on reaching CROSS even with no critic (§4), Q44 on CROSS entry — three of the seventeen "optional" rows are not stage-optional at all. |
| CR-16 | report-internal | Q37's predicate reads `question_type in {causal,measurement}`, but Q8's type enum is `factual\|causal\|predictive\|comparative\|design\|value` — `measurement` belongs to **Q7's settlement-act enum** | `question_type=causal OR settlement_act=measurement` | It is the only reading that preserves the plan's own trigger text ("for cause-and-effect and measurement questions") without widening either enum; as written the predicate can never evaluate TRUE on its stated field. |
| CR-17 | report-internal | Q43's §2 predicate is `split_or_composed_answer and alternate_method_required`; both appendices say only "when the question was split or pieces were combined" | the appendix reading for **activation**; `alternate_method_required` recorded as an undefined gate | An undefined conjunct evaluates UNKNOWN forever, leaving the row in permanent WAIT and silently deleting a Stage-8 obligation. → VD-10. |
| CR-18 | report-internal | Q51, Q52, Q53, Q54 carry the **identical** predicate string `any_serve_candidate`, yet §4 calls Q51 "the **sole** never-disabled serving invariant for any output, including terminal non-answers" | Q51 = always; Q52–Q54 = trigger, with `any_serve_candidate` read narrower than "any output" (excludes terminal non-answers) | §4 is the report's own activation-semantics section and the only text that distinguishes them; the alternative reading contradicts the word "sole". |
| CR-19 | report-internal | Q18's predicate `answer_can_change_over_time` reads a volatility judgment that **Q18's own LLM output produces** when the registry does not | two-phase: registry class → TRUE/FALSE; no registry class → **WAIT**, un-waited by one Q18 classification call | Any other reading makes the row either unconditionally active (contradicting its own trigger) or permanently waiting (deleting it). |
| CR-20 | marker↔predicate | Q26's conjunct `cap_available` appears in **neither** appendix and in no plan `Fires:` line; it enters only via §2 and Q6's failure text | §2 — Stage 6 is policy-gated, not merely split-gated | Without a cap the generate/filter loop has no terminating bound, which the plan records at Q30 as a live failure mode ("what once sent the whole process into a loop it couldn't get out of"). → VD-1. |
| CR-21 | report-internal | Q4's `before_first_search` and Q5's `before_evidence` are conjuncts that can flip TRUE→FALSE by the mere passage of the run; under §4 a FALSE conjunct means INACTIVE | deadline conjuncts are **ordering constraints, not activation conjuncts**; violation is a gate failure, not a deactivation | §2's own failure text says a missing Q4 means "run does not start" — treating a missed deadline as INACTIVE would let a run delete its own answer rule simply by starting to search. |
| CR-22 | marker↔estimate | The marker is a boolean per row; the cost table is a count per question type; six rows fire 0..N times | activation records a **count**, never a flag | This is the root cause of the 43-vs-13 contradiction: the two numbers answer different questions, so no arithmetic can reconcile them and none should be attempted. |
| CR-23 | report-internal | §0A notes 1 and 3 extend R9 to every node and add a restatement dimension to Q28, but **neither row's predicate or contract text was rewritten** (R9 still says "Give fresh context only top layer") | §0A governs (note 1: "Wherever this document's contracts reference R9, read them with this scope"); Q28 and R9 gain a per-node limb that is policy-gated on `strangerTestCoverage` | A V ruling recorded in the document's own §0 outranks unamended row text; ticket 07 has already pulled R9/Q27/Q28 out of batch ratification for exactly this reason (matrix D-2). → VD-5. |
| CR-24 | undefined | Q8: "Unresolved type → visible factual fallback **only if approved**; otherwise policy-blocked"; R7 says the same for domain. **No parameter in §6.1's register authorizes it** | recorded as a missing V-owned parameter | "Policy-blocked" at Q8 halts the run, which sets every downstream row INACTIVE — an unregistered switch that can deactivate the whole battery is the most consequential gap in the register. → VD-9. |
| CR-25 | undefined | ARCH-D2 leaves retrieve-first vs split-first unresolved, but §2's predicates silently assume T4→T5→T6 (Q30's `operator_and_values_known`, Q48's `both_answers_exist`) | the table is written order-independent where possible; Q30 and Q48 are marked WAIT-until rather than ordered | An activation table that bakes in a contested ordering would make an unresolved experiment look like settled law (ARCH-D2's own instruction). → VD-6. |
| CR-26 | undefined | §1.5 defines nine cache keys, §4 defines activation, and **neither says what a cache hit does to a row's activation state** | a hit **never** sets INACTIVE; the row stays ACTIVE and is satisfied from the exact artifact | Invariant 10 says hits "reduce work but never certify truth"; and if hits set INACTIVE, the mission's own cost measure *activated rows* would fall as caches warmed and stop measuring anything. |
| CR-27 | undefined | §1.5 defines **no** cache row for Q12, Q13, Q20, Q26–Q31 or Q32–Q38 | no cross-run reuse; recompute per run | §1.5 is exhaustive by construction (nine artifact classes) and ARCH-D5 forbids inferring a semantic hit from similarity — which means the stages the plan estimates as most expensive are precisely the uncacheable ones. |
| CR-28 | report-internal | §4's activation function returns `ACTIVE\|INACTIVE\|WAIT`, but §6.1's law says an unresolved parameter "never means null, zero, or false" — so a policy-gated row has **no legal return value** | a fourth state, `POLICY_BLOCKED`, added in the definition above | Collapsing policy-blocked into INACTIVE makes an unresolved V decision read as a satisfied coverage row; forced by §6.1's own law, not a policy choice, so adopted here rather than flagged. |

**Contradiction count: 28**, by kind: `marker↔predicate` **12** (CR-1 to CR-11, CR-20);
`marker↔estimate` **2** (CR-12, CR-22); `estimate↔predicate` **3** (CR-13, CR-14, CR-15);
`report-internal` **7** (CR-16, CR-17, CR-18, CR-19, CR-21, CR-23, CR-28); `undefined`
interactions **4** (CR-24 to CR-27). In every `marker↔predicate` case the predicate won, for the same structural
reason: the marker records whether a row's stage-local prose contains a trigger sentence, which is
a fact about the *plan's typography*, not about the run. **The `·A·` marker is therefore retired as
an activation concept.** It survives only as provenance — "marked always-run in the source" — and
must not appear in the V3 spec as a fire condition.

---

## V-DECISION flags

Contradictions that require a V policy choice. **None is resolved here.** Ticket 08 has SPLIT into
per-theme tickets 19–25; where a successor is the operative venue it is named in brackets.

| # | Parameter / choice | The activation effect — why this is not a drafting question | Owning ticket |
|---|---|---|---|
| VD-1 | `splitIterationLimit` | `cap_available` is a hard conjunct of Q26 (CR-20): **the whole of Stage 6 is POLICY_BLOCKED until V sets the cap.** Also bounds Q29's retry-before-kill and Q31's critique rounds. Was an orphan; ticket 12 restored it | **12** [21] |
| VD-2 | `abstention` | Q56's predicate literally names the resolution flag; Q6 marks every run `UNPRICED` meanwhile. A unanimous-MACHINE row that cannot run (matrix D-9) | **10** |
| VD-3 | `lineageEquivalence` | Four rows (Q14, Q31, Q40, Q41) plus R5/R6 sit in **WAIT**, not INACTIVE, until V defines what counts as a different lineage — 3 of them on the simplest possible run | **11** |
| VD-4 | `criticUnavailable` | Decides whether Q40/Q41 being INACTIVE blocks the confident band — i.e. whether the serve rows fire on a confident or a provisional answer | **11** |
| VD-5 | `strangerTestCoverage` | Changes activation **cardinality**, not fire/skip: exhaustive vs load-bearing-only vs sampled sets how many Q28/R9 restatement calls a split graph costs (§0A note 5, CR-23) | **12** [24] |
| VD-6 | `orderingPolicy` | Retrieve-first vs split-first changes which predicates are evaluable when; Q30 and Q48 are the two order-dependent rows (CR-25) | **12** |
| VD-7 | `stage11Rollout` | DAY_ONE / PHASED / DEFER_FULL_SETTLE decides whether Q59–Q62 activate in deployment at all, including whether Q62's always-on liveness limb still writes | **15** |
| VD-8 | Activation budget vs predicates | The predicates make `LOOKUP-MIN` ~35 rows; the plan's estimate is 13 (CR-14). **May a per-type cost ceiling deactivate a row the predicate makes ACTIVE?** No source defines a budget-driven deactivation rule; if the answer is yes, the spec needs one and every skip needs a record distinguishable from a predicate skip | **15** (adoption bar / matched cost) with **12** (per-question quota) |
| VD-9 | Unregistered: "authorized visible fallback" | Q8 (unresolved type) and R7 (unresolved domain) both say "only if approved; otherwise policy-blocked" — and policy-blocked at Q8 halts the run, deactivating everything downstream. **No parameter in §6.1's register covers it** (CR-24); the register needs a nineteenth entry | **12** (knob register) |
| VD-10 | Q43's `alternate_method_required` | An undefined conjunct that neither appendix carries (CR-17). Who requires an alternate method — policy, the critic, or the question type? Undefined leaves the row in permanent WAIT | **11** |
| VD-11 | `subjectRelevance` | BINARY vs WHOLE_BINARY_PARTIAL_GRADED vs GRADED sets **how many evidence items reach a Q32 semantic call** and whether partial items propagate to Q33–Q38 — an activation-cardinality choice, not only a weighting one | **09** [22] |
| VD-12 | `queryAmendment` | Decides whether the frozen query ledger may grow mid-run, i.e. whether Q15/Q16 can **re-activate** after HARVEST closes | **09** [20] |
| VD-13 | `expiryPolicy` | The only possible source of **post-run** activation: whether a served answer's rows can re-fire after the run closes. NO_AUTOMATIC_EXPIRY makes the activation graph strictly within-run; a risk/volatility rule does not | **14** |
| VD-14 | `livenessThreshold` | Q62's demote/remove **edits the activation graph itself** over time. A self-modifying graph needs a version and freeze rule, or the coverage proof is only true of one graph version | **14** |
| VD-15 | `coverageUpgrade` | Whether Q27 stays diagnostic-only or a coverage **gate row** activates and can block serve. Restored orphan (matrix D-6); UNRESOLVED-M1's policy half | **12** |
| VD-16 | `citationEnforcement` | Whether a hard-kill gate activates at Q16/Q40/Q51 and whether automation is required before it may fire. Restored orphan (matrix D-5); UNRESOLVED-M2's policy half | **12** |
| VD-17 | Terminal-route survivor set | §4 says a terminal route "deactivates downstream work **except provenance/persistence needed to serve that terminal result**" and never names that set. Derived minimum is {Q1, Q51, Q62-liveness}; whether Q52 (wording), Q55 (typed not-knowing) and R9 (stranger test) also survive an INERT or ill-posed return is a product choice with a real cost | **10** (typed non-answers) [24] |

**V-DECISION count: 17.** Six of them (VD-1, VD-2, VD-3, VD-5, VD-9, VD-17) gate activation
directly — rows that cannot be classified ACTIVE or INACTIVE at all until V rules. The other
eleven change how many times a row fires, in what order, or whether it can fire again later.

**One consequence for the coverage proof.** Under this table, a spec that ratified all 62
dispositions today would still contain three rows in WAIT and one POLICY_BLOCKED on the *simplest*
run in the battery's repertoire. The coverage proof therefore needs two columns, not one:
*disposition* (ticket 07/08's output — what the row is) and *runnability* (this table's output —
whether the row can fire yet). Ticket 07 has already accepted this shape for Q6 and Q56 via the
`blocked-on: abstention price` dependency; VD-1, VD-3, VD-9 and VD-17 extend the same treatment to
Stage 6, the CROSS rows, the type/domain fallback, and every terminal return.
