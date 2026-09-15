# PACKET — codex-goalreview r3 (T5) · four elements per spine §4

## 1. Ticket-state block (byte-for-byte mirror of board/T5-codex-goalreview.md)
```
status: ready
owner: { agent: codex, session: codex-exec-resume-last }
risk_tier: medium
contract:
  allowed:
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-goalreview-r3.md
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-goalreview-self.md   (append r3 addendum)
  readonly:
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md   (goal-v3-2026-09-01)
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/DECISIONS.md
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/judge-adjudication.md
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/opus-goalreview.md
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/opus-goalreview-r2.md
    - own prior reviews + own worktree (pinned dev@1c9578a)
  forbidden: all_others
  verification: [orchestrator consumes; V accepts]
  human_review: yes
worktree: { path: .worktrees/algo-lens-codex, branch: algo-lens-codex, merge_status: none }
authority_epoch: 1
rework_round: 1
wakes_since_transition: 0
waiting_since: n/a
escalation_target: v_packet
self_unblock_enabled: false
comments_read_through: goal-v3-2026-09-01
```
Self-report instruction (verbatim, router §3): "treat it like a murder case. I want to
get a nice report on what can be done better. What we must upgrade. what repeatedly
costed us tokens. how we can make the coding more efficient. How can we turn this into a
one prompt machine even better."

## 2. Immediate upstream artifacts + task
The readonly list above. goal-v3 applied seven edits; verify the four that answer YOUR
r2 items and their cross-seat merges:
(1) T0 pins the ceremony command `./node_modules/.bin/tsx acceptance/run-acceptance.ts
    --service-credential <43-char>` + names main.ts a server bootstrap [your B1]
(2) T11 step-0 ABSENT arm defines the mono/degraded projection + extended property test
    [your B2, opus B1(r2)]
(3) T9 per-role recorded request schemas; fresh-context = no transcript/history beyond
    named artifacts [your B3]
(4) canonical T5 ticket regenerated: legal risk_tier medium + reason, r3 deliverables in
    allowed, this packet mirrors it byte-for-byte, verbatim §3 instruction [your N1]
Also in v3 (opus items — flag only if a fix regressed something you own): T9 crash set
gains envelope exhaustion; T17 self-contained assertion; T6 second-consumer note;
confirm-items 6–7; Non-goals claim-frame line.
New findings ONLY for regressions v3 introduces. Output: marker line,
`# CODEX GOAL REVIEW r3`, `## VERDICT` (APPROVE or CHANGES), `## FINDINGS`
(unresolved/new only). Append an r3 addendum to your self-report if this round changed
your case file.

## 3. Handoff marker
First line: `GOAL REVIEW r3 — codex · APPROVE|CHANGES · comments read through: goal-v3-2026-09-01`

## 4. Stop conditions
The four verifications answered or ~20 minutes. CANNOT-ASSESS over guessing (router
§2.7). Final message = `FILED: <path(s)>` + VERDICT line + unresolved-finding count.
