# /goal packet — POL-03 (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_5faad0ce` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok), both
must greenlight.

Standing law: `CODING-LOOP-PROTOCOL.md`. Read the ticket body.

## The defect — measured by POL-02's approving lens, not speculated

`createPool` (`packages/db/src/index.ts:10-12`) attaches **no `error`
listener** to the pg Pool. node-postgres emits `error` on the pool for
backend/idle-client failures; with zero listeners that is an **uncaught
exception** — a Postgres restart, OOM kill, or connection reset under a live
API kills the whole process. This is exactly the class POL-02 closed at the
HTTP layer, one layer down — and the corrected incident analysis says a pool
failure during a reseed was likely the ACTUAL trigger of yesterday's three
stack deaths.

## DELIVERS

1. Pool-level error handling that keeps the process alive and surfaces the
   failure HONESTLY: in-flight queries fail typed and loud; no silent retry
   that fabricates health (DR-115); no swallowing that leaves the pool
   secretly dead.
2. Reproduce-first: in a child process, kill/reset the backend under a live
   pool, assert the process SURVIVES and subsequent queries fail TYPED rather
   than the process dying. That RED is yesterday's incident.
3. Surgical: do not redesign pooling, do not add retry policy (that would be
   a V value), do not touch the HTTP layer.

## DONE WHEN

RED→GREEN with the child-process proof; every gate green with REAL pasted
output EACH; handoff at `handoffs/POL-03-codex-handoff.md`; progress log
`handoffs/POL-03-progress.log`; ticket to `review` with
`READY FOR PEER REVIEW — POL-03`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
