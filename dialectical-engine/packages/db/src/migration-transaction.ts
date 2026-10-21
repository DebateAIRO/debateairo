import type { PoolClient } from "pg";
import { TypedDomainError } from "@debateai/kernel";

/**
 * One transaction per migration step (side-by-side spec 2026-10-21 §5, "Each step runs on its own"; plan A, task A6).
 * migrate() used to apply every pending step in ONE transaction, so the first step's locks were held until the last
 * step ended (R19's 0121 took about 1.5 minutes: every page read, ask and claim on core.run would have queued behind
 * it). Now the prologue and each forward step run in their own transaction, and a step that has to wait for a lock
 * waits at most 2 s: readers that queue behind its waiting ALTER wait at most that long too. A lock wait that ran out
 * (SQLSTATE lock_not_available) rolls the try back, pauses 2 s so the queue drains, and tries again, five tries in
 * all; then the step refuses MIGRATION_LOCK_TIMEOUT naming it, and nothing of that step remains. Any other failure
 * is refused at once. A step holds the locks it takes until its COMMIT: the 2 s bounds each lock wait, not the step.
 *
 * Imported only by migrate() (packages/db/src/index.ts), outside loadMigrationPlan's self-contained closure, so it
 * uses the house TypedDomainError. Its bytes are sealed by tools/orphan-audit (NATIVE_MIGRATE_TRANSACTION_SHA256)
 * with their ordered controls; the lock wait in SQL ('2s') is MIGRATION_LOCK_TIMEOUT_MS.
 */
export const MIGRATION_LOCK_TIMEOUT_MS = 2_000 as const;
export const MIGRATION_LOCK_TRIES = 5 as const;
export const MIGRATION_LOCK_PAUSE_MS = 2_000 as const;

/** Tests shorten or record the pause; migrate() uses the reviewed timing above. */
export type MigrationLockTiming = Readonly<{ tries?: number; pauseMs?: number; sleep?: (ms: number) => Promise<void> }>;
const pause = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * `body` inside one migration transaction on `client`: BEGIN, the read-committed check, the step's 2 s lock wait,
 * the body, COMMIT; any failure rolls back. A lock wait that ran out is tried again (withMigrationLockRetry), so the
 * body must be safe to run again from the start (it re-reads everything it decides on).
 */
export async function withMigrationStepTransaction<T>(
  client: PoolClient, label: string, body: () => Promise<T>, timing: MigrationLockTiming = {}
): Promise<T> {
  return withMigrationLockRetry(label, async () => {
    await client.query("BEGIN");
    try {
      const isolation = await client.query<{ transaction_isolation: string }>("SHOW transaction_isolation");
      if (isolation.rows[0]?.transaction_isolation !== "read committed") {
        throw new TypedDomainError("MIGRATION_ISOLATION_REQUIRES_READ_COMMITTED", "MIGRATION_ISOLATION_REQUIRES_READ_COMMITTED");
      }
      await client.query("SET LOCAL lock_timeout = '2s'");
      const result = await body();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }, timing);
}

/**
 * The retry loop alone, for a step that runs outside any transaction (a concurrent index build): `attempt` again
 * after each lock wait that ran out, with one content-free journal line per retry ("try <n>/<tries>" names the try
 * that ran out), then MIGRATION_LOCK_TIMEOUT naming the step after the last try.
 */
export async function withMigrationLockRetry<T>(label: string, attempt: () => Promise<T>, timing: MigrationLockTiming = {}): Promise<T> {
  const tries = timing.tries ?? MIGRATION_LOCK_TRIES;
  const pauseMs = timing.pauseMs ?? MIGRATION_LOCK_PAUSE_MS;
  const sleep = timing.sleep ?? pause;
  for (let tryNumber = 1; ; tryNumber += 1) {
    try {
      return await attempt();
    } catch (error) {
      if ((error as { code?: unknown } | null | undefined)?.code !== "55P03") throw error;
      if (tryNumber >= tries) throw new TypedDomainError("MIGRATION_LOCK_TIMEOUT", `MIGRATION_LOCK_TIMEOUT ${label}`);
      console.warn(`[MIGRATION_LOCK_RETRY] ${label} try ${tryNumber}/${tries}`);
      await sleep(pauseMs);
    }
  }
}
