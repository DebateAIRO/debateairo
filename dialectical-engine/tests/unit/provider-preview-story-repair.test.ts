import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  OpenAICompatibleProviderGateway,
  buildFramedPrompt,
  buildFramedRepairPrompt,
  createPreviewGuardedFetch,
  parsePreviewProviderTestConfig,
  readPromptFrame,
  schemaFailureLocator,
  withPreviewProviderCallPolicy,
  type PreviewBudgetExecution,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import { classifyStoryContent, type StoryMaterialIndex } from "@debateai/story";

const MODEL = "zai-org/GLM-5.3-Flash";
const ENDPOINT = "https://api.deepinfra.com/v1/openai";
const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [MODEL], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "preview-story-repair-fixture"
}))!;
const INDEX: StoryMaterialIndex = {
  nodeIds: new Set(["P1"]), positionIds: new Set(["P1"]), positionOrder: ["P1"],
  shapeIds: new Set(["fixture"]), pathCap: 4, scoreTexts: new Set(), engineTokens: new Set()
};
function story(ref = "P1"): string {
  const paragraph = { text: "The proposed policy held up.", node_refs: [ref] };
  return JSON.stringify({
    shape_id: "fixture",
    short: {
      headline: "The policy held up.", summary: "You asked about the policy; it held up.",
      confidence: "The evidence supports the policy.",
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: "Adopting the policy held up.", node_refs: ["P1"] }],
      change: paragraph
    },
    why: { reasons: [paragraph] },
    long: { sections: ["Our reading", "The verdict", "What would change it"].map(title => ({ title, paragraphs: [paragraph] })) },
    reviewer_note: null
  });
}
function storyRequest(contractId = "story.storyteller.v2"): ProviderCallRequest {
  const framed = buildFramedPrompt({
    contract: { contractId, instruction: "Write the synthetic policy story.", answerForm: "Return one JSON object." },
    material: [{ name: "story_material", content: "One policy position, cited as P1." }]
  });
  return {
    runId: "run:synthetic", subjectItemId: "story:synthetic", callSiteKey: "STORY:STORYTELLER:1",
    role: "SYNTHESIZER", lane: "story", bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 },
    contractHash: "contract:synthetic-story", providerRef: "preview:fixture-a", packet: framed.packet,
    preferredResponseFormat: "json_object",
    classifyContent: content => classifyStoryContent(content, INDEX),
    buildRepairPacket: rejected => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected))
  };
}
const RESULT: ProviderCallResult = {
  content: story(), rawArtifactRef: "artifact:fixture", ledgerEntryRef: "ledger:fixture",
  provider: "openai-compatible-http", model: MODEL, maker: "Z.AI", modelVersion: MODEL
};
async function forwarded(request: ProviderCallRequest): Promise<ProviderCallRequest> {
  let received: ProviderCallRequest | undefined;
  await withPreviewProviderCallPolicy({ call: async effective => { received = effective; return RESULT; } }, CONFIG).call(request);
  if (received === undefined) throw new Error("PREVIEW_REQUEST_NOT_FORWARDED");
  return received;
}
function nativeHarness(contents: readonly string[]) {
  const executions: PreviewBudgetExecution[] = [];
  const artifacts: RawArtifactInput[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const fetcher = createPreviewGuardedFetch({ execute: async input => {
    executions.push(input);
    return { status: 200, body: JSON.stringify({ id: `fixture-${executions.length}`, model: MODEL,
      choices: [{ message: { content: contents[executions.length - 1] ?? contents.at(-1)! }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
  } });
  const native = new OpenAICompatibleProviderGateway({
    endpoint: ENDPOINT, model: MODEL, maker: "Z.AI", supportsJsonObjectResponse: true,
    thinking: { parameter: "reasoning_effort", levels: ["high"] }, fetchImplementation: fetcher,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined,
    persistRawArtifact: async artifact => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async entry => { ledger.push(entry); return entry.attemptId; }
  });
  return { gateway: withPreviewProviderCallPolicy(native, CONFIG), executions, artifacts, ledger };
}

describe("preview storyteller v2 safe repair allowance", () => {
  it.each([2, 3, 8])("permits two attempts when the writer's original allowance is %i", async maxAttempts => {
    const request = storyRequest();
    const effective = await forwarded({ ...request, bound: { ...request.bound, maxAttempts } });
    expect(effective.bound).toEqual({ maxAttempts: 2, tokenCeiling: 8192, deadlineMs: 600000 });
    expect(effective.thinkingLevel).toBe("high");
  });

  it("preserves an explicit one-attempt writer bound", async () => {
    const request = storyRequest();
    const effective = await forwarded({ ...request, bound: { ...request.bound, maxAttempts: 1 } });
    expect(effective.bound).toEqual({ maxAttempts: 1, tokenCeiling: 8192, deadlineMs: 600000 });
  });

  it("preserves the larger output bound and all caller admission seams", async () => {
    const request = storyRequest();
    const assertAttemptAllowed = () => undefined;
    const costEnvelope = { assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined };
    const effective = await forwarded({ ...request, bound: { ...request.bound, tokenCeiling: 12000 }, assertAttemptAllowed, costEnvelope });
    expect(effective.bound).toEqual({ maxAttempts: 2, tokenCeiling: 12000, deadlineMs: 600000 });
    expect(effective.packet).toBe(request.packet);
    expect(effective.providerRef).toBe("preview:fixture-a");
    expect(effective.contractHash).toBe("contract:synthetic-story");
    expect(effective.preferredResponseFormat).toBe("json_object");
    expect(effective.classifyContent).toBe(request.classifyContent);
    expect(effective.buildRepairPacket).toBe(request.buildRepairPacket);
    expect(effective.assertAttemptAllowed).toBe(assertAttemptAllowed);
    expect(effective.costEnvelope).toBe(costEnvelope);
  });

  it.each([1, 8])("accepts the canonical storyteller round %i", async round => {
    const effective = await forwarded({ ...storyRequest(), callSiteKey: `STORY:STORYTELLER:${round}` });
    expect(effective.bound.maxAttempts).toBe(2);
  });

  const oneAttemptCases: ReadonlyArray<readonly [string, () => ProviderCallRequest]> = [
    ...["served", "uniform-panel", "critic-exempt", "evaluator"].map(lane => [
      `nonstory lane ${lane}`, () => ({ ...storyRequest(), lane } as ProviderCallRequest)
    ] as const),
    ...["JUDGE", "COMPOSER", "CONFORMANCE", "CLASSIFIER", "EVALUATOR"].map(role => [
      `role ${role}`, () => ({ ...storyRequest(), role } as ProviderCallRequest)
    ] as const),
    ...["STORY:CHECKER:1", "STORY:STORYTELLER:0", "STORY:STORYTELLER:9", "STORY:STORYTELLER:01",
      "STORY:STORYTELLER:1:repair", "STORY:STORYTELLER:", "fixture:writer"].map(callSiteKey => [
      `callsite ${callSiteKey}`, () => ({ ...storyRequest(), callSiteKey })
    ] as const),
    ["old storyteller v1 contract", () => storyRequest("story.storyteller.v1")],
    ["checker contract", () => storyRequest("story.checker.v1")],
    ["unknown storyteller version", () => storyRequest("story.storyteller.v3")],
    ["missing prompt frame", () => ({ ...storyRequest(), packet: { messages: [{ role: "user", content: "story.storyteller.v2" }] } })],
    ["malformed framed material", () => {
      const request = storyRequest();
      return { ...request, packet: { messages: [request.packet.messages[0]!, { role: "user", content: "unframed" }] } };
    }],
    ...[undefined, null, "classifier"].map(classifyContent => [
      `noncallable classifier ${String(classifyContent)}`,
      () => ({ ...storyRequest(), classifyContent } as unknown as ProviderCallRequest)
    ] as const),
    ...[undefined, null, "repair"].map(buildRepairPacket => [
      `noncallable repair builder ${String(buildRepairPacket)}`,
      () => ({ ...storyRequest(), buildRepairPacket } as unknown as ProviderCallRequest)
    ] as const),
    ...[0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY].map(maxAttempts => [
      `malformed underlying attempt bound ${String(maxAttempts)}`, () => {
        const request = storyRequest();
        return { ...request, bound: { ...request.bound, maxAttempts } };
      }
    ] as const)
  ];
  it.each(oneAttemptCases)("keeps %s at one attempt", async (_name, makeRequest) => {
    const effective = await forwarded(makeRequest());
    expect(effective.bound).toEqual({ maxAttempts: 1, tokenCeiling: 8192, deadlineMs: 600000 });
  });

  it("still refuses a weaker thinking request before forwarding", async () => {
    let calls = 0;
    const gateway = withPreviewProviderCallPolicy({ call: async () => { calls++; return RESULT; } }, CONFIG);
    expect(() => gateway.call({ ...storyRequest(), thinkingLevel: "medium" })).toThrow(expect.objectContaining({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" }));
    expect(calls).toBe(0);
  });

  it("native gateway repairs a rejected story citation using only its schema locator", async () => {
    const rejected = story("P99");
    const accepted = story();
    const { gateway, executions, artifacts, ledger } = nativeHarness([rejected, accepted]);
    const projections: unknown[] = [];
    const charges: unknown[] = [];
    let attempts = 0;
    const result = await gateway.call({ ...storyRequest(), assertAttemptAllowed: () => { attempts++; }, costEnvelope: {
      assertCallAllowed: projection => { projections.push(projection); },
      recordCall: charge => { charges.push(charge); }, assertUsageReported: () => undefined
    } });
    expect(result.content).toBe(accepted);
    expect(executions).toHaveLength(2);
    expect(attempts).toBe(2);
    expect(projections).toHaveLength(2);
    expect(charges).toHaveLength(2);
    const bodies = executions.map(execution => JSON.parse(execution.requestBody));
    for (const body of bodies) expect(body).toMatchObject({ model: MODEL, reasoning_effort: "high", max_tokens: 8192, response_format: { type: "json_object" } });
    const repaired = readPromptFrame({ messages: bodies[1].messages });
    expect(repaired.contractId).toBe("story.storyteller.v2");
    expect(repaired.fields.slice(-2)).toEqual([
      { name: "machine_rejection_code", content: "SCHEMA_FAILED" },
      { name: "machine_rejection_path", content: "short.change.node_refs.0" }
    ]);
    expect(bodies[1].messages[0]).toEqual(bodies[0].messages[0]);
    expect(executions[1]?.requestBody).not.toContain(rejected);
    expect(executions[1]?.requestBody).not.toContain("P99");
    expect(new Set(executions.map(execution => execution.operationId)).size).toBe(2);
    for (const execution of executions) {
      expect(execution.requestSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(Number(execution.reservedUsd)).toBeGreaterThan(0.08192);
    }
    expect(artifacts.map(artifact => artifact.parseStatus)).toEqual(["SCHEMA_FAILED", "PARSED"]);
    expect(ledger.map(entry => entry.outcome)).toEqual(["FAILED", "OK"]);
    expect(ledger.map(entry => entry.contractHash)).toEqual(["contract:synthetic-story", "contract:synthetic-story"]);
    expect(ledger[0]?.inputHash).not.toBe(ledger[1]?.inputHash);
  });

  it("native gateway stops after the one permitted repair and retains both failed charges", async () => {
    const { gateway, executions, artifacts, ledger } = nativeHarness([story("P99")]);
    const charges: unknown[] = [];
    await expect(gateway.call({ ...storyRequest(), costEnvelope: {
      assertCallAllowed: () => undefined, recordCall: charge => { charges.push(charge); }, assertUsageReported: () => undefined
    } })).rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 2, lastParseStatus: "SCHEMA_FAILED" });
    expect(executions).toHaveLength(2);
    expect(charges).toHaveLength(2);
    expect(artifacts).toHaveLength(2);
    expect(ledger.map(entry => entry.outcome)).toEqual(["FAILED", "FAILED"]);
  });

  it("native repair rechecks admission before a second reservation or dispatch", async () => {
    const { gateway, executions, ledger } = nativeHarness([story("P99"), story()]);
    let attempts = 0;
    const charges: unknown[] = [];
    await expect(gateway.call({ ...storyRequest(), assertAttemptAllowed: () => {
      if (++attempts === 2) throw new TypedDomainError("CALL_BUDGET_EXHAUSTED", "Synthetic attempt limit reached");
    }, costEnvelope: {
      assertCallAllowed: () => undefined, recordCall: charge => { charges.push(charge); }, assertUsageReported: () => undefined
    } })).rejects.toMatchObject({ code: "CALL_BUDGET_EXHAUSTED" });
    expect(attempts).toBe(2);
    expect(executions).toHaveLength(1);
    expect(charges).toHaveLength(1);
    expect(ledger.map(entry => entry.outcome)).toEqual(["FAILED"]);
  });
});
