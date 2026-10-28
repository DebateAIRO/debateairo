import { askQuestionMaxBytes } from "@debateai/contract";
import { catalogLocale, isLocale } from "../i18n/locales.js";
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
  // ASK-6: the template ends the sentence itself, so one closing mark the person typed is not doubled ("waste..").
  if (angles.length > 0) sentences.push(t(catalog, "v4.askText.angles", { list: angles.join("; ").replace(/[.!?。]$/u, "") }));
  return sentences;
}

/** ASK-1: the English sentences go only with an English page (all 35 locales load the English v4 file tonight). */
function writesEnglish(locale: string): boolean {
  return isLocale(locale) && catalogLocale(locale) === "en";
}

/** The first blank line: what the person wrote comes before it, the added lines after it. */
const BLANK_LINE = /\n[^\S\n]*\n/;

/**
 * The person's own words in a question_line: the text before the first blank line, trimmed (the whole trimmed text when
 * there is none). Fix wave 1: every V4 title shows this, never the added sentences.
 */
export function ownWords(questionLine: string): string {
  const text = questionLine.trim();
  const at = text.search(BLANK_LINE);
  return at === -1 ? text : text.slice(0, at).trim();
}

/**
 * True when an AI sentence already opens with a page label ("How sure we are: …"), so the label is not printed twice.
 * Case and the label's closing colon or spaces are ignored.
 */
export function startsWithLabel(text: string, label: string): boolean {
  const stem = label.replace(/[\s:：]+$/u, "").toLocaleLowerCase();
  return stem.length > 0 && text.trim().toLocaleLowerCase().startsWith(stem);
}

/** The non-empty lines after the first blank line (the D2 sentences, or a dig's "follows from" chain), trimmed. */
export function addedLines(questionLine: string): readonly string[] {
  const text = questionLine.trim();
  const match = BLANK_LINE.exec(text);
  if (match === null) return [];
  return text.slice(match.index + match[0].length).split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

/**
 * The question as sent: the person's words, then (only when a part is set) a blank line and one sentence per part,
 * one per line. No part set: the trimmed question exactly. Off an English page (ASK-1) only the person's words are sent:
 * the sentences exist in English only, and would bring up the language pop-up and mix languages for the AIs. A blank
 * line inside the person's own words is closed up to one line break, so ownWords() always gets all of them back.
 */
export function composeQuestion(question: string, goal: V4Goal, catalog: MessageCatalog, locale: string): string {
  const asked = question.trim().replace(/\n\s*\n/g, "\n");
  if (!writesEnglish(locale)) return asked;
  const sentences = goalSentences(goal, catalog);
  return sentences.length === 0 ? asked : `${asked}\n\n${sentences.join("\n")}`;
}

/** The plain texts a dig starts from: the path's line, or each open question's text (the toast and the dig link). */
export function digTargetQuestions(target: DigTarget): readonly string[] {
  return target.kind === "path" ? [target.path.line] : target.questions.map((question) => question.text);
}

type DigItem = Readonly<{ key: string; text: string }>;

function digItems(target: DigTarget): readonly DigItem[] {
  if (target.kind === "path") return [{ key: "v4.digText.path", text: oneLine(target.path.line) }];
  return target.questions.map((question) => ({ key: DIG_KIND_KEYS[question.kind], text: oneLine(question.text) }));
}

const ELLIPSIS = "…";
/** Off English, the earlier question is named in these marks alone (no English framing, ASK-1). */
const QUOTE_OPEN = "“";
const QUOTE_CLOSE = "”";

/** The earlier question keeps at least this many characters (code points) when a dig is cut to fit the API's limit. */
export const ROOT_QUESTION_KEEP = 160;
/** R2DIG-5: a dig's own item text is never cut below this many characters (code points), or the whole item if shorter. */
export const DIG_ITEM_FLOOR = 80;

/** At most `max` characters (whole code points, so no emoji is split), with "…" when cut. */
function cut(text: string, max: number): string {
  const points = Array.from(text);
  if (points.length <= max) return text;
  return `${points.slice(0, Math.max(0, max)).join("").trimEnd()}${ELLIPSIS}`;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

type DigParts = Readonly<{
  items: readonly DigItem[];
  /** The parent's own words on one line. */
  parent: string;
  /** The parent's added lines, kept in order (its D2 sentences and its own "follows from" chain). */
  carried: readonly string[];
  english: boolean;
}>;

function writeDig(parts: DigParts, catalog: MessageCatalog, questionMax: number, itemMax: number,
  carried: readonly string[] = parts.carried): string {
  const texts = parts.items.map((item) => cut(item.text, itemMax));
  const lines = parts.english
    ? parts.items.map((item, index) => t(catalog, item.key, { line: texts[index] ?? "", text: texts[index] ?? "" }))
    : texts;
  const numbered = lines.map((line, index) => `${index + 1}. ${line}`);
  const body = lines.length <= 1
    ? (lines[0] ?? "")
    : (parts.english ? [t(catalog, "v4.digText.together"), ...numbered] : numbered).join("\n");
  if (parts.parent.length === 0) return body;
  const parent = cut(parts.parent, questionMax);
  const context = parts.english
    ? t(catalog, "v4.digText.context", { question: parent })
    : `${QUOTE_OPEN}${parent}${QUOTE_CLOSE}`;
  const tail = [context, ...carried].join("\n");
  return body.length === 0 ? tail : `${body}\n\n${tail}`;
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

/** The quoted earlier question when this whole line is the non-English context line (“…”), else null. */
function quotedLine(line: string): string | null {
  return line.length > QUOTE_OPEN.length + QUOTE_CLOSE.length && line.startsWith(QUOTE_OPEN) && line.endsWith(QUOTE_CLOSE)
    ? line.slice(QUOTE_OPEN.length, line.length - QUOTE_CLOSE.length).trim()
    : null;
}

/** The earlier question named by an English context line ("This follows from an earlier question: “…”"), else null. */
function englishContext(line: string, catalog: MessageCatalog): string | null {
  const match = templatePattern(t(catalog, "v4.digText.context"), "question").exec(line);
  const question = match?.[1]?.trim();
  return question === undefined || question.length === 0 ? null : question;
}

/** The earlier question a context line names, in either form (English or quoted), else null. */
function contextQuestion(line: string, catalog: MessageCatalog): string | null {
  return englishContext(line, catalog) ?? quotedLine(line);
}

/** The D2 sentence templates (English only tonight): a carried line matching one is an English catalogue sentence. */
const GOAL_SENTENCE_KEYS: readonly string[] = [
  ...Object.values(PLACE_KEYS),
  "v4.askText.place.OTHER",
  ...Object.values(HORIZON_KEYS),
  ...Object.values(PURPOSE_KEYS),
  "v4.askText.matters",
  "v4.askText.angles"
];

function isGoalSentence(line: string, catalog: MessageCatalog): boolean {
  return GOAL_SENTENCE_KEYS.some((key) => templatePattern(t(catalog, key), "").test(line));
}

/**
 * R2DIG-9: the parent's added lines as a dig sent off English carries them: an English context line becomes its quoted
 * form, an English D2 sentence is dropped, any other line (already quoted) is kept. No English catalogue text is sent.
 */
function offEnglishCarried(lines: readonly string[], catalog: MessageCatalog): readonly string[] {
  return lines.flatMap((line) => {
    const english = englishContext(line, catalog);
    if (english !== null) return [`${QUOTE_OPEN}${english}${QUOTE_CLOSE}`];
    return isGoalSentence(line, catalog) ? [] : [line];
  });
}

/** R2DIG-5 step 2: a carried context line with its quoted earlier question cut to ROOT_QUESTION_KEEP; other lines as they are. */
function shortenContext(line: string, catalog: MessageCatalog): string {
  const english = englishContext(line, catalog);
  if (english !== null) return t(catalog, "v4.digText.context", { question: cut(english, ROOT_QUESTION_KEEP) });
  const quoted = quotedLine(line);
  return quoted === null ? line : `${QUOTE_OPEN}${cut(quoted, ROOT_QUESTION_KEEP)}${QUOTE_CLOSE}`;
}

/**
 * A dig's question_line: what to look into (the path's line, or one or several open questions, each asked by its kind),
 * then a blank line, the line naming the earlier question in its own words, and the earlier question's added lines
 * (ASK-6: a dig keeps the person's country/time/purpose lines, and a dig of a dig keeps the chain, without nesting the
 * whole earlier text inside the quote). Off an English page (ASK-1): the item text(s) alone, numbered when several, then
 * the earlier question's own words in quotes, with no English framing; the carried lines lose their English too
 * (R2DIG-9). It always fits the API's question limit (askQuestionMaxBytes, UTF-8 bytes), shortening in this order
 * (R2DIG-5): the earlier question (down to ROOT_QUESTION_KEEP), then the earlier questions quoted inside the carried
 * context lines (to ROOT_QUESTION_KEEP), then the carried lines dropped from the end, and only then the item texts
 * (never below DIG_ITEM_FLOOR characters), so what the person digs into is the last thing cut.
 */
export function digQuestion(target: DigTarget, parentQuestionLine: string, catalog: MessageCatalog, locale: string): string {
  const english = writesEnglish(locale);
  const added = addedLines(parentQuestionLine);
  const parts: DigParts = {
    items: digItems(target),
    parent: oneLine(ownWords(parentQuestionLine)),
    carried: english ? added : offEnglishCarried(added, catalog),
    english
  };
  const limit = askQuestionMaxBytes();
  const parentLength = Array.from(parts.parent).length;
  const itemLength = Math.max(0, ...parts.items.map((item) => Array.from(item.text).length));
  const write = (questionMax: number, itemMax: number, carried: readonly string[]) =>
    writeDig(parts, catalog, questionMax, itemMax, carried);
  const fits = (questionMax: number, itemMax: number, carried: readonly string[]) =>
    byteLength(write(questionMax, itemMax, carried)) <= limit;
  if (fits(parentLength, itemLength, parts.carried)) return write(parentLength, itemLength, parts.carried);
  const keep = Math.min(parentLength, ROOT_QUESTION_KEEP);
  // The longest earlier question that fits with the items whole and these carried lines, or null.
  const withWholeItems = (carried: readonly string[]): string | null => {
    const questionMax = largestFitting(keep, parentLength, (value) => fits(value, itemLength, carried));
    return questionMax === null ? null : write(questionMax, itemLength, carried);
  };
  // (1) The earlier question is cut.
  const first = withWholeItems(parts.carried);
  if (first !== null) return first;
  // (2) The earlier questions quoted inside the carried context lines are cut.
  const shortened = parts.carried.map((line) => shortenContext(line, catalog));
  const second = withWholeItems(shortened);
  if (second !== null) return second;
  // (3) Carried lines are dropped from the end.
  for (let count = shortened.length - 1; count >= 0; count -= 1) {
    const third = withWholeItems(shortened.slice(0, count));
    if (third !== null) return third;
  }
  // (4) Only now the items themselves, never below the floor.
  const floor = Math.min(itemLength, DIG_ITEM_FLOOR);
  const itemMax = largestFitting(floor, itemLength, (value) => fits(keep, value, []));
  if (itemMax !== null) return write(keep, itemMax, []);
  // Only items far longer than the limit get here: send the first bytes rather than a refused ask.
  const whole = write(keep, floor, []);
  let end = Array.from(whole).length;
  while (end > 0 && byteLength(cut(whole, end)) > limit) end = Math.floor(end * 0.9);
  return cut(whole, end);
}

// ── Reading a dig back (fix wave 1, Decision A: digs are found again from the account's question list) ──────────────

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A whole-line pattern from a catalogue template: the named placeholder captures, any other placeholder matches anything. */
function templatePattern(template: string, capture: string): RegExp {
  const pieces = template.split(/(\{[A-Za-z][A-Za-z0-9_]*\})/);
  const source = pieces.map((piece) => {
    if (piece === `{${capture}}`) return "(.*)";
    if (/^\{[A-Za-z][A-Za-z0-9_]*\}$/.test(piece)) return ".*";
    return escapeRegExp(piece);
  }).join("");
  return new RegExp(`^${source}$`, "u");
}

/** What kind of line a dig item was written as (English only; null off English or when no template matches). */
export type DigItemKind = OpenQuestionKind | "PATH";

/** The item text inside one dig line: the kind/path template's {text}/{line}, or the line itself when none matches. */
function itemText(line: string, catalog: MessageCatalog): Readonly<{ text: string; kind: DigItemKind | null }> {
  const templates: ReadonlyArray<readonly [string, string, DigItemKind]> = [
    [t(catalog, "v4.digText.path"), "line", "PATH"],
    ...(Object.entries(DIG_KIND_KEYS) as Array<[OpenQuestionKind, string]>)
      .map(([kind, key]) => [t(catalog, key), "text", kind] as const)
  ];
  for (const [template, capture, kind] of templates) {
    const match = templatePattern(template, capture).exec(line);
    if (match?.[1] !== undefined) return { text: match[1].trim(), kind };
  }
  return { text: line, kind: null };
}

const NUMBERED = /^\d+\.\s+/;

/** Everything a dig's question_line says about where it came from (digIndex reads it to find the one parent). */
export type DigDetail = Readonly<{
  /** The earlier question's own words, as quoted (possibly cut with "…"). */
  parentQuestion: string;
  /** The item texts, framing and numbering taken off. */
  items: readonly string[];
  /** Per item: the template it was written with (English form only), else null. */
  kinds: readonly (DigItemKind | null)[];
  /** The earlier question's added lines the dig carried (after its own context line), possibly cut or shortened. */
  carried: readonly string[];
  /** true: the English form; false: the form sent off English (quoted context line). */
  english: boolean;
}>;

/**
 * parseDigQuestion with what digIndex needs to tell two earlier questions with the same words apart (R2DIG-1/R2REG-1)
 * and to place a "what would change it" item (R2DIG-4). null when the text is not a dig.
 */
export function parseDigDetail(questionLine: string, catalog: MessageCatalog): DigDetail | null {
  const added = addedLines(questionLine);
  // digQuestion always writes its own context line first after the blank line; later ones belong to earlier questions
  // (a dig of a dig), so only the first added line is read (a dig started off English from an English one stays right).
  const first = added[0];
  if (first === undefined) return null;
  const fromEnglish = englishContext(first, catalog);
  const english = fromEnglish !== null;
  const parentQuestion = fromEnglish ?? quotedLine(first);
  if (parentQuestion === null || parentQuestion.length === 0) return null;
  const together = t(catalog, "v4.digText.together").trim();
  const lines = ownWords(questionLine).split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const listed = lines.length > 1 || (english && lines[0] === together);
  const read = lines
    .filter((line, index) => !(english && index === 0 && line === together))
    .map((line) => (listed ? line.replace(NUMBERED, "") : line))
    .map((line) => (english ? itemText(line, catalog) : { text: line, kind: null }))
    .map((item) => ({ text: item.text.trim(), kind: item.kind }))
    .filter((item) => item.text.length > 0);
  return Object.freeze({
    parentQuestion,
    items: Object.freeze(read.map((item) => item.text)),
    kinds: Object.freeze(read.map((item) => item.kind)),
    carried: Object.freeze(added.slice(1)),
    english
  });
}

/**
 * The inverse of digQuestion: the earlier question's own words (from the FIRST context line, the first added line) and
 * the item texts (kind, path and "together" framing and "1. " numbering taken off, using the catalogue's templates).
 * null when the text is not a dig. Both forms are read: the English one, and the one sent off English (the first added
 * line in quotes).
 */
export function parseDigQuestion(questionLine: string, catalog: MessageCatalog):
  Readonly<{ parentQuestion: string; items: readonly string[] }> | null {
  const detail = parseDigDetail(questionLine, catalog);
  return detail === null ? null : Object.freeze({ parentQuestion: detail.parentQuestion, items: detail.items });
}

/**
 * Whether `shown` is `full`, once spaces are closed up, or `full` cut to fit the API's limit: "…" at the end, `full`
 * strictly longer, and at least `floor` characters of `full` kept (less only the spaces the cut trims). R2DIG-8: a
 * question that really ends in "…" is then not read as a cut of a longer one.
 */
function sameCutText(shown: string, full: string, floor: number): boolean {
  const a = oneLine(shown);
  const b = oneLine(full);
  if (a.length === 0 || b.length === 0) return false;
  if (a === b) return true;
  if (!a.endsWith(ELLIPSIS)) return false;
  const prefix = a.slice(0, -ELLIPSIS.length).trimEnd();
  if (prefix.length === 0 || prefix.length >= b.length || !b.startsWith(prefix)) return false;
  // Both are leading parts of b, so their lengths compare like their code point counts.
  const shortestCut = Array.from(b).slice(0, Math.max(1, floor)).join("").trimEnd();
  return prefix.length >= shortestCut.length;
}

/**
 * Whether two question texts are the same once spaces are closed up. A text cut to fit the API's limit ("…" at the end)
 * matches the longer text it was cut from.
 */
export function sameQuestionText(shown: string, full: string): boolean {
  return sameCutText(shown, full, 1);
}

/** R2DIG-8: an earlier question as a dig names it: exact, or cut but keeping at least ROOT_QUESTION_KEEP characters. */
export function sameParentText(shown: string, full: string): boolean {
  return sameCutText(shown, full, ROOT_QUESTION_KEEP);
}

/** R2DIG-8: a dig item and a map text: exact, or cut but keeping at least DIG_ITEM_FLOOR characters. */
export function sameItemText(shown: string, full: string): boolean {
  return sameCutText(shown, full, DIG_ITEM_FLOOR);
}

function sameCarriedLine(shown: string, full: string, catalog: MessageCatalog): boolean {
  const shownQuestion = contextQuestion(shown, catalog);
  const fullQuestion = contextQuestion(full, catalog);
  if (shownQuestion !== null && fullQuestion !== null) return sameParentText(shownQuestion, fullQuestion);
  return oneLine(shown) === oneLine(full);
}

/**
 * R2DIG-1 / R2REG-1: how the lines a dig carried compare with a candidate parent's added lines. "EQUAL": the same lines;
 * "LEADS": the dig's lines are the candidate's first ones (the byte cap drops carried lines only from the end); "NONE".
 * A context line cut for length still matches the line it was cut from; off English the candidate's lines are first
 * mapped the way a dig sent off English carries them (R2DIG-9).
 */
export function carriedMatch(dig: DigDetail, parentQuestionLine: string, catalog: MessageCatalog): "EQUAL" | "LEADS" | "NONE" {
  const added = addedLines(parentQuestionLine);
  const lines = dig.english ? added : offEnglishCarried(added, catalog);
  if (dig.carried.length > lines.length) return "NONE";
  for (const [index, shown] of dig.carried.entries()) {
    if (!sameCarriedLine(shown, lines[index] ?? "", catalog)) return "NONE";
  }
  return dig.carried.length === lines.length ? "EQUAL" : "LEADS";
}
