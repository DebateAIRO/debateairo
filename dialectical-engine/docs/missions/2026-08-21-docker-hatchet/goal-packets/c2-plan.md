# GOAL PACKET — C2 Plan.md (Claude Opus 5)

```yaml
state:
  ticket: C2-DOCKER-OPUS
  mission: 2026-08-21-docker-hatchet
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: claude-opus-5, session: <record yours at WORKER CLAIM> }
  loop: architecture
  stage: C2
  contract:
    allowed:
      - docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md
      - docs/missions/2026-08-21-docker-hatchet/agent-reports/c2-selfreport.md
    readonly:
      - docs/missions/2026-08-21-docker-hatchet/00-intake-H0.md
      - docs/missions/2026-08-21-docker-hatchet/brief.md
      - docs/missions/2026-08-21-docker-hatchet/research/synthesized-requirements.md
      - docs/missions/2026-08-21-docker-hatchet/reviews/h1-integrity.md
      - docs/architecture/01-decisions/ADR-0017-durable-execution-hatchet.md
      - docs/architecture/01-decisions/ADR-0018-deployment-topology.md
      - docs/architecture/03-module-design.md
      - docs/architecture/05-register-skeleton.md
      - docs/architecture/07-build-order.md
      - compose.dev.yaml
      - deploy/**
      - package.json
      - apps/**
      - packages/register/**
      - web/package.json
    forbidden: all_others
    verification:
      - Plan.md exists and is an architecture plan, not code
      - every AGREED synthesized requirement is mapped to a plan clause or explicitly deferred with a named successor
      - every OPEN-V / CONTESTED item is a V DECISIONS PACKET row, not silently closed
      - freeze honored
    human_review: yes
```

You are a **new** Opus session. Architecture C2 only. Not the REQ-DOCKER-OPUS
researcher, not REQ-DOCKER-SYNTH, not the orchestrator.

**Board:** Hermes Kanban at http://localhost:9119 board `docker-hatchet` only.
Do not run Hermes Agent (`hermes --yolo` / `hermes -z`). Kanban comments are
optional; your deliverable is the file.

**H1 PASS** is already recorded. Upstream of record:

```
docs/missions/2026-08-21-docker-hatchet/research/synthesized-requirements.md
docs/missions/2026-08-21-docker-hatchet/reviews/h1-integrity.md
```

Write **exactly**:

```
docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md
```

## Plan must contain

1. **Target topology** for this mission against ADR-0018 (what runs in Compose,
   what stays on the host). Honor freeze: no identity/auth/MFA/crypto.
2. **Hatchet wiring** — dispatcher-only; claim-before-call stays ours; how
   `apps/runner` registers; env/DNS so `localhost:7077` is not the worker's
   own loopback. RabbitMQ stays off.
3. **File/image contract** a later coding seat can execute without guessing
   (new files vs extend `compose.dev.yaml` — collision with live security WIP
   is in synth §4).
4. **Slice/lane order** for programming (named slices, dependencies, what is
   first coding ticket). Do not implement.
5. **V DECISIONS PACKET draft** — copy forward synth OPEN-V rows (V-1…V-10)
   that still block architecture. Do not contact V. Do not pick a winner on
   2–1 product contests.
6. **Non-goals** — evaluator-worker unless V-6 says otherwise; security WIP;
   Kubernetes; Hatchet Cloud; RabbitMQ.

Do not reopen DR-117 / DR-118. Do not write Dockerfiles, compose, or app code.
Do not start Docker Desktop (V-1 / IMPORTANT OPERATION).

Self-report:

```
docs/missions/2026-08-21-docker-hatchet/agent-reports/c2-selfreport.md
```

## Handoff

```
WORKER CLAIM:
- ticket: C2-DOCKER-OPUS
- owner CLI session: <claude session id>
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / C2
- owner CLI session:
- artifact path: docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md
- comments read through: intake
```

Then stop. Do not launch reviewers. Do not commit or push.

Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION,
but keep the unfinished goal/session alive and resumable. Silence is normal.
Do NOT commit or push.
