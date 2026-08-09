# PRE-01 — Codex independent peer review

Ticket: `t_e7632c8f`  
Evidence boundary: ticket body, the two required ledgers, and ticket comments through the `READY FOR PEER REVIEW` marker at `1786046227`. No later ticket comment and no Grok verdict or `reviews/pre-01-grok*` artifact was read.

## Verdict

Changes requested. The ruled content and concrete fixture reconciliation are largely correct, but two acceptance-critical documentary defects remain.

## Findings

1. **The struck carriers-only record is not verbatim-complete.** The acceptance contract requires every struck zone to quote the text being struck and cite the striking ruling. `07-build-order.md` does this for zones such as S2, S3, S4, S5, S8, and S14, but not consistently:
   - S6 (`07` lines 870–879) says only that the former zone was “conditioned on Q-15 and Q-17” and then summarizes the ruled behavior. It does not quote the former zone, despite attaching DR-083, DR-084, DR-085, DR-087, and DR-088 to the strike heading.
   - S7 (`07` lines 939–949) quotes the Q-20 half, then says the Q-21 half “was never a fence” without quoting that struck half.
   - S9 (`07` lines 1086–1097) paraphrases both former halves and preserves only fragments, rather than quoting the struck zone governed by DR-093 and DR-094.

   Restore the exact former language for each omitted half (or quote the complete former zone once) and associate each quoted clause with the DR that struck it. This is an auditability requirement; a paraphrase cannot prove what text was retired.

2. **The tie-break has opposite normative owners in the landed documents.** `07` §5.1 lines 1412–1435 resolves the ambiguous sentence by making `06` §12 authoritative for fixture slice assignment and matrix A the artifact to repair. The grammar and exhaustive-roster arguments support that reading, and the concrete results are sound. But landed `06-test-strategy.md` §12 lines 859–867 states the reverse: “`07` owns slice assignment,” and says `06` is the table repaired when it disagrees with `07` §5.1. Its FX-SRV-16 rows saying “reconciled per `07` §5.1” confirm where this reconciliation was recorded, not the source-of-truth rule asserted by `07`.

   Reconcile the normative language so both documents identify one owner. If PRE-01 intends the well-supported resolution currently written in `07`, the conflicting ownership sentence in `06` must be expressly superseded or repaired; otherwise the next disagreement still has no operative tie-break.

## Checks that passed

- GPG-1 is satisfied under DR-098/DR-100; GPG-2 is satisfied wholesale with the required no-per-technology/no-fabrication caveat; GPG-3 and GPG-4 remain OPEN behind VG-01. No toolchain value or contract version is invented.
- All 28 entry-criteria questions are `RULED` with the ledger-exact authority, including Q-08 as DR-075 plus DR-076 and Q-14 as DR-082 plus DR-086. The 28-row ruling register in `09` matches the same mapping.
- DR-074's P-D2 rescope uses the ledger's operator-resolution language, deletes the declare/withhold machinery, and flags the now-unreachable operator-undeclared `WITHHELD` branch under AC-77 / blocking `FX-ORPH-02`.
- `07` §§3.3–3.4 faithfully assign ruling-created work to the owning S-ticket slices and replace the DR-069/AC-61 optional-manifest idea with the intra-repo static type-graph pass.
- The concrete §5.1 reconciliation is substantively sourced: FX-SRV-16 has an S9-owning affected-set limb and an S5 projection limb; FX-LG-06 and FX-S22-05 repair `09` omissions limb by limb; all 13 IDs and 17 placements come from `06` §12. The ticket's unsupported “16” count is explicitly preserved as a discrepancy rather than normalized away.
- `09` records TRACE-7 as discharged by PRE-08, ADR-0015/ADR-0016 as landed by PRE-04, and REG-8 as the sole untouched VG-02 row. Eight reverse-index samples were checked against the Plan §1 authority column: DR-015, DR-017, DR-034, DR-039, DR-047, DR-055, DR-063, and DR-085; all match.
- There are zero `CONDITIONAL` hits in the two reviewed files.

CODEX REVIEW: CHANGES REQUESTED — 1) incomplete struck-text quotations; 2) contradictory tie-break ownership

## Rev 2 re-review

Evidence boundary: prior Codex review; ticket `t_e7632c8f` comments through the rev-2 handoff at comment `68` / `1786047347`; direct inspection of the untracked `07-build-order.md` and `09-traceability.md`. No Grok review artifact was used.

Both prior findings are resolved.

1. **Struck-text auditability is complete.** S6, S7, and S9 each contain the full former carriers-only zone in a blockquote. Their wording matches the pre-fold-in source (independently compared with Markdown soft-line wrapping normalized), and the following prose accounts for each clause: S6 ties Q-17 to DR-085 and Q-15 to DR-083, preserves the empty-map clause as value-pending, and explicitly says DR-084/DR-087/DR-088 strike no clause; S7 distinguishes DR-089's substantive Q-20 strike from DR-090's removal of Q-21's provisional status; S9 identifies DR-093's partial Q-24 strike and survivors and DR-094's Q-25 strike, preserved carrier, and new reachability consequence. The added full quotations for the `FX-DEF-01` conditional, `FX-SRV-13` hedge, and §8 pending-V paragraph are consistent with those rulings and do not widen the retired semantics.
2. **Tie-break ownership is single and operative.** `07` §5.1 supersedes rather than reinterprets the ambiguous sentence, makes `07` the fixture-slice schedule owner and operative tie-break, and retains `06` as roster owner with an exhaustiveness obligation. The prior grammar-based ownership ground is gone; the two possible readings remain only to demonstrate ambiguity. The corollary, `FX-SRV-16` row, non-disagreement treatment of `FX-LG-06` and `FX-S22-05`, 13-id/17-placement adoption framing, and `09` §7 introduction all use the same direction. The residual ambiguous sentence in `06` is expressly recorded as superseded and routed to PRE-03 instead of being left silent; the current `06` §12 shows that repair has since landed.

No concrete slice assignment changed from rev 1: `FX-SRV-16` remains S5 projection plus S9 owning; `FX-LG-06` remains S0/S5/S9; `FX-S22-05` remains S0/S6/S15; and the adopted roster set remains 13 ids / 17 placements. Focused residue checks also find zero `CONDITIONAL` occurrences in the two reviewed files and no operative old-direction ownership statement.

CODEX REVIEW (rev 2): APPROVED
