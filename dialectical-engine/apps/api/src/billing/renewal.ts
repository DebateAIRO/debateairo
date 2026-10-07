import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  computeWindows, decimalToMicros, foldSubscription, microsToDecimal, type SubscriptionState, type TaxEngine, type TaxQuote
} from "@debateai/billing-core";
import type {
  BillingJobQueries, BillingRepository, ChargeEventRow, ChargeRow, CustomerXMoneyEnvironment, DueRenewalCursor,
  EntitlementRepository, OutboxJob, QuoteRow
} from "@debateai/db";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import { XMoneyPaymentFailedError, type XMoneyClient } from "@debateai/payments-xmoney";
import type { BillingPlans, BillingPolicy, PlanId } from "@debateai/register";
import { credentialsRefused, rejectedRows, type BillingAudit } from "./audit.js";
import { enqueueEmail } from "./email-job.js";
import { taxRefusalDetail } from "./quote.js";
import { openQuoteLocation, sealQuoteLocation, type QuoteLocation } from "./records.js";
import {
  dunningProgress, ordersHoldingCharge, recurringNetOf, renewalLeadMs, renewalNoticeDecision, renewalPendingMs,
  renewalPendingUntil, unverifiedLookBackMs
} from "./renewal-rules.js";
import { chargeEvent, newChargeId, subscriptionEvent } from "./rows.js";
import type { ChargeSettlement } from "./settlement.js";
import { writeDunningAttempt } from "./settlement-renewal.js";
import { quoteTaxAt, storedTaxContext } from "./stored-tax-context.js";

export type RenewalDeps = Readonly<{
  repository: BillingRepository;
  jobs: Pick<BillingJobQueries, "lockOwner" | "withSubscriptionLease" | "openCharges" | "unverifiedRenewals" | "chargeIdForTransaction">;
  /** `current`: whether this period's RENEWAL_PENDING is already in force (Q-1, `holdPending`). */
  entitlements: Pick<EntitlementRepository, "append" | "current">;
  xmoney: Pick<XMoneyClient, "rebill" | "listTransactions">;
  tax: Pick<TaxEngine, "quote">;
  /** The RENEWAL settlement VERIFY_PAYMENT uses; a synchronous refusal goes through the same `failed`. */
  settlement: ChargeSettlement;
  policy: BillingPolicy;
  /**
   * The register's plans. A renewal never takes its price from here (Terms §12: `recurringNetOf`); they are kept for
   * the task that builds the owner's price-change command.
   */
  plans: BillingPlans;
  recordsKey: Buffer;
  /** R-7: PUBLIC_APP_URL. */
  publicAppUrl: string;
  audit: BillingAudit;
  clock: () => Date;
  kick: () => void;
  /** D5 5h: the xMoney system (connectors.xmoneyEnvironment) whose subscriptions and charges this pass renews. */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
  /**
   * R-34, R3-2: whether this owner must never be charged again: an account erasure pending or finished, or an
   * account the age gate froze (0077's `age_frozen`). P15 supplies it (`billing.owner_erasure_pending`, which P15
   * widens to `age_frozen`); absent = no such lookup yet. The name stays P15's; the answer is only yes or no.
   */
  erasurePending?: (ownerRef: string) => Promise<boolean>;
}>;

export type PricedRenewal = Readonly<{ planId: PlanId; location: QuoteLocation; tax: TaxQuote }>;
/**
 * P2-M10: what a dunning retry may charge. `PRICED`: the failed attempt's own priced total (or, with no priced attempt,
 * a fresh total A7 needs no notice for). `CHANGED`: only a total the person was never told about is left, so nothing
 * is charged.
 */
export type RetryPrice = Readonly<{ kind: "PRICED"; priced: PricedRenewal }> | Readonly<{ kind: "CHANGED" }>;
/**
 * `invalid`: subscriptions whose history does not fold, left out by P1b's due list this tick (D5 5d). `dunning`:
 * renewals whose tax service stayed down past Q-1's window, dunned with no charge. `held`: sent renewals kept on
 * RENEWAL_PENDING while their check waits. `taxRefused`: renewals the tax service refused (never counted `failed`).
 */
export type RenewalReport = {
  charged: number; postponed: number; skipped: number; dunning: number; busy: number; recovered: number; held: number;
  failed: number; taxRefused: number; invalid: number;
};
/** A charge row written under the owner lock, with the subscription as that lock saw it. */
export type LockedCharge = Readonly<{ charge: ChargeRow; state: SubscriptionState }>;

/** One page of the due list and of the open charges; a tick pages until a short page, at most `MAX_PAGES` each. */
const PAGE = 50;
const MAX_PAGES = 20;
const DAY_MS = 86_400_000;

/**
 * Spec 2026-10-05 §2.5.5: an xMoney plan renews only on its order and customer (the rebill needs both); a NETOPIA plan
 * needs no payment handle — with no usable card it renews into a CARD_NOT_SAVED attempt (§2.9.2), never into silence.
 */
function renewable(state: SubscriptionState, now: Date): boolean {
  return state.status === "ACTIVE" && !state.cancelRequested && state.currentPeriodEnd !== null
    && state.periodAnchorAt !== null
    && (state.paymentProvider !== "xmoney" || (state.xmoneyOrderId !== null && state.xmoneyCustomerId !== null))
    && (state.renewalPostponedUntil === null || state.renewalPostponedUntil.getTime() <= now.getTime());
}

function amountMatches(decimal: string, micros: number): boolean {
  try {
    return decimalToMicros(decimal) === micros;
  } catch {
    return false;
  }
}

/**
 * A2's call markers and outcomes. Every call is preceded by a committed REQUESTED: the charge's first one (code
 * null) for the first call, `RESUBMIT_STARTED` for each later one. A call that proves xMoney processed nothing appends
 * a REQUESTED carrying why (`REBILL_NOT_SENT`, `REBILL_CREDENTIALS_REFUSED`; D5 5i: the request still stands). Only an
 * outcome that may have reached xMoney is a SUBMIT_UNKNOWN (`REBILL_OUTCOME_UNKNOWN`, `SUBMIT_INTERRUPTED`), so their
 * count is the count of blind unknowns.
 */
const RESUBMIT_STARTED = "RESUBMIT_STARTED";
const NOT_SENT_CODES: ReadonlySet<string> = new Set(["REBILL_NOT_SENT", "REBILL_CREDENTIALS_REFUSED"]);

/**
 * Whether a RENEWAL charge's rebill may have reached xMoney with no outcome recorded yet: what `recoverOpenCharge`
 * adopts, looking on every order that could hold the payment (`ordersHoldingCharge`), and after 30 quiet minutes
 * resubmits on the subscription's current order (A2). A charge settled (SUCCEEDED, FAILED) or linked to its
 * transaction (SUBMITTED) is not open, nor one whose last call was proven never sent; a SUBMIT_UNKNOWN, or a call
 * marker with no outcome (a call in flight, or a process that died during it), is. P12e keeps a card change from
 * moving the order while this holds (defense in depth).
 */
export function rebillOutcomeOpen(events: ReadonlyArray<Pick<ChargeEventRow, "kind" | "errorCode">>): boolean {
  if (events.some((event) => event.kind === "SUCCEEDED" || event.kind === "FAILED" || event.kind === "SUBMITTED")) return false;
  const trail = events.filter((event) => event.kind === "REQUESTED" || event.kind === "SUBMIT_UNKNOWN");
  if (trail.some((event) => event.kind === "SUBMIT_UNKNOWN")) return true;
  const last = trail.at(-1);
  return last !== undefined && (last.errorCode === null || !NOT_SENT_CODES.has(last.errorCode));
}
/** Only payments are adopted, never a refund, credit or chargeback row of the order. */
const ADOPTABLE_TYPES: ReadonlySet<string | null> = new Set([null, "deposit"]);

/** Review Focus 5: a rebill that never reached xMoney is tried again after 1 min, 5 min, 15 min, then hourly. */
function notSentBackoffMs(notSentSoFar: number): number {
  const steps = [60_000, 300_000, 900_000, 3_600_000];
  return steps[Math.min(Math.max(notSentSoFar, 1), steps.length) - 1]!;
}

/** A refusal's code, whatever raised it: P8b's `BillingRefusal` and a `TypedDomainError` (P4's tax errors) both carry one. */
export function codeOf(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null;
}

/**
 * The content-free code a failure the tick counts carries on its report line: a declared code, a Node errno name or a
 * SQLSTATE passes; anything else (no code, or free text in `code`) becomes UNKNOWN, so no text reaches the line.
 */
export function failureCode(error: unknown): string {
  const code = codeOf(error);
  return code !== null && /^[A-Z0-9][A-Z0-9_]{2,63}$/.test(code) ? code : "UNKNOWN";
}

/** Spec §2.5.5 and A2: our own scheduler charges the saved card of the managed order, once per period. */
export class RenewalService {
  /** Subscription periods whose tax refusal this process has already alarmed on (at most one line per period). */
  private readonly taxRefusalsSeen = new Set<string>();

  constructor(private readonly deps: RenewalDeps) {}

  async runOnce(): Promise<RenewalReport> {
    const report: RenewalReport = {
      charged: 0, postponed: 0, skipped: 0, dunning: 0, busy: 0, recovered: 0, held: 0, failed: 0, taxRefused: 0, invalid: 0
    };
    const now = this.deps.clock();
    // The distinct codes of this tick's failures (`failureCode`), for its one report line.
    const codes = new Set<string>();
    // D5 5d: each pass has its own try, so a failure in one never stops the next.
    try {
      await this.renewDue(now, report, codes);
    } catch (error) {
      report.failed += 1;
      codes.add(failureCode(error));
    }
    try {
      await this.recoverOpen(now, report, codes);
    } catch (error) {
      report.failed += 1;
      codes.add(failureCode(error));
    }
    try {
      await this.holdUnverified(now, report, codes);
    } catch (error) {
      report.failed += 1;
      codes.add(failureCode(error));
    }
    // One content-free line per tick with trouble: the counts and the failures' distinct codes, never an id. A failure
    // the tick counts here may name no charge or hold (a renewal that fails before either), so this line is its record.
    if (report.failed > 0 || report.taxRefused > 0) {
      this.deps.audit("billing.renewal.report", {
        failed: report.failed, taxRefused: report.taxRefused, codes: report.failed > 0 ? [...codes].sort().join(",") : ""
      });
    }
    return report;
  }

  /** Every due subscription of this xMoney system, page by page (P1b's cursor), until a page is short. */
  private async renewDue(now: Date, report: RenewalReport, codes: Set<string>): Promise<void> {
    const invalid = new Set<string>();
    let after: DueRenewalCursor | null = null;
    try {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const due = await this.deps.repository.dueRenewals(now, renewalLeadMs(), PAGE, {
          provider: "xmoney", environment: this.deps.xmoneyEnvironment, after,
          onInvalid: (subscriptionId) => { invalid.add(subscriptionId); }
        });
        for (const state of due) {
          if (!renewable(state, now)) {
            report.skipped += 1;
            continue;
          }
          try {
            const leased = await this.deps.jobs.withSubscriptionLease(state.subscriptionId, () => this.renew(state.subscriptionId));
            if (leased.kind === "BUSY") report.busy += 1;
            else report[leased.value] += 1;
          } catch (error) {
            // A tax refusal is its own alarm (`taxRefused`), never a failure of the tick.
            if (codeOf(error) === "TAX_SERVICE_REFUSED") report.taxRefused += 1;
            else {
              report.failed += 1;
              codes.add(failureCode(error));
            }
          }
        }
        const last = due.at(-1);
        if (due.length < PAGE || last === undefined || last.currentPeriodEnd === null) break;
        after = Object.freeze({ periodEnd: last.currentPeriodEnd, subscriptionId: last.subscriptionId });
      }
    } finally {
      // One content-free line per tick: the count and the code, never an id (P16's owner summary lists them).
      report.invalid = invalid.size;
      if (invalid.size > 0) {
        this.deps.audit("billing.renewal.history_invalid", { count: invalid.size, code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" });
      }
    }
  }

  /** A2's recovery of open RENEWAL charges, paged on (created_at, charge_id) so none starves another (D6b). */
  private async recoverOpen(now: Date, report: RenewalReport, codes: Set<string>): Promise<void> {
    let after: Readonly<{ createdAt: Date; chargeId: string }> | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const open = await this.deps.jobs.openCharges({
        environment: this.deps.xmoneyEnvironment, kinds: ["RENEWAL"], after,
        closeBefore: new Date(now.getTime() - DAY_MS), renewalCloseBefore: new Date(now.getTime() - renewalPendingMs()),
        limit: PAGE
      });
      for (const charge of open) {
        try {
          const leased = await this.deps.jobs.withSubscriptionLease(charge.subscriptionId, () => this.recoverOpenCharge(charge.chargeId));
          if (leased.kind === "RAN" && leased.value) report.recovered += 1;
        } catch (error) {
          report.failed += 1;
          codes.add(failureCode(error));
        }
      }
      const last = open.at(-1);
      if (open.length < PAGE || last === undefined) break;
      after = Object.freeze({ createdAt: last.createdAt, chargeId: last.chargeId });
    }
  }

  /**
   * Q-1 ("a rebill outcome still unknown"): a renewal whose rebill answered (SUBMITTED) but whose VERIFY_PAYMENT has
   * not settled it (the transaction still in 3-D Secure or in progress, or xMoney unreadable) keeps the plan past the
   * period end through the same RENEWAL_PENDING hold, so a person already charged never drops to Free while the
   * check waits. Only a charge SUBMITTED a minute ago or more: the tick that sent it kicked its check. `holdPending`
   * writes at most one row per period and nothing once the window is over; the charge is never closed here (a real
   * transaction exists and may have moved money: VERIFY_PAYMENT and P14a own its outcome).
   */
  private async holdUnverified(now: Date, report: RenewalReport, codes: Set<string>): Promise<void> {
    let after: Readonly<{ createdAt: Date; chargeId: string }> | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const waiting = await this.deps.jobs.unverifiedRenewals({
        environment: this.deps.xmoneyEnvironment,
        periodStartFrom: new Date(now.getTime() - unverifiedLookBackMs(this.deps.policy.renewalNoticeBusinessDays)),
        periodStartTo: now, submittedBefore: new Date(now.getTime() - 60_000), after, limit: PAGE
      });
      for (const charge of waiting) {
        try {
          const leased = await this.deps.jobs.withSubscriptionLease(charge.subscriptionId, async () => {
            const state = foldSubscription(await this.deps.repository.subscriptionEvents(charge.subscriptionId));
            return this.holdPending(state, charge.periodStart, now, "PAYMENT_NOT_VERIFIED");
          });
          if (leased.kind === "RAN" && leased.value) report.held += 1;
        } catch (error) {
          report.failed += 1;
          codes.add(failureCode(error));
        }
      }
      const last = waiting.at(-1);
      if (waiting.length < PAGE || last === undefined) break;
      after = Object.freeze({ createdAt: last.createdAt, chargeId: last.chargeId });
    }
  }

  /**
   * R-34, R3-2: an owner the stop port names (a pending or finished erasure, or an account the age gate froze) is
   * never charged: no rebill, retry charge, dunning retry or resubmission. One content-free line says so, named for
   * the stop, never its cause (the port answers only yes or no, and a frozen account is no erasure).
   */
  async erasureBlocks(ownerRef: string): Promise<boolean> {
    if (this.deps.erasurePending === undefined || !(await this.deps.erasurePending(ownerRef))) return false;
    this.deps.audit("billing.renewal.owner_stopped", {});
    return true;
  }

  /**
   * Runs under the subscription lease: the state is folded again here, never trusted from the due list. "dunning":
   * the tax service stayed down past Q-1's window, and the normal dunning started with no charge.
   */
  async renew(subscriptionId: string): Promise<"charged" | "postponed" | "skipped" | "dunning"> {
    const now = this.deps.clock();
    const state = foldSubscription(await this.deps.repository.subscriptionEvents(subscriptionId));
    if (!renewable(state, now) || await this.erasureBlocks(state.ownerRef)) return "skipped";
    const periodStart = state.currentPeriodEnd!;
    const charges = await this.deps.repository.chargesForSubscription(subscriptionId);
    if (charges.some((charge) => charge.kind === "RENEWAL" && charge.periodStart.getTime() === periodStart.getTime())) return "skipped";
    // P12c: an upgrade of this period still waiting for its payment settles first, so the renewal is priced at the
    // plan it settles to; the next 60-second pass tries again. The wait can outlast the period end (an unknown
    // upgrade settles after P14a's 30-minute adoption wait), so it is R2 Q-1's pending renewal: the plan is kept by
    // one RENEWAL_PENDING row, written now — inside the lead, before the period end — so paid access never lapses
    // between two passes. The next period still starts at `periodStart`. A day-old unsettled upgrade no longer holds
    // the renewal: if it is paid once this renewal's charge exists, or after RENEWED moved the period, the UPGRADE
    // settlement refunds it in full and writes nothing.
    if (await this.upgradeUnsettled(state, charges, now)) {
      await this.holdPending(state, periodStart, now, "UPGRADE_UNSETTLED");
      return "skipped";
    }
    const priced = await this.pricedOrPending(state, periodStart, now);
    if (priced === null) return "dunning";
    const decision = renewalNoticeDecision({
      freshTotalMicros: priced.tax.totalMicros, announcedTotalMicros: state.announcedTotalMicros,
      lastNoticeAt: state.lastNoticeAt, now, noticeBusinessDays: this.deps.policy.renewalNoticeBusinessDays
    });
    switch (decision.kind) {
      case "NOTICE":
        return (await this.postpone(state, decision.until, now, priced)) ? "postponed" : "skipped";
      case "WAIT":
        return (await this.postpone(state, decision.until, now, null)) ? "postponed" : "skipped";
      case "CHARGE":
        break;
      default:
        return exhaustive(decision);
    }
    const created = await this.createCharge(state, priced, periodStart, now);
    if (created === null) return "skipped";
    await this.submit(created.charge, created.state);
    return "charged";
  }

  /** An UPGRADE charge of the current period (P12c's key: it ends with the period) with no outcome yet. */
  private async upgradeUnsettled(state: SubscriptionState, charges: ReadonlyArray<ChargeRow>, now: Date): Promise<boolean> {
    for (const charge of charges) {
      if (charge.kind !== "UPGRADE" || charge.periodEnd.getTime() !== state.currentPeriodEnd?.getTime()) continue;
      if (now.getTime() - charge.createdAt.getTime() >= 86_400_000) continue;
      const read = await this.deps.repository.charge(charge.chargeId);
      if (read !== null && !read.events.some((event) => event.kind === "SUCCEEDED" || event.kind === "FAILED")) return true;
    }
    return false;
  }

  /**
   * The renewal's plan (a scheduled downgrade applies now) at the subscriber's OWN recurring net (Terms §12: never the
   * register's current price, `recurringNetOf`), with only the tax quoted afresh at the stored location (R-39). A
   * history with no recorded net is not charged at a guessed price: one audit line, and the error (retried next tick).
   */
  async freshQuote(state: SubscriptionState, now: Date): Promise<PricedRenewal> {
    const planId = state.scheduledDowngradePlanId ?? state.planId;
    const netMicros = recurringNetOf(await this.deps.repository.subscriptionEvents(state.subscriptionId)).nextRenewalMicros;
    if (netMicros === null) {
      this.deps.audit("billing.renewal.price_missing", {});
      throw new TypedDomainError("BILLING_RECURRING_PRICE_MISSING", "the subscription recorded no recurring net price");
    }
    const context = await storedTaxContext({ billing: this.deps.repository, recordsKey: this.deps.recordsKey }, state);
    // P4's error as it is: TAX_SERVICE_UNAVAILABLE (an outage) and TAX_SERVICE_REFUSED (permanent until fixed) differ.
    const tax = await quoteTaxAt(this.deps.tax, this.deps.policy, context, netMicros, now);
    return Object.freeze({ planId, location: context.quoteLocation, tax });
  }

  /**
   * P2-M10 (controller ruling, 2026-10-02): a dunning retry charges EXACTLY the priced total of the period's latest
   * failed attempt that had a charge, never a fresh quote: the retry's quote row is a copy of that attempt's (the same
   * plan, location, net, tax, rate and total), so a tax change during the dunning never changes what the card is
   * asked for, and the tax service is not called. That total cannot be reused when no attempt of the period was ever
   * priced (Q-1: the renewal and every retry so far found the tax service down) or when the plan to charge is no longer
   * the one that attempt priced. Then A7 decides on a fresh quote: one equal to the announced total is charged (the
   * person was told that amount), any other is `CHANGED` and is never charged; a changed amount waits for an A7 notice
   * (spec §2.5.5), which only a later period gives. A fresh quote's tax errors go back to the caller as they are (Q-1).
   */
  async retryPrice(state: SubscriptionState, periodStart: Date, attempt: number, now: Date): Promise<RetryPrice> {
    const planId = state.scheduledDowngradePlanId ?? state.planId;
    const failed = (await this.deps.repository.chargesForSubscription(state.subscriptionId))
      .filter((charge) => charge.kind === "RENEWAL" && charge.periodStart.getTime() === periodStart.getTime()
        && charge.attempt < attempt && charge.quoteId !== null)
      .sort((left, right) => right.attempt - left.attempt)[0];
    if (failed !== undefined) {
      const quote = await this.deps.repository.quote(failed.quoteId!, state.ownerRef);
      if (quote === null || quote.totalMicros !== failed.totalMicros) {
        throw new TypedDomainError("BILLING_RETRY_QUOTE_MISSING", "a failed renewal attempt without its own quote");
      }
      if (quote.planId === planId) {
        return Object.freeze({ kind: "PRICED", priced: Object.freeze({
          planId,
          location: openQuoteLocation(this.deps.recordsKey, quote.quoteId, quote.locationCiphertext),
          tax: Object.freeze({
            netMicros: quote.netMicros, taxMicros: quote.taxMicros, totalMicros: quote.totalMicros,
            taxRateBasisPoints: quote.taxRateBasisPoints, taxName: quote.taxName, taxCountry: quote.taxCountry,
            taxRegion: quote.taxRegion, status: quote.taxStatus, reference: quote.quadernoRef
          })
        }) });
      }
    }
    const fresh = await this.freshQuote(state, now);
    if (state.announcedTotalMicros !== null && fresh.tax.totalMicros === state.announcedTotalMicros) {
      return Object.freeze({ kind: "PRICED", priced: fresh });
    }
    return Object.freeze({ kind: "CHANGED" });
  }

  /**
   * The renewal's fresh quote; no charge is ever made without one. Q-1: a tax-service OUTAGE keeps the plan inside
   * the window (`holdPending`, no email) and goes back to the tick as the error, so the next tick quotes again; once
   * the window is over it starts the normal dunning with no charge (`failUnpricedAttempt`), and the answer is null.
   * A tax REFUSAL is an operator alarm (`taxRefused`), never dunning; the error goes back to the tick either way.
   */
  private async pricedOrPending(state: SubscriptionState, periodStart: Date, now: Date): Promise<PricedRenewal | null> {
    try {
      return await this.freshQuote(state, now);
    } catch (error) {
      const code = codeOf(error);
      if (code === "TAX_SERVICE_UNAVAILABLE") {
        if (now.getTime() < renewalPendingUntil(state, periodStart).getTime()) {
          await this.holdPending(state, periodStart, now, code);
        } else if (await this.failUnpricedAttempt(state, periodStart, 1, now, now, code)) {
          return null;
        }
      } else if (code === "TAX_SERVICE_REFUSED") {
        await this.taxRefused(state, periodStart, now, error);
      }
      throw error;
    }
  }

  /**
   * A tax refusal at renewal or at a dunning retry (P4: a revoked key, a refused request). One content-free operator
   * alarm per subscription period per process, with P4's detail; no charge, no dunning, no email. Paid access follows
   * the precedent of xMoney's refused key: an ACTIVE renewal gets the same RENEWAL_PENDING hold as an outage, labelled
   * with the real code (`holdPending` writes nothing for a PAST_DUE plan, whose grace already runs).
   */
  async taxRefused(state: SubscriptionState, periodStart: Date, now: Date, error: unknown): Promise<void> {
    const key = `${state.subscriptionId}:${periodStart.toISOString()}`;
    if (!this.taxRefusalsSeen.has(key)) {
      this.taxRefusalsSeen.add(key);
      this.deps.audit("billing.renewal.tax_refused", { code: "TAX_SERVICE_REFUSED", reason: taxRefusalDetail(error) });
    }
    await this.holdPending(state, periodStart, now, "TAX_SERVICE_REFUSED");
  }

  /**
   * Ruling Q-1: while an outage blocks the renewal of the period starting at `periodStart` (the tax service down,
   * xMoney unreachable or refusing our key, a rebill whose outcome is still unknown), the plan stays: ONE
   * `RENEWAL_PENDING` entitlement event per period moves `paid_through` to `renewalPendingUntil` (72 hours past the
   * due instant), with no email. Written under the owner lock, and only while the subscription, folded again inside
   * it, is still ACTIVE on that period with no cancel pending (a cancel, a withdrawal or an erasure in between is
   * never overridden). Nothing is written once the window is over: A8a then ends paid access at `paid_through`.
   * Returns whether it wrote.
   */
  async holdPending(state: SubscriptionState, periodStart: Date, now: Date, code: string): Promise<boolean> {
    const until = renewalPendingUntil(state, periodStart);
    if (now.getTime() >= until.getTime()) return false;
    const inForce = await this.deps.entitlements.current(state.ownerRef, now);
    if (inForce.cause === "RENEWAL_PENDING" && inForce.paidThrough?.getTime() === until.getTime()) return false;
    const written = await this.deps.repository.withTransaction(async (client): Promise<boolean> => {
      await this.deps.jobs.lockOwner(client, state.ownerRef);
      const fresh = foldSubscription(await this.deps.repository.subscriptionEvents(state.subscriptionId, client));
      if (fresh.status !== "ACTIVE" || fresh.cancelRequested || fresh.periodAnchorAt === null
        || fresh.currentPeriodEnd?.getTime() !== periodStart.getTime()) return false;
      await this.deps.entitlements.append(client, {
        ownerRef: fresh.ownerRef, planId: fresh.planId, periodAnchorAt: fresh.periodAnchorAt, cause: "RENEWAL_PENDING",
        effectiveAt: now, subscriptionId: fresh.subscriptionId, paidThrough: until, monthCreditOverrideMicros: null
      });
      return true;
    });
    if (written) this.deps.audit("billing.renewal.pending", { code });
    return written;
  }

  /**
   * One attempt's rows, priced by `priced`: its own RENEWAL quote row (the fresh quote, sealed at the stored location)
   * and the charge row for `periodStart` with this attempt number. Nothing is written here.
   */
  private attemptRows(
    state: SubscriptionState, priced: PricedRenewal, periodStart: Date, attempt: number, now: Date
  ): Readonly<{ quote: QuoteRow; charge: ChargeRow }> {
    const quoteId = randomUUID();
    const sealed = sealQuoteLocation(this.deps.recordsKey, quoteId, priced.location);
    const quote = Object.freeze({
      quoteId, ownerRef: state.ownerRef, planId: priced.planId, kind: "RENEWAL",
      netMicros: priced.tax.netMicros, taxMicros: priced.tax.taxMicros, totalMicros: priced.tax.totalMicros,
      taxCountry: priced.tax.taxCountry, taxRegion: priced.tax.taxRegion, taxRateBasisPoints: priced.tax.taxRateBasisPoints,
      taxStatus: priced.tax.status, taxName: priced.tax.taxName, quadernoRef: priced.tax.reference,
      expiresAt: new Date(now.getTime() + this.deps.policy.quoteTtlSeconds * 1_000), createdAt: now,
      locationCiphertext: sealed.ciphertext, keyId: sealed.keyId, recurringTotalMicros: null
    }) as QuoteRow;
    const charge = Object.freeze({
      chargeId: newChargeId(), ownerRef: state.ownerRef, subscriptionId: state.subscriptionId, kind: "RENEWAL", attempt, periodStart,
      periodEnd: computeWindows(state.periodAnchorAt!, periodStart).month.end, quoteId,
      netMicros: quote.netMicros, taxMicros: quote.taxMicros, totalMicros: quote.totalMicros, currency: "USD", createdAt: now,
      paymentProvider: "xmoney", paymentEnvironment: this.deps.xmoneyEnvironment
    }) as ChargeRow;
    return Object.freeze({ quote, charge });
  }

  /** Writes one attempt's quote, charge and first REQUESTED in the caller's transaction (A1: REQUESTED before any call). */
  private async writeAttempt(client: PoolClient, rows: Readonly<{ quote: QuoteRow; charge: ChargeRow }>, now: Date): Promise<void> {
    await this.deps.repository.insertQuote(client, rows.quote);
    await this.deps.repository.insertCharge(client, rows.charge);
    await this.deps.repository.appendChargeEvent(client, chargeEvent(rows.charge.chargeId, "REQUESTED", now, {
      providerPaymentId: null, amountMicros: rows.charge.totalMicros, errorCode: null
    }));
  }

  /**
   * The quote, the charge and its REQUESTED, written only under the owner lock and only if the subscription, folded
   * again inside it, is still the one this renewal was priced for (see "The decision is re-checked under the owner
   * lock"). A pending erasure is asked right before the lock (the port has no transaction form). Every read under
   * the lock runs on its `client`. `null`: nothing was written; the next tick decides again.
   */
  private async createCharge(state: SubscriptionState, priced: PricedRenewal, periodStart: Date, now: Date): Promise<LockedCharge | null> {
    const rows = this.attemptRows(state, priced, periodStart, 1, now);
    if (await this.erasureBlocks(state.ownerRef)) return null;
    return this.deps.repository.withTransaction(async (client): Promise<LockedCharge | null> => {
      await this.deps.jobs.lockOwner(client, state.ownerRef);
      const fresh = foldSubscription(await this.deps.repository.subscriptionEvents(state.subscriptionId, client));
      if (!renewable(fresh, now) || fresh.currentPeriodEnd?.getTime() !== periodStart.getTime()
        || (fresh.scheduledDowngradePlanId ?? fresh.planId) !== priced.planId) return null;
      const existing = await this.deps.repository.chargesForSubscription(state.subscriptionId, client);
      if (existing.some((row) => row.kind === "RENEWAL" && row.periodStart.getTime() === periodStart.getTime())) return null;
      await this.writeAttempt(client, rows, now);
      return Object.freeze({ charge: rows.charge, state: fresh });
    });
  }

  /**
   * A2: a dunning retry is a NEW charge row for the same period with the next attempt number, at the price
   * `retryPrice` chose (P2-M10: the failed attempt's own total): its own RENEWAL quote row. Written under the
   * owner lock only while the subscription, folded again inside it, is still PAST_DUE on this period with no cancel
   * requested, and no charge of this attempt or a later one exists (spec §2.5.6: cancel means no renewal); a pending
   * erasure is asked right before the lock. `null`: nothing was written.
   */
  async createRetryCharge(
    state: SubscriptionState, periodStart: Date, attempt: number, priced: PricedRenewal, now: Date
  ): Promise<LockedCharge | null> {
    const rows = this.attemptRows(state, priced, periodStart, attempt, now);
    if (await this.erasureBlocks(state.ownerRef)) return null;
    return this.deps.repository.withTransaction(async (client): Promise<LockedCharge | null> => {
      await this.deps.jobs.lockOwner(client, state.ownerRef);
      const fresh = foldSubscription(await this.deps.repository.subscriptionEvents(state.subscriptionId, client));
      if (fresh.status !== "PAST_DUE" || fresh.cancelRequested
        || (fresh.paymentProvider === "xmoney" && (fresh.xmoneyOrderId === null || fresh.xmoneyCustomerId === null))
        || fresh.currentPeriodEnd?.getTime() !== periodStart.getTime()) return null;
      const existing = await this.deps.repository.chargesForSubscription(state.subscriptionId, client);
      if (existing.some((row) => row.kind === "RENEWAL" && row.periodStart.getTime() === periodStart.getTime()
        && row.attempt >= attempt)) return null;
      await this.writeAttempt(client, rows, now);
      return Object.freeze({ charge: rows.charge, state: fresh });
    });
  }

  /**
   * Q-1: an attempt the tax service could not price is a failed attempt of the normal dunning, with no charge row
   * (none may be made without a fresh quote). Attempt 1 is the renewal itself once its 72 hours are over (from ACTIVE);
   * a later one is a dunning retry (from PAST_DUE, the next attempt after the ones the history records). Under the
   * owner lock, on the subscription folded again inside it: still in that status on this period, no cancel pending,
   * and no RENEWAL charge of this attempt or a later one for the period; a pending erasure is asked right before the
   * lock. Written through the settlement's own `writeDunningAttempt`: PAST_DUE with its grace and M5A–C, or past the
   * last retry day ENDED(DUNNING), Free and M6. One content-free line. Returns whether it wrote.
   */
  async failUnpricedAttempt(
    state: SubscriptionState, periodStart: Date, attempt: number, firstFailedAt: Date, now: Date, code: string
  ): Promise<boolean> {
    if (await this.erasureBlocks(state.ownerRef)) return false;
    const written = await this.deps.repository.withTransaction(async (client): Promise<boolean> => {
      await this.deps.jobs.lockOwner(client, state.ownerRef);
      const events = await this.deps.repository.subscriptionEvents(state.subscriptionId, client);
      const fresh = foldSubscription(events);
      const allowed = attempt === 1
        ? renewable(fresh, now)
        : fresh.status === "PAST_DUE" && !fresh.cancelRequested && (dunningProgress(events, fresh)?.failedAttempts ?? 0) + 1 === attempt;
      if (!allowed || fresh.periodAnchorAt === null || fresh.currentPeriodEnd?.getTime() !== periodStart.getTime()) return false;
      const charges = await this.deps.repository.chargesForSubscription(state.subscriptionId, client);
      if (charges.some((row) => row.kind === "RENEWAL" && row.periodStart.getTime() === periodStart.getTime()
        && row.attempt >= attempt)) return false;
      const customer = await this.deps.repository.customerByOwner(fresh.ownerRef, undefined, client);
      if (customer === null) throw new TypedDomainError("BILLING_CUSTOMER_MISSING", "a subscription without its customer");
      await writeDunningAttempt(this.deps, client, {
        subscription: fresh, customerId: customer.customerId, attempt, chargeId: null, reason: code, chargeErrorCode: null,
        periodStart, firstFailedAt, now
      });
      return true;
    });
    if (written) this.deps.audit("billing.renewal.dunning_unpriced", { attempt, code });
    return written;
  }

  /**
   * Called only under the subscription lease, after the call's marker (the charge's REQUESTED, or a later
   * `RESUBMIT_STARTED`) is committed. Never retries a call whose outcome it could not see. P2-I7: every row the
   * call's answer writes (SUBMITTED, SUBMIT_UNKNOWN, the not-sent REQUESTED, a refusal's FAILED, the hold and the
   * check) is dated by the clock read when the call returned, never by the caller's `now`: A2's waits (the minute
   * before the first look, the 30 quiet minutes before the one resubmission, the not-sent backoff) start when the
   * call really ended, however long the pass that made it had already run.
   */
  async submit(charge: ChargeRow, state: SubscriptionState): Promise<void> {
    let submitted: { transactionId: string };
    try {
      submitted = await this.deps.xmoney.rebill({
        orderId: state.xmoneyOrderId!, customerId: state.xmoneyCustomerId!, amountDecimal: microsToDecimal(charge.totalMicros)
      });
    } catch (error) {
      const now = this.deps.clock();
      const code = error instanceof TypedDomainError ? error.code : null;
      if (code === "XMONEY_PAYMENT_FAILED" || code === "XMONEY_REFUSED") {
        const declinedTransaction = error instanceof XMoneyPaymentFailedError ? error.transactionId : null;
        await this.refused(charge, code === "XMONEY_PAYMENT_FAILED" ? "PAYMENT_DECLINED" : "REBILL_REFUSED", declinedTransaction, now);
        return;
      }
      // D5 5i: nothing was processed (P3b: a refused connection or a 429 is XMONEY_UNAVAILABLE; a 401/403 is our key).
      // The request stands: no FAILED, no settlement, no M5, and A2's one extra submission is not spent.
      const notSent = code === "XMONEY_UNAVAILABLE" ? "REBILL_NOT_SENT"
        : credentialsRefused(this.deps.audit, error, "rebill") ? "REBILL_CREDENTIALS_REFUSED" : null;
      const kind = notSent === null ? "SUBMIT_UNKNOWN" as const : "REQUESTED" as const;
      const recorded = notSent ?? "REBILL_OUTCOME_UNKNOWN";
      await this.deps.repository.withTransaction((client) => this.deps.repository.appendChargeEvent(client,
        chargeEvent(charge.chargeId, kind, now, { providerPaymentId: null, amountMicros: charge.totalMicros, errorCode: recorded })));
      this.deps.audit("billing.renewal.unknown", { attempt: charge.attempt, code: recorded });
      // Q-1: the renewal itself keeps the plan while it is retried quietly (a dunning retry already runs on its grace).
      if (charge.attempt === 1) await this.holdPending(state, charge.periodStart, now, recorded);
      return;
    }
    await this.linkTransaction(charge, submitted.transactionId, this.deps.clock());
  }

  private async linkTransaction(charge: ChargeRow, transactionId: string, now: Date): Promise<void> {
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "SUBMITTED", now, {
        providerPaymentId: transactionId, amountMicros: charge.totalMicros, errorCode: null
      }));
      await this.deps.repository.enqueue(client, {
        kind: "VERIFY_PAYMENT", ref: transactionId, notBefore: now, payload: { charge_id: charge.chargeId }
      });
    });
    this.deps.kick();
  }

  private async refused(
    charge: ChargeRow, errorCode: "PAYMENT_DECLINED" | "REBILL_REFUSED" | "NO_TRANSACTION", transactionId: string | null, now: Date
  ): Promise<void> {
    const quote = charge.quoteId === null ? null : await this.deps.repository.quote(charge.quoteId, charge.ownerRef);
    const customer = await this.deps.repository.customerByOwner(charge.ownerRef);
    if (quote === null || customer === null) throw new TypedDomainError("BILLING_INVOICE_DATA_MISSING", "a charge without its quote or customer");
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, charge.ownerRef);
      const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "FAILED", now, {
        providerPaymentId: transactionId, amountMicros: charge.totalMicros, errorCode
      }));
      if (inserted === "DUPLICATE") return;
      const events = await this.deps.repository.subscriptionEvents(charge.subscriptionId, client);
      await this.deps.settlement.failed({
        client, now, charge, transaction: null, payment: null, subscription: foldSubscription(events), events, quote,
        ownerRef: charge.ownerRef, customerId: customer.customerId, cardCountry: null, errorCode
      });
    });
    this.deps.audit("billing.payment.failed", { chargeKind: charge.kind, code: errorCode });
  }

  /**
   * A2: adopt a transaction one of the charge's orders already has (`adopt`: the order in force when the charge was
   * made and every order a later card change set); otherwise call again a charge whose last call never reached xMoney
   * (after its backoff), or submit a blind unknown once more after 30 quiet minutes; after a second blind unknown only
   * adoption continues. The charge is closed for the owner, and the normal dunning starts, when its window is over
   * (`windowOver`: Q-1's 72 hours for the renewal itself, A2's 24 hours for a dunning retry). Returns whether it acted.
   */
  async recoverOpenCharge(chargeId: string): Promise<boolean> {
    const now = this.deps.clock();
    const charge = await this.deps.repository.charge(chargeId);
    if (charge === null) return false;
    // Seq order (P1b's `charge` reads events ORDER BY seq): a call's marker comes right before its outcome.
    const trail = charge.events.filter((event) => event.kind === "REQUESTED" || event.kind === "SUBMIT_UNKNOWN");
    const last = trail.at(-1);
    if (last === undefined) return false;
    const blind = charge.events.filter((event) => event.kind === "SUBMIT_UNKNOWN");
    const notSentLast = last.kind === "REQUESTED" && last.errorCode !== null && NOT_SENT_CODES.has(last.errorCode);
    if (last.kind === "REQUESTED" && !notSentLast) {
      // A call's marker with no outcome after 10 minutes: the process died during the call. A blind unknown.
      if (now.getTime() - last.at.getTime() < 10 * 60_000) return false;
      await this.deps.repository.withTransaction((client) => this.deps.repository.appendChargeEvent(client,
        chargeEvent(charge.chargeId, "SUBMIT_UNKNOWN", now, { providerPaymentId: null, amountMicros: charge.totalMicros, errorCode: "SUBMIT_INTERRUPTED" })));
      this.deps.audit("billing.renewal.unknown", { attempt: charge.attempt, code: "SUBMIT_INTERRUPTED" });
      // Q-1: an interrupted renewal call is an outcome still unknown; the plan stays while it is looked for.
      if (charge.attempt === 1) {
        const state = foldSubscription(await this.deps.repository.subscriptionEvents(charge.subscriptionId));
        await this.holdPending(state, charge.periodStart, now, "SUBMIT_INTERRUPTED");
      }
      return false;
    }
    const lastBlind = blind.at(-1) ?? null;
    // "Every LATER pass": xMoney's listing may trail its own write, so the first look for a lost rebill comes a minute
    // after its unknown (never in the tick that recorded it).
    if (lastBlind !== null && now.getTime() - lastBlind.at.getTime() < 60_000) return false;
    // R-34 / A2: once a call may have reached xMoney, the adoption check runs before any resubmission, whatever the
    // subscription's state, on every order that could hold the payment (A12: a card change since does not hide it): a
    // transaction that went through is claimed (the settlement refunds it when the plan is no longer live). Calls that
    // all proved nothing was sent have nothing to adopt.
    if (blind.length > 0 && await this.adopt(charge, now)) return true;
    // Folded afresh: the lease is held, but a chargeback or a cancel takes only the owner lock.
    const fresh = foldSubscription(await this.deps.repository.subscriptionEvents(charge.subscriptionId));
    const windowOver = this.windowOver(charge, fresh, lastBlind, trail[0]!, now);
    const stuckCode = lastBlind === null ? "REBILL_NOT_SENT" : "REBILL_OUTCOME_UNKNOWN";
    // Q-1: the renewal itself is retried quietly for 72 hours past its due instant; then the normal dunning starts.
    if (charge.attempt === 1 && windowOver) return this.closeStuck(charge, stuckCode, now);
    if (blind.length >= 2) {
      // A2 allows one more submission after an unknown; a third blind rebill is never made. Closed for the owner.
      return windowOver ? this.closeStuck(charge, stuckCode, now) : false;
    }
    if (last.kind === "SUBMIT_UNKNOWN" && now.getTime() - last.at.getTime() < 30 * 60_000) return false;
    if (notSentLast) {
      const notSent = trail.filter((event) => event.kind === "REQUESTED" && event.errorCode !== null
        && NOT_SENT_CODES.has(event.errorCode)).length;
      if (now.getTime() - last.at.getTime() < notSentBackoffMs(notSent)) return false;
    }
    const live = charge.attempt === 1 ? fresh.status === "ACTIVE" : fresh.status === "PAST_DUE";
    if (!live || fresh.cancelRequested || fresh.currentPeriodEnd?.getTime() !== charge.periodStart.getTime()
      || fresh.xmoneyOrderId === null || fresh.xmoneyCustomerId === null) {
      // Never charged again. A charge no call of which reached xMoney can hold no money: closed now. Otherwise it is
      // left open, so a first submit that did go through is still adopted, until the window ends.
      if (blind.length === 0) {
        await this.refused(charge, "NO_TRANSACTION", null, now);
        return true;
      }
      return windowOver ? this.closeStuck(charge, stuckCode, now) : false;
    }
    if (await this.erasureBlocks(fresh.ownerRef)) return false;
    // The marker is committed before the call: a process that dies during it leaves RESUBMIT_STARTED last, which
    // becomes SUBMIT_INTERRUPTED 10 minutes on, so it is never submitted blind a third time.
    await this.deps.repository.withTransaction((client) => this.deps.repository.appendChargeEvent(client,
      chargeEvent(charge.chargeId, "REQUESTED", now, { providerPaymentId: null, amountMicros: charge.totalMicros, errorCode: RESUBMIT_STARTED })));
    await this.submit(charge, fresh);
    return true;
  }

  /**
   * A2's adoption: a payment (never a refund or chargeback row), since the charge was made, of its amount, that no
   * charge of this xMoney system has claimed, on EVERY order that could hold it (A12, D6b's finding 6): the order in
   * force when the charge was made and each order a later card change set (`ordersHoldingCharge`). A card change
   * between an unknown submit and the resubmission moves the subscription to the new card's order while the lost
   * payment sits on the old one; listing only the current order would read "nothing there" and charge the new card
   * again. The caller resubmits only after this answers false for all of them, and a listing that fails throws, so
   * nothing is resubmitted on a partial look. xMoney stamps creation to the whole second, and its clock may run a few
   * seconds behind ours: the listing itself starts at the floor the rows are checked against (the charge's whole second
   * minus 5 s), so a rebill stamped in the charge row's own second, or a few seconds before it, is listed and never read
   * as older (a listing from the charge's own instant would drop it at xMoney, and the one resubmission would charge
   * the card twice). Rows the parser refuses are counted in one line for the look (D5 5i).
   */
  private async adopt(charge: ChargeRow, now: Date): Promise<boolean> {
    const orders = ordersHoldingCharge(await this.deps.repository.subscriptionEvents(charge.subscriptionId), charge.createdAt);
    const earliest = Math.floor(charge.createdAt.getTime() / 1_000) * 1_000 - 5_000;
    const rejected = rejectedRows(this.deps.audit, "renewal");
    try {
      for (const orderId of orders) {
        const listed = await this.deps.xmoney.listTransactions({
          from: new Date(earliest), to: now, orderId, dateType: "creation", onRejected: rejected.onRejected
        });
        for (const transaction of listed) {
          if (!ADOPTABLE_TYPES.has(transaction.transactionType)) continue;
          if (transaction.createdAt !== null && transaction.createdAt.getTime() < earliest) continue;
          if (transaction.currency !== "USD" || !amountMatches(transaction.amountDecimal, charge.totalMicros)) continue;
          if (await this.deps.jobs.chargeIdForTransaction(transaction.transactionId, null, this.deps.xmoneyEnvironment) !== null) continue;
          await this.linkTransaction(charge, transaction.transactionId, now);
          return true;
        }
      }
      return false;
    } finally {
      rejected.report();
    }
  }

  /**
   * When an open charge with no outcome is given up. The renewal itself (attempt 1): at Q-1's 72 hours past its due
   * instant, and a blind unknown only once A2's 30 quiet minutes of adoption have passed since it. A dunning retry:
   * A2's 24 hours after its latest call (its first marker when no call reached xMoney), as before Q-1.
   */
  private windowOver(
    charge: ChargeRow, state: SubscriptionState, lastBlind: ChargeEventRow | null, firstMarker: ChargeEventRow, now: Date
  ): boolean {
    if (charge.attempt === 1) {
      const quiet = lastBlind === null || now.getTime() - lastBlind.at.getTime() >= 30 * 60_000;
      return quiet && now.getTime() >= renewalPendingUntil(state, charge.periodStart).getTime();
    }
    return now.getTime() - (lastBlind ?? firstMarker).at.getTime() >= DAY_MS;
  }

  /**
   * The end state of a charge whose rebill never reached xMoney or whose outcome stayed unknown past its window:
   * FAILED(NO_TRANSACTION), one audit line naming why, and the settlement's normal dunning (Q-1: PAST_DUE, its grace,
   * M5A–C). P16b's owner summary lists it.
   */
  private async closeStuck(charge: ChargeRow, code: string, now: Date): Promise<boolean> {
    this.deps.audit("billing.renewal.stuck", { attempt: charge.attempt, code });
    await this.refused(charge, "NO_TRANSACTION", null, now);
    return true;
  }

  /**
   * M3 in the caller's transaction; also used by the look-ahead job (P11b). It takes the owner lock (re-entrant
   * inside the caller's transaction) and folds the subscription again (D5 5d): nothing is queued, and false returned,
   * unless it is still ACTIVE, on the period `state` names, with no cancel pending. W12 (the controller's ruling on
   * P2-I16, A7): RENEWAL_NOTICE_SENT is NOT written here but by `noticeMailSent`, once the email went out, so a changed
   * amount is never charged on a notice that was not sent. Until then the announced total is unchanged, so the renewal
   * at the end of the wait finds the notice missing and queues M3 again (the same ref, a new job once a dead one
   * ended) with a new wait. A notice that goes out late counts from when it went out (the WAIT branch of
   * `renewalNoticeDecision`).
   */
  async writeNotice(client: PoolClient, state: SubscriptionState, priced: PricedRenewal, now: Date, chargeDate: Date): Promise<boolean> {
    await this.deps.jobs.lockOwner(client, state.ownerRef);
    const fresh = foldSubscription(await this.deps.repository.subscriptionEvents(state.subscriptionId, client));
    if (fresh.status !== "ACTIVE" || fresh.cancelRequested || fresh.currentPeriodEnd === null
      || fresh.currentPeriodEnd.getTime() !== state.currentPeriodEnd?.getTime()) return false;
    const customer = await this.deps.repository.customerByOwner(fresh.ownerRef, undefined, client);
    if (customer === null) throw new TypedDomainError("BILLING_CUSTOMER_MISSING", "a subscription without its customer");
    await enqueueEmail(this.deps.repository, client, {
      template: "M3", recipient: { kind: "CUSTOMER", customerId: customer.customerId },
      dedupeRef: `${fresh.subscriptionId}:${fresh.currentPeriodEnd.toISOString()}:${priced.tax.totalMicros}`,
      params: {
        plan: priced.planId, totalAmount: microsToDecimal(priced.tax.totalMicros), chargeDate: chargeDate.toISOString(),
        // A25: M3 links to the /cancel page, never to a token.
        cancelPageUrl: new URL("/cancel", this.deps.publicAppUrl).toString()
      },
      notice: {
        subscriptionId: fresh.subscriptionId, periodEnd: fresh.currentPeriodEnd, announcedTotalMicros: priced.tax.totalMicros
      },
      notBefore: now
    });
    return true;
  }

  /**
   * W12 (the controller's ruling on P2-I16, A7): the EMAIL handler's `sent` hook. Once an M3 went out, its notice is
   * recorded (RENEWAL_NOTICE_SENT with the announced total and `sent_at` = when it was sent), under the owner lock and
   * on the same conditions `writeNotice` queued it on: still ACTIVE, on the announced period, with no cancel pending.
   * Otherwise nothing is recorded (an unrecorded notice is only ever re-sent, never charged on). Every other email,
   * and an M3 queued before W12 (no notice fields), passes through untouched.
   */
  async noticeMailSent(job: OutboxJob, sentAt: Date): Promise<void> {
    const {
      template, "notice.subscription_id": subscriptionId, "notice.period_end": periodEnd,
      "notice.announced_total_micros": announcedTotalMicros
    } = job.payload;
    if (template !== "M3" || typeof subscriptionId !== "string" || typeof periodEnd !== "string"
      || typeof announcedTotalMicros !== "number") return;
    const ownerRef = foldSubscription(await this.deps.repository.subscriptionEvents(subscriptionId)).ownerRef;
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, ownerRef);
      const fresh = foldSubscription(await this.deps.repository.subscriptionEvents(subscriptionId, client));
      if (fresh.status !== "ACTIVE" || fresh.cancelRequested || fresh.currentPeriodEnd?.toISOString() !== periodEnd) return;
      await this.deps.repository.appendSubscriptionEvent(client, subscriptionEvent(fresh, "RENEWAL_NOTICE_SENT", sentAt, {
        announced_total_micros: announcedTotalMicros, sent_at: sentAt.toISOString()
      }));
    });
  }

  /**
   * The notice and the postponement, under the owner lock and only while the subscription, folded again inside it,
   * is still renewable on the same period with no cancel pending (D5 5d): an append after WITHDRAWN or ERASURE_STOPPED
   * would be refused by P1b and roll the transaction back. Returns whether it wrote ("skipped" otherwise).
   */
  private async postpone(state: SubscriptionState, until: Date, now: Date, priced: PricedRenewal | null): Promise<boolean> {
    return this.deps.repository.withTransaction(async (client): Promise<boolean> => {
      await this.deps.jobs.lockOwner(client, state.ownerRef);
      const fresh = foldSubscription(await this.deps.repository.subscriptionEvents(state.subscriptionId, client));
      if (!renewable(fresh, now) || fresh.currentPeriodEnd?.getTime() !== state.currentPeriodEnd?.getTime()) return false;
      if (priced !== null && !(await this.writeNotice(client, fresh, priced, now, until))) return false;
      await this.deps.repository.appendSubscriptionEvent(client, subscriptionEvent(fresh, "RENEWAL_POSTPONED", now, {
        until: until.toISOString(), reason: "NOTICE_PERIOD"
      }));
      await this.deps.entitlements.append(client, {
        ownerRef: fresh.ownerRef, planId: fresh.planId, periodAnchorAt: fresh.periodAnchorAt!, cause: "RENEWAL_POSTPONED",
        effectiveAt: now, subscriptionId: fresh.subscriptionId, paidThrough: until, monthCreditOverrideMicros: null
      });
      return true;
    });
  }
}
