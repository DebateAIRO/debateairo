# [claude@opus-5] F-KERNEL-TYPED-CODE-STRING · TypedDomainError.code is typed as string, so 'bounded by its type' is a convention, not a guarantee

```yaml
state:
  ticket: F-KERNEL-TYPED-CODE-STRING
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [packages/kernel/src/index.ts (the TypedDomainError code type at :388 and its constructor only), the call sites that build a code from a variable (name each), their tests], readonly: [agent-reports/diag-bounded.md (the findings), apps/api/src/risk-signal-identity.ts (the pattern)], forbidden: all_others, verification: [the code type is a closed union or a branded literal type; every non-literal call site is either converted or proven literal-sourced; typecheck identical elsewhere; codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: diag-bounded-2026-09-07
```

**Filed from the diag-bounded seat's out-of-contract findings (2026-09-07).** `packages/kernel/src/index.ts:388` types `TypedDomainError.code` as `string`; the diag-bounded packet's premise "already bounded by its type" was therefore false (orchestrator's fact error; bounded by convention only). The seat traced all 10 of 437 call sites that build a code from a variable to literal sources today. **Outcome:** the type itself closes the alphabet (a union or a branded literal type) so a future variable-built code cannot pass silently.

**Codex diag-bounded r1 (16:22 2026-09-07) confirms:** the open `string` type made the typed-code passthrough a live escape in both operational formatters (F1, P2); the lane closes the branch locally this round; this ticket closes the TYPE so the convention becomes a guarantee.
