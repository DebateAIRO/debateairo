# PACKET — worker T7B (V-authorized micro-ticket after the rework cap; NOT a rework round) · spine §4

## 1. Ticket-state block
Ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T07-adaptive-stopping.md
(status changes from waiting_human to working on this dispatch; rework count stays 3/3 — this
is V's authorized micro-ticket, not a fourth round). Allowed paths unchanged: lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t7
(tip b64c1d04, clean), report agent-reports/t07-stopping.md (append `## T7B`), self-report
(`## T7B`), logs/t07/. Never push; never merge out (the orchestrator does that).

## 2. Immediate upstream artifacts
V's authorization is recorded at the DECISIONS.md tail (V-T7-codex-r3-1 → AUTHORIZED).
The finding, in codex r3's own words:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T7-codex-r3.md
section B1 — `packages/propagation/src/index.ts:844-857,910-925`: on the no-evidence arm the
decision returns `movedRootNodeIds: []` while `maxRootMovement` carries the value the shared
body just computed (codex's input: two roots, expectedRootCount 2, root A 1/2 → 3/4, root B
uncomparable, measuredEdgeCount 0, delta 0.01 → CONTINUE / NO_MEASURED_EDGE with
maxRootMovement 0.25 and movedRootNodeIds []). The dominant reason stays NO_MEASURED_EDGE;
the record must stop erasing the computed fact.
Scope, exactly: (1) that arm returns `movedRootNodeIds: moved`; (2) pin codex's exact input as
a test asserting reason NO_MEASURED_EDGE together with maxRootMovement 0.25 and
movedRootNodeIds ["root:A"]; (3) one D24-valid mutant (restore the empty list) from a clean
committed tip, in the r4b harness shape (literal NEW between <<<TOKEN and TOKEN>>>, gates
pre=0 → applied>0 → restored=0); (4) re-run the unit cluster ×3 and the root typecheck at the
committed tip, each record stamped with commit and tree id (D27); (5) scan the remaining arms
for the same erasure class and report what you find — fix only this arm.
Nothing else changes. If the fix needs any other file, stop and say so.

## 3. Handoff marker
Report head rewritten: line 1
`READY FOR PEER REVIEW — T7B (V-authorized micro-ticket) · comments read through: t07-codex-r3-2026-09-02`,
line 2 `report sha256:`; self-report `## T7B` BEFORE the marker.

## 4. Stop conditions
- HOST HOLD is in force at dispatch: a peer session is running a full suite. Write the code and
  the test now; start no vitest/tsc until the orchestrator sends "HOST RELEASED".
- Final message = `FILED: <path>` + marker + the RED (mutant) and GREEN log paths + the
  commit/tree-stamped typecheck line + your arm scan result.
