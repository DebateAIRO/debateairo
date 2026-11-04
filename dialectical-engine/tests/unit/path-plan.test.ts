// tests/unit/path-plan.test.ts
// V4 start step, Task 45 (spec 2026-11-03 §4.3): a path debate's plan, pure. Every chosen path is its own root, argued for and
// against from its viewpoints and the gap round's points, with no cross replies between paths; every path keeps a chain past
// round 1; a refused root may go to a seat that argues another path. Data is made up.
import { describe, expect, it } from "vitest";
import type { PathGapRound } from "@debateai/contract";
import type { StoredStartPathSet } from "@debateai/db";
import type { DebateShapeV2Input } from "@debateai/register";
import {
  PATH_ROOT_LIMITS, pathConsiderationsOf, pathPlanFitsReceipt, pathRootLegMaterial, pathRootSeats, pathRoundOnePoints, pathsRunPathsOf,
  shapePositionsFromPaths, shapeViewOfV2, type PathsRunPath
} from "../../apps/runner/src/path-plan.js";
import { buildShapePlan, shapePositionsForTodaysOpening } from "../../apps/runner/src/shape-plan.js";
import { pathsSelectChains } from "../../apps/runner/src/shape-select.js";
import { pathsRootHandOver } from "../../apps/runner/src/shape-seats.js";

const KEY_0069 = /^JUDGE(:root:(secondary|[0-9]{1,4})|:(defender|critic):root[0-9]{1,4}:r[0-9]{1,4}:p[0-9]{1,4}|:cross-root:[0-9]{1,4}->[0-9]{1,4})?$/u;
const SCRUTINY = { roundsPerPoint: 1, pointsPerDebate: 2 } as const;

const viewpoint = (title: string | null, question: string, own = false) =>
  ({ viewpointId: own ? null : `pt1${title?.length ?? 0}`, pickNo: null, title, question, own });
const path = (no: number, extra: Partial<PathsRunPath> = {}): PathsRunPath => ({
  pathNo: no, pathId: `b${String(no)}` as PathsRunPath["pathId"], title: `T${String(no)}`, question: `Q${String(no)}?`,
  viewpoints: [viewpoint(`V${String(no)}a`, `Does ${String(no)}a matter?`), viewpoint(`V${String(no)}b`, `Does ${String(no)}b matter?`)],
  ownWords: [], gapPoints: [], ...extra
});
const SET: StoredStartPathSet = {
  runId: "11111111-1111-4111-8111-111111111111", source: "MENU", width: 3, chosenBy: "PERSON", carryOnToReport: false, menu: null,
  paths: [
    { pathId: "b2", pathNo: 2, author: "PERSON_OWN_VIEW", title: "My own view", question: "Is the old pier enough?",
      viewpoints: [viewpoint(null, "The old pier is enough if it is repaired.", true)], ownWords: ["The old pier is enough if it is repaired."] },
    { pathId: "b1", pathNo: 1, author: "AI_SUGGESTION", title: "Whole-system costs", question: "What would the pier cost to run?",
      viewpoints: [viewpoint("Costs", "What would it cost to build?"), viewpoint("Crews", "Who would crew the second ferry?")], ownWords: [] }
  ]
};
const GAP: PathGapRound = { points: [{ text: "What about winter storms?", path_id: "b1" }, { text: "Any other way across?", path_id: null },
  { text: "Would tourists use it?", path_id: "b2" }, { text: "What about dredging?", path_id: "b1" }] };
const V2: DebateShapeV2Input = {
  plan: "plus", depthMode: "fixed", scrutiny: "deep", answerLength: "standard", paths: 7, pathsSource: "MENU", runListWriters: 0,
  graders: 2, pointsPerPath: 2, deeperTopPoints: 2, gapRounds: 1, closeCallExtraGraders: 1, scrutinyRoundsPerPoint: 1,
  scrutinyPointsPerDebate: 2, scrutinyLeverageMin: 0.05, scrutinyWeakBelow: 0.5, answerWords: 300, writerBound: 4096, mapMergeBound: 16384
};
const LONE_HIGH = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u;

describe("the paths a run argues", () => {
  it("are the stored paths in their order, each with the gap points raised for it", () => {
    const paths = pathsRunPathsOf(SET, GAP);
    expect(paths.map((entry) => [entry.pathNo, entry.pathId, entry.gapPoints])).toEqual([
      [1, "b1", ["What about winter storms?", "What about dredging?"]], [2, "b2", ["Would tourists use it?"]]]);
    expect(pathsRunPathsOf(SET, null).map((entry) => entry.gapPoints)).toEqual([[], []]);
    expect(paths[1]!.ownWords).toEqual(["The old pier is enough if it is repaired."]);
  });

  it("a path's considerations: each viewpoint as title: question (own text alone), then its gap points", () => {
    const [b1, b2] = pathsRunPathsOf(SET, GAP);
    expect(pathConsiderationsOf(b1!)).toEqual(["Costs: What would it cost to build?", "Crews: Who would crew the second ferry?",
      "What about winter storms?", "What about dredging?"]);
    expect(pathConsiderationsOf(b2!)).toEqual(["The old pier is enough if it is repaired.", "Would tourists use it?"]);
  });

  it("round 1: against first, then alternating, one consideration each, none past the last", () => {
    expect(pathRoundOnePoints(["v1", "v2"], 3)).toEqual([
      { polarity: "attack", consideration: "v1", keyPointId: null },
      { polarity: "support", consideration: "v2", keyPointId: null },
      { polarity: "attack", consideration: null, keyPointId: null }]);
    expect(pathRoundOnePoints(["v1", "v2", "v3"], 1)).toEqual([{ polarity: "attack", consideration: "v1", keyPointId: null }]);
  });

  it("each path is a position: its id, its question, no map points, and no rival but itself", () => {
    const positions = shapePositionsFromPaths([path(1), path(2)], 2);
    expect(positions[0]).toMatchObject({ answerId: "b1", statement: "Q1?", rivalIndex: 0, mapPoints: null });
    expect(positions[1]).toMatchObject({ answerId: "b2", statement: "Q2?", rivalIndex: 1 });
    expect(positions[0]!.points.map((point) => point.consideration)).toEqual(["V1a: Does 1a matter?", "V1b: Does 1b matter?"]);
  });
});

describe("the plan: one branch per path, no cross", () => {
  it("one path plans one root and its points", () => {
    const plan = buildShapePlan({ positions: shapePositionsFromPaths([path(1)], 2), depth: 1, scrutiny: SCRUTINY, cross: false });
    expect(plan.rootCount).toBe(1);
    expect(plan.legs.map((leg) => leg.kind)).toEqual(["POINT", "POINT"]);
    expect(plan.legs[0]!.callSiteKey).toBe("JUDGE:critic:root0:r1:p1");
    expect(plan.legs[1]!.callSiteKey).toBe("JUDGE:defender:root0:r1:p2");
  });

  it("seven paths at depth 2: no cross reply, 42 legs, 53 nodes, every key in 0069's shape", () => {
    const paths = Array.from({ length: 7 }, (_unused, at) => path(at + 1));
    const plan = buildShapePlan({ positions: shapePositionsFromPaths(paths, 2), depth: 2, scrutiny: SCRUTINY, cross: false });
    expect(plan.rootCount).toBe(7);
    expect(plan.legs.filter((leg) => leg.kind === "CROSS")).toHaveLength(0);
    expect(plan.legs).toHaveLength(42);
    expect(plan.totalPlannedNodes).toBe(53);
    expect(new Set(plan.legs.map((leg) => leg.callSiteKey)).size).toBe(42);
    for (const leg of plan.legs) expect(leg.callSiteKey).toMatch(KEY_0069);
  });

  it("a v1 plan of one position is still refused, and a path plan argued with cross replies is refused too", () => {
    expect(() => buildShapePlan({ positions: shapePositionsForTodaysOpening({ answers: 1, pointsPerAnswer: 2 }), depth: 1, scrutiny: SCRUTINY }))
      .toThrowError("SHAPE_PLAN_INPUT_INVALID");
    expect(() => buildShapePlan({ positions: shapePositionsFromPaths([path(1), path(2)], 2), depth: 1, scrutiny: SCRUTINY }))
      .toThrowError("SHAPE_PLAN_RIVAL_INVALID");
    expect(() => buildShapePlan({ positions: [], depth: 1, scrutiny: SCRUTINY, cross: false })).toThrowError("SHAPE_PLAN_INPUT_INVALID");
  });

  it("the root seats go round the ordered seats when paths outnumber them", () => {
    expect(pathRootSeats(["A", "B", "C"], 5)).toEqual(["A", "B", "C", "A", "B"]);
    expect(pathRootSeats(["A", "B", "C", "D"], 2)).toEqual(["A", "B"]);
    expect(() => pathRootSeats([], 2)).toThrowError("PATH_ROOT_SEATS_INVALID");
  });
});

describe("a chain kept on every path", () => {
  const chainsByRoot = new Map([[0, [7, 9]], [1, [10, 11]]]);
  it("a root with no chain chosen keeps its smallest chain with a leverage", () => {
    const leverage = new Map<number, number | null>([[7, 0.1], [9, null], [10, 0.2], [11, null]]);
    const kept = pathsSelectChains({ chainsByRoot, leverageOf: (position) => leverage.get(position) ?? null, frozen: new Set(), perRoot: 0 });
    expect([...kept].sort((left, right) => left - right)).toEqual([7, 10]);
  });
  it("a root whose chains have no leverage keeps none", () => {
    expect([...pathsSelectChains({ chainsByRoot, leverageOf: () => null, frozen: new Set(), perRoot: 0 })]).toEqual([]);
  });
  it("a frozen chain is never the one kept; the chosen ones stay as the adaptive choice made them", () => {
    const kept = pathsSelectChains({ chainsByRoot, leverageOf: (position) => position / 100, frozen: new Set([7]), perRoot: 0 });
    expect([...kept].sort((left, right) => left - right)).toEqual([9, 10]);
    const chosen = pathsSelectChains({ chainsByRoot, leverageOf: (position) => position / 100, frozen: new Set(), perRoot: 1 });
    expect([...chosen].sort((left, right) => left - right)).toEqual([9, 11]);
  });
});

describe("a refused root handed over", () => {
  it("to a seat no path uses first, whose maker is neither the refused one's nor the root's own", () => {
    expect(pathsRootHandOver({ makers: ["A", "B", "C", "D"], rootCount: 3, rootIndex: 1, sitsOut: () => false, refusedMakers: ["B"],
      takes: () => true })).toBe(3);
  });
  it("else to a seat that argues another path, in turn after the root", () => {
    expect(pathsRootHandOver({ makers: ["A", "B", "C"], rootCount: 3, rootIndex: 1, sitsOut: () => false, refusedMakers: ["B"],
      takes: (index) => index !== 2 })).toBe(0);
    expect(pathsRootHandOver({ makers: ["A", "B", "C", "B"], rootCount: 3, rootIndex: 1, sitsOut: () => false, refusedMakers: [],
      takes: () => true })).toBe(2);
  });
  it("never to a seat whose maker already refused this root, even a spare one (Review Focus 3)", () => {
    expect(pathsRootHandOver({ makers: ["A", "B", "C", "D"], rootCount: 3, rootIndex: 1, sitsOut: () => false, refusedMakers: ["B", "D"],
      takes: () => true })).toBe(2);
    expect(pathsRootHandOver({ makers: ["A", "B", "C"], rootCount: 3, rootIndex: 1, sitsOut: () => false, refusedMakers: ["B", "C", "A"],
      takes: () => true })).toBeNull();
  });
  it("to nobody when every other seat sits out", () => {
    expect(pathsRootHandOver({ makers: ["A", "B", "C", "D"], rootCount: 3, rootIndex: 1, sitsOut: (index) => index !== 1,
      refusedMakers: ["B"], takes: () => true })).toBeNull();
  });
});

describe("the root writer's material", () => {
  it("one line per viewpoint, one gap point per line", () => {
    const material = pathRootLegMaterial({ ...path(1), viewpoints: [viewpoint("Costs", "What would it cost?"),
      viewpoint(null, "The old pier is enough.", true)], gapPoints: ["G1.", "G2.", "G3."] });
    expect(material).toEqual({ pathTitle: "T1", pathQuestion: "Q1?", viewpoints: "Costs: What would it cost?\nThe old pier is enough.",
      pointsRaised: "G1.\nG2.\nG3." });
  });

  it("keeps at most the limit's gap points", () => {
    const gapPoints = Array.from({ length: PATH_ROOT_LIMITS.gapPointsPerPathMax + 3 }, (_unused, at) => `G${String(at)}.`);
    expect(pathRootLegMaterial({ ...path(1), gapPoints }).pointsRaised.split("\n")).toEqual(gapPoints.slice(0, PATH_ROOT_LIMITS.gapPointsPerPathMax));
    expect(PATH_ROOT_LIMITS).toEqual({ gapPointsPerPathMax: 8, materialMaxChars: 9_152 });
  });

  it("over the limit, gap points go from the end first", () => {
    const big = { ...path(1), viewpoints: [viewpoint("V1", "x".repeat(4_000)), viewpoint("V2", "y".repeat(4_000))],
      gapPoints: ["a".repeat(400), "b".repeat(400), "c".repeat(400)] };
    const material = pathRootLegMaterial(big);
    expect(material.pointsRaised).toBe(`${"a".repeat(400)}\n${"b".repeat(400)}`);
    expect(material.viewpoints).toBe(`V1: ${"x".repeat(4_000)}\nV2: ${"y".repeat(4_000)}`);
    const size = (entry: typeof material) => entry.pathTitle.length + entry.pathQuestion.length + entry.viewpoints.length + entry.pointsRaised.length;
    expect(size(material)).toBeLessThanOrEqual(PATH_ROOT_LIMITS.materialMaxChars);
  });

  it("then the viewpoint lines are cut at code-point edges with an ellipsis, the longest first", () => {
    const huge = { ...path(1), viewpoints: [viewpoint("V1", "😀".repeat(3_000)), viewpoint("V2", "short"), viewpoint("V3", "z".repeat(7_000))],
      gapPoints: ["g".repeat(400), "h".repeat(400), "i".repeat(400)] };
    const material = pathRootLegMaterial(huge);
    expect(material.pointsRaised).toBe("");
    const lines = material.viewpoints.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("V2: short");
    expect(lines[0]!.endsWith("…")).toBe(true);
    expect(lines[2]!.endsWith("…")).toBe(true);
    expect(lines[2]!.startsWith("V3: zzz")).toBe(true);
    expect(LONE_HIGH.test(material.viewpoints)).toBe(false);
    const size = material.pathTitle.length + material.pathQuestion.length + material.viewpoints.length + material.pointsRaised.length;
    expect(size).toBeLessThanOrEqual(PATH_ROOT_LIMITS.materialMaxChars);
    expect(size).toBeGreaterThan(PATH_ROOT_LIMITS.materialMaxChars - 4);
  });
});

describe("the receipt's view and the fit", () => {
  it("a v2 receipt read as the shape the runner argues: paths as answers, the merge bound for the choose", () => {
    expect(shapeViewOfV2(V2)).toEqual({
      plan: "plus", depthMode: "fixed", scrutiny: "deep", answerLength: "standard", mapAIs: 2, answers: 7, graders: 2, pointsPerAnswer: 2,
      deeperTopPoints: 2, gapRounds: 1, closeCallExtraGraders: 1, scrutinyRoundsPerPoint: 1, scrutinyPointsPerDebate: 2,
      scrutinyLeverageMin: 0.05, scrutinyWeakBelow: 0.5, opening: "ANGLE_MAP", answerWords: 300, writerBound: 4096,
      mapMergeBound: 16384, mapChooseBound: 16384 });
    expect(shapeViewOfV2({ ...V2, pathsSource: "RUN_BUILT", runListWriters: 5 }).mapAIs).toBe(5);
  });

  it("a plan fits its receipt only with its paths, its points, its depth and no cross", () => {
    const paths = Array.from({ length: 7 }, (_unused, at) => path(at + 1));
    const planOf = (pointsPerPath: number, depth: number, list = paths) =>
      buildShapePlan({ positions: shapePositionsFromPaths(list, pointsPerPath), depth, scrutiny: SCRUTINY, cross: false });
    expect(pathPlanFitsReceipt(planOf(2, 2), V2, 2)).toBe(true);
    expect(pathPlanFitsReceipt(planOf(2, 2, paths.slice(0, 3)), { ...V2, paths: 3 }, 2)).toBe(true);
    expect(pathPlanFitsReceipt(planOf(2, 2), { ...V2, depthMode: "adaptive", deeperTopPoints: 1 }, 2)).toBe(true);
    expect(pathPlanFitsReceipt(planOf(2, 2), { ...V2, paths: 6 }, 2)).toBe(false);
    expect(pathPlanFitsReceipt(planOf(3, 2), V2, 2)).toBe(false);
    expect(pathPlanFitsReceipt(planOf(2, 3), V2, 2)).toBe(false);
    expect(pathPlanFitsReceipt(planOf(2, 2), { ...V2, scrutinyRoundsPerPoint: 0, scrutinyPointsPerDebate: 0, scrutiny: "standard" }, 2)).toBe(false);
    const crossed = buildShapePlan({ positions: shapePositionsForTodaysOpening({ answers: 7, pointsPerAnswer: 2 }), depth: 2, scrutiny: SCRUTINY });
    expect(pathPlanFitsReceipt(crossed, V2, 2)).toBe(false);
  });
});
