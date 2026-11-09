// tests/unit/serve-path-order.test.ts
// V4 start step, Task 58b (Task 53b's rule, spec 2026-11-03 §4.3: the served answer is the same whichever path finishes first). Each
// path of a path debate saves in its own order, so core.node.created_at_seq across paths follows which path finished first. Serve lists
// a path debate's nodes path by path in plan order (b1, b2, …), each path's nodes in their saved order; a node outside every path keeps
// its place before the paths' blocks (saved before any path's node) or after them; an edge follows its source node's place, then its
// own saved order. Made-up ids.
import { describe, expect, it } from "vitest";
import { inPathOrder, pathNodePlacesOf, type PathOrderNode } from "../../packages/serve/src/path-order.js";

const root = (id: string): PathOrderNode => ({ nodeId: id, parentNodeId: null });
const child = (id: string, parent: string): PathOrderNode => ({ nodeId: id, parentNodeId: parent });
/** The node ids in their served places. */
const servedOf = (nodes: readonly PathOrderNode[], roots: readonly string[]): string[] =>
  inPathOrder(nodes, (node) => node.nodeId, pathNodePlacesOf(nodes, roots)).map((node) => node.nodeId);

/** Two paths, b1 rooted at r1 and b2 at r2; b2 finished (and saved) its legs before b1. */
const B2_FIRST = [root("r1"), root("r2"), child("b2-leg", "r2"), child("b2-deep", "b2-leg"), child("b1-leg", "r1"), child("b1-deep", "b1-leg"),
  child("b1-other", "r1")];
/** The same debate, b1 finished first. */
const B1_FIRST = [root("r2"), root("r1"), child("b1-leg", "r1"), child("b1-deep", "b1-leg"), child("b1-other", "r1"), child("b2-leg", "r2"),
  child("b2-deep", "b2-leg")];

describe("Task 58b: a path debate's nodes are served path by path", () => {
  it("b2 saved before b1: every b1 node comes before every b2 node, each path's nodes in their saved order", () => {
    expect(servedOf(B2_FIRST, ["r1", "r2"])).toEqual(["r1", "b1-leg", "b1-deep", "b1-other", "r2", "b2-leg", "b2-deep"]);
  });

  it("the opposite timing serves the same order, and so does any order of the roots' saves", () => {
    expect(servedOf(B1_FIRST, ["r1", "r2"])).toEqual(servedOf(B2_FIRST, ["r1", "r2"]));
  });

  it("the paths follow the plan order the roots are given in, not the roots' saved order", () => {
    expect(servedOf(B2_FIRST, ["r2", "r1"])).toEqual(["r2", "b2-leg", "b2-deep", "r1", "b1-leg", "b1-deep", "b1-other"]);
  });

  it("a node outside every path saved before any path's node comes first; one saved later comes after the last path, both in saved order", () => {
    const nodes = [root("question"), root("r2"), child("b2-leg", "r2"), root("aside"), root("r1"), child("b1-leg", "r1"), child("aside-leg", "aside")];
    expect(servedOf(nodes, ["r1", "r2"])).toEqual(["question", "r1", "b1-leg", "r2", "b2-leg", "aside", "aside-leg"]);
  });

  it("a node whose parent is not among the live nodes (set aside by a reclaim) belongs to no path", () => {
    const nodes = [root("r1"), child("b1-leg", "r1"), child("orphan", "stale-parent")];
    expect(pathNodePlacesOf(nodes, ["r1"]).get("orphan")).toBe(2);
    expect(servedOf(nodes, ["r1"])).toEqual(["r1", "b1-leg", "orphan"]);
  });

  it("no root in force: the saved order, unchanged", () => {
    expect(servedOf(B2_FIRST, [])).toEqual(B2_FIRST.map((node) => node.nodeId));
  });

  it("ids are matched whatever their case (Postgres renders a uuid in lower case)", () => {
    const nodes = [root("AA"), root("bb"), child("cc", "bb"), child("dd", "AA")];
    expect(servedOf(nodes, ["aa", "BB"])).toEqual(["AA", "dd", "bb", "cc"]);
  });

  it("edges follow their source node's place, then their own saved order; an edge whose source has no place goes last", () => {
    const places = pathNodePlacesOf(B2_FIRST, ["r1", "r2"]);
    const edges = [{ id: "e1", from: "b2-leg" }, { id: "e2", from: "b2-deep" }, { id: "e3", from: "b1-leg" }, { id: "e4", from: "elsewhere" },
      { id: "e5", from: "b1-leg" }, { id: "e6", from: "b1-deep" }];
    expect(inPathOrder(edges, (edge) => edge.from, places).map((edge) => edge.id)).toEqual(["e3", "e5", "e6", "e1", "e2", "e4"]);
  });
});
