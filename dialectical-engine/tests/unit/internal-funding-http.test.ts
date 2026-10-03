import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApi } from "@debateai/api";
import { createStaffApiClient } from "../../apps/ui/lib/staffApi.js";
import * as routes from "../../apps/api/src/staff/routes.js";
import { staffHttpAskApplication } from "../support/staffHttpApplication.js";
import { testHttpIdentity, testSessionApplication, TEST_APP_ORIGIN } from "../support/httpSession.js";
const owner = "11111111-1111-4111-8111-111111111111";
const operation = "22222222-2222-4222-8222-222222222222";
const intent = { action: "ALLOWANCE_CONFIGURE", amount_micros: 1000000, day_micros: 100000, week_micros: 500000,
  starts_at: "2026-10-03T09:00:00.000Z", expires_at: "2026-10-10T09:00:00.000Z", funding_approval_ref: "SYNTHETIC-APPROVAL",
  operation_id: operation, reason: { code: "FUNDING_APPROVAL" } };

describe("funded self action producer and selected clients", () => {
  it("binds only resolved self owner, lineage and policy version using shared canonical JSON", () => {
    expect(routes).toHaveProperty("canonicalInternalAllowanceActionBinding");
    const bind = (routes as unknown as Record<string, (intent: unknown, state: unknown) => { targetId: string; expectedRevision: number; bodySha256: string }>).canonicalInternalAllowanceActionBinding!;
    const state = { ownerRef: owner, expectedRevision: 3, policyRegisterVersion: 2 };
    const binding = bind(intent, state);
    const bytes = '{"action":"ALLOWANCE_CONFIGURE","amount_micros":1000000,"day_micros":100000,"expected_revision":3,"expires_at":"2026-10-10T09:00:00.000Z","funding_approval_ref":"SYNTHETIC-APPROVAL","operation_id":"22222222-2222-4222-8222-222222222222","policy_register_version":2,"reason":{"code":"FUNDING_APPROVAL"},"starts_at":"2026-10-03T09:00:00.000Z","target_id":"11111111-1111-4111-8111-111111111111","week_micros":500000}';
    expect(binding).toMatchObject({ targetId: owner, expectedRevision: 3, bodySha256: createHash("sha256").update(bytes).digest("hex") });
    expect(bind(intent, { ...state, expectedRevision: 4 }).bodySha256).not.toBe(binding.bodySha256);
    expect(bind(intent, { ...state, policyRegisterVersion: 3 }).bodySha256).not.toBe(binding.bodySha256);
    for (const extra of [{ owner_ref: owner }, { expected_revision: 1 }, { policy_register_version: 1 }, { body_sha256: "a".repeat(64) }]) {
      expect(() => bind({ ...intent, ...extra }, state)).toThrow();
    }
  });

  it("mounts guarded funding methods only within staff v2 and preserves v1", async () => {
    const account = testHttpIdentity("funded-mount");
    const api = (version: 1 | 2) => buildApi({ application: staffHttpAskApplication(), sessions: testSessionApplication([account]),
      allowedOrigin: TEST_APP_ORIGIN, staffPolicyVersion: version });
    const old = api(1), selected = api(2);
    try {
      expect(old.hasRoute({ method: "POST", url: "/v1/admin/internal-allowances" })).toBe(false);
      expect(selected.hasRoute({ method: "POST", url: "/v1/admin/internal-allowances" })).toBe(true);
      expect(selected.hasRoute({ method: "DELETE", url: "/v1/admin/internal-allowances/:grantId" })).toBe(true);
      expect((await selected.inject({ method: "POST", url: "/v1/admin/internal-allowances", payload: intent })).statusCode).toBe(401);
      expect((await selected.inject({ method: "DELETE", url: `/v1/admin/internal-allowances/${operation}`, payload: { operation_id: owner, reason: { code: "FUNDING_APPROVAL" }, proof_handle: "b".repeat(43) } })).statusCode).toBe(401);
    } finally { await old.close(); await selected.close(); }
  });

  it("accepts seven-capability elevation only for the explicitly selected funded browser contract", async () => {
    const response = { staff_id: owner, capabilities: ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE", "ALLOWANCE_WRITE"], grant_revision: 0, expires_at: "2099-01-01T00:00:00.000Z" };
    const credential = { id: "aA", rawId: "aA", type: "public-key", response: { clientDataJSON: "aA", authenticatorData: "aA", signature: "aA", userHandle: null }, clientExtensionResults: {} };
    const input = { challenge_handle: "a".repeat(43), credential };
    const configuration = { fetchImplementation: (async () => Response.json(response)) as typeof fetch };
    await expect(createStaffApiClient(configuration).finishElevation(input as never)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    const funded = createStaffApiClient({ ...configuration, fundingPolicyVersion: 1 } as never);
    await expect(funded.finishElevation(input as never)).resolves.toEqual(response);
  });
});

it("selects the funded team schema explicitly while default clients reject seven-capability members", async () => {
  const member = { staff_id: owner, pseudonym: "staff-test", status: "ACTIVE", capabilities: ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE", "ALLOWANCE_WRITE"],
    grant_revision: 0, credential_count: 2, last_privilege_at: null, delivery_state: "PENDING" };
  const response = { members: [member], next_cursor: null, order: "CREATED_AT_ID_ASC" };
  const configuration = { fetchImplementation: (async () => Response.json(response)) as typeof fetch };
  await expect(createStaffApiClient(configuration).team({ limit: 1 })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  await expect(createStaffApiClient({ ...configuration, fundingPolicyVersion: 1 }).team({ limit: 1 })).resolves.toEqual(response);
});

import type { StaffContext, StaffProof, ActionBinding } from "@debateai/kernel";
import type { StaffHttpApplication } from "../../apps/api/src/staff/routes.js";
import { testSessionHeaders } from "../support/httpSession.js";
function fundingHttpFixture(enabled = true) {
  const account = testHttpIdentity("funding-handler"), staffToken = Buffer.alloc(32, 1).toString("base64url"), csrf = Buffer.alloc(32, 2).toString("base64url");
  const context: StaffContext = { staffId: owner, userId: account.authenticated.userId, ordinarySessionId: account.authenticated.session.session_id,
    privilegeSessionId: operation, designation: "OWNER", securityEpoch: 0, accountSecurityEpoch: 0, grantRevision: 0,
    capabilities: ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE", "ALLOWANCE_WRITE"] };
  const authentication = { context, baseSession: account.authenticated, csrfTokenHash: "sha256:" + "a".repeat(64), expiresAt: new Date(Date.now() + 60000) };
  const state = { ownerRef: account.authenticated.ownerRef, expectedRevision: 0, policyRegisterVersion: 2 };
  let challenge: ActionBinding | undefined, proof: StaffProof | undefined;
  const configured: unknown[] = [], revoked: unknown[] = [], resolved: unknown[] = [];
  const access = {
    authenticate: async () => authentication, verifyCsrf: async (_auth: unknown, supplied: string) => supplied === csrf,
    assertCurrent: async () => {}, requireCapability: async (_auth: unknown, capability: string) => { if (!context.capabilities.includes(capability as never)) throw Error("DENIED"); },
    readActionProof: async (_auth: unknown, _handle: string, binding: ActionBinding) => proof && JSON.stringify(proof.binding) === JSON.stringify(binding) ? proof : null,
    readInvitationContext: async () => null, readOwnerPossessionContext: async () => null, registerPrivilegedConnection: () => () => {}
  };
  const sessions = testSessionApplication([account]);
  const options = { challenge_handle: "a".repeat(43), options: { challenge: "a".repeat(43), rpId: "app.debateai.test", timeout: 300000 as const,
    userVerification: "required" as const, allowCredentials: [{ id: "aA", type: "public-key" as const }] } };
  const staff = { access, sessions, repository: {}, intents: { mutation: async (input: { event: string; operationId: string }) => ({ schema: "staff-alert-v1", event: input.event, operationId: input.operationId,
      envelope: { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" } }) },
    webauthn: { beginAction: async (_context: unknown, binding: ActionBinding) => { challenge = binding; return options; },
      finishAction: async (_context: unknown, binding: ActionBinding) => {
        if (JSON.stringify(binding) !== JSON.stringify(challenge)) throw Error("STALE");
        proof = { proofId: operation, context, binding, credentialId: "aA", verifiedAt: new Date(), expiresAt: new Date(Date.now() + 60000) };
        return { proofHandle: "b".repeat(43), proof };
      } }, ...(enabled ? { funding: { requireReady: async () => {}, allowances: {
        readSelfCommand: async (input: unknown, token: unknown, grantId: unknown) => { resolved.push({ input, token, grantId }); return { ...state }; },
        configure: async (input: { operationId: string }) => { configured.push(input); state.expectedRevision++; return { operationId: input.operationId, outcome: "COMPLETED", recordedAt: new Date() }; },
        revoke: async (input: { operationId: string }) => { revoked.push(input); state.expectedRevision++; return { operationId: input.operationId, outcome: "COMPLETED", recordedAt: new Date() }; }
      } } } : {}) } as unknown as StaffHttpApplication;
  const api = buildApi({ application: staffHttpAskApplication(), sessions, allowedOrigin: TEST_APP_ORIGIN, staffPolicyVersion: 2,
    staffAccess: access as never, staff });
  const headers = { ...testSessionHeaders(account, true), cookie: `${testSessionHeaders(account, true).cookie}; __Host-debateai-staff=${staffToken}; __Host-debateai-staff-csrf=${csrf}`, "x-staff-csrf-token": csrf };
  const credential = { id: "aA", rawId: "aA", type: "public-key", response: { clientDataJSON: "YQ", authenticatorData: "YQ", signature: "YQ", userHandle: null }, clientExtensionResults: {} };
  const verify = (business: unknown) => api.inject({ method: "POST", url: "/v1/admin/webauthn/action/verify", headers,
    payload: { intent: business, challenge_handle: "a".repeat(43), credential } });
  const begin = (business: unknown) => api.inject({ method: "POST", url: "/v1/admin/webauthn/action/options", headers, payload: { intent: business } });
  return { api, headers, account, state, configured, revoked, resolved, begin, verify };
}

it("routes actual action options, verify, configure and revoke through server-derived self commands", async () => {
  const f = fundingHttpFixture();
  try {
    expect((await f.begin(intent)).statusCode).toBe(200);
    const verified = await f.verify(intent); expect(verified.statusCode).toBe(200);
    const { action: _action, ...business } = intent;
    const result = await f.api.inject({ method: "POST", url: "/v1/admin/internal-allowances", headers: f.headers,
      payload: { ...business, proof_handle: verified.json().proof_handle } });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ operation_id: operation, outcome: "COMPLETED" });
    expect(f.configured).toHaveLength(1);
    expect(f.configured[0]).toMatchObject({ ownerRef: f.account.authenticated.ownerRef, expectedRevision: 0, policyRegisterVersion: 2,
      amountMicros: 1000000, dayMicros: 100000, weekMicros: 500000, fundingApprovalRef: "SYNTHETIC-APPROVAL" });
    expect(f.resolved).toHaveLength(3);
    const revoke = { action: "ALLOWANCE_REVOKE", grant_id: operation, operation_id: owner, reason: { code: "FUNDING_APPROVAL" } };
    expect((await f.begin(revoke)).statusCode).toBe(200);
    const checked = await f.verify(revoke); expect(checked.statusCode).toBe(200);
    const removed = await f.api.inject({ method: "DELETE", url: `/v1/admin/internal-allowances/${operation}`, headers: f.headers,
      payload: { operation_id: owner, reason: revoke.reason, proof_handle: checked.json().proof_handle } });
    expect(removed.statusCode).toBe(200);
    expect(f.revoked[0]).toMatchObject({ ownerRef: f.account.authenticated.ownerRef, grantId: operation, expectedRevision: 1, policyRegisterVersion: 2 });
    expect(JSON.stringify(result.json())).not.toContain(f.account.authenticated.ownerRef);
  } finally { await f.api.close(); }
});

it.each(["expectedRevision", "policyRegisterVersion"] as const)("invalidates proof after server %s changes", async field => {
  const f = fundingHttpFixture();
  try {
    expect((await f.begin(intent)).statusCode).toBe(200);
    f.state[field]++;
    expect((await f.verify(intent)).statusCode).toBe(403);
    expect(f.configured).toHaveLength(0);
    expect((await f.begin(intent)).statusCode).toBe(200);
    const verified = await f.verify(intent); expect(verified.statusCode).toBe(200);
    f.state[field]++;
    const { action: _action, ...business } = intent;
    expect((await f.api.inject({ method: "POST", url: "/v1/admin/internal-allowances", headers: f.headers,
      payload: { ...business, proof_handle: verified.json().proof_handle } })).statusCode).toBe(403);
    expect(f.configured).toHaveLength(0);
  } finally { await f.api.close(); }
});

it("denies uploaded owner/revision/version fields, foreign resolved self and missing funding application", async () => {
  const f = fundingHttpFixture(), disabled = fundingHttpFixture(false);
  const { action: _action, ...business } = intent;
  try {
    for (const extra of [{ owner_ref: owner }, { expected_revision: 0 }, { policy_register_version: 2 }]) {
      expect((await f.begin({ ...intent, ...extra })).statusCode).toBe(422);
      expect((await f.api.inject({ method: "POST", url: "/v1/admin/internal-allowances", headers: f.headers,
        payload: { ...business, ...extra, proof_handle: "b".repeat(43) } })).statusCode).toBe(422);
    }
    f.state.ownerRef = owner;
    expect((await f.begin(intent)).statusCode).toBe(403);
    expect((await disabled.api.inject({ method: "POST", url: "/v1/admin/internal-allowances", headers: disabled.headers,
      payload: { ...business, proof_handle: "b".repeat(43) } })).statusCode).toBe(503);
    expect(f.configured).toHaveLength(0);
  } finally { await f.api.close(); await disabled.api.close(); }
});
