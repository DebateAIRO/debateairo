# Goal packet PROG-02 — Codex lane: eval-02-foundation (PROGRAMMING loop, tier 0)

Mission: model-evaluator. Seat: Codex implementation lane (roster R4: sole coder).
Your worktree (work ONLY here): /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-02-foundation
Your working directory inside it: DebateAI-V3/. Your branch: codex/eval-02-foundation.

NOTE: mission docs are not yet committed, so they are NOT in your worktree. Read
them at these ABSOLUTE paths (read-only):
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md
  (binding design: §1 module home/seams, §2 boundary contract, §3 migration spec,
  §4 purpose-separated vLLM path, §6 dark-launch mechanics, §7 your lane row, §8
  acceptance map)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md
  (APPROVED FRs; FR-0.x cross-cutting invariants bind you, esp. FR-0.1 dark-launch
  and FR-0.6 AC5 panel isolation)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/wayfinder/issues/02-evaluator-module-skeleton.md

## Deliverables (lane table row, tier 0)

Per Architecture §7 lane `codex/eval-02-foundation` (scope: wayfinder 02 + OQ12/FR-0.6):
package/app scaffold for the evaluator module; the evaluator schema migration
(verify the next free migration number in migrations/ — architecture says 0023 —
with append-only triggers and grants per §3); register readers; pinned local
family; health/catalog/enumeration; collision assertions; binding resolver
(default UNBOUND); shared blind DTO.

Merge gate you must satisfy in-lane: module boundary respected, DB migration
tests, and the PANEL-ISOLATION DIFFERENTIAL TEST (panel membership and
agent_count identical with the evaluator vLLM path configured-and-healthy versus
absent — FR-0.6 AC5).

## Constraints

- Tests first where practical; every deliverable lands with focused tests;
  repository typecheck must pass.
- Commit locally on your branch in your worktree; small, honest commits. NO push.
  NO board mutations. NO BOUND state anywhere. DR-179: no API keys. Do not alter
  non-evaluator behavior (the differential test proves it).
- Migrations are hand-written SQL in migrations/ following the existing style
  (triggers, grants) — never drizzle-kit generated.
- File your self-report (10-20 honest lines + token basis) to
  /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/.hermes/reports/2026-08-14-model-evaluator/agent-reports/codex-PROG-02.md
- When complete (all tests green, typecheck clean, committed), print exactly:
  READY FOR PEER REVIEW: codex/eval-02-foundation

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE
condition.
