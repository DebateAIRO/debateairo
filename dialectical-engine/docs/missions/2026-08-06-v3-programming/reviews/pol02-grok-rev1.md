# POL-02 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_a6183a3b` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-12  
**Review packet:** `docs/missions/2026-08-06-v3-programming/reviews/POL-02-review-packet.md`  
**Mode:** read-only. Product / runtime sources not edited. Judged from shipped source and tests, not handoff prose. Did not read any peer (Opus) POL-02 verdict. Orchestrator gates cited as already green (root `tsc` clean; root vitest 63 files / 453 tests; source audit 0 blocking) — not re-run.

## Verdict

**APPROVED**

The stack-killer is dead for the Fastify 5 surface that caused it. After a raw `writeHead` on the SSE route, Fastify 5 reports `reply.sent === false` (sent means hijacked ∨ `writableEnded`, not “headers committed”), so a guard that checked only `reply.sent` would still call `reply.send` and re-emit `ERR_HTTP_HEADERS_SENT`. The shipped predicate adds `reply.raw.headersSent`, which is true immediately after `writeHead`, and the destroy path is nested try/catch with a socket fallback and a bare `return` so Fastify does not re-send. The reproduction opens a real ephemeral TCP listener, forces a post-header throw on a nonexistent run id, requires server-side abort (not a clean end), and proves a subsequent `/v1/session` still answers 200. Mutation argument holds: delete the guard, check only `reply.sent`, or fabricate a terminal SSE event — each fails the test’s contract or reintroduces the unhandled rejection.

No BLOCKING findings. Residual notes below are ADVISORY only.

---

## Judgment topics (packet §What to judge)

### 1. Is the guard actually total?

**PASS**

**Shipped guard** (`apps/api/src/index.ts:107–125`):

```ts
api.setErrorHandler((error, _request, reply) => {
  if (reply.sent || reply.raw.headersSent) {
    if (!reply.raw.writableEnded && !reply.raw.destroyed) {
      try {
        reply.raw.destroy();
      } catch {
        try {
          reply.raw.socket?.destroy();
        } catch {
          // The error handler must remain total even if the transport is
          // already tearing itself down.
        }
      }
    }
    return;
  }
  // … POL-01 non-streaming mapping unchanged …
});
```

#### Fastify 5 predicate completeness

Fastify 5.11.2 `reply.sent` (`node_modules/fastify/lib/reply.js:101–106`):

```js
// return (this[kReplyHijacked] || this.raw.writableEnded) === true
```

The SSE route (`apps/api/src/index.ts:220–233`) writes the transport with `reply.raw.writeHead` / `write` / `end` and does **not** call `reply.hijack()`. Therefore, after headers are committed and before `end()`:

| Flag | Value after `writeHead` | After mid-stream throw (before destroy) |
|---|---|---|
| `reply.sent` | **false** | **false** |
| `reply.raw.headersSent` | **true** | **true** |
| `reply.raw.writableEnded` | false | false |

Confirmed with a live Fastify 5 probe (same version): mid-stream throw after raw `writeHead` observed `{ sent: false, headersSent: true, writableEnded: false, guard: true }`.

Consequence:

- `reply.sent` alone is **incomplete** for this route. Fastify’s own rejection path in `wrap-thenable.js:63–70` only short-circuits when `reply.sent === true`; otherwise it calls `reply.send(err)`, which reaches the custom error handler with headers already committed.
- `reply.sent || reply.raw.headersSent` is the complete predicate for this surface: any post-`writeHead` state is caught by `headersSent`; hijacked/ended replies are caught by `sent`.
- There is no mid-flight “headers queued but not `headersSent`” gap after `writeHead` in Node’s HTTP: `headersSent` flips true synchronously when `writeHead` returns (Node probe: before false, after true). A second `writeHead` throws `ERR_HTTP_HEADERS_SENT` immediately. The shipped route uses `writeHead` before any stream work, so the commit point is hard.

#### What can throw inside the guard path?

| Site | Can it throw? | Contained? |
|---|---|---|
| `reply.sent` getter | Only if `reply.raw` were missing | Fastify `Reply` always assigns `this.raw = res` (`reply.js:67`, `1005`) |
| `reply.raw.headersSent` / `writableEnded` / `destroyed` | Property reads on `ServerResponse` — no throw | n/a |
| `reply.raw.destroy()` | Theoretically yes | Outer `try/catch` |
| `reply.raw.socket?.destroy()` | Theoretically yes | Nested `try/catch`; optional-chain if socket null |
| Double invocation after first destroy | Re-enters already-sent branch; `destroyed === true` skips destroy; bare `return` | Yes — Node probe: second `destroy()` is a no-op; after destroy `headersSent` stays true so the OR still holds even though `writableEnded` may remain false |
| Handler return value | Bare `return` → `undefined` | Fastify `error-handler.js:64–72` only calls `reply.send(result)` when result is not `undefined` — no second send |
| Exception escaping the handler | Would hit `error-handler.js:73–75` `catch { reply.send(err) }` and risk a second headers write | Destroy path cannot escape; see ADVISORY A1 for the unwrapped predicate read |

**Bar (“no input makes the handler itself throw”):** met for all realistic Fastify reply states on this process. Destroy failures are swallowed. Re-entry after destroy is safe.

#### ADVISORY A1 — predicate read not inside try/catch

`apps/api/src/index.ts:108` evaluates `reply.raw.headersSent` outside the nested try. If `reply.raw` were ever null/undefined, a `TypeError` would escape into Fastify’s outer catch and call `reply.send(err)` on an already-committed reply — the original crash class. Under Fastify 5’s `Reply` construction this does not occur. A belt-and-suspenders total handler would wrap the entire already-sent branch (predicate + destroy) in one try/catch that only returns. **Not blocking** for ship; residual hardening only.

#### ADVISORY A2 — SSE route does not call `reply.hijack()`

`apps/api/src/index.ts:220–233` takes the raw response without `reply.hijack()`. That is why `reply.sent` stays false and why Fastify still routes the rejection through `reply.send` → custom handler. The guard compensates correctly. Calling `hijack()` would make `reply.sent === true` earlier and short-circuit wrap-thenable before the error handler; optional hardening, not a defect of the shipped fix.

---

### 2. Does the reproduction test reproduce THE incident?

**PASS**

**Test:** `tests/unit/api.test.ts:451–486` — `"aborts a stale SSE connection without killing subsequent API requests"`.

| Packet requirement | Evidence |
|---|---|
| Real stream / socket (not inject-only, not unit-testing the guard) | `api.listen({ host: "127.0.0.1", port: 0 })` then `fetch(\`http://127.0.0.1:${address.port}/...\`)` — real TCP listener, real HTTP client |
| Nonexistent / stale run id | URL `/v1/runs/run:missing-from-reseed/events`; fixture asserts `runId === "run:missing-from-reseed"` |
| Throw after headers | Fixture `events` async generator throws `TypedDomainError("RUN_NOT_FOUND", ...)` after the route has already executed `reply.raw.writeHead(200, …)` (`index.ts:223–229`) |
| Assert server abort | Expects `streamOutcome === "aborted_by_server"` (fetch/body failure from destroy), not clean `ended_by_server` |
| Assert subsequent request answers | Second `fetch` to `/v1/session` with another token → status 200 + `caller_scope: "ASKER"` |

**Focused re-run (this review):**

```text
✓ aborts a stale SSE connection without killing subsequent API requests 64ms
Test Files  1 passed (1)
Tests       1 passed | 15 skipped (16)
```

Handoff RED (inventory pointer only): same test without the guard produced `expected 'timed_out' to be 'aborted_by_server'` plus `Unhandled Rejection` / `ERR_HTTP_HEADERS_SENT` with stack through `error-handler.js → fallbackErrorHandler → Reply.send` — the production mechanism.

This is not a unit call of an extracted guard function. It drives `buildApi` → real listen → real client → real error-handler path.

#### ADVISORY A3 — production empty-run soft-end vs forced throw

`PostgresAskApplication.events` (`apps/api/src/index.ts:469–494`) returns an empty generator when both progress and failed-work queries are empty (`if (result.rows.length === 0 && failedWork.rows.length === 0) return`). A pure “id never existed” reconnect against **current** production `events` therefore soft-ends (writeHead → no events → `end`) rather than throwing. The crash class the guard kills is any **throw after headers** (DB fault mid-stream, `RunEventSchema.parse` failure, write failure, or a fixture/app that throws). The test correctly forces that class. If product later wants a pre-header 404 for unknown runs, that is a separate design change (handoff already notes it). **Not blocking** the process-survival fix.

---

### 3. DR-115 on the aborted stream

**PASS** (abort face + no fabricated terminal; cleanup concern closed for this path)

**No synthesized terminal/completion event.** The already-sent branch writes nothing to the SSE body. It only `destroy()`s the raw response/socket and returns. Grep of the error-handler block shows no `event:`, no `write(`, no completion payload. DR-115 comment at `:109–111` matches the code.

**Client observation:** abort / connection reset, not a graceful `event: end` or domain terminal. The regression asserts `aborted_by_server`, which fails if the handler cleanly ends a fabricated body (see topic 6).

**Connection / resource cleanup (inverse leak concern):**

- SSE route (`:220–233`): no heartbeat `setInterval`, no keep-alive timer owned by the route.
- Production `events` (`:469–535`): one-shot `pool.query` pair + optional `#splitLifecycle.read` — no `LISTEN`/`NOTIFY`, no long-lived DB listener per connection.
- Destroying the response ends the HTTP stream; the async route rejection unwinds the `for await` without leaving a Fastify-owned writer open.
- Failure is connection-local (P15 bulkhead): second request on the same process succeeds in the regression.

No per-stale-reconnect timer/listener leak is present on this code path. Residual client EventSource retry policy is expected product behavior, not a server leak.

---

### 4. POL-01 untouched for non-streaming

**PASS**

**Mapping still at** `apps/api/src/index.ts:126–138` (only reached when neither `sent` nor `headersSent`):

| Class | Status | Body `error` |
|---|---|---|
| `MalformedRequestError` / `SyntaxError` | 400 | `MALFORMED_REQUEST` |
| `AskRefusal` | 422 | `knownError.code` |
| Everything else | 500 | `INTERNAL_ERROR` |

No route-context classification. `AskRefusal` marker and evaluation-stage minting from POL-01 remain in place (`AskRefusal` class, `markAskRefusal`, `evaluateAskAdmission`).

**Suite not weakened:**

- `tests/unit/api.test.ts:178–215` — ask-boundary refusal → **422** with real code/message.
- `tests/unit/api.test.ts:217–278` — typed internal from `submit` → **500** `INTERNAL_ERROR`; deployment typed fault → 500; untyped crash → 500.
- `tests/unit/api.test.ts:67–113` — only maker/envelope evaluation mint `AskRefusal`; `CONFIGURED_PROVIDER_SET_UNRESOLVED` stays bare `TypedDomainError`.
- `tests/unit/pol01-policy.test.ts` — register floor, 422 form surface, token-clear-only-on-rejection, guarded clear call sites — assertions intact (exact guarded `if (shouldClearStoredTokenAfterUnlockFailure…)` match counts, no `looksAuthRelated`).

The POL-02 addition is one test (`:451–486`) plus the already-sent branch; POL-01 assertions were not relaxed to accommodate it.

---

### 5. The sweep (post-header throw sites)

**PASS**

**SSE translation path** (`apps/api/src/index.ts:220–233`), after `reply.raw.writeHead(200, …)`:

| # | Site | Failure mode | Covered by |
|---|---|---|---|
| 1 | `options.application.events(...)` iteration | throw / reject mid-stream (test fixture; DB faults) | same error handler already-sent branch |
| 2 | `PostgresAskApplication.events` queries / `#splitLifecycle.read` | query/projection throw after headers | same |
| 3 | `RunEventSchema.parse(candidate)` | corrupt/drifted stored event | same |
| 4 | `JSON.stringify(event)` / `reply.raw.write(...)` | serialization / transport write throw | same (if surfaced as route rejection) |
| 5 | `reply.raw.end()` | transport completion throw | same |

All converge on Fastify’s single error boundary. No second SSE error protocol was added. No post-header site on this route bypasses `setErrorHandler`. Write-time errors that only emit on the raw stream without rejecting the async handler are a Node/stream edge; destroy on the handler path still covers the documented production stack (route throw → wrap-thenable → `reply.send` → custom handler).

---

### 6. Mutation-argue the reproduction test

**PASS** — each named mutation fails the test contract or reintroduces the unhandled rejection.

Live Fastify 5 mutation probe (real listen + fetch, 400ms client abort ceiling; results also under review scratch):

| Mutation | Stream outcome | Unhandled | Survivor `/session` | Would shipped test fail? |
|---|---|---|---|---|
| **Delete guard** (always `reply.status(500).send`) | Client times out / aborted (no server destroy) | **`ERR_HTTP_HEADERS_SENT`** | 200 in short probe* | **Yes** — expects `aborted_by_server` from server destroy; RED was `timed_out` + unhandled rejection |
| **Only `reply.sent`** (omit `headersSent`) | Same as delete guard | **`ERR_HTTP_HEADERS_SENT`** | 200* | **Yes** — after `writeHead`, `sent === false`, falls through to `reply.send` |
| **Fabricate `event: end` + `end()`** instead of destroy | Clean `ended` body `event: end\ndata: {}\n\n` status 200 | null | 200 | **Yes** — expects `aborted_by_server`, not `ended_by_server` |
| **Full shipped guard** | `fetch_failed` / socket reset (server destroy) | **null** | **200** | No — GREEN |

\*Process may survive a single unhandledRejection under default Node without `--unhandled-rejections=strict`; production incident still matches the unhandled `ERR_HTTP_HEADERS_SENT` on the error-handler path. The test’s primary assertion is abort + subsequent request; the RED log captured the unhandled rejection as well.

The test would **not** green under any of the three hostile mutations. It is a real regression for the crash, not a tautology over the guard’s source text.

---

## Summary table

| # | Topic | Judgment |
|---|---|---|
| 1 | Guard totality (predicate + no escape) | **PASS** (ADVISORY A1 predicate wrap; A2 hijack optional) |
| 2 | Reproduction = real socket + survival | **PASS** (ADVISORY A3 production empty soft-end vs forced throw) |
| 3 | DR-115 abort / no fake terminal / no leak | **PASS** |
| 4 | POL-01 non-streaming mapping + suite | **PASS** |
| 5 | SSE post-header throw-site sweep | **PASS** |
| 6 | Mutation-argue reproduction | **PASS** |

## BLOCKING findings

None.

## ADVISORY findings

- **A1** `apps/api/src/index.ts:108` — wrap entire already-sent branch (predicate + destroy) in one try/catch for absolute totality if `raw` were ever missing.
- **A2** `apps/api/src/index.ts:220–233` — consider `reply.hijack()` on the raw SSE route so Fastify treats the reply as owned earlier; guard remains correct without it.
- **A3** `apps/api/src/index.ts:493–494` — production empty-run soft-return means pure missing-id reconnect may not throw today; guard + test still target the real crash class (post-header throw). Pre-header 404 is a separate product decision.

## Disposition

**APPROVED** — stack may restart on dual-diamond double-green. No product source edits performed by this lens.
