import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const migrationPath = resolve("migrations/0057_observation_foundation.sql");
let database: TestDatabase | undefined;

beforeAll(async () => {
  if (!existsSync(migrationPath)) return;
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

function pool(): TestDatabase["pool"] {
  expect(database, "OBS-01 migration must exist before database assertions run").toBeDefined();
  return database!.pool;
}

describe("OBS-01 observation schema foundation", () => {
  it("ships replay-safe migration 0057 and creates exactly seven observation tables", async () => {
    await expect(readFile(migrationPath, "utf8")).resolves.toContain("CREATE SCHEMA IF NOT EXISTS observation");
    const result = await pool().query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='observation' AND table_type='BASE TABLE'
      ORDER BY table_name
    `);
    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      "delivery", "heartbeat", "job_completion", "sample_hourly", "sample_ring",
      "signal", "threshold_policy"
    ]);
  });

  it("creates a constrained LOGIN role with no mutating product privilege", async () => {
    const role = (await pool().query<{
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
    }>(`
      SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
             rolreplication,rolbypassrls
      FROM pg_catalog.pg_roles WHERE rolname='debateai_observation_agent'
    `)).rows[0];
    expect(role).toEqual({
      rolcanlogin: true,
      rolinherit: false,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false
    });

    const escaped = await pool().query(`
      SELECT table_schema,table_name,privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee='debateai_observation_agent'
        AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
        AND table_schema <> 'observation'
    `);
    expect(escaped.rows).toEqual([]);
  });

  it("keeps signal vocabulary closed and immutable rows trigger-guarded", async () => {
    await expect(pool().query(`
      INSERT INTO observation.signal(
        signal_id,state,class,component,severity,impact_code,first_failed_probe_at,
        detected_at,evidence,suspected_defect,defect_kind,run_ref,work_item_ref,
        threshold_version,clears_signal_id,recorded_at
      ) VALUES (
        '00000000-0000-4000-8000-000000000001','OPEN','OPEN_ENUM_MUTANT',
        'hatchet','FATAL','IMPACT_HATCHET_DOWN',now(),now(),'{}',false,null,null,null,1,null,now()
      )
    `)).rejects.toMatchObject({ code: "23514" });

    const guarded = await pool().query<{ table_name: string; trigger_count: string }>(`
      SELECT relation.relname AS table_name,count(DISTINCT trigger.tgname)::text AS trigger_count
      FROM pg_catalog.pg_trigger AS trigger
      JOIN pg_catalog.pg_class AS relation ON relation.oid=trigger.tgrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='observation' AND NOT trigger.tgisinternal
        AND relation.relname=ANY(ARRAY[
          'signal','delivery','threshold_policy','sample_hourly','job_completion'
        ])
      GROUP BY relation.relname ORDER BY relation.relname
    `);
    expect(guarded.rows).toEqual([
      { table_name: "delivery", trigger_count: "2" },
      { table_name: "job_completion", trigger_count: "2" },
      { table_name: "sample_hourly", trigger_count: "2" },
      { table_name: "signal", trigger_count: "2" },
      { table_name: "threshold_policy", trigger_count: "2" }
    ]);
  });
});
