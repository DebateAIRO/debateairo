# GOAL PACKET — Claude Opus 5 seat (REQUIREMENTS research)

```yaml
state:
  ticket: REQ-DOCKER-OPUS
  mission: 2026-08-21-docker-hatchet
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: claude-opus-5, session: <record yours at WORKER CLAIM> }
  loop: requirements
  seat_shape: parallel-blind
  contract:
    allowed:
      - docs/missions/2026-08-21-docker-hatchet/research/opus-requirements.md
      - docs/missions/2026-08-21-docker-hatchet/agent-reports/opus-selfreport.md
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
docs/missions/2026-08-21-docker-hatchet/research/opus-requirements.md
```

You are one of three seats answering this brief **independently and blind**. Do
not look for, read, or wait on any other seat's output.

**Play to your strength:** systems constraints and collision-with-live-mission
thinking (section D), the dispatcher-only boundary (section C), and a
falsifiable operator bar (RQ-B1).

Also write a 10–20 line SELF-REPORT to:

```
docs/missions/2026-08-21-docker-hatchet/agent-reports/opus-selfreport.md
```

Include token/usage if the CLI exposed it; otherwise mark spend UNVERIFIED.

## Handoff marker

When the artifact is complete, append this block to the artifact and print it:

```
WORKER CLAIM:
- ticket: REQ-DOCKER-OPUS
- owner CLI session: <your claude session id>
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / H0-REQUIREMENTS
- owner CLI session:
- artifact path: docs/missions/2026-08-21-docker-hatchet/research/opus-requirements.md
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
