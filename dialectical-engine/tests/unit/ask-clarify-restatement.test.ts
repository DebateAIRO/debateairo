// tests/unit/ask-clarify-restatement.test.ts
// Design Document v2 (16b), "How we read your question": the clarifying reply may carry `restatement`, the question said back in
// one sentence. Its parts are plain words (kept as sent, spaces included) or the words that stand for one question's answer: which
// question, one phrase per answer of that question, and the answer the AI assumed. The reply refuses a part that names no question
// of its own, a phrase count that is not the question's answer count, an assumed answer that is not among them, and two parts for
// one question. A reply without it is whole, and a saved question keeps the reply with it. Every text is made up.
import { describe, expect, it } from "vitest";
import {
  AskClarifyResponseSchema, ClarifyRestatementPartSchema, ClarifyRestatementSchema, SavedQuestionReadingSchema, WEB_CONTRACT_LIMITS,
  type AskClarifyResponse, type ClarifyRestatement, type ClarifyRestatementPart, type ClarifyRestatementSlot
} from "@debateai/contract";
import { NUCLEAR_MENU, START_FIXTURE_QUESTION, signedList, signedMenu } from "../support/v4-start-menu.js";

const WHERE = { text: "Which country?", answers: ["Romania", "The EU as a whole", "Any country"], about_place: true as const };
const WHEN = { text: "Over what time?", answers: ["To 2035", "To 2050"] };
const PURPOSE = { text: "What do you want the answer for?", answers: ["To vote", "To teach"] };
const CARES = { text: "What do you care about most?", answers: ["Lower bills", "No blackouts"] };

const WHERE_SLOT = { about: 0, phrases: ["Romania", "the European Union as a whole", "any country, in general"], assumed: 2 };
const WHEN_SLOT = { about: 1, phrases: ["over the next 10 years", "over the next 25 years"], assumed: 1 };
const PURPOSE_SLOT = { about: "purpose", phrases: ["so that you can vote", "so that you can teach it"], assumed: 0 };
const CARES_SLOT = { about: "cares", phrases: ["bills stay low", "the lights never go out"], assumed: 0 };
const PARTS = [{ text: "You want to know where money for energy does the most good, for " }, WHERE_SLOT, { text: ", " }, WHEN_SLOT,
  { text: ", " }, PURPOSE_SLOT, { text: ", and what matters is that " }, CARES_SLOT, { text: "." }];

const replyOf = (parts: readonly unknown[], over: object = {}) =>
  ({ source: "AI", questions: [WHERE, WHEN], purpose: PURPOSE, cares: CARES, restatement: { parts }, ...over });
const refused = (reply: unknown): readonly string[] => {
  const result = AskClarifyResponseSchema.safeParse(reply);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
};

describe("a clarifying reply's restatement (Design Document v2, 16b)", () => {
  it("a reply with a restatement parses and comes back whole: the plain words exactly as sent, each answer part as written", () => {
    const parsed: AskClarifyResponse = AskClarifyResponseSchema.parse(replyOf(PARTS));
    if (parsed.source !== "AI") throw new Error("an AI reply");
    const restatement: ClarifyRestatement | undefined = parsed.restatement;
    expect(restatement).toEqual({ parts: PARTS });
    // Plain words keep their spaces: they join the parts of the sentence.
    expect(restatement!.parts[2]).toEqual({ text: ", " });
    const slots = restatement!.parts.filter((part: ClarifyRestatementPart): part is ClarifyRestatementSlot => "about" in part);
    expect(slots.map((slot) => slot.about)).toEqual([0, 1, "purpose", "cares"]);
  });

  it("a reply without a restatement is whole, as before; no AI, no restatement", () => {
    const plain = { source: "AI", questions: [WHERE, WHEN], purpose: PURPOSE, cares: CARES };
    expect(AskClarifyResponseSchema.parse(plain)).toEqual(plain);
    expect("restatement" in AskClarifyResponseSchema.parse(plain)).toBe(false);
    expect(AskClarifyResponseSchema.safeParse({ source: "NONE", restatement: { parts: PARTS } }).success).toBe(false);
  });

  it("a restatement of plain words alone parses (no part is required to stand for an answer)", () => {
    expect(refused(replyOf([{ text: "You want to know where new plants pay off." }]))).toEqual([]);
  });

  it("refuses a part that names a question the reply does not have", () => {
    expect(refused(replyOf([{ ...WHEN_SLOT, about: 2 }]))).toEqual(["restatement.parts.0.about: a part names a question of this reply"]);
    const noPurpose = { source: "AI", questions: [WHERE, WHEN], cares: CARES, restatement: { parts: [PURPOSE_SLOT] } };
    expect(refused(noPurpose)).toEqual(["restatement.parts.0.about: a part names a question of this reply"]);
    const noCares = { source: "AI", questions: [WHERE, WHEN], purpose: PURPOSE, restatement: { parts: [CARES_SLOT] } };
    expect(refused(noCares)).toEqual(["restatement.parts.0.about: a part names a question of this reply"]);
    // A place past the most questions a reply holds, a negative place, a fraction, another word: no question at all.
    for (const about of [WEB_CONTRACT_LIMITS.clarifyQuestionsMax, -1, 0.5, "matters"]) {
      expect(AskClarifyResponseSchema.safeParse(replyOf([{ ...WHERE_SLOT, about }])).success, String(about)).toBe(false);
    }
  });

  it("refuses a part whose phrases are not one per answer of its question", () => {
    expect(refused(replyOf([{ ...WHERE_SLOT, phrases: ["Romania", "the European Union"], assumed: 0 }])))
      .toEqual(["restatement.parts.0.phrases: one phrase per answer"]);
    expect(refused(replyOf([{ ...WHEN_SLOT, phrases: ["soon", "later", "much later"] }])))
      .toEqual(["restatement.parts.0.phrases: one phrase per answer"]);
  });

  it("refuses an assumed answer that is not one of the question's answers", () => {
    expect(refused(replyOf([{ ...WHEN_SLOT, assumed: 2 }]))).toEqual(["restatement.parts.0.assumed: the assumed answer is one of the answers"]);
    for (const assumed of [-1, 1.5, WEB_CONTRACT_LIMITS.clarifyAnswersMax, "1", null]) {
      expect(AskClarifyResponseSchema.safeParse(replyOf([{ ...WHEN_SLOT, assumed }])).success, String(assumed)).toBe(false);
    }
    expect(AskClarifyResponseSchema.safeParse(replyOf([{ about: 1, phrases: WHEN_SLOT.phrases }])).success).toBe(false);
  });

  it("refuses two parts for one question", () => {
    expect(refused(replyOf([WHEN_SLOT, { text: " and " }, WHEN_SLOT]))).toEqual(["restatement.parts.2.about: one part per question"]);
    expect(refused(replyOf([CARES_SLOT, { text: " and " }, CARES_SLOT]))).toEqual(["restatement.parts.2.about: one part per question"]);
  });

  it("holds 1 to 24 parts, each a strict object: plain words of at least one character, never trimmed, or an answer part", () => {
    const most = WEB_CONTRACT_LIMITS.clarifyRestatementPartsMax;
    expect(most).toBe(24);
    expect(ClarifyRestatementSchema.safeParse({ parts: [] }).success).toBe(false);
    expect(ClarifyRestatementSchema.safeParse({ parts: Array.from({ length: most }, () => ({ text: "word " })) }).success).toBe(true);
    expect(ClarifyRestatementSchema.safeParse({ parts: Array.from({ length: most + 1 }, () => ({ text: "word " })) }).success).toBe(false);
    expect(ClarifyRestatementSchema.safeParse({ parts: [{ text: "a" }], more: true }).success).toBe(false);
    expect(ClarifyRestatementPartSchema.parse({ text: " " })).toEqual({ text: " " });
    expect(ClarifyRestatementPartSchema.parse({ text: "  for  " })).toEqual({ text: "  for  " });
    expect(ClarifyRestatementPartSchema.safeParse({ text: "" }).success).toBe(false);
    expect(ClarifyRestatementPartSchema.safeParse({ text: "x".repeat(WEB_CONTRACT_LIMITS.clarifyRestatementTextMaxChars + 1) }).success).toBe(false);
    expect(ClarifyRestatementPartSchema.safeParse({ text: "for", about: 0 }).success).toBe(false);
    expect(ClarifyRestatementPartSchema.safeParse({ ...WHEN_SLOT, text: "for" }).success).toBe(false);
    expect(ClarifyRestatementPartSchema.safeParse({ ...WHEN_SLOT, chosen: 0 }).success).toBe(false);
    expect(ClarifyRestatementPartSchema.safeParse({ ...WHEN_SLOT, phrases: ["soon", " "] }).success).toBe(false);
    expect(ClarifyRestatementPartSchema.safeParse({ ...WHEN_SLOT, phrases: ["soon"] }).success).toBe(false);
  });

  it("a saved question keeps the reply with its restatement, and gives it back as it was", () => {
    const reading = {
      read_line: START_FIXTURE_QUESTION, reading_level: "plain", check: { ref: "chk.sig" }, language: { code: "en", name: "English" },
      seats: 4, clarify: replyOf(PARTS), menu: signedMenu(NUCLEAR_MENU), late_lists: [signedList(3)], end: "READY"
    };
    const parsed = SavedQuestionReadingSchema.parse(reading);
    expect(parsed.clarify).toEqual(replyOf(PARTS));
    // The same rules hold in a saved reading: a part for a question the reply does not have is refused there too.
    expect(SavedQuestionReadingSchema.safeParse({ ...reading, clarify: replyOf([{ ...WHEN_SLOT, about: 2 }]) }).success).toBe(false);
  });
});
