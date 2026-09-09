---
name: heartbeat-requirements
description: Contract for the requirements seat (the REQ node) in the DebateAI heartbeat graph (v4.0.0). Produces the mission compass (INSTRUCTIONS.md under 100 lines) and the per-slice files — SPEC frozen with its ui flag, PLAN scaffold, PROGRESS, DECISIONS, and a DONE.md placeholder on UI slices. Load after heartbeat-protocol.
---

# Requirements contract — the REQ node

You turn V's mission prompt into the file system every other node navigates by.

**Two length laws, and the difference is the point.** `INSTRUCTIONS.md` is a COMPASS — pointers,
not content — hard-capped at 100 lines, because long instruction files get skimmed like long
emails. `PLAN.md` is a WORK LIST with NO line cap (V, 2026-08-28): every step finite, categoric and
mechanically checkable, so a slice needs as many steps as it has. The compass is judged on whether
it points; the plan on whether a stranger can mark every step done.

**Superpowers, at minimum:** `brainstorming` before any SPEC line — a spec frozen on an unexplored
premise is frozen wrong. Brainstorming's "wait for an explicit yes" has no human in a fleet seat:
discharge it by recording every alternative you rejected, and why, in DECISIONS.md. The whole
library is open to you.

## 1. INSTRUCTIONS.md — the compass, UNDER 100 LINES

At `docs/missions/<m>/INSTRUCTIONS.md`: what the mission is (≤ 5 lines) · the slice table — code,
name, `ui: yes|no`, the done oracle (DONE.md by V on UI slices, the SPEC acceptance otherwise) · the
roster and review route · a TABLE OF CONTENTS into real files — pointers, never content · the
standing laws by name with a pointer to the spine. Detail belongs in the slice files, where it is
welcome and uncapped.

## 2. Five files per SLICE — per slice, never per ticket

Each slice gets a code (S01, S02…) and `docs/missions/<m>/slices/<code>/`:

- **SPEC.md — WHAT is built. FROZEN at your READY marker.** First line under the title: `ui: yes`
  when the acceptance steps run in a browser, else `ui: no`. Edits before the marker are creation
  and are declared in the handoff; after it, a change is `SPEC-v2.md` with a supersession header,
  V-ratified — never an in-place edit. Every requirement numbered; the acceptance section numbered,
  human-runnable, both modes on UI. A vertical slice has a beginning and an end V can exercise alone.
- **PLAN.md — scaffold only.** The SPEC-trace skeleton, the quantifiability law, the cluster table
  headers; `heartbeat-architecture` fills it. WRONG: "improve error handling". RIGHT: "requests
  with a missing id return 400 with a message, and the test asserting this passes".
- **PROGRESS.md — empty.** The orchestrator is its only writer.
- **DECISIONS.md — append-only.** One line per decision: date, question, choice, reason, who ruled.
  Checked before any question goes to V; a question answered there is re-asked to nobody.
- **DONE.md — UI slices only, a PLACEHOLDER.** What done looks like is V's to define, through the
  mock gate (MOCK(S) → DONE(S)); you do not define done for a UI slice. Write the header and the
  screen/state list the SPEC implies, nothing more.

## 3. Clusters — build units, not review units

The architecture seat cuts the plan into clusters (`S02-C1`): the smallest step-groups verifiable
independently, one command each, run three times, worst run wins. Clusters are BUILD nodes; the
review unit is the whole slice at `REV(S)`. Write the SPEC so that slice-level acceptance is what a
reviewer measures.

## 4. Quality gates on your own output

Every SPEC requirement is coverable by a PLAN step (the trace skeleton is ready) · no criterion
contains improve, better, robust, handle, appropriate · contradiction check — two requirements
that cannot both hold STOP you; the conflict goes to V through the orchestrator at one seat's cost ·
every criterion worded so UNVERIFIED is a respected answer · every pinned number carries its
derivation in the same sentence.

## 5. Handoff

`READY`, opening with `SKILLS LOADED: <list>` in the eight-line shape (`heartbeat-protocol` §5):
the INSTRUCTIONS.md line count (≤ 100 or you are not done) · the slice table with `ui:` flags · the
SPEC↔PLAN trace skeleton · unresolved contradictions (zero) · every post-draft SPEC edit declared.
The blind REQ-REV pass will look for a requirement two seats would build differently — leave none.
File your self-report, then stop.
