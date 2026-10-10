import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authorizationPolicyInventory, buildApi, type AskApplication } from "@debateai/api";
import { contractInventory, staffContractInventory } from "@debateai/contract";
import { StaffAccessService, staffTokenHash } from "../../apps/api/src/staff/access.js";
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

// The staff routes demand a SECOND CSRF token (x-staff-csrf-token + its own cookie) on top of the ordinary one
// (apps/api/src/index.ts, the `authPolicy === "staff"` gate). The REAL StaffAccessService decides whether a
// presented token is this privilege session's; only its database repository is in memory here.
describe("staff second CSRF token on privileged mutations", () => {
  const staffToken = randomBytes(32).toString("base64url"), staffCsrf = randomBytes(32).toString("base64url");
  const otherToken = randomBytes(32).toString("base64url"), targetStaffId = "66666666-6666-4666-8666-666666666666";
  function staffServer() {
    const record = Object.freeze({
      context: Object.freeze({
        staffId: randomUUID(), userId: account.authenticated.userId, ordinarySessionId: account.authenticated.session.session_id,
        privilegeSessionId: randomUUID(), designation: "OWNER" as const, securityEpoch: 1, accountSecurityEpoch: 1, grantRevision: 1,
        capabilities: Object.freeze(["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "EMERGENCY_DISABLE", "AUDIT_READ"] as const)
      }),
      csrfTokenHash: staffTokenHash(staffCsrf)!, expiresAt: new Date(Date.now() + 600_000)
    });
    const repository = {
      readAuthentication: async (input: { staffTokenHash: string }) => input.staffTokenHash === staffTokenHash(staffToken) ? record : null,
      readCurrentContext: async () => record, authorize: async () => true,
      readActionProof: async () => null, readInvitationContext: async () => null, readOwnerPossessionContext: async () => null
    };
    const sessions = testSessionApplication([account]);
    return buildApi({ application, sessions, allowedOrigin: TEST_APP_ORIGIN, staffPolicyVersion: 2,
      staffAccess: new StaffAccessService(repository as never, sessions) } as Parameters<typeof buildApi>[0]);
  }
  /** Valid ordinary session + ordinary CSRF + staff cookie; the staff CSRF header/cookie vary per case. */
  function headers(staff: Readonly<{ header?: string; cookie?: string }> = {}) {
    const base = testSessionHeaders(account, true);
    return {
      ...base,
      cookie: `${base.cookie}; __Host-debateai-staff=${staffToken}${staff.cookie === undefined ? "" : `; __Host-debateai-staff-csrf=${staff.cookie}`}`,
      ...(staff.header === undefined ? {} : { "x-staff-csrf-token": staff.header })
    };
  }
  it.each([
    ["PATCH", `/v1/admin/team/${targetStaffId}/grants`],
    ["POST", `/v1/admin/team/${targetStaffId}/disable`]
  ] as const)("%s %s refuses a missing or wrong staff CSRF token with 403", async (method, url) => {
    const server = staffServer();
    try {
      for (const [label, presented] of [
        ["no staff CSRF header or cookie", headers()],
        ["staff CSRF cookie without the header", headers({ cookie: staffCsrf })],
        ["staff CSRF header without the cookie", headers({ header: staffCsrf })],
        ["header that differs from the cookie", headers({ header: otherToken, cookie: staffCsrf })],
        ["matching pair that is not this privilege session's token", headers({ header: otherToken, cookie: otherToken })],
        ["the ordinary CSRF token replayed as the staff one", headers({ header: account.rawCsrfToken, cookie: account.rawCsrfToken })]
      ] as const) {
        const response = await server.inject({ method, url, headers: presented, payload: {} });
        expect(response.statusCode, label).toBe(403);
        expect(response.json(), label).toEqual({ error: "CSRF_VALIDATION_FAILED" });
      }
      // Control: the same request with this session's staff CSRF pair gets past the gate (the handler then answers
      // for its own reasons), so each 403 above is the second token's doing and nothing else's.
      const accepted = await server.inject({ method, url, headers: headers({ header: staffCsrf, cookie: staffCsrf }), payload: {} });
      expect(accepted.json()).not.toEqual({ error: "CSRF_VALIDATION_FAILED" });
      expect(accepted.statusCode).not.toBe(401);
    } finally {
      await server.close();
    }
  });
});
