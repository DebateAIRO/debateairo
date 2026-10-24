import { describe, expect, it } from "vitest";

const expectedCall = "0123456789abcdef0123456789abcdef";
const otherCall = "fedcba9876543210fedcba9876543210";
const answer = (call: string, label: unknown) => JSON.stringify({ call, label });
const verdictModule = () => import("../../apps/api/src/question-check/verdict.js");

describe("S04 question-check answer", () => {
  // Property: a single valid label attached to this call is accepted.
  it("takes one object with this call's value and one label", async () => {
    const { parseQuestionCheckAnswer } = await verdictModule();
    expect(parseQuestionCheckAnswer(answer(expectedCall, "ORDINARY"), expectedCall))
      .toEqual({ ok: true, label: "ORDINARY" });
  });

  // Property: one whole JSON fence changes presentation only, not the verdict.
  it("accepts one ```json fence around the object", async () => {
    const { parseQuestionCheckAnswer } = await verdictModule();
    const fenced = `\`\`\`json\n${answer(expectedCall, "OWN_CRISIS")}\n\`\`\``;
    expect(parseQuestionCheckAnswer(fenced, expectedCall)).toEqual({ ok: true, label: "OWN_CRISIS" });
  });

  // Property: malformed or replayed model output cannot become a label.
  it.each([
    ["not JSON", "not JSON", "QUESTION_CHECK_ANSWER_NOT_JSON"],
    ["array", `[${answer(expectedCall, "ORDINARY")}]`, "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["no call", JSON.stringify({ label: "ORDINARY" }), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["another call", answer(otherCall, "ORDINARY"), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["uppercase call", answer(expectedCall.toUpperCase(), "ORDINARY"), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["unknown label", answer(expectedCall, "VIOLENCE"), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["array label", answer(expectedCall, ["HATE_SPEECH"]), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["extra reason", JSON.stringify({ call: expectedCall, label: "ORDINARY", reason: "safe" }), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["repeated label", `{"call":"${expectedCall}","label":"ORDINARY","label":"HATE_SPEECH"}`, "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["fence followed by text", `\`\`\`json\n${answer(expectedCall, "ORDINARY")}\n\`\`\` trailing`, "QUESTION_CHECK_ANSWER_NOT_JSON"]
  ] as const)("refuses %s", async (_case, text, code) => {
    const { parseQuestionCheckAnswer } = await verdictModule();
    expect(parseQuestionCheckAnswer(text, expectedCall)).toEqual({ ok: false, code });
    if (_case === "repeated label") {
      const repeatedCall = `{"call":"${expectedCall}","call":"${expectedCall}","label":"ORDINARY"}`;
      expect(parseQuestionCheckAnswer(repeatedCall, expectedCall)).toEqual({
        ok: false, code: "QUESTION_CHECK_ANSWER_SCHEMA"
      });
    }
  });
});
