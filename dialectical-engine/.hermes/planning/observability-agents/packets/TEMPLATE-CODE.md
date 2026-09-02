# PACKET CODE-__SLICE__-__CLUSTERS__ — Codex coding seat (mission `observability-agents`)

Read FIRST, in full, as markdown: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md` · then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/INSTRUCTIONS.md` · the slice `SPEC.md` (never edit) · `PLAN.md` (the steps you own: __STEPS__) · `DECISIONS.md` · your ticket's comments through the cursor.
Skills (you cannot invoke them — READ these files in full): `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`, `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-worker/SKILL.md`, and under `~/.claude/plugins/cache/claude-plugins-official/superpowers/<newest version>/skills/`: `test-driven-development`, `verification-before-completion`, `systematic-debugging`, `receiving-code-review` (on rework). List them in `SKILLS LOADED`.

## 1. Ticket state
- **board:** `observability-agents` · **ticket:** `__TICKET__` · **slice ticket (V's):** `__SLICE_TICKET__` · **seat:** CODE-__SLICE__-__CLUSTERS__ · **role:** worker · **model:** codex gpt-5.6-sol @ xhigh · **rework rounds: max 3**
- **worktree (your cwd, never leave it):** `__LANE__` · **branch:** `__BRANCH__` · **base commit:** `__BASE__` (verify with `git rev-parse HEAD` before anything; a mismatch is a packet defect — report and stop)
- **comment cursor at dispatch:** __CURSOR__ · **review route:** CODE-REV-__SLICE__-__CLUSTERS__ (Fable 5.1, blind, separate worktree)
- **clusters you own:** __CLUSTERS__ — verification commands and file surfaces are in PLAN.md §clusters; run each THREE times, worst run is the verdict.
- **allowed (exhaustive, relative to the lane):** __ALLOWED__ · plus `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/CODE-__SLICE__-__CLUSTERS__.md` (self-report, written in the MAIN tree path given) · `.hermes/TOOLING-TRAPS.md` (append only) · comments on `__TICKET__` (`--author CODE-__SLICE__-__CLUSTERS__`)
- **forbidden:** __FORBIDDEN__ · the security zone (COMMON §3) · every other slice's file surface · `tools/**` · migrations outside your allowed list · protocol docs and skills · any push, merge, Done, ticket split, branch or worktree operation.

## 2. The work
Implement exactly the PLAN steps named above, RED first (`heartbeat-worker` §2 refutation duty: property → mutant → RED → revert → GREEN → neighbouring mutant not caught; print `git status --porcelain` after every restore). Constants you must TRANSCRIBE, never compute: __CONSTANTS__. Gates before handoff: `pnpm generate:contract && pnpm typecheck` (repo-wide; report exit + diagnostic count, positively assert zero module-resolution escape), the cluster commands ×3, and `pnpm audit:source` if any file under `packages/**` changed (report the `blocking` array verbatim). Commit on `__BRANCH__` ONLY when all owned clusters are GREEN on the worst run, message `__COMMIT_MSG__`; never amend a reviewed commit.

## 3. Handoff
`READY FOR PEER REVIEW` on `__TICKET__`, OPENING with `SKILLS LOADED`, then every RED frame · suites as `passed/total` (failures named, pre-existing dated) · the three-run cluster table · constants disclosed · refutation evidence · packet defects · unexpected findings (file:line) · the commit sha · `comments read through`. Self-report first (COMMON §5). Stop.
