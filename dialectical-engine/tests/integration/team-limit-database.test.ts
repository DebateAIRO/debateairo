import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresTeamLimitRepository, readTeamRoom, type Pool } from "@debateai/db";
import { canonicalTeamLimitActionBinding } from "../../apps/api/src/staff/team-limit.js";
import { withMailLocale } from "../../packages/db/src/mail-locale.js";
import { authorizeStaffAlertFixture } from "../support/staffAlertReadiness.js";
import { internalFundingFixture } from "../support/internalFundingFixture.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Decision 24's security list, on real Postgres, through the runtime role's own grants. All amounts are made up. A proof here is stored the
 * way the ceremony stores one (the ceremony itself: the begin test below and staff-webauthn-database.test.ts).
 */
let database: TestDatabase, runtime: Pool, fixture: ReturnType<typeof internalFundingFixture>, repository: PostgresTeamLimitRepository;
/** The mail loop's login: the API drains the notices only from its gated timer, outside any request, so on its system login (the marker's, 0171). */
let system: Pool, notices: PostgresTeamLimitRepository;
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const FUNDING = { code: "FUNDING_APPROVAL" } as const;
type Actor = Readonly<{ userId: string; sessionId: string; staffId: string; privilegeId: string; context: Record<string, unknown> }>;
let owner: Actor;

async function contextOf(a: Omit<Actor, "context">): Promise<Record<string, unknown>> {
  return (await runtime.query("SELECT staff.read_context($1,$2,$3) AS context", [a.userId, a.sessionId, hash(a.privilegeId)])).rows[0].context;
}
/** A delegated staff member with every capability a delegate can hold, and a live elevated session. */
async function delegate(): Promise<Actor> {
  const userId = randomUUID(), sessionId = randomUUID(), staffId = randomUUID(), privilegeId = randomUUID();
  const q = database.pool;
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
  const base = { userId, sessionId, staffId, privilegeId };
  return { ...base, context: await contextOf(base) };
}
/** After a pick the partner's sessions are revoked, as any grant change does: this is their new elevation. */
async function elevated(a: Actor): Promise<Actor> {
  const privilegeId = randomUUID(), s = (await database.pool.query("SELECT security_epoch,grant_revision FROM staff.subject WHERE staff_id=$1", [a.staffId])).rows[0];
  await database.pool.query(`INSERT INTO staff.privilege_session(privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,now()+interval '15 minutes',now()+interval '2 hours')`, [privilegeId, a.staffId, a.userId, a.sessionId, hash(privilegeId), hash("staff-csrf" + privilegeId), s.security_epoch, s.grant_revision]);
  const base = { userId: a.userId, sessionId: a.sessionId, staffId: a.staffId, privilegeId };
  return { ...base, context: await contextOf(base) };
}
async function storedProof(a: Actor, binding: Record<string, unknown>, event: string, ttl = "5 minutes"): Promise<Readonly<{ proofId: string; alert: Record<string, unknown> }>> {
  const proofId = randomUUID(), c = a.context as { securityEpoch: number; grantRevision: number; accountSecurityEpoch: number };
  const times = ttl === "expired" ? "now()-interval '2 minutes',now()-interval '1 minute'" : "now(),now()+interval '5 minutes'";
  await database.pool.query(`INSERT INTO staff.action_proof(proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,account_security_epoch,grant_revision,binding,credential_id,verified_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'fixture-key',${times})`, [proofId, a.staffId, a.userId, a.sessionId, a.privilegeId, c.securityEpoch, c.accountSecurityEpoch, c.grantRevision, binding]);
  await authorizeStaffAlertFixture(database.pool, binding.operationId as string);
  return { proofId, alert: { schema: "staff-alert-v1", event, operationId: binding.operationId, envelope: { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" } } };
}
const state = async () => (await database.pool.query("SELECT coalesce(max(revision),0)::int AS revision, coalesce((SELECT amount_micros FROM staff.team_limit_event ORDER BY revision DESC LIMIT 1),0)::bigint AS amount FROM staff.team_limit_event")).rows[0] as { revision: number; amount: string };
function limitBinding(a: Actor, amount: number, current: number, revision: number, operationId: string = randomUUID()) {
  return canonicalTeamLimitActionBinding({ action: "TEAM_LIMIT_SET", amount_micros: amount, current_micros: current, expected_revision: revision, operation_id: operationId },
    a.staffId, { currentMicros: current, expectedRevision: revision }) as unknown as Record<string, unknown>;
}
const setSql = "SELECT staff.set_team_limit($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value";
const command = (a: Actor, amount: number, current: number, revision: number, operationId: string) => ({ targetId: a.staffId, amountMicros: amount, currentMicros: current, expectedRevision: revision, operationId, reason: FUNDING });
async function setLimit(a: Actor, amount: number) {
  const now = await state(), current = Number(now.amount), binding = limitBinding(a, amount, current, now.revision), proof = await storedProof(a, binding, "TEAM_LIMIT_CHANGED");
  return runtime.query(setSql, [a.context, proof.proofId, binding, command(a, amount, current, now.revision, binding.operationId as string), proof.alert]);
}
async function revision(a: Actor) { return (await database.pool.query("SELECT grant_revision::int r FROM staff.subject WHERE staff_id=$1", [a.staffId])).rows[0].r as number; }
function partnerBinding(action: "TEAM_LIMIT_PARTNER_GRANT" | "TEAM_LIMIT_PARTNER_REVOKE", target: string, expected: number) {
  return canonicalTeamLimitActionBinding({ action, target_staff_id: target, expected_revision: expected, operation_id: randomUUID(), reason: { code: "GRANT_CHANGE" } }, "unused", null) as unknown as Record<string, unknown>;
}
async function pick(actor: Actor, target: Actor) {
  const binding = partnerBinding("TEAM_LIMIT_PARTNER_GRANT", target.staffId, await revision(target)), proof = await storedProof(actor, binding, "TEAM_LIMIT_PARTNER_GRANTED");
  return runtime.query("SELECT staff.grant_team_limit_partner($1::jsonb,$2::uuid,$3::jsonb,$4::uuid,$5::uuid,$6::jsonb,$7::jsonb) AS value", [actor.context, proof.proofId, binding, target.staffId, binding.operationId, { code: "GRANT_CHANGE" }, proof.alert]);
}
async function takeBack(actor: Actor, target: Actor) {
  const binding = partnerBinding("TEAM_LIMIT_PARTNER_REVOKE", target.staffId, await revision(target)), proof = await storedProof(actor, binding, "TEAM_LIMIT_PARTNER_REVOKED");
  return runtime.query("SELECT staff.revoke_team_limit_partner($1::jsonb,$2::uuid,$3::jsonb,$4::uuid,$5::uuid,$6::jsonb,$7::jsonb) AS value", [actor.context, proof.proofId, binding, target.staffId, binding.operationId, { code: "GRANT_CHANGE" }, proof.alert]);
}
async function clearPartner() { const h = (await database.pool.query("SELECT staff_id FROM staff.team_limit_holder WHERE active")).rows[0]; if (h !== undefined) await database.pool.query("SELECT staff.end_team_limit_holder($1,'OWNER_REVOKED')", [h.staff_id]); }
const roomFor = (estimate: number) => readTeamRoom(runtime, estimate);
/** The capability check, as the staff routes ask it through the staff repository on the system login (X14): the marker's since 0171. */
const authorized = async (a: Actor) => (await system.query("SELECT staff.authorize_action($1::jsonb,'TEAM_LIMIT_SET') AS ok", [a.context])).rows[0].ok as boolean;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE team_limit_runtime LOGIN PASSWORD 'team-limit-private-fixture-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  const url = new URL(database.connectionString);
  url.username = "team_limit_runtime"; url.password = "team-limit-private-fixture-only";
  runtime = createPool(url.toString());
  fixture = internalFundingFixture(database.pool, runtime);
  repository = new PostgresTeamLimitRepository(runtime);
  system = createPool(await createSystemTwin(database, "team_limit_system", ["debateai_runtime", "debateai_billing_runtime"]));
  notices = new PostgresTeamLimitRepository(system);
  owner = await fixture.fundedActor() as unknown as Actor;
}, 120000);
afterAll(async () => { await Promise.all([runtime?.end(), system?.end()]); await database?.stop(); });

describe("no limit set", () => {
  it("means no team room at all, and the page says none", async () => {
    expect(await roomFor(1)).toBe("NOT_SET");
    expect(await roomFor(0)).toBe("NOT_SET");
    const page = await repository.readPage(owner.context as never, hash(owner.sessionId)) as { amount_micros: unknown; revision: number; partner: unknown; log: unknown[] };
    expect(page).toMatchObject({ amount_micros: null, revision: 0, partner: null, log: [], is_owner: true });
  });
});

describe("who can act", () => {
  it("the Owner's authority depends on no grant and is in no capability list", async () => {
    await clearPartner();
    expect(owner.context.capabilities).not.toContain("TEAM_LIMIT_SET");
    expect(await authorized(owner)).toBe(true);
    await setLimit(owner, 500);
    expect(await state()).toMatchObject({ revision: 1, amount: "500" });
  });
  it("a delegate cannot set the limit, read it, read the command, grant it or take it back, by database function", async () => {
    const d = await delegate(), other = await delegate();
    expect(await authorized(d)).toBe(false);
    const now = await state(), binding = limitBinding(d, 900, Number(now.amount), now.revision), proof = await storedProof(d, binding, "TEAM_LIMIT_CHANGED");
    await expect(runtime.query(setSql, [d.context, proof.proofId, binding, command(d, 900, Number(now.amount), now.revision, binding.operationId as string), proof.alert])).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    await expect(repository.readPage(d.context as never, hash(d.sessionId))).rejects.toThrow();
    await expect(repository.readCommand(d.context as never, hash(d.sessionId))).rejects.toThrow();
    await expect(pick(d, other)).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    expect(await state()).toMatchObject({ amount: now.amount });
    expect((await database.pool.query("SELECT count(*)::int n FROM staff.team_limit_holder WHERE staff_id=$1", [other.staffId])).rows[0].n).toBe(0);
  });
  it("TEAM_GRANT cannot carry it: the capability is not one an invite or grant may name, nor one a subject can store", async () => {
    expect((await database.pool.query("SELECT staff.valid_capabilities(ARRAY['TEAM_LIMIT_SET']) AS ok")).rows[0].ok).toBe(false);
    const d = await delegate();
    await expect(database.pool.query("UPDATE staff.subject SET capabilities=array_append(capabilities,'TEAM_LIMIT_SET') WHERE staff_id=$1", [d.staffId])).rejects.toMatchObject({ code: "23514" });
  });
  it("the partner can set and read but not pick; only the Owner picks, and a delegate's capabilities never name it", async () => {
    await clearPartner();
    const d = await delegate(), other = await delegate();
    await pick(owner, d);
    const partner = await elevated(d);
    expect(await authorized(partner)).toBe(true);
    const now = await state();
    await setLimit(partner, Number(now.amount) + 100);
    expect(await state()).toMatchObject({ revision: now.revision + 1 });
    expect((await repository.readPage(partner.context as never, hash(partner.sessionId)) as { is_owner: boolean }).is_owner).toBe(false);
    await expect(pick(partner, other)).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    await takeBack(owner, d);
    const after = await elevated(d);
    expect(await authorized(after)).toBe(false);
    await expect(setLimit(after, 1)).rejects.toThrow("STAFF_AUTHORITY_INVALID");
  });
  it("a third holder is refused by the database: by the function, and by the index with no function at all", async () => {
    await clearPartner();
    const a = await delegate(), b = await delegate();
    await pick(owner, a);
    await expect(pick(owner, b)).rejects.toThrow("TEAM_LIMIT_PARTNER_EXISTS");
    await expect(database.pool.query("INSERT INTO staff.team_limit_holder(staff_id,granted_by_staff_id,granted_operation_id) VALUES($1,$2,$3)", [b.staffId, owner.staffId, randomUUID()])).rejects.toMatchObject({ code: "23505" });
    await takeBack(owner, a);
    await pick(owner, b);
    expect((await database.pool.query("SELECT staff_id FROM staff.team_limit_holder WHERE active")).rows).toEqual([{ staff_id: b.staffId }]);
  });
  it("the Owner is not their own partner, and a disabled member cannot be picked", async () => {
    await clearPartner();
    await expect(pick(owner, owner)).rejects.toThrow("STAFF_TARGET_INVALID");
    const d = await delegate();
    await database.pool.query("UPDATE staff.subject SET state='DISABLED' WHERE staff_id=$1", [d.staffId]);
    await expect(pick(owner, d)).rejects.toThrow("STAFF_TARGET_INVALID");
  });
});

describe("the proof", () => {
  it("is bound to the exact amount: a proof for another amount is refused", async () => {
    const now = await state(), current = Number(now.amount), proven = limitBinding(owner, 700, current, now.revision), proof = await storedProof(owner, proven, "TEAM_LIMIT_CHANGED");
    await expect(runtime.query(setSql, [owner.context, proof.proofId, proven, command(owner, 701, current, now.revision, proven.operationId as string), proof.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    const other = limitBinding(owner, 701, current, now.revision, proven.operationId as string);
    await expect(runtime.query(setSql, [owner.context, proof.proofId, other, command(owner, 701, current, now.revision, proven.operationId as string), proof.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    expect(await state()).toMatchObject({ revision: now.revision });
  });
  it("is bound to the current value: a proof made before another change is stale", async () => {
    const before = await state(), current = Number(before.amount), stale = limitBinding(owner, 800, current, before.revision), proof = await storedProof(owner, stale, "TEAM_LIMIT_CHANGED");
    await setLimit(owner, current + 1);
    await expect(runtime.query(setSql, [owner.context, proof.proofId, stale, command(owner, 800, current, before.revision, stale.operationId as string), proof.alert])).rejects.toThrow("STAFF_REVISION_INVALID");
    expect((await database.pool.query("SELECT consumed_at FROM staff.action_proof WHERE proof_id=$1", [proof.proofId])).rows[0].consumed_at).toBeNull();
  });
  it("cannot be replayed: the same operation returns its first receipt and adds no row; the proof under another operation is refused", async () => {
    const now = await state(), current = Number(now.amount), binding = limitBinding(owner, 650, current, now.revision), proof = await storedProof(owner, binding, "TEAM_LIMIT_CHANGED");
    const cmd = command(owner, 650, current, now.revision, binding.operationId as string);
    const first = (await runtime.query(setSql, [owner.context, proof.proofId, binding, cmd, proof.alert])).rows[0].value;
    const again = (await runtime.query(setSql, [owner.context, proof.proofId, binding, cmd, proof.alert])).rows[0].value;
    expect(again).toEqual(first);
    expect(await state()).toMatchObject({ revision: now.revision + 1 });
    const after = await state(), op = randomUUID(), replay = limitBinding(owner, 650, Number(after.amount), after.revision, op);
    await authorizeStaffAlertFixture(database.pool, op);
    await expect(runtime.query(setSql, [owner.context, proof.proofId, replay, command(owner, 650, Number(after.amount), after.revision, op), { ...proof.alert, operationId: op }])).rejects.toThrow("STAFF_PROOF_INVALID");
  });
  it("an expired proof is refused", async () => {
    const now = await state(), current = Number(now.amount), binding = limitBinding(owner, 660, current, now.revision), proof = await storedProof(owner, binding, "TEAM_LIMIT_CHANGED", "expired");
    await expect(runtime.query(setSql, [owner.context, proof.proofId, binding, command(owner, 660, current, now.revision, binding.operationId as string), proof.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
  });
  it("a drop is allowed the same way", async () => {
    const now = await state();
    await setLimit(owner, Number(now.amount) - 1);
    expect(Number((await state()).amount)).toBe(Number(now.amount) - 1);
  });
  it("with team tools locked (no fresh alert readiness) the database refuses the change", async () => {
    const now = await state(), current = Number(now.amount), binding = limitBinding(owner, 610, current, now.revision), proof = await storedProof(owner, binding, "TEAM_LIMIT_CHANGED");
    await database.pool.query("DELETE FROM staff.alert_operation_readiness WHERE operation_id=$1", [binding.operationId]);
    await expect(runtime.query(setSql, [owner.context, proof.proofId, binding, command(owner, 610, current, now.revision, binding.operationId as string), proof.alert])).rejects.toThrow("STAFF_ALERT_UNAVAILABLE");
    expect(await state()).toMatchObject({ revision: now.revision });
  });
  it("the ceremony itself admits exactly these actions: Owner yes, delegate no, and allowances at last", async () => {
    const challenge = async (a: Actor, binding: Record<string, unknown>) => system.query(
      "SELECT staff.begin_owned_webauthn($1,$2,'ACTION',$3,$4,'localhost','https://localhost',NULL,NULL,$5::jsonb,$6::jsonb,'{}'::jsonb)",
      [a.userId, a.sessionId, hash(randomUUID()), hash(randomUUID()), a.context, binding]);
    const key = async (a: Actor) => {
      const id = randomUUID();
      await withMailLocale(database.pool, "en", (c) => c.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter)
        VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),'localhost','https://localhost',true,false,false,$5,0)`, [id, a.userId, `key_${id.replaceAll("-", "")}`, { format: "COSE_KEY_BASE64URL_V1", value: "AA" }, { v: 1, keyId: `passkey-label:${id}:v1`, nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" }]));
      await database.pool.query("INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256,transports) VALUES($1,$2,$3,ARRAY['usb'])", [id, a.userId, hash(id)]);
    };
    await key(owner);
    const now = await state();
    await expect(challenge(owner, limitBinding(owner, 123, Number(now.amount), now.revision))).resolves.toBeDefined();
    await expect(challenge(owner, { action: "ALLOWANCE_CONFIGURE", targetId: randomUUID(), bodySha256: "a".repeat(64), expectedRevision: 0, operationId: randomUUID() })).resolves.toBeDefined();
    await expect(challenge(owner, { action: "TEAM_LIMIT_PARTNER_GRANT", targetId: randomUUID(), bodySha256: "a".repeat(64), expectedRevision: 0, operationId: randomUUID() })).resolves.toBeDefined();
    const d = await delegate();
    await key(d);
    await expect(challenge(d, limitBinding(d, 123, Number(now.amount), now.revision))).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    await expect(challenge(d, { action: "TEAM_LIMIT_PARTNER_GRANT", targetId: randomUUID(), bodySha256: "a".repeat(64), expectedRevision: 0, operationId: randomUUID() })).rejects.toThrow("STAFF_AUTHORITY_INVALID");
  });
});

describe("the records", () => {
  it("the runtime role can read and write none of the tables", async () => {
    for (const table of ["staff.team_limit_event", "staff.team_limit_holder", "staff.team_practice_spend", "staff.team_limit_notice"]) {
      await expect(runtime.query(`SELECT * FROM ${table}`), table).rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query(`DELETE FROM ${table}`), table).rejects.toMatchObject({ code: "42501" });
    }
  });
  it("a limit row, a practice row and a holder row cannot be edited or deleted, not even by the table's owner role path", async () => {
    await setLimit(owner, 555);
    for (const sql of ["UPDATE staff.team_limit_event SET amount_micros=1", "DELETE FROM staff.team_limit_event", "TRUNCATE staff.team_limit_event",
      "UPDATE staff.team_practice_spend SET charge_micros=1", "DELETE FROM staff.team_practice_spend", "TRUNCATE staff.team_practice_spend", "TRUNCATE staff.team_limit_holder"]) {
      await expect(database.pool.query(sql), sql).rejects.toThrow("STAFF_RECORD_IMMUTABLE");
    }
    await clearPartner();
    const d = await delegate();
    await pick(owner, d);
    await expect(database.pool.query("DELETE FROM staff.team_limit_holder WHERE staff_id=$1", [d.staffId])).rejects.toThrow("STAFF_RECORD_IMMUTABLE");
    await expect(database.pool.query("UPDATE staff.team_limit_holder SET staff_id=$1 WHERE active", [owner.staffId])).rejects.toThrow("STAFF_RECORD_IMMUTABLE");
    await clearPartner();
    await expect(database.pool.query("UPDATE staff.team_limit_holder SET active=true,revoked_at=NULL,revoked_cause=NULL,revoked_operation_id=NULL WHERE staff_id=$1", [d.staffId])).rejects.toThrow("STAFF_RECORD_IMMUTABLE");
  });
  it("stays out of what other staff read: the audit page, and the team page's capabilities", async () => {
    const d = await delegate();
    const audit = await runtime.query("SELECT staff.read_audit_page($1::jsonb,$2,100,NULL,NULL) AS value", [d.context, hash(d.sessionId)]);
    expect(JSON.stringify(audit.rows[0].value)).not.toContain("TEAM_LIMIT");
    expect((audit.rows[0].value as { events: Array<{ event: unknown }> }).events.every((e) => e.event !== null)).toBe(true);
    await clearPartner();
    await pick(owner, d);
    const partner = await elevated(d);
    const team = await runtime.query("SELECT staff.read_team_page($1::jsonb,$2,100,NULL,NULL) AS value", [partner.context, hash(partner.sessionId)]);
    expect(JSON.stringify(team.rows[0].value)).not.toContain("TEAM_LIMIT");
    await clearPartner();
  });
});

describe("when the people change", () => {
  async function partner(): Promise<Actor> { await clearPartner(); const d = await delegate(); await pick(owner, d); return elevated(d); }
  it("offboarding removes it", async () => {
    const p = await partner(), r = await revision(p), op = randomUUID(), binding = { action: "TEAM_DISABLE", targetId: p.staffId, bodySha256: "b".repeat(64), expectedRevision: r, operationId: op };
    const stored = await storedProof(owner, binding, "DISABLE");
    await runtime.query("SELECT staff.disable($1::jsonb,$2,$3::jsonb,$4,'OFFBOARD',$5,$6::jsonb,$7::jsonb)", [owner.context, stored.proofId, binding, p.staffId, op, { code: "OFFBOARDING" }, stored.alert]);
    expect(await authorized(p)).toBe(false);
    expect((await database.pool.query("SELECT active,revoked_cause FROM staff.team_limit_holder WHERE staff_id=$1", [p.staffId])).rows[0]).toEqual({ active: false, revoked_cause: "STAFF_DISABLED" });
  });
  it("emergency disable, by any delegate who may, removes it", async () => {
    const p = await partner(), r = await revision(p), responder = await delegate(), op = randomUUID(), binding = { action: "EMERGENCY_DISABLE", targetId: p.staffId, bodySha256: "b".repeat(64), expectedRevision: r, operationId: op };
    const stored = await storedProof(responder, binding, "DISABLE");
    await runtime.query("SELECT staff.disable($1::jsonb,$2,$3::jsonb,$4,'COMPROMISE',$5,$6::jsonb,$7::jsonb)", [responder.context, stored.proofId, binding, p.staffId, op, { code: "SECURITY_RESPONSE" }, stored.alert]);
    expect(await database.pool.query("SELECT active FROM staff.team_limit_holder WHERE staff_id=$1", [p.staffId]).then((x) => x.rows[0].active)).toBe(false);
    expect((await database.pool.query("SELECT count(*)::int n FROM staff.team_limit_holder WHERE active")).rows[0].n).toBe(0);
  });
  it("an erased account ends it", async () => {
    const p = await partner();
    await database.pool.query("UPDATE staff.subject SET state='ERASED',user_id=NULL WHERE staff_id=$1", [p.staffId]);
    expect((await database.pool.query("SELECT revoked_cause FROM staff.team_limit_holder WHERE staff_id=$1", [p.staffId])).rows[0].revoked_cause).toBe("ACCOUNT_ERASED");
  });
  it("a new Owner starts with no partner: the old pick ends, and the Owner's authority follows the designation", async () => {
    const p = await partner();
    const next = await delegate();
    await database.pool.query("UPDATE staff.owner_designation SET active=false WHERE active");
    expect(await authorized(owner)).toBe(false);
    await database.pool.query("INSERT INTO staff.owner_designation(staff_id) VALUES($1)", [next.staffId]);
    const row = (await database.pool.query("SELECT active,revoked_cause,revoked_operation_id FROM staff.team_limit_holder WHERE staff_id=$1", [p.staffId])).rows[0];
    expect(row).toMatchObject({ active: false, revoked_cause: "OWNER_CHANGED" });
    expect(await authorized(p)).toBe(false);
    const fresh = await contextOf(next);
    expect((await system.query("SELECT staff.authorize_action($1::jsonb,'TEAM_LIMIT_SET') AS ok", [fresh])).rows[0].ok).toBe(true);
    const told = (await database.pool.query("SELECT recipient_staff_id FROM staff.team_limit_notice WHERE operation_id=$1", [row.revoked_operation_id])).rows.map((x) => x.recipient_staff_id).sort();
    expect(told).toEqual([p.staffId, next.staffId].sort());
    // Back to the fixture's Owner for the rest of the file.
    await database.pool.query("UPDATE staff.owner_designation SET active=false WHERE active");
    await database.pool.query("INSERT INTO staff.owner_designation(staff_id) VALUES($1)", [owner.staffId]);
  });
});

describe("the notices", () => {
  it("the mail loop is the system login's alone: the runtime role a request login holds is refused each of its three (0171)", async () => {
    for (const [sql, values] of [["SELECT * FROM staff.claim_team_limit_notices(1)", []],
      ["SELECT staff.complete_team_limit_notice($1,$2,true)", [randomUUID(), randomUUID()]],
      ["SELECT staff.team_limit_notice_user($1,$2)", [randomUUID(), randomUUID()]]] as const) {
      await expect(runtime.query(sql, [...values]), sql).rejects.toMatchObject({ code: "42501" });
    }
  });
  it("every limit change and partner change tells both, and no notice row or claim holds an amount", async () => {
    await clearPartner();
    await database.pool.query("UPDATE staff.team_limit_notice SET delivered_at=now(),claim_token=NULL,claim_expires_at=NULL WHERE delivered_at IS NULL AND failed_at IS NULL");
    const d = await delegate();
    await pick(owner, d);
    const claims = await notices.claimNotices(100);
    expect(claims.map((c) => c.recipient_staff_id).sort()).toEqual([owner.staffId, d.staffId].sort());
    expect(claims.every((c) => c.kind === "PARTNER_CHANGED")).toBe(true);
    expect(Object.keys(claims[0]!).sort()).toEqual(["claim_token", "kind", "notice_id", "recipient_staff_id"]);
    for (const c of claims) await notices.completeNotice(c.notice_id, c.claim_token, true);
    await setLimit(owner, 444);
    const next = await notices.claimNotices(100);
    expect(next.map((c) => c.recipient_staff_id).sort()).toEqual([owner.staffId, d.staffId].sort());
    expect(next.every((c) => c.kind === "LIMIT_CHANGED")).toBe(true);
    for (const c of next) await notices.completeNotice(c.notice_id, c.claim_token, true);
  });
  it("a failed email does not undo the change, and the page shows it failed", async () => {
    await setLimit(owner, 333);
    for (let attempt = 0; attempt < 20; attempt++) {
      const claims = await notices.claimNotices(100);
      for (const c of claims) await notices.completeNotice(c.notice_id, c.claim_token, false);
    }
    expect(await notices.claimNotices(100)).toEqual([]);
    expect(await state()).toMatchObject({ amount: "333" });
    const page = await repository.readPage(owner.context as never, hash(owner.sessionId)) as { amount_micros: number; log: Array<{ kind: string; amount_micros?: number; notice: string }> };
    expect(page.amount_micros).toBe(333);
    expect(page.log.find((e) => e.kind === "LIMIT" && e.amount_micros === 333)?.notice).toBe("FAILED");
  });
});

describe("the team's month", () => {
  const scope = async () => {
    const actor = await fixture.fundedActor() as unknown as Actor & { ownerRef: string };
    owner = actor; // the fixture makes each funded actor the Owner
    const run = await fixture.run(actor.ownerRef);
    const grant = fixture.configureCommand(actor as never);
    await fixture.configure(actor as never, grant);
    const event = (await database.pool.query("SELECT configured_event_id FROM billing.internal_grant WHERE grant_id=$1", [grant.operationId])).rows[0].configured_event_id;
    await database.pool.query("SELECT billing.record_internal_charge_scope($1,$2,$3,$4,now())", [run, actor.ownerRef, grant.operationId, event]);
    return { actor, run };
  };
  it("counts funded spend across every grant against the current amount, and a new month starts clean", async () => {
    const { run } = await scope();
    // 0171 took 0140's team spend sum back from every role: staff's month reader asks it as its owner, so the test reads it as the superuser.
    const spent = Number((await database.pool.query("SELECT staff.read_team_internal_spent(date_trunc('month',now()),date_trunc('month',now())+interval '1 month') v")).rows[0].v);
    await setLimit(owner, spent + 1000);
    await expect(roomFor(1000)).resolves.toBe("FITS");
    await expect(roomFor(1001)).resolves.toBe("FULL");
    await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,run_id,spend_phase,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) VALUES(gen_random_uuid(),'RUN',$1,'BODY','fake-provider',(now() AT TIME ZONE 'UTC')::date,400,1,1)", [run]);
    await expect(roomFor(601)).resolves.toBe("FULL");
    await expect(roomFor(600)).resolves.toBe("FITS");
    const lastMonth = await database.pool.query("SELECT staff.read_team_internal_spent(date_trunc('month',now())-interval '1 month',date_trunc('month',now())) v");
    expect(Number(lastMonth.rows[0].v)).toBe(0);
  });
  it("a running debate's unspent hold is held back from the room; a finished debate's is not", async () => {
    const { run } = await scope();
    const page = await repository.readPage(owner.context as never, hash(owner.sessionId)) as { amount_micros: number; spent_micros: number };
    const room = page.amount_micros - page.spent_micros;
    await expect(roomFor(room)).resolves.toBe("FITS");
    await database.pool.query("INSERT INTO ledger.model_spend_hold(hold_id,run_id,held_micros) VALUES(gen_random_uuid(),$1,10)", [run]);
    await expect(roomFor(room)).resolves.toBe("FITS"); // no work is queued for it, so the hold is over
    const pending = randomUUID(), grant = (await database.pool.query("SELECT internal_grant_id g,internal_grant_event_id e FROM billing.run_charge_scope WHERE run_id=$1", [run])).rows[0];
    await database.pool.query("INSERT INTO billing.internal_provider_admission(call_id,run_id,grant_id,grant_event_id,projected_micros,spend_source,spend_phase,admitted_at) VALUES($1,$2,$3,$4,10,'STORY',NULL,now())", [pending, run, grant.g, grant.e]);
    await expect(roomFor(room)).resolves.toBe("FULL");
    await expect(roomFor(room - 10)).resolves.toBe("FITS");
  });
  it("a practice counts once, in its month", async () => {
    const ref = randomUUID(), before = (await repository.readPage(owner.context as never, hash(owner.sessionId)) as { spent_micros: number }).spent_micros;
    const record = async (operationId: string) => {
      const binding = canonicalTeamLimitActionBinding({ action: "TEAM_PRACTICE_RECORD", practice_ref: ref, charge_micros: 70, operation_id: operationId }, owner.staffId, null) as unknown as Record<string, unknown>;
      const proof = await storedProof(owner, binding, "TEAM_PRACTICE_RECORDED");
      return runtime.query("SELECT staff.record_team_practice($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb)", [owner.context, proof.proofId, binding, { targetId: ref, chargeMicros: 70, operationId, reason: FUNDING }, proof.alert]);
    };
    await record(randomUUID());
    expect((await repository.readPage(owner.context as never, hash(owner.sessionId)) as { spent_micros: number }).spent_micros).toBe(before + 70);
    await expect(record(randomUUID())).rejects.toThrow("TEAM_PRACTICE_ALREADY_RECORDED");
  });
});
