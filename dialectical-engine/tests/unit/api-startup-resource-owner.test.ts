import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
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

function harness(failingPoolIndex?: number, supportCloseFailure = false) {
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
  const ordinaryDatabasePools = Array.from({ length: 10 }, (_, index) => ({
    end: vi.fn(async () => {
      if (index === failingPoolIndex) throw new Error(`pool-${index}-close-failure`);
    })
  }));
  const supportKeys = {
    close: vi.fn(async () => {
      if (supportCloseFailure) throw new Error("support-key-close-failure");
    })
  };
  const supportKeyAdapter = { end: vi.fn(() => supportKeys.close()) };
  const databasePools = [
    ...ordinaryDatabasePools.slice(0, 5),
    supportKeyAdapter,
    ...ordinaryDatabasePools.slice(5)
  ];
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
  return {
    api,
    process,
    registration,
    auditContextHasher,
    argon2Pool,
    ordinaryDatabasePools,
    supportKeys,
    databasePools,
    owner
  };
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
    expect(flow.supportKeys.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    await flow.owner.close("controller-after-attestation-failure");
    expect(flow.databasePools.every(({ end }) => end.mock.calls.length === 1)).toBe(true);
    expect(flow.supportKeys.close).toHaveBeenCalledTimes(1);
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
    expect(flow.supportKeys.close).toHaveBeenCalledTimes(1);
  });

  it("coalesces signal and controller shutdown through the installed graceful owner", async () => {
    const flow = harness();

    flow.process.emit("SIGTERM", "SIGTERM");
    await flow.owner.close("controller");
    await flow.owner.close("controller-again");

    expect(flow.registration.drainRegistrationAdmissions).toHaveBeenCalledTimes(1);
    expect(flow.argon2Pool.close).toHaveBeenCalledTimes(1);
    expect(flow.databasePools.every(({ end }) => end.mock.calls.length === 1)).toBe(true);
    expect(flow.supportKeys.close).toHaveBeenCalledTimes(1);
    expect(flow.process.listenerCount("SIGTERM")).toBe(0);
    expect(flow.process.listenerCount("SIGINT")).toBe(0);
  });

  it("attempts every later database close after the support key adapter fails", async () => {
    const flow = harness(undefined, true);

    await expect(flow.owner.run("support-attestation", async () => {
      throw new Error("attestation-failure");
    })).rejects.toBeInstanceOf(StartupResourceCleanupError);

    expect(flow.supportKeys.close).toHaveBeenCalledTimes(1);
    expect(flow.ordinaryDatabasePools.every(({ end }) => end.mock.calls.length === 1)).toBe(true);
  });
});

describe("apps/api main.ts shutdown list", () => {
  const main = readFileSync(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
  const list = main.slice(
    main.indexOf("databasePools: [", main.indexOf("installStartupResourceOwner({")),
    main.indexOf("kekHandles: [", main.indexOf("installStartupResourceOwner({"))
  );
  // Every pool the boot ledger holds is handed to the shutdown lifecycle at boot.release(), which forgets the ledger's list:
  // a pool missing here is never closed, and its idle connections keep the process alive after SIGTERM (2026-11-08).
  const heldPools = [...main.matchAll(/const (\w+)\s*=[^;]*?boot\.hold\(createPool\(/gu)].map((match) => match[1]!);
  const at = (entry: string) => {
    const index = list.indexOf(entry);
    expect(index, entry).toBeGreaterThan(-1);
    return index;
  };
  // Where a pool is closed: its own line ("    name,") or a guarded spread ("[name]"), never a mention in a comment or guard.
  const closedAt = (name: string) => {
    const index = Math.max(list.indexOf(`\n    ${name},`), list.indexOf(`[${name}]`));
    expect(index, name).toBeGreaterThan(-1);
    return index;
  };

  it("closes every pool the boot ledger holds", () => {
    expect(list.length).toBeGreaterThan(0);
    expect(heldPools).toEqual(expect.arrayContaining(["pool", "systemPool", "authorizationSystemPool", "supportPool"]));
    for (const name of heldPools) closedAt(name);
  });

  it("closes the system pools after every pool that routes to them, and before the keys are closed or zeroed", () => {
    for (const [user, target] of [...main.matchAll(/setCrossAccountTarget\((\w+), (\w+)\);/gu)].map((match) => [match[1]!, match[2]!] as const)) {
      expect(closedAt(target), `${user} -> ${target}`).toBeGreaterThan(closedAt(user));
    }
    for (const name of ["systemPool", "authorizationSystemPool"]) {
      expect(closedAt(name), name).toBeLessThan(at("supportKeys.close()"));
      expect(closedAt(name), name).toBeLessThan(at("recordsKey.fill(0)"));
    }
  });
});
