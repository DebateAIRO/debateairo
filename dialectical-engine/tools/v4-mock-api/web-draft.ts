/*
 * DRAFT shapes for the web search, the dig suggestions and the investigations (Perplexity plan 2026-10-30, task W1-7).
 *
 * The real shapes belong to task W1-6 (packages/contract). They were being written at the same time as this mock, so the
 * mock carries its own stand-ins here, built from the plan's description of W1-6, and every field name lives in this one
 * file. After W1-6 merges: rename the fields here to the contract's, or replace these schemas with the contract's own,
 * and the rest of the mock follows.
 *
 * How the mock serves them (server.ts): a reply that carries draft fields is sent WITH them only when the contract's own
 * schema already accepts them (W1-6 merged and the names agree). Otherwise the draft fields are held back (the strip
 * functions below) and the website gets today's shape. The full draft body is always readable at
 * /__mock/draft/<the same /v1 path>, checked against the schemas below.
 *
 * Owner rulings this follows (OWNER-ANSWERS-2026-10-29.md, "Perplexity design round" to the end): quotes of at most 120
 * characters, each with reader 1's one line; never a grade or score on the page; Free never searches ("not on this
 * plan"); a failed search says so; a path may have no search planned, with the planner's reason; dig suggestions per
 * path (contradicting, undocumented, needs more web, helps the main question for or against); one reserve, kept while an
 * investigation is open; "blocked until {reset}" when a closing found no credits left; a dig's share of today as a
 * percentage (Q14).
 */
import { z } from "zod";
import { DIG_PLACE_PATTERN, ACCOUNT_MEMORY_LIMITS } from "../../packages/contract/src/account-memory.js";

/** Every quote shown to people is at most 120 characters (owner, Romanian press law caution). W1-6 owns the real value. */
const QUOTE_MAX = 120;

export const READ_DEPTHS = ["WHOLE", "PREVIEW_ONLY", "ABSTRACT_ONLY"] as const;
export const WEB_STATUSES = ["SEARCHED", "NO_SEARCH_PLANNED", "FAILED", "NOT_ON_PLAN"] as const;
export const SUGGESTION_KINDS = ["CONTRADICTING", "UNDOCUMENTED", "NEEDS_MORE_WEB", "HELPS_FOR", "HELPS_AGAINST"] as const;
export const RESEARCHED_OUTCOMES = ["READING", "ADDS", "ADDS_NOTHING", "FAILED"] as const;
export const INVESTIGATION_STATES = ["OPEN", "CLOSED"] as const;
export const DIG_MODES = ["quick", "thorough"] as const;

/**
 * Cuts a quote to at most `max` characters at a word edge, with "…" when cut (the "…" counts). A text that already fits
 * is returned as it is.
 */
export function cutQuote(text: string, max = QUOTE_MAX): string {
  const clean = text.replace(/\s+/gu, " ").trim();
  if (clean.length <= max) return clean;
  const room = clean.slice(0, max); // the "…" takes the place of the space we cut at
  const edge = room.lastIndexOf(" ");
  const cut = (edge > 0 ? room.slice(0, edge) : clean.slice(0, max - 1)).replace(/[\s,;:.–-]+$/u, "");
  return `${cut}…`;
}

const Text = (max: number) => z.string().min(1).max(max);
const PlaceSchema = z.string().regex(DIG_PLACE_PATTERN);
const PlacesSchema = z.array(PlaceSchema).min(1).max(ACCOUNT_MEMORY_LIMITS.digPlacesMax);
const HttpsUrl = z.url({ protocol: /^https$/u });

/** One checked extract under a point: the quote (at most 120 characters), reader 1's one line, the page it is on. */
export const DraftSourceSchema = z.object({
  extract_id: z.string().regex(/^S\d{1,2}-\d{1,3}$/u),
  quote: Text(QUOTE_MAX),
  explanation: Text(300),
  title: Text(300),
  site: Text(253),
  url: HttpsUrl,
  published_on: z.iso.date().nullable(),
  read_depth: z.enum(READ_DEPTHS),
  /** Fewer readers read this page than planned (a reader failed); the page says so. */
  fewer_readers: z.boolean()
}).strict();
export type DraftSource = z.infer<typeof DraftSourceSchema>;

/** The draft fields one point (an answer node) gains. */
export const DraftNodeWebSchema = z.object({
  sources: z.array(DraftSourceSchema).max(5),
  /** Set by the server: true only when the point rests on an extract of THIS debate and the reviewer agreed. */
  looked_up_checked: z.boolean()
}).strict();
export type DraftNodeWeb = z.infer<typeof DraftNodeWebSchema>;

/** A page found for a path but not in its top 3: never a grade, only reader 1's one line. */
export const DraftOtherPageSchema = z.object({
  page_id: z.string().regex(/^W\d{1,2}-\d{1,3}$/u),
  title: Text(300),
  site: Text(253),
  url: HttpsUrl,
  line: Text(300)
}).strict();

/** A page the person added to the path's researched part, and what came of it. */
export const DraftResearchedSchema = z.object({
  page_id: z.string().regex(/^W\d{1,2}-\d{1,3}$/u),
  outcome: z.enum(RESEARCHED_OUTCOMES)
}).strict();

/** One dig suggestion on a path; the page lets the person pick it, combine it with others, or edit it. */
export const DraftDigSuggestionSchema = z.object({
  suggestion_id: z.string().regex(/^g:[A-Za-z0-9_-]{1,60}$/u),
  kind: z.enum(SUGGESTION_KINDS),
  text: Text(400),
  /** The places on this map it rests on ("p:<node>", "path:<id>", "o:<n>", "w"), so a combined dig keeps its parents. */
  places: PlacesSchema
}).strict();

const WebStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("SEARCHED") }).strict(),
  z.object({ status: z.literal("NO_SEARCH_PLANNED"), reason: Text(300) }).strict(),
  z.object({ status: z.literal("FAILED") }).strict(),
  z.object({ status: z.literal("NOT_ON_PLAN") }).strict()
]);

/** What one path (one story position) gains: its web status, other pages, researched choices and dig suggestions. */
export const DraftPathResearchSchema = z.object({
  position_ref: z.string().min(1),
  web: WebStatusSchema,
  other_pages: z.array(DraftOtherPageSchema).max(20),
  researched: z.array(DraftResearchedSchema).max(20),
  dig_suggestions: z.array(DraftDigSuggestionSchema).max(12)
}).strict().superRefine((path, context) => {
  if (path.web.status !== "SEARCHED" && (path.other_pages.length > 0 || path.researched.length > 0)) {
    context.addIssue({ code: "custom", message: "only a searched path has other pages or researched choices" });
  }
  const pages = new Set(path.other_pages.map((page) => page.page_id));
  if (path.researched.some((choice) => !pages.has(choice.page_id))) {
    context.addIssue({ code: "custom", message: "a researched choice names one of this path's other pages" });
  }
});
export type DraftPathResearch = z.infer<typeof DraftPathResearchSchema>;

export const DraftAnswerWebSchema = z.object({
  path_research: z.array(DraftPathResearchSchema).max(16)
}).strict();

/** GET /v1/runs/{id}/investigation (draft route): a debate and all its digs, one budget unit. */
export const DraftInvestigationSchema = z.object({
  investigation_id: z.uuid(),
  root_run_id: z.uuid(),
  /** OPEN until the person asks for the report ("Write my report"); a dig on a CLOSED one reopens it (never automatic). */
  state: z.enum(INVESTIGATION_STATES),
  members: z.array(z.object({
    run_id: z.uuid(),
    parent_run_id: z.uuid(),
    places: z.array(PlaceSchema).max(ACCOUNT_MEMORY_LIMITS.digPlacesMax),
    mode: z.enum(DIG_MODES)
  }).strict()).max(200),
  /** Earlier report versions stay when an investigation is reopened (owner Q5); the newest is current. */
  closings: z.array(z.object({ version: z.number().int().min(1), closed_at: z.iso.datetime() }).strict()).max(100)
}).strict().superRefine((investigation, context) => {
  if (investigation.state === "CLOSED" && investigation.closings.length === 0) {
    context.addIssue({ code: "custom", message: "a closed investigation has a report" });
  }
  if (investigation.closings.some((closing, index) => closing.version !== index + 1)) {
    context.addIssue({ code: "custom", message: "closings are numbered 1, 2, 3 … in order" });
  }
});
export type DraftInvestigation = z.infer<typeof DraftInvestigationSchema>;

/**
 * The room read's two draft words: "reserve kept" (the person's ONE reserve, enough for one closing, is held because at
 * least one investigation is open; owner Q2) and "blocked until {reset}" (a closing found no credits left, so everything
 * waits for the limit that ran out to reset).
 */
export const DraftRoomPartSchema = z.looseObject({
  room: z.enum(["FITS", "CLOSE", "FULL", "ALREADY_WAITING", "BLOCKED"]),
  reserve_kept: z.literal(true).optional()
}).superRefine((room, context) => {
  if (room.room === "BLOCKED" && (room as { resets_at?: unknown }).resets_at == null) {
    context.addIssue({ code: "custom", message: "BLOCKED says when the limit resets" });
  }
  if (room.room === "BLOCKED" && room.reserve_kept === true) {
    context.addIssue({ code: "custom", message: "a blocked room has used its reserve" });
  }
});

/** The usage read's draft part: a dig's rounded share of today, as a percentage (owner Q14), per dig mode. */
export const DraftUsagePartSchema = z.looseObject({
  dig_share: z.object({ quick: z.number().int().min(0).max(100), thorough: z.number().int().min(0).max(100) }).strict()
});

/** The ask's draft part: a dig names its parent, the places it was dug from and its mode. */
export const DraftAskParentSchema = z.object({
  parent_run_id: z.uuid(),
  places: z.array(PlaceSchema).max(ACCOUNT_MEMORY_LIMITS.digPlacesMax),
  mode: z.enum(DIG_MODES)
}).strict();
export type DraftAskParent = z.infer<typeof DraftAskParentSchema>;

// ---------------------------------------------------------------------------------------------------------------
// Holding the draft fields back (today's contract does not know them yet)
// ---------------------------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;

export function stripNode<T extends Json>(node: T): T {
  const { sources: _sources, looked_up_checked: _checked, ...rest } = node;
  return rest as T;
}

export function stripAnswer<T extends Json>(answer: T): T {
  const { path_research: _research, ...rest } = answer;
  const nodes = Array.isArray(rest.nodes) ? (rest.nodes as Json[]).map(stripNode) : rest.nodes;
  return { ...rest, nodes } as unknown as T;
}

/** "Blocked until {reset}" is read as today's FULL (a question would wait for that reset); "reserve kept" is left out. */
export function stripRoom<T extends Json>(room: T): T {
  const { reserve_kept: _reserve, ...rest } = room;
  return (rest.room === "BLOCKED" ? { ...rest, room: "FULL" } : rest) as unknown as T;
}

export function stripUsage<T extends Json>(usage: T): T {
  const { dig_share: _share, ...rest } = usage;
  return rest as unknown as T;
}

/** An ask body split into today's ask and its draft parent (absent on a new question). */
export function splitAsk(body: unknown): { ask: unknown; parent: unknown } {
  if (body === null || typeof body !== "object" || Array.isArray(body) || !("parent" in body)) return { ask: body, parent: undefined };
  const { parent, ...ask } = body as Json;
  return { ask, parent };
}

/** The draft parts of an answer, for checking against the schemas above. */
export function answerDraftParts(answer: Json): { web: unknown; nodes: Array<{ id: string; web: unknown }> } {
  const nodes = (answer.nodes as Json[]).map((node) => ({
    id: String(node.node_id),
    web: { sources: node.sources, looked_up_checked: node.looked_up_checked }
  }));
  return { web: { path_research: answer.path_research }, nodes };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Schema = { safeParse: (body: unknown) => { success: boolean } } | any;

/**
 * The body to send: the full one when the contract's own schema already accepts it (W1-6 merged, names agreeing),
 * else the draft fields held back.
 */
export function contractOrDraft<T>(schema: Schema, full: T, strip: (body: T) => T): { body: T; draft: boolean } {
  if (schema.safeParse(full).success) return { body: full, draft: true };
  return { body: strip(full), draft: false };
}
