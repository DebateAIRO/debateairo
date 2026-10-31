import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { personWindowsFor } from "@debateai/billing-core";
import {
  BORROW_CARRIES_ACROSS_MONTH,
  CostEnvelopeGuard,
  MonthWallReachedError,
  PostgresModelSpendStore,
  borrowPercent,
  decideMonthWall,
  deriveBorrows,
  isMonthWallReached,
  startLimitMicros,
  tiledWindows,
  type ModelSpendEntry,
  type ModelSpendStore,
  type PersonAllowanceSource,
  type PersonWindow
} from "@debateai/budget";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, planById, type PlanId } from "@debateai/register";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderCostEnvelopeSeam } from "@debateai/providers";
import { AskRoom, borrowersOf, readWindowBorrow, type AskRoomSpend } from "../../apps/api/src/ask-room.js";
import { PersonUsageReader } from "../../apps/api/src/billing/usage.js";
import { continuePausedRun, monthPauseOf, type MonthPausePort } from "../../apps/api/src/month-pause.js";
import { MonthPause, RUN_MONTH_PAUSED, withMonthPause, type MonthPauseStore } from "../../apps/runner/src/month-pause.js";
import { storyCallScopeAgrees } from "../../apps/runner/src/index.js";

/**
 * THE MONEY RULE (owner, 31 Oct 2026, "How web money is spent"; plan 2026-10-30 dig-model revision W3-2), on made-up
 * spend over the real billingPlans v4 row:
 *  - no worst-case hold before a start (the estimate is shown as a share of today);
 *  - running work passes the day and the week, and what it used past them is borrowed (derived, never stored);
 *  - new starts wait for the reset;
 *  - the month is the wall: the debate's remaining planned calls pause, Continue before the reset is refused, after it
 *    the debate goes on and nothing done is paid twice;
 *  - the final-answer reserve is always left; a dig's path rewrite is never walled;
 *  - the one cross-month switch, both ways.
 */

const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
const ANCHOR = new Date("2026-10-01T00:00:00.000Z");
const OWNER = "7e1f6c1a-3b9d-4d5e-8f00-000000000001";
const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);

const windowsOf = (plan: PlanId, now: Date): ReadonlyArray<PersonWindow> => personWindowsFor(planById(plans, plan), ANCHOR, now, 9_500);
const allowanceOf = (plan: PlanId): PersonAllowanceSource => ({ read: async (_owner, now) => windowsOf(plan, now) });

type Charge = Readonly<{ at: Date; runId: string; micros: number }>;
/** The person's spend as the ledger holds it: every charge with its time and its run. */
function ledger(charges: readonly Charge[], batched = true) {
  const within = (from: Date, to: Date) => charges.filter((charge) => charge.at >= from && charge.at < to);
  const sum = (from: Date, to: Date) => within(from, to).reduce((total, charge) => total + charge.micros, 0);
  const spend: AskRoomSpend = {
    readDaySpentMicros: async () => 0,
    readSiteCountedHoldsMicros: async () => 0,
    readOwnerSpentMicros: async (_owner, from, to) => sum(from, to),
    readOwnerCountedHoldsMicros: async () => 9_000_000,
    openHold: async () => undefined,
    ...(batched ? { readOwnerSpentInRangesMicros: async (_owner: string, ranges: ReadonlyArray<Readonly<{ from: Date; to: Date }>>) =>
      ranges.map((range) => sum(range.from, range.to)) } : {}),
    readOwnerChargesMicros: async (_owner, from, to) => within(from, to).map((charge) => ({ runId: charge.runId, chargeMicros: charge.micros }))
  };
  return spend;
}

function roomWith(input: Readonly<{ plan: PlanId; charges: readonly Charge[]; now: Date; holds?: number; windows?: (now: Date) => ReadonlyArray<PersonWindow> }>) {
  const spend = { ...ledger(input.charges), readOwnerCountedHoldsMicros: async () => input.holds ?? 0 };
  const windows = input.windows ?? ((now: Date) => windowsOf(input.plan, now));
  return new AskRoom({
    lockPool: { connect: vi.fn() } as unknown as Pool,
    spend,
    line: {
      siteLineBlocking: async () => false, wakeCandidates: async () => [], waitingForOwner: async () => [],
      waitingForLegacyAsker: async () => [], readWaiting: async () => null, isWaiting: async () => false,
      enterWait: async () => undefined, recordReason: async () => undefined, markStarted: async () => undefined
    },
    estimator: { estimateMicros: async () => 150_000 },
    personAllowance: { read: async (_owner, now) => windows(now) },
    entitlements: null,
    dailyCeilingMicros: 1_000_000_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    clock: () => input.now
  });
}
const QUESTION = Object.freeze({
  access: Object.freeze({ ownerRef: OWNER, legacyAskerId: null }),
  settingsClass: Object.freeze({ planTier: "premium" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 })
});

describe("the money rule's pieces (pure)", () => {
  it("derives the borrow chain: each window starts lower by what the one before used past its limit", () => {
    // Limits 100: 130 used, then 90 (+30 = 120), then 10 (+20 = 30): the second starts at 30, the third at 20.
    expect(deriveBorrows([{ limitMicros: 100, usedMicros: 130 }, { limitMicros: 100, usedMicros: 90 }, { limitMicros: 100, usedMicros: 10 }]))
      .toEqual({ borrowedMicros: [0, 30, 20], overMicros: 0 });
    // A window that is itself past its limit is borrowing from the next: its over.
    expect(deriveBorrows([{ limitMicros: 100, usedMicros: 50 }, { limitMicros: 100, usedMicros: 120 }]).overMicros).toBe(20);
    // A carried-in borrow (the cross-month switch) starts the first window lower.
    expect(deriveBorrows([{ limitMicros: 100, usedMicros: 90 }], 25)).toEqual({ borrowedMicros: [25], overMicros: 15 });
  });

  it("tiles a month into 24-hour and 7-day blocks from its anchor, the last cut at the month's end", () => {
    const days = tiledWindows(at("2026-10-01T00:00:00.000Z"), at("2026-11-01T00:00:00.000Z"), "PERSON_DAY");
    expect(days).toHaveLength(31);
    const weeks = tiledWindows(at("2026-10-01T00:00:00.000Z"), at("2026-11-01T00:00:00.000Z"), "PERSON_WEEK");
    expect(weeks.map((week) => (week.end.getTime() - week.start.getTime()) / DAY)).toEqual([7, 7, 7, 7, 3]);
  });

  it("shows a borrow as a whole share of the next window, rounded up", () => {
    expect(borrowPercent(0, 1_000_000)).toBe(0);
    expect(borrowPercent(1, 1_000_000)).toBe(1);
    expect(borrowPercent(50_000, 1_000_000)).toBe(5);
    expect(borrowPercent(5_000_000, 1_000_000)).toBe(100);
  });

  it("the cross-month switch is ONE named constant, and NO until the owner rules", () => {
    expect(BORROW_CARRIES_ACROSS_MONTH).toBe(false);
  });
});

describe("the v4 windows (billing-core): day and week borrow, the month is the wall with its reserve", () => {
  it("a paid plan's day and week borrow and carry no overflow; its month keeps 20 cents inside and 20 cents of tolerance", () => {
    const windows = windowsOf("PLUS", at("2026-10-03T12:00:00.000Z"));
    expect(windows.map((window) => [window.scope, window.borrows ?? null, window.finishOverflowMicros ?? null, window.keepsReserveMicros ?? null]))
      .toEqual([["PERSON_DAY", true, null, null], ["PERSON_WEEK", true, null, null], ["PERSON_MONTH", null, 200_000, 200_000]]);
  });

  it("Free's month keeps no reserve inside: its 5 cents sit on top of its 20", () => {
    expect(windowsOf("FREE", at("2026-10-03T12:00:00.000Z")).map((window) => [window.scope, window.keepsReserveMicros]))
      .toEqual([["PERSON_MONTH", 0]]);
  });
});

describe("starts with no hold", () => {
  it("a v4 question starts with room although the person's own debates hold far more than the month", async () => {
    const room = roomWith({ plan: "PLUS", charges: [], now: at("2026-10-03T12:00:00.000Z"), holds: 9_000_000 });
    const answer = await room.readRoom(QUESTION);
    expect(answer).toMatchObject({ room: "FITS", scope: null, reserve: "KEPT" });
    // 150 000 of a 1 000 000 day: 15%.
    expect(answer.startSharePercent).toBe(15);
    expect(answer.digSharePercent).toBeUndefined();
  });

  it("a dig's read gives the dig's share instead", async () => {
    const room = roomWith({ plan: "PLUS", charges: [], now: at("2026-10-03T12:00:00.000Z") });
    const answer = await room.readRoom({ ...QUESTION, dig: { parentRunId: OWNER, mode: "quick", picks: 2 } });
    expect(answer.digSharePercent).toBe(15);
    expect(answer.startSharePercent).toBeUndefined();
  });

  it("(contrast, unchanged) a v3 window still counts the holds", async () => {
    const v3 = (now: Date) => windowsOf("PLUS", now).map((window) => {
      const { borrows: _b, keepsReserveMicros: _k, finishOverflowMicros: _o, ...rest } = window;
      return Object.freeze(rest);
    });
    const room = roomWith({ plan: "PLUS", charges: [], now: at("2026-10-03T12:00:00.000Z"), holds: 9_000_000, windows: v3 });
    const answer = await room.readRoom(QUESTION);
    expect(answer.room).toBe("FULL");
    expect(answer.reserve).toBeUndefined();
    expect(answer.newStarts).toBeUndefined();
  });
});

const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
const PROJECTION = Object.freeze({ requestBytes: 800, completionTokenCeiling: 64 });
/** ceil(800 / 2) + 64 at one micro-unit a token. */
const PROJECTED = 464;

function guardOver(input: Readonly<{ now: Date; spentByStart: ReadonlyMap<number, number>; recorded?: ModelSpendEntry[] }>) {
  const recorded = input.recorded ?? [];
  const store: ModelSpendStore = {
    recordSpend: async (entry) => { recorded.push(entry); },
    readRunSpentMicros: async () => 0,
    readRunStorySpentMicros: async () => 0,
    readRunPathRewriteSpentMicros: async () => 0,
    readDaySpentMicros: async () => 0,
    admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
  };
  return new CostEnvelopeGuard({
    store, policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000, perStoryCeilingMicros: 100_000 },
    clock: () => input.now,
    sharedWall: {
      finishBasisPoints: null, persons: allowanceOf("PLUS"),
      owners: { readRunChargeOwnerRef: async () => OWNER, readOwnerSpentMicros: async (_owner, from) => input.spentByStart.get(from.getTime()) ?? 0 }
    }
  });
}
const outcome = (value: unknown) => Promise.resolve(value).then(() => "ADMITTED",
  (error: unknown) => isMonthWallReached(error) ? "MONTH_WALL" : error instanceof TypedDomainError ? error.code : "UNTYPED");
const bodyCall = (guard: CostEnvelopeGuard) => guard.providerSeam({ runId: "run-1", price: PRICE, requireReportedUsage: true, phase: "BODY" })
  .assertCallAllowed(PROJECTION);

describe("running work passes the day and the week, and the borrow is computed", () => {
  // 10 Oct: the day (10 Oct), the week (from 8 Oct) and the month (from 1 Oct) each start at their own instant.
  const now = at("2026-10-10T12:00:00.000Z");
  const [day, week, month] = windowsOf("PLUS", now);

  it("a call while arguing is admitted with the day and the week long past their limits", async () => {
    const spent = new Map([[day!.periodStart.getTime(), 5 * day!.limitMicros], [week!.periodStart.getTime(), 3 * week!.limitMicros],
      [month!.periodStart.getTime(), 1_000_000]]);
    expect(await outcome(bodyCall(guardOver({ now, spentByStart: spent })))).toBe("ADMITTED");
  });

  it("what a day used past its limit lowers the next day: derived from the ledger, never stored", async () => {
    // 7 Oct: a running debate used 1.3 of the 1.0 day. 8 Oct (the first day of the second week) starts at 0.3.
    const charges: Charge[] = [{ at: at("2026-10-07T20:00:00.000Z"), runId: "run-a", micros: 1_300_000 }];
    const today = windowsOf("PLUS", at("2026-10-08T12:00:00.000Z"));
    for (const batched of [true, false]) {
      const borrow = await readWindowBorrow({ ownerRef: OWNER, window: today[0]!, month: today[2]!, spend: ledger(charges, batched), allowance: allowanceOf("PLUS") });
      expect(borrow).toMatchObject({ scope: "PERSON_DAY", borrowedMicros: 300_000, overMicros: 0, notice: false });
    }
  });
});

describe("new starts wait for the reset", () => {
  const charges: Charge[] = [
    { at: at("2026-10-07T20:00:00.000Z"), runId: "run-a", micros: 1_300_000 },
    { at: at("2026-10-08T09:00:00.000Z"), runId: "run-b", micros: 750_000 }
  ];
  const now = at("2026-10-08T12:00:00.000Z");

  it("a day that started 0.3 lower and used 0.75 is full: new questions wait for its reset", async () => {
    const answer = await roomWith({ plan: "PLUS", charges, now }).readRoom(QUESTION);
    expect(answer).toMatchObject({ room: "FULL", scope: "PERSON_DAY", resetsAt: at("2026-10-09T00:00:00.000Z"), newStarts: "BLOCKED_UNTIL_RESET" });
  });

  it("the usage read shows the day with what it borrowed, and names the run borrowing from tomorrow", async () => {
    const usage = await new PersonUsageReader({
      entitlements: { current: async () => ({ planId: "PLUS" as const }) }, allowance: allowanceOf("PLUS"), spend: ledger(charges)
    }).read(OWNER, now);
    expect(usage.windows[0]).toMatchObject({ scope: "PERSON_DAY", percent: 105 });
    // 0.3 + 0.75 = 1.05 of a 1.0 day: run-b is using 0.05 of tomorrow, 5%.
    expect(usage.borrowed).toEqual([{ scope: "PERSON_DAY", runRef: "run-b", percent: 5, nextWindowStartsAt: at("2026-10-09T00:00:00.000Z") }]);
  });

  it("names each run by the part past the limit it spent, oldest first", () => {
    expect(borrowersOf({ charges: [{ runId: "a", chargeMicros: 60 }, { runId: "b", chargeMicros: 30 }, { runId: "a", chargeMicros: 20 }],
      startedAtMicros: 20, limitMicros: 100, nextLimitMicros: 100 }))
      .toEqual([{ runId: "b", overMicros: 10, percent: 10 }, { runId: "a", overMicros: 20, percent: 20 }]);
  });
});

describe("the month wall pauses the remaining calls", () => {
  const now = at("2026-10-20T12:00:00.000Z");
  const month = windowsOf("PLUS", now)[2]!;
  const at_ = (spent: number) => guardOver({ now, spentByStart: new Map([[month.periodStart.getTime(), spent]]) });

  it("below the wall (the month less its 20-cent reserve) a call is admitted; at it, the month's own refusal", async () => {
    expect(await outcome(bodyCall(at_(4_800_000 - 1)))).toBe("ADMITTED");
    expect(await outcome(bodyCall(at_(4_800_000)))).toBe("MONTH_WALL");
    const refusal = await bodyCall(at_(4_800_000)).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(MonthWallReachedError);
    expect((refusal as MonthWallReachedError).code).toBe("PERSON_ALLOWANCE_REACHED");
    expect((refusal as MonthWallReachedError).resumableAt).toEqual(month.resetsAt);
  });

  it("the old 20 cents are only the tolerance for a call in flight: its worst case may pass the wall by at most that", () => {
    const wall = (spentMicros: number, projectedMicros: number) => decideMonthWall({ spentMicros, projectedMicros, limitMicros: 5_000_000,
      keepsReserveMicros: 200_000, toleranceMicros: 200_000 });
    expect(wall(4_799_999, 200_001)).toBe("WITHIN");
    expect(wall(4_799_999, 200_002)).toBe("WOULD_CROSS");
    expect(wall(4_800_000, 0)).toBe("WOULD_CROSS");
  });

  // W3-8: the pause is durable. Nothing waits in memory: at the wall the call ends with the planned stop
  // RUN_MONTH_PAUSED (the runner releases the claim; the database keeps the debate paused until Continue).
  it("the runner records the pause once, with the planned work left, and ends the call with the planned stop", async () => {
    let state: "NONE" | "PAUSED" | "RESUMED" = "NONE";
    const pauses: Parameters<MonthPauseStore["recordPause"]>[0][] = [];
    const store: MonthPauseStore = {
      recordPause: async (input) => { pauses.push(input); state = "PAUSED"; return "RECORDED"; },
      readPause: async () => ({ state })
    };
    const pause = new MonthPause({ store });
    const seam: ProviderCostEnvelopeSeam = {
      assertCallAllowed: async () => { throw new MonthWallReachedError(month.resetsAt); },
      recordCall: async () => undefined, assertUsageReported: async () => undefined
    };
    expect(await outcome(withMonthPause(seam, "run-1", pause, async () => 1_234_567).assertCallAllowed(PROJECTION))).toBe(RUN_MONTH_PAUSED);
    expect(pauses).toEqual([{ runId: "run-1", reason: "MONTH_WALL", resumableAt: month.resetsAt, plannedCalls: 1, plannedSearches: 0,
      plannedMicros: 1_234_567 }]);
  });

  it("every later walled call of the paused debate ends at once, unasked and unrecorded", async () => {
    const recordPause = vi.fn(async () => "RECORDED" as const);
    const pause = new MonthPause({ store: { recordPause, readPause: async () => ({ state: "PAUSED" }) } });
    const asked = vi.fn(async () => undefined);
    const seam: ProviderCostEnvelopeSeam = { assertCallAllowed: asked, recordCall: async () => undefined, assertUsageReported: async () => undefined };
    expect(await outcome(withMonthPause(seam, "run-1", pause).assertCallAllowed(PROJECTION))).toBe(RUN_MONTH_PAUSED);
    expect(asked).not.toHaveBeenCalled();
    expect(recordPause).not.toHaveBeenCalled();
  });

  it("a debate that cannot be paused (no live private debate) ends with the month's own refusal, as before", async () => {
    const pause = new MonthPause({ store: { recordPause: async () => "NOT_LIVE", readPause: async () => null } });
    const seam: ProviderCostEnvelopeSeam = { assertCallAllowed: async () => { throw new MonthWallReachedError(month.resetsAt); },
      recordCall: async () => undefined, assertUsageReported: async () => undefined };
    expect(await outcome(withMonthPause(seam, "run-1", pause).assertCallAllowed(PROJECTION))).toBe("MONTH_WALL");
  });

  it("the planned work's estimate is clamped to 0134's bound, and an unreadable one records 0 with one content-free line", async () => {
    const recorded: number[] = [];
    const lines: string[] = [];
    const pause = new MonthPause({ log: (line) => lines.push(line), store: {
      recordPause: async (input) => { recorded.push(input.plannedMicros); return "RECORDED"; }, readPause: async () => ({ state: "NONE" }) } });
    const seam: ProviderCostEnvelopeSeam = { assertCallAllowed: async () => { throw new MonthWallReachedError(month.resetsAt); },
      recordCall: async () => undefined, assertUsageReported: async () => undefined };
    await outcome(withMonthPause(seam, "run-1", pause, async () => 5_000_000_000).assertCallAllowed(PROJECTION));
    await outcome(withMonthPause(seam, "run-1", pause, async () => { throw new TypedDomainError("RUN_SETTINGS_VERSION_UNKNOWN", "x"); })
      .assertCallAllowed(PROJECTION));
    expect(recorded).toEqual([1_000_000_000, 0]);
    expect(lines).toEqual([JSON.stringify({ kind: "DEBATEAI_MONTH_PAUSE", event: "PLANNED_MICROS_UNREAD", code: "RUN_SETTINGS_VERSION_UNKNOWN" })]);
  });

  it("the guard's body room left is its body ceiling less the run's spend, never below zero", async () => {
    const guardSpent = (spent: number) => new CostEnvelopeGuard({ policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000 },
      store: { recordSpend: async () => undefined, readRunSpentMicros: async () => spent, readRunStorySpentMicros: async () => 0,
        readDaySpentMicros: async () => 0, admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 }) } });
    expect(await guardSpent(0).bodyMicrosLeft("run-1")).toBe(250_000);
    expect(await guardSpent(100_000).bodyMicrosLeft("run-1")).toBe(150_000);
    expect(await guardSpent(300_000).bodyMicrosLeft("run-1")).toBe(0);
  });

  it("any other refusal passes through untouched and records no pause", async () => {
    const recordPause = vi.fn(async () => "RECORDED" as const);
    const pause = new MonthPause({ store: { recordPause, readPause: async () => ({ state: "NONE" }) } });
    const seam: ProviderCostEnvelopeSeam = { assertCallAllowed: async () => { throw new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "x"); },
      recordCall: async () => undefined, assertUsageReported: async () => undefined };
    expect(await outcome(withMonthPause(seam, "run-1", pause).assertCallAllowed(PROJECTION))).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(recordPause).not.toHaveBeenCalled();
  });
});

describe("Continue: refused before the reset, after it the debate resumes without paying twice", () => {
  const until = "2026-11-01T00:00:00.000Z";
  function pauses(state: "NONE" | "PAUSED" | "RESUMED" | null) {
    const resume = vi.fn(async () => "RECORDED" as const);
    const port: MonthPausePort = { readPause: async () => state === null ? null : { state, resumable_at: state === "PAUSED" ? until : null }, resume };
    return { port, resume };
  }
  const room = (has: boolean) => ({ monthHasRoom: vi.fn(async () => has) });

  it("before the reset: refused with the reset, nothing recorded", async () => {
    const { port, resume } = pauses("PAUSED");
    expect(await continuePausedRun({ ownerRef: OWNER, runId: "run-1", now: at("2026-10-31T23:59:59.000Z") }, port, room(true)))
      .toEqual({ kind: "UNTIL_RESET", until });
    expect(resume).not.toHaveBeenCalled();
    expect(monthPauseOf({ state: "PAUSED", resumable_at: until }, at("2026-10-31T23:59:59.000Z"), true)).toEqual({ until, can_continue: false });
  });

  it("after the reset, with room: CONTINUING, recorded once; the run read offers it", async () => {
    const { port, resume } = pauses("PAUSED");
    expect(await continuePausedRun({ ownerRef: OWNER, runId: "run-1", now: at("2026-11-01T00:00:01.000Z") }, port, room(true)))
      .toEqual({ kind: "CONTINUING" });
    expect(resume).toHaveBeenCalledTimes(1);
    expect(monthPauseOf({ state: "PAUSED", resumable_at: until }, at("2026-11-01T00:00:01.000Z"), true)).toEqual({ until, can_continue: true });
  });

  it("not paused, or not the person's: nothing to continue", async () => {
    expect((await continuePausedRun({ ownerRef: OWNER, runId: "r", now: at(until) }, pauses("NONE").port, room(true))).kind).toBe("NOT_PAUSED");
    expect((await continuePausedRun({ ownerRef: OWNER, runId: "r", now: at(until) }, pauses(null).port, room(true))).kind).toBe("NOT_FOUND");
  });

  it("W3-8: a second press is idempotent (CONTINUING, nothing recorded again), and each press wakes the debate's runner", async () => {
    const { port, resume } = pauses("RESUMED");
    const wake = vi.fn(async () => undefined);
    expect(await continuePausedRun({ ownerRef: OWNER, runId: "run-1", now: at(until) }, port, room(true), { wake }))
      .toEqual({ kind: "CONTINUING" });
    expect(resume).not.toHaveBeenCalled();
    expect(wake).toHaveBeenCalledWith("run-1");
  });
});

describe("the final-answer reserve is always left", () => {
  it("a paid month's new starts and its wall stop 20 cents short of the limit", async () => {
    const month = windowsOf("PRO", at("2026-10-20T12:00:00.000Z"))[2]!;
    expect(startLimitMicros(month)).toBe(month.limitMicros - 200_000);
    expect(decideMonthWall({ spentMicros: month.limitMicros - 200_000, projectedMicros: 0, limitMicros: month.limitMicros,
      keepsReserveMicros: month.keepsReserveMicros!, toleranceMicros: month.finishOverflowMicros! })).toBe("WOULD_CROSS");
  });

  it("the room is full at the reserve: a month with 19 cents left starts nothing new", async () => {
    const now = at("2026-10-20T12:00:00.000Z");
    const windows = (when: Date) => windowsOf("PLUS", when).filter((window) => window.scope === "PERSON_MONTH");
    const charges: Charge[] = [{ at: at("2026-10-19T12:00:00.000Z"), runId: "run-a", micros: 4_810_000 }];
    const answer = await roomWith({ plan: "PLUS", charges, now, windows }).readRoom(QUESTION);
    expect(answer).toMatchObject({ room: "FULL", scope: "PERSON_MONTH", newStarts: "BLOCKED_UNTIL_RESET", reserve: "KEPT" });
    expect(await roomWith({ plan: "PLUS", charges, now, windows }).monthHasRoom(OWNER, now)).toBe(false);
  });
});

describe("PATH_REWRITE is never walled", () => {
  it("a dig's rewrite is admitted with the month far past its wall, and is charged as PATH_REWRITE on the dig's run", async () => {
    const now = at("2026-10-20T12:00:00.000Z");
    const month = windowsOf("PLUS", now)[2]!;
    const recorded: ModelSpendEntry[] = [];
    const guard = guardOver({ now, spentByStart: new Map([[month.periodStart.getTime(), 9 * month.limitMicros]]), recorded });
    const seam = guard.pathRewriteSeam({ runId: "dig-run", price: PRICE, requireReportedUsage: true });
    const admission = await seam.assertCallAllowed(PROJECTION);
    await seam.recordCall({ providerRef: "anthropic:haiku", usage: { prompt_tokens: 10, completion_tokens: 5 }, projection: PROJECTION,
      ...(admission === undefined ? {} : { admission }) });
    expect(recorded.map((entry) => [entry.spendSource, entry.runId, entry.chargeMicros])).toEqual([["PATH_REWRITE", "dig-run", 15]]);
    // The same month refuses a call while arguing.
    expect(await outcome(bodyCall(guard))).toBe("MONTH_WALL");
  });

  it("the gateway's story scope accepts the rewrite's writer and checker sites with their roles, and nothing else", () => {
    const ask = (lane: "story" | "served", callSiteKey: string, role: "SYNTHESIZER" | "EVALUATOR") =>
      storyCallScopeAgrees({ lane, callSiteKey, role } as Parameters<typeof storyCallScopeAgrees>[0]);
    for (const round of [1, 2, 3, 4]) {
      expect(ask("story", `PATH_REWRITE:WRITER:${round}`, "SYNTHESIZER"), `writer ${round}`).toBe(true);
      expect(ask("story", `PATH_REWRITE:CHECKER:${round}`, "EVALUATOR"), `checker ${round}`).toBe(true);
    }
    expect(ask("story", "PATH_REWRITE:WRITER:1", "EVALUATOR")).toBe(false);
    expect(ask("story", "PATH_REWRITE:WRITER:5", "SYNTHESIZER")).toBe(false);
    expect(ask("story", "PATH_REWRITE:EDITOR:1", "SYNTHESIZER")).toBe(false);
    // A rewrite site on the debate's lane would bill the rewrite to the debate's arguing: refused.
    expect(ask("served", "PATH_REWRITE:WRITER:1", "SYNTHESIZER")).toBe(false);
    expect(ask("story", "STORY:STORYTELLER:1", "SYNTHESIZER")).toBe(true);
  });

  it("the person's windows count it: the owner spend reader reads RUN, STORY and PATH_REWRITE", async () => {
    const texts: string[] = [];
    const pool = { query: async (text: string, values: unknown[]) => {
      texts.push(text);
      return { rows: Array.isArray(values[1]) ? (values[1] as unknown[]).map((_v, index) => ({ ordinal: String(index + 1), total: "0" })) : [{ total: "0" }] };
    } } as unknown as Pool;
    const store = new PostgresModelSpendStore(pool);
    await store.readOwnerSpentMicros(OWNER, at("2026-10-01T00:00:00.000Z"), at("2026-10-02T00:00:00.000Z"));
    await store.readOwnerSpentInRangesMicros(OWNER, [{ from: at("2026-10-01T00:00:00.000Z"), to: at("2026-10-02T00:00:00.000Z") }]);
    await store.readOwnerChargesMicros(OWNER, at("2026-10-01T00:00:00.000Z"), at("2026-10-02T00:00:00.000Z"));
    expect(texts).toHaveLength(3);
    for (const text of texts) expect(text).toContain("spend.spend_source IN ('RUN','STORY','PATH_REWRITE')");
  });
});

describe("the cross-month switch, both ways", () => {
  // 31 Oct: a running debate used 1.3 of the 1.0 day, the last day of the month (anchor 1 Oct).
  const charges: Charge[] = [{ at: at("2026-10-31T20:00:00.000Z"), runId: "run-a", micros: 1_300_000 }];

  it.each([[false, 0], [true, 300_000]] as const)("carries %s: the new month's first day starts %i lower", async (carries, borrowed) => {
    const windows = windowsOf("PLUS", at("2026-11-01T06:00:00.000Z"));
    const borrow = await readWindowBorrow({ ownerRef: OWNER, window: windows[0]!, month: windows[2]!, spend: ledger(charges),
      allowance: allowanceOf("PLUS"), carriesAcrossMonth: carries });
    expect(borrow.borrowedMicros).toBe(borrowed);
  });

  it.each([[false, false], [true, true]] as const)("carries %s: the last day's notice of tomorrow's allowance is %s", async (carries, notice) => {
    const windows = windowsOf("PLUS", at("2026-10-31T22:00:00.000Z"));
    const borrow = await readWindowBorrow({ ownerRef: OWNER, window: windows[0]!, month: windows[2]!, spend: ledger(charges),
      allowance: allowanceOf("PLUS"), carriesAcrossMonth: carries });
    expect(borrow).toMatchObject({ overMicros: 300_000, notice });
  });
});
