// tests/unit/engine-map-facts.test.ts
import { describe, expect, it } from "vitest";
import type { MapKeyPoint } from "@debateai/map";
import {
  engineMapFactsOf, engineMaterialAnswersWithMap, engineMaterialPointsWithMap, engineSourceWithMap
} from "../../apps/runner/src/engine-map-facts.js";
import type { ShapePositionPlan } from "../../apps/runner/src/shape-plan.js";

const kp = (keyPointId: string, restsOn: "question" | "assumption"): MapKeyPoint => Object.freeze({ keyPointId, claim: `Claim ${keyPointId}.`,
  memberItemIds: ["pt01"], blindMakers: ["m1"], gapMakers: [], makers: ["m1"], fixedAngleKinds: [], leansAgainst: false, restsOn });
const POSITIONS: readonly ShapePositionPlan[] = [
  { answerId: "a1", statement: "Yes, where buses run full.", mapPoints: "{}", points: [], rivalIndex: 1, assumptions: ["The city can pay."], pointsRaised: [] },
  { answerId: "a2", statement: "Only on night lines.", mapPoints: "{}", points: [], rivalIndex: 0, assumptions: [], pointsRaised: [] }];
const NODES = new Map<number, string>([[0, "root-0"], [1, "root-1"], [2, "point-2"], [3, "point-3"], [4, "cross-4"]]);
const facts = engineMapFactsOf({ positions: POSITIONS, keyPoints: [kp("kp01", "assumption"), kp("kp02", "question")],
  legs: [{ childIndex: 2, keyPointId: "kp01" }, { childIndex: 3, keyPointId: "kp02" }, { childIndex: 4, keyPointId: null }],
  nodeIdAt: (position) => NODES.get(position) ?? null });

/** P2.6 + P2.2 (spec §5.2 items 2, 6): every reader names an answer by the map's words and sees its assumptions labelled. */
describe("engine 2: the map's facts for every reader", () => {
  it("words and assumptions by root node; rests_on by the point built on a key point; nothing for a leg without one", () => {
    expect([...facts.wordsByRootNodeId]).toEqual([["root-0", "Yes, where buses run full."], ["root-1", "Only on night lines."]]);
    expect(facts.assumptionsByRootNodeId.get("root-0")).toEqual(["The city can pay."]);
    expect([...facts.restsOnByNodeId]).toEqual([["point-2", "assumption"], ["point-3", "question"]]);
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
