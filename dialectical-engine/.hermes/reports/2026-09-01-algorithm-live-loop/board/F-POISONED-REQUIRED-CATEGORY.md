# [claude@opus-5] F-POISONED-REQUIRED-CATEGORY · poisoned() takes a defaulted category; a required one cannot be silently mislabelled

```yaml
state:
  ticket: F-POISONED-REQUIRED-CATEGORY
  risk_tier: low
  status: done # 20:43 2026-09-07 codex r1b APPROVE at 4e5f9327 (one rework round); merged into dev 7ab208f2 (D70)
  owner: { agent: claude, session: dev-health-worker }
  contract: { allowed: [packages/db/src/auth-risk.ts (poisoned() and its call sites at :50, :54, :82 and the two staged catches), tests/unit/p2-auth-risk.test.ts], readonly: [logs/risk-signal-diagnostics/, agent-reports/risk-signal-diagnostics-codex-r1.md], forbidden: all_others, verification: [every poisoned() call names its category explicitly; the default removed; existing tests green; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-dev-health, branch: lane/dev-health, merge_status: merged-into-dev-7ab208f2 }
  authority_epoch: 1
  rework_round: 1
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: risk-signal-diagnostics-r1-2026-09-07
```

**Filed from the risk-signal-diagnostics seat's flag (2026-09-07), cleared by codex r1 as no defect.** The seat gave `poisoned()` a DEFAULT category (`signal-shape`) to stay inside the packet's "nothing else" parenthetical; it states a REQUIRED parameter is the better design (a future call site cannot be silently mislabelled) — a three-token change at three call sites. **Outcome:** the default removed; each call site names its category.
