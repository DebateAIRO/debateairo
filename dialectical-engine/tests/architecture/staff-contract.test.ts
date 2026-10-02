import { describe, expect, it } from "vitest";
import * as contract from "../../packages/contract/src/index.js";
import type { ZodType } from "zod";
const id = "1c5a7a96-544a-4b66-94f9-a0b18f4053dd";
const time = "2026-10-02T12:00:00.000Z";
const handle = "a".repeat(43);
function schema(name: string): ZodType {
  expect(contract, `missing ${name}`).toHaveProperty(name);
  return (contract as unknown as Record<string, ZodType>)[name]!;
}

describe("strict staff wire boundary", () => {
  it("preserves ASKER sessions and rejects browser role claims", () => {
    const session = { asker_id: `owner:${id}`, session_id: id, caller_scope: "ASKER",
      ownership_provenance: "server_session", provisional_identity_model: false };
    expect(contract.SessionSchema.parse(session)).toEqual(session);
    expect(contract.SessionSchema.safeParse({ ...session, role: "owner" }).success).toBe(false);
    expect(schema("StaffCapabilitySchema").safeParse("ROOT_ACCESS").success).toBe(false);
    const grants = schema("DelegatedStaffCapabilitiesSchema");
    expect(grants.safeParse(["TEAM_READ", "AUDIT_READ"]).success).toBe(true);
    for (const value of [["TEAM_INVITE"], ["ALLOWANCE_WRITE"], ["TEAM_READ", "TEAM_READ"], ["PRIVATE_DEBATE_READ"]]) {
      expect(grants.safeParse(value).success).toBe(false);
    }
  });

  it("allows only scoped prerequisite factor requests and handle/expiry responses", () => {
    const request = schema("StaffPrerequisiteStepUpRequestSchema");
    expect(request.safeParse({ purpose: "KEY_PREREGISTRATION", password: "test password", totp_code: "123456" }).success).toBe(true);
    expect(request.safeParse({ purpose: "OWNER_POSSESSION", password: "test password", totp_code: "123456", command_id: id, command_nonce: handle }).success).toBe(true);
    for (const value of [
      { purpose: "KEY_PREREGISTRATION", password: "x", recovery_code: "xxxx" },
      { purpose: "OWNER_POSSESSION", password: "x", totp_code: "123456" },
      { purpose: "KEY_PREREGISTRATION", password: "x", totp_code: "123456", role: "owner" },
      { purpose: "OWNER_POSSESSION", password: "x", totp_code: "123456", command_id: id, command_nonce: handle, credential_ids: ["a", "b"] }
    ]) expect(request.safeParse(value).success).toBe(false);
    const response = schema("StaffPrerequisiteResponseSchema");
    const value = { prerequisite_handle: handle, expires_at: time };
    expect(response.parse(value)).toEqual(value);
    for (const extra of [{ staff_context: {} }, { csrf_token: handle }, { role: "owner" }]) {
      expect(response.safeParse({ ...value, ...extra }).success).toBe(false);
    }
    expect(contract.StepUpAuthorizationRequestSchema.safeParse({ action: "OWNER_POSSESSION" }).success).toBe(false);
  });

  it("returns only own registration receipt and verified credential public ID", () => {
    const response = schema("StaffRegistrationResponseSchema");
    const value = { receipt: { operation_id: id, outcome: "COMPLETED", recorded_at: time }, credentialId: "testCredentialId" };
    expect(response.parse(value)).toEqual(value);
    for (const extra of [{ target_user_id: id }, { public_key: "secret" }, { staff_session: handle }]) {
      expect(response.safeParse({ ...value, ...extra }).success).toBe(false);
    }
    expect(response.safeParse({ receipt: value.receipt }).success).toBe(false);
  });

  it("binds action purpose, exact target, body digest, revision and idempotency", () => {
    const binding = { action: "TEAM_GRANT", target_id: id, body_sha256: "a".repeat(64), expected_revision: 2, operation_id: id };
    expect(schema("ActionBindingSchema").parse(binding)).toEqual(binding);
    expect(schema("ActionBindingSchema").safeParse({ ...binding, action: "ALLOWANCE_CONFIGURE" }).success).toBe(false);
    expect(schema("ActionBindingSchema").safeParse({ ...binding, action: "ALLOWANCE_REVOKE" }).success).toBe(false);
    for (const extra of [{ role: "owner" }, { capability: "ROOT_ACCESS" }, { arbitrary_sql: "SELECT 1" }]) {
      expect(schema("ActionBindingSchema").safeParse({ ...binding, ...extra }).success).toBe(false);
    }
    expect(schema("ReasonSchema").safeParse({ code: "SECURITY_RESPONSE", ticket_ref: "SEC-123" }).success).toBe(true);
    expect(schema("ReasonSchema").safeParse({ code: "SECURITY_RESPONSE", body: "private prompt" }).success).toBe(false);
  });

  it("bounds opaque pages and rejects search, filters and response secrets", () => {
    const query = schema("StaffPageQuerySchema");
    expect(query.safeParse({ limit: 1, cursor: "a".repeat(256) }).success).toBe(true);
    expect(query.safeParse({ limit: 100 }).success).toBe(true);
    for (const value of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: 1, cursor: "a".repeat(257) },
      { limit: 1, cursor: "é".repeat(129) }, { limit: 1, search: "customer" }, { limit: 1, filters: ["ACTIVE", "ACTIVE"] }]) {
      expect(query.safeParse(value).success).toBe(false);
    }
    const member = { staff_id: id, pseudonym: "staff-123", status: "ACTIVE", capabilities: ["TEAM_READ"],
      grant_revision: 1, credential_count: 1, last_privilege_at: time, delivery_state: "DELIVERED" };
    const page = { members: [member], next_cursor: null, order: "CREATED_AT_ID_ASC" };
    expect(schema("StaffTeamPageSchema").parse(page)).toEqual(page);
    for (const extra of [{ email: "sensitive@example.test" }, { private_debates: [] }, { credential_ids: ["secret"] }]) {
      expect(schema("StaffTeamPageSchema").safeParse({ ...page, members: [{ ...member, ...extra }] }).success).toBe(false);
    }
    expect(schema("StaffTeamPageSchema").safeParse({ ...page, order: "EMAIL_ASC" }).success).toBe(false);
    expect(schema("StaffAuditPageSchema").safeParse({ events: [], next_cursor: null, order: "RECORDED_AT_ID_ASC" }).success).toBe(true);
  });

  it("exposes self-only enrollment readiness and strict mutation targets", () => {
    const readiness = { account_active: true, email_verified: true, totp_active: true, security_hold: false,
      verified_credential_count: 2, owner_credential_requirement_met: true, delegated_credential_requirement_met: true };
    expect(schema("StaffEnrollmentResponseSchema").safeParse({ user_id: id, readiness }).success).toBe(true);
    expect(schema("StaffEnrollmentResponseSchema").safeParse({ user_id: id, readiness, staff_id: id }).success).toBe(false);
    const invite = { target_user_id: id, capabilities: ["TEAM_READ"], expected_revision: 0,
      operation_id: id, proof_handle: handle, reason: { code: "TEAM_ONBOARDING" } };
    expect(schema("StaffInviteRequestSchema").safeParse(invite).success).toBe(true);
    for (const extra of [{ email: "target@example.test" }, { role: "owner" }, { credentials: ["a"] }]) {
      expect(schema("StaffInviteRequestSchema").safeParse({ ...invite, ...extra }).success).toBe(false);
    }
    const owner = { command_id: id, command_nonce: handle, credential_id: "abc", prerequisite_handle: handle };
    expect(schema("OwnerPossessionOptionsRequestSchema").safeParse(owner).success).toBe(true);
    expect(schema("OwnerPossessionOptionsRequestSchema").safeParse({ ...owner, target_user_id: id }).success).toBe(false);
    expect(schema("StaffRegistrationOptionsRequestSchema").safeParse({ prerequisite_handle: handle }).success).toBe(true);
    expect(schema("StaffRegistrationOptionsRequestSchema").safeParse({ prerequisite_handle: handle, target_user_id: id }).success).toBe(false);
  });

  it("returns only own staff identity and explicit active grants after elevation", () => {
    const own = { staff_id: id, capabilities: ["TEAM_READ", "AUDIT_READ"], grant_revision: 2, expires_at: time };
    expect(schema("StaffElevationResponseSchema").parse(own)).toEqual(own);
    expect(schema("StaffElevationResponseSchema").safeParse({ expires_at: time }).success).toBe(false);
    for (const extra of [{ staff_context: {} }, { user_id: id }, { ordinary_session_id: id }, { privilege_session_id: id },
      { token: handle }, { csrf_token: handle }, { staff_cookie: handle }, { role: "owner" }]) {
      expect(schema("StaffElevationResponseSchema").safeParse({ ...own, ...extra }).success).toBe(false);
    }
    for (const capabilities of [["ALLOWANCE_WRITE"], ["TEAM_READ", "TEAM_READ"], ["PRIVATE_DEBATE_READ"]]) {
      expect(schema("StaffElevationResponseSchema").safeParse({ ...own, capabilities }).success).toBe(false);
    }
    expect(schema("StaffPrerequisiteResponseSchema").safeParse({ prerequisite_handle: handle, ...own }).success).toBe(false);
    const ownFields = { staff_id: id, capabilities: ["TEAM_READ"], grant_revision: 1 };
    expect(schema("OwnerPossessionResponseSchema").safeParse({ receipt_id: id, expires_at: time, ...ownFields }).success).toBe(false);
    expect(schema("StaffActionProofResponseSchema").safeParse({ proof_handle: handle, expires_at: time, ...ownFields }).success).toBe(false);
  });

  it("never returns an invitation token to the issuer", () => {
    const receipt = { operation_id: id, outcome: "COMPLETED", recorded_at: time };
    const response = { receipt, invitation_id: id, expires_at: time };
    expect(schema("StaffInviteResponseSchema").safeParse({ receipt, invitation_handle: handle, expires_at: time }).success).toBe(false);
    expect(schema("StaffInviteResponseSchema").parse(response)).toEqual(response);
    expect(schema("StaffInviteResponseSchema").safeParse({ ...response, invitation_token: handle }).success).toBe(false);
  });

  it("uses only the reviewed OFFBOARD and COMPROMISE disable modes", () => {
    const request = { expected_revision: 1, operation_id: id, proof_handle: handle, reason: { code: "SECURITY_RESPONSE" } };
    for (const mode of ["OFFBOARD", "COMPROMISE"]) {
      expect(schema("StaffDisableRequestSchema").safeParse({ ...request, mode }).success).toBe(true);
    }
    for (const mode of ["TEAM_DISABLE", "EMERGENCY_DISABLE", "RECOVER", "DELETE_ACCOUNT"]) {
      expect(schema("StaffDisableRequestSchema").safeParse({ ...request, mode }).success).toBe(false);
    }
  });

  it("rejects malformed, oversized and extra WebAuthn ceremony data", () => {
    const assertion = { id: "abc", rawId: "abc", type: "public-key", response: {
      clientDataJSON: "abc", authenticatorData: "abc", signature: "abc", userHandle: null }, clientExtensionResults: {} };
    const request = { challenge_handle: handle, credential: assertion };
    expect(schema("StaffAuthenticationVerifyRequestSchema").safeParse(request).success).toBe(true);
    for (const credential of [{ ...assertion, role: "owner" }, { ...assertion, type: "password" },
      { ...assertion, response: { ...assertion.response, clientDataJSON: "a".repeat(32768) } },
      { ...assertion, response: { ...assertion.response, signature: "invalid!" } }]) {
      expect(schema("StaffAuthenticationVerifyRequestSchema").safeParse({ ...request, credential }).success).toBe(false);
    }
  });

  it("inventories only proposed safe route families, including nested invitation acceptance", () => {
    for (const route of [
      "POST /v1/admin/prerequisites/step-up", "POST /v1/admin/owner-possession/options", "POST /v1/admin/owner-possession/verify",
      "POST /v1/admin/team/invitations/accept/options", "POST /v1/admin/team/invitations/accept/verify", "POST /v1/admin/team/invitations/accept",
      "GET /v1/admin/team", "GET /v1/admin/audit", "GET /v1/admin/enrollment",
      "POST /v1/admin/webauthn/registration/options", "POST /v1/admin/webauthn/registration/verify",
      "POST /v1/admin/webauthn/elevation/options", "POST /v1/admin/webauthn/elevation/verify",
      "POST /v1/admin/webauthn/action/options", "POST /v1/admin/webauthn/action/verify",
      "POST /v1/admin/team/invitations", "PATCH /v1/admin/team/{staffId}/grants", "POST /v1/admin/team/{staffId}/disable"
    ]) expect(contract.contractInventory.routes).toContain(route);
    expect(contract.contractInventory.routes).not.toContain("POST /v1/admin/bootstrap-owner");
    expect(contract.contractInventory.routes).not.toContain("POST /v1/admin/recover-owner");
  });
});
