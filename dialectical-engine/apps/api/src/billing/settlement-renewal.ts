import type { PoolClient } from "pg";
import { foldSubscription, type SubscriptionEventData, type SubscriptionState } from "@debateai/billing-core";
import type { BillingJobQueries, BillingRepository, ChargeRow, EntitlementRepository } from "@debateai/db";
import type { BillingPolicy } from "@debateai/register";
import { enqueueEmail, type BillingMailTemplateId } from "./email-job.js";
import { queuePaymentAlert } from "./payment-alert.js";
import { addDays, dunningProgress } from "./renewal-rules.js";
import { subscriptionEvent } from "./rows.js";
import { APPLIED, type ChargeSettlement, type SettlementResult } from "./settlement.js";

type RenewalSettlementDeps = Readonly<{
  repository: Pick<BillingRepository, "appendSubscriptionEvent" | "enqueue">;
  entitlements: Pick<EntitlementRepository, "append">;
  policy: BillingPolicy;
  /** R-7: PUBLIC_APP_URL. */
  publicAppUrl: string;
}>;

/** One failed attempt of a renewal's dunning, with or without a charge. */
export type DunningAttempt = Readonly<{
  /** Folded under the owner lock, in the caller's transaction. */
  subscription: SubscriptionState;
  customerId: string;
  /** 1 is the renewal itself; 2..n the retries (A2's attempt numbers). */
  attempt: number;
  /** The charge whose attempt failed; null for a charge-less attempt (Q-1: no charge without a quote; P2-M10). */
  chargeId: string | null;
  /**
   * Why a charge-less attempt failed: `TAX_SERVICE_UNAVAILABLE` (the tax service could not price it) or
   * `RETRY_TOTAL_CHANGED` (W5, P2-M10: a fresh price differs from the announced total); null with a charge.
   */
  reason: string | null;
  /**
   * W10 (P2-I21): the failed charge's code (`PAYMENT_DECLINED`, `VOIDED`, `NO_TRANSACTION`, `CARD_NOT_SAVED`,
   * `AUTHENTICATION_REQUIRED`, `PAYMENT_FAILED`, `PAYMENT_EXPIRED`); null for a charge-less attempt.
   * `AUTHENTICATION_REQUIRED` puts M5's "confirm your card" sentence in place of any bank sentence.
   */
  chargeErrorCode: string | null;
  /** Whether a bank refused this attempt's charge (W10; on NETOPIA, the report's `bankDeclined`). Only then M5 says so. */
  bankDeclined: boolean;
  periodStart: Date;
  firstFailedAt: Date;
  now: Date;
}>;

/**
 * THE failed-attempt writer (spec §2.5.5, A8a, Q-1), in the caller's transaction under the owner lock: PAST_DUE with
 * the next retry at `first failure + dunning_retry_days[attempt - 1]`, on attempt 1 the PAST_DUE_GRACE (paid through
 * the first failure plus the last retry day plus 1), and M5A/M5B/M5C (whose bank sentence only a charge the bank declined
 * gets, W10, and whose "confirm your card" sentence only an AUTHENTICATION_REQUIRED one, N11); past the last retry day
 * ENDED(DUNNING), Free and M6. A charge-less attempt names its `reason` where a charged one names its `charge_id`, and
 * its M5 is deduplicated on the subscription, the period and the attempt. The settlement's `failed` (a charge) and P11a's
 * `failUnpricedAttempt` (no charge) both write through here, so the two can never drift apart.
 */
export async function writeDunningAttempt(
  deps: RenewalSettlementDeps, client: PoolClient, input: DunningAttempt
): Promise<"PAST_DUE" | "ENDED"> {
  const { subscription, now } = input;
  const page = (path: string) => new URL(path, deps.publicAppUrl).toString();
  const retryDays = deps.policy.dunningRetryDays;
  const recipient = { kind: "CUSTOMER" as const, customerId: input.customerId };
  const which = input.chargeId === null ? { reason: input.reason } : { charge_id: input.chargeId };
  const retryDay = retryDays[input.attempt - 1];
  if (retryDay !== undefined) {
    const nextRetryAt = addDays(input.firstFailedAt, retryDay);
    await deps.repository.appendSubscriptionEvent(client, subscriptionEvent(subscription, "PAST_DUE", now, {
      ...which, attempt: input.attempt, next_retry_at: nextRetryAt.toISOString(),
      first_failed_at: input.firstFailedAt.toISOString()
    }));
    if (input.attempt === 1 && subscription.periodAnchorAt !== null) {
      await deps.entitlements.append(client, {
        ownerRef: subscription.ownerRef, planId: subscription.planId, periodAnchorAt: subscription.periodAnchorAt,
        cause: "PAST_DUE_GRACE", effectiveAt: now, subscriptionId: subscription.subscriptionId,
        paidThrough: addDays(input.firstFailedAt, Math.max(...retryDays) + 1), monthCreditOverrideMicros: null
      });
    }
    const templates: ReadonlyArray<BillingMailTemplateId> = ["M5A", "M5B", "M5C"];
    await enqueueEmail(deps.repository, client, {
      template: templates[Math.min(input.attempt, templates.length) - 1]!, recipient,
      dedupeRef: input.chargeId ?? `${subscription.subscriptionId}:${input.periodStart.toISOString()}:${input.attempt}`,
      params: {
        plan: subscription.planId, retryDate: nextRetryAt.toISOString(), cardPageUrl: page("/settings/card"),
        bankDeclined: String(input.chargeId !== null && input.bankDeclined),
        ...(input.chargeId !== null && input.chargeErrorCode === "AUTHENTICATION_REQUIRED" ? { confirmCard: "true" } : {})
      },
      notBefore: now
    });
    return "PAST_DUE";
  }
  await endDunning(deps, client, { subscription, customerId: input.customerId, data: which, now });
  return "ENDED";
}

/**
 * The end of a dunning (spec §2.5.5), in the caller's transaction under the owner lock, on the subscription folded
 * there: ENDED(DUNNING) with `data`, Free from `now` (ENDED_DUNNING) and M6. `writeDunningAttempt` ends a failed attempt
 * past the last retry day through here; P2-M13's maintenance pass ends a dunning the current policy has no retry day
 * left for.
 */
export async function endDunning(
  deps: Pick<RenewalSettlementDeps, "repository" | "entitlements" | "publicAppUrl">, client: PoolClient,
  input: Readonly<{ subscription: SubscriptionState; customerId: string; data: SubscriptionEventData; now: Date }>
): Promise<void> {
  const { subscription, now } = input;
  await writeDunningEnd(deps, client, input);
  await enqueueEmail(deps.repository, client, {
    template: "M6", recipient: { kind: "CUSTOMER", customerId: input.customerId }, dedupeRef: subscription.subscriptionId,
    params: { plan: subscription.planId, pricingUrl: new URL("/pricing", deps.publicAppUrl).toString() }, notBefore: now
  });
}

/**
 * The rows of a dunning's end, and nothing else: ENDED(DUNNING) with `data` and Free from `now` (ENDED_DUNNING), in the
 * caller's transaction under the owner lock. Only the subscription's identity (id, owner, plan, anchor) is read from
 * `subscription`; `appendSubscriptionEvent` folds the rows already written and refuses an illegal end. `endDunning`
 * passes a PAST_DUE fold and adds M6; `endGivenBackRenewal` (F2, ruling PR-55; F8, ruling PR-56) ends a renewal
 * NETOPIA reports refunded, or first reports VOIDED, before the site saw it paid through here alone, with no customer
 * email, and for attempt 1 passes the ACTIVE fold after writing PAST_DUE in the same transaction.
 */
export async function writeDunningEnd(
  deps: Readonly<{ repository: Pick<BillingRepository, "appendSubscriptionEvent">; entitlements: Pick<EntitlementRepository, "append"> }>,
  client: PoolClient, input: Readonly<{ subscription: SubscriptionState; data: SubscriptionEventData; now: Date }>
): Promise<void> {
  const { subscription, now } = input;
  await deps.repository.appendSubscriptionEvent(client, subscriptionEvent(subscription, "ENDED", now, { cause: "DUNNING", ...input.data }));
  await deps.entitlements.append(client, {
    ownerRef: subscription.ownerRef, planId: "FREE", periodAnchorAt: now, cause: "ENDED_DUNNING", effectiveAt: now,
    subscriptionId: subscription.subscriptionId, paidThrough: null, monthCreditOverrideMicros: null
  });
}

/**
 * A renewal's month given back at NETOPIA before the site saw it paid, in the caller's transaction under the owner
 * lock: F2 (money-1, ruling PR-55) for a RENEWAL charge NETOPIA reports REFUNDED (`netopiaProviderRefund`), and F8
 * (ruling PR-56) for one whose first state is VOIDED (its FAILED(VOIDED) written by VERIFY_PAYMENT's `netopiaFailed` or
 * by the renewal's own `refused`): NETOPIA cannot yet tell (N-9) an owner's cancellation in its admin from another void,
 * and dunning a person for a month the owner gave back is the worse error. The plan ends now, attempt 1 (an ACTIVE plan)
 * and a dunning retry (PAST_DUE) alike, the way the maintenance pass ends a spent dunning (ENDED(DUNNING) and Free,
 * `writeDunningEnd`), and with NO customer email; no dunning starts or goes on. The fold ends a dunning only from
 * PAST_DUE, so an ACTIVE plan first records the attempt unpaid (PAST_DUE, with no retry date: none will be made). Only a
 * plan still on the month this charge renews. Then one O3 RENEWAL_REFUNDED_BEFORE_SEEN for the owner, in the same
 * transaction, once per charge.
 */
export async function endGivenBackRenewal(
  deps: Readonly<{
    repository: Pick<BillingRepository, "subscriptionEvents" | "appendSubscriptionEvent" | "withTransaction" | "enqueue">;
    entitlements: Pick<EntitlementRepository, "append">;
    jobs: Pick<BillingJobQueries, "outboxJobExists">;
  }>,
  client: PoolClient,
  input: Readonly<{
    charge: Pick<ChargeRow, "chargeId" | "subscriptionId" | "attempt" | "periodStart">; paymentId: string; now: Date;
  }>
): Promise<void> {
  const { charge, paymentId, now } = input;
  const subscription = foldSubscription(await deps.repository.subscriptionEvents(charge.subscriptionId, client));
  const live = (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE")
    && subscription.currentPeriodEnd?.getTime() === charge.periodStart.getTime();
  if (live) {
    if (subscription.status === "ACTIVE") {
      await deps.repository.appendSubscriptionEvent(client, subscriptionEvent(subscription, "PAST_DUE", now, {
        charge_id: charge.chargeId, attempt: charge.attempt, first_failed_at: now.toISOString()
      }));
    }
    await writeDunningEnd(deps, client, {
      subscription, data: { charge_id: charge.chargeId, refunded_before_seen: true }, now
    });
  }
  await queuePaymentAlert({ repository: deps.repository, jobs: deps.jobs }, {
    code: "RENEWAL_REFUNDED_BEFORE_SEEN", reference: `charge ${charge.chargeId}`,
    dedupeRef: `${charge.chargeId}:RENEWAL_REFUNDED_BEFORE_SEEN`, now,
    nextSteps: live
      ? "NETOPIA reports this renewal's payment refunded (or cancelled) before the site saw it paid, so the plan has"
        + " ended and the person was not emailed. Tell them yourself; if they should keep the plan, they can subscribe again."
      : `NETOPIA reports this renewal's payment (NETOPIA payment ${paymentId}) refunded (or cancelled) before the site saw`
        + " it paid. Its plan was not active or past due on the month this payment renewed (it had ended, was paused by a"
        + " dispute, or was already renewed), so no plan changed and the person was not emailed. Look at the plan and"
        + " this payment in NETOPIA's admin; tell the person yourself if they need to know."
  }, client);
}

export function createRenewalSettlement(deps: RenewalSettlementDeps): ChargeSettlement {
  return Object.freeze<ChargeSettlement>({
    async succeeded(context): Promise<SettlementResult> {
      const { subscription, charge, quote, client, now } = context;
      const live = subscription.status === "ACTIVE" || subscription.status === "PAST_DUE";
      if (quote === null) throw new TypeError("BILLING_RENEWAL_WITHOUT_QUOTE");
      if (!live || subscription.periodAnchorAt === null || subscription.currentPeriodEnd === null
        || subscription.currentPeriodEnd.getTime() !== charge.periodStart.getTime()) {
        return Object.freeze({ kind: "REFUND", reason: "SUBSCRIPTION_ENDED" });
      }
      // Spec §2.5.6: cancel means no renewal. A retry submitted (or adopted) before a PAST_DUE owner cancelled is
      // money back, never RECOVERED; P11b's sweep then ends the plan.
      if (subscription.status === "PAST_DUE" && subscription.cancelRequested) {
        return Object.freeze({ kind: "REFUND", reason: "SUBSCRIPTION_ENDED" });
      }
      const downgrading = quote.planId !== subscription.planId;
      const data = { charge_id: charge.chargeId, period_start: charge.periodStart.toISOString(), period_end: charge.periodEnd.toISOString() };
      // R-34: DOWNGRADE_SCHEDULED becomes DOWNGRADED at the renewal. A PAST_DUE plan recovers at the lower plan
      // directly (P2's fold accepts RECOVERED at the scheduled plan).
      if (downgrading && subscription.status === "ACTIVE") {
        await deps.repository.appendSubscriptionEvent(client, subscriptionEvent(subscription, "DOWNGRADED", now, { charge_id: charge.chargeId }, { planId: quote.planId }));
      }
      const recovering = subscription.status === "PAST_DUE";
      // N10 (spec §2.15.2): NETOPIA issues a new token with each token payment; a RENEWED carries it. A RECOVERED may
      // not (spec §2.5.5), so a recovered retry's card is adopted by a CARD_SAVED right after it.
      const cardTokenId = context.payment?.cardTokenId ?? null;
      await deps.repository.appendSubscriptionEvent(client, subscriptionEvent(
        subscription, recovering ? "RECOVERED" : "RENEWED", now, data,
        { planId: quote.planId, ...(cardTokenId !== null && !recovering ? { cardTokenId } : {}) }
      ));
      if (cardTokenId !== null && recovering) {
        await deps.repository.appendSubscriptionEvent(client, subscriptionEvent(
          subscription, "CARD_SAVED", now, { charge_id: charge.chargeId }, { planId: quote.planId, cardTokenId }
        ));
      }
      await deps.entitlements.append(client, {
        ownerRef: context.ownerRef, planId: quote.planId, periodAnchorAt: subscription.periodAnchorAt,
        cause: downgrading ? "DOWNGRADED" : "RENEWED", effectiveAt: now, subscriptionId: subscription.subscriptionId,
        paidThrough: charge.periodEnd, monthCreditOverrideMicros: null
      });
      return APPLIED;
    },

    /**
     * Spec §2.5.5 failures: PAST_DUE with retries at the policy's days, then ENDED(DUNNING) and Free. Only for the
     * subscription's current unpaid period, and never once a cancel is pending: a cancelled plan is ended by P11b's
     * sweep (ENDED(CANCEL)), never dunned, retried or emailed. `NO_TRANSACTION` (a charge that never reached NETOPIA, or
     * whose outcome stayed unknown, closed by P11a) reaches here only once Q-1's 72 hours of quiet retries are over, so
     * it takes the normal path, emails included (the ruling: "PAST_DUE, retries +1/+3/+7 days with M5A–C").
     */
    async failed(context): Promise<void> {
      const { subscription, charge, client, now } = context;
      if (subscription.status !== "ACTIVE" && subscription.status !== "PAST_DUE") return;
      if (subscription.cancelRequested) return;
      if (subscription.currentPeriodEnd === null || subscription.currentPeriodEnd.getTime() !== charge.periodStart.getTime()) return;
      // Every retry is timed from the first failure. Read from the history folded under this lock (the attempt-1
      // failure may have had no charge, Q-1), never from charge rows through a second connection.
      const firstFailedAt = charge.attempt === 1 ? now : dunningProgress(context.events, subscription)?.firstFailedAt ?? now;
      // W10: a NETOPIA decline names the bank only when NETOPIA says so (spec §2.4.5: not for antifraud, risk or a
      // failed 3-D Secure), and a caller that did not say is never read as one.
      const bankDeclined = context.bankDeclined ?? false;
      await writeDunningAttempt(deps, client, {
        subscription, customerId: context.customerId, attempt: charge.attempt, chargeId: charge.chargeId, reason: null,
        chargeErrorCode: context.errorCode, bankDeclined, periodStart: charge.periodStart, firstFailedAt, now
      });
    }
  });
}
