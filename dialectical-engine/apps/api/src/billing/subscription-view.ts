import { TypedDomainError } from "@debateai/kernel";
import { microsToDecimal, withdrawalDeadline, type SubscriptionState, type WithdrawalDeadline } from "@debateai/billing-core";
import type { BillingInvoicesResponse, BillingSubscriptionResponse } from "@debateai/contract";
import type { BillingRepository, CustomerXMoneyEnvironment } from "@debateai/db";
import type { BillingPolicy, PlanId } from "@debateai/register";
import { renewalLeadMs, servedHere } from "./renewal-rules.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";

export type SubscriptionView = NonNullable<BillingSubscriptionResponse["subscription"]>;
type PaidPlanId = SubscriptionView["plan_id"];

/** A subscription is always on a paid plan (0085 CHECKs plan_id IN PLUS/PRO/MAX); Free is never subscribed. */
export function paidPlanOf(planId: PlanId): PaidPlanId {
  if (planId === "FREE") {
    throw new TypedDomainError("BILLING_SUBSCRIPTION_EVENTS_INVALID", "A subscription event names the Free plan");
  }
  return planId;
}

/** The tax country of the first paid charge, where the withdrawal right is decided (spec §2.5.6). */
export async function initialTaxCountry(
  billing: Pick<BillingRepository, "chargesForSubscription" | "quote">, state: SubscriptionState
): Promise<string | null> {
  const charges = await billing.chargesForSubscription(state.subscriptionId);
  const initial = charges.find((charge) => charge.kind === "INITIAL");
  if (initial === undefined || initial.quoteId === null) return null;
  return (await billing.quote(initial.quoteId, state.ownerRef))?.taxCountry ?? null;
}

type WindowInput = Readonly<{
  state: SubscriptionState; taxCountry: string | null; policy: BillingPolicy; now: Date;
  /** P2-I4 (D5 5h): the connectors' xMoney system; a plan created in the other one is never offered a withdrawal. */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
  /** N12: the connectors' NETOPIA environment; absent or null, no NETOPIA plan is served here (spec §2.5.4). */
  paymentEnvironment?: "sandbox" | "live" | null;
}>;

/** Spec §2.5.4: the plan belongs to a payment system this API serves (provider and environment together). */
function served(input: WindowInput): boolean {
  return servedHere(input.state, { xmoneyEnvironment: input.xmoneyEnvironment, paymentEnvironment: input.paymentEnvironment ?? null });
}

/**
 * The withdrawal deadline while the right is still open (ACTIVE, a withdrawal country, before it closes, and the plan
 * paid in a payment system this API serves (spec §2.5.4): its refund could not be sent to another one); else null.
 */
function openWithdrawal(input: WindowInput): WithdrawalDeadline | null {
  const { state, taxCountry, policy, now } = input;
  if (state.status !== "ACTIVE" || state.activatedAt === null || taxCountry === null) return null;
  if (!served(input)) return null;
  if (!policy.withdrawalCountries.includes(taxCountry)) return null;
  const deadline = withdrawalDeadline({ activatedAt: state.activatedAt, taxCountry, withdrawalDays: policy.withdrawalDays });
  return now.getTime() < deadline.closesAt.getTime() ? deadline : null;
}

/**
 * The instant the withdrawal right ends, or null when there is none: only while ACTIVE, for a tax country in
 * `withdrawalCountries` (EU, EEA and UK; spec §2.5.6), before `withdrawalDeadline`'s close (14 calendar days, R2 Q-6;
 * a last day on a weekend moves to the Monday, W6).
 */
export function withdrawalOpenUntil(input: WindowInput): Date | null {
  return openWithdrawal(input)?.closesAt ?? null;
}

/** The last day of that window in the consumer's calendar, for the "you can withdraw until {date}" line. */
export function withdrawalLastDay(input: WindowInput): string | null {
  return openWithdrawal(input)?.lastDay ?? null;
}

const iso = (value: Date | null): string | null => value === null ? null : value.toISOString();

/**
 * An upgrade is offered only while it can be charged at a prorated price: ACTIVE, below Max, no postponed renewal
 * running, outside the renewal's lead (P12c refuses it there with UPGRADE_NOT_AVAILABLE_NOW), and a NETOPIA plan of
 * the environment this API serves (spec §2.5.4, §2.10; P2-W3 (a): the upgrade refuses any other plan NOT_SUBSCRIBED).
 * Since N12 the upgrade route serves NETOPIA plans only (`servedByNetopia`'s rule), so an xMoney plan is never offered it.
 */
function upgradeOffered(input: WindowInput): boolean {
  const { state, now } = input;
  return state.status === "ACTIVE" && state.planId !== "MAX" && state.renewalPostponedUntil === null
    && state.paymentProvider === "netopia" && served(input)
    && state.currentPeriodEnd !== null && now.getTime() < state.currentPeriodEnd.getTime() - renewalLeadMs();
}

/**
 * A card change is offered while ACTIVE or PAST_DUE, for a plan of a payment system this API serves (spec §2.5.4).
 * N13's route takes NETOPIA plans only (P2-W3 (a), C-15: offer an action only where its route accepts it), so an
 * xMoney plan is another system's for the card change, as for the upgrade (N12's ruling).
 */
function cardChangeOffered(input: WindowInput): boolean {
  const { state } = input;
  return (state.status === "ACTIVE" || state.status === "PAST_DUE") && state.paymentProvider === "netopia" && served(input);
}

/**
 * C-15: an undo of a pending cancel is offered only where the revoke route (`revokeCancelForOwner`) accepts it: ACTIVE,
 * the plan paid in a payment system this API serves (spec §2.5.4; D5 5h: another one's cancel stands, NOT_SUBSCRIBED),
 * a cancel pending, and before the period end. A SUSPENDED plan's undo is refused while paused (P2-W10); a PAST_DUE
 * plan's cancel ends it at once, so it never carries one.
 */
function revokeCancelOffered(input: WindowInput): boolean {
  const { state, now } = input;
  return state.status === "ACTIVE" && state.cancelRequested
    && served(input)
    && (state.currentPeriodEnd === null || now.getTime() < state.currentPeriodEnd.getTime());
}

export function subscriptionView(input: WindowInput): SubscriptionView {
  const { state } = input;
  const renewsOn = state.status === "ACTIVE" && !state.cancelRequested
    ? state.renewalPostponedUntil ?? state.currentPeriodEnd
    : null;
  // The card page names the total its agreement charges again (spec §2.18): a renewing ACTIVE plan's, and a PAST_DUE
  // plan's whose renewal is still retried (a PAST_DUE cancel ends it at once). The fold holds one after ACTIVATED.
  const chargedAgain = renewsOn !== null || (state.status === "PAST_DUE" && !state.cancelRequested);
  const withdrawal = openWithdrawal(input);
  return Object.freeze({
    plan_id: paidPlanOf(state.planId),
    status: state.status,
    cancel_requested: state.cancelRequested,
    current_period_end: iso(state.currentPeriodEnd),
    renews_on: iso(renewsOn),
    renewal_total: !chargedAgain || state.announcedTotalMicros === null
      ? null : microsToDecimal(state.announcedTotalMicros),
    scheduled_downgrade_plan_id: state.scheduledDowngradePlanId === null ? null : paidPlanOf(state.scheduledDowngradePlanId),
    withdrawal_open_until: iso(withdrawal?.closesAt ?? null),
    withdrawal_last_day: withdrawal?.lastDay ?? null,
    can_upgrade: upgradeOffered(input),
    can_change_card: cardChangeOffered(input),
    can_revoke_cancel: revokeCancelOffered(input)
  });
}

export async function readSubscriptionView(
  deps: Pick<SubscriptionRouteDeps, "billing" | "policy" | "xmoneyEnvironment" | "paymentEnvironment">, ownerRef: string, now: Date
): Promise<SubscriptionView | null> {
  const state = await deps.billing.subscriptionForOwner(ownerRef);
  if (state === null) return null;
  return subscriptionView({
    state, taxCountry: await initialTaxCountry(deps.billing, state), policy: deps.policy, now,
    xmoneyEnvironment: deps.xmoneyEnvironment, paymentEnvironment: deps.paymentEnvironment
  });
}

export async function listInvoices(
  deps: Pick<SubscriptionRouteDeps, "billing">, ownerRef: string
): Promise<BillingInvoicesResponse> {
  const rows = await deps.billing.invoicesForOwner(ownerRef);
  return Object.freeze({
    invoices: [...rows].sort((left, right) => right.at.getTime() - left.at.getTime()).map((row) => Object.freeze({
      number: row.series === null ? row.number : `${row.series}-${row.number}`,
      issued_on: row.at.toISOString().slice(0, 10),
      total: microsToDecimal(row.totalMicros),
      kind: row.kind,
      url: row.url
    }))
  });
}
