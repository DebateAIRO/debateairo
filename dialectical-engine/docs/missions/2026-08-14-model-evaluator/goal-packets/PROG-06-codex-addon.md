# Goal packet PROG-06 — Codex lane: eval-06-addon (PROGRAMMING loop, tier 4)

Mission: model-evaluator. Seat: Codex implementation lane.
Worktree (work ONLY here): /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-06-addon
Working directory inside it: DebateAI-V3/. Branch: codex/eval-06-addon.
Your base includes merged foundation + domains + metering + tagger + harvest.

Read first (ABSOLUTE paths, read-only; mission docs are not in your worktree):
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md (§4, §5, §7 tier-4 row, §8)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md (§4 add-on pass FRs, FR-0.x)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/wayfinder/issues/06-judge-grading-addon-pass.md (note its Programming-stage handoff)

## Deliverables (lane row tier 4)

The one dedicated evaluation pass: after harvest, judges' gradings themselves get
graded — a DIFFERENT-LINEAGE grader model, authorship stripped before the grader
sees anything (blinding via the foundation's blind DTO), ONE bounded pass per run
(not a re-benchmark). Sampling policy to control subscription spend (design the
policy per the FRs; every-run vs every-Nth configurable, collect-only default).
Grades write as evaluator-owned observation rows (step JUDGING, dedicated
metric). DB maker guard: composes with the different-maker law — the grader can
never be the graded judge's maker, enforced at write time.

## Mandatory constraints from prior rulings (board + tickets carry them too)

1. Retry bounds are YOURS: evaluator provider calls are null-run-scoped, so the
   product run's attempt counter gives you nothing (PROG-04 Hermes ruling). Bound
   the pass's calls and retries explicitly, with tests.
2. Null-run scope law: your grader calls go through the provider gateway with
   runId null + evaluator-scoped subjectItemId, exactly like the tagger — zero
   product budget/liveness/digest influence (the FR-0.6 AC5 differential and the
   lane-04 decoupling tests must stay green).
3. When wiring callers into harvest-side repositories: validate inputs BEFORE
   the strike-bearing try (or use reasons the parking selector does not count) —
   a caller bug must not consume a run's harvest retry budget (lane-05 seat-B
   finding).
4. Isolation assert before any model call (assertEvaluatorProviderIsolation
   pattern from the tagger).

## Merge gate

Blinding tests (grader payload contains no maker/provider/model identity of the
graded artifacts); same-maker refusal tests (DB-level + code-level); bounded-pass
tests (call count ceiling, bounded retries); FR-0.6 AC5 + lane-04 differentials
green; repository typecheck.

## Constraints

Commit locally on your branch; NO push; no board mutations; no BOUND state;
DR-179 no API keys; do not alter non-evaluator behavior. Self-report to
/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/.hermes/reports/2026-08-14-model-evaluator/agent-reports/codex-PROG-06.md
When complete print exactly: READY FOR PEER REVIEW: codex/eval-06-addon

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE
condition.
