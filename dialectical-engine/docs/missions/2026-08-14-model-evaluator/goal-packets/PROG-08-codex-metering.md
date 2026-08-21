# Goal packet PROG-08 — Codex lane: eval-08-metering (PROGRAMMING loop, tier 1B)

Mission: model-evaluator. Seat: Codex implementation lane.
Worktree (work ONLY here): /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-08-metering
Working directory inside it: DebateAI-V3/. Branch: codex/eval-08-metering.
Your base includes the merged eval-02 foundation (migration 0023, packages/evaluator).

Read first (ABSOLUTE paths, read-only; mission docs are not in your worktree):
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md (§3 metering tables, §5, §7 lane row 1B, §8)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md (§6 token metering FRs, FR-0.x)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/wayfinder/assets/01-relay-token-cost-exposure-findings.md (the per-path usage facts and the one-hook capture recommendation)

## Deliverables (lane row 1B)

Relay/gateway usage capture (the CliCompletion usage-block widening + standard
usage emission per the ticket-01 findings); usage projection into the evaluator
metering tables; v1 normalization; explicit unmetered surfaces (usage: null,
never estimated).

## Merge gate

Observed-only tests including the paid-vs-local cross-unit case; repository
typecheck; zero behavior change to relay request/response semantics beyond the
additive usage block (existing relay tests must stay green).

## Constraints

Commit locally on your branch; NO push; no board mutations; no BOUND state;
DR-179 no API keys. Parallel lane 03 owns registry/domain files — stay off them;
shared type changes route up to the orchestrator instead of being edited here.
Self-report to
/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/.hermes/reports/2026-08-14-model-evaluator/agent-reports/codex-PROG-08.md
When complete print exactly: READY FOR PEER REVIEW: codex/eval-08-metering

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE
condition.
