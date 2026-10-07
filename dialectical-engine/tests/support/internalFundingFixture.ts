import { createHash, randomUUID } from "node:crypto";
import { expect } from "vitest";
import { buildDevelopmentStaffV2DeploymentRegisterPublicationRows } from "../../apps/runner/src/dev-deployment-register.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "./developmentProviderPanel.js";
import { authorizeStaffAlertFixture } from "./staffAlertReadiness.js";
import { createPostgresRegisterPublicationPort, internalAllowancePolicyFromValue, loadBootstrapRegister, parseCanonicalRegisterJson, parseRegisterVersionText } from "@debateai/register";
import { RunRepository, type Pool } from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "./discoveredPanel.js";
export const TASK11_POLICY = internalAllowancePolicyFromValue({enabled:true,funding_policy_version:1,currency:"USD",maximum_grant_micros:1200000,maximum_day_micros:100000,maximum_week_micros:500000,maximum_lifetime_ms:2678400000,finish_allowance_bp:10000},"test:synthetic-funding");
export function internalFundingFixture(pool: Pool, runtime: Pool) {
 const database={pool};
 const rawPolicy={enabled:true,funding_policy_version:1,currency:"USD",maximum_grant_micros:1200000,maximum_day_micros:100000,maximum_week_micros:500000,maximum_lifetime_ms:2678400000,finish_allowance_bp:10000};
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

 async function revoke(actor: Awaited<ReturnType<typeof fundedActor>>, grantId:string, expectedRevision=1) {
  const command=configureCommand(actor,{expectedRevision}),proof=await boundProof(actor,command,"ALLOWANCE_REVOKE",grantId);
  return runtime.query("SELECT staff.revoke_internal_allowance($1::jsonb,$2,$3::jsonb,$4::jsonb,$5::jsonb)",[actor.context,proof.proofId,proof.binding,{ownerRef:actor.ownerRef,grantId,expectedRevision,policyRegisterVersion:2,operationId:command.operationId,reason:command.reason},proof.alert]);
 }
 async function run(ownerRef:string, planTier:"free"|"premium"="premium") {
  const runId=await new RunRepository(pool).startRun({questionLine:"Can finite internal funding admit this fake provider?", principal:{kind:"legacy",legacyAskerId:`task11:${randomUUID()}`},sessionId:randomUUID(),callerScope:"ASKER",asOf:new Date(),askerRiskTier:"casual",effectiveRiskTier:"casual",tierSource:"ASKER",tierProvenanceRef:"asker:test",compositionBudgetTier:"low",planTier,depthParams:{depth:1},discoveredPanel:fixtureDiscoveredPanel(2),strangerSampleRate:0,envelopeBasis:fixtureStructuralCeiling(4),registerVersion:2,batteryVersion:"test",askContract:{},batteryRows:[]});
  await pool.query("SELECT core.append_run_ownership_event($1,$2)",[runId,ownerRef]);return runId;
 }
 return {fundedActor,configureCommand,configure,revoke,run,selectFunding};
}
