# PRE-06 — Codex review lens

Ticket: `t_f6e8547d`  
Reviewed artifact: `docs/missions/2026-08-06-v3-programming/ratification/71-row-classification.md`  
Mode: independent, read-only peer review under DR-101  
Comments read through: `READY FOR PEER REVIEW` at ticket timestamp `1786046723`; no later comments or Grok verdict/artifact was read.

## Verdict

The inventory and protected-core checks pass, but the ratification package needs four corrections before approval. Two affect the authority and constructibility argument for the proposed enrichment rows; two are contract-precision defects against the ticket's explicit verification criteria.

## Numbered findings

1. **Q49's enrichment basis is misrepresented as RULED text.** The proposal says fragility is “ruled” to be an output-never-weight and that “by ruling” nothing downstream reads it (§4 Q49), then calls the non-feedback law “ruled” and the T-2 case “airtight” (CP-1). The source says otherwise: requirements-spec §3's audit explicitly identifies Q49's feedback-loop contract as `[CD]`, and §10.2 marks both C-6 and C-7 `CARRIED-DESIGN`; DR-031 ratified Q49's MACHINE classification, not those consequence clauses. The C-6/C-7 design is coherent and gives a non-circular proposed basis, but the package must label that basis accurately. Either make the carried-design dependency explicit in Q49/CP-1 and in the wholesale ratification surface, or cite a later ruling that actually promotes output-never-weight/no-feedback to RULED.

2. **The LRD-1 argument overclaims that only Q27 can satisfy the node-inspection limb and misstates what FX-SRV-16 proves.** Section 5 and CP-2 call Q27's skip mark “node-scoped” and say it is the only proposed enrichment row satisfying FX-SRV-16. FX-SRV-16 instead describes an answer-scoped mark whose non-empty affected set is stored in `condition_mark_node` and requires the fixture to inspect a node; it does not establish Q27's uniqueness. The proposal itself later admits that Q49 might satisfy the node inspection, contradicting the earlier “only Q27” claims. Ground the selected fixture in the actual mark contract: name how the skipped row produces a non-empty affected-node set, state whether Q27's budget mark is answer- or node-scoped with authority, and revise Q49's role and CP-2's consequence-if-moved accordingly. Until that is done, the claimed Q27-only brittleness is not established.

3. **The §4 row-label cells are not verbatim PRE-05 identities.** The ID set and normalized MACHINE/HYBRID/LLM categories match, but the ticket asks for the identity space verbatim. Examples: PRE-05 has `Q27 · LLM (the battery's single LLM row)`, `Q34 · MACHINE (the verdict)`, and `Q45 · HYBRID with a machine-only fast path`; PRE-06 shortens or rewrites each. It also appends POLICY_BLOCKED annotations to Q14/Q40/R6 in the identity cell. Copy PRE-05's `Row · label` cells verbatim and move PRE-06-only annotations into the ground or justification column.

4. **The no-number attestation contradicts the document.** Sections 1 and 9 say no threshold, rate, cap, or price appears and that the only counts are row counts, but §2 explicitly names DR-050's `K=1` bound. No invented value was found—the bound is sourced—but the stronger “row counts only / no cap appears” assertion is false. Remove the numeric cap from this package or narrow the attestation to “no numeric value is invented; any quoted value is source-bound.”

## Checks that passed

- Independent extraction of §4 found exactly 71 rows: Q1–Q62 and R1–R9, with no duplicate, missing, or extra ID.
- Independent checksum: MACHINE 13, HYBRID 57, LLM 1. Class checksum: correctness 69, enrichment 2.
- The five stated protected-core heads map to Q51, Q55, R5, Q16, and R9. The map's 30-row union is entirely correctness; neither Q27 nor Q49 appears in it.
- Q27's substantive enrichment case is grounded in RULED text: DR-020 knob 8 makes it diagnostic-note-only, `coverage_passed` is forbidden, and FX-DEF-02 keeps coverage-as-gate not shipped.
- Fifteen correctness grounds were sampled across every stage and the rules block: Q1, Q8, Q14, Q16, Q22, Q26, Q30, Q34, Q39, Q46, Q51, Q54, Q59, R5, and R8. Every row has a non-empty justification; no sampled correctness justification was circular. Q49's enrichment logic is non-circular but has the authority defect in finding 1.
- All ten pull-outs contain the DR-061 four-part shape: what it is, why it matters, options, and recommendation. Their alternatives state the consequence of moving. CP-9 and CP-10 are visibly marked `V to confirm` and included as riders on the wholesale yes/no, not silently assumed.
- The artifact is prominently `PROPOSED-FOR-RATIFICATION`, preserves DR-093's pre-ratification correctness default, and remains untracked. No ticket-created branch, commit, or push artifact was observed.

CODEX REVIEW: CHANGES REQUESTED — 4 numbered findings

## Re-review — revision 2

Comments read through: `READY FOR PEER REVIEW (rev 2)` at ticket timestamp
`2026-08-06 23:23`; the Grok review lane was excluded from this verdict's
evidence basis under DR-101.

## Verdict

All four requested corrections are present and agree with the primary sources.
The rev-2 artifact preserves the previously reviewed classification and checksum.

## Finding-by-finding verification

1. **Q49 authority grade — resolved.** Requirements-spec `R-AUTH-3` says a
   ratified MACHINE/HYBRID/LLM classification is not a ratified full contract,
   names Q49's feedback-loop contract among the `[CD]` clauses, and §10.2 stamps
   both C-6 and C-7 `CARRIED-DESIGN`. Targeted searches of the founding,
   ARCH-V3-R1, and PROG-V3-R1 decision ledgers found no later Q49/C-6/C-7
   promotion. Rev 2 now marks Q49's T-2 conjunct `[CD]`, §3.1 states that this is
   the exactly one `[CD]` conjunct across the 71 rows, CP-1 exposes the choice,
   and wholesale rider (d) makes adoption or rejection V's decision.

2. **LRD-1 / `FX-SRV-16` — resolved.** The §5.1 quotation matches
   `06-test-strategy.md`: the mark is answer-scoped, its affected-node set is
   stored once in `condition_mark_node`, and it is projected per node at read
   time. Rev 2 retires the node-scoped/answer-scoped discriminator and explicitly
   withdraws the uniqueness claim. Section 5.2 supplies scope-of-work candidate
   affected sets for Q27 and Q49; §5.4 correctly distinguishes the twice-met
   enrichment-existence condition from the still-single-source node-inspection
   risk when either row is pulled. SP-C1 leaves the affected-set derivation with
   S9 and the projection limb with S5, matching `07-build-order.md` §5.1. The
   remaining derivation is disclosed as build-lane work and no classification is
   made conditional on pretending it is already settled.

3. **Verbatim PRE-05 identities — resolved.** A scoped machine diff of all first
   cells in PRE-05 §6 against PRE-06 §4 extracted 71 cells from each and returned
   zero differences (`diff` exit 0). The POLICY_BLOCKED notes are outside the
   identity cells.

4. **Numeric attestation — resolved.** Sections 1 and 9 now attest only that the
   package invents no numeric value and inventory the two quantitative source
   items: DR-050's `K=1` bound and the Q45 worked composition case. The Q45 text
   reproduces the spec's figures `0.9935`, `0.0997`, and `9.96×`; the bound is
   source-bound to requirements-spec §10.2 C-5a. No unsourced threshold, rate,
   cap, or price was found.

## Preserved invariants

- 71 rows, exactly once: Q1–Q62 and R1–R9.
- 69 correctness / 2 enrichment, still Q27 and Q49.
- Label checksum: 13 MACHINE / 57 HYBRID / 1 LLM.
- Protected-core set: 30 rows, all correctness; no enrichment row is included.

CODEX REVIEW (rev 2): APPROVED
