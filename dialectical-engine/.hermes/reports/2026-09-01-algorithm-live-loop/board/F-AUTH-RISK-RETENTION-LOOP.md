# [claude@opus-5] F-AUTH-RISK-RETENTION-LOOP · auth-risk.ts validates retentionMs inside the per-signal loop, so a policy defect is labelled signal-shape

```yaml
state:
  ticket: F-AUTH-RISK-RETENTION-LOOP
  risk_tier: low
  status: done # 21:34 2026-09-07 codex r1 APPROVE at a440ec6f; merged into dev 169941c6 (D70)
  owner: { agent: claude, session: diag-tail-worker }
  contract: { allowed: [packages/db/src/auth-risk.ts (the validation at :113 and its category only), tests/unit/p2-auth-risk.test.ts], readonly: [agent-reports/dev-health.md], forbidden: all_others, verification: [a policy-shape defect is validated once, before the loop, under its own bounded category; existing tests green; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-tail, branch: lane/diag-tail, merge_status: merged-into-dev-169941c6 }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: dev-health-2026-09-07
```

**Filed from the dev-health seat's flag (2026-09-07), out of its contract.** `packages/db/src/auth-risk.ts:113` validates `retentionMs` from inside the per-signal loop, so a policy-value defect surfaces as a `signal-shape` poison category — a mislabelled category in the bounded set landed by F-AUTH-RISK-POISONED-CATCH. **Outcome:** validated once, before the loop, under a policy category.
