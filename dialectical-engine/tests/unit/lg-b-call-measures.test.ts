/**
 * Length guidance L27 (spec 2026-10-15 §3.6), LG-B Task 2: every attempt records the vendor's cached input tokens and the
 * words its reply wrote; the accepted result also carries its answer tokens (output minus thinking). Information only:
 * nothing in a debate reads these, which the last test pins.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AnthropicMessagesProviderGateway, OpenAICompatibleProviderGateway, answerTokensOf, buildFramedPrompt, buildFramedRepairPrompt,
  replyWordCount, reportedCachedInputTokens, reportedReasoningTokens, schemaFailureLocator,
  type ProviderCallRequest, type RawArtifactInput
} from "@debateai/providers";

const MODEL = "synthetic/model";
const ENDPOINT = "https://relay.example/v1";
const STATEMENT = "{\"statement\":\"The tram extension pays for itself within nine years.\"}";

type Reply = Readonly<{ content: string; finish?: string; usage?: Readonly<Record<string, unknown>> }>;
function harness(replies: readonly Reply[]) {
  const artifacts: RawArtifactInput[] = [];
  const script = [...replies];
  const fetchImplementation = (async () => {
    const reply = script.shift() ?? { content: "{}" };
    return new Response(JSON.stringify({ id: "fixture", model: MODEL,
      choices: [{ message: { content: reply.content }, finish_reason: reply.finish ?? "stop" }],
      usage: reply.usage ?? { prompt_tokens: 10, completion_tokens: 20 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const gateway = new OpenAICompatibleProviderGateway({ endpoint: ENDPOINT, model: MODEL, maker: "Synthetic", fetchImplementation,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => entry.attemptId, assertNoOpenWriteTransaction: () => undefined,
    sleepImplementation: async () => undefined });
  return { gateway, artifacts };
}
function request(change: Partial<ProviderCallRequest> = {}): ProviderCallRequest {
  const framed = buildFramedPrompt({
    contract: { contractId: "fixture.measures.v1", instruction: "Answer the synthetic question.", answerForm: "Return {statement}." },
    material: [{ name: "question_line", content: "Synthetic question; no personal data." }]
  });
  return { runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey: "JUDGE:critic:node-1", role: "JUDGE", lane: "served",
    bound: { maxAttempts: 2, tokenCeiling: 512, deadlineMs: 5_000 }, contractHash: "contract:synthetic", providerRef: "relay:synthetic",
    packet: framed.packet,
    classifyContent: (content) => content === STATEMENT ? { parseStatus: "PARSED", parseError: null }
      : { parseStatus: "PARSE_FAILED", parseError: "synthetic" },
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)), ...change };
}

describe("reading the vendor's usage", () => {
  it("reads the cached input tokens in DeepInfra's, OpenAI's top-level and Anthropic's spellings", () => {
    expect(reportedCachedInputTokens({ prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 40 } })).toBe(40);
    expect(reportedCachedInputTokens({ prompt_tokens: 100, cached_tokens: 30 })).toBe(30);
    expect(reportedCachedInputTokens({ input_tokens: 10, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 })).toBe(4000);
    for (const usage of [undefined, null, [], {}, { prompt_tokens_details: { cached_tokens: -1 } }, { cached_tokens: 1.5 }]) {
      expect(reportedCachedInputTokens(usage)).toBeNull();
    }
  });

  it("reads thinking from the details or the top level, the larger when both (as the gate charges it)", () => {
    expect(reportedReasoningTokens({ completion_tokens_details: { reasoning_tokens: 9 } })).toBe(9);
    expect(reportedReasoningTokens({ reasoning_tokens: 12 })).toBe(12);
    expect(reportedReasoningTokens({ completion_tokens_details: { reasoning_tokens: 9 }, reasoning_tokens: 12 })).toBe(12);
    expect(reportedReasoningTokens({ output_tokens_details: { thinking_tokens: 300 } })).toBe(300);
    expect(reportedReasoningTokens({})).toBeNull();
  });

  it("derives the answer tokens as output minus thinking, and never guesses", () => {
    expect(answerTokensOf(500, 300)).toBe(200);
    expect(answerTokensOf(500, 0)).toBe(500);
    // Thinking reported outside the output count (the gate's billed_output_tokens reads it the same way).
    expect(answerTokensOf(500, 900)).toBe(500);
    expect(answerTokensOf(undefined, 300)).toBeNull();
    expect(answerTokensOf(500, null)).toBeNull();
    expect(answerTokensOf(-1, 0)).toBeNull();
  });

  it("counts a reply's words through the tolerant decode, and none for a reply that does not decode", () => {
    expect(replyWordCount(STATEMENT)).toBe(9);
    expect(replyWordCount("```json\n" + STATEMENT + "\n```")).toBe(9);
    expect(replyWordCount("{\"statement\":\"The tram ext", { finishReason: "length" })).toBeNull();
    expect(replyWordCount("no json here")).toBeNull();
  });
});

describe("the gateway records the measures on every attempt and on the result", () => {
  it("each artifact carries its cached tokens and its words; the result its answer tokens too", async () => {
    const { gateway, artifacts } = harness([
      { content: "not json", usage: { prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 0 } } },
      { content: STATEMENT, usage: { prompt_tokens: 120, completion_tokens: 400, prompt_tokens_details: { cached_tokens: 96 },
        completion_tokens_details: { reasoning_tokens: 350 } } }
    ]);
    const result = await gateway.call(request());
    expect(artifacts.map((artifact) => [artifact.cachedInputTokens, artifact.actualWords])).toEqual([[0, null], [96, 9]]);
    expect(result).toMatchObject({ reasoningTokens: 350, answerTokens: 50, cachedInputTokens: 96, actualWords: 9 });
  });

  it("uses the request's own word counter when it names one; a counter that throws or answers junk records null", async () => {
    const counted = harness([{ content: STATEMENT }]);
    await counted.gateway.call(request({ actualWordsOf: () => 4 }));
    expect(counted.artifacts[0]!.actualWords).toBe(4);
    for (const actualWordsOf of [() => { throw new Error("boom"); }, () => -1, () => 2.5, () => Number.NaN]) {
      const junk = harness([{ content: STATEMENT }]);
      const result = await junk.gateway.call(request({ actualWordsOf }));
      expect([junk.artifacts[0]!.actualWords, result.actualWords]).toEqual([null, null]);
    }
  });

  it("the Anthropic wire reads its cache reads before they are folded into the prompt count", async () => {
    const artifacts: RawArtifactInput[] = [];
    const fetchImplementation = (async () => new Response(JSON.stringify({ id: "msg_1", type: "message", role: "assistant",
      model: "claude-haiku-5-5", content: [{ type: "text", text: STATEMENT }], stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 500, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0,
        output_tokens_details: { thinking_tokens: 300 } } }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    const gateway = new AnthropicMessagesProviderGateway({ endpoint: "https://api.anthropic.com/v1", model: "claude-haiku-5-5",
      maker: "Anthropic", fetchImplementation, persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
      appendLedgerEntry: async (entry) => entry.attemptId, assertNoOpenWriteTransaction: () => undefined });
    const result = await gateway.call(request({ providerRef: "preview:claude-haiku-5-5" }));
    expect(result).toMatchObject({ reasoningTokens: 300, answerTokens: 200, cachedInputTokens: 4000, actualWords: 9 });
    expect(artifacts[0]).toMatchObject({ cachedInputTokens: 4000, actualWords: 9, thinkingTokens: 300 });
  });
});

describe("nothing in a debate reads the measures (spec §3.6)", () => {
  const READERS = ["apps/runner/src", "packages/serve/src", "packages/story/src", "packages/map/src", "packages/judgement/src"];
  const MEASURE = /\b(?:cachedInputTokens|actualWords|answerTokens|cached_input_tokens|actual_words|answer_tokens)\b/u;
  const files = (folder: string): string[] => readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
  });
  it("the runner, the answer, the story, the map and the judges never name them", () => {
    const hits = READERS.flatMap(files).flatMap((file) => readFileSync(file, "utf8").split("\n")
      .flatMap((line, index) => MEASURE.test(line) ? [`${file}:${String(index + 1)}`] : []));
    expect(hits).toEqual([]);
  });
});
