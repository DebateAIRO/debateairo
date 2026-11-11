import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { StaffAccessService, staffTokenHash } from "../../apps/api/src/staff/access.js";
import { drainTeamLimitNotices } from "../../apps/api/src/staff/team-limit.js";
import { StaffAlertError } from "../../apps/api/src/staff/alerts.js";
import { testHttpIdentity, testSessionApplication, testSessionHeaders, TEST_APP_ORIGIN } from "../support/httpSession.js";

/**
 * Decision 24 over HTTP: the routes with the real access service and fake data ports (the database's own refusals:
 * team-limit-database.test.ts). All amounts are made up.
 */
const account = testHttpIdentity("team-limit-http");
const token = randomBytes(32).toString("base64url"), csrf = randomBytes(32).toString("base64url");
const application = {
  withContentLease: async (_id: string, use: () => unknown) => use(), submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
  readAnswer: async () => null, readRunAnswer: async () => null, readRun: async () => null,
  readAnswerIndex: async (_s: unknown, limit: number, offset: number) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
  readInspection: async () => null, readLedgerDigest: async () => null, readNode: async () => null,
  recordInvestigation: async () => null, unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
  readDeployment: async () => ({ register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [], fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" } }),
  events: async function* () {}
} as unknown as AskApplication;
const headers = (mutation = false) => {
  const base = testSessionHeaders(account, mutation);
  return { ...base, cookie: `${base.cookie}; __Host-debateai-staff=${token}${mutation ? `; __Host-debateai-staff-csrf=${csrf}` : ""}`, ...(mutation ? { "x-staff-csrf-token": csrf } : {}) };
};
const page = { amount_micros: 5000, revision: 3, spent_micros: 100, committed_micros: 0, month_starts_at: "2026-11-01T00:00:00+00:00", month_ends_at: "2026-12-01T00:00:00+00:00", is_owner: true, partner: null, log: [] };
const STATE = { currentMicros: 5000, expectedRevision: 3 };
let close: (() => Promise<unknown>) | undefined;
afterEach(async () => { await close?.(); close = undefined; });
function server(options: Readonly<{ allowed?: boolean; proof?: boolean; locked?: boolean; designation?: "OWNER" | "DELEGATED"; databaseSays?: string }> = {}) {
  const record = Object.freeze({ context: Object.freeze({ staffId: randomUUID(), userId: account.authenticated.userId, ordinarySessionId: account.authenticated.session.session_id,
    privilegeSessionId: randomUUID(), designation: options.designation ?? "OWNER", securityEpoch: 1, accountSecurityEpoch: 1, grantRevision: 1, capabilities: Object.freeze(["TEAM_READ"]) }),
    csrfTokenHash: staffTokenHash(csrf)!, expiresAt: new Date(Date.now() + 600_000) });
  const asked: string[] = [], bindings: unknown[] = [], calls: Record<string, unknown>[] = [], intents: Record<string, unknown>[] = [];
  const sessions = testSessionApplication([account]);
  const access = new StaffAccessService({
    readAuthentication: async () => record, readCurrentContext: async () => record,
    authorize: async (input: { capability: string }) => { asked.push(input.capability); return options.allowed !== false; },
    readActionProof: async (input: { binding: unknown }) => { bindings.push(input.binding); return options.proof === false ? null : { proofId: randomUUID(), binding: input.binding }; },
    readInvitationContext: async () => null, readOwnerPossessionContext: async () => null
  } as never, sessions);
  const write = (name: string) => async (input: Record<string, unknown>) => {
    calls.push({ name, ...input });
    if (options.databaseSays !== undefined) throw new Error(options.databaseSays);
    return { operationId: input.operationId, outcome: "COMPLETED", recordedAt: new Date("2026-11-02T00:00:00Z") };
  };
  const repository = { readPage: async () => page, readCommand: async () => STATE, setLimit: write("setLimit"), recordPractice: write("recordPractice"), grantPartner: write("grantPartner"), revokePartner: write("revokePartner") };
  const built = buildApi({ application, sessions, allowedOrigin: TEST_APP_ORIGIN, staffPolicyVersion: 2, staffAccess: access, staff: {
    access, sessions, repository: {} as never, webauthn: {
      beginAction: async (_c: unknown, binding: unknown) => { bindings.push(binding); return { challenge_handle: randomBytes(32).toString("base64url"), options: { challenge: randomBytes(32).toString("base64url"), rpId: "example.test", timeout: 300000, userVerification: "required", allowCredentials: [] } }; }
    } as never,
    intents: { mutation: async (input: Record<string, unknown>) => { intents.push(input); return { schema: "staff-alert-v1", event: input.event, operationId: input.operationId, envelope: {} }; } } as never,
    readiness: { readIndependentAlertReadiness: async () => options.locked === true ? "UNAVAILABLE" : "READY" },
    teamLimit: { repository: repository as never }
  } as never });
  close = () => built.close();
  return { built, asked, bindings, calls, intents };
}
const handle = () => randomBytes(32).toString("base64url");
const setBody = (change: Record<string, unknown> = {}) => ({ amount_micros: 7000, current_micros: 5000, expected_revision: 3, operation_id: randomUUID(), proof_handle: handle(), ...change });

describe("reading", () => {
  it("the two accounts get the page, no-store; anyone else a plain refusal and no data", async () => {
    const yes = server();
    const ok = await yes.built.inject({ method: "GET", url: "/v1/admin/team-limit", headers: headers() });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ amount_micros: 5000, revision: 3 });
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(yes.asked).toContain("TEAM_LIMIT_SET");
    await close!(); close = undefined;
    const no = server({ allowed: false, designation: "DELEGATED" });
    const refused = await no.built.inject({ method: "GET", url: "/v1/admin/team-limit", headers: headers() });
    expect(refused.statusCode).toBe(403);
    expect(refused.body).not.toContain("5000");
  });
});
describe("changing", () => {
  it("applies with a proof bound to the amount and the current value, and alerts", async () => {
    const s = server(), body = setBody();
    const response = await s.built.inject({ method: "POST", url: "/v1/admin/team-limit", headers: headers(true), payload: body });
    expect(response.statusCode, response.body).toBe(200);
    expect(s.calls[0]).toMatchObject({ name: "setLimit", amountMicros: 7000, currentMicros: 5000, expectedRevision: 3, operationId: body.operation_id });
    expect(s.intents[0]).toMatchObject({ event: "TEAM_LIMIT_CHANGED", operationId: body.operation_id });
    expect(JSON.stringify(s.intents[0])).not.toContain("7000");
    const other = server();
    await other.built.inject({ method: "POST", url: "/v1/admin/team-limit", headers: headers(true), payload: { ...body, amount_micros: 7001 } });
    expect((other.bindings[0] as { bodySha256: string }).bodySha256).not.toBe((s.bindings[0] as { bodySha256: string }).bodySha256);
    await other.built.close();
  });
  it("refuses a page looking at another value before any proof is read", async () => {
    for (const change of [{ current_micros: 4999 }, { expected_revision: 2 }]) {
      const s = server();
      const response = await s.built.inject({ method: "POST", url: "/v1/admin/team-limit", headers: headers(true), payload: setBody(change) });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: "TEAM_LIMIT_STALE" });
      expect(s.bindings).toEqual([]);
      expect(s.calls).toEqual([]);
      await close!(); close = undefined;
    }
  });
  it("no valid proof, no change", async () => {
    const s = server({ proof: false });
    expect((await s.built.inject({ method: "POST", url: "/v1/admin/team-limit", headers: headers(true), payload: setBody() })).statusCode).toBe(403);
    expect(s.calls).toEqual([]);
  });
  it("a delegate is refused before the current value is read", async () => {
    const s = server({ allowed: false, designation: "DELEGATED" });
    const response = await s.built.inject({ method: "POST", url: "/v1/admin/team-limit", headers: headers(true), payload: setBody() });
    expect(response.statusCode).toBe(403);
    expect(s.bindings).toEqual([]);
    expect(s.calls).toEqual([]);
  });
  it("team tools locked refuses, and starts no passkey ceremony", async () => {
    const s = server({ locked: true });
    expect((await s.built.inject({ method: "POST", url: "/v1/admin/team-limit", headers: headers(true), payload: setBody() })).json()).toEqual({ error: "STAFF_ALERT_UNAVAILABLE" });
    const { proof_handle: _unused, ...fields } = setBody();
    const options = await s.built.inject({ method: "POST", url: "/v1/admin/webauthn/action/options", headers: headers(true), payload: { intent: { action: "TEAM_LIMIT_SET", ...fields } } });
    expect(options.json()).toEqual({ error: "STAFF_ALERT_UNAVAILABLE" });
    expect(s.bindings).toEqual([]);
    expect(s.calls).toEqual([]);
  });
  it("the database's stale answer and second-partner answer reach the page in plain codes", async () => {
    const stale = server({ databaseSays: "STAFF_REVISION_INVALID" });
    expect((await stale.built.inject({ method: "POST", url: "/v1/admin/team-limit", headers: headers(true), payload: setBody() })).json()).toEqual({ error: "TEAM_LIMIT_STALE" });
    await close!(); close = undefined;
    const second = server({ databaseSays: "TEAM_LIMIT_PARTNER_EXISTS" });
    const target = randomUUID();
    const response = await second.built.inject({ method: "POST", url: `/v1/admin/team-limit/partner/${target}`, headers: headers(true),
      payload: { expected_revision: 1, operation_id: randomUUID(), reason: { code: "GRANT_CHANGE" }, proof_handle: handle() } });
    expect(response.statusCode).toBe(409);
    expect(second.asked).toContain("TEAM_GRANT");
    expect(second.calls[0]).toMatchObject({ name: "grantPartner", targetStaffId: target });
  });
  it("partner routes ask for the Owner's TEAM_GRANT, never the limit authority", async () => {
    const s = server();
    const target = randomUUID();
    const response = await s.built.inject({ method: "DELETE", url: `/v1/admin/team-limit/partner/${target}`, headers: headers(true),
      payload: { expected_revision: 1, operation_id: randomUUID(), reason: { code: "GRANT_CHANGE" }, proof_handle: handle() } });
    expect(response.statusCode, response.body).toBe(200);
    expect(s.asked).toContain("TEAM_GRANT");
    expect(s.asked).not.toContain("TEAM_LIMIT_SET");
    expect(s.calls[0]).toMatchObject({ name: "revokePartner", targetStaffId: target });
    expect(s.intents[0]).toMatchObject({ event: "TEAM_LIMIT_PARTNER_REVOKED", subjectStaffId: target });
  });
  it("the mail loop: a sent notice is settled, a failed send is reported failed and touches nothing else, and no mail carries params", async () => {
    const sent: Array<Record<string, unknown>> = [], settled: Array<[string, boolean]> = [];
    const claims = [{ notice_id: "a", kind: "LIMIT_CHANGED", recipient_staff_id: "s", claim_token: "t" }, { notice_id: "b", kind: "PARTNER_CHANGED", recipient_staff_id: "s", claim_token: "t" }, { notice_id: "c", kind: "LIMIT_CHANGED", recipient_staff_id: "s", claim_token: "t" }];
    await drainTeamLimitNotices({ repository: { claimNotices: async () => claims as never, noticeUser: async (id: string) => id === "c" ? null : "user", completeNotice: async (id: string, _t: string, delivered: boolean) => { settled.push([id, delivered]); } },
      mail: { sendTemplated: async (mail: Record<string, unknown>) => { if (mail.messageId === "b") throw new StaffAlertError("STAFF_ALERT_UNAVAILABLE"); sent.push(mail); } } as never, readEmail: async () => "someone@example.test" });
    expect(settled).toEqual([["a", true], ["b", false], ["c", false]]);
    expect(sent).toEqual([{ to: "someone@example.test", templateId: "TEAM_LIMIT_CHANGED", locale: "en", params: {}, messageId: "a" }]);
  });
});
