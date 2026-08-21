# PRE-05 Grok peer review — `docs/architecture/10-row-contracts.md`

**Ticket:** `t_1a358442` (PRE-05 · DR-083 activation-table artifact)  
**Lens:** Grok (DR-101 independent peer; Claude-authored ticket)  
**Verdict:** **APPROVED**  
**Date:** 2026-08-06  
**Artifact judged:** `docs/architecture/10-row-contracts.md` only (untracked new file; no git diff).  
**Not read:** any Codex verdict, any `reviews/pre-05-codex*` file, any ticket comments after the `READY FOR PEER REVIEW` marker.

---

## Contract under review

Ticket DONE WHEN (body, pre-handoff):

- 71/71 rows with written predicates or explicit `POLICY_BLOCKED` filings
- Reviewers verify against spec §3 row by row
- FX-S22-05's 13-row MACHINE set identifiable from the table alone
- WAIT domain reflects DR-089 drain law; Q61 is post-completion settlement, not intra-run WAIT
- Ships as **PROPOSED-FOR-RATIFICATION** (V at VG-02; not self-ratified)
- No import of old research activation table; predicates quote-derived from spec §3

Authority: DR-083, DR-089, ADR-0009 §4, AC-83, requirements-spec §1 / §3 / §3.13.

---

## Red-team sample (non-obvious slice)

Sampled **16 rows**, weighted away from the easy MACHINE list and toward the ticket's own risk surface:

| Weight class | Rows sampled |
|---|---|
| R1–R9 (all nine) | R1, R2, R3, R4, R5, R6, R7, R8, R9 |
| Standing WAIT limbs | Q18, Q30 |
| Near-machine exclusions | Q24, Q45, Q34 (verdict + remediation limb) |
| POLICY_BLOCKED filings | Q14, Q40, R6 |
| DR-089 settlement | Q61 |

Also mechanically verified the full §6 set (71/71) and the §7.2 MACHINE roll-up.

---

## Checklist results

### (1) 71/71 in spec order, no dupes — PASS

§6 alone contains exactly one table row per id, in order **Q1…Q62 then R1…R9**.  
Mechanical check: 71 rows, 71 unique, order equals the founding sequence.  
Per-stage census in §7.1 (6+4+4+5+6+6+7+6+6+8+4 + 9 rules) sums to 71.

### (2) Predicate fidelity — PASS (no smuggled fire conditions in the sample)

Every sampled ACTIVE-when cell either:

- **quotes** the spec §3 *Fires* cell verbatim, or
- files **`POLICY_BLOCKED`** where the Fires cell is release history only, or
- applies a **named derivation** with an SP flag when the cell is not a self-standing predicate.

Cross-checks (spec Fires → artifact):

| Row | Spec Fires (abbrev.) | Artifact reading | Smuggle hunt |
|---|---|---|---|
| **Q18** | `answer_can_change_over_time`; no registry class ⇒ WAIT | Same trigger + standing WAIT† + drain | None — WAIT limb is quoted |
| **Q24** | `measurement_attempted` | Exact; explicitly **not** zero-call | None — keeps narrow HYBRID call outside the 13 |
| **Q30** | activation `Q10.split=true`; computation WAITs for Q45 + children | Dual-limb preserved; drain on deps | None — does not invent ranking as kill |
| **Q34** | `evidence_on_both_sides` | Exact; MACHINE = verdict limb only | None — remediation LLM call stays outside FX-S22-05 |
| **Q45** | `multiple_components_to_compose` | Exact; withhold limb flagged dead under DR-074 (SP-6) | None — does not promote to MACHINE |
| **Q61** | cross-run trigger; may WAIT indefinitely | Amended by DR-089: post-completion settlement; in-run settles INACTIVE with watch handle (SP-9) | None — does not keep dangling WAIT at completion |
| **R1** | `research_route before Q15` | `research_route` + deadline via R-G | None — deadline not smuggled into deactivation |
| **R3** | `research_route at AIM` + re-fire | Same + ACTIVE→ACTIVE re-entry on append-only stream | None — re-activation uses existing event model |
| **R5** | nonterminal researched answer before confident serve | Predicate = nonterminal researched answer; serve timing = deadline | None |
| **R6** | release history only | POLICY_BLOCKED; candidates named-not-adopted | None — refuses to invent `Q1=CONTINUE` / `research_route` |
| **R7** | `beside Q8 type routing` | Co-fire → `Q7 not terminal` (SP-11) | None — derivation flagged, not silent |
| **R8** | `AIM before source-plan freeze` | AIM entered + freeze deadline (R-G) | Acceptable R-G parity; no new threshold |
| **R9** | `serve_candidate_ready` + per-node limb | Same; sampling ≠ deactivation | None |

**Predicate-smuggle hunt (negative findings):** No sampled row invents a numeric threshold, a new fire conjunct, or a silent INACTIVE for a hole. Where the document reaches past the Fires cell (Q5 `before_evidence`, R7 co-fire, Q26/Q31 stage law, opening WAIT, per-item cardinality), it marks SP-3 / SP-5 / SP-11 / SP-13 / SP-14 rather than settling as law.

### (3) Three POLICY_BLOCKED filings justified — PASS

| Row | Fires cell | §14 / §6.4 fire condition? | Candidate readings |
|---|---|---|---|
| **Q14** | release history only (DR-013 UNBLOCKED · —) | §14 develops critic-criteria substance; **no fire condition** | `research_route` / ordering-before-critique — **named, not adopted** (SP-4) |
| **Q40** | same shape | L-8 places substance at Q40; **no fire condition**; stage law is isolation only | `eligible_critic_run` — **named, not adopted** |
| **R6** | same shape | §6.4 P-5 specifies *how* the blind check runs; **no fire condition** | `Q1=CONTINUE` or `research_route at AIM` — **named, not adopted** |

Filing is loud under DR-083, never INACTIVE (L-1). Q26/Q31 share the release-history Fires shape but are correctly rescued by §3.6 stage law with SP-5, not hidden.

### (4) 13 MACHINE rows = spec §3.13 in order; checksum 13/57/1 — PASS

§6 `M n/13` markers and §7.2 roll-up, in order:

1. Q15 · 2. Q17 · 3. Q22 · 4. Q23 · 5. Q34 (verdict limb) · 6. Q39 · 7. Q42 · 8. Q46 · 9. Q47 · 10. Q49 · 11. Q53 · 12. Q56 · 13. Q60

Matches requirements-spec §3.13 verbatim.  
Checksum stated and preserved: **13 MACHINE / 57 HYBRID / 1 LLM = 71**.

Near-machine exclusions named in §7.2 so the set cannot be over-counted: **Q45** (conditional zero-call fast path), **Q24** (bounded limitation sentence), **Q34 remediation layer** (LLM, non-gating). Correct.

### (5) DR-089 drain law + Q61-as-settlement — PASS

- Rider **R-B** quotes the drain law: no completed run leaves a row in WAIT; `POLICY_BLOCKED` is not drained (visible hole).
- §7.4 WAIT register: standing limbs only on **Q18** and **Q30**; both drain before completion.
- **Q61**: not intra-run WAIT; DR-089 amendment applied; in-run settles **INACTIVE with standing-watch handle as `skip_evidence`**; watch lives outside the run lifecycle; never-fires-if-run-incomplete bound carried. SP-9 correctly leaves the settlement-scoped activation record open for V.

### (6) POLICY_BLOCKED never INACTIVE; cache-hit rule — PASS

- **L-1** and **L-2** stated as standing law in §2 from spec §1 / AC-83.
- Q15 quotes the positive form: cache hit keeps the row **ACTIVE**.
- Q18 age rule: never cached (L-2 sibling).
- All three POLICY_BLOCKED rows explicitly forbid INACTIVE filings with the "satisfied hole" rationale.

### (7) PROPOSED-FOR-RATIFICATION; nothing self-ratified — PASS

Banner line 1: **PROPOSED-FOR-RATIFICATION**; V at VG-02.  
§9: *"It does not ratify itself."*  
Mentions of "RATIFIED (DR-061)" refer to OD-S-0x ledger stamps, not this document.

### (8) Scope — PASS

Only `docs/architecture/10-row-contracts.md` judged. Parallel-lane mid-edits (founding pack, other architecture docs) not treated as defects of this artifact.

---

## Non-blocking observations (do not block APPROVED)

These are confirmations that the author's SP register is doing its job, not rework demands:

1. **SP-4 / SP-5 / SP-11** remain the live VG-02 predicate questions (Q14/Q40/R6; Q26/Q31 stage-law sufficiency; R7 co-fire). The document correctly refuses to invent predicates.
2. **SP-9** Q61 in-run INACTIVE-with-watch-handle is a coherent DR-089 reading; V may still prefer a settlement-scoped activation record for the post-completion fire — already flagged.
3. **Q54** `predicate_inputs` lists `{any_serve_candidate, Q5_prior_present}` while Off-ACTIVE correctly keeps a missing prior as **ACTIVE + unavailable** (not INACTIVE). The Off-ACTIVE / ACTIVE-when columns win; the input set is slightly over-inclusive. Not a contract defect for PRE-05 scope.

---

## Verdict

**APPROVED** — the re-derived activation table meets DR-083 / DR-089 / ticket PRE-05 DONE WHEN. 71/71 rows present in order with written predicates or loud POLICY_BLOCKED filings; 13 MACHINE rows match §3.13 and are table-identifiable; AC-83 invariants and the drain law hold; derivations are flagged rather than smuggled; ratification is correctly deferred to VG-02.

---

# PRE-05 Grok peer review — rev 2 delta check

**Ticket:** `t_1a358442` (PRE-05 · DR-083 activation-table artifact)  
**Lens:** Grok (DR-101 independent peer; Claude-authored ticket)  
**Verdict:** **APPROVED** (approval of rev 1 **holds** over the delta)  
**Date:** 2026-08-06  
**Scope:** delta only — Q61 placement (row + R-A + §6.11 / §7.4 / §7.5 + SP-9) and Q5/R1/R5/R8 predicate restoration (rows + R-G + SP-3).  
**Not read:** any Codex verdict, any `reviews/pre-05-codex*` file, any reviewer's full findings text beyond the ticket's public CHANGES REQUESTED one-liner (which named the two fix classes, not their argument). Rev-2 handoff comment and the changed regions of `docs/architecture/10-row-contracts.md` only.

Authority for this pass: same as rev 1 (DR-083, DR-089, ADR-0009 §4, AC-83, requirements-spec §1 / §3 / §3.13). Prior rev-1 limbs that must not regress: 71/71 · predicate fidelity · POLICY_BLOCKED ×3 · MACHINE 13 · **DR-089 drain + Q61-as-settlement** · L-1/L-2 · PROPOSED-FOR-RATIFICATION · scope.

---

## Delta red-team

### (1) Q61 placement vs previously-passed limbs — PASS (strengthens, does not break)

Rev 1 (this lens) accepted: Q61 is post-completion settlement, not intra-run WAIT; standing WAIT limbs only on Q18/Q30; drain law on real WAIT; never-fires-if-run-incomplete bound; SP-9 open on settlement-scoped activation record. Rev 1 also treated in-run `INACTIVE`+watch-handle as a coherent *reading* while flagging the settlement record for V.

Rev 2 moves the **row's own contract** onto DR-089's **placement** ruling (stronger than drain):

| Surface | Rev-2 reading | Limb check |
|---|---|---|
| **Q61 Domain** | **NO INTRA-RUN `WAIT` — ever**; in-run `ACTIVE` never (predicate cannot hold pre-completion); run-creation filing **UNDETERMINED — SP-9**; post-completion `ACTIVE` outside the run lifecycle | Does **not** reintroduce intra-run WAIT. "ACTIVE never" follows the cross-run Fires cell, not a preferred filing shape. |
| **Q61 Off-ACTIVE / event** | No in-run off-ACTIVE limb; **no `WAIT` event at any point in a run**; run-creation left undetermined; firing is settlement-job outside `run_row_activation` run scope; never-fires bound retained | Prior settlement + never-fires limbs hold. The derived `INACTIVE`+`skip_evidence` handoff is **withdrawn as contract** — two candidates named, **neither adopted**. That is stricter than rev 1 and matches this lens's non-blocking SP-9 note (settlement-scoped record was already open). |
| **R-A** | Q61 **excluded**; count **3 ACTIVE · 3 POLICY_BLOCKED · 64 WAIT · 1 undetermined = 71**; SP-13 still owns the 64 opening WAITs only | Opening-state derivation no longer claims Q61. Arithmetic holds. |
| **§6.11 preamble** | Drain law for Q59/Q60/Q62 vs **placement** for Q61 — two distinct DR-089 effects | Prevents conflating drain with placement; protects the WAIT-limb check. |
| **§7.4 WAIT register** | Q61 = **NONE — never enters intra-run WAIT**; **not a drain case**; standing limbs still **only Q18 and Q30** | Prior WAIT-limb check holds and is sharpened: a drained WAIT still occupies WAIT mid-run; placement denies that occupation. |
| **§7.5 census** | +1 **UNDETERMINED** row (Q61); total 71 | Domain census still closes. `UNDETERMINED` is a refused filing (legend §5), not a fifth runtime domain member minted as law. |
| **SP-9** | Settled vs unsettled split is clean: **no WAIT ever** is contract; run-creation shape is **V at VG-02** | Does not smuggle (i) or (ii). 71-vs-70 activation-row stake is framed, not decided. |

**Negative hunt:** no residual "open WAIT → INACTIVE at completion" wording on Q61; no standing WAIT† on Q61; R-B drain law text untouched and still correct for rows that *do* open WAIT. Prior checklist items (5) and (6) therefore still pass.

### (2) Q5 / R1 / R5 / R8 predicates — strictly verbatim — PASS

Cross-check against requirements-spec §3 Fires cells (this pass only; not a re-audit of other rows):

| Row | Spec Fires (exact) | Artifact ACTIVE-when predicate | Excess / omission hunt |
|---|---|---|---|
| **Q5** | `trigger Q1=CONTINUE + before_evidence` | **`Q1=CONTINUE` + `before_evidence`**, quoted entire; both conjuncts kept | No residual "predicate is `Q1=CONTINUE` alone". `before_evidence` present in predicate **and** `predicate_inputs`. |
| **R1** | `trigger research_route before Q15` | **`research_route before Q15`**, quoted entire; `before Q15` kept | No residual deadline-narrowing of the trigger. Both elements in `predicate_inputs`. |
| **R5** | `trigger nonterminal researched answer before confident serve` | **full phrase**, quoted entire; `before confident serve` kept | No residual "predicate = nonterminal researched answer; serve timing = deadline". Both elements in `predicate_inputs`. |
| **R8** | `trigger AIM before source-plan freeze` | **`AIM before source-plan freeze`**, quoted entire; phrase kept | No residual "AIM entered + freeze deadline" as the adopted predicate. Both elements in `predicate_inputs`. |

**Rider R-G** retitled and rewritten: ordering-deadline classification is **Q4's alone** (`before_first_search`); **not generalised**. Q4 still correctly strips its own second conjunct using *its own* cell text — that is source-licensed, not an over-extension.

**Excess hunt (negative):** meta-commentary in the four ACTIVE-when cells (SP-3 flag, "not applied / not extended") does not invent fire conjuncts, numeric thresholds, or a silent INACTIVE. Off-ACTIVE base limbs stay route/terminal-route only; the conjunct-vs-deadline deactivation path is stated under **"What turns on SP-3"** and explicitly **"neither / adopts neither"**.

**New-omission hunt (negative):** no written trigger element dropped during restoration; `predicate_inputs` re-aligned with the full Fires text on all four so event contract and predicate no longer disagree. Q21's R-G citation removal (handoff note) is outside these four and does not create an omission in them.

### (3) SP-3 / SP-9 frame real V-decisions without smuggling — PASS

| SP | Framing | Smuggle hunt |
|---|---|---|
| **SP-3** | Kind **V ruling needed**. Four unclassified "before X" phrases; only Q4 classifies, and only of `before_first_search`. Stakes stated **symmetrically** (self-deactivation by run passage vs deleting written trigger elements). **V rules each of the four at VG-02.** | Contract cells keep phrases **inside** the predicate; neither conjunct reading nor deadline reading is adopted as law. No preferred answer in the ACTIVE-when cell. |
| **SP-9** | Kind **V ruling needed** (+ stale-text note). Settled half (no intra-run WAIT; post-completion watch) vs unsettled half (run-creation filing under ADR-0009 vs DR-089). Two candidates, **neither adopted**. | Domain cell carries only the settled half as contract; undetermined half is loud. No silent pick of (i) or (ii). |

### (4) Mechanical — PASS

- Banner line 1: **PROPOSED-FOR-RATIFICATION**; V at VG-02 — intact.
- §6 alone: **71** row blocks, **71** unique ids, order **Q1…Q62 then R1…R9** — re-verified.
- Checksum §7.1: **13 MACHINE / 57 HYBRID / 1 LLM = 71** — intact.
- §6 `M n/13` markers 1…13 present in order on the same 13 rows as §7.2 / spec §3.13.
- POLICY_BLOCKED count still **3** (Q14, Q40, R6). Scrutiny-point count still **15**.

---

## Prior limbs regression map (rev 1 → rev 2)

| Rev-1 checklist item | Status after delta |
|---|---|
| (1) 71/71 in order | PASS (unchanged) |
| (2) Predicate fidelity (sample) | PASS — the four previously-narrowed rows are now stricter-verbatim; sample's other rows not re-opened by this delta |
| (3) POLICY_BLOCKED ×3 | PASS (unchanged) |
| (4) 13 MACHINE + checksum | PASS (unchanged) |
| (5) DR-089 drain + Q61-as-settlement | PASS — **strengthened** by placement vs drain split; INACTIVE-handle no longer silently adopted |
| (6) L-1 / L-2 | PASS (unchanged) |
| (7) PROPOSED-FOR-RATIFICATION | PASS (unchanged) |
| (8) Scope | PASS — exclusive file still the only artifact judged |

---

## Verdict (rev 2)

**APPROVED** — Grok rev-1 approval **holds** over the rev-2 delta. Q61 placement is consistent with (and stricter than) the prior Q61-settlement and WAIT-limb checks; the four restored predicates are strictly verbatim against spec §3 Fires with no residual excess and no new omission; SP-3 and SP-9 are real V decisions without preferred answers in contract cells; mechanical 71/71, checksum 13/57/1, and PROPOSED-FOR-RATIFICATION banner remain intact.
