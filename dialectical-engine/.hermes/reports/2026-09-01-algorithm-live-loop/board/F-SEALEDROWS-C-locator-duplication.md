# [claude@opus-5] F-SEALEDROWS-C · the conformance locator is duplicated three ways with no shared home

```yaml
state:
  ticket: F-SEALEDROWS-C
  risk_tier: medium          # divergence is caught by a test, not prevented by structure
  status: done # CLOSED STRUCTURALLY and merged at d08ee928 — one exported definition, no locator to duplicate
  owner: { agent: claude, session: tbd }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [codex static review]
    human_review: no
  worktree: { path: tbd, branch: tbd, merge_status: merged@d08ee928 }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sealedrows-r2-2026-09-04
```

Filed by the lane/sealedrows seat while landing F-SEALEDROWS-A. The repaired locator lives in
three places — both seeders and the acceptance test — because the only sensible shared home needs
`packages/register/src/index.ts`, whose barrel re-exports by explicit name and was outside the
lane's contract.

The seat mitigated it deliberately: the test re-derives the value through a **different** locator,
so the two cannot go stale in lockstep. That is exactly how the retired version failed — the test
searched the same wording as the seeder, so both stopped matching together and neither noticed.

**Divergence is now caught by a test rather than prevented by structure.** That is a real
improvement over what shipped and still weaker than one definition. Worth closing when a lane
holds the register barrel.
