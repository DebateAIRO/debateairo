import type { PersonWindow } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import type { BillingPlan, BillingPlans, PlanId } from "@debateai/register";
import { planIn, planShareMicros } from "./plan-lookup.js";

/**
 * PAID PLANS, Part 1b (spec 2026-09-29 §2.4.1, §2.4.3; amendment R1 A6) —
 * EACH PERSON'S WINDOWS. Pure: no clock is read here; `now` is always passed in.
 *
 *  - MONTH: from the last anchor day-of-month at or before `now`, at the
 *    anchor's UTC time of day. A day past a month's end is clamped to that
 *    month's last day (anchor 31 January gives 28/29 February, then 31 March).
 *  - WEEK: 7-day blocks counted from the month start. The last block may be
 *    shorter, and keeps the full weekly cap (slightly generous, by design).
 *  - DAY: 24-hour blocks counted from the month start. It is UTC, so daylight
 *    saving never changes a day's length.
 * Starts are inclusive and ends exclusive: consecutive windows tile with no gap
 * and no overlap.
 */
export type TimeWindow = Readonly<{ start: Date; end: Date }>;

const SPAN = Object.freeze({ dayMs: 86_400_000, weekMs: 7 * 86_400_000 });
/** The costEnvelopePolicy close edge's own range (B1: 5000-10000). */
const CLOSE_EDGE = Object.freeze({ least: 5_000, most: 10_000 });

function instantOf(value: Date, label: string): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypedDomainError("BILLING_WINDOW_INPUT_INVALID", `${label} is not a valid instant`);
  }
  return value.getTime();
}

/** The anchor's day-of-month and UTC time of day in (`year`, `month`), the day clamped to the month's end. */
function periodStartIn(anchor: Date, year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(
    year, month, Math.min(anchor.getUTCDate(), lastDay),
    anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()
  );
}

function windowOf(startMs: number, endMs: number): TimeWindow {
  return Object.freeze({ start: new Date(startMs), end: new Date(endMs) });
}

export function computeWindows(
  anchor: Date,
  now: Date
): Readonly<{ month: TimeWindow; week: TimeWindow; day: TimeWindow }> {
  const anchorMs = instantOf(anchor, "anchor");
  const nowMs = instantOf(now, "now");
  if (nowMs < anchorMs) {
    throw new TypedDomainError("BILLING_WINDOW_BEFORE_ANCHOR", "A person's window cannot be read before its anchor");
  }
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let startMs = periodStartIn(anchor, year, month);
  if (startMs > nowMs) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    startMs = periodStartIn(anchor, year, month);
  }
  const endMs = month === 11 ? periodStartIn(anchor, year + 1, 0) : periodStartIn(anchor, year, month + 1);
  const elapsedMs = nowMs - startMs;
  const weekStartMs = startMs + Math.floor(elapsedMs / SPAN.weekMs) * SPAN.weekMs;
  const dayStartMs = startMs + Math.floor(elapsedMs / SPAN.dayMs) * SPAN.dayMs;
  return Object.freeze({
    month: windowOf(startMs, endMs),
    week: windowOf(weekStartMs, Math.min(weekStartMs + SPAN.weekMs, endMs)),
    day: windowOf(dayStartMs, Math.min(dayStartMs + SPAN.dayMs, endMs))
  });
}

/**
 * The person's windows under `plan`, in the order DAY, WEEK, MONTH. Free has
 * only MONTH.
 *
 * A6: after an upgrade the current period's MONTH limit is
 * `monthCreditOverrideMicros`, the prorated credit stored on the entitlement
 * event. The day and week caps are the plan's own caps, on its full credit, but
 * never above that month limit. `null` means the plan's full credit.
 */
export function personWindowsFor(
  plan: BillingPlan,
  anchor: Date,
  now: Date,
  closeBasisPoints: number,
  monthCreditOverrideMicros: number | null = null
): ReadonlyArray<PersonWindow> {
  if (!Number.isInteger(closeBasisPoints) || closeBasisPoints < CLOSE_EDGE.least || closeBasisPoints > CLOSE_EDGE.most) {
    throw new TypedDomainError("BILLING_WINDOW_INPUT_INVALID", "The close edge is outside 5000-10000 basis points");
  }
  // A 0-micro limit would make budget's room refuse every ask (BUDGET_ROOM_LIMIT_INVALID);
  // 0084's CHECK already stores only overrides > 0, and this refuses the same.
  if (monthCreditOverrideMicros !== null
    && (!Number.isSafeInteger(monthCreditOverrideMicros) || monthCreditOverrideMicros < 1)) {
    throw new TypedDomainError("BILLING_WINDOW_INPUT_INVALID", "A month credit override is a positive whole number of micro-units");
  }
  const windows = computeWindows(anchor, now);
  const monthLimit = monthCreditOverrideMicros ?? plan.monthlyCreditMicros;
  const person = (scope: PersonWindow["scope"], limitMicros: number, window: TimeWindow): PersonWindow => Object.freeze({
    scope,
    limitMicros,
    periodStart: window.start,
    resetsAt: window.end,
    finishBasisPoints: plan.finishBasisPoints,
    closeBasisPoints
  });
  const result: PersonWindow[] = [];
  const dayCap = planShareMicros(plan, plan.dayBasisPoints);
  if (dayCap !== null) result.push(person("PERSON_DAY", Math.min(dayCap, monthLimit), windows.day));
  const weekCap = planShareMicros(plan, plan.weekBasisPoints);
  if (weekCap !== null) result.push(person("PERSON_WEEK", Math.min(weekCap, monthLimit), windows.week));
  result.push(person("PERSON_MONTH", monthLimit, windows.month));
  return Object.freeze(result);
}

/**
 * The pricing page's "N x the Plus allowance" (spec §1.2), as a plain decimal
 * with at most two places and no trailing zeros: "0.04", "1", "4", "30". It is
 * rounded down, and shows no dollar figure of credit.
 */
export function allowanceVsPlus(plans: BillingPlans, id: PlanId): string {
  const plus = planIn(plans, "PLUS");
  const plan = planIn(plans, id);
  const hundredths = (BigInt(plan.monthlyCreditMicros) * 100n) / BigInt(plus.monthlyCreditMicros);
  const whole = hundredths / 100n;
  const part = hundredths % 100n;
  if (part === 0n) return whole.toString();
  return `${whole.toString()}.${part.toString().padStart(2, "0").replace(/0+$/u, "")}`;
}
