import type { MapKeyPoint, MapRestsOn } from "@debateai/map";
import type { ShapeLeg, ShapePositionPlan } from "./shape-plan.js";

/**
 * ENGINE REDESIGN R3 (spec 2026-10-15 §5.2 items 2, 6; INTERFACE §10.6, §11.1): what the map fixes for every reader of an
 * engine-2 debate in the new shape. An answer is named by the map's chosen WORDS (never the position writer's text, which
 * is the answer's case); its assumptions travel labelled; a point built on a key point says what it rests on. Pure.
 */
export type EngineMapFacts = Readonly<{
  wordsByRootNodeId: ReadonlyMap<string, string>;
  assumptionsByRootNodeId: ReadonlyMap<string, readonly string[]>;
  restsOnByNodeId: ReadonlyMap<string, MapRestsOn>;
}>;

/** From the shape's positions and legs and the saved node of each plan position (null: never saved). */
export function engineMapFactsOf(input: Readonly<{
  positions: readonly ShapePositionPlan[];
  legs: readonly Pick<ShapeLeg, "childIndex" | "keyPointId">[];
  nodeIdAt: (planPosition: number) => string | null;
  keyPoints: readonly MapKeyPoint[];
}>): EngineMapFacts {
  const words = new Map<string, string>();
  const assumptions = new Map<string, readonly string[]>();
  input.positions.forEach((position, rootIndex) => {
    const nodeId = input.nodeIdAt(rootIndex);
    if (nodeId === null || position.statement === null) return;
    words.set(nodeId, position.statement);
    assumptions.set(nodeId, Object.freeze([...(position.assumptions ?? [])]));
  });
  const basisOf = new Map(input.keyPoints.flatMap((keyPoint) => (keyPoint.restsOn === undefined ? [] : [[keyPoint.keyPointId, keyPoint.restsOn] as const])));
  const restsOn = new Map<string, MapRestsOn>();
  for (const leg of input.legs) {
    if (leg.keyPointId === null) continue;
    const basis = basisOf.get(leg.keyPointId);
    const nodeId = input.nodeIdAt(leg.childIndex);
    if (basis !== undefined && nodeId !== null) restsOn.set(nodeId, basis);
  }
  return Object.freeze({ wordsByRootNodeId: words, assumptionsByRootNodeId: assumptions, restsOnByNodeId: restsOn });
}

/**
 * R2's material answers with the map's words and the chooser's assumptions. R2 already takes the words from the map
 * (`mapWords`) and keeps the node's text as the case, so on R2's own source only `assumptions` changes; the words and
 * case lines keep the rule for a source built without `mapWords`.
 */
export function engineMaterialAnswersWithMap<T extends Readonly<{ rootNodeId: string; words: string; caseText: string | null;
  assumptions: readonly string[] }>>(answers: readonly T[], map: EngineMapFacts | null): readonly T[] {
  if (map === null) return answers;
  return Object.freeze(answers.map((answer) => {
    const words = map.wordsByRootNodeId.get(answer.rootNodeId);
    if (words === undefined) return answer;
    return Object.freeze({ ...answer, words, caseText: answer.caseText ?? answer.words,
      assumptions: map.assumptionsByRootNodeId.get(answer.rootNodeId) ?? answer.assumptions });
  }));
}

/** R2's material points with what each rests on (null where the point was built on no key point). */
export function engineMaterialPointsWithMap<T extends Readonly<{ nodeId: string; restsOn: MapRestsOn | null }>>(points: readonly T[],
  map: EngineMapFacts | null): readonly T[] {
  if (map === null) return points;
  return Object.freeze(points.map((point) => {
    const basis = map.restsOnByNodeId.get(point.nodeId);
    return basis === undefined ? point : Object.freeze({ ...point, restsOn: basis });
  }));
}

/**
 * Cross-plan ruling PF-R41.7 (pre-flight PF-R35.9): R2's IN-MEMORY material (`engineMaterialSourceOf(...)`, at the
 * investigations and at the judges) with the map's assumptions and each point's basis. Words and case are R2's own (from
 * `mapWords`). Without the map (engine 1, today's opening, a map fallback) the very same object.
 */
export function engineSourceWithMap<S extends Readonly<{
  answers: readonly Readonly<{ rootNodeId: string; words: string; caseText: string | null; assumptions: readonly string[] }>[];
  points: readonly Readonly<{ nodeId: string; restsOn: MapRestsOn | null }>[];
}>>(source: S, map: EngineMapFacts | null): S {
  return map === null ? source
    : Object.freeze({ ...source, answers: engineMaterialAnswersWithMap(source.answers, map), points: engineMaterialPointsWithMap(source.points, map) });
}
