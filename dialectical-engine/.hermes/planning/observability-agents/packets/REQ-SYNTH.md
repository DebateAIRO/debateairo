# PACKET REQ-SYNTH — mission compass and cross-product contradiction check (mission `observability-agents`)

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md`, then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/00-intake-H0.md`.

## 1. Ticket state
- **board:** `observability-agents` · **ticket:** `t_63e08f55` · **seat:** REQ-SYNTH · **role:** requirements (`heartbeat-requirements` §1 — the COMPASS) · **model:** Fable 5.1 (Claude subagent) · **rework rounds: max 3**
- **session:** record in your CLAIM comment · **comment cursor at dispatch:** 0
- **review route:** the three ARCH seats consume INSTRUCTIONS.md and file defects against it; a REQ-REV-SYNTH lens is dispatched only if the orchestrator elects one.
- **allowed (exhaustive):**
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/INSTRUCTIONS.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/cross-product-contradictions.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/REQ-SYNTH.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` (append only)
  - comments on `t_63e08f55`
- **forbidden:** everything else. You do not edit any product requirements file, any slice file, or any review. No git writes.

## 2. Upstream artifacts (absolute paths) — all three products have passed review or closed rework when you are dispatched
- `docs/missions/observability-agents/requirements/{fixagent,observationagent,supportagent}.md` and their `*-compass-block.md`
- `docs/missions/observability-agents/slices/*/SPEC.md` (slice codes, names, one-line V acceptance)
- `docs/missions/observability-agents/reviews/REQ-REV-{FIX,OBS,SUP}.md` (verdicts; any N-findings still open are listed there)
- `docs/missions/observability-agents/V-DECISIONS-PACKET.md` and the ticket `t_a273e880` comments (V's rulings, if posted)
- The reference compass: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/ui-overhaul/INSTRUCTIONS.md` (shape only)

## 3. The work
**S1. INSTRUCTIONS.md — UNDER 100 LINES, hard cap** (`heartbeat-requirements` §1): what the mission is (≤5 lines, V's words) · Done in V's terms (approval-first; three standalone products; Done on a slice = V's veto) · the slice list, ONE line per slice across all three products (code, name, what V will see) · roster and review route (REQ/ARCH/REVIEW Fable 5.1, CODE Codex gpt-5.6-sol, QA V) · a TABLE OF CONTENTS of pointers into real files (H0, V packet, each requirements file, each slice dir, packets dir, reports dir, spine, role contracts, the predecessor mission dir, the demo) · standing laws BY NAME with a pointer to the spine and COMMON. Pointers, never content. Count the lines and print the count in your handoff.
**S2. Cross-product contradiction check** — `requirements/cross-product-contradictions.md`: diff the FixAgent Q2 input contract against the ObservationAgent Q2 detection contract (field by field); check the SupportAgent's "known incident" source against what the ObservationAgent actually publishes; check that "standalone" is defined identically (C3) in all three; check every product's contested-decisions table against H0 and the V packet for duplicates or already-ruled rows; check slice-code uniqueness and single-writer safety ACROSS products (two slices in different products naming the same file surface is a finding). Every contradiction quoted both sides with `path:line`, plus your recommended disposition; each one goes to the orchestrator for a ticket the same day.
**S3. Board shape input** — a table the orchestrator turns into slice tickets: slice code · title · product · absorbs (predecessor ticket ids, FIX only) · depends-on (slice codes; "none" preferred) · first V test point.

## 4. Handoff
`READY FOR PEER REVIEW` on `t_63e08f55`, OPENING with `SKILLS LOADED: <list>` (floor: `brainstorming` — yes, even for a compass: the slice ordering and the Done statement are choices), then: INSTRUCTIONS.md line count (must be ≤100) · the S3 table · the contradiction count with ids · `comments read through: <n>`. Self-report first (COMMON §5). Stop. COMMON §6 applies.
