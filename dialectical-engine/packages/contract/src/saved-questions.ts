import { z } from "zod";
import { AccountReadingLevelSchema } from "./account-memory.js";
import { NamedLanguageSchema } from "./question-language.js";
import { START_STEP_LIMITS, START_STEP_NONE_REASONS, SignedStartListSchema, SignedStartMenuSchema, StartCheckSchema } from "./start-paths.js";
import { AskClarifyResponseSchema } from "./web.js";

/**
 * V4 start step, Task 39c (saved questions spec 2026-11-04 §3.2, §3.12, §3.14; owner answers S1-S4 A of 4 Nov): A QUESTION
 * NOT STARTED YET, on the wire. Once the question passes its check at Next, the account keeps step 2 in two halves: the
 * reading the server signed (strict; checked again at every save and at Pick up) and the page's own state (passthrough;
 * stored as sent and never relied on, typed only where the export, the screen and the crisis screen read it). A parse here
 * is a check, never the stored value: the server keeps, and Pick up answers, the JSON text the page sent, so nothing in the
 * page half is trimmed and the read answer's `doc` is never parsed. This file imports only zod and the contract's leaf
 * modules, never ./index.js, for the module-cycle reason account-memory.ts gives; so the box's limit is the literal of
 * askQuestionMaxBytes() (./index.js), and a unit test holds them equal.
 */
export const SAVED_QUESTION_LIMITS = Object.freeze({
  /** Questions an account keeps (S3 A), and how many the ask page lists before "Show all". */
  kept: 20, shown: 5,
  /** The list's title: the box's first line, in UTF-16 code units. */
  titleMaxChars: 300,
  /** The question box, in UTF-8 bytes: askQuestionMaxBytes(). */
  boxMaxBytes: 8_192,
  /** The reading half, in UTF-8 bytes of its JSON: the largest ask Start allows (START_STEP_LIMITS.askBodyMaxBytes). */
  readingMaxBytes: 393_216,
  /** The page half, in UTF-8 bytes of its JSON (the page drops its oldest Undo steps first to fit). */
  pageMaxBytes: 262_144,
  /** The whole document: the reading, the page and 1 KiB for the wrapper. */
  docMaxBytes: 656_384,
  /** The first and later saves' route body limit: the document and the request around it. */
  saveBodyMaxBytes: 720_896
} as const);

/** How the reading had ended when this copy was saved. LEFT_EARLY: not yet (every save before the list or a none carries it). */
export const SAVED_QUESTION_ENDS = Object.freeze(["READY", "NONE", "LEFT_EARLY"] as const);
export type SavedQuestionEnd = typeof SAVED_QUESTION_ENDS[number];
/** What Pick up finds: the reading still verifies under today's signing key and plan, or it must be read again (Back, then Next). */
export const SAVED_QUESTION_STATES = Object.freeze(["READY", "NEEDS_READING"] as const);
export type SavedQuestionState = typeof SAVED_QUESTION_STATES[number];
/** The saved-question routes' refusals (Task 39e). SAVED_QUESTIONS_UNAVAILABLE also answers a Delete whose key could not be destroyed. */
export const SAVED_QUESTION_REFUSALS = Object.freeze(["SAVED_QUESTION_INVALID", "SAVED_QUESTION_GONE", "SAVED_QUESTION_REVISION",
  "SAVED_QUESTION_TOO_LARGE", "SAVED_QUESTIONS_OFF", "SAVED_QUESTIONS_UNAVAILABLE", "SAVED_QUESTIONS_FULL"] as const);
export type SavedQuestionRefusal = typeof SAVED_QUESTION_REFUSALS[number];

const L = START_STEP_LIMITS;
const S = SAVED_QUESTION_LIMITS;

/**
 * A saved question's id: a uuid in lowercase, as the API makes it (randomUUID). PostgreSQL compares uuids without case but the
 * question-key store compares ids as written, so an id in capitals would find the record and not its key (Task 39d's review).
 */
export const SavedQuestionIdSchema = z.uuid().refine((id) => id === id.toLowerCase(), { message: "a saved question's id is lowercase" });

/** The half the server signed at Next: the line the AIs read, the proof it passed its check, the lists and how the reading ended. */
export const SavedQuestionReadingSchema = z.object({
  read_line: z.string().min(1).max(S.boxMaxBytes).refine((line) => line.trim() !== "", { message: "the read line holds words" }),
  reading_level: AccountReadingLevelSchema,
  check: StartCheckSchema,
  /** The lists stream's check event: the question's language and the list writers' seats. */
  language: NamedLanguageSchema.optional(),
  seats: z.number().int().min(1).max(L.listsMax).optional(),
  /** Step 2's clarifying questions as they were shown, so Pick up shows them without a call. */
  clarify: AskClarifyResponseSchema.nullable(),
  menu: SignedStartMenuSchema.nullable(),
  /** The lists not merged into the menu yet. */
  late_lists: z.array(SignedStartListSchema).max(L.lateListsMax),
  end: z.enum(SAVED_QUESTION_ENDS),
  none_reason: z.enum(START_STEP_NONE_REASONS).optional()
}).strict();

/**
 * The page's own state. Its strings are plain z.string() with their caps, never trimmed: a combined question and its signed
 * reference come back character for character. A chip's question may be the person's own words (ownTextMaxChars) or a
 * dig pick's question (pathQuestionMaxChars); a sentence or an answer of the box is bounded by the box.
 */
const PageViewpointSchema = z.object({
  source: z.object({ kind: z.enum(["MENU", "PICK", "OWN"]) }).passthrough(),
  question: z.string().max(Math.max(L.ownTextMaxChars, L.pathQuestionMaxChars))
}).passthrough();
const PagePathSchema = z.object({
  title: z.string().max(L.pathTitleMaxChars),
  question: z.string().max(L.pathQuestionMaxChars),
  /** Who wrote the words: the menu's AI, the AI combine, the person, a combine still being written, or the joined fallback. */
  wording: z.enum(["AI", "COMBINED", "PERSON", "WRITING", "FALLBACK"]),
  viewpoints: z.array(PageViewpointSchema)
}).passthrough();
const PagePlanStepSchema = z.object({
  paths: z.array(PagePathSchema).max(L.storedPathsMax),
  more: z.array(PagePathSchema).max(L.menuPathsMax)
}).passthrough();
const PageSentenceSchema = z.string().max(S.boxMaxBytes);

export const SavedQuestionPageSchema = z.object({
  /** The question box: its text (at most boxMaxBytes of UTF-8, which savedQuestionDocFits checks) and the sentences placed in it. */
  box: z.object({
    text: z.string().max(S.boxMaxBytes),
    placed: z.array(z.object({ key: PageSentenceSchema, text: PageSentenceSchema }).passthrough())
  }).passthrough(),
  /** The answers picked or typed ("Other…": `other`). */
  sent_goal: z.object({
    answers: z.array(z.object({ question: PageSentenceSchema, answer: PageSentenceSchema, other: z.boolean() }).passthrough())
  }).passthrough(),
  /** The path plan with its Undo steps (each step the list and "+ N more" as they were). */
  plan: PagePlanStepSchema.extend({ undo: z.array(PagePlanStepSchema) }).passthrough(),
  width: z.number().int().min(1).max(L.pathsMax),
  /** Quick look or Thorough. */
  mode: z.enum(["quick", "thorough"]),
  carry_on: z.boolean()
}).passthrough();

export const SavedQuestionDocSchema = z.object({
  v: z.literal(1),
  reading: SavedQuestionReadingSchema,
  page: SavedQuestionPageSchema
}).strict();
/** The document as received: a parse is a check, never the stored value. */
export type SavedQuestionDoc = z.input<typeof SavedQuestionDocSchema>;

/** POST /v1/account/saved-questions: the first save. */
export const SavedQuestionCreateSchema = z.object({ doc: SavedQuestionDocSchema }).strict();
export type SavedQuestionCreate = z.infer<typeof SavedQuestionCreateSchema>;
/** PUT /v1/account/saved-questions/{id}: a later save, over the revision the page last had. */
export const SavedQuestionSaveSchema = z.object({ revision: z.number().int().min(1), doc: SavedQuestionDocSchema }).strict();
export type SavedQuestionSave = z.infer<typeof SavedQuestionSaveSchema>;

/** One line of "Not started yet": the question's title and the day it was saved. */
export const SavedQuestionSummarySchema = z.object({
  id: SavedQuestionIdSchema,
  question: z.string().max(S.titleMaxChars),
  saved_at: z.iso.datetime()
}).strict();
export type SavedQuestionSummary = z.infer<typeof SavedQuestionSummarySchema>;
/** GET /v1/account/saved-questions: newest first. */
export const SavedQuestionListSchema = z.object({ questions: z.array(SavedQuestionSummarySchema).max(S.kept) }).strict();
export type SavedQuestionList = z.infer<typeof SavedQuestionListSchema>;
/** GET /v1/account/saved-questions/{id} (Pick up): the stored document raw; the page checks it with SavedQuestionDocSchema.safeParse. */
export const SavedQuestionReadSchema = z.object({
  id: SavedQuestionIdSchema,
  revision: z.number().int().min(1),
  saved_at: z.iso.datetime(),
  state: z.enum(SAVED_QUESTION_STATES),
  doc: z.unknown()
}).strict();
export type SavedQuestionRead = z.infer<typeof SavedQuestionReadSchema>;
/** What a first or later save answers. */
export const SavedQuestionWrittenSchema = z.object({ id: SavedQuestionIdSchema, revision: z.number().int().min(1) }).strict();
export type SavedQuestionWritten = z.infer<typeof SavedQuestionWrittenSchema>;

const UTF8 = new TextEncoder();
const utf8Bytes = (text: string): number => UTF8.encode(text).length;
const LINE_BREAK = /\r\n|[\n\r]/u;

/** The UTF-8 bytes of `value`'s JSON text. */
export function savedQuestionPartBytes(value: unknown): number {
  return utf8Bytes(JSON.stringify(value) ?? "");
}

/** Whether a document fits: the reading, the page, the box and the whole document each within its limit. */
export function savedQuestionDocFits(doc: SavedQuestionDoc): "FITS" | "TOO_LARGE" {
  const fits = utf8Bytes(doc.page.box.text) <= S.boxMaxBytes
    && savedQuestionPartBytes(doc.reading) <= S.readingMaxBytes
    && savedQuestionPartBytes(doc.page) <= S.pageMaxBytes
    && savedQuestionPartBytes(doc) <= S.docMaxBytes;
  return fits ? "FITS" : "TOO_LARGE";
}

/** `text` cut to at most `max` UTF-16 code units, never inside a surrogate pair. */
function cutAtCodePoint(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

/** The list's title: the box's first line that holds words, else the read line; trimmed; cut to titleMaxChars at a code-point edge. */
export function savedQuestionTitleOf(doc: SavedQuestionDoc): string {
  const line = doc.page.box.text.split(LINE_BREAK).map((one) => one.trim()).find((one) => one !== "") ?? doc.reading.read_line.trim();
  return cutAtCodePoint(line, S.titleMaxChars).trimEnd();
}

/**
 * What a save screens for crisis words, once each: the box; the title and question of every path in the person's wording
 * and the question of every chip in their own words, on the list, under "+ N more" and in every Undo step; and every answer
 * they typed ("Other…"). Never the AIs' text (their paths, chips, clarifying questions and answer options).
 */
export function savedQuestionOwnWords(doc: SavedQuestionDoc): readonly string[] {
  const { box, plan, sent_goal: goal } = doc.page;
  const paths = [plan, ...plan.undo].flatMap((step) => [...step.paths, ...step.more]);
  const words = [
    box.text,
    ...paths.flatMap((path) => [
      ...(path.wording === "PERSON" ? [path.title, path.question] : []),
      ...path.viewpoints.flatMap((viewpoint) => viewpoint.source.kind === "OWN" ? [viewpoint.question] : [])
    ]),
    ...goal.answers.flatMap((answer) => answer.other ? [answer.answer] : [])
  ];
  return Object.freeze([...new Set(words.filter((text) => text.trim() !== ""))]);
}
