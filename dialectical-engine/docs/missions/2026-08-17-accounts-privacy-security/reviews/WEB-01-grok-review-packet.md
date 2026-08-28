# WEB-01 Grok 4.6 review packet

## Review scope

Review only Kanban card `t_17a55920`, **WEB-01 · Add the duplicate web login route**.

Ticket-owned files:

- `web/app/login/page.tsx`
- `web/components/AuthShell.tsx`
- `web/components/LoginFlow.tsx`
- `web/components/TopBar.tsx`
- `web/lib/authNavigationGuard.ts`
- the authentication and mobile-chrome additions in `web/app/globals.css`
- `tests/render/web-auth-login.test.tsx`

Ignore unrelated dirty-tree files. Do not edit files or run networked/destructive commands.

## Required outcome

- The separate `web/` Next application publishes `/login`.
- Login remains a cookie-native two-step `beginLogin` then mandatory `completeLogin` flow using the existing `web/lib/api.ts` client and exact same-origin proxy contract.
- Every credential-bearing native form uses a query-free same-origin POST fallback; hydration retains the typed client calls.
- No OAuth, password reset, remember-me, bearer token, browser-storage session, or origin/security relaxation is introduced.
- Password- and MFA-phase errors expose only stable public copy.
- Recovery login displays a replacement recovery code once, withholds completion, and removes all home navigation until explicit acknowledgement.
- Ordinary login retains truthful brand navigation and a fixed `/` completion target.
- The global top bar reaches `/login` through the neutral `Account` entry and remains bounded on narrow mobile screens.
- The auth route uses the reviewed warm-paper/serif/amber-outline visual system already implemented in `apps/ui`, without changing backend semantics.

## Implementation summary

`web/app/login/page.tsx` renders a small auth shell around `LoginFlow`. The flow defaults to `ContractClient`, calls `beginLogin(email,password)`, requires the returned MFA challenge, then calls `completeLogin(challenge,code)`. Both password and MFA forms are explicitly `method="post"` with `action="/login"`; their JavaScript submit handlers prevent the fallback once hydrated.

Successful ordinary authentication hard-navigates only to `/`. If the backend returns `replacement_recovery_code`, the flow synchronously locks the shared navigation guard before rendering the code. `TopBar` observes that external store and renders the brand as an `aria-disabled` non-link until the single acknowledgement button unlocks immediately before completion. Unmount also clears the guard.

`TopBar` uses brand-only auth chrome on `/login`; normal pages receive a neutral `Account` link. The CSS ports the reviewed auth hierarchy and adds a compact <=640px top bar that hides nonessential brand/context text and keeps actions bounded.

## RED / GREEN evidence

- RED: `tests/render/web-auth-login.test.tsx` failed at import because `web/components/LoginFlow.tsx` did not exist.
- GREEN: focused rendered behavior `5/5`.
- GREEN: `pnpm --dir web exec tsc --noEmit --noUncheckedSideEffectImports false`.
- GREEN: root `pnpm typecheck`.
- GREEN: `git diff --check`.
- First `pnpm --dir web build` was blocked only by sandbox DNS for Google Fonts (`ENOTFOUND fonts.googleapis.com`). The identical approved-network run passed, compiled, typechecked, generated all pages, and reported static route `○ /login` at 1.66 kB / 133 kB first-load JS.

The five rendered tests prove:

1. raw query-free POST fallback;
2. exact normalized password call followed by mandatory MFA call;
3. zero home anchors and no completion while a replacement code is unacknowledged, followed by exactly one completion;
4. password-phase internal details do not render;
5. MFA-phase code/user/endpoint details do not render.

SHA-256:

- `web/app/login/page.tsx`: `73377440d4c36f63202aad0af0010cf440494b4ad67f9fc2479606a6d4a76f51`
- `web/components/LoginFlow.tsx`: `3be59fc41148c828c4a72190e7fc35ee7bcb5bc7e9da3444414333d9cd62901d`
- `web/components/AuthShell.tsx`: `40355ac52da85a87f31f59be782df989fd3d83662052cdf47496dbfe9fe25e3b`
- `web/components/TopBar.tsx`: `5f8c14a23e4413a788643b83576ecd705da211cf1be68f8c2d322a752eafe85b`
- `web/lib/authNavigationGuard.ts`: `ba2f05ddae3f17b338e4fb48e9c9661b94539eb9d4f816354d7d7b7304281b3a`
- `web/app/globals.css`: `aab87b97a392a531723ae74e4aed6121d58270fca7645a7bcee5c2fc4ca9839f`
- `tests/render/web-auth-login.test.tsx`: `c9b1b218f025e89bcf2da00972e050fac26a9a02b93b5393ddfef4ae43f744a0`

## Deliberate limits

This card adds only `/login`. `/sign-up`, `/verify-email`, and `/enroll-mfa` remain separate pending `web/` cards. It does not claim the duplicate auth surface is complete, start a local auth stack, create an account, or weaken the production HTTPS/Secure-cookie/Origin requirements.

## Requested verdict

Inspect the scoped files and relevant existing client/proxy contract. Return exactly one of:

- `GREENLIGHT` if WEB-01 is a bounded, behaviorally correct duplicate login route with no P0/P1 security, privacy, state-machine, navigation-custody, mobile-overflow, or artifact-honesty issue; or
- `BLOCK` with concrete file/line evidence, the violated invariant, and the smallest repair.
