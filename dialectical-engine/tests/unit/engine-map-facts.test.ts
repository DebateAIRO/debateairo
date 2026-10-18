// tests/unit/engine-map-facts.test.ts
import { describe, expect, it } from "vitest";
import type { MapKeyPoint } from "@debateai/map";
import {
  engineMapFactsOf, engineMaterialAnswersWithMap, engineMaterialPointsWithMap, engineSourceWithMap
} from "../../apps/runner/src/engine-map-facts.js";
import { buildShapePlan, type ShapePositionPlan } from "../../apps/runner/src/shape-plan.js";

const kp = (keyPointId: string, restsOn: "question" | "assumption"): MapKeyPoint => Object.freeze({ keyPointId, claim: `Claim ${keyPointId}.`,
  memberItemIds: ["pt01"], blindMakers: ["m1"], gapMakers: [], makers: ["m1"], fixedAngleKinds: [], leansAgainst: false, restsOn });
const POSITIONS: readonly ShapePositionPlan[] = [
  { answerId: "a1", statement: "Yes, where buses run full.", mapPoints: "{}", points: [], rivalIndex: 1, assumptions: ["The city can pay."], pointsRaised: [] },
  { answerId: "a2", statement: "Only on night lines.", mapPoints: "{}", points: [], rivalIndex: 0, assumptions: [], pointsRaised: [] }];
const NODES = new Map<number, string>([[0, "root-0"], [1, "root-1"], [2, "point-2"], [3, "point-3"], [4, "cross-4"]]);
const facts = engineMapFactsOf({ positions: POSITIONS, keyPoints: [kp("kp01", "assumption"), kp("kp02", "question")],
  legs: [{ kind: "POINT", childIndex: 2, keyPointId: "kp01" }, { kind: "POINT", childIndex: 3, keyPointId: "kp02" },
    { kind: "CROSS", childIndex: 4, keyPointId: null }],
  nodeIdAt: (position) => NODES.get(position) ?? null });

/** P2.6 + P2.2 (spec §5.2 items 2, 6): every reader names an answer by the map's words and sees its assumptions labelled. */
describe("engine 2: the map's facts for every reader", () => {
  it("words and assumptions by root node; rests_on by the point built on a key point; nothing for a leg without one", () => {
    expect([...facts.wordsByRootNodeId]).toEqual([["root-0", "Yes, where buses run full."], ["root-1", "Only on night lines."]]);
    expect(facts.assumptionsByRootNodeId.get("root-0")).toEqual(["The city can pay."]);
    expect([...facts.restsOnByNodeId]).toEqual([["point-2", "assumption"], ["point-3", "question"]]);
  });

  it("ruling R3-T15.1: only the map's own key-point legs carry rests_on; a deeper round's reply and defence carry none", () => {
    // A real 2-round shape: each position argues one key point (round 1), then each chain gets a reply and a defence
    // (round 2) that inherit the chain's key-point id (shape-plan.ts). Node ids are their plan positions.
    const positions: readonly ShapePositionPlan[] = [
      { ...POSITIONS[0]!, points: [{ polarity: "support", consideration: "Claim kp01.", keyPointId: "kp01" }] },
      { ...POSITIONS[1]!, points: [{ polarity: "attack", consideration: "Claim kp02.", keyPointId: "kp02" }] }];
    const plan = buildShapePlan({ positions, depth: 2, scrutiny: { roundsPerPoint: 0, pointsPerDebate: 0 } });
    const deeper = plan.legs.filter((leg) => leg.kind === "REPLY" || leg.kind === "DEFENCE");
    expect(deeper.map((leg) => [leg.kind, leg.keyPointId])).toEqual([["REPLY", "kp01"], ["DEFENCE", "kp01"], ["REPLY", "kp02"], ["DEFENCE", "kp02"]]);
    const twoRounds = engineMapFactsOf({ positions, legs: plan.legs, keyPoints: [kp("kp01", "assumption"), kp("kp02", "question")],
      nodeIdAt: (position) => `node-${String(position)}` });
    const pointNode = (keyPointId: string): string =>
      `node-${String(plan.legs.find((leg) => leg.kind === "POINT" && leg.keyPointId === keyPointId)!.childIndex)}`;
    expect([...twoRounds.restsOnByNodeId]).toEqual([[pointNode("kp01"), "assumption"], [pointNode("kp02"), "question"]]);
    for (const leg of deeper) expect(twoRounds.restsOnByNodeId.has(`node-${String(leg.childIndex)}`)).toBe(false);
  });

  it("R2's material: words stay the map's, the node's text stays the case; assumptions and bases filled; no map, no change", () => {
    // As R2's engineMaterialSourceOf already builds an engine-2 answer from mapWords (R2 plan, A12).
    const answers = [{ letter: "A", rootNodeId: "root-0", words: "Yes, where buses run full.", caseText: "The writer's case for yes.",
      assumptions: [] as readonly string[] }];
    expect(engineMaterialAnswersWithMap(answers, facts)).toEqual([{ letter: "A", rootNodeId: "root-0", words: "Yes, where buses run full.",
      caseText: "The writer's case for yes.", assumptions: ["The city can pay."] }]);
    expect(engineMaterialAnswersWithMap(answers, null)).toBe(answers);
    const points = [{ nodeId: "point-2", restsOn: null }, { nodeId: "cross-4", restsOn: null }];
    expect(engineMaterialPointsWithMap(points, facts)).toEqual([{ nodeId: "point-2", restsOn: "assumption" }, { nodeId: "cross-4", restsOn: null }]);
  });

  it("R2's whole in-memory source gains the assumptions and bases in one wrap; without the map it is the same object (pre-flight PF-R35.9)", () => {
    const source = Object.freeze({ answers: [{ letter: "A", rootNodeId: "root-0", words: "Yes, where buses run full.", caseText: "Case.",
      assumptions: [] as readonly string[] }], points: [{ nodeId: "point-3", restsOn: null }], reviews: "kept as R2 built it" });
    expect(engineSourceWithMap(source, null)).toBe(source);
    const wrapped = engineSourceWithMap(source, facts);
    expect(wrapped.answers[0]!.assumptions).toEqual(["The city can pay."]);
    expect(wrapped.points[0]!.restsOn).toBe("question");
    expect(wrapped.reviews).toBe("kept as R2 built it");
  });
});
