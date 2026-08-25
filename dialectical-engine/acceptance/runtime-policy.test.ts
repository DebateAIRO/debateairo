import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildAcceptanceRegisterRows } from "./seed-register.js";
import { computeAcceptanceStructuralCeiling, parseAcceptanceRuntimeRows } from "./runtime-policy.js";
import { loadAcceptanceCeremonyEnvironment } from "./main.js";

describe("ACC-01 acceptance runtime policy", () => {
  it("accepts the ruled DR-182 discovery freshness and one-attempt policy", async () => {
    const rows = Object.fromEntries((await buildAcceptanceRegisterRows()).map((row) => [row.rowKey, row.value]));

    expect(() => parseAcceptanceRuntimeRows({
      riskTier: rows.riskTier,
      acceptanceOrganCostBounds: rows.acceptanceOrganCostBounds,
      panelDiscoveryPolicy: rows.panelDiscoveryPolicy,
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
      panelDiscoveryPolicy: rows.panelDiscoveryPolicy,
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
      panelDiscoveryPolicy: rows.panelDiscoveryPolicy,
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

  it("pins the live composition root to complete discovery and register-owned structural bounds", async () => {
    const [mainSource, policySource, panelProofSource, reviewProofSource] = await Promise.all([
      readFile(new URL("./main.ts", import.meta.url), "utf8"),
      readFile(new URL("./runtime-policy.ts", import.meta.url), "utf8"),
      readFile(new URL("./panel01-depth1-proof.ts", import.meta.url), "utf8"),
      readFile(new URL("./xrev01-depth1-proof.ts", import.meta.url), "utf8")
    ]);

    expect(mainSource).toContain("ProviderProbeRepository");
    expect(mainSource).toContain("resolveFreshDiscovery({");
    expect(mainSource).toContain("return toDiscoveredPanel(resolved.panel);");
    expect(mainSource).not.toMatch(/\.slice\(0,\s*2\)/);
    expect(mainSource).toContain("computeAcceptanceStructuralCeiling(policy, policy.providers.length, 5)");
    expect(mainSource).toContain(
      "computeAcceptanceStructuralCeiling(policy, basis.panelSize, Number(basis.depthParams.depth))"
    );
    expect(mainSource).not.toContain("computeStructuralCeilingBasis");
    expect(mainSource).not.toContain("deploymentMakerCapability: true");
    expect(policySource).toContain("panelDiscoveryPolicy");
    expect(policySource).not.toContain("const totalAttempts");
    expect(policySource).not.toContain("max_model_attempts: totalAttempts");
    expect(computeAcceptanceStructuralCeiling({
      bounds: {
        JUDGE: { maxAttempts: 3, tokenCeiling: 1, deadlineMs: 1 },
        COMPOSER: { maxAttempts: 3, tokenCeiling: 1, deadlineMs: 1 },
        CONFORMANCE: { maxAttempts: 3, tokenCeiling: 1, deadlineMs: 1 }
      },
      runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 2 }
    }, 2, 1)).toMatchObject({
      max_model_attempts: 88,
      per_site_attempts: { judge: 3, organ: 3 }
    });
    for (const proofSource of [panelProofSource, reviewProofSource]) {
      expect(proofSource).toContain("structuralCeilingMaxModelAttempts");
      expect(proofSource).toContain("providerProbeEvidenceCount");
      expect(proofSource).not.toMatch(/M=2|\/42|DR159|RATIFIED_ENVELOPE/);
    }
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
