import { addBusinessDays, foldSubscription, type SubscriptionState } from "@debateai/billing-core";
import type { BillingJobQueries, BillingRepository, CustomerXMoneyEnvironment } from "@debateai/db";
import type { BillingPolicy } from "@debateai/register";
import type { BillingAudit } from "./audit.js";
import { DONE, otherPaymentSystem, otherXMoneySystem, type OutboxHandler } from "./outbox.js";
import type { RenewalService } from "./renewal.js";
import { servedHere } from "./renewal-rules.js";

const stillDue = (state: SubscriptionState, periodEnd: string): boolean =>
  state.status === "ACTIVE" && !state.cancelRequested && state.currentPeriodEnd?.toISOString() === periodEnd;

/**
 * P11b look-ahead: the job ref is `${subscriptionId}:${periodEnd ISO}`; a stale or unchanged renewal is done. M3's
 * charge date is the day the renewal will really charge: the period end, or 7 business days after this notice when
 * that is later (the renewal waits out the notice period, P11a's `renewalNoticeDecision`).
 * P2-W3 (b) (D5 5h): the look-ahead never queues a notice for the other xMoney system's plan, but one queued before the
 * host changed system would be priced with the other system's tax engine and email a real person. A due notice of a
 * plan of the other system therefore ends DEAD `OTHER_XMONEY_SYSTEM` (one content-free audit line) before any quote.
 */
export function createRenewalNoticeHandler(deps: Readonly<{
  repository: Pick<BillingRepository, "subscriptionEvents" | "withTransaction">;
  jobs: Pick<BillingJobQueries, "lockOwner">;
  renewal: Pick<RenewalService, "freshQuote" | "writeNotice">;
  policy: BillingPolicy;
  /** P6a's connectors.xmoneyEnvironment: the xMoney system this API talks to. */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
  /** N8's connectors.paymentEnvironment; absent in the xMoney harnesses (no NETOPIA plan is then served). */
  paymentEnvironment?: "sandbox" | "live";
  audit: BillingAudit;
}>): OutboxHandler {
  return async (job, now) => {
    const split = job.ref.indexOf(":");
    const subscriptionId = job.ref.slice(0, split);
    const periodEnd = job.ref.slice(split + 1);
    const state = foldSubscription(await deps.repository.subscriptionEvents(subscriptionId));
    if (!stillDue(state, periodEnd)) return DONE;
    // Spec §2.5.4 (`servedHere`): a plan of another payment system is never priced here. Its DEAD code names the system
    // the plan belongs to (ruling PR-8's `otherPaymentSystem` for NETOPIA; xMoney's own code until N23).
    if (!servedHere(state, { xmoneyEnvironment: deps.xmoneyEnvironment, paymentEnvironment: deps.paymentEnvironment ?? null })) {
      return state.paymentProvider === "netopia" ? otherPaymentSystem(deps.audit, job.kind) : otherXMoneySystem(deps.audit, job.kind);
    }
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
