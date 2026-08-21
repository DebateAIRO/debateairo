# WAYFINDER MAP — observability-loop V-decision route
<!-- label: wayfinder:map | tracker: local-markdown (Hermes board wedged at charting time; custodian may adopt later if V orders) -->

## Destination

Every V-owned decision for mission `2026-08-21-observability-loop` resolved —
requirements spec accepted, launch blockers cleared — so the Heartbeat machine
can run ARCH → PROG → QA to the shipped observability layer + listener agent
with no V steering beyond spine-mandated gates.

## Notes

- Domain: DebateAI Graph Spine v2 mission (see `../00-intake-H0.md`); this map
  charts only the V-DECISION layer. The build itself belongs to the Heartbeat
  loops, never to map tickets.
- V's standing order for this effort (2026-08-21 /goal): work decision tickets
  interactively with V in-session ("continue this mission while asking me
  important questions") — the one-ticket-per-session pace is lifted by that
  order for launch-blocking tickets.
- Every grilling ticket follows V's style law: mechanism explained bottom-up
  with a concrete example before the ask; no internals assumed.
- V order 2026-08-21: GROK DECOMMISSIONED for this mission (limit reached) — all reviewer/slice seats are fresh independent Opus instances; grok blind-seat artifact (pre-decommission) stands.
- Skills per ticket type: /grilling + /domain-modeling (grilling), /research
  subagent (research), /prototype (prototype).

## Decisions so far

<!-- one line per closed ticket -->

- [T01 — Restart the wedged Hermes gateway](tickets/T01-restart-wedged-hermes-gateway.md) — premise corrected: Hermes agent OUT of this mission (Qwen, slow); Kanban store only; verification -> QA seats; integrity gate re-dispatched to Opus QA reviewer.
- [T02 — Synthesis before the integrity verdict](tickets/T02-synthesis-before-integrity-verdict.md) — yes: synthesis launched now; integrity verdict backfills from the QA reviewer.
- [T03 — Commit the great tree move](tickets/T03-commit-the-great-tree-move.md) — parked until right before the first coding lane of any mission (standing gate).
- [T04 — Observe which topology](tickets/T04-observe-which-topology.md) — both, post-Hatchet primary: neutral capture core, listener specified post-containerization, thin interim binding.

## Decisions so far — addendum

- [T05 — Craft the observability-loop board via kanban CLI](tickets/T05-craft-board-via-kanban-cli.md) — done store-only: board + 7 tickets + dependency chain live on 9119; global current-board pointer untouched.

- [T06..T13 — post-synthesis ruling batch](tickets/) — E1-E5 core + workflow, capture-limit, live-UI, zone-residue all RULED in-session; overlay at research/POST-SYNTHESIS-RULINGS.md; defaults adopted with V veto window; E6-15/E6-06 + channel + repoint deferred into ARCH charter.

## Not yet specified

- The contested-decision set E1–E6 (QUICK-FIX threshold, landing mechanics,
  listener runtime + budget, retention under DR-188, security-zone boundary
  rule, seat-surfaced extras) — graduates into tickets when the synthesis
  spec lands and dedupes the three seats' versions.
- Requirements-spec acceptance ritual: what V wants presented (full spec walk
  vs verdict summary + contested table only).
- ARCH entry: C2 planner charter, planning-diamond reviewers, planning-graph
  image gate presentation.
- Lane plan + worktree approval shape (blocked by "Commit the great tree
  move" resolving).
- Listener activation phase gates (capture-live → report-only → fix-authority)
  acceptance criteria.
- Whether this map migrates to the Hermes board once the gateway returns
  (narrowed by T01: board stays the tracker surface via CLI; open only
  whether wayfinder tickets ALSO move there).

## Out of scope

- The W.I.P. security features and everything inside their boundary
  (V's goal text; intake fact 6).
- docker-hatchet's own decision set — separate mission, its own orchestrator;
  only the COUPLING (topology/sequencing) is on this map.
- Offensive/pen-testing anything (V posture, defensive-only).
