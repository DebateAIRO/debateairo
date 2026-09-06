import { mkdtemp, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import type {
  ObservationDatabasePort as DatabasePort,
  ObservationQueryClient as QueryClient
} from "../../apps/observation-agent/src/core/database.js";
import { createThroughputModule } from "../../apps/observation-agent/src/modules/throughput/module.js";
import { readPostgresCapacity } from "../../apps/observation-agent/src/modules/postgres-capacity/query.js";
import { HeartbeatWriter } from "../../apps/observation-agent/src/modules/self/heartbeat.js";
import { makeSelfSignal } from "../../apps/observation-agent/src/modules/self/signals.js";
import {
  parseRatifiedThresholdPolicy,
  type RatifiedThresholdPolicy
} from "../../apps/observation-agent/src/oactl/core/thresholds.js";
import { PostgresMirror } from "../../apps/observation-agent/src/store/postgres.js";
import { SampleRingStore } from "../../apps/observation-agent/src/store/samples.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

type DatabaseModule = Readonly<{
  createObservationDatabasePort(pool: pg.Pool): DatabasePort;
  createObservationDaemonDatabase?: (input: Readonly<{
    connectionString: string;
    policy: RatifiedThresholdPolicy;
  }>) => Readonly<{ pool: pg.Pool; database: DatabasePort }>;
}>;

const root = resolve(import.meta.dirname, "../..");
const databaseModuleUrl = new URL(
  "../../apps/observation-agent/src/core/database.ts",
  import.meta.url
).href;
let database: TestDatabase | undefined;

async function databaseApi(): Promise<DatabaseModule> {
  const loaded = await import(/* @vite-ignore */ databaseModuleUrl)
    .catch(() => null) as DatabaseModule | null;
  expect(loaded, "ObservationDatabasePort must exist before daemon reads migrate").not.toBeNull();
  return loaded!;
}

async function daemonSessionCount(applicationName: string): Promise<number> {
  const result = await database!.pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM pg_catalog.pg_stat_activity
    WHERE application_name=$1 AND datname=current_database()
  `, [applicationName]);
  return Number(result.rows[0]?.count ?? 0);
}

async function waitForSessions(applicationName: string, expected: number): Promise<number> {
  let observed = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    observed = Math.max(observed, await daemonSessionCount(applicationName));
    if (observed >= expected) return observed;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  return observed;
}

async function agentSessionCount(): Promise<number> {
  const result = await database!.pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM pg_catalog.pg_stat_activity
    WHERE usename='debateai_observation_agent' AND datname=current_database()
  `);
  return Number(result.rows[0]?.count ?? 0);
}

async function waitForAgentSessions(expected: number): Promise<number> {
  let observed = 0;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    observed = Math.max(observed, await agentSessionCount());
    if (observed >= expected) return observed;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  return observed;
}

async function ratifiedPolicy(): Promise<RatifiedThresholdPolicy> {
  const value: unknown = JSON.parse(await readFile(
    resolve(root, "deploy/observation-agent/thresholds/defaults/OBS-01.json"),
    "utf8"
  ));
  return parseRatifiedThresholdPolicy({
    version: 1,
    value,
    sourceRef: "task-5-disposable-policy",
    ratifiedBy: "task-5-test",
    appliedAt: new Date("2026-09-06T00:00:00.000Z")
  });
}

function agentConnectionString(): string {
  const url = new URL(database!.connectionString);
  url.username = "debateai_observation_agent";
  url.password = "task-5-agent-only";
  return url.toString();
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query(
    "ALTER ROLE debateai_observation_agent PASSWORD 'task-5-agent-only'"
  );
  await database.pool.query("CREATE DATABASE debateai");
  await database.pool.query("CREATE DATABASE hatchet");
}, 120_000);

afterAll(async () => database?.stop());

describe("OBS-01 daemon database session budget", () => {
  it("honors a ratified session budget below the daemon ceiling", async () => {
    const api = await databaseApi();
    expect(api.createObservationDaemonDatabase).toBeTypeOf("function");
    if (api.createObservationDaemonDatabase === undefined) {
      throw new Error("OBSERVATION_DAEMON_DATABASE_FACTORY_MISSING");
    }
    const policy = await ratifiedPolicy();
    const daemon = api.createObservationDaemonDatabase({
      connectionString: agentConnectionString(),
      policy: parseRatifiedThresholdPolicy({
        ...policy,
        value: {
          ...policy.value,
          resources: { ...policy.value.resources, max_database_sessions: 1 }
        }
      })
    });
    try {
      expect(daemon.pool.options.max).toBe(1);
    } finally {
      await daemon.pool.end();
    }
  });

  it("does not let a callback client escape after completion", async () => {
    const { createObservationDatabasePort } = await databaseApi();
    const pool = new pg.Pool({ connectionString: database!.connectionString, max: 1 });
    const port = createObservationDatabasePort(pool);
    let escaped: QueryClient | undefined;
    try {
      await port.withClient(async (client) => {
        escaped = client;
        await client.query("SELECT 1");
      });
      expect(escaped).toBeDefined();
      await expect(escaped!.query("SELECT 1")).rejects.toThrow(
        "OBSERVATION_DATABASE_CLIENT_EXPIRED"
      );
    } finally {
      await pool.end();
    }
  });

  it.each([
    "detached",
    "queueMicrotask",
    "Promise.then",
    "custom thenable"
  ] as const)("waits for a %s query before returning the session", async (kind) => {
    const { createObservationDatabasePort } = await databaseApi();
    let started: Promise<unknown> | undefined;
    let finishQuery: (() => void) | undefined;
    let settled = false;
    let returned = false;
    const checkedOut = {
      query(text: string): Promise<unknown> {
        if (text === "ROLLBACK" || text === "RESET ROLE") {
          return Promise.resolve({ rows: [] });
        }
        return new Promise((resolvePromise) => {
          finishQuery = () => {
            settled = true;
            resolvePromise({ rows: [] });
          };
        });
      },
      release() {}
    };
    const port = createObservationDatabasePort({
      connect: async () => checkedOut
    } as unknown as pg.Pool);
    const start = (client: QueryClient) => {
      started = client.query("SELECT pending");
    };
    const operation = port.withClient((client) => {
      if (kind === "detached") start(client);
      if (kind === "queueMicrotask") queueMicrotask(() => start(client));
      if (kind === "Promise.then") void Promise.resolve().then(() => start(client));
      if (kind === "custom thenable") {
        return {
          then(resolvePromise: (value: void) => void) {
            start(client);
            resolvePromise();
          }
        } as Promise<void>;
      }
      return Promise.resolve();
    }).finally(() => { returned = true; });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
    expect(started).toBeDefined();
    expect(returned).toBe(false);
    finishQuery?.();
    await operation;
    expect(settled).toBe(true);
  });

  it("rolls back a successful callback that leaves a transaction open", async () => {
    const { createObservationDatabasePort } = await databaseApi();
    const pool = new pg.Pool({ connectionString: database!.connectionString, max: 1 });
    const port = createObservationDatabasePort(pool);
    try {
      await port.withClient(async (client) => {
        await client.query("BEGIN");
        await client.query("SELECT pg_current_xact_id()");
      });
      const result = await port.withClient((client) => client.query<{
        baseline_role: boolean;
        no_open_transaction: boolean;
      }>(`SELECT current_user=session_user AS baseline_role,
                pg_current_xact_id_if_assigned() IS NULL AS no_open_transaction`));
      expect(result.rows).toEqual([{ baseline_role: true, no_open_transaction: true }]);
    } finally {
      await pool.end();
    }
  });

  it("resets a successful session role before heartbeat and capacity work", async () => {
    const { createObservationDatabasePort } = await databaseApi();
    const pool = new pg.Pool({ connectionString: database!.connectionString, max: 1 });
    const port = createObservationDatabasePort(pool);
    const stateDir = await mkdtemp(join(tmpdir(), "obs-port-role-"));
    try {
      await port.withClient(async (client) => {
        await client.query("SET ROLE pg_monitor");
      });
      await new HeartbeatWriter({ pool, stateDir }).write({
        now: new Date("2026-09-06T00:00:00.000Z"),
        pid: process.pid,
        version: "task-5-port-test",
        thresholdsVersion: 1
      });
      await readPostgresCapacity(port, new Date("2026-09-06T00:00:01.000Z"), {
        lockWaitSeconds: 60,
        idleInTransactionSeconds: 60
      });
      const result = await port.withClient((client) => client.query<{
        baseline_role: boolean;
        no_open_transaction: boolean;
      }>(`SELECT current_user=session_user AS baseline_role,
                pg_current_xact_id_if_assigned() IS NULL AS no_open_transaction`));
      expect(result.rows).toEqual([{ baseline_role: true, no_open_transaction: true }]);
    } finally {
      await pool.end();
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("preserves a callback error while resetting its session role", async () => {
    const { createObservationDatabasePort } = await databaseApi();
    const pool = new pg.Pool({ connectionString: database!.connectionString, max: 1 });
    const port = createObservationDatabasePort(pool);
    const callbackError = new Error("CALLBACK_FAILED");
    try {
      await expect(port.withClient(async (client) => {
        await client.query("SET ROLE pg_monitor");
        throw callbackError;
      })).rejects.toBe(callbackError);
      const result = await port.withClient((client) => client.query<{ baseline_role: boolean }>(
        "SELECT current_user=session_user AS baseline_role"
      ));
      expect(result.rows).toEqual([{ baseline_role: true }]);
    } finally {
      await pool.end();
    }
  });

  it("revokes the wrapper before exceptional cleanup can race it", async () => {
    const { createObservationDatabasePort } = await databaseApi();
    const callbackError = new Error("CALLBACK_FAILED");
    let finishRollback: (() => void) | undefined;
    let applicationQueries = 0;
    let raced: Promise<string> | undefined;
    const checkedOut = {
      query(text: string): Promise<unknown> {
        if (text === "ROLLBACK") {
          return new Promise<void>((resolvePromise) => { finishRollback = resolvePromise; });
        }
        if (text === "RESET ROLE") return Promise.resolve({ rows: [] });
        applicationQueries += 1;
        return Promise.resolve({ rows: [] });
      },
      release() {}
    };
    const port = createObservationDatabasePort({
      connect: async () => checkedOut
    } as unknown as pg.Pool);
    const operation = port.withClient(async (client) => {
      setTimeout(() => {
        raced = client.query("SELECT 1").then(
          () => "QUERY_RAN",
          (error: unknown) => error instanceof Error ? error.message : "UNKNOWN"
        );
        finishRollback?.();
      }, 0);
      throw callbackError;
    });
    await expect(operation).rejects.toBe(callbackError);
    expect(await raced).toBe("OBSERVATION_DATABASE_CLIENT_EXPIRED");
    expect(applicationQueries).toBe(0);
  });

  it("discards a cleanup failure without replacing the callback error", async () => {
    const { createObservationDatabasePort } = await databaseApi();
    const callbackError = new Error("CALLBACK_FAILED");
    const cleanupError = new Error("ROLLBACK_FAILED");
    let discarded = false;
    let firstReleaseReason: Error | boolean | undefined;
    const poisoned = {
      query(text: string): Promise<unknown> {
        if (text === "ROLLBACK") return Promise.reject(cleanupError);
        return Promise.resolve({ rows: [{ source: "poisoned" }] });
      },
      release(reason?: Error | boolean) {
        firstReleaseReason = reason;
        discarded = reason !== undefined && reason !== false;
      }
    };
    const healthy = {
      query(text: string): Promise<unknown> {
        if (text === "ROLLBACK" || text === "RESET ROLE") return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [{ source: "healthy" }] });
      },
      release() {}
    };
    const port = createObservationDatabasePort({
      connect: async () => discarded ? healthy : poisoned
    } as unknown as pg.Pool);
    await expect(port.withClient(async () => { throw callbackError; })).rejects.toBe(callbackError);
    expect(firstReleaseReason).toBe(cleanupError);
    const next = await port.withClient((client) => client.query<{ source: string }>("SELECT source"));
    expect(next.rows).toEqual([{ source: "healthy" }]);
  });

  it("rolls back an exceptional callback and releases its only session", async () => {
    const { createObservationDatabasePort } = await databaseApi();
    const applicationName = `obs-agent-rollback-${process.pid}`;
    const pool = new pg.Pool({
      connectionString: database!.connectionString,
      application_name: applicationName,
      max: 1
    });
    const port = createObservationDatabasePort(pool);
    let failedTransactionBackend: number | undefined;
    try {
      await expect(port.withClient(async (client) => {
        await client.query("BEGIN");
        const backend = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        failedTransactionBackend = backend.rows[0]?.pid;
        await client.query("SELECT 1 / 0");
      })).rejects.toMatchObject({ code: "22012" });
      const recovered = await port.withClient(async (client) => client.query<{
        recovered: number; pid: number;
      }>("SELECT 1 AS recovered, pg_backend_pid() AS pid"));
      expect(recovered.rows).toEqual([{ recovered: 1, pid: failedTransactionBackend }]);
      expect(await daemonSessionCount(applicationName)).toBe(1);
    } finally {
      await pool.end();
    }
    expect(await daemonSessionCount(applicationName)).toBe(0);
  });

  it("bounds concurrent callback operations by the supplied pool", async () => {
    const { createObservationDatabasePort } = await databaseApi();
    const applicationName = `obs-agent-concurrent-${process.pid}`;
    const pool = new pg.Pool({
      connectionString: database!.connectionString,
      application_name: applicationName,
      max: 2
    });
    const port = createObservationDatabasePort(pool);
    try {
      const operations = Array.from({ length: 3 }, () =>
        port.withClient(async (client) => client.query("SELECT pg_sleep(0.2)")));
      expect(await waitForSessions(applicationName, 2)).toBe(2);
      expect(await daemonSessionCount(applicationName)).toBeLessThanOrEqual(2);
      await Promise.all(operations);
    } finally {
      await pool.end();
    }
  });

  it("bounds real daemon consumers by agent role through production composition", async () => {
    const api = await databaseApi();
    expect(api.createObservationDaemonDatabase).toBeTypeOf("function");
    if (api.createObservationDaemonDatabase === undefined) {
      throw new Error("OBSERVATION_DAEMON_DATABASE_FACTORY_MISSING");
    }
    const daemon = api.createObservationDaemonDatabase({
      connectionString: agentConnectionString(),
      policy: await ratifiedPolicy()
    });
    const lock = await database!.pool.connect();
    const stateDir = await mkdtemp(join(tmpdir(), "obs-real-budget-"));
    let releaseHeld: (() => void) | undefined;
    try {
      await lock.query("BEGIN");
      await lock.query(`LOCK TABLE core.work_item, observation.heartbeat,
        observation.signal, observation.sample_ring IN ACCESS EXCLUSIVE MODE`);

      const held = daemon.database.withClient(async () => new Promise<void>((resolvePromise) => {
        releaseHeld = resolvePromise;
      }));
      expect(await waitForAgentSessions(1)).toBe(1);

      const { readDefectInputs } = await import(
        "../../apps/observation-agent/src/modules/defect-interface/queries.js"
      );
      const moduleRead = readDefectInputs(daemon.database);
      expect(await waitForAgentSessions(2)).toBe(2);
      await expect(database!.pool.query<{ count: string }>(`
        SELECT count(*)::text AS count
        FROM pg_catalog.pg_stat_activity
        WHERE usename='debateai_observation_agent'
          AND state='active'
          AND wait_event_type='Lock'
          AND query LIKE '%FROM obs.work_item_liveness_v%'
      `)).resolves.toMatchObject({ rows: [{ count: "1" }] });

      const heartbeat = new HeartbeatWriter({ pool: daemon.pool, stateDir }).write({
        now: new Date("2026-09-06T00:00:01.000Z"),
        pid: process.pid,
        version: "task-5-real-budget",
        thresholdsVersion: 1
      });
      const mirror = new PostgresMirror(daemon.pool).mirrorSignal(makeSelfSignal({
        seq: 1,
        signalId: randomUUID(),
        now: new Date("2026-09-06T00:00:02.000Z"),
        thresholdVersion: 1,
        event: "START",
        previousExitReason: "UNKNOWN"
      }));
      const sample = new SampleRingStore(daemon.pool).write({
        metricKey: "task5.real_budget",
        value: 1,
        observedAt: new Date("2026-09-06T00:00:03.000Z")
      }, 5_000);

      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      expect(await agentSessionCount()).toBe(2);
      expect(daemon.pool.options.max).toBe(2);
      releaseHeld?.();
      await lock.query("ROLLBACK");
      await Promise.all([held, moduleRead, heartbeat, mirror, sample]);
    } finally {
      releaseHeld?.();
      await lock.query("ROLLBACK").catch(() => undefined);
      lock.release();
      await daemon.pool.end();
      await rm(stateDir, { recursive: true, force: true });
    }
    expect(await agentSessionCount()).toBe(0);
  });

  it("serializes module follow-up queries on one checked-out client", async () => {
    let inFlight = 0;
    let maximumInFlight = 0;
    const client = Object.freeze({
      query: (async (text: string) => {
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
        inFlight -= 1;
        return {
          rows: text.includes("AS run_sequence") ? [{
            run_sequence: "0", runs_started: "0", terminal_runs: "0", failed_runs: "0",
            work_item_sequence: "0", completed_work_items: "0", failed_work_items: "0"
          }] : []
        };
      }) as QueryClient["query"]
    });
    const serialDatabase: DatabasePort = Object.freeze({
      withClient<T>(operation: (queryClient: QueryClient) => Promise<T>): Promise<T> {
        return operation(client);
      }
    });
    await createThroughputModule().probe({
      now: new Date("2026-09-06T00:00:00.000Z"),
      timeoutMs: 2_000,
      database: serialDatabase,
      stateDir: "/tmp/unused",
      repoRoot: root,
      targets: Object.freeze([]),
      targetFragment: null,
      configuration: Object.freeze({}),
      thresholds: Object.freeze({})
    });
    expect(maximumInFlight).toBe(1);
  });

  it("shares the max-two port with a real safe-view module read", async () => {
    const { createObservationDatabasePort } = await databaseApi();
    const { readDefectInputs } = await import(
      "../../apps/observation-agent/src/modules/defect-interface/queries.js"
    );
    const applicationName = `obs-agent-module-${process.pid}`;
    const pool = new pg.Pool({
      connectionString: database!.connectionString,
      application_name: applicationName,
      max: 2
    });
    const port = createObservationDatabasePort(pool);
    let releaseHeld: (() => void) | undefined;
    let releaseModule: (() => void) | undefined;
    const gatedModuleDatabase: DatabasePort = Object.freeze({
      withClient<T>(operation: (client: QueryClient) => Promise<T>): Promise<T> {
        return port.withClient(async (client) => {
          await new Promise<void>((resolvePromise) => {
            releaseModule = resolvePromise;
          });
          return operation(client);
        });
      }
    });
    try {
      const held = port.withClient(async () => new Promise<void>((resolvePromise) => {
        releaseHeld = resolvePromise;
      }));
      expect(await waitForSessions(applicationName, 1)).toBe(1);
      const moduleRead = readDefectInputs(gatedModuleDatabase);
      expect(await waitForSessions(applicationName, 2)).toBe(2);
      expect(await daemonSessionCount(applicationName)).toBeLessThanOrEqual(2);
      releaseHeld?.();
      releaseModule?.();
      await Promise.all([held, moduleRead]);
    } finally {
      releaseHeld?.();
      releaseModule?.();
      await pool.end();
    }
  });
});
