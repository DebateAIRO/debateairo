RESEARCH HANDOFF COMPLETE
Seat: opus-5 (formal-semantics lens)
Sections: (a) structural factor table + minimal set; (b) value-weight
elicitation flows ranked by burden; (c) value overlay design; (d) open
decisions as sharp questions; (e) worked examples; (f) bibliography with
verification status per citation; (g) SPECULATION register.

---

# Weighting design for a DF-QuAD argument engine — formal-semantics lens

**Mission** WEIGHT-RESEARCH-R1 · **Round** R1 · **Seat** opus-5 · **Date** 2026-08-03

## Reading guide / epistemic key

Every claim in this packet is tagged with one of four labels. Cross-reviewers
should attack the tags as hard as the content.

| Tag | Meaning |
|---|---|
| **[THM]** | A proposition I derived and can prove from the DF-QuAD definition or from the repo's own source. Checkable by hand or by a unit test. |
| **[LIT]** | Sourced to a citation in §(f). The verification status of that citation is stated there. |
| **[CODE]** | A fact read directly out of `apps/dialectical-engine/coordinator/`, with file and line. |
| **[SPEC]** | My design proposal. Not sourced, not proven, not tested. All [SPEC] items are re-listed in §(g). |

I could **not** extract text from most PDFs in this environment (no
`poppler`/`pypdf`/`pdftotext` available; `WebFetch` returned raw binary for
PDF URLs). Where I verified a paper only from its abstract page, publisher
listing, dblp record, or an HTML rendering, §(f) says so. **No citation in
this packet was written from memory alone without a retrieval attempt**, and
where retrieval failed I marked the item rather than dropping the caveat.

---

## §0 — Preliminaries: what the semantics already commits you to

The brief asks which factors *should* contribute to structural weight. That
question cannot be answered without first stating what the engine's existing
semantics already assumes, because several of the candidate factors are
**already implicitly present** in DF-QuAD, and adding them explicitly would
double-count.

### 0.1 The engine as implemented

[CODE] `coordinator/app/qbaf/dfquad.py` implements canonical DF-QuAD
(Rago, Toni, Aurisicchio, Baroni, KR 2016 [LIT-1]):

- aggregation (α, "probabilistic sum"): `agg(∅) = 0`, `agg(v₁…vₙ) = 1 − ∏(1 − vᵢ)`
- mediation (σ): `σ(τ, vₐ, v_s) = τ − τ(vₐ − v_s)` if `vₐ ≥ v_s`, else `τ + (1 − τ)(v_s − vₐ)`
- acyclicity enforced explicitly (`CyclicGraphError`), Kahn topological order.

[CODE] There are **two** propagation paths with different expressive power:

| Path | File | Edge weights? | Used by |
|---|---|---|---|
| Pure core | `app/qbaf/dfquad.py` (`ArgumentGraph`) | **No** — edges are bare `(source, target)` tuples | `app/qbaf/debate_adapter.py:331` — i.e. **the production path** |
| Weighted | `app/qbaf/semantics.py` (`DFQuADSemantics`) | **Yes** — `weighted_strength = edge.weight * compute(edge.source_id)` (`semantics.py:52`) | `QBAFGraph` consumers |

This split matters for everything below: the mechanism I recommend for typed
abstention (edge weight 0) is expressible on the *weighted* path and only
expressible as *edge omission* on the production path.

### 0.2 Where the named defect actually lives, quantified

[CODE] `app/qbaf/model.py:30-31` — `ClaimNode.base_score: float = 0.5` and
`final_strength: float = 0.5` are dataclass defaults.
[CODE] `app/qbaf/debate_adapter.py:20` — `DEFAULT_TAU = 0.5`.
[CODE] `app/qbaf/debate_adapter.py:92` — `_tau_for` returns
`(DEFAULT_TAU, "default")` for any node whose judge payload lacks a numeric
`scores.strength`.
[CODE] `app/qbaf/debate_adapter.py:303-327` — that node still gets an
attack/support edge, because polarity is derived from `node_type`
(`PRO`/`CON`), not from whether it was judged.

So the defect is precisely localised: **a PRO/CON claim node with no judge
strength is given τ = 0.5 *and* a live edge into its parent.** Evidence nodes
are already handled correctly — `_evidence_verdict_tau` returns `(None, None)`
for any status other than `supported`/`contradicted`, which means *no edge*
(`debate_adapter.py:95-128`). The right pattern already exists in the codebase
for one node class and is missing for the other.

**[THM-1] (Zero is the neutral element; 0.5 is not.)**
`v ⊕ 0 = 1 − (1 − v)(1 − 0) = v`, so removing a strength-0 argument from a
sibling group leaves the aggregate identical; and `σ(τ, 0, 0) = τ − τ·0 = τ`.
Therefore **"contributes nothing" has an exact encoding in DF-QuAD: strength
0 (or edge weight 0).** No approximation, no epsilon.

**[THM-2] (Magnitude bound on the current defect.)**
Adding one supporter of strength `d` to an existing supporter aggregate `v_s`
gives `v_s' = v_s + d(1 − v_s)`. With no attackers, `Δσ = (1 − τ)·d·(1 − v_s)`.
Maximised at `τ = 0`, `v_s = 0`, `d = 0.5`: **Δσ = 0.5**. Symmetrically for an
attacker, `|Δσ| ≤ τ·d·(1 − vₐ) ≤ 0.5`.
**A single silently-defaulted node can move its parent by up to half the
entire scale.** In the realistic mid-graph case of §(e) it moves the root by
0.10 — ten percentage points from a node nobody judged.

**[THM-3] (Abstention must be enforced at the edge, not at τ.)**
Setting `τ = 0` is sufficient only for a *leaf*. If the abstaining node has
supporters, `σ(0, vₐ, v_s) = 0 + (1 − 0)(v_s − vₐ) = v_s − vₐ > 0` whenever
`v_s > vₐ`. The abstaining node's strength is then resurrected by its own
children and it starts contributing again. The only encoding that is
zero-contribution for **all graph shapes** is `w = 0` on the node's outgoing
edges (weighted path) or omission of those edges (pure path).
*This is the single most important formal result in this packet and it is
cheap to test.*

**[THM-4] (Order independence — exact, but not in float64.)**
`⊕` is the probabilistic-sum t-conorm: commutative and associative. Sibling
order is therefore semantically irrelevant. But `probabilistic_sum`
(`dfquad.py:56-59`) folds left in float64, where associativity holds only to
~1e-16. Since `debate_adapter.py:329-334` hashes τ values into a graph
fingerprint, and golden tests may compare exact floats, **sibling iteration
order must be canonicalised** even though the semantics does not care.

**[THM-5] (Probabilistic sum already assumes sibling independence — so
"corroboration" and "redundancy" are one knob, not two.)**
`1 − ∏(1 − vᵢ)` is exactly `P(at least one of n independent events occurs)`.
DF-QuAD's aggregation therefore *presupposes maximal evidential independence
among siblings*. Consequences:
- There is **no room for a corroboration bonus at the sibling level** — the
  bonus is already baked in and maximal. Any additional "independent families
  corroborate" multiplier double-counts. [LIT-40] (Bovens & Hartmann's
  variety-of-evidence analysis) is the Bayesian statement of why independence
  is what makes multiple sources worth more than one — and why the
  gain *disappears* as sources become correlated.
- The only *correction* the aggregation can need is **downward**, when
  siblings are less independent than assumed. That is the redundancy
  adjustment, and it is the correct and only place for it.

**[THM-6] (Duplication growth, and why the natural discount is exactly right
at both endpoints.)**
`n` exact duplicates of strength `s` aggregate to `1 − (1 − s)ⁿ`. For
`s = 0.45`: n=1 → 0.450, n=2 → 0.698, n=3 → 0.834, n=5 → 0.950. Restating one
vendor claim three ways nearly saturates the supporter channel.
For the adjustment rule `v'ᵢ = vᵢ·∏_{j kept, j≺i}(1 − sim(i,j))`:
- at `sim = 1`, `v'ᵢ = 0` for every copy after the first ⟹ the group
  aggregates to exactly `s` — **exact idempotence**;
- at `sim = 0`, `v'ᵢ = vᵢ` ⟹ **no-op**, i.e. full independence preserved.
Both endpoints are provably correct, which is a real argument for this
instantiation over ad-hoc averaging.

### 0.3 The three-function decomposition (the architecture to adopt)

[LIT-14] Amgoud & David (AAAI 2021) decompose a gradual semantics into
**three** functions rather than two:

1. **adjustment** — updates the strengths of a node's parents *on the basis of
   their mutual similarities*, before any aggregation;
2. **aggregation** — collapses the adjusted parent strengths into one number;
3. **influence** — applies that aggregate to the node's own base score.

[LIT-10] Potyka's modular framework (arXiv:1809.07133, verified via HTML)
gives the two-function version and the properties each part must satisfy —
notably **Stability**: `ι_w(0) = w`, i.e. *no aggregate ⟹ no change from the
initial weight*, which is precisely [THM-1] restated as a design principle. In
that framework DF-QuAD = (Product aggregation, Linear influence).

**[SPEC-A] Recommendation:** refactor the engine to the three-function shape.
`dfquad.py` currently hard-codes aggregation and mediation with no adjustment
slot. Redundancy handling has **nowhere principled to live** until that slot
exists; without it, every duplicate-discount hack will end up mutating τ (an
epistemic claim about a node in isolation) to express a fact about a *group* —
which is a category error that will leak into the provenance display.

### 0.4 Principles that matter here, and where DF-QuAD stands

[LIT-3][LIT-4] Baroni, Rago & Toni's principle-based programme (AAAI 2018;
IJAR 2019) shows that the sprawl of fine-grained properties in the literature
collapses into parametric **balance** and **monotonicity** principles.
[LIT-7][LIT-8] Amgoud, Ben-Naim, Doder & Vesic (IJCAI 2017) and Amgoud &
Ben-Naim (IJCAI 2018) give the axiom sets for *weighted* and *weighted bipolar*
graphs. Practical readings for this engine:

| Principle | Statement (informal) | DF-QuAD | Why it matters here |
|---|---|---|---|
| **Neutrality / Stability** | A parent with strength 0 changes nothing; no parents ⟹ strength = base score | ✔ [THM-1] | Makes typed abstention *exact*. This is the reason to keep DF-QuAD. |
| **Anonymity / order-independence** | Node identity and sibling order are irrelevant | ✔ [THM-4] | Reproducibility; no "first evidence wins". |
| **Directionality** | A node's strength depends only on its ancestors | ✔ (topological sort) | Bounds the blast radius of the value overlay — see [THM-7]. |
| **Monotonicity** | Stronger supporter ⟹ not-weaker parent; stronger attacker ⟹ not-stronger parent | ✔ | Users can predict the effect of adding evidence. |
| **Counting** | *More* attackers ⟹ strictly weaker | ✔ | **Desirable in the abstract setting, a defect here**: it is exactly what makes near-duplicates double-count ([THM-6]). Must be relaxed by adjustment. |
| **Saturation / boundedness** | Strength stays in [0,1] | ✔ | But note the absorbing behaviour below. |
| **Open-mindedness** | Enough attackers drive strength to 0; enough supporters to 1 | ✘ in the limit sense — DF-QuAD's influence is linear and clips | τ = 1 with `v_s > vₐ` stays 1 (`σ = 1 + 0·Δ`); τ = 0 with `vₐ ≥ v_s` stays 0. **τ ∈ {0,1} is one-sided absorbing** — reserve those values deliberately. |

### 0.5 Should the engine switch semantics? (Short answer: no, but know the ceiling.)

| Semantics | Bipolar? | Cycles? | Can express "exactly zero contribution"? | Verdict for this engine |
|---|---|---|---|---|
| **DF-QuAD** [LIT-1] | yes | no (repo raises) | **yes** — 0 is the aggregation identity | **Keep.** Bipolarity + exact neutral element are exactly what typed abstention and the pro/con UI need. |
| h-categorizer [LIT-5] `σ(a) = 1/(1 + Σσ(b))` | no (attacks only) | yes (fixed point) | no — unweighted h-categorizer is asymptotic and never returns 0 | Not usable: no support relation, and no exact zero. |
| Weighted h-categorizer (Hbs) [LIT-7] | no | yes | yes via `w = 0` | Cycles are its selling point, but losing support edges is fatal here. |
| Quadratic-energy / continuous models [LIT-9][LIT-11] | yes | yes (converges empirically; guaranteed acyclic) | yes | **The migration target if cycles ever become in scope.** |
| Convergent wBAG semantics [LIT-29], double-ReLU modular [LIT-30] | yes | yes | (claimed) | 2025–2026 work explicitly aimed at the cyclic + counterintuitive-acyclic-result problems. Watch, don't adopt yet. |

**[SPEC-B]** The acyclicity constraint is a genuine product ceiling: mutual
rebuttal ("A undercuts B" *and* "B undercuts A") is a normal thing for a
stranger to want to read and it is not representable today. If that is ever in
scope, migrate **before** the weight system hardens, not after — the τ table,
the adjustment function and the abstention encoding all survive the migration,
but the topological-order assumption in `debate_adapter` does not.

---

## §(a) — Structural (epistemic) weights: factor-by-factor options and the minimal set

### a.0 The four legal insertion points

The decisive design question is not *which factors* but *where each factor is
allowed to write*. There are exactly four places, and conflating them is the
root cause of most of the failure modes below.

| Slot | Semantic meaning | Legitimate occupants |
|---|---|---|
| **τ (base score)** | A property of the node **in isolation**: how credible is this claim before anyone argues about it? | provenance type, verification status, source class, judged quality, corroboration (if you choose the collapse strategy) |
| **w (edge weight)** | A property of the **relation**: given this node is true, how much does that bear on the parent? | relevance / entailment strength; **abstention (w = 0)** |
| **adjustment** | A property of the **sibling group**: these three say the same thing | semantic redundancy — and *nothing else* |
| **explanation layer** | An **output** of the semantics | centrality, flip-sensitivity, attribution, scrutiny counters |

**[THM-8] Centrality and flip-sensitivity must never be inputs.** They are
defined as functions of the computed strengths (a gradient or a
removal-difference over the final graph). Feeding them back as weights makes
the fixed point self-referential, destroys directionality, and breaks
monotonicity: strengthening a supporter could then *lower* the parent by
changing its own centrality. Any proposal to "weight central nodes more" is a
proposal to abandon the principle set in §0.4.

### a.1 The factor table

Columns: **What it measures** · **Slot** · **Computable from graph+evidence
alone?** · **Failure modes** · **Cost** · **Verdict**.

---

**F1 · Evidence provenance type** (`cited` / `measured` / `derived`)

- *Measures*: the epistemic route by which the node's content was obtained.
- *Slot*: **τ**.
- *Computable*: yes, trivially — the type is already on the node.
  [CODE] `app/evidence/model.py` already carries `EntailmentLabel`,
  `EvidenceStatus`, `SourceRecord.quality_grade`,
  `SourceRecord.corroboration_count`, `SourceRecord.retracted`,
  `statistical_flags`. All the inputs exist.
- *Failure modes*:
  (i) **Type is not quality.** A `measured` benchmark on a synthetic workload
  is worse than a `cited` peer-reviewed RCT. Provenance type alone is a coarse
  prior and must be crossed with verification status and source class.
  (ii) **`derived` is unbounded.** A chain of reasoning can be sound or can be
  the model talking to itself. `derived` is the type most at risk of encoding
  the judge's fluency rather than the claim's warrant.
  (iii) **Grade inflation over time** if the table is edited without version
  control.
- *Cost*: zero marginal — the verdict already exists in the pipeline.
- *Verdict*: **IN — tier 0.**

**F2 · Judged quality**

- *Measures*: a rubric assessment of the node (methodology, sample, recency,
  conflict of interest).
- *Slot*: **τ**, jointly with F1.
- *Computable*: yes, but only as an *ordinal* label.
- *Failure modes*: this is where fabricated confidence re-enters by the back
  door. [LIT-56] Recent work finds LLM verbalized confidence is systematically
  miscalibrated and concentrated in the 80–100% band, and that RLHF worsens it.
  A judge asked for "a number between 0 and 1" will produce a fluent,
  unfalsifiable, uncalibrated float — and it will *look* like provenance
  because a model said it.
- *Cost*: one judge call, already paid.
- *Verdict*: **IN — tier 0, but only as an ordinal label.**

> **[SPEC-C] The τ table — my single strongest recommendation.**
> τ must be a **lookup, not a generation**. Define a versioned table keyed by
> `(provenance_type, verification_status, source_class, corroboration_bucket)`
> → τ. The judge's job is to emit *keys* (categorical, rubric-anchored,
> checkable), never the float. Then:
> - every τ carries `tau_source = "table@v3, row=cited/supported/interested-party/0"` —
>   literally "provenance for every number", satisfiable by a stranger;
> - τ is reproducible across runs and immune to model-version drift;
> - the table is a reviewable policy artefact: an epistemology you can argue
>   about in a PR, rather than a distribution you can only sample;
> - "unjudged" is representable as **absence of a row**, which maps to
>   *no edge* — the defect becomes unrepresentable rather than merely
>   discouraged.
>
> [CODE] The provenance channel is already half-built: `tau_sources` exists in
> `debate_adapter.py` and already distinguishes `verifier_evidence` from
> `judge_strength` from `default`. **The one-line invariant that kills the
> defect class: `tau_source == "default"` becomes an illegal state that fails
> the build, not a fallback.**

---

**F3 · Corroboration across independent evidence families**

- *Measures*: whether the same conclusion is reached by routes that could have
  disagreed.
- *Slot*: **τ (bucket)** *or* **sibling multiplicity** — **pick exactly one**.
- *Computable*: yes, if "family" is defined by provenance ancestry (same
  primary source? same measurement apparatus? same author/org?) rather than by
  claim text.
- *Failure modes*:
  (i) **Double-booking.** By [THM-5], keeping families as separate siblings
  already rewards corroboration through `⊕`. Adding a τ bucket *on top* counts
  the same fact twice. [CODE] `SourceRecord.corroboration_count` exists, which
  suggests the collapse strategy is already half-chosen — but the graph also
  keeps siblings separate. **This is currently ambiguous in the codebase and it
  is a live double-counting risk.**
  (ii) **Fake independence.** Three outlets reprinting one wire story are one
  family. Independence must be established from provenance lineage
  ([LIT-53] W3C PROV's `wasDerivedFrom` is the standard vocabulary for exactly
  this), never assumed from distinct URLs.
  (iii) [LIT-40] More independence does not *always* mean more confirmation —
  the variety-of-evidence thesis has known Bayesian counterexamples when source
  reliability is itself uncertain. Do not sell corroboration as a monotone law.
- *Cost*: lineage extraction; moderate.
- *Verdict*: **IN — tier 0, as a τ bucket, with sibling collapse.** Rationale
  in §(d) Q3; the alternative is defensible but must be chosen explicitly.

---

**F4 · Semantic redundancy between siblings**

- *Measures*: how much of what sibling *j* says is already said by sibling *i*.
- *Slot*: **adjustment** (and only there).
- *Computable*: yes. [LIT-13][LIT-14][LIT-15] Amgoud, Bonzon, Delobelle, Doder,
  Konieczny & Maudet (KR 2018) and Amgoud & David (COMMA 2020, AAAI 2021)
  define exactly this: an adjustment function that reduces parent strengths
  according to their pairwise similarity, applied *before* aggregation, with
  rationality constraints tying the three functions to the semantics'
  principles.
  Concrete instantiation (mine, [SPEC]): order siblings by adjusted strength
  descending with a deterministic tie-break on node id; then
  `v'ᵢ = vᵢ · ∏_{j kept, j≺i} (1 − sim(i,j))`.
  By [THM-6] this is exactly idempotent at `sim = 1` and a no-op at `sim = 0`.
- *Failure modes*:
  (i) **Similarity over the wrong object — the big one.** If `sim` is computed
  over *claim text*, then genuine independent corroboration ("our benchmark
  shows 42%" vs "the vendor claims 40%") gets punished as duplication, and the
  engine systematically destroys the very signal it should reward. `sim` must
  be over **evidence origin/lineage**, with text similarity used only as a
  cheap prefilter. See §(e) E1 where this changes the root by 7 points.
  (ii) **Order sensitivity of greedy discounting.** The keep-strongest-first
  rule is order-dependent when strengths tie; fix with a deterministic
  tie-break or the answer stops being reproducible ([THM-4] applies here too).
  (iii) **Gaming.** An adversary who knows the rule paraphrases *away* from
  the strongest sibling to stay under the threshold. Any thresholded `sim` is
  attackable; continuous discounting degrades more gracefully than a cut-off.
  (iv) **Alternative formalism worth knowing:** [LIT-39] weighted bipolar
  SETAFs let a *set* of arguments jointly attack/support, which is the natural
  way to say "these three are one witness" without any similarity metric at
  all. [LIT-57] Choquet-integral aggregation is the MCDA-native way to encode
  negative interaction (redundancy) among arguments. Both are heavier than an
  adjustment function; neither is needed at v1.
- *Cost*: O(k²) similarity comparisons per sibling group, k = siblings. With
  embeddings that is negligible; with pairwise entailment calls it is
  k(k−1)/2 model calls per group. **Recommend: embedding prefilter, entailment
  only above threshold.**
- *Verdict*: **IN — tier 1.** The highest-value fix after abstention.

---

**F5 · Presence and strength of counter-nodes**

- *Measures*: opposition.
- *Slot*: **none — already the semantics.**
- *Verdict*: **OUT as a weight factor.** DF-QuAD's `vₐ` term *is* this factor.
  A separate "penalise nodes that have attackers" multiplier double-counts.
- **But there is a legitimate residue, and it is not a weight:**

  **[THM-9] DF-QuAD cannot distinguish "unchallenged" from "challenged and
  vindicated."** A node with τ = 0.8 and no attackers, and a node with τ = 0.8
  whose three attackers were all themselves refuted to strength ~0, both
  produce σ = 0.8. The strength channel is *structurally incapable* of carrying
  the difference. Yet for a stranger reading the answer, that difference is
  most of what they want to know.

  **[SPEC-D]** Ship a second, non-fungible channel alongside strength:
  `scrutiny = (attack attempts made, attack attempts resolved)` — a **pair of
  counts, not a float**. Counts cannot be silently defaulted, cannot be
  averaged into a fake number, and read naturally: *"0.81 · 3 challenges
  raised, 3 resolved"* versus *"0.81 · no challenges raised"*. Absence of
  attackers is not evidence of no attackers, and the display must say which
  one it is.

---

**F6 · Node centrality / flip-sensitivity**

- *Measures*: how much the root's answer depends on this node.
- *Slot*: **explanation layer only** ([THM-8]).
- *Computable*: yes, and cheaply.
  - **Analytic gradient** — one reverse pass over the DAG. For a node under a
    supporter-dominant parent (`v_s > vₐ`, `σ = τ + (1−τ)(v_s − vₐ)`):
    `∂σ_parent/∂v_i = (1 − τ)·∏_{k≠i}(1 − v'_k)` for supporters, and
    `−(1 − τ)·∏_{k≠i}(1 − v'_k)` for attackers; chain along the path to the
    root. Cost **O(|V| + |E|)**. Worked numerically in §(e).
  - [LIT-20] Yin, Potyka, Rago, Kampik & Toni's **G-RAEs** are exactly this —
    gradient-based relation-attribution explanations for edge-weighted QBAFs,
    framed as *contestability*: which edge weight, nudged, changes the answer.
  - [LIT-18] argument-attribution explanations (removal- and Shapley-based),
    [LIT-21] impact measures incl. a Shapley variant, [LIT-17] a principle-based
    analysis of contribution functions, and [LIT-19] CE-QArg (counterfactual:
    *what would have to change* for the strength to reach a target) are the
    heavier, more principled alternatives. **Removal-based attribution costs
    O(|E|·(|V|+|E|)) — one re-run per edge.** Start with gradients.
- *Failure modes*: gradients are local; at the DF-QuAD kink (`vₐ = v_s`) the
  derivative is discontinuous, so a gradient near a balanced node understates
  the flip. **Flag near-kink nodes and fall back to an explicit re-run there.**
  (This kink is also precisely the value-hinge condition — see §(c).)
- *Cost*: one extra pass. Negligible.
- *Verdict*: **IN as output, OUT as input — tier 1 (display).**

---

**F7 · Relevance / entailment strength of the edge**

Not in the brief's list, but it is the natural occupant of the `w` slot and it
is already half-present in the repo.

- *Measures*: given this child is true, how much does it bear on this parent?
- *Slot*: **w**.
- *Computable*: [CODE] `EntailmentLabel ∈ {SUPPORTS, REFUTES, NOINFO}` already
  exists in `app/evidence/model.py`. `NOINFO` → `w = 0` is *already* the right
  abstention semantics, one level up.
- *Failure modes*: a second free-floating float per edge is a second place for
  fabricated confidence to hide. Keep it a **small ordinal ladder**
  (`direct / partial / tangential` → `1.0 / 0.6 / 0.25`), table-sourced like τ.
- *Cost*: reuses the entailment call.
- *Verdict*: **IN — tier 2.** Blocked on the production path today: the pure
  `ArgumentGraph` has no edge weights ([CODE] `dfquad.py:83-85`).

---

**F8 · Typed abstention (the anti-factor)**

- *Measures*: that no judgement exists.
- *Slot*: **w = 0** (weighted path) / **edge omission** (pure path). **Never τ**
  — [THM-3].
- *Failure modes*:
  (i) **τ = 0 mistaken for abstention.** τ = 0 means "this claim is false",
  which is a *judgement*, and by [THM-3] it does not even guarantee zero
  contribution. Two different states that must never share an encoding.
  (ii) **Silent omission looks like absence.** If an abstaining node vanishes
  from the computation it must still be *visible* in the served answer, or the
  reader cannot tell a thoroughly-evidenced node from one where half the
  children were dropped. Contributes 0 to strength; contributes 1 to a visible
  "unresolved" list.
  (iii) **Abstention leaking into the parent's τ.** Tempting, and wrong: it
  re-introduces the fake number one level up.
- *Cost*: zero.
- *Verdict*: **IN — tier 0. This is the whole mission.**

**[SPEC-E] Abstention taxonomy** (all propagate identically as 0; they differ
only in display and in what the engine does next):

| Type | Meaning | Engine's next move |
|---|---|---|
| `not_attempted` | never sent for judgement | schedule |
| `pending` | in flight | wait |
| `unavailable` | source could not be reached / paywalled | retry, then escalate |
| `no_info` | source reached, says nothing on point | close, mark |
| `refused` | judge declined (policy, out of competence) | escalate to human |
| `contested_unresolved` | judges disagreed beyond tolerance | escalate to human |
| `retracted` | source withdrawn | close, mark, and *flag every descendant* |

[CODE] `EvidenceStatus` already enumerates `missing / unavailable / refuted /
contradicted / retracted / no_info` — most of this taxonomy exists; what is
missing is the guarantee that all of them route to zero contribution rather
than to `DEFAULT_TAU`.

### a.2 Recommended minimal set

**Tier 0 — ships first; without these the product's core promise is false**

1. **Typed abstention as edge suppression** (F8) — `w = 0` / edge omission,
   never τ. [THM-1][THM-3]
2. **The versioned τ table** (F1 + F2 + F3) — τ is a table lookup keyed by
   categorical judge output; `tau_source` records table version + row; a
   missing row means *no edge*; `tau_source == "default"` becomes an illegal
   state. [SPEC-C]

**Tier 1 — ships next; without these the numbers are wrong in a specific,
predictable direction (too high)**

3. **Sibling redundancy adjustment** (F4) — an adjustment function in the
   Amgoud–David slot, with similarity computed over **evidence lineage**, not
   claim text. [LIT-13][LIT-14][THM-6]
4. **Flip-sensitivity as output** (F6) — analytic gradients, one reverse pass;
   drives both the explanation UI and the hinge detector in §(c).
5. **The scrutiny counter pair** (F5 residue) — counts, never a float. [THM-9]

**Tier 2 — when the pure/weighted path split is resolved**

6. **Edge relevance weight** (F7) — ordinal ladder, table-sourced.

**Explicitly OUT, with reasons**

| Rejected | Why |
|---|---|
| Sibling-level corroboration bonus | Already in `⊕` by [THM-5]; adding it double-counts. |
| Counter-node presence penalty | Already in `vₐ`; adding it double-counts. |
| Centrality as an input weight | Breaks directionality and monotonicity. [THM-8] |
| Free-form LLM confidence floats for τ | The defect wearing a lab coat. [LIT-56] |
| A "default" τ of any value on an unjudged node | [THM-2]: up to 0.5 of silent movement. |

**Total tier-0 cost: near zero.** Both tier-0 items are *removals* — of a
default and of a float generation. That is worth saying plainly to whoever
prioritises this: the fix for fabricated confidence is cheaper than the defect.

---

## §(b) — Value-weight elicitation flows, ranked by user burden

### b.0 Two facts that constrain every flow

**[LIT-45][LIT-44] Swing weights are range-dependent and therefore not
portable.** The swing question is *"which swing — from the worst to the best
level **that is actually on the table in this decision** — would you rather
have?"* A stored profile saying "this user weights safety 0.7" is
**meaningless without the ranges it was elicited against**. This is a hard
constraint on any "user preference profile" product feature: profiles may
store *rankings* (ordinal, more portable) but must re-elicit magnitudes
whenever the option set changes.

**[LIT-49] Direct numeric weight elicitation is the most bias-prone method.**
Anchoring effects are documented across SMART, swing and best-worst.
Combined with the prohibition on fabricated numbers, this points hard toward
**ordinal input + a published surrogate rule** rather than asking anyone for a
float.

### b.1 The flows, ranked (lowest burden first)

---

**Flow 1 — Hinge-triggered minimal sufficient elicitation** ⭐ *recommended default*
**Burden: 0 questions in the common case, 1 ordinal question at a hinge.**

Procedure:
1. Score the graph structurally. No value input at all.
2. Compute, for each candidate hinge, the **flip threshold**: the value
   ordering(s) under which the ranking of the alternatives changes. This is the
   argumentation analogue of MCDA **weight stability intervals**
   ([LIT-50] O'Shea et al. 2025; [LIT-51] sensitivity-analysis review).
3. **If the answer is invariant across every admissible value ordering, ask
   nothing** — and *say so*: "this conclusion does not depend on how you weight
   cost against safety." That statement is itself a deliverable and it is the
   most valuable output of the whole value machinery.
4. Only if the answer flips, ask the single ordinal question that separates the
   branches, phrased with the actual ranges (swing form).

- *Strength*: burden proportional to the decision's actual value-sensitivity;
  never asks a question whose answer cannot change anything.
- *Weakness*: needs the sensitivity machinery from F6 first. Degrades to Flow 0
  when it cannot decide.
- *Worked end-to-end in §(e) E2, where this flow reduces to one question.*

---

**Flow 0 — Named audiences (the no-elicitation fallback)**
**Burden: 0 questions; requires self-recognition.**

[LIT-33] Bench-Capon's VAFs formalise exactly this: an **audience** is an
ordering over values, and the same graph yields different outcomes for
different audiences. Ship a small library of *named, published* orderings
("cost-first", "safety-first", "reversibility-first") and let the reader pick a
label — or pick none.

- *Strength*: zero interaction cost; the label is human-readable provenance
  ("decided under the *safety-first* audience"), which is exactly what the
  answer must display.
- *Weakness*: the library is a product claim you must defend; a mislabelled
  audience is a value put in the user's mouth.
- **Hard rule: there is no default audience.** No ordering asserted ⟹ the
  answer shows the branch set and no aggregate. Picking a default audience is
  fabricated confidence in the value dimension.

---

**Flow 2 — Ordinal swing ranking + rank-order-centroid surrogate weights**
**Burden: one ranking of k values (k − 1 comparisons), no numbers.**

[LIT-44] Edwards & Barron's **SMARTER** is precisely "SMARTS minus the second
elicitation step, substituting calculations based on ranks." Rank the value
*swings* (range-anchored), then apply ROC:

  `wᵢ = (1/k) · Σ_{j=i..k} (1/j)`

For k = 2: `w₁ = 0.75`, `w₂ = 0.25`. For k = 3: `0.611, 0.278, 0.111`.
For k = 4: `0.521, 0.271, 0.146, 0.062`.

- *Strength*: **no number is ever elicited**, which is exactly the anti-fabrication
  posture — the numbers come from a *published formula* applied to an ordinal
  input, so their provenance is `ROC(k), rank=[safety, cost]`, fully auditable.
  [LIT-48] surrogate weights of this family have been studied for robustness
  and hold up well.
- *Weakness*: ROC assumes the true weights are uniformly distributed over the
  rank-consistent simplex. That assumption is a modelling choice and must be
  displayed as one, not hidden.
- *Use when*: ≥ 3 values are live, or magnitudes (not just order) matter.

---

**Flow 3 — Qualitative pairwise differences (MACBETH)**
**Burden: up to k(k−1)/2 qualitative judgments.**

[LIT-46] MACBETH elicits only **non-numerical** judgments of *difference in
attractiveness* on a six-category ladder (very weak → extreme) and constructs
an interval scale by linear programming, with built-in consistency checking.

- *Strength*: still no numbers from the user; produces a defensible interval
  scale with an auditable consistency check. Right for a high-stakes hinge with
  a named human owner.
- *Weakness*: O(k²) burden; needs a facilitator mindset.
- *Use when*: the hinge is expensive, contested, and will be revisited.

---

**Rejected: AHP ratio-scale pairwise comparison.**
[LIT-41] Saaty's 1–9 ratio scale with eigenvector priorities is the best-known
method and the wrong one here. [LIT-42][LIT-43] The rank-reversal critique
(Belton & Gear 1983; Dyer 1990, *Management Science*) shows that adding an
irrelevant alternative can reverse the ranking of the existing ones — which in
this product would manifest as *"the answer changed because we found one more
option, not because we found one more fact"*, i.e. a value-layer version of
the exact defect being killed. Use AHP only with a frozen alternative set, and
even then prefer Flow 2.

### b.2 Ranking summary

| Rank | Flow | Questions | Numbers from user? | Best for |
|---|---|---|---|---|
| 1 | **Hinge-triggered minimal** | 0–1 | never | default; most decisions |
| 2 | **Named audiences** | 0 | never | fallback / anonymous reads |
| 3 | **Ordinal swing + ROC** | k − 1 | never | ≥3 live values, magnitudes matter |
| 4 | **MACBETH** | ≤ k(k−1)/2 | never (qualitative only) | high-stakes, owned, revisited |
| — | ~~AHP~~ | k(k−1)/2 | yes (1–9 ratios) | **not recommended** |

**Anti-patterns to write into the spec**
1. Asking for a numeric weight. [LIT-49]
2. Asking *before* showing the hinge and its ranges — produces context-free
   weights and violates the swing construction. [LIT-45]
3. Reusing stored magnitudes across decisions with different ranges. [LIT-45]
4. Filling in a default value ordering when none was asserted.

---

## §(c) — How a value overlay sits on the evidence-scored graph

### c.0 Design commitment

> **The value overlay never writes to τ and never writes to a node's strength.
> It acts on *edges*, only at marked hinges, and it produces *a second scored
> graph*, not a modified one.**

Rationale: τ is an epistemic claim about a node in isolation. A value is not
evidence about the node. Writing a preference into τ makes the two
indistinguishable downstream, which is the fabricated-confidence defect in its
subtlest form — a *sourced-looking* number whose source is a preference.

This puts me in explicit tension with the freshest and most relevant
literature, and I want that tension on the record for the reviewers:

- [LIT-32] Battaglia, Baroni, Rago & Toni (SUM 2024) integrate user preferences
  into gradual bipolar argumentation for personalised decision support.
- [LIT-31] Civit, Rago, Andriella, Alenyà & Toni (arXiv:2602.14674, 2026)
  define **base-score extraction functions**: a mapping from user preferences
  over arguments *into base scores*, turning a preference-annotated BAF into a
  QBAF so the standard gradual machinery applies. They even model
  non-linearities in human preference.

That is elegant, current, and validated in robotics and review aggregation. It
is **the wrong choice for this product**, because this product's contract is
"every number carries provenance and value-decided hinges are visibly marked."
A preference laundered into a base score is provenance-*shaped* but not
provenance-*bearing*: the reader sees `τ = 0.72` and cannot tell it came from a
preference rather than from a measurement. **Adopt their formalism, reject
their insertion point.**

### c.1 Three formal mechanisms, and which to take

| # | Mechanism | Formal basis | Verdict |
|---|---|---|---|
| **C1** | Tag each edge with the value it promotes; an audience ordering determines whether (and how strongly) the edge is admitted | [LIT-33] Bench-Capon VAFs: *"an attack succeeds only if the attacked argument's value is not preferred to the attacker's by the audience"* | **Take as the mechanism.** Binary or ordinal edge admission; no invented numbers. |
| **C2** | Make the value preference *itself an argument that attacks the edge* | [LIT-34] Modgil's EAFs (attacks on attacks); [LIT-24] Amgoud, Doder & Lagasquie-Schiex, JAIR 86 (2026) — weighted higher-order AFs where attacks carry weights and are themselves attackable | **Take as the display/representation.** The value becomes a first-class, visible, *contestable* node — exactly what "mark it as value-decided" means. |
| **C3** | Map preferences into base scores | [LIT-31][LIT-32] | **Reject for this engine.** Launders a value into an epistemic number. |

### c.2 Hinge detection

A node `n` is a **value hinge** iff all three hold:

1. **Bipolar contention** — `n` has ≥ 2 children of opposite polarity;
2. **Evidential indecision** — `|v_s − vₐ| ≤ ε` at `n`, i.e. the node sits at
   (or within ε of) DF-QuAD's mediating kink, where `σ = τ` and the evidence
   has, literally, moved nothing;
3. **Value divergence** — the dominant supporter and dominant attacker carry
   *different* value tags.

Condition 2 is exactly the point where the analytic gradient is discontinuous
(§a, F6) — so the flip-sensitivity pass and the hinge detector are **the same
computation**, which is a pleasing economy: one reverse pass produces both the
explanation and the hinge set.

Condition 3 requires a value vocabulary. **[SPEC-F]** Keep it small and closed
(≈6–10 tags: `cost`, `latency`, `safety`, `privacy`, `reversibility`,
`effort`, `fairness`, `speed-to-market`). An open vocabulary makes hinges
undetectable because no two branches ever share a tag namespace.

`ε` is a human decision — see §(d) Q5.

### c.3 What the overlay computes

At each hinge, the engine does **not** produce one number. It produces a
**branch set**:

```
hinge: n42 "Which retention policy?"
  evidential_delta: 0.02          # |v_s − v_a|, below ε
  abstentions_on_either_branch: 0 # both branches fully evidenced
  values_in_tension: [cost, incident-safety]
  branches:
    - ordering: [cost > incident-safety]        → P30  0.803 | P400 0.197
    - ordering: [incident-safety > cost]        → P400 0.790 | P30  0.210
  flip_condition: "the ranking alone decides; no intermediate weighting
                   yields a different winner"
  value_source: unset             # ⟹ no aggregate is served
```

Edge re-weighting under an ordering (**[SPEC-G]**): normalise the ROC weights
so the top-ranked value's edges get `w = 1.0` and value `v`'s edges get
`w = w_v / w_top`. For k = 2 this is `1.0` and `0.25/0.75 = 0.333`. The value
weights are *never* invented — they are ROC applied to an ordinal input, and
the provenance string is `ROC(k=2), rank=[…], asked <timestamp>`.

### c.4 The blast-radius theorem — why this is safe and cheap to verify

**[THM-7]** DF-QuAD is **directional**: `σ_n` depends only on `τ_n` and the
strengths of `n`'s in-neighbours, transitively (this is what the topological
sort in `dfquad.py:113-140` *is*). Therefore if the overlay modifies only edges
incident to a hinge `h`, the only nodes whose strengths can differ between
branches are `h` and `h`'s transitive successors — i.e. **the path from the
hinge to the root, and nothing else**. Every other node is bit-identical across
every branch. ∎

Two payoffs:
- **A test the engineers can write today**: assert bitwise equality of all
  non-successor node strengths across branches. If it fails, the overlay has
  leaked into the structural layer, which is the failure mode that would
  destroy the product's credibility silently.
- **Cost**: O(#branches × path length), not O(#branches × |V|). Negligible.

### c.5 The served answer

Every hinge must render, in a stranger's language:

1. **The abstention line** — "both options were fully evidenced; nothing was
   left unjudged on either branch." (Or, if not: name what is missing. The
   reader must be able to tell *evidence was silent* from *evidence was
   conflicting* — these are different situations with the same Δ.)
2. **The value declaration** — "the evidence does not decide this; the answer
   depends on how you weight **cost** against **incident safety**. That is a
   value judgement, not a finding."
3. **The branch table** — one row per admissible ordering.
4. **The flip statement** — the minimum change in ordering/weight that changes
   the answer. This is the MCDA weight-stability-interval idea [LIT-50] applied
   to an argument graph, and it is what makes the value decision *contestable*
   ([LIT-20] contestability; [LIT-19] counterfactuals; [LIT-35] argumentative
   XAI survey).
5. **The value provenance line** — `value_source ∈ {audience_label,
   user_ranking(ts, method), unset}`. **`unset` ⟹ no aggregate number is
   served at all**, only the branch set.
6. **The counterfactual** — "had you ranked cost first, this would read P30."

This is not a novel UX invention; it is the standard of care in
**preference-sensitive** medical decisions. [LIT-52] Patient decision aids
exist precisely for decisions where "a single most appropriate option cannot be
decided based on evidence alone", and IPDAS requires balanced presentation of
options plus explicit **values-clarification methods**. The engine should
behave like a decision aid at a hinge and like an evidence summary everywhere
else — and should never blur the two.

### c.6 Interaction rules (invariants worth encoding as tests)

| # | Invariant |
|---|---|
| I1 | A non-hinge, non-successor node has identical strength in every branch. [THM-7] |
| I2 | The overlay never writes τ. |
| I3 | `value_source == unset` ⟹ no scalar is served at the hinge or above it. |
| I4 | A hinge is never created by abstention. If `|v_s − vₐ| ≤ ε` *because* half the children abstained, that is an **evidence gap**, not a value hinge — and the answer must say "we don't know yet", not "this depends on your values". **These two failure modes look identical in the number and are opposite in meaning.** Gate hinge detection on zero abstentions in the contending subtrees. |
| I5 | Value tags are drawn from the closed vocabulary; unknown tag ⟹ no hinge, log it. |

I4 is, in my judgement, the most dangerous confusion available to this design
and it deserves an explicit named test.

---

## §(d) — Open decisions a human owner must still make

Each: the question, why the literature cannot answer it, the options, and the
cost of getting it wrong.

**Q1 — Is τ a lookup or a generation?**
*Literature can't decide*: this is a policy choice about who owns the
engine's epistemology.
*Options*: (a) versioned τ table keyed by categorical judge output
[recommended]; (b) judge emits the float directly; (c) hybrid — table prior,
judge allowed to move one notch with a written reason.
*Cost of getting it wrong*: with (b) you have no reproducibility and no
provenance, only fluent numbers; and [LIT-56] says those numbers cluster at
0.8–1.0 regardless of truth.

**Q2 — Who owns the τ table, and what is its change-control process?**
A τ table is a policy document: it encodes "a vendor blog is worth 0.45 and a
preregistered replication is worth 0.85." Editing it silently shifts every
number in every answer, retroactively.
*Options*: engineering-owned with PR review; editorial-owned with a published
changelog; versioned-and-pinned per answer (answers cite the table version
they were scored under) [recommended].
*Cost*: unversioned edits mean two identical questions asked a month apart get
different numbers with no explanation available to the reader.

**Q3 — Corroboration: τ bucket, or sibling multiplicity? (Pick one.)**
By [THM-5] both is double-counting. [CODE] `SourceRecord.corroboration_count`
suggests bucket; the graph shape suggests multiplicity. **The codebase
currently implies both.**
*Cost*: silently inflated strength on exactly the well-evidenced claims you
most want to be right about — the failure is invisible because it looks like
success.

**Q4 — Similarity over what?**
Claim text, evidence lineage, or both?
*Recommendation*: lineage primary, text as prefilter.
*Cost of text-only*: the engine punishes genuine independent corroboration as
duplication — it gets *systematically less confident the more independent
confirmation it finds*. §(e) E1 shows this costs 7 points on one root.

**Q5 — What is ε (the "evidence didn't decide" band)?**
*Options*: (a) a fixed constant (0.03? 0.05?); (b) derived from the graph's own
sensitivity — e.g. `ε = ` the largest single-node flip magnitude, so "evidence
didn't decide" means "one plausible τ-table notch would flip it"
[recommended, [SPEC]]; (c) derived from τ-table granularity — ε = one row step.
*Cost*: too small ⟹ hinges never fire and values decide silently through the
τ table (see §(e) E2, where a 0.01 τ difference decides a values question); too
large ⟹ the product asks value questions about things evidence settled.

**Q6 — Do all abstention types propagate identically?**
My claim: yes — all propagate as exactly 0, and differ only in display and in
the engine's next action ([SPEC-E]).
*Counter-position a reviewer might take*: `retracted` is *not* the same as
`not_attempted` — a retraction is positive information that the claim's support
has been withdrawn, arguably an attack rather than a silence.
*Cost*: if `retracted` propagates as 0, a debunked claim and an unexamined one
look the same to the scorer.

**Q7 — Does the engine ship a second channel, and is it allowed to be a float?**
The scrutiny pair [SPEC-D], the abstention list, the coverage fraction.
*My position*: counts, never floats — a float is silently defaultable, a count
is not.
*Cost*: a "confidence" float alongside "strength" reintroduces the entire
defect one column to the right.

**Q8 — What does the API return at a hinge with no asserted value ordering?**
A branch set (no scalar) is correct and **breaks every downstream consumer
expecting one float**. A scalar-plus-flag is compatible and is a lie the moment
anyone ignores the flag.
*Cost*: this is an API-shape decision with schema, caching, and ranking
consequences; it is much cheaper to make now than after v1 consumers exist.

**Q9 — Is a stored user value profile ever reusable across decisions?**
[LIT-45] says swing magnitudes are range-dependent and therefore not portable.
*Options*: store rankings only and re-elicit magnitudes; store nothing;
store with an explicit expiry keyed to the option-set fingerprint.
*Cost*: a reused profile silently applies yesterday's ranges to today's
question, and the provenance line will *say* it was elicited — which is worse
than having no profile.

**Q10 — Are named audiences a product claim we will defend?**
Shipping "cost-first" and "safety-first" labels means asserting that those are
coherent, recognisable stances.
*Cost*: a mislabelled audience puts a value in the user's mouth and attributes
it to them in writing.

**Q11 — Are cycles in scope?**
If mutual rebuttal is ever needed, DF-QuAD is a dead end ([CODE]
`CyclicGraphError`) and the migration should precede the weight work
([LIT-9][LIT-29][LIT-30]).
*Cost*: retrofitting a fixed-point semantics after the τ table, abstention
encoding and hinge detector have hardened means redoing the propagation
contract with live data.

**Q12 — Which propagation path is canonical?**
[CODE] The production adapter builds the *unweighted* `ArgumentGraph`
(`debate_adapter.py:331`), while `semantics.py` supports edge weights. Typed
abstention as `w = 0` and edge relevance (F7) both require the weighted path.
*Cost*: shipping abstention as edge-omission on one path and edge-weight-0 on
the other guarantees the two paths disagree on some graph, and the disagreement
will be found by a user, not a test.

---

## §(e) — Worked examples

### E1 — Mini argument map, numbers propagated step by step

**Root R** — *"Ship the new caching layer this quarter."*
τ_R = 0.50, `tau_source = editorial_prior` — **a declared "no position before
evidence" prior on a root claim, which is legitimate precisely because it is
declared. The same 0.50 arriving as a silent fallback on an unjudged leaf is
the defect.** That distinction is the whole design in one line.

| Node | Polarity → R | Claim | Provenance | τ | `tau_source` |
|---|---|---|---|---|---|
| S1 | support | "Our benchmark: p99 latency −42%" | measured | 0.85 | `verifier_evidence` |
| S2 | support | "Vendor blog reports −40% latency" | cited (interested party) | 0.45 | `table@v1` |
| S3 | support | "Vendor case study reports ~40% improvement" | cited (**same origin as S2**) | 0.45 | `table@v1` |
| A1 | attack | "Cache-invalidation bug class unmitigated" | derived | 0.60 | `table@v1` |
| A2 | attack | "On-call load would rise" | **unjudged** | — | — |
| A3 | attack → **S1** | "Benchmark ran on a synthetic workload" | derived | 0.55 | `table@v1` |

**Step 1 — leaves.** No children ⟹ σ = τ:
`σ(A3) = 0.55`, `σ(S2) = 0.45`, `σ(S3) = 0.45`, `σ(A1) = 0.60`.

**Step 2 — S1** (attacked by A3):
`vₐ = 0.55`, `v_s = 0`; `vₐ ≥ v_s` ⟹
`σ(S1) = 0.85 − 0.85 × 0.55 = 0.85 × 0.45 = **0.3825**`.
Note how hard that bites: a single `derived` methodological objection cuts a
strong measured result by 55%. Whether that is right is a τ-table question
(Q1/Q2), not a semantics question.

---

**Scenario (i) — today's behaviour.** A2 is unjudged, so
[CODE] `_tau_for` returns `(0.5, "default")` and the CON node still gets an
attack edge.

`v_s = 1 − (1−0.3825)(1−0.45)(1−0.45) = 1 − 0.6175 × 0.55 × 0.55`
` = 1 − 0.186794 = **0.813206**`
`vₐ = 1 − (1−0.60)(1−0.50) = 1 − 0.40 × 0.50 = **0.800000**`
`v_s > vₐ` ⟹ `σ(R) = 0.5 + 0.5 × (0.813206 − 0.800000) = **0.5066**`

> Served today: **0.51 — "marginally favourable."**

**Scenario (ii) — typed abstention.** A2 is unjudged ⟹ **no edge** (pure path)
/ `w = 0` (weighted path). By [THM-1] its contribution is exactly zero.

`vₐ = 0.600000` (A1 only), `v_s = 0.813206` unchanged
`σ(R) = 0.5 + 0.5 × (0.813206 − 0.600000) = **0.6066**`

> **Δ = +0.10.** One node that nobody judged was silently costing the root ten
> percentage points. This is [THM-2] at realistic parameters. Nothing about
> A2 changed — we merely stopped pretending to know.

**Scenario (iii) — abstention + redundancy adjustment.** S2 and S3 restate one
vendor claim: `sim(S2,S3) = 0.90` (shared lineage). S1 is our own measurement,
a genuinely different evidence family: `sim(S1,·) = 0.0` — **even though its
claim text is nearly identical to S2's.** This is exactly the trap in §a-F4(i):
text similarity would say ~0.8 and destroy the corroboration.

Rank by strength, deterministic tie-break by node id: S2 (0.45), S3 (0.45),
S1 (0.3825).
`v'(S2) = 0.45`
`v'(S3) = 0.45 × (1 − 0.90) = 0.045`
`v'(S1) = 0.3825 × (1 − 0.0) = 0.3825`

`v_s = 1 − (1−0.45)(1−0.045)(1−0.3825) = 1 − 0.55 × 0.955 × 0.6175`
` = 1 − 0.324342 = **0.675658**`
`vₐ = 0.600000`
`σ(R) = 0.5 + 0.5 × (0.675658 − 0.600000) = **0.5378**`

---

**The punchline.**

| Scenario | σ(R) |
|---|---|
| (i) today — both defects live | **0.5066** |
| (ii) abstention fixed only | 0.6066 |
| (iii) abstention + redundancy fixed | **0.5378** |

The two defects have **opposite signs and partially cancel**. Today's 0.51 is
within 0.03 of the corrected 0.54 — *by accident*. Two independent errors of
roughly 0.10 and −0.07 happen to nearly annihilate on this graph, and on the
next graph they will not.

**This is the single most important operational finding in the packet: you
cannot validate this scorer by eyeballing its outputs.** The outputs look
plausible while being assembled from a fabricated number and a double-count.
Only per-factor tests — "does an unjudged node change any parent?", "do two
copies of one source aggregate like one?" — can catch it.

---

**Flip-sensitivity (F6), computed analytically on scenario (iii).**
With `v_s > vₐ` and τ_R = 0.5, `σ(R) = τ + (1−τ)(v_s − vₐ)`, so
`∂σ(R)/∂v'_i = (1−τ)·∏_{k≠i}(1 − v'_k)` for supporters, `−(1−τ)` for the lone
attacker.

| Node | ∂σ(R)/∂(its own strength) | Reading |
|---|---|---|
| **A1** | `−0.5` | the most decision-relevant node in the graph |
| **S1** | `0.5 × (1−0.45)(1−0.045) = 0.5 × 0.52525 = **0.2626**` | |
| **S2** | `0.5 × (1−0.045)(1−0.3825) = 0.5 × 0.5897125 = 0.2949` | |
| **S3** | `0.5 × (1−0.45)(1−0.3825) × 0.10 = 0.5 × 0.339625 × 0.10 = **0.0170**` | **≈15× less influential than S1** — which is the correct answer, and the number the adjustment function bought us |

**The flip statement the answer should carry:**
`σ(R)` crosses its neutral point (0.50, where `v_s = vₐ`) when `σ(A1)` reaches
`0.6757`. A1's τ is 0.60 from the `derived` row of the τ table. **One notch up
that table — someone actually *measuring* the invalidation bug rate instead of
reasoning about it — flips this answer.** That is the sentence a stranger needs,
and it costs one reverse pass to compute.

**And the scrutiny channel [THM-9]:** A1 has zero attack attempts against it.
Its 0.60 is an unexamined `derived` claim carrying the largest gradient in the
graph. Strength alone cannot say that; `scrutiny(A1) = (0 raised, 0 resolved)`
can.

---

### E2 — A cheap-vs-safe value hinge

**Question** — *"Which retention policy should we adopt for user event logs?"*
Two alternatives, each a sub-claim of the root, each with one supporter and one
attacker. **All four leaves are `measured`. There are zero abstentions.**

| Node | Claim | Provenance | τ | Value tag |
|---|---|---|---|---|
| C1 → supports P30 | "Storage cost $4.1k/mo (vs $53k/mo at 400d)" | measured | 0.90 | `cost` |
| F1 → attacks P30 | "Only 61% of 42 past incidents reconstructable from 30d logs" | measured | 0.88 | `incident-safety` |
| F2 → supports P400 | "96% of the same 42 incidents reconstructable" | measured | 0.88 | `incident-safety` |
| C2 → attacks P400 | "13× storage cost" | measured | 0.90 | `cost` |

τ(P30) = τ(P400) = 0.50, `editorial_prior`.

**Structural scoring (no value input):**

`σ(P30)`: `v_s = 0.90`, `vₐ = 0.88`; `v_s > vₐ` ⟹ `0.5 + 0.5(0.02) = **0.51**`
`σ(P400)`: `vₐ = 0.90 ≥ v_s = 0.88` ⟹ `0.5 − 0.5(0.02) = **0.49**`

**Read that carefully.** The engine has just ranked P30 above P400. The entire
0.02 margin comes from τ_cost = 0.90 sitting one hundredth above
τ_safety = 0.88 in the τ table — a difference about *how well each fact was
established*, not about *which fact matters more*.

> **Without a hinge marker, the τ table silently resolves a values question.**
> That is a *second* species of fabricated confidence: not a number without
> provenance, but a number whose provenance is real and whose *authority is
> borrowed*. It is harder to see than a bare 0.5 default and it is arguably
> worse, because the audit trail looks clean.

**Hinge detection** (§c.2): (1) opposite-polarity children ✔; (2)
`|v_s − vₐ| = 0.02 ≤ ε = 0.05` ✔; (3) dominant supporter/attacker carry
different value tags (`cost` vs `incident-safety`) ✔; and invariant I4:
abstentions on either branch = 0 ✔ (so this is a genuine value hinge, not an
evidence gap). **HINGE FIRES.**

**The overlay (Flow 1 → Flow 2 with k = 2).**
ROC for k = 2: `w₁ = ½(1/1 + 1/2) = 0.75`, `w₂ = ½(1/2) = 0.25`. Normalised
edge weights ([SPEC-G]): top value's edges `w = 1.0`, other value's edges
`w = 0.25/0.75 = 0.3333`.

*Branch "cost-first"* (`cost > incident-safety`):
`σ(P30)`: `v_s = 0.90 × 1.0 = 0.900`, `vₐ = 0.88 × 0.3333 = 0.2933`
  ⟹ `0.5 + 0.5(0.6067) = **0.803**`
`σ(P400)`: `v_s = 0.88 × 0.3333 = 0.2933`, `vₐ = 0.90 × 1.0 = 0.900`
  ⟹ `0.5 − 0.5(0.6067) = **0.197**`

*Branch "safety-first"* (`incident-safety > cost`):
`σ(P30)`: `v_s = 0.90 × 0.3333 = 0.300`, `vₐ = 0.88 × 1.0 = 0.880`
  ⟹ `0.5 − 0.5(0.580) = **0.210**`
`σ(P400)`: `v_s = 0.880`, `vₐ = 0.300` ⟹ `0.5 + 0.5(0.580) = **0.790**`

**Flip condition.** Under this scheme P400 beats P30 **iff** `w_safety >
w_cost`, i.e. iff the *ranking* swaps. There is no intermediate weighting that
produces a third outcome. So **the ordinal question fully determines the
answer, and no magnitude needs to be elicited at all.** Flow 1 collapses to a
single question:

> *"Storage cost swings from $4.1k/mo to $53k/mo — 13×. Incident
> reconstructability swings from 61% to 96% of the last 42 incidents. Which of
> those two swings would you rather have?"*

Note the form: **range-anchored, both directions named, no numbers requested.**
That is swing weighting as [LIT-45] specifies it, and it is why the answer
cannot be reused on a different option set (Q9).

**The served answer at the hinge:**

```
RETENTION POLICY — this is a VALUE-DECIDED question.

  Evidence does not decide it. Both options are fully evidenced —
  four measured findings, zero unjudged inputs — and they finish
  0.02 apart, inside the ±0.05 band where this scorer does not
  distinguish. The 0.02 comes from how well each fact was
  established, not from which one matters more.

  The decision turns on: storage cost  vs  incident reconstructability.

    If you rank COST first    → 30-day retention     (0.80 vs 0.20)
    If you rank SAFETY first  → 400-day retention    (0.79 vs 0.21)

  The ranking alone decides. No intermediate weighting changes the
  winner, so we only need to ask you one question — not for numbers.

  value_source: unset        ← no single score is shown until you answer
  structural_score: 0.51 / 0.49   (shown for audit; NOT a ranking)
```

If the reader answers, the line becomes
`value_source: user_ranking(2026-08-03T14:02Z), method: swing→ROC(k=2),
rank=[incident-safety, cost]` — and the counterfactual stays visible:
*"had you ranked cost first, this would read 30-day."*

If the reader declines, **no aggregate is ever served** (invariant I3). Both
branches stand. That is the correct behaviour and it is the behaviour the
current engine cannot express, because today it would serve `0.51` and the
reader would never learn that a values question had been answered on their
behalf by a provenance-grading table.

**Where this example would need a heavier flow:** if the coverage numbers were
61% vs 68% instead of 61% vs 96%, the *magnitude* of the safety swing would
matter and ranking alone would not determine the winner — Flow 2's ROC weights
would carry real load, and for a high-stakes version Flow 3 (MACBETH) would be
warranted. And if a third option existed (90-day retention), Flow 1's
stability-interval computation becomes genuinely necessary rather than a
formality, and AHP's rank-reversal problem [LIT-42][LIT-43] becomes an active
hazard rather than a theoretical one.

---

## §(f) — Bibliography with verification status

**Status key**
- **V** — metadata (authors + title + venue/year) confirmed from a publisher,
  proceedings, arXiv abstract, or dblp page I actually retrieved.
- **P** — existence and title confirmed; one or more of authors / venue / pages
  taken from a search-engine summary or an inferred URL, not read directly.
- **S** — *content* claim sourced from a secondary rendering (search summary or
  third-party HTML), not from the primary text.
- **U** — unverified in a stated respect; named explicitly.
- Environment limitation: **no PDF text extraction was available**
  (`poppler`/`pypdf`/`pdftotext` all absent; `WebFetch` returned raw binary for
  PDF URLs). Papers I could only reach as PDFs are **P** or **S**, never **V**.

### Gradual / quantitative argumentation semantics

| # | Citation | Status |
|---|---|---|
| 1 | Rago, A., Toni, F., Aurisicchio, M., Baroni, P. **Discontinuity-Free Decision Support with Quantitative Argumentation Debates.** KR 2016, pp. 63–73. | **V** (dblp `conf/kr/RagoTAB16`; AAAI proceedings page). Formulas cross-checked against the repo's own implementation. |
| 2 | Baroni, P., Romano, M., Toni, F., Aurisicchio, M., Bertanza, G. **Automatic evaluation of design alternatives with quantitative argumentation.** *Argument & Computation* 6(1):24–49, 2015. (QuAD, DF-QuAD's predecessor.) | **V** (IOS Press article page). |
| 3 | Baroni, P., Rago, A., Toni, F. **How Many Properties Do We Need for Gradual Argumentation?** AAAI 2018, pp. 1736–1743. | **V** (AAAI/OJS listing). |
| 4 | Baroni, P., Rago, A., Toni, F. **From fine-grained properties to broad principles for gradual argumentation: A principled spectrum.** *Int. J. Approximate Reasoning* 105:252–286, 2019. | **V** (ScienceDirect + Imperial Spiral). Content (balance/monotonicity as unifying principles) **S**. |
| 5 | Besnard, P., Hunter, A. **A logic-based theory of deductive arguments.** *Artificial Intelligence* 128:203–235, 2001. (Origin of the h-categoriser.) | **V** (ScienceDirect `S0004370201000716`). |
| 6 | Amgoud, L., Ben-Naim, J. **Ranking-based semantics for argumentation frameworks.** SUM 2013. | **P** — existence confirmed (Semantic Scholar); venue/pages not confirmed on a proceedings page. |
| 7 | Amgoud, L., Ben-Naim, J., Doder, D., Vesic, S. **Acceptability Semantics for Weighted Argumentation Frameworks.** IJCAI 2017, pp. 56–62. | **V** (IJCAI proceedings + HAL `hal-02326004` + ACM DL). The Hbs recurrence `s(a)ⁿ⁺¹ = σ(a)/(1 + Σ π(b,a)·s(b)ⁿ)` is **S** — reported by a secondary source; I could not read the PDF. |
| 8 | Amgoud, L., Ben-Naim, J. **Weighted Bipolar Argumentation Graphs: Axioms and Semantics.** IJCAI 2018, doi 10.24963/ijcai.2018/720. | **V** (IJCAI proceedings + OATAO). Individual axiom statements **U** — I could not read the text. |
| 9 | Potyka, N. **Continuous Dynamical Systems for Weighted Bipolar Argumentation.** KR 2018. | **V** (AAAI-hosted proceedings PDF). |
| 10 | Potyka, N. **Extending Modular Semantics for Bipolar Weighted Argumentation (Technical Report).** arXiv:1809.07133. | **V** — *read via ar5iv HTML*. Source of the modular decomposition, the Stability condition `ι_w(0) = w`, the DF-QuAD = (Product, Linear) identification, and the contraction/convergence condition. Highest-confidence technical source in this packet. |
| 11 | Potyka, N. **A Tutorial for Weighted Bipolar Argumentation with Continuous Dynamical Systems and the Java Library Attractor.** arXiv:1811.12787. | **P**. |
| 12 | Mossakowski, T., Neuhaus, F. **Modular semantics and characteristics for bipolar weighted argumentation graphs.** 2018. | **P/S** — cited *by* [29] as the only prior converging (restricted) semantics; I did not retrieve it directly. |
| 13 | Amgoud, L., Bonzon, E., Delobelle, J., Doder, D., Konieczny, S., Maudet, N. **Gradual Semantics Accounting for Similarity between Arguments.** KR 2018. HAL `hal-01872590`. | **P** — author list from search summaries of HAL/dblp records; PDF text not read. |
| 14 | Amgoud, L., David, V. **A General Setting for Gradual Semantics Dealing with Similarity.** *AAAI* 35(7):6185–6192, 2021. doi 10.1609/aaai.v35i7.16769. | **V** — *AAAI OJS article page retrieved*: authors, pages, DOI, abstract, and the adjustment/aggregation/influence decomposition all confirmed. Primary source for the adjustment slot. |
| 15 | Amgoud, L., David, V. **An Adjustment Function for Dealing with Similarities.** COMMA 2020, doi 10.3233/FAIA200494. | **P** (IOS Press DOI seen in results; not retrieved). |
| 16 | Amgoud, L., Doder, D. **Gradual Semantics Accounting for Varied-Strength Attacks.** AAMAS 2019. | **V** (IRIT-hosted PDF + AAMAS'19 proceedings listing). |
| 17 | Kampik, T., et al. **Contribution functions for quantitative bipolar argumentation graphs: A principle-based analysis.** *Int. J. Approximate Reasoning*, 2024. `S0888613X24001427`; arXiv:2401.08879. | **P** — title/venue/DOI confirmed; **full author list U** ("Kampik et al." from search). |
| 18 | Yin, X., Potyka, N., Toni, F. **Argument Attribution Explanations in Quantitative Bipolar Argumentation Frameworks.** ECAI 2023, FAIA 372:2898–2905, doi 10.3233/FAIA230603. | **V**. |
| 19 | Yin, X., Potyka, N., Toni, F. **CE-QArg: Counterfactual Explanations for Quantitative Bipolar Argumentation Frameworks.** KR 2024, pp. 697–707; arXiv:2407.08497. | **V** (KR proceedings page + arXiv). |
| 20 | Yin, X., Potyka, N., Rago, A., Kampik, T., Toni, F. **Contestability in Quantitative Argumentation.** arXiv:2507.11323, 2025. (G-RAEs: gradient-based relation attribution for edge-weighted QBAFs.) | **V** (arXiv listing). |
| 21 | Al Anaissy, C., Delobelle, J., Vesic, S., Yun, B. **Impact Measures for Gradual Argumentation Semantics.** arXiv:2407.08302; AAMAS 2025. | **V** — arXiv HTML retrieved; AAMAS 2025 proceedings PDF (`ifaamas` p69) located. |
| 22 | Oren, N., Yun, B. **Inferring attack relations for gradual semantics.** *Argument & Computation*, 2023, doi 10.3233/AAC-220010; arXiv:2211.16118. | **V**. |
| 23 | Libman, A., Oren, N., Yun, B. **Bases for Weighted Gradual Semantics and Inverse Problems in Argumentation Theory.** *JAIR* 85, art. 42, 2026. | **P** — JAIR article URL located; metadata from search summary, page not retrieved. |
| 24 | Amgoud, L., Doder, D., Lagasquie-Schiex, M.-C. **Gradual Semantics for Weighted Higher-Order Argumentation Frameworks.** *JAIR* 86, 2026, doi 10.1613/jair.1.21469. | **V** — *JAIR article page retrieved*. |
| 25 | Rago, A., Vasileiou, S. L., Toni, F., Son, T. C., Yeoh, W. **A Methodology for Incompleteness-Tolerant and Modular Gradual Semantics for Argumentative Statement Graphs.** arXiv:2410.22209; KR 2025. | **V** for authors/title. **U for content**: my fetch summary described *both* three-valued labelling *and* interval-valued scores, which is internally suspicious. **I did not rely on this paper's mechanism anywhere above.** Flagged for another seat to verify. |
| 26 | Rapberger, A., et al. **On Gradual Semantics for Assumption-Based Argumentation.** KR 2025; arXiv:2507.10076. | **P** — full author list **U**. |
| 27 | Wang, Z., Shen, Y. **Fuzzy Labeling Semantics for Quantitative Argumentation.** arXiv:2207.07339; *J. Logic and Computation*, doi 10.1093/logcom/exaf009. | **V** — arXiv abstract page retrieved. Assigns an ⟨acceptability, rejectability, **undecidability**⟩ triple. **The closest formal analogue to typed abstention in the literature**, and the strongest argument that a scalar strength is the wrong home for "we don't know". |
| 28 | Wang, Z., Shen, Y. **Bilateral Gradual Semantics for Weighted Argumentation.** AAAI 2024 (OJS 28945). | **P** — pages **U**. |
| 29 | **Convergent Semantics for Weighted Bipolar Argumentation.** AAAI 2025 (OJS 39019). | **P** — **authors U**: search surfaced only SYSU emails (`wangzsh27`, `shyping`), strongly suggesting Wang & Shen, but the names were not printed. Do not cite by author without checking. |
| 30 | Alfano, G., Greco, S., La Cava, L., Parisi, F., Trubitsyna, I. **Double Rectified Linear Unit-based Modular Semantics for Quantitative Bipolar Argumentation Framework.** arXiv:2605.02551, May 2026. | **V** — arXiv abstract page retrieved. Claims existing QBAF semantics give "divergent or counterintuitive results, even for simple acyclic cases" — worth an independent look. |
| 31 | Civit, A., Rago, A., Andriella, A., Alenyà, G., Toni, F. **From User Preferences to Base Score Extraction Functions in Gradual Argumentation.** arXiv:2602.14674, 2026. | **V** — arXiv page retrieved. The approach I explicitly reject in §(c) (C3). |
| 32 | Battaglia, E., Baroni, P., Rago, A., Toni, F. **Integrating User Preferences into Gradual Bipolar Argumentation for Personalised Decision Support.** SUM 2024, LNCS, doi 10.1007/978-3-031-76235-2_2. | **P** (Springer listing + author PDF at unipg.it). |
| 33 | Bench-Capon, T. J. M. **Value-based argumentation frameworks** (NMR 2002) / **Persuasion in practical argument using value-based argumentation frameworks**, *J. Logic and Computation* 13(3):429–448, 2003. | **P** — concept, author and title confirmed (Semantic Scholar, Liverpool repository); **volume/pages U**. |
| 34 | Modgil, S. **Reasoning about preferences in argumentation frameworks.** *Artificial Intelligence* 173(9–10):901–934, 2009. | **V** (ScienceDirect + PhilPapers). |
| 35 | Čyras, K., Rago, A., Albini, E., Baroni, P., Toni, F. **Argumentative XAI: A Survey.** IJCAI 2021, pp. 4392–4399. | **V** (dblp `conf/ijcai/Cyras0ABT21` + IJCAI proceedings). |
| 36 | Hunter, A., Thimm, M. **Probabilistic reasoning with abstract argumentation frameworks.** *JAIR* 59:565–611, 2017. | **V**. |
| 37 | Prakken, H. **A study of accrual of arguments, with applications to evidential reasoning.** ICAIL 2005. | **V** (RUG research portal + ACM ICAIL'05). |
| 38 | Prakken, H. **Modelling accrual of arguments in ASPIC+.** (Utrecht PDF `accrual18.pdf`.) | **P** — **venue/year U**. |
| 39 | Yun, B., Vesic, S. **Gradual Semantics for Weighted Bipolar SETAFs.** ECSQARU 2021, LNCS 12897, doi 10.1007/978-3-030-86772-0_15. | **P** (Springer + Aberdeen AURA listing). |
| 57 | **Representing Synergy among Arguments with Choquet Integral.** ECSQARU 2013, doi 10.1007/978-3-642-39091-3_26. | **U — authors unverified.** Springer redirected to an auth gate. Title/venue/DOI confirmed from the listing only. **Do not cite by author.** |
| 58 | Dejl, A., Williams, M., Toni, F. **Argumentation for Explainable and Globally Contestable Decision Support with LLMs.** arXiv:2603.14643, 2026. | **P** — author list from a third-party review site, not from arXiv directly. |
| 59 | **Applying Attribution Explanations in Truth-Discovery Quantitative Bipolar Argumentation Frameworks.** arXiv:2409.05831; CEUR Vol-3768. | **P** — **authors U** (search indicated "Xiang Yin and others"). Relevant to provenance-aware aggregation: TD-QBAFs score source trustworthiness and claims jointly. |

### MCDA / preference elicitation

| # | Citation | Status |
|---|---|---|
| 41 | Saaty, T. L. **A scaling method for priorities in hierarchical structures.** *J. Mathematical Psychology* 15:234–281, 1977. | **V** (ScienceDirect + multiple reference listings). |
| 42 | Belton, V., Gear, T. **On a short-coming of Saaty's method of analytic hierarchies.** *Omega* 11(3):228–230, 1983; and *Omega* 13(3):143–144, 1985. | **P** — from a search summary; not retrieved directly. |
| 43 | Dyer, J. S. **Remarks on the analytic hierarchy process.** *Management Science* 36(3):249–258, 1990; **A clarification…**, 36(3):274–275. | **V** (INFORMS page for the clarification; main paper from listings). |
| 44 | Edwards, W., Barron, F. H. **SMARTS and SMARTER: Improved Simple Methods for Multiattribute Utility Measurement.** *Organizational Behavior and Human Decision Processes* 60:306–325, 1994. | **V** (ScienceDirect). Source for the rank-substitution step; the explicit **ROC formula attribution to Barron & Barrett** is **S** (search summary named the substitution but not "centroid"). |
| 45 | von Winterfeldt, D., Edwards, W. **Decision Analysis and Behavioral Research.** Cambridge University Press, 1986. | **V** (CUP/Psychometrika review + Google Books). Canonical source for swing weighting and its range-dependence. |
| 46 | Bana e Costa, C. A., Vansnick, J.-C. **A Theoretical Framework for Measuring Attractiveness by a Categorical Based Evaluation Technique (MACBETH).** In *Multicriteria Analysis*, Springer, doi 10.1007/978-3-642-60667-0_3. | **P** — **year U** (1990/1994/1997 all appear in secondary sources). The six qualitative categories are **S**. |
| 47 | Riabacke, M., Danielson, M., Ekenberg, L. **State-of-the-Art Prescriptive Criteria Weight Elicitation.** *Advances in Decision Sciences* 2012, art. 276584. | **V** (dblp `journals/jamds/RiabackeDE12`). |
| 48 | Danielson, M., Ekenberg, L. **A Robustness Study of State-of-the-Art Surrogate Weights for MCDM.** *Group Decision and Negotiation*, doi 10.1007/s10726-016-9494-6. | **P** — **year U** (2016/2017). |
| 49 | Rezaei, J., et al. **Analyzing anchoring bias in attribute weight elicitation of SMART, Swing, and best-worst method.** *Int. Transactions in Operational Research*, 2024. | **P** (Wiley listing; full author list **U**). |
| 50 | O'Shea, et al. **Weight stability intervals for multi-criteria decision analysis using the weighted sum model.** *Expert Systems with Applications*, 2025 (`S0957417425020792`). | **P** — full author list **U**. |
| 51 | **Sensitivity analysis approaches in multi-criteria decision analysis: A systematic review.** *ScienceDirect* `S156849462300933X`, 2023. | **P** — authors **U**. |

### Evidence grading, provenance, decision aids, calibration

| # | Citation | Status |
|---|---|---|
| 40 | Bovens, L., Hartmann, S. **Bayesian Epistemology.** Oxford University Press, 2003. (Variety-of-evidence thesis; correlated vs independent sources.) | **V** (PhilPapers/Google Books). The *qualification* — more independence does not always mean stronger confirmation — is **S** (from a Synthese-archive summary). |
| 52 | Martin, R. W., Andersen, S. B., O'Brien, M. A., et al. **Providing Balanced Information about Options in Patient Decision Aids: An Update from the International Patient Decision Aid Standards.** *Medical Decision Making*, 2021, doi 10.1177/0272989X211021397. | **P** (SAGE listing; partial author list). The "preference-sensitive decision" definition and values-clarification-method requirement are **S**. A claimed **IPDAS 5.0 (2026) update** appeared in a search summary — **U, not relied on.** |
| 53 | **PROV-DM: The PROV Data Model.** W3C Recommendation, 30 April 2013. | **V** (w3.org/TR/prov-dm). Standard vocabulary (`wasDerivedFrom`, Entity/Activity/Agent) for the lineage that F3/F4 need. |
| 54 | Hartig, O., Zhao, J. **Using Web Data Provenance for Quality Assessment.** SWPM@ISWC 2009, CEUR Vol-526. | **V** (CEUR + Lancaster EPrints). |
| 55 | Guyatt, G. H., Oxman, A. D., Vist, G. E., Kunz, R., Falck-Ytter, Y., Alonso-Coello, P., Schünemann, H. J. **GRADE: an emerging consensus on rating quality of evidence and strength of recommendations.** *BMJ* 336(7650):924–926, 2008. | **V**. The four-level ordinal ladder (high/moderate/low/very low) applied to a *body* of evidence is the closest mature precedent for the τ table [SPEC-C]. |
| 56 | LLM confidence miscalibration: arXiv:2410.09724 (**Taming Overconfidence in LLMs: Reward Calibration in RLHF**); arXiv:2604.01457 (**Wired for Overconfidence: A Mechanistic Perspective on Inflated Verbalized Confidence in LLMs**). | **P — authors U for both.** Cited by arXiv id only. The specific finding "verbalized confidence clusters in 80–100%" is **S**. |

### Non-citations (things I looked for and did not find)

- I found **no** paper defining a gradual semantics in which *typed abstention*
  is a first-class propagating status distinct from both strength-0 and
  base-score-uncertainty. [27] (fuzzy labelling with an undecidability degree)
  is the nearest, and it is a *three-degree* framework, not a typed one.
  **The abstention taxonomy in [SPEC-E] is unsupported by literature and
  should be treated as this project's own contribution — or as evidence that I
  searched badly. Another seat should try to falsify this.**
- I found no principle-based treatment of *provenance-typed base-score
  elicitation* specifically. The base-score-elicitation literature I found
  ([23], [31]) derives τ from **preferences** or from **desired outputs**
  (inverse problems), not from **evidence provenance**. The τ table is
  therefore also unsupported-by-literature in its specific form, though GRADE
  [55] is a strong precedent from a different field.

---

## §(g) — SPECULATION register

Everything below is **my design proposal**: not cited, not proven, not tested.
Reviewers should treat this section as the attack surface.

| ID | Speculation | Confidence | How to falsify |
|---|---|---|---|
| **SPEC-A** | Refactor to the three-function shape (adjustment ∘ aggregation ∘ influence) so redundancy has a principled slot | high — the *shape* is [LIT-14]; only the "do it here, now" is mine | Show that redundancy can live in τ without contaminating provenance display |
| **SPEC-B** | Migrate off DF-QuAD *before* the weight system hardens, if cycles are ever in scope | medium | Show that mutual rebuttal is permanently out of scope, or that a cycle-tolerant retrofit is cheap |
| **SPEC-C** | **The τ table**: τ as a versioned lookup keyed by categorical judge output; `tau_source == "default"` becomes an illegal state | high — my strongest recommendation | Show a claim class whose credibility genuinely cannot be bucketed; or show that table maintenance cost exceeds the benefit |
| **SPEC-D** | The `scrutiny` channel as a **pair of counts**, never a float | medium-high | Show that a float here cannot be silently defaulted |
| **SPEC-E** | The 7-type abstention taxonomy, all propagating identically as 0 | medium — **explicitly unsupported by literature** (see §f non-citations) | Argue `retracted` deserves attack semantics rather than silence (see Q6) |
| **SPEC-F** | Closed value vocabulary of ~6–10 tags | low-medium | Show that real hinges need tags outside a fixed set |
| **SPEC-G** | Overlay edge re-weighting: normalise ROC weights so top value → `w = 1.0`, value `v` → `w_v/w_top` | **low — this is the weakest link in the packet** | Find a graph where this normalisation produces a non-monotone or otherwise pathological ranking; or derive it properly from a VAF admission rule instead |
| — | ε derived from the graph's own max single-node flip magnitude (Q5 option b) | low | Show it is unstable or gameable |
| — | Corroboration handled as a **τ bucket with sibling collapse** rather than sibling multiplicity | medium — the *constraint* (pick one) is [THM-5]; the *choice* is mine | Argue multiplicity is better because it keeps each source individually inspectable — a real counter-argument I do not have a decisive answer to |
| — | Similarity computed over **evidence lineage**, not claim text | high | Show a case where lineage is unavailable and text is the only signal |
| — | The greedy keep-strongest-first discount `v'ᵢ = vᵢ∏(1 − sim)` as *the* instantiation | medium — endpoints proven correct [THM-6], middle unjustified | Show that some other interpolation between the two correct endpoints is better-behaved |
| — | Hinge = kink of the mediating function (`|v_s − vₐ| ≤ ε`) plus divergent value tags plus zero abstentions | medium-high | Find a real value hinge that is *not* near the kink |
| — | **All numbers in §(e)** | illustrative only | They are arithmetic on invented τ values; the *arithmetic* is checkable, the τ values are not measurements |

### Claims that are NOT speculation and should be checked as facts

Reviewers: these are the load-bearing items. If any is wrong, most of the
packet's recommendations change.

1. **[THM-1]** 0 is the exact neutral element of DF-QuAD's aggregation.
2. **[THM-2]** A silently-defaulted node can move its parent by up to 0.5.
3. **[THM-3]** τ = 0 is *not* sufficient for abstention on a non-leaf; only
   edge suppression is.
4. **[THM-5]** Probabilistic sum already assumes sibling independence, so
   corroboration and redundancy are one knob and a corroboration bonus at the
   sibling level double-counts.
5. **[THM-6]** The similarity discount is exactly idempotent at sim = 1 and a
   no-op at sim = 0.
6. **[THM-7]** The value overlay's blast radius is exactly the hinge-to-root
   path (from DF-QuAD's directionality).
7. **[THM-9]** DF-QuAD cannot distinguish "unchallenged" from "challenged and
   vindicated".
8. **[CODE]** `DEFAULT_TAU = 0.5` at `debate_adapter.py:20`; `base_score = 0.5`
   / `final_strength = 0.5` defaults at `model.py:30-31`; the production path
   builds the **unweighted** `ArgumentGraph` at `debate_adapter.py:331`, so
   edge-weight-0 abstention is not currently expressible there.
9. **§(e) E1** — the two defects have opposite signs and partially cancel;
   the scorer therefore cannot be validated by inspecting its outputs.
10. **§(e) E2** — without a hinge marker, a 0.01 difference in the τ table
    silently resolves a values question, with a clean-looking audit trail.

---

*End of packet. Seat opus-5, formal-semantics lens.*
