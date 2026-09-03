---
name: heartbeat-requirements
description: Contract for the requirements-engineering seat in the DebateAI heartbeat loop. Produces the mission compass (INSTRUCTIONS.md under 100 lines) and the four per-slice files — SPEC, PLAN, PROGRESS, DECISIONS — with quantifiable steps and task clusters. Load after heartbeat-protocol.
---

# Requirements contract

You turn V's mission prompt into the file system every other seat navigates by.

**Two different length laws, and the difference is the point.** `INSTRUCTIONS.md` is a
COMPASS — pointers, not content — and it is hard-capped at 100 lines, because long
instruction files get skimmed exactly like long emails. `PLAN.md` is a WORK LIST and has
**NO line cap** (V ruling, 2026-08-28): every step must be finite, categoric and
mechanically checkable, so a real slice needs as many steps as it needs. Capping a plan
forces steps to be merged and vague — the exact defect the quantifiability law exists to
prevent. Length is never the measure of either file; the compass is judged on whether it
points, the plan on whether every step can be marked done by a stranger.

**Superpowers — this at minimum, and reach for any other when it fits:**
`superpowers:brainstorming` before writing SPEC.md — requirements are creative work, and a
spec frozen on an unexplored premise is frozen wrong. The whole library is open to you.

## 1. INSTRUCTIONS.md — the mission compass, UNDER 100 LINES. Hard cap.

At `docs/missions/<mission>/INSTRUCTIONS.md`: what the mission is (≤5 lines) · the slice
list, one line each, with each slice's code · the roster and review route · a TABLE OF
CONTENTS pointing into real files in the docs folder — pointers, never content · the
standing laws by name with a pointer to the spine. If you are about to write detail, you
are writing the wrong file: detail lives in the slice files below, where it is welcome
and uncapped.

## 2. Four files per SLICE — not per ticket, per slice

Each slice gets a code (S01, S02…) and a directory `docs/missions/<mission>/slices/<code>/`:

**SPEC.md — what is being built. FROZEN at creation.** No agent edits it after creation,
ever — you included. Scope changes are a NEW spec version, ratified by V, superseding on
the record. This is the anti-drift anchor: when a seat wonders what it is building, the
answer cannot have moved.

**PLAN.md — scaffolded here, FILLED by the architecture seat.** You create the file
with the SPEC-trace skeleton and the quantifiability law below; `heartbeat-architecture`
authors the steps, clusters and boundaries. Both seats are bound by the same test: *a
stranger can mark every step done or not-done with no judgement call.*
- WRONG: "improve error handling"
- RIGHT: "requests with a missing id return 400 with a message, and the test asserting
  this passes"
A step nobody can verify mechanically is not a step; split it until it is. Each step names
its cluster (§3), its acceptance test, and its file surface.

**PROGRESS.md — the running state of the slice.** What is DONE · what is NEXT · what was
TRIED AND FAILED (so nobody retries it) · what WORKED. The orchestrator is its only
writer, folding in worker results as they land. The closure report is assembled from
these files, not from memory.

**DECISIONS.md — append-only. Every choice made, and why.** One line per decision: date,
the question, the choice, the reason, who ruled (V or a seat). Never edited, never
deleted, only appended. **Before any seat asks V a question, it checks this file** — a
question already answered here is re-asked to nobody. This is the cure for re-litigating
a two-hour-old decision in a fresh session.

## 3. Task clusterization — the unit of verification

Break every slice into CLUSTERS: the smallest group of PLAN steps that can be verified
together, independently of the rest of the slice. Each cluster gets: an id (`S02-C1`) ·
the PLAN steps it contains · ONE verification command · its file surface.

**The three-run law:** a cluster's verification runs THREE times; the WORST run is the
verdict. Green-green-red is RED — the cause gets fixed, and re-running until green is
falsification. (Measured: one suite was green 16 of 17 runs; wall-clock fixtures inverted
at noon; width-6 concurrency hid a width-10 deadlock. One run proves almost nothing.)

Clusters are the review unit too: a reviewer probes a cluster, not a diff of a whole slice.

## 4. Quality gates on your own output

- Every PLAN step traces to a SPEC sentence; every SPEC requirement is covered by ≥1 step.
- No step's acceptance criterion contains "improve", "better", "robust", "handle", or
  "appropriate" — those words mean you have not finished deciding.
- Contradiction check: if two requirements cannot both hold, STOP and put the conflict to
  V through the orchestrator before any seat spends budget discovering it independently.
- Word every criterion so UNVERIFIED is a valid, respected answer — that line produced
  zero fabrication across three seats on the most temptingly quotable claim in the corpus.

## 5. Handoff

`READY FOR PEER REVIEW`, OPENING with `SKILLS LOADED: <list>` (`heartbeat-protocol` §3b),
then: INSTRUCTIONS.md line count (≤100 or you are not done) · the
slice/cluster table · the SPEC↔PLAN trace · unresolved contradictions (should be zero).
The reviewer will try to find a PLAN step they cannot mechanically verify — leave none.
File your self-report (`heartbeat-protocol` §3), then stop.
