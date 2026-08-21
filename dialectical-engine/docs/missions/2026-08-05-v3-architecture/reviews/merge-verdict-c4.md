# H4 merge verdict — C4 artifact set, round 1 (ARCH-V3-R1)

Merge node: orchestrator (DR-006). Inputs: `reviews/codex-c4-review.md`
(CHANGES REQUESTED — H-C-1..10, 2 BLOCKER / 8 MAJOR, gap table 12 REAL / 15
MISREAD) and `reviews/opus-c4-review.md` (CHANGES REQUESTED — H-O-1..19,
2 BLOCKER / 10 MAJOR / 7 MINOR, gap tally 28 REAL / 3 MISREAD / 4
UNVERIFIABLE). Lenses blind to each other.

## Verdict

```text
STAGE REVIEW CHANGES REQUESTED (merged)
C4 REWORK ROUND: 1 of 3 (fresh budget for this stage)
Route: repairs to the OWNING LANES (disjoint files, parallel)
```

## Adjudications (disagreements only)

1. **Codex TRACE-1/TRACE-2 vs Opus H-O-7 (AC-89/AC-90 fixtures).** OPUS
   UPHELD, verified by the merge node at source: `06-test-strategy.md`
   lines 470–471 carry FX-SRV-10 (AC-89 × AC-62, reaper-writes /
   read-derives pair) and FX-SRV-11 (AC-90 incl. the no-live-node limb).
   The repair is lane 1 pointing 09's cells at those ids — NOT new lane-6
   fixtures. Codex's TRACE-5 (AC-25/AC-31 have no fixtures) is undisputed
   and stands.
2. **Codex H-C-5 vs Opus "lane-2 toolchain gap MISREAD".** BOTH UPHELD —
   compatible: the register row exists (Opus) but as one prose aggregate
   that is not executable (Codex). Directed repair = Codex's: split into
   four stable keys + bootstrap read story + the tools/register edge
   resolution.
3. **Terminal routes (H-C-1 ≡ H-O-4).** One finding, one repair: the count
   is FIVE by DR-037 (ledger wins over spec §12.3's four-member Home-3
   table); record the founding-table correction as a directed FinalPlan/V
   item; unify AC-65, 02's enum inventory, 00's spine, 09, and FX-LG-04 to
   the five-member list. Owning lanes 1, 3, 6 repair their own files.
4. **H-C-9 (remove SI-1/SI-2 from 08) ≡ H-O-17 (SI-2 carries a wrong
   count).** One repair: SI-1/SI-2 leave the C4 artifact; VS-1 already
   lives in the banner and the morning report; 08 returns to exactly 28
   Q-nn entries.
5. **Gap dispositions.** Merge rule: REAL if either lens shows an
   unresolved contract fact and the other does not cite a verifying
   resolution. Final REAL set carried to the consolidated gap index (lane
   1, H-C-10 ids): DM-1, DM-2, DM-3, DM-4, MOD-2≡REG-5, API-1, BUILD-1,
   BUILD-2, TRACE-5, TRACE-7≡H-C-1, plus Opus's REAL rows not contradicted
   by a Codex citation (headline: H-O-11's S6/S8/S10 data-model absence,
   which subsumes DM-1/DM-2). MISREAD rows close with their citations
   (DM-5 — lane 3 must choose, H-C-6; DM-6; MOD-1; MOD-3 — owner is
   graph.materialiseSnapshot, H-C-7; API-2; API-3; REG-4 — becomes an
   explicit SEAT-PROPOSAL, H-C-8; REG-6; TEST-1; BUILD-3; BUILD-4;
   TRACE-3; TRACE-4; TRACE-6; lane-1 G-1/G-2 per adjudication 1).

## Routing table (all 29 findings; a lane repairs only its own files)

| Lane | Findings |
|---|---|
| 1 | H-C-1 (spine), H-C-4 (FX ids into 00/09), H-C-10 (global gap ids + consolidated index), H-O-5, H-O-6 (AC-92 cell aligns with DM-3 REAL: "no — pending FinalPlan carrier"), H-O-7, H-O-16 |
| 2 | H-C-3 (Q-nn across all 14 ADRs), H-O-15 |
| 3 | H-C-1 (enum inventory → five), H-C-3, H-C-6 (choose answer_index form — lane authority), DM-1/DM-2/DM-3/DM-4 carriers (proposed shapes, FinalPlan-bound), H-O-11 (S6/S8/S10 data-model homes), H-O-13 |
| 4 | H-C-3, H-C-5, H-C-7 (owner = graph.materialiseSnapshot; drop G-3), H-C-8 (explicit SEAT-PROPOSAL), H-O-1 (replay self-test owner per the finding's required modification), H-O-3 (reaper inventory), H-O-10 (serve edges), H-O-2's edge-list half |
| 5 | H-C-3, API-1 (pagination), H-O-2's endpoint half (incl. GET /v1/fleet owner), H-O-14, H-O-19 |
| 6 | H-C-1 (FX-LG-04 → five), H-C-4 (mint FX ids: AC-25, AC-31, zero-call proof, FX-PT-D4), H-C-3, H-O-8 (slice map completeness), H-O-18 |
| 7 | H-C-2 (global pre-S0 gate; Q-02 conditional on Q-01=yes), H-C-9≡H-O-17, H-O-9 (Q-04 canonical labels), H-O-12 (un-rule AQ-1 at S5), BUILD-1/BUILD-2 (assign slices + FX ids with lane 6's minted ids) |

Cross-lane conventions fixed by this merge: Q-nn is the primary C4 address
everywhere ("pending V — Q-nn (Plan-id)"); FX-* is the only fixture
address; gap ids use the Codex prefixes (DM/MOD/API/REG/TEST/BUILD/TRACE)
+ lane-1's consolidated index is the single register of them.

## Counters

C4 rework_round: 1 of 3. Finding totals: 29 (4 BLOCKER / 18 MAJOR / 7
MINOR). Adjudicated disagreements: 2 (both resolved with evidence, no
single-finding re-check needed beyond the merge node's own source
verification).
API-4 (REAL, cross-lane, found by lane 5 rework): fleet status — GET /v1/fleet owner named as apps/runner queue (SEAT-PROPOSAL) but no packages/* context in Plan §3.1 owns fleet status and Plan §4 names no table; /v1/session context likewise unowned. Routed to: lane 1 consolidated index + FinalPlan consolidation + re-review scope.

Addendum (rework round 1, cross-lane items surfaced by lane reports):
- ADR-0015 (maker-inventory two-predicate choice): lane 2 accepted the merit,
  declined the mint on scope (Plan §7 row 2 fixes the set at fourteen) —
  DIRECTED ITEM for FinalPlan consolidation; interim record at
  01-decisions/README.md §2.
- Lane-1 residual from lane 2: 09-traceability owes the AC-38 cross-ref cell
  → 03-module-design.md §7.3 + FX-PRV-01a/b. In re-review scope.
- New shared file sanctioned: 01-decisions/README.md (H-O-15's named home) —
  lane 2's file, carries its Q-nn map + AC-38 record + gap table G2-1..G2-5.
