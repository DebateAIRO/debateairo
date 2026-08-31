# PLAN — T1 Debate view — tree canvas

**Goal:** TURN 1 approved canvas: modes, bezel cards, stance tabs, synthesis.

**Spec:** `slices/T1/SPEC.md` v1

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T1-C1 — Chrome + views + mode

**Proves:** R1, R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T1-C1-1 | R1 | Thread/Split/Tree/Map controls exist | Assert four labels |
| T1-C1-2 | R1 | Activating each changes measurable view marker | Interaction assert |
| T1-C1-3 | R7 | Mode toggle switches Terracotta/Chamber marker | Assert |

### T1-C2 — Card anatomy + stance + connectors

**Proves:** R2, R3, R4

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T1-C2-1 | R2 | Cards expose double-bezel + stance-tab markers ARCH documents | Assert markers |
| T1-C2-2 | R3 | Card shows BASE and FINAL and Details control | Assert |
| T1-C2-3 | R3 | Owner card shows Regenerate control | Assert |
| T1-C2-4 | R4 | Connector elements carry stance color token/class | Assert |

### T1-C3 — Set-aside + synthesis + publicMode

**Proves:** R5, R6, R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T1-C3-1 | R5 | `Show set-aside paths` toggle exists and changes path visibility | Interaction assert |
| T1-C3-2 | R6 | Synthesis/verdict strip labels present when fixture has synthesis | Assert |
| T1-C3-3 | R8 | publicMode canvas hides/locks Regenerate mutate path | Assert |

### T1-C4 — Render-pin migration

**Proves:** R9

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T1-C4-1 | R9 | ARCH names the `tests/render/**` files that pinned OLD canvas/debate chrome (incl. `ui02e-debate-canvas`) | Named list under `tests/render/**` |
| T1-C4-2 | R9 | Named tests pass (three runs) | Vitest three-run |
