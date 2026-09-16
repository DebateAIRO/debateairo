import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { createObservationDatabasePort } from "../../apps/observation-agent/src/core/database.js";
import { observationRepoRoot } from "../../apps/observation-agent/src/core/paths.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const migrationPath = resolve("migrations/0060_observation_throughput_views.sql");
let database: TestDatabase | undefined;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("OBS-06 safe throughput views", () => {
  it("creates the exact security-barrier provider and run projections", async () => {
    expect(existsSync(migrationPath)).toBe(true);
    await expect(migrate(database!.pool)).resolves.toBeUndefined();
    await expect(database!.pool.query(`
      SELECT count(*)::text AS applied
      FROM public.debateai_schema_migration
      WHERE name='0060_observation_throughput_views.sql'
    `)).resolves.toMatchObject({ rows: [{ applied: "1" }] });
    const columns = await database!.pool.query<{ table_name: string; column_name: string }>(`
      SELECT table_name,column_name
      FROM information_schema.columns
      WHERE table_schema='obs'
        AND table_name IN ('provider_call_v','run_throughput_v')
      ORDER BY table_name,ordinal_position
    `);
    expect(columns.rows).toEqual([
      { table_name: "provider_call_v", column_name: "provider_ref" },
      { table_name: "provider_call_v", column_name: "model_id" },
      { table_name: "provider_call_v", column_name: "parse_status" },
      { table_name: "provider_call_v", column_name: "at_seq" },
      { table_name: "run_throughput_v", column_name: "run_id" },
      { table_name: "run_throughput_v", column_name: "run_created_at_seq" },
      { table_name: "run_throughput_v", column_name: "work_item_id" },
      { table_name: "run_throughput_v", column_name: "state" },
      { table_name: "run_throughput_v", column_name: "work_item_created_at_seq" }
    ]);
    const options = await database!.pool.query<{ relname: string; reloptions: string[] | null }>(`
      SELECT relation.relname,relation.reloptions
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='obs'
        AND relation.relname IN ('provider_call_v','run_throughput_v')
      ORDER BY relation.relname
    `);
    expect(options.rows).toEqual([
      { relname: "provider_call_v", reloptions: ["security_barrier=true"] },
      { relname: "run_throughput_v", reloptions: ["security_barrier=true"] }
    ]);
  });

  it("derives terminal failed runs only from safe work-item states", async () => {
    const { RUN_FAILURE_SELECT } = await import(
      "../../apps/observation-agent/src/modules/throughput/queries.js"
    );
    expect(RUN_FAILURE_SELECT).toContain("bool_or(state='FAILED')");
    expect(RUN_FAILURE_SELECT).toContain("bool_and(state IN ('DONE','FAILED'))");
    expect(RUN_FAILURE_SELECT).not.toMatch(/value_json|terminal_reason|question_line/iu);
  });

  it("grants only the two safe relations to the agent", async () => {
    const grants = await database!.pool.query<{
      table_schema: string; table_name: string; privilege_type: string;
    }>(`
      SELECT table_schema,table_name,privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee='debateai_observation_agent'
        AND table_schema IN ('core','ledger','obs')
        AND table_name IN ('run','work_item','raw_artifact','provider_call_v','run_throughput_v')
      ORDER BY table_schema,table_name,privilege_type
    `);
    expect(grants.rows).toEqual([
      { table_schema: "obs", table_name: "provider_call_v", privilege_type: "SELECT" },
      { table_schema: "obs", table_name: "run_throughput_v", privilege_type: "SELECT" }
    ]);
  });

  it("rolls completed throughput-window ring samples into hourly aggregates", async () => {
    const { createThroughputModule } = await import(
      "../../apps/observation-agent/src/modules/throughput/module.js"
    );
    await database!.pool.query(`
      INSERT INTO observation.sample_ring(metric_key,bucket,observed_at,value) VALUES
        ('throughput.window.runs_started',600,'2026-09-04T09:10:00Z',2),
        ('throughput.window.runs_started',601,'2026-09-04T09:40:00Z',4)
    `);
    await createThroughputModule().probe({
      now: new Date("2026-09-04T10:00:30.000Z"), timeoutMs: 2_000,
      database: createObservationDatabasePort(database!.pool), stateDir: "/tmp/obs-06-rollup",
      repoRoot: observationRepoRoot(),
      targets: Object.freeze([]), targetFragment: null, configuration: Object.freeze({}),
      thresholds: Object.freeze({ window_minutes: 5, run_failure_window_minutes: 60 })
    });

    const rollup = await database!.pool.query<{
      minimum: string; average: string; maximum: string; sample_count: number;
    }>(`
      SELECT minimum::text,average::text,maximum::text,sample_count
      FROM observation.sample_hourly
      WHERE metric_key='throughput.window.runs_started'
        AND hour='2026-09-04T09:00:00Z'
    `);
    expect(rollup.rows).toEqual([
      { minimum: "2", average: "3.0000000000000000", maximum: "4", sample_count: 2 }
    ]);
  });
});
