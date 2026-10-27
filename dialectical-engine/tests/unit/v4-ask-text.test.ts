import { askQuestionMaxBytes } from "@debateai/contract";
import { describe, expect, it } from "vitest";

import { composeQuestion, digQuestion, digTargetQuestions } from "../../apps/ui/lib/v4/askText.js";
import { EMPTY_GOAL, type V4OpenQuestion, type V4Path } from "../../apps/ui/lib/v4/types.js";

/*
 * V4 initial (spec 2026-10-28, B2): the question as SENT. The D2 choices travel as plain sentences in the page's
 * language, in a fixed order, and a dig's question always fits the API's limit.
 */

const CATALOG = Object.freeze({
  "v4.askText.place.ANYWHERE": "This is about any country, in general.",
  "v4.askText.place.ROMANIA": "This is about Romania.",
  "v4.askText.place.EU": "This is about the European Union as a whole.",
  "v4.askText.place.OTHER": "This is about {place}.",
  "v4.askText.horizon.NOW": "Time frame: right now.",
  "v4.askText.horizon.FIVE_YEARS": "Time frame: the next 5 years.",
  "v4.askText.horizon.TWENTY_FIVE_YEARS": "Time frame: the next 10 to 25 years.",
  "v4.askText.horizon.LONG_RUN": "Time frame: the long run.",
  "v4.askText.purpose.DECIDE": "I need this to make a decision.",
  "v4.askText.purpose.UNDERSTAND": "I want to understand it.",
  "v4.askText.purpose.WRITE": "I am writing about it.",
  "v4.askText.matters": "If the answers pull in different directions, what matters most to me: {matters}",
  "v4.askText.angles": "Please also look at: {list}.",
  "v4.digText.path": "Look deeper into this part of the answer: {line}",
  "v4.digText.kind.STILL_ARGUED": "Does this hold up, and when? {text}",
  "v4.digText.kind.OBJECTION": "How strong is this objection, and does it change the answer? {text}",
  "v4.digText.kind.WOULD_CHANGE": "Would this change the answer? {text}",
  "v4.digText.together": "Please look into these questions together:",
  "v4.digText.context": "This follows from an earlier question: “{question}”"
});

const QUESTION = "  Should Romania build more nuclear plants?  ";

function open(kind: V4OpenQuestion["kind"], text: string, id = "w"): V4OpenQuestion {
  return { id, kind, text, star: false, pathId: null };
}

const PATH: V4Path = {
  id: "path-1", fate: "HELD_UP", line: "Nuclear power keeps the grid steady.", points: [],
  counts: { SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 }, unchecked: 0, open: []
};

describe("composeQuestion", () => {
  it("sends the trimmed question exactly when no part is set", () => {
    expect(composeQuestion(QUESTION, EMPTY_GOAL, CATALOG)).toBe("Should Romania build more nuclear plants?");
  });

  it("adds one sentence per set part, after a blank line, in the order place, time, purpose, what matters, angles", () => {
    const text = composeQuestion(QUESTION, {
      place: "EU", placeOther: "", horizon: "TWENTY_FIVE_YEARS", purpose: "WRITE",
      matters: "  keeping prices low  ", angles: ["jobs", "  waste  "]
    }, CATALOG);
    expect(text).toBe([
      "Should Romania build more nuclear plants?",
      "",
      "This is about the European Union as a whole.",
      "Time frame: the next 10 to 25 years.",
      "I am writing about it.",
      "If the answers pull in different directions, what matters most to me: keeping prices low",
      "Please also look at: jobs; waste."
    ].join("\n"));
  });

  it("words every place, time frame and purpose", () => {
    const one = (goal: Partial<typeof EMPTY_GOAL>) => composeQuestion("Q?", { ...EMPTY_GOAL, ...goal }, CATALOG).split("\n\n")[1];
    expect(one({ place: "ANYWHERE" })).toBe("This is about any country, in general.");
    expect(one({ place: "ROMANIA" })).toBe("This is about Romania.");
    expect(one({ place: "OTHER", placeOther: "  Moldova " })).toBe("This is about Moldova.");
    expect(one({ horizon: "NOW" })).toBe("Time frame: right now.");
    expect(one({ horizon: "FIVE_YEARS" })).toBe("Time frame: the next 5 years.");
    expect(one({ horizon: "LONG_RUN" })).toBe("Time frame: the long run.");
    expect(one({ purpose: "DECIDE" })).toBe("I need this to make a decision.");
    expect(one({ purpose: "UNDERSTAND" })).toBe("I want to understand it.");
  });

  it("adds nothing for Another place left empty, blank matters or blank angles", () => {
    expect(composeQuestion(QUESTION, { ...EMPTY_GOAL, place: "OTHER", placeOther: "   ", matters: " \n ", angles: ["", "  "] }, CATALOG))
      .toBe("Should Romania build more nuclear plants?");
  });

  it("drops repeated angles and keeps at most five", () => {
    const text = composeQuestion("Q?", { ...EMPTY_GOAL, angles: ["a1", "A1", "b2", "c3", "d4", "e5", "f6"] }, CATALOG);
    expect(text).toBe("Q?\n\nPlease also look at: a1; b2; c3; d4; e5.");
  });

  it("never reads the person's words as placeholders", () => {
    expect(composeQuestion("Q?", { ...EMPTY_GOAL, matters: "{list} and {place}" }, CATALOG))
      .toBe("Q?\n\nIf the answers pull in different directions, what matters most to me: {list} and {place}");
  });
});

describe("digQuestion", () => {
  it("asks about a path, then names the earlier question", () => {
    expect(digQuestion({ kind: "path", path: PATH }, QUESTION, CATALOG)).toBe(
      "Look deeper into this part of the answer: Nuclear power keeps the grid steady.\n\n"
      + "This follows from an earlier question: “Should Romania build more nuclear plants?”");
  });

  it("asks each kind of open question in its own words", () => {
    const tail = "\n\nThis follows from an earlier question: “Should Romania build more nuclear plants?”";
    expect(digQuestion({ kind: "open", questions: [open("STILL_ARGUED", "Costs fall.")] }, QUESTION, CATALOG))
      .toBe(`Does this hold up, and when? Costs fall.${tail}`);
    expect(digQuestion({ kind: "open", questions: [open("OBJECTION", "Waste is unsolved.")] }, QUESTION, CATALOG))
      .toBe(`How strong is this objection, and does it change the answer? Waste is unsolved.${tail}`);
    expect(digQuestion({ kind: "open", questions: [open("WOULD_CHANGE", "Gas gets cheap.")] }, QUESTION, CATALOG))
      .toBe(`Would this change the answer? Gas gets cheap.${tail}`);
  });

  it("numbers several open questions asked together", () => {
    const text = digQuestion({ kind: "open", questions: [open("STILL_ARGUED", "Costs fall.", "p:1"), open("OBJECTION", "Waste.", "o:0")] },
      QUESTION, CATALOG);
    expect(text).toBe([
      "Please look into these questions together:",
      "1. Does this hold up, and when? Costs fall.",
      "2. How strong is this objection, and does it change the answer? Waste.",
      "",
      "This follows from an earlier question: “Should Romania build more nuclear plants?”"
    ].join("\n"));
  });

  it("stays under the API's limit: the earlier question is shortened first, with …", () => {
    const longQuestion = `${"Should we ".repeat(1000)}?`;
    const text = digQuestion({ kind: "path", path: PATH }, longQuestion, CATALOG);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(askQuestionMaxBytes());
    expect(text.startsWith("Look deeper into this part of the answer: Nuclear power keeps the grid steady.")).toBe(true);
    expect(text).toContain("…”");
  });

  it("shortens the item texts too when they alone pass the limit (counting bytes, not letters)", () => {
    const long = "ă".repeat(3000);
    const text = digQuestion({ kind: "open", questions: [open("STILL_ARGUED", long, "p:1"), open("OBJECTION", long, "o:0")] },
      "Q? ".repeat(200), CATALOG);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(askQuestionMaxBytes());
    expect(text).toContain("1. Does this hold up, and when? ăăă");
    expect(text).toContain("2. How strong is this objection");
    expect(text.match(/…/g)?.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain("This follows from an earlier question: “Q? Q?");
  });
});

describe("digTargetQuestions", () => {
  it("returns the plain texts: the path line, or each open question's text", () => {
    expect(digTargetQuestions({ kind: "path", path: PATH })).toEqual(["Nuclear power keeps the grid steady."]);
    expect(digTargetQuestions({ kind: "open", questions: [open("OBJECTION", "A"), open("WOULD_CHANGE", "B")] })).toEqual(["A", "B"]);
  });
});
