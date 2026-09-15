# PACKET — REQ-01 (compass + slice SPECs) · four elements per spine §4

## 1. Ticket-state block
Authoritative typed state in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/REQ-01-compass.md
(status ready · rework_round 0 · risk_tier low · allowed = INSTRUCTIONS.md, slices/**,
agent-reports/req-01.md, agent-reports/req-01-self.md · forbidden all_others).
All relative paths in this packet resolve from
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/

## 2. Immediate upstream artifacts
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md — the FROZEN spec (sha256 must equal 78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986; verify first, refuse on mismatch)
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/DECISIONS.md — rulings the goal implements (I-1…I-5, S1-1…S7-3)
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md — THIS mission's intake law (R7-*, D1–D7; D7 binds you: zero-drift, findings never edits)
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/inputs/slice-map.md — the fixed slice layout and the per-slice deliverable list (SPEC/PLAN/PROGRESS/DECISIONS content law)
Deliverables: INSTRUCTIONS.md (<100 lines: mission name, authority chain, roster, loop map,
slice index, global-DoD pointer, marker vocabulary) + the four files per slice dir exactly as
slice-map.md prescribes + agent-reports/req-01.md containing: your contradiction-check
findings (goal vs rulings vs repo reality — spot-verify at least 5 of the goal's file:line
anchors against the tree at dev@1c9578a) under headings `# REQ-01 r1`, `## VERDICT`
(CLEAN or FINDINGS), `## FINDINGS` (numbered; each: BLOCKING|NON-BLOCKING · WHAT · WHERE ·
WHY · SUGGESTED ROUTE), `## COVERAGE` (which slices/spans were transcribed, byte-identical
quote spans listed as goal line ranges).

## 3. Handoff marker
First line of agent-reports/req-01.md:
`READY FOR PEER REVIEW — REQ-01 r1 · comments read through: packet-req01-2026-09-01`

## 4. Stop conditions
- Zero-drift law (mission D7): task text and DoDs are QUOTED VERBATIM with goal line
  citations; any urge to reword, fix, or improve the goal becomes a FINDING, never an edit.
- Superpowers floor: `brainstorming` is WAIVED by D7 (frozen spec — creativity is a defect
  here); load `superpowers:verification-before-completion` before claiming done.
- Compass ≤100 lines; ~60 minutes of work; whichever binds first — if out of time, mark
  status waiting_dependency with what remains, never a half-written slice passed as done.
- Anything you cannot settle = CANNOT-ASSESS finding (router §2.7), never a guess.
- rework rounds: max 3.
- Self-report (router §3, the murder-case question verbatim from the router) filed at
  agent-reports/req-01-self.md BEFORE the marker line is set.
- Final message = `FILED: <report path>` + VERDICT line + finding count + slice count.
