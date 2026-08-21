# GOAL PACKET — Codex gpt-5.6-sol xhigh seat (REQUIREMENTS research)

```yaml
state:
  ticket: REQ-DOCKER-CODEX
  mission: 2026-08-21-docker-hatchet
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: codex, session: <record yours at WORKER CLAIM> }
  loop: requirements
  seat_shape: parallel-blind
  reasoning_effort: xhigh
  contract:
    allowed:
      - docs/missions/2026-08-21-docker-hatchet/research/codex-requirements.md
      - docs/missions/2026-08-21-docker-hatchet/agent-reports/codex-selfreport.md
    readonly:
      - docs/missions/2026-08-21-docker-hatchet/brief.md
      - docs/missions/2026-08-21-docker-hatchet/00-intake-H0.md
      - docs/agent-protocols/**
      - docs/architecture/**
      - docs/founding/**
      - compose.dev.yaml
      - deploy/**
      - package.json
      - pnpm-workspace.yaml
      - pnpm-lock.yaml
      - apps/**
      - packages/**
      - web/**
      - register.bootstrap.json
    forbidden: all_others
    verification:
      - every RQ id in the brief is answered
      - every factual claim is cited or marked UNVERIFIED
      - every recommendation has a confidence and a strongest counter-argument
    human_review: yes
```

## Your job

Read `docs/missions/2026-08-21-docker-hatchet/brief.md` and answer it in full.
Write your artifact to **exactly**:

```
docs/missions/2026-08-21-docker-hatchet/research/codex-requirements.md
```

You are one of three seats answering this brief **independently and blind**. Do
not look for, read, or wait on any other seat's output.

This seat is REQUIREMENTS, not the later programming seat. Do not implement.

**Play to your strength:** machine-executability of the requirements. RQ-A2
start-path inventory, RQ-A3 SDK-absence proof, RQ-B1 falsifiable acceptance
bar, RQ-C4 a check that would fail a RabbitMQ sneak-in, RQ-D1 path classes a
later coding seat could honor without colliding with running S3 work.

Also write a 10–20 line SELF-REPORT to:

```
docs/missions/2026-08-21-docker-hatchet/agent-reports/codex-selfreport.md
```

Copy token usage from the session footer. Named basis: `codex session footer`.

## Handoff marker

When the artifact is complete, append this block to the artifact and print it:

```
WORKER CLAIM:
- ticket: REQ-DOCKER-CODEX
- owner CLI session: <your codex session id>
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / H0-REQUIREMENTS
- owner CLI session:
- artifact path: docs/missions/2026-08-21-docker-hatchet/research/codex-requirements.md
- upstream artifacts used:
- checks/evidence:
- assumptions/risks:
- comments read through: intake
```

Then stop. Do not proceed to architecture or implementation. Do not commit or
push.

## Stop conditions

- Writing code, Dockerfiles, compose, schemas, migrations, or configuration → stop.
- Touching identity/auth/MFA/crypto or the accounts-privacy-security tree → stop.
- A product decision only V can make → record it under section E, do not contact V.
- Cannot verify a claim → mark `UNVERIFIED` and continue. Never fabricate.

Return control at a spine handoff (READY FOR HERMES STAGE REVIEW), a genuine
blocker, or an IMPORTANT OPERATION, but keep the unfinished goal/session alive
and resumable. Silence is normal. Do NOT commit or push.
