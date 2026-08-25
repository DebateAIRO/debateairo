import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import type { PoolClient, QueryResult } from "pg";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

async function waitForAuditLockWaiters(pids: readonly number[]): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const state = await database.pool.query<{
      pid: number; state: string; wait_event_type: string | null; wait_event: string | null;
    }>(`
      SELECT pid,state,wait_event_type,wait_event
      FROM pg_catalog.pg_stat_activity
      WHERE pid=ANY($1::integer[])
      ORDER BY pid
    `, [pids]);
    if (state.rows.length === pids.length && state.rows.every((row) =>
      row.state === "active" && row.wait_event_type === "Lock" && row.wait_event === "advisory"
    )) return;
    await delay(20);
  }
  throw new Error("T7_AUDIT_LOCK_WAITERS_NOT_OBSERVED");
}

async function rollback(client: PoolClient, open: boolean): Promise<void> {
  if (open) await client.query("ROLLBACK").catch(() => undefined);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("T7 audit-chain capacity on real PostgreSQL", () => {
  it("serializes canonical runtime appends behind one global writer without forks or deadlocks", async () => {
    const [holder, first, second] = await Promise.all([
      database.pool.connect(), database.pool.connect(), database.pool.connect()
    ]);
    let holderOpen = false;
    let firstOpen = false;
    let secondOpen = false;
    let firstAppend: Promise<QueryResult> | undefined;
    let secondAppend: Promise<QueryResult> | undefined;
    try {
      const deadlocksBefore = Number((await database.pool.query<{ deadlocks: string }>(`
        SELECT deadlocks::text AS deadlocks
        FROM pg_catalog.pg_stat_database WHERE datname=current_database()
      `)).rows[0]!.deadlocks);

      await holder.query("BEGIN"); holderOpen = true;
      await holder.query("SELECT pg_advisory_xact_lock(hashtextextended('identity:audit-chain',0))");

      await first.query("BEGIN"); firstOpen = true;
      await second.query("BEGIN"); secondOpen = true;
      await first.query("SET LOCAL ROLE debateai_runtime");
      await second.query("SET LOCAL ROLE debateai_runtime");
      await first.query("SELECT identity.begin_runtime_audit_attempt()");
      await second.query("SELECT identity.begin_runtime_audit_attempt()");
      const pids = [
        (await first.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid,
        (await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid
      ];

      const source = JSON.stringify({
        ipArgon2id: `argon2id-audit:v1:${"1".repeat(64)}`,
        userAgentArgon2id: `argon2id-audit:v1:${"2".repeat(64)}`
      });
      firstAppend = first.query(
        "SELECT identity.audit_rate_limit_refused($1::jsonb,$2)",
        [source,"aggregate:route-window;route:register;window:2026-08-25T12:00:00.000Z;count:1;ip_count:1;address_count:0;distinct_source_count:1;distinct_source_count_saturated:false"]
      );
      secondAppend = second.query(
        "SELECT identity.audit_rate_limit_refused($1::jsonb,$2)",
        [source,"aggregate:route-window;route:verify;window:2026-08-25T12:00:01.000Z;count:1;ip_count:0;address_count:1;distinct_source_count:1;distinct_source_count_saturated:false"]
      );
      let firstSettled = false;
      let secondSettled = false;
      void firstAppend.then(() => { firstSettled = true; }, () => { firstSettled = true; });
      void secondAppend.then(() => { secondSettled = true; }, () => { secondSettled = true; });

      await waitForAuditLockWaiters(pids);
      expect(firstSettled).toBe(false);
      expect(secondSettled).toBe(false);

      await holder.query("COMMIT"); holderOpen = false;
      const winner = await Promise.race([
        firstAppend.then(() => "first" as const),
        secondAppend.then(() => "second" as const)
      ]);
      if (winner === "first") {
        await first.query("COMMIT"); firstOpen = false;
        await secondAppend;
        await second.query("COMMIT"); secondOpen = false;
      } else {
        await second.query("COMMIT"); secondOpen = false;
        await firstAppend;
        await first.query("COMMIT"); firstOpen = false;
      }

      const chain = await database.pool.query<{
        total: string; roots: string; heads: string; unique_hashes: string;
      }>(`
        SELECT count(*)::text AS total,
          count(*) FILTER (WHERE parent.prev_hash IS NULL)::text AS roots,
          count(*) FILTER (WHERE child.audit_id IS NULL)::text AS heads,
          count(DISTINCT encode(parent.this_hash,'hex'))::text AS unique_hashes
        FROM identity.audit_event AS parent
        LEFT JOIN identity.audit_event AS child ON child.prev_hash=parent.this_hash
        WHERE parent.event_type='identity.auth.rate_limit_refused'
      `);
      expect(chain.rows).toEqual([{ total: "2", roots: "1", heads: "1", unique_hashes: "2" }]);

      const deadlocksAfter = Number((await database.pool.query<{ deadlocks: string }>(`
        SELECT deadlocks::text AS deadlocks
        FROM pg_catalog.pg_stat_database WHERE datname=current_database()
      `)).rows[0]!.deadlocks);
      expect(deadlocksAfter - deadlocksBefore).toBe(0);
    } finally {
      await rollback(holder, holderOpen);
      const firstRollback = firstOpen ? first.query("ROLLBACK").catch(() => undefined) : undefined;
      const secondRollback = secondOpen ? second.query("ROLLBACK").catch(() => undefined) : undefined;
      const pending = [firstAppend,secondAppend,firstRollback,secondRollback]
        .filter((promise) => promise !== undefined);
      await Promise.allSettled(pending);
      holder.release(); first.release(); second.release();
    }
  }, 120_000);
});
