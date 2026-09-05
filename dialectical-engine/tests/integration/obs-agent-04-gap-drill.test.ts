import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { ObservationModuleRuntime } from "../../apps/observation-agent/src/core/runtime.js";
import { PostgresMirror } from "../../apps/observation-agent/src/store/postgres.js";
import { createCaptureHealthModule } from "../../apps/observation-agent/src/modules/capture-health/module.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase | undefined;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

function db(): TestDatabase {
  expect(database).toBeDefined();
  return database!;
}

describe("OBS-04 isolated gap drill", () => {
  it("stores one bounded OPEN and one immutable clear outside the defect view", async () => {
    const origin = new Date("2026-09-03T08:00:00.000Z");
    const gapId = "43000000-0000-4000-8000-000000000001";
    await db().pool.query(`
      INSERT INTO obs.capture_gap(
        capture_gap_id,source,gap_class,lost_count,opened_at,closed_at
      ) VALUES ($1,'first_party','QUEUE_FULL',7,$2,$2)
    `, [gapId, origin]);
    await db().pool.query(`
      INSERT INTO obs.component_health(component,state,observed_at,detail_code)
      VALUES ('runner','HEALTHY',$1,'FLUSH_OK')
    `, [new Date(origin.getTime() + 1_000)]);

    const mirror = new PostgresMirror(db().pool);
    let sequence = 50_000;
    let identifier = 0;
    const module = createCaptureHealthModule({
      readRuntimeLiveness: async () => ({ runner: "UP" })
    });
    const runtime = new ObservationModuleRuntime({
      modules: Object.freeze([module]),
      nextSequence: () => ++sequence,
      nextSignalId: () => `43000000-0000-4000-8000-${String(++identifier).padStart(12, "0")}`,
      sampleStore: { write: async () => undefined },
      emitSignal: async (signal) => mirror.mirrorSignal(signal)
    });
    const run = (now: Date) => runtime.run({
      modules: [module], now, timeoutMs: 2_000,
      databaseUrl: db().connectionString, stateDir: "/tmp/obs-04-isolated-state",
      targets: [], thresholdVersion: 1,
      moduleThresholds: { "capture-health": {
        expected_runtimes: ["runner"], detector_interval_ms: 15_000,
        blind_window_s: 120, gap_window_s: 300, gap_severe_lost_count: 100
      } }
    });

    await run(new Date(origin.getTime() + 17_000));
    await run(new Date(origin.getTime() + 32_000));
    const rows = await db().pool.query<{
      state: string; class: string; severity: string; suspected_defect: boolean;
      first_failed_probe_at: Date; detected_at: Date; clears_signal_id: string | null;
    }>(`SELECT state,class,severity,suspected_defect,first_failed_probe_at,
               detected_at,clears_signal_id
        FROM observation.signal WHERE class='CAPTURE_GAP' ORDER BY seq`);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.map((row) => row.state)).toEqual(["OPEN", "CLEARED"]);
    expect(rows.rows[0]).toMatchObject({
      class: "CAPTURE_GAP", severity: "DEGRADED", suspected_defect: false,
      first_failed_probe_at: origin
    });
    expect(rows.rows[0]!.detected_at.getTime() - origin.getTime()).toBeLessThanOrEqual(17_000);
    expect(rows.rows[1]!.clears_signal_id).not.toBeNull();
    const open = await db().pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM observation.open_signal_v WHERE class='CAPTURE_GAP'"
    );
    const defect = await db().pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM observation.defect_signal_v AS defect
       JOIN observation.signal AS signal USING (signal_id)
       WHERE signal.class='CAPTURE_GAP'`
    );
    expect(open.rows).toEqual([{ count: "0" }]);
    expect(defect.rows).toEqual([{ count: "0" }]);
  });
});
