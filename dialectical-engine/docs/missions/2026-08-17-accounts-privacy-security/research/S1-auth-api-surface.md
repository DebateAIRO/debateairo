# S1 — Authentication, Session & API Authorization Surface (research asset, Wave 1)

Read-only audit, 2026-08-17. All line numbers verified against the working tree.

## 0. HEADLINE CORRECTION TO THE CHARTER

The charter said the current path is "a single shared dev token". **That is not what the code does.** There is no shared token, no configured token, and no secret anywhere in the tree. The API accepts **any non-empty string** and derives an identity namespace from its SHA-256 digest.

`apps/api/src/index.ts:113-123`:
```ts
function resolveSession(token: unknown, scope: "ASKER" | "OPERATOR" = "ASKER"): Session | null {
  if (typeof token !== "string" || token.trim().length === 0) return null;
  const tokenDigest = createHash("sha256").update(token).digest("hex");
  return SessionSchema.parse({
    asker_id: `asker:${tokenDigest}`,
    session_id: `session:${tokenDigest}`,
    caller_scope: scope,
    ownership_provenance: scope === "OPERATOR" ? "operator_dev_token" : "user_dev_token",
    provisional_identity_model: true
  });
}
```

The only rejection is empty/absent/non-string. **No comparison against any stored value** — so "timing-safe?", "hashed at rest?", "expiry/rotation/revocation?" all have one answer: *there is nothing to compare against*. The hash is namespace derivation, not verification.

This is pinned as intended by the suite: `tests/unit/api.test.ts:557-561` sends `"other-user-token"` to `GET /v1/session` and asserts 200.

**Correct current-state sentence: the system has no authentication. It has self-asserted, unverified tenant namespacing.** The UI copy at `apps/ui/components/AuthGate.tsx:79-80` ("Paste the user token the coordinator printed on first boot") is vestigial from the deleted Python coordinator — no TypeScript component prints, generates, or stores a token.

## 1. Current mechanism

| Property | Finding | Citation |
|---|---|---|
| Header | `x-user-dev-token` | `apps/api/src/index.ts:162` (+14 sites) |
| Refusal | `401 {"error":"SESSION_REQUIRED"}` | `:163` (+14) |
| Token origin | **None.** Not env, register, DB, or hard-coded. Caller-chosen. | `packages/register/src/runtime-environment.ts:34-52` — strict Zod, no token var |
| Comparison | **None performed** | `:114` |
| Timing-safe | N/A — `timingSafeEqual` → 0 hits tree-wide | |
| Hashed at rest | Never stored; digest embedded in `core.run.asker_id`/`session_id` (unsalted, uniterated) | `:115`, `packages/db/src/schema.ts:15-16` |
| Expiry/rotation/revocation | **None.** No TTL, jti, denylist, exp, server session record | |
| Entropy validation | None — `"a"` is valid | `:114` |
| Fastify hooks/plugins | **Zero.** Every route re-implements the same inline 2-line check | |
| `x-operator-dev-token` | **Dead header.** `scope` defaults to ASKER, never passed; OPERATOR branch unreachable | `:113,120`; `tests/unit/api.test.ts:508` |

Consequence: **`asker_id` is a pure function of a caller-chosen string.** Anyone who learns another party's string reconstructs their identity offline — no server state, no revocation. "Registering" = typing a new string.

## 2. Endpoint inventory

Single Fastify instance (`buildApi()`, `apps/api/src/index.ts:125-311`), listening at `apps/api/src/main.ts:92`. No other HTTP listener in the repo. **All 15 routes require a non-empty token; none is reachable without one; none has a rate limit.**

| # | METHOD PATH | Line | Reads/Mutates | Owner-scoped? | Notes |
|---|---|---|---|---|---|
| 1 | `GET /v1/session` | 161 | echoes derived identity | n/a | **Free identity oracle** — confirms any string works |
| 2 | `GET /v1/deployment` | 167 | **all** register rows + **all** scorecard cells + session's assignment | ❌ except `session_assignment` (`:548`) | **PRIVILEGED** whole-deployment config dump |
| 3 | `GET /v1/dev/evaluator` | 178 | evaluator catalog/profiles/domains/parked runs | ❌ | **PRIVILEGED**, conditionally registered |
| 4 | `POST /v1/dev/evaluator/consumer-selection` | 184 | **MUTATES** `evaluator.consumer_selection` deployment-wide | ❌ | **PRIVILEGED WRITE** — any token flips global evaluator routing; `selectedBy`/`orderRef` stamped with attacker-chosen identity |
| 5 | `POST /v1/asks` | 212 | **MUTATES** — creates run/question_key/work_item, dispatches workflow spending real model budget | ✅ writes own `asker_id` | **Unmetered cost surface**; no rate limit/quota/concurrency cap |
| 6 | `GET /v1/answers` | 220 | answer index | ✅ `run.asker_id=$1` (`packages/serve/src/index.ts:1584,1594,1603`) | `limit` unbounded (`:225`) |
| 7 | `GET /v1/answers/:id` | 231 | answer projection | ✅ (`serve:1340`) | |
| 8 | `GET /v1/answers/:id/inspection` | 243 | tier-2 inspection | ✅ (`serve:1770`) | previously IDOR, now scoped; raw-output-free asserted `api.test.ts:502` |
| 9 | `GET /v1/answers/:id/ledger-digest` | 257 | ledger digest | ✅ (`serve:1692`) | |
| 10 | `GET /v1/answers/:id/nodes/:nodeId` | 264 | node projection | ✅ ownership proven first (`serve:1808-1819`) | no IDOR |
| 11 | `POST /v1/answers/:id/investigations/:gapRef` | 271 | **MUTATES** — stores verbatim user input | ✅ (`serve:1664`) | |
| 12 | `GET /v1/runs/:id/events` | 279 | SSE stream | ✅ `run.asker_id=$2` (`:581,591`) | writes 200 **before** ownership check (`:282`) → foreign run = 200 + empty stream, never 404; no cap on concurrent streams |
| 13 | `GET /v1/runs/:id` | 293 | run projection | ✅ (`packages/db/src/index.ts:444`) | |
| 14 | `GET /v1/runs/:id/answer` | 299 | answer by run | ✅ (`serve:1647`) | |
| 15 | `POST /v1/answers/:id/memory-link/unlink` | 305 | **MUTATES** memory link event | ✅ (`packages/memory/src/index.ts:489`) | `actorRef` double-prefixed `asker:asker:<digest>` (`:477`) |

**Contract drift:** `packages/contract/src/index.ts:504-519` declares 12 routes; three shipped routes are absent (memory-link unlink + both dev-evaluator routes). A review trusting `contractInventory` as the authorization surface would miss the two privileged dev routes.

### 2a. `GET /v1/deployment` — unscoped config disclosure
`:520-569`. Three queries; only `scorecard.session_assignment` (`:548`) filters by session. The other two return **every** register row and **every** scorecard cell to any caller. Exposed: model/provider topology, routing decisions, risk-tier policy, budget bounds, discovery windows, contract hashes, every `source_ref`. **Provider credentials are NOT in the register** (`VLLM_AUTHORIZATION` is env-only, `apps/runner/src/main.ts:23`) — so this is architecture/policy disclosure, not secret disclosure. Still hands an attacker the full model-routing map.

### 2b. Dev-evaluator routes — real gating, but not by identity
`:173-210`, registered only when `EVALUATOR_DEV_MENU_ENABLED === "true"` (`apps/api/src/main.ts:82-90`). Two genuine guards in `packages/register/src/runtime-environment.ts:44-50`: refuses to boot without `EVALUATOR_DEV_MENU_DATABASE_URL`, and **refuses outright when `NODE_ENV === "production"`**. Least-privilege DB role backs it: `migrations/0029_evaluator_dev_menu_grants.sql` grants `debateai_evaluator_api` only SELECT. Tested (`tests/unit/evaluator-dev-menu-api.test.ts:27,42,51,85`). **Gap:** within a dev deployment the gate is binary and env-level — no developer *identity*; the same any-string token that reads a debate can POST a consumer-selection.

## 3. Ownership & identity — the seam accounts must attach to

`core.run` (`packages/db/src/schema.ts:12-33`): `askerId` (`:15`), `sessionId` (`:16`), `callerScope` (`:17`). **No users/accounts/sessions/credentials table exists**; across all 30 migrations nothing defines a principal entity; `asker_id` is free text with no FK.

Population at admission (`apps/api/src/index.ts:427-474`):
```ts
askerId:     session.asker_id,     // :432  "asker:"   + sha256(token)
sessionId:   session.session_id,   // :433  "session:" + sha256(token)
callerScope: ask.caller_scope,     // :434  ← FROM THE REQUEST BODY
```

1. **`asker_id` and `session_id` are the same value with different prefixes** — zero independent information; no session lifecycle distinct from identity. Accounts need `session_id` to become a separate, revocable, expiring entity.
2. **`caller_scope` is attacker-controlled** — read from the ask body (`packages/contract/src/index.ts:117`, enum ASKER|OPERATOR), not the session (always ASKER). Any caller may persist `core.run.caller_scope = "OPERATOR"`; same value flows to `memory.question_key.caller_scope` (`:460`). Nothing reads it for authorization today — a latent privilege-confusion seam to close before it acquires meaning.
3. **The contract declares itself provisional:** `SessionSchema` mandates `provisional_identity_model: z.literal(true)` (`packages/contract/src/index.ts:149-155`) — the natural flag to flip when accounts land.

Other identity-adjacent columns: `memory.question_key.askerScope` (`schema.ts:651`), `scorecard.routing_decision.sessionId`/`session_assignment.sessionId` (`:622,637`), `ledger.ledger_entry.actorRef` (`:153`, machine actors today), `core.work_item.claimedBy` (`:42`, worker identity).

**Everything downstream inherits ownership exclusively by joining back to `core.run.asker_id`. That single column is the entire authorization model — and the single point where accounts attach.**

## 4. UI auth path

**Two Next.js apps share the identical pattern** — `apps/ui/` and `web/`. Both are workspace members, and the **root `build` script builds `web/`, not `apps/ui/`** (`package.json:12`), while the charter names `apps/ui` as the product. **Both must be hardened or one deleted.**

Acquire: free-text password input validated by `GET /v1/session` which accepts anything (`AuthGate.tsx:41-58,89-96`; `lib/api.ts:132-134`). Storage: `localStorage["debateai:user-dev-token"]` (`lib/api.ts:98,102,106`; same in `web/lib/api.ts:28,32,37`) **and** a mirror cookie (`:110`) with `Path=/; SameSite=Lax` — **no HttpOnly, no Secure, no expiry**. Send: `x-user-dev-token` header (`packages/contract/src/client.ts:91`); SSR reads the cookie (`lib/serverApi.ts:14`). Proxy forwards all methods incl. OPTIONS, copies every header minus host/expect, returns every upstream header verbatim (`app/api/[...path]/route.ts:37-98`). Base-URL hardening is genuinely good (`lib/api.ts:40-65`). Live events use fetch streaming with the header, not EventSource — token never in a URL (`DebatePageClient.tsx:556-558,625`).

**Client-side-only gating:** `AuthGate` renders children once *any* string round-trips `/v1/session`. `/admin/workers` is "admin" in name only. Evaluator dev menu additionally hidden behind a build-time public env flag (UI hiding, not authorization) — though the API-side NODE_ENV refusal does back it. **No CSP anywhere; no `middleware.ts` in either app.**

## 5. Transport / session posture

| Control | State |
|---|---|
| **CORS** | **Absent** — no `@fastify/cors`, no `Access-Control-*` ever set. Browsers block cross-origin *reads*, but simple cross-origin POSTs still execute server-side |
| **CSRF** | **Absent, accidentally mitigated** — mutations require the custom header `x-user-dev-token`, which is not CORS-simple, so a cross-site form/fetch can't attach it. The cookie mirror is never read by the API. **This safety rests entirely on "the API ignores cookies" — any future cookie-session migration silently breaks it** |
| **Set-Cookie** | The API **never** emits one; the only cookie is written by client JS |
| **HTTPS** | Not assumed, not enforced. Plain HTTP host/port; no HSTS. Proxy permits `http:` (`route.ts:20-22`). `compose.dev.yaml:20-21` runs Hatchet with insecure cookie/gRPC; DB password literal `debateai-dev-only` (`:9`) |
| **Security headers** | **None** from API or Next |
| **Token in logs** | **Clean** — `Fastify({ logger: false })` (`:126`). Trade-off: **no audit trail of any request whatsoever** |
| **Token in URLs** | **Clean** — header-only; SSE via fetch streaming |
| **Error envelope** | `:146-158` returns `knownError.message` verbatim on 500 — internal Postgres/driver messages reach any caller |

## 6. Rate limiting / brute force

**Nothing, on any path, at any layer.** No `@fastify/rate-limit`, no hooks, no per-IP/token counters, no quota, no lockout, no concurrency cap on SSE. The only `RATE_LIMITED` tokens are **client-side translations of a 429 the server can never send** (`packages/contract/src/client.ts:30,57`; `apps/ui/lib/v3/tokenUnlock.ts:51-54`). Brute-force is moot for auth (any string works) but **fully live for cost**: `POST /v1/asks` is an unmetered trigger for a full multi-model debate run.

## 7. Existing security tests

15 files match. Highlights: 401-without-header for session/unlink/events (`tests/unit/api.test.ts:371,460,524`); `x-operator-dev-token` alone → 401 (`:505-511`, closes the old operator-header IDOR); inspection is ASKER-scoped and raw-text-free (`:486-503`); **arbitrary string → 200 (`:557-561`) — pins "any string is valid" as intended, must change when accounts land**; against real Postgres, anonymous → 401 and **foreign asker → 404** (`tests/integration/database.test.ts:617-651`) — the strongest object-level test in the tree; end-to-end foreign-owner → 404 (`acceptance/ceremony.test.ts:475-480`); proxy forwards token and invents no headers (`tests/unit/v2ui-proxy.test.ts:24-50`).

**Not tested anywhere:** that a token is *verified* (impossible today); ownership on `/v1/deployment` or either dev route (none exists); any rate limit/lockout/replay defense; any CSRF/CORS/header assertion; `caller_scope` smuggling; per-route cross-asker isolation for routes 7-12 individually (coverage is generalized by shared SQL, not per-route tests).

## 8. Notes for the accounts design

- **Register rows governing access: none exist.** Every seeded row governs debate mechanics. Per charter law 13, auth constants (session TTL, lockout thresholds, password policy, rate-limit windows) must become new ruled rows. The row surface is `(register_version, row_key, value_json, source_ref)` (`schema.ts:435-440`) — needs no schema change, only a new sealed version.
- **Ledger event kinds are closed and machine-only:** `LEDGER_ACTION_KINDS` (`packages/kernel/src/index.ts:199-212`); outcomes (`:196`) include `REFUSED`/`BLOCKED`, which map cleanly onto failed-login semantics. **But `runId` is the organizing key and auth events have no run** — new kinds require a vocabulary extension plus a decision on run-less entries. Note `contractInventory` exposes kinds on the wire via `ExecutionLedgerDigestSchema` (`packages/contract/src/index.ts:86`) — auth kinds would leak into the asker-facing digest unless filtered. The SSE `EVENT_TYPES` vocabulary (`:19-50`) must **not** gain auth events (asker-facing).
- **No migration hints at users.** The only GRANT in the tree is `migrations/0029` (least-privilege evaluator role) — the sole existing precedent, and a good model to extend.
- **Immutability precedent to reuse:** `core.reject_mutation()` triggers already enforce append-only on `core.edge` (`migrations/0002_s02.sql:148-151`) and `ledger.sensitivity_record` (`migrations/0003_s03.sql:89-90`). Auth audit tables should carry the same trigger.
- **UNKNOWN (searches run, no result):** any prior/planned account schema; any token bootstrap utility in the TS tree (the only generator described belongs to the deleted Python coordinator); reverse-proxy/TLS config (`deploy/` has only IMAGE-PINS.md and a Postgres init script); any `middleware.ts` in either UI.

## RISK SUMMARY

1. **There is no authentication.** Any non-empty string is a valid credential (`apps/api/src/index.ts:113-123`); a test pins this as intended (`tests/unit/api.test.ts:557-561`). "Registration" is typing a new string; there is no secret to steal, verify, expire, or revoke.
2. **With *any* token** (i.e. anyone who can reach the port): the full deployment register + all scorecards via `GET /v1/deployment`; unlimited `POST /v1/asks` runs **burning real model-CLI budget** with no rate limit or quota; and in any non-production deployment with the dev menu on, a **global write** flipping the evaluator's consumer model.
3. **With a *specific* token**, the attacker becomes that asker completely — every debate, answer, inspection, ledger digest, node, event stream, plus unlinking memory links and submitting investigations under their name. Ownership is one unsalted SHA-256 of the string: possession is permanent, reconstructible offline, with no revocation path.
4. **Without any token**, all 15 routes return 401 — but that costs one keystroke to defeat. It is a liveness check, not a security boundary.
5. **What actually holds:** per-asker isolation is enforced in SQL on every owned resource and proven against real Postgres (foreign asker → 404). The dev menu is genuinely refused in production. No token reaches a log or URL. **The tenancy seam is sound; only the front door is missing.**
6. **Compounding gaps:** no CORS/CSRF/rate-limit/security-headers/HTTPS enforcement; token in localStorage **and** a non-HttpOnly, non-Secure cookie; `caller_scope` persisted from the request body rather than the session; **zero request logging, hence no audit trail**; and a second, equally unhardened UI in `web/` that the root build script actually builds.
