import { TypedDomainError } from "@debateai/kernel";

// Paid plans (spec 2026-09-29 §2.5.6, §2.14.8). Integer USD micros in, whole cents out, rounded DOWN (the
// contract's "floor"): a proration charges up to a cent less (the customer's favour); a withdrawal refund pays up to
// a cent less (the company's favour, an open owner question against §2.14.8). Every product that can exceed 2^53 is
// computed in bigint. An upgrade's proration measures its share of the period in exact milliseconds; a withdrawal
// refund measures no time at all, only the plan credit used (owner's decision of 16 November 2026).
const MICROS_PER_CENT = 10_000;
const DECIMAL = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/u;

function invalidAmount(): never {
  throw new TypedDomainError("BILLING_AMOUNT_INVALID", "an amount is not a safe integer of micros");
}

function assertMicros(value: number, allowNegative = false): void {
  if (!Number.isSafeInteger(value) || (!allowNegative && value < 0)) invalidAmount();
}

function assertCents(value: number, allowNegative = false): void {
  assertMicros(value, allowNegative);
  if (value % MICROS_PER_CENT !== 0) {
    throw new TypedDomainError("BILLING_AMOUNT_NOT_CENTS", "an amount is not a whole number of cents");
  }
}

function assertDate(value: Date): number {
  const time = value.getTime();
  if (!Number.isFinite(time)) throw new TypedDomainError("BILLING_DATE_INVALID", "a billing date is not a date");
  return time;
}

function floorToCents(micros: bigint): number {
  const whole = micros < 0n ? 0n : micros;
  return Number(whole - (whole % BigInt(MICROS_PER_CENT)));
}

export function microsToDecimal(micros: number): string {
  assertCents(micros, true);
  const sign = micros < 0 ? "-" : "";
  const cents = Math.abs(micros) / MICROS_PER_CENT;
  return `${sign}${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function decimalToMicros(decimal: string): number {
  const match = DECIMAL.exec(decimal);
  if (match === null) {
    throw new TypedDomainError("BILLING_DECIMAL_INVALID", "an amount is not a decimal with at most two places");
  }
  const magnitude = (BigInt(match[2] ?? "0") * 100n + BigInt((match[3] ?? "").padEnd(2, "0")))
    * BigInt(MICROS_PER_CENT);
  const signed = match[1] === "-" ? -magnitude : magnitude;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) invalidAmount();
  return Number(signed);
}

export function upgradeProrationMicros(i: Readonly<{
  oldNetMicros: number; newNetMicros: number; periodStart: Date; periodEnd: Date; now: Date;
}>): number {
  assertCents(i.oldNetMicros);
  assertCents(i.newNetMicros);
  if (i.newNetMicros <= i.oldNetMicros) {
    throw new TypedDomainError("UPGRADE_NOT_HIGHER", "an upgrade must move to a higher price");
  }
  const start = assertDate(i.periodStart);
  const end = assertDate(i.periodEnd);
  const now = Math.min(Math.max(assertDate(i.now), start), end);
  if (end <= start) throw new TypedDomainError("BILLING_PERIOD_INVALID", "a billing period must end after it starts");
  const remaining = BigInt(end - now);
  return floorToCents((BigInt(i.newNetMicros - i.oldNetMicros) * remaining) / BigInt(end - start));
}

/**
 * The withdrawal refund (owner's decision of 16 November 2026, one rule for every country the site serves):
 * `paid × (plan credit not used ÷ plan credit in force)`, floored to cents once (the company's favour by under a
 * cent). The days gone by do not count: nothing used gives the whole `paidMicros` back on any day of the window, and
 * the whole credit used, or more than it (a debate that finished past the limit), gives nothing back.
 *
 * `paidMicros` is what the payments this rule covers still hold, added up (whole cents); `monthlyCreditMicros` is the
 * credit in force when the person withdrew (after an upgrade, A6's override), and `creditSpentMicros` what was spent of
 * it since the period started. A plan with no credit has nothing that could be used, so the whole amount goes back
 * (no plan the site sells has none; the case is defined so the function never divides by zero).
 */
export function withdrawalRefundMicros(i: Readonly<{
  paidMicros: number; creditSpentMicros: number; monthlyCreditMicros: number;
}>): number {
  assertCents(i.paidMicros);
  assertMicros(i.creditSpentMicros);
  assertMicros(i.monthlyCreditMicros);
  if (i.monthlyCreditMicros === 0) return i.paidMicros;
  if (i.creditSpentMicros >= i.monthlyCreditMicros) return 0;
  const creditLeft = BigInt(i.monthlyCreditMicros - i.creditSpentMicros);
  return floorToCents((BigInt(i.paidMicros) * creditLeft) / BigInt(i.monthlyCreditMicros));
}
