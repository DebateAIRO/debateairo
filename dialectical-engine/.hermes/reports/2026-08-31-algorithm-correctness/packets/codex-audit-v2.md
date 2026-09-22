# PACKET v2 — codex-audit (T2) · four elements per spine §4

## 1. Ticket-state block
See and treat as authoritative the typed state in your ticket file (readonly copy below,
verbatim from board/T2-codex-audit.md as of 2026-09-01):
```
status: ready
owner: { agent: codex, session: codex-exec-2026-08-31-resume-last }
contract:
  allowed:
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-audit-findings.md
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-audit.md
    - scratch inside /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/algo-lens-codex/
  readonly:
    - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/algo-lens-codex/dialectical-engine (whole tree)
    - .hermes/reports/2026-08-31-algorithm-correctness/board/inputs/claim-audit-spec.md
    - .hermes/reports/2026-08-31-algorithm-correctness/board/inputs/show-me-debate-algorithm.html
    - .hermes/reports/2026-08-31-algorithm-correctness/packets/codex-audit-v2.md
  forbidden: all_others
  verification: [judge adjudication vs opus-blind lens + judge's own core-path read]
  human_review: no
worktree: { path: .worktrees/algo-lens-codex, branch: algo-lens-codex, merge_status: none }
authority_epoch: 1
rework_round: 1
wakes_since_transition: 0
waiting_since: n/a
escalation_target: v_packet
self_unblock_enabled: false
comments_read_through: packet-v2-2026-09-01
```

## 2. Immediate upstream artifacts
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/board/inputs/claim-audit-spec.md  (the work specification: claims C1–C26, verdict vocabulary, deliverable skeleton, report paths)
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/board/inputs/show-me-debate-algorithm.html  (document under audit)
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/algo-lens-codex/dialectical-engine  (audit target tree, pinned dev@1c9578a)

## 3. Handoff marker
On completion, first line of codex-audit-findings.md:
`READY FOR PEER REVIEW — codex-audit r1 · comments read through: packet-v2-2026-09-01`

## 4. Stop conditions
- All 26 claims verdicted per the spec's skeleton, or ~90 minutes of work — whichever first.
- CANNOT-ASSESS with a named blocker beats a guessed verdict (router §2.7).
- If genuinely unable to proceed: first line of findings = the specific `waiting_*` status
  (spine status vocabulary, never bare "blocked") + reason; then stop.
- Self-report (router §3) filed before the marker line is set.
