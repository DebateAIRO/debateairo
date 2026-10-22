import type { Pool, QueryConfig } from "pg";
import { TypedDomainError } from "@debateai/kernel";

/**
 * Side-by-side spec §13 (settings changes without an upload), plan D1 and D8 — THE ONE RUNTIME READER of the
 * activation pointer (`register.settings_activation`, through migration 0124's `register.read_active_settings_version()`).
 *
 * Plain words: the owners can switch which sealed settings version new debates use without an upload. The switch is
 * one row in the database (the pointer). This module is the only code in a running process that reads it: the API's
 * admission path asks it which version a new ask is admitted on. It asks the database at most once a second, on the
 * API's main pool (the API's login holds `debateai_billing_runtime`, which alone of the runtime roles may call the
 * reader, D8; the runner never names it). An empty pointer means "this release's own site version" (D1), which is
 * today's behaviour.
 *
 * The SQL text lives here exactly once, as ACTIVE_SETTINGS_VERSION_SQL (S13 adds the on-client read beside the cached
 * one with the same constant; S16 pins "exactly once").
 */

/**
 * The reader's bounds, in milliseconds: a value at most `maxAgeMs` old is served without a read; a caller waits at most
 * `refreshDeadlineMs` for a read; the driver ends a query after `queryTimeoutMs` (pg's per-query `query_timeout`: the
 * pool then destroys that connection), and a read abandoned at its deadline holds the query gate no longer than that.
 */
export const ACTIVE_SETTINGS_VERSION_CACHE = Object.freeze({
  maxAgeMs: 1000, refreshDeadlineMs: 1000, queryTimeoutMs: 5000
});

/** The pointer's one read (migration 0124; granted to debateai_billing_runtime and the release operator only). */
const ACTIVE_SETTINGS_VERSION_SQL = "SELECT register.read_active_settings_version() AS version";
/**
 * The read as sent: the SQL above with pg's per-query client timeout (pg 8.22 honours `query_timeout` per query; the
 * pool destroys the connection it ended), so a dead peer never holds a connection for ever. A FRESH, extensible object
 * per call: pg writes the callback onto the config it is handed (normalizeQueryConfig), so a frozen or shared object
 * would refuse every read. @types/pg does not list the member, hence the widened type.
 */
function activeSettingsVersionQuery(): QueryConfig & { query_timeout: number } {
  return { text: ACTIVE_SETTINGS_VERSION_SQL, query_timeout: ACTIVE_SETTINGS_VERSION_CACHE.queryTimeoutMs };
}
/** Unanswered queries this reader may have open at once: an abandoned read and one replacement after its timeout. */
const MAX_OPEN_QUERIES = 2;

/** A failed later read is logged at most once in this many milliseconds (one content-free line). */
const READ_FAILED_LOG_INTERVAL_MS = 60000;

/** The reader refuses an answer that is not a positive whole number or NULL (a damaged pointer is never guessed). */
const ACTIVE_SETTINGS_VERSION_INVALID = "ACTIVE_SETTINGS_VERSION_INVALID";
/** A read that took longer than refreshDeadlineMs (its late answer, if any, is dropped). */
const ACTIVE_SETTINGS_READ_DEADLINE = "ACTIVE_SETTINGS_READ_DEADLINE";

export type ActiveSettingsVersionReader = Readonly<{
  /** The pointer's version, or the site version when the pointer is empty (D1). */
  current(): Promise<number>;
  /** The last version `current()` answered from a good read; null before the first good read. */
  lastObserved(): number | null;
}>;

/**
 * The pointer as a version: NULL (no activation yet) is the site version; node-postgres hands a bigint back as text,
 * so a whole-number text is read as its number. Anything else refuses ACTIVE_SETTINGS_VERSION_INVALID.
 */
function versionOfRow(value: unknown, siteVersion: number): number {
  if (value === null || value === undefined) return siteVersion;
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && /^[1-9][0-9]{0,15}$/u.test(value) ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new TypedDomainError(ACTIVE_SETTINGS_VERSION_INVALID, ACTIVE_SETTINGS_VERSION_INVALID);
  }
  return parsed;
}

/** A failure's code for the log line: a typed code, a code-shaped message, or UNTYPED (never a message's prose). */
function failureCodeOf(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  return error instanceof Error && /^[A-Z][A-Z0-9_]{2,}$/u.test(error.message) ? error.message : "UNTYPED";
}

/**
 * Side-by-side spec §13 — THE POINTER, CACHED FOR ONE SECOND.
 *  - A value read less than `maxAgeMs` ago is answered without a read; concurrent callers share one read.
 *  - A read that fails, or takes longer than `refreshDeadlineMs`, keeps the last good value and is retried no sooner
 *    than `maxAgeMs` later (one query a second at most, and none while a read past its deadline is still unanswered),
 *    with one ACTIVE_SETTINGS_READ_FAILED line at most once a minute (codes only). The FIRST read has no good value to
 *    keep, so its failure rejects: the boot refuses.
 *  - The clock is monotonic (`performance.now()` by default); one that goes backwards makes the value stale (it is
 *    read again), never fresh.
 */
export function createActiveSettingsVersionReader(input: Readonly<{
  pool: Pick<Pool, "query">;
  siteVersion: number;
  clock?: () => number;
  log?: (line: Readonly<Record<string, unknown>>) => void;
}>): ActiveSettingsVersionReader {
  const { pool, siteVersion } = input;
  if (!Number.isSafeInteger(siteVersion) || siteVersion < 1) {
    throw new TypedDomainError(ACTIVE_SETTINGS_VERSION_INVALID, ACTIVE_SETTINGS_VERSION_INVALID);
  }
  const clock = input.clock ?? (() => performance.now());
  const log = input.log ?? (() => undefined);
  let good: number | null = null;
  /** When the last read (good or failed) settled; null before any. */
  let settledAt: number | null = null;
  let lastLoggedAt: number | null = null;
  let reading: Promise<number> | null = null;
  /**
   * The queries a read past its deadline left behind, each with when it was sent, until the database answers it (or
   * the driver ends it at `queryTimeoutMs`). While one is open, for at most `queryTimeoutMs` after it was sent (or until
   * the clock goes backwards), no new query is sent; after that ONE replacement may go out; with two open, none. Each
   * refresh refused this way counts as failed (ACTIVE_SETTINGS_READ_DEADLINE). So a hanging database holds at most two
   * of the main pool's connections for this reader, never one more a second, and a peer that never answers (no
   * keep-alive) cannot close the gate for ever.
   */
  const openQueries = new Map<Promise<unknown>, number>();

  const fresh = (now: number): boolean =>
    settledAt !== null && now >= settledAt && now - settledAt < ACTIVE_SETTINGS_VERSION_CACHE.maxAgeMs;

  async function readOnce(): Promise<number> {
    const sentAt = clock();
    const blocked = openQueries.size >= MAX_OPEN_QUERIES || [...openQueries.values()].some((openAt) =>
      sentAt >= openAt && sentAt - openAt < ACTIVE_SETTINGS_VERSION_CACHE.queryTimeoutMs);
    if (blocked) throw new TypedDomainError(ACTIVE_SETTINGS_READ_DEADLINE, ACTIVE_SETTINGS_READ_DEADLINE);
    let query: Promise<{ rows: readonly { version: unknown }[] }>;
    try {
      query = pool.query<{ version: unknown }>(activeSettingsVersionQuery());
    } catch (error) {
      query = Promise.reject(error);
    }
    openQueries.set(query, sentAt);
    const settle = (): void => { openQueries.delete(query); };
    query.then(settle, settle);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new TypedDomainError(ACTIVE_SETTINGS_READ_DEADLINE, ACTIVE_SETTINGS_READ_DEADLINE));
      }, ACTIVE_SETTINGS_VERSION_CACHE.refreshDeadlineMs);
      timer.unref?.();
    });
    try {
      const result = await Promise.race([query, deadline]);
      return versionOfRow(result.rows[0]?.version ?? null, siteVersion);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  function refresh(): Promise<number> {
    if (reading !== null) return reading;
    const attempt = readOnce().then(
      (version) => {
        good = version;
        settledAt = clock();
        return version;
      },
      (error: unknown) => {
        const now = clock();
        settledAt = now;
        if (good === null) throw error;
        if (lastLoggedAt === null || now < lastLoggedAt || now - lastLoggedAt >= READ_FAILED_LOG_INTERVAL_MS) {
          lastLoggedAt = now;
          log(Object.freeze({ kind: "DEBATEAI_ACTIVE_SETTINGS", code: "ACTIVE_SETTINGS_READ_FAILED", cause: failureCodeOf(error) }));
        }
        return good;
      }
    ).finally(() => { reading = null; });
    reading = attempt;
    return attempt;
  }

  return Object.freeze({
    current(): Promise<number> {
      if (good !== null && fresh(clock())) return Promise.resolve(good);
      return refresh();
    },
    lastObserved(): number | null {
      return good;
    }
  });
}
