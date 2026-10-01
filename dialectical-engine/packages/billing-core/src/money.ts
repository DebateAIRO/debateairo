import { TypedDomainError } from "@debateai/kernel";

// Paid plans (spec 2026-09-29 §2.5.6, §2.14.8). Integer USD micros in, whole cents out, rounded DOWN (the
// contract's "floor"): a proration charges up to a cent less (the customer's favour); a withdrawal refund pays up to
// a cent less (the company's favour, an open owner question against §2.14.8). Every product that can exceed 2^53 is
// computed in bigint. Both shares of a period are exact milliseconds.
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

export function withdrawalRefundMicros(i: Readonly<{
  paidTotalMicros: number; periodStart: Date; periodEnd: Date; now: Date;
  creditSpentMicros: number; monthlyCreditMicros: number;
}>): number {
  assertCents(i.paidTotalMicros);
  assertMicros(i.creditSpentMicros);
  assertMicros(i.monthlyCreditMicros);
  const start = assertDate(i.periodStart);
  const end = assertDate(i.periodEnd);
  if (end <= start) throw new TypedDomainError("BILLING_PERIOD_INVALID", "a billing period must end after it starts");
  const span = end - start;
  const elapsed = Math.min(Math.max(assertDate(i.now) - start, 0), span);
  const paid = BigInt(i.paidTotalMicros);
  // The days share is exact, like the proration: a withdrawal one second into a day keeps one second's price.
  const byDays = (paid * BigInt(span - elapsed)) / BigInt(span);
  const byCredit = i.monthlyCreditMicros === 0
    ? paid
    : i.creditSpentMicros >= i.monthlyCreditMicros
      ? 0n
      : (paid * BigInt(i.monthlyCreditMicros - i.creditSpentMicros)) / BigInt(i.monthlyCreditMicros);
  return floorToCents(byDays < byCredit ? byDays : byCredit);
}
