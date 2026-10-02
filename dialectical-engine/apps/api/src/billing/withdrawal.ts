import type { PoolClient } from "pg";
import { hashToken } from "@debateai/crypto";
import { TypedDomainError } from "@debateai/kernel";
import { microsToDecimal, withdrawalRefundMicros } from "@debateai/billing-core";
import type { ChargeEventRow, ChargeRow } from "@debateai/db";
import { planById } from "@debateai/register";
import type { AuthenticatedSession } from "../sessions.js";
import { enqueueEmail } from "./email-job.js";
import { allocateRefund, paidTransactions, type RefundAllocation } from "./refunds.js";
import { appendChecked, lockedSubscription, refuse } from "./subscription-core.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";
import { initialTaxCountry, withdrawalOpenUntil } from "./subscription-view.js";

/** What a withdrawal needs: the route's composition, or the owner's command (P14c) over its operator pool. */
export type WithdrawalDeps = Pick<SubscriptionRouteDeps,
  | "billing" | "jobs" | "entitlements" | "plans" | "policy" | "ownerSpend" | "refunds" | "audit" | "clock" | "kick"
  | "xmoneyEnvironment">;

export type WithdrawalRequest = Readonly<{
  ownerRef: string;
  /**
   * When the person withdrew: now for Settings; the instant the email or the model form arrived for the owner's
   * command (P14c). The window, the days share, the credit spent and the credit in force are all taken at it.
   */
  withdrewAt: Date;
  source: "SETTINGS" | "OWNER";
  /** Runs under the owner lock before anything is written; the route spends the step-up grant here. */
  authorize: (client: PoolClient) => Promise<void>;
}>;

/** The refund on its way back, or null when the owner settles it by hand (a dashboard refund touched a payment). */
export type WithdrawalOutcome = Readonly<{ refundMicros: number | null }>;

/** Rolls back the refund intents alone when a transaction cannot take one; WITHDRAWN is written after it. */
const REFUND_SAVEPOINT = "billing_withdrawal_refunds";

/**
 * Spec §2.5.6 withdraw. The decision and every record commit together — WITHDRAWN, the FREE entitlement and the
 * refund intents (P9b's RefundDesk: REFUND_REQUESTED + one XMONEY_REFUND job per transaction, split newest first) —
 * and only then does money move, through the outbox this function kicks; M8 ("we refunded …") follows the last
 * refund (RefundDesk's WITHDRAWAL follow-up), or goes now when nothing is due back. The credit share uses the credit
 * in force at `withdrewAt` (A6's override after an upgrade) and the credit spent from the period start to it
 * ("withdrawal after an upgrade: the paid total is the sum of all successful charges since the first activation");
 * both are read before the lock, so a plan or period that changed meanwhile is refused and nothing is written.
 *
 * D6a F20(c): when a refund made in the xMoney dashboard touched any paid transaction (`providerRefunded`, whose
 * refunded amount is only an upper bound), or when a transaction already holds a refund request
 * (`REFUND_TRANSACTION_ALREADY_REFUNDED`), the refund due cannot be taken from our rows: the withdrawal is recorded
 * (the plan ends now) with `refund_by_owner`, and no intent and no M8 are written. The owner settles it with
 * `pnpm billing:withdraw --owner <ref> --refund <amount> --dashboard <amount>` (P14c); P16b's summary lists it until
 * then.
 */
export async function recordWithdrawal(deps: WithdrawalDeps, request: WithdrawalRequest): Promise<WithdrawalOutcome> {
  const now = deps.clock();
  const { ownerRef, withdrewAt } = request;
  const before = await deps.billing.subscriptionForOwner(ownerRef);
  if (before === null || before.status !== "ACTIVE" || before.currentPeriodStart === null
    || before.currentPeriodEnd === null || before.activatedAt === null
    || withdrewAt.getTime() < before.currentPeriodStart.getTime()
    // D5 5h (P2-I4): its payments live in the other xMoney system, where this API cannot refund them.
    || before.xmoneyEnvironment !== deps.xmoneyEnvironment) {
    refuse(409, "NOT_SUBSCRIBED");
  }
  const taxCountry = await initialTaxCountry(deps.billing, before);
  if (withdrawalOpenUntil({
    state: before, taxCountry, policy: deps.policy, now: withdrewAt, xmoneyEnvironment: deps.xmoneyEnvironment
  }) === null) {
    refuse(409, "WITHDRAWAL_WINDOW_CLOSED");
  }
  const spentMicros = await deps.ownerSpend.readOwnerSpentMicros(ownerRef, before.currentPeriodStart, withdrewAt);
  const entitlement = await deps.entitlements.current(ownerRef, withdrewAt);
  // The plan whose credit was in force when the person withdrew (an upgrade since then is not theirs to pay back).
  const creditPlanId = entitlement.planId === "FREE" ? before.planId : entitlement.planId;
  const periodStart = before.currentPeriodStart;
  const periodEnd = before.currentPeriodEnd;
  const activatedAt = before.activatedAt;
  const decided = await deps.billing.withTransaction(async (client) => {
    const locked = await lockedSubscription(deps, client, ownerRef);
    if (locked === null || locked.state.subscriptionId !== before.subscriptionId || locked.state.status !== "ACTIVE"
      // The spend and the credit above belong to this plan and period; an upgrade settled since changes both.
      || locked.state.planId !== before.planId || locked.state.currentPeriodStart?.getTime() !== periodStart.getTime()) {
      refuse(409, "NOT_SUBSCRIBED");
    }
    await request.authorize(client);
    const { state } = locked;
    const charges: Array<ChargeRow & { events: ChargeEventRow[] }> = [];
    for (const row of await deps.billing.chargesForSubscription(state.subscriptionId, client)) {
      const read = await deps.billing.charge(row.chargeId, client);
      if (read !== null) charges.push(read);
    }
    const paid = paidTransactions(charges, activatedAt);
    const refundMicros = withdrawalRefundMicros({
      paidTotalMicros: paid.reduce((total, row) => total + row.paidMicros - row.refundedMicros, 0),
      periodStart, periodEnd, now: withdrewAt, creditSpentMicros: spentMicros,
      monthlyCreditMicros: entitlement.monthCreditOverrideMicros ?? planById(deps.plans, creditPlanId).monthlyCreditMicros
    });
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
    // Nothing to refund: nothing will move, so M8 goes now. Otherwise RefundDesk queues it after the last refund; a
    // withdrawal handed to the owner gets its M8 when the owner settles it (P14c).
    const customer = byOwner || allocations.length > 0
      ? null : await deps.billing.customerByOwner(ownerRef, undefined, client);
    if (customer !== null) {
      await enqueueEmail(deps.billing, client, {
        template: "M8", recipient: { kind: "CUSTOMER", customerId: customer.customerId },
        dedupeRef: state.subscriptionId,
        params: { plan: state.planId, refundAmount: microsToDecimal(refundMicros) }, notBefore: now
      });
    }
    return Object.freeze({ refundMicros: byOwner ? null : refundMicros, refunds: allocations.length, byOwner });
  });
  deps.audit("billing.withdrawal", { refunds: decided.refunds, source: request.source });
  if (decided.byOwner) deps.audit("billing.withdrawal.owner_review", { source: request.source });
  if (decided.refunds > 0) deps.kick();
  return Object.freeze({ refundMicros: decided.refundMicros });
}

/** The Settings route: now, with the step-up grant (P12a) spent under the owner lock. */
export async function withdraw(deps: WithdrawalDeps, input: Readonly<{
  authenticated: AuthenticatedSession; grantToken: string;
}>): Promise<WithdrawalOutcome> {
  return recordWithdrawal(deps, {
    ownerRef: input.authenticated.ownerRef, withdrewAt: deps.clock(), source: "SETTINGS",
    authorize: async (client) => {
      const consumed = await deps.billing.consumeWithdrawalGrant(client, {
        userId: input.authenticated.userId, ownerRef: input.authenticated.ownerRef,
        sessionId: input.authenticated.session.session_id,
        grantTokenHash: hashToken("step-up-grant", input.grantToken)
      });
      if (!consumed) refuse(403, "STEP_UP_REQUIRED");
    }
  });
}
