import { describe, expect, it } from "vitest";
import {
  selectAdditionalRecommendations,
  selectTopRecommendation
} from "../../apps/ui/lib/recommendation.js";

type Recommendation = Parameters<typeof selectAdditionalRecommendations>[0] extends
  (infer Item)[] | null | undefined ? Item : never;

function recommendation(overrides: Partial<Recommendation>): Recommendation {
  return {
    priority: 1,
    action: "challenge",
    reason: "reason",
    target_node_id: null,
    ...overrides
  } as Recommendation;
}

// B30 (same class as L2-F4): a tiebreak that asks the host's locale is not a tiebreak.
// `localeCompare` puts "a" before "B" under ICU collation and the other way round under
// the C locale, so two machines could show one debate's recommendations in two orders.
// UTF-16 code-unit order is the same everywhere: "B" (0x42) sorts before "a" (0x61).
describe("B30 — recommendation order does not depend on the host locale", () => {
  it("breaks a reason tie by code units, not by collation", () => {
    const ordered = [
      selectTopRecommendation([recommendation({ reason: "a lower-case reason" }), recommendation({ reason: "B upper-case reason" })]),
      ...selectAdditionalRecommendations([recommendation({ reason: "a lower-case reason" }), recommendation({ reason: "B upper-case reason" })])
    ].map((item) => item?.reason);
    expect(ordered).toEqual(["B upper-case reason", "a lower-case reason"]);
  });

  it("still orders by priority first and by action second", () => {
    const ordered = selectAdditionalRecommendations([
      recommendation({ priority: 2, action: "challenge", reason: "third" }),
      recommendation({ priority: 1, action: "support", reason: "second" }),
      recommendation({ priority: 1, action: "challenge", reason: "first" }),
      recommendation({ priority: 0, action: "support", reason: "top" })
    ]).map((item) => item.reason);
    expect(ordered).toEqual(["first", "second", "third"]);
  });

  it("gives the same order whatever order the input arrives in", () => {
    const items = ["Zeta", "alpha", "Beta", "émile", "eve"].map((reason) => recommendation({ reason }));
    const forward = selectAdditionalRecommendations(items).map((item) => item.reason);
    const backward = selectAdditionalRecommendations([...items].reverse()).map((item) => item.reason);
    expect(forward).toEqual(backward);
    expect([selectTopRecommendation(items)?.reason, ...forward]).toEqual(["Beta", "Zeta", "alpha", "eve", "émile"]);
  });
});
