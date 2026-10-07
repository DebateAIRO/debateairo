import type { PoolClient } from "pg";
import type { SubscriptionEventData, SubscriptionState } from "@debateai/billing-core";
import type { BillingRepository, EntitlementRepository } from "@debateai/db";
import type { BillingPolicy } from "@debateai/register";
import { enqueueEmail, type BillingMailTemplateId } from "./email-job.js";
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
   * W10 (P2-I21): the failed charge's code (`PAYMENT_DECLINED`, `VOIDED`, `REBILL_REFUSED` or `NO_TRANSACTION`); null
   * for a charge-less attempt. Only `PAYMENT_DECLINED` means a bank refused, so only it puts the bank's refusal in M5.
   */
  chargeErrorCode: string | null;
  periodStart: Date;
  firstFailedAt: Date;
  now: Date;
}>;

/**
 * THE failed-attempt writer (spec §2.5.5, A8a, Q-1), in the caller's transaction under the owner lock: PAST_DUE with
 * the next retry at `first failure + dunning_retry_days[attempt - 1]`, on attempt 1 the PAST_DUE_GRACE (paid through
 * the first failure plus the last retry day plus 1), and M5A/M5B/M5C (whose bank sentence only a PAYMENT_DECLINED
 * charge gets, W10); past the last retry day ENDED(DUNNING), Free
 * and M6. A charge-less attempt names its `reason` where a charged one names its `charge_id`, and its M5 is
 * deduplicated on the subscription, the period and the attempt. The settlement's `failed` (a charge) and P11a's
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
        bankDeclined: String(input.chargeId !== null && input.chargeErrorCode === "PAYMENT_DECLINED")
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
  await deps.repository.appendSubscriptionEvent(client, subscriptionEvent(subscription, "ENDED", now, { cause: "DUNNING", ...input.data }));
  await deps.entitlements.append(client, {
    ownerRef: subscription.ownerRef, planId: "FREE", periodAnchorAt: now, cause: "ENDED_DUNNING", effectiveAt: now,
    subscriptionId: subscription.subscriptionId, paidThrough: null, monthCreditOverrideMicros: null
  });
  await enqueueEmail(deps.repository, client, {
    template: "M6", recipient: { kind: "CUSTOMER", customerId: input.customerId }, dedupeRef: subscription.subscriptionId,
    params: { plan: subscription.planId, pricingUrl: new URL("/pricing", deps.publicAppUrl).toString() }, notBefore: now
  });
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
     * sweep (ENDED(CANCEL)), never dunned, retried or emailed. `NO_TRANSACTION` (a rebill that never reached xMoney, or
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
      await writeDunningAttempt(deps, client, {
        subscription, customerId: context.customerId, attempt: charge.attempt, chargeId: charge.chargeId, reason: null,
        chargeErrorCode: context.errorCode, periodStart: charge.periodStart, firstFailedAt, now
      });
    }
  });
}
