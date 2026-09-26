import { z } from "zod";
import { MakerLineageSchema } from "./lineage.js";

/**
 * THE VERDICT STORY (spec §5.3, §7) — the shapes the storyteller answers in and
 * the story rows are stored and served in.
 *
 * Every text member is PLAIN TEXT written by a model. It is data: the site and
 * the PDF render it as text and never as Markdown, HTML or links.
 */

/**
 * The story body's limits that other code reads, in one place.
 *  - maxPaths: the most paths the short story carries: the schema's cap, and
 *    the ceiling of the material index's `pathCap`, so the two can never disagree.
 *  - confidenceMaxChars: the confidence sentence (spec §14.2), one sentence.
 *  - whyReasonsMax: the reasons that decided the answer (spec §14.2), one to three.
 */
export const STORY_BODY_LIMITS = Object.freeze({
  maxPaths: 8,
  confidenceMaxChars: 300,
  whyReasonsMax: 3
});

/**
 * The question's language (spec §14.3): the BCP-47 tag dev detects and keeps
 * in `core.run.argument_language_tag`, or "und" when it could not tell. 35
 * characters is BCP-47's own practical ceiling for a tag.
 */
export const StoryLanguageTagSchema = z.string().min(1).max(35);

export const StoryFateSchema = z.enum(["HELD_UP", "PARTLY_HELD", "FELL", "SET_ASIDE"]);
export type StoryFate = z.infer<typeof StoryFateSchema>;

/** One cited paragraph: plain text plus the ids of the debate points it rests on. */
export function StoryParagraphSchema(maxChars: number) {
  return z.object({
    text: z.string().trim().min(1).max(maxChars),
    node_refs: z.array(z.string().min(1)).max(40)
  }).strict();
}
export type StoryParagraph = z.infer<ReturnType<typeof StoryParagraphSchema>>;

export const StoryPathSchema = z.object({
  position_ref: z.string().min(1),
  fate: StoryFateSchema,
  line: z.string().trim().min(1).max(240),
  node_refs: z.array(z.string().min(1)).max(40)
}).strict();
export type StoryPath = z.infer<typeof StoryPathSchema>;

/**
 * The story (spec §5.3, amended by §14). `short.confidence` is one sentence,
 * in plain words, saying how sure we are, anchored in this debate. `why` holds
 * the one to three reasons that decided the answer; it is printed only in the
 * full report, so its prose may name points (P3), as the long story's may.
 * What would change the answer stays in `short.change`.
 */
export const StoryBodySchema = z.object({
  shape_id: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  short: z.object({
    headline: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(900),
    confidence: z.string().trim().min(1).max(STORY_BODY_LIMITS.confidenceMaxChars),
    paths: z.array(StoryPathSchema).min(1).max(STORY_BODY_LIMITS.maxPaths),
    change: StoryParagraphSchema(400)
  }).strict(),
  why: z.object({
    reasons: z.array(StoryParagraphSchema(700)).min(1).max(STORY_BODY_LIMITS.whyReasonsMax)
  }).strict(),
  long: z.object({
    sections: z.array(z.object({
      title: z.string().trim().min(1).max(80),
      paragraphs: z.array(StoryParagraphSchema(2000)).min(1).max(12)
    }).strict()).min(3).max(12)
  }).strict(),
  reviewer_note: StoryParagraphSchema(1200).nullable()
}).strict();
export type StoryBody = z.infer<typeof StoryBodySchema>;

export const StoryOutcomeSchema = z.enum(["READY", "READY_WITH_RESERVATION", "FAILED"]);
export type StoryOutcome = z.infer<typeof StoryOutcomeSchema>;

export const StoryStatusSchema = z.enum(["WRITING", "READY", "READY_WITH_RESERVATION", "UNAVAILABLE"]);
export type StoryStatus = z.infer<typeof StoryStatusSchema>;

/**
 * The arithmetic behind the label, as code computed it (`deriveVerdictLabel`):
 * the story explains it and the PDF prints it, and neither can change it.
 */
export const StoryVerdictBasisSchema = z.object({
  label: z.enum(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]),
  rung: z.number().int().min(0).max(4),
  trigger: z.string().min(1),
  winner_node_id: z.string().min(1),
  winner_strength: z.number(),
  runner_up_node_id: z.string().nullable(),
  runner_up_strength: z.number().nullable(),
  margin: z.number().nullable(),
  /** The judges' measured disagreement about the winning position; null when it could not be measured. */
  disagreement: z.number().nullable(),
  thresholds: z.object({
    gamma: z.number(),
    high_cut: z.number(),
    low_cut: z.number(),
    disagreement: z.number()
  }).strict(),
  confidence_band: z.string().nullable(),
  marks: z.array(z.string())
}).strict();
export type StoryVerdictBasis = z.infer<typeof StoryVerdictBasisSchema>;

/**
 * GET /v1/answers/{id}/story (spec 2026-09-26 §10). `status` is WRITING while
 * the runner may still be writing, the stored outcome once a row exists, and
 * UNAVAILABLE otherwise (a FAILED row, no verdict, an unreadable row, or the
 * waiting window passed). Everything but the ids and the status is null unless
 * the story is READY or READY_WITH_RESERVATION. `point_numbers` maps each node
 * id to the story's canonical point number (P1…Pn), the numbers the story text
 * and the checker may cite and the PDF appendix uses. `rounds` is the number of
 * write-and-check rounds the story took; the PDF's "About this report" page
 * prints it. `language` is the question's language, the one the story is
 * written in (spec §14.3): a BCP-47 tag, "und" when it could not be told, or
 * null for a story stored without one.
 */
export const AnswerStorySchema = z.object({
  answer_id: z.string(),
  answer_version: z.number().int().positive(),
  status: StoryStatusSchema,
  unavailable_reason: z.string().nullable(),
  shape: z.object({ id: z.string(), title: z.string() }).strict().nullable(),
  pack: z.object({ version: z.string(), fingerprint: z.string() }).strict().nullable(),
  written_at: z.string().nullable(),
  storyteller: MakerLineageSchema.nullable(),
  checker: MakerLineageSchema.nullable(),
  rounds: z.number().int().nonnegative().nullable(),
  language: StoryLanguageTagSchema.nullable(),
  reservation: z.string().nullable(),
  verdict_basis: StoryVerdictBasisSchema.nullable(),
  point_numbers: z.record(z.string(), z.string().regex(/^P[1-9][0-9]*$/)).nullable(),
  story: StoryBodySchema.nullable()
}).strict();
export type AnswerStory = z.infer<typeof AnswerStorySchema>;

const StoryShortShape = StoryBodySchema.shape.short.shape;

/**
 * The short story a public snapshot carries (spec 2026-09-26 §10): the short
 * fields of a READY or READY_WITH_RESERVATION story, its confidence sentence
 * among them (§14.2), and the reviewer's note. Everything else stays
 * owner-only: the long story, the reasons in `why`, the PDF, the checker's
 * reservation (it names points by numbers only the owner's appendix explains),
 * the lineages, the point numbers, the verdict basis and the pack.
 *
 * LIMITS: every member below IS the StoryBodySchema member, so the public
 * limits mirror the body's short fields and reviewer's note exactly
 * (tests/unit/story-public-short.test.ts pins them equal). A published
 * snapshot is immutable ciphertext that is parsed on every public read, so
 * tightening a limit later, here or in StoryBodySchema itself, makes every
 * older snapshot that no longer fits fail to parse, and its public page
 * answers 404.
 */
export const PublicStoryShortSchema = z.object({
  headline: StoryShortShape.headline,
  summary: StoryShortShape.summary,
  confidence: StoryShortShape.confidence,
  paths: StoryShortShape.paths,
  change: StoryShortShape.change,
  reviewer_note: StoryBodySchema.shape.reviewer_note
}).strict();
export type PublicStoryShort = z.infer<typeof PublicStoryShortSchema>;
