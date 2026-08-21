RESEARCH HANDOFF COMPLETE
Seat: codex-gpt-5.6-sol (computability/spec-precision lens)
Sections: (a) structural factor table + minimal set; (b) value-weight
elicitation flows ranked by burden; (c) value overlay design; (d) open
decisions as sharp questions; (e) worked examples; (f) bibliography with
verification status per citation; (g) SPECULATION register.

# Scope and recommendation in one page

This packet treats a number as admissible only when its producer, method, inputs,
and interpretation are recorded. A DF-QuAD score is a **dialectical strength**, not
automatically a probability. Calling it confidence or probability requires an
independent calibration study. The graph must represent missingness with a sum
type, not a number:

```text
Judgment<T> = Judged { value: T, provenance: ProvenanceRecord }
            | Abstained { type: AbstentionType, evidence: ProvenanceRecord }
```

The recommended v1 is deliberately small:

1. require an explicit judged node base score and an explicit judged relation for
   every numeric contribution;
2. use provenance type (`cited`, `measured`, `derived`) to select the validation
   procedure, never as an uncalibrated ordinal multiplier;
3. cluster semantically redundant same-parent/same-polarity siblings, then share
   one contribution per common lineage family and allow additional accrual only
   for evidence families whose independence is recorded;
4. let the gradual semantics account for supporter and attacker strength; do not
   add a separate bonus for “has counters” or for raw counter count;
5. compute centrality and flip-sensitivity after scoring, for explanation, audit,
   and research prioritization—not as epistemic weights;
6. keep values in a separate overlay. Missing values produce `VALUE_UNSET`, never
   equal weights. A value-resolved recommendation carries a visible
   `VALUE-DECIDED` marker and its break-even point.

This is consistent with the literature's modular view of aggregation and
influence [B3, B5], but the exact gate, lineage-family algorithm, and display
contract below are proposed requirements, explicitly registered as SPECULATION.

# Formal scoring contract: where the hard gate sits

Let an acyclic quantitative bipolar argument graph be

```text
Q = (V, E+, E-, Jnode, Jrel, L)
```

where `E+` and `E-` are support and attack edges, `Jnode(v)` is either
`Judged(base)` or `Abstained(type)`, `Jrel(i,p)` is either
`Judged(relevance)` or `Abstained(type)`, and `L` is the evidence/provenance
lineage graph. A relation relevance is in `[0,1]`; it has no implicit default.
An implementation that only supports categorical valid/invalid relations may use
an **explicitly recorded** `1` for a validated relation, but may not synthesize it
because an edge exists.

For a child `i` of parent `p`, define its raw edge input piecewise:

```text
x(i -> p) = relevance(i,p) * sigma(i)
              if Jnode(i) = Judged and Jrel(i,p) = Judged
            ABSENT
              otherwise
```

`ABSENT` is not numeric zero. Aggregators iterate over numeric inputs only and
the audit result retains the excluded node/edge and its abstention type. This is
the hard gate: it occurs **before** redundancy grouping, corroboration, and
support/attack aggregation. Thus no downstream function can turn an unjudged
node into `0.5`, and multiplication by a default cannot leak one in. A genuinely
judged score of `0` remains distinguishable from an absent judgment.

For numeric inputs `X = {x1,...,xk}`, DF-QuAD uses the saturating aggregation

```text
F(X) = 0                               if X is empty
     = 1 - product_i (1 - xi)          otherwise.
```

Given explicit base `b`, aggregate attack `a`, and aggregate support `s`, its
influence function is [B1]:

```text
D(b,a,s) = b                           if a = s
           b - b*(a-s)                 if a > s
           b + (1-b)*(s-a)             if s > a.
```

After the sibling preprocessing specified in section (a), a judged node is
scored bottom-up as

```text
sigma(v) = D(base(v), F(attacker-group-inputs(v)),
                          F(supporter-group-inputs(v))).
```

If `Jnode(v)` is abstained, `sigma(v) = BOTTOM` and every outgoing contribution
from `v` is `ABSENT`. In particular, an unjudged root yields a typed abstention,
not a result inferred from a neutral prior. This wrapper is stricter than
published DF-QuAD, which assumes a base score for each argument [B1], and is also
stricter than recent incompleteness-tolerant semantics [B7]; the mission's “an
unjudged node contributes NOTHING” rule controls.

For a DAG, topological evaluation is `O(|V|+|E|)` once preprocessing is complete.
Cycles must not be silently iterated. A v1 should reject them with
`UNSUPPORTED_CYCLE`; a later cyclic semantics requires an explicit convergence,
uniqueness, tolerance, and maximum-iteration contract [B5].

## Interval judgments

If a validator can justify only `[l_v,u_v]`, retain the interval instead of its
midpoint. On an acyclic DF-QuAD graph, the local function is increasing in the
base and supporters and decreasing in attackers. Therefore a sound enclosure is
computed recursively by using lower base/support and upper attack for the lower
bound, and upper base/support and lower attack for the upper bound. This costs two
linear passes after grouping. Recent work specifically motivates interval-based
elicitation because exact initial weights are difficult to provide and users may
confuse initial with final acceptability [B8]. Whether the product-shaped
aggregation has a probabilistic interpretation is a separate question; interval
propagation does not supply one.

# (a) Structural factor options and exact computations

## Factor-by-factor table

| Candidate factor | What it measures; options | Recommended computation from graph + evidence | Complexity / cost | Failure modes, gaming, pathology |
|---|---|---|---|---|
| **Hard judged gate** | Admissibility, not strength. Options are missing-as-`0`, missing-as-`0.5`, or a distinct abstention state. Only the last satisfies the brief. | Apply the piecewise `x(i->p)` gate above. Node and relation must each be `Judged`; otherwise the edge input is `ABSENT`. The root itself must be judged or the answer abstains. | `O(1)` per edge; `O(V+E)` validation. | Coercing absent to `0` hides missing evidence; `0.5` fabricates confidence. A producer may game the gate by emitting unsupported point scores, so schema validity is insufficient: provenance and validator identity are mandatory. |
| **Judged quality / base score** | Intrinsic evidential support for the node before dialectical interaction. Options: direct point judgment; justified interval; empirical calibration from labelled outcomes; ordinal rubric mapped to numbers. | `Jnode(v)=Judged(b_v or [l_v,u_v], record)`. For leaves, the evidence subsystem owns it. For a derived node, the record names premises, rule/check, and validator. If relation relevance is scalar, `Jrel(e)` is separately judged. Prefer intervals until calibration supports points. | Point: `O(1)` consumption. Interval: two propagation passes. Calibration: offline data and monitoring dominate cost. | False precision; confusing initial weight with final acceptability [B8]; rubric-to-number mappings that are really policy; evaluator drift; self-judging models; double counting quality both in `b_v` and an edge multiplier. Never use an unspecified base. |
| **Evidence provenance type** | How a claim is known: `cited`, `measured`, or `derived`. Option A assigns fixed type multipliers; B routes type-specific checks; C learns type-conditioned calibration. | Recommend B. `cited` requires source/version/locator, source lineage, and claim-to-source entailment record; `measured` requires procedure, inputs, environment, run ID, and repeatability record; `derived` requires premise IDs, inference rule/trace, and validation record. Set no `lambda_type`: equivalently, an explicit neutral multiplier `1` after validation. C is admissible only if a versioned calibration artifact supplies `lambda_type` with error bars. | Routing is `O(1)` per node; validation cost is domain-dependent. Lineage closure is described below. | Type is nominal, not an evidence hierarchy: a bad measurement can be worse than a rigorous derivation, and a citation may merely repeat another citation. Fixed `measured > cited > derived` constants are fabricated confidence. Attackers can relabel evidence or create many URLs for one origin. |
| **Corroboration across independent evidence families** | Accrual from genuinely distinct origins. Options: raw noisy-OR over every item; capped count bonus; provenance-family max then noisy-OR; Bayesian combination with an explicit dependence model. | Within one semantic-redundancy cluster `C`, build lineage families. Let `m_f=max{x_i: i in C and family(i)=f}`. Then `z_C=1-product_f(1-m_f)`. If any item's independence is unknown, connect it to every item in `C`, conservatively collapsing that cluster to one family so unknown lineage earns no accrual. Do not apply another corroboration multiplier later. | With explicit dependency edges, union-find is `O((k+d) alpha(k))` per cluster. Transitive lineage root sets can be computed over a provenance DAG with bitsets in roughly `O((N_L+E_L)*R/word_size)`. | Different URLs, publishers, agents, or wording do not prove independence. Shared datasets, measurement runs, upstream reports, or derived summaries create dependence. Cyclic derivation is invalid. Raw noisy-OR lets citation laundering and circular corroboration approach `1`. Conservative connected components can over-collapse through one shared source, but fail safely. |
| **Semantic redundancy between siblings** | Overlap of the proposition that moves one parent in one polarity; it is not merely textual similarity. Options include exact canonical hashes, embedding thresholds, clustering, novelty discounts, or graph normalization to one canonical claim. | Compare only siblings with the same parent and polarity. First exact-hash normalized proposition fields. Then use a frozen embedding function and cosine similarity only as a candidate signal, guarded by matching entities, quantities, time scope, and no detected contradiction. Deterministically complete-link cluster candidates above a calibrated threshold; ambiguous pairs enter `REDUNDANCY_UNCERTAIN`. Apply lineage-family sharing inside each cluster, yielding one `z_C` to the parent. | Exact normalization `O(total text)`. Embeddings `O(k*d)` inference and pairwise cosine `O(k^2*d)` for `k` siblings. Naive deterministic complete-link agglomeration is `O(k^3)`; bounded fan-out or approximate-neighbor candidate generation reduces practical cost. | Near-duplicate spam; strategic paraphrase just below threshold; negation/entity swap may remain close in embedding space; threshold cliffs; complete-link tie/order effects; single-link “chaining” merges dissimilar endpoints. Merging nodes can wrongly transfer an attack aimed at only one nuance, a problem noted in the similarity literature [B4]. Preserve original nodes and cluster membership for audit. |
| **Counter-node presence and strength** | Dialectical opposition. Options: count counters, add a presence penalty, or use their propagated strengths in the attack aggregator. | Use the third option only. After the same gate, redundancy, and lineage-family processing, attacker cluster inputs go to `F(A_v)` and hence `D`. Presence without a judged strength has no numeric effect but is displayed as `COUNTER_UNJUDGED`. Absence of a counter is not evidence that no counter exists. | Included in the `O(V+E)` propagation plus preprocessing. | Raw count rewards attack spam. A presence bonus double-counts what DF-QuAD already does. Strong duplicate counters inflate attack unless deduplicated. Hiding unjudged attacks makes an answer look settled; they must remain visible and may block serving under the skeptic policy. |
| **Graph centrality** | Structural location or reach, not truth. Options include in/out-degree, ancestor reach, path count, betweenness, or PageRank. | Compute only for audit/prioritization. A cheap root-reach flag and ancestor/descendant counts use graph traversal. If desired, count directed paths to served roots by dynamic programming on a DAG, with big integers or a log transform. Never multiply epistemic edge inputs by centrality. | Reach/counts `O(V+E)` aside from big-integer growth; PageRank `O(K*E)`; exact all-pairs betweenness is substantially higher. | Splitting a claim creates more paths and apparent centrality. A centrally placed weak claim becomes overweight. Direct PageRank-as-semantics fails desirable argumentation properties unless reconstructed carefully [B11]. Centrality also double-counts position because propagation already determines which nodes can affect the root. |
| **Flip-sensitivity / node influence** | How much a completed score or decision depends on a node. This is useful for explanation, review ordering, and robustness. | Removal impact: `I_i = sigma_r(Q) - sigma_r(Q\i)`, where removal deletes `i` and its incident edges and the entire preprocessing pipeline is recomputed. Magnitude is `abs(I_i)`. For decision threshold `theta`, `flip_i=1` iff `(sigma_r(Q)-theta)*(sigma_r(Q\i)-theta) <= 0` and the two results differ. Report signed impact, magnitude, flip, and threshold. Do not feed them back as weights. | Naive exact all-node removal is `O(V*(V+E+P))`, `P` being preprocessing. Reverse-mode derivatives can give local first-order sensitivities in `O(V+E)` on a fixed differentiable DAG but are not exact removal impacts. Exact Shapley attribution is exponential; sampled Shapley is `O(M*(V+E+P))` [B9, B10]. | Reflexivity if influence becomes an input weight; mixed support/attack paths can cancel; removal can change clusters/families discontinuously; roots near `theta` thrash; saturation makes important nodes look locally insensitive; shared descendants make “remove node” semantics consequential. Freeze model/threshold versions and show the counterfactual definition. |
| **Gradual semantics choice** | The deterministic rule combining base, supporters, and attackers. DF-QuAD is the stated default. Weighted h-categorizer is a useful attack-only comparison; modular/QEM/Euler-style semantics are alternatives. | Keep the gate and preprocessing outside a swappable semantics interface. DF-QuAD uses `F` and `D` above. Weighted h-categorizer is `sigma(a)=w(a)/(1+sum_{b attacks a} sigma(b))` [B2]; it lacks native support in that form and also counts duplicates. Require property tests for stability, directionality, balance/monotonicity, bounds, and convergence [B3, B5]. | DAG DF-QuAD and acyclic h-categorizer are linear after preprocessing. Cyclic fixed-point/dynamical alternatives require iterative convergence analysis. | Different semantics can rank the same graph differently. H-categorizer is not a drop-in bipolar replacement. Saturating aggregators can mask added evidence; sum aggregators amplify duplicate count. A silent semantics/version change invalidates every displayed number. |

## Duplicate discounting: implementable choices

The literature establishes that similar attackers/supporters should not receive
full repeated weight and offers readjustment, threshold grouping, and setwise
novelty extensions; it also warns that tiny textual differences can carry large
semantic differences [B4]. The following are implementation choices rather than
equivalent methods.

| Method | Exact rule | Good use | Cost and pathology |
|---|---|---|---|
| Exact/canonical merge | Normalize a structured proposition `(predicate, entities, quantities, units, time, modality)` and hash it. Equal hashes enter one cluster. | Exact repeats and formatting variants. | Linear. Misses paraphrases; a bad normalizer can erase negation or scope. |
| Embedding threshold | `sim(i,j)=cos(E(text_i),E(text_j))`, with frozen model/version. Auto-cluster only if `sim>=tau_auto` and symbolic guards agree; below `tau_low` keep separate; the band is reviewable. Sentence embeddings make cosine search and clustering practical [B12]. | Candidate discovery for paraphrases. | Pairwise quadratic; threshold and model are domain-specific. Semantic similarity is not logical equivalence, so embedding-only merging is unsafe. |
| Complete-link clustering | Starting from singletons, merge the highest-similarity pair of clusters only when **every** cross-pair meets `tau_auto`; tie-break by stable node ID. | Avoids the `A~B`, `B~C`, `A!~C` chaining of connected components. | Naive cubic and still sensitive to threshold/ties; does not solve partial-overlap semantics. Exact minimum clique covers are not a suitable online requirement. |
| Cluster max | For a common lineage family, `m_f=max_i x_i`. | Safest v1 treatment of repeats from one origin. | Ignores legitimate extra detail; attackers may split novel content across nearly identical nodes. |
| Equal/quality weight sharing | `m_f=sum_i alpha_i*x_i`, with `alpha_i=1/|C_f|`, or `alpha_i=q_i/sum_j q_j` when `q` is separately judged. | When cluster members are alternative measurements of one proposition. | An average can let a weak duplicate dilute a strong item; quality-weighted means can double-use quality. Every `alpha` needs provenance. |
| Pairwise novelty discount | Sort strongest first and use `d_i=1-max_{j<i} sim(i,j)` (cheap approximation), or a validated setwise novelty `n(i,{1..i-1})`; aggregate discounted inputs. The formal EHbs family uses setwise novelty [B4]. | Partial redundancy when a binary cluster is too coarse. | Sorting/threshold instability; pairwise max misses jointly redundant sets; full inclusion–exclusion set similarity can require exponentially many subsets. Keep experimental. |
| Canonical claim node | Rewrite duplicates as one claim node whose children are the original evidence records; keep attacks attached to the precise scope they target. | Best long-term normalized graph model. | Graph migration and relation retargeting are nontrivial. Incorrect merging can make a narrow attack strike the entire merged claim. |

The recommended v1 is exact hash + guarded embedding candidates + deterministic
complete-link clusters + lineage-family `max`, with independent families combined
by the one noisy-OR-shaped `F`. `tau_auto`, `tau_low`, embedding model, guard
version, and reviewer decisions are part of number provenance. No universal
threshold is asserted here.

## Provenance-family algorithm

The evidence record should be representable as an entity/activity/agent derivation
graph; W3C PROV supplies interoperable vocabulary for this, but provenance records
history, not truth [B6]. For each redundancy cluster and polarity:

1. Trace every evidence item to original evidence-generating roots, retaining
   dataset ID, measurement run ID, source version, derivation edges, and explicit
   `depends_on` edges.
2. Connect two items if their root sets intersect, one derives from the other,
   they share a run/dataset that generated the asserted fact, or an explicit
   dependency is recorded.
3. If an item lacks sufficient lineage to establish a distinct origin, connect it
   to **every** item in that redundancy cluster. This deliberately collapses the
   cluster to one unknown-dependence family; “different URL/agent/publisher” is
   insufficient to restore accrual.
4. Connected components are dependence families. Use one `max` contribution per
   family. Components marked independently generated from disjoint roots accrue
   through `F`; all others remain one family.
5. Reject a provenance derivation cycle as `INVALID_LINEAGE_CYCLE`. Keep the
   component assignments in the audit ledger.

This conservative algorithm detects ordinary citation laundering and circular
summaries. It cannot prove statistical or causal independence from provenance
alone; “independent family” therefore means **documented distinct generation
lineage under the chosen policy**, not a theorem of probabilistic independence.
More sophisticated corroboration from provenance patterns exists [B13], but a
numeric reliability lift still requires a validated model.

## Recommended minimal structural set and order

```text
M0  Validate DAG, typed judgments, score meaning, model versions, and provenance.
M1  Exclude every unjudged node/relation via the hard gate; retain abstentions.
M2  Score child nodes bottom-up under the selected gradual semantics.
M3  Per parent and polarity, cluster redundant propositions.
M4  Inside each cluster, collapse common/unknown lineage to family max; combine
    only documented independent families with F, producing one cluster input.
M5  Feed supporter and attacker cluster inputs once into DF-QuAD.
M6  Propagate intervals; emit number-provenance ledgers and unjudged caveats.
M7  Compute removal/flip influence and centrality only as post-score diagnostics.
```

Not in the minimal epistemic score: ordinal provenance multipliers, raw source or
counter counts, centrality, flip-sensitivity feedback, cost, value preferences,
or a default base. A future calibrated factor must demonstrate incremental value
out of sample and must not duplicate information already present in the base score
or aggregation.

# (b) Value-weight elicitation flows, ranked by user burden

All flows compare **swings over stated criterion ranges**, not abstract labels
such as “How important is safety?” A criterion weight is meaningful only together
with its range and value function. Before elicitation, show each criterion's best
and worst consequence, unit, evidence uncertainty, direction, and whether it is a
hard constraint.

| Rank / flow | User interaction and computation | Approximate burden | Strengths | Failure modes and safeguards |
|---|---|---|---|---|
| **1 — SMARTER rank-the-swings** | Show cards such as “move cost from worst to best” and “move safety from worst to best.” User ranks the `m` swings and may tie them. For strict rank `j`, compute rank-order-centroid weight `w_j=(1/m)*sum_{k=j..m}(1/k)` [B15, B16]. Show the derived percentages and ask one consequence-based confirmation. | Low: one sort (`m` placements; about `O(m log m)` comparisons in a generic sorter), no ratios. Best default for roughly 2–7 criteria. | Fast; avoids false precision; SMARTER was designed to replace difficult cardinal judgments with rank-derived weights [B15]. | Rank boundary can cause a large weight jump; ties and near-ties need an interval/profile, not arbitrary ordering. Users may rank labels rather than swings. Derived weights must be labelled `method: SMARTER/ROC`, not “user said 42%.” |
| **2 — SMARTS/swing points** | Rank best-to-worst swings, assign `100` to the most valuable swing, give each other swing `p_j` relative points, then `w_j=p_j/sum p`. Replay two concrete options and allow revisions. | Medium: range review, ranking, and `m-1` cardinal judgments. | More expressive than rank-only; direct visibility of trade-offs; standard swing weighting is widely used in MCDA [B14, B17]. | Anchoring on `100`, range sensitivity, overprecision, and misunderstanding “importance.” Show a sensitivity band around each point allocation; do not permit an accidental zero without confirmation. |
| **3 — AHP pairwise swing comparison** | For every criterion-swing pair, ask which swing matters more and by what ratio on a declared scale. Form reciprocal matrix `A`; derive `w` from the principal eigenvector (or a declared geometric-mean approximation), normalize, and show consistency diagnostics [B14]. | High: `m(m-1)/2` comparisons (10 at `m=5`, 28 at `m=8`) plus inconsistency repair. Reserve for trained/facilitated or high-stakes use. | Local pair questions can expose contradictions and support deliberation. Consistency checks provide useful learning loops. | Fatigue, decisional conflict, ratio-scale misunderstanding, and inconsistent matrices. Pairwise elicitation was judged more effortful and less desirable than absolute measurement in a controlled MCDSS study [B18]. Ask only high-information repairs, show consequences, and never auto-correct silently. |

Recent interface research found that consistency-check learning loops can improve
factual learning while also feeling cognitively demanding [B19]. Therefore the
low-burden flow should still include one concrete replay (“With these weights,
option X wins because ...”) and an optional challenge, while repeated consistency
repairs belong in the high-burden flow. The selected method, owner, scope, ranges,
answers, derived weights, timestamp, and revisions are all provenance.

Group use should preserve individual/stakeholder profiles and show disagreement.
Do not average profiles unless a human owner selects and records a governance rule;
MCDA tooling can compare stakeholder profiles without forcing aggregation [B20].

# (c) Value overlay on the evidence-scored graph

## Separation of layers

The epistemic layer answers descriptive questions such as expected cost, measured
latency, or estimated incident risk. The value layer answers how much a change in
each consequence matters and whether trade-offs are compensatory.

```text
Evidence graph
  -> EvidenceResult(option, criterion)
       = Judged { raw consequence or distribution, evidence provenance }
       | Abstained { evidence-abstention type }

Value profile
  -> { owner, decision scope, criterion direction, worst/best range,
       value function u_j, weight w_j or weight region W,
       veto/constraint rules, elicitation method, timestamp }

Overlay
  -> option score/interval + robustness + VALUE-DECIDED marker + ledger
```

Neither the direction of a criterion nor its normalization is pure evidence. The
mapping `u_j(raw consequence)` is a value function and must be attributed to the
value profile. Cost dollars and incident probability may be evidence; mapping each
to `0..1` desirability is not.

## Computation

For alternative `a` and criterion `j`, let the evidence layer provide consequence
`x_aj` (or a distribution/interval). Let the value profile provide `u_j` and
nonnegative weights with `sum_j w_j=1`. If the owner explicitly accepts the
additive model's preferential-independence/compensation assumptions, compute

```text
V(a;w) = sum_j w_j * u_j(x_aj).
```

Apply explicit non-compensatory vetoes first—for example, “serious-incident risk
must be at most 2%.” A veto is itself a value/policy rule, not evidence. If additive
independence is rejected, do not quietly keep the weighted sum; select and record a
non-additive method or return `VALUE_MODEL_UNSET`. MCDA guidance treats the model
as decision support and emphasizes sensitivity/uncertainty exploration rather than
an automatic final decision [B17, B20].

For evidence intervals, propagate each option's utility interval through the fixed
value profile. For uncertainty distributions, retain the evidence distribution and
run a declared Monte Carlo or analytic expectation; never replace missing evidence
with a midpoint. For a point profile the additive evaluation is `O(A*m)` for `A`
alternatives and `m` criteria. `M` Monte Carlo samples cost `O(M*A*m)`.

Let `W` be the elicited/plausible weight region. For candidate winner `a` and rival
`b`, compute

```text
Delta_ab(w) = sum_j w_j * (u_j(x_aj) - u_j(x_bj))
robust_margin_ab = min_{w in W} Delta_ab(w).
```

With linear constraints on `W`, the minimum is a small linear program. If every
`robust_margin_ab > 0`, report “robust over the stated value range,” not
“value-free.” If alternatives trade off across criteria and the selected winner
depends on the point weights, report `VALUE-DECIDED`. A Pareto-dominant option may
be described as evidence-dominant **under the declared criterion directions and
evidence uncertainty**, but those directions still belong to the value profile.

## Served-answer display contract

At every value hinge, show:

```text
VALUE-DECIDED
Owner/scope: <who; for what decision>
Method/version: <SMARTER | swing | AHP; version; timestamp>
Why: <winner> gains <part-worth> on <criterion(s)> and loses <part-worth> on ...
Break-even: winner changes when <weight/rule> crosses <value>
Evidence: raw criterion outcomes with evidence provenance and uncertainty
Values: value functions, weights, constraints, and their elicitation provenance
Abstentions: VALUE_UNSET / EVIDENCE_UNJUDGED / VALUE_MODEL_UNSET as applicable
```

A contribution table or stacked bars should show `w_j*u_j(x_aj)` separately from
raw evidence. Beside it, show a one-way weight-sensitivity plot or explicit
break-even. Existing MCDA software supports separate stakeholder profiles,
uncertain predictions, contribution displays, and local weight sensitivity [B20].
The exact `VALUE-DECIDED` badge and wording are proposed here, not claimed as an
established standard.

If no authorized value profile exists, return `VALUE_UNSET`. Do not choose equal
weights. If one required consequence is unjudged, return `EVIDENCE_UNJUDGED` for
that comparison unless a declared robust partial-information rule can prove the
same winner across every admissible value. Evidence and value abstentions must not
be collapsed into one generic “uncertain.”

# (d) Open decisions for the human owner

1. **Score meaning:** Are node bases calibrated probabilities, ordinal evidential
   strengths, or dialectical acceptability scores? What validation permits the UI
   to use the word “confidence”?
2. **Missing root:** Must every scored internal/root node have an explicit base, as
   recommended here, or will a separately specified semantics derive a parent from
   children without a prior? What typed result appears when it cannot?
3. **Graph class:** Is v1 DAG-only with `UNSUPPORTED_CYCLE`, or which cyclic
   semantics, convergence tolerance, uniqueness guarantee, and failure result are
   accepted?
4. **Judgment authority:** Which subsystem or human may mark cited, measured, and
   derived nodes and relations `Judged`; what rubric, calibration set, and audit
   fields are mandatory?
5. **Points versus intervals:** Are point base scores allowed before empirical
   calibration, or must uncalibrated judgments be intervals/ordinal states?
6. **Provenance policy:** Is provenance type strictly a validator router, or may a
   type-conditioned multiplier ever be used? If yes, what out-of-sample evidence
   and re-calibration trigger justify each multiplier?
7. **Independence policy:** What metadata proves distinct evidence-generating
   families? Should unknown lineage collapse all repeats to one family (recommended)
   or block the node entirely?
8. **Redundancy policy:** What structured proposition schema, embedding model,
   domain calibration set, thresholds, ambiguity band, and human override process
   govern clustering? How are attacks on only part of a merged claim preserved?
9. **Family aggregation:** Within one lineage family, is `max` the accepted safe
   rule, or is a mean/novelty model justified? Across documented independent
   families, is DF-QuAD's `F` acceptable despite lacking a probability semantics?
10. **Counter completeness:** Does any unjudged counter merely appear as a caveat,
    or does it block serving? Who certifies that no material attack is unaddressed?
11. **Sensitivity use:** Are removal impact, Shapley impact, and centrality confined
    to explanation/review ordering, or does the owner intend the risky
    self-referential use as a weight? What decision threshold defines a “flip”?
12. **Value owner:** Whose preferences control each scope—requesting user,
    organization, affected stakeholder, regulator, or separate profiles? What
    governance rule, if any, aggregates disagreement?
13. **Elicitation default:** Is low-burden SMARTER acceptable as the default, with
    swing/AHP escalation, and what maximum criterion count triggers restructuring?
14. **Compensation and veto:** May high cost compensate for safety loss? Which
    criteria have hard thresholds, and who owns the directions, ranges, value
    functions, and threshold revisions?
15. **Hinge label:** Is an answer `VALUE-DECIDED` whenever alternatives trade off,
    only when the winner flips within an approved weight region, or under another
    test? What exact ledger must a stranger see?
16. **Freshness:** When evidence, graph structure, value profiles, models, or
    thresholds change, which scores are invalidated and recomputed, and how are old
    served answers marked?

# (e) Worked examples

## E1. Mini argument map with duplicate discount, corroboration, counter, and hard gate

All numbers here are synthetic and carry illustrative provenance IDs; none is an
empirical claim. The root is `R: deploy the pilot`. Every relation below has an
explicitly validated relevance `1.00` under relation records `JR1..JR5`.

```text
supports R:
  S1  "the pilot meets the reliability target"  base 0.80
      provenance: measured, run M-17, judgment J-S1
  S2  near-duplicate restatement                  base 0.80
      provenance: measured, same run M-17, judgment J-S2
  S3  same proposition, independent audit         base 0.60
      provenance: cited audit A-9 with distinct lineage, judgment J-S3
  U1  another favorable assertion                 UNJUDGED
      provenance: derived trace missing, abstention DERIVATION_UNVALIDATED

attacks R:
  A1  "a safety failure remains"                  base 0.70
      provenance: measured, run SAF-4, judgment J-A1

root:
  R   explicit intrinsic base                     base 0.40
      provenance: derived root assessment, judgment J-R
```

The leaves have no judged children, so their final strengths equal their explicit
bases. At `R`:

1. The gate admits `S1=0.80`, `S2=0.80`, `S3=0.60`, and `A1=0.70`.
   `U1` is `ABSENT`, while its abstention remains visible.
2. Structured proposition equality/semantic review places `S1,S2,S3` in one
   redundancy cluster `C`.
3. Lineage puts `S1,S2` in family `M-17`, so
   `m_M17=max(0.80,0.80)=0.80`. The independent audit is family `A-9`, so
   `m_A9=0.60`.
4. The cluster input is
   `z_C=1-(1-0.80)*(1-0.60)=1-0.20*0.40=0.92`.
5. Thus support aggregate `s=F({0.92})=0.92`; attack aggregate
   `a=F({0.70})=0.70`.
6. Support exceeds attack by `0.22`. DF-QuAD gives
   `sigma(R)=0.40+(1-0.40)*0.22=0.40+0.132=0.532`.

The served ledger says `0.532 dialectical strength`, with `J-R`, `M-17`, `A-9`,
`SAF-4`, cluster/model versions, and the `U1` abstention. It does **not** call
`0.532` a probability.

For comparison only, raw treatment of the three favorable nodes as independent
would give `s=1-(0.20*0.20*0.40)=0.984` and
`sigma(R)=0.40+0.60*(0.984-0.70)=0.5704`. The same-run restatement has fabricated
an extra `0.0384` of root strength. If the unjudged `U1` were also silently assigned
`0.5`, support would become `0.992` and the root `0.5752`. The hard gate prevents
both defects. If `J-R` were absent, the correct root output would be a typed
abstention, not `0.5` and not `0.532`.

## E2. Cheap versus safe: a visible value hinge

Again, all numbers are synthetic. Evidence records say:

```text
Cheap option: cost = $10k [measured E-C1]; serious-incident risk = 4% [derived E-S1]
Safe option:  cost = $16k [measured E-C2]; serious-incident risk = 1% [derived E-S2]
```

Value profile `VP-1` declares the ranges and maps those evidence outcomes to:

```text
                 cost utility    safety utility
Cheap                 0.90             0.55
Safe                  0.40             0.95
```

Those four utilities are **value-derived numbers from `VP-1`**, not evidence.
With `w` the cost weight and `1-w` the safety weight:

```text
V(Cheap) = 0.90w + 0.55(1-w) = 0.55 + 0.35w
V(Safe)  = 0.40w + 0.95(1-w) = 0.95 - 0.55w.
```

At `w=0.30`, Cheap scores `0.655` and Safe `0.785`, so Safe wins. At `w=0.60`,
Cheap scores `0.760` and Safe `0.620`, so Cheap wins. The break-even is

```text
0.55 + 0.35w = 0.95 - 0.55w
0.90w = 0.40
w = 4/9 = 0.4444...
```

The answer must therefore say, for the second profile:

```text
VALUE-DECIDED: Cheap wins 0.760 to 0.620 because VP-1 puts 60% on the
cost swing. The recommendation flips to Safe when the cost weight falls below
44.44%. Raw cost and safety estimates remain evidence-scored separately.
```

If the owner declares “serious-incident risk must be <=2%,” Cheap is vetoed before
the weighted sum; that threshold is visibly marked as a value/policy rule. If no
authorized weight or veto exists, the result is `VALUE_UNSET`, not equal weights.

# (f) Bibliography and citation verification

`VERIFIED` means the title, authors, venue/year, and persistent identifier were
checked against an official publisher/proceedings/standards page or the primary
paper. Formula claims were checked in the primary text where noted. A preprint is
identified as such. No citation below is knowingly unverifiable.

- **[B1] VERIFIED — primary proceedings paper/formula.** Antonio Rago, Francesca
  Toni, Marco Aurisicchio, Pietro Baroni. “Discontinuity-Free Decision Support
  with Quantitative Argumentation Debates.” *KR 2016*, pp. 63–73. No DOI listed.
  Metadata verified via [AAAI/KR metadata](https://ocs.aaai.org/ocs/index.php/KR/KR16/rt/metadata/12874/12463)
  and [DBLP](https://dblp.org/rec/conf/kr/RagoTAB16.html); `F`/`D` formula
  cross-checked in the primary/author paper.
- **[B2] VERIFIED — official proceedings/formula.** Leila Amgoud, Jonathan
  Ben-Naim, Dragan Doder, Srdjan Vesic. “Acceptability Semantics for Weighted
  Argumentation Frameworks.” *IJCAI 2017*, pp. 56–62.
  [doi:10.24963/ijcai.2017/9](https://doi.org/10.24963/ijcai.2017/9).
- **[B3] VERIFIED — publisher DOI.** Pietro Baroni, Antonio Rago, Francesca Toni.
  “From Fine-Grained Properties to Broad Principles for Gradual Argumentation: A
  Principled Spectrum.” *International Journal of Approximate Reasoning* 105
  (2019), 252–286.
  [doi:10.1016/j.ijar.2018.11.019](https://doi.org/10.1016/j.ijar.2018.11.019).
- **[B4] VERIFIED — primary KR paper/formulas.** Leila Amgoud, Elise Bonzon,
  Jérôme Delobelle, Dragan Doder, Sébastien Konieczny, Nicolas Maudet. “Gradual
  Semantics Accounting for Similarity between Arguments.” *KR 2018*, pp. 88–97.
  [Primary PDF](https://cdn.aaai.org/ocs/18077/18077-78629-1-PB.pdf); no DOI listed.
- **[B5] VERIFIED — author preprint, publication status stated.** Till
  Mossakowski, Fabian Neuhaus. “Modular Semantics and Characteristics for Bipolar
  Weighted Argumentation Graphs.” arXiv:1807.06685 (2018).
  [arXiv](https://arxiv.org/abs/1807.06685). Used for modular decomposition and
  convergence caveats, not treated as a later peer-reviewed version.
- **[B6] VERIFIED — W3C Recommendation.** Timothy Lebo, Satya Sahoo, Deborah
  McGuinness, eds. “PROV-O: The PROV Ontology.” W3C Recommendation, 30 April
  2013. [W3C](https://www.w3.org/TR/prov-o/). PROV supplies provenance vocabulary;
  it does not itself assign truth/reliability scores.
- **[B7] VERIFIED — official proceedings/DOI.** Antonio Rago, Stylianos Loukas
  Vasileiou, Son Tran, Francesca Toni, William Yeoh. “A Methodology for
  Incompleteness-Tolerant and Modular Gradual Semantics for Argumentative
  Statement Graphs.” *KR 2025*, pp. 500–511.
  [doi:10.24963/kr.2025/49](https://doi.org/10.24963/kr.2025/49).
- **[B8] VERIFIED — official AAMAS 2026 DOI/program; method cross-checked with
  predecessor preprint.** Nir Oren, Bruno Yun. “Bounding Acceptability Degrees
  and Eliciting Initial Weights in Gradual Argumentation.” *AAMAS 2026*.
  [doi:10.65109/NSCC6791](https://doi.org/10.65109/NSCC6791). The interval
  motivation and pipeline were also checked in the authors' predecessor preprint,
  [arXiv:2502.07452](https://arxiv.org/abs/2502.07452).
- **[B9] VERIFIED — publisher DOI.** Xiang Yin, Nico Potyka, Francesca Toni.
  “Argument Attribution Explanations in Quantitative Bipolar Argumentation
  Frameworks.” *ECAI 2023*, pp. 2898–2905.
  [doi:10.3233/FAIA230603](https://doi.org/10.3233/FAIA230603).
- **[B10] VERIFIED — official proceedings/primary PDF.** Caren Al Anaissy,
  Jérôme Delobelle, Srdjan Vesic, Bruno Yun. “Impact Measures for Gradual
  Argumentation Semantics.” *AAMAS 2025*, pp. 69–77.
  [Primary PDF](https://www.ifaamas.org/Proceedings/aamas2025/pdfs/p69.pdf).
- **[B11] VERIFIED — publisher DOI.** Emanuele Albini, Pietro Baroni, Antonio
  Rago, Francesca Toni. “PageRank as an Argumentation Semantics.” *COMMA 2020*,
  pp. 55–66. [doi:10.3233/FAIA200492](https://doi.org/10.3233/FAIA200492).
- **[B12] VERIFIED — official ACL paper/DOI.** Nils Reimers, Iryna Gurevych.
  “Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks.”
  *EMNLP-IJCNLP 2019*, pp. 3982–3992.
  [doi:10.18653/v1/D19-1410](https://doi.org/10.18653/v1/D19-1410).
- **[B13] VERIFIED — official workshop record.** Lina Barakat, Phillip Taylor,
  Nathan Griffiths, Simon Miles. “Corroboration via Provenance Patterns.” *9th
  USENIX Workshop on the Theory and Practice of Provenance (TaPP 2017)*.
  [USENIX](https://www.usenix.org/conference/tapp17/workshop-program/presentation/barakat).
- **[B14] VERIFIED — publisher DOI.** Thomas L. Saaty. “A Scaling Method for
  Priorities in Hierarchical Structures.” *Journal of Mathematical Psychology*
  15(3) (1977), 234–281.
  [doi:10.1016/0022-2496(77)90033-5](https://doi.org/10.1016/0022-2496(77)90033-5).
- **[B15] VERIFIED — publisher DOI.** Ward Edwards, F. Hutton Barron. “SMARTS
  and SMARTER: Improved Simple Methods for Multiattribute Utility Measurement.”
  *Organizational Behavior and Human Decision Processes* 60(3) (1994), 306–325.
  [doi:10.1006/obhd.1994.1087](https://doi.org/10.1006/obhd.1994.1087).
- **[B16] VERIFIED — publisher DOI.** F. Hutton Barron, Bruce E. Barrett.
  “Decision Quality Using Ranked Attribute Weights.” *Management Science* 42(11)
  (1996), 1515–1523.
  [doi:10.1287/mnsc.42.11.1515](https://doi.org/10.1287/mnsc.42.11.1515).
- **[B17] VERIFIED — professional society/publisher record.** Praveen Thokala et
  al. “Multiple Criteria Decision Analysis for Health Care Decision Making—An
  Introduction: Report 1 of the ISPOR MCDA Emerging Good Practices Task Force.”
  *Value in Health* 19(1) (2016), 1–13.
  [ISPOR record](https://www.ispor.org/publications/journals/value-in-health/abstract/Volume-19--Issue-1/Multiple-Criteria-Decision-Analysis-for-Health-Care-Decision-Making-An-Introduction--Report-1-of-the-ISPOR-MCDA-Emerging-Good-Practices-Task-Force).
- **[B18] VERIFIED — publisher DOI.** John A. Aloysius, Fred D. Davis, Darryl D.
  Wilson, A. Ross Taylor, Jeffrey E. Kottemann. “User Acceptance of Multi-Criteria
  Decision Support Systems: The Impact of Preference Elicitation Techniques.”
  *European Journal of Operational Research* 169(1) (2006), 273–285.
  [doi:10.1016/j.ejor.2004.05.031](https://doi.org/10.1016/j.ejor.2004.05.031).
- **[B19] VERIFIED — publisher DOI/author manuscript.** Alice H. Aubert, Sara
  Schmid, Judit Lienert. “Can Online Interfaces Enhance Learning for Public
  Decision-Making? Eliciting Citizens' Preferences for Multicriteria Decision
  Analysis.” *European Journal of Operational Research* 314(2) (2024), 760–775.
  [doi:10.1016/j.ejor.2023.10.031](https://doi.org/10.1016/j.ejor.2023.10.031).
- **[B20] VERIFIED — publisher DOI/primary open manuscript.** Fridolin Haag,
  Alice H. Aubert, Judit Lienert. “ValueDecisions, a Web App to Support Decisions
  with Conflicting Objectives, Multiple Stakeholders, and Uncertainty.”
  *Environmental Modelling & Software* 150 (2022), 105361.
  [doi:10.1016/j.envsoft.2022.105361](https://doi.org/10.1016/j.envsoft.2022.105361).

# (g) SPECULATION register

- **S1 — hard-gated DF-QuAD wrapper.** The exact `Judgment` sum type, requirement
  for judged node and relation, `ABSENT` edge state, root-abstention behavior, and
  `UNSUPPORTED_CYCLE` v1 rule are proposed product requirements. They are not
  claimed to be part of canonical DF-QuAD.
- **S2 — conservative lineage-family accrual.** The exact dependency tests,
  `UNKNOWN` component, within-family `max`, and independent-family `F` algorithm
  are a conservative proposed policy. W3C PROV and provenance-corroboration work
  support recording and reasoning about lineage, but do not validate this policy's
  numeric outputs.
- **S3 — redundancy pipeline.** The exact structured guards, two-threshold review
  band, deterministic complete-link choice, and recommended cluster/family order
  are proposed. No universal embedding model or cosine threshold is asserted.
- **S4 — minimal-factor exclusion.** Keeping provenance constants, counter count,
  centrality, and flip-sensitivity out of epistemic weights is a reasoned design
  recommendation. The literature supports the component risks, but the minimal set
  requires system-specific validation.
- **S5 — value-overlay boundary.** The separate `EvidenceResult` and
  `ValueProfile` schemas, `VALUE_UNSET`/`VALUE_MODEL_UNSET` states, and rule for
  attaching the overlay only at decision hinges are proposed product architecture.
- **S6 — visible hinge marker.** `VALUE-DECIDED`, the exact ledger fields, and the
  break-even sentence are proposed UX requirements, not an established standard.
- **S7 — service gate for unjudged counters.** Numerically excluding but visibly
  retaining an unjudged counter follows the hard rule; whether such a caveat blocks
  serving is an unresolved owner policy.
- **S8 — empirical claims not made.** No claim is made that the proposed minimal
  set is calibrated, that cosine similarity proves semantic equivalence, that
  documented separate lineage proves statistical independence, or that DF-QuAD
  strength is probability. Each would require a separate validation study.
