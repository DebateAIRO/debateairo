# GROK REVIEW: ACC-01 · rev 3 (same-origin proxy delta)

**Verdict: APPROVED**

Independent GROK seat review of the ACC-01 **same-origin proxy fix only**
(post–rev-2). Rev-2 approved the acceptance rework diamond; this seat covers
**only** the web proxy / browser-base delta added after orchestrator directed
finding `2026-08-09 17:47` on ticket `t_0dc09131`. Sources: shipped
`web/app/api/[...path]/route.ts` + `route.test.mjs`,
`web/app/api/proxyHeaders.source-test.mjs`, `web/lib/api.ts`,
`web/lib/serverApi.ts`, `web/.env.local`, related S14 unit/architecture tests,
own `reviews/grok-acc01-rev2.md` for delta framing, ticket comments (hermes
kanban show, read-only), `git status` / scoped diff. Claude/other-seat review
files were **not** opened. Board was **not** mutated. Evidence captures live
only in private reviewer scratch (`acc01-rev3-*.log`).

## Ticket context (newest relevant comments)

| When | Author | Relevance |
|---|---|---|
| `2026-08-09 17:47` | claude-orchestrator | **DIRECTED FINDING**: browser Settings Verify → `NETWORK_FAILURE`; OPTIONS to `127.0.0.1:8790` 404 (CORS preflight); V3 `app/api/[...path]` empty; fix = same-origin proxy + client `/api` base |
| `2026-08-09 17:49` | codex | REWORK ACKNOWLEDGED — implement V3 catch-all proxy; no invented headers; browser never hits acceptance port |
| `2026-08-09 17:58` | codex | PROXY FIX READY — route + client base + TDD GREEN claims; orchestrator-owned browser re-proof remaining |
| `2026-08-09 18:02` | claude-orchestrator | **PROXY FIX VERIFIED IN REAL BROWSER**: Settings Verify → GET `/api/v1/session` 200 + `/api/v1/deployment` 200 same-origin; NETWORK_FAILURE gone |

Comments read through: `2026-08-09 18:02` PROXY FIX VERIFIED IN REAL BROWSER.

## Per-delta checklist

| # | Delta | Judgment | Evidence |
|---|---|---|---|
| 1 | Faithful forwarding: method / path / query / body / `x-user-dev-token` | **VERIFIED FIXED** | `proxyApi` uses `request.method`, builds path from `context.params.path` via `encodeURIComponent` segments, copies `source.search` onto target, forwards non-bodyless body as `arrayBuffer()`, and copies request headers after stripping only `host`/`expect` (`route.ts:37-49`, `26-35`). Behavior suite: target URL `http://acceptance.local:8790/v1/asks?mode=live`, method POST, body JSON, token `token:test`, exact header key set `content-type` + `x-user-dev-token` only (`route.test.mjs:52-83`). This seat re-ran: **3/3 pass**. |
| 2 | SSE-safe streaming (response body not buffered into invented bytes) | **VERIFIED FIXED** | Response construction passes `response.body` for non-HEAD / non-bodyless statuses (`route.ts:51-58`). Test enqueues a second SSE chunk after the proxy returns and asserts full stream text within 250 ms race (would reject on buffer stall) (`route.test.mjs:85-109`). Architecture structural assert requires `response.body` in route source (`s14-contract.test.ts:29`). |
| 3 | No invented request headers (strip transport-owned only) | **VERIFIED FIXED** | Only mutations: `headers.delete("host")`, `headers.delete("expect")` (`route.ts:40-42`). No Authorization/content-type fabrication. Source suite asserts both deletes and all ordinary method exports (`proxyHeaders.source-test.mjs:7-16`). Behavior suite asserts `host`/`expect` null and exact forwarded key set. This seat: **2/2** source + **3/3** behavior GREEN. |
| 4 | Loud typed pass-through on missing base / upstream failure (DR-115) | **VERIFIED FIXED** | Absent/empty `DIALECTICAL_API_BASE` throws `DIALECTICAL_API_BASE_REQUIRED`; invalid URL/protocol throws `DIALECTICAL_API_BASE_INVALID` (`route.ts:8-23`). Missing-base suite rejects with `/DIALECTICAL_API_BASE_REQUIRED/` and never calls fetch (`route.test.mjs:111-123`). Upstream status/statusText/headers/body are returned as-is (`route.ts:51-58`); no success-masking catch. Status 202 + `x-upstream: kept` proven in behavior suite. |
| 5 | Browser default same-origin `/api` + loud rejection of cross-origin `NEXT_PUBLIC_API_BASE` | **VERIFIED FIXED** | `API_BASE = process.env.NEXT_PUBLIC_API_BASE \|\| "/api"` (`api.ts:3`). `normalizeSameOriginApiPath` requires path starting with `/` and rejects `//` (protocol-relative) with `NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH` (`api.ts:5-11`). `createBrowserContractClient` rewrites contract URLs onto `${sameOriginApiPath}${pathname}${search}` (`api.ts:13-24`). Unit: `readSession` hits `/api/v1/session` with token (`s14-ui.test.ts:198-216`). Architecture: browser source contains `"/api"`, env contains `NEXT_PUBLIC_API_BASE=/api` (`s14-contract.test.ts:19-30`; `web/.env.local`). Diff confirms prior default was cross-origin `http://127.0.0.1:8000`. |
| 6 | SSR remains server-only upstream; no privileged inventing path | **VERIFIED FIXED** | `serverApi.ts` reads only `DIALECTICAL_API_BASE` (fallback `http://127.0.0.1:8000`); **removed** prior `NEXT_PUBLIC_API_BASE` fallback (`serverApi.ts:5-7`; scoped diff). SSR does not go through the browser `/api` rewrite. |
| 7 | Real suites re-run this seat + scope hygiene | **VERIFIED FIXED** | **Vitest** `./node_modules/.bin/vitest run tests/unit/s14-ui.test.ts tests/architecture/s14-contract.test.ts` → **2 files / 18 tests GREEN** (scratch `acc01-rev3-vitest.log`). **Proxy node:test**: `proxyHeaders.source-test.mjs` **2/2 GREEN**; `route.test.mjs` **3/3 GREEN** via cwd=`web/` wrapper import (Node 22 `node --test` treats `[...path]` as a char-class glob and matches zero files when the path is passed raw — suite body still executes the real compiled route; scratch `acc01-rev3-proxy-route.log`). **Git**: proxy product surface is `?? web/app/api/`, `M web/lib/api.ts`, `M web/lib/serverApi.ts`, `?? web/.env.local`, plus authorized S14 test updates; wider dirty tree (acceptance, judgement, critique, TERM-01, ledger, etc.) is pre-existing ACC-01/TERM-01 work **not introduced by this review seat**. This seat wrote **only** this review file. |

## Findings

None **BLOCKING**.

1. **ADVISORY** — No dedicated unit test asserts that `createBrowserContractClient("http://…")` / `"//evil"` throws `NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH`. Shipped code does throw at normalize time; happy-path `/api` rewrite is covered. Prefer one RED/GREEN assertion for the reject paths so a future default regression is suite-loud.

2. **ADVISORY** — `node --test app/api/[...path]/route.test.mjs` from `web/` reports **0 tests** on Node v22.23.1 because `[...path]` is glob character-class syntax. The suite is real (3/3 via non-bracket wrapper import of the same file). Operator/docs should document the launcher workaround so the suite is not mistaken for empty.

## Residual honesty (non-blocking)

- This rev-3 approval is **only** the same-origin proxy delta. It does **not** re-certify ACC-01 rev-1/rev-2 harness, live-ceremony settle, or TERM-01 DONE-WHEN.
- Orchestrator already re-proved Settings Verify in a real browser (`2026-08-09 18:02`); this seat did not re-run live browser E2E (environment non-goal; static + unit + node behavior + ticket record suffice for the code delta).
- Full monorepo green and live settle remain outside this review.

GROK REVIEW: APPROVED — ACC-01 (rev 3)
