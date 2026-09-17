# PACKET ARCH-__SLICE__ — architecture for slice __SLICE__ (mission `observability-agents`)

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md`, then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/INSTRUCTIONS.md`.

## 1. Ticket state
- **board:** `observability-agents` · **ticket:** `__TICKET__` · **slice ticket (V's, never yours to move):** `__SLICE_TICKET__` · **seat:** ARCH-__SLICE__ · **role:** architecture (`heartbeat-architecture`) · **model:** Fable 5.1 · **rework rounds: max 3**
- **session:** record in CLAIM · **comment cursor at dispatch:** __CURSOR__ · **review route:** ARCH-REV-__SLICE__ (Fable 5.1, blind; also reviews this packet)
- **allowed (exhaustive):**
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/slices/__SLICE__/PLAN.md` (fill the steps and clusters — the scaffold's SPEC-trace rows are yours to complete, never to delete)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/slices/__SLICE__/DECISIONS.md` (append only)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/architecture/__SLICE__/` (ADR drafts, the cluster map, the mission-graph fragment)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/ARCH-__SLICE__.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` (append only) · comments on `__TICKET__`
- **forbidden:** SPEC.md (frozen — a needed change goes up as a proposed SPEC v2 in your handoff), all product code and tests, every other slice's files, the security zone, git writes.

## 2. Upstream (absolute)
The slice `SPEC.md` (frozen) · `DECISIONS.md` (settled is settled) · the product requirements file named in INSTRUCTIONS · the review verdict on those requirements (`docs/missions/observability-agents/reviews/REQ-REV-__PRODUCT__.md`, open N-findings bind you) · repo ADRs `docs/architecture/01-decisions/` and module design in `docs/architecture/` · `.hermes/TOOLING-TRAPS.md` · the predecessor's contracts where the slice absorbs them (SPEC lists them): `docs/missions/2026-08-21-observability-loop/planning/{VerticalSlices,L2-ADDENDUM-PLAN,FinalPlan}.md`, and the seam obligations on `observability-loop` `t_3a04cc06` (O-1..O-4) for anything touching capture runtime.

## 3. The work (`heartbeat-architecture` §2–§3)
A1 PLAN.md steps: finite, categoric, mechanically checkable; each names its cluster, acceptance test (a file path and assertion), and file surface; banned words apply. No line cap; never merge steps.
A2 Cluster map `__SLICE__-C1…`: ONE verification command each (must RUN on this tree — prove it by running it once and quoting the exit, a crash is not RED), the mutant class it detects, its file surface; single-writer across concurrent slices (check INSTRUCTIONS' slice list for overlaps and name them).
A3 Boundaries: bounded contexts touched, invariants owned, domain terms introduced, the `forbidden` set for the coder packets, the standalone rule (C3) and the zone rule made concrete as paths.
A4 DECISIONS lines for every choice, same day. An ADR draft when a decision outlives the mission (new dependency, new schema, new daemon, new protocol) — draft under `architecture/__SLICE__/ADR-*.md`; the orchestrator routes repo-wide ADRs.
A5 Refutation table: per step the concrete failure its criterion catches and one it does NOT; per cluster the mutant class.
A6 SPEC↔PLAN trace both ways, counts equal; contradictions STOP the plan and go up as V rows with your recommendation.
A7 Mission-graph fragment for this slice (nodes, edges, worktree, merge order) as text + a Mermaid/SVG file under `architecture/__SLICE__/`.
A8 Coder packet inputs: the exact `allowed`/`forbidden` lists, the base commit, the cluster commands, the constants (with sources) a Codex seat must transcribe rather than compute.

## 4. Handoff
`READY FOR PEER REVIEW` on `__TICKET__`, OPENING with `SKILLS LOADED` (floor: `superpowers:brainstorming` THEN `superpowers:writing-plans` — brainstorming after the plan is theatre), carrying: trace table · cluster map with commands and their observed exit codes · boundary statement · refutation table · every DECISIONS line appended · proposed SPEC v2 text if any · `comments read through`. Self-report first (COMMON §5). Stop.
