import { createEmailBlindIndex, normalizeEmailForBlindIndex } from "@debateai/crypto";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import {
  RECOVERY_START_PUBLIC_RESPONSE,
  RecoveryStartService,
  type RecoveryApplication,
  type RecoveryStartRepository
} from "../../apps/api/src/recovery.js";

const source = Object.freeze({
  ip: "203.0.113.20",
  userAgent: "recovery-test",
  requestId: "recovery-request"
});

describe("P2-04 enumeration-resistant recovery start", () => {
  it("returns the same typed response at the same floor for present and absent identities", async () => {
    const blindIndexKey = Buffer.alloc(32, 0x52);
    const presentIndex = createEmailBlindIndex(
      blindIndexKey,
      normalizeEmailForBlindIndex("present@example.test")
    );
    let now = 0;
    const calls: Array<Readonly<Record<string, unknown>>> = [];
    const riskCalls: Array<Readonly<Record<string, unknown>>> = [];
    const publicHandle=randomUUID();
    const repository: RecoveryStartRepository = {
      async start(input) {
        calls.push(input);
        const present = input.emailBlindIndex.equals(presentIndex);
        now += present ? 47 : 9;
        return present
          ? {status:"created" as const,publicHandle}
          : {status:"not_created" as const};
      }
    };
    const service = new RecoveryStartService({
      repository,
      riskSignals:{
        async recordForRecovery(input){riskCalls.push(input);return "recorded" as const;}
      },
      onRiskSignalFailure:()=>{throw new Error("UNEXPECTED_RISK_SIGNAL_FAILURE");},
      blindIndexKey,
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
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(Object.keys(call).sort()).toEqual(["emailBlindIndex", "source"]);
      expect(call).not.toHaveProperty("email");
      expect(call.source).toEqual(source);
    }
    expect(riskCalls).toEqual([{
      publicHandle,kind:"RECOVERY_STARTED",source
    }]);
  });

  it("holds the same response floor before surfacing an infrastructure failure", async () => {
    let now = 0;
    const service = new RecoveryStartService({
      repository: {
        async start() {
          now += 25;
          throw new Error("DATABASE_UNAVAILABLE");
        }
      },
      riskSignals:{async recordForRecovery(){return "scope_unresolved";}},
      onRiskSignalFailure:()=>undefined,
      blindIndexKey: Buffer.alloc(32, 0x53),
      enumerationFloorMs: 600,
      publicResponsePolicy: "ENUMERATION_RESISTANT_GENERIC",
      monotonicNow: () => now,
      sleep: async (milliseconds) => { now += milliseconds; }
    });

    await expect(service.start({ email: "person@example.test" }, source))
      .rejects.toThrow("DATABASE_UNAVAILABLE");
    expect(now).toBe(600);
  });

  it("publishes only the exact 202 generic response at the public HTTP boundary", async () => {
    const inputs: string[] = [];
    const recovery: RecoveryApplication = {
      async start(input) {
        inputs.push(input.email);
        return RECOVERY_START_PUBLIC_RESPONSE;
      }
    };
    const api = buildApi({ application: {} as AskApplication, recovery });
    try {
      const response = await api.inject({
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
