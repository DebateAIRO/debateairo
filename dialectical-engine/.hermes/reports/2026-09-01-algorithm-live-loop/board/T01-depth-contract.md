# [claude@opus-5] T1 · depth enforced at the contract door (S1-1)

```yaml
state:
  ticket: T1
  risk_tier: medium          # API contract validation; not on the immutable floor
  status: done # LANDED with W3's merge at fd3bf47a: the T1 lane (d4a3eae9) caught up to integration by W3's round-2 merge (38f995e1), its single-source oracle in-tree byte-identical and GREEN 46/46 on the merged tree. Three T1 review rounds honoured; the literal that held it was removed by derivation, not by narrowing the rule (V-T1B3-1 option a)
  owner: { agent: claude, session: opus-t01-w1 }
  contract:
    allowed:
      - the lane worktree /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1 (branch lane/t1; local commits, never push)
      - .hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t01-depth.md
      - .hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t01-depth-self.md
      - .hermes/reports/2026-09-01-algorithm-live-loop/logs/t01/**
    readonly:
      - slices/S02-hygiene/SPEC.md (frozen; T1 = goal lines 97-106)
      - agent-reports/t00-baseline.md (pre-existing failures)
    forbidden: all_others (T2's web/ surface belongs to T2; T16-owned surfaces are not yours)
    verification: [codex static review, judge verdict + suite re-run]
    human_review: no
  worktree: { path: .worktrees/lane-t1, branch: lane/t1, merge_status: merged@fd3bf47a }
  authority_epoch: 1
  rework_round: 3
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: packet-t01-2026-09-01
```
