import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import { AnswerSchema, AskRoomResponseSchema, AskRequestSchema, BillingUsageResponseSchema, NodeSchema } from "../../packages/contract/src/index.js";
import { createSeed, SEED_NODE_IDS } from "../../tools/v4-mock-api/seed.js";
import {
  answerDraftParts, contractOrDraft, cutQuote, DraftAnswerWebSchema, DraftAskParentSchema, DraftInvestigationSchema,
  DraftNodeWebSchema, DraftRoomPartSchema, DraftUsagePartSchema, READ_DEPTHS, RESEARCHED_OUTCOMES, splitAsk,
  stripAnswer, stripRoom, stripUsage, SUGGESTION_KINDS
} from "../../tools/v4-mock-api/web-draft.js";
import { WEB_CASES, type WebCase } from "../../tools/v4-mock-api/web-seed.js";

/*
 * Perplexity plan W1-7 (2026-10-30): the V4 mock API (tools/v4-mock-api) carries DRAFT web fields (sources, web status,
 * other pages, researched choices, dig suggestions, investigations, the room's "blocked" and "reserve kept", a dig's share
 * of today) until W1-6 puts the real shapes in the contract. These checks hold the seed to the owner's rules and keep
 * today's contract happy once the draft fields are held back. The running mock checks itself with check.ts.
 */
const seed = createSeed(fixture);
/** Owner: every quote shown to people is at most 120 characters. */
const QUOTE_MAX = 120;
const catalog = JSON.parse(readFileSync(join(resolve(import.meta.dirname, "../../apps/ui"), "messages/en/v4.json"), "utf8")) as Record<string, string>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const answerOf = (web: WebCase | undefined): Loose => seed.answer({
  answerId: "aaaa1111-1111-4111-8111-111111111111", runRef: "11111111-1111-4111-8111-111111111111",
  question: "Should countries build new nuclear power, or put the money into renewables and storage?",
  askedAt: "2026-10-27T15:12:00.000Z", servedAt: "2026-10-27T15:40:00.000Z", ...(web === undefined ? {} : { web })
});
const research = (web: WebCase): Loose[] => answerOf(web).path_research;
const allSources = (web: WebCase): Loose[] => answerOf(web).nodes.flatMap((node: Loose) => node.sources);

describe("V4 mock API: the draft web fields", () => {
  it("cuts a quote to at most 120 characters at a word edge", () => {
    expect(cutQuote("A short quote.")).toBe("A short quote.");
    const long = "word ".repeat(40).trim();
    const cut = cutQuote(long);
    expect(cut.length).toBeLessThanOrEqual(QUOTE_MAX);
    expect(cut.endsWith("…")).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(long[cut.length - 1]).toBe(" ");
    expect(cutQuote("x".repeat(200)).length).toBe(QUOTE_MAX);
  });

  it("every case passes today's contract once the draft fields are held back, and the draft schemas with them", () => {
    for (const web of [undefined, ...WEB_CASES]) {
      const answer = answerOf(web);
      const stripped = stripAnswer(answer);
      expect(AnswerSchema.safeParse(stripped).success, String(web)).toBe(true);
      for (const node of stripped.nodes) expect(NodeSchema.safeParse(node).success, `${web} ${node.node_id}`).toBe(true);
      // Today's contract refuses the draft fields, so the mock holds them back (contractOrDraft); W1-6 turns this on.
      expect(contractOrDraft(AnswerSchema, answer, stripAnswer).body).toEqual(web === undefined ? answer : stripped);
      if (web === undefined) continue;
      const parts = answerDraftParts(answer);
      expect(DraftAnswerWebSchema.safeParse(parts.web).success, web).toBe(true);
      for (const node of parts.nodes) expect(DraftNodeWebSchema.safeParse(node.web).success, `${web} ${node.id}`).toBe(true);
      expect(research(web).map((path: Loose) => path.position_ref)).toEqual(["n-mix", "n-renew", "n-nuclear", "n-smr"]);
    }
  });

  it("the paid debate shows sources, other pages, a path with no search planned and every outcome", () => {
    const paths = research("PAID");
    expect(paths.map((path: Loose) => path.web.status)).toEqual(["SEARCHED", "SEARCHED", "SEARCHED", "NO_SEARCH_PLANNED"]);
    expect(paths[3].web.reason.length).toBeGreaterThan(0);
    const sources = allSources("PAID");
    expect(sources.length).toBeGreaterThan(0);
    expect(new Set(sources.map((source: Loose) => source.read_depth))).toEqual(new Set(READ_DEPTHS));
    expect(sources.some((source: Loose) => source.fewer_readers)).toBe(true);
    expect(new Set(sources.map((source: Loose) => source.extract_id)).size).toBe(sources.length);
    for (const source of sources) {
      expect(source.quote.length, source.extract_id).toBeLessThanOrEqual(QUOTE_MAX);
      expect(new URL(source.url).hostname.endsWith(".example"), source.url).toBe(true);
    }
    expect(paths.flatMap((path: Loose) => path.other_pages).length).toBeGreaterThan(0);
    expect(new Set(paths.flatMap((path: Loose) => path.researched.map((choice: Loose) => choice.outcome)))).toEqual(new Set(RESEARCHED_OUTCOMES));
    expect(new Set(paths.flatMap((path: Loose) => path.dig_suggestions.map((suggestion: Loose) => suggestion.kind)))).toEqual(new Set(SUGGESTION_KINDS));
  });

  it("only a point resting on an extract of this debate is checked as looked up; a remembered citation is not", () => {
    const nodes = answerOf("PAID").nodes;
    for (const node of nodes) expect(node.looked_up_checked, node.node_id).toBe(node.sources.length > 0);
    for (const node of nodes) if (node.sources.length > 0) expect(node.way_of_knowing, node.node_id).toBe("LOOKED_UP");
    const remembered = nodes.find((node: Loose) => node.node_id === "n-mix-cost");
    expect(remembered.way_of_knowing).toBe("LOOKED_UP");
    expect(remembered.looked_up_checked).toBe(false);
  });

  it("a failed search and a Free debate carry no sources and no pages, and Free never suggests a web search", () => {
    expect(research("FAILED").every((path: Loose) => path.web.status === "FAILED")).toBe(true);
    expect(research("FREE").every((path: Loose) => path.web.status === "NOT_ON_PLAN")).toBe(true);
    for (const web of ["FAILED", "FREE"] as const) {
      expect(allSources(web)).toEqual([]);
      expect(answerOf(web).nodes.every((node: Loose) => node.looked_up_checked === false)).toBe(true);
      expect(research(web).flatMap((path: Loose) => [...path.other_pages, ...path.researched])).toEqual([]);
      expect(research(web).flatMap((path: Loose) => path.dig_suggestions).some((suggestion: Loose) => suggestion.kind === "NEEDS_MORE_WEB")).toBe(false);
    }
  });

  it("every suggestion rests on places of this map, and nothing on the page carries a grade or a score", () => {
    const nodes = new Set(SEED_NODE_IDS);
    for (const web of WEB_CASES) {
      const paths = research(web);
      const positions = new Set(paths.map((path: Loose) => path.position_ref));
      for (const suggestion of paths.flatMap((path: Loose) => path.dig_suggestions)) {
        for (const place of suggestion.places) {
          const known = place.startsWith("p:") ? nodes.has(place.slice(2)) : place.startsWith("path:") && positions.has(place.slice(5));
          expect(known, `${web} ${suggestion.suggestion_id} ${place}`).toBe(true);
        }
      }
      const text = JSON.stringify({ paths, sources: allSources(web) });
      expect(text).not.toMatch(/"[a-z_]*(grade|score|strength|spread)[a-z_]*":/u);
    }
  });

  it("the room's draft words and the dig share fall back to today's shapes", () => {
    const blocked = { room: "BLOCKED", scope: "PERSON_MONTH", resets_at: "2026-11-01T00:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS" };
    expect(DraftRoomPartSchema.safeParse(blocked).success).toBe(true);
    expect(DraftRoomPartSchema.safeParse({ ...blocked, resets_at: null }).success).toBe(false);
    expect(AskRoomResponseSchema.safeParse(blocked).success).toBe(false);
    expect(stripRoom(blocked)).toEqual({ ...blocked, room: "FULL" });
    expect(AskRoomResponseSchema.safeParse(stripRoom(blocked)).success).toBe(true);
    const fits = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", reserve_kept: true };
    expect(DraftRoomPartSchema.safeParse(fits).success).toBe(true);
    expect(AskRoomResponseSchema.safeParse(stripRoom(fits)).success).toBe(true);
    const usage = {
      plan_id: "PLUS", windows: [{ scope: "PERSON_DAY", percent: 14, resets_at: "2026-10-31T00:00:00.000Z" }], dig_share: { quick: 20, thorough: 35 }
    };
    expect(DraftUsagePartSchema.safeParse(usage).success).toBe(true);
    expect(BillingUsageResponseSchema.safeParse(stripUsage(usage)).success).toBe(true);
  });

  it("an ask's draft parent is split off before today's ask rules read it", () => {
    const ask = {
      question_line: "Does this hold up, and when?", risk_tier: "standard", tier_source: "MACHINE_DEFAULT", tier_provenance_ref: "check:v4-mock",
      composition_budget_tier: "medium", depth_params: { depth: 1, answerLength: "short" }, decision_scope: "personal",
      as_of: "2026-10-30T10:00:00.000Z", steering_presets: [], plan_tier: "premium", steering_annotations: [], site_language: "en"
    };
    const parent = { parent_run_id: "11111111-1111-4111-8111-111111111111", places: ["p:n-renew-storage"], mode: "quick" };
    expect(AskRequestSchema.safeParse({ ...ask, parent }).success).toBe(false);
    const split = splitAsk({ ...ask, parent });
    expect(AskRequestSchema.safeParse(split.ask).success).toBe(true);
    expect(DraftAskParentSchema.safeParse(split.parent).success).toBe(true);
    expect(splitAsk(ask)).toEqual({ ask, parent: undefined });
  });

  it("an investigation is open or closed, keeps its earlier reports and numbers its closings", () => {
    const open = {
      investigation_id: "1a1a1a1a-1111-4111-8111-111111111111", root_run_id: "11111111-1111-4111-8111-111111111111",
      state: "OPEN",
      members: [{ run_id: "88888888-8888-4888-8888-888888888888", parent_run_id: "11111111-1111-4111-8111-111111111111", places: ["p:n-renew-storage"], mode: "quick" }],
      closings: [{ version: 1, closed_at: "2026-10-28T09:00:00.000Z" }]
    };
    expect(DraftInvestigationSchema.safeParse(open).success).toBe(true);
    expect(DraftInvestigationSchema.safeParse({ ...open, state: "CLOSED" }).success).toBe(true);
    expect(DraftInvestigationSchema.safeParse({ ...open, state: "CLOSED", closings: [] }).success).toBe(false);
    expect(DraftInvestigationSchema.safeParse({ ...open, closings: [{ version: 2, closed_at: "2026-10-28T09:00:00.000Z" }] }).success).toBe(false);
  });

  it("every draft word the mock uses has its English label in the V4 catalogue", () => {
    const words = [
      ...SUGGESTION_KINDS.map((kind) => `v4.suggest.kind.${kind}`),
      ...RESEARCHED_OUTCOMES.map((outcome) => `v4.web.researched.${outcome}`),
      "v4.web.noSearch", "v4.web.previewOnly", "v4.web.fewerReaders", "v4.web.otherPages", "v4.web.addResearched",
      "v4.web.failed", "v4.web.free", "v4.web.sureBasis", "v4.room.blockedUntil", "v4.dig.quotaShare", "v4.dig.quotaDayUsed"
    ];
    expect(words.filter((key) => !(key in catalog))).toEqual([]);
  });
});
