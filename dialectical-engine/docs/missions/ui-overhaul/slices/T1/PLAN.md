# PLAN — T1 Debate view — tree canvas

**Goal:** TURN 1 approved canvas: modes, bezel cards, stance tabs, synthesis.

**Spec:** `slices/T1/SPEC.md` v2

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md (literal strings/controls/markers in every acceptance cell;
one verification command per cluster; no bare `Assert`).

## Clusters

### T1-C1 — Chrome + views + mode

**Proves:** R1, R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T1-C1-1 | R1 | Thread/Split/Tree/Map controls exist | Assert labels `Thread`, `Split`, `Tree`, `Map` present on owner debate canvas |
| T1-C1-2 | R1 | Activating each changes measurable view marker | Click each control; assert view marker/data-attribute differs per selection |
| T1-C1-3 | R7 | Mode toggle switches Terracotta/Chamber marker | Assert before/after mode marker differs after toggle |

**Cluster verification command (ARCH finalizes):** three runs of T1 chrome/view/mode tests; worst run is verdict.

### T1-C2 — Card anatomy + stance + connectors

**Proves:** R2, R3, R4

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T1-C2-1 | R2 | Cards expose double-bezel + stance-tab markers ARCH documents | Assert bezel marker and stance-tab class/token present on ≥1 PRO and ≥1 CON card |
| T1-C2-2 | R3 | Card shows BASE and FINAL and Details control | Assert `BASE`, `FINAL`, and `Details ▸` (or ARCH-pinned Details control) on a card |
| T1-C2-3 | R3 | Owner card shows Regenerate control | Assert `↻ Regenerate` present on owner canvas card |
| T1-C2-4 | R4 | Connector elements carry stance color token/class | Assert PRO vs CON connector tokens/classes differ |

**Cluster verification command (ARCH finalizes):** three runs of T1 card/connector tests; worst run is verdict.

### T1-C3 — Set-aside + synthesis + publicMode

**Proves:** R5, R6, R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T1-C3-1 | R5 | `Show set-aside paths` toggles visibility on a set-aside fixture | Required fixture: debate with ≥1 set-aside path; assert visible path/card count changes after toggle |
| T1-C3-2 | R6 | Synthesis/verdict strip labels present when fixture has synthesis | Assert `↑ STRONGEST PRO` or `VERDICT` (or SPEC binding synthesis labels) present |
| T1-C3-3 | R8 | publicMode canvas locks Regenerate mutate path | Assert `↻ Regenerate` absent or disabled on publicMode mount; contrast threshold ARCH pins met |

**Cluster verification command (ARCH finalizes):** three runs of T1 set-aside/synthesis/publicMode tests; worst run is verdict.

### T1-C4 — Render-pin migration

**Proves:** R9

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T1-C4-1 | R9 | ARCH names canvas/debate pins under `tests/render/` (incl. `ui02e-debate-canvas`) | Named list in DECISIONS or PLAN appendix |
| T1-C4-2 | R9 | Named tests pass against NEW UI (three runs) | Three-run vitest on the named `tests/render/**` files |

**Cluster verification command (ARCH finalizes):** three runs of the named `tests/render/**` files; worst run is verdict.
