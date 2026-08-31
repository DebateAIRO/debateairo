# PLAN — T5 Node detail drawer

**Goal:** TURN 5 drawer regions on existing NodeDetailDrawer contract.

**Spec:** `slices/T5/SPEC.md` v1

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T5-C1 — Open + core sections

**Proves:** R1, R2, R3, R4

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T5-C1-1 | R1 | Details/open control opens drawer for a node | Interaction/render test |
| T5-C1-2 | R2 | `BASE SCORE` and `FINAL STRENGTH` labels present when fixture has scores | Assert |
| T5-C1-3 | R3 | Replay/Restatement/Defeaters/Judge disagreement labels present | Assert |
| T5-C1-4 | R4 | Condition mark chips from fixture render | Assert ≥1 expected chip text |

### T5-C2 — Actions + history + mode

**Proves:** R5, R6, R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T5-C2-1 | R5 | Owner drawer shows Challenge and Regenerate controls | Assert |
| T5-C2-2 | R5 | publicMode drawer does not expose working mutate controls | Assert locked/absent |
| T5-C2-3 | R6 | Generation history shows ACTIVE/ARCHIVED when fixture has both | Assert |
| T5-C2-4 | R7 | Mode toggle affects drawer/chrome measurable marker | Assert |

### T5-C3 — Render-pin migration

**Proves:** R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T5-C3-1 | R8 | ARCH names drawer/honesty pins to move | Named list |
| T5-C3-2 | R8 | Named tests pass (three runs) | Vitest three-run |
