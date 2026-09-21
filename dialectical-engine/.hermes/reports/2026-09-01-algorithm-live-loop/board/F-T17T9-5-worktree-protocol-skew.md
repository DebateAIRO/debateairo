# [claude@opus-5] F-T17T9-5 · a lane worktree's protocol copy predates the main checkout's — the seat obeyed the newer

```yaml
state:
  ticket: F-T17T9-5
  risk_tier: low             # process; the seat detected the skew and applied the superset
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [orchestrator record check], human_review: no }
  worktree: { path: tbd, branch: tbd, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t17t9-r1-2026-09-05
```

The heartbeat protocol files under `.claude/skills/` in lane-t17t9 (provisioned from `7dda3cc0`,
ff'd to `d08ee928`) predate the main checkout's §2.2 / §3b wording. The seat noticed and obeyed
the newer superset. Orchestrator §5 "version discipline" says a dispatch does not go out when the
rule set is newer than the repo spine — the spine here is the lane's tree, and the main checkout's
protocol edits are uncommitted mission artifacts. Fix: either commit the protocol edits to the
mission branch so lanes inherit them, or state in every packet that the main checkout's
`.claude/skills/` governs. Until then each seat has to discover the skew itself.
