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
  /**
   * Runaway guards (about 5-10 times what the AIs are asked for), as STORY_RUNAWAY_LIMITS are. The explanation is reader 1's page note:
   * up to three sentences since decision 8 of 31 Oct ("what it is, what it found, and what it leaves out").
   */
  explanationMaxChars: 2500,
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
  /** V4 start step, Task 79a: the points of the map one suggestion names (a path debate's). */
  suggestionPointsMax: 40,
  pathsMax: 8,
  /** A dig's picks: as many as the places one dig link can name (0131). Free is capped lower (FREE_DIG_PICKS_MAX). */
  digPicksMax: ACCOUNT_MEMORY_LIMITS.digPlacesMax,
  /** Owner answer Q19: on Free, a dig combines at most 3 picks (the same cap as Free's 3 choices). */
  freeDigPicksMax: 3,
  investigationDigsMax: ACCOUNT_MEMORY_LIMITS.digChildrenMax,
  reportVersionsMax: 100,
  /** A debate's place, time and purpose lines (decision 5): each one line, the person's own words or a catalogue sentence. */
  purposeLineMaxChars: 500,
  /** Decision 29: dynamic step 2. How many questions the AI may add beside the one about what the answer is for, and how long each part may be. */
  clarifyQuestionsMax: 3,
  clarifyQuestionMaxChars: 200,
  clarifyAnswersMin: 2,
  clarifyAnswersMax: 4,
  clarifyAnswerMaxChars: 120,
  /** The person's own angles on the ask page (step 2), each one line. */
  anglesMax: 5,
  /** The main answer's automatic versions served with it, newest last (decision 3). */
  mainAnswerVersionsMax: 200,
  /** A public debate's listed contributions (decision 13). */
  publicContributionsMax: 500,
  /** The points a public contribution lists on one of its dig's paths, and how long one may be. */
  publicPointsMax: 60,
  publicPointMaxChars: 4_000,
  /** A public debate's report versions served with it (decisions 13, 16). */
  publicReportsMax: 200
});

/** Owner answer Q19: Free's cap on the picks one dig combines (WEB_CONTRACT_LIMITS.freeDigPicksMax). */
export const FREE_DIG_PICKS_MAX = WEB_CONTRACT_LIMITS.freeDigPicksMax;

/**
 * R22 (owner, 31 Oct: "top 3 pages for each chosen path, truly like a first debate"): the path_ref a dig's chosen path keeps its
 * searches, pages, top pages and pack under in the web store (0132), one per pick. It names no path of the dig's own map.
 */
export function digPickPathRef(pickNo: number): string {
  return `dig-pick-${String(pickNo)}`;
}
export function isDigPickPathRef(pathRef: string): boolean {
  return /^dig-pick-[0-9]{1,3}$/u.test(pathRef);
}

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

/** Reader 1's note on a page (what it is, what it found and what it leaves out), in the site's language at the time (Q8). */
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

/**
 * One dig suggestion on a path: its text (the person may edit it before digging) and the map places it rests on.
 * V4 start step, Task 79a (owner answer Q18 A: code finds overlapping dig picks): on a path debate's suggestions only, `points`
 * names the points of the map (node ids) it rests on, so the page can see two picks resting on one point, with no AI call.
 * Absent on every R22 suggestion and on a set stored before it, which still parses.
 */
export const DigSuggestionSchema = z.object({
  suggestion_id: WebRefSchema,
  kind: DigSuggestionKindSchema,
  side: DigSuggestionSideSchema.nullable(),
  text: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.suggestionTextMaxChars),
  places: z.array(DigLinkPlaceSchema).min(1).max(ACCOUNT_MEMORY_LIMITS.digPlacesMax),
  points: z.array(z.string().min(1).max(160)).max(WEB_CONTRACT_LIMITS.suggestionPointsMax).optional()
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
 * W4-4: the 409 of "Add to researched", nothing charged and nothing kept. NOT_NOW: the debate is still running (its map is not settled).
 * WAITS_FOR_RESET: the day, week or month is full, and new starts wait for its reset (the money rule, point 4). NOT_ON_PLAN: Free reads no added page.
 */
export const RESEARCHED_REFUSALS = ["WEB_RESEARCHED_NOT_NOW", "WEB_RESEARCHED_WAITS_FOR_RESET", "WEB_RESEARCHED_NOT_ON_PLAN"] as const;
export const ResearchedRefusedSchema = z.object({ error: z.enum(RESEARCHED_REFUSALS), message: z.enum(RESEARCHED_REFUSALS) }).strict();
export type ResearchedRefused = z.infer<typeof ResearchedRefusedSchema>;

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

/**
 * R22 W3-8: the 400 body of a dig whose places and picks are not all on ONE path of the parent's map (owner Q-D1): a dig
 * only combines picks from the same path. Nothing was started and nothing charged.
 */
export const DIG_PICKS_ONE_PATH = "DIG_PICKS_ONE_PATH" as const;
export const DigPicksOnePathSchema = z.object({
  error: z.literal(DIG_PICKS_ONE_PATH),
  message: z.literal(DIG_PICKS_ONE_PATH)
}).strict();
export type DigPicksOnePath = z.infer<typeof DigPicksOnePathSchema>;

/** R22 W3-8: the 400 body of a Free dig combining more than FREE_DIG_PICKS_MAX picks (owner Q19): nothing started or charged. */
export const DIG_FREE_PICKS_MAX = "DIG_FREE_PICKS_MAX" as const;
export const DigFreePicksMaxSchema = z.object({
  error: z.literal(DIG_FREE_PICKS_MAX),
  message: z.literal(DIG_FREE_PICKS_MAX),
  picks_max: z.literal(FREE_DIG_PICKS_MAX)
}).strict();
export type DigFreePicksMax = z.infer<typeof DigFreePicksMaxSchema>;

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
 * W4-8 (owner Q-D3): the four trust words, the V4 page's codes (row D decision 2) in the order its bar shows them, and the
 * ONE rule that gives a point its word. The page places every point with it (apps/ui/lib/v4/trust.ts) and the server works
 * out a rewritten path's words with it (packages/serve/src/path-rewrites.ts), so the two never differ:
 *   the position of a path whose fate is FELL    → DIDNT_HOLD / FELL
 *   no second-AI review                          → no word yet (counted apart)
 *   dispute                                      → STILL_ARGUED / DISPUTED
 *   cannot-assess                                → STILL_ARGUED / COULD_NOT_CHECK
 *   agree, not FRESH                             → SURE_FOR_CASE / AGREED_BUT_DATED
 *   agree, REASONING                             → SURE_FOR_CASE / ARGUED_AND_AGREED
 *   agree, LOOKED_UP, the server's checked flag  → SURE / WEB_CHECKED_AND_AGREED (never on Free)
 *   agree, otherwise                             → SURE_FOR_CASE / LOOKED_UP_AND_AGREED
 * The flag (`looked_up_checked`) is the server's: true only when the point's locator is a checked extract of the debate
 * that holds the point. The rule reads no number of the engine.
 */
export const TRUST_WORDS = ["SURE", "SURE_FOR_CASE", "STILL_ARGUED", "DIDNT_HOLD"] as const;
export type TrustWord = (typeof TRUST_WORDS)[number];
export const TrustWordSchema = z.enum(TRUST_WORDS);
/** Why the rule gave a point its word (each has its own plain line on the page). */
export const TRUST_RULE_BASES = [
  "WEB_CHECKED_AND_AGREED", "LOOKED_UP_AND_AGREED", "ARGUED_AND_AGREED", "AGREED_BUT_DATED", "DISPUTED", "COULD_NOT_CHECK", "FELL"
] as const;
export type TrustRuleBasis = (typeof TRUST_RULE_BASES)[number];
/** A point as the rule reads it: the second AI's review, how fresh it is, how it is known and the server's checked flag. */
export type TrustRulePoint = Readonly<{
  review: Readonly<{ outcome: string }> | null;
  staleness_state: string;
  way_of_knowing: string;
  looked_up_checked?: boolean | undefined;
}>;
export type TrustPlaced = Readonly<{ trust: TrustWord | null; basis: TrustRuleBasis | null }>;

/** A point's trust word. `free`: its debate ran on Free (never "Sure"); `fell`: it is the position of a path that FELL. */
export function trustOfPoint(point: TrustRulePoint, where: Readonly<{ free: boolean; fell: boolean }>): TrustPlaced {
  if (where.fell) return { trust: "DIDNT_HOLD", basis: "FELL" };
  const review = point.review;
  if (review === null) return { trust: null, basis: null };
  if (review.outcome === "dispute") return { trust: "STILL_ARGUED", basis: "DISPUTED" };
  if (review.outcome === "cannot-assess") return { trust: "STILL_ARGUED", basis: "COULD_NOT_CHECK" };
  if (point.staleness_state !== "FRESH") return { trust: "SURE_FOR_CASE", basis: "AGREED_BUT_DATED" };
  if (point.way_of_knowing === "REASONING") return { trust: "SURE_FOR_CASE", basis: "ARGUED_AND_AGREED" };
  if (point.way_of_knowing === "LOOKED_UP" && point.looked_up_checked === true && !where.free) {
    return { trust: "SURE", basis: "WEB_CHECKED_AND_AGREED" };
  }
  return { trust: "SURE_FOR_CASE", basis: "LOOKED_UP_AND_AGREED" };
}

/** A debate ran on Free when its web part has a path NOT_ON_PLAN (Free never searches): its points are never "Sure". */
export function webRanOnFree(web: Readonly<{ paths: readonly Readonly<{ search: Readonly<{ status: string }> }>[] }> | null | undefined): boolean {
  return (web?.paths ?? []).some((path) => path.search.status === "NOT_ON_PLAN");
}

/** A point named by the rewrite (a node id, as the answer's points are named). */
const RewritePointRefSchema = z.string().trim().min(1).max(160);
/**
 * W4-8: the points a rewrite rests on, at most: "What the dig changed" has at most three sentences, each resting on at most
 * 40 points (the writer's answer form); and the points a rewritten path counts: its own (a story path names at most 40)
 * plus those.
 */
const REWRITE_RESTS_ON_MAX = DIG_MODEL_LIMITS.whatChangedSentencesMax * 40;
const REWRITE_TRUST_POINTS_MAX = REWRITE_RESTS_ON_MAX + 40;
/** One point a rewritten path counts, with its trust word (null: no second AI checked it, counted apart). */
export const RewritePointTrustSchema = z.object({
  node_id: RewritePointRefSchema,
  word: TrustWordSchema.nullable()
}).strict();
export type RewritePointTrust = z.infer<typeof RewritePointTrustSchema>;

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
  dig_finished_at: z.iso.datetime(),
  /**
   * Decision 2 of 31 Oct: DIG, a dig of this path; CHILD_PATH, a path below really changed, so this one was rewritten too (paid by the
   * person who dug). Absent: a rewrite from before the tree climbed, always a dig's. The contributor names a public debate's digger
   * (`contributor` null: "a contributor", the name went).
   */
  cause: z.enum(["DIG", "CHILD_PATH"]).optional(),
  contributor: z.string().trim().min(1).nullable().optional()
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
    dig_paths: z.array(DigPathLineSchema).max(WEB_CONTRACT_LIMITS.pathsMax),
    /**
     * W4-8 (Q-D3): the points "What the dig changed" rests on, by node id: the path's own and the dig's. Absent on a
     * rewrite served before W4-8; a rewrite stored before it rests on none.
     */
    rests_on: z.array(RewritePointRefSchema).max(REWRITE_RESTS_ON_MAX).optional(),
    /**
     * W4-8 (Q-D3): every point the rewritten path now counts, with its trust word, worked out by code (`trustOfPoint`):
     * its own points first, each "Sure" only by a checked extract of the debate the path is on, then the dig's points the
     * rewrite rests on, each "Sure" only by a checked extract of the dig. Words only, never a number. Absent: the page
     * places the path's own points itself, as for a path no dig rewrote.
     */
    trust: z.array(RewritePointTrustSchema).max(REWRITE_TRUST_POINTS_MAX).optional()
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
  if (rewrite.rests_on !== undefined && new Set(rewrite.rests_on).size !== rewrite.rests_on.length) {
    context.addIssue({ code: "custom", message: "each point a rewrite rests on is named once" });
  }
  if (rewrite.trust !== undefined && new Set(rewrite.trust.map((point) => point.node_id)).size !== rewrite.trust.length) {
    context.addIssue({ code: "custom", message: "each point a rewritten path counts is counted once" });
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
 * How long after a dig's rewrite is written its page keeps reading the answer for the AI's suggestions on the dig's own paths.
 * They are asked once the rewrite is stored, one call per path, all at once; each call makes at most 3 tries of at most 240 s
 * (the rewrite writer's bound), so by 12 minutes every path has its set, or its call failed and the path keeps an empty set. The
 * extra minute covers the reads and writes around the calls and the page's own 15-second reading pace. A test holds this at or
 * above the writer's bound.
 */
export const DIG_SUGGESTIONS_WATCH_MS = 13 * 60_000;

/**
 * `Answer.dig`, on a dig's own answer: what it dug (its parent, the path it rewrites, the places, its level, its picks)
 * and its rewrite of that path (whose `dig_paths` are the dig's own paths with their lines and fates). A dig of an open
 * question hanging under the main question rewrites no path (`position_ref` and `rewrite` null).
 * `suggestions_pending`: present (true) while the AI's suggestions for the dig's own paths may still arrive: its rewrite is
 * finished and was written less than DIG_SUGGESTIONS_WATCH_MS ago, it is on a paid plan below the deepest level, and one of the
 * paths its rewrite names has no set of suggestions yet (an empty set counts as a set). The page reads the answer again while it
 * is there.
 */
export const AnswerDigSchema = z.object({
  parent_run_id: z.uuid(),
  position_ref: PositionRefSchema.nullable(),
  places: z.array(DigLinkPlaceSchema).max(ACCOUNT_MEMORY_LIMITS.digPlacesMax),
  level: DugLevelSchema,
  picks: z.array(DugPickSchema).max(WEB_CONTRACT_LIMITS.digPicksMax),
  rewrite: PathRewriteSchema.nullable(),
  suggestions_pending: z.literal(true).optional()
}).strict().superRefine((dig, context) => {
  const rewrite = dig.rewrite;
  if (dig.suggestions_pending === true && (rewrite === null || !isFinished(rewrite))) {
    context.addIssue({ code: "custom", message: "suggestions are pending only after a finished rewrite" });
  }
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
export type RunContinueRefused = z.infer<typeof RunContinueRefusedSchema>;
/**
 * V4 start step, Task 57f (the owner's 7 Nov answers): the same Continue on the person's own FAILED debate. A failed debate it cannot continue
 * (erased, a stop the person caused, a spending wall, set aside by an upload, a step's tries used up) is refused with RUN_NOT_CONTINUABLE; a
 * continuable one with no room left for the rest (the person's quota or the site's day) with RUN_CONTINUE_NO_ROOM. Nothing changed either way.
 */
export const RUN_NOT_CONTINUABLE = "RUN_NOT_CONTINUABLE" as const;
export const RUN_CONTINUE_NO_ROOM = "RUN_CONTINUE_NO_ROOM" as const;
export const RunNotContinuedSchema = z.object({
  error: z.enum([RUN_NOT_CONTINUABLE, RUN_CONTINUE_NO_ROOM]),
  message: z.enum([RUN_NOT_CONTINUABLE, RUN_CONTINUE_NO_ROOM])
}).strict().refine((refused) => refused.error === refused.message, { message: "the message names the refusal" });
export type RunNotContinued = z.infer<typeof RunNotContinuedSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// The owner's changes of 31 Oct 2026 (plan 2026-10-31-r22-owner-changes.md): the shapes the lanes fill. Every member that rides an ask,
// an answer or a public snapshot is OPTIONAL there, so everything made before reads exactly as before.
// ---------------------------------------------------------------------------------------------------------------------

const PurposeLineSchema = z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.purposeLineMaxChars);

/**
 * Decision 29: one clarifying question the person answered, as asked and as answered.
 * V4 start step, Task 50b (owner answer Q4; "Goal in answer": "Always say it"): `cares`, on the answer to "What do you care about most?"
 * (the clarifying call's `cares` question, an offered or a typed answer), set by the page at Start; the run reads a stated goal from it,
 * never from the words. Absent on every other answer, and on every line stored before (a widening only).
 */
export const PurposeAnswerSchema = z.object({ question: PurposeLineSchema, answer: PurposeLineSchema, cares: z.literal(true).optional() }).strict();
export type PurposeAnswer = z.infer<typeof PurposeAnswerSchema>;

/**
 * Decision 5 and decision 29: what the person said about their question at step 2. New debates carry `answers` (the AI's clarifying questions
 * and the person's answers, the one about what the answer is for among them), `matters` and `angles` (the person's own words: an angle stays a
 * thing to investigate). `place`, `time` and `purpose` are the first shape: nothing writes them any more, and what was stored that way stays
 * readable. Stored encrypted, written at the ask, passed to every rewrite, answer update and report. An old debate has none.
 * V4 start step, Task 76d (owner answer Q4): `answers` has room for the answer to "What do you care about most?" too (a widening only:
 * every stored line still parses).
 */
export const PurposeLinesSchema = z.object({
  place: PurposeLineSchema.optional(),
  time: PurposeLineSchema.optional(),
  purpose: PurposeLineSchema.optional(),
  answers: z.array(PurposeAnswerSchema).min(1).max(WEB_CONTRACT_LIMITS.clarifyQuestionsMax + 2).optional(),
  matters: PurposeLineSchema.optional(),
  angles: z.array(PurposeLineSchema).min(1).max(WEB_CONTRACT_LIMITS.anglesMax).optional()
}).strict().refine((lines) => lines.place !== undefined || lines.time !== undefined || lines.purpose !== undefined
  || lines.answers !== undefined || lines.matters !== undefined || lines.angles !== undefined,
{ message: "at least one line" });
export type PurposeLines = z.infer<typeof PurposeLinesSchema>;

/** One answered question as the AIs and the person read it, added to the question: "Where? Bucharest." Its ending fits the script it is in. */
export function purposeAnswerSentence(answer: PurposeAnswer): string {
  const said = answer.answer.trim();
  const closed = /[.!?…。！？؟।]$/u.test(said) ? said : `${said}${/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(said) ? "。" : "."}`;
  return `${answer.question.trim()} ${closed}`;
}

/**
 * The stored lines the question's own text does not already say, in the order they were added. New debates say every one of them in
 * `question_line`, so this is empty for them unless the words were changed after step 2 (the language pop-up's rewrite); the question check
 * and the later AIs read whatever is left here, so nothing the person said is lost and nothing is read twice.
 *
 * V4 start step, Task 36 (read-d3): with `answersSaid`, the line already says every answer (the v2 page writes each one into the
 * question as a sentence, which the person may then reword or take out), so `answers` are left out as said; the other lines are read
 * as before. Without it, today's lines, byte for byte.
 */
export function purposeLinesUnsaid(questionLine: string, lines: PurposeLines | null | undefined,
  options?: Readonly<{ answersSaid?: true }>): readonly string[] {
  if (lines === null || lines === undefined) return Object.freeze([]);
  const answers = options?.answersSaid === true ? [] : (lines.answers ?? []).map(purposeAnswerSentence);
  const all = [lines.place, lines.time, lines.purpose, ...answers, lines.matters, ...(lines.angles ?? [])];
  return Object.freeze(all.filter((line): line is string => line !== undefined && !questionLine.includes(line)));
}

/**
 * The text the question check reads: the question, then each stored line it does not already say. The question alone when there are none.
 * V4 start step, Task 36 (read-d3): `answersSaid` is passed on to `purposeLinesUnsaid` (the answers count as said); without it, today's bytes.
 * Task 48: here beside `purposeLinesUnsaid` (apps/api/src/purpose-lines.ts re-exports it), so a path debate's web planners read the very
 * text the question check reads.
 */
export function questionWithPurposeLines(questionLine: string, lines: PurposeLines | null | undefined,
  options?: Readonly<{ answersSaid?: true }>): string {
  const added = purposeLinesUnsaid(questionLine, lines, options);
  return added.length === 0 ? questionLine : `${questionLine}\n\n${added.join("\n")}`;
}

/**
 * The stored lines in the later AIs' three material fields (`place`, `time`, `purpose`; field names are code's vocabulary, outside every
 * contract's seal, and no sealed instruction names them, so no new version is needed). First-shape lines stay in their own fields as they
 * always were. Decision 29's lines the question does not already say go in `purpose`, one per line, after a first-shape purpose.
 */
export function purposeLinesMaterial(questionLine: string, lines: PurposeLines | null | undefined):
Readonly<{ place: string | null; time: string | null; purpose: string | null }> {
  if (lines === null || lines === undefined) return Object.freeze({ place: null, time: null, purpose: null });
  const later = purposeLinesUnsaid(questionLine, { ...(lines.answers === undefined ? {} : { answers: lines.answers }),
    ...(lines.matters === undefined ? {} : { matters: lines.matters }), ...(lines.angles === undefined ? {} : { angles: lines.angles }) });
  const purpose = [...(lines.purpose === undefined ? [] : [lines.purpose]), ...later];
  return Object.freeze({ place: lines.place ?? null, time: lines.time ?? null, purpose: purpose.length === 0 ? null : purpose.join("\n") });
}

const ClarifyTextSchema = z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.clarifyQuestionMaxChars);
const ClarifyAnswerSchema = z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.clarifyAnswerMaxChars);

/**
 * Decision 29: one question to the person, with the answers to choose from. "Other" is the page's own, never the AI's.
 * V4 start step, Task 76d (owner answer Q5; version 2 of the call, sealed only through Task 92): `sentences`, the small AI's own sentence
 * for each answer, in the person's voice ("I mean the next 25 years."), exactly one per answer and in the same order; `about_place`, on
 * the one question that asks where (the page puts the site's country first among its answers). Both are absent from a version 1 reply.
 */
export const ClarifyQuestionSchema = z.object({
  text: ClarifyTextSchema,
  answers: z.array(ClarifyAnswerSchema).min(WEB_CONTRACT_LIMITS.clarifyAnswersMin).max(WEB_CONTRACT_LIMITS.clarifyAnswersMax),
  sentences: z.array(ClarifyTextSchema).min(WEB_CONTRACT_LIMITS.clarifyAnswersMin).max(WEB_CONTRACT_LIMITS.clarifyAnswersMax).optional(),
  about_place: z.literal(true).optional()
}).strict().refine((question) => question.sentences === undefined || question.sentences.length === question.answers.length,
  { message: "one sentence per answer", path: ["sentences"] });
export type ClarifyQuestion = z.infer<typeof ClarifyQuestionSchema>;

/**
 * read-f1 (Task 76d): the questions the page showed for an earlier wording of the question (the AI's, the purpose question and the care
 * question) and the answers the person gave them. The API reads it only once version 2 of the call is sealed.
 */
export const AskClarifyEarlierSchema = z.object({
  questions: z.array(ClarifyQuestionSchema).max(WEB_CONTRACT_LIMITS.clarifyQuestionsMax + 2),
  answers: z.array(PurposeAnswerSchema).max(WEB_CONTRACT_LIMITS.clarifyQuestionsMax + 2)
}).strict();
export type AskClarifyEarlier = z.infer<typeof AskClarifyEarlierSchema>;

/** POST /v1/asks/clarify: the question as typed. Nothing else; the person is the session's. Task 76d (read-f1): and, after a new wording, `earlier`. */
export const AskClarifyRequestSchema = z.object({ question_line: z.string().trim().min(1), earlier: AskClarifyEarlierSchema.optional() }).strict();
export type AskClarifyRequest = z.infer<typeof AskClarifyRequestSchema>;

/**
 * The questions for step 2. `AI`: up to three questions and the one about what the answer is for (absent only when the AI would not write it, even
 * asked twice). `NONE`: no AI read the question (it failed, it was too slow, the person's pool or limit is spent, or this deployment has no paid AI):
 * the page shows no questions, only the person's own-words boxes, and they carry on.
 * V4 start step, Task 76d (owner answer Q4): version 2's `cares`, the question "What do you care about most?" with 2 to 4 answers; the page
 * shows it last. It counts as a question of its own.
 */
export const AskClarifyResponseSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("AI"), questions: z.array(ClarifyQuestionSchema).max(WEB_CONTRACT_LIMITS.clarifyQuestionsMax), purpose: ClarifyQuestionSchema.optional(),
    cares: ClarifyQuestionSchema.optional() }).strict()
    .refine((reply) => reply.questions.length > 0 || reply.purpose !== undefined || reply.cares !== undefined, { message: "at least one question" }),
  z.object({ source: z.literal("NONE") }).strict()
]);
export type AskClarifyResponse = z.infer<typeof AskClarifyResponseSchema>;

/**
 * Decision 3: what made the main answer change: a first-debate path a dig rewrote, or one a deeper dig's change climbed to. V4 start step,
 * Task 55e (spec §4.4): PATH_ADDED, a dig under the main question of a path debate (a path left out before Start, "+ N more") added a
 * first-level path; its `position_ref` names that path as the investigation does (the item its pick named, such as "more-kp07").
 */
export const MAIN_ANSWER_TRIGGERS = ["PATH_REWRITE", "CHILD_PATH", "PATH_ADDED"] as const;
const MainAnswerSegmentSchema = z.object({ text: z.string().trim().min(1).max(12_000) }).strict();

/** One automatic version of the main answer. Never a score, a price or who paid. */
export const MainAnswerVersionSchema = z.object({
  version: z.number().int().positive(),
  updated_at: z.iso.datetime(),
  trigger: z.enum(MAIN_ANSWER_TRIGGERS),
  /** The path whose change made it. */
  position_ref: PositionRefSchema,
  segments: z.array(MainAnswerSegmentSchema).min(1).max(2),
  /** The check left a reservation, as on a rewrite. */
  with_reservation: z.literal(true).optional()
}).strict();
export type MainAnswerVersion = z.infer<typeof MainAnswerVersionSchema>;

/**
 * `Answer.main_answer`: the main answer as it stands now and its history, newest last. `current` is the newest version, or null while no
 * path has changed it (the first answer stands). `writing` (only ever true): a change is being written into it.
 */
export const AnswerMainAnswerSchema = z.object({
  current: MainAnswerVersionSchema.nullable(),
  history: z.array(MainAnswerVersionSchema).max(WEB_CONTRACT_LIMITS.mainAnswerVersionsMax),
  writing: z.literal(true).optional()
}).strict().superRefine((answer, context) => {
  const versions = answer.history.map((entry) => entry.version);
  if (versions.some((version, at) => at > 0 && version <= versions[at - 1]!)) {
    context.addIssue({ code: "custom", message: "the history goes oldest first" });
  }
  if ((answer.current?.version ?? null) !== (versions.at(-1) ?? null)) {
    context.addIssue({ code: "custom", message: "the current version is the newest of the history, or null when none" });
  }
});
export type AnswerMainAnswer = z.infer<typeof AnswerMainAnswerSchema>;

/**
 * Decision 13: a dig on a public debate, named by the page it was started from: `public_ref` is all a stranger knows of the debate (never
 * its run id), `dig_ref` the contribution they dig under (the update's random public reference, 0149's, from which no run id can be told; absent: the first debate).
 */
export const PublicDigParentSchema = z.object({
  public_ref: z.uuid(),
  dig_ref: z.uuid().optional(),
  places: z.array(DigLinkPlaceSchema).max(ACCOUNT_MEMORY_LIMITS.digPlacesMax),
  mode: DigLinkModeSchema,
  picks: z.array(DigPickSchema).min(1).max(WEB_CONTRACT_LIMITS.digPicksMax).optional()
}).strict();
export type PublicDigParent = z.infer<typeof PublicDigParentSchema>;

/**
 * `Answer.contribution`, on a dig made on a public debate, for the digger: CHECKING (the AI check on it is running), ON_THE_PAGE (it changed
 * the public page) or KEPT_PRIVATE (the check refused it or could not run: the dig stays theirs, and the page is unchanged). REMOVED_AFTER_REVIEW: it was on the page and was taken off after a review (decision 33); no reason and no staff name.
 * 0157 (gap 5): KEPT_PRIVATE_BY_REVIEW, it was still running when its debate was hidden, so the review kept it private, not its check; OFF_THE_PAGE_FOR_REVIEW, it
 * passed the check but is off the page while a review runs (its debate is hidden, or an earlier dig was taken out), and was not found to break any rule.
 */
export const AnswerContributionSchema = z.object({
  public_ref: z.uuid(),
  state: z.enum(["CHECKING", "ON_THE_PAGE", "KEPT_PRIVATE", "REMOVED_AFTER_REVIEW", "KEPT_PRIVATE_BY_REVIEW", "OFF_THE_PAGE_FOR_REVIEW"]),
  /** The digger's own rewrite of the path, for the digger only. Null: not written (yet), or closed by a review. Never a run id, and nothing of the debate above it. */
  rewrite: z.object({ line: z.string(), summary: z.string(), fate: StoryFateSchema, what_changed: z.array(z.string()) }).strict().nullable().optional()
}).strict();
export type AnswerContribution = z.infer<typeof AnswerContributionSchema>;

/**
 * A contribution as the public page shows it, on its path, with the date. `contributor` is a pseudonym, or null once the name went (the page
 * says "a contributor"). Every string the public sees is in the HS-S02 lists (apps/api/src/publication-check/material.ts).
 */
export const PublicContributionSchema = z.object({
  position_ref: PositionRefSchema,
  contributor: z.string().trim().min(1).nullable(),
  contributed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  line: z.string().trim().min(1).max(STORY_RUNAWAY_LIMITS.positionLineMaxChars),
  summary: z.string().trim().min(1).max(DIG_MODEL_LIMITS.summaryMaxChars),
  fate: StoryFateSchema,
  what_changed: z.array(z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.reasonMaxChars)).max(DIG_MODEL_LIMITS.whatChangedSentencesMax),
  // The random reference a later dig names (`PublicDigParent.dig_ref`), never derived from a run id, the dig this came from and whether it is that dig's own rewrite (false: a path above it that changed).
  update_ref: z.uuid().optional(),
  own_rewrite: z.boolean().optional(),
  on_ref: z.uuid().nullable().optional(),
  // The dig's own paths, for a later dig on one of them: their lines and the points argued on them, all checked before they got here.
  dig_paths: z.array(z.object({
    position_ref: PositionRefSchema,
    line: z.string().trim().min(1).max(STORY_RUNAWAY_LIMITS.positionLineMaxChars),
    fate: StoryFateSchema,
    points: z.array(z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.publicPointMaxChars)).max(WEB_CONTRACT_LIMITS.publicPointsMax)
  }).strict()).max(WEB_CONTRACT_LIMITS.pathsMax).optional()
}).strict();
export type PublicContribution = z.infer<typeof PublicContributionSchema>;

/** The public page's main answer once a contribution changed it (the first snapshot stays sealed as it was). */
export const PublicMainAnswerSchema = z.object({
  updated_at: z.iso.datetime(),
  segments: z.array(MainAnswerSegmentSchema).min(1).max(2)
}).strict();
export type PublicMainAnswer = z.infer<typeof PublicMainAnswerSchema>;

/**
 * Decision 13: what the runner may read of a public debate: the page and nothing else, sealed for it by the API under a live run's key
 * (0147's identity.public_material), because the runner holds no publication key and a stranger's AI work must read nothing private. Ids
 * here are the page's own: never a run id.
 */
const MaterialTextSchema = z.string().min(1).max(40_000);
export const PublicMaterialPointSchema = z.object({
  id: z.string().min(1).max(200),
  text: MaterialTextSchema,
  on_id: z.string().min(1).max(200).nullable(),
  side: z.enum(["for", "against"]).nullable(),
  disputed: z.boolean()
}).strict();
export const PublicMaterialExtractSchema = z.object({
  point_id: z.string().min(1).max(200),
  label: z.string().min(1).max(32),
  site: z.string().min(1).max(500),
  title: z.string().max(2_000).nullable(),
  link: z.string().max(4_000).nullable(),
  quote: z.string().min(1).max(4_000),
  note: z.string().max(4_000).nullable()
}).strict();
export const PublicMaterialPathSchema = z.object({
  ref: PositionRefSchema,
  story_line: MaterialTextSchema,
  story_fate: StoryFateSchema,
  /** Its newest text on the page, when a contribution changed it. */
  line: MaterialTextSchema,
  summary: MaterialTextSchema.nullable(),
  fate: StoryFateSchema,
  /** When that text was written (the source's time); null: the first snapshot's. */
  written_at: z.iso.datetime().nullable(),
  points: z.array(PublicMaterialPointSchema),
  extracts: z.array(PublicMaterialExtractSchema)
}).strict();
export const PublicMaterialDigSchema = z.object({
  ref: z.uuid(),
  /** The dig it was dug from (its reference), or null: the first debate. */
  parent_ref: z.uuid().nullable(),
  position_ref: PositionRefSchema,
  level: z.number().int().min(1).max(DIG_LEVEL_MAX),
  contributed_at: z.iso.datetime(),
  line: MaterialTextSchema,
  summary: MaterialTextSchema,
  fate: StoryFateSchema,
  what_changed: z.array(MaterialTextSchema),
  paths: z.array(PublicMaterialPathSchema)
}).strict();
export const PublicMaterialSchema = z.object({
  v: z.literal(1),
  publication_ref: z.uuid(),
  as_of: z.iso.datetime(),
  question: MaterialTextSchema,
  language: z.string().max(64).nullable(),
  answer: z.object({ headline: MaterialTextSchema, summary: MaterialTextSchema, change: MaterialTextSchema, confidence: MaterialTextSchema.nullable() }).strict().nullable(),
  /** The main answer as the page shows it now, with how many versions led to it; null: the first snapshot's still stands. */
  main_answer: z.object({ version: z.number().int().min(1), segments: z.array(MaterialTextSchema).min(1) }).strict().nullable(),
  paths: z.array(PublicMaterialPathSchema),
  digs: z.array(PublicMaterialDigSchema),
  /** The newest report's answer on the page, for a later version's writer (decision 26's "earlier" line). */
  earlier_report: z.object({ version: z.number().int().min(1), segments: z.array(MaterialTextSchema).min(1) }).strict().nullable()
}).strict();
export type PublicMaterial = z.infer<typeof PublicMaterialSchema>;
export type PublicMaterialPath = z.infer<typeof PublicMaterialPathSchema>;
export type PublicMaterialDig = z.infer<typeof PublicMaterialDigSchema>;
export type PublicMaterialPoint = z.infer<typeof PublicMaterialPointSchema>;

/**
 * GET /v1/account/moderation-statements (migration 0157; DSA Art 17; the owner's D1 of 6 November 2026): the signed-in person's own statements of reasons,
 * newest first. Each says what was done to which item (its debate's public reference, and the kind of piece), when, where the facts came from, how automated
 * means were used and the ground (fixed codes; `recorded` false for a step from before grounds were kept), and, here only, the facts a person typed, the
 * automatic hide's quote (to the debate's owner) and the places a correction changed. Never a staff id or the reporter's identity.
 */
export const ModerationStatementGroundCodeSchema = z.enum(["REVIEW_HOLD", "UNLAWFUL", "HATE_SPEECH", "WEAPONS_OR_DRUGS", "SUICIDE_OR_HARM", "RELIGIOUS_INSULT", "PERSONAL_DATA", "ILLEGAL"]);
export const ModerationStatementSchema = z.object({
  statement_id: z.uuid(),
  kind: z.enum(["DEBATE_HIDDEN", "DEBATE_DECIDED", "CONTRIBUTION_REMOVED", "REPORT_REMOVED", "CORRECTED", "CONTRIBUTION_AFFECTED", "REPORT_AFFECTED", "CONTRIBUTION_DECIDED", "REPORT_DECIDED",
    // 0176: how a re-publish ended a review for a person whose content left with other content.
    "CONTRIBUTION_KEPT_OFF", "REPORT_KEPT_OFF", "CONTRIBUTION_BACK", "REPORT_BACK"]),
  public_ref: z.uuid(),
  happened_at: z.iso.datetime({ offset: true }),
  piece_kind: z.enum(["DIG", "REPORT"]).nullable(),
  hidden_now: z.boolean(),
  ground: z.object({
    recorded: z.boolean(), interim: z.boolean(), grounds: z.array(ModerationStatementGroundCodeSchema).max(8), suspected: z.array(ModerationStatementGroundCodeSchema).max(8),
    sources: z.array(z.enum(["REPORT_BUTTON", "EMAIL_NOTICE", "OWN_INITIATIVE", "AUTHORITY_ORDER"])).max(4), automated_detection: z.boolean(), automated_decision: z.boolean(),
    /** 0172 (M7): the law an ILLEGAL ground relies on, as staff typed it (several, "; "-joined, only for a correction's places); null for none. */
    law: z.string().min(3).max(10_000).nullable()
  }).strict(),
  facts: z.array(z.string().max(4000)).max(50),
  facts_deleted: z.boolean(),
  quote: z.string().max(4000).nullable(),
  places: z.array(z.object({ piece_kind: z.enum(["SNAPSHOT", "UPDATE", "REPORT"]), pointer: z.string().regex(/^(\/[A-Za-z0-9_]{1,64}){1,12}$/u) }).strict()).max(200)
}).strict();
export type ModerationStatement = z.infer<typeof ModerationStatementSchema>;
export const ModerationStatementsSchema = z.object({ statements: z.array(ModerationStatementSchema).max(500) }).strict();
export type ModerationStatements = z.infer<typeof ModerationStatementsSchema>;

/** POST /v1/public/debates/{id}/report (decision 13): nothing but the press; the writer is the session's. */
/** Decision 35: "Report" on a public debate: what is wrong, and where. Bound in length: it goes to an AI the site pays for, and is kept. `good_faith`: the reporter's
 * statement that the report is accurate and complete (DSA Art 16(2)(d); Terms §10), which a notice must carry; a press without it is not a notice. */
export const PublicFlagRequestSchema = z.object({ where: z.string().trim().min(1).max(300), claim: z.string().trim().min(10).max(2000), good_faith: z.literal(true) }).strict();
export type PublicFlagRequest = z.infer<typeof PublicFlagRequestSchema>;
/** NOT_FOUND is every refusal alike. No more than these three leave the server. */
export const PublicFlagAnswerSchema = z.object({ state: z.enum(["NOT_FOUND", "HIDDEN", "WITH_A_PERSON"]) }).strict();
export type PublicFlagAnswer = z.infer<typeof PublicFlagAnswerSchema>;
export const PublicReportRequestSchema = z.object({}).strict();
export const PublicReportAcceptedSchema = z.object({ state: z.literal("WRITING"), report_version: z.number().int().min(1) }).strict();
export type PublicReportAccepted = z.infer<typeof PublicReportAcceptedSchema>;
export const PublicDebateRefusedSchema = z.object({
  error: z.enum(["PUBLIC_DEBATE_ONGOING", "PUBLIC_DEBATE_NO_CARRIER", "PUBLIC_DEBATE_WAITS_FOR_RESET", "PUBLIC_DEBATE_REPORT_WRITING", "PUBLIC_DIG_NEEDS_A_PATH"]),
  message: z.string()
}).strict();
export type PublicDebateRefused = z.infer<typeof PublicDebateRefusedSchema>;
