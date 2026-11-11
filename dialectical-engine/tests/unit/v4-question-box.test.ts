import { purposeAnswerSentence } from "@debateai/contract";
import { describe, expect, it } from "vitest";

import { composeQuestion } from "../../apps/ui/lib/v4/askText.js";
import {
  boxChanged,
  boxDropped,
  boxLine,
  boxOf,
  boxOwnWords,
  boxPlace,
  boxRekey,
  boxRemove,
  boxTyped,
  type BoxSentence,
  type QuestionBox
} from "../../apps/ui/lib/v4/questionBox.js";
import { EMPTY_GOAL, type V4Goal, type V4GoalAnswer } from "../../apps/ui/lib/v4/types.js";

/*
 * V4 start step (Task 70c, read-d3, read-d2): step 2's question box. It starts as the line read at Next; each tapped answer puts its sentence
 * under the person's words, unticking takes it out, and the person may type anywhere. Untouched, the box reads exactly as R22's
 * composeQuestion, so the server's bytes do not change when nobody types.
 */

const CATALOG: Record<string, string> = Object.freeze({
  "newDebate.askText.matters": "If the answers pull in different directions, what matters most to me: {matters}",
  "newDebate.askText.angles": "Please also look at: {list}."
});

const Q = "Should the town build a second pier?";
/** Card cd1's question (the merge's "ask it this way"), made up as every figure here is. */
const CD1_QUESTION = "Would one bigger ferry serve the town better than a second pier?";

const REGION: V4GoalAnswer = { question: "Which region?", answer: "The north.", other: false };
const WHEN: V4GoalAnswer = { question: "By when?", answer: "By 2030", other: false };
/** Owner answer Q4: the care question is one more clarifying question, its key its text; no separate box. */
const CARE: V4GoalAnswer = { question: "What do you care about most?", answer: "Keeping bills low", other: false };
/** The order the questions are shown in. */
const SHOWN: readonly string[] = [REGION.question, WHEN.question, CARE.question];

function sentenceOf(answer: V4GoalAnswer): BoxSentence {
  return { key: answer.question, text: purposeAnswerSentence({ question: answer.question, answer: answer.answer }) };
}

function goalOf(...answers: V4GoalAnswer[]): V4Goal {
  return { ...EMPTY_GOAL, answers };
}

function tap(box: QuestionBox, ...answers: V4GoalAnswer[]): QuestionBox {
  return answers.reduce((held, answer) => boxPlace(held, sentenceOf(answer), SHOWN), box);
}

const S1 = sentenceOf(REGION).text;
const S2 = sentenceOf(WHEN).text;
const S3 = sentenceOf(CARE).text;

describe("boxOf and boxLine", () => {
  it("an untouched box reads as R22's question", () => {
    expect(boxLine(boxOf(Q))).toBe(Q);
    expect(boxLine(boxOf(Q))).toBe(composeQuestion(Q, EMPTY_GOAL, CATALOG));
    expect(boxOf(Q).placed).toEqual([]);
    const read = composeQuestion("  Should the town build a second pier?\n\n  The ferry is full every summer.  ", EMPTY_GOAL, CATALOG);
    expect(boxLine(boxOf(read))).toBe(read);
  });
});

describe("boxPlace", () => {
  it("puts the first sentence after one blank line under the words, as composeQuestion does", () => {
    const line = boxLine(boxPlace(boxOf(Q), { key: "Which region?", text: "Which region? The north." }, ["Which region?"]));
    expect(line).toBe(`${Q}\n\nWhich region? The north.`);
    expect(line).toBe(composeQuestion(Q, goalOf(REGION), CATALOG));
  });

  it("reads three answers tapped 3, 1, 2 in the shown order 1, 2, 3", () => {
    const box = tap(boxOf(Q), CARE, REGION, WHEN);
    expect(boxLine(box)).toBe(`${Q}\n\n${S1}\n${S2}\n${S3}`);
    expect(boxLine(box)).toBe(composeQuestion(Q, goalOf(REGION, WHEN, CARE), CATALOG));
    expect(box.placed.map((sentence) => sentence.key)).toEqual(SHOWN);
  });

  it("replaces a key's sentence where it is still written when it is placed again", () => {
    const box = boxPlace(tap(boxOf(Q), REGION, WHEN), { key: REGION.question, text: "Which region? The south." }, SHOWN);
    expect(boxLine(box)).toBe(`${Q}\n\nWhich region? The south.\n${S2}`);
    expect(box.placed).toEqual([{ key: REGION.question, text: "Which region? The south." }, { key: WHEN.question, text: S2 }]);
  });

  it("puts the first sentence in the shown order under the words, above a line the person typed there", () => {
    const typed = boxTyped(boxOf(Q), `${Q}\n\nAlso the cost to households.`);
    expect(boxLine(boxPlace(typed, sentenceOf(REGION), SHOWN))).toBe(`${Q}\n\n${S1}\nAlso the cost to households.`);
  });

  it("puts a sentence whose question is not in the shown order at the end", () => {
    const box = boxPlace(tap(boxOf(Q), REGION), { key: "Who pays?", text: "Who pays? The town." }, SHOWN);
    expect(boxLine(box)).toBe(`${Q}\n\n${S1}\nWho pays? The town.`);
  });

  it("writes a sentence on one line, and a blank one (an Other with nothing typed) says nothing", () => {
    const box = boxPlace(boxOf(Q), { key: "Which region?", text: "  Which region?\n The   north. " }, SHOWN);
    expect(boxLine(box)).toBe(`${Q}\n\nWhich region? The north.`);
    const blank = boxPlace(box, { key: "Which region?", text: " \n " }, SHOWN);
    expect(boxLine(blank)).toBe(Q);
    expect(blank.placed).toEqual([]);
  });

  it("never changes the box it is given", () => {
    const box = boxOf(Q);
    boxPlace(box, sentenceOf(REGION), SHOWN);
    expect(box).toEqual({ text: Q, placed: [] });
  });
});

describe("boxRemove", () => {
  it("unticking 2 leaves lines 1 and 3; unticking all gives back exactly the question", () => {
    const box = tap(boxOf(Q), CARE, REGION, WHEN);
    const without2 = boxRemove(box, WHEN.question);
    expect(boxLine(without2)).toBe(`${Q}\n\n${S1}\n${S3}`);
    expect(boxLine(without2)).toBe(composeQuestion(Q, goalOf(REGION, CARE), CATALOG));
    const none = boxRemove(boxRemove(without2, REGION.question), CARE.question);
    expect(none.text).toBe(Q);
    expect(boxLine(none)).toBe(Q);
    expect(none.placed).toEqual([]);
  });

  it("keeps a line typed after the sentences through a place and a remove", () => {
    const placed = tap(boxOf(Q), REGION, CARE);
    const typed = boxTyped(placed, `${placed.text}\nAlso the cost to households.`);
    const more = boxPlace(typed, sentenceOf(WHEN), SHOWN);
    expect(boxLine(more)).toBe(`${Q}\n\n${S1}\n${S2}\n${S3}\nAlso the cost to households.`);
    const less = boxRemove(more, REGION.question);
    expect(boxLine(less)).toBe(`${Q}\n\n${S2}\n${S3}\nAlso the cost to households.`);
    const none = boxRemove(boxRemove(less, WHEN.question), CARE.question);
    expect(boxLine(none)).toBe(`${Q}\n\nAlso the cost to households.`);
  });

  it("leaves a sentence the person edited in place, reports it dropped, and places a new answer for its key as a new line", () => {
    const placed = tap(boxOf(Q), REGION);
    const edited = boxTyped(placed, `${Q}\n\nWhich region? The north and the west.`);
    expect(edited.placed).toEqual([]);
    expect(boxDropped(placed, edited)).toEqual(["Which region?"]);
    const removed = boxRemove(edited, "Which region?");
    expect(removed.text).toBe(`${Q}\n\nWhich region? The north and the west.`);
    const again = boxPlace(removed, { key: "Which region?", text: "Which region? The south." }, SHOWN);
    expect(boxLine(again).split("\n")).toEqual([Q, "", "Which region? The south.", "Which region? The north and the west."]);
    expect(again.placed).toEqual([{ key: "Which region?", text: "Which region? The south." }]);
  });
});

describe("boxTyped and boxDropped", () => {
  it("names the key of a placed sentence the person deleted by typing", () => {
    const placed = tap(boxOf(Q), REGION, WHEN);
    const deleted = boxTyped(placed, `${Q}\n\n${S2}`);
    expect(boxDropped(placed, deleted)).toEqual([REGION.question]);
    expect(deleted.placed).toEqual([{ key: WHEN.question, text: S2 }]);
    const allGone = boxTyped(deleted, Q);
    expect(boxDropped(placed, allGone)).toEqual([REGION.question, WHEN.question]);
  });

  it("drops nothing for a sentence placed again with new words", () => {
    const placed = tap(boxOf(Q), REGION);
    expect(boxDropped(placed, boxPlace(placed, { key: REGION.question, text: "Which region? The south." }, SHOWN))).toEqual([]);
  });
});

describe("a sentence still written on its own line stays placed (spec §2 item 2: only deleting or rewriting it takes the answer out)", () => {
  it("keeps the answers when the person types on the blank line under their words, and places, replaces and removes around it", () => {
    const placed = tap(boxOf(Q), REGION, WHEN);
    const typed = boxTyped(placed, `${Q}\nAlso the cost to households.\n${S1}\n${S2}`);
    expect(boxDropped(placed, typed)).toEqual([]);
    expect(typed.placed).toEqual(placed.placed);
    const more = boxPlace(typed, sentenceOf(CARE), SHOWN);
    expect(boxLine(more)).toBe(`${Q}\nAlso the cost to households.\n${S1}\n${S2}\n${S3}`);
    // Tapping an answer whose sentence is still there never writes it twice.
    expect(boxPlace(more, sentenceOf(REGION), SHOWN).text).toBe(more.text);
    const south = boxPlace(more, { key: REGION.question, text: "Which region? The south." }, SHOWN);
    expect(boxLine(south)).toBe(`${Q}\nAlso the cost to households.\nWhich region? The south.\n${S2}\n${S3}`);
    const none = boxRemove(boxRemove(boxRemove(more, WHEN.question), REGION.question), CARE.question);
    expect(none.text).toBe(`${Q}\nAlso the cost to households.`);
  });

  it("keeps the answers when the person deletes the blank line, moves it below them or erases their own words", () => {
    const placed = tap(boxOf(Q), REGION, WHEN);
    const sent = composeQuestion(CD1_QUESTION, goalOf(REGION, WHEN), CATALOG);
    for (const text of [`${Q}\n${S1}\n${S2}`, `\n\n${S1}\n${S2}`, `${S1}\n${S2}`, `${Q}\n${S1}\n${S2}\n\nAlso the cost to households.`]) {
      const typed = boxTyped(placed, text);
      expect(boxDropped(placed, typed)).toEqual([]);
      expect(typed.placed).toEqual(placed.placed);
    }
    const joined = boxTyped(placed, `${Q}\n${S1}\n${S2}`);
    expect(boxRemove(joined, REGION.question).text).toBe(`${Q}\n${S2}`);
    expect(boxRemove(boxRemove(joined, REGION.question), WHEN.question).text).toBe(Q);
    // Make this my question: the new words, one blank line, the sentences (as composeQuestion writes them).
    expect(boxLine(boxOwnWords(joined, CD1_QUESTION))).toBe(sent);
    expect(boxLine(boxOwnWords(boxTyped(placed, `\n\n${S1}\n${S2}`), CD1_QUESTION))).toBe(sent);
    expect(boxLine(boxOwnWords(boxTyped(placed, `${S1}\n${S2}`), CD1_QUESTION))).toBe(sent);
  });
});

describe("boxOwnWords", () => {
  it("Make this my question keeps every placed sentence under the new words", () => {
    const placed = tap(boxOf(Q), WHEN, REGION);
    const swapped = boxOwnWords(placed, CD1_QUESTION);
    expect(boxLine(swapped)).toBe(`${CD1_QUESTION}\n\n${S1}\n${S2}`);
    expect(boxLine(swapped)).toBe(composeQuestion(CD1_QUESTION, goalOf(REGION, WHEN), CATALOG));
    expect(swapped.placed).toEqual(placed.placed);
    expect(boxLine(boxOwnWords(boxOf(Q), CD1_QUESTION))).toBe(CD1_QUESTION);
  });
});

describe("boxChanged", () => {
  it("is false untouched, true after one place, false again after its removal", () => {
    expect(boxChanged(boxOf(Q), Q)).toBe(false);
    const placed = tap(boxOf(Q), REGION);
    expect(boxChanged(placed, Q)).toBe(true);
    expect(boxChanged(boxRemove(placed, REGION.question), Q)).toBe(false);
  });
});

// V4 start step, Task 76g (read-f1, read-d3): a new reading keeps an answer under a reworded question; its sentence stays as it
// was, byte for byte, and only the key it sits under changes.
describe("boxRekey", () => {
  it("keeps the text byte for byte, and a later boxRemove(box, newKey) removes that line", () => {
    const placed = boxTyped(tap(boxOf(Q), REGION, WHEN), `${Q}\n\n${S1}\n${S2}\nAlso the cost to households.`);
    const moved = boxRekey(placed, WHEN.question, "Over what time?");
    expect(moved.text).toBe(placed.text);
    expect(new TextEncoder().encode(moved.text)).toEqual(new TextEncoder().encode(placed.text));
    expect(moved.placed).toEqual([{ key: REGION.question, text: S1 }, { key: "Over what time?", text: S2 }]);
    const removed = boxRemove(moved, "Over what time?");
    expect(boxLine(removed)).toBe(`${Q}\n\n${S1}\nAlso the cost to households.`);
    expect(removed.placed).toEqual([{ key: REGION.question, text: S1 }]);
    // The old key no longer names it.
    expect(boxRemove(moved, WHEN.question)).toBe(moved);
  });

  it("a key not placed: the box as it is", () => {
    const placed = tap(boxOf(Q), REGION);
    expect(boxRekey(placed, "By when?", "Over what time?")).toBe(placed);
    expect(boxRekey(placed, REGION.question, REGION.question)).toBe(placed);
  });
});

describe("what the box keeps", () => {
  it("collapses runs of blank lines to one blank line", () => {
    const placed = tap(boxOf(Q), REGION);
    const typed = boxTyped(placed, `\n\n${Q}\n\n\n  \n${S1}\n\n\n\nAlso the cost to households.\n\n`);
    expect(boxLine(typed)).toBe(`${Q}\n\n${S1}\n\nAlso the cost to households.`);
    expect(typed.placed).toEqual(placed.placed);
    // Blank lines above the words are not the line under them (ownWords trims first too).
    expect(boxLine(boxOwnWords(typed, CD1_QUESTION))).toBe(`${CD1_QUESTION}\n\n${S1}\n\nAlso the cost to households.`);
  });

  it("keeps a 500-emoji typed line whole", () => {
    const waves = "🌊".repeat(500);
    expect(waves.length).toBe(1000);
    const typed = boxTyped(tap(boxOf(Q), REGION), `${Q}\n\n${S1}\n${waves}`);
    const after = boxRemove(boxPlace(typed, sentenceOf(WHEN), SHOWN), REGION.question);
    expect(boxLine(after).split("\n")).toEqual([Q, "", S2, waves]);
  });

  it("keeps an Arabic sentence byte for byte", () => {
    const question = "هل ينبغي للبلدة أن تبني رصيفا ثانيا؟";
    const answer: V4GoalAnswer = { question: "أي منطقة؟", answer: "المنطقة الشمالية.", other: false };
    const sentence = sentenceOf(answer);
    const line = boxLine(boxPlace(boxOf(question), sentence, [answer.question]));
    expect(line).toBe(composeQuestion(question, goalOf(answer), CATALOG));
    const encoder = new TextEncoder();
    expect(encoder.encode(line.split("\n\n")[1])).toEqual(encoder.encode(sentence.text));
    expect(encoder.encode(line.split("\n\n")[0])).toEqual(encoder.encode(question));
  });
});
