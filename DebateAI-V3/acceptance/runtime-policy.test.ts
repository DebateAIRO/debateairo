import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildAcceptanceRegisterRows } from "./seed-register.js";
import { parseAcceptanceRuntimeRows } from "./runtime-policy.js";

describe("ACC-01 acceptance runtime policy", () => {
  it("accepts the complete DR-159 depth-by-reachable-tier envelope", async () => {
    const rows = Object.fromEntries((await buildAcceptanceRegisterRows()).map((row) => [row.rowKey, row.value]));
    const members = [1, 2, 3, 4, 5].flatMap((depth) => [
      { depth_params: { depth }, risk_tier: "standard", max_model_attempts: 42 },
      { depth_params: { depth }, risk_tier: "high-stakes", max_model_attempts: 42 }
    ]);

    expect(() => parseAcceptanceRuntimeRows({
      riskTier: rows.riskTier,
      acceptanceOrganCostBounds: rows.acceptanceOrganCostBounds,
      runCostEnvelope: { kind: "RUN_COST_ENVELOPE_POLICY", members },
      runDeathPolicy: rows.runDeathPolicy,
      hiddenNodeScoreThreshold: rows.hiddenNodeScoreThreshold,
      compositionBundleBudget: rows.compositionBundleBudget,
      wayOfKnowingCeiling: rows.wayOfKnowingCeiling,
      configuredProviderSet: rows.configuredProviderSet,
      judgeContractHash: rows.judgeContractHash,
      composerContractHash: rows.composerContractHash,
      conformanceContractHash: rows.conformanceContractHash,
      propagationContractHash: rows.propagationContractHash,
      serveContractHash: rows.serveContractHash
    })).not.toThrow();
  });

  it("accepts the ruled partial way-of-knowing share map without inventing absent shares", async () => {
    const rows = Object.fromEntries((await buildAcceptanceRegisterRows()).map((row) => [row.rowKey, row.value]));
    const parsed = parseAcceptanceRuntimeRows({
      riskTier: rows.riskTier,
      acceptanceOrganCostBounds: rows.acceptanceOrganCostBounds,
      runCostEnvelope: rows.runCostEnvelope,
      runDeathPolicy: rows.runDeathPolicy,
      hiddenNodeScoreThreshold: rows.hiddenNodeScoreThreshold,
      compositionBundleBudget: rows.compositionBundleBudget,
      wayOfKnowingCeiling: rows.wayOfKnowingCeiling,
      configuredProviderSet: rows.configuredProviderSet,
      judgeContractHash: rows.judgeContractHash,
      composerContractHash: rows.composerContractHash,
      conformanceContractHash: rows.conformanceContractHash,
      propagationContractHash: rows.propagationContractHash,
      serveContractHash: rows.serveContractHash
    });

    expect(parsed.wayOfKnowingCeiling.cuts[0]?.minimumShares).toEqual({ REASONING: 0.5 });
    expect(parsed.wayOfKnowingCeiling.cuts[0]?.minimumShares).not.toHaveProperty("LOOKED_UP");
    expect(parsed.wayOfKnowingCeiling.cuts[0]?.minimumShares).not.toHaveProperty("RAN");
  });

  it("types the FAIR-02 two-maker provider set: codex/OpenAI plus claude/Anthropic, floor unchanged", async () => {
    const rows = Object.fromEntries((await buildAcceptanceRegisterRows()).map((row) => [row.rowKey, row.value]));
    const parsed = parseAcceptanceRuntimeRows({
      riskTier: rows.riskTier,
      acceptanceOrganCostBounds: rows.acceptanceOrganCostBounds,
      runCostEnvelope: rows.runCostEnvelope,
      runDeathPolicy: rows.runDeathPolicy,
      hiddenNodeScoreThreshold: rows.hiddenNodeScoreThreshold,
      compositionBundleBudget: rows.compositionBundleBudget,
      wayOfKnowingCeiling: rows.wayOfKnowingCeiling,
      configuredProviderSet: rows.configuredProviderSet,
      judgeContractHash: rows.judgeContractHash,
      composerContractHash: rows.composerContractHash,
      conformanceContractHash: rows.conformanceContractHash,
      propagationContractHash: rows.propagationContractHash,
      serveContractHash: rows.serveContractHash
    });

    expect(parsed.configuredProviderSet.requiredDistinctMakers).toBe(1);
    expect(parsed.configuredProviderSet.providers).toEqual([
      { providerRef: "acceptance:codex-cli", adapterKind: "openai-compatible-http", maker: "OpenAI" },
      { providerRef: "acceptance:claude-cli", adapterKind: "openai-compatible-http", maker: "Anthropic" }
    ]);
  });

  it("delegates maker admission and the run-level envelope basis to shipped rules", async () => {
    const [mainSource, policySource] = await Promise.all([
      readFile(new URL("./main.ts", import.meta.url), "utf8"),
      readFile(new URL("./runtime-policy.ts", import.meta.url), "utf8")
    ]);

    expect(mainSource).toContain("readDeploymentMakerCapability");
    expect(mainSource).toContain("resolveRunCostEnvelopeBasis");
    expect(mainSource).not.toContain("deploymentMakerCapability: true");
    expect(policySource).toContain("readRunCostEnvelopePolicy");
    expect(policySource).not.toContain("const totalAttempts");
    expect(policySource).not.toContain("max_model_attempts: totalAttempts");
  });
});
