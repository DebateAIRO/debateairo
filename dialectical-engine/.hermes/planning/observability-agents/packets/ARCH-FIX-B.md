# PACKET ARCH-FIX-B — the FixAgent plan (mission `observability-agents`)

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md`, then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/00-intake-H0.md` (the ROSTER CHANGE section is why you are Opus 5).

## 1. Ticket state
- **board:** `observability-agents` · **ticket:** `t_0c9023e6` · **seat:** ARCH-FIX-B · **role:** architecture (`heartbeat-architecture`) · **model:** Fable 5.1 · **rework rounds: max 3**
- **session:** record in your CLAIM comment · **comment cursor at dispatch:** 0 · **review route:** `t_a49d8fc4` (Codex Sol Max, cross-house — you author, the other house probes)
- **your slices:** FIX-09, FIX-10, FIX-11, FIX-12, FIX-13, FIX-14, FIX-15 (the loop band: the listener daemon, the kill switch, ticket filing, diagnosis proposals, approval-first fixes, the V-gated QUICK arm, and Hatchet ingest)
- **allowed (exhaustive):**
  - `docs/missions/observability-agents/slices/<each of your slices>/PLAN.md` — fill the steps and clusters; the SPEC-trace rows are yours to COMPLETE, never to delete or renumber
  - `docs/missions/observability-agents/slices/<each of your slices>/DECISIONS.md` — append only
  - `docs/missions/observability-agents/architecture/FixAgent/` — `PLAN-OVERVIEW.md` (see §3 A0), `ADR-*.md`, `cluster-map.md`, `mission-graph.md`
  - `.hermes/reports/observability-agents/agent-reports/ARCH-FIX-B.md` (self-report)
  - `.hermes/TOOLING-TRAPS.md` (append only) · comments on `t_0c9023e6` (`--author ARCH-FIX-B`)
  - All paths above are relative to `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/`; use it as your working directory.
- **forbidden:** every `SPEC.md` (FROZEN — a needed change goes up as a proposed SPEC v2 in your handoff, never as a quiet edit) · every other slice's files, including the other architecture seats' slices · all product code and tests (you write none and run none) · the security zone (COMMON §3) · git writes · the requirements files (another seat's output).

## 2. Upstream artifacts (absolute paths; working directory `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`)
1. Your slices' `SPEC.md` — frozen, the WHAT. And their `DECISIONS.md` — settled is settled.
2. `docs/missions/observability-agents/requirements/fixagent.md` — the product requirements the SPECs project, including its contested-decision rows and findings.
3. `docs/missions/observability-agents/requirements/fixagent-compass-block.md` — the one-line V acceptance per slice and the parallel-safety notes.
4. `docs/missions/observability-agents/requirements/fixagent-state-audit.md` — **measured tree state, and it binds you**: §A what landed vs what is absent, §B the six pre-existing red tests (S06 ×4, S04 ×2) and the 133/139 suite, §C `pnpm audit:source` blocking=3 and `pnpm typecheck` 8 diagnostics (all in `tests/unit/s14-ui.test.ts`, none in obs paths), §D the stage-16 demo-rule defect, §F the RP-0 derivation. **A cluster command whose baseline is already red must say so and assert the delta, not the absolute.**
5. Repo law: ADRs in `docs/architecture/01-decisions/` (0015–0018 are current), module design `docs/architecture/03-module-design.md`, build order `07-build-order.md`, test strategy `06-test-strategy.md`, `.hermes/TOOLING-TRAPS.md` (read before you start).
6. `docs/missions/observability-agents/V-DECISIONS-PACKET.md` — rows V-1..V-6, plus the product's own rows. A step gated on a V row is planned, marked GATED, and never guessed.
7. **The autonomy laws are the heart of your band.** C1 (V's *"initially I want to be in charge of everything"*) means phase 1 proposes and waits — FIX-14's QUICK arm ships OFF and only V's own re-pin flips it. The immutable high-risk floor (security/auth, migrations, provider spend, scoring semantics, live data, destructive or architectural work) is ALWAYS escalate-only for this agent. DR-179 bounds how the diagnosis step may reach a model at all. Plan the kill switch (FIX-10) so it works with Postgres down. Read board `observability-loop` `t_40c2cc1b` (the D12 demo contract) — the demo is how V judges this band.

## 3. What you produce
**A0 · `architecture/FixAgent/PLAN-OVERVIEW.md` — THE PLAN FOR THIS AGENT.** V asked for a plan per agent and this file is it, so write it for a reader who has not read the requirements: what the agent IS in five lines · its processes, modules and their boundaries · its data (schema, tables, views, migrations — allocate NO migration numbers yourself, request them in your handoff) · its interfaces with the other two agents, quoted from both sides · its configuration and how V controls it · the **build order** across your slices with what each one makes true · the **parallelism map** (which slices run in separate worktrees at the same time, and the file surfaces that force any serialization) · the standing risks and what each is bounded by. Diagrams as Mermaid where they earn their place.

**A1 · PLAN.md steps, per slice.** Finite, categoric, mechanically checkable; each step names its cluster, its acceptance test as a file path plus the assertion, and its file surface. Banned words: improve, better, robust, handle, appropriate. NO line cap; never merge two steps to shorten a file. Every step traces to a SPEC sentence, every SPEC requirement is covered by at least one step, counts stated both ways.

**A2 · Cluster map, per slice** (`<SLICE>-C1…`): the smallest step-group verifiable independently, ONE verification command each, its mutant class, its file surface. **Every command must actually RUN on this tree — execute each one once and record its exit code and first output line; a command that crashes is BROKEN, not RED** (the repo has paid for this: `vitest --reporter=basic` was removed and 32 plan commands cited it, and a gate scored the crash as healthy evidence). Single-writer rule: no two concurrent slices own the same file — check across the whole mission's slice list, not just your own, and name every overlap.

**A3 · Boundaries and DDD.** Bounded contexts touched, invariants owned, domain terms introduced, and the exact `forbidden` set the coder packets will carry. Make the standing laws concrete as paths: C3 standalone (own process, own start/stop/kill, cannot take the product down), the zone rule, C1 approval-first, DR-179, DR-188, privacy.

**A4 · DECISIONS.md lines** for every choice, appended the same day, one line each: date · question · choice · reason · who ruled.

**A5 · ADR drafts** under `architecture/FixAgent/` for decisions that outlive the mission (a new daemon, a new schema, a new dependency, a new protocol). Repo-wide adoption is the orchestrator's to route; you draft.

**A6 · Refutation table** (`heartbeat-architecture` §3): per step, the concrete failure its criterion catches AND one it does not; per cluster, the mutant class its command detects. A plan whose steps cannot fail is a wish list.

**A7 · Coder-packet inputs**, one block per cluster: the exact `allowed` and `forbidden` lists, the base commit, the cluster commands, and every constant a Codex seat must TRANSCRIBE rather than compute (with the source of each).

**A8 · `mission-graph.md`** for your product: nodes, edges, worktree per slice, merge order, and the V test point after each slice.

## 4. Handoff
`READY FOR PEER REVIEW` on `t_0c9023e6`, OPENING with `SKILLS LOADED: <list>` — your floor is `superpowers:brainstorming` THEN `superpowers:writing-plans`, in that order, because brainstorming after the plan is written is theatre. Then carry: the SPEC↔PLAN trace counts both ways per slice · the cluster map with each command's OBSERVED exit code · the boundary statement · the refutation table · every DECISIONS line appended · any proposed SPEC v2 text · migration numbers requested · `comments read through: <n>`. File your self-report (COMMON §5) first. Then stop.

## 5. Stop conditions
COMMON §6, plus: a contradiction between two SPEC requirements STOPS the plan for that slice — write it up as a V DECISIONS row with your recommendation and continue with the other slices.
