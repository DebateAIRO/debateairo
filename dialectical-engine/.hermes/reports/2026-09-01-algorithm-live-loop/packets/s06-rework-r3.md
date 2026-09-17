# PACKET — worker S06 rework r3 (rework round 2 of 3) · spine §4

## 1. Ticket-state block
Ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T10-T11-selection-label.md
(rework_round 2 of max 3 — one round remains after this). Allowed paths unchanged (lane
worktree /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s06,
report s06-selection-label.md — append `## r3`; self-report `## r3`; logs/s06/r3/).
Never push/merge; never edit board or DECISIONS.

## 2. Immediate upstream artifacts
RULINGS FIRST: J17 (preserved history readable; 0055's CHECK = declared history VALIDATED),
D24 + ADDENDUM + ADDENDUM-2 (token = the mutation; counts are gates; harness refuses a dirty
tree), D21, J16 in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md.
THEN codex r2 (read in full):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S06-codex-r2.md
All four findings are mandatory this round:
- B1 (blocking, F-S06-r2-B1): the HYG depth-2 fixture (tests/integration/database.test.ts
  :1926-1937, :2052-2084) gives both roots EQUAL strength (default judgementDouble
  steelman_fidelity 0.72, panel fidelity 0, default edge bearings), so the "strengths-not-order"
  oracle cannot tell the correct selector from "first configured provider" (a tied first root
  satisfies every assertion) AND the correct lexicographic tiebreak makes the outcome depend on
  which UUID sorts first — the three C3 greens are compatible with luck. Fix: make the root
  strengths STRICTLY unequal with the first configured root WEAKER; assert the strict inequality
  BEFORE the winner assertion; derive any unserved-maker expectation from the recorded strengths.
  RED first: show the mutant "selection back to first-configured-provider" is CAUGHT by the fixed
  fixture (and was NOT caught by the r2 fixture — record both).
- N1 (F-S06-r2-N1): the filed root typecheck (34de9dc8) and the C3 three-run record predate the
  final tip a10c2254 (which changed the projection type to ServedRootRuleHistory). Re-run the root
  typecheck and C3 ×3 at the COMMITTED rework tip after B1, and print the actual tip in each
  record's header. D14/D16 only if the diff touches those surfaces again — say which with
  `git diff --stat`.
- N2 (F-PACKET-S06-r2-N2 — the packet defect is the orchestrator's, the transcript is yours):
  `M4-omitted` (refutation-d24.log:807-848) has a NON-EMPTY porcelain field (README.md and
  database.test.ts modified) — inadmissible under ADDENDUM-2. Re-run it from the committed tip
  under the exit-3 guard: pre=0 / applied>0 / restored=0, diff, result, restore, hashes, EMPTY
  porcelain.
- N3 (F-S06-r2-N3): tests/architecture/t10-first-configured-provider-removed.test.ts:7-12,
  :144-154 still says the database no longer accepts the retired value (the opposite of J17) and
  its validation pin is non-discriminating. Rewrite the prose (database ADMITS declared history;
  fresh application writes stay live-only) and pin `pg_constraint.convalidated = true` in the
  existing DB-backed case so a NOT VALID regression is caught.
Mode-change count quoted (must be 0); every mutant D24-shape from a clean committed tip.

## 3. Handoff marker
Report head rewritten to D21: line 1
`REWORK READY FOR REVIEW — S06 r3 · comments read through: s06-codex-r2-2026-09-02`,
line 2 `report sha256:`; self-report `## r3` BEFORE the marker.

## 4. Stop conditions
- Rework round 2/3. BLOCKED (reason) on line 1 if a ruling is needed.
- Final message = `FILED: <path>` + marker + B1's RED (both fixtures vs the mutant) and GREEN
  log paths + the typecheck/C3 tip headers + the M4 re-run counts + the mode-change line.
