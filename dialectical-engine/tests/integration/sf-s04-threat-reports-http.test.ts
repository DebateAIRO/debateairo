import { describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { StaffCapabilitySchema, FundedActiveStaffCapabilitiesSchema, ThreatReportSchema, staffContractInventory } from "@debateai/contract";
import { authorizationPolicyInventory, buildApi, type AskApplication } from "@debateai/api";
import { StaffAccessService, staffTokenHash } from "../../apps/api/src/staff/access.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
import { TypedDomainError } from "@debateai/kernel";
import { encrypt } from "@debateai/crypto";
import { threatReportEmailReader } from "../../apps/api/src/staff/threat-reports.js";
import { PostgresThreatReportRepository } from "../../packages/db/src/threat-reports.js";
import { SUPPORT_PAGE_ROUTES } from "../../packages/support-kb/src/catalog.js";

describe("S04 threat report staff contract", () => {
  it("lists the threat reports page among shipped support page routes", () => {
    // Property: a support catalog consumer can identify the shipped staff page as a route.
    // Mutant: omit this page from SUPPORT_PAGE_ROUTES; changing its API path is a neighbour.
    expect(SUPPORT_PAGE_ROUTES).toContain("/admin/threat-reports");
  });
  it("passes a retained email only to the prepared-erasure keep writer", async () => {
    const accountId = randomUUID();
    const seen: { sql: string; values: unknown[] | undefined }[] = [];
    const repository = new PostgresThreatReportRepository({ query: async (sql: string, values?: unknown[]) => {
      seen.push({ sql, values });
      return { rows: [{ report_ref: ref }] };
    } } as never);
    await expect(repository.keepWithHeldEmail("Kept question", accountId, "asker@example.test")).resolves.toBe(ref);
    expect(seen).toEqual([{ sql: "SELECT staff.keep_threat_report_with_email($1::text,$2::uuid,$3::text) report_ref",
      values: ["Kept question", accountId, "asker@example.test"] }]);
  });

  it("decrypts the live user's email with the user DEK and the identity AAD", async () => {
    // Property: the item route's email dependency opens only the stored identity envelope.
    // Mutant: use a different AAD or return ciphertext; a list-order change is a neighbour.
    const user = randomUUID(), key = Buffer.alloc(32, 6);
    const encrypted = encrypt(key, Buffer.from("asker@example.test"),
      ["identity", "user.email_ciphertext", user, "run:none", user, `user-dek:${user}`, "1"]);
    const rows = { rows: [{ email_ciphertext: encrypted }] };
    const query = async (sql: string, values: unknown[]) => {
      expect(sql).toContain('identity."user"');
      expect(values).toEqual([user]);
      return rows;
    };
    const read = threatReportEmailReader({ query } as never,
      { load: async () => Buffer.from(key) } as never);
    expect(await read(user)).toBe("asker@example.test");
  });
  it("accepts the dedicated threat report capability", () => {
    // Property: a THREAT_REPORT grant crosses the contract boundary.
    // Mutant: remove THREAT_REPORT from StaffCapabilitySchema; neighbouring AUDIT_READ changes are irrelevant.
    expect(StaffCapabilitySchema.safeParse("THREAT_REPORT").success).toBe(true);
  });

  it("accepts an owner holding the eight existing capabilities and THREAT_REPORT", () => {
    // Property: the funded elevation projection accepts the owner's whole capability set.
    // Mutant: keep the old max(8); a changed list route is a neighbouring non-member.
    const capabilities = ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ",
      "EMERGENCY_DISABLE", "ALLOWANCE_WRITE", "PUBLICATION_REVIEW", "THREAT_REPORT"];
    expect(FundedActiveStaffCapabilitiesSchema.safeParse(capabilities).success).toBe(true);
  });
});

const routes = [
  ["GET", "/v1/admin/threat-reports", "list"],
  ["GET", "/v1/admin/threat-reports/summary", "summary"],
  ["GET", "/v1/admin/threat-reports/{reportRef}", "read"],
  ["POST", "/v1/admin/threat-reports/{reportRef}/decision", "decide"]
] as const;
const account = testHttpIdentity("sf-s04-threat-http");
const token = randomBytes(32).toString("base64url");
const csrf = randomBytes(32).toString("base64url");
const ref = randomUUID();
const application: AskApplication = {
  withContentLease: async (_id, use) => use(), submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
  readAnswer: async () => null, readRunAnswer: async () => null, readRun: async () => null,
  readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
  readInspection: async () => null, readLedgerDigest: async () => null, readNode: async () => null,
  recordInvestigation: async () => null, unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
  readDeployment: async () => ({ register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [], fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" } }),
  events: async function* () {}
};

function deniedServer() {
  let databaseCalls = 0;
  const record = Object.freeze({
    context: Object.freeze({ staffId: randomUUID(), userId: account.authenticated.userId,
      ordinarySessionId: account.authenticated.session.session_id, privilegeSessionId: randomUUID(),
      designation: "DELEGATED" as const, securityEpoch: 1, accountSecurityEpoch: 1,
      grantRevision: 1, capabilities: Object.freeze(["TEAM_READ"] as const) }),
    csrfTokenHash: staffTokenHash(csrf)!, expiresAt: new Date(Date.now() + 600_000)
  });
  const sessions = testSessionApplication([account]);
  const access = new StaffAccessService({
    readAuthentication: async () => record, readCurrentContext: async () => record,
    authorize: async () => false, readActionProof: async () => null,
    readInvitationContext: async () => null, readOwnerPossessionContext: async () => null
  } as never, sessions);
  const repository = { list: async () => { databaseCalls++; return []; },
    countUnread: async () => { databaseCalls++; return 0; },
    read: async () => { databaseCalls++; return null; },
    decide: async () => { databaseCalls++; return "REPORTED"; } };
  const server = buildApi({ application, sessions, allowedOrigin: TEST_APP_ORIGIN, staffPolicyVersion: 2,
    staffAccess: access, staff: { access, sessions, repository: {} as never, webauthn: {} as never,
      intents: {} as never, threatReports: { repository, readRecipientEmail: async () => "asker@example.test" } } as never });
  return { server, databaseCalls: () => databaseCalls };
}

function headers(mutation = false) {
  const base = testSessionHeaders(account, mutation);
  return { ...base, cookie: `${base.cookie}; __Host-debateai-staff=${token}${mutation ? `; __Host-debateai-staff-csrf=${csrf}` : ""}`,
    ...(mutation ? { "x-staff-csrf-token": csrf } : {}) };
}

function grantedServer(own = false, proofAvailable = true, proofTarget?: "CURRENT" | "OTHER", emailAvailable = true, anonymous = false) {
  const reportRef = randomUUID();
  const boundTarget = proofTarget === "CURRENT" ? reportRef : proofTarget === "OTHER" ? randomUUID() : undefined;
  const oldest = { report_ref: reportRef, kept_at: new Date("2026-10-20T09:00:00.000Z"),
    decision: "UNREAD", decided_at: null };
  const newer = { report_ref: randomUUID(), kept_at: new Date("2026-10-20T10:00:00.000Z"),
    decision: "REPORTED", decided_at: new Date("2026-10-20T11:00:00.000Z") };
  const decided = new Set<string>();
  const readCalls: string[] = [];
  const reportUserId = randomUUID();
  const record = Object.freeze({ context: Object.freeze({ staffId: randomUUID(), userId: account.authenticated.userId,
    ordinarySessionId: account.authenticated.session.session_id, privilegeSessionId: randomUUID(),
    designation: "OWNER" as const, securityEpoch: 1, accountSecurityEpoch: 1, grantRevision: 1,
    capabilities: Object.freeze(["THREAT_REPORT", "AUDIT_READ"] as const) }),
    csrfTokenHash: staffTokenHash(csrf)!, expiresAt: new Date(Date.now() + 600_000) });
  const sessions = testSessionApplication([account]);
  const access = new StaffAccessService({
    readAuthentication: async () => record, readCurrentContext: async () => record,
    authorize: async () => true, readActionProof: async (input: { binding: { targetId: string } }) =>
      proofAvailable && (boundTarget === undefined || input.binding.targetId === boundTarget) ? ({ proofId: randomUUID() }) : null,
    readInvitationContext: async () => null, readOwnerPossessionContext: async () => null
  } as never, sessions);
  const repository = {
    list: async () => [oldest, newer],
    countUnread: async () => 1,
    peekAccount: async () => {
      if (own) throw new TypedDomainError("THREAT_REPORT_OWN", "THREAT_REPORT_OWN");
      return { account_user_id: anonymous ? null : reportUserId, has_held_email: false };
    },
    read: async () => {
      readCalls.push(reportRef);
      return { ...oldest, question: "Should I harm my neighbour?", account_user_id: anonymous ? null : reportUserId, held_email: null };
    },
    decide: async (_context: unknown, _token: string, target: string, decision: "REPORTED" | "NOT_REPORTED") => {
      if (decided.has(target)) throw new TypedDomainError("THREAT_REPORT_ALREADY_DECIDED", "THREAT_REPORT_ALREADY_DECIDED");
      decided.add(target);
      return decision;
    }
  };
  const server = buildApi({ application, sessions, allowedOrigin: TEST_APP_ORIGIN, staffPolicyVersion: 2,
    staffAccess: access, staff: { access, sessions,
      repository: { readAuditPage: async () => ({ events: [], next_cursor: null, order: "RECORDED_AT_ID_ASC" }) } as never,
      webauthn: {} as never, intents: {} as never,
      threatReports: { repository, readRecipientEmail: async () => emailAvailable ? "asker@example.test" : null } } as never });
  return { server, reportRef, newerRef: newer.report_ref, readCalls, decisionCount: () => decided.size };
}

const decisionPayload = (decision: "REPORTED" | "NOT_REPORTED") => ({
  decision, expected_revision: 1, operation_id: randomUUID(), proof: randomBytes(32).toString("base64url")
});

describe("S04 threat report HTTP authorization", () => {
  it("governs and mounts the four threat-report routes", async () => {
    // Property: no threat endpoint can exist outside the staff inventory.
    // Mutant: omit one staffAuthorizationPolicyInventory row; an unrelated audit row is a neighbour.
    const expected = routes.map(([method, path, action]) => ({ route: `${method} ${path}`, auth: "staff",
      staffCapability: "THREAT_REPORT", resource: "staff-threat-report", action }));
    expect(authorizationPolicyInventory.filter(row => row.route.includes("/v1/admin/threat-reports"))).toEqual(expected);
    const { server } = deniedServer();
    try {
      for (const [method, path] of routes) {
        expect(server.hasRoute({ method, url: path.replace("{reportRef}", ":reportRef") })).toBe(true);
        expect(staffContractInventory.routes).toContain(`${method} ${path}`);
      }
    } finally { await server.close(); }
  });

  it.each(routes)("a staff member without THREAT_REPORT gets 403 before the database on %s %s", async (method, path) => {
    // Property: capability refusal occurs before any repository call.
    // Mutant: skip requireCapability; changing the read projection is a neighbour.
    const { server, databaseCalls } = deniedServer();
    try {
      const response = await server.inject({ method, url: path.replace("{reportRef}", ref),
        headers: headers(method === "POST"), ...(method === "POST" ? { payload: {} } : {}) });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "STAFF_REQUEST_REFUSED" });
      expect(databaseCalls()).toBe(0);
    } finally { await server.close(); }
  });

  it("lists reports oldest first with no-store", async () => {
    // Property: the queue response exposes metadata in repository order without a cacheable response.
    // Mutant: omit Cache-Control or reverse rows; a changed decision body is a neighbour.
    const { server, reportRef } = grantedServer();
    try {
      const response = await server.inject({ method: "GET", url: "/v1/admin/threat-reports", headers: headers() });
      expect({ status: response.statusCode, cache: response.headers["cache-control"], body: response.json() }).toEqual({
        status: 200, cache: "no-store", body: { reports: [
          { report_ref: reportRef, kept_at: "2026-10-20T09:00:00.000Z", decision: "UNREAD", decided_at: null },
          { report_ref: expect.any(String), kept_at: "2026-10-20T10:00:00.000Z", decision: "REPORTED", decided_at: "2026-10-20T11:00:00.000Z" }
        ] } });
    } finally { await server.close(); }
  });

  it("reads exactly the kept question, time, account and decision with no-store", async () => {
    // Property: staff sees only the contracted item projection after capability enforcement.
    // Mutant: drop account.email or expose an internal column; a list-order change is a neighbour.
    const { server, reportRef, readCalls } = grantedServer();
    try {
      const response = await server.inject({ method: "GET", url: `/v1/admin/threat-reports/${reportRef}`, headers: headers() });
      expect({ status: response.statusCode, cache: response.headers["cache-control"], body: response.json() }).toEqual({
        status: 200, cache: "no-store", body: { report_ref: reportRef, question: "Should I harm my neighbour?",
          kept_at: "2026-10-20T09:00:00.000Z", account: { email: "asker@example.test", user_id: expect.any(String) },
          decision: "UNREAD", decided_at: null } });
      expect(readCalls).toEqual([reportRef]);
    } finally { await server.close(); }
  });

  it("opens a signed-out asker's kept threat and states that no account exists", async () => {
    // Property: an anonymous report remains readable without inventing an email or account identity.
    // Mutant: require an email before the audited read; a changed list order is a neighbour.
    const { server, reportRef, readCalls } = grantedServer(false, true, undefined, false, true);
    try {
      const response = await server.inject({ method: "GET", url: `/v1/admin/threat-reports/${reportRef}`, headers: headers() });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toMatchObject({ question: "Should I harm my neighbour?", account: null });
      expect(ThreatReportSchema.safeParse(response.json()).success).toBe(true);
      expect(readCalls).toEqual([reportRef]);
    } finally { await server.close(); }
  });

  it("does not record a READ when the account email cannot be shown", async () => {
    // Property: a failed item response is not an opening in the staff audit.
    // Mutant: audit inside the SQL read before email resolution; changing list order is a neighbour.
    const { server, reportRef, readCalls } = grantedServer(false, true, undefined, false);
    try {
      const response = await server.inject({ method: "GET", url: `/v1/admin/threat-reports/${reportRef}`, headers: headers() });
      expect(response.statusCode).toBe(503);
      expect(readCalls).toEqual([]);
    } finally { await server.close(); }
  });

  it("refuses opening one's own kept threat", async () => {
    // Property: the repository's own-record refusal reaches the HTTP caller as 403.
    // Mutant: map THREAT_REPORT_OWN to 404; changing summary count is a neighbour.
    const { server, reportRef } = grantedServer(true);
    try {
      const response = await server.inject({ method: "GET", url: `/v1/admin/threat-reports/${reportRef}`, headers: headers() });
      expect({ status: response.statusCode, body: response.json() }).toEqual({
        status: 403, body: { error: "THREAT_REPORT_OWN" } });
    } finally { await server.close(); }
  });

  it("summarizes unread reports without adding an audit event", async () => {
    // Property: the count route is read-only in the audit trail.
    // Mutant: call list in summary; a read-item projection change is a neighbour.
    const { server, readCalls } = grantedServer();
    try {
      const response = await server.inject({ method: "GET", url: "/v1/admin/threat-reports/summary", headers: headers() });
      expect({ status: response.statusCode, body: response.json(), readCalls }).toEqual({
        status: 200, body: { unread: 1 }, readCalls: [] });
    } finally { await server.close(); }
  });

  it("refuses a decision whose proof handle resolves to no proof", async () => {
    // Property: knowing a report ref does not grant the ability to decide it.
    // Mutant: call repository.decide when readActionProof returns null; list projection is a neighbour.
    const { server, reportRef, decisionCount } = grantedServer(false, false);
    try {
      const response = await server.inject({ method: "POST", url: `/v1/admin/threat-reports/${reportRef}/decision`,
        headers: headers(true), payload: decisionPayload("REPORTED") });
      expect({ status: response.statusCode, body: response.json(), decisionCount: decisionCount() }).toEqual({
        status: 403, body: { error: "STAFF_REQUEST_REFUSED" }, decisionCount: 0 });
    } finally { await server.close(); }
  });

  it("refuses a proof bound to a different report", async () => {
    // Property: the WebAuthn action binding names the exact kept report.
    // Mutant: bind a constant targetId; a changed summary count is a neighbour.
    const { server, reportRef, decisionCount } = grantedServer(false, true, "OTHER");
    try {
      const response = await server.inject({ method: "POST", url: `/v1/admin/threat-reports/${reportRef}/decision`,
        headers: headers(true), payload: decisionPayload("REPORTED") });
      expect({ status: response.statusCode, decisionCount: decisionCount() }).toEqual({ status: 403, decisionCount: 0 });
    } finally { await server.close(); }
  });

  it.each(["REPORTED", "NOT_REPORTED"] as const)("decides %s with a proof", async decision => {
    // Property: one verified action changes one report.
    // Mutant: pass the opposite decision; a summary-count change is a neighbour.
    const { server, reportRef, decisionCount } = grantedServer(false, true, "CURRENT");
    try {
      const response = await server.inject({ method: "POST", url: `/v1/admin/threat-reports/${reportRef}/decision`,
        headers: headers(true), payload: decisionPayload(decision) });
      expect({ status: response.statusCode, body: response.json(), decisionCount: decisionCount() }).toEqual({
        status: 200, body: { report_ref: reportRef, decision }, decisionCount: 1 });
    } finally { await server.close(); }
  });

  it("refuses a second decision on the same report with 409", async () => {
    // Property: a decided report cannot receive another decision or audit action.
    // Mutant: remove the already-decided guard; a different report may still be decided.
    const { server, reportRef, decisionCount } = grantedServer();
    try {
      await server.inject({ method: "POST", url: `/v1/admin/threat-reports/${reportRef}/decision`,
        headers: headers(true), payload: decisionPayload("REPORTED") });
      const response = await server.inject({ method: "POST", url: `/v1/admin/threat-reports/${reportRef}/decision`,
        headers: headers(true), payload: decisionPayload("NOT_REPORTED") });
      expect({ status: response.statusCode, body: response.json(), decisionCount: decisionCount() }).toEqual({
        status: 409, body: { error: "THREAT_REPORT_ALREADY_DECIDED" }, decisionCount: 1 });
    } finally { await server.close(); }
  });

});
