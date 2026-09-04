import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { readPostgresCapacity } from "../../apps/observation-agent/src/modules/postgres-capacity/query.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const migrationPath = resolve("migrations/0059_observation_pg_monitor.sql");
let database: TestDatabase | undefined;

beforeAll(async () => {
  if (!existsSync(migrationPath)) return;
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE DATABASE debateai");
  await database.pool.query("CREATE DATABASE hatchet");
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

function fixture(): TestDatabase {
  expect(database, "migration 0059 must exist before database assertions run").toBeDefined();
  return database!;
}

describe("OBS-05 pg_monitor migration and numeric query", () => {
  it("replays migration 0059 exactly once and grants only pg_monitor membership", async () => {
    await expect(migrate(fixture().pool)).resolves.toBeUndefined();
    await expect(fixture().pool.query(`
      SELECT pg_has_role('debateai_observation_agent','pg_monitor','member') AS member
    `)).resolves.toMatchObject({ rows: [{ member: true }] });
    await expect(fixture().pool.query(`
      SELECT count(*)::text AS applied FROM public.debateai_schema_migration
      WHERE name='0059_observation_pg_monitor.sql'
    `)).resolves.toMatchObject({ rows: [{ applied: "1" }] });
    await expect(fixture().pool.query(`
      SELECT count(*)::text AS grants FROM information_schema.role_table_grants
      WHERE grantee='debateai_observation_agent'
        AND table_schema NOT IN ('observation','obs')
    `)).resolves.toMatchObject({ rows: [{ grants: "0" }] });
  });

  it("returns only finite numeric statistics and both fixed database sizes", async () => {
    const observedAt = new Date("2026-09-03T08:00:00.000Z");
    const result = await readPostgresCapacity(fixture().connectionString, observedAt, {
      lockWaitSeconds: 60,
      idleInTransactionSeconds: 120
    });
    expect(result.observedAt).toEqual(observedAt);
    for (const [key, value] of Object.entries(result)) {
      if (key === "observedAt") continue;
      expect(value, key).toEqual(expect.any(Number));
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(result.maxConnections).toBe(100);
    expect(result.usedConnections).toBeGreaterThan(0);
    expect(result.debateaiDatabaseBytes).toBeGreaterThan(0);
    expect(result.hatchetDatabaseBytes).toBeGreaterThan(0);
  });

  it("ships the gated membership grant without enabling statement aggregation", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("GRANT pg_monitor TO debateai_observation_agent");
    expect(sql).not.toMatch(/pg_stat_statements|shared_preload_libraries|log_min_duration_statement/iu);
  });
});
