import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresRecoveryPermitRepository, PostgresRecoveryPermitStaffRepository, type Pool } from "@debateai/db";
import { canonicalPreviewBuyerBinding } from "../../apps/api/src/staff/preview-buyers.js";
import { canonicalRecoveryPermitBinding } from "../../apps/api/src/staff/recovery-permits.js";
import { internalFundingFixture } from "../support/internalFundingFixture.js";
import { authorizeStaffAlertFixture } from "../support/staffAlertReadiness.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0188, the Owner's permit for a locked-out account, on real Postgres through the logins' own grants: the email route's
 * login (the person's side), the API's request login (the Owner's side), a runner-shaped login and /recover's own login.
 * A proof here is stored the way the key ceremony stores one. Time is the database's: a test moves a row's own times back
 * instead of waiting.
 */
let database: TestDatabase, person: Pool, api: Pool, runner: Pool, recover: Pool;
let permits: PostgresRecoveryPermitRepository, staff: PostgresRecoveryPermitStaffRepository;
const hash = (value: string = randomUUID()) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const source = { ipArgon2id: `argon2id-audit:v1:${"c".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"d".repeat(64)}` };
const envelope = (ct: string = randomBytes(6).toString("base64")) => ({ v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct });
const riskContext = (userId: string) => ({ ...envelope(), keyId: `auth-risk:${userId}:v1` });
const PASSWORD = "fixture-password-hash";
type Actor = Readonly<{ userId: string; sessionId: string; staffId: string; privilegeId: string; context: Record<string, unknown> }>;
type Decision = "RECOVERY_PERMIT_APPROVE" | "RECOVERY_PERMIT_REFUSE";
let owner: Actor;
const ACT = "SELECT staff.recovery_permit_act($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value";
const EVENT: Record<Decision, string> = { RECOVERY_PERMIT_APPROVE: "ACCOUNT_RECOVERY_APPROVED", RECOVERY_PERMIT_REFUSE: "ACCOUNT_RECOVERY_REFUSED" };

type Account = Readonly<{ userId: string; index: Buffer; primary: string; backup: string | null; passkey: string | null }>;
/** An active account whose sign-in address was verified 60 days ago, with one passkey and, when asked, a backup address. */
async function account(options: Readonly<{ backup?: boolean; passkey?: boolean }> = {}): Promise<Account> {
  const userId = randomUUID(), index = randomBytes(32), primary = randomUUID(), backup = options.backup === true ? randomUUID() : null;
  const address = envelope(), backupAddress = envelope(), q = database.pool;
  await q.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at,created_at)
    VALUES($1::uuid,$2,$3,$4,$5,$1::text,'active',now(),now()-interval '200 days')`, [userId, index, address, backup === null ? null : backupAddress, PASSWORD]);
  await q.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at)
    VALUES($1,$2,'email',$3,'verified',now()-interval '60 days',now()-interval '60 days')`, [primary, userId, address]);
  if (backup !== null) await q.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at)
    VALUES($1,$2,'recovery_email',$3,'verified',now()-interval '50 days',now()-interval '50 days')`, [backup, userId, backupAddress]);
  let passkey: string | null = null;
  if (options.passkey !== false) passkey = await addPasskey(userId);
  return { userId, index, primary, backup, passkey };
}
async function addPasskey(userId: string): Promise<string> {
  const id = randomUUID();
  await database.pool.query("INSERT INTO identity.consumer_passkey_subject(user_id,user_handle) VALUES($1,$2) ON CONFLICT DO NOTHING", [userId, randomBytes(32).toString("base64url")]);
  await withLocale((c) => c.query(`INSERT INTO identity.consumer_passkey_credential(consumer_credential_id,user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin)
    VALUES($1,$2,$3,'AQID',0,'singleDevice',false,'example.test','https://example.test')`, [id, userId, randomBytes(16).toString("base64url")]));
  return id;
}
/** A write as the superuser that fires the account's own notice triggers, which read the request's mail language. */
async function withLocale<T>(work: (client: { query: Pool["query"] }) => Promise<T>): Promise<T> {
  const c = await database.pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('debateai.mail_locale','en',true)");
    const value = await work(c as never);
    await c.query("COMMIT");
    return value;
  } catch (error) { await c.query("ROLLBACK"); throw error; } finally { c.release(); }
}
type Started = Readonly<{ permitId: string; link: string; cancel: string }>;
/** The start as the API makes it: the account's verified addresses, one sealed entry each, the link on the proving one. */
async function start(a: Account): Promise<Started | null> {
  const candidate = await permits.prepare(a.index);
  if (candidate === null) return null;
  const permitId = randomUUID(), link = hash(), cancel = hash();
  const notices = candidate.channels.map((c) => ({ channelId: c.channelId, envelope: envelope(), ...(c.cancelAuthorized ? { cancelEnvelope: envelope() } : {}), ...(c.proof ? { proofEnvelope: envelope() } : {}) }));
  const ok = await permits.start({ index: a.index, candidateId: candidate.userId, channels: candidate.channels.map((c) => c.channelId), linkHash: link, cancelHash: cancel, notices, source, mailLocale: "en", id: permitId });
  return ok ? { permitId, link, cancel } : null;
}
/** The mailbox link and the password, as the API hands them on once it checked the typed password itself. */
async function request(s: Started, password: string = PASSWORD): Promise<{ status: string; finish: string }> {
  const finish = hash();
  return { status: await permits.request(s.link, password, finish, envelope() as never, source), finish };
}
async function asked(a: Account): Promise<Started & { finish: string }> {
  const s = await start(a);
  if (s === null) throw new Error("FIXTURE_START_REFUSED");
  const r = await request(s);
  if (r.status !== "REQUESTED") throw new Error(`FIXTURE_REQUEST_${r.status}`);
  return { ...s, finish: r.finish };
}
const row = async (permitId: string) => (await database.pool.query("SELECT stage,close_reason,revision::int AS revision,opened_count,failures FROM identity.recovery_permit WHERE permit_id=$1", [permitId])).rows[0];
const notices = async (permitId: string) => (await database.pool.query(
  "SELECT channel_id,event_kind,available_at>clock_timestamp()+interval '71 hours' AS later FROM identity.recovery_permit_notice WHERE permit_id=$1 ORDER BY event_kind,channel_id", [permitId])).rows;
/** A proof as the ceremony stores one; with an event, the team tools are open for its operation and the alert is built. */
async function storedProof(a: Actor, binding: Record<string, unknown>, event: string | null, ttl: "live" | "expired" = "live") {
  const proofId = randomUUID(), c = a.context as { securityEpoch: number; grantRevision: number; accountSecurityEpoch: number };
  const times = ttl === "expired" ? "now()-interval '2 minutes',now()-interval '1 minute'" : "now(),now()+interval '5 minutes'";
  await database.pool.query(`INSERT INTO staff.action_proof(proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,account_security_epoch,grant_revision,binding,credential_id,verified_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'fixture-key',${times})`, [proofId, a.staffId, a.userId, a.sessionId, a.privilegeId, c.securityEpoch, c.accountSecurityEpoch, c.grantRevision, binding]);
  if (event === null) return { proofId, alert: null };
  await authorizeStaffAlertFixture(database.pool, binding.operationId as string);
  return { proofId, alert: { schema: "staff-alert-v1", event, operationId: binding.operationId, envelope: envelope("YQ==") } };
}
const command = (intent: Decision, a: Account, permitId: string, expectedRevision: number, operationId: string) => ({ intent, requestRef: permitId, targetId: a.userId, expectedRevision, operationId });
const binding = (intent: Decision, a: Account, permitId: string, expectedRevision: number, operationId: string = randomUUID()) =>
  canonicalRecoveryPermitBinding(intent, a.userId, permitId, expectedRevision, operationId) as unknown as Record<string, unknown>;
/** One decision through the door, on the API's request login: proven, at the ask's current revision, alerted unless `locked`. */
async function decide(actor: Actor, intent: Decision, a: Account, permitId: string, options: Readonly<{ locked?: boolean }> = {}) {
  const at = (await row(permitId)).revision as number, proven = binding(intent, a, permitId, at), proof = await storedProof(actor, proven, options.locked === true ? null : EVENT[intent]);
  return api.query(ACT, [actor.context, proof.proofId, proven, command(intent, a, permitId, at, proven.operationId as string), proof.alert]);
}
/** Moves an approved ask back in time, with its scheduled finish mail, as if `hours` had passed since the approval. */
async function age(permitId: string, hours: number): Promise<void> {
  await database.pool.query(`UPDATE identity.recovery_permit SET requested_at=requested_at-$2*interval '1 hour',request_expires_at=request_expires_at-$2*interval '1 hour',
    approved_at=approved_at-$2*interval '1 hour',not_before=not_before-$2*interval '1 hour',finish_expires_at=finish_expires_at-$2*interval '1 hour',
    opened_at=opened_at-$2*interval '1 hour' WHERE permit_id=$1`, [permitId, hours]);
  await database.pool.query("UPDATE identity.recovery_permit_notice SET available_at=available_at-$2*interval '1 hour' WHERE permit_id=$1", [permitId, hours]);
}
/** An ask the Owner approved, with the 72 hours already over. */
async function approvedAndWaited(a: Account) {
  const s = await asked(a);
  await decide(owner, "RECOVERY_PERMIT_APPROVE", a, s.permitId);
  await age(s.permitId, 73);
  return s;
}
/** The daily limit counts the decisions of the last 24 hours; a test that needs room moves the earlier ones a day back. */
async function clearToday(): Promise<void> {
  await database.pool.query("ALTER TABLE staff.recovery_permit_decision DISABLE TRIGGER staff_immutable");
  await database.pool.query("UPDATE staff.recovery_permit_decision SET recorded_at=recorded_at-interval '25 hours' WHERE recorded_at>clock_timestamp()-interval '24 hours'");
  await database.pool.query("ALTER TABLE staff.recovery_permit_decision ENABLE TRIGGER staff_immutable");
}
const gate = async (userId: string) => (await database.pool.query("SELECT active,epoch::int AS epoch,cap_hash FROM identity.consumer_recovery_gate WHERE user_id=$1", [userId])).rows[0];
/** What /recover's own completion leaves behind once a new sign-in method is set up: the step closed at the same count. */
async function enrolled(userId: string): Promise<void> {
  await database.pool.query("UPDATE identity.consumer_recovery_gate SET active=false,cap_hash=NULL,cap_issued_at=NULL,cap_expires_at=NULL,method=NULL,channel_binding_id=NULL,channel_ciphertext=NULL,hold_epoch=NULL WHERE user_id=$1", [userId]);
}
async function delegate(): Promise<Actor> {
  const userId = randomUUID(), sessionId = randomUUID(), staffId = randomUUID(), privilegeId = randomUUID(), q = database.pool;
  await q.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), userId]);
  await q.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
    VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [randomUUID(), userId]);
  await q.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`, [userId]);
  await q.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
    VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [sessionId, userId, hash(sessionId), hash("csrf" + sessionId)]);
  await q.query("INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)", [staffId, userId, ["TEAM_READ", "AUDIT_READ", "EMERGENCY_DISABLE", "PUBLICATION_REVIEW", "THREAT_REPORT"]]);
  await q.query(`INSERT INTO staff.privilege_session(privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '2 hours')`, [privilegeId, staffId, userId, sessionId, hash(privilegeId), hash("staff-csrf" + privilegeId)]);
  const context = (await api.query("SELECT staff.read_context($1,$2,$3) AS context", [userId, sessionId, hash(privilegeId)])).rows[0].context;
  return { userId, sessionId, staffId, privilegeId, context };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  const login = async (name: string, roles: string) => {
    await database.pool.query(`CREATE ROLE ${name} LOGIN PASSWORD '${name}-fixture-only' IN ROLE ${roles}`);
    const u = new URL(database.connectionString); u.username = name; u.password = `${name}-fixture-only`;
    return createPool(u.toString());
  };
  person = await login("permit_person", "debateai_mfa_recovery_runtime");
  api = await login("permit_api", "debateai_runtime,debateai_billing_runtime");
  runner = await login("permit_runner", "debateai_runtime");
  recover = await login("permit_recover", "debateai_authorization_runtime");
  permits = new PostgresRecoveryPermitRepository(person);
  staff = new PostgresRecoveryPermitStaffRepository(api, database.pool);
  owner = await internalFundingFixture(database.pool, api).fundedActor() as unknown as Actor;
}, 180_000);
afterAll(async () => { await Promise.all([person?.end(), api?.end(), runner?.end(), recover?.end()]); await database?.stop(); });

describe("who may reach the step's functions and tables", () => {
  it("no login reads or writes a table, and each side is closed to the other's login", async () => {
    for (const table of ["identity.recovery_permit", "identity.recovery_permit_notice_binding", "identity.recovery_permit_notice", "staff.recovery_permit_decision"])
      for (const pool of [person, api, runner, recover]) await expect(pool.query(`SELECT 1 FROM ${table} LIMIT 1`)).rejects.toMatchObject({ code: "42501" });
    // The Owner's list and door are not the person's login's, nor the runner's.
    for (const pool of [person, runner]) {
      await expect(pool.query("SELECT staff.read_recovery_permits($1::jsonb,$2)", [owner.context, hash(owner.sessionId)])).rejects.toMatchObject({ code: "42501" });
      await expect(pool.query(ACT, [owner.context, randomUUID(), {}, {}, null])).rejects.toMatchObject({ code: "42501" });
    }
    // The person's steps are not the API request login's, and the internal doors are nobody's but their callers'.
    await expect(api.query("SELECT identity.recovery_permit_prepare($1)", [randomBytes(32)])).rejects.toMatchObject({ code: "42501" });
    for (const pool of [person, api, runner, recover]) {
      await expect(pool.query("SELECT identity.recovery_permit_queue_internal()")).rejects.toMatchObject({ code: "42501" });
      await expect(pool.query("SELECT identity.recovery_permit_decide_internal($1,$2,1,'APPROVED')", [randomUUID(), randomUUID()])).rejects.toMatchObject({ code: "42501" });
      await expect(pool.query("SELECT identity.recovery_permit_open_gate_internal($1,$2,$3,$4)", [randomUUID(), randomUUID(), hash(), source])).rejects.toMatchObject({ code: "42501" });
      await expect(pool.query("SELECT identity.recovery_permit_close($1,'CANCELLED','CANCEL_LINK')", [randomUUID()])).rejects.toMatchObject({ code: "42501" });
    }
  });
});

describe("the ask", () => {
  it("an address with no account and an account that may ask are told apart only inside the database: no row for the first, one mailbox link for the second", async () => {
    expect(await permits.prepare(randomBytes(32))).toBeNull();
    const a = await account({ backup: true }), s = await start(a);
    expect(s).not.toBeNull();
    expect(await row(s!.permitId)).toMatchObject({ stage: "LINK_SENT", revision: 1 });
    // The link goes to the sign-in address alone; the backup address hears nothing until an approval.
    expect(await notices(s!.permitId)).toEqual([{ channel_id: a.primary, event_kind: "PROOF", later: false }]);
  });
  it("the mailbox link alone asks nothing of the Owner: a wrong password leaves no request", async () => {
    const a = await account(), s = (await start(a))!;
    expect((await request(s, "another-password-hash")).status).toBe("INVALID");
    expect((await row(s.permitId)).stage).toBe("LINK_SENT");
    expect((await staff.readList(owner.context as never, hash(owner.sessionId))).requests.some((r) => r.userId === a.userId)).toBe(false);
  });
  it("the password alone asks nothing either: without the mailbox link there is nothing to send it to", async () => {
    const a = await account();
    expect(await permits.prepareRequest(hash())).toBeNull();
    expect(await permits.request(hash(), PASSWORD, hash(), envelope() as never, source)).toBe("INVALID");
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.recovery_permit WHERE user_id=$1", [a.userId])).rows[0].n).toBe(0);
  });
  it("the link and the password together make one request, which the Owner's list shows as facts and nothing typed", async () => {
    const a = await account({ backup: true }), s = await asked(a);
    expect(await row(s.permitId)).toMatchObject({ stage: "REQUESTED", revision: 2 });
    const list = await staff.readList(owner.context as never, hash(owner.sessionId));
    const shown = list.requests.find((r) => r.ref === s.permitId)!;
    expect(shown).toMatchObject({ userId: a.userId, stage: "REQUESTED", revision: 2, passkeys: 1, authenticatorApp: false, savedCodesLeft: false, securityHold: false, riskMark: false, earlierRequests: 0, lastSignInAt: null, approvedAt: null });
    expect(shown.requestExpiresAt.getTime() - shown.requestedAt.getTime()).toBe(14 * 86_400_000);
    expect(Date.now() - shown.accountCreatedAt.getTime()).toBeGreaterThan(199 * 86_400_000);
    expect(list.dailyCap).toBe(3);
    // The link is used up: a second request with it is refused.
    expect((await request(s)).status).toBe("INVALID");
  });
  it("the mailbox link works for 30 minutes", async () => {
    const a = await account(), s = (await start(a))!;
    await database.pool.query("UPDATE identity.recovery_permit SET started_at=started_at-interval '31 minutes',link_expires_at=link_expires_at-interval '31 minutes' WHERE permit_id=$1", [s.permitId]);
    expect((await request(s)).status).toBe("INVALID");
    expect(await row(s.permitId)).toMatchObject({ stage: "EXPIRED", close_reason: "TIMED_OUT" });
  });
  it("at most three mailbox links go to one account in an hour", async () => {
    const a = await account();
    for (let i = 0; i < 3; i++) expect(await start(a)).not.toBeNull();
    expect(await start(a)).toBeNull();
  });
  it("five wrong passwords at the mailbox link end the ask and mark the account, and the mark refuses the next ask", async () => {
    const a = await account(), s = (await start(a))!;
    for (let i = 0; i < 4; i++) expect(await permits.recordFailure(s.link, "link", source, riskContext(a.userId) as never)).toBe("PROOF_INVALID");
    expect(await permits.recordFailure(s.link, "link", source, riskContext(a.userId) as never)).toBe("REFUSED");
    expect(await row(s.permitId)).toMatchObject({ stage: "REFUSED", close_reason: "PROOF_FAILED" });
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.authentication_risk_signal WHERE user_id=$1 AND signal_kind='RECOVERY_PROOF_FAILED'", [a.userId])).rows[0].n).toBe(1);
    expect((await request(s)).status).toBe("INVALID");
    expect(await start(a)).toBeNull();
  });
  it("wrong passwords spread over several links add up to the same mark", async () => {
    const a = await account(), first = (await start(a))!;
    for (let i = 0; i < 3; i++) expect(await permits.recordFailure(first.link, "link", source, riskContext(a.userId) as never)).toBe("PROOF_INVALID");
    const second = (await start(a))!;
    expect(await permits.recordFailure(second.link, "link", source, riskContext(a.userId) as never)).toBe("PROOF_INVALID");
    expect(await permits.recordFailure(second.link, "link", source, riskContext(a.userId) as never)).toBe("REFUSED");
    expect(await start(a)).toBeNull();
  });
});

describe("accounts that may never ask", () => {
  it.each(["staff", "former staff", "security hold", "risk mark", "erasure asked", "address changed 10 days ago", "sign-in address not verified", "suspended"])("%s: the start answers as for no account", async (kind) => {
    const a = await account(), q = database.pool;
    if (kind === "staff") await q.query("INSERT INTO staff.subject(user_id) VALUES($1)", [a.userId]);
    if (kind === "former staff") await q.query("INSERT INTO staff.subject(user_id,state) VALUES($1,'DISABLED')", [a.userId]);
    if (kind === "security hold") await q.query("INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,1)", [a.userId]);
    if (kind === "risk mark") await q.query("INSERT INTO identity.authentication_risk_signal(user_id,signal_kind,context_ciphertext,observed_at,expires_at) VALUES($1,'SESSION_CONTEXT_CHANGED',$2,now(),now()+interval '7776000 seconds')", [a.userId, riskContext(a.userId)]);
    if (kind === "erasure asked") await q.query("INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at) VALUES($1,$2,clock_timestamp(),clock_timestamp()+interval '1 day')", [randomUUID(), a.userId]);
    if (kind === "address changed 10 days ago") await q.query(`INSERT INTO identity.email_change_request(email_change_id,user_id,new_email_blind_index,new_email_ciphertext,confirm_token_hash,cancel_token_hash,issued_at,last_sent_at,expires_at,closed_at,outcome)
      VALUES($1,$2,$3,'{}',$4,$5,now()-interval '11 days',now()-interval '11 days',now()-interval '10 days 23 hours',now()-interval '10 days','CONFIRMED')`, [randomUUID(), a.userId, randomBytes(32), hash(), hash()]);
    if (kind === "sign-in address not verified") await q.query("UPDATE identity.channel_binding SET state='pending_verification',verified_at=NULL WHERE channel_binding_id=$1", [a.primary]);
    if (kind === "suspended") await q.query(`UPDATE identity."user" SET state='suspended' WHERE user_id=$1`, [a.userId]);
    expect(await permits.prepare(a.index)).toBeNull();
    expect(await start(a)).toBeNull();
  });
  it("an address changed 40 days ago no longer stands in the way", async () => {
    const a = await account();
    await database.pool.query(`INSERT INTO identity.email_change_request(email_change_id,user_id,new_email_blind_index,new_email_ciphertext,confirm_token_hash,cancel_token_hash,issued_at,last_sent_at,expires_at,closed_at,outcome)
      VALUES($1,$2,$3,'{}',$4,$5,now()-interval '41 days',now()-interval '41 days',now()-interval '40 days 23 hours',now()-interval '40 days','CONFIRMED')`, [randomUUID(), a.userId, randomBytes(32), hash(), hash()]);
    expect(await start(a)).not.toBeNull();
  });
  it("an account that became staff after it asked loses the request, and the door refuses it", async () => {
    const a = await account(), s = await asked(a);
    await database.pool.query("INSERT INTO staff.subject(user_id) VALUES($1)", [a.userId]);
    await expect(decide(owner, "RECOVERY_PERMIT_APPROVE", a, s.permitId)).rejects.toThrow("RECOVERY_PERMITS_STALE");
    await staff.readList(owner.context as never, hash(owner.sessionId));
    expect(await row(s.permitId)).toMatchObject({ stage: "CANCELLED", close_reason: "NOT_ALLOWED" });
  });
});

describe("one permit in any 90 days", () => {
  it("a second ask while one waits for the Owner is refused at the start", async () => {
    const a = await account();
    await asked(a);
    expect(await start(a)).toBeNull();
  });
  it("a mailbox link sent before another ask reached the Owner cannot become a second request", async () => {
    const a = await account(), first = (await start(a))!, second = (await start(a))!;
    expect((await request(first)).status).toBe("REQUESTED");
    expect((await request(second)).status).toBe("REFUSED");
    expect(await row(second.permitId)).toMatchObject({ stage: "REFUSED", close_reason: "NOT_ALLOWED" });
  });
  it("after a finished permit the next ask waits 90 days", async () => {
    await clearToday();
    const a = await account(), s = await approvedAndWaited(a);
    expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("OPENED");
    await enrolled(a.userId);
    await permits.expire(1000);
    expect(await row(s.permitId)).toMatchObject({ stage: "USED", close_reason: "FINISHED" });
    expect(await start(a)).toBeNull();
    await database.pool.query("UPDATE identity.recovery_permit SET closed_at=closed_at-interval '89 days' WHERE permit_id=$1", [s.permitId]);
    expect(await start(a)).toBeNull();
    await database.pool.query("UPDATE identity.recovery_permit SET closed_at=closed_at-interval '2 days' WHERE permit_id=$1", [s.permitId]);
    expect(await start(a)).not.toBeNull();
  });
  it("after a cancelled ask the next one waits a day", async () => {
    const a = await account(), s = await asked(a);
    expect(await permits.cancel(s.cancel, source)).toBe("CANCELLED");
    expect(await start(a)).toBeNull();
    await database.pool.query("UPDATE identity.recovery_permit SET closed_at=closed_at-interval '25 hours' WHERE permit_id=$1", [s.permitId]);
    expect(await start(a)).not.toBeNull();
  });
});

describe("the Owner's decision", () => {
  it("an approval starts 72 hours, tells every verified address at once and keeps the finish link for the proving address until they are over", async () => {
    await clearToday();
    const a = await account({ backup: true }), s = await asked(a), result = await decide(owner, "RECOVERY_PERMIT_APPROVE", a, s.permitId);
    expect(result.rows[0].value.outcome).toBe("COMPLETED");
    expect(await row(s.permitId)).toMatchObject({ stage: "WAITING", revision: 3 });
    const times = (await database.pool.query("SELECT extract(epoch FROM not_before-approved_at)::int AS wait,extract(epoch FROM finish_expires_at-not_before)::int AS finish_window FROM identity.recovery_permit WHERE permit_id=$1", [s.permitId])).rows[0];
    expect(times).toEqual({ wait: 72 * 3600, finish_window: 7 * 86400 });
    expect(await notices(s.permitId)).toEqual([
      { channel_id: a.primary, event_kind: "FINISH", later: true },
      { channel_id: a.primary, event_kind: "PROOF", later: false },
      ...[a.primary, a.backup!].sort().map((channel_id) => ({ channel_id, event_kind: "WAITING", later: false }))]);
    // One decision row, one audit row and its independent alert, under the decision's operation.
    const decision = (await database.pool.query("SELECT kind,alerted,actor_staff_id,operation_id FROM staff.recovery_permit_decision WHERE permit_id=$1", [s.permitId])).rows;
    expect(decision).toEqual([{ kind: "APPROVED", alerted: true, actor_staff_id: owner.staffId, operation_id: result.rows[0].value.operationId }]);
    const audit = (await database.pool.query("SELECT a.event_type,a.reason_code,a.actor_staff_id,a.subject_staff_id,(SELECT count(*)::int FROM staff.alert_outbox o WHERE o.event_id=a.event_id) AS alerts FROM staff.audit_event a WHERE a.operation_id=$1", [decision[0].operation_id])).rows;
    expect(audit).toEqual([{ event_type: "ACCOUNT_RECOVERY_APPROVED", reason_code: "SECURITY_RESPONSE", actor_staff_id: owner.staffId, subject_staff_id: owner.staffId, alerts: 1 }]);
  });
  it("a staff member who is not the Owner is refused, by the door and by the list's reader, and nothing changes", async () => {
    const d = await delegate(), a = await account(), s = await asked(a);
    await expect(decide(d, "RECOVERY_PERMIT_APPROVE", a, s.permitId)).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    await expect(decide(d, "RECOVERY_PERMIT_REFUSE", a, s.permitId)).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    await expect(staff.readList(d.context as never, hash(d.sessionId))).rejects.toThrow();
    expect((await row(s.permitId)).stage).toBe("REQUESTED");
  });
  it("an approval with no key proof, an expired one, or one used before is refused", async () => {
    await clearToday();
    const a = await account(), s = await asked(a), at = (await row(s.permitId)).revision as number;
    const proven = binding("RECOVERY_PERMIT_APPROVE", a, s.permitId, at), cmd = command("RECOVERY_PERMIT_APPROVE", a, s.permitId, at, proven.operationId as string);
    await authorizeStaffAlertFixture(database.pool, proven.operationId as string);
    const alert = { schema: "staff-alert-v1", event: "ACCOUNT_RECOVERY_APPROVED", operationId: proven.operationId, envelope: envelope("YQ==") };
    // No proof was ever made for this binding.
    await expect(api.query(ACT, [owner.context, randomUUID(), proven, cmd, alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    const expired = await storedProof(owner, proven, null, "expired");
    await expect(api.query(ACT, [owner.context, expired.proofId, proven, cmd, alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    expect((await row(s.permitId)).stage).toBe("REQUESTED");
    // A live proof is used once: the same proof under a new operation for the same ask is refused.
    const live = await storedProof(owner, proven, "ACCOUNT_RECOVERY_APPROVED");
    await api.query(ACT, [owner.context, live.proofId, proven, cmd, live.alert]);
    expect((await row(s.permitId)).stage).toBe("WAITING");
    const b = await account(), t = await asked(b), other = binding("RECOVERY_PERMIT_APPROVE", b, t.permitId, 2);
    await expect(api.query(ACT, [owner.context, live.proofId, other, command("RECOVERY_PERMIT_APPROVE", b, t.permitId, 2, other.operationId as string), null])).rejects.toThrow();
    expect((await row(t.permitId)).stage).toBe("REQUESTED");
  });
  it("a proof made for one request does not approve another, and a proof to refuse does not approve", async () => {
    await clearToday();
    const a = await account(), b = await account(), sa = await asked(a), sb = await asked(b);
    // Made for b's request, presented with a's.
    const forB = binding("RECOVERY_PERMIT_APPROVE", b, sb.permitId, 2), proofB = await storedProof(owner, forB, "ACCOUNT_RECOVERY_APPROVED");
    await expect(api.query(ACT, [owner.context, proofB.proofId, forB, command("RECOVERY_PERMIT_APPROVE", a, sa.permitId, 2, forB.operationId as string), proofB.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    // Same account, another request of it: the body names the request.
    const elsewhere = binding("RECOVERY_PERMIT_APPROVE", a, randomUUID(), 2), proofElsewhere = await storedProof(owner, elsewhere, "ACCOUNT_RECOVERY_APPROVED");
    await expect(api.query(ACT, [owner.context, proofElsewhere.proofId, elsewhere, command("RECOVERY_PERMIT_APPROVE", a, sa.permitId, 2, elsewhere.operationId as string), proofElsewhere.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    // A proof to refuse a's request, presented as an approval of it.
    const refusing = binding("RECOVERY_PERMIT_REFUSE", a, sa.permitId, 2), proofRefusing = await storedProof(owner, refusing, "ACCOUNT_RECOVERY_APPROVED");
    await expect(api.query(ACT, [owner.context, proofRefusing.proofId, refusing, command("RECOVERY_PERMIT_APPROVE", a, sa.permitId, 2, refusing.operationId as string), proofRefusing.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    // A proof made for the approved buyers' list (0186), for the same account, revision and operation.
    const buyers = canonicalPreviewBuyerBinding("PREVIEW_BUYER_ADD", a.userId, 2, randomUUID()) as unknown as Record<string, unknown>, proofBuyers = await storedProof(owner, buyers, "ACCOUNT_RECOVERY_APPROVED");
    await expect(api.query(ACT, [owner.context, proofBuyers.proofId, buyers, command("RECOVERY_PERMIT_APPROVE", a, sa.permitId, 2, buyers.operationId as string), proofBuyers.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    expect((await row(sa.permitId)).stage).toBe("REQUESTED");
    expect((await row(sb.permitId)).stage).toBe("REQUESTED");
    for (const proof of [proofB, proofElsewhere, proofRefusing, proofBuyers])
      expect((await database.pool.query("SELECT consumed_at FROM staff.action_proof WHERE proof_id=$1", [proof.proofId])).rows[0].consumed_at).toBeNull();
  });
  it("a proof made at the revision the Owner saw is stale once the request changed", async () => {
    const a = await account(), s = await asked(a), old = binding("RECOVERY_PERMIT_APPROVE", a, s.permitId, 1), proof = await storedProof(owner, old, "ACCOUNT_RECOVERY_APPROVED");
    await expect(api.query(ACT, [owner.context, proof.proofId, old, command("RECOVERY_PERMIT_APPROVE", a, s.permitId, 1, old.operationId as string), proof.alert])).rejects.toThrow("RECOVERY_PERMITS_STALE");
    expect(await permits.cancel(s.cancel, source)).toBe("CANCELLED");
    const late = binding("RECOVERY_PERMIT_APPROVE", a, s.permitId, 2), lateProof = await storedProof(owner, late, "ACCOUNT_RECOVERY_APPROVED");
    await expect(api.query(ACT, [owner.context, lateProof.proofId, late, command("RECOVERY_PERMIT_APPROVE", a, s.permitId, 2, late.operationId as string), lateProof.alert])).rejects.toThrow("RECOVERY_PERMITS_STALE");
  });
  it("an approval waits for the team tools; a refusal does not, and then leaves its own row and no audit row", async () => {
    const a = await account(), s = await asked(a);
    await expect(decide(owner, "RECOVERY_PERMIT_APPROVE", a, s.permitId, { locked: true })).rejects.toThrow("STAFF_ALERT_UNAVAILABLE");
    const refused = await decide(owner, "RECOVERY_PERMIT_REFUSE", a, s.permitId, { locked: true });
    expect(await row(s.permitId)).toMatchObject({ stage: "REFUSED", close_reason: "OWNER_REFUSED" });
    expect((await database.pool.query("SELECT kind,alerted FROM staff.recovery_permit_decision WHERE permit_id=$1", [s.permitId])).rows).toEqual([{ kind: "REFUSED", alerted: false }]);
    expect((await database.pool.query("SELECT count(*)::int AS n FROM staff.audit_event WHERE operation_id=$1", [refused.rows[0].value.operationId])).rows[0].n).toBe(0);
  });
  it("a refusal sends one short mail to the proving address alone", async () => {
    const a = await account({ backup: true }), s = await asked(a);
    await decide(owner, "RECOVERY_PERMIT_REFUSE", a, s.permitId);
    expect((await notices(s.permitId)).filter((n) => n.event_kind !== "PROOF")).toEqual([{ channel_id: a.primary, event_kind: "REFUSED", later: false }]);
  });
  it("an account under a security hold or with a risk mark is shown with it and cannot be approved", async () => {
    await clearToday();
    for (const kind of ["hold", "risk"]) {
      const a = await account(), s = await asked(a);
      if (kind === "hold") await database.pool.query("INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,0)", [a.userId]);
      else await database.pool.query("INSERT INTO identity.authentication_risk_signal(user_id,signal_kind,context_ciphertext,observed_at,expires_at) VALUES($1,'SESSION_CONTEXT_CHANGED',$2,now(),now()+interval '7776000 seconds')", [a.userId, riskContext(a.userId)]);
      const shown = (await staff.readList(owner.context as never, hash(owner.sessionId))).requests.find((r) => r.ref === s.permitId)!;
      expect({ hold: shown.securityHold, risk: shown.riskMark }).toEqual({ hold: kind === "hold", risk: kind === "risk" });
      await expect(decide(owner, "RECOVERY_PERMIT_APPROVE", a, s.permitId)).rejects.toThrow("RECOVERY_PERMIT_NOT_ALLOWED");
      expect((await row(s.permitId)).stage).toBe("REQUESTED");
      await decide(owner, "RECOVERY_PERMIT_REFUSE", a, s.permitId);
      expect((await row(s.permitId)).stage).toBe("REFUSED");
    }
  });
  it("at most three approvals in any 24 hours, over all accounts", async () => {
    await clearToday();
    const asks = [];
    for (let i = 0; i < 4; i++) { const a = await account(); asks.push({ a, s: await asked(a) }); }
    for (const { a, s } of asks.slice(0, 3)) await decide(owner, "RECOVERY_PERMIT_APPROVE", a, s.permitId);
    expect((await staff.readList(owner.context as never, hash(owner.sessionId))).approvedToday).toBe(3);
    const last = asks[3]!;
    await expect(decide(owner, "RECOVERY_PERMIT_APPROVE", last.a, last.s.permitId)).rejects.toThrow("RECOVERY_PERMITS_DAILY_CAP");
    expect((await row(last.s.permitId)).stage).toBe("REQUESTED");
    // A refusal is never held back by the limit, and a day later there is room again.
    await clearToday();
    await decide(owner, "RECOVERY_PERMIT_APPROVE", last.a, last.s.permitId);
    expect((await row(last.s.permitId)).stage).toBe("WAITING");
  });
  it("the same operation sent again answers its receipt, and another request under it is refused", async () => {
    await clearToday();
    const a = await account(), s = await asked(a), proven = binding("RECOVERY_PERMIT_APPROVE", a, s.permitId, 2), cmd = command("RECOVERY_PERMIT_APPROVE", a, s.permitId, 2, proven.operationId as string);
    const proof = await storedProof(owner, proven, "ACCOUNT_RECOVERY_APPROVED");
    const first = (await api.query(ACT, [owner.context, proof.proofId, proven, cmd, proof.alert])).rows[0].value;
    const again = (await api.query(ACT, [owner.context, proof.proofId, proven, cmd, proof.alert])).rows[0].value;
    expect(again).toEqual(first);
    expect((await database.pool.query("SELECT count(*)::int AS n FROM staff.recovery_permit_decision WHERE permit_id=$1", [s.permitId])).rows[0].n).toBe(1);
  });
  it("the Owner stops an approved permit, and every address is told it was cancelled", async () => {
    await clearToday();
    const a = await account({ backup: true }), s = await approvedAndWaited(a);
    await decide(owner, "RECOVERY_PERMIT_REFUSE", a, s.permitId);
    expect(await row(s.permitId)).toMatchObject({ stage: "REFUSED", close_reason: "OWNER_REFUSED" });
    expect((await notices(s.permitId)).filter((n) => n.event_kind === "CANCELLED").map((n) => n.channel_id)).toEqual([a.primary, a.backup!].sort());
    expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("INVALID");
  });
  it("a request the Owner never answers ends after 14 days with the same short mail as a refusal", async () => {
    const a = await account(), s = await asked(a);
    await database.pool.query("UPDATE identity.recovery_permit SET requested_at=requested_at-interval '15 days',request_expires_at=request_expires_at-interval '15 days' WHERE permit_id=$1", [s.permitId]);
    await permits.expire(1000);
    expect(await row(s.permitId)).toMatchObject({ stage: "EXPIRED", close_reason: "TIMED_OUT" });
    expect((await notices(s.permitId)).filter((n) => n.event_kind !== "PROOF")).toEqual([{ channel_id: a.primary, event_kind: "REFUSED", later: false }]);
  });
  it("the general audit page leaves the two events out, as it leaves out the approved buyers'", async () => {
    const page = (await api.query("SELECT staff.read_audit_page_v3($1::jsonb,$2,100,NULL,NULL) AS value", [owner.context, hash(owner.sessionId)])).rows[0].value;
    expect((await database.pool.query("SELECT count(*)::int AS n FROM staff.audit_event WHERE event_type LIKE 'ACCOUNT_RECOVERY_%'")).rows[0].n).toBeGreaterThan(0);
    expect((page.events as { event: string | null }[]).every((e) => e.event !== null)).toBe(true);
  });
});

describe("the 72 hours", () => {
  it("the finish link is refused before they are over, whoever calls and whatever the password", async () => {
    await clearToday();
    const a = await account(), s = await asked(a);
    await decide(owner, "RECOVERY_PERMIT_APPROVE", a, s.permitId);
    expect(await permits.prepareFinish(s.finish)).toMatchObject({ ready: false });
    expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("TOO_EARLY");
    await age(s.permitId, 71);
    expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("TOO_EARLY");
    expect((await row(s.permitId)).stage).toBe("WAITING");
    expect(await gate(a.userId)).toBeUndefined();
  });
  it("the table itself refuses a row approved with less than 72 hours, or opened before they are over", async () => {
    await clearToday();
    const a = await account(), s = await asked(a);
    await expect(database.pool.query("UPDATE identity.recovery_permit SET stage='WAITING',approved_at=clock_timestamp(),not_before=clock_timestamp()+interval '71 hours',finish_expires_at=clock_timestamp()+interval '71 hours'+interval '7 days' WHERE permit_id=$1", [s.permitId]))
      .rejects.toMatchObject({ code: "23514" });
    await decide(owner, "RECOVERY_PERMIT_APPROVE", a, s.permitId);
    await expect(database.pool.query("UPDATE identity.recovery_permit SET stage='OPENED',opened_at=clock_timestamp(),opened_count=1,gate_epoch=1 WHERE permit_id=$1", [s.permitId])).rejects.toMatchObject({ code: "23514" });
  });
  it("the finish mail is not handed to the mail worker before the 72 hours are over, and the wait's notices are", async () => {
    await clearToday();
    const a = await account({ backup: true }), s = await asked(a);
    await database.pool.query("UPDATE identity.recovery_permit_notice SET sent_at=clock_timestamp() WHERE event_kind='PROOF'");
    await decide(owner, "RECOVERY_PERMIT_APPROVE", a, s.permitId);
    const claimed: string[] = [];
    for (;;) {
      const n = await permits.claimNotice(5000);
      if (n === null) break;
      if (n.userId === a.userId) { claimed.push(n.event); expect(n.mailLocale).toBe("en"); expect(n.cancelAllowed).toBe(true); expect(typeof n.notBefore).toBe("string"); }
      await permits.finishNotice(n.noticeId, n.leaseId, true, 1000, 3);
    }
    expect(claimed).toEqual(["WAITING", "WAITING"]);
    await age(s.permitId, 73);
    const finishMail = await permits.claimNotice(5000);
    expect(finishMail).toMatchObject({ userId: a.userId, channelId: a.primary, event: "FINISH" });
  });
});

describe("the finish", () => {
  it("after the 72 hours the link and the password open /recover's own enrol-only step and sign every session out", async () => {
    await clearToday();
    const a = await account(), s = await approvedAndWaited(a), session = randomUUID();
    await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,last_seen_at,last_mfa_at,idle_expires_at,absolute_expires_at)
      VALUES($1,$2,$3,$4,'{}',now()-interval '30 days',now()-interval '30 days',now()-interval '30 days',now()+interval '1 hour',now()+interval '2 hours')`, [session, a.userId, hash(), hash()]);
    expect(await permits.prepareFinish(s.finish)).toMatchObject({ userId: a.userId, passwordHash: PASSWORD, ready: true });
    const cap = hash(), opened = await permits.finish(s.finish, PASSWORD, cap, source);
    expect(opened.status).toBe("OPENED");
    expect(await row(s.permitId)).toMatchObject({ stage: "OPENED", opened_count: 1 });
    expect(await gate(a.userId)).toMatchObject({ active: true, cap_hash: cap });
    expect((await database.pool.query("SELECT revoked_at IS NOT NULL AS out FROM identity.session WHERE session_id=$1", [session])).rows[0].out).toBe(true);
    // /recover's own reader takes the capability: it is the existing enrol-only step, for this account.
    const prepared = (await recover.query("SELECT identity.prepare_recovery_enrollment($1) AS value", [cap])).rows[0].value;
    expect(prepared).toMatchObject({ userId: a.userId, method: "passkey" });
    // The old passkey is still the account's until the new method is set up; /recover's completion revokes it.
    expect((await database.pool.query("SELECT revoked_at FROM identity.consumer_passkey_credential WHERE consumer_credential_id=$1", [a.passkey])).rows[0].revoked_at).toBeNull();
  });
  it("the link alone, or the link with a wrong password, opens nothing; five wrong passwords end the permit", async () => {
    await clearToday();
    const a = await account(), s = await approvedAndWaited(a);
    expect((await permits.finish(s.finish, "another-password-hash", hash(), source)).status).toBe("INVALID");
    expect(await gate(a.userId)).toBeUndefined();
    for (let i = 0; i < 4; i++) expect(await permits.recordFailure(s.finish, "finish", source, null)).toBe("PROOF_INVALID");
    expect(await permits.recordFailure(s.finish, "finish", source, null)).toBe("REFUSED");
    expect(await row(s.permitId)).toMatchObject({ stage: "REFUSED", close_reason: "PROOF_FAILED" });
    expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("INVALID");
  });
  it("the link opens the step again while no new sign-in method is set up, three times in all", async () => {
    await clearToday();
    const a = await account(), s = await approvedAndWaited(a);
    for (let i = 1; i <= 3; i++) {
      const cap = hash();
      expect((await permits.finish(s.finish, PASSWORD, cap, source)).status).toBe("OPENED");
      expect(await row(s.permitId)).toMatchObject({ stage: "OPENED", opened_count: i });
      expect(await gate(a.userId)).toMatchObject({ active: true, cap_hash: cap, epoch: i });
    }
    expect(await permits.prepareFinish(s.finish)).toMatchObject({ ready: false });
    expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("INVALID");
  });
  it("once a new sign-in method is set up the link is dead: a replay opens nothing", async () => {
    await clearToday();
    const a = await account(), s = await approvedAndWaited(a);
    expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("OPENED");
    await enrolled(a.userId);
    expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("INVALID");
    expect(await row(s.permitId)).toMatchObject({ stage: "USED", close_reason: "FINISHED" });
    expect(await permits.prepareFinish(s.finish)).toBeNull();
    expect((await gate(a.userId)).active).toBe(false);
    // The mailbox link and the cancel link of the same ask are dead too.
    expect((await request(s)).status).toBe("INVALID");
    expect(await permits.cancel(s.cancel, source)).toBe("INVALID");
  });
  it("the link stops working 7 days after it became usable", async () => {
    await clearToday();
    const a = await account(), s = await asked(a);
    await decide(owner, "RECOVERY_PERMIT_APPROVE", a, s.permitId);
    await age(s.permitId, 72 + 7 * 24 + 1);
    expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("INVALID");
    expect(await row(s.permitId)).toMatchObject({ stage: "EXPIRED", close_reason: "TIMED_OUT" });
  });
  it("a hold or a risk mark that came during the wait ends the permit", async () => {
    await clearToday();
    for (const kind of ["hold", "risk"]) {
      const a = await account(), s = await approvedAndWaited(a);
      if (kind === "hold") await database.pool.query("INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,0)", [a.userId]);
      else await database.pool.query("INSERT INTO identity.authentication_risk_signal(user_id,signal_kind,context_ciphertext,observed_at,expires_at) VALUES($1,'SESSION_CONTEXT_CHANGED',$2,now(),now()+interval '7776000 seconds')", [a.userId, riskContext(a.userId)]);
      expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("INVALID");
      expect(await row(s.permitId)).toMatchObject({ stage: "CANCELLED", close_reason: "NOT_ALLOWED" });
      await clearToday();
    }
  });
});

describe("what ends a permit during the wait", () => {
  it("the cancel link, at every stage, and every address is told", async () => {
    await clearToday();
    const a = await account({ backup: true }), s = await approvedAndWaited(a);
    expect(await permits.cancel(s.cancel, source)).toBe("CANCELLED");
    expect(await permits.cancel(s.cancel, source)).toBe("CANCELLED");
    expect(await row(s.permitId)).toMatchObject({ stage: "CANCELLED", close_reason: "CANCEL_LINK" });
    expect((await notices(s.permitId)).filter((n) => n.event_kind === "CANCELLED").map((n) => n.channel_id)).toEqual([a.primary, a.backup!].sort());
    expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("INVALID");
    // A waiting notice and a finish link not sent yet are never sent after the cancel.
    for (;;) { const n = await permits.claimNotice(5000); if (n === null) break; if (n.userId === a.userId) expect(n.event).toBe("CANCELLED"); await permits.finishNotice(n.noticeId, n.leaseId, true, 1000, 3); }
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.recovery_permit_notice WHERE permit_id=$1 AND event_kind IN('WAITING','FINISH') AND sent_at IS NOT NULL", [s.permitId])).rows[0].n).toBe(0);
  });
  it("a cancel after the finish link was used shuts the enrol-only step at once", async () => {
    await clearToday();
    const a = await account(), s = await approvedAndWaited(a), cap = hash();
    expect((await permits.finish(s.finish, PASSWORD, cap, source)).status).toBe("OPENED");
    expect(await permits.cancel(s.cancel, source)).toBe("CANCELLED");
    expect(await gate(a.userId)).toMatchObject({ active: false, cap_hash: null });
    await expect(recover.query("SELECT identity.prepare_recovery_enrollment($1) AS value", [cap])).rejects.toThrow("CONSUMER_RECOVERY_INVALID");
    expect(await row(s.permitId)).toMatchObject({ stage: "CANCELLED", close_reason: "CANCEL_LINK" });
    expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("INVALID");
  });
  it("a sign-in: a person who can sign in needs no permit", async () => {
    await clearToday();
    for (const stage of ["before the Owner", "approved"]) {
      const a = await account(), s = stage === "approved" ? await approvedAndWaited(a) : await asked(a);
      await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,last_mfa_at,idle_expires_at,absolute_expires_at)
        VALUES($1,$2,$3,$4,'{}',now(),now()+interval '1 hour',now()+interval '2 hours')`, [randomUUID(), a.userId, hash(), hash()]);
      if (stage === "approved") expect((await permits.finish(s.finish, PASSWORD, hash(), source)).status).toBe("INVALID");
      else await expect(decide(owner, "RECOVERY_PERMIT_APPROVE", a, s.permitId)).rejects.toThrow("RECOVERY_PERMITS_STALE");
      await permits.expire(1000);
      expect(await row(s.permitId)).toMatchObject({ stage: "CANCELLED", close_reason: "SIGNED_IN" });
      await clearToday();
    }
  });
  it.each(["password", "sign-in address", "backup address added", "passkey added", "passkey removed", "saved-code recovery"])("a change of the %s", async (kind) => {
    await clearToday();
    const a = await account(), s = await approvedAndWaited(a), q = database.pool;
    if (kind === "password") await q.query(`UPDATE identity."user" SET password_hash='a-new-password-hash' WHERE user_id=$1`, [a.userId]);
    if (kind === "sign-in address") { const next = envelope(); await q.query(`UPDATE identity."user" SET email_ciphertext=$2 WHERE user_id=$1`, [a.userId, next]); await q.query("UPDATE identity.channel_binding SET address_ciphertext=$2 WHERE channel_binding_id=$1", [a.primary, next]); }
    if (kind === "backup address added") await q.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'recovery_email',$2,'verified',now(),now())`, [a.userId, envelope()]);
    if (kind === "passkey added") await addPasskey(a.userId);
    if (kind === "passkey removed") await withLocale((c) => c.query("UPDATE identity.consumer_passkey_credential SET revoked_at=clock_timestamp() WHERE consumer_credential_id=$1", [a.passkey]));
    if (kind === "saved-code recovery") await q.query("INSERT INTO identity.consumer_recovery_gate(user_id,epoch,active) VALUES($1,1,false)", [a.userId]);
    const finishPassword = kind === "password" ? "a-new-password-hash" : PASSWORD;
    expect((await permits.finish(s.finish, finishPassword, hash(), source)).status).toBe("INVALID");
    expect(await row(s.permitId)).toMatchObject({ stage: "CANCELLED", close_reason: "ACCOUNT_CHANGED" });
  });
  it("the account's erasure takes every row of its asks with it", async () => {
    await clearToday();
    const a = await account({ backup: true }), s = await approvedAndWaited(a);
    await database.pool.query(`DELETE FROM identity."user" WHERE user_id=$1`, [a.userId]);
    for (const table of ["identity.recovery_permit", "identity.recovery_permit_notice", "staff.recovery_permit_decision"])
      expect((await database.pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id=$1`, [a.userId])).rows[0].n).toBe(0);
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.recovery_permit_notice_binding WHERE permit_id=$1", [s.permitId])).rows[0].n).toBe(0);
  });
});
