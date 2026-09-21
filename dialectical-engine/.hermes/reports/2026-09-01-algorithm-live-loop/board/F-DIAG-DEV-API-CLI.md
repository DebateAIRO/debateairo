# [claude@opus-5] F-DIAG-DEV-API-CLI · the dev API environment CLI prints a DEV-shaped TypeError message directly

```yaml
state:
  ticket: F-DIAG-DEV-API-CLI
  risk_tier: low
  status: done # 21:34 2026-09-07 codex r1 APPROVE at a440ec6f; merged into dev 169941c6 (D70)
  owner: { agent: claude, session: diag-tail-worker }
  contract: { allowed: [apps/runner/src/dev-api-environment-cli.ts (:13–16 only), its test], readonly: [logs/diag-class-a/codex-r1-verdict.final-snapshot.md], forbidden: all_others, verification: [the printed line is drawn from the explicit DEV_ code set landed in dev-auth-stack or a fixed fallback; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-tail, branch: lane/diag-tail, merge_status: merged-into-dev-169941c6 }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: diag-class-a-r1-2026-09-07
```

**Filed from codex diag-class-a r1 P3 (2026-09-07).** `apps/runner/src/dev-api-environment-cli.ts:13–16` uses a DEV-shaped TypeError message directly as `console.error` text — a sibling of the Class-A formatters the packet called "the last three". **Outcome:** the same bounded treatment as F-DIAG-DEV-AUTH-STACK.

**From the diag-class-a rework (18:38 2026-09-07):** three further free-tail DEV messages (an unbounded value after a colon) at `apps/runner/src/dev-deployment-register.ts:163` and `:189` and `deploy/dev-auth/validate-compose-postgres.mjs:8` belong with this ticket — the same class as the CLI site.

**Correction (18:54 2026-09-07, from codex diag-class-a r1b F2 remainder):** of the three sites noted above, only `apps/runner/src/dev-deployment-register.ts:163` (`override`, an environment string) is unbounded; `:189` (`label`, private helper with two literal callers) and `deploy/dev-auth/validate-compose-postgres.mjs:8` (`service`, called only with `postgres`/`hatchet-lite`) are BOUNDED and are excluded only because their colon form is outside the joiner's grammar. This ticket covers the CLI site and `:163`; the other two need nothing.

**Scope correction (21:20 2026-09-07):** the `:163` site named in the earlier correction is split off as F-DEV-REGISTER-ROLE-REF-OVERRIDE (it was readonly in the diag-tail packet); this ticket is the CLI site only and closes with lane/diag-tail.
