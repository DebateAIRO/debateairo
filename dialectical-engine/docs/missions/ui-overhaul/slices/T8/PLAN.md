# PLAN — T8 Sign up, MFA enrolment & recovery

**Goal:** TURN 8 sign-up + mandatory MFA enrolment + recovery replacement gate.

**Spec:** `slices/T8/SPEC.md` v2

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T8-C1 — Sign-up shell + validation

**Proves:** R1, R2

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T8-C1-1 | R1 | Sign-up shows translated binding strings | Assert `CREATE AN ACCOUNT` and `Put a claim on the graph.` present |
| T8-C1-2 | R2 | Recovery-email differ rule visible | Enter matching recovery=primary; assert fail marker present |
| T8-C1-3 | R2 | Age affirmation required | Assert age checkbox/copy `I affirm that I am at least 18 years old.`; create blocked without it |

**Cluster verification command (ARCH finalizes):** three runs of T8 sign-up validation tests; worst run is verdict.

### T8-C2 — Three-step MFA + activate gate

**Proves:** R3, R4, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T8-C2-1 | R3 | Enrolment shows steps 1–3 | Assert `MANDATORY MFA` flow exposes verify-email, authenticator, recovery-codes stages |
| T8-C2-2 | R4 | Secrets shown once per generation | Assert setup key/QR only during setup; recovery set only at generation |
| T8-C2-3 | R5 | Activate gated on typing a displayed recovery code | Without typing a code, assert `Activate account` does not complete |

**Cluster verification command (ARCH finalizes):** three runs of T8 MFA enrolment tests; worst run is verdict.

### T8-C3 — Recovery replacement gate

**Proves:** R6

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T8-C3-1 | R6 | Post recovery-code login shows replacement gate | Assert `RECOVERY ACCESS` or `Save your new recovery code.` and continue control `I saved it — continue` |
| T8-C3-2 | R6 | Continue blocked until acknowledge | Assert product routes blocked until acknowledge control used |

**Cluster verification command (ARCH finalizes):** three runs of T8 recovery-gate tests; worst run is verdict.

### T8-C4 — Mode + render-pin migration

**Proves:** R7, R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T8-C4-1 | R7 | Mode toggle on auth shell | Assert mode control present; marker flips Terracotta/Chamber |
| T8-C4-2 | R8 | ARCH names auth pins under `tests/render/` | Named list (e.g. web-auth-sign-up / enrolment) |
| T8-C4-3 | R8 | Named tests pass (three runs) | Three-run vitest on named files |

**Cluster verification command (ARCH finalizes):** three runs of T8 mode + named `tests/render/**` files; worst run is verdict.
