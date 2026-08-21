# Goal packet REQ-01 — Grok: author Requirements.md (REQUIREMENTS ENGINEERING loop)

Mission: model-evaluator (H0: docs/missions/2026-08-14-model-evaluator/00-intake-H0.md)
Seat: REQUIREMENTS loop owner-author (elected by V, R7 election 2026-08-14 —
"Grok writes the plans alone this time"). Reviewer after you: Claude Opus agents.
Working directory: /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3

## Objective

Author the mission's requirements artifact:
`docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md`

Expand the wayfinder map's 11 charting rulings (V-ratified) into a testable,
stranger-readable requirements set for the Evaluator module.

## Read first (in order)

1. docs/missions/2026-08-14-model-evaluator/wayfinder/map.md  (destination, 11 rulings, fog, out-of-scope)
2. docs/missions/2026-08-14-model-evaluator/wayfinder/GLOSSARY.md
3. docs/missions/2026-08-14-model-evaluator/wayfinder/issues/  (all 11 tickets; 01 is resolved — read its Answer)
4. docs/missions/2026-08-14-model-evaluator/wayfinder/assets/01-relay-token-cost-exposure-findings.md
5. Existing foundations you must build ON, not replace: packages/db/src/schema.ts
   (scorecard.* tables, lines ~551-643), packages/settlement/src/index.ts (proper
   scoring, top-2 routing guards, SELF_ROUTING_FORBIDDEN), migration 0019
   (different-maker trigger), packages/serve/src/index.ts:856 (null question_type feed).

## Requirements.md must contain

- Functional requirements per subsystem (tagger, domain registry, harvest, judge
  add-on pass, bias/prowess metrics, token metering, consumer reader, seat-share
  allocator dark, dev menu), each with acceptance criteria a QA agent can test.
- Boundaries/non-goals lifted from the map's Out of scope + Not yet specified.
- The dark-launch invariant stated as a requirement: NO evaluator data influences
  any live run's dispatch until V's bind order.
- Traceability: each requirement cites the ruling or ticket it derives from.
- Open questions section: anything genuinely undecidable routes UP (to the
  orchestrator), never to V directly.

## Constraints

- Docs only — no code edits, no schema/migration edits, no wayfinder ticket edits.
- DR-179: no API keys anywhere. No push, no commits.
- Before final handoff, file your self-report (10-20 honest lines) to
  .hermes/reports/2026-08-14-model-evaluator/agent-reports/grok-REQ-01.md
  and append your token usage basis to it.
- When the artifact is complete, print exactly:
  `READY FOR PEER REVIEW: docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md`

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE
condition.
