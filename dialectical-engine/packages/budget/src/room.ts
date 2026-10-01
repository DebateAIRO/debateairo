import { exhaustive } from "@debateai/kernel";
import type { SpendScope } from "./person-allowance.js";

/**
 * Budget spec 2026-09-28 §2.3, amended by the paid-plans spec 2026-09-29 §2.4.1
 * and AMENDMENTS-R1 A5 — THE ROOM, THE ADMISSION AND THE RUNNING WALL.
 *
 * Pure integer rules, no database, beside `decideDailyCostEnvelope`
 * (./cost-envelope.ts). Every edge of a limit is `limit × basis points ÷ 10 000`
 * rounded DOWN, like every other share of a ceiling (`costEnvelopeCeilings` in
 * @debateai/register), and computed in BigInt so no product loses a digit.
 *
 *  - The ROOM for one scope: FULL once used reaches the limit; CLOSE from the
 *    close edge, or when this question's estimate would take it past the limit;
 *    FITS otherwise. Only FULL makes a question wait (A5).
 *  - The ADMISSION over every scope: wait when a scope is FULL or when the line
 *    holds a run waiting for the site (a new question never jumps the line); a
 *    person who already has their waiting questions is refused instead; START
 *    otherwise.
 *  - The WALL for a running debate: real spend plus the next call's projection
 *    against the finish edge. Holds are not counted here.
 */
export type Room = "FITS" | "CLOSE" | "FULL";
/**
 * Final review Part 1b, Important 1: why a question waits when no reset is what
 * it waits for. OWN_DEBATES: every scope that is FULL is one of the person's
 * windows full only because of their own running debates' counted holds, so
 * the question starts as soon as one of those debates settles, and is expected
 * at the waker's next tick. The site's day never waits for this (budget spec §2.7).
 */
export type WaitsFor = "OWN_DEBATES";
/**
 * One scope's room and when it resets. `fullOnOwnHolds`: a person window that
 * is FULL only with the person's own counted holds — it would not be FULL on
 * spend alone. Only a FULL person window may carry it.
 */
export type ScopeRoom = Readonly<{ scope: SpendScope; room: Room; resetsAt: Date; fullOnOwnHolds?: boolean }>;
export type Admission =
  | Readonly<{ kind: "START"; worst: Room; worstScope: SpendScope | null }>
  | Readonly<{ kind: "WAIT"; waitsUntil: Date; worstScope: SpendScope; waitsFor?: WaitsFor }>
  | Readonly<{ kind: "REFUSE_ALREADY_WAITING" }>;
export type Wall = "WITHIN" | "WOULD_CROSS";

const WHOLE_BASIS_POINTS = 10_000n;
/** Which scope names a tie: the person's longest window first, the site's day last. */
const SCOPE_PRECEDENCE: readonly SpendScope[] = Object.freeze([
  "PERSON_MONTH", "PERSON_WEEK", "PERSON_DAY", "SITE_DAY"
]);

function wholeMicros(value: unknown, code: string): bigint {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError(code);
  return BigInt(value);
}

function basisPointsWithin(value: unknown, low: bigint, high: bigint, code: string): bigint {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new TypeError(code);
  const points = BigInt(value);
  if (points < low || points > high) throw new TypeError(code);
  return points;
}

function edgeOf(limit: bigint, basisPoints: bigint): bigint {
  return (limit * basisPoints) / WHOLE_BASIS_POINTS;
}

function rankOf(room: Room): number {
  switch (room) {
    case "FITS":
      return 0;
    case "CLOSE":
      return 1;
    case "FULL":
      return 2;
    default:
      return exhaustive(room);
  }
}

function precedenceOf(scope: SpendScope): number {
  return SCOPE_PRECEDENCE.indexOf(scope);
}

function validDate(value: unknown, code: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new TypeError(code);
  return value;
}

function checkedRooms(rooms: unknown): ReadonlyArray<ScopeRoom> {
  if (!Array.isArray(rooms)) throw new TypeError("BUDGET_ADMISSION_ROOMS_INVALID");
  const seen = new Set<SpendScope>();
  for (const entry of rooms as ReadonlyArray<ScopeRoom>) {
    if (!SCOPE_PRECEDENCE.includes(entry?.scope) || seen.has(entry.scope)) {
      throw new TypeError("BUDGET_ADMISSION_ROOMS_INVALID");
    }
    rankOf(entry.room);
    validDate(entry.resetsAt, "BUDGET_ADMISSION_ROOMS_INVALID");
    const ownHolds = entry.fullOnOwnHolds;
    if (ownHolds !== undefined && (typeof ownHolds !== "boolean"
      || (ownHolds && (entry.room !== "FULL" || entry.scope === "SITE_DAY")))) {
      throw new TypeError("BUDGET_ADMISSION_ROOMS_INVALID");
    }
    seen.add(entry.scope);
  }
  return rooms as ReadonlyArray<ScopeRoom>;
}

export function decideRoom(input: Readonly<{
  usedMicros: number;
  estimateMicros: number;
  limitMicros: number;
  closeBasisPoints: number;
}>): Room {
  const used = wholeMicros(input?.usedMicros, "BUDGET_ROOM_USED_INVALID");
  const estimate = wholeMicros(input?.estimateMicros, "BUDGET_ROOM_ESTIMATE_INVALID");
  const limit = wholeMicros(input?.limitMicros, "BUDGET_ROOM_LIMIT_INVALID");
  if (limit < 1n) throw new TypeError("BUDGET_ROOM_LIMIT_INVALID");
  const close = basisPointsWithin(input?.closeBasisPoints, 0n, WHOLE_BASIS_POINTS, "BUDGET_ROOM_CLOSE_INVALID");
  if (used >= limit) return "FULL";
  if (used >= edgeOf(limit, close) || used + estimate > limit) return "CLOSE";
  return "FITS";
}

export function decideSharedWall(input: Readonly<{
  spentMicros: number;
  projectedMicros: number;
  limitMicros: number;
  finishBasisPoints: number;
}>): Wall {
  const spent = wholeMicros(input?.spentMicros, "BUDGET_WALL_SPENT_INVALID");
  const projected = wholeMicros(input?.projectedMicros, "BUDGET_WALL_PROJECTION_INVALID");
  const limit = wholeMicros(input?.limitMicros, "BUDGET_WALL_LIMIT_INVALID");
  if (limit < 1n) throw new TypeError("BUDGET_WALL_LIMIT_INVALID");
  const finish = basisPointsWithin(
    input?.finishBasisPoints, WHOLE_BASIS_POINTS, 2n * WHOLE_BASIS_POINTS, "BUDGET_WALL_FINISH_INVALID"
  );
  return spent + projected <= edgeOf(limit, finish) ? "WITHIN" : "WOULD_CROSS";
}

/**
 * The expected start of a question that must wait (budget spec §2.7 "Expected
 * start", paid-plans §2.4.1): the LATEST reset among the FULL scopes — so the
 * later of the site's midnight and the person's reset when both apply — or the
 * next tick when no scope is full and the question only waits for the waker.
 * Final review Part 1b, Important 1: a person window FULL only on the person's
 * own counted holds lifts when one of their debates settles, not at its reset,
 * so it names no reset. When every FULL scope is such a window, the question
 * is expected at the next tick and waits for OWN_DEBATES (the longest such
 * window names the scope); otherwise a FULL site day, or a window FULL on
 * spend, decides as before.
 */
export function waitingUntil(input: Readonly<{
  rooms: ReadonlyArray<ScopeRoom>;
  nextTickAt: Date;
}>): Readonly<{ waitsUntil: Date; worstScope: SpendScope; waitsFor?: WaitsFor }> {
  const rooms = checkedRooms(input?.rooms);
  const nextTickAt = validDate(input?.nextTickAt, "BUDGET_ADMISSION_TICK_INVALID");
  let latest: ScopeRoom | null = null;
  let ownHolds: ScopeRoom | null = null;
  for (const entry of rooms) {
    if (entry.room !== "FULL") continue;
    if (entry.fullOnOwnHolds === true) {
      if (ownHolds === null || precedenceOf(entry.scope) < precedenceOf(ownHolds.scope)) ownHolds = entry;
      continue;
    }
    if (latest === null
      || entry.resetsAt.getTime() > latest.resetsAt.getTime()
      || (entry.resetsAt.getTime() === latest.resetsAt.getTime()
        && precedenceOf(entry.scope) < precedenceOf(latest.scope))) {
      latest = entry;
    }
  }
  if (latest !== null) return Object.freeze({ waitsUntil: latest.resetsAt, worstScope: latest.scope });
  if (ownHolds !== null) {
    return Object.freeze({ waitsUntil: nextTickAt, worstScope: ownHolds.scope, waitsFor: "OWN_DEBATES" as const });
  }
  return Object.freeze({ waitsUntil: nextTickAt, worstScope: "SITE_DAY" as const });
}

export function decideAdmission(input: Readonly<{
  rooms: ReadonlyArray<ScopeRoom>;
  siteLineBlocking: boolean;
  personWaitingCount: number;
  waitingLinePerPerson: number;
  nextTickAt: Date;
}>): Admission {
  const rooms = checkedRooms(input?.rooms);
  if (typeof input.siteLineBlocking !== "boolean") throw new TypeError("BUDGET_ADMISSION_LINE_INVALID");
  if (!Number.isSafeInteger(input.personWaitingCount) || input.personWaitingCount < 0) {
    throw new TypeError("BUDGET_ADMISSION_WAITING_INVALID");
  }
  if (!Number.isSafeInteger(input.waitingLinePerPerson) || input.waitingLinePerPerson < 1) {
    throw new TypeError("BUDGET_ADMISSION_PER_PERSON_INVALID");
  }
  const nextTickAt = validDate(input.nextTickAt, "BUDGET_ADMISSION_TICK_INVALID");
  const mustWait = input.siteLineBlocking || rooms.some((entry) => entry.room === "FULL");
  if (mustWait) {
    if (input.personWaitingCount >= input.waitingLinePerPerson) {
      return Object.freeze({ kind: "REFUSE_ALREADY_WAITING" as const });
    }
    const until = waitingUntil({ rooms, nextTickAt });
    return Object.freeze({
      kind: "WAIT" as const,
      waitsUntil: until.waitsUntil,
      worstScope: until.worstScope,
      ...(until.waitsFor === undefined ? {} : { waitsFor: until.waitsFor })
    });
  }
  let worst: ScopeRoom | null = null;
  for (const entry of rooms) {
    const rank = rankOf(entry.room);
    if (rank === 0) continue;
    if (worst === null || rank > rankOf(worst.room)
      || (rank === rankOf(worst.room) && precedenceOf(entry.scope) < precedenceOf(worst.scope))) {
      worst = entry;
    }
  }
  return Object.freeze({ kind: "START" as const, worst: worst?.room ?? "FITS", worstScope: worst?.scope ?? null });
}
