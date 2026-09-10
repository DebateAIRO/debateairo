# Dev stack for a REV(S01) lens — measured 2026-09-10 03:40 EEST at main-tree HEAD `a1e3e421`

**Never:** the `:3000` https stack (V's — launch.json entries `ui`, `dev-stack`, `consent-lane-full-stack`), the API on `:8790`, the live dev database `127.0.0.1:55432`, `.local/**` (provider config with authorization headers — never print it), the S01/S02 lanes, ports 4000/4010/4020/4599 (other launch.json entries). Nothing opened on V's desktop: not the playwright plugin (`npx @playwright/mcp` launches a headed Chromium window), not `open`, not a Terminal.

**Listener baseline at assembly** (2026-09-10 03:24, `lsof -nP -iTCP:3000 -sTCP:LISTEN` and the same for `:8790`): no process listened on either port — a lens that finds one at its exit did not inherit it, and a lens that finds none did not kill it.

## What `/new` needs before it renders (measured)
1. `apps/ui/app/new/page.tsx:59` wraps the form in `<AuthGate>`; `apps/ui/components/AuthGate.tsx:12-23` awaits `validateSession()` on mount and, on rejection, runs `window.location.replace("/login")`.
2. `apps/ui/lib/api.ts:122-123` — `validateSession` is `await client.readSession()`.
3. `packages/contract/src/client.ts:504-505` — `readSession` = `GET /v1/session` validated by `SessionSchema`; `submitAsk` = `POST /v1/asks` validated by `AskAcceptedSchema` (schemas in `packages/contract/src/index.ts`; the ask's `plan_tier: PlanTierSchema` at `:118`).
4. The browser calls `/api/v1/…` on the UI server (`NEXT_PUBLIC_API_BASE=/api`); `apps/ui/app/api/[...path]/route.ts:41-67` forwards `/api/<path>` to `DIALECTICAL_API_BASE/<path>`, forwarding only the `__Host-debateai-session` / `__Host-debateai-csrf` cookies (`:37-38`, `:90`) and an allow-list of headers that includes `x-csrf-token` (`:22`).
5. The form's own mount effect (`page.tsx:86-100`) calls `readSession()` again for defaults; its failure only prints `ASK_SESSION_DEFAULTS_UNAVAILABLE` on screen.

## Recipe — your own fixtures in your scratch dir, never a product file
- **A stub API** on a free port (8791 or higher, checked with `lsof -nP -iTCP:<port> -sTCP:LISTEN`): `GET /v1/session` → 200 with a body that satisfies `SessionSchema`; `POST /v1/asks` → 202 with a body that satisfies `AskAcceptedSchema`; log every request line and body verbatim (steps 11–12 read `plan_tier` from the body). Whether the client also needs the CSRF cookie/header pair is yours to find; a 202 you cannot obtain is UNVERIFIED, and the request BODY is still observable.
- **The UI dev server from YOUR worktree**, background, logging to a file (mirrors the launch.json entry `tiers-s01-ui`):
  `cd <your worktree>/dialectical-engine/apps/ui && DIALECTICAL_UI_HOST=127.0.0.1 PORT=<free port> DIALECTICAL_API_BASE=http://127.0.0.1:<stub port> NEXT_PUBLIC_API_BASE=/api nohup node server.mjs --dev > <scratch>/ui.log 2>&1 &`
  The dev server compiles `globals.css` at boot; you change no CSS, so one boot is enough.
- **The browser:** the harness's in-app Browser pane — tools `mcp__Claude_Browser__*` (probed 2026-09-10 03:27: a background subagent can call `tabs_context`). `tabs_create` your own tab, `navigate` it to `http://127.0.0.1:<port>/new`, measure with `javascript_tool` (`getComputedStyle`, `getBoundingClientRect`), read structure with `read_page`, look with `computer` (`screenshot`, `zoom`), `tabs_close` your tab before your handoff. The pane already holds a `seed` tab at `https://localhost:3000` (V's stack) and a `file://` MOCK probe tab — never act on either.
- **Modes:** `html[data-mode="chamber"]` (`apps/ui/app/globals.css:115`); the top-bar button `[data-mode-toggle]` (`apps/ui/components/ModeToggle.tsx:36`, aria-label "Switch to Chamber mode" / "Switch to Terracotta mode") sets `document.documentElement.dataset.mode` and `localStorage["debateai.mode"]` (`ModeToggle.tsx:13-24`).
- **Before your handoff:** kill your processes by PID, leave your worktree byte-clean (`git status --porcelain` empty), name every port you used.
