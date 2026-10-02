import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import {
  microsToDecimal,
  upgradeMonthCreditOverrideMicros,
  upgradeProrationMicros,
  type SubscriptionState
} from "@debateai/billing-core";
import type { BillingUpgradeQuoteResponse, BillingUpgradeResponse } from "@debateai/contract";
import type { BillingRepository, ChargeEventRow, ChargeRow, EntitlementRepository, QuoteRow } from "@debateai/db";
import { XMoneyPaymentFailedError } from "@debateai/payments-xmoney";
import { planById, type BillingPlans, type PlanId } from "@debateai/register";
import { credentialsRefused } from "./audit.js";
import type { ChargeFailureCode } from "./codes.js";
import { decidePaymentPlace, placeRefusal } from "./place.js";
import { sealQuoteLocation } from "./records.js";
import { recurringNetOf, renewalLeadMs, renewalPendingUntil } from "./renewal-rules.js";
import { chargeEvent, newChargeId } from "./rows.js";
import { APPLIED, type ChargeSettlement, type SettlementContext, type SettlementResult } from "./settlement.js";
import { quoteTax, storedTaxContext, type StoredTaxContext } from "./stored-tax-context.js";
import { appendChecked, lockedSubscription, refuse, type NextEvent } from "./subscription-core.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";

function settledState(events: ReadonlyArray<ChargeEventRow>): BillingUpgradeResponse["state"] {
  if (events.some((event) => event.kind === "SUCCEEDED")) return "SUCCEEDED";
  return events.some((event) => event.kind === "FAILED") ? "FAILED" : "PENDING";
}

const FAILURE_CODES: ReadonlySet<string> = new Set<ChargeFailureCode>([
  "PAYMENT_DECLINED", "VOIDED", "REBILL_REFUSED", "NO_TRANSACTION"
]);

function answerFor(chargeId: string, events: ReadonlyArray<ChargeEventRow>): BillingUpgradeResponse {
  const state = settledState(events);
  const code = events.find((event) => event.kind === "FAILED")?.errorCode ?? null;
  return Object.freeze({
    charge_ref: chargeId, state,
    reason_code: state === "FAILED" && code !== null && FAILURE_CODES.has(code) ? code as ChargeFailureCode : null
  });
}

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

type Prepared =
  | Readonly<{ kind: "EXISTING"; answer: BillingUpgradeResponse }>
  | Readonly<{ kind: "NEW"; chargeId: string; totalMicros: number; orderId: string; customerId: string }>;

type UpgradeInput = Readonly<{ ownerRef: string; planId: "PRO" | "MAX"; quoteRef: string }>;

/**
 * xMoney's definite answers to a rebill: a decline, or a refusal of the request itself. Nothing else is a failure
 * of this charge — in particular not XMONEY_CREDENTIALS_REFUSED (401/403), which is OUR key, never the card (D5 5i).
 */
function failureCodeOf(xmoneyCode: string): ChargeFailureCode | null {
  if (xmoneyCode === "XMONEY_PAYMENT_FAILED") return "PAYMENT_DECLINED";
  if (xmoneyCode === "XMONEY_REFUSED") return "REBILL_REFUSED";
  return null;
}

/**
 * P3b: nothing reached xMoney's processing — a refused connection or a 429 (XMONEY_UNAVAILABLE), or xMoney refused
 * our key (XMONEY_CREDENTIALS_REFUSED). Anything else that is not a definite answer is unknown (A2).
 */
function notSent(xmoneyCode: string): boolean {
  return xmoneyCode === "XMONEY_UNAVAILABLE" || xmoneyCode === "XMONEY_CREDENTIALS_REFUSED";
}

/**
 * Charges the saved card for an UPGRADE quote. One quote makes at most one charge (A3a); a repeated request answers
 * with the first charge. The preparation and the rebill run under P7's subscription lease (the renewal's), so an
 * upgrade and a renewal never submit together; a busy lease is UPGRADE_IN_PROGRESS. The plan changes only when
 * VERIFY_PAYMENT confirms the transaction (the UPGRADE settlement below); a refusal here changes nothing (spec §2.5.6).
 * One connection per upgrade: every transaction runs on the lease's own (`withTransactionOn`), so however many
 * people upgrade at once, no lease holder ever waits on the pool for a second connection.
 */
export async function startUpgrade(deps: SubscriptionRouteDeps, input: UpgradeInput): Promise<BillingUpgradeResponse> {
  const before = await deps.billing.subscriptionForOwner(input.ownerRef);
  if (before === null) refuse(409, "NOT_SUBSCRIBED");
  const leased = await deps.jobs.withSubscriptionLease(
    before.subscriptionId, (leaseClient) => upgradeUnderLease(deps, input, before.subscriptionId, leaseClient)
  );
  if (leased.kind === "BUSY") refuse(409, "UPGRADE_IN_PROGRESS");
  return leased.value;
}

async function upgradeUnderLease(
  deps: SubscriptionRouteDeps, input: UpgradeInput, subscriptionId: string, leaseClient: PoolClient
): Promise<BillingUpgradeResponse> {
  const now = deps.clock();
  const prepared = await deps.billing.withTransactionOn(
    leaseClient, (client) => prepareUpgrade(deps, client, input, subscriptionId, now)
  );
  if (prepared.kind === "EXISTING") return prepared.answer;
  deps.audit("billing.upgrade.requested", { plan_id: input.planId });
  let transactionId: string | null = null;
  let declinedTransactionId: string | null = null;
  let xmoneyCode = "XMONEY_OUTCOME_UNKNOWN";
  let caught: unknown = null;
  try {
    transactionId = (await deps.xmoney.rebill({
      orderId: prepared.orderId, customerId: prepared.customerId, amountDecimal: microsToDecimal(prepared.totalMicros)
    })).transactionId;
  } catch (error) {
    caught = error;
    if (error instanceof TypedDomainError) xmoneyCode = error.code;
    // P3b: a decline names its transaction, so VERIFY_PAYMENT and P14a's daily pass find it recorded (as P11a does).
    if (error instanceof XMoneyPaymentFailedError) declinedTransactionId = error.transactionId;
  }
  const at = deps.clock();
  if (transactionId !== null) {
    const submitted = transactionId;
    await deps.billing.withTransactionOn(leaseClient, async (client) => {
      await deps.billing.appendChargeEvent(client, chargeEvent(prepared.chargeId, "SUBMITTED", at, {
        xmoneyTransactionId: submitted, amountMicros: prepared.totalMicros, errorCode: null
      }));
      await deps.billing.enqueue(client, {
        kind: "VERIFY_PAYMENT", ref: submitted, notBefore: at, payload: { charge_id: prepared.chargeId }
      });
    });
    deps.kick();
    return Object.freeze({ charge_ref: prepared.chargeId, state: "PENDING", reason_code: null });
  }
  if (notSent(xmoneyCode)) {
    // Nothing was processed: the charge stays REQUESTED — no SUBMIT_UNKNOWN (A2's one resubmission is not spent on a
    // call that never left) and no FAILED (the card was never asked). P14a's adoption pass settles it
    // FAILED(NO_TRANSACTION) once 30 minutes show no transaction on the order. A refused key is also the one
    // operator alarm every xMoney caller writes (D5 5i).
    credentialsRefused(deps.audit, caught, "rebill");
    refuse(503, "PAYMENT_PROVIDER_UNAVAILABLE");
  }
  const failed = failureCodeOf(xmoneyCode);
  // A2: an unknown outcome is never resubmitted here; P14a adopts its transaction or fails the charge.
  await deps.billing.withTransactionOn(leaseClient, (client) => deps.billing.appendChargeEvent(client, chargeEvent(
    prepared.chargeId, failed === null ? "SUBMIT_UNKNOWN" : "FAILED", at, {
      xmoneyTransactionId: failed === null ? null : declinedTransactionId,
      amountMicros: prepared.totalMicros, errorCode: failed ?? "REBILL_OUTCOME_UNKNOWN"
    }
  )));
  return Object.freeze({
    charge_ref: prepared.chargeId, state: failed === null ? "PENDING" : "FAILED", reason_code: failed
  });
}

/** Under the owner lock, every read through `client`: the checks, then the charge row, the quote's one use, REQUESTED. */
async function prepareUpgrade(
  deps: SubscriptionRouteDeps, client: PoolClient, input: UpgradeInput, subscriptionId: string, now: Date
): Promise<Prepared> {
  const locked = await lockedSubscription(deps, client, input.ownerRef);
  const quote = await deps.billing.quote(input.quoteRef, input.ownerRef, client);
  if (quote === null || quote.kind !== "UPGRADE" || quote.planId !== input.planId) refuse(409, "QUOTE_EXPIRED");
  if (locked === null || locked.state.subscriptionId !== subscriptionId) refuse(409, "NOT_SUBSCRIBED");
  // P15: an erasure scheduled after the quote refuses the upgrade itself, under the owner lock.
  if (await deps.billing.ownerErasurePending(input.ownerRef, client)) refuse(409, "ACCOUNT_ERASURE_PENDING");
  const { state } = locked;
  const charges = await deps.billing.chargesForSubscription(state.subscriptionId, client);
  const earlier = charges.find((charge) => charge.quoteId === quote.quoteId);
  if (earlier !== undefined) {
    const read = await deps.billing.charge(earlier.chargeId, client);
    return Object.freeze({ kind: "EXISTING", answer: answerFor(earlier.chargeId, read?.events ?? []) });
  }
  if (quote.expiresAt.getTime() <= now.getTime()) refuse(409, "QUOTE_EXPIRED");
  if (state.status !== "ACTIVE" || state.xmoneyOrderId === null || state.xmoneyCustomerId === null
    || state.currentPeriodStart === null || state.currentPeriodEnd === null
    // D5 5h: the order lives in the system the subscription was created in; the rebill goes to the connectors'.
    || state.xmoneyEnvironment !== deps.xmoneyEnvironment) {
    refuse(409, "NOT_SUBSCRIBED");
  }
  // A renewal since the quote moved the period: the prorated price no longer holds.
  if (quote.createdAt.getTime() < state.currentPeriodStart.getTime()) refuse(409, "QUOTE_EXPIRED");
  if (planById(deps.plans, input.planId).netPriceMicros <= planById(deps.plans, state.planId).netPriceMicros) {
    refuse(422, "UPGRADE_NOT_HIGHER");
  }
  if (renewalUnderWay(state, charges, now)) refuse(409, "UPGRADE_NOT_AVAILABLE_NOW");
  // No new upgrade while ANY earlier one has no outcome, whatever its period: its money may still move (A2).
  for (const open of charges.filter((charge) => charge.kind === "UPGRADE")) {
    const read = await deps.billing.charge(open.chargeId, client);
    if (settledState(read?.events ?? []) === "PENDING") refuse(409, "UPGRADE_IN_PROGRESS");
  }
  // Each quote is its own charge key (period_start = the quote's creation), so declined upgrades never use up a
  // period. Only quotes made in the same millisecond share a key; they count up within 0086's attempts 1..4.
  const sameKey = charges.filter((charge) => charge.kind === "UPGRADE"
    && charge.periodStart.getTime() === quote.createdAt.getTime());
  if (sameKey.length >= 4) refuse(409, "QUOTE_EXPIRED");
  const chargeId = newChargeId();
  const charge: ChargeRow = Object.freeze({
    chargeId, ownerRef: state.ownerRef, subscriptionId: state.subscriptionId, kind: "UPGRADE",
    attempt: sameKey.length + 1, periodStart: quote.createdAt, periodEnd: state.currentPeriodEnd,
    quoteId: quote.quoteId, netMicros: quote.netMicros, taxMicros: quote.taxMicros, totalMicros: quote.totalMicros,
    currency: "USD", createdAt: now, xmoneyEnvironment: deps.xmoneyEnvironment
  });
  await deps.billing.insertCharge(client, charge);
  // A3(a), after the charge row it names: a second use of this quote rolls the whole attempt back.
  if (await deps.billing.useQuote(client, { quoteId: quote.quoteId, usedAt: now, chargeId }) === "ALREADY_USED") {
    refuse(409, "QUOTE_EXPIRED");
  }
  await deps.billing.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", now, {
    xmoneyTransactionId: null, amountMicros: quote.totalMicros, errorCode: null
  }));
  return Object.freeze({
    kind: "NEW", chargeId, totalMicros: quote.totalMicros, orderId: state.xmoneyOrderId, customerId: state.xmoneyCustomerId
  });
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
 * function with one is an error.
 */
export function upgradeSucceededWrites(input: Readonly<{
  state: SubscriptionState; charge: ChargeRow; quote: QuoteRow; plans: BillingPlans;
  currentMonthCreditOverrideMicros: number | null; now: Date;
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

/**
 * The UPGRADE charge kind's settlement on P9b's `VerifyPaymentHandler`. A payment that can no longer buy the upgrade
 * — the subscription is no longer ACTIVE, it is already on this plan or above, a renewal has closed the period the
 * upgrade was priced for (RENEWED moved it), or the next period's RENEWAL charge already exists (priced and charged
 * at the old plan, before RENEWED: the same signal `renewalUnderWay` refuses a new upgrade on) — changes nothing and
 * goes back in full through P9b's `RefundDesk` (reason `SUBSCRIPTION_ENDED`, which leaves an ACTIVE subscription as
 * it is). A declined upgrade changes nothing (spec §2.5.6). Every read runs on the settlement's own connection.
 */
export function createUpgradeSettlement(deps: Readonly<{
  repository: Pick<BillingRepository,
    "appendSubscriptionEvent" | "chargesForSubscription" | "periodCreditOverride" | "ownerErasurePending">;
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
      if (subscription.status !== "ACTIVE" || subscription.currentPeriodStart === null
        || planById(deps.plans, quote.planId).netPriceMicros <= planById(deps.plans, subscription.planId).netPriceMicros
        || !chargeInCurrentPeriod(charge, subscription)) {
        return PAYMENT_GOES_BACK;
      }
      const charges = await deps.repository.chargesForSubscription(subscription.subscriptionId, client);
      if (charges.some((row) => row.kind === "RENEWAL" && row.periodStart.getTime() === charge.periodEnd.getTime())) {
        return PAYMENT_GOES_BACK;
      }
      const currentOverride = await deps.repository.periodCreditOverride({
        subscriptionId: subscription.subscriptionId, planId: subscription.planId,
        since: subscription.currentPeriodStart, until: now
      }, client);
      const writes = upgradeSucceededWrites({
        state: subscription, charge, quote, plans: deps.plans, currentMonthCreditOverrideMicros: currentOverride, now
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
