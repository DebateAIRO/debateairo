# PACKET — codex review T1 r1 · four elements per spine §4
(orchestrator instantiates per lane: replace T1 1 /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1 1c9578a 97–106 t01-r1-2026-09-01)

## 1. Ticket-state block
Authoritative typed state in the lane ticket
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T01-depth-contract.md
(status waiting_review · you are the peer-review seat named in its verification route).
Your writable surface is EXACTLY TWO files:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T1-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T1-codex-self.md (self-report; append per round)
Everything else is read-only to you.

## 2. Immediate upstream artifacts
- The diff under review: run `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1 diff 1c9578a..HEAD` and `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1 log --oneline 1c9578a..HEAD` yourself; the worktree tree is your read surface.
- The worker's report (RED→GREEN evidence, suites passed/total, log paths): /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t01-depth.md
- The packet that dispatched the worker (you review THE PACKET too — reviewer duty §1: was it four-element, unambiguous, were its quoted constants correct?): /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t01-depth.md
- The standard: goal-prompt.md lines 97–106 of
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md
  (+ the slice SPEC at /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S02-hygiene/SPEC.md — quotes the same text; on any divergence the goal-prompt wins and the divergence is itself a BLOCKING finding)
Review questions, priority order: (1) does the diff implement the task's cited ruling(s)
faithfully — nothing added, nothing dropped? (2) is the RED evidence real (the first test
asserts DESIRED behavior and demonstrably failed on the base — check the worker's RED log,
not just the claim)? (3) do the DoD items each have verifiable evidence (grep-proofs,
counts matching the named logs)? (4) scope law: any file touched outside the task's
surface? (5) packet review per above.
Output skeleton: first line = marker, then `# CODEX REVIEW T1 r1`, `## VERDICT`
(APPROVE or CHANGES), `## FINDINGS` (numbered; each: BLOCKING|NON-BLOCKING · WHAT · WHERE
(file:line) · WHY (which DoD/ruling) · SUGGESTED FIX), `## PACKET REVIEW` (conformant or
findings), `## EVIDENCE CHECKED` (which logs/greps you actually ran).

## 3. Handoff marker
First line of your findings file:
`CODEX REVIEW T1 r1 — APPROVE|CHANGES · comments read through: t01-r1-2026-09-01`

## 4. Stop conditions
- STATIC review only: the sandbox denies pnpm/installs (known trap) — do NOT attempt test
  runs; verify dynamic claims against the worker's tee'd logs (line-level: the counts the
  worker quotes must appear in the named log file).
- Findings are findings: BLOCKING vs NON-BLOCKING changes when, never whether (router §2.2).
- Anything you cannot settle statically = CANNOT-ASSESS finding naming the missing evidence.
- ~45 minutes; your verdict round is r1 of max 3 rework rounds.
- Self-report (router §3, murder-case question) at agent-reports/T1-codex-self.md
  BEFORE the marker is set (append a `## r1` section on later rounds).
- Final message = `FILED: <findings path>` + VERDICT line + finding count.
