// tests/unit/dig-suggestions-serve.test.ts
// W4-3: what the map offers. The kinds code finds (owner, 30 Oct; F14: Free gets only these), joined beside the AI's sealed ones; none
// at level 10; never an engine number or a passage. Made-up points.
import { describe, expect, it } from "vitest";
import { AnswerWebSchema, DIG_LEVEL_MAX, DIG_SUGGESTIONS_WATCH_MS, type AnswerWeb, type Node } from "@debateai/contract";
import { PATH_REWRITE_POLICY } from "@debateai/register";
import {
  digLeadSuggestions, digLeadsOfPack, digPointSuggestions, digPicksAtMapPaths, digSuggestionsOf, digSuggestionsPending, pathSuggestionsOfSet, webWithDigSuggestions
} from "@debateai/serve";

const node = (id: string, overrides: Partial<Node> = {}): Node => ({ node_id: id, claim: `Point ${id} in plain words.`, way_of_knowing: "LOOKED_UP", review: null,
  sources: [], ...overrides } as Node);
const NODES = [node("root"), node("n1", { review: { outcome: "dispute" } as never }), node("n2", { way_of_knowing: "REASONING" as never }), node("n3"),
  node("other", { review: { outcome: "dispute" } as never })];
const EDGES = [{ from_node_ref: "n1", target_kind: "NODE", target_ref: "root" }, { from_node_ref: "n2", target_kind: "NODE", target_ref: "n1" },
  { from_node_ref: "n3", target_kind: "NODE", target_ref: "root" }, { from_node_ref: "other", target_kind: "NODE", target_ref: "elsewhere" }] as never;
const web = (suggestions: AnswerWeb["paths"][number]["suggestions"] = []): AnswerWeb =>
  ({ paths: [{ position_ref: "root", search: { status: "NOT_ON_PLAN" }, other_pages: [], suggestions }] });

describe("W4-3 the suggestions code finds", () => {
  it("a disputed point and one resting on reasoning alone, of this path only, each hanging under the path; the contract's shape", () => {
    const out = webWithDigSuggestions(web(), NODES, EDGES, 1);
    const suggestions = out.paths[0]!.suggestions;
    expect(suggestions.map((entry) => [entry.kind, entry.side, entry.text, entry.places])).toEqual([
      ["CONTRADICTING", null, "Point n1 in plain words.", ["path:root"]], ["UNDOCUMENTED", null, "Point n2 in plain words.", ["path:root"]]]);
    expect(AnswerWebSchema.safeParse(out).success).toBe(true);
    expect(webWithDigSuggestions(web(), NODES, EDGES, 1)).toEqual(out);
  });
  it("nothing invented: a path with nothing to offer offers nothing", () => {
    expect(digPointSuggestions("root", [node("n3")])).toEqual([]);
  });
  it("none at level 10, also none of the AI's; level 9 still offers", () => {
    const ai = [{ suggestion_id: "s-1", kind: "HELPS_MAIN_QUESTION" as const, side: "FOR" as const, text: "t", places: ["path:root"] }];
    expect(webWithDigSuggestions(web(ai), NODES, EDGES, 10).paths[0]!.suggestions).toEqual([]);
    expect(webWithDigSuggestions(web(ai), NODES, EDGES, 9).paths[0]!.suggestions[0]!.suggestion_id).toBe("s-1");
  });
  it("the readers' lines: NEEDS_MORE_WEB, at most two; only the leads of a pack are read, never its passages", () => {
    const leads = digLeadsOfPack({ extracts: [{ quote: "a passage" }], leads: ["Look for the 2026 rent survey.", "And the union's figures.", "A third."] });
    const offered = digLeadSuggestions("run", "root", leads);
    expect(offered.map((entry) => entry.kind)).toEqual(["NEEDS_MORE_WEB", "NEEDS_MORE_WEB"]);
    expect(JSON.stringify(offered)).not.toContain("a passage");
    expect(digLeadsOfPack(null)).toEqual([]);
  });
  it("0141's newest set is what the AI offers: it replaces the set sealed with the dig, even when empty; code's kinds stay", () => {
    const old = { suggestion_id: "s-old", kind: "HELPS_MAIN_QUESTION" as const, side: "FOR" as const, text: "old", places: ["path:root"] };
    const fresh = { suggestion_id: "s-new", kind: "HELPS_MAIN_QUESTION" as const, side: "AGAINST" as const, text: "new", places: ["path:root"] };
    const ids = (sets: ReadonlyMap<string, readonly (typeof fresh)[]>) => webWithDigSuggestions(web([old]), NODES, EDGES, 1, sets).paths[0]!.suggestions.map((entry) => entry.kind === "HELPS_MAIN_QUESTION" ? entry.suggestion_id : entry.kind);
    expect(ids(new Map())).toEqual(["s-old", "CONTRADICTING", "UNDOCUMENTED"]);
    expect(ids(new Map([["root", [fresh]]]))).toEqual(["s-new", "CONTRADICTING", "UNDOCUMENTED"]);
    expect(ids(new Map([["root", []]]))).toEqual(["CONTRADICTING", "UNDOCUMENTED"]);
    expect(pathSuggestionsOfSet({ suggestions: [fresh, { bad: 1 }] })).toEqual([fresh]);
    expect(pathSuggestionsOfSet(null)).toEqual([]);
  });

  it("R22: a dig's chosen paths' rows hang under the first path of its map, and every map path has searched; a first debate's come back as they are", () => {
    const evidence = { searches: [{ searchId: "s1", pathRef: "dig-pick-1", outcome: "FOUND" }, { searchId: "s2", pathRef: "dig-pick-2", outcome: "FOUND" }],
      pages: [], readings: [], extracts: [{ pageId: "p", pathRef: "dig-pick-2", label: "S2-1", quote: "q" }], picks: [{ pathRef: "dig-pick-2", rank: 1, pageId: "p" }], researched: [] };
    const out = digPicksAtMapPaths(evidence, ["a1", "a2"]);
    expect(out.searches.map((search) => search.pathRef)).toEqual(["a1", "a1", "a2"]);
    expect(out.extracts[0]!.pathRef).toBe("a1");
    expect(out.picks[0]!.pathRef).toBe("a1");
    const first = { ...evidence, searches: [{ searchId: "s1", pathRef: "a1", outcome: "FOUND" }] };
    expect(digPicksAtMapPaths(first, ["a1", "a2"])).toBe(first);
    const failed = { ...evidence, searches: [{ searchId: "s1", pathRef: "dig-pick-1", outcome: "FAILED" }] };
    expect(digPicksAtMapPaths(failed, ["a1", "a2"]).searches.map((search) => search.pathRef)).toEqual(["a1"]);
  });

  it("the AI's sealed ones are read by their path; a text sealed before them, or that does not parse, offers none", () => {
    const one = { suggestion_id: "s-1", kind: "HELPS_MAIN_QUESTION", side: "FOR", text: "t", places: ["path:POS"] };
    const opened = { dig_suggestions: [{ position_ref: "POS", suggestions: [one, { suggestion_id: "bad" }] }] };
    expect(digSuggestionsOf(opened, "pos")).toEqual([one]);
    expect(digSuggestionsOf(opened, "other")).toEqual([]);
    expect(digSuggestionsOf({ text: {} }, "pos")).toEqual([]);
  });
});

/* Whether the AI's suggestions on a dig's own paths may still arrive: the flag that keeps the dig's page reading its answer. */
describe("a dig's own suggestions still to come", () => {
  const AT = Date.parse("2026-11-12T10:00:00.000Z");
  const finished = (overrides: Record<string, unknown> = {}) => ({
    rewrite_id: "rw-1", dig_run_id: "33333333-3333-4333-8333-333333333333", dig_level: 1, dig_finished_at: "2026-11-12T09:59:00.000Z", state: "READY",
    rewritten_at: "2026-11-12T10:00:00.000Z", changed: true, text: { line: "A line.", summary: "A summary.", fate: "HELD_UP" }, what_changed: ["A sentence."],
    fate_before: "PARTLY_HELD", view: null,
    dig_paths: [{ position_ref: "B1", line: "One.", fate: "HELD_UP" }, { position_ref: "b2", line: "Two.", fate: "FELL" }], ...overrides
  });
  const dig = (rewrite: unknown, level = 1) => ({ parent_run_id: "11111111-1111-4111-8111-111111111111", position_ref: "b1", places: ["path:b1"], level,
    picks: [], rewrite }) as never;
  const paid: AnswerWeb = { paths: [{ position_ref: "b1", search: { status: "NO_SEARCH_PLANNED" } as never, other_pages: [], suggestions: [] }] };
  const pending = (input: Partial<Parameters<typeof digSuggestionsPending>[0]>) =>
    digSuggestionsPending({ dig: dig(finished()), web: paid, sets: new Set(), now: AT + 60_000, ...input });

  it("pending until every path the finished rewrite names has a set, an empty one included; matched in any case", () => {
    expect(pending({})).toBe(true);
    expect(pending({ sets: new Set(["b1"]) })).toBe(true);
    expect(pending({ sets: new Set(["b1", "b2"]) })).toBe(false);
  });

  it("never on Free, at the deepest level, without a web part, before the rewrite is finished, or past the bound", () => {
    expect(pending({ web: { paths: [{ ...paid.paths[0]!, search: { status: "NOT_ON_PLAN" } }] } })).toBe(false);
    expect(pending({ dig: dig(finished({ dig_level: DIG_LEVEL_MAX }), DIG_LEVEL_MAX) })).toBe(false);
    expect(pending({ web: null })).toBe(false);
    expect(pending({ dig: dig(null) })).toBe(false);
    expect(pending({ dig: dig({ rewrite_id: "rw-1", dig_run_id: "33333333-3333-4333-8333-333333333333", dig_level: 1, dig_finished_at: "2026-11-12T09:59:00.000Z",
      state: "WRITING" }) })).toBe(false);
    expect(pending({ now: AT + DIG_SUGGESTIONS_WATCH_MS })).toBe(true);
    expect(pending({ now: AT + DIG_SUGGESTIONS_WATCH_MS + 1 })).toBe(false);
  });

  it("the bound covers every try a suggestion call may make, at the rewrite writer's own limits", () => {
    const bound = PATH_REWRITE_POLICY.writerBound;
    expect(DIG_SUGGESTIONS_WATCH_MS).toBeGreaterThanOrEqual(bound.maxAttempts * bound.deadlineMs);
  });
});
