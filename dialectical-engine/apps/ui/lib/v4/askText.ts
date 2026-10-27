import { askQuestionMaxBytes } from "@debateai/contract";
import { t, type MessageCatalog } from "../i18n/translate.js";
import type { DigTarget, GoalHorizon, GoalPlace, GoalPurpose, OpenQuestionKind, V4Goal } from "./types.js";

/*
 * V4 initial (spec 2026-10-28, B2): what is SENT as question_line. The person's D2 choices travel as plain sentences in
 * the page's language, appended to their question, so nothing is hidden: the ask page shows this exact text before
 * Start. A dig is a follow-up question written the same way. Every sentence is a catalogue key; none is built here.
 */

/** The parts a person may add (D2), at most this many angles (spec: "max 5"). */
const ANGLES_MAX = 5;

const PLACE_KEYS: Readonly<Record<Exclude<GoalPlace, "OTHER">, string>> = Object.freeze({
  ANYWHERE: "v4.askText.place.ANYWHERE",
  ROMANIA: "v4.askText.place.ROMANIA",
  EU: "v4.askText.place.EU"
});
const HORIZON_KEYS: Readonly<Record<GoalHorizon, string>> = Object.freeze({
  NOW: "v4.askText.horizon.NOW",
  FIVE_YEARS: "v4.askText.horizon.FIVE_YEARS",
  TWENTY_FIVE_YEARS: "v4.askText.horizon.TWENTY_FIVE_YEARS",
  LONG_RUN: "v4.askText.horizon.LONG_RUN"
});
const PURPOSE_KEYS: Readonly<Record<GoalPurpose, string>> = Object.freeze({
  DECIDE: "v4.askText.purpose.DECIDE",
  UNDERSTAND: "v4.askText.purpose.UNDERSTAND",
  WRITE: "v4.askText.purpose.WRITE"
});
const DIG_KIND_KEYS: Readonly<Record<OpenQuestionKind, string>> = Object.freeze({
  STILL_ARGUED: "v4.digText.kind.STILL_ARGUED",
  OBJECTION: "v4.digText.kind.OBJECTION",
  WOULD_CHANGE: "v4.digText.kind.WOULD_CHANGE"
});

/** One line of the person's own words: runs of spaces and line breaks become one space. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The angles as sent: trimmed, empty ones dropped, repeats dropped (ignoring case), at most five. */
export function cleanAngles(angles: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const angle of angles) {
    const line = oneLine(angle);
    const key = line.toLocaleLowerCase();
    if (line.length === 0 || seen.has(key)) continue;
    seen.add(key);
    kept.push(line);
    if (kept.length === ANGLES_MAX) break;
  }
  return kept;
}

/** The sentences the D2 choices add, in the spec's order: place, time, purpose, what matters, angles. */
function goalSentences(goal: V4Goal, catalog: MessageCatalog): readonly string[] {
  const sentences: string[] = [];
  if (goal.place === "OTHER") {
    const place = oneLine(goal.placeOther);
    if (place.length > 0) sentences.push(t(catalog, "v4.askText.place.OTHER", { place }));
  } else if (goal.place !== null) {
    sentences.push(t(catalog, PLACE_KEYS[goal.place]));
  }
  if (goal.horizon !== null) sentences.push(t(catalog, HORIZON_KEYS[goal.horizon]));
  if (goal.purpose !== null) sentences.push(t(catalog, PURPOSE_KEYS[goal.purpose]));
  const matters = oneLine(goal.matters);
  if (matters.length > 0) sentences.push(t(catalog, "v4.askText.matters", { matters }));
  const angles = cleanAngles(goal.angles);
  if (angles.length > 0) sentences.push(t(catalog, "v4.askText.angles", { list: angles.join("; ") }));
  return sentences;
}

/**
 * The question as sent: the person's words, then (only when a part is set) a blank line and one sentence per part,
 * one per line. No part set: the trimmed question exactly.
 */
export function composeQuestion(question: string, goal: V4Goal, catalog: MessageCatalog): string {
  const asked = question.trim();
  const sentences = goalSentences(goal, catalog);
  return sentences.length === 0 ? asked : `${asked}\n\n${sentences.join("\n")}`;
}

/** The plain texts a dig starts from: the path's line, or each open question's text (the toast and the dig link). */
export function digTargetQuestions(target: DigTarget): readonly string[] {
  return target.kind === "path" ? [target.path.line] : target.questions.map((question) => question.text);
}

type DigItem = Readonly<{ key: string; text: string }>;

function digItems(target: DigTarget): readonly DigItem[] {
  if (target.kind === "path") return [{ key: "v4.digText.path", text: target.path.line.trim() }];
  return target.questions.map((question) => ({ key: DIG_KIND_KEYS[question.kind], text: question.text.trim() }));
}

const ELLIPSIS = "…";

/** At most `max` characters (whole code points, so no emoji is split), with "…" when cut. */
function cut(text: string, max: number): string {
  const points = Array.from(text);
  if (points.length <= max) return text;
  return `${points.slice(0, Math.max(0, max)).join("").trimEnd()}${ELLIPSIS}`;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function writeDig(items: readonly DigItem[], rootQuestion: string, catalog: MessageCatalog,
  questionMax: number, itemMax: number): string {
  const lines = items.map((item) => t(catalog, item.key, { line: cut(item.text, itemMax), text: cut(item.text, itemMax) }));
  const body = lines.length <= 1
    ? (lines[0] ?? "")
    : [t(catalog, "v4.digText.together"), ...lines.map((line, index) => `${index + 1}. ${line}`)].join("\n");
  if (rootQuestion.length === 0) return body;
  const context = t(catalog, "v4.digText.context", { question: cut(rootQuestion, questionMax) });
  return body.length === 0 ? context : `${body}\n\n${context}`;
}

/** The largest value in [low, high] for which `fits` holds (fits is monotone: true up to some point), or null. */
function largestFitting(low: number, high: number, fits: (value: number) => boolean): number | null {
  if (high < low || !fits(low)) return null;
  let best = low;
  let top = high;
  while (best < top) {
    const middle = Math.ceil((best + top) / 2);
    if (fits(middle)) best = middle;
    else top = middle - 1;
  }
  return best;
}

/** The earlier question keeps at least this many characters before the items themselves are shortened. */
const ROOT_QUESTION_KEEP = 160;

/**
 * A dig's question_line: what to look into (the path's line, or one or several open questions, each asked by its kind),
 * then a blank line and the earlier question it follows from. It always fits the API's question limit
 * (askQuestionMaxBytes, checked in UTF-8 bytes by POST /v1/asks): the earlier question is shortened first, then the
 * item texts, each with "…".
 */
export function digQuestion(target: DigTarget, rootQuestion: string, catalog: MessageCatalog): string {
  const items = digItems(target);
  const root = rootQuestion.trim();
  const limit = askQuestionMaxBytes();
  const fits = (questionMax: number, itemMax: number) => byteLength(writeDig(items, root, catalog, questionMax, itemMax)) <= limit;
  const rootLength = Array.from(root).length;
  const itemLength = Math.max(0, ...items.map((item) => Array.from(item.text).length));
  if (fits(rootLength, itemLength)) return writeDig(items, root, catalog, rootLength, itemLength);
  const keep = Math.min(rootLength, ROOT_QUESTION_KEEP);
  const questionMax = largestFitting(keep, rootLength, (value) => fits(value, itemLength));
  if (questionMax !== null) return writeDig(items, root, catalog, questionMax, itemLength);
  const itemMax = largestFitting(1, itemLength, (value) => fits(keep, value));
  if (itemMax !== null) return writeDig(items, root, catalog, keep, itemMax);
  // Only a catalogue line itself longer than the limit gets here: send the first bytes rather than a refused ask.
  const whole = writeDig(items, root, catalog, keep, 1);
  let end = Array.from(whole).length;
  while (end > 0 && byteLength(cut(whole, end)) > limit) end = Math.floor(end * 0.9);
  return cut(whole, end);
}
