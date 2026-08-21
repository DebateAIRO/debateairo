import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CLAIM_TYPES } from "@debateai/kernel";
import {
  ACCEPTANCE_CONVERGENCE_SOURCE_REF,
  ACCEPTANCE_HIDDEN_SCORE_SOURCE_REF,
  ACCEPTANCE_PROVIDER_SET_SOURCE_REF,
  ACCEPTANCE_REGISTER_SOURCE_REF,
  ACCEPTANCE_RUN_DEATH_POLICY_SOURCE_REF,
  ACCEPTANCE_DISCOVERY_SOURCE_REF,
  ACCEPTANCE_SCORING_OPERATOR_SOURCE_REF,
  buildAcceptanceRegisterRows
} from "./seed-register.js";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

async function expectedContractHashes(): Promise<Record<string, string>> {
  const [judge, runner, propagation, serve] = await Promise.all([
    readFile(new URL("../packages/judgement/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../apps/runner/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../packages/propagation/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../packages/serve/src/index.ts", import.meta.url), "utf8")
  ]);
  const judgeText = judge.match(/content: `([\s\S]*?)`/)?.[1];
  const composerText = runner.match(/content: "(Return only JSON with a segments array[^"]+)"/)?.[1];
  const conformanceTexts = [...runner.matchAll(/content: "(Return only JSON \{(?:conforms,findings|pass)\}[^\"]+)"/g)]
    .map((match) => match[1]);
  if (judgeText === undefined || composerText === undefined || conformanceTexts.length !== 2) {
    throw new Error("TEST_CONTRACT_TEXT_EXTRACTION_FAILED");
  }
  return {
    judgeContractHash: sha256(judgeText),
    composerContractHash: sha256(composerText),
    conformanceContractHash: sha256(conformanceTexts.join("\n")),
    propagationContractHash: sha256(propagation),
    serveContractHash: sha256(serve)
  };
}

describe("ACC-01 acceptance register", () => {
  it("materializes the V-approved DR-133 values byte-faithfully and computes contract hashes from shipped text", async () => {
    const rows = await buildAcceptanceRegisterRows();
    const byKey = Object.fromEntries(rows.map((row) => [row.rowKey, row]));

    expect(rows.filter((row) => ![
      "convergenceStopDefaults",
      "panelDiscoveryPolicy",
      "runDeathPolicy",
      "hiddenNodeScoreThreshold",
      "claimTypeCompositionMap",
      "configuredProviderSet",
      "scoringOperator"
    ].includes(row.rowKey))
      .every((row) => row.sourceRef === ACCEPTANCE_REGISTER_SOURCE_REF)).toBe(true);
    expect(byKey.riskTier?.value).toBe("standard");
    // DR-144: V ruled the DR-074 mandatory deployment scoringOperator row =
    // "accumulate" (provisional pending the DR-023 sitting), seeded
    // byte-faithfully with its own ruling provenance.
    expect(byKey.scoringOperator).toEqual({
      rowKey: "scoringOperator",
      value: "accumulate",
      sourceRef: ACCEPTANCE_SCORING_OPERATOR_SOURCE_REF
    });
    expect(ACCEPTANCE_SCORING_OPERATOR_SOURCE_REF).toBe("acceptance:DR-144:V-approved");
    // DR-142: the normative entry is V-approved with its own provenance
    // (same discipline as DR-136's convergenceStopDefaults row).
    // DR-151: V ratified the six remaining CLAIM_TYPES with that SAME shape,
    // so no question can be refused for want of a composition. Every entry is
    // deliberately identical — claim type carries no differential scoring yet.
    expect(byKey.claimTypeCompositionMap?.sourceRef).toBe("acceptance:DR-142:V-approved");
    const RULED_COMPOSITION = {
      branch: "EVIDENCE_AWARE",
      clarityDecayPerAmbiguity: 0.1,
      terms: [{ metric: "steelman_fidelity", coefficient: 1 }],
      caps: [],
      uncertaintyLadder: [{ atMost: 1, label: "PROVISIONAL" }]
    };
    expect(byKey.claimTypeCompositionMap?.value).toEqual({
      kind: "CLAIM_TYPE_COMPOSITION_MAP",
      entries: {
        unknown: RULED_COMPOSITION,
        normative: RULED_COMPOSITION,
        empirical: RULED_COMPOSITION,
        causal: RULED_COMPOSITION,
        definitional: RULED_COMPOSITION,
        prediction: RULED_COMPOSITION,
        comparative: RULED_COMPOSITION,
        mixed: RULED_COMPOSITION
      }
    });
    // The map must stay CLOSED over the claim-type vocabulary: adding a claim
    // type to CLAIM_TYPES without a V-ruled composition reopens exactly the
    // COMPOSITION_UNRESOLVED wall DR-151 was minted to end.
    expect(Object.keys((byKey.claimTypeCompositionMap?.value as { entries: Record<string, unknown> }).entries).sort())
      .toEqual([...CLAIM_TYPES].sort());
    expect(byKey.wayOfKnowingCeiling?.value).toEqual({
      bandOrder: ["CAPPED", "FULL"],
      ceilingLabels: ["DEFAULT_CEILING", "REASONING_CEILING"],
      defaultCeiling: { label: "DEFAULT_CEILING", ceilingBand: "FULL", liftPath: "retain-band" },
      cuts: [{
        minimumShares: { REASONING: 0.5 },
        label: "REASONING_CEILING",
        ceilingBand: "CAPPED",
        liftPath: "gather-evidence-to-lift"
      }]
    });
    expect(byKey.acceptanceOrganCostBounds).toEqual({
      rowKey: "acceptanceOrganCostBounds",
      value: {
        kind: "ACCEPTANCE_ORGAN_COST_BOUNDS",
        organs: {
          JUDGE: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 180_000 },
          COMPOSER: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 60_000 },
          CONFORMANCE: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 60_000 }
        }
      },
      sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF
    });
    expect(byKey.panelDiscoveryPolicy).toEqual({
      rowKey: "panelDiscoveryPolicy",
      value: {
        kind: "PANEL_DISCOVERY_POLICY",
        probe_freshness_ms: 600_000,
        probe_max_attempts: 1
      },
      sourceRef: ACCEPTANCE_DISCOVERY_SOURCE_REF
    });
    expect(byKey.runDeathPolicy).toEqual({
      rowKey: "runDeathPolicy",
      value: {
        kind: "RUN_DEATH_POLICY",
        cooldown_ms: 600_000,
        final_retry_attempts: 1,
        max_cooldown_holds_per_run: 2,
        applies_to: "TRANSPORT_EXHAUSTION"
      },
      sourceRef: ACCEPTANCE_RUN_DEATH_POLICY_SOURCE_REF
    });
    expect(ACCEPTANCE_RUN_DEATH_POLICY_SOURCE_REF).toBe("acceptance:DR-174:V-approved");
    expect(byKey.hiddenNodeScoreThreshold).toEqual({
      rowKey: "hiddenNodeScoreThreshold",
      value: 0.35,
      sourceRef: ACCEPTANCE_HIDDEN_SCORE_SOURCE_REF
    });
    expect(ACCEPTANCE_HIDDEN_SCORE_SOURCE_REF).toBe("acceptance:DR-176:V-approved");
    expect(ACCEPTANCE_DISCOVERY_SOURCE_REF).toBe("acceptance:DR-182:V-approved");
    expect(byKey.compositionBundleBudget?.value).toEqual({ low: 10_000, medium: 20_000, high: 30_000 });
    expect(byKey.convergenceEpsilon?.value).toBe(0.001);
    expect(byKey.convergenceStopDefaults).toEqual({
      rowKey: "convergenceStopDefaults",
      value: {
        kind: "CONVERGENCE_STOP_DEFAULTS",
        members: { maxRounds: 3, stopWhenDeltaBelowEpsilon: true }
      },
      sourceRef: ACCEPTANCE_CONVERGENCE_SOURCE_REF
    });
    // DR-141(3): the canonical livenessPolicy shape is the SHIPPED reader's
    // classes{} record; the seed row aligns to it.
    expect(byKey.livenessPolicy?.value).toEqual({
      kind: "LIVENESS_POLICY",
      classes: { standard: { review_after_ms: 604_800_000, retire_after_ms: 15_552_000_000 } }
    });
    // FAIR-02 (DR-140): the provider set gains the SECOND real maker — the
    // Claude Code CLI relay, maker Anthropic — and the updated row carries the
    // DR-140 ruling as its provenance. requiredDistinctMakers stays 1: DR-137
    // keeps mono-model admission lawful for casual/standard; the >1-maker
    // fair-debate requirement is DR-140(b) run-level law, not a deployment
    // capability floor edit.
    expect(byKey.configuredProviderSet?.sourceRef).toBe(ACCEPTANCE_PROVIDER_SET_SOURCE_REF);
    expect(ACCEPTANCE_PROVIDER_SET_SOURCE_REF).toBe("acceptance:DR-177:V-approved");
    expect(byKey.configuredProviderSet?.value).toEqual({
      kind: "CONFIGURED_PROVIDER_SET",
      requiredDistinctMakers: 1,
      providers: [
        { providerRef: "acceptance:codex-cli", adapterKind: "openai-compatible-http", maker: "OpenAI" },
        { providerRef: "acceptance:claude-cli", adapterKind: "openai-compatible-http", maker: "Anthropic" },
        { providerRef: "acceptance:grok-cli", adapterKind: "openai-compatible-http", maker: "xAI" }
      ]
    });

    const expectedHashes = await expectedContractHashes();
    for (const [rowKey, digest] of Object.entries(expectedHashes)) {
      expect(byKey[rowKey]?.value).toBe(digest);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
    }
  });

});
