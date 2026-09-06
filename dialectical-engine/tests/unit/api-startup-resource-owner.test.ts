import { EventEmitter } from "node:events";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StartupResourceCleanupError,
  installStartupResourceOwner
} from "../../apps/api/src/startup-resource-owner.js";

class FakeProcess extends EventEmitter {
  exitCode: number | undefined;
  exit(): never {
    throw new Error("FAKE_PROCESS_EXIT");
  }
}

function harness(failingPoolIndex?: number) {
  const api = Fastify({ logger: false });
  const process = new FakeProcess();
  const registration = {
    drainRegistrationAdmissions: vi.fn(async () => undefined),
    drainMailDispatches: vi.fn(async () => undefined),
    drainMailCapacitySignals: vi.fn(() => undefined),
    drainRateLimitAuditFlushes: vi.fn(async () => undefined)
  };
  const auditContextHasher = { close: vi.fn(() => undefined) };
  const argon2Pool = { close: vi.fn(async () => undefined) };
  const databasePools = Array.from({ length: 10 }, (_, index) => ({
    end: vi.fn(async () => {
      if (index === failingPoolIndex) throw new Error(`pool-${index}-close-failure`);
    })
  }));
  const timer = setInterval(() => undefined, 1_000);
  api.addHook("onClose", async () => clearInterval(timer));
  const owner = installStartupResourceOwner({
    api,
    registration,
    auditContextHasher,
    argon2Pool,
    databasePools,
    process,
    logger: { error: vi.fn() }
  });
  return { api, process, registration, auditContextHasher, argon2Pool, databasePools, owner };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("API pre-listen startup resource ownership", () => {
  it("preserves an attestation failure after closing the full graph exactly once", async () => {
    vi.useFakeTimers();
    const flow = harness();
    const primary = new Error("support-attestation-rejected");

    const failure = await flow.owner.run("support-attestation", async () => {
      throw primary;
    }).catch((error: unknown) => error);

    expect(failure).toBe(primary);
    expect(flow.registration.drainRegistrationAdmissions).toHaveBeenCalledTimes(1);
    expect(flow.registration.drainMailDispatches).toHaveBeenCalledTimes(1);
    expect(flow.registration.drainMailCapacitySignals).toHaveBeenCalledTimes(1);
    expect(flow.registration.drainRateLimitAuditFlushes).toHaveBeenCalledTimes(1);
    expect(flow.auditContextHasher.close).toHaveBeenCalledTimes(1);
    expect(flow.argon2Pool.close).toHaveBeenCalledTimes(1);
    expect(flow.databasePools.every(({ end }) => end.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    await flow.owner.close("controller-after-attestation-failure");
    expect(flow.databasePools.every(({ end }) => end.mock.calls.length === 1)).toBe(true);
  });

  it("uses the same owner for listen failure and attempts later pools after a close failure", async () => {
    const flow = harness(3);
    const primary = new Error("listen-rejected");

    const failure = await flow.owner.run("listen", async () => {
      throw primary;
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(StartupResourceCleanupError);
    expect(failure).toMatchObject({ cause: primary });
    expect((failure as StartupResourceCleanupError).cleanupFailure)
      .toMatchObject({ code: "API_SHUTDOWN_FAILED" });
    expect(flow.databasePools.every(({ end }) => end.mock.calls.length === 1)).toBe(true);
  });

  it("coalesces signal and controller shutdown through the installed graceful owner", async () => {
    const flow = harness();

    flow.process.emit("SIGTERM", "SIGTERM");
    await flow.owner.close("controller");
    await flow.owner.close("controller-again");

    expect(flow.registration.drainRegistrationAdmissions).toHaveBeenCalledTimes(1);
    expect(flow.argon2Pool.close).toHaveBeenCalledTimes(1);
    expect(flow.databasePools.every(({ end }) => end.mock.calls.length === 1)).toBe(true);
    expect(flow.process.listenerCount("SIGTERM")).toBe(0);
    expect(flow.process.listenerCount("SIGINT")).toBe(0);
  });
});
