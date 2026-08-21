ACCEPTED — DR-067 (2026-08-05) — mission REQ-V3-GREENFIELD-R1

# The V3 Quality Charter — the bar V3 is held to

Spec-pack artifact 4 of 4 (DR-047, superseding DR-001's artifact-4 wording) · Mission REQ-V3-GREENFIELD-R1
Authoring ticket: `../wayfinder/issues/15-race-victory-criteria.md` (transformed by DR-047)
Authority: `../wayfinder/decisions-ledger.md` — where this charter and a DR disagree, the DR wins.
Status: draft; awaiting the orchestrator's final audit, then V's acceptance (DR-006).

**Revision 3** (2026-08-05) — final cleanup under `../reviews/merge-verdict-delta.md` class 1, folding
the register-review rulings **DR-057 … DR-064**. **DR-063 ratified this artifact's whole register**: the
five rows in §8 are no longer proposals — they are V's rulings, and §5's force labels follow from
VR-5. Revision 2 reworked the pack review (authority labels per Codex 9, the nine honesty surfaces per
Hermes 2, the vocabulary per Hermes 7, the G3 table per Grok F5) under **DR-049 … DR-056**.

## 0. Why this document exists, how to read it, and who decided what

**The race is retired.** V ruled: *"we are not interested in competing with V2 — it's not live,
it's a prototype"* (DR-047). No formal race, no frozen victory criteria, no control-arm ceremony, no
matched-cost law, no V2 pin. V2 survives as a **reference** — where good designs and diagnosed
diseases were found (DR-033) — and humans may compare V2 and V3 outputs **informally, at will**.
That comparison is never a gate.

**What replaces it is an absolute bar:** five standing clauses, listed by V in DR-047 and expanded
below. A stranger should be able to read any item and restate what passing and failing look like.
Section 1 defines every term used here, so the GLOSSARY plus this document is enough — cross-links
carry evidence and detail, never the meaning.

**The authority key.** Every item below carries exactly one label — the discipline Codex finding 9
required: the charter may not quietly promote an author's choice into acceptance law. Since **DR-063**
ruled VR-5, the old "PROPOSED TEST" class has split in two: V adopted a **named subset** as blocking
and left the rest advisory.

| Label | Meaning |
|---|---|
| **CLAUSE(DR-047)** | Restates one of V's five clauses, in V's own scope. Binding because V said it. |
| **RATIFIED(DR-n)** | Entailed by the exact text of a FINAL decision record, which is cited. Binding. |
| **RULED(DR-n · row)** | Same force, reached through a register row V ratified wholesale — e.g. `OD-S-06` under DR-061. The row's own option text is the ruling. |
| **BLOCKING(DR-063)** | In V's named subset — the §5.2 firing-fixture table and the never-called list. **Blocks the release.** |
| **ADVISORY(DR-063)** | An operationalization V considered and left non-blocking. It may be run and reported; it never blocks a release. |

**What this charter does not do.** It does not restate the requirements spec, the carryover manifest or
the UI contract; it cross-references them, and lists contradictions (§9) without resolving any.

## 1. Charter vocabulary (GLOSSARY + this section is enough)

- **Receipts** — the stored record that lets a served number be re-derived: the raw judge artifact,
  the input hash, the contract hash, the reducer version, and the arrows used.
- **Execution digest** — the user-visible summary of everything the run executed, including attempts,
  failures and could-not-dos (DR-027). A run that did less than it implies is caught here.
- **Load-bearing node** — a node the verdict depends on: drop it and the verdict or its band changes.
  Which nodes those are is computed, not asserted (removal-based leverage and fragility, Q46/Q49).
- **Stranger coverage rate** — how many *non*-load-bearing nodes get their restatement checked; derived
  from the asker's depth/agent-count dial, ratcheting up after a failure, frozen at run start (DR-019
  knob 1, DR-052). Load-bearing nodes are always checked exhaustively.
- **Strength** — a node's final number after its supporters push it up and its attackers pull it down.
- **Value overlay** — the second layer attaching human value weights where values decide the answer;
  it never touches any strength (DR-017).
- **Register / register change** — V3's ratified table of every constant, threshold and flag (DR-023);
  a *register change* edits a value there, and is not a code change.
- **Swappable semantics** — the scoring math sits behind a **strategy interface**, so another
  implementation can replace it (H4). The two **combination operators** are *accumulate* (probabilistic
  sum) and *strict-and* (product); both must be computable on demand.
- **Scorecard** — the per-model record of measured capability and bias, built from outcome data, that
  feeds judge weighting and model routing (DR-039, DR-046).
- **Stage-11 job** — SETTLE-stage work that learns from outcomes; recalibrating a provisional number is
  one, and it requires V's sign-off (DR-012).
- **Proper score** — a scoring rule you cannot game except by stating your true belief. V3 registers one
  and applies it to settled outcomes: that is how judge weight is earned rather than declared.
- **Abstention kinds vs condition marks** — the five typed abstentions (not searched / searched and
  found nothing / measured and inconclusive / not runnable / a value choice) apply **only** to
  ignorance-ledger unknowns. Every other typed state — SKIPPED-BY-BUDGET, DEGRADED-DIVERSITY,
  UNINSTRUMENTED, ENVELOPE_EXHAUSTED, LEVERAGE_UNRESOLVED, AMBIGUOUS_ATTRIBUTION — is a **condition
  mark**, served alongside rather than instead. One answer may wear one kind and several marks (DR-051).
- **Protected core** — the work no budget may skip: provenance, abstention typing, standard-and-above
  blind verification, citation routes, and serve-conformance (DR-052).
- **The eight house rules** (DR-029), one line each: **H1** all model access goes through one provider
  interface; **H2** a second provider is addable by configuration alone; **H3** the propagation math is
  pure — no model calls, I/O, clock, randomness or database; **H4** the semantics is swappable behind a
  strategy interface; **H5** every evidence leaf is gated by the evidence subsystem, not by a model's
  say-so; **H6** agent identity is stripped before another role reads prior turns; **H7** the skeptic
  certifies that no unaddressed attack remains; **H8** stopping is driven by convergence and unresolved
  caveats, with cost only a tie-breaker.
- **P-D1 … P-D5** (the defect prohibitions as properties of V3, manifest §12.2): **P-D1** no base score
  exists without a judgement; **P-D2** the engine/operator identifier is a recorded input, never a
  source literal; **P-D3** counting is by provenance, so N restatements of one source contribute once,
  at the strongest; **P-D4** every weight-bearing served number carries its own kind, source and
  producer; **P-D5** judge weight is a function of recorded outcomes and the learned path is reachable.

## 2. Clause 1 — the best dialectical engine to date, judged by V on outputs

**The clause.** V3 aims to be the best dialectical reasoning engine built to date. The judge is
**V**, and the evidence is **outputs** — real answers to real questions, with their receipts.

- **A1.1** · **RATIFIED(DR-027)** — **The judgment reads outputs, not reports.** An answer is
  judgeable only when served with its per-node provenance and its execution digest; an agent's summary
  of how well the run went is not evidence.
- **A1.2** · **ADVISORY(DR-063)** — **A recorded judging set.** V is shown served answers to a written
  question set spanning the abstention matrix's classes and risk tiers (DR-011, DR-012), recorded so
  the same questions can be re-served after a change. Its contents are V's to choose.
- **A1.3** · **RATIFIED(DR-039)** — **No proxy metric may stand in for V's judgment.** Numbers may
  inform V; none may be declared "the bar", and none may be minted to manufacture confidence.
- **A1.4** · **RATIFIED(DR-047, DR-033)** — **V2 comparison is informal and optional.** V may run the
  same question through V2 and compare by eye at will. **No V3 test, gate or acceptance item compares
  a V3 output to a V2 artifact, at any level** (manifest §12.3; spec Z-2).
- **A1.5** · **CLAUSE(DR-047)** — **What failure looks like.** V reads the outputs and cannot tell what
  the engine did, how sure it is, or what would change its mind. That is a charter failure.

## 3. Clause 2 — human-oriented answers: the whole-graph stranger law is the acceptance test

**The clause.** The answer is for a human who knows nothing about the machinery. V's standing test
(`../wayfinder/GLOSSARY.md`): could the person who asked read **all nodes and the verdict** and
correctly tell someone else what the answer is, how sure we are, what would change our mind, and what
they should now do differently? DR-018 amended R9 to the **whole-graph** form; DR-031 ratified it.

- **A2.1** · **RATIFIED(DR-018, DR-031, DR-019)** — **Whole-graph coverage, not a readable summary over
  an unreadable graph — and two different obligations, kept apart.** Every node must be **restatable**:
  its text is written in human language at generation time, so a stranger could restate it. Which nodes
  **carry a checked restatement** is the sampling question A2.2 answers — load-bearing always,
  non-load-bearing at the asker-derived rate. "Restatable" is a property of every node; "checked" is a
  property of the sampled set.
- **A2.2** · **RATIFIED(DR-019, DR-052)** — **Coverage runs at the rate knob 1 sets:** load-bearing
  nodes exhaustively, always; non-load-bearing at the asker-derived rate, ratcheting up after a failure,
  frozen at run start with the ratchet applying next run. The rate in force is recorded, so a run that
  passed cheaply is not mistaken for one that passed hard.
- **A2.3** · **RATIFIED(DR-018, DR-049)** — **The test is a serving gate, not a report.** A failing
  load-bearing node **blocks serving**, and it blocks *first*: the gate order is **R9 → Q53 objection
  visibility → conformance → Q51 provenance**, and the conformance judge may never demand an edit that
  violates R9.
- **A2.4** · **RULED(DR-061 · `OD-S-06`)** — **The one restatement schema, with a verdict-only action
  consequence.** V ratified option (a): a **node** carries its claim, its certainty, and what would
  change it; the **verdict** adds the fourth field, what the reader should do differently. A per-node
  action consequence is *not* required — it invites invented actions on leaves where none exists. The
  field list lives in spec §12.7 and is cited by name, so it stops drifting. **No bare numbers in the
  top layer** — "scored 0.62 with 0.31 uncertainty" is the shape the law forbids (manifest §6.2).
- **A2.5** · **RATIFIED(DR-044, DR-049, DR-052, DR-058, DR-060a)** — **The served text is machine-checked
  against the computed facts, and the judge role cannot be skipped.** One model writes the text from the
  fact bundle, a second judges text↔facts conformance, the machine enforces the verdict.
  **`max_recompose = 2`**; after the second failure the answer serves **components-only with a visible
  DEFECT badge** — never blank, never unchecked prose. **Scope:** load-bearing sentences are always
  judged; non-load-bearing are sampled at the frozen stranger rate — the protected core forbids skipping
  the judge **role**, it never mandates exhaustive sampling. **Size:** an oversized bundle composes in
  multiple passes by load-bearing priority, with residuals, badges and marks **machine-injected** outside
  model discretion, so silent truncation is impossible; past the declared hard budget, components-only.
- **A2.6** · **RATIFIED(DR-031)** — **The riders carry.** Q27's uncovered-scope statement ("what the
  split does not cover") serves in plain language; Q28's "say it back cold" applies to the verdict.
- **A2.7** · **RATIFIED(DR-048, DR-054)** — **The nine honesty surfaces reach the reader** (canonical
  list, identical to spec §12.5): (1) typed abstention badges · (2) per-node provenance and ways of
  knowing · (3) defeaters as visible first-class attacks · (4) STALE / UNDER-REVIEW badges · (5) value
  markers and reversal points · (6) investigate-deeper · (7) UNDER-EXPLORED · (8) SKIPPED-BY-BUDGET and
  fallback labels · (9) **builds-on-previous disclosure**. They travel as typed projections; the full
  fact bundle and conformance record are fetchable through an authorized inspection/replay handle.

## 4. Clause 3 — a clean, maintainable codebase

**The clause.** The code a person opens in a year must be readable, and each behavior must live in
exactly one place.

- **A3.1** · **RATIFIED(DR-030, DR-056)** — **One of each.** One graph, one scoring arithmetic, one
  serve layer, with the organ↔stage table now FINAL rather than vetoable. Two implementations of one
  behavior is a defect.
- **A3.2** · **ADVISORY(DR-063)** *(carried design, manifest §6.2)* — **Invariants are enforced once, at
  write time**: node type, lifecycle vocabulary, non-blank claim, path/depth consistency, acyclicity.
  A rule enforced only at a boundary is one the rest of the system does not have.
- **A3.3** · **RATIFIED(DR-027)** — **No silent failure.** Every caught failure is typed **and written
  to the ledger**; a swallowed exception is a defect, not a style preference.
- **A3.4** · **RATIFIED(DR-029)** — **The eight house rules are required behaviors.** *(Expressing each
  as a standing test is **ADVISORY(DR-063)**, manifest §12.2 layer 3.)* A house rule that cannot be
  expressed as a gate is one V3 cannot prove it kept.
- **A3.5** · **RATIFIED(DR-023)** — **Constants live in the ratified register, never as source
  literals.** Selecting behavior by a source literal is P-D2's prohibition.
- **A3.6** · **ADVISORY(DR-063)** — **The maintenance test** (clause 2's law pointed at the code): an
  engineer new to the repo can name, for any served behavior, the single place where it is decided. If
  the honest answer is "two places", A3.1 has already failed.

## 5. Clause 4 — NO ORPHANED MODULES

**The clause** · **CLAUSE(DR-047)**. *Everything shipped is reachable and called.* Dead code that eats
tokens and processing is indicted at code level — the code-level echo of the disease this mission
diagnosed twice in V2: a check that exists, costs money, and cannot fire.

**The diseases, by reference:** **D5**, calibration whose learning path is unreachable, so every judge
weighs a constant 1.0 while the system presents itself as a weighting system (DR-026; manifest §10.5);
**the dead check**, a disagreement gate un-fireable against its own data — largest observed spread 0.11
against a 0.35 threshold (DR-032; manifest §5.2i); and **never-called surfaces** — the ten V2 UI
surfaces plus the dual-transport seam (DR-048) and the unused self-consistency estimator (manifest §3.1).

**Definition a stranger can apply.** A shipped unit — module, function, endpoint, table, migration,
config flag, prompt — is **live** if (a) it is reachable from a declared entry point and (b) it is
actually called on a real run. Anything else is an orphan.

### 5.1 The five gates

- **G1 — Reachability audit** · obligation **CLAUSE(DR-047)**, mechanism **ADVISORY(DR-063)**. Every
  shipped unit is reachable from a **named** entry point, and the audit publishes the entry-point list
  it walked — an unnamed entry point is how orphans hide.
- **G2 — Call-coverage audit** · obligation **CLAUSE(DR-047)**, and its output — the **never-called
  list** — is **BLOCKING(DR-063)**. The acceptance run marks every shipped unit called at least once;
  every entry on the list is deleted or exempted before release.
- **G3 — The un-fireable-path test** · **RATIFIED(DR-032)** for the disagreement flag; the §5.2 fixture
  table is **BLOCKING(DR-063)**; the generalization to every other branch is **ADVISORY(DR-063)** (spec
  Z-1 states the same discipline). Every gate, threshold, branch or refusal path that can block,
  downgrade, flag, route or suppress is **demonstrated firing on real data before it ships**. A gate
  that cannot fire is dead code wearing a gate's clothes.
- **G4 — Configuration-reachability** · **RATIFIED(DR-026)** for the learned path, **ADVISORY(DR-063)**
  as generalized. No configuration branch may be permanently unreachable: every branch of every
  register flag is exercised by a test constructing a configuration a **production caller can actually
  produce** — the precise failure D5 records.
- **G5 — Dead-cost indictment** · **CLAUSE(DR-047)**. A unit spending tokens or compute whose output no
  served surface, no ledger row and no downstream decision consumes is an orphan **even if reachable
  and called** — V2's computed-then-discarded "why it matters" sentence is the shape.
  **Exemption class `measurement_lane`** · **ADVISORY(DR-063)**: spend whose only consumer is the
  **scorecard** (DR-039, DR-046) is exempt, provided the consumer is named on the lane and its output
  demonstrably reaches the scorecard. Without this class, G5 deletes the judge panel that P-D5's
  cold-start exit depends on.

### 5.2 The G3 launch-demo table — **BLOCKING(DR-063)**

Spec §22.1 already carries launch gates for replay, ledger completeness, the disagreement flag, symmetry
both ways, cold-start exit, memory inertness and firing, stranger coverage, overlay detachment and the
zero-call proof. **These are the serve blocks it does not name** (Grok F5); each needs one recorded
firing fixture in the acceptance bundle, and a missing fixture blocks the release.

| # | Blocking path | The fixture must demonstrate | Authority |
|---|---|---|---|
| 1 | **Q51 locator gate** | A load-bearing claim with a missing locator **blocks serving**; a reasoning-only claim is downgraded to hypothesis-plus-research-plan. | RATIFIED(DR-044, DR-049) |
| 2 | **Q53 objection visibility** | An answer whose strongest live objection is not surfaced is blocked; the residual objection appears as a fact-bundle field. | RATIFIED(DR-049) |
| 3 | **R9 stranger block** | A load-bearing node whose restatement fails blocks serving *before* conformance runs. | RATIFIED(DR-018, DR-049) |
| 4 | **DR-014 cap** | A run with no second lineage serves, cannot reach the top band, carries "independent critique unavailable" with its reason, and records the lift condition. | RATIFIED(DR-014) |
| 5 | **DR-015 STALE** | A fired revision trigger puts a visible STALE / UNDER-REVIEW badge on a served answer, never silently. | RATIFIED(DR-015) |
| 6 | **Budget-skip marker** | An enrichment row skipped under the envelope serves with a visible SKIPPED-BY-BUDGET mark; a protected-core row refuses the skip. | RATIFIED(DR-021 knob 9, DR-052) |
| 7 | **Envelope exhaustion** | Exhaustion hard-stops and serves already-verified components with ENVELOPE_EXHAUSTED — never a silent timeout. | RATIFIED(DR-052) |
| 8 | **Serve termination** | Two conformance failures produce components-only plus a visible DEFECT badge. | RATIFIED(DR-049) |
| 9 | **Leverage bound** | After the K=1 deepening round, recombination proceeds and LEVERAGE_UNRESOLVED is served, naming the carrying piece. | RATIFIED(DR-050) |
| 10 | **Cycle law, three layers** | A cycle-closing edge is refused at construction; a cycle-creating write is rejected; a cycle reaching compute raises a typed error. | RATIFIED(DR-056) |
| 11 | **Verdict-R9, post-composition** | Node text is stranger-checked before composition; the composed **verdict** then takes its own R9 pass, and a verdict-R9 failure goes straight to components-only + DEFECT — no new loop. | RATIFIED(DR-057) |
| 12 | **Degraded-mode projections and replay eviction** | In components-only mode the **reversal point** and **builds-on-previous disclosure** still render, as structured projection fields with no composed prose; and a component number that fails replay is **evicted** with a typed missing-number mark while the rest serves + DEFECT — one number lost, never the answer. | RATIFIED(DR-059) |

**Deferred gates — NOT SHIPPED until fireable, never shipped-dark.**

| Gate | Status at launch | Authority |
|---|---|---|
| **Citation hard-kill** | The eight typed citation failure routes ship. The hard-kill gate does **not** ship until V3's character-level quote matcher ships and validates; it must not exist as code that cannot fire. | RATIFIED(DR-020 knob 7) |
| **Coverage-as-gate** | Ships as the diagnostic UNCOVERED-SCOPE note only. It becomes a gate after outcome data sets the threshold, and not before. | RATIFIED(DR-020 knob 8) |

### 5.3 Acceptance items

- **A4.1** · **ADVISORY(DR-063)** — G1, G4 and G5 run in continuous integration and report. They do not
  block on their own; what blocks is A4.2's list and A4.4's fixtures.
- **A4.2** · **BLOCKING(DR-063)** — The never-called list ships with every release, empty or itemized,
  and a release with an unexplained entry does not go out.
- **A4.3** · **RATIFIED(DR-063 · VR-4)** — Orphan exemptions are **configuration-class only**, granted
  by **V alone**, and dated. An undated or non-V exemption is not an exemption.
- **A4.4** · **BLOCKING(DR-063)** — Every path in §5.2 has a recorded firing fixture in the acceptance
  bundle, named by fixture id; the deferred rows carry a NOT-SHIPPED attestation instead.
- **A4.5** · **ADVISORY(DR-063)** — The acceptance bundle names the entry points G1 walked and the run
  G2 measured.

## 6. Clause 5 — research-upgradeable

**The clause.** Validated findings land at each step **without re-architecture** — meaning no change
to call sites, wire shapes or stage boundaries: a new implementation behind an existing interface, or
a new value in the register.

**The seams that already make this true** (ruled; listed so they are not re-litigated): swappable
semantics behind a strategy interface with both combination operators computable on demand
(**RATIFIED(DR-029 H4)**); always-evolving weights and capabilities updated every factually-settled
round, with an exploration share and a Postgres model ledger (**RATIFIED(DR-046, DR-024)**); provisional
values as register rows rather than literals (**RATIFIED(DR-023, DR-012)**); a detachable value overlay
that provably touches no strength (**RATIFIED(DR-017)**); one graph substrate (**RATIFIED(DR-030,
DR-056)**).

- **A5.1** · **ADVISORY(DR-063)** — **The upgrade drill.** Land three changes and record the diff: a
  second semantics implementation swapped in by configuration; a changed weight source; a changed
  threshold — each with **no call-site edits**. A demonstration, not a promise.
- **A5.2** · **RATIFIED(DR-012)** — **Every provisional number names its owner, its recalibration
  trigger and who signs off** — recalibration is a Stage-11 job requiring V's sign-off. A number with
  no recalibration path is a constant pretending to be a finding.
- **A5.3** · **ADVISORY(DR-063)** — **The expected cost of adopting a validated finding is a register
  change plus a re-run.** Anything larger is reported to V as an architecture event, not absorbed.
- **A5.4** · **RATIFIED(DR-046, DR-026)** — **Learned paths must execute, not merely exist.**
  Cold-start exit, judge-weight learning and scorecard updates are G3 subjects: an upgrade path that
  cannot run is the same defect as a gate that cannot fire.
- **A5.5** · **ADVISORY(DR-063)** — **Research findings land as data** — register rows, scorecards or a
  strategy implementation, not the graph shape, the ledger schema or the serve contract.

## 7. Standing acceptance items (cross-clause)

- **S1** · **RATIFIED(DR-034, DR-060b, DR-063 · VR-3)** — **The replay launch ceremony.** V3 permanently
  refuses to serve a number it cannot recompute from its frozen records, with **no model in the replay
  path**, continuously self-tested; **at launch, one independent replay of recorded runs must pass
  exactly**. **Independent** = a separate execution sharing no code path with the serving run beyond the
  published arithmetic, reading only frozen records, run by a person or job that did not produce them.
  **Exactly** = byte-identical served **numbers**. **Scope:** the serve *decision* replays as **stored
  data** — the conformance verdict is an input artifact, never re-generated — so the ceremony is
  deterministic and no model runs inside it.
- **S2** · **RATIFIED(DR-026, DR-028, DR-033)** — **The five defect prohibitions as property tests.**
  P-D1 … P-D5 (defined in §1, stated in full at manifest §12.2) must all be green over the manifest's
  scenario list, alongside the two literature vectors. **This charter does not restate them.**
- **S3** · **RATIFIED(DR-027)** — **The ledger tells the truth.** Everything executed has a row, the
  digest is user-visible, and no served sentence implies a check the ledger says did not run.
- **S4** · **RATIFIED(DR-055)** — **Multi-maker is a launch gate.** Standard-and-above tiers execute
  real **different-maker** critique from day one. "Degraded single-maker mode" is **transient
  provider-unavailability handling only** — the DR-014 cap-and-label path — and never a legal standing
  configuration at standard+: a deployment that cannot execute multi-maker there does not pass launch.
- **S5** · **RATIFIED(DR-052)** — **The protected core is never budget-skipped:** provenance,
  abstention typing, standard+ blind verification, citation routes, and serve-conformance. Exhaustion
  hard-stops with ENVELOPE_EXHAUSTED rather than quietly dropping one of these.

## 8. The charter register — **RATIFIED (DR-063)**, 2026-08-05

This was the DRAFT — V RULES register. **V ratified all five rows** at the register review, adopting
each row's recommended option by reference to the row's own option text (DR-063). Nothing here is open;
the options are kept because the ruling *is* the option text. **VR-1 and VR-2 are the spec's `OD-C-02`
and `OD-C-01`**, ratified in the same sitting by DR-061.

### VR-1 (`OD-C-02`) — The disagreement-flag fire bar · **RATIFIED(DR-063)**

**Ruled:** the three-part standard — **(c)** shown-to-fire-both-ways as the **adoption bar**, **(a)**
fires-at-least-once as the **launch-day minimum**, **(b)** rate-consistency as a **standing
SETTLE-stage monitor** once outcome data exists. The bar DR-032 left unstated is now stated.

**The decision it settled.** DR-032 requires V3's judge-disagreement flag to "demonstrably fire" where
V2's provably could not, and states no bar. **What it changed:** what launch has to show, and whether a
flag that never fires can still pass.

| # | Option | What launch must show | Trade-off |
|---|---|---|---|
| **a** | Fires at least once against real spreads | One recorded real run where the flag fired | Cheap and unambiguous, but satisfiable by one hand-picked case; cannot tell a working flag from a lucky one |
| **b** | Fires at a rate consistent with observed spreads | A spread distribution plus an expected rate the observed rate matches | Strongest evidence, but needs a calibrated expectation nobody has; adopting it now would mint a measurement (DR-039) |
| **c** | Shown to fire **both ways** before adoption (`../research/32-weight-derivation.md` §Q5) | One real case that fires **and** one that correctly does not | Proves the gate is dead in neither direction; costs a labelled *should-not-fire* case that nobody has specified yet |

**Recorded cost of the ruling:** (c) requires a labelled *should-not-fire* case; pinning that case is
part of building the fixture, and the fixture is BLOCKING under §5.2.

### VR-2 (`OD-C-01`) — Verdict band semantics · **RATIFIED(DR-063)**, numbers pending DR-023

**Ruled:** option **(ii)** — the **verdict-model names and the per-cell principle** are adopted; **all
numbers are deferred** to V's flag-register ratification (DR-023). A threshold written here would be an
invented measurement (DR-039).

**The decision it settled.** Where V3's supported / unsupported boundaries sit and what a band means,
given that there are no default base scores left to dilute them and that bands interact with the
abstention-price matrix. **What it changed:** what a reader is told the answer *is*.

**Options and trade-offs.** (i) **Global thresholds** — one supported/unsupported pair for every
question: simplest, but treats a casual lookup and a high-stakes causal claim identically, the precise
thing DR-011 rejected for abstention price. (ii) **Per-cell thresholds** — a pair per question class ×
risk tier: matches the ruled abstention structure and lets high-stakes cells demand more, at the cost of
a larger register. (iii) **No numeric bands** — serve only the reader-facing statement plus receipts:
hardest to game, but loses the one-word summary most readers want.

**The ruled design.** Three served states — **SUPPORTED**, **CONTESTED**, **UNSUPPORTED** —
with a **typed abstention** as a separate thing entirely, never a band and never a mid-range number
(DR-051 keeps the five abstention kinds for ledger unknowns and lets condition marks ride alongside).
Thresholds are register rows (DR-023), provisional like DR-012's seeds. V2's "below 0.5 coverage, band
`insufficient_scoring` while still printing the raw strength" dies with D1 and D4; its successor is the
manifest's OD-07 (at what fraction of abstained children a parent refuses to emit a number), and until
that rules, such a parent serves components with no band. Every band names its abstention-price cell,
its way-of-knowing ceiling, and whether the rival operator would have flipped it. On mixed questions
the answer carries two labeled sections — "what is true" and "what follows given your values" — the
value half serving a conditional plus its reversal point, never a bare band (DR-053, DR-017).

**Residual, tracked elsewhere:** whether "confidence band" is a second axis, an alias, or a derived
presentation of the verdict band. The pack routed that to the single canonical verdict model (GLOSSARY),
which is not written yet — contradiction 4 below.

### VR-3 — What "independent" and "exactly" mean in the replay ceremony · **RATIFIED(DR-063, DR-060b)**

**Ruled:** option **(ii)** — a separate execution sharing no code path with the serving run beyond the
published arithmetic, reading only frozen records, run by a person or job that did not produce them.
Rejected: (i) the same code in a fresh process, which proves little, and (iii) an independent
re-implementation, disproportionate at launch. **Exactly** = byte-identical served **numbers**; and per
**DR-060(b)** the serve *decision* replays as stored data, so no model runs inside the ceremony. The
operative statement, with its pass/fail condition, is **S1**.

### VR-4 — Orphan-exemption authority, and what unit is under consideration · **RATIFIED(DR-063)**

**Ruled:** orphan exemptions are **configuration-class only**, granted by **V alone**, and **dated**.
The three ways a flag can exist, which the ruling's option text distinguishes: **(1) reachable code
behind an off-by-default flag** — a production caller could produce the configuration, so it is G4's
subject, not an orphan; **(2) dormant code behind a flag no production configuration can set** —
unreachable in practice, the D5 shape, the case the exemption exists for; **(3) configuration data with
no code** — no executable unit at all. An exemption names the run that will call the unit and expires at
the next release; an expired exemption fails the build. Stated as an acceptance item at **A4.3**.

### VR-5 — The blocking force of this charter's derived tests · **RATIFIED(DR-063)**

**Ruled:** option **(ii)**, the **named subset**. The **§5.2 firing-fixture table** and the
**never-called list** block the release; the drills and audits — A1.2, A3.2, A3.6, A4.1, A4.5, A5.1,
A5.3, A5.5, the generalized G1/G3/G4 mechanisms and the `measurement_lane` exemption — are **advisory**.
Rejected: (i) the whole set as blocking, at real build cost, and (iii) none at all. The reasoning V
adopted: the fixture table catches the exact disease clause 4 names, and audits are cheaper to add later
than to unwind. Every item in this charter now carries the label that follows from this ruling.

## 9. Contradictions (live list, never resolved here)

Each entry was re-verified against the **current** files on 2026-08-05. Withdrawals are recorded rather
than deleted, so a reader who saw revision 2 can tell what happened.

1. **Ticket 15 still names the deleted output.** Its §Settles names `spec-pack/race-criteria.md`;
   ticket 31 and the map were repaired to `quality-charter.md`, the ticket was not.
2. **Clause 1 and DR-039 sit in tension by design.** Clause 1 makes acceptance a human judgment on
   outputs; DR-039 forbids invented measurements. Nothing forbids converting V's judgment into a score,
   and A1.3 is the charter's reading of DR-039, not a separate ruling.
3. **Clause 4's evidence base is partly excluded from the defect register.** Dead checks are explicitly
   *not* in D1–D5 by V's steer (`GLOSSARY.md`), yet DR-047 clause 4 indicts that exact disease at code
   level — one behavior outside one register and inside a charter clause.
4. **The canonical verdict model does not exist yet.** VR-2 ratifies the state names, and the manifest
   routes OD-14's residue — the verdict-state token and its allowed combinations — to a single canonical
   verdict model in the GLOSSARY. That model is unwritten, so "verdict band" and "confidence band" are
   still used across four artifacts with no defined relation, and which one DR-014 caps is unstated.
5. **The pack's closure ledger and this register disagree on size.** Spec §23 block C counts **2**
   charter-owned rows (`OD-C-01`, `OD-C-02`); this register carries **5** — DR-063 ratified all five,
   including VR-3, VR-4 and VR-5, which the spec's count never included.
6. **"Not shipped" versus "auto-activating".** §5.2's deferred rule forbids shipping code for a gate
   that cannot fire; DR-020 knob 7's hard-kill gate **auto-activates** when the quote matcher validates,
   implying its code is present and inert until then. Whether auto-activation counts as shipped-dark is
   unruled.
7. **Clause 4's scope over pure configuration data.** VR-4 (DR-063) grants exemptions for the
   configuration class and separates code-behind-a-flag from data-with-no-code, but no ruling says
   whether class (3) — a register row with no executable unit — is inside clause 4's reach at all.

**Withdrawn 2026-08-05, each re-verified against the current file:**

- ~~The race is still live in the manifest~~ — manifest §1 now records the retirement in V's own words;
  §12 carries no race framing.
- ~~OD-13's owner column is stale~~ — the manifest's table now reads "REROUTED — DR-047 … tracked in
  artifact 4's register".
- ~~DR-032 is FINAL while its bar is a proposal~~ — DR-063 ruled the three-part bar (VR-1).
- ~~The lenses pull opposite ways on G3's force~~ — DR-063's VR-5 fixed it: fixture table and
  never-called list blocking, the rest advisory.
- ~~DR-055's two halves do not coexist~~ — the ledger's precision limits degraded single-maker mode to
  transient provider unavailability, never a standing standard+ configuration.

<!-- Final audit gate: orchestrator lint per merge-verdict-delta class 1, then V accepts (DR-006).
     Do not treat as accepted until then. -->
