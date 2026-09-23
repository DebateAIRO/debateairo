# [claude@opus-5] F-T1B-6-integration-drift

```yaml
state:
  ticket: F-T1B-6
  risk_tier: low
  status: done # The owed merge-in WAS W3's round 2: lane/t1 caught up to 3d137d64 (then 7e8f1e51 by the final merge) with conflicts in exactly two files resolved per hunk, the oracle checking the budget half independently. Merged at fd3bf47a
  owner: { agent: claude, session: tbd }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [record only]
    human_review: no
  worktree: { path: n/a, branch: n/a, merge_status: n/a }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t1b-r2-2026-09-03
```

lane/t1 is 23 commits behind integration 58c4715e (T17B, T15). The seat measured the hazard rather than chasing it: apps/runner (1 commit) and packages/budget (5) were touched and NEITHER changed a depth-bearing line. RULED: merge-in owed AFTER review approval, as integration work, not a rework round.
