import type { PoolClient } from "pg";
import type { EntitlementRepository } from "@debateai/db";
import { planById, planNetPrice } from "@debateai/register";
import { enqueueEmail } from "./email-job.js";
import { isThisPaymentSystem } from "./outbox.js";
import { quoteTax, storedTaxContext } from "./stored-tax-context.js";
import { appendChecked, lockedAfter, lockedSubscription, refuse, type LockedSubscription } from "./subscription-core.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";

/**
 * Who stopped the renewal. ACCOUNT_ERASURE (W7, P2-I10): scheduling an account deletion stops the renewal at once
 * and leaves the paid plan running until the erasure commits (P15's hook, `erasure-hook.ts`).
 */
export type CancelSource = "SETTINGS" | "EMAIL_LINK" | "ACCOUNT_ERASURE";
export type CancelOutcome = "REQUESTED" | "ALREADY_REQUESTED" | "NOT_CANCELLABLE";

/**
 * CANCEL_REQUESTED inside the caller's transaction, under the owner lock: no renewal, then email M7. Shared by
 * Settings and the emailed link (P13).
 * - ACTIVE, its renewal not reached yet: access continues until the period ends (spec §2.5.6); no renewal starts,
 *   because P11a's `createCharge` refuses a plan with a cancel pending; P11b's period-end sweep writes ENDED(CANCEL).
 * - PAST_DUE: the paid access ends now. This function writes it itself, in the same transaction: ENDED(CANCEL) from
 *   the refreshed fold and a FREE entitlement effective now, so no dunning retry (a renewal) can charge the card
 *   again, and M7's access end is today. (The FREE row must be effective now: one anchored at the unpaid period's
 *   end would sit before P11a's PAST_DUE_GRACE row and lose to it.) P11b's maintenance pass, at most ten minutes
 *   later, is only the second line: it writes ENDED(CANCEL) with the FREE entitlement effective at that pass for a
 *   PAST_DUE subscription whose cancel reached it without the ENDED, and here finds nothing to do. An ENDED plan
 *   cannot be revoked; the revoke route refuses it.
 * - ACTIVE whose renewal has been reached — its period end already behind it (R2 Q-1: the renewal is waiting out an
 *   outage and RENEWAL_PENDING keeps the paid access), or a RENEWAL charge for the next period already written (the
 *   renewal's 5-minute lead) — also ends now, in this transaction: ENDED(CANCEL) and a FREE entitlement effective now,
 *   anchored where the paid period ends or now, whichever is earlier (a window is never read before its anchor). The
 *   cancel flag alone stops only a renewal that has not started: P11a's recovery adopts a submitted or unknown rebill
 *   whatever the plan's state, and its settlement renews an ACTIVE plan with a cancel pending. Ended here, the plan
 *   takes the settlement's not-live branch instead (a full SUBSCRIPTION_ENDED refund, no RENEWED); every one of those
 *   writers takes this same owner lock, so none interleaves. The cost: a cancel inside the lead ends the paid access
 *   up to `renewalLeadMs()` before the period end.
 * - SUSPENDED (P2-W10, the owner's ruling of 3 October 2026: a plan paused by a card dispute can be cancelled by its
 *   person): only the cancel is written, nothing ends now. The suspension already wrote Free, and the dispute decides
 *   the end: lost is ENDED(DISPUTE); won is RESUMED, which keeps the flag, so P11b's sweep ends the plan ENDED(CANCEL)
 *   at its period end and no renewal starts (P11a's `renewable`); a period already over is P11b's ENDED(DISPUTE).
 * M7's `canUndo` (D7's flag) is "true" only while the access runs on into the future, which is exactly when the revoke
 * route accepts an undo. A SUSPENDED plan's M7 takes the paused variant instead (`paused` "true", `canUndo` "false"):
 * its features are paused, so there is no "you keep it until", and the revoke route refuses it while paused (C5: once
 * a won dispute resumes the plan, the undo works as for every cancel); its access end is the period end, the latest
 * the features can come back. Its dedupe ref is the subscription and the access end, so cancel, revoke, cancel again
 * in one period queues one M7. A25 and R2 Q-4: M7 links to a page (Settings, the one place that undoes it), never to a
 * token.
 */
export async function requestCancelLocked(
  deps: Readonly<{
    billing: SubscriptionRouteDeps["billing"];
    entitlements: Pick<EntitlementRepository, "append">;
    publicAppUrl: string;
  }>,
  client: PoolClient, locked: LockedSubscription, now: Date, source: "SETTINGS" | "EMAIL_LINK"
): Promise<CancelOutcome> {
  const written = await writeCancelLocked(deps, client, locked, now, source);
  if (written.outcome !== "REQUESTED") return written.outcome;
  const { state } = locked;
  const { accessEndsAt } = written;
  const paused = state.status === "SUSPENDED";
  const canUndo = !paused && accessEndsAt.getTime() > now.getTime();
  const customer = await deps.billing.customerByOwner(state.ownerRef, client);
  if (customer !== null) {
    await enqueueEmail(deps.billing, client, {
      template: "M7",
      recipient: { kind: "CUSTOMER", customerId: customer.customerId },
      dedupeRef: `${state.subscriptionId}:${accessEndsAt.toISOString()}`,
      params: {
        plan: state.planId,
        accessEndDate: accessEndsAt.toISOString().slice(0, 10),
        settingsUrl: new URL("/settings", deps.publicAppUrl).toString(),
        canUndo: canUndo ? "true" : "false",
        // Only a paused plan carries the flag: every other M7 keeps its params exactly as before P2-W10.
        ...(paused ? { paused: "true" } : {})
      },
      notBefore: now
    });
  }
  return "REQUESTED";
}

/**
 * `requestCancelLocked`'s records without its email: CANCEL_REQUESTED, and the immediate end (ENDED(CANCEL) with a
 * FREE entitlement effective now) when the plan is PAST_DUE or its renewal has been reached. W7 (P2-I10): P15's hook
 * writes an account deletion's renewal stop through it (`ACCOUNT_ERASURE`), with no M7, since the deletion screen
 * already said what happens to the plan. A SUSPENDED plan is stopped from every source (W7 for an erasure, P2-W10 for
 * the person's own cancel in Settings or through the emailed link), with no end: the dispute decides it, so a plan
 * resumed after it was cancelled is not renewed. `accessEndsAt`: the end of the paid access the cancel leaves (for a
 * SUSPENDED plan, the period end: the latest its paused features can come back).
 */
export async function writeCancelLocked(
  deps: Readonly<{
    billing: Pick<SubscriptionRouteDeps["billing"], "appendSubscriptionEvent" | "chargesForSubscription">;
    entitlements: Pick<EntitlementRepository, "append">;
  }>,
  client: PoolClient, locked: LockedSubscription, now: Date, source: CancelSource
): Promise<Readonly<{ outcome: "REQUESTED"; accessEndsAt: Date }> | Readonly<{ outcome: Exclude<CancelOutcome, "REQUESTED"> }>> {
  const { state } = locked;
  if (state.status !== "ACTIVE" && state.status !== "PAST_DUE" && state.status !== "SUSPENDED") {
    return { outcome: "NOT_CANCELLABLE" };
  }
  if (state.cancelRequested) return { outcome: "ALREADY_REQUESTED" };
  const periodEnd = state.currentPeriodEnd;
  // Read on the lock's own connection (P12b's one-connection rule): a RENEWAL charge whose period starts at this
  // period's end means the renewal is under way, and no flag can call it back.
  const renewalReached = state.status === "ACTIVE" && periodEnd !== null && (
    periodEnd.getTime() <= now.getTime()
    || (await deps.billing.chargesForSubscription(state.subscriptionId, client)).some((charge) =>
      charge.kind === "RENEWAL" && charge.periodStart.getTime() === periodEnd.getTime())
  );
  const cancel = await appendChecked(deps.billing, client, locked, { kind: "CANCEL_REQUESTED", at: now, data: { source } });
  const endsNow = state.status === "PAST_DUE" || renewalReached;
  if (endsNow) {
    await appendChecked(deps.billing, client, lockedAfter(locked, cancel), {
      kind: "ENDED", at: now, data: { cause: "CANCEL" }
    });
    // From PAST_DUE the Free month starts now (P11b's rule); from ACTIVE it is anchored where the paid period ends,
    // or now when that end is still minutes ahead (inside the lead), since B4b's `computeWindows` refuses a read before
    // its anchor. Effective now either way, so it is the row in force from this instant.
    const anchorAt = state.status === "ACTIVE" && periodEnd !== null && periodEnd.getTime() <= now.getTime()
      ? periodEnd : now;
    await deps.entitlements.append(client, {
      ownerRef: state.ownerRef, planId: "FREE", periodAnchorAt: anchorAt, cause: "ENDED_CANCEL", effectiveAt: now,
      subscriptionId: state.subscriptionId, paidThrough: null, monthCreditOverrideMicros: null
    });
  }
  const accessEndsAt = endsNow || periodEnd === null || periodEnd.getTime() <= now.getTime() ? now : periodEnd;
  return { outcome: "REQUESTED", accessEndsAt };
}

/**
 * The Settings cancel. Not gated on the Terms re-acceptance (spec §2.3.2's billing-route refusal): the one-click
 * cancel of Terms §12 must work whatever the person has or has not accepted, and it commits them to nothing new.
 */
export async function cancelForOwner(deps: SubscriptionRouteDeps, ownerRef: string): Promise<void> {
  const outcome = await deps.billing.withTransaction(async (client) => {
    const locked = await lockedSubscription(deps, client, ownerRef);
    // P2-M12: the clock is read once the lock is held, so a grace or hold row a writer dated while this waited for
    // the lock never outranks the cancel's FREE row (`billing.entitlement_at` takes the latest `effective_at`).
    return locked === null ? "NOT_CANCELLABLE" as const : requestCancelLocked(deps, client, locked, deps.clock(), "SETTINGS");
  });
  if (outcome === "NOT_CANCELLABLE") refuse(409, "NOT_SUBSCRIBED");
  if (outcome === "REQUESTED") deps.audit("billing.cancel", { source: "SETTINGS" });
}

/**
 * CANCEL_REVOKED, allowed before the period ends; with nothing to revoke it is a quiet success. Gated on the Terms
 * re-acceptance (spec §2.3.2, R2 Q-10: the server's refusal is the real guard): a revoke commits the person to
 * renewing under the Terms in force, so it waits until they have accepted the current version. W7 (P2-I10): refused
 * ACCOUNT_ERASURE_PENDING while an account deletion is pending (read under the owner lock): P11a's guard would never
 * renew the plan then, so an undone cancel would keep a paid plan ACTIVE past its paid month. Once the person cancels
 * the deletion, the undo works as always.
 */
export async function revokeCancelForOwner(deps: SubscriptionRouteDeps, ownerRef: string): Promise<void> {
  const now = deps.clock();
  if (await deps.legal.requiresReacceptance(ownerRef)) refuse(403, "LEGAL_REACCEPTANCE_REQUIRED");
  const outcome = await deps.billing.withTransaction(async (client) => {
    const locked = await lockedSubscription(deps, client, ownerRef);
    if (locked === null) return "NOT_SUBSCRIBED" as const;
    const { state } = locked;
    if (state.status !== "ACTIVE" && state.status !== "PAST_DUE") return "NOT_SUBSCRIBED" as const;
    // D5 5h (P2-I4), spec §2.5.4: a plan of another payment system is never renewed here, so its cancel stands (a
    // sandbox plan revoked on live would stay ACTIVE for ever and refuse the next live start).
    if (!isThisPaymentSystem(state, deps.paymentEnvironment)) {
      return "NOT_SUBSCRIBED" as const;
    }
    if (!state.cancelRequested) return "NOTHING" as const;
    if (state.currentPeriodEnd !== null && now.getTime() >= state.currentPeriodEnd.getTime()) {
      return "NOT_SUBSCRIBED" as const;
    }
    if (await deps.billing.ownerErasurePending(ownerRef, client)) return "ERASURE_PENDING" as const;
    await appendChecked(deps.billing, client, locked, { kind: "CANCEL_REVOKED", at: now });
    return "REVOKED" as const;
  });
  if (outcome === "NOT_SUBSCRIBED") refuse(409, "NOT_SUBSCRIBED");
  if (outcome === "ERASURE_PENDING") refuse(409, "ACCOUNT_ERASURE_PENDING");
  if (outcome === "REVOKED") deps.audit("billing.cancel.revoked", {});
}

/**
 * DOWNGRADE_SCHEDULED: the lower plan starts at the next renewal (P11a writes DOWNGRADED). A7: the lower plan's
 * full recurring total is quoted now at P11's stored location, outside the transaction (no provider call runs
 * inside one), and announced as `announced_total_micros`, so the renewal charges it without a new notice when the
 * fresh quote agrees. Terms §12: the lower plan's net quoted now is recorded as `recurring_net_micros`, the price
 * P11a's `recurringNetOf` renews at from then on. The route charges the per-owner quote budget first (every call is a
 * paid tax quote). Gated on the Terms re-acceptance first (spec §2.3.2, R2 Q-10): a downgrade sets the new recurring
 * price, a change of the contract, and the refusal comes before any read or tax quote, so a refused downgrade never
 * pays for one. Once the renewal charge for the next period is written (inside the lead, or retrying through an
 * NETOPIA outage, R2 Q-1), it is priced at the current plan and settles RENEWED at it, so a downgrade then would only
 * move to the month after while the person was told "from today": it is refused DOWNGRADE_NOT_AVAILABLE_NOW (as
 * P12c refuses an upgrade), read under the lock on its own connection, as `requestCancelLocked` reads it.
 */
export async function scheduleDowngrade(
  deps: SubscriptionRouteDeps, ownerRef: string, planId: "PLUS" | "PRO"
): Promise<void> {
  const now = deps.clock();
  if (await deps.legal.requiresReacceptance(ownerRef)) refuse(403, "LEGAL_REACCEPTANCE_REQUIRED");
  const before = await deps.billing.subscriptionForOwner(ownerRef);
  if (before === null || before.status !== "ACTIVE") refuse(409, "NOT_SUBSCRIBED");
  const target = planById(deps.plans, planId);
  // Spec 2026-10-05 §2.16.3: both prices in the subscription's own currency.
  const targetNetMicros = planNetPrice(target, before.currency);
  if (targetNetMicros >= planNetPrice(planById(deps.plans, before.planId), before.currency)) refuse(422, "DOWNGRADE_NOT_LOWER");
  if (before.scheduledDowngradePlanId === planId) return;
  const context = await storedTaxContext({ billing: deps.billing, recordsKey: deps.recordsKey }, before);
  const recurring = await quoteTax(deps.tax, deps.policy, context, targetNetMicros, now);
  const written = await deps.billing.withTransaction(async (client) => {
    const locked = await lockedSubscription(deps, client, ownerRef);
    if (locked === null || locked.state.subscriptionId !== before.subscriptionId || locked.state.status !== "ACTIVE") {
      refuse(409, "NOT_SUBSCRIBED");
    }
    if (planNetPrice(target, locked.state.currency)
      >= planNetPrice(planById(deps.plans, locked.state.planId), locked.state.currency)) {
      refuse(422, "DOWNGRADE_NOT_LOWER");
    }
    // Asking again for the plan already scheduled stays a quiet success: its renewal charge, if written, is priced at it.
    if (locked.state.scheduledDowngradePlanId === planId) return false;
    // The renewal is under way once its charge for the next period exists: that charge is priced at the plan in force
    // (or the one already scheduled), and its settlement writes the renewal at it, so a new choice could only start a
    // month later. Read on the lock's own connection (P12b's one-connection rule).
    const periodEnd = locked.state.currentPeriodEnd;
    if (periodEnd !== null && (await deps.billing.chargesForSubscription(locked.state.subscriptionId, client)).some(
      (charge) => charge.kind === "RENEWAL" && charge.periodStart.getTime() === periodEnd.getTime()
    )) {
      refuse(409, "DOWNGRADE_NOT_AVAILABLE_NOW");
    }
    await appendChecked(deps.billing, client, locked, {
      kind: "DOWNGRADE_SCHEDULED", at: now, planId,
      data: { announced_total_micros: recurring.totalMicros, recurring_net_micros: recurring.netMicros }
    });
    return true;
  });
  if (written) deps.audit("billing.downgrade.scheduled", { plan_id: planId });
}
