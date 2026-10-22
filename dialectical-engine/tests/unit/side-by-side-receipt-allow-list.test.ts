import { describe, expect, it } from "vitest";
import {
  computeStructuralCeilingBasis, engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues,
  resolveLengthGuidance
} from "@debateai/register";
import { PUBLIC_COST_ENVELOPE_BASIS_MEMBERS, publicCostEnvelopeBasis } from "@debateai/serve";

/**
 * Side-by-side spec §5 (plan C15): two releases read one database, so a receipt minted by a NEWER release can carry a
 * member this code has never heard of. The answer read's `cost_envelope.basis` is an allow-list: only the receipt's known
 * public members are shown, and any other member, known private or unknown, is dropped. A receipt with only public
 * members is returned as the same object, so today's answer body is byte for byte what it was.
 */
const TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 2,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });

describe("the receipt filter keeps only known public members (side-by-side C15)", () => {
  it("names exactly today's public members, in the receipt's minted order", () => {
    expect(PUBLIC_COST_ENVELOPE_BASIS_MEMBERS).toEqual(["kind", "max_model_attempts", "panel_size", "depth",
      "per_site_attempts", "call_sites", "serve_leg", "serve_reserve_attempts", "hold_cap", "final_retry_attempts",
      "formula_version", "bounds_source_ref"]);
    expect(Object.keys(computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 }))).toEqual(PUBLIC_COST_ENVELOPE_BASIS_MEMBERS);
  });

  it("returns today's receipt as the same object", () => {
    const stored = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 });
    expect(publicCostEnvelopeBasis(stored)).toBe(stored);
  });

  it("drops a member a newer release added, and keeps every public member as stored", () => {
    const today = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 }) as Readonly<Record<string, unknown>>;
    const stored: Readonly<Record<string, unknown>> = { ...today, future_member: { x: 1 } };
    const shown = publicCostEnvelopeBasis(stored);
    expect(Object.hasOwn(shown, "future_member")).toBe(false);
    expect(Object.keys(shown)).toEqual(PUBLIC_COST_ENVELOPE_BASIS_MEMBERS);
    for (const member of PUBLIC_COST_ENVELOPE_BASIS_MEMBERS) expect(shown[member], member).toEqual(stored[member]);
    // The stored receipt itself is left as it was.
    expect(stored.future_member).toEqual({ x: 1 });
  });

  it("drops a known private member and an unknown one together", () => {
    const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 3, mapOpening: true });
    const length = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "pro", answerLength: "detailed" });
    const stored = { ...computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, length, engine }), next_release_only: "x" };
    expect(Object.keys(stored)).toEqual([...PUBLIC_COST_ENVELOPE_BASIS_MEMBERS, "length", "engine", "next_release_only"]);
    const shown = publicCostEnvelopeBasis(stored);
    expect(Object.keys(shown)).toEqual(PUBLIC_COST_ENVELOPE_BASIS_MEMBERS);
    expect(shown.max_model_attempts).toBe(stored.max_model_attempts);
  });
});
