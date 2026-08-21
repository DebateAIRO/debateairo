# GOAL PACKET — C4 FinalPlan.md (ARCHITECTURE loop, Claude planner — FRESH instance)

```yaml
state:
  ticket: ARCH-OBS-C4
  mission: 2026-08-21-observability-loop
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: claude (FRESH instance — spine law: C4 uses a different session from C2), session: SDK-subagent }
  loop: architecture
  contract:
    allowed:
      - docs/missions/2026-08-21-observability-loop/planning/FinalPlan.md
      - .hermes/reports/2026-08-21-observability-loop/agent-reports/c4-finalplan.md
    readonly:
      - docs/missions/2026-08-21-observability-loop/planning/Plan.md         # APPROVED (both lenses PASS round 1)
      - docs/missions/2026-08-21-observability-loop/reviews/H2-plan-fidelity-opus.md   # lens A PASS + REG-01
      - docs/missions/2026-08-21-observability-loop/planning/PlanReview.md            # lens B PASS + 4 PROG constraints
      - docs/missions/2026-08-21-observability-loop/reviews/H3-merge-rework-packet.md
      - docs/missions/2026-08-21-observability-loop/research/SYNTHESIS-requirements.md
      - docs/missions/2026-08-21-observability-loop/research/POST-SYNTHESIS-RULINGS.md  # incl. Batch 3 — WINS on conflict
      - docs/missions/2026-08-21-observability-loop/{00-intake-H0.md,brief.md}
      - repo read-only
    forbidden: all_others (no code, no migrations, no config)
    verification:
      - Batch-3 V rulings (rows 13/11/6/14) folded into the design, each cited
      - REG-01 citations restored; the 4 Lens-B PROG constraints carried as implementation constraints
      - FinalPlan is IMPLEMENTATION-READY and G5-sliceable: bounded contexts, deliverables, dependency order, phase gates G0-G6 with falsifiable acceptance
      - every OBS-Rnnn / ruling id still traces; §L closure re-run (no cited-but-unimplemented id)
      - no user-linked identifiers; no free-text error remnant (row 6)
    human_review: yes (H4, then G5 slices, then H6 lane plan + planning-graph image → V)
```

## Your job

You are a FRESH Claude architecture instance (NOT the C2 author — spine
independence between C2 and C4). Author
`docs/missions/2026-08-21-observability-loop/planning/FinalPlan.md`: the
finalized, review-incorporated, implementation-ready plan that G5 will slice
into vertical slices and H6 will ticketize.

Inputs are settled: Plan.md is APPROVED (both blind lenses PASS on round 1).
Your job is not to re-litigate it — it is to (1) fold in V's Batch-3 rulings
(POST-SYNTHESIS-RULINGS.md — deferred canary, QUICK review scoping confirmed,
free-text remnant DROPPED, Hatchet-readable-is-a-new-mission), (2) apply the
two round-1 cleanups (Lens A REG-01 citations; Lens B's 4 PROG hardening
constraints), and (3) produce the definitive plan: per-subsystem deliverables,
DDD bounded contexts + invariant ownership, dependency order, and the G0-G6
rollout with falsifiable per-gate acceptance criteria — sized so G5 can cut
disjoint-file-contract vertical slices.

Hard constraints from the rulings: NO free-text error remnant anywhere (row 6);
the dual-source Hatchet half is an EXPLICIT DEFERRAL to a new mission if
SPIKE-D1 fails, never a silent first-party-only narrowing (row 14); QUICK stays
auto-merge with policy-gate+visibility as its "review" (row 11); deferred
canary opens at next deploy (row 13). ROW-GIT still gates all coding lanes;
FinalPlan records that the reconciliation commit lands immediately before the
first lane.

## Handoff marker

When FinalPlan.md AND the self-report are written, end with:

```
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-observability-loop / C4-FINALPLAN
- owner CLI session: SDK-subagent (C4 FinalPlan, fresh)
- artifact path: docs/missions/2026-08-21-observability-loop/planning/FinalPlan.md
- upstream artifacts used:
- checks/evidence:
- assumptions/risks:
- comments read through: not ticketed
```

Then stop. H4 review runs next, then G5 vertical slices; do not slice or
ticketize yourself.

## Stop conditions
- Any pressure to write code/migrations/config → stop.
- A NEW requirement conflict the overlay+Batch-3 does not settle → FinalPlan
  DECIDE-V table as ARCH→REQ; never ask V directly.
- Excluded zone: read only for boundary design; never propose changes inside it.
