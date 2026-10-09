import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  ADMISSION_POLICY_REGISTER_ROW,
  admissionPolicyFromValue,
  type AdmissionPolicy
} from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { RECOVERY_START_PUBLIC_RESPONSE, type RecoveryApplication } from "../../apps/api/src/recovery.js";
import { TEST_APP_ORIGIN } from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const T0 = Date.parse("2026-09-02T00:00:00.000Z");
const HOUR_MS = 60 * 60_000;
const SOURCE_A = "203.0.113.5";
const SOURCE_B = "198.51.100.7";

const POLICY: AdmissionPolicy = admissionPolicyFromValue(
  ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef
);
const REFUSAL = Object.freeze({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });

function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    readNode: async () => null,
    recordInvestigation: async () => ({ request_ref: "request:test", status: "RECORDED", replay_handle: "replay:test" }),
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    events: async function* () {
      yield { event_id: "event:test", event_type: "run.accepted", run_ref: RUN_ID, at_sequence: 1, payload: {} };
    }
  };
}

function harness(policy: AdmissionPolicy = POLICY) {
  let now = new Date(T0);
  // The application stub stands in front of the repository: the recovery
  // service performs its blind-index compute and every database round trip
  // behind this boundary, so "not called" is strictly stronger than
  // "no repository call".
  const start = vi.fn(async () => RECOVERY_START_PUBLIC_RESPONSE);
  const api = buildApi({
    application: fixtureApplication(),
    recovery: { start } satisfies RecoveryApplication,
    allowedOrigin: TEST_APP_ORIGIN,
    admission: new AdmissionLimiter(policy),
    admissionClock: () => now
  });
  const refusalLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  return {
    api, start, refusalLog,
    advance: (ms: number) => { now = new Date(now.getTime() + ms); },
    startRecovery: (remoteAddress: string, email = "alice@example.test") => api.inject({ headers: { origin: TEST_APP_ORIGIN },
      method: "POST", url: "/v1/auth/recovery/start", remoteAddress, payload: { email }
    }),
    refusalLines: () => refusalLog.mock.calls.map((call) => JSON.parse(String(call[0])) as unknown),
    close: async () => { refusalLog.mockRestore(); await api.close(); }
  };
}

describe("B25a recovery/start admission (L1-F3)", () => {
  it("admits 15 starts per source per hour and refuses the 16th before any application work", async () => {
    const { api, start, startRecovery, close } = harness();
    try {
      for (let attempt = 1; attempt <= POLICY.recoveryStart.limit; attempt += 1) {
        const admitted = await startRecovery(SOURCE_A);
        expect(admitted.statusCode, `attempt ${attempt}`).toBe(202);
      }
      expect(start).toHaveBeenCalledTimes(15);

      const refused = await startRecovery(SOURCE_A);
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual(REFUSAL);
      expect(refused.headers["retry-after"]).toBe("3600");
      // Refused before the blind index, the recovery round trip, and the
      // risk-signal write — the whole L1-F3 amplifier.
      expect(start).toHaveBeenCalledTimes(15);
      expect(api).toBeDefined();
    } finally {
      await close();
    }
  });

  it("leaves another source untouched and is keyed by source, not by address", async () => {
    const { start, startRecovery, close } = harness();
    try {
      for (let attempt = 0; attempt < POLICY.recoveryStart.limit + 1; attempt += 1) {
        // A different address every time: the budget must still be the source's.
        await startRecovery(SOURCE_A, `victim-${attempt}@example.test`);
      }
      expect(start).toHaveBeenCalledTimes(15);

      const other = await startRecovery(SOURCE_B);
      expect(other.statusCode).toBe(202);
      expect(start).toHaveBeenCalledTimes(16);
    } finally {
      await close();
    }
  });

  it("refuses identically for an unknown and a known address, and readmits after the window", async () => {
    const { advance, start, startRecovery, refusalLines, close } = harness();
    try {
      for (let attempt = 0; attempt < POLICY.recoveryStart.limit; attempt += 1) {
        await startRecovery(SOURCE_A);
      }
      const unknown = await startRecovery(SOURCE_A, "nobody@example.test");
      const known = await startRecovery(SOURCE_A, "alice@example.test");
      // No enumeration oracle: byte-identical refusals either way.
      expect(unknown.statusCode).toBe(known.statusCode);
      expect(unknown.body).toBe(known.body);
      expect(unknown.json()).toEqual(REFUSAL);

      // One aggregated audit line per route+reason+window, carrying no address.
      const lines = refusalLines();
      expect(lines).toEqual([{
        event: "api.admission.refused",
        route: "POST /v1/auth/recovery/start",
        reason: "LIMIT",
        windowMs: HOUR_MS
      }]);
      expect(JSON.stringify(lines)).not.toContain("example.test");
      expect(JSON.stringify(lines)).not.toContain(SOURCE_A);

      advance(HOUR_MS);
      const readmitted = await startRecovery(SOURCE_A);
      expect(readmitted.statusCode).toBe(202);
      expect(start).toHaveBeenCalledTimes(16);
    } finally {
      await close();
    }
  });

  it("stays unlimited when no limiter is composed", async () => {
    const start = vi.fn(async () => RECOVERY_START_PUBLIC_RESPONSE);
    const api = buildApi({
      application: fixtureApplication(),
      recovery: { start } satisfies RecoveryApplication,
      allowedOrigin: TEST_APP_ORIGIN
    });
    try {
      for (let attempt = 0; attempt < POLICY.recoveryStart.limit + 5; attempt += 1) {
        const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN },
          method: "POST", url: "/v1/auth/recovery/start",
          remoteAddress: SOURCE_A, payload: { email: "alice@example.test" }
        });
        expect(response.statusCode).toBe(202);
      }
      expect(start).toHaveBeenCalledTimes(POLICY.recoveryStart.limit + 5);
    } finally {
      await api.close();
    }
  });
});

/**
 * Auth API hardening 2026-10-09 (follow-up 1). The recovery-start budget was
 * keyed by the FULL client address and refused every NEW key once its table
 * was full, so one IPv6 /64 minting fresh addresses could fill the table and
 * make all three recovery starts answer 429 CAPACITY to everybody.
 */
function recoveryPolicyWith(overrides: Partial<{ limit: number; window_ms: number; capacity: number }>): AdmissionPolicy {
  const value = ADMISSION_POLICY_REGISTER_ROW.value;
  return admissionPolicyFromValue({
    ...value,
    recovery_start: { ...value.recovery_start, ...overrides }
  }, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
}

describe("recovery/start admission under a source flood (auth hardening 2026-10-09)", () => {
  it("counts every address of one IPv6 /64 as one source and leaves a different source admitted", async () => {
    const { start, startRecovery, close } = harness();
    try {
      for (let index = 1; index <= POLICY.recoveryStart.limit; index += 1) {
        expect((await startRecovery(`2001:db8:1:2::${index.toString(16)}`)).statusCode, `address ${index}`).toBe(202);
      }
      // A fresh address of the same /64 is the same source: its budget is spent.
      expect((await startRecovery("2001:db8:1:2:ffff:ffff:ffff:fffe")).statusCode).toBe(429);
      expect(start).toHaveBeenCalledTimes(POLICY.recoveryStart.limit);
      // A different /64 and an IPv4 source are untouched.
      expect((await startRecovery("2001:db8:1:3::1")).statusCode).toBe(202);
      expect((await startRecovery(SOURCE_B)).statusCode).toBe(202);
    } finally {
      await close();
    }
  });

  it("counts an IPv4-mapped IPv6 caller as its IPv4 address, never as one shared ::ffff /64", async () => {
    const { startRecovery, close } = harness();
    try {
      for (let attempt = 0; attempt < POLICY.recoveryStart.limit; attempt += 1) {
        expect((await startRecovery(`::ffff:${SOURCE_A}`)).statusCode).toBe(202);
      }
      expect((await startRecovery(SOURCE_A)).statusCode).toBe(429);
      expect((await startRecovery(`::ffff:${SOURCE_B}`)).statusCode).toBe(202);
    } finally {
      await close();
    }
  });

  it("admits a new source when the table is full, evicting one-shot sources and keeping a spent one blocked", async () => {
    const { start, startRecovery, close } = harness(recoveryPolicyWith({ capacity: 3 }));
    try {
      for (let attempt = 0; attempt < POLICY.recoveryStart.limit; attempt += 1) {
        expect((await startRecovery(SOURCE_A)).statusCode).toBe(202);
      }
      expect((await startRecovery(SOURCE_A)).statusCode).toBe(429);
      // A flood of fresh sources fills and overflows the table.
      for (let index = 1; index <= 10; index += 1) {
        expect((await startRecovery(`10.0.0.${index}`)).statusCode, `flood source ${index}`).toBe(202);
      }
      // A legitimate new source is admitted, not refused for CAPACITY.
      expect((await startRecovery(SOURCE_B)).statusCode).toBe(202);
      // The spent source kept its counter through the flood.
      expect((await startRecovery(SOURCE_A)).statusCode).toBe(429);
      expect(start).toHaveBeenCalledTimes(POLICY.recoveryStart.limit + 11);
    } finally {
      await close();
    }
  });
});

describe("AdmissionLimiter recoveryStart eviction", () => {
  it("evicts the least-evidenced unblocked key instead of refusing a new one, and stays bounded", () => {
    const limiter = new AdmissionLimiter(recoveryPolicyWith({ limit: 2, window_ms: 1_000, capacity: 2 }));
    const at = (ms: number) => new Date(T0 + ms);
    expect(limiter.decide("recoveryStart", "spent", at(0))).toEqual({ allowed: true });
    expect(limiter.decide("recoveryStart", "spent", at(0))).toEqual({ allowed: true });
    expect(limiter.decide("recoveryStart", "spent", at(0)).allowed).toBe(false);
    expect(limiter.decide("recoveryStart", "one-shot", at(10))).toEqual({ allowed: true });
    expect(limiter.decide("recoveryStart", "fresh", at(20))).toEqual({ allowed: true });
    expect(limiter.size("recoveryStart")).toBe(2);
    // The blocked key survived; the one-shot key was the one given up.
    expect(limiter.decide("recoveryStart", "spent", at(30))).toMatchObject({ allowed: false, reason: "LIMIT" });
    // With every slot blocked, the key whose block ends soonest is given up, never a refusal.
    expect(limiter.decide("recoveryStart", "fresh", at(40))).toEqual({ allowed: true });
    expect(limiter.decide("recoveryStart", "fresh", at(40)).allowed).toBe(false);
    expect(limiter.decide("recoveryStart", "newest", at(50))).toEqual({ allowed: true });
    expect(limiter.size("recoveryStart")).toBe(2);
    expect(limiter.decide("recoveryStart", "fresh", at(60))).toMatchObject({ allowed: false, reason: "LIMIT" });
  });
});
