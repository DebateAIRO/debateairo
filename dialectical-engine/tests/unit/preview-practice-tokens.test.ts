/**
 * Length guidance L27 (LG-B Task 10): the practice report shows, per AI and per step, the thinking, answer and cached
 * tokens, the retries that thought one level lower, the final-writer calls, and the words written against the words
 * guided. Information only: no verdict reads them.
 */
import { describe, expect, it } from "vitest";
import { PREVIEW_PROVIDER_REF_MODELS, previewModelRow } from "@debateai/providers";
import { PracticeGateObserver, type PracticeWireEvent } from "../../tools/preview-practice/practice-gate-observer.js";
import { practiceAttemptsOf, practiceWireUsage } from "../../tools/preview-practice/practice-formats.js";
import {
  practiceLengthLines, practiceLengthRows, practiceTokenLines, practiceTokenRows, practiceTryTier, type PracticeMeasuredAttempt
} from "../../tools/preview-practice/practice-tokens.js";
import { buildTranscriptAttempts } from "../../tools/preview-practice/practice-transcript.js";

const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const GLM = "zai-org/GLM-5.3-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const HAIKU = "claude-haiku-5-5";
/** One stored try; its words belong to its own AI unless the change names another (a structure-repair try). */
const attempt = (change: Partial<PracticeMeasuredAttempt>): PracticeMeasuredAttempt => Object.freeze({
  model: DEEPSEEK, actorRef: "preview:deepseek-v4-1-flash", callSiteKey: "JUDGE:critic:n1", outcome: "OK", thinkingLevel: "high",
  replyForm: "ORIGINAL", parseStatus: "PARSED", finishReason: "stop", tokenCeiling: 8192, promptTokens: 1000, completionTokens: 900,
  thinkingTokens: 600, cachedInputTokens: 250, actualWords: 300, guidedWords: null, ...change,
  wordsModel: change.wordsModel ?? change.model ?? DEEPSEEK });

describe("tokens per AI and step", () => {
  it("adds up each step's calls, thinking, answer and cached share", () => {
    const rows = practiceTokenRows([
      attempt({}), attempt({ callSiteKey: "JUDGE:critic:n2", completionTokens: 500, thinkingTokens: 100, cachedInputTokens: 750 }),
      attempt({ callSiteKey: "PANEL:root:x", thinkingTokens: null, cachedInputTokens: null })
    ]);
    expect(rows).toEqual([
      { model: DEEPSEEK, step: "judge_panel", calls: 1, thinkingTokens: { p50: null, p90: null, max: null },
        answerTokens: { p50: null, p90: null, max: null }, cachedShare: null, thoughtLess: 0, finalWriterTier: 0 },
      { model: DEEPSEEK, step: "pros_cons", calls: 2, thinkingTokens: { p50: 100, p90: 600, max: 600 },
        answerTokens: { p50: 300, p90: 400, max: 400 }, cachedShare: 0.5, thoughtLess: 0, finalWriterTier: 0 }
    ]);
  });

  it("counts a length retry that ran a level lower, and the calls that asked more than the standard bound", () => {
    const rows = practiceTokenRows([
      attempt({ model: HAIKU, actorRef: "preview:claude-haiku-5-5", callSiteKey: "STORY:STORYTELLER:1", finishReason: "length",
        tokenCeiling: 128000, thinkingTokens: 127000, completionTokens: 128000, outcome: "FAILED", parseStatus: "PARSE_FAILED" }),
      attempt({ model: HAIKU, actorRef: "preview:claude-haiku-5-5", callSiteKey: "STORY:STORYTELLER:1", thinkingLevel: "medium",
        replyForm: "LENGTH_RETRY", tokenCeiling: 128000, thinkingTokens: 9000, completionTokens: 15000 })
    ]);
    expect(rows).toEqual([expect.objectContaining({ model: HAIKU, step: "story_writer", calls: 2, thoughtLess: 1, finalWriterTier: 2 })]);
  });

  it("counts only a LENGTH_RETRY try at a level below the try before it on the AI's own menu (pre-flight PF-B4.5)", () => {
    const haiku = { model: HAIKU, actorRef: "preview:claude-haiku-5-5" } as const;
    const mimo = { model: MIMO, actorRef: "preview:mimo-v2-6-pro" } as const;
    const rows = practiceTokenRows([
      // A patch cut off at slip_fix "low", then the length retry at the call's own "high": it thought MORE, not less.
      attempt({ ...haiku, callSiteKey: "STORY:STORYTELLER:1", thinkingLevel: "low", replyForm: "PATCH", finishReason: "length",
        outcome: "FAILED", parseStatus: "PARSE_FAILED" }),
      attempt({ ...haiku, callSiteKey: "STORY:STORYTELLER:1", thinkingLevel: "high", replyForm: "LENGTH_RETRY" }),
      // A cut-off try, then a full re-ask at slip_fix "low": a wrong-form repair, not a length retry.
      attempt({ ...haiku, callSiteKey: "JUDGE:critic:n7", thinkingLevel: "high", finishReason: "length", outcome: "FAILED",
        parseStatus: "PARSE_FAILED" }),
      attempt({ ...haiku, callSiteKey: "JUDGE:critic:n7", thinkingLevel: "low", replyForm: "FULL" }),
      // MiMo's default is recorded as DEFAULT_ONLY on the ledger; "none" is one below it.
      attempt({ ...mimo, callSiteKey: "JUDGE:critic:n8", thinkingLevel: "DEFAULT_ONLY", finishReason: "length", outcome: "FAILED",
        parseStatus: "PARSE_FAILED" }),
      attempt({ ...mimo, callSiteKey: "JUDGE:critic:n8", thinkingLevel: "none", replyForm: "LENGTH_RETRY" })
    ]);
    expect(Object.fromEntries(rows.map((row) => [`${row.model} ${row.step}`, row.thoughtLess]))).toEqual({
      [`${HAIKU} story_writer`]: 0, [`${HAIKU} pros_cons`]: 0, [`${MIMO} pros_cons`]: 1 });
  });

  it("writes one table line per row, content-free", () => {
    const lines = practiceTokenLines(practiceTokenRows([attempt({})]));
    expect(lines.join("\n")).toContain(`| ${DEEPSEEK} | pros_cons | 1 | 600 / 600 / 600 | 300 / 300 / 300 | 25.0% | 0 | 0 |`);
    expect(practiceTokenLines([])).toEqual([]);
  });
});

describe("guided and actual words per AI and step", () => {
  it("reads guided words from the record when there are some; actual words over the accepted replies", () => {
    const rows = practiceLengthRows([
      attempt({ actualWords: 200, guidedWords: 250 }), attempt({ callSiteKey: "JUDGE:critic:n2", actualWords: 400, guidedWords: 250 }),
      attempt({ callSiteKey: "JUDGE:critic:n3", outcome: "FAILED", parseStatus: "SCHEMA_FAILED", actualWords: 900 }),
      attempt({ callSiteKey: "JUDGE:critic:n4", outcome: "FAILED", parseStatus: "PARSE_FAILED", finishReason: "length", actualWords: null })
    ]);
    expect(rows).toEqual([{ model: DEEPSEEK, step: "pros_cons", guidedWords: 250, accepted: 2,
      actualWords: { median: 200, p90: 400, max: 400 }, overGuidedShare: 0.5, runawayStops: 1, slips: 2 }]);
  });

  it("without a length row the guided columns stay empty", () => {
    const rows = practiceLengthRows([attempt({})]);
    expect(rows[0]).toMatchObject({ guidedWords: null, overGuidedShare: null, actualWords: { median: 300, p90: 300, max: 300 } });
    expect(practiceLengthLines(rows).join("\n")).toContain(`| ${DEEPSEEK} | pros_cons | - | 1 | 300 / 300 / 300 | - | 0 | 0 |`);
  });

  it("credits a structure-repaired reply's words to the original AI and step; its tokens stay Haiku's (pre-flight PF-B4.6)", () => {
    const refused = attempt({ model: GLM, actorRef: "preview:glm-5-3-flash", outcome: "FAILED", parseStatus: "SCHEMA_FAILED", actualWords: null });
    const repaired = attempt({ model: HAIKU, wordsModel: GLM, actorRef: "preview:claude-haiku-5-5", callSiteKey: "REPAIR:STRUCTURE:JUDGE:critic:n1",
      replyForm: "STRUCTURE", thinkingLevel: "low", tokenCeiling: 32768, actualWords: 120 });
    expect(practiceLengthRows([refused, repaired])).toEqual([{ model: GLM, step: "pros_cons", guidedWords: null, accepted: 1,
      actualWords: { median: 120, p90: 120, max: 120 }, overGuidedShare: null, runawayStops: 0, slips: 1 }]);
    expect(practiceTokenRows([refused, repaired]).map((row) => [row.model, row.step, row.calls]))
      .toEqual([[HAIKU, "structure_repair", 1], [GLM, "pros_cons", 1]]);
  });

  it("a map row keeps its guided words but has no over share (LG-C, pre-flight PF-C4.1)", () => {
    const rows = practiceLengthRows([
      attempt({ callSiteKey: "MAP:list:1", guidedWords: 70, actualWords: 400 }),
      attempt({ callSiteKey: "MAP:list:2", guidedWords: 70, actualWords: 300 })
    ]);
    expect(rows).toEqual([expect.objectContaining({ model: DEEPSEEK, step: "map", guidedWords: 70, accepted: 2, overGuidedShare: null })]);
  });
});

describe("formats: each try keeps its bound and its thinking level (pre-flight PF-B4.3)", () => {
  it("copies the stored token_ceiling and the ledger's thinking level onto samples.jsonl's attempts; null without them", () => {
    const at = new Date(0);
    const sink = {
      artifacts: [{ attemptId: "a-1", parseStatus: "SCHEMA_FAILED", rawText: "", metadata: { token_ceiling: 128000, finish_reason: "stop" } }],
      ledger: [
        { attemptId: "a-1", callSiteKey: "STORY:STORYTELLER:1", outcome: "FAILED", startedAt: at, finishedAt: at, thinkingLevel: "medium" },
        { attemptId: "a-2", callSiteKey: "STORY:STORYTELLER:1", outcome: "FAILED", startedAt: at, finishedAt: at }
      ],
      forms: new Map([["a-1", "ORIGINAL"]])
    } as unknown as Parameters<typeof practiceAttemptsOf>[0];
    expect(practiceAttemptsOf(sink)).toEqual([
      expect.objectContaining({ callSiteKey: "STORY:STORYTELLER:1", parseStatus: "SCHEMA_FAILED", replyForm: "ORIGINAL", tokenCeiling: 128000,
        thinkingLevel: "medium" }),
      expect.objectContaining({ parseStatus: null, replyForm: null, tokenCeiling: null, thinkingLevel: null })
    ]);
  });
});

describe("measured cost is priced at each try's own tier, POST by POST (Task 6 review, Minor 1)", () => {
  const row = previewModelRow(DEEPSEEK)!;
  /** What the price list says for these tokens, with nothing clamped. */
  const listPrice = (input: number, output: number): string =>
    String(BigInt(input) * row.inputNanoUsdPerToken + BigInt(output) * row.outputNanoUsdPerToken);

  it("a try is a final writer only when the bound it asked for is above the row's standard bound", () => {
    expect(row.outputBound).toBe(32768);
    expect(practiceTryTier(row, 131072)).toBe("FINAL_WRITER");
    expect(practiceTryTier(row, 32768)).toBe("STANDARD");
    expect(practiceTryTier(row, null)).toBe("STANDARD");
    expect(practiceTryTier(row, "131072")).toBe("STANDARD");
  });

  it("the transcript prices a final-writer try's 100,000 output tokens at 100,000, not 32,768", () => {
    const at = new Date(0);
    const ref = Object.entries(PREVIEW_PROVIDER_REF_MODELS).find(([, model]) => model === DEEPSEEK)![0];
    const priced = (tokenCeiling: number) => buildTranscriptAttempts({
      entries: [{ sequence: "1", ledgerEntryId: "l-1", attemptId: "a-1", callSiteKey: "STORY:STORYTELLER:1", subjectItemId: "item",
        stance: "NEUTRAL", actorRef: ref, outcome: "OK", modelRole: null, thinkingLevel: "none", candidateId: null, startedAt: at,
        finishedAt: at, rawArtifactRef: "r-1" }],
      artifacts: new Map([["r-1", { rawArtifactId: "r-1", provider: "deepinfra", providerRef: ref, modelId: DEEPSEEK, maker: "deepseek",
        modelVersion: null, parseStatus: "PARSED", parseErrorCode: null, thinkingTokens: null, rawText: "{}", parseErrorDetail: null,
        metadata: { status: 200, usage: { prompt_tokens: 1000, completion_tokens: 100000 }, finish_reason: "stop", token_ceiling: tokenCeiling } }]]),
      prompts: new Map(), spend: new Map()
    })[0]!.cost.estimatedNanoUsd;
    expect(priced(131072)).toBe(listPrice(1000, 100000));
    // The same tokens on a standard try are clamped at the standard bound, as the gate holds them.
    expect(priced(32768)).toBe(listPrice(1000, 32768));
  });

  it("the formats log prices each POST on its own: a final writer's 100,000, and two standard POSTs never clamped together", () => {
    const event = (change: Partial<PracticeWireEvent>): PracticeWireEvent => ({ seq: 1, gate: "deepinfra", model: DEEPSEEK,
      startedAt: "2026-10-16T00:00:00.000Z", latencyMs: 1, outcome: "VENDOR_OK", vendorStatus: 200, refusalCode: null,
      concurrencyLimit: false, unbilledKind: null, inputTokens: 1000, outputTokens: 30000, reasoningTokens: null, ...change });
    expect(practiceWireUsage(DEEPSEEK, [event({ outputTokens: 100000, callTier: "FINAL_WRITER" })]).costNanoUsd)
      .toBe(listPrice(1000, 100000));
    expect(practiceWireUsage(DEEPSEEK, [event({}), event({ seq: 2 })]).costNanoUsd).toBe(listPrice(2000, 60000));
    expect(practiceWireUsage(DEEPSEEK, [event({ outputTokens: 100000 })]).costNanoUsd).toBe(listPrice(1000, 32768));
  });

  it("the gate watch keeps a final-writer request's tier on its event, and adds nothing to a standard one", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const port = observer.wrap("deepinfra", { execute: async () => ({ status: 200,
      body: JSON.stringify({ usage: { prompt_tokens: 1000, completion_tokens: 100000 } }) }) });
    const request = { operationId: "op", requestBody: JSON.stringify({ model: DEEPSEEK }), requestSha256: "sha", reservedUsd: "0.01" };
    await port.execute({ ...request, callTier: "FINAL_WRITER" });
    await port.execute(request);
    expect(observer.events.map((wire) => wire.callTier)).toEqual(["FINAL_WRITER", undefined]);
    expect(Object.keys(observer.events[1]!)).not.toContain("callTier");
    expect(practiceWireUsage(DEEPSEEK, observer.events).costNanoUsd).toBe(
      String(BigInt(listPrice(1000, 100000)) + BigInt(listPrice(1000, 32768))));
  });
});
