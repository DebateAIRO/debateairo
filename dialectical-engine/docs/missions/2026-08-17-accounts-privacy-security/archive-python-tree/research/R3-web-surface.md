# R3 — Next.js Web Surface Inventory (research asset, Wave 1)

All paths under `web/` unless absolute. Produced by the R3 research agent, 2026-08-17.

## 1. Route inventory

The App Router tree contains exactly 6 routes. No `middleware.ts`, no `error.tsx`/`not-found.tsx`, no `public/` dir, no robots/sitemap/favicon files.

| Route | File | Access | Reads | Mutates |
|---|---|---|---|---|
| `/` | `app/page.tsx` | **Public** (SSR, `force-dynamic` line 8) | Debate list via `listDebatesServer()` (line 14) | Quick-create via `LibraryComposer` — only if a valid token is already in localStorage (`components/LibraryComposer.tsx:19-26`); otherwise redirects to `/new?topic=...` (line 30) |
| `/debate/[id]` | `app/debate/[id]/page.tsx` (SSR) + `DebatePageClient.tsx` | **Public read**; mutations gated by client-side "action token" dock (`DebatePageClient.tsx:1424-1440`) | Debate detail (SSR `getDebateServer`, page.tsx:14), scoring, SSE stream (`DebatePageClient.tsx:558`) | Adaptive-depth approval (`:912`), scoring feedback (`:960`), node regeneration via `NodeDetailDrawer.tsx:150` (`regenerateNode`) |
| `/new` | `app/new/page.tsx` | `AuthGate` (client-side, line 25) | — | `createDebate` POST (line 71) |
| `/settings` | `app/settings/page.tsx` | `AuthGate` (line 44) | GET `/api/settings` (line 78) | PUT `/api/settings` (lines 140-144) — model routing, spend caps |
| `/admin/workers` | `app/admin/workers/page.tsx` | `AuthGate` wrapper (line 10) — **but the token is discarded** (`{() => <WorkersView />}`); `backendStatus()` is called with no token (`lib/api.ts:122-125`), 5 s poll (page line 33) | Worker status | — |
| `/api/[...path]` | `app/api/[...path]/route.ts` | Same as upstream — blind proxy of GET/POST/PUT/PATCH/DELETE (lines 195-213) to the coordinator (`COORDINATOR_URL`, line 4) | — | Forwards everything |

**Auth model**: all gating is client-side UI only (`components/AuthGate.tsx` — validates the stored token against `/api/settings`, lines 22-28/44). Enforcement lives in the coordinator; the web tier never blocks a request itself.

## 2. Client-side storage inventory

| Item | Where | Classification | Notes |
|---|---|---|---|
| `localStorage["dialectical:userToken"]` | `lib/api.ts:16-29` (get/set/clear); written by `AuthGate.tsx:45`, `DebatePageClient.tsx:868`; cleared on lock/invalid (`DebatePageClient.tsx:882,888`, `AuthGate.tsx:25`) | **Strictly necessary** (authentication) | The only client-side storage key in the app |
| Cookies | — | — | **ZERO.** No `document.cookie`, no `cookies()` server API, app sets none |
| sessionStorage / IndexedDB | — | — | **ZERO** |
| Third-party SDK / analytics / beacon | — | — | **ZERO** (proof below) |
| Google Fonts | `app/layout.tsx:2,6-26` (`next/font/google`: Source Serif 4, Hanken Grotesk, JetBrains Mono) | n.a. at runtime | `next/font` downloads at **build time** and self-hosts; **no runtime request to Google** from visitors' browsers |
| External network calls | `lib/api.ts:14,35` (`NEXT_PUBLIC_API_BASE`, default `""` = same-origin proxy), `lib/serverApi.ts:6`, `route.ts:4` (default `http://127.0.0.1:8000`) | Strictly necessary (first-party coordinator) | Plus `EventSource` SSE `DebatePageClient.tsx:558` — same origin |

**Proof of zero third-party (searches run, all in `web/` excluding node_modules/.next/tests):**
- `localStorage|sessionStorage|document.cookie|indexedDB` → only `dialectical:userToken` in `lib/api.ts`
- `gtag|google-analytics|googletagmanager|analytics|posthog|plausible|segment|sentry|mixpanel|amplitude|hotjar|intercom|datadog|fullstory|clarity|sendBeacon|fbq|matomo|umami|vercel/analytics` → only false positives on the CSS class `.segment` (`styles/forms.css:103`)
- `https?://` in source → single hit: docs comment in `next-env.d.ts:6`
- `<script|next/script` → none; `@import|url(` in CSS → local files only; `console.` in app code → none
- `package.json` runtime deps: `next`, `react`, `react-dom` — nothing else

## 3. Bearer token travel

- Header: `Authorization: Bearer <token>` set only in the single fetch wrapper `apiFetch` (`lib/api.ts:31-45`, header at line 33).
- Path: browser → same-origin `/api/*` → Next proxy `route.ts:141-160`, which forwards **all** request headers (deletes only `host`/`expect`, lines 149-150) → coordinator.
- **Never in URLs**: no call site puts the token in a query string; SSE `/events` (`DebatePageClient.tsx:558`) carries **no token at all** (public stream). The proxy redacts token-like query params before logging (`route.ts:27-36`).
- Inputs are `type="password" autoComplete="off"` (`AuthGate.tsx:88-90`, `DebatePageClient.tsx:1438-1440`). No console logging anywhere in app code.
- Residual: token sits in localStorage → readable by any future XSS (see §6); proxy passes any inbound `Cookie` header upstream untouched.

## 4. Logging/observability — `lib/observability/logger.ts`

- Server-only file sink: JSONL appended to `logs/developer-events.jsonl` under `process.cwd()` (lines 220-222, 238-240). **Off in production** unless `DEV_OBSERVABILITY=true` (lines 204-218); the proxy additionally gates on `NODE_ENV !== "production"` (`route.ts:23-25`). Sole importer: `app/api/[...path]/route.ts:1`.
- **Redaction that exists** (lines 83-86, 143-155): key-name pattern `[REDACTED]`s `api_key, authorization, bearer, cookie, password, private_key, provider_payload, prompt, raw_prompt, refresh_token, secret, session_token, token, access_token, client_secret`; value pattern catches `bearer <x>`, `cookie: <x>`, `password=`, `api-key=`, `prompt=`, `secret=`, `sk-...`. Strings truncated at 1024 chars, depth 6, arrays 20, keys 80 (lines 76-81). So yes — **prompt redaction is started** (key names `prompt`/`raw_prompt` and value form `prompt=` are covered).
- **What still leaks**: `userId`, `sessionId`, `debateId`, `requestId` are logged in the clear (schema lines 40-45 — `sessionId` doesn't match the pattern, only `session_token` does); free-text `message`/`context`/`expected`/`actual` are truncated but not content-redacted, so LLM argument text and debate topics pass through; a **bare token value** (random string without a `bearer `/`sk-` prefix) under a non-sensitive key survives; the proxy logs a 1024-char upstream `responseSnippet` on non-OK responses (`route.ts:102-108,182`) and full error `stack`s (`route.ts:56`).

## 5. Security headers / CSP / CORS

- `next.config.mjs` (lines 1-11): only `distDir`, optional static `export`, tsconfig path — **no `headers()`**, no CSP, no HSTS, nothing.
- No `middleware.ts` (verified by find), no `<meta http-equiv>` tags (`app/layout.tsx` has only title/description/viewport, lines 28-37).
- Deploy tier: Cloudflare tunnel (`deploy/cloudflared.config.yml`) routes `/api/*` straight to coordinator :8000 and the rest to :3000 — no header injection there either. Grep for `content-security-policy|add_header|helmet` across `deploy/` and `config/`: zero hits.
- CORS: none configured in web/; the proxy echoes upstream response headers verbatim (`route.ts:188-192`).

## 6. XSS surface

- **No markdown/HTML rendering of LLM content anywhere.** Zero `dangerouslySetInnerHTML` in app code; the only `innerHTML` hits are Playwright test fixtures (`tests/s6-library/responsive-library.spec.ts:102`, `tests/s3-chrome/headerViewport.spec.ts:199`). No markdown/remark/DOMPurify dependency (`package.json` deps: next/react/react-dom only).
- Render path is plain React text interpolation (auto-escaped): thread `{generation?.argument || node.claim}` (`components/DebateThread.tsx:200`, `:205`); canvas (`components/DebateCanvas.tsx:392,397-403`); drawer (`components/NodeDetailDrawer.tsx:239-246,331`); list card `{debate.topic}` (`app/page.tsx:53`).
- Residual sinks: LLM strings interpolated into `aria-label`/`title` attributes (e.g. `DebateCanvas.tsx:377,470`) — React-escaped, safe; upstream error text rendered as `{error}` text nodes — safe.

## 7. Consent banner / privacy / terms

**None exist.** Grep for `consent|gdpr|privacy|terms` across web/ returns only unrelated code comments (e.g. "key_terms" in `lib/types.ts:142`). No privacy-policy or terms route, no cookie banner component. Footer/brand shows `dezbatere.ro` (`components/TopBar.tsx:21`). "Export" is a stub toast, not a real download (`DebatePageClient.tsx:1095,1148`).

## UNKNOWN

- Whether the coordinator enforces auth on `/api/backends/status` and the public read endpoints — outside web/ (see R1).
- Production hosting beyond the cloudflared sample (real hostnames, any Cloudflare-managed headers/analytics injected at the edge) — not represented in the repo.

## RISK SUMMARY

1. **No security headers at all** — no CSP, HSTS, X-Frame-Options, Referrer-Policy at Next or tunnel tier (`next.config.mjs`; no middleware; `deploy/cloudflared.config.yml`).
2. Bearer token in **localStorage** (`lib/api.ts:18`) — stealable by any future XSS; current XSS surface is minimal (pure React text rendering, no HTML injection).
3. All auth gating is **client-side UI**; `/admin/workers` fetches status **without any token** (`app/admin/workers/page.tsx:10` + `lib/api.ts:122-125`) — enforcement rests entirely on the coordinator, and the `/api/[...path]` proxy forwards everything blindly.
4. Public SSE `/api/debates/{id}/events` is unauthenticated (`DebatePageClient.tsx:558`).
5. Logger redaction covers token/prompt **key names** but leaks `userId`/`sessionId`, free-text context, LLM content, and bare token values; dev-only file sink `logs/developer-events.jsonl` (prod-off by default).
6. Debate topic (user content) placed in URL query `/new?topic=...` (`LibraryComposer.tsx:30`) — lands in history/server logs.
7. GDPR posture is actually clean: zero cookies, zero third-party/analytics calls (proven), one strictly-necessary localStorage key — but **no privacy notice or terms page exists**, which is itself the gap.
