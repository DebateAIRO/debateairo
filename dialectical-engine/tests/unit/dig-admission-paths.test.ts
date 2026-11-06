// tests/unit/dig-admission-paths.test.ts
// V4 start step, Task 55 (spec 2026-11-03 §4.4 "Digs work the same way"): a dig of a path debate. The API side: a "+ N more" pick
// (the page's contract, Task 62: its text is the item's question, its place its more_id) reads as the AI's when it is sent
// word for word, and the places of a path debate's map anchor on its paths b<n>. The runner side: a dig that is itself a path
// debate hands its rewrite its own paths b<n> (its roots in force), in the person's order, never its positions in the judges'
// order. Every name, question and id here is made up.
import { describe, expect, it } from "vitest";
import type { AskParent } from "@debateai/contract";
import {
  digAnchorOf, digPathIndexOf, digPickAuthorOf, digSuggestionTextFromAnswer, digSuggestionTextOf, recordDigPicksAtStart
} from "../../apps/api/src/dig-admission.js";
import { runDigPathRewrite } from "../../apps/runner/src/path-rewrite.js";
import type { PathRewriteDigPath } from "../../apps/runner/src/path-rewrite-material.js";
import { DIG_A, DIG_NODES, dig, digSnapshot, memoryStore, membersOf, settingsOver, team } from "../support/path-rewrite-world.js";

const ANSWER = Object.freeze({ branches: Object.freeze({ more: Object.freeze([
  Object.freeze({ more_id: "more-kp07", question: "Q7?" }), Object.freeze({ more_id: "more-kp08", question: "Q8?" })]) }) });

describe("a '+ N more' pick is read from the parent's branches", () => {
  it("its text is the item's question, found by its more_id; an id the list does not hold has none", () => {
    expect(digSuggestionTextOf({ branches: { more: [{ more_id: "more-kp07", question: "Q7?" }] } }, "more-kp07")).toBe("Q7?");
    expect(digSuggestionTextOf(ANSWER, "more-kp08")).toBe("Q8?");
    expect(digSuggestionTextOf(ANSWER, "more-kp09")).toBeNull();
    // An R22 answer has no branches: a web suggestion is still found, nothing else.
    expect(digSuggestionTextOf({ web: { paths: [{ suggestions: [{ suggestion_id: "s-1", text: "Do ferries run in winter?" }] }] } }, "more-kp07"))
      .toBeNull();
    expect(digSuggestionTextOf(null, "more-kp07")).toBeNull();
  });

  it("sent word for word it is the AI's (AI_SUGGESTION); edited it is the person's (PERSON_EDITED)", async () => {
    const authors = async (text: string): Promise<readonly string[]> => {
      const written: string[] = [];
      const parent: AskParent = { parent_run_id: "11111111-1111-4111-8111-111111111111", places: [], mode: "quick",
        picks: [{ kind: "HELPS_MAIN_QUESTION", suggestion_id: "more-kp07", place: "more-kp07", text }] };
      const outcome = await recordDigPicksAtStart({ ownerRef: "owner", parent, childRunId: "child", positionRef: null },
        { record: async (input) => { written.push(...input.picks.map((pick) => pick.author)); return "RECORDED"; } },
        digSuggestionTextFromAnswer(async () => ANSWER as never), () => undefined);
      expect(outcome).toBe("RECORDED");
      return written;
    };
    expect(await authors("Q7?")).toEqual(["AI_SUGGESTION"]);
    expect(await authors("  Q7?  ")).toEqual(["AI_SUGGESTION"]);
    expect(await authors("Q7, and in winter?")).toEqual(["PERSON_EDITED"]);
    const pick = { kind: "HELPS_MAIN_QUESTION" as const, suggestion_id: "more-kp07", place: "more-kp07", text: "Q7?" };
    expect(digPickAuthorOf(pick, digSuggestionTextOf(ANSWER, "more-kp07"))).toBe("AI_SUGGESTION");
  });
});

describe("the places of a path debate's map anchor on its paths", () => {
  // A path debate's story names each path by its id (story v5), so its index is b1..bN.
  const V2_INDEX = digPathIndexOf([
    { position_ref: "b1", node_refs: ["n1", "n2"] },
    { position_ref: "b2", node_refs: ["n3", "n4"] },
    { position_ref: "b3", node_refs: ["n5"] }
  ]);
  const parentAt = (places: readonly string[]): AskParent => ({ parent_run_id: "11111111-1111-4111-8111-111111111111", places: [...places],
    mode: "quick" });

  it("a point anchors on the path it is on; a path named outright is that path, with or without an index", () => {
    expect(digAnchorOf(parentAt(["p:n3"]), V2_INDEX)).toBe("b2");
    expect(digAnchorOf(parentAt(["path:b1"]), null)).toBe("b1");
    expect(digAnchorOf(parentAt(["path:b3"]), V2_INDEX)).toBe("b3");
  });

  it("a point with no index, and a '+ N more' item, hang under the main question", () => {
    expect(digAnchorOf(parentAt(["p:n3"]), null)).toBeNull();
    expect(digAnchorOf(parentAt(["more-kp07"]), V2_INDEX)).toBeNull();
    expect(digAnchorOf(parentAt(["more-kp07"]), null)).toBeNull();
  });
});

describe("a dig that is a path debate rewrites its parent's path with its own paths b<n>", () => {
  // The dig's roots in force (0159), by root index: b1 argued from the runner-up (Yes), b2 from the winner (No).
  const ROOTS = Object.freeze([Object.freeze({ ref: "b1", rootNodeId: DIG_NODES.yes }), Object.freeze({ ref: "b2", rootNodeId: DIG_NODES.no })]);

  async function rewriteWith(roots: readonly Readonly<{ ref: string; rootNodeId: string }>[] | null) {
    const store = memoryStore();
    const hooked: (readonly string[])[] = [];
    const stored: (readonly PathRewriteDigPath[])[] = [];
    const base = settingsOver({ store, digs: new Map([[DIG_A, dig({ positionRef: "b2" })]]),
      extra: { afterRewrite: (settled) => { hooked.push(settled.digPathRefs); } } });
    const settings = Object.freeze({ ...base, sources: Object.freeze({ ...base.sources,
      recordInput: async (_runId: string, _workItemId: string, digPaths: readonly PathRewriteDigPath[]) => { stored.push(digPaths); return "RECORDED"; },
      ...(roots === null ? {} : { pathRootsOf: async (runId: string) => { expect(runId).toBe(DIG_A); return roots; } }) }) });
    expect(await runDigPathRewrite(settings, digSnapshot(DIG_A, membersOf(team())))).toBe(true);
    const row = store.rewrites[0]!;
    return { row, content: store.contents.get(row.rewriteId), hooked, stored };
  }

  it("its paths in the person's order, each named by its id: the stored input, the sealed text and the hook", async () => {
    const { row, content, hooked, stored } = await rewriteWith(ROOTS);
    expect(row.outcome).toBe("READY");
    expect(stored.map((paths) => paths.map((path) => path.positionRef))).toEqual([["b1", "b2"]]);
    // Each path is read from its own root: b1's point is the one that argues Yes, b2's the two that argue No.
    expect(stored[0]!.map((path) => path.points.map((point) => point.id))).toEqual([[DIG_NODES.buses], [DIG_NODES.queues, DIG_NODES.bridge]]);
    expect(content?.dig_paths.map((path) => path.position_ref)).toEqual(["b1", "b2"]);
    expect(hooked).toEqual([["b1", "b2"]]);
  });

  it("a dig with no roots (R22, or a source that has none) keeps the judges' order and its positions' ids", async () => {
    for (const roots of [null, []] as const) {
      const { content, hooked } = await rewriteWith(roots);
      expect(content?.dig_paths.map((path) => path.position_ref)).toEqual([DIG_NODES.no, DIG_NODES.yes]);
      expect(hooked).toEqual([[DIG_NODES.no, DIG_NODES.yes]]);
    }
  });
});
