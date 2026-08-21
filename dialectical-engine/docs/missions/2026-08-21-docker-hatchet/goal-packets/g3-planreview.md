# GOAL PACKET — G3 PlanReview.md (Grok 4.6)

```yaml
state:
  ticket: G3-DOCKER-GROK
  mission: 2026-08-21-docker-hatchet
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: grok-4.6, session: <record yours at WORKER CLAIM> }
  loop: architecture
  stage: G3
  contract:
    allowed:
      - docs/missions/2026-08-21-docker-hatchet/architecture/PlanReview.md
      - docs/missions/2026-08-21-docker-hatchet/agent-reports/g3-selfreport.md
    readonly:
      - docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md
      - docs/missions/2026-08-21-docker-hatchet/research/synthesized-requirements.md
      - docs/missions/2026-08-21-docker-hatchet/reviews/h1-integrity.md
      - docs/missions/2026-08-21-docker-hatchet/00-intake-H0.md
      - docs/architecture/01-decisions/ADR-0017-durable-execution-hatchet.md
      - docs/architecture/01-decisions/ADR-0018-deployment-topology.md
    forbidden: all_others
    verification:
      - independent of H2; never read h2-* or sibling verdicts
    human_review: yes
```

You are a **fresh Grok session**, not the orchestrator
(`01a0235d-2f79-7680-88c6-0f4526cb2c69`), not REQ-DOCKER-GROK, not H1-DOCKER-GROK.

You are an independent adversarial reviewer. Your job is NOT to approve.
Actively try to break, refute, or falsify Plan.md within architecture /
requirements-trace / freeze / dispatcher-only / one-writer-per-file. If unsure,
FAIL it and state exactly what proof would change your verdict. You are
read-only on the Plan: report findings, never edit Plan.md.

**Blindness:** do not look for, read, or wait on `h2-*`, any other
`PlanReview`, or ticket comments posted after C2's READY marker.

**Hermes Agent is forbidden.** Board is http://localhost:9119 `docker-hatchet`
(Kanban only).

Write **exactly**:

```
docs/missions/2026-08-21-docker-hatchet/architecture/PlanReview.md
```

Verdict is `PEER REVIEW APPROVED` or `PEER REVIEW CHANGES REQUESTED` with
lens-tagged findings. Each finding: location in Plan.md, why it fails, what
would flip it.

Self-report (usage or UNVERIFIED):

```
docs/missions/2026-08-21-docker-hatchet/agent-reports/g3-selfreport.md
```

Handoff:

```
WORKER CLAIM:
- ticket: G3-DOCKER-GROK
- owner CLI session: <your grok UUID>
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / G3
- owner CLI session:
- artifact path: docs/missions/2026-08-21-docker-hatchet/architecture/PlanReview.md
- verdict: PEER REVIEW APPROVED | PEER REVIEW CHANGES REQUESTED
- comments read through: intake
```

Do not start C4, coding, or Docker. Do not commit or push.

Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION,
but keep the unfinished goal/session alive and resumable. Silence is normal.
Do NOT commit or push.
