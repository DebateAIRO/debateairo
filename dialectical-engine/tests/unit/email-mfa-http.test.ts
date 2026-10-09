import { afterEach, expect, it, vi } from "vitest";
import type { Argon2Executor } from "@debateai/crypto";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { MfaRecoveryService } from "../../apps/api/src/email-mfa-recovery.js";
import { RECOVERY_START_PUBLIC_RESPONSE } from "../../apps/api/src/recovery.js";
import { ENUMERATION_FLOOR_MS, mfaRecoveryPolicy, recoveryAuthPolicy, recoveryMfaPolicy, recoveryStartStorage, type StorageCostHooks } from "../support/recoveryStartStorage.js";
const origin = "https://preview.example.test", KNOWN = "owned@example.test", UNKNOWN = "nobody-here@example.test";
const source = { ip: "203.0.113.9", userAgent: "unit", requestId: "r" };

/** The REAL MfaRecoveryService; only its database repository and DEK store are in memory. */
function realMfaRecovery(hooks: StorageCostHooks = {}) {
  const storage = recoveryStartStorage(hooks);
  storage.enrol(KNOWN);
  const service = new MfaRecoveryService({
    repository: storage.mfaRecoveryRepository, users: storage.users, argon2: {} as Argon2Executor,
    authPolicy: recoveryAuthPolicy, mfaPolicy: recoveryMfaPolicy, policy: mfaRecoveryPolicy, blindIndexKey: storage.blindIndexKey
  });
  return { service, storage };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("exposes a separate origin-bound MFA start without ordinary session authority, identical for known and unknown addresses", async () => {
  const { service, storage } = realMfaRecovery();
  const api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, mfaRecovery: service });
  try {
    const start = (email: string, from = origin) => api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/start", headers: { origin: from }, payload: { email, destination: "primary" } });
    // The real floor applies here (two waits of ENUMERATION_FLOOR_MS of wall time).
    const known = await start(KNOWN), unknown = await start(UNKNOWN);
    for (const response of [known, unknown]) {
      expect(response.statusCode).toBe(202);
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(response.json()).toEqual(RECOVERY_START_PUBLIC_RESPONSE);
    }
    expect(unknown.body).toBe(known.body);
    const { date: _knownDate, ...knownHeaders } = known.headers, { date: _unknownDate, ...unknownHeaders } = unknown.headers;
    expect(unknownHeaders).toEqual(knownHeaders);
    expect(storage.starts.map((row) => row.candidateId === null)).toEqual([false, true]);
    expect((await start(KNOWN, "https://evil.example.test")).statusCode).toBe(403);
    expect(storage.starts).toHaveLength(2);
  } finally {
    await api.close();
  }
});

it("holds known and unknown MFA recovery starts to the same enumeration floor on a controlled clock", async () => {
  // The service reads performance.now() from node:perf_hooks (the same object as the global) and
  // waits with setTimeout; both run on the fake clock so storage cost and the floor share one timeline.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: 0 });
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  // A matching account costs 180 ms of storage work (on the fake clock); a miss costs nothing.
  const { service } = realMfaRecovery({ onLookup: (found) => found ? new Promise<void>((resolve) => setTimeout(resolve, 180)) : undefined });
  async function settledAt(email: string): Promise<number> {
    const began = performance.now();
    let settled: number | undefined;
    const pending = service.start({ email, destination: "primary" }, source).then((response) => {
      expect(response).toEqual(RECOVERY_START_PUBLIC_RESPONSE);
      settled = performance.now() - began;
    });
    await vi.advanceTimersByTimeAsync(ENUMERATION_FLOOR_MS - 1);
    expect(settled, `${email} answered before the floor`).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    return settled!;
  }
  expect(await settledAt(KNOWN)).toBe(ENUMERATION_FLOOR_MS);
  expect(await settledAt(UNKNOWN)).toBe(ENUMERATION_FLOOR_MS);
});
