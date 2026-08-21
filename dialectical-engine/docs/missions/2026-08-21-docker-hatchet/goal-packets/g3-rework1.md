# GOAL PACKET — G3 re-review of C2 rework-1 (SAME SESSION)

```yaml
state:
  ticket: G3-DOCKER-GROK
  mission: 2026-08-21-docker-hatchet
  stage: G3
  status: ready
  owner: { agent: grok-4.6, session: 01a023d9-93d0-71d0-a5dd-e04a280efc85 }
  rework_round: 1
```

SAME SESSION: `grok --resume 01a023d9-93d0-71d0-a5dd-e04a280efc85` — never `--fork-session`.
You are the lens that filed F-1…F-7. P8: confirm your own findings against the
**current** `architecture/Plan.md` (mtime after C2-rework-1). Reproduce each F-n
against current text before approving.

**Blind:** do not read `H2-plan-review.md`, h2-*, or the sibling rework packet.

Hermes Agent forbidden. Board: http://localhost:9119 `docker-hatchet`.

Write in place:

```
docs/missions/2026-08-21-docker-hatchet/architecture/PlanReview.md
```

Per finding F-1…F-7: FLIPPED | STILL OPEN (quote the current Plan passage).
Overall: `PEER REVIEW APPROVED` or `PEER REVIEW CHANGES REQUESTED`.

Self-report: `docs/missions/2026-08-21-docker-hatchet/agent-reports/g3-rework1-selfreport.md`

Handoff must include this exact step string so the watcher can distinguish rounds:

```
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / G3-rework-1
- owner CLI session: 01a023d9-93d0-71d0-a5dd-e04a280efc85
- artifact path: docs/missions/2026-08-21-docker-hatchet/architecture/PlanReview.md
- verdict: PEER REVIEW APPROVED | PEER REVIEW CHANGES REQUESTED
```

Do not edit Plan.md. Do not commit or push.
