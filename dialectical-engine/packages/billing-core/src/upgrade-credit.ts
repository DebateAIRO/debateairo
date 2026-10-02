import { TypedDomainError } from "@debateai/kernel";

/**
 * A6 (spec amendments R1) — the month credit after an upgrade: the credit in force now plus the new plan's extra
 * credit for the part of the period still to run, floored to whole micros. The day and week caps apply the new
 * plan's basis points but never exceed this month credit (B4's `personWindowsFor`); the next period uses the plan's
 * full credit again.
 */
export function upgradeMonthCreditOverrideMicros(input: Readonly<{
  currentMonthCreditMicros: number;
  oldPlanCreditMicros: number;
  newPlanCreditMicros: number;
  periodStart: Date;
  periodEnd: Date;
  at: Date;
}>): number {
  for (const amount of [input.currentMonthCreditMicros, input.oldPlanCreditMicros, input.newPlanCreditMicros]) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new TypedDomainError("BILLING_CREDIT_INVALID", "A credit amount is not a whole non-negative number of micros");
    }
  }
  const start = input.periodStart.getTime();
  const end = input.periodEnd.getTime();
  const at = input.at.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(at) || end <= start) {
    throw new TypedDomainError("BILLING_PERIOD_INVALID", "The period has no length");
  }
  const extra = input.newPlanCreditMicros - input.oldPlanCreditMicros;
  if (extra <= 0) return input.currentMonthCreditMicros;
  const remaining = Math.min(Math.max(end - at, 0), end - start);
  return input.currentMonthCreditMicros + Number((BigInt(extra) * BigInt(remaining)) / BigInt(end - start));
}
