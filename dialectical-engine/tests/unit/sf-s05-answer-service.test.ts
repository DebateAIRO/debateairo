import { describe, expect, it, vi } from "vitest";
import { createSupportAnswerService } from "../../apps/api/src/support/answer.js";
import { createSupportModelReferenceFactory } from "../../apps/api/src/support/model-references.js";
import { supportTemplate } from "../../apps/api/src/support/templates.js";
import type { SupportModelPort } from "../../apps/api/src/support/model.js";
import type { LoadedHelpCorpus } from "../../packages/support-kb/src/index.js";
import { readPromptFrame } from "@debateai/providers";

const ID = "10000000-0000-4000-8000-000000000001";
const SOURCE = "s-10000000000040008000000000000001-1";
const ENTRY = Object.freeze({
  id: "publish-a-debate", lang: "en" as const, title: "Publish a debate",
  status: "shipped" as const, sources: Object.freeze(["fixture"]),
  verifiedAgainst: "fixture", ratifiedBy: "V" as const, ratifiedOn: "2026-09-01",
  body: "Publish a debate from its page.", modelProjection: "Publish a debate from its page."
});
const SNAPSHOT = Object.freeze({ entries: Object.freeze([ENTRY]), kbVersion: "a".repeat(64) }) as unknown as LoadedHelpCorpus;
const USAGE = Object.freeze({ input_tokens: 3, output_tokens: 4, cost_usd: 0.001 });
const noSourceText = "write me a poem";
const modelText = "how do I publish a debate?";

function harness(opts: Readonly<{
  output?: string; complete?: SupportModelPort["complete"]; noSourceCheck?: Readonly<{ timeoutMs: number }>;
  degraded?: { isDegraded: () => { degraded: boolean } };
}> = {}) {
  const packets: Array<Parameters<SupportModelPort["complete"]>[0]["packet"]> = [];
  const complete = vi.fn<SupportModelPort["complete"]>(async (input) => {
    packets.push(input.packet);
    return opts.complete ? opts.complete(input) : Object.freeze({ text: opts.output ?? '{"judgement":"off_topic"}', usage: USAGE });
  });
  const service = createSupportAnswerService({
    entries: SNAPSHOT.entries, requireStructuredDraft: true,
    noSourceCheck: opts.noSourceCheck ?? { timeoutMs: 15_000 },
    modelReferenceFactory: () => createSupportModelReferenceFactory(ID),
    modelFor: () => Object.freeze({ complete }) as SupportModelPort,
    ...(opts.degraded === undefined ? {} : { degraded: opts.degraded as never }),
    clock: (() => { let at = Date.parse("2026-10-20T10:00:00.000Z"); return () => new Date(++at); })()
  });
  const respond = (text: string) => service.respond({
    text, language: "en", detectedLanguage: "en", overrideLanguage: null,
    modelRef: "fixture", snapshot: SNAPSHOT, receivedAt: new Date("2026-10-20T10:00:00.000Z")
  });
  return { packets, complete, respond };
}

function draft(marks: Readonly<{ offTopic?: "none" | "part" | "all"; crisis?: boolean; threat?: boolean }> = {}, text = "ANSWER-TEXT") {
  return JSON.stringify({ kind: "answer", text, sourceIds: [SOURCE], actionIds: [],
    offTopic: marks.offTopic ?? "none", crisis: marks.crisis ?? false, threat: marks.threat ?? false });
}

describe("S05 answer service", () => {
  it.each([
    ["app_related", "NO_SOURCE", "NO_SOURCE"], ["off_topic", "OFF_TOPIC", "OFF_TOPIC"],
    ["crisis", "CRISIS", "CRISIS_SUPPORT"], ["threat", "THREAT", "THREAT_LINE"]
  ] as const)("B1 maps %s no-source judgement to %s", async (judgement, outcome, template) => {
    const h = harness({ output: JSON.stringify({ judgement }) });
    const result = await h.respond(noSourceText);
    expect(result).toMatchObject({ outcome, text: supportTemplate(template, "en") });
  });

  it("B2 falls back to NO_SOURCE when judgement throws", async () => {
    const h = harness({ complete: async () => { throw new Error("relay failed"); } });
    expect(await h.respond(noSourceText)).toMatchObject({ outcome: "NO_SOURCE" });
  });

  it("B3 times out an unsettled judgement within one second", async () => {
    const h = harness({ noSourceCheck: { timeoutMs: 20 }, complete: async () => new Promise(() => {}) });
    const start = Date.now();
    expect(await h.respond(noSourceText)).toMatchObject({ outcome: "NO_SOURCE" });
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("B4 rejects non-JSON judgement text", async () => {
    expect(await harness({ output: "crisis" }).respond(noSourceText)).toMatchObject({ outcome: "NO_SOURCE" });
  });

  it("B5 skips a judgement call while degraded", async () => {
    const h = harness({ degraded: { isDegraded: () => ({ degraded: true }) } });
    expect(await h.respond(noSourceText)).toMatchObject({ outcome: "NO_SOURCE" });
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("B6 frames the masked text, never the raw key", async () => {
    const h = harness();
    await h.respond("write me a poem with my key sk-test1234567890");
    expect(readPromptFrame(h.packets[0]!).contractId).toBe("support.no-source-judgement.v1");
    const packet = JSON.stringify(h.packets[0]);
    expect(packet).toContain("[REDACTED_SECRET_LIKE]");
    expect(packet).not.toContain("sk-test1234567890");
  });

  it("B7 keeps no message identifier or model usage in its result", async () => {
    const h = harness();
    const result = await h.respond(noSourceText);
    expect("messageId" in result).toBe(false);
    expect(["usage", "inputTokens", "outputTokens", "costUsd"].filter((key) => key in result)).toEqual([]);
  });

  it("B8 retains no-call NO_SOURCE without noSourceCheck", async () => {
    const h = harness();
    const service = createSupportAnswerService({
      entries: SNAPSHOT.entries, requireStructuredDraft: true,
      modelFor: () => Object.freeze({ complete: h.complete }) as SupportModelPort
    });
    const result = await service.respond({ text: noSourceText,
      language: "en", detectedLanguage: "en", overrideLanguage: null, modelRef: "fixture",
      snapshot: SNAPSHOT, receivedAt: new Date("2026-10-20T10:00:00.000Z") });
    expect(result.outcome).toBe("NO_SOURCE");
    expect(h.complete).not.toHaveBeenCalled();
  });

  it.each([
    [{ crisis: true }, "CRISIS", "CRISIS_SUPPORT"],
    [{ threat: true }, "THREAT", "THREAT_LINE"],
    [{ offTopic: "all" as const }, "OFF_TOPIC", "OFF_TOPIC"]
  ] as const)("B9-B11 routes marked model draft %j", async (marks, outcome, template) => {
    const h = harness({ output: draft(marks) });
    expect(await h.respond(modelText)).toMatchObject({ outcome, text: supportTemplate(template, "en"), sources: [], actions: [] });
  });

  it("B12 appends the fixed off-topic-part sentence to an accepted answer", async () => {
    const h = harness({ output: draft({ offTopic: "part" }) });
    expect(await h.respond(modelText)).toMatchObject({
      outcome: "ANSWER_GROUNDED", text: `ANSWER-TEXT\n\n${supportTemplate("OFF_TOPIC_PART", "en")}`,
      sources: [{ id: "publish-a-debate" }]
    });
  });

  it("B13 routes crisis ahead of threat and off-topic", async () => {
    const h = harness({ output: draft({ crisis: true, threat: true, offTopic: "all" }) });
    expect(await h.respond(modelText)).toMatchObject({ outcome: "CRISIS" });
  });

  it("B14 a marked model reply carries the reply kind and no usage", async () => {
    const h = harness({ output: draft({ threat: true }) });
    const result = await h.respond(modelText);
    expect(result).toMatchObject({ outcome: "THREAT" });
    expect(["usage", "inputTokens", "outputTokens", "costUsd"].filter((key) => key in result)).toEqual([]);
  });

  it("B15 does not append the part sentence to rejected draft text", async () => {
    const h = harness({ output: draft({ offTopic: "part" }, "https://unsafe.example") });
    const result = await h.respond(modelText);
    expect(result.outcome).toBe("REFUSE_SAFETY");
    expect(result.text).not.toContain(supportTemplate("OFF_TOPIC_PART", "en"));
  });

  it.each([
    [{ crisis: true }, "CRISIS"], [{ threat: true }, "THREAT"],
    [{ offTopic: "all" as const }, "OFF_TOPIC"]
  ] as const)("B17 never leaks model text on %j route", async (marks, outcome) => {
    const h = harness({ output: draft(marks, "POEM-MARKER autumn verse") });
    const result = await h.respond(modelText);
    expect(result.outcome).toBe(outcome);
    expect(result.text).not.toContain("POEM-MARKER");
  });
});
