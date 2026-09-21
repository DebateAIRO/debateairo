# FIND_CURRENT evidence

## Result

The owner-confirmed Forgot-password destination remains **UNRESOLVED** after a bounded current-source and rendered-target investigation. The current source contains an API-only password-recovery start operation, but no verified first-party navigation destination or opener that Support can use.

This result is deliberately scoped. It does not assert that the owner’s flow is absent outside the inspected checkout, refs/worktrees, designs, history, and live targets.

## Source evidence

- Current source revision: `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`.
- `apps/ui/components/LoginFlow.tsx` exposes credentials, MFA verification, saved MFA recovery-code substitution, and `/sign-up`. It has no Forgot/reset control and does not call `startRecovery`.
- `apps/ui/components/authRoutes.source-test.mjs` explicitly requires the login source not to match `forgot`.
- `packages/contract/src/client.ts` exposes `startRecovery(email)` as `POST /v1/auth/recovery/start`, expecting status 202 and one fixed generic message.
- `apps/api/src/index.ts` registers only that recovery-start POST route. The handler returns the service response and supplies no redirect or navigation metadata.
- `apps/api/src/recovery.ts` normalizes and blind-indexes the email, starts the encrypted recovery record, records a fixed risk event when possible, and returns the enumeration-resistant message: `If this account can be recovered, instructions will arrive through an eligible channel.`
- The bounded `auth/recovery|startRecovery|RecoveryStart` search found no password-recovery completion route or UI caller. `completeRecoveryLogin` in the session path is the saved-MFA recovery-code login branch and is not password recovery.
- Relevant auth refs (`codex/auth-contract`, `codex/auth-integration`, `codex/auth-post-fallback`, `codex/auth-recovery-nav-guard`, `codex/auth-ui`, `codex/auth-ui-qa-fixes`) and `dev`, `dev-clean`, and `main` exposed no Forgot/reset/recovery UI route. The only filename match on six refs plus `dev` was the unrelated disabled transient SSR recovery source test.
- The account worktrees and the current auth UI history were searched by bounded filename/content queries. No user-facing Forgot opener or route was located.
- Both supplied design HTML files contain zero `forgot` and zero `reset` occurrences. Their recovery material describes recovery email and saved MFA recovery codes, not a password-reset destination.

At the final scoped status check, the original source had 194 status entries because concurrent work continued during this read-only task. The relevant login, client, recovery service, session, and database paths remained unmodified; `apps/api/src/index.ts` was modified by unrelated current work. The product lane remained at `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d` with ten concurrent Support security/test edits. FIND_CURRENT changed no product path.

## Rendered target evidence

An already-installed repository Playwright capture used a fresh profile and ordinary TLS verification. It entered no data and submitted no form.

| Target | Result | Links | Form | Recovery text |
|---|---|---|---|---|
| `https://localhost:3000/login` | visible | home, `/sign-up` | POST `/login`; email + password | none |
| `https://localhost:3100/login` | visible | home, `/sign-up` | POST `/login`; email + password | none |

Both pages showed only the mode button and Continue button. The screenshots and exact DOM receipt are listed in the JSON receipt. The in-app browser surface was unavailable, so no CUA observation is claimed.

Screenshot QA: the 3000 capture shows the complete login card plus its cookie banner. The 3100 capture is vertically offset and shows only the email area of the card; it is retained as an honest limited visual artifact. The fresh-page DOM inventory, rather than that partial screenshot, supports the full 3100 link/button/form finding.

## Live stack custody

At `2026-09-17T05:33:45Z`, a normal system-trust request to `https://localhost:3100/login` returned HTTP 200. Historical supervisor PID `86341` was revalidated as PPID 1 / PGID 86341, running the supported `pnpm dev:auth:up` command from the CP1 lane. Preview listeners were present on 3100, 3101, and 8890–8896. The unrelated original stack listeners observed at the same instant were 3000, 3001, 8790, and 8793–8796. No service was started, stopped, adopted, or reconfigured.

The repository-supported preview start command is:

```sh
DEBATEAI_DEV_AUTH_STACK_PROFILE=support-preview pnpm dev:auth:up
```

It must run from the exact intended lane with its existing generated environment and TLS custody. The supported supervisor handles SIGINT/SIGTERM, calls `stack.stop()`, and stops only resources owned by that invocation in reverse order. Any later restart must first revalidate the recorded supervisor/process group and target only that owned supervisor; this report does not authorize or perform a restart.

## Connection contract

There is no safe link to connect yet. A Support action must not navigate to the POST API, guess `/forgot-password` or `/reset-password`, substitute `/settings`, or invoke saved-MFA recovery. The smallest testable future contract needs an exact first-party GET route or opener identity for password-recovery initiation, plus its owning UI source. Opening that surface must itself be side-effect free; submitting an email may then call the existing enumeration-resistant start API. Channel delivery and completion need their own verified target before Support describes a completed reset journey.

No checkpoint verdict is issued. Usage is UNAVAILABLE.
