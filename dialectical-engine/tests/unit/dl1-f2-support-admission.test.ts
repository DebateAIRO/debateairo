import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW,
  ADMISSION_POLICY_REGISTER_ROW,
  admissionPolicyFromValue,
  type AdmissionPolicy
} from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { supportHarness } from "../support/supportHarness.js";
import {
  TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders
} from "../support/httpSession.js";

/**
 * DL1-F2. The B10 admission limiter covered three scopes — asks, public reads,
 * recovery starts — and none of the ten `/v1/support/*` routes. Every public
 * support read was unmetered, and the heaviest of them, the `/status`
 * aggregate, ran a multi-CTE join over `support.message`/`session`/`rating`/
 * `case` on EVERY call with no cache and no limiter. Authenticated session
 * creation skipped even the per-IP window anonymous callers get, and had no
 * per-owner cap, so one signed-in account could loop a KEK wrap plus two
 * inserts without bound.
 *
 * The two new budgets are a superseding DEPLOYMENT register row, never an edit
 * to the sealed one (constraint 5). They are OPTIONAL in the schema, so a host
 * still serving the current row boots and behaves exactly as it does today;
 * the fix is live the moment the deployment register publishes the new row.
 */
const OWNER_A = testHttpIdentity("support-admission-owner-a");
const OWNER_B = testHttpIdentity("support-admission-owner-b");
const SOURCE_A = "203.0.113.5";
const SOURCE_B = "198.51.100.7";
const T0 = Date.parse("2026-09-22T00:00:00.000Z");
const HOUR_MS = 60 * 60_000;
const QUARTER_MS = 15 * 60_000;

const SEALED: AdmissionPolicy = admissionPolicyFromValue(
  ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef
);
const PUBLISHED: AdmissionPolicy = admissionPolicyFromValue(
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value,
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
);

function policyWith(overrides: Readonly<Record<string, unknown>>): AdmissionPolicy {
  const value = ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value;
  return admissionPolicyFromValue(
    { ...value, ...overrides }, ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
  );
}

function fixtureAskApplication(): AskApplication {
  return {
    withContentLease: async (_runId: string, use: () => unknown) => use(),
    submit: async () => ({ run_ref: "00000000-0000-4000-8000-000000000000", status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session: unknown, limit: number, offset: number) =>
      ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    readNode: async () => null,
    recordInvestigation: async () =>
      ({ request_ref: "request:test", status: "RECORDED", replay_handle: "replay:test" }),
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    events: async function* () { return; }
  } as unknown as AskApplication;
}

function harness(policy: AdmissionPolicy | null = PUBLISHED) {
  let now = new Date(T0);
  const support = supportHarness({ clock: () => now });
  const api = buildApi({
    application: fixtureAskApplication(),
    sessions: testSessionApplication([OWNER_A, OWNER_B]),
    support: support.application,
    allowedOrigin: TEST_APP_ORIGIN,
    ...(policy === null ? {} : { admission: new AdmissionLimiter(policy) }),
    admissionClock: () => now
  });
  const refusalLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  return Object.freeze({
    api, support,
    advance: (ms: number) => { now = new Date(now.getTime() + ms); },
    status: (remoteAddress: string) =>
      api.inject({ method: "GET", url: "/v1/support/status", remoteAddress }),
    readSession: (remoteAddress: string, id: string, token: string) => api.inject({
      method: "GET", url: `/v1/support/sessions/${id}`, remoteAddress,
      headers: { "x-support-session-token": token }
    }),
    createAnonymous: (remoteAddress: string) => api.inject({
      method: "POST", url: "/v1/support/sessions", remoteAddress,
      // DL1-F7: a browser on the first-party page sends this; a drive-by cannot.
      headers: { origin: TEST_APP_ORIGIN }, payload: { language: "en" }
    }),
    createOwned: (identity: typeof OWNER_A, remoteAddress: string) => api.inject({
      method: "POST", url: "/v1/support/sessions", remoteAddress,
      headers: { ...testSessionHeaders(identity, true), origin: TEST_APP_ORIGIN },
      payload: { language: "en" }
    }),
    refusalLines: () => refusalLog.mock.calls.map((call) => {
      try { return JSON.parse(String(call[0])) as unknown; } catch { return String(call[0]); }
    }),
    close: async () => { refusalLog.mockRestore(); await api.close(); }
  });
}

const REFUSAL = Object.freeze({
  error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED"
});

describe("DL1-F2 the support budgets supersede, never edit, the sealed row", () => {
  it("leaves the sealed admission row exactly as it was, with only its three scopes", () => {
    expect(Object.keys(ADMISSION_POLICY_REGISTER_ROW.value).sort())
      .toEqual(["asks", "kind", "public_reads", "recovery_start"]);
    expect(SEALED.supportReads).toBeNull();
    expect(SEALED.supportSessions).toBeNull();
  });

  it("publishes a superseding row that adds the support scopes and nothing else", () => {
    expect(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.rowKey)
      .toBe(ADMISSION_POLICY_REGISTER_ROW.rowKey);
    expect(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value).toEqual({
      ...ADMISSION_POLICY_REGISTER_ROW.value,
      support_reads: { key: "source", limit: 240, window_ms: QUARTER_MS, capacity: 65_536 },
      support_sessions: { key: "owner", limit: 10, window_ms: HOUR_MS, capacity: 8_192 },
      // DL1-F7 rides the same unpublished deployment version; see its own test.
      support_model_calls: {
        key: "source", limit: 40, window_ms: 24 * 60 * 60_000, capacity: 65_536
      }
    });
    expect(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef)
      .toContain(ADMISSION_POLICY_REGISTER_ROW.sourceRef);
    expect(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef).toMatch(/DL1-F2/);
    // The three sealed scopes are republished byte for byte.
    for (const scope of ["asks", "public_reads", "recovery_start"] as const) {
      expect(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value[scope])
        .toEqual(ADMISSION_POLICY_REGISTER_ROW.value[scope]);
    }
  });

  it("keeps the support scopes separate from every other budget", () => {
    const limiter = new AdmissionLimiter(policyWith({
      support_reads: { key: "source", limit: 1, window_ms: 1_000, capacity: 8 },
      support_sessions: { key: "owner", limit: 1, window_ms: 1_000, capacity: 8 }
    }));
    expect(limiter.decide("publicReads", "same", new Date(T0))).toEqual({ allowed: true });
    expect(limiter.decide("supportReads", "same", new Date(T0))).toEqual({ allowed: true });
    expect(limiter.decide("supportSessions", "same", new Date(T0))).toEqual({ allowed: true });
    expect(limiter.decide("supportReads", "same", new Date(T0)).allowed).toBe(false);
    expect(limiter.decide("supportSessions", "same", new Date(T0)).allowed).toBe(false);
    expect(limiter.decide("publicReads", "same", new Date(T0))).toEqual({ allowed: true });
  });

  it("reports a scope the published row does not carry as unconfigured, never as limited", () => {
    const limiter = new AdmissionLimiter(SEALED);
    expect(limiter.configured("supportReads")).toBe(false);
    expect(limiter.configured("publicReads")).toBe(true);
    expect(new AdmissionLimiter(PUBLISHED).configured("supportReads")).toBe(true);
  });
});

describe("DL1-F2 support reads are metered per source", () => {
  it("refuses the read past the published per-source budget and leaves other sources alone", async () => {
    const h = harness(policyWith({
      support_reads: { key: "source", limit: 3, window_ms: QUARTER_MS, capacity: 64 }
    }));
    try {
      for (let index = 0; index < 3; index += 1) {
        expect((await h.status(SOURCE_A)).statusCode, `read ${index + 1}`).toBe(200);
      }
      const refused = await h.status(SOURCE_A);
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual(REFUSAL);
      expect(refused.headers["retry-after"]).toBe("900");
      // The session read shares the same per-source budget.
      expect((await h.readSession(SOURCE_A, "11111111-1111-4111-8111-111111111111", "z".repeat(43)))
        .statusCode).toBe(429);
      // A second source is untouched.
      expect((await h.status(SOURCE_B)).statusCode).toBe(200);
      h.advance(QUARTER_MS);
      expect((await h.status(SOURCE_A)).statusCode).toBe(200);
      expect(h.refusalLines()).toContainEqual({
        event: "api.admission.refused", route: "GET /v1/support/status",
        reason: "LIMIT", windowMs: QUARTER_MS
      });
    } finally {
      await h.close();
    }
  });

  it("refuses before the repository is asked for anything", async () => {
    const h = harness(policyWith({
      support_reads: { key: "source", limit: 1, window_ms: QUARTER_MS, capacity: 64 }
    }));
    try {
      await h.status(SOURCE_A);
      h.support.spies.status.mockClear();
      h.support.spies.configuration.mockClear();
      expect((await h.status(SOURCE_A)).statusCode).toBe(429);
      expect(h.support.spies.status).not.toHaveBeenCalled();
      expect(h.support.spies.configuration).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it("leaves a composition without the published budget unlimited, exactly as today", async () => {
    const h = harness(SEALED);
    try {
      for (let index = 0; index < 40; index += 1) {
        expect((await h.status(SOURCE_A)).statusCode, `read ${index + 1}`).toBe(200);
      }
    } finally {
      await h.close();
    }
  });
});

describe("DL1-F2 the status aggregate is answered from a cache", () => {
  it("asks the repository once per window, however many callers arrive", async () => {
    const h = harness();
    try {
      for (let index = 0; index < 5; index += 1) {
        expect((await h.status(SOURCE_A)).statusCode).toBe(200);
      }
      expect((await h.status(SOURCE_B)).statusCode).toBe(200);
      // One aggregate, one configuration read, one knowledge read for all six.
      expect(h.support.spies.status).toHaveBeenCalledTimes(1);
      expect(h.support.spies.knowledgeStatus).toHaveBeenCalledTimes(1);

      // The body is the same one the widget reads, not a stale shape.
      const body = (await h.status(SOURCE_A)).json() as Readonly<Record<string, unknown>>;
      expect(Object.keys(body).sort())
        .toEqual(["configuration", "kb_loaded", "kb_version", "relay_state"]);

      // Past the window the aggregate runs again.
      h.advance(2_000);
      expect((await h.status(SOURCE_A)).statusCode).toBe(200);
      expect(h.support.spies.status).toHaveBeenCalledTimes(2);
    } finally {
      await h.close();
    }
  });
});

describe("DL1-F2 authenticated session creation is capped per owner", () => {
  it("refuses one owner past the published cap and admits another", async () => {
    const h = harness(policyWith({
      support_sessions: { key: "owner", limit: 2, window_ms: HOUR_MS, capacity: 64 }
    }));
    try {
      expect((await h.createOwned(OWNER_A, SOURCE_A)).statusCode).toBe(201);
      expect((await h.createOwned(OWNER_A, SOURCE_A)).statusCode).toBe(201);
      const refused = await h.createOwned(OWNER_A, SOURCE_A);
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual(REFUSAL);
      expect(refused.headers["retry-after"]).toBe("3600");
      // Two rows written, not three: the refusal is before the KEK wrap.
      expect(h.support.spies.create).toHaveBeenCalledTimes(2);

      // A different owner has their own budget, from the same address.
      expect((await h.createOwned(OWNER_B, SOURCE_A)).statusCode).toBe(201);
      // An anonymous caller from that address is not charged the owner budget.
      expect((await h.createAnonymous(SOURCE_A)).statusCode).toBe(201);

      h.advance(HOUR_MS);
      expect((await h.createOwned(OWNER_A, SOURCE_A)).statusCode).toBe(201);
    } finally {
      await h.close();
    }
  });
});
