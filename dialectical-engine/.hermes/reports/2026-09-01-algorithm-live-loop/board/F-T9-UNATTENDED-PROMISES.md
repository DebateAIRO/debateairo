# [claude@opus-5] F-T9-UNATTENDED-PROMISES · the T9 window holds 64 promises unattended for ~22 s (the POL-03 escape class)

```yaml
state:
  ticket: F-T9-UNATTENDED-PROMISES
  risk_tier: low
  status: done # 08:40 2026-09-09 codex r1 APPROVE at ac2ccbb9 (first round, 0 blocking); merged into dev ed804f3c (D70)
  owner: { agent: claude, session: small-trio-worker }
  contract: { allowed: [tests/integration/registration-database.test.ts (the resend window at :6872 and its promise handling only)], readonly: [tests/support/poolFailureChild.ts (the landed pattern)], forbidden: all_others, verification: [every in-flight promise has its handler attached before any await that can make it reject; the window's behaviour unchanged; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-small-trio, branch: lane/small-trio, merge_status: merged-into-dev-ed804f3c }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: flakes-2026-09-08
```

**Filed from the flakes seat's out-of-contract finding (2026-09-08).** `tests/integration/registration-database.test.ts:6872` holds 64 promises unattended for about 22 seconds — the same class as the POL-03 harness defect (a rejection with no handler yet attached kills the process), currently unreachable only because `injectResend` catches everything. **Outcome:** handlers attached before the awaits, as in the landed POL-03 fix; behaviour unchanged.
