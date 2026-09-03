# SPEC — T6 Settings — identity & account

**Version:** v2 (2026-08-31) · **Status:** FROZEN at v2. Supersedes v1
(F9 owner sequence + vocab closure in DECISIONS).

**Mission:** `ui-overhaul` · **Design source:** TURN 6.

## Intent

Replace settings with TURN 6: asker identity scope, active sessions with
revoke, step-up fresh authentication, legacy debate claim, and scheduled
account erasure — under Terracotta/Chamber.

## Screen inventory

| ID | Region | Notes |
|---|---|---|
| T6-S1 | Chrome | `Dialectical Engine` / `dezbatere.ro` / `Settings` / asker chip / mode toggle |
| T6-S2 | Identity | `IDENTITY` / `Your asker scope`; ASKER id; SCOPE; IDENTITY MODEL line about HttpOnly cookie + mandatory MFA |
| T6-S3 | Active sessions | Device list with Current/Other; Revoke per row; `Revoke all sessions`; `Sign out` |
| T6-S4 | Fresh authentication | Password + authenticator code + `Verify` for sensitive actions |
| T6-S5 | Claim legacy debates | Token field + `Claim legacy debates`; copy that token is not saved |
| T6-S6 | Delete account | Seven-day schedule copy; password + authenticator + type `DELETE MY ACCOUNT`; `Schedule deletion` |
| T6-S7 | Mode + tokens | Terracotta ↔ Chamber; mission fonts/palette |

## States

1. Session list: current vs other; unrecognized location hint when present.
2. Sensitive actions require successful fresh authentication (T6-S4) before
   mutate.
3. Legacy claim: one-shot token entry; not persisted in browser/server beyond
   claim processing (existing policy).
4. Deletion: scheduled after seven full days; cancellable before it begins;
   requires typed confirmation string.

## Copy (binding excerpts)

- `Sessions use server-set HttpOnly cookies and mandatory MFA. Browser scripts never receive the session credential.`
- `Sensitive actions require re-entering your password and an authenticator code.`
- Legacy claim paragraph from design (old access token, not saved).
- Delete account paragraphs from design (seven days, notices, encrypted private
  content, public snapshots under retired pseudonym).
- Typed confirm: `DELETE MY ACCOUNT`

## Requirements

### R1 — Settings chrome + identity panel

T6-S1 and T6-S2 render; asker id and scope visible; identity model line present.

### R2 — Session list + revoke

Each session row shows device label, current/other, last seen; per-row Revoke;
Revoke all; Sign out.

### R3 — Step-up before sensitive mutates

Legacy claim and schedule deletion (and other sensitive mutates ARCH maps)
require fresh password + authenticator verify in-session.

### R4 — Legacy claim control

Control accepts old debate access token once; UI copy states token is not saved
by browser or server.

### R5 — Scheduled deletion

Schedule path requires password, authenticator, and exact typed
`DELETE MY ACCOUNT`. Copy states seven full days and cancel-before-begin.

### R6 — Mode toggle

Terracotta ↔ Chamber on settings.

### R7 — Render pins move

`tests/render/**` settings / session / legacy-claim pins move to NEW UI
(**ARCH names pins**).

## NON-goals

- Changing cookie/MFA security model.
- Immediate hard-delete without seven-day schedule.
- Billing/subscription settings (not in TURN 6).

## OPEN QUESTIONS

1. **Site label `dezbatere.ro` (ARCH proposes, V ratifies):** design chrome shows
   it beside Dialectical Engine — confirm production host string vs generic
   wordmark for all deployments.
2. ~~Vocabulary~~ — **CLOSED** V 2026-08-31: app vocabulary everywhere; see
   T9/DECISIONS mapping.

## Acceptance — V manual (browser)

1. Sign in → open Settings. **Expect:** identity panel with asker id/scope and
   HttpOnly/MFA model line; mode toggle.
2. In sessions list, identify current session. **Expect:** labeled current;
   revoke controls visible on other sessions.
3. Open legacy claim without step-up. **Expect:** gated by fresh auth (password
   + authenticator) before claim succeeds.
4. Open delete account. **Expect:** seven-day copy; cannot schedule without
   typing `DELETE MY ACCOUNT` plus step-up fields.

## Acceptance — automated

- Settings render tests assert identity/session/deletion/legacy regions.
- Tests assert typed `DELETE MY ACCOUNT` required.
- Pin migration named by ARCH; three-run law.
