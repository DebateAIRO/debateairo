import { describe, expect, it } from "vitest";
import {
  MAP_FALLBACK_ANGLES,
  mapDistinctMakers,
  mapDroppedAngles,
  mapListAssignments,
  mapOrderAngles,
  mapPickChooser,
  mapPickGapSeat,
  mapPickMerger,
  mapPickPlanner,
  mapReassignLists,
  mapRotateSeats,
  type MapAngle,
  type MapSeat
} from "@debateai/map";

const S = [0, 1, 2, 3, 4].map((index): MapSeat => ({ aiRef: `ai-${String(index)}`, maker: `m${String(index)}` }));
const S1b: MapSeat = { aiRef: "ai-1b", maker: "m1" };
const S0b: MapSeat = { aiRef: "ai-0b", maker: "m0" };
const NONE = new Set<string>();
const refs = (seats: readonly (MapSeat | null)[]) => seats.map((seat) => seat?.aiRef ?? null);
const angle = (angleId: string): MapAngle => ({ angleId, kind: "SPECIFIC", label: angleId, focus: angleId });

describe("map roles: rotation", () => {
  it("rotates by question, wrapping, and leaves an empty list empty", () => {
    expect(refs(mapRotateSeats(S, 2))).toEqual(["ai-2", "ai-3", "ai-4", "ai-0", "ai-1"]);
    expect(refs(mapRotateSeats(S, 7))).toEqual(refs(mapRotateSeats(S, 2)));
    expect(mapRotateSeats([], 3)).toEqual([]);
    expect(mapDistinctMakers([S[0]!, S[1]!, S1b])).toBe(2);
  });
});

describe("map roles: who does what", () => {
  it("planner is the first seat that is not sitting out", () => {
    expect(mapPickPlanner(S, NONE)?.aiRef).toBe("ai-0");
    expect(mapPickPlanner(S, new Set(["ai-0"]))?.aiRef).toBe("ai-1");
  });

  it("merger is the next seat after the planner", () => {
    expect(mapPickMerger(S, NONE)?.aiRef).toBe("ai-1");
    expect(mapPickMerger(S, new Set(["ai-1"]))?.aiRef).toBe("ai-2");
    expect(mapPickMerger([S[0]!], NONE)?.aiRef).toBe("ai-0");
  });

  it("chooser comes after the merger and is never of the merger's maker", () => {
    const order = [S[0]!, S[1]!, S1b, S[2]!];
    expect(mapPickChooser(order, NONE, S[1]!)?.aiRef).toBe("ai-2");
    expect(mapPickChooser(order, NONE, null)?.aiRef).toBe("ai-1b");
    expect(mapPickChooser([S[0]!, S1b], NONE, S1b)?.aiRef).toBe("ai-0");
    expect(mapPickChooser([S[1]!, S1b], NONE, S[1]!)).toBeNull();
  });

  it("gap AI: not the merger's maker; a seat with no list first; round by round", () => {
    const writers = new Set(["ai-0", "ai-1", "ai-2", "ai-3"]);
    expect(mapPickGapSeat(S, NONE, S[1]!, writers, 1)?.aiRef).toBe("ai-4");
    expect(mapPickGapSeat(S, NONE, S[1]!, writers, 2)?.aiRef).toBe("ai-2");
    expect(mapPickGapSeat(S, new Set(["ai-4"]), S[1]!, writers, 1)?.aiRef).toBe("ai-2");
    expect(mapPickGapSeat([S[1]!, S1b], NONE, S[1]!, writers, 1)).toBeNull();
  });
});

describe("map roles: lists", () => {
  it("gives min(angles, available seats) lists, angle i to available seat i", () => {
    const four = ["a", "b", "c", "d"].map(angle);
    expect(mapListAssignments(four, S, new Set(["ai-1"])).map((entry) => `${String(entry.listIndex)}:${entry.seat.aiRef}:${entry.angle?.angleId ?? "-"}`))
      .toEqual(["0:ai-0:a", "1:ai-2:b", "2:ai-3:c", "3:ai-4:d"]);
    expect(mapListAssignments(["a", "b", "c", "d", "e", "f", "g"].map(angle), S, NONE)).toHaveLength(5);
  });

  it("reassigns failed lists to finished seats in plan order, one each; the rest are dropped", () => {
    const failed = [{ listIndex: 1, seat: S[2]!, angle: angle("b") }, { listIndex: 3, seat: S[4]!, angle: angle("d") }];
    expect(mapReassignLists(failed, [S[0]!, S[3]!], NONE).map((entry) => `${String(entry.listIndex)}:${entry.seat.aiRef}`))
      .toEqual(["1:ai-0", "3:ai-3"]);
    expect(mapReassignLists(failed, [S[0]!], NONE)).toHaveLength(1);
    expect(mapReassignLists(failed, [S[0]!], new Set(["ai-0"]))).toHaveLength(0);
  });
});

describe("map roles: angles", () => {
  it("puts the fixed kinds first, in their order, then the specific ones as written", () => {
    const ordered = mapOrderAngles({ angles: [
      { angle_id: "cost", kind: "SPECIFIC", label: "Cost", focus: "Who pays." },
      { angle_id: "do", kind: "PRACTICAL", label: "Do", focus: "What to do." },
      { angle_id: "opp", kind: "OPPOSITE_CASE", label: "Opp", focus: "Other side." },
      { angle_id: "worry", kind: "ASKER_WORRY", label: "Worry", focus: "Fear." }
    ] });
    expect(ordered.map((entry) => entry.angleId)).toEqual(["opp", "worry", "do", "cost"]);
  });

  it("falls back to the three fixed angles and GENERAL", () => {
    expect(MAP_FALLBACK_ANGLES.map((entry) => entry.kind)).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "GENERAL"]);
  });
});

describe("map roles: planner and merger are apart (controller ruling P4)", () => {
  it("with seat 0 sitting out, the planner, merger and chooser are three different seats and the makers differ", () => {
    const out = new Set(["ai-0"]);
    const planner = mapPickPlanner(S, out);
    const merger = mapPickMerger(S, out);
    const chooser = mapPickChooser(S, out, merger);
    expect(refs([planner, merger, chooser])).toEqual(["ai-1", "ai-2", "ai-3"]);
    expect(merger?.aiRef).not.toBe(planner?.aiRef);
    expect(merger?.maker).not.toBe(planner?.maker);
    expect(chooser?.maker).not.toBe(merger?.maker);
  });

  it("the merger takes a seat of another maker than the planner's when one is available", () => {
    expect(mapPickMerger([S[0]!, S0b, S[1]!, S[2]!], NONE)?.aiRef).toBe("ai-1");
  });

  it("falls back to the next available seat when every other seat shares the planner's maker", () => {
    expect(refs([mapPickPlanner([S[0]!, S0b], NONE), mapPickMerger([S[0]!, S0b], NONE)])).toEqual(["ai-0", "ai-0b"]);
  });

  it("has no merger when no seat is available", () => {
    expect(mapPickMerger(S, new Set(S.map((seat) => seat.aiRef)))).toBeNull();
  });
});

describe("map roles: angles with no list are dropped and named (controller ruling P8)", () => {
  it("names the angles past min(angles, seats) as dropped, in angle order", () => {
    const seven = ["a", "b", "c", "d", "e", "f", "g"].map(angle);
    expect(mapDroppedAngles(seven, mapListAssignments(seven, S, NONE)).map((entry) => entry.angleId)).toEqual(["f", "g"]);
    expect(mapDroppedAngles(["a", "b", "c", "d"].map(angle), mapListAssignments(["a", "b", "c", "d"].map(angle), S, new Set(["ai-1"])))).toEqual([]);
  });

  it("names a failed list's angle as dropped when no finished seat takes it over, and not when one does", () => {
    const four = ["a", "b", "c", "d"].map(angle);
    const first = mapListAssignments(four, S, NONE);
    const failed = first.filter((entry) => entry.listIndex === 1);
    const succeeded = first.filter((entry) => entry.listIndex !== 1);
    const finished = succeeded.map((entry) => entry.seat);
    expect(mapDroppedAngles(four, [...succeeded, ...mapReassignLists(failed, [], NONE)]).map((entry) => entry.angleId)).toEqual(["b"]);
    expect(mapDroppedAngles(four, [...succeeded, ...mapReassignLists(failed, finished, NONE)])).toEqual([]);
  });
});

describe("map roles: fix round 1 (gap makers, chooser spread, stable reassignment)", () => {
  const A: MapSeat = { aiRef: "ai-a", maker: "m0" };
  const A2: MapSeat = { aiRef: "ai-a2", maker: "m0" };
  const B: MapSeat = { aiRef: "ai-b", maker: "m1" };
  const B2: MapSeat = { aiRef: "ai-b2", maker: "m1" };
  const C: MapSeat = { aiRef: "ai-c", maker: "m2" };
  const D: MapSeat = { aiRef: "ai-d", maker: "m3" };
  const gapRounds = (order: readonly MapSeat[], merger: MapSeat | null, writers: ReadonlySet<string>, rounds: number) =>
    Array.from({ length: rounds }, (_unused, index) => mapPickGapSeat(order, NONE, merger, writers, index + 1)?.aiRef ?? null);

  it("gap: the coordinator's example, where D's maker wrote nothing and A2 shares a maker that wrote", () => {
    expect(gapRounds([A, A2, B, C, D], B, new Set(["ai-a", "ai-c"]), 2)).toEqual(["ai-d", "ai-a2"]);
  });

  it("gap: a rotated order where a no-list seat of a writing maker comes before the maker that wrote nothing", () => {
    expect(gapRounds([B, A, A2, C, D], B, new Set(["ai-a", "ai-c"]), 2)).toEqual(["ai-d", "ai-a2"]);
  });

  it("chooser: a seat other than the planner's first, then a maker other than the planner's, never the merger's", () => {
    const order = [A, A2, B, B2];
    const merger = mapPickMerger(order, NONE);
    expect(refs([mapPickPlanner(order, NONE), merger, mapPickChooser(order, NONE, merger)])).toEqual(["ai-a", "ai-b", "ai-a2"]);
    expect(refs([mapPickChooser([A, B, A2, C], NONE, B)])).toEqual(["ai-c"]);
  });

  it("chooser after a failed merge starts after the seat the merge would have used, and never picks it when another seat is legal", () => {
    expect(mapPickChooser(S, new Set(["ai-0"]), null)?.aiRef).toBe("ai-3");
    expect(mapPickChooser(S, new Set(["ai-0", "ai-2"]), null)?.aiRef).toBe("ai-4");
  });

  it("reassignment does not depend on the order the failed lists are given in", () => {
    const failed = [{ listIndex: 3, seat: S[4]!, angle: angle("d") }, { listIndex: 1, seat: S[2]!, angle: angle("b") }];
    expect(mapReassignLists(failed, [S[0]!, S[3]!], NONE).map((entry) => `${String(entry.listIndex)}:${entry.seat.aiRef}`))
      .toEqual(["1:ai-0", "3:ai-3"]);
  });

  it("a seat never takes back its own failed list", () => {
    const failed = [{ listIndex: 1, seat: S[2]!, angle: angle("b") }];
    expect(mapReassignLists(failed, [S[2]!, S[0]!, S[3]!], NONE).map((entry) => `${String(entry.listIndex)}:${entry.seat.aiRef}`))
      .toEqual(["1:ai-0"]);
  });

  it("runs planner, merger, chooser and gap together on two makers, and on two makers of two seats each, and pins the result", () => {
    const run = (order: readonly MapSeat[], writers: ReadonlySet<string>) => {
      const merger = mapPickMerger(order, NONE);
      return {
        planner: mapPickPlanner(order, NONE)?.aiRef ?? null,
        merger: merger?.aiRef ?? null,
        chooser: mapPickChooser(order, NONE, merger)?.aiRef ?? null,
        gap: gapRounds(order, merger, writers, 2)
      };
    };
    expect(run([A, B], new Set(["ai-a", "ai-b"]))).toEqual({ planner: "ai-a", merger: "ai-b", chooser: "ai-a", gap: ["ai-a", "ai-a"] });
    expect(run([A, A2, B, B2], new Set(["ai-a", "ai-a2", "ai-b", "ai-b2"])))
      .toEqual({ planner: "ai-a", merger: "ai-b", chooser: "ai-a2", gap: ["ai-a", "ai-a2"] });
    expect(run([A, A2, B, B2], new Set(["ai-a", "ai-b", "ai-b2"])))
      .toEqual({ planner: "ai-a", merger: "ai-b", chooser: "ai-a2", gap: ["ai-a2", "ai-a"] });
  });
});
