import type { BillingJobQueries, BillingRepository } from "@debateai/db";
import type { TaxAuthorities } from "@debateai/register";
import type { BillingAudit } from "./audit.js";
import type { CardCustody } from "./card-custody.js";
import { emailJob } from "./email-job.js";
import { DONE, enqueueOnce, type OutboxHandler } from "./outbox.js";
import type { RefundDesk } from "./refunds.js";
import {
  buildTaxSummary,
  deadEmailsFrom,
  efacturaChecksFrom,
  lastEndedQuarter,
  liveQuarterSummaryRows,
  parseTaxQuarter,
  paymentsToCheckFrom,
  renderTaxSummary,
  unverifiedNoticeDaysFrom,
  type TaxQuarter,
  type TaxSummaryLimit
} from "./tax-summary.js";

const TAX_SUMMARY_REF = "tax-summary:";
/**
 * W12 fix I-1: O1's bound. Its text is one `block` param, which holds at most 65,536 characters, so O1 prints at most
 * 40 lines of each list and never more than 60,000 characters; `pnpm billing:tax-summary` prints the rest.
 */
const O1_LIMIT: TaxSummaryLimit = Object.freeze({ itemsPerSection: 40, maxChars: 60_000 });

/** Spec §2.5.9: the summary of the quarter that ended last, due at 06:00 UTC on the 5th day after it ended. */
export function taxSummaryJobFor(now: Date): Readonly<{
  kind: "OWNER_TAX_SUMMARY"; ref: string; notBefore: Date; quarter: TaxQuarter;
}> {
  const quarter = lastEndedQuarter(now);
  return Object.freeze({
    kind: "OWNER_TAX_SUMMARY" as const, ref: `${TAX_SUMMARY_REF}${quarter.label}`, quarter,
    notBefore: new Date(Date.UTC(quarter.to.getUTCFullYear(), quarter.to.getUTCMonth(), 5, 6))
  });
}

export type OwnerJobsDeps = Readonly<{
  billing: Pick<BillingRepository,
    | "withTransaction" | "enqueue" | "quarterSummaryRows" | "invoiceUnknownItems" | "deadRefunds"
    | "unrecordedRefunds" | "withdrawalsAwaitingOwner" | "unfoldableSubscriptions" | "stuckRenewals"
    | "longUnsettledCharges" | "chargelessDunning" | "blockedRenewals" | "deadEmails" | "quarantineSince">;
  /** P7's queries: the job's once-only check, and P10b's e-Factura read. */
  jobs: Pick<BillingJobQueries, "outboxJobExists" | "smartBillDocumentsNotAccepted">;
  taxAuthorities: TaxAuthorities;
  audit: BillingAudit;
  clock: () => Date;
  /** N14 (spec §2.12.2 item 3): the owner's refund reminders, run by the daily tick. Absent: none (billing off, tests). */
  refunds?: Pick<RefundDesk, "remindOwnerRefunds">;
  /** N17 (spec §2.15.4): the daily card sweep, then both purges. Absent: none (billing off, tests). */
  custody?: Pick<CardCustody, "sweep" | "purge">;
}>;

export class OwnerJobs {
  constructor(private readonly deps: OwnerJobsDeps) {}

  /**
   * The daily owner job: the quarter's tax summary queued once (whatever state an earlier copy is in), then each later
   * daily step (N14's refund reminders, N17's card custody). Each step is isolated: one failing never skips the others;
   * the first failure is thrown at the end, so the single-flight reports BILLING_OWNER_JOBS_PENDING.
   */
  async schedule(): Promise<number> {
    const now = this.deps.clock();
    let done = 0;
    let failure: unknown = undefined;
    for (const step of this.dailySteps(now)) {
      try {
        done += await step();
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure !== undefined) throw failure;
    return done;
  }

  private dailySteps(now: Date): ReadonlyArray<() => Promise<number>> {
    const refunds = this.deps.refunds;
    const custody = this.deps.custody;
    return [
      () => this.queueTaxSummary(now),
      ...(refunds === undefined ? [] : [() => refunds.remindOwnerRefunds(now)]),
      // N17: the sweep first, so a token it revokes today is purged one day later (0096's purge rule).
      ...(custody === undefined ? [] : [async () => (await custody.sweep(now)).revoked, () => custody.purge(now)])
    ];
  }

  private async queueTaxSummary(now: Date): Promise<number> {
    const summary = taxSummaryJobFor(now);
    const written = await this.deps.billing.withTransaction((client) => enqueueOnce(
      { repository: this.deps.billing, jobs: this.deps.jobs }, client,
      { kind: summary.kind, ref: summary.ref, notBefore: summary.notBefore, payload: { quarter: summary.quarter.label } }
    ));
    return written ? 1 : 0;
  }

  /** OWNER_TAX_SUMMARY: the summary text becomes email O1 to the owner (English; P7's EMAIL job sends it). */
  readonly taxSummary: OutboxHandler = async (job, now) => {
    let quarter: TaxQuarter;
    try {
      quarter = parseTaxQuarter(job.ref.startsWith(TAX_SUMMARY_REF) ? job.ref.slice(TAX_SUMMARY_REF.length) : "");
    } catch {
      return Object.freeze({ kind: "DEAD" as const, code: "BILLING_TAX_SUMMARY_USAGE" });
    }
    const text = renderTaxSummary(buildTaxSummary({
      quarter, rows: await liveQuarterSummaryRows(this.deps.billing, quarter.from, quarter.to),
      invoiceUnknown: await this.deps.billing.invoiceUnknownItems(),
      efactura: await efacturaChecksFrom(this.deps.jobs, quarter.to),
      paymentsToCheck: await paymentsToCheckFrom(this.deps.billing, now),
      deadEmails: await deadEmailsFrom(this.deps.billing, now),
      unverifiedNotices: await unverifiedNoticeDaysFrom(this.deps.billing, now),
      authorities: this.deps.taxAuthorities
    }), O1_LIMIT);
    // O1 is queued at most once per quarter, whatever state an earlier O1 is in (a re-run after it was sent mails nobody).
    const queued = await this.deps.billing.withTransaction((client) => enqueueOnce(
      { repository: this.deps.billing, jobs: this.deps.jobs }, client,
      emailJob({
        template: "O1", recipient: { kind: "OWNER" }, dedupeRef: quarter.label,
        params: { quarter: quarter.label, summaryText: text }, notBefore: now
      })
    ));
    if (queued) this.deps.audit("billing.tax_summary.queued", { quarter: quarter.label });
    return DONE;
  };
}
