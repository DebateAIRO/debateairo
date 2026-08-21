# Goal packet PROG-09 — Codex lane: eval-09-consumer (PROGRAMMING loop, tier 6A)

Mission: model-evaluator. Seat: Codex implementation lane. Parallel with lane 10 —
lane 10 owns seat-share/allocator files; stay off them; shared type changes route
up to the orchestrator.
Worktree (work ONLY here): /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-09-consumer
Working directory inside it: DebateAI-V3/. Branch: codex/eval-09-consumer.
Base: all lanes through 07 merged.

Read first (ABSOLUTE paths, read-only):
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md (§4 vLLM path, §5, §7 tier-6A row, §8)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md (§7 consumer FRs, ruling 3 writers/reader, FR-0.x)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/wayfinder/issues/09-consumer-reader.md

## Deliverables (lane row tier 6A)

The ONE reader (ruling 3): deterministic code computes all numbers (lane 07's
cells/ranks); the dev-menu-chosen local vLLM model INTERPRETS on top — plain-
language bias-pattern naming, per-model capability summaries per domain,
adjacent-domain flags. Prompt contract: the consumer sees AGGREGATES and blinded
samples only — never authorship during grading-adjacent tasks. Interpretations
persist versioned in the evaluator consumer tables. Refresh: on-demand +
post-aggregate. SELF_ROUTING_FORBIDDEN extension: the consumer model's own rows
are computed by code, never by itself — enforced and tested.

## Mandatory constraints (accumulated law)

1. Null-run scope for all consumer model calls (runId null, evaluator
   subjectItemId); lane-04/05/06 differentials + FR-0.6 AC5 stay green.
2. Own bounded retries (never product counters); validate inputs BEFORE any
   strike-bearing/receipted section; typed receipts for every failure path
   (including preflight) — no receiptless drops.
3. Isolation assert before any model call; do NOT construct a ProviderGateway
   over the evaluator repository pool while holding a lock client (lane-06 N5:
   separate pool or threaded client).
4. Concurrency: pg_try_advisory_lock + typed in-flight skip if you guard
   anything per-run; regression above pool max if you add any lock.
5. Malformed/hostile model output must never corrupt consumer tables — typed
   refusal, store consistent (adversarial tests required).

## Merge gate

Self-routing and authorization tests; blinding-of-prompt tests (captured request
body carries no authorship); versioned-output and refresh tests; adversarial
output tests; differentials green; typecheck. Pin clocks; no vacuous assertions —
real write paths in fixtures.

## Constraints

Commit locally on your branch; NO push; no board mutations; no BOUND state;
DR-179. Self-report to
/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/.hermes/reports/2026-08-14-model-evaluator/agent-reports/codex-PROG-09.md
When complete print exactly: READY FOR PEER REVIEW: codex/eval-09-consumer

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE
condition.
