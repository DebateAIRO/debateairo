/**
 * A refusal a billing route answers with `{error: code, message: code}` (plus `charge_ref` for CHECKOUT_PENDING);
 * never a 5xx, never text.
 */
export type BillingRefusalCode =
  | "NOT_FOUND"
  | "LEGAL_REACCEPTANCE_REQUIRED"
  | "LEGAL_DOCUMENT_STALE"
  | "COUNTRY_PAYMENT_UNAVAILABLE"
  | "COUNTRY_UNKNOWN"
  | "TOR_REFUSED"
  | "COUNTRY_BLOCKED"
  | "COUNTRY_CONFIRMATION_REQUIRED"
  | "BILLING_ADDRESS_REQUIRED"
  | "TAX_ID_INVALID"
  | "TAX_SERVICE_UNAVAILABLE"
  | "ALREADY_SUBSCRIBED"
  | "QUOTE_EXPIRED"
  /** P8c (D7 #5): a payment for the open checkout is already on its way; `chargeRef` names it. */
  | "CHECKOUT_PENDING"
  | "PAYMENT_PROVIDER_UNAVAILABLE";

export type BillingRefusalStatus = 403 | 404 | 409 | 422 | 503;

export class BillingRefusal extends Error {
  /** `chargeRef`: our own charge id (32 hex), sent back only with CHECKOUT_PENDING. */
  constructor(readonly status: BillingRefusalStatus, readonly code: BillingRefusalCode, readonly chargeRef: string | null = null) {
    super(code);
    this.name = "BillingRefusal";
  }
}
