# PLAN — T8 Sign up, MFA enrolment & recovery

**Goal:** TURN 8 sign-up + mandatory MFA three-step + recovery replacement
shell ships; security policy preserved.

**Spec:** `slices/T8/SPEC.md` v1

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md (done/not-done, banned vague words, SPEC trace, three-run,
UNVERIFIED respected).

## Clusters

### T8-C1 — Create account shell + validation markers

**Proves:** R1, R2

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T8-C1-1 | R1 | Sign-up shows `CREATE AN ACCOUNT` and `Put a claim to the bench.` (unless V closed vocab otherwise — then DECISIONS cites V) | Render test asserts strings |
| T8-C1-2 | R2 | Recovery email equal to primary shows differ failure marker | Interaction/unit test |
| T8-C1-3 | R2 | Password rules expose four checklist items; age affirmation required | Assert checklist labels; submit blocked without age affirm |

### T8-C2 — Mandatory MFA steps 1–3

**Proves:** R3, R4, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T8-C2-1 | R3 | Enrolment UI enumerates steps Verify mailed link → Add authenticator → Save recovery codes | Assert step labels present in order |
| T8-C2-2 | R4 | Setup key/QR region exists only on step 2 attempt | Assert absent after completion / not persisted in DOM after leave |
| T8-C2-3 | R5 | Activate path requires typing one displayed recovery code | Test: without confirm → not activated; with confirm → activate control succeeds |

### T8-C3 — Recovery replacement gate

**Proves:** R6

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T8-C3-1 | R6 | Post-recovery-login screen shows `RECOVERY ACCESS` / replacement code / `I saved it — continue` | Render test |
| T8-C3-2 | R6 | Continue before acknowledge does not clear the gate | State test |

### T8-C4 — Mode + render-pin migration

**Proves:** R7, R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T8-C4-1 | R7 | Mode toggle present on sign-up shell | Assert control |
| T8-C4-2 | R8 | ARCH lists old `tests/render/web-auth-sign-up*` / enrolment pins moved | Named list + three-run vitest |

## Open dependencies

- V-DECISION on vocab / product-name strings shared with T9.
- T7 recovery-code login entry must reach T8-S5.
