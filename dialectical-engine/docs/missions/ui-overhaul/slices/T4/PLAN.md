# PLAN — T4 New debate

**Goal:** TURN 4 new-debate form with V3 submit; V2 options displayed not sent.

**Spec:** `slices/T4/SPEC.md` v1

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T4-C1 — Form chrome + core fields

**Proves:** R1, R2, R6

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T4-C1-1 | R1 | New-debate shows `NEW QUESTION` / `What should we debate?` | Render assert |
| T4-C1-2 | R2 | Risk tier three options + budget three options + depth control exist | Assert |
| T4-C1-3 | R6 | Mode toggle present | Assert |

### T4-C2 — Steering + start/cancel

**Proves:** R3, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T4-C2-1 | R3 | Steering menu + annotations inputs exist | Assert |
| T4-C2-2 | R5 | Start run + Cancel exist; empty question does not start | Interaction test |

### T4-C3 — V2 options not sent

**Proves:** R4

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T4-C3-1 | R4 | Options panel includes not-sent copy | Assert string |
| T4-C3-2 | R4 | Submitted create payload omits V2-only option fields | Unit/integration assert on submit shape |

### T4-C4 — Render-pin migration

**Proves:** R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T4-C4-1 | R7 | ARCH names new-debate pins (incl. `ux01-new-debate-form`) | Named list |
| T4-C4-2 | R7 | Named tests pass (three runs) | Vitest three-run |
