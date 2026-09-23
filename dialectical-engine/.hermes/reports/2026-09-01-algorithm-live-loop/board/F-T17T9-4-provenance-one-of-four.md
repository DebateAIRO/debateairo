# [claude@opus-5] F-T17T9-4 · the acceptance runtime checks provenance on 1 of FIVE T16 families (corrected by codex t17t9 r1: envelopeFormulaInputs is the fifth and also exposes sourceRefs); dev checks all

```yaml
state:
  ticket: F-T17T9-4
  risk_tier: low             # same shape as the class just closed, different axis; nothing fails today
  status: done # CLOSED in t17t9 rework 1 at 9818b56c: all five T16 families resolved and provenance-checked in one place; RED showed four families accepting a foreign row; GREEN 12/12 x3. Lands with F-T17-T9's merge
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review], human_review: no }
  worktree: { path: tbd, branch: tbd, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t17t9-r1-2026-09-05
```

Named, not fixed, by lane/t17t9. `dev-runner-policy.ts` checks every sealed algorithm family's
`sourceRef` against the deployment's ref; `acceptance/runtime-policy.ts` now checks the
synthesis-role family (this lane's addition) and none of the other three. A foreign-deployment row
in those families would be accepted on the acceptance path and refused on dev. Fix: the same
`sourceRefs` check over all four, mirroring dev.
