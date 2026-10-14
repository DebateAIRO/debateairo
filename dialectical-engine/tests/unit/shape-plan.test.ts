import { describe, expect, it } from "vitest";
import { debateShapeSettingsOf, EXPANSION_DEPTH_MAX, EXPANSION_DEPTH_MIN } from "@debateai/contract";
import {
  DEBATE_SHAPE_PLAN_KEYS, debateShapePolicyStartValues, debateShapeSiteCounts, normaliseDepthParamsForShape, resolveDebateShape,
  type DebateShapeCeilingInput
} from "@debateai/register";
import { deriveGlobalRoundCompletions, selectPreventableBranches } from "../../apps/runner/src/index.js";
import {
  buildScrutinyLegs, buildShapePlan, shapePositionCount, shapePositionsForTodaysOpening, shapePositionsFromMap, shapeRoundOnePoints,
  shapeRunnableLegs, shapeRunnableNodeCount, type ShapeLeg, type ShapePlan
} from "../../apps/runner/src/shape-plan.js";
import { shapeDistinctMakers, shapeHandOverRoot, shapeSeatOrder, shapeWriterSeat } from "../../apps/runner/src/shape-seats.js";

const KEY_0069 = /^JUDGE(:root:(secondary|[0-9]{1,4})|:(defender|critic):root[0-9]{1,4}:r[0-9]{1,4}:p[0-9]{1,4}|:cross-root:[0-9]{1,4}->[0-9]{1,4})?$/u;
const kp = (id: string) => ({ keyPointId: id, claim: `Claim ${id}.`, memberItemIds: [], blindMakers: [], gapMakers: [], makers: [], fixedAngleKinds: [], leansAgainst: false });
const CHOICE = { alsoRaised: [], answers: [
  { answerId: "a1", statement: "Yes.", forKeyPointIds: ["k1", "k2"], againstKeyPointIds: ["k3", "k4"], strongestRival: "a2", filled: false },
  // Pre-flight PF-B30: `MapChosenAnswer.strongestRival` is a string, never null; an id not among the answers takes the
  // same "next position" fallback (rivalIndex 2 below).
  { answerId: "a2", statement: "No.", forKeyPointIds: ["k3"], againstKeyPointIds: ["k1"], strongestRival: "gone", filled: false },
  { answerId: "a3", statement: "Only at night.", forKeyPointIds: [], againstKeyPointIds: ["k2"], strongestRival: "a1", filled: true }] };
const KEY_POINTS = ["k1", "k2", "k3", "k4"].map(kp);
type Sites = Readonly<{ positionNodes: number; pointNodes: number; crossNodes: number; deeperNodes: number; scrutinyNodes: number }>;
const SITES = ["positionNodes", "pointNodes", "crossNodes", "deeperNodes", "scrutinyNodes"] as const;
/** The plan's runnable nodes, site by site, counted from its legs (review fix 1: never only the total). */
const sitesOf = (plan: ShapePlan, runnable: readonly ShapeLeg[]): Sites => {
  const kinds = (...wanted: readonly ShapeLeg["kind"][]) => runnable.filter((leg) => wanted.includes(leg.kind)).length;
  return { positionNodes: plan.rootCount, pointNodes: kinds("POINT"), crossNodes: kinds("CROSS"), deeperNodes: kinds("REPLY", "DEFENCE"),
    scrutinyNodes: plan.scrutiny.count };
};
/** Every site within its priced allowance (equal when `exact`); the sites add up to the whole runnable count. */
const expectWithinSites = (plan: ShapePlan, runnable: readonly ShapeLeg[], priced: Sites & Readonly<{ nodes: number }>, exact: boolean, at: string): void => {
  const sites = sitesOf(plan, runnable);
  for (const site of SITES) {
    if (exact) expect(sites[site], `${at} ${site}`).toBe(priced[site]);
    else expect(sites[site], `${at} ${site}`).toBeLessThanOrEqual(priced[site]);
  }
  expect(SITES.reduce((sum, site) => sum + sites[site], 0), `${at} every leg in a site`).toBe(plan.rootCount + runnable.length + plan.scrutiny.count);
};
/** No two legs under one parent share a sibling ordinal (plan and scrutiny legs together). */
const expectOrdinalsUnique = (legs: readonly ShapeLeg[], at: string): void => {
  const slots = legs.map((leg) => `${String(leg.parentIndex)}/${String(leg.siblingOrdinal)}`);
  expect(new Set(slots).size, `${at} sibling ordinals`).toBe(slots.length);
};

describe("round-1 points (spec §3.3 step 3)", () => {
  it("takes against first, then for, at least one of each when both exist", () => {
    expect(shapeRoundOnePoints(["f1", "f2"], ["a1", "a2", "a3"], 3)).toEqual([
      { polarity: "attack", keyPointId: "a1" }, { polarity: "attack", keyPointId: "a2" }, { polarity: "support", keyPointId: "f1" }]);
    expect(shapeRoundOnePoints(["f1"], ["a1"], 1)).toEqual([{ polarity: "attack", keyPointId: "a1" }]);
    expect(shapeRoundOnePoints(["f1", "f2"], [], 4)).toEqual([{ polarity: "support", keyPointId: "f1" }, { polarity: "support", keyPointId: "f2" }]);
  });
});

describe("positions", () => {
  it("from the map: P answers, considerations as claims, the rival by id or the next position", () => {
    const positions = shapePositionsFromMap({ choice: CHOICE, keyPoints: KEY_POINTS, answers: 3, pointsPerAnswer: 3 });
    expect(positions.map((position) => [position.answerId, position.rivalIndex])).toEqual([["a1", 1], ["a2", 2], ["a3", 0]]);
    expect(positions[0]!.points.map((point) => point.consideration)).toEqual(["Claim k3.", "Claim k4.", "Claim k1."]);
    expect(JSON.parse(positions[0]!.mapPoints!)).toEqual({ for: ["Claim k1.", "Claim k2."], against: ["Claim k3.", "Claim k4."] });
    expect(shapePositionsFromMap({ choice: CHOICE, keyPoints: KEY_POINTS, answers: 2, pointsPerAnswer: 3 })).toHaveLength(2);
  });

  it("today's opening fallback: at most P positions, at most K points each, no consideration", () => {
    const positions = shapePositionsForTodaysOpening({ answers: 3, pointsPerAnswer: 2 });
    expect(positions).toHaveLength(3);
    expect(positions[0]!.points).toEqual([{ polarity: "attack", consideration: null, keyPointId: null }, { polarity: "support", consideration: null, keyPointId: null }]);
    expect(positions.map((position) => position.rivalIndex)).toEqual([1, 2, 0]);
  });
});

describe("the breadth-first plan (spec §3.3 steps 3–5, INTERFACE §3 round order)", () => {
  const positions = shapePositionsFromMap({ choice: CHOICE, keyPoints: KEY_POINTS, answers: 3, pointsPerAnswer: 3 });
  const plan = buildShapePlan({ positions, depth: 3, scrutiny: { roundsPerPoint: 2, pointsPerDebate: 6 } });

  it("round 1 holds every point then every cross-reply; parents always precede children", () => {
    const roundOne = plan.legs.filter((leg) => leg.round === 1);
    expect(roundOne.map((leg) => leg.kind)).toEqual([...positions.flatMap((position) => position.points.map(() => "POINT")), "CROSS", "CROSS", "CROSS"]);
    for (const leg of plan.legs) expect(leg.parentIndex).toBeLessThan(leg.childIndex);
    expect(plan.legs.map((leg) => leg.childIndex)).toEqual(plan.legs.map((_leg, index) => plan.rootCount + index));
  });

  it("one boundary per round, after the last leg of that round across all positions", () => {
    const completions = deriveGlobalRoundCompletions(plan.legs);
    expect([...completions.values()]).toEqual([1, 2, 3]);
    for (const [legIndex, round] of completions) {
      expect(plan.legs.slice(0, legIndex + 1).every((leg) => leg.round <= round)).toBe(true);
      expect(plan.legs.slice(legIndex + 1).every((leg) => leg.round > round)).toBe(true);
    }
    const boundaryOne = [...completions.keys()][0]!;
    const points = plan.legs.filter((leg) => leg.kind === "POINT").map((leg) => leg.childIndex);
    expect(selectPreventableBranches({ plan: plan.legs, boundaryLegIndex: boundaryOne, carryingChildIndices: points })).toEqual(points);
  });

  it("a deeper round is one reply and one defence per chain, a linear chain", () => {
    for (const leg of plan.legs.filter((entry) => entry.kind === "REPLY")) {
      const defence = plan.legs.find((entry) => entry.parentIndex === leg.childIndex)!;
      expect(defence).toMatchObject({ kind: "DEFENCE", round: leg.round, chain: leg.chain, polarity: "attack", siblingOrdinal: 1 });
      expect(plan.legs.filter((entry) => entry.parentIndex === leg.parentIndex && entry.round === leg.round)).toHaveLength(1);
    }
  });

  it("every key is unique, no sibling ordinal repeats under one parent, every key passes 0069's code-shape rule", () => {
    expect(new Set(plan.legs.map((leg) => leg.callSiteKey)).size).toBe(plan.legs.length);
    const slots = plan.legs.map((leg) => `${String(leg.parentIndex)}/${String(leg.siblingOrdinal)}`);
    expect(new Set(slots).size).toBe(slots.length);
    for (const leg of plan.legs) expect(leg.callSiteKey).toMatch(KEY_0069);
  });

  it("reserves 2·R·Q scrutiny slots after the plan and builds their legs on demand", () => {
    expect(plan.scrutiny).toEqual({ start: plan.rootCount + plan.legs.length, nodesPerDebate: 6, roundsPerNode: 2, count: 24 });
    expect(plan.totalPlannedNodes).toBe(plan.scrutiny.start + 24);
    const legs = buildScrutinyLegs({ plan, depth: 3, selected: [{ position: 0, rootIndex: 0 }, { position: plan.rootCount, rootIndex: 0 }] });
    expect(legs.map((leg) => [leg.kind, leg.round, leg.childIndex - plan.scrutiny.start])).toEqual([
      ["REPLY", 4, 0], ["DEFENCE", 4, 1], ["REPLY", 4, 2], ["DEFENCE", 4, 3],
      ["REPLY", 5, 12], ["DEFENCE", 5, 13], ["REPLY", 5, 14], ["DEFENCE", 5, 15]]);
    expect(legs[0]!.siblingOrdinal).toBe(plan.legs.filter((leg) => leg.parentIndex === 0).length + 1);
    for (const leg of legs) expect(leg.callSiteKey).toMatch(KEY_0069);
  });

  it("never runs more nodes than P2a priced (enumerator against debateShapeSiteCounts): equal when every answer has K points", () => {
    const fullPoints = shapePositionsForTodaysOpening({ answers: 3, pointsPerAnswer: 3 });
    for (const depthMode of ["fixed", "adaptive"] as const) {
      for (const depth of [1, 2, 3]) {
        const shape = { answers: 3, pointsPerAnswer: 3, deeperTopPoints: 2, depthMode, scrutinyRoundsPerPoint: 2, scrutinyPointsPerDebate: 6,
          mapAIs: 4, gapRounds: 2, graders: 3, closeCallExtraGraders: 1 } as unknown as DebateShapeCeilingInput;
        const counts = debateShapeSiteCounts(shape, depth);
        const priced = counts.nodes;
        const full = buildShapePlan({ positions: fullPoints, depth, scrutiny: { roundsPerPoint: 2, pointsPerDebate: 6 } });
        expect(shapeRunnableNodeCount(full, depth, depthMode, 2), `${depthMode} d${String(depth)}`).toBe(priced);
        expectWithinSites(full, shapeRunnableLegs(full, depth, depthMode, 2), counts, true, `${depthMode} d${String(depth)}`);
        // Pre-flight PF-B29: the plan's own legs, counted raw, never a formula. In fixed mode every leg runs, so the plan
        // holds exactly what P2a priced; and no leg is deeper than the depth the ceiling was minted for.
        if (depthMode === "fixed") expect(full.rootCount + full.legs.length + full.scrutiny.count, `fixed d${String(depth)} raw`).toBe(priced);
        for (const leg of full.legs) expect(leg.round).toBeLessThanOrEqual(depth);
        const fewer = buildShapePlan({ positions, depth, scrutiny: { roundsPerPoint: 2, pointsPerDebate: 6 } });
        expect(shapeRunnableNodeCount(fewer, depth, depthMode, 2)).toBeLessThanOrEqual(priced);
        expectWithinSites(fewer, shapeRunnableLegs(fewer, depth, depthMode, 2), counts, false, `fewer ${depthMode} d${String(depth)}`);
      }
    }
  });
});

describe("seats", () => {
  const seat = (maker: string) => ({ main: { maker } });
  it("counts the distinct makers among the seats that do not sit out", () => {
    expect(shapeDistinctMakers([seat("glm"), seat("glm"), seat("ds")], () => false)).toBe(2);
    expect(shapeDistinctMakers([seat("glm"), seat("ds"), seat("qw")], (entry) => entry.main.maker === "ds")).toBe(2);
    expect(shapeDistinctMakers([seat("glm"), seat("ds")], () => true)).toBe(0);
  });
  it("puts distinct makers first, keeping the opener first", () => {
    expect(shapeSeatOrder([seat("glm"), seat("glm"), seat("ds"), seat("qw")]).map((entry) => entry.main.maker)).toEqual(["glm", "ds", "qw", "glm"]);
  });
  it("hands a sitting-out position to a maker without one, else shares", () => {
    expect(shapeHandOverRoot({ makers: ["a", "b", "c", "d"], rootCount: 2, rootIndex: 1, sitsOut: (index) => index === 1 })).toEqual({ kind: "SWAP", withIndex: 2 });
    expect(shapeHandOverRoot({ makers: ["a", "b", "c"], rootCount: 3, rootIndex: 1, sitsOut: (index) => index === 1 })).toEqual({ kind: "SHARE", withIndex: 2 });
    expect(shapeHandOverRoot({ makers: ["a", "b"], rootCount: 2, rootIndex: 1, sitsOut: () => true })).toEqual({ kind: "NONE" });
  });
  it("writes with a different maker, rotating, preferring one when asked", () => {
    const makers = ["a", "b", "c", "d"];
    expect(shapeWriterSeat({ seatMakers: makers, avoidMakers: ["a"], preferMaker: null, offset: 0, sitsOut: () => false })).toBe(1);
    expect(shapeWriterSeat({ seatMakers: makers, avoidMakers: ["a"], preferMaker: null, offset: 3, sitsOut: () => false })).toBe(3);
    expect(shapeWriterSeat({ seatMakers: makers, avoidMakers: ["b"], preferMaker: "c", offset: 0, sitsOut: () => false })).toBe(2);
    expect(shapeWriterSeat({ seatMakers: makers, avoidMakers: ["a", "b", "c", "d"], preferMaker: null, offset: 0, sitsOut: () => false })).toBeNull();
  });
});

describe("fewer than two positions (pre-flight PF-B31)", () => {
  it("shapePositionCount: max(2, min(P, makers left)), refusing a P below two or a broken count", () => {
    expect([0, 1, 2, 3, 4, 9].map((makersLeft) => shapePositionCount(3, makersLeft))).toEqual([2, 2, 2, 3, 3, 3]);
    expect(shapePositionCount(2, 1)).toBe(2);
    // Ruling T-P5, defence in depth: never more positions than the map can store (MAP_LIMITS.chooseAnswersMax), whatever
    // a receipt says.
    expect([4, 5, 9].map((answers) => shapePositionCount(answers, 9))).toEqual([4, 4, 4]);
    for (const [answers, makersLeft] of [[1, 3], [2.5, 3], [3, -1], [3, Number.NaN]] as const) {
      expect(() => shapePositionCount(answers, makersLeft), `${String(answers)}/${String(makersLeft)}`).toThrow("SHAPE_POSITION_COUNT_INVALID");
    }
  });

  it("the plan refuses one position; the callers' floor of two always builds", () => {
    const one = shapePositionsForTodaysOpening({ answers: 1, pointsPerAnswer: 3 });
    expect(() => buildShapePlan({ positions: one, depth: 2, scrutiny: { roundsPerPoint: 0, pointsPerDebate: 0 } })).toThrow("SHAPE_PLAN_INPUT_INVALID");
    // Tasks 12/13 size positions with shapePositionCount — a sit-out leaving one maker (or none) still plans two.
    for (const makersLeft of [0, 1, 2]) {
      const plan = buildShapePlan({ positions: shapePositionsForTodaysOpening({ answers: shapePositionCount(3, makersLeft), pointsPerAnswer: 3 }),
        depth: 2, scrutiny: { roundsPerPoint: 0, pointsPerDebate: 0 } });
      expect(plan.rootCount).toBe(2);
    }
  });
});

describe("the strongest rival (review fix 5)", () => {
  it("the plan refuses a rival that is out of range, not whole, or the position itself", () => {
    const positions = shapePositionsForTodaysOpening({ answers: 3, pointsPerAnswer: 1 });
    for (const rivalIndex of [-1, 3, 1.5, 0, Number.NaN]) {
      const broken = positions.map((position, index) => (index === 0 ? { ...position, rivalIndex } : position));
      expect(() => buildShapePlan({ positions: broken, depth: 1, scrutiny: { roundsPerPoint: 0, pointsPerDebate: 0 } }), String(rivalIndex))
        .toThrow("SHAPE_PLAN_RIVAL_INVALID");
    }
    expect(buildShapePlan({ positions, depth: 1, scrutiny: { roundsPerPoint: 0, pointsPerDebate: 0 } }).rootCount).toBe(3);
  });
});

describe("dropped chains (review fix 2)", () => {
  it("counts every leg except the deeper legs of the chains adaptive drops, a chainless deeper leg included", () => {
    const plan = buildShapePlan({ positions: shapePositionsForTodaysOpening({ answers: 2, pointsPerAnswer: 3 }), depth: 2,
      scrutiny: { roundsPerPoint: 0, pointsPerDebate: 0 } });
    // 2 roots, 6 points, 2 crosses, 12 deeper legs; adaptive X=1 keeps one chain per root (4 deeper legs).
    expect(shapeRunnableNodeCount(plan, 2, "adaptive", 1)).toBe(2 + 6 + 2 + 4);
    const last = plan.legs[plan.legs.length - 1]!;
    const chainless = { ...plan, legs: [...plan.legs, { ...last, kind: "REPLY" as const, chain: null, childIndex: last.childIndex + 1 }] };
    expect(shapeRunnableNodeCount(chainless, 2, "adaptive", 1)).toBe(2 + 6 + 2 + 4 + 1);
  });
});

/**
 * The never-under-count law, walked over every admitted shape the start values can mint (pre-flight PF-B29: the plan's
 * own legs are counted, never a formula): every plan key × 2..9 makers × every depth × fixed/adaptive × every scrutiny
 * (each normalised for the plan as admission does) × both openings (the map's positions with too few, exactly K and too
 * many key points; today's-opening fallback) × every position count a sit-out can leave (2..P).
 */
describe("the enumerator: no plan the runner can build runs more nodes than P2a priced", () => {
  const policy = debateShapePolicyStartValues();
  const choiceFor = (answers: number, k: number) => {
    // Answer i gets a different spread of key points: none, one of each, exactly K, more than K, against only.
    const spreads = [[0, 0], [1, 1], [Math.ceil(k / 2), Math.floor(k / 2)], [k + 2, k + 2], [0, k + 1]] as const;
    let next = 0;
    const ids = (count: number) => Array.from({ length: count }, () => { next += 1; return `k${String(next)}`; });
    const chosen = Array.from({ length: answers }, (_unused, index) => {
      const [forCount, againstCount] = spreads[index % spreads.length]!;
      return { answerId: `a${String(index + 1)}`, statement: `Answer ${String(index + 1)}.`, forKeyPointIds: ids(forCount),
        againstKeyPointIds: ids(againstCount), strongestRival: `a${String(((index + 1) % answers) + 1)}`, filled: false };
    });
    return { choice: { alsoRaised: [], answers: chosen }, keyPoints: Array.from({ length: next }, (_unused, index) => kp(`k${String(index + 1)}`)) };
  };
  const fullChoiceFor = (answers: number, k: number) => {
    const chosen = Array.from({ length: answers }, (_unused, index) => ({ answerId: `a${String(index + 1)}`, statement: "S.",
      forKeyPointIds: Array.from({ length: k }, (_u, at) => `f${String(index)}_${String(at)}`),
      againstKeyPointIds: Array.from({ length: k }, (_u, at) => `x${String(index)}_${String(at)}`),
      strongestRival: `a${String(((index + 1) % answers) + 1)}`, filled: false }));
    const keyPoints = chosen.flatMap((answer) => [...answer.forKeyPointIds, ...answer.againstKeyPointIds]).map(kp);
    return { choice: { alsoRaised: [], answers: chosen }, keyPoints };
  };

  it("walks every plan × makers × depth × depth mode × scrutiny × opening × sit-out count", () => {
    let walked = 0;
    let equalWalked = 0;
    for (const planKey of DEBATE_SHAPE_PLAN_KEYS) {
      for (let makers = 2; makers <= 9; makers += 1) {
        for (let asked = EXPANSION_DEPTH_MIN; asked <= EXPANSION_DEPTH_MAX; asked += 1) {
          for (const depthMode of ["fixed", "adaptive"] as const) {
            for (const scrutiny of ["standard", "deep", "exhaustive"] as const) {
              const params = normaliseDepthParamsForShape({ depth: asked, depthMode, scrutiny, answerLength: "standard" }, policy, planKey);
              const shape = resolveDebateShape({ policy, plan: planKey, makers, settings: debateShapeSettingsOf(params) })!;
              const depth = params.depth;
              const counts = debateShapeSiteCounts(shape, depth);
              const priced = counts.nodes;
              const P = shape.answers;
              const K = shape.pointsPerAnswer;
              const budget = { roundsPerPoint: shape.scrutinyRoundsPerPoint, pointsPerDebate: shape.scrutinyPointsPerDebate };
              const label = `${planKey} m${String(makers)} d${String(depth)} ${shape.depthMode} ${shape.scrutiny}`;
              const full = fullChoiceFor(P, K);
              const spread = choiceFor(P, K);
              for (let positionsLeft = 2; positionsLeft <= P; positionsLeft += 1) {
                const openings = {
                  mapFull: shapePositionsFromMap({ ...full, answers: positionsLeft, pointsPerAnswer: K }),
                  mapSpread: shapePositionsFromMap({ ...spread, answers: positionsLeft, pointsPerAnswer: K }),
                  todaysOpening: shapePositionsForTodaysOpening({ answers: positionsLeft, pointsPerAnswer: K })
                };
                for (const [opening, positions] of Object.entries(openings)) {
                  const at = `${label} p${String(positionsLeft)} ${opening}`;
                  walked += 1;
                  const plan = buildShapePlan({ positions, depth, scrutiny: budget });
                  for (const leg of plan.legs) expect(leg.round, at).toBeLessThanOrEqual(depth);
                  expect(plan.legs.every((leg, index) => leg.childIndex === plan.rootCount + index && leg.parentIndex < leg.childIndex), at).toBe(true);
                  const keys = plan.legs.map((leg) => leg.callSiteKey);
                  expect(new Set(keys).size, at).toBe(keys.length);
                  expect(keys.every((key) => KEY_0069.test(key)), at).toBe(true);
                  const runnable = shapeRunnableNodeCount(plan, depth, shape.depthMode, shape.deeperTopPoints);
                  expect(runnable, at).toBeLessThanOrEqual(priced);
                  const runnableLegs = shapeRunnableLegs(plan, depth, shape.depthMode, shape.deeperTopPoints);
                  expect(plan.rootCount + runnableLegs.length + plan.scrutiny.count, at).toBe(runnable);
                  const exact = positionsLeft === P && opening !== "mapSpread" && (shape.depthMode === "fixed" || shape.deeperTopPoints <= K);
                  expectWithinSites(plan, runnableLegs, counts, exact, at);
                  // Every reserved scrutiny slot is a node the ceiling priced; more selected nodes than Q never add a leg.
                  const selected = [...Array.from({ length: plan.rootCount }, (_unused, index) => ({ position: index, rootIndex: index })),
                    ...plan.legs.map((leg) => ({ position: leg.childIndex, rootIndex: leg.rootIndex }))].slice(0, budget.pointsPerDebate + 2);
                  const scrutinyLegs = buildScrutinyLegs({ plan, depth, selected });
                  expect(scrutinyLegs.length, at).toBeLessThanOrEqual(plan.scrutiny.count);
                  expect(new Set(scrutinyLegs.map((leg) => leg.childIndex)).size, at).toBe(scrutinyLegs.length);
                  for (const leg of scrutinyLegs) {
                    expect(leg.childIndex >= plan.scrutiny.start && leg.childIndex < plan.totalPlannedNodes, at).toBe(true);
                    expect(leg.callSiteKey, at).toMatch(KEY_0069);
                  }
                  expect(new Set([...keys, ...scrutinyLegs.map((leg) => leg.callSiteKey)]).size, at).toBe(keys.length + scrutinyLegs.length);
                  expectOrdinalsUnique([...plan.legs, ...scrutinyLegs], at);
                  if (positionsLeft === P && opening !== "mapSpread") {
                    // Every answer has K points: the plan holds exactly what was priced (fixed: raw legs; adaptive: X ≤ K).
                    equalWalked += 1;
                    if (shape.depthMode === "fixed") expect(plan.rootCount + plan.legs.length + plan.scrutiny.count, at).toBe(priced);
                    if (shape.depthMode === "fixed" || shape.deeperTopPoints <= K) expect(runnable, at).toBe(priced);
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(walked).toBeGreaterThan(1000);
    expect(equalWalked).toBe(DEBATE_SHAPE_PLAN_KEYS.length * 8 * (EXPANSION_DEPTH_MAX - EXPANSION_DEPTH_MIN + 1) * 2 * 3 * 2);
  });
});
