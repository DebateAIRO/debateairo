import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { TypedDomainError } from "../../packages/kernel/src/index.js";
import { createPool, isDatabasePoolBusy } from "../../packages/db/src/index.js";
import type { RegistrationApplication } from "../../apps/api/src/registration.js";
import { TEST_APP_ORIGIN } from "../support/httpSession.js";
import { canonicalSignup, passedTurnstile } from "../support/turnstileFixtures.js";

/**
 * Pre-launch connection budget (2026-10-10). Every API and runner pool now has a
 * bounded wait for a connection. When the wait runs out the caller gets a typed
 * failure that is marked BUSY — retryable — and the pool itself stays usable: a
 * timeout is not the idle-client error that latches a pool for good
 * (tests/integration/pol03-pool-resilience.test.ts). The API answers a busy
 * failure with one constant 503 and a Retry-After, never the generic 500.
 *
 * No Postgres is needed: a TCP server that accepts and never answers is a
 * database that never hands out a connection.
 */

const servers: Server[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const socket of sockets.splice(0)) socket.destroy();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function silentDatabaseUrl(): Promise<string> {
  const server = createServer((socket) => { sockets.push(socket); });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new TypeError("TEST_SERVER_ADDRESS");
  return `postgresql://nobody@127.0.0.1:${address.port}/none`;
}

async function refusedDatabaseUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new TypeError("TEST_SERVER_ADDRESS");
  await new Promise((resolve) => server.close(resolve));
  return `postgresql://nobody@127.0.0.1:${address.port}/none`;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new TypeError("EXPECTED_REJECTION");
}

async function busyFailure(): Promise<unknown> {
  const pool = createPool(await silentDatabaseUrl(), { max: 1, connectionTimeoutMillis: 100, name: "test:busy" });
  try {
    return await rejection(pool.query("SELECT 1"));
  } finally {
    await pool.end().catch(() => undefined);
  }
}

describe("a starved pool fails fast, retryably, and stays usable", () => {
  it("gives up after its wait limit, both for the caller opening a connection and the one queued behind it", async () => {
    const pool = createPool(await silentDatabaseUrl(), { max: 1, connectionTimeoutMillis: 150, name: "test:busy" });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const started = performance.now();
      // The first caller opens the only connection; the second waits in the
      // pool's own line because the pool is full.
      const [opening, queued] = await Promise.all([rejection(pool.connect()), rejection(pool.query("SELECT 1"))]);
      expect(performance.now() - started).toBeLessThan(2_000);
      for (const failure of [opening, queued]) {
        expect(failure).toBeInstanceOf(TypedDomainError);
        expect((failure as TypedDomainError).code).toBe("DATABASE_POOL_FAILED");
        expect(isDatabasePoolBusy(failure)).toBe(true);
      }
      // A busy pool is not a broken pool: the next caller is not refused on the
      // spot with a remembered failure, it waits its own bounded turn again.
      const again = performance.now();
      const next = await rejection(pool.query("SELECT 1"));
      expect(performance.now() - again).toBeGreaterThanOrEqual(100);
      expect(next).not.toBe(opening);
      expect(next).not.toBe(queued);
      expect(isDatabasePoolBusy(next)).toBe(true);
      // One line names the starved pool for the operator; the burst behind it
      // is counted, not printed line by line.
      const busyLines = logged.mock.calls.map((call) => String(call[0]))
        .filter((line) => line.startsWith("[DATABASE_POOL_BUSY]"));
      expect(busyLines).toHaveLength(1);
      expect(busyLines[0]).toContain("pool=test:busy");
      expect(busyLines[0]).toContain("max=1");
    } finally {
      await pool.end().catch(() => undefined);
    }
  });

  it("keeps a refused connection a plain pool failure, not a busy one", async () => {
    const pool = createPool(await refusedDatabaseUrl(), { max: 1, connectionTimeoutMillis: 1_000, name: "test:refused" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const failure = await rejection(pool.query("SELECT 1"));
      expect((failure as TypedDomainError).code).toBe("DATABASE_POOL_FAILED");
      expect(isDatabasePoolBusy(failure)).toBe(false);
    } finally {
      await pool.end().catch(() => undefined);
    }
  });

  it("recognises a busy failure only by its origin, also when another error wraps it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const busy = await busyFailure();
    expect(isDatabasePoolBusy(new Error("RUN_READ_FAILED", { cause: busy }))).toBe(true);
    // The same words written by anyone else are not a busy pool.
    expect(isDatabasePoolBusy(new TypedDomainError(
      "DATABASE_POOL_FAILED", "PostgreSQL pool operation failed: timeout exceeded when trying to connect"
    ))).toBe(false);
    expect(isDatabasePoolBusy(new Error("timeout exceeded when trying to connect"))).toBe(false);
    expect(isDatabasePoolBusy(undefined)).toBe(false);
  });

  it("names a pool's connections so the database can say which pool holds them", () => {
    const pool = createPool("postgresql://nobody@localhost/none", { name: "api:runtime" });
    expect((pool as unknown as { options: { application_name?: string } }).options.application_name)
      .toBe("api:runtime");
    for (const name of ["", "API:runtime", "api runtime", "a".repeat(49), "api;drop"]) {
      expect(() => createPool("postgresql://nobody@localhost/none", { name }), name)
        .toThrow("DATABASE_POOL_NAME_INVALID");
    }
  });
});

describe("the API answers a busy database with one retryable 503", () => {
  function failingRegistration(error: unknown): RegistrationApplication {
    return {
      register: async () => { throw error; },
      verifyEmail: async () => { throw error; },
      resendVerification: async () => { throw error; }
    } as RegistrationApplication;
  }

  async function register(error: unknown) {
    const api = buildApi({
      allowedOrigin: TEST_APP_ORIGIN,
      application: {} as AskApplication,
      turnstile: passedTurnstile,
      registration: failingRegistration(error)
    });
    try {
      return await api.inject({
        headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register",
        payload: { ...canonicalSignup, password: "correct horse battery staple" }
      });
    } finally {
      await api.close();
    }
  }

  it("says SERVICE_BUSY with Retry-After, and nothing about the database", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await register(await busyFailure());
    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe("2");
    expect(response.json()).toEqual({ error: "SERVICE_BUSY", message: "SERVICE_BUSY" });
    expect(response.body).not.toMatch(/DATABASE|PostgreSQL|timeout|INTERNAL_ERROR/u);
  });

  it("leaves every other database failure on the generic 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await register(new TypedDomainError(
      "DATABASE_POOL_FAILED", "PostgreSQL pool operation failed: timeout exceeded when trying to connect"
    ));
    expect(response.statusCode).toBe(500);
    expect(response.headers["retry-after"]).toBeUndefined();
    expect(response.json()).toEqual({ error: "INTERNAL_ERROR", message: "INTERNAL_ERROR" });
  });
});
