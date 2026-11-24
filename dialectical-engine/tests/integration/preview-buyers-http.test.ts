import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { PREVIEW_TEAM_MAX_MEMBERS } from "@debateai/providers";
import { StaffAccessService, staffTokenHash } from "../../apps/api/src/staff/access.js";
import { canonicalPreviewBuyerBinding } from "../../apps/api/src/staff/preview-buyers.js";
import { testHttpIdentity, testSessionApplication, testSessionHeaders, TEST_APP_ORIGIN } from "../support/httpSession.js";

/**
 * The preview's approved buyers (0186) over HTTP: the routes with the real access service and fake data ports (the
 * database's own refusals: preview-buyers-0186.test.ts). Every address here is made up.
 */
const account = testHttpIdentity("preview-buyers-http");
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
/** Made-up accounts: two listed, one on the team line, one that may be added, one not active. */
const ANA = { userId: randomUUID(), address: "stefan.nour@example.com" };
const BEN = { userId: randomUUID(), address: "anabella@example.org" };
const TEAM = { userId: randomUUID(), address: "team.member@example.com" };
const NEW = { userId: randomUUID(), address: "maria.popescu@example.net" };
const IDLE = { userId: randomUUID(), address: "idle.person@example.com" };
const PEOPLE = [ANA, BEN, TEAM, NEW, IDLE];
const blind = (address: string) => createHash("sha256").update(address.normalize("NFKC").trim().toLowerCase()).digest();
const REF_ANA = randomUUID(), REF_BEN = randomUUID();
let close: (() => Promise<unknown>) | undefined;
afterEach(async () => { await close?.(); close = undefined; });

type Options = Readonly<{ allowed?: boolean; designation?: "OWNER" | "DELEGATED"; proof?: boolean; locked?: boolean; applies?: boolean; present?: boolean;
  revision?: number; buyers?: number; team?: readonly string[]; databaseSays?: string }>;
function server(options: Options = {}) {
  const record = Object.freeze({ context: Object.freeze({ staffId: randomUUID(), userId: account.authenticated.userId, ordinarySessionId: account.authenticated.session.session_id,
    privilegeSessionId: randomUUID(), designation: options.designation ?? "OWNER", securityEpoch: 1, accountSecurityEpoch: 1, grantRevision: 1, capabilities: Object.freeze(["TEAM_READ", "TEAM_GRANT"]) }),
    csrfTokenHash: staffTokenHash(csrf)!, expiresAt: new Date(Date.now() + 600_000) });
  const asked: string[] = [], bindings: unknown[] = [], calls: Record<string, unknown>[] = [], intents: Record<string, unknown>[] = [], reads: string[] = [];
  const sessions = testSessionApplication([account]);
  const access = new StaffAccessService({
    readAuthentication: async () => record, readCurrentContext: async () => record,
    authorize: async (input: { capability: string }) => { asked.push(input.capability); return options.allowed !== false; },
    readActionProof: async (input: { binding: unknown }) => { bindings.push(input.binding); return options.proof === false ? null : { proofId: randomUUID(), binding: input.binding }; },
    readInvitationContext: async () => null, readOwnerPossessionContext: async () => null
  } as never, sessions);
  // Fill the list up to `buyers` accounts with made-up rows beyond ANA and BEN.
  const extra = Array.from({ length: Math.max(0, (options.buyers ?? 2) - 2) }, () => ({ ref: randomUUID(), userId: randomUUID(), since: new Date("2026-11-20T10:00:00Z") }));
  const list = { revision: options.revision ?? 4, buyers: [{ ref: REF_ANA, userId: ANA.userId, since: new Date("2026-11-20T10:00:00Z") }, { ref: REF_BEN, userId: BEN.userId, since: new Date("2026-11-21T10:00:00Z") }, ...extra].slice(0, options.buyers ?? 2) };
  const repository = {
    readList: async () => { reads.push("readList"); return list; },
    findAccount: async (index: Buffer) => {
      reads.push("findAccount");
      const person = PEOPLE.find((p) => blind(p.address).equals(index));
      return person === undefined ? null : { userId: person.userId, active: person !== IDLE };
    },
    act: async (input: Record<string, unknown>) => {
      calls.push(input);
      if (options.databaseSays !== undefined) throw new Error(options.databaseSays);
      return { operationId: input.operationId, outcome: "COMPLETED", recordedAt: new Date("2026-11-24T00:00:00Z") };
    }
  };
  const built = buildApi({ application, sessions, allowedOrigin: TEST_APP_ORIGIN, staffPolicyVersion: 2, staffAccess: access, staff: {
    access, sessions, repository: {} as never, webauthn: {
      beginAction: async (_c: unknown, binding: unknown) => { bindings.push(binding); return { challenge_handle: randomBytes(32).toString("base64url"), options: { challenge: randomBytes(32).toString("base64url"), rpId: "example.test", timeout: 300000, userVerification: "required", allowCredentials: [{ id: "aA", type: "public-key" }] } }; }
    } as never,
    intents: { mutation: async (input: Record<string, unknown>) => { intents.push(input); return { schema: "staff-alert-v1", event: input.event, operationId: input.operationId, envelope: {} }; } } as never,
    readiness: { readIndependentAlertReadiness: async () => options.locked === true ? "UNAVAILABLE" : "READY" },
    ...(options.present === false ? {} : { previewBuyers: {
      repository: repository as never,
      readEmail: async (userId: string) => { reads.push("readEmail"); return PEOPLE.find((p) => p.userId === userId)?.address ?? null; },
      blindIndex: blind, teamUserIds: options.team ?? [TEAM.userId], applies: options.applies ?? true
    } })
  } as never });
  close = () => built.close();
  return { built, asked, bindings, calls, intents, reads };
}
const handle = () => randomBytes(32).toString("base64url");
const addBody = (change: Record<string, unknown> = {}) => ({ address: NEW.address, expected_revision: 4, operation_id: randomUUID(), proof_handle: handle(), ...change });
const removeBody = (change: Record<string, unknown> = {}) => ({ expected_revision: 4, operation_id: randomUUID(), proof_handle: handle(), ...change });

describe("reading the list", () => {
  it("the Owner gets each listed account shortened, with the team's count and the cap, no-store, and never a full address or an account id", async () => {
    const s = server();
    const page = await s.built.inject({ method: "GET", url: "/v1/admin/preview-buyers", headers: headers() });
    expect(page.statusCode, page.body).toBe(200);
    expect(page.headers["cache-control"]).toBe("no-store");
    expect(page.json()).toEqual({ applies: true, team_count: 1, cap: PREVIEW_TEAM_MAX_MEMBERS, revision: 4, buyers: [
      { ref: REF_ANA, masked_address: "ste•••n.n•••our@example.com", since: "2026-11-20T10:00:00.000Z" },
      { ref: REF_BEN, masked_address: "an•••be•••la@example.org", since: "2026-11-21T10:00:00.000Z" }] });
    for (const secret of [ANA.address, BEN.address, ANA.userId, BEN.userId]) expect(page.body).not.toContain(secret);
    expect(s.asked).toContain("TEAM_GRANT");
  });
  it("anyone else gets a plain refusal, and nothing is read for them", async () => {
    for (const options of [{ allowed: false, designation: "DELEGATED" as const }, { allowed: true, designation: "DELEGATED" as const }]) {
      const s = server(options);
      const refused = await s.built.inject({ method: "GET", url: "/v1/admin/preview-buyers", headers: headers() });
      expect([refused.statusCode, refused.json()]).toEqual([403, { error: "STAFF_REQUEST_REFUSED" }]);
      expect(s.reads).toEqual([]);
      await close!(); close = undefined;
    }
  });
  it("off the preview or with real payments there is no list: the Owner gets 404, anyone else still the plain refusal", async () => {
    const owner = server({ present: false });
    expect((await owner.built.inject({ method: "GET", url: "/v1/admin/preview-buyers", headers: headers() })).statusCode).toBe(404);
    await close!(); close = undefined;
    const other = server({ present: false, allowed: false, designation: "DELEGATED" });
    expect((await other.built.inject({ method: "GET", url: "/v1/admin/preview-buyers", headers: headers() })).statusCode).toBe(403);
  });
});

describe("finding an account by its address", () => {
  const find = (s: ReturnType<typeof server>, address: string) => s.built.inject({ method: "POST", url: "/v1/admin/preview-buyers/find", headers: headers(true), payload: { address } });
  it("the Owner sees the address shortened when the account may be added", async () => {
    const s = server();
    const found = await find(s, `  ${NEW.address.toUpperCase()} `);
    expect([found.statusCode, found.json()]).toEqual([200, { masked_address: "mar•••pop•••scu@example.net" }]);
    expect(found.body).not.toContain(NEW.userId);
  });
  it("each reason it may not, by name", async () => {
    for (const [address, options, status, error] of [
      ["nobody@example.com", {}, 404, "PREVIEW_BUYER_ACCOUNT_UNKNOWN"],
      [IDLE.address, {}, 404, "PREVIEW_BUYER_ACCOUNT_UNKNOWN"],
      [TEAM.address, {}, 409, "PREVIEW_BUYER_ON_TEAM"],
      [ANA.address, {}, 409, "PREVIEW_BUYER_ALREADY"],
      [NEW.address, { buyers: PREVIEW_TEAM_MAX_MEMBERS - 1 }, 409, "PREVIEW_BUYERS_FULL"],
      [NEW.address, { applies: false }, 409, "PREVIEW_BUYERS_NOT_OPEN"],
      ["not-an-address", {}, 422, "STAFF_INPUT_INVALID"]
    ] as const) {
      const s = server(options);
      const answer = await find(s, address);
      expect([answer.statusCode, answer.json()], address).toEqual([status, { error }]);
      await close!(); close = undefined;
    }
    // One room left with the team line counted: the team's one account and 18 listed leave room for one more.
    const room = server({ buyers: PREVIEW_TEAM_MAX_MEMBERS - 2 });
    expect((await find(room, NEW.address)).statusCode).toBe(200);
  });
  it("tells nobody but the Owner whether an address has an account: the look-up never runs for them", async () => {
    for (const address of [NEW.address, "nobody@example.com"]) {
      const s = server({ allowed: false, designation: "DELEGATED" });
      const refused = await find(s, address);
      expect([refused.statusCode, refused.json()]).toEqual([403, { error: "STAFF_REQUEST_REFUSED" }]);
      expect(s.reads).toEqual([]);
      await close!(); close = undefined;
    }
  });
});

describe("adding and removing", () => {
  it("the key ceremony is bound under TEAM_GRANT to the account, the revision and the operation, never to the address", async () => {
    const s = server(), { proof_handle: _unused, ...fields } = addBody();
    const options = await s.built.inject({ method: "POST", url: "/v1/admin/webauthn/action/options", headers: headers(true), payload: { intent: { action: "PREVIEW_BUYER_ADD", ...fields } } });
    expect(options.statusCode, options.body).toBe(200);
    expect(s.bindings).toEqual([canonicalPreviewBuyerBinding("PREVIEW_BUYER_ADD", NEW.userId, 4, fields.operation_id)]);
    expect(JSON.stringify(s.bindings)).not.toContain(NEW.address);
    expect(s.asked).toContain("TEAM_GRANT");
  });
  it("an addition applies with the proof, sends the alert, and hands the database no address", async () => {
    const s = server(), body = addBody();
    const answer = await s.built.inject({ method: "POST", url: "/v1/admin/preview-buyers", headers: headers(true), payload: body });
    expect([answer.statusCode, answer.json()], answer.body).toEqual([200, { operation_id: body.operation_id, outcome: "COMPLETED", recorded_at: "2026-11-24T00:00:00.000Z" }]);
    expect(s.calls).toEqual([expect.objectContaining({ intent: "PREVIEW_BUYER_ADD", targetUserId: NEW.userId, expectedRevision: 4, operationId: body.operation_id,
      alertIntent: expect.objectContaining({ event: "PREVIEW_BUYER_ADDED" }) })]);
    expect(s.intents).toEqual([expect.objectContaining({ event: "PREVIEW_BUYER_ADDED", reason: { code: "GRANT_CHANGE" }, keyUserId: account.authenticated.userId })]);
    expect(JSON.stringify([s.calls, s.intents, s.bindings])).not.toContain("@");
  });
  it("an addition while the team tools are locked is refused before any ceremony or look-up; a removal goes on without the alert", async () => {
    const s = server({ locked: true }), { proof_handle: _unused, ...fields } = addBody();
    const options = await s.built.inject({ method: "POST", url: "/v1/admin/webauthn/action/options", headers: headers(true), payload: { intent: { action: "PREVIEW_BUYER_ADD", ...fields } } });
    expect([options.statusCode, options.json()]).toEqual([503, { error: "STAFF_ALERT_UNAVAILABLE" }]);
    const added = await s.built.inject({ method: "POST", url: "/v1/admin/preview-buyers", headers: headers(true), payload: addBody() });
    expect([added.statusCode, added.json()]).toEqual([503, { error: "STAFF_ALERT_UNAVAILABLE" }]);
    expect(s.reads).toEqual([]);
    expect(s.bindings).toEqual([]);
    expect(s.calls).toEqual([]);
    const removed = await s.built.inject({ method: "DELETE", url: `/v1/admin/preview-buyers/${REF_ANA}`, headers: headers(true), payload: removeBody() });
    expect(removed.statusCode, removed.body).toBe(200);
    expect(s.calls).toEqual([expect.objectContaining({ intent: "PREVIEW_BUYER_REMOVE", targetUserId: ANA.userId, alertIntent: null })]);
    expect(s.intents).toEqual([]);
  });
  it("a removal while unlocked sends its alert; a ref not on the list is refused by name", async () => {
    const s = server();
    expect((await s.built.inject({ method: "DELETE", url: `/v1/admin/preview-buyers/${REF_BEN}`, headers: headers(true), payload: removeBody() })).statusCode).toBe(200);
    expect(s.intents).toEqual([expect.objectContaining({ event: "PREVIEW_BUYER_REMOVED" })]);
    const missing = await s.built.inject({ method: "DELETE", url: `/v1/admin/preview-buyers/${randomUUID()}`, headers: headers(true), payload: removeBody() });
    expect([missing.statusCode, missing.json()]).toEqual([404, { error: "PREVIEW_BUYER_NOT_LISTED" }]);
  });
  it("a page looking at another revision is stale before any proof is read; no valid proof, no change", async () => {
    const stale = server();
    const answer = await stale.built.inject({ method: "POST", url: "/v1/admin/preview-buyers", headers: headers(true), payload: addBody({ expected_revision: 3 }) });
    expect([answer.statusCode, answer.json()]).toEqual([409, { error: "PREVIEW_BUYERS_STALE" }]);
    expect(stale.bindings).toEqual([]);
    expect(stale.calls).toEqual([]);
    await close!(); close = undefined;
    const unproven = server({ proof: false });
    expect((await unproven.built.inject({ method: "POST", url: "/v1/admin/preview-buyers", headers: headers(true), payload: addBody() })).statusCode).toBe(403);
    expect(unproven.calls).toEqual([]);
  });
  it("a staff member who is not the Owner is refused before the list or an account is read", async () => {
    for (const options of [{ allowed: false, designation: "DELEGATED" as const }, { allowed: true, designation: "DELEGATED" as const }]) {
      const s = server(options);
      expect((await s.built.inject({ method: "POST", url: "/v1/admin/preview-buyers", headers: headers(true), payload: addBody() })).statusCode).toBe(403);
      expect((await s.built.inject({ method: "DELETE", url: `/v1/admin/preview-buyers/${REF_ANA}`, headers: headers(true), payload: removeBody() })).statusCode).toBe(403);
      expect(s.reads).toEqual([]);
      expect(s.calls).toEqual([]);
      await close!(); close = undefined;
    }
  });
  it("the database's own refusals reach the page by name", async () => {
    for (const [says, status, error] of [["PREVIEW_BUYERS_STALE", 409, "PREVIEW_BUYERS_STALE"], ["PREVIEW_BUYER_ALREADY", 409, "PREVIEW_BUYER_ALREADY"],
      ["PREVIEW_BUYERS_FULL", 409, "PREVIEW_BUYERS_FULL"], ["PREVIEW_BUYER_ACCOUNT_INVALID", 404, "PREVIEW_BUYER_ACCOUNT_UNKNOWN"],
      ["STAFF_OPERATION_CONFLICT", 409, "STAFF_OPERATION_CONFLICT"], ["STAFF_PROOF_INVALID", 403, "STAFF_REQUEST_REFUSED"]] as const) {
      const s = server({ databaseSays: says });
      const answer = await s.built.inject({ method: "POST", url: "/v1/admin/preview-buyers", headers: headers(true), payload: addBody() });
      expect([answer.statusCode, answer.json()], says).toEqual([status, { error }]);
      await close!(); close = undefined;
    }
  });
});

describe("the typed address stays out of every log", () => {
  it("a whole look-up, ceremony, addition, list and removal writes no address, no '@' and no account id to the console", async () => {
    const lines: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")); }));
    try {
      const s = server(), body = addBody();
      await s.built.inject({ method: "POST", url: "/v1/admin/preview-buyers/find", headers: headers(true), payload: { address: NEW.address } });
      const { proof_handle: _unused, ...fields } = body;
      await s.built.inject({ method: "POST", url: "/v1/admin/webauthn/action/options", headers: headers(true), payload: { intent: { action: "PREVIEW_BUYER_ADD", ...fields } } });
      await s.built.inject({ method: "POST", url: "/v1/admin/preview-buyers", headers: headers(true), payload: body });
      await s.built.inject({ method: "GET", url: "/v1/admin/preview-buyers", headers: headers() });
      await s.built.inject({ method: "DELETE", url: `/v1/admin/preview-buyers/${REF_ANA}`, headers: headers(true), payload: removeBody() });
      expect(s.calls).toHaveLength(2);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    const all = lines.join("\n");
    expect(all).not.toContain("@");
    for (const person of PEOPLE) expect(all).not.toContain(person.userId);
  });
});
