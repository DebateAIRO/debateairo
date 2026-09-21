# [claude@opus-5] F-DIAG-ROLLBACK-COLLAPSE · a failed ROLLBACK and a failed destroyRunKey collapse into one rollbackIncomplete boolean

```yaml
state:
  ticket: F-DIAG-ROLLBACK-COLLAPSE
  risk_tier: medium
  status: done # 17:24 2026-09-07 codex r1c APPROVE at d797d805 (two rework rounds); merged into dev 1fc2dece (D70)
  owner: { agent: claude, session: diag-bounded-worker }
  contract: { allowed: [packages/db/src/index.ts (the catches at :1282 and :1289 and the rollbackIncomplete consumer only), the unit test that covers that path], readonly: [apps/api/src/risk-signal-identity.ts (the landed pattern: explicit map + fixed fallback), agent-reports/risk-signal-diagnostics.md (the class sweep), logs/risk-signal-diagnostics/02-sweep.log], forbidden: all_others, verification: [RED: the two failures are distinguishable in the outcome (a bounded category, not the raw cause); the public classification preserved; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-bounded, branch: lane/diag-bounded, merge_status: merged-into-dev-1fc2dece }
  authority_epoch: 1
  rework_round: 2
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: risk-signal-diagnostics-2026-09-07
```

**Filed from the risk-signal-diagnostics seat's class sweep (2026-09-07), Class B, the closest sibling.** `packages/db/src/index.ts:1282` and `:1289`: a failed `ROLLBACK` and a failed `destroyRunKey` both set one `rollbackIncomplete` boolean — two distinct failures, one indistinguishable outcome, the same defect shape as auth-risk.ts:212 (fixed on lane/risk-signal-diagnostics with a bounded category set). **Outcome:** a bounded internal category per failure, never the raw cause; the outward behaviour unchanged.

**Correction (orchestrator, same day):** the file is `packages/db/src/index.ts`, as the seat's final message says; my first filing named apps/api by mistake (read, not relayed, this time: grep).
