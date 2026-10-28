import { describe, expect, it } from "vitest";
import { z } from "zod";
import { assertFramedPrompt, readPromptFrame } from "@debateai/providers";
import {
  parseSupportDraftV3, parseSupportNoSourceJudgement, supportDraftJsonShape,
  supportDraftRoute
} from "../../apps/api/src/support/response-policy.js";
import {
  buildSupportNoSourceJudgementPrompt, SUPPORT_NO_SOURCE_JUDGEMENT_INSTRUCTION,
  supportNoSourceJudgementPromptContract
} from "../../apps/api/src/support/prompt.js";
import { structuredInstruction } from "../../apps/api/src/support/answer.js";

const answer = { kind: "answer", text: "Reviewed guidance.", sourceIds: ["source-one"], actionIds: [], offTopic: "none", crisis: false, threat: false } as const;

describe("S05 answer contracts", () => {
  // Property: the shipped v3 form is the strict seven-key parser form.
  it("A2 renders the v3 shape from the parser schema", () => {
    const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    const { $schema: _dialect, ...expected } = z.toJSONSchema(z.object({
      kind: z.literal("answer"), text: z.string(),
      sourceIds: z.array(identifier).max(3), actionIds: z.array(identifier).max(3),
      offTopic: z.enum(["none", "part", "all"]), crisis: z.boolean(), threat: z.boolean()
    }).strict()) as Record<string, unknown>;
    expect(JSON.parse(supportDraftJsonShape("answer_v3"))).toEqual(expected);
    expect(expected.required).toEqual(["kind", "text", "sourceIds", "actionIds", "offTopic", "crisis", "threat"]);
    expect(expected.additionalProperties).toBe(false);
  });

  it("A5 instructs the no-source judge on all four outcomes and crisis precedence", () => {
    for (const value of ["app_related", "off_topic", "crisis", "threat"]) {
      expect(SUPPORT_NO_SOURCE_JUDGEMENT_INSTRUCTION).toContain(value);
    }
    expect(SUPPORT_NO_SOURCE_JUDGEMENT_INSTRUCTION).toContain("A message that reads as a crisis is judged a crisis whatever else it also reads as, a threat included.");
    expect(SUPPORT_NO_SOURCE_JUDGEMENT_INSTRUCTION).toContain("or asks for a way, a dose or a means of ending their life or harming themselves, however it is framed");
  });

  it("A7 keeps the other-locale seven keys and literals in English", () => {
    const value = structuredInstruction("ja");
    expect(value).toContain("kind, text, sourceIds, actionIds, offTopic, crisis, threat");
    expect(value).toContain('"none", "part" and "all"');
  });

  it.each(["en", "ro", "ja"] as const)("A8 %s states the app-only rule", (language) => {
    const value = structuredInstruction(language);
    expect(value).toContain(language === "ro" ? "Răspunde numai la întrebări despre folosirea Dialectical Engine" : "Answer only questions about using Dialectical Engine");
  });

  it("A9 accepts a safe answer and returns only the v2 draft fields", () => {
    expect(parseSupportDraftV3(JSON.stringify(answer))).toEqual({
      marks: { offTopic: "none", crisis: false, threat: false },
      draft: { kind: "answer", text: "Reviewed guidance.", sourceIds: ["source-one"], actionIds: [] }
    });
  });

  it.each([
    ["v2 four-key draft", { kind: "answer", text: "Reviewed guidance.", sourceIds: ["source-one"], actionIds: [] }],
    ["extra key on answer", { ...answer, extra: true }],
    ["offTopic some", { ...answer, offTopic: "some" }]
  ])("A10 refuses %s", (_name, value) => {
    expect(parseSupportDraftV3(JSON.stringify(value))).toBeNull();
  });

  it.each([
    ["empty crisis", { ...answer, text: "", sourceIds: [], crisis: true }, "CRISIS"],
    ["poem crisis", { ...answer, text: "A poem about autumn", crisis: true }, "CRISIS"],
    ["non-identifier crisis source", { ...answer, text: "", sourceIds: ["Talk To A Human"], crisis: true }, "CRISIS"],
    ["four-source threat", { ...answer, sourceIds: ["one", "two", "three", "four"], threat: true }, "THREAT"]
  ] as const)("A11 preserves %s marks while discarding draft", (_name, value, route) => {
    const parsed = parseSupportDraftV3(JSON.stringify(value));
    expect(parsed?.draft).toBeNull();
    expect(parsed && supportDraftRoute(parsed.marks)).toBe(route);
  });

  it.each([
    [true, true, "all", "CRISIS"], [true, false, "none", "CRISIS"],
    [true, false, "part", "CRISIS"], [false, true, "all", "THREAT"],
    [false, true, "part", "THREAT"], [false, false, "all", "OFF_TOPIC"],
    [false, false, "part", "ANSWER"], [false, false, "none", "ANSWER"]
  ] as const)("A12 routes crisis=%s threat=%s offTopic=%s", (crisis, threat, offTopic, route) => {
    expect(supportDraftRoute({ crisis, threat, offTopic })).toBe(route);
  });

  it.each(["app_related", "off_topic", "crisis", "threat"] as const)("A13 parses %s judgement", (value) => {
    expect(parseSupportNoSourceJudgement(JSON.stringify({ judgement: value }))).toBe(value);
  });

  it.each([
    '{"judgement":"other"}', '{"judgement":"crisis","x":1}',
    'crisis', '```json\n{"judgement":"crisis"}\n```'
  ])("A14 refuses malformed judgement %s", (value) => {
    expect(parseSupportNoSourceJudgement(value)).toBeNull();
  });

  it("A15 frames only the visitor message as untrusted material", () => {
    const packet = buildSupportNoSourceJudgementPrompt({ visitorMessage: "visitor only marker" }).packet;
    expect(assertFramedPrompt(packet).contractId).toBe("support.no-source-judgement.v1");
    expect(readPromptFrame(packet).contractId).toBe(supportNoSourceJudgementPromptContract().contractId);
    expect(packet.messages[0]!.content).not.toContain("visitor only marker");
    expect(packet.messages[1]!.content).toContain("visitor_message");
    expect(packet.messages[1]!.content).toContain("visitor only marker");
  });
});
