# PACKET — opus-goalreview r3 (T4) · four elements per spine §4

## 1. Ticket-state block (byte-for-byte mirror of board/T4-opus-goalreview.md)
```
status: ready
owner: { agent: claude, session: opus-blind-agent-resumed }
risk_tier: medium
contract:
  allowed:
    - <own worktree>/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/opus-goalreview-r3.md
    - <own worktree>/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/opus-goalreview-self.md   (append r3 addendum)
  readonly:
    - .hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md   (goal-v3-2026-09-01)
    - .hermes/reports/2026-08-31-algorithm-correctness/DECISIONS.md
    - .hermes/reports/2026-08-31-algorithm-correctness/agent-reports/judge-adjudication.md
    - .hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-goalreview.md
    - .hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-goalreview-r2.md
    - own prior reviews + own worktree (pinned dev@1c9578a)
  forbidden: all_others (board/inputs/*.html stays out)
  verification: [orchestrator consumes; V accepts]
  human_review: yes
worktree: { path: .worktrees/algo-lens-opus, branch: algo-lens-opus, merge_status: none }
authority_epoch: 1
rework_round: 0
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
(1) T11 step-0 ABSENT arm + extended property test + mono acceptance assertion
    [your B1(r2), codex B2(r2)]
(2) T9 enumerated crash set gains envelope exhaustion + T17 cross-ref [your N1(r2)]
(3) T17 ledger assertion self-contained; delegation dropped [your N2(r2)]
(4) confirm-items 6 & 7 + Non-goals claim-frame line [your N12a(3) disposition]
Also in v3 (codex items — flag only if a fix regressed something you own):
T0 ceremony command correction; T9 per-role request schemas; T6 second-consumer note.
New findings ONLY for regressions v3 introduces. Output: marker line,
`# OPUS GOAL REVIEW r3`, `## VERDICT` (APPROVE or CHANGES), `## FINDINGS` (unresolved/new
only). Append an r3 addendum line to your existing self-report if this round changed
your case file.

## 3. Handoff marker
First line: `GOAL REVIEW r3 — opus · APPROVE|CHANGES · comments read through: goal-v3-2026-09-01`

## 4. Stop conditions
The four verifications answered or ~20 minutes. CANNOT-ASSESS over guessing (router
§2.7). Final message = `FILED: <path(s)>` + VERDICT line + unresolved-finding count.
