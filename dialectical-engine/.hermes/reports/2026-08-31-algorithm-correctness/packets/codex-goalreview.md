# PACKET — codex-goalreview (T5) · four elements per spine §4

## 1. Ticket-state block
Authoritative copy in board/T5-codex-goalreview.md (status ready, rework_round 1 carried
from F1 orchestrator-charged, comments_read_through goal-v1-2026-09-01, allowed = exactly
one report path on the canonical board).

## 2. Immediate upstream artifacts
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md  (the draft under review)
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/DECISIONS.md  (the rulings the draft must implement — the review standard)
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/judge-adjudication.md  (adjudicated evidence)
- Your worktree (pinned dev@1c9578a) and your own audit findings — verify the draft's file:line references.
Review questions, in priority order: (1) does every task implement its cited S-ruling
faithfully — nothing added, nothing dropped, no ruling left untasked? (2) is every DoD
concrete and testable? (3) are the file:line references correct against the pinned tree?
(4) contradictions between tasks, ordering errors, scope creep past the Scope law?
Output skeleton: first line = marker, then `# CODEX GOAL REVIEW r1`, `## VERDICT`
(APPROVE or CHANGES), `## FINDINGS` (numbered; each: BLOCKING|NON-BLOCKING · WHAT ·
WHERE (task) · WHY (which ruling/evidence) · SUGGESTED FIX), `## MISSING` (rulings
without a task, if any).
Write to: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-goalreview.md

## 3. Handoff marker
First line of the report: `GOAL REVIEW r1 — codex · APPROVE|CHANGES · comments read through: goal-v1-2026-09-01`

## 4. Stop conditions
All four review questions answered or ~60 minutes, whichever first. Findings you cannot
settle become CANNOT-ASSESS findings, never guesses (router §2.7). Final message =
`FILED: <path>` + your VERDICT line + finding count.
