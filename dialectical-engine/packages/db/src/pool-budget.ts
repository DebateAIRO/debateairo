/**
 * How many Postgres connections each always-on process may hold, pool by pool,
 * and how long a caller waits for one before it is told the database is busy.
 *
 * Pre-launch budget, 2026-10-10. The server allows 200 connections (3 kept for
 * the superuser) and Hatchet's role may take 50 of them. Owner rulings that day:
 * size for ONE API process — the server runs exactly one — and let the runner
 * run at most 8 debates at once. One API is 79 connections at most and the
 * runner 34 (20 until parallel AI calls, 2026-10-12), which leaves room for
 * Hatchet, the migrator, the operator's commands and 21 spare. A second API process needs PgBouncer or a higher limit
 * first. The plan, the per-pool audit and the arithmetic:
 * docs/operations/2026-10-10-database-connection-budget.md; the guard that keeps
 * main.ts and these numbers in step: tests/architecture/database-connection-budget.test.ts.
 *
 * A pool only opens a connection when it needs one and closes it after 10 s
 * idle, so `max` is a ceiling, not a reservation. `connectionTimeoutMillis`
 * bounds the wait for a free connection as well as the opening of a new one;
 * past it the caller gets a busy failure (isDatabasePoolBusy) that the API
 * answers with a retryable 503, where before it waited for ever.
 *
 * `name` is sent as the connection's application_name, so pg_stat_activity
 * says which pool holds which connection.
 */
export type DatabasePoolBudget = Readonly<{ name: string; max: number; connectionTimeoutMillis: number }>;

function budget(name: string, max: number, connectionTimeoutMillis: number): DatabasePoolBudget {
  return Object.freeze({ name, max, connectionTimeoutMillis });
}

export const API_DATABASE_POOLS = Object.freeze({
  // Almost every read and write. A content lease holds one connection while its
  // body takes a second, so 8 overlapping reads need 17; billing's timers and
  // the other background loops take the rest.
  runtime: budget("api:runtime", 20, 5_000),
  // Every signed-in request, a session check every 250 ms per open debate
  // page, and recovery mail that holds one across a send of up to 5 s.
  authorization: budget("api:authorization", 12, 5_000),
  // The 30 s cleanup timer runs two cleanups at once, each a lease plus a query.
  publicationCleanup: budget("api:publication-cleanup", 4, 5_000),
  // Only the single-flight erasure cycle uses it at run time.
  contentProvision: budget("api:content-provision", 2, 5_000),
  // One per ask in flight. Asks are meant to wait their turn here, so the wait
  // is longer than for a page read.
  serverAskAdmission: budget("api:ask-admission-server", 4, 10_000),
  legacyAskAdmission: budget("api:ask-admission-legacy", 2, 10_000),
  // The room decision holds the site's day lock; waiters queue on this pool,
  // never on the pool that decision needs (packages/budget/src/spend-lock.ts).
  roomDecision: budget("api:room-decision", 4, 10_000),
  // The erasure timer holds a notice lease plus one more; deletes wait here.
  erasure: budget("api:erasure", 4, 5_000),
  // Development only: the runtime environment refuses it anywhere else.
  evaluatorDevMenu: budget("api:evaluator-dev-menu", 2, 5_000),
  // Opening a support case holds one connection and reads the messages on another.
  support: budget("api:support", 6, 5_000),
  // Every relay slot the register may allow (16, live, no restart) holds one
  // for the whole AI call, plus 2 for the queue's bookkeeping.
  supportRelayLease: budget("api:support-relay-lease", 18, 5_000),
  // The data export worker (mission data-export S01; opened only when DATA_EXPORT_STORE_PATH is set): one build at a
  // time (single-flight timer) on one connection (V-43). Its 15 s lease renewal queues behind the snapshot read and
  // waits the full 15 s, so a read of up to ~30 s keeps its lease.
  dataExport: budget("api:data-export", 1, 15_000)
});

/** The support settings reader (API and the support commands): it gives up after 200 ms by design. */
export const SUPPORT_CONTROL_PLANE_POOL = budget("support:control", 2, 200);

/**
 * Debates one runner process runs at once. Each holds its content lease for
 * the whole debate and takes a second connection for spend and memory reads;
 * since a debate's AI calls run at the same time (spec
 * docs/superpowers/specs/2026-10-12-parallel-calls-design.md §3.6) their ledger
 * and spend writes overlap, so a third. The runner's pool is three times this
 * plus 8 for the claim, the start-up reconciliation, the story writer and
 * bursts. Claim renewal has its own pool of 2 (`keepAlive`), so a burst of a
 * debate's writes never costs a debate its claim. Further debates wait in
 * Hatchet's queue.
 */
export const RUNNER_CAPACITY = Object.freeze({ concurrentRuns: 8 });

/**
 * Side-by-side uploads spec 2026-10-21 §9, §13 (plan C task C8): the debates the whole site runs at once, across every
 * release side by side. The API starts a debate only while fewer runs than this have a READY or CLAIMED job (counted in
 * the spend-decision lock, `AskAdmissionGate.activeDebates`); otherwise the question waits in line (SITE_BUSY). It is
 * the runners' own capacity, so two releases' runners together never take more debates than one runner was sized for.
 */
export const SITE_CONCURRENT_DEBATES: number = RUNNER_CAPACITY.concurrentRuns;

export const RUNNER_DATABASE_POOLS = Object.freeze({
  runtime: budget("runner:runtime", RUNNER_CAPACITY.concurrentRuns * 3 + 8, 5_000),
  // Only the running debates' claim renewals (apps/runner/src/run-keep-alive.ts).
  keepAlive: budget("runner:keep-alive", 2, 5_000)
});
