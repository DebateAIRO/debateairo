// tests/unit/purpose-assumed-answers.test.ts
// Design Document v2 (16b; owner answer of 17 Nov 2026: "apply them"): an assumption the person left unchanged on step 2 binds the
// investigation. The page sends it at Start as an answer marked `assumed`; the question's own words never say it, so the server
// reads it as a line of its own, where the person's answers count as said. An assumed answer is never a stated goal. Every text
// is made up.
import { describe, expect, it } from "vitest";
import {
  PurposeAnswerSchema, PurposeLinesSchema, StartMergeRequestSchema, WEB_CONTRACT_LIMITS, purposeLinesMaterial, purposeLinesUnsaid,
  questionWithPurposeLines, type PurposeAnswer, type PurposeLines
} from "@debateai/contract";
import { startQuestionCheckText } from "../../apps/api/src/start-paths-at-ask.js";
import { pathsGoalStated } from "../../apps/runner/src/paths-main-answer.js";
import { assumedAnswersOf, withAssumedAnswers, type ReadPart } from "../../apps/ui/lib/v4/readRestatement.js";

const Q = "Should the town keep its old power plant open?";
const NORTH: PurposeAnswer = { question: "Which region?", answer: "The north" };
const SOON: PurposeAnswer = { question: "Which years?", answer: "Soon", assumed: true };
const BILLS: PurposeAnswer = { question: "What do you care about most?", answer: "Keeping bills low", assumed: true };
/** The question as the page sends it with the person's one answer written into it. */
const LINE = `${Q}\n\nI mean the north of the country.`;
const LINES: PurposeLines = { answers: [NORTH, SOON, BILLS] };

describe("the contract: an answer marked as assumed", () => {
  it("parses with the mark, and without it as before", () => {
    expect(PurposeAnswerSchema.parse(SOON)).toEqual(SOON);
    expect(PurposeAnswerSchema.parse(NORTH)).toEqual(NORTH);
    expect(PurposeLinesSchema.parse(LINES)).toEqual(LINES);
    expect(PurposeLinesSchema.parse({ answers: [{ question: "What do you care about most?", answer: "Keeping bills low", cares: true }] }))
      .toEqual({ answers: [{ question: "What do you care about most?", answer: "Keeping bills low", cares: true }] });
  });

  it("the mark is `true` or absent, and an assumed answer is never a stated goal", () => {
    expect(PurposeAnswerSchema.safeParse({ ...NORTH, assumed: false }).success).toBe(false);
    const both = PurposeAnswerSchema.safeParse({ ...BILLS, cares: true });
    expect(both.success).toBe(false);
    expect(both.success ? [] : both.error.issues.map((issue) => issue.message)).toEqual(["an assumed answer is not a stated goal"]);
    expect(PurposeAnswerSchema.safeParse({ ...NORTH, guessed: true }).success).toBe(false);
  });

  it("the room for answers is the same: as many as the page can ask questions", () => {
    const many = Array.from({ length: WEB_CONTRACT_LIMITS.clarifyQuestionsMax + 3 }, (_, at) => ({ question: `Q${at}?`, answer: "A", assumed: true as const }));
    expect(PurposeLinesSchema.safeParse({ answers: many.slice(0, -1) }).success).toBe(true);
    expect(PurposeLinesSchema.safeParse({ answers: many }).success).toBe(false);
  });

  it("the merge's answers take the mark too (the same answer shape)", () => {
    expect(StartMergeRequestSchema.shape.clarify.safeParse({ answers: [NORTH, SOON] }).success).toBe(true);
  });
});

describe("the server's reading: the person's answers count as said, an assumed answer is a line of its own", () => {
  it("with `answersSaid`, only the assumed answers are read beside the question, in their order", () => {
    expect(purposeLinesUnsaid(LINE, LINES, { answersSaid: true })).toEqual(["Which years? Soon.", "What do you care about most? Keeping bills low."]);
    expect(questionWithPurposeLines(LINE, LINES, { answersSaid: true }))
      .toBe(`${LINE}\n\nWhich years? Soon.\nWhat do you care about most? Keeping bills low.`);
  });

  it("lines with no assumed answer read exactly as before", () => {
    expect(purposeLinesUnsaid(LINE, { answers: [NORTH] }, { answersSaid: true })).toEqual([]);
    expect(questionWithPurposeLines(LINE, { answers: [NORTH], matters: "Jobs in the town" }, { answersSaid: true })).toBe(`${LINE}\n\nJobs in the town`);
    expect(purposeLinesUnsaid(Q, { answers: [NORTH] })).toEqual(["Which region? The north."]);
  });

  it("an assumed answer the question already says in its own words is not read twice", () => {
    expect(purposeLinesUnsaid(`${Q} Which years? Soon.`, { answers: [SOON] }, { answersSaid: true })).toEqual([]);
  });

  it("without `answersSaid` (an older page, a report's material) every answer the question does not say is read, the assumed among them", () => {
    expect(purposeLinesUnsaid(LINE, LINES)).toEqual(["Which region? The north.", "Which years? Soon.", "What do you care about most? Keeping bills low."]);
    expect(purposeLinesMaterial(LINE, { answers: [SOON] })).toEqual({ place: null, time: null, purpose: "Which years? Soon." });
  });

  it("Start's one question check reads the assumed answers: alone on an unchanged question, after the whole line on a changed one", () => {
    const input = { questionLine: Q, ownWords: [] as string[], startCheckVerified: true };
    expect(startQuestionCheckText({ ...input, purposeLines: { answers: [SOON] }, questionEdited: false })).toBe("Which years? Soon.");
    expect(startQuestionCheckText({ ...input, questionLine: LINE, purposeLines: LINES, questionEdited: true }))
      .toBe(`${LINE}\n\nWhich years? Soon.\nWhat do you care about most? Keeping bills low.`);
    // The person's answers alone, as before: nothing new to check on an unchanged question.
    expect(startQuestionCheckText({ ...input, purposeLines: { answers: [NORTH] }, questionEdited: false })).toBeNull();
  });

  it("an assumed care is not a goal the person stated", () => {
    expect(pathsGoalStated({ answers: [BILLS] })).toBe(false);
    expect(pathsGoalStated({ answers: [{ question: "What do you care about most?", answer: "Keeping bills low", cares: true }] })).toBe(true);
  });
});

describe("the page: which assumptions Start sends", () => {
  const slot = (question: string, assumedAnswer: string, chosen: boolean): ReadPart =>
    ({ kind: "ANSWER", about: 0, question, assumedAnswer, words: assumedAnswer.toLowerCase(), chosen, typed: false });
  const PARTS: readonly ReadPart[] = [
    { kind: "TEXT", text: "You want to know about " }, slot("Which region?", "The south", true), { kind: "TEXT", text: ", " },
    slot("Which years?", "Soon", false), { kind: "TEXT", text: ", so that " }, slot("What do you care about most?", "Keeping bills low", false)
  ];

  it("one for each stretch still showing the AI's assumption, marked, in the sentence's order; none for a stretch the person chose", () => {
    expect(assumedAnswersOf(PARTS)).toEqual([SOON, BILLS]);
    expect(assumedAnswersOf([])).toEqual([]);
    expect(assumedAnswersOf(PARTS.map((part) => (part.kind === "ANSWER" ? { ...part, chosen: true } : part)))).toEqual([]);
  });

  it("cuts a long assumed answer to a line the contract takes, and never sends one question twice", () => {
    const long = "x".repeat(WEB_CONTRACT_LIMITS.purposeLineMaxChars + 40);
    const sent = assumedAnswersOf([slot("Which years?", long, false), slot("Which years?", "Later", false)]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.answer).toHaveLength(WEB_CONTRACT_LIMITS.purposeLineMaxChars);
    expect(PurposeAnswerSchema.safeParse(sent[0]).success).toBe(true);
  });

  it("go after the person's own answers; lines with nothing to add come back as they were", () => {
    const own: PurposeLines = { answers: [NORTH], matters: "Jobs in the town" };
    expect(withAssumedAnswers(own, [SOON, BILLS])).toEqual({ answers: [NORTH, SOON, BILLS], matters: "Jobs in the town" });
    expect(withAssumedAnswers(undefined, [SOON])).toEqual({ answers: [SOON] });
    expect(withAssumedAnswers(own, [])).toBe(own);
    expect(withAssumedAnswers(undefined, [])).toBeUndefined();
    // A question the person answered is theirs, whatever the list of assumptions says.
    expect(withAssumedAnswers(own, [{ question: "Which region?", answer: "The south", assumed: true }])).toBe(own);
  });

  it("keep within the room given (Free's cap) and within the contract's room for answers, the first in the sentence kept", () => {
    expect(withAssumedAnswers({ answers: [NORTH] }, [SOON, BILLS], 1)).toEqual({ answers: [NORTH, SOON] });
    expect(withAssumedAnswers({ answers: [NORTH] }, [SOON, BILLS], 0)).toEqual({ answers: [NORTH] });
    expect(withAssumedAnswers({ answers: [NORTH] }, [SOON, BILLS], -2)).toEqual({ answers: [NORTH] });
    const full = Array.from({ length: WEB_CONTRACT_LIMITS.clarifyQuestionsMax + 1 }, (_, at) => ({ question: `Q${at}?`, answer: "A" }));
    const sent = withAssumedAnswers({ answers: full }, [SOON, BILLS])!;
    expect(sent.answers).toHaveLength(WEB_CONTRACT_LIMITS.clarifyQuestionsMax + 2);
    expect(PurposeLinesSchema.safeParse(sent).success).toBe(true);
  });
});
