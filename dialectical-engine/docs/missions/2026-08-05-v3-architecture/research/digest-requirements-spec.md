# Digest — `docs/founding/requirements-spec.md` (architecture-facing)

Source: `/Users/vladmihaimiron/Documents/DebateAI-V3/docs/founding/requirements-spec.md`
(3583 lines, header `ACCEPTED — DR-067 (2026-08-05) — mission REQ-V3-GREENFIELD-R1`).
Vocabulary reference: `/Users/vladmihaimiron/Documents/DebateAI-V3/docs/founding/GLOSSARY.md`.

Reading contract for this digest: every claim below carries its spec section and/or DR.
Nothing here proposes architecture. Where the spec is silent, the silence is recorded in
§7 or §8 and not filled in.

**Three global facts an architect must internalise before anything else:**

1. **The spec constrains behaviour only (DR-005), with exactly one stack exception:
   Postgres (DR-024, §20).** Everything else in §3 is a shape-of-behaviour constraint,
   not a stack constraint — but several behaviour constraints (purity, replay,
   provider-agnosticism) bind the stack anyway by construction. See §3 of this digest.
2. **This document deliberately does not specify the six kept organs.** The scoring
   engine, per-node judge contract, the one graph, decision→spawn plumbing, the
   execution ledger, and the serve layer + debug facet are specified in
   `carryover-manifest.md` §§4–9 (spec §1, "Cross-references, never duplication").
   M1–M4 + F1 live in manifest §4.2(e)–(i) (spec §18 O-4). The defect register D1–D5
   lives in manifest §10. **Architecture must read the manifest for those organs.**
3. **Authority tags.** Every normative clause is `RULED(DR-n)` (build it, will not change
   without a new DR) or `CARRIED-DESIGN` (build it, expect refinement). The `CANDIDATE`
   class is empty (§2.1, §26.2: 168 RULED / 51 CARRIED-DESIGN / 0 CANDIDATE).
   `[CD]` inside §3's table marks requirement text exceeding its DR's exact words.

---

## 1. Document map

| § | Title | What it governs |
|---|---|---|
| 1 | How to read this document | Battery framing (62 Q + 9 R, 11 stages LOCK→SETTLE); MACHINE/LLM/HYBRID label semantics; label law DR-037; human-rule law DR-036; row-boundary law DR-040; activation vocabulary ACTIVE/INACTIVE/WAIT/POLICY_BLOCKED; cross-reference policy to the manifest. |
| 2 | Governing law and order of authority | The 12 standing laws: ledger is authority, every row disposed, behaviour-only + Postgres exception, nothing must match V2, no invented measurements, no judgement ⇒ no number, everything recorded, the replay law, house rules as floors, one engine/graph/serving truth, no orphaned modules, race retired. |
| 2.1 | Authority tagging | The two-tag system and the three standing rules R-AUTH-1..3. |
| 2.2 | The coexistence rulings | Index of DR-049…DR-064 and which section states each in full. |
| 3 | Row-closure table — all 71 rows | The per-row contract table: disposition (substance/enforcement), seat provenance, activation condition, the substantive obligation, and the developing chapter. §3.1–3.11 by stage, §3.12 the nine rules, §3.13 roll-up (13 MACHINE / 57 HYBRID / 1 LLM). |
| 4 | The V-owned knob register | 19 named V-set parameters with values, DRs, and unresolved-behaviour. §4.1 annex: six further V-set values carried by the knob batches. Closes with the naked-constant printing law. |
| 5 | Framing and typing — LOCK and ROUTE | 5.1 label law + two-field record; 5.2 the five terminal routes; 5.3 pre-commitment freeze of answer rule and prior; 5.4 question typing + the visible fallback; 5.5 mixed empirical/value two-phase law (DR-053). |
| 6 | Pre-search declarations | 6.1 the five machine refusal powers; 6.2 the ignorance ledger; 6.3 interests recorded before reading; 6.4 the blind topic check. |
| 7 | Evidence policy | 7.1 frozen query set + typed amendments; 7.2 admissibility and the mixed off-subject rule; 7.3 access depth and absence rows; 7.4 provenance-cluster counting; 7.5 freshness at harvest. |
| 8 | Evidence appraisal | 8.1 Q34 symmetry as a machine diff (A-1…A-13, the two ledger stamps); 8.2 Q35 motive/diagnosticity; 8.3 Q37 seven bias domains; 8.4 certainty, adverse evidence, uncertainty sources, the disagreement flag. |
| 9 | The decomposition loop — SPLIT | 9.1 children+defeaters in one act; 9.2 standalone readability and coverage; 9.3 falsifiers and the ban on silent killing; 9.4 the rival carving; 9.5 sensitivity deferred to compose-time. |
| 10 | Recomposition — COMPOSE | 10.1 the declared operator and the rival operator; 10.2 leverage, fragility, the bounded halt; 10.3 holistic vs decomposed diff; 10.4 comparison criteria and weights; 10.5 the loop-free law at three layers. |
| 11 | Where a row ends — the row-boundary law | Q22 / Q39 / Q45 ownership rulings and the general hand-off obligation. |
| 12 | Serve architecture | 12.1 four-step composition; 12.1a the SERVE state machine; 12.1b compose size law; 12.1c degraded-mode obligations; 12.2 the blocking gates in execution order; 12.3 the partition law + the 5/22/4 exhaustive enum table; 12.4 belief movement; 12.5 the replay law + execution ledger; 12.6 the wire boundary and the nine honesty surfaces; 12.7 the canonical `stranger_restatement` contract; 12.8 the verdict model (four axes). |
| 13 | Staleness and liveness | 13.1 snapshot + wake + propagate; 13.2 composite archival retirement and UNDER-EXPLORED. |
| 14 | Lineage and independent critique | 14.1 different maker = different lineage; 14.2 cap-label-lift; 14.3 the receipt and what the critic does; 14.4 multi-maker as a launch gate. |
| 15 | Value weights and the value boundary | 15.1 the computed Pareto trigger; 15.2 Flows A/B/C; 15.3 the overlay-detachment invariant and marking rules. |
| 16 | Scorecards, model ledger, routing | 16.1 the two-tier wall (process vs capability facts); 16.2 cell shape and honest reporting; 16.3 settled-outcome→weight chain; 16.4 always-evolving weights and cold start; 16.5 the Postgres model ledger and the eight routing guards G1–G8; 16.6 pointer to register block A. |
| 17 | Cross-run memory (Q61 retrieval) | 17.1 three bounding laws; 17.2 the four-tier match ladder; 17.3 link-never-merge; 17.4 the payload ladder and the forbidden cell; 17.5 how memory enters a run; 17.6 what is served + three blocking gates; 17.7 the shared substrate; 17.8 pointer to register block B. |
| 18 | Composition and product topology | J1 one scoring engine, J2 one graph, J3 one serving truth; M1–M4 + F1 by reference; the FINAL organ↔stage table; the labeled-arrow perimeter. |
| 19 | The eight house rules | H1–H8 with standing (successor governs / rule governs) and where each binds; H-9 convergence; H-10 the three successor-less rules. |
| 20 | Stack constraints imposed by V | W-1 Postgres including observability; W-2 start from scratch; W-3 one store many indexes; W-4 keep the property drop the SQLite accident; W-5 the flag register drawn fresh (DR-023). |
| 21 | Abstention — pricing "I don't know" | N-1…N-8 the cost-ratio matrix and the over-abstention check; 21.2 the run cost envelope (N-9…N-14). |
| 22 | Acceptance | The five charter clauses this spec serves; 22.1 the checkable launch gates table; Z-1 fail-on-purpose discipline; Z-2 literature vectors + property tests as ground truth. |
| 23 | The ratified register | 51 rows, all ratified, each with what-it-is / why-it-matters / options / recommendation and the adopted option stamped. 23.A fairness+scorecards+routing (19), 23.B cross-run memory (24), 23.C verdict model + fire bar (2), 23.D residuals this spec surfaced (6). |
| 24 | Traceability index | Every DR-001…DR-064 → where it binds in this document, plus the source research files. |
| 25 | Input contradictions | 25.1 nine withdrawn/verified-fixed items; 25.2 two standing items by design. |
| 26 | Authority audit | 26.1 eight lint rules L1–L8 and current results; 26.2 tag distribution; 26.3 the three things genuinely not settled; 26.4 the standing edit rule. |

---

## 2. System obligations inventory

Grouped by subsystem. Each entry: what it must do → citation.

### 2.1 Battery stage engine (LOCK → SETTLE)

The engine executes 71 rows across 11 stages. Each row is a contract with a
**disposition** (MACHINE = prohibition on model calls, LLM = licence, HYBRID = both
mandatory), a **substance** field, an **enforcement** field, and a written **activation
condition** (§1, §3, F-1/F-2/F-3 §5.1).

- **Activation states are first-class run state**: ACTIVE, INACTIVE (skip recorded with
  predicate + evidence), WAIT (state does not yet hold the input — **no model call may
  guess the missing input**), POLICY_BLOCKED (a V decision is missing; must never be
  filed as INACTIVE) (§1). A cache hit never sets a row INACTIVE (§1; OD-M-22 §23.B).
- **Exactly three rows are unconditional**: Q1, Q51, Q62's liveness limb (§1). The
  `·A·` always-run marker is retired and must not appear as a fire condition (§1).
- **13 MACHINE rows** — Q15, Q17, Q22, Q23, Q34 (verdict limb), Q39, Q42, Q46, Q47, Q49,
  Q53, Q56, Q60 — each proven to make **zero model calls**, asserted by the test suite
  (§3.13, §5.1 F-1, §22.1 "Zero-call proof").
- **57 HYBRID / 1 LLM (Q27)** (§3.13).
- **Five terminal routes** code enforces, each a recorded servable outcome, each with a
  both-ways fixture: `INERT` (Q1), false-presupposition non-answer (Q3), value→human
  (Q7, pure value acts only), `NOT_EMPIRICALLY_DECIDABLE` (Q9), depth-zero no-split
  (Q10) (§5.2 F-4). Q51 provenance is never disabled on a terminal (§5.2 F-4, S-10 §12.2).
- **Row-boundary law**: a row owns only the work its contract names; triggered judgement
  bills to the owning row and the route is written down; a blocker owned by nobody is a
  spec defect (§11 B-1, DR-040). Named routes: Q22→Q25 (blocked execution),
  Q39→Q40/Q41/Q44 (the critic's actual attack), Q45's three-way fast path.
- **Named hand-off artifacts**: Q10's undivided baseline is stored and is Q48's only
  comparator (never regenerated); Q9's strongest discriminator is handed to Q20 as a
  probe candidate (§5.2 F-5, §10.3 C-8).
- **Two-phase execution for mixed questions**: a typed DUAL SETTLEMENT ACT at Q7 runs
  phase 1 (empirical, full battery incl. CROSS/WEIGH/COMPOSE) then phase 2 (value
  machinery of §15) **on one shared graph**, with **machine-enforced phase order**, and
  serves one answer with two labelled sections (§5.5 F-10…F-14, DR-053).
- **Re-activation**: R3 is the only row with an explicit re-activation clause — the
  ignorance ledger re-fires on new evidence (§3.12 R3). Q61 is the battery's only
  cross-run trigger and may sit in WAIT indefinitely without that being a defect
  (§3.11 Q61).

### 2.2 Pre-commitment and freezing machinery

- **Q4 answer rule**: written, **frozen, hashed and timestamped before the first
  retrieval**; a run with no Q4 does not start; `before_first_search` is an ordering
  deadline, not an activation conjunct (§3.1 Q4, §5.3 F-6).
- **Q5 prior**: typed `prior_basis ∈ {STATED, ANCHOR_CLASS, CARRIED_POSTERIOR,
  NO_COMPARABLE_CLASS}` — **no DEFAULT, no ASSUMED member**; silent 0.5 forbidden;
  retrospective prior forbidden; never revised upward (§3.1 Q5, §5.3 F-7, M-18 §17.5).
- **Q11 query set**: derived from the question, includes disconfirming terms, deduped,
  frozen, versioned and hashed before any retrieval (§7.1 E-1).
- **Q21 probe prediction**: expectation + falsifying result frozen, hashed, timestamped
  before execution; not reusable across runs (§3.5 Q21).
- **Q2 binding**: dated inclusion/exclusion over population, comparator, outcome, time —
  the **sole scope key** for retrieval, admissibility (Q32) and the cross-run memory key
  (§3.1 Q2, §7.2 E-4).
- Recorded weakness, not papered over: the self-held hash-and-timestamp envelope around
  Q4/Q5 is a **weak** commitment device (§5.3).

### 2.3 Evidence subsystem (search, admit, count)

- **Frozen-query enforcement**: retrieval on an underived query is refused; amendments
  are typed **mechanical repair** (full confirmation power) vs **semantic re-aim**
  (exploration only; confirmation requires re-freezing and re-running); every amendment
  logged with type + reason and visible at serving (§7.1 E-1…E-3, knob 2 DR-008).
- **Admissibility mixed rule**: wholly off-subject **rejected before scoring** with the
  reason logged; partly relevant **admitted downgraded** with the off-subject share named
  and the downgrade visible at serving; no third path (§7.2 E-5, knob 3 DR-009,
  condition mark `OFF-SUBJECT-DOWNGRADE`). This is a **cardinality** decision — it
  decides how many items reach a semantic call at Q32 (§7.2 E-6).
- **Access depth as a three-valued required record**: `OPENED_FULL`, `PREVIEW_ONLY`,
  `ACCESS_BLOCKED`, plus primary/secondary. **A preview-only source may never supply a
  number or a quote** (§7.3 E-7).
- **Span archival + exact comparison**: locator, version, retrieval time archived;
  character-level exact comparison wherever supported; **eight typed citation failure
  routes from day one**; the hard-kill gate auto-activates when the character-level quote
  matcher ships and validates (§7.3 E-8, knob 13 DR-020 knob 7).
- **Absence rows**: every zero-result search projected into a typed `{query, scope, date}`
  row — absence is a servable finding (§7.3 E-9, Q17 §3.4).
- **Provenance-cluster collapse**: sources partitioned by a **declared provenance key**;
  each cluster contributes **once, at its strongest member**; a gate, not a bonus.
  Worked effect: three restatements of a 0.40 claim contribute 0.400, not 0.784
  (§7.4 E-10, M3 §18). The partition is **computed from stored fields and never asked of
  a model** (§7.4 E-11).
- **Semantic-restatement flag** `possible_restatement_of: [ids], similarity: x.xx` —
  non-gating, changes no number (§7.4 E-12, F1 §18).
- **Freshness**: newest-source age computed against the run's `as_of`, **never cached**;
  fast-moving + stale ⇒ refuses; slow/static ⇒ serves with an explicit staleness
  statement; no registry volatility class ⇒ WAIT, un-waited by exactly one classification
  call (§7.5 E-13, Q18 §3.4).

### 2.4 Evidence appraisal and the symmetry instrument

- **Two new execution-ledger stamps on every action row**: `subject_item_id` and
  `stance_at_action ∈ {SUPPORTS, ATTACKS, NEUTRAL, UNASSIGNED}` (§8.1 A-1, DR-045,
  OD-A-02). Everything else the diff needs is already owed by DR-027/DR-034.
- **Closed action-kind vocabulary** with no member lacking an obliging row; an executed
  check mapping to no member is `UNCLASSIFIED_ACTION`, itself an `UNINSTRUMENTED` trigger
  (§8.1 A-2).
- **The symmetry verdict is a set/count diff, not a score**: same checklist (set equality
  of applied action kinds), same access depth (counts per bucket), same actions per side;
  output is a repair instruction with `remediation_targets`, `blocked_not_lazy`, and the
  per-side census (§8.1 A-3). **No fairness scalar** (A-3a, OD-A-01).
- Diff runs on `stance_at_action`; reclassifications on a separate line (A-4, OD-A-03).
- `BLOCKED` / `FAILED` / `SKIPPED_BY_BUDGET` are first-class outcomes; `blocked_not_lazy`
  served **beside** the asymmetry (A-5).
- **`UNINSTRUMENTED` withholds the fairness claim**, caps the top confidence band, names
  `remediation_targets` as the lift condition, and re-scores when they run — cap and
  label, never halt (A-6, A-7, OD-A-05).
- **Marked model remediation layer**: on `UNINSTRUMENTED` a model explains the gap, grades
  effort, suggests closure; served openly marked model-authored and biased; never replaces
  the verdict, never gates; reader gets an **investigate-deeper** affordance built from
  constructed prompts (A-8, DR-045; honesty surface 6 §12.6).
- **Anti-theater list**: the verdict may never be a pass from absent fields, an average
  over the two sides, or a time/token comparison (A-10).
- **Prevention alongside detection**: **stance-blind appraisal** — the side label is
  stripped from the appraisal prompt — run alongside the post-hoc diff (A-11, OD-A-07).
- **Two liveness fixtures are part of the row**: deliberate-asymmetry ⇒ `ASYMMETRIC` with
  exact targets; stamps-stripped ⇒ `UNINSTRUMENTED` and never `SYMMETRIC` (A-12, OD-A-09,
  §22.1).
- **Q34 and Q46 are one schema ask**: without the stamps, Q46's ratified MACHINE gate is
  dead code on day one (A-13).
- **Q35 motive**: source interests joined to competing hypotheses; a non-diagnostic source
  is **retained at exactly zero weight** — never deleted, never averaged (§8.2 A-14).
- **Q37 seven bias domains** prefilled from study metadata, each with a finding, a
  direction/magnitude where supported, and a **disposition of repair / bound / exclude that
  code enforces**; a warned-about bias may never be averaged away (§8.3 A-15, A-16).
- **Q33 / Q36 / Q38**: strongest adverse item *actually found* per claim, else
  `UNADJUDICATED`; imagined counters labelled as imagined; certainty names its measurement
  basis; every served number names its uncertainty source with drivers in fixed order;
  fewer than two parseable judgements ⇒ **no** dispersion measurement, and that absence is
  never read as zero uncertainty (§8.4 A-17, A-18).
- **Judge-disagreement flag**: flag + certainty downgrade; never a silent average, never an
  abstention gate; must demonstrably fire where V2 provably could not (§8.4 A-19, DR-032).

### 2.5 Decomposition (SPLIT) subsystem

- Children and defeaters produced **in one act**; a supports-only output is kept, never
  discarded (§9.1 D-1).
- **Defeater generation is a system obligation**, routed to a **differently-categorized
  model** where the author produced none; the author's self-attack weakness is recorded as
  a **scorecard process fact** (§9.1 D-2).
- A node is complete only when its defeater set is non-empty **or** explicitly
  exhaustion-marked; no third state (§9.1 D-3).
- Code enforces non-empty child+defeater arrays, **bidirectional entailment validation**
  (a carving where neither direction entails is a topic list ⇒ discarded and re-split), and
  the **retry → lineage-rotation → abstain** state machine bounded by the declared cap
  (§9.1 D-4).
- **Caps are inherited artifacts**: regeneration cap **2 rounds / 3 attempts** then a typed
  "not runnable" abstention carrying the rejection evidence; topic cap **N=7** with at
  least one could-overturn topic retained (§9.1 D-5, knob 9 DR-020 knob 5, §4.1 DR-019
  knob 2).
- **Cold-reader test per child** in an isolated context against the bare question; failure
  returns for regeneration; coverage per `strangerTestCoverage` (§9.2 D-6).
- **Q27 is diagnostic only**: `UNCOVERED-SCOPE` note; `coverage_passed` is a forbidden
  claim; coverage becomes a gate only after outcome data sets a threshold (§9.2 D-7,
  knob 14).
- **No kill on author failure at Q29**: falsifier hunt rotates across models; at exhaustion
  the piece wears `UNFALSIFIED-AFTER-ROTATION` and degrades in standing; kill reasons stored
  (§9.3 D-8, D-9).
- **Rival carver (Q31)**: selected for **measured behavioural difference** under the
  maker-diversity floor; packet is **question-only, blinded, fingerprinted**; objections
  **unioned in by code**; material divergence served as uncertainty; degradation ladder is
  `DEGRADED DIVERSITY` → maker-only cold start → `single_lineage` with the
  divergence-uncertainty claim **unavailable** (§9.4 D-10…D-12).
- **Q30 defers all ranking to compose-time arithmetic**; low-leverage children are
  deprioritised, never killed (§9.5 D-13).

### 2.6 Recomposition and the scoring engine boundary

- **One scoring engine** — the re-specified DF-QuAD with typed labeled arrows, M1–M4
  structural rules and the per-parent operator — for both WEIGH and COMPOSE (Q45–Q50).
  **No second scoring path anywhere in V3** (§18 O-1, DR-030).
- **One graph**: SPLIT's children and defeaters **are** the debate graph's nodes and typed
  edges; battery stages operate on that object directly; **no conversion layer** (§18 O-2).
- **One serving truth**: SERVE reads a new battery serve layer built on the execution
  ledger; the debug view is that layer's internal debug facet (§18 O-3).
- **M1–M4 + F1** (manifest §4.2(e)–(i), restated one-line in §18 O-4): M1 base score from a
  judgement or the node contributes nothing (**no default at any layer**); M2 operator
  declared per parent, undeclared ⇒ no parent number; M3 provenance cluster collapse;
  M4 way-of-knowing **ceiling** — a cap, never a multiplier — plus a serving-band rule;
  F1 semantic-restatement flag, non-gating.
- **Operator declaration (Q45)**: declared per parent from the split's conjunction
  structure; two operators, *accumulate* and *strict-and*; policy/config/human-declared ⇒
  **zero model calls**; undeclared ⇒ exactly one bounded declaration call; no declaration
  ⇒ **the parent number is withheld and components are served alone** (§10.1 C-1…C-3).
  Stake: 0.9935 vs 0.0997 on the worked case — a **9.96×** gap (C-4).
- **Rival operator computable on demand**; where it flips the served band, **both readings
  served with the deciding choice printed** — never averaged, never an abstention
  (§10.1 C-4, Q47).
- **Leverage (Q46)**: removal-based impact joined to verification effort; highest-leverage
  + least-verified ⇒ halt and return that input to WEIGH/RUN, **bounded at K=1 round per
  parent per run**, then proceed with a visible `LEVERAGE_UNRESOLVED` residual joined to
  the Q44 and Q53 panels (§10.2 C-5, C-5a, DR-050).
- **Fragility (Q49)** is an output table (reversal set + what would have to change).
  **Sensitivity may never feed back into base scores or arrow strengths** — that loop has
  no declared fixed point; prohibited by construction and tested for (§10.2 C-6, C-7).
- **Holistic vs decomposed (Q48)**: diff **stored** artifacts; enforce matched compute
  (unmatched ⇒ `NON-COMPARABLE`); flag disagreement, downgrade confidence, raise recheck
  priority; **averaging forbidden**; the model explains what the disagreement is
  (§10.3 C-8…C-10).
- **Comparisons (Q50)**: model proposes criteria under **three code-enforced guards**
  (every criterion links to actual evidence or is dropped; rejected candidates served
  visibly; the asker may add criteria via the steering menu). **Weights are human-only**;
  all arithmetic — criterion vectors, Pareto set, rank stability, exact reversal point — is
  machine (§10.4 C-11, C-12).
- **Loop-free law at three layers** (§10.5 C-13…C-15, DR-056): construction **refuses**
  cycle-closing edges and redirects to a typed shared-crux sub-claim or an ancestor attack;
  compute meets a cycle with a **typed error — never a partial result, never a fixed-point
  approximation**; write **rejects** a cycle-creating arrow. "Circular dependency found" is
  served information, not a swallowed error.
- **Position and corroboration are already in the arithmetic**: no factor may re-encode
  graph position into a base score or arrow strength; what is owed is a **per-node position
  label** travelling with the number. Independence failure is a dependence **discount**,
  never an independence **bonus** (§18 O-5, O-6).
- **Labeled-arrow perimeter**: supports/attacks arrows carrying a strength + per-node
  uncertainty as first-class shape; an arrow may target a node that is **not** the source's
  structural parent (which is what makes defeaters expressible, and why the loop law
  exists); the source experiment's score-walking code, loop handling and defaults are left
  behind (§18 O-8, DR-035).

### 2.7 Serve composition and the SERVE state machine

- **Four steps, in order** (§12.1 S-1, DR-044): machine assembles ALL computed facts into
  one structured prompt (**the fact bundle** — nothing enters that is not a computed fact
  or typed record) → **ONE composition model** writes the served text honouring the facts,
  never reciting machinery → **a SECOND model judges text↔facts conformance** → **the
  machine enforces the verdict** (recompose or defect flag). Pure render was rejected.
- **Conformance coverage**: load-bearing sentences **always** judged; non-load-bearing
  sampled at the **frozen stranger rate**; the protected core forbids skipping the
  conformance **role**, never mandates exhaustive sampling; **never budget-skippable**
  (§12.1 S-2, §12.1a S-4b, DR-060, DR-052).
- **The composition model may not introduce a claim, number, hedge or softener with no
  fact behind it** — specifically no familiarity sentence, caveat, attribution or certainty
  statement the bundle does not support (§12.1 S-3).
- **Gate order is law**: **R9 (stranger) → Q53 (objection visibility) → conformance → Q51
  (provenance)** (§12.1a S-4, §12.2, DR-049).
- **R9 runs on both surfaces**: node text pre-compose (its result **binds** the conformance
  judge) and the composed verdict post-compose; a verdict-R9 failure takes the
  components-only terminal and **does not open a new recompose loop** (§12.1a S-4a, DR-057).
- **The conformance judge is subordinate to the stranger law** — it may never demand an
  edit that violates R9 (§12.1a S-5).
- **Q53's residual objection is a fact-bundle FIELD, not prose** (§12.1a S-6).
- **Termination: `max_recompose = 2`.** After the second conformance failure the answer
  serves **COMPONENTS-ONLY** (verified facts + badges + node graph) with a visible
  `DEFECT` badge. Never blank, never unchecked prose (§12.1a S-7). State machine:
  `COMPOSE → CONFORM → {PROVENANCE | RECOMPOSE} → {SERVE | COMPONENTS_ONLY} →
  SERVE/SERVE_DEGRADED`. **No blocked-and-silent terminal exists** (S-8). Six fixtures
  required, one per terminal (S-9).
- **Compose size law** (§12.1b, DR-058): oversized bundles compose in **multiple passes
  ordered by load-bearing priority**; **honesty fields — residual objections, badges,
  condition marks — are machine-injected into the output structure outside the composition
  model's discretion**, so silent truncation of an honesty surface is impossible by
  construction; past the **declared hard bundle budget**, components-only (S-9a…S-9c).
- **Degraded mode** (§12.1c, DR-059): the **reversal point** and the
  **builds-on-previous disclosure** each get a **structured projection field that renders
  without composed prose** (S-9d). **Replay eviction**: a component number failing replay
  is evicted and replaced with a typed `MISSING-NUMBER` mark; the rest of the answer serves
  with a DEFECT badge — one number lost, never the answer (S-9e).
- **The blocking gates at serve time** (§12.2): R9 stranger status; Q53 hidden-objection;
  conformance; Q51 provenance join + **locator gate (a missing locator blocks serving)** +
  reasoning-only downgrade (verdict → hypothesis + research plan); Q55 abstention typing;
  Q57 findings/recommendation separation; DR-034 replay.
- **Q51 is the sole never-disabled serving invariant, for any output including terminal
  non-answers** (§12.2 S-10).
- **Belief movement (Q54)**: **event-sourced — a belief update cites its cause at the moment
  it is made**; retrospective attribution forbidden; ties the record cannot break are typed
  `AMBIGUOUS_ATTRIBUTION`; with no recorded prior, movement claims are **unavailable, not
  zero** (§12.4 S-15, S-16).

### 2.8 Abstention machinery and the partition law

- **The partition (DR-051, §12.3)**: the **five abstention kinds** bind **only
  ignorance-ledger unknowns**, exactly one per unknown. Everything else is a **condition
  mark** in a separate closed enum, servable in parallel. **One answer may wear one
  abstention kind and several condition marks** (S-11, S-14).
- **The exhaustive membership table is the single source of the enum, literal and complete**
  (S-12, lint L7: 22 marks, 0 ellipses):
  - **Home 1 — five abstention kinds**: not searched · searched and found nothing ·
    measured and inconclusive · not runnable · a value choice.
  - **Home 2 — 22 condition marks**: `UNINSTRUMENTED`, `UNFALSIFIED-AFTER-ROTATION`,
    `SKIPPED-BY-BUDGET`, `ENVELOPE_EXHAUSTED`, `LEVERAGE_UNRESOLVED`, `DEGRADED-DIVERSITY`,
    `SINGLE-LINEAGE`, `CRITIQUE-UNAVAILABLE`, `AMBIGUOUS_ATTRIBUTION`, `STALE`,
    `UNDER-REVIEW`, `UNDER-EXPLORED`, `UNRESOLVED-TYPE-FALLBACK`, `DEFECT`, `UNPRICED`,
    `UNADJUDICATED`, `UNCOVERED-SCOPE`, `NON-COMPARABLE`, `NOT_SAMPLED`,
    `OFF-SUBJECT-DOWNGRADE`, `AMENDED-SEARCH`, `MISSING-NUMBER`.
  - **Home 3 — four terminal routes**: `INERT`, false-presupposition non-answer,
    value→human, `NOT_EMPIRICALLY_DECIDABLE`.
- **A new typed state may not be minted without being placed in this table, and this table
  is the only place it may be minted; an unplaced state is a specification defect. Sibling
  artifacts cite this membership and never extend it locally** (S-13).
- **An abstention rendered as a mid-range number is a rule violation** (S-14, N-7).
- **Abstention price** = cost(abstain)/cost(wrong), strictly in (0,1); a **matrix** over
  question class × product-risk tier, not flat and not class-only; **every served answer
  names its cell**; unresolvable cell ⇒ `UNPRICED`, which never means zero and never means
  the check passed (§21 N-1…N-6).
- **Over-abstention check (Q56)**: observed rate vs declared cell; an inconsistent rate is a
  **named battery defect** (§21 N-5).
- **A value-conditional (Flow A) answer is not an abstention** and must not be priced
  against the `value: 0.15` cell (§21 N-8, V-11).

### 2.9 Budget / envelope subsystem

- **Budget-override knob**: typed skip for **ENRICHMENT ONLY**, each carrying a visible
  `SKIPPED-BY-BUDGET` marker. **PROTECTED CORE, never skippable**: provenance · abstention
  typing · standard-and-above blind verification · citation routes · **serve-conformance**
  (§4.1 DR-021 knob 9 extended by DR-052; §21.2 N-11).
- **Run cost envelope**: **every run gets a visible call/cost envelope derived from asker
  depth × risk tier**, visible before and during the run. On exhaustion: **typed enrichment
  skips first**, then a **hard stop serving already-verified components** with
  `ENVELOPE_EXHAUSTED`. **Never a silent timeout** (§21.2 N-9, N-10, DR-052).
- **Envelope and knob are orthogonal instruments**: the knob classifies *which rows*, the
  envelope bounds *the whole run's product* and supplies the terminal (§21.2 N-12).
- **No monotone mid-run cost growth**: the stranger sample rate freezes at run start; the
  ratchet applies to the next run (§21.2 N-13, knob 18, DR-052).
- **Per-row correctness-vs-enrichment classification is part of the row's contract, done
  once per row, not an operational setting** (§21.2 N-14). Per-item verification telemetry
  is **correctness** (OD-A-04).
- **A budget may never deactivate a correctness or safety row** (§19 H8).

### 2.10 Judge panel, lineage, and critique

- **Different maker = different lineage**; same-maker across model generations is the
  **same** lineage; a bright line, auditable per pairing (§14.1 L-1, knob 5 DR-013).
- **Independence is never fabricated**: unknown arguer/judge ⇒ "independence unknown" with a
  typed reason, never a default of "independent" (§14.1 L-2). A same-lineage judge where
  independence is required is a **typed block** (§14.2 L-5).
- **Provider identity must be a first-class configured value** — H1 is DR-013's precondition
  (§14.1 L-3, §19 H1).
- **Cap-label-lift when no second lineage**: the answer serves, cannot reach the **top
  confidence band**, carries a visible "independent critique unavailable" label with its
  reason, records the lift condition, and **executing the critique later re-scores**
  (§14.2 L-4, knob 6 DR-014). This is the packet's standing shape for every "we could not
  do the check" (L-6).
- **Q39 receipt is machine and unconditional at CROSS** — different lineage, blinded packet
  hash, correct order, context isolation — **recorded even when no critic exists**
  (§14.3 L-7).
- **Critic substance**: Q40 reopen locators, exact-check preserved spans character-for-
  character, rerun sums, emit typed verified/deviates/not-found; Q41 name a specific defect
  **or** state exactly what was examined (neither ⇒ not a critique); Q44 objection ledger
  resolving at CROSS entry even with no critic, with the **residual objection set as a
  first-class served object** (§14.3 L-8, §3.8).
- **Agreement after unblinding carries zero added weight**, decided by the unblinding log
  (§14.3 L-9, Q42).
- **Blind-verification coverage**: **always** for STANDARD and HIGH-STAKES tiers, for
  contested verdicts, and for **flip-sensitive nodes**; only CASUAL may be sampled or
  skipped (§14.3 L-10, §4.1 DR-019 knob 3).
- **The critic lane is exempt from track-record routing at every tier** (§14.3 L-11,
  G6, OD-A-14).
- **Multi-maker is a launch gate**: standard-and-above tiers execute real different-maker
  critique **from day one**; single-maker is legal only as labelled degraded operation
  under DR-014's caps (§14.4 L-12, L-13, DR-055, §22.1).
- **Research and criticism never share a context; the agent that produced an artifact never
  grades it** (§3.8 stage law, R5 §3.12).

### 2.11 Value overlay

- **The Pareto trigger computes when values hinge** — dominance on every criterion ⇒ no
  value weight and no elicitation; two or more non-dominated ⇒ value-decided, and *which*
  nodes are hinges is determined, not asserted (§15.1 V-1).
- **`weight_source ∈ {owner_elicited, org_policy, none}` — no `default` member**; absence of
  an owner's weight is a first-class servable state; equal weights are a value judgement
  wearing a lab coat (§15.1 V-2).
- **Flow A always**: serve the conditional plus the **exact reversal point** — a full
  answer, not an abstention. **Flow B**: one optional **swing-form** question per genuine
  hinge, stopping as soon as further preference information cannot change the answer.
  **Flow C**: opt-in signed, versioned standing profiles at org level, never a precondition
  for answering and never silently overriding a live hinge (§15.2 V-3…V-5, knob 8 DR-017).
- **The overlay invariant**: the value overlay **never mutates the evidence-scored graph**;
  base scores, arrow strengths and provenance are computed with no reference to any value
  weight; enforced by **recomputing every strength with the overlay detached and asserting
  byte-identity** (§15.3 V-6, §22.1).
- Every value-decided segment carries a visible marker naming **whose** weights decided it,
  with the reversal point printed beside it (V-7). Value-dependence and weak evidence must
  never share a label, colour or meter (V-8). Serve both readings, never average (V-9).
  Findings and recommendations render in separate blocks; a recommendation with an empty
  overlay owner is a defect (V-10, Q57). **No component of V3 holds a value position**
  (V-12).

### 2.12 Model scorecards, ledger, and routing

- **Two-tier wall**, never mixed in one number, every cell labelled with what it rests on
  (§16.1 K-1, OD-A-10):
  - **Tier 1 process facts** (day one, from the execution ledger, no ground truth):
    schema-compliance and parse-failure rate, provider error/timeout rate, latency and cost
    per node, determinism/self-consistency at fixed input, **position-swap flip rate**,
    **self-preference delta**, abstention rate per class by the five typed kinds, dispersion
    against the panel, **silent-drop rate** (schema-failed judgements, itself a recorded
    event).
  - **Tier 2 capability facts** (require Stage-11 settled outcomes): hit rate per
    (model, task class), proper score with decomposition, calibration curve,
    conditional-right-when-disagreeing, risk–coverage curve.
- **Cell shape** (§16.2 K-3, K-4): model id, **`model_version`**, provider, task class (from
  the Q7/Q8 taxonomy), metric, value, **`n`**, an **interval**, `as_of`, population counts
  `{settled, unsettled, permanently_unscoreable, abstained}`, and `basis ∈ {MEASURED_OUTCOME,
  MEASURED_PROCESS, EXTERNAL_BENCHMARK, NONE}` — **no ASSUMED, no DEFAULT**; `NONE` renders
  as "not measured", never as a middle number. **`model_version` + `as_of` are required
  keys**, and a provider's silent model update is a **DR-015 revision trigger that wakes the
  cell**.
- **Reporting obligations**: interval on every cell and a cell spanning the decision
  boundary must not drive a decision (K-5); serve the proper-score decomposition, never a
  bare per-class score (K-6); declare the calibration binning (K-7); compare at matched
  coverage or by risk–coverage curves because abstention corrupts hit rate (K-8);
  **a leaderboard of point estimates is prohibited** (K-9); state the time-to-signal
  (81 / 293 / 1,094 / 6,510 settled items) (K-10); external benchmarks displayable with full
  provenance + non-transfer caveat, tie-break eligible, **never a coefficient inside V3's
  scoring math** (K-11, OD-A-16).
- **A scorecard is a served number ⇒ DR-034 applies in full: a scorecard must be a pure
  function of the ledger** — no unrecorded smoothing window, no model in the loop, no
  retraining with an unfrozen training set (§16 preamble, K-15, OD-A-19).
- **Derivation chain** (§16.3 K-12, DR-046): Q59 validates the resolution event + external
  resolver and emits scoreability → Q60 persists `{answer, prior, posterior, basis, resolver,
  date, provenance}` and **reads it back** → DR-015 wake-ups and DR-016 review clocks make
  settlement day arrive → Q61 applies a **registered proper score** and updates and
  **versions** the calibration and class prior → those versioned weights become **the real
  judge weights** (repairs D5).
- **Score key `(answer_id, answer_version, as_of)`** — scoring the question would let a later
  revision rewrite history (K-13).
- **The scoreable subpopulation is not the population**: value choices are
  `PERMANENTLY_UNSCOREABLE` by design, and the excluded share is a recorded count served next
  to every cell (K-14).
- **Always-evolving weights**, updated on every factually-settled round (K-16). Exploration
  share **~20%** (provisional) (K-17). New-model onboarding: **~50-round process-fact
  probation**, capability weight departs neutral at **n ≥ 30 settled per class**, full
  authority at **~293 per class** (provisional) (K-18). **Hard best-model routing only past
  the detectability threshold per class** (K-19).
- **Cold-start exit is a demonstrated EXIT, not a better starting number**: inject one
  synthetic settled outcome, flow Q59→Q60→Q61→track record→weight, assert the weight moves
  off its cold value, whole path replayable (K-20, OD-A-18, §22.1). At t=0 nothing about task
  capability may be claimed; `basis: NONE`; **the router must behave exactly as it would with
  no scorecard at all**; uniform weights permitted only if labelled uniform and **never
  called calibration** (K-21).
- **The model ledger is a Postgres database of sessions and per-category model bests**,
  informing the next session's assignment — **one store with the settlement substrate, not a
  parallel one** (§16.5 K-22, §17.7 M-26, §20 W-3).
- **Scorecard consumed from day one for weighting and diversity-routing**; process facts feed
  the routing the decomposition loop already requires — differently-categorized model for
  defeaters, rotation for falsifiers, measured-difference rival carver (K-23).
- **Eight routing guards, all mandatory for any routing touching the served lane**
  (§16.5 K-25): **G1** separate lanes — route the served lane, keep the **cross-lineage panel
  lane uniform**, compute the track record from the panel lane; **G2** non-zero exploration
  floor ε per live class with **propensity recorded per decision**; **G3** version-pinned
  identity; **G4** minimum-n and **fall back to the prior rule on interval overlap**;
  **G5** multiplicity control, never a leaderboard; **G6** critic lane exempt at every tier;
  **G7** no self-routing; **G8** route on the class (from Q7/Q8), never on the item's expected
  answer.
- **Clustered observations**: linked repeats are not independent; **count distinct
  question-clusters** (K-26, OD-M-23).

### 2.13 Cross-run memory (Q61 retrieval)

- **Match key is a projection of already-frozen fields** — settlement act (Q7), question type
  (Q8), declared field (R7), normalized subject binding (Q2), hash of the frozen query set
  (Q11). **No new keyword extractor**; **no embedding pipeline** (not recomputable under
  DR-034). R6's plain sentence is **display-only: never hashed, never keyed** (§17.1 M-1,
  §6.4 P-5).
- **The memory key is NOT the cache key**: it **drops `as_of` and `policy_version` from
  identity** and carries them as link attributes; reusing the cache key makes the feature
  inert by construction (§17.1 M-2, OD-M-01).
- **A match never reduces the work**: never marks a row satisfied, never skips HARVEST,
  SPLIT or CROSS, never substitutes for a judgement; it may change a run's *inputs* and its
  *served disclosure* and nothing else (§17.1 M-3, OD-M-22).
- **Four-tier precision-ordered ladder**, computable as database predicates:
  `EXACT_QUESTION` → `SAME_BINDING` → `PARTIAL_BINDING` → `TERM_OVERLAP` (a **count**, not a
  score). The highest firing tier is the link's tier; lower tiers never upgrade a link
  (§17.2 M-4). **Every tier emits its agreement pattern, not a score** (M-5). Embedding
  similarity is **barred entirely for v1** (M-6, OD-M-04). **`NULL` is never agreement** —
  it is "not compared" (M-7, OD-M-06).
- **Alias table**: model-proposed candidates, **written only when a link is confirmed**, each
  row `{surface, canonical, confirmed_by, confirmed_at, from_run_pair, key_version}`, dated
  and reversible, and a **replayable input** (§17.2 M-8, OD-M-05).
- **Link, never merge**: a typed directed edge `relation ∈ {REPEATS, REFINES,
  CONTRADICTS_PRIOR, RELATED_ONLY}` with tier, agreed/disagreed fields, who decided, when,
  key version and alias rows used. Identity stays per-run; **there is no transitive closure**
  (§17.3 M-9, OD-M-07). **A false merge is worse than a missed reunion; every ambiguous
  default resolves to "do not link, and say a candidate was found"** (M-10). **The
  found-but-unlinked candidate is disclosed** (M-11, OD-M-19).
- **Payload depth is a second, independent dial**: link only → settlement facts → open
  triggers and staleness state → class-level scorecard facts → the prior argument graph →
  the prior served prose. **v1 adopts: link, settlement facts, and open triggers**
  (§17.4 M-12, OD-M-09). **The prior served prose is never fed to any model**; it may be
  displayed as a linked artifact (M-13, OD-M-10). **Wide match + deep payload is prohibited**;
  graph revival only under the two narrowest tiers (M-14, OD-M-17).
- **Pull-time obligations**: every pulled artifact enters pinned as `{artifact_id, version,
  content_hash, as_of, staleness_state_at_pull}`; pulled material keeps its **original**
  relevant-as-of and does not inherit the new run's freshness; revived material arrives
  through staleness review marked as revived; **locators re-verified at pull time for
  load-bearing claims only** (a load-bearing pulled claim whose locator no longer resolves may
  not be served as looked-up — Q22's pattern: irreproducible ⇒ `REASONING`); the pull carries
  **a flat declared cap, printed where it is used** (§17.4 M-16, OD-M-11, OD-M-12).
- **Admissibility**: the resolver's outcome is evidence; the prior run's harvested sources are
  evidence; **the prior verdict is NOT evidence** — a typed admissibility rule, not prompt
  guidance (§17.5 M-17, OD-M-14).
- **A carried posterior is a legitimate prior and an illegitimate silent one**:
  `CARRIED_POSTERIOR` is a named `prior_basis` member recording source run, source version,
  whether it settled, and staleness at pull; **the pull lands AFTER the prior is recorded**
  (§17.5 M-18, M-20, OD-M-15, OD-M-18).
- **Memory shapes the search, not the conclusion**: prior open triggers become this run's
  watch list; prior unresolved falsifiers and `UNFALSIFIED-AFTER-ROTATION` marks become query
  seeds and ignorance rows; prior error attribution (Q62) becomes a targeted search
  instruction (§17.5 M-19, OD-M-16).
- **`CONTRADICTS_PRIOR` serves as DR-032's disagreement flag AND wakes the prior answer as a
  revision trigger** (§17.5 M-21, OD-M-13).
- **Disclosure fact block + three blocking serve gates** (§17.6 M-22, M-23): no memory
  sentence without a match fact; the tier and the difference must survive into the served text
  whenever the match is not exact; the staleness badge travels **inside** the memory sentence.
  An **unlink control** the asker can use to sever the link is part of the block.
- **The model's judgement sits at writing time only for v1**; any placement changing the run
  must be a typed object validated against its enum, with adjustments refused unless traceable
  to a pulled artifact and their count capped (§17.6 M-24, OD-M-21).
- **Cold-start proofs**: **inertness** (empty store ⇒ byte-identical output to
  mechanism-disabled) and **firing** (one synthetic prior settlement ⇒ link appears,
  disclosure served, whole path replays with no model in the replay) (§17.6 M-25, OD-M-24).
- **One store, two indexes** with the scorecards; both resolve task class from the same Q7/Q8
  taxonomy (§17.7 M-26). **The matcher is also DR-016's missing revival trigger** (M-27).
- **Scope**: class-level track-record facts shared across the deployment; **question-level
  pulls kept per-asker** (OD-M-20).

### 2.14 Staleness and liveness

- **Snapshot**: every node and every answer stamped **relevant-as-of** at spawn (§13.1 T-1).
- **Wake**: machine wake-ups fire on **watched revision triggers** (including Q58's named
  conditions) and on **class-based TTL review clocks** (T-2, Q58 §3.10).
- **Propagate**: a woken change **re-assesses ancestors** — the machine recomputes the
  arithmetic and a model re-judges **only the affected nodes**; child→parent rethinking, not a
  full re-run (T-3).
- **Say so**: a fired trigger or a past review clock serves with a visible `STALE` or
  `UNDER-REVIEW` badge, **never silently** (T-4).
- **Composite retirement**: no queries for N days (N per class; **180 for standard**,
  provisional) **AND** no open revision triggers — both, not either (§13.2 T-6, knob 11).
- **Retired = ARCHIVED**: full graph kept, auto-revived by the next query through staleness
  review, **nothing is deleted** (T-7). Archival is load-bearing beyond the graph: deletion
  would make every hit rate a survivorship statistic and would silently redefine "have I been
  here before?" as "in the last N days" (T-8).
- **`UNDER-EXPLORED`** marks attention-starved branches; **never a retirement cause on its
  own** (T-9, Q62).
- **Staleness is a ceiling and a refusal rule, never a silent multiplier on a score** (T-10).
- **Q62 liveness telemetry is written on every closed run** (unconditional limb) (§3.11 Q62).

### 2.15 Provenance and the execution ledger

- **Every load-bearing claim carries its kind (looked-up / ran / reasoned), its producer and
  its locator**; a missing locator blocks serving; a verdict resting on reasoning alone is
  downgraded to a hypothesis plus a research plan (§3.10 Q51, §12.2).
- **Ways of knowing are not interchangeable** (GLOSSARY); M4 applies a **ceiling** — a cap,
  never a multiplier — plus a serving-band rule (§18 O-4).
- **Everything executed is recorded** — attempts, failures, could-not-dos — and is
  digest-visible to the user, with the algorithm's behaviour consistent with the record.
  **No served sentence may imply a check the ledger says did not run** (§12.5 S-19, DR-027,
  §22.1).
- **Raw judgements are stored BEFORE the math**, with input and contract fingerprints
  (internal only); users see parsed and filtered results (S-19).
- **Q22 execution capture**: pinned command, raw output, environment, exit code, timings, and
  proof that it replays; **irreproducible output auto-relabels `REASONING`**; no model narrates
  an execution or paraphrases a result into the evidence ledger (§3.5 Q22, §11).
- **Q23 instrument certification**: registered **known-positive and known-negative** fixtures
  executed and receipted by instrument, environment and fixture hashes; an instrument that
  cannot fail its negative fixture is not certified (§3.5 Q23).
- **Q24 attempt ledger**: append-only, keeps **every** attempt including the embarrassing ones;
  each result's caveat bound to its result id **by machine** and travelling everywhere the
  number is shown (§3.5 Q24).
- **Q60 read-back verification**: write it, read it back, verify another actor can open it; a
  claimed write that cannot be read back is a defect (§3.11 Q60).

---

## 3. Hard architecture constraints

Everything below binds the stack or the module shape. Exact citations.

| # | Constraint | Citation |
|---|---|---|
| C-01 | **Postgres is the persistence layer**, not SQLite, **including the observability layer** — score provenance, the execution-ledger artifact store, and the debug views. **There is no second store for observability.** | §20 W-1, `RULED(DR-024)`; §2 item 3 |
| C-02 | **One store, multiple indexes**: the settlement store, the model ledger (§16.5) and the cross-run memory index (§17.7) are one store, not parallel stores. A parallel store drifts within one schema migration. | §20 W-3 `CARRIED-DESIGN`; §16.5 K-22 `RULED(DR-046)`; §17.7 M-26 |
| C-03 | **Pure propagation (H3)**: the graph-scoring math contains **no model calls, no file or network I/O, no clock, no randomness, and no database access**. No battery successor — the rule governs, and DR-034 makes it structural. | §19 H3 `RULED(DR-029)`; §12.5 S-20 `RULED(DR-034 + DR-029 H3)` |
| C-04 | **Replay with no AI in the path**: V3 permanently refuses to serve a number it cannot recompute from its own frozen records, with no AI in the replay path; continuously self-tested. | §12.5 S-17 `RULED(DR-034)`; §2 item 8 |
| C-05 | **What replays and how exactly**: **numbers replay byte-identically**; the **serve decision replays as stored data** — the conformance verdict is an **input artifact** to the replay, never regenerated by a model. This is what makes "no AI in the replay path" achievable for a pipeline whose composition step is a model call. | §12.5 `RULED(DR-060 + DR-063)` |
| C-06 | **Total, deterministic ordering** of the ledger and of arrow evaluation, because floating-point accumulation is not bit-identical under reordering. Any storage-engine-specific ordering tiebreak is replaced by this. | §12.5 S-21 `CARRIED-DESIGN`; §20 W-4 |
| C-07 | **Provider-agnostic agents (H1)**: all scoring, debate, evidence, metareasoning and orchestration code calls **one provider interface**, never a model SDK or CLI directly. It is the precondition for DR-013. | §19 H1 `RULED(DR-029)`; §14.1 L-3 |
| C-08 | **A second provider is addable through configuration alone (H2)**, without changing agent, scorer, evidence or semantics code. | §19 H2 |
| C-09 | **Multi-provider is mandatory at launch, not optional**: standard-and-above tiers execute real different-maker critique from day one; single-maker is legal only as labelled degraded operation. | §14.4 L-12/L-13 `RULED(DR-055)`; §22.1 |
| C-10 | **Swappable semantics (H4)**: the default gradual semantics sits behind a strategy interface another implementation can replace. Doubly load-bearing: the rival operator must be **computable on demand**, and **the operator identifier must be a recorded run input, never a source literal**. | §19 H4 `RULED(DR-029)`; §10.1 C-4; §18 |
| C-11 | **One scoring engine** for WEIGH and COMPOSE; **no second scoring path anywhere in V3**. | §18 O-1 `RULED(DR-030)` |
| C-12 | **One graph, no conversion layer**: SPLIT's children and defeaters **are** the debate graph's nodes and typed edges. | §18 O-2 `RULED(DR-030)` |
| C-13 | **One serving truth**: SERVE reads a new battery serve layer built on the execution ledger; the debug view is that layer's internal debug facet, not a second answer. | §18 O-3 `RULED(DR-030)` |
| C-14 | **The organ↔stage table is FINAL, no longer vetoable**: scorer → WEIGH + COMPOSE; judge contract → WEIGH; graph shapes → SPLIT object and substrate; spawn plumbing → SPLIT mechanics; ledger → all stages, SERVE reads. **LOCK, ROUTE, AIM, HARVEST, RUN, CROSS, SETTLE are greenfield** under the eight house rules. | §18 O-7 `RULED(DR-056)` |
| C-15 | **The cycle law is enforced at three layers**: construction refuses the cycle-closing edge and redirects; compute meets a cycle with a **typed error** — never a partial result, never a fixed-point approximation; write **rejects** a cycle-creating arrow. | §10.5 C-15 `RULED(DR-056)`; C-13/C-14 `RULED(DR-042)` |
| C-16 | **No default anywhere in the scoring path (M1)**: base score comes from a judgement or the node contributes nothing — no default at any layer. | §18 O-4 (manifest §4.2(e)–(i)) `RULED(DR-030)`; D1 |
| C-17 | **No feedback loop from sensitivity into weights**: sensitivity may never feed back into base scores or arrow strengths — weights → strengths → sensitivity → weights has no declared fixed point. Prohibited by construction and tested for. | §10.2 C-7 `CARRIED-DESIGN` |
| C-18 | **The value overlay never mutates the evidence-scored graph**, enforced by recomputing every strength with the overlay detached and asserting **byte-identity**. | §15.3 V-6 `RULED(DR-017)`; §22.1 |
| C-19 | **MACHINE rows make zero model calls, proven by the test suite** — 13 rows. | §5.1 F-1 `RULED(DR-037)`; §3.13; §22.1 |
| C-20 | **A scorecard must be a pure function of the ledger**: no unrecorded smoothing window, no model in the loop, no retraining without a frozen training set. Track-record numbers are **fully inside the replay law**. | §16 preamble `RULED(DR-039 + DR-034)`; K-15; OD-A-19 |
| C-21 | **No embedding pipeline in the memory path for v1**: its output is not recomputable under DR-034 because the model can change under the same name; the four tiers are computable as database predicates. | §17.1 M-1; §17.2 M-6 `RULED(DR-061 · OD-M-04)` |
| C-22 | **Wire boundary**: the browser receives typed honesty **projections**; the complete fact bundle and the conformance record are fetchable on demand through an **authorized inspection/replay endpoint** — the same handle the replay law needs; **internal prompt material is excluded from the default view**. | §12.6 S-22/S-23/S-24 `RULED(DR-054)` |
| C-23 | **No orphaned modules**: everything shipped is reachable and called; dead code eating tokens and processing is indicted at code level. Deferred gates (citation hard-kill, coverage gate) must **not be shipped as unreachable code**. | §2 item 11 `RULED(DR-047)`; §22 clause 4; §22.1 |
| C-24 | **Greenfield, new repo, clean-room**: `engineRelationship = GREENFIELD_NEW_REPO`; no V2 code is copied; no V2 output conformance test exists at any level; V2's production database is gone and nothing in V3 depends on recovering it. | §4 knob 1 `RULED(DR-031)`; §2 item 4 `RULED(DR-033)`; §22 Z-2; §20 W-2 `RULED(DR-024)` |
| C-25 | **Ground truth = published literature vectors + property tests of V3's own rules.** No conformance test against V2 at any level. | §22 Z-2 `RULED(DR-033)`; manifest §12 |
| C-26 | **Keep the property, drop the SQLite accident**: never hold a write lock across a model call; isolate per-member failures; a crash mid-batch leaves completed work durable and resumable. | §20 W-4 `CARRIED-DESIGN` |
| C-27 | **The flag/configuration register is designed anew and V-ratified before production**; every numeric constant inherited from research is source material for a register row and nothing more. | §20 W-5 `RULED(DR-023)` |
| C-28 | **Naked constants must be printed where they are used**, in the served trail: the abstention cell, the provenance key width, a way-of-knowing ceiling, a topic or regeneration cap, an exploration share, a minimum-n gate. | §4 closing paragraph; N-4; M-16 |
| C-29 | **Honesty fields are machine-injected into the serve output structure, outside the composition model's discretion** — silent truncation of an honesty surface is impossible by construction. | §12.1b S-9b `RULED(DR-058)` |
| C-30 | **A budget may never deactivate a correctness or safety row**; the protected core is never skippable. | §19 H8; §21.2 N-11 `RULED(DR-052)` |
| C-31 | **Every gate must be shown to fire both ways before it counts as adopted** — a check nobody has watched fail is an untested claim. | §22 Z-1 `RULED(DR-063)`; A-12; OD-C-02 |
| C-32 | **The condition-marks enum is closed and centrally owned**: a new typed state may not be minted without being placed in §12.3's table, and that table is the only place it may be minted. Sibling artifacts cite it; they never extend it locally. | §12.3 S-13 `RULED(DR-051)` |
| C-33 | **One canonical `stranger_restatement` schema**, cited by name from all four artifacts, never restated as a field list. | §12.7 `RULED(DR-061 · OD-S-06)` |

---

## 4. Data and persistence obligations

**Everything below lives in Postgres (C-01) in one store with multiple indexes (C-02).**

### 4.1 Frozen / hashed artifacts (immutable once written)

| Artifact | Freeze property | Citation |
|---|---|---|
| Q4 answer rule | frozen, hashed, timestamped **before first retrieval**; amendments versioned | §3.1 Q4, §5.3 F-6 |
| Q5 prior + `prior_basis` | never revised upward; no retrospective write | §3.1 Q5, F-7 |
| Q11 query set | deduped, frozen, versioned, hashed before retrieval; typed amendment log | §7.1 E-1…E-3 |
| Q21 probe prediction | frozen, hashed, timestamped before execution; not reusable across runs | §3.5 Q21 |
| Q10 undivided baseline | stored, **never regenerated**; Q48's only comparator | §5.2 F-5, §10.3 C-8 |
| Q2 binding | dated, set once, sole scope key | §7.2 E-4 |
| Q6 resource envelope | hashed; abstention cell; Stage-6 cap | §3.1 Q6 |
| Q31 rival-carver packet | question-only, blinded, **fingerprinted** | §9.4 D-10 |
| Q39 independence receipt | computed from logs and hashes; recorded even with no critic | §14.3 L-7 |
| Stranger sample rate | **frozen at run start**; ratchet applies to next run | §21.2 N-13, knob 18 |
| Alias table rows | dated, attributed, reversible, a **replayable input** | §17.2 M-8 |

### 4.2 Event-sourced records

- **Belief updates cite their cause at the moment they are made**; retrospective attribution
  is forbidden; ties are typed `AMBIGUOUS_ATTRIBUTION` (§12.4 S-15, S-16).
- **The execution ledger** records everything executed — attempts, failures, could-not-dos —
  digest-visible, with raw judgements stored **before the math** plus input and contract
  fingerprints (internal only) (§12.5 S-19).
- Every action row carries `subject_item_id` and `stance_at_action`, plus typed outcome
  (`FAILED`/`BLOCKED`/`TIMED_OUT`/`REFUSED`/`SKIPPED_BY_BUDGET`), actor, timings, input
  fingerprint (§8.1 A-1).
- **Q24 attempt ledger is append-only** and keeps every attempt (§3.5 Q24).
- **Silent-drop rate must itself be a recorded event, never a quiet drop** (§16.1 K-1).
- **Routing propensity recorded per decision** (§16.5 G2).

### 4.3 Replay-visible state

- Frozen records the replay reads **are** the Postgres records (§20 W-1).
- Replay inputs include the **stored conformance verdict** (§12.5, DR-060).
- Every pulled memory artifact enters pinned as `{artifact_id, version, content_hash, as_of,
  staleness_state_at_pull}`; an unpinned pull makes the new answer unreplayable (§17.4 M-16).
- **Deterministic total ordering** is a DR-034 precondition (§12.5 S-21, §20 W-4).

### 4.4 Long-lived / cross-run state

- **Nothing is ever deleted.** Retirement is archival; the full graph is kept and auto-revived
  (§13.2 T-7).
- Every node and answer stamped **relevant-as-of** at spawn (§13.1 T-1).
- **Watched revision triggers** and **class-based TTL review clocks** are persistent scheduled
  state (§13.1 T-2); a provider model-version change and a `CONTRADICTS_PRIOR` link are also
  revision triggers (§16.2 K-3; §17.5 M-21).
- **Answer records** persist `{answer, prior, posterior, basis, resolver, date, provenance}`
  with **read-back verification**; scoring keys on `(answer_id, answer_version, as_of)`
  (§3.11 Q60, §16.3 K-13).
- **Cross-run links** are typed directed edges with tier, agreed/disagreed fields, decider,
  timestamp, key version and alias rows used; **identity stays per-run; no transitive closure**
  (§17.3 M-9).
- **Scorecard cells** keyed by model id + `model_version` + provider + task class + metric +
  `as_of`, with `n`, interval, population counts and `basis` (§16.2 K-3).
- **Battery version** is frozen per release, so the coverage proof is accurate at release
  boundaries (OD-S-04).
- **Scope split**: class-level track-record facts shared per deployment; question-level pulls
  **per-asker** (OD-M-20).

### 4.5 Serve-time data objects

- **The fact bundle** — all computed facts and typed records, nothing else (§12.1 S-1); carries
  Q53's residual objection as a **field** (S-6); carries machine-injected honesty fields
  (S-9b); fetchable through the inspection/replay endpoint (S-23).
- **Typed honesty projections** to the browser: badges, condition marks, provenance summaries,
  per-node restatements — the nine surfaces (§12.6 S-22).
- **Structured projection fields** for the reversal point and the builds-on-previous
  disclosure, renderable without composed prose (§12.1c S-9d).
- **`stranger_restatement`** per node and for the verdict: `{subject_ref, claim, certainty,
  what_would_change_it, action_consequence, generated_at, check_status}`; restatements are
  **minted with the node, not at serve time**; `check_status ∈ {PASS, FAIL, NOT_SAMPLED}`,
  mechanical, blocks serving on FAIL; **`action_consequence` is verdict-only, nodes set it
  `NOT_APPLICABLE`** (§12.7 S-26, S-26a).
- **Memory disclosure fact block** including the candidates found and **not** linked and an
  **unlink control** (§17.6 M-22).

---

## 5. External interfaces

### 5.1 Provider layer

- **One provider interface** called by all scoring, debate, evidence, metareasoning and
  orchestration code; never a model SDK or CLI directly (§19 H1).
- **A second provider addable by configuration alone** — no change to agent, scorer, evidence
  or semantics code (§19 H2).
- **Provider identity is a first-class configured value, not an import** — this is what makes
  "different maker = different lineage" enforceable and auditable per pairing (§14.1 L-3, L-1).
- **Provider metadata the ledger and scorecards require**: provider, model id, **`model_version`**,
  error/timeout rate, latency and cost per node (§16.1 K-1, §16.2 K-3). A **silent provider
  model update fires a DR-015 revision trigger on the cell** (G3).
- **Lanes**: a **served lane** and a **uniform cross-lineage panel lane**; the track record is
  computed from the panel lane so selection cannot starve measurement; the **critic lane is
  exempt from track-record routing at every tier** (§16.5 G1, G6).
- Model roles the spec names explicitly: composition model, conformance judge (a **second,
  different** model), per-node judges (a panel), the differently-categorized defeater model,
  the rotating falsifier hunt, the measured-difference rival carver, the R6 second isolated
  question-only context, the Q34 remediation model, and the Q61 interpretation model
  (§12.1, §9.1 D-2, §9.3 D-9, §9.4 D-10, §6.4 P-5, §8.1 A-8, §17.6 M-24).
- **Context isolation is a checkable property**: research and criticism never share a context;
  the producer never grades its own artifact; agent identity is stripped before another role
  reads prior turns (H6); Q28's per-child test and R6's topic check run in **isolated
  contexts** (§3.8 stage law, §19 H6, §9.2 D-6, §6.4 P-5).

### 5.2 UI / wire contract touchpoints

- **Default view = typed honesty projections only.** The full fact bundle, the conformance
  record, and internal prompt material are **not** shipped by default (§12.6 S-22…S-24).
- **The nine honesty surfaces** (canonical list, `RULED(DR-048)`, §12.6): 1 typed abstention
  badges (Q55); 2 per-node provenance and ways of knowing (Q51); 3 defeaters as visible
  first-class attacks (Q26); 4 STALE / UNDER-REVIEW badges (DR-015); 5 value markers and
  reversal points (DR-017); 6 investigate-deeper (DR-045 A-8); 7 UNDER-EXPLORED (DR-016);
  8 SKIPPED-BY-BUDGET and fallback labels (DR-021 knobs 9–10); 9 builds-on-previous disclosure
  (§17.6).
- **Every surface traces to a requirement and every requirement to a surface** — one
  requirement, one UI row, one charter acceptance hook per surface (§12.6 S-25).
- **The kept UI's data layer is rebuilt against these native shapes with NO ADAPTER**; the ten
  never-called V2 surfaces and the dual-transport seam do not survive (§12.6, DR-048).
- **The UI contract's 30 presentation cells are DELEGATED to mockup review** (DR-064):
  architecture consumes their **consequences** — which surface must exist and what it must be
  able to say — not their shapes (§12.6, §26.3).
- **Interactive affordances the spec obliges**: the **steering menu** (menu + free-text
  annotations, every annotation logged verbatim, typed as human-steer input, and disclosed in
  the served trail — §4.1 DR-019 knob 4; criteria addition — C-11); **investigate-deeper**
  (§8.1 A-8); the **unlink control** (§17.6 M-22); the **swing question** (Flow B, V-4); the
  visible **run cost envelope**, visible before and during the run (§21.2 N-9).
- **Asker-supplied run parameters**: depth and agent count are a user-facing dial that derives
  the stranger sample rate, the measurement quota, and the cost envelope (§4 knobs 15, 18;
  §21.2 N-9). Caller scope and `as_of` are **caller-supplied, defaulting to now**
  (§4.1 DR-021 knob 11).

### 5.3 Inspection / replay endpoint

- **One authorized inspection/replay endpoint** serving the complete fact bundle and the
  conformance record on demand — **the same handle DR-034's replay law needs**. Honesty is
  preserved by *availability*, not by shipping everything by default (§12.6 S-23).

### 5.4 External resolvers and outcomes

- Every answer records a **resolution event, an EXTERNAL resolver identity, and a scoreability
  verdict**; with no external resolver the answer is `PERMANENTLY_UNSCOREABLE` — expected for a
  value choice, not a defect. **The resolver identity is V-named per deployment**
  (§3.11 Q59, §4.1 DR-021 knob 11).
- **Q61 fires on `resolver_outcome_arrived and Q60_valid`** — the battery's only cross-run
  trigger; it may sit in WAIT indefinitely (§3.11 Q61). **Disputed resolutions route to a
  human, never self-grading.**
- **External benchmark numbers** may be shown with full declared provenance (benchmark, version,
  date, exact model version, who ran it, scoring script) plus a non-transfer caveat, may at most
  seed a tie-break, and may **never** become a coefficient in V3's scoring math (§16.2 K-11).
- **Retrieval / search providers** are implied by Q15's obligations (class, time, hit count,
  include/exclude reason, zero-result flag, access failures) and by Q16's locator, version,
  retrieval time and character-level exact compare (§3.4, §7.3 E-8).
- **Probe execution environment** (Q22): pinned command, raw output, environment, exit code,
  timings, replay proof (§11).

---

## 6. Register / knob inventory

### 6.1 The 19-knob register (§4)

| # | Parameter | V's value (condensed) | DR | Provisional? |
|---:|---|---|---|---|
| 1 | `engineRelationship` | `GREENFIELD_NEW_REPO` | DR-031 | final |
| 2 | `queryAmendment` | amendable mid-run, typed: mechanical repair (full confirmation power) / semantic re-aim (exploration only) | DR-008 | final |
| 3 | `subjectRelevance` | mixed rule: wholly off-subject rejected pre-scoring; partly relevant admitted downgraded with share named | DR-009 | final |
| 4 | `abstention` | cost-ratio in (0,1); **class × risk matrix**; standard seeds lookup 0.8 / measurement 0.7 / comparative 0.55 / causal 0.5 / predictive 0.4 / value 0.15; multipliers high-stakes ×0.6, casual ×1.3 (capped <1) | DR-010/011/012 | **PROVISIONAL** — recalibration is a Stage-11 job requiring V sign-off |
| 5 | `lineageEquivalence` | different maker = different lineage | DR-013 | final |
| 6 | `criticUnavailable` | cap + label + lift path | DR-014 | final |
| 7 | `newHumanRules` | R6/R7/R8 ACCEPT as written; R9 AMEND (every node **and** the verdict) | DR-018 | final |
| 8 | `comparisonValueOwnership` | Pareto trigger; Flow A always, Flow B one swing question per hinge, Flow C opt-in profiles; `weight_source` with no `default` member | DR-017 | final |
| 9 | `splitIterationLimit` | **2 regeneration rounds (3 attempts)** then typed "not runnable" abstention with rejection evidence | DR-020 knob 5 | final |
| 10 | `orderingPolicy` | battery stage order as written | DR-020 knob 6 | **PROVISIONAL** until the deferred retrieve-first experiment rules |
| 11 | `livenessThreshold` | composite retirement: no queries for N days **and** no open revision triggers; retired = archived | DR-016 | **PROVISIONAL** N (180 for standard) |
| 12 | `expiryPolicy` | snapshot + wake + propagate; STALE / UNDER-REVIEW badges | DR-015 | final |
| 13 | `citationEnforcement` | eight typed failure routes from day one; **hard-kill gate auto-activates when the character-level quote matcher ships and validates** | DR-020 knob 7 | **staged activation** |
| 14 | `coverageUpgrade` | diagnostic `UNCOVERED-SCOPE` note first; **becomes a gate only after outcome data sets the threshold** | DR-020 knob 8 | **staged activation** |
| 15 | `graphMeasurementQuota` | derived from the asker's depth parameters, capped by a V-owned deployment ceiling | DR-021 knob 12 | ceiling value not printed here |
| 16 | `stage11Rollout` | §4 row 16 text: **"OPEN — no DR"**, recording limbs day one, outcome ingestion in WAIT, no operational calibration claim, capability cells `basis: NONE`. **§23 `OD-S-01` and §25.1 say this is RATIFIED by DR-061 as "phased"** — see §7 of this digest | (DR-061 · OD-S-01) | **text conflict — see OQ-G1** |
| 17 | `adoptionBar` | **DISSOLVED** by DR-047; role passes to the Quality Charter's five clauses | DR-047 | moot |
| 18 | `strangerTestCoverage` | load-bearing exhaustive **always**; non-load-bearing sampled at an asker-derived rate; **rate freezes at run start**, ratchet applies to the next run | DR-019 knob 1 + DR-052 | rate is derived, not a constant |
| 19 | Visible-fallback authorisation (Q8 / R7) | **AUTO-SERVE WITH LABEL, no approval step**; label travels on the answer **and in every node's provenance** | DR-021 knob 10 | final |

**Register status as printed in §4**: "18 of 19 carry a V value; `stage11Rollout` (row 16) is
the one open row." This sentence is contradicted by §23 `OD-S-01` and §25.1 — see OQ-G1.

### 6.2 The six annexed V-set values (§4.1) — not counted in the 19

| Value | V's value | DR |
|---|---|---|
| Topic-cap N for model-proposed follow-up topics | **N = 7**, menu must retain **at least one could-overturn topic** | DR-019 knob 2 |
| Blind-verification coverage | CROSS **always** for STANDARD and HIGH-STAKES, for contested verdicts, and for flip-sensitive nodes; **only CASUAL may be sampled or skipped** | DR-019 knob 3 |
| Steering authority | menu + free-text annotations; every annotation logged **verbatim**, typed as human-steer input, disclosed in the served trail | DR-019 knob 4 |
| Budget-override policy | typed skip for **ENRICHMENT ONLY** with a visible `SKIPPED-BY-BUDGET` marker; **protected core** = provenance · abstention typing · standard-and-above blind verification · citation routes · serve-conformance | DR-021 knob 9 + DR-052 |
| Run cost envelope | visible call/cost envelope from asker depth × risk tier; enrichment skips then hard stop with `ENVELOPE_EXHAUSTED` | DR-052 |
| Per-run ownership | Q1 decision/action owner = **the asker**; caller scope and `as_of` **caller-supplied, defaulting to now**; Q59 external resolver **named by V per deployment** | DR-021 knob 11 |
| Loop caps as consumed by Stage 6 | topic cap 7 + regeneration cap 2 rounds stand as the Stage-6 bounds, **inherited not re-declared** | DR-041 |

### 6.3 Other configuration the architecture must house

Values named normatively outside the register:

| Config | Value / status | Citation |
|---|---|---|
| `max_recompose` | **2** | §12.1a S-7 (DR-049) |
| Q46 deepening bound K | **1 round per parent per run** | §10.2 C-5a (DR-050) |
| Declared **hard bundle budget** for composition | named as "the declared hard budget"; **no number or derivation given** | §12.1b S-9c (DR-058) |
| Provenance **key width** | "a V policy value, owned by the manifest's open-decision register (`OD-09`)"; must be printed where used | §7.4 E-11 |
| Exploration share | **~20%** (next-best or random) | §16.4 K-17 — **provisional-recommended** |
| New-model probation | **~50 rounds** process-fact; departs neutral at **n ≥ 30** settled per class; full authority at **~293** per class | §16.4 K-18 — **provisional-recommended** |
| Routing exploration floor ε | "non-zero per live class", propensity recorded; **value not set** | §16.5 G2 |
| Minimum-n / overlap rule | n ≥ 30 to depart neutral, ~293 for hard routing; on interval overlap fall back to lineage/availability/cost | §16.5 G4 |
| Memory pull cap | **a flat declared number, printed where used**; **value not set** | §17.4 M-16 (OD-M-12) |
| Convergence epsilon and defaults | **register rows drawn fresh** under DR-023 | §19 H-9 |
| Verdict/confidence band numeric boundaries | **all deferred to DR-023's flag-register ratification** | §12.8, OD-C-01, §26.3 |
| Risk tiers | **casual / standard / high-stakes** | §21 N-3 |
| Question classes in the abstention matrix | lookup, measurement, comparative, causal, predictive, value | §21 N-3 |
| Question types (Q8) | "exactly one of a closed six" | §3.2 Q8, §5.4 F-8 |
| Settlement acts (Q7) | "a closed set of six" `[CD]` | §3.2 Q7 |
| Bias domains (Q37) | **seven, named**: confounding, selection, misclassification, protocol deviations, missing data, outcome measurement, selective reporting | §8.3 A-15 |
| Citation failure routes | **eight typed routes** (not enumerated in this document) | §7.3 E-8 |
| Time-to-signal reference numbers | 60/80 → 81; 70/80 → 293; 75/80 → 1,094; 78/80 → 6,510 | §16.2 K-10 |

**Standing law over all of it (C-27, C-28):** the register is drawn fresh and V-ratified before
production (DR-023); the knobs already ruled are "register entries in waiting, not open
questions" (§20 W-5); and any constant that can move a served verdict is printed where it is
used, in the served trail (§4 closing).

---

## 7. OPEN QUESTIONS the spec itself defers

The spec's own summary of what is unsettled is §26.3: *numeric band thresholds*, *the UI's 30
presentation cells*, and *the two standing items at §25.2*. The register (§23) is closed at
**0 open of 51**. That summary is accurate for **requirements** questions. The list below is
wider because it includes staged activations, provisional numbers, and places where body text
still reads as open against a ratified register row — all of which an architect meets as
decisions.

### 7.1 DEFERRED-BY-DESIGN (V ruled it comes later; architecture can proceed)

| ID | What is deferred | Where | Note |
|---|---|---|---|
| D-1 | **All verdict-band and confidence-band numeric thresholds.** The verdict *model* (four axes) is ratified; the *numbers* land at V's flag-register ratification. Bands are **ordered labels** until outcome data exists. | §12.8 `RULED(DR-061 · OD-C-01 + DR-063)`; §23.C OD-C-01; §26.3 item 1; DR-023 | Architecture builds ordered-label bands with the boundaries as register rows. |
| D-2 | **The UI's 30 presentation cells** — delegated to mockup review during the UI build phase; the requirements mission closes without them. | §12.6 `RULED(DR-064)`; §23 preamble; §26.3 item 2 | Architecture consumes consequences (which surface exists, what it must say), not shapes. |
| D-3 | **The whole V3 flag/configuration register** — drawn fresh, ratified by V before production; every research-inherited numeric constant is source material only. | §20 W-5 `RULED(DR-023)` | Architecture must house a register, not the numbers. |
| D-4 | **Citation hard-kill gate activation** — auto-activates when V3's character-level quote matcher ships and validates. Must not ship as unreachable code. | §7.3 E-8, knob 13; §22.1 "Deferred gates are not shipped dark" | Staged activation with a named condition. |
| D-5 | **Coverage as a gate (Q27)** — `UNCOVERED-SCOPE` is diagnostic until outcome data sets a threshold; `coverage_passed` is a forbidden claim until then. Must not ship dark. | §9.2 D-7, knob 14; §22.1 | Staged activation. |
| D-6 | **Stage-11 rollout is phased**: recording limbs (Q59, Q60, Q62 liveness) from day one; outcome ingestion waits for an outcome; no operational calibration claim; capability cells stay `basis: NONE`. | §23.D `OD-S-01` RATIFIED (DR-061, adopted: phased); §4 row 16; §25.1 | See OQ-G1 for the residual text conflict. |
| D-7 | **The abstention matrix values are provisional by design**; recalibration is a Stage-11 job **requiring V's sign-off**, never automatic drift. | §21 N-3 `RULED(DR-012)`; §4 knob 4 | |
| D-8 | **`livenessThreshold` N (180 for standard) is a seeded provisional value.** | §13.2 T-6; §4 knob 11 | |
| D-9 | **`orderingPolicy` is provisional** until the deferred retrieve-first experiment rules. Experiments are deferred until after a working prototype and **never gate this spec**. | §4 knob 10; §2 item 2 (DR-004) | |
| D-10 | **Exploration share (~20%) and new-model onboarding thresholds (~50 / n≥30 / ~293) are provisional-recommended numbers.** | §16.4 K-17, K-18 `RULED(DR-046)` | |
| D-11 | **v1-scoped memory decisions with a named later upgrade**: middle-band matches serve as "related" with no pull, upgrading to a steering-menu ask once the menu is live (OD-M-03); the pull cap is flat now, usefulness-based later (OD-M-12); blind-first is ordering-only now, snapshot-and-reveal later for high-stakes (OD-M-18); the interpreting model sits at writing time only for v1, a typed early reconciliation step later (OD-M-21). | §23.B; §17.4, §17.6 | All four are RATIFIED with the v1 option adopted. |
| D-12 | **Routing reach is weighting-only in the served lane for v1** (OD-A-11); hard best-model routing only past the per-class detectability threshold (K-19). | §23.A OD-A-11; §16.4 K-19 | |
| D-13 | **Disposition-rate disparity flag** adopted **as a flag with its limitation printed, never a bias verdict alone**; the spec records it as under-identified. | §8.1 "Recorded limitation"; §23.A OD-A-08 RATIFIED | |
| D-14 | **Battery version freeze per release**; demotion only between releases; the §3 coverage proof is stated as of this document's battery version; **no self-modification ships until liveness demotion does**. | §23.D `OD-S-04` RATIFIED | |
| D-15 | **Q27's label question** — whether the `LLM` label follows the coverage knob when the gate activates. No DR says; the question becomes live **only at that activation**; recorded as not-re-adjudicated. | §25.2 item 2; §26.3 item 3 | Genuinely deferred with a named trigger. |
| D-16 | **DR-052's unnamed amendment of a DR-019 value** — the later ruling governs; the ledger's supersedes field is the orchestrator's to amend, not this document's. | §25.2 item 1; §26.3 item 3 | Ledger hygiene, not an architecture input. |
| D-17 | **Sibling-artifact register rows this spec points at but does not carry**: provenance key width (`OD-09`), whether the semantic-restatement flag may ever gate (`OD-08`), the value-decided verdict-state vocabulary (`OD-14`). The manifest's register is ratified wholesale by DR-062 (0 open, 17 rows). | §7.4 E-11, §7.4 E-12, §15 closing; §23 preamble | Adopted options live in the **manifest**, not here — architecture must read them there. |

### 7.2 GENUINELY-UNANSWERED (architecture needs an answer, or an explicit ruling that the gap is intended)

| ID | Gap | Where | Why it blocks |
|---|---|---|---|
| OQ-G1 | **`stage11Rollout` reads two ways in one document.** §4 row 16 prints "**OPEN — no DR**" and §4's closing line prints "18 of 19 carry a V value; `stage11Rollout` (row 16) is the one open row". §23.D `OD-S-01` is stamped **RATIFIED (DR-061), adopted: phased**, and §25.1 records "WITHDRAWN — RULED … The parameter now has a value; §4 row 16 carries it." §4 row 16 does **not** carry it. | §4 row 16 + §4 closing vs §23.D `OD-S-01` + §25.1 | The register table is the architecture's config source of truth; it currently disagrees with the ratification record about whether one of its 19 rows has a value. |
| OQ-G2 | **The per-row correctness-vs-enrichment classification is required but never supplied.** N-14 says the classification is "per row, once" and "part of the row's contract", and points at `OD-A-04` for "rows whose classification is still open" — but `OD-A-04` only classifies *per-item verification telemetry* as correctness. No enumeration of the 71 rows by correctness/enrichment exists anywhere in the document; the only other list is N-11's five-item protected core. | §21.2 N-14 `CARRIED-DESIGN`; N-11; §23.A `OD-A-04` | The budget subsystem cannot be built without knowing which rows it may skip. |
| OQ-G3 | **The declared hard bundle budget has no value and no derivation rule.** S-9c makes it a terminal condition ("past the **declared** hard bundle budget, components-only") but nothing declares it or says who does. | §12.1b S-9c `RULED(DR-058)` | It is a terminal in the SERVE state machine. |
| OQ-G4 | **`verdict state` is not a closed enum.** §12.8 says "Candidate members **include** supported / contested / unsupported / value-conditional / non-answer", while the parallel condition-marks enum is explicitly closed and exhaustive (S-12/S-13). No requirement closes the verdict-state set. | §12.8 table vs §12.3 S-12/S-13 | A typed state that gates terminal routes and the value overlay cannot be an open list under S-13's own law. |
| OQ-G5 | **The authorization model for the inspection/replay endpoint is unspecified.** S-23 says "authorized" and names no scheme, actor, or scope, while OD-M-20 introduces per-asker confidentiality boundaries on question-level history. | §12.6 S-23 `RULED(DR-054)`; §23.B `OD-M-20` | The endpoint exposes the full fact bundle across a per-asker privacy boundary. |
| OQ-G6 | **Q34's model limb: required or merely permitted?** The deleted-A-9 note says the residual question of a model limb for item-identity and stance resolution "is open at `OD-A-06`; **nothing in this document prohibits or requires it**." `OD-A-06` is stamped **RATIFIED (DR-061), adopted: a model limb for item identity and side only**. | §8.1 (post-A-8 note) vs §23.A `OD-A-06` | Q34's machine/model boundary — and whether the row stays MACHINE-verdict — depends on the answer. |
| OQ-G7 | **Body text still marks six ratified rows as open.** Q43's `alternate_method_required` is printed **OPEN** in §3.8 and §3.13 (closed by `OD-S-02`, adopted: drop the condition); Q59's `stage11Rollout` is printed **OPEN** in §3.11; `OD-A-08` is called "an open decision" in §8.1; `OD-M-23`'s correction is called "open" in §16.5 K-26; `OD-M-17` is called "an open decision" in §17.7 M-27; `OD-C-02`'s fire bar is called "an open charter acceptance item" in §8.4 A-19. All six are RATIFIED in §23. §3.13 additionally asserts "**Two residual runnability holes remain**". | §3.8, §3.11, §3.13, §8.1, §8.4 A-19, §16.5 K-26, §17.7 M-27 vs §23 | An architect reading §3 (the row contracts they must build from) sees obligations marked open that §23 closed. Lint L4/L5 only check that §23's rows are stamped, not that body prose agrees. |
| OQ-G8 | **`(candidate)` survives on a RULED requirement.** §12.8's table says "`UNINSTRUMENTED` caps it under A-7 (candidate)". A-7 is `RULED(DR-045 + DR-061 · OD-A-05)` and §26.2's lint reports **0 CANDIDATE clauses**. | §12.8 vs §8.1 A-7 vs §26.2 L2 | Whether `UNINSTRUMENTED` caps the confidence band is a serve-gate behaviour. |
| OQ-G9 | **The activation table is a normative dependency that is not in the pack.** §1 defines ACTIVE/INACTIVE/WAIT/POLICY_BLOCKED and the retired `·A·` marker "by `../research/18-activation-table.md`", and §3's *Fires* column is sourced from it. That path does not exist in this repository (only `docs/founding/` and `docs/missions/` exist). Same for `../research/05-battery-coverage-matrix.md`, `06-contested-decision-briefs.md`, `32-weight-derivation.md`, `33-symmetry-and-model-profiles.md`, `34-cross-run-memory.md`, and `../wayfinder/issues/29-*`. | §1, §3, §24 index | The per-row fire conditions in §3 are summarised, not fully specified, and the source is unavailable. |
| OQ-G10 | **The eight typed citation failure routes are never enumerated.** E-8 and knob 13 make them mandatory "from day one" but the list appears nowhere in this document. | §7.3 E-8; §4 knob 13 | A closed typed enum that the evidence subsystem must implement. |

---

## 8. Ambiguities noticed (not flagged by the spec)

Strictly limited to gaps an architect would have to resolve before designing modules. Each is
sourced.

| ID | Ambiguity | Sources in tension |
|---|---|---|
| AM-1 | **"Load-bearing" is the most load-bearing undefined term in the document.** It gates stranger coverage ("load-bearing nodes exhaustive always"), conformance sampling ("load-bearing sentences are always judged"), memory locator re-verification ("load-bearing claims only"), the ignorance ledger ("load-bearing unknowns"), presupposition termination ("a false **load-bearing** presupposition"), Q35's trigger (`source_is_load_bearing`), Q51's provenance join, and compose-pass ordering ("ordered by load-bearing priority"). No requirement defines it, names its producer, or says whether it is a machine computation, a model judgement, or a typed field. Under DR-037 that distinction decides several rows' labels. | §12.1a S-4b; §9.2 D-6; §17.4 M-16; §6.2 P-1; §3.1 Q3; §3.7 Q35; §12.2; §12.1b S-9a |
| AM-2 | **"Flip-sensitive nodes" is a coverage trigger with an ordering problem.** L-10 requires blind verification **always** for flip-sensitive nodes. Flip-sensitivity is produced by the compose-stage arithmetic — Q47's band flip and Q49's reversal set, both **Stage 9** — while CROSS is **Stage 8**. Nothing states how a Stage-8 coverage rule reads a Stage-9 quantity, or whether it uses a proxy. | §14.3 L-10 (DR-019 knob 3) vs §10.1 C-4 (Q47) and §10.2 C-6 (Q49); stage order §3.8/§3.9 |
| AM-3 | **Three closed sets of six are never reconciled.** Q7's settlement acts are "a closed set of six" `[CD]`; Q8's question types are "exactly one of six"; the abstention matrix has six classes (lookup, measurement, comparative, causal, predictive, value); and scorecard cells take "task class (from the battery's own Q7/Q8 taxonomy)" while the memory key takes act **and** type **and** field as separate fields. Whether Q8's six *are* the abstention matrix's six, and what "the Q7/Q8 taxonomy" resolves to as a single key, is never stated. Q50's trigger `question_type ∈ {comparative, design}` introduces a seventh name, `design`, that appears in none of the lists. | §3.2 Q7/Q8; §21 N-3; §16.2 K-3; §17.1 M-1; §3.9 Q50 |
| AM-4 | **`stance_at_action = UNASSIGNED` is both a legal enum member and an automatic `UNINSTRUMENTED` trigger.** A-1 defines the enum with `UNASSIGNED` in it; A-6 says "where … **any** stance is `UNASSIGNED` … the status is `UNINSTRUMENTED`". A-2's closed action vocabulary includes query runs (Q15) and absence rows (Q17), which occur **before** any evidence item exists to be the `subject_item_id`. Nothing scopes the population the diff runs over, so on a literal reading almost every run is `UNINSTRUMENTED`. | §8.1 A-1, A-2, A-6 |
| AM-5 | **Who supplies the risk tier?** casual / standard / high-stakes drives the abstention price multiplier, the cost envelope, blind-verification coverage, and DR-055's launch gate. The spec names the **asker** as the owner of depth parameters, `as_of` and caller scope (knob 11), and V as the owner of the deployment ceiling and the resolver — but never says who sets the risk tier, or whether it is asker-declared, deployment policy, or derived from the question. | §21 N-3; §21.2 N-9; §4.1 DR-019 knob 3; §14.4 L-12; §4.1 DR-021 knob 11 |
| AM-6 | **The 22 condition marks and the 9 honesty surfaces have no stated mapping.** S-25 asserts each surface has exactly one requirement, one UI row and one charter hook, but the inverse — which of the 22 marks renders on which of the 9 surfaces — is never given, and several marks (`NON-COMPARABLE`, `NOT_SAMPLED`, `AMENDED-SEARCH`, `MISSING-NUMBER`, `UNADJUDICATED`) map to no listed surface. | §12.3 S-12 vs §12.6 S-22/S-25 |
| AM-7 | **The fact bundle has no declared schema or version, yet it is a first-class persisted, fetchable, replay-relevant object.** S-1 defines it by exclusion ("nothing that is not a computed fact or typed record"); S-6 and S-9b require named fields inside it; S-23 makes it fetchable; DR-060 makes the conformance verdict a stored replay input. Nothing says whether the bundle itself is persisted, versioned, or content-hashed — which the replay law's "frozen records" language otherwise implies for every replay input. | §12.1 S-1; §12.1a S-6; §12.1b S-9b; §12.6 S-23; §12.5 (DR-060) |
| AM-8 | **Q46's halt implies re-entrant stage execution that no requirement models.** The halt "returns that input to WEIGH/RUN" mid-COMPOSE, bounded at K=1 per parent per run. Whether the returned input re-runs a full stage, a single row, or a scoped subgraph — and how that interacts with the frozen-at-run-start sample rate and the envelope — is unstated. The same shape appears in DR-015's propagate ("a model re-judges **only the affected nodes**") and in Q29's regeneration return. | §10.2 C-5/C-5a; §13.1 T-3; §9.2 D-6; §21.2 N-13 |
| AM-9 | **The two-phase dual-act run needs a phase marker that nothing names.** F-12 makes phase order **machine-enforced** on one shared graph, and F-13 requires one answer with two labelled sections. No requirement says where the phase lives (run state, graph annotation, node-level tag) or how "phase 1 has settled" is decided — which is the predicate the enforcement gate reads. | §5.5 F-11, F-12, F-13 |
| AM-10 | **WAIT is a durable state with no stated wake mechanism inside a run.** Q61 "may sit in WAIT indefinitely without that being a defect" and is woken by an external resolver outcome; Q18 WAITs on a missing volatility class and is "un-waited by exactly one classification call"; Q30's computation WAITs for Q45's operator. DR-015's wake-ups are specified for *answers*, not for *rows*. Whether a WAIT row is a suspended computation, a queued job, or a re-evaluated predicate is behaviourally visible (it decides whether a run can terminate with rows still in WAIT) but unstated. | §1; §3.11 Q61; §3.4 Q18; §3.6 Q30; §13.1 T-2 |
| AM-11 | **Purity (H3) versus a Postgres-resident graph.** H3 forbids database access inside the scoring math; W-1 puts the graph, the ledger and the provenance in Postgres; S-21 requires a total deterministic evaluation order. This implies a materialise-then-compute boundary with a deterministic serialisation, but no requirement names that boundary or the ordering key. | §19 H3; §20 W-1; §12.5 S-20, S-21 |
| AM-12 | **The memory store's identity dimension is unnamed.** OD-M-20 splits the store — class-level facts deployment-wide, question-level pulls **per-asker** — and knob 11 makes the asker the decision/action owner with caller-supplied scope. No requirement defines an asker/tenant identity, how "caller scope" relates to it, or whether the memory key's `EXACT_QUESTION` tier ("canonical question text **and caller scope** identical") is comparing the same thing the per-asker partition uses. | §23.B `OD-M-20`; §4.1 DR-021 knob 11; §17.2 M-4 |
| AM-13 | **"One bounded model call" / "exactly one bounded declaration call" is never given a bound.** Q24's limitation sentence, Q45's operator declaration, and Q18's classification call are each specified as exactly one bounded call; nothing defines what "bounded" constrains (tokens, retries on schema failure, latency). Under K-1 a schema failure is a recorded silent-drop event, which implies retries exist. | §3.5 Q24; §10.1 C-2; §7.5 E-13; §16.1 K-1 |
| AM-14 | **Q19's provenance key and Q31/G1's "measured behavioural difference" both require a measurement the spec does not locate.** E-11 says the partition is computed from stored fields with a V-owned key width (deferred to manifest `OD-09`); D-10 requires the rival carver be "selected for **measured behavioural difference**" — a measurement that is not in Tier 1's process-fact list (which has determinism/self-consistency and dispersion against the panel, but no pairwise behavioural-difference metric). Under DR-039 a metric may not be invented to fill this. | §7.4 E-11; §9.4 D-10; §16.1 K-1; §2 item 5 (DR-039) |

---

## 9. Quick-reference: DR → architecture consequence

Only the DRs with a direct stack or module consequence. Full index at spec §24.

| DR | Architecture consequence |
|---|---|
| DR-013 / DR-014 / DR-055 | Provider identity is configuration; ≥2 makers required at launch for standard-and-above; cap-label-lift is the standing fallback shape. |
| DR-015 / DR-016 | Persistent wake/TTL scheduler; nothing is ever deleted; archival revival is driven by the memory matcher. |
| DR-017 | Value overlay is a detachable layer with a byte-identity invariant. |
| DR-023 | A first-class flag/config register, V-ratified before production. |
| DR-024 | Postgres, including observability; no second store; start from scratch. |
| DR-027 | Execution ledger with raw judgements stored before the math; user-visible digest. |
| DR-029 (H1–H8) | Provider interface; config-only second provider; **pure** scoring math; strategy-interface semantics; evidence-gated leaves; anonymised debate; skeptic certification; cost as a soft tie-breaker only. |
| DR-030 / DR-056 | One scoring engine, one graph, one serving truth; FINAL organ↔stage table; cycle law at construction, compute and write. |
| DR-034 / DR-060 | Replay with no AI in the path; numbers byte-identical; the serve decision replays as stored data; deterministic total ordering. |
| DR-037 / DR-040 | Per-row two-field contracts; MACHINE rows proven zero-call; explicit inter-row hand-off routes. |
| DR-044 / DR-049 / DR-057 / DR-058 / DR-059 | Fact bundle → composition model → conformance judge → machine enforcement, as a bounded state machine with `max_recompose = 2`, multi-pass composition, machine-injected honesty fields, and replay-eviction of a single unreplayable number. |
| DR-045 / DR-050 | Two new ledger stamps; symmetry diff; bounded halt-and-deepen at K=1. |
| DR-046 | Postgres model ledger; scorecards as pure ledger functions; eight routing guards; demonstrated cold-start exit. |
| DR-051 | Closed, centrally-owned enum of 5 abstention kinds + 22 condition marks + 4 terminal routes. |
| DR-052 | Visible run cost envelope with a typed terminal; protected core; sample rate frozen at run start. |
| DR-053 | Two machine-ordered phases on one graph for dual-act questions. |
| DR-054 | Wire-level projections + an authorized inspection/replay endpoint. |
| DR-061 / DR-062 / DR-063 / DR-064 | Spec register closed (51/51); manifest register closed (17/17); charter register closed; UI's 30 presentation cells delegated to mockup review. |
