import type { PersonWindow } from "@debateai/budget";
import type { BillingPlans, PlanId } from "@debateai/register";
import { planIn } from "./plan-lookup.js";
import { personWindowsFor } from "./windows.js";

/**
 * THE NUMBERS A MONTH KEEPS (Terms sections 12 to 14).
 *
 * A plan's limits are settings, and a new settings version goes live with an upload. A person's month must not get
 * tighter because of one: a lower limit reaches them when their own next month starts, never in the month they are
 * in and never over days already used. A higher limit reaches them at once.
 *
 * So a month is never measured against "the plans now" alone, but against every set of plans the site served at any
 * moment from that month's start to the instant asked about, taking for each number the one that is best for the
 * person. Made-up example: the day cap is 11 when a month starts, and an upload on its tenth day makes it 5: the month
 * keeps 11. Had the upload made it 22, the month has 22 from the tenth day on, and its first nine days still count at
 * 11. A month that starts after the upload has the new number alone.
 *
 * A way back to an older release is one more set of plans served. So a higher number is not taken from a month that
 * already had it; a month that starts after the way back never sees it.
 *
 * Free follows the same rule: its month starts at the account's own day of the month.
 */
export interface PlansInForcePort {
  /**
   * The plans of every settings version the site served at any moment from `from` to `to` (both included), oldest
   * first, the one served at `to` last. Never empty.
   */
  between(from: Date, to: Date): Promise<ReadonlyArray<BillingPlans>>;
}

function served(plans: ReadonlyArray<BillingPlans>): ReadonlyArray<BillingPlans> {
  if (!Array.isArray(plans) || plans.length === 0) throw new TypeError("BILLING_PLANS_IN_FORCE_EMPTY");
  return plans;
}

/** The month credit of `planId` for a month that was served `plans`: the largest of them. */
export function monthCreditInForce(plans: ReadonlyArray<BillingPlans>, planId: PlanId): number {
  return Math.max(...served(plans).map((each) => planIn(each, planId).monthlyCreditMicros));
}

const largest = (values: ReadonlyArray<number | undefined>): number | undefined => {
  const known = values.filter((value): value is number => value !== undefined);
  return known.length === 0 ? undefined : Math.max(...known);
};
const smallest = (values: ReadonlyArray<number | undefined>): number | undefined => {
  const known = values.filter((value): value is number => value !== undefined);
  return known.length === 0 ? undefined : Math.min(...known);
};

/**
 * `personWindowsFor` over a month that was served `plans`. The windows are the ones the plans served last give (so the
 * money rule in force is today's); each number in them is the best any of the plans gives:
 *  - a window's limit and its finish room: the largest;
 *  - the reserve kept inside the month: the smallest, so a reserve raised later does not make new questions stop
 *    earlier in a month already started (a final answer is paid from the site's reserve of the day, `closingReservesOf`).
 * An upgrade's stored month credit still wins over every plan's own, as in `personWindowsFor`.
 */
export function personWindowsInForce(
  plans: ReadonlyArray<BillingPlans>,
  planId: PlanId,
  anchor: Date,
  now: Date,
  closeBasisPoints: number,
  monthCreditOverrideMicros: number | null = null
): ReadonlyArray<PersonWindow> {
  const each = served(plans).map((one) => personWindowsFor(planIn(one, planId), anchor, now, closeBasisPoints, monthCreditOverrideMicros));
  const latest = each[each.length - 1]!;
  if (each.length === 1) return latest;
  return Object.freeze(latest.map((window): PersonWindow => {
    const same = each.map((windows) => windows.find((entry) => entry.scope === window.scope))
      .filter((entry): entry is PersonWindow => entry !== undefined);
    const overflow = window.finishOverflowMicros === undefined ? undefined : largest(same.map((entry) => entry.finishOverflowMicros));
    const reserve = window.keepsReserveMicros === undefined ? undefined : smallest(same.map((entry) => entry.keepsReserveMicros));
    return Object.freeze({
      ...window,
      limitMicros: Math.max(...same.map((entry) => entry.limitMicros)),
      finishBasisPoints: Math.max(...same.map((entry) => entry.finishBasisPoints)),
      ...(overflow === undefined ? {} : { finishOverflowMicros: overflow }),
      ...(reserve === undefined ? {} : { keepsReserveMicros: reserve })
    });
  }));
}
