import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import {
  AnswerSchema, AnswerWebSchema, AskParentSchema, AskRoomResponseSchema, AskRequestSchema, AskRoomQuerySchema, cutQuoteAtWordEdge,
  DebateInvestigationSchema, DigSuggestionSchema, NodeSchema, WebOtherPageSchema, WebPathSchema, WebSourceSchema
} from "../../packages/contract/src/index.js";
import { createSeed, SEED_NODE_IDS } from "../../tools/v4-mock-api/seed.js";
import {
  answerDraftProblems, contractOrDraft, cutQuote, DraftAnswerWebSchema, DraftAskParentSchema, DraftDigSuggestionSchema,
  DraftInvestigationSchema, DraftOtherPageSchema, DraftRoomPartSchema, DraftSourceSchema, DraftWebPathSchema,
  DraftRoomQueryPartSchema, READ_DEPTHS, RESEARCHED_STATES, splitAsk, splitRoomQuery, stripAnswer, stripRoom, SUGGESTION_KINDS,
  SUGGESTION_SIDES
} from "../../tools/v4-mock-api/web-draft.js";
import { WEB_CASES, type WebCase } from "../../tools/v4-mock-api/web-seed.js";

/*
 * These checks hold before and after W1-6 merges: they never assert that today's contract refuses a draft field.
 *
 * Perplexity plan W1-7 (2026-10-30): the V4 mock API (tools/v4-mock-api) carries DRAFT web fields (sources, each path's
 * search, other pages, "added to researched", dig suggestions, investigations, the room's reserve word and a dig's share
 * of today), mirroring W1-6's shapes until they merge into the contract. These checks hold the seed to the owner's rules
 * and keep today's contract happy once the draft fields are held back. The running mock checks itself with check.ts.
 */
const seed = createSeed(fixture);
const catalog = JSON.parse(readFileSync(join(resolve(import.meta.dirname, "../../apps/ui"), "messages/en/v4.json"), "utf8")) as Record<string, string>;
/** Owner: every quote shown to people is at most 120 characters. */
const QUOTE_MAX = 120;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const answerOf = (web: WebCase | undefined): Loose => seed.answer({
  answerId: "aaaa1111-1111-4111-8111-111111111111", runRef: "11111111-1111-4111-8111-111111111111",
  question: "Should countries build new nuclear power, or put the money into renewables and storage?",
  askedAt: "2026-10-27T15:12:00.000Z", servedAt: "2026-10-27T15:40:00.000Z", ...(web === undefined ? {} : { web })
});
const pathsOf = (web: WebCase): Loose[] => answerOf(web).web.paths;
const allSources = (web: WebCase): Loose[] => answerOf(web).nodes.flatMap((node: Loose) => node.sources);
const suggestionsOf = (web: WebCase): Loose[] => pathsOf(web).flatMap((path) => path.suggestions);

describe("V4 mock API: the draft web fields", () => {
  it("serves the contract's own shapes, not copies (plan W2-6: W1-6 merged)", () => {
    expect(DraftSourceSchema).toBe(WebSourceSchema);
    expect(DraftOtherPageSchema).toBe(WebOtherPageSchema);
    expect(DraftDigSuggestionSchema).toBe(DigSuggestionSchema);
    expect(DraftWebPathSchema).toBe(WebPathSchema);
    expect(DraftAnswerWebSchema).toBe(AnswerWebSchema);
    expect(DraftAskParentSchema).toBe(AskParentSchema);
    expect(DraftInvestigationSchema).toBe(DebateInvestigationSchema);
    expect(cutQuote("word ".repeat(40))).toBe(cutQuoteAtWordEdge("word ".repeat(40)));
    // The contract knows the web fields now, so the website gets every seeded case whole.
    for (const web of WEB_CASES) {
      const answer = answerOf(web);
      expect(contractOrDraft(AnswerSchema, answer, stripAnswer), web).toEqual({ body: answer, draft: true });
    }
  });


  it("cuts a quote to at most 120 characters at a word edge", () => {
    expect(cutQuote("A short quote.")).toBe("A short quote.");
    const long = "word ".repeat(40).trim();
    const cut = cutQuote(long);
    expect(cut.length).toBeLessThanOrEqual(QUOTE_MAX);
    expect(cut.endsWith("…")).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(long[cut.length - 1]).toBe(" ");
    expect(cutQuote("x".repeat(200)).length).toBe(QUOTE_MAX);
    expect(cutQuote(cut)).toBe(cut);
  });

  it("every case passes today's contract once the draft fields are held back, and the draft schemas with them", () => {
    for (const web of [undefined, ...WEB_CASES]) {
      const answer = answerOf(web);
      const stripped = stripAnswer(answer);
      expect(AnswerSchema.safeParse(stripped).success, String(web)).toBe(true);
      for (const node of stripped.nodes) expect(NodeSchema.safeParse(node).success, `${web} ${node.node_id}`).toBe(true);
      // What the mock sends: the whole answer once the contract knows the draft fields (W1-6 merged), else the stripped one.
      const sent = contractOrDraft(AnswerSchema, answer, stripAnswer).body;
      expect(AnswerSchema.safeParse(sent).success, String(web)).toBe(true);
      expect([answer, stripped], String(web)).toContainEqual(sent);
      if (web === undefined) continue;
      expect(answerDraftProblems(answer), web).toEqual([]);
      expect(pathsOf(web).map((path) => path.position_ref)).toEqual(["n-mix", "n-renew", "n-nuclear", "n-smr"]);
    }
  });

  it("the paid debate shows sources, other pages, a path with no search planned and every outcome", () => {
    const paths = pathsOf("PAID");
    expect(paths.map((path) => path.search.status)).toEqual(["SEARCHED", "SEARCHED", "SEARCHED", "NO_SEARCH_PLANNED"]);
    expect(paths[3].search.reason.length).toBeGreaterThan(0);
    const sources = allSources("PAID");
    expect(sources.length).toBeGreaterThan(0);
    expect(new Set(sources.map((source) => source.read_depth))).toEqual(new Set(READ_DEPTHS));
    expect(sources.some((source) => source.fewer_readers === true)).toBe(true);
    expect(new Set(sources.map((source) => source.extract_id)).size).toBe(sources.length);
    for (const source of sources) {
      expect(Array.from(source.quote).length, source.extract_id).toBeLessThanOrEqual(QUOTE_MAX);
      expect(source.explanation.language).toBe("en");
      expect(new URL(source.link).hostname.endsWith(".example"), source.link).toBe(true);
    }
    const pages = paths.flatMap((path) => path.other_pages);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((page) => new URL(page.link).hostname.endsWith(".example"))).toBe(true);
    expect(new Set(pages.filter((page) => page.researched !== undefined).map((page) => page.researched.state))).toEqual(new Set(RESEARCHED_STATES));
    expect(new Set(suggestionsOf("PAID").map((suggestion) => suggestion.kind))).toEqual(new Set(SUGGESTION_KINDS));
    expect(new Set(suggestionsOf("PAID").filter((suggestion) => suggestion.side !== null).map((suggestion) => suggestion.side))).toEqual(new Set(SUGGESTION_SIDES));
  });

  it("only a point resting on an extract of this debate is checked as looked up; a remembered citation is not", () => {
    const nodes = answerOf("PAID").nodes;
    for (const node of nodes) {
      expect(node.looked_up_checked, node.node_id).toBe(node.sources.length > 0);
      if (!node.looked_up_checked) continue;
      expect(node.way_of_knowing, node.node_id).toBe("LOOKED_UP");
      expect(node.sources.map((source: Loose) => source.extract_id), node.node_id).toContain(node.locator);
    }
    const remembered = nodes.find((node: Loose) => node.node_id === "n-mix-cost");
    expect(remembered.way_of_knowing).toBe("LOOKED_UP");
    expect(remembered.locator).not.toBeNull();
    expect(remembered.looked_up_checked).toBe(false);
  });

  it("a failed search and a Free debate carry no sources and no pages, and Free never suggests a web search", () => {
    expect(pathsOf("FAILED").every((path) => path.search.status === "FAILED")).toBe(true);
    expect(pathsOf("FREE").every((path) => path.search.status === "NOT_ON_PLAN")).toBe(true);
    for (const web of ["FAILED", "FREE"] as const) {
      expect(allSources(web)).toEqual([]);
      expect(answerOf(web).nodes.every((node: Loose) => node.looked_up_checked === false)).toBe(true);
      expect(pathsOf(web).flatMap((path) => path.other_pages)).toEqual([]);
      expect(suggestionsOf(web).some((suggestion) => suggestion.kind === "NEEDS_MORE_WEB")).toBe(false);
    }
  });

  it("every suggestion rests on places of this map, and nothing on the page carries a grade or a score", () => {
    const nodes = new Set(SEED_NODE_IDS);
    for (const web of WEB_CASES) {
      const positions = new Set(pathsOf(web).map((path) => path.position_ref));
      for (const suggestion of suggestionsOf(web)) {
        for (const place of suggestion.places) {
          const known = place.startsWith("p:") ? nodes.has(place.slice(2)) : place.startsWith("path:") && positions.has(place.slice(5));
          expect(known, `${web} ${suggestion.suggestion_id} ${place}`).toBe(true);
        }
      }
      const text = JSON.stringify({ paths: pathsOf(web), sources: allSources(web) });
      expect(text).not.toMatch(/"[a-z_]*(grade|score|strength|spread)[a-z_]*":/u);
    }
  });

  it("the room's reserve word and a dig's share fall back to today's room read", () => {
    const blocked = {
      room: "FULL", scope: "PERSON_DAY", resets_at: "2026-10-31T00:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS", reserve: "BLOCKED"
    };
    expect(DraftRoomPartSchema.safeParse(blocked).success).toBe(true);
    expect(DraftRoomPartSchema.safeParse({ ...blocked, room: "FITS", scope: null, resets_at: null }).success).toBe(false);
    const { reserve: _reserve, ...full } = blocked;
    expect(stripRoom(blocked)).toEqual(full);
    expect(AskRoomResponseSchema.safeParse(stripRoom(blocked)).success).toBe(true);
    const fits = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", reserve: "KEPT", dig_share_percent: 20 };
    expect(DraftRoomPartSchema.safeParse(fits).success).toBe(true);
    expect(DraftRoomPartSchema.safeParse({ ...fits, dig_share_percent: 22 }).success).toBe(false);
    expect(AskRoomResponseSchema.safeParse(stripRoom(fits)).success).toBe(true);
    const query = { plan_tier: "premium", composition_budget_tier: "medium", depth: "2", answer_length: "standard" };
    const dig = { dig_parent: "11111111-1111-4111-8111-111111111111", dig_mode: "thorough", dig_picks: "2" };
    const split = splitRoomQuery({ ...query, ...dig });
    expect(split).toEqual({ query, dig });
    expect(AskRoomQuerySchema.safeParse(split.query).success).toBe(true);
    expect(DraftRoomQueryPartSchema.safeParse(split.dig).success).toBe(true);
    expect(DraftRoomQueryPartSchema.safeParse({ dig_mode: "quick" }).success).toBe(false);
  });

  it("an ask's draft parent is split off before today's ask rules read it", () => {
    const ask = {
      question_line: "Does this hold up, and when?", risk_tier: "standard", tier_source: "MACHINE_DEFAULT", tier_provenance_ref: "check:v4-mock",
      composition_budget_tier: "medium", depth_params: { depth: 1, answerLength: "short" }, decision_scope: "personal",
      as_of: "2026-10-30T10:00:00.000Z", steering_presets: [], plan_tier: "premium", steering_annotations: [], site_language: "en"
    };
    const parent = {
      parent_run_id: "11111111-1111-4111-8111-111111111111", places: ["p:n-renew-storage"], mode: "quick",
      picks: [
        { kind: "CONTRADICTING", suggestion_id: "renew-contradicting", place: "p:n-renew-storage", text: "Can batteries cover several windless days?" },
        { kind: "OWN_VIEW", suggestion_id: null, place: "path:n-renew", text: "What about pumped hydro?" }
      ]
    };
    const split = splitAsk({ ...ask, parent });
    expect(AskRequestSchema.safeParse(split.ask).success).toBe(true);
    expect(DraftAskParentSchema.safeParse(split.parent).success).toBe(true);
    expect(DraftAskParentSchema.safeParse({ ...parent, picks: [{ ...parent.picks[1], suggestion_id: "x" }] }).success).toBe(false);
    expect(splitAsk(ask)).toEqual({ ask, parent: undefined });
  });

  it("an investigation is open or closed, keeps its earlier reports and numbers its closings", () => {
    const open = {
      investigation_id: "1a1a1a1a-1111-4111-8111-111111111111", root_run_id: "11111111-1111-4111-8111-111111111111",
      state: "OPEN",
      digs: [{
        parent_run_id: "11111111-1111-4111-8111-111111111111", child_run_id: "88888888-8888-4888-8888-888888888888",
        places: ["p:n-renew-storage"], mode: "quick", created_at: "2026-10-29T08:00:00.000Z"
      }],
      closings: [{ report_version: 1, closed_at: "2026-10-28T09:00:00.000Z", report: "READY", answer_id: "aaaa1111-1111-4111-8111-111111111111" }]
    };
    expect(DraftInvestigationSchema.safeParse(open).success).toBe(true);
    expect(DraftInvestigationSchema.safeParse({ ...open, state: "CLOSED" }).success).toBe(true);
    expect(DraftInvestigationSchema.safeParse({ ...open, state: "CLOSED", closings: [] }).success).toBe(false);
    expect(DraftInvestigationSchema.safeParse({ ...open, closings: [{ ...open.closings[0], report_version: 2 }] }).success).toBe(false);
  });

  it("every draft word the mock uses has its English label in the V4 catalogue", () => {
    const words = [
      ...SUGGESTION_KINDS.filter((kind) => kind !== "HELPS_MAIN_QUESTION").map((kind) => `v4.suggest.kind.${kind}`),
      ...SUGGESTION_SIDES.map((side) => `v4.suggest.kind.HELPS_MAIN_QUESTION.${side}`),
      ...RESEARCHED_STATES.map((state) => `v4.web.researched.${state}`),
      "v4.web.noSearch", "v4.web.switchedOff", "v4.web.previewOnly", "v4.web.fewerReaders", "v4.web.otherPages", "v4.web.addResearched",
      "v4.web.failed", "v4.web.free", "v4.web.sureBasis", "v4.room.blockedUntil", "v4.dig.quotaShare", "v4.dig.quotaDayUsed",
      "v4.suggest.ownView", "v4.suggest.edit"
    ];
    expect(words.filter((key) => !(key in catalog))).toEqual([]);
  });
});
