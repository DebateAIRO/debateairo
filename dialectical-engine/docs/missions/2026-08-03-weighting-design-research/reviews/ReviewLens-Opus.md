REVIEW LENS HANDOFF COMPLETE
Lens: formal-semantics correctness (Opus 5)
Verdict research-grok.md: LENS CHANGES REQUESTED
Verdict research-codex.md: LENS CHANGES REQUESTED

Mission: WEIGHT-RESEARCH-R1 · Round: R2 cross-review · authority_epoch 2
Reviewer independence: fresh session; wrote none of the reviewed artifacts;
research-opus.md NOT read; ReviewLens-Codex.md and ReviewLens-Grok.md NOT read.
Inputs reviewed: 00-intake-H0.md (contract), research/research-grok.md,
research/research-codex.md.

Summary of findings: **2 blocker · 7 major · 9 minor** (grok: 2 blocker, 4 major,
4 minor; codex: 0 blocker, 3 major, 5 minor).

---

## 0. Ground truth established before reviewing (so findings are falsifiable)

I fixed the DF-QuAD definition against primary sources *before* recomputing either
packet's arithmetic, because both packets' worked examples depend on it.

**DF-QuAD aggregation** (Rago, Toni, Aurisicchio, Baroni, KR 2016):

```
F(x1..xk) = 0                     if k = 0
          = 1 - PROD_i (1 - xi)   otherwise
```

**DF-QuAD combination function**, quoted verbatim from the authors' own
restatement (Rago & Toni, *Adapting the DF-QuAD Algorithm to Bipolar
Argumentation*, CEUR Vol-1672 paper 3, Eqs. 2–3, extracted from the primary PDF):

```
c(v0, va, vs) = v0 - v0 * |vs - va|        if va >= vs
c(v0, va, vs) = v0 + (1 - v0) * |vs - va|  if va <  vs
```

Confirmed independently three further times, all agreeing, none containing any
division:

1. Potyka & Booth, KR 2024 (primary PDF): DF-QuAD = modular semantics
   `(alpha_PROD, iota_l)` with `alpha_PROD(A,S) = PROD_{a in A}(1-a) - PROD_{s in S}(1-s)`
   and `iota_l(b,a) = b + b*min{0,a} + (1-b)*max{0,a}`. Substituting
   `alpha = (1-va) - (1-vs) = vs - va` reproduces the two cases above exactly.
2. Yin, Potyka, Rago, Kampik, Toni, arXiv:2507.11323 (primary PDF, §3):
   "Product-aggregation is used for the DF-QuAD semantics (Rago et al. 2016)",
   `agg_PROD(A,S) = PROD_{x in A}(1-x) - PROD_{x in S}(1-x)`.
3. arXiv:2605.02551 (HTML): `pi(a) = PROD_R(1-rho) - PROD_S(1-rho)`;
   `rho(a) = tau*(1+pi)` if `pi <= 0`, `tau*(1-pi)+pi` if `pi > 0` — algebraically
   identical.

**Load-bearing consequence:** the DF-QuAD combination is *affine* in `|vs - va|`.
It never divides by `(1 - va)`. Any formula that does is not DF-QuAD.

---

## 1. Findings — research-grok.md

### G-1 · BLOCKER · §(e) E1 Step 3 — the worked example does not use DF-QuAD

**Evidence.** Grok computes the headline number with

```
sigma(R) = beta + (1-beta) * (phi+ - phi-) / (1 - phi-)
         = 0.5 + 0.5 * (0.955 - 0.60)/(1 - 0.60)
         = 0.5 + 0.5 * 0.8875 = 0.944
```

The `/(1 - phi-)` divisor exists in no DF-QuAD formulation (four independent
primary confirmations, §0 above). The packet is not merely mislabelling: §(a) F3
correctly states the intended rule ("combine with beta via discontinuity-free
combination (Rago et al. 2016)"), so the packet contradicts itself.

**Recomputation.** With grok's own inputs `beta = 0.5`, `phi+ = 0.955`,
`phi- = 0.60` (both aggregates recomputed and correct: `1 - 0.15*0.30 = 0.955`;
`F({0.60}) = 0.60`), correct DF-QuAD gives

```
c(0.5, 0.60, 0.955) = 0.5 + 0.5 * 0.355 = 0.6775
```

Published value 0.944; correct value **0.6775**; error **+0.266**, i.e. the served
number is inflated by 27 points of an 0–1 scale. Step 4 then prints "Epistemic
strength ... ~0.94" inside the stranger-facing provenance line, so the error
reaches the deliverable, not just the derivation.

**Fix.** Replace Step 3 with `sigma(R) = beta + (1-beta)*(phi+ - phi-)` for
`phi+ > phi-` and `beta - beta*(phi- - phi+)` otherwise; restate Step 4 as 0.68;
re-derive Step 5 (see G-3).

### G-2 · BLOCKER · §(e) E1 Step 3 — an unjudged 0.5 produces the served number

**Evidence.** Step 3: "Root has no separate intrinsic claim base; treat
beta(R)=0.5 only as **neutral prior** for a pure option node ... For a pure
aggregation node with beta=0.5 prior". No judgment record, no judge, no basis, no
timestamp accompanies that 0.5. This instantiates the mission's named defect
(intake §"Context every seat may assume": "any unjudged input silently defaulting
to a mid-range weight ... Abstention is typed and first-class, never faked as
0.5") and directly contradicts the packet's own §(a) rows F2 ("Unjudged:
beta = **undefined** ... **never** 0.5") and F10 ("Unjudged default mid-range —
**Forbidden** — Named defect: fabricated confidence"). Grok's own §(g)
SPECULATION-7 even indicts ArgRAG for exactly this.

**Why it is a blocker and not a stylistic slip.** The base score is the dominant
term. On grok's own map, under correct DF-QuAD:

| beta(R) | sigma(R) |
|---|---|
| 0.0 (grok's stated "better" option) | 0.355 |
| 0.5 (what grok actually uses) | 0.6775 |

The prior contributes more than the entire evidence differential. Worse, Potyka &
Booth (KR 2024, primary PDF, verified verbatim) prove: *"Df-QuAD already satisfies
relative conservativeness, but does not satisfy open-mindedness."* Under a
non-open-minded semantics an unprovenanced prior can never be argued away by
accumulating evidence — the fabricated 0.5 is permanent. The Step 4 "provenance
line for the stranger" lists the three judged children and the excluded unjudged
leaf but never discloses that half the answer came from an unjudged prior.

**Fix.** Either (a) make root abstention typed when no judged base exists, or
(b) adopt `beta(R) = 0` with an explicit written rule that a decomposition node is
child-determined, or (c) require a judged, provenanced base. Whichever is chosen,
the served line must name the base score and its provenance. Also delete the
"neutral prior" language, which is the defect's own vocabulary.

### G-3 · MAJOR · §(e) E1 Step 5 — the tornado conclusion inverts under correct DF-QuAD

**Evidence.** Grok's sensitivity table gives "Remove C_load → sigma ~= 0.625" and
concludes "Tornado: longest bar = load-test cluster". Recomputed with correct
DF-QuAD from baseline 0.6775:

| Knock out | correct sigma(R) | delta |
|---|---|---|
| Remove C_load (`vs=0.70, va=0.60`) | 0.55 | **-0.1275** |
| Remove A1 (`vs=0.955, va=0`) | 0.9775 | **+0.30** |

The largest bar is the **on-call attacker A1**, not the load-test cluster.
Grok's formula suppresses attacker sensitivity precisely because of the spurious
`/(1 - phi-)` divisor (under it, removing A1 moves the root only +0.034). So G-1
does not stay contained in one number: it produces a wrong *explanation*, which is
the one thing §(a) F6 designates the impact layer to deliver.

**Fix.** Recompute the table after G-1 and reverse the stated conclusion.

### G-4 · MAJOR · §(a) "Semantics choice" table — Euler-based and weighted h-categorizer are conflated

**Evidence.** The table row "**Euler / weighted h-categorizer** | Long formal
pedigree | Asymmetry / property trade-offs", with bibliography row "Amgoud &
Ben-Naim. Evaluation of arguments in weighted bipolar graphs. ECSQARU 2017 |
Euler / weighted gradual". These are two different semantics on two different
frameworks. Verified in the primary text (Amgoud, Ben-Naim, Doder, Vesic,
*Acceptability Semantics for Weighted Argumentation Frameworks*, IJCAI 2017,
pp. 56–62, extracted from the official PDF), Def. 9 / Def. 10 / Thm. 13:

```
Deg_Hbs(a) = w(a) / (1 + SUM_{b in Att(a)} Deg_Hbs(b))
```

defined over a **weighted argumentation graph** `G = <A, w, R>` — attacks only.
There is no support relation in weighted h-categorizer. Offering it as a semantics
option for a bipolar engine whose entire premise is "supporters raise a parent,
attackers lower it" (intake §Research brief) without stating that it has no native
support is a formal misstatement. Its sum-based denominator also linearly rewards
duplicate attackers, which cuts against the packet's own F5.

**Fix.** Split the row; state that weighted h-categorizer is attack-only and would
need a bipolar extension; note its duplicate-counting behaviour.

### G-5 · MAJOR · §(a) minimal set item 3 + bibliography — Potyka & Booth used one-sidedly

**Evidence.** Grok: "DF-QuAD's conservativeness is cited as a desirable property in
recent work", bibliography row "Potyka & Booth ... KR 2024 | DF-QuAD
conservativeness property | **VERIFIED** (via ArgRAG citation chain)". I read the
primary PDF. Verbatim findings:

- *"The modular semantics defined by (alpha_PROD, iota_d) (Df-QuAD) ... satisfy relative conservativeness."* — grok's claim is true, but only for the **relative** notion.
- *"Since Df-QuAD satisfies relative but not absolute conservativeness, the other direction cannot hold."*
- *"As we saw, Df-QuAD already satisfies relative conservativeness, but does not satisfy open-mindedness."*
- Abstract: the authors *"introduce two novel semantics that satisfy conservativeness properties"* — i.e. the paper exists because existing semantics, DF-QuAD included, do not hit the target.

The DF-QuAD row of grok's semantics table lists exactly one risk ("Saturation with
many weak children") and omits the two documented property failures. The omitted
one — non-open-mindedness — is the single most decision-relevant property for this
product, and is what makes G-2 unrecoverable.

**Fix.** Restate as "DF-QuAD satisfies *relative* conservativeness but not
absolute conservativeness and not open-mindedness (Potyka & Booth, KR 2024)", and
add the open-mindedness failure to the risk column and to §(d) question 1.

### G-6 · MAJOR · §(a) F4 — the "independence bonus" double-counts corroboration

**Evidence.** F4 proposes "optional modest *independence bonus* only when >=2
families support same parent **and** no shared provenance", on top of F3's
DF-QuAD aggregation. But `F(x1..xk) = 1 - PROD(1-xi)` **is already** the accrual
operator: two independent supporters at 0.8 and 0.6 already yield 0.92 rather than
0.8. Multiplying a further bonus onto an aggregate that already rewards
independent accrual counts the same independence twice, and does so with a
constant that has no provenance — the defect class the packet exists to kill.
Grok partly senses this ("no exotic bonus at v1") but leaves the factor in the
options table without the disqualifying argument.

**Fix.** State explicitly that DF-QuAD's `F` is the corroboration operator and
that any additional multiplier requires an out-of-sample calibration artifact;
otherwise move F4's bonus to the MUST NOT column alongside F9/F10.

### G-7 · MINOR · §(a) framing + §(f) — "KR 2026 extended form" asserted beyond its verification

Grok writes "Yin, Potyka, Rago, Kampik, Toni, arXiv:2507.11323, 2025; **KR 2026
extended form**" and marks the row "**VERIFIED** (arXiv abstract page)". The arXiv
paper verifies exactly (I read the primary PDF); the KR 2026 extended version is
an additional claim that an arXiv abstract page cannot support. Same pattern for
the "Belief Function Propagation ... KR 2026 listing" row, though that one is
honestly marked PARTIAL. **Fix:** downgrade the KR 2026 half of the row to PARTIAL
or drop it.

### G-8 · MINOR · §(f) — "VERIFIED" granted on secondary evidence

Six rows are marked VERIFIED with reasons like "via ArgRAG citation chain",
"secondary + ArgRAG", "standard citation", "edition-specific page not re-fetched".
Every underlying work is real (I checked), so nothing is invented — but a
verification standard that never touches the primary text is the citation-level
analogue of the fabricated-confidence defect, and it is exactly what produced G-5:
the one claim grok verified only "via ArgRAG citation chain" is the one that
misreports the source. **Fix:** adopt codex's convention — state what was checked
(publisher page / proceedings PDF / primary formula) per row, and mark
secondary-only rows PARTIAL.

### G-9 · MINOR · §(a) F3 — EW-QBAF edge-weight range misstated

Grok: "multiply or soft-scale child sigma by edge weight `w in (0,1]` (Yin et al.
2025 EW-QBAF)". The mechanism is right — verified in the primary PDF, Def. 1:
`w : R- U R+ -> [0,1]`, with `A_alpha = {sigma(beta)*w((beta,alpha))}`,
`S_alpha = {sigma(beta)*w((beta,alpha))}` (Eqs. 1–2) — but the interval is closed
at 0, not open. Non-trivial only because `w = 0` is the "this edge is switched
off" case a value overlay will actually want. **Fix:** `w in [0,1]`.

### G-10 · MINOR · §(a) F5 + §(e) Step 1 — cluster-max forfeits a documented principle silently

Cluster strength `= max(beta)` means adding a genuine additional supporter that
lands inside an existing cluster changes the parent's strength by exactly zero,
whereas raw DF-QuAD strictly increases it. That is the intended behaviour, but it
is a deliberate violation of the strict-monotonicity/counting principle class, and
the packet nowhere declares which published DF-QuAD properties survive
preprocessing. **Fix:** add one line naming the forfeited principles. (Same defect
in codex — see C-3.)

---

## 2. Findings — research-codex.md

Preface: I recomputed every number in this packet and found no arithmetic error,
and I verified eight citations against primary sources with page numbers and DOIs
matching exactly. The findings below are gaps in the specification, not errors in
it. They are nonetheless substantive enough that I cannot approve.

### C-1 · MAJOR · §(a) "Provenance-family algorithm" — lineage families are scoped inside redundancy clusters, so same-origin *distinct* claims still accrue freely

**Evidence.** The algorithm opens "Within one semantic-redundancy cluster `C`,
build lineage families", step 3 says an item with unknown lineage is connected "to
**every** item in that redundancy cluster", and M4 says "**Inside each cluster**,
collapse common/unknown lineage to family max". Redundancy clustering is defined
over "the proposition that moves one parent in one polarity" — i.e. clusters are
*same-proposition* groups.

Therefore two **different** propositions produced by the **same** measurement run,
dataset, or upstream report land in two different clusters, and their cluster
inputs are then combined by `F` as if independent. Concretely, extending the
packet's own E1: add `S5 = "latency budget met"` at 0.80, also from run M-17. It
is not a paraphrase of S1, so it forms its own cluster. Pipeline output:
`s = 1 - (1-0.92)(1-0.80) = 0.984`, `sigma(R) = 0.40 + 0.60*0.284 = 0.5704` — the
identical figure the packet itself labels as the fabricated, un-deduplicated
result. The hole the algorithm closes at the proposition level is wide open one
level up, at the level where the packet's own failure-mode column locates the risk
("Shared datasets, measurement runs, upstream reports, or derived summaries create
dependence").

**Fix.** Scope lineage families over the whole `(parent, polarity)` sibling set
rather than inside clusters: cluster first for proposition redundancy, then run
the dependence-component pass across *all* cluster inputs, and apply one `max` per
component. If that is judged too aggressive, state the residual risk explicitly
and add it to §(d) question 7.

### C-2 · MAJOR · §"Formal scoring contract" + §(e) E1 — the mandatory intrinsic base creates a base/children double-counting hazard

**Evidence.** "The root itself must be judged or the answer abstains"; E1 gives
`R  explicit intrinsic base  base 0.40 / provenance: derived root assessment,
judgment J-R`. In DF-QuAD, `beta` is the argument's strength *prior to dialectical
interaction*. A "derived root assessment" of the very claim that S1/S2/S3/A1 argue
about will, in practice, be derived from the same evidence — so that evidence
enters the score twice: once through `beta(R) = 0.40` and again through
`F(supporter inputs)`. The packet warns against the analogous error one level down
("double counting quality both in `b_v` and an edge multiplier") but states no
rule for base-vs-subtree overlap, and the E1 ledger records `J-R` without any
statement of which premises it may not use.

This is the mirror image of G-2. Grok's failure is a base score with no
provenance; codex's exposure is a base score with provenance that may overlap the
children's. Both distort the same term, and under DF-QuAD's non-open-mindedness
(Potyka & Booth, KR 2024) neither washes out.

**Fix.** Require that a judged base score's provenance record declares its premise
set disjoint from the node's judged descendants' evidence, or mark the node
`BASE_OVERLAPS_SUBTREE` and abstain. Fold into §(d) question 2, which currently
asks only *whether* a base is required, not what it may be derived from.

### C-3 · MAJOR · §(a) M0–M7 + "Gradual semantics choice" — published DF-QuAD properties are not shown to survive the preprocessing

**Evidence.** The served semantics is not DF-QuAD on the user's graph; it is
DF-QuAD on a quotient graph produced by clustering + per-family `max`. Two
consequences the packet does not state:

1. **Strict monotonicity is broken by construction.** In E1, adding `S4` at 0.50
   to family `M-17` leaves `m_M17 = max(0.80, 0.80, 0.50) = 0.80`, `z_C = 0.92`,
   `sigma(R) = 0.532` — unchanged. Raw DF-QuAD would strictly increase it. This is
   *intended* (it is the point of duplicate discounting), but it means the
   monotonicity/counting principles catalogued in the packet's own [B3] no longer
   hold of the shipped scorer.
2. The packet says "Require property tests for stability, directionality,
   balance/monotonicity, bounds, and convergence [B3, B5]" — but those tests, run
   against published DF-QuAD principles, will *fail by design*, and there is no
   statement of which principles are deliberately forfeited versus which are
   regressions.

**Fix.** Add a short "principles forfeited by preprocessing" subsection listing
what the quotient construction knowingly gives up (strict monotonicity /
counting), so the property test suite encodes the intended, not the published,
principle set. Without this the design cannot honestly claim DF-QuAD's guarantees.

### C-4 · MINOR · §(a) "Recommended minimal structural set and order" — M0–M7 is not well-founded as a linear pass

M2 ("Score child nodes bottom-up under the selected gradual semantics") precedes
M3–M5, but scoring any non-leaf child requires M3–M5 to have already run *at that
child*. As written the pipeline reads as one sweep and cannot execute. **Fix:**
present M2–M5 as a single per-node step iterated in reverse topological order.

### C-5 · MINOR · §"Interval judgments" — the enclosure is sound but loose on a DAG, and this is not flagged

I verified the monotonicity premise and it holds: `D` is non-decreasing in `b`
(coefficient `1-(a-s)` resp. `1-(s-a)`, both `>= 0`), non-decreasing in `s`
(`+b` resp. `+(1-b)`), non-increasing in `a` (`-b` resp. `-(1-b)`), continuous at
`a = s`; `F` is non-decreasing in each input. So "a sound enclosure" is correct.
But the graph is a DAG, not a tree: a node feeding two parents, or supporting one
ancestor while attacking another, appears more than once in the recursion, so
interval arithmetic over-approximates (the classical dependency problem). The
result stays sound; it stops being tight. Since §(c) serves intervals to
strangers, over-wide bars are a UX problem. **Fix:** one sentence stating the
enclosure is conservative and may be strictly wider than the true range on
non-tree graphs.

### C-6 · MINOR · §(e) E1 — the "silently assigned 0.5" figures switch baselines mid-paragraph

"If the unjudged `U1` were also silently assigned `0.5`, support would become
`0.992` and the root `0.5752`." Recomputed: `0.992` and `0.5752` are correct only
on the **raw, un-deduplicated** branch introduced in the preceding sentence
(`1 - 0.20*0.20*0.40*0.50 = 0.992`; `0.40 + 0.60*0.292 = 0.5752`). On the packet's
own **recommended** pipeline the figures are `s = 1 - (1-0.92)(1-0.50) = 0.96` and
`sigma(R) = 0.40 + 0.60*0.26 = 0.556`. The prose reads as though it is quantifying
the 0.5-defect against the recommended pipeline; it is not. **Fix:** give both, or
name the baseline.

### C-7 · MINOR · §"Formal scoring contract" — judged `0` and `ABSENT` are score-equivalent, not merely ledger-distinguishable

"A genuinely judged score of `0` remains distinguishable from an absent judgment."
True in the audit ledger; false in the number. Under `F`, a judged `0` contributes
factor `(1-0) = 1`, and `F(∅) = 0`, so `F({0, x}) = x = F({x})` and
`D(b, 0, 0) = b`. The hard gate therefore buys separation from `0.5`, not from
`0`. Worth stating, because the packet's architecture rests on the distinction and
a reader may assume it is visible in the score. **Fix:** qualify to "distinguishable
in the ledger and in every downstream audit, though numerically equivalent under
`F`."

### C-8 · MINOR · §"Formal scoring contract" S1 — the edge-weighted construction is published, not novel

`x(i -> p) = relevance(i,p) * sigma(i)` is registered under SPECULATION S1 as a
proposed wrapper "not claimed to be part of canonical DF-QuAD". Correct as to
canonical DF-QuAD, but it is exactly the published EW-QBAF construction: Yin,
Potyka, Rago, Kampik, Toni, arXiv:2507.11323, Def. 1 (`w : R- U R+ -> [0,1]`) with
Eqs. 1–2 (`A_alpha = {sigma(beta)*w((beta,alpha))}`,
`S_alpha = {sigma(beta)*w((beta,alpha))}`) — I read the primary PDF. Under-citing
costs the design a peer-reviewed footing and the associated G-RAE sensitivity
machinery it could reuse for §(a)'s flip-sensitivity factor. (Grok cites this
paper; codex does not.) **Fix:** cite it and downgrade S1 to the parts that are
genuinely novel (the `Judgment` sum type, `ABSENT`, root-abstention,
`UNSUPPORTED_CYCLE`).

---

## 3. Cross-packet contradictions

**X-1 · Base score of a decomposition/decision node.** grok §(e) uses
`beta(R) = 0.5` as a "neutral prior"; codex requires an explicit judged base or a
typed abstention and states "If `J-R` were absent, the correct root output would be
a typed abstention, not `0.5` and not `0.532`."
→ **The literature and the contract support codex.** The intake makes this
non-negotiable, and Potyka & Booth (KR 2024, verified verbatim) show DF-QuAD is
not open-minded, so an unprovenanced prior is never argued away. Magnitude of the
disagreement, on grok's own map under correct DF-QuAD: `beta = 0` → **0.355**;
`beta = 0.5` → **0.6775**; grok's published number → **0.944**. Three different
answers from one map. The merge must pick one rule and write it into the scorer
contract. Residual genuine question (codex §(d) 2): whether a child-determined
node may legitimately have *no* base at all rather than a judged one.

**X-2 · Does provenance type touch the number?** grok F1 allows "optional *caps*
on base-score ranges" per type; codex forbids any `lambda_type`, routing type to
validation procedures instead ("Fixed `measured > cited > derived` constants are
fabricated confidence").
→ **Literature supports codex.** No calibrated type→strength mapping exists in the
surveyed work; a cap is still an unprovenanced number that silently bounds a
judged score. Grok's own F1 failure column ("collapsing types into one scalar")
argues codex's side. Open only in the sense codex names: admissible if and only if
a versioned calibration artifact with error bars is produced.

**X-3 · Corroboration bonus.** grok F4 offers an "independence bonus" for >=2
families; codex says "Do not apply another corroboration multiplier later" and
lets families accrue solely through `F`.
→ **Literature supports codex** (see G-6): `F` is already the noisy-OR accrual
operator; a second multiplier double-counts. Not a genuine open decision.

**X-4 · Status of weighted h-categorizer.** grok lists it in a combined
"Euler / weighted h-categorizer" row as a bipolar option; codex calls it "a useful
attack-only comparison" that "lacks native support in that form and also counts
duplicates".
→ **Literature decisively supports codex.** Amgoud/Ben-Naim/Doder/Vesic IJCAI 2017
Def. 9–10, Thm. 13 (primary PDF read): `Deg_Hbs(a) = w(a)/(1 + SUM_{b in Att(a)}
Deg_Hbs(b))` on `G = <A, w, R>` — attacks only. Codex also correctly identifies
the sum-denominator's duplicate sensitivity.

**X-5 · Where value preferences live.** grok §(c) recommends EW-QBAF *edge
weights* as the natural home for preferences; codex §(c) insists on a strictly
separate overlay with its own `ValueProfile` schema and treats even criterion
direction and normalisation `u_j` as value-owned.
→ **Genuine open decision.** Grok's mechanism is real and verified (EW-QBAF
Def. 1 + Eqs. 1–2, primary PDF), and G-RAEs give free sensitivity analysis;
codex's separation is the stronger guarantee against the intake's marking
requirement, and its point that mapping a raw consequence to `0..1` desirability
is *already* a value judgment is a genuine insight grok does not have. Grok's own
§(d) question 7 names the smuggling risk. Recommend for the merge: codex's
separation as the contract, grok's edge weights as the implementation of the
value layer only, never on epistemic edges.

**X-6 · Intervals now or later.** grok ships hard typed abstention at v1, intervals
"eventually" (SPECULATION 4, "simpler stranger story"); codex specifies interval
propagation now with a monotonicity-based sound enclosure and cites Oren & Yun on
elicitation difficulty.
→ **Genuine open decision.** Only codex supplies the propagation math (which I
verified — see C-5); only grok supplies the stranger-comprehension argument. They
are not incompatible: typed abstention for *absent* judgment, intervals for
*imprecise* judgment. The merge should state that these are two different states,
not two competing designs.

**X-7 · Semantics default and its property profile.** grok recommends DF-QuAD
partly for "conservativeness"; codex makes DF-QuAD the default but demands
property tests and treats the choice as swappable behind an interface.
→ **Literature supports codex's caution.** ArgRAG (primary HTML read) states it
focuses on **QE** "since it satisfies almost all properties" and reports "only
minor performance differences across different gradual semantics (Euler, QE,
DFQuAD)" — grok's characterisation of the ablation is accurate but its inference
("choose DF-QuAD for conservativeness") over-reads it. And Potyka & Booth: DF-QuAD
has *relative* conservativeness, **not** absolute conservativeness and **not**
open-mindedness. **Neither packet states the open-mindedness failure**, and it is
the property most relevant to a system that must not let priors survive contrary
evidence. Flagged for the merge as a shared gap.

**X-8 · Convergences worth recording (not contradictions).** Independently of each
other, both packets reach: (i) unjudged ⇒ excluded from aggregation, never 0.5;
(ii) sibling near-duplicates share weight via a max-style rule, never sum;
(iii) centrality and flip-sensitivity are explanation-only and must never re-enter
the scorer (grok F6 "not fed back into beta"; codex "Do not feed them back as
weights"; reflexivity named by both); (iv) SMARTER/ROC is the lowest-burden default
flow, escalating to swing; (v) a visible `VALUE-DECIDED` marker with a
counterfactual/break-even line. I independently checked the ROC weights and both
packets state the formula correctly. Triple-blind agreement on these five is the
strongest signal in the mission and should be promoted to product law in R3.

---

## 4. Citations checked

Spot-check target was 4 per packet; I checked 10 for grok and 8 for codex, several
against primary text rather than metadata.

### research-grok.md

| # | Citation as given | Verification |
|---|---|---|
| 1 | Rago, Toni, Aurisicchio, Baroni. DF-QuAD. KR 2016 | **VERIFIED — and formula misused.** Real paper; combination function recovered verbatim from the authors' CEUR Vol-1672 restatement and confirmed 3x more. Grok's E1 does not implement it (G-1). |
| 2 | Yin, Potyka, Rago, Kampik, Toni. arXiv:2507.11323, 2025 | **VERIFIED (primary PDF).** Authors, title, EW-QBAF Def. 1, G-RAEs all exact. The appended "KR 2026 extended form" is **UNVERIFIED** (G-7). |
| 3 | Zhu et al. ArgRAG. arXiv:2508.20131, 2025 | **VERIFIED (primary HTML).** Uniform `beta = 0.5` confirmed verbatim; "initializing base scores without prior knowledge (NP) outperforms using retriever scores (RS)" confirmed; "only minor performance differences across ... (Euler, QE, DFQuAD)" confirmed. Grok's three ArgRAG claims are all accurate. |
| 4 | Al Anaissy, Delobelle, Vesic, Yun. arXiv:2407.08302; AAMAS 2025 | **VERIFIED.** arXiv ID correct; AAMAS 2025 proceedings PDF p. 69; Shapley-rooted impact confirmed. |
| 5 | Libman, Oren, Yun. JAIR 2026 | **VERIFIED.** JAIR article 20450, April 2026; title and inverse-problem content match. |
| 6 | Potyka & Booth. KR 2024 | **VERIFIED AS A PAPER; CLAIM PARTIALLY MISREPORTED** (G-5). Primary PDF: DF-QuAD satisfies relative but not absolute conservativeness and **does not satisfy open-mindedness**. |
| 7 | Wang & Shen. Bilateral Gradual Semantics. AAAI 2024 | **VERIFIED.** AAAI 38(9), 10732–10739. |
| 8 | Rapberger et al. Gradual semantics for ABA. KR 2025 / arXiv:2507.10076 | **VERIFIED.** proceedings.kr.org/2025/50. |
| 9 | Sanayei et al. EMNLP Findings 2025 / arXiv:2509.15739 | **VERIFIED.** ACL Anthology 2025.findings-emnlp.1159; QuAD-ranking content matches. |
| 10 | Rezaei. BWM: a decade of evolution. Omega 2026 | **VERIFIED.** Omega vol. 143, art. 103546. |
| — | Thieyre et al., imprecise QBAFs (grok: PARTIAL) | **PARTIAL, honestly marked.** A 2025 "Uncertainty in Quantitative Bipolar Argumentation Frameworks" record exists; imprecise-weight framing matches. |

**No invented or misattributed citation found in research-grok.md.** The
bibliography's defect is verification *standard* (G-8), not fabrication.

### research-codex.md

| # | Citation as given | Verification |
|---|---|---|
| B1 | Rago et al., DF-QuAD, KR 2016, pp. 63–73 | **VERIFIED including the formula.** Codex's `F` and `D` match the primary combination function exactly, in all three branches. |
| B2 | Amgoud, Ben-Naim, Doder, Vesic. IJCAI 2017, pp. 56–62, doi:10.24963/ijcai.2017/9 | **VERIFIED including the formula (primary PDF).** Def. 9/10 and Thm. 13 give `Deg_Hbs(a) = w(a)/(1 + SUM_{b in Att(a)} Deg_Hbs(b))`; page 56 confirmed in the proceedings footer. |
| B7 | Rago, Vasileiou, Tran, Toni, Yeoh. KR 2025, pp. 500–511, doi:10.24963/kr.2025/49 | **VERIFIED.** proceedings.kr.org/2025/49; DOI resolves; title exact. |
| B10 | Al Anaissy et al. AAMAS 2025, pp. 69–77 | **VERIFIED.** ifaamas proceedings PDF p69 — page number exact. |
| B11 | Albini, Baroni, Rago, Toni. COMMA 2020, pp. 55–66, doi:10.3233/FAIA200492 | **VERIFIED.** IOS Press record; page range exact. Codex's use of it ("PageRank-as-semantics fails desirable properties unless reconstructed") matches the abstract. |
| B13 | Barakat, Taylor, Griffiths, Miles. TaPP 2017 | **VERIFIED.** USENIX program record; all four authors exact. |
| B18 | Aloysius, Davis, Wilson, Taylor, Kottemann. EJOR 169(1) 2006, 273–285 | **VERIFIED.** DOI 10.1016/j.ejor.2004.05.031; pages exact. |
| B19 | Aubert, Schmid, Lienert. EJOR 314(2) 2024, 760–775 | **VERIFIED.** Pages exact; codex's paraphrase ("learning loops improve factual learning while feeling cognitively demanding") matches the abstract's finding. |
| B8 | Oren & Yun. AAMAS 2026, doi:10.65109/NSCC6791 | **PARTIALLY CONFIRMED — not fabricated.** The DOI resolves (302 → dl.acm.org; ACM returned 403 to the fetcher). The `10.65109` prefix is confirmed as the AAMAS proceedings prefix via an independent AAMAS 2026 DOI. The predecessor arXiv:2502.07452 ("Eliciting Rational Initial Weights in Gradual Argumentation", Oren & Yun) is fully verified and matches the cited content. I could not independently confirm the exact AAMAS title string. |

**No invented or misattributed citation found in research-codex.md.** Page numbers
and DOIs were exact everywhere I could check them — the strongest bibliography in
the mission.

---

## 5. Refutations attempted and failed

Recorded so the merge knows what has already been stress-tested.

**Against codex (all failed to break it):**

1. *Tried to leak an unjudged number through the gate.* Traced every path: `x` is
   `ABSENT` before grouping; `F` iterates numeric inputs only; `F(∅) = 0` and
   `D(b,0,0) = b`, so a node whose children are all abstained returns its base
   untouched and no `0.5` can be synthesised anywhere downstream. Also checked the
   `relevance = 1` escape hatch — it is required to be explicitly recorded, never
   synthesised from edge existence. **Could not break.**
2. *Tried to falsify the interval-monotonicity premise.* Differentiated `D` in
   both branches w.r.t. `b`, `a`, `s`, checked the `a = s` boundary for
   continuity, and checked `F`'s monotonicity. All three claims hold. The
   enclosure is sound; only its tightness is criticisable (C-5). **Could not
   break.**
3. *Recomputed all of E1 and E2.* `m_M17 = 0.80`; `z_C = 1-(0.20)(0.40) = 0.92`;
   `s = 0.92`; `a = 0.70`; `D(0.40, 0.70, 0.92) = 0.40 + 0.60(0.22) = 0.532`;
   raw-branch `s = 1-(0.20)(0.20)(0.40) = 0.984` → `0.5704`; stated delta
   `0.0384` correct. E2: `V(Cheap) = 0.55 + 0.35w`, `V(Safe) = 0.95 - 0.55w`; at
   `w = 0.30` → 0.655 / 0.785; at `w = 0.60` → 0.760 / 0.620; break-even
   `0.90w = 0.40`, `w = 4/9 = 0.4444`. AHP counts `10 at m=5`, `28 at m=8`. ROC
   `w_j = (1/m) SUM_{k=j..m} 1/k`. **Every number correct.**
4. *Tried to find a fabricated citation.* Eight checked against publisher /
   proceedings / primary text, including page ranges. All exact. **Could not
   break.**
5. *Tried to argue the flip predicate is wrong at the threshold.* The conjunct
   "and the two results differ" correctly excludes the degenerate
   `sigma = sigma' = theta` case. **Could not break.**

**Against grok (broke it twice; the rest held):**

6. *Recomputed E2 in full.* ROC `k=2` → `w_safe = 0.75, w_cost = 0.25`;
   `U(Cheap) = 0.525`, `U(Safe) = 0.7475`; flipped weights → `0.775` vs `0.4825`;
   swing `100/140 = 0.714` vs `0.286` → 0.543 vs 0.728, same winner. ROC `k=3` →
   `0.611 / 0.278 / 0.111` from the stated formula. BWM `2n-3` vs AHP `n(n-1)/2`.
   **All correct — the value half of grok's arithmetic is clean.**
7. *Tried to catch grok inventing the ArgRAG critique.* Checked all three claims
   against the primary paper: uniform `0.5`, retriever-scores-underperform, small
   cross-semantics gaps. **All three verified.** Grok's identification of ArgRAG's
   uniform `0.5` as the mission's named anti-pattern is the sharpest observation
   in either packet — which makes G-2 the more striking, since grok then does the
   same thing in its own worked example.
8. *Tried to catch grok misdescribing EW-QBAF.* The edge-weight multiplication is
   exactly right against Def. 1 / Eqs. 1–2 of the primary PDF; only the interval
   endpoint is off (G-9). **Substantially held.**
9. *Tried to find an invented citation.* Ten checked; every underlying work is
   real. **Could not break.**
10. *Broke:* the DF-QuAD combination function (G-1), verified against four
    independent primary statements, with the downstream tornado inversion (G-3) as
    corroboration that the error is consequential and not cosmetic; and the
    unjudged `0.5` root prior (G-2), which the packet's own F2/F10 forbid.

**What would flip my verdicts.**
*research-grok.md → LENS APPROVED:* correct the E1 combination to
`c(v0,va,vs)` as defined in §0, republish Step 4 as 0.68, republish the Step 5
tornado with A1 as the longest bar, and either remove `beta(R) = 0.5` or attach a
judged, provenanced base score to R with the base disclosed in the stranger line.
G-4 and G-5 must also be corrected, since both misstate what the literature says.
*research-codex.md → LENS APPROVED:* move the lineage-family pass outside
redundancy clusters (or state the residual same-origin accrual risk as a named
defect with an owner decision), add a base-vs-subtree disjointness rule for judged
base scores, and add the "principles forfeited by preprocessing" statement so the
property-test suite tests the intended semantics rather than the published one.

---

## 6. (a)–(g) completeness against the intake contract

| Section | grok | codex |
|---|---|---|
| (a) factor table + minimal set | complete; all six intake factors + recency + two MUST-NOTs | complete; all six intake factors, with exact algorithms and complexity |
| (b) flows ranked by burden | complete (4 ranks + workshop tier); exceeds the "2–3" ask | complete (exactly 3: SMARTER / swing / AHP) |
| (c) value overlay | complete, with abstention typology and display chrome | complete, with robust-margin LP and an explicit display contract |
| (d) open decisions as sharp questions | complete (12) | complete (16) |
| (e) worked examples | present, both required kinds — **but E1's structural arithmetic is wrong** (G-1) | present, both required kinds, all arithmetic correct |
| (f) bibliography with status | present; verification standard too loose (G-8) | present; strongest in the mission |
| (g) SPECULATION register | present (8 items) | present (8 items, S1–S8) |

Both packets satisfy the intake's "at least one mini argument map with numbers"
and "one cheap-vs-safe hinge" requirements structurally. Only codex's numbers
survive recomputation.

End of lens artifact. Read-only throughout; no reviewed file was modified.
