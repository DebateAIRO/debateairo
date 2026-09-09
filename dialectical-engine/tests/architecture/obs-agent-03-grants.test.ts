import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const migrationPath = resolve("migrations/0058_observation_safe_views.sql");
let database: TestDatabase | undefined;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

function pool(): TestDatabase["pool"] {
  expect(database).toBeDefined();
  return database!.pool;
}

describe("OBS-03 grant boundary", () => {
  it("grants the agent only SELECT on the two safe product projections", async () => {
    expect(existsSync(migrationPath)).toBe(true);
    const grants = await pool().query<{
      table_schema: string;
      table_name: string;
      privilege_type: string;
    }>(`
      SELECT table_schema,table_name,privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee='debateai_observation_agent'
        AND table_schema IN ('core','ledger','obs')
        AND table_name IN ('work_item','run_progress_event','work_item_liveness_v','run_progress_v')
      ORDER BY table_schema,table_name,privilege_type
    `);
    expect(grants.rows).toEqual([
      { table_schema: "obs", table_name: "run_progress_v", privilege_type: "SELECT" },
      { table_schema: "obs", table_name: "work_item_liveness_v", privilege_type: "SELECT" }
    ]);
  });

  it("keeps every product relation mutation and obs.occurrence write unavailable", async () => {
    const agent = await pool().connect();
    try {
      await agent.query("BEGIN");
      await agent.query("SET LOCAL ROLE debateai_observation_agent");
      for (const statement of [
        "SELECT * FROM core.work_item LIMIT 1",
        "SELECT * FROM core.run_progress_event LIMIT 1",
        "INSERT INTO obs.occurrence DEFAULT VALUES",
        "DELETE FROM obs.work_item_liveness_v WHERE false"
      ]) {
        await agent.query("SAVEPOINT obs_03_boundary");
        try {
          await expect(agent.query(statement)).rejects.toMatchObject({ code: "42501" });
        } finally {
          await agent.query("ROLLBACK TO SAVEPOINT obs_03_boundary");
        }
      }
    } finally {
      await agent.query("ROLLBACK");
      agent.release();
    }
  });

  it("never references an ObservationAgent write to obs.occurrence or the product writer role", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).not.toMatch(/(?:INSERT|UPDATE|DELETE|TRUNCATE)[\s\S]{0,80}obs\.occurrence/iu);
    expect(migration).not.toMatch(/debateai_obs_writer/iu);
  });
});
