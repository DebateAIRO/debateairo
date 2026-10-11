# Live run events: one open stream per page, not one request per second

Date: 2026-10-11. Branch: fix/2026-10-11-live-run-events (based on 8b3201d75, the preview release).

## The problem in plain words

During a live debate the owner's debate page went dark for about 13 minutes at a time.

- `GET /v1/runs/:id/events` is charged to the `publicReads` admission budget (register v11:
  120 requests per 15 minutes per address).
- The server answered it with a SNAPSHOT: the stored events, then the reply ended.
- The page reconnected after every end. It reset its back-off on the first replayed (old) event, so it
  reconnected about once a second, and it re-read the page data on every connect and for every replayed
  node event.
- One open tab spent the 15-minute budget in about two minutes; the API then answered 429 and the page
  stayed dark until the window rolled over.

## The fix

### D. Server: a real live tail (apps/api/src/run-event-tail.ts, route in apps/api/src/index.ts)

One request = one admission = one long-lived stream.

1. Read a cheap change mark for the run (ONE SQL statement, owner-gated, on the existing pool, no
   connection held between polls), then replay the stored events exactly as today.
2. Every poll (default 1.5 s) read the change mark again. Only when it moved, read the event snapshot
   again (the same code as the replay) and send the events not sent yet (by `event_id`, in sequence
   order). The mark is read BEFORE the snapshot, so an event written in between is never lost; at worst
   it is read twice and sent once.
3. While nothing new is sent, write an SSE comment `: keep-alive` at least every 15 s, so the UI proxy and
   Caddy never cut an idle stream.
4. The stream ends when: a `run.terminal` event has been sent; the change mark says the run is settled (every
   work item DONE or FAILED) and its last events were sent; the run is no longer the caller's (the mark
   query is owner-gated); the client went away (abort signal: no further query); or the stream has lived
   30 minutes (the page simply reconnects).
5. The session is re-checked as today: `streamAuthorizedEvents` keeps its 250 ms authority monitor and its
   check before every write (heartbeats included). No change to that sealed 1000 ms revocation bound.
6. The `publicReads` gate stays exactly as it is (no register change); it is charged once, when the
   stream opens.

The change mark covers every source of the snapshot: stored progress events, failed work items (and whether
all work is finished), spawned nodes and their edges, judgement ledger entries and propagation runs.

Timings are an `ApiOptions.runEventTail` option (poll, heartbeat, life, and an injectable sleep/clock) so
tests can run them in milliseconds; production uses the defaults. An application without the change-mark
method keeps the old snapshot behaviour (in-memory test applications).

Cost: an idle open page costs one small query per poll (plus the existing session check every 250 ms, which
the 2026-10-10 connection budget already counts per open debate page). A busy run costs one snapshot read
per poll at most. No connection is held while waiting.

Proxy: `apps/ui/app/api/[...path]/route.ts` already passes `/events` through with no timeout (it follows the
client's signal only) and forwards `retry-after`; Caddy does not compress `/api/*`. No change needed.

### B. Client (apps/ui/lib/v3/liveEvents.ts, DebatePageClient.tsx, packages/contract)

- A seen-event gate remembers every `event_id` the page applied. A replayed (already seen) event is not
  applied again, does not reset the back-off and does not trigger a refresh. Only a NEW event resets the
  back-off and may trigger the settled-projection refresh (same event list as today).
- No refresh on (re)connect; one refresh when a stream closes (as today), which is now rare.
- After a clean close of a non-terminal run the page reconnects after at least 5 s, doubling up to 60 s.
- A 429 carries the server's `Retry-After`; `ContractHttpError.retryAfterMs` exposes it, and the page waits at
  least that long (at least 60 s when the header is missing).
- Terminal behaviour and the settled replay (`readEvents`) are unchanged; the settled replay ends because
  a settled run's stream ends after its stored events.

No migration, no register version, no new user-facing strings.

## Tests

- Integration (embedded Postgres, real route, real listen + streaming fetch):
  `tests/integration/live-run-events.test.ts` — events appended after the stream opened arrive in order on
  the same stream; heartbeats while idle; the stream ends on the terminal event; a client abort stops all
  further polling queries; one stream charges `publicReads` once.
- Unit: `tests/unit/run-event-tail.test.ts` (the tail loop with a fake clock), client gate and reconnect
  delay in `tests/unit/v2ui-live-events.test.ts`, `Retry-After` in the contract client test.
