# /goal packet — POL-02 (Codex seat, PROG-V3-R1) — EMERGENCY

**Board:** `debateai-v3` · **Ticket:** `t_a6183a3b` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok), both must
greenlight. Day mode: questions route UP to the orchestrator.

Standing law: `CODING-LOOP-PROTOCOL.md`. Read the ticket body AND its
escalation comment (`hermes kanban --board debateai-v3 show t_a6183a3b`).

## Why this is an emergency

**The standing stack has crashed three times today and CANNOT STAY UP.** The
whole ceremony process — embedded PostgreSQL, model shim, API — dies within
seconds-to-minutes of boot. V cannot browse anything. Each reboot also spends
~6 real model calls on the ceremony debate before dying.

## The mechanism, established from three crash traces

1. A browser tab holds an SSE `EventSource` to a debate id from a PREVIOUS
   database generation (reseeds change ids, so stale tabs are guaranteed).
2. The tab auto-reconnects to the new API.
3. The streaming route throws AFTER headers are sent.
4. The Fastify `setErrorHandler` (`apps/api/src/index.ts`, the POL-01 handler)
   calls `reply.send(...)` on a reply whose headers are already gone.
5. `ERR_HTTP_HEADERS_SENT` escapes unhandled → **the Node process dies**,
   taking DB + shim + API with it.

Stack trace ends: `handleError → onErrorHook → Reply.send → wrap-thenable →
ERR_HTTP_HEADERS_SENT`. Verbatim in three separate boots.

**The stack is DOWN now and stays down until you fix this** — do not try to
verify against :8790; your reproduction is in-process.

## DELIVERS

1. **The error handler is total.** When the reply is already sent / streaming
   (`reply.sent`, `raw.headersSent`, or the SSE hijack), it must NOT call
   `reply.send`. Terminate the stream honestly instead — destroy the socket,
   or emit a terminal SSE error event if the protocol supports one; choose and
   justify. DR-115: a killed stream must NOT fabricate a graceful ending — if
   the run state is unknown, the client sees an aborted stream, never a
   synthesized completion event.
2. **No error path can kill the process.** One connection's late error must
   never take the API down for everyone. Sweep the SSE translation path in
   `apps/api` for other late-throw sites (the nonexistent-answer-id reconnect
   is the known one — what ELSE can throw after headers?).
3. **Reproduce-first (this is your RED, from production):** a test that opens
   a stream to a NONEXISTENT answer id (the stale-tab case), lets the route
   throw mid-stream, and asserts (a) the process survives, (b) a subsequent
   ordinary request still answers. That exact sequence killed the stack today.
4. POL-01's mapping must be UNTOUCHED for non-streaming replies: refusals
   stay 422-with-code, internal faults stay 500. Its tests must stay green.

## DONE WHEN

The RED above exists and goes GREEN; the crash sequence provably cannot kill
the process; POL-01's suite untouched-and-green; every gate green with REAL
pasted output EACH; handoff at `handoffs/POL-02-codex-handoff.md`; progress
log `handoffs/POL-02-progress.log`; ticket to `review` with
`READY FOR PEER REVIEW — POL-02`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
