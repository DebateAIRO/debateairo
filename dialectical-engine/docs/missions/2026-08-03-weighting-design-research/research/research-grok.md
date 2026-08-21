RESEARCH HANDOFF COMPLETE
Seat: grok-4.5 (freshest-literature + MCDA/UX lens)
Sections: (a) structural factor table + minimal set; (b) value-weight
elicitation flows ranked by burden; (c) value overlay design; (d) open
decisions as sharp questions; (e) worked examples; (f) bibliography with
verification status per citation; (g) SPECULATION register.

Mission: WEIGHT-RESEARCH-R1 · Round: R1 · Lens: freshest literature (2023–2026
preferred) + MCDA / preference-elicitation UX. Contract: H0 intake research brief.
Independence rule: no other seats' outputs read.

---

# (a) Structural (epistemic) weight factors — options table + minimal set

## Framing from freshest literature

Two weight kinds must not be conflated:

| Kind | What it encodes | Who owns it | Must never look like |
|------|-----------------|-------------|----------------------|
| **Structural / epistemic** | How much a node moves its parent given evidence structure | Graph + evidence subsystem (and, where needed, explicit human quality judgments) | A silent mid-range default on an unjudged node |
| **Value** | Whose priorities break ties when evidence cannot decide competing goals | Named preference owner (user / org profile) | Evidence-derived confidence |

Post-2023 work that other lenses may underweight (verified live):

- **Edge-weighted QBAFs + contestability** (Yin, Potyka, Rago, Kampik, Toni, arXiv:2507.11323, 2025; KR 2026 extended form): relation *edge weights* are first-class (preferences / relational strength); gradient-based relation attribution explanations (G-RAEs) quantify how topic strength moves when edge weights change — a direct technical path for flip-sensitivity and for marking preference-driven edges.
- **Impact / attribution measures for gradual semantics** (Al Anaissy, Delobelle, Vesic, Yun, arXiv:2407.08302 → AAMAS 2025): refine Delobelle–Villata impact and introduce Shapley-rooted impact; principles for evaluating which arguments drive a score — the formal cousin of tornado / flip analysis on argument graphs.
- **Uncertainty / imprecise QBAFs** (Thieyre et al., ECAI-line 2025): imprecise quantitative bipolar frameworks for sparse voting / incomplete strength — relevant to typed abstention vs fake 0.5.
- **Bases + inverse problems for weighted gradual semantics** (Libman, Oren, Yun, JAIR 2026): inverse problem (which base scores yield a target ranking) and related semantic issues for weighted max/card/h-categorizer families.
- **LLM-built argument maps with deterministic scoring** (Zhu et al., ArgRAG, arXiv:2508.20131, 2025): LLM only *structures* a QBAF; gradual semantics (QE / DF-QuAD / Euler) compute strengths deterministically; supports contest base score and contest polarity. **Critical defect note for this mission:** ArgRAG initializes all base scores to uniform 0.5 — exactly the *fabricated confidence* defect this design must kill for production answers.
- **Argumentative LLMs / CAT evaluation of LLMs** (Freedman et al. AAAI 2025 ArgLLMs; Sanayei et al. EMNLP Findings 2025 on LLMs recovering QuAD rankings from dialogue).
- **Bilateral gradual semantics** (Wang & Shen, AAAI 2024): non-reciprocal rejectability degrees on weighted argumentation — newer alternative aggregation family.
- **Gradual semantics for ABA** (Rapberger et al., KR 2025): gradual scores on assumption-based argumentation — useful if the engine ever mixes structured assumptions with evidence leaves.
- **Belief-function propagation in QBAFs** (KR 2026 program listing): uncertainty propagation without collapsing to a point score — candidate for typed abstention display.

Classical anchors still binding: DF-QuAD (Rago, Toni, Aurisicchio, Baroni, KR 2016); QuAD (Baroni et al.); weighted h-categorizer / Euler-based (Amgoud & Ben-Naim); Quadratic Energy (Potyka 2018).

## Factor-by-factor options table

Computation column = “from graph + evidence alone” where possible. **Judged quality** is the explicit exception (human/agent judgment with provenance).

| # | Factor | What it measures | How computed (options) | Failure modes | Cost | Keep in minimal set? |
|---|--------|------------------|------------------------|---------------|------|----------------------|
| F1 | **Evidence provenance type** | Epistemic status of a leaf: looked-up / measured / derived | Typed enum on evidence node (`cited` / `measured` / `derived`). Maps to *display* and optional *caps* on base-score ranges, never to a silent mid default. | Type mis-label; treating derived as measured; collapsing types into one scalar without provenance badge | Low (annotation at evidence creation) | **YES — mandatory** |
| F2 | **Base score only when judged** | Initial strength β(a) ∈ [0,1] or **typed abstention** | Judged leaves: β from evidence pipeline / quality judgment with provenance. Unjudged: β = **undefined** (abstain type), **never** 0.5. Propagation: parent that depends only on abstaining children abstains or shows interval. | Fabricated confidence (silent 0.5); confusing abstain with “weak evidence” | Low–med (requires pipeline + UI for abstention) | **YES — non-negotiable** |
| F3 | **Attack / support polarity + strength of counters** | How children raise or lower parent | DF-QuAD-style: aggregate attackers φ⁻ = 1−∏(1−σᵢ), supporters φ⁺ similarly; combine with β via discontinuity-free combination (Rago et al. 2016). Edge-weighted variant: multiply or soft-scale child σ by edge weight w∈(0,1] (Yin et al. 2025 EW-QBAF). | Saturation (too many weak supports look decisive); polarity mislabel; ignoring counters | Med (standard bottom-up O(n+e) on DAGs) | **YES — core scorer** |
| F4 | **Corroboration across independent evidence families** | Independent sources should reinforce more than clones | Cluster leaves by *evidence family* (source domain / method / run-id). Discount within-family redundancy (see F5); optional modest *independence bonus* only when ≥2 families support same parent **and** no shared provenance. | Over-counting same lab / same scrape; fake independence from metadata gaps | Med–high (family clustering) | **YES (light form)** — family tag + within-family share, no exotic bonus at v1 |
| F5 | **Semantic redundancy / near-duplicate discounting** | Sibling near-duplicates must share weight, not double it | Embedding / claim-hash similarity among siblings under same parent; partition into redundancy clusters; each cluster contributes once with strength = max or soft-OR of members, not sum. | Over-merge distinct claims; under-merge paraphrases; adversarial rephrase to escape cluster | Med (embeddings; can cache) | **YES** |
| F6 | **Node centrality / flip-sensitivity (impact)** | How much this node moves the root (or topic) | Leave-one-out Δσ(root); gradient / G-RAE on edge weights (Yin et al. 2025); Shapley-style impact (Al Anaissy et al. 2024/25). Display as tornado bar, not as a weight that re-enters the scorer (avoid circularity). | Expensive on large graphs; misread as “importance weight” that re-scores | High if exact Shapley; low–med for 1-way tornado on top-k | **YES as explanation layer**, not as scorer input at v1 |
| F7 | **Judged quality (human or agent)** | Reliability beyond type (study quality, run success, source trust) | Explicit quality score with **who judged + when + basis**. Applied only to base score of that node. Unjudged quality ⇒ no quality multiplier (not 1.0 silently). | Silent quality=1.0; reputation theater without basis | Med (elicitation or automated checks) | **Optional v1; required path for contested high-stakes leaves** |
| F8 | **Recency / freshness** | Temporal decay of cited facts | Time-decay on β for `cited` only, with decay policy provenance | Policy hidden from reader; chrono bias against durable principles | Low | No for minimal set (policy product decision) |
| F9 | **Volume / fan-in raw count** | Number of children | **Do not** use raw count as weight (duplicates and spam win) | Fabricated confidence via pile-on | — | **MUST NOT** |
| F10 | **Unjudged default mid-range** | “We don’t know so 0.5” | **Forbidden** | Named defect: fabricated confidence | — | **MUST NOT** |

### Recommended **minimal structural set** (v1 product law)

1. **F1 provenance type** on every evidence leaf (display + audit).
2. **F2 judged base or typed abstention** — unjudged contributes **nothing** (no silent β).
3. **F3 DF-QuAD-style bipolar aggregation** (or QE if property trade-offs prefer it; ArgRAG ablations show small accuracy gaps — choose for interpretability / conservativeness; DF-QuAD’s conservativeness is cited as a desirable property in recent work).
4. **F5 redundancy clusters** among siblings under one parent.
5. **F4 light corroboration**: independent-family tags; within-family share weight; no opaque multi-family multiplier until validated.
6. **F6 impact as UX only** (tornado / “flip this node”) — not fed back into β.

Out of minimal set until justified: F7 full quality model, F8 recency policy, edge weights as free human knobs on *epistemic* edges (edge weights are fine later for **value** overlay — see §c).

### Semantics choice (lens note)

| Semantics | Strength for this product | Risk |
|-----------|---------------------------|------|
| **DF-QuAD** | Discontinuity-free; well-studied; conservativeness; matches current engine direction | Saturation with many weak children |
| **Quadratic Energy (QE)** | Strong axiomatic package; used in ArgRAG production-style pipelines | Less “product of (1−σ)” intuition for strangers |
| **Euler / weighted h-categorizer** | Long formal pedigree | Asymmetry / property trade-offs noted in recent surveys |
| **EW-QBAF** | Edge weights = natural home for value preferences without polluting β | Extra UI + contestability surface |

**Recommendation:** keep **DF-QuAD (or QE) pure for epistemic propagation**; put value preferences on a **value overlay** (edge or goal weights), not inside evidence β.

---

# (b) Value-weight elicitation flows ranked by user burden

When evidence cannot decide (cheap vs safe, fast vs thorough), **value weights** fill the gap. Surveyed methods: AHP, Best-Worst Method (BWM), swing weighting, SMART/SMARTER (ROC), MACBETH. Ranked **lightest burden first**.

## Rank 1 — **SMARTER / Rank-Order Centroid (ROC)** — lowest burden

**Procedure (Edwards & Barron 1994; Barron & Barrett 1996):**
1. List the competing value criteria (e.g., Cost, Safety, Speed) at the hinge node.
2. User **ranks** them most → least important (no magnitudes).
3. Convert rank to weights via ROC: for k criteria ranked 1…k (1 = most important),
   \( w_j = \frac{1}{k} \sum_{i=j}^{k} \frac{1}{i} \).
   Example k=3: w₁≈0.611, w₂≈0.278, w₃≈0.111.

| Aspect | Assessment |
|--------|------------|
| Burden | ~30–90 seconds; one rank order |
| Robustness | Surrogate weights; often recovers same **ranking of options** as fuller methods in classic studies |
| Failure modes | Ties ignored; rank errors amplify; users may not understand non-equal spacing of ROC weights |
| UX pattern | “Drag these goals into priority order” + live preview of hinge outcome |

**Best default for strangers and first-run product.**

## Rank 2 — **Swing weighting** (or SMART with explicit swings) — medium burden

**Procedure (classic MCDA / von Winterfeldt–Edwards tradition; compared in Németh et al. 2019):**
1. Show the decision range on each criterion (worst→best plausible swing in *this* problem).
2. User identifies the criterion whose full swing matters most; assign 100.
3. For each other criterion, “how large is that swing relative to the best?” → 0–100.
4. Normalize to weights.

| Aspect | Assessment |
|--------|------------|
| Burden | ~3–10 minutes; requires understanding “swing” (range, not abstract importance) |
| Robustness | Better grounded than pure importance ratings; still subject to range mis-framing |
| Failure modes | Users rate “importance” instead of swing; poorly set ranges invent false trade-offs |
| UX pattern | Side-by-side cards: “Moving Safety from worst to best vs Cost from worst to best — how much of the best swing?” + sensitivity slider afterward |

**Best when stakes justify 5 minutes and ranges are well defined.**

## Rank 3 — **Best-Worst Method (BWM)** — medium–high burden, better consistency than AHP

**Procedure (Rezaei 2015; decade survey Rezaei 2026):**
1. Identify best and worst criterion.
2. Rate best-vs-each and each-vs-worst on 1–9.
3. Solve minimax optimization for weights; report consistency ratio (typically better behaved than AHP).

| Aspect | Assessment |
|--------|------------|
| Burden | 2n−3 comparisons vs AHP’s n(n−1)/2 — lighter than AHP, heavier than rank |
| Robustness | Empirically more consistent than AHP; explicit consistency check |
| Failure modes | 1–9 scale still ambiguous; needs solver; overkill for 2-criteria hinges |
| UX pattern | “Pick most and least important, then rate the rest against those poles” |

**Best when 4–7 criteria and consistency audit matters (org policies).**

## Rank 4 (usually **avoid for product strangers**) — **AHP full pairwise** and **MACBETH**

| Method | Burden | Notes |
|--------|--------|-------|
| **AHP** (Saaty) | High: n(n−1)/2 pairwise on 1–9; CR ≤ 0.1 often forced rework | Classic; CR is a feature *and* a UX tax; equalizing bias documented |
| **MACBETH** (Bana e Costa et al.) | High: qualitative pairwise attractiveness categories; facilitator-friendly software | Excellent for facilitated workshops; poor for self-serve stranger UI |

### Recommended product ladder

| Context | Flow |
|---------|------|
| Default / stranger | **SMARTER rank** (Rank 1) |
| User opts into precision | **Swing** (Rank 2) |
| Org multi-criteria policy | **BWM** (Rank 3) |
| Facilitated workshop only | MACBETH / full AHP |

Always store: **who** set weights, **method**, **timestamp**, **raw answers** (rank or comparisons), **derived weights**. Never present value weights as evidence scores.

---

# (c) Value overlay design — how values sit on an evidence-scored graph

## Principle

```
evidence graph  --(DF-QuAD/QE pure)-->  epistemic strengths σ_e
value profile   --(only at marked hinges)-->  value-adjusted display σ_v
reader always sees:  which numbers are σ_e vs which step used values
```

Value never rewrites leaf provenance. Value never fills unjudged β.

## Where the overlay attaches

| Attachment | Mechanism | When |
|------------|-----------|------|
| **Hinge node (recommended)** | Parent is a **decision/goal node** with competing criteria children (Cheap plan vs Safe plan). Epistemic σ computed per branch; multi-attribute score uses value weights: \( U = \sum_j w_j \cdot u_j(\sigma_e) \). | Classic cheap-vs-safe |
| **Edge weights on preference edges** | EW-QBAF: edge weight = preference strength (Yin et al. 2025); G-RAE shows sensitivity | When “how much does this support count for *you*” is preference, not evidence |
| **Goal layer above root** | Separate value tree (MACBETH-style value tree / AHP criteria) scoring already-propagated options | Multi-option recommendation UIs |

## Visible marking (stranger-readable) — mandatory chrome

Every value-decided hinge must show **all** of:

1. **Badge:** `VALUE-DECIDED` (not `EVIDENCE`).
2. **Because-you line:** e.g. *“Because you ranked Safety above Cost (SMARTER, 2026-08-03, profile: You).”*
3. **Counterfactual one-liner:** *“If Cost ranked first, recommendation flips to Option B.”* (from one-way sensitivity / G-RAE / leave-one-out).
4. **Control:** sensitivity **slider** or rank editor that live-updates the hinge without re-running evidence.
5. **Separation:** epistemic σ shown *beside* value-adjusted U; never a single merged number without legend.

## Display patterns from decision-support practice

| Pattern | Role | Source practice |
|---------|------|-----------------|
| **Tornado diagram** | Bars = how much root/hinge moves when each weight or node swings across range; longest bar = biggest flip risk | Clemen & Reilly-style decision analysis; one-way sensitivity |
| **Sensitivity sliders** | Direct manipulation of w_j or edge weights | Interactive DSS / M-MACBETH robustness views |
| **“Because you prioritized X”** | Natural-language account of the value step only | Recsys “because you liked” pattern adapted to **values**, not evidence; ArgRAG-style dialogue templates for *epistemic* side |
| **Contest base vs contest value** | Two different actions: change evidence judgment vs change preference | ArgRAG contest base/polarity; Yin et al. contest edge weights |

## Abstention types (first-class; never fake 0.5)

| Type | Meaning | Display |
|------|---------|---------|
| `unjudged_base` | No base score yet | Node grey; “not yet judged”; excluded from φ aggregates or shown as interval |
| `insufficient_evidence` | Judged empty / failed lookup | Explicit empty state |
| `value_required` | Epistemic σ for branches exist but ranking needs preferences | Hinge shows both options + “needs your priorities” |
| `incomparable` | Conflicting value profiles (multi-stakeholder) | Show Pareto / both rankings |

Imprecise/interval QBAF work (Thieyre 2025; belief-function KR 2026) supports **interval strengths** as a honest alternative to point scores under sparse judgment.

---

# (d) Open decisions for the human owner (sharp questions)

1. **Semantics default:** Ship DF-QuAD, QE, or a pluggable strategy with DF-QuAD default? Which property (conservativeness vs saturation vs Franklin/neutrality package) is non-negotiable for stranger trust?

2. **Unjudged nodes:** Strict exclude-from-aggregation, or propagate **intervals**, or block the whole answer until judged? (Interval is richer; exclude is simpler.)

3. **Redundancy detection:** Embedding model + threshold owned by product, or human-only merge, or both with audit?

4. **Evidence families:** What is the ontology of “independent family” (domain, publisher, measurement run, model-id)? Who maintains it?

5. **Value default when user has no profile:** Refuse to recommend (`value_required`), use explicit equal weights with screaming badge, or SMARTER with forced rank before answer?

6. **Whose values in multi-user / org settings:** Single owner, role-based profiles, or compulsory dual display of conflicting profiles?

7. **Edge weights:** Allowed on epistemic edges (risk: smuggling preference into “evidence strength”), or restricted to value-layer edges only?

8. **Impact measures in UX:** Leave-one-out tornado only, or Shapley impact (Al Anaissy et al.) for top-k nodes despite cost?

9. **Quality judgments:** Who may set quality multipliers (end user, moderator, automated scorer), and is quality ever allowed without a written basis string?

10. **LLM structuring vs LLM scoring:** Confirm hard law: LLMs may propose graph structure and draft judgments, but **final numbers on served answers** come from deterministic scorer + explicit provenance (ArgRAG architecture, minus uniform-0.5).

11. **Calibration of ROC vs swing:** Is Rank-1 SMARTER enough for v1, or must swing be the default for any “recommend” speech act?

12. **Contestability SLA:** After user moves a value slider, max latency and what must recompute (hinge only vs full graph)?

---

# (e) Worked examples

## E1 — Mini argument map with step-by-step structural propagation (DF-QuAD-style)

**Claim R:** “Deploy canary release tomorrow.”

```
R  (root, no intrinsic base — pure aggregation of children; show as decision node)
├── + S1  “Load tests passed on staging”     provenance: measured   β=0.85 (judged)
├── + S2  “Rollback runbook rehearsed”      provenance: measured   β=0.70 (judged)
├── + S3  “Same claim as S1, rephrased”     provenance: measured   β=0.80 (judged)  ← near-duplicate of S1
└── − A1  “On-call engineer on PTO”         provenance: cited      β=0.60 (judged)
    leaf U  “Customer NPS trend”            provenance: cited      β=UNJUDGED → typed abstention
```

### Step 0 — Kill fabricated confidence
- U is **not** set to 0.5. It is `unjudged_base` and does not enter aggregation.
- S3 is flagged redundant with S1 (same measurement family / high claim similarity).

### Step 1 — Redundancy cluster
- Cluster C_load = {S1, S3}. Cluster strength = max(β) = 0.85 (or soft-OR; use max for transparency).
- Effective supporters of R: C_load (0.85), S2 (0.70).
- Effective attackers: A1 (0.60).

### Step 2 — Aggregate support / attack (product form)
\[
\phi^{+} = 1 - (1-0.85)(1-0.70) = 1 - 0.15\cdot 0.30 = 1 - 0.045 = 0.955
\]
\[
\phi^{-} = 0.60
\]

### Step 3 — Combine (DF-QuAD discontinuity-free style)
Root has no separate intrinsic claim base; treat β(R)=0.5 only as **neutral prior for a pure option node that is fully determined by children** — *or* better, use β(R)=0 and only child-driven combination. For a pure aggregation node with β=0.5 prior:

Since φ⁺ > φ⁻:
\[
\sigma(R) = \beta + (1-\beta)\cdot\frac{\phi^{+}-\phi^{-}}{1-\phi^{-}}
= 0.5 + 0.5\cdot\frac{0.955-0.60}{1-0.60}
= 0.5 + 0.5\cdot\frac{0.355}{0.40}
= 0.5 + 0.5\cdot 0.8875
= 0.5 + 0.44375
= \mathbf{0.944}
\]

### Step 4 — Provenance line for the stranger
> Epistemic strength of “Deploy tomorrow” ≈ **0.94**.  
> Drivers: measured load-test cluster (β=0.85; S3 discounted as duplicate), measured rollback rehearsal (0.70), cited on-call risk (0.60).  
> **Excluded:** Customer NPS (unjudged — not 0.5).  
> Numbers from DF-QuAD-style aggregation; not a model vibe.

### Step 5 — Flip-sensitivity (impact UX, not re-score)
| Knock out | New σ(R) approx | Δ |
|-----------|-----------------|---|
| Remove C_load | support only S2: φ⁺=0.70 → σ≈0.625 | large drop |
| Remove A1 | φ⁻=0 → σ closer to 1 | moderate rise |
| Include U wrongly as 0.5 support | **forbidden**; would fake confidence | — |

Tornado: longest bar = load-test cluster.

---

## E2 — Cheap vs safe value hinge

**Situation:** Evidence cannot decide which option is “better” overall.

| Option | Cost score u_cost (higher=cheaper) | Safety score u_safe (higher=safer) | How scores obtained |
|--------|-------------------------------------|------------------------------------|---------------------|
| **Option CheapCloud** | 0.90 (epistemic) | 0.40 (epistemic) | measured pricing; cited incident rate |
| **Option SafeCloud** | 0.35 (epistemic) | 0.88 (epistemic) | same pipelines |

Neither row used a value weight yet. Display both rows with provenance.

### User has no value profile → do **not** pick a winner
Show badge `value_required`: “Both options scored on evidence. Prefer cheaper or safer?”

### User completes **SMARTER rank**: Safety ≻ Cost (k=2)
ROC: w_safe = 0.75, w_cost = 0.25.

\[
U(\text{CheapCloud}) = 0.25\cdot 0.90 + 0.75\cdot 0.40 = 0.225 + 0.300 = \mathbf{0.525}
\]
\[
U(\text{SafeCloud}) = 0.25\cdot 0.35 + 0.75\cdot 0.88 = 0.0875 + 0.660 = \mathbf{0.7475}
\]

**Recommendation: SafeCloud** with chrome:

> **VALUE-DECIDED** (not evidence alone).  
> Because you ranked **Safety > Cost** (SMARTER/ROC, profile: You, 2026-08-03).  
> Evidence scores: CheapCloud cheaper (0.90 vs 0.35) but less safe (0.40 vs 0.88).  
> **Sensitivity:** if you rank Cost first (w_cost=0.75), U(CheapCloud)=0.775 > U(SafeCloud)=0.483 → **recommendation flips**.  
> [slider: weight on Safety |····●···| Cost]

### Same hinge with **swing** (Rank 2 flow)
User says full swing on Safety is the reference (100); Cost swing is “about 40”.  
Normalize: w_safe=100/140≈0.71, w_cost≈0.29 → same qualitative winner, slightly different U; store method difference in provenance.

### What must never happen
- Averaging Cost and Safety with hidden equal weights and presenting “0.65 confidence”.
- Folding w_safe into the DF-QuAD base of a safety evidence leaf so the map “looks” purely epistemic.
- Setting unjudged compliance evidence to 0.5 to force a number.

---

# (f) Bibliography with verification status

| Citation | Venue / ID | Used for | Verification |
|----------|------------|----------|--------------|
| Rago, Toni, Aurisicchio, Baroni. *Discontinuity-Free Decision Support with Quantitative Argumentation Debates*. KR 2016 (AAAI proceedings PDF verified). | KR 2016 | DF-QuAD definition, properties | **VERIFIED** (PDF fetched) |
| Baroni, Romano, Toni, Aurisicchio, Bertanza. Automatic evaluation of design alternatives with quantitative argumentation. *Argument & Computation* 2015. | Journal | QuAD / QBAF roots | **VERIFIED** (cited consistently across ArgRAG + DF-QuAD papers) |
| Potyka. Continuous dynamical systems for weighted bipolar argumentation. KR 2018. | KR 2018 | Quadratic Energy semantics | **VERIFIED** (via ArgRAG + multiple secondary cites) |
| Amgoud & Ben-Naim. Evaluation of arguments in weighted bipolar graphs. ECSQARU 2017. | ECSQARU | Euler / weighted gradual | **VERIFIED** (secondary + ArgRAG) |
| Yin, Potyka, Rago, Kampik, Toni. *Contestability in Quantitative Argumentation*. arXiv:2507.11323, 2025; KR 2026 EW-QBAF form. | arXiv / KR 2026 | Edge weights, G-RAE, contestability | **VERIFIED** (arXiv abstract page) |
| Al Anaissy, Delobelle, Vesic, Yun. *Impact Measures for Gradual Argumentation Semantics*. arXiv:2407.08302; AAMAS 2025. | AAMAS 2025 | Impact / Shapley impact | **VERIFIED** (arXiv + AAMAS accepted list) |
| Libman, Oren, Yun. *Bases for Weighted Gradual Semantics and Inverse Problems in Argumentation Theory*. JAIR 2026. | JAIR | Inverse / weighted gradual bases | **VERIFIED** (JAIR page + Aberdeen record) |
| Zhu et al. *ArgRAG: Explainable Retrieval Augmented Generation using Quantitative Bipolar Argumentation*. arXiv:2508.20131, 2025. | arXiv | LLM structures QBAF; deterministic gradual scoring; contest base/polarity; **uniform β=0.5 defect** | **VERIFIED** (HTML full text) |
| Freedman et al. Argumentative large language models… AAAI 2025 / arXiv:2405.02079. | AAAI 2025 | ArgLLMs, contestability guarantees | **VERIFIED** (via ArgRAG related work + arXiv id) |
| Sanayei et al. *Can LLMs Judge Debates?…* EMNLP Findings 2025 / arXiv:2509.15739. | EMNLP Findings 2025 | LLMs vs QuAD gold rankings | **VERIFIED** (arXiv HTML) |
| Wang & Shen. *Bilateral Gradual Semantics for Weighted Argumentation*. AAAI 2024. | AAAI 2024 | Newer gradual family | **VERIFIED** (AAAI open proceedings page) |
| Rapberger et al. *On Gradual Semantics for Assumption-Based Argumentation*. KR 2025 / arXiv:2507.10076. | KR 2025 | Gradual ABA | **VERIFIED** (arXiv + KR proceedings) |
| Thieyre et al. Uncertainty in quantitative bipolar argumentation frameworks. ECAI-line 2025 (HAL). | ECAI 2025 area | Imprecise QBAFs | **PARTIALLY VERIFIED** (HAL metadata + PDF link; full PDF blocked by bot wall in this session) |
| Belief Function Propagation in Quantitative Bipolar… KR 2026 listing. | KR 2026 | Uncertainty propagation | **PARTIALLY VERIFIED** (proceedings program page only; full paper not fully read) |
| Edwards & Barron. SMARTS and SMARTER. *Organizational Behavior and Human Decision Processes*, 1994. | OBHDP 1994 | SMARTER / rank weights | **VERIFIED** (standard citation; PDF mirrors widely indexed) |
| Barron & Barrett. Decision quality using ranked attribute weights. *Management Science* 1996. | Mgmt Sci 1996 | ROC efficacy | **VERIFIED** (standard citation) |
| Rezaei. Best-worst multi-criteria decision-making method. *Omega* 2015. | Omega 2015 | BWM | **VERIFIED** (publisher/IDEAS records) |
| Rezaei. Best-Worst Method: A decade of evolution… *Omega* 2026. | Omega 2026 | BWM survey | **VERIFIED** (ScienceDirect record) |
| Németh et al. Comparison of weighting methods used in multicriteria decision analysis… *Journal of Comparative Effectiveness Research* 2019. | JCER 2019 | AHP / swing / SMART / MACBETH / PAPRIKA comparison | **VERIFIED** (full page via Becaris) |
| Saaty. AHP foundations (1977/1980 classic). | Books / journals | Pairwise + CR | **VERIFIED** as classic (secondary confirmations for CR≤0.1 practice) |
| Bana e Costa & Vansnick / M-MACBETH materials. | LSE working papers + product site | MACBETH pairwise qualitative | **VERIFIED** (overview PDFs + m-macbeth.com materials) |
| Clemen & Reilly. *Making Hard Decisions* (textbook tradition). | Textbook | Tornado / one-way sensitivity | **VERIFIED** as standard DA practice (secondary syllabi + chapter cites); edition-specific page not re-fetched |
| Potyka & Booth. Balancing open-mindedness and conservativeness… KR 2024. | KR 2024 | DF-QuAD conservativeness property | **VERIFIED** (via ArgRAG citation chain) |

No citation above was invented. Where full text was inaccessible, status is **PARTIAL** and claims are limited to what metadata/abstracts support.

---

# (g) SPECULATION register

Everything below is **SPECULATION** (design judgment or incomplete evidence), not established fact:

1. **SPECULATION:** Sibling redundancy via embeddings will be “good enough” for v1 without human merge UI — may fail on adversarial paraphrase and on multi-claim passages (ArgRAG itself notes multi-argument chunks as future work).
2. **SPECULATION:** SMARTER ROC will be accepted by strangers without explaining why weights are 0.61/0.28/0.11 rather than 3/2/1 — may need a plain-language “rank only; we convert fairly” microcopy.
3. **SPECULATION:** Restricting edge weights to the value layer (not epistemic edges) is the cleanest UX story; some EW-QBAF deployments may intentionally blend preference into edges — product should still *label* them value if so.
4. **SPECULATION:** Interval/imprecise QBAFs will eventually beat hard abstention for partial evidence, but v1 should ship hard typed abstention first (simpler stranger story).
5. **SPECULATION:** Shapley impact (Al Anaissy et al.) is overkill for interactive UI at map sizes >50 nodes; leave-one-out tornado on top-k by |Δσ| is enough.
6. **SPECULATION:** Org dual-profile display (Safety Officer vs CFO) will prevent more political failure than any single “company default weight vector.”
7. **SPECULATION:** ArgRAG’s finding that retriever scores as β underperform uniform 0.5 argues against naive IR-score→β mapping — but **neither** solves fabricated confidence; judged evidence pipelines must supply β or abstain.
8. **SPECULATION:** For this engine’s Proposal B path, “LLM proposes, scorer disposes, provenance always on” will remain the only socially defensible pattern when answers face strangers.

---

## Lens summary (what this seat optimizes for)

| Priority | Stance |
|----------|--------|
| Freshest lit | EW-QBAF contestability, impact/Shapley measures, ArgRAG/ArgLLM QBAF+LLM split, imprecise QBAFs, bilateral gradual, JAIR 2026 inverse problems |
| Kill defect | No silent 0.5; ArgRAG uniform init called out as anti-pattern for *served* answers |
| MCDA | SMARTER default → swing opt-in → BWM for multi-criteria policy; AHP/MACBETH workshop-only |
| UX | VALUE-DECIDED badge, because-you line, tornado, sliders, counterfactual flip line; epistemic vs value numbers never fused without legend |

End of artifact. Ready for cross-review (R2) without further edits from this seat.
