import { describe, expect, it } from "vitest";
import { authorizationPolicyInventory, buildApi, type AskApplication } from "@debateai/api";
import { contractInventory, staffContractInventory } from "@debateai/contract";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const account = testHttpIdentity("task7-http");
const application: AskApplication = {
  withContentLease: async (_id, use) => use(), submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
  readAnswer: async () => null, readRunAnswer: async () => null, readRun: async () => null,
  readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
  readInspection: async () => null, readLedgerDigest: async () => null, readNode: async () => null,
  recordInvestigation: async () => null, unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
  readDeployment: async () => ({ register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [], fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" } }),
  events: async function* () {}
};
function api(version: 1 | 2 = 2) {
  return buildApi({ application, sessions: testSessionApplication([account]), allowedOrigin: TEST_APP_ORIGIN,
    staffPolicyVersion: version } as Parameters<typeof buildApi>[0]);
}

describe("minimal scoped staff HTTP boundary", () => {
  it("governs and mounts all eighteen canonical staff routes under explicit v2", async () => {
    expect(new Set(authorizationPolicyInventory.map(p => p.route))).toEqual(new Set(contractInventory.routes));
    const server = api();
    for (const route of staffContractInventory.routes) {
      const [method, path] = route.split(" ");
      expect(server.hasRoute({ method: method as "GET" | "POST" | "PATCH", url: path!.replace("{staffId}", ":staffId") }), route).toBe(true);
    }
    expect(server.hasRoute({ method: "POST", url: "/v1/admin/bootstrap-owner" })).toBe(false);
    expect(server.hasRoute({ method: "POST", url: "/v1/admin/recover-owner" })).toBe(false);
    await server.close();
  });

  it("preserves the ordinary v1 surface and refuses unavailable v2 enrollment", async () => {
    const old = api(1);
    expect(old.hasRoute({ method: "GET", url: "/v1/admin/enrollment" })).toBe(false);
    await old.close();
    const server = api();
    const denied = await server.inject({ method: "GET", url: "/v1/admin/enrollment" });
    expect(denied.statusCode).toBe(401);
    const unavailable = await server.inject({ method: "GET", url: "/v1/admin/enrollment", headers: testSessionHeaders(account) });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({ error: "STAFF_UNAVAILABLE" });
    await server.close();
  });

  it("requires ordinary exact Origin and base CSRF for candidate and invitation mutations", async () => {
    const server = api();
    for (const path of ["/v1/admin/prerequisites/step-up", "/v1/admin/owner-possession/options", "/v1/admin/owner-possession/verify", "/v1/admin/team/invitations/accept/options", "/v1/admin/team/invitations/accept/verify", "/v1/admin/team/invitations/accept"]) {
      for (const headers of [testSessionHeaders(account), { ...testSessionHeaders(account, true), origin: "https://evil.test" }, { ...testSessionHeaders(account, true), "x-csrf-token": "invalid" }]) {
        const response = await server.inject({ method: "POST", url: path, headers, payload: {} });
        expect(response.statusCode, path).toBe(403);
        expect(response.json()).toEqual({ error: "CSRF_VALIDATION_FAILED" });
      }
      const narrow = await server.inject({ method: "POST", url: path, headers: testSessionHeaders(account, true), payload: {} });
      expect(narrow.statusCode, path).toBe(503);
      expect(narrow.json()).toEqual({ error: "STAFF_UNAVAILABLE" });
    }
    await server.close();
  });
});
