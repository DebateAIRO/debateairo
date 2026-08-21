# PRE-05 — Codex review lens

Ticket: `t_1a358442`  
Role: independent read-only Codex lens under DR-101  
Artifact judged: `docs/architecture/10-row-contracts.md` only  
Ticket comments read through: `1786045824` (`READY FOR PEER REVIEW`); nothing after that marker was read.  
Artifact state: new untracked file, read directly.

## Verdict

**CHANGES REQUESTED.** The table passes its structural, classification, policy-block, and proposal-status checks, but two contract requirements are not yet satisfied.

## Numbered findings

1. **HIGH — Q61 is still modeled as an intra-run WAIT row, contrary to DR-089 and the ticket's explicit acceptance condition.** The Q61 contract declares ``WAIT⁰ → INACTIVE at completion`` **in-run** and its event contract says to open `WAIT` during run creation (`10-row-contracts.md:369`). That means Q61 does occupy intra-run WAIT until completion, even though the same cell and the roll-up correctly quote DR-089 saying Q61 is **not an intra-run WAIT row** and that its standing watch lives outside the run lifecycle (`10-row-contracts.md:482`; DR-089). Draining that WAIT at completion is not enough: it satisfies "no completed run displays WAIT" but not the stronger, expressly required Q61 placement. The proposed `INACTIVE` handoff and settlement-scoped activation-record shape are also admitted as an unresolved derivation in SP-9. Required change: give Q61 a lifecycle/event contract that never places the row in intra-run WAIT and that locates firing post-completion; if ADR-0009's mandatory run-creation event leaves the correct filing underdetermined, keep that point visibly unresolved for V rather than adopting the current derived filing as the row contract.

2. **HIGH — four predicates narrow their §3 source cells by an unsupported generalization, so the quote-fidelity sample does not pass.** Q4 alone says that `before_first_search` is an ordering deadline rather than an activation conjunct. The artifact turns that row-specific statement into rider R-G and applies it to Q5, R1, R5, and R8. Consequently it drops `before_evidence`, `before Q15`, `before confident serve`, and `before source-plan freeze` from the predicates (`10-row-contracts.md:242`, `:380`, `:384`, `:387`), while the source rows retain those phrases (`requirements-spec.md:229`, `:355`, `:359`, `:362`). Q5 even states that the spec does not classify the phrase and that the narrowing is by parity. That is a reasonable candidate interpretation, but PRE-05 requires predicates to be quote-derived and never invented; a candidate needing V confirmation cannot simultaneously be the adopted contract. Required change: preserve the literal §3 predicates, or obtain/name governing source text that applies the deadline rule to those rows; otherwise file the ambiguity without adopting the narrower predicate.

## Independent verification record

- **Coverage/order:** parsed the §6 row tables directly: 71 rows, exact order `Q1..Q62, R1..R9`, no duplicate IDs, and every row table line has the expected six columns.
- **Classification checksum:** parsed labels yield `13 MACHINE / 57 HYBRID / 1 LLM = 71`. The 13 `M n/13` markers are present exactly once and in §3.13 order: Q15, Q17, Q22, Q23, Q34-verdict, Q39, Q42, Q46, Q47, Q49, Q53, Q56, Q60. Membership and zero-call status are identifiable from §6 alone.
- **Predicate sample:** checked Q5; Q9; Q14; Q15; Q22; Q26; Q34; Q39; Q40; Q42; Q46; Q53; Q56; Q60; Q61; R1; R5; R6; and R8 against spec §3. This spans every stage plus the rule block, includes all three POLICY_BLOCKED rows, and includes eight MACHINE rows. The sample is faithful except for findings 1 and 2.
- **POLICY_BLOCKED:** Q14, Q40, and R6 have release-history text rather than fire conditions in §3. Sections 14 and 6.4 specify their substance but add no fire condition. All three filings are loud, never INACTIVE, and name candidate readings without adopting them.
- **WAIT/drain:** the general DR-089 completion drain is stated, Q18 and Q30's standing WAIT limbs are bounded, and Q61's post-completion direction is described correctly in prose. Finding 1 is the conflicting per-row event/domain contract.
- **AC-83 invariants:** POLICY_BLOCKED-never-INACTIVE and cache-hit-never-INACTIVE are standing laws; Q15 also carries the positive cache-hit rule in-row.
- **Ratification status:** the document is headed `PROPOSED-FOR-RATIFICATION`, says V ratifies at VG-02, and does not claim that this document is ratified. References to already-ratified source decisions do not ratify PRE-05 itself.

CODEX REVIEW: CHANGES REQUESTED — 1. Q61 remains intra-run WAIT; 2. Q5/R1/R5/R8 predicates exceed their source rows

---

# PRE-05 — Codex review lens, rev 2

Ticket: `t_1a358442`  
Role: independent read-only Codex lens under DR-101  
Artifact judged: `docs/architecture/10-row-contracts.md` only  
Rework comments read: `1786046620` (`REWORK ACKNOWLEDGED`) and `1786046881` (`READY FOR PEER REVIEW (rev 2)`). Any later Grok review content was excluded under the review-independence instruction.  
Artifact state: new untracked file, read directly.

## Verdict

**APPROVED.** Both rev-1 findings are corrected, and the requested invariants remain intact.

## Rev-1 findings re-verified

1. **Q61 placement — corrected.** The row domain now forbids intra-run `WAIT` as a placement rule: it never opens `WAIT`, no `WAIT` event is written at any point in a run, and firing is located after completion on the settlement watch outside the run lifecycle. The run-creation filing is explicitly `UNDETERMINED — pending V`; the document names both candidate shapes (`INACTIVE` with the watch handle, or no in-run activation record) and adopts neither. Rider R-A gives the corrected `3 ACTIVE / 3 POLICY_BLOCKED / 64 WAIT / 1 undetermined = 71` census. Sections 6.11, 7.4, 7.5, and SP-9 consistently distinguish DR-089's Q61 placement ruling from the ordinary WAIT drain law.

2. **Q5/R1/R5/R8 predicate fidelity — corrected.** Each predicate now preserves its complete §3 trigger verbatim: Q5 `Q1=CONTINUE + before_evidence`; R1 `research_route before Q15`; R5 `nonterminal researched answer before confident serve`; R8 `AIM before source-plan freeze`. Rider R-G is scoped to Q4 alone. SP-3 leaves the conjunct-versus-deadline choice to V and names both symmetric risks. Each row's `predicate_inputs` includes both written elements. Q21 no longer cites rider R-G; its ordering sentence is correctly kept outside its predicate.

## Independent verification record

- Parsed §6 directly: **71 rows**, exact order `Q1..Q62, R1..R9`, no order errors, and all row lines have six table columns.
- Classification remains **13 MACHINE / 57 HYBRID / 1 LLM = 71**. All 13 `M n/13` markers remain on Q15, Q17, Q22, Q23, Q34, Q39, Q42, Q46, Q47, Q49, Q53, Q56, and Q60, in that order.
- Exactly three row-domain filings remain `POLICY_BLOCKED`: **Q14, Q40, R6**; all remain loud and never INACTIVE.
- The `PROPOSED-FOR-RATIFICATION` banner and VG-02 ratification boundary remain intact.
- No other material regression was detected in the rework: the checksum, coverage/order, POLICY_BLOCKED trio, proposal status, AC-83 invariants, and WAIT/drain roll-ups remain internally consistent.

CODEX REVIEW (rev 2): APPROVED
