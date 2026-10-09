import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApi } from "@debateai/api";
import type { ReadableUserDekStore } from "@debateai/crypto";
import type { Pool } from "@debateai/db";
import type { ActionBinding, StaffContext } from "@debateai/kernel";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, internalAllowancePolicyFromValue, STAFF_ACCESS_POLICY_REGISTER_ROW } from "@debateai/register";
import { createStaffRuntime } from "../../apps/api/src/staff/runtime.js";
import type { StaffHttpApplication } from "../../apps/api/src/staff/routes.js";
import { syntheticAlertFiles } from "../support/ownerRecoveryCustody.js";
import { staffHttpAskApplication } from "../support/staffHttpApplication.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

// Boot needs only the static, security-meaningful facts. A stale ACK proof or readiness
// publication starts Team tools LOCKED; every staff action re-checks readiness per request.
const origin = "https://admin.example.test";
const keyRef = "33333333-3333-4333-8333-333333333333";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

const fundingValue = { enabled: true, funding_policy_version: 1, currency: "USD", maximum_grant_micros: 1200000,
  maximum_day_micros: 100000, maximum_week_micros: 500000, maximum_lifetime_ms: 2678400000, finish_allowance_bp: 10000 };
const fundingPolicy = internalAllowancePolicyFromValue(fundingValue, "test:staff-boot-funding");
if (!fundingPolicy.enabled) throw Error("Enabled synthetic funding policy required");
const fundedStaffValue = { ...(STAFF_ACCESS_POLICY_REGISTER_ROW.value as Record<string, unknown>), funding_policy_version: 1,
  active_capabilities: [...(STAFF_ACCESS_POLICY_REGISTER_ROW.value as { active_capabilities: string[] }).active_capabilities, "ALLOWANCE_WRITE"] };
type DatabaseState = { installation: unknown; published: boolean; authorized: string[]; funded: boolean };
/** Enumerated SQL answers only; any unknown statement returns no row and fails closed. */
function database(state: DatabaseState): Pool {
  const answer = (sql: string, params: readonly unknown[]): unknown[] => {
    if (sql.includes("register.register_row")) return params[0] === 2 ? [{ row_key: "staffAccessPolicy", value_json: state.funded ? fundedStaffValue : STAFF_ACCESS_POLICY_REGISTER_ROW.value,
      source_ref: STAFF_ACCESS_POLICY_REGISTER_ROW.sourceRef, sealed: true, declared_row_count: 1, actual_row_count: "1" }] : [];
    if (sql.includes("staff.read_internal_funding_policy")) return [{ value: state.funded ? { registerVersion: 2, policy: fundingValue, sourceRef: fundingPolicy.sourceRef } : null }];
    if (sql.includes("staff.read_owner_recovery_installation")) return [{ value: state.installation }];
    if (sql.includes("staff.read_independent_alert_readiness")) return [{ value: state.published ? "READY" : "UNAVAILABLE" }];
    if (sql.includes("staff.authorize_alert_operation")) { if (state.published) state.authorized.push(String(params[0])); return [{ value: state.published }]; }
    if (sql.includes("staff.read_alert_user_mapping")) return [{ value: { userId: params[0], keyRef } }];
    return [];
  };
  const query = async (sql: string, params: readonly unknown[] = []) => ({ rows: answer(sql, params) });
  return { query, connect: async () => ({ query, release: () => undefined }) } as unknown as Pool;
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "staff-boot-locked-")));
  roots.push(root);
  const configPath = join(root, "alert.json"), executable = join(root, "capture-sendmail"), ackState = join(root, "ack-state"), operatorPath = join(root, "operator.mjs");
  await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await writeFile(configPath, JSON.stringify({ schema: "staff-independent-alert-config-v1", generation: randomUUID(), executable,
    from: "noreply@example.test", recipient: "independent@example.test", ackAdapterId: "capture" }), { mode: 0o600 });
  await writeFile(ackState, "STALE", { mode: 0o600 });
  const operatorSource = `import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';export function createStaffAlertOperatorAdapters(){return {schema:'staff-alert-operator-v1',acknowledgements:new Map([['capture',{evidence:async config=>{if(await readFile(${JSON.stringify(ackState)},'utf8')!=='FRESH')return null;return {configSha256:createHash('sha256').update(await readFile(${JSON.stringify(configPath)})).digest('hex'),generation:config.generation,rehearsalId:${JSON.stringify(randomUUID())},expiresAt:new Date(Date.now()+60000)};},acknowledge:async()=> 'ACK'}]]),invitationDelivery:{send:async()=> 'ACK'},dispatch:{batchSize:1,intervalMs:100}};}`;
  await writeFile(operatorPath, operatorSource, { mode: 0o600 });
  const state: DatabaseState = { installation: { operationId: randomUUID(), outcome: "COMPLETED", recordedAt: new Date().toISOString() }, published: false, authorized: [], funded: false };
  const deks = new Map<string, Buffer>();
  const keys = { load: async (userId: string) => { const key = deks.get(userId) ?? Buffer.alloc(32, 9); deks.set(userId, key); return Buffer.from(key); },
    store: async () => undefined, exists: async () => true, destroy: async () => "ALREADY_ABSENT" } as unknown as ReadableUserDekStore;
  const lines: string[] = [];
  const activation = {
    environment: { policyVersion: 2 as const, origin, rpId: "admin.example.test", independentAlertConfigPath: configPath, operatorModulePath: operatorPath,
      operatorModuleSha256: createHash("sha256").update(operatorSource).digest("hex") },
    registerVersion: 2, publicAppUrl: origin, pool: database(state), keys,
    operatorFiles: syntheticAlertFiles(root), configurationFiles: syntheticAlertFiles(root), logEvent: (line: string) => { lines.push(line); }
  };
  const unlock = async () => { await writeFile(ackState, "FRESH"); state.published = true; };
  return { root, configPath, ackState, state, activation, lines, unlock };
}

describe("staff runtime boot without fresh alert readiness", () => {
  it("starts locked without a fresh ACK proof and logs one secret-free tools_locked line", async () => {
    const f = await fixture();
    const runtime = await createStaffRuntime(f.activation);
    try {
      expect(f.lines).toEqual([JSON.stringify({ event: "api.staff.tools_locked", reason: "ACK_EVIDENCE_STALE" })]);
      expect(await runtime.readiness.readIndependentAlertReadiness()).toBe("UNAVAILABLE");
    } finally { await runtime.close(); }
  });

  it("starts locked when the ACK proof is fresh but the readiness publication is stale", async () => {
    const f = await fixture();
    await writeFile(f.ackState, "FRESH");
    const runtime = await createStaffRuntime(f.activation);
    try {
      expect(f.lines).toEqual([JSON.stringify({ event: "api.staff.tools_locked", reason: "READINESS_STALE" })]);
    } finally { await runtime.close(); }
  });

  it("starts unlocked and logs nothing when ACK proof and publication are both fresh", async () => {
    const f = await fixture();
    await f.unlock();
    const runtime = await createStaffRuntime(f.activation);
    try {
      expect(f.lines).toEqual([]);
      expect(await runtime.readiness.readIndependentAlertReadiness()).toBe("READY");
    } finally { await runtime.close(); }
  });

  it("still refuses boot on operator hash mismatch, broken config custody, invalid policy or incomplete owner installation", async () => {
    const mismatch = await fixture();
    await expect(createStaffRuntime({ ...mismatch.activation, environment: { ...mismatch.activation.environment, operatorModuleSha256: "0".repeat(64) } }))
      .rejects.toThrow("STAFF_ACTIVATION_UNAVAILABLE");
    const writable = await fixture();
    await chmod(writable.configPath, 0o666);
    await expect(createStaffRuntime(writable.activation)).rejects.toThrow("STAFF_ACTIVATION_UNAVAILABLE");
    const missing = await fixture();
    await rm(missing.configPath);
    await expect(createStaffRuntime(missing.activation)).rejects.toThrow("STAFF_ACTIVATION_UNAVAILABLE");
    const policy = await fixture();
    await expect(createStaffRuntime({ ...policy.activation, registerVersion: 9999 })).rejects.toMatchObject({ code: "STAFF_ACCESS_POLICY_UNRESOLVED" });
    for (const installation of [null, { operationId: randomUUID(), outcome: "PENDING", recordedAt: new Date().toISOString() }]) {
      const owner = await fixture();
      owner.state.installation = installation;
      await expect(createStaffRuntime(owner.activation)).rejects.toThrow("STAFF_ACTIVATION_UNAVAILABLE");
    }
    // Refusals stay refusals even when ACK proof and publication are fresh.
    const fresh = await fixture();
    await fresh.unlock();
    fresh.state.installation = null;
    await expect(createStaffRuntime(fresh.activation)).rejects.toThrow("STAFF_ACTIVATION_UNAVAILABLE");
    for (const f of [mismatch, writable, missing, policy, fresh]) expect(f.lines).toEqual([]);
  });

  it("with internal funding selected, boot checks static funding facts but not fresh evidence", async () => {
    const funded = (f: Awaited<ReturnType<typeof fixture>>, deploymentMode: "hosted" | "local") => {
      f.state.funded = true;
      return { ...f.activation, environment: { ...f.activation.environment, internalAllowancePolicy: fundingPolicy }, deploymentMode,
        billingPlans: billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test:staff-boot-billing"),
        providerTargets: [{ providerRef: "fixture-provider", maker: "fixture-maker", baseUrl: "https://provider.example.test/v1", model: "fixture-model",
          inputPriceMicrosPerMillionTokens: 1, outputPriceMicrosPerMillionTokens: 1 }] };
    };
    const hosted = await fixture();
    const runtime = await createStaffRuntime(funded(hosted, "hosted"));
    try {
      expect(hosted.lines).toEqual([JSON.stringify({ event: "api.staff.tools_locked", reason: "ACK_EVIDENCE_STALE" })]);
      await expect(runtime.funding!.requireReady()).rejects.toMatchObject({ code: "STAFF_ALERT_UNAVAILABLE" });
      await hosted.unlock();
      await expect(runtime.funding!.requireReady()).resolves.toBeUndefined();
    } finally { await runtime.close(); }
    const local = await fixture();
    await expect(createStaffRuntime(funded(local, "local"))).rejects.toThrow("STAFF_UNAVAILABLE");
    expect(local.lines).toEqual([]);
  });
});

const targetUser = "44444444-4444-4444-8444-444444444444", targetStaff = "55555555-5555-4555-8555-555555555555", actorStaff = "66666666-6666-4666-8666-666666666666";
async function lockedHttp() {
  const f = await fixture();
  const runtime = await createStaffRuntime(f.activation);
  const account = testHttpIdentity("staff-boot-locked"), staffToken = Buffer.alloc(32, 1).toString("base64url"), csrf = Buffer.alloc(32, 2).toString("base64url");
  const context: StaffContext = { staffId: actorStaff, userId: account.authenticated.userId, ordinarySessionId: account.authenticated.session.session_id,
    privilegeSessionId: randomUUID(), designation: "OWNER", securityEpoch: 0, accountSecurityEpoch: 0, grantRevision: 0,
    capabilities: ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE"] };
  const authentication = { context, baseSession: account.authenticated, csrfTokenHash: "sha256:" + "a".repeat(64), expiresAt: new Date(Date.now() + 60000) };
  const access = {
    authenticate: async () => authentication, verifyCsrf: async (_auth: unknown, supplied: string) => supplied === csrf,
    assertCurrent: async () => undefined, requireCapability: async () => undefined,
    readActionProof: async (_auth: unknown, _handle: string, binding: ActionBinding) => ({ proofId: randomUUID(), context, binding, credentialId: "aA", verifiedAt: new Date(), expiresAt: new Date(Date.now() + 60000) }),
    readInvitationContext: async () => null, readOwnerPossessionContext: async () => null, registerPrivilegedConnection: () => () => undefined
  };
  const writes: Array<{ kind: string; operationId: string; event: string }> = [];
  const receipt = (operationId: string) => ({ operationId, outcome: "COMPLETED", recordedAt: new Date() });
  const repository = {
    readMutationTarget: async () => targetUser,
    invite: async (input: { operationId: string; alertIntent: { event: string } }) => { writes.push({ kind: "invite", operationId: input.operationId, event: input.alertIntent.event }); return receipt(input.operationId); },
    grant: async (input: { operationId: string; alertIntent: { event: string } }) => { writes.push({ kind: "grant", operationId: input.operationId, event: input.alertIntent.event }); return receipt(input.operationId); },
    disable: async (input: { operationId: string; alertIntent: { event: string } }) => { writes.push({ kind: "disable", operationId: input.operationId, event: input.alertIntent.event }); return receipt(input.operationId); },
    readIssuedInvitation: async () => ({ invitationId: randomUUID(), expiresAt: new Date(Date.now() + 86400000) })
  };
  const sessions = testSessionApplication([account]);
  const staff = { access, sessions, repository, webauthn: {}, intents: runtime.intents, targetInvitationTransport: runtime.targetInvitationTransport } as unknown as StaffHttpApplication;
  const api = buildApi({ application: staffHttpAskApplication(), sessions, allowedOrigin: TEST_APP_ORIGIN, staffPolicyVersion: 2, staffAccess: access as never, staff });
  const base = testSessionHeaders(account, true);
  const headers = { ...base, cookie: `${base.cookie}; __Host-debateai-staff=${staffToken}; __Host-debateai-staff-csrf=${csrf}`, "x-staff-csrf-token": csrf };
  const mutation = { expected_revision: 0, proof_handle: "b".repeat(43) };
  const invite = (operation_id = randomUUID()) => api.inject({ method: "POST", url: "/v1/admin/team/invitations", headers,
    payload: { target_user_id: targetUser, capabilities: ["TEAM_READ"], operation_id, reason: { code: "TEAM_ONBOARDING" }, ...mutation } });
  const grant = (operation_id = randomUUID()) => api.inject({ method: "PATCH", url: `/v1/admin/team/${targetStaff}/grants`, headers,
    payload: { capabilities: ["TEAM_READ", "AUDIT_READ"], operation_id, reason: { code: "GRANT_CHANGE" }, ...mutation } });
  const disable = (operation_id = randomUUID()) => api.inject({ method: "POST", url: `/v1/admin/team/${targetStaff}/disable`, headers,
    payload: { mode: "COMPROMISE", operation_id, reason: { code: "SECURITY_RESPONSE" }, ...mutation } });
  const close = async () => { await api.close(); await runtime.close(); };
  return { f, writes, invite, grant, disable, close };
}

describe("locked Team tools at request time", () => {
  it("refuses invite and grant with the typed alert refusal and writes no record or alert", async () => {
    const h = await lockedHttp();
    try {
      for (const response of [await h.invite(), await h.grant()]) {
        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({ error: "STAFF_ALERT_UNAVAILABLE" });
      }
      expect(h.writes).toEqual([]);
      expect(h.f.state.authorized).toEqual([]);
    } finally { await h.close(); }
  });

  it("unlocks without an API restart once the operator makes readiness fresh", async () => {
    const h = await lockedHttp();
    try {
      expect((await h.invite()).statusCode).toBe(503);
      await h.f.unlock();
      const inviteId = randomUUID(), grantId = randomUUID();
      const invited = await h.invite(inviteId);
      expect(invited.statusCode).toBe(200);
      expect(invited.json()).toMatchObject({ receipt: { operation_id: inviteId, outcome: "COMPLETED" } });
      expect((await h.grant(grantId)).statusCode).toBe(200);
      expect(h.writes).toEqual([{ kind: "invite", operationId: inviteId, event: "INVITE" }, { kind: "grant", operationId: grantId, event: "GRANT" }]);
      expect(h.f.state.authorized).toEqual([inviteId, grantId]);
      // The operator window ends: the next action is locked again, still without a restart.
      h.f.state.published = false;
      expect((await h.grant()).json()).toEqual({ error: "STAFF_ALERT_UNAVAILABLE" });
      expect(h.writes).toHaveLength(2);
    } finally { await h.close(); }
  });

  it("keeps containment available while locked: disable is recorded with its alert queued", async () => {
    const h = await lockedHttp();
    try {
      const disableId = randomUUID();
      const disabled = await h.disable(disableId);
      expect(disabled.statusCode).toBe(200);
      expect(h.writes).toEqual([{ kind: "disable", operationId: disableId, event: "DISABLE" }]);
    } finally { await h.close(); }
  });
});
