import { describe, expect, it } from "vitest";
import {
  QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION, QUESTION_LANGUAGE_POLICY_ROW_KEY, parseQuestionLanguagePolicy,
  questionLanguagePolicyRow, questionLanguagePolicyStartValues, readQuestionLanguagePolicy
} from "@debateai/register";

const start = () => JSON.parse(JSON.stringify(questionLanguagePolicyStartValues())) as Record<string, any>;
const poolWith = (rows: unknown[]) => ({ query: async () => ({ rows }) }) as never;

describe("the optional row questionLanguagePolicy (question-language spec 2026-10-13)", () => {
  it("start values: Claude Haiku 5.5, effort low, five seconds, the default instruction", () => {
    expect(questionLanguagePolicyStartValues()).toEqual({
      kind: "QUESTION_LANGUAGE_POLICY", version: 1,
      fastCheck: { provider: "anthropic", model: "claude-haiku-5-5", effort: "low", timeoutMs: 5000, maxOutputTokens: 600,
        priceMicrosUsdPerMillionTokens: { input: 100000, output: 500000 } },
      instruction: QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION
    });
    expect(QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION).toMatch(/borrowed words/u);
    expect(QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION).not.toMatch(/score|threshold|eld|engine/iu);
  });

  it("an owner may switch the fast check off (null) and edit the text", () => {
    const value = { ...start(), fastCheck: null, instruction: "Name the question's language." };
    expect(parseQuestionLanguagePolicy(value)).toEqual(value);
  });

  it.each([
    ["an unknown provider (refused at boot until it is built)", (v: any) => { v.fastCheck.provider = "openai"; }, "$.fastCheck.provider"],
    ["a model id with spaces", (v: any) => { v.fastCheck.model = "claude haiku"; }, "$.fastCheck.model"],
    ["a time limit over 15 s", (v: any) => { v.fastCheck.timeoutMs = 15001; }, "$.fastCheck.timeoutMs"],
    ["an effort the gate does not know", (v: any) => { v.fastCheck.effort = "none"; }, "$.fastCheck.effort"],
    ["an empty instruction", (v: any) => { v.instruction = " "; }, "$.instruction"],
    ["an instruction over 4000 characters", (v: any) => { v.instruction = "a".repeat(4001); }, "$.instruction"],
    ["a control character in the instruction", (v: any) => { v.instruction = "Name it.\u0007"; }, "$.instruction"],
    ["an extra key", (v: any) => { v.extra = 1; }, "$"],
    ["another version", (v: any) => { v.version = 2; }, "$.version"]
  ])("refuses %s", (_name, edit, path) => {
    const value = start();
    edit(value);
    expect(() => parseQuestionLanguagePolicy(value)).toThrow(`QUESTION_LANGUAGE_POLICY_INVALID:${path}`);
  });

  it("keeps line breaks, refuses C1 controls, lone surrogates and prototype keys by name", () => {
    const lines = { ...start(), instruction: "Name the language.\nDo not answer the question." };
    expect(parseQuestionLanguagePolicy(lines)).toEqual(lines);
    expect(() => parseQuestionLanguagePolicy({ ...start(), instruction: "Name it.\u0085" })).toThrow("QUESTION_LANGUAGE_POLICY_INVALID:$.instruction");
    expect(() => parseQuestionLanguagePolicy({ ...start(), instruction: "Name it.\ud800" })).toThrow("QUESTION_LANGUAGE_POLICY_INVALID:$.instruction");
    const proto = JSON.parse(`{"kind":"QUESTION_LANGUAGE_POLICY","version":1,"fastCheck":{"__proto__":{}},"instruction":"x"}`);
    expect(() => parseQuestionLanguagePolicy(proto)).toThrow("QUESTION_LANGUAGE_POLICY_INVALID:$.fastCheck.__proto__");
    expect(() => parseQuestionLanguagePolicy({ ...start(), constructor: 1 })).toThrow("QUESTION_LANGUAGE_POLICY_INVALID:$.constructor");
    expect(Object.isFrozen(questionLanguagePolicyStartValues().fastCheck)).toBe(true);
  });

  it("reads absent as null, and a sealed row strictly", async () => {
    expect(await readQuestionLanguagePolicy(poolWith([]), 7)).toBeNull();
    expect(await readQuestionLanguagePolicy(poolWith([{ value_json: start() }]), 7)).toEqual(questionLanguagePolicyStartValues());
    await expect(readQuestionLanguagePolicy(poolWith([{ value_json: { kind: "X" } }]), 7)).rejects.toThrow(/QUESTION_LANGUAGE_POLICY_INVALID/u);
  });

  it("the row builder re-parses and needs a source ref", () => {
    const row = questionLanguagePolicyRow(questionLanguagePolicyStartValues(), "owner:2026-10-13");
    expect(row.rowKey).toBe(QUESTION_LANGUAGE_POLICY_ROW_KEY);
    expect(parseQuestionLanguagePolicy(JSON.parse(row.valueJsonText))).toEqual(questionLanguagePolicyStartValues());
    expect(() => questionLanguagePolicyRow(questionLanguagePolicyStartValues(), " ")).toThrow("QUESTION_LANGUAGE_POLICY_INVALID:sourceRef");
  });
});
