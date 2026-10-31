// tests/unit/dig-suggestions-serve.test.ts
// W4-3: what the map offers. The kinds code finds (owner, 30 Oct; F14: Free gets only these), joined beside the AI's sealed ones; none
// at level 10; never an engine number or a passage. Made-up points.
import { describe, expect, it } from "vitest";
import { AnswerWebSchema, type AnswerWeb, type Node } from "@debateai/contract";
import { digLeadSuggestions, digLeadsOfPack, digPointSuggestions, digSuggestionsOf, webWithDigSuggestions } from "@debateai/serve";

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
  it("the AI's sealed ones are read by their path; a text sealed before them, or that does not parse, offers none", () => {
    const one = { suggestion_id: "s-1", kind: "HELPS_MAIN_QUESTION", side: "FOR", text: "t", places: ["path:POS"] };
    const opened = { dig_suggestions: [{ position_ref: "POS", suggestions: [one, { suggestion_id: "bad" }] }] };
    expect(digSuggestionsOf(opened, "pos")).toEqual([one]);
    expect(digSuggestionsOf(opened, "other")).toEqual([]);
    expect(digSuggestionsOf({ text: {} }, "pos")).toEqual([]);
  });
});
