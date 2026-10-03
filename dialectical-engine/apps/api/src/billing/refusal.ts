import type { FastifyReply } from "fastify";

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
  /** P8c (R3-2): the account still owes the age gate's one-time check; nothing is charged (403). */
  | "AGE_CONFIRMATION_REQUIRED"
  /**
   * P8c (R3-2): the age check could not be read; the age gate's own code (its `GET /v1/auth/age-confirmation`
   * answer in apps/api/src/index.ts), 503.
   */
  | "AGE_CHECK_UNAVAILABLE"
  | "PAYMENT_PROVIDER_UNAVAILABLE"
  /** P12b: no ACTIVE or PAST_DUE subscription to cancel, revoke or downgrade (409). */
  | "NOT_SUBSCRIBED"
  /** P12b: the downgrade target is not cheaper than the plan in force (422). */
  | "DOWNGRADE_NOT_LOWER"
  /** P12b (P2 review fix round 1, finding 1): the renewal charge for the next period is already written (409). */
  | "DOWNGRADE_NOT_AVAILABLE_NOW"
  /** P12c: the upgrade target is not dearer than the plan in force, or than the price this subscriber pays (422). */
  | "UPGRADE_NOT_HIGHER"
  /** P12c: an earlier upgrade has no outcome yet, or another process holds the subscription's lease (409). */
  | "UPGRADE_IN_PROGRESS"
  /** P12c: the renewal of this period is due, postponed or already charging; upgrade in the new period (409). */
  | "UPGRADE_NOT_AVAILABLE_NOW"
  /**
   * P12d: the withdrawal right is not open: past the 14 calendar days from the first activation (a last day on a
   * Saturday or Sunday moves to the Monday, W6), or a tax country outside `withdrawalCountries` (409).
   */
  | "WITHDRAWAL_WINDOW_CLOSED"
  /** P12d: no live WITHDRAW_SUBSCRIPTION step-up grant for this session (403); nothing was written. */
  | "STEP_UP_REQUIRED"
  /** P12e (A2): a renewal's rebill may have reached xMoney; the card can change once its outcome is recorded. */
  | "CARD_CHANGE_NOT_AVAILABLE_NOW"
  /** P13 (A25): the emailed cancel link's token is unknown, already spent or past its 24 hours (404). */
  | "CANCEL_LINK_INVALID"
  /**
   * W10 (P2-M18): the emailed cancel link's token was valid and is now spent, but its plan had nothing left to cancel
   * (a cancel already pending, the plan ended, or a newer plan in its place); nothing changed (409).
   */
  | "NOTHING_TO_CANCEL"
  /**
   * P15: an account erasure is pending (the person stays signed in for the 7-day grace): no new money is taken (409).
   */
  | "ACCOUNT_ERASURE_PENDING";

export type BillingRefusalStatus = 403 | 404 | 409 | 422 | 503;

export class BillingRefusal extends Error {
  /** `chargeRef`: our own charge id (32 hex), sent back only with CHECKOUT_PENDING. */
  constructor(readonly status: BillingRefusalStatus, readonly code: BillingRefusalCode, readonly chargeRef: string | null = null) {
    super(code);
    this.name = "BillingRefusal";
  }
}

/** The house 404 every billing route answers while its dependency is absent. */
export function billingNotFound(reply: FastifyReply): FastifyReply {
  return reply.status(404).send({ error: "NOT_FOUND", message: "NOT_FOUND" });
}

/**
 * Maps a `BillingRefusal` to its status and code (and, for CHECKOUT_PENDING, the charge the page should wait on);
 * every other error reaches the house error handler.
 */
export async function answerRefusal(reply: FastifyReply, work: () => Promise<FastifyReply>): Promise<FastifyReply> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof BillingRefusal) {
      return reply.status(error.status).send({
        error: error.code, message: error.code, ...(error.chargeRef === null ? {} : { charge_ref: error.chargeRef })
      });
    }
    throw error;
  }
}
