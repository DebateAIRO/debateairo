# POL-02 Codex handoff

Ticket: `t_a6183a3b`  
Worker session: `019ff59f-e98d-7482-8aa8-41b79375c877`  
Disposition requested: dual-diamond peer review (Opus 5 + Grok)

## Outcome

The Fastify error handler is now total for a reply whose transport is already
committed (`reply.sent` or `reply.raw.headersSent`). It does not call
`reply.send` again. If the response is still open, it destroys that one
response/socket and returns without throwing.

Destroying the connection is the lawful DR-115 choice. The contract defines no
SSE error event that can honestly state the unknown run outcome, so synthesizing
a terminal event would fabricate a graceful ending. The client instead observes
an aborted stream and may reconnect according to EventSource semantics.

No process-level `uncaughtException` or `unhandledRejection` guard was added.
The fault is contained at the Fastify reply boundary, where it can be handled
without masking unrelated process defects.

## Inventory and ownership

- `apps/api/src/index.ts` — POL-02-owned addition: late-reply detection and
  connection-local termination in the existing POL-01 error handler; the
  non-streaming 400/422/500 mapping is unchanged.
- `tests/unit/api.test.ts` — POL-02-owned addition: real ephemeral TCP listener,
  stale/nonexistent run EventSource failure, server-abort assertion, and a
  subsequent successful request from another client.
- `docs/missions/2026-08-06-v3-programming/handoffs/POL-02-progress.log` —
  append-only major-step trace.
- `docs/missions/2026-08-06-v3-programming/handoffs/POL-02-codex-handoff.md` —
  this evidence packet.

The worktree was already dirty at claim. In particular, `apps/api/src/index.ts`
and `tests/unit/api.test.ts` contained POL-01 work. POL-02 preserved those edits
and added only the late-stream branch and one regression. All other dirty paths
remain attributed to their pre-existing owners and were not edited for POL-02.

## SSE translation-path sweep

After `reply.raw.writeHead(200, ...)`, every one of these sites can fail late:

1. `options.application.events(...)` database iteration, including the known
   nonexistent/stale run ID case;
2. `PostgresAskApplication.events` queries and split-lifecycle projection;
3. `RunEventSchema.parse(candidate)` for a corrupt or drifted stored event;
4. `JSON.stringify(event)` and `reply.raw.write(...)` transport work;
5. `reply.raw.end()` transport completion.

They all converge on the same Fastify error boundary. The new already-sent
branch aborts only the affected connection and never attempts another header or
body write. No second SSE-specific error protocol was introduced.

## TDD evidence

### RED — exact production mechanism

Command:

```text
pnpm vitest run tests/unit/api.test.ts -t "aborts a stale SSE connection"
```

Real output before the production change:

```text
× aborts a stale SSE connection without killing subsequent API requests 1057ms
  → expected 'timed_out' to be 'aborted_by_server'

Test Files  1 failed (1)
Tests       1 failed | 15 skipped (16)
Errors      1 error

Unhandled Rejection
Error: Cannot write headers after they are sent to the client
Serialized Error: { code: 'ERR_HTTP_HEADERS_SENT' }
```

The stack in the real RED was the reported production stack:
`error-handler.js -> fallbackErrorHandler -> handleError -> onErrorHook ->
Reply.send -> wrap-thenable`.

### GREEN — focused crash regression

Same command after the fix:

```text
✓ aborts a stale SSE connection without killing subsequent API requests 67ms

Test Files  1 passed (1)
Tests       1 passed | 15 skipped (16)
Duration    434ms
```

The test proves both required halves: the stale stream is aborted by the server,
and a second authenticated `/v1/session` request returns 200 from the same
Fastify process.

## Fixture and gate status

### POL-02 stale-stream fixture + untouched POL-01 policy suite

```text
pnpm vitest run tests/unit/api.test.ts tests/unit/pol01-policy.test.ts

Test Files  2 passed (2)
Tests       25 passed (25)
Duration    686ms
```

This includes the existing refusal `422` tests, internal-fault `500` tests,
malformed-request `400` tests, and the new late-stream survival test.

### TypeScript

```text
pnpm typecheck
$ tsc --noEmit
```

Exit code: 0.

### Full Vitest suite

```text
pnpm test

Test Files  63 passed (63)
Tests       453 passed (453)
Duration    22.96s
```

The run included real embedded PostgreSQL and shut it down cleanly.

### Architecture/source audits

```text
pnpm lint
{
  "edgeRowsChecked": 27,
  "violations": []
}
{
  "blocking": []
}
```

### Production build

```text
pnpm build
$ tsx packages/contract/src/generate.ts
$ tsc --noEmit
$ next build
✓ Compiled successfully
✓ Generating static pages (8/8)
```

### Outer skeleton checks

The checkout does not contain `tests/render-templates.sh` or
`tests/lint-templates.sh`. Attempting the required first command produced:

```text
bash: tests/render-templates.sh: No such file or directory
```

No `skeleton/` file was changed; this absence is recorded, not presented as a
green gate.

## Acceptance, SOLID, DDD, and pattern register

- Total late-reply behavior: satisfied by the committed-reply branch and the
  real-listener survival regression.
- Process survival and request isolation: satisfied by the same-process second
  request and the absence of Vitest unhandled errors on GREEN.
- DR-115: satisfied by aborting transport; no completion/error event or product
  data is invented.
- POL-01 preservation: satisfied by 25/25 API/POL-01 tests and the unchanged
  mapping computation.
- P3 (single Fastify facade/SSE route): preserved; no alternate front door.
- P14 (closed SSE vocabulary): preserved; no new event member minted.
- P15 (bulkhead failure isolation): the failure is confined to one connection.
- SRP/OCP: one existing transport error boundary owns reply writability; route
  and domain application interfaces remain unchanged.
- TDD: production-exact RED was captured before the smallest GREEN change; no
  refactor outside the error boundary followed.

## Deferrals and environment tail

- Verification against the standing `:8790` stack was intentionally not run;
  the goal packet states that stack is down and requires an in-process
  reproduction. The regression uses a real ephemeral listener instead.
- No Docker/Hatchet invocation was needed.
- No commit, push, merge, branch, reset, worktree creation, destructive action,
  provider call, product-data write, or fabricated runtime data occurred.

## Risks and questions for V

Residual client behavior is the normal EventSource reconnection policy after an
abrupt transport close. A permanently stale browser tab may continue retrying,
but each retry is connection-local and can no longer kill the API. Product-level
backoff or a pre-header 404 lookup would be a separate contract/design change.

Questions for V: none.
