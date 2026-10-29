/**
 * V4 reading level (owner ruling N6, 2026-10-29): the level the person picks on the V4 ask page — plain words, some
 * background, or expert — rides with the ask (`depth_params.readingLevel`), and the AIs that write the final result write
 * for it. Plain words: the answer writer and the storyteller are given one fixed sentence describing the reader (the
 * `reader` material field) and told to write for that reader; the answer checker and the story checker are told the same
 * reader, so they never object to plain wording or to precise terms that suit it. A debate asked without a level (every
 * V3 /new ask, every older run) is never told anything: today's prompts, byte for byte.
 *
 * The sentences are OWNER-EDITABLE instruction text, each sealed inside the contract variant that carries it (the answer
 * writer's and checker's reader variants), so editing one is a new variant and a new register version. The story's two
 * sentences are code's, pinned byte for byte in tests and recorded in each story call's contract hash.
 * OWNER WORDING — pending approval (drafts of 2026-10-29).
 */

/** The three levels, in the order the V4 page offers them. */
export const READING_LEVELS = Object.freeze(["plain", "background", "expert"] as const);
export type ReadingLevel = typeof READING_LEVELS[number];

/** The material field that describes the reader; it rides after the length fields and before `question_language`. */
export const READER_FIELD = "reader" as const;

/** What the `reader` field says for each level. */
export const READER_SENTENCES: Readonly<Record<ReadingLevel, string>> = Object.freeze({
  plain: "The reader wants plain words: everyday words and short sentences, no jargon; explain any term you cannot avoid.",
  background: "The reader knows the basics: name the key terms briefly and give the main reasons behind each point.",
  expert: "The reader knows the field: use precise terms, and keep the figures, sources and caveats."
});

/** The answer writer's and the storyteller's one instruction sentence. */
export const READER_SENTENCE_WRITING = "Write for the reader described in reader.";
/** The answer checker's one instruction sentence. */
export const READER_SENTENCE_ANSWER_CHECKER =
  "The answer was written for the reader described in reader; never object to plain words or to precise terms that suit that reader.";
/** The story checker's one instruction sentence. */
export const READER_SENTENCE_STORY_CHECKER =
  "The story was written for the reader described in reader; never object to plain words or to precise terms that suit that reader.";

export function isReadingLevel(value: unknown): value is ReadingLevel {
  return typeof value === "string" && (READING_LEVELS as readonly string[]).includes(value);
}

/** The `reader` field for a level: `{ name: "reader", content: <the level's sentence> }`. */
export function readerField(level: ReadingLevel): Readonly<{ name: typeof READER_FIELD; content: string }> {
  if (!isReadingLevel(level)) throw new TypeError("READING_LEVEL_INVALID");
  return Object.freeze({ name: READER_FIELD, content: READER_SENTENCES[level] });
}

/** The material with the `reader` field appended; with no level, the same array (today's bytes). */
export function withReaderField<T extends Readonly<{ name: string; content: string }>>(
  material: readonly T[], level: ReadingLevel | null | undefined
): readonly Readonly<{ name: string; content: string }>[] {
  if (level === null || level === undefined) return material;
  return Object.freeze([...material, readerField(level)]);
}
