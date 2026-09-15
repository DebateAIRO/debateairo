# PACKET — codex-goalreview r4 (T5) · four elements per spine §4

## 1. Ticket-state block (byte-for-byte mirror of board/T5-codex-goalreview.md)
```
status: ready
owner: { agent: codex, session: codex-exec-resume-last }
risk_tier: high
contract:
  allowed:
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-goalreview-r4.md
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-goalreview-self.md   (append r4 addendum)
  readonly:
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md   (goal-v4-2026-09-01)
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
comments_read_through: goal-v4-2026-09-01
```
Self-report instruction (verbatim, router §3): "treat it like a murder case. I want to
get a nice report on what can be done better. What we must upgrade. what repeatedly
costed us tokens. how we can make the coding more efficient. How can we turn this into a
one prompt machine even better."

## 2. Immediate upstream artifacts + task
The readonly list above. goal-v4 is the FINAL lawful rework round (3 of 3). Verify:
(1) your B1(r3): both review tickets now `risk_tier: high` with the scoring-semantics
    floor cited (spine:1176-1199); this packet mirrors the repaired canonical block —
    rerun your byte-equality check against board/T5-codex-goalreview.md
(2) your B2(r3): T9 now distinguishes synthesizer (initial) from synthesizer (retry) —
    retry carries the prior evaluator objection VERBATIM + prior-candidate reference —
    and the DoD adds the round-2-objection recorded-request assertion
(3) no regression from the opus routed clause also applied in v4: the R9 disposition
    line now retires the protectedCoreVerified guard knowingly, and T9's DoD covers
    every enumerated crash class incl. envelope exhaustion
Verdict rules: APPROVE, or CHANGES — any CHANGES residue routes to the V DECISIONS
PACKET (no round 4 exists). Output: marker line, `# CODEX GOAL REVIEW r4`, `## VERDICT`,
`## FINDINGS` (unresolved/new only). Append an r4 addendum to your self-report.

## 3. Handoff marker
First line: `GOAL REVIEW r4 — codex · APPROVE|CHANGES · comments read through: goal-v4-2026-09-01`

## 4. Stop conditions
The three verifications answered or ~15 minutes. CANNOT-ASSESS over guessing (router
§2.7). Final message = `FILED: <path(s)>` + VERDICT line + unresolved-finding count.
