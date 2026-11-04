import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "@debateai/api";
import type { ReadableUserDekStore } from "@debateai/crypto";
import { generateDek } from "@debateai/crypto";
import { createPool, crossAccountPool, migrate, PostgresInternalAllowanceRepository, PostgresStaffAlertRepository, PostgresStaffRepository, PostgresTeamLimitRepository, type Pool } from "@debateai/db";
import { StaffAccessService } from "../../apps/api/src/staff/access.js";
import { StaffAlertIntentProducer } from "../../apps/api/src/staff/alerts.js";
import type { StaffHttpApplication } from "../../apps/api/src/staff/routes.js";
import { drainTeamLimitNotices } from "../../apps/api/src/staff/team-limit.js";
import { StaffWebAuthnService } from "../../apps/api/src/staff/webauthn.js";
import { withMailLocale } from "../../packages/db/src/mail-locale.js";
import { testSessionApplication, type TestHttpIdentity } from "../support/httpSession.js";
import { internalFundingFixture } from "../support/internalFundingFixture.js";
import { authorizeStaffAlertFixture } from "../support/staffAlertReadiness.js";
import { staffHttpAskApplication } from "../support/staffHttpApplication.js";
import { b64, digest, fixture, key, origin, rpId } from "../support/staffWebAuthnFixtures.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { runFixtureStepOutsideRequest } from "../support/master-key-guard.js";

/**
 * Decision 32 over HTTP on real Postgres: the real routes, access service, passkey ceremony, alert producer and repositories, through the
 * runtime role. Only the ordinary session is a test one (and the funding readiness's static facts, which main.ts's boot checks). Amounts are made up.
 */
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
let database: TestDatabase, runtime: Pool, api: ReturnType<typeof buildApi>, allowances: PostgresInternalAllowanceRepository, teamLimit: PostgresTeamLimitRepository;
const identities: TestHttpIdentity[] = [], deks = new Map<string, Buffer>();
const keys: ReadableUserDekStore = { load: async (userId: string) => { const value = deks.get(userId); if (value === undefined) throw new Error("SYNTHETIC_KEY_MISSING"); return Buffer.from(value); },
  store: async () => {}, exists: async (id: string) => deks.has(id), destroy: async () => "ALREADY_ABSENT" } as unknown as ReadableUserDekStore;

type Person = Readonly<{ identity: TestHttpIdentity; userId: string; ownerRef: string; staffId: string; passkey: { f: ReturnType<typeof fixture>; counter: number } }>;
async function hardware(userId: string) {
  const f = fixture(key(), 1, randomBytes(32)), factorId = randomUUID();
  await withMailLocale(database.pool, "en", (c) => c.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter)
    VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),$5,$6,true,false,false,$7,0)`,
    [factorId, userId, f.expected.credentialId, JSON.stringify({ format: "COSE_KEY_BASE64URL_V1", value: b64(f.k.wire) }), rpId, origin, { v: 1, keyId: `passkey-label:${factorId}:v1`, nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" }]));
  await database.pool.query("INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256) VALUES($1,$2,$3)", [factorId, userId, digest(f.handle)]);
  return { f, counter: 0 };
}
/** A live account with a verified email, a session, a staff subject and a passkey. The Owner holds two passkeys, as the policy asks. */
async function person(role: "OWNER" | "MEMBER"): Promise<Person> {
  const userId = randomUUID(), sessionId = randomUUID(), staffId = randomUUID(), q = database.pool;
  deks.set(userId, generateDek());
  await q.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), userId]);
  await q.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
    VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [randomUUID(), userId]);
  await q.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`, [userId]);
  const rawSessionToken = randomBytes(32).toString("base64url"), rawCsrfToken = randomBytes(32).toString("base64url"), tokenHash = hash(sessionId);
  await q.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
    VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [sessionId, userId, tokenHash, hash(`csrf${sessionId}`)]);
  const ownerRef = (await q.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0].owner_ref as string;
  await q.query("INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)", [staffId, userId,
    role === "OWNER" ? ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE"] : ["TEAM_READ", "AUDIT_READ", "EMERGENCY_DISABLE"]]);
  if (role === "OWNER") {
    await hardware(userId);
    await q.query("UPDATE staff.owner_designation SET active=false WHERE active");
    await q.query("INSERT INTO staff.owner_designation(staff_id) VALUES($1)", [staffId]);
  }
  const identity: TestHttpIdentity = Object.freeze({ rawSessionToken, rawCsrfToken, authenticated: Object.freeze({
    session: Object.freeze({ asker_id: `owner:${ownerRef}`, session_id: sessionId, caller_scope: "ASKER" as const, ownership_provenance: "server_session" as const, provisional_identity_model: false as const }),
    userId, ownerRef, tokenHash, csrfTokenHash: hash(`csrf${sessionId}`), authKind: "cookie" as const }) });
  identities.push(identity);
  return { identity, userId, ownerRef, staffId, passkey: await hardware(userId) };
}
type Elevated = Readonly<{ token: string; csrf: string }>;
const headers = (p: Person, elevated?: Elevated) => ({
  cookie: `__Host-debateai-session=${p.identity.rawSessionToken}; __Host-debateai-csrf=${p.identity.rawCsrfToken}` + (elevated === undefined ? "" : `; __Host-debateai-staff=${elevated.token}; __Host-debateai-staff-csrf=${elevated.csrf}`),
  "user-agent": "team-allowance-test", origin, "x-csrf-token": p.identity.rawCsrfToken, ...(elevated === undefined ? {} : { "x-staff-csrf-token": elevated.csrf })
});
function assertion(p: Person, challenge: string) {
  p.passkey.counter++;
  return p.passkey.f.assertion({ client: Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false })), auth: p.passkey.f.auth(5, p.passkey.counter) });
}
async function elevate(p: Person): Promise<Elevated> {
  const options = await api.inject({ method: "POST", url: "/v1/admin/webauthn/elevation/options", headers: headers(p), payload: {} });
  expect(options.statusCode, options.body).toBe(200);
  const verified = await api.inject({ method: "POST", url: "/v1/admin/webauthn/elevation/verify", headers: headers(p), payload: { challenge_handle: options.json().challenge_handle, credential: assertion(p, options.json().options.challenge) } });
  expect(verified.statusCode, verified.body).toBe(200);
  const cookies = verified.headers["set-cookie"] as string[], value = (name: string) => cookies.find(c => c.startsWith(`${name}=`))!.split(";")[0]!.split("=")[1]!;
  return { token: value("__Host-debateai-staff"), csrf: value("__Host-debateai-staff-csrf") };
}
const optionsFor = (p: Person, elevated: Elevated, intent: unknown) => api.inject({ method: "POST", url: "/v1/admin/webauthn/action/options", headers: headers(p, elevated), payload: { intent } });
async function prove(p: Person, elevated: Elevated, intent: unknown): Promise<string> {
  const options = await optionsFor(p, elevated, intent);
  expect(options.statusCode, options.body).toBe(200);
  const verified = await api.inject({ method: "POST", url: "/v1/admin/webauthn/action/verify", headers: headers(p, elevated), payload: { intent, challenge_handle: options.json().challenge_handle, credential: assertion(p, options.json().options.challenge) } });
  expect(verified.statusCode, verified.body).toBe(200);
  return verified.json().proof_handle as string;
}
const FUNDING = { code: "FUNDING_APPROVAL" } as const;
const giftFields = (revision = 0, change: Record<string, unknown> = {}) => {
  const now = Date.now();
  return { expected_revision: revision, amount_micros: 900000, day_micros: 90000, week_micros: 400000, starts_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 86400000).toISOString(),
    funding_approval_ref: "SYNTHETIC-APPROVAL", operation_id: randomUUID(), reason: FUNDING, ...change };
};
const giveIntent = (m: Person, fields: Record<string, unknown>) => ({ action: "TEAM_ALLOWANCE_CONFIGURE", target_staff_id: m.staffId, ...fields });
const post = (p: Person, elevated: Elevated, staffId: string, body: unknown) => api.inject({ method: "POST", url: `/v1/admin/team-allowances/${staffId}`, headers: headers(p, elevated), payload: body as never });
const read = (p: Person, elevated: Elevated) => api.inject({ method: "GET", url: "/v1/admin/team-allowances", headers: headers(p, elevated) });
const funded = (m: Person) => allowances.current(m.ownerRef, new Date());
async function give(owner: Person, elevated: Elevated, m: Person): Promise<string> {
  const fields = giftFields((await database.pool.query("SELECT coalesce(max(revision),0)::int r FROM billing.internal_grant WHERE owner_ref=$1", [m.ownerRef])).rows[0].r as number);
  const handle = await prove(owner, elevated, giveIntent(m, fields)), response = await post(owner, elevated, m.staffId, { ...fields, proof_handle: handle });
  expect(response.statusCode, response.body).toBe(200);
  return fields.operation_id;
}

let owner: Person, ownerElevated: Elevated;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  runtime = createPool(await createSystemTwin(database, "team_allowance_http", ["debateai_runtime", "debateai_billing_runtime"]));
  await internalFundingFixture(database.pool, runtime).selectFunding();
  allowances = new PostgresInternalAllowanceRepository(runtime);
  teamLimit = new PostgresTeamLimitRepository(runtime);
  const repository = new PostgresStaffRepository(crossAccountPool(runtime, "X14")), sessions = testSessionApplication(identities);
  const access = new StaffAccessService(repository, sessions);
  const intents = new StaffAlertIntentProducer({ keys, mappings: new PostgresStaffAlertRepository(runtime), readiness: { require: (operationId: string) => runFixtureStepOutsideRequest(() => authorizeStaffAlertFixture(database.pool, operationId)) } });
  const staff = { access, sessions, repository, intents, webauthn: new StaffWebAuthnService(repository, { publicAppUrl: origin }),
    funding: { allowances, requireReady: async () => {}, requireNewGrantPolicy: async () => {} }, teamLimit: { repository: teamLimit } } as unknown as StaffHttpApplication;
  api = buildApi({ application: staffHttpAskApplication(), allowedOrigin: origin, sessions, staffAccess: access, staffPolicyVersion: 2, staff });
  owner = await person("OWNER");
  ownerElevated = await elevate(owner);
}, 180000);
afterAll(async () => { await api?.close(); await runtime?.end(); await database?.stop(); for (const dek of deks.values()) dek.fill(0); });

describe("the Owner, through the routes and a real passkey ceremony", () => {
  it("gives a member an allowance, sees it, and takes it back", async () => {
    const m = await person("MEMBER"), grantId = await give(owner, ownerElevated, m);
    expect(await funded(m)).toMatchObject({ grantId, ownerRef: m.ownerRef, amountMicros: 900000 });
    const page = await read(owner, ownerElevated);
    expect(page.statusCode, page.body).toBe(200);
    expect(page.headers["cache-control"]).toBe("no-store");
    const row = (page.json().members as Array<{ staff_id: string; revision: number; allowance: { grant_id: string } | null }>).find(x => x.staff_id === m.staffId)!;
    expect(row).toMatchObject({ revision: 1, allowance: { grant_id: grantId } });
    expect(page.body).not.toContain(m.ownerRef);
    const fields = { expected_revision: 1, operation_id: randomUUID(), reason: FUNDING };
    const handle = await prove(owner, ownerElevated, { action: "TEAM_ALLOWANCE_REVOKE", target_staff_id: m.staffId, grant_id: grantId, ...fields });
    const taken = await api.inject({ method: "DELETE", url: `/v1/admin/team-allowances/${m.staffId}/${grantId}`, headers: headers(owner, ownerElevated), payload: { ...fields, proof_handle: handle } });
    expect(taken.statusCode, taken.body).toBe(200);
    expect(await funded(m)).toBeNull();
    expect((await database.pool.query("SELECT event_type,subject_staff_id,actor_staff_id FROM staff.audit_event WHERE operation_id=ANY($1::uuid[]) ORDER BY event_type", [[grantId, fields.operation_id]])).rows).toEqual([
      { event_type: "ALLOWANCE_CONFIGURED", subject_staff_id: m.staffId, actor_staff_id: owner.staffId }, { event_type: "ALLOWANCE_REVOKED", subject_staff_id: m.staffId, actor_staff_id: owner.staffId }]);
  });
  it("the alert is sealed for the member's account, and no sent mail holds an amount, a person or a parameter", async () => {
    const m = await person("MEMBER"), grantId = await give(owner, ownerElevated, m);
    const outbox = (await database.pool.query(`SELECT o.key_ref,o.purpose,o.encrypted_payload::text p FROM staff.alert_outbox o JOIN staff.audit_event a USING(event_id) WHERE a.operation_id=$1`, [grantId])).rows[0];
    expect(outbox.purpose).toBe("INDEPENDENT_METADATA_ALERT");
    expect(outbox.p).not.toContain("900000");
    expect(outbox.key_ref).toBe((await database.pool.query('SELECT audit_token FROM identity."user" WHERE user_id=$1', [m.userId])).rows[0].audit_token);
    const sent: Array<Record<string, unknown>> = [];
    await drainTeamLimitNotices({ repository: allowances, mail: { sendTemplated: async (mail: Record<string, unknown>) => { sent.push(mail); } } as never, readEmail: async (userId: string) => userId === m.userId ? "member@example.test" : "owner@example.test" });
    expect(sent.filter(mail => mail.to === "member@example.test").map(mail => ({ templateId: mail.templateId, params: mail.params }))).toContainEqual({ templateId: "TEAM_ALLOWANCE_YOURS", params: {} });
    expect(sent.filter(mail => mail.to === "owner@example.test").map(mail => mail.templateId)).toContain("TEAM_ALLOWANCE_CHANGED");
  });
});

describe("nobody else", () => {
  const refused = async (p: Person) => {
    const elevated = await elevate(p), target = await person("MEMBER"), fields = giftFields();
    expect((await read(p, elevated)).statusCode).toBe(403);
    expect((await optionsFor(p, elevated, giveIntent(target, fields))).statusCode).toBe(403);
    expect((await post(p, elevated, target.staffId, { ...fields, proof_handle: randomBytes(32).toString("base64url") })).statusCode).toBe(403);
    expect(await funded(target)).toBeNull();
    const held = await person("MEMBER"), grantId = await give(owner, ownerElevated, held), revoke = { expected_revision: 1, operation_id: randomUUID(), reason: FUNDING };
    expect((await optionsFor(p, elevated, { action: "TEAM_ALLOWANCE_REVOKE", target_staff_id: held.staffId, grant_id: grantId, ...revoke })).statusCode).toBe(403);
    expect((await api.inject({ method: "DELETE", url: `/v1/admin/team-allowances/${held.staffId}/${grantId}`, headers: headers(p, elevated), payload: { ...revoke, proof_handle: randomBytes(32).toString("base64url") } })).statusCode).toBe(403);
    expect((await funded(held))?.grantId).toBe(grantId);
  };
  it("a delegated member is refused by every route", async () => { await refused(await person("MEMBER")); });
  it("the partner, who may change the team's limit, is refused by every route", async () => {
    const p = await person("MEMBER");
    await database.pool.query("INSERT INTO staff.team_limit_holder(staff_id,granted_by_staff_id,granted_operation_id) VALUES($1,$2,$3)", [p.staffId, owner.staffId, randomUUID()]);
    const elevated = await elevate(p);
    expect((await api.inject({ method: "GET", url: "/v1/admin/team-limit", headers: headers(p, elevated) })).statusCode).toBe(200);
    await refused(p);
    await database.pool.query("SELECT staff.end_team_limit_holder($1,'OWNER_REVOKED')", [p.staffId]);
  });
  it("an ordinary session with no elevation is turned away", async () => {
    expect((await api.inject({ method: "GET", url: "/v1/admin/team-allowances", headers: headers(owner) })).statusCode).toBe(401);
  });
});

describe("the proof, over HTTP", () => {
  it("made for one member does not give to another; made for one amount does not give another", async () => {
    const a = await person("MEMBER"), b = await person("MEMBER"), fields = giftFields(), handle = await prove(owner, ownerElevated, giveIntent(a, fields));
    expect((await post(owner, ownerElevated, b.staffId, { ...fields, proof_handle: handle })).statusCode).toBe(403);
    for (const change of [{ amount_micros: 900001 }, { day_micros: 90001 }, { week_micros: 400001 }]) {
      expect((await post(owner, ownerElevated, a.staffId, { ...fields, ...change, proof_handle: handle })).statusCode).toBe(403);
    }
    expect(await funded(a)).toBeNull();
    expect(await funded(b)).toBeNull();
    expect((await post(owner, ownerElevated, a.staffId, { ...fields, proof_handle: handle })).statusCode).toBe(200);
    expect((await funded(a))?.amountMicros).toBe(900000);
  });
  it("cannot be replayed: the same proof again gives nothing more", async () => {
    const m = await person("MEMBER"), fields = giftFields(), handle = await prove(owner, ownerElevated, giveIntent(m, fields));
    expect((await post(owner, ownerElevated, m.staffId, { ...fields, proof_handle: handle })).statusCode).toBe(200);
    // The revision has moved on, so the page's request is stale before the proof is even looked at; with the new revision the proof fits nothing.
    expect((await post(owner, ownerElevated, m.staffId, { ...fields, proof_handle: handle })).json()).toEqual({ error: "TEAM_ALLOWANCE_STALE" });
    expect((await post(owner, ownerElevated, m.staffId, { ...fields, expected_revision: 1, proof_handle: handle })).statusCode).toBe(403);
    expect((await post(owner, ownerElevated, m.staffId, { ...fields, expected_revision: 1, operation_id: randomUUID(), proof_handle: handle })).statusCode).toBe(403);
    expect((await database.pool.query("SELECT count(*)::int n FROM billing.internal_grant WHERE owner_ref=$1", [m.ownerRef])).rows[0].n).toBe(1);
  });
  it("a page looking at another revision is stale before any ceremony, in plain words", async () => {
    const m = await person("MEMBER"), options = await optionsFor(owner, ownerElevated, giveIntent(m, giftFields(7)));
    expect(options.statusCode).toBe(409);
    expect(options.json()).toEqual({ error: "TEAM_ALLOWANCE_STALE" });
  });
  it("the browser cannot send an account's reference, and over the policy is refused in plain words after the passkey", async () => {
    const m = await person("MEMBER");
    expect((await optionsFor(owner, ownerElevated, giveIntent(m, giftFields(0, { owner_ref: m.ownerRef })))).statusCode).toBe(422);
    expect((await post(owner, ownerElevated, m.staffId, { ...giftFields(), owner_ref: m.ownerRef, proof_handle: randomBytes(32).toString("base64url") })).statusCode).toBe(422);
    const fields = giftFields(0, { amount_micros: 1200001, week_micros: 400000 }), handle = await prove(owner, ownerElevated, giveIntent(m, fields));
    const response = await post(owner, ownerElevated, m.staffId, { ...fields, proof_handle: handle });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: "TEAM_ALLOWANCE_INVALID" });
    expect(await funded(m)).toBeNull();
  });
  it("someone who cannot receive one is named plainly before any ceremony", async () => {
    const m = await person("MEMBER");
    await database.pool.query("UPDATE staff.subject SET state='DISABLED' WHERE staff_id=$1", [m.staffId]);
    const options = await optionsFor(owner, ownerElevated, giveIntent(m, giftFields()));
    expect(options.statusCode).toBe(409);
    expect(options.json()).toEqual({ error: "TEAM_ALLOWANCE_MEMBER_UNAVAILABLE" });
  });
});

describe("offboarding, through the team's own route", () => {
  it("ends the allowance: nothing funds them any more", async () => {
    const m = await person("MEMBER");
    await give(owner, ownerElevated, m);
    expect(await funded(m)).not.toBeNull();
    const revision = (await database.pool.query("SELECT grant_revision::int r FROM staff.subject WHERE staff_id=$1", [m.staffId])).rows[0].r as number;
    const fields = { mode: "OFFBOARD", expected_revision: revision, operation_id: randomUUID(), reason: { code: "OFFBOARDING" } };
    const handle = await prove(owner, ownerElevated, { action: "TEAM_DISABLE", target_staff_id: m.staffId, ...fields });
    const response = await api.inject({ method: "POST", url: `/v1/admin/team/${m.staffId}/disable`, headers: headers(owner, ownerElevated), payload: { ...fields, proof_handle: handle } });
    expect(response.statusCode, response.body).toBe(200);
    expect(await funded(m)).toBeNull();
    const page = await read(owner, ownerElevated);
    expect((page.json().members as Array<{ staff_id: string }>).some(x => x.staff_id === m.staffId)).toBe(false);
    expect((page.json().log as Array<{ subject_staff_id: string; kind: string; cause?: string }>).find(e => e.subject_staff_id === m.staffId && e.kind === "ENDED")?.cause).toBe("STAFF_DISABLED");
  });
});
