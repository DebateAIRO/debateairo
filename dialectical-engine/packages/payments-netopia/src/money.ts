// packages/payments-netopia/src/money.ts
import { paymentError } from "@debateai/billing-core";

/* Spec 2026-10-05 §2.2 rule 7, §2.4.2: major units, at most two decimals, as exact TEXT both ways, never through a float. */
const MICROS_PER_CENT = 10_000;
const CENTS_PER_UNIT = 100;
const DECIMAL_TEXT = /^(0|[1-9][0-9]{0,8})(?:\.([0-9]{1,12}))?$/u;

export function microsToNetopiaAmount(micros: number): string {
  if (!Number.isSafeInteger(micros) || micros < 0 || micros % MICROS_PER_CENT !== 0) throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "amount");
  const cents = micros / MICROS_PER_CENT;
  const units = Math.floor(cents / CENTS_PER_UNIT);
  const rest = cents % CENTS_PER_UNIT;
  if (rest === 0) return String(units);
  const decimals = String(rest).padStart(2, "0");
  return `${units}.${decimals.endsWith("0") ? decimals.slice(0, 1) : decimals}`;
}

/** Drops every trailing "0" in one backward pass (CodeQL js/polynomial-redos: `/0+$/` is quadratic on many "0"). */
function trimTrailingZeros(digits: string): string {
  let end = digits.length;
  while (end > 0 && digits.charCodeAt(end - 1) === 48) end -= 1;
  return digits.slice(0, end);
}

export function netopiaAmountToMicros(text: string): number {
  const match = typeof text === "string" ? DECIMAL_TEXT.exec(text) : null;
  if (match === null) throw paymentError("PAYMENT_RESPONSE_INVALID", "amount");
  const fraction = trimTrailingZeros(match[2] ?? "");
  if (fraction.length > 2) throw paymentError("PAYMENT_RESPONSE_INVALID", "amount");
  return (Number(match[1]) * CENTS_PER_UNIT + Number(fraction.padEnd(2, "0"))) * MICROS_PER_CENT;
}
