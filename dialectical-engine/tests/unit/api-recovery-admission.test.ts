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
    startRecovery: (remoteAddress: string, email = "alice@example.test") => api.inject({
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
        const response = await api.inject({
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
