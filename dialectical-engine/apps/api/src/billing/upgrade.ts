import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import { microsToDecimal, upgradeMonthCreditOverrideMicros, upgradeProrationMicros, type SubscriptionState } from "@debateai/billing-core";
import type { BillingUpgradeQuoteResponse, BillingUpgradeResponse } from "@debateai/contract";
import type { BillingRepository, ChargeRow, EntitlementRepository, QuoteRow } from "@debateai/db";
import { netopiaLanguageOf } from "@debateai/payments-netopia";
import { planById, type BillingPlans, type PlanId } from "@debateai/register";
import type { ConsentPair } from "./checkout.js";
import {
  assertCurrentAgreement, bestPaymentId, closeUnpaidHostedCharge, hostedStartDeps, paidOrAlmost, readPaymentStatus,
  recordCardAgreement, servedByNetopia, startHostedCharge, stillPayable
} from "./hosted-payment.js";
import { clientIdOf, netopiaNotifyUrl, payerFromProfile, paymentReturnUrl } from "./netopia-payer.js";
import { planName } from "./order-text.js";
import { decidePaymentPlace, placeRefusal } from "./place.js";
import { openPaymentUrl, sealBillingProfile, sealQuoteLocation } from "./records.js";
import { BillingRefusal } from "./refusal.js";
import { queueVerifyNow } from "./renewal.js";
import { recurringNetOf, renewalLeadMs, renewalPendingUntil } from "./renewal-rules.js";
import { chargeEvent, newChargeId } from "./rows.js";
import { APPLIED, type ChargeSettlement, type SettlementContext, type SettlementResult } from "./settlement.js";
import { quoteTax, storedTaxContext, type StoredTaxContext } from "./stored-tax-context.js";
import { appendChecked, lockedSubscription, refuse, type NextEvent } from "./subscription-core.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";

/** How long a REQUESTED upgrade with no page yet counts as a start on its way (the call's own time bound). */
const START_IN_FLIGHT_MS = 60_000;


/**
 * An UPGRADE charge belongs to the period it was quoted in: its key runs from the quote's creation to that period's
 * end. It applies only while that period is still the subscription's current one.
 */
export function chargeInCurrentPeriod(
  charge: Pick<ChargeRow, "periodStart" | "periodEnd">, state: SubscriptionState
): boolean {
  return state.currentPeriodStart !== null && state.currentPeriodEnd !== null
    && charge.periodEnd.getTime() === state.currentPeriodEnd.getTime()
    && charge.periodStart.getTime() >= state.currentPeriodStart.getTime();
}

/**
 * The renewal of this period is due, postponed or already charging: inside `renewalLeadMs()` of the period end, a
 * postponed renewal running, or a RENEWAL charge for the next period already there (which needs no two clocks to
 * agree). An upgrade now could race the renewal charge, so it waits for the new period.
 */
function renewalUnderWay(
  state: SubscriptionState, charges: ReadonlyArray<Pick<ChargeRow, "kind" | "periodStart">>, now: Date
): boolean {
  if (state.currentPeriodEnd === null || state.renewalPostponedUntil !== null) return true;
  const end = state.currentPeriodEnd.getTime();
  return now.getTime() >= end - renewalLeadMs()
    || charges.some((charge) => charge.kind === "RENEWAL" && charge.periodStart.getTime() === end);
}

/**
 * The payment gate every card action shares with checkout: re-acceptance (spec §2.3.2), then P8b's country
 * decision on the caller's address and the declared country stored at checkout. Returns the address's country
 * (location evidence for the new quote).
 */
export async function gateCardAction(
  deps: Pick<SubscriptionRouteDeps, "legal" | "geo" | "countryPolicy" | "audit">,
  ownerRef: string, ip: string, context: StoredTaxContext
): Promise<string> {
  if (await deps.legal.requiresReacceptance(ownerRef)) refuse(403, "LEGAL_REACCEPTANCE_REQUIRED");
  const declaredCountry = context.location.country;
  const place = decidePaymentPlace({ geo: deps.geo, policy: deps.countryPolicy, ip, declaredCountry });
  if (place.kind === "REFUSE") throw placeRefusal(place, deps.audit);
  return place.ipCountry;
}

/**
 * Terms §12: the net this subscription pays now (the latest ACTIVATED / UPGRADED, or the downgrade a renewal
 * applied), P11a's `recurringNetOf`. Never the register's current price, which only reaches new checkouts.
 */
function ownNetMicros(events: Parameters<typeof recurringNetOf>[0]): number {
  const current = recurringNetOf(events).currentMicros;
  if (current === null) {
    throw new TypedDomainError("BILLING_RECURRING_PRICE_MISSING", "The subscription's history records no recurring net");
  }
  return current;
}

/**
 * The UPGRADE quote: (new net − old net) × remaining seconds ÷ period seconds in whole cents (P2), taxed at P11's
 * stored location — the old net being the subscriber's own (`ownNetMicros`, Terms §12), the new one the higher plan's
 * price today; and A7's announced recurring total — the new plan's full monthly price with tax — kept on the same
 * quote row (`recurring_total_micros`, R-31) for the UPGRADED event.
 */
export async function quoteUpgrade(deps: SubscriptionRouteDeps, input: Readonly<{
  ownerRef: string; planId: "PRO" | "MAX"; ip: string; now: Date;
}>): Promise<BillingUpgradeQuoteResponse> {
  const state = await deps.billing.subscriptionForOwner(input.ownerRef);
  if (state === null || state.status !== "ACTIVE" || state.currentPeriodStart === null || state.currentPeriodEnd === null) {
    refuse(409, "NOT_SUBSCRIBED");
  }
  // P15: an account being erased takes no new money (the person stays signed in for the 7-day grace).
  if (await deps.billing.ownerErasurePending(input.ownerRef)) refuse(409, "ACCOUNT_ERASURE_PENDING");
  const current = planById(deps.plans, state.planId);
  const target = planById(deps.plans, input.planId);
  if (target.netPriceMicros <= current.netPriceMicros) refuse(422, "UPGRADE_NOT_HIGHER");
  if (renewalUnderWay(state, await deps.billing.chargesForSubscription(state.subscriptionId), input.now)) {
    refuse(409, "UPGRADE_NOT_AVAILABLE_NOW");
  }
  const oldNetMicros = ownNetMicros(await deps.billing.subscriptionEvents(state.subscriptionId));
  // A plan bought dearer than the higher plan costs today has nothing to prorate upwards.
  if (target.netPriceMicros <= oldNetMicros) refuse(422, "UPGRADE_NOT_HIGHER");
  const context = await storedTaxContext({ billing: deps.billing, recordsKey: deps.recordsKey }, state);
  const ipCountry = await gateCardAction(deps, input.ownerRef, input.ip, context);
  const netMicros = upgradeProrationMicros({
    oldNetMicros, newNetMicros: target.netPriceMicros,
    periodStart: state.currentPeriodStart, periodEnd: state.currentPeriodEnd, now: input.now
  });
  // Rounded to whole cents, a difference too small for the time left prices at zero: the same answer as the lead.
  if (netMicros <= 0) refuse(409, "UPGRADE_NOT_AVAILABLE_NOW");
  const prorated = await quoteTax(deps.tax, deps.policy, context, netMicros, input.now);
  const recurring = await quoteTax(deps.tax, deps.policy, context, target.netPriceMicros, input.now);
  const quoteId = randomUUID();
  const sealed = sealQuoteLocation(deps.recordsKey, quoteId, { ...context.quoteLocation, ip: input.ip, ipCountry });
  const expiresAt = new Date(input.now.getTime() + deps.policy.quoteTtlSeconds * 1_000);
  const row: QuoteRow = Object.freeze({
    quoteId, ownerRef: input.ownerRef, planId: input.planId, kind: "UPGRADE",
    netMicros: prorated.netMicros, taxMicros: prorated.taxMicros, totalMicros: prorated.totalMicros,
    taxCountry: prorated.taxCountry, taxRegion: prorated.taxRegion, taxRateBasisPoints: prorated.taxRateBasisPoints,
    taxStatus: prorated.status, taxName: prorated.taxName, quadernoRef: prorated.reference,
    createdAt: input.now, expiresAt, locationCiphertext: sealed.ciphertext, keyId: sealed.keyId,
    recurringTotalMicros: recurring.totalMicros
  });
  await deps.billing.withTransaction((client) => deps.billing.insertQuote(client, row));
  return Object.freeze({
    quote_ref: quoteId, plan_id: input.planId,
    net: microsToDecimal(prorated.netMicros), tax: microsToDecimal(prorated.taxMicros),
    total: microsToDecimal(prorated.totalMicros), tax_name: prorated.taxName,
    tax_rate_basis_points: prorated.taxRateBasisPoints, tax_country: prorated.taxCountry,
    recurring_total: microsToDecimal(recurring.totalMicros),
    renews_on: state.currentPeriodEnd.toISOString(), expires_at: expiresAt.toISOString()
  });
}

/** Spec §2.10's one open upgrade, as the read before the lock found it. */
type OpenUpgrade =
  | Readonly<{ kind: "NONE" }>
  | Readonly<{ kind: "PENDING"; chargeId: string }>
  | Readonly<{ kind: "REUSE"; chargeId: string; redirectUrl: string }>;

type Prepared =
  | Readonly<{ kind: "EXISTING"; chargeId: string; redirectUrl: string | null }>
  | Readonly<{ kind: "NEW"; chargeId: string; totalMicros: number }>;

export type UpgradeInput = Readonly<{
  ownerRef: string; userId: string; planId: "PRO" | "MAX"; quoteRef: string; ip: string; userAgent: string;
  /** The interface locale the agreement was shown in; also NETOPIA's page language and the order line's. */
  locale: string;
  /** Spec §2.18: the renewal sentence's manifest pair the page showed with the new plan's monthly total. */
  agreement: ConsentPair;
}>;

/**
 * Spec §2.10 (ruling C-1): the gates, the one open upgrade (`openUpgrade`), then under P7's subscription lease and the
 * owner lock (every write on the lease's own connection) the UPGRADE charge, the quote's one use, REQUESTED, the
 * agreement and the profile; the lease is released before NETOPIA is called (the start moves no money).
 */
export async function startUpgrade(deps: SubscriptionRouteDeps, input: UpgradeInput): Promise<BillingUpgradeResponse> {
  const now = deps.clock();
  if (await deps.legal.requiresReacceptance(input.ownerRef)) refuse(403, "LEGAL_REACCEPTANCE_REQUIRED");
  assertCurrentAgreement(deps, input.locale, input.agreement);
  // P15 first: an account being erased takes no new money, whatever system its plan is in.
  if (await deps.billing.ownerErasurePending(input.ownerRef)) refuse(409, "ACCOUNT_ERASURE_PENDING");
  const before = await deps.billing.subscriptionForOwner(input.ownerRef);
  const environment = deps.paymentEnvironment;
  if (before === null || before.status !== "ACTIVE" || !servedByNetopia(deps, before)) {
    refuse(409, "NOT_SUBSCRIBED");
  }
  const open = await openUpgrade(deps, before, input.quoteRef, now);
  if (open.kind === "PENDING") throw new BillingRefusal(409, "UPGRADE_PENDING", open.chargeId);
  if (open.kind === "REUSE") return Object.freeze({ redirect_url: open.redirectUrl, charge_ref: open.chargeId });
  const stored = await storedTaxContext({ billing: deps.billing, recordsKey: deps.recordsKey }, before);
  const email = await deps.accountEmail.read(input.userId);
  // Spec §2.5.3: NETOPIA's payer (names, phone, street, city) from the newest profile, the account's current email.
  const payer = payerFromProfile(stored.profile, email);
  if (payer === null || stored.profile === null) refuse(422, "BILLING_ADDRESS_REQUIRED");
  const profile = stored.profile;
  const leased = await deps.jobs.withSubscriptionLease(before.subscriptionId, (leaseClient) =>
    deps.billing.withTransactionOn(leaseClient, (client) => prepareUpgrade(deps, client, input, {
      subscriptionId: before.subscriptionId, environment, customerId: stored.customerId,
      profile: { ...profile, email, paymentIp: input.ip }, now
    })));
  if (leased.kind === "BUSY") refuse(409, "UPGRADE_IN_PROGRESS");
  const prepared = leased.value;
  if (prepared.kind === "EXISTING") {
    // A second tab spent this quote while this request was being checked: its page, or wait for its start.
    if (prepared.redirectUrl === null) throw new BillingRefusal(409, "UPGRADE_PENDING", prepared.chargeId);
    return Object.freeze({ redirect_url: prepared.redirectUrl, charge_ref: prepared.chargeId });
  }
  deps.audit("billing.upgrade.requested", { plan_id: input.planId });
  const redirectUrl = await startHostedCharge(hostedStartDeps(deps, environment), {
    operation: "upgrade", now,
    start: {
      orderId: prepared.chargeId, amountMicros: prepared.totalMicros, currency: "USD",
      description: deps.orderText("ORDER_PLAN", input.locale, { plan: planName(input.planId) }), payer,
      clientId: clientIdOf(stored.customerId),
      returnUrl: paymentReturnUrl(deps.publicAppUrl, "/checkout/return", prepared.chargeId),
      notifyUrl: netopiaNotifyUrl(deps.publicAppUrl), language: netopiaLanguageOf(input.locale)
    }
  });
  return Object.freeze({ redirect_url: redirectUrl, charge_ref: prepared.chargeId });
}

/**
 * Spec §2.10's one open upgrade, before any lock, newest first, from our rows and one logged status read each: paid or
 * almost, unreadable, or a start in flight → PENDING (PAID also queues VERIFY_PAYMENT); the same quote within its
 * lifetime on a payable page → REUSE; anything else is closed FAILED(NO_TRANSACTION) (SR-23: reuse is for the same quote
 * only; the settlement still decides a late payment). A declined upgrade blocks nothing.
 */
async function openUpgrade(
  deps: SubscriptionRouteDeps, state: SubscriptionState, quoteRef: string, now: Date
): Promise<OpenUpgrade> {
  const upgrades = (await deps.billing.chargesForSubscription(state.subscriptionId)).filter((row) => row.kind === "UPGRADE");
  for (const row of [...upgrades].reverse()) {
    const charge = await deps.billing.charge(row.chargeId);
    if (charge === null || charge.events.some((event) => event.kind === "SUCCEEDED")) continue;
    const sameQuote = charge.quoteId === quoteRef;
    const declined = charge.events.some((event) => event.kind === "FAILED" && event.errorCode === "PAYMENT_DECLINED");
    const failed = charge.events.some((event) => event.kind === "FAILED");
    if (failed && !(declined && sameQuote)) continue;
    const hosted = await deps.billing.withTransaction((client) => deps.billing.hostedPaymentForCharge(client, charge.chargeId));
    if (hosted === null) {
      const inFlight = charge.events.every((event) => event.kind === "REQUESTED")
        && now.getTime() - charge.createdAt.getTime() < START_IN_FLIGHT_MS;
      if (inFlight) return Object.freeze({ kind: "PENDING" as const, chargeId: charge.chargeId });
      await closeUnpaidHostedCharge(deps, { chargeId: charge.chargeId, ownerRef: state.ownerRef, now });
      continue;
    }
    const read = await readPaymentStatus(deps, {
      chargeId: charge.chargeId, providerPaymentId: bestPaymentId(charge.events, hosted), operation: "upgrade", now
    });
    const answer = read.answer;
    if (answer === "UNREADABLE") return Object.freeze({ kind: "PENDING" as const, chargeId: charge.chargeId });
    if (answer !== "NO_SUCH_ORDER" && paidOrAlmost(answer)) {
      if (answer.state === "PAID" || answer.state === "AUTHORIZED") {
        await deps.billing.withTransaction((client) => queueVerifyNow({ repository: deps.billing, jobs: deps.jobs }, client, charge.chargeId, now));
        deps.kick();
      }
      return Object.freeze({ kind: "PENDING" as const, chargeId: charge.chargeId });
    }
    const quote = charge.quoteId === null ? null : await deps.billing.quote(charge.quoteId, state.ownerRef);
    const live = quote !== null && now.getTime() < quote.expiresAt.getTime();
    if (sameQuote && live && answer !== "NO_SUCH_ORDER" && stillPayable(answer)) {
      return Object.freeze({
        kind: "REUSE" as const, chargeId: charge.chargeId,
        redirectUrl: openPaymentUrl(deps.recordsKey, charge.chargeId, hosted.redirectCiphertext)
      });
    }
    if (!failed) await closeUnpaidHostedCharge(deps, { chargeId: charge.chargeId, ownerRef: state.ownerRef, now });
  }
  return Object.freeze({ kind: "NONE" as const });
}

/**
 * Under the owner lock, every read through `client`: the checks again (the read before the lock is only a glimpse),
 * then the charge row, the quote's one use, REQUESTED, the card-saving agreement and the profile with the payment
 * address (spec §2.5.3: `paymentIp` is the address of the person's latest payment made in person).
 */
async function prepareUpgrade(
  deps: SubscriptionRouteDeps, client: PoolClient, input: UpgradeInput,
  context: Readonly<{
    subscriptionId: string; environment: "sandbox" | "live"; customerId: string;
    profile: Parameters<typeof sealBillingProfile>[2]; now: Date;
  }>
): Promise<Prepared> {
  const { now } = context;
  const locked = await lockedSubscription(deps, client, input.ownerRef);
  const quote = await deps.billing.quote(input.quoteRef, input.ownerRef, client);
  if (quote === null || quote.kind !== "UPGRADE" || quote.planId !== input.planId) refuse(409, "QUOTE_EXPIRED");
  if (locked === null || locked.state.subscriptionId !== context.subscriptionId) refuse(409, "NOT_SUBSCRIBED");
  // P15: an erasure scheduled after the quote refuses the upgrade itself, under the owner lock.
  if (await deps.billing.ownerErasurePending(input.ownerRef, client)) refuse(409, "ACCOUNT_ERASURE_PENDING");
  const { state } = locked;
  const charges = await deps.billing.chargesForSubscription(state.subscriptionId, client);
  const earlier = charges.find((charge) => charge.quoteId === quote.quoteId);
  if (earlier !== undefined) {
    const read = await deps.billing.charge(earlier.chargeId, client);
    // A quote whose upgrade closed or was decided buys nothing more: a new quote is needed.
    if (read === null || read.events.some((event) => event.kind === "SUCCEEDED" || event.kind === "FAILED")) {
      refuse(409, "QUOTE_EXPIRED");
    }
    const hosted = await deps.billing.hostedPaymentForCharge(client, earlier.chargeId);
    return Object.freeze({
      kind: "EXISTING" as const, chargeId: earlier.chargeId,
      redirectUrl: hosted === null ? null : openPaymentUrl(deps.recordsKey, earlier.chargeId, hosted.redirectCiphertext)
    });
  }
  if (quote.expiresAt.getTime() <= now.getTime()) refuse(409, "QUOTE_EXPIRED");
  if (state.status !== "ACTIVE" || state.currentPeriodStart === null || state.currentPeriodEnd === null
    || !servedByNetopia(deps, state)) {
    refuse(409, "NOT_SUBSCRIBED");
  }
  // A renewal since the quote moved the period: the prorated price no longer holds.
  if (quote.createdAt.getTime() < state.currentPeriodStart.getTime()) refuse(409, "QUOTE_EXPIRED");
  // Another upgrade applied since the quote changed the plan it was priced from: its price no longer holds.
  if (locked.events.some((event) => event.kind === "UPGRADED" && event.at.getTime() >= quote.createdAt.getTime())) {
    refuse(409, "QUOTE_EXPIRED");
  }
  if (planById(deps.plans, input.planId).netPriceMicros <= planById(deps.plans, state.planId).netPriceMicros) {
    refuse(422, "UPGRADE_NOT_HIGHER");
  }
  if (renewalUnderWay(state, charges, now)) refuse(409, "UPGRADE_NOT_AVAILABLE_NOW");
  // One open upgrade at a time: the read before the lock closed or answered every earlier one; one opened since waits.
  for (const open of charges.filter((charge) => charge.kind === "UPGRADE")) {
    const read = await deps.billing.charge(open.chargeId, client);
    if (read !== null && !read.events.some((event) => event.kind === "SUCCEEDED" || event.kind === "FAILED")) {
      refuse(409, "UPGRADE_IN_PROGRESS");
    }
  }
  // Each quote is its own charge key (period_start = the quote's creation), so declined upgrades never use up a
  // period. Only quotes made in the same millisecond share a key; they count up within 0086's attempts 1..4.
  const sameKey = charges.filter((charge) => charge.kind === "UPGRADE"
    && charge.periodStart.getTime() === quote.createdAt.getTime());
  if (sameKey.length >= 4) refuse(409, "QUOTE_EXPIRED");
  const chargeId = newChargeId();
  const charge = Object.freeze({
    chargeId, ownerRef: state.ownerRef, subscriptionId: state.subscriptionId, kind: "UPGRADE",
    attempt: sameKey.length + 1, periodStart: quote.createdAt, periodEnd: state.currentPeriodEnd,
    quoteId: quote.quoteId, netMicros: quote.netMicros, taxMicros: quote.taxMicros, totalMicros: quote.totalMicros,
    currency: "USD", createdAt: now, paymentProvider: "netopia", paymentEnvironment: context.environment
  }) as ChargeRow;
  await deps.billing.insertCharge(client, charge);
  // A3(a), after the charge row it names: a second use of this quote rolls the whole attempt back.
  if (await deps.billing.useQuote(client, { quoteId: quote.quoteId, usedAt: now, chargeId }) === "ALREADY_USED") {
    refuse(409, "QUOTE_EXPIRED");
  }
  await deps.billing.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", now, {
    providerPaymentId: null, amountMicros: quote.totalMicros, errorCode: null
  }));
  await recordCardAgreement(deps, client, {
    ownerRef: input.ownerRef, locale: input.locale, agreement: input.agreement, surface: "UPGRADE", ip: input.ip,
    userAgent: input.userAgent, at: now
  });
  const sealed = sealBillingProfile(deps.recordsKey, context.customerId, context.profile);
  await deps.billing.appendProfile(client, {
    customerId: context.customerId, at: now, locale: context.profile.locale, profileCiphertext: sealed.ciphertext,
    keyId: sealed.keyId
  });
  return Object.freeze({ kind: "NEW" as const, chargeId, totalMicros: quote.totalMicros });
}

export type UpgradeSucceededWrites = Readonly<{
  subscriptionEvent: NextEvent;
  entitlement: Readonly<{
    planId: PlanId; periodAnchorAt: Date; cause: "UPGRADED"; paidThrough: Date | null;
    monthCreditOverrideMicros: number | null;
  }>;
}>;

const laterOf = (left: Date | null, right: Date | null): Date | null =>
  left === null ? right : right === null ? left : left.getTime() >= right.getTime() ? left : right;

/**
 * What the UPGRADE settlement writes, inside P9b's one transaction (A3f), when an UPGRADE charge of the CURRENT
 * period is paid: UPGRADED with the new plan and A7's announced total, and an entitlement with the SAME anchor,
 * `paid_through` = the period end, a later postponed renewal, or — paid after the period end, while the renewal waits
 * for it — R2 Q-1's pending window (`upgradedPaidThrough`, A8a), and A6's prorated month credit, measured at
 * the instant the price was prorated (the quote's creation). Terms §12: UPGRADED also records the new plan's net as
 * `recurring_net_micros`, the price P11a renews at from then on — the plan's price in this process's register, the
 * one the quote used (the quote is valid for minutes; were a new price published in between, the announced total
 * from the quote would no longer match P11a's fresh quote, and A7 sends M3 before any different charge). A payment
 * verified after a renewal moved the period is refunded in full by the settlement and writes nothing; reaching this
 * function with one is an error. N12: on NETOPIA, UPGRADED also carries the upgrade's saved card (`cardTokenId`, spec
 * §2.15.2).
 */
export function upgradeSucceededWrites(input: Readonly<{
  state: SubscriptionState; charge: ChargeRow; quote: QuoteRow; plans: BillingPlans;
  currentMonthCreditOverrideMicros: number | null; now: Date;
  /** N12: the token N10 chose at the decision (null: the payment saved no usable card). */
  cardTokenId?: string | null;
}>): UpgradeSucceededWrites {
  const { state, charge, quote, plans } = input;
  if (state.periodAnchorAt === null || state.currentPeriodStart === null || state.currentPeriodEnd === null
    || quote.recurringTotalMicros === null || !chargeInCurrentPeriod(charge, state)) {
    throw new TypedDomainError(
      "BILLING_SUBSCRIPTION_EVENTS_INVALID", "An upgrade applies only in the period it was quoted in, with an announced total"
    );
  }
  const oldPlan = planById(plans, state.planId);
  const newPlan = planById(plans, quote.planId);
  const monthCreditOverrideMicros = upgradeMonthCreditOverrideMicros({
    currentMonthCreditMicros: input.currentMonthCreditOverrideMicros ?? oldPlan.monthlyCreditMicros,
    oldPlanCreditMicros: oldPlan.monthlyCreditMicros,
    newPlanCreditMicros: newPlan.monthlyCreditMicros,
    periodStart: state.currentPeriodStart, periodEnd: state.currentPeriodEnd, at: quote.createdAt
  });
  return Object.freeze({
    subscriptionEvent: Object.freeze({
      kind: "UPGRADED", at: input.now, planId: quote.planId,
      ...(input.cardTokenId === undefined ? {} : { cardTokenId: input.cardTokenId }),
      data: Object.freeze({
        announced_total_micros: quote.recurringTotalMicros, quote_ref: quote.quoteId,
        recurring_net_micros: newPlan.netPriceMicros
      })
    }),
    entitlement: Object.freeze({
      planId: quote.planId, periodAnchorAt: state.periodAnchorAt, cause: "UPGRADED",
      paidThrough: upgradedPaidThrough(state, input.now), monthCreditOverrideMicros
    })
  });
}

/**
 * A8a's `paid_through` for the UPGRADED row: the period end, or a later postponed renewal; and once the period end is
 * behind (the renewal waited for this upgrade, R2 Q-1's pending renewal, which P11a's `holdPending` kept with a
 * RENEWAL_PENDING row), the end of that 72-hour window too, so the row just written never cuts the hold short and
 * drops a subscriber who has just paid more to Free. A cancel pending ends the access at the period end as before.
 */
function upgradedPaidThrough(state: SubscriptionState, now: Date): Date | null {
  const planned = laterOf(state.currentPeriodEnd, state.renewalPostponedUntil);
  const end = state.currentPeriodEnd;
  if (end === null || state.cancelRequested || now.getTime() < end.getTime()) return planned;
  return laterOf(planned, renewalPendingUntil(state, end));
}

const PAYMENT_GOES_BACK: SettlementResult = Object.freeze({ kind: "REFUND" as const, reason: "SUBSCRIPTION_ENDED" as const });
const CLOSED_GOES_BACK: SettlementResult = Object.freeze({ kind: "REFUND" as const, reason: "UPGRADE_CLOSED" as const });

/**
 * The UPGRADE charge kind's settlement on P9b's `VerifyPaymentHandler`. A payment that can no longer buy the upgrade
 * — the subscription is no longer ACTIVE, it is already on this plan or above, a renewal has closed the period the
 * upgrade was priced for (RENEWED moved it), or the next period's RENEWAL charge already exists (priced and charged
 * at the old plan, before RENEWED: the same signal `renewalUnderWay` refuses a new upgrade on) — changes nothing and
 * goes back in full through P9b's `RefundDesk` (reason `SUBSCRIPTION_ENDED`, which leaves an ACTIVE subscription as
 * it is). A declined upgrade changes nothing (spec §2.5.6). Every read runs on the settlement's own connection.
 * N12 (spec §2.10): a late payment for an upgrade we CLOSED (FAILED other than a decline) buys only what it was priced
 * for (the same period, no plan change since its quote), else it goes back as `UPGRADE_CLOSED`; on NETOPIA, UPGRADED
 * carries N10's adopted card. Any upgrade quoted before another one was applied (an UPGRADED at or after its quote's
 * creation) goes back in full, closed or not (`UPGRADE_CLOSED` when we closed it, `SUBSCRIPTION_ENDED` otherwise): it
 * was priced from a plan the subscription no longer has, so two upgrades never both apply.
 */
export function createUpgradeSettlement(deps: Readonly<{
  repository: Pick<BillingRepository,
    "appendSubscriptionEvent" | "chargesForSubscription" | "charge" | "periodCreditOverride" | "ownerErasurePending">;
  entitlements: Pick<EntitlementRepository, "append">;
  plans: BillingPlans;
}>): ChargeSettlement {
  return Object.freeze({
    async succeeded(context: SettlementContext): Promise<SettlementResult> {
      const { subscription, quote, charge, client, now } = context;
      if (quote === null || quote.kind !== "UPGRADE") {
        throw new TypedDomainError("BILLING_QUOTE_MISSING", "An upgrade charge without its UPGRADE quote");
      }
      // P15: an upgrade paid during an erasure's grace (or after the age gate froze the account) buys nothing and
      // goes back in full.
      if (await deps.repository.ownerErasurePending(context.ownerRef, client)) return PAYMENT_GOES_BACK;
      const read = await deps.repository.charge(charge.chargeId, client);
      const closed = read?.events.some((event) => event.kind === "FAILED" && event.errorCode !== "PAYMENT_DECLINED") ?? false;
      const goesBack = closed ? CLOSED_GOES_BACK : PAYMENT_GOES_BACK;
      // The plan it was priced from changed since its quote (another upgrade was applied): it buys nothing.
      if (context.events.some((event) => event.kind === "UPGRADED" && event.at.getTime() >= quote.createdAt.getTime())) {
        return goesBack;
      }
      if (subscription.status !== "ACTIVE" || subscription.currentPeriodStart === null
        || planById(deps.plans, quote.planId).netPriceMicros <= planById(deps.plans, subscription.planId).netPriceMicros
        || !chargeInCurrentPeriod(charge, subscription)) {
        return goesBack;
      }
      const charges = await deps.repository.chargesForSubscription(subscription.subscriptionId, client);
      if (charges.some((row) => row.kind === "RENEWAL" && row.periodStart.getTime() === charge.periodEnd.getTime())) {
        return goesBack;
      }
      const currentOverride = await deps.repository.periodCreditOverride({
        subscriptionId: subscription.subscriptionId, planId: subscription.planId,
        since: subscription.currentPeriodStart, until: now
      }, client);
      const writes = upgradeSucceededWrites({
        state: subscription, charge, quote, plans: deps.plans, currentMonthCreditOverrideMicros: currentOverride, now,
        ...(context.payment === null ? {} : { cardTokenId: context.payment.cardTokenId })
      });
      await appendChecked(deps.repository, client, { state: subscription, events: context.events }, writes.subscriptionEvent);
      await deps.entitlements.append(client, {
        ownerRef: context.ownerRef, ...writes.entitlement, effectiveAt: now, subscriptionId: subscription.subscriptionId
      });
      return APPLIED;
    },
    async failed(): Promise<void> {
      return;
    }
  });
}
