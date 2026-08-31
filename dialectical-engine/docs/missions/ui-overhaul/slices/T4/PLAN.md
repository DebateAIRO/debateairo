# PLAN — T4 New debate

**Goal:** TURN 4 new-debate form shell; V2 options not sent.

**Spec:** `slices/T4/SPEC.md` v2

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T4-C1 — Form regions + mode

**Proves:** R1, R2, R6

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T4-C1-1 | R1 | Question + chrome regions present | Assert `NEW QUESTION` or `What should we debate?` and mode control on new-debate route |
| T4-C1-2 | R2 | Risk, budget, depth selectable | Assert risk labels `Casual`/`Standard`/`High stakes` (or design set), composition `Low`/`Medium`/`High`, and a depth control present |
| T4-C1-3 | R6 | Mode toggle flips Terracotta/Chamber | Assert before/after mode marker differs |

**Cluster verification command (ARCH finalizes):** three runs of T4 form/mode tests; worst run is verdict.

### T4-C2 — Steering + start/cancel

**Proves:** R3, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T4-C2-1 | R3 | Steering menu + annotations captured | Assert steering controls present; submit includes steering fields per existing contract (ARCH maps names) |
| T4-C2-2 | R5 | Start/Cancel/keyboard affordances | Assert `Start run →` or closed-label CTA, `Cancel`, and documented ⌃↵ start when valid |
| T4-C2-3 | R5 | Empty question cannot start | Clear question; activate Start; assert no run-create navigation/success |

**Cluster verification command (ARCH finalizes):** three runs of T4 steering/start tests; worst run is verdict.

### T4-C3 — V2 options not sent

**Proves:** R4

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T4-C3-1 | R4 | Options panel shows not-sent explanation | Assert copy that V2 controls have no V3 slot / are not sent |
| T4-C3-2 | R4 | V2 option values omitted from V3 payload | Set V2 option values; submit; assert those keys absent from V3 run-contract payload |

**Cluster verification command (ARCH finalizes):** three runs of T4 options payload tests; worst run is verdict.

### T4-C4 — Render-pin migration

**Proves:** R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T4-C4-1 | R7 | ARCH names `tests/render/**` pins (e.g. `ux01-new-debate-form`) | Named list under `tests/render/` |
| T4-C4-2 | R7 | Named tests pass (three runs) | Three-run vitest on named files |

**Cluster verification command (ARCH finalizes):** three runs of the named `tests/render/**` files; worst run is verdict.
