# S3 — UI & Client-Storage Inventory (research asset, Wave 1)

Scope: `apps/ui`. Read-only audit, 2026-08-17. All citations relative to the `dialectical-engine` root.

**Headline:** unusually clean surface — **zero third-party origins, zero `dangerouslySetInnerHTML`, zero `console.*`, one storage value**. The real risks are token handling and missing headers, not tracking or XSS.

> **Method note (F1 discipline):** the agent's first sweep used an unquoted shell variable for paths; zsh does not word-split unquoted expansions, so grep silently errored and produced false "zero results". Caught because `lib/api.ts:57` contains `http://sentinel.invalid` yet the URL grep returned empty. **All results below are re-runs with literal paths plus a positive-control grep (`fetch\(` → 2 known hits) proving grep works.**

## 1. Route inventory

From the build manifest (`apps/ui/.next-build/app-path-routes-manifest.json`):

| Route | File | Gate | Reads | Mutates |
|---|---|---|---|---|
| `/` | `apps/ui/app/page.tsx` | **None** (SSR, `force-dynamic:7`) | cookie token `:22`; `listDebatesPageServer` (`lib/serverApi.ts:37`) | — |
| `/new` | `apps/ui/app/new/page.tsx` | `AuthGate` `:32` | `readDeployment` `:64`, `readSession` `:80` | **`POST /v1/asks`** via `createDebate` `:128` |
| `/debate/[id]` | `app/debate/[id]/page.tsx` → `DebatePageGate.tsx:27` → `DebatePageClient.tsx` | SSR reads cookie `:22` **before** any gate; then `AuthGate` | `readAnswer`/`readRunAnswer`/`readRun` (`serverApi.ts:70-83`), ledger digest, inspection, event stream | `recordInvestigation`, **`unlinkMemory`** (`DebatePageClient.tsx:709`) |
| `/settings` | `app/settings/page.tsx` | `AuthGate` `:35` | `readDeployment` `:45` | Read-only by design (`saveSettings` rejects, `lib/api.ts:330`). **Except** `EvaluatorDevMenu` `:178` → `POST /v1/dev/evaluator/consumer-selection` (`lib/api.ts:323`), gated to non-prod + `NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED` `:11-12` |
| `/admin/workers` | `app/admin/workers/page.tsx` | `AuthGate` `:10` — **no role check** | `readDeployment`→`backendStatus`; polls every 5 s `:33` | — |
| `/api/[...path]` | `app/api/[...path]/route.ts` | **None** | catch-all proxy | all 7 methods `:72-98` |

**Finding — `/admin/workers` and `/settings` carry no privilege check.** The contract distinguishes `caller_scope: "ASKER" | "OPERATOR"` and `ownership_provenance: "user_dev_token" | "operator_dev_token"` (`packages/contract/src/index.ts:152-153`), but `AuthGate` only proves *a* token resolves to *some* session (`components/AuthGate.tsx:48`). Any valid asker token renders both admin screens. The UI's "admin" path is naming, not authorization.

## 2. Client-side storage inventory (GDPR-critical)

**Complete inventory — 2 entries, both the same value:**

| # | Mechanism | Key | Written | Attributes | Class |
|---|---|---|---|---|---|
| 1 | **Cookie** | `debateai:user-dev-token` | `lib/api.ts:110` | `Path=/; SameSite=Lax` — **no `Secure`, no `HttpOnly`, no expiry**, set via `document.cookie` | Strictly necessary (auth) |
| 2 | **localStorage** | `debateai:user-dev-token` | `lib/api.ts:107` | persistent | Strictly necessary (auth) |

Cookie constant duplicated server-side as `USER_TOKEN_COOKIE` (`lib/serverApi.ts:14`), read by SSR via `next/headers` `cookies()` (`app/page.tsx:22`, `app/debate/[id]/page.tsx:22`). Cleared at `lib/api.ts:115-116`.

**Nothing else exists:** no sessionStorage, IndexedDB, Cache API, service worker, `public/`, or web manifest.

**Consent implication:** both entries are strictly-necessary auth credentials → **consent-exempt** under ePrivacy Art. 5(3); a cookie *banner* is not legally required today (`UNVERIFIED — counsel`). Privacy-policy disclosure still is, and none exists (§7).

**Third-party proof (all re-run with literal paths):**

| Grep | Result |
|---|---|
| **Positive control** `fetch\(` | ✅ 2 hits (`route.ts:52`, `api.ts:301`) — grep proven working |
| analytics/marketing SDKs (13 vendors + sendBeacon/_paq) | **0 real** — all hits are CSS class `.segment` / `(segment) =>` lambdas |
| `<script>/<Script>/next/script/<link>/<iframe>/<img>/<object>/<embed>` | **0 real** — 2 hits are `WeakSet<object>` |
| `http` URL literals | **5, none a network target**: SVG namespace, protocol compare, `sentinel.invalid` (parse base), `http://localhost` SSR placeholder |
| `@import`/`url(`/`@font-face`/`src:` in `globals.css` (3651 lines) | **0** |
| `XMLHttpRequest`/`EventSource`/`WebSocket`/`Worker`/`navigator.`/`window.open` | **0 real** (2 comments) |
| serviceWorker/caches/workbox/robots/sitemap | **0** |
| crossOrigin/referrerPolicy/integrity/target=_blank | **0** |

**Fonts:** `app/layout.tsx:1` uses `next/font/google` (Source Serif 4, Hanken Grotesk, JetBrains Mono) — build-time download, self-hosted. Proven: **44 `.woff2` emitted** to `.next-dev/static/media/`; `grep -rl "fonts.googleapis\|fonts.gstatic"` over build output → **zero**. No runtime Google request, no consent trigger, no US transfer.

**Dependencies:** `apps/ui/package.json:14-20` = `next`, `react`, `react-dom`, workspace `@debateai/contract` + `@debateai/kernel`. Only transitive third-party runtime lib reaching the browser is **`zod@4.4.3`** — schema validation, no network/storage.

**Conclusion: zero analytics, zero marketing, zero preferences storage, zero non-first-party origins.**

## 3. Token handling

- **Obtained:** pasted manually; two entry points, both `type="password" autoComplete="off"` (`components/AuthGate.tsx:89-96`; token dock `DebatePageClient.tsx:1490-1500`). Validated via `readSession` before storage (`lib/api.ts:132`, `AuthGate.tsx:48-50`) — invalid tokens never persist.
- **Stored:** dual-written to localStorage **and** a JS cookie in one function (`lib/api.ts:105-111`); the cookie exists so SSR can read it (comment `:108-109`).
- **Attached:** always as header `x-user-dev-token` (`packages/contract/src/client.ts:91` JSON, `:136` event stream; `lib/api.ts:306` dev menu).
- **Never in a URL** (no `?token=`). But `?topic=` (`components/LibraryComposer.tsx:30` → `app/new/page.tsx:40`) puts **the user's debate question into the URL, browser history, and server access logs**.
- **Never logged:** `console.(log|warn|error|info|debug)` across `app components lib` → **zero**. The file-writing `developerLogger` (`lib/observability/logger.ts:224-256`, redaction `:84-86`) is **never imported** — dead code from the UI's perspective.

**The `/api` proxy forwards headers blindly — confirmed** (`app/api/[...path]/route.ts:40-42`): only `host` and `expect` removed (intentional per the disabled test `proxyHeaders.source-test.mjs.disabled:8-9`). Consequences:
1. The **`Cookie` header — including the token — is forwarded upstream on every call**, alongside the intended `x-user-dev-token`. The credential travels by two channels; only one is designed.
2. Any attacker-influenced header (`Authorization`, `X-Forwarded-*`, `Origin`) reaches the API verbatim.
3. Response headers are copied back wholesale (`:67`) — upstream `Set-Cookie`/CORS pass through unfiltered.
4. `OPTIONS` is proxied (`:96`) → **CORS policy is entirely upstream's**.
5. The catch-all reaches **any** upstream path incl. `/v1/dev/*`, regardless of UI flag gating.

Mitigating: client base hard-locked same-origin by `normalizeSameOriginApiPath` (`lib/api.ts:40-65`) rejecting backslashes/`//`/`..`; upstream base must be explicit `http(s)` or the proxy throws (`route.ts:8-24`).

## 4. XSS surface

**Plain React text interpolation everywhere. No HTML injection path exists.**
- `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function` → **0 occurrences**.
- **No markdown renderer, no sanitiser** in the dependency tree — none needed.

Render paths (all auto-escaped JSX children): node claim (`DebateCanvas.tsx:332,439`; `DebateTree.tsx:164`; `DebateThread.tsx:202`; `DebateSplit.tsx:247,314`; `NodeDetailDrawer.tsx:227`); argument body (`DebateCanvas.tsx:434,445`; `DebateTree.tsx:173`; `DebateThread.tsx:208`; `DebateOutline.tsx:68`; `DebateSplit.tsx:132,321`; `NodeDetailDrawer.tsx:230,326`); verdict (`SynthesisPanel.tsx:55,62,72,94`); answer segments joined as text (`lib/v3/adapter.ts:200`); streamed deltas as strings (`lib/v3/liveEvents.ts:102,162`). Model text also flows into `aria-label`/`title` — escaped attribute values, not a vector.

Note (not a vulnerability): export builds a `data:application/json` URI (`lib/v3/answerExport.ts:87`) used by `<a href download>` — non-scriptable MIME, `JSON.stringify`-encoded; safe, but materialises a full answer payload into the DOM as a URI string.

## 5. Security headers / CSP / CORS — **nothing exists**

| Control | Status | Evidence |
|---|---|---|
| `middleware.ts` | **Absent** | `find apps/ui -maxdepth 2 -name "middleware*"` → none |
| `headers()` in Next config | **Absent** | `next.config.mjs:1-21` — only transpilePackages/distDir/output/typescript/webpack |
| Compiled header rules | **Empty** | `.next-build/routes-manifest.json` → `"headers": []` |
| CSP (header or meta) | **Absent** | `app/layout.tsx:32-43` emits no `<meta>` |
| HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy | **All absent** | same |
| CORS | **Not asserted by the UI** | delegated wholesale upstream (`route.ts:67,96`) |

Positive: `typescript.ignoreBuildErrors: false` (`next.config.mjs:7`) — type errors block the build.
Because there is no CSP and no `X-Frame-Options`, the app is **framable** (clickjacking on the ask/unlock forms) with no defence-in-depth backstop for the localStorage token.

## 6. Live updates

**Authenticated fetch streaming — not EventSource, not polling.** `streamEvents` (`packages/contract/src/client.ts:180-199`) reads `response.body.getReader()`, splits SSE frames, and **validates every frame through `RunEventSchema.parse`** (`:147-158`). Authenticated by header `x-user-dev-token` (`:136`); rationale documented at `DebatePageClient.tsx:556-558` — EventSource cannot carry a custom header, so raw fetch streaming was chosen deliberately to keep the token out of the query string. Lifecycle: AbortController `:610`, backoff/reconnect `:616-632`, terminal-refusal handling `:656`, cleanup `:668`. Settled runs replay via `readEvents` `:586`. Exposes the full reasoning trace scoped to the token's asker (`lib/v3/liveEvents.ts:84-165`). Separately `/admin/workers` polls every 5 s.

## 7. Privacy surfaces today — **none**

`grep -rniE "privacy|consent|cookie notice|cookie banner|gdpr|terms of|ccpa|opt.out|do.not.track|legal"` over `app components lib` → **no matches**. No privacy policy, terms, cookie notice, consent component, account-data view, or delete-my-data control. The only export is per-answer JSON — a debate artifact, not a subject-access mechanism.

Concretely relevant: `components/TopBar.tsx:21` renders the brand domain **`dezbatere.ro`** — an EU production domain. GDPR/ePrivacy applies at launch.

## 8. UNKNOWN
- Upstream API cookie/CORS/rate-limit behaviour (out of scope; see S1). Because the proxy is transparent, **the API's headers become the browser's headers**; the proxy neither sets nor strips any (0 hits for `Set-Cookie|access-control|cors` in `apps/ui`).
- Production hosting headers — a CDN/reverse proxy could add CSP/HSTS; nothing in-repo declares one.
- Dev-token lifetime/revocation — contract exposes no expiry field (`packages/contract/src/index.ts:149-155`); semantics live server-side.
- Not audited: `packages/kernel`, the API app, and 30+ `.disabled` test files (not shipped).

## RISK SUMMARY

1. **HIGH — token in `localStorage` + non-`HttpOnly`, non-`Secure` cookie** (`lib/api.ts:107,110`): script-readable, cleartext over plain HTTP. Session redesign must move to `HttpOnly; Secure; SameSite=Lax` server-set cookies.
2. **HIGH — no CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy**: app is framable, no XSS backstop.
3. **MEDIUM — `/api` proxy forwards every header both ways** (`route.ts:40-42,67`): token cookie leaks upstream as an undesigned second channel; upstream `Set-Cookie`/CORS unfiltered; `OPTIONS` proxied so the UI asserts no CORS.
4. **MEDIUM — no privacy policy, terms, or notice** on an EU-facing domain. Storage is consent-exempt, so the gap is *disclosure and data-subject rights*, not a banner.
5. **MEDIUM — `/admin/workers` and `/settings` have no privilege check**; the contract's `OPERATOR` scope is unused client-side.
6. **LOW — user's debate question placed in the URL** (`?topic=`) → browser history and access logs.
7. **POSITIVE — XSS surface effectively closed**: zero HTML-injection sinks, no markdown renderer, all model output escaped JSX text.
8. **POSITIVE — zero third-party origins/analytics/beacons** (7 greps + positive control); Google fonts build-time self-hosted (44 local woff2); only transitive runtime dep is zod.
9. **POSITIVE — event stream is header-authenticated fetch streaming**, deliberately avoiding EventSource's token-in-URL, with schema validation per frame.
10. **Cookie/consent inventory is complete and tiny** — one value, two mechanisms, both strictly necessary. The consent work is documentation and session hardening, not tag removal.
