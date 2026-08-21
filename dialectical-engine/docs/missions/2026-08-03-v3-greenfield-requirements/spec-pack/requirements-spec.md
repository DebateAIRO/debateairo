ACCEPTED — DR-067 (2026-08-05) — mission REQ-V3-GREENFIELD-R1

# V3 requirements specification — what the engine must do

Spec-pack artifact 1 of 4 (DR-001; artifact 4 re-scoped from race criteria to the
**Quality Charter** by DR-047) · Mission REQ-V3-GREENFIELD-R1
Authoring ticket: [`../wayfinder/issues/29-author-requirements-spec.md`](../wayfinder/issues/29-author-requirements-spec.md)
Authority: [`../wayfinder/decisions-ledger.md`](../wayfinder/decisions-ledger.md) (DR-001 … DR-048)
Companion artifacts: [`carryover-manifest.md`](carryover-manifest.md) (artifact 2),
UI boundary contract (artifact 3, DR-048), Quality Charter (artifact 4, DR-047).
Status: **draft**. Not accepted until three lenses review, the orchestrator merges
(DR-006), and V accepts.

---

## 1. How to read this document

**What is being built.** V3 is a reasoning engine that answers questions with
evidence. Before it dares answer anything it walks a written discipline called
**the battery**: 62 questions (Q1–Q62) and 9 human-set rules (R1–R9), grouped into
eleven stages — LOCK (pin the question down), ROUTE (decide what kind of question
it is), AIM (write the search plan), HARVEST (actually search), RUN (measure
something yourself), SPLIT (break the question apart), WEIGH (weigh what came
back), CROSS (let a rival AI attack it), COMPOSE (put the pieces back together),
SERVE (write the answer), SETTLE (come back later and score it). This document
says what the engine must **do** at every one of those 71 rows, and what it is
**forbidden** to do.

**Who decides what.** A human, **V**, makes every product decision. Each such
decision is recorded once, as a numbered row (`DR-NNN`) in the decisions ledger.
Every normative sentence here cites the DR that authorises it. **A normative
sentence with no DR is a defect in this document and should be raised at review.**

**Three labels, and what they cost.** Every row is labelled by who does the work:

| Label | What it means as spec law |
|---|---|
| `MACHINE` | A **prohibition**. No model call may occur at this row, ever, and the test suite asserts zero calls. |
| `LLM` | A **licence**. A model owns the substance; code may persist, validate the shape, and nothing more. |
| `HYBRID` | **Both are mandatory**, in a named division: named machine gates *and* a named minimal model output. |

**The label law (DR-037), which decides every borderline row.** *A row is HYBRID
when code both constrains the model's answer into a typed shape **and** can act on
it without asking again — stop the run, route it, downgrade it, or block serving.
A row is LLM only when code does nothing with the answer but store it.* Because a
label can otherwise flatter a model's judgement into looking machine-verified,
**every row records two fields**: `substance:` (who actually decided) and
`enforcement:` (the named machine gates). Judgement never masquerades as
verification.

**A related law for human-set rules (DR-036).** A human-set rule may never be
labelled model-work: **content from the model, force from the machine.**

**The row-boundary law (DR-040).** A row owns only the work its own contract
names. Judgement a row merely *triggers* is billed to the row that owns that
judgement, and **the trigger is written down**. This is why Q22 (execute and
capture) is machine even though a blocked execution needs explaining — the
explaining is Q25's, and the Q22→Q25 route is a requirement.

**Activation vocabulary (`../research/18-activation-table.md`).** A row is
**ACTIVE** when the run's recorded state already answers that row's own written
condition and the answer is yes. **INACTIVE** means the state says no — the skip is
recorded with its predicate and evidence, so a skipped row stays auditable and
servable ("nothing could be measured" is an answer, not a silence). **WAIT** means
the state does not yet hold what the condition asks about — and the system must
**not** spend a model call guessing the missing input. **POLICY_BLOCKED** means the
missing input is a V decision: the row is owed but unrunnable, and must never be
filed as INACTIVE, because an inactive row reads as *satisfied* on a coverage
report while a policy-blocked row is a hole in the specification. A cache hit never
sets a row INACTIVE.

**The `·A·` marker is retired.** The source plan's "always-run" typography
contradicted the rows' own written conditions in twelve places; in every case the
predicate won. The marker survives only as provenance and **must not appear in V3
as a fire condition** (`../research/18-activation-table.md` §Reconciliation
register). Exactly three rows are unconditional: **Q1**, **Q51**, and **Q62's
liveness limb**.

**Cross-references, never duplication.**

- The six **kept organs** — the scoring engine, the per-node judge contract, the
  one graph, the decision→spawn plumbing, the execution ledger, the serve layer
  and its debug facet — are specified in [`carryover-manifest.md`](carryover-manifest.md)
  §§4–9. This document does not restate them; where a row depends on one, it cites
  the manifest section.
- The **defect register D1–D5** (what V2 does that V3 must not) lives in the
  manifest §10 and the glossary. Not restated.
- The manifest's own open rows **OD-01 … OD-23** belong to artifact 2 and are not
  re-litigated here; §23 carries a single pointer to them.
- Terms a stranger needs are defined in
  [`../wayfinder/GLOSSARY.md`](../wayfinder/GLOSSARY.md).

**The stranger test governs this document too** (DR-018, ratified for R9 by
DR-031): every node *and* the verdict must be individually restatable by someone
who knows nothing about the machinery. **A reader who cannot restate a section of
this spec in their own words has found a bug in the section, not in themselves.**

---

## 2. Governing law and the order of authority

1. **The decisions ledger is the authority.** Tickets are containers; DR rows are
   law. Where this spec and a DR disagree, the DR wins and this spec is wrong.
2. **Every row gets a disposition** (DR-004). All 62 questions and all 9 rules are
   closed in §3. Experiments are deferred until after a working prototype and
   **never gate this spec**.
3. **Requirements constrain behaviour only** (DR-005) — *except* where V has
   imposed a stack constraint. DR-024 imposes the first (Postgres, §20).
4. **Nothing from V3 must match V2** (DR-033). V2 output conformance is not a V3
   requirement anywhere. V3's ground truth is external literature vectors plus
   property tests of V3's own rules.
5. **No invented measurements** (DR-039). A metric, label, or rule enters this spec
   only with hard facts behind it. Nothing is adopted for the sake of measuring
   something or to manufacture confidence.
6. **No judgement ⇒ no number** (DR-028). Any component that would otherwise emit a
   number it did not measure emits a typed, visible record instead.
7. **Everything executed is recorded** (DR-027). Attempts, failures and
   could-not-dos are recorded and digest-visible to the user; the algorithm's
   behaviour must be consistent with the record.
8. **The replay law** (DR-034). V3 permanently refuses to serve a number it cannot
   recompute from its frozen records, with **no AI in the replay path**;
   continuously self-tested, plus a launch ceremony — one independent replay of
   recorded runs that must pass exactly.
9. **The eight house rules are floors** (DR-029). Where a battery successor is
   stronger it governs; the house rule remains the minimum. §19.
10. **One engine, one graph, one serving truth** (DR-030). §18.
11. **No orphaned modules** (DR-047, charter clause 4). Everything shipped is
    reachable and called; dead code eating tokens and processing is indicted at
    code level.
12. **The race is retired** (DR-047). There is no formal race, no frozen victory
    criteria, no control-arm ceremony, no matched-cost law, no V2 pin. Humans
    compare outputs informally at will; V2 stays a reference (DR-033). Acceptance
    is the Quality Charter's (artifact 4).

### 2.1 Authority tagging — how to tell law from proposal

**Every normative clause in this document carries one of two tags**, and the tag is
the reader's contract. **There is no third tag: the `CANDIDATE` class is empty.**
DR-061 ratified all 51 rows of the open register wholesale, DR-057 … DR-060 settled
the five residual serve questions, and DR-062 … DR-064 closed the sibling artifacts'
registers — so nothing in this document is still waiting on V.

| Tag | Meaning | What a builder does with it |
|---|---|---|
| **`RULED(DR-n)`** | Entailed by the exact text of a FINAL decision record, or — where the tag reads `RULED(DR-061 · OD-nn)` — by the option text of the register row DR-061 ratified by reference. | **Build it.** It will not change without a new DR. |
| **`CARRIED-DESIGN`** | Elaborates a ruled decision with mechanism no DR states in words — the reading V accepted the direction of, not the wording of. | **Build it, expect refinement.** A lens or V may amend the detail without a new ruling. |

**Three standing rules:**

- **R-AUTH-1** `RULED(DR-061)` · **No open register row exists**, so no clause can
  contradict one. The register at §23 is closed; every row is stamped
  **RATIFIED — DR-061** and carries the option that was adopted. §26 is the lint
  that proves it.
- **R-AUTH-2** `RULED(DR-061)` · **Every `Requirement` head carries a tag.** An
  untagged obligation is a defect, caught by §26's audit. Imperative wording is now
  always an obligation, because there is no longer any span in which it could mean
  a recommendation.
- **R-AUTH-3** `CARRIED-DESIGN` · A row's **classification** (MACHINE / HYBRID /
  LLM) being ratified is not the same as its **full contract** being ratified.
  §3's Disposition column is `RULED`; requirement text that goes beyond the DR's
  own words is marked **`[CD]`** in the table.

### 2.2 The coexistence rulings — what changed since the first draft

Eight decisions from the coexistence sitting close termination and boundary holes
this document previously left open. Each has a section that states it in full.

| DR | What it settles | Where |
|---|---|---|
| **DR-049** | **SERVE termination**: `max_recompose = 2`; the third state is components-only with a DEFECT badge; gate order **R9 → Q53 → conformance → Q51**; conformance may never demand an R9-violating edit; Q53's residual is a fact-bundle field. | §12.1 |
| **DR-050** | **Q46 deepening bound**: K=1 halt-and-deepen round per parent per run, then a visible `LEVERAGE_UNRESOLVED` residual. | §10.2 |
| **DR-051** | **Partition law**: the five abstention kinds apply **only** to ignorance-ledger unknowns; every other typed state is a **condition mark** in a closed parallel enum, with an exhaustive mapping table. | §12.3 |
| **DR-052** | **Cost envelope**: a visible, terminal run envelope; enrichment skips first, then a hard stop serving verified components with `ENVELOPE_EXHAUSTED`; protected core extended to include **serve-conformance**; stranger sample rate **frozen at run start**. | §21.2 |
| **DR-053** | **Mixed questions**: two phases on one graph — empirical settles first, value machinery runs on the settled graph; one answer, two labelled sections; typed **dual settlement act**. | §5.5 |
| **DR-054** | **Wire boundary**: the browser receives typed honesty **projections**; the full fact bundle and conformance record are fetchable through an **authorized inspection/replay endpoint**; internal prompt material is excluded from the default view. | §12.6 |
| **DR-055** | **Multi-maker is a launch gate**: standard-and-above tiers execute real different-maker critique from day one; single-maker is legal only as labelled degraded operation under DR-014's caps. | §14.4 |
| **DR-056** | **Ratified**: the organ↔stage table is **FINAL** (no longer vetoable); the **cycle law** is closed at three layers — construction refuses, compute errors, write rejects. | §18, §10.5 |

**The register-review rulings (2026-08-05) — the register is now closed.**

| DR | What it settles | Where |
|---|---|---|
| **DR-057** | **R9 surfaces**: node text is stranger-checked **pre-compose**, and the **composed verdict gets its own R9 pass post-compose**; a verdict-R9 failure takes DR-049's components-only terminal — no new loop. Closes the last serve-gate question. | §12.1a |
| **DR-058** | **Compose size law**: an oversized fact bundle is composed in **multiple passes by load-bearing priority**, with honesty-critical fields **machine-injected** outside model discretion — silent truncation is impossible; past the declared hard budget, components-only. | §12.1b |
| **DR-059** | **Degraded-mode obligations**: the reversal point and builds-on-previous disclosure get **structured projection fields that render without composed prose**. **Replay-eviction**: a component number that fails replay is **evicted with a typed missing-number mark** and the rest serves with a DEFECT badge — one number lost, never the answer. | §12.1c |
| **DR-060** | **Conformance scope**: load-bearing sentences are **always** judged; non-load-bearing sampled at the frozen stranger rate — the protected core forbids skipping the judge **role**, never mandates exhaustive sampling. **Ceremony scope**: numbers replay **exactly**; the serve **decision** replays as **stored data**, so the ceremony is deterministic. | §12.1a, §12.5 |
| **DR-061** | **The spec register is RATIFIED WHOLESALE** — all 51 rows adopt their recommended option, by reference to the register's own option text. §23 is now a closed record, not an open queue. | §23, throughout |
| **DR-062** | The **carryover manifest's** register is ratified wholesale — its 17 organ rows are closed. This spec's pointer to it is **0 open**. | §23 preamble |
| **DR-063** | The **charter's** register is ratified: the fire bar, the verdict-model names with all numbers deferred to the flag-register ratification, ceremony independence, orphan exemptions, and which acceptance items block release. | §12.8, §22 |
| **DR-064** | The **UI contract's 30 presentation cells are DELEGATED to mockup review** — they stay counted and consequence-annotated, and V rules each against actual mockups during the UI build phase. **The requirements mission closes without them**: architecture consumes their consequences, not their shapes. | §12.6 |

---

## 3. Row-closure table — all 71 rows

**How to read a row.** *Disposition* is the final V ruling with the two fields
required by DR-037 (`substance:` / `enforcement:`) compressed into one cell.
*Seats* preserves the original three-seat disagreement for the 28 contested rows
(DR-004 provenance) in the order **⟨Hermes / Codex / Grok⟩**; a dash means the
seats were unanimous. *Fires* is the activation disposition from
`../research/18-activation-table.md`, with **blocked-on** naming anything that
still prevents the row running; `—` means nothing does. *Requirement* is the
substantive obligation, not a section name; **§** points at the chapter that
develops it.

Legend: `M` = MACHINE, `H` = HYBRID, `L` = LLM.

**Authority within this table (R-AUTH-3).** The **Disposition** cell is
`RULED(DR-n)` by the DR named in the same row — that is what V ratified. The
**Requirement** cell is `RULED` only where its words are entailed by that DR's own
text; where it supplies mechanism the DR does not state, it is marked
**`[CD]`** = `CARRIED-DESIGN` inline. Eleven clauses were audited as exceeding
their DR's exact text and are marked: Q3's three-member enum, Q7's closed six,
Q10's never-regenerate baseline, Q12's residue-free ledger mapping, Q13's
mandatory measurement class, Q26's bidirectional-entailment re-split, Q31's packet
fingerprint, and the halt / feedback-loop / serving-block / read-back contracts on
Q46, Q49, Q53 and Q60 — all of which DR-031 ratified as *classifications with
named riders*, not as full contracts. **`[CD]` text is still build-ready**; it is
flagged so a lens knows which sentences a ruling would not defend verbatim.

### 3.1 Stage 1 — LOCK (Q1–Q6): pin down the question, before any searching

| Row | Disposition | Seats | Fires · blocked-on | Requirement | § |
|---|---|---|---|---|---|
| **Q1** What is this person really asking, and what would they do differently? | **HYBRID** · substance: LLM · enforcement: validate the answer→action table; detect whether any admissible answer changes any action; persist and route INERT vs CONTINUE | ⟨L/H/L⟩ | **always** (`run_opened`) · — | The model infers the asker's real decision and maps every admissible answer to the action it would change. If no admissible answer changes any action, code **stops the run** with a typed `INERT` verdict and hands the question back unresearched — code performs the stop test without a second judgement. The decision/action owner is the asker (DR-021 knob 11). | §5 |
| **Q2** What exactly am I looking into, and what am I deliberately leaving out? | **HYBRID** · substance: LLM · enforcement: persist the dated binding as the sole scope key; refuse retrieval outside it | — | trigger `Q1=CONTINUE` · — | The run records a dated inclusion/exclusion binding — population, comparator, outcome, time — which becomes the **sole scope key** for retrieval, for admissibility at Q32, and for the cross-run memory key (§17). | §6 |
| **Q3** What is the question taking for granted, and is any of it wrong? | **HYBRID** · substance: LLM · enforcement: validate the presupposition enum; route each consequence | ⟨L/H/L⟩ | trigger `Q1=CONTINUE` · — | A false load-bearing presupposition **terminates the run with a typed non-answer** that says what is wrong instead of answering (DR-037's named terminal route). **`[CD]`** the three-member enum **false / repairable / contestable**, with a repairable presupposition repairing the question visibly and a contestable one carried as a named assumption — DR-037 names the route, not the enum. | §5 |
| **Q4** Before I look: what would make this a yes, and what a no? | **HYBRID** · substance: LLM · enforcement: freeze, hash and timestamp the answer rule; block first retrieval without it; version amendments | — | trigger `Q1=CONTINUE` + `before_first_search` · — | The answer rule is written and **frozen, hashed and timestamped before the first retrieval**; a run with no Q4 does not start. `before_first_search` is an **ordering deadline, not an activation conjunct** — a missed deadline is a gate failure, never a deactivation, or a run could delete its own answer rule simply by starting to search. | §5 |
| **Q5** Before I look anything up: what do I already think, and how sure? | **HYBRID** · substance: LLM · enforcement: typed `prior_basis`; forbid a silent 0.5, a retrospective prior, and later upward revision | — | trigger `Q1=CONTINUE` + `before_evidence` · — | A stated prior with a typed basis: `prior_basis ∈ {STATED, ANCHOR_CLASS, CARRIED_POSTERIOR, NO_COMPARABLE_CLASS}` — **no `DEFAULT`, no `ASSUMED` member**, on DR-017's precedent. A silent 0.5 is forbidden; a retrospective prior is forbidden; the recorded prior may never be revised upward later. | §5, §17 |
| **Q6** Can I do this with the time and access I have — and how bad is "I don't know"? | **HYBRID** · substance: LLM · enforcement: resource envelope hashed; abstention cell resolved from the matrix; cap declared for Stage 6 | — | trigger `Q1=CONTINUE` · — (price dependency **satisfied** by DR-012) | The run declares its resource envelope, reads its **abstention price** from the question-class × risk-tier matrix, and declares the Stage-6 regeneration cap that Q26 consumes. The cell is named on the served answer. A run whose cell cannot be resolved is marked `UNPRICED` and may not claim over-abstention compliance. | §21 |

### 3.2 Stage 2 — ROUTE (Q7–Q10): decide what kind of question this is

| Row | Disposition | Seats | Fires · blocked-on | Requirement | § |
|---|---|---|---|---|---|
| **Q7** What would actually settle this? | **HYBRID** · substance: LLM · enforcement: validate the settlement act; route a pure-value act to a human; enforce dual-act phase order | ⟨L/H/L⟩ | trigger `LOCK_complete` · — | **A settlement act of `value` alone routes immediately to a human and the empirical path stops** — the machine never holds an opinion about what ought to be (DR-037). **Amended by DR-053:** a question carrying *both* an empirical and a value half records a **typed DUAL ACT** and runs two machine-ordered phases on one graph (§5.5) instead of stopping. **`[CD]`** the act vocabulary is a closed set of six. | §5, §5.5 |
| **Q8** What kind of question is this, and what do I need before I may answer it? | **HYBRID** · substance: LLM · enforcement: validate exactly one of six types; activate that type's evidence obligations; apply the visible-fallback rule | — | trigger `Q7 not terminal` · — (the halt is **removed** by DR-021 knob 10) | Exactly one question type from the closed six; the type activates its evidence-standard obligations (R7). An **unresolved type auto-serves a visible factual fallback with a travelling label — no approval step** — and the label rides the answer **and every node's provenance**. The old "policy-blocked halts the run" branch is deleted. | §5 |
| **Q9** What else could be true, and what one observation would rule something out? | **HYBRID** · substance: LLM · enforcement: validate the alternatives and their pairwise discriminating observations; emit the terminal route; feed the best candidate to Q20 | ⟨L/H/L⟩ | trigger `live_answer_count > 1` · — | The model names the rival answers still alive and one observation that would kill at least one. Where **no** observation can separate them, code emits `NOT_EMPIRICALLY_DECIDABLE` and serves that as the answer. The strongest discriminator is handed to Q20 as a probe candidate. | §5 |
| **Q10** Do I need to break this into smaller questions, or can I just answer it? | **HYBRID** · substance: LLM · enforcement: persist the split decision, its justification and the undivided baseline; gate all of Stage 6; enforce "no justification, no split" | ⟨L/H/H⟩ | trigger `Q7 not terminal` · — | The split decision is persisted **with its justification and with the undivided baseline answer**; no justification ⇒ depth-zero, no split (DR-037's named terminal route). **`[CD]`** the stored baseline is Q48's only comparator and **is never regenerated** — DR-037 names the depth-zero rule, not the baseline's immutability. | §5, §10 |

### 3.3 Stage 3 — AIM (Q11–Q14): write the search plan

| Row | Disposition | Seats | Fires · blocked-on | Requirement | § |
|---|---|---|---|---|---|
| **Q11** What exactly will I type into the search box, including the words for the opposite answer? | **HYBRID** · substance: LLM · enforcement: dedupe, freeze, version and hash the query set; refuse retrieval on an underived query; type every amendment | — | trigger `research_route and Q4_present` · — | Every query is derived from the question, **includes disconfirming terms**, and is deduped, frozen, versioned and hashed before any retrieval. Retrieval on a query not derived here is refused (R1). Amendments are typed **mechanical repair** (full confirmation power) or **semantic re-aim** (exploration only; confirmation requires re-freezing and re-running), each logged with type and reason and visible at serving. | §7 |
| **Q12** What don't I know yet that I'd need to know, and can I find it out? | **HYBRID** · substance: LLM · enforcement: ranked ignorance ledger with typed closure states; forbid silent deletion or conversion to assumption; route a decisive unknown to a typed non-answer | ⟨L/H/H⟩ | trigger `research_route` · — | A ranked ledger of load-bearing unknowns, each with its allowed closure route (retrieval, measurement, human choice, or nothing) and a typed closure state. **An unknown may never be silently deleted or quietly converted into an assumption** — DR-036's named refusal power. **`[CD]`** the ledger maps onto the five abstention kinds at Q55 without residue; under DR-051 that mapping is now scoped to ledger unknowns only (§12.3). | §6 |
| **Q13** Who would actually know this, and what does each stand to gain? | **HYBRID** · substance: LLM · enforcement: require an opposition-capable class; resolve known locators; surface single-class coverage; refuse a plan without opposition | ⟨L/H/H⟩ | trigger `research_route` · — | The source plan must contain **at least one party capable of arguing the other way**, and code refuses a plan that does not (DR-036's named refusal power). Interests are recorded **before anything is read**, so an interest cannot be rationalised afterwards. **`[CD]`** a mandatory measurement class alongside the opposition class — the merged contract requires it; DR-036 names only the opposition refusal. | §6 |
| **Q14** Who will try to tear this apart, and what counts as them landing a hit? | **HYBRID** · substance: LLM · enforcement: enumerate critic candidates by the different-maker rule; record hit criteria before critique | — | was **policy-gated** `lineageEquivalence` → **UNBLOCKED by DR-013** · — | Critic candidates are enumerated under the bright line **different maker = different lineage**, and what counts as a landed hit is declared **before** the critique runs. With no eligible candidate the consequence is DR-014's cap-label-lift path, never silence. | §14 |

### 3.4 Stage 4 — HARVEST (Q15–Q19): actually go and search

| Row | Disposition | Seats | Fires · blocked-on | Requirement | § |
|---|---|---|---|---|---|
| **Q15** Did I run the searches I said I would, and what did each turn up, including the empty ones? | **MACHINE** · substance: MACHINE · enforcement: zero model calls, asserted by test | — | trigger `Q11_frozen and research_route` · — | Every admitted query is issued and recorded with class, time, hit count, include/exclude reason, **zero-result flag and access failures**; planned-versus-run is diffed. A cache hit keeps this row ACTIVE and is merely satisfied from the archive. | §7 |
| **Q16** Did I open this or am I going on the snippet — and is this the original or a summary? | **HYBRID** · substance: LLM (only where typed fields do not settle it) · enforcement: archive locator + version + time; record opened / preview-only / blocked and primary / secondary; extract spans; character-level exact compare where available | — | trigger per candidate source (0..N) · — | Access depth is a **three-valued required record**, not an adjective. A **preview-only source may never supply a number or a quote.** Citation failures take the eight typed routes from day one; the hard-kill gate auto-activates when V3's character-level quote matcher ships and validates. | §7 |
| **Q17** What did I go looking for and fail to find? | **MACHINE** · substance: MACHINE · enforcement: zero model calls | — | trigger `Q15_complete` · — | Every zero-result search is projected into a typed `{query, scope, date}` absence row. **Absence is a servable finding**, not a silence. | §7 |
| **Q18** Is my newest source recent enough, and does this answer go stale? | **HYBRID** · substance: LLM (volatility class, only where the registry supplies none) · enforcement: age recomputed against `as_of` and never cached; refusal rule applied | — | trigger `answer_can_change_over_time`; **no registry class ⇒ WAIT**, un-waited by one classification call · — | Newest-source age is computed against the run's `as_of` and **never cached**. A fast-moving question with a stale newest source **refuses**; a slow or static one serves with an explicit staleness statement. The result stamps the answer's relevant-as-of (DR-015). | §7, §13 |
| **Q19** Are these really separate sources, or the same people and data wearing different hats? | **HYBRID** · substance: LLM (uncertain edges only) · enforcement: cluster by the declared provenance key; each cluster contributes **once, at its strongest member**; expose uncertain edges | — | trigger `admitted_source_count > 1` · — | Sources are partitioned by a declared provenance key and each cluster contributes exactly once at its strongest member — a **gate, not a bonus**, because the scoring arithmetic already rewards multiple supporters and paying again for independence double-counts it. Three restatements of a 0.40 claim contribute 0.400, not 0.784. | §7, manifest §4.2g |

### 3.5 Stage 5 — RUN (Q20–Q25): measure something yourself

*Stage law: if a claim can be measured with the resources on hand, asserting it
unmeasured is inadmissible; a skip is **recorded** and downgrades the answer to
documents-only. The law forbids a **silent** skip, not an INACTIVE state.*

| Row | Disposition | Seats | Fires · blocked-on | Requirement | § |
|---|---|---|---|---|---|
| **Q20** What is the smallest, cheapest thing I could run that would move this answer? | **HYBRID** · substance: LLM · enforcement: deterministic candidate enumeration over the resource envelope; INACTIVE must be recorded with predicate and evidence | — | trigger `empirical_research_route` · — | Probe candidates are enumerated deterministically from the recorded resource envelope, seeded by Q9's discriminator. "Nothing was runnable" is a **recorded state with its predicate and evidence**, never an absence. | §8 |
| **Q21** Before I run it: what do I expect, and what would tell me I'm wrong? | **HYBRID** · substance: LLM · enforcement: freeze, hash and timestamp the prediction before execution | — | trigger `runnable_selected` · — | The expectation and the falsifying result are frozen, hashed and timestamped **before** the probe runs; the prediction is not reusable across runs. | §8 |
| **Q22** What exactly did I run, and what exactly came back? | **MACHINE** · substance: MACHINE · enforcement: zero model calls; explicit Q22→Q25 route; automatic relabel | ⟨M/M/M-exec + H-blocker⟩ | trigger `runnable_selected` · — | Execute the pinned command; capture raw output, environment, exit code and timings; prove it replays. **A blocked execution routes explicitly to Q25**, which already owns naming the need, the owner and the authorisation. **Irreproducible output auto-relabels `REASONING`.** No model narrates an execution or paraphrases a result into the evidence ledger. | §11 |
| **Q23** Does this tool actually work — does it say yes when the answer is yes, and no when it's no? | **MACHINE** · substance: MACHINE · enforcement: zero model calls | — | trigger `instrument_used` · — | Registered **known-positive and known-negative** fixtures are executed and receipted by instrument, environment and fixture hashes. An instrument that cannot fail its negative fixture is not certified. | §8 |
| **Q24** Did I keep the attempts that went wrong, including the ones that make me look bad? | **HYBRID (narrow)** · substance: MACHINE for the ledger, diff and caveat binding; LLM for one bounded limitation sentence only where the diff does not derive it · enforcement: caveat bound to result id; sentence checked by the conformance judge | ⟨H/M/M⟩ | trigger `measurement_attempted` · — | An append-only attempt ledger keeps **every** attempt, including the embarrassing ones; each result's caveat is bound to its result id by machine and travels everywhere the number is shown. One bounded model call writes the limitation sentence **only** when it is not derivable from the attempt diff; the sentence is served through serve composition and machine-checked against the facts. | §8, §12 |
| **Q25** If I can't run anything at all — what would it take, and who can say yes? | **HYBRID** · substance: LLM · enforcement: typed not-runnable abstention; named need, owner and authoriser | — | trigger `Q20_no_runnable or Q22_blocked` · — | When nothing could be run, the row names what it would take, who owns the blocker and who can authorise removing it, and emits the typed **not runnable** abstention kind. This row is the declared home for Q22's uncatalogued-blocker narrative (row-boundary law). | §11 |

### 3.6 Stage 6 — SPLIT (Q26–Q31): break the question apart, if that was justified

*The whole stage runs only when Q10 decided to split. The generate/filter loop
carries the hard cap declared at Q6.*

| Row | Disposition | Seats | Fires · blocked-on | Requirement | § |
|---|---|---|---|---|---|
| **Q26** What would all have to be true for this to hold — and what one thing would sink it? | **HYBRID** · substance: LLM · enforcement: non-empty child **and** defeater arrays; bidirectional entailment validation with discard/re-split; retry → lineage rotation → abstain; the hard cap; defeater union by code | ⟨L/H/H⟩ | was **policy-gated** `splitIterationLimit` → **UNBLOCKED by DR-020** (2 rounds / 3 attempts) · — | Children and defeaters are produced **in one act**. A supports-only output is **kept, never discarded** — discarding it for the author's blind spot throws away real work. **Defeater generation is a system obligation**, routed to a differently-categorized model; the author's self-attack weakness is recorded as a scorecard process fact. **A node is complete only when its defeater set is non-empty or explicitly exhaustion-marked.** **`[CD]`** a carving where neither the pieces entail the parent nor the parent the pieces is a topic list and is discarded and re-split — the merged contract's bidirectional-entailment check; DR-041 does not name it. | §9 |
| **Q27** What part of the original question am I simply not covering? | **LLM** (the battery's single LLM row) · substance: LLM · enforcement: stored and served; the claim it may make is bounded | — | trigger `Q10.split=true` · — | A **plain-language** uncovered-scope statement, minted as node text a stranger can restate. Under DR-020 knob 8 it is a **diagnostic `UNCOVERED-SCOPE` note only**; `coverage_passed` is a forbidden claim, and coverage becomes a gate only after outcome data sets the threshold. | §9 |
| **Q28** Could somebody who never saw the original question answer this piece on its own? | **HYBRID** · substance: LLM · enforcement: isolated per-child packet; pass/kill recorded per child; per-node restatement scoped by `strangerTestCoverage` | — | trigger per Q26 child (0..N) · — | Each child is tested in an **isolated context** against the bare question. A child that a cold reader cannot restate — "say it back cold" — fails and returns for regeneration. Coverage: load-bearing nodes exhaustive **always**; non-load-bearing sampled at a rate derived from the asker's own run parameters, auto-ratcheting up on failures. | §9 |
| **Q29** What would I have to see to call this piece false, and how big would the difference have to be? | **HYBRID** · substance: LLM · enforcement: require an observable **and** a numeric/material threshold; rotate the falsifier hunt; apply the visible degradation mark; store kill reasons | ⟨L/H/L⟩ | trigger per Q28 survivor (0..N) · — | Every surviving child states an observable and a threshold. **No kill on author failure**: the falsifier hunt rotates across models, and at exhaustion the piece wears a visible **`UNFALSIFIED-AFTER-ROTATION`** mark that degrades its standing — never silent deletion, never silent full citizenship. | §9 |
| **Q30** If this piece turned out the other way, would it actually change my answer? | **HYBRID** · substance: LLM (direction and dependencies only) · enforcement: ranking deferred to compose-time arithmetic; deprioritise, never kill | ⟨H/M/H⟩ | activation on `Q10.split=true`; **computation WAITs** for Q45's operator and the child values · — | The model judges the direction of a piece's influence and names semantic dependencies the operator cannot encode; **the machine defers all ranking to the compose-stage arithmetic** and recomputes the parent with the piece varied. Low-leverage children are **deprioritised, never killed** — killing here is what once produced a non-terminating regenerate loop. | §10 |
| **Q31** Would somebody genuinely else have carved this up the same way? | **HYBRID** · substance: LLM · enforcement: blinded question-only packet, fingerprinted; lineage verified; child/defeater sets compared; defeaters unioned by code; divergence served as uncertainty | ⟨L/H/H⟩ | was **policy-gated** `lineageEquivalence` → **UNBLOCKED by DR-013** · — | A rival carver is selected for **measured behavioural difference**, subject to the maker-diversity floor. Where no different maker is available, the fallback is prompt diversification plus bias mitigations, **labelled `DEGRADED DIVERSITY`**; at cold start the run is maker-only and says so. Objections from the rival carving are **unioned in by code**, not chosen by the author, and material divergence is served as uncertainty. **`[CD]`** the blinded question-only packet is fingerprinted — the merged contract's mechanism; DR-041 names the blinding, not the fingerprint. | §9, §14 |

### 3.7 Stage 7 — WEIGH (Q32–Q38): weigh each piece of evidence

| Row | Disposition | Seats | Fires · blocked-on | Requirement | § |
|---|---|---|---|---|---|
| **Q32** Is this evidence actually about my question, or about something that sounds like it? | **HYBRID** · substance: LLM · enforcement: typed population/comparator/outcome/time comparison; reject clear mismatch before scoring; apply the downgrade and make it visible | — | trigger per evidence item (0..N) · — | Each item is compared to the Q2 binding and typed `in / partial / out` with a reason. **Wholly off-subject evidence is rejected before scoring, with the reason logged. Partly relevant evidence is admitted downgraded, with the off-subject share named and the downgrade visible at serving.** Partial items may never be silently weighted. | §7 |
| **Q33** What is the strongest thing I actually found that argues against me? | **HYBRID** · substance: LLM · enforcement: fires even with zero adverse evidence → typed `UNADJUDICATED`; imagined counters labelled as imagined | — | trigger per claim or leaf (0..N) · — | The strongest adverse item **actually found** is recorded per claim — never the strongest one imaginable. With no adverse evidence the row records `UNADJUDICATED`. Where a counter was imagined rather than found, the record must say so. | §8 |
| **Q34** Am I holding evidence against me to the same standard as evidence for me? | **MACHINE (the verdict)** · substance: MACHINE · enforcement: set/count diff over the execution ledger; typed `UNINSTRUMENTED` blocks the fairness claim · **plus an openly-marked model remediation layer** (substance: LLM) that never replaces the verdict and never gates | ⟨M/M/H⟩ | trigger `evidence_on_both_sides` · — | Symmetry is a **machine diff over telemetry other rows already owe**, made computable by **two new ledger stamps** — `subject_item_id` and `stance_at_action`. Output is a **work list, never a score**: same checklist (set equality of applied action kinds), same access depth, same actions per side, plus `blocked_not_lazy` served **beside** the asymmetry, never inside it. Where records are missing the verdict is typed **`UNINSTRUMENTED`, which blocks the fairness claim** — never a silent pass. On `UNINSTRUMENTED` a model explains **why** the gap exists, grades the effort and suggests closure; that text is served **openly marked model-authored and biased**, never replacing the verdict, and the reader gets an **investigate-deeper** affordance. The under-checked side is re-verified under the stricter standard and a bias event is logged. | §8 |
| **Q35** Would this source be saying this even if it weren't true? | **HYBRID** · substance: LLM · enforcement: join source interests to competing hypotheses; enforce zero weight **with retention** | ⟨L/H/H⟩ | trigger `source_is_load_bearing` · — | Recorded source interests are joined to the competing hypotheses. A source that would say the same thing under either state of the world is **retained on the record at exactly zero weight** — never deleted, never averaged in. | §8 |
| **Q36** This certainty I feel — did I measure it, or am I just feeling it? | **HYBRID** · substance: LLM · enforcement: rubric selection keyed to a registry version; unmeasured certainty typed as such | — | trigger per weighted claim + every served answer (1..N) · — | Certainty must name its measurement basis. A confidence with no measurement behind it is typed as unmeasured and may not be presented as measured — the anti-theater law applied at the smallest scale. | §8 |
| **Q37** What could have gone wrong in *this* study to push its result the wrong way? | **HYBRID** · substance: LLM · enforcement: present and prefill seven bias domains; validate a supporting record per domain; enforce repair / bound / exclude | ⟨L/H/H⟩ | trigger `question_type=causal OR settlement_act=measurement`, with a study result in use · — | Seven named bias domains — confounding, selection, misclassification, protocol deviations, missing data, outcome measurement, selective reporting — are presented prefilled from study metadata. Each carries a finding, a direction/magnitude where available, and a **disposition of repair, bound or exclude that code enforces**. A warned-about bias may **never** be averaged away. Judgement is on the **result**, not on prestige. | §8 |
| **Q38** Where is the uncertainty in this number actually coming from? | **HYBRID** · substance: LLM · enforcement: uncertainty source required on every served number; ordered drivers | — | trigger `numeric_answer_planned` · — | Every served number names the source of its uncertainty, with drivers emitted in a fixed order so "first = primary" is reliable. A number with no uncertainty source is **unservable**. Fewer than two parseable judgements yields *no* dispersion measurement, and **that absence is never read as zero uncertainty**. | §8, manifest §5.2h |

### 3.8 Stage 8 — CROSS (Q39–Q44): have an AI built by someone else attack the work

*Stage law: research and criticism never share a context; the agent that produced
an artifact never grades it.*

| Row | Disposition | Seats | Fires · blocked-on | Requirement | § |
|---|---|---|---|---|---|
| **Q39** Has somebody genuinely independent gone through this, before they knew what I concluded? | **MACHINE** · substance: MACHINE · enforcement: zero model calls; receipt computed from logs and hashes; recorded even with no critic | ⟨M/M/H⟩ | trigger `research_answer_reaches_CROSS` — **exempt from critic availability** · — | The independence **receipt** — different lineage, blinded packet hash, correct order, context isolation — is computed from logs and hashes with no model asked anything. **The receipt is recorded even when no critic exists: absence is itself a receipt state**, and its consequence is DR-014's. The critic's actual attack bills to Q40 / Q41 / Q44 (row-boundary law). | §11, §14 |
| **Q40** Did the checker actually open my sources and redo my sums? | **HYBRID** · substance: LLM · enforcement: reopen locators; exact-check preserved spans; rerun sums; emit verified / deviates / not-found | — | was **policy-gated** `lineageEquivalence` → **UNBLOCKED by DR-013** · — | The checker reopens the locators, exact-checks the preserved spans character-for-character where available, reruns the arithmetic, and emits a typed **verified / deviates / not-found** per checked item. Reading what the author *said about* a source is not checking it. | §14 |
| **Q41** Can the checker point to something specific I got wrong — or say exactly what they looked at? | **HYBRID** · substance: LLM · enforcement: require either a specific defect or an explicit examination scope; reject a critique that supplies neither | — | trigger `eligible_critic_run` · — | A critique must either name a specific error or state exactly what it examined. **A critique that does neither is not a critique** and is recorded as such. | §14 |
| **Q42** When the checker agreed with me, had they already seen my reasoning? | **MACHINE** · substance: MACHINE · enforcement: zero model calls; unblinding log decides | — | trigger `critic_agrees` · — | Agreement that arrived **after** unblinding carries **zero added weight**, decided by the unblinding log, not by anyone's recollection. | §14 |
| **Q43** Did the checker try it their own way — and does my answer survive that? | **HYBRID** · substance: LLM · enforcement: alternate operator run recorded and compared | — | trigger `split_or_composed_answer` · **OPEN**: §2's extra conjunct `alternate_method_required` is undefined in both source appendices — an undefined conjunct would leave the row in permanent WAIT and silently delete a Stage-8 obligation (§23, `OD-S-02`) | The checker recomputes the answer by an alternate method and the answer must survive it; the alternate run is recorded and compared, never asserted. **Adopted activation reading: the appendix reading (`split_or_composed_answer`), with `alternate_method_required` recorded as an undefined gate awaiting V.** | §14, §23 |
| **Q44** Which objections have I actually dealt with, and is anything still standing? | **HYBRID** · substance: LLM · enforcement: objection ledger resolves at CROSS entry even with no critic; residual set is first-class | — | trigger `CROSS_stage_entered` · — | The objection ledger records which objections were closed, **by what**, and which are still standing. It resolves at CROSS entry even when no critic ran. The **residual objection set is a first-class served object**, not an assembled afterthought. | §14, §12 |

### 3.9 Stage 9 — COMPOSE (Q45–Q50): put the pieces back together

| Row | Disposition | Seats | Fires · blocked-on | Requirement | § |
|---|---|---|---|---|---|
| **Q45** How am I putting these pieces together — and does the way I add them up change what comes out? | **HYBRID with a machine-only fast path** · substance: LLM only when the operator is undeclared · enforcement: policy/human-declared ⇒ **zero model calls**; undeclared ⇒ exactly one bounded declaration call; no declaration ⇒ withhold the parent number | ⟨H/H/M⟩ | trigger `multiple_components_to_compose` · — | The combination operator and its dependence assumption are **declared per parent** from the split's conjunction structure. When they come from policy, config or a human the row runs with **zero model calls**. When they do not, exactly one bounded declaration call is mandatory. **With no declaration the parent number is withheld and the components are served alone.** The stakes are why this outranks every weighting question: on the worked case accumulate gives 0.9935 and strict-and 0.0997 — a 9.96× gap. | §10 |
| **Q46** Which single piece is really carrying this answer — and is it the one I checked hardest? | **MACHINE** · substance: MACHINE · enforcement: zero model calls; **bounded** halt-and-deepen gate | — | trigger `Q45_computable` · — | Leverage is computed by removal-based impact and **joined to verification effort**. Where the **highest-leverage item is the least-verified**, recombination halts and that input returns to WEIGH/RUN — **bounded by DR-050 at K=1 round per parent per run**, after which recombination proceeds and the answer carries a visible **`LEVERAGE_UNRESOLVED`** residual naming the carrying piece and its verification thinness, joined to the Q44 and Q53 panels. **`[CD]`** the halt contract itself: DR-031 ratifies the MACHINE classification, not this consequence clause. Without Q34's two ledger stamps this gate cannot execute at all. | §10, §8 |
| **Q47** If I'd combined these the other way, would I be giving the opposite answer? | **MACHINE** · substance: MACHINE · enforcement: zero model calls; both readings served where the band flips | — | trigger `approved_variant_count > 1` · — | The rival operator is **computable on demand**. Where it would flip the served band, **both readings are served with the deciding choice printed** — never averaged, never an abstention. | §10, §18 |
| **Q48** If I'd just answered this straight off, without the breaking-down, would I have said the same thing? | **HYBRID** · substance: LLM (what the disagreement *is*) · enforcement: diff the stored artifacts; enforce matched compute; flag; downgrade confidence; set recheck priority; never average | ⟨H/M/H⟩ | trigger `Q10.split=true and both_answers_exist` · — | The stored holistic baseline is diffed against the decomposed answer — **never regenerated**. Machine enforces matched compute (an unmatched comparison is marked non-comparable), flags a disagreement, downgrades confidence and raises recheck priority. **The model explains what the disagreement is**, because a served disagreement a reader cannot understand fails the stranger test. Averaging the two is forbidden. | §10 |
| **Q49** How fragile is this — what would I have to drop or change before the answer flips? | **MACHINE** · substance: MACHINE · enforcement: zero model calls | — | trigger `composed_answer_with_typed_ranges` · — | A fragility table: the reversal set and what would have to be dropped or changed for the answer to flip. **`[CD]`** fragility is an **output, never a weight** — feeding sensitivity back into base scores or arrow strengths is forbidden by construction, because weights → strengths → sensitivity → weights is a loop with no declared fixed point. DR-031 ratifies the MACHINE classification; the no-feedback law comes from the weight-derivation research. | §10 |
| **Q50** Am I calling one option the winner just because of how I weighted things — and who decided those weights? | **HYBRID** · substance: LLM (criteria only) · enforcement: **three guards** — every proposed criterion must link to actual evidence or code drops it; rejected candidates are served visibly; the asker may add criteria via the steering menu. Weights human-only; all arithmetic machine | ⟨H/M/H⟩ | trigger `question_type ∈ {comparative, design}` · — | The model proposes criteria under the three guards; criteria are recorded `substance: LLM`. **Weights are never model-supplied.** The criterion vectors, the Pareto set, rank stability and the exact reversal point are arithmetic. Missing weights route to the value owner and the system serves the **conditional** result plus the reversal point — a full answer, not a value-choice abstention. | §15 |

### 3.10 Stage 10 — SERVE (Q51–Q58): write the answer

| Row | Disposition | Seats | Fires · blocked-on | Requirement | § |
|---|---|---|---|---|---|
| **Q51** Can I show where all of this came from, and how I know each part? | **HYBRID** · substance: MACHINE for the gates and joins, composition model for the text · enforcement: **locator gate, provenance join and reasoning-only downgrade are blocking**; conformance judge checks text against facts | ⟨H/M/H⟩ | **always** — the sole never-disabled serving invariant, for any output **including terminal non-answers** · — | Every load-bearing claim carries its **kind (looked-up / ran / reasoned), its producer and its locator**. A missing locator **blocks serving**. A claim resting on reasoning alone is **downgraded from a verdict to a hypothesis plus a research plan**. The served text is written by the composition model from the machine's fact bundle and is machine-enforced against those facts — the pure-render reading was rejected. **Q51 is the LAST gate in DR-049's order** (R9 → Q53 → conformance → Q51), so provenance is checked against the text that will actually ship. | §12.1, §12.2 |
| **Q52** Does my first sentence answer the question they actually asked, and nothing bigger? | **HYBRID** · substance: LLM · enforcement: scope check against the Q2 binding before serving | — | trigger `any_serve_candidate` (read narrower than Q51 — excludes terminal non-answers) · — | The opening sentence answers the question as bound at Q2 and claims nothing wider. | §12 |
| **Q53** Is the strongest objection right there where they'll see it, or buried? | **MACHINE** · substance: MACHINE · enforcement: zero model calls; **serving precondition**; residual is a fact-bundle field | — | trigger `any_serve_candidate` — the check still runs on an empty objection ledger · — | The strongest live objection is placed where the reader will see it. **`[CD]`** an endorsed band may not be served while an unresolved high-strength counterargument is carried and hidden — present in the graph and absent from the surface **blocks serving**; DR-031 ratifies the MACHINE classification, and the serving block comes from the house-rule successor (§19 H7). **Per DR-049, Q53's residual objection is a FACT-BUNDLE FIELD, not optional prose**, and Q53 runs *second* in the gate order — before conformance, so composition cannot pass locally while hiding it. | §12.1, §12.2 |
| **Q54** Did what I found actually change my mind — and if so, was it the evidence that moved me? | **HYBRID** · substance: MACHINE for the facts, composition model for the narrative · enforcement: belief updates event-sourced with their cause at the moment they are made; typed `AMBIGUOUS_ATTRIBUTION` | ⟨H/M/M⟩ | trigger `any_serve_candidate`; also requires Q5's recorded prior — with no prior, movement claims are **unavailable, not zero** · — | Prior, posterior, delta and the moving evidence are **event-sourced: a belief update cites its cause when it is made**, never reconstructed afterwards. Where several evidence events genuinely could have moved it, the state is typed **`AMBIGUOUS_ATTRIBUTION`** and served as such — no model call breaks a tie the record cannot break. The narrative is composed from those facts. | §12 |
| **Q55** What am I still not sure about — and which kind of not-sure is it? | **HYBRID** · substance: LLM (the mapping *is* a judgement) · enforcement: exactly-one of the five kinds **per ignorance-ledger unknown**; ledger consistency enforced | ⟨M/M/H⟩ | trigger `any_open_unknown_at_serve` · — | The model chooses which of the **five typed abstentions** applies per open unknown — not searched / searched and found nothing / measured and inconclusive / not runnable / a value choice — and machine enforces exactly one and consistency with the Q12 ledger. **Scoped by DR-051:** the exactly-one law binds **only ignorance-ledger unknowns**. Every other typed state is a **condition mark** in a closed parallel enum, servable alongside the abstention (§12.3). **An abstention rendered as a mid-range number is a rule violation.** | §12.3, §21 |
| **Q56** Am I saying "I don't know" more often than I'm allowed to? | **MACHINE** · substance: MACHINE · enforcement: zero model calls; compare rate against the declared cell | — | was **POLICY_BLOCKED** on `abstention` → **UNBLOCKED by DR-010/011/012**; the remaining conjunct `class_history_sufficient` is an ordinary trigger · — | The observed abstention rate is compared against the price declared for this run's question-class × risk-tier cell. **A rate inconsistent with the declared price is a named battery defect**, reported as such. Over-abstention is not caution. | §21 |
| **Q57** Have I kept what I found separate from what I think should be done about it? | **HYBRID** · substance: LLM · enforcement: normative-clause detector over the draft; findings and recommendations render in separate blocks; owner required | — | trigger `candidate_contains_or_may_contain_value_clause` · — | Findings come from the graph; recommendations come from the value overlay; **they render in separate blocks**. A recommendation paragraph with no named normative owner is a **defect, not a style choice** — take the recommendation out, or go and get the judgement made by whoever owns it. | §15, §12 |
| **Q58** What would have to happen for this answer to be wrong tomorrow? | **HYBRID** · substance: LLM · enforcement: the named conditions become watched revision triggers | — | trigger `empirical_serve_candidate` · — | The answer names what would make it wrong tomorrow, and those conditions are **registered as watched revision triggers** that can wake the answer later (DR-015). The trigger may not be read as an expiry claim. | §13 |

### 3.11 Stage 11 — SETTLE (Q59–Q62): come back and score it

| Row | Disposition | Seats | Fires · blocked-on | Requirement | § |
|---|---|---|---|---|---|
| **Q59** When will we find out whether I was right, and who decides that other than me? | **HYBRID** · substance: LLM · enforcement: validate the resolution event; require an **external** resolver; emit scoreability | — | trigger `answer_record_created` · deployment scope depends on `stage11Rollout` (**OPEN**, §23 `OD-S-01`) | Every answer records a resolution event, an **external** resolver identity and a scoreability verdict. With no external resolver the answer is typed `PERMANENTLY_UNSCOREABLE` — **expected for a value choice, not a defect**. The resolver identity is V-named per deployment (DR-021 knob 11). | §16 |
| **Q60** Have I written down what I said, how sure I was, and when we'll know — where somebody else can find it? | **MACHINE** · substance: MACHINE · enforcement: zero model calls; read-back verification | — | trigger `Q59_scoreable`; no resolver ⇒ `PERMANENTLY_UNSCOREABLE` (INACTIVE, recorded) · — | Persist `{answer, prior, posterior, basis, resolver, date, provenance}`. **`[CD]`** the read-back contract — write it, read it back, and verify another actor can open it; a claimed write that cannot be read back is a defect. DR-031 ratifies the MACHINE classification, not this contract. Scoring keys on `(answer_id, answer_version, as_of)`, because DR-015 lets an answer be woken and changed. | §16 |
| **Q61** Was I right — and what should that change about how I answer questions like this? | **HYBRID** · substance: MACHINE for scoring and calibration, LLM for interpreting what a match changes · enforcement: registered proper score; versioned calibration; typed match tiers; conformance judge on the served sentence; disputed resolutions route to a human, never self-grading | ⟨M/M/H⟩ | trigger `resolver_outcome_arrived and Q60_valid` — **the battery's only cross-run trigger**; may sit in WAIT indefinitely without that being a defect · mechanism design **DRAFT — V RULES** (§17, §23 block B) | A registered proper score is applied to the typed outcome and the calibration and class prior are updated **and versioned**; those versioned weights become the real judge weights. **The machine checks whether the keywords/topic were seen before and pulls prior-session data; a model interprets what it changes.** A prior-session match **never reduces the work** and **never** admits the prior verdict as evidence for its own claim. | §16, §17 |
| **Q62** When I got it wrong, where exactly did it go wrong? | **HYBRID** · substance: LLM (attribution limb) · enforcement: liveness telemetry written on every closed run; archival retirement; UNDER-EXPLORED marking | — | **always** (liveness limb) + trigger `wrong_resolved_outcome` (attribution limb) · — | Liveness telemetry is written on **every closed run**. On a wrong resolved outcome, the run records where exactly it went wrong, and that attribution seeds the next run's search plan. Retirement is **archival** — the full graph is kept and auto-revived by the next query; nothing is deleted. Attention-starved branches carry a distinct **`UNDER-EXPLORED`** marker, which is **never a retirement cause on its own**. | §13, §16 |

### 3.12 The nine human-set rules (R1–R9)

R6–R9 were owner-added and needed **two** rulings each: a partition label and an
ACCEPT / AMEND / REJECT disposition as a rule. Both are recorded below.

| Row | Disposition | Seats | Fires · blocked-on | Requirement | § |
|---|---|---|---|---|---|
| **R1** Derive the search terms from the question itself — no retrieval on a query not derived here. | **HYBRID** · substance: LLM · enforcement: refuse retrieval on an underived query; freeze the set | — | trigger `research_route before Q15` · — | The frozen query set is the only admissible retrieval input; off-plan retrieval **cannot support a claim**. Whether the frozen set may grow mid-run is settled by DR-008's typed amendment rule. | §7 |
| **R2** Define the subject; evidence not about it is inadmissible. | **HYBRID** · substance: LLM · enforcement: binding is the sole scope key; per-item admissibility gate | — | **always** (binding limb, inheriting Q2's `Q1=CONTINUE` gate) + trigger per evidence item · — | The Q2 binding is set once and enforced at Q32 on every item. Wholly off-subject evidence is inadmissible; partly relevant evidence is admitted downgraded with its off-subject share named. | §6, §7 |
| **R3** State what you do not yet know. | **HYBRID** · substance: LLM · enforcement: ranked ignorance ledger; typed closure transitions; **no silent deletion**; serve-time surfacing; decisive unknown ⇒ typed non-answer | ⟨L/H/H⟩ | trigger `research_route at AIM`, **re-fires on new evidence** — the only row with an explicit re-activation clause · — | The unknowns are named before reading, ranked, and carried with typed closure states; they are surfaced at serving. **Content from the model, force from the machine**: the rule's force may never be a model's output. | §6 |
| **R4** Name who or where holds the answer. | **HYBRID** · substance: LLM · enforcement: resolve known locators/owners; validate opposition-capable and measurement classes; surface single-class coverage | ⟨L/H/H⟩ | trigger `research_route at AIM` · — | The question→holder mapping must resolve to real locators and must contain an opposition-capable class and a measurement class; single-class coverage is surfaced as a deficit. | §6 |
| **R5** Research first, then critique — by a different lineage. | **HYBRID** · substance: LLM · enforcement: order and context isolation are log-checkable; consequence of no critic is DR-014's | — | trigger `nonterminal researched answer before confident serve` · — | Research and criticism never share a context and the producer never grades its own artifact. With no eligible second lineage the answer serves but **cannot reach the top confidence band**, carries a visible "independent critique unavailable" label with its reason, and records a lift condition whose later execution re-scores. | §14 |
| **R6** Say what the question is about, in one plain sentence a stranger could route. | **HYBRID** (label, DR-036) · **ACCEPT as written** (rule, DR-018) · substance: LLM · enforcement: two isolated question-only contexts; normalized topic/entity fields diffed; substantive mismatch routed back to the asker | ⟨L/H/H⟩ | was **policy-gated** `lineageEquivalence` → **UNBLOCKED by DR-013**; the blind two-lineage comparison is now executable · — | One plain routable sentence, produced and then **checked by a second, isolated question-only context**; the two structured topic fields are diffed and genuine disagreement goes back to the asker rather than researching a guess. The sentence is **display-only** in cross-run memory: never hashed, never part of an identity key. | §6, §17 |
| **R7** Say which field this belongs to, and which evidence standards that activates. | **HYBRID** (label, DR-031) · **ACCEPT as written** (rule, DR-018) · substance: LLM · enforcement: registry lookup activates the field's standards; unresolved field takes the visible-fallback route | — | trigger `beside Q8 type routing` · — | The declared field activates its evidence standards. An **unresolved field auto-serves with a visible label** and no approval step, and the label travels on the answer and in every node's provenance (DR-021 knob 10). | §5 |
| **R8** Say from whose vantage points this should be answered — never a rule for splitting the argument. | **HYBRID** (label, DR-036) · **ACCEPT as written** (rule, DR-018) · substance: LLM · enforcement: deduplicate vantage points by **new source class**; drop decorative ones; **forbid perspective-forking** | ⟨L/H/H⟩ | trigger `AIM before source-plan freeze` · — | A vantage point that adds no new source class is **dropped**, not recorded. **The prohibition on decomposing the argument by perspective is spec law regardless of ratification path** — it names a defect the greenfield core must not reproduce. Vantage versions key the query plan. | §6 |
| **R9** The stranger test: a reader who knows nothing must be able to say back the answer, the certainty, and what would change it. | **HYBRID** (label, DR-031) · **AMEND** per the whole-graph ruling (rule, DR-018) · substance: LLM (node text at generation time) · enforcement: mechanical checking; **blocks serving** | — | trigger `serve_candidate_ready` + per-node limb scoped by `strangerTestCoverage` (DR-019) · — | **Every node *and* the verdict must be individually restatable** by someone who knows nothing about the machinery — the pre-ruling "top layer only" text is superseded. Node text must be human language **at generation time**; the checking stays mechanical and **blocks serving**. Coverage: load-bearing nodes exhaustive always; non-load-bearing sampled at an asker-derived rate that auto-ratchets up on failures. | §12 |

### 3.13 Closure roll-up and checksum

| Disposition | Count | Rows |
|---|---:|---|
| **MACHINE** | **13** | Q15, Q17, Q22, Q23, Q34 (verdict limb), Q39, Q42, Q46, Q47, Q49, Q53, Q56, Q60 |
| **HYBRID** | **57** | **48 questions** — Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q11, Q12, Q13, Q14, Q16, Q18, Q19, Q20, Q21, Q24, Q25, Q26, Q28, Q29, Q30, Q31, Q32, Q33, Q35, Q36, Q37, Q38, Q40, Q41, Q43, Q44, Q45, Q48, Q50, Q51, Q52, Q54, Q55, Q57, Q58, Q59, Q61, Q62 — plus **all nine rules** R1–R9 |
| **LLM** | **1** | Q27 |
| **Total** | **71** | 62 questions + 9 rules |

13 + 57 + 1 = **71**. Every ID appears **exactly once** across §§3.1–3.12; no row is
silent and no row is closed twice. Contested-row provenance is preserved on all
**28** contested rows (24 questions + R3, R4, R6, R8).

**Movement from the seats' original tallies** (`../research/05-battery-coverage-matrix.md`):
the questions arrived 10 MACHINE / 27 HYBRID / 1 LLM / 24 CONTESTED and close as 13
MACHINE / 48 HYBRID / 1 LLM. The three questions that moved into MACHINE are
**Q22** and **Q39** (DR-040's row-boundary law) and **Q34's verdict limb**
(DR-045). No row moved out of MACHINE, and the single LLM row is unchanged.

**Runnability roll-up.** Every row that was WAIT or POLICY_BLOCKED in the
activation table is now runnable:

| Was | Rows | Released by |
|---|---|---|
| POLICY_BLOCKED on `abstention` | Q56 (and Q6's `UNPRICED` mark) | DR-010 / DR-011 / DR-012 |
| POLICY_BLOCKED / WAIT on `lineageEquivalence` | Q14, Q31, Q40, Q41, R5, R6 | DR-013 (+ DR-014 for the consequence) |
| POLICY_BLOCKED on `splitIterationLimit` | Q26 (and Stage 6 entire) | DR-020 knob 5 |
| Cardinality unpriced (`strangerTestCoverage`) | Q28, R9 per-node limbs | DR-019 knob 1 |
| Unregistered fallback authorisation | Q8, R7 — and every row downstream of a Q8 halt | DR-021 knob 10 |
| Budget-vs-predicate ambiguity | every row | DR-021 knob 9 |

**Two residual runnability holes remain, and both are open decisions, not
oversights:** Q43's undefined `alternate_method_required` conjunct
(§23 `OD-S-02`) and the terminal-route survivor set — which rows still run after an
`INERT`, ill-posed or value-routed return (§23 `OD-S-03`). Neither blocks a normal
run; both change what a terminal return costs.

---

## 4. The V-owned knob register — 19 parameters, named verbatim

**The founding principle: no silent defaults.** Each of these is a value only a
human may set. `Unresolved` never means null, zero or false — it means the
dependent behaviour blocks, visibly. Where a value is marked **provisional** it is
a real V ruling that is expected to be recalibrated against outcome data;
recalibration is a Stage-11 job requiring V's sign-off.

**Reconciliation note.** The upstream report declared 17 typed policy fields, V's
own §0A ruling added an 18th (`strangerTestCoverage`), and the activation table
found a 19th that no source registered (the visible-fallback authorisation behind
Q8/R7 — without it, a policy-block at Q8 halts the entire run). That is the 19.
The knob **batches** V ruled in DR-019 / DR-020 / DR-021 carry twelve numbered
values; six of them are register parameters and six are additional V-set values
with no counterpart in the report's register. Those six are recorded in the
**annex** below, so the register's count stays honest and nothing is lost —
this is the reconciliation `../research/05-battery-coverage-matrix.md` §D asked
for.

| # | Parameter (verbatim) | V's value | DR | Behaviour if it were unresolved |
|---:|---|---|---|---|
| 1 | `engineRelationship` | **`GREENFIELD_NEW_REPO`** — a fourth value beyond the source enum's REPLACE / WRAP / SUPERSEDE_OLD_CHECKLIST_ONLY, because none of the three expresses "a new home for the new core" | DR-031 | no migration or integration inference |
| 2 | `queryAmendment` | **Amendable mid-run, typed.** *Mechanical repair* (typo, canonical alias, operator syntax) keeps full confirmation power; *semantic re-aim* (new concepts, scope change) is **exploration-only** — confirmation requires re-freezing the new terms and re-running. Every amendment logged with type and reason, visible at serving | DR-008 | off-plan retrieval cannot support a claim |
| 3 | `subjectRelevance` | **Mixed rule** — wholly off-subject is **rejected before scoring** with a logged reason; partly relevant is **admitted downgraded** with the off-subject share named and the downgrade visible at serving | DR-009 | whole mismatch rejected; partial evidence gets no weight |
| 4 | `abstention` | **Cost-ratio reading**: price = cost(abstain)/cost(wrong), strictly in (0,1). Low price ⇒ abstention cheap and readily permitted; high price ⇒ abstention nearly as costly as error and strongly discouraged. **Varies by question-class × product-risk matrix**, not flat and not class-only. Seeded **provisional** matrix: risk tiers casual / standard / high-stakes; standard-tier seeds — lookup 0.8, measurement 0.7, comparative 0.55, causal 0.5, predictive 0.4, value 0.15; multipliers high-stakes ×0.6, casual ×1.3 (capped below 1). **Every served answer names its cell.** Over-abstention — a rate inconsistent with the declared price — is a named battery defect | DR-010, DR-011, DR-012 | run marked `UNPRICED`; Q56 cannot run at all |
| 5 | `lineageEquivalence` | **Different maker = different lineage.** Anything same-maker, including across model generations, is the **same** lineage. A bright line, auditable per pairing | DR-013 | independence is never certified; Q14/Q31/Q40/Q41 sit in WAIT |
| 6 | `criticUnavailable` | **Cap + label + lift path.** The answer serves but **cannot reach the top confidence band**; a visible "independent critique unavailable" label carries the reason; the lift condition is recorded and executing the critique later **re-scores** | DR-014 | missing critic always labelled; no implicit band policy |
| 7 | `newHumanRules` | **R6 ACCEPT** as written · **R7 ACCEPT** as written · **R8 ACCEPT** as written · **R9 AMEND** — every node *and* the verdict individually restatable (the whole-graph ruling), superseding the rule's "top layer only" text | DR-018 | kept as proposed requirements, not production law |
| 8 | `comparisonValueOwnership` | **Pareto trigger computes when values hinge**; then **Flow A always** (serve the conditional plus the reversal point — a *full* answer, never a value-choice abstention), **Flow B** one optional swing question per real hinge (answering personalises; skipping keeps the conditional), **Flow C** opt-in standing profiles. `weight_source ∈ {owner_elicited, org_policy, none}` with **no `default` member**. Every value-decided segment carries a visible marker naming whose weights decided it. **The machine never has opinions** | DR-017 | serve vector / Pareto / conditional only; never invent a winner |
| 9 | `splitIterationLimit` | **2 regeneration rounds (3 attempts)**, then a typed **"not runnable" abstention carrying the rejection evidence** | DR-020 knob 5 | Stage 6 is POLICY_BLOCKED — it cannot enter its regenerative loop at all |
| 10 | `orderingPolicy` | **Battery stage order as written**, provisional until the deferred retrieve-first experiment rules | DR-020 knob 6 | proposed order recorded, never called law |
| 11 | `livenessThreshold` | **Composite retirement**: retire when there have been no queries for N days (N per class, seeded **provisional**, 180 for standard) **and** there are no open revision triggers. Retired = **archived**, full graph kept, auto-revived by the next query through staleness review; **nothing is deleted** | DR-016 | liveness counted; nothing demoted or removed |
| 12 | `expiryPolicy` | **Snapshot + wake + propagate.** Every node and answer is stamped relevant-as-of at spawn; machine wake-ups fire on watched revision triggers and class-based TTL review clocks; woken changes re-assess ancestors (machine recomputes the arithmetic, a model re-judges only the affected nodes); a fired-trigger or past-review answer serves with a visible **STALE / UNDER-REVIEW** badge, never silently | DR-015 | freshness checked at run time only; no expiry claim |
| 13 | `citationEnforcement` | **Eight typed failure routes from day one**; the hard-kill gate **auto-activates when V3's character-level quote matcher ships and validates** | DR-020 knob 7 | known exact/preview/locator rules enforced; no universal-gate claim |
| 14 | `coverageUpgrade` | **Diagnostic `UNCOVERED-SCOPE` note first**; becomes a **gate only after outcome data sets the threshold** | DR-020 knob 8 | residual sentence is diagnostic only; completeness never certified |
| 15 | `graphMeasurementQuota` | **Derived from the asker's depth parameters, capped by a V-owned deployment ceiling** | DR-021 knob 12 | quota blocker recorded; no fabricated result |
| 16 | `stage11Rollout` | **OPEN — no DR.** Ticket 15 owned it and DR-047 transformed ticket 15. **Behaviour while unresolved:** Q59/Q60 and Q62's liveness limb write from day one because DR-046's model ledger and the scorecards depend on them (§16); Q61's outcome ingestion stays in WAIT until an outcome arrives; **no operational calibration claim is made** and capability cells stay `basis: NONE`. Ruling owed at V's artifact review — §23 `OD-S-01` | — | contracts kept; no operational calibration claim |
| 17 | `adoptionBar` | **DISSOLVED.** DR-047 retires the race: no formal race, no frozen victory criteria, no control-arm ceremony, no matched-cost law, no V2 pin, no promotion bar. Its role passes to the **Quality Charter** (artifact 4): (1) best possible dialectical engine to date, judged by V on outputs; (2) human-oriented answers, with the stranger law as the acceptance test; (3) clean, maintainable codebase; (4) **no orphaned modules** — everything shipped is reachable and called; (5) research-upgradeable — validated findings land at each step without re-architecture | DR-047 | *(moot — the parameter no longer gates anything)* |
| 18 | `strangerTestCoverage` | **Load-bearing nodes exhaustive ALWAYS**; non-load-bearing sample rate **derived from the asker's run parameters** (depth, agent count — a user-facing dial); the rate **ratchets up on failures**. **Amended by DR-052:** the sample rate **freezes at run start** and the ratchet applies to the **next** run — mid-run cost is no longer monotone non-decreasing | DR-019 knob 1, DR-052 | per-node restatement cost is unpriced; implementation must never default it |
| 19 | Visible-fallback authorisation (Q8 / R7 unresolved type or field) — *the nineteenth knob, unregistered in every source* | **AUTO-SERVE WITH LABEL, no approval step.** Q8's policy-block halt is **removed** for unresolved types; the label travels **on the answer and in every node's provenance**. V chose this over asker-approval knowingly | DR-021 knob 10 | a policy-block at Q8 halts the run and deactivates the whole battery downstream |

**Register status: 18 of 19 carry a V value; `stage11Rollout` (row 16) is the one
open row**, listed once in §23.

### 4.1 Annex — the six V-set values carried by the knob batches that are not register parameters

Recorded here so the reconciliation is complete and no ruled value is homeless.
They are values, not parameters of the report's register, and are **not** counted
in the 19.

| Value (verbatim) | V's value | DR |
|---|---|---|
| **Topic-cap N** for model-proposed follow-up topics | **N = 7**; the menu must retain **at least one could-overturn topic** | DR-019 knob 2 |
| **Blind-verification coverage** | CROSS **always** for STANDARD and HIGH-STAKES risk tiers, for contested verdicts, and for flip-sensitive nodes; **only the CASUAL tier may be sampled or skipped** | DR-019 knob 3 |
| **Steering authority** | **Menu + free-text annotations**; every annotation logged **verbatim**, typed as human-steer input, and disclosed in the served trail | DR-019 knob 4 |
| **Budget-override policy** (the activation table's VD-8: may a cost ceiling deactivate a row whose predicate is TRUE?) | **Typed skip for ENRICHMENT ONLY.** Every skip carries a visible **`SKIPPED-BY-BUDGET`** marker. **PROTECTED CORE — never skippable:** provenance, abstention typing, standard-and-above blind verification, citation routes, **and serve-conformance** (added by DR-052) | DR-021 knob 9, extended by DR-052 |
| **Run cost envelope** | **Every run gets a visible call/cost envelope derived from asker depth × risk tier.** Exhaustion produces typed **enrichment skips first**, then a **hard stop that serves already-verified components** with an `ENVELOPE_EXHAUSTED` mark — **never a silent timeout**. Orthogonal to the budget-override knob: the envelope bounds the *product* of the caps, which the per-stage caps do not | DR-052 |
| **Per-run ownership** | Q1's decision/action owner = **the asker**; caller scope and `as_of` are **caller-supplied, defaulting to now**; Q59's external resolver is **named by V per deployment** | DR-021 knob 11 |
| **Loop caps, as consumed by Stage 6** | The topic cap (7) and the regeneration cap (2 rounds) **stand as the Stage-6 bounds**, inherited rather than re-declared | DR-041 (citing DR-019/DR-020) |

**Where the naked constants must be printed.** Any constant that can move a served
verdict — the abstention cell, the provenance key width, a way-of-knowing ceiling,
a topic or regeneration cap, an exploration share, a minimum-n gate — must be
**printed where it is used**, in the served trail. A constant that changes an
answer without appearing beside it is the defect class this mission exists to kill.

---

## 5. Framing and typing — LOCK and ROUTE

*In plain words: before searching anything, the engine works out what it was
actually asked, whether the question contains something false, what kind of act
would settle it, which rival answers are still alive, and whether it needs breaking
into pieces. A model does that thinking. Code forces each answer into a fixed shape
and then acts on it without asking again.*

### 5.1 The label law and the two-field record (DR-037)

**Requirement F-1** `RULED(DR-037)` · Every one of the 71 rows records **two fields**: `substance:`
(who decided — MACHINE, LLM, or a named split) and `enforcement:` (the machine
gates, named individually). A row's label is not a summary of its cost; it is a
statement about what the spec **forbids**. `MACHINE` forbids a model call and the
test suite asserts zero calls. `LLM` licenses a model to own the substance and
forbids code from doing anything but store it. `HYBRID` makes **both** mandatory.

**Requirement F-2** `RULED(DR-037)` · A row is `HYBRID` **when and only when** code both constrains
the model's answer into a typed shape and can act on it without asking again —
stop, route, downgrade, or block serving. Ordinary persistence and schema
validation are **not** enough to make a row hybrid.

**Requirement F-3** `RULED(DR-037)` · The two-field record exists so that the spec can say *"a model
decided this, and here is what code does about it"* without the label flattering a
judgement into looking machine-verified. **Judgement never masquerades as
verification.**

### 5.2 The five terminal routes code must enforce (DR-037)

Each of the framing rows owns a terminal route. These are not prose; they are gates
with fixtures proving each fires **both ways**.

| Route | Owning row | What code does |
|---|---|---|
| **`INERT`** | Q1 | If every admissible answer leads to the same action, the run **stops** and hands the question back unresearched, saying so. |
| **False-presupposition non-answer** | Q3 | A load-bearing presupposition typed `false` **terminates** the run with a typed non-answer naming what is wrong. |
| **Value → human** | Q7 | A settlement act of `value` routes **immediately** to a human and stops the empirical path. |
| **`NOT_EMPIRICALLY_DECIDABLE`** | Q9 | Where no observation can separate the live rival answers, code emits this verdict and serves it as the answer. |
| **Depth-zero (no justification, no split)** | Q10 | Without a recorded justification the question is answered undivided; Stage 6 does not run. |

**Requirement F-4** `RULED(DR-037)` · Each terminal route is a **recorded, servable outcome**, never
a silence — and Q51's provenance invariant is never disabled for a terminal
non-answer.

**Requirement F-5 (hand-offs, because a label must not discourage them)** `CARRIED-DESIGN` · Q10's
undivided baseline is **stored** and is Q48's only comparator — regenerating it is
forbidden. Q9's strongest discriminator is **handed to Q20** as a probe candidate.
A spec that describes these as prose rather than owing them as artifacts breaks two
downstream rows.

### 5.3 Pre-commitment: the answer rule and the prior

**Requirement F-6** `CARRIED-DESIGN` · Q4's answer rule is frozen, hashed and timestamped **before**
the first retrieval. A run without one does not start. `before_first_search` is an
**ordering deadline**, not an activation conjunct: violating it is a gate failure,
never a deactivation — otherwise a run could delete its own answer rule simply by
starting to search.

**Requirement F-7** `RULED(DR-061 · OD-M-15)` · Q5's prior is recorded with a typed basis and **no default
member**; a silent 0.5 is forbidden, a retrospective prior is forbidden, and the
recorded prior may never be revised upward after the fact.

**Known weakness, recorded rather than papered over:** the self-held
hash-and-timestamp envelope around Q4 and Q5 is a **weak** commitment device —
independent custody or trusted timestamping would be stronger. This is an
acknowledged limitation of the freeze mechanism, not a claim that the freeze is
tamper-proof.

### 5.4 Typing the question, and the visible fallback

**Requirement F-8** `CARRIED-DESIGN` · Q8 records exactly one question type from the closed six, and
the type activates its evidence-standard obligations (R7). **Requirement F-9.**
Where the type or the field cannot be resolved, the run **auto-serves a visible
factual fallback with a label and no approval step** (DR-021 knob 10). The label
travels **on the answer and in every node's provenance**. The prior "policy-blocked
⇒ halt" branch — which would have deactivated the entire battery downstream — is
**deleted**.

### 5.5 Mixed empirical-and-value questions — the two-phase law (DR-053)

*In plain words: most real high-stakes questions have two halves — "what is
actually true?" and "so what should we do?". The engine used to have nowhere to put
that: routing the question to a human at the first sniff of a value meant the
empirical half was never measured, and answering the empirical half alone meant the
person did not get what they asked for.*

**Requirement F-10** `RULED(DR-053)` · A question carrying both an empirical and a
value half records a **typed DUAL SETTLEMENT ACT** at Q7 — it does **not** take
Q7's value→human terminal route, which binds a question whose settlement act is
value *alone*.

**Requirement F-11** `RULED(DR-053)` · The run executes **two phases on ONE
shared graph**:

1. **Phase 1 — what is true.** The empirical half is **settled fully**: the normal
   battery, including CROSS, WEIGH and COMPOSE, on the shared graph.
2. **Phase 2 — what follows given your values.** The value machinery of §15 runs
   **on the settled graph**: the Pareto trigger computes whether values hinge, Flow
   A serves the conditional plus the reversal point, and Flow B may ask one swing
   question per real hinge.

**Requirement F-12** `RULED(DR-053)` · **Phase order is machine-enforced.** Phase 2
may not begin before phase 1 settles, so a value preference can never shape which
empirical answer comes out.

**Requirement F-13** `RULED(DR-053)` · The result is **one served answer with two
labelled sections** — *"what is true"* and *"what follows given your values"* — and
the settlement record carries the typed dual act.

**Requirement F-14** `RULED(DR-053 + DR-017 + Q57)` · Phase 2's section is the
**named home for a recommendation**, which resolves the trap Q57 otherwise
creates: previously a causal answer that implied an action could only stop, defect,
or smuggle the recommendation under findings. Now the recommendation lives in its
own labelled section with its value owner named — and if no owner supplied weights,
that section serves the conditional rather than a winner.

---

## 6. Pre-search declarations and their human rules (DR-036)

*In plain words: before it is allowed to read anything, the engine writes down what
it does not know, who would actually know it and what they stand to gain, one plain
sentence saying what the question is about, and whose points of view ought to be
consulted. These are declarations made before reading — that is the whole point,
because an interest recorded before you read a source cannot be rationalised
afterwards.*

**The standing principle (DR-036).** A human-set rule may **never** be labelled
model-work. **Content from the model, force from the machine.** A model may supply
the sentence, the list or the ranking; the rule's force is always machine.

### 6.1 The five refusal powers

Machine here is not bookkeeping — it refuses. Each refusal is a named gate with a
both-ways fixture.

1. **No plan without an opposition class.** Q13/R4: a source plan containing no
   party capable of arguing the other way, and no way to measure anything, is
   **refused**, not annotated.
2. **No decorative vantage points.** R8: a vantage point that adds no new source
   class is **dropped**. Vantage versions key the query plan.
3. **No silent deletion of an unknown.** Q12/R3: an unknown may not be deleted, and
   may not be quietly converted into an assumption; closure states are typed and
   the ledger re-fires on new evidence.
4. **No perspective-forking.** R8: **decomposing the argument by perspective is
   prohibited**, and this prohibition is spec law **regardless of R8's ratification
   path**, because it names a defect the greenfield core must not reproduce.
5. **No researching a guess about the topic.** R6: the plain routing sentence is
   produced and then checked by a **second, isolated question-only context**; the
   normalized topic/entity fields are diffed and a substantive mismatch is
   **routed back to the asker**.

### 6.2 The ignorance ledger (Q12 / R3)

**Requirement P-1** `RULED(DR-036)` · The ledger ranks load-bearing unknowns, records for each an
allowed closure route — retrieval, measurement, human choice, or nothing — and a
typed closure state. **Requirement P-2.** The ledger is surfaced at serving and
must map onto Q55's five abstention kinds **without residue**; where the mapping is
ambiguous the row emits a defect rather than guessing at serve time — the fix
belongs in the ledger, not in a serving-time guess. **Requirement P-3.** A decisive
unresolved unknown produces a typed non-answer.

### 6.3 Interests recorded before reading (Q13 / R4)

**Requirement P-4** `RULED(DR-036)` · Each named holder's stake in the answer going one way is
recorded **before any source is opened**, and that record is what Q35 later joins
to the competing hypotheses. Recording it afterwards is not the same fact.

### 6.4 The blind topic check (R6)

**Requirement P-5** `RULED(DR-036 + DR-013)` · R6's comparison runs **two isolated question-only contexts**
with no battery context. Under DR-013 the two contexts must come from different
makers where any second maker is available; where none is, the row **degrades
explicitly** to single-sentence generation plus machine field extraction and says
so — **it must never silently pass**. The plain sentence is display-only for
cross-run memory: **never hashed, never part of an identity key** (§17).

---

## 7. Evidence policy — searching, admitting, and counting (DR-008, DR-009)

*In plain words: the engine may only search with terms it derived from the
question; it must record what it looked for and failed to find; it must say whether
it opened a source or only saw a snippet; and it must not let the same fact,
wearing three different hats, count three times.*

### 7.1 Frozen queries and typed amendments (DR-008)

**Requirement E-1** `RULED(DR-008)` · The query set is derived from the question, **includes terms
for the opposite answer**, and is deduped, frozen, versioned and hashed before any
retrieval. Retrieval on a query not derived here is refused (R1).

**Requirement E-2** `RULED(DR-008)` · A frozen query set **may** be amended mid-run, and every
amendment is **typed**:

| Amendment type | Examples | Power it retains |
|---|---|---|
| **Mechanical repair** | typo, canonical alias, operator syntax | **Full confirmation power** — results may support a claim. |
| **Semantic re-aim** | new concepts, scope change | **Exploration only.** Confirmation requires **re-freezing the new terms and re-running**. |

**Requirement E-3** `RULED(DR-008)` · Every amendment is logged with its type and reason and is
**visible at serving**. An amendment that is not typed is not an amendment; it is
off-plan retrieval, and off-plan retrieval cannot support a claim.

### 7.2 Admissibility: the binding, and the mixed rule (DR-009)

**Requirement E-4** `RULED(DR-009)` · The Q2 binding — population, comparator, outcome, time, with
dated inclusions and exclusions — is the **sole scope key** for retrieval and for
admissibility.

**Requirement E-5 (the mixed rule)** `RULED(DR-009)` · Evidence that is **wholly off-subject is
REJECTED before scoring**, with the reason logged. Evidence that is **partly
relevant is ADMITTED DOWNGRADED**, with **the off-subject share named** and **the
downgrade visible at serving**. There is no third path: partial evidence may never
be silently weighted, and it may never be silently dropped.

**Requirement E-6** `RULED(DR-009)` · This choice has an activation consequence the spec states
openly: `subjectRelevance` decides **how many evidence items reach a semantic
call** at Q32 and whether partial items propagate to Q33–Q38. It is a cardinality
decision, not only a weighting one.

### 7.3 What was opened, and what was not (Q16, Q17)

**Requirement E-7** `CARRIED-DESIGN` · Access depth is a **three-valued required record** —
`OPENED_FULL`, `PREVIEW_ONLY`, `ACCESS_BLOCKED` — not an adjective, and primary
versus secondary is recorded alongside it. **A preview-only source may never supply
a number or a quote.**

**Requirement E-8** `RULED(DR-020)` · Spans are extracted with locator, version and retrieval time
archived, and character-level exact comparison runs wherever the source supports
it. Citation failures take the **eight typed routes from day one**; the hard-kill
gate **auto-activates when the character-level quote matcher ships and validates**
(DR-020 knob 7) — it is not claimed before then.

**Requirement E-9** `CARRIED-DESIGN` · Every zero-result search is projected into a typed
`{query, scope, date}` absence row. **Absence is a servable finding.**

### 7.4 Counting by provenance, not by string (Q19)

**Requirement E-10** `CARRIED-DESIGN` · Sources are partitioned by a **declared provenance key** and
**each cluster contributes once, at the strength of its strongest member**. This is
a **gate, not a bonus**: the scoring arithmetic already rewards multiple
supporters, so paying again for independence would count the same fact twice.
Worked effect: three restatements of a 0.40 claim contribute **0.400**, not 0.784.

**Requirement E-11** `CARRIED-DESIGN` · The partition is computed from stored fields and is **never
asked of a model** — a model asked to self-report its evidence's independence will
over-report it. The **key width is a V policy value**, owned by the manifest's
open-decision register (`OD-09`), and must be printed where it is used.

**Requirement E-12** `CARRIED-DESIGN` · Where two siblings appear to say the same thing in different
words but their provenance genuinely differs, the node and the wire carry a
**semantic-restatement flag** — `possible_restatement_of: [ids], similarity: x.xx`
— which **changes no number**. Whether it may ever gate is the manifest's `OD-08`.
Two named hazards are why it does not gate today: a chain of mild paraphrases can
absorb an entire branch under transitive closure, and posting a near-duplicate of
the strongest counter-argument to get it **absorbed and silenced** is a direct
attack on the visible-objection gate.

### 7.5 Freshness at harvest time (Q18)

**Requirement E-13** `RULED(DR-015)` · Newest-source age is computed against the run's `as_of` and
is **never cached**. A **fast-moving** question with a stale newest source
**refuses**; a slow or static one **serves with an explicit staleness statement**.
Where the registry supplies no volatility class the row **WAITs** and is un-waited
by exactly one classification call — never by an unconditional assumption in either
direction.

---

## 8. Evidence appraisal — symmetry, motive, study flaws (DR-038, DR-045)

*In plain words: three checks on the evidence itself. Did I hold the evidence
against me to the same standard as the evidence for me? Would this source be saying
this even if it weren't true? What specifically could have gone wrong in this
particular study?*

### 8.1 Q34 — symmetry is arithmetic over records other rows already owe

**The finding that shapes the requirement:** Q34 does not need a new effort metric
to be invented. **Every field the symmetry diff needs is already an obligation of
another battery row**, and every one of those rows is MACHINE or HYBRID with a
machine limb. Q34 needs a `GROUP BY` over records the run already had to write.

**Requirement A-1 (the two stamps)** `RULED(DR-045)` · Every action row in the execution ledger
carries two new stamps: **`subject_item_id`** — which evidence or claim item the
action was about — and **`stance_at_action`** ∈ `{SUPPORTS, ATTACKS, NEUTRAL,
UNASSIGNED}` — the item's polarity toward the working answer **at the moment the
action ran**. Everything else the diff needs (typed outcome including
`FAILED`/`BLOCKED`/`TIMED_OUT`/`REFUSED`/`SKIPPED_BY_BUDGET`, actor, timings, input
fingerprint) is already owed by DR-027 and DR-034.

**Requirement A-2 (closed action vocabulary)** `CARRIED-DESIGN` · The action kinds are a **closed
set**, and **no member exists without a row that already obliges the record** —
query runs and access failures (Q15), absence rows (Q17), locator resolution,
access depth, primary/secondary, span extraction and exact quote comparison (Q16),
independence edges (Q19), instrument fixtures (Q23), fit adjudication (Q32),
diagnosticity (Q35), bias domains (Q37), rechecks (Q40), and judge assessments.
An executed check that maps to no member is recorded as `UNCLASSIFIED_ACTION`,
which is itself an `UNINSTRUMENTED` trigger.

**Requirement A-3 (the diff, and what it may emit)** `RULED(DR-045)` · The comparison is a **set and
count comparison**: same checklist (set equality of applied action kinds across
sides), same access depth (counts per bucket), same actions per side (coverage per
kind). The output is a **repair instruction** — status, missing kinds,
`remediation_targets` (the exact work list), `blocked_not_lazy`, and the per-side
census. `RULED(DR-045)` for the diff and the work list.

**Requirement A-3a (no scalar)** `RULED(DR-061 · OD-A-01)` · The row emits **no
fairness score**. Nothing in the record carries that magnitude, so any such number
would be an invented measurement under DR-039. The census, the missing-check list
and the repair list are the whole output.

**Requirement A-4 (which stance the diff uses)** `RULED(DR-061 · OD-A-03)` · The
diff runs on **`stance_at_action`** — the side an item was on at the moment each
check ran — and **reclassifications are reported on a separate line, never folded
in**. An item admitted as supporting can end the run attacking, and a motivated
shortcut acts on the belief held *while deciding how hard to look*; grouping by
final stance would instead measure whether the finished piles were checked evenly,
which can look fair even when the process was not. Both stances stay recorded, so
the comparison can be re-run either way for audit.

**Requirement A-5 (blocked is not skipped)** `CARRIED-DESIGN` · A paywalled source and an unopened
source produce the same absence of a completed open. `BLOCKED` / `FAILED` /
`SKIPPED_BY_BUDGET` are **first-class outcomes**, and `blocked_not_lazy` is served
**beside** the asymmetry, never inside it — otherwise the check reports bias where
there was an access wall, or excuses laziness as a wall.

**Requirement A-6 (the `UNINSTRUMENTED` verdict blocks the claim)** `RULED(DR-045)` · Where any item
in the population has no action rows, or any stance is `UNASSIGNED`, or an
unclassified action exists, the status is **`UNINSTRUMENTED`** and **the fairness
claim is withheld**. This is not a stylistic preference: missing telemetry is
missing *in the direction that matters* — the reason a record is absent is usually
that the action did not happen or its path failed, and failing paths cluster by
side — so a silent pass would declare symmetry **most confidently exactly where
asymmetry is worst**. A property of the form "for every recorded item, symmetric"
is also **vacuously true when nothing is recorded**; the discipline's answer is a
**third verdict**, reported separately from a pass.

**Requirement A-7 (what `UNINSTRUMENTED` does to the answer)**
`RULED(DR-045 + DR-061 · OD-A-05)` · DR-045 blocks the *fairness claim*; DR-061
settles what happens to the *answer*: **cap and label, not halt**, on DR-014's
pattern. The answer serves, the symmetry claim does not, the
top confidence band is capped, the lift condition is the named
`remediation_targets`, and running them later re-scores. The alternatives are
halting the serve, or labelling with no cap.

**Requirement A-8 (V's remediation layer)** `RULED(DR-045)` · On `UNINSTRUMENTED`,
a model **explains why the gap exists, grades the effort, and suggests closure**.
That output is served **openly marked model-authored and biased**, it **never
replaces the verdict**, and it never gates. The reader gets an
**investigate-deeper** affordance that closes gaps through constructed prompts —
prompts built by a model for the next models — plus optional user input; the UI
contract (artifact 3) consumes it. The under-checked side is **re-verified under
the stricter standard** and a **bias event is logged**.

> **Deleted at rework (Codex finding 2).** The previous A-9 prohibited model effort
> grading outright. **That prohibition contradicted DR-045**, which mandates
> precisely that grade inside the marked remediation layer. The research argument
> against effort grading — that it converts an absence of facts into a magnitude,
> and that it is self-assessment — is real and is why **A-8's marking, non-replacement
> and non-gating clauses are the binding safeguards**. The residual question of
> whether a model limb may *also* exist for item-identity and stance resolution is
> open at **`OD-A-06`**; nothing in this document prohibits or requires it.

**Requirement A-10 (the anti-theater list — what Q34's verdict must never be)**
`RULED(DR-028 + DR-039)` · The **verdict** may never be (1) a **pass** derived from
absent fields, (2) an **average** over the two sides — the remedy is to raise the
under-checked side to the stricter standard — or (3) a **time or token comparison
presented as a fairness verdict**. These follow directly from "no judgement, no
magnitude ⇒ no number" and "no invented measurements". *A-8's marked remediation
layer is not a verdict and is not restricted by this list.*

**Requirement A-11 (prevention as well as detection)** `RULED(DR-061 · OD-A-07)` ·
The table diff can never reach the case where the same checklist is filled leniently
for one pile and harshly for the other: the telemetry is identical and the substance
is not. That case is closed by **prevention** — **stance-blind appraisal**, stripping
the side label out of the appraisal prompt — run **alongside** the post-hoc diff, not
instead of it. The machinery already exists (DR-019 knob 3's blind verification,
DR-013's blind comparison, DR-029's anonymized-debate rule), so for a machine
pipeline this is a prompt-construction change rather than a new cost.

**Requirement A-12 (liveness fixtures)** `RULED(DR-061 · OD-A-09)` · The gate ships
with **two fixtures**, and the row does not count as implemented without them: a
recorded run with a **deliberate asymmetry** (the against-pile preview-only, the
for-pile opened in full) that **must emit `ASYMMETRIC`** with the exact remediation
targets, and a recorded run with **the stamps stripped** that **must emit
`UNINSTRUMENTED`** and must **not** emit `SYMMETRIC`. Neither needs V2 and both are
cheap. **A check nobody has watched fail is an untested claim** — the discipline
DR-032 established for the disagreement flag, extended here by DR-061.

**Requirement A-13 (Q46 depends on this)** `RULED(DR-045 + DR-050)` · Q46's
consequence clause — highest-leverage item least verified ⇒ halt and deepen —
cannot execute without the same per-item verification record. **Q34 and Q46 are one
schema ask, not two.** Without the two stamps DR-045 orders, an already-ratified
MACHINE row is a dead check on day one. With them, DR-050 bounds the halt at one
round per parent per run.

**Recorded limitation (stated, not papered over).** A **disposition-rate disparity
conditional on observables** — comparing, among items with the same recorded
profile, how often each side is excluded, bounded, zero-weighted or capped — is a
measured fact about the *judgements*. It is **under-identified as a bias claim**
(the two piles may genuinely differ on unobserved dimensions, and the decisions
determine which outcomes are ever observed). Its adoption as a flag with a named
limitation is an open decision, §23 `OD-A-08`.

### 8.2 Q35 — motive and diagnosticity

**Requirement A-14** `RULED(DR-038)` · Recorded source interests are joined to the competing
hypotheses. A source that would say the same thing whether or not the claim were
true is **non-diagnostic** and is **retained on the record at exactly zero weight**
— never deleted, and never averaged in. Zero-weight-with-retention is an **enforced
gate**, not prose.

### 8.3 Q37 — result-specific bias, seven domains

**Requirement A-15** `RULED(DR-038)` · For each study result in use, **seven bias domains** —
confounding, selection, misclassification, protocol deviations, missing data,
outcome measurement, selective reporting — are presented **prefilled from study
metadata**. Each carries a finding, a direction and magnitude where the record
supports one, and a **disposition of repair, bound or exclude that code enforces**.

**Requirement A-16** `RULED(DR-038)` · The judgement is about **this result**, not about the
source's prestige, and the form is a checklist, not a free-form bias essay.
**A warned-about bias may never be averaged away.**

### 8.4 Certainty, adverse evidence, and uncertainty sources

**Requirement A-17 (Q33)** `CARRIED-DESIGN` · The strongest adverse item **actually found** is
recorded per claim — never the strongest imaginable. With no adverse evidence the
row records `UNADJUDICATED`. Where a counter was **imagined** rather than found,
the record says so: *a counter that was imagined must never be reported as a
counter that was found.*

**Requirement A-18 (Q36, Q38)** `CARRIED-DESIGN` · Certainty names its measurement basis, and every
served number names the source of its uncertainty, with drivers emitted in a fixed
order so "first = primary" is reliable. Fewer than two parseable judgements yields
**no** dispersion measurement, and **that absence is never read as zero
uncertainty**.

**Requirement A-19 (the working disagreement flag, DR-032)** `RULED(DR-032)` · Where judges
disagree, V3 serves a **flag plus a certainty downgrade**. It is **never a silent
average** and **never an abstention gate**, and **V3 must demonstrably fire where
V2 provably could not**. The exact bar for "demonstrably fire" is an open charter
acceptance item (§23 `OD-C-02`). Mechanism detail: manifest §5.2(h)–(i).

---

## 9. The decomposition loop — SPLIT (DR-041)

*In plain words: if the question was worth breaking up, the engine produces the
pieces that would all have to be true — and, in the same act, the things that would
sink it. Then it checks each piece can stand alone, states what would show it
false, and gets a second, different model to carve the question up its own way.*

**Why the loop control is the substance and not an implementation detail:** the
cap, the retry policy and the rotation rule are the only things standing between
this stage and a combinatorial call bomb — children × retries × lineages ×
falsifiers. A spec that treats them as incidental is where an unbounded loop gets
built.

### 9.1 Generation: children and defeaters in one act (Q26)

**Requirement D-1** `RULED(DR-041)` · Children and defeaters are produced **in one act**. A
supports-only output is **kept, never discarded** — discarding an author's whole
output because it has a blind spot throws away real work and re-pays for it.

**Requirement D-2** `RULED(DR-041)` · **Defeater generation is a system obligation**, not an
author's virtue. Where the author produced no defeaters, the obligation is
**routed to a differently-categorized model**, and the author's self-attack
weakness is **recorded as a scorecard process fact** (§16).

**Requirement D-3** `RULED(DR-041)` · A node is **complete only when its defeater set is non-empty
or explicitly exhaustion-marked**. There is no third state.

**Requirement D-4** `CARRIED-DESIGN` · Code enforces non-empty child and defeater arrays,
**bidirectional entailment validation** — a carving where neither the pieces entail
the parent nor the parent the pieces is a **topic list** and is discarded and
re-split — and the **retry → lineage-rotation → abstain** state machine bounded by
the declared cap.

**Requirement D-5 (the cap is an owed artifact)** `RULED(DR-020 + DR-019)` · The regeneration cap declared at
Q6 is **2 rounds / 3 attempts**, after which the row emits a typed **"not runnable"
abstention carrying the rejection evidence**. The topic cap of 7 bounds
model-proposed follow-up topics, and the menu must retain **at least one
could-overturn topic**. Both caps are inherited from DR-019/DR-020, not re-declared
here — so the stage inherits a bound instead of a hope.

### 9.2 Standalone-readability and coverage (Q27, Q28)

**Requirement D-6** `RULED(DR-019 + DR-052)` · Each child is tested in an **isolated context** against the
bare question. A child a cold reader cannot restate — *"say it back cold"* — fails
and returns for regeneration. Coverage is `strangerTestCoverage`: load-bearing
nodes exhaustive **always**, non-load-bearing sampled at an asker-derived rate.
**Per DR-052 the rate freezes at run start and the ratchet applies to the NEXT
run** — a mid-run ratchet made cost monotone non-decreasing inside a run, which is
exactly what an envelope cannot absorb.

**Requirement D-7** `RULED(DR-020)` · Q27's uncovered-scope statement is **plain language**, minted
as node text a stranger can restate, and its claim is bounded: it is a
**diagnostic `UNCOVERED-SCOPE` note**, and **`coverage_passed` is a forbidden
claim**. No working coverage mechanism exists — word overlap is invalid and a model
judging its own coverage is circular — so completeness is never certified. Coverage
becomes a gate only after outcome data sets a threshold (DR-020 knob 8).

### 9.3 Falsifiers, and the ban on silent killing (Q29)

**Requirement D-8** `CARRIED-DESIGN` · Every surviving child states an **observable** and a
**numeric or material threshold**.

**Requirement D-9 (V's redesign)** `RULED(DR-041)` · **There is no kill on author failure.** When
the author cannot produce a falsifier, the **falsifier hunt rotates across
models**. At exhaustion the piece wears a visible **`UNFALSIFIED-AFTER-ROTATION`**
mark that **degrades its standing** — never silent deletion, and never silent full
citizenship. Kill reasons, where a piece is eventually removed, are stored.

### 9.4 The rival carving (Q31)

**Requirement D-10** `RULED(DR-041 + DR-013)` · A rival carver is selected for **measured behavioural
difference**, subject to the **maker-diversity floor** (DR-013: different maker =
different lineage). The packet is **question-only and blinded**, and fingerprinted.

**Requirement D-11 (the degradation ladder, named rather than silent)** `RULED(DR-041)` · Where no
different maker is available, the fallback is **prompt diversification plus bias
mitigations, labelled `DEGRADED DIVERSITY`**. At cold start the run is
**maker-only, and says so**. A run with a single lineage records `single_lineage`
and the divergence-uncertainty claim is **unavailable** — **it never silently
passes**.

**Requirement D-12** `RULED(DR-041)` · Objections from the rival carving are **unioned in by code**,
not selected by the author, and material divergence between the two carvings is
**served as uncertainty** rather than resolved in the author's favour.

### 9.5 Sensitivity is deferred, never guessed per child (Q30)

**Requirement D-13** `RULED(DR-042)` · At SPLIT time the model judges only the **direction** of a
piece's influence and names **semantic dependencies the operator cannot encode**;
these ride in the entailment fields Q26 already produces. **All ranking is deferred
to compose-time arithmetic**, which recomputes the parent with the piece varied.
Low-leverage children are **deprioritised, never killed** — killing here is what
once produced a regenerate loop that could not terminate. This matters for cost as
well as honesty: any judgement placed at Q30 runs **once per child** and multiplies
with fork breadth.

---

## 10. Recomposition — COMPOSE, and the loop-free law (DR-042, DR-043)

*In plain words: the engine puts the pieces back together. How it adds them up
matters more than any weighting question, so the rule must be declared, not
assumed. It checks whether the broken-down answer agrees with the straight one, how
fragile the result is, and — for comparisons — who decided the weights.*

### 10.1 The operator is declared, and the arithmetic is shown (Q45, Q47)

**Requirement C-1** `CARRIED-DESIGN` · The combination operator and its dependence assumption are
**declared per parent**, from the split's conjunction structure — "what would
**all** have to be true". Two operators exist: *accumulate* and *strict-and*.

**Requirement C-2 (the fast path)** `RULED(DR-040)` · Where the operator and dependence assumption
come from policy, config or a human, the row runs with **zero model calls**. Where
they do not, **exactly one bounded declaration call** is mandatory.

**Requirement C-3** `RULED(DR-040)` · **With no declaration, the parent number is withheld and the
components are served alone.** No fallback operator is assumed.

**Requirement C-4** `RULED(DR-031)` · The **rival operator is computable on demand**, and where it
would flip the served band, **both readings are served with the deciding choice
printed** — never averaged, never an abstention. The stake: on the worked
four-sub-claim case accumulate gives 0.9935 and strict-and 0.0997, a **9.96×** gap.
**No structural weight anywhere in this spec can move a number by 9.96×** —
choosing weights before declaring the operator is optimising the second decimal
place of a quantity whose first digit is undetermined.

### 10.2 Leverage, fragility, and the halt (Q46, Q49)

**Requirement C-5** `RULED(DR-031 classification) + [CD] consequence` · Leverage is
computed by **removal-based impact** — recompute with the input dropped, report the
difference — and **joined to verification effort**. Where the **highest-leverage
item is the least-verified**, recombination halts and that input returns to
WEIGH/RUN.

**Requirement C-5a — the deepening bound** `RULED(DR-050)` · **K = 1 halt-and-deepen
round per parent per run.** After it, recombination **proceeds**, and the answer
carries a visible **`LEVERAGE_UNRESOLVED`** residual naming the carrying piece and
its verification thinness, **joined to the Q44 and Q53 panels**.

*Why the bound exists.* Q46's halt returns a piece to WEIGH; re-weighing deepens
it; deepening can surface a *new* highest-leverage piece; Q46 fires again. Nothing
else bounds that bounce: the Stage-6 caps bound topics and regenerations, and the
measurement quota bounds probes, but neither bounds a COMPOSE↔WEIGH cycle — and
because a correctness row may never be budget-skipped (§19 H8), **cost could not
terminate the loop either**. `LEVERAGE_UNRESOLVED` is a **condition mark**, not a
sixth abstention kind (§12.3): the answer still says what it found and says plainly
which piece is carrying it on thin verification.

**Requirement C-6** `CARRIED-DESIGN` · Fragility — the reversal set, and what would have to be
dropped or changed for the answer to flip — is an **output**, served as a table.

**Requirement C-7 (forbidden by construction)** `CARRIED-DESIGN` · Sensitivity may **never** feed
back into base scores or arrow strengths. Weights → strengths → sensitivity →
weights is a loop with no declared fixed point, and an engine built that way can be
made to converge anywhere. This is the most natural-sounding wrong idea in this
space and it will be proposed again; it is prohibited and tested for.

### 10.3 Holistic versus decomposed (Q48)

**Requirement C-8** `RULED(DR-042)` · The **stored** holistic baseline from Q10 is diffed against
the decomposed answer. **It is never regenerated** — the comparison is between
stored artifacts.

**Requirement C-9** `RULED(DR-042)` · Machine enforces **matched compute** (an unmatched comparison
is marked **non-comparable**, not reported as agreement or disagreement), **flags**
a disagreement, **downgrades** confidence and **raises recheck priority**.
**Averaging the two answers is forbidden.**

**Requirement C-10** `RULED(DR-042)` · **The model explains what the disagreement is** — V's
override of the machine-only draft — because a served disagreement a reader cannot
understand fails the stranger test.

### 10.4 Comparisons and who owns the criteria (Q50)

**Requirement C-11 (three guards)** `RULED(DR-043)` · The model may propose criteria, under three
guards code enforces: **(1)** every proposed criterion must **link to actual
evidence or code drops it**; **(2)** rejected candidate criteria are **served
visibly**; **(3)** the asker may **add criteria via the steering menu**.

**Requirement C-12** `RULED(DR-043)` · **Weights are human-only.** All arithmetic — criterion
vectors, the Pareto set, rank stability, the exact reversal point — is machine.
Criteria are recorded `substance: LLM`.

### 10.5 The loop-free law (DR-042)

**Requirement C-13** `RULED(DR-042)` · The graph is **loop-free by construction**. The builder
**refuses cycle-closing edges** and **redirects**: a circular attack surfaces a
typed **shared-crux sub-claim** (or an attack on a common ancestor) instead of
closing the cycle.

**Requirement C-14** `RULED(DR-042)` · **"Circular dependency found" is served
information**, not a swallowed error. The reader is told that the argument came back
round on itself and what the shared crux is.

**Requirement C-15 — the cycle law, closed at three layers** `RULED(DR-056)` ·
First-class defeaters may target a node that is not their structural parent, which
makes cycles **constructible for the first time**, and the scoring arithmetic
requires acyclicity. The law is therefore enforced three times, not once:

| Layer | Behaviour |
|---|---|
| **Construction** | The builder **refuses** the cycle-closing edge and redirects to a typed shared-crux sub-claim or an ancestor attack (DR-042). |
| **Compute** | A cycle reaching the scoring pass is a **typed error — never a partial result and never a fixed-point approximation**. |
| **Write** | A cycle-creating arrow is **rejected at write time**. |

The three layers exist because construction-time refusal alone leaves a bug or a
data migration able to assert a cycle that the evaluator would then meet with no
named behaviour. **The manifest's `OD-23` is closed by this ruling.**

---

## 11. Where a row ends — the row-boundary law (DR-040)

*In plain words: three rows where nobody disagreed about what work was needed, only
about which row pays for it. If two rows both claim a judgement, cost models
double-count it and two specs describe it differently. If neither claims it, it is
never built.*

**The law (DR-040).** *A row owns only the work its own contract names. Judgement
it merely triggers is billed to the row that owns that judgement, and the trigger
must be written down.* It applies spec-wide, not only to the three rows below.

| Row | Ruling | The route that makes it safe |
|---|---|---|
| **Q22** — execute and capture | **MACHINE.** Execution, capture, replay. Zero model calls, provably. | A blocked execution **routes to Q25**, which already owns naming the need, the owner and the authorisation. **Irreproducible output auto-relabels `REASONING`.** No model narrates an execution or paraphrases a result into the evidence ledger. |
| **Q39** — the independence receipt | **MACHINE.** Different lineage, blinded packet hash, correct order, context isolation — all log- and hash-checkable. | The critic's actual attack is **Q40 / Q41 / Q44**. **Q39 is recorded even when no critic exists** — absence is a receipt state — and the consequence of that state is DR-014's. Had the attack lived inside this row, a run with no eligible critic would make the *receipt* unrunnable. |
| **Q45** — the recombination operator | **HYBRID with a machine-only fast path.** | Policy- or human-declared operator ⇒ **zero model calls**; undeclared ⇒ **one bounded declaration call**; no declaration ⇒ **the parent number is withheld** and components are served. |

**Requirement B-1** `RULED(DR-040)` · Every row's contract states what it **owns** and what it does
**not** own, and every hand-off names the receiving row. A blocker or a critique
that falls between two rows and is owned by nobody is a spec defect.

---

## 12. Serve architecture — composition, conformance, and the replay law (DR-044, DR-034, DR-027)

*In plain words: the numbers and the records are computed by machine. Then one
model writes the answer a person actually reads, using only those facts. A second,
different model checks the written text against the facts. If they disagree, the
machine acts on that — it does not shrug.*

### 12.1 The serve-composition architecture (DR-044)

**Pure render was rejected as a serving philosophy** — in V's words, it "defeats
the purpose of our design". Machine-templated text produces technically-correct
sentences a stranger cannot say back, which is precisely the failure the
whole-graph stranger law names.

**Requirement S-1 (the four steps, in order)** `RULED(DR-044)` ·

1. **The machine assembles ALL computed facts into one structured prompt** — the
   fact bundle. Nothing enters it that is not a computed fact or a typed record.
2. **ONE composition model writes the served text, honouring the facts.** The
   machinery is **never recited**: the reader gets an answer, not a tour of the
   pipeline.
3. **A SECOND model judges text↔facts conformance** — does every sentence follow
   from the bundle, and does it claim nothing the bundle does not carry?
4. **The machine enforces the verdict**: a mismatch causes a **recompose** or
   raises a **defect flag**. The judge advises; the machine acts.

**Requirement S-2** `RULED(DR-044 + DR-052)` · The conformance judge's **coverage
is priced by DR-019** — exhaustive on load-bearing content, the asker-derived
sample rate elsewhere — and **the rate is frozen at run start**, with the ratchet
applying to the next run (DR-052). **Serve-conformance is a PROTECTED-CORE row and
may never be budget-skipped** (DR-052): it is the only machine enforcement standing
between a model's prose and a reader, so a budget that could skip it could skip the
whole serving philosophy while the ledger still recorded a tidy, legal skip.

**Requirement S-3** `RULED(DR-044)` · The composition model may not introduce a
claim, a number, a hedge or a softener that has no fact behind it. In particular it
**may not compose a familiarity sentence, a caveat, an attribution or a certainty
statement that the bundle does not support** — the specific failure modes are named
in §17.6 and §12.3.

### 12.1a The SERVE state machine — how serving terminates (DR-049)

*In plain words: a model writes the answer and another model checks it. What
happens when the checker keeps saying no? Without an answer to that, the two models
can argue forever, and the run never ends — and because checking prose is a
correctness step, running out of money cannot stop it either.*

**The loop that made this necessary.** Composition writes "roughly 15%" so a
stranger can read it. The judge rejects the softener because the bundle says
`0.148`. Composition uses the exact figure. The stranger law rejects a bare number
in the top layer. Composition adds explaining prose. The judge rejects the
unbundled claim. **Loop.**

**Requirement S-4 — gate order** `RULED(DR-049)` · The serve gates run in **exactly
this order**, and the order is not an implementation preference:

> **R9 (stranger) → Q53 (objection visibility) → conformance → Q51 (provenance)**

**Requirement S-4a — R9 runs on BOTH surfaces** `RULED(DR-057)` · The answer exists
in two forms, and **each gets its own stranger check**:

1. **Node text, pre-compose** — checked in the gate order above, before any prose
   is written. Its result binds the conformance judge (S-5).
2. **The composed verdict, post-compose** — the sentence the reader actually reads
   gets **its own R9 pass** after composition.

**A verdict-R9 failure takes DR-049's existing terminal**: components-only with a
DEFECT badge. **It does not open a new recompose loop** — the composed verdict
already had its two attempts, and a third would be the loop DR-049 exists to
prevent.

**Requirement S-4b — conformance sampling scope** `RULED(DR-060)` ·
**Load-bearing sentences are always judged.** Non-load-bearing text is sampled at
the **frozen stranger rate** (DR-052). The protected core forbids skipping the
conformance **role**; it does **not** mandate exhaustive sampling. Skipping the
judge entirely is prohibited; sampling within the declared rate is not a skip.

**Requirement S-5 — the conformance judge is subordinate to the stranger law**
`RULED(DR-049)` · **The conformance judge may never demand an edit that violates
R9.** R9 runs first and its result binds; a conformance instruction that would make
a load-bearing node unreadable is itself rejected. This is what breaks the loop
above at its first turn rather than its third.

**Requirement S-6 — Q53's residual is data, not prose** `RULED(DR-049)` · The
residual objection is a **fact-bundle field**. It cannot be satisfied by the
composition model happening to mention it, and conformance cannot pass a text that
omits it while judging only the sentences it did write.

**Requirement S-7 — termination** `RULED(DR-049)` · **`max_recompose = 2`.** After
the **second** conformance failure the answer **serves COMPONENTS-ONLY** — the
verified facts, the badges and the node graph — **with a visible DEFECT badge**.
**Never blank, and never unchecked prose.**

| State | Trigger | Next |
|---|---|---|
| `COMPOSE` | fact bundle assembled and gated (R9, Q53 pass) | → `CONFORM` |
| `CONFORM` | conformance judge runs | pass → `PROVENANCE`; fail → `RECOMPOSE` |
| `RECOMPOSE` | conformance failure, attempt count < 2 | → `COMPOSE` (attempt +1) |
| `PROVENANCE` | Q51 gates run on the text that will ship | pass → `SERVE`; fail → `COMPONENTS_ONLY` |
| `COMPONENTS_ONLY` | second conformance failure, **or** a blocking gate that prose cannot repair | → `SERVE_DEGRADED`: verified facts + badges + node graph + **DEFECT badge** |
| `SERVE` / `SERVE_DEGRADED` | terminal | the reader always gets something honest |

**Requirement S-8** `RULED(DR-049)` · There is **no blocked-and-silent terminal**.
Every path out of SERVE puts something in front of the reader, and every degraded
path says on its face that it is degraded.

**Requirement S-9 — fixtures** `CARRIED-DESIGN` · Each terminal needs a fixture:
a node-text R9 failure, a **verdict R9 failure**, a Q53 failure, a first
conformance failure that recomposes to a pass, a second conformance failure that
reaches components-only, and a Q51 provenance failure. A state machine with an
untested terminal is a state machine with an unknown terminal.

### 12.1b The compose size law — what happens when the facts do not fit (DR-058)

*In plain words: the stranger law puts every load-bearing node's restatement into
the material the writing model has to honour. On a big question that material can
exceed what one pass can hold. The dangerous failure is not running out of room —
it is running out of room quietly, and dropping the objection nobody wanted
printed.*

**Requirement S-9a — multi-pass composition** `RULED(DR-058)` · An oversized fact
bundle is composed in **multiple passes, ordered by load-bearing priority**
(summarize, then refine). The bundle is never silently trimmed to fit one pass.

**Requirement S-9b — honesty fields are machine-injected** `RULED(DR-058)` ·
**Residual objections, badges and condition marks are injected into the output
structure by the machine, outside the composition model's discretion.** They are
not things the model can choose to include; they are fields it composes *around*.
**Silent truncation of an honesty surface is therefore impossible by construction**
— the model cannot omit what it was never given the option to omit.

**Requirement S-9c — the hard budget terminal** `RULED(DR-058)` · Past the
**declared** hard bundle budget, the answer takes the components-only terminal
rather than composing from a partial bundle. A composed answer that silently rests
on some of the facts is worse than an uncomposed answer that rests on all of them.

### 12.1c Degraded mode still owes the reader the honest parts (DR-059)

*In plain words: when composition fails and the engine falls back to components,
two of the honesty surfaces are sentence-shaped — the reversal point that says which
way a value judgement would flip the answer, and the disclosure that this builds on
a previous answer. Without prose, those would simply vanish exactly when the reader
most needs them.*

**Requirement S-9d — projection fields for the sentence-shaped surfaces**
`RULED(DR-059)` · The **reversal point** and the **builds-on-previous disclosure**
each get a **structured projection field that renders without composed prose**. In
degraded mode they are **served as data**, not dropped.

**Requirement S-9e — replay eviction, not whole-answer refusal** `RULED(DR-059)` ·
The replay law refuses to serve a number that cannot be recomputed. When one
component number fails replay, **that number is EVICTED and replaced with a typed
missing-number mark**; **the rest of the answer serves, with a DEFECT badge**.
**One number is lost, never the answer.** Refusing the whole answer over one
unreplayable component would convert a narrow integrity failure into a total
outage, and would give the reader nothing to check.

### 12.2 What the machine owns absolutely at serve time

These are **blocking gates**, listed in DR-049's execution order.

| Order | Gate | Row | Behaviour |
|---:|---|---|---|
| 1 | **Stranger-test status** | R9 | Every node **and** the verdict must be individually restatable against the canonical schema (§12.6); the check is mechanical and **blocks serving**. Its result **binds the conformance judge**. |
| 2 | **Hidden-objection gate** | Q53 | An endorsed band **may not be served** while an unresolved high-strength counterargument is carried and hidden. The residual is a **fact-bundle field**. |
| 3 | **Conformance** | DR-044 | Text↔facts. Mismatch → recompose (max 2) → components-only with a DEFECT badge. **Never budget-skippable.** |
| 4 | **Provenance join** | Q51 | Every load-bearing claim joins to its **kind (looked-up / ran / reasoned), producer and locator**. |
| 4 | **Locator gate** | Q51 | **A missing locator blocks serving.** |
| 4 | **Reasoning-only downgrade** | Q51 | A verdict resting on reasoning alone is **downgraded from a verdict to a hypothesis plus a research plan**. |
| — | **Abstention typing** | Q55 | Exactly one of the five kinds **per ignorance-ledger unknown**, consistent with the ledger (§12.3). |
| — | **Findings/recommendations separation** | Q57 | They render in **separate blocks**; a recommendation with no named normative owner is a **defect**. |
| — | **Replay** | DR-034 | A number that cannot be recomputed from frozen records is **not served**. |

**Requirement S-10** `RULED(DR-044 §4 activation)` · Q51 is the **sole
never-disabled serving invariant, for any output including terminal non-answers**.
An `INERT` return, a false-presupposition non-answer and a
`NOT_EMPIRICALLY_DECIDABLE` verdict all carry provenance.

### 12.3 The partition law — abstentions and condition marks (DR-051)

*In plain words: "I don't know" and "here is something wrong with how I got this"
are different kinds of honesty, and the engine used to have only one box for both.
An answer can perfectly well be sure of itself and still be carrying three separate
warnings — and the old rule, which said pick exactly one of five, could not express
that. Honesty succeeding must never make serving fail.*

**The collision that made this necessary.** One leaf is exhaustion-marked
`UNFALSIFIED-AFTER-ROTATION`; another has `UNINSTRUMENTED` symmetry; a parent hit
the regeneration cap and is "not runnable"; the answer still carries an ownerless
value question. The old exactly-one-of-five rule could pick **no** kind without
leaving residue — and residue at serve time was defined as a defect. **SERVE would
have failed because the engine was being honest four times at once.**

**Requirement S-11 — the partition** `RULED(DR-051)` · The **five abstention
kinds** apply **only to ignorance-ledger unknowns**. Every other typed state is a
**condition mark**, in a separate **closed enum**, servable **in parallel**.
**One answer may wear one abstention kind and several condition marks.**

**Requirement S-12 — the exhaustive membership** `RULED(DR-051)` · Every typed
non-answer state maps to exactly one of three homes. **This table is the single
source of the condition-marks enum and it is literal and complete — there is no
"and so on".** The UI contract and the carryover manifest cite it by reference and
do not maintain their own copies.

**Home 1 — the five abstention kinds** (exactly one per ignorance-ledger unknown):

| # | Kind | Means |
|---:|---|---|
| 1 | not searched | the unknown was never looked for |
| 2 | searched and found nothing | looked for, absent |
| 3 | measured and inconclusive | measured, the measurement did not settle it |
| 4 | not runnable | nothing could be executed that would settle it |
| 5 | a value choice | evidence cannot settle it; it turns on what matters |

**Home 2 — the condition marks** (a closed enum; an answer may wear several, in
parallel with one abstention kind):

| # | Mark | Raised by | Says |
|---:|---|---|---|
| 1 | `UNINSTRUMENTED` | Q34 · §8.1 | the checking record is too incomplete to compare the two sides |
| 2 | `UNFALSIFIED-AFTER-ROTATION` | Q29 · §9.3 | no model could state what would show this piece false |
| 3 | `SKIPPED-BY-BUDGET` | DR-021 knob 9 · §21.2 | an enrichment step was skipped for cost |
| 4 | `ENVELOPE_EXHAUSTED` | DR-052 · §21.2 | the run hit its declared envelope and served what was verified |
| 5 | `LEVERAGE_UNRESOLVED` | DR-050 · §10.2 | the piece carrying the answer is thinly verified |
| 6 | `DEGRADED-DIVERSITY` | Q31 · §9.4 | the rival carving came from the same maker |
| 7 | `SINGLE-LINEAGE` | DR-014 · §14.2 | no different-maker critic ran at all |
| 8 | `CRITIQUE-UNAVAILABLE` | DR-014 · §14.2 | the independent critique could not be obtained; the confidence band is capped |
| 9 | `AMBIGUOUS_ATTRIBUTION` | Q54 · §12.4 | several events could have moved the belief; the record cannot break the tie |
| 10 | `STALE` | DR-015 · §13.1 | a watched trigger fired against this answer |
| 11 | `UNDER-REVIEW` | DR-015 · §13.1 | the answer is past its review clock |
| 12 | `UNDER-EXPLORED` | DR-016 · §13.2 | this branch got little attention; never a retirement cause |
| 13 | `UNRESOLVED-TYPE-FALLBACK` | DR-021 knob 10 · §5.4 | the question type or field could not be resolved; a labelled factual fallback was served |
| 14 | `DEFECT` | DR-049 · §12.1a | composition could not be conformed in two attempts, or the verdict failed its stranger check |
| 15 | `UNPRICED` | Q6 · §21 | the abstention cell could not be resolved; no over-abstention claim is made |
| 16 | `UNADJUDICATED` | Q33 · §8.4 | no adverse evidence was found for this claim |
| 17 | `UNCOVERED-SCOPE` | Q27 · §9.2 | the split does not cover this part of the question |
| 18 | `NON-COMPARABLE` | Q48 · §10.3 | the split and unsplit answers were not produced at matched compute |
| 19 | `NOT_SAMPLED` | R9 · §12.7 | this node fell outside the frozen stranger sample |
| 20 | `OFF-SUBJECT-DOWNGRADE` | DR-009 · §7.2 | evidence was partly relevant and was admitted at reduced weight, with its off-subject share named |
| 21 | `AMENDED-SEARCH` | DR-008 · §7.1 | the frozen query set was amended mid-run, with the amendment's type and reason |
| 22 | `MISSING-NUMBER` | DR-059 · §12.1c | a component number failed replay and was evicted; the rest of the answer stands |

**Home 3 — terminal routes** (these *are* the answer; they end the run and still
carry provenance):

| # | Route | Raised by |
|---:|---|---|
| 1 | `INERT` | Q1 · §5.2 |
| 2 | false-presupposition non-answer | Q3 · §5.2 |
| 3 | value → human | Q7 · §5.2 (pure value acts only, per DR-053) |
| 4 | `NOT_EMPIRICALLY_DECIDABLE` | Q9 · §5.2 |

**Requirement S-13** `RULED(DR-051)` · A new typed state may not be minted without
being placed in this table, **and this table is the only place it may be minted**.
**An unplaced state is a specification defect**, caught by §26's audit. Sibling
artifacts cite this membership; they never extend it locally.

**Requirement S-14** `RULED(DR-044 + DR-051)` · The model chooses which abstention
kind applies per ledger unknown — **the mapping is a judgement** — and machine
enforces exactly-one **within that scope** plus consistency with the Q12 ledger.
**An abstention rendered as a mid-range number is a rule violation.**

### 12.4 Belief movement (Q54)

**Requirement S-15** `RULED(DR-044)` · Belief updates are **event-sourced and cite
their cause at the moment they are made**. Retrospective attribution is forbidden:
the record is written when the belief moves, not reconstructed at serve time.

**Requirement S-16** `RULED(DR-044)` · Where several evidence events genuinely
could have moved the belief, the state is typed **`AMBIGUOUS_ATTRIBUTION`** and
served as such. **No model call breaks a tie the record cannot break.** With no
recorded prior, movement claims are **unavailable, not zero**.

### 12.5 The replay law (DR-034) and the recording extension (DR-027)

**Requirement S-17 (permanent property)** `RULED(DR-034)` · V3 **permanently
refuses to serve a number it cannot recompute from its own frozen records**, with
**no AI in the replay path**. Continuously self-tested.

**Requirement S-18 (launch ceremony)** `RULED(DR-034 + DR-060)` · At launch, **one
independent replay of recorded runs must pass exactly**. An acceptance criterion,
not a development convenience.

**What "exactly" means, and what replays** `RULED(DR-060 + DR-063)` · **Numbers
replay exactly — byte-identical served numbers.** The **serve decision** replays as
**stored data**: the conformance verdict is an **input artifact** to the replay, not
something a model regenerates. **The ceremony is therefore deterministic**, which is
what makes "no AI in the replay path" achievable for a serving pipeline whose
composition step is a model call.

**Requirement S-19 (the execution ledger)** `RULED(DR-027)` · Raw judgements are
stored **before the math**, with input and contract fingerprints (internal only).
Users see parsed and filtered results. **Everything executed is recorded —
attempts, failures, could-not-dos — and is digest-visible to the user**, with the
algorithm's behaviour consistent with the record. **No served sentence may imply a
check the ledger says did not run.**

**Requirement S-20** `RULED(DR-034 + DR-029 H3)` · Purity is structural, not
stylistic: **replay with no model in the path is impossible unless the scoring math
is pure** — no model calls, no I/O, no clock, no randomness, no database access
inside it.

**Requirement S-21 (deterministic order)** `CARRIED-DESIGN` · Ledger ordering and
arrow evaluation order must be **total and deterministic**, because floating-point
accumulation is not bit-identical under reordering — not to match anything, but so
that V3's own replay is exact.

### 12.6 The wire boundary — what actually reaches the browser (DR-054)

*In plain words: the reader should see every honest badge and every provenance
mark. The reader should not, by default, be shipped the entire internal prompt the
composition model was given — that is a different thing, with size, privacy and
prompt-leakage consequences, and it is available to anyone who asks for it through
the front door.*

**Requirement S-22** `RULED(DR-054)` · The browser receives **typed honesty
PROJECTIONS** — badges, condition marks, provenance summaries, per-node
restatements: **all nine surfaces** below.

**Requirement S-23** `RULED(DR-054)` · The **complete fact bundle and the
conformance record are fetchable on demand** through an **authorized
inspection/replay endpoint** — the same handle DR-034's replay law needs. Honesty
is preserved by *availability*, not by shipping everything by default.

**Requirement S-24** `RULED(DR-054)` · **Internal prompt material is excluded from
the default view.** DR-044 governs what the composition model is *given*; it never
required that material to travel to a client.

**The nine honesty surfaces** `RULED(DR-048)` — this is the canonical list, and it
is nine, not eight:

| # | Surface | Produced by |
|---:|---|---|
| 1 | Typed abstention badges | Q55 · §12.3 |
| 2 | Per-node provenance and ways of knowing | Q51 · §12.2 |
| 3 | Defeaters as **visible first-class attacks** | Q26 · §9.1 |
| 4 | **STALE / UNDER-REVIEW** badges | DR-015 · §13.1 |
| 5 | Value markers and reversal points | DR-017 · §15.3 |
| 6 | **Investigate-deeper** | DR-045 · §8.1 A-8 |
| 7 | **UNDER-EXPLORED** | DR-016 · §13.2 |
| 8 | **SKIPPED-BY-BUDGET** and fallback labels | DR-021 knobs 9–10 · §21.2 |
| 9 | **Builds-on-previous disclosure** | §17.6 |

**Requirement S-25** `CARRIED-DESIGN` · Every one of those surfaces is produced by
a requirement in this document, and each has exactly one requirement, one UI row
and one charter acceptance hook.

> **The UI contract's 30 presentation cells are DELEGATED, not open**
> `RULED(DR-064)`. They stay counted and consequence-annotated in the UI boundary
> contract, and V rules each against **actual mockups during the UI build phase** —
> one review per flex surface, per DR-048's "each V-approved". **The requirements
> mission closes without them**: this spec and ARCHITECTURE consume their
> *consequences* — which surface must exist, and what it must be able to say — not
> their *shapes*. A reference in this document to a UI cell is therefore a
> reference to a delegated build-phase decision, not to an open requirements
> question. **A surface with no requirement behind it is
decoration; a requirement with no surface is invisible honesty.** The kept UI's
data layer is rebuilt against these native shapes with **no adapter**; the ten
never-called V2 surfaces and the dual-transport seam do not survive (DR-048).

### 12.7 The canonical `stranger_restatement` contract

*In plain words: four artifacts each said "every node must be restatable by a
stranger", and each named a slightly different set of things the restatement has to
contain. A builder cannot implement four schemas. This is the one.*

**Status: `RULED(DR-061 · OD-S-06)`.** DR-018 amends R9's *scope* (every node **and**
the verdict, individually) and DR-019 sets its *coverage*; DR-061 ratifies the
payload below. **All four artifacts cite this contract by name** rather than
restating a field list.

```
stranger_restatement {
  subject_ref          -- the node or the verdict this restates
  claim                -- what is being said, in ordinary language
  certainty            -- how sure, in words, not a bare number
  what_would_change_it -- the revision trigger, in ordinary language
  action_consequence   -- what the reader would do differently  [SCOPE: see below]
  generated_at         -- restatements are minted with the node, not at serve time
  check_status         -- PASS | FAIL | NOT_SAMPLED   (mechanical; blocks serving on FAIL)
}
```

**Requirement S-26 — the action-consequence scope is VERDICT-ONLY**
`RULED(DR-061 · OD-S-06)` · **The verdict carries `action_consequence`; nodes carry
the other four fields and set it `NOT_APPLICABLE`.** The answer→action map is
recorded at answer level (Q1), and no deterministic projection of an action onto an
individual node exists. An inherited action on a leaf about, say, a measurement
instrument would be meaningless text — and meaningless text is exactly what the
stranger law exists to prevent. Generating one per node was the third option and
was rejected on cost and invention risk: it multiplies by node count against the
coverage rate and invites an action where none exists.

**Requirement S-26a** `RULED(DR-061 · OD-S-06)` · The mechanical R9 check validates
against this contract, and the **`NOT_SAMPLED`** status keeps a node outside the
frozen sample distinguishable from a node that passed — which nodes were checked is
a fact about the run, not a gap in it.

### 12.8 The verdict model — one vocabulary, four surfaces

*In plain words: the pack currently uses "verdict band" and "confidence band" as if
a reader knows the difference, and never says what the difference is. A stranger
cannot tell which one a missing critic caps.*

**Status: `RULED(DR-061 · OD-C-01 + DR-063)`.** The **model** is ratified: four
named axes, formally separated, used consistently and never interchangeably. **All
numeric boundaries are deferred to V's flag-register ratification (DR-023)** — the
bands are ordered labels until outcome data exists to set thresholds from, because
inventing them now would be the invented measurement DR-039 forbids.

| Term | What it names | Which gate acts on it |
|---|---|---|
| **verdict state** | The *kind* of answer: does the engine assert something, hand back a conditional, or decline? Candidate members include supported / contested / unsupported / value-conditional / non-answer. | Terminal routes (§5.2); the value overlay (§15). |
| **verdict band** | Where the answer sits on the supported↔unsupported scale, given the arithmetic. **Ordered labels; the numeric boundaries land at DR-023's flag-register ratification.** | Q53's hidden-objection gate blocks an endorsed band; Q47 serves both bands where the rival operator flips one. |
| **confidence band** | How sure the engine is, given how well it checked. | **DR-014 caps this one** when no second lineage was available; `UNINSTRUMENTED` caps it under A-7 (candidate); DR-032's disagreement flag downgrades it. |
| **abstention kind** | Which of the five kinds of not-knowing applies to a ledger unknown (§12.3). | Q55; the abstention price (§21). |
| **condition marks** | The parallel closed enum of everything else (§12.3). | Never a band; always additional. |

**Requirement S-27 — two axes, not one** `RULED(DR-061 · OD-C-01)` · The
distinction that matters most, and the one a stranger most needs: **a contested verdict can still be highly confident, and a
supported verdict can be capped to low confidence.** They are two axes. Every
`DR-014`, `UNINSTRUMENTED` and disagreement consequence in this document caps
**confidence**, never the verdict band — a check that was not run does not change
what the evidence says, only how sure the engine is entitled to sound.

---

## 13. Staleness and liveness (DR-015, DR-016)

*In plain words: an answer is true as of a moment. The engine stamps that moment,
watches for the things that would change it, wakes the answer when they happen, and
says out loud when an answer is under review. Nothing is ever deleted.*

### 13.1 Snapshot + wake + propagate (DR-015)

**Requirement T-1 (snapshot)** `RULED(DR-015)` · Every node and every answer is stamped
**relevant-as-of** at spawn.

**Requirement T-2 (wake)** `RULED(DR-015)` · Machine wake-ups fire on **watched revision triggers**
— including the conditions Q58 named — and on **class-based TTL review clocks**.

**Requirement T-3 (propagate)** `RULED(DR-015)` · A woken change **re-assesses ancestors**: the
machine recomputes the arithmetic, and a model re-judges **only the affected
nodes** — child→parent rethinking, not a full re-run.

**Requirement T-4 (say so)** `RULED(DR-015)` · An answer with a fired trigger, or one past its
review clock, serves with a visible **STALE** or **UNDER-REVIEW** badge. **Never
silently.**

**Requirement T-5** `RULED(DR-015)` · Decay is treated as **detectable and cheap**, never promised
away. The known failure this closes: an answer served with a perfect citation and a
clean primary source that was **seventeen months out of date**.

### 13.2 Composite retirement (DR-016)

**Requirement T-6** `RULED(DR-016)` · A question is retired when there have been **no queries for N
days** (N per class; seeded provisional, **180 for standard**) **and** there are
**no open revision triggers**. Both conditions, not either.

**Requirement T-7** `RULED(DR-016)` · Retired means **ARCHIVED**: the **full graph is kept**, the
question is **auto-revived by the next query** through staleness review, and
**nothing is deleted**.

**Requirement T-8 (why archival is load-bearing beyond the graph)** `CARRIED-DESIGN` · If retirement
deleted, the settled population would be biased toward recently-queried questions
and **every hit rate would be a survivorship statistic**; and cross-run memory
could only ever find recent questions, so "have I been here before?" would silently
mean "in the last N days". DR-016 keeps both denominators honest.

**Requirement T-9 (the isolation signal)** `RULED(DR-016)` · Attention-starved branches carry a
distinct **`UNDER-EXPLORED`** marker. It is a signal to the reader; it is **never a
retirement cause on its own**.

**Requirement T-10** `CARRIED-DESIGN` · Staleness is a **ceiling and a refusal rule, never a silent
multiplier** on a score: a fast-moving question with a stale newest source refuses;
a slow or static one serves with an explicit staleness statement.

---

## 14. Lineage and independent critique (DR-013, DR-014)

*In plain words: the engine's work must be attacked by an AI built by somebody
else. "Somebody else" needs a definition that can be checked, and there has to be
an honest answer for the times when nobody else is available.*

### 14.1 The bright line (DR-013)

**Requirement L-1** `RULED(DR-013)` · **Different maker = different lineage.** Anything same-maker —
**including across model generations** — is the **same** lineage. The rule is a
bright line, auditable per pairing, chosen because it can be checked rather than
argued.

**Requirement L-2** `CARRIED-DESIGN` · Independence is **never fabricated**. An unknown arguer or an
unknown judge yields **"independence unknown" with a typed reason**, never a
default of "independent".

**Requirement L-3** `RULED(DR-029)` · The rule is only enforceable if provider identity is a
first-class configured value rather than an import — which is why house rule H1
(provider-agnostic agents) is its precondition (§19).

### 14.2 When no second lineage exists (DR-014)

**Requirement L-4 (cap, label, lift)** `RULED(DR-014)` · The answer **serves**, but:

- it **cannot reach the top confidence band**;
- it carries a **visible "independent critique unavailable" label with its
  reason**;
- the **lift condition is recorded**, and **executing the critique later
  re-scores** the answer.

**Requirement L-5** `RULED(DR-013)` · A same-lineage judge where independence is required is a
**typed block**, never a silently reused judge.

**Requirement L-6** `CARRIED-DESIGN` · This pattern — *serve, cap, label, name the lift condition,
re-score on completion* — is the packet's standing shape for "we could not do the
check". It is reused verbatim for `UNINSTRUMENTED` symmetry (§8) and is the model
for any future unmet-check consequence.

### 14.3 The receipt, and what the critic actually does

**Requirement L-7** `RULED(DR-040)` · Q39's receipt is **machine and unconditional at CROSS**:
different lineage, blinded packet hash, correct order, context isolation. **It is
recorded even when no critic exists**, because absence is itself a receipt state.

**Requirement L-8** `CARRIED-DESIGN` · The critique's substance lives at Q40 (reopen locators,
exact-check spans, rerun sums, emit verified/deviates/not-found), Q41 (name a
specific defect **or** state exactly what was examined — a critique that does
neither is not a critique) and Q44 (the objection ledger and the standing
residuals).

**Requirement L-9** `RULED(DR-031)` · **Agreement that arrived after unblinding carries zero added
weight**, decided by the unblinding log.

**Requirement L-10 (coverage)** `RULED(DR-019)` · Blind verification is **always** run for STANDARD
and HIGH-STAKES risk tiers, for contested verdicts and for flip-sensitive nodes;
**only the CASUAL tier may be sampled or skipped** (DR-019 knob 3).

**Requirement L-11 (independence is structural, not a quality score)**
`RULED(DR-055 + DR-061 · OD-A-14)` · Routing critique to "the best critic"
converges the panel onto one lineage and destroys the property DR-014 exists to
protect. **The critic lane is exempt from track-record routing at EVERY tier** —
including casual. DR-055 already forced it for standard-and-above; DR-061 extends
the exemption downward, because the saving at the casual tier is small and a rule
with no exceptions is the one that survives contact with cost pressure.

### 14.4 Multi-maker is a launch gate (DR-055)

**Requirement L-12** `RULED(DR-055)` · **Standard-and-above tiers must execute real
different-maker critique from day one.** This is a **charter acceptance item**, not
an aspiration: shipping with a single maker on high-stakes work is not a launch
state.

**Requirement L-13** `RULED(DR-055)` · **Single-maker mode stays legal** — but only
as **labelled degraded operation wearing DR-014's caps**: the answer serves, it
cannot reach the top **confidence** band, it carries the visible
"independent critique unavailable" reason, and it records the lift condition.

*Why this needed a ruling.* DR-014's cap-label-lift path is a graceful fallback,
and a graceful fallback that is never escaped becomes the permanent state: every
high-stakes answer would ship permanently capped, wearing an honest badge nobody
can act on, while the engine claims to be the best dialectical engine to date on
exactly those outputs. DR-055 makes the fallback a fallback again.

---

## 15. Value weights and the value boundary (DR-017)

*In plain words: some questions cannot be settled by evidence alone — they come
down to what matters more to the person asking. The engine detects exactly when
that is true, says so, shows where the line is, and never invents the answer.*

### 15.1 The trigger is computed, never guessed

**Requirement V-1** `RULED(DR-017)` · The **Pareto trigger computes when values hinge**: compute the
Pareto set over the criterion vectors. **If one option dominates on every criterion
there is no value weight and no elicitation fires.** If two or more options are
non-dominated, the choice **is** value-decided, and *which* nodes are the hinges is
determined, not asserted. The system never guesses whether values are involved and
never asks a question it did not need to ask.

**Requirement V-2 (no default weight)** `RULED(DR-017)` · `weight_source ∈ {owner_elicited,
org_policy, none}` — **there is no `default` member**, by construction, for the
same reason there is no default base score. **Absence of an owner's weight is a
first-class, servable state.** Never a 0.5, never an equal-weights vector, never a
"reasonable" assumption: **equal weights are a value judgement wearing a lab
coat.**

### 15.2 The three flows

**Requirement V-3 — Flow A, always.** The system computes the Pareto set and, for
each pair of non-dominated options, **the exact weight region in which each wins**,
and serves the **conditional answer plus the reversal point**. This is a **FULL
answer, not a value-choice abstention**: *"A wins on speed, B wins on cost; A only
wins overall if speed matters more than half, and nobody has told me it does."*

**Requirement V-4 — Flow B, one question per real hinge.** One optional swing
question per genuine hinge. **Answering personalises the answer; skipping keeps the
conditional.** Questions are asked in **swing** form — is moving cost from its
worst value to its best worth more or less than moving speed from its worst to its
best? — **never** in abstract-importance form, and elicitation stops as soon as
further preference information cannot change the answer.

**Requirement V-5 — Flow C, opt-in standing profiles.** A signed, versioned weight
vector over a declared criterion set, at org level, **never a precondition for
answering**. A Flow-C weight **never silently overrides a live hinge**: it pre-fills
Flow B's answer and is marked `weight_source: org_policy`, so a reader can see the
difference between "the person deciding told us" and "a standing policy told us".

### 15.3 The overlay invariant and the marking rules

**Requirement V-6 (the invariant)** `RULED(DR-017)` · **The value overlay never mutates the
evidence-scored graph.** Base scores, arrow strengths, strengths and provenance are
computed with **no reference to any value weight**. This is an **enforced
invariant** — recompute every strength with the overlay detached and assert
byte-identity — not a convention. If a value weight is ever folded into the scoring
math, provenance-blind serving reappears in a new costume and the stranger can no
longer see where values decided rather than evidence.

**Requirement V-7 (marking)** `RULED(DR-017)` · Every value-decided segment carries a **visible
marker naming whose weights decided it**, and the **reversal point is printed
beside it** — not *"we weighted speed at 0.6"* but *"A wins for any speed weight
above half; you would have to think speed is worth less than half as much as cost
to flip this."* The reversal point is the only part of the overlay a stranger can
independently test.

**Requirement V-8 (never conflate two axes)** `CARRIED-DESIGN` · **Value-dependence and weak evidence
are different things** and must never share a label, a colour or a meter. A
value-conditional answer may rest on impeccable evidence.

**Requirement V-9 (serve both, never average)** `RULED(DR-017)` · A value weight that flips the
verdict is the same kind of object as an aggregation constant that flips it: serve
both readings with the deciding line printed. **Deliberately not an abstention.**

**Requirement V-10 (findings and recommendations)** `RULED(DR-017)` · Findings come from the graph;
recommendations come from the overlay; they render in **separate blocks** (Q57).
**A recommendation paragraph with an empty overlay owner is a defect, not a style
choice.**

**Requirement V-11 (`weight_source: none` is not an abstention)** `RULED(DR-017)` · It must **not**
be priced against the abstention matrix. The abstention price prices *not
answering*; Flow A **does** answer — it returns the complete comparison plus the
exact condition under which each option wins, which is strictly more information
than a winner picked under an invented weight. Penalising the most honest output
the engine can produce would be a scoring error, not a policy.

**Requirement V-12 (the machine never has opinions)** `RULED(DR-017)` · No component of V3 holds a
value position. Where one is needed and none has been supplied, the answer is
conditional and says whose weights are missing.

*The value-decided verdict-state vocabulary — whether a winner may ever be served
under a `value_conditional` state — is the manifest's `OD-14`.*

---

## 16. Scorecards, the model ledger, and routing (DR-039, DR-046)

*In plain words: the engine keeps a track record for each model it uses — how
reliably it behaves, and (once real outcomes arrive) how often it was right about
what. That record decides how much each model's opinion counts and which model gets
which job. The hard part is not building it; it is refusing to pretend it knows
things it cannot yet know.*

**The governing law is DR-039: NO INVENTED MEASUREMENTS.** A metric, label or rule
enters this chapter only with hard facts behind it. Nothing is adopted for the sake
of measuring something or to manufacture confidence. And because a scorecard is a
**served number**, DR-034 applies to it in full: **a scorecard must be a pure
function of the ledger** — no smoothing window that is not recorded, no model in
the loop, no "we retrained the router" with an unfrozen training set.

### 16.1 The two tiers, and the wall between them

**Requirement K-1 (the two-tier wall)** `RULED(DR-061 · OD-A-10)` · Track-record
quantities split into **two tiers that are never mixed in one number**, because a
capability claim and a process claim rest on different evidence. Every cell is
labelled with what it rests on — measured outcome, measured process, external
benchmark, or not measured — with **no "assumed" and no "default" member**.

**Tier 1 — process facts.** Available from run one; computable from the execution
ledger with **no ground truth whatsoever**: schema-compliance and parse-failure
rate, provider error and timeout rate, latency and cost per node,
determinism/self-consistency at fixed input, **position-swap flip rate**,
**self-preference delta** (score given to an artifact blind versus attributed),
abstention rate per class broken out by the five typed kinds, dispersion against
the panel, and **silent-drop rate** (judgements discarded for schema failure —
which must itself be a recorded event, never a quiet drop).

**Tier 2 — capability facts.** Require Stage-11 **settled outcomes**: hit rate per
(model, task class), proper score with its decomposition, calibration curve,
conditional-right-when-disagreeing, and the risk–coverage curve.

**Requirement K-2** `RULED(DR-039)` · **V can have a truthful bias scorecard on day one. V cannot
have a truthful capability scorecard on day one.** The bias half is almost entirely
Tier 1 — position bias, verbosity bias and self-enhancement bias each have a
measurement protocol that needs no outcome: swap the order, length-control the
pair, blind the attribution. The scorecard must state **in its own text** that
process reliability is not task capability.

### 16.2 The cell shape and its honest-reporting obligations

**Requirement K-3 (the cell shape)** `RULED(DR-061 · OD-A-17)` for the version keys
· `CARRIED-DESIGN` for the rest · Every cell carries: model id, **`model_version`**,
provider, task class (from the battery's own Q7/Q8 taxonomy), the metric, its value,
**`n`**, an **interval**, `as_of`, the population counts
`{settled, unsettled, permanently_unscoreable, abstained}`, and a **`basis`**.
**`model_version` + `as_of` are required keys**, and a provider's silent model update
is a DR-015 revision trigger that **wakes the cell** — a cell keyed to "the
provider's current model" is keyed to nothing.

**Requirement K-4** `CARRIED-DESIGN` · `basis ∈ {MEASURED_OUTCOME,
MEASURED_PROCESS, EXTERNAL_BENCHMARK, NONE}` — with **no `ASSUMED` and no
`DEFAULT` member**, on DR-017's `weight_source` precedent and DR-028's law.
**`NONE` renders as "not measured" and never as a middle number.**

**Requirement K-5 (every cell carries `n` and an interval)** `CARRIED-DESIGN` · Small-`n` cells are
where anti-theater bites hardest: 4 of 4 gives a 95% interval of roughly
[0.51, 1.00]; 2 of 5 gives roughly [0.12, 0.77]. **A cell whose interval spans the
decision boundary must not drive a decision.**

**Requirement K-6 (report the decomposition, not a bare score)** `CARRIED-DESIGN` · A proper score
decomposes into reliability (are the probabilities truthful), resolution (do they
discriminate) and **uncertainty — a property of the questions, not of the model**.
A model that looks weak on causal questions and strong on lookups may differ only
in the last term. **Serving a bare per-class score invites exactly that
misreading**, so the decomposition is served with it.

**Requirement K-7 (calibration error is binning-dependent)** `CARRIED-DESIGN` · A served calibration
error with **no declared binning** is an invented measurement in presentation even
where the underlying data is real. The binning is declared; equal-mass binning is
preferred; the estimator's known bias is stated.

**Requirement K-8 (hit rate is corrupted by abstention)** `CARRIED-DESIGN` · A model that declines
the hard 40% posts a higher hit rate on the 60% it answers. Because V3 **prices
abstention explicitly** and will therefore have systematically different coverage
per model and per class, this is the **normal case, not an edge case**: compare at
**matched coverage**, or compare risk–coverage curves.

**Requirement K-9 (multiplicity)** `CARRIED-DESIGN` · With models × classes cells, the maximum is
optimistically biased by construction. Recomputed illustration: 96 cells that are
**all truly equal** at 0.70, with 50 settled items each, produce an expected
maximum cell of **0.852**, and some cell reads ≥ 0.86 in **half** of trials.
**A leaderboard of point estimates is prohibited**; a declared minimum effect size
or a multiplicity correction is required.

**Requirement K-10 (state the time-to-signal in the spec, so nobody reads an early
leaderboard as knowledge)** `CARRIED-DESIGN` · Settled, resolved items **per model per class** needed
to distinguish two rates at conventional power: 60% vs 80% → **81**; 70% vs 80% →
**293**; 75% vs 80% → **1,094**; 78% vs 80% → **6,510**.

**Requirement K-11 (external benchmarks)** `RULED(DR-061 · OD-A-16)` · An external
number may be **shown**
with full declared provenance — benchmark, version, date, exact model version, who
ran it, scoring script — and a **non-transfer caveat**; it may at most seed a
tie-break; it may **never** be converted into a coefficient inside V3's scoring
math, because that lets another population's measurement act as if it were this
system's. The caveat is not hypothetical: a documented case shows a headline
benchmark number roughly doubling under contamination **without transfer** to an
unrelated benchmark.

### 16.3 Derivation: how a settled outcome becomes a weight

**Requirement K-12 (the chain)** `RULED(DR-046)` · Q59 validates the resolution event and the
**external** resolver and emits scoreability → Q60 persists
`{answer, prior, posterior, basis, resolver, date, provenance}` and **reads it
back** → DR-015 wake-ups and DR-016 review clocks are the machinery that makes
settlement day arrive → Q61 applies a **registered proper score** and updates and
**versions** the calibration and the class prior → those versioned weights become
the **real judge weights** (DR-026).

**Requirement K-13 (the score key)** `CARRIED-DESIGN` · Scoring keys on
**`(answer_id, answer_version, as_of)`**, because DR-015 lets an answer be woken,
re-judged and changed. Scoring the *question* would let a later revision silently
rewrite history.

**Requirement K-14 (the scoreable subpopulation is not the population)** `CARRIED-DESIGN` · Q59 marks
value choices `PERMANENTLY_UNSCOREABLE` **by design**. Capability numbers therefore
describe the resolvable subset only, and **the share excluded is a recorded count
served next to every cell**.

**Requirement K-15 (one declared parameter, printed where used)** `CARRIED-DESIGN` · Whatever
weighting mechanism is adopted must be a pure function of the ledger with its
parameter recorded and printed. A prior is legitimate only when it is a **measured
pooled quantity of this system**; at t=0 there is no pooled quantity, so the honest
object is an **absent cell, not 0.5**.

### 16.4 The always-evolving weights, and cold start

**Requirement K-16 (V's direction)** `RULED(DR-046)` · Weights and capabilities are
**ALWAYS-EVOLVING**, updated **on every factually-settled round**.

**Requirement K-17 (diversity is mandatory)** `RULED(DR-046)` · An **exploration share of ~20%**
(next-best or random) applies once understanding has accrued. **No monopoly:
diversity of thinking is mandatory.** *(Provisional-recommended number, on DR-012's
pattern.)*

**Requirement K-18 (new-model onboarding)** `RULED(DR-046)` · A new model serves a **~50-round
process-fact probation**; its capability weight **departs neutral at n ≥ 30 settled
per class**; it reaches **full authority at the detectability threshold of ~293
per class**. *(Provisional-recommended numbers, on DR-012's pattern.)*

**Requirement K-19 (best-model HARD routing only past the detectability threshold
per class)** `RULED(DR-046)` · Below it, routing falls back to the declared non-scorecard rule.

**Requirement K-20 (the cold-start requirement is a demonstrated EXIT, not a better
starting number)** `RULED(DR-046 + DR-061 · OD-A-18)` · The indicted defect was never the initial
value — the old weights were **labelled honestly** as cold-start — it was that
**the path out was unreachable**, so every judge counted the same forever no matter
what happened. The acceptance test is therefore required: **inject one synthetic
settled outcome, flow it Q59 → Q60 → Q61 → track record → weight, and assert the
weight moves off its cold value**, with the whole path replayable under DR-034.
**A calibration mechanism that cannot be shown to move is the same defect with new
code.**

**Requirement K-21 (what may be claimed at t=0)** `RULED(DR-046)` · Nothing about task capability
from the system's own data — `basis: NONE`, and **the router must behave exactly as
it would with no scorecard at all**. Uniform weights are permissible **if and only
if** they are labelled uniform and **are not called calibration**: the word
"calibration" may not appear on a quantity that has never seen an outcome.

### 16.5 The model ledger and routing

**Requirement K-22 (the model ledger)** `RULED(DR-046)` · A **Postgres database of sessions and
per-category model bests**, informing the next session's assignment. It is one
store with the settlement substrate, not a parallel one (§17.5).

**Requirement K-23 (consumption from day one)** `RULED(DR-046)` · The scorecard is consumed for
**weighting and for diversity-routing** from day one; **process facts feed the
routing** that the decomposition loop already requires (differently-categorized
model for defeaters, rotation for falsifiers, measured-difference rival carver).

**Requirement K-24 (weighting preserves the data-generating process; routing
destroys it)** `CARRIED-DESIGN` · Under weighting every model still runs on every class, so every
model keeps generating observations everywhere and only its *influence* changes.
Under routing the unrouted model stops producing data on that class **forever**,
and nothing in the logs can then estimate what it would have done — the
counterfactual is not merely noisy, it is **unidentified**. This is why routing
carries the guards below and weighting does not.

**Requirement K-25 — the guard set** `RULED(DR-061)` · Any routing that touches the
served lane satisfies **all eight** of these. Six were open register rows; DR-061
adopted every recommended option.

| Guard | Authority | Content |
|---|---|---|
| **G1 — separate lanes** | `RULED(DR-061 · OD-A-13)` | Route the **served** lane; keep the cross-lineage **panel lane uniform**, and compute the track record from the panel lane, so selection cannot starve measurement. The standing cost — panel calls continuing on classes the router has abandoned — is named and paid, not hidden. |
| **G2 — exploration floor** | `RULED(DR-061 · OD-A-12)` | A **non-zero ε per live class**, with the **propensity recorded per decision**. Without it the intervals stop updating and the track record silently freezes while continuing to look authoritative. |
| **G3 — version-pinned identity** | `RULED(DR-061 · OD-A-17)` | `model_version` + `as_of` are **required keys**, and a silent provider update fires a **DR-015 revision trigger on the cell**. A cell keyed to "the provider's current model" is keyed to nothing. |
| **G4 — minimum-n and overlap** | `RULED(DR-061 · OD-A-15)` | A cell influences a decision only above the declared `n` (DR-046: n≥30 to depart neutral, ~293 for hard routing). **When two candidates' intervals overlap, the router falls back to the prior rule** — lineage, availability, cost — rather than taking the point estimate. |
| **G5 — multiplicity control** | `CARRIED-DESIGN` | See K-9's arithmetic. **Never a leaderboard of point estimates** — a ranked maximum over many equal cells is a measurement of noise, which DR-039 forbids. |
| **G6 — the critic lane is exempt** | `RULED(DR-055 + DR-061 · OD-A-14)` | At **every** tier. Independence is structural, not a quality property (§14.3 L-11). |
| **G7 — no self-routing** | `CARRIED-DESIGN` | A model may not supply the inputs that score itself; self-preference is a measured effect, not a hypothetical. |
| **G8 — route on the class, not the item's expected answer** | `CARRIED-DESIGN` | Task class comes from LOCK/ROUTE (Q7/Q8), typed and upstream. Routing conditioned on the content a model is about to judge is a channel by which selection can encode the conclusion. |

**Requirement K-26 (clustered observations)** `RULED(DR-061 · OD-M-23)` · Once cross-run memory exists, linked
repeats are **not independent observations**: several settlements about the same
question share evidence, resolver and framing. An unadjusted `n` does not merely
mis-report — it lets cells **clear the minimum-n gate and the overlap rule that
should not clear them**. Illustration on assumed inputs (no such correlation has
been measured, and under DR-039 none may be asserted): 30 settlements arriving as
10 clusters of 3 give an effective `n` of 15, and the naive interval is about **26%
narrower** than the adjusted one. The choice of correction is open (§23
`OD-M-23`).

**Requirement K-27 (reporting form)** `CARRIED-DESIGN` · The scorecard is published in the
established disciplined form: declare the **population**, **disaggregate** by
class, **carry intervals**, and **state what is missing or underrepresented**.

### 16.6 Open decisions in this chapter

The nineteen sharp questions this design leaves for V — whether Q34 emits a scalar,
whether the two ledger stamps are ordered, which stance the diff uses, whether the
telemetry is a correctness row, what `UNINSTRUMENTED` does to the answer, whether a
model may go near Q34 at all, prevention as well as detection, the disposition-rate
flag, liveness fixtures as an acceptance gate, the two-tier wall, whether routing
touches the served lane in v1, the exploration floor, lane separation, the critic
exemption, the minimum-n rule, external benchmarks, model identity and staleness,
the cold-start exit proof, and scorecards under the replay law — are listed **once**
in §23, block A (`OD-A-01 … OD-A-19`), each with its owning artifact. Several of
them are already answered by a DR above and are carried in the register only where
the DR does **not** settle them.

---

## 17. Cross-run memory — the Q61 retrieval mechanism (DR-044)

*In plain words: when someone asks something the engine has answered before, it
should notice, pull what it learned, say out loud that this builds on a previous
answer — and never pretend to a history it does not have.*

**V's ruling (DR-044).** Q61 is HYBRID: **the machine checks whether the
keywords/topic were seen before and pulls prior-session data; a model interprets
what it changes.** That sentence was the whole of DR-044's ruling on this row.
**DR-061 has since ratified all 24 of this chapter's design decisions**, by
reference to the option text recorded at §23 block B — so every clause below is
`RULED`, and the tag `RULED(DR-061 · OD-M-nn)` names which row carries the option
that was adopted. **Nothing in this chapter is still waiting on V.**

### 17.1 Three laws that bound the whole mechanism

**Requirement M-1 (the match key is a projection of already-frozen fields)** `CARRIED-DESIGN` · The
key is built from typed artifacts the run already had to produce — the settlement
act (Q7), the question type (Q8), the declared field (R7), the normalized subject
binding (Q2), and the hash of the frozen query set (Q11). **No new keyword
extractor is built**: one would be a new unvalidated measurement under DR-039, and
an embedding pipeline's output is not recomputable under DR-034 because its model
can change under the same name. The plain routing sentence (R6) is **display only:
never hashed, never keyed**, because it is model prose and would make the key
unstable across regenerations.

**Requirement M-2 (the memory key is NOT the cache key)** `RULED(DR-061 · OD-M-01)` · The cache key exists to
answer *"may I reuse this output?"* and therefore includes `as_of` and the policy
version. The memory question is the opposite one — *"have I been here before?"* —
and the whole point is to match a question asked last month under a different
cutoff. **The memory key therefore drops `as_of` and `policy_version` from
identity and carries them as attributes of the link.** Reusing the cache key here
makes the feature **inert by construction**; this is the single most likely way it
ships dead.

**Requirement M-3 (a match never reduces the work)** `RULED(DR-061 · OD-M-22)` · A prior-session match
**never marks a row satisfied, never skips HARVEST, SPLIT or CROSS, and never
substitutes for a judgement.** It may change a run's *inputs* and its *served
disclosure* and nothing else. Without this law stated, the first cost-pressure
review turns Q61 retrieval into the semantic cache that is already prohibited.

### 17.2 The match ladder — typed tiers, never a score

**Requirement M-4 (the tier ladder)** `CARRIED-DESIGN` · Matching runs on a **precision-ordered ladder** of typed
tiers: `EXACT_QUESTION` (canonical question text and caller scope identical) →
`SAME_BINDING` (act, type, field equal **and** every binding field equal after
normalization) → `PARTIAL_BINDING` (a declared subset agrees) → `TERM_OVERLAP`
(a **count** of shared normalized frozen terms, not a score). **The highest firing
tier is the link's tier; lower tiers never upgrade a link, they only propose one.**

**Requirement M-5 (agreement pattern, not a score)** `CARRIED-DESIGN` · **Every tier emits its agreement pattern, not a score** —
which fields were compared, which agreed, which differed. That pattern is what
makes a link reviewable rather than trusted, and it is what the served difference
statement is built from.

**Requirement M-6 (similarity may propose, never decide)** `RULED(DR-061 · OD-M-04)` · Embedding similarity is
a legal **candidate generator** and an illegal **decider**. Correct and incorrect
matches have **highly overlapping similarity distributions**, and no static
threshold bounds the error rate as question diversity grows; the dangerous cases
are questions that differ **only** in time period, polarity, or analytical intent
while sitting above 0.95 similarity — precisely the differences a debate engine
exists to respect. The tiers are computable as database predicates without any
embedding at all, which also removes an "the embedding model changed" replay hazard.

**Requirement M-7 (`NULL` is not agreement)** `RULED(DR-061 · OD-M-06)` · A binding field left empty on both
runs is **"not compared"**, never "agrees". This is where most silent false merges
are born.

**Requirement M-8 (how the alias table gets its rows)** `RULED(DR-061 · OD-M-05)` ·
Aliases are **model-proposed as candidates and written only when a link is actually
confirmed** — never auto-applied, because one wrong alias row false-merges every
future pair that touches it. Each alias row carries `{surface, canonical, confirmed_by,
confirmed_at, from_run_pair, key_version}`. A wrong alias row false-merges **every
future pair that touches it**, so rows are dated and reversible and the table is a
replayable input.

### 17.3 Link, never merge — and the dominant error

**Requirement M-9 (link, never merge)** `RULED(DR-061 · OD-M-07)` · **V3 never gives two runs the same question identity.** A
match writes a **typed directed edge** — `relation ∈ {REPEATS, REFINES,
CONTRADICTS_PRIOR, RELATED_ONLY}`, with tier, agreed and disagreed fields, who
decided, when, the key version and the alias rows used. Identity stays per-run and
**there is no transitive closure**: one false-positive link would otherwise weld
two unrelated histories together.

**Requirement M-10 (declare the dominant error)** `RULED(DR-061 · OD-M-08)` · **A false merge is worse than a
missed reunion.** A missed reunion costs money and a lost lesson; the run is still
honest. A false merge makes the system **assert a false history to the asker** and,
at deeper payloads, feed another question's evidence into this one. **Every
ambiguous default resolves to "do not link, and say a candidate was found."**

**Requirement M-11 (the negative disclosure)** `RULED(DR-061 · OD-M-19)` · A candidate that was found and
**not** linked is an executed action, and DR-027 makes it disclosable. Serving it
is what lets the asker distinguish **"no history exists"** from **"history exists
and was judged too weak to use"** — very different facts about the world — and it
converts a missed reunion from invisible to correctable.

### 17.4 The payload ladder, and the forbidden cell

**Requirement M-12 (depth is a second dial)** `CARRIED-DESIGN` · Pull depth is a **second, independent dial** from match
precision: link only → settlement facts (prior verdict, band, resolver, outcome,
proper score) → open triggers and staleness state → class-level scorecard facts →
the prior argument graph → the prior served prose.

**Requirement M-13 (one rung refused outright)** `RULED(DR-061 · OD-M-10)` · **The prior served prose is
never fed to any model.** It is the prior conclusion in its most persuasive form,
it contains nothing the typed rungs do not contain, and serve composition already
regenerates prose from facts. It may be **displayed to the asker as a linked
artifact**.

**Requirement M-14 (the forbidden cell)** `RULED(DR-061 · OD-M-09)` · **Wide match + deep payload is
prohibited.** A wrong link that only mis-states history is visible and correctable;
a wrong link that imports foreign evidence into scoring is not. Graph revival is
admissible only under the two narrowest tiers. **Safety is bought far more cheaply
by capping the payload than by tightening the match** — tightening the match costs
recall on every real repeat.

**Requirement M-15 (what class-level facts do not need)** `CARRIED-DESIGN` · Scorecard facts are keyed
by **task class**, not by question identity, so *"for questions like this one, these
models have this measured track record"* is available on **every run, matched or
not**, with no retrieval mechanism at all. The class-level half of Q61 is already
served by §16; retrieval adds only the **this-very-question** half.

**Requirement M-16 (pull-time obligations, whatever the rung)** `RULED(DR-034 + DR-015 + DR-016 + DR-061 · OD-M-11, OD-M-12)` · Every pulled
artifact enters pinned as `{artifact_id, version, content_hash, as_of,
staleness_state_at_pull}` — an unpinned pull makes the new answer unreplayable.
Pulled material **keeps its original relevant-as-of stamp** and does not inherit
the new run's freshness; age is recomputed against the new `as_of`. Revived
material arrives through **staleness review**, marked as revived plus its own
staleness state, never as fresh. **Locators are re-verified at pull time for
load-bearing claims only** (`OD-M-11`): a load-bearing pulled claim whose locator no
longer resolves may not be served as looked-up — the Q22 pattern applies, and
irreproducible becomes `REASONING`. Re-verifying every pulled source would cost a
fetch per source for evidence that is mostly not carrying the answer; downgrading
everything by default would understate good evidence until someone checked. And the
pull carries **a flat declared cap, printed where it is used** (`OD-M-12`), in the
style of the topic cap and the regeneration cap; usefulness-based selection is
recorded as a later upgrade, since it needs enough linked history to compute
usefulness in the first place.

### 17.5 How memory enters a run

**Requirement M-17 (a prior verdict is not evidence for its own claim)** `RULED(DR-061 · OD-M-14)` · Three
things arrive in a pull and **only two are admissible**. The **resolver's outcome**
is evidence, with the resolver as its locator. The prior run's **harvested
sources** are evidence, re-verifiable at their own locators. The prior **verdict**
is **not** evidence — it is this system's own earlier opinion, and admitting it
would let a claim support itself across sessions, which is a self-reinforcing loop
that returns to its own conclusions regardless of the truth. This is a **typed
admissibility rule, not prompt guidance.**

**Requirement M-18 (the prior, typed)** `RULED(DR-061 · OD-M-15)` · A carried posterior is a **legitimate**
prior and an **illegitimate silent** one. `prior_basis` is typed with
`CARRIED_POSTERIOR` as a named member — recording source run, source version,
whether it settled, and its staleness at pull — and with **no `DEFAULT` and no
`ASSUMED` member**. The **ordering must be ruled, not left to the implementation**:
if the pull lands before Q5 the "genuine prior" is last session's posterior and
must say so; if after, the run has two priors and Q54's movement arithmetic must
know which one the delta is measured from.

**Requirement M-19 (memory shapes the search, not the conclusion)** `RULED(DR-061 · OD-M-16)` · Prior **open
triggers** become this run's watch list; prior **unresolved falsifiers** and
`UNFALSIFIED-AFTER-ROTATION` marks become query seeds and ignorance rows; prior
**error attribution** (Q62) becomes a targeted instruction to search where the last
run failed to look. This is the lowest-risk use of a retrieved case and the one
that most directly answers *"what should that change about how I answer questions
like this"* — because that is a statement about **method**, and method lives in AIM.

**Requirement M-20 (anti-anchoring)** `RULED(DR-061 · OD-M-18)` · Model behaviour under a conflict between
retrieved context and its own belief is **not stable across models or evidence
strengths**, so "the model will weigh the prior sensibly" is not a safe assumption
to design on. The minimum is: **Q5 executes before any pull**, so the stated prior
is genuine.

**Requirement M-21 (self-contradiction wakes the prior)** `RULED(DR-032 + DR-061 · OD-M-13)` · When
the prior verdict and the new verdict disagree, that is a genuine disagreement
between two of the system's own outputs, and DR-032 already rules how V3 treats
disagreement: **a fireable flag plus a certainty downgrade, never a silent
average**. A `CONTRADICTS_PRIOR` link serves as exactly that flag — and it also
**wakes the prior answer** as a revision trigger, because otherwise V3 can notice
that it contradicts itself and do nothing about it.

### 17.6 What is served, and where the model sits

**Requirement M-22 (the disclosure fact block)** `CARRIED-DESIGN` · Under DR-044 the machine
assembles: matched or not, tier, relation, who decided, the prior's
`{run, question line, answered-at, verdict, confidence band, staleness state}`,
the agreed and disagreed fields, what was actually pulled, the candidates found and
**not** linked, and an **unlink control** the asker can use to sever the link.

**Requirement M-23 (three blocking serve gates)** `CARRIED-DESIGN` ·

1. **No memory sentence without a match fact.** This bars fabricated familiarity at
   the text layer, where it would otherwise reappear after being barred at the data
   layer. No "this resembles questions you have asked before" may be composed from
   a similarity neighbour or an empty payload — **the composition model must have a
   match fact or it has nothing to say.**
2. **The tier and the difference must survive into the served text** whenever the
   match is not exact. "Builds on your earlier question" is **not adequate
   disclosure** of a match whose comparator differed; the difference statement is
   the part that makes the claim checkable — and it is also the part readers
   respond to.
3. **The staleness badge travels inside the memory sentence**, not only in a
   footer: a pulled answer under review is served as under review.

**Requirement M-24 (where the model's judgement sits)** `RULED(DR-061 · OD-M-21)` · Under DR-037's label law
Q61's HYBRID must name what code enforces. The model **interprets what the prior
outcome means** inside serve composition, checked by the conformance judge and the
three gates above. Any placement in which the model's output **changes the run**
(seeding queries, setting triggers, flagging contradiction) must be a **typed
object**, validated against its enum, with **adjustments refused unless traceable
to a pulled artifact** and their count capped — and it is the only placement where
a false merge can alter the answer rather than only the narration.

**Requirement M-25 (cold-start proofs)** `RULED(DR-061 · OD-M-24)` · With an empty settlement
store every tier returns no match and **no memory sentence is composed**. Two
acceptance tests make that checkable rather than asserted: an **inertness proof** —
with an empty store, a run produces byte-identical output to the same run with the
mechanism disabled, because any divergence is fabricated familiarity — and a
**firing proof** — inject one synthetic prior settlement whose binding matches, and
assert the link appears, the disclosure is served, and the whole path replays with
no model in the replay.

### 17.7 The shared substrate

**Requirement M-26 (one store, two indexes)** `CARRIED-DESIGN` · Retrieval and the scorecards are **one store with two
indexes, not two stores**. Retrieval reads it as an index ("find the prior run for
*this question*"); the scorecards read it as an aggregation ("how did this model do
on *this class*"). Both resolve task class from the **same** Q7/Q8 taxonomy. A
parallel memory store drifts from the settlement store within one schema migration,
and then "was I right?" answers differently depending on which reader asked.

**Requirement M-27 (the matcher is DR-016's missing trigger)** `CARRIED-DESIGN` · The matcher is also **the trigger DR-016 presupposes**:
DR-016 says an archived question is auto-revived by the next query, and the match
ladder is how the system recognises that a new query is about an archived question.
Which tiers may revive an archive is an open decision (§23 `OD-M-17`).

### 17.8 The design's open questions

The **24 sharp questions** this mechanism leaves for V — the key's identity
fields, which tiers may auto-link, where the middle band goes, whether similarity
is permitted at all, how the alias table gets its rows, whether `NULL` is
agreement, link versus merge, which error is dominant, pull depth, the prose bar,
locator re-verification, the pull cap, push as well as pull, verdict
admissibility, the carried prior and its ordering, whether memory shapes AIM,
which tier revives an archive, blind-first, the negative disclosure, whose memory
the store holds, where the interpreting model sits, whether a match reduces work,
the clustered `n`, and the cold-start acceptance tests — are listed **once** in
§23, block B (`OD-M-01 … OD-M-24`), each with its owning artifact, and close at V's
artifact review.

---

## 18. Composition and product topology (DR-030)

*In plain words: there is one piece of arithmetic, one graph, and one place answers
leave the system. Not three of each that disagree.*

**Requirement O-1 (J1 — one scoring engine)** `RULED(DR-030)` · The re-specified DF-QuAD — typed
labeled arrows, the M1–M4 structural rules, and the per-parent operator — **is the
single scoring engine for WEIGH and COMPOSE** (Q45–Q50). **One math, receipts
everywhere.** There is no second scoring path anywhere in V3.

**Requirement O-2 (J2 — one graph)** `RULED(DR-030)` · SPLIT's children and defeaters **are** the
debate graph's nodes and typed edges; battery stages operate on that object
directly. There is no conversion layer, because there is nothing to convert
between.

**Requirement O-3 (J3 — one serving truth)** `RULED(DR-030)` · SERVE reads a **new battery serve
layer built on the execution ledger**, and the debug view's content is
re-specified as that layer's **internal debug facet** — an operator surface, not a
second answer.

**Requirement O-4 (the structural rules that make the arithmetic honest)** `RULED(DR-030)` · The
minimal set is **M1–M4 plus F1**, specified in the manifest §4.2(e)–(i) and not
restated here:

| Rule | One-line statement | Which defect it closes |
|---|---|---|
| **M1** | Base score comes from a judgement, or the node contributes nothing — **no default at any layer**. | unjudged-node fallback |
| **M2** | The combination operator is **declared per parent**; undeclared ⇒ no parent number. | the 9.96× undeclared join |
| **M3** | **Provenance cluster collapse** — each cluster contributes once, at its strongest member. | paraphrase-inflated scores |
| **M4** | **Way-of-knowing ceiling** on the base score — a **cap, never a multiplier** — plus a serving-band rule. | provenance-blind confidence |
| **F1** | **Semantic-restatement flag**, non-gating: it changes no number. | the visible residue M3 cannot reach |

**Requirement O-5 (position is already in the arithmetic — do not pay for it
twice)** `CARRIED-DESIGN` · A stranded leaf already transmits less to its parent than a corroborated
one, because that is what the recursion does. **Any factor that re-encodes graph
position into a base score or an arrow strength double-counts it.** What is missing
is not a weight but a **per-node position label** travelling with the number, so a
reader can see the difference the arithmetic already made.

**Requirement O-6 (corroboration is not a bonus)** `CARRIED-DESIGN` · The aggregation already rewards
multiple supporters. **Independence is the licence the operator is assuming, and
where it fails the cluster collapses** — a dependence *discount*, never an
independence *bonus*.

**Requirement O-7 (organ ownership)** `RULED(DR-056)` · The organ↔stage table is
**FINAL — no longer vetoable**: scorer → WEIGH + COMPOSE; judge contract → WEIGH;
graph shapes → SPLIT object and substrate; spawn plumbing → SPLIT mechanics;
ledger → all stages, SERVE reads. **LOCK, ROUTE, AIM, HARVEST, RUN, CROSS and
SETTLE are greenfield** under the eight house rules. DR-056 closes DR-030's
vetoable clause, so a lens disagreeing with a stage assignment is now disagreeing
with a ruling, not with a derivation.

**Requirement O-8 (the labeled arrow, and its perimeter)** `RULED(DR-035)` · V3 takes the
**labeled-arrow idea** — explicit supports/attacks relations carrying a strength,
plus per-node uncertainty as a first-class shape — as design reference, and leaves
behind the source experiment's score-walking code, its loop handling, and its own
default values. An arrow may target a node that is **not** the source's structural
parent, which is what makes a defeater expressible at all — and which is why §10.5's
loop-free construction law exists.

---

## 19. The eight house rules, carried as required behaviours (DR-029)

*In plain words: eight standing product laws the current engine already lives by.
All eight carry. Where the battery has a stronger successor, the successor governs
and the house rule is the floor it may never fall below.*

**Requirement H-0** `CARRIED-DESIGN` · Each rule is a **testable gate**, not a slogan: a house rule
that cannot be expressed as a gate is a house rule V3 cannot prove it kept. The
rule texts and their V2 provenance are in the manifest §11; below is what each
**obliges of V3** and how it interacts with this document.

| # | Rule | Standing in V3 | Where it binds here |
|---|---|---|---|
| **H1** | **Provider-agnostic agents** — all scoring, debate, evidence, metareasoning and orchestration code calls **one provider interface**, never a model SDK or CLI directly. | **No battery successor — the rule governs.** | It is the **precondition for DR-013**: "different maker = different lineage" is only enforceable if provider identity is a first-class configured value rather than an import (§14). |
| **H2** | **A second provider is addable through configuration** alone, without changing agent, scorer, evidence or semantics code. | Successor governs (blind-verification coverage, DR-019 knob 3; DR-014's no-critic path); **rule is the floor**. | The battery **requires** a second lineage on most runs; DR-014's cap-label-lift is the fallback, **not the plan** (§14). |
| **H3** | **Pure propagation** — the graph-scoring math contains no model calls, no file or network I/O, no clock, no randomness and no database access. | **No battery successor — the rule governs, and DR-034 makes it structural.** | **Replay with no model in the path is impossible unless the math is pure** (§12.5). This is a standing gate, not a style note. |
| **H4** | **Swappable semantics** — the default gradual semantics sits behind a strategy interface another implementation can replace. | **No battery successor, and now doubly load-bearing.** | The rival operator must be **computable on demand** so its reading can be served beside the deciding one (Q47, §10.1), and the operator identifier must be a **recorded run input, never a source literal** (§18). |
| **H5** | **Every leaf is gated by the evidence subsystem** — evidence leaves that cite sources get their base scores from the evidence pipeline, not from a model's assertion. | Successor governs (DR-009's mixed rule; DR-020 knob 7's citation routes; M4's ceiling); **rule is the floor**. | §7.2, §7.3, §18. |
| **H6** | **Anonymize debate sources** — agent identity is stripped before another role reads prior turns. | Successor governs (blind verification, DR-013/DR-014); **rule is the floor**. | Anonymization is the mechanism that makes "blind" **true rather than merely claimed** (§14), and it is also the prevention half of the symmetry design (§8, A-11). |
| **H7** | **The skeptic certifies that no unaddressed attack remains** — a node is not converged until that check passes. | Successor governs (the hidden-objection serving gate; the residual-objection requirement); **rule is the floor**. | **Present in the graph and absent from the surface blocks serving** (§12.2, Q53) — the repair for a computed strongest objection being discarded. |
| **H8** | **Confidence-driven, cost-soft** — stop conditions are driven by convergence, unresolved caveats and skeptic certification; **cost is a soft tie-breaker**, never a driver. | Successor governs (DR-021 knob 9's enrichment-only budget skips; DR-020 knob 5's bounded regeneration; the abstention matrix); **rule is the floor**. | §21, §9.1, §4.1. **A budget may never deactivate a correctness or safety row** — this is the answer to "may a cost ceiling deactivate a row whose predicate is TRUE?" |

**Requirement H-9 (convergence, specifically)** `RULED(DR-029)` · Run-to-run convergence carries the
measurable half of H8: **typed non-comparison reasons** (first evaluation,
semantics changed, topology changed, strengths unavailable), a maximum-delta
comparison over the overlapping node set, a **refusal to compare across a semantics
change**, and an explicit changed-evidence-topology detector. Its epsilon and
defaults are register rows drawn fresh (DR-023).

**Requirement H-10** `RULED(DR-029)` · The three rules with no battery successor — H1, H3, H4 —
**survive explicitly and are enforced by battery machinery**. They are the ones most
likely to be dropped as "internal architecture", and they are precisely the ones
DR-013, DR-034 and Q47 depend on.

---

## 20. Stack constraints imposed by V (DR-024)

Requirements constrain behaviour only (DR-005) — **except** where V imposes a
constraint. There is exactly one such constraint today.

**Requirement W-1 (Postgres, including observability)** `RULED(DR-024)` · V3's persistence is
**Postgres**, not SQLite, and this **includes the observability layer**: score
provenance, the execution-ledger artifact store, and the debug views. **There is no
second store for observability.** DR-034's replay law sits directly on top of it:
the frozen records the replay reads **are** these records.

**Requirement W-2 (start from scratch)** `RULED(DR-024)` · V2's production database is gone and does
not matter. Historical V2 runs are unrecoverable, and nothing in V3 depends on
recovering them.

**Requirement W-3 (one store, two indexes)** `CARRIED-DESIGN` · The settlement store, the model
ledger (§16.5) and the cross-run memory index (§17.7) are **one store with
multiple indexes, not parallel stores**. A parallel store drifts within one schema
migration, and then "was I right?" answers differently depending on which reader
asked.

**Requirement W-4 (keep the property, drop the accident)** `CARRIED-DESIGN` · Several carried
behaviours exist only because of SQLite's single-writer constraint. **The
constraint does not carry; the property it protected does** — never hold a write
lock across a model call; isolate per-member failures; leave a crash mid-batch with
completed work durable and resumable. One accident carries **nothing**: any
storage-engine-specific ordering tiebreak is replaced by a **total, deterministic
ledger ordering**, which is a DR-034 precondition (§12.5, S-21).

**Requirement W-5 (the flag register is drawn fresh)** `RULED(DR-023)` · V3's flag and configuration
register is **designed anew and ratified by V before production** (DR-023). Every
numeric constant inherited from research is **source material for a register row
and nothing more** — under DR-033 there is no obligation to reproduce any V2 value.
The knobs already ruled (§4) are **register entries in waiting, not open
questions**.

---

## 21. Abstention — pricing "I don't know" (DR-010, DR-011, DR-012)

*In plain words: refusing to answer is sometimes the right move and sometimes a
cop-out. The engine is told, per kind of question and per how much is riding on it,
how expensive a refusal is relative to being wrong — and it is checked against that
number afterwards.*

**Requirement N-1 (the scale means one thing)** `RULED(DR-010)` · **Price = cost(abstain) /
cost(wrong)**, strictly between 0 and 1. A **low** price means abstention is cheap
and is permitted readily; a **high** price means abstention is nearly as costly as
error and is strongly discouraged. The scale is not a confidence, not a threshold,
and not a quality score.

**Requirement N-2 (it is a matrix, not a number)** `RULED(DR-011)` · The price **varies by question
class × product-risk tier** — not flat, and not class-only.

**Requirement N-3 (the seeded provisional matrix)** `RULED(DR-012)` · Risk tiers **casual /
standard / high-stakes**. Standard-tier seeds: **lookup 0.8 · measurement 0.7 ·
comparative 0.55 · causal 0.5 · predictive 0.4 · value 0.15**. Multipliers:
**high-stakes ×0.6**, **casual ×1.3** (capped below 1). These values are
**provisional by design**; recalibration is a Stage-11 job **requiring V's
sign-off**, never an automatic drift.

**Requirement N-4 (every served answer names its cell)** `RULED(DR-012)` · The cell is printed with
the answer — this is a naked constant that can move a verdict, so it is printed
where it is used.

**Requirement N-5 (the over-abstention check)** `RULED(DR-010)` · Q56 compares the observed
abstention rate against the declared cell. **A rate inconsistent with the declared
price is a named battery defect**, reported as such. Over-abstention is not
caution.

**Requirement N-6 (unpriced is a state, not a default)** `CARRIED-DESIGN` · A run whose cell cannot
be resolved is marked **`UNPRICED`** and may not claim over-abstention compliance.
`UNPRICED` never means zero, and it never means the check passed.

**Requirement N-7 (the five kinds are the vocabulary)** `RULED(DR-044 + DR-051)` · Every abstention is one of
**not searched · searched and found nothing · measured and inconclusive · not
runnable · a value choice** (§12.3). **An abstention rendered as a mid-range number
is a rule violation** — the number cannot be distinguished downstream from a
measured middling confidence, which is the defect class this whole spec exists to
close.

**Requirement N-8 (a value-conditional answer is not an abstention)** `RULED(DR-017)` · Flow A
answers (§15). It must not be priced against the `value: 0.15` cell, or the engine
would be penalised for the most honest output it can produce.

### 21.2 The run cost envelope (DR-052)

*In plain words: the engine has caps on how many topics it opens and how many times
it retries. It had no cap on all of them multiplied together — and because the
expensive steps are the correctness steps, and correctness steps may never be
skipped for money, a big question had no legal way to stop. An implementer facing
that either invents an illegal skip or times out mid-answer.*

**The product that had no bound.** children × cold-reader restatements × falsifier
rotations × the system defeater model × the rival carver × per-node judges (× panel)
× always-on CROSS at high stakes × the checker rows × leverage and fragility
recomputes × the rival operator × composition × conformance × recompose. Every
factor there is individually capped or bounded. Their product was not.

**Requirement N-9 — the envelope exists and is visible** `RULED(DR-052)` · **Every
run gets a visible call/cost envelope derived from asker depth × risk tier.** The
asker can see it before and during the run; it is not a hidden operational limit.

**Requirement N-10 — exhaustion is typed and terminal** `RULED(DR-052)` · On
exhaustion the run takes, in order: **typed enrichment skips first**, then a **hard
stop that serves the already-verified components** with an **`ENVELOPE_EXHAUSTED`**
mark. **Never a silent timeout.** `ENVELOPE_EXHAUSTED` is a condition mark, not an
abstention kind (§12.3).

**Requirement N-11 — the protected core** `RULED(DR-052)` · **Never skippable,
whatever the envelope says:** provenance · abstention typing ·
standard-and-above blind verification · citation routes · **serve-conformance**.
The last is the addition that matters: conformance is the only machine enforcement
standing between a model's prose and a reader, and without naming it, budget law
permitted skipping it and recording a legal `SKIPPED-BY-BUDGET` while the serving
philosophy quietly stopped operating.

**Requirement N-12 — orthogonal to the budget knob** `RULED(DR-052)` · The envelope
and the budget-override knob are two different instruments. The knob classifies
**which rows** may be skipped; the envelope bounds **the whole run's product** and
provides a terminal. Neither substitutes for the other.

**Requirement N-13 — no monotone mid-run growth** `RULED(DR-052)` · The
stranger-sample rate **freezes at run start**; the ratchet applies to the **next**
run. A rate that ratcheted up mid-run made the run's own cost monotone
non-decreasing while it was executing, which is precisely what an envelope cannot
absorb.

**Requirement N-14** `CARRIED-DESIGN` · Which rows are correctness and which are
enrichment must be classified **per row, once**, and the classification is part of
the row's contract rather than an operational setting. Rows whose classification is
still open are named in §23 (`OD-A-04`).

---

## 22. Acceptance — how V3 is judged (DR-047, DR-034, DR-032)

**There is no race.** No formal race, no frozen victory criteria, no control-arm
ceremony, no matched-cost law, no V2 pin. Humans compare outputs informally at
will, and V2 remains a reference. Acceptance is the **Quality Charter's**
(artifact 4), whose five clauses this spec is written to satisfy:

| Charter clause | What this spec owes it |
|---|---|
| **1 — the best dialectical engine to date, judged by V on outputs** | Every chapter's requirements are behavioural and observable in an output. |
| **2 — human-oriented answers; the stranger law is the acceptance test** | R9 as amended (§3.12), the whole-graph coverage knob (§4 row 18), serve composition over pure render (§12.1), and the plain-language riders on Q27/Q28 (§9.2). |
| **3 — clean, maintainable codebase** | One scoring engine, one graph, one serving truth (§18); pure propagation (§19 H3); the provider interface (§19 H1). |
| **4 — NO ORPHANED MODULES: everything shipped is reachable and called** | Every honesty surface traces to a requirement and every requirement to a surface (§12.6, S-25); the ten never-called surfaces and the dual-transport seam die; **dead code eating tokens and processing is indicted at code level**. |
| **5 — research-upgradeable: validated findings land at each step without re-architecture** | Provisional values are declared provisional with a named recalibration owner (§4, §21); coverage and citation gates are staged to activate on evidence (§4 rows 13–14); the "what to add later" ladders are recorded rather than pre-built. |

### 22.1 The checkable launch gates

| Gate | Requirement | Source |
|---|---|---|
| **Replay ceremony** | One independent replay of recorded runs **passes exactly**, with no model in the replay path. | DR-034 |
| **Continuous replay self-test** | Every servable number recomputes from frozen records, tested continuously — not only at launch. | DR-034 |
| **Ledger completeness** | Every executed thing has a row; the digest is user-visible; **no served sentence implies a check the ledger says did not run**. | DR-027 |
| **Disagreement flag fires** | V3's judge-disagreement flag **demonstrably fires where V2 provably could not**. *The exact bar is a charter acceptance item, §23 `OD-C-02`.* | DR-032, DR-047 |
| **Symmetry fires both ways** | A deliberate-asymmetry fixture emits `ASYMMETRIC` with exact remediation targets; a stripped-telemetry fixture emits `UNINSTRUMENTED` and never `SYMMETRIC`. | §8, A-12 |
| **Cold-start exit executes** | One synthetic settled outcome moves a judge weight off its cold value, end to end and replayable. | DR-046, §16.4 |
| **Memory inertness + firing** | Empty store ⇒ byte-identical to mechanism-disabled; one injected prior settlement ⇒ a visible link, fully replayable. | §17.6, M-25 |
| **Multi-maker critique** | **Standard-and-above tiers execute real different-maker critique from day one.** Single-maker is legal only as labelled degraded operation under DR-014's caps. | **DR-055** |
| **SERVE terminates** | Fixtures for each terminal of the state machine: R9 fail, Q53 fail, one conformance fail that recomposes to a pass, a second that reaches components-only with a DEFECT badge, and a Q51 provenance fail. | **DR-049** |
| **Envelope terminates** | A run driven to envelope exhaustion serves verified components with `ENVELOPE_EXHAUSTED` — never a silent timeout, never a blank. | **DR-052** |
| **Leverage bound holds** | A graph engineered to re-fire Q46 twice on one parent serves with `LEVERAGE_UNRESOLVED` rather than looping. | **DR-050** |
| **Cycle law fires at all three layers** | A cycle-closing edge is refused at construction, rejected at write, and produces a typed error if it reaches compute. | **DR-056** |
| **Hard serve blocks fire** | One firing fixture per blocking path: **Q51 locator block · Q53 hidden-objection block · R9 serve block · DR-014 cap path · DR-015 STALE badge path · the budget-skip marker path.** A blocking gate with no firing demonstration is an untested claim. | `CARRIED-DESIGN` (Grok F5) |
| **Deferred gates are not shipped dark** | The citation hard-kill (live only once the quote matcher validates) and the coverage gate (live only once outcome data sets a threshold) are **not shipped as unreachable code**. Shipping a gate that cannot fire is the defect this pack exists to prevent. | DR-020 knobs 7–8, DR-047 clause 4 |
| **Stranger coverage** | Load-bearing nodes exhaustively restatable; sampling derived from the asker's parameters; the rate **frozen at run start**, ratcheting on the **next** run. | DR-018, DR-019, DR-052 |
| **Overlay detachment** | Recompute every strength with the value overlay detached and assert byte-identity. | DR-017, §15.3 |
| **Zero-call proof** | Each MACHINE row is proven to make **zero model calls**. | DR-037, §5.1 |

**Requirement Z-1 (the standing discipline behind all of these)** `RULED(DR-063)` · **A check is not
accepted until it has been made to fail on purpose.** A gate that has never been
observed to fire both ways is not evidence that the system is healthy; it is an
untested claim. This is the generalisation of DR-032 and it applies to every gate
in this document.

**Requirement Z-2 (ground truth)** `RULED(DR-033)` · V3's math is tested against **published
literature vectors** (external ground truth, zero contamination) plus **property
tests of V3's own rules**. **No conformance test against V2 exists at any level.**
Details: manifest §12.

---

## 23. The ratified register — closed record of all 51 decisions

**Status: CLOSED.** DR-061 ratified **all 51 rows wholesale**, adopting each row's
recommended option **by reference to the option text recorded here**. This section
is therefore no longer a queue — it is the **authoritative record of what was
adopted and why**, and it is what the `RULED(DR-061 · OD-nn)` tags throughout the
body point at. **Open count: 0.**

The seven rows V was offered a pull-out on — `OD-A-06`, `OD-A-11`, `OD-M-03`,
`OD-M-04`, `OD-M-05`, `OD-M-12`, `OD-M-20` — were flagged as the non-obvious ones
and V declined the pull-out, ratifying them with the batch. `OD-S-05` was closed
separately and consistently by DR-057.

Each row keeps its four parts — **what it is · why it matters · options ·
recommendation** — because the ruling adopted the recommendation *as written here*,
so the alternatives and their trade-offs are part of the authority trail rather than
discardable scaffolding. Every row is stamped with the option that became law.

| Block | What it covers | Rows | Status |
|---|---|---:|---|
| **A** | Fairness instrumentation, scorecards and model routing | 19 | RATIFIED — DR-061 |
| **B** | Cross-run memory — recognising a question asked before | 24 | RATIFIED — DR-061 |
| **C** | Verdict model and the fire bar | 2 | RATIFIED — DR-061, refined by DR-063 |
| **D** | Residuals this spec surfaced | 6 | 5 RATIFIED — DR-061; `OD-S-05` closed by DR-057 |
| | **Total** | **51** | **0 open** |

**One deferral survives inside a ratified row, by that row's own text**: `OD-C-01`
ratifies the verdict *model* while its numeric band thresholds land at V's
flag-register ratification (DR-023, and DR-063's VR-2). That is not an open register
row; it is a ruled decision with a named later step.

**Sibling registers.** The carryover manifest's organ register was ratified
wholesale by **DR-062** and stands at **0 open** (17 rows closed). The charter's
register was ratified by **DR-063**. The UI contract's **30 presentation cells are
DELEGATED to mockup review by DR-064** — counted and consequence-annotated there,
ruled against actual mockups during the UI build phase, and explicitly **not** a
requirements-mission dependency.

### 23.A Fairness instrumentation, scorecards and routing — 19 rows

*Owner: artifact 1 (this spec), §8 and §16.*

**`OD-A-01` — RATIFIED (DR-061) · adopted: no fairness scalar — census, missing-check list and repair list only — Does the fairness check produce a number, or only a work list?**
**What it is.** When the engine compares how hard it checked the evidence for an
answer against how hard it checked the evidence against it, the comparison produces
a census (how many items on each side got each kind of check), a list of check
kinds one side got and the other did not, and a repair list naming the exact items
still owed a check. The question is whether it *also* emits a single fairness score.
**Why it matters.** A score is comparable across runs and fits in a badge; a work
list tells you what to actually do. A score also implies a magnitude the records do
not contain.
**Options.** (a) **No scalar** — serve the census, the missing-check list and the
repair list only. Honest, but nothing to trend over time. (b) **A scalar, with V
naming it and the hard facts behind it** — for example "fraction of items on the
weaker side missing at least one check kind the stronger side received". Trendable,
but every such number is a modelling choice that will be read as a fairness measure.
**Recommendation.** (a). Nothing in the record has the magnitude a fairness score
would claim, so under the no-invented-measurements law any scalar has to be
invented. If V wants one, V names it.

**`OD-A-02` — RATIFIED (DR-061) · adopted: order both ledger stamps — Are the two new record stamps ordered?**
**What it is.** Two fields would be added to every action the engine records: *which
item this action was about*, and *which side that item was on at the moment the
action ran*. Without both, the engine cannot group its actions by side, so it cannot
compare the two sides at all.
**Why it matters.** Two checks depend on it. The fairness comparison cannot run. And
the check that asks *"is the piece carrying this answer also the piece I checked
hardest?"* — which halts recombination and sends a thinly-checked load-bearing piece
back for more work — is already ratified as pure machine work, and it needs exactly
the same per-item verification record. Without the stamps, a ratified check is dead
code on day one.
**Options.** (a) **Order both stamps**, and both checks become live. (b) **Order
neither**, and record in writing that the leverage check ships knowingly
non-executable.
**Recommendation.** (a). The two checks are one schema ask, not two.

**`OD-A-03` — RATIFIED (DR-061) · adopted: side-at-the-time, reclassifications on a separate line — Which "side" does the comparison use: the side an item was on when it
was checked, or the side it ended up on?**
**What it is.** An item admitted as supporting the answer can, after examination,
end up attacking it. The engine can compare the two piles using either the side
recorded at the moment each check ran, or the final side.
**Why it matters.** They measure different things. Motivated under-checking happens
*while* deciding how hard to look, so the belief held at that moment is the one that
would show it. Final-stance grouping instead measures whether the finished piles
were checked evenly, which can look fair even when the process was not.
**Options.** (a) **Side-at-the-time**, with items that changed sides reported on a
separate line. (b) **Final side.** (c) **Both, served side by side** — most
informative, roughly double the presentation, and a reader must be told which is
which.
**Recommendation.** (a). Both stamps are recorded either way, so this choice can be
revisited without new instrumentation.

**`OD-A-04` — RATIFIED (DR-061) · adopted: correctness — never budget-skippable — Is per-item verification telemetry a correctness row or an enrichment
row?**
**What it is.** The record of what the engine actually did to check each piece of
evidence — which searches ran, what was opened in full versus previewed, which
quotes were compared character by character. Under the cost envelope, correctness
rows can never be skipped when a run runs short; enrichment rows can be, wearing a
visible skipped-for-budget marker.
**Why it matters.** If it is enrichment, a long run can legally stop writing it —
and then the fairness comparison and the leverage check silently become
uninstrumented on exactly the expensive runs where bias is most likely.
**Options.** (a) **Correctness** — never skippable; the run rather hits its envelope
and serves components. (b) **Enrichment** — skippable with the visible marker, at
the cost that the two dependent checks go dark under load.
**Recommendation.** (a), on the grounds that a check which disappears under pressure
is the dead-check class this pack exists to eliminate. Noting the real cost: it
makes the envelope bind sooner on big runs.

**`OD-A-05` — RATIFIED (DR-061) · adopted: cap and label, not halt — When the fairness check cannot run for lack of records, what happens
to the answer?**
**What it is.** If the checking record is incomplete, the engine will not claim the
two sides were checked evenly — that much is ruled. What is not ruled is what
becomes of the answer itself.
**Why it matters.** This is the difference between a reader getting a usable answer
with an honest gap named, and getting nothing.
**Options.** (a) **Cap and label** — serve the answer, withhold the fairness claim,
cap how confident the answer is allowed to sound, name the missing checks as the
condition that would lift the cap, and re-score if they are later run. Same pattern
already used when no independent critic was available. (b) **Halt** — refuse to
serve. Safest-sounding, but it converts a missing record into a total failure, and
readers get nothing. (c) **Label only, no cap** — cheapest; the answer sounds as
sure as it would have with the check done, which is the flattering option.
**Recommendation.** (a).

**`OD-A-06` — RATIFIED (DR-061) · adopted: a model limb for item identity and side only — May a model help at all with identifying items and sides?**
**What it is.** Two records may describe the same underlying piece of evidence in
different words, and an item's side is not always obvious from typed fields. That
matching is a semantic judgement. Separately, the ruled design already has a model
explaining *why* records are missing and grading the effort, served openly as
model-authored. This row is only about the identity-and-side limb.
**Why it matters.** Without it, imperfect records produce a fragmented comparison —
the same item counted twice, or an item with no side, which forces the whole check
into "not instrumented".
**Options.** (a) **No model limb at all** — the comparison uses only typed fields
and reports "not instrumented" more often. (b) **A model limb for item identity and
side only** — typed, checkable, re-runnable, of the same kind the engine already
uses elsewhere. (c) **Nothing extra** — rely solely on the already-ruled remediation
model.
**Recommendation.** (b), narrowly scoped and typed.

**`OD-A-07` — RATIFIED (DR-061) · adopted: both — detection after, stance-blind appraisal before — Prevention as well as detection: should the appraiser be told which
side an item favours?**
**What it is.** The comparison above detects unequal effort *after the fact*. It
cannot detect the case where the same checklist is filled leniently for the pile you
like and harshly for the one you do not — the records look identical and the
substance differs. Prevention means stripping the side label out of the appraisal
prompt so the appraiser cannot tell which pile an item helps.
**Why it matters.** It is the only thing that reaches that case at all.
**Options.** (a) **Both** — detection after, blinding before. (b) **Detection only**
— cheaper, and leaves the lenient/harsh case permanently unreachable. (c) **Blinding
only** — prevents the interpretation gap but not the simpler failure of handing one
side fewer items to appraise.
**Recommendation.** (a). The machinery already exists — blind verification, blind
comparison and anonymized debate are all ruled — so for a machine pipeline this is a
prompt-construction change rather than new cost.

**`OD-A-08` — RATIFIED (DR-061) · adopted: adopt as a flag with its limitation printed; never a bias verdict alone — Should the engine flag when one side is dismissed more often than the
other, among items that look alike on the record?**
**What it is.** Take only items with the same recorded profile — same access depth,
same evidence class, same relevance verdict — and compare how often each side is
excluded, bounded, zero-weighted or capped. A difference is a measured fact about
the *judgements*, not about the effort.
**Why it matters.** It is the one measurable trace the lenient/harsh case leaves.
But it cannot prove bias: the two piles may genuinely differ in quality on things
the record does not capture, and the engine's own earlier decisions determine which
items ever reach the comparison.
**Options.** (a) **Adopt as a flag** that routes to a human or a re-check, with its
limitation printed beside it and never producing a bias verdict on its own.
(b) **Reject** — the inference is too weak to serve. (c) **Defer** until outcome data
exists to calibrate it.
**Recommendation.** (a), flag only.

**`OD-A-09` — RATIFIED (DR-061) · adopted: require both fixtures — Must the fairness check be proven able to fire before it counts as
built?**
**What it is.** Two test runs shipped with the check: one deliberately lopsided (the
against-pile only previewed, the for-pile opened in full) which the check must catch
and name; and one with the record stamps stripped, which must come back "not
instrumented" and must never come back "even".
**Why it matters.** A check nobody has watched fail is an untested claim. This exact
failure has already been indicted once in this project: a live gate whose threshold
was mathematically unreachable against its own data.
**Options.** (a) **Require both fixtures** before the row counts as implemented.
(b) **Do not require them** — faster to ship, and the check's liveness is unknown.
**Recommendation.** (a). Both are cheap and neither depends on anything outside V3.

**`OD-A-10` — RATIFIED (DR-061) · adopted: two tiers with a hard wall — Should the model track record keep two kinds of fact permanently
separate?**
**What it is.** Two very different things can be measured about a model. **Process
facts** need no ground truth and are available immediately — how often its output
fails to parse, how often it times out, what it costs, how consistent it is on
identical input, whether it changes its answer when two options are swapped, whether
it favours its own writing. **Capability facts** need real settled outcomes — was it
right, and how well-calibrated was its confidence — and those take a long time to
accumulate.
**Why it matters.** Blending them yields a number that looks like "how good is this
model" but is mostly "how reliably does it return valid JSON". That number would
then feed weighting and routing.
**Options.** (a) **Two tiers with a hard wall**, never combined into one figure, and
every cell labelled with what it rests on — measured outcome, measured process,
external benchmark, or not measured at all, with no "assumed" and no "default"
member. (b) **One blended tier** — simpler to present, and permanently ambiguous.
**Recommendation.** (a).

**`OD-A-11` — RATIFIED (DR-061) · adopted: weighting only in the served lane for v1 — Does the track record choose which model does the served work, in
version 1?**
**What it is.** Weighting and diversity-routing from day one is ruled, as is
hard best-model routing once a class has enough settled outcomes. What is not
spelled out is how far routing reaches into the lane that produces the answer the
user actually reads, before those thresholds are met.
**Why it matters.** Weighting changes how much each model's opinion counts while
every model still runs on everything — so the engine keeps learning about all of
them. Routing stops the unrouted model producing data on that class, and then
nothing in the logs can say what it would have done. Selection quietly destroys the
measurement that justified it.
**Options.** (a) **Weighting only** in v1 — no selection in the served lane.
(b) **Tie-break only** — the track record breaks exact ties in a choice already
fixed by lineage, availability and cost. (c) **Soft routing** with a forced
exploration share. (d) **Hard routing** — best cost, worst measurement.
**Recommendation.** (a) for the served lane in v1, which is also the least
disruptive reading of the existing ruling.

**`OD-A-12` — RATIFIED (DR-061) · adopted: mandatory exploration floor with logged propensities — If any routing ships, must the engine record how likely each choice
was?**
**What it is.** When a router picks a model, it can record not just what it picked
but the probability it would have picked each alternative. That recorded probability
is what later lets the engine estimate how the unrouted models would have done.
**Why it matters.** Without it, and without a genuine exploration share, the track
record freezes: the routed model keeps accumulating data, the others accumulate
none, and the comparison that drives routing stops updating while continuing to look
authoritative.
**Options.** (a) **Mandatory** — a non-zero exploration share per live class, with
the probability recorded per decision. (b) **Not required** — accept a deterministic
router and accept that what the unused models would have done becomes permanently
unknowable, not merely uncertain.
**Recommendation.** (a).

**`OD-A-13` — RATIFIED (DR-061) · adopted: separate the lanes; pay the standing panel cost openly — Should measurement come from a separate lane than the served answer?**
**What it is.** The engine already runs a panel of models from different makers to
judge nodes, and already requires an independent critic. If routing narrows *which*
models produce the served answer, the panel can be kept **uniform** — every model
still judging everything — and the track record computed from the panel rather than
from the served lane.
**Why it matters.** It is the clean fix to the previous row's problem: selection
cannot starve measurement if measurement does not come from selection. The cost is
explicit and permanent — panel calls keep running on classes the router has stopped
using.
**Options.** (a) **Separate the lanes** and pay the standing panel cost.
(b) **Measure from the served lane only** — cheaper, and the measurement narrows as
the routing narrows.
**Recommendation.** (a), with the standing cost named openly rather than absorbed.

**`OD-A-14` — RATIFIED (DR-061) · adopted: exempt at every tier — Is the critic lane exempt from track-record routing, at every tier?**
**What it is.** Standard-and-above critique must come from a genuinely different
maker from day one — that is ruled, and it means routing cannot narrow the critic
lane there. This row is what remains: whether the same exemption applies at the
casual tier.
**Why it matters.** Independence is a *structural* property, not a quality one.
Routing critique to whichever model scores best converges the critics onto one
lineage, which is exactly the property the different-maker rule exists to protect.
**Options.** (a) **Exempt at every tier** — the critic is always chosen for
independence, never for score. (b) **Routable at the casual tier only** — cheaper
casual runs; casual critique may converge on one maker.
**Recommendation.** (a). The cost saving at the casual tier is small and the rule is
easier to hold when it has no exceptions.

**`OD-A-15` — RATIFIED (DR-061) · adopted: fall back to the prior rule on overlap — How much evidence must a track-record cell carry before it may decide
anything, and what happens when two are too close to call?**
**What it is.** Each cell is a rate measured on a finite number of settled cases, so
it carries a range of uncertainty, not a point. Two models' ranges frequently
overlap.
**Why it matters.** Ranking overlapping cells is ranking noise. Concretely: with
around 50 settled cases each and no real difference between them at all, the
best-looking cell among a normal-sized grid will still show roughly a 15-point
apparent advantage about half the time.
**Options.** (a) **Fall back to the prior rule** — when the ranges overlap, decide by
lineage, availability and cost instead, and say so. (b) **Take the point estimate** —
simple, and systematically picks the luckiest cell. (c) **Randomize between the
overlapping candidates** — unbiased, and produces unexplainable variation between
runs.
**Recommendation.** (a).

**`OD-A-16` — RATIFIED (DR-061) · adopted: displayable with full provenance; tie-break eligible; never a coefficient — May published benchmark scores be used, and how far?**
**What it is.** Public leaderboard numbers for a model exist before V3 has measured
anything itself.
**Why it matters.** They are measurements of a different population under conditions
the engine cannot see or replay. There is a documented case of a headline benchmark
score roughly doubling through contamination while the underlying ability, measured
elsewhere, did not move at all.
**Options.** (a) **Displayable with full provenance** — benchmark, version, date,
exact model version, who ran it, scoring script — plus a stated non-transfer caveat,
eligible to break a tie, and **never** converted into a coefficient inside V3's own
scoring. (b) **Barred entirely** — no external number appears anywhere.
(c) **Admissible as a numeric starting prior** — most useful, and it lets another
population's measurement act as if it were this system's.
**Recommendation.** (a).

**`OD-A-17` — RATIFIED (DR-061) · adopted: require version and date keys; a version change wakes the cell — Does a silent model update invalidate that model's track record?**
**What it is.** Providers change models behind an unchanged name. The engine can key
each cell to the exact model version and the date, or to the model's name alone.
**Why it matters.** A cell keyed to "the provider's current model" is keyed to
nothing: history accumulated under an older model keeps counting for a new one while
the label stays the same.
**Options.** (a) **Require the version and date as keys**, and treat a version change
as an event that wakes the cell for re-assessment — the same staleness machinery used
for answers. (b) **Key on the model name** — simpler, longer apparent histories,
silently wrong after any provider update.
**Recommendation.** (a).

**`OD-A-18` — RATIFIED (DR-061) · adopted: require the cold-start exit demonstration — Must the engine demonstrate that judge weights can actually move?**
**What it is.** The defect being repaired was never a bad starting weight — the old
weights were labelled honestly as cold-start. It was that the path out was
unreachable, so every judge counted the same forever regardless of its track record.
This row asks whether a demonstration of the exit is required before launch.
**Why it matters.** A calibration mechanism that has never been observed to move is
the same defect with new code.
**Options.** (a) **Require the demonstration** — inject one synthetic settled
outcome, flow it through resolution, recording, scoring and the track record, and
assert a weight moves off its cold value, with the whole path replayable.
(b) **Do not require it** — trust the code path.
**Recommendation.** (a). It is one fixture and it is the only thing that
distinguishes the repair from the defect.

**`OD-A-19` — RATIFIED (DR-061) · adopted: fully inside the replay law — Do track-record numbers count as "served numbers" under the replay
law?**
**What it is.** The replay law says the engine never serves a number it cannot
recompute from its frozen records, with no model involved in the recomputation. This
row asks whether track-record numbers are inside that law or exempt as internal.
**Why it matters.** If they are inside, several attractive designs are excluded: no
rolling average whose window is not recorded, no model in the update loop, no
retraining without the training set frozen. If they are exempt, a number nobody can
reproduce can still influence which model answers a question, and — since cells are
shown to the reader — can still reach a user.
**Options.** (a) **Fully inside the replay law.** (b) **Internal-only and exempt** —
more design freedom, and an unreproducible number steering the engine.
**Recommendation.** (a).

---

### 23.B Cross-run memory — recognising a question asked before — 24 rows

*Owner: artifact 1 (this spec), §17. These decide whether, and how, the engine
notices that it has answered something like this before, what it pulls forward, and
what it tells the reader.*

**`OD-M-01` — RATIFIED (DR-061) · adopted: drop date and policy version from identity — Should the "have I seen this before?" key ignore the date and the
policy version?**
**What it is.** The engine already has a key that decides whether an old result may
be *reused* — it includes the evidence cutoff date and the policy version, so that a
newer cutoff or a changed policy correctly forces fresh work. Recognising a repeat
question is the opposite question, and the whole point is to match something asked
last month under a different cutoff.
**Why it matters.** If the reuse key is reused here, the mechanism never fires,
because almost every re-ask carries a different date. This is the single most likely
way the feature ships dead.
**Options.** (a) **Drop date and policy version from the identity**, carrying them
as properties of the link instead. (b) **Reuse the existing key** — no new code, and
the feature is inert by construction.
**Recommendation.** (a).

**`OD-M-02` — RATIFIED (DR-061) · adopted: identical and same-subject auto-link — Which degrees of similarity are strong enough to link two runs
automatically?**
**What it is.** Four levels of match, strongest first. **Identical question** — the
same canonical text and the same caller. **Same subject** — the settlement act, the
question type and the declared field all agree, and every field of the subject
definition (population, comparator, outcome, time window) agrees after
normalization. **Partial subject** — some of those agree and some differ, for
example the same population and outcome but a different comparator. **Shared search
terms** — a count of frozen query terms in common, and nothing more.
**Why it matters.** Automatic linking at a weak level means the engine tells the
asker it has history it does not really have, and may pull the wrong prior forward.
**Options.** (a) **Identical and same-subject link automatically**; weaker levels are
disclosed but never pulled. (b) **Identical only** — near-zero false links, misses
every re-phrasing. (c) **All four link automatically with a visible label** —
maximum recall, and a label is a weak guard against an imported false history.
(d) **None link automatically** — every link confirmed by the asker; safest and dead
for unattended runs.
**Recommendation.** (a).

**`OD-M-03` — RATIFIED (DR-061) · adopted: serve as related, no pull, for v1 — What happens to the middle band — a partial subject match or shared
search terms?**
**What it is.** Matches strong enough to be worth mentioning, too weak to trust.
**Why it matters.** Silently discarding them loses real reunions; silently using them
imports a foreign history.
**Options.** (a) **Serve as "related"** and pull nothing forward. (b) **Offer to the
asker** through the steering menu, logging the answer verbatim — the one person who
actually knows decides. (c) **Both, split by risk tier** — ask on high-stakes runs,
serve as related otherwise.
**Recommendation.** (a) for v1, (b) once the steering menu is live.

**`OD-M-04` — RATIFIED (DR-061) · adopted: barred entirely for v1 — the levels are database lookups — May meaning-similarity search be used to find candidates at all?**
**What it is.** Comparing questions by meaning-vector proximity rather than by
matching typed fields.
**Why it matters.** Correct and incorrect matches have heavily overlapping similarity
scores, and no fixed cut-off keeps the error rate bounded as the variety of questions
grows. The dangerous cases sit *above* 0.95 similarity: two questions differing only
in time period, in polarity, or in analytical intent — exactly the differences a
debate engine exists to respect. Separately, the similarity model can change under
the same name, which breaks reproducibility.
**Options.** (a) **Permitted to propose candidates only**, never to decide, and never
displayed as a number. (b) **Barred entirely** — the four levels are database lookups
over typed fields, which costs some recall on badly-worded re-asks and removes an
entire class of reproducibility failure.
**Recommendation.** (b) for v1.

**`OD-M-05` — RATIFIED (DR-061) · adopted: model-proposed candidates, written only on a confirmed link — Where do the synonym rules come from?**
**What it is.** Matching needs to know that two spellings mean the same thing — a
health service and its acronym, a vitamin and its chemical name. That list has to
come from somewhere.
**Why it matters.** One wrong synonym row silently false-merges **every future pair**
that touches it.
**Options.** (a) **Supplied by the deployment** as a curated list per field —
auditable, empty at the start, and ongoing manual work. (b) **Proposed by a model and
applied automatically** — fast, and it reintroduces the semantic guess through the
back door with unbounded blast radius. (c) **Proposed by a model as candidates,
written only when a link is actually confirmed**, each row dated, attributed and
reversible — the list grows from decisions someone really made, and it is fully
replayable.
**Recommendation.** (c).

**`OD-M-06` — RATIFIED (DR-061) · adopted: never agreement — reported as not compared — When a field is empty on both runs, does that count as agreement?**
**What it is.** If neither run recorded a comparator, is that a match on comparator,
or simply not compared?
**Why it matters.** Treating blank-equals-blank as agreement is the classic route to
silent false merges: two thinly-specified questions can agree on everything by
agreeing on nothing.
**Options.** (a) **Never agreement** — reported as "not compared", and a match that
depends on it does not reach the automatic level. (b) **Counts as agreement** — more
matches, and the weakest ones are the most likely to be wrong.
**Recommendation.** (a).

**`OD-M-07` — RATIFIED (DR-061) · adopted: a typed one-directional link; identity stays per-run — Link the two runs, or merge them into one question?**
**What it is.** On recognising a repeat, the engine can record a one-directional
relationship between two runs that keep separate identities, or it can treat them as
the same question.
**Why it matters.** Merging is not reversible in practice. Once two runs share an
identity, a single wrong link welds two unrelated histories together, and any further
link to either drags the other along.
**Options.** (a) **A typed one-directional link** — repeats / refines / contradicts /
related — with each run keeping its own identity forever and no chaining of links
into clusters. (b) **Merge identity on an exact match** — simpler queries, and one
bad match is unrecoverable.
**Recommendation.** (a).

**`OD-M-08` — RATIFIED (DR-061) · adopted: false link is the worse error — Which mistake does the engine prefer to make?**
**What it is.** A false link (claiming history that is not really about this
question) versus a missed reunion (failing to notice a genuine repeat).
**Why it matters.** They are not symmetric. A missed reunion costs money and a lost
lesson — the run is still honest. A false link makes the engine **assert a false
history to the asker**, and at deeper pull levels feeds another question's evidence
into this one.
**Options.** (a) **False link is the worse error** — every ambiguous case resolves to
"do not link, and say a candidate was found". (b) **Missed reunion is the worse
error** — link readily, correct later. (c) **No declared preference** — every future
tuning argument reopens this.
**Recommendation.** (a).

**`OD-M-09` — RATIFIED (DR-061) · adopted: link, settlement facts and open triggers for v1 — How much of the prior run comes forward?**
**What it is.** Six increasing depths: the **link alone**; plus the **settlement
facts** (what was concluded, how sure, who resolved it, when, and whether it turned
out right); plus the **open triggers and freshness state** (what was being watched
for, and whether the old answer is under review); plus **class-level track-record
facts**; plus the **prior argument graph** (its nodes, its attacks, its evidence);
plus the **prior written answer**.
**Why it matters.** Cost and risk rise together. The link alone risks only a false
claim of history. The argument graph risks stale evidence and another question's
sub-arguments entering this answer's scoring.
**Options.** (a) **Link, settlement facts, and open triggers** — small, typed, no
prose, and the highest value per unit of risk. (b) **Through the argument graph**,
allowed only on the two strongest match levels. (c) **Link only.** (d) **Everything
including the prior written answer.**
**Recommendation.** (a) for v1.

**`OD-M-10` — RATIFIED (DR-061) · adopted: never fed to a model; shown as a linked document — Is the previously written answer kept out of every prompt?**
**What it is.** The finished prose of the earlier answer.
**Why it matters.** It is the prior conclusion in its most persuasive possible form,
and it contains nothing the typed facts do not already contain. The engine
regenerates prose from facts anyway.
**Options.** (a) **Never fed to a model; shown to the asker as a linked document.**
(b) **Allowed into prompts** — marginally more context, maximum anchoring toward
repeating the last answer.
**Recommendation.** (a).

**`OD-M-11` — RATIFIED (DR-061) · adopted: re-verify load-bearing locators only — What happens to a pulled-forward claim whose source link no longer
works?**
**What it is.** A claim recorded as "looked up" months ago, whose page has moved or
disappeared.
**Why it matters.** Serving it as looked-up asserts a source that cannot now be
opened. The engine already has the rule for this shape elsewhere: output that cannot
be reproduced is automatically relabelled as reasoning rather than measurement.
**Options.** (a) **Re-verify every pulled source at pull time** — most accurate, costs
one fetch per source. (b) **Re-verify only the load-bearing ones** — most of the
benefit, some of the cost. (c) **Downgrade everything pulled to "reasoning" by
default and promote it back on verification** — cheapest, and it understates good
evidence until someone checks.
**Recommendation.** (b).

**`OD-M-12` — RATIFIED (DR-061) · adopted: a flat declared number, printed where used — What is the cap on how much gets pulled forward?**
**What it is.** A declared limit, in the style of the existing caps on follow-up
topics and regeneration rounds.
**Why it matters.** Without one, an accumulating history costs more to search than it
returns, and the pulled material eventually crowds the current question out of its
own answer.
**Options.** (a) **A flat declared number**, printed where used. (b) **Derived from
the asker's depth setting**, like the measurement quota — scales with how much the
asker asked for, and is harder to reason about. (c) **Selection by usefulness**, which
requires enough linked history to compute usefulness in the first place.
**Recommendation.** (a) now, with (c) recorded as a later upgrade.

**`OD-M-13` — RATIFIED (DR-061) · adopted: yes — a contradiction wakes the prior answer — When this run contradicts an earlier answer, does the earlier answer
get re-opened?**
**What it is.** The engine already wakes an answer for re-assessment when something
it was watching changes. This row asks whether a contradiction from a later run is
one of those things.
**Why it matters.** Without it, the engine can notice that it contradicts itself and
do nothing about it — the older answer stays on the record, unmarked, until its own
watch conditions happen to fire.
**Options.** (a) **Yes** — a contradiction wakes the prior answer for re-assessment
along its ancestors. (b) **No** — prior answers wake only on their own watched
triggers; cheaper, and self-contradiction persists silently.
**Recommendation.** (a).

**`OD-M-14` — RATIFIED (DR-061) · adopted: never admissible — Can a previous verdict be evidence for its own claim?**
**What it is.** Three things arrive in a pull: what the outside world eventually
reported, the sources the earlier run gathered, and the earlier run's own conclusion.
**Why it matters.** The first two are evidence — an external outcome has a locator,
and sources can be re-opened at their own addresses. The third is the engine's own
earlier opinion. Admitting it lets a claim support itself across sessions, and a
system fed its own outputs returns to the same outputs regardless of the truth.
**Options.** (a) **Never admissible** — only the external outcome and the
re-verifiable sources count as evidence; the earlier conclusion is disclosed, not
weighed. (b) **Admissible at reduced weight** — feels conservative, and still creates
the loop, only more slowly.
**Recommendation.** (a), specified as a typed admissibility rule rather than prompt
guidance.

**`OD-M-15` — RATIFIED (DR-061) · adopted: yes, source typed; the pull lands after the prior is recorded — Does last time's conclusion become this time's starting belief?**
**What it is.** Before searching, the engine records what it already thinks and how
sure it is. A carried-forward conclusion could legitimately fill that slot.
**Why it matters.** A carried belief is a perfectly legitimate starting point and an
illegitimate *silent* one. If the pull happens before the starting belief is
recorded, the "genuine prior" is quietly last session's answer. If it happens after,
the run has two starting beliefs and the "did the evidence change my mind?"
arithmetic must be told which one the change is measured from.
**Options.** (a) **Yes, with the source typed** — the starting belief records that it
came from a prior run, naming which run, which version, whether it had settled, and
how stale it was — and the pull happens **after** the starting belief is recorded, so
the stated prior stays genuine. (b) **Yes, pull first** — simpler ordering, and the
recorded prior is no longer independent. (c) **Memory never touches the prior** —
cleanest separation, and the engine forgets what it learned.
**Recommendation.** (a).

**`OD-M-16` — RATIFIED (DR-061) · adopted: yes — memory seeds the search plan and the ignorance list — Does memory shape where this run looks?**
**What it is.** The earlier run leaves behind things it was watching for, claims
nobody could find a way to disprove, and — if it turned out wrong — a record of where
exactly it went wrong. Those could seed this run's searches and its list of known
unknowns.
**Why it matters.** This is the half of "what should that change about how I answer
questions like this" that can actually act. It changes the *search*, not the
conclusion, which is the low-risk end of using history.
**Options.** (a) **Yes** — prior watch items, unresolved disproof attempts and prior
error attributions seed this run's search plan and its ignorance list.
(b) **No** — memory only appears in the served answer as narration.
**Recommendation.** (a).

**`OD-M-17` — RATIFIED (DR-061) · adopted: only the two strongest levels revive — What strength of match is enough to revive a retired question?**
**What it is.** Retired questions are archived, never deleted, and are meant to be
revived by the next query about them. The match ladder is how the engine recognises
that a new query *is* about an archived question — nothing else in the design
performs that recognition.
**Why it matters.** Reviving on a weak match resurrects the wrong argument graph and
attaches it to a new question.
**Options.** (a) **Only the two strongest levels revive.** (b) **Any candidate,
including shared search terms** — more revivals, more wrong ones.
**Recommendation.** (a).

**`OD-M-18` — RATIFIED (DR-061) · adopted: record the starting belief before any pull — Should the engine form its own view before it is shown the old one?**
**What it is.** Whether pulled material is present from the start, or withheld until
the run has recorded its own position.
**Why it matters.** How a model behaves when retrieved context conflicts with its own
belief is **not stable across models or evidence strengths**, so "it will weigh the
prior sensibly" is not a safe assumption to design on.
**Options.** (a) **Record the starting belief before any pull** — one ordering
constraint, no extra computation. (b) **Run the affected nodes blind, snapshot, then
reveal and re-run** — roughly double computation on those nodes, and it buys a
measured fact: exactly what memory changed. (c) **Blind-first on high-stakes runs
only.** (d) **No protection.**
**Recommendation.** (a), with (b) recorded as a later upgrade for high-stakes runs.

**`OD-M-19` — RATIFIED (DR-061) · adopted: disclose the found-but-unlinked candidate — Must a candidate that was found but not linked be disclosed?**
**What it is.** The engine looks for prior runs and sometimes finds something that
does not clear the bar.
**Why it matters.** Without the disclosure, the asker cannot tell **"no history
exists"** from **"history exists and was judged too weak to use"** — very different
facts about the world. Disclosing it also turns a missed reunion from invisible into
correctable, because the asker can say "yes, that one".
**Options.** (a) **Disclose** — consistent with the standing rule that everything
executed is recorded and visible in the digest. (b) **Positives only** — tidier
output, and the asker cannot tell the two cases apart.
**Recommendation.** (a).

**`OD-M-20` — RATIFIED (DR-061) · adopted: split — class-level facts shared, question-level pulls per-asker — Whose history can a question reach?**
**What it is.** Whether the store is per-asker or shared across a deployment.
**Why it matters.** A shared store means one person's question can pull another
person's prior session forward, with everything that implies for confidentiality and
for surprise. A per-asker store means an organisation re-answers the same question
once per person.
**Options.** (a) **Per-asker.** (b) **Per-deployment** — most reuse, most exposure.
(c) **Split** — class-level track-record facts shared across the deployment (they name
no question), question-level pulls kept per-asker.
**Recommendation.** (c).

**`OD-M-21` — RATIFIED (DR-061) · adopted: at writing time only, for v1 — Where does the model's interpretation sit?**
**What it is.** A model interprets what a prior outcome means. It can do that purely
when writing the answer, or earlier, where its output would actually change the run.
**Why it matters.** Interpretation at writing time can only mis-narrate. Interpretation
earlier can seed searches and set watch items — more useful, and the only place where
a wrong link can change the answer rather than only the story about it.
**Options.** (a) **At writing time only** — it narrates, never changes the run.
(b) **A typed reconciliation step early in the run** that does change it, restricted
to the two strongest match levels, with every adjustment required to trace back to a
specific pulled item and the number of adjustments capped. (c) **Both.**
**Recommendation.** (a) for v1; (b) once the match levels have proven themselves.

**`OD-M-22` — RATIFIED (DR-061) · adopted: never — a match changes inputs and disclosure, not which rows run — Can recognising a repeat let the engine skip work?**
**What it is.** Whether a match may mark battery rows as already satisfied.
**Why it matters.** The existing rule for cached results is that a cache hit never
cancels an obligation — it satisfies it from the archive, and the row still counts as
having run. If a match could skip rows instead, the first cost-pressure review turns
this feature into the meaning-based cache that is already prohibited.
**Options.** (a) **Never** — a link changes the run's inputs and its disclosure,
never which rows run. (b) **Named rows may be satisfied from the prior run** —
cheaper repeats, and the engine gradually stops re-checking things that have changed.
**Recommendation.** (a).

**`OD-M-23` — RATIFIED (DR-061) · adopted: count distinct question-clusters — How should repeated questions be counted in the model track record?**
**What it is.** Once the engine links repeats, the settled cases it learns from stop
being independent: several settlements about the same question share evidence, a
resolver and framing.
**Why it matters.** Counting them as independent makes the uncertainty range look
narrower than it is — on an illustrative set, roughly a quarter narrower. That is not
just mis-reporting: it lets cells clear the minimum-evidence bar and the
too-close-to-call rule that should have held them back.
**Options.** (a) **Count distinct question-clusters rather than settlements** —
simplest, and slightly conservative. (b) **Report both counts and widen the range
accordingly** — most informative, more to explain. (c) **Ignore it and record the
known bias in the track record's own caveats.**
**Recommendation.** (a).

**`OD-M-24` — RATIFIED (DR-061) · adopted: require both proofs — Must cold start be proven inert?**
**What it is.** Two tests. **Inertness:** with an empty history store, a run must
produce byte-identical output to the same run with the feature turned off — any
difference is fabricated familiarity. **Firing:** inject one synthetic prior
settlement whose subject matches, and the link must appear, the disclosure must be
served, and the whole path must replay.
**Why it matters.** The characteristic failure of this kind of feature is a softener
that appears on every answer — "this resembles questions you have asked before" —
with nothing behind it.
**Options.** (a) **Require both.** (b) **Require neither.** (c) **Firing proof only**
— proves the feature works, does not prove it stays quiet when it should.
**Recommendation.** (a).

---

### 23.C Rerouted to the Quality Charter — 2 rows

*Owner: artifact 4. Rerouted by DR-047 when the race was retired.*

**`OD-C-01` — RATIFIED (DR-061) · adopted: two axes formally separated; numeric thresholds deferred to DR-023 — The verdict model: what the bands are, and where their boundaries
sit.**
**What it is.** The pack currently uses several words for how an answer is
characterised, without saying how they relate. Four distinct things exist:
the **verdict state** (does the engine assert something, hand back a conditional, or
decline?); the **verdict band** (where the answer sits on the supported-to-unsupported
scale, given the arithmetic); the **confidence band** (how sure the engine is, given
how well it checked); and the **abstention kind** (which of the five sorts of
not-knowing applies to a specific unknown). This row asks V to fix the model and the
band boundaries.
**Why it matters.** Today a stranger cannot tell whether a contested answer is
allowed to be highly confident, or which of the two bands a missing critic caps.
Both are used in obligations. The pack's working position is that they are **two
axes** — a contested verdict can rest on impeccable checking, and a supported verdict
can be capped to low confidence because the checking was thin — and that every
"cap" in this document caps **confidence**, never the verdict band.
**Options.** (a) **Two axes, formally separated**, with the verdict band's thresholds
set from measured outcome data once it exists and the bands left as ordered labels
without numeric boundaries until then. (b) **Two axes with numeric boundaries
declared now** — more concrete, and the numbers would be invented, which the
anti-theater law forbids. (c) **One axis** — simplest to present, and it makes
"well-evidenced but genuinely contested" inexpressible.
**Recommendation.** (a). The distinction is needed immediately; the numbers cannot
honestly be set before there is outcome data to set them from. **Note the
constraint this row is under:** its own artifact forbids inventing numbers, so the
answerable part today is the *model*, not the *thresholds*.

**`OD-C-02` — RATIFIED (DR-061) · adopted: shown to fire both ways (DR-063 VR-1 adds the launch minimum and the standing monitor) — What "the disagreement check must demonstrably fire" means,
measurably.**
**What it is.** When two judges disagree about a node, V3 raises a flag and lowers
how confident the answer sounds — never silently averaging them, never refusing to
answer. It is ruled that this must **demonstrably fire where the previous engine
provably could not**. The bar for "demonstrably" is not set.
**Why it matters.** The previous engine's equivalent check had a threshold of 0.35
against a largest observed disagreement of 0.11 across 26 nodes — it was
mathematically incapable of firing, while appearing in the code as a working
safeguard. Without a stated bar, the replacement can ship in the same condition.
**Options.** (a) **Fires at least once against real recorded disagreements** —
easiest to satisfy, weakest evidence. (b) **Fires at a rate consistent with the
disagreements actually observed** — strongest evidence, needs enough runs to
establish what that rate is. (c) **The general gate standard: shown to fire both
ways** — that is, a case that trips it and a case that does not, both demonstrated —
before the check counts as adopted.
**Recommendation.** (c), which is the same standard proposed for every other gate in
this document, so it adds a rule rather than an exception.

---

### 23.D Residuals this spec surfaced and cannot close — 6 rows

*Owner: artifact 1 (this spec).*

**`OD-S-01` — RATIFIED (DR-061) · adopted: phased — recording from day one, scoring and calibration later — When does the outcome-scoring stage switch on?**
**What it is.** The final stage records what was claimed, waits for the real outcome,
scores it, and feeds the result into the model track record. It could be live from
day one, phased in, or deferred.
**Why it matters.** The parameter naming this choice has **no ruling** — the ticket
that owned it was transformed when the race was retired, and nothing picked it up.
Meanwhile the model ledger and the track record both depend on this stage existing.
**Behaviour while unresolved.** The recording limbs run from day one because other
ruled requirements need them: the answer record, the read-back verification, and the
per-run liveness telemetry. Outcome ingestion waits for an outcome to arrive. **No
operational calibration claim is made**, and capability cells stay marked
"not measured".
**Options.** (a) **Day one** — everything on, including the calibration path.
(b) **Phased** — recording now, scoring and calibration later. (c) **Defer the full
stage** — cheapest to build, and the track record has no path to real capability
data.
**Recommendation.** (b), which is what the behaviour-while-unresolved already
describes, so ratifying it changes nothing and makes it legible.

**`OD-S-02` — RATIFIED (DR-061) · adopted: drop the undefined condition; the row fires on split or composed answers — What triggers the "did the checker try it their own way?" row?**
**What it is.** After the work is done, an independent checker re-does the answer by
a different method, and the answer has to survive that. The merged contract adds a
condition to this row — that an alternate method is "required" — which neither source
document ever defines.
**Why it matters.** An undefined condition can never become true, so the row would
sit permanently waiting and a checking obligation would disappear without anyone
deciding to remove it.
**Behaviour while unresolved.** The row fires on the plain reading — whenever the
question was split or the answer was composed from pieces — and the undefined
condition is recorded as an undefined gate rather than being evaluated.
**Options.** (a) **Policy decides** when an alternate method is required — for
example by risk tier. (b) **The critic decides**, as part of its own judgement.
(c) **The question type decides.** (d) **Drop the condition** — the row always fires
on split or composed answers.
**Recommendation.** (d), which matches both source appendices and the current
behaviour, with (a) as the natural upgrade if the cost proves high.

**`OD-S-03` — RATIFIED (DR-061) · adopted: minimum plus wording and the typed not-knowing — After the engine stops early, what still runs?**
**What it is.** Four things can end a run before it reaches an answer: every possible
answer leads to the same action, so the question is inert; the question rests on
something false; the question turns on a value and goes to a human; or no observation
could ever separate the rival answers. In each case the engine still has to hand
something back.
**Why it matters.** The rule says a terminal route switches off downstream work
"except what is needed to serve that terminal result", and never says what that
includes.
**Behaviour while unresolved.** Three obligations are enforced as the derived
minimum: the intent record, the provenance on whatever is served, and the run's
liveness telemetry. So every early stop still carries its provenance and is still
recorded.
**Options.** (a) **Minimum only** — cheapest; the reader gets a terse, correct,
provenance-carrying non-answer. (b) **Minimum plus careful wording and the typed
statement of what is not known** — the reader gets a non-answer they can act on, at
the cost of composition work on a run that produced no research. (c) **Minimum plus
wording, the typed not-knowing, and the full stranger check** — the most readable
non-answer, and the most expensive path for the cheapest run.
**Recommendation.** (b). A person who asked a question that could not be answered is
exactly the person most in need of a sentence they can understand.

**`OD-S-04` — RATIFIED (DR-061) · adopted: freeze the battery version per release — What freezes the coverage proof, given the engine can change its own
battery?**
**What it is.** The final stage can demote or remove battery rows over time based on
how they perform. That means the set of rows a coverage proof is proving things about
can itself change.
**Why it matters.** A proof that all 71 rows are covered is only true of one version
of the battery. Without a version and a freeze rule, the proof silently stops being
true and nothing signals it.
**Behaviour while unresolved.** The coverage proof in §3 is stated **as of this
document's battery version**; no self-modification ships until liveness demotion
does; and nothing is ever deleted, so any change is recoverable.
**Options.** (a) **Version the battery and re-run the coverage proof on every
change** — always true, real cost per change. (b) **Freeze the battery version for a
release and allow demotion only between releases** — cheaper, and the proof is
accurate at release boundaries. (c) **Do not version it** — the proof rots invisibly.
**Recommendation.** (b).

**`OD-S-05` — CLOSED (DR-057) · adopted: node text checked pre-compose and the composed verdict gets its own R9 pass; verdict failure takes the components-only terminal — Which text does the stranger check actually examine?**
**What it is.** The gate order is now fixed: the stranger check runs first, then the
objection-visibility check, then text-against-facts conformance, then provenance. But
the answer exists in two forms — the node texts written when each node was created,
and the composed prose written at the end. The order implies the check runs on node
text, since that is what exists first; it does not say whether the composed verdict
prose is checked too.
**Why it matters.** The stranger law covers **every node and the verdict**. If the
check only ever sees node text, the verdict sentence — the part most readers actually
read — is checked only by the conformance judge, which tests truthfulness against
facts, not readability. If it runs on both, it runs twice.
**Behaviour while unresolved.** The check runs on node text before composition, and
the conformance judge is barred from demanding an edit that would break it.
**Options.** (a) **Node text only** — cheapest; verdict readability rests on
composition and the conformance judge. (b) **Node text before composition, verdict
prose after** — full coverage of the stranger law, one extra check per answer, and it
needs a rule for what happens when the composed verdict fails after conformance has
already passed. (c) **Both, both times.**
**Recommendation.** (b), with the failure route being the state machine's
components-only terminal rather than an unbounded recompose.

**`OD-S-06` — RATIFIED (DR-061) · adopted: verdict-only action consequence — The one restatement schema: what fields, and does every node carry a
"what to do differently"?**
**What it is.** Every node and the verdict must be restatable by someone who knows
nothing about the system. Four artifacts each named a slightly different field list;
one requires four things including what the reader should do differently, another
requires three, a third asks only for "a stranger-readable restatement". A builder
cannot implement four schemas.
**Why it matters.** The disagreement is not cosmetic. Requiring an action consequence
on **every node** multiplies work by node count and invites invented actions on nodes
where no action exists — a leaf about a measurement instrument has no sensible "what
you should do differently".
**Options.** (a) **Verdict-only action consequence** — nodes carry claim, certainty,
what would change it; the verdict adds what to do differently. Cheapest, and matches
where the answer-to-action map is actually recorded. (b) **Every node inherits the
verdict's action** — uniform schema, frequently meaningless text on leaves, which is
precisely what the stranger law exists to prevent. (c) **Every node generates its own**
— most complete, highest cost, highest invention risk.
**Recommendation.** (a), with the schema proposed in §12.7 and cited by name from all
four artifacts so the field list stops drifting.

---

## 24. Traceability index — every DR to where it binds

| Source | What it governs in this document |
|---|---|
| **DR-001** | This artifact's existence as spec-pack item 1 (artifact 4's wording superseded by DR-047) |
| **DR-002** | The kept UI, as re-scoped by DR-048 (§12.6) |
| **DR-003** | Clean-room carryover — enforced in artifact 2; cited here where a row depends on a kept organ |
| **DR-004** | The coverage law behind §3: all 71 rows closed, experiments never gating |
| **DR-005 / DR-024** | Behaviour-only requirements **except** V-imposed stack constraints (§2, §20) |
| **DR-006** | The three-lens review gate this draft awaits |
| **DR-008** | Typed query amendments: mechanical repair vs semantic re-aim (§4 row 2, §7.1) |
| **DR-009** | The mixed off-subject rule (§4 row 3, §7.2, §3.7 Q32) |
| **DR-010 / DR-011 / DR-012** | The abstention price as a cost ratio, as a class × risk matrix, with seeded provisional values (§4 row 4, §21, Q6, Q56) |
| **DR-013 / DR-014** | Lineage bright line; cap-label-lift when no second lineage (§4 rows 5–6, §14, Q14/Q31/Q39/Q40/Q41, R5/R6) |
| **DR-015 / DR-016** | Snapshot-wake-propagate; composite archival retirement; UNDER-EXPLORED (§4 rows 11–12, §13, Q18/Q58/Q62) |
| **DR-017** | Value flows A/B/C; `weight_source` with no default; the overlay never touches the graph (§4 row 8, §15, Q50/Q57) |
| **DR-018** | R6/R7/R8 ACCEPT, R9 AMEND — every node **and** the verdict restatable (§3.12, §4 row 7) |
| **DR-019** | Knob batch 1 — stranger coverage, topic cap 7, blind-verification coverage, steering authority (§4 row 18, §4.1, §9.2, §14.3) |
| **DR-020** | Knob batch 2 — split limit, stage order, citation routes, coverage upgrade (§4 rows 9–10, 13–14, §7.3, §9.1–9.2) |
| **DR-021** | Knob batch 3 — enrichment-only budget skips, auto-serve visible fallback, per-run ownership, measurement quota (§4 rows 15, 19, §4.1, §5.4) |
| **DR-022 → DR-035** | The labeled arrow as design reference, with the experiment's evaluator, loop handling and defaults left behind (§18, O-8) |
| **DR-023** | The V3 flag register drawn fresh and V-ratified before production (§20, W-5) |
| **DR-024** | Postgres including observability; start from scratch (§20) |
| **DR-025** | V2 as reference capture only, per DR-047's narrowing (§25 item 1) |
| **DR-026** | D5 indicted; real outcome-fed judge weighting (§16.3, §16.4) |
| **DR-027** | The execution ledger: everything executed recorded, digest-visible; raw judgements before the math (§12.5, §8.1, §17.3) |
| **DR-028** | No judgement, no magnitude ⇒ no number (§2, §8.1, §15.1, §16.2) |
| **DR-029** | All eight house rules as required behaviours, successors governing, rules as floors (§19) |
| **DR-030** | One scoring engine, one graph, one serving truth; the organ↔stage table (§18) |
| **DR-031** | The 38-row unanimous batch + R1/R2/R5/R7/R9; the stranger riders; `GREENFIELD_NEW_REPO` (§3, §4 row 1) |
| **DR-032** | The working disagreement flag — flag plus certainty downgrade, never a silent average, never an abstention gate (§8.4 A-19, §22.1) |
| **DR-033** | Nothing from V3 must match V2; literature vectors plus property tests as ground truth (§2, §22, Z-2) |
| **DR-034** | The replay law: permanent property plus launch ceremony, no AI in the replay (§12.5, §16, §22.1) |
| **DR-035** | The Model B perimeter (§18, O-8) |
| **DR-036** | Theme 2 HYBRID; content from the model, force from the machine; the five refusal powers (§6, Q12/Q13/R3/R4/R6/R8) |
| **DR-037** | The label law and the two-field record; the five terminal routes (§1, §5, and every row's disposition cell) |
| **DR-038** | Q35 and Q37 HYBRID with enforced gates (§8.2, §8.3) |
| **DR-039** | No invented measurements; per-model scorecards (§2, §8.1, §16) |
| **DR-040** | The row-boundary law; Q22 and Q39 MACHINE; Q45 HYBRID with a machine-only fast path (§11) |
| **DR-041** | The decomposition redesign: kept supports-only output, system-obligated defeaters, no kill on author failure, measured-difference rival carver (§9) |
| **DR-042** | Q30 and Q48 HYBRID; the loop-free construction law (§10.3, §10.5) |
| **DR-043** | Q50 HYBRID under three guards (§10.4) |
| **DR-044** | Serve composition: machine facts → one composing model → a second judging model → machine enforcement; Q24/Q51/Q54/Q55/Q61 (§12, §17) |
| **DR-045** | Q34's machine diff, the two ledger stamps, the typed `UNINSTRUMENTED` verdict, and V's remediation layer (§8.1) |
| **DR-046** | Scorecard consumption, always-evolving weights, exploration share, onboarding thresholds, the model ledger, the cold-start exit (§16) |
| **DR-047** | The race is retired; artifact 4 is the Quality Charter; verdict bands and the fire bar rerouted (§2, §4 row 17, §22, §23.C) |
| **DR-048** | UI data-layer rebuild with no adapter; the nine honesty surfaces (§12.6) |
| **DR-049** | SERVE termination: `max_recompose = 2`, components-only with a DEFECT badge, gate order R9 → Q53 → conformance → Q51, conformance subordinate to R9, Q53's residual as a fact-bundle field (§12.1a, §12.2, §3.10) |
| **DR-050** | Q46's deepening bound at K=1 per parent per run and the `LEVERAGE_UNRESOLVED` residual (§10.2 C-5a, §3.9) |
| **DR-051** | The partition law: five abstention kinds for ledger unknowns only; condition marks as a closed parallel enum with an exhaustive mapping table (§12.3, §3.10 Q55) |
| **DR-052** | The run cost envelope; enrichment-then-hard-stop with `ENVELOPE_EXHAUSTED`; serve-conformance added to the protected core; stranger sample rate frozen at run start (§21.2, §4, §9.2, §12.1) |
| **DR-053** | Mixed empirical-and-value questions: typed dual settlement act, two machine-ordered phases on one graph, one answer with two labelled sections (§5.5, §3.2 Q7) |
| **DR-054** | The wire boundary: typed honesty projections by default, full bundle and conformance record via an authorized inspection/replay endpoint, internal prompt material excluded (§12.6) |
| **DR-055** | Multi-maker critique as a launch gate for standard-and-above; single-maker legal only as labelled degraded operation (§14.4, §22.1) |
| **DR-056** | The organ↔stage table is FINAL; the cycle law closed at construction, compute and write (§18 O-7, §10.5 C-15) |
| **DR-057** | R9 on both surfaces: node text pre-compose, the composed verdict post-compose; verdict failure takes the components-only terminal (§12.1a S-4a). Closes `OD-S-05` |
| **DR-058** | The compose size law: multi-pass composition by load-bearing priority, honesty fields machine-injected, hard-budget terminal (§12.1b) |
| **DR-059** | Degraded-mode projection fields for the reversal point and builds-on-previous; replay-eviction of an unreplayable component number (§12.1c) |
| **DR-060** | Conformance sampling scope — load-bearing always judged, the role never skippable; ceremony scope — numbers replay exactly, the serve decision replays as stored data (§12.1a S-4b, §12.5 S-18) |
| **DR-061** | **The spec register ratified wholesale** — all 51 rows adopt their recommended option by reference to §23's option text. Every `RULED(DR-061 · OD-nn)` tag in this document points at the row named in the tag |
| **DR-062** | The carryover manifest's register ratified wholesale; this spec's pointer to it reads **0 open** (§23 preamble) |
| **DR-063** | The charter's register ratified: the fire bar (`OD-C-02`), the verdict-model names with all numbers deferred to DR-023 (`OD-C-01`, §12.8), ceremony independence (§12.5), and which acceptance items block release (§22) |
| **DR-064** | The UI contract's 30 presentation cells **delegated to mockup review**; the requirements mission closes without them (§12.6) |
| `../research/05-battery-coverage-matrix.md` | Row gists, seat dispositions, the parameter register and its orphans (§3, §4) |
| `../research/18-activation-table.md` | Activation semantics, the four states, the fire conditions and the retired marker (§1, §3) |
| `../research/06-contested-decision-briefs.md` | The three-seat provenance preserved on all 28 contested rows (§3) |
| `../research/32-weight-derivation.md` | M1–M4 + F1; the value-elicitation flows; the naked-constant printing law (§15, §18) |
| `../research/33-symmetry-and-model-profiles.md` | The symmetry telemetry and the scorecard design (§8, §16, §23.A) |
| `../research/34-cross-run-memory.md` | The Q61 retrieval mechanism (§17, §23.B) |
| `carryover-manifest.md` | The six kept organs, the defect register D1–D5, the test base, and its own open register (cited throughout; never restated) |
| `../wayfinder/GLOSSARY.md` | Stranger-facing vocabulary |

---

## 25. Input contradictions — re-verified 2026-08-05

Every entry the previous draft carried has been **re-checked against the current
ledger and glossary**. Withdrawals are recorded with their disposition and date
rather than deleted silently, so a reviewer can see what was checked.

### 25.1 Withdrawn — verified fixed

| Item | Disposition | Date |
|---|---|---|
| DR-025's row text still commissioning a capture nothing produces | **WITHDRAWN.** DR-025 now carries an in-place annotation narrowing it to the reference-capture definition, and DR-047 names it in its supersedes field. | 2026-08-04 |
| DR-026's vector-marking clause unnamed by DR-033 | **WITHDRAWN.** DR-033's supersedes field now names DR-026's vector-marking clause explicitly. | 2026-08-04 |
| DR-024's recorder clause annotated but not superseded | **WITHDRAWN.** DR-033's supersedes field now names DR-024's recorder clause. | 2026-08-04 |
| DR-038 / DR-042 / DR-044 status fields reading as pending after their successors landed | **WITHDRAWN.** All three condition fields now name their closing DR (Q34 by DR-045, Q50 by DR-043, the memory mechanism ruled at register review). | 2026-08-04 |
| The glossary describing the race and the golden-vector framework as live | **WITHDRAWN.** The glossary's race, V2-status, graph-ontology and golden-vector entries were rewritten. | 2026-08-04 |
| DR-053's dual act versus DR-037's value→human route | **WITHDRAWN.** DR-053 now carries an explicit precision: the value→human terminal route binds **pure** value acts only, and a dual act's value half runs phase 2 on the settled graph. That is the reading §3.2 and §5.5 adopted. | 2026-08-04 |
| DR-049 fixing the gate order without naming R9's surface | **WITHDRAWN — RULED.** DR-057 settles it: node text pre-compose, the composed verdict gets its own pass post-compose, failure takes the components-only terminal. Enacted at §12.1a S-4a. | 2026-08-05 |
| The carryover manifest's race framing and stale `OD-13` owner column | **WITHDRAWN from this document's scope.** Queued to the manifest seat and ratified with DR-062; this spec carries the verdict-model row as `OD-C-01` under artifact 4. | 2026-08-05 |
| `stage11Rollout` having no DR | **WITHDRAWN — RULED.** DR-061 ratifies `OD-S-01` (phased). The parameter now has a value; §4 row 16 carries it. | 2026-08-05 |

### 25.2 Standing — two items, both by design

1. **DR-052 amends a DR-019 value without naming DR-019.** DR-019 knob 1 sets the
   stranger-coverage rate to auto-ratchet on failure; DR-052 freezes the rate at run
   start and defers the ratchet to the next run. DR-052's supersedes field names only
   DR-021. **Disposition: standing, non-blocking.** The later ruling governs and both
   §4 row 18 and §9.2 carry the DR-052 reading; the ledger's supersedes field is the
   orchestrator's to amend, not this document's. Re-verified 2026-08-05.

2. **Q27's ratified `LLM` label versus the coverage knob's future gate.** DR-031
   ratified Q27 as the battery's single `LLM` row. DR-020 knob 8 says coverage
   *"becomes a gate only after outcome data sets the threshold"* — and a gate is code
   acting on the model's answer, which under DR-037's label law would make the row
   `HYBRID`. **Today the two are consistent**, because a diagnostic note is stored
   rather than acted on. **Disposition: standing, with a named trigger.** No DR says
   whether the label follows the knob when the gate activates; the question becomes
   live only at that activation, and the merge verdict recorded it as
   not-re-adjudicated. Re-verified 2026-08-05.

**One note recorded as a derivation, not a contradiction.** Q51 and Q54 are
labelled `HYBRID` in §3.10 by applying DR-037's label law to DR-044's text, which
describes their machine and composition limbs without printing a one-word label.

## 26. Authority audit — the lint, and its current result

This section is a **check, not a claim**. Each line names a rule, how to run it over
this file, and what it returned on the current text. A reviewer who does not trust
the numbers can re-run every one of them.

### 26.1 Lint results

| # | Rule | How to check | Result |
|---:|---|---|---|
| **L1** | **Every `Requirement` head carries an authority tag.** | Match heads of the form `**Requirement <id>**` or `**Requirement <id> (title)**` not followed by a backtick-tag. | **0 untagged** of 219 heads. |
| **L2** | **No `CANDIDATE` clause survives.** The class is empty, because DR-061 ratified the register wholesale. | Count heads tagged `CANDIDATE`. | **0.** |
| **L3** | **No candidate-imperative.** No span may use obligation grammar while claiming recommendation status. | Search for "the seat recommends", "would be", "V has not adopted", "do not build against", "open at `OD-" outside §23 and §25. | **0 occurrences.** |
| **L4** | **No open register row.** Every `OD-` row is stamped with its ruling. | Count `OD-` row heads lacking a `RATIFIED`/`CLOSED` stamp. | **0 of 51 rows unstamped.** |
| **L5** | **Every `OD-` reference resolves** to a stamped row in §23. | Diff referenced IDs against defined IDs. | **0 dangling.** |
| **L6** | **All 71 battery rows appear exactly once** in §3 with a DR and a disposition. | Extract row IDs from §3.1–3.12; compare against Q1–Q62 + R1–R9. | **71/71, no duplicate, no omission.** |
| **L7** | **The condition-marks enum is literal.** No ellipsis, no "and so on", no locally-extended copy in a sibling artifact. | Search §12.3 for an ellipsis; confirm sibling artifacts cite by reference. | **22 marks enumerated; 0 ellipses.** |
| **L8** | **No requirement contradicts a FINAL DR.** | Manual pass over every `RULED(DR-n)` tag against the ledger row it names. | **0 contradictions** — the one that existed (A-9 versus DR-045) was deleted at the previous rework. |

### 26.2 Tag distribution

| Tag | Count | What it means here |
|---|---:|---|
| `RULED(DR-n)` | **168** | Entailed by a FINAL ledger row, or by a register option DR-061 ratified by reference. |
| `CARRIED-DESIGN` | **51** | Mechanism no DR states in words; build it, expect refinement. |
| `CANDIDATE` | **0** | The class is empty. |

### 26.3 What is genuinely not settled in this document

Three things, and none of them is an open requirements question:

1. **Numeric band thresholds** — ruled to land at V's flag-register ratification
   (DR-023, DR-063 VR-2). The verdict *model* is ratified; the *numbers* have a
   named later step, because setting them before outcome data exists would be the
   invented measurement DR-039 forbids.
2. **The UI's 30 presentation cells** — **delegated** to mockup review by DR-064,
   ruled against real mockups during the UI build phase. This spec consumes their
   consequences, not their shapes.
3. **The two standing items at §25.2** — a supersedes field the orchestrator owns,
   and a label question that becomes live only if a deferred gate is ever activated.

### 26.4 Standing rule

Any future edit that introduces an obligation must carry a tag, and any edit that
re-opens a decision must add a register row and a DR. **This table is where that
check is recorded**, and it should be re-run before the final audit.

<!-- Review gate: three lenses (Codex executability, Grok red-team, Hermes
     stranger), orchestrator merges per DR-006, V accepts. Do not treat as
     accepted until then. -->






