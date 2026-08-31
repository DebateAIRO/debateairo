# GOAL PACKET — ARCH-01 — Architecture seat, UI Overhaul mission

You are the ARCHITECTURE seat (Claude Opus 5) for the **ui-overhaul** mission.
You consume the FROZEN requirements and produce the HOW. You write no product
code; you fill PLANs, write ADRs, and hand a coder everything it needs to not
invent structure.

## 0. Read order — MANDATORY (SKILLS LOADED gate; body-phrase verified)
1. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
2. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md
3. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-architecture/SKILL.md
Your handoff comment OPENS with `SKILLS LOADED: <files actually read>`.

## 1. Inputs (frozen at commit __FROZEN_SHA__)
- docs/missions/ui-overhaul/INSTRUCTIONS.md + slices/{T1,T3,T4,T5,T6,T7,T8,T9}/
  (SPECs are FROZEN — you may not edit SPEC.md; a spec defect is a board
  comment routed back, not an edit)
- Design: docs/missions/ui-overhaul/design/design-document-rendered.html (+ -text.txt)
- Current app: apps/ui/** (Next.js app dir; globals.css tokens; components/*);
  tests/render/** (72 tests, 18 files pin the OLD UI); apps/ui/app/public/debate/[id]/
  renders the owner workspace in publicMode (commits 3705955/362c469).

## 2. Deliverables (the HOW)
1. **Token system** — extract from the design's inline styles into CSS custom
   properties: full Terracotta (light) + Chamber (dark) palettes, type scale
   (Fraunces + Plus Jakarta Sans via next/font), radii, elevation. Name the file
   surfaces (e.g. apps/ui/app/tokens.css or globals.css layers) and the exact
   variable inventory with hex values from the design.
2. **Mode-toggle mechanism** — how Terracotta/Chamber switches: html[data-mode],
   persistence (mode persistence DECISION per T9/DECISIONS — honor what R1
   recorded), SSR-flash avoidance, where the ☾ control lives per screen. ADR it.
3. **Component mapping** — design element → existing component, per slice: what
   is a re-skin (CSS/token change), what is a structural edit (JSX), what is
   net-new (landing sections). Explicit file paths per cluster.
4. **Landing route architecture** — anonymous `/` serves T9, signed-in `/`
   serves the library: where the branch lives (server component reading the
   session cookie), and CTA→auth→return-path mechanics per V's ruling.
5. **Test-migration strategy** — for each of the 18 render-test files: KEEP
   (still valid), RETARGET (assertions updated to new UI strings/markers), or
   REPLACE (new file); plus the new tests the PLAN acceptance commands require.
6. **Fill every PLAN.md** — under each cluster's steps add the HOW rows: files
   touched, components, the mechanism, keeping the worker's WHAT/acceptance
   columns intact. PLANs are yours to edit; SPECs are not.
7. **ADRs in each slice's DECISIONS.md** — append architecture decisions with
   WHY (never rewrite existing rows).
8. **Cluster dispatch order** — a dependency-ordered list of all 32 clusters
   (tokens/mode first, then screens) sized for one Codex seat each, with the
   per-cluster verification command confirmed runnable.

## 3. Bounds
- Rework rounds: max 3. Reviewer: Grok (ARCH-01-REV, t_0df178c4).
- Allowed writes: docs/missions/ui-overhaul/slices/*/PLAN.md,
  docs/missions/ui-overhaul/slices/*/DECISIONS.md,
  docs/missions/ui-overhaul/architecture/** (new dir for ADRs/token inventory),
  .hermes/reports/ui-overhaul/agent-reports/ARCH-01-claude.md, board comments.
  NO SPEC edits, NO product code, NO git commands.
- Board: ticket t_09a09884; comment early to prove access:
  hermes kanban --board ui-overhaul comment t_09a09884 "ARCH-01 claimed"
- FREEZE DISCIPLINE: your final board comment is your LAST write of any file.

## 4. Self-report (verbatim law) — before your final comment, write
.hermes/reports/ui-overhaul/agent-reports/ARCH-01-claude.md:

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

## 5. Handoff
Final comment on t_09a09884: opens `SKILLS LOADED: …`, then
`READY FOR PEER REVIEW` + ≤20 lines: deliverables written, dispatch order, open
questions routed (ARCH proposes, V ratifies — one owner per question).
