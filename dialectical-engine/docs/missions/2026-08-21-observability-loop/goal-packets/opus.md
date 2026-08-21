# GOAL PACKET — Claude Opus seat (REQUIREMENTS research, seat 1 of 3)

```yaml
state:
  ticket: REQ-OBS-OPUS
  mission: 2026-08-21-observability-loop
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: claude-opus, session: SDK-subagent }
  loop: requirements
  seat_shape: parallel-blind
  contract:
    allowed:
      - docs/missions/2026-08-21-observability-loop/research/opus-requirements.md
      - .hermes/reports/2026-08-21-observability-loop/agent-reports/opus.md
    readonly:
      - docs/missions/2026-08-21-observability-loop/brief.md
      - docs/missions/2026-08-21-observability-loop/00-intake-H0.md
      - apps/**, packages/**, migrations/**, docs/**, tests/**, acceptance/**, web/**, tools/**
    forbidden: all_others (explicitly: every other file under research/, all writes outside allowed)
    verification:
      - every RQ id in the brief (A1-A5, B1-B6, C1-C4, D1-D7, E1-E6) answered in order
      - every repo claim cites path:line; unverifiable claims marked UNVERIFIED
      - every recommendation carries confidence + strongest counter-argument
      - self-report filed before handoff
    human_review: yes
```

## Your job

Read `docs/missions/2026-08-21-observability-loop/brief.md` in full and answer
it in full. Write your artifact to **exactly**:

```
docs/missions/2026-08-21-observability-loop/research/opus-requirements.md
```

You are one of three seats answering this brief **independently and blind**.
Do not look for, read, or wait on any other seat's output; ignore other files
in `research/`. Your independent judgement is the product.

**Play to your strength:** you are the deep code reader. Be the seat whose
failure-surface inventory (RQ-A) and traceability-gap inventory (RQ-C3) are so
precisely evidenced (`path:line`) that the architecture loop can navigate the
codebase from your artifact alone. Read the actual throw/catch/log sites in
every app and package; do not gesture at them.

## Upstream artifacts (read-only)

- `docs/missions/2026-08-21-observability-loop/brief.md` — the full brief
- `docs/missions/2026-08-21-observability-loop/00-intake-H0.md` — V's verbatim
  goal, classification, banked constraints, excluded security zone

## Handoff marker

When your artifact AND self-report are complete, emit exactly:

```
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-observability-loop / H0-REQUIREMENTS
- owner CLI session: SDK-subagent (opus blind seat)
- artifact path: docs/missions/2026-08-21-observability-loop/research/opus-requirements.md
- upstream artifacts used:
- checks/evidence:
- assumptions/risks:
- comments read through: not ticketed
```

Then stop. Do not proceed to architecture or implementation.

## Stop conditions

- Writing code, schemas, migrations, or configuration → stop; out of scope.
- Touching the excluded security zone (intake fact list) beyond reading for
  boundary mapping → stop.
- A product decision only V can make → record it under RQ-E, do NOT contact V.
- Cannot verify a claim → mark UNVERIFIED and continue. Never fabricate.

Return control at the handoff above, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal resumable until then. Silence is normal; unchanged
state needs no message. Termination requires: artifact written + self-report
filed + handoff emitted.
