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
