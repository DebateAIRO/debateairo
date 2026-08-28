import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createRunnerProviderTopology } from "../../apps/runner/src/provider-topology.js";

describe("production runner provider topology", () => {
  it.each([1, 2, 4])("wires all %i configured providers without a fixed panel size", (size) => {
    const targets = Array.from({ length: size }, (_, index) => Object.freeze({
      providerRef: `provider-${index + 1}`,
      maker: `maker-${index + 1}`,
      baseUrl: `http://127.0.0.1:${9200 + index}/v1`,
      model: `model-${index + 1}`
    }));
    const topology = createRunnerProviderTopology(targets, (target) => ({
      call: async () => ({
        rawArtifactRef: "raw", ledgerEntryRef: "ledger", content: "{}",
        provider: "openai-compatible-http" as const, model: target.model,
        maker: target.maker, modelVersion: target.model
      })
    }));

    expect(topology.primary.providerRef).toBe("provider-1");
    expect(topology.critique?.providerRef).toBe(size > 1 ? "provider-2" : undefined);
    expect(topology.additionalMakers.map((row) => row.providerRef)).toEqual(
      Array.from({ length: Math.max(0, size - 2) }, (_, index) => `provider-${index + 3}`)
    );
    expect([
      topology.primary,
      ...(topology.critique === undefined ? [] : [topology.critique]),
      ...topology.additionalMakers
    ].map((row) => row.maker)).toEqual(targets.map((row) => row.maker));
  });

  it("uses the exact sealed configured-provider set at the real runner entrypoint", async () => {
    const source = await readFile("apps/runner/src/main.ts", "utf8");
    expect(source).toContain("readDeploymentMakerCapability");
    expect(source).toContain("parseProviderDiscoveryTargets");
    expect(source).toContain("createRunnerProviderTopology");
    expect(source).toContain("critique: providerTopology.critique");
    expect(source).toContain("additionalMakers: providerTopology.additionalMakers");
  });

  it("loads every mandatory runner policy from the selected sealed register version", async () => {
    const source = await readFile("apps/runner/src/main.ts", "utf8");
    expect(source).toContain("readDevelopmentRunnerPolicy(pool, environment.REGISTER_VERSION)");
    for (const setting of [
      "compositionRow: policy.compositionRow",
      "servePolicy:",
      "judgementPolicy: policy.judgementPolicy",
      "scoringOperator: policy.scoringOperator",
      "runDeathPolicy: policy.runDeathPolicy",
      "hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold",
      "holdRecorder:"
    ]) expect(source).toContain(setting);
  });
});
