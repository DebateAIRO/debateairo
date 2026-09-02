import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  ADMISSION_POLICY_REGISTER_ROW,
  admissionPolicyFromValue,
  type AdmissionPolicy
} from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import type { PublicationApplication } from "../../apps/api/src/publications.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders,
  type TestHttpIdentity
} from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_REF = "22222222-2222-4222-8222-222222222222";
const T0 = Date.parse("2026-09-02T00:00:00.000Z");
const HOUR_MS = 60 * 60_000;
const QUARTER_MS = 15 * 60_000;
const OWNER_A = testHttpIdentity("admission-owner-a");
const OWNER_B = testHttpIdentity("admission-owner-b");
const OWNER_C = testHttpIdentity("admission-owner-c");
const SOURCE_A = "203.0.113.5";
const SOURCE_B = "198.51.100.7";

const POLICY: AdmissionPolicy = admissionPolicyFromValue(
  ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef
);

function policyWith(overrides: {
  readonly asks?: Partial<{ limit: number; window_ms: number; capacity: number }>;
  readonly public_reads?: Partial<{ limit: number; window_ms: number; capacity: number }>;
}): AdmissionPolicy {
  const value = ADMISSION_POLICY_REGISTER_ROW.value;
  return admissionPolicyFromValue({
    ...value,
    asks: { ...value.asks, ...overrides.asks },
    public_reads: { ...value.public_reads, ...overrides.public_reads }
  }, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
}

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

const ASK_BODY = Object.freeze({
  question_line: "What follows from this evidence?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:test",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "test-layer scope",
  as_of: "2026-08-07T00:00:00.000Z",
  steering_presets: [],
  steering_annotations: []
});

function harness(policy: AdmissionPolicy = POLICY) {
  let now = new Date(T0);
  const submit = vi.fn(async () => ({ run_ref: RUN_ID, status: "QUEUED" as const }));
  const list = vi.fn(async () => ({ items: [], total: 0 }));
  const readPublicDebate = vi.fn(async () => null);
  const api = buildApi({
    application: { ...fixtureApplication(), submit },
    sessions: testSessionApplication([OWNER_A, OWNER_B, OWNER_C]),
    // Only the two anonymous read entry points are exercised here.
    publications: { list, readPublicDebate } as unknown as PublicationApplication,
    allowedOrigin: TEST_APP_ORIGIN,
    admission: new AdmissionLimiter(policy),
    admissionClock: () => now
  });
  const refusalLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  return {
    api, submit, list, readPublicDebate, refusalLog,
    advance: (ms: number) => { now = new Date(now.getTime() + ms); },
    ask: (owner: TestHttpIdentity) => api.inject({
      method: "POST", url: "/v1/asks", headers: testSessionHeaders(owner, true), payload: ASK_BODY
    }),
    listDebates: (remoteAddress: string) => api.inject({
      method: "GET", url: "/v1/public/debates?limit=1&offset=0", remoteAddress
    }),
    readDebate: (remoteAddress: string) => api.inject({
      method: "GET", url: `/v1/public/debates/${PUBLIC_REF}`, remoteAddress
    }),
    refusalLines: () => refusalLog.mock.calls.map((call) => JSON.parse(String(call[0])) as unknown),
    close: async () => { refusalLog.mockRestore(); await api.close(); }
  };
}

const REFUSAL = Object.freeze({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });

describe("B10 admission limits (F-07, L1-F1, L1-F2)", () => {
  it("admits 20 asks per owner per hour, refuses the 21st with 429 + retry-after, and leaves other owners alone", async () => {
    const h = harness();
    try {
      for (let index = 0; index < 20; index += 1) {
        expect((await h.ask(OWNER_A)).statusCode, `ask ${index + 1}`).toBe(202);
      }
      const refused = await h.ask(OWNER_A);
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual(REFUSAL);
      expect(refused.headers["retry-after"]).toBe("3600");
      expect(h.submit).toHaveBeenCalledTimes(20);

      expect((await h.ask(OWNER_B)).statusCode).toBe(202);
      expect(h.submit).toHaveBeenCalledTimes(21);

      h.advance(30 * 60_000);
      const stillRefused = await h.ask(OWNER_A);
      expect(stillRefused.statusCode).toBe(429);
      expect(stillRefused.headers["retry-after"]).toBe("1800");
      // One structured line per aggregate window, never one per request, no address.
      expect(h.refusalLines()).toEqual([
        { event: "api.admission.refused", route: "POST /v1/asks", reason: "LIMIT", windowMs: HOUR_MS }
      ]);

      h.advance(30 * 60_000);
      expect((await h.ask(OWNER_A)).statusCode).toBe(202);
      expect(h.submit).toHaveBeenCalledTimes(22);
    } finally {
      await h.close();
    }
  });

  it("admits 120 anonymous public reads per source per 15 minutes across both public routes and refuses the 121st", async () => {
    const h = harness();
    try {
      for (let index = 0; index < 119; index += 1) {
        expect((await h.listDebates(SOURCE_A)).statusCode, `read ${index + 1}`).toBe(200);
      }
      // The single-debate route shares the same per-source budget.
      expect((await h.readDebate(SOURCE_A)).statusCode).toBe(404);
      expect(h.list).toHaveBeenCalledTimes(119);
      expect(h.readPublicDebate).toHaveBeenCalledTimes(1);

      const refused = await h.listDebates(SOURCE_A);
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual(REFUSAL);
      expect(refused.headers["retry-after"]).toBe("900");
      // The source key is the normalized address: the IPv4-mapped spelling is the same source.
      expect((await h.readDebate(`::ffff:${SOURCE_A}`)).statusCode).toBe(429);
      expect(h.list).toHaveBeenCalledTimes(119);
      expect(h.readPublicDebate).toHaveBeenCalledTimes(1);

      expect((await h.listDebates(SOURCE_B)).statusCode).toBe(200);
      expect(h.refusalLines()).toEqual([
        { event: "api.admission.refused", route: "GET /v1/public/debates", reason: "LIMIT", windowMs: QUARTER_MS },
        { event: "api.admission.refused", route: "GET /v1/public/debates/{id}", reason: "LIMIT", windowMs: QUARTER_MS }
      ]);

      h.advance(QUARTER_MS);
      expect((await h.listDebates(SOURCE_A)).statusCode).toBe(200);
    } finally {
      await h.close();
    }
  });

  it("fails closed when the key table is saturated and recovers once expired keys are evicted", async () => {
    const h = harness(policyWith({ asks: { capacity: 2 } }));
    try {
      expect((await h.ask(OWNER_A)).statusCode).toBe(202);
      expect((await h.ask(OWNER_B)).statusCode).toBe(202);
      const refused = await h.ask(OWNER_C);
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual(REFUSAL);
      expect(refused.headers["retry-after"]).toBe("3600");
      expect(h.submit).toHaveBeenCalledTimes(2);
      expect((await h.ask(OWNER_C)).statusCode).toBe(429);
      expect(h.refusalLines()).toEqual([
        { event: "api.admission.refused", route: "POST /v1/asks", reason: "CAPACITY", windowMs: HOUR_MS }
      ]);

      h.advance(HOUR_MS);
      expect((await h.ask(OWNER_C)).statusCode).toBe(202);
      expect(h.submit).toHaveBeenCalledTimes(3);
    } finally {
      await h.close();
    }
  });

  it("keeps existing compositions that omit the limiter unlimited", async () => {
    const submit = vi.fn(async () => ({ run_ref: RUN_ID, status: "QUEUED" as const }));
    const api = buildApi({
      application: { ...fixtureApplication(), submit },
      sessions: testSessionApplication([OWNER_A]),
      allowedOrigin: TEST_APP_ORIGIN
    });
    try {
      for (let index = 0; index < 25; index += 1) {
        expect((await api.inject({
          method: "POST", url: "/v1/asks", headers: testSessionHeaders(OWNER_A, true), payload: ASK_BODY
        })).statusCode).toBe(202);
      }
      expect(submit).toHaveBeenCalledTimes(25);
    } finally {
      await api.close();
    }
  });
});

describe("AdmissionLimiter", () => {
  const scope = (limit: number, windowMs: number, capacity: number) => policyWith({
    asks: { limit, window_ms: windowMs, capacity }
  });

  it("counts a fixed window per key, blocks until the window ends, and reports the remaining wait", () => {
    const limiter = new AdmissionLimiter(scope(2, 1_000, 8));
    expect(limiter.decide("asks", "k1", new Date(T0))).toEqual({ allowed: true });
    expect(limiter.decide("asks", "k1", new Date(T0 + 100))).toEqual({ allowed: true });
    expect(limiter.decide("asks", "k1", new Date(T0 + 200)))
      .toEqual({ allowed: false, reason: "LIMIT", retryAfterMs: 800, windowMs: 1_000 });
    expect(limiter.decide("asks", "k1", new Date(T0 + 900)))
      .toEqual({ allowed: false, reason: "LIMIT", retryAfterMs: 100, windowMs: 1_000 });
    expect(limiter.decide("asks", "k2", new Date(T0 + 900))).toEqual({ allowed: true });
    expect(limiter.decide("asks", "k1", new Date(T0 + 1_000))).toEqual({ allowed: true });
    expect(limiter.size("asks")).toBe(2);
  });

  it("bounds the key table, evicts the oldest expired keys first, and refuses new keys when saturated", () => {
    const limiter = new AdmissionLimiter(scope(5, 1_000, 2));
    expect(limiter.decide("asks", "k1", new Date(T0))).toEqual({ allowed: true });
    expect(limiter.decide("asks", "k2", new Date(T0 + 500))).toEqual({ allowed: true });
    expect(limiter.decide("asks", "k3", new Date(T0 + 600)))
      .toEqual({ allowed: false, reason: "CAPACITY", retryAfterMs: 1_000, windowMs: 1_000 });
    expect(limiter.size("asks")).toBe(2);
    // k1's window ended at T0+1000; k2's runs to T0+1500. Only k1 is evicted.
    expect(limiter.decide("asks", "k3", new Date(T0 + 1_000))).toEqual({ allowed: true });
    expect(limiter.decide("asks", "k4", new Date(T0 + 1_000)))
      .toEqual({ allowed: false, reason: "CAPACITY", retryAfterMs: 1_000, windowMs: 1_000 });
    expect(limiter.size("asks")).toBe(2);
    expect(limiter.decide("asks", "k4", new Date(T0 + 1_500))).toEqual({ allowed: true });
    expect(limiter.size("asks")).toBe(2);
    // A known key is never refused for capacity: its slot already exists.
    expect(limiter.decide("asks", "k3", new Date(T0 + 1_500))).toEqual({ allowed: true });
  });

  it("keeps ask and public-read budgets separate and refuses an unknown scope or key", () => {
    const limiter = new AdmissionLimiter(policyWith({ asks: { limit: 1 }, public_reads: { limit: 1 } }));
    expect(limiter.decide("asks", "same", new Date(T0))).toEqual({ allowed: true });
    expect(limiter.decide("publicReads", "same", new Date(T0))).toEqual({ allowed: true });
    expect(limiter.decide("asks", "same", new Date(T0)).allowed).toBe(false);
    expect(limiter.decide("publicReads", "same", new Date(T0)).allowed).toBe(false);
    expect(() => limiter.decide("other" as never, "k", new Date(T0))).toThrow("ADMISSION_SCOPE_UNKNOWN");
    expect(() => limiter.decide("asks", "", new Date(T0))).toThrow("ADMISSION_KEY_REQUIRED");
  });
});
