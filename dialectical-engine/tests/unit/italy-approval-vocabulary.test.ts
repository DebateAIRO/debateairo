import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ITALY_APPROVAL_CLAUSES,
  ITALY_APPROVAL_KIND,
  ITALY_APPROVAL_LEGS,
  ITALY_APPROVAL_REQUIRED,
  ITALY_COUNTRY,
  isItalyApprovalLeg,
  italyApprovalLeg
} from "@debateai/kernel";
import { CompleteSocialSignupRequestSchema, RegisterRequestSchema } from "@debateai/contract";
import type { ItalyApprovalAcceptanceRow, PendingAccountInput } from "@debateai/db";
import { canonicalSignup } from "../support/turnstileFixtures.js";

/**
 * Italy clause approval, slice S01, cluster C1 (plan steps P01-P03): the shared vocabulary every later cluster
 * imports. Constants and the pure leg rule (V1-V3), the one new request field (V4), the database row type (V5).
 */
describe("Italy approval vocabulary (kernel)", () => {
  it("V1 the clause list, country, row kind, refusal code and legs are exactly the ruled values", () => {
    expect(ITALY_APPROVAL_CLAUSES).toEqual([11, 12, 14, 15, 18]);
    expect(Object.isFrozen(ITALY_APPROVAL_CLAUSES)).toBe(true);
    expect(ITALY_COUNTRY).toBe("IT");
    expect(ITALY_APPROVAL_KIND).toBe("ITALY_SPECIFIC_APPROVAL");
    expect(ITALY_APPROVAL_REQUIRED).toBe("ITALY_APPROVAL_REQUIRED");
    expect(ITALY_APPROVAL_LEGS).toEqual(["PICKED", "IP", "BOTH"]);
    expect(Object.isFrozen(ITALY_APPROVAL_LEGS)).toBe(true);
  });

  it("V2 italyApprovalLeg names the leg from the two decisions, and null when neither holds", () => {
    expect(italyApprovalLeg(true, true)).toBe("BOTH");
    expect(italyApprovalLeg(true, false)).toBe("PICKED");
    expect(italyApprovalLeg(false, true)).toBe("IP");
    expect(italyApprovalLeg(false, false)).toBeNull();
  });

  it("V3 isItalyApprovalLeg admits the three legs and nothing else", () => {
    for (const leg of ["PICKED", "IP", "BOTH"]) expect(isItalyApprovalLeg(leg)).toBe(true);
    for (const value of ["picked", "", null, 1]) expect(isItalyApprovalLeg(value)).toBe(false);
  });
});

describe("Italy approval field (contract)", () => {
  const base = canonicalSignup;
  const { password: _password, ...withoutPassword } = base;
  const social = { ...withoutPassword, continuation_token: "a".repeat(43) };

  it("V4 the register request admits italy_approval:true, refuses false and a browser-sent leg", () => {
    expect(RegisterRequestSchema.safeParse({ ...base, italy_approval: true }).success).toBe(true);
    expect(RegisterRequestSchema.safeParse({ ...base, italy_approval: false }).success).toBe(false);
    expect(RegisterRequestSchema.safeParse(base).success).toBe(true);
    expect(RegisterRequestSchema.safeParse({ ...base, italy_leg: "IP" }).success).toBe(false);
  });

  it("V4 the social completion request admits italy_approval:true, refuses false and a browser-sent leg", () => {
    expect(CompleteSocialSignupRequestSchema.safeParse({ ...social, italy_approval: true }).success).toBe(true);
    expect(CompleteSocialSignupRequestSchema.safeParse({ ...social, italy_approval: false }).success).toBe(false);
    expect(CompleteSocialSignupRequestSchema.safeParse(social).success).toBe(true);
    expect(CompleteSocialSignupRequestSchema.safeParse({ ...social, italy_leg: "IP" }).success).toBe(false);
  });
});

describe("Italy approval row (database type)", () => {
  it("V5 a pending account input carries the sealed approval row under italyApproval", () => {
    const row: ItalyApprovalAcceptanceRow = {
      acceptanceId: randomUUID(),
      clauses: [...ITALY_APPROVAL_CLAUSES],
      leg: "IP",
      evidenceCiphertext: Buffer.alloc(29),
      keyId: "0".repeat(16)
    };
    const input: Pick<PendingAccountInput, "italyApproval"> = { italyApproval: row };
    expect(input.italyApproval?.leg).toBe("IP");
  });
});
