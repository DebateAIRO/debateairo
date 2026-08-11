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

  it("declares the complete strict artifact schema so a provider can return ruled judge JSON", async () => {
    const requiredSchemaFragments = [
      '"statement": non-empty string',
      '"way_of_knowing": "LOOKED_UP" | "RAN" | "REASONING"',
      '"locator": non-empty string | null',
      '"restatement_text": non-empty string',
      '"restatement_status": "PASS" | "FAIL" | "NOT_SAMPLED"',
      '"value_laden": boolean',
      'optional "claim_type": "empirical" | "causal" | "normative" | "definitional" | "prediction" | "comparative" | "mixed" | "unknown"',
      '"steelman": { "summary": non-empty string, "fidelity": number [0,1] }',
      '"critic": { "summary": non-empty string, "counterargumentStrength": number [0,1], "basis": "REAL_ATTACK" | "PLAUSIBLE_COUNTER" }',
      '"evidence": { "quality": number [0,1], "relevance": number [0,1] }',
      '"context": { "fit": number [0,1], "ambiguityFlags": non-empty string[] }',
      '"fallacy": { "severity": number [0,1], "fatalFlags": [{ "type": non-empty string, "severity": number [0,1], "description": non-empty string }] }'
    ] as const;
    let systemPrompt = "";
    const provider: ProviderGateway = {
      call: async (request) => {
        systemPrompt = request.packet.messages.find((message) => message.role === "system")?.content ?? "";
        const schemaIsDeclared = requiredSchemaFragments.every((fragment) => systemPrompt.includes(fragment));
        return {
          rawArtifactRef: "artifact:live-shaped",
          ledgerEntryRef: "ledger:live-shaped",
          content: JSON.stringify({
            statement: "A test-layer judgement.",
            way_of_knowing: "REASONING",
            locator: null,
            restatement_text: "A test-layer judgement.",
            restatement_status: "PASS",
            value_laden: false,
            steelman: { summary: "Strongest test-layer version.", fidelity: 0.8 },
            critic: { summary: "Plausible test-layer counter.", counterargumentStrength: 0.2, basis: "PLAUSIBLE_COUNTER" },
            evidence: { quality: 0.7, relevance: 0.9 },
            context: { fit: 0.8, ambiguityFlags: [] },
            fallacy: schemaIsDeclared
              ? { severity: 0.1, fatalFlags: [] }
              : { detected: false, type: null, explanation: "No fallacy detected." }
          }),
          provider: "openai-compatible-http",
          model: "fixture/model",
          maker: "fixture",
          modelVersion: "fixture-version"
        };
      }
    };

    const result = await new Judge(provider).judge({
      runId: null,
      subjectItemId: "node:live-shaped",
      callSiteKey: "fixture:judge-schema-declaration",
      questionLine: "Test-layer question",
      providerRef: "provider:test",
      contractHash: "contract:test",
      bound: { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 60_000 }
    });

    expect(requiredSchemaFragments.every((fragment) => systemPrompt.includes(fragment))).toBe(true);
    expect(result.assessment.fallacy).toEqual({ severity: 0.1, fatalFlags: [] });
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

describe("FAIR-01 / DR-140(b) — one debate, one claim frame", () => {
  const counterArtifact = (claimType?: string) => JSON.stringify({
    statement: "The strongest genuine counter-position.",
    way_of_knowing: "REASONING",
    locator: null,
    restatement_text: "The strongest genuine counter-position.",
    restatement_status: "PASS",
    value_laden: false,
    ...(claimType === undefined ? {} : { claim_type: claimType }),
    steelman: { summary: "Steelmanned counter.", fidelity: 0.7 },
    critic: { summary: "Counter to the counter.", counterargumentStrength: 0.3, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: 0.6, relevance: 0.8 },
    context: { fit: 0.7, ambiguityFlags: [] },
    fallacy: { severity: 0.1, fatalFlags: [] }
  });

  it("classifies the counter-judgement on the debate's own claim frame, not on the position's wording", async () => {
    let systemPrompt = "";
    const provider: ProviderGateway = {
      call: async (request) => {
        systemPrompt = request.packet.messages.find((message) => message.role === "system")?.content ?? "";
        return {
          rawArtifactRef: "artifact:counter",
          ledgerEntryRef: "ledger:counter",
          content: counterArtifact("normative"),
          provider: "openai-compatible-http",
          model: "fixture/model",
          maker: "fixture",
          modelVersion: "fixture-version"
        };
      }
    };
    // The composed counter question embeds the position, whose wording alone
    // would code-classify "causal" ("leads to"). The debate's claim frame is
    // the original question line, which code-classifies unknown, so the model
    // claim_type must be consulted — same rule as the position side.
    const result = await new Judge(provider).judge({
      runId: null,
      subjectItemId: "work:counter",
      callSiteKey: "JUDGE:critic",
      questionLine: "State the strongest genuine counter-position. Position: adopting the proposal leads to higher retention.",
      claimClassificationLine: "What is the strongest case for adopting this proposal?",
      providerRef: "provider:test",
      contractHash: "contract:test",
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 }
    });
    expect(result.normalizedClaim.claimType).toBe("normative");
    expect(result.normalizedClaim.substance).toBe("model");
    expect(systemPrompt).toContain("include claim_type from the declared closed vocabulary");
  });

  it("keeps the code-first classification when the classification line resolves on its own", async () => {
    let systemPrompt = "";
    const provider: ProviderGateway = {
      call: async (request) => {
        systemPrompt = request.packet.messages.find((message) => message.role === "system")?.content ?? "";
        return {
          rawArtifactRef: "artifact:counter",
          ledgerEntryRef: "ledger:counter",
          content: counterArtifact(),
          provider: "openai-compatible-http",
          model: "fixture/model",
          maker: "fixture",
          modelVersion: "fixture-version"
        };
      }
    };
    const result = await new Judge(provider).judge({
      runId: null,
      subjectItemId: "work:counter",
      callSiteKey: "JUDGE:critic",
      questionLine: "State the strongest genuine counter-position. Position: the observed data is decisive.",
      claimClassificationLine: "Ought the proposal be adopted?",
      providerRef: "provider:test",
      contractHash: "contract:test",
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 }
    });
    expect(result.normalizedClaim.claimType).toBe("normative");
    expect(result.normalizedClaim.substance).toBe("code");
    expect(systemPrompt).toContain("Omit claim_type; the code-first classifier already resolved it.");
  });
});
