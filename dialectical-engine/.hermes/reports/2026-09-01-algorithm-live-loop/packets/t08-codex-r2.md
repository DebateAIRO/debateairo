# PACKET — codex review T8 r2 (rework verification) · four elements per spine §4

## 1. Ticket-state block
Same lane ticket (board/T08-strict-and.md, rework_round 1). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T8-codex-r2.md
and the `## r2` section of T8-codex-self.md. No tests, builds, git changes.

## 2. Immediate upstream artifacts
- The revised report (marker `REWORK READY FOR REVIEW — T8 r2`, sha line under it — verify):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t08-strict-and.md
- Your r1 findings (the convergence standard):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T8-codex-r1.md
- Diff since your r1 read: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t8 log --oneline 71afca1..HEAD` and the r1→r2 delta.
Verify, priority order: (1) B1 — the upgrade-from-0050 test seeds BOTH legacy shapes
(formerly-valid WITHHELD event; strict-withheld operator receipt in operator_by_parent),
the RED log shows both refusals failing against the unfixed 0051 (worker cites 4f/3p) and
GREEN shows 7/7; 0051 now preflights both shapes with loud refusal + operator HINT and
VALIDATEs all three narrowed constraints; append-only carriers are NOT reclassified.
Re-run the migration-content checks statically. (2) The worker's arm-(b) reasoning — rows
carrying the repealed operator are exactly the rows with no node_strength_record — check
that the preflight query actually catches that population. (3) B2 — the retrospective is
labeled honestly, and its disclosed result (two changed files with ZERO discriminating
base assertions: serve-s05, register sample-swap) is accurately characterized — neither
misrepresented as RED evidence. (4) N1 — the P4 exports oracle now covers non-function
exports. (5) F-T8-1 withdrawal recorded. (6) No scope creep in the r1→r2 delta.

## 3. Handoff marker
First line: `CODEX REVIEW T8 r2 — APPROVE|CHANGES · comments read through: t08-r2-2026-09-01`

## 4. Stop conditions
- STATIC only; verbatim output for re-runs. On CHANGES: round 3 is the last — say so,
  residue V-packet-ready.
- ~25 minutes. Self-report `## r2` BEFORE the marker.
- Final message = `FILED: <path>` + VERDICT line + finding count.
