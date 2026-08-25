import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import type { LegacyRunClaimApplication } from "../../apps/api/src/legacy-claim.js";
import {
  RETIRED_DEV_HEADER,
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const identity = testHttpIdentity("s9-legacy-claim");

function application(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] },
      scorecards: [],
      model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

function buildClaimApi(claim: LegacyRunClaimApplication["claim"]) {
  return buildApi({
    application: application(),
    sessions: testSessionApplication([identity]),
    allowedOrigin: TEST_APP_ORIGIN,
    legacyRunClaim: { claim }
  });
}

describe("S9 legacy-token retirement HTTP boundary", () => {
  it("claims through the authenticated cookie, CSRF, and typed body only", async () => {
    const claim = vi.fn<LegacyRunClaimApplication["claim"]>(async () => ({
      status: "CLAIMED",
      claimedCount: 2
    }));
    const api = buildClaimApi(claim);
    const response = await api.inject({
      method: "POST",
      url: "/v1/account/legacy-runs/claim",
      headers: testSessionHeaders(identity, true),
      payload: { legacy_token: "old-browser-token" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "CLAIMED", claimed_count: 2 });
    expect(claim).toHaveBeenCalledWith({
      authenticated: identity.authenticated,
      legacyToken: "old-browser-token",
      source: expect.objectContaining({ userAgent: expect.stringContaining("test-http-session/") })
    });
    await api.close();
  });

  it("refuses missing auth, missing CSRF, malformed input, and the retired header before claiming", async () => {
    const claim = vi.fn<LegacyRunClaimApplication["claim"]>(async () => ({
      status: "NO_MATCH",
      claimedCount: 0
    }));
    const api = buildClaimApi(claim);
    const requests = [
      await api.inject({
        method: "POST",
        url: "/v1/account/legacy-runs/claim",
        payload: { legacy_token: "old-browser-token" }
      }),
      await api.inject({
        method: "POST",
        url: "/v1/account/legacy-runs/claim",
        headers: testSessionHeaders(identity),
        payload: { legacy_token: "old-browser-token" }
      }),
      await api.inject({
        method: "POST",
        url: "/v1/account/legacy-runs/claim",
        headers: testSessionHeaders(identity, true),
        payload: { legacy_token: "", extra: true }
      }),
      await api.inject({
        method: "POST",
        url: "/v1/account/legacy-runs/claim",
        headers: {
          ...testSessionHeaders(identity, true),
          [RETIRED_DEV_HEADER]: "old-browser-token"
        },
        payload: { legacy_token: "old-browser-token" }
      })
    ];
    expect(requests.map((response) => response.statusCode)).toEqual([401, 403, 400, 401]);
    expect(claim).not.toHaveBeenCalled();
    await api.close();
  });

  it("maps an invalidated session at the proof-bound capability to SESSION_REQUIRED", async () => {
    const claim = vi.fn<LegacyRunClaimApplication["claim"]>(async () => ({
      status: "SESSION_INVALID",
      claimedCount: 0
    }));
    const api = buildClaimApi(claim);
    const response = await api.inject({
      method: "POST",
      url: "/v1/account/legacy-runs/claim",
      headers: testSessionHeaders(identity, true),
      payload: { legacy_token: "old-browser-token" }
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "SESSION_REQUIRED" });
    expect(claim).toHaveBeenCalledOnce();
    await api.close();
  });
});
