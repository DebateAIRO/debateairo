# GOAL PACKET — Claude Opus 5 synthesis seat (REQUIREMENTS merge)

```yaml
state:
  ticket: REQ-DOCKER-SYNTH
  mission: 2026-08-21-docker-hatchet
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: claude-opus-5, session: <record yours at WORKER CLAIM> }
  loop: requirements
  seat_shape: synthesis-after-blind
  contract:
    allowed:
      - docs/missions/2026-08-21-docker-hatchet/research/synthesized-requirements.md
      - docs/missions/2026-08-21-docker-hatchet/agent-reports/synth-selfreport.md
    readonly:
      - docs/missions/2026-08-21-docker-hatchet/brief.md
      - docs/missions/2026-08-21-docker-hatchet/00-intake-H0.md
      - docs/missions/2026-08-21-docker-hatchet/research/opus-requirements.md
      - docs/missions/2026-08-21-docker-hatchet/research/grok-requirements.md
      - docs/missions/2026-08-21-docker-hatchet/research/codex-requirements.md
      - docs/missions/2026-08-21-docker-hatchet/agent-reports/opus-selfreport.md
      - docs/missions/2026-08-21-docker-hatchet/agent-reports/grok-selfreport.md
      - docs/missions/2026-08-21-docker-hatchet/agent-reports/codex-selfreport.md
      - docs/agent-protocols/**
      - docs/architecture/01-decisions/ADR-0017-durable-execution-hatchet.md
      - docs/architecture/01-decisions/ADR-0018-deployment-topology.md
    forbidden: all_others
    verification:
      - every brief RQ id (A1–A5, B1–B5, C1–C5, D1–D3, E1–E4) has an AGREED / CONTESTED / OPEN-V row
      - extra RQ ids invented by a seat (Opus E5–E9) are listed separately, not silently dropped
      - contested rows quote the disagreement; they are not averaged away
      - V-only questions are listed for a V DECISIONS PACKET; do not contact V
    human_review: yes
```

## Your job

You are a **new** Opus session. You are not the REQ-DOCKER-OPUS researcher and
not the orchestrator. Read the three blind artifacts and produce ONE synthesized
requirements spec at:

```
docs/missions/2026-08-21-docker-hatchet/research/synthesized-requirements.md
```

Requirements only. No architecture, no Dockerfiles, no compose, no code.

### Spec shape

1. **Mission bar** — what must be true for "the app is containerized using Docker
   and Hatchet" to be an honest claim (falsifiable).
2. **Per-RQ merge table** for every brief id. Columns: id, AGREED | CONTESTED |
   OPEN-V, one-line synthesis, owning citations (which seat).
3. **Hard constraints carried forward** (do not reopen DR-117/118, freeze, RabbitMQ
   off, one store, one front door, port 9119, DR-179 relays stay on host).
4. **Collision / file-contract rule** for the live accounts-privacy-security
   mission (section D).
5. **V DECISIONS PACKET draft** — every OPEN-V question as a row: question,
   options, seats' recommendations, why REQUIREMENTS cannot close it. Include
   Opus's extra E5–E9 if they are actually V-owned; demote any that REQUIREMENTS
   can close.
6. **What Architecture may start from** — the synthesized bar and constraints,
   not a design.

Where seats agree, pass the agreement through. Where they disagree, keep both
readings and say what would settle it. Do not invent a fourth opinion to break
ties on product questions.

Self-report (10–20 lines, usage if the CLI shows it else UNVERIFIED):

```
docs/missions/2026-08-21-docker-hatchet/agent-reports/synth-selfreport.md
```

## Handoff marker

```
WORKER CLAIM:
- ticket: REQ-DOCKER-SYNTH
- owner CLI session: <your claude session id>
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / H0-REQUIREMENTS-SYNTH
- owner CLI session:
- artifact path: docs/missions/2026-08-21-docker-hatchet/research/synthesized-requirements.md
- upstream artifacts used:
- checks/evidence:
- assumptions/risks:
- comments read through: intake
```

Then stop. Do not start Architecture. Do not commit or push.

Return control at a spine handoff (READY FOR HERMES STAGE REVIEW), a genuine
blocker, or an IMPORTANT OPERATION, but keep the unfinished goal/session alive
and resumable. Silence is normal. Do NOT commit or push.
