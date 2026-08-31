# PLAN — T3 Library & public debate view

**Goal:** Signed-in library (3a) + publicMode public reading (3b) match TURN 3
without regressing shared workspace publicMode.

**Spec:** `slices/T3/SPEC.md` v1

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T3-C1 — Signed-in library chrome + composer

**Proves:** R1, R2, R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T3-C1-1 | R1 | Session `/` shows `Library` / `A REASONING INSTRUMENT` (or ARCH-documented exact chrome set) | Render assert |
| T3-C1-2 | R2 | Composer + `Start debate →` present for signed-in | Assert |
| T3-C1-3 | R8 | Mode toggle present | Assert |

### T3-C2 — Your / Public lists

**Proves:** R3, R4

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T3-C2-1 | R3 | Controls labeled `Your debates` and `Public debates` exist | Assert |
| T3-C2-2 | R3 | Selecting each shows the corresponding list fixture contents | Interaction test with fixtures |
| T3-C2-3 | R4 | Row/card uses bezel-card markers ARCH documents (class/token/test id) | Assert marker present |

### T3-C3 — Public publicMode + verdict-first + locks

**Proves:** R5, R6, R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T3-C3-1 | R5 | Public page still mounts shared workspace `publicMode` (or successor named in DECISIONS) | Structural/render assert `publicMode` (or successor flag) true on public route |
| T3-C3-2 | R6 | Verdict/status block appears before strongest-case pair in document order | DOM order assert |
| T3-C3-3 | R7 | Public lock banner string present; Challenge locked/absent as mutation | Assert banner; mutation controls absent or disabled-locked per ARCH oracle |

### T3-C4 — Render-pin migration

**Proves:** R9

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T3-C4-1 | R9 | ARCH names library + `pda-s02-*` / related pins to move | Named list |
| T3-C4-2 | R9 | Named tests pass on NEW UI (three runs) | Vitest three-run |

## Open dependencies

- T9 anonymous `/` split.
- V-DECISION on vocab if library labels change.
- ARCH composition if verdict-first conflicts with view toggles.
