import assert from "node:assert/strict";
import test from "node:test";
import { selectAdditionalRecommendations, selectTopRecommendation } from "./recommendation.ts";

const recommendation = (overrides) => ({
  priority: 1,
  action: "challenge",
  reason: "reason",
  target_node_id: null,
  ...overrides
});

const orderedReasons = (items) => [
  selectTopRecommendation(items)?.reason,
  ...selectAdditionalRecommendations(items).map((item) => item.reason)
];

// B30 (same class as L2-F4): a tiebreak that asks the host's locale is not a tiebreak.
// `localeCompare` puts "a" before "B" under ICU collation and the other way round under
// the C locale, so two machines could show one debate's recommendations in two orders.
// UTF-16 code-unit order is the same everywhere: "B" (0x42) sorts before "a" (0x61).
test("B30: a reason tie breaks by code units, not by host collation", () => {
  assert.deepEqual(
    orderedReasons([recommendation({ reason: "a lower-case reason" }), recommendation({ reason: "B upper-case reason" })]),
    ["B upper-case reason", "a lower-case reason"]
  );
});

test("B30: priority still orders first and action second", () => {
  assert.deepEqual(orderedReasons([
    recommendation({ priority: 2, action: "challenge", reason: "fourth" }),
    recommendation({ priority: 1, action: "support", reason: "third" }),
    recommendation({ priority: 1, action: "challenge", reason: "second" }),
    recommendation({ priority: 0, action: "support", reason: "first" })
  ]), ["first", "second", "third", "fourth"]);
});

test("B30: the order does not depend on the order the input arrives in", () => {
  const items = ["Zeta", "alpha", "Beta", "émile", "eve"].map((reason) => recommendation({ reason }));
  assert.deepEqual(orderedReasons(items), orderedReasons([...items].reverse()));
  assert.deepEqual(orderedReasons(items), ["Beta", "Zeta", "alpha", "eve", "émile"]);
});
