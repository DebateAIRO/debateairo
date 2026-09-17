# [claude@opus-5] F-DIAG-ERASURE-CAUSE-LOSS · account erasure discards three causes behind typed outcomes; one local validation cause replaced

```yaml
state:
  ticket: F-DIAG-ERASURE-CAUSE-LOSS
  risk_tier: low
  status: done # 08:40 2026-09-09 codex r1 APPROVE at ac2ccbb9 (first round, 0 blocking); merged into dev ed804f3c (D70)
  owner: { agent: claude, session: small-trio-worker }
  contract: { allowed: [packages/db/src/account-erasure.ts (the catches at :746, :761, :966 only), packages/db/src/index.ts (:1095 only), their unit tests], readonly: [apps/api/src/risk-signal-identity.ts (the landed pattern: explicit map + fixed fallback), agent-reports/risk-signal-diagnostics.md (the class sweep), logs/risk-signal-diagnostics/02-sweep.log], forbidden: all_others, verification: [each discarded cause is preserved as a bounded internal category beside the typed outcome; public outcomes unchanged; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-small-trio, branch: lane/small-trio, merge_status: merged-into-dev-ed804f3c }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: risk-signal-diagnostics-2026-09-07
```

**Filed from the risk-signal-diagnostics seat's class sweep (2026-09-07), Class B lower tiers.** `packages/db/src/account-erasure.ts:746`, `:761`, `:966` each discard the cause but map to a typed, enumerated per-item outcome (`INVALID_EVIDENCE`), so no two public classifications are conflated — diagnostic loss only. `packages/db/src/index.ts:1095` replaces a local validation throw with `TypedDomainError("RUN_LEGACY_ASKER_INVALID")` — the discarded cause is the module's own; lowest tier. **Outcome:** bounded internal categories beside the typed outcomes; nothing raw forwarded.

**Correction (orchestrator, same day):** `:1095` is in `packages/db/src/index.ts` (grep), not apps/api.

**Correction (04:14 2026-09-08, by grep):** the file is `packages/db/src/account-erasure.ts` (972 lines; catches at :746, :761, :966), not apps/api (which has a 200-line file of the same name). Self-charge #53: the seat's table said only `account-erasure.ts`; I resolved the package by assumption.
