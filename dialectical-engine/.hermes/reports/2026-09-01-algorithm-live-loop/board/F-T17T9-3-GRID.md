# [claude@opus-5] F-T17T9-3-GRID · the 4×5 ceiling grid is pinned as two literal matrices

```yaml
state:
  ticket: F-T17T9-3-GRID
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [tests/unit/t17-envelope.test.ts, tests/unit/dr184-review-resilience.test.ts, a NEW test-data module under tests/support/], readonly: [packages/register/src/index.ts], forbidden: all_others, verification: [both suites green reading one matrix; codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t17t9-3-codex-r1-2026-09-05
```

Filed by codex (t17t9-3 r1, F2). `tests/unit/t17-envelope.test.ts:210` and `tests/unit/dr184-review-resilience.test.ts:109` each carry the full 4×5 expected matrix; both are correct at 5e837ba7 — maintenance debt, not a numerical defect. **Fix (worker):** put the expected matrix in a test-data module used by both; do NOT import one test file from another and do NOT derive the expected data from the production constructor; keep the runner-plan enumeration as the independent check.
