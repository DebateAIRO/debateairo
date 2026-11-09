import { PurposeLinesSchema, WEB_CONTRACT_LIMITS, askQuestionMaxBytes } from "@debateai/contract";
import { describe, expect, it } from "vitest";

import {
  addedLines,
  carriedMatch,
  answersStillAsked,
  clarifyingQuestions,
  composeQuestion,
  purposeLinesOfGoal,
  DIG_ITEM_FLOOR,
  digQuestion,
  digTargetQuestions,
  FREE_GOAL_CHOICES_MAX,
  goalChoiceCount,
  goalWithinPlan,
  ownWords,
  parseDigDetail,
  parseDigQuestion,
  RETIRED_ANGLES_SENTENCE_EN,
  ROOT_QUESTION_KEEP,
  sameItemText,
  sameParentText,
  sameQuestionText,
  startsWithLabel
} from "../../apps/ui/lib/v4/askText.js";
import { EMPTY_GOAL, type V4OpenQuestion, type V4Path } from "../../apps/ui/lib/v4/types.js";

/*
 * V4 initial (spec 2026-10-28, B2): the question as SENT. The D2 choices travel as plain sentences in the page's
 * language, in a fixed order, and a dig's question always fits the API's limit.
 */

const CATALOG: Record<string, string> = Object.freeze({
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
  "newDebate.askText.matters": "If the answers pull in different directions, what matters most to me: {matters}",
  "v4.askText.matters": "If the answers pull in different directions, what matters most to me: {matters}",
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

const WHERE = { question: "Where?", answer: "Bucharest", other: false };
const WHEN = { question: "Over what time?", answer: "The next 5 years", other: false };
const WHY = { question: "What is it for?", answer: "To decide", other: false };

describe("composeQuestion", () => {
  it("sends the trimmed question exactly when no part is set", () => {
    expect(composeQuestion(QUESTION, EMPTY_GOAL, CATALOG)).toBe("Should Romania build more nuclear plants?");
  });

  it("adds one sentence per set part, after a blank line: the answers, then what matters", () => {
    const text = composeQuestion(QUESTION, { answers: [WHERE, WHEN, WHY], matters: "  keeping prices low  " }, CATALOG);
    expect(text).toBe([
      "Should Romania build more nuclear plants?",
      "",
      "Where? Bucharest.",
      "Over what time? The next 5 years.",
      "What is it for? To decide.",
      "If the answers pull in different directions, what matters most to me: keeping prices low"
    ].join("\n"));
  });

  it("closes an answer in its own script, and keeps a closing mark it already has", () => {
    const one = (question: string, answer: string) => composeQuestion("Q?", { ...EMPTY_GOAL, answers: [{ question, answer, other: false }] }, CATALOG).split("\n\n")[1];
    expect(one("Unde?", "În București")).toBe("Unde? În București.");
    expect(one("どこですか？", "東京")).toBe("どこですか？ 東京。");
    expect(one("Why?", "Not sure!")).toBe("Why? Not sure!");
  });

  it("adds nothing for an Other left empty or blank matters", () => {
    expect(composeQuestion(QUESTION, { answers: [{ question: "Where?", answer: "   ", other: true }], matters: " \n " }, CATALOG))
      .toBe("Should Romania build more nuclear plants?");
  });

  it("keeps a typed answer on one line, so nothing it holds can end the person's own words or add a line of its own", () => {
    const text = composeQuestion("Q?", { ...EMPTY_GOAL, answers: [{ question: "Where?", answer: " Harbour \n\n Town ", other: true }] }, CATALOG);
    expect(text).toBe("Q?\n\nWhere? Harbour Town.");
    expect(ownWords(text)).toBe("Q?");
  });

  it("never reads the person's words as placeholders", () => {
    expect(composeQuestion("Q?", { ...EMPTY_GOAL, matters: "{list} and {place}" }, CATALOG))
      .toBe("Q?\n\nIf the answers pull in different directions, what matters most to me: {list} and {place}");
  });
});

describe("the step-2 choices on Free (owner 2026-10-29: capped at 3)", () => {
  const FULL = Object.freeze({ answers: Object.freeze([WHERE, WHEN]), matters: "prices" });
  const OVER = Object.freeze({ answers: Object.freeze([WHERE, WHEN, WHY]), matters: "prices" });

  it("counts each set choice once: each question answered and what matters", () => {
    expect(FREE_GOAL_CHOICES_MAX).toBe(3);
    expect(goalChoiceCount(EMPTY_GOAL)).toBe(0);
    expect(goalChoiceCount(FULL)).toBe(3);
    // V4 start step, Task 76h (read-f8): only real answers count. A pressed "Other" with nothing typed in it is not a choice
    // (it says nothing), and neither is blank matters; an "Other" with words is.
    expect(goalChoiceCount({ answers: [{ question: "Where?", answer: "", other: true }], matters: "  " })).toBe(0);
    expect(goalChoiceCount({ answers: [{ question: "Where?", answer: "   ", other: true }, WHEN], matters: "" })).toBe(1);
    expect(goalChoiceCount({ answers: [{ question: "Where?", answer: "Cluj", other: true }], matters: "" })).toBe(1);
    // So Free keeps the first three real answers, whatever empty "Other" lies between them.
    const BLANK = { question: "Whose?", answer: "", other: true };
    const PAST_THE_CAP = { answers: [WHERE, BLANK, WHEN, WHY, { question: "How much?", answer: "A lot", other: false }], matters: "" };
    expect(goalChoiceCount(PAST_THE_CAP)).toBe(4);
    expect(goalWithinPlan(PAST_THE_CAP, "free").answers.filter((given) => given.answer.trim().length > 0)).toEqual([WHERE, WHEN, WHY]);
  });

  it("Free keeps the first 3 choices in the order they are sent and drops the rest from the end", () => {
    expect(goalWithinPlan(FULL, "free")).toBe(FULL);
    // Decision 2: no angles left to drop, so the cap drops what matters first.
    expect(goalWithinPlan(OVER, "free")).toEqual({ answers: [WHERE, WHEN, WHY], matters: "" });
    expect(goalWithinPlan({ answers: [WHERE, WHEN, WHY, { question: "Whose?", answer: "Mine", other: false }], matters: "x" }, "free"))
      .toEqual({ answers: [WHERE, WHEN, WHY], matters: "" });
    const sent = composeQuestion(QUESTION, goalWithinPlan(OVER, "free"), CATALOG);
    expect(sent.split("\n\n")[1]!.split("\n")).toEqual(["Where? Bucharest.", "Over what time? The next 5 years.", "What is it for? To decide."]);
  });

  it("decision 2: a goal holds the answers and what matters, and no angles", () => {
    expect(Object.keys(EMPTY_GOAL).sort()).toEqual(["answers", "matters"]);
    expect(Object.keys(goalWithinPlan(OVER, "free")).sort()).toEqual(["answers", "matters"]);
  });

  it("a paid plan keeps every choice, the same object", () => {
    expect(goalWithinPlan(OVER, "premium")).toBe(OVER);
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

describe("composeQuestion on every language (decision 29)", () => {
  const goal = { answers: [{ question: "Unde?", answer: "În București", other: false }], matters: "locuri de muncă" };

  it("adds the same sentences whatever the page's language: the catalogue given holds that language's lead-ins", () => {
    const romanian = { ...CATALOG, "newDebate.askText.matters": "Cel mai important pentru mine este: {matters}" };
    expect(composeQuestion("Q?", goal, romanian)).toBe("Q?\n\nUnde? În București.\nCel mai important pentru mine este: locuri de muncă");
  });

  it("closes up a blank line inside the person's own words, so ownWords gets all of them back", () => {
    const text = composeQuestion("First part.\n\n  \nSecond part?", goal, CATALOG);
    expect(ownWords(text)).toBe("First part.\nSecond part?");
    expect(composeQuestion("First part.\n\nSecond part?", EMPTY_GOAL, CATALOG)).toBe("First part.\nSecond part?");
  });
});

describe("the questions a reply puts on the page (decision 29)", () => {
  const ai = { source: "AI" as const, questions: [{ text: "Where?", answers: ["Here", "There"] }], purpose: { text: "What for?", answers: ["To vote", "To teach"] } };

  it("the AI's questions, the one about what the answer is for last", () => {
    expect(clarifyingQuestions(ai).map((question) => question.text)).toEqual(["Where?", "What for?"]);
  });
  it("no purpose question after the re-ask: the AI's other questions stay", () => {
    expect(clarifyingQuestions({ source: "AI", questions: ai.questions }).map((question) => question.text)).toEqual(["Where?"]);
  });
  it("no AI: no questions at all, in any language (decision 31)", () => {
    expect(clarifyingQuestions({ source: "NONE" })).toEqual([]);
  });
  it("a changed question drops the answers that no longer apply, and keeps the rest, typed ones with their question", () => {
    const asked = clarifyingQuestions(ai);
    const kept = { question: "Where?", answer: "Here", other: false };
    const typed = { question: "What for?", answer: "My own reason", other: true };
    const given = [kept, typed];
    expect(answersStillAsked(given, asked)).toBe(given);
    expect(answersStillAsked([{ ...kept, answer: "Gone" }, typed], asked)).toEqual([typed]);
    expect(answersStillAsked([{ ...kept, question: "Gone?" }, kept], asked)).toEqual([kept]);
    expect(answersStillAsked([{ ...typed, question: "Gone?" }], asked)).toEqual([]);
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
    expect(parseDigQuestion(composeQuestion("Should we?", { ...EMPTY_GOAL, answers: [WHERE] }, CATALOG), CATALOG)).toBeNull();
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

describe("digQuestion's byte cap keeps what is dug whole (R2DIG-5)", () => {
  const bytes = (text: string) => new TextEncoder().encode(text).length;
  const ITEM = `Electricity prices for households ${"rise and fall with the gas market ".repeat(5)}every winter.`;

  it("a dig of a dig whose root is near the limit keeps the item text whole and cuts the carried root quote", () => {
    const root = `${"Ar trebui să ne mutăm în Cluj? ".repeat(260)}\n\nThis is about Romania.\nTime frame: the next 5 years.`;
    const first = digQuestion({ kind: "path", path: PATH }, root, CATALOG, "en");
    expect(bytes(first)).toBeLessThanOrEqual(askQuestionMaxBytes());
    const second = digQuestion({ kind: "open", questions: [open("STILL_ARGUED", ITEM, "p:1")] }, first, CATALOG, "en");
    expect(bytes(second)).toBeLessThanOrEqual(askQuestionMaxBytes());
    expect(second.startsWith(`Does this hold up, and when? ${ITEM}\n\n`)).toBe(true);
    // Its own context line names dig 1 whole; the root's quote inside the carried line is cut, and the root's
    // place and time lines are still carried.
    const lines = addedLines(second);
    expect(lines[0]).toBe("This follows from an earlier question: “Look deeper into this part of the answer: Nuclear power keeps the grid steady.”");
    expect(lines[1]?.endsWith("…”")).toBe(true);
    expect(Array.from(parseDigDetail(second, CATALOG)?.carried[0] ?? "").length).toBeLessThan(ROOT_QUESTION_KEEP + 60);
    expect(lines.slice(2)).toEqual(["This is about Romania.", "Time frame: the next 5 years."]);
  });

  it("drops carried lines before it cuts an item", () => {
    const parent = `Q?\n\n${Array.from({ length: 30 }, (_, index) => `Line ${index} ${"x".repeat(300)}`).join("\n")}`;
    const text = digQuestion({ kind: "open", questions: [open("OBJECTION", ITEM, "o:0")] }, parent, CATALOG, "en");
    expect(bytes(text)).toBeLessThanOrEqual(askQuestionMaxBytes());
    expect(text).toContain(ITEM);
    expect(text).toContain("Line 0 ");
    expect(text).not.toContain("Line 29 ");
  });

  it("cuts items only last, and never below the floor", () => {
    const huge = "ă".repeat(5000);
    const text = digQuestion({ kind: "open", questions: [open("STILL_ARGUED", huge, "p:1"), open("OBJECTION", "Short one.", "o:0")] },
      `Q?\n\n${"Line\n".repeat(50)}`, CATALOG, "en");
    expect(bytes(text)).toBeLessThanOrEqual(askQuestionMaxBytes());
    expect(text).toContain("2. How strong is this objection, and does it change the answer? Short one.");
    expect(text).not.toContain("\nLine");
    const kept = /when\? (ă+)…/u.exec(text)?.[1] ?? "";
    expect(kept.length).toBeGreaterThanOrEqual(DIG_ITEM_FLOOR);
  });
});

describe("digQuestion off English carries no English (R2DIG-9)", () => {
  it("turns English context lines into quotes and drops the English D2 sentences", () => {
    const englishDig = digQuestion({ kind: "open", questions: [open("STILL_ARGUED", "Costs fall.", "p:1")] },
      "Should we?\n\nThis is about Romania.\nTime frame: the next 5 years.\nPlease also look at: jobs.", CATALOG, "en");
    const text = digQuestion({ kind: "open", questions: [open("OBJECTION", "Deșeurile.", "o:0")] }, englishDig, CATALOG, "ro");
    expect(text).toBe("Deșeurile.\n\n“Does this hold up, and when? Costs fall.”\n“Should we?”");
    expect(parseDigQuestion(text, CATALOG)?.parentQuestion).toBe("Does this hold up, and when? Costs fall.");
  });

  it("keeps lines already in the quoted form", () => {
    const roDig = digQuestion({ kind: "open", questions: [open("OBJECTION", "A.", "o:0")] }, "Întrebare?", CATALOG, "ro");
    expect(digQuestion({ kind: "open", questions: [open("OBJECTION", "B.", "o:0")] }, roDig, CATALOG, "ro"))
      .toBe("B.\n\n“A.”\n“Întrebare?”");
  });

  it("decision 2: an old debate's English angle line is dropped from a Romanian dig, with no catalogue key left for it", () => {
    expect(RETIRED_ANGLES_SENTENCE_EN).toBe("Please also look at: {list}.");
    expect(digQuestion({ kind: "open", questions: [open("STILL_ARGUED", "Cheaper storage")] }, "Q?\n\nPlease also look at: jobs; waste.", CATALOG, "ro"))
      .toBe("Cheaper storage\n\n“Q?”");
  });
});

describe("matching cut texts (R2DIG-8)", () => {
  it("a question that really ends in … matches only itself as a parent", () => {
    expect(sameParentText("Should I quit my job…", "Should I quit my job…")).toBe(true);
    expect(sameParentText("Should I quit my job…", "Should I quit my job to study law?")).toBe(false);
    expect(sameParentText(" Should  I quit ", "Should I quit")).toBe(true);
  });

  it("a parent cut by digQuestion (at least 160 characters kept) matches the text it was cut from", () => {
    const full = "word ".repeat(100).trim();
    const shown = `${Array.from(full).slice(0, ROOT_QUESTION_KEEP).join("").trimEnd()}…`;
    expect(sameParentText(shown, full)).toBe(true);
    expect(sameParentText(`${full.slice(0, 100)}…`, full)).toBe(false);
    expect(sameParentText(shown, shown.slice(0, -1))).toBe(false);
  });

  it("an item matches a cut only when at least 80 characters were kept", () => {
    const full = "x".repeat(200);
    expect(sameItemText(`${"x".repeat(DIG_ITEM_FLOOR)}…`, full)).toBe(true);
    expect(sameItemText(`${"x".repeat(20)}…`, full)).toBe(false);
    expect(sameItemText("Short…", "Short… really")).toBe(false);
    expect(sameItemText("Same text.", " Same  text. ")).toBe(true);
  });

  it("sameQuestionText still matches any cut of a strictly longer text", () => {
    expect(sameQuestionText("Should…", "Should we?")).toBe(true);
    expect(sameQuestionText("Should we?…", "Should we?")).toBe(false);
    expect(sameQuestionText("", "x")).toBe(false);
  });
});

describe("parseDigDetail and carriedMatch (R2DIG-1, R2DIG-4)", () => {
  const PARENT = "Should we?\n\nThis is about Romania.\nTime frame: the next 5 years.";

  it("reads each item's kind (English only), the carried lines and the form", () => {
    const text = digQuestion({ kind: "open", questions: [open("WOULD_CHANGE", "Gas.", "w"), open("OBJECTION", "Waste.", "o:0")] },
      PARENT, CATALOG, "en");
    expect(parseDigDetail(text, CATALOG)).toEqual({
      parentQuestion: "Should we?",
      items: ["Gas.", "Waste."],
      kinds: ["WOULD_CHANGE", "OBJECTION"],
      carried: ["This is about Romania.", "Time frame: the next 5 years."],
      english: true
    });
    expect(parseDigDetail(digQuestion({ kind: "path", path: PATH }, PARENT, CATALOG, "en"), CATALOG)?.kinds).toEqual(["PATH"]);
    const ro = parseDigDetail(digQuestion({ kind: "open", questions: [open("WOULD_CHANGE", "Gaz.", "w")] }, PARENT, CATALOG, "ro"), CATALOG);
    expect(ro).toEqual({ parentQuestion: "Should we?", items: ["Gaz."], kinds: [null], carried: [], english: false });
    expect(parseDigDetail("Should we?", CATALOG)).toBeNull();
  });

  it("tells a candidate whose added lines were carried whole, carried in part, or not at all", () => {
    const dig = parseDigDetail(digQuestion({ kind: "path", path: PATH }, PARENT, CATALOG, "en"), CATALOG)!;
    expect(carriedMatch(dig, PARENT, CATALOG)).toBe("EQUAL");
    expect(carriedMatch(dig, `${PARENT}\nI am writing about it.`, CATALOG)).toBe("LEADS");
    expect(carriedMatch(dig, "Should we?\n\nThis is about the European Union as a whole.", CATALOG)).toBe("NONE");
    expect(carriedMatch(dig, "Should we?", CATALOG)).toBe("NONE");
    // Off English the candidate's lines are mapped the way the dig carried them (its English sentences dropped).
    const ro = parseDigDetail(digQuestion({ kind: "path", path: PATH }, PARENT, CATALOG, "ro"), CATALOG)!;
    expect(carriedMatch(ro, PARENT, CATALOG)).toBe("EQUAL");
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

describe("decisions 5 and 29: the goal goes as its own field too", () => {
  it("none set: none sent", () => {
    expect(purposeLinesOfGoal(EMPTY_GOAL)).toBeUndefined();
    expect(purposeLinesOfGoal({ ...EMPTY_GOAL, answers: [{ question: "Where?", answer: "  ", other: true }], matters: " " })).toBeUndefined();
  });
  it("the answers as asked and answered and what matters in the person's words, within the contract's length (decision 2: no angles)", () => {
    expect(purposeLinesOfGoal({ answers: [WHERE, { question: "What for?", answer: " My \n own ", other: true }], matters: " cost " }))
      .toEqual({ answers: [{ question: "Where?", answer: "Bucharest" }, { question: "What for?", answer: "My own" }], matters: "cost" });
    const long = purposeLinesOfGoal({ ...EMPTY_GOAL, answers: [{ question: "Where?", answer: "x".repeat(900), other: true }] })!;
    expect(long.answers![0]!.answer).toHaveLength(WEB_CONTRACT_LIMITS.purposeLineMaxChars);
    expect(PurposeLinesSchema.safeParse(long).success).toBe(true);
  });
  // V4 start step, Task 50b (owner answer Q4; "Goal in answer": "Always say it"): the answer to "What do you care about most?",
  // offered or typed, goes marked, so the run knows the person stated a goal without reading the words.
  it("an answer to a care question the page was given goes marked `cares: true`; every other answer, and a goal sent without the list, as before", () => {
    const CARES = "What do you care about most?";
    const goal = { answers: [WHERE, { question: CARES, answer: "Keeping bills low", other: false }], matters: "" };
    const marked = purposeLinesOfGoal(goal, [CARES])!;
    expect(marked).toEqual({ answers: [{ question: "Where?", answer: "Bucharest" }, { question: CARES, answer: "Keeping bills low", cares: true }] });
    expect(PurposeLinesSchema.safeParse(marked).success).toBe(true);
    expect(purposeLinesOfGoal({ ...goal, answers: [{ question: CARES, answer: " Lower \n bills ", other: true }] }, [CARES]))
      .toEqual({ answers: [{ question: CARES, answer: "Lower bills", cares: true }] });
    expect(purposeLinesOfGoal(goal)).toEqual({ answers: [{ question: "Where?", answer: "Bucharest" }, { question: CARES, answer: "Keeping bills low" }] });
    expect(purposeLinesOfGoal(goal, [])).toEqual(purposeLinesOfGoal(goal));
  });
});
