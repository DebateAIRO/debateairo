# [claude@opus-5] F-DIAG-DEV-AUTH-STACK · the development auth stack forwards a DEV_-shaped message verbatim

```yaml
state:
  ticket: F-DIAG-DEV-AUTH-STACK
  risk_tier: low
  status: done # 19:26 2026-09-07 codex r1c APPROVE at 12e054d9 (two rework rounds); merged into dev 80559019 (D70)
  owner: { agent: claude, session: diag-class-a-worker }
  contract: { allowed: [apps/runner/src/dev-auth-stack.ts (developmentAuthStackErrorCode :83), its unit test], readonly: [apps/api/src/risk-signal-identity.ts (the landed pattern: explicit map + fixed fallback), agent-reports/risk-signal-diagnostics.md (the class sweep), logs/risk-signal-diagnostics/02-sweep.log], forbidden: all_others, verification: [the forwarded value is a known constant from an explicit set, else a fixed fallback; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-class-a, branch: lane/diag-class-a, merge_status: merged-into-dev-80559019 }
  authority_epoch: 1
  rework_round: 2
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: risk-signal-diagnostics-2026-09-07
```

**Filed from the risk-signal-diagnostics seat's class sweep (2026-09-07), Class A member 4.** `apps/runner/src/dev-auth-stack.ts:83` `developmentAuthStackErrorCode` forwards `current.message` when it matches `^DEV_[A-Z0-9_]+$`, on a development-only stack. Narrow shape, lowest exposure; same species. **Outcome:** an explicit set, not a shape rule.
