import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { ProviderGateway } from "@debateai/providers";
import { runEvaluatorJudgeGradingAddon } from "../../apps/evaluator-worker/src/index.js";
import {
  ADDON_MAX_PROVIDER_ATTEMPTS,
  ADDON_MAX_RUN_ATTEMPTS,
  EVALUATOR_MAKER,
  EVALUATOR_PROVIDER_REF,
  shouldSampleEvaluatorAddon,
  runEvaluatorJudgeAddon,
  type EvaluatorAddonRepository,
  type EvaluatorJudgeAddonPolicy,
  type EvaluatorProviderFamilyRow
} from "../../packages/evaluator/src/index.js";

const family: EvaluatorProviderFamilyRow = {
  rowKey: "evaluatorProviderFamily",
  registerVersion: 7,
  sourceRef: "register:test:evaluator-family",
  value: {
    kind: "EVALUATOR_PROVIDER_FAMILY",
    providerRef: EVALUATOR_PROVIDER_REF,
    adapterKind: "vllm-openai-compatible-http",
    maker: EVALUATOR_MAKER,
    chatBaseUrl: "http://vllm:8000/v1",
    modelsPath: "/models",
    deadlineMs: 250,
    source: "LOCAL_CONTAINER_NO_AUTH"
  }
};

const policy: EvaluatorJudgeAddonPolicy = {
  rowKey: "evaluatorJudgeAddonPolicy",
  registerVersion: 7,
  sourceRef: "register:test:addon-policy",
  value: {
    kind: "EVALUATOR_JUDGE_ADDON_POLICY",
    collectionState: "COLLECT_ONLY",
    everyNthRun: 1,
    maxAttempts: 2,
    tokenCeiling: 256,
    deadlineMs: 250,
    derivationVersion: 1
  }
};

function repository(overrides: Partial<EvaluatorAddonRepository> = {}): EvaluatorAddonRepository & {
  readonly events: unknown[];
  readonly observations: unknown[];
} {
  const events: unknown[] = [];
  const observations: unknown[] = [];
  return {
    events,
    observations,
    loadCandidate: vi.fn(async () => ({
      runId: "run:addon",
      runOrdinal: 12,
      domainId: null,
      reducedJudgementId: "judgement:graded",
      gradedRawArtifactRef: "artifact:graded",
      gradedProvider: "openai-compatible-http",
      gradedModelId: "model:judge",
      gradedModelVersion: "judge-v1",
      gradedMaker: "maker:judge",
      questionExcerpt: "Is the claim supported?",
      taskExcerpt: "The claim under judgement.",
      grade: "0.75 (PROBABILITY)",
      reasons: ["The evidence is relevant."]
    })),
    recordPipelineEvent: vi.fn(async (event) => {
      events.push(event);
      return `event:${events.length}`;
    }),
    insertObservation: vi.fn(async (observation) => {
      observations.push(observation);
      return "observation:addon";
    }),
    ...overrides
  };
}

function provider(): ProviderGateway & { readonly call: ReturnType<typeof vi.fn> } {
  return {
    call: vi.fn(async () => ({
      rawArtifactRef: "artifact:grader",
      ledgerEntryRef: "ledger:grader",
      content: JSON.stringify({
        score: 0.9,
        verdict: "UPHOLD",
        reasons: ["The judgement follows from the supplied material."]
      }),
      provider: "openai-compatible-http" as const,
      model: "model:evaluator",
      maker: EVALUATOR_MAKER,
      modelVersion: "evaluator-v1"
    }))
  };
}

const baseInput = {
  runId: "run:addon",
  family,
  deployment: { configuredProviders: [{ providerRef: "provider:product", maker: "maker:product" }] },
  policy,
  observedAt: new Date("2026-08-15T12:00:00.000Z")
};

describe("judge-grading evaluator add-on", () => {
  it("uses a deterministic every-Nth collect-only sampling policy", () => {
    expect(shouldSampleEvaluatorAddon(12, 3)).toBe(true);
    expect(shouldSampleEvaluatorAddon(13, 3)).toBe(false);
    expect(() => shouldSampleEvaluatorAddon(12, 0)).toThrow("EVALUATOR_ADDON_SAMPLE_INTERVAL_INVALID");
  });

  it("makes one null-run evaluator-scoped blinded call and writes a JUDGING observation", async () => {
    const records = repository();
    const gateway = provider();

    await expect(runEvaluatorJudgeAddon({
      ...baseInput,
      provider: gateway,
      repository: records
    })).resolves.toMatchObject({ state: "GRADED", observationId: "observation:addon" });

    expect(gateway.call).toHaveBeenCalledTimes(1);
    const request = gateway.call.mock.calls[0]![0];
    expect(request).toMatchObject({
      runId: null,
      subjectItemId: expect.stringMatching(/^evaluator:addon-attempt:/),
      callSiteKey: "evaluator.grade-judge-output.v1",
      role: "JUDGE",
      lane: "evaluator",
      bound: { maxAttempts: 2, tokenCeiling: 256, deadlineMs: 250 }
    });
    const payload = JSON.parse(request.packet.messages.at(-1)!.content);
    expect(payload).toEqual({
      sampleId: expect.stringMatching(/^opaque:/),
      questionExcerpt: "Is the claim supported?",
      taskExcerpt: "The claim under judgement.",
      grade: "0.75 (PROBABILITY)",
      reasons: ["The evidence is relevant."]
    });
    expect(JSON.stringify(payload)).not.toMatch(/maker|provider|model|artifact|lineage|provenance/i);
    expect(records.observations).toEqual([expect.objectContaining({
      runId: "run:addon",
      step: "JUDGING",
      metric: "judging.blind-grade.v1",
      truthBasis: "BLIND_ADDON",
      sourceKind: "BLIND_JUDGE_GRADE",
      gradedRawArtifactRef: "artifact:graded",
      graderRawArtifactRef: "artifact:grader"
    })]);
  });

  it("enforces the hard retry ceiling even when policy configuration asks for more", async () => {
    const records = repository();
    const gateway = provider();
    const excessivePolicy = {
      ...policy,
      value: { ...policy.value, maxAttempts: ADDON_MAX_PROVIDER_ATTEMPTS + 1 }
    } as EvaluatorJudgeAddonPolicy;

    await expect(runEvaluatorJudgeAddon({
      ...baseInput,
      policy: excessivePolicy,
      provider: gateway,
      repository: records
    })).resolves.toEqual({ state: "SKIPPED", reason: "ADDON_POLICY_INVALID" });
    expect(gateway.call).not.toHaveBeenCalled();
  });

  it("refuses a same-maker grader in code before any provider call", async () => {
    const records = repository({
      loadCandidate: vi.fn(async () => ({
        runId: "run:addon",
        runOrdinal: 12,
        domainId: null,
        reducedJudgementId: "judgement:graded",
        gradedRawArtifactRef: "artifact:graded",
        gradedProvider: "openai-compatible-http",
        gradedModelId: "model:judge",
        gradedModelVersion: "judge-v1",
        gradedMaker: EVALUATOR_MAKER,
        questionExcerpt: "Question",
        taskExcerpt: "Task",
        grade: "0.5 (PROBABILITY)",
        reasons: []
      }))
    });
    const gateway = provider();

    await expect(runEvaluatorJudgeAddon({
      ...baseInput,
      provider: gateway,
      repository: records
    })).resolves.toEqual({ state: "SKIPPED", reason: "ADDON_DIFFERENT_MAKER_UNAVAILABLE" });
    expect(gateway.call).not.toHaveBeenCalled();
    expect(records.observations).toHaveLength(0);
  });

  it("asserts evaluator provider isolation immediately before the only model call", async () => {
    const records = repository();
    const gateway = provider();

    await expect(runEvaluatorJudgeAddon({
      ...baseInput,
      deployment: { configuredProviders: [{ providerRef: EVALUATOR_PROVIDER_REF, maker: EVALUATOR_MAKER }] },
      provider: gateway,
      repository: records
    })).resolves.toEqual({ state: "SKIPPED", reason: "ADDON_PROVIDER_ISOLATION_FAILED" });
    expect(gateway.call).not.toHaveBeenCalled();
  });

  it("skips non-sampled and already-observed runs without a model call", async () => {
    const gateway = provider();
    const unsampled = repository();
    await expect(runEvaluatorJudgeAddon({
      ...baseInput,
      policy: { ...policy, value: { ...policy.value, everyNthRun: 5 } },
      provider: gateway,
      repository: unsampled
    })).resolves.toEqual({ state: "SKIPPED", reason: "ADDON_NOT_SAMPLED" });

    const existing = repository({ loadCandidate: vi.fn(async () => "ALREADY_GRADED" as const) });
    await expect(runEvaluatorJudgeAddon({
      ...baseInput,
      provider: gateway,
      repository: existing
    })).resolves.toEqual({ state: "SKIPPED", reason: "ADDON_ALREADY_GRADED" });
    expect(gateway.call).not.toHaveBeenCalled();
  });

  it("stops cross-invocation retries at the evaluator-owned run ceiling", async () => {
    expect(ADDON_MAX_RUN_ATTEMPTS).toBe(3);
    const records = repository({
      loadCandidate: vi.fn(async () => "RETRY_LIMIT_REACHED" as const)
    });
    const gateway = provider();
    await expect(runEvaluatorJudgeAddon({
      ...baseInput,
      provider: gateway,
      repository: records
    })).resolves.toEqual({ state: "SKIPPED", reason: "ADDON_RETRY_LIMIT_REACHED" });
    expect(gateway.call).not.toHaveBeenCalled();
  });

  it("validates worker caller input before entering the repository failure boundary", async () => {
    const query = vi.fn();
    await expect(runEvaluatorJudgeGradingAddon({
      pool: { query } as unknown as Pool,
      runId: " ",
      family,
      deployment: baseInput.deployment,
      provider: provider()
    })).rejects.toThrow("EVALUATOR_ADDON_RUN_ID_INVALID");
    expect(query).not.toHaveBeenCalled();
  });
});
