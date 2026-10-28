import { describe, expect, it } from "vitest";

const expectedCall = "0123456789abcdef0123456789abcdef";
const otherCall = "fedcba9876543210fedcba9876543210";
const answer = (call: string, subject: unknown, healthy: unknown = true) => JSON.stringify({ call, subject, healthy });
const ids = ["OWN_CRISIS", "DRUGS", "CRIME"] as const;
const verdictModule = () => import("../../apps/api/src/question-check/verdict.js");

describe("S04 question-check answer: the subject and whether the question is healthy (V, 2026-10-28)", () => {
  // Property: a subject from the file, or NONE, with a boolean, attached to this call, is accepted.
  it.each([
    ["DRUGS", false], ["DRUGS", true], ["NONE", true], ["OWN_CRISIS", true]
  ] as const)("takes %s with healthy %s", async (subject, healthy) => {
    const { parseQuestionCheckAnswer } = await verdictModule();
    expect(parseQuestionCheckAnswer(answer(expectedCall, subject, healthy), expectedCall, ids))
      .toEqual({ ok: true, subject, healthy });
  });

  // Property: one whole JSON fence changes presentation only, not the verdict.
  it("accepts one ```json fence around the object", async () => {
    const { parseQuestionCheckAnswer } = await verdictModule();
    const fenced = `\`\`\`json\n${answer(expectedCall, "CRIME", false)}\n\`\`\``;
    expect(parseQuestionCheckAnswer(fenced, expectedCall, ids)).toEqual({ ok: true, subject: "CRIME", healthy: false });
  });

  // Property: malformed, replayed or near-miss model output never becomes a verdict; it is the unavailable screen.
  it.each([
    ["not JSON", "not JSON", "QUESTION_CHECK_ANSWER_NOT_JSON"],
    ["array", `[${answer(expectedCall, "NONE")}]`, "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["no call", JSON.stringify({ subject: "NONE", healthy: true }), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["another call", answer(otherCall, "NONE"), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["uppercase call", answer(expectedCall.toUpperCase(), "NONE"), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["unknown subject", answer(expectedCall, "GAMBLING", false), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["lowercase subject", answer(expectedCall, "drugs", false), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["padded subject", answer(expectedCall, " DRUGS", false), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["NONE not healthy", answer(expectedCall, "NONE", false), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["healthy as text", answer(expectedCall, "DRUGS", "false"), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["no healthy", JSON.stringify({ call: expectedCall, subject: "DRUGS" }), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["the old label form", JSON.stringify({ call: expectedCall, label: "ORDINARY" }), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["extra reason", JSON.stringify({ call: expectedCall, subject: "NONE", healthy: true, reason: "safe" }), "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["repeated subject", `{"call":"${expectedCall}","subject":"NONE","subject":"DRUGS","healthy":true}`, "QUESTION_CHECK_ANSWER_SCHEMA"],
    ["fence followed by text", `\`\`\`json\n${answer(expectedCall, "NONE")}\n\`\`\` trailing`, "QUESTION_CHECK_ANSWER_NOT_JSON"]
  ] as const)("refuses %s", async (_case, text, code) => {
    const { parseQuestionCheckAnswer } = await verdictModule();
    expect(parseQuestionCheckAnswer(text, expectedCall, ids)).toEqual({ ok: false, code });
  });
});
