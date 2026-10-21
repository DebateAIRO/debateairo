import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEXT_NOT_IN_QUESTION_LANGUAGE, TypedDomainError, replyLanguageCheck } from "@debateai/kernel";
import {
  OpenAICompatibleProviderGateway,
  PREVIEW_STORY_REPAIR_CONTRACT_IDS,
  buildFramedPrompt,
  buildFramedRepairPrompt,
  createPreviewGuardedFetch,
  parsePreviewProviderTestConfig,
  previewTargetGatewayControls,
  readPromptFrame,
  schemaFailureLocator,
  schemaFailurePaths,
  withPreviewProviderCallPolicy,
  type PreviewBudgetExecution,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import {
  STORYTELLER_CONTRACT_ID,
  STORYTELLER_V4_CONTRACT_ID,
  STORY_CHECKER_CONTRACT_ID,
  STORY_CHECKER_V4_CONTRACT_ID,
  STORY_BODY_PROSE,
  buildStoryRevisionPrompt,
  classifyStoryContent,
  type StoryMaterialIndex
} from "@debateai/story";

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
function storyRequest(contractId = "story.storyteller.v3"): ProviderCallRequest {
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
// Stray script (2026-10-21): the R19 served story's paragraph with two Chinese characters inside an English sentence, verbatim.
const STRAY = JSON.parse(readFileSync(new URL("../support/fixtures/reply-language/stray-script-2026-10.json", import.meta.url), "utf8")) as {
  readonly cases: readonly { question: string; text: string }[];
};
const RESULT: ProviderCallResult = {
  content: story(), rawArtifactRef: "artifact:fixture", ledgerEntryRef: "ledger:fixture",
  provider: "openai-compatible-http", model: MODEL, maker: "Z.AI", modelVersion: MODEL
};
async function forwarded(request: ProviderCallRequest): Promise<ProviderCallRequest> {
  let received: ProviderCallRequest | undefined;
  await withPreviewProviderCallPolicy({ call: async effective => { received = effective; return RESULT; } }, CONFIG, { model: MODEL }).call(request);
  if (received === undefined) throw new Error("PREVIEW_REQUEST_NOT_FORWARDED");
  return received;
}
function nativeHarness(contents: readonly string[], finishReasons: readonly string[] = []) {
  const executions: PreviewBudgetExecution[] = [];
  const artifacts: RawArtifactInput[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const fetcher = createPreviewGuardedFetch({ execute: async input => {
    executions.push(input);
    return { status: 200, body: JSON.stringify({ id: `fixture-${executions.length}`, model: MODEL,
      choices: [{ message: { content: contents[executions.length - 1] ?? contents.at(-1)! }, finish_reason: finishReasons[executions.length - 1] ?? "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
  } });
  const native = new OpenAICompatibleProviderGateway({
    endpoint: ENDPOINT, model: MODEL, maker: "Z.AI", supportsJsonObjectResponse: true,
    thinking: { parameter: "reasoning_effort", levels: ["high"] }, fetchImplementation: fetcher,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined,
    persistRawArtifact: async artifact => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async entry => { ledger.push(entry); return entry.attemptId; },
    // As the runner builds a preview target: max_tokens is clamped to the row's bound, length retries included.
    ...previewTargetGatewayControls(CONFIG, { model: MODEL })
  });
  return { gateway: withPreviewProviderCallPolicy(native, CONFIG, { model: MODEL }), executions, artifacts, ledger };
}

// Preview retry fix, option B (spec 2026-10-11 §1.1): the writer's bound is its LIFETIME allowance and passes
// through (token floor and deadline applied); the attempts of ONE call are `maxAttemptsThisCall`.
// Story format robustness (2026-10-12): the current storyteller contract is v3, and on the preview the
// storyteller's call asks for its row's whole answer cap, room to think. Slow-answer ruling (2026-10-12): the cap is
// per row, 16,384 on GLM (this fixture's model), MiMo and Qwen, 32,768 on DeepSeek and Haiku; the deadline is 1,260 s.
const STORYTELLER_CAP = 16_384;
describe("preview storyteller v3 safe repair allowance", () => {
  it.each([2, 3, 8])("permits two attempts per call when the writer's original allowance is %i", async maxAttempts => {
    const request = storyRequest();
    const effective = await forwarded({ ...request, bound: { ...request.bound, maxAttempts } });
    expect(effective.maxAttemptsThisCall).toBe(2);
    expect(effective.bound).toEqual({ maxAttempts, tokenCeiling: STORYTELLER_CAP, deadlineMs: 1260000 });
    expect(effective.thinkingLevel).toBe("high");
  });

  it("preserves an explicit one-attempt writer bound", async () => {
    const request = storyRequest();
    const effective = await forwarded({ ...request, bound: { ...request.bound, maxAttempts: 1 } });
    expect(effective.maxAttemptsThisCall).toBe(1);
    expect(effective.bound).toEqual({ maxAttempts: 1, tokenCeiling: STORYTELLER_CAP, deadlineMs: 1260000 });
  });

  it("asks for the row's whole cap and keeps all caller admission seams", async () => {
    const request = storyRequest();
    const assertAttemptAllowed = () => undefined;
    const costEnvelope = { assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined };
    const effective = await forwarded({ ...request, bound: { ...request.bound, tokenCeiling: 12000 }, assertAttemptAllowed, costEnvelope });
    expect(effective.maxAttemptsThisCall).toBe(2);
    expect(effective.bound).toEqual({ maxAttempts: 3, tokenCeiling: STORYTELLER_CAP, deadlineMs: 1260000 });
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
    expect(effective.maxAttemptsThisCall).toBe(2);
  });

  const oneAttemptCases: ReadonlyArray<readonly [string, () => ProviderCallRequest]> = [
    // All-steps format robustness (2026-10-12): on the served lane the same request is the answer writer's, which has
    // its own one repair try (tests/unit/all-steps-format-robustness.test.ts), so it is not listed here.
    ...["uniform-panel", "critic-exempt", "evaluator"].map(lane => [
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
    ["previous storyteller v2 contract", () => storyRequest("story.storyteller.v2")],
    ["checker contract", () => storyRequest("story.checker.v1")],
    ["previous checker v2 contract", () => storyRequest("story.checker.v2")],
    ["current checker contract on the storyteller's site", () => storyRequest("story.checker.v3")],
    // Story v4 (R1d, absorbing LG-D): v4 is a current version now; the first unknown one is v5.
    ["unknown storyteller version", () => storyRequest("story.storyteller.v5")],
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
  it.each(oneAttemptCases)("keeps %s at one attempt per call", async (_name, makeRequest) => {
    const request = makeRequest();
    const effective = await forwarded(request);
    expect(effective.maxAttemptsThisCall).toBe(1);
    // Only the storyteller's own site (story lane, SYNTHESIZER, STORY:STORYTELLER:1-8) asks for the whole cap.
    const storytellerSite = request.lane === "story" && request.role === "SYNTHESIZER" && /^STORY:STORYTELLER:[1-8]$/u.test(request.callSiteKey);
    expect(effective.bound).toEqual({ maxAttempts: request.bound.maxAttempts, tokenCeiling: storytellerSite ? STORYTELLER_CAP : 8192, deadlineMs: 1260000 });
  });

  it("still refuses a weaker thinking request before forwarding", async () => {
    let calls = 0;
    const gateway = withPreviewProviderCallPolicy({ call: async () => { calls++; return RESULT; } }, CONFIG, { model: MODEL });
    expect(() => gateway.call({ ...storyRequest(), thinkingLevel: "medium" })).toThrow(expect.objectContaining({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" }));
    expect(calls).toBe(0);
  });

  // Patch follow-up (owner design, 2026-10-12): the repair POST is the short follow-up — the model's own story back as its
  // turn and only the failing machine path asked for — so the model answers with the one corrected member.
  it("native gateway repairs a rejected story citation using only its schema locator", async () => {
    const rejected = story("P99");
    const accepted = story();
    // Every member that cites P99 is refused at its own path; the patch answers each with the right ref.
    const refused = classifyStoryContent(rejected, INDEX);
    const paths = refused.parseStatus === "PARSED" ? [] : schemaFailurePaths(refused.parseError) ?? [];
    expect(paths[0]).toBe("short.change.node_refs.0");
    const { gateway, executions, artifacts, ledger } = nativeHarness([rejected, JSON.stringify(Object.fromEntries(paths.map(path => [path, "P1"])))]);
    const projections: unknown[] = [];
    const charges: unknown[] = [];
    let attempts = 0;
    const result = await gateway.call({ ...storyRequest(), assertAttemptAllowed: () => { attempts++; }, costEnvelope: {
      assertCallAllowed: projection => { projections.push(projection); },
      recordCall: charge => { charges.push(charge); }, assertUsageReported: () => undefined
    } });
    expect(result.content).toBe(accepted);
    expect(result.repairAttempts).toBe(1);
    expect(executions).toHaveLength(2);
    expect(attempts).toBe(2);
    expect(projections).toHaveLength(2);
    expect(charges).toHaveLength(2);
    const bodies = executions.map(execution => JSON.parse(execution.requestBody));
    for (const body of bodies) expect(body).toMatchObject({ model: MODEL, reasoning_effort: "high", max_tokens: STORYTELLER_CAP, response_format: { type: "json_object" } });
    const repaired = readPromptFrame({ messages: bodies[1].messages });
    expect(repaired.contractId).toBe("story.storyteller.v3");
    expect(repaired.fields.slice(-3)).toEqual([
      // The issues' own engine code when they all name one (the full re-ask's locator keeps SCHEMA_FAILED).
      { name: "machine_rejection_code", content: "STORY_UNKNOWN_NODE_REF" },
      { name: "machine_rejection_paths", content: paths.join(",") },
      { name: "machine_reply_form", content: "PATCH" }
    ]);
    expect(bodies[1].messages.slice(0, 2)).toEqual(bodies[0].messages);
    // The rejected story goes back only as the model's own turn: never in the instruction compartment or a block.
    expect(bodies[1].messages[2]).toEqual({ role: "assistant", content: rejected });
    expect(repaired.fields.some((field: { content: string }) => field.content.includes("P99"))).toBe(false);
    expect(bodies[1].messages[0].content).not.toContain("P99");
    expect(new Set(executions.map(execution => execution.operationId)).size).toBe(2);
    for (const execution of executions) {
      expect(execution.requestSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(Number(execution.reservedUsd)).toBeGreaterThan(0.016384);
    }
    expect(artifacts.map(artifact => artifact.parseStatus)).toEqual(["SCHEMA_FAILED", "PARSED"]);
    expect(ledger.map(entry => entry.outcome)).toEqual(["FAILED", "OK"]);
    expect(ledger.map(entry => entry.contractHash)).toEqual(["contract:synthetic-story", "contract:synthetic-story"]);
    expect(ledger[0]?.inputHash).not.toBe(ledger[1]?.inputHash);
  });

  // Stray script (2026-10-21): R19's served story kept "are大于 the" because no check refused it. The shared reply-language
  // check now refuses that paragraph at its own path, so the preview asks ONE short follow-up for it and merges the answer.
  it("R19: the story paragraph with Chinese characters gets ONE short follow-up naming that paragraph, and the English paragraph is merged and accepted", async () => {
    const r19 = STRAY.cases[3]!; // STORY:STORYTELLER:2, English question
    const path = "long.sections.2.paragraphs.0.text";
    const fixed = r19.text.replace("are大于 the", "are greater than the");
    expect(fixed).not.toBe(r19.text);
    const firstValue = JSON.parse(story()) as { long: { sections: { paragraphs: { text: string; node_refs: string[] }[] }[] } };
    firstValue.long.sections[2]!.paragraphs[0] = { text: r19.text, node_refs: ["P1"] };
    const first = JSON.stringify(firstValue);
    const expectedValue = JSON.parse(first) as typeof firstValue;
    expectedValue.long.sections[2]!.paragraphs[0]!.text = fixed;
    const { gateway, executions } = nativeHarness([first, JSON.stringify({ [path]: fixed })]);
    const result = await gateway.call({
      ...storyRequest(),
      classifyContent: (content, reply) => classifyStoryContent(content, INDEX, reply, replyLanguageCheck(r19.question, STORY_BODY_PROSE)),
      costEnvelope: { assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined }
    });
    expect(executions).toHaveLength(2);
    expect(result.repairAttempts).toBe(1);
    const bodies = executions.map(execution => JSON.parse(execution.requestBody));
    const repaired = readPromptFrame({ messages: bodies[1].messages });
    expect(repaired.fields.filter((field: { name: string }) => field.name.startsWith("machine_"))).toEqual([
      { name: "machine_rejection_code", content: TEXT_NOT_IN_QUESTION_LANGUAGE },
      { name: "machine_rejection_paths", content: path },
      { name: "machine_reply_form", content: "PATCH" }
    ]);
    const sent = bodies[0].messages as unknown[];
    expect(JSON.stringify(bodies[1].messages.slice(0, sent.length))).toBe(JSON.stringify(sent));
    expect(bodies[1].messages[sent.length]).toEqual({ role: "assistant", content: first });
    expect(JSON.parse(result.content)).toEqual(expectedValue);
    expect(result.content).not.toContain("大于");
  });

  it("a story accepted on the first try reports no repair", async () => {
    const { gateway } = nativeHarness([story()]);
    const result = await gateway.call({ ...storyRequest(), costEnvelope: {
      assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined } });
    expect(result.repairAttempts).toBe(0);
  });

  it("a length retry re-sends the original packet and is not counted as a repair", async () => {
    const { gateway, executions, artifacts } = nativeHarness([story().slice(0, 40), story()], ["length", "stop"]);
    const result = await gateway.call({ ...storyRequest(), costEnvelope: {
      assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined } });
    expect(artifacts.map(artifact => artifact.parseStatus)).toEqual(["PARSE_FAILED", "PARSED"]);
    // The W10 length retry: the ORIGINAL packet, never the repair packet. On this slow row the first attempt asks for
    // the 16,384 story allowance; the retry asks twice that, which is exactly the row's whole answer cap (32,768).
    const bodies = executions.map(execution => JSON.parse(execution.requestBody));
    expect(bodies[1].messages).toEqual(bodies[0].messages);
    expect([bodies[0].max_tokens, bodies[1].max_tokens]).toEqual([STORYTELLER_CAP, 2 * STORYTELLER_CAP]);
    expect(result.repairAttempts).toBe(0);
  });

  // Patch follow-up: with the story's sealed bound of two, the short follow-up is the one permitted repair (a call whose
  // second POST was a patch may send a third only within the bound; tests/unit/patch-follow-up-gateway.test.ts).
  it("native gateway stops after the one permitted repair and retains both failed charges", async () => {
    const { gateway, executions, artifacts, ledger } = nativeHarness([story("P99")]);
    const charges: unknown[] = [];
    const request = storyRequest();
    await expect(gateway.call({ ...request, bound: { ...request.bound, maxAttempts: 2 }, costEnvelope: {
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

/**
 * Story v4 (engine redesign R1d, absorbing LG-D Task 6; spec 2026-10-15 §7.4): an engine-2 debate asks with story
 * contracts v4. The preview's repair try was allowed only for the literal v3 ids, so without this a v4 story would
 * silently lose it. A round-2 revision request (the storyteller's own draft as its turn, Task 14) keeps it too.
 */
describe("story v4: the preview's story repair check accepts contracts v4", () => {
  const checkerSite = (contractId: string): ProviderCallRequest =>
    ({ ...storyRequest(contractId), callSiteKey: "STORY:CHECKER:1", role: "EVALUATOR" } as ProviderCallRequest);

  it("lists the two current versions of each story contract, and the story package's own ids are in it", () => {
    expect(PREVIEW_STORY_REPAIR_CONTRACT_IDS).toEqual(["story.storyteller.v3", "story.checker.v3", "story.storyteller.v4", "story.checker.v4"]);
    for (const id of [STORYTELLER_CONTRACT_ID, STORY_CHECKER_CONTRACT_ID, STORYTELLER_V4_CONTRACT_ID, STORY_CHECKER_V4_CONTRACT_ID]) {
      expect(PREVIEW_STORY_REPAIR_CONTRACT_IDS).toContain(id);
    }
  });

  it("a v4 storyteller request keeps exactly what a v3 request keeps: its repair try, its bound and its repair level", async () => {
    const v3 = await forwarded(storyRequest("story.storyteller.v3"));
    const v4 = await forwarded(storyRequest("story.storyteller.v4"));
    const v5 = await forwarded(storyRequest("story.storyteller.v5"));
    expect({ attempts: v4.maxAttemptsThisCall, bound: v4.bound, repairLevel: v4.repairThinkingLevel })
      .toEqual({ attempts: v3.maxAttemptsThisCall, bound: v3.bound, repairLevel: v3.repairThinkingLevel });
    // Not vacuous: an unknown version really is treated differently.
    expect(v5.maxAttemptsThisCall).toBeLessThan(v4.maxAttemptsThisCall!);
  });

  it("a v4 checker request on the checker's site keeps exactly what a v3 checker request keeps", async () => {
    const v3 = await forwarded(checkerSite("story.checker.v3"));
    const v4 = await forwarded(checkerSite("story.checker.v4"));
    expect({ attempts: v4.maxAttemptsThisCall, bound: v4.bound }).toEqual({ attempts: v3.maxAttemptsThisCall, bound: v3.bound });
    expect(v4.maxAttemptsThisCall).toBeGreaterThan(1);
  });

  it("a v4 round-2 revision request (own draft as the model's turn) keeps the storyteller's repair try", async () => {
    const revision = buildStoryRevisionPrompt({
      contract: { contractId: "story.storyteller.v4", instruction: "Write the synthetic policy story.", answerForm: "Return one JSON object." },
      material: [{ name: "story_material", content: "One policy position, cited as P1." }],
      ownDraft: story(),
      problems: "The headline states the finding as settled."
    });
    const roundTwo = { ...storyRequest("story.storyteller.v4"), callSiteKey: "STORY:STORYTELLER:2", packet: revision.packet } as ProviderCallRequest;
    const v3 = await forwarded(storyRequest("story.storyteller.v3"));
    expect((await forwarded(roundTwo)).maxAttemptsThisCall).toBe(v3.maxAttemptsThisCall);
    expect(v3.maxAttemptsThisCall).toBeGreaterThan(1);
  });

  it.each([
    ["the v4 checker id on the storyteller's site", () => storyRequest("story.checker.v4")],
    ["the v4 storyteller id on the checker's site", () => checkerSite("story.storyteller.v4")]
  ] as const)("%s keeps one attempt per call", async (_name, makeRequest) => {
    expect((await forwarded(makeRequest())).maxAttemptsThisCall).toBe(1);
  });
});
