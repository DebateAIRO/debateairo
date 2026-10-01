import { randomUUID } from "node:crypto";
import { computeWindows, microsToDecimal } from "@debateai/billing-core";
import type { AcceptanceRepository, BillingRepository, EntitlementRepository } from "@debateai/db";
import type { BillingPolicy } from "@debateai/register";
import { enqueueEmail, type BillingAttachmentKind } from "./email-job.js";
import { LIVE_SUBSCRIPTION_STATUSES } from "./quote.js";
import { subscriptionEvent } from "./rows.js";
import { APPLIED, type ChargeSettlement, type SettlementPrepared, type SettlementResult } from "./settlement.js";

/** INITIAL: the checkout's first payment activates the plan; the month is anchored at the payment (spec §1.2). */
export function createInitialSettlement(deps: Readonly<{
  repository: Pick<BillingRepository, "appendSubscriptionEvent" | "subscriptionsForOwner" | "enqueue">;
  entitlements: Pick<EntitlementRepository, "append">;
  /**
   * L3a's widened `latest` (D7 #14, ruling Q-3): the Terms acceptance M1 attaches (spec §2.5.10: "the Terms of the
   * accepted version"), by the hash under which L2 archived that text.
   */
  acceptances: Pick<AcceptanceRepository, "latest">;
  policy: BillingPolicy;
  /** R-7: `BillingConnectors.publicAppUrl`. */
  publicAppUrl: string;
}>): ChargeSettlement {
  return Object.freeze<ChargeSettlement>({
    /**
     * Spec §2.5.10 / A26b / D7 #14 / Q-3: the Terms the person ACCEPTED, read before the VERIFY_PAYMENT transaction
     * opens: L3a's `latest` has no transaction-client form, and a pool read under the owner lock would wait for a
     * second connection while the transaction holds one. Acceptance rows only grow, so reading them first changes
     * nothing but which instant "latest" means.
     */
    async prepare(charge): Promise<SettlementPrepared> {
      const accepted = await deps.acceptances.latest(charge.ownerRef, "TERMS");
      return Object.freeze({
        acceptedTerms: Object.freeze(accepted === null ? {} : {
          version: accepted.documentVersion, sha256: accepted.documentSha256, locale: accepted.locale
        })
      });
    },
    async succeeded(context): Promise<SettlementResult> {
      const { subscription, transaction, client, now, quote } = context;
      if (transaction === null || quote === null) throw new TypeError("BILLING_INITIAL_WITHOUT_TRANSACTION_OR_QUOTE");
      const reactivating = subscription.status === "ENDED" && subscription.endedCause === "ABANDONED";
      if (subscription.status !== "CREATED" && !reactivating) return Object.freeze({ kind: "REFUND", reason: "SUBSCRIPTION_ENDED" });
      // A8c and Review Focus 2, on BOTH paths: one live plan per owner. Read on this transaction's client, after the
      // owner lock: any competing verify for this owner committed before it released the lock, and under READ
      // COMMITTED this read sees those commits as the pool would, without waiting for a second connection.
      const others = (await deps.repository.subscriptionsForOwner(context.ownerRef, client))
        .filter((other) => other.subscriptionId !== subscription.subscriptionId);
      if (others.some((other) => LIVE_SUBSCRIPTION_STATUSES.has(other.status))) {
        return Object.freeze({ kind: "REFUND", reason: "ALREADY_SUBSCRIBED" });
      }
      // A re-activation supersedes any newer checkout still open, so a later payment for it is refused as well.
      for (const other of others.filter((candidate) => candidate.status === "CREATED")) {
        await deps.repository.appendSubscriptionEvent(client, subscriptionEvent(other, "ENDED", now, { cause: "ABANDONED", reason: "SUPERSEDED" }));
      }
      const anchor = transaction.createdAt ?? now;
      const periodEnd = computeWindows(anchor, anchor).month.end;
      await deps.repository.appendSubscriptionEvent(client, {
        eventId: randomUUID(), subscriptionId: subscription.subscriptionId, ownerRef: context.ownerRef, kind: "ACTIVATED",
        at: now, planId: quote.planId, periodAnchorAt: anchor, xmoneyOrderId: transaction.orderId,
        xmoneyCustomerId: transaction.customerId, cardRef: transaction.cardId,
        data: {
          charge_id: context.charge.chargeId, announced_total_micros: context.charge.totalMicros,
          // Terms §12: this subscriber's recurring net price. Every renewal charges it plus a fresh tax (P11a), never
          // whatever billingPlans says later; only the owner's price-change command, with its notice, moves it.
          recurring_net_micros: quote.netMicros, reactivated: reactivating
        }
      });
      await deps.entitlements.append(client, {
        ownerRef: context.ownerRef, planId: quote.planId, periodAnchorAt: anchor, cause: "SUBSCRIBED",
        effectiveAt: now, subscriptionId: subscription.subscriptionId, paidThrough: periodEnd, monthCreditOverrideMicros: null
      });
      const page = (path: string) => new URL(path, deps.publicAppUrl).toString();
      // Spec §2.5.6: the withdrawal right (and its form) exists only for a tax country in the EU, the EEA or the UK.
      const withdrawal = deps.policy.withdrawalCountries.includes(quote.taxCountry);
      // Spec §2.5.10 / A26b / D7 #14 / Q-3: the Terms the person ACCEPTED, named by that acceptance's version, hash
      // and locale (read by `prepare`); P17's resolver attaches the text L2 archived under that hash
      // (apps/ui/legal/archive/<locale>/<sha256>.md) at send time, so an older accepted version is still the one
      // attached. No TERMS row means empty fields and M1 carries the link only; in production that cannot reach here:
      // the billing gate refuses any account with no Terms record, or one below the floor (P8a, L4), so only a test
      // that skips the gate sees it.
      const terms: Readonly<Record<string, string>> = context.prepared?.acceptedTerms ?? {};
      const attachments: Array<Readonly<{ kind: BillingAttachmentKind; fields: Readonly<Record<string, string>> }>> = [
        { kind: "ACCEPTED_TERMS", fields: terms },
        ...(withdrawal ? [{ kind: "WITHDRAWAL_FORM" as const, fields: {} }] : [])
      ];
      await enqueueEmail(deps.repository, client, {
        template: "M1", recipient: { kind: "CUSTOMER", customerId: context.customerId }, dedupeRef: subscription.subscriptionId,
        params: {
          plan: quote.planId, totalAmount: microsToDecimal(context.charge.totalMicros), renewDate: periodEnd.toISOString(),
          // The Terms online today; the accepted text itself is the attachment, from the archive (Q-3).
          cancelPageUrl: page("/cancel"), termsUrl: page("/terms"),
          ...(withdrawal ? { withdrawalDays: String(deps.policy.withdrawalDays) } : {})
        },
        attachments,
        notBefore: now
      });
      return APPLIED;
    },
    /** A declined first payment changes nothing: the CREATED checkout stays, and the person may try again. */
    async failed(): Promise<void> {
      return;
    }
  });
}
