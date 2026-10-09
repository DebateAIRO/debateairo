import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
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
const enabledFundingPolicy = fundingPolicy;
const fundedStaffValue = { ...(STAFF_ACCESS_POLICY_REGISTER_ROW.value as Record<string, unknown>), funding_policy_version: 1,
  active_capabilities: [...(STAFF_ACCESS_POLICY_REGISTER_ROW.value as { active_capabilities: string[] }).active_capabilities, "ALLOWANCE_WRITE"] };
type DatabaseState = { installation: unknown; published: boolean; authorized: string[]; funded: boolean;
  /** Fake alert outbox: every claim spends one attempt, as staff.claim_alert_delivery does. */
  outbox: Array<Record<string, unknown>>; keyUsers: Map<string, string>; claimCalls: number; attempts: number; receipts: Array<{ outcome: unknown; failure: unknown }>;
  /** Replaces the readiness read: a thrown database fault or an unexpected answer. */
  readinessFault?: () => unknown[] };
/** Enumerated SQL answers only; any unknown statement returns no row and fails closed. */
function database(state: DatabaseState): Pool {
  const answer = (sql: string, params: readonly unknown[]): unknown[] => {
    if (sql.includes("register.register_row")) return params[0] === 2 ? [{ row_key: "staffAccessPolicy", value_json: state.funded ? fundedStaffValue : STAFF_ACCESS_POLICY_REGISTER_ROW.value,
      source_ref: STAFF_ACCESS_POLICY_REGISTER_ROW.sourceRef, sealed: true, declared_row_count: 1, actual_row_count: "1" }] : [];
    if (sql.includes("staff.read_internal_funding_policy")) return [{ value: state.funded ? { registerVersion: 2, policy: fundingValue, sourceRef: fundingPolicy.sourceRef } : null }];
    if (sql.includes("staff.read_owner_recovery_installation")) return [{ value: state.installation }];
    if (sql.includes("staff.read_independent_alert_readiness")) return state.readinessFault?.() ?? [{ value: state.published ? "READY" : "UNAVAILABLE" }];
    if (sql.includes("staff.authorize_alert_operation")) { if (state.published) state.authorized.push(String(params[0])); return [{ value: state.published }]; }
    if (sql.includes("staff.read_alert_user_mapping")) return [{ value: { userId: params[0], keyRef } }];
    if (sql.includes("staff.claim_alert_delivery")) {
      state.claimCalls++;
      const row = state.outbox.shift();
      if (row === undefined) return [{ value: [] }];
      state.attempts++;
      return [{ value: [{ ...row, claimToken: randomUUID(), attempt: state.attempts }] }];
    }
    if (sql.includes("staff.read_alert_key_mapping")) return [{ value: { state: "CURRENT", mapping: { userId: state.keyUsers.get(String(params[0])), keyRef } } }];
    if (sql.includes("staff.settle_alert_delivery")) { state.receipts.push({ outcome: params[2], failure: params[3] }); return [{ value: true }]; }
    if (sql.includes("staff.read_alert_delivery_status")) return [{ value: { pending: state.outbox.length, acked: 0, severed: 0, exhausted: 0 } }];
    return [];
  };
  const query = async (sql: string, params: readonly unknown[] = []) => ({ rows: answer(sql, params) });
  return { query, connect: async () => ({ query, release: () => undefined }) } as unknown as Pool;
}
/** Queue a sealed alert intent exactly as the outbox would hand it to the dispatcher. */
function enqueue(state: DatabaseState, intent: { event: string; operationId: string; envelope: unknown }, keyUserId: string): void {
  const outboxId = randomUUID();
  state.keyUsers.set(outboxId, keyUserId);
  state.outbox.push({ outboxId, eventId: randomUUID(), operationId: intent.operationId, event: intent.event, purpose: "INDEPENDENT_METADATA_ALERT", keyRef, envelope: intent.envelope });
}
async function until(done: () => boolean, ms = 3000): Promise<void> {
  for (const deadline = Date.now() + ms; !done(); await new Promise(r => setTimeout(r, 20))) if (Date.now() > deadline) throw Error("TIMED_OUT");
}
/** Internal funding selected: hosted USD billing, one priced target, the sealed funding policy. */
const fundedActivation = (f: Awaited<ReturnType<typeof fixture>>, deploymentMode: "hosted" | "local") => {
  f.state.funded = true;
  return { ...f.activation, environment: { ...f.activation.environment, internalAllowancePolicy: enabledFundingPolicy }, deploymentMode,
    billingPlans: billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test:staff-boot-billing"),
    providerTargets: [{ providerRef: "fixture-provider", maker: "fixture-maker", baseUrl: "https://provider.example.test/v1", model: "fixture-model",
      inputPriceMicrosPerMillionTokens: 1, outputPriceMicrosPerMillionTokens: 1 }] };
};
const lockedLine = (reason: string) => JSON.stringify({ event: "api.staff.tools_locked", reason });
const waitingLine = JSON.stringify({ event: "api.staff.alerts_waiting", reason: "READINESS_STALE" });

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "staff-boot-locked-")));
  roots.push(root);
  const configPath = join(root, "alert.json"), executable = join(root, "capture-sendmail"), ackState = join(root, "ack-state"), operatorPath = join(root, "operator.mjs");
  // The submitted independent alert mail lands in `sent` (real spawn, no shell interpolation of data).
  const sent = join(root, "sent.eml");
  await writeFile(executable, `#!/bin/sh\ncat > '${sent}'\n`, { mode: 0o700 });
  await writeFile(configPath, JSON.stringify({ schema: "staff-independent-alert-config-v1", generation: randomUUID(), executable,
    from: "noreply@example.test", recipient: "independent@example.test", ackAdapterId: "capture" }), { mode: 0o600 });
  await writeFile(ackState, "STALE", { mode: 0o600 });
  const operatorSource = `import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';export function createStaffAlertOperatorAdapters(){return {schema:'staff-alert-operator-v1',acknowledgements:new Map([['capture',{evidence:async config=>{if(await readFile(${JSON.stringify(ackState)},'utf8')!=='FRESH')return null;return {configSha256:createHash('sha256').update(await readFile(${JSON.stringify(configPath)})).digest('hex'),generation:config.generation,rehearsalId:${JSON.stringify(randomUUID())},expiresAt:new Date(Date.now()+60000)};},acknowledge:async()=> 'ACK'}]]),invitationDelivery:{send:async()=> 'ACK'},dispatch:{batchSize:1,intervalMs:100}};}`;
  await writeFile(operatorPath, operatorSource, { mode: 0o600 });
  const state: DatabaseState = { installation: { operationId: randomUUID(), outcome: "COMPLETED", recordedAt: new Date().toISOString() }, published: false, authorized: [], funded: false,
    outbox: [], keyUsers: new Map(), claimCalls: 0, attempts: 0, receipts: [] };
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
  return { root, configPath, ackState, sent, state, activation, lines, unlock };
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

  it("refuses boot with a distinct reason when the readiness read itself faults, instead of starting locked", async () => {
    const faults: Array<() => unknown[]> = [
      () => { throw Object.assign(new Error("permission denied for function read_independent_alert_readiness"), { code: "42501" }); },
      () => { throw Object.assign(new Error("function staff.read_independent_alert_readiness(text, uuid) does not exist"), { code: "42883" }); },
      () => [],
      () => [{ value: "MAYBE" }]
    ];
    // Probed whether or not the ACK proof is fresh, so a stale proof cannot hide a database fault.
    for (const ackFresh of [true, false]) for (const fault of faults) {
      const f = await fixture();
      if (ackFresh) await writeFile(f.ackState, "FRESH");
      f.state.readinessFault = fault;
      await expect(createStaffRuntime(f.activation)).rejects.toThrow("STAFF_ACTIVATION_UNAVAILABLE");
      expect(f.lines).toEqual([JSON.stringify({ event: "api.staff.activation_refused", reason: "READINESS_UNREADABLE" })]);
    }
    // Control: the specific "not ready" answer still starts locked.
    for (const [ackFresh, reason] of [[true, "READINESS_STALE"], [false, "ACK_EVIDENCE_STALE"]] as const) {
      const stale = await fixture();
      if (ackFresh) await writeFile(stale.ackState, "FRESH");
      stale.state.readinessFault = () => [{ value: "UNAVAILABLE" }];
      const runtime = await createStaffRuntime(stale.activation);
      try { expect(stale.lines).toEqual([lockedLine(reason)]); } finally { await runtime.close(); }
    }
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
    const funded = fundedActivation;
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

  it("start() while locked claims nothing, so a queued alert keeps all three attempts and goes out after unlock", async () => {
    const f = await fixture();
    const runtime = await createStaffRuntime(f.activation);
    try {
      const operationId = randomUUID();
      enqueue(f.state, await runtime.intents.mutation({ event: "DISABLE", operationId, keyUserId: targetUser, actorStaffId: null, subjectStaffId: null,
        reason: { code: "SECURITY_RESPONSE" } }), targetUser);
      runtime.start();
      await new Promise(r => setTimeout(r, 350)); // the immediate boot drain plus three 100 ms dispatch ticks
      expect(f.state.claimCalls).toBe(0);
      expect(f.state.attempts).toBe(0);
      expect(f.state.receipts).toEqual([]);
      expect(f.lines).toEqual([lockedLine("ACK_EVIDENCE_STALE"), waitingLine]);
      await f.unlock();
      await until(() => f.state.receipts.length > 0);
      expect(f.state.receipts).toEqual([{ outcome: "DELIVERED", failure: null }]);
      expect(f.state.attempts).toBe(1);
      const mail = await readFile(f.sent, "utf8");
      expect(mail).toContain('"event":"DISABLE"');
      expect(mail).toContain(operationId);
    } finally { await runtime.close(); }
  });
});

const targetUser = "44444444-4444-4444-8444-444444444444", targetStaff = "55555555-5555-4555-8555-555555555555", actorStaff = "66666666-6666-4666-8666-666666666666";
async function lockedHttp(options: Readonly<{ funded?: boolean }> = {}) {
  const f = await fixture();
  const runtime = await createStaffRuntime(options.funded ? fundedActivation(f, "hosted") : f.activation);
  const account = testHttpIdentity("staff-boot-locked"), staffToken = Buffer.alloc(32, 1).toString("base64url"), csrf = Buffer.alloc(32, 2).toString("base64url");
  const context: StaffContext = { staffId: actorStaff, userId: account.authenticated.userId, ordinarySessionId: account.authenticated.session.session_id,
    privilegeSessionId: randomUUID(), designation: "OWNER", securityEpoch: 0, accountSecurityEpoch: 0, grantRevision: 0,
    capabilities: ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE", ...(options.funded ? ["ALLOWANCE_WRITE" as const] : [])] };
  const authentication = { context, baseSession: account.authenticated, csrfTokenHash: "sha256:" + "a".repeat(64), expiresAt: new Date(Date.now() + 60000) };
  const invitation = { invitationId: randomUUID(), targetUserId: account.authenticated.userId, ordinarySessionId: account.authenticated.session.session_id,
    issuerStaffId: actorStaff, issuerSecurityEpoch: 0, targetAccountSecurityEpoch: 0, invitationRevision: 0, expiresAt: new Date(Date.now() + 86400000) };
  const access = {
    authenticate: async () => authentication, verifyCsrf: async (_auth: unknown, supplied: string) => supplied === csrf,
    assertCurrent: async () => undefined, requireCapability: async () => undefined,
    readActionProof: async (_auth: unknown, _handle: string, binding: ActionBinding) => ({ proofId: randomUUID(), context, binding, credentialId: "aA", verifiedAt: new Date(), expiresAt: new Date(Date.now() + 60000) }),
    readInvitationContext: async () => invitation, readOwnerPossessionContext: async () => null, registerPrivilegedConnection: () => () => undefined
  };
  // Every key ceremony entry point is recorded; a recorded ceremony means a challenge was (or would be) issued.
  const ceremonies: string[] = [];
  const ceremony = (name: string) => async () => { ceremonies.push(name); throw Error("FAKE_CEREMONY"); };
  const webauthn = Object.fromEntries(["beginAction", "finishAction", "beginRegistration", "finishRegistration", "beginInvitationAcceptance", "finishInvitationAcceptance"]
    .map(name => [name, ceremony(name)]));
  const writes: Array<{ kind: string; operationId: string; event: string }> = [];
  const alertIntents: Array<{ event: string; operationId: string; envelope: unknown }> = [];
  const receipt = (operationId: string) => ({ operationId, outcome: "COMPLETED", recordedAt: new Date() });
  // Simulates the guarded SQL refusing the write at COMMIT (e.g. readiness lapsed after the request-time checks).
  let commitFault: (() => Error) | undefined;
  const failCommit = (fault: (() => Error) | undefined) => { commitFault = fault; };
  const repository = {
    readMutationTarget: async () => targetUser,
    invite: async (input: { operationId: string; alertIntent: { event: string } }) => { writes.push({ kind: "invite", operationId: input.operationId, event: input.alertIntent.event }); return receipt(input.operationId); },
    grant: async (input: { operationId: string; alertIntent: { event: string } }) => { if (commitFault) throw commitFault(); writes.push({ kind: "grant", operationId: input.operationId, event: input.alertIntent.event }); return receipt(input.operationId); },
    disable: async (input: { operationId: string; alertIntent: { event: string; operationId: string; envelope: unknown } }) => {
      writes.push({ kind: "disable", operationId: input.operationId, event: input.alertIntent.event }); alertIntents.push(input.alertIntent); return receipt(input.operationId); },
    readIssuedInvitation: async () => ({ invitationId: randomUUID(), expiresAt: new Date(Date.now() + 86400000) }),
    readInvitationProof: async () => ({ proofId: randomUUID(), purpose: "INVITATION_ACCEPT", context: invitation, credentialId: "aA", verifiedAt: new Date(), expiresAt: new Date(Date.now() + 60000) }),
    accept: async (input: { operationId: string; alertIntent: { event: string } }) => { writes.push({ kind: "accept", operationId: input.operationId, event: input.alertIntent.event }); return receipt(input.operationId); }
  };
  // Real readiness (runtime.funding) in front of fake allowance writes.
  const funding = options.funded ? { requireReady: () => runtime.funding!.requireReady(), allowances: {
    readSelfCommand: async () => ({ ownerRef: account.authenticated.ownerRef, expectedRevision: 0, policyRegisterVersion: 2 }),
    configure: async (input: { operationId: string; alertIntent: { event: string } }) => { writes.push({ kind: "allowance-configure", operationId: input.operationId, event: input.alertIntent.event }); return receipt(input.operationId); },
    revoke: async (input: { operationId: string; alertIntent: { event: string } }) => { writes.push({ kind: "allowance-revoke", operationId: input.operationId, event: input.alertIntent.event }); return receipt(input.operationId); }
  } } : undefined;
  const sessions = testSessionApplication([account]);
  // Mirrors main.ts: the runtime's readiness, intents and invitation transport.
  const staff = { access, sessions, repository, webauthn, readiness: runtime.readiness, intents: runtime.intents, targetInvitationTransport: runtime.targetInvitationTransport,
    ...(funding === undefined ? {} : { funding }) } as unknown as StaffHttpApplication;
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
  const handle = (fill: string) => fill.repeat(43);
  const authCredential = { id: "aA", rawId: "aA", type: "public-key", response: { clientDataJSON: "YQ", authenticatorData: "YQ", signature: "YQ", userHandle: null }, clientExtensionResults: {} };
  const registrationCredential = { id: "aA", rawId: "aA", type: "public-key", response: { clientDataJSON: "YQ", attestationObject: "YQ" }, clientExtensionResults: {} };
  const post = (url: string, payload: unknown, method: "POST" | "DELETE" = "POST") => api.inject({ method, url, headers, payload: payload as Record<string, unknown> });
  const actionOptions = (intent: unknown) => post("/v1/admin/webauthn/action/options", { intent });
  const actionVerify = (intent: unknown) => post("/v1/admin/webauthn/action/verify", { intent, challenge_handle: handle("a"), credential: authCredential });
  const acceptOptions = () => post("/v1/admin/team/invitations/accept/options", { invitation_handle: handle("c") });
  const acceptVerify = () => post("/v1/admin/team/invitations/accept/verify", { invitation_handle: handle("c"), challenge_handle: handle("a"), credential: authCredential });
  const accept = (operation_id = randomUUID()) => post("/v1/admin/team/invitations/accept", { invitation_handle: handle("c"), proof_handle: handle("b"), expected_revision: 0, operation_id });
  const registrationOptions = (body: unknown) => post("/v1/admin/webauthn/registration/options", body);
  const registrationVerify = () => post("/v1/admin/webauthn/registration/verify", { challenge_handle: handle("a"), credential: registrationCredential });
  const close = async () => { await api.close(); await runtime.close(); };
  return { f, runtime, writes, alertIntents, ceremonies, failCommit, invite, grant, disable, post, actionOptions, actionVerify, acceptOptions, acceptVerify, accept,
    registrationOptions, registrationVerify, close };
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

  it("keeps containment available while locked: disable is recorded and its alert waits unclaimed until unlock, then is delivered", async () => {
    const h = await lockedHttp();
    try {
      const disableId = randomUUID();
      const disabled = await h.disable(disableId);
      expect(disabled.statusCode).toBe(200);
      expect(h.writes).toEqual([{ kind: "disable", operationId: disableId, event: "DISABLE" }]);
      // The sealed DISABLE alert the route handed to the record write enters the (fake) outbox.
      expect(h.alertIntents).toHaveLength(1);
      enqueue(h.f.state, h.alertIntents[0]!, targetUser);
      h.runtime.start();
      await new Promise(r => setTimeout(r, 250));
      expect(h.f.state.claimCalls).toBe(0);
      expect(h.f.state.receipts).toEqual([]);
      await h.f.unlock();
      await until(() => h.f.state.receipts.length > 0);
      expect(h.f.state.receipts).toEqual([{ outcome: "DELIVERED", failure: null }]);
      expect(h.f.state.attempts).toBe(1);
      const mail = await readFile(h.f.sent, "utf8");
      expect(mail).toContain('"event":"DISABLE"');
      expect(mail).toContain(disableId);
      expect(mail).toContain(targetStaff);
    } finally { await h.close(); }
  });

  const lockedRefusal = (response: { statusCode: number; json(): unknown }) => {
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "STAFF_ALERT_UNAVAILABLE" });
  };
  const mutationIntent = { expected_revision: 0, reason: { code: "GRANT_CHANGE" } };

  it("answers the locked refusal when the database's readiness guard refuses at COMMIT; other database refusals stay 403", async () => {
    const h = await lockedHttp();
    try {
      await h.f.unlock();
      // staff.require_alert_operation: RAISE EXCEPTION 'STAFF_ALERT_UNAVAILABLE' (default SQLSTATE P0001).
      h.failCommit(() => Object.assign(new Error("STAFF_ALERT_UNAVAILABLE"), { code: "P0001" }));
      lockedRefusal(await h.grant());
      for (const other of [Object.assign(new Error("STAFF_GRANT_REVISION_STALE"), { code: "P0001" }),
        Object.assign(new Error("STAFF_ALERT_UNAVAILABLE"), { code: "42501" }), new Error("STAFF_ALERT_UNAVAILABLE")]) {
        h.failCommit(() => other);
        const refused = await h.grant();
        expect(refused.statusCode).toBe(403);
        expect(refused.json()).toEqual({ error: "STAFF_REQUEST_REFUSED" });
      }
      expect(h.writes).toEqual([]);
    } finally { await h.close(); }
  });

  it("refuses invite and grant key ceremonies while locked before issuing a challenge; disable ceremonies still start", async () => {
    const h = await lockedHttp();
    try {
      const invite = { action: "TEAM_INVITE", target_user_id: targetUser, capabilities: ["TEAM_READ"], operation_id: randomUUID(), ...mutationIntent, reason: { code: "TEAM_ONBOARDING" } };
      const grant = { action: "TEAM_GRANT", target_staff_id: targetStaff, capabilities: ["TEAM_READ"], operation_id: randomUUID(), ...mutationIntent };
      for (const intent of [invite, grant]) { lockedRefusal(await h.actionOptions(intent)); lockedRefusal(await h.actionVerify(intent)); }
      expect(h.ceremonies).toEqual([]);
      for (const [action, mode] of [["TEAM_DISABLE", "OFFBOARD"], ["EMERGENCY_DISABLE", "COMPROMISE"]] as const)
        await h.actionOptions({ action, target_staff_id: targetStaff, mode, operation_id: randomUUID(), expected_revision: 0, reason: { code: "SECURITY_RESPONSE" } });
      expect(h.ceremonies).toEqual(["beginAction", "beginAction"]);
      await h.f.unlock();
      await h.actionOptions(invite);
      expect(h.ceremonies).toEqual(["beginAction", "beginAction", "beginAction"]);
    } finally { await h.close(); }
  });

  it("refuses invitation acceptance while locked before any key ceremony, and accepts after unlock", async () => {
    const h = await lockedHttp();
    try {
      for (const response of [await h.acceptOptions(), await h.acceptVerify(), await h.accept()]) lockedRefusal(response);
      expect(h.ceremonies).toEqual([]);
      expect(h.writes).toEqual([]);
      expect(h.f.state.authorized).toEqual([]);
      await h.f.unlock();
      await h.acceptOptions();
      expect(h.ceremonies).toEqual(["beginInvitationAcceptance"]);
      const acceptId = randomUUID(), accepted = await h.accept(acceptId);
      expect(accepted.statusCode).toBe(200);
      expect(h.writes).toEqual([{ kind: "accept", operationId: acceptId, event: "ACCEPT" }]);
    } finally { await h.close(); }
  });

  it("refuses security-key registration (KEY_CHANGE) while locked before any key ceremony", async () => {
    const h = await lockedHttp();
    try {
      const operationId = randomUUID(), register = { action: "CREDENTIAL_REGISTER", operation_id: operationId };
      for (const response of [await h.actionOptions(register), await h.actionVerify(register),
        await h.registrationOptions({ prerequisite_handle: "d".repeat(43) }), await h.registrationOptions({ proof_handle: "b".repeat(43), operation_id: operationId }),
        await h.registrationVerify()]) lockedRefusal(response);
      expect(h.ceremonies).toEqual([]);
      await h.f.unlock();
      await h.registrationOptions({ prerequisite_handle: "d".repeat(43) });
      await h.actionOptions(register);
      expect(h.ceremonies).toEqual(["beginRegistration", "beginAction"]);
    } finally { await h.close(); }
  });

  it("refuses allowance ceremonies and writes while locked, and configures after unlock", async () => {
    const h = await lockedHttp({ funded: true });
    try {
      const configure = { amount_micros: 1000000, day_micros: 100000, week_micros: 500000, starts_at: "2026-10-03T09:00:00.000Z",
        expires_at: "2026-10-10T09:00:00.000Z", funding_approval_ref: "SYNTHETIC-APPROVAL", operation_id: randomUUID(), reason: { code: "FUNDING_APPROVAL" } };
      const grantId = randomUUID(), revoke = { grant_id: grantId, operation_id: randomUUID(), reason: { code: "FUNDING_APPROVAL" } };
      for (const response of [await h.actionOptions({ action: "ALLOWANCE_CONFIGURE", ...configure }), await h.actionVerify({ action: "ALLOWANCE_CONFIGURE", ...configure }),
        await h.actionOptions({ action: "ALLOWANCE_REVOKE", ...revoke }),
        await h.post("/v1/admin/internal-allowances", { ...configure, proof_handle: "b".repeat(43) }),
        await h.post(`/v1/admin/internal-allowances/${grantId}`, { operation_id: revoke.operation_id, reason: revoke.reason, proof_handle: "b".repeat(43) }, "DELETE")]) lockedRefusal(response);
      expect(h.ceremonies).toEqual([]);
      expect(h.writes).toEqual([]);
      await h.f.unlock();
      await h.actionOptions({ action: "ALLOWANCE_CONFIGURE", ...configure });
      expect(h.ceremonies).toEqual(["beginAction"]);
      const configured = await h.post("/v1/admin/internal-allowances", { ...configure, proof_handle: "b".repeat(43) });
      expect(configured.statusCode).toBe(200);
      expect(h.writes).toEqual([{ kind: "allowance-configure", operationId: configure.operation_id, event: "ALLOWANCE_CONFIGURED" }]);
    } finally { await h.close(); }
  });
});
