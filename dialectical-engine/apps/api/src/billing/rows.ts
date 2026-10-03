import { randomUUID } from "node:crypto";
import type { SubscriptionEvent, SubscriptionEventKind, SubscriptionState } from "@debateai/billing-core";
import type { ChargeEventInput, ChargeEventKind } from "@debateai/db";

/** A24: our charge id is xMoney's merchant order id: 32 lower-case hex, a uuid without dashes. */
export function newChargeId(): string {
  return randomUUID().replaceAll("-", "");
}

/**
 * One charge event to append (P1b's `ChargeEventInput`): the repository takes the xMoney system from the charge row
 * itself (D5 5h), so no caller can name another. `refundsTransactionId` is set only on a REFUNDED row written for a
 * refund that is its own xMoney transaction: it names the paid transaction refunded (D5 5g). `xmoneyCreatedAt` (D5
 * 5m) is the xMoney transaction's own `creationDate`, given only on a row that transaction IS (a payment's SUCCEEDED
 * or DUPLICATE_PAYMENT, a refund transaction's REFUNDED): P1b's quarter rows date the row by it, so a payment taken on
 * 31 March and verified on 1 April stays in Q1. P1a refuses it on a row that names no transaction.
 */
export function chargeEvent(
  chargeId: string, kind: ChargeEventKind, at: Date,
  fields: Readonly<{
    xmoneyTransactionId: string | null; amountMicros: number | null; errorCode: string | null; refundsTransactionId?: string | null;
    xmoneyCreatedAt?: Date | null;
  }>
): ChargeEventInput {
  return Object.freeze({ eventId: randomUUID(), chargeId, kind, at, ...fields });
}

/** The paid transaction a REFUND_REQUESTED / REFUNDED row refunds: its own, unless it is a separate refund transaction. */
export function refundTarget(event: Readonly<{ xmoneyTransactionId: string | null; refundsTransactionId: string | null }>): string | null {
  return event.refundsTransactionId ?? event.xmoneyTransactionId;
}

/**
 * What an xMoney transaction is to us, by its `transactionType` (A9, D5 5g, P2-I2): a payment (`deposit`, or no type
 * at all), a refund or a representment (each with its own path), or a dispute: every other type (`chargeback`, and
 * `credit` or one we do not know yet), which belongs to the payment it names (`relatedTransactionIds`) and is never
 * matched as a payment of its order. VERIFY_PAYMENT and the reconciler route by this one rule.
 */
export type TransactionRoute = "PAYMENT" | "REFUND" | "REPRESENTMENT" | "DISPUTE";
export function transactionRoute(transactionType: string | null): TransactionRoute {
  if (transactionType === null || transactionType === "deposit") return "PAYMENT";
  if (transactionType === "refund") return "REFUND";
  if (transactionType === "representment") return "REPRESENTMENT";
  return "DISPUTE";
}

type SubscriptionIdentity = Pick<SubscriptionState,
  "subscriptionId" | "ownerRef" | "planId" | "periodAnchorAt" | "xmoneyOrderId" | "xmoneyCustomerId" | "cardRef">;

/** The next event of an existing subscription: identity carried over, `changes` overriding what moves. */
export function subscriptionEvent(
  state: SubscriptionIdentity, kind: SubscriptionEventKind, at: Date, data: SubscriptionEvent["data"],
  changes: Partial<Pick<SubscriptionEvent, "planId" | "periodAnchorAt" | "xmoneyOrderId" | "xmoneyCustomerId" | "cardRef">> = {}
): SubscriptionEvent {
  return Object.freeze({
    eventId: randomUUID(), subscriptionId: state.subscriptionId, ownerRef: state.ownerRef, kind, at,
    planId: state.planId, periodAnchorAt: state.periodAnchorAt, xmoneyOrderId: state.xmoneyOrderId,
    xmoneyCustomerId: state.xmoneyCustomerId, cardRef: state.cardRef, ...changes, data: Object.freeze({ ...data })
  });
}
