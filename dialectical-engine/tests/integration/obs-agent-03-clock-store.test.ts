import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createObservationDatabasePort,
  type ObservationDatabasePort,
  type ObservationQueryClient
} from "../../apps/observation-agent/src/core/database.js";
import { migrate } from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const READY_KEY = "runner.ready_identity";
const PROGRESS_IDENTITY_KEY = "runner.progress_identity";
const PROGRESS_SEQUENCE_KEY = "runner.progress_sequence";
const CLOCK_KEYS = [READY_KEY, PROGRESS_IDENTITY_KEY, PROGRESS_SEQUENCE_KEY] as const;

const runA = "36000000-0000-4000-8000-000000000001";
const runB = "36000000-0000-4000-8000-000000000002";
const runC = "36000000-0000-4000-8000-000000000003";
const itemA = "37000000-0000-4000-8000-000000000001";
const itemB = "37000000-0000-4000-8000-000000000002";
const itemC = "37000000-0000-4000-8000-000000000003";
const highUuid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const highUuidDecimal = "340282366920938463463374607431768211455";
const paddedUuid = "00000000-0000-4000-8000-000000000001";
const paddedUuidDecimal = "302240678275694148452353";
const at = (seconds: number) => new Date(1_800_200_000_000 + seconds * 1_000);

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

beforeEach(async () => {
  await database.pool.query(
    "DELETE FROM observation.sample_ring WHERE metric_key = ANY($1::text[])",
    [CLOCK_KEYS]
  );
});

afterAll(async () => {
  await database?.stop();
});

async function clockModule() {
  return import("../../apps/observation-agent/src/modules/stall-detectors/clock-store.js");
}

function ready(workItemId: string, runId = runA) {
  return Object.freeze({ workItemId, runId, state: "READY" as const });
}

function progress(runId: string, latestProgressSeq: number) {
  return Object.freeze({ runId, latestProgressSeq });
}

async function storedRows() {
  const result = await database.pool.query<{
    metric_key: string;
    bucket: number;
    observed_at: Date;
    value: string;
  }>(`
    SELECT metric_key, bucket, observed_at, value::text AS value
    FROM observation.sample_ring
    WHERE metric_key = ANY($1::text[])
    ORDER BY metric_key, bucket
  `, [CLOCK_KEYS]);
  return result.rows;
}

describe("OBS-03 restart-safe detector clocks", () => {
  it("accepts only capacities within the ratified 1 through 8,640 slot bound", async () => {
    const { DetectorClockStore } = await clockModule();
    const unused = Object.freeze({
      async withClient<T>(): Promise<T> { throw new Error("UNUSED_DATABASE_PORT"); }
    });

    expect(() => new DetectorClockStore(unused, 8_640)).not.toThrow();
    for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 8_641]) {
      expect(() => new DetectorClockStore(unused, invalid), String(invalid))
        .toThrow("OBSERVATION_DETECTOR_CLOCK_INVALID_CAPACITY");
    }
  });

  it("round-trips high and zero-padded UUIDs without Number precision loss", async () => {
    const { DetectorClockStore } = await clockModule();
    const port = createObservationDatabasePort(database.pool);
    const first = await new DetectorClockStore(port).reconcile({
      now: at(0), ready: [ready(highUuid), ready(paddedUuid)], progress: []
    });
    expect(first.readyFirstObserved.get(highUuid)).toEqual(at(0));
    expect(await storedRows()).toEqual([
      expect.objectContaining({
        metric_key: READY_KEY, bucket: 0, observed_at: at(0), value: highUuidDecimal
      }),
      expect.objectContaining({
        metric_key: READY_KEY, bucket: 1, observed_at: at(0), value: paddedUuidDecimal
      })
    ]);

    const afterRestart = await new DetectorClockStore(port).reconcile({
      now: at(119), ready: [ready(highUuid), ready(paddedUuid)], progress: []
    });
    expect(afterRestart.readyFirstObserved.get(highUuid)).toEqual(at(0));
    expect(afterRestart.readyFirstObserved.get(paddedUuid)).toEqual(at(0));
  });

  it("preserves READY first-observed time across reconstruction and opens at the durable age", async () => {
    const [{ DetectorClockStore }, { createDefectDetectorTracker }] = await Promise.all([
      clockModule(),
      import("../../apps/observation-agent/src/modules/stall-detectors/detectors.js")
    ]);
    const port = createObservationDatabasePort(database.pool);
    await new DetectorClockStore(port).reconcile({
      now: at(0), ready: [ready(itemA)], progress: []
    });
    const clocks = await new DetectorClockStore(port).reconcile({
      now: at(121), ready: [ready(itemA)], progress: []
    });
    const cycle = createDefectDetectorTracker().observe({
      now: at(121), stallRows: [], readyRows: [ready(itemA)], progressRows: [],
      suspiciousRows: [],
      thresholds: { claimGraceSeconds: 15, readyAgeSeconds: 120, noProgressSeconds: 300 }
    }, clocks);
    expect(cycle.candidates).toEqual([expect.objectContaining({
      class: "QUEUE_NOT_DRAINING", firstFailedProbeAt: at(0), workItemRef: itemA
    })]);
  });

  it("preserves an unchanged progress clock across reconstruction and advances it only on increase", async () => {
    const [{ DetectorClockStore }, { createDefectDetectorTracker }] = await Promise.all([
      clockModule(),
      import("../../apps/observation-agent/src/modules/stall-detectors/detectors.js")
    ]);
    const port = createObservationDatabasePort(database.pool);
    await new DetectorClockStore(port).reconcile({
      now: at(0), ready: [], progress: [progress(runA, 7)]
    });
    const unchanged = await new DetectorClockStore(port).reconcile({
      now: at(300), ready: [], progress: [progress(runA, 7)]
    });
    expect(unchanged.progressLastChanged.get(runA)).toEqual({ sequence: 7, at: at(0) });
    expect(createDefectDetectorTracker().observe({
      now: at(300), stallRows: [], readyRows: [], progressRows: [progress(runA, 7)],
      suspiciousRows: [],
      thresholds: { claimGraceSeconds: 15, readyAgeSeconds: 120, noProgressSeconds: 300 }
    }, unchanged).candidates).toEqual([expect.objectContaining({
      class: "NO_PROGRESS", firstFailedProbeAt: at(0), runRef: runA
    })]);

    const advanced = await new DetectorClockStore(port).reconcile({
      now: at(301), ready: [], progress: [progress(runA, 8)]
    });
    expect(advanced.progressLastChanged.get(runA)).toEqual({ sequence: 8, at: at(301) });
  });

  it("keeps current READY slots stable, never overwrites them, and reuses departed slots", async () => {
    const { DetectorClockStore } = await clockModule();
    const port = createObservationDatabasePort(database.pool);
    const store = new DetectorClockStore(port, 2);
    await store.reconcile({
      now: at(0), ready: [ready(itemA), ready(itemB)], progress: []
    });
    const initial = await storedRows();
    const initialBuckets = new Map(initial.map((row) => [row.value, row.bucket]));

    const full = await store.reconcile({
      now: at(1), ready: [ready(itemB), ready(itemA), ready(itemC)], progress: []
    });
    expect(full.exhausted).toEqual(new Set(["READY"]));
    expect(new Map((await storedRows()).map((row) => [row.value, row.bucket])))
      .toEqual(initialBuckets);

    const reused = await store.reconcile({
      now: at(2), ready: [ready(itemB), ready(itemC)], progress: []
    });
    expect(reused.exhausted.size).toBe(0);
    const rows = await storedRows();
    const itemBDecimal = BigInt(`0x${itemB.replaceAll("-", "")}`).toString(10);
    const itemCDecimal = BigInt(`0x${itemC.replaceAll("-", "")}`).toString(10);
    const byValue = new Map(rows.map((row) => [row.value, row]));
    expect(byValue.get(itemBDecimal)?.bucket).toBe(initialBuckets.get(itemBDecimal));
    expect(byValue.get(itemBDecimal)?.observed_at).toEqual(at(0));
    expect(byValue.get(itemCDecimal)?.bucket).toBe(initialBuckets.get(
      BigInt(`0x${itemA.replaceAll("-", "")}`).toString(10)
    ));
    expect(byValue.get(itemCDecimal)?.observed_at).toEqual(at(2));
  });

  it("pairs progress identity and sequence in one stable bucket and fails closed on exhaustion", async () => {
    const { DetectorClockStore } = await clockModule();
    const port = createObservationDatabasePort(database.pool);
    const store = new DetectorClockStore(port, 2);
    await store.reconcile({
      now: at(0), ready: [], progress: [progress(runA, 4), progress(runB, 5)]
    });
    const initial = await storedRows();
    const identityRows = initial.filter((row) => row.metric_key === PROGRESS_IDENTITY_KEY);
    const sequenceRows = initial.filter((row) => row.metric_key === PROGRESS_SEQUENCE_KEY);
    expect(sequenceRows.map((row) => row.bucket)).toEqual(identityRows.map((row) => row.bucket));
    expect(sequenceRows.map((row) => row.observed_at)).toEqual(identityRows.map((row) => row.observed_at));

    const exhausted = await store.reconcile({
      now: at(1), ready: [],
      progress: [progress(runA, 4), progress(runB, 5), progress(runC, 6)]
    });
    expect(exhausted.exhausted).toEqual(new Set(["PROGRESS"]));
    expect(await storedRows()).toEqual(initial);
  });

  it("persists retained progress advances at their real time while an untracked run exhausts capacity", async () => {
    const { DetectorClockStore } = await clockModule();
    const port = createObservationDatabasePort(database.pool);
    await new DetectorClockStore(port, 2).reconcile({
      now: at(0), ready: [], progress: [progress(runA, 0), progress(runB, 0)]
    });

    const exhausted = await new DetectorClockStore(port, 2).reconcile({
      now: at(1), ready: [],
      progress: [progress(runA, 1), progress(runB, 0), progress(runC, 0)]
    });
    expect(exhausted.exhausted).toEqual(new Set(["PROGRESS"]));
    expect(exhausted.progressLastChanged.get(runA)).toEqual({ sequence: 1, at: at(1) });

    const reconstructed = await new DetectorClockStore(port, 2).reconcile({
      now: at(1), ready: [],
      progress: [progress(runA, 1), progress(runB, 0), progress(runC, 0)]
    });
    expect(reconstructed.progressLastChanged.get(runA)).toEqual({ sequence: 1, at: at(1) });
    const runADecimal = BigInt(`0x${runA.replaceAll("-", "")}`).toString(10);
    const paired = (await storedRows()).filter((row) => row.value === runADecimal || (
      row.metric_key === PROGRESS_SEQUENCE_KEY && row.value === "1"
    ));
    expect(paired).toEqual([
      expect.objectContaining({ metric_key: PROGRESS_IDENTITY_KEY, observed_at: at(1) }),
      expect.objectContaining({ metric_key: PROGRESS_SEQUENCE_KEY, observed_at: at(1) })
    ]);

    const recoveredCapacity = await new DetectorClockStore(port, 2).reconcile({
      now: at(2), ready: [], progress: [progress(runA, 1), progress(runB, 0)]
    });
    expect(recoveredCapacity.exhausted.size).toBe(0);
    expect(recoveredCapacity.progressLastChanged.get(runA)).toEqual({ sequence: 1, at: at(1) });
  });

  it("serializes overlapping cold-start allocation before either process can plan absent slots", async () => {
    const { DetectorClockStore } = await clockModule();
    const base = createObservationDatabasePort(database.pool);
    let completedLocks = 0;
    let resolveFirstReady!: () => void;
    const firstReady = new Promise<void>((resolve) => { resolveFirstReady = resolve; });
    let resolveSecondStarted!: () => void;
    const secondStarted = new Promise<void>((resolve) => { resolveSecondStarted = resolve; });
    let selectResults = 0;
    let resolveBothSelects!: () => void;
    const bothSelects = new Promise<void>((resolve) => { resolveBothSelects = resolve; });
    let resolveFirstUpsert!: () => void;
    const firstUpsert = new Promise<void>((resolve) => { resolveFirstUpsert = resolve; });

    const overlappingPort = (lane: "first" | "second"): ObservationDatabasePort => Object.freeze({
      withClient<T>(operation: (client: ObservationQueryClient) => Promise<T>): Promise<T> {
        return base.withClient((client) => operation(Object.freeze({
          query: (async (textOrConfig: string | { text?: string }, values?: readonly unknown[]) => {
            const text = typeof textOrConfig === "string" ? textOrConfig : textOrConfig.text ?? "";
            if (lane === "second" && text === "BEGIN") resolveSecondStarted();
            if (text.includes("pg_advisory_xact_lock")) {
              const result = await client.query(textOrConfig as never, values as never);
              completedLocks += 1;
              if (lane === "first") resolveFirstReady();
              return result;
            }
            if (text.includes("SELECT metric_key,bucket,observed_at,value::text AS value")) {
              if (lane === "first") {
                resolveFirstReady();
                await secondStarted;
              }
              if (completedLocks === 0) {
                const result = await client.query(textOrConfig as never, values as never);
                selectResults += 1;
                if (selectResults === 2) resolveBothSelects();
                await bothSelects;
                return result;
              }
            }
            if (completedLocks === 0 && text.includes("INSERT INTO observation.sample_ring")) {
              if (lane === "second") await firstUpsert;
              const result = await client.query(textOrConfig as never, values as never);
              if (lane === "first") resolveFirstUpsert();
              return result;
            }
            return client.query(textOrConfig as never, values as never);
          }) as ObservationQueryClient["query"]
        })));
      }
    });

    const first = new DetectorClockStore(overlappingPort("first"), 2).reconcile({
      now: at(0), ready: [ready(itemA)], progress: []
    });
    await firstReady;
    const second = new DetectorClockStore(overlappingPort("second"), 2).reconcile({
      now: at(1), ready: [ready(itemA), ready(itemB)], progress: []
    });
    await Promise.all([first, second]);

    const itemADecimal = BigInt(`0x${itemA.replaceAll("-", "")}`).toString(10);
    const itemBDecimal = BigInt(`0x${itemB.replaceAll("-", "")}`).toString(10);
    expect(await storedRows()).toEqual([
      expect.objectContaining({ metric_key: READY_KEY, bucket: 0,
        observed_at: at(0), value: itemADecimal }),
      expect.objectContaining({ metric_key: READY_KEY, bucket: 1,
        observed_at: at(1), value: itemBDecimal })
    ]);
  });

  it("writes only the three ratified fixed metric keys", async () => {
    const { DetectorClockStore } = await clockModule();
    await new DetectorClockStore(createObservationDatabasePort(database.pool)).reconcile({
      now: at(0), ready: [ready(itemA)], progress: [progress(runA, 1)]
    });
    expect([...new Set((await storedRows()).map((row) => row.metric_key))].sort())
      .toEqual([...CLOCK_KEYS].sort());
  });
});
