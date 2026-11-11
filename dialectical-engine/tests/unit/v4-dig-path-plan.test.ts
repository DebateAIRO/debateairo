import { describe, expect, it } from "vitest";

import {
  digNewPickRefusal,
  digOverlaps,
  digPairKey,
  digPathPlanOf,
  digPathPlanWithPicks,
  digPathsMax,
  digPickText,
  digStartPaths,
  isPathsParent
} from "../../apps/ui/lib/v4/digPathPlan.js";
import { pathPlanCombineMembers, pathPlanReduce, type PathPlan, type PathPlanAction } from "../../apps/ui/lib/v4/pathPlan.js";
import { addPick, editPick, EMPTY_DRAFT, openPick, ownViewPick, pickPointsOf, suggestionPick } from "../../apps/ui/lib/v4/suggestions.js";
import type { V4DigPick } from "../../apps/ui/lib/v4/types.js";
import { START_STEP_LIMITS, StartCombineRequestSchema, StartPathsSchema, type Answer, type DigSuggestion } from "../../packages/contract/src/index.js";

/*
 * V4 start step, Task 79 (spec 2026-11-03 §4.4; dig-f35, r2-1, r2-22, choose-d3; owner answers Q18 A and Q19 A): a dig's picks
 * become paths on the same rows as the choosing step. The dig's path plan is the start step's own plan (pathPlan.ts) made from the
 * picks that are not open questions, in pick order; each change goes through pathPlanReduce, and a pick added or taken away keeps
 * the rows already shaped. What a dig sends is DIG_PICKS with each path's pick numbers (the place of the pick among the picks the
 * ask sends), at most 7 paths (Free 3). Two picks overlap when they rest on one point of the map (code, no AI call). Every text is
 * made up.
 */

const suggestion = (id: string, text: string, points?: readonly string[]): DigSuggestion => ({
  suggestion_id: id, kind: "UNDOCUMENTED", side: null, text, places: ["path:b2"], ...(points === undefined ? {} : { points: [...points] })
});
const pick = (id: string, text: string, points?: readonly string[]): V4DigPick => suggestionPick("b2", suggestion(id, text, points));
const open = (id: string): V4DigPick => openPick({ id, kind: "STILL_ARGUED", text: `Open question ${id}`, star: false, pathId: "b2" });

const LULLS = pick("s-lulls", "Seasonal lulls?", ["n-winter"]);
const GAP = pick("s-gap", "2030s gap?", ["n-winter", "n-build"]);
const COST = pick("s-cost", "What does storage cost?", ["n-build"]);
const LAND = pick("s-land", "How much land is needed?");

/** Combines the two paths at these places, as the rows' "Combine with…" does (both picked, then combined). */
function combined(plan: PathPlan, first: number, second: number): PathPlan {
  const actions: PathPlanAction[] = [
    { type: "SELECT", key: plan.paths[first]!.key }, { type: "SELECT", key: plan.paths[second]!.key }, { type: "COMBINE_SELECTED" }
  ];
  return actions.reduce((now, action) => pathPlanReduce(now, action).plan, plan);
}

/** The AI's words land on the path being written (the page's combine call answered). */
function written(plan: PathPlan, title = "T", question = "Q?", combineRef = "r.s"): PathPlan {
  const writing = plan.paths.find((path) => path.wording === "WRITING")!;
  return pathPlanReduce(plan, { type: "COMBINE_WRITTEN", key: writing.key, title, question, combineRef }).plan;
}

const sources = (plan: PathPlan) => plan.paths.map((path) => path.viewpoints.map((viewpoint) => viewpoint.source));

describe("Task 79: a dig's picks as paths (digPathPlan.ts)", () => {
  it("a parent with paths is a path debate's answer (answer.branches), an R22 answer is not", () => {
    expect(isPathsParent({ branches: { paths: [] } } as unknown as Answer)).toBe(true);
    expect(isPathsParent({} as Answer)).toBe(false);
  });

  it("one path per pick that is not an open question, in pick order, numbered as the ask sends the picks", () => {
    const plan = digPathPlanOf([open("p:n-1"), LULLS, open("o:2"), GAP], false);
    expect(sources(plan)).toEqual([[{ kind: "PICK", pickNo: 1 }], [{ kind: "PICK", pickNo: 2 }]]);
    // The chips are known by their picks, so a pick taken away or added never mixes the rows up.
    expect(plan.paths.map((path) => path.viewpoints[0]!.key)).toEqual([LULLS.key, GAP.key]);
    expect(plan.paths.map((path) => [path.title, path.question, path.wording])).toEqual([
      ["Seasonal lulls?", "Seasonal lulls?", "AI"], ["2030s gap?", "2030s gap?", "AI"]
    ]);
    expect(plan.width).toBe(7);
    expect(plan.more).toEqual([]);
    const sent = digStartPaths(plan);
    expect(sent).toEqual({
      source: "DIG_PICKS", width: 2, chosen_by: "PERSON",
      paths: [
        { title: "Seasonal lulls?", question: "Seasonal lulls?", members: [{ pick_no: 1 }] },
        { title: "2030s gap?", question: "2030s gap?", members: [{ pick_no: 2 }] }
      ]
    });
    expect(StartPathsSchema.safeParse(sent).success).toBe(true);
  });

  it("the person's own view (and their wording of a suggestion) is theirs; a pick is sent as the ask sends its text", () => {
    const own = ownViewPick("b2", "  Pumped hydro could carry a windless week.  ", 1);
    const edited = suggestionPick("b2", suggestion("s-edit", "As the AIs wrote it?"), "My own wording?");
    const plan = digPathPlanOf([own, edited, LAND], false);
    expect(plan.paths.map((path) => [path.wording, path.tag])).toEqual([["PERSON", "ADDED_BY_YOU"], ["PERSON", null], ["AI", null]]);
    expect(plan.paths[0]!.question).toBe("Pumped hydro could carry a windless week.");
    expect(digPickText(own)).toBe("Pumped hydro could carry a windless week.");
    expect(digPickText(edited)).toBe("My own wording?");
  });

  it("no pick that makes a path: no paths; one: one path", () => {
    expect(digPathPlanOf([open("p:n-1")], false).paths).toEqual([]);
    expect(digPathPlanOf([LULLS, open("p:n-1")], false).paths).toHaveLength(1);
  });

  it("Combine with… makes one path being written; the AI's words land, and the dig sends one path with both picks and its reference", () => {
    const plan = combined(digPathPlanOf([LULLS, GAP], false), 0, 1);
    expect(plan.paths).toHaveLength(1);
    expect(plan.paths[0]!.wording).toBe("WRITING");
    // What the combine call reads: the picks without titles (the server knows a pick by its text), as the contract allows a dig's.
    const members = pathPlanCombineMembers(plan.paths[0]!);
    expect(members).toEqual([
      { viewpoint_id: null, pick_no: 1, title: null, question: "Seasonal lulls?" },
      { viewpoint_id: null, pick_no: 2, title: null, question: "2030s gap?" }
    ]);
    expect(StartCombineRequestSchema.safeParse({
      context: { kind: "DIG", parent_run_id: "11111111-1111-4111-8111-111111111111" }, reading_level: "plain", members
    }).success).toBe(true);
    const sent = digStartPaths(written(plan));
    expect(sent).toEqual({
      source: "DIG_PICKS", width: 1, chosen_by: "PERSON",
      paths: [{ title: "T", question: "Q?", members: [{ pick_no: 1 }, { pick_no: 2 }], combine_ref: "r.s" }]
    });
    expect(StartPathsSchema.safeParse(sent).success).toBe(true);
  });

  it("Undo after a combine gives the two rows back; Split apart on the combined row gives them back too", () => {
    const plan = written(combined(digPathPlanOf([LULLS, GAP], false), 0, 1));
    const undone = pathPlanReduce(plan, { type: "UNDO" }).plan;
    expect(sources(undone)).toEqual([[{ kind: "PICK", pickNo: 1 }], [{ kind: "PICK", pickNo: 2 }]]);
    const split = pathPlanReduce(plan, { type: "SPLIT", key: plan.paths[0]!.key }).plan;
    expect(split.paths.map((path) => path.title)).toEqual(["Seasonal lulls?", "2030s gap?"]);
    expect(split.paths.map((path) => path.viewpoints[0]!.key)).toEqual([LULLS.key, GAP.key]);
  });

  it("a pick added keeps the rows already shaped and comes last; the same picks give the same plan back", () => {
    const plan = written(combined(digPathPlanOf([LULLS, GAP], false), 0, 1));
    expect(digPathPlanWithPicks(plan, [LULLS, GAP])).toBe(plan);
    const more = digPathPlanWithPicks(plan, [LULLS, GAP, COST]);
    expect(more.paths).toHaveLength(2);
    expect(more.paths[0]).toBe(plan.paths[0]);
    expect(more.paths[0]!.combineRef).toBe("r.s");
    expect(more.paths[1]!.viewpoints.map((viewpoint) => viewpoint.source)).toEqual([{ kind: "PICK", pickNo: 3 }]);
    expect(digPathPlanWithPicks(more, [LULLS, GAP, COST])).toBe(more);
    // An open question is no path: picking one changes no row.
    expect(digPathPlanWithPicks(more, [LULLS, open("p:n-9"), GAP, COST])).toBe(more);
  });

  it("a pick taken away: its path goes, a combined path keeps the other pick in its own words, later picks are numbered again", () => {
    const plan = written(combined(digPathPlanOf([LULLS, GAP, COST], false), 1, 2));
    expect(sources(plan)).toEqual([[{ kind: "PICK", pickNo: 1 }], [{ kind: "PICK", pickNo: 2 }, { kind: "PICK", pickNo: 3 }]]);
    // The first pick taken away: the combined path keeps its words, its picks numbered as the ask now sends them.
    const renumbered = digPathPlanWithPicks(plan, [GAP, COST]);
    expect(renumbered.paths).toHaveLength(1);
    expect(renumbered.paths[0]!.title).toBe("T");
    expect(sources(renumbered)).toEqual([[{ kind: "PICK", pickNo: 1 }, { kind: "PICK", pickNo: 2 }]]);
    // One pick of the combined path taken away: the other speaks in its own words again.
    const left = digPathPlanWithPicks(plan, [LULLS, COST]);
    expect(left.paths.map((path) => [path.title, path.wording, path.combineRef])).toEqual([
      ["Seasonal lulls?", "AI", null], ["What does storage cost?", "AI", null]
    ]);
    expect(sources(left)).toEqual([[{ kind: "PICK", pickNo: 1 }], [{ kind: "PICK", pickNo: 2 }]]);
  });

  it("a pick's words edited: its own row follows them; a row the person rewrote keeps their words and asks", () => {
    const plan = digPathPlanOf([LULLS, GAP], false);
    const edited = suggestionPick("b2", suggestion("s-lulls", "Seasonal lulls?", ["n-winter"]), "Seasonal lulls in the north?");
    expect(digPathPlanWithPicks(plan, [edited, GAP]).paths[0]!.question).toBe("Seasonal lulls in the north?");
    const rewritten = pathPlanReduce(plan, { type: "REWRITE", key: plan.paths[0]!.key, title: "Mine", question: "My question?" }).plan;
    const kept = digPathPlanWithPicks(rewritten, [edited, GAP]).paths[0]!;
    expect([kept.title, kept.question, kept.askReword]).toEqual(["Mine", "My question?", true]);
  });

  it("paid: one more pick past 7 paths is refused PATHS_FULL; after combining two it fits; never more than 7 sent", () => {
    const seven = Array.from({ length: 7 }, (_, at) => pick(`s-${String(at)}`, `Question ${String(at)}?`));
    const plan = digPathPlanOf(seven, false);
    expect(plan.paths).toHaveLength(7);
    expect(digPathsMax(false)).toBe(START_STEP_LIMITS.pathsMax);
    expect(digNewPickRefusal(plan)).toBe("PATHS_FULL");
    const roomy = written(combined(plan, 0, 1));
    expect(digNewPickRefusal(roomy)).toBeNull();
    const eighth = digPathPlanWithPicks(roomy, [...seven, pick("s-8", "Question 8?")]);
    expect(eighth.paths).toHaveLength(7);
    expect(digNewPickRefusal(eighth)).toBe("PATHS_FULL");
    // Eight picks that were never combined (picks brought back by another way): the plan holds them, the dig sends 7.
    const over = digPathPlanOf([...seven, pick("s-8", "Question 8?")], false);
    expect(over.paths).toHaveLength(8);
    expect(digStartPaths(over).paths).toHaveLength(7);
    expect(digStartPaths(over).width).toBe(7);
  });

  it("a combine past four picks in one path is refused, as the contract would (four own words and picks together)", () => {
    const five = Array.from({ length: 5 }, (_, at) => pick(`s-${String(at)}`, `Question ${String(at)}?`));
    let plan = written(combined(digPathPlanOf(five, false), 0, 1));
    plan = written(combined(plan, 0, 1));
    plan = written(combined(plan, 0, 1));
    expect(plan.paths[0]!.viewpoints).toHaveLength(4);
    const picking = pathPlanReduce(pathPlanReduce(plan, { type: "SELECT", key: plan.paths[0]!.key }).plan, { type: "SELECT", key: plan.paths[1]!.key }).plan;
    expect(pathPlanReduce(picking, { type: "COMBINE_SELECTED" }).refusal).toBe("OWN_WORDS_FULL");
  });

  it("Free: three picks, combining two gives two paths", () => {
    const plan = digPathPlanOf([LULLS, GAP, COST], true);
    expect(plan.width).toBe(3);
    expect(digNewPickRefusal(plan)).toBe("PATHS_FULL");
    const two = written(combined(plan, 0, 1));
    expect(two.paths).toHaveLength(2);
    expect(digStartPaths(two)).toMatchObject({ source: "DIG_PICKS", width: 2, chosen_by: "PERSON" });
  });

  it("overlaps (answer Q18): picks resting on one point, in pick order, open questions never, a pair kept apart never", () => {
    expect(pickPointsOf(LULLS)).toEqual(["n-winter"]);
    expect(digOverlaps([LULLS, GAP], pickPointsOf, new Set())).toEqual([{ a: LULLS.key, b: GAP.key }]);
    expect(digOverlaps([LULLS, LAND], pickPointsOf, new Set())).toEqual([]);
    // a–b and b–c: both pairs, the first first (the page shows one at a time).
    expect(digOverlaps([LULLS, GAP, COST], pickPointsOf, new Set())).toEqual([{ a: LULLS.key, b: GAP.key }, { a: GAP.key, b: COST.key }]);
    expect(digOverlaps([LULLS, GAP, COST], pickPointsOf, new Set([digPairKey(GAP.key, LULLS.key)]))).toEqual([{ a: GAP.key, b: COST.key }]);
    expect(digPairKey(LULLS.key, GAP.key)).toBe(digPairKey(GAP.key, LULLS.key));
    // A still-argued point's open question rests on that point, but it is a place in the dig's question, never a path.
    expect(digOverlaps([open("p:n-winter"), LULLS], pickPointsOf, new Set())).toEqual([]);
  });

  it("v2 parent: a pick's words past 1,000 characters (a path's question) are refused TOO_LONG; an R22 parent keeps 2,000", () => {
    const long = "a".repeat(START_STEP_LIMITS.pathQuestionMaxChars + 1);
    const fits = "a".repeat(START_STEP_LIMITS.pathQuestionMaxChars);
    expect(addPick(EMPTY_DRAFT, ownViewPick("b2", long, 1), "premium", true).refused).toBe("TOO_LONG");
    expect(addPick(EMPTY_DRAFT, ownViewPick("b2", fits, 1), "premium", true).refused).toBeNull();
    expect(addPick(EMPTY_DRAFT, ownViewPick("b2", long, 1), "premium").refused).toBeNull();
    const draft = addPick(EMPTY_DRAFT, LULLS, "premium", true).draft;
    expect(editPick(draft, LULLS.key, long, true).refused).toBe("TOO_LONG");
    expect(editPick(draft, LULLS.key, long).refused).toBeNull();
  });
});
