import { addBusinessDays, foldSubscription, type SubscriptionState } from "@debateai/billing-core";
import type { BillingJobQueries, BillingRepository } from "@debateai/db";
import type { BillingPolicy } from "@debateai/register";
import { DONE, type OutboxHandler } from "./outbox.js";
import type { RenewalService } from "./renewal.js";

const stillDue = (state: SubscriptionState, periodEnd: string): boolean =>
  state.status === "ACTIVE" && !state.cancelRequested && state.currentPeriodEnd?.toISOString() === periodEnd;

/**
 * P11b look-ahead: the job ref is `${subscriptionId}:${periodEnd ISO}`; a stale or unchanged renewal is done. M3's
 * charge date is the day the renewal will really charge: the period end, or 7 business days after this notice when
 * that is later (the renewal waits out the notice period, P11a's `renewalNoticeDecision`).
 */
export function createRenewalNoticeHandler(deps: Readonly<{
  repository: Pick<BillingRepository, "subscriptionEvents" | "withTransaction">;
  jobs: Pick<BillingJobQueries, "lockOwner">;
  renewal: Pick<RenewalService, "freshQuote" | "writeNotice">;
  policy: BillingPolicy;
}>): OutboxHandler {
  return async (job, now) => {
    const split = job.ref.indexOf(":");
    const subscriptionId = job.ref.slice(0, split);
    const periodEnd = job.ref.slice(split + 1);
    const state = foldSubscription(await deps.repository.subscriptionEvents(subscriptionId));
    if (!stillDue(state, periodEnd)) return DONE;
    const priced = await deps.renewal.freshQuote(state, now);
    if (priced.tax.totalMicros === state.announcedTotalMicros) return DONE;
    const noticeEnds = addBusinessDays(now, deps.policy.renewalNoticeBusinessDays);
    const chargeDate = noticeEnds.getTime() > state.currentPeriodEnd!.getTime() ? noticeEnds : state.currentPeriodEnd!;
    await deps.repository.withTransaction(async (client) => {
      await deps.jobs.lockOwner(client, state.ownerRef);
      // Folded again under the lock, on its own connection: a cancel, withdrawal or erasure in between leaves nothing
      // to announce.
      const fresh = foldSubscription(await deps.repository.subscriptionEvents(subscriptionId, client));
      if (!stillDue(fresh, periodEnd)) return;
      await deps.renewal.writeNotice(client, fresh, priced, now, chargeDate);
    });
    return DONE;
  };
}
