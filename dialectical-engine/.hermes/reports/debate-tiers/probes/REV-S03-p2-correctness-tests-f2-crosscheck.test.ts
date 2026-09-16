// REV-S03-p2-correctness-tests — F2 cross-check probe (charge 3).
// Head d35a9634. TEMPORARY: deleted before handoff.
import { describe, expect, it } from "vitest";
import { PlanTierRostersSchema, PLAN_TIER_ROSTERS } from "@debateai/contract";
import { loadModelConfig } from "@debateai/model-config";

describe("REV-S03-p2 F2 cross-check — the user-readable roster surface", () => {
  // The strictness the FIX claims: a malformed row is refused, not silently projected.
  it("X1 refuses every malformed roster row shape", () => {
    const refused: readonly unknown[] = [
      undefined,                                             // the row is absent entirely
      null,
      {},                                                    // neither key
      { free: ["a"] },                                       // missing premium
      { premium: ["a"] },                                    // missing free
      { free: "a", premium: ["b"] },                         // not an array
      { free: [""], premium: ["b"] },                        // blank model id
      { free: ["   "], premium: ["b"] },                     // whitespace-only id
      { free: ["a"], premium: [1] },                         // non-string id
      { free: ["a"], premium: ["b"], hidden: ["c"] },        // unknown key (.strict)
      { free: ["a"], premium: ["b"], __proto__: ["c"] }
    ];
    for (const value of refused) {
      expect(() => PlanTierRostersSchema.parse(value), JSON.stringify(value ?? null)).toThrow();
    }
  });

  // The boundary the FIX does NOT refuse — recorded, measured, not assumed.
  it("X2 ADMITS an empty-but-well-formed row, which renders as empty cards with no refusal", () => {
    const parsed = PlanTierRostersSchema.parse({ free: [], premium: [] });
    expect(parsed).toEqual({ free: [], premium: [] });
  });

  // Is that reachable from the FILE, or only from a corrupt register row?
  it("X3 the committed file's tiers are non-empty, and the loader is the only file-side guard", () => {
    const config = loadModelConfig(process.cwd());
    expect(config.free.length).toBeGreaterThan(0);
    expect(config.premium.length).toBeGreaterThan(0);
  });

  // The source property: the response must be the REGISTER ROW, never the compiled constant.
  // Exceeds the shipped case by asserting the projection differs from PLAN_TIER_ROSTERS.
  it("X4 projects a register row that differs from the compiled PLAN_TIER_ROSTERS", () => {
    const row = { free: ["row-only-free"], premium: ["row-only-premium"] };
    const projected = PlanTierRostersSchema.parse(row);
    expect(projected).toEqual(row);
    expect(projected.free).not.toEqual([...PLAN_TIER_ROSTERS.free]);
    expect(projected.premium).not.toEqual([...PLAN_TIER_ROSTERS.premium]);
  });

  // The compiled constant still deep-equals the committed file (S8/S9 unchanged by the FIX).
  it("X5 PLAN_TIER_ROSTERS still deep-equals the committed config/models.yaml", () => {
    const config = loadModelConfig(process.cwd());
    expect([...PLAN_TIER_ROSTERS.free]).toEqual(config.free.map((entry) => entry.model));
    expect([...PLAN_TIER_ROSTERS.premium]).toEqual(config.premium.map((entry) => entry.model));
  });
});
