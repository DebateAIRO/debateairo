import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { StaffAccessService, staffTokenHash } from "../../apps/api/src/staff/access.js";
import { canonicalPublicReviewBinding } from "../../apps/api/src/staff/public-review.js";
import { StaffAlertError } from "../../apps/api/src/staff/alerts.js";
import { testHttpIdentity, testSessionApplication, testSessionHeaders, TEST_APP_ORIGIN } from "../support/httpSession.js";

/**
 * Decision 33 over HTTP: the routes with the real access service and fake data ports (the database's own refusals, and the real read of a hidden page:
 * public-tree-flow.test.ts).
 */
const account = testHttpIdentity("public-review-http");
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
const REF = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const UPDATE = "33333333-3333-4333-8333-333333333333";
const envelope = (value: unknown) => ({ opened: value }) as never;
const SNAPSHOT = { question: "A made-up question?", public_ref: REF };
const material = { snapshot: { run_id: RUN, created_at: "2026-10-20T08:00:00.000Z", content: envelope(SNAPSHOT), latest_state: "PUBLISHED" }, hidden: false, revision: 3, digs: [],
  updates: [{ update_id: UPDATE, update_seq: 1, dig_run_id: RUN, kind: "PATH", position_ref: "p", recorded_at: "2026-10-21T08:00:00.000Z", content: envelope({ line: "A line.", fate: "HELD_UP" }), off: false, own_dig_removed: false }],
  reports: [], corrections: [], log: [] };
const STATE = { expectedRevision: 3, hidden: false };
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
  const repository = { readCommand: async () => STATE, read: async () => material, list: async () => ({ hidden: [], log: [] }), act: write("act") };
  const cipher = { decrypt: (value: { opened: unknown }) => value.opened, encrypt: (value: unknown) => ({ sealed: value }) };
  const built = buildApi({ application, sessions, allowedOrigin: TEST_APP_ORIGIN, staffPolicyVersion: 2, staffAccess: access, staff: {
    access, sessions, repository: {} as never, webauthn: {
      beginAction: async (_c: unknown, binding: unknown) => { bindings.push(binding); return { challenge_handle: randomBytes(32).toString("base64url"), options: { challenge: randomBytes(32).toString("base64url"), rpId: "example.test", timeout: 300000, userVerification: "required", allowCredentials: [] } }; }
    } as never,
    intents: { mutation: async (input: Record<string, unknown>) => { intents.push(input); return { schema: "staff-alert-v1", event: input.event, operationId: input.operationId, envelope: {} }; } } as never,
    readiness: { readIndependentAlertReadiness: async () => options.locked === true ? "UNAVAILABLE" : "READY" },
    publicReview: { repository: repository as never, withKey: async (_ref: string, _run: string, use: (c: never) => unknown) => use(cipher as never) }
  } as never });
  close = () => built.close();
  return { built, asked, bindings, calls, intents };
}
const handle = () => randomBytes(32).toString("base64url");
const proved = (change: Record<string, unknown> = {}) => ({ expected_revision: 3, operation_id: randomUUID(), proof_handle: handle(), ...change });
const stepBody = (change: Record<string, unknown>) => proved({ step: "REPUBLISH", piece_kind: null, piece_id: null, pointer: null, text: null, ...change });
const post = (built: ReturnType<typeof server>["built"], path: string, payload: unknown) => built.inject({ method: "POST", url: `/v1/admin/public-review/${REF}/${path}`, headers: headers(true), payload: payload as never });

describe("reading", () => {
  it("the two accounts read the whole debate, no-store; anyone else a plain refusal and no data", async () => {
    const yes = server();
    const ok = await yes.built.inject({ method: "GET", url: `/v1/admin/public-review/${REF}`, headers: headers() });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(ok.json()).toMatchObject({ publication_ref: REF, revision: 3, question: SNAPSHOT.question, updates: [{ update_id: UPDATE, state: "ON_THE_PAGE", pieces: [{ pointer: "/line", original: "A line.", corrected: null }] }] });
    expect(JSON.stringify(ok.json().updates[0].pieces)).not.toContain("HELD_UP");
    expect(yes.asked).toContain("TEAM_LIMIT_SET");
    await close?.();
    const no = server({ allowed: false, designation: "DELEGATED" });
    for (const url of ["/v1/admin/public-review", `/v1/admin/public-review/${REF}`]) {
      const refused = await no.built.inject({ method: "GET", url, headers: headers() });
      expect(refused.statusCode).toBe(403);
      expect(refused.body).not.toContain("made-up");
    }
  });
  it("needs a signed-in staff session", async () => {
    const { built } = server();
    const anonymous = await built.inject({ method: "GET", url: `/v1/admin/public-review/${REF}` });
    expect([401, 403]).toContain(anonymous.statusCode);
  });
});

describe("the steps", () => {
  it("a hide: the passkey's binding names the debate, the action and the revision; a delegate and a missing proof are refused before anything", async () => {
    const yes = server();
    const body = proved();
    const ok = await post(yes.built, "hide", body);
    expect(ok.statusCode).toBe(200);
    expect(yes.calls[0]).toMatchObject({ name: "act", step: "HIDE", publicationRef: REF, expectedRevision: 3, operationId: body.operation_id, content: null });
    expect(yes.bindings[0]).toEqual(canonicalPublicReviewBinding({ action: "PUBLIC_REVIEW_HIDE", publication_ref: REF, expected_revision: 3, operation_id: body.operation_id }, STATE));
    expect(yes.intents[0]).toMatchObject({ event: "PUBLIC_REVIEW_CHANGED" });
    await close?.();
    const no = server({ allowed: false, designation: "DELEGATED" });
    expect((await post(no.built, "hide", proved())).statusCode).toBe(403);
    expect(no.calls).toEqual([]);
    await close?.();
    const noProof = server({ proof: false });
    expect((await post(noProof.built, "hide", proved())).statusCode).toBe(403);
    expect(noProof.calls).toEqual([]);
  });
  it("a page looking at another revision is stale before any ceremony", async () => {
    const yes = server();
    const stale = await post(yes.built, "hide", proved({ expected_revision: 2 }));
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe("PUBLIC_REVIEW_STALE");
    expect(yes.calls).toEqual([]);
  });
  it("team tools locked: the hide still works, with no alert; every other step waits, and so does its ceremony", async () => {
    const locked = server({ locked: true });
    expect((await post(locked.built, "hide", proved())).statusCode).toBe(200);
    expect(locked.calls[0]).toMatchObject({ step: "HIDE", alertIntent: null });
    expect(locked.intents).toEqual([]);
    const waits = await post(locked.built, "step", stepBody({}));
    expect(waits.statusCode).toBe(503);
    expect(waits.json().error).toBe("STAFF_ALERT_UNAVAILABLE");
    expect(locked.calls).toHaveLength(1);
    const ceremony = await locked.built.inject({ method: "POST", url: "/v1/admin/webauthn/action/options", headers: headers(true), payload: { intent: { action: "PUBLIC_REVIEW_STEP", publication_ref: REF, step: "REPUBLISH", piece_kind: null, piece_id: null, pointer: null, text_sha256: null, expected_revision: 3, operation_id: randomUUID() } } });
    expect(ceremony.statusCode).toBe(503);
  });
  it("a correction binds the text's digest, never the words; only a string a person reads can be replaced; a proof for one piece differs from another's", async () => {
    const yes = server();
    const text = "A corrected question?";
    const ok = await post(yes.built, "step", stepBody({ step: "CORRECT", piece_kind: "SNAPSHOT", piece_id: REF, pointer: "/question", text }));
    expect(ok.statusCode, ok.body).toBe(422); // The made-up snapshot is no whole public debate: it would not read after the change, so nothing is recorded.
    expect(yes.calls).toEqual([]);
    const row = await post(yes.built, "step", stepBody({ step: "CORRECT", piece_kind: "UPDATE", piece_id: UPDATE, pointer: "/line", text }));
    expect(row.statusCode).toBe(200);
    const digest = createHash("sha256").update(text).digest("hex");
    expect(yes.calls[0]).toMatchObject({ step: "CORRECT", pieceKind: "UPDATE", pieceId: UPDATE, pointer: "/line", textSha256: digest, content: { sealed: { text } } });
    expect(JSON.stringify(yes.bindings.at(-1))).not.toContain(text);
    for (const pointer of ["/fate", "/nothing"]) {
      const not = await post(yes.built, "step", stepBody({ step: "CORRECT", piece_kind: "UPDATE", piece_id: UPDATE, pointer, text }));
      expect(not.statusCode, pointer).toBe(404);
      expect(not.json().error).toBe("PUBLIC_REVIEW_PIECE_UNKNOWN");
    }
    const unknown = await post(yes.built, "step", stepBody({ step: "CORRECT", piece_kind: "UPDATE", piece_id: randomUUID(), pointer: "/line", text }));
    expect(unknown.statusCode).toBe(404);
    expect(yes.calls).toHaveLength(1);
    const of = (piece: string) => canonicalPublicReviewBinding({ action: "PUBLIC_REVIEW_STEP", publication_ref: REF, step: "PUT_BACK", piece_kind: "UPDATE", piece_id: piece, pointer: null, text_sha256: null, expected_revision: 3, operation_id: RUN }, STATE).bodySha256;
    expect(of(UPDATE)).not.toBe(of(RUN));
  });
  it("a body that does not fit its step is refused; the database's own words pass through plainly", async () => {
    const yes = server();
    expect((await post(yes.built, "step", stepBody({ step: "CORRECT", piece_kind: "UPDATE", piece_id: UPDATE, pointer: "/line", text: null }))).statusCode).toBe(422);
    expect((await post(yes.built, "step", stepBody({ step: "REMOVE_DIG", piece_kind: "DIG", piece_id: RUN, text: "words" }))).statusCode).toBe(422);
    expect((await post(yes.built, "step", stepBody({ step: "REMOVE_DIG", piece_kind: null, piece_id: null }))).statusCode).toBe(422);
    await close?.();
    for (const [code, status] of [["PUBLIC_REVIEW_NOT_HIDDEN", 409], ["PUBLIC_REVIEW_ALREADY_HIDDEN", 409], ["PUBLIC_REVIEW_PIECE_UNKNOWN", 404], ["PUBLIC_REVIEW_NOT_PUBLIC", 404]] as const) {
      const says = server({ databaseSays: code });
      const answer = await post(says.built, "step", stepBody({ step: "REMOVE_DIG", piece_kind: "DIG", piece_id: RUN }));
      expect(answer.statusCode, code).toBe(status);
      expect(answer.json().error).toBe(code);
      await close?.();
    }
    close = undefined;
  });
});
