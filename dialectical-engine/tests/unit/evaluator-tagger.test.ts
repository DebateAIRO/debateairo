import { describe, expect, it, vi } from "vitest";
import { ProviderCallFailedError, type ProviderGateway } from "@debateai/providers";
import {
  EVALUATOR_MAKER,
  EVALUATOR_PROVIDER_REF,
  type EvaluatorProviderFamilyRow,
  type EvaluatorTagRepository,
  runEvaluatorQuestionTagger
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

function repository(): EvaluatorTagRepository & {
  readonly admissions: unknown[];
  readonly assignments: unknown[];
  readonly events: unknown[];
} {
  const admissions: unknown[] = [];
  const assignments: unknown[] = [];
  const events: unknown[] = [];
  let questionDomain: Awaited<ReturnType<EvaluatorTagRepository["readQuestionDomain"]>> = null;
  return {
    admissions,
    assignments,
    events,
    listDomains: async () => [{
      domainId: "domain:software",
      canonicalName: "Computing & Software",
      normalizedName: "computing & software",
      origin: "STARTER",
      guardrailVersion: 1,
      provenanceRef: "seed:test"
    }],
    readQuestionDomain: async () => questionDomain,
    admitProposal: async (input) => {
      admissions.push({ kind: "proposal", input });
      return {
        decision: "ADMITTED_NEW",
        normalizedName: "climate science",
        domainId: "domain:climate",
        candidates: [],
        reason: "admitted",
        domainAdmissionId: "admission:new"
      };
    },
    admitExistingDomainSelection: async (input) => {
      admissions.push({ kind: "existing", input });
      return {
        decision: "MATCHED_EXISTING",
        normalizedName: "computing & software",
        domainId: "domain:software",
        candidates: [{ domainId: "domain:software", normalizedName: "computing & software", similarity: 1 }],
        reason: "selected",
        domainAdmissionId: "admission:existing"
      };
    },
    recordRefusal: async (input) => {
      admissions.push({ kind: "refusal", input });
      return {
        decision: "REFUSED",
        normalizedName: "",
        domainId: null,
        candidates: [],
        reason: input.reason,
        domainAdmissionId: "admission:refused"
      };
    },
    assignQuestionDomain: async (input) => {
      assignments.push(input);
      questionDomain = {
        runId: input.runId,
        domainId: input.domainId,
        assignmentBasis: input.basis,
        domainAdmissionId: input.domainAdmissionId
      };
      return "question-domain:test";
    },
    recordTagPipelineEvent: async (input) => {
      events.push(input);
      return `event:${events.length}`;
    }
  };
}

function provider(content: string): ProviderGateway & { readonly call: ReturnType<typeof vi.fn> } {
  return {
    call: vi.fn(async () => ({
      rawArtifactRef: "artifact:tagger",
      ledgerEntryRef: "ledger:tagger",
      content,
      provider: "openai-compatible-http" as const,
      model: "local/evaluator",
      maker: EVALUATOR_MAKER,
      modelVersion: "local/evaluator"
    }))
  };
}

const baseInput = {
  runId: "run:tagger",
  rawQuestion: "How should a TypeScript service classify this question?",
  family,
  deployment: { configuredProviders: [{ providerRef: "provider:product", maker: "maker:product" }] },
  bound: { maxAttempts: 1, tokenCeiling: 128, deadlineMs: 250 },
  basis: "TAGGER" as const,
  provenanceRef: "evaluator:tagger:v1"
};

describe("ask-time evaluator tagger", () => {
  it("selects an existing domain id and persists only the evaluator landing", async () => {
    const records = repository();
    const gateway = provider(JSON.stringify({ decision: "SELECT_EXISTING", domain_id: "domain:software" }));

    await expect(runEvaluatorQuestionTagger({ ...baseInput, provider: gateway, repository: records }))
      .resolves.toMatchObject({ state: "TAGGED", domainId: "domain:software" });

    expect(records.admissions).toEqual([expect.objectContaining({ kind: "existing" })]);
    expect(records.assignments).toEqual([expect.objectContaining({
      runId: "run:tagger",
      domainId: "domain:software",
      basis: "TAGGER",
      rawArtifactRef: "artifact:tagger"
    })]);
    expect(records.events).toEqual([
      expect.objectContaining({ state: "STARTED" }),
      expect.objectContaining({ state: "SUCCEEDED" })
    ]);
    expect(gateway.call).toHaveBeenCalledWith(expect.objectContaining({
      runId: null,
      role: "CLASSIFIER",
      lane: "evaluator"
    }));
  });

  it("routes a genuinely new proposal through deterministic admission guardrails", async () => {
    const records = repository();
    const gateway = provider(JSON.stringify({ decision: "PROPOSE_NEW", proposed_name: "Climate Science" }));

    await expect(runEvaluatorQuestionTagger({ ...baseInput, provider: gateway, repository: records }))
      .resolves.toMatchObject({ state: "TAGGED", domainId: "domain:climate" });
    expect(records.admissions).toEqual([expect.objectContaining({
      kind: "proposal",
      input: expect.objectContaining({ proposedName: "Climate Science", rawArtifactRef: "artifact:tagger" })
    })]);
  });

  it("records a model refusal and returns untagged without assigning a domain", async () => {
    const records = repository();
    const gateway = provider(JSON.stringify({ decision: "REFUSED", reason: "insufficient evidence" }));

    await expect(runEvaluatorQuestionTagger({ ...baseInput, provider: gateway, repository: records }))
      .resolves.toMatchObject({ state: "UNTAGGED", reason: "TAGGER_REFUSED" });
    expect(records.admissions).toEqual([expect.objectContaining({ kind: "refusal" })]);
    expect(records.assignments).toEqual([]);
    expect(records.events.at(-1)).toEqual(expect.objectContaining({ state: "SKIPPED" }));
  });

  it("degrades container failure to a typed untagged result", async () => {
    const records = repository();
    const gateway: ProviderGateway = { call: vi.fn(async () => { throw new Error("container down"); }) };

    await expect(runEvaluatorQuestionTagger({ ...baseInput, provider: gateway, repository: records }))
      .resolves.toMatchObject({ state: "UNTAGGED", reason: "TAGGER_PROVIDER_FAILED" });
    expect(records.assignments).toEqual([]);
    expect(records.events.at(-1)).toEqual(expect.objectContaining({ state: "FAILED" }));
  });

  it("records a typed timeout result instead of collapsing it into a generic provider failure", async () => {
    const records = repository();
    const gateway: ProviderGateway = {
      call: vi.fn(async () => {
        throw new ProviderCallFailedError(
          new DOMException("deadline", "TimeoutError"),
          1,
          "TIMED_OUT",
          "ledger:timed-out"
        );
      })
    };

    await expect(runEvaluatorQuestionTagger({ ...baseInput, provider: gateway, repository: records }))
      .resolves.toEqual({ state: "UNTAGGED", reason: "TAGGER_PROVIDER_TIMED_OUT" });
    expect(records.events.at(-1)).toEqual(expect.objectContaining({
      state: "FAILED",
      reason: "TAGGER_PROVIDER_TIMED_OUT"
    }));
  });

  it("returns typed UNTAGGED when repository preflight fails", async () => {
    const records = repository();
    const gateway = provider(JSON.stringify({ decision: "REFUSED", reason: "unused" }));
    const failing = { ...records, listDomains: vi.fn(async () => { throw new Error("database down"); }) };

    await expect(runEvaluatorQuestionTagger({ ...baseInput, provider: gateway, repository: failing }))
      .resolves.toEqual({ state: "UNTAGGED", reason: "TAGGER_PREFLIGHT_FAILED" });
    expect(gateway.call).not.toHaveBeenCalled();
  });

  it("short-circuits an already-tagged retry without another provider call or admission", async () => {
    const records = repository();
    const gateway = provider(JSON.stringify({ decision: "SELECT_EXISTING", domain_id: "domain:software" }));

    await runEvaluatorQuestionTagger({ ...baseInput, provider: gateway, repository: records });
    await expect(runEvaluatorQuestionTagger({ ...baseInput, provider: gateway, repository: records }))
      .resolves.toEqual({ state: "UNTAGGED", reason: "TAGGER_ALREADY_TAGGED" });
    expect(gateway.call).toHaveBeenCalledTimes(1);
    expect(records.admissions).toHaveLength(1);
    expect(records.events.at(-1)).toEqual(expect.objectContaining({
      state: "SKIPPED",
      reason: "TAGGER_ALREADY_TAGGED"
    }));
  });

  it("re-asserts provider isolation before the observed vLLM call boundary", async () => {
    const records = repository();
    const gateway = provider(JSON.stringify({ decision: "SELECT_EXISTING", domain_id: "domain:software" }));

    await expect(runEvaluatorQuestionTagger({
      ...baseInput,
      provider: gateway,
      repository: records,
      deployment: { configuredProviders: [{ providerRef: EVALUATOR_PROVIDER_REF, maker: EVALUATOR_MAKER }] }
    })).resolves.toMatchObject({ state: "UNTAGGED", reason: "TAGGER_PROVIDER_ISOLATION_FAILED" });
    expect(gateway.call).not.toHaveBeenCalled();
    expect(records.events.at(-1)).toEqual(expect.objectContaining({ state: "FAILED" }));
  });
});
