# PLAN — T8 Sign up, MFA enrolment & recovery

**Goal:** TURN 8 sign-up + mandatory MFA enrolment + recovery replacement gate.

**Spec:** `slices/T8/SPEC.md` v2

**Status:** ARCHITECTURE FILLED (ARCH-01, 2026-08-31). WHAT/acceptance columns
are Requirements' and unchanged; `HOW` blocks and commands are Architecture's.

**Architecture references:** `docs/missions/ui-overhaul/architecture/` —
`component-map.md` (T8 row), `ADR-004-auth-return-path.md`, `test-migration.md`,
`open-questions.md` Q-03 and Q-07.

**Gated on T9-C3, T3-C1 and T9-C2.** T8-C3 writes `LoginFlow.tsx` and is LAST
in that file's serial order: **T9-C2 → T7-C1 → T7-C2 → T8-C3.**

### Two things that will break this slice if not read first

1. **`web-auth-sign-up.test.tsx` and `web-auth-enrollment.test.tsx` import
   `web/`, not `apps/ui`.** Measured: `web-auth-enrollment` has 0 references to
   `apps/ui` and 4 to `web/`; `web-auth-sign-up` has 0 and 1. T8's SPEC
   acceptance names them (*"Existing web-auth sign-up / enrolment render tests
   updated to NEW strings"*). Following that literally produces a genuine RED, a
   fix in `web/components/SignUpFlow.tsx`, and a green suite over an unchanged
   product. **They are NOT retargeted.** T8's serving-tree pins are
   `tests/render/auth-flow-integration.test.tsx` and the new
   `tests/render/t8-signup.test.tsx`. Routed as `open-questions.md` Q-03.
2. **`apps/ui/app/verify-email/page.tsx` is
   `export { default } from "../enroll-mfa/page";`** — a deliberate canonical
   alias asserted verbatim by `tests/render/web-auth-enrollment.test.tsx` and by
   `tests/architecture/auth-front-door-parity.test.ts`. **Do not inline it.**
   T8-C2 edits `enroll-mfa/page.tsx`; the alias file stays a one-line re-export.

**Wordmark (closes SPEC OQ-2):** `Dialectical Engine` on product chrome,
`DebateAI` on the T9 landing only, and **drop `DebateAIRO`** — it appears once,
in MFA step-2 body copy, and reads as an authoring slip rather than a third
brand (`open-questions.md` Q-07, routed to V).

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

**HOW (ARCH).**

- **Modify** `apps/ui/components/SignUpFlow.tsx`. It already renders through
  `AuthShell`, so T8-S1's eyebrow/title/lede are prop values: eyebrow
  `CREATE AN ACCOUNT`, title `Put a claim on the graph.`, description
  `Email verification and authenticator enrolment are required before your account can be used.`
  `Put a claim on the graph.` is the V-closed translation of the design's
  `bench` (T9 DECISIONS vocabulary table) and ships verbatim.
- Password rules as visible pass/fail markers: at least eight characters, one
  capital, one number, one special character. Age affirmation checkbox with the
  binding label `I affirm that I am at least 18 years old.`
- `T8-C1-2` recovery-email differ rule: a fail marker when recovery equals
  primary. Compare case-insensitively and trimmed — a differ rule that a
  trailing space defeats is not a rule.
- `T8-C1-3`: create must be blocked without the age affirmation. Assert the
  submit does not fire, not merely that the button carries `disabled`.
- Its `Already have one? Log in` link forwards the current `next` value
  (T9-C2's change; do not duplicate the logic here).
- **Create** `tests/render/t8-signup.test.tsx` with three `describe` blocks:
  `sign-up shell` (C1), `mfa enrolment` (C2), `recovery gate` (C3). It imports
  from `apps/ui/components/SignUpFlow.js` — **not** `web/`.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t8-signup.test.tsx tests/render/auth-flow-integration.test.tsx tests/architecture/auth-front-door-parity.test.ts
```

### T8-C2 — Three-step MFA + activate gate

**Proves:** R3, R4, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T8-C2-1 | R3 | Enrolment shows steps 1–3 | Assert `MANDATORY MFA` flow exposes verify-email, authenticator, recovery-codes stages |
| T8-C2-2 | R4 | Secrets shown once per generation | Assert setup key/QR only during setup; recovery set only at generation |
| T8-C2-3 | R5 | Activate gated on typing a displayed recovery code | Without typing a code, assert `Activate account` does not complete |

**HOW (ARCH).**

- **Modify** `apps/ui/app/enroll-mfa/page.tsx` (251 lines) — chrome and copy
  only. It already implements the three stages (`verifyMfaEmail`,
  `verifyMfaTotp`, recovery codes) and already renders the QR through
  `totpQrMatrix`. Add the design's step chrome: `MANDATORY MFA`,
  `Protect your account`, and numbered steps 1–3 with a done state on step 1
  once the mailed link is verified.
- `T8-C2-2` secrets-shown-once: the setup key and QR render only while a setup
  attempt is in flight, and the recovery set only at generation. This is
  existing behaviour — the step asserts it survives the chrome edit, and
  `tests/architecture/s4-mfa-contract.test.ts` reads
  `lib/mfaEnrollment.ts` and `lib/totpQr.ts` as source to guard the same
  property from the other side.
- `T8-C2-3` activate gate: `Activate account` does not complete until the user
  types one of the displayed recovery codes. Compare against the displayed set
  exactly; assert the *activation call does not fire*, not that a button looks
  disabled.
- **Do not inline `verify-email/page.tsx`.** See the header note.
- No policy change: T8 NON-goals forbid removing mandatory MFA or recovery
  codes, and forbid inventing SMS.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t8-signup.test.tsx tests/architecture/s4-mfa-contract.test.ts tests/unit/mfa-ui.test.ts tests/render/web-auth-enrollment.test.tsx
```

`web-auth-enrollment` is present as an **unchanged** guard — it asserts the
`web/` alias line and must stay green; it is not where T8's new strings go.

### T8-C3 — Recovery replacement gate

**Proves:** R6

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T8-C3-1 | R6 | Post recovery-code login shows replacement gate | Assert `RECOVERY ACCESS` or `Save your new recovery code.` and continue control `I saved it — continue` |
| T8-C3-2 | R6 | Continue blocked until acknowledge | Assert product routes blocked until acknowledge control used |

**HOW (ARCH).**

- **Modify** `apps/ui/components/LoginFlow.tsx` recovery branch. It already
  holds `replacementRecoveryCode` state and already calls
  `setRecoveryAcknowledgementPending(true)` in
  `apps/ui/lib/authNavigationGuard.ts`, which `TopBar` reads through
  `useRecoveryAcknowledgementPending()` to disable home navigation. **That
  guard is the mechanism `T8-C3-2` measures** — "product routes blocked until
  acknowledge" is already implemented as brand-mark navigation suppression, and
  T8 re-skins it rather than inventing a second gate.
- Copy: `RECOVERY ACCESS`, `Save your new recovery code.`, `SIGNED IN SECURELY`,
  the single replacement code, and the control `I saved it — continue`, plus the
  binding sentence
  `Your used recovery code has been replaced. This is the only time this new code will be shown.`
- `T8-C3-2` asserts that before acknowledgement `BrandMark` renders with
  `aria-disabled="true"` (its existing no-navigation branch) and that after
  acknowledgement it renders as a `<Link>` — a real state change, not a
  cosmetic one.
- This cluster is LAST in `LoginFlow.tsx`'s serial order.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t8-signup.test.tsx tests/render/auth-flow-integration.test.tsx
```

### T8-C4 — Mode + render-pin migration

**Proves:** R7, R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T8-C4-1 | R7 | Mode toggle on auth shell | Assert mode control present; marker flips Terracotta/Chamber |
| T8-C4-2 | R8 | ARCH names auth pins under `tests/render/` | Named list (e.g. web-auth-sign-up / enrolment) |
| T8-C4-3 | R8 | Named tests pass (three runs) | Three-run vitest on named files |

**HOW (ARCH) — mode, plus the named pin files, `6 of 6`, from `architecture/test-migration.md`.**

- `T8-C4-1`'s mode toggle is `TopBar`'s `authTopBar` mount from T3-C1.
  `/sign-up`, `/verify-email` and `/enroll-mfa` are all in `TopBar`'s
  `AUTH_PATHS`, so the toggle is already present on all three. T8 adds no
  toggle; the step asserts the control is there and that flipping it changes
  `document.documentElement.dataset.mode`.

| File | Class | What moves |
|---|---|---|
| `tests/render/auth-flow-integration.test.tsx` | **RETARGET** | the serving-tree pin. T8-C4 owns its sign-up/enrolment `describe`s; T7-C4 owns the sign-in ones |
| `tests/render/web-auth-sign-up.test.tsx` | **KEEP — DO NOT RETARGET** | imports `web/` |
| `tests/render/web-auth-enrollment.test.tsx` | **KEEP — DO NOT RETARGET** | imports `web/`; asserts the `web/` alias re-export verbatim |
| `tests/architecture/s4-mfa-contract.test.ts` | KEEP (verify) | reads `enroll-mfa/page.tsx`, `lib/mfaEnrollment.ts`, `lib/totpQr.ts` as source |
| `tests/architecture/auth-front-door-parity.test.ts` | **RETARGET** | reads `enroll-mfa/page.tsx`, `verify-email/page.tsx`, `SignUpFlow.tsx` as source |
| `tests/unit/mfa-ui.test.ts` | KEEP (verify) | reads `apps/ui/app/**/page.tsx` as source |

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/auth-flow-integration.test.tsx tests/render/web-auth-sign-up.test.tsx tests/render/web-auth-enrollment.test.tsx tests/architecture/s4-mfa-contract.test.ts tests/architecture/auth-front-door-parity.test.ts tests/unit/mfa-ui.test.ts
```

## SPEC ↔ PLAN trace (both directions)

| SPEC | Covered by | | Step | Traces to |
|---|---|---|---|---|
| R1 | T8-C1-1 | | T8-C1-1 | R1 |
| R2 | T8-C1-2, T8-C1-3 | | T8-C1-2 | R2 |
| R3 | T8-C2-1 | | T8-C1-3 | R2 |
| R4 | T8-C2-2 | | T8-C2-1 | R3 |
| R5 | T8-C2-3 | | T8-C2-2 | R4 |
| R6 | T8-C3-1, T8-C3-2 | | T8-C2-3 | R5 |
| R7 | T8-C4-1 | | T8-C3-1 | R6 |
| R8 | T8-C4-2, T8-C4-3 | | T8-C3-2 | R6 |
| | | | T8-C4-1 | R7 |
| | | | T8-C4-2/3 | R8 |

8 of 8 requirements covered; 11 of 11 steps trace.

## Refutation (ARCH)

| Cluster | Mutant its command detects | Mutant it does NOT detect |
|---|---|---|
| T8-C1 | `Put a claim on the graph.` replaced by the design's `bench` wording; the differ rule defeated by a trailing space; create succeeding without the age affirmation | a password rule marker that shows a pass for a password the server would reject |
| T8-C2 | a skippable enrolment step; the QR or setup key rendered outside a setup attempt; activation firing without a typed code; `verify-email/page.tsx` inlined | an activation that fires with a code from a *previous* generation — the assertion compares against the displayed set, which the fixture controls |
| T8-C3 | a replacement gate that lets `BrandMark` navigate before acknowledgement; the replacement code shown more than once | a replacement code that is displayed correctly but never persisted server-side |
| T8-C4 | the toggle missing from an auth route; any of the six standing files going red from the T8 diff; a `web-auth-*` file accidentally retargeted | a standing file already red before T8 |
