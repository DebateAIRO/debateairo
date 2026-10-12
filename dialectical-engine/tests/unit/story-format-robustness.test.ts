import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway,
  buildFramedPrompt,
  buildFramedRepairPrompt,
  createPreviewGuardedFetch,
  parsePreviewProviderTestConfig,
  previewModelRow,
  previewTargetGatewayControls,
  readPromptFrame,
  schemaFailureLocator,
  withPreviewProviderCallPolicy,
  type ContentClassification,
  type PreviewBudgetExecution,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import {
  STORYTELLER_ANSWER_FORM,
  STORYTELLER_CONTRACT_ID,
  STORY_CHECKER_ANSWER_FORM,
  STORY_CHECKER_CONTRACT_ID,
  buildStoryCheckerContract,
  buildStoryMaterial,
  buildStorytellerContract,
  classifyCheckerContent,
  classifyStoryContent,
  loadStoryPack,
  parseCheckerVerdict,
  parseStoryBody,
  resolveStoryPackDir
} from "@debateai/story";
import {
  STORYTELLER_V2_ANSWER_FORM,
  STORYTELLER_V2_CONTRACT_ID,
  STORY_CHECKER_V1_ANSWER_FORM,
  STORY_CHECKER_V1_CONTRACT_ID
} from "../../packages/story/src/contracts.js";
import {
  previewCallOutputTokens,
  previewCallShares,
  strictUpperBoundPricer
} from "../../apps/api/src/preview-budget-estimate.js";
import { practiceStoryPolicy, practiceStorySnapshot } from "../../tools/preview-practice/practice-lanes.js";
import { practiceQuestion } from "../../tools/preview-practice/practice-questions.js";

/**
 * Story format robustness (2026-10-12). The preview's practice run (formats mode) showed the two story steps
 * failing on format, never on substance: DeepSeek's storyteller spent its sealed 12,000 tokens thinking (A),
 * a story missing only its last brace, a checker that wrote its reasoning before the verdict and a Romanian
 * quote closed with a straight quote (B), checker verdicts with no criteria (C), and on the preview a checker
 * slip got no second try (D). The fixtures are those real replies: our own practice text, no secret.
 */
const fixture = (name: string): string =>
  readFileSync(new URL(`../support/fixtures/story-format-replies/${name}`, import.meta.url), "utf8");
const STOP = Object.freeze({ finishReason: "stop" });
const LENGTH = Object.freeze({ finishReason: "length" });
const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));

const CRITERIA = Object.freeze({
  faithful_to_material: true, agrees_with_label: false, fair_to_losing_paths: false, no_overstatement: false,
  citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
});
const VERDICT = JSON.stringify({ satisfied: false, objection: "The second path line never says why it lost (P2).", criteria: CRITERIA });
/** The DeepSeek checker reply as the v2 form asks for it: the same prose first, then a verdict WITH criteria. */
const proseThenWholeVerdict = (): string =>
  fixture("deepseek-checker-en-prose-then-json.txt").replace(/\n\}$/u, `,\n  "criteria": ${JSON.stringify(CRITERIA)}\n}`);

function practiceIndex(questionId: string) {
  const built = buildStoryMaterial({
    snapshot: practiceStorySnapshot({ question: practiceQuestion(questionId),
      runId: "11111111-0000-4000-8000-000000000001", workItemId: "11111111-0000-4000-8000-000000000002" }) as never,
    enrichment: new Map(), budgetBytes: practiceStoryPolicy().materialBudget.high,
    shapeIds: new Set(PACK.shapes.map((shape) => shape.id))
  });
  if (built.kind !== "OK") throw new Error("material too large");
  return built.index;
}

describe("B — the story checker's reply is decoded tolerantly, then checked in full", () => {
  it("the DeepSeek reply (reasoning in prose, then the JSON) is read; its missing criteria are still refused", () => {
    const reply = fixture("deepseek-checker-en-prose-then-json.txt");
    const classified = classifyCheckerContent(reply, STOP);
    expect(classified.parseStatus).toBe("SCHEMA_FAILED");
    expect(classified.parseError).toContain("criteria");
    const whole = proseThenWholeVerdict();
    expect(classifyCheckerContent(whole, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "OUTERMOST_OBJECT" });
    expect(parseCheckerVerdict(whole, STOP)).toMatchObject({ satisfied: false, criteria: CRITERIA });
  });

  it("the MiMo reply (a Romanian quote closed with a straight quote) is read as the verdict it is", () => {
    const reply = fixture("mimo-checker-ro-straight-quote.txt");
    expect(classifyCheckerContent(reply, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_QUOTE" });
    const verdict = parseCheckerVerdict(reply, STOP);
    expect(verdict.satisfied).toBe(false);
    expect(verdict.objection).toContain("„The position held up, with one open question.\" prezintă");
  });

  it.each(["mimo-checker-en-no-criteria.txt", "deepseek-checker-ro-no-criteria.txt"])(
    "%s: a verdict with no criteria stays a schema failure; nothing is ever invented", (name) => {
      const classified = classifyCheckerContent(fixture(name), STOP);
      expect(classified.parseStatus).toBe("SCHEMA_FAILED");
      expect(schemaFailureLocator(classified as Exclude<ContentClassification, { parseStatus: "PARSED" }>))
        .toEqual({ code: "SCHEMA_FAILED", path: "criteria" });
    });

  it("strict content is untouched and carries no repair code", () => {
    expect(classifyCheckerContent(VERDICT)).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(classifyCheckerContent(VERDICT, STOP)).toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("a verdict missing its last brace is completed only when the call finished normally", () => {
    const cut = VERDICT.slice(0, -1);
    expect(classifyCheckerContent(cut, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "CLOSING_BRACKETS" });
    expect(classifyCheckerContent(cut, LENGTH).parseStatus).toBe("PARSE_FAILED");
    expect(classifyCheckerContent(cut).parseStatus).toBe("PARSE_FAILED");
    expect(() => parseCheckerVerdict(cut)).toThrow(expect.objectContaining({ code: "STORY_CHECKER_CONTENT_INVALID" }));
    expect(parseCheckerVerdict(cut, STOP)).toMatchObject({ satisfied: false });
  });

  it("a reply that would need any other repair still fails", () => {
    expect(classifyCheckerContent(VERDICT.replace(/"satisfied"/u, "'satisfied'"), STOP).parseStatus).toBe("PARSE_FAILED");
    expect(classifyCheckerContent(VERDICT.replace(/\}$/u, ",}"), STOP).parseStatus).toBe("PARSE_FAILED");
  });
});

describe("B — the storyteller's reply is decoded tolerantly, then checked in full", () => {
  const index = practiceIndex("ro");
  const reply = fixture("deepseek-storyteller-ro-missing-brace.txt");

  /** The same story with its brace where it belongs (closing "long"), and only the LAST brace left out. */
  const shortOnlyAtTheEnd = (): string => {
    const decoded = JSON.parse(`${reply}}`) as { long: { sections: unknown; reviewer_note: unknown } } & Record<string, unknown>;
    const { reviewer_note, ...long } = decoded.long;
    return JSON.stringify({ ...decoded, long, reviewer_note }).slice(0, -1);
  };

  it("the real reply left out the brace closing \"long\": decoded at the end, then refused by the schema with a path", () => {
    const refused = classifyStoryContent(reply, index, STOP);
    expect(refused.parseStatus).toBe("SCHEMA_FAILED");
    // Before, PARSE_FAILED (invalid_json at $); now the one repair packet can name the member that is wrong.
    expect(schemaFailureLocator(refused as Exclude<ContentClassification, { parseStatus: "PARSED" }>))
      .toEqual({ code: "SCHEMA_FAILED", path: "long" });
  });

  it("the same story missing only its final brace is accepted when the call finished normally", () => {
    const story = shortOnlyAtTheEnd();
    expect(() => JSON.parse(story)).toThrow();
    expect(classifyStoryContent(story, index, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "CLOSING_BRACKETS" });
    expect(parseStoryBody(story, index, STOP).short.paths).toHaveLength(2);
  });

  it("is NOT repaired when the call was cut off at its token ceiling, or when how it ended is unknown", () => {
    const story = shortOnlyAtTheEnd();
    expect(classifyStoryContent(story, index, LENGTH).parseStatus).toBe("PARSE_FAILED");
    expect(classifyStoryContent(story, index).parseStatus).toBe("PARSE_FAILED");
    expect(() => parseStoryBody(story, index)).toThrow(expect.objectContaining({ code: "STORY_CONTENT_INVALID" }));
  });

  it("a repaired story still meets every content check", () => {
    const story = shortOnlyAtTheEnd();
    const withUnknownRef = story.replace("\"node_refs\":[\"P1\",\"P2\",\"P3\"]}", "\"node_refs\":[\"P99\"]}");
    expect(withUnknownRef).not.toBe(story);
    const refused = classifyStoryContent(withUnknownRef, index, STOP);
    expect(refused.parseStatus).toBe("SCHEMA_FAILED");
    expect(refused.parseError).toContain("STORY_UNKNOWN_NODE_REF");
  });
});

describe("C — the checker's answer form says criteria are always required and how to quote", () => {
  it("is a new contract, v2, that keeps v1's form byte for byte and adds the two sentences", () => {
    expect(STORY_CHECKER_V1_CONTRACT_ID).toBe("story.checker.v1");
    expect(STORY_CHECKER_CONTRACT_ID).toBe("story.checker.v2");
    expect(STORY_CHECKER_ANSWER_FORM.startsWith(`${STORY_CHECKER_V1_ANSWER_FORM}\n`)).toBe(true);
    expect(STORY_CHECKER_ANSWER_FORM).toContain("The criteria object is always required, with all eight booleans, whether satisfied is true or false.");
    expect(STORY_CHECKER_ANSWER_FORM).toContain("No text contains a straight double quote (\"): to quote words, use typographic quotes such as „ ” or « », or escape the straight quote as \\\".");
    const contract = buildStoryCheckerContract(PACK);
    expect(contract.contractId).toBe("story.checker.v2");
    expect(contract.answerForm).toBe(STORY_CHECKER_ANSWER_FORM);
  });

  it("the storyteller's form gets the same quote sentence under its own new contract, v3", () => {
    expect(STORYTELLER_V2_CONTRACT_ID).toBe("story.storyteller.v2");
    expect(STORYTELLER_CONTRACT_ID).toBe("story.storyteller.v3");
    expect(STORYTELLER_ANSWER_FORM.startsWith(`${STORYTELLER_V2_ANSWER_FORM}\n`)).toBe(true);
    expect(STORYTELLER_ANSWER_FORM).toContain("No text contains a straight double quote (\"): to quote words, use typographic quotes such as „ ” or « », or escape the straight quote as \\\".");
    expect(buildStorytellerContract(PACK).contractId).toBe("story.storyteller.v3");
  });
});

const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const HAIKU = "claude-haiku-5-5";
const GLM = "zai-org/GLM-5.3-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const ENDPOINT = "https://api.deepinfra.com/v1/openai";
const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, HAIKU], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "story-format-fixture",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget.sock"
}))!;

function storyCall(site: "STORYTELLER" | "CHECKER", contractId: string, classify: (content: string, reply?: { finishReason: string | null }) => ContentClassification): ProviderCallRequest {
  const framed = buildFramedPrompt({
    contract: { contractId, instruction: "Do the synthetic story step.", answerForm: "Return one JSON object." },
    material: [{ name: "story_material", content: "One policy position, cited as P1." }]
  });
  return {
    runId: "run:synthetic", subjectItemId: "story:synthetic", callSiteKey: `STORY:${site}:1`,
    role: site === "STORYTELLER" ? "SYNTHESIZER" : "EVALUATOR", lane: "story",
    bound: site === "STORYTELLER" ? { maxAttempts: 2, tokenCeiling: 12_000, deadlineMs: 300_000 } : { maxAttempts: 2, tokenCeiling: 2_048, deadlineMs: 180_000 },
    contractHash: `contract:synthetic-${site}`, providerRef: "preview:deepseek-v4-1-flash", packet: framed.packet,
    preferredResponseFormat: "json_object", classifyContent: classify,
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected))
  };
}
const checkerCall = (contractId = "story.checker.v2") => storyCall("CHECKER", contractId, (content, reply) => classifyCheckerContent(content, reply));
const storytellerCall = () => storyCall("STORYTELLER", "story.storyteller.v3", () => ({ parseStatus: "PARSED", parseError: null }));

const RESULT: ProviderCallResult = {
  content: VERDICT, rawArtifactRef: "artifact:fixture", ledgerEntryRef: "ledger:fixture",
  provider: "openai-compatible-http", model: DEEPSEEK, maker: "DeepSeek", modelVersion: DEEPSEEK
};
async function forwarded(request: ProviderCallRequest, model = DEEPSEEK): Promise<ProviderCallRequest> {
  let received: ProviderCallRequest | undefined;
  await withPreviewProviderCallPolicy({ call: async (effective) => { received = effective; return RESULT; } }, CONFIG, { model }).call(request);
  if (received === undefined) throw new Error("PREVIEW_REQUEST_NOT_FORWARDED");
  return received;
}
/** The preview's real gateway stack for a DeepInfra row (DeepSeek unless named), as the runner builds it: guarded fetch, the row's output clamp, the call policy. */
function nativeHarness(contents: readonly string[], finishReasons: readonly string[] = [], model = DEEPSEEK) {
  const executions: PreviewBudgetExecution[] = [];
  const artifacts: RawArtifactInput[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const sleeps: number[] = [];
  const fetcher = createPreviewGuardedFetch({ execute: async (input) => {
    executions.push(input);
    return { status: 200, body: JSON.stringify({ id: `fixture-${executions.length}`, model,
      choices: [{ message: { content: contents[executions.length - 1] ?? contents.at(-1)! }, finish_reason: finishReasons[executions.length - 1] ?? "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
  } });
  const row = rowOf(model);
  const native = new OpenAICompatibleProviderGateway({
    endpoint: ENDPOINT, model, maker: row.maker,
    ...(row.effort === null ? {} : { thinking: { parameter: "reasoning_effort", levels: ["high"] } }), fetchImplementation: fetcher,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return entry.attemptId; },
    ...previewTargetGatewayControls(CONFIG, { model })
  });
  const gateway = withPreviewProviderCallPolicy(native, CONFIG, { model }, { sleep: async (milliseconds) => { sleeps.push(milliseconds); } });
  return { gateway, executions, artifacts, ledger, sleeps };
}
const freeEnvelope = { assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined };

describe("A — on the preview the storyteller asks for its row's own story allowance, room to think", () => {
  // Slow answer (owner ruling 2026-10-12): the row's whole answer cap only on the fast rows (DeepSeek, Claude Haiku);
  // 16,384 on the slower ones (MiMo, Qwen, GLM), whose story at 17 tokens a second could otherwise outrun the gate.
  it("raises the storyteller's max_tokens to the row's story allowance (DeepInfra and Anthropic rows alike), never above its bound", async () => {
    for (const [model, tokenCeiling] of [[DEEPSEEK, 32_768], [HAIKU, 32_768], [GLM, 16_384], [MIMO, 16_384], [QWEN, 16_384]] as const) {
      const effective = await forwarded(storytellerCall(), model);
      expect(effective.bound, model).toEqual({ maxAttempts: 2, tokenCeiling, deadlineMs: 1_260_000 });
    }
  });

  it("leaves every other call where previewCallBound puts it", async () => {
    expect((await forwarded(checkerCall())).bound).toEqual({ maxAttempts: 2, tokenCeiling: 8192, deadlineMs: 1_260_000 });
    const notStory = { ...storytellerCall(), lane: "served", callSiteKey: "COMPOSER:1" } as ProviderCallRequest;
    expect((await forwarded(notStory)).bound.tokenCeiling).toBe(12_000);
    const wrongRole = { ...storytellerCall(), role: "EVALUATOR" } as ProviderCallRequest;
    expect((await forwarded(wrongRole)).bound.tokenCeiling).toBe(12_000);
  });

  it("sends max_tokens 32,768 on the wire for the storyteller", async () => {
    const { gateway, executions } = nativeHarness([VERDICT]);
    await gateway.call({ ...storytellerCall(), costEnvelope: freeEnvelope });
    expect(JSON.parse(executions[0]!.requestBody)).toMatchObject({ model: DEEPSEEK, max_tokens: 32_768, reasoning_effort: "high" });
  });

  it("sends max_tokens 16,384 for MiMo's storyteller, and its length retry twice that, held to the row's 32,768", async () => {
    const { gateway, executions } = nativeHarness([VERDICT.slice(0, -1), VERDICT], ["length", "stop"], MIMO);
    // A story cut off at its allowance is refused, so the call's second POST is the length retry.
    const cutIsRefused = storyCall("STORYTELLER", "story.storyteller.v3", (_content, reply) => reply?.finishReason === "length"
      ? { parseStatus: "PARSE_FAILED", parseError: "cut off at max_tokens" } : { parseStatus: "PARSED", parseError: null });
    await gateway.call({ ...cutIsRefused, costEnvelope: freeEnvelope });
    expect(executions.map((execution) => JSON.parse(execution.requestBody).max_tokens)).toEqual([16_384, 32_768]);
    expect(JSON.parse(executions[0]!.requestBody)).toMatchObject({ model: MIMO, temperature: 1.0, top_p: 0.95 });
  });

  it("the start-of-debate estimate prices the storyteller at what is sent: each row's own story allowance", () => {
    const sent = previewCallOutputTokens(CONFIG, { debate: [2048, 2048], story: { storyteller: 12_000, checker: 2048 } });
    // The largest any row's storyteller asks for; each row is priced at its own allowance below.
    expect(sent).toEqual({ debate: 8192, storyteller: 32_768, storytellerRetry: 65_536, storyChecker: 8192 });
    const strict = strictUpperBoundPricer(sent);
    const deepseek = { inputNanoUsdPerToken: 200n, outputNanoUsdPerToken: 600n };
    // The retry is clamped to the row's bound, exactly as the gateway clamps what it sends.
    for (const type of ["STORYTELLER", "STORYTELLER_RETRY"] as const) {
      expect(strict(rowOf(DEEPSEEK), type)).toBe(264_192n * deepseek.inputNanoUsdPerToken + 32_768n * deepseek.outputNanoUsdPerToken);
    }
    // MiMo asks 16,384 first; its length retry asks twice that, which its 32,768 bound holds.
    expect(strict(rowOf(MIMO), "STORYTELLER")).toBe(264_192n * 430n + 16_384n * 870n);
    expect(strict(rowOf(MIMO), "STORYTELLER_RETRY")).toBe(264_192n * 430n + 32_768n * 870n);
    expect(strict(rowOf(QWEN), "STORYTELLER")).toBe(264_192n * 113n + 16_384n * 382n);
    expect(strict(rowOf(GLM), "STORYTELLER")).toBe(264_192n * 150n + 16_384n * 500n);
  });
});

describe("D — on the preview the story checker gets the storyteller's one format repair", () => {
  it("permits two POSTs in the current checker's call; an old checker contract keeps one", async () => {
    expect((await forwarded(checkerCall())).maxAttemptsThisCall).toBe(2);
    expect((await forwarded(checkerCall("story.checker.v1"))).maxAttemptsThisCall).toBe(1);
    expect((await forwarded({ ...checkerCall(), callSiteKey: "STORY:CHECKER:9" })).maxAttemptsThisCall).toBe(1);
    expect((await forwarded({ ...checkerCall(), role: "SYNTHESIZER" })).maxAttemptsThisCall).toBe(1);
    expect((await forwarded({ ...checkerCall(), bound: { maxAttempts: 1, tokenCeiling: 2048, deadlineMs: 1 } })).maxAttemptsThisCall).toBe(1);
  });

  // Patch follow-up (owner design, 2026-10-12): the one more POST is the short follow-up — the model's own verdict back,
  // only `criteria` asked for — and the sealed bound of two leaves no full re-ask after it.
  it("the real MiMo/DeepSeek slip (no criteria) is repaired by one more POST, with a code and a path only", async () => {
    const slip = fixture("deepseek-checker-ro-no-criteria.txt");
    const { gateway, executions, artifacts, ledger, sleeps } = nativeHarness([slip, JSON.stringify({ criteria: CRITERIA })]);
    const charges: unknown[] = [];
    const result = await gateway.call({ ...checkerCall(), costEnvelope: { ...freeEnvelope, recordCall: (charge: unknown) => { charges.push(charge); } } });
    // The accepted verdict is the model's own first verdict with the criteria it was asked for merged in.
    const verdict = parseCheckerVerdict(result.content, STOP);
    expect(verdict).toMatchObject({ satisfied: false, criteria: CRITERIA });
    expect(verdict.objection).toContain("Fate-urile");
    expect(result.repairAttempts).toBe(1);
    expect(result.repairForm).toBe("PATCH");
    expect(executions).toHaveLength(2);
    expect(charges).toHaveLength(2);
    expect(sleeps).toEqual([]);
    expect(artifacts.map((artifact) => artifact.parseStatus)).toEqual(["SCHEMA_FAILED", "PARSED"]);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "OK"]);
    const messages = JSON.parse(executions[1]!.requestBody).messages as { role: string; content: string }[];
    const repaired = readPromptFrame({ messages: messages as never });
    expect(repaired.contractId).toBe("story.checker.v2");
    expect(repaired.fields.slice(-3)).toEqual([
      { name: "machine_rejection_code", content: "SCHEMA_FAILED" },
      { name: "machine_rejection_paths", content: "criteria" },
      { name: "machine_reply_form", content: "PATCH" }
    ]);
    // The model's words go back only as its own turn, never as material or instruction.
    expect(messages.filter((message) => message.content.includes("Fate-urile")).map((message) => message.role)).toEqual(["assistant"]);
  });

  it("stops after that one repair", async () => {
    const slip = fixture("mimo-checker-en-no-criteria.txt");
    const { gateway, executions } = nativeHarness([slip]);
    await expect(gateway.call({ ...checkerCall(), costEnvelope: freeEnvelope }))
      .rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 2, lastParseStatus: "SCHEMA_FAILED" });
    expect(executions).toHaveLength(2);
  });
});

describe("B — the gateway tells the classifier how the reply ended", () => {
  it("a verdict missing its last brace, finished normally, is accepted on the first POST", async () => {
    const { gateway, executions, artifacts } = nativeHarness([VERDICT.slice(0, -1)], ["stop"]);
    const result = await gateway.call({ ...checkerCall(), costEnvelope: freeEnvelope });
    expect(executions).toHaveLength(1);
    expect(artifacts.map((artifact) => artifact.parseStatus)).toEqual(["PARSED"]);
    // The stored artifact is the vendor's own bytes; the content handed back is what arrived, unrepaired.
    expect(result.content).toBe(VERDICT.slice(0, -1));
    expect(parseCheckerVerdict(result.content, STOP)).toMatchObject({ satisfied: false });
  });

  it("the same verdict cut off at the ceiling is a length failure, never repaired", async () => {
    const { gateway, executions, artifacts } = nativeHarness([VERDICT.slice(0, -1), VERDICT], ["length", "stop"]);
    const result = await gateway.call({ ...checkerCall(), costEnvelope: freeEnvelope });
    expect(executions).toHaveLength(2);
    expect(artifacts.map((artifact) => artifact.parseStatus)).toEqual(["PARSE_FAILED", "PARSED"]);
    expect(result.content).toBe(VERDICT);
  });
});

describe("D — the start-of-debate estimate counts the checker's repair as a billed call, like the storyteller's", () => {
  it("puts two checker calls per round on the checker's model and no 60-second resend for them", () => {
    const shares = previewCallShares({ basis: { panel_size: 1, max_model_attempts: 1 }, panel: [{ provider_ref: "preview:fixture-a", model_id: GLM }],
      roleModels: { answerWriter: GLM, answerChecker: GLM, storyteller: GLM, storyChecker: DEEPSEEK },
      roleProviderRefs: [], storyRounds: 2, maxCooldownHoldsPerRun: 0, storyOnly: true });
    const byType = (model: string, type: string) => shares.shares.filter((share) => share.model === model && share.type === type)
      .reduce((sum, share) => sum + share.numerator, 0n) / shares.denominator;
    expect(byType(DEEPSEEK, "STORY_CHECKER")).toBe(2n);
    expect(byType(DEEPSEEK, "STORY_CHECKER_RETRY")).toBe(2n);
    expect(byType(DEEPSEEK, "UNBILLED_RETRY")).toBe(0n);
    expect(byType(GLM, "STORYTELLER")).toBe(2n);
    expect(byType(GLM, "STORYTELLER_RETRY")).toBe(2n);
  });

  it("prices the checker's repair at its length-retry ceiling, clamped to the row", () => {
    const sent = previewCallOutputTokens(CONFIG, { debate: [2048], story: { storyteller: 12_000, checker: 2048 } });
    const strict = strictUpperBoundPricer(sent);
    expect(strict(rowOf(DEEPSEEK), "STORY_CHECKER_RETRY")).toBe(264_192n * 200n + 16_384n * 600n);
  });
});

describe("E — story wording (practice debate 2, 2026-10-12): MiMo's story checker gets room to finish its thinking", () => {
  // At 8,192 MiMo's thinking stopped at exactly 4,916 reasoning tokens on both of its checks; on the second, its
  // unfinished thinking ran on in the answer after the JSON verdict until max_tokens (finish "length").
  const verdictThenThinking = `${VERDICT}\n\nHmm, wait. Let me reconsider before finalizing. The objection above is wrong.`;

  it("MiMo's checker asks for 16,384; every other row's checker keeps previewCallBound's 8,192", async () => {
    expect(rowOf(MIMO).storyCheckerTokenCeiling).toBe(16_384);
    expect((await forwarded(checkerCall(), MIMO)).bound).toEqual({ maxAttempts: 2, tokenCeiling: 16_384, deadlineMs: 1_260_000 });
    for (const model of [DEEPSEEK, GLM, QWEN, HAIKU]) {
      expect(rowOf(model).storyCheckerTokenCeiling, model).toBe(8192);
      expect((await forwarded(checkerCall(), model)).bound.tokenCeiling, model).toBe(8192);
    }
  });

  it("never lowers what previewCallBound gives the checker", async () => {
    const larger = { ...checkerCall(), bound: { maxAttempts: 2, tokenCeiling: 20_000, deadlineMs: 180_000 } };
    expect((await forwarded(larger, MIMO)).bound.tokenCeiling).toBe(20_000);
  });

  it("sends 16,384 on the wire, and after a verdict cut off at max_tokens its length retry twice that, held to the row's cap", async () => {
    const { gateway, executions } = nativeHarness([verdictThenThinking, VERDICT], ["length", "stop"], MIMO);
    const result = await gateway.call({ ...checkerCall(), costEnvelope: freeEnvelope });
    expect(executions.map((execution) => JSON.parse(execution.requestBody).max_tokens)).toEqual([16_384, 32_768]);
    expect(result.content).toBe(VERDICT);
  });

  it("still never salvages the first JSON of a reply cut off at max_tokens: its own text may overturn it", () => {
    expect(classifyCheckerContent(verdictThenThinking, { finishReason: "length" }).parseStatus).not.toBe("PARSED");
  });

  it("the start-of-debate estimate prices MiMo's checker at what is sent, and every other row's as before", () => {
    const sent = previewCallOutputTokens(CONFIG, { debate: [2048], story: { storyteller: 12_000, checker: 2048 } });
    expect(sent.storyChecker).toBe(8192);
    const strict = strictUpperBoundPricer(sent);
    const mimo = rowOf(MIMO);
    expect(strict(mimo, "STORY_CHECKER") - strict(mimo, "DEBATE")).toBe(8192n * mimo.outputNanoUsdPerToken);
    expect(strict(mimo, "STORY_CHECKER_RETRY")).toBe(strict(mimo, "DEBATE") + (32_768n - 8192n) * mimo.outputNanoUsdPerToken);
    const deepseek = rowOf(DEEPSEEK);
    expect(strict(deepseek, "STORY_CHECKER")).toBe(strict(deepseek, "DEBATE"));
    // None, when the register has no story.
    const none = strictUpperBoundPricer(previewCallOutputTokens(CONFIG, { debate: [2048], story: null }));
    expect(none(mimo, "STORY_CHECKER")).toBe(none(mimo, "DEBATE") - 8192n * mimo.outputNanoUsdPerToken);
  });
});

function rowOf(model: string) {
  const row = previewModelRow(model);
  if (row === undefined) throw new Error("unreviewed");
  return row;
}
