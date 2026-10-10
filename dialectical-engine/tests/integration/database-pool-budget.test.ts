import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, isDatabasePoolBusy } from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Connection budget (2026-10-10) against a real PostgreSQL: the pool's name is
 * what pg_stat_activity shows, a full pool turns the next caller away after its
 * wait limit with a busy failure, and the same pool serves again as soon as a
 * connection is free. docs/operations/2026-10-10-database-connection-budget.md.
 */
let database: TestDatabase;

beforeAll(async () => { database = await startTestDatabase(); });
afterAll(async () => { await database.stop(); });

describe("connection budget on a real database", () => {
  it("shows the pool's name in pg_stat_activity", async () => {
    const pool = createPool(database.connectionString, { max: 1, connectionTimeoutMillis: 5_000, name: "api:runtime" });
    try {
      const own = await pool.query<{ setting: string; listed: string }>(
        `SELECT current_setting('application_name') AS setting,
                (SELECT application_name FROM pg_stat_activity WHERE pid = pg_backend_pid()) AS listed`
      );
      expect(own.rows[0]).toEqual({ setting: "api:runtime", listed: "api:runtime" });
    } finally {
      await pool.end();
    }
  });

  it("turns the next caller away when the pool is full, then serves again", async () => {
    const pool = createPool(database.connectionString, { max: 1, connectionTimeoutMillis: 300, name: "test:full" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const held = await pool.connect();
      const started = performance.now();
      const turnedAway = await pool.query("SELECT 1").then(() => undefined, (error: unknown) => error);
      expect(performance.now() - started).toBeLessThan(5_000);
      expect(isDatabasePoolBusy(turnedAway)).toBe(true);
      held.release();
      const served = await pool.query<{ one: number }>("SELECT 1 AS one");
      expect(served.rows[0]?.one).toBe(1);
    } finally {
      vi.restoreAllMocks();
      await pool.end();
    }
  });
});
