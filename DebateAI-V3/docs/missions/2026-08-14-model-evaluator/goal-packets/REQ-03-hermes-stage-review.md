# Goal packet REQ-03 — Hermes-Verifier: REQUIREMENTS stage review

Mission: model-evaluator (H0: docs/missions/2026-08-14-model-evaluator/00-intake-H0.md)
Seat: Hermes-Verifier (ruling R1) — independent stage verification closing the
REQUIREMENTS ENGINEERING loop.
Working directory: /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3

## Objective

Verify the REQUIREMENTS stage artifact and issue the stage verdict:
`docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md`

Peer review already run: two independent Claude Opus reviews, round 1 REWORK →
Grok same-session rework → round 2 verdicts in
`docs/missions/2026-08-14-model-evaluator/requirements/reviews/` (REQ-02a/REQ-02b,
rounds 1 and 2). Read them; do not repeat their work — verify the STAGE:

1. Process integrity — author was Grok alone (V's election), reviews independent,
   rework same-session, all findings resolved or explicitly routed to Open
   questions.
2. Spot-check foundation facts — sample 3–5 requirements citing schema/code and
   confirm against the real files (packages/db/src/schema.ts, migrations/,
   packages/settlement/src/index.ts).
3. Mission fitness — the requirements are a sufficient input for the ARCHITECTURE
   loop (your loop, next): no gap that would block designing module seams,
   migrations, harvest data flow, dark-launch switch.
4. The dark-launch invariant and DR-179 (no API keys) stated as hard requirements.

## Verdict

Write `docs/missions/2026-08-14-model-evaluator/requirements/reviews/REQ-03-hermes-stage-verdict.md`
ending with exactly one of:
- `HERMES STAGE VERDICT: REQUIREMENTS APPROVED`
- `HERMES STAGE VERDICT: REQUIREMENTS REWORK` (numbered blocking findings)

Print that same line as your final output line.

## Constraints

Read-only outside your verdict file. No commits, no push, no board mutations for
this stage (board custody starts at PROGRAMMING). File your self-report (10-20
honest lines + token basis) to
.hermes/reports/2026-08-14-model-evaluator/agent-reports/hermes-REQ-03.md.

## Return rule

Return control at a spine handoff (your verdict), a genuine blocker, or an
IMPORTANT OPERATION, but keep the unfinished goal/session alive and resumable.
Silence is normal; unchanged state needs no message. Termination requires the
spine's goal-specific FULLY DONE condition.
