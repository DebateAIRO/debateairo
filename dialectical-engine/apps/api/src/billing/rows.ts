import { randomUUID } from "node:crypto";
import type { SubscriptionEvent, SubscriptionEventKind, SubscriptionState } from "@debateai/billing-core";
import type { ChargeEventInput, ChargeEventKind } from "@debateai/db";

/** A24: our charge id is NETOPIA's orderID (spec 2026-10-05 §2.8): 32 lower-case hex, a uuid without dashes. */
export function newChargeId(): string {
  return randomUUID().replaceAll("-", "");
}

/**
 * One charge event to append (P1b's `ChargeEventInput`): the repository takes the provider and environment from the
 * charge row itself (D5 5h), so no caller can name another. `refundsTransactionId` names the paid payment a separate
 * refund transaction refunded (D5 5g); 0096 refuses it on a NETOPIA row, so only old rows hold one. `providerCreatedAt`
 * (D5 5m) is the payment's own time as NETOPIA reports it, given only on a row that IS the payment (its SUCCEEDED):
 * P1b's quarter rows date the row by it, so a payment taken on 31 March and verified on 1 April stays in Q1. P1a
 * refuses it on a row that names no payment.
 */
export function chargeEvent(
  chargeId: string, kind: ChargeEventKind, at: Date,
  fields: Readonly<{
    providerPaymentId: string | null; amountMicros: number | null; errorCode: string | null; refundsTransactionId?: string | null;
    providerCreatedAt?: Date | null;
  }>
): ChargeEventInput {
  return Object.freeze({ eventId: randomUUID(), chargeId, kind, at, ...fields });
}

/**
 * The paid payment a REFUND_REQUESTED / REFUNDED row refunds: its own, unless the row is an old one of a separate
 * refund transaction (0086's `refunds_transaction_id`, which old rows may still hold).
 */
export function refundTarget(event: Readonly<{ providerPaymentId: string | null; refundsTransactionId: string | null }>): string | null {
  return event.refundsTransactionId ?? event.providerPaymentId;
}

type SubscriptionIdentity = Pick<SubscriptionState,
  "subscriptionId" | "ownerRef" | "planId" | "periodAnchorAt">;

/**
 * The next event of an existing subscription: identity carried over, `changes` overriding what moves. The card is
 * never carried over (spec 2026-10-05 §2.15.2: only an adopting event names one, and only when it adopts it).
 */
export function subscriptionEvent(
  state: SubscriptionIdentity, kind: SubscriptionEventKind, at: Date, data: SubscriptionEvent["data"],
  changes: Partial<Pick<SubscriptionEvent, "planId" | "periodAnchorAt" | "cardTokenId">> = {}
): SubscriptionEvent {
  return Object.freeze({
    eventId: randomUUID(), subscriptionId: state.subscriptionId, ownerRef: state.ownerRef, kind, at,
    planId: state.planId, periodAnchorAt: state.periodAnchorAt, cardTokenId: null, ...changes,
    data: Object.freeze({ ...data })
  });
}
