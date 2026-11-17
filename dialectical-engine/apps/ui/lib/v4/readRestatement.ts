import { WEB_CONTRACT_LIMITS, type AskClarifyResponse, type ClarifyQuestion, type ClarifyRestatement, type PurposeAnswer, type PurposeLines } from "@debateai/contract";
import { answerCounts } from "./askText.js";
import type { V4Goal } from "./types.js";

/*
 * Design Document v2 (16b), "How we read your question": the clarifying reply may say the question back in one sentence
 * (`restatement`). Some stretches of it stand for a clarifying question's answer. While the person has given that question no real
 * answer, the stretch shows the words of the answer the AI assumed; once they have, it shows their answer's words (the AI's phrase
 * for an offered answer, or the words they typed under "Other…"). The question box and the person's own answers are sent as
 * before. An assumption the person left unchanged binds the investigation too (owner answer of 17 Nov 2026): at Start, while the
 * sentence is on screen, it goes with the answers, marked `assumed` (`assumedAnswersOf`, `withAssumedAnswers`); the question's
 * own words never say it. Nothing here is kept in the browser.
 */

/** Which question a stretch stands for: its place among the reply's own questions, or the purpose or the care question. */
export type ReadAbout = number | "purpose" | "cares";

/** One stretch of the sentence: plain words, or the words standing for one question's answer. */
export type ReadPart =
  | Readonly<{ kind: "TEXT"; text: string }>
  | Readonly<{
    kind: "ANSWER";
    about: ReadAbout;
    /** The clarifying question's words (the page's answers go by them). */
    question: string;
    /** The answer the AI assumed, as the question offers it. */
    assumedAnswer: string;
    /** What the sentence says here. */
    words: string;
    /** The person's own choice (true), or the AI's assumption (false). */
    chosen: boolean;
    /** The words are the person's own, typed under "Other…" (never AI text). */
    typed: boolean;
  }>;

type AiReply = Extract<AskClarifyResponse, { source: "AI" }>;

/** One line: runs of spaces and line breaks become one space. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The sentence of a reply, when it has one. */
export function restatementOf(reply: AskClarifyResponse | null): ClarifyRestatement | null {
  return reply !== null && reply.source === "AI" ? reply.restatement ?? null : null;
}

function questionOf(reply: AiReply, about: ReadAbout): ClarifyQuestion | undefined {
  return about === "purpose" ? reply.purpose : about === "cares" ? reply.cares : reply.questions[about];
}

/**
 * The sentence's stretches as the page shows them now. An answer counts only once it says something (an "Other…" with nothing typed
 * says nothing, so the assumption still shows). An offered answer shows the AI's phrase for it; an answer the reply does not offer
 * (one the page added, such as the site's country) shows its own words. A stretch whose question the reply does not hold, or whose
 * phrases do not match its answers (the contract refuses both), is left out.
 */
export function readParts(reply: AiReply, goal: V4Goal): readonly ReadPart[] {
  const parts: ReadPart[] = [];
  for (const part of reply.restatement?.parts ?? []) {
    if (!("about" in part)) {
      parts.push({ kind: "TEXT", text: part.text });
      continue;
    }
    const question = questionOf(reply, part.about);
    const assumedAnswer = question?.answers[part.assumed];
    const assumedWords = part.phrases[part.assumed];
    if (question === undefined || assumedAnswer === undefined || assumedWords === undefined) continue;
    const given = goal.answers.find((one) => one.question === question.text);
    const common = { kind: "ANSWER" as const, about: part.about, question: question.text, assumedAnswer };
    if (given === undefined || !answerCounts(given)) {
      parts.push({ ...common, words: assumedWords, chosen: false, typed: false });
    } else if (given.other) {
      parts.push({ ...common, words: oneLine(given.answer), chosen: true, typed: true });
    } else {
      const phrase = part.phrases[question.answers.indexOf(given.answer)];
      parts.push({ ...common, words: phrase ?? oneLine(given.answer), chosen: true, typed: false });
    }
  }
  return Object.freeze(parts);
}

/**
 * The assumptions the sentence shows now, as answers Start sends: one for each stretch still showing the AI's assumed answer (the
 * person gave its question no answer that says something), marked `assumed`, in the sentence's order. Never marked `cares`: an
 * assumed care is not a goal the person stated.
 */
export function assumedAnswersOf(parts: readonly ReadPart[]): readonly PurposeAnswer[] {
  const line = (text: string): string => oneLine(text).slice(0, WEB_CONTRACT_LIMITS.purposeLineMaxChars);
  const seen = new Set<string>();
  const assumed: PurposeAnswer[] = [];
  for (const part of parts) {
    if (part.kind !== "ANSWER" || part.chosen || seen.has(part.question)) continue;
    const question = line(part.question);
    const answer = line(part.assumedAnswer);
    if (question.length === 0 || answer.length === 0) continue;
    seen.add(part.question);
    assumed.push({ question, answer, assumed: true });
  }
  return Object.freeze(assumed);
}

/**
 * Start's lines with the unchanged assumptions after the person's own answers. `room` is how many more answers the ask may carry
 * (Free's cap on choices counts an assumption as it counts a choice; the contract's own room for answers always holds); the
 * assumptions past it are left out, the first in the sentence kept. The lines themselves when there is nothing to add.
 */
export function withAssumedAnswers(lines: PurposeLines | undefined, assumed: readonly PurposeAnswer[], room: number = Number.POSITIVE_INFINITY)
  : PurposeLines | undefined {
  const own = lines?.answers ?? [];
  const answered = new Set(own.map((answer) => answer.question));
  const fits = Math.max(0, Math.min(room, WEB_CONTRACT_LIMITS.clarifyQuestionsMax + 2 - own.length));
  const added = assumed.filter((answer) => !answered.has(answer.question)).slice(0, fits);
  return added.length === 0 ? lines : { ...lines, answers: [...own, ...added] };
}
