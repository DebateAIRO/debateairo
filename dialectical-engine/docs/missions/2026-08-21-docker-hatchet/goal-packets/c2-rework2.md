# GOAL PACKET — C2 Plan.md rework round 2 (SAME SESSION)

```yaml
state:
  ticket: C2-DOCKER-OPUS
  mission: 2026-08-21-docker-hatchet
  status: changes_requested
  owner: { agent: claude-opus-5, session: 353f7aa5-5955-4e9b-8601-812810039d2b }
  stage: C2
  rework_round: 2
  authority_epoch: 3
```

SAME SESSION: `claude --resume 353f7aa5-5955-4e9b-8601-812810039d2b`.

H3 (disagreements-only + any-lens CHANGES REQUESTED):

- G3-rework-1: **PEER REVIEW APPROVED** — F-1…F-7 FLIPPED. Do **not** unwind those
  clauses (distinct project `docker-hatchet`, D0a/D0b split, scheduler as
  one-shot, etc.).
- H2-rework-1: **PEER REVIEW CHANGES REQUESTED**. H2-01 and H2-02 RESOLVED.
  Remaining RED: **H2-03, H2-04, H2-05, H2-06, H2-07, H2-08, H2-09**.

Union for this round is **only** H2-03…H2-09 in
`architecture/H2-plan-review.md` (current file, round 1). Reproduce each
against current Plan.md before rewriting.

Do not close OPEN-V by picking a 2–1 winner. Do not start Docker. No compose
mutation. No Hermes Agent. Freeze holds. Board: http://localhost:9119
`docker-hatchet`.

Allowed writes:

- `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md`
- `docs/missions/2026-08-21-docker-hatchet/agent-reports/c2-rework2-selfreport.md`

Handoff:

```
REWORK READY FOR PEER REVIEW:
- mission/step: 2026-08-21-docker-hatchet / C2-rework-2
- owner CLI session: 353f7aa5-5955-4e9b-8601-812810039d2b
- findings addressed: <H2-03..H2-09>
- findings BLOCKED/deferred:
- comments read through: H2-rework-1 remaining RED; G3-rework-1 APPROVED preserved
```

Then stop. Do not launch reviewers. Do not commit or push.
