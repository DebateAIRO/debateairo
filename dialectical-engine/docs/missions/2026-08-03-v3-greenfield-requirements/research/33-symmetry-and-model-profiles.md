RESEARCH HANDOFF COMPLETE

# 33 — Q34 symmetry instrumentation + per-model capability/bias scorecards

Ticket: `wayfinder/issues/33-symmetry-and-model-profiles.md` · Mission: REQ-V3-GREENFIELD-R1
Seat: Opus research · Date: 2026-08-04 · Commissioned by V in the theme-4 sitting (DR-038, DR-039).

Two subjects, kept strictly separate by V's instruction. Nothing here is a ruling.

**Reading conventions.** `FACT` = established by a cited source or recomputed here.
`SEAT-PROPOSAL` = this seat's recommendation, never authority. *(speculation)* = an
inference I cannot ground. Every number presented as a fact about arithmetic was
computed in this session from the stated formula (script disposable, not committed);
the parameters are printed so any number can be rechecked.

**Local inputs read (read-only).** `wayfinder/decisions-ledger.md` (DR-013/014/015/016/019/024/026/027/028/029/030/032/033/034/038/039);
`research/02-scoring-behavior-spec.md` (judge contract §2.2–2.9, calibration §2.9, dispersion, parse/persist paths);
`research/04-node-graph-data-model.md` (WEIGH gaps 1–7, "no symmetry-of-scrutiny record");
`research/05-battery-coverage-matrix.md` (all 62 row gists + dispositions);
`research/06-contested-decision-briefs.md` Theme 4 (§4.1–4.5);
`research/18-activation-table.md` (activation states ACTIVE/INACTIVE/WAIT/POLICY_BLOCKED; Q34 trigger `evidence_on_both_sides`);
`research/32-weight-derivation.md` (S12 verification-effort verdict; the derivable-vs-V-policy split);
`wayfinder/GLOSSARY.md`; `logs/codex-mapreview.log` (the merged per-row machine contracts for Q15–Q17, Q19, Q23, Q32–Q35, Q37, Q40, Q46, Q59–Q61 — quoted where load-bearing).
No other mission's files, no code, no git.

---

## Subject 1 — Evidence-checking symmetry (battery Q34)

### 1.0 The finding that reframes the row: Q34 needs no new measurement

The brief poses Q34 as an open engineering question — *"is verification effort
instrumented? If V3 records what it actually did to check each item, the comparison is
arithmetic"* (`06-contested-decision-briefs.md` §4.1). The survey below answers it in a
way neither side of the Hermes/Codex/Grok dispute stated: **every field the symmetry
diff needs is already an obligation of another battery row, and every one of those rows
is MACHINE or is HYBRID with a machine limb.** Q34 does not require an effort metric to
be invented; it requires a `GROUP BY` over records other rows are already required to
write.

`FACT` — the per-row machine contracts, from the merged contract table (`logs/codex-mapreview.log`
lines 271–352, the report's §2 per-question contracts):

| Row | Disposition | Machine side already obliged to record |
|---|---|---|
| Q15 | MACHINE | "Run every admitted query; record class/time/hits/include-exclude reason/**zero results**/**access failures**; diff planned vs run" |
| Q16 | HYBRID | "Resolve/archive locator+version+time; record **opened/preview/blocked** and **primary/secondary**; extract spans; **exact-compare** where available" |
| Q17 | MACHINE | "Project zero-result searches into `{query,scope,date}` rows" |
| Q19 | HYBRID | "Cluster identifiers/authors/data/versions/citations… expose uncertain edges" |
| Q23 | MACHINE | "Run registered known-positive and known-negative fixtures… cache receipt by instrument/env/fixtures" |
| Q32 | HYBRID | "Compare typed population/comparator/outcome/time; reject clear mismatch" → `{evidence_id, fit:in/partial/out, reason}` |
| Q35 | HYBRID (DR-038) | "Join source interests and competing hypotheses; retain but assign zero weight to non-diagnostic evidence" |
| Q37 | HYBRID (DR-038) | "Present seven domains, prefill metadata, validate supporting record and disposition" → per-domain `{name,finding,direction?,magnitude?,disposition}` |
| Q40 | HYBRID | "Reopen locators; exact-check preserved spans; rerun sums; compare; emit **verified/deviates/not-found**" |
| Q46 | MACHINE (unanimous) | "Perturb/remove each input; compute leverage; **join verification effort**; rank" |

Two consequences V should see before anything else.

1. **Q46 already presupposes the same telemetry and is *unanimously* MACHINE.** Its
   consequence clause — *"Highest-leverage item least verified → halt recombination and
   return it to WEIGH/RUN"* — cannot execute without a per-item verification record.
   Q34 and Q46 are therefore not two schema asks; they are one. If the telemetry is
   built, an already-ratified-as-machine row gets a working gate for free. If it is not
   built, a unanimous MACHINE row is a dead check on day one.
2. **DR-027 already ordered the store.** The execution ledger requires *"everything
   executed is recorded — attempts, failures, could-not-dos — digest-visible to the
   user, with algorithm behavior consistent with the record."* Q34 does not need a new
   table. It needs **two new stamps on the ledger row**: *which item the action was
   about*, and *which side that item was on when the action ran*. Everything else is
   already owed.

`SEAT-PROPOSAL` — the honest framing for the sitting: Q34's disposition is not
"MACHINE vs HYBRID". It is *"does V order the two ledger stamps that make the already-machine
comparison computable, and what happens on the runs where they are missing?"*

### 1.1 The minimal telemetry schema

One typed facet of the execution ledger (Postgres per DR-024), append-only, written by
the executing row at execution time and never by a summarizer.

```
verification_action                     -- a facet of the DR-027 execution ledger
  action_id          uuid  pk
  run_id             uuid                -- run identity, for the replay law (DR-034)
  subject_item_id    uuid  NOT NULL      -- NEW STAMP 1: the evidence/claim item acted on
  stance_at_action   enum  NOT NULL      -- NEW STAMP 2: SUPPORTS | ATTACKS | NEUTRAL | UNASSIGNED
                                         --   the item's polarity toward the working answer
                                         --   AT THE MOMENT THE ACTION RAN
  battery_row        text  NOT NULL      -- owning row, e.g. 'HARVEST/Q16'
  action_kind        enum  NOT NULL      -- closed set, §1.1.1
  outcome            enum  NOT NULL      -- COMPLETED | FAILED | BLOCKED | TIMED_OUT
                                         -- | REFUSED | SKIPPED_BY_BUDGET   (DR-030 knob 9)
  outcome_code       text                -- typed reason from the owning row's own vocabulary
  actor              enum                -- MACHINE | MODEL:<judge_role> | HUMAN
  started_at, ended_at  timestamptz
  cost_units         jsonb               -- provider-reported tokens/requests only
  input_fingerprint  text  NOT NULL      -- contract+input hash: makes the action replayable
```

Only `subject_item_id` and `stance_at_action` are new asks. `outcome` including the
failure members is DR-027 verbatim; `input_fingerprint` is DR-034 verbatim;
`SKIPPED_BY_BUDGET` is DR-030 knob 10's visible marker.

#### 1.1.1 `action_kind` — the closed set, each with an owning row

No member exists without a row that already obliges the record. This is what makes the
schema survive DR-039: there is no field whose only purpose is to be measured.

| `action_kind` | Owning row | The hard fact it records |
|---|---|---|
| `QUERY_RUN` | Q15 | an admitted query actually issued; hits count; zero-result flag |
| `ACCESS_FAILED` | Q15 | the query or fetch could not complete, with its typed reason |
| `ABSENCE_RECORDED` | Q17 | a zero-result search projected to `{query,scope,date}` |
| `SOURCE_RESOLVED` | Q16 | locator + version + retrieval time archived |
| `SOURCE_OPENED_FULL` / `SOURCE_PREVIEW_ONLY` / `SOURCE_ACCESS_BLOCKED` | Q16 | **the access-depth primitive — already a three-valued required record** |
| `PRIMARY_SECONDARY_CLASSIFIED` | Q16 | original work vs somebody's summary |
| `SPAN_EXTRACTED` | Q16 | the exact span the claim rests on was pulled |
| `EXACT_QUOTE_COMPARED` | Q16 / DR-020 knob 7 | character-level match run, with its verdict |
| `INDEPENDENCE_EDGE_DECIDED` | Q19 | `same_source` / `shared_assumption` / `independent` |
| `INSTRUMENT_FIXTURE_RUN` | Q23 | known-positive + known-negative fixtures executed |
| `FIT_ADJUDICATED` | Q32 | `in` / `partial` / `out` with reason |
| `DIAGNOSTICITY_ASSESSED` | Q35 | the would-say-either-way judgment produced |
| `BIAS_DOMAINS_ASSESSED` | Q37 | how many of the seven domains carry a finding + disposition |
| `RECHECK_PERFORMED` | Q40 | `verified` / `deviates` / `not_found` |
| `JUDGE_ASSESSMENT` | judge contract | a parseable `ClaimAssessment` persisted for this item |

`FACT` — the last member is already implemented in V2 and already honest about its own
failures: raw judge artifacts are persisted *unconditionally, parseable or not*, with
`parse_status` and `parse_error` (`02-scoring-behavior-spec.md` §2.6 step 7, §3.2). The
one thing V2 does not do is stamp the artifact with the *side* the node was on. That is
the whole gap.

#### 1.1.2 The derived diff — what arithmetic actually runs

`symmetry_diff` is a **view**, never a stored authority: under DR-034 it must be
recomputable from `verification_action` alone with no AI in the replay.

Fires only on Q34's own trigger, `evidence_on_both_sides` (`18-activation-table.md`).
For the item population of one run:

```
applied_kinds(side)   = { k : ∃ item on side with an action of kind k, outcome=COMPLETED }
coverage(side, k)     = |{ items on side with ≥1 COMPLETED action of kind k}| / |items on side|
access_profile(side)  = counts over {OPENED_FULL, PREVIEW_ONLY, ACCESS_BLOCKED}
attempted_not_done(side, k) = items with an action of kind k whose outcome ≠ COMPLETED
```

The battery's three sub-claims map one-to-one, and each is a set or count comparison —
no scalar, no average:

- **same checklist** → `applied_kinds(SUPPORTS) == applied_kinds(ATTACKS)` (set equality)
- **same access depth** → `access_profile` compared as counts per bucket
- **same actions per side** → `coverage(side, k)` compared per kind

Output is **a repair instruction, not a score**:

```
symmetry_diff = {
  status: SYMMETRIC | ASYMMETRIC | UNINSTRUMENTED | NOT_APPLICABLE,
  missing_kinds:       [ {side, action_kind} ],           -- checklist not equal
  remediation_targets: [ {item_id, side, action_kind} ],  -- the exact work list
  blocked_not_lazy:    [ {item_id, action_kind, outcome_code} ], -- attempted, could not
  census: { per_side: {n, coverage_by_kind, access_profile} }
}
```

`SEAT-PROPOSAL` — **Q34 emits no number.** A "symmetry score" would be an invented
measurement in exactly DR-039's sense: nothing in the record has that magnitude. The
row's own remedy in the battery is *re-verify the under-checked side under the stricter
standard and log a bias event* — a work list satisfies that; a scalar does not.

#### 1.1.3 The two design hazards inside the schema

**Hazard A — stance drift.** An item admitted as supporting can end the run attacking.
Diffing on final stance measures a different thing than diffing on the stance the system
believed while it was deciding how hard to look. A motivated shortcut acts on the belief
at action time. Therefore: record both, **diff on `stance_at_action`**, and report
reclassifications as a separate line (`items_reclassified`) rather than folding them in.

**Hazard B — "blocked" is not "skipped".** A paywalled source and an unopened source
produce the same *absence of a COMPLETED open*. If the diff cannot tell them apart it
will report bias where there was an access wall, or excuse laziness as a wall. The
`outcome` enum with `BLOCKED`/`FAILED`/`SKIPPED_BY_BUDGET` as first-class members
(DR-027's "could-not-dos") is what separates them, and `blocked_not_lazy` must be served
next to the asymmetry, never inside it.

### 1.2 The instrumentation boundary — three honest classes

The ticket asks which aspects of "how hard did we check" resist instrumentation, and for
each whether a hard-fact proxy exists. Three classes, and only the third is genuinely
unmeasurable.

#### Class A — hard facts, already owed (no proxy needed)

Everything in §1.1.1. What was searched, what came back empty, what was archived, what
was opened in full versus previewed versus blocked, whether the thing opened was the
original or a summary, which spans were extracted, whether the quote survived a
character-level compare, whether an instrument's fixtures ran, whether the seven bias
domains were filled, whether a recheck reopened the locator. Each is an event with a
timestamp and a typed outcome. The symmetry claim over Class A is arithmetic and the
Hermes/Codex position is correct **for this class**.

#### Class B — real facts, weak proxies: record, never gate

Wall-clock per item, tokens per item, retry counts, number of judge passes. These are
facts (the ledger has them), but the inference *more time or more calls ⇒ a harder
check* is an assumption, not a measurement.

- `FACT` — this is the textbook Goodhart/Campbell configuration: the moment an effort
  count gates a claim, the cheapest way to satisfy the gate is to emit more actions.
  The software-engineering instance is exactly this shape: coverage is countable, so
  coverage becomes the target, and a test suite can reach 100% coverage with zero
  assertions (Sources: Goodhart/Campbell; mutation-testing literature).
- `FACT` — the closest empirical analogue for human "checking effort" does not support
  the proxy either. Bacchelli & Bird's Microsoft study found modern code review delivers
  *less* defect-finding than participants expect, with understanding the change
  consuming most of the review time — i.e. review time is dominated by comprehension,
  not by the defect-detection the metric would be standing in for. I did **not** find a
  measured negative correlation between review effort counts and defect detection, so
  the honest statement is: **the effort-count-implies-check-quality link is
  unestablished, in either direction.**
- `SEAT-PROPOSAL` — Class B fields are served in the digest as descriptive facts and are
  **barred from `symmetry_diff`'s status computation.** If V wants them to matter, they
  matter as an observation for a human, never as an automatic gate.

#### Class C — the irreducible core, and what can honestly be measured near it

Three things telemetry cannot see. This is where Grok's reservation is real, and it is
**not** repaired by asking a model how hard it tried.

**C1 — depth of reading inside an opened source.** `SOURCE_OPENED_FULL` is a fact; "read
the methods section adversarially" is not observable. *Partial hard-fact proxy exists
and is honest:* **span coverage of the load-bearing element** — did the extracted spans
(Q16) actually cover the part of the source the claim depends on (the effect size, the
population definition, the limitation paragraph), or only the abstract? That is a
recorded-span-vs-claim-element join, computable, and it is a genuinely different fact
from "opened". It does not measure attention; it measures whether the evidence for the
claim was located in the source. Recommend adopting it as its own `action_kind`
(`SPAN_EXTRACTED` with a claim-element key), not as an effort score.

**C2 — severity of interpretation under an identical checklist.** The same Q37
seven-domain form can be filled leniently for the pile you like and harshly for the pile
you don't. The telemetry is *identical* on both sides — seven of seven domains assessed —
and the substance is asymmetric. **No action count can ever detect this.** This is the
exact limit of the table diff, and it should be stated in the spec rather than papered
over.

*Is a hard-fact proxy possible?* Partially, and only as a flag:

- **Disposition-rate disparity conditional on observables.** Among items with the same
  recorded profile (same access depth, same evidence class, same fit verdict), compare
  the rate at which each side is dispositioned adversely — excluded, bounded,
  zero-weighted, capped. A difference is a measured fact about the *judgments*, not an
  introspection.
- `FACT` — but it is under-identified as a bias claim: the two piles may genuinely
  differ in quality on unobserved dimensions, and conditioning on observables does not
  license a causal reading. This is the same structure as the selective-labels problem
  (Lakkaraju et al., KDD 2017): the decisions determine which outcomes are ever
  observed, so a raw rate comparison confounds decision policy with case mix.
- `SEAT-PROPOSAL` — adopt as a **flag with a named limitation**, never as `ASYMMETRIC`
  status. It routes to a human or to a re-check; it never by itself declares bias.

**C3 — the questions not asked.** A checklist is symmetric only over the checks on it.
If the pro pile got a bespoke extra probe that never entered the closed
`action_kind` set, the diff cannot see the asymmetry. *Mitigation is structural, not
metric:* the `action_kind` set is closed and every executed check must map to a member
or be recorded as `UNCLASSIFIED_ACTION` — which is itself an `UNINSTRUMENTED` trigger.

#### The design that removes the need to measure C2

`FACT` — the discipline that discovered asymmetric scrutiny measured it by **counting
actions**, never by asking subjects whether they were being fair. Ditto & Lopez (1992):
participants required *less information* to accept a preferred conclusion; given an
unfavorable medical result they took longer to accept the test was complete, **were more
likely to retest**, and cited more irregularities that might have affected accuracy.
Taber & Lodge (2006) found a disconfirmation bias — time and cognitive resources spent
counterarguing incongruent arguments — and a confirmation bias in *source selection*
when subjects chose what to read. Both operationalizations are action counts and source
choices; neither is a self-report. **The battery's table-diff design is the same
instrument the literature uses, and the introspective alternative is the one the
literature specifically does not use.**

`FACT` — the other lever the evidence-appraisal disciplines use is **prevention by
blinding**: strip the appraiser's knowledge of which side an item favors, so identical
standards are enforced by construction rather than detected afterwards. Honest caveat:
in systematic reviews the empirical evidence on blinded-versus-unblinded risk-of-bias
assessment is *discordant*, and the current methodological reading is that blinding may
not be worth its cost for human reviewers. The cost argument does not transfer: for V3,
stance-stripping is a prompt-construction change, and the machinery already exists —
DR-019 knob 3 (blind verification for STANDARD and HIGH-STAKES), DR-013's blind
comparison, DR-029's anonymized-debate house rule.

`SEAT-PROPOSAL` — **prevention and detection are complements, not alternatives.**
Stance-blind appraisal closes C2, which the diff can never reach; the diff closes Class A,
which blinding does not (a blind appraiser can still be handed fewer con items to
appraise). Ruling only one of the two leaves a named hole.

#### Where Grok's HYBRID limb can honestly live

The merged contract already narrows it: model output `{item_id, verification_label?,
recheck_reason?}` **"only where telemetry cannot classify"** (§4.2). The survey supports
keeping a model limb *only* for **item identity and stance resolution** — deciding that
two records are the same item, or which side an item is on when the typed fields do not
settle it. That is a typed, checkable, re-runnable semantic judgment of the same kind
Q19 and Q32 already give the model. It supports **prohibiting** a model limb for
*effort grading*, for the reasons in §1.3.

### 1.3 Failure semantics — three designs when telemetry is incomplete

The question V deferred. Compared against the mission's own dead-check indictment
(DR-032: V3's disagreement flag must *demonstrably fire where V2 provably could not*)
and D1/D5.

#### Design 1 — typed `UNINSTRUMENTED` that blocks the claim

Status `UNINSTRUMENTED` when: any item in the population has zero `verification_action`
rows; or `stance_at_action` is `UNASSIGNED` for any item; or an `UNCLASSIFIED_ACTION`
exists. The symmetry *claim* is withheld; a visible marker travels on the answer.

- `FACT` — **this is the only one of the three that is unbiased when records are
  missing.** Missing telemetry is Missing Not At Random in the direction that matters:
  the reason an action record is absent is usually that the action did not happen or its
  path failed, and failing paths correlate with the side (paywalled sources cluster;
  a lazily-checked pile is precisely the pile with fewer rows). Under Rubin's (1976)
  taxonomy, MCAR/MAR missingness is ignorable and MNAR is not — with MNAR, *ignoring
  the missingness is systematically biased and imputation does not repair it.* Silent
  pass therefore declares symmetry most confidently exactly where asymmetry is worst.
- `FACT` — it has a direct precedent in formal verification. A property of the shape
  `∀ item: recorded(item) → symmetric(item)` is **vacuously true** when nothing is
  recorded — antecedent failure. Hardware verification hit this and the industry
  response was not a better threshold but a **third verdict**: vacuity detection reports
  "passed vacuously" separately from "passed" (Beer, Ben-David, Eisner & Rodeh; Kupferman
  & Vardi). `UNINSTRUMENTED` is that third verdict, and the argument for it is 25 years
  old and not controversial.
- Consequence design: `SEAT-PROPOSAL` — **cap-and-label, not halt.** The packet already
  has the pattern in DR-014 (no second lineage → serve, but cannot reach the top
  confidence band; visible reason; recorded lift condition; executing the check later
  re-scores). Apply it verbatim: the answer serves, the symmetry claim does not, the
  confidence band is capped, the lift condition is the named `remediation_targets`, and
  running them later re-scores. This preserves Grok's objection — *the check must not
  pass on missing data* — without inventing a fairness label and without a halt V has
  not asked for.
- Cost: zero tokens. One status value, one marker, one work list.
- Residual risk: `UNINSTRUMENTED` becomes the permanent state and everyone learns to
  ignore the badge. Mitigation is the liveness proof below.

#### Design 2 — model fallback that grades effort

- It converts an absence of facts into a magnitude. That is DR-028's law violated
  verbatim: *"no judgment/no magnitude ⇒ no number, ever — typed visible record
  instead."* The 0.7-for-contradicted-evidence constant was indicted for exactly this
  move (D1(d)).
- It is **self-assessment**: the system asks a model to grade how hard the system tried,
  from the record the system failed to write. `FACT` — LLM evaluators are measurably
  biased in the self-evaluation regime: self-recognition capability correlates linearly
  with self-preference strength (Panickssery et al., NeurIPS 2024), and self-enhancement
  bias is one of the four failure modes catalogued for LLM-as-judge (Zheng et al., 2023).
  There is no measurement showing an LLM can score its own diligence; there is
  measurement showing the near neighbour is biased toward itself.
- It reintroduces the thing the row exists to abolish. §4.1 states the row's purpose:
  the battery *"turns that introspective question into a procedure."* A model asked
  "was the effort comparable?" is answering the introspective question again, one level
  up.
- Cost: one call per asymmetry, plus a prompt contract, plus a rule for when the
  fallback is allowed (the brief's §4.3 already prices it).
- The narrow variant that survives: a model limb for **item identity / stance
  resolution** (§1.2), which produces a typed field the arithmetic then consumes. That
  is not effort grading and should not be labelled as if it were the same concession.

#### Design 3 — silent pass

- `FACT` — the dead-check class the mission has already indicted twice: V2's composite
  disagreement gate is recorded **un-fireable against its own data** (threshold 0.35,
  largest observed spread 0.11 across 26 nodes, `02-scoring-behavior-spec.md` §2.9), and
  DR-032 exists precisely to require V3's replacement to *demonstrably fire*. A symmetry
  check that reads absent fields and reports symmetry is the same defect with a
  friendlier face — it reports a *pass*, which is strictly worse than reporting nothing.
- `FACT` — it is MNAR-biased (above) and vacuous (above). It is the only one of the
  three designs that is wrong for two independent formal reasons.
- Cost: zero, and the cost is the point — it is what you get by default if nobody rules.
  **Design 3 is the status quo of any spec that names the check without naming its
  failure state.**

#### The comparison, one table

| | 1 — typed `UNINSTRUMENTED` | 2 — model grades effort | 3 — silent pass |
|---|---|---|---|
| Behaviour on missing records | withholds the claim, names the repair | manufactures a label | asserts symmetry |
| Bias under MNAR missingness | none (refuses to infer) | unknown, ungrounded | systematically toward "fair" |
| Vacuity | reported as a third verdict | hidden behind a number | vacuous pass presented as a pass |
| Token cost | 0 | 1 call per asymmetry + contract | 0 |
| DR-028 (no magnitude ⇒ no number) | complies | violates | violates (a pass is a claim) |
| DR-032 (must demonstrably fire) | fires, and its non-fire is visible | fires, meaninglessly | cannot fail |
| DR-039 (no invented measurement) | complies | violates | violates |
| What a user sees | "symmetry not verified — here is what is missing" | "effort comparable (model-assessed)" | nothing |

#### The liveness proof, and why it belongs in this ticket

`FACT` — code coverage cannot detect an assertion-free test; mutation testing can, and a
test with no assertions scores 0% because every mutant survives. The transferable
discipline: **a check is not accepted until it has been made to fail on purpose.**

`SEAT-PROPOSAL` — extend DR-032's "demonstrably fire" requirement to this row, as two
fixtures in V3's self-test base (which DR-033 makes the ground truth: "V3-spec property
tests… testable without any V2 vector"):

1. a recorded run with a *deliberate* asymmetry (con items previewed only, pro items
   opened full) → the gate must emit `ASYMMETRIC` with the exact `remediation_targets`;
2. a recorded run with the stamps stripped → the gate must emit `UNINSTRUMENTED`, and
   must **not** emit `SYMMETRIC`.

Neither fixture needs V2. Both are cheap. Without them the row ships in exactly the
state D5 shipped in: a name over a path nothing can reach.

### 1.4 What Q34 must never emit — the anti-theater list

1. A symmetry **score**. No magnitude exists in the record; any scalar is invented.
2. An **effort label** produced by a model (`thorough` / `cursory` / `adequate`).
3. A **pass** derived from fields that are absent.
4. An **average** over sides. The battery's remedy is to raise the under-checked side to
   the stricter standard; an average is precisely the "warned-about bias averaged away"
   move the merged contract forbids for Q37 and it is no better here.
5. A **time or token comparison** presented as a fairness verdict (Class B).

---

## Subject 2 — Per-model capability/bias scorecards and routing

V's new direction (DR-039), extending DR-026's outcome-fed judge weighting. Everything
below is constrained by three of V's own laws: no invented measurement (DR-039), no
number without a judgment behind it (DR-028), and the replay law — **V3 permanently
refuses to serve a number it cannot recompute from its frozen records, with no AI in the
replay** (DR-034). The third is the sharpest: a scorecard is a served number, so a
scorecard must be a *pure function of the ledger*. Any smoothing constant, prior, or
learning rate must be a recorded input, printed where used.

### 2.1 What can honestly be measured — two tiers with a wall between them

The single most useful structural finding: **the quantities split cleanly into those
that need settled outcomes and those that do not**, and conflating them is how a
scorecard turns into theatre.

#### Tier 1 — Process facts. Available from run one; not capability.

Computable from the execution ledger (DR-027) with no ground truth whatsoever:

| Quantity | Computed from | Already exists in V2? |
|---|---|---|
| Schema-compliance / parse-failure rate | `parse_status` on every persisted judge artifact | **yes** — artifacts persisted parseable or not (§2.6) |
| Provider error / timeout rate | the two typed failure paths | **yes** (§2.11) |
| Latency, cost per node | allow-listed provider metadata (`usage`, tokens) | **yes** (§3.2) |
| Determinism / self-consistency | same input hash re-run at temperature 0 | input hash exists (§3.3) |
| Position-swap flip rate | A/B order swapped, same pair | new, cheap |
| Self-preference delta | score given to an artifact blind vs. attributed | new, cheap |
| Abstention rate per class + which of the five typed kinds | Stage-10 typed abstentions | new (typed set exists in the battery) |
| Dispersion vs the panel | `spread = max(signal) − min(signal)` | **yes** (§2.9) |
| Silent-drop rate | judgments discarded for schema failure | **yes, and indicted** — currently unannotated (§2.9) |

`FACT` — the bias half of "capability/bias scorecard" is almost entirely Tier 1. Position
bias, verbosity bias and self-enhancement bias are the catalogued LLM-judge failure modes
(Zheng et al., 2023) and each has a measurement protocol that needs no outcome: swap the
order; length-control the pair; blind the attribution. Panickssery et al. (2024) measured
self-preference as a *delta* under exactly that protocol. **V can have a truthful bias
scorecard on day one. V cannot have a truthful capability scorecard on day one.**

#### Tier 2 — Capability facts. Require Stage-11 settled outcomes.

| Quantity | Definition | Honest reporting requirement |
|---|---|---|
| **Hit rate** per (model, task class) | resolved-correct / settled | `n`, Wilson interval, and the *share of the class that never settles* |
| **Brier score** + Murphy decomposition | `Brier = REL − RES + UNC` | report all three terms, not the total |
| **Calibration curve** | binned reliability | declared binning + acknowledged estimator bias |
| **Conditional-right-when-disagreeing** | accuracy restricted to items where lineages split | the only disagreement quantity that is skill |
| **Risk–coverage curve / AURC** | error vs. fraction answered | mandatory whenever abstention rates differ |

Four hard facts that constrain how these may be served:

1. `FACT` — **the Murphy decomposition is what makes cross-class comparison honest.**
   Brier decomposes additively into reliability (are the probabilities truthful),
   resolution (do they discriminate) and uncertainty (how hard is the class — a property
   of the *questions*, not the model). A model that looks weak on causal questions and
   strong on lookups may differ only in `UNC`. Serving a bare Brier per class invites
   exactly that misreading. Brier and the log score are strictly proper (Gneiting &
   Raftery), so reporting them cannot be gamed by shading probabilities.
2. `FACT` — **ECE is a biased, binning-dependent estimator.** The standard binned
   estimator is biased and inconsistent; debiased estimators exist (Kumar, Liang & Ma,
   2019) and equal-mass binning consistently outperforms equal-width (Roelofs et al.,
   2022). Under DR-039, a served "ECE = 0.07" with no declared binning is an invented
   measurement in presentation even where the underlying data is real.
3. `FACT` — **hit rate is corrupted by abstention.** A model that declines the hard 40%
   posts a higher hit rate on the 60% it answers. Selective prediction's answer is the
   risk–coverage curve and its area (AURC): compare at matched coverage or compare
   curves. Given the battery prices abstention explicitly (DR-010/011/012), V3 will have
   *systematically different* coverage per model and per class, so this is not an edge
   case — it is the normal case.
4. `FACT` — **small-n reporting is where anti-theater bites hardest.** Recomputed here
   (Wilson score interval, z = 1.95996): `4/4 → [0.510, 1.000]`; `2/5 → [0.118, 0.769]`;
   `30/40 → [0.598, 0.858]`. The Wald interval is unreliable enough at these sizes that
   Brown, Cai & DasGupta (2001) recommend retiring it; they recommend Wilson or Jeffreys
   for n ≤ 40 and Agresti–Coull above. **Every scorecard cell must carry `n` and an
   interval, and a cell whose interval spans the decision boundary must not drive a
   decision.**

#### The scorecard cell shape

```
scorecard_cell {
  model_id, model_version, provider     -- version REQUIRED (see guard G3)
  task_class                            -- from the battery's own question taxonomy
  metric, value, n, interval, as_of
  population: { settled, unsettled, permanently_unscoreable, abstained }
  basis: MEASURED_OUTCOME | MEASURED_PROCESS | EXTERNAL_BENCHMARK | NONE
}
```

`SEAT-PROPOSAL` — `basis` has **no `ASSUMED` and no `DEFAULT` member**, exactly as
DR-017 built `weight_source ∈ {owner_elicited, org_policy, none}` with no "default"
member. `NONE` renders as "not measured" and never as a middle number — D1's law
(DR-028) applied to scorecards.

### 2.2 Deriving the scorecards from Stage-11 outcome memory

The chain exists in the battery already; nothing new is needed except the store.

```
Q59  validate resolution event + EXTERNAL resolver + scoreability
     → PERMANENTLY_UNSCOREABLE where no external resolver exists
Q60  persist {answer, prior, posterior, basis, resolver, date, provenance},
     read back, verify another actor can open it   (MACHINE, unanimous)
DR-015 wake-ups / DR-016 review clocks  ← the machinery that makes settlement day arrive
Q61  ingest typed outcome → apply a REGISTERED PROPER SCORE → update and VERSION
     the calibration and the class prior
DR-026  those versioned weights become the real judge weights
```

Five consequences that are not obvious and that the spec chapter needs:

1. **DR-016 is what keeps the denominator honest.** Retirement is *archival* — "full
   graph kept, auto-revived by next query, nothing deleted." If retirement deleted, the
   settled population would be biased toward recently-queried questions and every hit
   rate would be a survivorship statistic. The liveness ruling is load-bearing for the
   scorecards, not just for the graph.
2. **DR-015 forces the score key to be the answer *version*.** An answer can be woken,
   re-judged and changed after it was recorded. Scoring must key on
   `(answer_id, answer_version, as_of)`; scoring the question would let a later revision
   silently rewrite history.
3. **The scoreable subpopulation is not the population, and the gap is measurable.**
   Q59 marks value choices `PERMANENTLY_UNSCOREABLE` *by design* ("for a value choice
   this is expected, not a defect"). So capability numbers describe the resolvable
   subset only, and the share excluded is itself a recorded count that must be served
   next to every cell. `FACT` — this is the selective-labels structure again (Lakkaraju
   et al., 2017): what gets observed is decided upstream.
4. **The weighting mechanism should have exactly one declared parameter.** Two honest
   options, both pure functions of the ledger:
   - *Multiplicative weights / Hedge over measured cumulative proper-score loss.* One
     parameter (learning rate η), and a stated worst-case regret of order √(T log M)
     against the best single judge in hindsight (Cesa-Bianchi & Lugosi). The guarantee
     is what distinguishes it from a hand-tuned weight.
   - *Empirical-Bayes shrinkage of a per-(model, class) rate toward that model's pooled
     rate*, where the shrinkage factor is **estimated from the measured between-class
     variance** (James–Stein / Efron–Morris). No invented prior: the prior is the
     system's own pooled data. At t=0 there is no pooled data, so there is no cell —
     which is the correct behaviour, not a limitation.
   `SEAT-PROPOSAL` — shrinkage for the *reported* number, Hedge for the *judge weight*;
   both parameters printed where used, per the naked-constant law in `32-weight-derivation.md`.
5. **DR-034 forbids a scorecard that cannot be recomputed.** No moving average with a
   forgotten window, no model in the loop, no "we retrained the router" without the
   training set frozen. This is a real constraint on design space and it deletes several
   otherwise attractive options.

#### How much data is needed — the number V should see first

`FACT` — recomputed here (two-proportion sample size, two-sided α = 0.05, power 0.80,
standard normal-approximation formula, values printed so it is checkable):

| To distinguish | Settled, resolved items **per model per class** |
|---|---:|
| 60% vs 80% | **81** |
| 70% vs 80% | **293** |
| 75% vs 80% | **1,094** |
| 78% vs 80% | **6,510** |

`FACT` — and the winner's-curse correction, Monte-Carlo, 20,000 trials, seed 7:
take 8 models × 12 task classes = 96 cells, **all truly identical at 0.70**, with 50
settled items each. The mean of the maximum observed cell is **0.852**, and in **50.4%**
of trials some cell reads ≥ 0.86. A scorecard that ranks cells will therefore report a
15-point "best model for this class" advantage roughly half the time *when no advantage
exists at all*.

This pair of results is the quantitative spine of the cold-start answer in §2.4 and of
guards G4/G5 below.

### 2.3 Routing options and feedback guards

#### The five options, weakest commitment first

| | Option | What consumes the scorecard | Feedback loop | Note |
|---|---|---|---|---|
| **R0** | Publish only | a human reading the digest | none | zero benefit, zero risk |
| **R1** | **Tie-break only** | choice already fixed by lineage (DR-013/029), availability, cost ceiling; scorecard breaks exact ties | negligible | smallest honest step |
| **R2** | **Weighting, not selection** | the judge weight (DR-026 as already ruled) | **none** | see below |
| **R3** | Soft routing + forced exploration | the assignment, with ε randomized and propensities logged | contained | needs off-policy machinery |
| **R4** | Hard routing | the assignment, deterministically | **guaranteed degenerate** | best cost, worst measurement |

**The architectural finding V should weigh above all others: R2 has no feedback problem
at all.** Under weighting every model still runs on every class, so every model keeps
generating observations everywhere; only its *influence* changes. Under routing the
unrouted model stops producing data on that class forever. **Weighting preserves the
data-generating process; routing destroys it.** DR-026 already ruled weighting; routing
is the strictly harder ask, and it is harder specifically because it breaks the
measurement that justifies it.

`FACT` — the formal statement of V's worry is standard and unfavourable. A deterministic
logging policy violates the common-support assumption that off-policy estimators rely on:
with no probability of taking the unrouted action, the counterfactual is not merely noisy
but **unidentified** — nothing in the logs can estimate what the model you stopped using
would have done. The literature's answer is not cleverer estimation; it is *randomize a
little and log the propensity.*

`FACT` — the degenerate case is documented in deployed systems. Ensign et al. (2018)
prove the runaway feedback loop for predictive policing: a system trained on the data its
own allocations generate returns to the same allocations "regardless of the true rate,"
and they show the fix is changing what is fed back, not tuning the model. Lakkaraju et
al. (2017) is the same structure at the level of labels.

#### The guard set

- **G1 — Separate the measurement lane from the serving lane.** `SEAT-PROPOSAL`, and the
  most packet-native option available: V3 already runs a cross-lineage judge panel and
  already requires an independent critic (Q39, Q42, DR-013, DR-029's skeptic
  certification). **Route the served lane; keep the panel lane uniform.** Compute
  scorecards from the panel lane, which never routes. Selection then cannot starve
  measurement, because measurement does not come from selection. Cost is explicit and
  nameable: panel calls continue on classes the router has abandoned.
- **G2 — A non-zero exploration floor with logged propensities**, if any routing touches
  the served lane. ε per class, recorded per decision, never zero for a live class.
  Without it, G4's intervals stop updating and the scorecard silently freezes.
- **G3 — Version-pinned model identity.** A cell keyed to "the provider's current model"
  is keyed to nothing: a silent provider update invalidates the history while the label
  stays the same. `model_version` + `as_of` are required, and DR-015's staleness
  machinery should apply to scorecard cells exactly as it applies to answers (a version
  change is a revision trigger that wakes the cell).
- **G4 — Minimum-n gate and an overlap rule.** A cell may influence a decision only above
  a declared `n`, and when two candidates' intervals overlap the router **falls back to
  the prior rule** rather than picking the point estimate. `FACT` — the public precedent
  is instructive: Chatbot Arena publishes bootstrap 95% intervals and top models
  routinely sit inside overlapping intervals, so their rank order is partly noise.
- **G5 — Multiplicity control across cells.** With (models × classes) cells, the maximum
  is optimistically biased by construction — quantified in §2.2 at 0.852 expected max
  from 96 truly-equal cells. Either a declared minimum effect size or an FDR-style
  correction, and never a leaderboard of point estimates.
- **G6 — The CROSS/critic lane is exempt from scorecard routing.** Independence is a
  *structural* requirement (DR-013 different-maker rule; DR-029's anonymized debate and
  skeptic certification), not a quality one. Routing critique to "the best critic"
  converges the panel onto one lineage and destroys the property DR-014 exists to
  protect. This guard is cheap and, once stated, obvious; unstated, it is the most
  likely way a routing feature quietly deletes a ratified requirement.
- **G7 — No self-routing.** A model may not supply the inputs that score itself
  (self-preference bias is measured, §2.1).
- **G8 — Route on the class, not on the item's expected answer.** Routing conditioned on
  content the model is about to judge is a channel by which selection can encode the
  conclusion. Task class comes from LOCK/ROUTE (Q7/Q8), which are typed and upstream.

### 2.4 Cold start under the anti-theater principle

V's framing is exactly right and the D5 history proves it: *"constant weights
masquerading as calibration."* The precise reading matters, because it determines what
the fix is.

`FACT` — read the indictment carefully. V2's `calibration.py` **labelled its weights
honestly**: `source` is `"cold_start"` or `"config_override"`, *never* `"learned"`
(§2.9), and the served composition note literally says
`modelWeight=constant-1.0(P8)`. The label was true. What DR-026 indicts is that
*the path out was unreachable* — hardcoded `config=None`, so every judge counted 1.0
forever no matter what happened. **The defect was not the initial value. It was the
absence of an exit.**

`SEAT-PROPOSAL` — therefore the cold-start requirement is not a better starting number.
It is a **demonstrated exit**, specified as an acceptance test in DR-032's own shape
("V3 must demonstrably fire where V2 provably could not"): inject one synthetic settled
outcome, flow it Q59 → Q60 → Q61 → scorecard → weight, and assert the weight **moves off
its cold value**, with the whole path replayable under DR-034. A calibration mechanism
that cannot be shown to move is D5 with new code.

What may honestly be claimed at t = 0:

1. **Nothing about task capability from the system's own data.** `basis: NONE`, rendered
   as "not measured". The router must then behave *exactly* as it would with no
   scorecard at all — falling back to the declared non-scorecard rule (lineage
   independence, availability, cost ceiling). Anything else is the scorecard acting
   while claiming not to.
2. **Uniform weights are permissible if and only if they are labelled uniform and are
   not called calibration.** V2 was right about this and wrong about the exit. The word
   "calibration" may not appear on a quantity that has never seen an outcome.
3. **Tier-1 process facts are claimable immediately** (§2.1) — parse-failure rate,
   timeout rate, cost, latency, determinism, position-swap flip rate, self-preference
   delta, abstention rate by typed kind, panel dispersion. These are real measurements of
   real behaviour. They must be visibly labelled as *process*, and the scorecard must
   state in its own text that process reliability is not task capability.
4. **External benchmarks: displayable with declared provenance, never silently
   numeric.** `FACT` — the provenance caveat is not hypothetical. *The Leaderboard
   Illusion* documents undisclosed private variant testing with selective disclosure of
   the best score (27 private Llama-4-era variants in one case), asymmetric sampling
   rates, and a contamination effect where training on 70% Arena data more than doubled
   ArenaHard performance (23.5% → 49.9%) **without transfer to MMLU** — i.e. a headline
   number that moved without the underlying capability moving. `SEAT-PROPOSAL` —
   external numbers may be *shown* with (benchmark, version, date, exact model version,
   who ran it, scoring script) and a declared non-transfer caveat; may at most seed a
   tie-break (R1); and may **never** be converted into a coefficient inside V3's scoring
   math, because that lets another population's measurement act as if it were this
   system's.
5. **No invented prior.** A prior is legitimate when it is a *measured pooled quantity*
   from this system (§2.2 option 2). At t = 0 there is no pooled quantity, so the honest
   object is an absent cell, not 0.5. This is D1 (DR-028) restated for scorecards.
6. **A stated time-to-signal.** From §2.2: ~293 settled items per model per class to
   detect a 10-point difference, ~1,094 for 5 points; and 96 truly-equal cells at n = 50
   will still exhibit an apparent 15-point best cell half the time. `SEAT-PROPOSAL` —
   the spec should print this so nobody later reads an early leaderboard as knowledge.

One legitimate pre-outcome capability estimator exists and should be named rather than
silently omitted. `FACT` — Dawid & Skene (1979) estimate per-rater error rates **without
any gold standard**, from the disagreement pattern alone, via EM over per-rater confusion
matrices. It would let V3 form a weak capability signal from panel disagreement before
any outcome settles. Its assumption is conditional independence of raters given the truth
— which same-lineage models violate, and which DR-013's bright-line lineage rule is
exactly the tool for detecting. `SEAT-PROPOSAL` — worth listing as a *later* option
behind a precondition, in `32-weight-derivation.md`'s "what to add later" style; not a
cold-start claim, because its output is an estimate under an assumption V has not ruled
on. *(Speculation: whether cross-lineage panels in V3 will be independent enough for the
assumption to hold is an empirical question no data in this packet answers.)*

Finally, the reporting form is a solved problem and should be borrowed rather than
invented. `FACT` — Model Cards (Mitchell et al., 2019) specify intended use, factors,
metrics, **evaluation data**, quantitative analyses disaggregated by group, and caveats,
and explicitly flag the need for confidence intervals on disaggregated metrics; HELM
(Liang et al., 2022) fixes a declared scenario × metric taxonomy and *names what is
missing or underrepresented*. Both are the anti-theater discipline in publication form:
declare the population, disaggregate, carry intervals, state the gaps.

---

## Sharp V questions

Each is one decision. Numbered for the resumed theme-4 sitting (ticket 22) and the
spec's routing chapter.

**Subject 1 — symmetry**

1. **Does Q34 emit a scalar?** (a) No — the row outputs only the census, the applied-kinds
   set difference, and the `remediation_targets` work list *(seat recommendation)*;
   (b) yes, and V names the scalar and the hard facts behind it.
2. **Are the two new ledger stamps ordered?** `subject_item_id` and `stance_at_action` on
   every `verification_action` row. Without both, Q34 *and* the unanimously-MACHINE Q46
   ("join verification effort") are dead checks. (a) order both; (b) order neither and
   record Q46 as knowingly non-executable.
3. **Which stance does the diff use?** (a) `stance_at_action`, with reclassifications
   reported separately *(seat recommendation)*; (b) final stance; (c) both, served side
   by side.
4. **Is per-item verification telemetry a correctness row or enrichment?** Under DR-030
   knob 9 correctness rows can never be budget-skipped. (a) correctness — never skippable;
   (b) enrichment — skippable with the visible `SKIPPED_BY_BUDGET` marker.
5. **What does `UNINSTRUMENTED` do to the answer?** (a) cap-and-label on the DR-014
   pattern — serve, cap the band, name the lift condition, re-score when the missing
   checks run *(seat recommendation)*; (b) halt the serve; (c) label only, no cap.
6. **Is a model ever allowed near this row?** (a) never — no model limb at all;
   (b) item-identity/stance resolution only, effort grading prohibited outright *(seat
   recommendation, and the honest home for Grok's reservation)*; (c) effort grading
   permitted as the brief's fallback.
7. **Prevention as well as detection?** Adopt stance-blind evidence appraisal (strip the
   side label from the appraisal prompt) alongside the post-hoc diff — the only thing
   that reaches boundary class C2. (a) both; (b) diff only; (c) blinding only.
8. **Disposition-rate disparity conditional on observables** — adopt as a measured flag
   that routes to re-check, with its under-identification stated? (a) adopt as flag;
   (b) reject as under-identified; (c) defer to outcome data.
9. **Liveness fixtures as an acceptance gate.** Must every symmetry gate ship with a
   deliberate-asymmetry fixture that makes it fire *and* a stripped-telemetry fixture that
   makes it emit `UNINSTRUMENTED`, before the row counts as implemented? (a) yes, extend
   DR-032 to this row *(seat recommendation)*; (b) no.

**Subject 2 — scorecards and routing**

10. **Two-tier scorecard with a hard wall?** Process facts (no ground truth) and
    capability facts (settled outcomes) never mixed in one number, with
    `basis ∈ {MEASURED_OUTCOME, MEASURED_PROCESS, EXTERNAL_BENCHMARK, NONE}` and **no
    `ASSUMED`/`DEFAULT` member**, on the DR-017 precedent. (a) adopt; (b) single tier.
11. **Does routing touch the served lane in v1 at all?** (a) weighting only — DR-026 as
    ruled, no selection *(seat recommendation: weighting preserves the data-generating
    process, routing destroys it)*; (b) tie-break only; (c) soft routing with an
    exploration floor; (d) hard routing.
12. **If any routing ships, is an exploration floor with logged propensities mandatory?**
    (a) yes, ε > 0 per live class, propensity recorded per decision; (b) no — accept a
    deterministic router and accept that the counterfactual becomes unidentified.
13. **Separate measurement lane from serving lane?** Route the served lane; keep the
    cross-lineage panel uniform and compute scorecards from it. (a) adopt, and price the
    continuing panel calls *(seat recommendation)*; (b) reject — measure from the served
    lane only.
14. **Is the CROSS/critic lane exempt from all scorecard routing** on the grounds that
    independence (DR-013/DR-029) is structural, not a quality property? (a) exempt;
    (b) routable.
15. **Minimum-n gate and overlap rule.** What `n` may influence a decision, and what
    happens when two candidates' intervals overlap — (a) fall back to the prior rule
    *(seat recommendation)*; (b) take the point estimate; (c) randomize between them.
16. **External benchmarks.** (a) displayable with full declared provenance and a
    non-transfer caveat, tie-break eligible, never a coefficient *(seat recommendation)*;
    (b) barred entirely; (c) admissible as a numeric prior.
17. **Model identity and staleness.** Does a provider's silent model update invalidate
    the cell — i.e. are `model_version` + `as_of` required keys, and does a version change
    fire a DR-015 revision trigger on the scorecard? (a) yes; (b) no, keep cells keyed to
    the model name.
18. **Cold-start exit proof.** Does the spec require an acceptance test showing a weight
    moving off its cold value under one synthetic settled outcome, replayable end to end
    under DR-034? (a) yes — DR-032's shape applied to calibration *(seat recommendation:
    this, not a better starting number, is what D5 actually demands)*; (b) no.
19. **Scorecards under the replay law.** Are scorecards "served numbers" in DR-034's
    sense, so no un-recorded smoothing window, no model in the loop, no unfrozen training
    set? (a) yes, fully; (b) scorecards are internal-only and exempt.

---

## Sources

### Local (read-only, this repo)

- `.../wayfinder/decisions-ledger.md` — DR-013 (lineage bright line), DR-014 (cap+label+lift path — the pattern proposed for `UNINSTRUMENTED`), DR-015/016 (staleness, wake-ups, archival retirement), DR-024 (Postgres, observability layer), DR-026 (D5, outcome-fed judge weighting), DR-027 (execution ledger: everything executed recorded, including failures), DR-028 (no judgment/no magnitude ⇒ no number), DR-029 (eight house rules), DR-030 (composition; knobs 9–10 budget law and visible markers), DR-032 (the dead check must demonstrably fire), DR-033 (V3 self-test base + literature vectors), DR-034 (replay law), DR-038/DR-039 (this ticket's commission)
- `.../research/02-scoring-behavior-spec.md` — §2.6 unconditional raw-artifact persistence and typed failure paths; §2.9 calibration weights labelled `cold_start`/`config_override` and never "learned"; the un-fireable composite disagreement gate (threshold 0.35 vs largest observed spread 0.11 across 26 nodes); §2.9 silent drop of schema-invalid panel judgments; §3.2–3.3 artifact identity and input hash
- `.../research/04-node-graph-data-model.md` — WEIGH gap 3: "No symmetry-of-scrutiny record (Q34). Nothing records how hard each side was examined"; gap 4: V2 can assert but not demonstrate "I have nothing to calibrate against"
- `.../research/05-battery-coverage-matrix.md` — row gists and dispositions for Q15–Q17, Q19, Q23, Q32–Q37, Q40, Q46, Q59–Q62
- `.../research/06-contested-decision-briefs.md` §4.1–4.5 — the Theme-4 dispute, the seat positions, the `{item_id, verification_label?, recheck_reason?}` "only where telemetry cannot classify" contract, and the failure-mode table this document extends
- `.../research/18-activation-table.md` — the four activation states (ACTIVE / INACTIVE / WAIT / POLICY_BLOCKED) and the principle that a missing input must never be filled by a model call; Q34's trigger `evidence_on_both_sides`
- `.../research/32-weight-derivation.md` — S12: verification effort is "a GATE plus a typed `UNINSTRUMENTED` state that blocks rather than passes… Do not let effort become a multiplier on strength"; the derivable-vs-V-policy split; the naked-constant printing law; row 6 of "what to add later": learned calibration requires a Stage-11 outcome store
- `.../logs/codex-mapreview.log` (this mission) — the merged per-row machine contracts quoted in §1.0 (Q15 line 271, Q16 line 272, Q17 line 273, Q19 line 275, Q23 line 284, Q32 line 303, Q33 line 304, Q34 line 305, Q35 line 306, Q37 line 308, Q40 line 316, Q46 line 327, Q59 line 350, Q60 line 351, Q61 line 352)

### Asymmetric scrutiny — how the phenomenon is actually measured

- Ditto & Lopez, *Motivated Skepticism: Use of Differential Decision Criteria for Preferred and Nonpreferred Conclusions*, JPSP 63:568–584 (1992) — https://fbaum.unc.edu/teaching/articles/jpsp-1992-Ditto.pdf — less information required to accept a preferred conclusion; unfavorable results produced longer acceptance times, **more retest requests**, and more cited irregularities. The operationalization is action counts, not self-report
- Taber & Lodge, *Motivated Skepticism in the Evaluation of Political Beliefs*, AJPS (2006) — https://fbaum.unc.edu/teaching/articles/AJPS-2006-Taber.pdf — disconfirmation bias (time and resources spent counterarguing incongruent arguments); confirmation bias in self-selected sources; polarization strongest among the most sophisticated
- Blinded vs unblinded risk-of-bias assessment in systematic reviews — https://pubmed.ncbi.nlm.nih.gov/21901737/ — findings **discordant**; blinding may not be worth its cost for human reviewers (the cost argument does not transfer to a machine pipeline)
- AHRQ Methods Guide, *Assessing the Risk of Bias in Systematic Reviews of Health Care Interventions* — https://www.ncbi.nlm.nih.gov/books/NBK519366/ — the same-instrument-to-every-study discipline

### Missing data, vacuity, and checks that cannot fail

- Rubin, *Inference and Missing Data*, Biometrika 63 (1976) — MCAR / MAR / MNAR; MCAR and MAR are ignorable, **MNAR is not**, and imputation does not repair it. Summary of the taxonomy: https://bookdown.org/mwheymans/bookmi/missing-data-mechanisms.html
- Beer, Ben-David, Eisner & Rodeh, *Efficient Detection of Vacuity in Temporal Model Checking*, Formal Methods in System Design 18(2):141–163 (2001) — https://www.cs.toronto.edu/~chechik/courses05/csc2108/beer01.pdf — antecedent failure; a formula true "trivially" because its precondition is never satisfied; the response is a separate reported verdict
- Kupferman & Vardi, *Vacuity Detection in Temporal Model Checking* — https://link.springer.com/chapter/10.1007/3-540-45719-4_11
- Mutation testing vs coverage — https://en.wikipedia.org/wiki/Mutation_testing ; https://journal.optivem.com/p/code-coverage-vs-mutation-testing — an assertion-free test reaches full coverage and scores 0% mutation: coverage cannot detect a check that cannot fail
- Goodhart / Campbell / the cobra effect — https://psychsafety.com/goodharts-law-campbells-law-and-the-cobra-effect/ ; software-metric instance: https://codepulsehq.com/guides/goodharts-law-engineering-metrics
- Bacchelli & Bird, *Expectations, Outcomes, and Challenges of Modern Code Review*, ICSE 2013 — https://research.tudelft.nl/en/publications/expectations-outcomes-and-challenges-of-modern-code-review/ — review finds fewer defects than expected; comprehension dominates review time. (Cited only for that; no measured effort-vs-defect correlation was found either way)
- Recorded-vs-performed divergence in checklist regimes ("pencil whipping") — trade literature, not peer-reviewed: Ludwig, *The Anatomy of Pencil Whipping*, Professional Safety (2014) — https://aeasseincludes.assp.org/professionalsafety/pastissues/059/02/F3_VPLudwig_0214.pdf — includes the observed case of compliance cards reporting no one walking under suspended loads while a verification walk-through found nearly all workers doing so

### Scorecard measurement

- Brown, Cai & DasGupta, *Interval Estimation for a Binomial Proportion*, Statistical Science (2001) — http://www.acsu.buffalo.edu/~cxma/STA517/Interval%20Estimation%20for%20Binomial%20Proportion-StatSci.pdf — Wald recommended for retirement; Wilson/Jeffreys for n ≤ 40, Agresti–Coull above
- Murphy's Brier decomposition (REL − RES + UNC), modern treatment: Siegert, *Simplifying and generalising Murphy's Brier score decomposition*, QJRMS (2017) — https://ore.exeter.ac.uk/articles/journal_contribution/Simplifying_and_generalising_Murphy_s_Brier_score_decomposition/29748851/1/files/56771708.pdf ; Bröcker, *Decompositions of Proper Scores* — https://pure.mpg.de/rest/items/item_2220390/component/file_2220389/content
- Kumar, Liang & Ma, *Verified Uncertainty Calibration*, NeurIPS 2019 — https://arxiv.org/abs/1909.10155 — plugin ECE is biased; debiased estimator
- Roelofs, Cain et al., *Mitigating Bias in Calibration Error Estimation*, AISTATS 2022 — https://proceedings.mlr.press/v151/roelofs22a/roelofs22a.pdf — equal-mass binning consistently outperforms equal-width
- Selective prediction / risk–coverage / AURC: Geifman & El-Yaniv, *SelectiveNet*, ICML 2019 — http://proceedings.mlr.press/v97/geifman19a/geifman19a.pdf ; Kamath, Jia & Liang, *Selective Question Answering under Domain Shift* — https://arxiv.org/pdf/2006.09462
- Dawid & Skene, *Maximum Likelihood Estimation of Observer Error-Rates Using the EM Algorithm*, JRSS-C 28:20–28 (1979) — per-rater error rates with **no gold standard**, under conditional independence of raters given the truth

### LLM-judge bias (measurable without outcomes)

- Zheng et al., *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*, NeurIPS 2023 — https://arxiv.org/pdf/2306.05685 — position bias, verbosity bias, self-enhancement bias, limited reasoning; GPT-4 agreement with humans > 80%
- Panickssery, Bowman & Feng, *LLM Evaluators Recognize and Favor Their Own Generations*, NeurIPS 2024 — https://arxiv.org/pdf/2404.13076 — linear correlation between self-recognition capability and self-preference strength
- Chiang et al., *Chatbot Arena: An Open Platform for Evaluating LLMs by Human Preference* (2024) — https://arxiv.org/pdf/2403.04132 — Bradley–Terry with bootstrap confidence intervals

### Routing, feedback loops, and exploration

- *The Leaderboard Illusion* (2025) — https://arxiv.org/abs/2504.20879 — undisclosed private variant testing with selective disclosure; asymmetric sampling; training on 70% Arena data raised ArenaHard 23.5% → 49.9% **without MMLU transfer**
- RouteLLM (LMSYS) — https://github.com/lm-sys/routellm — the project reports up to 85% cost reduction at ~95% of GPT-4 performance on MT-Bench (project's own claim, not independently verified here)
- RouterBench (Martian) — https://withmartian.com/post/introducing-routerbench — 405k precomputed inference outcomes, 11 LLMs, 8 datasets; the premise that no single model dominates across task classes
- *Learning to Route LLMs from Bandit Feedback* — https://arxiv.org/pdf/2510.07429 ; *LLM Routing with Dueling Feedback* — https://arxiv.org/html/2510.00841 — routing as a contextual (dueling) bandit; Thompson sampling / LinUCB / ε-greedy
- Off-policy evaluation under deterministic logging: *Logging Policy Design for Off-Policy Evaluation* — https://arxiv.org/pdf/2605.15108 ; *Off-Policy Evaluation for Ranking Policies under Deterministic Logging Policies* — https://arxiv.org/html/2603.21485 — the common-support requirement; a fully deterministic logging policy leaves under-explored actions unevaluable
- Ensign, Friedler, Neville, Scheidegger & Venkatasubramanian, *Runaway Feedback Loops in Predictive Policing*, FAT* / PMLR v81 (2018) — https://arxiv.org/pdf/1706.09847 — a system fed its own allocation-generated data returns to the same allocations regardless of the true rate; the fix is changing the feedback, not the model
- Lakkaraju, Kleinberg, Leskovec, Ludwig & Mullainathan, *The Selective Labels Problem*, KDD 2017 — https://www.kdd.org/kdd2017/papers/view/the-selective-labels-problem-evaluating-algorithmic-predictions-in-the-pres
- Cesa-Bianchi & Lugosi, *Prediction, Learning, and Games* (2006) — the Hedge/exponential-weights forecaster; regret O(√(T log M)) against the best expert in hindsight — https://www.semanticscholar.org/paper/Prediction,-learning,-and-games-Cesa-Bianchi-Lugosi/0538e399046c74d95124c715760aa51ab4716dce
- Efron & Morris, *Stein's Paradox in Statistics* — https://www.researchgate.net/publication/247647698_Stein's_Paradox_in_Statistics — shrinkage toward a pooled mean dominates raw per-cell estimates for ≥ 3 cells; the empirical-Bayes route to a prior that is measured rather than invented

### Reporting form

- Mitchell et al., *Model Cards for Model Reporting*, FAT* 2019 — https://arxiv.org/pdf/1810.03993 — nine sections including intended use, factors, metrics, **evaluation data**, disaggregated quantitative analyses, caveats; explicit call for confidence intervals on disaggregated metrics
- Liang, Bommasani, Lee et al., *Holistic Evaluation of Language Models* (HELM), 2022 — https://friedeggs.github.io/files/helm.pdf — declared scenario × metric taxonomy, multi-metric by construction, and an explicit statement of what the taxonomy does not cover

### Computed in this session (formulas and parameters stated so each is checkable)

- Wilson score intervals, z = 1.959964: `4/4 → [0.510, 1.000]`; `2/5 → [0.118, 0.769]`; `3/4 → [0.301, 0.954]`; `30/40 → [0.598, 0.858]`; `20/40 → [0.352, 0.648]`
- Fisher exact, two-tailed, 4/4 vs 2/5 = **0.167** — a "100% vs 40%" per-side coverage gap at these counts is an exact census fact about the run and is **not** statistical evidence about the process
- Two-proportion sample size (two-sided α = 0.05, power 0.80): 60 vs 80% → **81**/arm; 70 vs 80% → **293**/arm; 75 vs 80% → **1,094**/arm; 78 vs 80% → **6,510**/arm
- Winner's curse, Monte Carlo (20,000 trials, seed 7): 96 cells all truly 0.70 with n = 50 each → mean maximum observed cell **0.852**; some cell reads ≥ 0.86 in **50.4%** of trials
