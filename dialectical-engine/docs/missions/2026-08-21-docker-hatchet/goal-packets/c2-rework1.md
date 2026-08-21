# GOAL PACKET — C2 Plan.md rework round 1 (SAME SESSION)

```yaml
state:
  ticket: C2-DOCKER-OPUS
  mission: 2026-08-21-docker-hatchet
  risk_tier: high
  planning_tier: 2
  status: changes_requested
  owner: { agent: claude-opus-5, session: 353f7aa5-5955-4e9b-8601-812810039d2b }
  loop: architecture
  stage: C2
  rework_round: 1
  authority_epoch: 2
  contract:
    allowed:
      - docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md
      - docs/missions/2026-08-21-docker-hatchet/agent-reports/c2-rework1-selfreport.md
    readonly:
      - docs/missions/2026-08-21-docker-hatchet/architecture/PlanReview.md
      - docs/missions/2026-08-21-docker-hatchet/architecture/H2-plan-review.md
      - docs/missions/2026-08-21-docker-hatchet/research/synthesized-requirements.md
      - docs/missions/2026-08-21-docker-hatchet/reviews/h1-integrity.md
      - docs/missions/2026-08-21-docker-hatchet/00-intake-H0.md
      - docs/missions/2026-08-21-docker-hatchet/goal-packets/c2-plan.md
    forbidden: all_others
```

SAME SESSION rework: `claude --resume 353f7aa5-5955-4e9b-8601-812810039d2b`.
(Plan.md's WORKER CLAIM id `5f3f7a2e-…` was not a Claude session. Recovered from
the C2 JSON log `session_id`. WORKER CONTINUITY OVERRIDE recorded on the board.)
Reproduce-first: before rewriting a section, quote the finding and the current
Plan.md passage that exhibits it.

H3 routing (orchestrator, disagreements-only rule): **both lenses CHANGES
REQUESTED**. Union every blocking finding. Do not drop a finding because the
other lens omitted it. Do not invent a third architecture. Do not close OPEN-V
rows.

## Union (must each be flipped in Plan.md or named BLOCKED with a V-packet row)

From G3 `architecture/PlanReview.md` (session `01a023d9-93d0-71d0-a5dd-e04a280efc85`):

- F-1 scheduler vs MB-1/MB-3
- F-2 AR-2 same-project `up` is a takeover
- F-3 U-2 has no lawful repair
- F-4 MB-3 specified only for postgres and runner
- F-5 V-2 still a row but §4 already implemented the majority
- F-6 freeze: AR-2 can mutate the live security store
- F-7 three hashed files in no path class

From H2 `architecture/H2-plan-review.md` (session `01a023d9-941c-7933-a618-2d944dbb51a5`;
handoff marker is in the seat log if missing from the file — verdict in-file is
**PEER REVIEW CHANGES REQUESTED**):

- H2-01 AR-2 mutates foreign mission runtime
- H2-02 D0 internally impossible / crosses lifecycle
- H2-03 required scheduler shape vs MB-1/MB-3
- H2-04 V-owned gates missing from slice entry
- H2-05 file contract still globbed/overlapping
- H2-06 runtime env and image inputs require invented values
- H2-07 database principals / product-truth data have no executable path
- H2-08 D5 deepens AC-60 front-door conflict
- H2-09 MB-9 does not falsify dispatcher-only laws

Overlaps (F-1≈H2-03, F-2/F-6≈H2-01) still need **one** Plan clause that satisfies
**both** write-ups.

Freeze, no code, no compose mutation, no Docker start, no Hermes Agent.
Board: http://localhost:9119 `docker-hatchet`.

Write the revised Plan.md in place. Self-report:

```
docs/missions/2026-08-21-docker-hatchet/agent-reports/c2-rework1-selfreport.md
```

Handoff (exact):

```
REWORK READY FOR PEER REVIEW:
- mission/step: 2026-08-21-docker-hatchet / C2-rework-1
- owner CLI session: 353f7aa5-5955-4e9b-8601-812810039d2b
- findings addressed: <id list>
- findings BLOCKED/deferred: <id list>
- comments read through: G3+H2 union
```

Then stop. Do not launch reviewers. Do not commit or push.
