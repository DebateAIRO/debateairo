import { EventEmitter } from "node:events";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  GracefulShutdownError,
  installGracefulShutdown,
  type GracefulShutdownRegistration
} from "../../apps/api/src/graceful-shutdown.js";

function deferred<T = void>(): Readonly<{
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return Object.freeze({ promise, resolve, reject });
}

class FakeProcess extends EventEmitter {
  exitCode: number | undefined;
  readonly exitCalls: number[] = [];

  exit(code: number): never {
    this.exitCalls.push(code);
    throw new Error("FAKE_PROCESS_EXIT");
  }
}

function harness(
  overrides: Partial<GracefulShutdownRegistration> = {},
  bounds: Readonly<{ deadlineMs?: number; escalationGraceMs?: number }> = {}
) {
  const order: string[] = [];
  const api = Fastify({ logger: false });
  const registration: GracefulShutdownRegistration = {
    drainRegistrationAdmissions: vi.fn(async () => { order.push("admissions"); }),
    drainMailDispatches: vi.fn(async () => { order.push("mail"); }),
    drainMailCapacitySignals: vi.fn(() => { order.push("mail-capacity-signals"); }),
    drainRateLimitAuditFlushes: vi.fn(async () => { order.push("refusal-audit"); }),
    ...overrides
  };
  const auditContextHasher = {
    close: vi.fn(() => { order.push("audit-context-hasher"); })
  };
  const argon2Pool = {
    close: vi.fn(async () => { order.push("argon2-pool"); })
  };
  const primaryDatabase = {
    end: vi.fn(async () => { order.push("primary-database"); })
  };
  const evaluatorDatabase = {
    end: vi.fn(async () => { order.push("evaluator-database"); })
  };
  const process = new FakeProcess();
  const logger = { error: vi.fn() };
  const shutdown = installGracefulShutdown({
    api,
    registration,
    auditContextHasher,
    argon2Pool,
    databasePools: [primaryDatabase, evaluatorDatabase],
    process,
    logger,
    ...bounds
  });
  return {
    api,
    order,
    registration,
    auditContextHasher,
    argon2Pool,
    primaryDatabase,
    evaluatorDatabase,
    process,
    logger,
    shutdown
  };
}

describe("T3 graceful shutdown", () => {
  it("closes admission, joins mail, force-finalizes refusal audit, then destroys secrets, workers, and DB handles in exact order", async () => {
    const flow = harness();

    await flow.api.close();

    expect(flow.order).toEqual([
      "admissions",
      "mail",
      "mail-capacity-signals",
      "refusal-audit",
      "audit-context-hasher",
      "argon2-pool",
      "primary-database",
      "evaluator-database"
    ]);
    expect(flow.process.listenerCount("SIGTERM")).toBe(0);
    expect(flow.process.listenerCount("SIGINT")).toBe(0);
  });

  it("does not pass an in-flight mail send or reservation hold", async () => {
    const mail = deferred();
    const flow = harness();
    flow.registration.drainMailDispatches = vi.fn(async () => {
      flow.order.push("mail:start");
      await mail.promise;
      flow.order.push("mail:end");
    });

    const closing = flow.api.close();
    await vi.waitFor(() => expect(flow.order).toEqual(["admissions", "mail:start"]));
    expect(flow.registration.drainRateLimitAuditFlushes).not.toHaveBeenCalled();
    expect(flow.auditContextHasher.close).not.toHaveBeenCalled();

    mail.resolve();
    await closing;
    expect(flow.order.indexOf("mail:end")).toBeLessThan(flow.order.indexOf("refusal-audit"));
  });

  it("refuses new HTTP work as soon as close begins", async () => {
    const admissions = deferred();
    const flow = harness();
    flow.api.get("/new-work", async () => ({ accepted: true }));
    flow.registration.drainRegistrationAdmissions = vi.fn(async () => {
      flow.order.push("admissions:start");
      await admissions.promise;
    });

    await flow.api.listen({ host: "127.0.0.1", port: 0 });
    const address = flow.api.server.address();
    if (address === null || typeof address === "string") throw new Error("TEST_LISTEN_FAILED");
    const closing = flow.api.close();
    await vi.waitFor(() => expect(flow.order).toEqual(["admissions:start"]));
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/new-work`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "Service Unavailable",
        message: "Service Unavailable",
        statusCode: 503
      });
    } finally {
      admissions.resolve();
      await closing;
    }
  });

  it("waits for the durable refusal write instead of awaiting its unref timer", async () => {
    const durableWrite = deferred();
    const flow = harness();
    flow.registration.drainRateLimitAuditFlushes = vi.fn(async () => {
      flow.order.push("refusal-audit:force-finalize");
      await durableWrite.promise;
      flow.order.push("refusal-audit:durable");
    });

    const closing = flow.api.close();
    await vi.waitFor(() => expect(flow.order).toContain("refusal-audit:force-finalize"));
    expect(flow.auditContextHasher.close).not.toHaveBeenCalled();
    expect(flow.argon2Pool.close).not.toHaveBeenCalled();
    expect(flow.primaryDatabase.end).not.toHaveBeenCalled();

    durableWrite.resolve();
    await closing;
    expect(flow.order.indexOf("refusal-audit:durable"))
      .toBeLessThan(flow.order.indexOf("audit-context-hasher"));
  });

  it("coalesces repeated SIGTERM, SIGINT, controller close, and api.close into one teardown", async () => {
    const admissions = deferred();
    const flow = harness();
    flow.registration.drainRegistrationAdmissions = vi.fn(async () => {
      flow.order.push("admissions:start");
      await admissions.promise;
      flow.order.push("admissions:end");
    });

    flow.process.emit("SIGTERM", "SIGTERM");
    flow.process.emit("SIGINT", "SIGINT");
    const controllerClose = flow.shutdown.close("api.close");
    const directClose = flow.api.close();
    await vi.waitFor(() => expect(flow.order).toEqual(["admissions:start"]));

    admissions.resolve();
    await Promise.all([controllerClose, directClose]);
    expect(flow.registration.drainRegistrationAdmissions).toHaveBeenCalledTimes(1);
    expect(flow.registration.drainMailDispatches).toHaveBeenCalledTimes(1);
    expect(flow.registration.drainRateLimitAuditFlushes).toHaveBeenCalledTimes(1);
    expect(flow.argon2Pool.close).toHaveBeenCalledTimes(1);
    expect(flow.primaryDatabase.end).toHaveBeenCalledTimes(1);
    expect(flow.logger.error).not.toHaveBeenCalled();
  });

  it("retries a failed durable audit drain independently of Fastify close", async () => {
    const secret = "postgres://operator:do-not-log@db/accounts";
    const flow = harness();
    flow.registration.drainRateLimitAuditFlushes = vi.fn()
      .mockImplementationOnce(async () => {
        flow.order.push("refusal-audit:failed");
        throw new Error(secret);
      })
      .mockImplementationOnce(async () => {
        flow.order.push("refusal-audit:durable");
      });

    await expect(flow.shutdown.close("api.close:first")).rejects.toEqual(expect.objectContaining({
      name: "GracefulShutdownError",
      code: "API_SHUTDOWN_FAILED",
      message: "API_SHUTDOWN_FAILED"
    }));
    expect(flow.auditContextHasher.close).not.toHaveBeenCalled();
    expect(flow.process.listenerCount("SIGTERM")).toBe(1);

    await expect(flow.shutdown.close("api.close:retry")).resolves.toBeUndefined();

    expect(flow.registration.drainRateLimitAuditFlushes).toHaveBeenCalledTimes(2);
    expect(flow.auditContextHasher.close).toHaveBeenCalledTimes(1);
    expect(flow.argon2Pool.close).toHaveBeenCalledTimes(1);
    expect(flow.primaryDatabase.end).toHaveBeenCalledTimes(1);
    expect(flow.evaluatorDatabase.end).toHaveBeenCalledTimes(1);
    expect(flow.process.listenerCount("SIGTERM")).toBe(0);
    expect(flow.process.listenerCount("SIGINT")).toBe(0);
    expect(flow.process.exitCode).toBe(1);
    const logged = JSON.stringify(flow.logger.error.mock.calls);
    expect(logged).toContain("API_SHUTDOWN_FAILED");
    expect(logged).not.toContain(secret);
  });

  it("does not swallow a repeated signal when the durable audit drain keeps failing", async () => {
    const flow = harness();
    flow.registration.drainRateLimitAuditFlushes = vi.fn(async () => {
      flow.order.push("refusal-audit");
      throw new Error("secret audit storage failure");
    });

    flow.process.emit("SIGTERM", "SIGTERM");
    await vi.waitFor(() => {
      expect(flow.registration.drainRateLimitAuditFlushes).toHaveBeenCalledTimes(1);
    });
    expect(flow.process.exitCalls).toEqual([]);

    expect(() => flow.process.emit("SIGINT", "SIGINT")).not.toThrow();
    await vi.waitFor(() => {
      expect(flow.registration.drainRateLimitAuditFlushes).toHaveBeenCalledTimes(2);
      expect(flow.process.exitCalls).toEqual([1]);
    });
    flow.process.emit("SIGTERM", "SIGTERM");
    await vi.waitFor(() => {
      expect(flow.registration.drainRateLimitAuditFlushes).toHaveBeenCalledTimes(3);
    });
    expect(flow.process.exitCalls).toEqual([1]);
    expect(flow.process.listenerCount("SIGTERM")).toBe(1);
    expect(flow.process.listenerCount("SIGINT")).toBe(1);
  });

  it("force-closes and exits 1 with one structured line when the drain passes the deadline (L7-F6)", async () => {
    const flow = harness(
      { drainRateLimitAuditFlushes: vi.fn(() => new Promise<void>(() => undefined)) },
      { deadlineMs: 60 }
    );

    void flow.shutdown.close("api.close").catch(() => undefined);
    await vi.waitFor(() => { expect(flow.process.exitCalls).toEqual([1]); }, { timeout: 2_000 });

    expect(flow.process.exitCode).toBe(1);
    expect(flow.logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(flow.logger.error.mock.calls))
      .toContain("API_SHUTDOWN_DEADLINE_EXCEEDED");
  });

  it("escalates immediately when a second signal arrives during an in-progress drain (L7-F6)", async () => {
    const flow = harness(
      { drainRegistrationAdmissions: vi.fn(() => new Promise<void>(() => undefined)) },
      { deadlineMs: 10_000, escalationGraceMs: 0 }
    );

    flow.process.emit("SIGTERM", "SIGTERM");
    await vi.waitFor(() => {
      expect(flow.registration.drainRegistrationAdmissions).toHaveBeenCalledTimes(1);
    });
    expect(flow.process.exitCalls).toEqual([]);

    expect(() => flow.process.emit("SIGINT", "SIGINT")).not.toThrow();
    expect(flow.process.exitCalls).toEqual([1]);
    expect(flow.process.exitCode).toBe(1);
  });

  it("drains on SIGHUP exactly as on SIGTERM (L7-F6)", async () => {
    const flow = harness();
    expect(flow.process.listenerCount("SIGHUP")).toBe(1);

    flow.process.emit("SIGHUP", "SIGHUP");
    await vi.waitFor(() => { expect(flow.order).toContain("evaluator-database"); });

    expect(flow.process.exitCalls).toEqual([]);
    expect(flow.logger.error).not.toHaveBeenCalled();
    expect(flow.process.listenerCount("SIGHUP")).toBe(0);
    expect(flow.process.listenerCount("SIGTERM")).toBe(0);
  });

  it("attempts every DB pool when Argon2 worker closure fails", async () => {
    const flow = harness();
    const argonFailure = new Error("secret worker failure");
    flow.argon2Pool.close.mockImplementationOnce(async () => {
      flow.order.push("argon2-pool:failed");
      throw argonFailure;
    });

    const failure = await flow.shutdown.close("api.close").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GracefulShutdownError);
    expect(failure).toMatchObject({ cause: argonFailure });
    expect(flow.primaryDatabase.end).toHaveBeenCalledTimes(1);
    expect(flow.evaluatorDatabase.end).toHaveBeenCalledTimes(1);
    expect(flow.order.indexOf("argon2-pool:failed"))
      .toBeLessThan(flow.order.indexOf("primary-database"));
    expect(flow.order.indexOf("primary-database"))
      .toBeLessThan(flow.order.indexOf("evaluator-database"));
  });

  it("closes every DB pool even when one pool end fails, then rejects generically", async () => {
    const flow = harness();
    flow.primaryDatabase.end.mockImplementationOnce(async () => {
      flow.order.push("primary-database:failed");
      throw new Error("secret primary DSN");
    });

    await expect(flow.shutdown.close("api.close")).rejects.toBeInstanceOf(GracefulShutdownError);
    expect(flow.evaluatorDatabase.end).toHaveBeenCalledTimes(1);
    expect(flow.order).toContain("evaluator-database");
  });
});
