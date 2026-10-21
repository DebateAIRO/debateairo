import { describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { StaffCapabilitySchema, FundedActiveStaffCapabilitiesSchema, staffContractInventory } from "@debateai/contract";
import { authorizationPolicyInventory, buildApi, type AskApplication } from "@debateai/api";
import { StaffAccessService, staffTokenHash } from "../../apps/api/src/staff/access.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
import { TypedDomainError } from "@debateai/kernel";
import { encrypt } from "@debateai/crypto";
import { threatReportEmailReader } from "../../apps/api/src/staff/threat-reports.js";

describe("S04 threat report staff contract", () => {
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

function grantedServer(own = false, proofAvailable = true, proofTarget?: "CURRENT" | "OTHER") {
  const reportRef = randomUUID();
  const boundTarget = proofTarget === "CURRENT" ? reportRef : proofTarget === "OTHER" ? randomUUID() : undefined;
  const oldest = { report_ref: reportRef, kept_at: new Date("2026-10-20T09:00:00.000Z"),
    decision: "UNREAD", decided_at: null };
  const newer = { report_ref: randomUUID(), kept_at: new Date("2026-10-20T10:00:00.000Z"),
    decision: "REPORTED", decided_at: new Date("2026-10-20T11:00:00.000Z") };
  const decided = new Set<string>();
  const events: Record<string, unknown>[] = [];
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
  const audit = (action: string, report: string | null) => events.push({ event_id: randomUUID(),
    actor_staff_id: record.context.staffId, event: `THREAT_REPORT_${action}`, threat_report_ref: report,
    recorded_at: "2026-10-20T12:00:00.000Z" });
  const repository = {
    list: async () => { audit("LIST", null); return [oldest, newer]; },
    countUnread: async () => 1,
    read: async () => {
      if (own) throw new TypedDomainError("THREAT_REPORT_OWN", "THREAT_REPORT_OWN");
      audit("READ", reportRef);
      return { ...oldest, question: "Should I harm my neighbour?", account_user_id: randomUUID(), held_email: null };
    },
    decide: async (_context: unknown, _token: string, target: string, decision: "REPORTED" | "NOT_REPORTED") => {
      if (decided.has(target)) throw new TypedDomainError("THREAT_REPORT_ALREADY_DECIDED", "THREAT_REPORT_ALREADY_DECIDED");
      decided.add(target);
      audit(decision, target);
      return decision;
    }
  };
  const server = buildApi({ application, sessions, allowedOrigin: TEST_APP_ORIGIN, staffPolicyVersion: 2,
    staffAccess: access, staff: { access, sessions,
      repository: { readAuditPage: async () => ({ events, next_cursor: null, order: "RECORDED_AT_ID_ASC" }) } as never,
      webauthn: {} as never, intents: {} as never,
      threatReports: { repository, readRecipientEmail: async () => "asker@example.test" } } as never });
  return { server, reportRef, newerRef: newer.report_ref, events };
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
    const { server, reportRef } = grantedServer();
    try {
      const response = await server.inject({ method: "GET", url: `/v1/admin/threat-reports/${reportRef}`, headers: headers() });
      expect({ status: response.statusCode, cache: response.headers["cache-control"], body: response.json() }).toEqual({
        status: 200, cache: "no-store", body: { report_ref: reportRef, question: "Should I harm my neighbour?",
          kept_at: "2026-10-20T09:00:00.000Z", account: { email: "asker@example.test", user_id: expect.any(String) },
          decision: "UNREAD", decided_at: null } });
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
    const { server, events } = grantedServer();
    try {
      const response = await server.inject({ method: "GET", url: "/v1/admin/threat-reports/summary", headers: headers() });
      expect({ status: response.statusCode, body: response.json(), events }).toEqual({
        status: 200, body: { unread: 1 }, events: [] });
    } finally { await server.close(); }
  });

  it("refuses a decision whose proof handle resolves to no proof", async () => {
    // Property: knowing a report ref does not grant the ability to decide it.
    // Mutant: call repository.decide when readActionProof returns null; list projection is a neighbour.
    const { server, reportRef, events } = grantedServer(false, false);
    try {
      const response = await server.inject({ method: "POST", url: `/v1/admin/threat-reports/${reportRef}/decision`,
        headers: headers(true), payload: decisionPayload("REPORTED") });
      expect({ status: response.statusCode, body: response.json(), events }).toEqual({
        status: 403, body: { error: "STAFF_REQUEST_REFUSED" }, events: [] });
    } finally { await server.close(); }
  });

  it("refuses a proof bound to a different report", async () => {
    // Property: the WebAuthn action binding names the exact kept report.
    // Mutant: bind a constant targetId; a changed summary count is a neighbour.
    const { server, reportRef, events } = grantedServer(false, true, "OTHER");
    try {
      const response = await server.inject({ method: "POST", url: `/v1/admin/threat-reports/${reportRef}/decision`,
        headers: headers(true), payload: decisionPayload("REPORTED") });
      expect({ status: response.statusCode, events }).toEqual({ status: 403, events: [] });
    } finally { await server.close(); }
  });

  it.each(["REPORTED", "NOT_REPORTED"] as const)("decides %s with a proof and writes one audit entry", async decision => {
    // Property: one verified action changes one report and records the matching audit action.
    // Mutant: pass the opposite decision; a summary-count change is a neighbour.
    const { server, reportRef, events } = grantedServer(false, true, "CURRENT");
    try {
      const response = await server.inject({ method: "POST", url: `/v1/admin/threat-reports/${reportRef}/decision`,
        headers: headers(true), payload: decisionPayload(decision) });
      expect({ status: response.statusCode, body: response.json(), event: events[0]?.event }).toEqual({
        status: 200, body: { report_ref: reportRef, decision }, event: `THREAT_REPORT_${decision}` });
    } finally { await server.close(); }
  });

  it("refuses a second decision on the same report with 409", async () => {
    // Property: a decided report cannot receive another decision or audit action.
    // Mutant: remove the already-decided guard; a different report may still be decided.
    const { server, reportRef, events } = grantedServer();
    try {
      await server.inject({ method: "POST", url: `/v1/admin/threat-reports/${reportRef}/decision`,
        headers: headers(true), payload: decisionPayload("REPORTED") });
      const response = await server.inject({ method: "POST", url: `/v1/admin/threat-reports/${reportRef}/decision`,
        headers: headers(true), payload: decisionPayload("NOT_REPORTED") });
      expect({ status: response.statusCode, body: response.json(), eventCount: events.length }).toEqual({
        status: 409, body: { error: "THREAT_REPORT_ALREADY_DECIDED" }, eventCount: 1 });
    } finally { await server.close(); }
  });

  it("shows list, read and both decision audit entries without question or email", async () => {
    // Property: audit reads a fixed metadata row, never the kept content or account.
    // Mutant: add question to an audit event; a list-cache change is a neighbour.
    const { server, reportRef, newerRef } = grantedServer();
    try {
      await server.inject({ method: "GET", url: "/v1/admin/threat-reports", headers: headers() });
      await server.inject({ method: "GET", url: `/v1/admin/threat-reports/${reportRef}`, headers: headers() });
      for (const [ref, decision] of [[reportRef, "REPORTED"], [newerRef, "NOT_REPORTED"]] as const) {
        await server.inject({ method: "POST", url: `/v1/admin/threat-reports/${ref}/decision`,
          headers: headers(true), payload: decisionPayload(decision) });
      }
      const response = await server.inject({ method: "GET", url: "/v1/admin/audit?limit=20", headers: headers() });
      const body = response.json();
      expect({ status: response.statusCode, actions: body.events?.map((event: { event: string }) => event.event),
        leaked: JSON.stringify(body).includes("Should I harm my neighbour?") || JSON.stringify(body).includes("asker@example.test") }).toEqual({
        status: 200, actions: ["THREAT_REPORT_LIST", "THREAT_REPORT_READ", "THREAT_REPORT_REPORTED", "THREAT_REPORT_NOT_REPORTED"],
        leaked: false });
    } finally { await server.close(); }
  });
});
