import { describe, expect, it } from "vitest";
import type { ProviderDiscoveryTarget } from "@debateai/providers";
import { buildProviderPriceMap } from "@debateai/runner";
import { buildApiProviderPriceMap } from "../../apps/api/src/provider-discovery.js";

function target(providerRef: string, prices?: readonly [number, number]): ProviderDiscoveryTarget {
  return Object.freeze({
    providerRef,
    maker: `maker:${providerRef}`,
    baseUrl: "https://vendor.example.test/v1",
    model: `model:${providerRef}`,
    ...(prices === undefined ? {} : {
      inputPriceMicrosPerMillionTokens: prices[0],
      outputPriceMicrosPerMillionTokens: prices[1]
    })
  });
}

describe("B2 the API prices recent debates with the runner's own map (budget spec §2.5)", () => {
  const targets = [
    target("provider:a", [100_000, 500_000]),
    target("provider:b", [4_000_000, 20_000_000]),
    target("provider:unpriced")
  ];

  it("builds exactly the runner's map in hosted mode, leaving an unpriced target out", () => {
    expect([...buildApiProviderPriceMap(targets, "hosted")]).toEqual([...buildProviderPriceMap(targets, "hosted")]);
    expect([...buildApiProviderPriceMap(targets, "hosted").keys()]).toEqual(["provider:a", "provider:b"]);
  });

  it("is empty in local mode, as the runner's is", () => {
    expect(buildApiProviderPriceMap(targets, "local").size).toBe(0);
    expect(buildProviderPriceMap(targets, "local").size).toBe(0);
  });
});
