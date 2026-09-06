import { describe, expect, it } from "vitest";
import type {
  SupportConfigurationPort,
  SupportConfigurationState
} from "../../packages/register/src/support-config.js";
import {
  SupportModelReservationLedger,
  reserveSupportModelCall
} from "../../apps/api/src/support/model-reservation.js";

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

describe("SUP-01 final model-call reservation", () => {
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
});
