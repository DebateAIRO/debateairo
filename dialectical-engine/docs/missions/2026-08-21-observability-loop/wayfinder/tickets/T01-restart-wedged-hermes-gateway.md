# T01 — Restart the wedged Hermes gateway
<!-- label: wayfinder:grilling | HITL | status: CLOSED | blocks: none | blocked-by: none -->

## Question

The hermes-agent gateway froze machine-wide (~09:15 UTC): all three missions'
Hermes sessions stopped advancing simultaneously; the gpt-5.6-sol backend
itself is healthy (codex cross-probe RELAY-OK). Sessions persist in
~/.hermes/state.db and are resumable. Restart the Hermes desktop app now
(orchestrator executes on V's yes), or wait for self-recovery (unbounded)?
Evidence: ../../logs/hermes-stall-liveness-report.md

## Resolution (V, 2026-08-21, in-session)

NEITHER option — V corrected the premise: "Do not use Hermes as it is on Qwen
and runs really slowly. I also specified that Hermes is not part of the fleet
for this mission, only the Hermes Kanban is needed." Mission-scoped fleet
ruling: no Hermes agent seat; verification re-lands on the QA seats V elected
(Grok + Claude Opus subagents); the Hermes KANBAN STORE remains the board
surface, operated via the `hermes kanban` CLI (store ops, no Qwen inference).
Actions: orchestrator killed its wedged one-shot (PID 20128, log annotated);
integrity gate re-dispatched to a QA-seat Opus reviewer (verdict →
reviews/H1-integrity-qa.md); sibling missions' stalled sessions untouched.
