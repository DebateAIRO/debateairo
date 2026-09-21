# PACKET — codex-goalreview r2 (T5) · four elements per spine §4

## 1. Ticket-state block (verbatim; authoritative copy updated in board/T5-codex-goalreview.md)
```
status: ready
owner: { agent: codex, session: codex-exec-resume-last }
risk_tier: standard        # set by orchestrator under recorded deviation D1 (no Hermes/cockpit this mission)
contract:
  allowed:
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-goalreview-r2.md
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-goalreview-self.md   (self-report)
  readonly:
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md   (now version goal-v2-2026-09-01)
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/DECISIONS.md
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/judge-adjudication.md
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/opus-goalreview.md
    - your own r1 review + your worktree (pinned dev@1c9578a)
  forbidden: all_others
  verification: [orchestrator consumes; V accepts]
  human_review: yes
worktree: { path: .worktrees/algo-lens-codex, branch: algo-lens-codex, merge_status: none }
authority_epoch: 1
rework_round: 1            # carried from F1 (orchestrator-charged); the DRAFT is on its rework round 1 (charged to drafter)
wakes_since_transition: 0
waiting_since: n/a
escalation_target: v_packet
self_unblock_enabled: false
comments_read_through: goal-v2-2026-09-01
```

## 2. Immediate upstream artifacts
The readonly list above, verbatim. Task: verify goal-v2 resolves each of YOUR r1 findings
(B1–B14, N1–N4, MISSING-1) as dispositioned in judge-adjudication.md round 3; flag any
fix that is wrong, partial, or regressed something else. New findings only if introduced
by v2. Output skeleton: marker line, `# CODEX GOAL REVIEW r2`, `## VERDICT` (APPROVE or
CHANGES), `## FINDINGS` (only unresolved/new; same field format as r1). Then file the
self-report (router §3 murder-case questions, covering BOTH your audit seat and this
review seat) at the self-report path before your final message.

## 3. Handoff marker
First line of the r2 report: `GOAL REVIEW r2 — codex · APPROVE|CHANGES · comments read through: goal-v2-2026-09-01`

## 4. Stop conditions
All r1 findings dispositioned or ~40 minutes. CANNOT-ASSESS over guessing (router §2.7).
Final message = `FILED: <both paths>` + VERDICT line + unresolved-finding count.
