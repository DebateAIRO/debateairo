import type { MapAnglesReply } from "./replies.js";
import { MAP_FIXED_ANGLE_KINDS, MAP_LIMITS, type MapAngle, type MapSeat } from "./types.js";

/**
 * The angle ids the map gives out (controller ruling T7-PRIV): `g1`..`gN` in plan order, minted by code. An angle id
 * lands in a readable column (core.map_item.angle_id) on an encrypted run, so it is never a word an AI wrote: the
 * planner's own angle_id (a slug such as "sell-family-home") is private content and lives only in its raw reply, which
 * the runner stores encrypted. N is at most MAP_LIMITS.anglesMax; migration 0117's CHECK holds the same bound.
 */
export const mapAngleCodeId = (index: number): string => `g${String(index + 1)}`;

/**
 * MAP_ANGLES_FALLBACK (spec §1.2): the three fixed angles and GENERAL, ids g1..g4 like any planned angles. Prompt
 * material, written in English; the argument-language directive makes the list AI answer in the question's language.
 */
export const MAP_FALLBACK_ANGLES: readonly MapAngle[] = Object.freeze([
  { angleId: mapAngleCodeId(0), kind: "OPPOSITE_CASE" as const, label: "Strongest case for a different answer",
    focus: "The strongest case for an answer different from the one most people would give first." },
  { angleId: mapAngleCodeId(1), kind: "ASKER_WORRY" as const, label: "What the person asking is worried about",
    focus: "What the person asking is probably worried about or trying to decide." },
  { angleId: mapAngleCodeId(2), kind: "PRACTICAL" as const, label: "What to do in practice",
    focus: "What the person should actually do, and what it would take." },
  { angleId: mapAngleCodeId(3), kind: "GENERAL" as const, label: "The question as a whole",
    focus: "The points that matter most for answering the question, from every side." }
].map((angle) => Object.freeze(angle)));

/**
 * The planner's angles: the three fixed kinds first, in their fixed order, then its specific angles as written. Each is
 * renamed g1..gN in that order (ruling T7-PRIV): the planner's angle_id was checked (unique) on its reply, where it stays,
 * and is dropped here; nothing later refers to it.
 */
export function mapOrderAngles(reply: MapAnglesReply): readonly MapAngle[] {
  const fixed = MAP_FIXED_ANGLE_KINDS.flatMap((kind) => reply.angles.filter((angle) => angle.kind === kind));
  const specific = reply.angles.filter((angle) => angle.kind === "SPECIFIC");
  // The reply's schema already holds it to MAP_LIMITS.anglesMax; the cut keeps the id bound true for any reply.
  return Object.freeze([...fixed, ...specific].slice(0, MAP_LIMITS.anglesMax).map((angle, index): MapAngle =>
    Object.freeze({ angleId: mapAngleCodeId(index), kind: angle.kind, label: angle.label, focus: angle.focus })));
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
  const after = mapRotateSeats(order, mapIndexOf(order, planner) + 1).filter((seat) => !out.has(seat.aiRef));
  return after.find((seat) => seat.maker !== planner.maker) ?? after[0] ?? null;
}

/**
 * The chooser (spec §1.1): a seat that did not merge, never of the merger's maker. Among those, a seat other than the
 * planner's comes first, then a maker other than the planner's (fix round 1: the answers are spread from the planner),
 * the cyclic order from the merger breaking ties. With no merger (arm A, or the merge failed) there is no maker to avoid,
 * and the search anchors on the would-be merger seat from mapPickMerger (the planner's next available seat of another
 * maker, else its next available seat): the cyclic order starts after it, so that seat comes last among equal ranks.
 * Task 9 calls it with the same `out` it used for the merge step.
 */
export function mapPickChooser(order: readonly MapSeat[], out: ReadonlySet<string>, merger: MapSeat | null): MapSeat | null {
  const planner = mapPickPlanner(order, out);
  const anchor = merger ?? mapPickMerger(order, out);
  if (planner === null || anchor === null) return null;
  const legal = mapRotateSeats(order, mapIndexOf(order, anchor) + 1)
    .filter((seat) => !out.has(seat.aiRef) && (merger === null || seat.maker !== merger.maker));
  const rank = (seat: MapSeat): number => (seat.aiRef === planner.aiRef ? 2 : 0) + (seat.maker === planner.maker ? 1 : 0);
  return [...legal].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/**
 * Round `round` (1-based) of the gap AI (spec §1.1): a maker that did not merge, rotating. A maker that wrote no list is
 * preferred when one exists (fix round 1: a maker, not a seat). Three tiers, each in the cyclic order from the merger:
 * a seat whose maker wrote no list; then a seat that wrote no list; then the rest. Never the merger's maker.
 */
export function mapPickGapSeat(order: readonly MapSeat[], out: ReadonlySet<string>, merger: MapSeat | null,
  listWriters: ReadonlySet<string>, round: number): MapSeat | null {
  const start = merger === null ? 0 : mapIndexOf(order, merger) + 1;
  const eligible = mapRotateSeats(order, start).filter((seat) => !out.has(seat.aiRef) && (merger === null || seat.maker !== merger.maker));
  const writerMakers = new Set(order.filter((seat) => listWriters.has(seat.aiRef)).map((seat) => seat.maker));
  const tier = (seat: MapSeat): number => (!writerMakers.has(seat.maker) ? 0 : listWriters.has(seat.aiRef) ? 2 : 1);
  const ranked = [...eligible].sort((a, b) => tier(a) - tier(b));
  return ranked.length === 0 ? null : ranked[(Math.max(1, round) - 1) % ranked.length]!;
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
 * first wave, the failed lists go in listIndex order, whatever order the caller gives them in, to the finished seats in
 * plan order, one each; a seat that itself failed never takes a list back, and the rest are dropped.
 */
export function mapReassignLists(failed: readonly MapListAssignment[], finished: readonly MapSeat[], out: ReadonlySet<string>): readonly MapListAssignment[] {
  const failedSeats = new Set(failed.map((entry) => entry.seat.aiRef));
  const free = finished.filter((seat) => !out.has(seat.aiRef) && !failedSeats.has(seat.aiRef));
  const inOrder = [...failed].sort((a, b) => a.listIndex - b.listIndex);
  return Object.freeze(inOrder.slice(0, free.length).map((assignment, index) =>
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
