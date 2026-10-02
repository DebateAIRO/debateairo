import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW,
  costEnvelopeBand,
  costEnvelopePolicyFromValue
} from "@debateai/register";

/**
 * Budget spec 2026-09-28 §2.4 — THE BAND: three OPTIONAL members of a new
 * costEnvelopePolicy version, all present or all absent. Absent is today's
 * behaviour exactly; every version already sealed keeps what it sealed.
 */
const BAND_MEMBERS = [
  "admission_close_basis_points",
  "finish_up_to_basis_points",
  "waiting_line_per_person"
] as const;

function rowWithout(...members: readonly string[]): Record<string, unknown> {
  const value: Record<string, unknown> = { ...COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value };
  for (const member of members) delete value[member];
  return value;
}

function codeOf(value: unknown): string {
  try {
    costEnvelopePolicyFromValue(value, "test");
  } catch (error) {
    return error instanceof TypedDomainError ? error.code : "UNTYPED";
  }
  return "PARSED";
}

describe("B1 costEnvelopePolicy carries the band (budget spec §2.4)", () => {
  it("parses an OLD row without the three members, and all three read as null", () => {
    const policy = costEnvelopePolicyFromValue(rowWithout(...BAND_MEMBERS), "old row");
    expect(policy).toMatchObject({
      closeBasisPoints: null,
      finishBasisPoints: null,
      waitingLinePerPerson: null,
      // The members that were already there keep their meaning.
      perRunCeilingMicros: 250_000,
      serveReserveBasisPoints: 3_000
    });
    expect(costEnvelopeBand(policy)).toBeNull();
  });

  it("ships the code-owned row with 9500 / 11500 / 1 — a NEW version of the row", () => {
    expect(COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value).toMatchObject({
      admission_close_basis_points: 9_500,
      finish_up_to_basis_points: 11_500,
      waiting_line_per_person: 1
    });
    const policy = costEnvelopePolicyFromValue(
      COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value,
      COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
    );
    expect(costEnvelopeBand(policy)).toEqual({
      closeBasisPoints: 9_500, finishBasisPoints: 11_500, waitingLinePerPerson: 1
    });
  });

  it("refuses one or two members without the rest: all present or all absent", () => {
    for (const kept of BAND_MEMBERS) {
      const others = BAND_MEMBERS.filter((member) => member !== kept);
      expect(codeOf(rowWithout(...others)), `only ${kept}`).toBe("COST_ENVELOPE_POLICY_INVALID");
      expect(codeOf(rowWithout(kept)), `all but ${kept}`).toBe("COST_ENVELOPE_POLICY_INVALID");
    }
  });

  it("holds each member to its range, both edges included", () => {
    const base = rowWithout();
    const cases: ReadonlyArray<readonly [string, readonly unknown[], readonly unknown[]]> = [
      ["admission_close_basis_points", [5_000, 10_000], [4_999, 10_001, 9_500.5, "9500", null]],
      ["finish_up_to_basis_points", [10_000, 20_000], [9_999, 20_001, 11_500.5, null]],
      ["waiting_line_per_person", [1, 10], [0, 11, 1.5, null]]
    ];
    for (const [member, lawful, unlawful] of cases) {
      for (const value of lawful) {
        expect(codeOf({ ...base, [member]: value }), `${member}=${String(value)}`).toBe("PARSED");
      }
      for (const value of unlawful) {
        expect(codeOf({ ...base, [member]: value }), `${member}=${String(value)}`)
          .toBe("COST_ENVELOPE_POLICY_INVALID");
      }
    }
  });
});
