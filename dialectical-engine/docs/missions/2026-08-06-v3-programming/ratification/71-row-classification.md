> **RATIFIED — `DR-108`, 2026-08-07 (VG-02 sitting).** V ruled: *"**THE 71-ROW
> SPLIT IS RATIFIED WHOLESALE** — 69 correctness / 2 enrichment (Q27, Q49); all
> 30 protected-core rows correctness; **LRD-1 DISCHARGED** (charter §5.2 row 6's
> fixture constructible on Q27+Q49)."* This document is **law**, not a proposal.
> It was authored under **DR-093**, which required *"architecture proposing the
> full 71-row split, V ratifying once"* — that once is DR-108.
>
> **DR-093's standing interim state — *"until ratified, rows behave as
> correctness (never skipped)"* — is DISCHARGED.** The two enrichment rows
> (**Q27**, **Q49**) are now budget-skippable under DR-021 knob 9 / DR-052, each
> skip carrying its visible `SKIPPED-BY-BUDGET` mark (honesty surface 8); the
> other **69** are correctness and refuse the skip.
>
> **All riders ratified with the wholesale yes** (§7): **CP-9** — *"standard-and-
> above governs activation, never class"*; **CP-10** — *"a limb-split row takes
> its strictest limb's class"*; and **rider (d)** — C-6 / C-7's no-feedback
> contract **PROMOTED from carried-design to ruled evidence**. DR-108 records
> that the promotion was **asked-and-answered**: *"LRD-1 and C-6/C-7 defined for
> V before ruling."*
>
> **`LRD-1` is DISCHARGED** — `FX-C52-06` is constructible, with **R9** as the
> fixture's named refusing row (§5.3). Status folded by ticket **PRE-14**,
> 2026-08-07.

# The 71-row correctness/enrichment split — the DR-093 ratification package

Mission PROG-V3-R1 · ticket **PRE-06** (`t_f6e8547d`) · 2026-08-06 · seat: Claude
worker (Opus 5), authorized under **HERMES AUTHORIZED NEXT** epoch 1 wave 2.

**Authority.** **DR-093** (Q-24): *"The per-row correctness/enrichment
classification is produced by **architecture proposing the full 71-row split, V
ratifying once** (one sitting, alongside the register — the wholesale-register
pattern of DR-061/DR-062). Clarified on the record: this is one-time design-time
config, fully automatic at runtime, no human in any user's loop. Until ratified,
rows behave as correctness (never skipped)."*

**Row inventory.** The **exact 71-row identity space of PRE-05**
(`docs/architecture/10-row-contracts.md` §6, §7.1) — Q1…Q62 and R1…R9, with
PRE-05's `MACHINE` / `HYBRID` / `LLM` labels carried unchanged. **One inventory,
two documents**: PRE-05 says *when* a row runs, this document says *whether it may
be shed for money*. No id, label or count is minted here.

**Reviewers on handoff:** Codex + Grok (DR-101's maker-diversity diamond for a
Claude-authored ticket).

**Revision 2 — what the fix cycle changed.** Grok APPROVED rev 1; Codex returned
CHANGES REQUESTED with four findings, all four accepted and fixed. **No row
changed class**, the protected-core map is unchanged, and the checksum
(69 / 2 · 13 / 57 / 1 · 71) is unchanged.

| Finding | Change |
|---|---|
| **1 · Q49's basis was labelled RULED; it is `[CD]`** | §4.9 Q49 and **CP-1** now state that T-2 rests on **C-6 / C-7, both `CARRIED-DESIGN`**, that DR-031 ratified only the MACHINE classification, and that no later DR promotes them. Carried onto the surface as **rider (d)**. §3.1 now records the evidence grade of every conjunct as a standing discipline. |
| **2 · The "only Q27 satisfies `FX-SRV-16`" claim was not established** | New **§5.1** quotes `FX-SRV-16` in full: the mark is **answer-scoped with an affected-node set**, so "node-scoped vs answer-scoped" was the wrong discriminator and **the uniqueness claim is withdrawn**. §5.2 re-grounds both rows on **scope of work**, §5.4 restates the brittleness accurately (the existence condition is discharged **twice**), and **SP-C1** hands the affected-set derivation to S9/S5 rather than assuming it. |
| **3 · §4 labels were not PRE-05 verbatim** | All **71** `Row · label` cells now copied **verbatim** from `10-row-contracts.md` §6 (machine-diffed to zero mismatches); the POLICY_BLOCKED annotations on Q14 / Q40 / R6 moved out of the identity cell into the Ground column. |
| **4 · The no-number attestation was false** | §1 and §9 narrowed to *"invents no numeric value; every numeric value that appears is quoted with its source"*, with the two-item inventory named. Q45's paraphrase (*"nearly ten times"*) replaced by the spec's verbatim figures. |

---

## 1. What this document is, and what it is not

**What it is.** The classification spec §21.2 requirement **N-14** demands:
*"Which rows are correctness and which are enrichment must be classified **per
row, once**, and the classification is part of the row's contract rather than an
operational setting."* All 71 rows, each with the option it adopts and a
one-line justification tied to the protected core and to the charter's needs.

**What it is not.**

- **It is not an activation decision.** A **correctness** row can still file
  `INACTIVE` when its predicate says so (PRE-05 §6) — that is the row not being
  *owed*, which is a different thing from the row being *shed for cost*. The two
  fields are orthogonal and both are per-row contract fields.
- **It is not a runtime setting.** DR-093 on the record: **one-time design-time
  config, fully automatic at runtime, no human in any user's loop.** Nothing here
  puts a person in a user's path.
- **It invents no numeric value** (AC-76 · DR-039). **Every numeric value that
  appears is quoted with its source named**, and the inventory is short enough to
  check: **DR-050's `K=1`** deepening bound (§2, quoting spec §10.2 C-5a) and
  **the spec's worked composition case** (§4.9 Q45, quoted verbatim from spec §3.9
  Q45). Nothing else numeric appears except **counts of rows**, each checked
  against PRE-05 §7.1 and spec §3.13's checksum. *(This attestation was narrowed
  in rev 2: the earlier "no cap appears" wording was false against §2's own
  quotation.)*
- **It does not decide the envelope's values.** N-9's envelope is derived from
  asker depth × risk tier; those are register rows, and they are V's at their own
  step.
- **It does not rule the questions it finds.** §6 lists them for V.

---

## 2. The law this classification instantiates

Quoted, because every filing in §4 appeals to it.

**DR-021 knob 9** (founding ledger): *"budget override = **TYPED SKIP FOR
ENRICHMENT ONLY** — correctness/safety rows (provenance, abstention typing,
standard+ blind verification, citation routes) can never be budget-skipped; every
skip carries a visible **SKIPPED-BY-BUDGET** marker."*

**DR-052** (founding ledger): *"exhaustion → **typed enrichment skips first**,
then hard stop serving already-verified components with `ENVELOPE_EXHAUSTED` —
never a silent timeout. **PROTECTED CORE (never skippable): provenance,
abstention typing, standard+ blind verification, citation routes, AND
serve-conformance (added).**"*

**Spec §21.2 N-11 — the protected core** `RULED(DR-052)`: *"**Never skippable,
whatever the envelope says:** provenance · abstention typing ·
standard-and-above blind verification · citation routes · **serve-conformance**.
The last is the addition that matters: conformance is the only machine
enforcement standing between a model's prose and a reader, and without naming it,
budget law permitted skipping it and recording a legal `SKIPPED-BY-BUDGET` while
the serving philosophy quietly stopped operating."*

**Spec §21.2 N-12 — orthogonality** `RULED(DR-052)`: *"The knob classifies
**which rows** may be skipped; the envelope bounds **the whole run's product**
and provides a terminal. Neither substitutes for the other."* **This document is
the knob's half only.**

**Charter §5.2 row 6 — BLOCKING(DR-063)**: *"An enrichment row skipped under the
envelope serves with a visible SKIPPED-BY-BUDGET mark; a protected-core row
refuses the skip."* Authority: RATIFIED(DR-021 knob 9, DR-052). Fixture
`FX-C52-06`, slice **S9**, launch-readiness dependency **LRD-1**.

**Two riders the classification must not break:**

- **`SKIPPED-BY-BUDGET` is itself honesty surface 8** (spec §12, the nine
  surfaces, `RULED(DR-048)`). An enrichment skip is therefore never a silence: it
  is a served, typed mark. That is the whole reason a row *can* be enrichment.
- **Cost may not terminate a correctness loop.** Spec §10.2 C-5a states it in
  terms: *"because a correctness row may never be budget-skipped (§19 H8), **cost
  could not terminate the loop either**"* — which is why DR-050's K=1 bound
  exists. A classification that tried to make an expensive loop terminate by
  calling it enrichment would be re-litigating a ruled bound.

---

## 3. The standing option text — the two options every row chooses between

**DR-061's pattern:** V ratifies **by reference to the option text recorded
here**. Because every row faces the *same* binary, the option text is stated once
and each row in §4 adopts **(a)** or **(b)** by reference to it.

> **Option (a) · CORRECTNESS — never budget-skippable.** The row is owed whenever
> its predicate says it is owed, and the envelope may not shed it. A run short of
> envelope takes N-10's other limb instead: the **hard stop that serves the
> already-verified components with `ENVELOPE_EXHAUSTED`**. Cost of choosing (a):
> the envelope binds sooner on big runs.
>
> **Option (b) · ENRICHMENT — skippable, loudly.** Under envelope pressure the
> row may be skipped **first** (N-10's ordering), and the skip serves as a visible
> **`SKIPPED-BY-BUDGET`** mark — an **answer-scoped condition mark whose affected
> set is stored once and projected per node at read time** (`FX-SRV-16`; see
> §5.1). Cost of choosing (b): the row's contribution goes dark on exactly the
> biggest, most expensive runs.

### 3.1 The test applied to every row — three conjuncts, all required for (b)

A row is proposed **enrichment** only where **all three** hold. Any single
failure files the row **correctness**.

| # | Conjunct | Source |
|---|---|---|
| **T-1** | The row is **not** one of the five protected-core heads and is not a named dependency of a charter §5.2 blocking fixture. | DR-052 · N-11 · charter §5.2 |
| **T-2** | The row's output **gates nothing and feeds no number** — no other row's predicate reads it, no weight, strength, band, confidence or serving block derives from it. | charter G5's dead-cost logic inverted; §21.2 N-12 |
| **T-3** | Skipping it **cannot make any claim read as better-verified than it is** — the visible `SKIPPED-BY-BUDGET` mark is a *complete* account of what was lost. | OD-A-04's ruled ground: *"a check which disappears under pressure is the dead-check class this pack exists to eliminate"* |

**A fourth filter, applied as a check rather than a conjunct: the nine honesty
surfaces** (spec §12, `RULED(DR-048)`). A row that **produces** one of the nine —
typed abstention badges (Q55) · per-node provenance (Q51) · defeaters as visible
first-class attacks (Q26) · STALE/UNDER-REVIEW (DR-015, Q18/Q58) · value markers
and reversal points (DR-017, Q50) · investigate-deeper (DR-045, Q34) ·
UNDER-EXPLORED (DR-016, Q62) · SKIPPED-BY-BUDGET and fallback labels (Q8/R7) ·
builds-on-previous disclosure (§17.6) — **is correctness**, because shedding it
deletes a surface the reader is owed by ruling. No proposed enrichment row
produces one.

**The evidence grade of each conjunct is recorded, not blurred** (spec §3's
`R-AUTH-3` discipline). A conjunct may be satisfied by **RULED** text or by
**`CARRIED-DESIGN`** text, and the two are not interchangeable: `[CD]` is *"still
build-ready"* but is *"flagged so a lens knows which sentences a ruling would not
defend verbatim."* Every §4 filing therefore states which grade it stands on where
the grade is anything other than RULED.

**Across all 71 rows, exactly one conjunct on one row rests on `[CD]`: Q49's T-2**
(C-6 / C-7). It is marked in §4.9, argued at **CP-1**, and carried onto the
ratification surface as **rider (d)** so that adopting it is a decision V takes
rather than a reading V inherits. Q27's enrichment case rests on RULED text
throughout.

### 3.2 The protected-core map — where each of N-11's five heads lives

Recorded so a reviewer can verify the **first** DONE-WHEN condition (*"no
protected-core row is classed enrichment"*) by reading one table.

| Protected-core head (N-11 · DR-052) | Owning row | Rows that carry or feed it — **all correctness** |
|---|---|---|
| **provenance** | **Q51** | Q8 (label rides *"every node's provenance"*) · Q15 · Q16 · Q22 · Q24 · Q60 · R4 · R7 |
| **abstention typing** | **Q55** | Q6 (the abstention price cell) · Q12 · Q17 · Q25 · Q56 · R3 |
| **standard-and-above blind verification** | **R5** | Q14 · Q31 · Q39 · Q40 · Q41 · Q42 · Q43 · R6 |
| **citation routes** | **Q16** | Q40 (reopen locators, exact-check preserved spans) |
| **serve-conformance** | **R9** | Q28 · Q44 · Q51 · Q52 · Q53 |

**Every row named above is filed (a) CORRECTNESS in §4.** Neither proposed
enrichment row (Q27, Q49) appears in this table.

---

## 4. The 71 rows

**How to read a row.** *Class* is the option from §3 this proposal adopts.
*Ground* names the protected-core head (`PC-prov`, `PC-abst`, `PC-blind`,
`PC-cite`, `PC-conf`), the honesty surface (`HS-n`), the charter §5.2 fixture row
(`CH-n`), or `T-2` where the row fails the gates-nothing conjunct. Labels are
PRE-05's.

### 4.1 Stage 1 — LOCK (Q1–Q6)

| Row · label | Class | Ground | One-line justification |
|---|---|---|---|
| **Q1** · HYBRID | **(a) correctness** | T-2 · OD-S-03(b) | The intent record survives every terminal route by ruling (DR-061 `OD-S-03`) and its `INERT` test stops the run — a run cannot shed the row that decides whether it should exist. |
| **Q2** · HYBRID | **(a) correctness** | T-2 | The dated binding is the *"**sole scope key** for retrieval, for admissibility at Q32, and for the cross-run memory key"* — skipping it removes the gate R2 enforces on every item. |
| **Q3** · HYBRID | **(a) correctness** | T-2 | Owns a named terminal route (DR-037): a skipped presupposition check answers a question that should have been refused. |
| **Q4** · HYBRID | **(a) correctness** | T-2 | The frozen, hashed, timestamped answer rule is the run's pre-registration; *"a run with no Q4 does not start."* |
| **Q5** · HYBRID | **(a) correctness** | T-2 | The typed prior is Q54's required input; skipping it makes movement claims *"unavailable, not zero"* on a run that could have had them. |
| **Q6** · HYBRID | **(a) correctness** | PC-abst · T-2 | The row **declares the envelope itself** and reads the abstention price cell Q56 checks against — the budget law may not shed the row the budget law depends on. |

### 4.2 Stage 2 — ROUTE (Q7–Q10)

| Row · label | Class | Ground | One-line justification |
|---|---|---|---|
| **Q7** · HYBRID | **(a) correctness** | T-2 | Emits the value-route terminal and DR-053's typed `DUAL ACT`; shedding it lets the machine proceed on a question it was ruled to hand to a human. |
| **Q8** · HYBRID | **(a) correctness** | PC-prov · HS-8 | The type activates R7's evidence standards and the fallback label *"rides the answer **and every node's provenance**"* (DR-021 knob 10). |
| **Q9** · HYBRID | **(a) correctness** | T-2 | Emits `NOT_EMPIRICALLY_DECIDABLE` as a served answer and hands Q20 its probe candidate. |
| **Q10** · HYBRID | **(a) correctness** | T-2 | Persists the split decision, its justification and the never-regenerated baseline; it is the predicate input for all of Stage 6 and for Q48. |

### 4.3 Stage 3 — AIM (Q11–Q14)

| Row · label | Class | Ground | One-line justification |
|---|---|---|---|
| **Q11** · HYBRID | **(a) correctness** | T-2 | The frozen, versioned, hashed query set is R1's only admissible retrieval input and Q15's predicate; the disconfirming terms are the anti-confirmation discipline itself. |
| **Q12** · HYBRID | **(a) correctness** | PC-abst | The ignorance ledger is what Q55's exactly-one abstention law is enforced *against* (DR-051) — shedding it makes abstention typing unenforceable. |
| **Q13** · HYBRID | **(a) correctness** | T-2 | Code *"refuses a plan"* with no opposition-capable party (DR-036's named refusal power), and interests are recorded before anything is read. |
| **Q14** · HYBRID | **(a) correctness** | PC-blind · *PRE-05 files this row POLICY_BLOCKED (SP-4)* | Enumerates critic candidates under *"different maker = different lineage"* and declares hit criteria **before** the critique runs. **Class is independent of SP-4** — whatever predicate V writes, the row is never budget-skippable. |

### 4.4 Stage 4 — HARVEST (Q15–Q19)

| Row · label | Class | Ground | One-line justification |
|---|---|---|---|
| **Q15** · **MACHINE** | **(a) correctness** | PC-prov | The planned-versus-run diff with zero-result flags and access failures is the retrieval record every downstream provenance claim rests on. |
| **Q16** · HYBRID | **(a) correctness** | **PC-cite** · PC-prov · T-2 | **The citation-route row**: archive locator, three-valued access depth, extracted spans, character-level compare, and *"the eight typed routes from day one"* — N-11 names citation routes explicitly. |
| **Q17** · **MACHINE** | **(a) correctness** | PC-abst | Absence rows are the evidence Q55's *"searched and found nothing"* kind is typed from; *"absence is a servable finding, not a silence."* |
| **Q18** · HYBRID | **(a) correctness** | HS-4 · CH-5 | Produces the STALE / UNDER-REVIEW surface and stamps relevant-as-of (DR-015) — charter §5.2 row 5's fixture depends on it. |
| **Q19** · HYBRID | **(a) correctness** | T-2 | Independence clustering is *"a **gate, not a bonus**"*: shedding it double-counts corroboration and silently inflates every downstream number. |

### 4.5 Stage 5 — RUN (Q20–Q25)

| Row · label | Class | Ground | One-line justification |
|---|---|---|---|
| **Q20** · HYBRID | **(a) correctness** | T-2 | Stage law: a skip *"downgrades the answer to documents-only"*, and *"nothing was runnable"* must be a recorded state with predicate and evidence. |
| **Q21** · HYBRID | **(a) correctness** | T-2 | The prediction is *"frozen, hashed and timestamped **before** the probe runs"* — the pre-registration that makes the result admissible at all. |
| **Q22** · **MACHINE** | **(a) correctness** | PC-prov | The execution capture (raw output, environment, exit code, timings, replay proof) is the *"ran"* way-of-knowing behind every measured claim. |
| **Q23** · **MACHINE** | **(a) correctness** | T-2 | *"An instrument that cannot fail its negative fixture is not certified"* — shedding certification admits uncertified measurement. |
| **Q24** · HYBRID (narrow) | **(a) correctness** | PC-prov · T-2 | The append-only ledger keeps *"**every** attempt, including the embarrassing ones"* and the caveat is machine-bound to its result id and *"travels everywhere the number is shown."* Per-row rule: the one bounded sentence cannot be shed apart from the row (see CP-8). |
| **Q25** · HYBRID | **(a) correctness** | PC-abst | *"Emits the typed **not runnable** abstention kind"* — one of Q55's five, and therefore protected-core by N-11. |

### 4.6 Stage 6 — SPLIT (Q26–Q31)

| Row · label | Class | Ground | One-line justification |
|---|---|---|---|
| **Q26** · HYBRID | **(a) correctness** | HS-3 · T-2 | Defeaters are honesty surface 3, *"visible first-class attacks"*, and *"a node is complete only when its defeater set is non-empty or explicitly exhaustion-marked."* |
| **Q27** · **LLM** *(the battery's single LLM row)* | **(b) ENRICHMENT** | **T-1 ✓ T-2 ✓ T-3 ✓** | **The one row ruled non-gating on the record**: DR-020 knob 8 ships it as a *"diagnostic `UNCOVERED-SCOPE` note only"*, `coverage_passed` is *"a forbidden claim"*, and the gate **does not ship** (`FX-DEF-02`). Not a protected-core head, not one of DR-048's nine surfaces, and nothing reads its output. It is minted as **node text**, so its skip mark projects onto the node it describes (`FX-SRV-16`). **Primary LRD-1 discharger — see §5.** |
| **Q28** · HYBRID | **(a) correctness** | **PC-conf** · CH-3 | The isolated cold-reader per-child test is the node half of the stranger discipline R9 blocks serving on — N-11's serve-conformance head. |
| **Q29** · HYBRID | **(a) correctness** | T-2 | The observable-and-threshold requirement and the rotated falsifier hunt end in a visible `UNFALSIFIED-AFTER-ROTATION` degradation — *"never silent full citizenship."* |
| **Q30** · HYBRID | **(a) correctness** | T-2 | The row *"recomputes the parent with the piece varied"* — that recompute is the compose-stage arithmetic's and Q46's leverage join's input (see CP-7). |
| **Q31** · HYBRID | **(a) correctness** | PC-blind | The blinded, fingerprinted question-only packet under the maker-diversity floor is blind verification applied to the carving; DR-090 already forbids approximating its unmeasured input. |

### 4.7 Stage 7 — WEIGH (Q32–Q38)

| Row · label | Class | Ground | One-line justification |
|---|---|---|---|
| **Q32** · HYBRID | **(a) correctness** | T-2 | R2's enforcement point: *"Partial items may never be silently weighted"*, and the off-subject downgrade must be visible at serving. |
| **Q33** · HYBRID | **(a) correctness** | T-2 | The strongest adverse item **actually found**, `UNADJUDICATED` where there is none — the anti-flattery row; shedding it is precisely the flattering answer. |
| **Q34** · **MACHINE** (the verdict) | **(a) correctness** | HS-6 · T-2 · **OD-A-04** | **Already ruled**: `OD-A-04` RATIFIED(DR-061) adopts *"correctness — never budget-skippable"* for per-item verification telemetry. `UNINSTRUMENTED` *"blocks the fairness claim"* and Q46 cannot execute without this row's two ledger stamps. |
| **Q35** · HYBRID | **(a) correctness** | T-2 | Zero-weight-with-retention changes the arithmetic; shedding it leaves an interested source carrying weight it was ruled not to have. |
| **Q36** · HYBRID | **(a) correctness** | T-2 | *"A confidence with no measurement behind it is typed as unmeasured and may not be presented as measured"* — the anti-theater law, and it fires on **every served answer** (`1..N`). |
| **Q37** · HYBRID | **(a) correctness** | T-2 | The seven bias domains carry a *"disposition of repair, bound or exclude **that code enforces**"*, and *"a warned-about bias may **never** be averaged away."* |
| **Q38** · HYBRID | **(a) correctness** | T-2 | *"A number with no uncertainty source is **unservable**"*, and missing dispersion *"is never read as zero uncertainty."* |

### 4.8 Stage 8 — CROSS (Q39–Q44)

| Row · label | Class | Ground | One-line justification |
|---|---|---|---|
| **Q39** · **MACHINE** | **(a) correctness** | PC-blind | The independence receipt is blind verification's proof object; it is *"exempt from critic availability"* and its absence state drives DR-014's cap-label-lift. |
| **Q40** · HYBRID | **(a) correctness** | PC-blind · **PC-cite** · *PRE-05 files this row POLICY_BLOCKED (SP-4)* | Reopening locators and exact-checking preserved spans character-for-character is *both* protected heads at once; *"reading what the author said about a source is not checking it."* Class is independent of SP-4. |
| **Q41** · HYBRID | **(a) correctness** | PC-blind | *"A critique that does neither is not a critique"*; DR-055 makes real different-maker critique mandatory at standard and above — N-11's exact scope. |
| **Q42** · **MACHINE** | **(a) correctness** | PC-blind | Post-unblinding agreement *"carries zero added weight, decided by the unblinding log"* — the row that stops fake independence counting. |
| **Q43** · HYBRID | **(a) correctness** | PC-blind | The alternate-method recomputation the answer *"must survive"*, *"recorded and compared, never asserted."* |
| **Q44** · HYBRID | **(a) correctness** | PC-conf · CH-2 | The residual objection set is *"a **first-class served object**"* and Q53's fact-bundle input — charter §5.2 row 2's fixture reads it. |

### 4.9 Stage 9 — COMPOSE (Q45–Q50)

| Row · label | Class | Ground | One-line justification |
|---|---|---|---|
| **Q45** · HYBRID with a machine-only fast path | **(a) correctness** | T-2 | The declared operator decides the parent number — spec §3.9's worked case, quoted: *"accumulate gives 0.9935 and strict-and 0.0997 — a 9.96× gap"*; DR-074 makes the deployment operator mandatory, never blank. |
| **Q46** · **MACHINE** | **(a) correctness** | T-2 | The leverage↔verification join and its bounded halt produce `LEVERAGE_UNRESOLVED`; C-5a reasons *from* this row being correctness (*"cost could not terminate the loop either"*), so reclassifying it would reopen DR-050. |
| **Q47** · **MACHINE** | **(a) correctness** | T-2 | Where the rival operator *"would flip the served band, **both readings are served**"* — a skipped flip-check serves one band as though it were stable (see CP-6). |
| **Q48** · HYBRID | **(a) correctness** | T-2 · charter G3 | The baseline diff *"flags a disagreement, downgrades confidence and raises recheck priority"*; the disagreement flag is RATIFIED(DR-032) as a charter G3 gate. |
| **Q49** · **MACHINE** | **(b) ENRICHMENT** | T-1 ✓ · **T-2 ✓ on `[CD]`** · T-3 ✓ | T-1 and T-3 hold on ruled text: not a protected-core head, and **not** one of DR-048's nine surfaces — HS-5's reversal point is Q50's value-overlay one, not this table. **T-2 rests on CARRIED-DESIGN, not on a ruling** — C-6 (*"fragility … is an **output**, served as a table"*) and C-7 (*"sensitivity may **never** feed back into base scores or arrow strengths"*) are both stamped `CARRIED-DESIGN`, and spec §3 audits Q49's feedback-loop contract as `[CD]`: *"DR-031 ratified … **classifications with named riders**, not … full contracts."* **This row's enrichment case therefore adopts a carried-design reading — see CP-1 and rider (d) at §7.** Also recorded: MACHINE, zero model calls — it sheds compute, not calls. |
| **Q50** · HYBRID | **(a) correctness** | HS-5 · CH-12 | The reversal point is honesty surface 5 and DR-059 requires it to render **even in components-only degraded mode** — a row that must survive degradation cannot be the thing degradation sheds. |

### 4.10 Stage 10 — SERVE (Q51–Q58)

| Row · label | Class | Ground | One-line justification |
|---|---|---|---|
| **Q51** · HYBRID | **(a) correctness** | **PC-prov** · HS-2 · CH-1 | **The provenance row**: *"the sole never-disabled serving invariant"*, the locator gate *"blocks serving"*, and it is DR-049's last gate — N-11's first head by name. |
| **Q52** · HYBRID | **(a) correctness** | PC-conf | The opening-sentence scope check against the Q2 binding is a serve-side conformance gate; shedding it lets the first sentence claim wider than the run was bound to. |
| **Q53** · **MACHINE** | **(a) correctness** | PC-conf · CH-2 | A **serving precondition** that runs second in DR-049's order, *"before conformance, so composition cannot pass locally while hiding it."* |
| **Q54** · HYBRID | **(a) correctness** | T-2 · T-3 | Belief updates are *"event-sourced: a belief update cites its cause **when it is made**"*, and `AMBIGUOUS_ATTRIBUTION` is typed rather than guessed — the movement report is what Q5's protected prior exists to make possible (see CP-3). |
| **Q55** · HYBRID | **(a) correctness** | **PC-abst** · HS-1 | **The abstention-typing row**: exactly one of the five kinds per ignorance-ledger unknown, and the terminal-route *"typed statement of what is not known"* survivor (`OD-S-03(b)`). |
| **Q56** · **MACHINE** | **(a) correctness** | PC-abst | The over-abstention check against the declared price cell; *"a rate inconsistent with the declared price is a **named battery defect**."* |
| **Q57** · HYBRID | **(a) correctness** | T-2 | Findings and recommendations *"render in separate blocks"* and a recommendation with no named normative owner is *"a **defect**, not a style choice"* — the DR-017 detachment law at serve. |
| **Q58** · HYBRID | **(a) correctness** | HS-4 · CH-5 | The named conditions *"are **registered as watched revision triggers**"* (DR-015) — the production half of the STALE surface charter §5.2 row 5 fires (see CP-4). |

### 4.11 Stage 11 — SETTLE (Q59–Q62)

| Row · label | Class | Ground | One-line justification |
|---|---|---|---|
| **Q59** · HYBRID | **(a) correctness** | T-2 | Requires an **external** resolver and emits scoreability; `PERMANENTLY_UNSCOREABLE` is *"expected for a value choice, not a defect"* — a typed record, never an absence. |
| **Q60** · **MACHINE** | **(a) correctness** | PC-prov | Persists `{answer, prior, posterior, basis, resolver, date, **provenance**}` with read-back verification — *"a claimed write that cannot be read back is a defect."* |
| **Q61** · HYBRID | **(a) correctness** | T-2 | The registered proper score and **versioned** calibration are the learning loop; and DR-089 puts the firing *"outside the run lifecycle"*, so the run's envelope has nothing here to shed in any case. |
| **Q62** · HYBRID | **(a) correctness** | HS-7 · OD-S-03(b) | Liveness telemetry is *"written on **every closed run**"* and is a ruled terminal-route survivor; `UNDER-EXPLORED` is honesty surface 7. |

### 4.12 The nine human-set rules (R1–R9)

*DR-036's standing law over this block: "content from the model, **force from the
machine**." A rule whose force could be shed for money would not be a rule.*

| Row · label | Class | Ground | One-line justification |
|---|---|---|---|
| **R1** · HYBRID | **(a) correctness** | T-2 | *"Off-plan retrieval **cannot support a claim**"* — the admissibility gate on every retrieved item. |
| **R2** · HYBRID | **(a) correctness** | T-2 | The binding is the sole scope key and the per-item admissibility gate enforced at Q32 on **every** item; both limbs take the class (see CP-10). |
| **R3** · HYBRID | **(a) correctness** | PC-abst | The ranked ignorance ledger, surfaced at serving with *"**no silent deletion**"* — abstention typing's upstream half. |
| **R4** · HYBRID | **(a) correctness** | PC-prov · T-2 | Locators must resolve to real holders, and the plan must contain an opposition-capable **and** a measurement class; single-class coverage is surfaced as a deficit. |
| **R5** · HYBRID | **(a) correctness** | **PC-blind** · CH-4 | **The blind-verification rule itself**: research and criticism never share a context; with no second lineage the answer *"cannot reach the top confidence band"* and records a lift condition. |
| **R6** · HYBRID | **(a) correctness** | PC-blind · *PRE-05 files this row POLICY_BLOCKED (SP-4)* | The blind two-lineage comparison whose own law is that it *"**must never silently pass**"* — a budget skip is exactly a silent pass. Class is independent of SP-4. |
| **R7** · HYBRID | **(a) correctness** | PC-prov · HS-8 | The declared field activates its evidence standards, and the unresolved-field label *"travels on the answer and **in every node's provenance**."* |
| **R8** · HYBRID | **(a) correctness** | T-2 | *"Vantage versions **key the query plan**"* — the output feeds retrieval, so T-2 fails; the perspective-forking prohibition is spec law either way (see CP-5). |
| **R9** · HYBRID | **(a) correctness** | **PC-conf** · CH-3 · CH-11 | **The serve-conformance row**: the stranger test *"**blocks serving**"*, load-bearing nodes exhaustive **always**, and DR-057 adds the post-composition verdict pass. N-11's fifth head by name. |

---

## 5. LRD-1 — which rows discharge it, and how the fixture becomes constructible

**The dependency (`07-build-order.md` §7).** *"Until at least one row is
classified enrichment, the envelope's enrichment-skip terminal cannot fire and
charter §5.2 row 6's fixture is unconstructible — a BLOCKING row."*

### 5.1 What `FX-SRV-16` actually requires — stated before it is used

Quoted, because an earlier draft of this package paraphrased it wrongly and the
correction changes the argument:

> **`FX-SRV-16` — Condition marks reach the nodes they describe**, whose
> behaviour cell reads, verbatim: *"an
> **answer-scoped mark's affected set** is stored **once** in
> `condition_mark_node` and **projected per node at read time** — an
> answer-scoped row with **no affected set** would project to the **empty set for
> every node**, showing `SKIPPED-BY-BUDGET` on the answer and on **none of the
> nodes it describes**, and would **silently fail `FX-C52-06` if the fixture
> inspects a node**."*

Three consequences, and one non-consequence:

- **`SKIPPED-BY-BUDGET` is an answer-scoped condition mark for every row.** There
  is no "node-scoped mark" in the contract, so **"node-scoped versus
  answer-scoped" is not the discriminator between candidate rows** and this
  package no longer uses it.
- **What the fixture needs is a non-empty *affected-node set*** — the set of
  nodes the skipped row's loss is attributable to, stored once and projected per
  node. `07-build-order.md` §7 states the same test operationally: *"The fixture
  must inspect a node (`FX-SRV-16`) or an empty affected set passes silently."*
- **Whether a given row's budget skip yields a non-empty affected-node set is a
  data-model and fixture question this package does not own.** `FX-SRV-16`'s
  owning slice is **S9**, *"reconciled per `07-build-order.md` §5.1 (PRE-01
  lane)"*, with S5 owing the read-time projection half. **This package names the
  requirement and does not settle it** — see SP-C1 below.
- **The non-consequence:** `FX-SRV-16` establishes **no uniqueness claim about
  any row.** An earlier draft asserted Q27 was the only enrichment row that could
  satisfy the node-inspection limb; that claim was not established by the source
  and is **withdrawn**.

### 5.2 The dischargers, named

| Row | Candidate affected-node set on a budget skip | Role in LRD-1 |
|---|---|---|
| **Q27** (LLM · SPLIT) | The row's work is **per-node by construction** — DR-020 knob 8 mints the `UNCOVERED-SCOPE` note as **node text**, and the row is scoped to the split Q10 authorised, so the nodes whose scope coverage went unstated are enumerable from Q26's child set | **PRIMARY**, on scope-of-work grounds — not on a uniqueness claim |
| **Q49** (MACHINE · COMPOSE) | The fragility table is a composed-answer artifact whose reversal set **names components**, so the components the table would have covered are the candidate affected set | **SECONDARY.** Independently sufficient if its affected set resolves non-empty |

**Both rows' affected sets are determined by the row's *scope of work* — the
nodes the row was owed over — not by the output the skip prevented.** That is the
only reading under which any budget skip can have an affected set at all, since a
skipped row produces nothing to enumerate from. **Recorded as the reasoning, and
flagged at SP-C1 rather than settled here.**

### 5.3 How `FX-C52-06` becomes constructible on ratification

Both halves, each with a named row:

1. **The enrichment half.** A run whose envelope exhausts before SPLIT completes
   skips **Q27** under N-10's *"typed enrichment skips first"* limb; the answer
   carries a visible **`SKIPPED-BY-BUDGET`** mark (honesty surface 8) whose
   affected set is stored in `condition_mark_node` and **projects onto the split's
   nodes at read time**, so the fixture's node inspection sees it. **Q49 supplies
   the same shape at COMPOSE** and either row can carry the fixture.
2. **The protected-core half.** The same exhausted run reaches SERVE and **R9**
   (serve-conformance, N-11's fifth head) **refuses the skip**: the stranger test
   still blocks serving, and the run takes N-10's other limb — the hard stop
   serving already-verified components with `ENVELOPE_EXHAUSTED`. Any of Q51
   (provenance), Q55 (abstention typing), Q16 (citation routes) or R5 (blind
   verification) serves as the refusing row equally; **R9 is proposed as the
   fixture's named row** because it is the head DR-052 added and the one whose
   omission the ledger says *"budget law permitted"*.

**The consequence recorded, so it is checkable.** On ratification the S15
acceptance bundle's **`UNCLASSIFIED` battery-row report should be empty** — all
71 rows carry a class — and charter §5.2 row 6 has a constructible fixture.
`07-build-order.md` §7's failure test is unchanged: *"if it is non-empty **and**
no row is classified enrichment, charter §5.2 row 6 has no fixture and A4.4
blocks."*

### 5.4 The brittleness, restated accurately

> **Outcome — `DR-108`, 2026-08-07: NO PULL-OUT WAS TAKEN, so none of the three
> pull-out branches below occurred. `LRD-1` is DISCHARGED** on **Q27 + Q49**, in
> the ruling's own words: *"**LRD-1 DISCHARGED** (charter §5.2 row 6's fixture
> constructible on Q27+Q49)."* **The fourth bullet stands unchanged and is still
> live**: `SP-C1`, the affected-node-set derivation, is **owed by S9/S5** and was
> explicitly not settled by this sitting (§7's *"what the yes does not decide"*).

**LRD-1's *existence* condition — at least one enrichment row — is discharged
twice over (Q27 and Q49), so pulling either one alone leaves it discharged.**
That is a stronger position than this package claimed in its first revision.

What is **not** doubly secured is the fixture's **node-inspection limb**, because
neither row's affected-node set has been settled by the S9/S5 reconciliation
(SP-C1). The honest statement:

- **If V pulls Q27 to correctness (CP-2)**, LRD-1's existence condition still
  holds on Q49 alone, and the fixture's node limb then rests entirely on Q49's
  affected set resolving non-empty.
- **If V pulls Q49 to correctness (CP-1)**, the same holds with Q27 alone.
- **If V pulls both**, LRD-1 is **undischarged** and charter §5.2 row 6 stays
  BLOCKING — V would need to move one of CP-3…CP-7 in the same sitting.
- **If neither affected set resolves non-empty at S9**, the fixture *"silently
  fails"* by `FX-SRV-16`'s own words — which is a **build-lane finding for S9/S5,
  not a classification defect**, and is why SP-C1 is recorded rather than assumed
  away.

**SP-C1 · for the S9/S5 reconciliation, not for V's classification vote.** The
affected-node set of a `SKIPPED-BY-BUDGET` mark for a *skipped* row must be
derived from the row's scope of work, since the skip produced no output to
enumerate. `FX-SRV-16`'s owner (**S9**, reconciled per `07-build-order.md` §5.1,
PRE-01 lane) owes that derivation for whichever row the fixture uses. **This
package does not settle it and no classification here depends on the answer.**

---

## 6. The pull-out list — rows and readings this proposal judged contestable

> **ALL TEN PULL-OUTS ARE SUBSUMED BY THE WHOLESALE RATIFICATION — `DR-108`,
> 2026-08-07.** V took the second of the two courses this section offered:
> *"decline the pull-out and take all 71 as read."* **No pull-out was exercised
> and no row was ruled individually**, so **every CP below resolves to the class
> or reading §4 / §7 proposed** — which is also every CP's own recommendation.
> The section is kept **verbatim as the record of what V was shown before
> ruling**; DR-108 makes the point explicitly, that the promotion at rider (d)
> was *"asked-and-answered: LRD-1 and C-6/C-7 defined for V before ruling."*
>
> | Pull-out | Subject | Proposed / recommended | Outcome under `DR-108` |
> |---|---|---|---|
> | **CP-1** | **Q49** | (b) ENRICHMENT, with rider (d) | **(b) ENRICHMENT** — and **rider (d) ratified**: C-6 / C-7 are **promoted from carried-design to ruled evidence** |
> | **CP-2** | **Q27** | (b) ENRICHMENT | **(b) ENRICHMENT** |
> | **CP-3** | **Q54** | (a) correctness | **(a) CORRECTNESS** |
> | **CP-4** | **Q58** | (a) correctness | **(a) CORRECTNESS** |
> | **CP-5** | **R8** | (a) correctness | **(a) CORRECTNESS** |
> | **CP-6** | **Q47** | (a) correctness | **(a) CORRECTNESS** |
> | **CP-7** | **Q30** | (a) correctness | **(a) CORRECTNESS** |
> | **CP-8** | **Q24** | (a) correctness | **(a) CORRECTNESS** — CP-10's rule supplies the limb answer |
> | **CP-9** | the *"standard-and-above"* qualifier | (a) tier governs activation only | **RATIFIED as reading (a)** — *"standard-and-above governs activation, never class"* |
> | **CP-10** | limb-split rows | (a) strictest limb governs | **RATIFIED as reading (a)** — *"a limb-split row takes its strictest limb's class"* |
>
> **Consequence for `LRD-1`:** because **neither** CP-1 nor CP-2 was pulled to
> correctness, the branch this section warned about — *"If V takes (a) here **and**
> (a) at CP-1, LRD-1 is undischarged"* — did not occur. **DR-108 records LRD-1 as
> DISCHARGED** on Q27 + Q49, exactly as §5.3 describes.

**DR-061's courtesy, repeated** *(the text as it stood when V read it)*: these are
offered for pull-out from the wholesale ratification. V may rule any of them
individually and ratify the rest with the batch, or decline the pull-out and take
all 71 as read. Each carries the DR-061 four-part shape.

### CP-1 · **Q49** — proposed **(b) enrichment** · **its T-2 case is CARRIED-DESIGN, not RULED**

> **SUBSUMED — `DR-108` (not pulled out). Outcome: (b) ENRICHMENT, and rider (d)
> is RATIFIED — C-6 / C-7's no-feedback contract is PROMOTED from carried-design
> to ruled evidence.** The authority defect this pull-out existed to expose was
> put to V and answered on the record (*"asked-and-answered: LRD-1 and C-6/C-7
> defined for V before ruling"*), so the promotion is a knowing act, which is the
> only condition this section attached to it.

**What it is.** The fragility table: the reversal set and what would have to be
dropped or changed for the answer to flip.
**Why it matters — and the authority defect this pull-out exists to expose.**
T-1 and T-3 hold on ruled text. **T-2 does not.** The two sentences the
gates-nothing case rests on are both **`CARRIED-DESIGN`**, not ruled:

- **C-6** `CARRIED-DESIGN` — *"Fragility — the reversal set, and what would have
  to be dropped or changed for the answer to flip — is an **output**, served as a
  table."*
- **C-7 (forbidden by construction)** `CARRIED-DESIGN` — *"Sensitivity may
  **never** feed back into base scores or arrow strengths."*

Spec §3's own authority audit names this row in terms: the *"feedback-loop …
contract"* on Q49 is one of the eleven `[CD]` clauses, and **DR-031 ratified
*"classifications with named riders, not … full contracts"*** — it ratified Q49's
MACHINE label, **not** output-never-a-weight. Spec §3 adds that `[CD]` text *"is
still build-ready … flagged so a lens knows which sentences a ruling would not
defend verbatim"*, and **no later DR promotes C-6 or C-7** (checked across the
founding, ARCH-V3-R1 and PROG-V3-R1 ledgers). So classifying Q49 enrichment
**adopts the carried-design reading as part of the ratification** — which is a
thing V may legitimately do at a sitting, but must do knowingly.

Second, independent caveat: it is a **MACHINE** row, so classifying it enrichment
sheds **compute, not model calls** — its contribution to a call envelope is small.
Third: a reader could reasonably call a fragility table an honesty surface in
substance even though DR-048's canonical nine do not list it.
**Options.** (a) **Correctness** — the cautious reading; costs nothing in model
calls, requires no carried-design adoption, and leaves **Q27 as the sole
enrichment row**. (b) **Enrichment, adopting C-6/C-7 as ruled by this sitting** —
a second discharger for LRD-1, at the price that fragility goes dark on the
biggest runs and that a `[CD]` reading is promoted by ratification. (c)
**Enrichment, with C-6/C-7 left carried-design** — the class holds but the T-2
ground stays flagged, so a later DR could unsettle it.
**Recommendation.** (b) — a second discharger materially de-risks LRD-1 and the
carried-design promotion is narrow, explicit and rides the surface as rider (d).
**If V prefers not to promote `[CD]` text at this sitting, take (a)** and read
CP-2 immediately: Q27 then carries LRD-1 alone.

### CP-2 · **Q27** — proposed **(b) enrichment** · **the strongest-authority enrichment row**

> **SUBSUMED — `DR-108` (not pulled out). Outcome: (b) ENRICHMENT.** Q27 remains
> LRD-1's primary discharger, now alongside Q49 rather than alone.

**What it is.** The plain-language uncovered-scope statement, minted as node text.
**Why it matters.** It is **the only row in the battery whose non-gating status is
*ruled* rather than derived**: DR-020 knob 8 ships it as a diagnostic note only,
`coverage_passed` is *"a forbidden claim"*, and `FX-DEF-02` keeps coverage-as-gate
**not shipped**. Unlike CP-1, its T-2 case needs no carried-design reading. Its
work is also per-node by construction, which is why §5.2 proposes it as the
fixture's row — **on scope-of-work grounds, not because any source makes it the
only candidate** (that earlier claim is withdrawn; see §5.1). The counter-reading:
an absent coverage note could read as *"nothing uncovered"* — the answer is that
the skip is never silent (honesty surface 8 makes the loss loud), which is the
entire mechanism that lets any row be enrichment.
**Options.** (a) **Correctness** — the safest reading of the coverage disclosure;
LRD-1's existence condition then rests on **Q49 alone**, whose T-2 ground is
carried-design (CP-1), and the fixture's node limb rests on Q49's affected set.
(b) **Enrichment** — LRD-1 doubly discharged, coverage note sheddable with a
visible mark, no carried-design adoption required for this row.
**Recommendation.** (b). **If V takes (a) here *and* (a) at CP-1, LRD-1 is
undischarged and charter §5.2 row 6 stays BLOCKING** — V would then need to move
one of CP-3…CP-7 in the same sitting.

### CP-3 · **Q54** — proposed **(a) correctness**

> **SUBSUMED — `DR-108` (not pulled out). Outcome: (a) CORRECTNESS.**

**What it is.** Prior, posterior, delta and the moving evidence, served as a
narrative.
**Why it matters.** The *facts* are event-sourced when the update is made, so a
reasonable reading calls only the **narrative** sheddable. The counter: the row
also types `AMBIGUOUS_ATTRIBUTION`, and shedding it would silently drop the
movement report on exactly the long runs where the most evidence arrived.
**Options.** (a) Correctness. (b) Enrichment — a third LRD-1 discharger, at the
cost above.
**Recommendation.** (a). The per-row rule (CP-10) forbids shedding the narrative
without the typing.

### CP-4 · **Q58** — proposed **(a) correctness**

> **SUBSUMED — `DR-108` (not pulled out). Outcome: (a) CORRECTNESS.**

**What it is.** What would make this answer wrong tomorrow, registered as watched
revision triggers.
**Why it matters.** Nothing about the *current* answer becomes less verified if it
is skipped — the loss is entirely future. But an answer shipped with no watched
triggers can **never be woken** by DR-015, which is a permanent silent staleness
rather than a marked one.
**Options.** (a) Correctness. (b) Enrichment.
**Recommendation.** (a), because the loss outlives the mark that describes it.

### CP-5 · **R8** — proposed **(a) correctness**

> **SUBSUMED — `DR-108` (not pulled out). Outcome: (a) CORRECTNESS.**

**What it is.** The vantage points a question should be answered from.
**Why it matters.** It reads like breadth-enrichment, and the rule already drops
non-additive vantage points. T-2 nevertheless fails on ruled text: *"Vantage
versions key the query plan."*
**Options.** (a) Correctness. (b) Enrichment — source breadth shrinks under load,
with R4's single-class deficit as the only thing that would say so.
**Recommendation.** (a).

### CP-6 · **Q47** — proposed **(a) correctness**

> **SUBSUMED — `DR-108` (not pulled out). Outcome: (a) CORRECTNESS.**

**What it is.** The rival-operator recomputation.
**Why it matters.** *"Computable on demand"* reads as *"need not be computed"*.
But where it flips the served band, **both readings must be served with the
deciding choice printed**, so a skipped check ships one band as if stable — a
T-3 failure.
**Options.** (a) Correctness. (b) Enrichment.
**Recommendation.** (a).

### CP-7 · **Q30** — proposed **(a) correctness**

> **SUBSUMED — `DR-108` (not pulled out). Outcome: (a) CORRECTNESS.**

**What it is.** The leverage-direction judgement and named semantic dependencies.
**Why it matters.** Ranking is machine and deferred to compose-time, so the model
limb looks like a prioritisation aid. But the row also *"recomputes the parent
with the piece varied"*, which is the sensitivity input compose consumes.
**Options.** (a) Correctness. (b) Enrichment.
**Recommendation.** (a), on the per-row rule.

### CP-8 · **Q24** — proposed **(a) correctness**, recorded because of its limb

> **SUBSUMED — `DR-108` (not pulled out). Outcome: (a) CORRECTNESS**, with
> **CP-10's ratified rule** supplying the limb answer: the row takes its strictest
> limb's class.

**What it is.** The attempt ledger, the diff, the machine caveat binding, and one
bounded model call for a limitation sentence.
**Why it matters.** The single model call is the only sheddable thing in the row,
and N-14 classifies **per row**, so it cannot be shed alone.
**Options.** (a) Correctness for the whole row. (b) Enrichment for the whole row —
would make the attempt ledger and the caveat binding sheddable with it,
which no reading supports.
**Recommendation.** (a).

### CP-9 · **The "standard-and-above" qualifier** — a reading, not a row · **RATIFIED — `DR-108`**

> **SUBSUMED — `DR-108` ratifies reading (a) as a named rider:**
> *"**CP-9** (standard-and-above governs activation, never class)"*. A
> below-standard run may not *owe* a CROSS row; it may never *shed* an owed one
> for money.

**What it is.** N-11 protects *"standard-**and-above** blind verification"*. The
classification field is per row and carries no tier.
**Why it matters.** Read one way, a below-standard run could budget-skip Q39–Q43,
R5 and R6. Read the other, the tier decides **which runs owe the row**
(activation), never whether an owed row may be shed for money.
**Options.** (a) **Tier governs activation only** — the row's class stays
correctness on every run; a below-standard run simply may not owe it, and DR-014's
cap-label path covers the absence. (b) **Tier governs the class** — needs a
tier-keyed classification field, which N-14's *"per row, once"* does not provide.
**Recommendation.** (a). Recorded because the whole CROSS block's protection rests
on it.

### CP-10 · **The per-row rule over limb-split rows** — a reading, not a row · **RATIFIED — `DR-108`**

> **SUBSUMED — `DR-108` ratifies reading (a) as a named rider:**
> *"**CP-10** (a limb-split row takes its strictest limb's class)"*. One field,
> one value, no limb-level skipping — over all five limb-split rows (Q34, Q62,
> R2, Q24, Q45).

**What it is.** Five rows carry two limbs: **Q34** (machine verdict / model
remediation), **Q62** (liveness / attribution), **R2** (binding / per-item),
**Q24** (machine record / one bounded sentence), **Q45** (zero-call fast path /
one declaration call).
**Why it matters.** N-14 says *"per row, once."* Without a stated rule, a reader
could shed the cheap-looking limb of a protected row.
**Options.** (a) **The row takes the class of its strictest limb** — one field,
one value, no limb-level skipping. (b) Per-limb classification — a new contract
field N-14 does not authorize.
**Recommendation.** (a).

---

## 7. The ratify-wholesale surface — what V said yes to, in one sentence

**`RATIFIED — DR-108`, 2026-08-07. V said yes to the sentence below, with all four
riders and no pull-out.**

> **The 71-row correctness/enrichment split is ratified wholesale: each row adopts
> the class recorded in §4 — option (a) CORRECTNESS or option (b) ENRICHMENT — by
> reference to the standing option text in §3.**

**Riding on the same yes/no — all four ratified** (each *could* have been pulled
out under §6 instead; **none was**):

- **(a)** **69 rows correctness · 2 rows enrichment (Q27, Q49)**, with the
  protected-core map at §3.2 as the check that no N-11 head was classed
  enrichment.
- **(b)** **LRD-1's existence condition is discharged twice over — Q27 (primary,
  strongest authority) and Q49 (secondary)** — making `FX-C52-06` constructible
  with **R9** as the fixture's named refusing row (§5.3). The fixture's
  node-inspection limb depends on an **affected-node-set derivation owed by S9/S5**
  (SP-C1), which this package flags and does not settle.
- **(c)** **The two readings at CP-9 and CP-10** — tier governs activation not
  class; a limb-split row takes the class of its strictest limb.
- **(d)** **One narrow carried-design promotion, named rather than assumed:**
  Q49's enrichment class rests on **C-6 and C-7**, both stamped `CARRIED-DESIGN`
  (DR-031 ratified Q49's MACHINE *classification*, not its feedback-loop
  contract). Ratifying Q49 as enrichment **adopts that carried-design reading**.
  **Declining rider (d) means taking CP-1 option (a)** — Q49 becomes correctness
  and LRD-1 rests on Q27 alone. **No other row in this package depends on `[CD]`
  text.** — **`RATIFIED — DR-108`: rider (d) was taken, not declined.** DR-108
  states the promotion in terms: *"**(d)** C-6/C-7's no-feedback contract
  **PROMOTED from carried-design to ruled evidence** (asked-and-answered: LRD-1
  and C-6/C-7 defined for V before ruling)."* **C-6 and C-7 are no longer `[CD]`
  for this purpose** — Q49's T-2 ground is ruled evidence, and the "a later DR
  could unsettle it" caveat at CP-1 option (c) no longer applies.

**What the yes does *not* decide** — recorded so the sitting stays clean:

- It does not change any activation filing. PRE-05's `10-row-contracts.md` is a
  separate yes/no at the same sitting, and the three `POLICY_BLOCKED` rows
  (Q14, Q40, R6) carry a class here **whatever** V rules on their predicates.
- It does not price the envelope. N-9's depth × tier derivation and every register
  value stay V's at their own step.
- **It does not settle `FX-SRV-16`'s affected-node-set derivation** (SP-C1) — that
  is S9's, reconciled per `07-build-order.md` §5.1 in the PRE-01 lane.
- It puts **no human in any user's loop** — DR-093's clarification is the
  authority for ratifying a classification at all.

---

## 8. Roll-up and checksum

| Class | Count | Rows |
|---|---:|---|
| **(a) CORRECTNESS** | **69** | all rows except the two below |
| **(b) ENRICHMENT** | **2** | **Q27** · **Q49** |
| **Total** | **71** | 62 questions + 9 rules |

**Cross-check against PRE-05 §7.1's label checksum** (13 MACHINE / 57 HYBRID /
1 LLM = 71):

| Label | Correctness | Enrichment | Total | PRE-05 §7.1 |
|---|---:|---:|---:|---:|
| MACHINE | 12 | 1 (Q49) | **13** | 13 ✓ |
| HYBRID | 57 | 0 | **57** | 57 ✓ |
| LLM | 0 | 1 (Q27) | **1** | 1 ✓ |
| **Total** | **69** | **2** | **71** | **71 ✓** |

**Per-stage:** LOCK 6 · ROUTE 4 · AIM 4 · HARVEST 5 · RUN 6 · SPLIT 6 (1
enrichment) · WEIGH 7 · CROSS 6 · COMPOSE 6 (1 enrichment) · SERVE 8 · SETTLE 4 =
**62 questions**; rules **9**; **total 71**. Every id appears **exactly once** in
§4.

### 8.1 Why the enrichment set is small — answered, not apologised for

A reviewer will ask whether two rows make N-10's *"typed enrichment skips first"*
limb nearly vacuous. **Spec §21.2 answers it in its own opening words:** *"because
the expensive steps **are** the correctness steps, and correctness steps may never
be skipped for money, a big question had no legal way to stop."* The envelope was
introduced **because** the enrichment ladder is short — the real terminal is the
hard stop with `ENVELOPE_EXHAUSTED`, and DR-052 orders enrichment skips *first*
precisely so the little that can be shed is shed before it. A proposal that
manufactured a longer ladder would have to reclassify checks, which is the
dead-check class `OD-A-04` was ruled to prevent.

**The protected core is a floor, not a ceiling.** N-11 names five heads that may
**never** be shed; it does not say everything else may be. The 69th row is
correctness because it gates something, feeds a number, or produces one of
DR-048's nine surfaces — not because N-11 named it.

---

## 9. What this document does not decide

- **It does not ratify itself** — VG-02 did (DR-093 ordered it; ticket **PRE-06**
  proposed it; **`DR-108`** ratified it **wholesale** on **2026-08-07**, with
  CP-9, CP-10 and rider (d) ratified alongside and **LRD-1 discharged**. The
  status fold is ticket **PRE-14**.)
- **It does not mint state.** `SKIPPED-BY-BUDGET` and `ENVELOPE_EXHAUSTED` are
  existing condition marks (spec §12.3 · DR-021 knob 9 · DR-052); spec §12.3
  remains the only typed-state mint (S-13).
- **It does not price anything and invents no numeric value** (AC-76 · DR-039).
  It **mints** no threshold, rate, cap or price. The two numeric values that
  appear are **quoted with their sources** — DR-050's `K=1` bound (§2) and the
  spec's worked composition case (§4.9 Q45) — and everything else numeric is a
  count of rows.
- **It does not touch the founding pack or PRE-05's artifact.** Where this
  document reads a row differently from a stale founding sentence, the difference
  is recorded in §6 for V, never edited into the source.
- **It does not run git.** No commit, no branch, no push (DR-103: V pushes).
