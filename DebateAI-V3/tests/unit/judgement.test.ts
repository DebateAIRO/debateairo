import { describe, expect, it } from "vitest";
import { Judge } from "@debateai/judgement";
import type { ProviderGateway } from "@debateai/providers";

describe("Organ 2 / P4 — one-node judge contract", () => {
  it("parses a provider artifact and relabels unpinned LOOKED_UP as REASONING", async () => {
    const provider: ProviderGateway = {
      call: async () => ({
        rawArtifactRef: "artifact:test",
        ledgerEntryRef: "ledger:test",
        content: JSON.stringify({
          statement: "A test-layer judgement.",
          way_of_knowing: "LOOKED_UP",
          locator: null,
          restatement_text: "A test-layer judgement.",
          restatement_status: "PASS",
          value_laden: false,
          steelman: { summary: "Strongest test-layer version.", fidelity: 0.8 },
          critic: { summary: "Plausible test-layer counter.", counterargumentStrength: 0.2, basis: "PLAUSIBLE_COUNTER" },
          evidence: { quality: 0.7, relevance: 0.9 },
          context: { fit: 0.8, ambiguityFlags: [] },
          fallacy: { severity: 0.1, fatalFlags: [] }
        }),
        provider: "openai-compatible-http",
        model: "fixture/model",
        maker: "fixture",
        modelVersion: "fixture-version"
      })
    };
    const judge = new Judge(provider);
    const result = await judge.judge({
      runId: null,
      subjectItemId: "node:test",
      callSiteKey: "fixture:judge",
      questionLine: "Test-layer question",
      providerRef: "provider:test",
      contractHash: "contract:test",
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 }
    });
    expect(result).toMatchObject({
      wayOfKnowing: "REASONING",
      provenanceRef: "artifact:test",
      restatementStatus: "PASS"
    });
    expect(result.assessment.steelman.fidelity).toBe(0.8);
  });

  it("rejects invalid judge content instead of synthesizing a node", async () => {
    const provider: ProviderGateway = {
      call: async () => ({
        rawArtifactRef: "artifact:bad",
        ledgerEntryRef: "ledger:bad",
        content: "not-json",
        provider: "openai-compatible-http",
        model: "fixture/model",
        maker: "fixture",
        modelVersion: "fixture-version"
      })
    };
    await expect(new Judge(provider).judge({
      runId: null,
      subjectItemId: "node:test",
      callSiteKey: "fixture:judge",
      questionLine: "Test-layer question",
      providerRef: "provider:test",
      contractHash: "contract:test",
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 }
    })).rejects.toMatchObject({ code: "JUDGE_PARSE_FAILURE" });
  });

  it("FX-LG-16 keeps schema failure distinct from parse failure", async () => {
    const provider: ProviderGateway = { call: async () => ({
      rawArtifactRef: "artifact:schema-bad", ledgerEntryRef: "ledger:schema-bad",
      content: JSON.stringify({ steelman: {} }), provider: "openai-compatible-http",
      model: "fixture/model", maker: "fixture", modelVersion: "fixture-version"
    }) };
    await expect(new Judge(provider).judge({
      runId: null, subjectItemId: "node:test", callSiteKey: "fixture:judge",
      questionLine: "Test-layer question", providerRef: "provider:test",
      contractHash: "contract:test", bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 }
    })).rejects.toMatchObject({ code: "JUDGE_SCHEMA_FAILURE" });
  });
});
