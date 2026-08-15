# Goal packet PROG-03 — Codex lane: eval-03-domains (PROGRAMMING loop, tier 1A)

Mission: model-evaluator. Seat: Codex implementation lane.
Worktree (work ONLY here): /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-03-domains
Working directory inside it: DebateAI-V3/. Branch: codex/eval-03-domains.
Your base includes the merged eval-02 foundation (migration 0023, packages/evaluator).

Read first (ABSOLUTE paths, read-only; mission docs are not in your worktree):
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md (§3 domain tables, §5 data flow, §7 lane row 1A, §8)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md (§1 Domain registry FRs, FR-0.x invariants)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/wayfinder/issues/03-domain-registry-and-starter-list.md

## Deliverables (lane row 1A)

Registry repository; deterministic admission (new-domain guardrails per the FRs);
question-domain landing per the architecture's chosen mechanism; and the V
STARTER-LIST PROPOSAL PACKET: author a proposed ~20-30 domain starter list with
one-line rationale each to
/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/programming/eval-03-starter-list-proposal.md
(main checkout — the orchestrator routes it to V). The SEED MIGRATION (0024) must
be authored but is gated: mark it clearly as PENDING V APPROVAL and do not wire it
into the migration runner list until the orchestrator relays V's approved list —
structure the lane so swapping in V's final list touches only the seed data.

## Merge gate

Append-only/backfill tests for the registry; admission determinism tests;
repository typecheck; the HITL seed approval is satisfied by delivering the
proposal packet (the orchestrator holds the merge until V rules).

## Constraints

Commit locally on your branch; NO push; no board mutations; no BOUND state;
DR-179 no API keys; do not touch non-evaluator behavior. Self-report to
/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/.hermes/reports/2026-08-14-model-evaluator/agent-reports/codex-PROG-03.md
When complete print exactly: READY FOR PEER REVIEW: codex/eval-03-domains

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE
condition.
