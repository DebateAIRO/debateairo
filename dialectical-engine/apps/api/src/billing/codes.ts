/**
 * The closed vocabularies billing writes into its own rows and audit lines. Every value is a literal declared
 * here, never text taken from a provider, so a stored code can be shown to an operator verbatim.
 */
export type BillingRefundReason =
  /** P9b: the card was issued in an always-blocked country. */
  | "CARD_COUNTRY_BLOCKED"
  /** P9b (A8c): a late payment for an abandoned checkout while the owner already has a live plan. */
  | "ALREADY_SUBSCRIBED"
  /** P9b/P11a: a payment arrived for a subscription that is no longer live. */
  | "SUBSCRIPTION_ENDED"
  /** P12d (A4b): the withdrawal refund, split per transaction newest first. */
  | "WITHDRAWAL"
  /** P12e (A12): the release (void) of a card change's 1.00 USD authorization. */
  | "CARD_CHECK_RELEASE"
  /** P12e: a new card from an always-blocked country; the hold is released and nothing changes. */
  | "CARD_CHECK_REFUSED"
  /**
   * P12e (A2): a card change whose hold was paid while a renewal's outcome was unknown. The hold is released, nothing
   * changes, and the card page says "try again shortly".
   */
  | "CARD_CHECK_DEFERRED"
  /**
   * P12e/P20: a card change whose subscription stopped being live (neither ACTIVE nor PAST_DUE) before its hold was
   * paid. The hold is released, nothing changes, and the card page says a card needs an active plan.
   */
  | "CARD_CHECK_NOT_LIVE"
  /**
   * P9b (D5 5f): a second payment on a charge another transaction already paid (a reused checkout paid twice). It
   * bought nothing: refunded in full, M11_DUPLICATE, never a credit note (it was never a sale).
   */
  | "DUPLICATE_PAYMENT"
  /** N12 (spec §2.10): a late payment for a closed upgrade that can no longer buy what it was priced for; whole, M11_DUPLICATE. */
  | "UPGRADE_CLOSED"
  /**
   * P9c (A9), NETOPIA spec §2.12.4: refunded in NETOPIA's admin, not by us (a REFUNDED status with no request of ours).
   * Recorded, never requested.
   */
  | "PROVIDER_REFUND"
  /** P9c (A9): voided at NETOPIA (status 4) after it had succeeded. Recorded, never requested. */
  | "PROVIDER_VOID";

/** The reasons for which WE move money back; each is executed by P9b's `RefundDesk` (R-32). */
export type RequestedRefundReason = Exclude<BillingRefundReason, "PROVIDER_REFUND" | "PROVIDER_VOID">;

/**
 * The reasons for which we refused the payment itself: the charge status reads FAILED with this reason. Not
 * `DUPLICATE_PAYMENT`: the charge WAS paid (by its first transaction), and its status must read SUCCEEDED.
 */
export const REFUND_REASONS_REFUSING_THE_PAYMENT: ReadonlySet<BillingRefundReason> = new Set<BillingRefundReason>([
  "CARD_COUNTRY_BLOCKED", "ALREADY_SUBSCRIBED", "SUBSCRIPTION_ENDED", "CARD_CHECK_REFUSED", "CARD_CHECK_DEFERRED",
  "CARD_CHECK_NOT_LIVE", "UPGRADE_CLOSED"
]);

export type ChargeFailureCode = "PAYMENT_DECLINED" | "VOIDED" | "REBILL_REFUSED" | "NO_TRANSACTION";

/**
 * `billing.payment_notice_outcome.outcome` (A21). `UNRECORDED_REFUND` (P9c): a second refund made elsewhere on a
 * payment that already holds one, which P1a's one-request-per-transaction key cannot record; handed to the owner.
 */
export type NoticeOutcome =
  | "APPLIED" | "DUPLICATE" | "MISMATCH" | "FAILED" | "REFUNDING" | "REFUNDED" | "CHARGEBACK" | "REPRESENTED"
  | "UNRECORDED_REFUND";
