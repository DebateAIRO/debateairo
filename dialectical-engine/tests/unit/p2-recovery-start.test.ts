import { TEST_APP_ORIGIN } from "../support/httpSession.js";
import { normalizeEmailForBlindIndex } from "@debateai/crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import {
  RECOVERY_START_PUBLIC_RESPONSE,
  RecoveryStartService,
  type RecoveryApplication
} from "../../apps/api/src/recovery.js";
import type { RecoveryMailDispatchPort } from "../../apps/api/src/registration.js";
import { PostgresRecoveryStartRepository } from "../../packages/db/src/recovery.js";

const source = Object.freeze({
  ip: "203.0.113.20",
  userAgent: "recovery-test",
  requestId: "recovery-request"
});

// The production dispatch runs the prepare closure, then the mail work it returns.
const mailDispatch: RecoveryMailDispatchPort = {
  async dispatchRecoveryMail(prepare) { const work = await prepare(); await work?.(); }
};

// NV-18 (security audit run 3): the generic start creates no P2 recovery binding; its only work is the consumer
// recovery preparation, behind the same enumeration floor and generic response.
describe("P2-04 enumeration-resistant recovery start", () => {
  it("returns the same typed response at the same floor for present and absent identities", async () => {
    let now = 0;
    const calls: Array<Readonly<{ input: Readonly<{ email: string }>; source: unknown }>> = [];
    const service = new RecoveryStartService({
      async consumerPrepare(input, received) {
        calls.push({ input, source: received });
        now += input.email === "present@example.test" ? 47 : 9;
        return null;
      },
      mailDispatch,
      enumerationFloorMs: 600,
      publicResponsePolicy: "ENUMERATION_RESISTANT_GENERIC",
      monotonicNow: () => now,
      sleep: async (milliseconds) => { now += milliseconds; }
    });

    const presentStartedAt = now;
    await expect(service.start({ email: " Present@example.test " }, source))
      .resolves.toEqual(RECOVERY_START_PUBLIC_RESPONSE);
    const presentElapsed = now - presentStartedAt;
    const absentStartedAt = now;
    await expect(service.start({ email: "absent@example.test" }, source))
      .resolves.toEqual(RECOVERY_START_PUBLIC_RESPONSE);
    const absentElapsed = now - absentStartedAt;

    expect(presentElapsed).toBe(600);
    expect(absentElapsed).toBe(600);
    expect(calls).toEqual([
      { input: { email: normalizeEmailForBlindIndex(" Present@example.test ") }, source },
      { input: { email: "absent@example.test" }, source }
    ]);
    for (const call of calls) expect(Object.keys(call.input)).toEqual(["email"]);
  });

  it("holds the same response floor before surfacing an infrastructure failure", async () => {
    let now = 0;
    const service = new RecoveryStartService({
      async consumerPrepare() {
        now += 25;
        throw new Error("DATABASE_UNAVAILABLE");
      },
      mailDispatch,
      enumerationFloorMs: 600,
      publicResponsePolicy: "ENUMERATION_RESISTANT_GENERIC",
      monotonicNow: () => now,
      sleep: async (milliseconds) => { now += milliseconds; }
    });

    await expect(service.start({ email: "person@example.test" }, source))
      .rejects.toThrow("DATABASE_UNAVAILABLE");
    expect(now).toBe(600);
  });

  it("composed without consumer dispatch, start does no work and still answers the generic response at the floor", async () => {
    let now = 0;
    const service = new RecoveryStartService({
      enumerationFloorMs: 600,
      publicResponsePolicy: "ENUMERATION_RESISTANT_GENERIC",
      monotonicNow: () => now,
      sleep: async (milliseconds) => { now += milliseconds; }
    });

    await expect(service.start({ email: "person@example.test" }, source))
      .resolves.toEqual(RECOVERY_START_PUBLIC_RESPONSE);
    expect(now).toBe(600);
    await expect(service.start({ email: "not an address" }, source)).rejects.toThrow("AUTH_INPUT_INVALID");
    expect(now).toBe(1200);
  });

  it("publishes only the exact 202 generic response at the public HTTP boundary", async () => {
    const inputs: string[] = [];
    const recovery: RecoveryApplication = {
      async start(input) {
        inputs.push(input.email);
        return RECOVERY_START_PUBLIC_RESPONSE;
      }
    };
    const api = buildApi({ allowedOrigin: TEST_APP_ORIGIN, application: {} as AskApplication, recovery });
    try {
      const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN },
        method: "POST",
        url: "/v1/auth/recovery/start",
        payload: { email: "person@example.test", ignored: "must-not-flow" }
      });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual(RECOVERY_START_PUBLIC_RESPONSE);
      expect(inputs).toEqual(["person@example.test"]);
    } finally {
      await api.close();
    }
  });
});

// NV-18: the maintenance pass closes recovery bindings left open past one hour, in rounds of at most `limit`, each round
// its own short transaction with a bounded lock wait (identity.expire_stale_account_recovery_bindings, 0125).
describe("PostgresRecoveryStartRepository.expireStaleBindings", () => {
  const SWEEP = "SELECT identity.expire_stale_account_recovery_bindings($1) AS expired";
  function pool(results: readonly unknown[]) {
    const calls: { sql: string; args?: unknown[] }[] = [];
    let round = 0, released = 0;
    const client = {
      query: vi.fn(async (sql: string, args?: unknown[]) => {
        calls.push(args === undefined ? { sql } : { sql, args });
        return sql === SWEEP ? { rows: [{ expired: results[Math.min(round++, results.length - 1)] }] } : { rows: [] };
      }),
      release: vi.fn(() => { released++; })
    };
    const connect = vi.fn(async () => client);
    return { calls, connect, released: () => released,
      repository: new PostgresRecoveryStartRepository({ connect } as never, {} as never, {} as never) };
  }
  const round = (limit: number) => [
    { sql: "BEGIN" }, { sql: "SET LOCAL lock_timeout = '10s'" }, { sql: SWEEP, args: [limit] }, { sql: "COMMIT" }
  ];

  it("runs rounds until a short one and returns the total", async () => {
    const p = pool([100, 100, 3]);
    await expect(p.repository.expireStaleBindings(100, 10)).resolves.toBe(203);
    expect(p.calls).toEqual([...round(100), ...round(100), ...round(100)]);
    expect(p.connect).toHaveBeenCalledTimes(3);
    expect(p.released()).toBe(3);
  });

  it("stops after the round cap", async () => {
    const p = pool([100]);
    await expect(p.repository.expireStaleBindings(100, 10)).resolves.toBe(1000);
    expect(p.calls.filter((call) => call.sql === SWEEP)).toHaveLength(10);
    expect(p.released()).toBe(10);
  });

  it.each([[0, 10], [1001, 10], [1.5, 10], [100, 0], [100, 11]])(
    "refuses the batch (%s, %s) before any query", async (limit, rounds) => {
      const p = pool([0]);
      await expect(p.repository.expireStaleBindings(limit, rounds)).rejects.toThrow("RECOVERY_BINDING_BATCH_INVALID");
      expect(p.connect).not.toHaveBeenCalled();
    });

  it.each([[-1], [null], ["3"], [101]])("refuses a round result of %j and rolls that round back", async (value) => {
    const p = pool([value]);
    await expect(p.repository.expireStaleBindings(100, 10)).rejects.toThrow("RECOVERY_BINDING_EXPIRY_OUTCOME_INVALID");
    expect(p.calls).toEqual([...round(100).slice(0, 3), { sql: "ROLLBACK" }]);
    expect(p.released()).toBe(1);
  });
});
