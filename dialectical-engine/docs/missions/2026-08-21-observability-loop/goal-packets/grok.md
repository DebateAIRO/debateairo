# GOAL PACKET — Grok 4.6 seat (REQUIREMENTS research, seat 2 of 3)

```yaml
state:
  ticket: REQ-OBS-GROK
  mission: 2026-08-21-observability-loop
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: grok-4.6, session: <record yours at claim> }
  loop: requirements
  seat_shape: parallel-blind
  contract:
    allowed:
      - docs/missions/2026-08-21-observability-loop/research/grok-requirements.md
      - .hermes/reports/2026-08-21-observability-loop/agent-reports/grok.md
    readonly:
      - docs/missions/2026-08-21-observability-loop/brief.md
      - docs/missions/2026-08-21-observability-loop/00-intake-H0.md
      - apps/**, packages/**, migrations/**, docs/**, tests/**, acceptance/**, web/**, tools/**
    forbidden: all_others (explicitly: every other file under research/, all writes outside allowed)
    verification:
      - every RQ id in the brief (A1-A5, B1-B6, C1-C4, D1-D7, E1-E6) answered in order
      - every external claim cites a checkable URL; repo claims cite path:line; else UNVERIFIED
      - every recommendation carries confidence + strongest counter-argument
      - self-report filed before handoff
    human_review: yes
```

## Your job

Read `docs/missions/2026-08-21-observability-loop/brief.md` in full and answer
it in full. Write your artifact to **exactly**:

```
docs/missions/2026-08-21-observability-loop/research/grok-requirements.md
```

You are one of three seats answering this brief **independently and blind**.
Do not look for, read, or wait on any other seat's output; ignore other files
in `research/`. Your independent judgement is the product.

**Play to your strength: you have live search.** Be the seat that establishes
current, checkable 2026 ground truth: what production error-tracking systems
actually record per event (schema prior art for RQ-B2), Postgres
LISTEN/NOTIFY vs polling vs outbox reliability facts (RQ-D1), what
agentic auto-fix products actually ship and what guardrails they learned the
hard way (RQ-D3/D4/D5 — e.g. autofix/auto-PR tools and their failure stories),
and realistic CLI-relay loop costs (RQ-D2/E3). Ground every repo claim in the
actual code too — search findings never substitute for `path:line` evidence.

## Upstream artifacts (read-only)

- `docs/missions/2026-08-21-observability-loop/brief.md` — the full brief
- `docs/missions/2026-08-21-observability-loop/00-intake-H0.md` — V's verbatim
  goal, classification, banked constraints, excluded security zone

## Handoff marker

When your artifact AND self-report are complete, emit exactly:

```
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-observability-loop / H0-REQUIREMENTS
- owner CLI session: <your session id>
- artifact path: docs/missions/2026-08-21-observability-loop/research/grok-requirements.md
- upstream artifacts used:
- checks/evidence:
- assumptions/risks:
- comments read through: not ticketed
```

Then stop. Do not proceed to architecture or implementation.

## Stop conditions

- Writing code, schemas, migrations, or configuration → stop; out of scope.
- Touching the excluded security zone beyond reading for boundary mapping → stop.
- A product decision only V can make → record it under RQ-E, do NOT contact V.
- Cannot verify a claim → mark UNVERIFIED and continue. Never fabricate a
  citation, price, or API behaviour.

Return control at the handoff above, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal/session alive and resumable until then. Silence is
normal; unchanged state needs no message. Termination requires: artifact
written + self-report filed + handoff emitted.
