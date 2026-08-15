# Goal packet PROG-04 — Codex lane: eval-04-tagger (PROGRAMMING loop, tier 2)

Mission: model-evaluator. Seat: Codex implementation lane.
Worktree (work ONLY here): /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-04-tagger
Working directory inside it: DebateAI-V3/. Branch: codex/eval-04-tagger.
Your base includes merged foundation + domains + metering and the wired 0024 seed.

Read first (ABSOLUTE paths, read-only; mission docs are not in your worktree):
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md (§4 vLLM path, §5 data flow, §7 lane row tier 2, §8)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md (§2 tagger FRs, FR-0.x invariants)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/wayfinder/issues/04-ask-time-tagger.md

## Deliverables (lane row tier 2)

Ask-time evaluator workflow: the local vLLM classifier that reads the raw
question, matches it against the seeded domain registry, picks an existing
domain or proposes a genuinely new one (through the existing admission
guardrails), persisting via the question-domain landing. Non-gating failure:
container down / refusal / timeout → run proceeds untagged (tagging is
enrichment, never a gate on serving) with reconciliation for later. Tagging is
collect-only and runs from day one behind the module's boundary.

## Reviewer carry-forwards you MUST close in this lane (from tier-1 reviews, on the board ticket too)

1. admitProposal lacks a non-blank guard — a blank/whitespace proposal escapes as
   a raw DatabaseError with no admission receipt. Add requireNonblank (typed
   refusal + receipt) with a test; the tagger feeds model output into admission,
   so this closes before your lane merges.
2. Add the REFUSED and select-existing-domain_id admission paths the registry
   review found missing.
3. Re-assert evaluator provider isolation (assertEvaluatorProviderIsolation) on
   the tagger path before any vLLM call, with an observed-boundary test.

## Merge gate

Container-up / container-down / refusal tests; memory-no-op test (the tagger
never writes memory.question_key columns — evaluator-owned landing only, per the
requirements); the FR-0.6 AC5 differential stays green; repository typecheck.

## Constraints

Commit locally on your branch; NO push; no board mutations; no BOUND state;
DR-179 no API keys; do not alter non-evaluator behavior. Self-report to
/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/.hermes/reports/2026-08-14-model-evaluator/agent-reports/codex-PROG-04.md
When complete print exactly: READY FOR PEER REVIEW: codex/eval-04-tagger

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE
condition.
