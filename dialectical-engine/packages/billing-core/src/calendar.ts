import { TypedDomainError } from "@debateai/kernel";
import type { BillingPolicy } from "@debateai/register";

const DAY_MS = 86_400_000;

function time(value: Date): number {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) throw new TypedDomainError("BILLING_DATE_INVALID", "a billing date is not a date");
  return milliseconds;
}

/**
 * The start of the `index`-th month after `anchor` (index 0 = the anchor): same day of month and time of
 * day, clamped to the month's last day (spec §2.4.3). B4b's `computeWindows` month window must equal
 * [periodBoundary(k), periodBoundary(k+1)) — tests/unit/billing-core-calendar.test.ts pins it.
 */
export function periodBoundary(anchor: Date, index: number): Date {
  time(anchor);
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new TypedDomainError("BILLING_PERIOD_INVALID", "a period index must be a non-negative integer");
  }
  const months = anchor.getUTCMonth() + index;
  const year = anchor.getUTCFullYear() + Math.floor(months / 12);
  const month = months % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year, month, Math.min(anchor.getUTCDate(), lastDay),
    anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()
  ));
}

function isBusinessDay(milliseconds: number): boolean {
  const weekday = new Date(milliseconds).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

export function addBusinessDays(from: Date, days: number): Date {
  let cursor = time(from);
  if (!Number.isSafeInteger(days) || days < 0) {
    throw new TypedDomainError("BILLING_BUSINESS_DAYS_INVALID", "business days must be a non-negative integer");
  }
  let remaining = days;
  while (remaining > 0) {
    cursor += DAY_MS;
    if (isBusinessDay(cursor)) remaining -= 1;
  }
  return new Date(cursor);
}

export function businessDaysBetween(from: Date, to: Date): number {
  const start = time(from);
  const end = time(to);
  if (end < start) return -businessDaysBetween(to, from);
  let count = 0;
  for (let cursor = start + DAY_MS; cursor <= end; cursor += DAY_MS) {
    if (isBusinessDay(cursor)) count += 1;
  }
  return count;
}

export function invoiceIssuerFor(
  taxCountry: string,
  rules: BillingPolicy["invoiceIssuerRules"]
): "QUADERNO" | "SMARTBILL" {
  const issuer = rules[taxCountry.toUpperCase()] ?? rules["*"];
  if (issuer === undefined) {
    throw new TypedDomainError("BILLING_INVOICE_ISSUER_UNRESOLVED", "no invoice issuer rule covers this tax country");
  }
  return issuer;
}
