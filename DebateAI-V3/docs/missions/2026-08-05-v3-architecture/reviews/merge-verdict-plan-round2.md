# H3 merge verdict — Plan.md re-review, round 2 (ARCH-V3-R1)

Merge node: orchestrator (DR-006). Inputs: `reviews/codex-plan-rereview.md`,
`reviews/opus-plan-rereview.md`. Lenses ran blind to each other.

## Verdict

```text
STAGE REVIEW CHANGES REQUESTED (merged)
REWORK ROUND: 2 of 3
Route: same author, session c2-author
```

## Verification outcome

- Codex lens: C-1, C-2, C-4, C-5, C-7, C-8, C-9 REPAIRED; **C-3, C-6, C-10
  NOT-REPAIRED** (H2 test tolerance too wide; `tier_source` missing from the
  `run` carrier; null-vs-CHECK semantics in Postgres).
- Opus lens: **all 22 REPAIRED**; both round-1 BLOCKERs closed.

## Adjudication

Zero inter-lens contradictions. Two independent convergences, repair each
ONCE:

- **C-12 ≡ O-27** — the eviction repair writes `SUPERSEDED` into the frozen
  conformance record (violates AC-07/DR-060b) and C-12 adds that it also
  mints an unauthorized answer-surface hybrid. Both lenses prescribe the
  same shape: conformance record stays byte-frozen; suppression lives in a
  separate append-only serve projection keyed to
  `served_number = EVICTED(MISSING-NUMBER)`; answer-surface states stay
  within the UI contract's ruled set. Note for the record: O-14's round-1
  wording prescribed the defective mutation; the Opus lens acknowledges the
  shared authorship in its file. The round-1 required-modification is
  superseded on this point by the two lenses' agreed round-2 shape.
- **C-13 ≡ O-30** — S0's legal-serve claim pulls AM-1's unruled
  conformance-sampling rule into S0 while the blocks table says S5, and the
  S0 trace omits Q53 (C-13) / gate 2 (O-35). Repair once: either AM-1 blocks
  from S0, or S0 is restated non-servable; publish the complete S0 state
  trace with every AC-52 gate in order and a named AC-53 terminal cause.

## Union packet for rework round 2 (25 findings)

- Reopened: C-3, C-6, C-10 (with the re-review's sharpened required
  modifications — C-10 must use a null-safe check on the canonical
  migration).
- New Codex: C-11 (BLOCKER — graph-scoped FKs incl. cross-run undercut
  rejection), C-12 (BLOCKER — see adjudication), C-13, C-14 (split
  deployment-capability vs per-run-reachability predicates), C-15 (remove
  AQ-4 double-disposition), C-16 (traceability spine AC-01..92).
- New Opus: O-23..O-31 (MAJOR — incl. O-23 operator-independence limb of
  VR-3; O-24 replay second-implementation vs AC-14/AC-85, resolve per the
  finding's required modification citing VR-3's ruled text, or raise as a
  V-QUESTION if the pack licenses no exemption; O-25 conformance judge's
  raw artifact tier assignment; O-26 run-table immutability discipline;
  O-28 UNDERCUT_TRANSMISSION must enter A-1's question for ratification;
  O-29 clean-room fence vs single-type-graph audit; O-31 organ-4 purity
  enforcement) and O-32..O-38 (MINOR).

## Counters

rework_round: 2 of 3. Trend: findings 32 → 25, BLOCKER 9 → 2; round-2 items
are dominantly repair consequences and precision. One round remains before
the cap freezes the loop into the V packet.
