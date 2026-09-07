# V test point — serving the consent-ui lane in the https dev stack (written by the orchestrator, 2026-09-07 05:30)

**Why this file exists.** Every coding seat reported S02-S69 as `UNVERIFIED — dev stack not serving this branch`: the stack that is up (pid 5436, started 2026-09-02 23:08) was launched from the MAIN tree, and `pnpm dev:auth:up` serves exactly the directory it is run from (`apps/runner/src/dev-auth-stack-cli.ts:38-41` passes `process.cwd()` as the repository root; the UI child runs with `cwd = <root>/apps/ui`, `apps/runner/src/dev-ui-process.ts:174-189`; `apps/ui/server.mjs:16-17` gives Next no `dir`). There is no root or port override, every port is a fixed constant with an occupied-port refusal (3000 front door, 3001 UI, 8790 API, 8791–8793 provider panel), so **two stacks cannot run at once** and the main-tree stack must be stopped first. Nothing here is performed by the harness: the dev stack is V's.

## The recipe (V runs it; each step's cwd is explicit)
```bash
# 0. See what is live
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':3000|:3001|:8790'

# 1. Stop the main-tree stack (Ctrl-C in its terminal, or SIGTERM the supervisor — reverse-order teardown, dev-auth-stack-cli.ts:9-13)
kill -TERM 5436
until ! lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; do sleep 1; done
# Docker postgres/hatchet-lite stay up: this run REUSED them (startedServices: []), so teardown does not stop them.

# 2. Copy the custody tree — real copies with modes preserved (dirs 0700, files 0600, nlink 1). NEVER symlink, NEVER cp -al (both refused: dev-api-environment.ts:83-116).
cp -Rp /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.local \
       /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine/.local

# 3. Drop the copied api.env — it embeds MAIN-tree absolute paths and would trip DEV_API_ENVIRONMENT_DRIFT; dev:auth:up regenerates it (dev-auth-stack.ts:142-145).
rm /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine/.local/dev-auth/api.env

# 4. (recommended) refresh the bin shims in the lane (the cloned node_modules/.bin/tsx still names the main tree in NODE_PATH — harmless, but clean)
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine && pnpm install

# 5. TLS leaf for this checkout (reuses the copied pems; mkcert CA already trusted)
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine && pnpm dev:auth:generate-tls   # expect DEV_TLS_CERTIFICATE_READY

# 6. Start the WHOLE stack from the lane (foreground; keep the terminal)
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine && pnpm dev:auth:up
# expect DEV_AUTH_STACK_READY=https://localhost:3000:RUNNER_REGISTERED

# 7. Browse https://localhost:3000/sign-up (http is not a fallback). The verification e-mail lands as a file:
ls -t /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine/.local/dev-auth/mail/*.eml | head -1
```
Stop: Ctrl-C in the `dev:auth:up` terminal. Back to the main tree: `cd` there and `pnpm dev:auth:up` again (its own `api.env` is untouched).

## Do NOT regenerate secrets in the lane
The database is SHARED (compose project `debateai-v3`, Postgres `127.0.0.1:55432`, `compose.dev.yaml:1,16`). `dev:auth:provision-principals` would mint new passwords and `ALTER ROLE` on that shared DB (`dev-database-principals.ts:101,280-305`), invalidating the main tree's `database-principals.env`/`api.env`; a new KEK against the retained DB is unrecoverable local-account data loss (`docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.md`, "Persistent custody"). Copy, never regenerate.

## Why the full stack and not `dev:auth:ui`
`/sign-up` submits through `SignUpFlow.tsx:84` → same-origin `/api/*` → `apps/ui/app/api/[...path]/route.ts` → `DIALECTICAL_API_BASE=http://127.0.0.1:8790` (`dev-ui-process.ts:94-95`): the API, Postgres, Hatchet, the secrets and the sendmail capture dir are all needed; `dev:auth:ui` alone fails with `DEV_UI_PROCESS_API_UNAVAILABLE` (`dev-ui-process.ts:81-84`). The provider panel needs at least one CLI handshake on 8791–8793 (Codex/Claude answer today; Grok absent is tolerated).

## What to test (the slices' acceptance, in the design's words)
1. **10a bar** on any route as a first-time visitor: copy, three buttons in the design's order, 22px inset, the 720px stack rule; `Accept all` / `Only necessary` store a decision and the bar leaves; reload → no bar.
2. **10b card** via `Choose what to store`: the category switches, `Save choices`, the `Privacy notice` link opens the policy OVER the card; `Esc` once closes only the policy; `Esc` again closes the card and focus returns to `Choose what to store` (CROSS-01). Settings → Privacy re-entry: `Cookie preferences` reopens the card; on close focus returns to `Cookie preferences`.
3. **10c on `/sign-up`**: the `I agree with the privacy policy` row opens the modal; the box ticks ONLY after scrolling to the end and pressing `I have read it`; closing without it leaves the box unticked; `Create account` stays disabled until BOTH `I am 18 or over.` and the privacy box are ticked; with the cookie card open and the sign-up policy over it, ONE `Esc` closes the policy and the card survives (CROSS-02, the B1 fix).
4. Both modes (default and `chamber`) for every surface; keyboard only for one full pass.

## Unknowns the research could not settle (report what you see)
`dev:auth:seed-register` REUSED vs drift refusal on a Grok-absent boot (same risk as any main-tree restart) · whether the copied `mail/` spool's existing `.eml` files disturb the sendmail preflight (if so, `rm` the copies) · Next's cold build resolving `next/font/google` offline (no `.next` font cache in the lane) · whether the wrapper above pid 5436 respawns it (if so, kill the wrapper chain).
