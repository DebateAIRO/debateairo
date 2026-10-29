# Database connection budget (pre-launch, 2026-10-10)

The owner asked: *"When will we have a database connection problem?"* This page answers that, records what was
changed, and plans the next steps: Postgres memory settings at launch, PgBouncer later, and an alert.

## In one paragraph

Postgres on the server accepts 200 connections, 3 of them kept for the administrator. The side-by-side transition raises the limit to 320 at the Postgres restart in the drained window (section 8), once the new config is on the server. The job system (Hatchet) may take
up to 50. Before this change the website program (the API) could open up to about 104 connections. The debate runner had
only 10, but accepted up to 100 debates at once. Each running debate keeps 2 connections busy, so **the runner would
jam at about 5 debates at the same moment**: every debate then waits forever for a third connection that never comes,
until someone restarts it. The website had the same weakness in a milder form. A connection that was not available meant
*wait forever*, so about 10 people opening the same public debate at the same moment could freeze the website's main
pool. After this change every pool has a fixed size and a wait limit of a few seconds. Past that limit a visitor gets a
plain "busy, try again in a moment" (HTTP 503 with `Retry-After: 2`) instead of a page that never loads. The runner
takes at most 8 debates at once; the rest wait their turn in the job queue for up to 30 minutes.

Owner rulings, 2026-10-10: size for **one** API process (the server runs exactly one, `deploy/vps/README.md`, "Exactly one
API unit"), and **8 debates at once** on the runner.

**Update 2026-10-12 (parallel AI calls,
[spec §3.6](../superpowers/specs/2026-10-12-parallel-calls-design.md)):** a debate now asks its independent AI calls at the
same time, so their ledger and spend writes overlap. The runner's main pool grows from 20 to 32 (8 debates × 3 + 8), and a
separate pool of 2 serves only claim renewal, so a burst of writes never costs a debate its claim. The runner's total is
34; the server's sum of ceilings is 176 of 197 (with the data export's 1) and 21 stay free.

## 1. The budget

A pool opens a connection only when it needs one and closes it after 10 seconds unused, so these numbers are ceilings,
not reservations. The numbers live in [`packages/db/src/pool-budget.ts`](../../packages/db/src/pool-budget.ts). The
guard that keeps the code and the numbers in step is
[`tests/architecture/database-connection-budget.test.ts`](../../tests/architecture/database-connection-budget.test.ts).

### Website program (API), one process

| Pool (name in `pg_stat_activity`) | Before | Now | Wait limit | Why this size (from the code audit) |
|---|---|---|---|---|
| `api:runtime`: almost every read and write | 10 | 20 | 5 s | A content lease holds one connection while its body takes a second, so 8 overlapping reads need 17; billing timers and other loops use up to about 7 more at once |
| `api:authorization`: sign-in, sessions, account pages | 10 | 12 | 5 s | Every signed-in request, plus a check every 250 ms for each open debate page, plus recovery mail that holds one connection for up to 5 s while it sends; at most 4 open debate pages per session and 8 per account hold a live stream (NV-20) |
| `api:publication-cleanup` (only when publishing is on) | 10 | 4 | 5 s | The 30 s cleanup timer runs two cleanups at once, each using 2 connections |
| `api:content-provision` | 10 | 2 | 5 s | Only the single-flight erasure cycle uses it at run time |
| `api:ask-admission-server` | 10 | 4 | 10 s | One per ask in flight; asks are meant to wait their turn, so the limit is longer |
| `api:ask-admission-legacy` | 10 | 2 | 10 s | The same for the older path |
| `api:room-decision` | 4 | 4 | 10 s | Unchanged; one decision holds the site's day lock and the others queue here by design |
| `api:erasure` | 10 | 4 | 5 s | The erasure timer holds 2; deletes need the rest |
| `api:evaluator-dev-menu` | 10 | 2 | 5 s | Development only: the server refuses to start it anywhere else |
| `api:support` | 10 | 6 | 5 s | No support flow holds two connections since synthesis-flag S05 (2026-10-25, migration 0129): the support chat keeps no conversation, so case opens and their transcript read are gone. An incident answer reads in one statement, the erasure timer's support shred and its readback take one connection, one at a time (security fixes run 3, C-1), and the boot checks use it once |
| `api:support-relay-lease` | 18 | removed | — | Removed by synthesis-flag S05 (V-111, V-114, 2026-10-25): the relay queue and its daily call count now live in the API's memory, so the pool is no longer opened. The totals below are after this removal |
| `support:control` | 2 | 2 | 0.2 s | Unchanged; the support settings reader |
| `api:data-export` (only when the export store is set; mission data-export S01) | — | 1 | 15 s | One export build at a time on one connection: its lease renewal (every 15 s) waits for the snapshot read to free it, so a read of up to about 30 s keeps its lease |
| `api:release-watch` (since 2026-10-22, side by side; section 8) | — | 1 | 1 s | The release watcher's read of the current release, once a second, never two at once. Its own pool, so a burst of page reads on `api:runtime` can never make `/readyz` say the database is unreachable |
| `api:system` (since 2026-10-23, row-level security; section 9) | — | 6 | 5 s | The `api-system` login: every statement the API makes outside a signed-in request (background loops, billing jobs, boot checks) |
| `api:authorization-system` (since 2026-10-23, row-level security; section 9) | — | 2 | 5 s | The `api-authorization-system` login: the same for the authorization pool |
| **Total on the server** (dev menu off) | **104** | **70** (88 before the relay lease pool's removal on 2026-10-25, 80 before 2026-10-23, 79 before 2026-10-22) | | |

### Debate runner

| Pool | Before | Now | Wait limit | Why |
|---|---|---|---|---|
| `runner:runtime` | 10 | 32 (20 until 2026-10-12) | 5 s | 8 debates × 3 connections (the content lease, spend and memory reads, and the writes of AI calls running at the same time), plus 8 for claiming work, start-up checks, the story writer and bursts |
| `runner:keep-alive` (since 2026-10-12) | none | 2 | 5 s | Only the running debates' claim renewals, so they never wait behind a debate's writes |
| Debates at once | 100 (job system default) | **8** | 30 min in the queue | Each debate keeps its content lease for the whole debate and needs a second connection for spend and memory reads |

### The whole server

| Who | Connections at most |
|---|---|
| Website (API), one process | 70 (88 before 2026-10-25, 80 before 2026-10-23, 79 before 2026-10-22) |
| Debate runner (32 + 2 for claim renewal) | 34 |
| Hatchet (its role's limit, `deploy/postgres/bootstrap.sql`) | 50 |
| Migrator (its role's limit) | 3 |
| Owner's commands (billing, support, owner CLI; by hand, one at a time) | about 10 |
| **Sum of ceilings** | **167 of 197** (185 before 2026-10-25, 177 before 2026-10-23, 176 before 2026-10-22, 162 before 2026-10-12) |
| Left free | 30 (12 before 2026-10-25, 20 before 2026-10-23, 21 before 2026-10-22, 35 before 2026-10-12): room for cancellation connections (a cancelled query briefly opens one more, up to 4 per pool), the owner logging in during an incident, and slack |

Backups (`pg_dump` as the `postgres` user) use the 3 administrator slots.

A second API process does **not** fit at 200: 167 + 70 is more than 197. Two releases, each with its own API, do fit at
the transition's 320 (section 8). Before running a further API process (for example to restart without a gap, or to
grow), put PgBouncer in front (section 4) or raise `max_connections` together with the memory settings (section 3).

## 2. What happens when a pool runs dry

* The caller waits at most its wait limit (5 s, 10 s on the ask path, or 15 s for the data export worker), then gets a typed failure that is marked
  *busy* (`isDatabasePoolBusy`, `packages/db/src/index.ts`). The pool is not damaged; the next caller tries again.
  Before, the caller waited forever. Postgres's own "too many clients" refusal (SQLSTATE 53300) counts as busy too.
* The API answers a busy failure with HTTP 503, body `{"error":"SERVICE_BUSY"}`, header `Retry-After: 2`. The site's
  pages already treat any 503 as "try again in a moment" (`apps/ui/lib/v3/requestFailure.ts`). Every other database
  failure keeps the generic 500.
* The program writes **one** journal line per pool per 10 seconds, for example
  `[DATABASE_POOL_BUSY] pool=api:runtime reason=WAIT_TIMEOUT max=20 open=20 waiting=14 turned_away=37`. The reason is
  one of: `WAIT_TIMEOUT` (pool full), `CONNECT_TIMEOUT` (Postgres slow to accept), `SERVER_FULL` (Postgres refused).
* Every connection now carries its pool's name, so this query says who holds what:

```sql
SELECT application_name, usename, state, count(*)
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY 1, 2, 3
ORDER BY 4 DESC;
```

### When will people start waiting? (estimates, not measurements)

| What people do | Limit | What happens past it |
|---|---|---|
| Start a debate | 8 running at once | The next ones wait. If a debate takes about 5 minutes: debates 9–16 wait up to ~5 min, 17–24 up to ~10 min. A debate still waiting after 30 minutes fails. In a steady flow that is about 100 debates an hour. |
| Read pages, watch a live debate | 78 connections, each held for milliseconds per page | Roughly a few hundred people active at the same moment before waits go from milliseconds to seconds; past 5 s the page says "busy, try again" |

The debate length and the cost of each page are guesses. A load test on the preview would replace them with
measurements.

## 3. Postgres memory settings at launch (plan, not applied)

Measured on the preview server: 6 cores, 11.7 GB RAM, `shared_buffers` 128 MB (the factory default), `work_mem` 4 MB.
The factory default uses about 1% of the machine for Postgres's own cache. The same machine also runs Hatchet, the API,
the runner, the UI and Caddy, so Postgres should get about a quarter, not more.

Proposed drop-in file, `/etc/postgresql/18/main/conf.d/memory.conf` (beside `hardening.conf`):

```text
shared_buffers = 3GB              # ~25% of RAM; needs a Postgres restart
effective_cache_size = 7GB        # a hint to the planner about the OS file cache, not memory it takes
work_mem = 8MB                    # per sort or hash step, per query; few queries run at once, so this is safe
maintenance_work_mem = 512MB      # vacuum and index builds
random_page_cost = 1.1            # NVMe disk: random reads cost about the same as sequential ones
effective_io_concurrency = 200    # NVMe
log_temp_files = 10MB             # log any query that spills more than 10 MB to disk: the signal to raise work_mem
```

* **If the preview cluster runs on the same machine as production**, split it: give each about 1.5 GB of
  `shared_buffers` and 3.5 GB of `effective_cache_size`.
* **Why not more `work_mem`:** it is per step, per query. 176 connections × 8 MB × a few steps could, in theory, exceed
  the RAM. In practice only about as many queries run at once as there are cores, so 8 MB is safe. Raise it only when
  `log_temp_files` shows spills.
* **Keep `max_connections` at 200, or at 320 while the side-by-side transition lasts (section 8).** Each extra allowed connection costs memory even when unused, and 6 cores cannot run
  more than about 12–24 queries truly at the same time anyway. More connections do not mean more speed.
* **When to apply:** in the launch window, because `shared_buffers` needs a restart. Put the file in the repo
  (`deploy/postgres/postgresql.memory.conf`) and the step in the runbook in the same pull request.
* **How to check it worked:** `SHOW shared_buffers;` shows `3GB`; after a day the cache hit ratio
  (`blks_hit / (blks_hit + blks_read)` in `pg_stat_database`) should stay above 99%; `free -m` should still show free
  memory at the busiest time.

**When the server itself needs to grow:** when the processor stays above about 70% at busy times, or memory runs short,
not because of connections. On OVHcloud the next steps up from 6 cores / 12 GB are 8 cores / 24 GB and then
12 cores / 48 GB (plan names and prices differ by range and region). With 24 GB, `shared_buffers` would go to 6 GB.

## 4. PgBouncer later (plan)

**What it is:** a small connection-sharing program between the programs and Postgres. The programs open many cheap
connections to PgBouncer; PgBouncer keeps a few real ones and lends one out for each transaction ("transaction
pooling"). **What it buys:** connections stop being a limit. Two to four API processes could share about 40–60 real
connections, and each real connection saved is about 5–10 MB of server memory. It does not make a single page faster.

**The catch.** In transaction pooling, two statements from the same program connection can land on different real
connections. Anything that relies on *session state*, something that lives on one connection between statements,
breaks, mostly in silence. The audit of 2026-10-10 found these in the API and runner (no named prepared statements,
cursors or temporary tables were found):

| Session state | Where | What breaks |
|---|---|---|
| Session advisory locks held across statements | the run content lease (`packages/db/src/index.ts` `acquireRunContentLease`, used by about 50 callers); the ask admission lease (`acquireOwnerAskAdmissionLease`; its run commit must use the lock holder's connection); the publication lease (`publication-lease.ts`); the erasure content and notice leases (`account-erasure.ts`); the consumer mail lease (`consumer-security-mail.ts`); the billing subscription lease (`billing-jobs.ts`); the support relay slots (`support.ts`); the evaluator run lock (`packages/evaluator/src/index.ts`); the production principal lease (`apps/runner/src/production-database-principals.ts`) | A lock taken on one real connection and released on another stays held, or two callers both "get" it. Exclusion disappears. |
| `SET` without `LOCAL` | the content lease's `lock_timeout` (`packages/db/src/index.ts`); the read-only guard in the billing operator and serve-disclosure commands (`pool.on("connect")`) | The setting leaks to whoever gets that real connection next, or the guard checks a different connection than the one doing the work |
| Settings sent when connecting | `statement_timeout` on the support control-plane pool, on cancellation clients (`private-stream.ts`) and in the support commands | PgBouncer refuses unknown connection parameters unless it is told to ignore or track them |
| `LISTEN` | staff revocations (`packages/db/src/staff-access.ts`); not used today | Notifications reach only one real connection, with no error |
| Cancelling by backend id | `cancelAndDestroyPrivateClient` (`private-stream.ts`) | May cancel someone else's query |

**Setting it up correctly, in order:**

1. **Code first** (a few days, with concurrency tests that use many clients at once; single-client tests pass by luck):
   change each session lock into a transaction-level lock (`pg_advisory_xact_lock`) where the work fits inside one
   transaction, or run the whole leased body on the lease's own connection inside one transaction; use `SET LOCAL` only;
   move the connect-time `statement_timeout` into `SET LOCAL`.
2. **Hybrid while that is in progress:** pools that still need session state keep connecting straight to Postgres on
   port 5432; pools that are clean go through PgBouncer on port 6432. One environment variable per pool URL already
   exists, so this is configuration, not code.
3. **Hatchet stays on direct Postgres.** It is someone else's code; we cannot audit its session use.
4. PgBouncer settings to start from: `pool_mode = transaction`, `max_client_conn = 1000`, `default_pool_size = 20` per
   database and role pair, `max_db_connections = 100`, `track_extra_parameters = application_name` (so the pool names
   still show), `server_reset_query` left empty (transaction mode).
5. Run it on the preview first, with the load test, before production.

**When:** before running a second API process, or when the alert in section 5 fires regularly. Not needed for launch.

## 5. Alert (idea)

Fire when either is true:

* **Connections in use above 240** (three quarters of 320, the limit during the side-by-side transition; 150 at 200), for two minutes in a row:

```sql
SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend';
```

* **Any "too many clients"**: Postgres logs `FATAL: sorry, too many clients already` or `too many connections for role`
  (SQLSTATE 53300; `log_connections` is already on), or the API or runner journal has a `[DATABASE_POOL_BUSY]` line.
  `reason=SERVER_FULL` means Postgres refused; `reason=WAIT_TIMEOUT` means one pool is too small or something holds its
  connections too long.

**Where it could run:** production has no paging today (`deploy/vps/README.md`, "Nothing pages anyone"). Two options,
both later tasks:

1. A one-minute systemd timer that runs the count above as a read-only monitoring role and emails the owner through the
   existing `sendmail` path. It needs a new role and one `pg_hba` line.
2. The observation agent already has a Postgres capacity check
   (`apps/observation-agent/src/modules/postgres-capacity/`). Set `connections_severe_percent` to 75, but it first needs a
   Linux delivery channel (today it can only notify on macOS).

Whichever is chosen, include the per-pool query from section 2 in the message, so the alert says *who* holds the
connections.

## 6. Other problems the audit found (not fixed here)

Ranked by how likely they are to hurt at launch. Each is now bounded by the wait limit (an error after seconds instead of
a freeze), but each still deserves its own fix:

1. **Fixed in #130 (2026-10-10).** Outside the preview, every debate would have been cancelled after 60 seconds:
   `declareHatchetWalkingSkeletonTask` (`apps/runner/src/index.ts`) set `executionTimeout` only for the preview, and the
   SDK registers a task without one with `'60s'` (`@hatchet-dev/typescript-sdk` 1.28.1, `resolveExecutionTimeout`).
   Every deployment now gets 60 minutes (`RUNNER_EXECUTION_LIMIT`), beside this change's 30-minute queue wait.
2. **Fixed (security fixes run 3, NV-21).** **Public debate pages:** each reader takes a blocking, exclusive lock per
   publication on one connection, then reads on a second (`apps/api/src/publications.ts` `readPublicDebate`,
   `packages/db/src/publication-lease.ts`). Many readers of one popular debate queue on the lock, each holding a
   connection. Fix: a shared lock for readers, and reads on the lease's own connection. Readers now share the lease and
   read on its connection, and exclusive holders (key cleanup, erasure) wait at most 2 s (`LEASE_LOCK_WAITS`).
3. **Answer and home-page reads fan out**: three queries per node of the debate tree, all at once
   (`packages/serve/src/index.ts` `readNodesForRun`; the home list multiplies that by up to 50 answers). One big page can
   occupy the whole main pool for a moment. Fix: a small concurrency limit or one set-based query. On the API (security
   fixes run 3, NV-31) the node fan-out is serialized on the lease's connection, so one page holds one connection; the
   set-based query remains a possible speed-up.
4. **The run-key lookup inside every content lease takes a second connection** (the owner resolver in
   `apps/api/src/main.ts`, `FileRunContentKeyStore`). Fix: resolve on the lease's connection, or cache it.
   **Fixed on the API (security fixes run 3, NV-31)**: the resolver's query runs on the lease's connection, for borrowed
   and bare leases (`routeLeaseBodyQueries`, `packages/db/src/index.ts`); the runner is unchanged.
5. **Recovery mail holds a sign-in connection and the account's row locks while it sends** (up to 5 s;
   `packages/db/src/consumer-security-mail.ts`), with up to 32 sends at once. A slow mail server can starve sign-ins.
   Fix: cap those sends below the pool size, or send after the commit.
6. **Fixed (security fixes run 3, NV-30).** **Deleting a debate that is still running** waits, holding an erasure
   connection, for the runner's AI call to finish (`packages/db/src/account-erasure.ts` `withErasureContentLeases`, a
   blocking lock with no time limit). Fix: a lock timeout or try-lock on the delete request. A delete request checks its
   grant first, then tries the run's lease once in the same statement (`erasure_reconcile.prepare_private_run_erasure`).
   A request whose run is in use answers 'pending' without spending its grant, and a fake grant takes no lock. The
   account-erasure timer waits at most 2 s for each run's lease, then retries in the next cycle.
7. **Billing leases** hold one connection idle across NETOPIA calls (up to 30 s) and take a second for the write
   (`apps/api/src/billing/renewal.ts`, `refunds.ts`). `upgrade.ts` already does it right with `withTransactionOn`.
   Billing is off today.
8. **Gone (synthesis-flag S05, 2026-10-25).** **Opening a support case** read the messages on a second connection while
   holding the first (`packages/db/src/support.ts` `createCaseOnce`). Security fixes run 3 (NV-32) moved that read onto
   the case transaction's connection; S05 then retired support cases and the stored transcript (migration 0129), so
   neither the case open nor the read exists any more. **The publication cleanup timer** has no overlap guard
   (`apps/api/src/main.ts`).
9. **A pool that sees one broken idle connection refuses everything until the process restarts**, by design
   (`tests/integration/pol03-pool-resilience.test.ts`). systemd restarts the API only when it crashes, not when a pool
   is latched. Worth a health check that exits on a latched pool.
10. **Restart overlap:** the API unit starts `pnpm`, which starts `node` (`deploy/vps/systemd/debateai-api.service`). If
    `pnpm` does not pass the stop signal on, an old process can briefly overlap the new one. That is a second API's
    connections for up to 30 s.

## 7. What was not changed

In the 2026-10-10 change no server, deploy or Postgres setting changed (the 2026-10-21 raise to 320 is in section 8). The
one-shot commands (migrator, billing, support and owner CLIs, scheduler jobs) keep their own pool sizes; they run by hand,
one at a time.

## 8. Side by side (2026-10-21)

The side-by-side transition (spec §9 and its section "The transition"; the spec is `docs/superpowers/specs/2026-10-21-side-by-side-uploads-design.md` in the DebateAIRO folder, outside this engine repository) runs two releases
at once while the new one takes over: the old release keeps its drained debates, and the new one takes new work. Each
release has its own API and its own runner, so the server holds two of each while they overlap. No pool size changed;
the server's limit did, and one pool of 1 was added.

**The release watcher's own pool (2026-10-22, final fix wave P1).** Each API reads which release is current once a second
and answers `/readyz` from that read; a read older than 5 seconds makes `/readyz` say the database is unreachable, and
Caddy then marks that release's website and API down. The read used to wait on `api:runtime` (20 connections, a 5 s wait
for one), so a burst of page reads could starve it and take the only front pair down: a site-wide outage. It now has its
own pool, `api:release-watch`: 1 connection (its reads never overlap) and a 1 s wait (a read that cannot get it fails
and the next poll, a second later, tries again). One API is 80 at most, and the spare drops from 28 to 26.
`max_connections` stays 320.

| Who | Connections at most |
|---|---|
| Website program (API), two releases at 80 each | 160 |
| Debate runner, two releases at 34 each | 68 |
| Hatchet (its role's limit) | 50 |
| Migrator (its role's limit) | 3 |
| Owner's commands | about 10 |
| **Sum of ceilings** | **291** (289 before the release watcher's pool) |
| Left free | 26 (317 = 320 less the administrator's 3; 28 before the release watcher's pool) |

* **The limit is 320**, in `deploy/postgres/postgresql.hardening.conf` (`max_connections = 320`). It takes effect only at a
  Postgres restart, made in the drained window of the side-by-side transition (spec §9, "The transition"). After that restart, `SHOW max_connections;`
  must return 320. Until then the running server still allows 200.
* **Memory.** Pools open connections only when needed, but a higher limit still costs some memory even when idle (section 3).
* **Query cancellations.** A cancelled query opens a short extra connection outside its pool, and each pool allows at most
  four of them at once (`packages/db/src/private-stream.ts`). Counted pool by pool, one API and one runner are 14 pools
  that can cancel (12 API pools with the dev menu off, plus the runner's 2), so two releases are 28. The release
  watcher's pool sends no cancel: a read it gives up on hands its connection back destroyed, and the database ends the
  statement by its own statement timeout. The 26 free connections cover one cancellation for 26 of those 28 pools at
  the same moment, with nothing left for the owner's login (28 covered all 28 before the release watcher's pool). They
  do not cover four per pool, which would need 112. Section 1 has the same gap for one release (four per pool across 14
  pools would need 56, against 20). No pool size or constant was changed for this; whether to raise the spare, lower the
  cancellation cap, or accept the gap is the controller's decision.
* **After the transition.** When the old release retires, one release's numbers from section 1 apply again (177 of 197 at
  200). Whether the limit goes back to 200 is the owner's decision, and changing the limit also needs a restart.
* **The alert in section 5** fires above 240 connections while the limit is 320.

## 9. Row-level security (2026-10-23)

Mission row-level security S01 (`docs/missions/row-level-security/slices/S01/DECISIONS.md` D29, D50) turns row security
on for every table that holds an account's rows. The two everyday API logins then see only the signed-in account's rows,
so every statement the API makes outside a signed-in request (background loops, billing jobs and webhooks, boot checks)
runs on one of two new logins instead, each on a pool of its own: `api:system` (6, the `api-system` login) and
`api:authorization-system` (2, the `api-authorization-system` login). The room-decision pool keeps its 4 and connects as
`api-system`. One API is 70 at most (62 without row-level security, now that synthesis-flag S05 removed the
18-connection `api:support-relay-lease` pool).

| Who | Connections at most |
|---|---|
| Website program (API), two releases at 70 each | 140 |
| Debate runner, two releases at 34 each | 68 |
| Hatchet (its role's limit) | 50 |
| Migrator (its role's limit) | 3 |
| Owner's commands | about 10 |
| **Sum of ceilings** | **271** (255 without row-level security) |
| Left free | 46 (317 = 320 less the administrator's 3; 62 without row-level security) |

`max_connections` stays 320. One release at the old 200 is 167 of 197, 30 free (section 1). One API and one runner are
now 15 pools that can cancel (13 API pools with the dev menu off, plus the runner's 2), 30 for two releases, and the 46
free connections cover one cancellation for each of them at the same moment. No other pool size changed.
