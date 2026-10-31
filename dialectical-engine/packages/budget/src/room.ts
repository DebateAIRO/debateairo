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
 *  - The ADMISSION over every scope: wait when a scope is FULL, when the line
 *    holds a run waiting for the site (a new question never jumps the line), or
 *    when the site holds every question back (`AdmissionHold`); a person who
 *    already has their waiting questions is refused instead; START otherwise.
 *  - The WALL for a running debate: real spend plus the next call's projection
 *    against the finish edge: the limit's share edge plus, on a billingPlans v4
 *    window, its fixed overflow in micro-units. Holds are not counted here.
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
/**
 * Side-by-side uploads spec 2026-10-21 §9, §13 (plan C task C8): what holds every new question back whatever its rooms
 * say. SITE_BUSY: the site already runs as many debates as its runners take (`SITE_CONCURRENT_DEBATES`, across
 * releases). SWITCHING: this release is not the current one, so a release switch is under way. Either waits for the
 * waker's next tick; both live only in the database (`core.run_wait_reason.waits_for`), never on the wire.
 */
export type AdmissionHold = "SITE_BUSY" | "SWITCHING";
/**
 * A WAIT's `cause` names the hold only when it is the ONE reason to wait: no scope is FULL and the line holds nobody
 * back. A wait the rooms or the line decide is recorded as before, whatever the hold.
 */
export type Admission =
  | Readonly<{ kind: "START"; worst: Room; worstScope: SpendScope | null }>
  | Readonly<{ kind: "WAIT"; waitsUntil: Date; worstScope: SpendScope; waitsFor?: WaitsFor; cause?: AdmissionHold }>
  | Readonly<{ kind: "REFUSE_ALREADY_WAITING" }>;
export type Wall = "WITHIN" | "WOULD_CROSS";

const WHOLE_BASIS_POINTS = 10_000n;
/** Which scope names a tie: the person's longest window first, the site's day last. */
const SCOPE_PRECEDENCE: readonly SpendScope[] = Object.freeze([
  "PERSON_GRANT", "PERSON_MONTH", "PERSON_WEEK", "PERSON_DAY", "SITE_DAY"
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
  /** billingPlans v4: a fixed amount past the share edge (20 cents); absent is none. */
  finishOverflowMicros?: number;
}>): Wall {
  const spent = wholeMicros(input?.spentMicros, "BUDGET_WALL_SPENT_INVALID");
  const projected = wholeMicros(input?.projectedMicros, "BUDGET_WALL_PROJECTION_INVALID");
  const limit = wholeMicros(input?.limitMicros, "BUDGET_WALL_LIMIT_INVALID");
  if (limit < 1n) throw new TypeError("BUDGET_WALL_LIMIT_INVALID");
  const finish = basisPointsWithin(
    input?.finishBasisPoints, WHOLE_BASIS_POINTS, 2n * WHOLE_BASIS_POINTS, "BUDGET_WALL_FINISH_INVALID"
  );
  const overflow = input.finishOverflowMicros === undefined
    ? 0n : wholeMicros(input.finishOverflowMicros, "BUDGET_WALL_OVERFLOW_INVALID");
  return spent + projected <= edgeOf(limit, finish) + overflow ? "WITHIN" : "WOULD_CROSS";
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
  /** Side-by-side C8: absent or null is today's admission, unchanged. */
  hold?: AdmissionHold | null;
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
  const hold = input.hold ?? null;
  if (hold !== null && hold !== "SITE_BUSY" && hold !== "SWITCHING") throw new TypeError("BUDGET_ADMISSION_HOLD_INVALID");
  const anyFull = rooms.some((entry) => entry.room === "FULL");
  const mustWait = input.siteLineBlocking || anyFull || hold !== null;
  if (mustWait) {
    if (input.personWaitingCount >= input.waitingLinePerPerson) {
      return Object.freeze({ kind: "REFUSE_ALREADY_WAITING" as const });
    }
    const until = waitingUntil({ rooms, nextTickAt });
    return Object.freeze({
      kind: "WAIT" as const,
      waitsUntil: until.waitsUntil,
      worstScope: until.worstScope,
      ...(until.waitsFor === undefined ? {} : { waitsFor: until.waitsFor }),
      ...(hold === null || anyFull || input.siteLineBlocking ? {} : { cause: hold })
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

// ---------------------------------------------------------------------------------------------------------------------
// THE MONEY RULE (owner, 31 Oct 2026, "How web money is spent"; plan 2026-10-30 dig-model revision, its closing section).
// It applies to a billingPlans v4 person's windows (they carry `borrows` or `keepsReserveMicros`); a v3 window and an
// internal grant's keep the rules above unchanged.
//  1. No worst-case hold before a start: a question or dig starts when the day, week and month have room (its estimate
//     is shown as a share of today, not held).
//  2. Running work is never stopped by the day or week: what it uses past them is BORROWED from the next day or week,
//     which starts lower by that much. New starts wait for the reset.
//  3. The month is the wall: no new start, and a running debate's remaining planned calls and searches pause. Only the
//     calls already in flight may finish, within the month's tolerance (the old fixed 20-cent overflow).
//  4. The final-answer reserve is always kept: a paid plan's 20 cents inside its month.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Open owner question (held 31 Oct, to be ruled on in the morning): does what running work borrowed at the end of a
 * month carry into the NEW month's first day and week? This is the ONE switch for it. NO (the default): the new month
 * starts clean, because the month is the wall and an overspend at its end is the in-flight tolerance. YES: the borrow
 * chain runs on from the last day and week of the month before.
 */
export const BORROW_CARRIES_ACROSS_MONTH: boolean = false;

/** The blocks the day and week windows tile a month with, from its anchor (billing-core `computeWindows`). */
export const BORROW_WINDOW_SPANS_MS: Readonly<Record<"PERSON_DAY" | "PERSON_WEEK", number>> = Object.freeze({
  PERSON_DAY: 86_400_000,
  PERSON_WEEK: 7 * 86_400_000
});

/** One day or week window of the borrow chain: its limit and what was spent in it (the ledger, by recorded time). */
export type BorrowWindow = Readonly<{ limitMicros: number; usedMicros: number }>;

/**
 * Borrowing is DERIVED, never stored (the ledger is append-only, and a stored copy could drift from it). For the windows
 * w1 … wn of one kind, oldest first, ending with the current one:
 *   borrowed(w1) = `carryInMicros` (0 unless the cross-month switch carries the month before's last over);
 *   borrowed(wk+1) = max(0, used(wk) + borrowed(wk) − limit(wk)).
 * `borrowedMicros[k]` is how much lower window k started; `overMicros` is what the LAST window is borrowing from the next
 * (its used plus borrowed past its limit): when it is more than 0, the page says some of tomorrow's (or next week's)
 * allowance was used to finish the running task.
 */
export function deriveBorrows(windows: ReadonlyArray<BorrowWindow>, carryInMicros = 0): Readonly<{
  borrowedMicros: readonly number[];
  overMicros: number;
}> {
  if (!Array.isArray(windows)) throw new TypeError("BUDGET_BORROW_WINDOWS_INVALID");
  let borrowed = wholeMicros(carryInMicros, "BUDGET_BORROW_CARRY_INVALID");
  const result: number[] = [];
  let over = 0n;
  for (const window of windows) {
    const limit = wholeMicros(window?.limitMicros, "BUDGET_BORROW_WINDOWS_INVALID");
    const used = wholeMicros(window?.usedMicros, "BUDGET_BORROW_WINDOWS_INVALID");
    result.push(Number(borrowed));
    over = used + borrowed > limit ? used + borrowed - limit : 0n;
    borrowed = over;
  }
  return Object.freeze({ borrowedMicros: Object.freeze(result), overMicros: Number(over) });
}

/**
 * The day or week blocks of the month [`monthStart`, `monthEnd`), oldest first: 24-hour or 7-day blocks counted from
 * the month's start, the last one cut at the month's end (billing-core `computeWindows`' tiling, exactly).
 */
export function tiledWindows(monthStart: Date, monthEnd: Date, scope: "PERSON_DAY" | "PERSON_WEEK"): ReadonlyArray<Readonly<{
  start: Date; end: Date }>> {
  const start = validDate(monthStart, "BUDGET_BORROW_MONTH_INVALID").getTime();
  const end = validDate(monthEnd, "BUDGET_BORROW_MONTH_INVALID").getTime();
  const span = BORROW_WINDOW_SPANS_MS[scope];
  if (span === undefined || end <= start) throw new TypeError("BUDGET_BORROW_MONTH_INVALID");
  const blocks: Array<Readonly<{ start: Date; end: Date }>> = [];
  for (let at = start; at < end; at += span) {
    blocks.push(Object.freeze({ start: new Date(at), end: new Date(Math.min(at + span, end)) }));
  }
  return Object.freeze(blocks);
}

/**
 * The limit a NEW start is measured against: the window's limit less the final-answer reserve kept inside it (a paid
 * plan's month), never below one micro-unit (`decideRoom` refuses a zero limit). New starts compare used + borrowed
 * with it; only FULL makes them wait, for the window's reset.
 */
export function startLimitMicros(window: Readonly<{ limitMicros: number; keepsReserveMicros?: number }>): number {
  const limit = wholeMicros(window?.limitMicros, "BUDGET_ROOM_LIMIT_INVALID");
  const reserve = window.keepsReserveMicros === undefined ? 0n : wholeMicros(window.keepsReserveMicros, "BUDGET_ROOM_RESERVE_INVALID");
  return Number(limit - reserve > 1n ? limit - reserve : 1n);
}

/**
 * THE MONTH WALL for one call while a debate is argued (money rule point 3). The wall's edge is the month's limit less
 * the reserve kept inside it. A call is WITHIN when the month (real spend plus the run's other calls in flight, both in
 * `spentMicros`) is still below that edge, AND its own projected maximum stays within the edge plus the tolerance for
 * calls in flight (billingPlans v4's `finish_overflow_micros`, 20 cents). Otherwise it WOULD_CROSS: the runner pauses
 * the debate's remaining planned work instead of sending it.
 */
export function decideMonthWall(input: Readonly<{
  spentMicros: number;
  projectedMicros: number;
  limitMicros: number;
  keepsReserveMicros?: number;
  toleranceMicros: number;
}>): Wall {
  const spent = wholeMicros(input?.spentMicros, "BUDGET_WALL_SPENT_INVALID");
  const projected = wholeMicros(input?.projectedMicros, "BUDGET_WALL_PROJECTION_INVALID");
  const limit = wholeMicros(input?.limitMicros, "BUDGET_WALL_LIMIT_INVALID");
  if (limit < 1n) throw new TypeError("BUDGET_WALL_LIMIT_INVALID");
  const reserve = input.keepsReserveMicros === undefined ? 0n : wholeMicros(input.keepsReserveMicros, "BUDGET_WALL_RESERVE_INVALID");
  const tolerance = wholeMicros(input.toleranceMicros, "BUDGET_WALL_OVERFLOW_INVALID");
  const edge = limit > reserve ? limit - reserve : 0n;
  if (spent >= edge) return "WOULD_CROSS";
  return spent + projected <= edge + tolerance ? "WITHIN" : "WOULD_CROSS";
}

/**
 * The borrow notice's share: what the current window is borrowing, as a whole percentage of the next window's limit,
 * rounded UP (a borrow of anything shows at least 1%) and at most 100. 0 when nothing is borrowed.
 */
export function borrowPercent(overMicros: number, nextLimitMicros: number): number {
  const over = wholeMicros(overMicros, "BUDGET_BORROW_OVER_INVALID");
  const limit = wholeMicros(nextLimitMicros, "BUDGET_ROOM_LIMIT_INVALID");
  if (limit < 1n) throw new TypeError("BUDGET_ROOM_LIMIT_INVALID");
  if (over === 0n) return 0;
  const percent = (over * 100n + limit - 1n) / limit;
  return Number(percent > 100n ? 100n : percent < 1n ? 1n : percent);
}
