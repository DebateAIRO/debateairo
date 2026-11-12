import { expect, it } from "vitest";
import { createPool, migrate } from "../../packages/db/src/index.js";
import { startTestDatabase } from "../support/testDatabase.js";

/**
 * NV-38 (security audit run 3): a migrator that waits for the schema-migrations session lock must hold no snapshot,
 * because the lock holder's outside-transaction step builds an index concurrently on its own session, and that build
 * waits for every transaction with an older snapshot. A wait inside one blocking `pg_advisory_lock` statement keeps the
 * statement's snapshot, so the build and the waiter wait on each other and one of them gets 40P01; migrate() therefore
 * tries the lock every 50 ms instead. Independent of any real index step: holder X stands in for the migrator that
 * holds the lock and builds. CI skips this directory; run it alone.
 */
const LOCK = "hashtextextended('debateai:schema-migrations', 0)";
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

it("a migrator waiting for the session lock holds no snapshot that a concurrent index build waits for", async () => {
  const db = await startTestDatabase();
  await migrate(db.pool); // the later run only replays
  const x = await db.pool.connect();
  const second = createPool(db.connectionString, { max: 1, name: "nv38-waiter" });
  let unlocked = false;
  let settled: Promise<Readonly<{ ok: true; report: unknown }> | Readonly<{ ok: false; error: unknown }>> = Promise.resolve({ ok: false, error: "NOT_STARTED" });
  try {
    await x.query("CREATE TABLE public.nv38_lock_probe(a integer)");
    await x.query(`SELECT pg_advisory_lock(${LOCK})`); // free, so it does not wait
    settled = (async () => { try { return { ok: true as const, report: await migrate(second) }; } catch (error) { return { ok: false as const, error }; } })();
    // The waiter by its application name: X's own lock statement and the first run's unlock carry the lock text too.
    // Its connection sends nothing before the lock, so a match means it is waiting for it (in a statement or between tries).
    const waiting = async (): Promise<boolean> => (await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='nv38-waiter'
        AND query LIKE '%advisory_lock(hashtextextended(''debateai:schema-migrations''%'`)).rows[0]!.n === 1;
    const seenBy = Date.now() + 10_000;
    while (!(await waiting())) {
      if (Date.now() > seenBy) throw new Error("NV38_WAITER_NOT_SEEN");
      await sleep(50);
    }
    await sleep(1200);
    const built = await x.query("CREATE INDEX CONCURRENTLY nv38_lock_probe_a ON public.nv38_lock_probe (a)")
      .then(() => "built", (error: { code?: string }) => error.code ?? "FAILED");
    expect(built).toBe("built");
    // The migrator is still waiting for the lock X holds.
    expect(await Promise.race([settled.then(() => "settled"), sleep(300).then(() => "waiting")])).toBe("waiting");
    await x.query("DROP TABLE public.nv38_lock_probe");
    await x.query(`SELECT pg_advisory_unlock(${LOCK})`);
    unlocked = true;
    expect(await settled).toMatchObject({ ok: true, report: { appliedSteps: [], extraSteps: [] } });
  } finally {
    // In this order, so a red run reports its 40P01 instead of hanging: destroying X's connection ends its session and
    // its lock, so a waiting migrator can finish; `settled` never rejects; then the pools and the database.
    x.release(unlocked ? undefined : true);
    await settled;
    await second.end();
    await db.stop();
  }
}, 120_000);
