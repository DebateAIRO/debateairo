# WEB-03 Grok 4.6 review packet

## Review scope

Review only Kanban card `t_10ae64c4`, **WEB-03 · Add duplicate web verification and MFA-enrolment routes**.

Ticket-owned files:

- `web/app/verify-email/page.tsx`
- `web/app/enroll-mfa/page.tsx`
- `web/lib/mfaEnrollment.ts`
- `web/lib/totpQr.ts`
- the auth-path addition in `web/components/TopBar.tsx`
- `tests/render/web-auth-enrollment.test.tsx`

WEB-01/02 are relevant only as reviewed adjacent routes. Ignore unrelated dirty-tree files. Read only; do not edit.

## Required outcome

- The separate `web/` app publishes both `/verify-email` and `/enroll-mfa`.
- `/verify-email` remains the exact canonical compatibility alias to the same one-shot enrolment page.
- The mailed bearer is removed from visible URL/history before the first verification await, preserves unrelated query/hash state, and is never written to storage or a cookie.
- Verification and each enrolment transition use POST through the `web` app's same-origin `/api` proxy.
- The state machine remains email verification → one-time TOTP provisioning → current TOTP proof → ten recovery codes → typeback confirmation → active.
- The TOTP secret disappears before recovery-code custody; newest codes replace the set; one code from the newest set must be typed back.
- TOTP and recovery inputs are controlled only by explicit `type="button"` actions; neither public route contains a native form, so pre-hydration GET submission cannot leak a bearer, TOTP, secret, or recovery code.
- Error copy stays phase-appropriate and does not expose internal transport details.
- QR generation is local and configuration-free; no third-party QR endpoint receives the secret.
- Both routes receive auth-only brand chrome, with no unsupported product behavior.

## Implementation summary

The `web` enrolment page is the already-reviewed `apps/ui` state machine with only imports changed to the `web`-local MFA transport and shared QR encoder. `web/lib/mfaEnrollment.ts` is the same bounded helper but imports `web/lib/api.ts`, so all requests are rewritten onto this app's same-origin proxy. `web/lib/totpQr.ts` re-exports the pure audited QR encoder from `apps/ui` to prevent cryptographic drift; the optimized `web` build proves the monorepo import is deployable.

`consumeMailedEnrollmentTokenFromUrl` deletes only `token`, calls `history.replaceState` before verification, preserves other query/hash state, then retains the token only in component state for the current one-shot flow. All enrolment buttons are explicitly `type="button"`; there is no `<form>` in either route. `/verify-email` is a one-line default export alias to `../enroll-mfa/page`. Both routes are included in `TopBar`'s auth-only path set.

## RED / GREEN

- RED: focused render suite failed import resolution because `web/app/enroll-mfa/page.tsx` was absent.
- GREEN: new enrolment boundary tests `3/3`; adjacent login/sign-up tests retained in the same command, total `12/12`.
- GREEN: web TypeScript.
- GREEN: root `pnpm typecheck`.
- GREEN: `git diff --check`.
- GREEN: optimized `pnpm --dir web build`; route table contains static `○ /verify-email`, `○ /enroll-mfa`, `○ /login`, and `○ /sign-up`.

The three focused tests prove:

1. exact canonical alias, TOTP/recovery input presence, and zero native forms in source and raw render;
2. URL bearer removal happens before verification while preserving unrelated URL state; and
3. verification is exact JSON `POST /api/v1/auth/verify-email` through the same-origin proxy.

SHA-256:

- `web/app/enroll-mfa/page.tsx`: `1e487ae85036b5d0f22a9240054183ecfd2ca5c21fed07a1d538258e504a4e12`
- `web/app/verify-email/page.tsx`: `18d73f532b585837aae476fd219ce984892cf97b5423fe145c64b2d4a4e7c751`
- `web/lib/mfaEnrollment.ts`: `473bfccca13498880821ba0dc3ddc926b6da1a307a6d7446b79983294b0a626c`
- `web/lib/totpQr.ts`: `be1e2ef6369be8987def8d77d54657c53127cb90f68fbcff6d2fb930e7af87e6`
- `web/components/TopBar.tsx`: `b70ffc3633f9ed91026e92e90413e971eb40c6ecece2a88c52cd4465d0ee8873`
- `tests/render/web-auth-enrollment.test.tsx`: `0ca2e42ec30779c7f7f786be6f3a06bb8ae8566f48a60818a7fb92d47b5138d2`

## Deliberate limits

This is frontend parity only. It does not create an account, send mail, start a local auth stack, alter MFA APIs, weaken HTTPS/Secure-cookie/Origin policy, or claim a live localhost auth journey is operational.

## Requested verdict

Return exactly one of:

- `GREENLIGHT` if WEB-03 preserves the one-shot mailed-token/TOTP/recovery-code state machine without a P0/P1 bearer, native-fallback, QR-secret, response-validation, custody, route, or artifact-honesty defect; or
- `BLOCK` with concrete file/line evidence, the violated invariant, and the smallest repair.
