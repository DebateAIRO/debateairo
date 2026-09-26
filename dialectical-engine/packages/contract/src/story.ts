import { z } from "zod";

/**
 * THE VERDICT STORY (spec §5.3, §7) — the shapes the storyteller answers in and
 * the story rows are stored and served in.
 *
 * Every text member is PLAIN TEXT written by a model. It is data: the site and
 * the PDF render it as text and never as Markdown, HTML or links.
 */

/**
 * The most paths the short story carries: the schema's cap, and the ceiling of
 * the material index's `pathCap`, so the two can never disagree.
 */
export const STORY_BODY_LIMITS = Object.freeze({
  maxPaths: 8
});

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

export const StoryBodySchema = z.object({
  shape_id: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  short: z.object({
    headline: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(900),
    paths: z.array(StoryPathSchema).min(1).max(STORY_BODY_LIMITS.maxPaths),
    change: StoryParagraphSchema(400)
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
