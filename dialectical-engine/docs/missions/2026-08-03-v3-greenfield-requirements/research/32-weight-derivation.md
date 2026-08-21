RESEARCH HANDOFF COMPLETE

# 32 — Weight derivation & value-weight elicitation

Commissioned by V in the ticket-13 sitting, 2026-08-03. Feeds ticket
[13](../wayfinder/issues/13-value-weight-ownership.md) (resumed sitting), themes
[22](../wayfinder/issues/22-theme4-evidence-appraisal.md)/[25](../wayfinder/issues/25-theme7-recomposition.md),
and composition [28](../wayfinder/issues/28-battery-carryover-composition.md).

Read-only inputs used: `02-scoring-behavior-spec.md` (exact V2 math),
`04-node-graph-data-model.md` (shapes + WEIGH/COMPOSE gaps),
`06-contested-decision-briefs.md` themes 4 and 7, and
`../../2026-08-02-battery-llm-vs-machine/upstream/human-plan.md` (Q26–Q50, the
nine rules, the four indicted defects). Literature cited in `## Sources`.

Every number in this document that is presented as a fact about the arithmetic
was **recomputed from the formulas in `02-scoring-behavior-spec.md` §1.2**, not
copied. The reproduction script is disposable and was not committed. Anything
not computed or cited is labelled *(speculation)*.

---

## The three slots a "weight" can occupy — read this before the table

V's ask is *"dynamic, position-aware node weighting — a stranded leaf is not a
well-supported node."* Before options can be compared, the ask has to be located,
because a DF-QuAD-family engine has **three** distinct places a weight can live,
and the whole design turns on not confusing them.

| Slot | Symbol | What it means | Where it exists today |
|---|---|---|---|
| **1. Base score** | `τ` | The node's own standalone credence *before any child touches it* | `debate_adapter.py:84-92`, from judge strength — or, indicted, from nothing |
| **2. Arc weight** | `w` | A per-edge discount on how much a child's **final strength** transmits to its parent; contribution becomes `w × strength(child)` | Exists but is off the production path: `qbaf/semantics.py:53`, `model.py:81-110`, default `w = 1.0` |
| **3. The recursion** | — | Graph position itself. Supporters raise a node above its `τ`; attackers push it below | Free, automatic, already running |

**The finding that prunes half the candidate factor list: slot 3 already
delivers position-awareness, exactly and for free.** Recomputed from §1.2:

| Node | τ | Children | Strength it transmits to its parent |
|---|---|---|---|
| Stranded leaf | 0.60 | none | **0.60** (`σ(τ,0,0) = τ`) |
| Same node, two supporters at 0.5 | 0.60 | 2 supports | **0.90** |
| Same node, two supporters and one attacker at 0.5 | 0.60 | 2 supports, 1 attack | **0.70** |

A stranded leaf already moves its parent by 0.60 where the corroborated twin
moves it by 0.90. V's intuition is not an unmet requirement; it is a property of
the kernel that V2 computes correctly and then **fails to show anyone** — the
served map is a flat `node_id → float` (`runner.py:249-259`, defect D4).

The operative consequence for the sitting:

> **Any factor that re-encodes graph position into `τ` or `w` double-counts it.**
> Position enters once, through the recursion. A "stranded-leaf penalty" applied
> on top of the recursion would charge the leaf twice for the same fact.

So the honest question is not *"how do we make weights position-aware"* — they
are — but **"which facts about a node are NOT already expressed by the graph, and
therefore need a weight?"** Only three classes survive that filter: how the node
was *known* (provenance type), whether it is *the same fact as its sibling*
(redundancy), and how *reliably* it was judged (dispersion). Everything else is
either already in the recursion, or belongs somewhere other than a weight — a
serving gate, an output ranking, or a refusal.

### The corollary V will find least comfortable

Corroboration is **not** a bonus. DF-QuAD's aggregation `1 − Π(1−vᵢ)` already
rewards multiple supporters — that is what it is *for*. Adding a
"cross-family corroboration multiplier" on top would pay for independence twice.
The correct move is the mirror image: **independence is the licence the operator
is already assuming, and where it fails, the cluster collapses.** This is exactly
the upstream ruling (`human-plan.md`, rule 13: *shared source is deterministic
and gates; count the cluster once, conservatively at the strength of its
strongest member, never the sum; shared assumption is a flag, never a gate*), and
it is also what the Bayesian literature supports: Bovens & Hartmann's work on the
variety-of-evidence thesis shows the "more independent sources ⇒ more
confirmation" intuition has boundary conditions and **fails outright in some
reliability regimes**, so a naive independence *bonus* is not even safe in
principle, whereas a dependence *discount* is (Bovens & Hartmann; Claveau;
Stegenga & Menon — see Sources).

---

## Structural-weight factor table

Thirteen candidate factors. For each: what it measures, how it is computed from
graph + evidence alone, its failure modes (including gaming and degenerate
topologies), its cost, and **the verdict — which slot it belongs in, or that it
is not a weight at all.**

Cost legend: **free** = already computed in the propagation pass;
**O(n)** = one linear pass; **O(n·s)** = n re-solves of the graph;
**exp** = exponential unless sampled.

---

### S1 — Graph position (stranded leaf vs multiply-supported node)

- **Measures.** How much independent argumentative structure stands behind a node.
- **Computed from.** Nothing extra: it *is* the DF-QuAD recursion. `σ(τ, va, vs)`
  where `va`/`vs` are the aggregated strengths of the node's attackers/supporters.
- **Failure modes.** None in the arithmetic. The failure is presentational: V2
  serves the resulting number stripped of the structure that produced it, so a
  0.90 that came from corroboration and a 0.90 that came from a lucky τ are
  indistinguishable on the wire (`runner.py:249-259`; `lean.py:140-146` sums them
  without a per-node check; `web/` has **no** consumer of `tauSources` at all).
- **Cost.** Free.
- **Verdict.** **Slot 3, already done. Do not add a weight.** What is missing is a
  per-node *position label* travelling with the number — `{judged, supported_by:n,
  attacked_by:n, cluster_id, way_of_knowing}` — so a reader can see the difference
  the arithmetic already made. This is a D4 fix, not a weighting change.

---

### S2 — Arc cardinality (how MANY supporting/attacking arcs)

- **Measures.** Count of children, independent of their quality.
- **Computed from.** Edge list length. Free.
- **Failure modes — this is the primary gaming surface in the whole engine.**
  Recomputed: n supporters each at 0.30 aggregate to

  | n | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
  |---|---|---|---|---|---|---|---|---|
  | agg | 0.300 | 0.510 | 0.657 | 0.760 | 0.832 | 0.882 | 0.918 | 0.942 |

  **Six mediocre supporters (0.882) beat one strong one (0.900) to within two
  points.** The probabilistic sum converges to 1 in the count regardless of
  quality, which reproduces the audit's finding that *"roughly twice as much
  weight came from the number of supporting items as from their quality"*
  (`human-plan.md`, Part 1). Degenerate topology: a wide shallow fan is the
  cheapest possible route to a `supported` band. Gaming: an author (human or
  model) that splits one argument into five gets a free confidence upgrade.
  In the gradual-argumentation axiom literature this behaviour is the *counting*
  principle — desirable in some settings, but unbounded counting is what the
  audit indicted.
- **Cost.** Free.
- **Verdict.** **Slot 3, but it needs a control.** Three options, ranked:
  1. **Keep counting; control it with S5+S6 clustering** (recommended). Counting
     is legitimate *between genuinely independent items*; the defect is counting
     the same item repeatedly. Fix the identity, not the operator.
  2. **Top-k cap.** Aggregate only the k strongest children per polarity. Cheap,
     brutal, and k is a naked V-policy constant that will flip verdicts — which
     under the D2 ruling means both readings must then be served.
  3. **Cardinality-insensitive aggregator** (max, or a soft-max/normalised
     variant). Kills the defect and also kills genuine corroboration. Not
     recommended without a golden-vector re-derivation, since it breaks the two
     literature golden vectors pinned in `test_dfquad.py:95-138`.

---

### S3 — Arc strength (how STRONG the reasoning arcs are)

- **Measures.** The children's own final strengths.
- **Computed from.** The recursion, in topological order (`dfquad.py:142-165`).
- **Failure modes.** Inherits whatever produced the child's τ. If the child's τ is
  fabricated, the parent's number is fabricated with full formal respectability —
  the D1 mechanism.
- **Cost.** Free.
- **Verdict.** **Slot 3, already done.**

---

### S4 — Evidence provenance type (LOOKED_UP / RAN / REASONING)

- **Measures.** The way-of-knowing behind the node — the battery's Q51, *"the one
  question never switched off"*.
- **Computed from.** The evidence annex: `method ∈ {retrieval, model-claim}`,
  locator/url presence, opened-vs-preview-only status, run artifact presence
  (`04-node-graph-data-model.md` §A.3, WEIGH reads). The *classification* is
  derivable; the *ordering and magnitude* are not.
- **Failure modes.** (i) As a silent multiplier it becomes exactly D2 — a constant
  nobody authorised that flips verdicts. (ii) Gaming: relabel a REASONING node as
  LOOKED_UP by attaching any URL; mitigated only by the upstream verbatim-quote
  and locator rules (*a preview-only source may never supply a number or a
  quote*). (iii) A three-tier multiplier invites a fourth, then a fifth, and the
  ladder becomes ungovernable.
- **Cost.** O(n), one pass over the annex.
- **Verdict.** **Slot 1, as a CEILING — never a multiplier — plus a serving-band
  rule.** A cap can only lower a number and can never invent one; a multiplier can
  be argued about forever. And the upstream ruling is already band-shaped, not
  arithmetic: *"a verdict resting on reasoning alone is downgraded from a verdict
  to a hypothesis plus a research plan"* (`human-plan.md`, Stage 10). So V3 should
  express way-of-knowing as `τ ≤ ceiling(way_of_knowing)` **and** a band rule,
  with both the ceiling and the band printed. The three ceiling numbers are a
  V-policy value (question 2 below).
- **Literature note.** This is the argumentation-native version of
  evidence-hierarchy grading. GRADE's design lesson transfers: it keeps *certainty
  of evidence* on its own axis with its own explicit rating rules, rather than
  quietly folding source type into the effect estimate.

---

### S5 — Cross-family corroboration / evidence independence

- **Measures.** Whether two supporting items are genuinely two items.
- **Computed from.** A **provenance partition key** over the evidence annex.
  Deterministic *once the key is chosen*: candidate fields are `source_domain`,
  `publisher`, underlying study/dataset identity, retrieval query lineage,
  producing model family, and producing run id. V2 has the machinery in
  `evidence/independence.py:127-150` — it counts distinct `(source_domain,
  method)` pairs — but its own docstring says it measures *sourcing breadth, never
  truth*, it deliberately excludes `model_family`, and **it gates nothing**: the
  only consumer is serialization (`services/serialization.py:298-307`).
- **Failure modes.** (i) Key too narrow ⇒ three papers by one research programme
  count as three (the real vitamin-D catch in `human-plan.md`: *"the three
  vitamin D analyses share authors and trials — one research programme, not three
  confirmations"*). (ii) Key too wide ⇒ genuinely independent replications get
  merged and the answer is under-confident. (iii) Gaming: route the same claim
  through a second domain (a press release, an aggregator) to escape the key.
  (iv) *(Speculation)* a model asked to self-report its own evidence's
  independence will over-report it; the key must be computed from stored fields,
  never asked.
- **Cost.** O(n) grouping plus one max per cluster.
- **Verdict.** **Slot 2, as a GATE, not a bonus.** One contribution per cluster,
  at the strongest member. Recomputed effect on the audit's own worked case: three
  restatements of a 0.40 claim aggregate to **0.784** today (0.40 → 0.64 → 0.784);
  under cluster collapse they contribute **0.400**. That single rule retires the
  measured D3 defect.
- **What is derivable vs policy.** The partition is derivable; **the key width is
  a V decision** (question 3).

---

### S6 — Semantic redundancy between siblings

- **Measures.** Whether two siblings are the same claim in different words —
  the residue S5 misses when restatements do *not* share provenance.
- **Computed from.** Embedding similarity between sibling claim texts, thresholded
  and clustered. Standard semantic-deduplication practice (embeddings + ANN
  search + a similarity threshold).
- **Failure modes — the reason this must not gate in v1.**
  1. **The threshold is a naked constant that moves verdicts.** Under the D2
     ruling that immediately obliges serving both readings, for every question.
  2. **Transitive closure collapses branches.** The standard near-duplicate
     convention is explicitly transitive — *if A is a near-duplicate of B and B of
     C, then A of C, even when A and C would not otherwise be judged similar*.
     Applied to a debate tree, one chain of mild paraphrases can absorb an entire
     branch. Mitigation: complete-linkage (require pairwise similarity across all
     members), never single-linkage.
  3. **Polarity collision.** "Vitamin D reduces infections" and "Vitamin D does
     not reduce infections" are near-neighbours in embedding space and opposite in
     effect. Clustering must be *within polarity and within parent* only.
  4. **Two-sided gaming.** Reword to stay *under* the threshold and get counted
     twice; or post a near-duplicate of the strongest counter-argument to get it
     *absorbed* into a cluster and silenced. The second is worse, and it is a
     direct attack on the "strongest objection must be visible" gate.
- **Cost.** O(n²) per sibling set (small), plus one embedding call per node.
- **Verdict.** **Not a weight in v1 — a FLAG.** Emit `possible_restatement_of:
  [node_ids], similarity: x.xx` on the node and in the served map, change no
  number, and let it feed the human/merge step. This is precisely the upstream
  ruling's two-tier structure (*shared source gates; shared assumption only
  flags*) extended to shared *wording*. Promotion to a gate should require
  question 5's evidence bar to be met first.

---

### S7 — Counter-node presence and strength

- **Measures.** Whether the node is contested, and how hard.
- **Computed from.** The recursion (`va` in `σ`). Free.
- **Failure modes.** The failure is not arithmetic — V2 computes the strongest
  counter-argument correctly and *never displays it*. The audit's phrasing: *"The
  strongest objection computed and discarded... Nothing reads that result. It
  never reaches the screen."* The cross-exam report picks the strongest existing
  CON child; per `04-node-graph-data-model.md` WEIGH gap 7, it *"explicitly does
  not generate counterarguments"*, so "the strongest thing I actually found"
  silently means "the strongest thing already in the tree."
- **Cost.** Free.
- **Verdict.** **Slot 3 plus a SERVING GATE — not a weight.** The upstream rule is
  already categorical: *"An endorsed 'supported' band may not be served while an
  unresolved high-strength counterargument is carried and hidden... Present in the
  graph and absent from the surface blocks serving."* Implement that as a
  precondition on serving, not as an extra multiplier on the parent.

---

### S8 — Centrality / flip-sensitivity (impact)

- **Measures.** Which node is carrying the answer, and what would have to change
  for the answer to flip (battery Q46, Q49).
- **Computed from.** Two established families in the QBAF literature:
  - **Removal-based impact.** Re-solve the graph with the node (or its incoming
    attacks) deleted; the difference is its impact. This is the Delobelle–Villata
    line, refined by Kampik/Potyka/Yin/Toni into `ImpDV`.
  - **Shapley-based impact.** Average marginal contribution over coalitions
    (`ImpSI`), which correctly handles the case that *"the contribution of a set
    can differ substantially from simply summing individual contributions"* —
    i.e. it sees synergy and redundancy that leave-one-out cannot.
  The proposed principles for these measures are directly on-point for this
  project: *impact directionality* (only arguments with a directed path matter),
  *zero impact* (a disconnected argument has none), *completeness* (individual
  impacts sum to the network effect), *bounded impact* (values stay in [−1,1]).
- **Failure modes.** (i) **Circularity — the decisive one.** If sensitivity feeds
  back into the weights, then weights → strengths → sensitivity → weights is a
  loop with no fixed point declared, and the engine can be made to converge
  anywhere. (ii) Leave-one-out is blind to pairs that only matter together —
  exactly the set-contribution result above. (iii) Shapley over coalitions is
  exponential; must be sampled, and a sampled number carries sampling error that
  has to be printed.
- **Cost.** Removal-based: **O(n·s)** — n re-solves, each a linear topological
  pass; entirely affordable at debate scale. Shapley: **exp**, sampled.
- **Verdict.** **Not a weight. An OUTPUT.** Serve it as the fragility table Q49
  asks for (*"what would I have to drop or change before the answer flips"*) and
  the leverage ranking Q46 asks for, cross-referenced against verification effort
  (S12) — the upstream rule being *"if the highest-leverage input is the
  least-verified, recombination halts and that input returns to be weighed."*
  Feeding it back into τ or w should be **forbidden by construction** (question 9).

---

### S9 — Judged quality (τ itself)

- **Measures.** The node's own credence, from the deterministic reducer over the
  judge's `ClaimAssessment` (`02-scoring-behavior-spec.md` §2.4).
- **Computed from.** The reducer's declared composition — two branches
  (`evidence_weighted`, `argument_only`) with published coefficients, three score
  caps, versioned as `node-scoring-reducer-v3` / `debateai-rubric-v1`.
- **Failure modes.** (i) **D1 itself**: no judgement ⇒ `(0.5, "default")`, which
  the aggregation cannot distinguish from a measured value.
  Recomputed: root + four unjudged children ⇒ **0.96875**; five ⇒ **0.984375**.
  A subtler replay of the same defect: a parent with one *judged* 0.80 supporter
  sits at **0.900**; add three unjudged siblings at the silent 0.5 and it reads
  **0.9875**. (ii) Point-estimate fragility: the ArgLLM literature finds
  direct verbalised LLM confidence is **poorly calibrated**, and that the
  argumentative framework is **sensitive to the choice of base-score method** —
  different base-score methods produce different final verdicts. A single scalar
  τ from a single judge is therefore the weakest link in the whole chain, and
  no amount of downstream weighting repairs it.
- **Cost.** One judge call per node (the dominant cost in the system).
- **Verdict.** **Slot 1 — and the ONLY legitimate source of τ.** The D1 rule
  follows and is arithmetically exact, not a compromise: DF-QuAD's aggregation
  has `agg([]) = 0` as its identity, and `σ(τ, 0, 0) = τ`. **Dropping an unjudged
  child's edge is precisely neutral** — the parent lands on exactly the value the
  judged children alone justify. Excluding is not a fudge; it is the identity
  element. Interior unjudged nodes are the remaining ambiguity (question 1).

---

### S10 — Judge dispersion / measured uncertainty

- **Measures.** How much independent judges disagree — V2's single best battery
  alignment, per `04-node-graph-data-model.md` WEIGH item 4.
- **Computed from.** Already implemented and honest: `spread = max(signal) −
  min(signal)` over distinct judgments on a fixed composite, `uncertainty =
  clamp(spread × (0.5/0.35), 0, 1)`, `uncertainty_source: "dispersion"`, with a
  `judge_dispersion` driver **prepended** so it reads first
  (`disagreement.py:263-304`). Fewer than two parseable judgments returns `None`,
  and *"`None` must never be read as zero uncertainty."*
- **Failure modes.** (i) The historical composite disagreement gate is recorded
  **un-fireable against its own data** — threshold 0.35, largest observed spread
  0.11 across 26 nodes (`disagreement.py:64-69`). That is the audit's "checks that
  could not fire" class, already indicted. (ii) A judgment that fails schema
  validation is **silently discarded** — a three-judge panel quietly becomes a
  two-judge panel with no annotation (`disagreement.py:131-149`). (iii)
  Correlated judges: the existing cold-start correlated-error discount is
  declared, not learned, flat (non-compounding), and never discounts unknown
  families against each other (`calibration.py:51-107`) — all honest choices that
  should carry.
- **Cost.** One extra judge call per node per additional panel member.
- **Verdict.** **Keep as a separate served scalar in v1 (slot: neither).** The
  attractive v2 option is to make τ an **interval** `[τ_lo, τ_hi]` and propagate
  both bounds, serving a band instead of a point. That is well-posed — DF-QuAD is
  monotone in τ, so propagating the two endpoints gives a genuine envelope
  *(speculation: monotonicity in τ follows directly from the σ definition but I
  have not seen it stated as a published theorem, so treat the envelope claim as
  requiring a proof or a golden-vector check before adoption)*. Question 7.

---

### S11 — The combination operator (accumulate vs strict-and)

- **Measures.** Not a weight at all — but it dominates every weight, so it belongs
  in this table or V will reasonably ask why it is missing.
- **Computed from.** Must be **declared per parent** from the SPLIT stage's
  conjunction structure (Q26: *"what would all have to be true"*), which
  `04-node-graph-data-model.md` records as SPLIT gap 1: V2 *"has only a bag of
  siblings"* and a conjunction split *"is not expressible at all."*
- **Failure modes.** Recomputed on the mission's own worked case — four sub-claims
  at 0.95, 0.60, 0.35, 0.50:

  | Rule | Result |
  |---|---|
  | Accumulate (probabilistic sum) | **0.9935** |
  | Strict-and (product) | **0.0997** |
  | Ratio | **9.96×** |

  This reproduces the human-plan's reported 9.96-fold gap exactly. **No structural
  weight anywhere in this document can move a number by 9.96×.** Choosing weights
  before declaring the operator is optimising the second decimal place of a
  quantity whose first digit is undetermined.
- **Cost.** Free once declared; unanswerable until then.
- **Verdict.** **Precondition, not a weight — and the highest-priority item in
  the minimal set.** Upstream rule 14 is already categorical: *"The operator must
  be one operator — no inequalities, no dual displays — with a stated dependence
  assumption and shown arithmetic"*, and *"an undeclared operator means
  recombination does not run: component conclusions are served without a parent
  number."* Note the interaction with the D2 ruling: one operator *decides*, but
  where the rival operator flips the verdict, both readings are *served* with the
  deciding choice printed (Q47). Those are consistent — one operator computes, the
  alternative is displayed as a dependence line, never averaged in.

---

### S12 — Verification effort / symmetry of scrutiny

- **Measures.** How hard each side was actually checked (Q34), and whether the
  highest-leverage node was the best-checked one (Q46).
- **Computed from.** Verification-effort telemetry that does not yet exist.
  `06-contested-decision-briefs.md` Theme 4 makes this the pivot: *"is verification
  effort instrumented? If V3 records what it actually did to check each item, the
  comparison is arithmetic. If it does not, someone has to guess — and a guess is
  a model call."*
- **Failure modes.** The brief names the exact trap: *"If effort telemetry is
  incomplete, code compares fields that do not exist and silently reports symmetry
  that was never checked — a dead check, the defect class the battery indicts."*
- **Cost.** Free at comparison time; a schema obligation at build time.
- **Verdict.** **Not a weight — a GATE plus a typed `UNINSTRUMENTED` state that
  blocks rather than passes.** The draft Theme-4 recommendation (Q34 = `MACHINE`
  with telemetry as an explicit precondition) is the right shape for this ticket
  too. Do not let effort become a multiplier on strength; a well-checked wrong
  claim is still wrong.

---

### S13 — Staleness / recency

- **Measures.** Whether the node's newest source predates the answer's `as_of` by
  enough to matter, given whether the question is static, slow or fast-moving.
- **Computed from.** Dates already on the annex (retrieval time, publication date,
  caller `as_of`). Derivable; the *classification* fast/slow/static is a judgement,
  and the *tolerance* is policy.
- **Failure modes.** The human-plan records the live catch: a designer with *"a
  clean 2024 primary and a correctly quoted result"* was about to serve an answer
  *"seventeen months out of date with a perfect citation attached."* Known gap,
  stated upstream: *"nobody produced a mechanism for an answer to expire on its
  own."*
- **Cost.** O(n).
- **Verdict.** **Slot 1 ceiling plus a refusal rule**, same shape as S4. Upstream:
  *fast-moving with a stale newest source means refuse; slow or static means serve
  with an explicit staleness statement.* Ticket 14 owns the policy; this table
  records only that staleness must not become a silent multiplier.

---

### Recommended minimal viable factor set

Of thirteen factors, **exactly two become numeric weights in v1.** Four rules,
plus one non-numeric flag.

| # | Rule | Slot | Kills | Derivable? |
|---|---|---|---|---|
| **M1** | **τ comes from judgement or the node contributes nothing.** No judgement ⇒ no edge, and an explicit `ABSTAINED` record on the node carrying the reason. There is no `"default"` τ, at any layer. | 1 | **D1** | Fully — mechanism needs no V value |
| **M2** | **Operator declared per parent** (accumulate / strict-and), from SPLIT's conjunction structure. Undeclared ⇒ children served without a parent number. Rival operator computed and served as a dependence line where it flips the band. | — | **D2**-shaped defects at the join | Structure derivable; the *no-declaration fallback* is policy |
| **M3** | **Provenance cluster collapse.** Partition sibling support by a declared provenance key; each cluster contributes **once, at its strongest member**. | 2 (gate) | **D3** | Partition derivable; **key width is V policy** |
| **M4** | **Way-of-knowing ceiling on τ + serving-band rule.** `τ ≤ ceiling(LOOKED_UP / RAN / REASONING)`; reasoning-only roots serve as hypothesis-plus-research-plan, not verdict. A cap, never a multiplier. | 1 (cap) | Provenance-blind confidence | Classification derivable; **the three numbers are V policy** |
| **F1** | **Semantic-restatement flag** (non-gating). `possible_restatement_of: [ids], similarity: x.xx` on the node and on the wire. Changes no number. | — | The S5 residue, visibly | Similarity derivable; would need a threshold **only if promoted to a gate** |

Plus the two non-weight obligations without which none of the above is
auditable, both of which are D4 fixes rather than weighting changes:

- **P1 — Every served number carries its own provenance.** Replace the flat
  `dialecticalStrengths: {node_id → float}` with a per-node record joining the
  number to `{tau_source, way_of_knowing, cluster_id, judged_by, abstained,
  supported_by, attacked_by}`. *No aggregate coverage number may stand in for
  per-node labels* — `tauCoverage` at 0.50 currently lets a `supported` band ship
  with half its taus invented.
- **P2 — Semantics identifier is a recorded run input**, never a source literal
  (`runner.py:188` is the hardcode). Where a registered alternative disagrees
  materially, serve both with the deciding constant printed.

### Why this set and not a richer one

1. **It is the smallest set that cannot reproduce the four indicted defects.**
   M1↔D1, P2↔D2, M3↔D3, P1↔D4. Each defect gets exactly one structural answer.
2. **It adds no constant that can flip a verdict without being printed.** M4's
   ceilings and M3's key are the only two policy values, and both are cheap to
   display in one sentence each.
3. **It leaves position-awareness where it already works** — in the recursion —
   and spends the engineering budget on *showing* it (P1) rather than on a second,
   redundant encoding of it.
4. **It respects the 9.96× result.** M2 is first in cost-effectiveness by an order
   of magnitude over every other item in this document.

### What to add later, in this order

| Order | Addition | Precondition |
|---|---|---|
| 1 | **Removal-based fragility table** (S8): leave-one-out reversal set + leverage-vs-effort cross-reference | S12 telemetry exists |
| 2 | **Interval τ from dispersion** (S10): propagate `[τ_lo, τ_hi]`, serve a band | Monotonicity check or golden vectors |
| 3 | **Semantic clustering promoted from flag to gate** (S6/F1) | Question 5's evidence bar met; complete-linkage; within-polarity |
| 4 | **True arc weights `w`** (slot 2, beyond M3's gate) | Only if a factor is found that is *not* expressible as a τ cap or a cluster gate — none identified in this survey |
| 5 | **Shapley / set-contribution attribution** (S8) | Only if leave-one-out demonstrably misses real pairs; sampling error must be served |
| 6 | **Learned calibration** | A Stage-11 outcome store exists. Until then `source: "cold_start"` stays literally true |

### Derivable vs needs-a-V-policy-value — the explicit split

**Derivable from graph + evidence alone (no V value needed):**

| Quantity | Source |
|---|---|
| Position effect of supporters/attackers | The recursion |
| Arc counts and arc strengths | Edge lists + recursion |
| Whether a node is judged / abstained | Presence of a valid `ClaimAssessment` |
| The provenance *partition* (given a key) | Grouping over annex fields |
| Semantic similarity *scores* | Embeddings |
| Leave-one-out reversal set and leverage ranking | n re-solves |
| Measured judge dispersion | `max(signal) − min(signal)` |
| **Whether a choice is value-decided at all** | Pareto-dominance test — see the next section |
| The value-weight **reversal point** | Closed form for 2 criteria; simplex sampling for k>2 |
| Verification-effort symmetry | Telemetry diff, once instrumented |
| Staleness deltas | Dates on the annex |

**Needs a V policy value (each is a naked constant and must be printed where it
is used):**

| Value | Used by | Question |
|---|---|---|
| Way-of-knowing ceilings (three numbers, or "band rule only, no numbers") | M4 | Q2 |
| Provenance key width (which fields make two items one family) | M3 | Q3 |
| Cardinality policy: uncapped / top-k (k=?) / cardinality-insensitive | S2 | Q4 |
| Semantic-similarity threshold — **only if** F1 is ever promoted to a gate | F1 | Q5 |
| Operator fallback when the author declares none | M2 | Q6 |
| Abstention fraction at which a parent refuses to emit a number | M1 | Q8 |
| Staleness tolerances per question class | S13 | ticket 14 |
| Which impact measure is served | S8 | Q10 |
| Who may set the semantics identifier | P2 | Q15 |

---

## Value-weight elicitation flows

### First: the trigger is computed, not guessed

A value weight is needed **exactly when the ranking of the options depends on a
trade-off coefficient the evidence cannot supply**. That condition is mechanically
detectable and needs no model call and no user question:

> Compute the Pareto set over the criterion vectors. **If one option dominates on
> every criterion, no value weight exists and no elicitation fires.** If two or
> more options are non-dominated, the choice is value-decided, and *which* nodes
> are the hinges is determined, not asserted.

This matters more than any elicitation technique. It means the system never
*guesses* whether values are involved, never asks a user a question it did not
need to ask, and can prove to a stranger that the hinge it marked is the hinge
that exists. It is also the precondition that makes Flow A viable at all.

Note the strict parallel to M1, and treat it as the governing principle of this
whole section:

> **There is no default value weight.** Absence of an owner's weight is a
> first-class state that produces a *conditional* answer — never a 0.5, never an
> equal-weights vector, never a "reasonable" assumption. Equal weights are a value
> judgement wearing a lab coat, and shipping them unlabelled would be D1 committed
> a second time in a second currency.

### Flow A — Zero elicitation: serve the conditional *(lowest burden: none)*

**What the user does:** nothing.

**What the system does.** Compute the Pareto set. For each pair of non-dominated
options, compute the exact weight region in which each wins.

For two criteria with weights `w` and `1−w`, option A beats B iff
`w·a₁ + (1−w)·a₂ > w·b₁ + (1−w)·b₂`, which solves in closed form to a single
threshold

```
w* = (b₂ − a₂) / ((a₁ − b₁) + (b₂ − a₂))
```

Worked, recomputed: A = (speed 0.9, cost 0.3), B = (speed 0.4, cost 0.8) gives
**w\* = 0.50** — A wins iff speed is worth more than half the total. For k > 2
criteria the region is a polytope; report either its boundary facets or, following
SMAA, sample the weight simplex to produce **rank-acceptability indices** and the
**central weight vector** (the typical preference profile that makes each option
the winner).

**What is served** is the battery's own model answer for Q50, verbatim in shape:
*"A wins on speed, B wins on cost. A only wins overall if speed matters more, and
nobody has told me it does, so I'm handing back the comparison rather than a
winner."* Flow A upgrades that from a refusal to a **usable** refusal, because it
also prints where the line is.

- **Cost.** Closed form for 2 criteria; Monte-Carlo simplex sampling for k > 2 —
  milliseconds either way. Zero model calls, zero user calls.
- **Failure modes.** (i) With many criteria, "the region where A wins" stops being
  a readable sentence — the stranger test bites, not the arithmetic.
  (ii) **The trap:** SMAA's uniform sampling of the weight simplex *is itself a
  value assumption*. A rank-acceptability index of "A wins 72% of the weight
  space" is only meaningful under a prior nobody authorised. Serve the exact
  boundary always; serve the acceptability index only alongside a named
  distribution (question 14). (iii) Users read a conditional as indecision unless
  the sentence is written well — this is a UX-copy obligation, not a maths one.
- **Verdict.** **Default. Always computed, even when B or C also ran** — because
  the reversal point is the only artifact that makes a value-decided answer
  auditable after the fact.

### Flow B — One hinge question at a time *(low burden, bounded by the decision)*

**What the user does:** answers one trade-off question per unresolved hinge,
and stops as soon as the answer is determined.

**What the system does.** Adopt incremental elicitation under the **minimax-regret**
criterion (Boutilier et al.): maintain the feasible weight set, compute the
decision that minimises worst-case regret over it, and ask the single question
that most reduces that regret. **Stop when minimax regret falls below a declared
threshold** — i.e. when further preference information cannot change the answer.
The elicitation is bounded by the decision, not by the size of the model. Even
swaps (Hammond, Keeney & Raiffa) is the pen-and-paper cousin of the same idea and
is worth copying for its interaction style: it *"requires only the minimum number
of tradeoffs needed"* and lets the easy trades be made first so the hard ones can
often be skipped entirely.

**Question form: swing, not importance.** Ask *"moving cost from its worst value
here to its best is worth more / the same / less than moving speed from its worst
to its best?"* — not *"how important is cost?"* Swing weighting ties the question
to the actual ranges in play, and the MCDA comparison literature finds internal
validity is automatically enforced by the swing framing in a way that free
elicitation does not give you.

- **Cost.** One user interaction per hinge, worst case; typically fewer, since the
  stopping rule fires early. Model calls: zero if the criteria arrive typed from
  upstream (see the Theme-7 draft: Q50 = `HYBRID` for criteria identification,
  `MACHINE` for everything numeric, weights never model-supplied).
- **Failure modes.** (i) **Importance-vs-swing confusion** — the classic MCDA
  error, where the user answers about abstract importance and the system records
  a range-sensitive trade-off. (ii) Anchoring and order effects; the MCDA
  literature records that swing questions can trigger shortcut strategies.
  (iii) **Scope creep**: an answer given about *this* question silently becomes a
  standing policy unless the record carries `{scope, owner, as_of}`.
  (iv) *(Speculation)* an interactive elicitation the user can see moving the
  verdict invites the user to reverse-engineer the weight that produces the answer
  they wanted; showing the reversal point *before* asking makes this worse, and
  showing it *after* makes it better — so the ordering is a real design choice,
  not a detail.
- **Verdict.** **Recommended as the only elicitation that fires by default**, and
  only at hinges that actually change the served answer.

### Flow C — Full profile, elicited once, reused *(highest up-front burden, lowest marginal)*

**What the user does:** completes one structured elicitation session producing a
signed, versioned weight vector over a declared criterion set.

**Method options, with the comparative evidence:**

| Method | Burden | Note |
|---|---|---|
| **PAPRIKA** (adaptive pairwise, two attributes at a time) | Moderate, adaptive | A 2025 comparison of elicitation methods rated it **highest for clarity, usability and expressiveness**, and found it *"best balanced cognitive demand and expressiveness"* and preferred by most participants |
| **Swing weighting / SMART** | Moderate | Well-validated, range-sensitive; comparison studies find no essential differences in resulting weights across AHP / direct / SMART / swing / trade-off |
| **AHP** (pairwise, ratio scale) | Low to implement | Rated *easiest to implement*; carries known rank-reversal and consistency-ratio baggage — mention as a failure mode, not a recommendation |
| **SMARTER / rank-order-centroid** | Lowest — a rank order only | Derives weights from ordinal ranking alone. **But the ROC formula is itself an unauthorised weight shape**; adopting it silently would be exactly the defect this ticket exists to prevent. Usable only if the imposed shape is printed |
| **Best-worst scaling / direct weighting** | Lowest | Rated *less useful for capturing nuanced preferences* in the same comparison |
| **Standard gamble / time trade-off** | Highest | Rated cognitively demanding; no reason to reach for them here |

- **Cost.** One session (tens of questions for PAPRIKA-style adaptive pairwise),
  amortised over every future question in that class.
- **Failure modes.** (i) **Staleness** — a weight vector is evidence about a
  person's preferences at a time and expires like any other evidence.
  (ii) **Scope over-reach** — a vector elicited for "infrastructure purchases"
  quietly applied to a safety question. (iii) **Ownership drift** — the person who
  answered leaves; the weights stay signed by a name that no longer holds the
  decision.
- **Verdict.** **Opt-in and org-level only.** Justified when the same trade-off
  recurs. Never a precondition for answering; a question must always be answerable
  via Flow A.

### Ranking, by burden

**A (none) < B (one bounded question per real hinge) < C (one session, amortised).**

Recommended composition: **A always; B at hinges only; C on request.** A weight
from C never silently overrides a live hinge — it pre-fills B's answer and is
marked as `weight_source: org_policy` rather than `owner_elicited`, so a reader
can see the difference between "the person deciding told us" and "a standing
policy told us."

---

## Overlay & marking design

### The invariant

> **The value overlay never mutates the evidence-scored graph.** τ, arc weights,
> strengths and provenance are computed with no reference to any value weight.
> The overlay is a second layer that attaches at computed hinge nodes and is
> rendered as a distinct layer at serve.

If a value weight is ever folded into τ or `w`, D4 reappears in a new costume —
the served number stops carrying the kind of thing that produced it, and the
stranger can no longer see where values decided rather than evidence. That is the
one thing this ticket exists to prevent, so it should be an enforced invariant
(a test that recomputes all strengths with the overlay detached and asserts
byte-identity), not a convention.

### The overlay record

One record per hinge. Proposed shape:

```
ValueHinge {
  hinge_node_id           # computed, not declared
  criteria[]              # {id, human_name, direction, source}
  option_vectors          # {option_id → {criterion_id → evidence-scored value}}
  pareto_set[]            # option ids that are non-dominated
  weight_source           # "owner_elicited" | "org_policy" | "none"   ← never "default"
  weight_vector | null    # null is a first-class, serviceable state
  owner | null            # who signed it
  scope                   # {question_id | question_class | org}
  as_of, expires_at
  reversal                # closed-form boundary (k=2) or facet/central-weight description
  band_under_weight       # the served band if the weight is applied
  band_under_alternative  # the band on the other side of the reversal point
  elicitation_trace       # which questions were asked, in order, and the answers
}
```

`weight_source: "none"` with `weight_vector: null` is a **complete, servable**
record. That is the whole design in one line.

### Where the overlay attaches — hinge detection

A node is a hinge iff **either**:

1. it is a comparison/choice node whose Pareto set has ≥ 2 members; **or**
2. varying the weight across its full admissible range changes the served band.

Both are computed. Condition 2 is the same leave-one-out machinery as S8, applied
to the weight rather than to a node — which is a pleasing economy: **one
sensitivity engine serves both the evidence fragility table (Q49) and the value
hinge detector (Q50).** *(Speculation: I have not seen this dual use proposed in
the QBAF impact-measure literature, which treats attribution over arguments only;
it looks straightforward but should be prototyped before being specced.)*

### Seven marking rules

**R1 — Human language on top, always.** The value sentence is a sentence, not a
number: *"A only wins if speed matters more than cost, and nobody has told me it
does."* Binds with the layout rule from `04-node-graph-data-model.md`: *a bare
number with no human meaning never appears in the top layer.*

**R2 — A distinct verdict state, reusing the existing precedent.** Add
`verdictState: value_conditional` alongside the existing
`endorsed / endorsed_with_caveat / suppressed_no_evidence`. The precedent to
generalise is already in the codebase and already honest: the evidence gate runs
in **shadow mode**, publishing what it *would* have suppressed beside the
unsuppressed band (`verdict.py`, `evidenceGateShadow`). That is exactly the shape
a value overlay needs, and `04-node-graph-data-model.md` COMPOSE gap 7 already
identifies it as *"one honest precedent to build on"* that *"is not generalised."*

**R3 — Never conflate value-dependence with weak evidence.** This is the single
most transferable lesson from GRADE: the working group **renamed** its "weak
recommendation" to **"conditional recommendation"** precisely because readers
confused a weak *recommendation* with weak *evidence*. A value-conditional answer
may rest on impeccable evidence. The two axes must be reported separately and
must never share a label, a colour, or a meter.

**R4 — Provenance stamp on every weight, with no default value.** Mirror the τ
mechanism exactly: `weight_source ∈ {owner_elicited, org_policy, none}`. There is
no `"default"` member of that set, by construction, in the same way there must be
no `"default"` τ. If V accepts only one recommendation from this document, this
is the one that carries the ticket.

**R5 — Print the reversal point beside every value-decided claim.** Not *"we
weighted speed at 0.6"* but *"A wins for any speed weight above 0.50; you would
have to think speed is worth less than half as much as cost to flip this."* The
reversal point is what makes the marking checkable rather than decorative, and it
is the only part of the overlay a stranger can independently test.

**R6 — Serve both readings; never average.** A value weight that flips the verdict
is **the same kind of object** as an aggregation constant that flips the verdict,
and the upstream ruling for the latter already binds: *"A constant that flips the
verdict means serving both, pinning the constant, and printing a visible line
stating the conclusion depends on it. Deliberately not an abstention."* Apply it
verbatim to value weights. Where the UI allows it, a live toggle on the weight is
the superior form of the same content; where it does not, two bands side by side
with the deciding line between them.

**R7 — Findings and recommendations render in separate blocks.** Battery Q57:
*"Have I kept what I found separate from what I think should be done about it?"*
The overlay is the machine-checkable form of that rule. Findings come from the
graph; recommendations come from the overlay; the serve renders them in separate
paragraphs. **A recommendation paragraph with an empty overlay owner is a defect,
not a style choice** — and the human-plan's fires-when clause is already written:
*"Fires: when I've strayed into recommending something. Take the recommendation
out, or go and get the judgement call made by whoever it belongs to."*

### Rendering sketch, in the two layers

```
LAYER 1 (human language, no bare numbers)

  Finding.  Option A is faster; option B is cheaper. Both readings rest on
            measured evidence — nothing here is guesswork.

  Value.    Which one wins depends on how much speed is worth to you, and
            nobody has told us. → A wins if speed is worth more than half;
            B wins otherwise. We are handing back the comparison, not a winner.

LAYER 2 (the numbers, each with its provenance)

  criterion vectors   A(speed .90, cost .30)  B(speed .40, cost .80)
  pareto set          {A, B}
  reversal            w*(speed) = 0.50
  weight_source       none              ← no owner has supplied one
  band if w>0.50      A supported       band if w<0.50   B supported
  evidence provenance per criterion → per-node graph links
```

Only Layer 1 is claimed to pass the stranger test. Layer 2 is the audit trail
that lets a reader check Layer 1.

### The overlay's interaction with abstention (DR-012)

`weight_source: none` is **not** an abstention and must not be priced as one. The
abstention scale (DR-010/011/012) prices *not answering*. Flow A **does** answer —
it returns the complete comparison plus the exact condition under which each
option wins, which is strictly more information than a winner picked under an
invented weight. *(Speculation, flagged for ticket 13's sitting: if the
abstention matrix's `value: 0.15` cell is read as covering value-conditional
answers, the engine will be penalised for the most honest output it can produce.
The two should be distinguished explicitly.)*

---

## Sharp questions V must still rule

One decision each. Options named; recommendation given where the research
supports one, and withheld where it does not.

**Q1 — Interior unjudged nodes.** M1 says an unjudged node contributes nothing.
For a *leaf* that is unambiguous. For an interior node with judged descendants,
which is it?
 (a) the node is **transparent** — its children's edges lift to the nearest
 judged ancestor (the mechanism already exists as `_v2_effective_parent`);
 (b) the whole **subtree is excluded**;
 (c) the node's τ is **derived from its children** under a declared rule.
*No recommendation — (c) reintroduces a computed-from-nothing τ and should
probably be refused, but (a) versus (b) is a genuine values-of-the-system choice
about whether unjudged structure may still conduct.*

**Q2 — Way-of-knowing ceilings.** Three numbers for LOOKED_UP / RAN / REASONING,
**or** a band rule only with no numeric cap at all? *(A band rule alone is
cleaner and harder to game; numbers are more expressive and more arguable.)*

**Q3 — Provenance key width.** Which fields make two evidence items "the same
family"? Candidates: `source_domain`, `publisher`, underlying study/dataset,
retrieval-query lineage, producing model family, producing run id. Pick the set.
*This is the single highest-leverage V value in the structural half — it is what
converts 0.784 back into 0.400.*

**Q4 — Cardinality policy.** (a) uncapped counting, controlled only by M3
clustering; (b) top-k per polarity (k = ?); (c) a cardinality-insensitive
aggregator. *Recommend (a); note that (c) breaks the two pinned literature golden
vectors and would require re-derivation.*

**Q5 — May semantic similarity ever gate?** Flag-only permanently, or promotable
to a gate — and if promotable, **what must be shown first**? *(Suggested bar:
the threshold is shown to fire both ways on real data, per upstream rule 12 —
"every gate must be shown to fire both ways before adoption" — plus
complete-linkage and within-polarity clustering.)*

**Q6 — Operator fallback.** When the author declares no operator: (a) refuse to
emit a parent number and serve components only (the upstream default); (b) a
declared fallback operator, printed. *Recommend (a).*

**Q7 — Does dispersion widen τ into an interval?** (a) keep uncertainty a
separate scalar (v1 recommendation); (b) propagate `[τ_lo, τ_hi]` and serve a
band. *If (b), the monotonicity of σ in τ must be proved or golden-vectored
first.*

**Q8 — Abstention arithmetic.** At what fraction of abstained children does a
parent **refuse** to emit a number at all? V2's answer was a band gate at 0.50
aggregate coverage that still printed the raw number underneath; the D1 ruling
says that is not enough. One number, or a rule.

**Q9 — May flip-sensitivity ever feed back into weights?** *Recommend: never —
forbid it by construction and test for it.* But V should rule it explicitly,
because it is the most natural-sounding wrong idea in this space and it will be
proposed again.

**Q10 — Which impact measure is served?** (a) removal-based leave-one-out
(cheap, exact, blind to pairs); (b) sampled Shapley / set contributions
(expensive, sees synergy and redundancy, carries sampling error that must be
printed). *Recommend (a) for v1.*

**Q11 — Default value owner.** When the caller is not the decision owner, may the
system proceed with `weight_source: none` and serve the conditional, or must it
halt until an owner is named? *Recommend proceed-and-mark; halting makes the
engine useless for exploratory questions.* Interacts with ticket 12's per-run
ownership definitions.

**Q12 — May a winner ever be served on a value weight?** (a) yes, with
`verdictState: value_conditional` plus the reversal point; (b) no — comparisons
are always handed back and a winner is never named. *Q50's model answer reads
like (b), but (a) with R5/R6 marking preserves the honesty and is far more useful.
V's call.*

**Q13 — Weight scope and expiry.** Per-question, per-question-class, or per-org
standing — and what expiry rule? An elicited weight is dated evidence about a
person and should stale like any other.

**Q14 — Rank-acceptability under an unauthorised prior.** For k > 2 criteria with
no owner weight, may the system serve a SMAA-style "A wins across 72% of the
weight space" figure, given that the uniform prior over the weight simplex is
itself a value nobody authorised? (a) never; (b) yes, with the distribution named
in the top layer; (c) only the exact boundary facets, never a percentage.

**Q15 — Who may set the aggregation semantics identifier?** It must become a
recorded run input rather than the current source literal (`runner.py:188`) — but
per run, per debate, per deployment, and settable by whom?

---

## Sources

Local (read-only, this repo):

- `apps/dialectical-engine/docs/missions/2026-08-03-v3-greenfield-requirements/research/02-scoring-behavior-spec.md` — DF-QuAD math §1.2, adapter §1.3–1.5, weighted variant §1.6, reducer §2.4, dispersion/calibration §2.8–2.9, EXCLUDED-BY-RULING register (a)–(d)
- `.../research/04-node-graph-data-model.md` — node/edge shapes §A; SPLIT/WEIGH/COMPOSE gap analysis; stranger-test field audit
- `.../research/06-contested-decision-briefs.md` — Theme 4 (Q34/Q35/Q37, verification-effort telemetry as precondition); Theme 7 (Q30/Q48/Q50, the value boundary)
- `.../wayfinder/issues/13-value-weight-ownership.md`, `09`, `10`, `11`, `12`, `22`, `25` — adjacent rulings DR-008…DR-014 and open knobs
- `apps/dialectical-engine/docs/missions/2026-08-02-battery-llm-vs-machine/upstream/human-plan.md` — the four indicted defects (Part 1); Q26–Q50; the 9.96× operator measurement; rules 12, 13, 14; the serve-both ruling; Q50/Q57 model answers

Gradual argumentation semantics and their axioms:

- Rago, Toni, Aurisicchio & Baroni, *Discontinuity-Free Decision Support with Quantitative Argumentation Debates* (DF-QuAD), KR 2016 — the kernel V2 implements. Adaptation note: https://ceur-ws.org/Vol-1672/paper_3.pdf
- Amgoud & Ben-Naim, *Weighted Bipolar Argumentation Graphs: Axioms and Semantics*, IJCAI 2018 — https://www.ijcai.org/proceedings/2018/0720.pdf ; and *Evaluation of arguments in weighted bipolar graphs*, IJAR 2018 — https://www.sciencedirect.com/science/article/pii/S0888613X1730590X (axioms including resilience, proportionality, counting, and the Franklin axiom, which requires that a bijection between attackers and supporters returns an argument to its basic weight)
- Potyka, *Extending Modular Semantics for Bipolar Weighted Argumentation*, AAMAS 2019 — https://www.ifaamas.org/Proceedings/aamas2019/pdfs/p1722.pdf ; and *Continuous Dynamical Systems for Weighted Bipolar Argumentation* — https://cdn.aaai.org/ocs/17985/17985-78635-1-PB.pdf . **Open-mindedness** and the convergence trade-off: stronger convergence guarantees buy weaker ability to move away from the initial weights
- Potyka et al., *Balancing Open-Mindedness and Conservativeness in Quantitative Bipolar Argumentation*, KR 2024 — https://proceedings.kr.org/2024/56/kr2024-0056-potyka-et-al.pdf

Impact, attribution and fragility:

- Yin, Potyka & Toni, *Argument Attribution Explanations in Quantitative Bipolar Argumentation Frameworks*, ECAI 2023 — https://arxiv.org/pdf/2307.13582 (**the source of Golden Vector 1 pinned in `test_dfquad.py:95-138`**)
- *CE-QArg: Counterfactual Explanations for Quantitative Bipolar Argumentation Frameworks* — https://arxiv.org/html/2407.08497 (**the source of Golden Vector 2**)
- Kampik, Potyka, Yin, Čyras & Toni, *Impact Measures for Gradual Argumentation Semantics* — https://arxiv.org/abs/2407.08302 — removal-based `ImpDV` and Shapley-based `ImpSI`; principles including impact directionality, zero impact, completeness, bounded impact
- *Set Contribution Functions for Quantitative Bipolar Argumentation and their Principles* — https://arxiv.org/pdf/2509.14963 — set contributions can differ substantially from the sum of individual contributions (synergy/redundancy)
- Yin, Potyka & Toni, *Applying Attribution Explanations in Truth-Discovery Quantitative Bipolar Argumentation Frameworks* — https://arxiv.org/abs/2409.05831

Base scores from LLMs:

- Freedman et al., *Argumentative Large Language Models for Explainable and Contestable Claim Verification* — https://arxiv.org/html/2405.02079 — QBAFs whose base scores are LLM-estimated intrinsic strengths
- *Evaluating Uncertainty Quantification Methods in Argumentative Large Language Models* — https://arxiv.org/pdf/2510.02339 — **direct verbalised LLM confidence is poorly calibrated, and the argumentative framework is sensitive to the base-score method: different methods produce different final verdicts**

Corroboration, dependence and duplicate discounting:

- Bovens & Hartmann, *Bayesian Epistemology* (OUP 2003) and *The Variety-of-Evidence Thesis and the Reliability of Instruments: A Bayesian-Network Approach* — https://philpapers.org/rec/HARTVT
- *The Variety-of-Evidence Thesis: A Bayesian Exploration of Its Surprising Failures* — https://philsci-archive.pitt.edu/14086/1/VoE_thesis_Synthese.pdf ; and *The variety of evidence thesis and its independence of degrees of independence* — https://link.springer.com/article/10.1007/s11229-020-02738-5
- Godden, *Corroborative Evidence* — https://philarchive.org/archive/GODCE — the **fallacy of double counting**: overvaluing a piece of evidence by counting its probative force twice
- Tideman, independence of clones (1987) — https://en.wikipedia.org/wiki/Independence_of_clones_criterion — the social-choice statement of the same defect: a method fails if adding near-identical alternatives changes the outcome. Borda, minimax, Kemeny–Young, Copeland and plurality all fail it; ranked pairs and Schulze do not
- Semantic near-duplicate detection and the **transitivity convention** that makes naive clustering dangerous here — https://link.springer.com/chapter/10.1007/978-3-642-13489-0_10

Value-weight elicitation:

- Boutilier, Patrascu, Poupart & Schuurmans, *Incremental Utility Elicitation with the Minimax Regret Decision Criterion*, IJCAI 2003 — https://www.ijcai.org/Proceedings/03/Papers/046.pdf — query until minimax regret is acceptable, then stop
- Hammond, Keeney & Raiffa, *Even Swaps: A Rational Method for Making Trade-offs*, HBR 1998 — https://hbr.org/1998/03/even-swaps-a-rational-method-for-making-trade-offs — requires only the minimum number of trade-offs needed
- Lahdelma, Hokkanen & Salminen, **SMAA** — https://en.wikipedia.org/wiki/Stochastic_multicriteria_acceptability_analysis and *Implementing stochastic multicriteria acceptability analysis* — https://www.sciencedirect.com/science/article/abs/pii/S0377221706000506 — explores the weight space to describe which preferences make each alternative preferred; outputs rank-acceptability indices, central weight vectors, confidence factors
- *Assessing patient preferences for medical decision making — a comparison of different methods* (2025) — https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2025.1641765/full — **PAPRIKA rated highest for clarity, usability and expressiveness**; best balance of cognitive demand and expressiveness; BWS and direct weighting rated less useful for nuance; standard gamble and time trade-off most demanding
- *Comparison of weighting methods used in multicriteria decision analysis frameworks in healthcare* — https://becarispublishing.com/doi/10.2217/cer-2018-0102 ; and *MCDA swing weighting and discrete choice experiments... a critical assessment* — https://pubmed.ncbi.nlm.nih.gov/28696023/ — swing weighting enforces internal validity automatically but can trigger shortcut strategies; no essential differences in resulting weights across AHP/direct/SMART/swing/trade-off
- 1000Minds, PAPRIKA method description — https://www.1000minds.com/paprika

Marking value-decided conclusions:

- GRADE Evidence-to-Decision framework — https://link.springer.com/article/10.1186/s13012-016-0462-y and https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5975536/ — values and preferences as an explicit, separately-recorded EtD criterion
- Canadian Task Force on Preventive Health Care, on the **"conditional recommendation"** rename — https://canadiantaskforce.ca/chapter-5-development-of-recommendations/ — "weak" was replaced because readers confused a weak recommendation with weak evidence
- GRADE Working Group, *clarifying the construct of certainty of evidence* — https://pmc.ncbi.nlm.nih.gov/articles/PMC6542664/
