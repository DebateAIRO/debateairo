import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, EntitlementRepository, migrate, PostgresInternalAllowanceRepository, RunWaitRepository, type Pool } from "@debateai/db";
import { CostEnvelopeGuard, PostgresModelSpendStore } from "@debateai/budget";
import { FundingAwarePersonAllowanceSource } from "@debateai/billing-core";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, TEAM_FEATURE_PLAN_ID } from "@debateai/register";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import { resolveBillingAsk } from "../../apps/api/src/ask-billing.js";
import { readWebRunPlan } from "../../apps/runner/src/run-settings.js";
import { canonicalTeamAllowanceActionBinding, type TeamAllowanceIntent } from "../../apps/api/src/staff/team-allowances.js";
import { canonicalTeamLimitActionBinding } from "../../apps/api/src/staff/team-limit.js";
import { withMailLocale } from "../../packages/db/src/mail-locale.js";
import { authorizeStaffAlertFixture } from "../support/staffAlertReadiness.js";
import { internalFundingFixture, plentyOfTeamRoom } from "../support/internalFundingFixture.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Decision 32's security list on real Postgres, through the runtime role's own grants. All amounts are made up. A proof here is stored the way
 * the ceremony stores one (the ceremony itself: the begin test below and team-allowance-http.test.ts).
 */
let database: TestDatabase, runtime: Pool, fixture: ReturnType<typeof internalFundingFixture>, repository: PostgresInternalAllowanceRepository;
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const FUNDING = { code: "FUNDING_APPROVAL" } as const;
const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test:team-allowance");
const price = { inputMicrosPerMillionTokens: 1000000, outputMicrosPerMillionTokens: 1000000 };
type Actor = Readonly<{ userId: string; sessionId: string; staffId: string; privilegeId: string; ownerRef: string; context: Record<string, unknown> }>;
let owner: Actor;

async function contextOf(a: Omit<Actor, "context">): Promise<Record<string, unknown>> {
  return (await runtime.query("SELECT staff.read_context($1,$2,$3) AS context", [a.userId, a.sessionId, hash(a.privilegeId)])).rows[0].context;
}
async function account(): Promise<Readonly<{ userId: string; sessionId: string; ownerRef: string }>> {
  const userId = randomUUID(), sessionId = randomUUID(), q = database.pool;
  await q.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), userId]);
  await q.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
    VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [randomUUID(), userId]);
  await q.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`, [userId]);
  await q.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
    VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [sessionId, userId, hash(sessionId), hash("csrf" + sessionId)]);
  const ownerRef = (await q.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0].owner_ref as string;
  return { userId, sessionId, ownerRef };
}
/** A team member with every capability a delegate can hold, and a live elevated session. */
async function member(): Promise<Actor> {
  const a = await account(), staffId = randomUUID(), privilegeId = randomUUID();
  await database.pool.query("INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)", [staffId, a.userId, ["TEAM_READ", "AUDIT_READ", "EMERGENCY_DISABLE", "PUBLICATION_REVIEW", "THREAT_REPORT"]]);
  await database.pool.query(`INSERT INTO staff.privilege_session(privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '2 hours')`, [privilegeId, staffId, a.userId, a.sessionId, hash(privilegeId), hash("staff-csrf" + privilegeId)]);
  const base = { ...a, staffId, privilegeId };
  return { ...base, context: await contextOf(base) };
}
/** After a pick the partner's sessions are revoked, as any grant change does: this is their new elevation. */
async function elevated(a: Actor): Promise<Actor> {
  const privilegeId = randomUUID(), s = (await database.pool.query("SELECT security_epoch,grant_revision FROM staff.subject WHERE staff_id=$1", [a.staffId])).rows[0];
  await database.pool.query(`INSERT INTO staff.privilege_session(privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,now()+interval '15 minutes',now()+interval '2 hours')`, [privilegeId, a.staffId, a.userId, a.sessionId, hash(privilegeId), hash("staff-csrf" + privilegeId), s.security_epoch, s.grant_revision]);
  const base = { userId: a.userId, sessionId: a.sessionId, ownerRef: a.ownerRef, staffId: a.staffId, privilegeId };
  return { ...base, context: await contextOf(base) };
}
async function storedProof(a: Actor, binding: Record<string, unknown>, event: string): Promise<Readonly<{ proofId: string; alert: Record<string, unknown> }>> {
  const proofId = randomUUID(), c = a.context as { securityEpoch: number; grantRevision: number; accountSecurityEpoch: number };
  await database.pool.query(`INSERT INTO staff.action_proof(proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,account_security_epoch,grant_revision,binding,credential_id,verified_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'fixture-key',now(),now()+interval '5 minutes')`, [proofId, a.staffId, a.userId, a.sessionId, a.privilegeId, c.securityEpoch, c.accountSecurityEpoch, c.grantRevision, binding]);
  await authorizeStaffAlertFixture(database.pool, binding.operationId as string);
  return { proofId, alert: { schema: "staff-alert-v1", event, operationId: binding.operationId, envelope: { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" } } };
}
const lineage = async (a: Pick<Actor, "ownerRef">) => (await database.pool.query("SELECT coalesce(max(revision),0)::int r FROM billing.internal_grant WHERE owner_ref=$1", [a.ownerRef])).rows[0].r as number;
const policyVersion = async () => (await database.pool.query("SELECT register_version::int v FROM staff.funding_policy_selection")).rows[0].v as number;
const AMOUNTS = { amount_micros: 900000, day_micros: 90000, week_micros: 400000 };
async function configureParts(target: Actor, change: Partial<typeof AMOUNTS> = {}) {
  const startsAt = new Date(Date.now() - 1000).toISOString(), expiresAt = new Date(Date.now() + 86400000).toISOString(), revision = await lineage(target), operationId = randomUUID();
  const intent: TeamAllowanceIntent = { action: "TEAM_ALLOWANCE_CONFIGURE", target_staff_id: target.staffId, expected_revision: revision, ...AMOUNTS, ...change,
    starts_at: startsAt, expires_at: expiresAt, funding_approval_ref: "SYNTHETIC-APPROVAL", operation_id: operationId, reason: FUNDING };
  const state = { ownerRef: target.ownerRef, keyUserId: target.userId, expectedRevision: revision, policyRegisterVersion: await policyVersion() };
  const binding = canonicalTeamAllowanceActionBinding(intent, state) as unknown as Record<string, unknown>;
  const command = { targetStaffId: target.staffId, ownerRef: target.ownerRef, expectedRevision: revision, policyRegisterVersion: state.policyRegisterVersion,
    amountMicros: intent.amount_micros, dayMicros: intent.day_micros, weekMicros: intent.week_micros, startsAt, expiresAt, fundingApprovalRef: "SYNTHETIC-APPROVAL", operationId, reason: FUNDING };
  return { intent, state, binding, command, operationId };
}
const configureSql = "SELECT staff.configure_internal_allowance($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value";
const revokeSql = "SELECT staff.revoke_internal_allowance($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value";
async function give(actor: Actor, target: Actor, change: Partial<typeof AMOUNTS> = {}) {
  const parts = await configureParts(target, change), proof = await storedProof(actor, parts.binding, "ALLOWANCE_CONFIGURED");
  await runtime.query(configureSql, [actor.context, proof.proofId, parts.binding, parts.command, proof.alert]);
  return parts.operationId;
}
async function revokeParts(target: Actor, grantId: string) {
  const revision = await lineage(target), operationId = randomUUID(), version = (await database.pool.query("SELECT policy_register_version::int v FROM billing.internal_grant WHERE grant_id=$1", [grantId])).rows[0]?.v as number ?? await policyVersion();
  const intent: TeamAllowanceIntent = { action: "TEAM_ALLOWANCE_REVOKE", target_staff_id: target.staffId, grant_id: grantId, expected_revision: revision, operation_id: operationId, reason: FUNDING };
  const binding = canonicalTeamAllowanceActionBinding(intent, { ownerRef: target.ownerRef, keyUserId: target.userId, expectedRevision: revision, policyRegisterVersion: version }) as unknown as Record<string, unknown>;
  return { binding, operationId, command: { targetStaffId: target.staffId, ownerRef: target.ownerRef, grantId, expectedRevision: revision, policyRegisterVersion: version, operationId, reason: FUNDING } };
}
async function takeBack(actor: Actor, target: Actor, grantId: string) {
  const parts = await revokeParts(target, grantId), proof = await storedProof(actor, parts.binding, "ALLOWANCE_REVOKED");
  await runtime.query(revokeSql, [actor.context, proof.proofId, parts.binding, parts.command, proof.alert]);
  return parts.operationId;
}
const current = (a: Actor) => repository.current(a.ownerRef, new Date());
const pageFor = async (a: Actor) => await repository.readMemberPage(a.context as never, hash(a.sessionId)) as {
  limits: Record<string, number>;
  members: Array<{ staff_id: string; pseudonym: string; revision: number; is_owner: boolean; allowance: null | { grant_id: string; amount_micros: number; spent_micros: number } }>;
  log: Array<{ kind: string; subject_staff_id: string; actor_staff_id: string | null; amount_micros?: number; cause?: string; notice: string }>;
};
async function clearPartner() { const h = (await database.pool.query("SELECT staff_id FROM staff.team_limit_holder WHERE active")).rows[0]; if (h !== undefined) await database.pool.query("SELECT staff.end_team_limit_holder($1,'OWNER_REVOKED')", [h.staff_id]); }
async function pickPartner(target: Actor): Promise<Actor> {
  await clearPartner();
  const revision = (await database.pool.query("SELECT grant_revision::int r FROM staff.subject WHERE staff_id=$1", [target.staffId])).rows[0].r as number;
  const binding = canonicalTeamLimitActionBinding({ action: "TEAM_LIMIT_PARTNER_GRANT", target_staff_id: target.staffId, expected_revision: revision, operation_id: randomUUID(), reason: { code: "GRANT_CHANGE" } }, "unused", null) as unknown as Record<string, unknown>;
  const proof = await storedProof(owner, binding, "TEAM_LIMIT_PARTNER_GRANTED");
  await runtime.query("SELECT staff.grant_team_limit_partner($1::jsonb,$2::uuid,$3::jsonb,$4::uuid,$5::uuid,$6::jsonb,$7::jsonb) AS value", [owner.context, proof.proofId, binding, target.staffId, binding.operationId, { code: "GRANT_CHANGE" }, proof.alert]);
  return elevated(target);
}
const noticesFor = async (operationId: string) => (await database.pool.query("SELECT kind,recipient_staff_id FROM staff.allowance_notice WHERE operation_id=$1 ORDER BY kind", [operationId])).rows as Array<{ kind: string; recipient_staff_id: string }>;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  runtime = createPool(await createSystemTwin(database, "team_allowance_runtime", ["debateai_runtime", "debateai_billing_runtime"]));
  fixture = internalFundingFixture(database.pool, runtime);
  repository = new PostgresInternalAllowanceRepository(runtime);
  owner = await fixture.fundedActor() as unknown as Actor;
  await plentyOfTeamRoom(database.pool);
}, 120000);
afterAll(async () => { await runtime?.end(); await database?.stop(); });

describe("the Owner gives and takes back", () => {
  it("gives any active member a personal allowance: it is theirs, logged, alerted to the independent channel, and mail names no amount or person", async () => {
    const m = await member(), operationId = await give(owner, m);
    const grant = (await current(m))!;
    expect(grant).toMatchObject({ grantId: operationId, ownerRef: m.ownerRef, amountMicros: 900000, dayMicros: 90000, weekMicros: 400000, revision: 1 });
    expect(await current(owner)).toBeNull();
    const audit = (await database.pool.query("SELECT a.event_type,a.actor_staff_id,a.subject_staff_id,a.reason_code,o.purpose FROM staff.audit_event a JOIN staff.alert_outbox o USING(event_id) WHERE a.operation_id=$1", [operationId])).rows;
    expect(audit).toEqual([{ event_type: "ALLOWANCE_CONFIGURED", actor_staff_id: owner.staffId, subject_staff_id: m.staffId, reason_code: "FUNDING_APPROVAL", purpose: "INDEPENDENT_METADATA_ALERT" }]);
    expect(await noticesFor(operationId)).toEqual([{ kind: "ALLOWANCE_CHANGED", recipient_staff_id: owner.staffId }, { kind: "ALLOWANCE_YOURS", recipient_staff_id: m.staffId }]);
    const claims = await repository.claimNotices(100);
    expect(claims.filter(c => c.kind === "ALLOWANCE_YOURS").map(c => Object.keys(c).sort())[0]).toEqual(["claim_token", "kind", "notice_id", "recipient_staff_id"]);
    for (const c of claims) await repository.completeNotice(c.notice_id, c.claim_token, true);
  });
  it("takes it back: nothing funds the member any more, and the end is logged and alerted as well", async () => {
    const m = await member(), grantId = await give(owner, m), operationId = await takeBack(owner, m, grantId);
    expect(await current(m)).toBeNull();
    expect((await database.pool.query("SELECT event_type,revision::int r FROM billing.internal_grant_event WHERE grant_id=$1 ORDER BY revision", [grantId])).rows).toEqual([{ event_type: "CONFIGURED", r: 1 }, { event_type: "REVOKED", r: 2 }]);
    expect((await database.pool.query("SELECT a.event_type,a.subject_staff_id FROM staff.audit_event a WHERE a.operation_id=$1", [operationId])).rows).toEqual([{ event_type: "ALLOWANCE_REVOKED", subject_staff_id: m.staffId }]);
    expect((await database.pool.query("SELECT cause,ended_by_staff_id FROM staff.internal_grant_end WHERE grant_id=$1", [grantId])).rows).toEqual([{ cause: "OWNER_REVOKED", ended_by_staff_id: owner.staffId }]);
    expect((await noticesFor(operationId)).map(n => n.kind)).toEqual(["ALLOWANCE_CHANGED", "ALLOWANCE_YOURS"]);
    await expect(takeBack(owner, m, grantId)).rejects.toThrow("INTERNAL_ALLOWANCE_TARGET_INVALID");
  });
  it("the Owner can hold one too, through the same door", async () => {
    const grantId = await give(owner, owner);
    expect((await current(owner))?.grantId).toBe(grantId);
    await takeBack(owner, owner, grantId);
  });
  it("the page shows the Owner every active member with their allowance and the log, never an account's owner reference", async () => {
    const m = await member(), grantId = await give(owner, m);
    await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,run_id,spend_phase,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) SELECT gen_random_uuid(),'RUN',r.run_id,'BODY','fake-provider',(now() AT TIME ZONE 'UTC')::date,1234,1,1 FROM (SELECT $1::uuid run_id) r", [await pinnedRun(m, grantId)]);
    const page = await pageFor(owner);
    expect(page.limits).toMatchObject({ maximum_grant_micros: 1200000, maximum_day_micros: 100000, maximum_week_micros: 500000 });
    expect(page.members.find(x => x.staff_id === m.staffId)).toMatchObject({ pseudonym: `staff-${m.staffId.replaceAll("-", "")}`, revision: 1, is_owner: false, allowance: { grant_id: grantId, amount_micros: 900000, spent_micros: 1234 } });
    expect(page.members.find(x => x.staff_id === owner.staffId)?.is_owner).toBe(true);
    expect(page.log.find(e => e.subject_staff_id === m.staffId)).toMatchObject({ kind: "GIVEN", actor_staff_id: owner.staffId, amount_micros: 900000 });
    expect(JSON.stringify(page)).not.toContain(m.ownerRef);
    expect(JSON.stringify(page)).not.toContain(m.userId);
  });
  it("the bounds still hold: over the sealed policy, a second allowance, and a window already over are refused", async () => {
    const m = await member();
    await expect(give(owner, m, { amount_micros: 1200001 })).rejects.toThrow("INTERNAL_ALLOWANCE_COMMAND_INVALID");
    await expect(give(owner, m, { day_micros: 100001, week_micros: 400000 })).rejects.toThrow("INTERNAL_ALLOWANCE_COMMAND_INVALID");
    await give(owner, m);
    await expect(give(owner, m)).rejects.toThrow("INTERNAL_ALLOWANCE_OVERLAP");
  });
});

describe("only the Owner", () => {
  const refused = async (actor: Actor) => {
    const target = await member(), parts = await configureParts(target), proof = await storedProof(actor, parts.binding, "ALLOWANCE_CONFIGURED");
    await expect(runtime.query(configureSql, [actor.context, proof.proofId, parts.binding, parts.command, proof.alert])).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    expect(await current(target)).toBeNull();
    const held = await member(), grantId = await give(owner, held), revoke = await revokeParts(held, grantId), revokeProof = await storedProof(actor, revoke.binding, "ALLOWANCE_REVOKED");
    await expect(runtime.query(revokeSql, [actor.context, revokeProof.proofId, revoke.binding, revoke.command, revokeProof.alert])).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    expect((await current(held))?.grantId).toBe(grantId);
    await expect(repository.readMemberCommand(actor.context as never, hash(actor.sessionId), target.staffId, null)).rejects.toThrow();
    await expect(repository.readMemberPage(actor.context as never, hash(actor.sessionId))).rejects.toThrow();
  };
  it("a delegated member with every capability a delegate may hold is refused by every function", async () => { await refused(await member()); });
  it("the partner, who may change the team's limit, is refused by every function", async () => {
    const partner = await pickPartner(await member());
    expect((await runtime.query("SELECT staff.authorize_action($1::jsonb,'TEAM_LIMIT_SET') AS ok", [partner.context])).rows[0].ok).toBe(true);
    expect((await runtime.query("SELECT staff.authorize_action($1::jsonb,'ALLOWANCE_WRITE') AS ok", [partner.context])).rows[0].ok).toBe(false);
    await refused(partner);
    await clearPartner();
  });
  it("nobody can hold the capability: a subject cannot store it", async () => {
    const m = await member();
    await expect(database.pool.query("UPDATE staff.subject SET capabilities=array_append(capabilities,'ALLOWANCE_WRITE') WHERE staff_id=$1", [m.staffId])).rejects.toMatchObject({ code: "23514" });
  });
  it("the runtime role writes and reads none of the tables", async () => {
    for (const table of ["billing.internal_grant", "billing.internal_grant_event", "staff.internal_grant_holder", "staff.internal_grant_end", "staff.allowance_notice"]) {
      await expect(runtime.query(`SELECT * FROM ${table}`), table).rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query(`DELETE FROM ${table}`), table).rejects.toMatchObject({ code: "42501" });
    }
    await expect(runtime.query("SELECT staff.end_internal_grants(NULL,'OWNER_CHANGED',false)")).rejects.toMatchObject({ code: "42501" });
  });
  it("the ceremony: the Owner may start one for a member; a delegate and the partner may not", async () => {
    const challenge = async (a: Actor, binding: Record<string, unknown>) => runtime.query(
      "SELECT staff.begin_owned_webauthn($1,$2,'ACTION',$3,$4,'localhost','https://localhost',NULL,NULL,$5::jsonb,$6::jsonb,'{}'::jsonb)",
      [a.userId, a.sessionId, hash(randomUUID()), hash(randomUUID()), a.context, binding]);
    const key = async (a: Actor) => {
      const id = randomUUID();
      await withMailLocale(database.pool, "en", (c) => c.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter)
        VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),'localhost','https://localhost',true,false,false,$5,0)`, [id, a.userId, `key_${id.replaceAll("-", "")}`, { format: "COSE_KEY_BASE64URL_V1", value: "AA" }, { v: 1, keyId: `passkey-label:${id}:v1`, nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" }]));
      await database.pool.query("INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256,transports) VALUES($1,$2,$3,ARRAY['usb'])", [id, a.userId, hash(id)]);
    };
    const target = await member(), parts = await configureParts(target), d = await member(), partner = await pickPartner(await member());
    await key(owner); await key(d); await key(partner);
    await expect(challenge(owner, parts.binding)).resolves.toBeDefined();
    await expect(challenge(d, parts.binding)).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    await expect(challenge(partner, parts.binding)).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    await clearPartner();
  });
});

describe("who can receive one", () => {
  it("not a disabled member, not an account outside the team, not a member under another account's reference", async () => {
    const disabled = await member();
    await database.pool.query("UPDATE staff.subject SET state='DISABLED' WHERE staff_id=$1", [disabled.staffId]);
    await expect(give(owner, disabled)).rejects.toThrow("STAFF_TARGET_INVALID");
    await expect(repository.readMemberCommand(owner.context as never, hash(owner.sessionId), disabled.staffId, null)).rejects.toThrow("STAFF_TARGET_INVALID");
    const outsider = await account();
    await expect(give(owner, { ...outsider, staffId: randomUUID(), privilegeId: randomUUID(), context: {} })).rejects.toThrow("STAFF_TARGET_INVALID");
    const a = await member(), b = await member();
    await expect(give(owner, { ...a, ownerRef: b.ownerRef })).rejects.toThrow("STAFF_TARGET_INVALID");
    expect(await current(a)).toBeNull();
    expect(await current(b)).toBeNull();
  });
  it("not an account on a security hold", async () => {
    const m = await member();
    await database.pool.query("INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,1)", [m.userId]);
    await expect(give(owner, m)).rejects.toThrow("STAFF_TARGET_INVALID");
  });
  it("a member on a hold cannot be given one, but can still lose theirs: taking back only narrows", async () => {
    const m = await member(), grantId = await give(owner, m);
    await database.pool.query("INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,1)", [m.userId]);
    await expect(repository.readMemberCommand(owner.context as never, hash(owner.sessionId), m.staffId, null)).rejects.toThrow("STAFF_TARGET_INVALID");
    await expect(repository.readMemberCommand(owner.context as never, hash(owner.sessionId), m.staffId, grantId)).resolves.toMatchObject({ expectedRevision: 1 });
    await takeBack(owner, m, grantId);
    expect((await database.pool.query("SELECT revoked_at IS NOT NULL AS ended FROM billing.internal_grant WHERE grant_id=$1", [grantId])).rows[0].ended).toBe(true);
  });
  it("the state a ceremony is bound to is the database's: the member's reference, their lineage, the selected version", async () => {
    const m = await member();
    await give(owner, m);
    await expect(repository.readMemberCommand(owner.context as never, hash(owner.sessionId), m.staffId, null)).resolves.toEqual({ ownerRef: m.ownerRef, keyUserId: m.userId, expectedRevision: 1, policyRegisterVersion: await policyVersion() });
    await expect(repository.readMemberCommand(owner.context as never, hash(owner.sessionId), m.staffId, randomUUID())).rejects.toThrow("INTERNAL_ALLOWANCE_TARGET_INVALID");
  });
});

describe("the proof", () => {
  it("is for one member: a proof for another member, or for a command under another member, is refused", async () => {
    const a = await member(), b = await member(), forA = await configureParts(a), proof = await storedProof(owner, forA.binding, "ALLOWANCE_CONFIGURED");
    // The command changed to b under a's binding: the digest differs.
    const toB = { ...forA.command, targetStaffId: b.staffId, ownerRef: b.ownerRef };
    await expect(runtime.query(configureSql, [owner.context, proof.proofId, forA.binding, toB, proof.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    // A binding honestly computed for b, with a's proof: the proof is bound to a's.
    const forB = canonicalTeamAllowanceActionBinding({ ...forA.intent, target_staff_id: b.staffId } as TeamAllowanceIntent, { ...forA.state, ownerRef: b.ownerRef, keyUserId: b.userId }) as unknown as Record<string, unknown>;
    await expect(runtime.query(configureSql, [owner.context, proof.proofId, forB, toB, proof.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    // The staff id alone moved, with the account's reference left: the digest names both.
    await expect(runtime.query(configureSql, [owner.context, proof.proofId, forA.binding, { ...forA.command, targetStaffId: b.staffId }, proof.alert])).rejects.toThrow(/STAFF_PROOF_INVALID|STAFF_TARGET_INVALID/u);
    expect(await current(a)).toBeNull();
    expect(await current(b)).toBeNull();
    await runtime.query(configureSql, [owner.context, proof.proofId, forA.binding, forA.command, proof.alert]);
    expect((await current(a))?.amountMicros).toBe(900000);
  });
  it.each([
    ["the amount", { amountMicros: 900001 }], ["the day", { dayMicros: 90001 }], ["the week", { weekMicros: 400001 }],
    ["the start", { startsAt: new Date(Date.now() - 5000).toISOString() }], ["the end", { expiresAt: new Date(Date.now() + 3600000).toISOString() }],
    ["the approval reference", { fundingApprovalRef: "OTHER-APPROVAL" }]
  ])("is for one set of amounts and one window: another %s is refused", async (_name, change) => {
    const m = await member(), parts = await configureParts(m), proof = await storedProof(owner, parts.binding, "ALLOWANCE_CONFIGURED");
    await expect(runtime.query(configureSql, [owner.context, proof.proofId, parts.binding, { ...parts.command, ...change }, proof.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    expect(await current(m)).toBeNull();
  });
  it("is for one revision: one made before another change is stale, and is not used up", async () => {
    const m = await member(), stale = await configureParts(m), proof = await storedProof(owner, stale.binding, "ALLOWANCE_CONFIGURED");
    const grantId = await give(owner, m);
    await takeBack(owner, m, grantId);
    await expect(runtime.query(configureSql, [owner.context, proof.proofId, stale.binding, stale.command, proof.alert])).rejects.toThrow("STAFF_REVISION_INVALID");
    expect((await database.pool.query("SELECT consumed_at FROM staff.action_proof WHERE proof_id=$1", [proof.proofId])).rows[0].consumed_at).toBeNull();
  });
  it("cannot be replayed: the same operation returns its first receipt and adds nothing; the proof under another operation is refused", async () => {
    const m = await member(), parts = await configureParts(m), proof = await storedProof(owner, parts.binding, "ALLOWANCE_CONFIGURED");
    const first = (await runtime.query(configureSql, [owner.context, proof.proofId, parts.binding, parts.command, proof.alert])).rows[0].value;
    const again = (await runtime.query(configureSql, [owner.context, proof.proofId, parts.binding, parts.command, proof.alert])).rows[0].value;
    expect(again).toEqual(first);
    expect((await database.pool.query("SELECT count(*)::int n FROM billing.internal_grant WHERE owner_ref=$1", [m.ownerRef])).rows[0].n).toBe(1);
    const grantId = parts.operationId;
    await takeBack(owner, m, grantId);
    const next = await configureParts(m);
    await authorizeStaffAlertFixture(database.pool, next.operationId);
    await expect(runtime.query(configureSql, [owner.context, proof.proofId, next.binding, next.command, { ...proof.alert, operationId: next.operationId }])).rejects.toThrow("STAFF_PROOF_INVALID");
    expect(await current(m)).toBeNull();
  });
  it("a take-back's proof is for that grant and that member", async () => {
    const a = await member(), b = await member(), grantA = await give(owner, a), grantB = await give(owner, b);
    const parts = await revokeParts(a, grantA), proof = await storedProof(owner, parts.binding, "ALLOWANCE_REVOKED");
    await expect(runtime.query(revokeSql, [owner.context, proof.proofId, parts.binding, { ...parts.command, grantId: grantB }, proof.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    await expect(runtime.query(revokeSql, [owner.context, proof.proofId, parts.binding, { ...parts.command, targetStaffId: b.staffId, ownerRef: b.ownerRef }, proof.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    expect((await current(a))?.grantId).toBe(grantA);
    expect((await current(b))?.grantId).toBe(grantB);
  });
  it("with team tools locked (no fresh alert readiness) the database refuses", async () => {
    const m = await member(), parts = await configureParts(m), proof = await storedProof(owner, parts.binding, "ALLOWANCE_CONFIGURED");
    await database.pool.query("DELETE FROM staff.alert_operation_readiness WHERE operation_id=$1", [parts.operationId]);
    await expect(runtime.query(configureSql, [owner.context, proof.proofId, parts.binding, parts.command, proof.alert])).rejects.toThrow("STAFF_ALERT_UNAVAILABLE");
    expect(await current(m)).toBeNull();
  });
});

async function pinnedRun(m: Actor, grantId: string): Promise<string> {
  const runId = await fixture.run(m.ownerRef), tx = await runtime.connect(), event = (await database.pool.query("SELECT configured_event_id FROM billing.internal_grant WHERE grant_id=$1", [grantId])).rows[0].configured_event_id as string;
  try { await new EntitlementRepository(runtime).recordRunChargeScope(tx, { runId, ownerRef: m.ownerRef, basis: { kind: "INTERNAL", grantId, grantEventId: event }, admittedAt: new Date() }); }
  finally { tx.release(); }
  return runId;
}
const runState = async (runId: string) => (await runtime.query("SELECT billing.read_internal_run_state($1) AS s", [runId])).rows[0].s as string;
const endOf = async (grantId: string) => (await database.pool.query("SELECT e.cause,e.ended_by_staff_id,g.revoked_at IS NOT NULL AS revoked FROM staff.internal_grant_end e JOIN billing.internal_grant g USING(grant_id) WHERE e.grant_id=$1", [grantId])).rows[0];

describe("when the people change", () => {
  it("offboarding ends it: nothing funds them, their running debate reads REVOKED, a new ask falls to the normal plan, and only the Owner is told", async () => {
    const m = await member(), grantId = await give(owner, m), run = await pinnedRun(m, grantId);
    expect(await runState(run)).toBe("ACTIVE");
    const r = (await database.pool.query("SELECT grant_revision::int r FROM staff.subject WHERE staff_id=$1", [m.staffId])).rows[0].r as number, op = randomUUID();
    const binding = { action: "TEAM_DISABLE", targetId: m.staffId, bodySha256: "b".repeat(64), expectedRevision: r, operationId: op }, stored = await storedProof(owner, binding, "DISABLE");
    await runtime.query("SELECT staff.disable($1::jsonb,$2,$3::jsonb,$4,'OFFBOARD',$5,$6::jsonb,$7::jsonb)", [owner.context, stored.proofId, binding, m.staffId, op, { code: "OFFBOARDING" }, stored.alert]);
    expect(await current(m)).toBeNull();
    expect(await endOf(grantId)).toEqual({ cause: "STAFF_DISABLED", ended_by_staff_id: null, revoked: true });
    expect(await runState(run)).toBe("REVOKED");
    await expect(runtime.query("SELECT billing.reserve_internal_provider_call($1,$2,10,'STORY',NULL) v", [randomUUID(), run])).rejects.toThrow();
    const opEnd = (await database.pool.query("SELECT operation_id FROM billing.internal_grant_event WHERE grant_id=$1 AND event_type='REVOKED'", [grantId])).rows[0].operation_id as string;
    expect(await noticesFor(opEnd)).toEqual([{ kind: "ALLOWANCE_CHANGED", recipient_staff_id: owner.staffId }]);
    const page = await pageFor(owner);
    expect(page.members.some(x => x.staff_id === m.staffId)).toBe(false);
    expect(page.log.find(e => e.subject_staff_id === m.staffId && e.kind === "ENDED")).toMatchObject({ cause: "STAFF_DISABLED", actor_staff_id: null });
  });
  it("emergency disable, by any delegate who may, ends it", async () => {
    const m = await member(), grantId = await give(owner, m), responder = await member(), op = randomUUID();
    const binding = { action: "EMERGENCY_DISABLE", targetId: m.staffId, bodySha256: "b".repeat(64), expectedRevision: 0, operationId: op }, stored = await storedProof(responder, binding, "DISABLE");
    await runtime.query("SELECT staff.disable($1::jsonb,$2,$3::jsonb,$4,'COMPROMISE',$5,$6::jsonb,$7::jsonb)", [responder.context, stored.proofId, binding, m.staffId, op, { code: "SECURITY_RESPONSE" }, stored.alert]);
    expect(await endOf(grantId)).toMatchObject({ cause: "STAFF_DISABLED", revoked: true });
  });
  it("an erased account ends it, whatever is left keeps no reference to them, and the staff pseudonym alone stays in the log", async () => {
    const m = await member(), grantId = await give(owner, m), oldRef = m.ownerRef;
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [m.userId]);
    expect(await endOf(grantId)).toMatchObject({ cause: "ACCOUNT_ERASED", revoked: true });
    expect((await database.pool.query("SELECT owner_ref FROM billing.internal_grant WHERE grant_id=$1", [grantId])).rows[0].owner_ref).toBeNull();
    const page = await pageFor(owner);
    expect(JSON.stringify(page)).not.toContain(oldRef);
    expect(page.log.find(e => e.subject_staff_id === m.staffId && e.kind === "ENDED")).toMatchObject({ cause: "ACCOUNT_ERASED" });
  });
  it("a grant that already ended, by time or by the Owner, gets no second end", async () => {
    const m = await member(), grantId = await give(owner, m);
    await takeBack(owner, m, grantId);
    const events = async () => (await database.pool.query("SELECT count(*)::int n FROM billing.internal_grant_event WHERE grant_id=$1", [grantId])).rows[0].n as number;
    expect(await events()).toBe(2);
    await database.pool.query("UPDATE staff.subject SET state='DISABLED' WHERE staff_id=$1", [m.staffId]);
    expect(await events()).toBe(2);
    expect(await endOf(grantId)).toMatchObject({ cause: "OWNER_REVOKED" });
  });
  it("a new Owner (recovery) ends every allowance the old Owner gave, tells them and the members, and only then can give again", async () => {
    const a = await member(), b = await member(), grantA = await give(owner, a), grantB = await give(owner, b), run = await pinnedRun(a, grantA);
    const next = await member();
    await database.pool.query("UPDATE staff.owner_designation SET active=false WHERE active");
    // The old Owner cannot act from here on.
    await expect(give(owner, await member())).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    await database.pool.query("INSERT INTO staff.owner_designation(staff_id) VALUES($1)", [next.staffId]);
    for (const grantId of [grantA, grantB]) expect(await endOf(grantId)).toMatchObject({ cause: "OWNER_CHANGED", ended_by_staff_id: null, revoked: true });
    expect(await current(a)).toBeNull();
    expect(await runState(run)).toBe("REVOKED");
    const opEnd = (await database.pool.query("SELECT operation_id FROM billing.internal_grant_event WHERE grant_id=$1 AND event_type='REVOKED'", [grantA])).rows[0].operation_id as string;
    expect((await noticesFor(opEnd)).sort((x, y) => x.kind.localeCompare(y.kind))).toEqual([{ kind: "ALLOWANCE_CHANGED", recipient_staff_id: next.staffId }, { kind: "ALLOWANCE_YOURS", recipient_staff_id: a.staffId }]);
    const fresh = { ...next, context: await contextOf(next) };
    const again = await give(fresh, a);
    expect((await current(a))?.grantId).toBe(again);
    // Back to the fixture's Owner for the rest of the file.
    await database.pool.query("UPDATE staff.owner_designation SET active=false WHERE active");
    await database.pool.query("INSERT INTO staff.owner_designation(staff_id) VALUES($1)", [owner.staffId]);
  });
});

describe("the records cannot be rewritten", () => {
  it("not the holder and end rows, and a grant cannot be silently ended without its end record", async () => {
    const m = await member(), grantId = await give(owner, m);
    for (const sql of ["UPDATE staff.internal_grant_holder SET staff_id=gen_random_uuid()", "DELETE FROM staff.internal_grant_holder", "TRUNCATE staff.internal_grant_holder",
      "UPDATE staff.internal_grant_end SET cause='OWNER_CHANGED'", "DELETE FROM staff.internal_grant_end", "TRUNCATE staff.internal_grant_end"]) {
      await expect(database.pool.query(sql), sql).rejects.toThrow("STAFF_RECORD_IMMUTABLE");
    }
    // An end with no alert and no end record: the commit guard refuses it, even for the superuser's raw statements.
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE billing.internal_grant SET revoked_at=now(),revision=revision+1 WHERE grant_id=$1", [grantId]);
      await client.query("INSERT INTO billing.internal_grant_event(event_id,grant_id,event_type,operation_id,revision) VALUES(gen_random_uuid(),$1,'REVOKED',gen_random_uuid(),2)", [grantId]);
      await expect(client.query("COMMIT")).rejects.toThrow("INTERNAL_ALLOWANCE_COMMIT_INVALID");
    } finally { client.release(); }
    expect((await current(m))?.grantId).toBe(grantId);
  });
});

describe("a member's debate, end to end at database level", () => {
  const source = () => new FundingAwarePersonAllowanceSource({ allowances: new PostgresInternalAllowanceRepository(runtime), entitlements: new EntitlementRepository(runtime), plans, closeBasisPoints: 9500 });
  const billing = () => ({ funding: source(), entitlements: new EntitlementRepository(runtime), plans, clock: () => new Date() });
  const ask = { plan_tier: "free" } as never;
  const spentNow = async () => Number((await database.pool.query("SELECT staff.read_team_month_spent(date_trunc('month',now()),date_trunc('month',now())+interval '1 month') AS v")).rows[0].v);
  const kinds = [
    ["RUN", (g: CostEnvelopeGuard, runId: string) => g.providerSeam({ runId, phase: "BODY", sharedWall: "EXEMPT", requireReportedUsage: true, price } as never)],
    ["STORY", (g: CostEnvelopeGuard, runId: string) => g.storySeam({ runId, price, requireReportedUsage: true })],
    ["PATH_REWRITE", (g: CostEnvelopeGuard, runId: string) => g.pathRewriteSeam({ runId, price, requireReportedUsage: true })],
    ["PATH_CLIMB", (g: CostEnvelopeGuard, runId: string) => g.pathClimbSeam({ runId, price, requireReportedUsage: true })],
    ["ANSWER_UPDATE", (g: CostEnvelopeGuard, runId: string) => g.answerUpdateSeam({ runId, price, requireReportedUsage: true })],
    ["INVESTIGATION_REPORT", (g: CostEnvelopeGuard, runId: string) => g.investigationReportSeam({ runId, price, requireReportedUsage: true })]
  ] as const;
  it("reaches the top plan's features, whatever was asked, and its web search goes by the top plan", async () => {
    const m = await member(), grantId = await give(owner, m), event = (await current(m))!.grantEventId;
    const resolved = await resolveBillingAsk(ask, m.ownerRef, billing() as never, new Date());
    expect(resolved).toMatchObject({ planId: TEAM_FEATURE_PLAN_ID, entitlementEventId: null, fundingBasis: { kind: "INTERNAL", grantId, grantEventId: event }, ask: { plan_tier: "premium" } });
    expect(await readWebRunPlan(runtime, await pinnedRun(m, grantId))).toBe(TEAM_FEATURE_PLAN_ID);
  });
  it("the room a member reads comes from their allowance; a member without one reads their normal plan's", async () => {
    const m = await member(), other = await member();
    await give(owner, m);
    const funding = source();
    const room = new AskRoom({ lockPool: database.pool, spend: new PostgresModelSpendStore(runtime), line: new RunWaitRepository(runtime),
      estimator: { estimateMicros: async () => 1000 }, personAllowance: funding, funding, entitlements: new EntitlementRepository(runtime), billingPlans: plans,
      dailyCeilingMicros: 100000000, closeBasisPoints: 9500, waitingLinePerPerson: 5 } as never);
    const settingsClass = { planTier: "premium", compositionBudgetTier: "low", makerCount: 2, depth: 1 } as const;
    const answer = await room.readRoom({ access: { ownerRef: m.ownerRef, legacyAskerId: null }, settingsClass } as never);
    expect(answer).toMatchObject({ room: "FITS", funding: { kind: "INTERNAL" } });
    expect((await room.readRoom({ access: { ownerRef: other.ownerRef, legacyAskerId: null }, settingsClass } as never))).not.toMatchObject({ funding: { kind: "INTERNAL" } });
  });
  it("every kind and the clarify charge go on their grant alone, in the team's month, and on the page", async () => {
    const m = await member(), other = await member(), grantId = await give(owner, m), otherGrant = await give(owner, other), grant = (await current(m))!, runId = await pinnedRun(m, grantId);
    const before = await spentNow(), store = new PostgresModelSpendStore(runtime);
    const guard = new CostEnvelopeGuard({ store, policy: { closingCeilingMicros: 440000, perRunCeilingMicros: 250000, dailyCeilingMicros: 10000000, perStoryCeilingMicros: 250000 } } as never);
    const projection = { requestBytes: 2, completionTokenCeiling: 1 };
    for (const [, seamOf] of kinds) {
      const seam = seamOf(guard, runId), admission = await seam.assertCallAllowed(projection);
      expect(admission).toMatchObject({ kind: "INTERNAL" });
      await seam.recordCall({ admission: admission as never, providerRef: "fake-provider", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, projection } as never);
    }
    const rows = (await database.pool.query("SELECT s.spend_source,s.charge_micros::int charge,a.grant_id FROM ledger.model_spend s JOIN billing.internal_provider_admission a ON a.call_id=s.spend_id WHERE s.run_id=$1 ORDER BY s.spend_source", [runId])).rows as Array<{ spend_source: string; charge: number; grant_id: string }>;
    expect(rows.map(r => r.spend_source)).toEqual(kinds.map(([k]) => k).sort());
    expect(new Set(rows.map(r => r.grant_id))).toEqual(new Set([grantId]));
    const clarify = 77;
    expect((await runtime.query("SELECT identity.record_ask_clarify_charge($1,$2,$3,$4,'ask-clarify:fixture:model',(now() AT TIME ZONE 'UTC')::date,$5,1,1) AS v", [randomUUID(), m.ownerRef, grant.grantId, grant.grantEventId, clarify])).rows[0].v).toBe("RECORDED");
    const charged = rows.reduce((sum, row) => sum + row.charge, 0) + clarify;
    const on = async (a: Actor, id: string, event: string) => Number((await runtime.query("SELECT billing.read_internal_grant_spent($1,$2,$3,now()-interval '1 hour',now()+interval '1 hour',false) v", [a.ownerRef, id, event])).rows[0].v);
    expect(await on(m, grantId, grant.grantEventId)).toBe(charged);
    expect(await on(other, otherGrant, (await current(other))!.grantEventId)).toBe(0);
    expect(await spentNow()).toBe(before + charged);
    expect((await pageFor(owner)).members.find(x => x.staff_id === m.staffId)?.allowance?.spent_micros).toBe(charged);
    // 0154: another member's clarify charge naming m's grant is recorded on their own plan: nothing moves on m's grant, in the team's month or on the page.
    const borrowed = randomUUID();
    expect((await runtime.query("SELECT identity.record_ask_clarify_charge($1,$2,$3,$4,'ask-clarify:fixture:model',(now() AT TIME ZONE 'UTC')::date,$5,1,1) AS v", [borrowed, other.ownerRef, grant.grantId, grant.grantEventId, 999])).rows[0].v).toBe("RECORDED");
    expect((await database.pool.query("SELECT funding_kind,internal_grant_id FROM identity.ask_clarify_charge WHERE charge_id=$1", [borrowed])).rows[0]).toEqual({ funding_kind: "SUBSCRIPTION", internal_grant_id: null });
    expect([await on(m, grantId, grant.grantEventId), await on(other, grantId, grant.grantEventId), await spentNow()]).toEqual([charged, 0, before + charged]);
    expect((await pageFor(owner)).members.find(x => x.staff_id === m.staffId)?.allowance?.spent_micros).toBe(charged);
  });
  it("an allowance taken back while a clarify call runs still holds the call it admitted; a call reserved after it was taken back is the member's own plan's", async () => {
    const m = await member(), grantId = await give(owner, m), grant = (await current(m))!;
    const before = await spentNow();
    const clarify = (chargeId: string, micros: number) => runtime.query("SELECT identity.record_ask_clarify_charge($1,$2,$3,$4,'ask-clarify:fixture:model',(now() AT TIME ZONE 'UTC')::date,$5,1,1) AS v",
      [chargeId, m.ownerRef, grant.grantId, grant.grantEventId, micros]).then((result) => result.rows[0].v as string);
    const reserve = (chargeId: string) => runtime.query("SELECT identity.reserve_ask_clarify_charge($1,$2) AS v", [chargeId, m.ownerRef]).then((result) => result.rows[0].v as string);
    const fundingOf = async (chargeId: string) => (await database.pool.query("SELECT funding_kind FROM identity.ask_clarify_charge WHERE charge_id=$1", [chargeId])).rows[0]?.funding_kind as string;
    const [during, after] = [randomUUID(), randomUUID()];
    expect(await reserve(during)).toBe("RESERVED");
    await takeBack(owner, m, grantId);
    expect(await clarify(during, 33)).toBe("RECORDED");
    expect(await fundingOf(during)).toBe("INTERNAL");
    expect(await reserve(after)).toBe("RESERVED");
    expect(await clarify(after, 44)).toBe("RECORDED");
    expect(await fundingOf(after)).toBe("SUBSCRIPTION");
    expect(Number((await runtime.query("SELECT billing.read_internal_grant_spent($1,$2,$3,now()-interval '1 hour',now()+interval '1 hour',false) v", [m.ownerRef, grant.grantId, grant.grantEventId])).rows[0].v)).toBe(33);
    expect(await spentNow()).toBe(before + 33);
  });
  it("is held to the member's own day: past it, the next call on their grant is refused while another member's is not", async () => {
    const m = await member(), other = await member(), grantId = await give(owner, m, { amount_micros: 1000, day_micros: 100, week_micros: 500 }), otherGrant = await give(owner, other), run = await pinnedRun(m, grantId), otherRun = await pinnedRun(other, otherGrant);
    expect((await runtime.query("SELECT billing.reserve_internal_provider_call($1,$2,100,'STORY',NULL) v", [randomUUID(), run])).rows[0].v).toBe(true);
    await expect(runtime.query("SELECT billing.reserve_internal_provider_call($1,$2,1,'STORY',NULL) v", [randomUUID(), run])).rejects.toThrow("INTERNAL_ALLOWANCE_REACHED");
    expect((await runtime.query("SELECT billing.reserve_internal_provider_call($1,$2,1,'STORY',NULL) v", [randomUUID(), otherRun])).rows[0].v).toBe(true);
  });
  it("a member with no allowance gets no funded features: their normal plan applies", async () => {
    const m = await member();
    expect(await source().readGrant(m.ownerRef, new Date())).toBeNull();
    const taken = await give(owner, m);
    await takeBack(owner, m, taken);
    expect(await source().readGrant(m.ownerRef, new Date())).toBeNull();
    const resolved = await resolveBillingAsk(ask, m.ownerRef, billing() as never, new Date());
    expect(resolved.planId).toBe("FREE");
    expect(resolved).toMatchObject({ fundingBasis: { kind: "SUBSCRIPTION", planId: "FREE" } });
  });
});
