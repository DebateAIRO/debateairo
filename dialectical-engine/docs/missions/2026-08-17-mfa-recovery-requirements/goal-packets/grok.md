# GOAL PACKET — Grok 4.6 seat (REQUIREMENTS research)

```yaml
state:
  ticket: REQ-MFA-GROK
  mission: 2026-08-17-mfa-recovery-requirements
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: grok-4.6, session: <record yours at claim> }
  loop: requirements
  seat_shape: parallel-blind
  contract:
    allowed:
      - docs/missions/2026-08-17-mfa-recovery-requirements/research/grok-requirements.md
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

## Your job

Read `docs/missions/2026-08-17-mfa-recovery-requirements/brief.md` and answer it
in full. Write your artifact to **exactly**:

```
docs/missions/2026-08-17-mfa-recovery-requirements/research/grok-requirements.md
```

You are one of four seats answering this brief **independently and blind**. Do not
look for, read, or wait on any other seat's output. Your independent judgement is
the product — where you disagree with what you imagine the others would say, say
so plainly and explain why.

**Play to your strength:** you have live search. Be the seat that establishes
**current, checkable ground truth** — which messaging-app OTP products actually
exist in 2026 and which do not (RQ-B1), real country availability and blocks
(RQ-B2), real per-message and per-verification pricing (RQ-B4, RQ-C4), and what
large platforms currently do for account recovery. Where a product V named has no
such API, say so bluntly rather than filling the table.

## Upstream artifacts (read-only)

- `docs/missions/2026-08-17-mfa-recovery-requirements/brief.md` — the full brief
- `docs/missions/2026-08-17-mfa-recovery-requirements/00-intake-H0.md` — V's
  rulings, classification, banked constraints
- `docs/missions/2026-08-17-accounts-privacy-security/wave-1-current-state.md` —
  the established "no auth today" baseline; do not rediscover it

## Handoff marker

When your artifact is complete, emit exactly:

```
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-17-mfa-recovery-requirements / H0-REQUIREMENTS
- owner CLI session:
- artifact path: docs/missions/2026-08-17-mfa-recovery-requirements/research/grok-requirements.md
- upstream artifacts used:
- checks/evidence:
- assumptions/risks:
- comments read through: not ticketed
```

Then stop. Do not proceed to architecture or implementation.

## Stop conditions

- Writing code, schemas, migrations, or configuration → stop, you are out of scope.
- Any offensive/pen-testing activity → stop. V's posture is defensive-only.
- A product decision only V can make → record it under RQ-E5, do **not** contact V.
- Cannot verify a claim → mark `UNVERIFIED` and continue. Never fabricate a
  citation, price, or API behaviour.

Return control at the handoff marker, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal/session alive and resumable. Silence is normal;
unchanged state needs no message. Termination requires the handoff above.
