// packages/payments-netopia/src/status.ts
import type { DeclineSide, PaymentState } from "@debateai/billing-core";
import { NETOPIA_FACTS } from "./facts.js";

/*
 * Spec 2026-10-05 §2.4.4. 17 REVERSED is UNCLEAR (ruling C-7); so is every status the table does not name. The CALLER writes
 * `billing.payment.status_unexpected {status}` for a report whose state is UNCLEAR and whose providerStatus is not "17".
 */
const STATES: ReadonlyMap<number, PaymentState> = new Map<number, PaymentState>([
  [1, "PENDING"], [2, "AUTHORIZED"], [3, "PAID"], [4, "VOIDED"], [5, "PAID"], [6, "PENDING"], [8, "REFUNDED"],
  [9, "CHARGEBACK_OPENED"], [10, "CHARGEBACK_LOST"], [11, "FAILED"], [12, "DECLINED"], [13, "PENDING"], [14, "PENDING"],
  [15, "ACTION_REQUIRED"], [16, "CHARGEBACK_REPRESENTED"], [17, "UNCLEAR"], [18, "PENDING"], [23, "EXPIRED"]
]);
export function statusToState(status: number): PaymentState {
  return STATES.get(status) ?? "UNCLEAR";
}

/** Outcome codes, never a refusal: approved (00, 0), 3-D Secure (100), the page (101), locked (102), the order reused (56). */
const OUTCOME_CODES: ReadonlySet<string> = new Set(["00", "0", "100", "101", "102", "56"]);
export function isOutcomeCode(code: string): boolean {
  return OUTCOME_CODES.has(code);
}
/** Spec §2.4.5: a card-side code or a status 12 without a code is the CARD; 32, 33, 99 and unknown codes are the MERCHANT. */
export function declineSideOf(code: string | null, status: number | null): DeclineSide | null {
  const text = code === null ? "" : code.trim();
  if (text === "" || isOutcomeCode(text)) return status === 12 ? "CARD" : null;
  return NETOPIA_FACTS.cardDeclineCodes.includes(text) ? "CARD" : "MERCHANT";
}

/** A29 (m)'s "your bank refused the payment": only where NETOPIA's own page names the card or the bank. */
export function bankDeclined(code: string | null): boolean {
  return code !== null && NETOPIA_FACTS.bankDeclineCodes.includes(code.trim());
}
