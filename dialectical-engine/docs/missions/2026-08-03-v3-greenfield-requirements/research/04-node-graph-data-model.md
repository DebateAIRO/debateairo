RESEARCH HANDOFF COMPLETE

# 04 — Node-graph & reasoning data-model inventory (V2 → V3 behavioral re-spec)

Ticket: `wayfinder/issues/04-node-graph-data-model.md` · Mission: REQ-V3-GREENFIELD-R1
Scope: read-only inventory of the FROZEN V2 engine at `apps/dialectical-engine/coordinator/`.
Carryover posture: **clean-room** — this document states *shapes, meanings, invariants and
lifecycles as behavior*. It names V2 fields so the behavior is identifiable and auditable;
it is not a porting guide and no code is reproduced for reuse.

Reader orientation (self-contained): a *debate* in V2 is a tree of argument nodes hanging
off one root claim. Nodes are argued by LLM workers, scored by an LLM judge panel, reduced
to numbers by deterministic code, and aggregated into one root strength by a published
argumentation semantics (DF-QuAD). "Battery stages" SPLIT / WEIGH / COMPOSE are three of
the eleven stages of the V3 research battery defined in
`docs/missions/2026-08-02-battery-llm-vs-machine/upstream/human-plan.md` (questions 26–31,
32–38, 45–50 respectively).

---

## Node and edge shapes

### 0. Orientation — V2 has **three** graph models, not one

This is the single most important structural fact for V3, and it is easy to miss.

| Model | Where it lives | Persisted? | Reachable how | Role |
|---|---|---|---|---|
| **A — persisted argument tree** | `coordinator/app/models/entities.py` (`nodes` table) | yes (SQLite) | every real debate: `/api/debates`, worker jobs, UI | the production reasoning graph |
| **B — in-memory QBAF graph** | `coordinator/app/qbaf/model.py` + `coordinator/app/orchestration/recursive.py` | **no** | only `POST /api/qbaf/runs` (`coordinator/app/api/qbaf.py`), an in-memory run repository | a second, parallel, self-contained engine |
| **C — flat DF-QuAD kernel** | `coordinator/app/qbaf/dfquad.py` | no (computed per read) | both A and B project into it | the numeric aggregation core |

**A and B never meet.** Model B has its own node vocabulary (`root` / `sub_claim` /
`evidence_leaf`), its own edge object with a stored weight, its own status vocabulary
(`open` / `blocked`), and its own per-node fields (`base_score`, `final_strength`,
`uncertainty`, `caveats[]`, `transcript[]`) — several of which are exactly the fields
Model A is *missing* (see the stranger-test audit). No code path converts an A-node into a
B-node or back. Model B is a working prototype of a richer per-node state that production
debates never got.

**V3 requirement implied:** pick ONE node model. The behavioral union of A and B — A's
persistence, provenance and lifecycle plus B's per-node score/uncertainty/caveat/transcript
state — is closer to what the battery needs than either alone.

Everything below is Model A unless labelled otherwise.

---

### A. The persisted argument node

One row per node. Fields grouped by what they *do*.

**Identity & structure**

| Field | Meaning | Invariant |
|---|---|---|
| `id` | opaque node identity (UUID4) | stable for the node's life; never reused |
| `debate_id` | owning debate | all nodes of a tree share it; cascade-deleted with the debate |
| `parent_id` | the single structural parent; NULL only for the root | exactly one parent — the graph is a **tree**, not a DAG |
| `depth` | integer distance from root | `child.depth == parent.depth + 1`; root is 0 |
| `position` | ordinal among siblings | see the position-band rule below |
| `materialized_path` | `/`-joined position chain from the root | `child.path == parent.path + "/" + child.position`; root is `/0` |

`materialized_path` is not decoration: it is the **only** cheap subtree operator in V2.
Ancestor-triggered invalidation (regeneration) finds descendants by path prefix.

**Position bands** — siblings are allocated in reserved numeric ranges so different child
kinds cannot collide: argument children take the next free low slot (skipping evidence and
skipping already-invalidated siblings, which keep their old slots); extracted evidence
children start at 1000; retrieval-acquired evidence children start at 2000. This is the
closest thing V2 has to a **typed edge**: the child's *kind* is encoded in its position band
plus its node type, not in a relationship object.

**Content**

| Field | Meaning | Invariant |
|---|---|---|
| `claim` | the node's short title / headline claim | must be non-blank at serialization time (enforced in the read-model projection, **not** by the database) |
| `active_generation_id` | pointer to the currently-authoritative body text | at most one active generation per node (partial unique index) |
| `evidence_metadata` (DB column `metadata`) | typed annex, used only by EVIDENCE nodes | nullable; readers must treat NULL as empty |

The node's **full prose lives on the Generation row, not on the node**. A node row carries a
title; the argued body is `generation.argument`, stored as `title + blank line + content`.
Regeneration writes a new Generation and flips the active pointer, so a node has a revision
history but exactly one live text.

**Three orthogonal lifecycle columns** (each detailed in §A.4)

| Field | Machine |
|---|---|
| `status` | generation lifecycle — has this node's text been produced? |
| `path_status` | exploration lifecycle — is this line of inquiry still being pursued? |
| `stopping_status` | last exploration *decision* taken on this node |
| `stopping_reason` | free text or a lower_snake_case reason code explaining that decision |

---

### A.1 Node roles — 8 persisted type literals in 5 behavioral roles

`node_type` is an unconstrained short string. No enum, no CHECK constraint, no migration
guard. The complete written vocabulary (confirmed by exhaustive grep of every write site,
and independently documented in `docs/node-type-legacy.md`) is:

| Role | Literal(s) | Behavior |
|---|---|---|
| **Root claim** | `ROOT_CLAIM` | depth 0, position 0, no parent, created already-complete with the user's topic as its claim. Carries a τ (base score) but **never an outgoing argumentative edge** — it is the aggregation target. |
| **Lens container** | `SCIENTIFIC_POV`, `STATISTICAL_POV`, `ETHICAL_POV`, `PRACTICAL_POV` | depth-1 children of the root, one per perspective. Group a perspective's sub-tree. Under the older "lens-lift" semantics they are *pass-through*: they emit no edge of their own and their children's edges are lifted past them to the nearest real argumentative ancestor. Under the default semantics they emit a **support** edge into the root. |
| **Supporting argument** | `PRO` | emits a **support** edge into its effective parent |
| **Challenging argument** | `CON` | emits an **attack** edge into its effective parent |
| **Evidence leaf** | `EVIDENCE` | always a leaf; never gains argument children; emits **no edge at all** unless a verifier verdict exists for it (see §A.2) |

**Critical honesty defect to carry forward as a requirement, not a shape.** With dynamic
perspectives on (the default), a debate may open 2–16 perspectives, but only 4 type literals
exist, so types are assigned by **cycling the four literals over the perspective's ordinal
position**. A six-perspective debate therefore has two unrelated sibling perspectives both
literally typed `SCIENTIFIC_POV`. The perspective's real identity lives in `claim` and in a
`perspective_derivation.lenses` map inside the debate config — never in the type. The type
literal is *retained only because the scoring adapter hardcodes those four strings*, and any
unrecognised type silently produces an unmapped edge, which silently disconnects that whole
sub-tree from the root's score (no error, just a perspective that never influenced the
verdict). **V3 must have a real container type and a real perspective identity field, and
must fail loudly — never silently — on an unmapped node type.**

---

### A.2 Edges — entirely derived, never stored

**There is no edge table and no edge row anywhere in V2.** This is the single largest
structural gap for the battery. Every relationship is recomputed from `(node_type, parent_id)`
at read time by the graph adapter, per request.

Three distinct relationships are collapsed into one `parent_id` field:

1. **Containment / lineage** — "this node was produced while working on that node."
   Carried by `parent_id` + `materialized_path`. Used for regeneration invalidation and
   sub-tree summaries.
2. **Argumentative relation** — support or attack. *Derived*: PRO → support, CON → attack,
   lens container → support (or pass-through, semantics-dependent), root → none. Polarity is
   a **function of the child's own type**, so a node cannot support one parent and attack
   another, and cannot relate to any node that is not its structural parent.
3. **Evidential relation** — derived from a *verifier verdict keyed to the evidence node*,
   not from the tree: verdict `supported` ⇒ support edge weighted by the verifier's own
   grounded score; verdict `contradicted` ⇒ attack edge at a single documented constant
   (0.7, deliberately below maximum because the verifier reports contradiction without a
   magnitude); anything else (unverifiable, pending, missing, malformed) ⇒ **no edge**,
   fail-closed.

**Edge weight is not a node-pair property.** The DF-QuAD kernel consumes unweighted
`(source, target)` tuples plus a per-node base score τ. So "how strongly does this argument
bear on its parent" is not expressible: only "how strong is this argument in itself." τ comes
from the judge panel's `strength`, or from a verifier's evidence score, or — when nothing was
judged — from a **default of 0.5**, tracked per node in a `tau_sources` map (`judge_strength`
/ `default` / `verifier_evidence`). The fraction of argument nodes carrying a real judged τ
is published as `tauCoverage` and gates the verdict (below 0.5 the served band becomes
`insufficient_scoring` rather than a strength claim).

**Edges that fail to map are recorded, not dropped silently at the record level:** the adapter
writes a marker keyed `"<node_id>__edge"` into the τ-source map with one of `unmapped_edge`,
`lens_no_edge`, `orphaned_parent`. This marker is real provenance, but it is buried in a
debug map and never surfaces at the node.

**Acyclicity** is enforced only at compute time (the kernel raises on a cycle), never at
write time. A cycle is structurally impossible today only because the model is a tree.

---

### A.3 Node-attached typed state (the side records)

The node row is deliberately thin. Its reasoning state lives in satellite records:

| Record | Grain | What it carries | Mutability |
|---|---|---|---|
| **Generation** | node × revision | model id, role, prompt version, the rendered prompt, the argued text, tokens in/out, latency, authoring worker, `is_active` | append; exactly one active per node |
| **Node scoring result** | node × input-hash × judge role × provider × model × contract hash | one judge's cached assessment plus status | upserted; cache-keyed by content identity |
| **Judge output artifact** | node × input-hash × judge identity × raw-output hash | the raw judge text, its parse status/error, provider metadata, latency | immutable; uniquely keyed so identical output cannot duplicate |
| **Node scoring payload** (the reduced, public per-node record) | node | see the rubric below | recomputed per scoring run |
| **Evidence lifecycle snapshot** | evidence node × run | the exact immutable evidence envelope presented to the lifecycle mapper, plus a content hash and an identity hash making replays idempotent and conflicts loud | immutable |
| **Lifecycle decision record** | node × decision | the audited exploration decision (see §A.4) | immutable, idempotency-keyed |
| **Node feedback vote** | node × hashed user identity | human up/down, optionally bound to the scoring result being judged | upsert; one current vote per user per node |
| **Analyzer run** | debate | `node_scoring`, `protocol_analysis`, `evidence_verification` outputs, with a monotonic sequence number so same-tick runs are orderable | append |
| **Provenance record** | artifact kind × artifact id | model / worker / prompt / job attribution for an artifact | append |
| **Job** and **job transition ledger** | node / debate | the unit of work that produced the node, plus an append-only state-change ledger written best-effort (a ledger failure never rolls back the state change it describes) | job mutable; ledger immutable |

**The reduced per-node scoring record** is the richest reasoning shape in V2. Behaviorally it
carries:

- a **normalized claim**: raw text, a rewritten core claim, a claim type from a closed set
  (empirical / causal / normative / definitional / prediction / comparative / mixed / unknown),
  a scope object (population, timeframe, geography, domain), implied assumptions, evidence
  references, ambiguity flags, key terms;
- **eight unit-interval scores**: strength, uncertainty, impact, evidence quality, relevance,
  logical validity, assumption risk, counter-resilience;
- **qualitative labels** for strength / uncertainty / impact;
- **holes** (typed, severity-graded, described, sourced), **fatal flags** (typed, graded,
  described), **score caps** (which score was capped, to what, why, by what), **judge
  disagreements** (which judges, what type, severity, description);
- **recommended investigations** from a closed action set (challenge / support / find_evidence /
  decompose / ask_user), each with a reason, a 1–5 priority, and an optional target node;
- a **rationale**: a one-line summary, a "why not higher", a "why not lower", and a named
  weakest link;
- **uncertainty drivers** from a closed code set (no evidence refs, low evidence quality,
  ambiguity, judge disagreement, score caps, strong counter, judge dispersion) plus a source
  flag recording whether the numeric uncertainty was *measured* from judge dispersion or is a
  hand-coded heuristic fallback;
- a **strength kind** recording whether the composition dropped the evidence term (for claim
  types that can never carry external evidence) or included it;
- **score provenance**: reducer version, rubric version, and an explicit assertion that the
  final number came from a deterministic reducer and that raw judge text is not included.

This is a genuinely strong per-node epistemic record. Its weakness is **placement**: it is a
recomputed artifact keyed by node id, not part of the node, so it can be absent, stale, or
keyed to a different content hash than the node's current text, and the node itself carries no
indication of which.

---

### A.4 Lifecycle state machines

**Machine 1 — generation status** (`status`; is there text yet?)

States: `pending` → `complete` | `failed` | `stale`. Plus a derived-only `generating`.

- `pending` — created, work queued, no authoritative text.
- `complete` — an active generation exists.
- `failed` — the generating job exhausted its retries. For the *branch-degradable* job
  families (root argue, POV branch, expansion child) failure is **bounded**: the node fails,
  its stopping status is set to a stop, its reason is set to an exhaustion code, and its path
  is abandoned — and the debate survives, so surviving branches can still synthesize. For all
  other job families the debate itself fails.
- `stale` — invalidated, invisible, never scored. Two producers: (a) regenerating a node
  marks **every descendant by path prefix** stale and cancels their jobs; (b) a placeholder
  child whose cross-examination wave failed terminally is marked stale so it neither lingers
  as a permanent ghost nor blocks a synthesis wait.
- `generating` — **never persisted**. Computed at serialization time when a streaming job is
  attached to the node.

Retryable failure returns non-v2 nodes to `pending`; regeneration returns the target to
`pending`, re-opens the debate, and clears the debate's synthesis pointer.

**Machine 2 — path status** (`path_status`; is this line still being pursued?)

States: `active` | `abandoned`. Abandonment is a *pause*, not a deletion: an abandoned node is
still scored, still counted toward τ coverage, still an edge endpoint, and can be **reopened**
when new grounded supporting evidence arrives. Only a *failed* node is excluded from judging.

**Machine 3 — exploration decision** (`stopping_status` + `stopping_reason`)

The decision vocabulary is `continue`, `deepen`, `seek_evidence`, `challenge`, `abandon`,
`reopen`, plus the initial `active`.

The policy that produces these is a pure function of two typed signal bundles — a **score
signal** (node id, claim type, the eight scores, holes, fatal flags, recommended actions, and a
persisted cross-judge-disagreement flag) and an optional **evidence signal** (status,
grounded score, uncertainty, entailment verdict, caveats) — plus the current path state.
Precedence is fixed: reopen (if paused and newly grounded) → challenge → seek evidence →
deepen → abandon (only if unblocked) → continue.

Two laws in this machine are load-bearing and should be carried:

1. **Categorical-only steering.** Every decision is classified `categorical` or `scalar`
   according to whether *at least one* of the reasons that fired it was a categorical
   predicate (evidence status, entailment verdict, fatal-flag membership, claim-type evidence
   requirement, a persisted disagreement label) rather than a threshold crossing on an
   uncalibrated judge scalar. **Only categorically-grounded decisions may spawn real work.**
   Unclassified decisions fail closed to scalar. The stated rationale is that there is no
   calibrated ground truth for judge scalars, so a scalar threshold must never steer spend.
2. **Blockers are recorded but never ground.** Reasons *not* to abandon are attached to the
   decision for the audit trail and explicitly excluded from the categorical/scalar
   classification, so a scalar blocker cannot contaminate a categorically-grounded decision.

**Decision → work mapping:** `challenge` spawns a CON child under the decided node;
`seek_evidence` spawns a PRO child. `deepen` / `continue` / `reopen` spawn nothing directly.
So the graph grows **only** in those two shapes, and only under a categorical decision.

**Decision audit invariants** (validated when the immutable decision record is written):

- `abandon` requires grounded input, an abandoned path, and matching stopping status.
- On an active path, stopping status must equal the decision — *unless* the input was not
  grounded, in which case the prior state is preserved with zero spawns.
- An abandoned path can only be preserved by non-grounded input and can never spawn children.
- A non-spawning decision may not carry a spawn count.
- **Grounded** input requires: no reason codes at all, score AND evidence both present AND
  fresh, and all six identity fields (score input hash, scoring contract hash, score record id,
  score run id, score run sequence, evidence snapshot id) non-null. Run id and run sequence
  must be present or absent together.
- Availability and freshness are cross-validated: only a `present` component may be `fresh`
  or `stale`; absent / in-progress / terminally-unverifiable components must be `unknown`.
- Reason codes must be normalized lower_snake_case and non-duplicated.
- The replay identity hash deliberately excludes the idempotency key, the spawn count and
  the W4 classification fields, so re-deriving the same decision replays instead of conflicting,
  while genuinely different content fails loudly.

**Invariant gap found:** the node column's stopping status is written with a value (`stop`, at
the terminal-generation-failure site) that is **not** in the decision-record validator's
accepted set. The vocabulary is therefore enforced only at the audit-record boundary, not on
the node row itself. V3 should type this state once, at the node.

---

### A.5 Invariants: enforced vs merely conventional

| Invariant | Enforcement in V2 |
|---|---|
| one active generation per node | **enforced** (partial unique index) |
| decision-record content identity / idempotency | **enforced** (unique key + hash conflict raises) |
| judge-artifact identity uniqueness | **enforced** (composite unique constraint) |
| scoring-cache identity | **enforced** (composite unique index) |
| evidence-snapshot identity | **enforced** (unique index) |
| one current human vote per node per user | **enforced** (unique constraint + checked vote domain) |
| analyzer-run ordering | **enforced** (lock-covered monotonic sequence + partial unique index) |
| `node_type` ∈ known vocabulary | **not enforced** — free string; unknown types silently orphan a sub-tree |
| `status` / `path_status` / `stopping_status` ∈ vocabulary | **not enforced at the node**; only the audit record validates |
| `claim` non-blank | **not enforced in DB**; enforced in the read-model projection |
| path/depth/position consistency | **convention only**, maintained by every creation site |
| acyclicity | **compute-time only** (kernel raises) |
| exactly one parent | structural — the column allows only one |

---

### B. The in-memory QBAF node (Model B) — the richer shape V2 never persisted

Because it *is* the closest existing sketch of what SPLIT/WEIGH/COMPOSE want, its behavior is
worth recording:

- **Node**: id, text, type (`root` / `sub_claim` / `evidence_leaf`), **base score**,
  **final strength**, **uncertainty**, status (`open` / `blocked` / …), **caveats list**,
  **transcript list** (per-turn dicts carrying role, score, evidence references). All three
  numerics are validated to the unit interval; id/text/status must be non-blank.
- **Edge**: source, target, **polarity** (support / attack), **weight** (unit interval,
  validated). A first-class edge object with its own strength.
- **Graph**: root id, node map, edge list; validated so the root exists, keys match ids, and
  every edge endpoint exists.
- **Run loop behavior**: select the highest-leverage open node (ranked by how much moving its
  score would move the root), debate it, apply an anti-obfuscation check, replace its outgoing
  edge weights with the debate's derived weight, re-propagate, and **spawn evidence children
  only when the two debaters materially disagreed AND the root actually moved** (twin
  thresholds: disagreement ≥ 0.25 and root movement ≥ 0.02). Evidence children are minted per
  cited reference, with polarity taken from the citing debater's role. A referenced source that
  is missing marks the leaf `blocked` with an explicit caveat naming the missing reference.
  Stop when a stopping criterion fires or the iteration cap is reached; the run returns the
  graph, the root confidence, the iteration count, **the full root-strength history**, and the
  ordered stopping decisions.

The root-strength history and the per-node transcript are exactly the "did the answer move,
and what moved it" evidence the battery's COMPOSE and SERVE stages need — and production
debates have neither.

---

### C. Defeaters and residuals — what V2 has, and what it does not

The ticket asks after "children / defeaters / residuals." Precisely:

- **Children** — yes, as described. Structural, single-parent, position-banded.
- **Defeaters** — **no first-class shape.** A `CON` child is an attacker of *its own structural
  parent*. There is no undercutting-vs-rebutting distinction, no defeater that targets an
  inference step rather than a claim, no defeater that targets a node other than its parent,
  and no defeated/defeating status on either node. Closest analogues: the cross-examination
  report, which names, per scored claim, its **strongest existing CON child** (id + strength)
  and whether the claim is **unopposed**; and the evidence-verdict attack edge.
- **Residuals** — **no first-class shape.** The word appears nowhere in the model. The
  behavior it implies (an objection that remains standing after the answer is composed —
  battery question 44) is scattered across four places that are never assembled: the
  cross-exam `unopposed` flag, the per-node **holes** and **fatal flags**, the per-node
  **caveats** (Model B only), and the **abandon-blocker** reasons (which are computed, attached
  to a decision, and then not surfaced at the node). Nothing anywhere answers "which objections
  were closed, by what, and which are still standing."

---

## Battery-stage mapping (SPLIT / WEIGH / COMPOSE)

Stage texts read from `docs/missions/2026-08-02-battery-llm-vs-machine/upstream/human-plan.md`
(SPLIT = Q26–31, WEIGH = Q32–38, COMPOSE = Q45–50).

### SPLIT — "break the question apart, if that was justified" (Q26–31)

**What the stage needs to do:** decide whether a split is warranted at all; state what must
*all* be true for the claim to hold and what single thing would sink it; name what the split
does **not** cover; make each piece independently answerable by someone who never saw the
parent question; state each piece's falsifier and the size of difference that would count;
record whether flipping a piece would actually change the answer (and deprioritize it if not);
and have a *different lineage* split the same question blind and take the union of sinkers.

**Reads (V2 shapes it can use today):** the node row (type, parent, depth, position, path,
claim); the parent's active generation prose; the reduced scoring record's claim type, scope,
implied assumptions and ambiguity flags; the recommended-investigation list (`decompose` is
already an emitted action); the exploration decision plus its reasons and categorical/scalar
class; the expansion budget/depth rails and the frontier priority.

**Writes today:** a new child node in exactly one of two shapes — a CON child (from
`challenge`) or a PRO child (from `seek_evidence`) — pre-created as a *pending placeholder*
with a descriptive-of-the-request label ("Additional supporting argument" / "Additional
challenging argument"), plus the queued job carrying parent id, polarity, lens label and the
free-text decision reason; then the immutable decision record; then, on completion, the
child's real title/prose and its evidence children.

**What the V2 model lacks for SPLIT:**

1. **No conjunction/disjunction structure.** Q26 asks what would *all* have to be true. V2 has
   only a bag of siblings and a probabilistic-sum aggregation that treats every sibling as an
   independent accumulating support. A "these three must jointly hold" split is not expressible
   at all — and Q45 explicitly turns on the difference between accumulating and multiplying.
2. **No coverage / residual-scope field.** Q27 ("what part of the original question am I simply
   not covering") has no home. Nothing on the parent records what the children collectively
   fail to address.
3. **No isolation/self-containment flag.** Q28 is *literally the stranger test applied to a
   sub-question*, and the node has no field asserting it, no test recording it, and no gate
   blocking a non-self-contained child.
4. **No falsifier / materiality-threshold field.** Q29 needs "what would make this false, and
   how big a difference counts." Nothing on the node. (Model B's orchestrator has a materiality
   threshold, but as an engine constant, not a per-node claim.)
5. **No sensitivity-to-flip field.** Q30 wants "if this flipped, would my answer change." The
   frontier priority is a ranking heuristic (impact × uncertainty × dispersion), not a stated
   counterfactual, and it is not persisted as a per-node claim about the parent.
6. **No alternative-decomposition record.** Q31 needs a *different lineage's* independent split
   and the union of sinkers. V2 has cross-model authorship (POV branches round-robin across
   providers; adversarial attacks are authored by a different family) but no shape that holds
   two competing decompositions of the same node side by side.
7. **Only two child shapes.** Support / challenge. No "necessary condition", no "sub-question",
   no "assumption", no "scope carve-out".
8. **Split-justification is never recorded as such.** Q26's precondition ("if that was
   justified") maps loosely onto the decision's stopping reason, but the reason is a
   `; `-joined string of policy prose, not a typed justification.

**Fit, one sentence:** SPLIT can reuse V2's decision→spawn plumbing, its budget rails and its
categorical-steering law nearly wholesale, but every *epistemic* output of the stage —
conjunction structure, uncovered scope, self-containment, falsifier, flip-sensitivity, rival
decomposition — has no field to live in.

### WEIGH — "weigh each piece of evidence" (Q32–38)

**What the stage needs to do:** test each piece of evidence for being *about the question*
(admissibility, not quality); name the strongest thing actually found that argues against;
apply symmetric scrutiny to for- and against- evidence; discount a source that would say this
regardless (interest/funding); distinguish *measured* certainty from *felt* certainty; name
what could have gone wrong in a specific study; and decompose where the uncertainty in a
number is coming from.

**Reads:** evidence nodes and their typed annex (kind; method `model-claim` vs `retrieval`;
for retrieval: url, verbatim quote, publisher, date, retrieval query, stance, resolution
status); the evidence lifecycle snapshot (status, availability, entailment, verification
status, unavailability reason, observed/recorded/checked timestamps, producer, run identity,
content hash); the reduced scoring record (evidence quality / relevance / sufficiency / source
reliability / freshness on the judge side; the eight public scores; holes; fatal flags; score
caps; judge disagreements; uncertainty drivers and their measured-vs-heuristic source); the
per-claim evidence-independence aggregate; the raw judge artifacts.

**Writes:** node scoring results and judge artifacts; the reduced payload; the evidence
verdicts that turn evidence edges on; τ and τ-source; evidence lifecycle snapshots.

**What the V2 model lacks for WEIGH:**

1. **No admissibility gate (Q32).** V2 scores *relevance* as a 0–1 judge scalar. The battery's
   rule 2 makes off-subject evidence **inadmissible**, which is a categorical exclusion, not a
   discount. There is no subject-definition object on the debate and no per-evidence
   in-scope/out-of-scope verdict; the scoring record's `scope` object (population, timeframe,
   geography, domain) is the raw material but is never used to admit or exclude anything.
2. **No source-interest field (Q35).** The evidence annex has publisher and url but no funder,
   no stake, no conflict-of-interest marker, and no "would say this either way" flag. The
   independence bookkeeping that does exist is explicitly scoped to *sourcing breadth*, and its
   own honesty note says it is never a claim about truth.
3. **No symmetry-of-scrutiny record (Q34).** Nothing records how hard each side was examined —
   no per-node examination depth, no read-fully-vs-skimmed marker.
4. **Partial, honest support for Q36 (measured vs felt certainty)** — this is V2's *best*
   battery alignment. It already distinguishes uncertainty measured from judge dispersion from
   the hand-coded heuristic fallback, publishes which one produced the number, publishes a
   closed set of uncertainty driver codes, and explicitly documents that its calibration
   weights are declared cold-start values and never learned. What is missing is the
   **track-record** half: no store of past calls versus outcomes, so "I have nothing to
   calibrate against" cannot be *demonstrated*, only asserted.
5. **No per-study risk-of-bias field (Q37).** Statistical flags exist on the in-memory source
   record (Model B) and nowhere on the persisted evidence node. Attrition, blinding, dropout
   asymmetry have no home.
6. **No uncertainty decomposition (Q38).** V2 gives one uncertainty scalar plus labelled
   drivers. It cannot say "this much from sample size, this much from dropout, this much from
   analytic choice — and the third cannot be given a range."
7. **Strongest-counter is structural, not searched (Q33).** The cross-exam report picks the
   strongest **existing CON child**; it explicitly does not generate counterarguments and
   explicitly does not decide who won. "The strongest thing I actually found" therefore
   silently means "the strongest thing already in the tree."

**Fit, one sentence:** WEIGH is the stage V2 is closest to serving — its rubric, its
dispersion-measured uncertainty and its declared-not-learned honesty labels transfer almost
directly — but admissibility, source interest, per-study bias and uncertainty decomposition
are all missing, and its "strongest counter" is a tree lookup rather than a search.

### COMPOSE — "put the pieces back together" (Q45–50)

**What the stage needs to do:** state the combination rule and show that the rule changes the
result (multiply vs accumulate); identify the single load-bearing piece and confirm it was the
most-checked one; report what the *other* combination rule would have produced; compare the
worked answer against the straight-off answer; state fragility (what must be dropped or
merged before the answer flips); and refuse to name a winner when the win depends on weights
nobody authorised.

**Reads:** every node's τ and τ-source; the derived support/attack edge sets; the DF-QuAD
kernel's aggregation and mediation; the root strength; τ coverage; the convergence record
(converged flag, max delta, epsilon, nodes compared/added/removed, compared-run id, and typed
non-comparison reasons: first evaluation, semantics changed, topology changed, strengths
unavailable); the cross-exam report; the verification rollup and its source (real verdict vs
kind-classifier fallback); the bounded synthesis payload (per-branch summaries, top-K
load-bearing nodes by impact × strength, top-C contested nodes by widest cross-family field
spread, and an honest omitted count); the verdict band with its declared thresholds and its
evidence gate.

**Writes:** a protocol-analysis run (strengths, graph fingerprint, τ sources, τ coverage,
semantics version, a composition note, convergence, cross-exam, verification statuses and
sources, claim types and their sources); the synthesis record (strongest pro, strongest con,
verdict text, upstream run ids, analyzer findings, provenance); the verdict summary (band,
plain-language claim sentence, basis, threshold version, evidence-gate state, caveats,
suppression reason).

**What the V2 model lacks for COMPOSE:**

1. **The combination rule is fixed and unnamed (Q45, Q47).** DF-QuAD's probabilistic sum is the
   *only* aggregation available. It is accumulation. There is no multiplication path, no way to
   declare "all three must hold", and therefore no way to compute — let alone publish — what
   the other rule would have given. Q47 ("if I'd combined these the other way, would I be
   giving the opposite answer?") is **structurally unanswerable in V2.** The published
   composition note is honest about what it is (τ = judge strength or default; verification
   modifier none; model weight constant 1.0) but that is a description of one fixed rule, not a
   choice with an alternative.
2. **Independence is assumed and never stated.** Probabilistic sum treats siblings as
   independent. Q45's core move is to *state that assumption and name where it is violated*
   ("two of them lean on the same trial"). V2 has no shared-support / correlated-evidence
   relation at all; the per-claim evidence-independence aggregate measures sourcing breadth
   over one claim's own direct evidence children, not correlation between siblings.
3. **Load-bearing is a ranking, not a counterfactual (Q46).** The synthesis payload ranks by
   impact × strength; nothing recomputes the verdict with a node removed. "Take away the 2025
   analysis and my answer flips" cannot be produced. Nor is it cross-referenced with how hard
   that node was checked.
4. **No fragility / leave-one-out surface (Q49).** Same root cause. The convergence record
   measures drift *between runs* (did the numbers stop moving), which is a different question
   from *what would have to change for the answer to flip*. Q49's second half — "count the three
   overlapping analyses as one and the effect halves" — needs the merge relation item 2 lacks.
5. **No straight-off baseline (Q48).** Nothing records the answer the system would have given
   without decomposition, so the worked-vs-quick gap that is supposed to *lower what is claimed*
   cannot be computed. (Battery Q10 says to write that straight answer down at SPLIT time —
   so this is a joint SPLIT/COMPOSE gap.)
6. **Weight ownership is not represented (Q50).** V2 does publish that its verdict thresholds
   and calibration weights are **declared, not learned**, and versions them so they cannot
   change meaning silently — that is real and should carry. What is missing is *whose* weights
   they are: no field says "nobody authorised this trade-off, so hand back the comparison
   rather than a winner." V2 always emits a band.
7. **Multiple defensible readings cannot coexist.** Q47 and battery Q43 both require serving
   two answers side by side. The synthesis record holds exactly one verdict string; the verdict
   summary holds exactly one band. There is one honest precedent to build on — the evidence
   gate already runs in **shadow mode**, publishing what it *would* have suppressed alongside
   the unsuppressed band — but that pattern is not generalised.

**Fit, one sentence:** COMPOSE is where V2 fits worst — its single fixed accumulating
aggregation, its assumed sibling independence and its single-verdict output make Q45, Q47, Q48
and Q49 unanswerable in principle, not merely unimplemented.

---

## Stranger-test field audit

**The obligation** (inherited V ruling, plus rule 9 of the human plan): every generated node
*and* the verdict must be individually restatable by a stranger — a reader who knows nothing
about the system must be able to say back what the node claims, how sure we are, and what
would change it, from the node's own served text. The plan's layout rule binds with it: the
top layer of anything served is human language only, and **a bare number with no human meaning
never appears in the top layer**.

### Fields that already serve it

| Field / shape | Where | What it serves |
|---|---|---|
| `claim` (node title) | node row | the node's headline in plain words; guaranteed non-blank at serialization |
| generation body (`title` + blank line + `content`) | generation | the node's argued prose; genuine human language |
| `label` (derived) | serialization | a display name for lens containers whose type literal is misleading |
| `stopping_reason_human` | serialization | **the strongest existing precedent.** A shared code→plain-copy map turns internal codes into honest sentences, passes already-human prose through unchanged, returns nothing for an absent reason (no fabrication), and gives an explicit generic fallback for an unrecognised code rather than inventing a specific one. Its copy is unusually careful — it distinguishes "paused" (an operator can raise this rail) from "stopped" (settled or elapsed), and it deliberately declines to overclaim ("the conclusions stopped moving", not "the question is settled"). |
| `rationale.why_not_higher` / `why_not_lower` / `weakest_link` | scoring record | a human-legible defence of the score in both directions and a named weakest link — close to "how sure, and why" |
| `uncertainty_drivers` (code + label) + `uncertainty_source` | scoring record | named, human-readable reasons for the uncertainty, plus an honest statement of whether the number was measured or heuristic |
| `holes` / `fatal_flags` / `score_caps` (typed + severity + description + source/trigger) | scoring record | described weaknesses in prose, not just flags |
| `judge_disagreements` (judges, type, severity, description) | scoring record | disagreement stated in words |
| `evidence_metadata` for retrieval evidence (verbatim quote, url, publisher, date, retrieval query, stance) | node annex | a stranger can check the source; the quote is verbatim by construction |
| `evidence_metadata.method` (`model-claim` vs `retrieval`) | node annex | **the ways-of-knowing distinction, already present**: "this is the model's own prose" vs "this came from outside" — exactly the surface translation rule 9 demands |
| extraction honesty law | evidence extraction | evidence spans are verbatim substrings, never rewritten or summarised, and an empty result is honest and expected |
| verdict `claimLanguage` + `basis` | verdict summary | a deterministic plain sentence that always ships **alongside** the real strength, coverage, verification status and convergence — never band-alone, never a bare number alone |
| declared-not-learned labelling + version constants | verdict / calibration | a stranger is told the thresholds are declared, not calibrated, and the version is stamped so meaning cannot change silently |
| evidence gate + suppression reason with `unlock` steps | verdict summary | when a verdict is withheld, the stranger is told why in prose *and* what would unlock it |
| `caveats` and `transcript` | **Model B only** | per-node caveats and a turn-by-turn debate record — not available to any persisted node |

### Fields that are MISSING for it

Ordered by how much they block the obligation.

1. **No plain-language node restatement.** *(top gap)* No persisted node carries a
   stranger-readable one-paragraph statement of what it claims, how sure we are, and what would
   change it. The `claim` is a headline; the generation body is model prose written for the
   debate, not for a stranger; the scoring rationale is a separate artifact keyed by node id
   that may be absent or stale. Nothing is generated *for* the stranger, and nothing is checked
   against a stranger.

2. **No per-node revision trigger.** "What would change it" — required by the test at both node
   and verdict level — exists nowhere. The verdict has a related shape only in the negative
   (the suppression `unlock` list). Nodes have nothing.

3. **No node-level provenance projection.** *(explicitly flagged in the ticket, confirmed)*
   The node row carries **no** authorship. Model id, worker, prompt version and the rendered
   prompt live on the generation; job linkage lives on the job; artifact attribution lives in a
   separate provenance table keyed by artifact kind and id; the judge identity lives on the
   scoring result. A stranger reading a node cannot see who wrote it, with what prompt, at what
   version, or on which run — every one of those is a join away, and the serialized node exposes
   only a generation summary.

4. **No stranger-test status on the node.** No pass/fail marker, no timestamp, no record of who
   or what performed the restatement, and therefore no gate. The test is defined as
   diff-the-restatement-against-the-record and **blocks serving**; V2 has no field to block on.

5. **Bare numbers reach the top layer.** The scoring rationale's one-line summary is built as
   "<claim> scored 0.62 with 0.31 uncertainty" — two uninterpretable numbers with no human
   meaning, which is precisely what the layout rule forbids in the top layer. The verdict's
   plain sentence is better (it always carries a qualitative band), but it still embeds a raw
   dialectical-support figure in the served sentence.

6. **"Why it matters" is computed and then discarded.** The judge panel's context assessment
   produces a `why_it_matters` sentence and a typed relation-to-root (supports / attacks /
   clarifies / side_issue). Neither is projected into the public per-node record. This is a
   ready-made, already-generated stranger field being dropped on the floor.

7. **No per-node certainty in words.** Qualitative labels exist for strength, uncertainty and
   impact — as three-value enums (weak/mixed/strong, low/medium/high). A stranger needs a
   sentence, not an enum, and the enums are not composed into one.

8. **Extracted evidence nodes are decontextualised.** A model-claim evidence node's text is a
   verbatim sentence lifted out of the parent's prose. Standing alone — which is exactly how the
   stranger test reads it — a bare mid-argument sentence frequently fails to say what it claims
   or what it is evidence *for*. There is no per-evidence "what this shows" field.

9. **Lens containers claim to be something they are not.** A perspective node typed
   `SCIENTIFIC_POV` but labelled "Confounding POV" (because the type was assigned by ordinal
   cycling) is actively misleading to any consumer that reads the type. Node-level identity must
   be self-describing.

10. **Placeholder text is served.** A pending expansion child carries "Additional supporting
    argument" / "Additional challenging argument" — honest about the request, but not a claim,
    and it is a real serialized node until the job completes.

11. **Silent structural drops are invisible at the node.** The unmapped-edge / lens-no-edge /
    orphaned-parent markers land in a debug τ-source map. A node that contributed nothing to the
    verdict looks identical, at the node, to one that did.

12. **The residual objection set is unserved.** A stranger cannot be told "these objections were
    closed and by what; this one is still standing" — the pieces exist (unopposed flag, holes,
    fatal flags, abandon blockers) but are never assembled and never reach the node.

---

## Uncertainties

1. **Coverage knob is still open (ticket 12).** Whether the stranger test applies to *every*
   node, to load-bearing nodes only, or to a sample is V's call and is not resolved here. The
   field audit above is written for exhaustive coverage (the ruling's plain reading); a
   load-bearing-only ruling would let some fields be computed lazily but would not remove any of
   them, because "load-bearing" is itself only knowable after COMPOSE.

2. **Which model V3 inherits from.** I have documented Model A and Model B as coequal
   inventories. The evidence that Model B is not on the production path is strong (no import of
   the recursive orchestrator from any service, protocol, scoring or exploration module; its
   only entry point is an in-memory run endpoint with a non-persisting repository) but Model B's
   per-node shape is closer to what the battery wants. Which one V3's carryover manifest treats
   as "the" preserved node-by-node reasoning is a decision, not a finding.

3. **Whether the fixed accumulating aggregation is in the preserve set.** The inherited V steer
   preserves "the scoring machinery (QBAF/DF-QuAD framework, per-node judging, trusted-run
   reconstruction, qbaf_debug view)" and replaces "hardcoded aggregation." Those two clauses
   are in tension for COMPOSE: DF-QuAD's probabilistic sum *is* the aggregation, and Q45/Q47
   require at least two selectable rules with both results published. I have written the
   COMPOSE gaps assuming the rule must become a choice; if the steer means the kernel is
   preserved and a second rule is layered beside it, the gap list is unchanged but the
   remediation shape differs. Flagging rather than resolving.

4. **Edge-level weight.** V2 has a node-level τ and no edge weight (Model A) but a real edge
   weight (Model B). Whether V3 needs per-edge bearing strength ("how much does this argument
   bear on *that* parent") is a design question the battery does not settle directly, though
   Q45's independence discussion and Q49's merge operation both point toward needing it.

5. **Reason-code vocabulary size.** The plain-copy map covers the codes reachable today, plus
   some defensive entries for codes not currently reachable on any wire payload. I did not
   enumerate every reason string the exploration policy authors as free prose (they pass through
   the humanizer unchanged because they contain spaces). If V3 wants every stopping reason to be
   a typed code with mapped copy — which the stranger test implies — that vocabulary needs to be
   closed, and V2's is not.

6. **The `stop` stopping-status literal.** I found a value written to the node's stopping-status
   column that the decision-record validator would reject. I have reported it as an invariant
   gap. I did not exhaustively audit for other vocabulary drift between node columns and audit
   records; a targeted sweep would be cheap and is worth doing before the carryover manifest
   claims the lifecycle vocabulary is closed.

7. **Node counts under dynamic perspectives.** The type-literal cycling means two sibling
   perspectives can share a type. I have not verified whether any *other* consumer besides the
   graph adapter and the label logic dedupes or groups by node type in a way that would silently
   merge two distinct perspectives. Worth one grep before V3 assumes type is safely ignorable.
