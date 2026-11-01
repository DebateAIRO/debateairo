import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { BillingPersonAllowanceSource, computeWindows, type EntitlementPort } from "@debateai/billing-core";
import { EntitlementRepository } from "@debateai/db";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, type PlanId } from "@debateai/register";

const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
const anchor = new Date("2026-01-15T10:00:00.000Z");
const now = new Date("2026-03-20T12:00:00.000Z");
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function source(planId: PlanId | null, override: number | null = null, periodAnchorAt: Date = anchor) {
  const current = vi.fn(async () => planId === null
    ? null
    : { planId, periodAnchorAt, monthCreditOverrideMicros: override });
  return { current, allowance: new BillingPersonAllowanceSource({ entitlements: { current }, plans, closeBasisPoints: 9_500 }) };
}

describe("EntitlementRepository fits EntitlementPort (ruling R-1), checked by the compiler", () => {
  it("assigns the repository and its read-only port to the port type", () => {
    // `pnpm run typecheck` covers tests/**: if the repository's `current` or
    // `readOnlyPort()` shape drifts from billing-core's port (its `planId` is
    // db's EntitlementPlanId where the port expects register's PlanId), this
    // file stops compiling.
    const repository = new EntitlementRepository({} as Pool);
    const port: EntitlementPort = repository;
    const runnerPort: EntitlementPort = repository.readOnlyPort();
    expect([typeof port.current, typeof runnerPort.current]).toEqual(["function", "function"]);
  });
});

describe("BillingPersonAllowanceSource (spec §2.4.1)", () => {
  it("reads the owner's entitlement at `now` and returns the plan's windows", async () => {
    const { current, allowance } = source("PLUS");
    const windows = await allowance.read(OWNER, now);
    expect(current).toHaveBeenCalledWith(OWNER, now);
    // billingPlans v4 under the owner's money rule (31 Oct), which replaced "each window's edge is its limit plus a fixed
    // overflow": the day and the week borrow and carry no overflow; the month keeps the overflow as the tolerance for
    // calls in flight at its wall, and its reserve inside. The figures are the row's made-up ones.
    expect(windows.map((window) => [window.scope, window.limitMicros, window.closeBasisPoints, window.finishBasisPoints,
      window.finishOverflowMicros ?? null, window.borrows ?? null, window.keepsReserveMicros ?? null])).toEqual([
      ["PERSON_DAY", 726_000, 9_500, 10_000, null, true, null],
      ["PERSON_WEEK", 2_904_000, 9_500, 10_000, null, true, null],
      ["PERSON_MONTH", 6_600_000, 9_500, 10_000, 220_000, null, 440_000]
    ]);
    expect(windows[2]!.resetsAt).toEqual(computeWindows(anchor, now).month.end);
  });

  it("gives Free its month only, passes the A6 override through, and has no windows without an entitlement", async () => {
    expect((await source("FREE").allowance.read(OWNER, now)).map((window) => window.scope)).toEqual(["PERSON_MONTH"]);
    expect((await source("PRO", 19_800_000).allowance.read(OWNER, now)).map((window) => window.limitMicros))
      .toEqual([3_630_000, 14_520_000, 19_800_000]);
    expect(await source(null).allowance.read(OWNER, now)).toEqual([]);
  });

  it("refuses a close edge outside the costEnvelopePolicy range at construction", () => {
    expect(() => new BillingPersonAllowanceSource({ entitlements: { current: async () => null }, plans, closeBasisPoints: 10_001 }))
      .toThrowError(expect.objectContaining({ code: "BILLING_WINDOW_INPUT_INVALID" }));
  });
});

describe("an entitlement anchored just after the caller's clock (the view's clock, a lapse, a NETOPIA payment time)", () => {
  const justAfter = new Date(now.getTime() + 1);

  it("reads a plan that began 1 ms after `now` at its anchor, and does not throw", async () => {
    const windows = await source("PLUS", null, justAfter).allowance.read(OWNER, now);
    const opened = computeWindows(justAfter, justAfter);
    expect(windows.map((window) => [window.scope, window.limitMicros])).toEqual([
      ["PERSON_DAY", 726_000], ["PERSON_WEEK", 2_904_000], ["PERSON_MONTH", 6_600_000]
    ]);
    expect(windows.map((window) => window.periodStart)).toEqual([justAfter, justAfter, justAfter]);
    expect(windows.map((window) => window.resetsAt)).toEqual([opened.day.end, opened.week.end, opened.month.end]);
  });

  it("reads a paid plan that lapsed 1 ms after `now` as Free's month from the lapse (A8)", async () => {
    // What the view answers once paid_through has passed at the database's clock:
    // FREE, anchored at paid_through, which is after the runner's own `now`.
    const windows = await source("FREE", null, justAfter).allowance.read(OWNER, now);
    expect(windows).toEqual([expect.objectContaining({
      scope: "PERSON_MONTH", limitMicros: 330_000, periodStart: justAfter,
      resetsAt: computeWindows(justAfter, justAfter).month.end
    })]);
  });

  it("still reads an anchor before `now` at `now`, so the clamp moves nothing else", async () => {
    const windows = await source("PLUS").allowance.read(OWNER, now);
    expect(windows[0]!.periodStart).toEqual(computeWindows(anchor, now).day.start);
  });
});
