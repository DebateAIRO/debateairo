ACCEPTED — DR-067 (2026-08-05) — mission REQ-V3-GREENFIELD-R1

# Carryover manifest — the clean-room behavioral contract for V3's kept organs

Spec-pack artifact 2 of 4 (DR-001) · Mission REQ-V3-GREENFIELD-R1
Authoring ticket: `../wayfinder/issues/30-author-carryover-manifest.md`
Authority: `../wayfinder/decisions-ledger.md` (DR-001 … DR-064)
Status: draft; awaiting the orchestrator's grep-level final audit
(`../reviews/merge-verdict-delta.md` §Sequence to gate, step 3), then gate 31 and V acceptance.

**Revision 4** — the final cleanup rework. **`DR-062` ratified all 17 rows of this artifact's
register wholesale**, so every one of them is promoted into its organ section as normative text
and the register is closed. Also folded: the register-review rulings DR-057 … DR-061 and DR-063
(R9's two surfaces, the composition size law, degraded-mode projections and replay eviction,
conformance and ceremony scope, the ratified restatement schema, the fire bar); the enum now
cites the requirements spec's mapping table by reference rather than restating it; and §16's
stale entries are withdrawn with dated dispositions. **This manifest now contains zero open
decisions and zero candidate spans.**

---

## 1. How to read this document

**What this document is.** V3 is a new reasoning engine, built from scratch in a new
repository. It does not start from nothing: a handful of things the current engine (V2) does
are worth keeping — as **designs**, not as outputs to reproduce. This document is the list of
those things, written as a description of *behavior* — what goes in, what comes out, what
happens when it breaks — so that an engineer who has never seen V2's source can build each
one. Six such things are kept. They are called **organs**.

**V2 is a reference, and nothing more.** V ruled: *"nothing from V3 must match V2; starting
fresh, never look back at what was already debated; V2 serves as reference; V3 must be much
better"* (DR-033). V then retired the race entirely: *"we are not interested in competing with
V2 — it's not live, it's a prototype"* (DR-047). There is no formal race, no frozen victory
criteria, no control-arm ceremony and no V2 pin. Humans compare outputs informally, at will.
The fourth spec-pack artifact is now the **V3 Quality Charter**, not race criteria. Carryover
remains **clean-room** — no V2 code is copied, and every kept behavior is re-specified in
writing and reimplemented from that writing (DR-003).

**How to check that a claim here is real.** Sentences that describe what V2 does carry a
`file:line` citation into the frozen V2 engine. Paths are repo-relative to
`apps/dialectical-engine/`. **Every such citation documents where an idea was seen or where a
disease was diagnosed. None is a conformance target** (DR-033). Sentences that state what V3
must do carry an **authority tag** (§2.1) naming the ruling behind them. A normative sentence
with no tag is a defect in this document and should be raised at review.

**The vocabulary a stranger needs**, in one paragraph each:

- **Node.** One claim in the answer, with its own text, its own score, and its own record of
  where that score came from. An answer is a graph of these, not a blob of prose
  (`../wayfinder/GLOSSARY.md`).
- **Arrow (typed edge).** A stored relation between two nodes: this one *supports* that one,
  or this one *attacks* it, carrying a strength between 0 and 1 (DR-022 as narrowed by
  DR-035).
- **Defeater.** A node that, if true, sinks its parent claim — a first-class attack, not a
  footnote (`../wayfinder/GLOSSARY.md`).
- **τ (tau), "base score".** A node's own strength before any child touches it.
- **Strength.** A node's final number after its supporters have pushed it up and its attackers
  have pulled it down.
- **DF-QuAD.** The published arithmetic that does that pushing and pulling (Rago, Toni,
  Aurisicchio & Baroni, KR 2016), cited in V2 at `coordinator/app/qbaf/dfquad.py:1-28`.
- **Judge.** A model asked to grade one node's claim. A deterministic **reducer** then turns
  that grade into numbers by a published formula, so the same grade always yields the same
  numbers.
- **The battery.** V3's discipline for answering a question: 62 checks and 9 human laws,
  grouped into eleven stages — LOCK, ROUTE, AIM, HARVEST, RUN, SPLIT, WEIGH, CROSS, COMPOSE,
  SERVE, SETTLE (`../wayfinder/GLOSSARY.md`).
- **The defect register (D1–D5).** Five things V2 does that V3 must **not** do. Each is stated
  as a **property of V3 itself**, checkable without looking at V2 at all (§10, §12.2).
- **Literature vector.** A worked example published in the academic literature, with the right
  answer given by its authors. Two of them are V3's external ground truth for the scoring
  arithmetic — they are **not** V2 behavior and carry no contamination (§4.5).
- **Property test.** A test asserting that a rule holds for *every* input, rather than that one
  recorded input produces one recorded output. This is V3's primary self-check (§12.2).

**The stranger test governs this document too.** V's standing law, as amended by DR-018 and
ratified for R9 in DR-031, is that every node *and* the verdict must be individually restatable
by someone who knows nothing about the system. A reader who cannot restate a section of this
manifest in their own words has found a bug in the section, not in themselves.

---

## 2. Governing law, authority tags, and the order of authority

### 2.1 The authority tags

Every behavior paragraph in §§4–9 carries one of three tags. The tags exist because the pack
review found the previous draft deciding, in mandatory language, questions its own register
reserved for V (`../reviews/ReviewLens-Codex-pack.md` finding 4;
`../reviews/merge-verdict-pack.md` disposition A).

| Tag | Meaning | Who may change it |
|---|---|---|
| `RULED(DR-n)` | A V ruling decides this. The paragraph restates the ruling and cites it. | Only a new DR. |
| `CARRIED-DESIGN` | No ruling. A V2 design re-specified here because it works, or a property of the published mathematics. The **property** is what carries; ARCHITECTURE may choose a different mechanism that preserves it. | ARCHITECTURE, without a sitting, provided the stated property survives. |
| `CANDIDATE(OD-n)` | An **open decision**. Written entirely in conditional voice — "under option (a), the system would…" — with no modal obligation vocabulary (the `must` / `never` / `requires` / `prohibited` / `blocking` family) and **no interim mandate**. It proposes; it does not instruct. | V, at a register review. |

**The authority rule** (merge verdict disposition A): *no open decision may have a mandatory
answer anywhere in this document.* A reviewer finding a `CANDIDATE` span written as a
requirement, or carrying a pre-ruling "interim" that selects one option, has found a defect.

**As of `DR-062` this manifest contains no `CANDIDATE` spans and no open decisions.** All 17
rows of its register were ratified wholesale, promoted into §§4–9 as normative text, and closed
(§12.4). The tag and its grammar rule are retained because any future amendment that reopens a
question must use them. *Lint note for the final audit: the only occurrences of the forbidden
modal vocabulary anywhere near the word `CANDIDATE` are in the table row above, which defines the
prohibition, and in this paragraph. There are no candidate spans to scan.*

### 2.2 The order of authority

1. **The decisions ledger is the authority** (`../wayfinder/decisions-ledger.md`). Tickets are
   containers; DR rows are law. Where this manifest and a DR disagree, the DR wins and this
   manifest is wrong.
2. **Nothing from V3 must match V2** (DR-033). V2 output conformance is not a V3 requirement
   anywhere. Divergence is sanctioned. What is kept is kept as a **design**.
3. **The race is retired** (DR-047). No formal comparison, no frozen criteria, no control arm.
   V2 is informal reference only; DR-025 survives solely as the definition of what "the V2
   reference" means — **as-shipped production**, flags off, failed nodes included.
4. **Clean-room is a control, not a label** (DR-003, restated by DR-033). No V2 source is
   copied. The role split that makes it real is in §14.
5. **Requirements constrain behavior only** (DR-005) — *except* where V has imposed a stack
   constraint. DR-024 imposes the first one (Postgres, §13) and supersedes DR-005 in part.
6. **Everything executed is recorded** (DR-027). Cross-cutting: an organ that does work without
   leaving a record of having done it violates DR-027 wherever it lives.
7. **Nothing is served that cannot be recomputed** (DR-034). Cross-cutting; §8.3 states it in
   full.
8. **No judgement ⇒ no number** (DR-028). Cross-cutting: any organ that would otherwise emit a
   number it did not measure emits a typed, visible record instead.
9. **No invented measurements** (DR-039). A metric, label, threshold or rule enters the spec
   only with hard facts behind it. Nothing is adopted to manufacture confidence or "for the sake
   of measuring something". This constrains several open rows in §12.4 directly.
10. **The eight house rules stand as floors** (DR-029). Where a battery successor is stronger,
    the successor governs and the house rule remains the minimum. §11.
11. **Composition is settled and final** (DR-030 as ratified by DR-056a): one scoring engine,
    one graph, one serving truth, and the organ↔stage table below is no longer vetoable.

**Constants are drawn fresh.** V3's flag and configuration register is designed anew and ratified
by V before production (DR-023). Every numeric constant recorded in this manifest is **source
material for a register row and nothing more**; under DR-033 there is no obligation anywhere to
reproduce a V2 value, and under DR-039 no new number enters without facts behind it.

**Recorded context.** DR-031 ratified 38 unanimous rows and five human rules; DR-036 … DR-045
ruled all 28 contested rows (battery coverage 71/71); the spec records
`engineRelationship = GREENFIELD_NEW_REPO`. DR-037's **standing label law** governs every row
label: a row is HYBRID when code both constrains the model's answer into a typed shape **and** can
act on it without asking again; LLM only when code does nothing but store; and every row records
two fields — `substance:` (who decided) and `enforcement:` (the named machine gates) — so that
judgement never masquerades as verification.

---

## 3. The kept organ set, and which battery stage owns each

V ruled the product topology in DR-030 and **ratified it as final in DR-056(a)**: **(J1)** the
re-specified DF-QuAD is the single scoring engine for WEIGH and COMPOSE — one math, receipts
everywhere; **(J2)** there is **one graph** — the SPLIT stage's children and defeaters *are* its
nodes and typed arrows, and battery stages operate on it directly; **(J3)** SERVE reads a new
battery serve layer built on the execution ledger, with V2's `qbaf_debug` content re-specified as
that layer's internal debug facet.

Six organs are kept. `RULED — DR-030 · DR-056(a)`; the table is no longer vetoable.

| # | Organ | What it is, in one sentence | Battery stage owner(s) | Section |
|---|---|---|---|---|
| 1 | **Scoring engine** (re-specified DF-QuAD/QBAF) | Turns judged nodes and typed arrows into one number per node, with receipts. | **WEIGH + COMPOSE** | 4 |
| 2 | **Per-node judge contract** | Gets one model's structured grade for one node and reduces it to numbers deterministically. | **WEIGH** | 5 |
| 3 | **The one graph** (node + arrow shapes) | The single object every stage reads and writes: claims, defeaters, typed relations, lifecycles. | **SPLIT** owns it as an object; substrate for all stages | 6 |
| 4 | **Decision→spawn plumbing** | Turns a per-node exploration decision into new work, audibly and only on categorical grounds. | **SPLIT** mechanics | 7 |
| 5 | **Execution ledger and receipts** | Records everything executed, before the math, so every served number is replayable. | **All stages write; SERVE reads** | 8 |
| 6 | **Serve layer + internal debug facet** | The one place answers leave the system, plus an operator-only view of the graph's internals. | **SERVE** | 9 |

Everything else in the battery — LOCK, ROUTE, AIM, HARVEST, RUN, CROSS, SETTLE — is
**greenfield**, built under the eight house rules (DR-029, DR-030, DR-056a). Nothing in this
manifest constrains those stages except the cross-cutting laws in §2.2.

### 3.1 The Model B perimeter

`RULED — DR-035` (closing DR-022's scope). V2 contains a second, in-memory scoring experiment with
typed attack/support edges carrying weights, per-node base scores and per-node uncertainty, never
persisted and never served (`coordinator/app/qbaf/model.py:81-155`,
`coordinator/app/qbaf/semantics.py:33-103`, reachable only from
`coordinator/app/api/qbaf.py:58-86` into an in-memory repository at `:20`). It matters because the
persisted V2 model has **zero edge rows and cannot express a defeater at all**
(`../research/04-node-graph-data-model.md` §A.2).

- **In:** the **labeled-arrow idea** — an explicit supports/attacks relationship carrying a
  strength — together with **per-node uncertainty as a first-class shape**, as design reference.
- **Out, explicitly:** the experiment's score-walking code, its loop handling, and its own 0.5
  defaults. The last is itself a D1 site (`coordinator/app/qbaf/model.py:30-31`).

**Also not in the kept set:** V2's unused self-consistency estimator
(`../research/02-scoring-behavior-spec.md` U7) has no caller anywhere in V2 and is not one of
DR-030's six organs, so it is out by omission. If V intended otherwise, say so at review.

---

## 4. Organ 1 — the scoring engine (re-specified DF-QuAD / QBAF)

### 4.1 Purpose

Take a graph of claims — each carrying a base score a judge actually produced — plus the typed
arrows between them, and produce one number per claim: how strongly the graph supports it.
Attackers pull a claim down; supporters push it up; the arithmetic is published and fixed. Under
DR-030 (J1) it is the **only** scoring math in V3: WEIGH and COMPOSE share it, so there is one set
of receipts rather than two.

### 4.2 Exact behavior

**(a) The aggregation function α ("probabilistic sum").** `RULED — DR-030(J1) · DR-056(a)` for
the engine's identity; the formula is the published definition of that engine
(`../research/02-scoring-behavior-spec.md` §1.2):

```
agg([])         = 0
agg(v1 … vn)    = 1 − Π(1 − vi)
```

Computed as a left fold `a ← 1 − (1−a)(1−v)` from `a = 0`. Commutative in exact arithmetic but
**not** bit-identical under reordering in IEEE-754 doubles, so V3's arrow order must be
deterministic and recorded — not to match anything, but so that V3's own replay (DR-034) is exact.
`CARRIED-DESIGN` for the ordering requirement.

**(b) The mediating function σ.** `RULED — DR-030(J1)` for the accumulate operator; the formula is
DF-QuAD's published definition:

```
σ(τ, va, vs) = τ − τ·(va − vs)         if va ≥ vs
σ(τ, va, vs) = τ + (1 − τ)·(vs − va)   otherwise
```

The comparison is `≥`, not `>`, so the tie case `va == vs` returns exactly τ. This is what makes
DF-QuAD discontinuity-free; `>` would introduce the discontinuity the method exists to avoid.
Equivalently, writing `d = vs − va`, σ is continuous and non-decreasing in `d` over `[−1, 1]`, with
slope `τ` below zero and `1 − τ` above it — the fact §4.5's properties rest on.

`RULED — DR-062 (OD-05)` for the strict-and operator's counterpart: **strict-and has no identity
element.** Every declared conjunct must be judged; where any conjunct is unjudged or abstained,
the parent emits **no number** and its components are served. A conjunction with an unmeasured
conjunct has not been measured — treating a missing conjunct as certainly true would be D1's
failure mode in a new costume. The withheld-parent shape is DR-040's, reused.

**(c) Typed arrows are first-class objects.** `RULED — DR-022 as narrowed by DR-035 · DR-030(J2)`
for the arrow's existence, its polarity, its stored strength, and its ability to target a node that
is **not** the source's structural parent — which is what makes a defeater expressible at all, and
which V2 cannot do (`../research/04-node-graph-data-model.md` §A.2, §C). An arrow is
`{source, target, polarity ∈ {support, attack}, strength ∈ [0,1], kind}`. `CARRIED-DESIGN` for the
transmission rule — a child's contribution to its target is `arrow strength × strength(child)`
before aggregation, the reading V2's experiment used
(`coordinator/app/qbaf/semantics.py:53`) — and for the integrity rule that an identity
`(source, target, polarity)` carrying two different strengths is a loud typed error rather than a
silent pick. `RULED — DR-062 (OD-06)`: **arrow strength is closed.** It is only ever the output
of a ruled mechanism — the evidence verifier's grounded score for evidence arrows, or provenance
cluster collapse (§4.2g). No author, policy, model or configuration row may set it freely. The
weight research surveyed thirteen candidate factors and found none needing a free arrow strength
rather than a base-score cap or a cluster gate, and every free-setting path would be one more
place a number could be invented.

**(d) Evaluation order and the cycle law.** `CARRIED-DESIGN` for topological evaluation over the
union of support and attack arrows, so every predecessor's strength is final before it is read; a
node with no incoming arrows gets `σ(τ, 0, 0) = τ`. `RULED — DR-056(b) · DR-042` for cycles, at
three layers:

1. **Construction refuses cycle-closing arrows** (DR-042): the builder is loop-free by
   construction. A circular attack is redirected — the builder surfaces a typed **shared-crux
   sub-claim** (or an attack on the common ancestor) instead — and *"circular dependency found"* is
   **served information**, not a silent repair.
2. **Compute time raises a typed error** if a cycle is nevertheless present — never a partial
   result, never a fixed-point approximation.
3. **Write time rejects** the cycle-creating arrow.

**(e) M1 — τ comes from judgement, or the node contributes nothing.** `RULED — DR-028`. There is no
default τ at any layer. An unjudged node emits **no arrow** and carries an explicit typed
abstention record. The arithmetic makes this exact rather than a compromise: `agg([]) = 0` is the
aggregation's identity element and `σ(τ, 0, 0) = τ`, so **dropping an unjudged child's arrow leaves
the parent on precisely the value its judged children justify**
(`../research/32-weight-derivation.md` S9). Which typed record it carries is
`RULED — DR-044(Q55) · DR-051` (§5.2m).

`RULED — DR-062 (OD-02)` for interior nodes: **an unjudged interior node is transparent.** It
emits no arrow of its own, and its children's arrows attach to the **nearest judged ancestor**
instead, so judged work always reaches the answer. Because an unjudged node then changes the
graph's shape, that change is **visible at both ends** — a marker at the lifted child naming where
its arrow actually landed, and a marker at the skipped node naming that it conducted without
contributing. Deriving an interior node's base score from its children is forbidden: that is a
number computed from nothing, which is D1.

**(f) M2 — the combination operator is declared per parent.** `RULED — DR-040(Q45)`. Two operators
exist: *accumulate* (the probabilistic sum above) and *strict-and* (the product). The declaration
path is a machine-only fast path: a **policy-declared or human-declared** operator costs zero model
calls; an **undeclared** parent gets **one bounded declaration call**; and where no declaration
results, the **parent number is withheld and the components are served**. The magnitude is why this
outranks every weighting question here: on the mission's worked case — four sub-claims at 0.95,
0.60, 0.35, 0.50 — accumulate gives **0.9935** and strict-and gives **0.0997**, a **9.96×** gap
(`../research/32-weight-derivation.md` S11). `RULED — DR-031(Q47)`: computing what the *other* rule
would have produced is a MACHINE row and spec law; where the rival operator would flip the served
band, both readings are served with the deciding choice printed — never averaged, never an
abstention. `RULED — DR-062 (OD-22)` for where the declaration lives: a **resolution chain** —
per parent node, defaulting to a run-level declaration, defaulting to a deployment setting — and
**whichever level supplied the effective value is recorded on the number**. The identifier is
recorded per run *and* per parent regardless of who set it, so no consumer has to guess which
rule produced a figure.

**(g) M3 — counting is by provenance, not by string.** `RULED` as a defect clause (D3, §10.3):
sibling support is partitioned by a provenance key and **each cluster contributes once, at the
strength of its strongest member**. A gate, not a bonus: the aggregation already rewards multiple
supporters, so paying again for independence double-counts it. Computed effect on the audit's
worked case: three restatements of a 0.40 claim aggregate to 0.784 and contribute **0.400** under
cluster collapse.

`RULED — DR-062 (OD-09)` for the key's width: the primary key is the **underlying study or dataset
identity plus the producing model family**; **source domain and publisher** are fallbacks used only
where study identity is absent; and **producing-run identity always applies**, catching accidental
duplicates inside one execution. The key targets the failure V measured — three analyses sharing
authors and trials counting as three confirmations — rather than the one that is easy to compute.
The key is a declared, recorded run input, and it is **printed wherever a cluster changed a
number**, so a change of key is a configuration change and every affected figure says which key
produced it.

`RULED — DR-062 (OD-01)` for cardinality: **counting is uncapped**, exactly as the published
operator counts, and cluster collapse is its only control. No top-k cap and no count-insensitive
aggregator is introduced: a cap constant would flip verdicts without facts behind it (DR-039), and
a count-insensitive rule would break both literature vectors in §4.5. If measured outcomes later
show clustering failing to catch inflation, that evidence is what DR-039 requires before a cap may
be considered.

**(h) Way of knowing.** `RULED — DR-044(Q51)` for the band half: the locator gate, the provenance
join and the **reasoning-only downgrade** are blocking machine gates — an answer resting on
reasoning alone is downgraded from a verdict to a hypothesis plus a research plan, and the gate
blocks rather than annotates. `RULED — DR-062 (OD-12)` for the arithmetic half: **there is no
numeric ceiling on τ.** The band rule alone carries the consequence, because DR-044 already made
the downgrade blocking and DR-039 sets a high bar for inventing three constants that would move
every number above them in the graph. Should outcome data later show reasoning-only claims scoring
high and being wrong, that data is exactly the fact base DR-039 asks for before a ceiling may be
revisited.

**(i) Restatement between siblings.** `RULED — DR-062 (OD-08)`. Two siblings may say the same thing
in different words without sharing provenance, in which case M3's cluster gate does not catch them.
V3 **flags and does not gate**: the node and the wire carry `possible_restatement_of: [node_ids],
similarity: x.xx`, and **no number changes**. A gate would need a similarity threshold — a
verdict-flipping constant under DR-039 — and it can be attacked: a near-duplicate of the strongest
counter-argument would be absorbed into a cluster and silenced. Promotion to a gate is available
only after the threshold has been shown to fire correctly **in both directions on real data**, and
then only with complete-linkage grouping, within one polarity and one parent.

**(j) The value overlay never touches the graph.** `RULED — DR-017`. Value weights are a second
layer attaching at computed hinge nodes; τ, arrow strengths, strengths and provenance are computed
with no reference to any value weight. `weight_source ∈ {owner_elicited, org_policy, none}` — no
`default` member, for the same reason there is no default τ. Flow A (serve the conditional plus the
reversal point) always runs; Flow B asks one swing question per real hinge; Flow C is opt-in
standing profiles. `RULED — DR-043(Q50)`: the model may propose criteria under three guards — every
proposed criterion must link to actual evidence or code drops it; rejected candidates are served
visibly; the asker may add criteria through the steering menu. Weights remain human-only; all
arithmetic is machine. `RULED — DR-053` for mixed questions: two phases on **one** graph — phase 1
settles the empirical half fully, phase 2 runs the value machinery on the settled graph — producing
one served answer in two labeled sections ("what is true" / "what follows given your values"), with
phase order machine-enforced and a typed dual settlement act.

**(k) Fragility and leverage are outputs, never weights.** `RULED — DR-031(Q46, Q49)` as MACHINE
rows: removal-based impact — recompute with a node dropped and report the difference — produces the
leverage ranking and the fragility table. `RULED — DR-050` for the bound: **K = 1** halt-and-deepen
round per parent per run; after it, recombination proceeds and the answer carries a visible
`LEVERAGE_UNRESOLVED` residual naming the carrying piece and its verification thinness, joined to
the Q44/Q53 panels. `CARRIED-DESIGN` for the prohibition that closes the loop: feeding sensitivity
back into τ or arrow strength is forbidden by construction, because weights → strengths →
sensitivity → weights has no declared fixed point and could be made to converge anywhere
(`../research/32-weight-derivation.md` S8).

### 4.3 Inputs and outputs

**Inputs.** A node set with per-node τ present *only* where a judge produced one; the arrow set;
the per-parent operator declaration; the provenance partition; the way-of-knowing label per node;
and the run's recorded operator identifier — an input, never a source literal (§10.2).

**Outputs.** `RULED — D4 clause (§10.4)` for the shape: a per-node record joining the number to its
origin, never a flat `node_id → float` map. `CARRIED-DESIGN` for the field list — at minimum
`{strength, tau_source, way_of_knowing, cluster_id, judged_by, abstained, supported_by,
attacked_by, operator_used}` (`../research/32-weight-derivation.md` P1) — plus the graph
fingerprint, the operator identifier emitted **by the computing component**, the leverage and
fragility outputs (§4.2k), and a ledger row for every computation (DR-027).
`RULED — DR-062 (OD-22)`: each number also carries **which level of the resolution chain supplied
its operator** — parent, run or deployment — and `RULED — DR-062 (OD-02)`: where an arrow was
lifted past an unjudged interior node, both the lifted child and the skipped node carry the marker
that says so.

**Fingerprint properties.** `CARRIED-DESIGN`. The digest must be **input-order-independent**, must
**change when any τ changes**, and must **differ between two different operator selections on the
same graph** — the last is what stops two runs under different rules from being mistaken for each
other. The idea is V2's, at `coordinator/app/qbaf/debate_adapter.py:329-338`; the requirement is
V3's.

### 4.4 Edge cases

| Situation | Behavior | Tag |
|---|---|---|
| Empty node set | Empty result. Never a fabricated number. | `CARRIED-DESIGN` |
| Node with no incoming arrows | `strength = τ` | `CARRIED-DESIGN` |
| `va == vs` exactly, accumulate | `strength = τ` (first σ branch) | `RULED — DR-030(J1)` |
| `va == vs` exactly, strict-and | Reached only when every conjunct is judged; strict-and has no identity element, so an unjudged conjunct withholds the parent number instead | `RULED — DR-062 (OD-05)` |
| τ outside `[0,1]` | Typed error at compute time | `CARRIED-DESIGN` |
| Arrow endpoint absent from the node set | Typed error at compute time | `CARRIED-DESIGN` |
| Cycle | Refused at construction, rejected at write, typed error at compute | `RULED — DR-056(b) · DR-042` |
| Duplicate identical arrow | Collapses once | `CARRIED-DESIGN` |
| Same arrow identity, two different strengths | Loud typed integrity error | `CARRIED-DESIGN` |
| Unknown node or arrow kind | **Loud failure.** V2 silently records an unmapped marker and disconnects a whole sub-tree from the root's score with no error (`../research/04-node-graph-data-model.md` §A.1) — the disease, not the design. | `CARRIED-DESIGN` |
| Node has no judgement | No arrow; typed abstention record; parent unaffected | `RULED — DR-028 · DR-044(Q55) · DR-051` |
| Some or all of a parent's children abstained | **Operator-dependent.** Under **strict-and**, any abstained conjunct withholds the parent number and the components are served. Under **accumulate**, a missing supporter is genuinely neutral — `agg([]) = 0` is the identity element — so no fraction rule applies and the parent computes from its judged children. No threshold constant is introduced. | `RULED — DR-062 (OD-07)` |
| Any failure at all | Caught, typed, **and written to the ledger**. V2 swallows protocol-analysis exceptions with a print (`coordinator/app/protocol/runner.py:52-60`); under DR-027 a swallowed failure is a violation. | `RULED — DR-027` |

### 4.5 The external ground truth this organ must satisfy

`CARRIED-DESIGN` — these are the published authors' numbers, not V2's, and carry zero clean-room
contamination. Under DR-033 they are the *only* recorded input→output pairs V3 reproduces
(`../research/03-golden-vector-plan.md`; transcribed in V2 at
`coordinator/tests/test_dfquad.py:95-138`, which is where they were found, not what they prove):

- **Literature vector 1** (arXiv:2307.13582 Fig. 3). All τ = 0.5; supports `B→A, C→A`; attacks
  `D→A, E→B, F→D, G→F, H→F`. Required: `F = 0.125`, `B = 0.25`, `D = 0.4375`, `A = 0.59375`; leaves
  `C, E, G, H = 0.5`.
- **Literature vector 2** (arXiv:2407.08497 Fig. 1). τ: `alpha 0.5, beta 0.3, gamma 0.6, rho 0.7,
  zeta 0.4`; supports `beta→alpha, zeta→gamma`; attacks `gamma→alpha, rho→beta`. Required:
  `zeta = 0.4`, `rho = 0.7`, `gamma = 0.76`, `beta = 0.09`, `alpha = 0.165`.

**Properties of the accumulate operator**, as property tests over generated graphs. The previous
draft asserted *strict* monotonicity, which is mathematically false at the boundaries — a correct
implementation would have failed the stated test
(`../reviews/ReviewLens-Codex-pack.md` finding 5). The corrected statements:

- **Determinism.** Repeated evaluation of the same graph yields the same result.
- **Non-increasing under added attack.** Adding an attack arrow into a target never raises that
  target's strength.
- **Non-decreasing under added support.** Adding a support arrow into a target never lowers it.
- **Empty graph gives an empty result; an isolated node gives its own τ.**

**Strictness holds only under stated preconditions, and the generators must encode them.** Write
the added arrow's effective contribution as `c = arrow strength × strength(source)`, and let `va`,
`vs` be the target's aggregated attack and support *before* the addition. Then:

> **Strictly decreasing** under an added attack **iff** `c > 0` **and** `va < 1` **and**
> `0 < τ < 1`.
> **Strictly increasing** under an added support **iff** `c > 0` **and** `vs < 1` **and**
> `0 < τ < 1`.

Why each precondition is needed, from §4.2(b): `c = 0` moves nothing; `va = 1` (or `vs = 1`) is
already saturated, since `1 − (1−1)(1−c) = 1`; `τ = 0` makes σ's lower slope zero, so an attacked
target pinned at 0 stays 0; and `τ = 1` makes the upper slope zero, so a supported target at 1
stays 1. The arrow must also be **novel**: an exact duplicate identity collapses (§4.4) and a
cluster-absorbed arrow contributes nothing (§4.2g), so neither moves the number. Generators for the
strict properties must therefore exclude `τ ∈ {0, 1}`, zero-strength arrows, zero-strength sources,
pre-saturated aggregates, duplicate identities and cluster-absorbed arrows; the non-strict
properties are generated without those exclusions.

### 4.6 Battery stage owner

**WEIGH and COMPOSE.** `RULED — DR-030(J1) · DR-056(a)`.

---

## 5. Organ 2 — the per-node judge contract

### 5.1 Purpose

For one node, obtain a structured assessment from a model, reduce it **deterministically** to a
small vector of numbers plus human-legible explanation, and persist both the raw output and the
reduced result under an identity that pins every semantic input. The determinism is the point: the
model's grade is a judgement, but everything downstream of it is arithmetic anyone can re-run —
which is what makes DR-034's replay law achievable.

### 5.2 Exact behavior

**(a) Claim normalization.** `RULED — DR-062 (OD-16)`. V2 derives a claim type, ambiguity flags,
implied assumptions, a conservative scope and evidence locators from the claim text with regular
expressions only (`../research/02-scoring-behavior-spec.md` §2.2). V3 runs **code first, and a
model only on "unknown"**: the deterministic classifier attempts the type at zero cost, and only
where it returns "unknown" does a bounded model call attempt it, with code constraining the answer
to the closed type set and rejecting anything outside it. The common path stays free and
reproducible; the failure mode that matters — real language the patterns do not cover — is removed;
and the escalation is itself a typed, enforced route, which is what DR-037's label law asks of a
HYBRID row. `RULED — DR-037`: the row records `substance:` (who decided the type) and
`enforcement:` (the machine gates acting on it). `CARRIED-DESIGN` for the properties that hold on
both legs: the type comes from a **closed set**; multiple matches resolve to an explicit "mixed"
rather than a silent first-wins; no match on either leg resolves to an explicit "unknown"; hedge
words never change the type; and anything the scope extractor does not find stays **absent rather
than guessed**.

**(b) Child context.** `CARRIED-DESIGN`. The node's direct supporting and attacking children only —
evidence and container nodes deliberately excluded — in a stable order, each carrying its stance,
claim, and an argument excerpt bounded to a declared length that cuts at a word boundary and marks
itself truncated. Non-truncated excerpts are byte-identical to the source.

**(c) The prompt's honesty constraints.** `CARRIED-DESIGN`
(`coordinator/app/scoring/prompts.py:47-116`): structured output only; **never invent evidence,
citations or sources**; score relevance *relative to the question actually asked*; and score
counterargument strength against the strongest **real** attack when attacks were supplied,
otherwise against plausible counters **and say so in the findings**. A counter that was imagined
must never be reported as a counter that was found — the same instinct DR-039 later made a standing
principle.

**(d) The output schema.** `CARRIED-DESIGN`. Five required sub-objects — steelman, critic,
evidence, context, fallacy — every declared number validated to `[0,1]`, with typed fatal flags
carrying `{type, severity, description}` (`coordinator/app/scoring/models.py:234-281`).

**(e) Parsing.** `CARRIED-DESIGN`. Strategies tried in strict order so clean structured output is
never altered: parse as-is; strip one markdown fence and retry; extract the first brace-balanced
object respecting string literals and escapes, and retry. The two failure outcomes must stay
**distinguishable**: "not valid output" and "did not match the schema" are different records, and
fence tolerance must never mask a schema failure as a parse failure.

**(f) The deterministic reducer.** `CARRIED-DESIGN` for the machinery
(`../research/02-scoring-behavior-spec.md` §2.4): two intermediates (counter-resilience as the
complement of counterargument strength; a clarity term decaying with each ambiguity flag); two
published compositions branching on claim type, with the chosen branch **emitted** so a reader can
see which produced the number; score caps applied in a fixed order, each recording what was capped,
to what, why and by what; an enumerable uncertainty ladder; uncertainty drivers in a fixed,
never-reordered emission order so callers may rely on "first = primary"; typed holes; recommended
investigations with a declared priority arithmetic and sort key; three-band labels; and a rationale
defending the score in both directions and naming the weakest link. Coefficients and cap values are
recorded in the research as source material and become register rows (DR-023), not inherited values
(DR-033). `RULED — DR-062 (OD-17)` for the branch membership: the evidence-free composition covers
**normative, definitional and value-laden claims**. Value claims join because DR-017 and DR-043
already give them their own machinery — weights human-only, criteria model-proposed under three
guards — so scoring them on evidence quality double-counts a decision handled elsewhere. The branch
is selected from a **declared claim-type → composition map held as data**, never a source literal,
so membership is a register change; when the type vocabulary is next revised, the map is derived
from each type's own declaration of whether external evidence is possible for it.

**(g) Plural judges.** `CARRIED-DESIGN` for the mechanics: a panel is opt-in; with no members the
single-judge path is identical to the zero-member panel path; each member gets its own judge role,
hence its own contract and contract hash, and is called with an otherwise identical request; every
failure mode — construction error, timeout, provider error, unparseable response, unconfigured
family — produces an **honest typed note** and never fails the primary run or discards its result.
`RULED — DR-055`: multi-maker critique is a **launch gate** — standard-and-above tiers must execute
real different-maker critique from day one; single-maker operation stays legal only as **labeled
degraded operation** wearing DR-014's caps. `RULED — DR-041(Q31)`: where a same-family fallback is
used it runs prompt-diversification plus bias mitigations and is labeled `DEGRADED DIVERSITY`; cold
start is maker-only and labeled.

**(h) Dispersion is measured, never averaged away.** `CARRIED-DESIGN` for the measurement: with two
or more distinct judgements, uncertainty is the spread of a fixed composite signal across them,
scaled and clamped; the item's uncertainty source becomes "dispersion"; and a dispersion driver is
**prepended** so it reads first. Fewer than two parseable judgements yields *no measurement*, and
**that absence must never be read as zero uncertainty**. `RULED — DR-032`: V2's habit of replacing
the whole score object with a weighted mean when calibration is on
(`coordinator/app/scoring/service.py:1514-1561`) is **not** carried — disagreement is surfaced, not
smoothed.

**(i) The working disagreement flag.** `RULED — DR-032`. V2's live cross-judge gate is a
composite-spread threshold the repo itself records as **mathematically un-fireable against its own
data**: the largest observed spread across 26 nodes was 0.11 against a 0.35 threshold
(`coordinator/app/scoring/disagreement.py:64-69`). V3 implements a **working** flag — fireable, and
possible precisely because DR-026 makes judge weighting real — with four binding properties:

1. It **serves as a flag plus a certainty downgrade**: judges disagreeing is information the reader
   gets, in words, alongside a lowered certainty.
2. It is **never a silent average**.
3. It is **never an abstention gate** — disagreement does not by itself refuse to answer.
4. **V3 must demonstrably fire where V2 provably could not.** `RULED — DR-063 (VR-1)` sets the bar
   in three parts: the **adoption bar** is that the gate is shown to fire **both ways** on real
   data before it is adopted; the **launch minimum** is that it has fired at least once; and a
   **standing monitor** thereafter checks that its firing rate stays consistent with the spreads
   actually observed. A gate that has never fired is not yet adopted.

**(j) Correlated-error discounting.** `CARRIED-DESIGN`
(`coordinator/app/scoring/calibration.py:51-107`): group judgements by family in **first-appearance
order**, never by family name; the first occurrence of a family keeps full weight and subsequent
occurrences take a flat, **non-compounding** discount; items whose family is **unknown are never
discounted against each other**, because unknown lineage is never assumed to correlate. Raw
provider and model strings are **never** embedded in a served weight record — only the role and the
derived family.

**(k) Judge weight is earned, not declared.** `RULED — DR-026` — V2's calibration override is
unreachable, so every judge weighs a constant 1.0 forever regardless of track record (§10.5). V3
implements real judge weighting fed by outcome memory (DR-015/DR-016 machinery).
`RULED — DR-046` for how that weight is produced and consumed: per-model **scorecards** derived from
measured outcome data drive **weighting and diversity-routing from day one**; weights and
capabilities are **always-evolving**, updated on every factually-settled round; an **exploration
share of about 20 %** (next-best or random) is mandatory once understanding accrues — no monopoly,
diversity of thinking required; new models serve a process-fact probation before their capability
weight departs neutral, and hard best-model routing waits for a per-class detectability threshold
(numbers provisional in the DR-012 pattern); a **model ledger** in Postgres records sessions and
per-category bests. The lesson D5 taught is itself a requirement: **the cold-start exit must
demonstrably execute.** `RULED — DR-039`: scorecards are derived from measured outcomes, never from
invented metrics.

**(l) Lineage vocabulary.** `CARRIED-DESIGN` for the two deliberately distinct concepts — a
matching family used for independence decisions and a product-facing brand bucket used for display
— and for the rule that independence is **never fabricated**: unknown arguer or unknown judge
yields "independence unknown" with a typed reason, never a default of "independent".
`RULED — DR-013`: different maker = different lineage. `RULED — DR-014`: with no second lineage the
answer serves but **cannot reach the top confidence band**, carries a visible "independent critique
unavailable" label with its reason, and records a lift condition whose later execution re-scores.
Every string is scrubbed for secret markers before it is served.

**(m) Which typed non-answer a node wears.** `RULED — DR-044(Q55) · DR-051`. Q55 is HYBRID: the
**model chooses** which kind applies — V's words, *"the mapping IS a judgment"* — and the
**machine enforces** the choice and its ledger consistency. DR-051's partition law then fixes the
vocabularies: the **five abstention kinds** (not searched / searched and found nothing / measured
and inconclusive / not runnable / a value choice) apply **only to ignorance-ledger unknowns**; every
other typed state belongs to a separate **closed condition-marks enum**, servable in parallel. One
answer may wear **one** abstention kind and **several** condition marks.

**The enum's membership is not restated here.** Its single source is the exhaustive mapping table
at `requirements-spec.md` §12.3 (Requirements S-11 … S-13), which places every typed non-answer
state in exactly one of three homes — abstention kind, condition mark, or terminal route — so that
residue is impossible by construction, and which forbids minting a new typed state without placing
it in that table. This manifest **cites by reference and never duplicates**
(`../reviews/merge-verdict-pack.md` ORCH ROUTING ADDENDUM item 2; merge verdict delta class-1
item 4). Any mark named elsewhere in this document is one of that table's rows, not an addition to
it.

### 5.3 Inputs and outputs

**Inputs.** The node's claim and argument text; the question actually asked; the ordered child
context; the judge role; the prompt version; a timeout; the run's contract.

**Outputs.** `CARRIED-DESIGN`. The per-node payload: the normalized claim, the numeric score
vector, the labels, the typed holes, fatal flags, score caps, judge disagreements, recommended
investigations, the rationale, the uncertainty drivers and their source, the strength kind, and the
**score provenance** — which always asserts that the final number came from the deterministic
reducer and that **raw judge text is not included in a served item**. V3's provenance object is
strictly larger than V2's; V2's is precisely where the per-item identity fields are missing (§10.4).

### 5.4 Edge cases

| Failure | Behavior | Tag |
|---|---|---|
| Node not current / not loadable | Typed unavailable with a specific reason; **no provider call** | `CARRIED-DESIGN` |
| Provider timeout | Typed unavailable naming the timeout | `CARRIED-DESIGN` |
| Provider error after the declared attempt budget | Typed unavailable with a **scrubbed** reason | `CARRIED-DESIGN` |
| Output is not parseable | Typed unavailable; **raw artifact still persisted**; failure cached so it is not re-paid | `CARRIED-DESIGN` |
| Parses but fails the schema | A **different** typed unavailable — never conflated with a parse failure | `CARRIED-DESIGN` |
| Same-lineage judge where independence is required | Typed block, never a silently reused judge; degraded operation is labeled | `RULED — DR-013 · DR-014 · DR-055` |
| A panel member fails in any way | Honest typed note; primary result untouched | `CARRIED-DESIGN` |
| A panel member's stored assessment is unparseable at read time | **V2 silently drops it** — a three-judge panel quietly becomes a two-judge panel with no annotation (`coordinator/app/scoring/disagreement.py:131-149`). Forbidden: the drop is an executed event and must be recorded and digest-visible. | `RULED — DR-027` |
| Judges disagree | Flag + certainty downgrade; never averaged; never an abstention | `RULED — DR-032` |
| No provider configured at all | The job is created and immediately failed with a typed reason — never a silent skip | `CARRIED-DESIGN` |
| Judge produced nothing usable | No arrow, no default τ; a typed record whose kind the model chooses and the machine enforces | `RULED — DR-028 · DR-044(Q55) · DR-051` |

### 5.5 Battery stage owner

**WEIGH.** `RULED — DR-030 · DR-056(a)`.

---

## 6. Organ 3 — the one graph (node and arrow shapes)

### 6.1 Purpose

Hold the answer. `RULED — DR-030(J2) · DR-056(a)`: there is exactly one graph — the SPLIT stage's
children and defeaters **are** its nodes and typed arrows, and every battery stage reads and writes
that same object. V2 has three disjoint graph models and nothing converts between them
(`../research/04-node-graph-data-model.md` §0). V3 has one.

### 6.2 Exact behavior — the node

**Identity and structure.** `CARRIED-DESIGN` (`../research/04-node-graph-data-model.md` §A): opaque
stable identity never reused; owning question; structural lineage to the node it was produced
under; depth; sibling ordinal; and a **materialized path** — the `/`-joined ordinal chain from the
root. The path is not decoration: it is the cheap subtree operator that makes ancestor-triggered
invalidation possible at all, and V3 needs the same capability whatever it is called. Sibling
ordinals are banded by child kind so kinds cannot collide, and invalidated siblings keep their old
slots; in V2 that band is *the closest thing to a typed edge that exists*, and in V3 — where the
arrow is a real object (§6.3) — it reverts to being an ordering convention.

**Content.** `CARRIED-DESIGN`. A short claim that must be non-blank when served; a pointer to the
currently authoritative body text, with the body on an append-only revision record so a node has
history but exactly one live text; and a typed annex for evidence nodes which readers must treat as
empty when absent.

**Three orthogonal lifecycles.** `CARRIED-DESIGN` (`../research/04-node-graph-data-model.md` §A.4):

1. **Generation status** — has this node's text been produced? `pending → complete | failed |
   stale`, plus a derived-only "generating" that is never persisted. Failure is **bounded** for the
   degradable job families: the node fails, its exploration decision becomes a stop with an
   exhaustion reason, its path is abandoned, and **the answer survives** so the remaining branches
   can still be composed. `stale` means invalidated and never scored; regenerating a node marks
   every descendant by path prefix stale and cancels their work.
2. **Path status** — is this line still being pursued? `active | abandoned`. Abandonment is a
   **pause, not a deletion**: an abandoned node is still scored, still an arrow endpoint, and can be
   **reopened** when new grounded evidence arrives.
3. **Exploration decision** — the last decision taken on this node, from the closed set `continue,
   deepen, seek_evidence, challenge, abandon, reopen`, plus its reason.

**Standing after a failed falsification attempt.** `RULED — DR-041(Q29)`. There is no kill on
author failure. The falsifier hunt rotates across models; at exhaustion the piece wears a visible
`UNFALSIFIED-AFTER-ROTATION` mark that **degrades its standing** — never silent deletion, never
silent full citizenship. `RULED — DR-051` places that mark in the closed condition-marks enum, so
it is servable alongside an abstention kind rather than competing with one.

**Which of these states enter the scored graph.** `RULED — DR-062 (OD-18)`: **everything except
`stale`**, and the **debug facet uses the identical node set**. Keeping failed nodes in the graph
keeps their arrows intact — a dead node can still be a live sibling's target, and dropping it risks
an orphaned arrow that fails the whole computation — while §4.2(e) already ensures a node with no
judgement contributes nothing. The identical-set requirement removes V2's tooling divergence, where
the debug view excluded failed nodes and therefore showed an operator different strengths and a
different fingerprint from the ones actually served
(`../research/02-scoring-behavior-spec.md` §4.6). The set in force is declared and recorded on the
run, and the debug facet reads that declaration rather than re-deriving its own.

**Write-time enforcement.** `CARRIED-DESIGN` for the principle, `RULED — DR-056(b)` for acyclicity.
V2 enforces its lifecycle vocabulary only at the audit-record boundary, and a value is written to
the node's stopping-status column that the validator would reject
(`../research/04-node-graph-data-model.md` §A.4, §A.5). V3 types this state once, **at the node**,
and enforces node type, lifecycle vocabularies, non-blank claim and path/depth consistency at write
time rather than by convention.

**The per-node epistemic record lives on the node.** V2's richest reasoning shape is *keyed by node
id but not part of the node*, so it can be absent, stale, or keyed to different content than the
node's current text, and **the node carries no indication of which**
(`../research/04-node-graph-data-model.md` §A.3). `RULED — DR-018 · DR-031(R9, Q27, Q28 riders) ·
DR-019` for the obligation and its coverage; `CARRIED-DESIGN` for the individual field shapes. The
audit's list, ordered by how much each blocks the stranger law:

1. A **plain-language restatement**, generated *for a stranger* rather than as model prose written
   for the debate. `RULED — DR-061 (OD-S-06)`: its shape is the canonical `stranger_restatement`
   contract defined once at `requirements-spec.md` §12.7 and **cited by name here, never
   restated**. The ruling adopts the **verdict-only** reading of its action field: a node carries
   what it claims, how sure we are, what would change it, when the restatement was minted and its
   check status; **only the verdict additionally carries what the reader would do differently**,
   because one node rarely implies an action and an inherited action on a leaf is the meaningless
   text the stranger law exists to prevent.
2. A **per-node revision trigger** — the "what would change it" field of that contract, in ordinary
   language.
3. A **node-level provenance projection** — who wrote it, with what prompt, at what version, on
   which run — readable at the node rather than a join away.
4. A **stranger-test status** on the node, so the test can block serving. `RULED — DR-019` for the
   coverage: load-bearing nodes exhaustive always; non-load-bearing sampled at a rate derived from
   the asker's own run parameters, ratcheting up on failures. `RULED — DR-052`: that sample rate
   **freezes at run start** and the ratchet applies to the *next* run, so a run cannot move its own
   goalposts.
5. **No bare numbers in the top layer.** V2's own rationale line reads "<claim> scored 0.62 with
   0.31 uncertainty" — two uninterpretable numbers, exactly what the layout rule forbids.
6. The judge's **"why it matters"** sentence and its typed relation to the root, which V2 computes
   and then discards.
7. **Per-node certainty in words**, not a three-value enum.
8. For extracted evidence, **what this shows** — a bare mid-argument sentence lifted out of its
   parent frequently fails to say what it claims when read alone.
9. **Self-describing node identity.** V2 assigns perspective types by cycling four literals over an
   ordinal, so a node typed `SCIENTIFIC_POV` may be labelled "Confounding POV"; V3 needs a real
   container type **and** a real perspective identity field. `RULED — DR-062 (OD-03)`: a perspective
   node is a **grouping device, not a scored claim**. It carries its own perspective identity, label
   and text; it emits **no arrow**; and its children attach to the nearest real claim above it. A
   folder cannot fabricate an intermediate number, and the "this whole angle is weak" summary a
   scored container would have carried is served instead as a **computed roll-up** over the angle's
   own nodes.
10. **No placeholder served as a claim.** V2 serializes "Additional supporting argument" as a real
    node until its job completes.
11. **Structural drops visible at the node** — a node that contributed nothing to the answer must
    not look identical, at the node, to one that did.
12. **The residual objection set** — which objections were closed, by what, and which are still
    standing. `RULED — DR-049`: Q53's residual objection is a **field of the fact bundle**, not a
    rendering afterthought.
13. **The uncovered-scope statement** — what the split does **not** cover. `RULED — DR-031`: Q27 is
    the battery's single LLM row and carries the plain-language rider. V2 has no home for it
    (`../research/04-node-graph-data-model.md` SPLIT gap 2).

### 6.3 Exact behavior — the arrow

**Arrows are stored objects, not derived at read time.** `RULED — DR-030(J2) · DR-022 as narrowed
by DR-035`. V2 has no edge table at all and recomputes every relation from `(node_type, parent_id)`
per request, which is the largest structural gap for the battery
(`../research/04-node-graph-data-model.md` §A.2). The arrow carries
`{source, target, polarity, strength, kind}` with the semantics of §4.2(c).

**Three relations that V2 collapses into one parent pointer are three relations.**
`CARRIED-DESIGN`:

1. **Containment / lineage** — "this node was produced while working on that node." Used for
   invalidation and subtree summaries.
2. **Argumentative relation** — support or attack, **as an arrow in its own right**. In V2 polarity
   is a function of the child's own type, so a node cannot support one parent and attack another,
   and cannot relate to any node that is not its structural parent. In V3 it can.
3. **Evidential relation** — derived from a verdict keyed to the evidence node. V2's fail-closed
   discipline is good design and carries: a supporting verdict gives a support arrow weighted by the
   verifier's own grounded score, **only if** that score is a real number in range — otherwise it
   fails closed to "no arrow", because a corrupted upstream row must never fabricate a base score.
   Anything else — unverifiable, pending, unknown, absent, malformed — gives **no arrow**.
   `RULED — DR-062 (OD-04)` for the contradicting verdict, which by its own schema carries no
   magnitude: it produces an **attack arrow with a typed unknown magnitude**. The arrow exists and
   is visible, so the reader sees the contradiction as a first-class attack; the engine treats an
   unknown magnitude as contributing nothing, so no number is invented. Extending the verifier to
   report a magnitude it can genuinely vouch for is the intended successor, and it can replace the
   unknown magnitude without changing the graph's shape — but only with a fact base behind the
   number, per DR-039.

**Defeaters exist as first-class objects.** `RULED — DR-030(J2) · DR-041(Q26)`. V2 has no defeater
shape at all: an attacking child attacks only its own structural parent, there is no
undercutting-versus-rebutting distinction, no attack on an inference step rather than a claim, and
no defeated/defeating status on either node (`../research/04-node-graph-data-model.md` §C). DR-041
makes defeater generation a **system obligation** routed to a differently-categorized model, keeps
the supports-only output rather than discarding it for author blind spots, records author
self-attack weakness as a scorecard process fact, and holds a node **incomplete until its defeater
set is non-empty or explicitly exhaustion-marked**. `RULED — DR-042` adds one further arrow-bearing
kind: the **shared-crux sub-claim** the builder surfaces when a circular attack is redirected.

`RULED — DR-062 (OD-19)` for the rest of the vocabulary. **Child kinds** are the full battery set:
support, attack, **defeater**, **shared-crux sub-claim**, **necessary condition**, **sub-question**,
**assumption**, and **scope carve-out** — necessary conditions being what the strict-and operator
(§4.2b, §4.2f) exists to combine, and scope carve-outs being where Q27's uncovered-scope statement
lands. **Arrow kinds** distinguish **rebutting** an attack (denying the claim itself) from
**undercutting** it (granting the claim while denying that it supports its parent). In the first
release an undercut is recorded as an attack on the **target-side justification** and marked as an
undercut, rather than as arrow-on-arrow arithmetic, which the engine has no shape for; the
distinction is therefore visible and restatable from day one without a new evaluation rule. The
vocabulary remains a **closed declared enum** with loud failure on anything unknown (§4.4).

**Residuals are first-class.** `RULED — DR-049` (Q53 residual as a fact-bundle field) and
`RULED — DR-050` (`LEVERAGE_UNRESOLVED` as a named residual). "Which objections are still standing
after the answer is composed" has no shape in V2 and has one in V3.

### 6.4 Inputs, outputs, edge cases

**Inputs.** Node creations and updates from every stage; arrow assertions from SPLIT and from
evidence verdicts; lifecycle transitions from the decision plumbing (§7).

**Outputs.** The graph itself, plus the projections every other organ reads: the node set for
scoring, the arrow set for the engine, the served node projection for SERVE.

| Situation | Behavior | Tag |
|---|---|---|
| Unknown node type or arrow kind | **Loud failure at write time.** V2 accepts any string and silently orphans the subtree. | `CARRIED-DESIGN` |
| A cycle-closing arrow is proposed | Refused at construction with a typed shared-crux redirect; rejected at write; typed error at compute | `RULED — DR-056(b) · DR-042` |
| Blank claim | Rejected at write time, not merely at serialization | `CARRIED-DESIGN` |
| Node failed / stale / abandoned | Everything except `stale` enters the scored graph, and the debug facet uses the identical set | `RULED — DR-062 (OD-18)` |
| Node abandoned | Still scored, still an arrow endpoint, reopenable | `CARRIED-DESIGN` |
| Falsification rotation exhausted | Visible `UNFALSIFIED-AFTER-ROTATION`; standing degraded; never deleted, never full citizenship | `RULED — DR-041(Q29) · DR-051` |
| Two sibling perspectives sharing a type literal | Impossible — perspective identity is its own field | `CARRIED-DESIGN` |

### 6.5 Battery stage owner

**SPLIT** owns the graph as its output object; every stage uses it as substrate.
`RULED — DR-030 · DR-056(a)`.

---

## 7. Organ 4 — decision→spawn plumbing (SPLIT mechanics)

### 7.1 Purpose

Decide, per node, what to do next — and turn that decision into new work in a way that is auditable
and cannot be steered by an uncalibrated number. This is the machinery V2 got right and the battery
reuses nearly wholesale (`../research/04-node-graph-data-model.md` §SPLIT).

### 7.2 Exact behavior

**(a) The policy is a pure function.** `CARRIED-DESIGN`. Two typed signal bundles — a score signal
(node identity, claim type, the numeric scores, holes, fatal flags, recommended actions, and a
persisted cross-judge disagreement flag) and an optional evidence signal (status, grounded score,
uncertainty, entailment verdict, caveats) — plus the current path state.

**(b) Fixed precedence.** `CARRIED-DESIGN`: reopen (if paused and newly grounded) → challenge →
seek evidence → deepen → abandon (only if unblocked) → continue.

**(c) The categorical-only steering law.** `CARRIED-DESIGN`, and load-bearing. Every decision is
classified `categorical` or `scalar` according to whether *at least one* of the reasons that fired
it was a categorical predicate — an evidence status, an entailment verdict, a fatal-flag membership,
a claim-type evidence requirement, a persisted disagreement label — rather than a threshold crossing
on an uncalibrated judge scalar. **Only categorically-grounded decisions may spawn real work.**
Unclassified decisions **fail closed to scalar.** The rationale is that there is no calibrated
ground truth for judge scalars, so a scalar threshold must never steer spend
(`../research/04-node-graph-data-model.md` §A.4) — the same instinct DR-039 later generalized.

**(d) Blockers are recorded but never ground.** `CARRIED-DESIGN`. Reasons *not* to abandon are
attached to the decision for the audit trail and **explicitly excluded** from the
categorical/scalar classification, so a scalar blocker cannot contaminate a categorically-grounded
decision.

**(e) Decision→work mapping.** `CARRIED-DESIGN` for the mechanics — a challenging child from
`challenge`, a supporting child from `seek_evidence`, and only under a categorical decision.
`RULED — DR-041(Q26)`: defeater generation is a system obligation routed to a differently-categorized
model, and a node is not complete until its defeater set is non-empty or exhaustion-marked, so the
plumbing must be able to spawn that work without an author's request. `RULED — DR-062 (OD-19)`: the
plumbing spawns the full ratified child vocabulary — support, attack, defeater, shared-crux
sub-claim, necessary condition, sub-question, assumption and scope carve-out (§6.3) — so the two
V2 shapes are a floor rather than the menu.

**(f) The decision audit invariants.** `CARRIED-DESIGN`
(`../research/04-node-graph-data-model.md` §A.4):

- `abandon` requires grounded input, an abandoned path, and a matching stopping status.
- On an active path the stopping status must equal the decision — *unless* the input was not
  grounded, in which case the prior state is preserved with **zero spawns**.
- An abandoned path can only be preserved by non-grounded input and can **never** spawn children.
- A non-spawning decision may not carry a spawn count.
- **Grounded** input requires: no reason codes at all; score *and* evidence both present *and*
  fresh; and all six identity fields non-null (score input hash, scoring contract hash, score record
  id, score run id, score run sequence, evidence snapshot id) — where run id and run sequence must
  be present or absent **together**.
- Availability and freshness are cross-validated: only a *present* component may be fresh or stale;
  absent, in-progress or terminally-unverifiable components must be *unknown*.
- Reason codes are normalized and non-duplicated.
- The replay identity hash **deliberately excludes** the idempotency key, the spawn count and the
  classification fields, so re-deriving the same decision **replays** instead of conflicting, while
  genuinely different content **fails loudly**.

**(g) The split loop must terminate.** `RULED — DR-020` knob 5: two regeneration rounds — three
attempts — then a typed "not runnable" abstention carrying the rejection evidence. Stage order is
the battery's as written, provisional until the deferred retrieve-first experiment rules (knob 6).
`RULED — DR-019` for the loop caps that bound it: topic cap 7, regeneration cap 2.

**(h) Budget skips are typed and visible.** `RULED — DR-021` knob 9: a budget override is a **typed
skip for enrichment only**; correctness and safety work — provenance, abstention typing,
standard-and-above blind verification, citation routes — can **never** be budget-skipped, and every
skip carries a visible `SKIPPED-BY-BUDGET` marker. `RULED — DR-052`, which extends DR-021: every run
carries a **visible call/cost envelope** derived from asker depth × risk tier; on exhaustion, typed
enrichment skips come first, then a hard stop that serves already-verified components under an
`ENVELOPE_EXHAUSTED` mark — **never a silent timeout**. DR-052 also adds **serve-conformance** to the
protected core, so the conformance judge is not budget-skippable either.

### 7.3 Inputs, outputs, edge cases

**Inputs.** The node's score signal, its optional evidence signal, its path state, the depth and
budget rails, the run's cost envelope, and the frontier priority.

**Outputs.** A typed decision with its reasons and its categorical/scalar class; zero or more new
nodes and arrows created as pending placeholders with the queued work carrying target, polarity and
the decision reason; an **immutable decision record**; and a ledger row for the decision itself
(DR-027).

| Situation | Behavior | Tag |
|---|---|---|
| Input not grounded | Prior state preserved; **zero spawns**; the decision is still recorded | `CARRIED-DESIGN` |
| Decision cannot be classified | Fails closed to scalar; spawns nothing | `CARRIED-DESIGN` |
| Same decision re-derived | Replays idempotently | `CARRIED-DESIGN` |
| Different content under the same idempotency key | **Fails loudly**; never silently overwritten | `CARRIED-DESIGN` |
| Regeneration budget exhausted | Typed "not runnable" abstention with rejection evidence | `RULED — DR-020` |
| Cost envelope exhausted | Enrichment skipped first, then hard stop with `ENVELOPE_EXHAUSTED`; protected core never skipped | `RULED — DR-052` |
| Placeholder child not yet complete | Never served as a claim (§6.2 item 10) | `CARRIED-DESIGN` |

### 7.4 Battery stage owner

**SPLIT** mechanics. `RULED — DR-030 · DR-056(a)`.

---

## 8. Organ 5 — the execution ledger and receipts

### 8.1 Purpose

Make every served number **re-derivable from durable stored evidence**, and make everything the
system actually did **visible**. V ratified V2's trusted-run mechanism *with an extension* (DR-027)
and then made the extension a hard law (DR-034). This organ is where both live. The research noted
that no V2 module is called "trusted-run reconstruction"; the phrase was mapped to the mechanism
below, V confirmed the mapping, and DR-034 settles the question the research left open — whether the
standard is a *property* or a *procedure* — by ruling it is **both**
(`../research/02-scoring-behavior-spec.md` U1).

### 8.2 Exact behavior — the mechanism

All of §8.2 is `CARRIED-DESIGN`: V2 designs re-specified because they work
(`../research/02-scoring-behavior-spec.md` §3).

**(a) The raw artifact is persisted unconditionally, parseable or not.** It stores the raw text, its
hash, the request metadata, the parse status and error, the validated assessment (or nothing),
provider metadata, latency, and a checked-at timestamp. Provider metadata is **allow-listed** before
storage and recursively scrubbed — only an enumerated set of identifier, model, finish-reason and
usage fields survives.

**(b) The input hash defines "the same input".** A hash over canonical, key-sorted serialization of
the version tag, the normalized claim, the argument text, the question asked, and the children
**exactly as the prompt renders them** — in the caller's order, never re-sorted, with the
already-truncated excerpt hashed rather than the source. The motivating property is load-bearing:
**adding an attacking child to a node changes its hash**, so a rescore cannot cache-hit on a
children-blind key and miss the new counter.

**(c) The judge contract is deliberately NOT part of the input hash.** It is a separate column, so
an artifact produced under a superseded contract can share the current input hash and be recognized
as **superseded** rather than colliding with it.

**(d) The contract hash pins meaning.** A judge contract freezes its identity, version, role, rubric
version, prompt version, schema version, reducer version **and the full output schema**, and hashes
exactly those. Any change to the rubric, prompt, output schema or reducer math changes the hash and
invalidates every cached result and artifact, so **old outputs can never be silently reinterpreted
by newer code**. A companion defence carries: the default provenance factory reads the **live**
constants rather than string literals, so a bare record can never mint provenance claiming stale
math.

**(e) Cache identity includes the contract hash, and history is never overwritten.** A changed
contract yields a **new row**; the old contract's row is preserved as historical.

**(f) The four reconstruction paths.**

- **(A) Rebuild from artifacts.** Recompute the claim and input hash from live rows, select the
  newest artifact matching node, input hash, current role, available parse status **and the current
  contract hash**, re-validate the stored assessment against the schema, **re-run the reducer over
  it**, and re-attach plural-judge provenance. Any missing node, missing contract, malformed
  assessment or validation failure yields **nothing** for that node — **never a fabricated score**.
- **(B) Serve a stored public result verbatim.** The deliberate legacy lane for superseded
  contracts. Its two stated invariants carry: it **never re-reduces old assessments through current
  code**, and it **never fabricates a score when nothing was persisted**. Its per-item provenance
  consequences are indicted (§10.4) and must not carry.
- **(C) Resume a partial pass.** When a node is served from cache no judge call runs, so its
  artifacts are re-attributed to the running job — but **only** those whose contract hash matches
  the current active contract **for their own role**, so a resuming run never absorbs an
  out-of-contract judgement.
- **(D) The completeness gate.** Before an aggregated run is persisted, **every** required node must
  have at least one raw artifact under the running job. Missing any → the job fails and **no**
  aggregated run is written.

**(g) Append-only with a total order.** Runs carry a monotonic sequence assigned under a write lock
so same-tick runs are orderable; nothing is ever rewritten. **V2's documented residual must not
carry**: two artifacts sharing a timestamp tick and both unlinked fall through to a random
identifier (`../research/02-scoring-behavior-spec.md` §3.4 path E). V3's ledger ordering must be
**total and deterministic**, never resolved by an arbitrary value — a direct precondition of
DR-034's exact replay.

### 8.3 The replay law and the recording extension

**The replay law.** `RULED — DR-034`. V3 **permanently refuses to serve a number it cannot recompute
from its own frozen records.** Three parts, all binding:

1. **No model in the replay path.** Replay is arithmetic over stored records. A replay that needed a
   model call would be a new judgement, not a reproduction.
2. **Continuously self-tested.** The refusal is exercised as a standing test, so a regression that
   breaks recomputability is caught before it can serve.
3. **One independent replay ceremony at launch.** Recorded runs are replayed independently and must
   pass **exactly** — a launch acceptance criterion, not a development nicety.
   `RULED — DR-060(b) · DR-063(VR-3)` for its scope: **the numbers replay exactly**, where
   "exactly" means **byte-identical served numbers**; the **serve decision replays as stored
   data** — the conformance verdict is an **input artifact** to the replay, never re-generated —
   so the ceremony is deterministic and no model runs inside it. Independence is satisfied by
   DR-063's option (ii).

**What happens when one number will not replay.** `RULED — DR-059`: the number is **evicted** from
the served set and carries a **typed missing-number mark**; the rest of the answer serves under a
`DEFECT` badge. One number is lost, never the answer. This is the precise interaction between this
law and DR-049's components-only mode: the refusal filters the component set, it does not block
the serve.

The law is **V3-internal**: V3 must reproduce **its own** numbers from **its own** records. V2 is
irrelevant to it.

**The recording extension.** `RULED — DR-027`, binding on every organ:

1. **Everything executed is recorded**: every attempt, retry, failure, could-not-do, every abstention
   with its type, every typed condition mark (DR-051), every typed skip including
   `SKIPPED-BY-BUDGET` (DR-021) and `ENVELOPE_EXHAUSTED` (DR-052), every judgement V2 would have
   silently discarded (§5.4), every degraded computation V2 would have swallowed (§4.4).
2. **Two tiers.** Raw tapes are **internal only** — raw judge text never reaches a served item. The
   **digest is user-visible**: what was attempted, what succeeded, what failed and what was skipped,
   in human language.
3. **Consistency law.** If the ledger says a check did not run, no served sentence may imply it did.
4. **Query amendments are typed and visible.** `RULED — DR-008`: a mechanical repair keeps full
   confirmation power; a semantic re-aim is exploration-only and requires re-freezing and re-running.
   Every amendment is logged with its type and reason and is visible at serving.
5. **Human steer is logged verbatim.** `RULED — DR-019` knob 4: every free-text annotation is stored
   word-for-word, typed as human-steer input, and disclosed in the served trail.
6. **Postgres-backed.** `RULED — DR-024`, including the observability layer — §13.

**The inspection handle.** `RULED — DR-054`. The complete fact bundle and the conformance record are
**fetchable on demand through an authorized inspection/replay endpoint** — the handle DR-034's law
hangs on — while the default view carries typed projections only and internal prompt material is
excluded (§9.2j).

### 8.4 Inputs, outputs, edge cases

**Inputs.** Every organ's executions: judge calls and their raw outputs, graph computations,
decisions, spawns, evidence verdicts, skips, failures, human steers, conformance verdicts.

**Outputs.** The internal raw record; the replay-grade run record; the user-visible digest; and the
per-item provenance the serve layer joins to every number.

| Situation | Behavior | Tag |
|---|---|---|
| Crash mid-pass | Partial work is recoverable; resumption absorbs only contract-matching artifacts (path C) | `CARRIED-DESIGN` |
| Aggregated run missing any required artifact | The run is **not** written; the job fails loudly (path D) | `CARRIED-DESIGN` |
| Artifact under a superseded contract | Recognized as superseded, never as a collision | `CARRIED-DESIGN` |
| Two ledger rows in the same tick | Total deterministic ordering — never an arbitrary tiebreak | `CARRIED-DESIGN` |
| A failure anywhere | A ledger row, then a typed result. Never a swallowed exception | `RULED — DR-027` |
| A number that cannot be recomputed from frozen records | **Not servable** | `RULED — DR-034` |
| Replay self-test fails | Serving is blocked, not warned about | `RULED — DR-034` |

### 8.5 Battery stage owner

**All stages write; SERVE reads.** `RULED — DR-030 · DR-056(a)`.

---

## 9. Organ 6 — the serve layer and its internal debug facet

### 9.1 Purpose

Be the one place answers leave the system, and make what leaves honest. `RULED — DR-030(J3) ·
DR-056(a)`: SERVE reads a **new battery serve layer built on the execution ledger**, and V2's
`qbaf_debug` view is re-specified as that layer's **internal debug facet** — an operator-only window
on the graph's internals, never part of the stable contract.

### 9.2 Exact behavior — the serve layer

**(a) Preconditions on serving.** `CARRIED-DESIGN` for the discipline
(`../research/02-scoring-behavior-spec.md` §3.6), `RULED — DR-034` for the last one. Before anything
is served: the stored output must have been produced by the ledger, or it is refused with a typed
reason; the items must be a list, or refused; **every** item must validate, or refused; the status
string must be known, or refused; and no item may reference a node outside the current set, or
refused. Each refusal is a *distinct* typed reason. "Refuse rather than guess" is one of V2's
genuinely good designs and carries in full.

**The replay precondition is per number, not per payload.** `RULED — DR-034 · DR-059`: a number
that cannot be recomputed from frozen records is **evicted** and replaced by a typed missing-number
mark, and the answer serves the rest under a `DEFECT` badge. The refusal filters the component set;
it never blocks the whole serve.

**(b) Sanitizing on the way out.** `CARRIED-DESIGN`. Every item is re-validated; raw judge output is
stripped; debug detail is reduced to declared version fields or dropped entirely; every served
reason string is scrubbed for secret markers and any entry whose reason does not survive the scrub
is **dropped rather than served damaged**. Optional scalars are copied through **only when
well-typed**.

**(c) Coverage reconciliation.** `CARRIED-DESIGN`. Drop items for nodes that are no longer current;
for current nodes with no entry, add **typed pending entries** if work is active and **typed error
entries** otherwise; then recompute the status. **Status is derived, never asserted.**

**(d) Stale work expires on read.** `CARRIED-DESIGN`. Active jobs past their deadline are
transitioned to failed with a typed reason on every read, so a stuck job cannot masquerade as
work-in-progress forever.

**(e) The honest-degradation vocabulary.** `CARRIED-DESIGN`. A missing or malformed input proves
nothing and is read as its honest zero-information value, never guessed; a verdict with no usable
basis degrades to a typed `unavailable` rather than to a number; a lean with no live supporting or
attacking node returns **nothing** rather than a fabricated even split
(`../research/02-scoring-behavior-spec.md` §1.8). The specific V2 gates are indicted (§10.1, §10.4);
their replacements are ruled at §4.4 (OD-07) and §9.2(g) (OD-11); the *discipline* carries.

**(f) Suppression carries its unlock, and shadow mode is the generalizable precedent.**
`CARRIED-DESIGN`. When a verdict is withheld, the reader is told **why in prose** *and* **what would
unlock it**; V2's evidence gate already runs in **shadow mode**, publishing what it *would* have
suppressed beside the unsuppressed band (`coordinator/app/scoring/verdict.py:98-166`). DR-017's
value overlay reuses exactly this shape. `RULED — DR-062 (OD-20)` for eligibility: the gate covers
**every claim type for which external evidence is possible** — the exact complement of §5.2(f)'s
evidence-free composition list, so the two stay consistent by construction rather than by
maintaining a second list — and it is **tiered by risk**, gating more types at high-stakes tiers
than at casual ones, reusing the class × risk-tier structure DR-012 established for abstention
pricing. Causal, comparative and predictive claims are therefore gated, where V2 gated only
empirical ones.

**(g) Obligations the serve layer carries.** Each tagged individually:

- **Per-item provenance travels with every number** — judge identity, contract hash, input hash, run
  identity, freshness, tau source, way of knowing, cluster identity. No aggregate number may stand
  in for per-node labels. `RULED — D4 clause (§10.4)`.
- **The digest of everything executed is part of the served answer.** `RULED — DR-027`.
- **Judge disagreement appears as a flag plus a certainty downgrade** — never a silently averaged
  number, never a refusal to answer. `RULED — DR-032`.
- **One abstention kind, several condition marks**, drawn from the two closed vocabularies with an
  exhaustive mapping table. `RULED — DR-051`.
- **Value-decided segments carry a visible marker naming whose weights**, with `weight_source`
  having no `default` member; mixed questions serve two labeled sections. `RULED — DR-017 · DR-053`.
- **Unresolved type or field auto-serves with a label** — no approval step; the label travels on the
  answer **and in every node's provenance**. `RULED — DR-021` knob 10.
- **Stale or under-review answers serve with a visible badge, never silently.** `RULED — DR-015`.
- **Where independent critique was unavailable**, the answer cannot reach the top confidence band
  and says so, with the lift condition recorded; degraded diversity is labeled.
  `RULED — DR-014 · DR-041(Q31) · DR-055`.
- **Off-subject evidence's downgrade is visible at serving**, with the off-subject share named.
  `RULED — DR-009`.
- **Every served answer names its abstention-price cell** (class × risk tier). `RULED — DR-012`,
  with the Q6/Q56 price dependency satisfied per DR-031.
- **Findings and recommendations render in separate blocks**; a recommendation with no owner in the
  value overlay is a defect, not a style choice. `CARRIED-DESIGN`
  (`../research/32-weight-derivation.md` R7).
- **The fragility table and the leverage ranking are served outputs**, with `LEVERAGE_UNRESOLVED`
  where the deepening bound was hit. `RULED — DR-031(Q46, Q49) · DR-050`.
- **An `UNINSTRUMENTED` fairness verdict blocks the fairness claim**, and the remediation layer — a
  model explaining why the gap exists, grading the effort and suggesting closure — is served
  **openly marked model-authored and biased**, never replacing the verdict; the reader gets an
  investigate-deeper affordance. `RULED — DR-045`.
- **All nine honesty surfaces are served**, and the kept UI's data layer is rebuilt against V3's
  native shapes rather than adapted. `RULED — DR-048`.
- **The one-line summary is a sentence, not a number.** `RULED — DR-062 (OD-11)`: V2's "leans"
  percentage is replaced by a **non-numeric summary** in the top layer — "more supported than
  challenged, on thin evidence" — which satisfies the layout rule that a bare number never appears
  there, and needs no admission constant. Its layer-2 detail carries **per-side provenance**: how
  many nodes on each side were judged, and by whom, so a reader can discount it. V2's admission rule
  ("at least one node in the answer was judged") is retired with the default base scores it existed
  to tolerate.

**(h) Serve composition.** `RULED — DR-044`. Pure rendering was **rejected** as a serving philosophy.
The machine assembles **all** computed facts into one structured prompt; **one composition model**
writes the served text honoring those facts, never reciting the machinery; a **second model** judges
text-against-facts conformance; and the machine **enforces** that verdict. For this organ the
consequence is precise: the facts are the ledger's, the words are the composition model's, and the
conformance judgement is itself a recorded fact.

`RULED — DR-058` for oversized bundles: composition runs **multi-pass by load-bearing priority**
(summarize, then refine), and the honesty-critical fields — residual objections, badges, marks —
are **machine-injected into the output structure outside model discretion**, so silent truncation
is impossible. Past the declared hard budget the answer falls to components-only.
`RULED — DR-060(a)` for how much of the text is judged: **load-bearing sentences are always
judged**; non-load-bearing text is sampled at the frozen stranger rate (DR-052). The protected core
forbids skipping the conformance **role**; it never mandates exhaustive sampling.

**(i) Serve termination.** `RULED — DR-049`. `max_recompose = 2`. After the second conformance
failure the answer serves **components-only** — verified facts, badges, node graph — under a visible
`DEFECT` badge. **Never blank, never unchecked prose.** Gate order is fixed: **R9 (stranger) → Q53
(objection visibility) → conformance → Q51 (provenance)**. The conformance judge may never demand an
edit that violates R9. Q53's residual objection is a field of the fact bundle.

`RULED — DR-057` for R9's two surfaces: **node text is stranger-checked before composition**, as the
gate order says, **and the composed verdict gets its own R9 pass afterwards**. A verdict that fails
its post-composition R9 pass goes to components-only plus `DEFECT` — DR-049's terminal state, with
**no new loop**.

`RULED — DR-059` for what components-only still owes the reader: the **reversal point** and the
**builds-on-previous disclosure** have structured **projection fields that render without composed
prose**, so degraded mode serves them as data rather than dropping the two sentence-shaped honesty
surfaces. Evicted numbers (§8.3) appear here as typed missing-number marks.

**(j) The wire boundary.** `RULED — DR-054`. The browser receives typed honesty **projections** —
badges, marks, provenance summaries, per-node restatements, all nine surfaces. The **complete fact
bundle and the conformance record** are fetchable on demand through an **authorized
inspection/replay endpoint**. Internal prompt material is excluded from the default view.

### 9.3 Exact behavior — the internal debug facet

**Content.** `CARRIED-DESIGN` (`../research/02-scoring-behavior-spec.md` §4.4): the graph
fingerprint; the per-node strengths; the full tau-source map including per-node arrow markers; the
operator identifier **actually used**; the attack arrow list, deduplicated; and the support arrow
list likewise. In V3 the identifier is the recorded run input (§10.2) and the map is the per-node
provenance record (§4.3), not a flat float map.

**Placement and law.** `CARRIED-DESIGN`, with `RULED — DR-054` for the access path. Attached only on
the successful path; absent when not requested; explicitly **not part of the stable wire contract**;
**raw judge output never appears in it**; and reached through the authorized inspection handle rather
than the default payload. Its stated invariant is the important one: **the debug facet can never
affect real scoring.**

**Failure tiers.** `CARRIED-DESIGN` with one `RULED — DR-027` change. Two deliberately different
tiers: an evidence-enrichment failure has its own guard and degrades to "no evidence arrows" while
the block is still produced; any other failure returns a typed unavailable reason **and nothing
else** — no partial strengths. Both carry. The change: each degradation is **a ledger row**, not a
silently swallowed exception.

**Node set.** `RULED — DR-062 (OD-18)`. The debug facet builds its graph over the **identical node
set** the scored graph uses — everything except `stale` — reading the run's declared set rather than
re-deriving one. This removes V2's divergence, where the debug view excluded failed nodes and
therefore showed an operator different strengths and a different fingerprint from the ones actually
served (`../research/02-scoring-behavior-spec.md` §4.6).

### 9.4 Inputs, outputs, edge cases

**Inputs.** The ledger (never the raw compute path directly); the current node set; the active work
state; the conformance verdict.

**Outputs.** The served answer as typed projections plus the execution digest; the fact bundle and
conformance record behind the authorized handle; and, internally only, the debug facet.

| Situation | Behavior | Tag |
|---|---|---|
| Stored output not produced by the ledger | Refuse with a typed reason | `CARRIED-DESIGN` |
| Any item fails validation | Refuse the payload with a typed reason — never serve a partially-valid set silently | `CARRIED-DESIGN` |
| A number that cannot be recomputed | Evicted with a typed missing-number mark; the rest serves under `DEFECT` | `RULED — DR-034 · DR-059` |
| Second conformance failure | Components-only serve under a `DEFECT` badge — never blank, never unchecked prose | `RULED — DR-049` |
| Composed verdict fails its post-composition R9 pass | Components-only + `DEFECT`; terminal, no new loop | `RULED — DR-057` |
| Fact bundle exceeds the declared hard budget | Multi-pass composition by load-bearing priority first; past the budget, components-only. Honesty-critical fields are machine-injected, so truncation is never silent | `RULED — DR-058` |
| Degraded (components-only) mode | Reversal point and builds-on-previous still render, as projection fields without composed prose | `RULED — DR-059` |
| Conformance demands an R9-violating edit | Refused; R9 precedes conformance in the gate order | `RULED — DR-049` |
| Item references a node no longer current | Dropped in reconciliation | `CARRIED-DESIGN` |
| Current node with no result | Typed pending (work active) or typed error (not active) | `CARRIED-DESIGN` |
| A served string fails the secret scrub | The entry is dropped, not served damaged | `CARRIED-DESIGN` |
| Debug enrichment fails | Degrade to "no evidence arrows"; block still produced; ledger row written | `CARRIED-DESIGN · DR-027` |
| Debug computation fails otherwise | Typed unavailable reason and **nothing else** | `CARRIED-DESIGN` |
| A number with no provenance | **Not servable** | `RULED — D4 (§10.4) · DR-034` |

### 9.5 Battery stage owner

**SERVE.** `RULED — DR-030 · DR-056(a)`.

---

## 10. The defect register — five MUST-NOT-REPRODUCE contract clauses

These are the five V2 behaviors V3 is forbidden to have (`../wayfinder/GLOSSARY.md`; DR-026,
DR-028). Each clause gives the mechanism, the V2 evidence at `file:line`, the measured consequence
where one exists, **what V2 already does right that must not be lost with the defect**, and what V3
does instead. Paths are repo-relative to `apps/dialectical-engine/`.

**Two framing notes, both from DR-033.** First, **the evidence documents the diseases; it is not a
conformance target.** Every citation here says "this is what went wrong, and exactly where", so a
designer can recognize the same shape in new code. No V3 test compares against any of it. Second,
**each clause is a property of V3, testable without any V2 artifact** — §12.2 states them as P-D1 …
P-D5, which is what replaces the MUST-DIFFER vector marks DR-028 and DR-026 originally called for.

Not in this register, by V's steer: "no outcome memory", dead checks, and the discarded strongest
objection. One of those has since been ruled separately — **the dead disagreement check is governed
by DR-032** and lands in §5.2(i), not here.

### 10.1 D1 — no judgement, no number. All four variants

`RULED — DR-028`. *No judgement and no magnitude ⇒ no number, ever. A typed, visible record takes
its place.*

| Variant | Mechanism | V2 evidence |
|---|---|---|
| **D1(a)** adapter default | Any node with no judge score is silently given a base score of 0.5, then indistinguishable inside the aggregation from a measured one. | `coordinator/app/qbaf/debate_adapter.py:20`; `:84-92`; `:303-308`. Second, independent pair on the experimental path: `coordinator/app/qbaf/model.py:30-31`. |
| **D1(b)** both `or 0.0` serving paths | An absent score is coerced to zero mass and summed as if measured; unscored branches are ranked as strength zero. | `coordinator/app/scoring/lean.py:141-142`; `coordinator/app/services/dialectical_v2.py:1502` |
| **D1(c)** branch-summary 0.0 | A missing or non-numeric score field becomes 0.0 for branch summarization and ranking. | `coordinator/app/synthesis/branch_summary.py:243` |
| **D1(d)** invented 0.7 for contradicted evidence | A contradicting verdict has **no magnitude the verifier vouches for** — its own schema requires the evidence object absent unless the verdict is "supported" — so V2 substitutes a declared constant. | `coordinator/app/qbaf/debate_adapter.py:60`, applied at `:95-128`; the schema clause at `coordinator/app/scoring/prompts.py:9-71` |

**Measured consequence.** A root plus four **unjudged** children, every base score defaulted,
produces a root strength of **0.96875** — V2's own test at
`coordinator/tests/test_debate_graph_adapter.py:398-416`, recomputed from the formulas:
`agg([0.5]×4) = 1 − 0.5⁴ = 0.9375`, then `σ(0.5, 0, 0.9375) = 0.96875`. With five such supporters it
is **0.984375** — the audit's "about ninety-seven percent confidence, from the shape of the map
alone". Subtler replay: a parent with one **judged** 0.80 supporter sits at 0.900; add three unjudged
siblings at the silent 0.5 and it reads **0.9875** (`../research/32-weight-derivation.md` S9).

**What V2 does right and must not be lost.** Provenance *is* recorded per node as a tau source
(`coordinator/app/qbaf/debate_adapter.py:308`) and persisted
(`coordinator/app/protocol/runner.py:252`); an aggregate coverage number is computed (`:243-248`) and
used as a band gate, below which the verdict band becomes `insufficient_scoring` with the honest
sentence that an all-default run's strength is a topology artifact, not evidence
(`coordinator/app/scoring/verdict.py:38-44, 256-264`); and a malformed coverage value is read as
zero, never guessed (`verdict.py:244-255`).

**Why that is not enough.** The gate is aggregate and band-level only. The fabricated number is still
served in the verdict's basis (`verdict.py:285`) and printed inside the `insufficient_scoring`
language as a "structural reading for transparency" (`verdict.py:262-263`); the lean meter's gate is
merely "coverage above zero" (`coordinator/app/scoring/lean.py:140`), so one judged node in a hundred
licenses a "dialectical" reading built from ninety-nine invented ones; and at half coverage a
`supported` band can still ship with half its base scores invented.

**What V3 does.** M1 (§4.2e): no default τ at any layer; an unjudged node emits no arrow and carries
a typed record whose kind the model chooses and the machine enforces (DR-044 Q55, DR-051); the parent
lands on exactly the value its judged children justify. For D1(b) and D1(c): an absent score is
**absent**, not zero — it may not enter a sum, a mass or a ranking as a number. For D1(d): a verdict
carrying no magnitude yields no magnitude — in its place, `RULED — DR-062 (OD-04)`, an attack arrow
with a **typed unknown magnitude** that is visible to the reader and contributes nothing to the
arithmetic (§6.3).

### 10.2 D2 — the aggregation choice is a recorded input, never a source literal

`RULED` as a defect clause; the remediation path is `RULED — DR-040(Q45) · DR-031(Q47)`.

**Mechanism and evidence.** Three variants are registered
(`coordinator/app/qbaf/semantics_versions.py:4-11`); the production path selects one by a **literal
in the source** (`coordinator/app/protocol/runner.py:188`), calls the adapter **without** a semantics
argument so the default is always used (`:191-193`), then stamps that same literal onto the persisted
run (`:254, 376`). The switch is at `coordinator/app/qbaf/debate_adapter.py:265-269`. The **only**
runtime override in the whole system is a debug environment variable, itself read only when the debug
view is on (`coordinator/app/scoring/qbaf_debug.py:108`; `coordinator/app/scoring/service.py:287`). A
third variant is stamped on a separate in-memory path by a literal that **does not describe the
computation that produced it** (`coordinator/app/api/qbaf.py:83`).

**Measured consequence.** The identical tree with identical base scores yields root **0.96875** under
the production variant and **0.5** under the registered alternative
(`coordinator/tests/test_debate_graph_adapter.py:409-415` and `:419-427`) — `supported` versus
`contested` from the same judgements. The mechanism is visible in the arrow tables: under the
production variant every perspective container emits a **support** arrow into the root; under the
alternative a container emits **no arrow** and its arguing descendants lift to the nearest
argumentative ancestor, so counter-arguments that the production variant buried under a "supporting"
lens become **real attacks on the root** (`coordinator/app/qbaf/debate_adapter.py:42, 148-149` versus
`:223-239`).

**What V2 does right and must not be lost.** The variant is stamped on every persisted run; the
fingerprint is salted with any non-default identifier so runs under different rules can never be
confused (`coordinator/app/qbaf/debate_adapter.py:334-335`); convergence **refuses to compare** across
a semantics change (`coordinator/app/protocol/runner.py:293-305`); and version registration is honest
— an unknown identifier **raises** rather than silently defaulting
(`coordinator/app/qbaf/semantics_versions.py:14-19`).

**What V3 does.** With one engine (DR-030 J1, DR-056a) the remediation lands on the **per-parent
operator**: declared by policy or a human at zero model cost, or by one bounded declaration call, and
where no declaration results the parent number is withheld and components are served (DR-040); the
rival reading is computed and served where it flips the band (DR-031 Q47). `RULED — DR-062 (OD-22)`
for scope: a resolution chain — per parent, then run, then deployment — with the level that supplied
the effective value recorded on the number (§4.2f).

### 10.3 D3 — counting is by provenance, not by string

`RULED` as a defect clause. *Two items count as one when their provenance says they are one. Shared
source is deterministic and **gates**: count a cluster once, conservatively at the strength of its
strongest member, never the sum. Shared assumption is a **flag**, never a gate.*

**Mechanism.** Every deduplication in V2 is byte equality — of an arrow tuple, an identity tuple, or a
raw-output hash. Nothing anywhere compares meaning, so two sub-claims saying the same thing in
different words count twice, and the probabilistic sum converts that repetition directly into
strength.

**Evidence — the complete inventory** (`../research/02-scoring-behavior-spec.md` register (c)):
`coordinator/app/qbaf/dfquad.py:92-98`; `coordinator/app/qbaf/semantics.py:81-103`;
`coordinator/app/scoring/service.py:1589-1605`; `coordinator/app/scoring/disagreement.py:229-260`;
`coordinator/app/scoring/judge_panel.py:60-69`; `coordinator/app/scoring/calibration.py:86-99`;
`coordinator/app/evidence/verification_evaluator.py:225-239`;
`coordinator/app/scoring/jobs.py:387-405`; `coordinator/app/api/scoring.py:558-568`. And one site with
**no dedup check at all**: `coordinator/app/evidence/extraction.py:177`, so re-extraction duplicates
evidence leaves and inflates the distinct-source count.

**Measured consequence.** A single supporter at strength **0.40**, restated a second and third time,
aggregates to **0.64** and then **0.784** — reproduced exactly from the formula. Under cluster
collapse the three contribute **0.400** (`../research/32-weight-derivation.md` M3/S5).

**The nearest thing V2 has, and why it does not count.**
`coordinator/app/evidence/independence.py:127-150` counts distinct source-domain and method pairs
across a claim's evidence children — but its own docstring says it measures *sourcing breadth, never
truth*, it deliberately excludes the producing model family, and it **gates nothing**: its only
consumer is serialization (`coordinator/app/services/serialization.py:298-307`).

**What V3 does.** Cluster collapse as the gate (§4.2g), with the key ruled at
`RULED — DR-062 (OD-09)` — study or dataset identity plus producing model family, domain and
publisher as fallbacks, run identity always — siblings that restate each other without shared
provenance **flagged and never gated** (`RULED — DR-062 (OD-08)`), and sibling counting left
**uncapped** with clustering as its only control (`RULED — DR-062 (OD-01)`).

### 10.4 D4 — every served number carries its own provenance

`RULED` as a defect clause. *Every weight-bearing number travels with its own kind, source and
producer. No aggregate number may stand in for per-item labels. A payload-level label that a per-item
fact contradicts is forbidden.*

**Mechanism.** Provenance is computed and persisted — and then **no serving path reads it per item**.
Numbers derived from measured judgements and numbers derived from defaults are summed, averaged and
displayed through the same channel with nothing on the served artifact distinguishing them.

**Evidence** (`../research/02-scoring-behavior-spec.md` register (d)):
`coordinator/app/protocol/runner.py:249-259` — strengths are a **flat** node-to-float map and tau
sources are persisted **beside** it, never joined to it. `coordinator/app/scoring/lean.py:140-146` —
sums strengths with **no per-node source check**, gated only on debate-wide coverage above zero, and
labels the result as a strength reading. `coordinator/app/scoring/verdict.py:209-296` — reads only the
root's strength and the aggregate coverage; the basis never carries the root's own tau source, and the
"majority source" field is derived from the aggregate number rather than any node's actual label.
`coordinator/app/scoring/service.py:399-439` — the legacy hydration lane selects a stored result
**without any contract-hash predicate** and serves it verbatim as available (`:437` hardcodes the
status), with **nothing per item** marking it as produced under a superseded contract; a mixed payload
where one item hydrated freshly reports the fresh producer label **for the whole payload**
(`:313-320`). `web/components/VerdictBanner.tsx:90` and `web/lib/types.ts:594` — the UI's only
provenance surface is the aggregate coverage number, and a repo-wide search of `web/` finds **no**
consumer of tau sources, score provenance, judgment mode, judge families or reducer version.

**Structural root cause.** The provenance object itself
(`coordinator/app/scoring/models.py:346-353`) declares only the output kind, an "included: false"
assertion, the score source and two version strings — **no judge identity, no judge version, no
contract hash, no input hash, no run id, and no per-node tau source**.

**What V2 does right and must not be lost.** Provenance is genuinely *recorded*, always and honestly:
per-node tau sources (`coordinator/app/qbaf/debate_adapter.py:308`); a run-level check that refuses to
serve a payload not produced by judge outputs (`coordinator/app/scoring/service.py:177`); always-on
lineage recording that never fabricates independence
(`coordinator/app/scoring/lineage.py:97-137`); calibration weights and judgment mode recorded **even
when only one judge ran** (`coordinator/app/scoring/service.py:1338-1349, 1435-1439`); an uncertainty
source distinguishing measured dispersion from the heuristic checklist
(`coordinator/app/scoring/models.py:36-58`); a strength kind distinguishing the two compositions; and a
secret scrub on every served string (`coordinator/app/scoring/lineage.py:140-149`). **The defect is the
join, not the recording.**

**What V3 does.** The per-node record replaces the flat map (§4.3) and is served per item (§9.2g), now
as typed projections with the full bundle behind an authorized handle (DR-054). This clause and
DR-034's replay law are two halves of one property: **a number you cannot attribute is also a number
you cannot recompute.**

### 10.5 D5 — judge weight is earned, not declared

`RULED — DR-026`. *V3 implements real judge weighting fed by outcome memory. A weighting system whose
learning path is unreachable is forbidden.*

**Mechanism and evidence.** V2's calibration has a configuration-override branch that can never
execute, because the caller passes no configuration: `coordinator/app/scoring/service.py:1403` invokes
the weight function with `config=None` unconditionally, so
`coordinator/app/scoring/calibration.py:35-48` always returns weight 1.0 with source `cold_start` and
**never** anything learned. Every judge counts exactly the same forever, regardless of track record.
V2 self-documents this in the composition note stamped onto every persisted run —
`modelWeight=constant-1.0(P8)` (`coordinator/app/protocol/runner.py:249-259`, note text at `:256-257`).

**What V2 does right and must not be lost.** The honesty. The weight source is labelled `cold_start`
and **never** claims to be learned; the correlated-error discount's properties are declared and
conservative (`coordinator/app/scoring/calibration.py:51-107`); weights are recorded **even when only
one judge ran**; and raw provider and model strings are never embedded in a served weight record.

**What V3 does.** `RULED — DR-026 · DR-046`: weight comes from the outcome store the staleness and
liveness rulings establish (DR-015, DR-016), consumed as per-model scorecards driving weighting and
diversity-routing, with a mandatory exploration share, a probation period for new models, and a model
ledger in Postgres (§5.2k). A cold-start weight remains permissible **while honestly labelled cold and
while the learned path is reachable**; the **cold-start exit must demonstrably execute** — DR-046
names that explicitly as D5's lesson. **DR-032 rides on this clause**: real weights are the
precondition for a disagreement flag that can actually fire (§5.2i).

---

## 11. The eight Proposal-B house rules, carried as required behaviors

`RULED — DR-029`. All eight of V2's standing product laws carry into V3 as required behaviors. Where
a battery successor is stronger, the **successor governs and the house rule is the floor**. Three have
no battery equivalent and survive explicitly, enforced by battery machinery. Rule text is V2's own, at
`AGENTS.md:64-88`.

**Each is a testable gate, and they are layer 3 of V3's self-test base** (§12.2): a house rule that
cannot be expressed as a gate is a house rule V3 cannot prove it kept.

| # | House rule (carried behavior) | Battery successor | Standing |
|---|---|---|---|
| **H1** | **Provider-agnostic agents.** All scoring, debate, evidence, metareasoning and orchestration code calls one provider interface rather than importing or invoking model SDKs or CLIs directly. | **None** — survives explicitly. | Rule governs. It is the precondition for DR-013's lineage law and for DR-046's routing: "different maker" and "route to the next-best model" are only enforceable if provider identity is a first-class configured value rather than an import. |
| **H2** | **A second provider is addable through configuration** — through the provider layer plus configuration, **without changing** agent, scorer, evidence or semantics code. | DR-019 knob 3's blind-verification coverage; DR-014's no-second-lineage path; **DR-055's launch gate**. | Successor governs; rule is the floor. DR-055 raises the stakes: standard-and-above tiers must execute real different-maker critique from day one, so the configuration swap is now a launch dependency, not a convenience. |
| **H3** | **Pure propagation.** The graph-scoring math contains no model calls, no file or network I/O, no clock, no randomness and no database access. | **None** — survives explicitly. | Rule governs, and DR-034 makes it structural: **replay with no model in the path is impossible unless the math is pure.** V2 enforces purity with a test (`coordinator/tests/test_debate_graph_adapter.py:31-56`); V3 needs the equivalent as a standing gate. |
| **H4** | **Swappable semantics.** The default gradual semantics lives behind a strategy interface so another implementation can replace it. | **None** as a battery row — survives explicitly — but doubly load-bearing now: D2 forbids selecting by source literal (§10.2), and DR-040 plus DR-031's Q47 require both operators to exist and both to be computable on demand. | Rule governs, strengthened. The rival operator must be computable so its reading can be served beside the deciding one. |
| **H5** | **Every leaf is gated by the evidence subsystem.** Evidence leaves that cite sources receive base scores from the evidence pipeline, not from a model assertion. | DR-009's mixed admissibility rule; DR-020 knob 7's eight typed citation failure routes; DR-044's Q51 locator gate and reasoning-only downgrade; DR-038's Q35/Q37 two-field record with zero-weight-with-retention and repair/bound/exclude as enforced gates. | Successor governs; rule is the floor. |
| **H6** | **Anonymize debate sources.** Agent identity is stripped before another debate role reads prior turns. | DR-019 knob 3's blind verification; DR-013/DR-014; DR-041's rival carver selected for measured behavioral difference. | Successor governs; rule is the floor — anonymization is the mechanism that makes "blind" true rather than merely claimed. |
| **H7** | **The skeptic certifies that no unaddressed attack remains.** A node is not converged until the skeptic hook passes. | DR-041's defeater obligation (a node is incomplete until its defeater set is non-empty or exhaustion-marked); DR-049's gate order, which puts Q53 objection-visibility ahead of conformance; the residual-objection field (§6.2 item 12). | Successor governs; rule is the floor. This is also the repair for the audit's "strongest objection computed and discarded". |
| **H8** | **Confidence-driven, cost-soft.** Stop conditions are driven by convergence, unresolved caveats and skeptic certification; cost is a **soft tie-breaker**. | DR-021 knob 9 and **DR-052's cost envelope** (typed enrichment skips first, then a hard stop serving verified components under `ENVELOPE_EXHAUSTED`, with a protected core that now includes serve-conformance); DR-020 knob 5's bounded regeneration; DR-050's K=1 deepening bound; DR-010/011/012's abstention price. | Successor governs; rule is the floor. |

**Convergence, specifically.** `CARRIED-DESIGN`. V2's run-to-run convergence machinery — typed
non-comparison reasons (first evaluation, semantics changed, topology changed, strengths unavailable),
a maximum-delta comparison over the overlapping node set, the refusal to compare across a semantics
change, and an explicit changed-evidence-topology detector — carries as the measurable half of H8
(`../research/02-scoring-behavior-spec.md` §1.7 step 5). Its epsilon and defaults are register rows
(DR-023), drawn fresh.

---

## 12. V3's test base, and the open decisions that remain

### 12.1 The governing rulings

`RULED — DR-033`. V ruled: *"nothing from V3 must match V2; starting fresh, never look back at what
was already debated; V2 serves as reference; V3 must be much better."* The cascade:

1. **The MUST-MATCH class is dead.** V2 output conformance is not a V3 requirement anywhere.
2. **V3's math is tested against literature vectors plus V3-spec property tests.** The D1–D5
   prohibitions become **properties of V3 itself** — no invented numbers, real weighting — testable
   without any V2 vector.
3. **Ticket 27, the V2 vector recorder, is out of scope.** Its premise — protect equivalence with V2
   — is void, and divergence is sanctioned. DR-024's clause naming that recorder "the sole
   scoring-ground-truth source" is superseded with it.
4. DR-003's clean-room re-specification **stands**; what died is only the obligation to reproduce
   V2's outputs.

`RULED — DR-047`. V then retired the comparison itself: *"we are not interested in competing with V2
— it's not live, it's a prototype."* No formal race, no frozen victory criteria, no control-arm
ceremony, no matched-cost law, no V2 pin. Humans compare outputs **informally, at will**. DR-047
supersedes DR-033's own race-arm clause and reduces DR-025 to a single surviving use: the definition
of what "the V2 reference" means — as-shipped production, flags off, failed nodes included. The
fourth spec-pack artifact is the **V3 Quality Charter**, whose five acceptance themes are: the best
dialectical engine to date judged by V on outputs; human-oriented answers with the stranger law as
acceptance test; a clean, maintainable codebase; **no orphaned modules** — everything shipped is
reachable and called; and research-upgradeability without re-architecture.

Two questions this manifest previously held were rerouted there: **the verdict band thresholds**
(§12.4, OD-13) and **the acceptance bar for DR-032's "must demonstrably fire"** (§5.2i) are charter
acceptance items, authored with the spec.

### 12.2 The four layers of V3's test base

**Layer 1 — external ground truth.** The two published literature vectors (§4.5), reproduced exactly,
plus the corrected monotonicity and determinism properties with their strictness preconditions
encoded in the generators. These are the authors' numbers, not V2's, and carry zero contamination.

**Layer 2 — the defect prohibitions, as properties of V3.** Each replaces a MUST-DIFFER vector mark
with something stronger: a rule that must hold for *every* input, checkable with no V2 artifact
present.

| Property | Statement | How it is checked |
|---|---|---|
| **P-D1** | No code path can produce a base score in the absence of a judgement. | Generate graphs with arbitrary unjudged subsets; assert no number exists for an unjudged node, and that each parent's value equals the value computed from its judged children alone — §4.2(e)'s identity-element argument makes this exactly checkable. |
| **P-D2** | The operator is a declared, recorded input, emitted by the component that computed the run; no production selection path reads a literal. | Assert both operators are computable on demand and produce different recorded identifiers; assert the identifier travels with the result; assert that where the rival operator flips the band both readings appear (DR-031 Q47); assert an undeclared parent takes DR-040's path rather than a default. |
| **P-D3** | Counting is by provenance: N restatements sharing a provenance key contribute exactly once, at the strongest member. | Property test over generated sibling sets — the 0.784 → 0.400 collapse computed from V3's own arithmetic. |
| **P-D4** | Every weight-bearing number in a served payload carries its own kind, source and producer; no payload-level label may be contradicted by a per-item fact. | Assert a number with no provenance is unservable; assert a mixed-freshness payload reports freshness per item; fuzz payload assembly for aggregate labels that contradict item facts. |
| **P-D5** | Judge weight is a function of recorded outcomes, and the learned path is reachable. | Feed recorded outcomes; assert at least one judge's weight moves; a weight constant under all outcome histories fails. DR-046 states the same requirement from the other side — **the cold-start exit must demonstrably execute**. Paired with DR-032's fire requirement, whose bar is `RULED — DR-063 (VR-1)`: shown to fire both ways before adoption, fired at least once by launch, rate-consistency monitored thereafter. |

**Layer 3 — house-rule gates.** Each of H1–H8 (§11) as a standing test: the provider-interface
boundary; the second-provider configuration swap (now a launch dependency under DR-055); **purity of
the propagation math**, which is also DR-034's precondition; operator swappability; the evidence-gated
leaf; source anonymization before a role reads prior turns; the defeater/objection-visibility
certification as a serving precondition; and cost as a tie-breaker rather than a driver.

**Layer 4 — law gates.** The rulings that are directly checkable:

- **DR-034 replay** — a continuous self-test that every servable number recomputes from frozen records
  with no model in the path, plus the **launch ceremony**: one independent replay of recorded runs
  that must pass exactly.
- **DR-027 ledger completeness** — every executed thing has a row; the digest is user-visible; no
  served sentence implies a check the ledger says did not run.
- **DR-049 serve termination** — `max_recompose = 2`, gate order R9 → Q53 → conformance → Q51, and a
  components-only serve under a `DEFECT` badge rather than blank or unchecked prose.
- **DR-051 partition law** — the exhaustive mapping table exists and leaves no residue; one abstention
  kind and several condition marks per answer.
- **DR-052 cost envelope** — visible envelope, enrichment skipped before any hard stop, protected core
  never skipped, stranger-sample rate frozen at run start.
- **DR-018/DR-019 stranger coverage** — load-bearing nodes exhaustively restatable, sampling derived
  from the asker's run parameters, ratcheting on the *next* run.
- **DR-017 overlay detachment** — recompute every strength with the value overlay detached and assert
  byte-identity, as an enforced invariant rather than a convention.
- **DR-009 / DR-012 / DR-014 / DR-021 / DR-045 / DR-050 / DR-055** — the off-subject downgrade is
  visible; every answer names its abstention-price cell; a missing second lineage caps, labels and
  records a lift path; every budget skip and unresolved-type fallback carries its label; an
  `UNINSTRUMENTED` verdict blocks the fairness claim; `LEVERAGE_UNRESOLVED` appears where the
  deepening bound was hit; multi-maker critique executes at standard-and-above tiers.

**Scenario coverage.** V3's property tests should exercise at least the shapes research/03
inventoried, read as **test scenarios rather than recorded pairs**
(`../research/03-golden-vector-plan.md` §Vector families): single node; shallow-wide fans; deep chains;
realistic mixed graphs; degenerate and error graphs; container and pass-through shapes;
evidence-verdict variants; base-score extremes; the mediating-function tie boundary; arrow-strength
extremes and conflicts; float accumulation order; unjudged subsets; the dedup ladder from
byte-identical through whitespace, case, Unicode and paraphrase; judge-output duplication both
byte-identical and one-byte-apart; abstention and degradation paths; operator-selection variants;
mixed-provenance payloads; the reducer's compositions, caps, ladders and orderings; banding and
suppression; and the normalizer's classification, scope and ambiguity behavior. **None carries a V2
expected output.**

### 12.3 What V2 is still good for

Two uses, both reference (DR-033, DR-047):

1. **The diseases.** §10's `file:line` evidence documents what went wrong and exactly where, so a
   designer can recognize the same shape in new code.
2. **Design source material.** The organ specifications in §§4–9 were extracted from V2's observable
   behavior. That is where the designs came from; it is not what they are measured against.

**Informal comparison** remains available to humans at will — V2 is a prototype that is not live, and
looking at its output is allowed. What no longer exists: a formal race, a control arm, frozen victory
criteria, a matched-cost law, a V2 pin, or any conformance test at any level.

### 12.4 The register — RATIFIED AND CLOSED

**Status: closed.** `RULED — DR-062`: at the register review of 2026-08-05, V **ratified all 17
rows wholesale**, adopting each row's seat proposal as the ruling **by reference to the option text
in the row itself**. Every one is now normative in its organ section. **Zero rows remain open, and
this artifact's readiness gate is met** — the closure rule ("a register closes when every row has a
ruling") having been ratified by V implicitly at that review
(`../reviews/merge-verdict-pack.md` ORCH ROUTING ADDENDUM item 4).

**Why the rows are still printed.** DR-062 ratifies by reference, so the option text below **is** the
content of the ruling — deleting it would delete the definition of what was adopted. Each row is kept
intact and stamped with the option V took and the section where it now binds. What has been removed
is the pre-ruling apparatus: the `SEAT-PROPOSAL` label (those proposals are now rulings) and every
"safe interim" (replaced by the ratified law).

**How to read a row.** Each keeps the four-part shape the pack review required
(`../reviews/merge-verdict-pack.md` disposition D; `../reviews/ReviewLens-Hermes-pack.md` finding 5):
**what was being decided** in plain words, **what follows** from it, **the complete options with
their trade-offs**, and the **adopted option**. No row requires opening a research file; every term a
row uses is defined inside that row.

**Routing record.** The 17 rows were formally routed to this register review by
`../reviews/merge-verdict-pack.md` ORCH ROUTING ADDENDUM item 1 (2026-08-05), and ruled there by
DR-062.

**Closed and rerouted earlier** (six rows, resolved before the register review):

| Row | Disposition |
|---|---|
| **OD-10** — operator fallback when none is declared | **CLOSED — DR-040(Q45).** Policy- or human-declared operator costs zero model calls; an undeclared parent gets one bounded declaration call; where no declaration results, the parent number is withheld and the components are served. Promoted into §4.2(f). |
| **OD-13** — verdict band thresholds | **REROUTED — DR-047**, then ruled there: `DR-063 (VR-2)` fixes the **verdict model's names and its per-cell principle** and **defers every number** to V's flag-register ratification (DR-023). Tracked in artifact 4's register and the flag register, not counted here. |
| **OD-14** — a value-conditional verdict state | **REROUTED.** DR-053 fixed the serving shape (one answer, two labeled sections, machine-enforced phase order, typed dual settlement act) and DR-043 fixed criteria authorship. The residue — the verdict-state **token** and its allowed combinations — belongs to the single canonical verdict model the pack review assigned to the GLOSSARY and to V's `OD-C-01` ruling (`../reviews/merge-verdict-pack.md` disposition C). |
| **OD-15** — which typed non-answer a node wears | **CLOSED — DR-044(Q55) + DR-051.** The model chooses the kind ("the mapping IS a judgment"), the machine enforces exactly-one plus ledger consistency, and the partition law separates the five abstention kinds (ignorance-ledger unknowns only) from the closed condition-marks enum. Promoted into §5.2(m). |
| **OD-21** — the un-fireable disagreement gate | **CLOSED — DR-032**, bar set by **DR-063 (VR-1)**. V3 implements a working, fireable flag serving as flag plus certainty downgrade; the bar is shown-to-fire-both-ways for adoption, fired at least once by launch, rate-consistency monitored thereafter. Promoted into §5.2(i). |
| **OD-23** — cycle policy | **CLOSED — DR-056(b) + DR-042.** Three layers: construction refuses cycle-closing arrows and redirects to a typed shared-crux sub-claim with "circular dependency found" served as information; typed compute-time error; rejection at write. Promoted into §4.2(d), §4.4, §6.3, §6.4. |

---

#### OD-01 — Does the engine cap how many supporters can count?

**What is being decided.** When a claim has several supporting children, the engine combines them
with the probabilistic sum: each new supporter closes part of the remaining gap to 1. Nothing today
limits how many supporters may contribute. The decision is whether to leave that uncapped, to count
only the strongest few, or to use a rule that ignores count entirely.

**What follows.** Whether many weak supporters can outweigh one strong one, and therefore how easy it
is to raise a claim's score by splitting one argument into several. Worked from the engine's own
arithmetic: six supporters each at strength 0.30 aggregate to **0.882**, which is within two points
of a single supporter at **0.900**. Splitting one argument into six mediocre ones is currently the
cheapest route to a high score.

**Options.**
(a) **Uncapped**, controlled only by provenance cluster collapse (§4.2g) — cheapest, changes nothing
in the engine, and relies entirely on the clustering key (OD-09) to catch inflation; it does not
catch six genuinely independent weak items.
(b) **Top-k per polarity** — aggregate only the k strongest children on each side. Simple and
effective, but k is a naked constant that will flip verdicts, and DR-039 forbids adopting a number
without facts behind it.
(c) **Count-insensitive rule** (for example, take the maximum instead of the probabilistic sum) —
kills the inflation outright, but also kills genuine corroboration, and it **breaks both literature
vectors in §4.5**, which would have to be re-derived.

**Adopted — `RATIFIED (DR-062)`: option (a).** Uncapped counting, controlled only by cluster
collapse; no cap constant is introduced. It preserves the published mathematics and puts the burden
on a mechanism ruled in the same sitting (OD-09); measured outcomes showing clustering failing to
catch inflation are the fact base DR-039 would require before a cap is reconsidered. **Now normative
at §4.2(g).**

---

#### OD-02 — What happens beneath an unjudged interior node?

**What is being decided.** A node with no judge assessment contributes nothing and emits no arrow
(§4.2e). That is unambiguous for a **leaf**. It is ambiguous for an **interior** node — one that sits
between the root and judged descendants. The question is whether its judged descendants still reach
the root through it.

**What follows.** Whether a whole branch of judged, evidenced work disappears from the answer because
the node above it was never judged. Worked example: the root has one unjudged interior node, which
has two judged children at strength 0.6 and 0.8. Under (a) those two reach the root and lift it;
under (b) the root never hears from them and reads as though that branch does not exist.

**Options.**
(a) **Transparent** — the interior node emits no arrow of its own, and its children's arrows attach
to the nearest judged ancestor instead. Judged work always reaches the answer; the cost is that an
unjudged node silently changes the graph's shape, which must then be visible at the node and in
provenance.
(b) **Subtree excluded** — nothing beneath an unjudged node contributes. Simplest and most
conservative; the cost is that real evidence can be discarded because of a scheduling gap rather than
an epistemic one.
(c) **Derive the interior node's base score from its children** — rejected on its face by D1's law:
that is a number computed from nothing, which is the defect the register exists to prevent.

**Adopted — `RATIFIED (DR-062)`: option (a)**, with a visible marker at both the lifted child and the
skipped node. (b) loses measured work; (c) violates D1. **Now normative at §4.2(e)**, with the
markers required at §4.3.

---

#### OD-03 — Is a perspective container a scored node or a folder?

**What is being decided.** V2 groups an answer's branches under "perspective" nodes — one per angle
of attack, such as a scientific angle or an ethical one. The question is whether such a node is a
**claim in its own right** (with its own base score and its own arrow into the root) or a **grouping
device** that carries no score and emits no arrow.

**What follows.** It changes the root's number outright, and it changes what a reader sees. Measured
in V2's own tests on the identical tree: with containers scoring and emitting support arrows the root
reads **0.96875**; with containers as pass-through folders whose children re-attach above them, the
root reads **0.5** — `supported` versus `contested` from the same underlying judgements
(`coordinator/tests/test_debate_graph_adapter.py:409-415`, `:419-427`). For the reader, a scored
container also means an extra claim to restate under the stranger law.

**Options.**
(a) **Scored claim** — the container asserts something ("this angle supports the conclusion") and is
judged like any node. Honest only if the container's claim is real and a judge actually assesses it;
under §4.2(e) an unjudged container contributes nothing, so this option interacts with OD-02.
(b) **Folder only** — the container carries a perspective identity and a label, emits no arrow, and
its children attach to the nearest real claim above. No invented intermediate number; the cost is
that "this whole angle is weak" has no single place to live.
(c) **Either, declared per container** — most expressive, most to explain, and a per-container flag
that changes the root's number is exactly the kind of undeclared switch D2 indicts unless it is
recorded and printed.

**Adopted — `RATIFIED (DR-062)`: option (b).** Folder only: a perspective node carries identity,
label and text, emits no arrow, and its children attach to the nearest real claim above. A folder
cannot fabricate a number, and the "weak angle" summary is served as a computed roll-up rather than
a scored node. **Now normative at §6.2 (item 9) and §6.3.**

---

#### OD-04 — What does a contradicting evidence verdict produce?

**What is being decided.** When the evidence verifier reads a source and concludes it **contradicts**
the claim, its output schema gives no number: the schema only carries a score on the *supported*
branch (`coordinator/app/scoring/prompts.py:9-71`). V2 invented the constant 0.7 to fill the gap,
which is defect D1(d). The decision is what V3 puts there instead.

**What follows.** Whether contradicting evidence can lower a claim's score at all, and if so by how
much and on whose authority. Under (a) a source that flatly contradicts a claim has no arithmetic
effect and appears only in prose; under (c) the verifier is asked to do more work on every check.

**Options.**
(a) **No arrow** — the contradiction is recorded, served and visible, but contributes no number.
Perfectly honest and matches V2's fail-closed treatment of every other non-supported status; the cost
is that the strongest kind of counter-evidence moves nothing.
(b) **An attack arrow with a typed unknown magnitude** — the arrow exists and is visible, and the
engine treats an unknown magnitude as contributing nothing while the reader sees the attack. Keeps
the graph honest and the picture complete, but requires the engine to carry an arrow that does not
transmit — a new shape.
(c) **Extend the verifier to report a magnitude it can vouch for** — the contradiction gets a real,
sourced number. Best outcome, most work, and it must clear DR-039: the magnitude has to be grounded
in something measured, not asserted.

**Adopted — `RATIFIED (DR-062)`: option (b) now, option (c) as its successor.** An attack arrow
carrying a typed unknown magnitude: visible to the reader, contributing nothing to the arithmetic.
(c) — extending the verifier to report a magnitude it can vouch for — can replace it later without
changing the graph's shape, subject to DR-039's fact bar. **Now normative at §6.3 and §10.1.**

---

#### OD-05 — How does the strict-and operator treat ties and empty sides?

**What is being decided.** Two operators combine a parent's children (§4.2f): **accumulate**, where
each supporter closes part of the gap to 1, and **strict-and**, where the children's strengths are
multiplied because *all* of them must hold. Accumulate's behavior is fully specified by the published
mathematics, including the case where attack and support exactly balance (the parent keeps its own
base score) and the case where a side is empty (it contributes nothing). Strict-and has no such
published definition here. The decision is what strict-and does when the two sides balance, and what
its "nothing here" value is.

**What follows.** Whether a strict-and parent can be computed at all when some children are missing
or abstained, and whether attacks on a strict-and parent behave like attacks anywhere else. Worked
example: a parent requires three conditions at 0.9, 0.8 and 0.7 — the product is **0.504**. If one of
the three abstains, does the parent read 0.504 (treating the missing one as neutral, i.e. an identity
of 1) or withhold a number entirely? The first choice silently treats an unmeasured condition as
certainly true, which is D1's failure mode in a new costume.

**Options.**
(a) **Identity of 1, ties resolved as accumulate does** — simple, and lets a parent compute with
partial children; risks treating unknown conditions as satisfied.
(b) **No identity — every declared conjunct must be judged, or the parent number is withheld** —
consistent with D1 and with DR-040's ruled precedent that an undeclared operator withholds the parent
number and serves components.
(c) **Define a separate typed "incomplete conjunction" state** that is neither a number nor a plain
refusal, carrying which conjunct is missing.

**Adopted — `RATIFIED (DR-062)`: option (b).** Strict-and has no identity element: every declared
conjunct must be judged, or the parent number is withheld and the components are served — D1 read
straight across, since a conjunction with an unmeasured conjunct has not been measured. (c) is (b)
with better copy and may be adopted alongside it. **Now normative at §4.2(b), §4.4.**

---

#### OD-06 — May anything set an arrow's strength freely?

**What is being decided.** An arrow carries a strength between 0 and 1 that scales how much of its
source's strength reaches the target (§4.2c). Today two mechanisms produce that number: the evidence
verifier's grounded score for evidence arrows, and provenance cluster collapse (§4.2g), which lets a
cluster contribute once at its strongest member. The decision is whether anything else may set it —
an author, a policy, a model, a configuration row.

**What follows.** Whether "how much this argument bears on that claim" becomes a settable dial.
Worked example: a child at strength 0.80 attached with arrow strength 1.0 contributes 0.80; the same
child at arrow strength 0.5 contributes 0.40 — a halving with no judge and no evidence behind it, and
nothing on the wire to explain it unless the setter is recorded.

**Options.**
(a) **Closed** — arrow strength is only ever the output of a ruled mechanism. No new authority
surface; the cost is that genuine "this only weakly bears on that" cannot be expressed except by
lowering the child's own score, which says something different.
(b) **Open with mandatory provenance** — anything may set it, but the setter, its basis and its
timestamp travel with the arrow and are served. Expressive; every setter becomes a new place a number
can be invented, which DR-039 constrains.
(c) **Open to policy and human only, never to a model** — mirrors DR-017's treatment of value weights
and DR-040's operator authority; a middle path that keeps models out of the arithmetic.

**Adopted — `RATIFIED (DR-062)`: option (a).** Closed: arrow strength is only ever the output of a
ruled mechanism, and no free-setting path exists. The weight research surveyed thirteen candidate
factors and found none needing a free arrow strength rather than a base-score cap or a cluster gate.
**Now normative at §4.2(c).**

---

#### OD-07 — When does a parent refuse to emit a number because its children abstained?

**What is being decided.** A child with no judgement contributes nothing (§4.2e). If *most* of a
parent's children abstained, the parent's number is computed from very little — arithmetically valid,
but thin. The decision is the point at which the parent stops emitting a number at all and serves its
components instead.

**What follows.** Whether a reader can be shown a confident-looking parent number that rests on one
judged child out of eight. V2's answer was an aggregate coverage gate that changed the band label but
**still printed the raw number underneath** (`coordinator/app/scoring/verdict.py:262-263`), which D1
forbids.

**Options.**
(a) **A fraction** — withhold when the share of abstained children crosses a threshold. Simple and
tunable; the threshold is a naked constant that changes served answers, so DR-039 requires facts
behind it.
(b) **Any abstention withholds** — maximally conservative and needs no constant; will withhold often
in early operation, when abstentions are common.
(c) **Operator-dependent** — under strict-and any abstained conjunct withholds (see OD-05), while
under accumulate a fraction or no rule applies, because accumulate's identity element genuinely makes
a missing child neutral.
(d) **Never withhold; always serve the number with a visible thinness mark** — maximum information,
but it is the shape D1 indicts unless the mark is impossible to miss.

**Adopted — `RATIFIED (DR-062)`: option (c).** Operator-dependent, and no threshold constant: under
strict-and any abstained conjunct withholds the parent number; under accumulate a missing supporter
is genuinely neutral, because `agg([]) = 0` is the identity element. The two operators differ in
exactly the way that matters — a missing conjunct is a hole in the claim, a missing supporter is a
supporter that simply is not there. **Now normative at §4.4 and §4.2(e).**

---

#### OD-08 — Two siblings say the same thing in different words. Flag, or collapse?

**What is being decided.** Provenance cluster collapse (§4.2g) catches restatements that share a
**source** — three articles about the same study count once. It does not catch two siblings that say
the same thing from genuinely different sources. The decision is whether V3 detects that textual
similarity and, if so, whether it changes the arithmetic or only labels it.

**What follows.** Whether repeating a point in different words still raises a score. From the
engine's arithmetic, one supporter at 0.40 restated twice more aggregates to **0.784**; collapsed, the
three contribute **0.400**. The reverse risk is equally concrete: if similarity **collapses**
arguments, an attacker can post a near-duplicate of the strongest counter-argument to get it absorbed
into a cluster and silenced.

**Options.**
(a) **Flag only** — the node and the wire carry "possibly a restatement of these nodes, similarity
0.87"; no number changes; a human or a later merge step decides. Cannot be gamed into silencing an
objection, and cannot fix double-counting either.
(b) **Collapse (gate)** — similar siblings become one cluster contributing once. Fixes the inflation;
requires a similarity threshold (a verdict-flipping constant, so DR-039 applies), requires
**complete-linkage** grouping so that a chain of mild paraphrases cannot swallow a whole branch, and
requires clustering **within one polarity and one parent only**, because "X reduces Y" and "X does not
reduce Y" sit close together in similarity space and are opposite in effect.
(c) **Neither** — no similarity computation at all; the residue stays invisible.

**Adopted — `RATIFIED (DR-062)`: option (a).** Flag only — the restatement flag is emitted and no
number changes. Promotion to (b) is available only after the threshold has been shown to fire
correctly **in both directions on real data**, which is what DR-039 demands of any new gate, and
then only with complete-linkage grouping within one polarity and one parent. **Now normative at
§4.2(i).**

---

#### OD-09 — What makes two evidence items "the same family"?

**What is being decided.** Cluster collapse counts a family of related evidence once (§4.2g). This
row picks the **key**: which recorded fields, when equal, mean two items are one family rather than
two.

**What follows.** This single choice is what converts the audit's inflated **0.784** back into
**0.400**, and it decides both failure directions. Too narrow a key and three papers from one research
programme count as three confirmations — the mission's own vitamin-D case, where three analyses shared
authors and trials. Too wide and two genuinely independent replications are merged, leaving the answer
under-confident.

**Options.** Any subset of these candidate fields, each already recorded on an evidence item:
`source_domain` (the site it came from) · `publisher` · the underlying **study or dataset identity**
· the **retrieval-query lineage** (which search produced it) · the **producing model family** · the
**producing run**. Trade-offs: domain alone is cheap and easily evaded by routing the same claim
through a press release or aggregator; study identity is the epistemically right key and the hardest
to populate; model family catches "the same model said it twice", which V2 deliberately excluded from
its own independence count; run identity catches accidental duplicates within one execution.

**Adopted — `RATIFIED (DR-062)`.** Primary key: **study or dataset identity plus producing model
family**; **domain and publisher** as fallbacks where study identity is absent; **run identity
always applied**. It targets the failure V measured rather than the one that is easy to compute. The
key is a declared, recorded run input, printed wherever a cluster changed a number, so a change of
key is a configuration change and every affected number says which key produced it. **Now normative
at §4.2(g) and §10.3.**

---

#### OD-11 — Does V3 serve a single "leans" meter, and on what admission rule?

**What is being decided.** V2 serves a one-line summary gauge — a percentage with a label such as
"Leans Pro" — computed by summing the strengths of the live supporting nodes and of the live attacking
nodes and reporting the supporting share. It is a separate surface from the verdict band. The decision
is whether V3 serves such a meter at all, and if so what must be true before it may be computed.

**What follows.** The meter is the most compressed thing a reader sees, so it is the most misleading
thing to get wrong. V2's admission rule is "at least one node in the whole answer was judged"
(`coordinator/app/scoring/lean.py:140`), which means one judged node in a hundred licenses a
"dialectical" reading assembled from ninety-nine invented base scores — D1 and D4 in one surface. With
no default base scores left in V3, the old rule has nothing to protect against and nothing to say.

**Options.**
(a) **Do not serve it** — the verdict band, the fragility table and the node graph already carry the
same information with their provenance attached. Least surface to get wrong; loses the single glance a
reader wants.
(b) **Serve it with a coverage precondition** — compute only when the judged share of the nodes it
sums crosses a stated bar, and say so when it is withheld. Needs a bar, which DR-039 constrains.
(c) **Serve it with per-side provenance instead of a precondition** — always compute, but state on the
face of it how many nodes on each side were judged and by whom, so the reader can discount it.
(d) **Replace it with a non-numeric summary** — for example "more supported than challenged, on thin
evidence" — which fits the layout rule that a bare number never appears in the top layer.

**Adopted — `RATIFIED (DR-062)`: option (d), with (c) as its layer-2 detail.** A non-numeric summary
in the top layer, backed by per-side provenance beneath it: it keeps the glance, carries its own
honesty, satisfies the layout rule against bare numbers, and needs no admission constant. The UI
contract (artifact 3) consumes it through the data layer being rebuilt against V3's native shapes
(DR-048). **Now normative at §9.2(g).**

---

#### OD-12 — Does "how we know it" cap a claim's score numerically, or only its band?

**What is being decided.** Every claim is labelled by how it was known: **LOOKED_UP** (found in a
source), **RAN** (measured or executed), or **REASONING** (derived by argument). One half of the
consequence is already law: `RULED — DR-044(Q51)` makes the locator gate, the provenance join and the
**reasoning-only downgrade** blocking machine gates, so an answer resting on reasoning alone is served
as a hypothesis plus a research plan rather than as a verdict. This row decides whether a **numeric
ceiling** is added on top — a maximum base score a claim may hold given how it was known.

**What follows.** Whether a well-argued but unsourced claim can reach a high number before the band
rule catches it. Worked example: a REASONING claim a judge scores 0.85 keeps 0.85 under band-rule-only,
and the downgrade shows up only in how the answer is framed; under a ceiling of, say, 0.6 it enters the
arithmetic at 0.6 and everything above it in the graph moves too.

**Options.**
(a) **Band rule only** — no numeric ceiling. Nothing new to justify, nothing to argue about, and the
already-ruled downgrade does the work. The number a reader sees may still look high.
(b) **Three ceilings, one per way of knowing** — expressive and directly effective, but three naked
constants that move verdicts; **DR-039 requires hard facts behind each**, and a three-tier ladder
invites a fourth and a fifth.
(c) **A ceiling for REASONING only** — one constant instead of three, targeting the case the battery
actually worries about.

**Adopted — `RATIFIED (DR-062)`: option (a).** Band rule only; no numeric ceiling and no ceiling
constant. DR-044 already made the reasoning-only downgrade blocking, and DR-039 sets a high bar for
inventing three numbers that would move everything above them in the graph. Outcome data showing
reasoning-only claims scoring high and being wrong is the fact base that would reopen it. **Now
normative at §4.2(h).**

---

#### OD-16 — Is claim typing done by code alone, or by a model that code constrains?

**What is being decided.** Before a claim is judged it is classified: what kind of claim it is
(empirical, causal, normative, definitional, prediction, comparative, mixed, unknown), what it is
scoped to (timeframe, geography, population), and whether it hedges ("might", "arguably"). V2 does this
with pattern matching only — no model call. The decision is whether V3 keeps that, or lets a model
classify with code constraining and enforcing the result.

**What follows.** The claim type selects which scoring composition is used (§5.2f) and which gates
apply, so a misclassification silently changes the arithmetic. It also decides what the spec
**forbids**: under DR-037's standing label law, a MACHINE row carries a zero-model-call prohibition
with a test behind it, while a HYBRID row licenses a call and demands named enforcement gates. Cost
differs too: pattern matching is free per node; a model call is not.

**Options.**
(a) **Code only (MACHINE)** — free, perfectly reproducible, replay-friendly, and it fails on phrasing
its patterns do not cover, which it reports as "unknown" rather than guessing.
(b) **Model proposes, code constrains and enforces (HYBRID)** — handles real language, costs a call
per node, and needs the enforcement gates named: a closed type set, a rejection path when the model
returns something outside it, and a recorded `substance:`/`enforcement:` pair per DR-037.
(c) **Code first, model only on "unknown"** — cheapest hybrid; the escalation path itself becomes a
place where behavior varies by input.

**Adopted — `RATIFIED (DR-062)`: option (c).** Code first, a model only on "unknown". It keeps the
common path free and reproducible while removing the failure mode that matters, and it fits DR-037's
label law because the escalation is itself a typed, enforced route. The properties in §5.2(a) —
closed set, explicit "mixed", explicit "unknown", hedges never changing the type, unmatched scope
left absent — hold on both legs. **Now normative at §5.2(a).**

---

#### OD-17 — Which kinds of claim are scored without an evidence term?

**What is being decided.** The reducer combines a judge's sub-scores into one strength using published
weights (§5.2f). It has two compositions: the default includes an **evidence-quality** term, and a
second drops that term and redistributes its weight across the others. V2 uses the second for exactly
two claim types — normative ("X ought to happen") and definitional ("X means Y") — on the reasoning
that such claims can never carry external evidence. This row decides V3's membership list.

**What follows.** A claim scored with the evidence term while it can never have evidence is penalised
for a fact about its own kind; a claim scored without the term while it *could* have had evidence is
excused from producing any. Worked example: a normative claim with no sources scores materially lower
under the evidence-weighted composition purely because the evidence term is near zero — the argument
is being marked down for a category error.

**Options.**
(a) **Keep V2's two types** — smallest change, defensible, and it leaves out cases that arguably
belong.
(b) **Add value-laden claims** — DR-017 and DR-043 give value claims their own machinery (weights are
human-only, criteria are model-proposed under three guards), so scoring them on evidence quality
double-counts a decision already handled elsewhere.
(c) **Derive membership from the claim type's own definition** — a claim type declares whether external
evidence is possible for it, and the composition follows that declaration rather than a hardcoded list.
Most principled, most work, and it makes OD-16's typing decision load-bearing.

**Adopted — `RATIFIED (DR-062)`: option (b) now, option (c) at the next revision of the type
vocabulary.** Value-laden claims join normative and definitional ones in the evidence-free
composition — the case the V2 list demonstrably missed, and one whose own machinery (DR-017, DR-043)
already handles the decision that evidence quality would otherwise double-count. The branch is
selected from a declared claim-type → composition map held as data, never a source literal. **Now
normative at §5.2(f).**

---

#### OD-18 — Which node states enter the scored graph, and does the debug view agree?

**What is being decided.** A node carries three independent states (§6.2): whether its text was
produced (`pending`, `complete`, `failed`, `stale`), whether its line of inquiry is still being pursued
(`active`, `abandoned`), and — new under DR-041 — whether it survived a falsification attempt
(`UNFALSIFIED-AFTER-ROTATION`, which degrades standing without deleting the node). The decision is
which of these combinations are **in** the graph the engine scores, and whether the operator-facing
debug view uses the same set.

**What follows.** Two things. First, the answer's numbers: including failed nodes keeps their arrows
attached — a dead node can still be a live sibling's target — while excluding them can orphan an arrow
and break the whole computation. Second, trust in the tooling: V2 includes failed nodes in production
and excludes them in the debug view, so for any question containing a failed node **the debug view's
strengths and fingerprint do not match the ones actually served**
(`../research/02-scoring-behavior-spec.md` §4.6) — an operator debugging a real answer is looking at a
different graph.

**Options.**
(a) **Include everything except `stale`** — V2's production rule; keeps arrows intact; means failed
nodes sit in the graph carrying no judgement, which is fine under §4.2(e) since they contribute
nothing.
(b) **Exclude `failed` and `stale`** — a cleaner graph; requires an arrow-repair rule for arrows
pointing at an excluded node, or the computation fails.
(c) **Include everything, marked** — every state is in the graph with its standing visible, and
scoring ignores what has no judgement. Most information served; the largest graph to render and
restate.
Whichever is chosen, the same rule governs the debug view — the divergence itself is the defect.

**Adopted — `RATIFIED (DR-062)`: option (a)**, plus the hard requirement that the debug facet use the
**identical** node set. Everything except `stale` enters the scored graph, which keeps arrows intact
at no arithmetic cost since an unjudged node already contributes nothing; the identical-set rule
removes V2's tooling divergence. The set in force is declared and recorded on the run, and the debug
facet reads that declaration rather than re-deriving one. **Now normative at §6.2, §6.4 and §9.3.**

---

#### OD-19 — What kinds of child and of arrow does SPLIT produce?

**What is being decided.** When the engine breaks a question apart it creates children and connects
them with typed arrows. V2 has exactly two child shapes — a supporting one and a challenging one — and
one arrow meaning per shape. Some kinds are already ruled in: DR-041 makes **defeaters** a system
obligation (a node is incomplete until its defeater set is non-empty or explicitly exhaustion-marked),
and DR-042 introduces the **shared-crux sub-claim** the builder creates when it redirects a circular
attack. This row decides the rest of the vocabulary, including whether an attack distinguishes
**rebutting** (denying the claim itself) from **undercutting** (granting the claim but denying that it
supports its parent).

**What follows.** What the engine can express at all. Worked example: a claim rests on a study, and a
critic shows the study's method cannot support that conclusion. That is an **undercut** — it does not
say the claim is false, it says the support does not carry. In V2 it can only be recorded as a plain
attack on the parent claim, which reads to a stranger as "someone thinks this is false" and produces
the wrong arithmetic. The battery also asks for pieces V2 cannot name at all: necessary conditions
("all of these must hold"), sub-questions, assumptions and scope carve-outs ("this part is not
covered").

**Options.**
(a) **Minimum ruled set** — support, attack, defeater, shared-crux. Smallest vocabulary that satisfies
the existing rulings; leaves undercut, necessary condition, assumption and carve-out unexpressible.
(b) **Add the rebut/undercut distinction** — one extra arrow kind, immediate honesty gain, and it
changes the arithmetic: an undercut logically attacks the *arrow*, not the node, which the engine has
no shape for today.
(c) **Full battery vocabulary** — add necessary condition, sub-question, assumption and scope
carve-out as first-class child kinds. Everything the battery asks for; the largest vocabulary to
render, restate and validate, and necessary conditions interact directly with the strict-and operator
(OD-05).

**Adopted — `RATIFIED (DR-062)`: option (c) for child kinds, option (b) for arrows.** The full
battery child vocabulary — support, attack, defeater, shared-crux sub-claim, necessary condition,
sub-question, assumption, scope carve-out — plus the rebut/undercut arrow distinction, with
undercuts recorded in the first release as marked attacks **on the target-side justification**
rather than as arrow-on-arrow arithmetic the engine has no shape for. The vocabulary stays a closed
declared enum with loud failure on anything unknown (§4.4). **Now normative at §6.3 and §7.2(e).**

---

#### OD-20 — Which claims may the evidence gate suppress?

**What is being decided.** The evidence gate withholds an endorsement when a claim of a kind that
*should* have evidence has none. V2 applies it to exactly one claim type — empirical — and runs it in
**shadow mode** when disabled, publishing what it *would* have suppressed beside the unsuppressed
answer (`coordinator/app/scoring/verdict.py:98-166`). This row decides V3's eligible list.

**What follows.** Which unevidenced claims can still be endorsed. Worked example: a **causal** claim
("A causes B") with no evidence at all is endorsable today, because only empirical claims are gated —
yet a causal claim is exactly the kind a reader will act on. Widening the list withholds more answers;
narrowing it endorses more thinly-supported ones.

**Options.**
(a) **Empirical only** — V2's list; predictable; leaves causal, comparative and predictive claims
ungated.
(b) **Every type for which external evidence is possible** — the complement of OD-17's
evidence-free list, so the two rows stay consistent by construction; suppresses considerably more, and
in early operation that may mean many withheld answers.
(c) **Tier the gate by risk** — gate more types at high-stakes risk tiers than at casual ones, reusing
the class × risk-tier structure DR-012 already established for abstention pricing.

**Adopted — `RATIFIED (DR-062)`: option (b) with option (c) layered on.** Eligibility is every claim
type for which external evidence is possible — the exact complement of OD-17's evidence-free list,
so the two stay aligned by construction rather than by maintaining a second list — and the gate is
tiered by risk, reusing DR-012's class × risk-tier structure. Causal, comparative and predictive
claims are therefore gated where V2 gated only empirical ones. **Now normative at §9.2(f).**

---

#### OD-22 — Who authors the operator identifier, and at what scope?

**What is being decided.** Every run records which combination operator produced each parent's number
(§4.2f), because a constant that flips a verdict must be a recorded input rather than a source
literal — that is D2's whole lesson. DR-040 already settled **who may declare** an operator: policy or
a human, at zero model cost, with one bounded model call available where nothing is declared. This row
decides the **scope** at which the declaration lives and is recorded: per parent node, per run, per
question, or per deployment.

**What follows.** How much can change between two answers to the same question, and how visible the
change is. Worked example: two runs of the same question a week apart return different verdicts. If
the operator is per-deployment, the difference is invisible in both answers unless the identifier is
served; if it is per-parent, each parent's number carries its own operator and the diff is readable
directly.

**Options.**
(a) **Per parent node** — the finest grain and the one §4.2(f) assumes, since conjunction structure is
a property of a particular parent's children. Most to record and most to explain to a reader.
(b) **Per run** — one operator for the whole answer; simplest to serve; wrong wherever one part of a
question is conjunctive and another is cumulative.
(c) **Per deployment** — an operator ships as configuration. Least flexible, and it recreates D2's
defect in configuration rather than source unless the identifier is served with every number.
(d) **Per parent, defaulting to a run-level declaration, defaulting to a deployment setting** — a
resolution chain, where whichever level supplied the value is recorded on the number.

**Adopted — `RATIFIED (DR-062)`: option (d).** A resolution chain — per parent, defaulting to a
run-level declaration, defaulting to a deployment setting — with the level that supplied the
**effective** value recorded on the number. It matches how declarations actually arrive (most
parents inherit, a few are special) while keeping D2's requirement that the effective value and its
origin travel together. The identifier is recorded per run *and* per parent regardless of who set
it. **Now normative at §4.2(f), §4.3 and §10.2.**

---

## 13. Stack constraints imposed by V

DR-005 left the stack to the ARCHITECTURE loop. DR-024 **supersedes it in part**: the stack is
architecture's **except** where V imposes a constraint, and the first such entry is below.

### 13.1 Postgres, including observability

`RULED — DR-024`. V3's persistence is **Postgres**, not SQLite — and this **includes the observability
layer**: score provenance, the execution-ledger artifact store, and the debug views. There is no second
store for observability. DR-034's replay law sits directly on top of it: the frozen records replay
reads are these records. `RULED — DR-046` adds one named store to the same database: the **model
ledger** of sessions and per-category model bests that feeds routing and weighting.

**Context.** V2's production database is gone and does not matter: V3 starts from scratch, and
historical V2 runs are unrecoverable. DR-024's further clause naming the vector recorder as "the sole
scoring-ground-truth source" is **superseded by DR-033**, which closes that ticket; V3's ground truth
is the literature vectors plus its own properties (§12.2).

**What this changes about the carried designs.** Several V2 behaviors are shaped by SQLite's
single-writer constraint rather than by anything the product wants. The **constraint** does not carry;
the **property it protects** does. All four rows are `CARRIED-DESIGN`:

| V2 behavior | Why it exists | What carries |
|---|---|---|
| The write transaction is committed **before** the judge subprocess runs (`../research/02-scoring-behavior-spec.md` §2.6 step 5) | So a long model call cannot hold the single writer | **The property**: never hold a write lock across a model call. |
| The panel releases the writer before each member's call and wraps only the persist in a savepoint (§2.8) | Same | **The property**: per-member failure isolation. |
| The "unlinked artifact sorts last in SQLite" tiebreak, with a fall-through to a random identifier (§3.4 path E) | An engine-specific ordering accident | **Nothing.** V3's ledger ordering must be total and deterministic (§8.2g) — a DR-034 precondition. |
| One commit per node in a batch pass (§2.6) | Single-writer pressure | **The property**: a crash mid-batch leaves completed nodes durable and resumable. |

### 13.2 The V3 flag and configuration register is drawn fresh

`RULED — DR-023`. V3's flag/config register is **designed anew** and **V ratifies it at the end, before
production**. V2 behavior is kept as far as possible **as source material**, but V3's production flag
set need not reflect V2's — and under DR-033 there is no obligation for it to resemble V2's at all.

**Operationally.** Every V2 flag named in the research is an input to the register's design and nothing
more. The scoring-relevant set, recorded so the register's authors need not re-derive it
(`../research/02-scoring-behavior-spec.md` U5): the calibration-weights flag, the field-disagreement
flag, the lineage-independence flag, the evidence-verification flag, the judge-panel model list, the
QBAF debug flag and its semantics override, plus the run-shaping flags — score-before-synthesis,
adversarial perspective, cross-examination, dynamic perspectives, model-authored perspectives, and
synthesizer rotation. One of those flag-off behaviors has been ruled directly: the field-disagreement
flag's production-off state left a gate that provably could not fire, and DR-032 rules that V3
implements a working one (§5.2i). No other flag state is inherited by implication.

**The knobs already ruled** are register entries in waiting, not open questions. `RULED — DR-019`
(batch 1): stranger-test coverage, topic cap, blind-verification coverage, steering authority.
`RULED — DR-020` (batch 2): split-iteration limit, ordering policy, citation enforcement, coverage
upgrade. `RULED — DR-021` (batch 3): **budget override, visible fallback, per-run ownership, and the
graph measurement quota** — these four are DR-021's, not DR-030's; the previous draft misattributed
them (`../reviews/ReviewLens-Hermes-pack.md` finding 8). `RULED — DR-052` extends DR-021's budget knob
with the visible cost envelope, the enrichment-then-hard-stop order, the `ENVELOPE_EXHAUSTED` mark and
the protected core that now includes serve-conformance.

---

## 14. Clean-room process control (binding, not advisory)

`RULED — DR-003`, restated by DR-033: what died is the equivalence obligation, not the clean-room law.
A label is not a control; the control is a **role split**:

- **Dirty room — may read V2 source.** The research seats that produced
  `../research/02-scoring-behavior-spec.md` and `../research/04-node-graph-data-model.md`, and
  **whoever writes the behavioral specifications in this manifest**. Reading V2 to record its behavior
  is legitimate; it also contaminates the reader, which is why the split exists.
- **Clean room — may read only this manifest, and never V2 source.** Whoever implements V3's organs.

The two roles must be held by different people or different agent seats. A single participant who reads
V2 source and then writes V3's implementation has voided DR-003 regardless of intent.

**Under DR-033 the split matters more, not less.** With no vector suite, nothing after the fact can
detect an implementer having absorbed V2's accidents along with its ideas — and V2's accidents are
precisely the D1–D5 diseases. The split is now the only control standing between "kept the design" and
"recreated the defect".

Two consequences worth stating plainly:

1. **This manifest is the interface.** If a clean-room implementer needs a fact about V2 that is not in
   this document, the answer is to **amend this document** (through review), not to look at V2.
2. **The literature vectors are exempt.** §4.5's two vectors are published external ground truth, not
   V2 behavior, and carry zero contamination — a clean-room implementer may read them directly.

---

## 15. Traceability index

Every tagged clause traces to one of the following. Where a section cites a research document, that
document carries `file:line` evidence into the frozen V2 engine — as reference, never as a conformance
target (DR-033).

| Source | What it governs here |
|---|---|
| **DR-001** | This artifact's existence as spec-pack item 2 (artifact 4 re-scoped by DR-047) |
| **DR-003** | Clean-room law (§2.2, §14) — equivalence-testing clause superseded in part by DR-033 |
| **DR-004** | The coverage law behind §12.4's readiness gate |
| **DR-005 / DR-024** | Behavior-only requirements, **except** V-imposed stack constraints (§13.1) |
| **DR-006** | The review gate this draft awaits |
| **DR-008** | Typed, visible query amendments in the ledger (§8.3) |
| **DR-009** | Off-subject evidence: reject or admit-downgraded, visible at serving (§9.2g, §11 H5) |
| **DR-010 / DR-011 / DR-012** | Abstention price as a class × risk matrix; every answer names its cell (§9.2g, §11 H8) |
| **DR-013 / DR-014** | Lineage definition; the cap-label-lift path when no second lineage exists (§5.2l, §9.2g, §11 H2/H6) |
| **DR-015 / DR-016** | The outcome memory that feeds judge weighting (§5.2k, §10.5); stale/under-review badges (§9.2g) |
| **DR-017** | Value flows; `weight_source` with no `default`; the overlay never mutates the graph (§4.2j, §9.2g, §12.2) |
| **DR-018 / DR-031(R9)** | The amended stranger test: every node **and** the verdict individually restatable (§1, §6.2) |
| **DR-019** | Knob batch 1 — stranger coverage, topic cap, blind verification, steering (§6.2, §7.2g, §8.3, §13.2) |
| **DR-020** | Knob batch 2 — split-iteration limit, ordering policy, citation routes, coverage upgrade (§7.2g, §11 H5/H8, §13.2) |
| **DR-021** | **Knob batch 3 — budget override, visible fallback, per-run ownership, graph measurement quota** (§7.2h, §9.2g, §13.2) |
| **DR-022 → DR-035** | The labeled-arrow idea as design reference; the perimeter leaving the experiment's evaluator, loop handling and 0.5 defaults behind (§3.1, §4.2c, §6.3) |
| **DR-023** | Fresh V-ratified flag register; constants are register rows (§2.2, §13.2) |
| **DR-025** | The definition of "the V2 reference" — as-shipped production (§2.2); race clauses retired by DR-047 |
| **DR-026** | D5 indicted; outcome-fed judge weighting required (§5.2k, §10.5) |
| **DR-027** | The recording extension: everything executed recorded, failures included, digest user-visible, raw tapes internal (§2.2, §8.3, every organ's edge-case table) |
| **DR-028** | D1 covers all four fallback variants; no judgement, no number (§4.2e, §10.1) — its vector-marking clause superseded by DR-033 |
| **DR-029** | All eight house rules carried; successors govern, rules are floors (§11) |
| **DR-030 · DR-056(a)** | Composition — one engine, one graph, serve layer plus internal debug facet — and the organ↔stage table, now **final** (§3, every organ's stage-owner clause) |
| **DR-031** | The ratified batch: Q46/Q47/Q49 MACHINE (§4.2f, §4.2k, §9.2g); Q27 LLM with the plain-language rider (§6.2 item 13); R9 as amended; `engineRelationship = GREENFIELD_NEW_REPO` (§2.2) |
| **DR-032** | The working disagreement flag — flag plus certainty downgrade, never a silent average, never an abstention gate (§5.2h–i, §9.2g, §10 preamble, §12.2 P-D5); its fire bar set by DR-063 |
| **DR-057** | R9's two surfaces — node text pre-composition, the composed verdict post-composition; verdict-R9 failure is terminal (§9.2i) |
| **DR-058** | The composition size law — multi-pass by load-bearing priority, honesty-critical fields machine-injected, components-only past the hard budget (§9.2h) |
| **DR-059** | Degraded-mode projection fields for the reversal point and builds-on-previous; replay eviction of a non-recomputable number (§8.3, §9.2a, §9.2i) |
| **DR-060** | Conformance sampling scope — load-bearing always judged, the rest at the frozen rate, the judge role never skipped (§9.2h); ceremony scope — numbers exact, serve decision replayed as stored data (§8.3) |
| **DR-061** | The canonical `stranger_restatement` contract, ratified at `OD-S-06` with the verdict-only action field; cited by name, never restated (§6.2 item 1) |
| **DR-062** | **This artifact's register ratified wholesale** — all 17 rows adopted by reference to their own option text and promoted into §§4–9 (§12.4, and every `RULED — DR-062` clause) |
| **DR-063** | The charter's acceptance law, of which VR-1 sets the disagreement-flag fire bar and VR-3 defines ceremony "exactly" as byte-identical served numbers (§5.2i, §8.3, §12.2) |
| **DR-033** | Nothing from V3 must match V2; the MUST-MATCH class is dead; ticket 27 out of scope; every V2 citation reframed as reference (§1, §2.2, §10 preamble, §12.1, §14) |
| **DR-034** | The replay law — permanent property plus launch ceremony, no model in the replay path (§2.2, §8.3, §9.2a, §12.2) |
| **DR-035** | The Model B perimeter (§3.1, §4.2c, §6.3) |
| **DR-037** | The standing label law and the `substance:`/`enforcement:` two-field record (§2.2, §5.2a, OD-16) |
| **DR-038 / DR-045** | Evidence appraisal: Q35/Q37 HYBRID with enforced gates; Q34 MACHINE with the `UNINSTRUMENTED` block and the marked remediation layer (§9.2g, §11 H5) |
| **DR-039** | No invented measurements — the bar every proposed constant in §12.4 must clear (§2.2, OD-01, OD-08, OD-12) |
| **DR-040** | Row-boundary law; Q45's operator declaration path and the withheld-parent fallback (§4.2f, §10.2, closes OD-10) |
| **DR-041** | Defeater generation as a system obligation; no kill on author failure; `UNFALSIFIED-AFTER-ROTATION`; rival carver and `DEGRADED DIVERSITY` (§5.2g, §6.2, §6.3, §7.2e) |
| **DR-042** | Loop-free construction and the shared-crux redirect (§4.2d, §6.3) |
| **DR-043** | Q50 — model-proposed criteria under three guards; weights human-only (§4.2j) |
| **DR-044** | Serve composition; Q51's blocking machine gates; Q55's model-chooses/machine-enforces mapping (§4.2h, §5.2m, §9.2h) |
| **DR-046** | Scorecards, diversity routing, exploration share, model ledger, demonstrable cold-start exit (§5.2k, §10.5, §13.1) |
| **DR-047** | The race is retired; V2 is informal reference; verdict bands and DR-032's fire bar become charter items (§1, §2.2, §12.1, §12.3) |
| **DR-048** | UI data layer rebuilt against V3's native shapes; all nine honesty surfaces flex (§9.2g) |
| **DR-049** | Serve termination — `max_recompose = 2`, gate order, components-only `DEFECT` serve, Q53 residual as a fact-bundle field (§6.2 item 12, §9.2i) |
| **DR-050** | The K=1 deepening bound and `LEVERAGE_UNRESOLVED` (§4.2k, §9.2g) |
| **DR-051** | The partition law — five abstention kinds for ledger unknowns only; a closed condition-marks enum beside them (§4.2e, §5.2m, §6.2, §9.2g) |
| **DR-052** | The cost envelope, the protected core including serve-conformance, and the frozen stranger-sample rate (§6.2 item 4, §7.2h, §11 H8) |
| **DR-053** | Mixed questions — two phases on one graph, two labeled sections, typed dual settlement act (§4.2j) |
| **DR-054** | The wire boundary — typed projections by default, full bundle behind an authorized inspection/replay handle (§8.3, §9.2j, §9.3) |
| **DR-055** | Multi-maker critique as a launch gate; single-maker legal only as labeled degraded operation (§5.2g, §11 H2) |
| `../research/02-scoring-behavior-spec.md` | Organ designs 1, 2, 5, 6; the defect evidence in §10 |
| `../research/03-golden-vector-plan.md` | The literature vectors; the scenario inventory read as V3 test shapes (§12.2); the clean-room role split (§14) |
| `../research/04-node-graph-data-model.md` | The graph and spawn organs (§6, §7); the stranger-test field audit |
| `../research/32-weight-derivation.md` | The structural-weight analysis behind §4.2(e)–(k) and several §12.4 rows |
| `../wayfinder/GLOSSARY.md` | Defect register D1–D5; the stranger test; the five abstention kinds; ways of knowing; defeater |
| `AGENTS.md:64-88` | The eight house rules, verbatim (§11) |

---

## 16. Open tensions and unresolved contradictions

Listed, never resolved. Every entry carries a dated disposition, re-verified against the **current**
ledger, both merge verdicts and the current sibling artifacts as required by the delta review
(`../reviews/merge-verdict-delta.md` class-1 item 3).

### 16.1 Withdrawn — all six of revision 3's entries

| # | Entry | Disposition |
|---|---|---|
| 1 | Seventeen rows lost their owners when the themes completed | **WITHDRAWN 2026-08-05 — stale.** `../reviews/merge-verdict-pack.md` ORCH ROUTING ADDENDUM item 1 formally routes all 17 rows to V's register review of this artifact; **DR-062** then ruled every one of them. The routing that "no DR said" is now both recorded and executed. |
| 2 | DR-051's exhaustive mapping table has no named owner | **WITHDRAWN 2026-08-05 — stale.** Addendum item 2 assigns the table to `requirements-spec.md` §12.3, where it exists as Requirements S-11 … S-13: thirteen rows placing every typed non-answer state in exactly one of three homes, plus S-13's rule that an unplaced state is a specification defect. §5.2(m) now cites it by reference. |
| 3 | Where the replay refusal sits in DR-049's gate order | **WITHDRAWN 2026-08-05 — ruled.** `DR-059`: a number that fails replay is **evicted** with a typed missing-number mark and the rest of the answer serves under `DEFECT`. The refusal filters the component set; it never blocks the serve. Recorded at §8.3 and §9.2(a). |
| 4 | DR-034's replay scope — numbers only, or the serve decision too | **WITHDRAWN 2026-08-05 — ruled.** `DR-060(b)`: numbers replay exactly; the serve decision replays as **stored data**, the conformance verdict being an input artifact rather than a re-generated one, so the ceremony is deterministic. `DR-063 (VR-3)` defines "exactly" as **byte-identical served numbers**. Recorded at §8.3. |
| 5 | DR-003's condition field still reads as live | **WITHDRAWN 2026-08-05 — repaired at source.** The ledger row now reads *"[condition superseded by DR-033: equivalence-testing dead; organs kept as DESIGNS]"*. Verified in the current `decisions-ledger.md`. |
| 6 | The readiness gate is derived, not ruled | **WITHDRAWN 2026-08-05 — ratified.** Addendum item 4 records that the closure rule is ratified by V implicitly at the register review; DR-062 then met it for this artifact. §12.4 states the gate as met. |

### 16.2 New, arising from the ratification itself

1. **Five ratified rows adopted a *sequence*, not a single option, and the successor half has no
   trigger.** DR-062 ratifies each row's proposal by reference to its own text, and five of those texts
   name a successor: OD-04 ("(b) now, (c) as its successor"), OD-08 (flag now, gate available after the
   threshold fires both ways), OD-11 ((d) with (c) beneath it), OD-17 ("(b) now, (c) at the next
   revision of the type vocabulary") and OD-20 ("(b) with (c) layered on"). What is ratified as
   *present law* is unambiguous. What is unclear is whether the successor is **also ratified**, to be
   built when its condition is met, or merely **noted** and requiring a fresh ruling. Three of the five
   carry a stated condition (DR-039's fact bar, a both-ways firing demonstration, a vocabulary
   revision); two — OD-11's layering and OD-20's risk tiering — do not say who decides they have
   arrived. No DR distinguishes the two readings.

2. **OD-19's ratified undercut shape has no home in the graph organ.** The adopted text records an
   undercut as *"a marked attack on the target-side justification"*. §6.3 defines exactly three
   relations — containment, argumentative, evidential — and no object called a justification; an attack
   on one implies either a node standing for the inference step or an arrow whose target is another
   arrow, and neither exists in this manifest, the requirements spec (which contains no occurrence of
   "undercut") or the UI contract. The distinction is ratified; the shape that carries it is
   unspecified.

3. **OD-11 retires a numeric surface the kept UI still renders.** The ratified summary is non-numeric,
   while `ui-boundary-contract.md` still documents `DebateLean {source, pct, label}` as the only
   debate-level which-way marker. That reference sits in a *current-UI gap* passage describing V2 rather
   than prescribing V3, and DR-064 delegates the presentation cells to mockup review — so this is a
   cross-artifact consistency item for the final audit rather than a live conflict, but the two
   artifacts should not reach the build phase disagreeing about whether a percentage is served.

<!-- Final audit: orchestrator grep-level lint per ../reviews/merge-verdict-delta.md
     §Sequence to gate step 3 — candidate-imperative scan, untagged-obligation scan,
     open-OD collision scan. Lens confirmation only if the audit finds drift.
     Then ticket 17 bootstrap → gate 31 → V acceptance. -->
