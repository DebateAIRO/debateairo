# Goal packet ARCH-01 — Hermes: author the Architecture (ARCHITECTURE loop)

Mission: model-evaluator (H0: docs/missions/2026-08-14-model-evaluator/00-intake-H0.md)
Seat: ARCHITECTURE loop owner-author (elected by V, R7 election 2026-08-14 —
"Architecture is gonna be Hermes, reviewed by Grok").
Working directory: /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3

## Objective

Author two artifacts:
1. `docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md`
2. The mission-graph IMAGE at `.hermes/reports/2026-08-14-model-evaluator/mission-graph.svg`
   — nodes/edges/routers/lanes/tiers/worktrees/merge order for the PROGRAMMING loop.
   V's yes on this image gates programming (planning-graph gate). Presented WITH the
   lane-plan packet row.

## Read first (in order)

1. docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md — APPROVED
   input (HERMES STAGE VERDICT: REQUIREMENTS APPROVED); its FRs bind you.
2. docs/missions/2026-08-14-model-evaluator/requirements/reviews/REQ-02a-opus-review-3.md
   — carries four non-blocking notes explicitly addressed TO architecture (evaluator
   maker string naming; OQ12 vs ticket-matrix tension; FR-0.1 scope; FR-1.3 modality
   + cross-schema REFERENCES grant nits). Resolve each in your design.
3. docs/missions/2026-08-14-model-evaluator/wayfinder/map.md + issues/ (the 11 tickets)
4. Real code: packages/db/src/schema.ts, migrations/ (esp. 0015, 0019, 0021, 0022),
   packages/settlement/src/index.ts, packages/providers/src/index.ts,
   apps/api/src/main.ts (resolveDiscoveredPanel), apps/runner/src/index.ts.

## Architecture.md must decide

- Module home + seams (packages/evaluator), boundary contract, allowed reads/writes.
- Evaluator-owned tables: full DDL design (append-only triggers, grants, schemas) for
  observation rows, (domain, step) landing (FR-3.5 Option E default), domain registry,
  token metering, consumer-reader outputs — as migration specs, not applied SQL.
- Harvest data flow (inline vs scheduler), judge add-on pass placement, blinding
  mechanics, dark-launch switch mechanism honoring FR-0.1 and FR-0.6 AC5 (evaluator
  vLLM path NEVER enters panel-discovery configured-provider set).
- Ticket/lane plan for PROGRAMMING: map the wayfinder tickets 02-11 + OQ12's FR-0.6
  build work into Codex lanes with worktrees, dependencies, merge order.

## Constraints

Docs + SVG only — no code edits, no migrations applied, no commits, no push, no
board mutations yet. DR-179: no API keys. File your self-report to
.hermes/reports/2026-08-14-model-evaluator/agent-reports/hermes-ARCH-01.md.
When both artifacts are complete, print exactly:
`READY FOR PEER REVIEW: docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md`

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE
condition.
