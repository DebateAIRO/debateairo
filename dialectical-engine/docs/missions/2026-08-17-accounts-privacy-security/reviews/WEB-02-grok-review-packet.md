# WEB-02 Grok 4.6 review packet

## Review scope

Review only Kanban card `t_71e02574`, **WEB-02 · Add the duplicate web sign-up route**.

Ticket-owned files:

- `web/app/sign-up/page.tsx`
- `web/components/SignUpFlow.tsx`
- the `/sign-up` auth-path and sign-up style additions in `web/components/TopBar.tsx` and `web/app/globals.css`
- `tests/render/web-auth-sign-up.test.tsx`

WEB-01's login files are relevant only as the already-reviewed adjacent route. Ignore unrelated dirty-tree files. Read only; do not edit.

## Required outcome

- The separate `web/` Next application publishes `/sign-up`.
- Registration uses the existing typed cookie-native `ContractClient.register` call with exactly normalized primary email, raw password, normalized recovery email, and adult affirmation.
- The initial credential form raw-renders one query-free same-origin POST fallback.
- Primary and recovery email fields use distinct autofill sections; password minimum and adult affirmation stay explicit.
- The success view renders only the typed non-enumerating generic backend message and reveals no account status.
- Resend is possible only for the normalized email captured from the submitted registration, through `resendVerification`.
- Registration and resend failures use stable public copy and never echo server, transport, user, or account-state details.
- `/sign-up` receives the same brand-only auth chrome and reviewed visual system as `/login`; the footer reaches `/login`.
- No direct identity seed, OAuth, name field, model/API-key field, terms invention, storage bearer, or origin/cookie relaxation is introduced.

## Implementation summary

`web/app/sign-up/page.tsx` renders `SignUpFlow`. The flow defaults to the existing `web/lib/api.ts` `contractClient`, normalizes only the two email inputs, and calls `register(email,password,recoveryEmail,adultAffirmed)`. After the typed response, it resets the form, retains only the normalized submitted address, and renders the returned generic message. The resend control is `type="button"` and calls `resendVerification` with only that retained address.

The form is `method="post" action="/sign-up"`, with no query string. Primary and recovery fields use `section-primary-email email` and `section-recovery-email email`; password uses `new-password`, minimum eight; adult affirmation remains required. `/sign-up` is added to `TopBar`'s auth-only chrome set. The CSS adds the status panel, field hints, affirmation row, and mobile status-panel rules using the WEB-01 auth tokens.

## RED / GREEN

- RED: the focused render suite failed import resolution because `web/components/SignUpFlow.tsx` did not exist.
- GREEN: new sign-up render behavior `4/4`; adjacent login retained `5/5` in the same command (`9/9`).
- GREEN: web TypeScript.
- GREEN: root `pnpm typecheck`.
- GREEN: `git diff --check`.
- GREEN: optimized `pnpm --dir web build`; route table contains static `○ /sign-up` (1.57 kB, 136 kB first-load JS) and retained static `○ /login`.

The four rendered tests prove:

1. one raw query-free POST form and distinct autofill sections;
2. exact four-field payload, generic typed success message, and submitted-address-only resend;
3. registration failures do not expose backend details; and
4. resend failures do not expose account-state/backend details.

SHA-256:

- `web/app/sign-up/page.tsx`: `a38cb8eec495fab331b8a44c1fe00643a0f0354e45f671c763ca53584fdd06f4`
- `web/components/SignUpFlow.tsx`: `faea16f6bf13fba38997e9bfd56e6484e422755fdaf57465ac1150cddc98966a`
- `web/components/TopBar.tsx`: `39542376010e6e9a00e3eb839d4574070ca46efa26d3d760451fcd1b5b0ae221`
- `web/app/globals.css`: `3e80a70baf53dfc2f5ed6e5f94f96ecb2a0591a4834e8274ee7fba67d053e443`
- `tests/render/web-auth-sign-up.test.tsx`: `e27e0a511f0ac75df187112ebd322a748a4b803071bc03b988003221b181b89a`

## Deliberate limits

This card adds only `/sign-up` and its resend state. It does not add `/verify-email` or `/enroll-mfa`, start local auth infrastructure, deliver mail, create a dev account, or claim the duplicate auth surface is complete.

## Requested verdict

Return exactly one of:

- `GREENLIGHT` if WEB-02 is a bounded, non-enumerating and behaviorally correct duplicate sign-up/resend route with no P0/P1 security, privacy, payload, state, autofill, mobile, or artifact-honesty issue; or
- `BLOCK` with concrete file/line evidence, the violated invariant, and the smallest repair.
