# T2 — codex-audit · HTML claim-audit lens
Repaired 2026-09-01 after the seat's packet-review finding (see F1). Typed state:

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
rework_round: 1        # consumed by orchestrator packet defect (F1), not seat work
wakes_since_transition: 0
waiting_since: n/a
escalation_target: v_packet
self_unblock_enabled: false
comments_read_through: packet-v2-2026-09-01
```

## History (orchestrator-mirrored markers)
- 2026-08-31 READY (ticket typed, packet v1 written)
- 2026-08-31 DISPATCHED (codex exec pid 51582, log verified alive at 10s, effort high)
- 2026-08-31 seat filed packet-review refusal: packet v1 exceeded spine §4 four-element
  cap, lacked typed state block, marker, cursor → status changes_requested (on the
  packet), finding F1 opened, all 26 claims CANNOT-ASSESS (correct behavior)
- 2026-09-01 packet v2 (four elements) + this typed state written → status ready,
  rework_round 1; resuming same codex session, conversation-mode
- 2026-09-01 READY FOR PEER REVIEW r1 (marker verified in findings first line)
- 2026-09-01 judge adjudication round 1 filed (C1 re-graded PARTLY on two-UI evidence; no rework round charged)
