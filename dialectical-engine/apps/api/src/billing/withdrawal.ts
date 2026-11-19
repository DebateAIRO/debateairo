import type { PoolClient } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import {
  consumerCalendarDay, consumerTimeZone, microsToDecimal, withdrawalRefundDeadline, withdrawalRefundMicros,
  type PriceCurrency
} from "@debateai/billing-core";
import type { ChargeEventRow, ChargeRow } from "@debateai/db";
import { planById } from "@debateai/register";
import type { AuthenticatedSession } from "../sessions.js";
import { enqueueEmail } from "./email-job.js";
import { isThisPaymentSystem } from "./outbox.js";
import { allocateRefund, paidTransactions, type PaidTransaction, type RefundAllocation } from "./refunds.js";
import { appendChecked, lockedSubscription, refuse } from "./subscription-core.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";
import { initialTaxCountry, withdrawalOpenUntil } from "./subscription-view.js";

/** What a withdrawal needs: the route's composition, or the owner's command (P14c) over its operator pool. */
export type WithdrawalDeps = Pick<SubscriptionRouteDeps,
  | "billing" | "jobs" | "entitlements" | "plans" | "policy" | "ownerSpend" | "refunds" | "audit" | "clock" | "kick"
  | "paymentEnvironment">;

export type WithdrawalRequest = Readonly<{
  ownerRef: string;
  /**
   * When the person withdrew: now for Settings; the instant the email or the model form arrived for the owner's
   * command (P14c). The window, the credit spent and the credit in force are all taken at it.
   */
  withdrewAt: Date;
  source: "SETTINGS" | "OWNER";
  /** Runs under the owner lock before anything is written. Neither Settings nor the owner's command adds a check here. */
  authorize: (client: PoolClient) => Promise<void>;
  /**
   * S01-C13 (R-17): the MLV of the withdraw request, the language of M8 and M8_RECEIVED. The owner's command (P14c)
   * names none: those rows keep the billing profile's language.
   */
  mailLocale?: string;
}>;

/**
 * The refund on its way back, or null when the owner settles it by hand (a dashboard refund touched a payment), and
 * the subscription's currency, the one the refund is in (spec 2026-10-05 §2.16.5).
 */
export type WithdrawalOutcome = Readonly<{ refundMicros: number | null; currency: PriceCurrency }>;

/**
 * What these paid transactions still hold, added up: what each took less what already went back from it, never below
 * zero (a provider refund's figure is only an upper bound, and such a withdrawal goes to the owner).
 */
const stillHeld = (paid: ReadonlyArray<PaidTransaction>): number =>
  paid.reduce((total, row) => total + Math.max(row.paidMicros - row.refundedMicros, 0), 0);

/** Rolls back the refund intents alone when a transaction cannot take one; WITHDRAWN is written after it. */
const REFUND_SAVEPOINT = "billing_withdrawal_refunds";

/**
 * Records a withdrawal. The decision and every record commit together — WITHDRAWN, the FREE entitlement and the
 * refund intents (RefundDesk: REFUND_REQUESTED and one PAYMENT_REFUND job per payment, split newest first) — and only
 * then does money move, through the outbox this function kicks; M8 ("we refunded …") follows the last refund
 * (RefundDesk's WITHDRAWAL follow-up). The same transaction queues the acknowledgement on a durable medium (OUG
 * 34/2014 art. 11^1(7); Directive 2011/83/EU art. 11(3)) for every withdrawal it records, M8_RECEIVED: the statement's
 * date and time in the buyer's own zone with the offset named, the plan and the day it started, the buyer's name (read
 * when the email is sent, never queued), then the refund on its way, nothing due back (it is then the only email), or
 * the owner's check.
 *
 * The refund, one rule for every country the site serves: what the payments made up to `withdrewAt` still hold, added
 * up, times the share of the plan credit not used, floored to cents once (`withdrawalRefundMicros`). The days gone by
 * do not count: nothing used gives the whole price back, and the whole credit used gives nothing back. The credit is
 * the one in force at `withdrewAt` (the upgrade's override, after an upgrade) and the credit used is what was spent
 * from the period start to it, so after an upgrade the paid total is every successful charge since the first
 * activation; both are read before the lock, so a plan or period that changed meanwhile is refused and nothing is
 * written. The credit used counts calls by when they were sent, and only those charged by the time it is read. A
 * debate still running never holds a withdrawal up: once the person confirms, the law counts the statement as made
 * (OUG 34/2014 art. 11^1(7)-(8)), so it is recorded at once and settled with what has been charged; a call sent before
 * it and charged later is not counted, in the person's favour, and calls sent after it were never theirs to pay. A
 * payment whose SUCCEEDED is after `withdrewAt` (an upgrade paid after the emailed statement arrived, before the owner
 * ran the command) takes no share: it goes back whole, what it still holds, on top of that amount. The refund is still
 * split newest first, so such a payment is the first to go back.
 *
 * When a refund made in NETOPIA's admin touched any paid payment (`providerRefunded`, whose refunded amount is only an
 * upper bound), or when a transaction already holds a refund request (`REFUND_TRANSACTION_ALREADY_REFUNDED`), the
 * refund due cannot be taken from our rows: the withdrawal is recorded (the plan ends now) with `refund_by_owner`, and
 * no intent and no M8 are written. The owner settles it with `pnpm billing:withdraw --owner <ref> --refund <amount>
 * --dashboard <amount>`; the owner summary lists it until then. The owner is also emailed at once (O2_WITHDRAWAL,
 * reason WITHDRAWAL_BY_OWNER, with the refund's 14-day deadline counted from `withdrewAt`), in the same transaction, so
 * the deadline never waits for the quarterly O1.
 */
export async function recordWithdrawal(deps: WithdrawalDeps, request: WithdrawalRequest): Promise<WithdrawalOutcome> {
  const now = deps.clock();
  const { ownerRef, withdrewAt } = request;
  const before = await deps.billing.subscriptionForOwner(ownerRef);
  if (before === null || before.status !== "ACTIVE" || before.currentPeriodStart === null
    || before.currentPeriodEnd === null || before.activatedAt === null
    || withdrewAt.getTime() < before.currentPeriodStart.getTime()
    // D5 5h (P2-I4), skeleton §1 rule 2: its payments live in another payment system, where this API cannot refund them.
    || !isThisPaymentSystem(before, deps.paymentEnvironment)) {
    refuse(409, "NOT_SUBSCRIBED");
  }
  const taxCountry = await initialTaxCountry(deps.billing, before);
  const closesAt = withdrawalOpenUntil({
    state: before, taxCountry, policy: deps.policy, now: withdrewAt, paymentEnvironment: deps.paymentEnvironment
  });
  if (closesAt === null) {
    refuse(409, "WITHDRAWAL_WINDOW_CLOSED");
  }
  // The credit used is read by when each call was SENT, as charged by now; a running debate does not hold it up.
  const { spentMicros } = await deps.ownerSpend.readWithdrawalSpend(ownerRef, before.currentPeriodStart, withdrewAt);
  const entitlement = await deps.entitlements.current(ownerRef, withdrewAt);
  // The plan whose credit was in force when the person withdrew (an upgrade since then is not theirs to pay back).
  const creditPlanId = entitlement.planId === "FREE" ? before.planId : entitlement.planId;
  const periodStart = before.currentPeriodStart;
  const activatedAt = before.activatedAt;
  const decided = await deps.billing.withTransaction(async (client) => {
    const locked = await lockedSubscription(deps, client, ownerRef);
    if (locked === null || locked.state.subscriptionId !== before.subscriptionId || locked.state.status !== "ACTIVE"
      // The spend and the credit above belong to this plan and period; an upgrade settled since changes both.
      || locked.state.planId !== before.planId || locked.state.currentPeriodStart?.getTime() !== periodStart.getTime()) {
      refuse(409, "NOT_SUBSCRIBED");
    }
    // The credit used above is found through the account's usage rows, and those stop naming the account in the
    // transaction that erases it (0177): read after that, it is zero and the whole price would go back. The plan ends
    // with the erasure; the stop sweep only writes that down a few minutes later (W7), so the answer here is already
    // the one given after it. Asked after the credit was read: an account still there now was there for that read.
    if (await deps.billing.ownerErasureCommitted(ownerRef, client)) refuse(409, "NOT_SUBSCRIBED");
    await request.authorize(client);
    const { state } = locked;
    const charges: Array<ChargeRow & { events: ChargeEventRow[] }> = [];
    for (const row of await deps.billing.chargesForSubscription(state.subscriptionId, client)) {
      const read = await deps.billing.charge(row.chargeId, client);
      if (read !== null) charges.push(read);
    }
    const paid = paidTransactions(charges, activatedAt);
    // C1 (P2-W6): a payment made after the statement arrived (the owner's command records it later) was made after
    // the person had withdrawn, so it goes back whole (what it still holds); the credit share covers only the payments
    // up to `withdrewAt`. Settings withdraws now, so nothing is ever after it there.
    const statedOver = paid.filter((row) => row.succeededAt.getTime() <= withdrewAt.getTime());
    const madeAfter = paid.filter((row) => row.succeededAt.getTime() > withdrewAt.getTime());
    const refundMicros = withdrawalRefundMicros({
      paidMicros: stillHeld(statedOver), creditSpentMicros: spentMicros,
      monthlyCreditMicros: entitlement.monthCreditOverrideMicros ?? planById(deps.plans, creditPlanId).monthlyCreditMicros
    }) + stillHeld(madeAfter);
    let byOwner = paid.some((row) => row.providerRefunded);
    let allocations: RefundAllocation[] = [];
    if (!byOwner) {
      allocations = allocateRefund(refundMicros, paid);
      await client.query(`SAVEPOINT ${REFUND_SAVEPOINT}`);
      try {
        await deps.refunds.requestAll(client, { ownerRef, reason: "WITHDRAWAL", allocations, at: now });
        await client.query(`RELEASE SAVEPOINT ${REFUND_SAVEPOINT}`);
      } catch (error) {
        if (!(error instanceof TypedDomainError) || error.code !== "REFUND_TRANSACTION_ALREADY_REFUNDED") throw error;
        // Every intent this withdrawal wrote goes back (and its job); the owner decides what is still due.
        await client.query(`ROLLBACK TO SAVEPOINT ${REFUND_SAVEPOINT}`);
        byOwner = true;
        allocations = [];
      }
    }
    const recorded = { source: request.source, withdrew_at: withdrewAt.toISOString() };
    await appendChecked(deps.billing, client, locked, {
      kind: "WITHDRAWN", at: now,
      data: byOwner ? { ...recorded, refund_micros: null, refund_by_owner: true } : { ...recorded, refund_micros: refundMicros }
    });
    await deps.entitlements.append(client, {
      ownerRef, planId: "FREE", periodAnchorAt: now, cause: "ENDED_WITHDRAWAL", effectiveAt: now,
      subscriptionId: state.subscriptionId, paidThrough: null, monthCreditOverrideMicros: null
    });
    // The person is told at once what has happened (M8_RECEIVED). RefundDesk queues M8 after the last refund; with
    // nothing due back no refund moves, so the acknowledgement is the only email; a withdrawal handed to the owner gets
    // its M8 when the owner settles it with the command.
    const customer = await deps.billing.customerByOwner(ownerRef, client);
    const withdrawalDate = withdrewAt.toISOString();
    if (customer !== null) {
      // S01-C13 (R-17): the withdraw request's language, when the request carries one.
      const language = request.mailLocale === undefined ? {} : { locale: request.mailLocale };
      // The statement as the buyer made it: its instant in their own zone (UTC where their country has several), and
      // the day the plan started in their own calendar.
      const statement = {
        plan: state.planId, withdrawalDate, timeZone: consumerTimeZone(taxCountry),
        ...(taxCountry === null ? {} : { startDate: consumerCalendarDay(activatedAt, taxCountry) })
      };
      await enqueueEmail(deps.billing, client, {
        template: "M8_RECEIVED", recipient: { kind: "CUSTOMER", customerId: customer.customerId },
        dedupeRef: state.subscriptionId,
        // "0.00" when nothing is due back; no amount when the owner settles the refund.
        params: byOwner
          ? statement
          : { ...statement, refundAmount: microsToDecimal(refundMicros), currency: state.currency },
        notBefore: now, resolve: { buyerName: true },
        ...language
      });
    }
    if (byOwner) {
      // W9 (P2-I11): the owner's own alert, never left to the quarterly O1 (English only, no customer data).
      await enqueueEmail(deps.billing, client, {
        template: "O2_WITHDRAWAL", recipient: { kind: "OWNER" }, dedupeRef: state.subscriptionId,
        params: {
          ownerRef, reasonCode: "WITHDRAWAL_BY_OWNER", withdrawalDate,
          refundDeadline: withdrawalRefundDeadline(withdrewAt).toISOString()
        },
        notBefore: now
      });
    }
    return Object.freeze({
      refundMicros: byOwner ? null : refundMicros, refunds: allocations.length, byOwner, currency: state.currency
    });
  });
  deps.audit("billing.withdrawal", { refunds: decided.refunds, source: request.source });
  if (decided.byOwner) deps.audit("billing.withdrawal.owner_review", { source: request.source });
  if (decided.refunds > 0) deps.kick();
  return Object.freeze({ refundMicros: decided.refundMicros, currency: decided.currency });
}

/**
 * The Settings route: now, for the signed-in session alone. OUG 34/2014 art. 11^1 (Directive 2023/2673 art. 11a,
 * recital 37): a person already signed in withdraws without identifying again, so no password, authenticator code or
 * step-up grant is asked; the page's "Confirmați retragerea" is the confirmation.
 */
export async function withdraw(deps: WithdrawalDeps, input: Readonly<{
  authenticated: AuthenticatedSession; mailLocale?: string;
}>): Promise<WithdrawalOutcome> {
  return recordWithdrawal(deps, {
    ownerRef: input.authenticated.ownerRef, withdrewAt: deps.clock(), source: "SETTINGS",
    ...(input.mailLocale === undefined ? {} : { mailLocale: input.mailLocale }),
    authorize: async () => undefined
  });
}
