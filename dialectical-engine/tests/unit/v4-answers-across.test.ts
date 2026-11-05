import type { ClarifyQuestion } from "@debateai/contract";
import { describe, expect, it } from "vitest";

import { answersAcrossReadings, sameAnswerWords } from "../../apps/ui/lib/v4/askText.js";
import type { V4GoalAnswer } from "../../apps/ui/lib/v4/types.js";

/*
 * V4 start step, Task 76g (read-f1, owner "All in this build", 4 Nov night; read-d3): after Back, new words and Next, the new
 * reading keeps the person's answers where it can. An offered answer goes under the first new question (in shown order, not
 * already taken) that offers the same words; one no new question offers is set aside at its old place. A typed answer
 * ("Other…") is always kept, under its own question's words; a reading that brought nothing back keeps everything as it was.
 * Every text is made up.
 */

const OVER: ClarifyQuestion = { text: "Over what time?", answers: ["To 2035", "To 2050"] };
const TO_2035: V4GoalAnswer = { question: OVER.text, answer: "To 2035", other: false };
const BEFORE = [{ given: TO_2035, question: OVER }] as const;

describe("answersAcrossReadings", () => {
  it("an offered answer the new reading offers again is kept under the new question", () => {
    const across = answersAcrossReadings(BEFORE, [{ text: "By when?", answers: ["To 2035", "To 2040"] }], "en");
    expect(across.kept).toEqual([{ given: TO_2035, to: "By when?" }]);
    expect(across.setAside).toEqual([]);
  });

  it("an offered answer no new question offers is set aside, at its place in the earlier list", () => {
    const across = answersAcrossReadings(BEFORE, [{ text: "By when?", answers: ["To 2050", "To 2060"] }], "en");
    expect(across.kept).toEqual([]);
    expect(across.setAside).toEqual([{ given: TO_2035, question: OVER, at: 0 }]);
  });

  it("a typed answer is always kept, under its own question's words", () => {
    const typed: V4GoalAnswer = { question: OVER.text, answer: "2040", other: true };
    const across = answersAcrossReadings([{ given: typed, question: OVER }], [{ text: "Which region?", answers: ["The north", "The south"] }], "en");
    expect(across.kept).toEqual([{ given: typed, to: "Over what time?" }]);
    expect(across.setAside).toEqual([]);
  });

  it("a reading that brought nothing back keeps every answer as it was", () => {
    const typed: V4GoalAnswer = { question: "What do you want it for?", answer: "My own reason", other: true };
    const before = [...BEFORE, { given: typed, question: { text: typed.question, answers: ["To vote", "To teach"] } }];
    const across = answersAcrossReadings(before, null, "en");
    expect(across.kept).toEqual([{ given: TO_2035, to: "Over what time?" }, { given: typed, to: "What do you want it for?" }]);
    expect(across.setAside).toEqual([]);
  });

  it("two new questions both offering Romania, two earlier answers Romania: the first new question takes the first, the second the second", () => {
    const where: V4GoalAnswer = { question: "Where?", answer: "Romania", other: false };
    const whose: V4GoalAnswer = { question: "Whose rules?", answer: "Romania", other: false };
    const before = [
      { given: where, question: { text: "Where?", answers: ["Romania", "The EU"] } },
      { given: whose, question: { text: "Whose rules?", answers: ["Romania", "Brussels"] } }
    ];
    const after: ClarifyQuestion[] = [{ text: "Which country?", answers: ["Romania", "Bulgaria"] }, { text: "Which law?", answers: ["EU law", "Romania"] }];
    const across = answersAcrossReadings(before, after, "en");
    expect(across.kept).toEqual([{ given: where, to: "Which country?" }, { given: whose, to: "Which law?" }]);
    expect(across.setAside).toEqual([]);
  });

  it("'România' against 'românia' with locale 'ro': the same words, so kept", () => {
    const given: V4GoalAnswer = { question: "Unde?", answer: "România", other: false };
    const across = answersAcrossReadings([{ given, question: { text: "Unde?", answers: ["România", "UE"] } }],
      [{ text: "În ce țară?", answers: ["românia", "Bulgaria"] }], "ro");
    expect(across.kept).toEqual([{ given, to: "În ce țară?" }]);
  });

  it("the same words are compared trimmed and in one Unicode form (NFC)", () => {
    expect(sameAnswerWords("  To 2035 ", "to 2035", "en")).toBe(true);
    // "é" written as e + a combining accent, and as one letter.
    expect(sameAnswerWords("Région", "Région", "en")).toBe(true);
    expect(sameAnswerWords("To 2035", "To 2050", "en")).toBe(false);
  });

  it("a typed answer keeps a new question asking its own words for itself, so an offered answer goes to another", () => {
    const typed: V4GoalAnswer = { question: "Which region?", answer: "Cluj", other: true };
    const offered: V4GoalAnswer = { question: "Where?", answer: "The north", other: false };
    const before = [
      { given: offered, question: { text: "Where?", answers: ["The north", "The south"] } },
      { given: typed, question: { text: "Which region?", answers: ["The north", "The south"] } }
    ];
    const across = answersAcrossReadings(before, [{ text: "Which region?", answers: ["The north", "The west"] }], "en");
    expect(across.kept).toEqual([{ given: typed, to: "Which region?" }]);
    expect(across.setAside).toEqual([{ given: offered, question: before[0]!.question, at: 0 }]);
  });
});
