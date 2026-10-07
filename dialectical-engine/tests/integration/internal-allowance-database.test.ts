import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDevelopmentStaffV2DeploymentRegisterPublicationRows } from "../../apps/runner/src/dev-deployment-register.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { authorizeStaffAlertFixture } from "../support/staffAlertReadiness.js";
import { createPostgresRegisterPublicationPort, internalAllowancePolicyFromValue, loadBootstrapRegister, parseCanonicalRegisterJson, parseRegisterVersionText } from "@debateai/register";
import * as db from "@debateai/db";
import { seedStaffPrivateObject } from "../support/staffPrivateObjectFixture.js";
import { createPool, migrate, type Pool } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let runtime: Pool;
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const coreCapabilities = ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE"];

async function owner() {
  const userId = randomUUID(), sessionId = randomUUID(), staffId = randomUUID(), privilegeId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), userId]);
  await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
    VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [randomUUID(), userId]);
  await database.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
    VALUES($1,'email','{}','verified',now(),now())`, [userId]);
  await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
    VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [sessionId, userId, hash(sessionId), hash("csrf" + sessionId)]);
  await database.pool.query("INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)", [staffId, userId, coreCapabilities]);
  await database.pool.query("UPDATE staff.owner_designation SET active=false WHERE active");
  await database.pool.query("INSERT INTO staff.owner_designation(staff_id) VALUES($1)", [staffId]);
  await database.pool.query(`INSERT INTO staff.privilege_session(privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '2 hours')`, [privilegeId, staffId, userId, sessionId, hash(privilegeId), hash("staff-csrf" + privilegeId)]);
  const ownerRef = (await database.pool.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0].owner_ref as string;
  return { userId, sessionId, staffId, privilegeId, ownerRef };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE task10_runtime LOGIN PASSWORD 'task10-private-fixture-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  const url = new URL(database.connectionString);
  url.username = "task10_runtime";
  url.password = "task10-private-fixture-only";
  runtime = createPool(url.toString());
}, 120000);
afterAll(async () => { await runtime?.end(); await database?.stop(); });

describe("internal funding is explicit database policy, never a staff role effect", () => {
  it("returns no enabled funding policy before explicit sealed selection", async () => {
    const result = await runtime.query("SELECT staff.read_internal_funding_policy() AS policy");
    expect(result.rows[0].policy).toBeNull();
  });

  it("preserves the six-capability persisted Owner context under disabled policy", async () => {
    const actor = await owner();
    const context = (await runtime.query("SELECT staff.read_context($1,$2,$3) AS context", [actor.userId, actor.sessionId, hash(actor.privilegeId)])).rows[0].context;
    expect(context.capabilities).toEqual(coreCapabilities);
    expect((await runtime.query("SELECT staff.authorize_action($1::jsonb,'ALLOWANCE_WRITE') AS allowed", [context])).rows[0].allowed).toBe(false);
    expect((await database.pool.query("SELECT count(*)::int AS count FROM billing.internal_grant")).rows[0].count).toBe(0);
  });

  it("keeps selection, grants and grant events outside direct runtime authority", async () => {
    // Verify the feature exists under its owner first: undefined relations cannot count as ACL denials.
    const relations = (await database.pool.query("SELECT to_regclass('staff.funding_policy_selection') AS selection,to_regclass('billing.internal_grant') AS grant,to_regclass('billing.internal_grant_event') AS event")).rows[0];
    expect(Object.values(relations)).not.toContain(null);
    for (const sql of ["SELECT * FROM staff.funding_policy_selection", "SELECT * FROM billing.internal_grant", "SELECT * FROM billing.internal_grant_event", "DELETE FROM billing.internal_grant", "TRUNCATE billing.internal_grant_event"]) {
      await expect(runtime.query(sql), sql).rejects.toMatchObject({ code: "42501" });
    }
  });
});


const rawPolicy = { enabled: true, funding_policy_version: 1, currency: "USD", maximum_grant_micros: 1200000,
  maximum_day_micros: 100000, maximum_week_micros: 500000, maximum_lifetime_ms: 2678400000, finish_allowance_bp: 10000 };
let published = false;
async function selectFunding() {
  if (!published) {
    const policy = internalAllowancePolicyFromValue(rawPolicy, "test:synthetic-funding");
    if (!policy.enabled) throw new Error("Enabled synthetic policy required");
    const rows = await buildDevelopmentStaffV2DeploymentRegisterPublicationRows(await loadBootstrapRegister(), TEST_DEVELOPMENT_PROVIDER_PANEL, undefined, "local", policy);
    await createPostgresRegisterPublicationPort(database.pool).importHistorical({ registerVersion: parseRegisterVersionText("2"), rows });
    published = true;
  }
  await database.pool.query("INSERT INTO staff.funding_policy_selection(singleton,register_version) VALUES(true,2) ON CONFLICT(singleton) DO UPDATE SET register_version=2");
}
async function fundedActor() {
  await selectFunding();
  const actor = await owner();
  const context = (await runtime.query("SELECT staff.read_context($1,$2,$3) AS context", [actor.userId, actor.sessionId, hash(actor.privilegeId)])).rows[0].context;
  expect(context.capabilities).toEqual([...coreCapabilities, "ALLOWANCE_WRITE"]);
  return { ...actor, context };
}
function configureCommand(actor: Awaited<ReturnType<typeof fundedActor>>, change: Record<string, unknown> = {}) {
  const startsAt = new Date(Date.now() - 1000).toISOString();
  const { durationMs, ...overrides } = change;
  return { ownerRef: actor.ownerRef, expectedRevision: 0, policyRegisterVersion: 2, amountMicros: 1000000, dayMicros: 100000, weekMicros: 500000,
    startsAt, expiresAt: new Date(Date.parse(startsAt) + (typeof durationMs === "number" ? durationMs : 86400000)).toISOString(), fundingApprovalRef: "SYNTHETIC-APPROVAL",
    operationId: randomUUID(), reason: { code: "FUNDING_APPROVAL" }, ...overrides };
}
async function boundProof(actor: Awaited<ReturnType<typeof fundedActor>>, command: ReturnType<typeof configureCommand>, action = "ALLOWANCE_CONFIGURE", grantId?: string) {
  const targetId = action === "ALLOWANCE_CONFIGURE" ? actor.ownerRef : grantId!;
  const reason = { code: "FUNDING_APPROVAL" };
  const body = action === "ALLOWANCE_CONFIGURE" ? { action, target_id: targetId,
    amount_micros: command.amountMicros, day_micros: command.dayMicros, week_micros: command.weekMicros,
    starts_at: command.startsAt, expires_at: command.expiresAt, funding_approval_ref: command.fundingApprovalRef,
    expected_revision: command.expectedRevision, policy_register_version: command.policyRegisterVersion, operation_id: command.operationId, reason }
    : { action, target_id: targetId, owner_ref: actor.ownerRef, expected_revision: command.expectedRevision, policy_register_version: command.policyRegisterVersion, operation_id: command.operationId, reason };
  const binding = { action, targetId, expectedRevision: command.expectedRevision, operationId: command.operationId,
    bodySha256: createHash("sha256").update(typeof command.amountMicros === "number" && !Number.isSafeInteger(command.amountMicros)
      ? JSON.stringify(body) : parseCanonicalRegisterJson(Buffer.from(JSON.stringify(body)))).digest("hex") };
  const proofId = randomUUID();
  await database.pool.query(`INSERT INTO staff.action_proof(proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,account_security_epoch,grant_revision,binding,credential_id,expires_at)
    VALUES($1,$2,$3,$4,$5,0,0,0,$6,'fixture-key',now()+interval '5 minutes')`, [proofId, actor.staffId, actor.userId, actor.sessionId, actor.privilegeId, binding]);
  await authorizeStaffAlertFixture(database.pool, command.operationId);
  const alert = { schema: "staff-alert-v1", event: action === "ALLOWANCE_CONFIGURE" ? "ALLOWANCE_CONFIGURED" : "ALLOWANCE_REVOKED",
    operationId: command.operationId, envelope: { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" } };
  return { proofId, binding, alert };
}
async function configure(actor: Awaited<ReturnType<typeof fundedActor>>, command: ReturnType<typeof configureCommand>, proof?: Awaited<ReturnType<typeof boundProof>>) {
  const bound = proof ?? await boundProof(actor, command);
  return runtime.query("SELECT staff.configure_internal_allowance($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS receipt", [actor.context, bound.proofId, bound.binding, command, bound.alert]);
}

describe("finite reviewed grants and exact action binding", () => {
  it("derives seven capabilities only from persisted Owner plus explicit sealed policy", async () => {
    const actor = await fundedActor();
    const state = (await runtime.query("SELECT staff.read_self_allowance_command($1::jsonb,$2,NULL) AS state", [actor.context, hash(actor.sessionId)])).rows[0].state;
    expect(state).toEqual({ ownerRef: actor.ownerRef, expectedRevision: 0, policyRegisterVersion: 2 });
    expect((await database.pool.query("SELECT capabilities FROM staff.subject WHERE staff_id=$1", [actor.staffId])).rows[0].capabilities).toEqual(coreCapabilities);
    expect((await database.pool.query("SELECT count(*)::int AS count FROM billing.internal_grant")).rows[0].count).toBe(0);
    await database.pool.query("DELETE FROM staff.funding_policy_selection");
    expect((await runtime.query("SELECT staff.read_context($1,$2,$3) AS context", [actor.userId, actor.sessionId, hash(actor.privilegeId)])).rows[0].context.capabilities).toEqual(coreCapabilities);
    expect((await runtime.query("SELECT staff.read_current_context($1::jsonb,$2) AS context", [actor.context, hash(actor.sessionId)])).rows[0].context).toBeNull();
  });

  it("persists finite limits, exact configured event and atomic protected audit/outbox; replay is idempotent", async () => {
    const actor = await fundedActor(), command = configureCommand(actor), proof = await boundProof(actor, command);
    const receipt = (await configure(actor, command, proof)).rows[0].receipt;
    expect(receipt).toMatchObject({ operationId: command.operationId, outcome: "COMPLETED" });
    expect((await configure(actor, command, proof)).rows[0].receipt).toEqual(receipt);
    const grant = (await database.pool.query("SELECT * FROM billing.internal_grant WHERE grant_id=$1", [command.operationId])).rows[0];
    expect(grant).toMatchObject({ owner_ref: actor.ownerRef, amount_micros: "1000000", day_micros: "100000", week_micros: "500000", policy_register_version: "2", revision: "1" });
    expect((await database.pool.query("SELECT event_type,reason_code FROM staff.audit_event WHERE operation_id=$1", [command.operationId])).rows).toEqual([{ event_type: "ALLOWANCE_CONFIGURED", reason_code: "FUNDING_APPROVAL" }]);
    expect((await database.pool.query("SELECT count(*)::int AS count FROM staff.alert_outbox o JOIN staff.audit_event a USING(event_id) WHERE a.operation_id=$1", [command.operationId])).rows[0].count).toBe(1);
    expect((await database.pool.query("SELECT count(*)::int AS count FROM billing.entitlement_event WHERE owner_ref=$1", [actor.ownerRef])).rows[0].count).toBe(0);
    await expect(configure(actor, { ...command, amountMicros: 999999 }, proof)).rejects.toThrow();
  });

  it.each([
    { amountMicros: null }, { amountMicros: 0 }, { amountMicros: -1 }, { amountMicros: 9007199254740992 },
    { dayMicros: 500001 }, { weekMicros: 1000001 }, { amountMicros: 1200001 }, { fundingApprovalRef: "" },
    { durationMs: -1000 },
    { durationMs: 2678400001 }
  ])("refuses invalid grants without consuming proof or appending audit %j", async change => {
    const actor = await fundedActor(), command = configureCommand(actor, change), proof = await boundProof(actor, command);
    await expect(configure(actor, command, proof)).rejects.toThrow();
    expect((await database.pool.query("SELECT consumed_at FROM staff.action_proof WHERE proof_id=$1", [proof.proofId])).rows[0].consumed_at).toBeNull();
    expect((await database.pool.query("SELECT count(*)::int AS count FROM staff.audit_event WHERE operation_id=$1", [command.operationId])).rows[0].count).toBe(0);
  });

  it("rejects changed body, missing readiness, stale lineage and a second active/overlapping grant", async () => {
    const actor = await fundedActor(), command = configureCommand(actor), proof = await boundProof(actor, command);
    await expect(configure(actor, { ...command, dayMicros: 99999 }, proof)).rejects.toThrow("STAFF_PROOF_INVALID");
    await database.pool.query("DELETE FROM staff.alert_operation_readiness WHERE operation_id=$1", [command.operationId]);
    await expect(configure(actor, command, proof)).rejects.toThrow();
    await authorizeStaffAlertFixture(database.pool, command.operationId);
    await configure(actor, command, proof);
    const next = configureCommand(actor), nextProof = await boundProof(actor, next);
    await expect(configure(actor, next, nextProof)).rejects.toThrow();
    const fresh = configureCommand(actor, { expectedRevision: 1 }), freshProof = await boundProof(actor, fresh);
    await expect(configure(actor, fresh, freshProof)).rejects.toThrow("INTERNAL_ALLOWANCE_OVERLAP");
  });

  it("rejects non-Owner, foreign-grant, held ordinary subject and direct delegated funding", async () => {
    const actor = await fundedActor(), command = configureCommand(actor), proof = await boundProof(actor, command);
    await expect(runtime.query("SELECT staff.read_self_allowance_command($1::jsonb,$2,$3) AS state", [actor.context, hash(actor.sessionId), randomUUID()])).rejects.toThrow();
    await database.pool.query("UPDATE staff.owner_designation SET active=false WHERE staff_id=$1", [actor.staffId]);
    await expect(configure(actor, command, proof)).rejects.toThrow();
    await expect(database.pool.query("UPDATE staff.subject SET capabilities=ARRAY['ALLOWANCE_WRITE'] WHERE staff_id=$1", [actor.staffId])).rejects.toMatchObject({ code: "23514" });
    await database.pool.query("UPDATE staff.owner_designation SET active=true WHERE staff_id=$1", [actor.staffId]);
    await database.pool.query("INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,1)", [actor.userId]);
    await expect(configure(actor, command, proof)).rejects.toThrow();
  });

  it("revokes explicitly with lineage advancement and refuses replay changes", async () => {
    const actor = await fundedActor(), command = configureCommand(actor);
    await configure(actor, command);
    const revoke = configureCommand(actor, { expectedRevision: 1 }), proof = await boundProof(actor, revoke, "ALLOWANCE_REVOKE", command.operationId);
    const body = { ownerRef: actor.ownerRef, grantId: command.operationId, expectedRevision: 1, policyRegisterVersion: 2, operationId: revoke.operationId, reason: revoke.reason };
    const call = () => runtime.query("SELECT staff.revoke_internal_allowance($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS receipt", [actor.context, proof.proofId, proof.binding, body, proof.alert]);
    const receipt = (await call()).rows[0].receipt;
    expect((await call()).rows[0].receipt).toEqual(receipt);
    const events = (await database.pool.query("SELECT event_type,revision FROM billing.internal_grant_event WHERE grant_id=$1 ORDER BY revision", [command.operationId])).rows;
    expect(events).toEqual([{ event_type: "CONFIGURED", revision: "1" }, { event_type: "REVOKED", revision: "2" }]);
    expect((await database.pool.query("SELECT revoked_at FROM billing.internal_grant WHERE grant_id=$1", [command.operationId])).rows[0].revoked_at).toBeInstanceOf(Date);
    await expect(database.pool.query("UPDATE billing.internal_grant_event SET revision=9 WHERE grant_id=$1", [command.operationId])).rejects.toThrow();
    await expect(database.pool.query("TRUNCATE billing.internal_grant_event")).rejects.toThrow();
  });
});


it("pins INTERNAL basis once through the repository and refuses revoked, expired or disabled-run fallback", async () => {
  const actor = await fundedActor(), command = configureCommand(actor);
  await configure(actor, command);
  expect(db).toHaveProperty("PostgresInternalAllowanceRepository");
  const Repository = (db as unknown as Record<string, new (...args: unknown[]) => { current(owner: string, now: Date): Promise<unknown>; forRun(run: string, now: Date): Promise<unknown> }>).PostgresInternalAllowanceRepository!;
  const allowances = new Repository(runtime, { registerVersion: 2 });
  const grant = await allowances.current(actor.ownerRef, new Date()) as { grantId: string; grantEventId: string };
  expect(grant).toMatchObject({ grantId: command.operationId, amountMicros: 1000000, dayMicros: 100000, weekMicros: 500000 });
  await seedStaffPrivateObject(database.pool, { userId: actor.userId, ownerRef: actor.ownerRef, ordinarySessionId: actor.sessionId });
  const runId = (await database.pool.query("SELECT run_id FROM core.run_ownership_event WHERE owner_ref=$1 ORDER BY at_seq DESC LIMIT 1", [actor.ownerRef])).rows[0].run_id as string;
  const client = await runtime.connect();
  const repository = new db.EntitlementRepository(runtime);
  const basis = { kind: "INTERNAL", grantId: grant.grantId, grantEventId: grant.grantEventId };
  const admittedAt = new Date();
  try {
    await repository.recordRunChargeScope(client, { runId, ownerRef: actor.ownerRef, basis, admittedAt } as never);
    await repository.recordRunChargeScope(client, { runId, ownerRef: actor.ownerRef, basis, admittedAt } as never);
  } finally { client.release(); }
  expect(repository).toHaveProperty("readRunFundingBasis");
  const read = repository as unknown as { readRunFundingBasis(id: string): Promise<unknown> };
  expect(await read.readRunFundingBasis(runId)).toEqual(basis);
  expect(await allowances.forRun(runId, new Date())).toMatchObject({ grantId: grant.grantId, grantEventId: grant.grantEventId });
  await expect(allowances.forRun(runId, new Date(command.expiresAt))).rejects.toThrow();
  await database.pool.query("DELETE FROM staff.funding_policy_selection");
  await expect(allowances.forRun(runId, new Date())).rejects.toThrow();
  expect(await read.readRunFundingBasis(runId)).toEqual(basis);
  await selectFunding();
  const revoke = configureCommand(actor, { expectedRevision: 1 }), proof = await boundProof(actor, revoke, "ALLOWANCE_REVOKE", command.operationId);
  const body = { ownerRef: actor.ownerRef, grantId: command.operationId, expectedRevision: 1, policyRegisterVersion: 2, operationId: revoke.operationId, reason: revoke.reason };
  await runtime.query("SELECT staff.revoke_internal_allowance($1::jsonb,$2,$3::jsonb,$4::jsonb,$5::jsonb)", [actor.context, proof.proofId, proof.binding, body, proof.alert]);
  await expect(allowances.forRun(runId, new Date())).rejects.toThrow();
  await expect(database.pool.query("UPDATE billing.run_charge_scope SET funding_kind='SUBSCRIPTION' WHERE run_id=$1", [runId])).rejects.toThrow();
  await expect(database.pool.query("TRUNCATE billing.run_charge_scope")).rejects.toThrow();
});

it("severs the account mapping on actual erasure while retaining immutable grant events", async () => {
  const actor = await fundedActor(), command = configureCommand(actor);
  await configure(actor, command);
  const before = (await database.pool.query("SELECT row_to_json(e)::text AS bytes FROM billing.internal_grant_event e WHERE grant_id=$1", [command.operationId])).rows;
  await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [actor.userId]);
  expect((await database.pool.query("SELECT owner_ref FROM billing.internal_grant WHERE grant_id=$1", [command.operationId])).rows[0].owner_ref).toBeNull();
  expect((await database.pool.query("SELECT row_to_json(e)::text AS bytes FROM billing.internal_grant_event e WHERE grant_id=$1", [command.operationId])).rows).toEqual(before);
  await expect(runtime.query("SELECT staff.read_self_allowance_command($1::jsonb,$2,$3)", [actor.context, hash(actor.sessionId), command.operationId])).rejects.toThrow();
});

it("invalidates old proofs and pinned grants after switching to a different valid funded register", async () => {
  const actor = await fundedActor(), command = configureCommand(actor), proof = await boundProof(actor, command);
  const policy = internalAllowancePolicyFromValue(rawPolicy, "test:synthetic-funding");
  if (!policy.enabled) throw Error("Enabled synthetic policy required");
  const rows = await buildDevelopmentStaffV2DeploymentRegisterPublicationRows(await loadBootstrapRegister(), TEST_DEVELOPMENT_PROVIDER_PANEL, undefined, "local", policy);
  await createPostgresRegisterPublicationPort(database.pool).importHistorical({ registerVersion: parseRegisterVersionText("3"), rows });
  await database.pool.query("UPDATE staff.funding_policy_selection SET register_version=3 WHERE singleton");
  await expect(configure(actor, command, proof)).rejects.toThrow("INTERNAL_ALLOWANCE_POLICY_MISMATCH");
  await expect(configure(actor, { ...command, policyRegisterVersion: 3 }, proof)).rejects.toThrow("STAFF_PROOF_INVALID");
  const repository = new db.PostgresInternalAllowanceRepository(runtime, { registerVersion: 2 });
  await expect(repository.readSelfCommand(actor.context, hash(actor.sessionId), null)).rejects.toThrow();
  await expect(repository.readPolicy()).rejects.toThrow();
  await selectFunding();
  await configure(actor, command, proof);
  await database.pool.query("UPDATE staff.funding_policy_selection SET register_version=3 WHERE singleton");
  await expect(repository.current(actor.ownerRef, new Date())).rejects.toThrow("INTERNAL_FUNDING_POLICY_MISMATCH");
  await selectFunding();
});

it("serializes concurrent configure operations into exactly one active grant and audit", async () => {
  const actor = await fundedActor(), one = configureCommand(actor), two = configureCommand(actor);
  const first = await boundProof(actor, one), second = await boundProof(actor, two);
  const results = await Promise.allSettled([configure(actor, one, first), configure(actor, two, second)]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  expect((await database.pool.query("SELECT count(*)::int AS count FROM billing.internal_grant WHERE owner_ref=$1 AND revoked_at IS NULL", [actor.ownerRef])).rows[0].count).toBe(1);
  expect((await database.pool.query("SELECT count(*)::int AS count FROM staff.audit_event WHERE operation_id=ANY($1::uuid[])", [[one.operationId,two.operationId]])).rows[0].count).toBe(1);
});
