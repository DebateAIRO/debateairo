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

describe("OBS-03 safe observation views", () => {
  it("replays the migration runner without duplicating or widening migration 0058", async () => {
    await expect(migrate(pool())).resolves.toBeUndefined();
    const applied = await pool().query<{ applied: string }>(`
      SELECT count(*)::text AS applied
      FROM public.debateai_schema_migration
      WHERE name='0058_observation_safe_views.sql'
    `);
    expect(applied.rows).toEqual([{ applied: "1" }]);
  });

  it("creates security-barrier projections with only the exact liveness fields", async () => {
    expect(existsSync(migrationPath)).toBe(true);
    const columns = await pool().query<{ table_name: string; column_name: string }>(`
      SELECT table_name,column_name
      FROM information_schema.columns
      WHERE table_schema='obs'
        AND table_name IN ('work_item_liveness_v','run_progress_v')
      ORDER BY table_name,ordinal_position
    `);
    expect(columns.rows).toEqual([
      { table_name: "run_progress_v", column_name: "run_id" },
      { table_name: "run_progress_v", column_name: "latest_progress_seq" },
      { table_name: "run_progress_v", column_name: "latest_progress_kind" },
      { table_name: "work_item_liveness_v", column_name: "work_item_id" },
      { table_name: "work_item_liveness_v", column_name: "run_id" },
      { table_name: "work_item_liveness_v", column_name: "state" },
      { table_name: "work_item_liveness_v", column_name: "claimed_by_present" },
      { table_name: "work_item_liveness_v", column_name: "claim_deadline" },
      { table_name: "work_item_liveness_v", column_name: "settled_artifact_present" }
    ]);

    const options = await pool().query<{ relname: string; reloptions: string[] | null }>(`
      SELECT relation.relname,relation.reloptions
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='obs'
        AND relation.relname IN ('work_item_liveness_v','run_progress_v')
      ORDER BY relation.relname
    `);
    expect(options.rows).toEqual([
      { relname: "run_progress_v", reloptions: ["security_barrier=true"] },
      { relname: "work_item_liveness_v", reloptions: ["security_barrier=true"] }
    ]);
  });

  it("projects presence and the latest progress event without exposing product content", async () => {
    const runId = "30000000-0000-4000-8000-000000000001";
    const workItemId = "30000000-0000-4000-8000-000000000002";
    await pool().query(`
      INSERT INTO core.run(
        run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,
        risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,depth_params,
        agent_count,stranger_sample_rate,envelope_basis,register_version,battery_version,
        created_at_seq,discovered_panel
      ) VALUES (
        $1,'safe-view fixture','asker:test','session:test','ASKER',
        '2026-09-03T08:00:00.000Z','casual','casual','ASKER','fixture','low','{}',
        1,0,'{}',1,'test-v1',1,'[{}]'
      )
    `, [runId]);
    await pool().query(`
      INSERT INTO core.work_item(
        work_item_id,run_id,battery_row_id,node_set,command_key,state,
        claimed_by,claim_deadline,created_at_seq
      ) VALUES ($1,$2,'row-a','[]','obs-03-work','CLAIMED','runner-a',
        '2026-09-03T08:00:00.000Z',2)
    `, [workItemId, runId]);
    await pool().query(`
      INSERT INTO core.run_progress_event(run_id,at_seq,kind,value_json)
      VALUES ($1,3,'PHASE','{}'),($1,4,'TERMINAL','{}')
    `, [runId]);

    await expect(pool().query(`
      SELECT work_item_id,run_id,state,claimed_by_present,claim_deadline,
             settled_artifact_present
      FROM obs.work_item_liveness_v WHERE work_item_id=$1
    `, [workItemId])).resolves.toMatchObject({ rows: [{
      work_item_id: workItemId,
      run_id: runId,
      state: "CLAIMED",
      claimed_by_present: true,
      settled_artifact_present: false
    }] });
    await expect(pool().query(`
      SELECT run_id,latest_progress_seq::text,latest_progress_kind
      FROM obs.run_progress_v WHERE run_id=$1
    `, [runId])).resolves.toMatchObject({ rows: [{
      run_id: runId,
      latest_progress_seq: "4",
      latest_progress_kind: "TERMINAL"
    }] });

    const migration = await readFile(migrationPath, "utf8");
    expect(migration).not.toMatch(/question|raw_text|content_ciphertext|metadata_json|user_id|session_id|asker_id/iu);
  });

  it("keeps the FixAgent projection read-only and includes defect OPEN rows plus CLEARED successors", async () => {
    const openedId = "30000000-0000-4000-8000-000000000010";
    const clearedId = "30000000-0000-4000-8000-000000000011";
    await pool().query(`
      INSERT INTO observation.signal(
        signal_id,state,class,component,severity,impact_code,first_failed_probe_at,
        detected_at,evidence,suspected_defect,defect_kind,run_ref,work_item_ref,
        threshold_version,clears_signal_id,recorded_at
      ) VALUES
      ($1,'OPEN','STALL','runner','SEVERE','IMPACT_STALL',now(),now(),
       '{"count":1,"state":"CLAIMED","claim_deadline":"2026-09-03T08:00:00.000Z","grace_s":15,"health":"HEALTHY"}',
       true,'STALL_DETECTED',null,null,1,null,now()),
      ($2,'CLEARED','STALL','runner','SEVERE','IMPACT_CLEARED',now(),now(),
       '{"duration_seconds":15}',true,'STALL_DETECTED',null,null,1,$1,now())
    `, [openedId, clearedId]);

    const rows = await pool().query<{ signal_id: string }>(`
      SELECT signal_id FROM observation.defect_signal_v
      WHERE signal_id IN ($1,$2) ORDER BY seq
    `, [openedId, clearedId]);
    expect(rows.rows).toEqual([{ signal_id: openedId }, { signal_id: clearedId }]);

    const listener = await pool().connect();
    try {
      await listener.query("BEGIN");
      await listener.query("SET LOCAL ROLE debateai_obs_listener");
      await expect(listener.query("SELECT * FROM observation.defect_signal_v LIMIT 1"))
        .resolves.toBeDefined();
      await expect(listener.query("INSERT INTO observation.defect_signal_v(signal_id) VALUES (gen_random_uuid())"))
        .rejects.toBeDefined();
    } finally {
      await listener.query("ROLLBACK");
      listener.release();
    }
  });
});
