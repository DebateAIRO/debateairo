// tests/unit/r2-rival-ring.test.ts
import { describe, expect, it } from "vitest";
import {
  buildShapePlan, shapePositionsForTodaysOpening, shapePositionsFromMap, shapeRivalRing
} from "../../apps/runner/src/shape-plan.js";

/** Every preference list for n answers: each entry is null or any index 0..n-1 (its own index included). */
function* preferences(count: number): Generator<(number | null)[]> {
  const values: readonly (number | null)[] = [null, ...Array.from({ length: count }, (_unused, index) => index)];
  for (let code = 0; code < values.length ** count; code += 1) {
    const out: (number | null)[] = [];
    let rest = code;
    for (let index = 0; index < count; index += 1) {
      out.push(values[rest % values.length]!);
      rest = Math.floor(rest / values.length);
    }
    yield out;
  }
}
const KEY_POINTS = ["k1", "k2"].map((id) => ({ keyPointId: id, claim: `Claim ${id}.`, memberItemIds: [], blindMakers: [],
  gapMakers: [], makers: [], fixedAngleKinds: [], leansAgainst: false }));
/** A map choice whose answer i names answer `named[i]` as its strongest rival ("gone" for null). */
const choiceOf = (named: readonly (number | null)[]) => ({ alsoRaised: [], answers: named.map((rival, index) => ({
  answerId: `a${String(index + 1)}`, statement: `Answer ${String(index + 1)}.`, forKeyPointIds: ["k1"], againstKeyPointIds: ["k2"],
  strongestRival: rival === null ? "gone" : `a${String(rival + 1)}`, filled: false })) });
/** Today's rule (shape-plan.ts:56, :64 at 1bc8f549b): the chooser's rival, else the next position. */
const todaysRivals = (named: readonly (number | null)[]): number[] =>
  named.map((rival, index) => (rival === null || rival === index ? (index + 1) % named.length : rival));
const isRing = (targets: readonly number[]): boolean =>
  [...targets].sort((left, right) => left - right).every((target, index) => target === index)
  && targets.every((target, index) => target !== index);

describe("engine 2: the rival-reply ring (spec §4.2a rule 1, INTERFACE §7.1)", () => {
  it.each([
    [[null, null, null], [1, 2, 0]],          // no names: today's next-position ring
    [[1, null, 0], [1, 2, 0]],                // shape-plan.test.ts's CHOICE: already a ring, kept
    [[1, 0, 0], [1, 2, 0]],                   // a1 named twice: a3 keeps its name, a2's reply moves
    [[1, 0, null], [2, 0, 1]],                // the last answer named none and only itself is left: swaps with answer 0
    [[2, 2, null], [2, 0, 1]],
    [[1, 0, 1, 0], [1, 0, 3, 2]],
    [[null, null], [1, 0]],
    [[1, 1], [1, 0]]                          // a self-name reads as none
  ] as const)("builds %j into %j", (named, ring) => {
    expect(shapeRivalRing(named)).toEqual(ring);
  });

  it("gives every answer exactly one reply and one rival, for every preference list of 2 to 4 answers", () => {
    for (const count of [2, 3, 4]) {
      for (const named of preferences(count)) {
        const ring = shapeRivalRing(named);
        expect(isRing(ring), JSON.stringify(named)).toBe(true);
        expect(Object.isFrozen(ring)).toBe(true);
      }
    }
  });

  it("keeps the chooser's names whenever they already form a ring", () => {
    for (const count of [2, 3, 4]) {
      for (const named of preferences(count)) {
        if (named.every((rival) => rival !== null) && isRing(named as number[])) expect(shapeRivalRing(named)).toEqual(named);
      }
    }
  });

  it("refuses fewer than two answers", () => {
    expect(() => shapeRivalRing([])).toThrow("SHAPE_RIVAL_RING_INVALID");
    expect(() => shapeRivalRing([null])).toThrow("SHAPE_RIVAL_RING_INVALID");
  });

  it("from the map: ring on sets every rival from the ring; the cross-reply count stays one per position", () => {
    const positions = shapePositionsFromMap({ choice: choiceOf([1, 0, 0]), keyPoints: KEY_POINTS, answers: 3, pointsPerAnswer: 2, ring: true });
    expect(positions.map((position) => position.rivalIndex)).toEqual([1, 2, 0]);
    const plan = buildShapePlan({ positions, depth: 2, scrutiny: { roundsPerPoint: 1, pointsPerDebate: 1 } });
    const crosses = plan.legs.filter((leg) => leg.kind === "CROSS");
    expect(crosses).toHaveLength(3);
    expect(new Set(crosses.map((leg) => leg.targetRootIndex)).size).toBe(3);
  });

  it("engine 1 pin: ring off (or absent) is today's rule for every preference list, from the map and the opening", () => {
    for (const count of [2, 3, 4]) {
      for (const named of preferences(count)) {
        const input = { choice: choiceOf(named), keyPoints: KEY_POINTS, answers: count, pointsPerAnswer: 2 };
        expect(shapePositionsFromMap(input).map((position) => position.rivalIndex)).toEqual(todaysRivals(named));
        expect(shapePositionsFromMap({ ...input, ring: false })).toEqual(shapePositionsFromMap(input));
      }
      const opening = shapePositionsForTodaysOpening({ answers: count, pointsPerAnswer: 2 });
      expect(opening.map((position) => position.rivalIndex)).toEqual(Array.from({ length: count }, (_unused, index) => (index + 1) % count));
      // Today's opening already is a ring: ring on changes nothing there.
      expect(shapePositionsForTodaysOpening({ answers: count, pointsPerAnswer: 2, ring: true })).toEqual(opening);
    }
  });

  it("a map that hands back one answer keeps today's rule even with the ring on (it argues today's opening instead)", () => {
    const one = shapePositionsFromMap({ choice: choiceOf([null]), keyPoints: KEY_POINTS, answers: 1, pointsPerAnswer: 2, ring: true });
    expect(one.map((position) => position.rivalIndex)).toEqual([0]);
  });
});
