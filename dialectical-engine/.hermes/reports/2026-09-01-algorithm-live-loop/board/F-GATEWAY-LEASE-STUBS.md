# [claude@opus-5] F-GATEWAY-LEASE-STUBS · three inherited fake gateway clients predate the advisory-lock lease

```yaml
state:
  ticket: F-GATEWAY-LEASE-STUBS
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [tests/unit/pro01-runner-tree.test.ts, tests/unit/xrev01-node-review.test.ts, tests/integration/obs-l3-s06-runner-binding.test.ts (lease stub only), the fake-client support they share], readonly: [apps/runner (the gateway's lease contract), apps/api], forbidden: all_others, verification: [the three envelope-exhaustion cases reach RUN_COST_ENVELOPE_EXHAUSTED without a provider call; the production lease is not bypassed; codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t17t9-3-codex-r1-2026-09-05
```

Filed by codex (t17t9-3 r1, F3). `pro01-runner-tree.test.ts:225`, `xrev01-node-review.test.ts:126` and the S06 runner-binding test invoke the real gateway with fake clients that predate its advisory-lock lease: the `SELECT pg_try_advisory_lock(...)` query throws `UNEXPECTED_CLIENT_QUERY` before the expected envelope refusal. All three fail identically in the parent (W5 round 3) — inherited from dev/integration, not caused by any lane this week. **Fix (worker):** bring the fake clients up to the gateway's lease contract; verify the intended refusal is reached with no provider call; do not bypass the production lease. B2's receipt correction in the S06 file stays in lane/t17t9-3.
