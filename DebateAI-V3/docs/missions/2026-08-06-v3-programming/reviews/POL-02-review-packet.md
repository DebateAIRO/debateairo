# Review packet — POL-02 (dual diamond, DR-153) — the stack-killer

**Board:** `debateai-v3` · **Ticket:** `t_a6183a3b` (`review`) · READ-ONLY.
Both lenses must greenlight.

## The production incident this fixes

The standing stack crashed THREE TIMES today, identically: a stale browser tab
reconnects its SSE EventSource to a debate id from a previous DB generation →
the streaming route throws after headers are sent → POL-01's `setErrorHandler`
calls `reply.send` on an unsendable reply → `ERR_HTTP_HEADERS_SENT` escapes →
**the Node process dies**, taking embedded PG + shim + API with it. The stack
is DOWN now, deliberately, awaiting this fix.

## The worker's fix (apps/api/src/index.ts:107-120ish)

Guard at the top of the error handler: if `reply.sent || reply.raw.headersSent`,
do NOT send — destroy the raw socket (nested try, socket-level fallback), never
fabricate a terminal SSE event (DR-115), never rethrow. Non-streaming replies
keep POL-01's exact mapping. Claimed: a reproduction test (stream a
nonexistent answer id, throw mid-stream, process survives, next request
answers), an SSE-path sweep, 25 focused passes.

## Orchestrator's independent gates — do not re-run

root `tsc` clean · root vitest **63 files / 453 tests** · source audit 0
blocking.

## What to judge

1. **Is the guard actually total?** Enumerate what can throw INSIDE the guard
   path itself (destroy throwing, raw already null, double-invocation of the
   handler). The bar: NO input can make the handler itself throw. Read
   Fastify 5's error-handler semantics for hijacked/streaming replies — is
   `reply.sent || reply.raw.headersSent` the complete predicate, or can a
   reply be mid-flight (headers queued, not flushed) and slip between the
   checks into `reply.send`?
2. **Does the reproduction test reproduce THE incident?** It must open a real
   stream (nonexistent answer id — the stale-tab case), throw after headers,
   and assert BOTH survival and that a subsequent request answers. A test
   that unit-tests the guard function without a real socket does not prove
   the crash is dead.
3. **DR-115 on the aborted stream:** the client must see an ABORTED stream —
   verify nothing writes a synthesized terminal/completion event on the way
   down. And the inverse: does the abort path leak the connection (socket
   destroyed but SSE heartbeat timer / DB listener not cleaned up)? A leak
   per stale reconnect is a slow-motion version of the same outage.
4. **POL-01 untouched for non-streaming:** refusals still 422-with-code,
   internal faults 500, the AskRefusal marker intact, POL-01's suite green
   UNMODIFIED (check the tests were not weakened to accommodate the guard).
5. **The sweep:** the known throw site is the nonexistent-id reconnect. Did
   the worker actually enumerate other post-header throw sites in the SSE
   translation path (serialization of a malformed event, DB error mid-stream,
   client backpressure), and are they covered by the same guard or by their
   own handling?
6. **Mutation-argue the reproduction test:** would it fail if the guard were
   deleted? If `destroy()` were replaced with a fabricated `event: end`
   write? If only `reply.sent` were checked but not `headersSent`?

## Verdict

`APPROVED` or `CHANGES REQUESTED`; BLOCKING → ADVISORY with file:line and
concrete failing cases. The stack restarts the moment this double-greens —
judge it like the uptime of everything depends on it, because it does.

Write to `reviews/pol02-<yourname>-rev1.md` and print to stdout.
