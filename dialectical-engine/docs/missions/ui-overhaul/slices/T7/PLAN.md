# PLAN — T7 Sign in, two-step & fleet

**Goal:** TURN 7 login shell, two-step, honest fleet stub.

**Spec:** `slices/T7/SPEC.md` v2

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T7-C1 — Sign-in shell

**Proves:** R1

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T7-C1-1 | R1 | Sign-in binding strings present | Assert `WELCOME BACK` and `Back to the graph.` present |
| T7-C1-2 | R1 | Email/password + mode | Assert email and password fields and mode toggle present |

**Cluster verification command (ARCH finalizes):** three runs of T7 sign-in shell tests; worst run is verdict.

### T7-C2 — Two-step + recovery alternative

**Proves:** R2, R3

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T7-C2-1 | R2 | Password continue lands on two-step | After valid password step, assert `TWO-STEP VERIFICATION` and 6-digit entry |
| T7-C2-2 | R3 | Recovery-code alternative + back | Assert `Use a recovery code` present; `← Back to sign in` returns to `WELCOME BACK` |

**Cluster verification command (ARCH finalizes):** three runs of T7 two-step tests; worst run is verdict.

### T7-C3 — Fleet honesty

**Proves:** R4, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T7-C3-1 | R4 | Ordinary asker fleet shows unavailable copy | Required fixture: ARCH-named ordinary-asker fleet entry; assert copy contains `Deployment state is unavailable in the ordinary asker interface` (or SPEC binding); assert zero fabricated worker rows |
| T7-C3-2 | R5 | Operator fleet (if authorized) does not leak to asker chrome | Assert ordinary asker path cannot load operator worker table (ARCH pins probe) |

**Cluster verification command (ARCH finalizes):** three runs of T7 fleet honesty tests; worst run is verdict.

### T7-C4 — Render-pin migration

**Proves:** R6

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T7-C4-1 | R6 | ARCH names login/two-step pins under `tests/render/` | Named list |
| T7-C4-2 | R6 | Named tests pass (three runs) | Three-run vitest on named files |

**Cluster verification command (ARCH finalizes):** three runs of the named `tests/render/**` files; worst run is verdict.
