import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AnswerSchema, AnswerWebSchema, AskParentSchema, AskRequestSchema, AskRoomQuerySchema, AskRoomResponseSchema,
  DIG_SUGGESTION_KINDS, DebateInvestigationSchema, DigSuggestionSchema, FREE_DIG_PICKS_MAX, InvestigationCloseRequestSchema,
  NodeSchema, PublicNodeSchema, ResearchedAddRequestSchema, ResearchedAddedSchema, WEB_CONTRACT_LIMITS, WebOtherPageSchema,
  WebPathSchema, WebSourceSchema, contractInventory, cutQuoteAtWordEdge, digSharePercent, type Answer
} from "../../packages/contract/src/index.js";
import { createContractClient } from "../../packages/contract/src/client.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/**
 * W1-6 (plan 2026-10-30, owner answers 30 Oct): the outside shapes of web search, dig suggestions and investigations.
 * Every new field is optional, so every answer, ask and room read made before them reads exactly as before.
 */
const RUN = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const INVESTIGATION = "33333333-3333-4333-8333-333333333333";
const codePoints = (text: string) => Array.from(text).length;

const SOURCE = Object.freeze({
  extract_id: "S2-3",
  quote: "Net salaries for nurses rose by a fifth between 2023 and 2025.",
  explanation: { text: "A national statistics report with the yearly pay figures.", language: "en" },
  title: "Health workforce report 2025",
  site: "stats.example.test",
  link: "https://stats.example.test/reports/health-2025",
  published_on: "2025-11-04",
  read_depth: "WHOLE"
});

const OTHER_PAGE = Object.freeze({
  page_ref: "page-7",
  title: "A short news piece",
  site: "news.example.test",
  link: "https://news.example.test/a/1",
  read_depth: "PREVIEW_ONLY",
  explanation: { text: "Repeats the report's headline figure without the method.", language: "en" }
});

const SUGGESTION = Object.freeze({
  suggestion_id: "sg-1",
  kind: "CONTRADICTING",
  side: null,
  text: "The two readers split on whether the report counts part-time nurses.",
  places: ["path:p-1", "p:n-4"]
});

const ASK = Object.freeze({
  question_line: "Should I move to Germany to work as a nurse?",
  risk_tier: "standard", tier_source: "ASKER", tier_provenance_ref: "page", composition_budget_tier: "medium",
  depth_params: { depth: 2 }, decision_scope: "personal", as_of: "2026-10-30T08:00:00.000Z",
  steering_presets: [], plan_tier: "premium", steering_annotations: []
});

const ROOM_FITS = Object.freeze({ room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS" });

/** The fixture answer with one looked-up point resting on SOURCE, and the web block for its one path. */
function webAnswer(overrides: Partial<Answer> = {}): Record<string, unknown> {
  const base = buildFairShapedAnswer();
  const [position, ...rest] = base.nodes;
  return {
    ...base,
    nodes: [{ ...position!, way_of_knowing: "LOOKED_UP", locator: "S2-3", sources: [SOURCE], looked_up_checked: true }, ...rest],
    web: { paths: [{ position_ref: position!.node_id, search: { status: "SEARCHED" }, other_pages: [OTHER_PAGE], suggestions: [SUGGESTION] }] },
    ...overrides
  };
}

describe("W1-6 quotes: at most 120 characters, cut at a word edge", () => {
  it("leaves a short quote as it is, with its spaces made single", () => {
    expect(cutQuoteAtWordEdge("  A short   quote.\n")).toBe("A short quote.");
    expect(WEB_CONTRACT_LIMITS.quoteMaxChars).toBe(120);
  });

  it("cuts a long quote at the last whole word and marks the cut", () => {
    const long = "The ministry's report says that the number of nurses who left the country rose every year from 2019, and that most went to Germany.";
    const cut = cutQuoteAtWordEdge(long);
    expect(codePoints(cut)).toBeLessThanOrEqual(120);
    expect(cut.endsWith("…")).toBe(true);
    const body = cut.slice(0, -1);
    expect(long.startsWith(body)).toBe(true);
    // A word edge: what follows the kept text in the original is a space (or a dropped comma before one).
    expect(/^[,;:]?\s/u.test(long.slice(body.length))).toBe(true);
  });

  it("counts characters, not code units, and never splits one", () => {
    const romanian = "ă".repeat(60) + " " + "ș".repeat(59);
    expect(codePoints(romanian)).toBe(120);
    expect(cutQuoteAtWordEdge(romanian)).toBe(romanian);
    const emoji = "😀".repeat(130);
    const cut = cutQuoteAtWordEdge(emoji);
    expect(codePoints(cut)).toBe(120);
    expect(Array.from(cut.slice(0, -1)).every((point) => point === "😀")).toBe(true);
  });

  it("cuts one very long word hard, still within 120", () => {
    const cut = cutQuoteAtWordEdge("x".repeat(400));
    expect(cut).toBe("x".repeat(119) + "…");
  });

  it("a source's quote is always a cut quote: 120 at most, trimmed, single spaces", () => {
    expect(WebSourceSchema.safeParse(SOURCE).success).toBe(true);
    for (const quote of ["", "x".repeat(121), " leading", "two  spaces", "line\nbreak"]) {
      expect(WebSourceSchema.safeParse({ ...SOURCE, quote }).success, JSON.stringify(quote)).toBe(false);
    }
    expect(WebSourceSchema.safeParse({ ...SOURCE, quote: cutQuoteAtWordEdge("y ".repeat(300)) }).success).toBe(true);
  });
});

describe("W1-6 sources under a point", () => {
  it("carries the extract id, the quote, reader 1's line in the site's language, title, site, link, date and read depth", () => {
    expect(WebSourceSchema.parse(SOURCE)).toEqual(SOURCE);
    expect(WebSourceSchema.safeParse({ ...SOURCE, explanation: null, title: null, published_on: null }).success).toBe(true);
    expect(WebSourceSchema.safeParse({ ...SOURCE, read_depth: "ABSTRACT_ONLY", fewer_readers: true }).success).toBe(true);
    expect(WebSourceSchema.safeParse({ ...SOURCE, fewer_readers: false }).success).toBe(false);
    expect(WebSourceSchema.safeParse({ ...SOURCE, explanation: { text: "x", language: "en-US" } }).success).toBe(false);
    expect(WebSourceSchema.safeParse({ ...SOURCE, read_depth: "SNIPPET" }).success).toBe(false);
    expect(WebSourceSchema.safeParse({ ...SOURCE, extract_id: "page-1" }).success).toBe(false);
    expect(WebSourceSchema.safeParse({ ...SOURCE, published_on: "4 Nov 2025" }).success).toBe(false);
    for (const link of ["ftp://stats.example.test/a", "javascript:alert(1)", "not a link"]) {
      expect(WebSourceSchema.safeParse({ ...SOURCE, link }).success, link).toBe(false);
    }
  });

  it("never carries a grade or a score", () => {
    for (const extra of [{ grade: 3 }, { score: 0.8 }, { reader_grades: [3, 2] }]) {
      expect(WebSourceSchema.safeParse({ ...SOURCE, ...extra }).success).toBe(false);
      expect(WebOtherPageSchema.safeParse({ ...OTHER_PAGE, ...extra }).success).toBe(false);
    }
  });

  it("an old point (no sources, no flag) reads as before; a new point carries both", () => {
    const old = buildFairShapedAnswer();
    expect(AnswerSchema.parse(old)).toEqual(old);
    expect(NodeSchema.shape.sources.safeParse(undefined).success).toBe(true);
    expect(NodeSchema.shape.looked_up_checked.safeParse(undefined).success).toBe(true);
    expect(AnswerSchema.safeParse(webAnswer()).success).toBe(true);
    expect(PublicNodeSchema.shape.sources.safeParse([SOURCE]).success).toBe(true);
  });

  it("the server's checked flag stands only on a looked-up point whose locator is one of its sources", () => {
    const base = webAnswer() as { nodes: Array<Record<string, unknown>> };
    const withPosition = (change: Record<string, unknown>) => webAnswer({ nodes: [{ ...base.nodes[0], ...change }, ...base.nodes.slice(1)] as Answer["nodes"] });
    expect(AnswerSchema.safeParse(withPosition({ looked_up_checked: false })).success).toBe(true);
    expect(AnswerSchema.safeParse(withPosition({ way_of_knowing: "REASONING" })).success).toBe(false);
    expect(AnswerSchema.safeParse(withPosition({ locator: "S9-9" })).success).toBe(false);
    expect(AnswerSchema.safeParse(withPosition({ sources: [] })).success).toBe(false);
    // A remembered citation: looked up, a locator, no checked source. Allowed, but never flagged.
    expect(AnswerSchema.safeParse(withPosition({ locator: "Eurostat 2024", sources: undefined, looked_up_checked: false })).success).toBe(true);
  });
});

describe("W1-6 the web part of each path", () => {
  it("an old answer has no web part; a new one lists each path once", () => {
    expect(AnswerSchema.shape.web.safeParse(undefined).success).toBe(true);
    const twice = webAnswer();
    const path = (twice.web as { paths: unknown[] }).paths[0];
    expect(AnswerWebSchema.safeParse({ paths: [path, path] }).success).toBe(false);
  });

  it("names its search status in five words, the planner's reason only on no search planned", () => {
    const path = (search: unknown, other_pages: unknown[] = []) => ({ position_ref: "n-1", search, other_pages, suggestions: [] });
    expect(WebPathSchema.safeParse(path({ status: "SEARCHED" }, [OTHER_PAGE])).success).toBe(true);
    expect(WebPathSchema.safeParse(path({ status: "NO_SEARCH_PLANNED", reason: "It turns only on what the person values." })).success).toBe(true);
    expect(WebPathSchema.safeParse(path({ status: "NO_SEARCH_PLANNED", reason: null })).success).toBe(true);
    expect(WebPathSchema.safeParse(path({ status: "NO_SEARCH_PLANNED" })).success).toBe(false);
    for (const status of ["FAILED", "NOT_ON_PLAN", "SWITCHED_OFF"]) {
      expect(WebPathSchema.safeParse(path({ status })).success, status).toBe(true);
      expect(WebPathSchema.safeParse(path({ status, reason: "x" })).success, status).toBe(false);
      // Pages exist only where a search ran.
      expect(WebPathSchema.safeParse(path({ status }, [OTHER_PAGE])).success, status).toBe(false);
    }
    expect(WebPathSchema.safeParse(path({ status: "SKIPPED" })).success).toBe(false);
  });

  it("an other page carries reader 1's line, never a grade, and the outcome of 'add to researched'", () => {
    expect(WebOtherPageSchema.safeParse(OTHER_PAGE).success).toBe(true);
    expect(WebOtherPageSchema.safeParse({ ...OTHER_PAGE, researched: { state: "READING" } }).success).toBe(true);
    expect(WebOtherPageSchema.safeParse({ ...OTHER_PAGE, researched: { state: "ADDS", sources: [SOURCE] } }).success).toBe(true);
    expect(WebOtherPageSchema.safeParse({ ...OTHER_PAGE, researched: { state: "ADDS", sources: [] } }).success).toBe(false);
    expect(WebOtherPageSchema.safeParse({ ...OTHER_PAGE, researched: { state: "ADDS_NOTHING" } }).success).toBe(true);
    expect(WebOtherPageSchema.safeParse({ ...OTHER_PAGE, researched: { state: "ADDS_NOTHING", sources: [SOURCE] } }).success).toBe(false);
    expect(WebOtherPageSchema.safeParse({ ...OTHER_PAGE, researched: { state: "FAILED" } }).success).toBe(true);
    expect(ResearchedAddRequestSchema.safeParse({ position_ref: "n-1", page_ref: "page-7" }).success).toBe(true);
    expect(ResearchedAddRequestSchema.safeParse({ position_ref: "n-1", page_ref: "page-7", link: OTHER_PAGE.link }).success).toBe(false);
    expect(ResearchedAddedSchema.safeParse({ state: "READING" }).success).toBe(true);
    expect(ResearchedAddedSchema.safeParse({ state: "ADDS" }).success).toBe(false);
  });

  it("dig suggestions come in the four kinds; only 'helps the main question' names a side; each rests on places", () => {
    expect([...DIG_SUGGESTION_KINDS]).toEqual(["CONTRADICTING", "UNDOCUMENTED", "NEEDS_MORE_WEB", "HELPS_MAIN_QUESTION"]);
    expect(DigSuggestionSchema.safeParse(SUGGESTION).success).toBe(true);
    expect(DigSuggestionSchema.safeParse({ ...SUGGESTION, kind: "HELPS_MAIN_QUESTION", side: "FOR" }).success).toBe(true);
    expect(DigSuggestionSchema.safeParse({ ...SUGGESTION, kind: "HELPS_MAIN_QUESTION", side: "AGAINST" }).success).toBe(true);
    expect(DigSuggestionSchema.safeParse({ ...SUGGESTION, kind: "HELPS_MAIN_QUESTION", side: null }).success).toBe(false);
    expect(DigSuggestionSchema.safeParse({ ...SUGGESTION, side: "FOR" }).success).toBe(false);
    expect(DigSuggestionSchema.safeParse({ ...SUGGESTION, places: [] }).success).toBe(false);
    expect(DigSuggestionSchema.safeParse({ ...SUGGESTION, kind: "OWN_VIEW" }).success).toBe(false);
    expect(DigSuggestionSchema.safeParse({ ...SUGGESTION, strength: 0.4 }).success).toBe(false);
  });
});

describe("W1-6 a dig's ask names its parent", () => {
  const PARENT = Object.freeze({ parent_run_id: RUN, places: ["path:p-1", "p:n-4"], mode: "quick" });

  it("the parent is optional, so today's ask is unchanged", () => {
    expect(AskRequestSchema.parse(ASK)).toEqual(ASK);
    expect(AskRequestSchema.safeParse({ ...ASK, parent: PARENT }).success).toBe(true);
    expect(AskRequestSchema.safeParse({ ...ASK, parent_run_id: RUN }).success).toBe(false);
  });

  it("carries the picks: chosen (perhaps edited) suggestions and the person's own view, each at a place", () => {
    const picks = [
      { kind: "CONTRADICTING", suggestion_id: "sg-1", place: "path:p-1", text: "Do the readers' figures count part-time nurses?" },
      { kind: "OWN_VIEW", suggestion_id: null, place: "path:p-2", text: "What about the language exam?" }
    ];
    expect(AskParentSchema.safeParse({ ...PARENT, picks }).success).toBe(true);
    expect(AskParentSchema.safeParse({ ...PARENT, mode: "thorough", picks }).success).toBe(true);
    expect(AskParentSchema.safeParse({ ...PARENT, picks: [] }).success).toBe(false);
    expect(AskParentSchema.safeParse({ ...PARENT, picks: [{ ...picks[1], suggestion_id: "sg-2" }] }).success).toBe(false);
    expect(AskParentSchema.safeParse({ ...PARENT, picks: [{ ...picks[0], suggestion_id: null }] }).success).toBe(false);
    expect(AskParentSchema.safeParse({ ...PARENT, picks: [{ ...picks[0], text: " " }] }).success).toBe(false);
    expect(AskParentSchema.safeParse({ ...PARENT, parent_run_id: "run-1" }).success).toBe(false);
    expect(AskParentSchema.safeParse({ ...PARENT, mode: "light" }).success).toBe(false);
    expect(FREE_DIG_PICKS_MAX).toBe(3);
    const many = Array.from({ length: WEB_CONTRACT_LIMITS.digPicksMax + 1 }, () => picks[1]);
    expect(AskParentSchema.safeParse({ ...PARENT, picks: many }).success).toBe(false);
  });
});

describe("W1-6 the room read: the reserve, the block and a dig's share of today", () => {
  it("old room answers read as before; the two new words are optional", () => {
    expect(AskRoomResponseSchema.parse(ROOM_FITS)).toEqual(ROOM_FITS);
    expect(AskRoomResponseSchema.safeParse({ ...ROOM_FITS, reserve: "KEPT" }).success).toBe(true);
    expect(AskRoomResponseSchema.safeParse({ ...ROOM_FITS, reserve: "HELD" }).success).toBe(false);
  });

  it("'blocked until {reset}' is a full person window with its reset", () => {
    const full = { room: "FULL", scope: "PERSON_DAY", resets_at: "2026-10-31T00:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS" };
    expect(AskRoomResponseSchema.safeParse({ ...full, reserve: "BLOCKED" }).success).toBe(true);
    expect(AskRoomResponseSchema.safeParse({ ...ROOM_FITS, reserve: "BLOCKED" }).success).toBe(false);
    expect(AskRoomResponseSchema.safeParse({ ...full, scope: "SITE_DAY", reserve: "BLOCKED" }).success).toBe(false);
    expect(AskRoomResponseSchema.safeParse({ ...full, room: "CLOSE", reserve: "BLOCKED" }).success).toBe(false);
  });

  it("a dig's share of today is a percentage in steps of 5, and only on a room read asked for a dig", () => {
    expect(AskRoomResponseSchema.safeParse({ ...ROOM_FITS, dig_share_percent: 20 }).success).toBe(true);
    for (const share of [-5, 7, 105, 20.5]) {
      expect(AskRoomResponseSchema.safeParse({ ...ROOM_FITS, dig_share_percent: share }).success, String(share)).toBe(false);
    }
    const base = { plan_tier: "premium", composition_budget_tier: "medium", depth: "2" };
    expect(AskRoomQuerySchema.parse(base)).toEqual({ plan_tier: "premium", composition_budget_tier: "medium", depth: 2 });
    expect(AskRoomQuerySchema.parse({ ...base, dig_parent: RUN, dig_mode: "thorough", dig_picks: "3" }))
      .toEqual({ plan_tier: "premium", composition_budget_tier: "medium", depth: 2, dig_parent: RUN, dig_mode: "thorough", dig_picks: 3 });
    expect(AskRoomQuerySchema.safeParse({ ...base, dig_parent: RUN }).success).toBe(true);
    expect(AskRoomQuerySchema.safeParse({ ...base, dig_mode: "quick" }).success).toBe(false);
    expect(AskRoomQuerySchema.safeParse({ ...base, dig_picks: "2" }).success).toBe(false);
    expect(AskRoomQuerySchema.safeParse({ ...base, dig_parent: RUN, dig_picks: "0" }).success).toBe(false);
    expect(AskRoomQuerySchema.safeParse({ ...base, dig_parent: RUN, dig_picks: "17" }).success).toBe(false);
  });

  it("rounds a dig's share of the day to the nearest 5%, never 0% for a dig that costs something, at most 100%", () => {
    const day = 1_000_000;
    expect(digSharePercent(210_000, day)).toBe(20);
    expect(digSharePercent(225_000, day)).toBe(25);
    expect(digSharePercent(224_999, day)).toBe(20);
    expect(digSharePercent(70_000, day)).toBe(5);
    expect(digSharePercent(1_000, day)).toBe(5);
    expect(digSharePercent(0, day)).toBe(0);
    expect(digSharePercent(1_500_000, day)).toBe(100);
    for (const [estimate, limit] of [[-1, day], [1.5, day], [1, 0], [1, -day], [Number.NaN, day]] as const) {
      expect(() => digSharePercent(estimate, limit), `${estimate}/${limit}`).toThrow();
    }
  });

  it("the client sends the dig's room fields only when given, after today's", async () => {
    const seen: string[] = [];
    const client = createContractClient("https://debate.test", (async (input: RequestInfo | URL) => {
      seen.push(new URL(String(input)).search);
      return Response.json({ ...ROOM_FITS, dig_share_percent: 20, reserve: "KEPT" });
    }) as typeof fetch);
    await client.getAskRoom({ plan_tier: "premium", composition_budget_tier: "medium", depth: 2 });
    await expect(client.getAskRoom({ plan_tier: "premium", composition_budget_tier: "medium", depth: 2, dig_parent: RUN, dig_mode: "quick", dig_picks: 2 }))
      .resolves.toMatchObject({ dig_share_percent: 20, reserve: "KEPT" });
    expect(seen).toEqual([
      "?plan_tier=premium&composition_budget_tier=medium&depth=2",
      `?plan_tier=premium&composition_budget_tier=medium&depth=2&dig_parent=${RUN}&dig_mode=quick&dig_picks=2`
    ]);
  });
});

describe("W1-6 an investigation: a debate and its digs, with every closing kept", () => {
  const DIG = Object.freeze({ parent_run_id: RUN, child_run_id: CHILD, places: ["path:p-1"], mode: "quick", created_at: "2026-10-30T09:00:00.000Z" });
  const closing = (report_version: number, report = "READY") => ({ report_version, closed_at: "2026-10-30T10:00:00.000Z", report,
    answer_id: report === "READY" ? `answer-${report_version}` : null });
  const investigation = (state: string, closings: unknown[]) => ({ investigation_id: INVESTIGATION, root_run_id: RUN, state, digs: [DIG], closings });

  it("is open or closed; a closed one has a closing; a reopened one keeps its earlier reports", () => {
    expect(DebateInvestigationSchema.safeParse(investigation("OPEN", [])).success).toBe(true);
    expect(DebateInvestigationSchema.safeParse(investigation("CLOSED", [closing(1)])).success).toBe(true);
    expect(DebateInvestigationSchema.safeParse(investigation("CLOSED", [])).success).toBe(false);
    expect(DebateInvestigationSchema.safeParse(investigation("OPEN", [closing(1)])).success).toBe(true);
    expect(DebateInvestigationSchema.safeParse(investigation("CLOSED", [closing(1), closing(2, "WRITING")])).success).toBe(true);
    expect(DebateInvestigationSchema.safeParse(investigation("PAUSED", [])).success).toBe(false);
  });

  it("numbers its report versions 1, 2, 3 in order; only the latest may still be writing", () => {
    expect(DebateInvestigationSchema.safeParse(investigation("CLOSED", [closing(2)])).success).toBe(false);
    expect(DebateInvestigationSchema.safeParse(investigation("CLOSED", [closing(1), closing(3)])).success).toBe(false);
    expect(DebateInvestigationSchema.safeParse(investigation("CLOSED", [closing(1, "WRITING"), closing(2)])).success).toBe(false);
    expect(DebateInvestigationSchema.safeParse(investigation("CLOSED", [closing(1, "FAILED"), closing(2)])).success).toBe(true);
    expect(InvestigationCloseRequestSchema.safeParse({}).success).toBe(true);
    expect(InvestigationCloseRequestSchema.safeParse({ auto: true }).success).toBe(false);
  });
});

describe("W1-6 inventory and the no-grade rule over every new shape", () => {
  const NEW = { WebSourceSchema, WebOtherPageSchema, WebPathSchema, AnswerWebSchema, DigSuggestionSchema, AskParentSchema,
    DebateInvestigationSchema, ResearchedAddRequestSchema, ResearchedAddedSchema, InvestigationCloseRequestSchema };

  function keysOf(schema: z.core.$ZodType, seen = new Set<z.core.$ZodType>()): string[] {
    if (seen.has(schema)) return [];
    seen.add(schema);
    if (schema instanceof z.ZodObject) return Object.entries(schema.shape).flatMap(([key, child]) => [key, ...keysOf(child as z.core.$ZodType, seen)]);
    if (schema instanceof z.ZodArray) return keysOf(schema.element as z.core.$ZodType, seen);
    if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) return keysOf(schema.unwrap() as z.core.$ZodType, seen);
    if (schema instanceof z.ZodUnion) return schema.options.flatMap((option) => keysOf(option as z.core.$ZodType, seen));
    return [];
  }

  it("no new shape has a grade, score, strength, price or cost member", () => {
    for (const [name, schema] of Object.entries(NEW)) {
      expect(keysOf(schema).filter((key) => /grade|score|strength|price|cost|micros/iu.test(key)), name).toEqual([]);
    }
  });

  it("lists every new shape in the contract inventory and adds no route", () => {
    const resources = contractInventory.resources as unknown as Record<string, unknown>;
    for (const [name, schema] of Object.entries(NEW)) expect(resources[name], name).toBe(schema);
    // R22 W3-8 later registered one route for these shapes, Continue (POST /v1/runs/{id}/continue): 180 + 1. R22 W5-1 then
    // registered the final report's three (GET /v1/runs/{id}/investigation, POST /v1/runs/{id}/report and …/reopen): 184.
    expect(contractInventory.routes).toHaveLength(184);
  });
});
