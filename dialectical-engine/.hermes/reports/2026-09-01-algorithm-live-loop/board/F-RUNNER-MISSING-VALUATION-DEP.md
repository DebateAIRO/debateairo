# [claude@opus-5] F-RUNNER-MISSING-VALUATION-DEP · apps/runner imports @debateai/valuation but its package.json does not declare it

```yaml
state:
  ticket: F-RUNNER-MISSING-VALUATION-DEP
  risk_tier: medium
  status: done # 20:43 2026-09-07 codex r1b APPROVE at 4e5f9327 (one rework round); merged into dev 7ab208f2 (D70)
  owner: { agent: claude, session: dev-health-worker }
  contract: { allowed: [apps/runner/package.json, pnpm-lock.yaml (the resulting lock entry only)], readonly: [agent-reports/diag-bounded.md (the findings), apps/api/src/risk-signal-identity.ts (the pattern)], forbidden: all_others, verification: [the dependency declared; pnpm install --frozen-lockfile succeeds; the runner's typecheck and unit tests identical; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-dev-health, branch: lane/dev-health, merge_status: merged-into-dev-7ab208f2 }
  authority_epoch: 1
  rework_round: 1
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: diag-bounded-2026-09-07
```

**Filed from the diag-bounded seat's out-of-contract findings (2026-09-07).** `apps/runner/src/index.ts:73` imports `@debateai/valuation`, which `apps/runner/package.json` omits — it resolves today only through hoisting. **Outcome:** the dependency declared explicitly; the lockfile updated by the tool, not by hand.
