import { z } from "zod";
import { MakerLineageSchema } from "./lineage.js";
import { VerdictStateSchema } from "./verdict-state.js";

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
 *  - confidenceMaxChars: the number the v3 storyteller form states for the confidence sentence (the schema reads STORY_RUNAWAY_LIMITS since LG-A).
 *  - whyReasonsMax: the reasons that decided the answer (spec §14.2), one to three.
 */
export const STORY_BODY_LIMITS = Object.freeze({
  maxPaths: 8,
  confidenceMaxChars: 300,
  whyReasonsMax: 3
});

/**
 * LG-A (spec 2026-10-15 §3.4, rulings L10 and L28; INTERFACE §2.6): the story's text limits are far-away RUNAWAY guards,
 * about 6 to 10 times what the forms ask for. They stop only an AI that has gone wrong (R16: a fine 326-character
 * sentence was refused at 240). They apply to every debate: the public short story and stored stories are read with this
 * same schema, and loosening reads every older story exactly as before, while tightening would turn old pages into 404s.
 * The v3 forms keep stating today's numbers, so what the AIs are asked does not change. Counts stay as they are.
 */
export const STORY_RUNAWAY_LIMITS = Object.freeze({
  headlineMaxChars: 1000,
  summaryMaxChars: 6000,
  confidenceMaxChars: 2000,
  positionLineMaxChars: 2000,
  changeMaxChars: 3000,
  whyReasonMaxChars: 5000,
  sectionTitleMaxChars: 500,
  paragraphMaxChars: 15000,
  reviewerNoteMaxChars: 8000
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
  line: z.string().trim().min(1).max(STORY_RUNAWAY_LIMITS.positionLineMaxChars),
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
    headline: z.string().trim().min(1).max(STORY_RUNAWAY_LIMITS.headlineMaxChars),
    summary: z.string().trim().min(1).max(STORY_RUNAWAY_LIMITS.summaryMaxChars),
    confidence: z.string().trim().min(1).max(STORY_RUNAWAY_LIMITS.confidenceMaxChars),
    paths: z.array(StoryPathSchema).min(1).max(STORY_BODY_LIMITS.maxPaths),
    change: StoryParagraphSchema(STORY_RUNAWAY_LIMITS.changeMaxChars)
  }).strict(),
  why: z.object({
    reasons: z.array(StoryParagraphSchema(STORY_RUNAWAY_LIMITS.whyReasonMaxChars)).min(1).max(STORY_BODY_LIMITS.whyReasonsMax)
  }).strict(),
  long: z.object({
    sections: z.array(z.object({
      title: z.string().trim().min(1).max(STORY_RUNAWAY_LIMITS.sectionTitleMaxChars),
      paragraphs: z.array(StoryParagraphSchema(STORY_RUNAWAY_LIMITS.paragraphMaxChars)).min(1).max(12)
    }).strict()).min(3).max(12)
  }).strict(),
  reviewer_note: StoryParagraphSchema(STORY_RUNAWAY_LIMITS.reviewerNoteMaxChars).nullable()
}).strict();
export type StoryBody = z.infer<typeof StoryBodySchema>;

export const StoryOutcomeSchema = z.enum(["READY", "READY_WITH_RESERVATION", "FAILED"]);
export type StoryOutcome = z.infer<typeof StoryOutcomeSchema>;

export const StoryStatusSchema = z.enum(["WRITING", "READY", "READY_WITH_RESERVATION", "UNAVAILABLE"]);
export type StoryStatus = z.infer<typeof StoryStatusSchema>;

/**
 * The basis behind the label, as code computed it (engine 1: `deriveVerdictLabel`'s ladder; engine 2: the comparing
 * judges' counted votes, rung 5): the story explains it and the PDF prints it, and neither can change it.
 */
export const StoryVerdictBasisSchema = z.object({
  label: VerdictStateSchema,
  /** The ladder rung (0-4, engine 1) or 5: the comparing judges decided (engine 2, R2b). */
  rung: z.number().int().min(0).max(5),
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
 * Charts in the verdict PDF (design 2026-10-28). An AI model chooses where a chart helps and what it compares; code
 * checks every number and draws it. The limits every chart obeys, in one place.
 *  - maxCharts: the most charts one story carries.
 *  - minItems / minScatterItems / maxItems: a bar chart compares at least two things, a scatter at least three.
 *  - titleMaxChars / labelMaxChars / figureTextMaxChars: a title, an axis or item label, a figure as the claim writes it.
 */
export const STORY_CHART_LIMITS = Object.freeze({
  maxCharts: 4,
  minItems: 2,
  minScatterItems: 3,
  maxItems: 12,
  titleMaxChars: 160,
  labelMaxChars: 80,
  figureTextMaxChars: 40
});

/**
 * Where a chart sits: right after one paragraph, 1-based. `why.2` is the second reason of "Why this answer";
 * `long.3.1` the first paragraph of the long story's third section.
 */
export const StoryChartAnchorSchema = z.string().regex(/^(why\.[1-9]|long\.(1[0-2]|[1-9])\.(1[0-2]|[1-9]))$/u);

/**
 * A measure the chart plots. `figure`: numbers the debate's points cite, each copied from its point's claim.
 * `strength`: the engine's own strength of each point, which code reads from the answer and never from the model.
 */
export const StoryChartAxisSchema = z.object({
  label: z.string().trim().min(1).max(STORY_CHART_LIMITS.labelMaxChars),
  source: z.enum(["figure", "strength"]),
  log: z.boolean()
}).strict();
export type StoryChartAxis = z.infer<typeof StoryChartAxisSchema>;

/** A cited figure: the number, and the exact characters of the claim that state it ("$0.15", "52 %"). */
export const StoryChartFigureSchema = z.object({
  value: z.number().finite(),
  text: z.string().trim().min(1).max(STORY_CHART_LIMITS.figureTextMaxChars)
}).strict();
export type StoryChartFigure = z.infer<typeof StoryChartFigureSchema>;

/** One thing on the chart: what it is called, the point that states its numbers, and its figure on each figure axis. */
export const StoryChartItemSchema = z.object({
  label: z.string().trim().min(1).max(STORY_CHART_LIMITS.labelMaxChars),
  node_ref: z.string().min(1),
  /** Null on a bar chart (it has no x measure) and on a strength axis. */
  x: StoryChartFigureSchema.nullable(),
  /** Null on a strength axis. */
  y: StoryChartFigureSchema.nullable()
}).strict();
export type StoryChartItem = z.infer<typeof StoryChartItemSchema>;

/**
 * A scatter's best-value line (owner request 2026-10-29): which end of each axis is better, so the PDF can join the
 * points nothing else beats on both measures (the Pareto line). Lower cost and higher score: `{ x: "lower", y: "higher" }`.
 */
export const StoryChartFrontierSchema = z.object({
  x: z.enum(["lower", "higher"]),
  y: z.enum(["lower", "higher"])
}).strict();
export type StoryChartFrontier = z.infer<typeof StoryChartFrontierSchema>;

/**
 * One chart as stored and served. A bar chart has no `x` axis and plots `y` for each item; a scatter plots `x` against
 * `y`, and may carry a best-value line (`frontier`). Every figure has passed the number check
 * (packages/story/src/charts.ts) before it is stored.
 */
export const StoryChartSchema = z.object({
  after: StoryChartAnchorSchema,
  kind: z.enum(["bar", "scatter"]),
  title: z.string().trim().min(1).max(STORY_CHART_LIMITS.titleMaxChars),
  x: StoryChartAxisSchema.nullable(),
  y: StoryChartAxisSchema,
  items: z.array(StoryChartItemSchema).min(STORY_CHART_LIMITS.minItems).max(STORY_CHART_LIMITS.maxItems),
  /** Absent or null: no line. Only a scatter has one. */
  frontier: StoryChartFrontierSchema.nullable().optional()
}).strict();
export type StoryChart = z.infer<typeof StoryChartSchema>;

export const StoryChartsSchema = z.array(StoryChartSchema).max(STORY_CHART_LIMITS.maxCharts);

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
  story: StoryBodySchema.nullable(),
  /**
   * The story's charts (design 2026-10-28), owner-only like the long story. Optional, so a server older than the charts
   * still parses; absent or empty when the story has none.
   */
  charts: StoryChartsSchema.optional()
}).strict();
export type AnswerStory = z.infer<typeof AnswerStorySchema>;

const StoryShortShape = StoryBodySchema.shape.short.shape;

/**
 * The short story a public snapshot carries (spec 2026-09-26 §10): the short
 * fields of a READY or READY_WITH_RESERVATION story, its confidence sentence
 * among them (§14.2), and the reviewer's note. Everything else stays
 * owner-only: the long story, the reasons in `why`, the PDF, the checker's
 * reservation TEXT (it names points by numbers only the owner's appendix
 * explains), the lineages, the point numbers, the verdict basis and the pack.
 *
 * `double_checked` (final review, Important 2): OPTIONAL, and `false` only for
 * a READY_WITH_RESERVATION story. Only that fact crosses, never the text: the
 * public page shows it as the same gentle catalogue line the owner's page and
 * the PDF show (§14.2, "Parts of this summary could not be fully
 * double-checked."). A snapshot without it — every one published before, and
 * every READY story — shows no such line.
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
  reviewer_note: StoryBodySchema.shape.reviewer_note,
  double_checked: z.boolean().optional()
}).strict();
export type PublicStoryShort = z.infer<typeof PublicStoryShortSchema>;
