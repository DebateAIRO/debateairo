import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  BillingPersonAllowanceSource, monthCreditInForce, personWindowsInForce, type PlanId, type PlansInForcePort
} from "@debateai/billing-core";
import { decideMonthWall, decideRoom, startLimitMicros, type PersonWindow } from "@debateai/budget";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, createBillingPlansInForce, settingsVersionsServedBetween,
  type BillingPlans, type ReleaseSwitch
} from "@debateai/register";
import { readWindowBorrow, type AskRoomSpend } from "../../apps/api/src/ask-room.js";

/**
 * A month keeps the plan numbers it started with (owner, 19 November 2026): a limit lowered by an upload reaches a
 * person from their next month, a higher one at once. Every amount here is made up (multiples of eleven).
 */
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const at = (iso: string): Date => new Date(iso);
/** The person's month starts on 1 October; the upload that changes the numbers takes the traffic on 11 October. */
const MONTH_START = at("2026-10-01T00:00:00.000Z");
const UPLOAD = at("2026-10-11T00:00:00.000Z");

type Numbers = Readonly<{ credit?: number; dayBp?: number; weekBp?: number; reserve?: number; overflow?: number; freeCredit?: number }>;

/** The development row's plans with PLUS's (and Free's) numbers replaced; the other plans are left as they are. */
function valueWith(numbers: Numbers): unknown {
  const row = BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value;
  return {
    ...row,
    plans: row.plans.map((plan) => plan.plan_id === "PLUS"
      ? {
        ...plan, monthly_credit_micros: numbers.credit ?? 1_100_000, day_bp: numbers.dayBp ?? 1_100, week_bp: numbers.weekBp ?? 9_900,
        reserve_micros: numbers.reserve ?? 44_000, finish_overflow_micros: numbers.overflow ?? 22_000
      }
      : plan.plan_id === "FREE" ? { ...plan, monthly_credit_micros: numbers.freeCredit ?? 330_000, finish_overflow_micros: numbers.overflow ?? 22_000 }
        : { ...plan, finish_overflow_micros: numbers.overflow ?? 22_000 })
  };
}
const plansWith = (numbers: Numbers = {}): BillingPlans => billingPlansFromValue(valueWith(numbers), "test:made-up");

/** A database that answers the two reads `createBillingPlansInForce` makes, and counts them. */
function recordOf(switches: ReadonlyArray<readonly [version: number, from: Date]>, rows: ReadonlyMap<number, unknown>) {
  const asked: string[] = [];
  const pool = {
    query: async (sql: string, parameters: readonly unknown[] = []) => {
      if (sql.includes("core.read_release_history()")) {
        asked.push("switches");
        return { rows: switches.map(([version, from]) => ({ release_key: `r${version}-0123456789ab`, take_traffic_from: from })) };
      }
      const version = Number(parameters[0]);
      asked.push(`plans:${version}`);
      return { rows: rows.has(version) ? [{ value_json: rows.get(version), source_ref: `test:v${version}` }] : [] };
    }
  } as unknown as Pool;
  return { pool, asked };
}

/**
 * The site served version 7 from long before the month, and version 8 from the upload. This process runs version 8,
 * so `after` are its own plans.
 */
function served(before: Numbers, after: Numbers): Readonly<{ own: BillingPlans; plansInForce: PlansInForcePort }> {
  const own = plansWith(after);
  const record = recordOf([[7, at("2026-06-01T00:00:00.000Z")], [8, UPLOAD]], new Map([[7, valueWith(before)]]));
  return { own, plansInForce: createBillingPlansInForce({ pool: record.pool, ownVersion: 8, ownPlans: own }) };
}

function allowance(input: Readonly<{ own: BillingPlans; plansInForce?: PlansInForcePort; planId?: PlanId; anchor?: Date }>) {
  return new BillingPersonAllowanceSource({
    entitlements: { current: async () => ({ planId: input.planId ?? "PLUS", periodAnchorAt: input.anchor ?? MONTH_START, monthCreditOverrideMicros: null }) },
    plans: input.own, closeBasisPoints: 9_500,
    ...(input.plansInForce === undefined ? {} : { plansInForce: input.plansInForce })
  });
}
const limitOf = (windows: ReadonlyArray<PersonWindow>, scope: PersonWindow["scope"]): number =>
  windows.find((window) => window.scope === scope)!.limitMicros;

type Charge = Readonly<{ at: Date; micros: number }>;
function ledger(charges: readonly Charge[]): Pick<AskRoomSpend, "readOwnerSpentMicros" | "readOwnerSpentInRangesMicros"> {
  const sum = (from: Date, to: Date) => charges.filter((charge) => charge.at >= from && charge.at < to)
    .reduce((total, charge) => total + charge.micros, 0);
  return {
    readOwnerSpentMicros: async (_owner, from, to) => sum(from, to),
    readOwnerSpentInRangesMicros: async (_owner, ranges) => ranges.map((range) => sum(range.from, range.to))
  };
}

describe("which settings versions the site served over a span", () => {
  const switches: ReleaseSwitch[] = [
    { siteVersion: 7, takeTrafficFrom: at("2026-06-01T00:00:00.000Z") },
    { siteVersion: 8, takeTrafficFrom: UPLOAD },
    // A way back to the older release, two days later.
    { siteVersion: 7, takeTrafficFrom: at("2026-10-13T00:00:00.000Z") }
  ];

  it("names the version served at the start, then each one that took the traffic inside the span", () => {
    expect(settingsVersionsServedBetween(switches, MONTH_START, at("2026-10-05T00:00:00.000Z"))).toEqual([7]);
    expect(settingsVersionsServedBetween(switches, MONTH_START, at("2026-10-12T00:00:00.000Z"))).toEqual([7, 8]);
    // A switch at the very instant the span ends counts, and one at the very instant it starts is the starting version.
    expect(settingsVersionsServedBetween(switches, MONTH_START, UPLOAD)).toEqual([7, 8]);
    expect(settingsVersionsServedBetween(switches, UPLOAD, at("2026-10-12T00:00:00.000Z"))).toEqual([8]);
  });

  it("lists a version served twice once, and ends with the one served last", () => {
    expect(settingsVersionsServedBetween(switches, MONTH_START, at("2026-10-20T00:00:00.000Z"))).toEqual([8, 7]);
  });

  it("gives an instant from before the first recorded switch that switch's version, and nothing when none was recorded", () => {
    expect(settingsVersionsServedBetween(switches, at("2026-01-01T00:00:00.000Z"), at("2026-02-01T00:00:00.000Z"))).toEqual([7]);
    expect(settingsVersionsServedBetween([], MONTH_START, UPLOAD)).toEqual([]);
  });

  it("refuses a span that ends before it starts", () => {
    expect(() => settingsVersionsServedBetween(switches, UPLOAD, MONTH_START))
      .toThrowError(expect.objectContaining({ code: "BILLING_PLANS_SPAN_INVALID" }));
  });
});

describe("the plans the site served, read from the database", () => {
  it("reads each other version's row once, never its own, and the switches at most once in fifteen seconds", async () => {
    const own = plansWith({ dayBp: 550 });
    const record = recordOf([[7, at("2026-06-01T00:00:00.000Z")], [8, UPLOAD]], new Map([[7, valueWith({})]]));
    let now = at("2026-10-12T00:00:00.000Z");
    const plansInForce = createBillingPlansInForce({ pool: record.pool, ownVersion: 8, ownPlans: own, clock: () => now });
    const both = await plansInForce.between(MONTH_START, now);
    expect(both.map((plans) => plans.plans[1]!.dayBasisPoints)).toEqual([1_100, 550]);
    expect(both[1]).toBe(own);
    await plansInForce.between(MONTH_START, now);
    expect(record.asked).toEqual(["switches", "plans:7"]);
    now = new Date(now.getTime() + 15_000);
    await plansInForce.between(MONTH_START, now);
    expect(record.asked).toEqual(["switches", "plans:7", "switches"]);
  });

  it("answers its own plans when no switch was ever recorded, as in development", async () => {
    const own = plansWith();
    const record = recordOf([], new Map());
    expect(await createBillingPlansInForce({ pool: record.pool, ownVersion: 8, ownPlans: own }).between(MONTH_START, UPLOAD)).toEqual([own]);
  });

  it("answers its own plans on a database that does not have the reader yet, and lets any other database error through", async () => {
    const own = plansWith();
    const failing = (code: string) => createBillingPlansInForce({
      pool: { query: async () => { throw Object.assign(new Error("database"), { code }); } } as unknown as Pool, ownVersion: 8, ownPlans: own
    });
    expect(await failing("42883").between(MONTH_START, UPLOAD)).toEqual([own]);
    await expect(failing("57014").between(MONTH_START, UPLOAD)).rejects.toMatchObject({ code: "57014" });
  });

  it("leaves out a version that sealed no plans row, or a row this code cannot read, and falls back to its own plans", async () => {
    const own = plansWith();
    // Version 5 sealed no plans; version 6's row is of a shape this code does not know.
    const record = recordOf([[5, at("2026-01-01T00:00:00.000Z")], [6, at("2026-02-01T00:00:00.000Z")], [8, UPLOAD]],
      new Map([[6, { kind: "BILLING_PLANS", something: "newer" }]]));
    const plansInForce = createBillingPlansInForce({ pool: record.pool, ownVersion: 8, ownPlans: own });
    expect(await plansInForce.between(at("2026-01-15T00:00:00.000Z"), at("2026-03-01T00:00:00.000Z"))).toEqual([own]);
    expect(await plansInForce.between(at("2026-01-15T00:00:00.000Z"), at("2026-10-12T00:00:00.000Z"))).toEqual([own]);
  });
});

describe("effect 1: a lower day cap is not counted over days already used", () => {
  // The day cap is 121,000 when the month starts. The person uses 99,000 on each of its first ten days: never over.
  const charges: Charge[] = Array.from({ length: 10 }, (_, day) => ({ at: new Date(MONTH_START.getTime() + day * 86_400_000 + 3_600_000), micros: 99_000 }));
  const now = at("2026-10-11T12:00:00.000Z");
  // The upload of 11 October makes the cap 60,500.
  const site = served({ dayBp: 1_100 }, { dayBp: 550 });

  it("the plans of today alone would make every past day 38,500 over, and today would start 385,000 lower", async () => {
    const source = allowance({ own: site.own });
    const windows = await source.read(OWNER, now);
    expect(limitOf(windows, "PERSON_DAY")).toBe(60_500);
    const borrow = await readWindowBorrow({ ownerRef: OWNER, window: windows[0]!, month: windows[2]!, spend: ledger(charges), allowance: source });
    expect(borrow.borrowedMicros).toBe(385_000);
  });

  it("the month keeps the cap it started with, so no past day is over and today starts whole", async () => {
    const source = allowance(site);
    const windows = await source.read(OWNER, now);
    expect(limitOf(windows, "PERSON_DAY")).toBe(121_000);
    const borrow = await readWindowBorrow({ ownerRef: OWNER, window: windows[0]!, month: windows[2]!, spend: ledger(charges), allowance: source });
    expect(borrow).toMatchObject({ borrowedMicros: 0, overMicros: 0, notice: false });
  });

  it("the lower cap reaches the person when their next month starts", async () => {
    expect(limitOf(await allowance(site).read(OWNER, at("2026-10-31T23:59:59.000Z")), "PERSON_DAY")).toBe(121_000);
    expect(limitOf(await allowance(site).read(OWNER, at("2026-11-01T00:00:00.000Z")), "PERSON_DAY")).toBe(60_500);
  });

  it("someone who buys the plan after the upload has the new cap from their first day", async () => {
    const bought = at("2026-10-15T09:00:00.000Z");
    expect(limitOf(await allowance({ ...site, anchor: bought }).read(OWNER, at("2026-10-16T00:00:00.000Z")), "PERSON_DAY")).toBe(60_500);
  });

  it("the week cap is kept the same way", async () => {
    const weekly = served({ weekBp: 9_900 }, { weekBp: 4_400 });
    expect(limitOf(await allowance(weekly).read(OWNER, now), "PERSON_WEEK")).toBe(1_089_000);
    expect(limitOf(await allowance(weekly).read(OWNER, at("2026-11-02T00:00:00.000Z")), "PERSON_WEEK")).toBe(484_000);
  });
});

describe("a higher cap reaches a month at once, and the days before it keep their own number", () => {
  // The upload of 11 October doubles the day cap, 121,000 to 242,000.
  const site = served({ dayBp: 1_100 }, { dayBp: 2_200 });

  it("the cap is the old one before the upload and the new one from it", async () => {
    expect(limitOf(await allowance(site).read(OWNER, at("2026-10-10T12:00:00.000Z")), "PERSON_DAY")).toBe(121_000);
    expect(limitOf(await allowance(site).read(OWNER, at("2026-10-11T12:00:00.000Z")), "PERSON_DAY")).toBe(242_000);
  });

  it("what a running debate used past the old cap on 10 October is still borrowed from 11 October", async () => {
    const source = allowance(site);
    const windows = await source.read(OWNER, at("2026-10-11T12:00:00.000Z"));
    const borrow = await readWindowBorrow({
      ownerRef: OWNER, window: windows[0]!, month: windows[2]!, allowance: source,
      spend: ledger([{ at: at("2026-10-10T20:00:00.000Z"), micros: 154_000 }])
    });
    // 154,000 used against the 121,000 of that day, never against a cap that did not exist yet.
    expect(borrow.borrowedMicros).toBe(33_000);
  });

  it("a way back to the older release does not take the higher cap from a month that already had it", async () => {
    // Version 8 (242,000) took the traffic on 11 October; on 13 October the site went back to version 7 (121,000).
    const own = plansWith({ dayBp: 1_100 });
    const record = recordOf([[7, at("2026-06-01T00:00:00.000Z")], [8, UPLOAD], [7, at("2026-10-13T00:00:00.000Z")]],
      new Map([[8, valueWith({ dayBp: 2_200 })]]));
    const site = { own, plansInForce: createBillingPlansInForce({ pool: record.pool, ownVersion: 7, ownPlans: own }) };
    expect(limitOf(await allowance(site).read(OWNER, at("2026-10-14T12:00:00.000Z")), "PERSON_DAY")).toBe(242_000);
    // A month that starts after the way back never saw the higher cap.
    expect(limitOf(await allowance(site).read(OWNER, at("2026-11-01T12:00:00.000Z")), "PERSON_DAY")).toBe(121_000);
  });
});

describe("effect 2: a lower month credit does not stop a month already started", () => {
  // The month credit is 1,100,000 when the month starts; the upload of 11 October makes it 550,000. The person has used 660,000.
  const site = served({ credit: 1_100_000 }, { credit: 550_000 });
  const now = at("2026-10-12T12:00:00.000Z");
  const usedMicros = 660_000;
  const monthOf = async (source: BillingPersonAllowanceSource, when: Date) => (await source.read(OWNER, when)).find((window) => window.scope === "PERSON_MONTH")!;
  const roomIn = (month: PersonWindow) => decideRoom({ usedMicros, estimateMicros: 11_000, limitMicros: startLimitMicros(month), closeBasisPoints: 9_500 });
  const wallIn = (month: PersonWindow) => decideMonthWall({
    spentMicros: usedMicros, projectedMicros: 11_000, limitMicros: month.limitMicros,
    keepsReserveMicros: month.keepsReserveMicros ?? 0, toleranceMicros: month.finishOverflowMicros ?? 0
  });

  it("the plans of today alone would make new questions wait and pause a running debate", async () => {
    const month = await monthOf(allowance({ own: site.own }), now);
    expect([month.limitMicros, roomIn(month), wallIn(month)]).toEqual([550_000, "FULL", "WOULD_CROSS"]);
  });

  it("the month keeps the credit it started with: new questions start and the running debate goes on", async () => {
    const month = await monthOf(allowance(site), now);
    expect([month.limitMicros, roomIn(month), wallIn(month)]).toEqual([1_100_000, "FITS", "WITHIN"]);
  });

  it("the next month has the lower credit, and a higher credit would have reached this month at once", async () => {
    expect((await monthOf(allowance(site), at("2026-11-01T00:00:00.000Z"))).limitMicros).toBe(550_000);
    const raised = served({ credit: 1_100_000 }, { credit: 2_200_000 });
    expect((await monthOf(allowance(raised), at("2026-10-10T12:00:00.000Z"))).limitMicros).toBe(1_100_000);
    expect((await monthOf(allowance(raised), now)).limitMicros).toBe(2_200_000);
  });

  it("Free follows the same rule, from the account's own day of the month", async () => {
    const free = served({ freeCredit: 330_000 }, { freeCredit: 220_000 });
    const source = allowance({ ...free, planId: "FREE", anchor: at("2026-10-03T08:00:00.000Z") });
    expect((await source.read(OWNER, now)).map((window) => [window.scope, window.limitMicros])).toEqual([["PERSON_MONTH", 330_000]]);
    expect(limitOf(await source.read(OWNER, at("2026-11-03T08:00:00.000Z")), "PERSON_MONTH")).toBe(220_000);
  });
});

describe("the reserve and the finish room of a month already started", () => {
  const now = at("2026-10-12T12:00:00.000Z");
  const monthOf = async (site: Readonly<{ own: BillingPlans; plansInForce: PlansInForcePort }>) =>
    (await allowance(site).read(OWNER, now)).find((window) => window.scope === "PERSON_MONTH")!;

  it("a reserve raised by an upload does not make new questions stop earlier in that month", async () => {
    const month = await monthOf(served({ reserve: 44_000 }, { reserve: 55_000 }));
    expect([month.keepsReserveMicros, startLimitMicros(month)]).toEqual([44_000, 1_056_000]);
  });

  it("a lower reserve and a larger finish room reach the month at once", async () => {
    expect((await monthOf(served({ reserve: 44_000 }, { reserve: 33_000 }))).keepsReserveMicros).toBe(33_000);
    expect((await monthOf(served({ overflow: 22_000 }, { overflow: 33_000 }))).finishOverflowMicros).toBe(33_000);
    expect((await monthOf(served({ overflow: 22_000 }, { overflow: 11_000 }))).finishOverflowMicros).toBe(22_000);
  });

  it("an upgrade's stored month credit still wins, and the day cap never passes it", () => {
    const windows = personWindowsInForce([plansWith({ dayBp: 1_100 }), plansWith({ dayBp: 9_900 })], "PLUS", MONTH_START, now, 9_500, 770_000);
    expect(windows.map((window) => window.limitMicros)).toEqual([770_000, 770_000, 770_000]);
  });

  it("refuses an empty list of plans", () => {
    expect(() => monthCreditInForce([], "PLUS")).toThrowError("BILLING_PLANS_IN_FORCE_EMPTY");
  });
});

describe("effect 3: the credit a refund is measured against", () => {
  it("is the one the month started with when the credit was lowered since, and the higher one when it was raised", () => {
    expect(monthCreditInForce([plansWith({ credit: 1_100_000 }), plansWith({ credit: 550_000 })], "PLUS")).toBe(1_100_000);
    expect(monthCreditInForce([plansWith({ credit: 1_100_000 }), plansWith({ credit: 2_200_000 })], "PLUS")).toBe(2_200_000);
  });

  it("for a withdrawal dated before the upload, no later version is asked about at all", async () => {
    const site = served({ credit: 1_100_000 }, { credit: 2_200_000 });
    const withdrewAt = at("2026-10-09T10:00:00.000Z");
    expect(monthCreditInForce(await site.plansInForce.between(MONTH_START, withdrewAt), "PLUS")).toBe(1_100_000);
  });
});
