import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type {
  SupportConfigurationPort,
  SupportConfigurationState
} from "../../packages/register/src/support-config.js";
import {
  SUPPORT_MODEL_RESERVATION_EVENT_CAP,
  SupportModelReservationLedger,
  createReservedSupportModelPort,
  reserveSupportModelCall
} from "../../apps/api/src/support/model-reservation.js";
import { SupportModelError,type SupportModelPort } from "../../apps/api/src/support/model.js";
import { SUPPORT_LIMIT_DEFAULTS } from "../../apps/api/src/support/limits.js";
import { SupportRelayQueue } from "../../apps/api/src/support/queue.js";

const enabledState = (supportEnabled = true): SupportConfigurationState => Object.freeze({
  kind: "AVAILABLE",
  snapshot: Object.freeze({
    supportRegisterVersion: "9007199254740992" as never,
    schemaVersion: 1,
    recordedAt: new Date("2026-09-06T00:00:00.000Z"),
    supportSnapshotSha256: "a".repeat(64),
    fullSnapshotSha256: "b".repeat(64),
    values: Object.freeze({
      supportEnabled,
      supportModelRef: "development:claude-cli",
      supportRelayConcurrency: 2,
      supportDailyCallCap: 500,
      supportLimitAnonMessages10m: 20,
      supportLimitAnonMessages24h: 100,
      supportLimitAnonSessions1h: 5,
      supportLimitSessionMessages: 40,
      supportLimitMessageCharacters: 2_000,
      supportLimitAccountMessages10m: 40,
      supportLimitAccountMessages24h: 200,
      supportQueueDepth: 8,
      supportLockAfterInjections: 3,
      supportIpCooldownMinutes: 60,
      supportRetentionPolicy: "keep",
      supportRetentionRatifiedBy: null
    })
  })
});

function configuration(state: SupportConfigurationState): SupportConfigurationPort {
  return Object.freeze({
    current: async () => state,
    close: async () => undefined
  });
}

function ledger(now = 4_200): SupportModelReservationLedger {
  return new SupportModelReservationLedger({
    processId: "api-a",
    processPid: 101,
    ordinaryPoolId: "ordinary-a",
    controlPoolId: "control-a",
    monotonicNow: () => now
  });
}

function recordedDurableCalls(onCall?: () => void) {
  return Object.freeze({
    reserveModelCall: async () => {
      onCall?.();
      return Object.freeze({ kind: "RECORDED" as const });
    }
  });
}

async function rejectionWithin(promise: Promise<unknown>): Promise<unknown> {
  return await Promise.race([
    promise.then(
      (value) => Object.freeze({ kind: "RESOLVED",value }),
      (error: unknown) => error
    ),
    new Promise<"TEST_DEADLINE">((resolve) => setTimeout(() => resolve("TEST_DEADLINE"),50))
  ]);
}

describe("SUP-01 final model-call reservation", () => {
  it("stops at a caller abort while live configuration is unresolved and never resumes later", async () => {
    let resolveConfiguration!: (state: SupportConfigurationState) => void;
    const current = new Promise<SupportConfigurationState>((resolve) => {
      resolveConfiguration = resolve;
    });
    const reservations = ledger();
    let durableCalls = 0;
    let providerCalls = 0;
    const admitted = createReservedSupportModelPort({
      configuration: Object.freeze({ current: () => current }),
      ledger: reservations,
      durableCalls: recordedDurableCalls(() => { durableCalls += 1; }),
      modelFor: () => Object.freeze({
        complete: async () => {
          providerCalls += 1;
          return Object.freeze({ text: "late provider answer" });
        }
      }),
      nonce: () => "nonce-abort-config-000000000000000000000"
    });
    const controller = new AbortController();
    const completion = admitted.complete({
      system: "system",messages: [],language: "en",signal: controller.signal
    });

    controller.abort();
    expect(await rejectionWithin(completion))
      .toMatchObject({ code: "SUPPORT_MODEL_UNAVAILABLE" });
    resolveConfiguration(enabledState());
    await Promise.resolve();
    await Promise.resolve();

    expect(durableCalls).toBe(0);
    expect(providerCalls).toBe(0);
    expect(reservations.events()).toEqual([]);
    expect(reservations.activeCount()).toBe(0);
  });

  it("releases after abort during a durable record and never resumes into provider I/O", async () => {
    let resolveDurable!: (result: Readonly<{ kind: "RECORDED" }>) => void;
    const reservations = ledger();
    let durableCalls = 0;
    let providerCalls = 0;
    let durableSignal: AbortSignal | undefined;
    const admitted = createReservedSupportModelPort({
      configuration: configuration(enabledState()),
      ledger: reservations,
      durableCalls: Object.freeze({
        reserveModelCall: async (request: Readonly<{ signal?: AbortSignal }>) => {
          durableCalls += 1;
          durableSignal = request.signal;
          return await new Promise<Readonly<{ kind: "RECORDED" }>>((resolve) => {
            resolveDurable = resolve;
          });
        }
      }),
      modelFor: () => Object.freeze({
        complete: async () => {
          providerCalls += 1;
          return Object.freeze({ text: "must not run" });
        }
      }),
      nonce: () => "nonce-abort-durable-0000000000000000000"
    });
    const controller = new AbortController();
    const completion = admitted.complete({
      system: "system",messages: [],language: "en",signal: controller.signal
    });
    for (let turn = 0;turn < 4 && durableCalls === 0;turn += 1) await Promise.resolve();

    controller.abort();
    expect(await rejectionWithin(completion))
      .toMatchObject({ code: "SUPPORT_MODEL_UNAVAILABLE" });
    expect(durableSignal).toBe(controller.signal);
    resolveDurable(Object.freeze({ kind: "RECORDED" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(durableCalls).toBe(1);
    expect(providerCalls).toBe(0);
    expect(reservations.activeCount()).toBe(0);
  });

  it("terminates the wrapper on abort even when a provider resolves late", async () => {
    let resolveProvider!: (result: Readonly<{ text: string }>) => void;
    let providerSignal: AbortSignal | undefined;
    const reservations = ledger();
    const admitted = createReservedSupportModelPort({
      configuration: configuration(enabledState()),ledger: reservations,
      durableCalls: recordedDurableCalls(),
      modelFor: () => Object.freeze({
        complete: async (request: Parameters<SupportModelPort["complete"]>[0]) => {
          providerSignal = request.signal;
          return await new Promise<Readonly<{ text: string }>>((resolve) => {
            resolveProvider = resolve;
          });
        }
      }),
      nonce: () => "nonce-abort-provider-0000000000000000000"
    });
    const controller = new AbortController();
    const completion = admitted.complete({
      system: "system",messages: [],language: "en",signal: controller.signal
    });
    for (let turn = 0;turn < 6 && providerSignal === undefined;turn += 1) await Promise.resolve();

    controller.abort();
    expect(await rejectionWithin(completion))
      .toMatchObject({ code: "SUPPORT_MODEL_UNAVAILABLE" });
    expect(providerSignal).toBe(controller.signal);
    expect(reservations.activeCount()).toBe(0);
    resolveProvider(Object.freeze({ text: "late" }));
    await Promise.resolve();
    expect(reservations.activeCount()).toBe(0);
  });

  it("checks an already-aborted caller before reading configuration or recording", async () => {
    const current = async (): Promise<SupportConfigurationState> => {
      throw new TypeError("configuration must not be read");
    };
    const durableCalls = recordedDurableCalls(() => {
      throw new TypeError("durable record must not be attempted");
    });
    const admitted = createReservedSupportModelPort({
      configuration: Object.freeze({ current }),ledger: ledger(),durableCalls,
      modelFor: () => undefined,
      nonce: () => "nonce-pre-aborted-0000000000000000000000"
    });
    const controller = new AbortController();
    controller.abort();

    await expect(admitted.complete({
      system: "system",messages: [],language: "en",signal: controller.signal
    })).rejects.toBeInstanceOf(SupportModelError);
  });

  it.each([
    "SUPPORT_CONFIG_UNINITIALIZED",
    "SUPPORT_CONFIG_REFRESH_DEADLINE",
    "SUPPORT_CONFIG_SNAPSHOT_INVALID",
    "SUPPORT_CONFIG_SCHEMA_UNSUPPORTED"
  ] as const)("creates no reservation when configuration is disabled by %s", async (code) => {
    const reservations = ledger();

    const result = await reserveSupportModelCall({
      configuration: configuration(Object.freeze({ kind: "DISABLED", code })),
      ledger: reservations,
      kind: "new",
      nonce: "nonce-disabled-000000000000000000000000"
    });

    expect(result).toEqual({ kind: "DISABLED", code });
    expect(reservations.events()).toEqual([]);
    expect(reservations.activeCount()).toBe(0);
  });

  it("creates no reservation from a valid snapshot whose support switch is off", async () => {
    const reservations = ledger();

    const result = await reserveSupportModelCall({
      configuration: configuration(enabledState(false)),
      ledger: reservations,
      kind: "queued",
      nonce: "nonce-off-0000000000000000000000000000"
    });

    expect(result).toEqual({ kind: "DISABLED", code: "SUPPORT_DISABLED" });
    expect(reservations.events()).toEqual([]);
  });

  it("records one immutable generation-bound reservation synchronously after the enabled decision", async () => {
    const reservations = ledger(9_999);

    const result = await reserveSupportModelCall({
      configuration: configuration(enabledState()),
      ledger: reservations,
      kind: "follow-on",
      nonce: "nonce-enabled-0000000000000000000000000"
    });

    expect(result.kind).toBe("RESERVED");
    if (result.kind !== "RESERVED") return;
    expect(Object.isFrozen(result.reservation)).toBe(true);
    expect(result.reservation).toMatchObject({
      immutable: true,
      singleUse: true,
      nonce: "nonce-enabled-0000000000000000000000000",
      kind: "follow-on",
      supportRegisterVersion: "9007199254740992",
      reservedAtMs: 9_999
    });
    expect(reservations.events()).toEqual([expect.objectContaining({
      reservationId: result.reservation.reservationId,
      nonce: result.reservation.nonce,
      supportRegisterVersion: "9007199254740992",
      atMs: 9_999,
      immutable: true,
      singleUse: true
    })]);
    expect(reservations.activeCount()).toBe(1);
  });

  it("permits exactly one original relay attempt and releases on success", async () => {
    const reservations = ledger();
    const result = await reserveSupportModelCall({
      configuration: configuration(enabledState()),
      ledger: reservations,
      kind: "new",
      nonce: "nonce-single-use-000000000000000000000"
    });
    if (result.kind !== "RESERVED") throw new TypeError("test expected a reservation");
    let attempts = 0;

    const value = await result.reservation.runOriginalAttempt(async (event) => {
      attempts += 1;
      expect(event.reservationId).toBe(result.reservation.reservationId);
      return "relay-result";
    });

    expect(value).toBe("relay-result");
    expect(attempts).toBe(1);
    expect(reservations.activeCount()).toBe(0);
    await expect(result.reservation.runOriginalAttempt(async () => "retry"))
      .rejects.toMatchObject({ code: "SUPPORT_MODEL_RESERVATION_REUSED" });
    expect(attempts).toBe(1);
  });

  it("releases after relay failure and refuses transfer or concurrent reuse", async () => {
    const reservations = ledger();
    const result = await reserveSupportModelCall({
      configuration: configuration(enabledState()),
      ledger: reservations,
      kind: "retry",
      nonce: "nonce-failure-000000000000000000000000"
    });
    if (result.kind !== "RESERVED") throw new TypeError("test expected a reservation");
    let attempts = 0;

    const first = result.reservation.runOriginalAttempt(async () => {
      attempts += 1;
      await Promise.resolve();
      throw new TypeError("relay failed");
    });
    const second = result.reservation.runOriginalAttempt(async () => {
      attempts += 1;
      return "forbidden";
    });

    await expect(first).rejects.toThrow("relay failed");
    await expect(second).rejects.toMatchObject({ code: "SUPPORT_MODEL_RESERVATION_REUSED" });
    expect(attempts).toBe(1);
    expect(reservations.activeCount()).toBe(0);
  });

  it("releases a pre-POST failure without creating an attempt", async () => {
    const reservations = ledger();
    const result = await reserveSupportModelCall({
      configuration: configuration(enabledState()),
      ledger: reservations,
      kind: "new",
      nonce: "nonce-pre-post-0000000000000000000000"
    });
    if (result.kind !== "RESERVED") throw new TypeError("test expected a reservation");

    result.reservation.releaseBeforePost();

    expect(reservations.activeCount()).toBe(0);
    await expect(result.reservation.runOriginalAttempt(async () => "forbidden"))
      .rejects.toMatchObject({ code: "SUPPORT_MODEL_RESERVATION_REUSED" });
  });

  it("re-reads live configuration after queue wait and makes zero provider call after OFF", async () => {
    let state = enabledState();
    const reservations = ledger();
    let durableCalls = 0;
    let providerCalls = 0;
    const admitted = createReservedSupportModelPort({
      configuration: Object.freeze({ current: async () => state }),
      ledger: reservations,
      durableCalls: recordedDurableCalls(() => { durableCalls += 1; }),
      modelFor: () => Object.freeze({
        complete: async () => {
          providerCalls += 1;
          return Object.freeze({ text: "provider answer" });
        }
      }),
      nonce: () => "nonce-final-admission-000000000000000000"
    });
    const queue = new SupportRelayQueue({
      readLimits: async () => Object.freeze({
        ...SUPPORT_LIMIT_DEFAULTS,support_relay_concurrency: 1,support_queue_depth: 1
      })
    });
    const held = await queue.acquireRelaySlot({ language: "en" });
    const queued = queue.execute({ modelBacked: true,language: "en" },async (signal) =>
      admitted.complete({
        system: "system",
        messages: [],
        language: "en",
        ...(signal === undefined ? {} : { signal }),
      })
    );
    await Promise.resolve();
    state = enabledState(false);
    await held.release();

    await expect(queued).rejects.toMatchObject({ code: "SUPPORT_DISABLED" });
    expect(providerCalls).toBe(0);
    expect(durableCalls).toBe(0);
    expect(reservations.events()).toEqual([]);
    expect(reservations.activeCount()).toBe(0);
  });

  it("creates exactly one final reservation for each concurrent provider attempt and resumes OFF to ON", async () => {
    let state = enabledState(false);
    const reservations = ledger();
    let durableCalls = 0;
    let providerCalls = 0;
    const admitted = createReservedSupportModelPort({
      configuration: Object.freeze({ current: async () => state }),
      ledger: reservations,
      durableCalls: recordedDurableCalls(() => { durableCalls += 1; }),
      modelFor: (modelRef) => modelRef === "development:claude-cli"
        ? Object.freeze({
          complete: async () => {
            providerCalls += 1;
            return Object.freeze({ text: "provider answer" });
          }
        }) : undefined,
      nonce: (() => {
        let value = 0;
        return () => `nonce-concurrent-${String(++value).padStart(24,"0")}`;
      })()
    });
    const request = Object.freeze({ system: "system",messages: [],language: "en" as const });

    await expect(admitted.complete(request))
      .rejects.toMatchObject({ code: "SUPPORT_DISABLED" });
    state = enabledState(true);
    await expect(Promise.all([admitted.complete(request),admitted.complete(request)]))
      .resolves.toEqual([{ text: "provider answer" },{ text: "provider answer" }]);

    expect(providerCalls).toBe(2);
    expect(durableCalls).toBe(2);
    expect(reservations.events()).toHaveLength(2);
    expect(new Set(reservations.events().map(({ reservationId }) => reservationId)).size).toBe(2);
    expect(reservations.activeCount()).toBe(0);
  });

  it("makes a final durable daily reservation exactly once before each provider attempt", async () => {
    const reservations = ledger();
    let durableCalls = 0;
    let providerCalls = 0;
    const admitted = createReservedSupportModelPort({
      configuration: configuration(enabledState()),
      ledger: reservations,
      durableCalls: Object.freeze({
        reserveModelCall: async () => {
          durableCalls += 1;
          return Object.freeze({ kind: "DAILY_CAP" as const });
        }
      }),
      modelFor: () => Object.freeze({
        complete: async () => {
          providerCalls += 1;
          return Object.freeze({ text: "must not run" });
        }
      }),
      nonce: () => "nonce-durable-denial-0000000000000000000"
    });

    await expect(admitted.complete({ system: "system",messages: [],language: "en" }))
      .rejects.toMatchObject({ code: "SUPPORT_MODEL_UNAVAILABLE" });
    expect(durableCalls).toBe(1);
    expect(providerCalls).toBe(0);
    expect(reservations.activeCount()).toBe(0);
  });

  /**
   * DL1-F8. `#events` grew one frozen record per model call for the lifetime of
   * the process and nothing in production ever read it back, so the ledger's
   * memory tracked uptime x the daily cap. The retained window is now a fixed
   * bound; `#active`, which the release path depends on, is untouched.
   */
  it("bounds the retained reservation events and keeps the newest", () => {
    const reservations = ledger();
    for (let index = 0;index < 5_000;index += 1) {
      reservations.reserve({
        kind: "new",
        nonce: `nonce-bounded-${String(index).padStart(12,"0")}`,
        supportRegisterVersion: "9007199254740992",
        atMs: index
      }).releaseBeforePost();
    }
    const retained = reservations.events();

    expect(retained.length).toBeLessThanOrEqual(64);
    expect(SUPPORT_MODEL_RESERVATION_EVENT_CAP).toBe(64);
    expect(retained.at(-1)?.nonce).toBe(`nonce-bounded-${String(4_999).padStart(12,"0")}`);
    expect(retained.at(0)?.nonce).toBe(
      `nonce-bounded-${String(5_000 - retained.length).padStart(12,"0")}`
    );
    expect(reservations.activeCount()).toBe(0);
  });

  it("binds every production answer and advisory-summary provider call through the final wrapper", () => {
    const main = readFileSync(new URL("../../apps/api/src/main.ts",import.meta.url),"utf8");
    const supportComposition = main.slice(
      main.indexOf("const supportModels"),main.indexOf("const supportStatus")
    );

    expect(supportComposition).toContain("createReservedSupportModelPort");
    expect(supportComposition).toContain("const supportAdmittedModel");
    expect(supportComposition).toContain("durableCalls: supportRelayCallRecords");
    expect(supportComposition).not.toMatch(/\bmodel\.complete\(/u);
    expect(supportComposition.match(/supportAdmittedModel\.complete\(/gu)).toHaveLength(1);
    expect(supportComposition).toContain("modelFor: (modelRef) => supportModels.get(modelRef)");
    expect(supportComposition).toMatch(
      /createSupportAnswerService\(\{[\s\S]*?modelFor: \(\) => supportAdmittedModel/u
    );
    expect(supportComposition).not.toMatch(
      /createSupportAnswerService\(\{[\s\S]*?modelFor: \(modelRef\) => supportModels\.get/u
    );
  });
});
