import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { allowanceVsPlus, computeWindows, personWindowsFor } from "@debateai/billing-core";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW,
  billingPlansFromValue,
  planById,
  planCapMicros,
  type PlanId
} from "@debateai/register";

/**
 * PAID PLANS (spec 2026-09-29 §2.4.1, §2.4.3; R1 A6). All in UTC.
 *  - The month runs from the last anchor day-of-month at or before now; a day
 *    past a month's end is clamped to its last day.
 *  - The week is a 7-day block counted from the month start; the last block
 *    may be shorter.
 *  - The day is a 24-hour block counted from the month start.
 * Starts are inclusive and ends exclusive, so windows never overlap or leave a
 * gap (Review Focus 4).
 */
const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);
const span = (window: { start: Date; end: Date }) => [window.start.toISOString(), window.end.toISOString()];
const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);

describe("computeWindows: the month from the anchor day", () => {
  it("reads a mid-month anchor", () => {
    const windows = computeWindows(at("2026-01-15T10:00:00.000Z"), at("2026-03-20T12:00:00.000Z"));
    expect(span(windows.month)).toEqual(["2026-03-15T10:00:00.000Z", "2026-04-15T10:00:00.000Z"]);
    expect(span(windows.week)).toEqual(["2026-03-15T10:00:00.000Z", "2026-03-22T10:00:00.000Z"]);
    expect(span(windows.day)).toEqual(["2026-03-20T10:00:00.000Z", "2026-03-21T10:00:00.000Z"]);
  });

  it("clamps a day-31 anchor to a 28-day February, then returns to the 31st", () => {
    const anchor = at("2026-01-31T08:00:00.000Z");
    const early = computeWindows(anchor, at("2026-02-10T00:00:00.000Z"));
    expect(span(early.month)).toEqual(["2026-01-31T08:00:00.000Z", "2026-02-28T08:00:00.000Z"]);
    expect(span(early.week)).toEqual(["2026-02-07T08:00:00.000Z", "2026-02-14T08:00:00.000Z"]);
    expect(span(early.day)).toEqual(["2026-02-09T08:00:00.000Z", "2026-02-10T08:00:00.000Z"]);
    const lastInstant = computeWindows(anchor, at("2026-02-28T07:59:59.999Z"));
    expect(span(lastInstant.month)).toEqual(["2026-01-31T08:00:00.000Z", "2026-02-28T08:00:00.000Z"]);
    expect(span(lastInstant.week)).toEqual(["2026-02-21T08:00:00.000Z", "2026-02-28T08:00:00.000Z"]);
    expect(span(lastInstant.day)).toEqual(["2026-02-27T08:00:00.000Z", "2026-02-28T08:00:00.000Z"]);
    const boundary = computeWindows(anchor, at("2026-02-28T08:00:00.000Z"));
    expect(span(boundary.month)).toEqual(["2026-02-28T08:00:00.000Z", "2026-03-31T08:00:00.000Z"]);
    expect(span(boundary.week)).toEqual(["2026-02-28T08:00:00.000Z", "2026-03-07T08:00:00.000Z"]);
    expect(span(boundary.day)).toEqual(["2026-02-28T08:00:00.000Z", "2026-03-01T08:00:00.000Z"]);
  });

  it("clamps a day-31 anchor to a 30-day April, with a shorter last week", () => {
    const anchor = at("2026-01-31T08:00:00.000Z");
    const late = computeWindows(anchor, at("2026-04-30T07:00:00.000Z"));
    expect(span(late.month)).toEqual(["2026-03-31T08:00:00.000Z", "2026-04-30T08:00:00.000Z"]);
    expect(span(late.week)).toEqual(["2026-04-28T08:00:00.000Z", "2026-04-30T08:00:00.000Z"]);
    expect(span(computeWindows(anchor, at("2026-04-30T09:00:00.000Z")).month))
      .toEqual(["2026-04-30T08:00:00.000Z", "2026-05-31T08:00:00.000Z"]);
  });

  it("uses 29 February in a leap year and 28 February otherwise", () => {
    const leap = computeWindows(at("2028-01-31T00:00:00.000Z"), at("2028-02-29T00:00:00.000Z"));
    expect(span(leap.month)).toEqual(["2028-02-29T00:00:00.000Z", "2028-03-31T00:00:00.000Z"]);
    const leapLast = computeWindows(at("2028-01-31T00:00:00.000Z"), at("2028-02-28T23:59:59.999Z"));
    expect(span(leapLast.month)).toEqual(["2028-01-31T00:00:00.000Z", "2028-02-29T00:00:00.000Z"]);
    expect(span(leapLast.week)).toEqual(["2028-02-28T00:00:00.000Z", "2028-02-29T00:00:00.000Z"]);
    expect(span(computeWindows(at("2027-01-29T12:00:00.000Z"), at("2027-03-01T00:00:00.000Z")).month))
      .toEqual(["2027-02-28T12:00:00.000Z", "2027-03-29T12:00:00.000Z"]);
    expect(span(computeWindows(at("2028-01-29T12:00:00.000Z"), at("2028-03-01T00:00:00.000Z")).month))
      .toEqual(["2028-02-29T12:00:00.000Z", "2028-03-29T12:00:00.000Z"]);
  });

  it.each([
    ["2026-01-01T00:00:00.000Z", 31, 3],
    ["2026-02-01T00:00:00.000Z", 28, 7],
    ["2028-02-01T00:00:00.000Z", 29, 1],
    ["2026-04-01T00:00:00.000Z", 30, 2]
  ] as const)("a month anchored %s has %d days and a last week block of %d days", (anchorIso, days, lastWeekDays) => {
    const anchor = at(anchorIso);
    const first = computeWindows(anchor, anchor);
    expect((first.month.end.getTime() - first.month.start.getTime()) / DAY).toBe(days);
    const last = computeWindows(anchor, new Date(first.month.end.getTime() - 1));
    expect(last.month.start.toISOString()).toBe(anchorIso);
    expect((last.week.end.getTime() - last.week.start.getTime()) / DAY).toBe(lastWeekDays);
    expect(last.week.end.getTime()).toBe(first.month.end.getTime());
  });

  it("rolls over the year", () => {
    const windows = computeWindows(at("2025-12-31T23:00:00.000Z"), at("2026-01-05T00:00:00.000Z"));
    expect(span(windows.month)).toEqual(["2025-12-31T23:00:00.000Z", "2026-01-31T23:00:00.000Z"]);
  });

  it("puts an instant exactly on a boundary in the NEW block", () => {
    const anchor = at("2026-01-01T00:00:00.000Z");
    expect(span(computeWindows(anchor, at("2026-01-08T00:00:00.000Z")).week))
      .toEqual(["2026-01-08T00:00:00.000Z", "2026-01-15T00:00:00.000Z"]);
    expect(span(computeWindows(anchor, at("2026-01-07T23:59:59.999Z")).week))
      .toEqual(["2026-01-01T00:00:00.000Z", "2026-01-08T00:00:00.000Z"]);
    expect(span(computeWindows(anchor, at("2026-01-02T00:00:00.000Z")).day))
      .toEqual(["2026-01-02T00:00:00.000Z", "2026-01-03T00:00:00.000Z"]);
    expect(span(computeWindows(anchor, at("2026-02-01T00:00:00.000Z")).month))
      .toEqual(["2026-02-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z"]);
  });

  it.each(["2026-03-01T01:30:00.000Z", "2026-10-01T01:30:00.000Z"])(
    "ignores daylight saving: every day of the month from %s is exactly 24 hours",
    (anchorIso) => {
      const anchor = at(anchorIso);
      const month = computeWindows(anchor, anchor).month;
      for (let instant = month.start.getTime(); instant < month.end.getTime(); instant += 3_600_000) {
        const day = computeWindows(anchor, new Date(instant)).day;
        expect(day.end.getTime() - day.start.getTime()).toBe(DAY);
        expect([day.start.getUTCHours(), day.start.getUTCMinutes()]).toEqual([1, 30]);
      }
    }
  );

  it("tiles every anchor day 1-31 across 14 months with no gap and no overlap, and nests day in week in month", () => {
    for (let anchorDay = 1; anchorDay <= 31; anchorDay += 1) {
      const anchor = new Date(Date.UTC(2027, 0, anchorDay, 13, 37));
      let month = computeWindows(anchor, anchor).month;
      for (let step = 0; step < 14; step += 1) {
        const next = computeWindows(anchor, month.end).month;
        expect(next.start.getTime()).toBe(month.end.getTime());
        const lastDay = new Date(Date.UTC(next.start.getUTCFullYear(), next.start.getUTCMonth() + 1, 0)).getUTCDate();
        expect(next.start.getUTCDate()).toBe(Math.min(anchorDay, lastDay));
        if (step < 3) {
          for (let instant = month.start.getTime(); instant < month.end.getTime(); instant += 6 * 3_600_000) {
            const windows = computeWindows(anchor, new Date(instant));
            expect(windows.month.start.getTime()).toBe(month.start.getTime());
            expect(windows.week.start.getTime()).toBeGreaterThanOrEqual(windows.month.start.getTime());
            expect(windows.day.start.getTime()).toBeGreaterThanOrEqual(windows.week.start.getTime());
            expect(windows.day.start.getTime()).toBeLessThanOrEqual(instant);
            expect(instant).toBeLessThan(windows.day.end.getTime());
            expect(windows.day.end.getTime()).toBeLessThanOrEqual(windows.week.end.getTime());
            expect(windows.week.end.getTime()).toBeLessThanOrEqual(windows.month.end.getTime());
          }
        }
        month = next;
      }
    }
  });

  it("follows an anchor on 29 February through the next, 28-day February and back to the 29th (Review Focus 4)", () => {
    const anchor = at("2028-02-29T12:00:00.000Z");
    let month = computeWindows(anchor, anchor).month;
    const starts: string[] = [month.start.toISOString()];
    for (let step = 0; step < 13; step += 1) {
      for (let instant = month.start.getTime(); instant < month.end.getTime(); instant += 6 * 3_600_000) {
        const windows = computeWindows(anchor, new Date(instant));
        expect(windows.month.start.getTime()).toBe(month.start.getTime());
        expect(windows.month.end.getTime()).toBe(month.end.getTime());
        expect(windows.week.start.getTime()).toBeGreaterThanOrEqual(month.start.getTime());
        expect(windows.week.end.getTime()).toBeLessThanOrEqual(month.end.getTime());
        expect(windows.day.start.getTime()).toBeGreaterThanOrEqual(windows.week.start.getTime());
        expect(windows.day.end.getTime()).toBeLessThanOrEqual(windows.week.end.getTime());
        expect(windows.day.start.getTime()).toBeLessThanOrEqual(instant);
        expect(instant).toBeLessThan(windows.day.end.getTime());
      }
      const next = computeWindows(anchor, month.end).month;
      expect(next.start.getTime()).toBe(month.end.getTime());
      starts.push(next.start.toISOString());
      month = next;
    }
    expect(starts).toEqual([
      "2028-02-29T12:00:00.000Z", "2028-03-29T12:00:00.000Z", "2028-04-29T12:00:00.000Z", "2028-05-29T12:00:00.000Z",
      "2028-06-29T12:00:00.000Z", "2028-07-29T12:00:00.000Z", "2028-08-29T12:00:00.000Z", "2028-09-29T12:00:00.000Z",
      "2028-10-29T12:00:00.000Z", "2028-11-29T12:00:00.000Z", "2028-12-29T12:00:00.000Z", "2029-01-29T12:00:00.000Z",
      "2029-02-28T12:00:00.000Z", "2029-03-29T12:00:00.000Z"
    ]);
  });

  it("refuses an instant before the anchor, and an invalid date", () => {
    expect(() => computeWindows(at("2026-02-01T00:00:00.000Z"), at("2026-01-31T23:59:59.999Z")))
      .toThrowError(expect.objectContaining({ code: "BILLING_WINDOW_BEFORE_ANCHOR" }));
    expect(() => computeWindows(new Date(Number.NaN), at("2026-01-01T00:00:00.000Z")))
      .toThrowError(expect.objectContaining({ code: "BILLING_WINDOW_INPUT_INVALID" }));
  });
});

describe("personWindowsFor: the plan's limits over those windows", () => {
  const anchor = at("2026-01-15T10:00:00.000Z");
  const now = at("2026-03-20T12:00:00.000Z");

  it("gives a paid plan a day, a week and a month, each with the plan's finish edge and the site's close edge", () => {
    const windows = personWindowsFor(planById(plans, "PLUS"), anchor, now, 9_500);
    expect(windows.map((window) => [window.scope, window.limitMicros])).toEqual([
      ["PERSON_DAY", 1_000_000], ["PERSON_WEEK", 2_500_000], ["PERSON_MONTH", 5_000_000]
    ]);
    const computed = computeWindows(anchor, now);
    expect(windows[0]).toMatchObject({ periodStart: computed.day.start, resetsAt: computed.day.end, finishBasisPoints: 11_000, closeBasisPoints: 9_500 });
    expect(windows[1]).toMatchObject({ periodStart: computed.week.start, resetsAt: computed.week.end });
    expect(windows[2]).toMatchObject({ periodStart: computed.month.start, resetsAt: computed.month.end });
  });

  it("gives Free only its month", () => {
    expect(personWindowsFor(planById(plans, "FREE"), anchor, now, 9_500).map((window) => [window.scope, window.limitMicros]))
      .toEqual([["PERSON_MONTH", 200_000]]);
  });

  it("uses a prorated month credit after an upgrade, and never lets a day or week cap exceed it (A6)", () => {
    const pro = planById(plans, "PRO");
    // PLUS -> PRO at half the period: 5 + (20 - 5) x 0.5 = 12.50 USD for the month.
    expect(personWindowsFor(pro, anchor, now, 9_500, 12_500_000).map((window) => window.limitMicros))
      .toEqual([4_000_000, 10_000_000, 12_500_000]);
    expect(personWindowsFor(pro, anchor, now, 9_500, 3_000_000).map((window) => window.limitMicros))
      .toEqual([3_000_000, 3_000_000, 3_000_000]);
    expect(personWindowsFor(pro, anchor, now, 9_500, null).map((window) => window.limitMicros))
      .toEqual([4_000_000, 10_000_000, 20_000_000]);
  });

  it("refuses a close edge outside 5000-10000 and an override below one micro-unit (0082's CHECK says > 0)", () => {
    expect(() => personWindowsFor(planById(plans, "PLUS"), anchor, now, 4_999))
      .toThrowError(expect.objectContaining({ code: "BILLING_WINDOW_INPUT_INVALID" }));
    for (const override of [-1, 0]) {
      expect(() => personWindowsFor(planById(plans, "PLUS"), anchor, now, 9_500, override))
        .toThrowError(expect.objectContaining({ code: "BILLING_WINDOW_INPUT_INVALID" }));
    }
  });
});

describe("allowanceVsPlus: the pricing page's multiple, never a dollar figure", () => {
  it.each([["FREE", "0.04"], ["PLUS", "1"], ["PRO", "4"], ["MAX", "30"]] as const)("%s is %s x Plus", (id, multiple) => {
    expect(allowanceVsPlus(plans, id)).toBe(multiple);
  });

  it("refuses a plan no row seals, by register's own code", () => {
    expect(() => allowanceVsPlus(plans, "GOLD" as PlanId))
      .toThrowError(expect.objectContaining({ code: "BILLING_PLAN_UNKNOWN" }));
  });
});

describe("billing-core restates register's plan arithmetic without importing it at run time (R-1)", () => {
  const anchor = at("2026-01-15T10:00:00.000Z");
  const now = at("2026-03-20T12:00:00.000Z");
  const oddRow = structuredClone(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value) as unknown as {
    plans: Array<Record<string, unknown>>;
  };
  oddRow.plans[1]!.monthly_credit_micros = 1_000_001;
  const odd = billingPlansFromValue(oddRow, "b4 odd credit");

  it("computes every day, week and month limit exactly as planCapMicros does", () => {
    for (const source of [plans, odd]) {
      for (const plan of source.plans) {
        const windows = personWindowsFor(plan, anchor, now, 9_500);
        const limit = (scope: string) => windows.find((window) => window.scope === scope)?.limitMicros ?? null;
        expect(limit("PERSON_DAY"), `${plan.planId} day`).toBe(planCapMicros(plan, "DAY"));
        expect(limit("PERSON_WEEK"), `${plan.planId} week`).toBe(planCapMicros(plan, "WEEK"));
        expect(limit("PERSON_MONTH"), `${plan.planId} month`).toBe(planCapMicros(plan, "MONTH"));
      }
    }
  });

  it("lists @debateai/kernel as its only dependency, and imports register and budget as types only", async () => {
    const manifest = JSON.parse(await readFile(new URL("../../packages/billing-core/package.json", import.meta.url), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(["@debateai/kernel"]);
    expect(manifest.devDependencies).toBeUndefined();
    const directory = new URL("../../packages/billing-core/src/", import.meta.url);
    const files = (await readdir(directory)).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const source = await readFile(new URL(name, directory), "utf8");
      expect(source, name).not.toMatch(/^(?:import|export)\s+(?!type\b)[^;]*from\s+"@debateai\/(?:register|budget)"/mu);
    }
  });
});
