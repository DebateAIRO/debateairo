/*
 * DRAFT shapes for the web search, the dig suggestions and the investigations (Perplexity plan 2026-10-30, task W1-7).
 *
 * The real shapes belong to task W1-6 (packages/contract/src/web.ts), built at the same time as this mock. The schemas
 * below MIRROR that lane's commit 76e935bbd (branch feat/2026-10-30-px-w1-6-contract, not merged when this was written):
 * the same field names, words and rules, so the mock's bodies are what the contract will accept. After W1-6 merges,
 * import its schemas from packages/contract in place of these copies (or fix any name that changed in its review); the
 * rest of the mock follows.
 *
 * How the mock serves them (server.ts): a reply that carries draft fields is sent WITH them only when the contract's own
 * schema already accepts them (W1-6 merged). Otherwise the draft fields are held back (the strip functions below) and the
 * website gets today's shape. The full draft body is always readable at /__mock/draft/<the same /v1 path>, checked
 * against the schemas below.
 *
 * Owner rulings this follows (OWNER-ANSWERS-2026-10-29.md, "Perplexity design round" to the end): quotes of at most 120
 * characters cut at a word edge, each with reader 1's one line in the site's language; never a grade or score on the
 * page; Free never searches ("not on this plan"); a failed search says so; a path may have no search planned, with the
 * planner's reason; dig suggestions per path (contradicting, undocumented, needs more web, helps the main question for or
 * against); one reserve, kept while an investigation is open; "blocked until {reset}" when a closing found no credits
 * left; a dig's share of today as a percentage (Q14).
 */
import { z } from "zod";
import { ACCOUNT_MEMORY_LIMITS, DigLinkModeSchema, DigLinkPlaceSchema, DigLinkRecordSchema } from "../../packages/contract/src/account-memory.js";
import { CatalogLocaleCodeSchema } from "../../packages/contract/src/locale.js";

/** W1-6's WEB_CONTRACT_LIMITS, as far as the mock needs them (not exported: W1-6 owns the values). */
const LIMITS = Object.freeze({
  quoteMaxChars: 120,
  explanationMaxChars: 600,
  reasonMaxChars: 1000,
  titleMaxChars: 500,
  siteMaxChars: 253,
  linkMaxChars: 2048,
  suggestionTextMaxChars: 1000,
  pickTextMaxChars: 2000,
  sourcesPerPointMax: 8,
  otherPagesPerPathMax: 100,
  suggestionsPerPathMax: 20,
  pathsMax: 8,
  digPicksMax: ACCOUNT_MEMORY_LIMITS.digPlacesMax,
  investigationDigsMax: ACCOUNT_MEMORY_LIMITS.digChildrenMax,
  reportVersionsMax: 100
});

export const READ_DEPTHS = ["WHOLE", "PREVIEW_ONLY", "ABSTRACT_ONLY"] as const;
export const WEB_SEARCH_STATUSES = ["SEARCHED", "NO_SEARCH_PLANNED", "FAILED", "NOT_ON_PLAN", "SWITCHED_OFF"] as const;
export const SUGGESTION_KINDS = ["CONTRADICTING", "UNDOCUMENTED", "NEEDS_MORE_WEB", "HELPS_MAIN_QUESTION"] as const;
export const SUGGESTION_SIDES = ["FOR", "AGAINST"] as const;
export const RESEARCHED_STATES = ["READING", "ADDS", "ADDS_NOTHING", "FAILED"] as const;

/**
 * The quote people see (W1-6's cutQuoteAtWordEdge): single spaces; when longer than 120 characters (Unicode characters,
 * never split), cut after its last whole word with "…" (counted in the limit). A single word longer than the limit is
 * cut hard. A short, clean quote comes back unchanged.
 */
export function cutQuote(text: string, maxChars: number = LIMITS.quoteMaxChars): string {
  const clean = text.replace(/\s+/gu, " ").trim();
  const characters = Array.from(clean);
  if (characters.length <= maxChars) return clean;
  const room = characters.slice(0, maxChars - 1);
  const lastSpace = characters[maxChars - 1] === " " ? room.length : room.lastIndexOf(" ");
  const kept = (lastSpace > 0 ? room.slice(0, lastSpace) : room).join("").replace(/[\s,;:\-–—]+$/u, "");
  return `${kept.length > 0 ? kept : room.join("")}…`;
}

const QuoteSchema = z.string().min(1).refine((quote) => cutQuote(quote) === quote, { message: "WEB_QUOTE_NOT_CUT" });
const WebRefSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/u);
const PositionRefSchema = z.string().trim().min(1).max(160);

/** Reader 1's one line about a page, in the site's language at the time (Q8). */
const ExplanationSchema = z.object({
  text: z.string().trim().min(1).max(LIMITS.explanationMaxChars),
  language: CatalogLocaleCodeSchema
}).strict();

const PageFields = {
  title: z.string().trim().min(1).max(LIMITS.titleMaxChars).nullable(),
  site: z.string().trim().min(1).max(LIMITS.siteMaxChars),
  link: z.url({ protocol: /^https?$/u }).max(LIMITS.linkMaxChars),
  read_depth: z.enum(READ_DEPTHS),
  explanation: ExplanationSchema.nullable()
};

/** One checked extract under a point. `fewer_readers` (only ever true): a reader failed, so fewer read the page. */
export const DraftSourceSchema = z.object({
  extract_id: z.string().regex(/^S[0-9]{1,4}-[0-9]{1,4}$/u),
  quote: QuoteSchema,
  ...PageFields,
  published_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable(),
  fewer_readers: z.literal(true).optional()
}).strict();
export type DraftSource = z.infer<typeof DraftSourceSchema>;

/** The draft fields one point (an answer node) gains; both optional on the contract's node. */
export const DraftNodeWebSchema = z.object({
  sources: z.array(DraftSourceSchema).max(LIMITS.sourcesPerPointMax),
  /** Set by the server: the point is LOOKED_UP and its locator is one of its own sources' extract ids. */
  looked_up_checked: z.boolean()
}).strict();
export type DraftNodeWeb = z.infer<typeof DraftNodeWebSchema>;

/** "Add to researched" (Q7): READING, then ADDS (with the checked quotes that joined the path), ADDS_NOTHING or FAILED. */
const ResearchedSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("READING") }).strict(),
  z.object({ state: z.literal("ADDS"), sources: z.array(DraftSourceSchema).min(1).max(LIMITS.sourcesPerPointMax) }).strict(),
  z.object({ state: z.literal("ADDS_NOTHING") }).strict(),
  z.object({ state: z.literal("FAILED") }).strict()
]);

/** A page found outside the path's top pages: reader 1's line, never a grade; `researched` once the person added it. */
export const DraftOtherPageSchema = z.object({
  page_ref: WebRefSchema,
  ...PageFields,
  researched: ResearchedSchema.optional()
}).strict();
export type DraftOtherPage = z.infer<typeof DraftOtherPageSchema>;

const SearchStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("SEARCHED") }).strict(),
  z.object({ status: z.literal("NO_SEARCH_PLANNED"), reason: z.string().trim().min(1).max(LIMITS.reasonMaxChars).nullable() }).strict(),
  z.object({ status: z.literal("FAILED") }).strict(),
  z.object({ status: z.literal("NOT_ON_PLAN") }).strict(),
  z.object({ status: z.literal("SWITCHED_OFF") }).strict()
]);

/** One dig suggestion on a path; only "helps the main question" names a side, and it always does. */
export const DraftDigSuggestionSchema = z.object({
  suggestion_id: WebRefSchema,
  kind: z.enum(SUGGESTION_KINDS),
  side: z.enum(SUGGESTION_SIDES).nullable(),
  text: z.string().trim().min(1).max(LIMITS.suggestionTextMaxChars),
  places: z.array(DigLinkPlaceSchema).min(1).max(ACCOUNT_MEMORY_LIMITS.digPlacesMax)
}).strict().superRefine((suggestion, context) => {
  if ((suggestion.kind === "HELPS_MAIN_QUESTION") !== (suggestion.side !== null)) {
    context.addIssue({ code: "custom", message: "only a 'helps the main question' suggestion names a side, and it always does" });
  }
});
export type DraftDigSuggestion = z.infer<typeof DraftDigSuggestionSchema>;

/** The web part of one path: its search, the other pages found (only if it searched), and its dig suggestions. */
export const DraftWebPathSchema = z.object({
  position_ref: PositionRefSchema,
  search: SearchStatusSchema,
  other_pages: z.array(DraftOtherPageSchema).max(LIMITS.otherPagesPerPathMax),
  suggestions: z.array(DraftDigSuggestionSchema).max(LIMITS.suggestionsPerPathMax)
}).strict().superRefine((path, context) => {
  if (path.search.status !== "SEARCHED" && path.other_pages.length > 0) {
    context.addIssue({ code: "custom", message: "only a path that searched lists other pages" });
  }
});
export type DraftWebPath = z.infer<typeof DraftWebPathSchema>;

/** `Answer.web`: one entry per path, each path once. */
export const DraftAnswerWebSchema = z.object({
  paths: z.array(DraftWebPathSchema).max(LIMITS.pathsMax)
}).strict().superRefine((web, context) => {
  if (new Set(web.paths.map((path) => path.position_ref)).size !== web.paths.length) {
    context.addIssue({ code: "custom", message: "each path is listed once" });
  }
});

/** One pick of a dig: a suggestion (as sent, edited or not) or the person's own view, at a place on the parent's map. */
const DigPickSchema = z.object({
  kind: z.enum([...SUGGESTION_KINDS, "OWN_VIEW"]),
  suggestion_id: WebRefSchema.nullable(),
  place: DigLinkPlaceSchema,
  text: z.string().trim().min(1).max(LIMITS.pickTextMaxChars)
}).strict().superRefine((pick, context) => {
  if ((pick.kind === "OWN_VIEW") !== (pick.suggestion_id === null)) {
    context.addIssue({ code: "custom", message: "a suggestion pick names its suggestion; the person's own view names none" });
  }
});

/** `AskRequest.parent`: the ask is a dig of `parent_run_id`, at `places` on its map, quick or thorough, made of `picks`. */
export const DraftAskParentSchema = z.object({
  parent_run_id: z.uuid(),
  places: z.array(DigLinkPlaceSchema).max(ACCOUNT_MEMORY_LIMITS.digPlacesMax),
  mode: DigLinkModeSchema,
  picks: z.array(DigPickSchema).min(1).max(LIMITS.digPicksMax).optional()
}).strict();
export type DraftAskParent = z.infer<typeof DraftAskParentSchema>;

/** One closing ("Write my report"): its report version and how its report stands. */
const ClosingSchema = z.object({
  report_version: z.number().int().positive(),
  closed_at: z.iso.datetime(),
  report: z.enum(["WRITING", "READY", "FAILED"]),
  answer_id: z.string().min(1).nullable()
}).strict();

/** An investigation: a debate and all its digs. OPEN until the person closes it; a dig reopens it; closings are kept. */
export const DraftInvestigationSchema = z.object({
  investigation_id: z.uuid(),
  root_run_id: z.uuid(),
  state: z.enum(["OPEN", "CLOSED"]),
  digs: z.array(DigLinkRecordSchema).max(LIMITS.investigationDigsMax),
  closings: z.array(ClosingSchema).max(LIMITS.reportVersionsMax)
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
export type DraftInvestigation = z.infer<typeof DraftInvestigationSchema>;

/**
 * The room read's draft part: `reserve` KEPT (the person's ONE reserve is held back so an investigation can always be
 * closed) or BLOCKED (a closing found no credits left: a FULL person window, until its reset), and `dig_share_percent`
 * (a dig's share of today in steps of 5, only on a read asked for a dig, Q14).
 */
const PERSON_SCOPES = new Set(["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH"]);
export const DraftRoomPartSchema = z.looseObject({
  room: z.enum(["FITS", "CLOSE", "FULL", "ALREADY_WAITING"]),
  scope: z.string().nullable(),
  reserve: z.enum(["KEPT", "BLOCKED"]).optional(),
  dig_share_percent: z.number().int().min(0).max(100).multipleOf(5).optional()
}).superRefine((room, context) => {
  if (room.reserve === "BLOCKED" && (room.room !== "FULL" || !PERSON_SCOPES.has(room.scope ?? ""))) {
    context.addIssue({ code: "custom", message: "BLOCKED names a full person window and its reset" });
  }
});

/** The room query's draft part: a read for a dig names its parent, its mode and how many picks it combines. */
export const DraftRoomQueryPartSchema = z.object({
  dig_parent: z.uuid().optional(),
  dig_mode: DigLinkModeSchema.optional(),
  dig_picks: z.string().regex(/^[0-9]{1,2}$/u).optional()
}).strict().superRefine((query, context) => {
  if (query.dig_parent === undefined && (query.dig_mode !== undefined || query.dig_picks !== undefined)) {
    context.addIssue({ code: "custom", message: "dig_mode and dig_picks go only beside dig_parent" });
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Holding the draft fields back (today's contract does not know them yet)
// ---------------------------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;

export function stripNode<T extends Json>(node: T): T {
  const { sources: _sources, looked_up_checked: _checked, ...rest } = node;
  return rest as T;
}

export function stripAnswer<T extends Json>(answer: T): T {
  const { web: _web, ...rest } = answer;
  const nodes = Array.isArray(rest.nodes) ? (rest.nodes as Json[]).map(stripNode) : rest.nodes;
  return { ...rest, nodes } as unknown as T;
}

/** Without `reserve` and `dig_share_percent`, a BLOCKED room is today's FULL (a question waits for that reset). */
export function stripRoom<T extends Json>(room: T): T {
  const { reserve: _reserve, dig_share_percent: _share, ...rest } = room;
  return rest as unknown as T;
}

/** A room query split into today's query and its draft dig part. */
export function splitRoomQuery(query: Readonly<Record<string, string>>): { query: Record<string, string>; dig: Record<string, string> } {
  const today: Record<string, string> = {};
  const dig: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) (key.startsWith("dig_") ? dig : today)[key] = value;
  return { query: today, dig };
}

/** An ask body split into today's ask and its draft parent (absent on a new question). */
export function splitAsk(body: unknown): { ask: unknown; parent: unknown } {
  if (body === null || typeof body !== "object" || Array.isArray(body) || !("parent" in body)) return { ask: body, parent: undefined };
  const { parent, ...ask } = body as Json;
  return { ask, parent };
}

/** The draft parts of an answer, for checking against the schemas above, plus W1-6's answer-level rule. */
export function answerDraftProblems(answer: Json): string[] {
  const problems: string[] = [];
  const web = DraftAnswerWebSchema.safeParse(answer.web);
  if (!web.success) problems.push(`web: ${JSON.stringify(web.error.issues)}`);
  for (const node of answer.nodes as Json[]) {
    const result = DraftNodeWebSchema.safeParse({ sources: node.sources, looked_up_checked: node.looked_up_checked });
    if (!result.success) problems.push(`node ${String(node.node_id)}: ${JSON.stringify(result.error.issues)}`);
    // W1-6: the checked flag stands only on a looked-up point whose locator is one of its own sources.
    const sources = Array.isArray(node.sources) ? (node.sources as Json[]) : [];
    if (node.looked_up_checked === true && (node.way_of_knowing !== "LOOKED_UP" || !sources.some((source) => source.extract_id === node.locator))) {
      problems.push(`node ${String(node.node_id)}: looked_up_checked needs a looked-up point whose locator is one of its sources`);
    }
  }
  return problems;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Schema = { safeParse: (body: unknown) => { success: boolean } } | any;

/**
 * The body to send: the full one when the contract's own schema already accepts it (W1-6 merged), else the draft fields
 * held back.
 */
export function contractOrDraft<T>(schema: Schema, full: T, strip: (body: T) => T): { body: T; draft: boolean } {
  if (schema.safeParse(full).success) return { body: full, draft: true };
  return { body: strip(full), draft: false };
}
