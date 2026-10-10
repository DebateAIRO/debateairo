import type { PoolClient } from "pg";
import { microsToDecimal } from "@debateai/billing-core";
import { e164Phone, type BillingCardChangeResponse, type BillingCardDetailsResponse } from "@debateai/contract";
import type { BillingRepository } from "@debateai/db";
import { decideCardCountry } from "@debateai/geo";
import { netopiaLanguageOf } from "@debateai/payments-netopia";
import type { CountryPolicy } from "@debateai/register";
import type { BillingAudit } from "./audit.js";
import type { ConsentPair } from "./checkout.js";
import { assertCurrentAgreement, hostedStartDeps, recordCardAgreement, servedByNetopia, startHostedCharge } from "./hosted-payment.js";
import { clientIdOf, netopiaNotifyUrl, payerFromProfile, paymentReturnUrl } from "./netopia-payer.js";
import { decidePaymentPlace, placeRefusal } from "./place.js";
import { sealBillingProfile, type BillingProfile } from "./records.js";
import { rebillOutcomeOpen } from "./renewal.js";
import { chargeEvent, newChargeId } from "./rows.js";
import { APPLIED, type ChargeSettlement, type SettlementContext, type SettlementResult } from "./settlement.js";
import { storedTaxContext } from "./stored-tax-context.js";
import { appendChecked, lockedSubscription, refuse } from "./subscription-core.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";

/** Spec §2.11 (ruling C-2): NETOPIA checks the new card for 0, so nothing is held and nothing is released (A31 (j)). */
function cardCheckHoldMicros(): number {
  return 0;
}

/**
 * A RENEWAL charge of this subscription whose charge may have reached the processor with no outcome recorded
 * (`rebillOutcomeOpen`, which N11 taught NETOPIA's markers). A2, kept: the card never changes under such a renewal.
 * Read on `client`, the owner lock's own connection.
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

type CardDeps = Pick<SubscriptionRouteDeps,
  | "billing" | "jobs" | "legal" | "geo" | "countryPolicy" | "recordsKey" | "accountEmail" | "audit"
  | "paymentEnvironment" | "payments" | "acceptances" | "consentDocuments" | "orderText" | "publicAppUrl">;

/** A live plan (ACTIVE or PAST_DUE) of this API's NETOPIA environment; anything else has no card to change here. */
function liveNetopiaPlan(
  deps: Pick<SubscriptionRouteDeps, "paymentEnvironment">,
  state: Parameters<typeof servedByNetopia>[1] & Readonly<{ status: string }>
): boolean {
  return (state.status === "ACTIVE" || state.status === "PAST_DUE") && servedByNetopia(deps, state);
}

/**
 * Spec §2.11: the details the card page pre-fills: the tax location's country and region (read-only, §2.5.3), then the
 * newest profile's payer fields, each falling back to the checkout quote's sealed location.
 */
export async function readCardDetails(
  deps: Pick<SubscriptionRouteDeps, "billing" | "recordsKey" | "paymentEnvironment">, ownerRef: string
): Promise<BillingCardDetailsResponse> {
  const state = await deps.billing.subscriptionForOwner(ownerRef);
  if (state === null || !liveNetopiaPlan(deps, state)) refuse(409, "NOT_SUBSCRIBED");
  const stored = await storedTaxContext({ billing: deps.billing, recordsKey: deps.recordsKey }, state);
  const profile = stored.profile;
  const location = stored.quoteLocation;
  return Object.freeze({
    country: stored.location.country, region: location.region,
    first_name: profile?.firstName ?? location.firstName, last_name: profile?.lastName ?? location.lastName,
    phone: profile?.phone ?? location.phone, street: profile?.street ?? location.street,
    city: profile?.city ?? location.city, postal_code: profile?.postalCode ?? location.postalCode
  });
}

export type CardChangeInput = Readonly<{
  ownerRef: string; userId: string; ip: string; userAgent: string; locale: string; agreement: ConsentPair;
  details: Readonly<{ firstName: string; lastName: string; phone: string; street: string; city: string; postalCode: string | null }>;
  now: Date;
}>;

/**
 * The route (spec §2.11, ruling C-2): the gates (re-acceptance, the agreement in force, an erasure pending, a live
 * NETOPIA plan here, an E.164 phone, P8b's country gate at the declared country), then under the owner lock the 0
 * CARD_CHECK charge (no quote, no tax, its own one-day period), REQUESTED, the agreement and the profile with the
 * corrections and the payment address; then NETOPIA's page (N12's `startHostedCharge`, no lock held). The card takes
 * over only when VERIFY_PAYMENT reads the check paid or authorised AND its saved card is stored (`cardCheckGate`).
 */
export async function startCardChange(deps: CardDeps, input: CardChangeInput): Promise<BillingCardChangeResponse> {
  if (await deps.legal.requiresReacceptance(input.ownerRef)) refuse(403, "LEGAL_REACCEPTANCE_REQUIRED");
  assertCurrentAgreement(deps, input.locale, input.agreement);
  // P15 first: an account being erased saves no new card, whatever system its plan is in.
  if (await deps.billing.ownerErasurePending(input.ownerRef)) refuse(409, "ACCOUNT_ERASURE_PENDING");
  const before = await deps.billing.subscriptionForOwner(input.ownerRef);
  const environment = deps.paymentEnvironment;
  if (before === null || !liveNetopiaPlan(deps, before)) refuse(409, "NOT_SUBSCRIBED");
  // Ruling PR-43: the checkout's one E.164 rule (`e164Phone`), so a phone the checkout takes is taken here too.
  const phone = e164Phone(input.details.phone);
  if (phone === null) refuse(422, "BILLING_PHONE_INVALID");
  const stored = await storedTaxContext({ billing: deps.billing, recordsKey: deps.recordsKey }, before);
  const place = decidePaymentPlace({ geo: deps.geo, policy: deps.countryPolicy, ip: input.ip, declaredCountry: stored.location.country });
  if (place.kind === "REFUSE") throw placeRefusal(place, deps.audit);
  const email = await deps.accountEmail.read(input.userId);
  const { firstName, lastName, street, city, postalCode } = input.details;
  // SR-30: the corrections reach NETOPIA and the next page; the tax location (country, region) never moves.
  // The locale stored at checkout stays (as N12's upgrade); the card page's locale only when no profile is stored yet.
  const profileLocale = stored.profile?.locale ?? input.locale;
  const profile: BillingProfile = Object.freeze({
    email, locale: profileLocale, name: `${firstName} ${lastName}`, firstName, lastName, phone, paymentIp: input.ip,
    country: stored.location.country, region: stored.quoteLocation.region, postalCode, city, street,
    company: stored.profile?.company ?? null
  });
  const payer = payerFromProfile(profile, email);
  if (payer === null) refuse(422, "BILLING_ADDRESS_REQUIRED");
  const hold = cardCheckHoldMicros();
  const chargeId = newChargeId();
  await deps.billing.withTransaction(async (client) => {
    const locked = await lockedSubscription(deps, client, input.ownerRef);
    if (locked === null || locked.state.subscriptionId !== before.subscriptionId || !liveNetopiaPlan(deps, locked.state)) {
      refuse(409, "NOT_SUBSCRIBED");
    }
    if (await deps.billing.ownerErasurePending(input.ownerRef, client)) refuse(409, "ACCOUNT_ERASURE_PENDING");
    if (await renewalOutcomeOpen(deps.billing, client, before.subscriptionId)) refuse(409, "CARD_CHANGE_NOT_AVAILABLE_NOW");
    // Each check's period starts at its own request, so only checks asked in the same millisecond share A2's charge key
    // (a retry right after a failed start); they count up within 0086's attempts 1..4.
    const sameKey = (await deps.billing.chargesForSubscription(before.subscriptionId, client))
      .filter((row) => row.kind === "CARD_CHECK" && row.periodStart.getTime() === input.now.getTime());
    if (sameKey.length >= 4) refuse(409, "CARD_CHANGE_NOT_AVAILABLE_NOW");
    await deps.billing.insertCharge(client, Object.freeze({
      chargeId, ownerRef: input.ownerRef, subscriptionId: before.subscriptionId, kind: "CARD_CHECK" as const,
      attempt: sameKey.length + 1,
      periodStart: input.now, periodEnd: new Date(input.now.getTime() + 86_400_000), quoteId: null,
      netMicros: hold, taxMicros: 0, totalMicros: hold, currency: "USD" as const, createdAt: input.now,
      paymentProvider: "netopia" as const, paymentEnvironment: environment
    }));
    await deps.billing.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", input.now, {
      providerPaymentId: null, amountMicros: hold, errorCode: null
    }));
    await recordCardAgreement(deps, client, {
      ownerRef: input.ownerRef, locale: input.locale, agreement: input.agreement, surface: "CARD_CHANGE", ip: input.ip,
      userAgent: input.userAgent, at: input.now
    });
    const sealed = sealBillingProfile(deps.recordsKey, stored.customerId, profile);
    await deps.billing.appendProfile(client, {
      customerId: stored.customerId, at: input.now, locale: profileLocale, profileCiphertext: sealed.ciphertext, keyId: sealed.keyId
    });
  });
  deps.audit("billing.card.change.started", { status: before.status });
  const redirectUrl = await startHostedCharge(hostedStartDeps(deps, environment), {
    operation: "card_check", now: input.now,
    start: {
      orderId: chargeId, amountMicros: hold, currency: "USD", description: deps.orderText("CARD_CHECK", input.locale, {}),
      payer, clientId: clientIdOf(stored.customerId), returnUrl: paymentReturnUrl(deps.publicAppUrl, "/settings/card", chargeId),
      notifyUrl: netopiaNotifyUrl(deps.publicAppUrl), language: netopiaLanguageOf(input.locale)
    }
  });
  return Object.freeze({ redirect_url: redirectUrl, charge_ref: chargeId, hold_amount: microsToDecimal(hold) });
}

type CardCheckRefusal = "CARD_CHECK_NOT_LIVE" | "CARD_CHECK_REFUSED" | "CARD_CHECK_DEFERRED";

/**
 * The CARD_CHECK charge kind's settlement on VERIFY_PAYMENT, inside its one transaction under the owner lock, with the
 * new card's issuing country in `context.cardCountry`. A subscription that stopped being live changes nothing
 * (`CARD_CHECK_NOT_LIVE`); a card of an always-blocked country is refused (`CARD_CHECK_REFUSED`, the old card stays); a
 * renewal whose charge may have reached the processor defers the change (`CARD_CHECK_DEFERRED`). Each refusal is a
 * REFUND result; on NETOPIA its 0.00 release is recorded with no call and the check's own saved card is revoked
 * NOT_ADOPTED (SR-1). NETOPIA's success (N13, spec §2.11): CARD_CHANGED with the card N10 adopted at the decision, the
 * old card revoked REPLACED, nothing released (a 0 check holds nothing). Every read runs on `context.client`.
 */
export function createCardCheckSettlement(deps: Readonly<{
  repository: Pick<BillingRepository,
    | "appendSubscriptionEvent" | "chargesForSubscription" | "charge" | "quote" | "customerByOwner" | "latestProfile"
    | "cardTokensFromCharge" | "revokeCardToken">;
  recordsKey: Buffer;
  countryPolicy: CountryPolicy;
  audit: BillingAudit;
}>): ChargeSettlement {
  return Object.freeze({
    async succeeded(context: SettlementContext): Promise<SettlementResult> {
      const { subscription, payment, client, now, cardCountry } = context;
      if (payment === null) throw new TypeError("BILLING_CARD_CHECK_WITHOUT_PAYMENT");
      const repository = deps.repository;
      const refused = async (reason: CardCheckRefusal): Promise<SettlementResult> => {
        for (const token of await repository.cardTokensFromCharge(client, context.charge.chargeId)) {
          await repository.revokeCardToken(client, { tokenId: token.tokenId, at: now, reason: "NOT_ADOPTED" });
        }
        return Object.freeze({ kind: "REFUND" as const, reason });
      };
      if (subscription.status !== "ACTIVE" && subscription.status !== "PAST_DUE") return refused("CARD_CHECK_NOT_LIVE");
      const throughClient = Object.freeze({
        chargesForSubscription: (subscriptionId: string) => repository.chargesForSubscription(subscriptionId, client),
        quote: (quoteId: string, ownerRef: string) => repository.quote(quoteId, ownerRef, client),
        customerByOwner: (ownerRef: string) => repository.customerByOwner(ownerRef, client),
        latestProfile: (customerId: string) => repository.latestProfile(customerId, client)
      });
      const stored = await storedTaxContext({ billing: throughClient, recordsKey: deps.recordsKey }, subscription);
      const verdict = decideCardCountry(deps.countryPolicy, { declaredCountry: stored.location.country, cardCountry });
      if (verdict === "BLOCKED") {
        deps.audit("billing.card.refused", { country: cardCountry ?? "XX" });
        return refused("CARD_CHECK_REFUSED");
      }
      if (await renewalOutcomeOpen(repository, client, subscription.subscriptionId)) {
        deps.audit("billing.card.change.deferred", {});
        return refused("CARD_CHECK_DEFERRED");
      }
      const locked = { state: subscription, events: context.events };
      const data = { charge_id: context.charge.chargeId, retry_now: subscription.status === "PAST_DUE" };
      // N10 chose the newest eligible token of this check (§2.15.2); none means the card cannot be used: try again.
      if (payment.cardTokenId === null) {
        deps.audit("billing.card.not_adopted", {});
        return refused("CARD_CHECK_DEFERRED");
      }
      await appendChecked(repository, client, locked, { kind: "CARD_CHANGED", at: now, cardTokenId: payment.cardTokenId, data });
      if (subscription.cardTokenId !== null && subscription.cardTokenId !== payment.cardTokenId) {
        await repository.revokeCardToken(client, { tokenId: subscription.cardTokenId, at: now, reason: "REPLACED" });
      }
      return APPLIED;
    },
    async failed(): Promise<void> {
      return;
    }
  });
}
