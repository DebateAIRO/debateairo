/**
 * Length guidance L30 (owner answer 3), LG-B Task 7: on the preview's Anthropic rows the first user turn's material
 * carries one cache mark, so the second try of a call reads it from the cache. The blocks keep every character the model
 * read before, in order; a mark anywhere else is refused by the app and by the gate (the shared fixture).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AnthropicMessagesProviderGateway, OpenAICompatibleProviderGateway, PREVIEW_ANTHROPIC_MESSAGES_URL, anthropicCacheableMessages,
  anthropicMessagesRequestBody, buildFramedPrompt, buildFramedRepairPrompt, createPreviewGuardedFetch, parsePreviewProviderTestConfig,
  previewTargetGatewayControls, schemaFailureLocator, type PreviewBudgetExecution, type PromptPacket
} from "@debateai/providers";

type Case = { name: string; body: string; reservedUsd?: string };
const fixture = JSON.parse(readFileSync(new URL("./fixtures/anthropic-cache-bodies.json", import.meta.url), "utf8")) as {
  sent: Case[]; material_sent: Case[]; material_refused: Case[] };
const SYSTEM = (JSON.parse(fixture.sent[0]!.body) as { system: { text: string }[] }).system.map((block) => block.text).join("");
const MATERIAL = "Fenced material: is the synthetic claim supported?";
const PACKETS: readonly PromptPacket["messages"][] = [
  [{ role: "system", content: SYSTEM }, { role: "user", content: MATERIAL }],
  [{ role: "system", content: SYSTEM }, { role: "user", content: MATERIAL }, { role: "user", content: "Fenced rejection: SCHEMA_FAILED at verdict." }],
  [{ role: "system", content: SYSTEM }, { role: "user", content: MATERIAL }, { role: "assistant", content: "{\"verdict\":\"supported\"}" },
    { role: "user", content: "Fenced patch request: verdict." }]
];
const build = (messages: PromptPacket["messages"], cacheFirstUserTurn?: boolean) => anthropicMessagesRequestBody({ model: "claude-haiku-5-5",
  maxTokens: 8192, thinkingLevel: "high", messages, ...(cacheFirstUserTurn === undefined ? {} : { cacheFirstUserTurn }) });

describe("the adapter's first user turn", () => {
  it("is the fixture's material_sent bodies, byte for byte", () => {
    expect(PACKETS.map((messages) => build(messages, true))).toEqual(fixture.material_sent.map((entry) => entry.body));
  });

  it("the material blocks join back into today's turn, byte for byte", () => {
    for (const messages of PACKETS) {
      const today = JSON.parse(build(messages)) as { messages: { role: string; content: string }[] };
      const marked = anthropicCacheableMessages(messages);
      expect(marked.map((turn) => typeof turn.content === "string" ? turn.content : turn.content.map((block) => block.text).join("")))
        .toEqual(today.messages.map((turn) => turn.content));
      expect(marked.slice(1).every((turn) => typeof turn.content === "string")).toBe(true);
    }
  });

  it("without the switch the body is today's, byte for byte", () => {
    expect(build(PACKETS[0]!)).toBe(build(PACKETS[0]!, false));
    expect((JSON.parse(build(PACKETS[0]!)) as { messages: { content: unknown }[] }).messages[0]!.content).toBe(MATERIAL);
  });
});

describe("the guarded fetch", () => {
  const recording = () => {
    const executions: PreviewBudgetExecution[] = [];
    const reply = JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5",
      content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
    const fetcher = createPreviewGuardedFetch({ anthropic: { execute: async (input) => { executions.push(input); return { status: 200, body: reply }; } } });
    return { executions, post: (body: string) => fetcher(PREVIEW_ANTHROPIC_MESSAGES_URL, { method: "POST", body }) };
  };
  it("reserves each material body at the fixture's figure (the 5-minute write price)", async () => {
    const { executions, post } = recording();
    for (const entry of fixture.material_sent) await post(entry.body);
    expect(executions.map((execution) => execution.reservedUsd)).toEqual(fixture.material_sent.map((entry) => entry.reservedUsd));
  });
  it("refuses every material_refused body before any reservation", async () => {
    const { executions, post } = recording();
    for (const entry of fixture.material_refused) {
      await expect(post(entry.body), entry.name).rejects.toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    }
    expect(executions).toHaveLength(0);
  });
});

describe("the gateway", () => {
  const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "lg-b-cache-fixture",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
    free_model_ids: ["zai-org/GLM-5.3-Flash", "claude-haiku-5-5"], premium_model_ids: ["zai-org/GLM-5.3-Flash", "claude-haiku-5-5"] }))!;

  it("the preview marks the material on its Anthropic rows only", () => {
    expect(previewTargetGatewayControls(config, { model: "claude-haiku-5-5" })).toMatchObject({ cacheFirstUserTurn: true });
    expect(previewTargetGatewayControls(config, { model: "zai-org/GLM-5.3-Flash" })).not.toHaveProperty("cacheFirstUserTurn");
    expect(() => new OpenAICompatibleProviderGateway({ endpoint: "https://relay.example/v1", model: "m", maker: "x", cacheFirstUserTurn: true,
      persistRawArtifact: async () => "a", appendLedgerEntry: async () => "l", assertNoOpenWriteTransaction: () => undefined }))
      .toThrow("PROVIDER_GATEWAY_CACHE_INVALID");
  });

  it("both tries of one call send the same marked material block; the re-ask's block follows it unmarked", async () => {
    const sent: { messages: { content: unknown }[] }[] = [];
    const replies = ["not json", "{\"ok\":true}"];
    const fetchImplementation = (async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as { messages: { content: unknown }[] });
      return new Response(JSON.stringify({ id: "msg", type: "message", role: "assistant", model: "claude-haiku-5-5",
        content: [{ type: "text", text: replies.shift() ?? "{}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }),
        { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const gateway = new AnthropicMessagesProviderGateway({ endpoint: "https://api.anthropic.com/v1", model: "claude-haiku-5-5", maker: "Anthropic",
      cacheFirstUserTurn: true, fetchImplementation, persistRawArtifact: async (artifact) => artifact.artifactId,
      appendLedgerEntry: async (entry) => entry.attemptId, assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
    const framed = buildFramedPrompt({ contract: { contractId: "fixture.cache.v1", instruction: "Answer.", answerForm: "Return {ok}." },
      material: [{ name: "question_line", content: "Synthetic question; no personal data." }] });
    await gateway.call({ runId: "run:synthetic", subjectItemId: "node", callSiteKey: "JUDGE:critic:n", role: "JUDGE", lane: "served",
      bound: { maxAttempts: 2, tokenCeiling: 512, deadlineMs: 5000 }, contractHash: "c", providerRef: "preview:claude-haiku-5-5",
      packet: framed.packet,
      classifyContent: (content) => content === "{\"ok\":true}" ? { parseStatus: "PARSED", parseError: null } : { parseStatus: "PARSE_FAILED", parseError: "x" },
      buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)) });
    const [first, second] = sent.map((body) => body.messages[0]!.content as { text: string; cache_control?: unknown }[]);
    expect(first).toHaveLength(1);
    expect(second![0]).toEqual(first![0]);
    expect(first![0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(second).toHaveLength(2);
    expect(second![1]).not.toHaveProperty("cache_control");
    expect(second![1]!.text.startsWith("\n\n")).toBe(true);
  });

  // Pre-flight PF-B3.9 (controller ruling): the mark only where a cache read can happen. Anthropic drops the messages
  // cache when the effort changes, and a one-POST call has no second try to read it.
  const efforts = () => {
    const sent: { messages: { content: unknown }[]; output_config?: { effort: string } }[] = [];
    const replies = ["not json", "{\"ok\":true}"];
    const fetchImplementation = (async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as { messages: { content: unknown }[]; output_config?: { effort: string } });
      return new Response(JSON.stringify({ id: "msg", type: "message", role: "assistant", model: "claude-haiku-5-5",
        content: [{ type: "text", text: replies.shift() ?? "{\"ok\":true}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }),
        { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const gateway = new AnthropicMessagesProviderGateway({ endpoint: "https://api.anthropic.com/v1", model: "claude-haiku-5-5", maker: "Anthropic",
      cacheFirstUserTurn: true, thinking: { parameter: "reasoning_effort", levels: ["high", "medium", "low"] }, fetchImplementation,
      persistRawArtifact: async (artifact) => artifact.artifactId, appendLedgerEntry: async (entry) => entry.attemptId,
      assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
    const framed = buildFramedPrompt({ contract: { contractId: "fixture.cache.v1", instruction: "Answer.", answerForm: "Return {ok}." },
      material: [{ name: "question_line", content: "Synthetic question; no personal data." }] });
    const call = (change: Partial<Parameters<typeof gateway.call>[0]>) => gateway.call({ runId: "run:synthetic", subjectItemId: "node",
      callSiteKey: "JUDGE:critic:n", role: "JUDGE", lane: "served", bound: { maxAttempts: 2, tokenCeiling: 512, deadlineMs: 5000 },
      contractHash: "c", providerRef: "preview:claude-haiku-5-5", packet: framed.packet, thinkingLevel: "high",
      classifyContent: (content) => content === "{\"ok\":true}" ? { parseStatus: "PARSED", parseError: null } : { parseStatus: "PARSE_FAILED", parseError: "x" },
      buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)), ...change });
    const marked = () => sent.map((body) => Array.isArray(body.messages[0]!.content));
    return { sent, call, marked, replies };
  };

  it("a one-POST call or a call whose repairs run at another effort sends the unmarked body", async () => {
    const onePost = efforts();
    onePost.replies.splice(0, 1);
    await onePost.call({ maxAttemptsThisCall: 1 });
    expect(onePost.marked()).toEqual([false]);
    expect(typeof onePost.sent[0]!.messages[0]!.content).toBe("string");
    const otherEffort = efforts();
    await otherEffort.call({ repairThinkingLevel: "low" });
    expect(otherEffort.sent.map((body) => body.output_config?.effort)).toEqual(["high", "low"]);
    expect(otherEffort.marked()).toEqual([false, false]);
  });

  it("a call that may send a second POST at one effort marks the material on every POST (the positive twin)", async () => {
    const sameEffort = efforts();
    await sameEffort.call({ repairThinkingLevel: "high" });
    expect(sameEffort.sent.map((body) => body.output_config?.effort)).toEqual(["high", "high"]);
    expect(sameEffort.marked()).toEqual([true, true]);
    const levelOnlyOnce = efforts();
    await levelOnlyOnce.call({});
    expect(levelOnlyOnce.marked()).toEqual([true, true]);
  });
});
