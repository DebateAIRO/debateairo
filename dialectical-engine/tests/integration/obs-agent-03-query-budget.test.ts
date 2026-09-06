import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import {
  createObservationDatabasePort,
  type ObservationDatabasePort,
  type ObservationQueryClient
} from "../../apps/observation-agent/src/core/database.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const queriesPath = "apps/observation-agent/src/modules/defect-interface/queries.ts";
const budgetPath = resolve("tests/acceptance/obs-agent-03-query-budget.sql");
let database: TestDatabase | undefined;

beforeAll(async () => {
  if (!existsSync(queriesPath) || !existsSync(budgetPath)) return;
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query(`
    INSERT INTO core.run(
      run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,
      risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,depth_params,
      agent_count,stranger_sample_rate,envelope_basis,register_version,battery_version,
      created_at_seq,discovered_panel
    )
    SELECT
      ('34000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      'OBS-03 budget ' || n,'asker:budget','session:budget','ASKER',
      '2026-09-03T08:00:00.000Z','casual','casual','ASKER','fixture','low','{}',
      1,0,'{}',1,'test-v1',n,'[{}]'
    FROM generate_series(1,220) AS n
  `);
  await database.pool.query(`
    INSERT INTO core.run_progress_event(run_id,at_seq,kind,value_json)
    SELECT
      ('34000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      n,'PHASE','{}'
    FROM generate_series(1,220) AS n
  `);
  await database.pool.query(`
    INSERT INTO core.work_item(
      work_item_id,run_id,battery_row_id,node_set,command_key,state,
      claimed_by,claim_deadline,created_at_seq
    )
    SELECT
      ('35000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      ('34000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid,
      'Q1','[]','obs-03-budget-' || n,
      CASE WHEN n % 3=0 THEN 'CLAIMED' WHEN n % 3=1 THEN 'READY' ELSE 'DONE' END,
      CASE WHEN n % 3=0 THEN 'runner-budget' ELSE NULL END,
      CASE WHEN n % 3=0 THEN '2026-09-03T07:00:00.000Z'::timestamptz ELSE NULL END,
      1000+n
    FROM generate_series(1,210) AS n
  `);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

describe("OBS-03 10x detector query budget", () => {
  it("loads exactly 220 runs and 210 work items through the safe views", async () => {
    expect(database).toBeDefined();
    const cardinality = await database!.pool.query<{ runs: string; work_items: string }>(`
      SELECT
        (SELECT count(DISTINCT run_id)::text FROM obs.run_progress_v) AS runs,
        (SELECT count(*)::text FROM obs.work_item_liveness_v) AS work_items
    `);
    expect(cardinality.rows).toEqual([{ runs: "220", work_items: "210" }]);
  });

  it("keeps all four runtime SELECT definitions below 100 ms", async () => {
    expect(database).toBeDefined();
    const queries = await import(
      "../../apps/observation-agent/src/modules/defect-interface/queries.js"
    );
    for (const [name, query] of Object.entries(queries.DEFECT_QUERY_DEFINITIONS)) {
      const explained = await database!.pool.query<{ "QUERY PLAN": string }>(
        `EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON) ${query}`
      );
      const line = explained.rows.map((row) => row["QUERY PLAN"])
        .find((value) => value.startsWith("Execution Time:"));
      expect(line, name).toBeDefined();
      const milliseconds = Number(/Execution Time: ([0-9.]+) ms/u.exec(line!)?.[1]);
      expect(milliseconds, name).toBeLessThanOrEqual(100);
    }
  });

  it("checks in the same four labelled SELECT definitions V will EXPLAIN directly", async () => {
    const queries = await import(
      "../../apps/observation-agent/src/modules/defect-interface/queries.js"
    );
    const sql = await readFile(budgetPath, "utf8");
    expect(Object.keys(queries.DEFECT_QUERY_DEFINITIONS)).toEqual([
      "STALL", "QUEUE_NOT_DRAINING", "NO_PROGRESS", "SUSPICIOUS_SUCCESS"
    ]);
    for (const [name, query] of Object.entries(queries.DEFECT_QUERY_DEFINITIONS)) {
      expect(sql).toContain(`\\echo 'OBS-03 ${name}'`);
      expect(sql).toContain(`EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)\n${query};`);
    }
  });

  it("reconciles the 10x fixture with one callback and a fixed parameterized statement bound", async () => {
    expect(database).toBeDefined();
    const [{ DetectorClockStore, DETECTOR_CLOCK_KEYS }, { readDefectInputs }] = await Promise.all([
      import("../../apps/observation-agent/src/modules/stall-detectors/clock-store.js"),
      import("../../apps/observation-agent/src/modules/defect-interface/queries.js")
    ]);
    const base = createObservationDatabasePort(database!.pool);
    const inputs = await readDefectInputs(base);
    const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
    let callbacks = 0;
    const measured: ObservationDatabasePort = Object.freeze({
      withClient<T>(operation: (client: ObservationQueryClient) => Promise<T>): Promise<T> {
        callbacks += 1;
        return base.withClient((client) => operation(Object.freeze({
          query: (async (textOrConfig: string | { text?: string }, values?: readonly unknown[]) => {
            const text = typeof textOrConfig === "string" ? textOrConfig : textOrConfig.text ?? "";
            calls.push({ text, values });
            return client.query(textOrConfig as never, values as never);
          }) as ObservationQueryClient["query"]
        })));
      }
    });
    const startedAt = performance.now();
    await new DetectorClockStore(measured).reconcile({
      ready: inputs.readyRows,
      progress: inputs.progressRows,
      now: new Date("2026-09-03T08:05:00.000Z")
    });
    const elapsedMs = performance.now() - startedAt;

    expect(callbacks).toBe(1);
    expect(calls.length).toBeLessThanOrEqual(8);
    expect(elapsedMs).toBeLessThan(2_000);
    const locks = calls.filter((call) => call.text.includes("pg_advisory_xact_lock"));
    expect(locks).toEqual([expect.objectContaining({
      values: [1_326_651_139, 1_129_073_475]
    })]);
    const inserts = calls.filter((call) => call.text.includes("INSERT INTO observation.sample_ring"));
    expect(inserts).toHaveLength(3);
    expect(inserts.every((call) => call.values?.length === 3)).toBe(true);
    const sql = calls.map((call) => call.text).join("\n");
    expect(sql).toContain(DETECTOR_CLOCK_KEYS.readyIdentity);
    expect(sql).toContain(DETECTOR_CLOCK_KEYS.progressIdentity);
    expect(sql).toContain(DETECTOR_CLOCK_KEYS.progressSequence);
    for (const row of [...inputs.readyRows, ...inputs.progressRows]) {
      const identity = "workItemId" in row ? row.workItemId : row.runId;
      expect(sql).not.toContain(identity);
    }
  });
});
