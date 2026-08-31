# PLAN — T7 Sign in, two-step & fleet

**Goal:** TURN 7 login + two-step + honest fleet stub.

**Spec:** `slices/T7/SPEC.md` v1

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T7-C1 — Sign-in shell

**Proves:** R1

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T7-C1-1 | R1 | Login shows `WELCOME BACK` and policy line about authenticator/recovery | Render assert |
| T7-C1-2 | R1 | Mode toggle present | Assert control |

### T7-C2 — Two-step + recovery alternative

**Proves:** R2, R3

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T7-C2-1 | R2 | After password continue, two-step UI with 6-digit prompt is shown | Flow/render test |
| T7-C2-2 | R3 | `Use a recovery code` control exists; back returns to sign in | Assert both controls + back navigation |

### T7-C3 — Fleet honesty

**Proves:** R4, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T7-C3-1 | R4 | Ordinary asker fleet/stub contains unavailable copy from design | Assert string |
| T7-C3-2 | R4 | Ordinary asker fleet UI does not render a fabricated worker table | Assert zero fake worker rows / no privileged fetch in asker stub (ARCH pins check) |

### T7-C4 — Render-pin migration

**Proves:** R6

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T7-C4-1 | R6 | ARCH names old login/two-step pins under `tests/render/` | Named list |
| T7-C4-2 | R6 | Named tests pass on NEW UI (three runs) | Vitest three-run |

## Open dependencies

- T8 recovery replacement after recovery-code success.
- ARCH maps fleet route vs `admin/workers`.
