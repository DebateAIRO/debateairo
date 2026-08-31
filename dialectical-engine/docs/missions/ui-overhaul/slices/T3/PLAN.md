# PLAN — T3 Library & public debate view

**Goal:** Signed-in library (3a) + publicMode 3b reading (verdict-first, locks).

**Spec:** `slices/T3/SPEC.md` v2

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md (literal acceptance cells; one verification command per cluster).

## Clusters

### T3-C1 — Signed-in library chrome + mode

**Proves:** R1, R2, R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T3-C1-1 | R1 | Signed-in `/` shows library not landing hero | Assert `Your debates` or `+ New debate` present AND hero `Find the weakest claim in your own argument.` absent |
| T3-C1-2 | R2 | Composer + Start debate visible | Assert `Type a debatable claim or question…` and `Start debate →` present |
| T3-C1-3 | R8 | Mode toggle present on library | Assert mode control present; toggle flips Terracotta/Chamber marker |

**Cluster verification command (ARCH finalizes):** three runs of T3 library chrome tests; worst run is verdict.

### T3-C2 — Your / Public lists + 4 TOTAL

**Proves:** R3, R4

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T3-C2-1 | R3 | Both selectors exist with `4 TOTAL` chip | Assert strings `Your debates`, `Public debates`, and `4 TOTAL` present |
| T3-C2-2 | R3 | Selectors show distinct membership or empty-state | Fixture with differing Your vs Public membership (required); assert visible row titles or empty-state string differ after switching selectors — identical hardcoded empty under both = RED |
| T3-C2-3 | R4 | Library rows use bezel-card markers ARCH documents | Assert bezel marker/class on ≥1 library row |

**Cluster verification command (ARCH finalizes):** three runs of T3 list/bezel tests; worst run is verdict.

### T3-C3 — Public 3b verdict-first + locks

**Proves:** R5, R6, R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T3-C3-1 | R5 | Public URL mounts shared workspace publicMode | Assert view toggles `Thread`/`Split`/`Tree`/`Map` present on public debate URL |
| T3-C3-2 | R6 | Verdict-first + `Details ▾` + case `Read ▾` | Assert verdict/status precedes strongest-case pair in DOM order; assert `Details ▾` and `Read ▾` present |
| T3-C3-3 | R7 | Mutations locked + unlock path | Assert public banner string present; Challenge locked/absent; `Unlock actions` present |

**Cluster verification command (ARCH finalizes):** three runs of T3 publicMode/3b tests; worst run is verdict.

### T3-C4 — Render-pin migration

**Proves:** R9

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T3-C4-1 | R9 | ARCH names library/public pins under `tests/render/` | Named list includes `pda-s02-*` / home buffer as applicable |
| T3-C4-2 | R9 | Named tests pass (three runs) | Three-run vitest on named files |

**Cluster verification command (ARCH finalizes):** three runs of the named `tests/render/**` files; worst run is verdict.
