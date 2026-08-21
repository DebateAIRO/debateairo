# Weighting design for the argument-graph reasoning engine — merged requirements report

Mission WEIGHT-RESEARCH-R1 · R3 merge · 2026-08-03
Orchestrator: Fable 5 (Claude-Router). Research seats: Opus 5 (formal semantics),
Codex GPT-5.6-Sol (computability/spec-precision), Grok 4.5 (freshest literature +
MCDA/UX). Every seat's packet was adversarially cross-reviewed by the other two;
all three packets received LENS CHANGES REQUESTED, and this merge applies those
corrections. Provenance: [OPUS]/[CODEX]/[GROK] = research packet;
[R-OPUS]/[R-CODEX]/[R-GROK] = review lens. Full artifacts under `research/` and
`reviews/` in this mission directory.

**Reading note on trust levels.** Everything below is one of:
LAW (all three seats converged independently — the strongest signal this mission
produced), RESOLVED (seats disagreed; the review round settled it against primary
literature), OPEN (genuinely the owner's call — see §d), or SPECULATION (marked
inline). Citations carry the verification status of the strongest check performed
across the six artifacts; the reviews verified ~20 citations against primary
PDFs/DOIs and found **no invented citation in any packet**.

---

## 0. Ground truth the merge is built on

### 0.1 The exact semantics (pinned against four primary sources)

DF-QuAD (Rago, Toni, Aurisicchio, Baroni, KR 2016 — primary PDF verified
[R-OPUS §0]):

```
aggregation:  F(∅) = 0;  F(x1..xk) = 1 − ∏i (1 − xi)
combination:  c(v0, va, vs) = v0 − v0·|vs − va|        if va ≥ vs
              c(v0, va, vs) = v0 + (1 − v0)·|vs − va|  if va < vs
```

The combination is affine in |vs − va| and **never divides**. One research seat's
worked example used a spurious `/(1 − φ⁻)` divisor, which inflated the headline
number from the correct **0.6775 to 0.944** and inverted its sensitivity ranking
(the on-call attacker, not the load-test cluster, is the longest tornado bar)
[R-OPUS G-1, G-3; R-CODEX 9]. The corrected arithmetic is used everywhere below.
Lesson worth keeping: *the semantics is easy to misremember plausibly; property
tests against the primary formula are mandatory, not optional.*

### 0.2 Two property facts that drive the whole design

- **Zero is the exact "contributes nothing".** F(x ∪ {0}) = F(x), and
  c(v0, 0, 0) = v0. "An unjudged node contributes nothing" has an *exact*
  encoding — strength 0 on the edge, or edge omission. No epsilon, no
  approximation [OPUS THM-1; verified R-CODEX].
- **But τ = 0 is NOT sufficient on a non-leaf.** If an abstaining node has judged
  supporters, c(0, va, vs) = vs − va > 0: its own children resurrect it and it
  contributes again. The only encoding that is zero-contribution for **all graph
  shapes** is suppression of the node's *outgoing edges* (w = 0 on the weighted
  path; edge omission on the pure path) [OPUS THM-3; attacked and confirmed by
  R-CODEX: "tried to resurrect an unjudged non-leaf under edge suppression — it
  cannot affect its parent"]. **This is the load-bearing formal result of the
  mission.**
- **DF-QuAD is not open-minded.** Potyka & Booth (KR 2024, primary PDF verified
  [R-OPUS]): DF-QuAD satisfies *relative* conservativeness but **not** absolute
  conservativeness and **not open-mindedness** — no amount of accumulated
  evidence can fully argue away a base score. Consequence: an unprovenanced
  prior is *permanent*, which upgrades "no silent defaults" from hygiene to a
  hard correctness requirement. **Neither original packet stated this; the
  review round surfaced it** [R-OPUS G-5, X-7].

### 0.3 Where the named defect lives in this repo, exactly

[OPUS, CODE-verified] The fabricated-confidence defect is precisely localized:

- `coordinator/app/qbaf/model.py:30-31` — `base_score: float = 0.5` and
  `final_strength: float = 0.5` as dataclass defaults;
- `coordinator/app/qbaf/debate_adapter.py:20` — `DEFAULT_TAU = 0.5`;
- `debate_adapter.py:92` — `_tau_for` returns `(DEFAULT_TAU, "default")` for any
  node whose judge payload lacks a numeric strength;
- `debate_adapter.py:303-327` — that node **still gets a live edge** (polarity
  comes from PRO/CON node type, not from judgment status).

So: a PRO/CON claim node with no judge strength gets τ = 0.5 *and* an edge.
Evidence nodes already do the right thing (`_evidence_verdict_tau` returns
no-edge for anything but supported/contradicted) — the correct pattern exists in
the codebase for one node class and is missing for the other.

Also structural: **the production path builds the unweighted `ArgumentGraph`**
(`debate_adapter.py:331`) while `semantics.py:52` supports edge weights. Typed
abstention as w = 0 and edge-relevance weights are expressible only on the
weighted path; on the production path abstention must be edge omission. The two
paths currently have different expressive power (owner decision Q9 in §d).

Magnitude: a single silently-defaulted node can move its parent by up to 0.5
(half the scale) in the worst case, and by 0.10 in the realistic worked example
below [OPUS THM-2, E1].

---

## a. Structural (epistemic) weights — factor-by-factor options and the minimal set

### a.0 The four legal insertion points (the architecture, LAW-adjacent)

The decisive question is not *which factors* but *where each factor may write*
[OPUS a.0, endorsed R-GROK]. Four slots, and conflating them is the root cause of
most failure modes:

| Slot | Semantic meaning | Legitimate occupants |
|---|---|---|
| **τ (base score)** | The node in isolation: how credible before anyone argues | provenance-keyed judged quality (via the τ table); corroboration IF the collapse strategy is chosen |
| **w (edge weight)** | The relation: how much this node bears on this parent | relevance/entailment ladder; **abstention (w = 0)** |
| **adjustment** (pre-aggregation, Amgoud–David slot) | The sibling group: "these three say the same thing" | semantic redundancy — nothing else |
| **explanation layer** | Outputs of the semantics | centrality, flip-sensitivity, attribution, scrutiny counters |

The adjustment slot is the literature's principled home for similarity handling:
Amgoud & David, AAAI 2021 (adjustment ∘ aggregation ∘ influence; primary page
verified) — the engine's `dfquad.py` currently has no such slot, so every
duplicate-discount hack would otherwise end up mutating τ, a category error that
leaks into the provenance display [OPUS SPEC-A; R-GROK recommends exactly this
merge: "Codex computation inside an Amgoud–David adjustment slot"].

### a.1 Factor table (merged; corrections applied)

| Factor | What it measures | How computed from graph+evidence | Failure modes | Cost | Verdict |
|---|---|---|---|---|---|
| **Typed abstention / hard judged gate** | Admissibility, not strength | Codex gate: edge input `x(i→p) = relevance·σ(i)` iff node AND relation are Judged, else `ABSENT` (not numeric 0); gate sits **before** clustering, corroboration, aggregation, so nothing downstream can synthesize a 0.5. Non-leaf abstention = outgoing-edge suppression [OPUS THM-3]. Abstention metadata propagates separately and stays visible. | Coercing absent to 0 hides missingness; judged-0 and ABSENT are score-equivalent under F (distinguishable only in the ledger — say so) [R-OPUS C-7]; silent omission must still render in the answer | O(1)/edge | **IN — Tier 0. LAW** (all three seats independently) |
| **Judged base via versioned τ table** | Node credibility as *reviewable policy*, not generation | τ = lookup keyed by categorical judge output `(provenance_type, verification_status, source_class, corroboration_bucket)`; judge emits keys, never floats; every τ carries `tau_source = table@vN,row=…`; missing row ⇒ no edge; **`tau_source == "default"` is an illegal state that fails the build** [OPUS SPEC-C]. Precedent: GRADE's ordinal evidence ladder (BMJ 2008). | **The table is human-owned policy, not graph-computed — must be declared as such** with schema, conflict/absence rules, calibration path [R-CODEX 2]. LLM-emitted floats are miscalibrated (concentrated high; RLHF worsens it — arXiv:2410.09724) | Low | **IN — Tier 0** (as policy artifact) |
| **Interval judgments** | Imprecise (as opposed to absent) judgment | Sound enclosure: lower base/support + upper attack → lower bound; converse for upper. Two linear passes. Motivated by Oren & Yun (arXiv:2502.07452 → AAMAS 2026): users struggle with exact initial weights and confuse initial with final acceptability. | Enclosure is sound but **loose on a DAG** (dependency problem — over-wide bars) [R-OPUS C-5]; intervals ≠ abstention: *imprecise* vs *absent* are different states, both first-class [R-OPUS X-6] | 2 passes | **IN — Tier 1** (as the imprecision state) |
| **Provenance type** (cited/measured/derived) | The epistemic route | **Validator router**: type selects the validation procedure (cited → source+entailment record; measured → run/procedure/repeatability; derived → premises+rule+trace). No fixed `measured > cited > derived` multipliers — an uncalibrated ordinal hierarchy is fabricated confidence. Type may key the τ table only as reviewable versioned policy [RESOLVED for CODEX's position, R-OPUS X-2, R-GROK X-3] | A bad measurement is worse than a good citation; type mislabeling; relabeling attacks | O(1) route; validation domain-dependent | **IN — Tier 0** (as router) |
| **Corroboration across independent families** | Same conclusion via routes that could have disagreed | **F already is the corroboration operator**: 1−∏(1−xi) is maximal-independence accrual, so a separate "independence bonus" double-counts [OPUS THM-5; RESOLVED — R-OPUS G-6/X-3, R-GROK X-4 concur]. Accrual happens by keeping genuinely independent families as separate inputs to F. Independence = documented distinct generation lineage over a provenance DAG (W3C PROV vocabulary), never distinct URLs. **Lineage families must be scoped across the whole (parent, polarity) sibling set, not inside redundancy clusters** — otherwise two *different* claims from the *same* run still accrue freely [R-OPUS C-1, accepted fix] | Citation laundering; circular corroboration (lineage cycles ⇒ `INVALID_LINEAGE_CYCLE`); laundering through inserted intermediate nodes — enforce duplicate budgets across the ancestor cone and test that identity-intermediate insertion cannot raise root strength [R-CODEX 7] | Union-find over lineage components, near-linear | **IN — Tier 1** (family collapse only; **no bonus — MUST NOT**) |
| **Semantic redundancy between siblings** | Near-duplicates must share weight, not double it | Merged pipeline: exact canonical-proposition hash → frozen-embedding candidates with symbolic guards (entities, quantities, negation, time scope) → deterministic complete-link clustering with stable tie-breaks → **per lineage family take max** → independent families accrue via F [CODEX]. Lives in the adjustment slot [OPUS]. **Similarity over evidence lineage, text only as prefilter** — text similarity punishes genuine independent corroboration (worked example: −7 points on one root) [OPUS F4] | Adversarial paraphrase under threshold; threshold cliffs; merging transfers an attack aimed at one nuance to the whole cluster (Amgoud et al. KR 2018 warning); O(k²) pairs (1,225 at k=50) needs a call budget + fallback [R-CODEX 4, 10]; **declare the forfeited principles**: the quotient construction deliberately breaks strict monotonicity/counting — property tests must encode the *intended* principle set, not the published one [R-OPUS C-3] | Embeddings O(k²·d); clustering up to O(k³) naive — bound it | **IN — Tier 1** (the highest-value fix after abstention) |
| **Counter-node presence & strength** | Opposition | **Already the semantics** — DF-QuAD's va term. A separate presence penalty or counter count double-counts [LAW — all three]. Residue worth shipping: **scrutiny counter pair** `(challenges raised, challenges resolved)` — counts, never a float — because DF-QuAD structurally cannot distinguish "unchallenged 0.8" from "challenged-and-vindicated 0.8" [OPUS THM-9, confirmed R-GROK]; unjudged counters render as `COUNTER_UNJUDGED` and may block serving under the skeptic policy (owner decision) [CODEX] | Attack spam via duplicates (handled by redundancy pass); hiding unjudged attacks makes answers look settled | Free | **OUT as weight; scrutiny channel IN — Tier 1** |
| **Node centrality** | Structural position | Compute only for audit/review-prioritization. Never an input: feeding outputs back as weights breaks directionality and monotonicity — strengthening a supporter could then *lower* its parent [OPUS THM-8; LAW]. PageRank-as-semantics fails required properties (Albini et al. COMMA 2020) | Claim-splitting inflates centrality; double-counts position | O(V+E) | **OUT as input; explanation only** |
| **Flip-sensitivity / impact** | How much the answer depends on this node | Removal impact `I_i = σ_r(Q) − σ_r(Q\i)` with **full preprocessing recompute**; flip flag vs threshold θ. Gradients: one reverse pass O(V+E), but the general spec must give piecewise Jacobians per polarity (supporter vs attacker products differ), sum over **all** DAG paths, and fall back to exact perturbation at the kink va = vs and at cluster-reorder boundaries [R-CODEX 6 correction to OPUS]. Blast radius of an edit = **the induced successor subgraph** (fan-out + reconvergence), not "the path to the root" [R-CODEX 5 correction]. Literature: G-RAEs (Yin et al. arXiv:2507.11323), attribution (Yin/Potyka/Toni ECAI 2023), impact incl. Shapley (Al Anaissy et al. AAMAS 2025 — exact Shapley exponential, use sampled or leave-one-out top-k) | Reflexivity if fed back; near-θ thrash; saturation masks importance | Gradient pass cheap; exact all-node removal O(V·(V+E+P)) | **IN as output — Tier 1 (display + hinge detection); NEVER input** |
| **Edge relevance** | Given the child, how much does it bear on this parent | Small ordinal ladder (`direct/partial/tangential` → table-sourced values), reusing the existing entailment call; `NOINFO → no edge` already correct in repo evidence path. This is the published EW-QBAF construction (Yin et al., Def. 1: w: R→[0,1], inputs σ·w — closed at 0, and w=0 is exactly the switch-off case) [R-OPUS C-8, G-9] | A free per-edge float is a second home for fabricated confidence — keep it ordinal + table-sourced | Reuses entailment | **IN — Tier 2** (blocked on the weighted-path decision, §d Q9) |
| **Raw fan-in count / volume** | Number of children | — | Pile-on + duplicate spam wins | — | **MUST NOT** |
| **Silent default on unjudged** | "We don't know so 0.5" | — | The named defect; permanent under non-open-mindedness (§0.2) | — | **MUST NOT — illegal state** |
| **LLM free-form confidence floats** | — | — | Fluent, unfalsifiable, miscalibrated; the defect wearing a lab coat | — | **MUST NOT** |

### a.2 Recommended minimal set (merged)

**Tier 0 — without these the core product promise is false. Both are *removals*;
the fix is cheaper than the defect.**
1. Typed abstention as outgoing-edge suppression, with the Codex hard gate
   placed before all preprocessing, and abstention types propagating as visible
   metadata (taxonomy: not_attempted / pending / unavailable / no_info / refused
   / contested_unresolved / retracted — SPECULATION, no literature precedent
   found for typed propagating abstention; nearest is fuzzy labelling's
   undecidability degree, Wang & Shen JLC).
2. The versioned τ table as a declared, human-owned, PR-reviewed policy artifact;
   `tau_source == "default"` fails the build.

**Tier 1 — without these the numbers are wrong in a predictable direction (too
high).**
3. Sibling redundancy: cluster → lineage-family max → F over independent
   families, in an adjustment slot; lineage scoped across the full sibling set.
4. Interval judgments as the *imprecise* state (distinct from abstention).
5. Flip-sensitivity + scrutiny counts as explanation channel.

**Tier 2.** 6. Ordinal edge-relevance weights, once the weighted path is
canonical.

**Explicitly OUT:** corroboration bonus (double-counts F), counter presence
penalty (double-counts va), centrality as input (breaks the principle set), any
silent default, any free confidence float.

### a.3 The two worked lessons every implementer should read

**Lesson 1 — the two defects cancel, so eyeballing outputs validates nothing.**
[OPUS E1, arithmetic verified by R-CODEX] On a realistic 6-node map ("ship the
caching layer"), today's behavior (unjudged attacker silently gets τ=0.5 + live
edge; two same-origin vendor claims double-count) serves σ(R)=0.5066. Fixing
abstention alone: 0.6066 (+0.10 — one unjudged node was costing ten points).
Fixing abstention + redundancy: 0.5378. The fabricated default (+0.10) and the
duplicate double-count (−0.07) have **opposite signs and nearly cancel** —
today's number is within 0.03 of correct *by accident*. Only per-factor property
tests ("does an unjudged node move any parent?", "do two copies of one source
aggregate like one?") can catch this class.

**Lesson 2 — the τ table can silently answer a values question.** [OPUS E2,
verified R-CODEX] Retention-policy hinge, four measured leaves, zero
abstentions: σ(P30)=0.51 vs σ(P400)=0.49. The entire margin is τ_cost=0.90
sitting 0.02 above τ_safety=0.88 in the τ table — a difference in *how well each
fact was established* deciding *which goal matters more*. A second species of
fabricated confidence: the provenance is real, the **authority is borrowed**.
This is why hinge detection (§c) is a correctness feature, not UX polish.

---

## b. Value-weight elicitation flows, ranked by user burden

Two constraints bind every flow [LAW]: (1) swing weights are range-dependent
(von Winterfeldt & Edwards 1986) — stored magnitudes are meaningless without the
ranges they were elicited against, so profiles may persist *rankings*, never
magnitudes; (2) direct numeric elicitation is the most bias-prone method — so
the user never types a float; numbers come from published formulas applied to
ordinal input, with the method as provenance.

**Flow 1 — Hinge-gated minimal elicitation (default; burden 0–1 questions).**
Score structurally with no value input. Compute the admissible weight region W
and per-pair robust margins `min_{w∈W} Σ w_j·(u_j(x_aj) − u_j(x_bj))` (a small
LP under linear constraints) [CODEX]. If the winner is invariant across W, **ask
nothing and say so** — "this conclusion does not depend on how you weight cost
against safety" is itself a deliverable. Only if the winner varies, ask the
single range-anchored ordinal question that separates the branches ("Storage
cost swings $4.1k→$53k/mo; incident reconstructability swings 61%→96%. Which
swing would you rather have?"). In the worked retention example, the ranking
alone fully determines the winner, so one question suffices [OPUS E2].
*Weight-stability grounding: O'Shea et al., ESWA 2025/26.*

**Flow 2 — SMARTER / rank-order centroid (burden: one sort).** User ranks the
criterion *swings* (never abstract "importance"); weights come from ROC:
`w_j = (1/m)·Σ_{k=j..m} 1/k` (k=2 → 0.75/0.25; k=3 → 0.611/0.278/0.111)
(Edwards & Barron, OBHDP 1994; Barron & Barrett, Mgmt Sci 1996 — both DOI-
verified). Derived weights are labeled `method: SMARTER/ROC`, never "user said
75%". One consequence-replay confirmation ("with these weights, X wins because
…") — learning loops help but are cognitively demanding, so exactly one
(Aubert, Schmid & Lienert, EJOR 2024). All three seats independently made this
the elicitation default [LAW].

**Flow 3 — Swing weighting / SMARTS (burden: ranking + m−1 point judgments).**
For stakes that justify minutes: rank swings, assign 100 to the most valued
swing, rate others relative, normalize. More expressive; anchoring and
range-mis-framing risks; show a sensitivity band, forbid accidental zeros.

**Conditional / rejected.**
- **Named audiences** (Bench-Capon VAF orderings: "safety-first") are a
  *no-elicitation product fallback*, not an MCDA method — a pre-authored
  ordering the reader adopts by label. Legitimate, but ranked separately, and
  **there is no default audience** (a default ordering is fabricated confidence
  in the value dimension) [OPUS Flow 0; reclassified per R-GROK 3].
- **AHP** — not a default. Rank reversal on a growing option set (Belton & Gear,
  Omega 1983; Dyer, Mgmt Sci 1990) is the value-layer analogue of the named
  defect ("the answer changed because we found one more option, not one more
  fact"). Admissible only facilitated, with a frozen alternative set and
  consistency ratio enforced (CI=(λmax−n)/(n−1), CR=CI/RI ≤ 0.1); pairwise
  elicitation is also measurably more effortful (Aloysius et al., EJOR 2006)
  [RESOLVED — R-GROK X-5].
- **MACBETH** — qualitative pairwise differences; facilitated workshops only.

Always persist: who, method+version, scope, ranges shown, raw answers, derived
weights, timestamp, revisions. Group settings: keep stakeholder profiles
separate and show disagreement; never average without a recorded governance rule
(Haag, Aubert & Lienert, ValueDecisions, EMS 2022).

---

## c. How the value overlay sits on the evidence-scored graph

The seats split (graph-native edge reweighting [OPUS] vs separate MAUT overlay
[CODEX]) and both reviews of the split reached the same synthesis [R-OPUS X-5,
R-GROK contradiction 1], adopted here:

**Contract: Codex's separation. Attachment: Opus's graph-native hinge marking.
Mechanism: MAUT at the hinge. Rejected: ROC weights as DF-QuAD edge multipliers**
(an MCDA category error — ROC weights are criterion weights for additive
evaluation, not edge-admission strengths; the seat itself rated it its weakest
link) [R-GROK blocker 1].

### c.1 Layer contract

```
Evidence layer (DF-QuAD, pure):     never touched by values. Values never write τ,
                                    never write strengths, never fill abstentions.
EvidenceResult(option, criterion) = Judged{consequence, provenance} | Abstained{type}
ValueProfile = { owner, scope, per-criterion direction, worst/best range,
                 value function u_j, weights w_j or region W, vetoes,
                 method, timestamp }          ← ALL of this is value-owned:
                 mapping cost-in-dollars to 0..1 desirability is already a value
                 judgment, as is the direction of "better".
Overlay result = option scores/intervals + robust margin + VALUE-DECIDED marker
                 + ledger. VALUE_UNSET when no authorized profile exists —
                 never equal weights.
```

### c.2 Hinge detection (corrected definition)

A value hinge is **not** defined by local node balance. The test is
preference-sensitivity of the *option ranking*: after the unjudged gate, check
Pareto dominance on the option-by-criterion outcome vectors; if no option
dominates and the preferred option varies over the admissible weight region W,
the decision is value-decided [R-CODEX blocker 1 — two options can each hold
*decisive* evidence on different criteria with no balanced node anywhere].
Local `|vs − va| ≤ ε` at a contested node, with divergent value tags on the
dominant supporter/attacker, is a cheap *heuristic trigger* for running the
test — useful because it falls out of the same reverse pass as flip-sensitivity
(the DF-QuAD kink is where the gradient is discontinuous) [OPUS c.2].

Guard I4 [OPUS, endorsed by both reviews]: **a hinge is never created by
abstention.** If the branches are close because half the children abstained,
that is an *evidence gap* ("we don't know yet"), not a value hinge ("this
depends on your priorities"). Identical numbers, opposite meanings; gate hinge
detection on zero abstentions in the contending subtrees and name the state.

Value tags come from a small closed vocabulary (≈6–10: cost, latency, safety,
privacy, reversibility, effort, fairness, speed-to-market) [SPECULATION — open
vocabularies make hinges undetectable].

### c.3 What is computed and what a stranger sees

At a hinge, the engine serves a **branch set, not a number**: per admissible
ordering/weight region, the winning option and its score; the flip condition
(break-even weight, e.g. "winner changes when the cost weight crosses 4/9 ≈
0.444" [CODEX E2]); and the robust margin when it exists ("robust over your
stated value range" — which is *stronger* than value-free and should be said).

Blast radius: value reweighting at a hinge can only change the hinge and its
transitive successors (DF-QuAD directionality) — every non-successor node is
bit-identical across branches, which is a cheap invariant test that catches
overlay leakage into the evidence layer [OPUS THM-7, scope corrected to the full
successor subgraph by R-CODEX 5].

Display contract (proposed, marked SPECULATION as a standard; grounded in
preference-sensitive decision-aid practice — IPDAS balanced-options +
values-clarification — and MCDA DSS practice):

```
VALUE-DECIDED                       ← badge; never on evidence-decided answers
Owner/scope: <who; for what decision>
Method: <SMARTER/ROC | swing | audience-label>, version, timestamp
Because-you line: "Because you ranked Safety above Cost (2026-08-03, profile: You)"
Break-even: "flips to CheapCloud below w_cost = 0.44"
Branch table: one row per admissible ordering
Evidence beside values: raw criterion outcomes with evidence provenance,
                        shown separately from w_j·u_j contributions
Counterfactual: "had you ranked cost first, this would read 30-day retention"
value_source: unset ⇒ NO scalar is served; branch set only
Abstentions: VALUE_UNSET | EVIDENCE_UNJUDGED | VALUE_MODEL_UNSET — never one
             generic "uncertain"
```

Contest actions are typed: contest a base score / contest a polarity / contest
an edge weight (epistemic) vs. change a ranking or weight (value) — different
buttons, different provenance (ArgRAG contest surface; G-RAE sensitivities).

---

## d. Open decisions the owner must still make (sharp questions)

Consolidated to the questions that **survived cross-review as genuinely open** —
where the seats disagreed and the literature does not settle it, or where only a
policy owner can answer. Everything the review round *resolved* is stated above
as RESOLVED/LAW and is not re-asked here.

1. **Corroboration: τ-bucket or sibling multiplicity — pick exactly one.** Both
   is provably double-counting (F is already the accrual operator), and the
   codebase currently implies both (`SourceRecord.corroboration_count` says
   bucket; graph shape says multiplicity). The failure inflates exactly the
   well-evidenced claims you most want right, invisibly. Which one, and who
   migrates the other out?

2. **What may a non-leaf/root base score be derived from?** Three positions
   survived: (a) judged base with a declared premise set **disjoint from the
   node's descendants' evidence** (else `BASE_OVERLAPS_SUBTREE` → abstain — the
   same evidence must not enter via τ and via F); (b) β=0 with a written
   "decomposition nodes are child-determined" rule; (c) typed abstention when no
   judged base exists. Under non-open-mindedness the base never washes out, so
   this choice is permanent per answer. Which rule, and does it differ for
   decision nodes vs claim nodes?

3. **Who owns the τ table, and what is its change control?** It is a policy
   document ("a vendor blog is 0.45; a preregistered replication is 0.85").
   Recommended: versioned-and-pinned per answer (answers cite the table version
   they were scored under). Who reviews edits, and are old served answers
   re-scored or frozen?

4. **What is ε — and more generally, when does the engine say "evidence didn't
   decide"?** Too small: the τ table silently resolves values questions (Lesson
   2 — a 0.01 τ difference decided cost-vs-safety with a clean audit trail).
   Too large: the product asks value questions about settled facts. Candidate:
   ε = one τ-table notch ("one plausible re-grading would flip it"). Who sets
   it, and is it global or per-domain?

5. **API shape at an unresolved hinge.** A branch set with no scalar is correct
   and breaks every consumer expecting one float; scalar-plus-flag is compatible
   and is a lie the moment anyone ignores the flag. This is a schema/caching/
   ranking decision that is far cheaper before v1 consumers exist. Which one?

6. **Points, intervals, abstention — which states ship at v1?** They are three
   different states (judged-precise / judged-imprecise / absent), not competing
   designs. Does v1 ship intervals (sound but loose on DAGs — over-wide bars are
   a UX cost), or hard abstention only, with intervals later?

7. **Is `retracted` an abstention or an attack?** Retraction is positive
   information that support was withdrawn; propagating it as 0 makes a debunked
   claim and an unexamined one look identical. Silence, or attack semantics?

8. **May provenance type ever touch the number?** Standing rule: router only.
   Exception path: a type-conditioned multiplier is admissible **iff** a
   versioned out-of-sample calibration artifact with error bars ships with it.
   Does the owner want that path to exist at all?

9. **Which propagation path is canonical?** Production builds the unweighted
   `ArgumentGraph` (`debate_adapter.py:331`); the weighted path exists beside
   it. Abstention-as-edge-omission on one and w=0 on the other **will** disagree
   on some graph eventually. Unify on the weighted path, or freeze the pure path
   and express everything as edge omission?

10. **Does an unjudged counter block serving?** It contributes nothing
    numerically and renders as `COUNTER_UNJUDGED`. Under a skeptic policy, does
    its existence block the answer, degrade it to a caveat, or neither? Who
    certifies "no material unaddressed attack"?

11. **Whose values, in multi-user settings — and what persists?** Single owner,
    role profiles, or compulsory dual display under conflict? Rankings may
    persist; magnitudes may not (range-dependence). What is the expiry/
    re-elicitation rule when the option set changes?

12. **When exactly is an answer labeled VALUE-DECIDED?** Whenever alternatives
    trade off at all; only when the winner flips within the approved weight
    region; or only when Pareto dominance fails? (These give different badge
    frequencies, and badge fatigue is real.) And: is "robust over your stated
    value range" a third, distinct label?

13. **Are cycles ever in scope?** Mutual rebuttal is not representable under
    DF-QuAD (repo raises `CyclicGraphError`). If it ever will be, migrate
    semantics **before** the τ table/abstention/hinge machinery hardens; the
    weights survive the migration, the topological-order assumptions do not.

---

## Appendix A — Triple-blind convergence laws

Reached independently by all three seats before any cross-reading; the review
round proposed promoting them to product law [R-OPUS X-8]:

1. Unjudged ⇒ excluded from aggregation entirely — never 0.5, never any silent
   default; abstention is typed and visible.
2. Sibling near-duplicates share weight via a max-style rule, never sum.
3. Centrality and flip-sensitivity are explanation-only; they never re-enter the
   scorer (reflexivity breaks the principle set).
4. SMARTER/ROC is the lowest-burden elicitation default, escalating to swing;
   the user never types a float.
5. Value-decided hinges carry a visible marker plus a counterfactual/break-even
   line; epistemic and value numbers are never fused without a legend.

## Appendix B — Key corrections the cross-review forced (why the round paid for itself)

- A wrong-but-plausible DF-QuAD formula (spurious divisor) survived one seat's
  self-checks, inflated a served number by +0.27, and inverted its own
  sensitivity story. Caught only by recomputation against the primary text.
- The same seat used an unjudged 0.5 "neutral prior" *in the packet whose own
  factor table forbids it* — the defect reproduces itself even in the document
  banning it. (Both blockers fixed in this merge's arithmetic.)
- The strongest computational packet had its dedup hole one level up: lineage
  families scoped inside redundancy clusters let same-run *distinct* claims
  accrue freely. Fixed by scoping lineage across the sibling set.
- The strongest formal packet misused ROC weights as edge multipliers (category
  error) and defined hinges by local balance (not necessary for value-decidedness).
  Both replaced in §c.
- Neither original packet stated DF-QuAD's open-mindedness failure — the property
  most relevant to a system that must not let priors survive contrary evidence.
  Surfaced by a reviewer reading Potyka & Booth in primary.
- Citation audit across ~20 primary checks: no invented citations anywhere, but
  "VERIFIED via secondary chain" labels were downgraded — the one claim verified
  only through a citation chain was the one that misreported its source.

## Appendix C — Source register (merged; strongest verification across seats)

Primary-verified (PDF/DOI/proceedings read by at least one seat or reviewer):
Rago, Toni, Aurisicchio & Baroni, KR 2016 (DF-QuAD) · Rago & Toni, CEUR
Vol-1672 (DF-QuAD restatement) · Potyka & Booth, KR 2024 (conservativeness /
open-mindedness) · Yin, Potyka, Rago, Kampik & Toni, arXiv:2507.11323 (EW-QBAF,
G-RAEs) · Amgoud, Ben-Naim, Doder & Vesic, IJCAI 2017 (weighted h-categorizer —
attack-only) · Amgoud & David, AAAI 2021 (adjustment/aggregation/influence) ·
Amgoud et al., KR 2018 (similarity) · Zhu et al., arXiv:2508.20131 (ArgRAG;
uniform-0.5 anti-pattern) · Al Anaissy, Delobelle, Vesic & Yun, AAMAS 2025
(impact measures) · Yin, Potyka & Toni, ECAI 2023 (attribution) · Albini et al.,
COMMA 2020 (PageRank-as-semantics) · Rago et al., KR 2025 (incompleteness-
tolerant semantics) · Baroni, Rago & Toni, IJAR 2019 (principled spectrum) ·
Oren & Yun, arXiv:2502.07452 / AAMAS 2026 (interval elicitation) · Edwards &
Barron, OBHDP 1994 (SMARTS/SMARTER) · Barron & Barrett, Mgmt Sci 1996 (ROC) ·
Saaty, JMP 1977 (AHP) · Belton & Gear, Omega 1983 (rank reversal) · Aloysius et
al., EJOR 2006 (elicitation effort) · Aubert, Schmid & Lienert, EJOR 2024
(elicitation UX) · Haag, Aubert & Lienert, EMS 2022 (ValueDecisions) · W3C
PROV-O/PROV-DM 2013 · GRADE, BMJ 2008 · Reimers & Gurevych, EMNLP 2019
(Sentence-BERT) · Barakat et al., TaPP 2017 (corroboration via provenance).

Verified at metadata level (existence/venue confirmed; content used cautiously):
Potyka KR 2018 (QE) · Wang & Shen AAAI 2024 (bilateral) · Rapberger et al. KR
2025 (gradual ABA) · Libman, Oren & Yun JAIR 2026 (inverse problems) · Battaglia
et al. SUM 2024 (preferences in gradual argumentation) · Civit et al.
arXiv:2602.14674 (base-score extraction from preferences — mechanism noted,
insertion point rejected here) · Bench-Capon VAFs · Modgil AIJ 2009 (EAFs) ·
Amgoud, Doder & Lagasquie-Schiex JAIR 2026 (weighted higher-order) · von
Winterfeldt & Edwards 1986 (swing) · Bana e Costa & Vansnick (MACBETH) · O'Shea
et al. ESWA 2025/26 (weight stability) · Rezaei Omega 2015/2026 (BWM) · Thieyre
et al. 2025 (imprecise QBAFs) · arXiv:2410.09724 / 2604.01457 (LLM confidence
miscalibration).

Registered gaps: no literature found for typed *propagating* abstention as a
first-class status (nearest: fuzzy labelling's undecidability degree) or for
provenance-typed base-score elicitation in this specific form (nearest
precedent: GRADE). Both are this project's own contributions until falsified.

---
*End of merged report. Seat artifacts preserved verbatim under `research/` and
`reviews/`. Nothing in this mission is marked Done; this report awaits V's
acceptance (H9).*
