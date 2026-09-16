# [unassigned] F-W6-ENV-SHAPE-AUDIT · the environment-leak sweep is one literal, so the class can be re-entered

```yaml
state:
  ticket: F-W6-ENV-SHAPE-AUDIT
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from FIX(CONT-T16) round 1 (SDD ledger :138;
`task-16-report.md` §"Fix round 1", `:625`). **`high` because the class it guards is the credential leak
W6 closed.**

W6 is closed and the proof is real: `grep -rn 'environment: process.env' acceptance` returns **0 hits**,
re-measured by the orchestrator at the tip. **But the guard IS that grep** — a member written
`env: process.env`, or `{...process.env}`, passes it untouched. The class is closed against the spelling
that caused the incident, not against the shape.

**This is the same weakness, one layer up, that the credential fix itself was designed to avoid:** the
credential-shape rule was deliberately written as a PATTERN stated identically in all six members, because
*a list in six places is how the leak survived*. The sweep that polices the members is still a list of
one.

**Charge:** a standing audit over the SHAPE — any serialisation of `process.env` (whole or spread) into
emitted content — rather than over one literal. Candidate home: the source audit, beside the purity rules
(`F-T6-AUDIT-RULE-GAPS`, `F-W10-D-PURITY-REGEX`).

**Recorded with it, so it is not mistaken for a stronger claim than it is:** the credential digest is a
**64-bit truncated** sha256 — identity against a known sentinel, not preimage resistance (D73 ADDENDUM 2).
STRENGTH: entailed.
