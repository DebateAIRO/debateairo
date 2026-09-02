# PACKET REQ-REV-OBS — blind review of the ObservationAgent requirements (mission `observability-agents`)

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md`, then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/00-intake-H0.md`.

## 1. Ticket state
- **board:** `observability-agents` · **ticket:** `t_f1236b44` · **seat:** REQ-REV-OBS · **role:** reviewer (`heartbeat-reviewer`) · **model:** Fable 5.1 (Claude subagent) · **round:** 1 of max 3
- **session:** record in your CLAIM comment · **comment cursor at dispatch:** __CURSOR__ (on the AUTHOR's ticket `t_3af6affd`; read every comment through it)
- **the work under review:** seat REQ-OBS, ticket `t_3af6affd`, artifacts below. You are BLIND to the other two product reviewers and must not read `docs/missions/observability-agents/reviews/REQ-REV-*.md` other than your own.
- **allowed (exhaustive):**
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/reviews/REQ-REV-OBS.md` (your verdict)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/REQ-REV-OBS.md` (self-report)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` (append only)
  - comments on `t_f1236b44` (CLAIM, BLOCKED) and ONE verdict comment on the author's ticket `t_3af6affd` (pass `--author REQ-REV-OBS`)
- **forbidden:** everything else. You never edit the work under review. No git writes. No code. Read-only across the repo.

## 2. Artifacts under review (absolute paths)
1. **The packet that dispatched the author — review it FIRST** (`heartbeat-reviewer` §1): `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/REQ-OBS.md` and `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md`. Check every quoted constant against reality (tree state, ticket ids, paths, "no /metrics anywhere", the demo numbers in H0), the `allowed` list against the deliverables demanded, and that every path resolves. A packet defect is a finding against the ORCHESTRATOR's packet, filed in your verdict like any other.
2. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/observationagent.md`
3. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/observationagent-compass-block.md`
4. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/slices/OBS-*/{SPEC,PLAN,PROGRESS,DECISIONS}.md`
5. The author's handoff comment on `t_3af6affd` and self-report `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/REQ-OBS.md`.
6. V's verbatim goal and the contradiction table (H0) — the requirements must satisfy V's words, not the predecessor's.

## 3. Probes — build your own, never nod at the author's (`heartbeat-reviewer` §2)
P1 **Stranger test, exhaustively:** every SPEC acceptance step and every PLAN-scaffold trace row — can V, with no context, run it in the real dev stack and observe the stated result? List every step that fails the test (file:line).
P2 **Banned words:** `grep -nE 'improve|better|robust|handle|appropriate' ` over the artifacts — every hit in a requirement or criterion is a finding.
P3 **Trace equality:** per slice, requirement count vs PLAN-scaffold trace rows; per requirement, ≥1 row; per row, a SPEC sentence.
P4 **Contradiction hunt:** within the product file; against H0's C-table dispositions; against V's verbatim goal; against COMMON §3 standing law (DR-179, DR-188, privacy, zone, high-risk floor). Quote both sides of each.
P5 **Citation audit:** pick ≥10 `path:line` citations at random (state your selection method) and verify each; a fabricated citation is a B-finding.
P6 **Vertical-slice law:** each slice has a beginning and an end V can exercise; `OBS-01` is the smallest complete end-to-end proof; parallel-safety claims (single-writer) are checked against the file surfaces named.
P7 **Freeze and format law:** SPEC frozen header; PLAN scaffold only (no steps written by the requirements seat); PROGRESS empty skeleton; DECISIONS append-only and seeded; compass block ≤25 lines; exact output-skeleton headings present.
P8 **Author's `SKILLS LOADED`** vs the requirements floor (`brainstorming`) — missing line or missing floor skill is a finding; a named-but-not-loaded skill is a fabrication finding (grep the author's transcript only if the orchestrator hands you a path; otherwise judge the line and mark the load UNVERIFIED).
P8b **Sub-delegation:** if the author fanned out (COMMON §3 grants read-only search children only), its handoff must carry `## Sub-delegation receipts`; judge whether every child claim used in the artifact is verified by the author at `path:line` (sample five), whether the children wrote nothing, and whether they ran on Fable (`model: "fable"`) — a child on another model is a roster finding against the author, not the orchestrator. Known at dispatch: REQ-SUP spawned three `Explore` children on model `opus` at 23:41 (ids a085f12963927c6cc, a40bd49ad9f2da6e2, af6f2f68214726cd7, metadata under `~/.claude/projects/-Users-vladmihaimiron-Documents-DebateAIRO/6238e708-3fe9-4c90-be02-a517b6ca3072/subagents/`); REQ-FIX, REQ-OBS and AUDIT-STATE spawned none.
P9 **Self-report bar** (COMMON §5): cause not symptom, priced, near-misses, dead ends, packet ambiguities named — anodyne = finding.
P10 **Contested decisions:** each row has options, pick, confidence, strongest counter; nothing is asked of V that DECISIONS/H0 already answers.

## 4. Verdict — `reviews/REQ-REV-OBS.md` (exact headings)
```
# REQ-REV-OBS — verdict on ObservationAgent requirements (round 1)
SKILLS LOADED: ...
## Verdict: PASS | REWORK | BLOCKED
## Packet review (P-findings against the orchestrator's packet)
## Blocking findings B1…       (file:line · failure scenario as concrete input → wrong outcome · evidence)
## Non-blocking findings N1…   (same shape; each one becomes a same-day ticket)
## What I verified and how      (probe · parameters · output verbatim)
## What I did NOT verify
## Predictions                  (what I expect the other two product reviewers and the synthesis seat to trip on)
## comments read through: <n>
```
Post the whole verdict as ONE comment on `t_3af6affd` (`--max-len 80000`), and a one-line pointer on `t_f1236b44`. Never "pass with concerns" — concerns are N-findings. If your REWORK would be round 4, mark it for the V DECISIONS PACKET instead.

## 5. Handoff and stop
Self-report first (COMMON §5), then `READY FOR PEER REVIEW` on `t_f1236b44` opening with `SKILLS LOADED`. Stop. COMMON §6 applies; `BLOCKED` if an artifact under review is missing — name it.
