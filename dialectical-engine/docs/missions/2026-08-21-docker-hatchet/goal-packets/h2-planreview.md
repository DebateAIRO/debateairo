# GOAL PACKET — H2 Plan review recut (Codex gpt-5.6-sol xhigh)

```yaml
state:
  ticket: H2-DOCKER-CODEX
  mission: 2026-08-21-docker-hatchet
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: codex, session: <record yours at WORKER CLAIM> }
  loop: architecture
  stage: H2
  reasoning_effort: xhigh
  contract:
    allowed:
      - docs/missions/2026-08-21-docker-hatchet/architecture/H2-plan-review.md
      - docs/missions/2026-08-21-docker-hatchet/agent-reports/h2-selfreport.md
    readonly:
      - docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md
      - docs/missions/2026-08-21-docker-hatchet/research/synthesized-requirements.md
      - docs/missions/2026-08-21-docker-hatchet/reviews/h1-integrity.md
      - docs/missions/2026-08-21-docker-hatchet/00-intake-H0.md
      - docs/architecture/01-decisions/ADR-0017-durable-execution-hatchet.md
      - docs/architecture/01-decisions/ADR-0018-deployment-topology.md
    forbidden: all_others
    verification:
      - independent of G3; never read PlanReview.md or g3-*
    human_review: yes
```

**Why this seat is Codex, not Hermes:** V forbade Hermes Agent (Qwen, too slow).
Kanban remains http://localhost:9119 board `docker-hatchet`. H2 must be a
different model family from C2 (Opus author) and from G3 (Grok). You are that
third family.

You are an independent adversarial reviewer. Your job is NOT to approve.
Lens: **machine-executability / spec precision / file-contract / dispatcher-only
laws / freeze**. Try to break the Plan: slices a coding seat could not execute
without guessing; compose collisions with live security WIP; RabbitMQ sneak-in;
`localhost` gRPC; silent Hatchet sidecar; host-masquerade. If unsure, FAIL it.

**Blindness:** do not read `architecture/PlanReview.md`, `g3-*`, or comments
after C2's READY marker.

Write **exactly**:

```
docs/missions/2026-08-21-docker-hatchet/architecture/H2-plan-review.md
```

Verdict: `PEER REVIEW APPROVED` or `PEER REVIEW CHANGES REQUESTED`.

Self-report (codex session footer or UNVERIFIED):

```
docs/missions/2026-08-21-docker-hatchet/agent-reports/h2-selfreport.md
```

Handoff:

```
WORKER CLAIM:
- ticket: H2-DOCKER-CODEX
- owner CLI session: <codex session id>
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / H2
- owner CLI session:
- artifact path: docs/missions/2026-08-21-docker-hatchet/architecture/H2-plan-review.md
- verdict: PEER REVIEW APPROVED | PEER REVIEW CHANGES REQUESTED
- comments read through: intake
```

stdin for `codex exec` must stay closed. Do not implement. Do not commit or push.

Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION,
but keep the unfinished goal/session alive and resumable. Silence is normal.
Do NOT commit or push.
