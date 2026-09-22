import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../support/testDatabase.js";
import type {
  CaptureComponentHealthWrite,
  CaptureRuntimeDatabaseSink,
} from "../../packages/obs-capture/src/runtime/sink.js";

vi.mock("@debateai/kernel", async () =>
  import("../../packages/kernel/src/index.js"),
);
vi.mock("@debateai/crypto", async () =>
  import("../../packages/crypto/src/index.js"),
);
vi.mock("@debateai/db", async () =>
  import("../../packages/db/src/index.js"),
);
vi.mock("@debateai/register", async () =>
  import("../../packages/register/src/index.js"),
);

const WRITER_PASSWORD = "writer-fix07-c1-only";

const HEALTH_UPSERT = `
  INSERT INTO obs.component_health (component, state, observed_at, detail_code)
  VALUES ($1, $2, clock_timestamp(), $3)
  ON CONFLICT (component) DO UPDATE SET
    state = $2,
    observed_at = clock_timestamp(),
    detail_code = $3,
    updated_at = clock_timestamp()
`;

let database: TestDatabase;

function writerConnectionString(): string {
  const url = new URL(database.connectionString);
  url.username = "debateai_obs_writer";
  url.password = WRITER_PASSWORD;
  return url.toString();
}

async function connectedWriter(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: writerConnectionString() });
  await client.connect();
  return client;
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("FIX07_WAIT_TIMED_OUT");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeAll(async () => {
  database = await startTestDatabase();
  await database.pool.query(
    "SELECT set_config('debateai.obs_writer_password', $1, false)",
    [WRITER_PASSWORD],
  );
  await migrate(database.pool);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

describe("FIX-07 C1 replica-safe capture lease grants", () => {
  it("lets authenticated replica writers refresh one lease in conflict-lock order", async () => {
    const writerA = await connectedWriter();
    const writerB = await connectedWriter();
    try {
      await writerA.query(HEALTH_UPSERT, [
        "capture:runner",
        "ARMED",
        "FLUSH_OK",
      ]);
      const initial = await database.pool.query<{ observed_at: Date }>(
        `SELECT observed_at
           FROM obs.component_health
          WHERE component = 'capture:runner'`,
      );

      await writerA.query("BEGIN");
      await writerA.query(HEALTH_UPSERT, [
        "capture:runner",
        "SPOOL_ONLY",
        "POSTGRES_FAILURE",
      ]);

      let writerBSettled = false;
      const writerBUpsert = writerB.query(HEALTH_UPSERT, [
        "capture:runner",
        "ARMED",
        "FLUSH_OK",
      ]).finally(() => {
        writerBSettled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(writerBSettled).toBe(false);

      await writerA.query("COMMIT");
      await writerBUpsert;

      const final = await database.pool.query<{
        state: string;
        detail_code: string;
        observed_at: Date;
      }>(
        `SELECT state, detail_code, observed_at
           FROM obs.component_health
          WHERE component = 'capture:runner'`,
      );
      expect(final.rows).toEqual([{
        state: "ARMED",
        detail_code: "FLUSH_OK",
        observed_at: expect.any(Date),
      }]);
      expect(final.rows[0]!.observed_at.getTime())
        .toBeGreaterThan(initial.rows[0]!.observed_at.getTime());
    } finally {
      await writerA.query("ROLLBACK").catch(() => undefined);
      await Promise.allSettled([writerA.end(), writerB.end()]);
    }
  });

  it("grants only the columns needed by conflict arbitration and the update", async () => {
    const privileges = await database.pool.query<{
      table_insert: boolean;
      table_select: boolean;
      table_update: boolean;
      table_delete: boolean;
      table_truncate: boolean;
      component_insert: boolean;
      component_select: boolean;
      component_update: boolean;
      state_select: boolean;
      state_update: boolean;
      updated_at_insert: boolean;
      updated_at_update: boolean;
    }>(`
      SELECT
        has_table_privilege('debateai_obs_writer', 'obs.component_health', 'INSERT') AS table_insert,
        has_table_privilege('debateai_obs_writer', 'obs.component_health', 'SELECT') AS table_select,
        has_table_privilege('debateai_obs_writer', 'obs.component_health', 'UPDATE') AS table_update,
        has_table_privilege('debateai_obs_writer', 'obs.component_health', 'DELETE') AS table_delete,
        has_table_privilege('debateai_obs_writer', 'obs.component_health', 'TRUNCATE') AS table_truncate,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'component', 'INSERT') AS component_insert,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'component', 'SELECT') AS component_select,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'component', 'UPDATE') AS component_update,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'state', 'SELECT') AS state_select,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'state', 'UPDATE') AS state_update,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'updated_at', 'INSERT') AS updated_at_insert,
        has_column_privilege('debateai_obs_writer', 'obs.component_health', 'updated_at', 'UPDATE') AS updated_at_update
    `);
    expect(privileges.rows).toEqual([{
      table_insert: false,
      table_select: false,
      table_update: false,
      table_delete: false,
      table_truncate: false,
      component_insert: true,
      component_select: true,
      component_update: false,
      state_select: false,
      state_update: true,
      updated_at_insert: false,
      updated_at_update: true,
    }]);
  });

  it("keeps state reads and component updates unavailable to the writer", async () => {
    const writer = await connectedWriter();
    try {
      await expect(writer.query(
        "SELECT state FROM obs.component_health LIMIT 1",
      )).rejects.toMatchObject({ code: "42501" });
      await expect(writer.query(
        "UPDATE obs.component_health SET component = component WHERE false",
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await writer.end();
    }
  });

  it("writes the runtime lease without accepting client time or STOPPED state", async () => {
    const { createPostgresCaptureSink } = await import(
      "../../packages/obs-capture/src/runtime/sink.js"
    );
    const sink = createPostgresCaptureSink({
      connectionString: writerConnectionString(),
    });
    const ownerBefore = await database.pool.query<{ server_time: Date }>(
      "SELECT clock_timestamp() AS server_time",
    );
    try {
      await sink.writeComponentHealth({
        component: "capture:scheduler",
        state: "ARMED",
        detailCode: "FLUSH_OK",
      });
    } finally {
      await sink.close();
    }

    const row = await database.pool.query<{
      component: string;
      state: string;
      detail_code: string;
      observed_at: Date;
    }>(`
      SELECT component, state, detail_code, observed_at
        FROM obs.component_health
       WHERE component = 'capture:scheduler'
    `);
    expect(row.rows).toEqual([{
      component: "capture:scheduler",
      state: "ARMED",
      detail_code: "FLUSH_OK",
      observed_at: expect.any(Date),
    }]);
    expect(row.rows[0]!.observed_at.getTime())
      .toBeGreaterThanOrEqual(ownerBefore.rows[0]!.server_time.getTime());
  });

  it("keeps one shared lease live until both isolated runtime replicas stop", async () => {
    const flushDeadlineMs = 100;
    const controlDirectory = await mkdtemp(join(tmpdir(), "fix07-shared-control-"));
    const replicas: Array<Readonly<{
      runtime: typeof import("../../packages/obs-capture/src/runtime/index.js");
      healthAttempts: CaptureComponentHealthWrite[];
      pools: { created: number; closed: number };
    }>> = [];

    async function loadReplica(): Promise<(typeof replicas)[number]> {
      vi.doUnmock("../../packages/obs-capture/src/runtime/config.js");
      vi.doUnmock("../../packages/obs-capture/src/runtime/sink.js");
      vi.resetModules();
      const actualConfig = await vi.importActual<
        typeof import("../../packages/obs-capture/src/runtime/config.js")
      >("../../packages/obs-capture/src/runtime/config.js");
      const actualSink = await vi.importActual<
        typeof import("../../packages/obs-capture/src/runtime/sink.js")
      >("../../packages/obs-capture/src/runtime/sink.js");
      const healthAttempts: CaptureComponentHealthWrite[] = [];
      const pools = { created: 0, closed: 0 };

      vi.doMock("../../packages/obs-capture/src/runtime/config.js", () => ({
        ...actualConfig,
        readObsBounds: () => Object.freeze({
          flushDeadlineMs,
          queueCapacity: 8,
          spoolDir: undefined,
          spoolAdmissionSeal: undefined,
          writerDatabaseUrl: writerConnectionString(),
        }),
        readObsControlDir: () => controlDirectory,
      }));
      vi.doMock("../../packages/obs-capture/src/runtime/sink.js", () => ({
        ...actualSink,
        createPostgresCaptureSink(options: Readonly<{
          connectionString: string | undefined;
        }>): CaptureRuntimeDatabaseSink {
          pools.created += 1;
          const sink = actualSink.createPostgresCaptureSink(options);
          return Object.freeze({
            writeOccurrences: sink.writeOccurrences,
            ingestSpooledOccurrence: sink.ingestSpooledOccurrence,
            writeCaptureGap: sink.writeCaptureGap,
            async writeComponentHealth(
              row: CaptureComponentHealthWrite,
            ): Promise<void> {
              healthAttempts.push(Object.freeze({ ...row }));
              await sink.writeComponentHealth(row);
            },
            async close(): Promise<void> {
              pools.closed += 1;
              await sink.close();
            },
          });
        },
      }));
      const runtime = await import(
        "../../packages/obs-capture/src/runtime/index.js"
      );
      return { runtime, healthAttempts, pools };
    }

    try {
      const replicaA = await loadReplica();
      replicas.push(replicaA);
      await replicaA.runtime.startCaptureRuntime({
        runtime: "runner",
        spoolFd: undefined,
        installExitSink() {},
      });
      await waitUntil(() => replicaA.healthAttempts.length >= 1);

      const replicaB = await loadReplica();
      replicas.push(replicaB);
      await replicaB.runtime.startCaptureRuntime({
        runtime: "runner",
        spoolFd: undefined,
        installExitSink() {},
      });
      await waitUntil(() => replicaB.healthAttempts.length >= 1);

      const shared = await database.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM obs.component_health
          WHERE component = 'capture:runner'`,
      );
      expect(shared.rows).toEqual([{ count: "1" }]);
      expect(replicaA.pools).toEqual({ created: 1, closed: 0 });
      expect(replicaB.pools).toEqual({ created: 1, closed: 0 });

      const bAttemptsBeforeStop = replicaB.healthAttempts.length;
      await replicaB.runtime.stopCaptureRuntime({ deadlineMs: 500 });
      await new Promise((resolve) => setTimeout(resolve, flushDeadlineMs * 2));
      expect(replicaB.healthAttempts).toHaveLength(bAttemptsBeforeStop);
      expect(replicaB.pools.closed).toBe(1);

      const aNextCycle = replicaA.healthAttempts.length + 1;
      await waitUntil(() => replicaA.healthAttempts.length >= aNextCycle);
      const whileAIsLive = await database.pool.query<{ period: string }>(
        `SELECT CASE
                  WHEN EXTRACT(EPOCH FROM
                    (clock_timestamp() - observed_at)) * 1000 > $1
                    THEN 'OFF'
                  ELSE 'LIVE'
                END AS period
           FROM obs.component_health
          WHERE component = 'capture:runner'`,
        [flushDeadlineMs],
      );
      expect(whileAIsLive.rows).toEqual([{ period: "LIVE" }]);

      const aAttemptsBeforeStop = replicaA.healthAttempts.length;
      await replicaA.runtime.stopCaptureRuntime({ deadlineMs: 500 });
      await new Promise((resolve) => setTimeout(resolve, flushDeadlineMs * 2));
      expect(replicaA.healthAttempts).toHaveLength(aAttemptsBeforeStop);
      expect(replicaA.pools.closed).toBe(1);

      await database.pool.query(
        `UPDATE obs.component_health
            SET observed_at = clock_timestamp()
              - ($1::double precision * interval '1 millisecond')
          WHERE component = 'capture:runner'`,
        [flushDeadlineMs + 0.001],
      );
      const afterBothStop = await database.pool.query<{ period: string }>(
        `SELECT CASE
                  WHEN EXTRACT(EPOCH FROM
                    (clock_timestamp() - observed_at)) * 1000 > $1
                    THEN 'OFF'
                  ELSE 'LIVE'
                END AS period
           FROM obs.component_health
          WHERE component = 'capture:runner'`,
        [flushDeadlineMs],
      );
      expect(afterBothStop.rows).toEqual([{ period: "OFF" }]);
      expect([
        ...replicaA.healthAttempts,
        ...replicaB.healthAttempts,
      ].every((row) => row.state !== ("STOPPED" as typeof row.state))).toBe(true);
    } finally {
      for (const replica of replicas) {
        await replica.runtime.stopCaptureRuntime({ deadlineMs: 500 });
      }
      vi.doUnmock("../../packages/obs-capture/src/runtime/config.js");
      vi.doUnmock("../../packages/obs-capture/src/runtime/sink.js");
      vi.resetModules();
      await rm(controlDirectory, { recursive: true, force: true });
    }
  }, 15_000);
});
