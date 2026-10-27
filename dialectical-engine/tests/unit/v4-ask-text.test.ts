import { askQuestionMaxBytes } from "@debateai/contract";
import { describe, expect, it } from "vitest";

import {
  addedLines,
  composeQuestion,
  digQuestion,
  digTargetQuestions,
  ownWords,
  parseDigQuestion,
  sameQuestionText,
  startsWithLabel
} from "../../apps/ui/lib/v4/askText.js";
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
    expect(composeQuestion(QUESTION, EMPTY_GOAL, CATALOG, "en")).toBe("Should Romania build more nuclear plants?");
  });

  it("adds one sentence per set part, after a blank line, in the order place, time, purpose, what matters, angles", () => {
    const text = composeQuestion(QUESTION, {
      place: "EU", placeOther: "", horizon: "TWENTY_FIVE_YEARS", purpose: "WRITE",
      matters: "  keeping prices low  ", angles: ["jobs", "  waste  "]
    }, CATALOG, "en");
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
    const one = (goal: Partial<typeof EMPTY_GOAL>) => composeQuestion("Q?", { ...EMPTY_GOAL, ...goal }, CATALOG, "en").split("\n\n")[1];
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
    expect(composeQuestion(QUESTION, { ...EMPTY_GOAL, place: "OTHER", placeOther: "   ", matters: " \n ", angles: ["", "  "] }, CATALOG, "en"))
      .toBe("Should Romania build more nuclear plants?");
  });

  it("drops repeated angles and keeps at most five", () => {
    const text = composeQuestion("Q?", { ...EMPTY_GOAL, angles: ["a1", "A1", "b2", "c3", "d4", "e5", "f6"] }, CATALOG, "en");
    expect(text).toBe("Q?\n\nPlease also look at: a1; b2; c3; d4; e5.");
  });

  it("never reads the person's words as placeholders", () => {
    expect(composeQuestion("Q?", { ...EMPTY_GOAL, matters: "{list} and {place}" }, CATALOG, "en"))
      .toBe("Q?\n\nIf the answers pull in different directions, what matters most to me: {list} and {place}");
  });
});

describe("digQuestion", () => {
  it("asks about a path, then names the earlier question", () => {
    expect(digQuestion({ kind: "path", path: PATH }, QUESTION, CATALOG, "en")).toBe(
      "Look deeper into this part of the answer: Nuclear power keeps the grid steady.\n\n"
      + "This follows from an earlier question: “Should Romania build more nuclear plants?”");
  });

  it("asks each kind of open question in its own words", () => {
    const tail = "\n\nThis follows from an earlier question: “Should Romania build more nuclear plants?”";
    expect(digQuestion({ kind: "open", questions: [open("STILL_ARGUED", "Costs fall.")] }, QUESTION, CATALOG, "en"))
      .toBe(`Does this hold up, and when? Costs fall.${tail}`);
    expect(digQuestion({ kind: "open", questions: [open("OBJECTION", "Waste is unsolved.")] }, QUESTION, CATALOG, "en"))
      .toBe(`How strong is this objection, and does it change the answer? Waste is unsolved.${tail}`);
    expect(digQuestion({ kind: "open", questions: [open("WOULD_CHANGE", "Gas gets cheap.")] }, QUESTION, CATALOG, "en"))
      .toBe(`Would this change the answer? Gas gets cheap.${tail}`);
  });

  it("numbers several open questions asked together", () => {
    const text = digQuestion({ kind: "open", questions: [open("STILL_ARGUED", "Costs fall.", "p:1"), open("OBJECTION", "Waste.", "o:0")] },
      QUESTION, CATALOG, "en");
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
    const text = digQuestion({ kind: "path", path: PATH }, longQuestion, CATALOG, "en");
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(askQuestionMaxBytes());
    expect(text.startsWith("Look deeper into this part of the answer: Nuclear power keeps the grid steady.")).toBe(true);
    expect(text).toContain("…”");
  });

  it("shortens the item texts too when they alone pass the limit (counting bytes, not letters)", () => {
    const long = "ă".repeat(3000);
    const text = digQuestion({ kind: "open", questions: [open("STILL_ARGUED", long, "p:1"), open("OBJECTION", long, "o:0")] },
      "Q? ".repeat(200), CATALOG, "en");
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

describe("ownWords and addedLines (fix wave 1: titles show the person's words only)", () => {
  it("splits at the first blank line", () => {
    const line = "Should we?\n\nThis is about Romania.\n  \nTime frame: right now.";
    expect(ownWords(line)).toBe("Should we?");
    expect(addedLines(line)).toEqual(["This is about Romania.", "Time frame: right now."]);
  });

  it("returns the whole trimmed text and no added lines when there is no blank line", () => {
    expect(ownWords("  Line one\nline two  ")).toBe("Line one\nline two");
    expect(addedLines("  Line one\nline two  ")).toEqual([]);
  });

  it("treats a blank line holding only spaces as a blank line", () => {
    expect(ownWords("Q?\n   \nAdded.")).toBe("Q?");
    expect(addedLines("Q?\n   \nAdded.")).toEqual(["Added."]);
  });
});

describe("composeQuestion off English (ASK-1)", () => {
  const goal = { ...EMPTY_GOAL, place: "ROMANIA" as const, horizon: "NOW" as const, angles: ["jobs"] };

  it("sends the person's words only on a non-English page", () => {
    expect(composeQuestion(QUESTION, goal, CATALOG, "ro")).toBe("Should Romania build more nuclear plants?");
    expect(composeQuestion(QUESTION, goal, CATALOG, "de")).toBe("Should Romania build more nuclear plants?");
  });

  it("adds the sentences for every English locale", () => {
    for (const locale of ["en", "en-US", "en-GB"]) {
      expect(composeQuestion("Q?", goal, CATALOG, locale)).toBe("Q?\n\nThis is about Romania.\nTime frame: right now.\nPlease also look at: jobs.");
    }
  });

  it("closes up a blank line inside the person's own words, so ownWords gets all of them back", () => {
    const text = composeQuestion("First part.\n\n  \nSecond part?", goal, CATALOG, "en");
    expect(ownWords(text)).toBe("First part.\nSecond part?");
    expect(composeQuestion("First part.\n\nSecond part?", EMPTY_GOAL, CATALOG, "ro")).toBe("First part.\nSecond part?");
  });

  it("does not double the closing mark of the last angle (ASK-6)", () => {
    expect(composeQuestion("Q?", { ...EMPTY_GOAL, angles: ["jobs", "waste."] }, CATALOG, "en"))
      .toBe("Q?\n\nPlease also look at: jobs; waste.");
  });
});

describe("digQuestion carries the earlier question's added lines (ASK-6)", () => {
  const PARENT = "Should Romania build more nuclear plants?\n\nThis is about Romania.\nTime frame: the next 5 years.";

  it("names the earlier question by its own words and keeps its country and time lines", () => {
    expect(digQuestion({ kind: "path", path: PATH }, PARENT, CATALOG, "en")).toBe([
      "Look deeper into this part of the answer: Nuclear power keeps the grid steady.",
      "",
      "This follows from an earlier question: “Should Romania build more nuclear plants?”",
      "This is about Romania.",
      "Time frame: the next 5 years."
    ].join("\n"));
  });

  it("a dig of a dig names the dig's own words and keeps the whole chain, without nesting it in the quote", () => {
    const first = digQuestion({ kind: "open", questions: [open("STILL_ARGUED", "Costs fall.", "p:1")] }, PARENT, CATALOG, "en");
    const second = digQuestion({ kind: "open", questions: [open("OBJECTION", "Waste.", "o:0")] }, first, CATALOG, "en");
    expect(second).toBe([
      "How strong is this objection, and does it change the answer? Waste.",
      "",
      "This follows from an earlier question: “Does this hold up, and when? Costs fall.”",
      "This follows from an earlier question: “Should Romania build more nuclear plants?”",
      "This is about Romania.",
      "Time frame: the next 5 years."
    ].join("\n"));
  });

  it("off English: the item texts alone (numbered when several), a blank line, the earlier question in quotes", () => {
    expect(digQuestion({ kind: "open", questions: [open("STILL_ARGUED", "Costurile scad.", "p:1")] },
      "Ar trebui România să construiască?", CATALOG, "ro"))
      .toBe("Costurile scad.\n\n“Ar trebui România să construiască?”");
    expect(digQuestion({ kind: "open", questions: [open("STILL_ARGUED", "A.", "p:1"), open("OBJECTION", "B.", "o:0")] },
      "Întrebare?", CATALOG, "ro"))
      .toBe("1. A.\n2. B.\n\n“Întrebare?”");
  });

  it("drops carried lines from the end only when everything else is already as short as it may be", () => {
    const parent = `Q?\n\n${Array.from({ length: 40 }, (_, index) => `Line ${index} ${"x".repeat(300)}`).join("\n")}`;
    const text = digQuestion({ kind: "path", path: PATH }, parent, CATALOG, "en");
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(askQuestionMaxBytes());
    expect(text).toContain("This follows from an earlier question: “Q?”\nLine 0 ");
    expect(text).not.toContain("Line 39 ");
  });
});

describe("parseDigQuestion (round trips)", () => {
  const PARENT = "Should Romania build more nuclear plants?\n\nThis is about Romania.";

  it("reads back a path dig", () => {
    expect(parseDigQuestion(digQuestion({ kind: "path", path: PATH }, PARENT, CATALOG, "en"), CATALOG)).toEqual({
      parentQuestion: "Should Romania build more nuclear plants?",
      items: ["Nuclear power keeps the grid steady."]
    });
  });

  it("reads back one open question of each kind", () => {
    for (const kind of ["STILL_ARGUED", "OBJECTION", "WOULD_CHANGE"] as const) {
      const text = digQuestion({ kind: "open", questions: [open(kind, `Text for ${kind}.`)] }, PARENT, CATALOG, "en");
      expect(parseDigQuestion(text, CATALOG)).toEqual({
        parentQuestion: "Should Romania build more nuclear plants?",
        items: [`Text for ${kind}.`]
      });
    }
  });

  it("reads back several questions asked together", () => {
    const text = digQuestion({ kind: "open", questions: [
      open("STILL_ARGUED", "Costs fall.", "p:1"), open("OBJECTION", "Waste.", "o:0"), open("WOULD_CHANGE", "Gas gets cheap.", "w")
    ] }, PARENT, CATALOG, "en");
    expect(parseDigQuestion(text, CATALOG)).toEqual({
      parentQuestion: "Should Romania build more nuclear plants?",
      items: ["Costs fall.", "Waste.", "Gas gets cheap."]
    });
  });

  it("reads back a dig of a dig: the parent is the dig's own words (the first context line)", () => {
    const first = digQuestion({ kind: "open", questions: [open("STILL_ARGUED", "Costs fall.", "p:1"), open("OBJECTION", "Waste.", "o:0")] },
      PARENT, CATALOG, "en");
    const second = digQuestion({ kind: "path", path: PATH }, first, CATALOG, "en");
    const parsed = parseDigQuestion(second, CATALOG);
    expect(parsed?.items).toEqual(["Nuclear power keeps the grid steady."]);
    expect(sameQuestionText(parsed?.parentQuestion ?? "", ownWords(first))).toBe(true);
  });

  it("reads back the form sent off English, and a dig of it", () => {
    const first = digQuestion({ kind: "open", questions: [open("STILL_ARGUED", "A.", "p:1"), open("OBJECTION", "B.", "o:0")] },
      "Întrebare?", CATALOG, "ro");
    expect(parseDigQuestion(first, CATALOG)).toEqual({ parentQuestion: "Întrebare?", items: ["A.", "B."] });
    const second = digQuestion({ kind: "open", questions: [open("WOULD_CHANGE", "C.", "w")] }, first, CATALOG, "ro");
    const parsed = parseDigQuestion(second, CATALOG);
    expect(parsed?.items).toEqual(["C."]);
    expect(sameQuestionText(parsed?.parentQuestion ?? "", ownWords(first))).toBe(true);
  });

  it("is null for a question that is not a dig", () => {
    expect(parseDigQuestion("Should we?", CATALOG)).toBeNull();
    expect(parseDigQuestion(composeQuestion("Should we?", { ...EMPTY_GOAL, place: "EU" }, CATALOG, "en"), CATALOG)).toBeNull();
    expect(parseDigQuestion("Should we?\n\nThis follows from an earlier question: “”", CATALOG)).toBeNull();
  });

  it("an earlier question cut to fit the limit still matches the text it was cut from", () => {
    const longQuestion = `${"Should we ".repeat(1000)}?`;
    const parsed = parseDigQuestion(digQuestion({ kind: "path", path: PATH }, longQuestion, CATALOG, "en"), CATALOG);
    expect(parsed?.parentQuestion.endsWith("…")).toBe(true);
    expect(sameQuestionText(parsed?.parentQuestion ?? "", longQuestion)).toBe(true);
    expect(sameQuestionText(parsed?.parentQuestion ?? "", "Something else entirely")).toBe(false);
  });
});

describe("startsWithLabel", () => {
  it("spots a sentence that already opens with the label, ignoring case and the colon", () => {
    expect(startsWithLabel("How sure we are: fairly sure.", "How sure we are:")).toBe(true);
    expect(startsWithLabel("how sure we are — fairly", "How sure we are:")).toBe(true);
    expect(startsWithLabel("We are fairly sure about the direction.", "How sure we are:")).toBe(false);
    expect(startsWithLabel("Anything", "  :  ")).toBe(false);
  });
});
