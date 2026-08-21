# GOAL PACKET — Opus seat (REQUIREMENTS research)

```yaml
state:
  ticket: REQ-MFA-OPUS
  mission: 2026-08-17-mfa-recovery-requirements
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: claude-opus, session: SDK subagent }
  loop: requirements
  seat_shape: parallel-blind
  transport: sdk-subagent   # compaction checkpoints N/A (spine: PTY transports only)
  contract:
    allowed:
      - docs/missions/2026-08-17-mfa-recovery-requirements/research/opus-requirements.md
    readonly:
      - docs/missions/2026-08-17-mfa-recovery-requirements/brief.md
      - docs/missions/2026-08-17-mfa-recovery-requirements/00-intake-H0.md
      - docs/missions/2026-08-17-accounts-privacy-security/**
    forbidden: all_others
    verification:
      - every RQ id in the brief (A1-A5, B1-B5, C1-C7, D1-D6, E1-E5) is answered
      - every factual claim carries a checkable citation or is marked UNVERIFIED
      - every recommendation carries a confidence level and its strongest counter-argument
    human_review: yes
```

Artifact path:
`docs/missions/2026-08-17-mfa-recovery-requirements/research/opus-requirements.md`

**Seat strength:** synthesis-resistant independent judgement. This seat is the one
most likely to be asked to reconcile later, so its blind pass must be genuinely
its own — strong on the systems-level threat modelling (RQ-C3, RQ-D3, RQ-D4), the
recovery-tiering design (RQ-C4), and the honest verdict on secret questions
(RQ-C5).

Dispatched as an SDK subagent by Claude-Router. Handoff marker:
`READY FOR HERMES STAGE REVIEW`. Stop conditions per the shared brief.
