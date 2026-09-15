# PACKET — opus-goalreview r2 (T4) · four elements per spine §4

## 1. Ticket-state block (verbatim; authoritative copy updated in board/T4-opus-goalreview.md)
```
status: ready
owner: { agent: claude, session: opus-blind-agent-resumed }
risk_tier: standard        # set by orchestrator under recorded deviation D1 (no Hermes/cockpit this mission)
contract:
  allowed:
    - <own worktree>/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/opus-goalreview-r2.md
    - <own worktree>/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/opus-goalreview-self.md   (self-report)
  readonly:
    - .hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md   (now version goal-v2-2026-09-01)
    - .hermes/reports/2026-08-31-algorithm-correctness/DECISIONS.md
    - .hermes/reports/2026-08-31-algorithm-correctness/agent-reports/judge-adjudication.md   (read-set lift EXTENDED to this)
    - .hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-audit-findings.md (and this)
    - .hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-goalreview.md     (and this)
    - your own r1 review + your worktree (pinned dev@1c9578a)
  forbidden: all_others (board/inputs/*.html stays out)
  verification: [orchestrator consumes; V accepts]
  human_review: yes
worktree: { path: .worktrees/algo-lens-opus, branch: algo-lens-opus, merge_status: none }
authority_epoch: 1
rework_round: 0            # seat work never returned; the DRAFT is on its rework round 1 (charged to drafter)
wakes_since_transition: 0
waiting_since: n/a
escalation_target: v_packet
self_unblock_enabled: false
comments_read_through: goal-v2-2026-09-01
```

## 2. Immediate upstream artifacts
The readonly list above, verbatim. Task: verify goal-v2 resolves each of YOUR r1 findings
(B1–B5, N1–N12, M1–M3) as dispositioned in judge-adjudication.md rounds 2–3; flag any fix
that is wrong, partial, or regressed something else; your prior CANNOT-ASSESS N12a is now
answerable (adjudication + codex audit in your read set) — answer it. New findings only
if introduced by v2. Output skeleton: marker line, `# OPUS GOAL REVIEW r2`, `## VERDICT`
(APPROVE or CHANGES), `## FINDINGS` (only unresolved/new; same field format as r1),
`## N12a RESOLUTION`. Then file the self-report (router §3 murder-case questions, for
your T4 seat) at the self-report path before your final message.

## 3. Handoff marker
First line of the r2 report: `GOAL REVIEW r2 — opus · APPROVE|CHANGES · comments read through: goal-v2-2026-09-01`

## 4. Stop conditions
All r1 findings dispositioned or ~40 minutes. CANNOT-ASSESS over guessing (router §2.7).
Final message = `FILED: <both paths>` + VERDICT line + unresolved-finding count.
