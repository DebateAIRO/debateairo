// TEMPORARY REVIEW FIXTURE — REV-MERGE-ALL, deleted before handoff. Never committed.
import { describe, expect, it } from "vitest";
import { authorizationPolicyInventory } from "@debateai/api";
import { contractInventory } from "@debateai/contract";

describe("REV-MERGE-ALL S7 drift probe", () => {
  it("names the routes that are governed but not in the contract inventory", () => {
    const governed = authorizationPolicyInventory.map((policy) => policy.route);
    const routes = new Set<string>(contractInventory.routes);
    const extraPolicy = governed.filter((route) => !routes.has(route));
    const extraContract = contractInventory.routes.filter((route) => !governed.includes(route));
    // eslint-disable-next-line no-console
    console.log("S7_DRIFT", JSON.stringify({
      governed: governed.length,
      inventory: contractInventory.routes.length,
      inPolicyNotContract: extraPolicy,
      inContractNotPolicy: extraContract
    }, null, 1));
    expect(governed.length).toBeGreaterThan(0);
  });
});
