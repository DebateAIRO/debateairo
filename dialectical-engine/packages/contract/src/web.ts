import { z } from "zod";
import { ACCOUNT_MEMORY_LIMITS, DigLinkModeSchema, DigLinkPlaceSchema, DigLinkRecordSchema } from "./account-memory.js";
import { CatalogLocaleCodeSchema } from "./locale.js";

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
