# PLAN — T6 Settings — identity & account

**Goal:** TURN 6 settings: identity, sessions, step-up, legacy claim, scheduled delete.

**Spec:** `slices/T6/SPEC.md` v2

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T6-C1 — Chrome + identity + mode

**Proves:** R1, R6

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T6-C1-1 | R1 | Settings chrome + identity panel | Assert `Settings` chrome and identity model line containing `HttpOnly` (or SPEC binding cookie/MFA sentence) |
| T6-C1-2 | R1 | Asker id and scope visible | Assert ASKER/SCOPE (or ARCH-pinned identity fields) present |
| T6-C1-3 | R6 | Mode toggle flips Terracotta/Chamber | Assert before/after mode marker differs |

**Cluster verification command (ARCH finalizes):** three runs of T6 identity/mode tests; worst run is verdict.

### T6-C2 — Sessions list + revoke

**Proves:** R2

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T6-C2-1 | R2 | Current vs other session labeling | Assert a session row labeled current (or SPEC binding) |
| T6-C2-2 | R2 | Revoke affordances present | Assert per-row Revoke and `Revoke all sessions` or `Sign out` controls present |

**Cluster verification command (ARCH finalizes):** three runs of T6 session tests; worst run is verdict.

### T6-C3 — Step-up, legacy claim, deletion

**Proves:** R3, R4, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T6-C3-1 | R3 | Sensitive mutates require fresh password + authenticator | Assert step-up fields present before legacy claim / schedule deletion succeeds |
| T6-C3-2 | R4 | Legacy claim control + not-saved copy | Assert `Claim legacy debates` (or SPEC label) and copy that token is not saved |
| T6-C3-3 | R5 | Typed `DELETE MY ACCOUNT` required | Assert schedule path blocked without exact string `DELETE MY ACCOUNT`; seven-day copy present |

**Cluster verification command (ARCH finalizes):** three runs of T6 step-up/legacy/delete tests; worst run is verdict.

### T6-C4 — Render-pin migration

**Proves:** R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T6-C4-1 | R7 | ARCH names settings/session/legacy pins under `tests/render/` | Named list |
| T6-C4-2 | R7 | Named tests pass (three runs) | Three-run vitest on named files |

**Cluster verification command (ARCH finalizes):** three runs of the named `tests/render/**` files; worst run is verdict.
