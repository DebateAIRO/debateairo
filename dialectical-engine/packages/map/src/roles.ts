import type { MapAnglesReply } from "./replies.js";
import { MAP_FIXED_ANGLE_KINDS, type MapAngle, type MapSeat } from "./types.js";

/**
 * MAP_ANGLES_FALLBACK (spec §1.2): the three fixed angles and GENERAL. Prompt material, written in English; the
 * argument-language directive makes the list AI answer in the question's language.
 */
export const MAP_FALLBACK_ANGLES: readonly MapAngle[] = Object.freeze([
  { angleId: "opposite", kind: "OPPOSITE_CASE" as const, label: "Strongest case for a different answer",
    focus: "The strongest case for an answer different from the one most people would give first." },
  { angleId: "worry", kind: "ASKER_WORRY" as const, label: "What the person asking is worried about",
    focus: "What the person asking is probably worried about or trying to decide." },
  { angleId: "practical", kind: "PRACTICAL" as const, label: "What to do in practice",
    focus: "What the person should actually do, and what it would take." },
  { angleId: "general", kind: "GENERAL" as const, label: "The question as a whole",
    focus: "The points that matter most for answering the question, from every side." }
].map((angle) => Object.freeze(angle)));

/** The planner's angles: the three fixed kinds first, in their fixed order, then its specific angles as written. */
export function mapOrderAngles(reply: MapAnglesReply): readonly MapAngle[] {
  const toAngle = (angle: MapAnglesReply["angles"][number]): MapAngle =>
    Object.freeze({ angleId: angle.angle_id, kind: angle.kind, label: angle.label, focus: angle.focus });
  const fixed = MAP_FIXED_ANGLE_KINDS.flatMap((kind) => reply.angles.filter((angle) => angle.kind === kind).map(toAngle));
  const specific = reply.angles.filter((angle) => angle.kind === "SPECIFIC").map(toAngle);
  return Object.freeze([...fixed, ...specific]);
}

/** The seats in this question's order: the list started `rotation` places on (the first AI rotates per question). */
export function mapRotateSeats<T>(seats: readonly T[], rotation: number): readonly T[] {
  if (seats.length === 0) return Object.freeze([]);
  const start = ((rotation % seats.length) + seats.length) % seats.length;
  return Object.freeze([...seats.slice(start), ...seats.slice(0, start)]);
}

export function mapDistinctMakers(seats: readonly MapSeat[]): number {
  return new Set(seats.map((seat) => seat.maker)).size;
}

function mapCyclicFrom(order: readonly MapSeat[], start: number): readonly MapSeat[] {
  if (order.length === 0) return [];
  const at = ((start % order.length) + order.length) % order.length;
  return [...order.slice(at), ...order.slice(0, at)];
}

const mapIndexOf = (order: readonly MapSeat[], seat: MapSeat): number => order.findIndex((entry) => entry.aiRef === seat.aiRef);

export function mapPickPlanner(order: readonly MapSeat[], out: ReadonlySet<string>): MapSeat | null {
  return order.find((seat) => !out.has(seat.aiRef)) ?? null;
}

/**
 * The merger (spec §1.1): the next available seat after the planner's index, wrapping. Where one is available, a seat
 * of another maker than the planner's is taken first (controller ruling P4: "different makers where possible"). With
 * only the planner's maker left, the next available seat is taken, which is the planner itself when it is alone.
 */
export function mapPickMerger(order: readonly MapSeat[], out: ReadonlySet<string>): MapSeat | null {
  const planner = mapPickPlanner(order, out);
  if (planner === null) return null;
  const after = mapCyclicFrom(order, mapIndexOf(order, planner) + 1).filter((seat) => !out.has(seat.aiRef));
  return after.find((seat) => seat.maker !== planner.maker) ?? after[0] ?? null;
}

/** After the merger, never of the merger's maker (spec §1.1). With no merger (merge failed), from the third seat on. */
export function mapPickChooser(order: readonly MapSeat[], out: ReadonlySet<string>, merger: MapSeat | null): MapSeat | null {
  const start = merger === null ? 2 : mapIndexOf(order, merger) + 1;
  return mapCyclicFrom(order, start).find((seat) => !out.has(seat.aiRef) && (merger === null || seat.maker !== merger.maker)) ?? null;
}

/**
 * Round `round` (1-based) of the gap AI (spec §1.1): a maker that did not merge, rotating; a maker that wrote no list is
 * preferred when one exists.
 */
export function mapPickGapSeat(order: readonly MapSeat[], out: ReadonlySet<string>, merger: MapSeat | null,
  listWriters: ReadonlySet<string>, round: number): MapSeat | null {
  const start = merger === null ? 0 : mapIndexOf(order, merger) + 1;
  const eligible = mapCyclicFrom(order, start).filter((seat) => !out.has(seat.aiRef) && (merger === null || seat.maker !== merger.maker));
  const preferred = [...eligible.filter((seat) => !listWriters.has(seat.aiRef)), ...eligible.filter((seat) => listWriters.has(seat.aiRef))];
  return preferred.length === 0 ? null : preferred[(Math.max(1, round) - 1) % preferred.length]!;
}

export type MapListAssignment = Readonly<{ listIndex: number; seat: MapSeat; angle: MapAngle | null }>;

/** Lists = min(angles, available seats): angle i to available seat i, in plan order. */
export function mapListAssignments(angles: readonly MapAngle[], order: readonly MapSeat[], out: ReadonlySet<string>): readonly MapListAssignment[] {
  const seats = order.filter((seat) => !out.has(seat.aiRef));
  return Object.freeze(Array.from({ length: Math.min(angles.length, seats.length) }, (_unused, index) =>
    Object.freeze({ listIndex: index, seat: seats[index]!, angle: angles[index]! })));
}

/**
 * Spec §1.2: a failed list's angle goes to the next map AI that has finished. Deterministic (as ruled): after the
 * first wave, failed lists in plan order go to the finished seats in plan order, one each; the rest are dropped.
 */
export function mapReassignLists(failed: readonly MapListAssignment[], finished: readonly MapSeat[], out: ReadonlySet<string>): readonly MapListAssignment[] {
  const free = finished.filter((seat) => !out.has(seat.aiRef));
  return Object.freeze(failed.slice(0, free.length).map((assignment, index) =>
    Object.freeze({ listIndex: assignment.listIndex, seat: free[index]!, angle: assignment.angle })));
}

/**
 * The angles that end with no list, given the final lists (controller ruling P8). An angle is dropped when no list
 * carries its position (its listIndex, the angle's index in `angles`): that covers the angles past min(angles, seats)
 * and a failed list whose finished seats ran out. The orchestrator writes one LIST_DROPPED note per returned angle.
 */
export function mapDroppedAngles(angles: readonly MapAngle[], finalLists: readonly MapListAssignment[]): readonly MapAngle[] {
  const held = new Set(finalLists.map((entry) => entry.listIndex));
  return Object.freeze(angles.filter((_angle, index) => !held.has(index)));
}
