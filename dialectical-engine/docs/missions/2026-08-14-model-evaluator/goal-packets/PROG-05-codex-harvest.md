# Goal packet PROG-05 — Codex lane: eval-05-harvest (PROGRAMMING loop, tier 3)

Mission: model-evaluator. Seat: Codex implementation lane.
Worktree (work ONLY here): /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-05-harvest
Working directory inside it: DebateAI-V3/. Branch: codex/eval-05-harvest.
Your base includes merged foundation + domains (seed wired) + metering + tagger.

Read first (ABSOLUTE paths, read-only; mission docs are not in your worktree):
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md (§3 observation tables, §5 data flow, §7 tier-3 row, §8)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md (§3 harvest FRs incl. FR-3.0/3.1/3.2/3.5, FR-0.x)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/wayfinder/issues/05-harvest-pipeline.md

## Deliverables (lane row tier 3)

Terminal reconciler + deterministic artifact projector: after a run reaches a
terminal state, fold its existing artifacts — authored nodes
(ledger.raw_artifact.maker), cross-maker reviews (ledger.node_review),
judgements (ledger.reduced_judgement), strengths, settlement outcomes when they
exist — into idempotent evaluator observation rows per (model, domain-from-tag,
step ∈ {AUTHORING, JUDGING, REVIEWING}). Consensus-fed vs settlement-fed marked
per row (ruling 4 + FR-3.2: consensus rows live in evaluator-owned tables,
never touching the Q59 CHECK). Zero extra model calls — harvest is
deterministic code (merge gate: zero-provider-call proof).

## Handoffs you MUST honor (from prior lanes' reviews, on the board ticket too)

1. EXCLUDE the `evaluator.` call-site prefix from harvest — evaluator's own
   tag/metering calls are never harvested as model performance evidence.
2. Treat `evaluator.question_domain` as authoritative for a run's domain — NOT
   pipeline events (a successful tag can exist without a SUCCEEDED receipt).
   Nullable-domain runs harvest with domain NULL (test required).
3. YOU own the metering caller: wire recordCall/deriveRelativeCostCellsV1 into
   your worker path (worker-owned writes per Architecture §2.2) so completed
   calls project usage — never from the product gateway path.
4. Evaluator artifacts are null-run-scoped — correlate on attempt id where you
   need a tie (never join evaluator artifacts by run_id).

## Merge gate

Zero-provider-call proof; nullable-domain and Q59-separation tests; idempotency
(re-harvest of the same run produces no duplicate observations); FR-0.6 AC5
differential stays green; repository typecheck.

## Constraints

Commit locally on your branch; NO push; no board mutations; no BOUND state;
DR-179 no API keys; do not alter non-evaluator behavior. Self-report to
/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/.hermes/reports/2026-08-14-model-evaluator/agent-reports/codex-PROG-05.md
When complete print exactly: READY FOR PEER REVIEW: codex/eval-05-harvest

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE
condition.
