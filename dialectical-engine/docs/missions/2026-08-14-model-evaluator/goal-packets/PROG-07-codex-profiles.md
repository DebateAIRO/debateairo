# Goal packet PROG-07 — Codex lane: eval-07-profiles (PROGRAMMING loop, tier 5)

Mission: model-evaluator. Seat: Codex implementation lane.
Worktree (work ONLY here): /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-07-profiles
Working directory inside it: DebateAI-V3/. Branch: codex/eval-07-profiles.
Your base includes all merged lanes (foundation, domains+seed, metering, tagger,
harvest, add-on pass).

Read first (ABSOLUTE paths, read-only; mission docs are not in your worktree):
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md (§3 profile/rank tables, §5, §7 tier-5 row, §8)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md (§5 bias/prowess FRs, charting ruling 5 bias-first, FR-0.x)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/wayfinder/issues/07-bias-metrics-and-prowess-aggregation.md (note its Programming-stage handoff)

## Deliverables (lane row tier 5)

Deterministic derivations (ALL math is code, no LLM) into the evaluator profile
tables: per-judge BIAS cells — leniency (judge's grades vs panel median on the
same items) and settlement-contradiction rate (extending the disagreement-rate
monitor pattern in packages/settlement), lineage-favoritism as a monitor; per-model
PROWESS cells per (domain, step) with sample counts and intervals; rank snapshots.
Versioned by derivation_version so history is never corrupted by metric changes.
An isolated judge selector (rank-and-select per ruling 5: repeatedly-biased judges
rank lower; only the best get used) — CODED, NOT BOUND: the selector must have
zero production callers (dark-launch law; merge gate names this explicitly).

## Mandatory handoffs (board + ticket carry them)

1. REPLACE, never pool: for a settlement observation with supersedes_observation_id,
   the named consensus observation is REPLACED in every aggregation — never
   averaged, pooled, or double-counted. The superseded row stays as audit history
   only. Test with mixed consensus+settlement fixtures.
2. Superseded-row semantics from lane 05: consensus strength and settlement
   outcome share metric names with different value semantics — never mix them in
   one aggregate.
3. Bias-first ordering (ruling 5): bias cells derive before prowess cells in the
   pipeline; prowess derivations that read judge-dependent inputs must be able to
   see the bias ranking of the judges that produced them.

## Merge gate

Derivation-version and rank-change tests; replace-not-pool tests; selector stays
UNBOUND (grep-provable zero production call sites, plus a test); FR-0.6 AC5 and
the lane-04/05/06 differential suites stay green; repository typecheck. Pin every
clock in fixtures (no time bombs); no vacuous self-referential assertions — every
ceiling/threshold test must exercise the real code path on live Postgres.

## Constraints

Commit locally on your branch; NO push; no board mutations; no BOUND state;
DR-179 no API keys; do not alter non-evaluator behavior. Self-report to
/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/.hermes/reports/2026-08-14-model-evaluator/agent-reports/codex-PROG-07.md
When complete print exactly: READY FOR PEER REVIEW: codex/eval-07-profiles

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE
condition.
