import { addBusinessDays, foldSubscription, microsToDecimal, type SubscriptionState } from "@debateai/billing-core";
import type { BillingJobQueries, BillingRepository, CustomerXMoneyEnvironment, EntitlementRepository } from "@debateai/db";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import type { BillingPolicy } from "@debateai/register";
import type { BillingAudit } from "./audit.js";
import { emailJob } from "./email-job.js";
import { enqueueOnce } from "./outbox.js";
import { codeOf, failureCode, type RenewalService, type RetryPrice } from "./renewal.js";
import { addDays, anniversaryDue, dunningProgress } from "./renewal-rules.js";
import { subscriptionEvent } from "./rows.js";
import { endDunning } from "./settlement-renewal.js";

export type MaintenanceDeps = Readonly<{
  repository: BillingRepository;
  jobs: Pick<BillingJobQueries, "lockOwner" | "withSubscriptionLease" | "liveSubscriptionIds" | "outboxJobExists">;
  entitlements: Pick<EntitlementRepository, "append">;
  renewal: Pick<RenewalService, "submit" | "createRetryCharge" | "retryPrice" | "failUnpricedAttempt" | "taxRefused" | "erasureBlocks">;
  policy: BillingPolicy;
  /** R-7: PUBLIC_APP_URL. */
  publicAppUrl: string;
  /**
   * D5 5h: P6a's connectors.xmoneyEnvironment; a subscription created in the other xMoney system is never retried here,
   * nor its renewal announced, nor its yearly reminder (M4) sent.
   */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
  audit: BillingAudit;
  clock: () => Date;
}>;

export type MaintenanceReport = { visited: number; ended: number; retried: number; reminded: number; announced: number; failed: number };

/** A8(b) and spec §2.5.5: the time-driven transitions no event triggers by itself. */
export class BillingMaintenance {
  private lastLookAheadDay: string | null = null;

  constructor(private readonly deps: MaintenanceDeps) {}

  async runOnce(): Promise<MaintenanceReport> {
    const report: MaintenanceReport = { visited: 0, ended: 0, retried: 0, reminded: 0, announced: 0, failed: 0 };
    const now = this.deps.clock();
    const today = now.toISOString().slice(0, 10);
    const lookAhead = this.lastLookAheadDay !== today;
    this.lastLookAheadDay = today;
    const pageSize = 200;
    // The distinct codes of this pass's failed visits (`failureCode`), for its one report line.
    const codes = new Set<string>();
    let after: string | null = null;
    for (;;) {
      const ids = await this.deps.jobs.liveSubscriptionIds(after, pageSize);
      for (const subscriptionId of ids) {
        report.visited += 1;
        try {
          await this.visit(subscriptionId, now, lookAhead, report);
        } catch (error) {
          report.failed += 1;
          codes.add(failureCode(error));
        }
      }
      if (ids.length < pageSize) break;
      after = ids[ids.length - 1]!;
    }
    // The count and the codes only, never an id: a failed visit leaves this trace for the owner.
    if (report.failed > 0) {
      this.deps.audit("billing.maintenance.report", { failed: report.failed, codes: [...codes].sort().join(",") });
    }
    return report;
  }

  private async visit(subscriptionId: string, now: Date, lookAhead: boolean, report: MaintenanceReport): Promise<void> {
    const events = await this.deps.repository.subscriptionEvents(subscriptionId);
    const state = foldSubscription(events);
    const created = events.find((event) => event.kind === "CREATED");
    const periodOver = state.currentPeriodEnd !== null && state.currentPeriodEnd.getTime() <= now.getTime();
    switch (state.status) {
      case "CREATED":
        if (created !== undefined && now.getTime() - created.at.getTime() >= 24 * 3_600_000) {
          await this.end(state, now, "ABANDONED", report);
        }
        return;
      case "ACTIVE":
        if (state.cancelRequested && periodOver) {
          await this.end(state, now, "CANCEL", report);
          return;
        }
        await this.remind(state, now, report);
        if (lookAhead) await this.announce(state, now, report);
        return;
      case "PAST_DUE":
        // Spec §1.3 / §2.5.6: a cancel while past due ends the plan now; it is never retried or dunned again.
        if (state.cancelRequested) {
          await this.end(state, now, "CANCEL", report);
          return;
        }
        await this.retry(subscriptionId, report);
        return;
      case "SUSPENDED":
        if (periodOver) await this.end(state, now, "DISPUTE", report);
        return;
      case "ENDED":
      case "WITHDRAWN":
        return;
      default:
        exhaustive(state.status);
    }
  }

  /**
   * Under the lease, and folded again under the owner lock right before the write, in the same transaction (D5 5d):
   * only a subscription still in the status the visit saw, on the same period, is ended ("skipped" otherwise), and a
   * CANCEL only while the cancel is still pending (a revoked cancel is left alone; an ENDED(CANCEL) with no cancel
   * pending is an event P1b's fold check refuses, which would roll the transaction back).
   */
  private async end(seen: SubscriptionState, now: Date, cause: "ABANDONED" | "CANCEL" | "DISPUTE", report: MaintenanceReport): Promise<void> {
    const { subscriptionId, status: from } = seen;
    const leased = await this.deps.jobs.withSubscriptionLease(subscriptionId, async () => {
      const ownerRef = seen.ownerRef;
      return this.deps.repository.withTransaction(async (client): Promise<boolean> => {
        await this.deps.jobs.lockOwner(client, ownerRef);
        const state = foldSubscription(await this.deps.repository.subscriptionEvents(subscriptionId, client));
        if (state.status !== from || (cause === "CANCEL" && !state.cancelRequested)) return false;
        if ((state.currentPeriodEnd?.getTime() ?? null) !== (seen.currentPeriodEnd?.getTime() ?? null)) return false;
        await this.deps.repository.appendSubscriptionEvent(client, subscriptionEvent(state, "ENDED", now, { cause }));
        // From ACTIVE the Free month is anchored where the paid one ended; from PAST_DUE at the cancel's sweep. The row
        // is effective NOW either way: a grace row (PAST_DUE), a notice postponement or Q-1's RENEWAL_PENDING (both
        // written after the period end) is the plan in force until a row dated after it.
        const anchorAt = from === "PAST_DUE" ? now : state.currentPeriodEnd;
        if (cause === "CANCEL" && anchorAt !== null) {
          await this.deps.entitlements.append(client, {
            ownerRef: state.ownerRef, planId: "FREE", periodAnchorAt: anchorAt, cause: "ENDED_CANCEL",
            effectiveAt: now, subscriptionId, paidThrough: null, monthCreditOverrideMicros: null
          });
        }
        return true;
      });
    });
    if (leased.kind === "RAN" && leased.value) report.ended += 1;
  }

  /**
   * A2: the next dunning attempt, started once `dunning_retry_days[n-1]` has passed since the first failure, or at
   * once after a card change that asked for it (R-34). Where the dunning stands is read from the history
   * (`dunningProgress`), never from FAILED charge rows: an attempt the tax service could not price has none (Q-1).
   * The attempt charges the failed attempt's own total (P2-M10, `retryPrice`: never re-priced) and is written as a new
   * charge row with its own quote; while that attempt's charge is still open, its own outcome decides and nothing more
   * is made. A retry with no priced attempt to reuse that the tax service cannot price, or whose fresh total is one
   * the person was never told about (A7), is itself a failed attempt with no charge (`failUnpricedAttempt`). An owner
   * the stop port names (a pending or finished erasure, or an account the age gate froze) is never retried (R-34,
   * R3-2). P2-I7: the clock is read inside the lease, never taken from the pass, so the retry's charge and its
   * REQUESTED are dated when it really runs (`submit` dates the call's outcome when the call returns).
   */
  private async retry(subscriptionId: string, report: MaintenanceReport): Promise<void> {
    const leased = await this.deps.jobs.withSubscriptionLease(subscriptionId, async (): Promise<"RETRIED" | "ENDED" | false> => {
      const now = this.deps.clock();
      const events = await this.deps.repository.subscriptionEvents(subscriptionId);
      const state = foldSubscription(events);
      if (state.status !== "PAST_DUE" || state.cancelRequested || state.currentPeriodEnd === null) return false;
      // D5 5h: the other xMoney system's plan is never charged from here, nor dunned without a charge.
      if (state.paymentProvider !== "xmoney" || state.paymentEnvironment !== this.deps.xmoneyEnvironment) return false;
      const progress = dunningProgress(events, state);
      if (progress === null) return false;
      const periodStart = state.currentPeriodEnd;
      const next = progress.failedAttempts + 1;
      const made = (await this.deps.repository.chargesForSubscription(subscriptionId)).some((charge) =>
        charge.kind === "RENEWAL" && charge.periodStart.getTime() === periodStart.getTime() && charge.attempt >= next);
      if (made) return false;
      const retryDay = this.deps.policy.dunningRetryDays[progress.failedAttempts - 1];
      // P2-M13: the policy in force has no retry day left for this many failed attempts (the owner published shorter
      // `dunning_retry_days` during this dunning). No attempt is open, so nothing else would ever end it: it ends here.
      if (retryDay === undefined) return await this.endSpentDunning(state, progress.failedAttempts, now) ? "ENDED" : false;
      const cardChangedSince = events.some((event) => event.kind === "CARD_CHANGED" && event.data.retry_now === true
        && event.at.getTime() > progress.lastFailedAt.getTime());
      if (!cardChangedSince && now.getTime() < addDays(progress.firstFailedAt, retryDay).getTime()) return false;
      if (await this.deps.renewal.erasureBlocks(state.ownerRef)) return false;
      let price: RetryPrice;
      try {
        price = await this.deps.renewal.retryPrice(state, periodStart, next, now);
      } catch (error) {
        // Q-1: no charge without a quote. An outage still going is this attempt failing (M5B, M5C, or the end);
        // a refusal is P11a's operator alarm (once per period) and writes nothing else: the retry is tried again on the
        // next pass, and the grace ends access on time.
        const code = codeOf(error);
        if (code === "TAX_SERVICE_REFUSED") {
          await this.deps.renewal.taxRefused(state, periodStart, now, error);
          return false;
        }
        if (code !== "TAX_SERVICE_UNAVAILABLE") throw error;
        return await this.deps.renewal.failUnpricedAttempt(state, periodStart, next, progress.firstFailedAt, now, code)
          ? "RETRIED" : false;
      }
      // P2-M10: a total the person was never told about is never charged; the attempt fails with no charge.
      if (price.kind === "CHANGED") {
        return await this.deps.renewal.failUnpricedAttempt(state, periodStart, next, progress.firstFailedAt, now, "RETRY_TOTAL_CHANGED")
          ? "RETRIED" : false;
      }
      // Written only if the owner lock's fresh fold still allows it (still PAST_DUE here, no cancel, no erasure).
      const created = await this.deps.renewal.createRetryCharge(state, periodStart, next, price.priced, now);
      if (created === null) return false;
      await this.deps.renewal.submit(created.charge, created.state);
      return "RETRIED";
    });
    if (leased.kind === "RAN" && leased.value === "RETRIED") report.retried += 1;
    if (leased.kind === "RAN" && leased.value === "ENDED") report.ended += 1;
  }

  /**
   * P2-M13 (LC-7): a PAST_DUE plan whose `failedAttempts` the policy in force gives no retry day (a shorter
   * `dunning_retry_days` published during its dunning) would otherwise stay PAST_DUE for ever, and its owner could not
   * check out again. Under the lease (`retry`'s) and the owner lock, on the history folded again inside it, the dunning
   * ends as a failed last attempt ends it (`endDunning`): ENDED(DUNNING), Free from now and M6. Only while nothing
   * changed since the visit read it: still PAST_DUE on the same period, no cancel pending (P11b's sweep ends that one),
   * the same number of failed attempts, still no retry day for it, and no RENEWAL charge of a later attempt for the
   * period (that attempt's own outcome decides). An owner the stop port names (a pending or finished erasure, an
   * age-frozen account) is left to P15's sweep, as it is never retried. Nothing is charged; the ENDED row names neither
   * a charge nor a `reason`, so P16b's charge-less dunning list does not read it as an unpriced attempt.
   */
  private async endSpentDunning(seen: SubscriptionState, failedAttempts: number, now: Date): Promise<boolean> {
    if (await this.deps.renewal.erasureBlocks(seen.ownerRef)) return false;
    return this.deps.repository.withTransaction(async (client): Promise<boolean> => {
      await this.deps.jobs.lockOwner(client, seen.ownerRef);
      const events = await this.deps.repository.subscriptionEvents(seen.subscriptionId, client);
      const state = foldSubscription(events);
      if (state.status !== "PAST_DUE" || state.cancelRequested || state.currentPeriodEnd === null) return false;
      if (state.currentPeriodEnd.getTime() !== seen.currentPeriodEnd?.getTime()) return false;
      if (dunningProgress(events, state)?.failedAttempts !== failedAttempts) return false;
      if (this.deps.policy.dunningRetryDays[failedAttempts - 1] !== undefined) return false;
      const periodStart = state.currentPeriodEnd;
      const later = (await this.deps.repository.chargesForSubscription(seen.subscriptionId, client)).some((charge) =>
        charge.kind === "RENEWAL" && charge.periodStart.getTime() === periodStart.getTime() && charge.attempt > failedAttempts);
      if (later) return false;
      const customer = await this.deps.repository.customerByOwner(state.ownerRef, undefined, client);
      if (customer === null) throw new TypedDomainError("BILLING_CUSTOMER_MISSING", "a subscription without its customer");
      await endDunning(this.deps, client, {
        subscription: state, customerId: customer.customerId, data: { retry_days_spent: true }, now
      });
      return true;
    });
  }

  private async remind(state: SubscriptionState, now: Date, report: MaintenanceReport): Promise<void> {
    if (state.activatedAt === null || state.cancelRequested || state.currentPeriodEnd === null) return;
    // D5 5h (P2-W3 (b)'s sibling): the other xMoney system's plan is never renewed here, so it is never reminded either.
    if (state.paymentProvider !== "xmoney" || state.paymentEnvironment !== this.deps.xmoneyEnvironment) return;
    const years = anniversaryDue(state.activatedAt, now, 7);
    if (years === null) return;
    const customer = await this.deps.repository.customerByOwner(state.ownerRef);
    if (customer === null) return;
    const job = emailJob({
      template: "M4", recipient: { kind: "CUSTOMER", customerId: customer.customerId }, dedupeRef: `${state.subscriptionId}:${years}`,
      params: {
        // P2-M14: the price is the next renewal's (a scheduled downgrade announces the lower plan's), so is the plan.
        plan: state.scheduledDowngradePlanId ?? state.planId, totalAmount: microsToDecimal(state.announcedTotalMicros ?? 0),
        renewDate: state.currentPeriodEnd.toISOString(), cancelPageUrl: new URL("/cancel", this.deps.publicAppUrl).toString()
      },
      notBefore: now
    });
    const sent = await this.deps.repository.withTransaction((client) => enqueueOnce(this.deps, client, job));
    if (sent) report.reminded += 1;
  }

  private async announce(state: SubscriptionState, now: Date, report: MaintenanceReport): Promise<void> {
    const end = state.currentPeriodEnd;
    if (state.cancelRequested || end === null || end.getTime() <= now.getTime()) return;
    // D5 5h: P11a's renewal never renews the other xMoney system's plan (`dueRenewals`), so nothing is announced for it.
    if (state.paymentProvider !== "xmoney" || state.paymentEnvironment !== this.deps.xmoneyEnvironment) return;
    if (addBusinessDays(now, this.deps.policy.lookAheadBusinessDays).getTime() < end.getTime()) return;
    const queued = await this.deps.repository.withTransaction((client) => enqueueOnce(this.deps, client, {
      kind: "RENEWAL_NOTICE", ref: `${state.subscriptionId}:${end.toISOString()}`, notBefore: now, payload: {}
    }));
    if (queued) report.announced += 1;
  }
}
