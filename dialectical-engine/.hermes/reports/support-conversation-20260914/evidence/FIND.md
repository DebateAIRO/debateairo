# FIND evidence — existing Forgot password destination

## Result

**Destination: UNKNOWN, owner-confirmed feature; do not declare absent.**

Exact question sent to the orchestrator for the owner:

> What is the exact existing “Forgot password” destination we must reuse—please provide either its canonical URL/path or the UI control and screen that opens it?

No email, password, OTP, recovery code, reset token, authentication, or recovery request was entered or submitted. No service was started, stopped, or modified.

## Current source at the assigned base

- Base verified as `446c685e977104ecf2b0b5ee0519f7123968429f`; the checkout had 157 pre-existing dirty entries at claim time.
- `apps/ui/app/login/page.tsx:18-19` redirects an already-authenticated browser home and otherwise mounts `LoginFlow`.
- `apps/ui/components/LoginFlow.tsx:45-55` stores sign-up navigation and login/MFA state. Its signed-out form at `apps/ui/components/LoginFlow.tsx:169-220` contains email, password, and Continue; its only account-navigation link is Create one. Its later recovery-code control at `apps/ui/components/LoginFlow.tsx:289-304` is the saved MFA recovery-code method, not password recovery.
- `packages/contract/src/client.ts:376-380` implements `startRecovery(email)` as `POST /v1/auth/recovery/start`. This proves a partial backend integration only; it is not a user-facing route or opener.
- `apps/ui/components/authRoutes.source-test.mjs:25-37` asserts the MFA login contract and explicitly rejects `forgot` text.
- `tests/architecture/auth-front-door-parity.test.ts:58-80` applies the same exclusion to both UI copies.
- The current build's `apps/ui/.next/server/app-paths-manifest.json` listed only `/api/[...path]/route` and `/login/page` at inspection time; this manifest is incomplete for the dev server and was not used alone to infer absence.

### Bounded branch/history search

Searched these 12 refs without checkout: `codex/auth-contract`, `codex/auth-integration`, `codex/auth-post-fallback`, `codex/auth-recovery-nav-guard`, `codex/auth-ui`, `codex/auth-ui-qa-fixes`, `dev`, `dev-clean`, `main`, `integration/all`, `origin/dev`, and `origin/main`.

Search terms covered exact Forgot password, password-reset/recovery copy, and `startRecovery` under `apps`, `web`, `packages`, and `tests`. No ref exposed a Forgot password UI label, route, or opener. Only `dev`, `integration/all`, and `origin/dev` exposed `startRecovery`; history searches found no commit adding `Forgot password` copy.

## Running target app, read-only

Listener inventory showed the existing main UI on `127.0.0.1:3001`, API on `127.0.0.1:8790`, and provider/relay listeners on `127.0.0.1:8791-8796`. No listener was present on supported public port 3000.

The target was inspected through the hidden in-app browser:

| Surface | Observed navigation/control inventory | Forgot destination |
|---|---|---|
| `http://127.0.0.1:3001/login` | Links: `/`, `/sign-up`; buttons: theme toggle, credential-form Continue; form action `/login` POST | None |
| linked signed-out home `/` | Landing links/anchors, three `/login?next=%2Fnew` CTAs, Help opener | None |
| linked full Help page `/help` | Account link `/login`, settings/help shortcuts, human handoff controls, support form | None |

The Help account category was opened without submission; it only prefilled the safe question “How do I manage MFA and active sessions?” and exposed no recovery destination. No form was submitted.

## Supported preview lifecycle and ports

The supported entry point is `pnpm dev:auth:up` (`deploy/dev-auth/README.md:9-25`). `apps/runner/src/dev-auth-stack.ts:136-181` runs these stages in order:

1. Refuse an occupied public port 3000.
2. Start the CLI provider panel.
3. Start the Support-model relay.
4. Start/attest the PostgreSQL + Hatchet data plane.
5. Provision the Hatchet token.
6. Assemble the exact API environment.
7. Start API, runner, private UI, then trusted TLS front door.

The supported receipts require public `https://localhost:3000`, private UI `127.0.0.1:3001`, API `127.0.0.1:8790`, provider/relay ports `8791-8796`, PostgreSQL `127.0.0.1:55432`, and Hatchet `7077`/`8888` (`apps/runner/src/dev-auth-stack.ts:80-92`; `apps/runner/src/dev-ui-process.ts:6-8`; `apps/runner/src/dev-provider-panel.ts:30-54`; `acceptance/hermes-relay.ts:19`; `compose.dev.yaml:16-17,30-32`). The front door's readiness probes `/login` and anonymous `/api/v1/session` before declaring `SYSTEM_TRUST` (`deploy/dev-auth/tls-front-door.mjs:316-346`). Shutdown owns only resources started by the invocation and runs in reverse order (`apps/runner/src/dev-auth-stack.ts:122-133,203-210`).

### Non-conflicting plan

Ports 3100, 3101, and 8890 were probed and had no listeners, so they are candidate public/UI/API ports. They are **not currently supported by the single-command lifecycle**: public/UI/API/provider/relay endpoints are fixed and exact-environment validation pins `PUBLIC_APP_URL=https://localhost:3000` and API port 8790. The running target already owns 3001 and 8790-8796, so `pnpm dev:auth:up` must not be started alongside it. A safe review stack requires either:

- owner/orchestrator coordination to stop and later restore the existing owned stack, or
- a reviewed port-namespace change covering public origin, UI proxy, API, provider panel, Support relay, readiness probes, and exact environment as one coherent configuration.

No preview start is recommended until the heavy lease is granted and one of those routes is selected.

## Verification record

Read-only commands used:

```text
git rev-parse HEAD
git status --short | wc -l
rg -n -i ... apps packages tests docs/superpowers/research/2026-09-14-support-agent-product-map.md
git grep -n -i -E ... <12 bounded refs> -- dialectical-engine/apps dialectical-engine/web dialectical-engine/packages dialectical-engine/tests
git log --all --oneline -S'Forgot password' -- dialectical-engine/apps dialectical-engine/packages dialectical-engine/tests
git log --all --oneline -G'password...reset|recover...' -- dialectical-engine/apps/ui dialectical-engine/packages/contract dialectical-engine/apps/api
git worktree list --porcelain
git branch -a --no-color
lsof -nP -iTCP -sTCP:LISTEN
lsof -nP -iTCP:3100 -iTCP:3101 -iTCP:8890 -sTCP:LISTEN
```

UI verification used in-app browser navigation only and read-only DOM/AX inspection. Tests/builds: **not run**; this seat had no heavy-command lease.

## UNVERIFIED

- The canonical owner-confirmed URL/control remains unverified pending the owner's answer.
- `https://localhost:3000` could not be inspected because no listener was active; no TLS bypass was attempted.
- The candidate free ports are a moment-in-time listener check, not a supported configuration or reservation.
