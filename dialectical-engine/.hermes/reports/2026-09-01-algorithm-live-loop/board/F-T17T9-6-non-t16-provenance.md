# [claude@opus-5] F-T17T9-6 · two non-T16 register rows are read on the acceptance path with no provenance check

```yaml
state:
  ticket: F-T17T9-6
  risk_tier: medium          # a foreign deployment's composition map or scoring operator would be consumed on acceptance; predates the lane
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review], human_review: no }
  worktree: { path: tbd, branch: tbd, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t17t9-codex-r2-2026-09-05
```

Codex t17t9 r2 F1 (gpt-6-astra). The lane closed provenance on all five T16 families ("5 of 5" is
correct). Two rows are NOT T16 families and are read on the acceptance path with only a
non-emptiness check on their `sourceRef`: `claimTypeCompositionMap` (reader at
`acceptance/runtime-policy.ts:226`) and `scoringOperator` (`:282`). A valid row at the acceptance
version carrying another deployment's non-empty provenance is returned and consumed. Predates the
lane; dev checks these against its own refs.

**Fix (scoped, separate):** compare against `ACCEPTANCE_COMPOSITION_MAP_SOURCE_REF` and
`ACCEPTANCE_SCORING_OPERATOR_SOURCE_REF`, with a foreign-row refusal case and an own-row acceptance
case for each. **Do not** apply the T16 prefix to these differently stamped rows — codex's explicit
caution.
