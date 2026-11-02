import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import type { LegacyRunClaimApplication } from "../../apps/api/src/legacy-claim.js";
import { MfaVerificationLimiter } from "../../apps/api/src/mfa.js";
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

function buildClaimApi(claim: LegacyRunClaimApplication["claim"], sourceLimiter?: MfaVerificationLimiter) {
  return buildApi({
    application: application(),
    sessions: testSessionApplication([identity]),
    allowedOrigin: TEST_APP_ORIGIN,
    legacyRunClaim: { claim },
    ...(sourceLimiter === undefined ? {} : { legacyRunClaimSourceLimiter: sourceLimiter })
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

  // NV-01 (security audit run 3): the claim was an unbounded guessing oracle.
  it("refuses a source past its claim ceiling with 429 before the token reaches the application", async () => {
    const claim = vi.fn<LegacyRunClaimApplication["claim"]>(async () => ({
      status: "NO_MATCH",
      claimedCount: 0
    }));
    const limiter = new MfaVerificationLimiter({
      windowMs: 3_600_000, perEnrollment: 2, perSourceAcrossAccounts: 2, temporaryLockMs: 3_600_000, capacity: 100
    });
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const api = buildClaimApi(claim, limiter);
    try {
      const responses = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        responses.push(await api.inject({
          method: "POST",
          url: "/v1/account/legacy-runs/claim",
          headers: testSessionHeaders(identity, true),
          payload: { legacy_token: `old-browser-token-${attempt}` }
        }));
      }
      expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 429]);
      expect(responses[2]!.headers["retry-after"]).toBe("3600");
      expect(responses[2]!.json()).toEqual({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });
      expect(claim).toHaveBeenCalledTimes(2);
      expect(diagnostic).toHaveBeenCalledWith(JSON.stringify({
        event: "api.admission.refused", route: "POST /v1/account/legacy-runs/claim",
        reason: "LEGACY_CLAIM_SOURCE", windowMs: 3_600_000
      }));
    } finally {
      diagnostic.mockRestore();
      await api.close();
    }
  });

  it("answers the account budget's refusal as 429 with its retry-after, not as a schema failure", async () => {
    const claim = vi.fn<LegacyRunClaimApplication["claim"]>(async () => ({
      status: "RATE_LIMITED",
      claimedCount: 0,
      retryAfterMs: 1_500
    }));
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const api = buildClaimApi(claim);
    try {
      const response = await api.inject({
        method: "POST",
        url: "/v1/account/legacy-runs/claim",
        headers: testSessionHeaders(identity, true),
        payload: { legacy_token: "old-browser-token" }
      });
      expect(response.statusCode).toBe(429);
      expect(response.headers["retry-after"]).toBe("2");
      expect(response.json()).toEqual({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });
      expect(claim).toHaveBeenCalledOnce();
    } finally {
      diagnostic.mockRestore();
      await api.close();
    }
  });

  it("wires the source limiter and the account budget in main", async () => {
    const main = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    expect(main).toContain("new MfaVerificationLimiter(LEGACY_RUN_CLAIM_SOURCE_POLICY)");
    expect(main).toContain("legacyRunClaimSourceLimiter");
    expect(main).toContain("LEGACY_RUN_CLAIM_ACCOUNT_POLICY");
  });
});
