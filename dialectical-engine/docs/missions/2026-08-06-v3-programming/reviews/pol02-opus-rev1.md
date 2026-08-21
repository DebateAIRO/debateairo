# POL-02 — Opus 5 lens (dual diamond DR-153) — rev1

**Ticket:** `t_a6183a3b` · **Verdict: `APPROVED` — nothing blocking. Restart the stack.**

The reported incident is dead. I reproduced it and killed it in a child process
that models production exactly (no `unhandledRejection` listener, so Node's
default `--unhandled-rejections=throw` applies):

| error handler | scenario | process exit | next request |
|---|---|---|---|
| pre-POL-02 (no guard) | one late throw after `writeHead` | **1 — process dies** | n/a |
| **POL-02 as shipped** | one late throw after `writeHead` | **0** | **200** |
| POL-02 as shipped | two error deliveries on one reply | 1 | n/a (ADVISORY-1) |
| shipped + `reply.hijack()` | two error deliveries on one reply | 0 | 200 |

Everything below is measured against `fastify@5.11.2` as installed and Node
v22.23.1, not inferred.

---

## 1. Totality of the guard — total for every input this API can produce

`apps/api/src/index.ts:107-139`, guard at `:108-125`.

**The guard body cannot throw.** Every expression is either a non-throwing
property read (`reply.sent`, `raw.headersSent`, `raw.writableEnded`,
`raw.destroyed` are plain getters over `_header` / booleans) or is inside a
`try`. `destroy()` is wrapped, the socket fallback is wrapped *and*
optional-chained, and the inner `catch` is empty. Nothing in the branch touches
`error` at all, so a non-Error throw (I fired a `Symbol`) never reaches
`String(error)` on this path.

**`reply.sent || reply.raw.headersSent` is the complete predicate.** I read the
installed source rather than assuming:

- `reply.sent` is `(this[kReplyHijacked] || this.raw.writableEnded) === true`
  (`lib/reply.js:101-107`). It is *not* set by calling `send`. So `sent` is the
  weaker half; `headersSent` is the one that matters.
- The crash site is `safeWriteHead` → `res.writeHead` (`lib/reply.js:573-583`,
  reached from `onSendEnd:641/652/688`).
- In Node, `res.headersSent` is `!!res._header`, and `_header` is composed
  synchronously inside `writeHead` (and inside the implicit header on the first
  `write`) *before any byte reaches the socket*; `writeHead` throws
  `ERR_HTTP_HEADERS_SENT` **iff** `_header` is set. Measured directly:
  after `writeHead(200,…)` → `headersSent=true` while `socket.bytesWritten=0`,
  and a second `writeHead` → `ERR_HTTP_HEADERS_SENT`. Same for the implicit
  header path.

So the window the packet asked about — *headers queued but not flushed, both
flags false, `reply.send` still explodes* — **does not exist**. The predicate is
exact. The *inverse* window does exist (committed but not yet flushed) and the
guard correctly treats it as committed.

**Adversarial cases, all measured, all survive with the handler invoked exactly
once:**

- client aborts mid-stream first, then the route throws → `raw.destroyed` is
  already true → guard skips `destroy()`, returns. No crash.
- route throws *after* `reply.raw.end()` → the error handler is never invoked at
  all (`wrap-thenable.js:63-66` early-returns on `reply.sent`). The guard's
  `!writableEnded` check is therefore belt-and-braces, and it correctly declines
  to destroy a completed keep-alive response.
- non-Error throws (`Symbol`) post- and pre-header → both fine (pre-header
  yields the normal 500 envelope; `String(symbol)` is legal, only `symbol + ""`
  throws).
- `HEAD` on the SSE route (Fastify's `exposeHeadRoutes` default) → fine.
- `raw` already self-destroyed before the throw → fine.

### ADVISORY-1 (highest value) — the guard is total for the *first* error delivery only

`lib/error-handler.js:49` sets `reply[kReplyNextErrorHandler] =
Object.getPrototypeOf(errorHandler)` *before* calling our handler and never
resets it on success. A **second** error delivered on the same reply therefore
bypasses the custom handler entirely and lands in Fastify's own
`defaultErrorHandler` → `fallbackErrorHandler`, whose retry
`reply.raw.writeHead(reply.raw.statusCode)` inside the `catch`
(`lib/error-handler.js:40`) is **not** wrapped → `ERR_HTTP_HEADERS_SENT` →
unhandled rejection → process death. Measured: shipped guard + two deliveries →
**exit 1**, custom handler called once.

**Reachability audit — not reachable today, hence advisory:**

- no `onSend` / `onError` / `onResponse` / `preSerialization` hooks, no plugins;
- `handlerTimeout` and `requestTimeout` are 0 (Fastify defaults), and
  `lib/route.js:526-547` shows that timer is the only Fastify-internal second
  delivery;
- every route evaluates its payload *before* its single `reply.send(...)`
  (`index.ts:141-244` — the `…Schema.parse(await …)` is an argument, so a parse
  failure means `send` never ran), and the SSE route never calls `reply.send` at
  all. No route can send-then-throw.

So exactly one error delivery per reply is structurally guaranteed **by the
current route set**, and nothing in the code records that this is what the guard
depends on. It becomes a live crash the day anyone adds a hook, a plugin, a
`handlerTimeout`, or a route that sends and then throws.

**One-line hardening, measured to close it:** call `reply.hijack()` immediately
inside the guard, before the destroy. It sets `kReplyHijacked`, which makes
`reply.sent === true`, and `wrap-thenable.js:63-66` then returns before ever
calling `reply.send` again. Measured: `HIJACK` + two deliveries → **exit 0**,
survivor 200; single delivery behaves identically to shipped. Free bonus:
`hijack()` also clears the handler-timeout timer and removes the request abort
listener (`lib/reply.js:128-148`) if either is ever configured — i.e. it
future-proofs §3 as well. It is also the honest statement of what the guard is
doing: *this reply's transport is ours now, not Fastify's.*

I am not blocking on this. The shipped guard kills the incident; this closes the
residue.

---

## 2. The reproduction test — it does reproduce the incident, and it discriminates

`tests/unit/api.test.ts:451-486`. It is a **real stream over a real socket**:
`api.listen({host:"127.0.0.1", port:0})`, real `fetch`, throw after
`reply.raw.writeHead`, then asserts both halves — the stream was aborted by the
server, and a *subsequent ordinary request from a different client* returns 200
from the same process. Correct shape; the `api.inject` SSE test at `:437` would
not have proven anything.

**Mutation-argued (my harness replicates the test's decision procedure):**

| mutation | outcome | test |
|---|---|---|
| guard deleted | `timed_out` + `ERR_HTTP_HEADERS_SENT` | **RED** ✓ |
| `destroy()` → fabricated `event: run.terminal` + `end()` | `ended_by_server` | **RED** ✓ (DR-115 violation is caught) |
| check only `reply.sent`, drop `headersSent` | `timed_out` + `ERR_HTTP_HEADERS_SENT` | **RED** ✓ |

All three named mutations are caught. The DR-115 one is caught for a real
reason, not by luck: fabricating a terminal event makes `fetch` *resolve*, which
flips the outcome to `ended_by_server`.

### ADVISORY-2 — the test's green condition is broader than its claim

`:471-474`'s `.then((outcome) => outcome, () => "aborted_by_server")` maps
**every** rejection to the passing value — including an assertion failure inside
the fulfilled callback, a connect error, or a route that refuses *before*
headers. And in this exact scenario `expect(stream.status).toBe(200)` at `:468`
is dead code: I measured `observedStatus = "no-response"`, because `writeHead`
composes the header without flushing it, so `fetch` rejects
(`UND_ERR_SOCKET`) before the fulfilled callback ever runs.

So the test proves *"the server closed the connection without a graceful ending
and the process survived"* — which is the load-bearing property — but not *"an
SSE stream was established and then aborted"*. Strengthen by asserting the
rejection cause, and/or by flushing one event before the throw so `status === 200`
is genuinely observed (I verified the guard behaves identically in that
variant: `observedStatus: 200`, aborted, survivor 200).

### ADVISORY-3 — the incident narrative is not verified by the fixture

The fixture throws `RUN_NOT_FOUND` for a nonexistent id, but the **real**
`PostgresAskApplication.events` does not throw for one: `index.ts:493` returns
early when both queries come back empty, so a genuinely nonexistent/foreign run
id yields `200` + empty body + a clean `end()`. The claimed proximate trigger
("stale id → route throws") is therefore unproven; the actual production throw
was more plausibly a `pool.query` failure while the DB generation was being
replaced, or `RunEventSchema.parse` drift on a stale-but-present row. **Both are
covered by the same guard, so the fix stands** — but the handoff's "known
nonexistent/stale run ID case" should not be filed as verified.

Relatedly, the handoff's residual-risk note calls the client behaviour "the
normal EventSource reconnection policy". The UI does not use `EventSource`; it
uses token-authenticated fetch streaming with capped exponential backoff
(`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx:525-531`, 1s→30s, and
`attempt` only resets once an event actually arrives). The residual retry
pressure is *smaller* than the handoff claims — but the claim is still wrong.

Nit: no `try/finally` around `api.close()` in the new test; an assertion failure
leaves a listening server up for the rest of the file.

---

## 3. Resource cleanup on the abort path — nothing leaks, and I can say why

The packet's fear (socket destroyed, heartbeat/listener stranded) does not apply,
by construction rather than by luck:

- **The SSE route allocates nothing that outlives the request.** It is a one-shot
  dump (`index.ts:220-233`): no `setInterval`, no heartbeat, no `LISTEN`, no
  cursor, no subscription anywhere in `apps/api`. Its data comes from
  `pool.query` only — two in `events()` (`index.ts:470-492`) plus three in
  `GraphRepository.readNodeLifecycleEvents` (`packages/graph/src/index.ts:428`).
  `pool.query` releases its own client; every `pool.connect()` checkout in
  `packages/db/src/index.ts` (`:17`, `:49`, `:127`) is a write path with
  `finally { client.release() }`.
- **Generator teardown does run.** `for await` calls `.return()` on the async
  generator when the loop body throws — measured: a `finally` inside the
  generator executes on a mid-stream parse failure. Any teardown added to
  `events()` later will fire.
- **Fastify installs no per-request listeners or timers on this server.**
  `lib/route.js:549` gates `setupResponseListeners` on
  `hasLogger || onResponse hooks || handlerTimeout > 0` — all false for
  `Fastify({ logger: false })`. Measured `reply.raw.listenerCount('error') === 0`
  in every error-handler invocation. There is nothing to strand.

### ADVISORY-4 — the corollary: a raw write-after-end is an *uncaught exception*, not a routed error

Because there is no `'error'` listener on `reply.raw`, `res.write()` after
`res.end()` emits `'error'` on an emitter with no listener → **uncaught
exception → exit 1** (measured). This is the same family of process-killer and it
does **not** pass through the guarded boundary. It is **not reachable in the
current route** (the only `end()` is after the loop, with no write after it), so
it is not blocking — but it is the trap the next person to touch this route will
step in.

Non-POL-02 note: the stream has no heartbeat at all, so a long-idle live run can
be cut by an intermediary. The UI's backoff reconnect absorbs it.

---

## 4. POL-01 preserved — yes, and its tests were not weakened

- The guard is a prepended early-return; the mapping below it
  (`index.ts:126-138`) is byte-identical to POL-01's: 400 for
  `MalformedRequestError`/`SyntaxError`, **422 with `knownError.code`** for
  `AskRefusal`, 500 otherwise. The `AskRefusal` marker class (`index.ts:60-68`)
  and `markAskRefusal` (`:88-91`) are untouched.
- **The guard can never steal a lawful envelope from a non-streaming reply.**
  `headersSent === true` means `safeWriteHead` already ran, i.e. the reply was
  already committed and a second `send` always threw. `reply.sent === true` means
  `writableEnded`, and there the guard deliberately does *not* destroy —
  keep-alive for a completed response is preserved (measured in the
  "throw after `raw.end()`" case, where the handler is not even reached).
- `git diff HEAD -- tests/unit/api.test.ts` is **additive only** — no assertion
  deleted, none relaxed. The 422 test (`:178-215`), the three-way 500 test
  (`:217-278`), the 400/401 test (`:325-335`) and the contract-client 422 test
  (`:280-293`) are POL-01 additions, unmodified.
  `tests/unit/pol01-policy.test.ts` is a new untracked POL-01 file and POL-02 did
  not touch it. (The `main.ts` delta in the working tree is ENV-01/POL-01's
  `readDeploymentRiskTier` work, not POL-02's.)

---

## 5. The sweep — mostly named-and-covered, two overstatements, one real omission

Checked item by item against `index.ts:220-233`:

1. `options.application.events(...)` iteration — real (`:228`), converges on the
   boundary ✓
2. `PostgresAskApplication.events` queries + split-lifecycle projection — real
   (`:469-534`) ✓
3. `RunEventSchema.parse(candidate)` — real (`:229`) ✓
4. `JSON.stringify(event)` — real and genuinely throwable (BigInt/circular) ✓ —
   **but `reply.raw.write(...)` does not throw and does not converge on the error
   boundary.** Node routes write failures to an asynchronous `'error'` event on
   the response (zero listeners here, see ADVISORY-4). Today they are benign — I
   fired 50 writes into a socket the client had already abandoned: silent
   no-ops, no crash — but the handoff's blanket "They all converge on the same
   Fastify error boundary" is **false for the transport half**.
5. `reply.raw.end()` — does not throw; nothing to converge. Overstated, harmless.

**Backpressure — named in the packet, covered nowhere.** `:230` ignores
`write()`'s return value and never waits for `'drain'`, so a stalled consumer
buffers the entire event dump in the response queue. Bounded by the run's event
count, so it is memory pressure rather than a crash — but it is waved at, not
handled.

**Omitted from the sweep entirely:** the second-error-delivery path
(ADVISORY-1), which is the one remaining way a post-header throw still kills this
process.

---

## Out of scope, but the orchestrator should see it

`createPool` (`packages/db/src/index.ts:10-12`) returns `new PgPool(...)` and
**no `'error'` listener is attached to the pool anywhere** — not in
`apps/api/src/main.ts:15`, not in `acceptance/main.ts:271`. `pg` re-emits
idle-client errors on the Pool; an EventEmitter `'error'` with no listener
throws → process death. For a stack whose embedded Postgres gets restarted and
reseeded underneath it, that is a second, independent stack-killer with exactly
the shape POL-02 just closed. It deserves its own ticket; it is not a POL-02
condition.

---

## Verdict

**`APPROVED` — nothing blocking.** The guard is total for every input this API
can produce, the predicate is provably complete against Fastify 5 and Node's
header semantics, the reproduction drives a real socket and kills all three named
mutations, the abort path leaks nothing, and POL-01 is intact and unweakened.

Advisories, in priority order, none gating the restart:
1. `reply.hijack()` inside the guard closes the second-delivery hole
   (`ERR_HTTP_HEADERS_SENT` → exit 1, demonstrated) and future-proofs cleanup.
2. Tighten the test's blanket rejection catch; assert the abort cause.
3. Correct the handoff: a nonexistent run id does **not** throw in the real
   application, and the UI is not an `EventSource`.
4. Record that raw write-after-end is uncaught here, and that backpressure on the
   SSE write is unhandled.

— Opus 5 lens, POL-02 rev1
