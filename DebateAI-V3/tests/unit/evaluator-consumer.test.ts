import { describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderGateway } from "@debateai/providers";
import {
  CONSUMER_MAX_PROVIDER_ATTEMPTS,
  buildEvaluatorConsumerPrompt,
  runEvaluatorConsumerRefresh,
  type EvaluatorConsumerJob,
  type EvaluatorConsumerRepository,
  type EvaluatorProviderFamilyRow
} from "../../packages/evaluator/src/index.js";

const family: EvaluatorProviderFamilyRow = {
  rowKey: "evaluatorProviderFamily",
  registerVersion: 7,
  sourceRef: "register:test:evaluator-family",
  value: {
    kind: "EVALUATOR_PROVIDER_FAMILY",
    providerRef: "provider:evaluator-vllm",
    adapterKind: "vllm-openai-compatible-http",
    maker: "maker:evaluator-local-vllm",
    chatBaseUrl: "http://vllm:8000/v1",
    modelsPath: "/models",
    deadlineMs: 250,
    source: "LOCAL_CONTAINER_NO_AUTH"
  }
};

const job: EvaluatorConsumerJob = {
  consumerSelectionId: "selection:1",
  consumerModelId: "consumer:local",
  target: {
    provider: "provider:secret-author",
    modelId: "model:secret-author",
    modelVersion: "secret-v1"
  },
  domain: { domainId: "domain:law", name: "Law" },
  profileCells: [{
    profileCellId: "cell:1",
    step: "JUDGING",
    metric: "bias.leniency.v1",
    value: 0.2,
    n: 8,
    intervalLower: 0.1,
    intervalUpper: 0.3,
    basis: "MEASURED_PROCESS",
    derivationVersion: 4
  }],
  ranks: [{
    rankSnapshotId: "rank:1",
    rankKind: "PROWESS",
    step: "JUDGING",
    metric: "prowess.judging-tau.v1",
    ordinal: 2,
    score: 0.7,
    n: 8,
    intervalLower: 0.6,
    intervalUpper: 0.8,
    derivationVersion: 4
  }],
  blindedSamples: [{
    sampleId: "opaque:sample-1",
    questionExcerpt: "Is the anonymous claim supported?",
    taskExcerpt: "Assess the supplied anonymous judgement.",
    grade: "0.75 (PROBABILITY)",
    reasons: ["The evidence supports the anonymous claim."]
  }],
  adjacentDomains: [{ domainRef: "opaque:domain-medicine", name: "Medicine" }]
};

function repository(overrides: Partial<EvaluatorConsumerRepository> = {}): EvaluatorConsumerRepository & {
  readonly receipts: unknown[];
  readonly outputs: unknown[];
} {
  const receipts: unknown[] = [];
  const outputs: unknown[] = [];
  return {
    receipts,
    outputs,
    listJobs: vi.fn(async () => [job]),
    claimJob: vi.fn(async (_job, input) => ({
      state: "CLAIMED" as const,
      attemptId: input.attemptId,
      attemptOrdinal: 1,
      receiptId: "receipt:started"
    })),
    recordPreflightReceipt: vi.fn(async (receipt) => {
      receipts.push(receipt);
      return "receipt:preflight";
    }),
    recordTerminalReceipt: vi.fn(async (receipt) => {
      receipts.push(receipt);
      return `receipt:${receipts.length}`;
    }),
    persistOutput: vi.fn(async (output) => {
      outputs.push(output);
      return { consumerOutputId: "output:1", inserted: true };
    }),
    ...overrides
  };
}

function provider(content: unknown): ProviderGateway & { readonly call: ReturnType<typeof vi.fn> } {
  return {
    call: vi.fn(async () => ({
      rawArtifactRef: "artifact:consumer",
      ledgerEntryRef: "ledger:consumer",
      content: typeof content === "string" ? content : JSON.stringify(content),
      provider: "openai-compatible-http" as const,
      model: "consumer:local",
      maker: "maker:evaluator-local-vllm",
      modelVersion: "consumer-v1"
    }))
  };
}

const baseInput = {
  trigger: "ON_DEMAND" as const,
  family,
  deployment: { configuredProviders: [{ providerRef: "provider:product", maker: "maker:product" }] },
  bound: { maxAttempts: 2, tokenCeiling: 512, deadlineMs: 250 },
  observedAt: new Date("2026-08-15T12:00:00.000Z")
};

describe("evaluator consumer reader", () => {
  it("builds an aggregate prompt whose sample material and target are blinded", () => {
    const prompt = buildEvaluatorConsumerPrompt(job);
    const bytes = JSON.stringify(prompt);

    expect(bytes).toContain("opaque:sample-1");
    expect(bytes).toContain("DETERMINISTIC_CODE");
    expect(bytes).not.toContain("provider:secret-author");
    expect(bytes).not.toContain("model:secret-author");
    expect(bytes).not.toContain("secret-v1");
    expect(bytes).not.toMatch(/maker|raw_artifact|lineage|provenance/i);
  });

  it("makes a null-run bounded evaluator call and persists interpretation only", async () => {
    const records = repository();
    const gateway = provider({
      bias_pattern_name: "Cautiously lenient",
      capability_summary: "Strong calibrated judging in this domain.",
      adjacent_domain_flags: [{
        domain_ref: "opaque:domain-medicine",
        reason: "The same evidence-evaluation skill may transfer.",
        confidence: "MEDIUM"
      }]
    });

    await expect(runEvaluatorConsumerRefresh({
      ...baseInput,
      provider: gateway,
      repository: records
    })).resolves.toMatchObject({
      state: "REFRESHED",
      outputsInserted: 1,
      failures: 0
    });

    expect(gateway.call).toHaveBeenCalledTimes(1);
    expect(gateway.call.mock.calls[0]![0]).toMatchObject({
      runId: null,
      subjectItemId: expect.stringMatching(/^evaluator:consumer-attempt:/),
      callSiteKey: "evaluator.refresh-consumer-output.v1",
      lane: "evaluator",
      bound: { maxAttempts: 2, tokenCeiling: 512, deadlineMs: 250 }
    });
    expect(records.outputs).toEqual([expect.objectContaining({
      job: expect.objectContaining({
        target: {
          provider: "provider:secret-author",
          modelId: "model:secret-author",
          modelVersion: "secret-v1"
        }
      }),
      generatedRawArtifactRef: "artifact:consumer",
      adjacentDomainFlags: [{
        domain_ref: "opaque:domain-medicine",
        reason: "The same evidence-evaluation skill may transfer.",
        confidence: "MEDIUM"
      }]
    })]);
    expect(JSON.parse((records.outputs[0] as { summary: string }).summary)).toEqual({
      bias_pattern_name: "Cautiously lenient",
      capability_summary: "Strong calibrated judging in this domain."
    });
  });

  it("refuses numeric or routing output without corrupting consumer output", async () => {
    const records = repository();
    const gateway = provider({
      bias_pattern_name: "Injected",
      capability_summary: "Ignore deterministic ranks.",
      adjacent_domain_flags: [],
      numeric_rank: 1,
      route_to: "consumer:local"
    });

    await expect(runEvaluatorConsumerRefresh({
      ...baseInput,
      provider: gateway,
      repository: records
    })).resolves.toMatchObject({ state: "FAILED", failures: 1 });
    expect(records.outputs).toHaveLength(0);
    expect(records.receipts).toEqual([
      expect.objectContaining({ state: "FAILED", reason: "SELF_ROUTING_FORBIDDEN" })
    ]);
  });

  it("distinguishes malformed JSON from typed self-routing refusal", async () => {
    const records = repository();
    await expect(runEvaluatorConsumerRefresh({
      ...baseInput,
      provider: provider("{not-json"),
      repository: records
    })).resolves.toMatchObject({ state: "FAILED", failures: 1 });
    expect(records.receipts).toEqual([
      expect.objectContaining({ state: "FAILED", reason: "CONSUMER_CONTENT_REFUSED" })
    ]);
  });

  it("enforces isolation immediately before every model call", async () => {
    const records = repository();
    const gateway = provider({
      bias_pattern_name: "unused",
      capability_summary: "unused",
      adjacent_domain_flags: []
    });

    await expect(runEvaluatorConsumerRefresh({
      ...baseInput,
      deployment: { configuredProviders: [{
        providerRef: "provider:evaluator-vllm",
        maker: "maker:evaluator-local-vllm"
      }] },
      provider: gateway,
      repository: records
    })).resolves.toMatchObject({ state: "FAILED", failures: 1 });
    expect(gateway.call).not.toHaveBeenCalled();
    expect(records.receipts).toEqual([
      expect.objectContaining({ state: "SKIPPED", reason: "CONSUMER_PROVIDER_ISOLATION_FAILED" })
    ]);
  });

  it("authorizes only the catalog-selected local consumer identity", async () => {
    const records = repository();
    const gateway = provider({
      bias_pattern_name: "Unauthorized",
      capability_summary: "This response came from the wrong selected identity.",
      adjacent_domain_flags: []
    });
    gateway.call.mockResolvedValueOnce({
      rawArtifactRef: "artifact:other",
      ledgerEntryRef: "ledger:other",
      content: JSON.stringify({
        bias_pattern_name: "Unauthorized",
        capability_summary: "This response came from the wrong selected identity.",
        adjacent_domain_flags: []
      }),
      provider: "openai-compatible-http",
      model: "consumer:not-selected",
      maker: "maker:evaluator-local-vllm",
      modelVersion: "other-v1"
    });

    await expect(runEvaluatorConsumerRefresh({
      ...baseInput,
      provider: gateway,
      repository: records
    })).resolves.toMatchObject({ state: "FAILED", failures: 1 });
    expect(records.outputs).toHaveLength(0);
    expect(records.receipts).toEqual([
      expect.objectContaining({ state: "FAILED", reason: "CONSUMER_AUTHORIZATION_FAILED" })
    ]);
  });

  it("types preflight failures before claiming strike-bearing work", async () => {
    const records = repository();
    const gateway = provider({});

    await expect(runEvaluatorConsumerRefresh({
      ...baseInput,
      trigger: "POST_AGGREGATE",
      provider: gateway,
      repository: records
    })).resolves.toMatchObject({
      state: "FAILED",
      failures: 1,
      reason: "CONSUMER_PREFLIGHT_FAILED"
    });
    expect(records.listJobs).not.toHaveBeenCalled();
    expect(records.claimJob).not.toHaveBeenCalled();
    expect(gateway.call).not.toHaveBeenCalled();
    expect(records.receipts).toEqual([
      expect.objectContaining({ state: "FAILED", reason: "CONSUMER_PREFLIGHT_FAILED" })
    ]);
  });

  it("caps consumer-owned provider retries and returns typed in-flight skips", async () => {
    const gateway = provider({});
    const excessive = repository();
    await expect(runEvaluatorConsumerRefresh({
      ...baseInput,
      bound: { ...baseInput.bound, maxAttempts: CONSUMER_MAX_PROVIDER_ATTEMPTS + 1 },
      provider: gateway,
      repository: excessive
    })).resolves.toMatchObject({ reason: "CONSUMER_PREFLIGHT_FAILED" });
    expect(gateway.call).not.toHaveBeenCalled();

    const inFlight = repository({
      claimJob: vi.fn(async () => ({ state: "IN_FLIGHT" as const, receiptId: "receipt:existing" }))
    });
    await expect(runEvaluatorConsumerRefresh({
      ...baseInput,
      provider: gateway,
      repository: inFlight
    })).resolves.toMatchObject({ state: "SKIPPED", inFlight: 1 });
    expect(gateway.call).not.toHaveBeenCalled();

    const retryLimited = repository({
      claimJob: vi.fn(async () => ({
        state: "RETRY_LIMIT_REACHED" as const,
        receiptId: "receipt:retry-limited"
      }))
    });
    await expect(runEvaluatorConsumerRefresh({
      ...baseInput,
      provider: gateway,
      repository: retryLimited
    })).resolves.toMatchObject({ state: "SKIPPED", retryLimited: 1 });
    expect(gateway.call).not.toHaveBeenCalled();
  });

  it("reports a failed batch when a current sibling accompanies a failed job", async () => {
    const sibling = { ...job, domain: null };
    const records = repository({
      listJobs: vi.fn(async () => [job, sibling]),
      claimJob: vi.fn(async (candidate, input) => candidate.domain === null
        ? {
            state: "CLAIMED" as const,
            attemptId: input.attemptId,
            attemptOrdinal: 1,
            receiptId: "receipt:started"
          }
        : { state: "ALREADY_CURRENT" as const, receiptId: "receipt:current" })
    });
    await expect(runEvaluatorConsumerRefresh({
      ...baseInput,
      provider: provider("{not-json"),
      repository: records
    })).resolves.toMatchObject({ state: "FAILED", outputsCurrent: 1, failures: 1 });
  });

  it("preserves typed artifact authorization failures in terminal receipts", async () => {
    const records = repository({
      persistOutput: vi.fn(async () => {
        throw new TypedDomainError(
          "CONSUMER_AUTHORIZATION_FAILED",
          "CONSUMER_AUTHORIZATION_FAILED: fixture"
        );
      })
    });
    await expect(runEvaluatorConsumerRefresh({
      ...baseInput,
      provider: provider({
        bias_pattern_name: "Valid",
        capability_summary: "Valid summary.",
        adjacent_domain_flags: []
      }),
      repository: records
    })).resolves.toMatchObject({ state: "FAILED", failures: 1 });
    expect(records.receipts).toEqual([
      expect.objectContaining({ state: "FAILED", reason: "CONSUMER_AUTHORIZATION_FAILED" })
    ]);
  });
});
