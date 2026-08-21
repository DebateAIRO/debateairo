# PRE-06 Grok peer review — `71-row-classification.md`

**Ticket:** `t_f6e8547d` (PRE-06 · DR-093 correctness/enrichment split proposal)  
**Lens:** Grok (DR-101 independent peer; Claude-authored ticket)  
**Verdict:** **APPROVED**  
**Date:** 2026-08-06  
**Artifact judged:** `docs/missions/2026-08-06-v3-programming/ratification/71-row-classification.md` only (new, untracked; read directly; no git).  
**Not read:** any Codex verdict, any `reviews/pre-06-codex*` file, any ticket comments after the `READY FOR PEER REVIEW` marker.

---

## Contract under review

Ticket DONE WHEN (body):

- All 71 battery rows classified correctness OR enrichment, each with a one-line justification tied to the protected core (DR-052) and charter §5.2 row 6
- At least one enrichment row so LRD-1 / FX-C52-06 is constructible — name the dischargers
- Format mirrors DR-061/DR-062 (option text, ratify-wholesale surface, pull-out list)
- Same 71-row identity space as PRE-05 (`10-row-contracts.md`)
- Reviewers verify no protected-core row is classed enrichment

Authority: DR-093 · DR-021 knob 9 · DR-052 · DR-061/DR-062 pattern · spec §21.2 N-11…N-14 · charter §5.2 row 6 · PRE-05 identity space.

---

## Red-team attacks (ticket-ordered)

### (1) Hunt for a MIS-CLASSIFIED CORRECTNESS row — no plain hit

**Attack:** among the 69 correctness filings, is there a row that plainly gates nothing, feeds no number, and whose `SKIPPED-BY-BUDGET` mark would be a complete account — i.e. that **should** be enrichment, and whose correctness classing quietly starves LRD-1's fixture pool?

**Method:** re-applied the package's own three conjuncts (T-1/T-2/T-3) plus the DR-048 nine-surface check; walked every correctness row whose ground is only T-2 (31 rows); stress-tested the softest against PRE-05 predicates and spec §3 outputs.

**Result — no plain mis-classification.**

Over-classifying as correctness is the safe direction under DR-093's standing default (every row behaves as correctness until V ratifies). A row that truly met all three enrichment conjuncts and was still filed (a) would be the only red finding here; none met that bar on ruled text alone.

**Soft candidates (not mis-classifications — already on the pull-out list or weaker):**

| Candidate | Why it *looks* enrichment-adjacent | Why T-2/T-3 still fail (or why LRD-1 is not starved) |
|---|---|---|
| **Q54** | Movement *narrative* could be shed | Event-sourced update + `AMBIGUOUS_ATTRIBUTION` typing; CP-3 records the cost of a silent drop on long runs |
| **Q58** | Future-looking; current answer no less verified | Permanent inability to wake under DR-015 if triggers never register — T-3 (loss outlives the mark); CP-4 |
| **Q57** | Looks like presentation hygiene | DR-017 detachment: recommendation without normative owner is a **defect**, not style |
| **Q61** | Outside the run lifecycle (DR-089) | Envelope has nothing mid-run to shed; class is nearly vacuous for budget, and moving it enrichment would **not** discharge LRD-1's in-run skip path |
| **R8 / Q47 / Q30** | Breadth / on-demand / ranking-aid readings | Package correctly fails T-2 or T-3 on ruled text (query-plan key; band-flip dual serve; parent recompute input) — CP-5…CP-7 |

None of these is a quiet correctness filing that should have been enrichment. The package's own §6 pull-out is the right place for judgment calls; the 69 do not starve LRD-1 given Q27+Q49 as proposed.

### (2) Attack the two enrichment rows — no DR-052 breach

**Test:** could skipping Q27 or Q49 under budget change a **served verdict or band anywhere**? If yes → DR-052 breach (protected core / non-skippable correctness quietly reclassified).

#### Q27 (LLM · SPLIT) — proposed enrichment — PASS

| Check | Finding |
|---|---|
| **PRE-05 / 10-row-contracts** | Predicate `Q10.split=true`; emits diagnostic `UNCOVERED-SCOPE` only; `coverage_passed` forbidden; gate does not ship (`FX-DEF-02`). LLM: code may persist/validate shape only. |
| **Consumers of output** | Q10.split is **input** to Q27, not a consumer of its note. No other row's predicate reads the uncovered-scope text. Spec marks `UNCOVERED-SCOPE` as condition mark #17 (diagnostic), not a gate. |
| **Verdict / band path** | Band and verdict form in WEIGH/COMPOSE from weights, strengths, operator (Q45), rivals (Q47), leverage halt (Q46). Q27 is not on that path. Coverage-as-gate is deferred (charter §5.2 deferred table; DR-020 knob 8). |
| **T-3 / silence** | Skip is never silent: honesty surface 8 (`SKIPPED-BY-BUDGET`) is the complete account of losing a diagnostic note. Node minting means the mark projects onto the node (`FX-SRV-16`) — LRD-1 primary. |
| **DR-048 nine** | `UNCOVERED-SCOPE` is **not** one of the nine honesty surfaces (§12.6). Fourth filter holds. |

**Skipping Q27 under budget cannot change a served verdict or band.** No DR-052 breach.

#### Q49 (MACHINE · COMPOSE) — proposed enrichment — PASS (with residual pin)

| Check | Finding |
|---|---|
| **PRE-05 / 10-row-contracts** | Trigger `composed_answer_with_typed_ranges`; MACHINE zero-call; fragility *"output, never a weight"*; feedback *"forbidden by construction"* (write rule, not activation). |
| **Spec C-6 / C-7** | Fragility is a served table; sensitivity must never re-enter base scores or arrow strengths. |
| **HS-5** | Honesty surface 5 (value markers + reversal points) is **Q50 / DR-017**, not this table. Package is correct to separate them. |
| **Verdict / band path** | Compose arithmetic, Q45 operator, Q46 leverage halt, Q47 rival flip — none is licensed to read fragility as a weight. C-7 is the ruled wall. |
| **Serve path** | Fragility table is a **projection** that goes dark under skip + `SKIPPED-BY-BUDGET` — that is the enrichment mechanism, not a band change. |

**Charter §1 parenthetical (the only real pressure on T-2):** load-bearing nodes are *"computed, not asserted (removal-based leverage and fragility, Q46/Q49)"*, and load-bearing feeds R9 sampling, `band_ceiling` (DR-082), and compose priority (DR-058).

Resolved against the charter's own definition: a load-bearing node is one whose **removal changes the verdict or its band** — that is the **leverage / removal-impact** limb (Q46, filed correctness), not the served fragility flip-table (Q49, C-6 output). `sensitivity_record` may store both fields from shared machinery; R9 / band_ceiling consume the load-bearing *predicate*, which Q46's correctness class keeps available when owed. Q46 and Q49 also have **different triggers** in PRE-05 (`Q45_computable` vs `composed_answer_with_typed_ranges`), so they are not one skippable unit.

**Skipping Q49 under budget does not change a served verdict or band on the ruled reading.** No DR-052 breach.

**Residual (non-blocking, for VG-02 clarity):** the absolute line *"nothing downstream reads it"* is slightly loose next to charter §1's Q46/Q49 co-name. V may wish the sitting minutes to pin: *load-bearing for R9 / band_ceiling / DR-058 priority is the Q46 leverage limb of sensitivity; Q49's table is projection-only.* That is a wording pin, not a reclassification.

### (3) Brittleness (LRD-1 node-scoped half on Q27 alone) — recorded honestly — PASS

§5 states, not hides:

- **PRIMARY** discharger = Q27 (node-scoped; only proposed enrichment that satisfies `FX-SRV-16`'s "fixture must inspect a node")
- **SECONDARY** = Q49 (answer-scoped)
- Protected-core half of FX-C52-06 named to **R9** (with Q51/Q55/Q16/R5 as equal refuse-capable alternatives)
- **Consequence if V pulls Q27 to correctness:** node-scoped half re-opens unless (i) Q49's answer-scoped mark is accepted as satisfying node inspection, or (ii) one of CP-3…CP-7 moves to enrichment
- CP-2 repeats this as *"the single most consequential pull-out"*

Brittleness + consequence + recovery options are all checkable. No soft-pedal.

### (4) CP-9 / CP-10 — V-grade readings; ledger does not pre-settle them as options — PASS

| Rider | Seat-decidable? | Ledger / law already answer? |
|---|---|---|
| **CP-9** ("standard-and-above" on N-11 blind verification: tier governs **activation** vs **class**) | **No** — interpretive rider on N-11's qualifier vs N-14's "per row, once" | N-11 text carries the qualifier; DR-055 / DR-014 govern *when* multi-maker critique is owed and how absence is labelled; **no ledger row** maps tier onto the correctness/enrichment **field**. Orthogonality of activation (PRE-05) vs class (this package) is the natural reading of N-12/N-14, but it is still a **reading for V to confirm**, not a prior option stamp. |
| **CP-10** (limb-split rows Q34/Q62/R2/Q24/Q45: class of **strictest limb** vs per-limb fields) | **No** — N-14 does not authorize a second contract field | OD-A-04 (DR-061) settles **Q34** as correctness (telemetry), not a general limb rule. N-14's "per row, once" strongly implies option (a); option (b) would mint structure N-14 does not provide. Correctly V-confirm. |

Neither rider invents a number or a silent reclassification. Both ride the ratify-wholesale surface as named pull-outs — correct DR-061 shape.

### (5) 71/71 + checksum + identity space — PASS (own count)

**Mechanical census of §4 (this lens):**

| Check | Result |
|---|---|
| Row ids in §4 class tables | **71 unique** — Q1…Q62 and R1…R9, each exactly once as a classified row |
| Enrichment | **exactly 2:** Q27, Q49 |
| Correctness | **69** |
| Stage sum | LOCK 6 · ROUTE 4 · AIM 4 · HARVEST 5 · RUN 6 · SPLIT 6 · WEIGH 7 · CROSS 6 · COMPOSE 6 · SERVE 8 · SETTLE 4 = **62** + rules **9** = **71** |
| Label checksum vs PRE-05 §7.1 | **MACHINE 13** (12 correctness + Q49) · **HYBRID 57** · **LLM 1** (Q27) = **71** |
| Identity set vs `10-row-contracts.md` §6 | **Identical set and identical Q1…Q62 then R1…R9 order** |
| MACHINE membership | Q15, Q17, Q22, Q23, Q34, Q39, Q42, Q46, Q47, Q49, Q53, Q56, Q60 — matches PRE-05 / spec §3.13 |

No id minted, no id dropped, no label rebranded.

### (6) PROPOSED marking; no invented numbers — PASS

- Banner: **PROPOSED-FOR-RATIFICATION**; V rules at VG-02; until then DR-093 standing state (all correctness, never skipped)
- §9: does not ratify itself; does not mint typed state; does not price; does not touch founding pack or PRE-05
- Numbers present are **counts of rows only** (69/2/71, label checksums, stage census) — no thresholds, rates, caps, or prices (AC-76 / DR-039)

---

## Protected-core map audit (DONE-WHEN)

§3.2 map checked against DR-052 / N-11 five heads:

| Head | Owner | All named feeders filed (a)? | Enrichment appears? |
|---|---|---|---|
| provenance | Q51 | Yes (Q8, Q15, Q16, Q22, Q24, Q60, R4, R7, …) | **No** |
| abstention typing | Q55 | Yes (Q6, Q12, Q17, Q25, Q56, R3, …) | **No** |
| standard-and-above blind verification | R5 | Yes (Q14, Q31, Q39–Q43, R6) | **No** |
| citation routes | Q16 | Yes (Q40) | **No** |
| serve-conformance | R9 | Yes (Q28, Q44, Q51, Q52, Q53) | **No** |

Neither Q27 nor Q49 appears in the map. OD-A-04 honoured at Q34. Three POLICY_BLOCKED rows (Q14, Q40, R6) filed correctness independent of SP-4. **No protected-core row is classed enrichment.**

---

## Format / DR-061 shape — PASS

- Standing option text once (§3): (a) CORRECTNESS / (b) ENRICHMENT
- Per-row adoption by reference (§4)
- LRD-1 dischargers named with fixture constructibility (§5)
- Pull-out list with four-part shape (§6, CP-1…CP-10)
- Ratify-wholesale surface + riders (§7)
- Checksum + "why small enrichment set" answered from spec §21.2's own words (§8)

---

## Residuals for V (not blocking)

1. **Q49 T-2 wording vs charter §1 co-name** — pin load-bearing consumer path to Q46 leverage limb (see attack 2 residual).
2. **Soft correctness pull-outs** (Q54, Q58, and CP-5…CP-7) remain judgment calls for VG-02; none is a plain mis-file.
3. **Enrichment ladder is short by design** — package's §8.1 is honest; N-10's real terminal is `ENVELOPE_EXHAUSTED`, not a long skip ladder. Two enrichment rows do not make the limb vacuous; they make the hard stop the common path, which is what DR-052 ordered.

---

## Verdict

**APPROVED**

All DONE-WHEN conditions hold on independent red-team review. No protected-core enrichment; LRD-1 dischargers named with honest brittleness; identity/checksum match PRE-05; PROPOSED-only; no invented numbers; no DR-052 breach on Q27/Q49 skip paths.

---
---

# PRE-06 Grok peer review — DELTA CHECK (rev 2)

**Ticket:** `t_f6e8547d` (PRE-06 · DR-093 correctness/enrichment split proposal)  
**Lens:** Grok (DR-101 independent peer; Claude-authored ticket)  
**Verdict:** **APPROVED**  
**Date:** 2026-08-06  
**Scope:** delta over rev 1 (this lens APPROVED rev 1; worker landed four repairs).  
**Artifact judged:** `docs/missions/2026-08-06-v3-programming/ratification/71-row-classification.md` (rev 2 header + changed sections).  
**Ground truth for the repaired mark contract:** `docs/architecture/06-test-strategy.md` **FX-SRV-16** behaviour cell (read directly).  
**Also stamped independently:** spec §3 R-AUTH-3 / §10.2 C-6·C-7; founding + ARCH-V3-R1 + PROG-V3-R1 ledgers for any C-6/C-7 promotion.  
**Not read:** any Codex verdict, any `reviews/pre-06-codex*` file. Ticket comments read only for the rev-2 handoff (`READY FOR PEER REVIEW (rev 2)`).

---

## Delta contract

Worker claims four repairs, **no class flip**, checksum and protected-core map unchanged. This lens re-tests the five delta limbs below — with special weight on the FX-SRV-16 limb that rev-1's attack (3) **repeated rather than tested**.

---

## (1) FX-SRV-16 limb — re-tested fresh against `06-test-strategy.md` — PASS

### Ground truth (source cell, de-bolded)

`06` §9.5 **FX-SRV-16** behaviour:

> an answer-scoped mark's affected set is stored once in `condition_mark_node` and projected per node at read time — an answer-scoped row with no affected set would project to the empty set for every node, showing `SKIPPED-BY-BUDGET` on the answer and on none of the nodes it describes, and would silently fail `FX-C52-06` if the fixture inspects a node

Three facts the source establishes; one it does **not**:

| Source establishes | Source does **not** establish |
|---|---|
| The mark is **answer-scoped** | A "node-scoped mark" class of row |
| Loss is carried by a non-empty **affected-node set** (stored once, projected per node) | That any particular battery row is the only one that can fill that set |
| Fixture must **inspect a node** or an empty set passes silently | Uniqueness of Q27 (or of any row) as the sole node-inspection carrier |

### Package §5.1 reading — RIGHT

Rev 2 quotes the cell, draws three consequences + one non-consequence, and **withdraws the uniqueness claim in terms**. Checked against the source:

1. **Answer-scoped for every row** → "node-scoped vs answer-scoped" retired as a discriminator — **correct**.
2. **Non-empty affected-node set** is what the fixture needs; `07` §7's *"must inspect a node (`FX-SRV-16`)"* cited as the same operational test — **correct**.
3. Whether a given skip yields a non-empty set is **S9/S5's** (reconciled per `07` §5.1 PRE-01; S5 projection half) — package names SP-C1 and does not settle it — **correct ownership**.
4. **Uniqueness claim withdrawn** — matches what the source never licensed.

**Quote nit (non-blocking):** §5.1 claims the quote is "verbatim"; de-bolded text matches the source cell, but markdown bold spans differ slightly (package bold-wraps `answer-scoped mark's affected set` and `no affected set`; source bold-wraps `affected set` and leaves `no affected set` plain). Substance of the reading is unaffected. Not a classification defect.

### LRD-1 discharge argument under the corrected reading — SURVIVES HONESTLY

| Limb | Rev-1 claim | Rev-2 claim | Honest under corrected FX-SRV-16? |
|---|---|---|---|
| **Existence** (≥1 enrichment row so the skip terminal can fire) | Discharged by Q27+Q49 | Discharged **twice** — pull either alone, still discharged | **Yes.** Both remain enrichment; either alone keeps LRD-1's existence condition live. |
| **Node-inspection** (fixture sees the mark on a node) | Q27 **unique** carrier of `FX-SRV-16`'s "fixture must inspect a node" | **Not unique.** PRIMARY = Q27 on **scope-of-work** (per-node note by construction); SECONDARY = Q49 (reversal set names components). Both independently sufficient **if** affected set resolves non-empty. Uniqueness **withdrawn**. | **Yes — and more accurate than rev 1.** Rev-1 over-claimed uniqueness this lens failed to test; rev 2 states the real brittleness. |
| **What is still single-sourced / fragile** | Implied: Q27 alone for the node half | Neither row's affected set is settled (SP-C1); pull **both** enrichment rows → LRD-1 undischarged; empty sets at S9 → build-lane fail, not a class defect | **Yes.** Honest, and more favourable on existence than rev 1 while **not** soft-pedalling the open derivation. |

§5.2's scope-of-work grounding ("skipped row produces nothing to enumerate from") is the only coherent reading of an affected set under skip; it is **recorded as reasoning, flagged at SP-C1, not assumed settled** — correct.

**Q27 §4.6 residual shorthand (non-blocking):** the one-liner still says the skip mark "projects onto the node it describes (`FX-SRV-16`)". Under the corrected contract the mark is answer-scoped and projects **via** an affected set, not because the mark is node-typed. §5 owns the precise reading; the one-liner does not reassert uniqueness. Wording polish for VG-02 if desired — not a reclassification or a reopened limb.

**CP-2 retitle** ("strongest-authority enrichment row" = only non-gating status **ruled**) is defensible and independent of the withdrawn uniqueness claim.

---

## (2) Rider (d) / Q49 CD-evidence grade — PASS (stamped myself)

| Claim | Independent check | Result |
|---|---|---|
| **C-6** stamped `CARRIED-DESIGN` | Spec §10.2: `**Requirement C-6** \`CARRIED-DESIGN\`` · quote *"Fragility — the reversal set… is an **output**, served as a table."* matches package CP-1 / §4.9 character-for-character (whitespace-normalized) | **Accurate** |
| **C-7** stamped `CARRIED-DESIGN` | Spec §10.2: `**Requirement C-7 (forbidden by construction)** \`CARRIED-DESIGN\`` · first sentence *"Sensitivity may **never** feed back into base scores or arrow strengths."* matches package | **Accurate** |
| R-AUTH-3 / §3 audit names Q49 feedback-loop among the eleven `[CD]` clauses | Spec §3 Authority paragraph: halt / **feedback-loop** / serving-block / read-back on **Q46, Q49, Q53, Q60** — DR-031 ratified as *classifications with named riders*, not as full contracts | **Accurate** |
| DR-031 ratified MACHINE **classification**, not the no-feedback contract | Founding ledger DR-031 batch: Q49 among MACHINE classifications; no contract-depth promotion of C-6/C-7 | **Accurate** |
| **No later DR promotes C-6 or C-7** | Grepped founding, ARCH-V3-R1, PROG-V3-R1 ledgers for C-6 / C-7 / fragility-feedback promotion to RULED — **none** | **Accurate** |
| Rider (d) on §7 surface; declining (d) ⇒ CP-1 option (a) | §7 rider (d) present; CP-1 gains options (a)/(b)/(c) with (a) as the no-CD-adoption path | **Accurate surface shape** |
| Systemic discipline: exactly one conjunct on one row rests on `[CD]` | §3.1 states it; only Q49 T-2 is so marked; Q27 remains RULED throughout | **Consistent with the package's own filings** (this lens does not re-grade all 69 T-2 grounds in the delta) |

Rev-1 residual (pin load-bearing consumers to Q46 leverage limb, not Q49's table) remains a **wording pin for VG-02 minutes**, not a reclassification — compatible with the CD fix.

---

## (3) Narrowed no-number attestation — PASS

| Check | Result |
|---|---|
| §1 / §9 claim narrowed to invents-no-value + every numeric value quoted with source | **Yes** |
| Named inventory: DR-050 `K=1` (§2, via C-5a) and Q45 worked case (§4.9) | **Yes** |
| Q45 figures **verbatim** from spec §3.9: *"accumulate gives 0.9935 and strict-and 0.0997 — a 9.96× gap"* | **Exact match** (table form); paraphrase *"nearly ten times"* **gone** |
| Still bars invented thresholds/rates/caps/prices | **Yes** — only those two quoted values + row counts |
| Self-marks the narrowing (no silent repair) | **Yes** (§1 parenthetical) |

---

## (4) No classification moved — PASS (own census)

| Invariant | Rev 1 | Rev 2 (this lens) |
|---|---|---|
| Total unique row ids in §4 | 71 | **71** (Q1…Q62 + R1…R9, each once) |
| Enrichment | Q27, Q49 | **Q27, Q49 only** |
| Correctness / enrichment split | 69 / 2 | **69 / 2** |
| Label checksum | 13 / 57 / 1 | **13 / 57 / 1** |
| Protected-core map unique ids (table only) | 30, all correctness | **30**, all correctness; Q27/Q49 appear **only** in the negation sentence |
| Enrichment inside protected core | none | **none** |
| Stage census | 62 + 9 = 71 | **unchanged** |
| PRE-05 §6 first-cell labels | (rev-1 soft match) | **71/71 exact first-cell match** after finding-3 repair; POLICY_BLOCKED off identity cells into Ground |

**No class flipped. Checksum holds. Core map holds.**

---

## (5) Rev-1 limbs otherwise unaffected — PASS

| Rev-1 limb | Still holds under rev 2? |
|---|---|
| (1) No plain mis-classified correctness row | **Yes** — same 69; no class moved into enrichment |
| (2) Q27/Q49 enrichment — no DR-052 breach on skip | **Yes** — skip still cannot change served verdict/band; Q49's T-2 is now **honestly graded `[CD]`**, which **strengthens** the attack rather than reopening it |
| (3) Brittleness disclosure | **Upgraded** — existence twice; uniqueness withdrawn; SP-C1 named; still checkable, still not soft-pedalled |
| (4) CP-9 / CP-10 V-grade readings | **Yes** — unchanged in substance |
| (5) 71/71 + checksum + identity | **Yes** — re-counted |
| (6) PROPOSED; no invented numbers | **Yes** — attestation now **true as written** |

---

## Residuals for V (not blocking)

1. **FX-SRV-16 quote bold-span "verbatim"** — de-bolded text is right; strict markdown emphasis is not byte-identical to `06`. Cosmetic if a later polish pass wants the emphasis map to match.
2. **Q27 §4.6 one-liner** still uses pre-correction shorthand ("projects onto the node"); §5 is the governing reading.
3. **Rev-1 residual 1** (load-bearing path = Q46 leverage limb, not Q49 table) — still a sitting pin, not a class issue.
4. Soft correctness pull-outs (Q54, Q58, CP-5…CP-7) remain judgment calls for VG-02.

---

## Delta verdict

**APPROVED**

Corrected FX-SRV-16 reading is right against ground truth; LRD-1 existence is honestly discharged twice and the withdrawn uniqueness claim is a real repair this lens failed to force at rev 1. Rider (d) / CD grade for Q49 T-2 is accurate against §10.2 and R-AUTH-3; no ledger promotes C-6/C-7. Narrowed attestation quotes only two source numerics, both verbatim. No class moved; 69/2, core 30, checksum intact. Prior limbs hold or improve.
