import type { PoolClient } from "pg";
import { microsToDecimal } from "@debateai/billing-core";
import { decideCardCountry } from "@debateai/geo";
import type { BillingCardChangeResponse } from "@debateai/contract";
import type { BillingRepository } from "@debateai/db";
import type { CountryPolicy } from "@debateai/register";
import type { BillingAudit } from "./audit.js";
import { decidePaymentPlace, placeRefusal } from "./place.js";
import { rebillOutcomeOpen } from "./renewal.js";
import { chargeEvent, newChargeId } from "./rows.js";
import type { ChargeSettlement, SettlementContext, SettlementResult } from "./settlement.js";
import { storedTaxContext } from "./stored-tax-context.js";
import { appendChecked, lockedSubscription, refuse } from "./subscription-core.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";

/** A12: the hold that proves a card. X0's recording switches it to 0 if `auth` accepts a zero amount. */
function cardCheckHoldMicros(): number {
  return 1_000_000;
}

/**
 * A RENEWAL charge of this subscription whose rebill may have reached xMoney with no outcome recorded (P11a's
 * `rebillOutcomeOpen`). P11a adopts such a charge on every order that could hold its payment (`ordersHoldingCharge`)
 * and after 30 quiet minutes resubmits it on the subscription's current order; the order still does not move under it
 * (defense in depth: A2 forbids a resubmission of an unknown outcome, and a moved order would leave that rule to one
 * lookup over two orders). Read on `client`, the owner lock's own connection.
 */
async function renewalOutcomeOpen(
  billing: Pick<BillingRepository, "chargesForSubscription" | "charge">, client: PoolClient, subscriptionId: string
): Promise<boolean> {
  for (const row of await billing.chargesForSubscription(subscriptionId, client)) {
    if (row.kind !== "RENEWAL") continue;
    const read = await billing.charge(row.chargeId, client);
    if (read !== null && rebillOutcomeOpen(read.events)) return true;
  }
  return false;
}

/**
 * The route (A12, R-17): the re-acceptance gate (spec §2.3.2), P8b's country gate at the declared country stored at
 * checkout, a CARD_CHECK charge under the owner lock, then P8c's `signEmbeddedOrder` for a managed 1.00 USD order in
 * `auth` mode that returns to `/settings/card`. The person pays nothing: the hold is released once VERIFY_PAYMENT
 * has seen it authorized, and the order and the card take over only then. The charge has no quote and no tax, and
 * its own one-day period, so every attempt is its own row under A2's unique key. It names the connectors' xMoney
 * system, the one the new order is created in; a subscription created in the other system is refused (D5 5h).
 */
export async function startCardChange(
  deps: Pick<SubscriptionRouteDeps,
    | "billing" | "jobs" | "legal" | "geo" | "countryPolicy" | "recordsKey" | "accountEmail" | "checkout" | "audit"
    | "xmoneyEnvironment">,
  input: Readonly<{ ownerRef: string; userId: string; ip: string; now: Date }>
): Promise<BillingCardChangeResponse> {
  if (await deps.legal.requiresReacceptance(input.ownerRef)) refuse(403, "LEGAL_REACCEPTANCE_REQUIRED");
  const before = await deps.billing.subscriptionForOwner(input.ownerRef);
  if (before === null || (before.status !== "ACTIVE" && before.status !== "PAST_DUE")
    || before.xmoneyEnvironment !== deps.xmoneyEnvironment) {
    refuse(409, "NOT_SUBSCRIBED");
  }
  const stored = await storedTaxContext({ billing: deps.billing, recordsKey: deps.recordsKey }, before);
  const declaredCountry = stored.location.country;
  const place = decidePaymentPlace({ geo: deps.geo, policy: deps.countryPolicy, ip: input.ip, declaredCountry });
  if (place.kind === "REFUSE") throw placeRefusal(place, deps.audit);
  const email = await deps.accountEmail.read(input.userId);
  const hold = cardCheckHoldMicros();
  const chargeId = newChargeId();
  await deps.billing.withTransaction(async (client) => {
    const locked = await lockedSubscription(deps, client, input.ownerRef);
    if (locked === null || locked.state.subscriptionId !== before.subscriptionId
      || (locked.state.status !== "ACTIVE" && locked.state.status !== "PAST_DUE")) {
      refuse(409, "NOT_SUBSCRIBED");
    }
    // A2, defense in depth: never move the order under a renewal whose rebill may have reached xMoney.
    if (await renewalOutcomeOpen(deps.billing, client, before.subscriptionId)) refuse(409, "CARD_CHANGE_NOT_AVAILABLE_NOW");
    await deps.billing.insertCharge(client, Object.freeze({
      chargeId, ownerRef: input.ownerRef, subscriptionId: before.subscriptionId, kind: "CARD_CHECK" as const,
      attempt: 1, periodStart: input.now, periodEnd: new Date(input.now.getTime() + 86_400_000), quoteId: null,
      netMicros: hold, taxMicros: 0, totalMicros: hold, currency: "USD" as const, createdAt: input.now,
      xmoneyEnvironment: deps.xmoneyEnvironment
    }));
    await deps.billing.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", input.now, {
      xmoneyTransactionId: null, amountMicros: hold, errorCode: null
    }));
  });
  // P8c words the order line (`orderText`, the catalogue's `order.cardCheck`) in the person's own language.
  const signed = deps.checkout.signEmbeddedOrder({
    chargeId, customerIdentifier: stored.customerId, email, country: declaredCountry, amountMicros: hold,
    purpose: { kind: "CARD_CHECK" }, locale: stored.profile?.locale ?? "en",
    cardTransactionMode: "auth", returnPath: "/settings/card"
  });
  deps.audit("billing.card.change.started", { status: before.status });
  return Object.freeze({
    public_key: signed.publicKey, order_payload: signed.orderPayload, order_checksum: signed.orderChecksum,
    charge_ref: chargeId, sdk_environment: signed.xmoneyEnvironment,
    // The amount of the order just signed (1.00 today; 0.00 if X0 switches `cardCheckHoldMicros`): P20 names it.
    hold_amount: microsToDecimal(hold)
  });
}

/** The hold is always released; RefundDesk makes the call after VERIFY_PAYMENT's commit (R-32). */
const RELEASE: SettlementResult = Object.freeze({ kind: "REFUND" as const, reason: "CARD_CHECK_RELEASE" as const });

/**
 * The CARD_CHECK charge kind's settlement on P9b's VerifyPaymentHandler, inside its one transaction under the owner
 * lock, with the new card's issuing country in `context.cardCountry`. The new order and card take over only for a
 * live subscription and a card whose country we can serve. A card from an always-blocked country is a refused card
 * check (`CARD_CHECK_REFUSED`: RefundDesk releases the hold and sends nothing; P9b never ends a subscription for a
 * refused CARD_CHECK), and the old card stays. A renewal whose rebill may have reached xMoney (it can go unknown
 * after `startCardChange` checked) defers the change: no CARD_CHANGED, the hold goes back as `CARD_CHECK_DEFERRED`
 * (the status reads FAILED with it: "try again shortly", never success), and the old order stays under P11a's
 * adoption (A2). A declined card check changes nothing. The stored location and the charges are read on the
 * settlement's own connection (`context.client`), never through a second pool connection.
 */
export function createCardCheckSettlement(deps: Readonly<{
  repository: Pick<BillingRepository,
    "appendSubscriptionEvent" | "chargesForSubscription" | "charge" | "quote" | "customerByOwner" | "latestProfile">;
  recordsKey: Buffer;
  countryPolicy: CountryPolicy;
  audit: BillingAudit;
}>): ChargeSettlement {
  return Object.freeze({
    async succeeded(context: SettlementContext): Promise<SettlementResult> {
      const { subscription, transaction, client, now, cardCountry } = context;
      if (transaction === null) throw new TypeError("BILLING_CARD_CHECK_WITHOUT_TRANSACTION");
      if (subscription.status !== "ACTIVE" && subscription.status !== "PAST_DUE") return RELEASE;
      const repository = deps.repository;
      const throughClient = Object.freeze({
        chargesForSubscription: (subscriptionId: string) => repository.chargesForSubscription(subscriptionId, client),
        quote: (quoteId: string, ownerRef: string) => repository.quote(quoteId, ownerRef, client),
        customerByOwner: (ownerRef: string) => repository.customerByOwner(ownerRef, undefined, client),
        latestProfile: (customerId: string) => repository.latestProfile(customerId, client)
      });
      const stored = await storedTaxContext({ billing: throughClient, recordsKey: deps.recordsKey }, subscription);
      const verdict = decideCardCountry(deps.countryPolicy, { declaredCountry: stored.location.country, cardCountry });
      if (verdict === "BLOCKED") {
        deps.audit("billing.card.refused", { country: cardCountry ?? "XX" });
        return Object.freeze({ kind: "REFUND" as const, reason: "CARD_CHECK_REFUSED" as const });
      }
      if (await renewalOutcomeOpen(repository, client, subscription.subscriptionId)) {
        deps.audit("billing.card.change.deferred", {});
        return Object.freeze({ kind: "REFUND" as const, reason: "CARD_CHECK_DEFERRED" as const });
      }
      await appendChecked(deps.repository, client, { state: subscription, events: context.events }, {
        kind: "CARD_CHANGED", at: now, xmoneyOrderId: transaction.orderId, xmoneyCustomerId: transaction.customerId,
        cardRef: transaction.cardId,
        data: { charge_id: context.charge.chargeId, retry_now: subscription.status === "PAST_DUE" }
      });
      return RELEASE;
    },
    async failed(): Promise<void> {
      return;
    }
  });
}
