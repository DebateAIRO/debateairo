import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildAcceptanceRegisterRows } from "./seed-register.js";
import { parseAcceptanceRuntimeRows } from "./runtime-policy.js";
import { loadAcceptanceCeremonyEnvironment } from "./main.js";

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

  it("types the DR-177 provider roster with the third Grok/xAI maker and floor unchanged", async () => {
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
      { providerRef: "acceptance:claude-cli", adapterKind: "openai-compatible-http", maker: "Anthropic" },
      { providerRef: "acceptance:grok-cli", adapterKind: "openai-compatible-http", maker: "xAI" }
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

  it("requires an operator-supplied Grok relay port instead of inventing a number", () => {
    const source = {
      ACCEPTANCE_DB_PORT: "55432",
      ACCEPTANCE_API_HOST: "127.0.0.1",
      ACCEPTANCE_API_PORT: "8790",
      ACCEPTANCE_SHIM_PORT: "8791",
      ACCEPTANCE_GROK_RELAY_PORT: "8794",
      ACCEPTANCE_STRANGER_SAMPLE_RATE: "1",
      ACCEPTANCE_BATTERY_VERSION: "acceptance-test",
      ACCEPTANCE_SETTLEMENT_WATCH_HANDLE: "acceptance:test"
    };
    expect(loadAcceptanceCeremonyEnvironment(source).ACCEPTANCE_GROK_RELAY_PORT).toBe(8794);
    const { ACCEPTANCE_GROK_RELAY_PORT: _removed, ...withoutPort } = source;
    expect(() => loadAcceptanceCeremonyEnvironment(withoutPort)).toThrow();
  });
});
