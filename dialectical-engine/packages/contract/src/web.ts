import { z } from "zod";
import { ACCOUNT_MEMORY_LIMITS, DigLinkModeSchema, DigLinkPlaceSchema, DigLinkRecordSchema } from "./account-memory.js";
import { CatalogLocaleCodeSchema } from "./locale.js";
import { STORY_RUNAWAY_LIMITS, StoryFateSchema } from "./story.js";

/**
 * WEB SEARCH, DIG SUGGESTIONS AND INVESTIGATIONS (plan 2026-10-30 W1-6; owner answers of 30 Oct, OWNER-ANSWERS-2026-10-29
 * "Perplexity design round" to the end): the outside shapes the API serves and the V4 pages read. Every member that rides
 * an existing answer, ask or room read is OPTIONAL there, so every answer, ask and room read made before R22 reads exactly
 * as before. Later tasks fill these shapes (serve W3-3, W4-3; the API W3-2, W4-4, W5-1); they add no new ones.
 *
 * Owner rules these shapes hold:
 *  - a quote shown to people is at most 120 characters, cut at a word edge (`cutQuoteAtWordEdge`);
 *  - each quote comes with reader 1's one line about its page, written in the language the site is shown in (Q8);
 *  - never a grade or a score: reader grades stay inside the engine;
 *  - "Sure" needs a looked-up extract the server checked (`looked_up_checked` on the point); old debates have no flag and
 *    so get the new rule too (Q17);
 *  - "Add to researched" is read at once by readers 2 and 3, and the page shows the outcome (Q7);
 *  - dig suggestions come in four kinds, are combined and edited by the person, who may add their own view at any place
 *    (at most 3 combined on Free, Q19);
 *  - earlier report versions are kept when an investigation is reopened (Q5).
 *
 * The new dig model and the money rule (plan 2026-10-30-dig-model-revision.md, task W2-7; owner answers of 30-31 Oct,
 * OWNER-ANSWERS-2026-10-29.md "Dig model revision" and "How web money is spent") are at the end of this file.
 *
 * It imports only zod and the zod-only modules beside it (never ./index.js), for the module-cycle reason map-view.ts gives.
 */
export const WEB_CONTRACT_LIMITS = Object.freeze({
  /** Owner rule: every quote shown to people is at most 120 characters. */
  quoteMaxChars: 120,
  /** Runaway guards (about 5-10 times what the AIs are asked for), as STORY_RUNAWAY_LIMITS are. */
  explanationMaxChars: 600,
  reasonMaxChars: 1000,
  titleMaxChars: 500,
  siteMaxChars: 253,
  linkMaxChars: 2048,
  suggestionTextMaxChars: 1000,
  pickTextMaxChars: 2000,
  /** Counts. */
  sourcesPerPointMax: 8,
  otherPagesPerPathMax: 100,
  suggestionsPerPathMax: 20,
  pathsMax: 8,
  /** A dig's picks: as many as the places one dig link can name (0131). Free is capped lower (FREE_DIG_PICKS_MAX). */
  digPicksMax: ACCOUNT_MEMORY_LIMITS.digPlacesMax,
  /** Owner answer Q19: on Free, a dig combines at most 3 picks (the same cap as Free's 3 choices). */
  freeDigPicksMax: 3,
  investigationDigsMax: ACCOUNT_MEMORY_LIMITS.digChildrenMax,
  reportVersionsMax: 100
});

/** Owner answer Q19: Free's cap on the picks one dig combines (WEB_CONTRACT_LIMITS.freeDigPicksMax). */
export const FREE_DIG_PICKS_MAX = WEB_CONTRACT_LIMITS.freeDigPicksMax;

/** The ellipsis that marks where a quote was cut. */
const CUT_MARK = "…";

/**
 * The quote people see: the extract with its white space made single, and, when it is longer than `maxChars` characters
 * (Unicode characters, never split), cut after its last whole word with "…" (counted in the limit). A single word longer
 * than the limit is cut hard. A quote that is already short and clean comes back unchanged, so the cut is idempotent.
 */
export function cutQuoteAtWordEdge(text: string, maxChars: number = WEB_CONTRACT_LIMITS.quoteMaxChars): string {
  if (!Number.isInteger(maxChars) || maxChars < 2) throw new RangeError("WEB_QUOTE_LIMIT_INVALID");
  const clean = text.replace(/\s+/gu, " ").trim();
  const characters = Array.from(clean);
  if (characters.length <= maxChars) return clean;
  const room = characters.slice(0, maxChars - 1);
  // Cut mid-word unless the character after the room is a space: then go back to the last space inside the room.
  const lastSpace = characters[maxChars - 1] === " " ? room.length : room.lastIndexOf(" ");
  const kept = (lastSpace > 0 ? room.slice(0, lastSpace) : room).join("").replace(/[\s,;:\-–—]+$/u, "");
  return `${kept.length > 0 ? kept : room.join("")}${CUT_MARK}`;
}

/** A shown quote: 1-120 characters, already cut (single spaces, trimmed). */
const QuoteSchema = z.string().min(1)
  .refine((quote) => cutQuoteAtWordEdge(quote) === quote, { message: "WEB_QUOTE_NOT_CUT" });

/** Extract ids as the packs name them ("S2-3": path 2, extract 3); the arguing AIs put them in a point's locator. */
export const WEB_EXTRACT_ID_PATTERN = /^S[0-9]{1,4}-[0-9]{1,4}$/u;
/** Ids of pages and suggestions the server hands out (a uuid fits). */
export const WEB_REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const WebRefSchema = z.string().regex(WEB_REF_PATTERN);
/** A path is named by the opening position (root node id) that argued it, as story paths and the map view name it. */
const PositionRefSchema = z.string().trim().min(1).max(160);

/** How much of a page was read: the whole text, only a preview (Perplexity's short text), or an abstract page. */
export const WEB_READ_DEPTHS = ["WHOLE", "PREVIEW_ONLY", "ABSTRACT_ONLY"] as const;
export const WebReadDepthSchema = z.enum(WEB_READ_DEPTHS);
export type WebReadDepth = z.infer<typeof WebReadDepthSchema>;

/** Reader 1's one line about a page (what it is about and why it matters), in the site's language at the time (Q8). */
export const WebExplanationSchema = z.object({
  text: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.explanationMaxChars),
  language: CatalogLocaleCodeSchema
}).strict();
export type WebExplanation = z.infer<typeof WebExplanationSchema>;

const PageFields = {
  title: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.titleMaxChars).nullable(),
  site: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.siteMaxChars),
  link: z.url({ protocol: /^https?$/u }).max(WEB_CONTRACT_LIMITS.linkMaxChars),
  read_depth: WebReadDepthSchema,
  explanation: WebExplanationSchema.nullable()
};

/**
 * One source under a point: a checked extract of a page we read, as people see it. `published_on` is the page's own date
 * when it has one. `fewer_readers` (only ever true) says fewer than the planned readers read the page (a reader failed).
 */
export const WebSourceSchema = z.object({
  extract_id: z.string().regex(WEB_EXTRACT_ID_PATTERN),
  quote: QuoteSchema,
  ...PageFields,
  published_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable(),
  fewer_readers: z.literal(true).optional()
}).strict();
export type WebSource = z.infer<typeof WebSourceSchema>;

/**
 * "Add to researched" (Q7): READING while readers 2 and 3 read the page; then ADDS (with the checked quotes that joined
 * the path), ADDS_NOTHING, or FAILED (the page could not be read).
 */
export const WEB_RESEARCHED_STATES = ["READING", "ADDS", "ADDS_NOTHING", "FAILED"] as const;
export const WebResearchedSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("READING") }).strict(),
  z.object({ state: z.literal("ADDS"), sources: z.array(WebSourceSchema).min(1).max(WEB_CONTRACT_LIMITS.sourcesPerPointMax) }).strict(),
  z.object({ state: z.literal("ADDS_NOTHING") }).strict(),
  z.object({ state: z.literal("FAILED") }).strict()
]);
export type WebResearched = z.infer<typeof WebResearchedSchema>;

/** A page a path's search found outside its top pages: reader 1's line, never a grade; `researched` once it was added. */
export const WebOtherPageSchema = z.object({
  page_ref: WebRefSchema,
  ...PageFields,
  researched: WebResearchedSchema.optional()
}).strict();
export type WebOtherPage = z.infer<typeof WebOtherPageSchema>;

/**
 * A path's web search: SEARCHED; NO_SEARCH_PLANNED, with the planner's reason (null if its reply lost it); FAILED (the
 * search could not run: the debate went on without the web); NOT_ON_PLAN (Free never searches); SWITCHED_OFF (the web
 * search setting was off, Q16).
 */
export const WEB_SEARCH_STATUSES = ["SEARCHED", "NO_SEARCH_PLANNED", "FAILED", "NOT_ON_PLAN", "SWITCHED_OFF"] as const;
export const WebSearchStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("SEARCHED") }).strict(),
  z.object({ status: z.literal("NO_SEARCH_PLANNED"), reason: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.reasonMaxChars).nullable() }).strict(),
  z.object({ status: z.literal("FAILED") }).strict(),
  z.object({ status: z.literal("NOT_ON_PLAN") }).strict(),
  z.object({ status: z.literal("SWITCHED_OFF") }).strict()
]);
export type WebSearchStatus = z.infer<typeof WebSearchStatusSchema>;

/**
 * The four kinds of dig suggestion (owner, 30 Oct): contradicting parts, undocumented parts, parts that need more web
 * search, and what would help the main question from this path, for or against (written by one small AI call per path,
 * Q6). Only the last names a side.
 */
export const DIG_SUGGESTION_KINDS = ["CONTRADICTING", "UNDOCUMENTED", "NEEDS_MORE_WEB", "HELPS_MAIN_QUESTION"] as const;
export const DigSuggestionKindSchema = z.enum(DIG_SUGGESTION_KINDS);
export type DigSuggestionKind = z.infer<typeof DigSuggestionKindSchema>;
export const DigSuggestionSideSchema = z.enum(["FOR", "AGAINST"]);

/** One dig suggestion on a path: its text (the person may edit it before digging) and the map places it rests on. */
export const DigSuggestionSchema = z.object({
  suggestion_id: WebRefSchema,
  kind: DigSuggestionKindSchema,
  side: DigSuggestionSideSchema.nullable(),
  text: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.suggestionTextMaxChars),
  places: z.array(DigLinkPlaceSchema).min(1).max(ACCOUNT_MEMORY_LIMITS.digPlacesMax)
}).strict().superRefine((suggestion, context) => {
  if ((suggestion.kind === "HELPS_MAIN_QUESTION") !== (suggestion.side !== null)) {
    context.addIssue({ code: "custom", message: "only a 'helps the main question' suggestion names a side, and it always does" });
  }
});
export type DigSuggestion = z.infer<typeof DigSuggestionSchema>;

/** The web part of one path: its search, the other pages found, and its dig suggestions. Pages exist only if it searched. */
export const WebPathSchema = z.object({
  position_ref: PositionRefSchema,
  search: WebSearchStatusSchema,
  other_pages: z.array(WebOtherPageSchema).max(WEB_CONTRACT_LIMITS.otherPagesPerPathMax),
  suggestions: z.array(DigSuggestionSchema).max(WEB_CONTRACT_LIMITS.suggestionsPerPathMax)
}).strict().superRefine((path, context) => {
  if (path.search.status !== "SEARCHED" && path.other_pages.length > 0) {
    context.addIssue({ code: "custom", message: "only a path that searched lists other pages" });
  }
});
export type WebPath = z.infer<typeof WebPathSchema>;

/** `Answer.web`: one entry per path, each path once. */
export const AnswerWebSchema = z.object({
  paths: z.array(WebPathSchema).max(WEB_CONTRACT_LIMITS.pathsMax)
}).strict().superRefine((web, context) => {
  if (new Set(web.paths.map((path) => path.position_ref)).size !== web.paths.length) {
    context.addIssue({ code: "custom", message: "each path is listed once" });
  }
});
export type AnswerWeb = z.infer<typeof AnswerWebSchema>;

/** POST body of "Add to researched": the path and one of its other pages. The answer is READING. */
export const ResearchedAddRequestSchema = z.object({ position_ref: PositionRefSchema, page_ref: WebRefSchema }).strict();
export type ResearchedAddRequest = z.infer<typeof ResearchedAddRequestSchema>;
export const ResearchedAddedSchema = z.object({ state: z.literal("READING") }).strict();
export type ResearchedAdded = z.infer<typeof ResearchedAddedSchema>;

/**
 * One pick a dig is made of: a suggestion the person chose (its text as sent, edited or not; the server compares it with
 * the stored suggestion) or the person's own view (OWN_VIEW, no suggestion), each at a place on the parent's map. One
 * search is planned per pick (Q9).
 */
export const DigPickSchema = z.object({
  kind: z.enum([...DIG_SUGGESTION_KINDS, "OWN_VIEW"]),
  suggestion_id: WebRefSchema.nullable(),
  place: DigLinkPlaceSchema,
  text: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.pickTextMaxChars)
}).strict().superRefine((pick, context) => {
  if ((pick.kind === "OWN_VIEW") !== (pick.suggestion_id === null)) {
    context.addIssue({ code: "custom", message: "a suggestion pick names its suggestion; the person's own view names none" });
  }
});
export type DigPick = z.infer<typeof DigPickSchema>;

/**
 * `AskRequest.parent`: the ask is a dig of `parent_run_id` (the server checks the person owns it), at `places` on its map,
 * a quick or thorough look (row D decision 5), made of `picks` (absent from a page that sends none). The server writes
 * the dig link (0131) at start. Free combines at most FREE_DIG_PICKS_MAX picks; the server enforces it.
 */
export const AskParentSchema = z.object({
  parent_run_id: z.uuid(),
  places: z.array(DigLinkPlaceSchema).max(ACCOUNT_MEMORY_LIMITS.digPlacesMax),
  mode: DigLinkModeSchema,
  picks: z.array(DigPickSchema).min(1).max(WEB_CONTRACT_LIMITS.digPicksMax).optional()
}).strict();
export type AskParent = z.infer<typeof AskParentSchema>;

/**
 * Room read (Q2): KEPT = one reserve is kept back so the person can always close an investigation;
 * BLOCKED = a closing found no credits left, so everything waits until the full window's reset (`resets_at`).
 */
export const RoomReserveSchema = z.enum(["KEPT", "BLOCKED"]);
export type RoomReserve = z.infer<typeof RoomReserveSchema>;

/**
 * A dig's share of today (Q14, the owner-approved exception to I6): a percentage in steps of 5, 0-100, only on a room
 * read asked for a dig. A dig that costs anything shows at least 5; one over the whole day shows 100 (the room then says
 * FULL).
 */
export const DigSharePercentSchema = z.number().int().min(0).max(100).multipleOf(5);

/** The share of `dayLimitMicros` that `digEstimateMicros` takes, rounded half up to the nearest 5%, within 5-100 when > 0. */
export function digSharePercent(digEstimateMicros: number, dayLimitMicros: number): number {
  if (!Number.isSafeInteger(digEstimateMicros) || digEstimateMicros < 0
    || !Number.isSafeInteger(dayLimitMicros) || dayLimitMicros <= 0) {
    throw new RangeError("DIG_SHARE_INPUT_INVALID");
  }
  if (digEstimateMicros === 0) return 0;
  // Steps of 5% are twentieths: round(estimate * 20 / limit), half up, in integers.
  const twentieths = Math.floor((digEstimateMicros * 40 + dayLimitMicros) / (dayLimitMicros * 2));
  return Math.min(100, Math.max(5, twentieths * 5));
}

/** One closing ("Write my report") of an investigation: its report version and how its report stands. */
export const InvestigationClosingSchema = z.object({
  report_version: z.number().int().positive(),
  closed_at: z.iso.datetime(),
  report: z.enum(["WRITING", "READY", "FAILED"]),
  answer_id: z.string().min(1).nullable()
}).strict();
export type InvestigationClosing = z.infer<typeof InvestigationClosingSchema>;

/**
 * An investigation: a debate and all its digs, one budget unit. OPEN until the person closes it (never automatically);
 * a dig reopens it. Every closing is kept, oldest first, versions 1, 2, 3…; the last is the current report, and only it
 * may still be writing.
 */
export const DebateInvestigationSchema = z.object({
  investigation_id: z.uuid(),
  root_run_id: z.uuid(),
  state: z.enum(["OPEN", "CLOSED"]),
  digs: z.array(DigLinkRecordSchema).max(WEB_CONTRACT_LIMITS.investigationDigsMax),
  closings: z.array(InvestigationClosingSchema).max(WEB_CONTRACT_LIMITS.reportVersionsMax)
}).strict().superRefine((investigation, context) => {
  if (investigation.state === "CLOSED" && investigation.closings.length === 0) {
    context.addIssue({ code: "custom", message: "a closed investigation has a closing" });
  }
  if (investigation.closings.some((closing, at) => closing.report_version !== at + 1)) {
    context.addIssue({ code: "custom", message: "report versions are 1, 2, 3… in order" });
  }
  if (investigation.closings.slice(0, -1).some((closing) => closing.report === "WRITING")) {
    context.addIssue({ code: "custom", message: "only the latest report may still be writing" });
  }
});
export type DebateInvestigation = z.infer<typeof DebateInvestigationSchema>;

/** POST body of "Write my report": nothing but the request; the route names the investigation. */
export const InvestigationCloseRequestSchema = z.object({}).strict();

// ---------------------------------------------------------------------------------------------------------------------
// The new dig model (plan 2026-10-30-dig-model-revision.md, task W2-7; owner answers of 30 Oct, "Dig model revision").
// A dig runs a short follow-up debate and then ONE writer call rewrites the parent path (checked by a second AI): its new
// text, "What the dig changed", what became of it, the lines and fates of the dig's own paths, and, when the dig carries
// the person's own words, the verdict "Your point of view". The dig keeps its points and its answer text; only its story
// is dropped (Q-D13). The main answer is not rewritten by a dig: the map counts the paths changed since it was written.
// Digs nest: the first debate is level 0, a dig of it level 1, and so on to DIG_LEVEL_MAX. Picks stay on one path (Q-D1).
// There is no person-written search words box: what is sent to the web search stays the planner's decision.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The deepest dig level (owner Q-D12: fixed in code; moving it is a release). Level 0 is the first debate. This is how many
 * digs sit above a debate, never how far one debate's argument tree grows (a separate bound, declared once in index.ts).
 * The database check of migration 0134 uses the same literal, pinned equal to this constant by an architecture test.
 * Declared in a frozen table, as WEB_CONTRACT_LIMITS' counts are, and named once below (FREE_DIG_PICKS_MAX's pattern).
 */
const DIG_LEVELS = Object.freeze({ max: 10 });
export const DIG_LEVEL_MAX: number = DIG_LEVELS.max;
export const DigLevelSchema = z.number().int().min(0).max(DIG_LEVEL_MAX);
/** A dig's own level: 1 to DIG_LEVEL_MAX (level 0 is the first debate, which is no dig). */
const DugLevelSchema = z.number().int().min(1).max(DIG_LEVEL_MAX);

/** Whether a debate at `level` may be dug further: every level below DIG_LEVEL_MAX may; the deepest offers no "Dig here too". */
export function canDigFromLevel(level: number): boolean {
  if (!DigLevelSchema.safeParse(level).success) throw new RangeError("DIG_LEVEL_INVALID");
  return level < DIG_LEVEL_MAX;
}

/** The 409 body of an ask that would go past DIG_LEVEL_MAX (two quick clicks): nothing was started and nothing charged. */
export const DIG_TOO_DEEP = "DIG_TOO_DEEP" as const;
export const DigTooDeepSchema = z.object({
  error: z.literal(DIG_TOO_DEEP),
  message: z.literal(DIG_TOO_DEEP),
  level_max: z.literal(DIG_LEVEL_MAX)
}).strict();
export type DigTooDeep = z.infer<typeof DigTooDeepSchema>;

/** Runaway guards for the rewrite's texts (about 5-10 times what the writer is asked for), as STORY_RUNAWAY_LIMITS are. */
export const DIG_MODEL_LIMITS = Object.freeze({
  lineMaxChars: STORY_RUNAWAY_LIMITS.positionLineMaxChars,
  summaryMaxChars: 4000,
  /** Draft 5.1 (approved): "What the dig changed" is one to three plain sentences. */
  whatChangedSentencesMax: 3,
  sentenceMaxChars: 1000,
  reasonMaxChars: WEB_CONTRACT_LIMITS.reasonMaxChars,
  /** A path's rewrites: at most one per dig of the investigation. */
  rewritesPerPathMax: WEB_CONTRACT_LIMITS.investigationDigsMax
});

const LineSchema = z.string().trim().min(1).max(DIG_MODEL_LIMITS.lineMaxChars);
const SentenceSchema = z.string().trim().min(1).max(DIG_MODEL_LIMITS.sentenceMaxChars);

/** A path's text as people see it: its line, a short summary, and what became of it (the story's four fates). */
export const PathTextSchema = z.object({
  line: LineSchema,
  summary: z.string().trim().min(1).max(DIG_MODEL_LIMITS.summaryMaxChars),
  fate: StoryFateSchema
}).strict();
export type PathText = z.infer<typeof PathTextSchema>;

/** One of the dig's own paths, as the rewrite call wrote it (owner Q-D2): its line and what became of it. */
export const DigPathLineSchema = z.object({
  position_ref: PositionRefSchema,
  line: LineSchema,
  fate: StoryFateSchema
}).strict();
export type DigPathLine = z.infer<typeof DigPathLineSchema>;

/**
 * "Your point of view" (draft 5.3, approved): whether the person's own words helped this path (or also the main question),
 * did not help, or could not be settled by the dig, with the AI's one-sentence reason. `own_words` are the person's own
 * texts the dig carried (their own view, their edit of a suggestion), quoted above the line. The page picks the line from
 * the outcome and scope; an AI never writes the line itself.
 */
export const POINT_OF_VIEW_OUTCOMES = ["HELPED", "DID_NOT_HELP", "NOT_SETTLED"] as const;
export const POINT_OF_VIEW_SCOPES = ["PATH", "MAIN_QUESTION"] as const;
export const PointOfViewVerdictSchema = z.object({
  outcome: z.enum(POINT_OF_VIEW_OUTCOMES),
  scope: z.enum(POINT_OF_VIEW_SCOPES),
  reason: z.string().trim().min(1).max(DIG_MODEL_LIMITS.reasonMaxChars),
  own_words: z.array(z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.pickTextMaxChars)).min(1).max(WEB_CONTRACT_LIMITS.digPicksMax)
}).strict();
export type PointOfViewVerdict = z.infer<typeof PointOfViewVerdictSchema>;

/**
 * A rewrite's states: WRITING (the dig is done, the path is being rewritten), READY or READY_WITH_RESERVATION (the checker
 * passed it, or the last round left a reservation), FAILED (the path keeps its text; the report reads the dig directly).
 */
export const PATH_REWRITE_STATES = ["WRITING", "READY", "READY_WITH_RESERVATION", "FAILED"] as const;
export type PathRewriteState = (typeof PATH_REWRITE_STATES)[number];

/** Every rewrite names the dig that made it, its level, and when the dig finished (rewrites follow that order). */
const RewriteBase = {
  rewrite_id: WebRefSchema,
  dig_run_id: z.uuid(),
  dig_level: DugLevelSchema,
  dig_finished_at: z.iso.datetime()
};

/** A finished rewrite: the new text, what the dig changed, the fate it had before, the verdict (or none), the dig's paths. */
function finishedRewrite<S extends "READY" | "READY_WITH_RESERVATION">(state: S) {
  return z.object({
    ...RewriteBase,
    state: z.literal(state),
    rewritten_at: z.iso.datetime(),
    /** False: "The dig didn't change this path." (its "what the dig changed" is still shown). Worked out by code. */
    changed: z.boolean(),
    text: PathTextSchema,
    what_changed: z.array(SentenceSchema).min(1).max(DIG_MODEL_LIMITS.whatChangedSentencesMax),
    fate_before: StoryFateSchema,
    view: PointOfViewVerdictSchema.nullable(),
    dig_paths: z.array(DigPathLineSchema).max(WEB_CONTRACT_LIMITS.pathsMax)
  }).strict();
}

/** One rewrite of a path by one dig. Only a finished rewrite carries text; a writing or failed one leaves the path's. */
export const PathRewriteSchema = z.discriminatedUnion("state", [
  z.object({ ...RewriteBase, state: z.literal("WRITING") }).strict(),
  finishedRewrite("READY"),
  finishedRewrite("READY_WITH_RESERVATION"),
  z.object({ ...RewriteBase, state: z.literal("FAILED"), failed_at: z.iso.datetime() }).strict()
]).superRefine((rewrite, context) => {
  const settledAt = rewrite.state === "WRITING" ? null : rewrite.state === "FAILED" ? rewrite.failed_at : rewrite.rewritten_at;
  if (settledAt !== null && Date.parse(settledAt) < Date.parse(rewrite.dig_finished_at)) {
    context.addIssue({ code: "custom", message: "a rewrite settles after its dig finished" });
  }
  if (rewrite.state !== "READY" && rewrite.state !== "READY_WITH_RESERVATION") return;
  if (!rewrite.changed && rewrite.fate_before !== rewrite.text.fate) {
    context.addIssue({ code: "custom", message: "a rewrite that changed nothing keeps the path's fate" });
  }
  if (new Set(rewrite.dig_paths.map((path) => path.position_ref)).size !== rewrite.dig_paths.length) {
    context.addIssue({ code: "custom", message: "each of the dig's paths is listed once" });
  }
});
export type PathRewrite = z.infer<typeof PathRewriteSchema>;

const isFinished = (rewrite: PathRewrite): rewrite is Extract<PathRewrite, { state: "READY" | "READY_WITH_RESERVATION" }> =>
  rewrite.state === "READY" || rewrite.state === "READY_WITH_RESERVATION";

/**
 * One path of an answer and its rewrites, newest last (in the order their digs finished; each based on the one before).
 * `current` is the newest finished rewrite's text, or null while no dig has rewritten the path (the story's line stands).
 * `changed_below` (only ever true): a deeper dig changed a path inside this path's dig (owner Q-D5: marked, not rewritten).
 */
export const PathRewritesSchema = z.object({
  position_ref: PositionRefSchema,
  current: PathTextSchema.nullable(),
  history: z.array(PathRewriteSchema).max(DIG_MODEL_LIMITS.rewritesPerPathMax),
  changed_below: z.literal(true).optional()
}).strict().superRefine((path, context) => {
  if (path.history.length === 0 && path.changed_below !== true) {
    context.addIssue({ code: "custom", message: "a path is listed when a dig rewrote it or changed something below it" });
  }
  if (path.history.some((rewrite, at) => at > 0 && Date.parse(rewrite.dig_finished_at) < Date.parse(path.history[at - 1]!.dig_finished_at))) {
    context.addIssue({ code: "custom", message: "rewrites go in the order their digs finished" });
  }
  if (new Set(path.history.map((rewrite) => rewrite.rewrite_id)).size !== path.history.length
    || new Set(path.history.map((rewrite) => rewrite.dig_run_id)).size !== path.history.length) {
    context.addIssue({ code: "custom", message: "each rewrite and each dig appears once in a path's history" });
  }
  const finished = path.history.filter(isFinished);
  if (finished.some((rewrite, at) => at > 0 && rewrite.fate_before !== finished[at - 1]!.text.fate)) {
    context.addIssue({ code: "custom", message: "each rewrite is based on the one before it" });
  }
  const newest = finished.at(-1);
  const current = path.current;
  const matches = newest === undefined ? current === null
    : current !== null && current.line === newest.text.line && current.summary === newest.text.summary && current.fate === newest.text.fate;
  if (!matches) context.addIssue({ code: "custom", message: "the current text is the newest finished rewrite's, or null when none" });
});
export type PathRewrites = z.infer<typeof PathRewritesSchema>;

/**
 * "Paths changed since the answer was written" (owner Q-D11): how many paths have a finished rewrite newer than the first
 * answer (`since_report_version` null) or than the latest report (its version).
 */
export const PathsChangedSinceSchema = z.object({
  count: z.number().int().min(0).max(WEB_CONTRACT_LIMITS.pathsMax),
  since_report_version: z.number().int().positive().nullable()
}).strict();
export type PathsChangedSince = z.infer<typeof PathsChangedSinceSchema>;

/** `Answer.path_rewrites`: each rewritten (or changed-below) path once, and the "changed since" count. */
export const AnswerPathRewritesSchema = z.object({
  paths: z.array(PathRewritesSchema).max(WEB_CONTRACT_LIMITS.pathsMax),
  changed_since: PathsChangedSinceSchema
}).strict().superRefine((rewrites, context) => {
  if (new Set(rewrites.paths.map((path) => path.position_ref)).size !== rewrites.paths.length) {
    context.addIssue({ code: "custom", message: "each path is listed once" });
  }
  if (rewrites.changed_since.count > rewrites.paths.filter((path) => path.history.some(isFinished)).length) {
    context.addIssue({ code: "custom", message: "only a path with a finished rewrite counts as changed" });
  }
});
export type AnswerPathRewrites = z.infer<typeof AnswerPathRewritesSchema>;

/**
 * Who wrote a pick the dig carried: an AI suggestion chosen as it was, the person's edit of one, or the person's own view.
 * The verdict shows when the dig carries the person's own words (owner Q-D4): their own view or their edited suggestion.
 */
export const DIG_PICK_AUTHORS = ["AI_SUGGESTION", "PERSON_EDITED", "PERSON_OWN_VIEW"] as const;
export const DugPickSchema = z.object({
  kind: z.enum([...DIG_SUGGESTION_KINDS, "OWN_VIEW"]),
  place: DigLinkPlaceSchema,
  text: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.pickTextMaxChars),
  by: z.enum(DIG_PICK_AUTHORS)
}).strict().superRefine((pick, context) => {
  if ((pick.kind === "OWN_VIEW") !== (pick.by === "PERSON_OWN_VIEW")) {
    context.addIssue({ code: "custom", message: "the person's own view, and only it, is a pick of kind OWN_VIEW" });
  }
});
export type DugPick = z.infer<typeof DugPickSchema>;

/**
 * `Answer.dig`, on a dig's own answer: what it dug (its parent, the path it rewrites, the places, its level, its picks)
 * and its rewrite of that path (whose `dig_paths` are the dig's own paths with their lines and fates). A dig of an open
 * question hanging under the main question rewrites no path (`position_ref` and `rewrite` null).
 */
export const AnswerDigSchema = z.object({
  parent_run_id: z.uuid(),
  position_ref: PositionRefSchema.nullable(),
  places: z.array(DigLinkPlaceSchema).max(ACCOUNT_MEMORY_LIMITS.digPlacesMax),
  level: DugLevelSchema,
  picks: z.array(DugPickSchema).max(WEB_CONTRACT_LIMITS.digPicksMax),
  rewrite: PathRewriteSchema.nullable()
}).strict().superRefine((dig, context) => {
  const rewrite = dig.rewrite;
  if (rewrite === null) return;
  if (dig.position_ref === null) context.addIssue({ code: "custom", message: "only a dig of a path rewrites it" });
  if (rewrite.dig_level !== dig.level) context.addIssue({ code: "custom", message: "a dig's rewrite is of the dig's own level" });
  if (!isFinished(rewrite)) return;
  const ownWords = dig.picks.filter((pick) => pick.by !== "AI_SUGGESTION").map((pick) => pick.text);
  const view = rewrite.view;
  if ((view !== null) !== (ownWords.length > 0)
    || (view !== null && JSON.stringify(view.own_words) !== JSON.stringify(ownWords))) {
    context.addIssue({ code: "custom", message: "the verdict is there exactly when a pick carries the person's own words, quoting them in order" });
  }
});
export type AnswerDig = z.infer<typeof AnswerDigSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// The money rule (owner, 31 Oct, "How web money is spent"): no worst-case hold before a start; the estimate is shown as a
// share of today; running work is never stopped by the day or week, and what it uses past them is borrowed from the next
// day or week (the page says so); new starts wait for the day or week reset; the month is the wall: the running debate's
// planned calls and searches pause, and the person presses Continue once the month resets (true resume, nothing paid twice).
// ---------------------------------------------------------------------------------------------------------------------

/** Room read: new questions and digs wait for `resets_at` (a full person day, week or month); running work goes on. */
export const RoomNewStartsSchema = z.enum(["BLOCKED_UNTIL_RESET"]);
export type RoomNewStarts = z.infer<typeof RoomNewStartsSchema>;

/**
 * Usage read: running work went past a day or week window, so part of the NEXT window's allowance was used to finish it.
 * `percent` is that part, a whole share of the next window; `next_window_starts_at` is when that lower window starts. The
 * month is never borrowed from.
 */
export const UsageBorrowSchema = z.object({
  scope: z.enum(["PERSON_DAY", "PERSON_WEEK"]),
  run_ref: z.string().min(1),
  percent: z.number().int().min(1).max(100),
  next_window_starts_at: z.iso.datetime()
}).strict();
export type UsageBorrow = z.infer<typeof UsageBorrowSchema>;

/** The usage read's borrow notices: each (window, run) once. */
export const UsageBorrowsSchema = z.array(UsageBorrowSchema).max(20)
  .refine((borrows) => new Set(borrows.map((borrow) => `${borrow.scope} ${borrow.run_ref}`)).size === borrows.length,
    { message: "each window and run is named once" });

/**
 * Run read: the running debate reached the month wall, so its remaining planned AI calls and searches are paused until
 * the month resets (`until`). `can_continue` turns true once it has: the page then offers Continue.
 */
export const MonthPauseSchema = z.object({
  until: z.iso.datetime(),
  can_continue: z.boolean()
}).strict();
export type MonthPause = z.infer<typeof MonthPauseSchema>;

/** POST body of Continue on a month-paused debate; the route names the run. Finished work is never paid again. */
export const RunContinueRequestSchema = z.object({}).strict();
export const RunContinuedSchema = z.object({ state: z.literal("CONTINUING") }).strict();
export type RunContinued = z.infer<typeof RunContinuedSchema>;
/** Continue pressed before the month reset: refused, nothing changed. */
export const RUN_PAUSED_UNTIL_RESET = "RUN_PAUSED_UNTIL_RESET" as const;
export const RunContinueRefusedSchema = z.object({
  error: z.literal(RUN_PAUSED_UNTIL_RESET),
  message: z.literal(RUN_PAUSED_UNTIL_RESET),
  until: z.iso.datetime()
}).strict();
