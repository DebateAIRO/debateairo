import { TypedDomainError } from "@debateai/kernel";

/**
 * Spec §2.7 "Audit events (content-free)". One structured line per event, the same shape as
 * `api.admission.refused` in apps/api/src/index.ts: codes, our own identifiers, ISO country codes and counts.
 * Never an email, a name, an address, an IP address or any card detail.
 */
export type BillingAuditEvent =
  | "billing.quote.refused"
  | "billing.checkout.started"
  | "billing.payment.verified"
  | "billing.payment.failed"
  | "billing.payment.mismatch"
  /** P9b: a second successful payment on an order already paid; it is refunded in full. */
  | "billing.payment.duplicate"
  | "billing.refund"
  | "billing.refund.refused"
  /** P9b (A4c): a partial refund whose earlier call may have moved the money; handed to the owner, never re-sent. */
  | "billing.refund.outcome_unknown"
  | "billing.chargeback"
  | "billing.country.refused"
  | "billing.notice.undecryptable"
  | "billing.outbox.dead"
  | "billing.renewal.unknown"
  /**
   * P11a (A2, Q-1): a renewal whose rebill never reached xMoney, or whose outcome stayed unknown, past its window;
   * closed FAILED(NO_TRANSACTION) for the owner to check, and the dunning starts.
   */
  | "billing.renewal.stuck"
  /**
   * P11a (Q-1): an outage (the tax service, xMoney, an unknown rebill) keeps the plan at the renewal: one
   * RENEWAL_PENDING entitlement extends paid access up to 72 hours past the due instant. The code only.
   */
  | "billing.renewal.pending"
  /**
   * P11a (Q-1): the tax service stayed down 72 hours past the renewal's due instant, or at a dunning retry: the
   * normal dunning's attempt is recorded with no charge (none may be made without a fresh quote). Attempt and code.
   */
  | "billing.renewal.dunning_unpriced"
  /**
   * P11a: the tax service REFUSED the renewal's quote (P4's TAX_SERVICE_REFUSED: a revoked key, a 422). An operator
   * alarm, once per subscription period per process: no charge, no dunning, no email. The code and P4's detail only.
   */
  | "billing.renewal.tax_refused"
  /** P11a: one line per renewal tick that had failures or tax refusals; the counts only. */
  | "billing.renewal.report"
  /**
   * P11a (R-34, R3-2): the stop port named this owner (an account erasure pending or finished, or an account the age
   * gate froze), so no rebill, retry or resubmission was made. No field: the port answers only yes or no, and the name
   * says "stopped", never "erasure", so a frozen account is never read as one.
   */
  | "billing.renewal.owner_stopped"
  /** P11a (D5 5d): subscriptions whose history does not fold, skipped by the renewal pass; the count and code only. */
  | "billing.renewal.history_invalid"
  /** P11a: a subscription whose recurring net price was never recorded; it is not charged at a guessed price. */
  | "billing.renewal.price_missing"
  /** D5 5i: xMoney refused our credentials (401/403). An operator alarm: nothing was charged, failed or emailed. */
  | "billing.xmoney.credentials_refused"
  /** D5 5i: listed xMoney rows the parser refused and skipped (`onRejected`); the count and code only. */
  | "billing.xmoney.row_rejected"
  /** P9c: a second refund made at xMoney on a transaction that already holds one; the owner records it by hand. */
  | "billing.refund.unrecorded"
  | "billing.invoice.unknown";

export type BillingAuditField = string | number | boolean | null;
export type BillingAudit = (event: BillingAuditEvent, fields: Readonly<Record<string, BillingAuditField>>) => void;

export const consoleBillingAudit: BillingAudit = (event, fields) => {
  console.error(JSON.stringify(Object.freeze({ ...fields, event })));
};

/**
 * D5 5i: `XMONEY_CREDENTIALS_REFUSED` (401/403) means xMoney processed nothing and our key is wrong or revoked. It is
 * never a payment failure: the caller leaves its charge or job open, and this writes the one operator alarm.
 */
export function credentialsRefused(audit: BillingAudit, error: unknown, operation: string): boolean {
  if (!(error instanceof TypedDomainError) || error.code !== "XMONEY_CREDENTIALS_REFUSED") return false;
  audit("billing.xmoney.credentials_refused", { operation });
  return true;
}

/**
 * D5 5i: the `onRejected` of one `listTransactions` call, counting the rows the parser skipped, and `report()`, which
 * writes one content-free line when any were (never the ids).
 */
export function rejectedRows(audit: BillingAudit, operation: string): Readonly<{
  onRejected: (transactionId: string | null) => void;
  report: () => void;
}> {
  let count = 0;
  return Object.freeze({
    onRejected: () => { count += 1; },
    report: () => {
      if (count > 0) audit("billing.xmoney.row_rejected", { operation, count, code: "XMONEY_ROW_REJECTED" });
    }
  });
}
