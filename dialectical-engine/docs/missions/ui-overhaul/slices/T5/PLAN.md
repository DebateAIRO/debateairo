# PLAN — T5 Node detail drawer

**Goal:** TURN 5 drawer regions on existing NodeDetailDrawer contract,
including review verdict line and `tests/render/**` pin migration.

**Spec:** `slices/T5/SPEC.md` v1 (amended 2026-08-31 completeness: R3 review
line + R9 `tests/render/**` bind — see DECISIONS)

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T5-C1 — Open + core sections + review line

**Proves:** R1, R2, R3, R4, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T5-C1-1 | R1 | Details/open control opens drawer for a node | Interaction/render test |
| T5-C1-2 | R2 | `BASE SCORE` and `FINAL STRENGTH` labels present when fixture has scores | Assert |
| T5-C1-3 | R3 | When fixture has cross-review, drawer shows `REVIEW AGREED BY:` or `REVIEW DISPUTED BY:` plus reviewer model line | Assert label + model line |
| T5-C1-4 | R3 | When fixture has no cross-review, drawer does not invent those labels | Assert absent |
| T5-C1-5 | R4 | Replay/Restatement/Defeaters/Judge disagreement labels present | Assert |
| T5-C1-6 | R5 | Condition mark chips from fixture render | Assert ≥1 expected chip text |

### T5-C2 — Actions + history + mode

**Proves:** R6, R7, R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T5-C2-1 | R6 | Owner drawer shows Challenge and Regenerate controls | Assert |
| T5-C2-2 | R6 | publicMode drawer does not expose working mutate controls | Assert locked/absent |
| T5-C2-3 | R7 | Generation history shows ACTIVE/ARCHIVED when fixture has both | Assert |
| T5-C2-4 | R8 | Mode toggle affects drawer/chrome measurable marker | Assert |

### T5-C3 — Render-pin migration (`tests/render/**`)

**Proves:** R9

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T5-C3-1 | R9 | ARCH names the `tests/render/**` files that pinned OLD drawer/honesty/provenance chrome for this surface | Named list under `tests/render/**` |
| T5-C3-2 | R9 | Named tests pass against NEW UI (three runs) | Vitest three-run on named files |
