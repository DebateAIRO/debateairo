import { paymentErrorCode } from "@debateai/billing-core";

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
  | "billing.refund"
  | "billing.refund.refused"
  /** P9b (A4c): a partial refund whose earlier call may have moved the money; handed to the owner, never re-sent. */
  | "billing.refund.outcome_unknown"
  | "billing.chargeback"
  | "billing.country.refused"
  | "billing.outbox.dead"
  /**
   * W12 (P2-I16): a job died but the owner's alert (O3) could not be queued (the dead-letter hook threw); the job stays
   * dead and the owner summary still lists it. The job kind and its dead-letter code only.
   */
  | "billing.outbox.alert_failed"
  /**
   * P2-I4 (D5 5h), NETOPIA spec §2.5.4: a refund, invoice or credit-note job, a payment check naming its own charge, or
   * a RENEWAL_NOTICE of a plan, that belongs to another payment system (NETOPIA's sandbox or live, or the previous card
   * processor), or a job kind only that processor queued, ended DEAD before any vendor call or quote. The job kind and
   * the code OTHER_PAYMENT_SYSTEM only.
   */
  | "billing.outbox.other_system"
  /**
   * P7: the worker could not record a handled job's outcome because complete/fail threw (a lost connection, or a
   * code that billing.outbox's last_error_code CHECK '^[A-Z0-9_:-]{1,96}$' refuses); the job runs again after its
   * lease; the fields are the kind, the handler's outcome and attempts only.
   */
  | "billing.outbox.settle_failed"
  | "billing.renewal.unknown"
  /**
   * P11a (A2, Q-1): a renewal whose charge never reached NETOPIA, or whose outcome stayed unknown, past its window;
   * closed FAILED(NO_TRANSACTION) for the owner to check, and the dunning starts.
   */
  | "billing.renewal.stuck"
  /**
   * P11a (Q-1): an outage (the tax service, NETOPIA, an unknown charge) keeps the plan at the renewal: one
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
  /** P11a: one line per renewal tick that had failures or tax refusals; the counts and the failures' codes only. */
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
  /** N11 (spec §2.9.3, §2.9.4): a NETOPIA renewal's outcome is still open past its window; O3 was queued. The attempt. */
  | "billing.renewal.outcome_open"
  /** N11 (spec §2.9.3 step 5): a dunning retry was not made this pass; the code (EARLIER_ATTEMPT_PAID, _PENDING or _UNREADABLE). */
  | "billing.renewal.retry_held"
  /** N11: an earlier attempt of the period read PAID before a retry; its check was queued. The attempt. */
  | "billing.renewal.recovered_earlier"
  /**
   * F2 (ruling PR-55): NETOPIA reported a renewal's payment refunded before the site saw it paid; it was recorded paid
   * and refunded with no customer email, and either its plan ended (still renewing that month) or, when the plan was no
   * longer renewing that month (ended, paused by a dispute, or renewed by another payment), no plan changed, the owner's
   * O3 RENEWAL_REFUNDED_BEFORE_SEEN saying which. The attempt.
   */
  | "billing.renewal.refunded_before_seen"
  /**
   * N11 (spec §2.4.3, ruling PR-11): NETOPIA answered a renewal's FIRST send with 56 (the orderID was already used), an
   * anomaly; O3 ORDER_REUSED was queued. Our own order id (the charge id) only.
   */
  | "billing.payment.order_reused"
  /** D5 5i: NETOPIA refused our API key (401/403). An operator alarm: nothing was charged, failed or emailed. */
  | "billing.payment.credentials_refused"
  /** NETOPIA spec §2.3: an answer of NETOPIA's the package could not read (PAYMENT_RESPONSE_INVALID); the operation and code only. */
  | "billing.payment.answer_rejected"
  /** N10 (§2.4.4): NETOPIA reported a status whose meaning it has not confirmed (UNCLEAR). The status number only. */
  | "billing.payment.status_unexpected"
  /** N10 (§2.8, ruling C-7): a payment was handed to the owner with nothing recorded. The PaymentState. */
  | "billing.payment.owner_review"
  /** N10 (§2.15.2): a saved card that arrived after the decision was adopted (CARD_SAVED). The charge kind. */
  | "billing.card.saved"
  /** N17 (spec §2.15.4): saved cards revoked by the sweep or an erasure. The reason and the count. */
  | "billing.card.revoked"
  /** N17 (spec §2.5.2): the daily purges. The counts of deleted tokens and short-lived rows. */
  | "billing.card.purged"
  /** N17 (spec §2.15.3): M12 was queued. Which line: EXPIRING or MISSING. */
  | "billing.card.reminder"
  /** P11b: one line per maintenance pass whose visits failed; the count and the failures' distinct codes only. */
  | "billing.maintenance.report"
  /** N14 (spec §2.12.2): a NETOPIA refund was handed to the owner (O2_REFUND_DUE). The reason. */
  | "billing.refund.owner_due"
  /** N14 (spec §2.12.4): NETOPIA reports a refund on a PARTIAL request; nothing recorded until the owner's command. */
  | "billing.refund.seen_partial"
  /** N14 (spec §2.12.2 item 4): the owner recorded a refund with `pnpm billing:refund-done`. The reason. */
  | "billing.refund.recorded_by_owner"
  /**
   * N15b (ruling PR-41, spec §2.13): a charge-back arrived on a payment with an open owner refund, or a refund was
   * asked for on a payment already under a dispute; the refund is held while the dispute lasts and the owner got O3
   * REFUND_HELD_BY_CHARGEBACK. Once per payment (written only when that O3 is queued). The refund's reason.
   */
  | "billing.refund.held_by_chargeback"
  | "billing.invoice.unknown"
  /** P12b: a cancel request was written; the field is its source (SETTINGS or EMAIL_LINK). */
  | "billing.cancel"
  /** P12b: a pending cancel was revoked. No field. */
  | "billing.cancel.revoked"
  /** P12b: a downgrade to a lower plan was scheduled for the next renewal; the field is the plan id. */
  | "billing.downgrade.scheduled"
  /** P12c/N12: an upgrade charge was written and NETOPIA's page is about to be opened for it; the field is the plan id. */
  | "billing.upgrade.requested"
  /** N12 (spec §2.6.2 step 8): NETOPIA's page could not be opened; the fields are the operation and the payment code. */
  | "billing.payment.start_failed"
  /** N12/N16: an unpaid hosted charge was closed FAILED(NO_TRANSACTION); the field is the charge kind. */
  | "billing.charge.closed"
  /** P12d: a withdrawal was recorded; the fields are the number of refund intents written and its source. */
  | "billing.withdrawal"
  /**
   * P12d (D6a F20(c)): a withdrawal whose refund the owner settles by hand (a refund made in NETOPIA's admin
   * touched a payment, or a transaction already held a refund request); the field is its source.
   */
  | "billing.withdrawal.owner_review"
  /**
   * P14c (R2 Q-9): the owner settled a withdrawal handed to the owner (`pnpm billing:withdraw --refund`); the field
   * is the number of refund intents written through RefundDesk.
   */
  | "billing.withdrawal.settled"
  /** P12e/N13: a card change's CARD_CHECK charge was written and NETOPIA's page is about to be opened; the field is the plan status. */
  | "billing.card.change.started"
  /** P12e: a new card from an always-blocked country was refused; the field is its ISO country code. */
  | "billing.card.refused"
  /** P12e (A2): a card change's hold was paid while a renewal's outcome was unknown; nothing changed. No field. */
  | "billing.card.change.deferred"
  /** N13: a card check was paid and its card stored, but no stored card could be adopted; nothing changed. No field. */
  | "billing.card.not_adopted"
  /** P13 (A25): an emailed one-time cancel link (M9) was sent. No field: never the address, the owner or the token. */
  | "billing.cancel_link.sent"
  /** P14a: UPGRADE/RENEWAL charges still without an outcome after 30 days, no longer looked up; the count only. */
  | "billing.reconcile.expired"
  /**
   * P14a: charges one reconcile loop could not handle (a history that does not fold, an owner lock that timed out),
   * skipped so the pass goes on for every other charge. The pass (N16's STATUS), the count and the distinct codes
   * only.
   */
  | "billing.reconcile.errors"
  /** N16 (spec §2.14): one NETOPIA status read failed; the pass went on. The field is the payment code only. */
  | "billing.reconcile.status_failed"
  /**
   * P14a: dead refund jobs (PAYMENT_REFUND, and the previous card processor's) with no REFUNDED since, whatever their
   * code (`deadRefunds()`). Not every one is owed: the owner summary reads each code. REFUND_NOT_REQUESTED,
   * REFUND_CHARGE_MISSING and OTHER_PAYMENT_SYSTEM (or the code that era stored) owe nothing on this server;
   * REFUND_PAYLOAD_INVALID is listed as REFUND_NOT_REQUESTED (Part 4 final review C-7: nothing was sent, and the
   * charge's own refund requests say whether money is owed); REFUND_OUTCOME_UNKNOWN is checked in NETOPIA's admin;
   * every other code is still owed. The count only.
   */
  | "billing.refund.dead"
  /** P15: an account erasure stopped the owner's plan (ERASURE_STOPPED and the FREE entitlement). No field. */
  | "billing.erasure.stopped"
  /**
   * P15 (R3-2): the stop sweep ended the plan of an account the age gate froze (ERASURE_STOPPED marked
   * `stopped_for: "AGE_FROZEN"`). No field, so it is never read as an erasure.
   */
  | "billing.age_frozen.stopped"
  /** P16c: the quarter's tax summary was queued as email O1 to the owner; the field is the quarter label only. */
  | "billing.tax_summary.queued"
  /** N9 (spec 2026-10-05 §2.7.4): NETOPIA's message failed verification; the reason code only. */
  | "billing.notice.unverified"
  /** N9 (§2.7.3 step 2): a verified message names no charge and no tool order of ours. No field. */
  | "billing.notice.unknown_order"
  /** N9 (§2.7.3 step 1): a verified message whose body cannot be read; stored, the owner told (O3). No field. */
  | "billing.notice.parse_failed"
  /** N9 (§2.7.2): a message could not be stored, so NETOPIA was asked to send it again. No field. */
  | "billing.notice.store_failed"
  /** N9 (§2.7.4 step 2): the start's re-check of the quarantine; the counts only, or the failure's code. */
  | "billing.notice.recheck"
  /**
   * P17 (Q-3): M1's accepted-Terms attachment was not attached. The fields are the attachment kind and a code
   * (MAIL_TERMS_NOT_RECORDED or MAIL_TERMS_NOT_ARCHIVED) only, never a hash, a locale or an address.
   */
  | "billing.mail.attachment_missing";

export type BillingAuditField = string | number | boolean | null;
export type BillingAudit = (event: BillingAuditEvent, fields: Readonly<Record<string, BillingAuditField>>) => void;

export const consoleBillingAudit: BillingAudit = (event, fields) => {
  console.error(JSON.stringify(Object.freeze({ ...fields, event })));
};

/**
 * D5 5i: `PAYMENT_CREDENTIALS_REFUSED` (401/403) means NETOPIA processed nothing and our key is wrong or revoked. It is
 * never a payment failure: the caller leaves its charge or job open, and this writes the one operator alarm.
 */
export function credentialsRefused(audit: BillingAudit, error: unknown, operation: string): boolean {
  if (paymentErrorCode(error) !== "PAYMENT_CREDENTIALS_REFUSED") return false;
  audit("billing.payment.credentials_refused", { operation });
  return true;
}

/**
 * NETOPIA spec §2.3: `PAYMENT_RESPONSE_INVALID` is an answer of an unexpected shape. The caller treats it as its own
 * code says (a read is retried, a write's outcome is unknown); this writes the one content-free line.
 */
export function answerRejected(audit: BillingAudit, error: unknown, operation: string): boolean {
  if (paymentErrorCode(error) !== "PAYMENT_RESPONSE_INVALID") return false;
  audit("billing.payment.answer_rejected", { operation, code: "PAYMENT_RESPONSE_INVALID" });
  return true;
}
