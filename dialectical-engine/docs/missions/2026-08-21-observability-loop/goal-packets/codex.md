# GOAL PACKET — Codex gpt-5.6-sol seat (REQUIREMENTS research, seat 3 of 3)

```yaml
state:
  ticket: REQ-OBS-CODEX
  mission: 2026-08-21-observability-loop
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: codex@gpt-5.6-sol, session: <record yours at claim>, reasoning: xhigh }
  loop: requirements
  seat_shape: parallel-blind
  contract:
    allowed:
      - docs/missions/2026-08-21-observability-loop/research/codex-requirements.md
      - .hermes/reports/2026-08-21-observability-loop/agent-reports/codex.md
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
docs/missions/2026-08-21-observability-loop/research/codex-requirements.md
```

You are one of three seats answering this brief **independently and blind**.
Do not look for, read, or wait on any other seat's output; ignore other files
in `research/`. Your independent judgement is the product.

**Play to your strength: adversarial systems rigor.** Be the seat that
red-teams the design space before it exists: how the capture layer itself can
fail or lie (RQ-B3/B5), how the trace procedure can loop or dead-end (RQ-C2),
and above all how the permanent fix-agent goes wrong (RQ-D) — wrong-fix
cascades, flapping auto-fixes, guardrail bypass via generated code, prompt
injection through error payloads (an error message is attacker-influenced
input to an LLM agent — treat it as such), self-modification, runaway spend.
Every guardrail you propose must name the concrete failure it prevents.

## Upstream artifacts (read-only)

- `docs/missions/2026-08-21-observability-loop/brief.md` — the full brief
- `docs/missions/2026-08-21-observability-loop/00-intake-H0.md` — V's verbatim
  goal, classification, banked constraints, excluded security zone

## Handoff marker

When your artifact AND self-report are complete, emit exactly:

```
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-observability-loop / H0-REQUIREMENTS
- owner CLI session: <your codex session id>
- artifact path: docs/missions/2026-08-21-observability-loop/research/codex-requirements.md
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
- Cannot verify a claim → mark UNVERIFIED and continue. Never fabricate.

Return control at the handoff above, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal/session alive and resumable until then. Silence is
normal; unchanged state needs no message. Termination requires: artifact
written + self-report filed + handoff emitted.
