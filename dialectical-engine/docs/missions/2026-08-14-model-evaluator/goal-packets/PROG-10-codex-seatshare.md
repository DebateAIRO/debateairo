# Goal packet PROG-10 — Codex lane: eval-10-seatshare (PROGRAMMING loop, tier 6B)

Mission: model-evaluator. Seat: Codex implementation lane. Parallel with lane 09 —
lane 09 owns consumer-reader files; stay off them; shared type changes route up.
Worktree (work ONLY here): /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-10-seatshare
Working directory inside it: DebateAI-V3/. Branch: codex/eval-10-seatshare.
Base: all lanes through 07 merged (08 metering long merged).

Read first (ABSOLUTE paths, read-only):
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md (§6 dark-launch mechanics, §7 tier-6B row, §8)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md (§8 seat-share FRs incl. FR-8.0 panel-shape blocker, ruling 8, FR-0.1, FR-0.6 AC5)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/wayfinder/issues/10-seat-share-allocator-dark.md (its Programming-stage selector wiring constraints are BINDING on you)

## Deliverables (lane row tier 6B)

The deterministic seat-share allocator, CODED DARK: seats per (rank, cost, tier)
per ruling 8 — premium (high-stakes + big depth) gives most seats to the
better-ranked model for the domain, fewer to the runner-up; if the better model
is also cheaper (lane 08's relative-cost signal), both tiers mostly use it.
M=1/2/3 allocation tests. SHADOW RECEIPTS: on real admissions the allocator may
compute what it WOULD have done and persist shadow decisions — but NOTHING
dispatches from it (FR-0.1); no live call site exists (grep-provable + test).
FR-8.0 blocker named in outputs: live integration requires the panel-shape
change (agent_count identity, PANEL-01) which is OUT of this lane's scope.
Deliver the bind-readiness checklist V reviews at go-live.

## Binding wiring constraints (from ticket 10 / lane-06 N5 / PROG-04 F3)

- Never construct a ProviderGateway over the evaluator repository pool (nested
  checkout deadlock at concurrency >= max-1); separate pool or threaded client.
  (You likely need no gateway at all — the allocator is deterministic code.)
- The composition root must source the evaluator isolation set from the register
  before any bind — put this ON the bind-readiness checklist, do not wire it.

## Merge gate

No live call site (grep + test); shadow-decision persistence tests; M=1/2/3
formula tests with hand-computable expectations; FR-8.0 blocker named; all
differentials green; typecheck. Pin clocks; real write paths in fixtures; no
vacuous assertions.

## Constraints

Commit locally on your branch; NO push; no board mutations; no BOUND state
anywhere; DR-179. Self-report to
/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/.hermes/reports/2026-08-14-model-evaluator/agent-reports/codex-PROG-10.md
When complete print exactly: READY FOR PEER REVIEW: codex/eval-10-seatshare

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE
condition.
