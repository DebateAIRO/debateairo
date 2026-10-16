/**
 * Length guidance L14/L25 (spec 2026-10-15 §3.3), LG-B Task 3: when a reply stops at its allowance and the vendor's own
 * thinking count shows thinking used more than the allowance minus the answer's room, the length retry runs one thinking
 * level lower on that AI's own menu, strongest first. Once per call; at the lowest level it runs as it is.
 */
import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway, PREVIEW_MODEL_ROWS, buildFramedPrompt, buildFramedRepairPrompt, parsePreviewProviderTestConfig,
  previewLengthRetryOf, previewModelRow, previewThinkingLevelBelow, schemaFailureLocator, withPreviewProviderCallPolicy,
  type ProviderCallRequest, type ProviderCallResult, type ProviderGateway
} from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";

describe("each row's thinking menu, strongest first", () => {
  it("holds exactly the menu's levels in the makers' order of strength", () => {
    expect(Object.fromEntries(PREVIEW_MODEL_ROWS.map((row) => [row.model, row.effortsByStrength]))).toEqual({
      [GLM]: ["high", "low"], [DEEPSEEK]: ["high", "low", "none"], [MIMO]: ["default", "none"],
      [QWEN]: ["default", "medium", "low", "none"], [HAIKU]: ["high", "medium", "low"]
    });
    for (const row of PREVIEW_MODEL_ROWS) expect([...row.effortsByStrength].sort()).toEqual([...row.efforts].sort());
  });

  it("names the level one below, and none below the lowest", () => {
    const below = (model: string, level: Parameters<typeof previewThinkingLevelBelow>[1]) => previewThinkingLevelBelow(previewModelRow(model)!, level);
    expect([below(HAIKU, "high"), below(HAIKU, "medium"), below(HAIKU, "low")]).toEqual(["medium", "low", null]);
    expect([below(DEEPSEEK, "high"), below(DEEPSEEK, "low"), below(DEEPSEEK, "none")]).toEqual(["low", "none", null]);
    expect([below(QWEN, "default"), below(QWEN, "medium"), below(QWEN, "low")]).toEqual(["medium", "low", "none"]);
    expect([below(MIMO, "default"), below(GLM, "low"), below(GLM, "medium")]).toEqual(["none", null, null]);
  });
});

type Reply = Readonly<{ content: string; finish?: string; reasoning?: number }>;
function harness(script: Reply[]) {
  const sent: Record<string, unknown>[] = [];
  const fetchImplementation = (async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const reply = script.shift() ?? { content: "good" };
    return new Response(JSON.stringify({ id: `fixture-${String(sent.length)}`, model: "synthetic/model",
      choices: [{ message: { content: reply.content }, finish_reason: reply.finish ?? "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 1000,
        ...(reply.reasoning === undefined ? {} : { completion_tokens_details: { reasoning_tokens: reply.reasoning } }) } }),
      { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const gateway = new OpenAICompatibleProviderGateway({ endpoint: "https://relay.example/v1", model: "synthetic/model", maker: "Synthetic",
    thinking: { parameter: "reasoning_effort", levels: ["high", "low"] }, fetchImplementation,
    persistRawArtifact: async (artifact) => artifact.artifactId, appendLedgerEntry: async (entry) => entry.attemptId,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
  return { gateway, sent };
}
function request(change: Partial<ProviderCallRequest> = {}): ProviderCallRequest {
  const framed = buildFramedPrompt({
    contract: { contractId: "fixture.lower.v1", instruction: "Answer the synthetic question.", answerForm: "Return one word." },
    material: [{ name: "question_line", content: "Synthetic question; no personal data." }]
  });
  return { runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey: "JUDGE:critic:node-1", role: "JUDGE", lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 1000, deadlineMs: 5_000 }, contractHash: "contract:synthetic", providerRef: "relay:synthetic",
    packet: framed.packet,
    classifyContent: (content) => content === "good" ? { parseStatus: "PARSED", parseError: null } : { parseStatus: "PARSE_FAILED", parseError: "synthetic" },
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)),
    thinkingLevel: "high", maxAttemptsThisCall: 2, lengthRetry: { answerRoomTokens: 300, lowerThinkingLevel: "low" }, ...change };
}

describe("the gateway's length retry", () => {
  it("runs one level lower when thinking used more than the allowance minus the answer's room", async () => {
    const { gateway, sent } = harness([{ content: "cut", finish: "length", reasoning: 701 }, { content: "good" }]);
    await gateway.call(request());
    expect(sent.map((body) => [body.reasoning_effort, body.max_tokens])).toEqual([["high", 1000], ["low", 2000]]);
  });

  it("stays at the call's level when thinking left the answer its room", async () => {
    const { gateway, sent } = harness([{ content: "cut", finish: "length", reasoning: 700 }, { content: "good" }]);
    await gateway.call(request());
    expect(sent.map((body) => body.reasoning_effort)).toEqual(["high", "high"]);
  });

  it("an unknown thinking count never lowers the level", async () => {
    const { gateway, sent } = harness([{ content: "cut", finish: "length" }, { content: "good" }]);
    await gateway.call(request());
    expect(sent.map((body) => body.reasoning_effort)).toEqual(["high", "high"]);
  });

  it("at the lowest level the retry runs at that level", async () => {
    const { gateway, sent } = harness([{ content: "cut", finish: "length", reasoning: 990 }, { content: "good" }]);
    await gateway.call(request({ lengthRetry: { answerRoomTokens: 300, lowerThinkingLevel: null } }));
    expect(sent.map((body) => body.reasoning_effort)).toEqual(["high", "high"]);
  });

  it("lowers once per call: a second cut-off keeps the lower level, never goes further", async () => {
    const { gateway, sent } = harness([{ content: "cut", finish: "length", reasoning: 990 },
      { content: "cut", finish: "length", reasoning: 1990 }, { content: "good" }]);
    await gateway.call(request({ maxAttemptsThisCall: 3 }));
    expect(sent.map((body) => body.reasoning_effort)).toEqual(["high", "low", "low"]);
  });

  it("a format repair after a lowered length retry runs at the repair level, as today", async () => {
    const { gateway, sent } = harness([{ content: "cut", finish: "length", reasoning: 990 }, { content: "bad" }, { content: "good" }]);
    await gateway.call(request({ maxAttemptsThisCall: 3 }));
    expect(sent.map((body) => body.reasoning_effort)).toEqual(["high", "low", "high"]);
  });

  it("a lower level the connection does not declare is refused before any POST", async () => {
    const { gateway, sent } = harness([]);
    await expect(gateway.call(request({ lengthRetry: { answerRoomTokens: 300, lowerThinkingLevel: "max" } })))
      .rejects.toMatchObject({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" });
    expect(sent).toHaveLength(0);
  });

  it("without lengthRetry the length retry is today's, byte for byte", async () => {
    const { gateway, sent } = harness([{ content: "cut", finish: "length", reasoning: 990 }, { content: "good" }]);
    const { lengthRetry: _omitted, ...today } = request();
    await gateway.call(today);
    expect(sent.map((body) => body.reasoning_effort)).toEqual(["high", "high"]);
  });
});

describe("the preview call policy sets lengthRetry, and only it", () => {
  const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "lg-b-lower-fixture",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
    free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU],
    thinking_levels: { [HAIKU]: { steps: { reviewer: "low" } } } }))!;
  function spy(model: string) {
    const seen: ProviderCallRequest[] = [];
    const inner: ProviderGateway = { call: async (sent) => {
      seen.push(sent);
      return { rawArtifactRef: "artifact", ledgerEntryRef: "entry", content: "{}", provider: "openai-compatible-http",
        model, maker: "Synthetic", modelVersion: model } satisfies ProviderCallResult;
    } };
    return { policy: withPreviewProviderCallPolicy(inner, config, { model }), seen };
  }
  const call = (callSiteKey: string, lane: ProviderCallRequest["lane"] = "served", role: ProviderCallRequest["role"] = "JUDGE"): ProviderCallRequest => ({
    runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey, role, lane,
    bound: { maxAttempts: 2, tokenCeiling: 2048, deadlineMs: 5_000 }, contractHash: "contract:synthetic",
    providerRef: "preview:fixture-a", packet: framedFixturePacket("lg-b lower") });

  it("each step's answer room from the start words, the row's next level below the call's", async () => {
    const deepseek = spy(DEEPSEEK);
    await deepseek.policy.call(call("JUDGE:critic:node-1"));
    expect(deepseek.seen[0]!.lengthRetry).toEqual({ answerRoomTokens: 3000, lowerThinkingLevel: "low" });
    const mimo = spy(MIMO);
    await mimo.policy.call(call("MAP:list:0"));
    // One map item's 248 start words (with checkReason, engine INTERFACE §4.1) x 4 x 3 (pre-flight PF-B1.10).
    expect(mimo.seen[0]!.lengthRetry).toEqual({ answerRoomTokens: 2976, lowerThinkingLevel: "none" });
    const qwen = spy(QWEN);
    await qwen.policy.call(call("STORY:STORYTELLER:1", "story", "SYNTHESIZER"));
    expect(qwen.seen[0]!.lengthRetry).toEqual({ answerRoomTokens: 11415, lowerThinkingLevel: "medium" });
    const haiku = spy(HAIKU);
    await haiku.policy.call(call("JUDGE:review:node-1"));
    expect(haiku.seen[0]!.lengthRetry).toEqual({ answerRoomTokens: 1440, lowerThinkingLevel: null });
  });

  it("no step, no lengthRetry; a caller's own lengthRetry is refused before anything is sent", async () => {
    const glm = spy(GLM);
    await glm.policy.call(call("REPAIR:STRUCTURE:JUDGE:critic:node-1"));
    expect(glm.seen[0]!.lengthRetry).toBeUndefined();
    // The policy refuses synchronously, as its other request checks do (tests/unit/preview-thinking-policy.test.ts:200,
    // `call(request) {` at preview-test.ts:475 at dafbfd517 is not async): wrapped, so the refusal reads as a rejection,
    // the same wrap as Task 4's "a caller's own caps are refused" (pre-flight PF-B2.E1, consistency edit).
    await expect((async () => glm.policy.call({ ...call("JUDGE:critic:node-1"), lengthRetry: { answerRoomTokens: 1, lowerThinkingLevel: "low" } }))())
      .rejects.toMatchObject({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" });
    expect(glm.seen).toHaveLength(1);
  });

  it("previewLengthRetryOf is the one place the policy reads it from", () => {
    expect(previewLengthRetryOf({ callSiteKey: "POST_COMPOSE_R9:EVALUATOR:1", lane: "served" }, previewModelRow(GLM)!, "high"))
      .toEqual({ answerRoomTokens: 1800, lowerThinkingLevel: "low" });
    expect(previewLengthRetryOf({ callSiteKey: "HEALTH:probe", lane: "served" }, previewModelRow(GLM)!, "high")).toBeUndefined();
  });
});
