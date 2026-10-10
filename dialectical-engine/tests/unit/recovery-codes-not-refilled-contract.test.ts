// Review M4 2026-10-09 (design note item 3): a used recovery code is never refilled, so no response carries a
// replacement code. The strict response shapes refuse the old field, so a regression cannot pass silently.
import { describe, expect, it } from "vitest";
import { AuthenticationResponseSchema, ConsumerRecoveryProofResponseSchema, StepUpResponseSchema } from "@debateai/contract";

const csrf = "c".repeat(43), handle = "r".repeat(43), expires_at = "2026-10-09T12:05:00.000Z";
const session = { asker_id: "owner:22222222-2222-4222-8222-222222222222", session_id: "33333333-3333-4333-8333-333333333333", caller_scope: "ASKER", ownership_provenance: "server_session", provisional_identity_model: false };
const shapes = [
  ["sign-in", AuthenticationResponseSchema, { status: "authenticated", csrf_token: csrf, session }],
  ["security confirmation", StepUpResponseSchema, { status: "step_up_complete", csrf_token: csrf }],
  ["recovery proof", ConsumerRecoveryProofResponseSchema, { status: "RECOVERY_ENROLL_ONLY", available_methods: ["passkey"], totp_unavailable_reason: null, recovery_capability: handle, expires_at }]
] as const;

describe("no response carries a replacement recovery code", () => {
  it.each(shapes)("the %s response is accepted without one", (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });
  it.each(shapes)("the %s response is refused with one", (_name, schema, value) => {
    expect(schema.safeParse({ ...value, replacement_recovery_code: "01-EXAMPLE-SAVED-CODE" }).success).toBe(false);
  });
});
