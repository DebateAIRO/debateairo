# SPEC — SUP-06 Abuse controls, spend caps, queueing and degraded mode

**Status:** FROZEN at creation (2026-09-01, REQ-SUP). No agent edits this file after
creation. Scope change = new SPEC version, ratified by V.

**Mission:** `observability-agents` · **Product:** SupportAgent (Bot A) · **Traces to:** V's
goal (`00-intake-H0.md:10`); packet charge Q3 ("rate limits per IP and per account, abuse
controls"); COMMON §3 high-risk floor (provider spend). Requirements file:
`requirements/supportagent.md` (Q3, Q4). **Depends on:** SUP-01. **Tree state measured:**
`dev` @ `4f764037`.

## Intent

An always-open assistant is an always-open cost and attack surface. This slice makes every
bound a V-owned number, makes the assistant degrade instead of inventing, and makes the
spend visible to V in one command.

## Ground truth this SPEC rests on (measured 2026-09-01 on `4f764037`)

- No rate limit exists outside the zone: `POST /v1/asks` (`apps/api/src/index.ts:863`) and
  the anonymous public reads (`:705`, `:724`) are unthrottled; the only limiters live in
  zone files (`apps/api/src/registration.ts:115`, scoped to three auth routes at `:101`).
  The assistant must not reuse them (zone) and builds its own on `normalizeClientIp`
  (`apps/api/src/client-ip.ts:23`).
- The relay spawns one CLI child per call with no queue or semaphore
  (`acceptance/relay-core.ts:122`); failures surface as HTTP 502/504 (`:355`) and never as
  a fabricated completion (`:16-17`). The Claude relay reports cost only optionally
  (`acceptance/claude-relay.ts:47`); the Codex path is unmetered (`acceptance/model-shim.ts:138`).
- Register rows are the only configuration surface (`register.register_row`,
  `migrations/0000_s00.sql:275`); `process.env` is read only by the register loader
  (`tools/orphan-audit/src/index.ts:455`).

## Requirements

### SUP-06-R01 — Every bound is a register row, and V can set it
Rows and defaults: `support_limit_anon_msgs_10m` 20 · `support_limit_anon_msgs_24h` 100 ·
`support_limit_anon_sessions_1h` 5 · `support_limit_session_msgs` 40 ·
`support_limit_msg_chars` 2000 · `support_limit_account_msgs_10m` 60 ·
`support_limit_account_msgs_24h` 300 · `support_relay_concurrency` 2 ·
`support_queue_depth` 10 · `support_daily_call_cap` 500 · `support_lock_after_injections`
3 · `support_ip_cooldown_minutes` 60. `pnpm support:limits set <row> <value>` changes one
row and takes effect within 5 s without an API restart; `pnpm support:status` prints every
row with its current value.

### SUP-06-R02 — Per-account limits
When the support session is bound to an `identity_owner_ref`, the account limits apply in
addition to the per-session limits; exceeding one returns HTTP 429 with the RATE_LIMITED text.

### SUP-06-R03 — Concurrency and queue
At most `support_relay_concurrency` model calls are in flight; further requests wait in a
FIFO queue up to `support_queue_depth`; a request waiting more than 3 s shows the QUEUED
text with its position; a request that cannot enter the queue gets the DEGRADED text
immediately.

### SUP-06-R04 — Daily cap
After `support_daily_call_cap` model calls in a UTC day, model-backed replies return
DEGRADED until 00:00 UTC; deterministic replies (refusals, incidents, case creation)
continue.

### SUP-06-R05 — Locks and cooldowns
After `support_lock_after_injections` `REFUSE_INJECTION` outcomes the session is `LOCKED`
(SUP-01-R06). After two `LOCKED` sessions from one client IP within 24 h, new sessions
from that IP are refused with RATE_LIMITED for `support_ip_cooldown_minutes`.

### SUP-06-R06 — Abuse events carry no content
`support.abuse_event.class` ∈ {`INJECTION`, `RATE_LIMIT`, `LOCK`, `IP_COOLDOWN`,
`BOUNDARY_DENY`, `SECRET_LIKE`}; columns: `session_id`, `class`, `message_sha256`,
`ip_sha256`, `at`. No message text, no raw IP.

### SUP-06-R07 — Degraded mode is automatic both ways
A relay 502/504 or connection failure switches the assistant to degraded mode: model-backed
replies return DEGRADED within 1 s; `pnpm support:status` prints `relay: unavailable since
<time>`; the next successful call clears it. "Talk to a human" works throughout.

### SUP-06-R08 — Spend is visible
`pnpm support:status` prints, for today and the last 7 days: model calls, typed token
counts when the relay reports them, and the sum of reported cost in USD — printed as
`UNKNOWN` (never `0`) when the relay reports none.

## States

- Assistant: `NORMAL` ↔ `DEGRADED` (relay failure or cap). Session: `OPEN` → `LOCKED`.
- Client IP: `NORMAL` → `COOLDOWN` (timed) → `NORMAL`.

## Copy — verbatim, both languages

- QUEUED · en: "Waiting for the assistant's model… you are number {n} in line." · ro: "Se
  așteaptă modelul asistentului… ești numărul {n} la rând."
- DEGRADED and RATE_LIMITED: as in SUP-01 §Copy (unchanged).

## Acceptance — V runs these in the real dev stack

1. `pnpm dev:auth:up`; `pnpm support:status`. Expected: every R01 row printed with its
   default; `relay: available`; `calls today: <n>`; `cost today: UNKNOWN` or a USD figure.
2. `pnpm support:limits set support_limit_anon_msgs_10m 3`. Private window `/help`: send
   four short messages within a minute. Expected: the fourth returns RATE_LIMITED within
   1 s. psql: `SELECT class FROM support.abuse_event ORDER BY at DESC LIMIT 1;` Expected:
   `RATE_LIMIT`. Then `pnpm support:limits set support_limit_anon_msgs_10m 20`.
3. `pnpm support:limits set support_relay_concurrency 1` and `… support_queue_depth 1`.
   Open two private windows on `/help`; send a question in both within one second.
   Expected: one answers; the other shows QUEUED with `number 1` for a few seconds and then
   answers. Open a third window and send a question while the first two are in flight.
   Expected: DEGRADED immediately. Restore both rows to defaults.
4. `pnpm support:limits set support_daily_call_cap 1`. Send one question (answered), then a
   second. Expected: the second returns DEGRADED; type `reset my password`. Expected:
   REFUSE_ZONE still works. Restore the cap to 500.
5. `pnpm support:limits set support_model_ref development:none`. Send a question. Expected:
   DEGRADED within 1 s; `pnpm support:status` prints `relay: unavailable since <time>`.
   Restore `support_model_ref development:claude-cli`; send a question. Expected: an
   answer; status prints `relay: available`.
6. In one window paste three injection payloads in a row. Expected: third reply is
   REFUSE_INJECTION and the fourth message returns RATE_LIMITED (session `LOCKED`). Open a
   new private window from the same machine and repeat. Expected: after the second locked
   session, a third new window's first message returns RATE_LIMITED (IP cooldown). psql:
   `SELECT class, count(*) FROM support.abuse_event GROUP BY class;` Expected: rows for
   `INJECTION`, `LOCK`, `IP_COOLDOWN`; `SELECT count(*) FROM support.abuse_event WHERE
   message_sha256 IS NULL;` Expected: `0` for INJECTION rows.
7. psql: `SELECT column_name FROM information_schema.columns WHERE table_schema='support'
   AND table_name='abuse_event';` Expected: exactly `session_id, class, message_sha256,
   ip_sha256, at` (plus a primary key column).

## Out of scope (this slice)

- CAPTCHA or any bot-detection challenge (defensive-only posture; not in phase 1).
- Alerting V about abuse (ObservationAgent channel). Spend accounting for the debate engine.

## Parallel-safety (single-writer rule)

- Creates: `apps/api/src/support/limits.ts`, `apps/api/src/support/queue.ts`,
  `apps/api/src/support/degraded.ts`, `apps/runner/src/support-limits-cli.ts`,
  `tests/architecture/sup-06-*.test.ts`.
- Appends lines to: `package.json` (`support:limits`). No route additions; no migration
  (register rows and the SUP-01 abuse table suffice) unless Architecture records one in
  DECISIONS.
- Depends on SUP-01. Parallel-safe with SUP-02, SUP-03, SUP-04, SUP-05, SUP-07.
