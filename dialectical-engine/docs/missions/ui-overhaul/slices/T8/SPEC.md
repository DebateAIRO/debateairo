# SPEC — T8 Sign up, MFA enrolment & recovery

**Version:** v2 (2026-08-31) · **Status:** FROZEN at v2. Supersedes v1
(vocab translation + OQ closure in DECISIONS).

**Mission:** `ui-overhaul` · **Design source:** TURN 8.

## Intent

Replace SignUpFlow, the three-step mandatory MFA enrolment (verify-email lands
here too), and the LoginFlow recovery-code replacement state with the TURN 8
Chamber/Terracotta shell and copy — without weakening the mandatory MFA /
recovery security policy.

## Screen inventory

| ID | Screen | Notes |
|---|---|---|
| T8-S1 | Create account | Wordmark `Dialectical Engine`; `CREATE AN ACCOUNT`; `Put a claim on the graph.`; email + Verify email; recovery email; password with live checks; age affirmation; `Create account`; link `Already have one? Log in` |
| T8-S2 | Mandatory MFA — step 1 Verify mailed link | `MANDATORY MFA` / `Protect your account`; step 1 done state when verified |
| T8-S3 | Mandatory MFA — step 2 Authenticator | QR + setup key (shown once); six-digit code; `Verify and create recovery codes` |
| T8-S4 | Mandatory MFA — step 3 Recovery codes | Ten one-time codes; Print; Replace with a new set; confirm-by-typing one code; `Activate account` |
| T8-S5 | Recovery access (post recovery-code login) | `RECOVERY ACCESS` / `Save your new recovery code.`; `SIGNED IN SECURELY`; single replacement code; `I saved it — continue` |
| T8-S6 | Mode + tokens | Terracotta ↔ Chamber; fonts/palette as mission design-system facts |

## States

1. Empty / invalid / valid field states on T8-S1 (email validity, recovery-email
   must differ, password rule checklist ✓/✗, age checkbox).
2. MFA enrolment incomplete until steps 1–3 complete; account unusable until
   activated.
3. Setup key/QR visible only for the current setup attempt.
4. Recovery codes shown once per generation; regenerating replaces the whole set.
5. Post-recovery-login gate: session ready but blocked on recording the
   replacement code.

## Copy (binding)

- `CREATE AN ACCOUNT` · `Put a claim on the graph.` (translated from design `bench` per V 2026-08-31)
- `Email verification and authenticator enrolment are required before your account can be used.`
- Password rules: at least eight characters; one capital; one number; one special character
- Age: `I affirm that I am at least 18 years old.`
- MFA titles/body from design steps 1–3
- Recovery: `Your used recovery code has been replaced. This is the only time this new code will be shown.`

## Requirements

### R1 — Sign-up shell matches TURN 8 regions

T8-S1 renders the listed regions and binding strings (including
`Put a claim on the graph.`).

### R2 — Field validation affordances

Password checklist and recovery-email differ rule are visible as pass/fail
markers. Age affirmation required before create succeeds.

### R3 — Three-step mandatory MFA

Enrolment is exactly three steps: verify email → authenticator → save recovery
codes. Verify-email landing continues into this flow.

### R4 — Secrets shown once

Setup key/QR only during setup attempt; recovery code set only at generation;
replacement recovery code only on T8-S5.

### R5 — Activate requires confirm-saved code

`Activate account` is unavailable until the user types one displayed recovery
code to confirm save (per design).

### R6 — Recovery replacement gate

After sign-in with a recovery code, T8-S5 blocks continue until `I saved it —
continue` on the new code.

### R7 — Mode toggle on auth shell

Terracotta ↔ Chamber available on these screens.

### R8 — Render pins move

`tests/render/**` auth sign-up / enrolment / recovery pins that lock OLD copy
must move to NEW UI. **Which pins = ARCH.**

## NON-goals

- Removing mandatory MFA or recovery codes.
- Phone SMS MFA.
- Redesigning security policy (sessions, cookies) — visual/copy shell only
  unless a bug blocks the shell.
- Inventing SMS MFA or weakening mandatory authenticator/recovery policy.

## OPEN QUESTIONS

1. ~~Vocabulary `bench`~~ — **CLOSED** V 2026-08-31: binding CTA is
   `Put a claim on the graph.` (see T9/DECISIONS mapping).
2. **Wordmark inconsistency inside TURN 8 (ARCH proposes, V ratifies):** design
   shows `Dialectical Engine` on sign-up and `DebateAIRO` in MFA step 2 copy —
   confirm intentional product-string split vs unify under ARCH token/copy map.

## Acceptance — V manual (browser)

1. Open sign-up logged out. **Expect:** `CREATE AN ACCOUNT`,
   `Put a claim on the graph.`, email/recovery/password/age regions, mode
   toggle.
2. Enter matching recovery email = primary. **Expect:** differ-rule failure
   marker.
3. Complete create → MFA. **Expect:** steps 1–3 visible; cannot skip to
   activated account without authenticator + recovery confirm.
4. On step 3, without typing a code, try activate. **Expect:** activate does
   not complete.
5. Use a recovery code at sign-in (T7 path) until T8-S5. **Expect:** new code
   shown once; continue only after acknowledge.

## Acceptance — automated

- Existing web-auth sign-up / enrolment render tests updated to NEW strings
  (ARCH names files under `tests/render/`).
- Tests assert recovery-email differ rule and activate-gated-on-confirm.
- Three-run law on cluster command.
