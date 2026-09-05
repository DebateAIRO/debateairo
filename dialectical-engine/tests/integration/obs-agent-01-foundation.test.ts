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

  it("lets the listener read only the defect view", async () => {
    const listener = await pool().connect();
    try {
      await listener.query("BEGIN");
      await listener.query("SET LOCAL ROLE debateai_obs_listener");
      await expect(listener.query("SELECT * FROM observation.defect_signal_v LIMIT 1"))
        .resolves.toMatchObject({ rows: [] });

      for (const statement of [
        "CREATE TABLE observation.listener_escape(id integer)",
        "SELECT * FROM observation.signal LIMIT 1",
        "SELECT * FROM observation.open_signal_v LIMIT 1"
      ]) {
        await listener.query("SAVEPOINT listener_boundary");
        try {
          await expect(listener.query(statement)).rejects.toMatchObject({ code: "42501" });
        } finally {
          await listener.query("ROLLBACK TO SAVEPOINT listener_boundary");
        }
      }
    } finally {
      await listener.query("ROLLBACK");
      listener.release();
    }
  });

  it("exposes only explicit suspected defects and their matching clears to the listener", async () => {
    await pool().query(`
      INSERT INTO observation.signal(
        signal_id,state,class,component,severity,impact_code,first_failed_probe_at,
        detected_at,evidence,suspected_defect,defect_kind,run_ref,work_item_ref,
        threshold_version,clears_signal_id,recorded_at
      ) VALUES
        ('70000000-0000-4000-8000-000000000001','OPEN','INFRA_DOWN','postgres','FATAL',
         'IMPACT_PG_DOWN',now(),now(),'{}',false,null,null,null,1,null,now()),
        ('70000000-0000-4000-8000-000000000002','OPEN','SUSPICIOUS_SUCCESS','runner','SEVERE',
         'IMPACT_SUSPICIOUS_SUCCESS',now(),now(),'{}',true,'SUSPICIOUS_SUCCESS',null,null,1,null,now()),
        ('70000000-0000-4000-8000-000000000003','CLEARED','INFRA_DOWN','postgres','INFO',
         'IMPACT_CLEARED',now(),now(),'{}',false,null,null,null,1,
         '70000000-0000-4000-8000-000000000001',now()),
        ('70000000-0000-4000-8000-000000000004','CLEARED','SUSPICIOUS_SUCCESS','runner','INFO',
         'IMPACT_CLEARED',now(),now(),'{}',false,null,null,null,1,
         '70000000-0000-4000-8000-000000000002',now())
    `);
    const listener = await pool().connect();
    try {
      await listener.query("BEGIN");
      await listener.query("SET LOCAL ROLE debateai_obs_listener");
      const visible = await listener.query<{ signal_id: string; defect_kind: string | null }>(`
        SELECT signal_id::text,defect_kind
        FROM observation.defect_signal_v
        WHERE signal_id::text LIKE '70000000-%'
        ORDER BY signal_id
      `);
      expect(visible.rows).toEqual([
        { signal_id: "70000000-0000-4000-8000-000000000002", defect_kind: "SUSPICIOUS_SUCCESS" },
        { signal_id: "70000000-0000-4000-8000-000000000004", defect_kind: null }
      ]);
    } finally {
      await listener.query("ROLLBACK");
      listener.release();
    }
  });

  it("replays migration and stores delivery failures outside the defect view", async () => {
    await migrate(pool());
    await expect(pool().query(`
      INSERT INTO observation.signal(
        signal_id,state,class,component,severity,impact_code,first_failed_probe_at,
        detected_at,evidence,suspected_defect,defect_kind,run_ref,work_item_ref,
        threshold_version,clears_signal_id,recorded_at
      ) VALUES (
        '00000000-0000-4000-8000-000000000059','OPEN','AGENT_SELF',
        'observation_agent','DEGRADED','IMPACT_AGENT_DELIVERY',null,now(),
        '{"reason":"DELIVERY_FAILURE","channel":"sendmail"}',false,null,null,null,1,null,now()
      )
    `)).resolves.toMatchObject({ rowCount: 1 });

    const stored = await pool().query<{
      class: string;
      impact_code: string;
      evidence: Record<string, unknown>;
      suspected_defect: boolean;
      visible_as_defect: boolean;
    }>(`
      SELECT class,impact_code,evidence,suspected_defect,
        EXISTS(
          SELECT 1 FROM observation.defect_signal_v AS defect
          WHERE defect.signal_id=signal.signal_id
        ) AS visible_as_defect
      FROM observation.signal AS signal
      WHERE signal_id='00000000-0000-4000-8000-000000000059'
    `);
    expect(stored.rows).toEqual([{
      class: "AGENT_SELF",
      impact_code: "IMPACT_AGENT_DELIVERY",
      evidence: { reason: "DELIVERY_FAILURE", channel: "sendmail" },
      suspected_defect: false,
      visible_as_defect: false
    }]);

    await expect(pool().query(`
      INSERT INTO observation.signal(
        signal_id,state,class,component,severity,impact_code,first_failed_probe_at,
        detected_at,evidence,suspected_defect,defect_kind,run_ref,work_item_ref,
        threshold_version,clears_signal_id,recorded_at
      ) VALUES (
        '00000000-0000-4000-8000-000000000060','OPEN','AGENT_SELF',
        'observation_agent','DEGRADED','IMPACT_AGENT_DELIVERY',null,now(),
        '{"reason":"DELIVERY_FAILURE","channel":"sendmail"}',true,'STALL_DETECTED',null,null,1,null,now()
      )
    `)).rejects.toMatchObject({ code: "23514" });
  });

  it("gives the agent only the required mutable-table updates", async () => {
    const agent = await pool().connect();
    try {
      await agent.query("BEGIN");
      await agent.query("SET LOCAL ROLE debateai_observation_agent");
      await agent.query(`
        INSERT INTO observation.heartbeat(
          singleton,observed_at,pid,version,thresholds_version
        ) VALUES (true,'2026-09-03T08:00:00.000Z',123,'test-v1',1)
      `);
      await agent.query(`
        UPDATE observation.heartbeat
        SET observed_at='2026-09-03T08:00:05.000Z',thresholds_version=2
        WHERE singleton=true
      `);
      await agent.query(`
        INSERT INTO observation.sample_ring(metric_key,bucket,observed_at,value)
        VALUES ('test.listener_boundary',0,'2026-09-03T08:00:00.000Z',1)
      `);
      await agent.query(`
        UPDATE observation.sample_ring SET value=2
        WHERE metric_key='test.listener_boundary' AND bucket=0
      `);
      await expect(agent.query(`
        SELECT
          (SELECT thresholds_version FROM observation.heartbeat WHERE singleton=true) AS version,
          (SELECT value::text FROM observation.sample_ring
            WHERE metric_key='test.listener_boundary' AND bucket=0) AS sample_value
      `)).resolves.toMatchObject({ rows: [{ version: 2, sample_value: "2" }] });

      for (const statement of [
        "UPDATE observation.signal SET recorded_at=recorded_at WHERE false",
        "UPDATE observation.delivery SET attempted_at=attempted_at WHERE false",
        "UPDATE observation.threshold_policy SET applied_at=applied_at WHERE false",
        "UPDATE observation.sample_hourly SET hour=hour WHERE false",
        "UPDATE observation.job_completion SET completed_at=completed_at WHERE false"
      ]) {
        await agent.query("SAVEPOINT agent_immutable_boundary");
        try {
          await expect(agent.query(statement)).rejects.toMatchObject({ code: "42501" });
        } finally {
          await agent.query("ROLLBACK TO SAVEPOINT agent_immutable_boundary");
        }
      }
    } finally {
      await agent.query("ROLLBACK");
      agent.release();
    }

    const agentWrites = await pool().query<{
      table_schema: string;
      table_name: string;
      privilege_type: string;
    }>(`
      SELECT table_schema,table_name,privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee='debateai_observation_agent'
        AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
      ORDER BY table_schema,table_name,privilege_type
    `);
    expect(agentWrites.rows).toEqual([
      { table_schema: "observation", table_name: "delivery", privilege_type: "INSERT" },
      { table_schema: "observation", table_name: "heartbeat", privilege_type: "INSERT" },
      { table_schema: "observation", table_name: "heartbeat", privilege_type: "UPDATE" },
      { table_schema: "observation", table_name: "job_completion", privilege_type: "INSERT" },
      { table_schema: "observation", table_name: "sample_hourly", privilege_type: "INSERT" },
      { table_schema: "observation", table_name: "sample_ring", privilege_type: "INSERT" },
      { table_schema: "observation", table_name: "sample_ring", privilege_type: "UPDATE" },
      { table_schema: "observation", table_name: "signal", privilege_type: "INSERT" },
      { table_schema: "observation", table_name: "threshold_policy", privilege_type: "INSERT" }
    ]);
  });

  it("keeps signal vocabulary closed and immutable rows trigger-guarded", async () => {
    await expect(pool().query(`
      INSERT INTO observation.signal(
        signal_id,state,class,component,severity,impact_code,first_failed_probe_at,
        detected_at,evidence,suspected_defect,defect_kind,run_ref,work_item_ref,
        threshold_version,clears_signal_id,recorded_at
      ) VALUES (
        '00000000-0000-4000-8000-000000000057','OPEN','CAPACITY',
        'host','DEGRADED','IMPACT_LOAD',now(),now(),'{}',false,null,null,null,1,null,now()
      )
    `)).resolves.toMatchObject({ rowCount: 1 });

    await expect(pool().query(`
      INSERT INTO observation.signal(
        signal_id,state,class,component,severity,impact_code,first_failed_probe_at,
        detected_at,evidence,suspected_defect,defect_kind,run_ref,work_item_ref,
        threshold_version,clears_signal_id,recorded_at
      ) VALUES (
        '00000000-0000-4000-8000-000000000058','OPEN','CAPACITY',
        'host','DEGRADED','IMPACT_UNKNOWN',now(),now(),'{}',false,null,null,null,1,null,now()
      )
    `)).rejects.toMatchObject({ code: "23514" });

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
