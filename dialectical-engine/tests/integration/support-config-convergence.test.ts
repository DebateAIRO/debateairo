import { randomUUID } from "node:crypto";
import { createServer, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as databaseApi from "../../packages/db/src/index.js";
import {
  SUPPORT_CONFIGURATION_KEYS,
  createPostgresRegisterPublicationPort,
  createSupportConfigurationPort,
  parseRegisterVersionText,
  type SupportConfigurationKey
} from "../../packages/register/src/index.js";
import {
  importHistoricalRegisterFixture,
  registerFixtureRow
} from "../support/registerFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

type SupportPoolFactory = (connectionString: string) => Pool;

const SUPPORT_VALUES: Readonly<Record<SupportConfigurationKey, unknown>> = Object.freeze({
  support_enabled: true,
  support_model_ref: "development:claude-cli",
  support_relay_concurrency: 2,
  support_daily_call_cap: 500,
  support_limit_anon_msgs_10m: 20,
  support_limit_anon_msgs_24h: 100,
  support_limit_anon_sessions_1h: 5,
  support_limit_session_msgs: 40,
  support_limit_msg_chars: 2000,
  support_limit_account_msgs_10m: 60,
  support_limit_account_msgs_24h: 300,
  support_queue_depth: 10,
  support_lock_after_injections: 3,
  support_ip_cooldown_minutes: 60,
  support_retention_policy: "keep",
  support_retention_ratified_by: null
});

let database: TestDatabase;

function supportPoolFactory(): SupportPoolFactory {
  const factory = (databaseApi as unknown as { createSupportControlPlanePool?: unknown })
    .createSupportControlPlanePool;
  expect(factory).toBeTypeOf("function");
  return factory as SupportPoolFactory;
}

function internalOptions(pool: Pool): Readonly<Record<string, unknown>> {
  return (pool as unknown as { options: Readonly<Record<string, unknown>> }).options;
}

async function elapsedRejection(operation: Promise<unknown>): Promise<Readonly<{
  elapsedMs: number;
  error: unknown;
}>> {
  const startedAt = performance.now();
  try {
    await operation;
    throw new Error("EXPECTED_REJECTION");
  } catch (error) {
    if (error instanceof Error && error.message === "EXPECTED_REJECTION") throw error;
    return Object.freeze({ elapsedMs: performance.now() - startedAt, error });
  }
}

beforeAll(async () => {
  database = await startTestDatabase();
  await databaseApi.migrate(database.pool);
  const sourceRef = "fixture:support-control-plane";
  const rows = SUPPORT_CONFIGURATION_KEYS.map((key) =>
    registerFixtureRow(key, SUPPORT_VALUES[key], sourceRef));
  await importHistoricalRegisterFixture(database.pool, 4, rows);
  await createPostgresRegisterPublicationPort(database.pool).publishSupport({
    publicationId: randomUUID(),
    baseRegisterVersion: parseRegisterVersionText("4"),
    expectedSupportRegisterVersion: null,
    schemaVersion: 1,
    patch: Object.freeze(rows
      .filter((row) => row.rowKey === "support_enabled")
      .map((row) => Object.freeze({
        key: row.rowKey as SupportConfigurationKey,
        valueJsonText: row.valueJsonText
      }))),
    sourceRef
  });
}, 120_000);

afterAll(async () => {
  if (database !== undefined) await database.stop();
});

describe("isolated support control-plane pool", () => {
  it("is a separate max-two pool with exact acquisition, connection, statement, and query bounds", async () => {
    const ordinary = databaseApi.createPool(database.connectionString);
    const control = supportPoolFactory()(database.connectionString);
    try {
      expect(control).not.toBe(ordinary);
      expect(internalOptions(control)).toMatchObject({
        max: 2,
        connectionTimeoutMillis: 200,
        statement_timeout: 500,
        query_timeout: 750
      });
      expect(internalOptions(ordinary)).toMatchObject({
        max: 10
      });
      expect(internalOptions(ordinary).connectionTimeoutMillis).toBeUndefined();
      expect(internalOptions(ordinary).statement_timeout).toBeUndefined();
      expect(internalOptions(ordinary).query_timeout).toBeUndefined();
    } finally {
      await control.end();
      await ordinary.end();
    }
  });

  it("refreshes through its isolated pool while every ordinary-pool client is occupied", async () => {
    const ordinary = databaseApi.createPool(database.connectionString);
    const control = supportPoolFactory()(database.connectionString);
    const held: PoolClient[] = [];
    const port = createSupportConfigurationPort(control);
    try {
      const ordinaryMaximum = internalOptions(ordinary).max;
      expect(ordinaryMaximum).toBe(10);
      if (typeof ordinaryMaximum !== "number") throw new TypeError("ORDINARY_POOL_MAX_INVALID");
      for (let index = 0; index < ordinaryMaximum; index += 1) {
        held.push(await ordinary.connect());
      }
      await expect(port.current()).resolves.toMatchObject({
        kind: "AVAILABLE",
        snapshot: { values: { supportEnabled: true } }
      });
    } finally {
      for (const client of held) client.release();
      await port.close();
      await ordinary.end();
    }
  });

  it("fails closed when both control clients are occupied and leaves no acquisition waiter", async () => {
    const control = supportPoolFactory()(database.connectionString);
    const first = await control.connect();
    const second = await control.connect();
    const port = createSupportConfigurationPort(control);
    try {
      const result = await Promise.race([
        port.current(),
        new Promise<never>((_, reject) => setTimeout(
          () => reject(new Error("CONTROL_ACQUIRE_DID_NOT_SETTLE")),
          1_000
        ))
      ]);
      expect(result).toEqual({ kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID" });
      expect((control as unknown as { waitingCount: number }).waitingCount).toBe(0);
    } finally {
      first.release();
      second.release();
      await port.close();
    }
  });

  it("enforces the 200ms acquisition deadline on a real exhausted control pool", async () => {
    const control = supportPoolFactory()(database.connectionString);
    const first = await control.connect();
    const second = await control.connect();
    try {
      const outcome = await elapsedRejection(control.connect());
      expect(outcome.elapsedMs).toBeGreaterThanOrEqual(150);
      expect(outcome.elapsedMs).toBeLessThan(800);
      expect(String(outcome.error)).toMatch(/timeout exceeded when trying to connect/iu);
      expect((control as unknown as { waitingCount: number }).waitingCount).toBe(0);
    } finally {
      first.release();
      second.release();
      await control.end();
    }
  });

  it("enforces the 200ms connection deadline against a server that accepts but never speaks PostgreSQL", async () => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    const control = supportPoolFactory()(
      `postgresql://stall:stall@127.0.0.1:${address.port}/stall`
    );
    try {
      const outcome = await elapsedRejection(control.query("SELECT 1"));
      expect(outcome.elapsedMs).toBeGreaterThanOrEqual(150);
      expect(outcome.elapsedMs).toBeLessThan(800);
      expect(String(outcome.error)).toMatch(/connection timeout|timeout expired|timeout exceeded/iu);
    } finally {
      await control.end();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("fails closed at the 1000ms outer deadline while a real pool acquisition is still connecting", async () => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    const connecting = databaseApi.createPool(
      `postgresql://stall:stall@127.0.0.1:${address.port}/stall`
    );
    const port = createSupportConfigurationPort(connecting);
    const startedAt = performance.now();
    try {
      await expect(port.current()).resolves.toEqual({
        kind: "DISABLED", code: "SUPPORT_CONFIG_REFRESH_DEADLINE"
      });
      const elapsedMs = performance.now() - startedAt;
      expect(elapsedMs).toBeGreaterThanOrEqual(900);
      expect(elapsedMs).toBeLessThan(1_600);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await port.close();
    }
  });

  it("cancels a real slow statement at the 500ms server deadline", async () => {
    const control = supportPoolFactory()(database.connectionString);
    try {
      const outcome = await elapsedRejection(control.query("SELECT pg_sleep(2)"));
      expect(outcome.elapsedMs).toBeGreaterThanOrEqual(400);
      expect(outcome.elapsedMs).toBeLessThan(1_200);
      expect(String(outcome.error)).toMatch(/statement timeout|canceling statement/iu);
    } finally {
      await control.end();
    }
  });

  it("cancels a real transferred query at the 750ms client deadline when the server bound is disabled", async () => {
    const control = supportPoolFactory()(database.connectionString);
    const client = await control.connect();
    try {
      await client.query("SET statement_timeout=0");
      const outcome = await elapsedRejection(client.query("SELECT pg_sleep(2)"));
      expect(outcome.elapsedMs).toBeGreaterThanOrEqual(650);
      expect(outcome.elapsedMs).toBeLessThan(1_400);
      expect(String(outcome.error)).toMatch(/query read timeout/iu);
    } finally {
      client.release(true);
      await control.end();
    }
  });
});
