# [unassigned] F-T12-3-IN-HANDLER-THROW-TRANSPORT-DEATH · a double that throws in-handler presents as TRANSPORT_DEATH

```yaml
state:
  ticket: F-T12-3-IN-HANDLER-THROW-TRANSPORT-DEATH
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T12)'s F-T12-3 (SDD ledger :116). Found, not caused.

When a test double throws INSIDE its handler, the failure reaches the runner indistinguishable from a
dead transport. **The consequence is about evidence, not about production:** a seat debugging a red row
is told the transport died when in fact its own fixture threw, and the natural next move — investigating
transport — is wasted work. This continuation has a matching entry in `TOOLING-TRAPS.md` for the same
reason.

**Charge:** make the two distinguishable at the boundary — an in-handler throw is a FIXTURE fault and
should say so. STRENGTH: entailed.
