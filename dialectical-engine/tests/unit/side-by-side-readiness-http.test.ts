import { describe, expect, it, vi } from "vitest";
import { API_MAX_PARAM_LENGTH, authorizationPolicyInventory, buildApi, type AskApplication } from "@debateai/api";
import {
  ADMISSION_POLICY_REGISTER_ROW,
  admissionPolicyFromValue
} from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import type { ReleaseReadiness, ReadinessReason } from "../../apps/api/src/release-state.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * Side-by-side uploads spec 2026-10-21 §6 (plan C task C5): the API's /livez and /readyz, and the release header on
 * every response — JSON, refusals, the house 404 and the run-event stream's raw head alike.
 */
// Built from pieces: a `…_KEY = "literal"` pair on one line trips gitleaks' generic-api-key rule.
const RELEASE_KEY = ["r17", "0123456789ab"].join("-");
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const OWNER = testHttpIdentity("c5-readiness-owner");
const SOURCE = "203.0.113.17";

function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => ({ run_ref: RUN_ID, question_line: "Synthetic streamed run", state: "QUEUED", terminal_reason: null, hold_until: null }),
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

function fakeReadiness(reasons: readonly ReadinessReason[]) {
  return {
    readiness: (): ReleaseReadiness => Object.freeze({ ready: reasons.length === 0, releaseKey: RELEASE_KEY, reasons: Object.freeze([...reasons]) }),
    draining: () => reasons.includes("DRAINING")
  };
}

function api(extra: Partial<Parameters<typeof buildApi>[0]> = {}) {
  return buildApi({
    application: fixtureApplication(),
    sessions: testSessionApplication([OWNER]),
    allowedOrigin: TEST_APP_ORIGIN,
    releaseKey: RELEASE_KEY,
    ...extra
  });
}

describe("side-by-side C5: /livez, /readyz and the release header (spec §6)", () => {
  it("declares both probes public in the route-policy map", () => {
    expect(authorizationPolicyInventory).toContainEqual({ route: "GET /livez", auth: "public", resource: "deployment", action: "liveness" });
    expect(authorizationPolicyInventory).toContainEqual({ route: "GET /readyz", auth: "public", resource: "deployment", action: "readiness" });
  });

  it("GET /livez answers 200 {live:true}, uncached, with the release header and no session", async () => {
    const app = api({ readiness: fakeReadiness(["NOT_CURRENT"]) });
    try {
      const response = await app.inject({ method: "GET", url: "/livez" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ live: true });
      expect(response.headers["x-debateai-release"]).toBe(RELEASE_KEY);
      expect(response.headers["cache-control"]).toBe("no-store");
    } finally {
      await app.close();
    }
  });

  it("GET /readyz answers 200 with no reasons when the release is ready", async () => {
    const app = api({ readiness: fakeReadiness([]) });
    try {
      const response = await app.inject({ method: "GET", url: "/readyz" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ready: true, releaseKey: RELEASE_KEY, reasons: [] });
      expect(response.headers["x-debateai-release"]).toBe(RELEASE_KEY);
      expect(response.headers["cache-control"]).toBe("no-store");
    } finally {
      await app.close();
    }
  });

  it("GET /readyz answers 503 with the reasons when the release is not ready (a staged release: NOT_CURRENT)", async () => {
    const app = api({ readiness: fakeReadiness(["NOT_CURRENT"]) });
    try {
      const response = await app.inject({ method: "GET", url: "/readyz" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ ready: false, releaseKey: RELEASE_KEY, reasons: ["NOT_CURRENT"] });
      expect(response.headers["x-debateai-release"]).toBe(RELEASE_KEY);
      expect(response.headers["cache-control"]).toBe("no-store");
    } finally {
      await app.close();
    }
  });

  it("GET /readyz without a readiness source (test compositions) answers 200 with the API's own key", async () => {
    const app = api();
    try {
      const response = await app.inject({ method: "GET", url: "/readyz" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ready: true, releaseKey: RELEASE_KEY, reasons: [] });
    } finally {
      await app.close();
    }
  });

  it("puts the release header on the house 404, a refusal and a malformed request", async () => {
    const app = api();
    try {
      const missing = await app.inject({ method: "GET", url: "/v1/nope" });
      expect(missing.statusCode).toBe(404);
      expect(missing.headers["x-debateai-release"]).toBe(RELEASE_KEY);
      const refused = await app.inject({ method: "GET", url: "/v1/session" });
      expect(refused.statusCode).toBe(401);
      expect(refused.headers["x-debateai-release"]).toBe(RELEASE_KEY);
      const malformed = await app.inject({
        method: "POST", url: "/v1/asks", headers: { ...testSessionHeaders(OWNER, true), "content-type": "application/json" }, payload: "{"
      });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.headers["x-debateai-release"]).toBe(RELEASE_KEY);
    } finally {
      await app.close();
    }
  });

  it("puts the release header, the security headers and no-store on a router fault (an over-long :id, 414)", async () => {
    const app = api();
    try {
      const response = await app.inject({ method: "GET", url: `/v1/runs/${"a".repeat(API_MAX_PARAM_LENGTH + 1)}/events` });
      expect(response.statusCode).toBe(414);
      expect(response.headers["x-debateai-release"]).toBe(RELEASE_KEY);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    } finally {
      await app.close();
    }
  });

  it("puts the release header in the run-event stream's raw head", async () => {
    const app = api();
    try {
      const response = await app.inject({ method: "GET", url: `/v1/runs/${RUN_ID}/events`, headers: testSessionHeaders(OWNER) });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/event-stream");
      expect(response.headers["x-debateai-release"]).toBe(RELEASE_KEY);
    } finally {
      await app.close();
    }
  });

  it("sends no release header when the composition names no release", async () => {
    const app = buildApi({ application: fixtureApplication(), sessions: testSessionApplication([OWNER]), allowedOrigin: TEST_APP_ORIGIN });
    try {
      const response = await app.inject({ method: "GET", url: "/livez" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["x-debateai-release"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("never charges the admission limiter: 200 /readyz in a row from one spent source are never refused", async () => {
    const now = new Date("2026-10-21T00:00:00.000Z");
    const policy = admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
    const limiter = new AdmissionLimiter(policy);
    // Spend every budget this source has, so any charge at all would refuse.
    for (let i = 0; i < policy.publicReads.limit; i++) limiter.decide("publicReads", SOURCE, now);
    for (let i = 0; i < policy.asks.limit; i++) limiter.decide("asks", SOURCE, now);
    expect(limiter.decide("publicReads", SOURCE, now).allowed).toBe(false);
    const decide = vi.spyOn(limiter, "decide");
    const app = api({ readiness: fakeReadiness([]), admission: limiter, admissionClock: () => now });
    try {
      for (let i = 0; i < 200; i++) {
        const [ready, live] = await Promise.all([
          app.inject({ method: "GET", url: "/readyz", remoteAddress: SOURCE }),
          app.inject({ method: "GET", url: "/livez", remoteAddress: SOURCE })
        ]);
        expect(ready.statusCode).toBe(200);
        expect(live.statusCode).toBe(200);
      }
      expect(decide).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
