# PRE-04 Codex review lens

Ticket: `t_c3538824`  
Mode: independent content review of `docs/architecture/01-decisions/` under DR-101  
Handoff cursor: `READY FOR PEER REVIEW` at `1786045882`  
Comments read through: allowed `ORCHESTRATOR ADJUDICATION` at `1786046610`

Review firewall held: no Grok verdict, no `reviews/pre-04-grok*` file, and no
post-handoff ticket comment other than the permitted orchestrator adjudication
was read. The corrected contract was followed: all architecture files are
untracked, so this review audits current content against its cited authority and
README change record, not a nonexistent Git baseline.

## Verdict summary

The requested maker-inventory ADR, repository-layout ADR, numbering resolution,
wholesale status language, ruling fold-ins, banner removal, and citation
resolution are present and substantively sound. One content error prevents
approval: ADR-0011 and ADR-0014 incorrectly treat `WITHHELD(reason)` as possibly
unreachable after DR-074, although AC-26 / DR-062 OD-05 independently preserves
the strict-and producer.

## Checks completed

1. **ADR-0015:** records the two distinct predicates from `03-module-design.md`
   §7.3: `deployment_maker_capability` for standing configuration/admission and
   `run_maker_reachability` for a run's transient provider failure. It carries
   owner context 16 (`providers`), DR-055 / charter S4 / AC-38, fixtures
   `FX-PRV-01a`, `FX-PRV-01b`, `FX-PRV-02`, and adjacent launch prerequisite
   `FX-HR-H2a`. All four fixture ids resolve in `06-test-strategy.md`.
2. **ADR-0016:** records DR-068 and DR-069 verbatim, including every ledger
   field, the unenforced clean-room / honour-system trade-off, and the condition
   “Accepted trade-off, not a gap — do not re-raise as an open question.” Clause
   6 preserves the do-not-re-raise instruction explicitly.
3. **Numbering:** README §2 and reciprocal notes in both new ADRs record the
   conflict and resolution. The reasoning is sound: DR-099 adopts A-02, whose
   FinalPlan text names both `ADR-0015` and the maker-inventory subject; DR-069
   requests an ADR for repository layout without assigning a number. Assigning
   the next free number, ADR-0016, avoids renumbering the established set.
4. **Statuses:** ADR-0001..ADR-0014 all say `ACCEPTED wholesale via DR-098
   (VS-1)`, state that no per-technology ratification row exists, and leave
   itemized confirmation pending at VG-01. README expressly disclaims both a
   per-ADR ruling and itemized technology ratification. ADR-0015/0016 use
   narrower truthful record statuses tied to their specific authority.
5. **Amended-content sample:** checked ADR-0005 (DR-071/073/075), ADR-0009
   (DR-083/089/093), ADR-0010 (DR-069/088/097), ADR-0011
   (DR-074/078/080/081/088/097), ADR-0013 (DR-070/094/095), and ADR-0014
   (DR-078/079/082/086). Their requested ruling fold-ins and `RULED` citations
   match the ledger, subject to Finding 1 below.
6. **Mechanical checks:** exactly 17 Markdown files; zero uppercase
   `CONDITIONAL` hits; zero `pending V` hits in any ADR. The only two
   case-insensitive `pending V` hits are README's historical/change-record
   quotations, not live markers. All 14 wholesale ADR status headers contain
   the DR-098 / no-per-technology / VG-01 language.
7. **Citations:** all 80 distinct `DR-NNN` citations in the directory resolve
   against the founding and ARCH-V3-R1 ledgers. Sixteen were spot-checked
   individually: DR-013, DR-014, DR-055, DR-068, DR-069, DR-070, DR-071,
   DR-074, DR-082, DR-083, DR-086, DR-089, DR-097, DR-098, DR-099, and DR-100.
8. **Scope:** findings judge only `01-decisions/`; external documents were used
   solely to verify cited authority, fixtures, and the permitted adjudication.

## Finding 1 — `WITHHELD(reason)` is not an open reachability question

Severity: material architecture-record contradiction.

ADR-0011 clause 8 and ADR-0014's costs say DR-074 may have removed every
producer of `WITHHELD(reason)`, call the member potentially unreachable, and
route the question to the merge node / V. That conflates two independent
producer paths:

- DR-074 deletes the Q45 path `WITHHELD(no operator declaration)` by making the
  deployment operator mandatory.
- AC-26 / DR-062 OD-05 remains live: strict-and has no identity element, so an
  unjudged or abstained conjunct withholds the parent number and serves the
  components.

The permitted orchestrator adjudication confirms this distinction, and the
cited founding manifest §4.2b/§4.4 states the surviving strict-and behavior.
Thus the member remains reachable without a new V ruling. The current prose is
not merely cautious; it records a false unresolved architecture question.

Required change: in ADR-0011 and ADR-0014, remove the open-question/V-routing
language and distinguish the deleted undeclared-operator reason from the live
strict-and unjudged/abstained-conjunct reason. Update the affected consequence
and constraint text consistently. No other PRE-04 change is requested.

CODEX REVIEW: CHANGES REQUESTED — 1. Correct ADR-0011 and ADR-0014: DR-074 deletes only `WITHHELD(no operator declaration)`; AC-26 / DR-062 OD-05 keeps `WITHHELD(strict-and conjunct unjudged or abstained)` reachable.

## Re-review — rev 2

Rework cursor: `REWORK ACKNOWLEDGED` comment 93 at `1786048489`; rev-2
`READY FOR PEER REVIEW` comment 94 at `1786048695`. Review independence under
DR-101 was preserved. No Grok verdict or `reviews/pre-04-grok*` content was read;
later Grok comment 98 was observed only as excluded metadata.

No findings remain.

1. **ADR-0011 clause 8:** the two-producer table is present and correctly splits
   the deleted configuration producer from the live arithmetic producer.
   `WITHHELD(no operator declaration)` is deleted because DR-074 makes the
   deployment row mandatory, with AC-77 / charter VR-4 supplying the
   remove-rather-than-fence reasoning. `WITHHELD(strict-and conjunct unjudged or
   abstained)` remains live under AC-26 / DR-062 `OD-05`. The false open-question
   block is gone, the AC-77 obligation is expressly discharged, and the builder
   warning forbids deleting the shared `WITHHELD` member.
2. **ADR-0014:** `served_number_event.status` retains the three members
   `PRESENT`, `EVICTED`, and `WITHHELD`. Clause 4 attributes the sole surviving
   `WITHHELD` reason to AC-26 / DR-062 `OD-05`; the AC-22 and AC-26 constraint
   rows are split; and the costs section identifies over-deletion as the hazard
   and names `FX-SRV-06` as its fixture.
3. **README:** the single rev-2 fold-in row expressly withdraws the rev-1
   possibly-unreachable / V-routing framing and cites DR-074 as scoped by AC-26 /
   DR-062 `OD-05`, manifest §4.2b, the ticket adjudication, and
   `02-data-model.md` §7.4.
4. **Landed-formulation alignment:** both ADRs match `02-data-model.md` §7.4:
   AC-22's undeclared-operator limb is deleted, AC-26's strict-and limb survives,
   strict-and has no identity element, the dead reason is removed rather than
   fenced, and the deletion removes a reason rather than a member.
5. **Rev-2 scope:** because `01-decisions/` is untracked, scope was checked
   directly by filesystem modification times against the prior Codex verdict
   cursor `1786048463`. Exactly three files are newer: ADR-0011 at `1786048582`,
   ADR-0014 at `1786048628`, and README at `1786048645`. All other files in the
   directory predate the rev-2 boundary, matching the handoff's stated edit set.
   Targeted checks also found two ADR-0011 producer rows, two split ADR-0014
   AC-22/AC-26 constraint rows, one README rev-2 record, and zero surviving
   rev-1 open-question phrases in the two ADRs.

CODEX REVIEW (rev 2): APPROVED
