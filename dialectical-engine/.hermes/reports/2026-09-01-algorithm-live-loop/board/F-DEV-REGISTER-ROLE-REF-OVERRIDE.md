# [claude@opus-5] F-DEV-REGISTER-ROLE-REF-OVERRIDE · a DEV_ code carries an unbounded environment string after a colon

```yaml
state:
  ticket: F-DEV-REGISTER-ROLE-REF-OVERRIDE
  risk_tier: low
  status: done # 08:40 2026-09-09 codex r1 APPROVE at ac2ccbb9 (first round, 0 blocking); merged into dev ed804f3c (D70)
  owner: { agent: claude, session: small-trio-worker }
  contract: { allowed: [apps/runner/src/dev-deployment-register.ts (the throw at :163 only), its unit test], readonly: [apps/runner/src/dev-auth-stack.ts], forbidden: all_others, verification: [the thrown code is a bounded constant; the offending value reported through a bounded category or omitted; existing tests green; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-small-trio, branch: lane/small-trio, merge_status: merged-into-dev-ed804f3c }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: diag-tail-2026-09-07
```

**Split from F-DIAG-DEV-API-CLI (2026-09-07)** after the diag-tail seat found the site readonly in its packet. `apps/runner/src/dev-deployment-register.ts:163` throws `DEV_ALGORITHM_REGISTER_ROLE_REF_UNCONFIGURED:${override}` where `override` is an environment string (`source.DEBATEAI_DEV_*_ROLE_REF`) — an unbounded tail on a DEV_ code (codex diag-class-a r1b: the only truly unbounded one of the three colon forms). **Outcome:** the code is a constant; the value, if reported at all, goes through a bounded category.
