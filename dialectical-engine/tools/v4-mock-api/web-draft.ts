/*
 * The web search, dig suggestion and investigation shapes the mock serves (Perplexity plan 2026-10-30, tasks W1-7, W2-6).
 *
 * Task W1-6 merged (76e935bbd), so every schema here now COMES FROM the contract (packages/contract/src/web.ts and the
 * node, answer, room and ask schemas in packages/contract/src/index.ts); W2-6 replaced the copies W1-7 made while the two
 * lanes ran side by side. The "Draft…" names stay so the rest of the mock and its test read as before; a later lane may
 * rename them. Two small schemas stay here because the contract holds their rules inside larger ones: the node's two web
 * fields on their own (required here, so the seed always states them), and the room read's and room query's web parts.
 *
 * How the mock serves them (server.ts): a reply that carries these fields is sent WITH them when the contract's own schema
 * accepts them, which it now does; the strip functions below (the fields held back) stay as the fallback for a mock run
 * against an older contract (MOCK_ENGINE_DIR). The full body is also readable at /__mock/draft/<the same /v1 path>.
 *
 * Owner rulings this follows (OWNER-ANSWERS-2026-10-29.md, "Perplexity design round" to the end): quotes of at most 120
 * characters cut at a word edge, each with reader 1's one line in the site's language; never a grade or score on the
 * page; Free never searches ("not on this plan"); a failed search says so; a path may have no search planned, with the
 * planner's reason; dig suggestions per path (contradicting, undocumented, needs more web, helps the main question for or
 * against); one reserve, kept while an investigation is open; "blocked until {reset}" when a closing found no credits
 * left; a dig's share of today as a percentage (Q14).
 */
import { z } from "zod";
import { DigLinkModeSchema } from "../../packages/contract/src/account-memory.js";
import {
  AnswerWebSchema,
  AskParentSchema,
  cutQuoteAtWordEdge,
  DebateInvestigationSchema,
  DIG_SUGGESTION_KINDS,
  DigSharePercentSchema,
  DigSuggestionSchema,
  DigSuggestionSideSchema,
  RoomReserveSchema,
  WEB_CONTRACT_LIMITS,
  WEB_READ_DEPTHS,
  WEB_RESEARCHED_STATES,
  WEB_SEARCH_STATUSES,
  WebOtherPageSchema,
  WebPathSchema,
  WebSourceSchema,
  type AskParent,
  type DebateInvestigation,
  type DigSuggestion,
  type WebOtherPage,
  type WebPath,
  type WebSource
} from "../../packages/contract/src/web.js";

export const READ_DEPTHS = WEB_READ_DEPTHS;
export { WEB_SEARCH_STATUSES };
export const SUGGESTION_KINDS = DIG_SUGGESTION_KINDS;
export const SUGGESTION_SIDES = DigSuggestionSideSchema.options;
export const RESEARCHED_STATES = WEB_RESEARCHED_STATES;

/** The quote people see: the contract's cut (at most 120 characters, at a word edge, with "…"). */
export function cutQuote(text: string, maxChars: number = WEB_CONTRACT_LIMITS.quoteMaxChars): string {
  return cutQuoteAtWordEdge(text, maxChars);
}

/** One checked extract under a point (the contract's WebSourceSchema). */
export const DraftSourceSchema = WebSourceSchema;
export type DraftSource = WebSource;

/**
 * The two web fields one point (an answer node) gains, both REQUIRED here so the seed always states them (optional on
 * the contract's node). The contract's AnswerSchema adds the rule that the flag needs the locator among the sources.
 */
export const DraftNodeWebSchema = z.object({
  sources: z.array(WebSourceSchema).max(WEB_CONTRACT_LIMITS.sourcesPerPointMax),
  /** Set by the server: the point is LOOKED_UP and its locator is one of its own sources' extract ids. */
  looked_up_checked: z.boolean()
}).strict();
export type DraftNodeWeb = z.infer<typeof DraftNodeWebSchema>;

/** A page found outside the path's top pages (the contract's WebOtherPageSchema). */
export const DraftOtherPageSchema = WebOtherPageSchema;
export type DraftOtherPage = WebOtherPage;

/** One dig suggestion on a path (the contract's DigSuggestionSchema). */
export const DraftDigSuggestionSchema = DigSuggestionSchema;
export type DraftDigSuggestion = DigSuggestion;

/** The web part of one path (the contract's WebPathSchema). */
export const DraftWebPathSchema = WebPathSchema;
export type DraftWebPath = WebPath;

/** `Answer.web` (the contract's AnswerWebSchema). */
export const DraftAnswerWebSchema = AnswerWebSchema;

/** `AskRequest.parent` (the contract's AskParentSchema). */
export const DraftAskParentSchema = AskParentSchema;
export type DraftAskParent = AskParent;

/** An investigation (the contract's DebateInvestigationSchema). */
export const DraftInvestigationSchema = DebateInvestigationSchema;
export type DraftInvestigation = DebateInvestigation;

/**
 * The room read's web part, with the contract's words (RoomReserveSchema, DigSharePercentSchema) and its rule (BLOCKED
 * names a full person window and its reset); the rest of the room read is the contract's AskRoomResponseSchema.
 */
const PERSON_SCOPES = new Set(["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH"]);
export const DraftRoomPartSchema = z.looseObject({
  room: z.enum(["FITS", "CLOSE", "FULL", "ALREADY_WAITING"]),
  scope: z.string().nullable(),
  reserve: RoomReserveSchema.optional(),
  dig_share_percent: DigSharePercentSchema.optional()
}).superRefine((room, context) => {
  if (room.reserve === "BLOCKED" && (room.room !== "FULL" || !PERSON_SCOPES.has(room.scope ?? ""))) {
    context.addIssue({ code: "custom", message: "BLOCKED names a full person window and its reset" });
  }
});

/**
 * The room query's dig part as the query string carries it (strings), with the contract's rules (AskRoomQuerySchema):
 * a read for a dig names its parent, its mode and how many picks it combines; the mode and the picks only beside a parent.
 */
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
