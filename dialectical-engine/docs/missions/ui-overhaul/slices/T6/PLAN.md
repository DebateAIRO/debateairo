# PLAN — T6 Settings — identity & account

**Goal:** TURN 6 settings regions ship with step-up and deletion confirm.

**Spec:** `slices/T6/SPEC.md` v1

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T6-C1 — Chrome + identity

**Proves:** R1, R6

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T6-C1-1 | R1 | Settings shows IDENTITY / asker scope fields | Render assert |
| T6-C1-2 | R1 | HttpOnly cookie · mandatory MFA model line present | Assert string |
| T6-C1-3 | R6 | Mode toggle present | Assert control |

### T6-C2 — Sessions

**Proves:** R2

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T6-C2-1 | R2 | Session list renders current vs other markers and Revoke controls | Render/fixture test |
| T6-C2-2 | R2 | Revoke all and Sign out controls exist | Assert controls |

### T6-C3 — Step-up + legacy claim + deletion

**Proves:** R3, R4, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T6-C3-1 | R3 | Fresh authentication region with password + authenticator + Verify exists | Assert |
| T6-C3-2 | R4 | Legacy claim field + button + not-saved copy exist | Assert |
| T6-C3-3 | R5 | Schedule deletion requires typed `DELETE MY ACCOUNT` | Test: wrong/missing text → no schedule; exact text + step-up fields present → control enabled path |

### T6-C4 — Render-pin migration

**Proves:** R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T6-C4-1 | R7 | ARCH names settings/session/legacy pins to move | Named list |
| T6-C4-2 | R7 | Named tests pass on NEW UI (three runs) | Vitest three-run |
