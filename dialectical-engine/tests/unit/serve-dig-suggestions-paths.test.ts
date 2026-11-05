// tests/unit/serve-dig-suggestions-paths.test.ts
// V4 start step, Task 55b (owner F14: Free keeps the suggestions code finds). On a path debate the web part's paths are named by
// their path ids (b<n>), so the points code reads are those under each path's ROOT: the served answer hands the map from path id to
// root node (0158's roots in force), and each suggestion still hangs under its path ("path:b<n>"). An R22 answer hands none and
// keeps its bytes. Made-up points.
import { describe, expect, it } from "vitest";
import { AnswerWebSchema, type AnswerWeb, type Node } from "@debateai/contract";
import { webWithDigSuggestions } from "@debateai/serve";

const node = (id: string, overrides: Partial<Node> = {}): Node => ({ node_id: id, claim: `Point ${id} in plain words.`, way_of_knowing: "LOOKED_UP", review: null,
  sources: [], ...overrides } as Node);
const edge = (from: string, to: string) => ({ from_node_ref: from, target_kind: "NODE", target_ref: to });

/** A Free path debate on two paths: b1's root r1 with a disputed point and one on reasoning alone; b2's root r2 with a plain point. */
const V2_NODES = [node("r1"), node("d1", { review: { outcome: "dispute" } as never }), node("u1", { way_of_knowing: "REASONING" as never }),
  node("r2"), node("p2")];
const V2_EDGES = [edge("d1", "r1"), edge("u1", "d1"), edge("p2", "r2")] as never;
const ROOTS = new Map([["b1", "r1"], ["b2", "r2"]]);
const v2Web = (): AnswerWeb => ({ paths: ["b1", "b2"].map((position_ref) => ({ position_ref, search: { status: "NOT_ON_PLAN" as const }, other_pages: [],
  suggestions: [] })) });

/** The R22 fixture: the web path is named by its root node itself. */
const R22_NODES = [node("root"), node("n1", { review: { outcome: "dispute" } as never }), node("n2", { way_of_knowing: "REASONING" as never }), node("n3")];
const R22_EDGES = [edge("n1", "root"), edge("n2", "n1"), edge("n3", "root")] as never;
const r22Web = (): AnswerWeb => ({ paths: [{ position_ref: "root", search: { status: "NOT_ON_PLAN" }, other_pages: [], suggestions: [] }] });

describe("Task 55b: code finds its suggestions under a path debate's roots", () => {
  it("a Free v2 answer whose b1 root has a disputed point offers a CONTRADICTING suggestion with places [\"path:b1\"]", () => {
    const out = webWithDigSuggestions(v2Web(), V2_NODES, V2_EDGES, null, new Map(), ROOTS);
    const [b1, b2] = out.paths;
    expect(b1!.suggestions.map((entry) => [entry.kind, entry.text, entry.places])).toEqual([
      ["CONTRADICTING", "Point d1 in plain words.", ["path:b1"]], ["UNDOCUMENTED", "Point u1 in plain words.", ["path:b1"]]]);
    // b2's root has one plain point: nothing to offer, and nothing of b1's.
    expect(b2!.suggestions).toEqual([]);
    expect(AnswerWebSchema.safeParse(out).success).toBe(true);
  });

  it("without the root map a path id names no node, so nothing is found (what Free lost before)", () => {
    expect(webWithDigSuggestions(v2Web(), V2_NODES, V2_EDGES, null).paths.flatMap((path) => path.suggestions)).toEqual([]);
  });

  it("without rootOf the R22 fixture's suggestions are unchanged, byte for byte", () => {
    const today = webWithDigSuggestions(r22Web(), R22_NODES, R22_EDGES, 1);
    expect(today.paths[0]!.suggestions.map((entry) => [entry.kind, entry.places])).toEqual([["CONTRADICTING", ["path:root"]], ["UNDOCUMENTED", ["path:root"]]]);
    expect(JSON.stringify(webWithDigSuggestions(r22Web(), R22_NODES, R22_EDGES, 1, new Map(), undefined))).toBe(JSON.stringify(today));
    // A root map that does not name the R22 path changes nothing either.
    expect(JSON.stringify(webWithDigSuggestions(r22Web(), R22_NODES, R22_EDGES, 1, new Map(), ROOTS))).toBe(JSON.stringify(today));
  });

  it("none at level 10 on a path debate either", () => {
    expect(webWithDigSuggestions(v2Web(), V2_NODES, V2_EDGES, 10, new Map(), ROOTS).paths.flatMap((path) => path.suggestions)).toEqual([]);
  });
});
