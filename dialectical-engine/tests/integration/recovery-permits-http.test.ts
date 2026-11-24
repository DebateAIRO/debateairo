import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "@debateai/api";
import { encrypt, generateDek, type AeadAad, type ReadableUserDekStore } from "@debateai/crypto";
import { createPool, crossAccountPool, migrate, PostgresRecoveryPermitRepository, PostgresRecoveryPermitStaffRepository, PostgresStaffAlertRepository, PostgresStaffRepository, type Pool } from "@debateai/db";
import { accountEmailReader } from "../../apps/api/src/staff/account-email.js";
import { StaffAccessService } from "../../apps/api/src/staff/access.js";
import { StaffAlertIntentProducer } from "../../apps/api/src/staff/alerts.js";
import { canonicalRecoveryPermitBinding } from "../../apps/api/src/staff/recovery-permits.js";
import type { StaffHttpApplication } from "../../apps/api/src/staff/routes.js";
import { StaffWebAuthnService } from "../../apps/api/src/staff/webauthn.js";
import { withMailLocale } from "../../packages/db/src/mail-locale.js";
import { testSessionApplication, type TestHttpIdentity } from "../support/httpSession.js";
import { runFixtureStepOutsideRequest } from "../support/master-key-guard.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { authorizeStaffAlertFixture } from "../support/staffAlertReadiness.js";
import { staffHttpAskApplication } from "../support/staffHttpApplication.js";
import { b64, digest, fixture, key, origin, rpId } from "../support/staffWebAuthnFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * The Owner's permit for a locked-out account (0188) over HTTP on real Postgres: the Owner's three routes with the real
 * access service, passkey ceremony, alert producer and repositories, through the API's runtime login. The person's side
 * (the mailbox link and the password) is driven through its own login the way the API drives it; only the ordinary
 * session is a test one. Every address here is made up.
 */
const hash = (value: string = randomUUID()) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
let database: TestDatabase, runtime: Pool, person: Pool, api: ReturnType<typeof buildApi>, bare: ReturnType<typeof buildApi>, permits: PostgresRecoveryPermitRepository;
const identities: TestHttpIdentity[] = [], deks = new Map<string, Buffer>();
const keys: ReadableUserDekStore = { load: async (userId: string) => { const value = deks.get(userId); if (value === undefined) throw new Error("SYNTHETIC_KEY_MISSING"); return Buffer.from(value); },
  store: async () => {}, exists: async (id: string) => deks.has(id), destroy: async () => "ALREADY_ABSENT" } as unknown as ReadableUserDekStore;
/** Whether the team tools are locked: the API's early readiness check reads it before any key ceremony. */
let locked = false;

type Staff = Readonly<{ identity: TestHttpIdentity; userId: string; staffId: string; passkey: { f: ReturnType<typeof fixture>; counter: number } }>;
async function hardware(userId: string) {
  const f = fixture(key(), 1, randomBytes(32)), factorId = randomUUID();
  await withMailLocale(database.pool, "en", (c) => c.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter)
    VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),$5,$6,true,false,false,$7,0)`,
    [factorId, userId, f.expected.credentialId, JSON.stringify({ format: "COSE_KEY_BASE64URL_V1", value: b64(f.k.wire) }), rpId, origin, { v: 1, keyId: `passkey-label:${factorId}:v1`, nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" }]));
  await database.pool.query("INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256) VALUES($1,$2,$3)", [factorId, userId, digest(f.handle)]);
  return { f, counter: 0 };
}
/** A signed-in account: the Owner (two hardware keys, as the policy asks), a delegated member, or nobody on the team. */
async function signedIn(role: "OWNER" | "MEMBER" | "NOT_STAFF"): Promise<Staff> {
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
  if (role !== "NOT_STAFF") await q.query("INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)", [staffId, userId,
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
  return { identity, userId, staffId, passkey: await hardware(userId) };
}
type Elevated = Readonly<{ token: string; csrf: string }>;
const headers = (p: Staff, elevated?: Elevated) => ({
  cookie: `__Host-debateai-session=${p.identity.rawSessionToken}; __Host-debateai-csrf=${p.identity.rawCsrfToken}` + (elevated === undefined ? "" : `; __Host-debateai-staff=${elevated.token}; __Host-debateai-staff-csrf=${elevated.csrf}`),
  "user-agent": "recovery-permits-test", origin, "x-csrf-token": p.identity.rawCsrfToken, ...(elevated === undefined ? {} : { "x-staff-csrf-token": elevated.csrf })
});
function assertion(p: Staff, challenge: string) {
  p.passkey.counter++;
  return p.passkey.f.assertion({ client: Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false })), auth: p.passkey.f.auth(5, p.passkey.counter) });
}
async function elevate(p: Staff): Promise<Elevated> {
  const options = await api.inject({ method: "POST", url: "/v1/admin/webauthn/elevation/options", headers: headers(p), payload: {} });
  expect(options.statusCode, options.body).toBe(200);
  const verified = await api.inject({ method: "POST", url: "/v1/admin/webauthn/elevation/verify", headers: headers(p), payload: { challenge_handle: options.json().challenge_handle, credential: assertion(p, options.json().options.challenge) } });
  expect(verified.statusCode, verified.body).toBe(200);
  const cookies = verified.headers["set-cookie"] as string[], value = (name: string) => cookies.find((c) => c.startsWith(`${name}=`))!.split(";")[0]!.split("=")[1]!;
  return { token: value("__Host-debateai-staff"), csrf: value("__Host-debateai-staff-csrf") };
}

type Decision = "RECOVERY_PERMIT_APPROVE" | "RECOVERY_PERMIT_REFUSE";
type Intent = Readonly<{ action: Decision; request_ref: string; expected_revision: number; operation_id: string }>;
const intentFor = (action: Decision, ref: string, revision: number): Intent => ({ action, request_ref: ref, expected_revision: revision, operation_id: randomUUID() });
const optionsFor = (p: Staff, elevated: Elevated, intent: unknown, on = api) => on.inject({ method: "POST", url: "/v1/admin/webauthn/action/options", headers: headers(p, elevated), payload: { intent } as never });
/** The real key ceremony: options for the intent, the hardware key's assertion, and the proof handle it answers. */
async function prove(p: Staff, elevated: Elevated, intent: Intent): Promise<string> {
  const options = await optionsFor(p, elevated, intent);
  expect(options.statusCode, options.body).toBe(200);
  const verified = await api.inject({ method: "POST", url: "/v1/admin/webauthn/action/verify", headers: headers(p, elevated), payload: { intent, challenge_handle: options.json().challenge_handle, credential: assertion(p, options.json().options.challenge) } });
  expect(verified.statusCode, verified.body).toBe(200);
  return verified.json().proof_handle as string;
}
const read = (p: Staff, elevated?: Elevated, on = api) => on.inject({ method: "GET", url: "/v1/admin/recovery-permits", headers: headers(p, elevated) });
const post = (p: Staff, elevated: Elevated | undefined, ref: string, verb: "approve" | "refuse", body: unknown, on = api) =>
  on.inject({ method: "POST", url: `/v1/admin/recovery-permits/${ref}/${verb}`, headers: headers(p, elevated), payload: body as never });
const bodyOf = (intent: Intent, proofHandle: string) => ({ expected_revision: intent.expected_revision, operation_id: intent.operation_id, proof_handle: proofHandle });
const verbOf = (action: Decision) => action === "RECOVERY_PERMIT_APPROVE" ? "approve" : "refuse";
/** One decision the whole way: the ceremony for it, then its route with the proof handle. */
async function decide(action: Decision, ref: string, revision = 2) {
  const intent = intentFor(action, ref, revision), handle = await prove(owner, ownerElevated, intent);
  return { intent, response: await post(owner, ownerElevated, ref, verbOf(action), bodyOf(intent, handle)) };
}

/** An account that may ask: a sign-in address verified 60 days ago and sealed with its own key, a password, a passkey. */
type Account = Readonly<{ userId: string; index: Buffer; address: string; ownerRef: string }>;
const ENVELOPE = (ct: string = randomBytes(6).toString("base64")) => ({ v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct });
const addressAad = (userId: string): AeadAad => ["identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"];
const SOURCE = { ipArgon2id: `argon2id-audit:v1:${"c".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"d".repeat(64)}` };
async function account(address: string): Promise<Account> {
  const userId = randomUUID(), index = randomBytes(32), dek = generateDek(), q = database.pool;
  deks.set(userId, dek);
  const sealed = encrypt(dek, Buffer.from(address), addressAad(userId));
  await q.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at,created_at)
    VALUES($1::uuid,$2,$3,NULL,'fixture-password-hash',$1::text,'active',now(),now()-interval '200 days')`, [userId, index, sealed]);
  await q.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at)
    VALUES($1,$2,'email',$3,'verified',now()-interval '60 days',now()-interval '60 days')`, [randomUUID(), userId, sealed]);
  await q.query("INSERT INTO identity.consumer_passkey_subject(user_id,user_handle) VALUES($1,$2)", [userId, randomBytes(32).toString("base64url")]);
  await withMailLocale(q, "en", (c) => c.query(`INSERT INTO identity.consumer_passkey_credential(consumer_credential_id,user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin)
    VALUES($1,$2,$3,'AQID',0,'singleDevice',false,'example.test','https://example.test')`, [randomUUID(), userId, randomBytes(16).toString("base64url")]));
  const ownerRef = (await q.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0].owner_ref as string;
  return { userId, index, address, ownerRef };
}
/** The mailbox link and the password, as the person's side hands them to the database once the API checked the password: the ask the Owner sees. */
async function asked(a: Account): Promise<string> {
  const candidate = await permits.prepare(a.index);
  if (candidate === null) throw new Error("FIXTURE_START_REFUSED");
  const permitId = randomUUID(), link = hash();
  const notices = candidate.channels.map((c) => ({ channelId: c.channelId, envelope: ENVELOPE(), ...(c.cancelAuthorized ? { cancelEnvelope: ENVELOPE() } : {}), ...(c.proof ? { proofEnvelope: ENVELOPE() } : {}) }));
  if (!await permits.start({ index: a.index, candidateId: candidate.userId, channels: candidate.channels.map((c) => c.channelId), linkHash: link, cancelHash: hash(), notices, source: SOURCE, mailLocale: "en", id: permitId }))
    throw new Error("FIXTURE_START_REFUSED");
  const status = await permits.request(link, "fixture-password-hash", hash(), ENVELOPE() as never, SOURCE);
  if (status !== "REQUESTED") throw new Error(`FIXTURE_REQUEST_${status}`);
  return permitId;
}
const stage = async (permitId: string) => (await database.pool.query("SELECT stage,revision::int AS revision FROM identity.recovery_permit WHERE permit_id=$1", [permitId])).rows[0] as { stage: string; revision: number };
/** The daily limit counts the approvals of the last 24 hours; a test that needs room moves the earlier ones a day back. */
async function clearToday(): Promise<void> {
  await database.pool.query("ALTER TABLE staff.recovery_permit_decision DISABLE TRIGGER staff_immutable");
  await database.pool.query("UPDATE staff.recovery_permit_decision SET recorded_at=recorded_at-interval '25 hours' WHERE recorded_at>clock_timestamp()-interval '24 hours'");
  await database.pool.query("ALTER TABLE staff.recovery_permit_decision ENABLE TRIGGER staff_immutable");
}
const challenges = async () => (await database.pool.query("SELECT count(*)::int AS n FROM staff.webauthn_challenge")).rows[0].n as number;
type Row = Record<string, unknown> & { ref: string };
const rowOf = async (ref: string) => ((await read(owner, ownerElevated)).json().requests as Row[]).find((r) => r.ref === ref);

let owner: Staff, ownerElevated: Elevated;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  runtime = createPool(await createSystemTwin(database, "recovery_permits_http", ["debateai_runtime", "debateai_billing_runtime"]));
  await database.pool.query("CREATE ROLE recovery_permits_person LOGIN PASSWORD 'recovery-permits-person-fixture-only' IN ROLE debateai_mfa_recovery_runtime");
  const u = new URL(database.connectionString); u.username = "recovery_permits_person"; u.password = "recovery-permits-person-fixture-only";
  person = createPool(u.toString());
  permits = new PostgresRecoveryPermitRepository(person);
  const repository = new PostgresStaffRepository(crossAccountPool(runtime, "X14")), sessions = testSessionApplication(identities);
  const access = new StaffAccessService(repository, sessions);
  const intents = new StaffAlertIntentProducer({ keys, mappings: new PostgresStaffAlertRepository(runtime), readiness: { require: (operationId: string) => runFixtureStepOutsideRequest(() => authorizeStaffAlertFixture(database.pool, operationId)) } });
  const accounts = crossAccountPool(runtime, "X40");
  const staff = { access, sessions, repository, intents, webauthn: new StaffWebAuthnService(repository, { publicAppUrl: origin }),
    readiness: { readIndependentAlertReadiness: async () => locked ? "UNAVAILABLE" : "READY" },
    recoveryPermits: { repository: new PostgresRecoveryPermitStaffRepository(runtime, accounts), readEmail: accountEmailReader(accounts, keys) } } as unknown as StaffHttpApplication;
  api = buildApi({ application: staffHttpAskApplication(), allowedOrigin: origin, sessions, staffAccess: access, staffPolicyVersion: 2, staff });
  // The same API built without the person's side, as main.ts builds it when the email route is off.
  const { recoveryPermits: _absent, ...withoutPermits } = staff;
  bare = buildApi({ application: staffHttpAskApplication(), allowedOrigin: origin, sessions, staffAccess: access, staffPolicyVersion: 2, staff: withoutPermits as StaffHttpApplication });
  owner = await signedIn("OWNER");
  ownerElevated = await elevate(owner);
}, 180_000);
afterAll(async () => { await api?.close(); await bare?.close(); await Promise.all([runtime?.end(), person?.end()]); await database?.stop(); for (const dek of deks.values()) dek.fill(0); });

describe("the Owner's list", () => {
  it("shows each ask's facts and its address shortened, no-store, and never the whole address or an account id", async () => {
    const a = await account("maria.popescu@example.net"), ref = await asked(a);
    const page = await read(owner, ownerElevated);
    expect(page.statusCode, page.body).toBe(200);
    expect(page.headers["cache-control"]).toBe("no-store");
    const value = page.json() as { daily_cap: number; approved_today: number; requests: Row[] };
    expect(value.daily_cap).toBe(3);
    const row = value.requests.find((r) => r.ref === ref)!;
    expect(row).toEqual({ ref, revision: 2, stage: "REQUESTED", masked_address: "mar•••pop•••scu@example.net",
      requested_at: expect.any(String), request_expires_at: expect.any(String), approved_at: null, not_before: null, finish_expires_at: null,
      account_created_at: expect.any(String), last_sign_in_at: null, passkeys: 1, authenticator_app: false, saved_codes_left: false,
      security_hold: false, risk_mark: false, ever_paid: false, earlier_requests: 0 });
    expect(Date.parse(row.request_expires_at as string) - Date.parse(row.requested_at as string)).toBe(14 * 86_400_000);
    expect(Date.now() - Date.parse(row.account_created_at as string)).toBeGreaterThan(199 * 86_400_000);
    for (const secret of [a.address, "maria.popescu", a.userId, a.ownerRef]) expect(page.body).not.toContain(secret);
    expect(page.body).not.toMatch(/"(user_id|userId|owner_ref|email)"/u);
  });
  it("says an account ever paid once one of its charges succeeded, and never how much", async () => {
    const a = await account("paying.person@example.net"), ref = await asked(a);
    expect((await rowOf(ref))!.ever_paid).toBe(false);
    const chargeId = randomBytes(16).toString("hex");
    await database.pool.query(`INSERT INTO billing.charge(charge_id,owner_ref,subscription_id,kind,attempt,period_start,period_end,net_micros,tax_micros,total_micros,currency,created_at,payment_provider,payment_environment)
      VALUES($1,$2,$3,'CARD_CHECK',1,clock_timestamp(),clock_timestamp()+interval '30 days',0,0,0,'USD',clock_timestamp(),'netopia','sandbox')`, [chargeId, a.ownerRef, randomUUID()]);
    // A charge that never succeeded is not a payment.
    expect((await rowOf(ref))!.ever_paid).toBe(false);
    await database.pool.query(`INSERT INTO billing.charge_event(charge_id,kind,at,provider_payment_id,amount_micros,error_code,refunds_transaction_id,payment_provider,payment_environment)
      VALUES($1,'SUCCEEDED',clock_timestamp(),$2,0,NULL,NULL,'netopia','sandbox')`, [chargeId, `fixture-${randomUUID()}`]);
    const page = await read(owner, ownerElevated), row = (page.json().requests as Row[]).find((r) => r.ref === ref)!;
    expect(row.ever_paid).toBe(true);
    expect(Object.keys(row)).not.toContain("amount_micros");
    expect(page.body).not.toContain(chargeId);
  });
});

describe("nobody but the Owner", () => {
  /** The three routes for a ref. */
  async function answers(p: Staff, elevated: Elevated | undefined, ref: string) {
    const body = { expected_revision: 2, operation_id: randomUUID(), proof_handle: randomBytes(32).toString("base64url") };
    return [await read(p, elevated), await post(p, elevated, ref, "approve", body), await post(p, elevated, ref, "refuse", body)].map((r) => [r.statusCode, r.json(), r.headers["cache-control"] ?? null]);
  }
  /**
   * Another staff route that keeps the Owner's door in its handler, as these three do: the approved buyers' list (0186).
   * A route whose capability is in its route policy is refused earlier, with the access layer's own code.
   */
  const elsewhere = async (p: Staff, elevated?: Elevated) => {
    const r = await api.inject({ method: "GET", url: "/v1/admin/preview-buyers", headers: headers(p, elevated) });
    return [r.statusCode, r.json()];
  };
  it("a signed-in person who is not staff is refused on all three routes as on any other staff route, the same for a real ask and a made-up one", async () => {
    const a = await account("ana.ionescu@example.net"), ref = await asked(a), p = await signedIn("NOT_STAFF");
    const real = await answers(p, undefined, ref), made = await answers(p, undefined, randomUUID());
    const other = await elsewhere(p);
    expect(other[0]).toBeGreaterThanOrEqual(400);
    for (const [status, json] of [...real, ...made]) expect([status, json]).toEqual(other);
    expect(made.map(([status, json]) => [status, json])).toEqual(real.map(([status, json]) => [status, json]));
    expect(JSON.stringify(real)).not.toContain(a.userId);
    expect(await stage(ref)).toMatchObject({ stage: "REQUESTED" });
  });
  it("a staff member who is not the Owner is refused on all three routes and on the ceremony, the same for a real ask and a made-up one", async () => {
    const a = await account("bogdan.marin@example.net"), ref = await asked(a), member = await signedIn("MEMBER"), elevated = await elevate(member);
    const real = await answers(member, elevated, ref), made = await answers(member, elevated, randomUUID());
    expect(await elsewhere(member, elevated)).toEqual([403, { error: "STAFF_REQUEST_REFUSED" }]);
    for (const [status, json] of [...real, ...made]) expect([status, json]).toEqual([403, { error: "STAFF_REQUEST_REFUSED" }]);
    for (const action of ["RECOVERY_PERMIT_APPROVE", "RECOVERY_PERMIT_REFUSE"] as const) {
      const before = await challenges(), options = await optionsFor(member, elevated, intentFor(action, ref, 2));
      expect([options.statusCode, options.json()]).toEqual([403, { error: "STAFF_REQUEST_REFUSED" }]);
      expect(await challenges()).toBe(before);
    }
    expect(await stage(ref)).toMatchObject({ stage: "REQUESTED", revision: 2 });
  });
});

describe("the Owner's decision through the key ceremony", () => {
  it("the ceremony is bound under TEAM_GRANT to the account, the ask, the revision the page showed and the operation, in the five fields the database takes", async () => {
    const a = await account("andrei.ilie@example.net"), ref = await asked(a), intent = intentFor("RECOVERY_PERMIT_APPROVE", ref, 2);
    const options = await optionsFor(owner, ownerElevated, intent);
    expect([options.statusCode, options.body]).toEqual([200, expect.any(String)]);
    const stored = (await database.pool.query("SELECT binding FROM staff.webauthn_challenge WHERE user_id=$1 AND purpose='ACTION' ORDER BY created_at DESC LIMIT 1", [owner.userId])).rows[0]?.binding;
    expect(stored).toEqual(canonicalRecoveryPermitBinding("RECOVERY_PERMIT_APPROVE", a.userId, ref, 2, intent.operation_id));
    expect(JSON.stringify(stored)).not.toContain(a.address);
  });
  it("an approval with a fresh proof starts the wait, and the list shows it waiting", async () => {
    await clearToday();
    const a = await account("cristina.dobre@example.net"), ref = await asked(a);
    const { intent, response } = await decide("RECOVERY_PERMIT_APPROVE", ref);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ operation_id: intent.operation_id, outcome: "COMPLETED", recorded_at: expect.any(String) });
    expect(await stage(ref)).toEqual({ stage: "WAITING", revision: 3 });
    expect((await database.pool.query("SELECT kind,alerted,actor_staff_id FROM staff.recovery_permit_decision WHERE permit_id=$1", [ref])).rows).toEqual([{ kind: "APPROVED", alerted: true, actor_staff_id: owner.staffId }]);
    expect((await database.pool.query("SELECT event_type FROM staff.audit_event WHERE operation_id=$1", [intent.operation_id])).rows).toEqual([{ event_type: "ACCOUNT_RECOVERY_APPROVED" }]);
    const row = (await rowOf(ref))!;
    expect(row).toMatchObject({ stage: "WAITING", revision: 3, approved_at: expect.any(String), not_before: expect.any(String), finish_expires_at: expect.any(String) });
    expect(Date.parse(row.not_before as string) - Date.parse(row.approved_at as string)).toBe(72 * 3_600_000);
  });
  it("a refusal with a fresh proof ends the ask, and it leaves the list", async () => {
    const a = await account("dan.stoica@example.net"), ref = await asked(a);
    const { intent, response } = await decide("RECOVERY_PERMIT_REFUSE", ref);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ operation_id: intent.operation_id, outcome: "COMPLETED" });
    expect((await stage(ref)).stage).toBe("REFUSED");
    expect(await rowOf(ref)).toBeUndefined();
  });
  it("a proof made for one ask is refused on another ask's route, and the proof made to refuse is refused on the approve route", async () => {
    await clearToday();
    const a = await account("elena.radu@example.net"), b = await account("florin.matei@example.net"), refA = await asked(a), refB = await asked(b);
    const forA = intentFor("RECOVERY_PERMIT_APPROVE", refA, 2), handleA = await prove(owner, ownerElevated, forA);
    const onB = await post(owner, ownerElevated, refB, "approve", bodyOf(forA, handleA));
    expect([onB.statusCode, onB.json()]).toEqual([403, { error: "STAFF_REQUEST_REFUSED" }]);
    const refusing = intentFor("RECOVERY_PERMIT_REFUSE", refA, 2), handleRefuse = await prove(owner, ownerElevated, refusing);
    const asApproval = await post(owner, ownerElevated, refA, "approve", bodyOf(refusing, handleRefuse));
    expect([asApproval.statusCode, asApproval.json()]).toEqual([403, { error: "STAFF_REQUEST_REFUSED" }]);
    expect(await stage(refA)).toEqual({ stage: "REQUESTED", revision: 2 });
    expect(await stage(refB)).toEqual({ stage: "REQUESTED", revision: 2 });
    expect((await database.pool.query("SELECT count(*)::int AS n FROM staff.recovery_permit_decision WHERE permit_id=ANY($1::uuid[])", [[refA, refB]])).rows[0].n).toBe(0);
  });
  it("a page looking at another revision is stale, at the ceremony and at the route, before any proof is read", async () => {
    const a = await account("gabriela.tudor@example.net"), ref = await asked(a), before = await challenges();
    const options = await optionsFor(owner, ownerElevated, intentFor("RECOVERY_PERMIT_APPROVE", ref, 1));
    expect([options.statusCode, options.json()]).toEqual([409, { error: "RECOVERY_PERMITS_STALE" }]);
    expect(await challenges()).toBe(before);
    const stale = await post(owner, ownerElevated, ref, "approve", { expected_revision: 1, operation_id: randomUUID(), proof_handle: randomBytes(32).toString("base64url") });
    expect([stale.statusCode, stale.json()]).toEqual([409, { error: "RECOVERY_PERMITS_STALE" }]);
    // An ask that is not on the list is stale too: the Owner's page cannot be looking at it.
    const gone = await optionsFor(owner, ownerElevated, intentFor("RECOVERY_PERMIT_REFUSE", randomUUID(), 2));
    expect([gone.statusCode, gone.json()]).toEqual([409, { error: "RECOVERY_PERMITS_STALE" }]);
    expect((await stage(ref)).stage).toBe("REQUESTED");
  });
  it("an account under a security hold is shown with it, and its approval is refused by name", async () => {
    await clearToday();
    const a = await account("horia.vasile@example.net"), ref = await asked(a);
    await database.pool.query("INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,0)", [a.userId]);
    expect((await rowOf(ref))!.security_hold).toBe(true);
    const { response } = await decide("RECOVERY_PERMIT_APPROVE", ref);
    expect([response.statusCode, response.json()]).toEqual([409, { error: "RECOVERY_PERMIT_NOT_ALLOWED" }]);
    expect((await stage(ref)).stage).toBe("REQUESTED");
  });
  it("the fourth approval inside 24 hours is refused by name, and a refusal still goes through", async () => {
    await clearToday();
    const refs: string[] = [];
    for (const name of ["ioana", "julia", "karina", "laura"]) refs.push(await asked(await account(`${name}.fixture@example.net`)));
    for (const ref of refs.slice(0, 3)) expect((await decide("RECOVERY_PERMIT_APPROVE", ref)).response.statusCode).toBe(200);
    expect((await read(owner, ownerElevated)).json().approved_today).toBe(3);
    const fourth = await decide("RECOVERY_PERMIT_APPROVE", refs[3]!);
    expect([fourth.response.statusCode, fourth.response.json()]).toEqual([409, { error: "RECOVERY_PERMITS_DAILY_CAP" }]);
    expect((await stage(refs[3]!)).stage).toBe("REQUESTED");
    expect((await decide("RECOVERY_PERMIT_REFUSE", refs[3]!)).response.statusCode).toBe(200);
    expect((await stage(refs[3]!)).stage).toBe("REFUSED");
  });
});

describe("while the team tools are locked", () => {
  it("an approval is refused before any key is touched; a refusal goes through, with its own row and no alert", async () => {
    await clearToday();
    const a = await account("mihai.lupu@example.net"), ref = await asked(a);
    locked = true;
    try {
      const before = await challenges();
      const options = await optionsFor(owner, ownerElevated, intentFor("RECOVERY_PERMIT_APPROVE", ref, 2));
      expect([options.statusCode, options.json()]).toEqual([503, { error: "STAFF_ALERT_UNAVAILABLE" }]);
      const approved = await post(owner, ownerElevated, ref, "approve", { expected_revision: 2, operation_id: randomUUID(), proof_handle: randomBytes(32).toString("base64url") });
      expect([approved.statusCode, approved.json()]).toEqual([503, { error: "STAFF_ALERT_UNAVAILABLE" }]);
      expect(await challenges()).toBe(before);
      expect((await stage(ref)).stage).toBe("REQUESTED");
      const { intent, response } = await decide("RECOVERY_PERMIT_REFUSE", ref);
      expect(response.statusCode, response.body).toBe(200);
      expect((await stage(ref)).stage).toBe("REFUSED");
      expect((await database.pool.query("SELECT kind,alerted FROM staff.recovery_permit_decision WHERE permit_id=$1", [ref])).rows).toEqual([{ kind: "REFUSED", alerted: false }]);
      expect((await database.pool.query("SELECT count(*)::int AS n FROM staff.audit_event WHERE operation_id=$1", [intent.operation_id])).rows[0].n).toBe(0);
    } finally { locked = false; }
  });
});

describe("an API built without the person's side", () => {
  it("answers 404 on the three routes and on the ceremony, to the Owner", async () => {
    const a = await account("nicoleta.pop@example.net"), ref = await asked(a);
    const body = { expected_revision: 2, operation_id: randomUUID(), proof_handle: randomBytes(32).toString("base64url") };
    const list = await read(owner, ownerElevated, bare), approve = await post(owner, ownerElevated, ref, "approve", body, bare), refuse = await post(owner, ownerElevated, ref, "refuse", body, bare);
    for (const r of [list, approve, refuse]) expect([r.statusCode, r.json()]).toEqual([404, { error: "NOT_FOUND" }]);
    const options = await optionsFor(owner, ownerElevated, intentFor("RECOVERY_PERMIT_APPROVE", ref, 2), bare);
    expect([options.statusCode, options.json()]).toEqual([404, { error: "NOT_FOUND" }]);
    expect((await stage(ref)).stage).toBe("REQUESTED");
  });
});
