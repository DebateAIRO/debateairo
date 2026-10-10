import type { Pool } from "pg";
import { exhaustive } from "@debateai/kernel";
import type { CardPayments, PaymentReport } from "@debateai/billing-core";
import type {
  BillingJobQueries,
  BillingRepository,
  ChargeEventKind,
  ChargeEventRow,
  ChargeKind,
  DueStatusRead,
  StatusReadCursor,
  StatusReadSchedule
} from "@debateai/db";
import type { BillingAudit } from "./audit.js";
import { closeUnpaidHostedCharge, paidOrAlmost, readPaymentStatus } from "./hosted-payment.js";
import { failureCode, queueVerifyNow } from "./renewal.js";

export type NetopiaReconcileDeps = Readonly<{
  payments: Pick<CardPayments, "status">;
  paymentEnvironment: "sandbox" | "live";
  jobs: Pick<BillingJobQueries, "dueStatusReads" | "bringForward">;
  pool: Pick<Pool, "query">;
}>;

/** N16: what one NETOPIA status pass did (content-free counts). */
export type StatusCheckReport = Readonly<{ read: number; queued: number; closed: number; failed: number }>;

export type ReconcileDeps = Readonly<{
  billing: BillingRepository;
  jobs: Pick<BillingJobQueries, "lockOwner" | "withSubscriptionLease">;
  audit: BillingAudit;
  clock: () => Date;
  /** The runtime's outbox kick: queued verifications run now, not at the next outbox tick. */
  kick: () => void;
  /**
   * N16 (spec §2.14): NETOPIA's status reads (N8's `connectors.payments`, its environment), the due list's executor and
   * its jobs. Every charge this pass reads belongs to that environment (D5 5h).
   */
  netopia: NetopiaReconcileDeps;
}>;

export type ReconcileReport = Readonly<{
  /**
   * The daily pass's count (0 on any other tick): dead refund jobs with no REFUNDED since, whatever their code
   * (`deadRefunds()`; P16b lists them). The owner summary reads each code: REFUND_NOT_REQUESTED, REFUND_CHARGE_MISSING
   * and OTHER_PAYMENT_SYSTEM (or the code the previous card processor's era stored) owe nothing on this server;
   * REFUND_PAYLOAD_INVALID is listed as REFUND_NOT_REQUESTED (Part 4 final review C-7: nothing was sent, and the
   * charge's own refund requests say whether money is owed); REFUND_OUTCOME_UNKNOWN is checked in NETOPIA's admin;
   * every other code is still owed.
   */
  deadRefunds: number;
  /**
   * The daily pass's count (0 on any other tick): UPGRADE/RENEWAL charges of this NETOPIA environment past the 30-day
   * horizon with no outcome, no longer read (P16b lists them).
   */
  expired: number;
  /** N16: the NETOPIA status pass of this tick. */
  statusChecks: StatusCheckReport;
}>;

/** The per-charge errors of one loop: how many charges threw, and their distinct codes (`failureCode`). */
type ChargeErrors = { count: number; codes: Set<string> };

/** Spec §2.14: at most this many NETOPIA status reads a pass (N-18: NETOPIA documents no limit). */
export function statusReadsPerPass(): number {
  return 200;
}

type ReadCharge = Readonly<{
  kind: ChargeKind; totalMicros: number;
  events: ReadonlyArray<Pick<ChargeEventRow, "kind" | "errorCode" | "providerPaymentId" | "amountMicros">>;
}>;

const sumOf = (events: ReadCharge["events"], kind: ChargeEventKind): number =>
  events.filter((event) => event.kind === kind).reduce((total, event) => total + (event.amountMicros ?? 0), 0);

/**
 * Spec §2.14: whether NETOPIA's status says something our rows do not yet record, so VERIFY_PAYMENT must decide it now
 * (it decides every state from a fresh read, §2.8). UNCLEAR always does: VERIFY tells the owner, once per status.
 */
export function statusNeedsVerify(charge: ReadCharge, report: PaymentReport): boolean {
  const has = (kind: ChargeEventKind): boolean => charge.events.some((event) => event.kind === kind);
  const succeeded = has("SUCCEEDED");
  const notSaved = charge.events.some((event) => event.kind === "FAILED" && event.errorCode === "CARD_NOT_SAVED");
  const failedFor = charge.events.some((event) => event.kind === "FAILED" && event.providerPaymentId === report.providerPaymentId);
  switch (report.state) {
    case "PAID":
      return !succeeded && !notSaved;
    case "AUTHORIZED":
      return charge.kind === "CARD_CHECK" && charge.totalMicros === 0 && !succeeded && !notSaved;
    case "DECLINED":
    case "FAILED":
    case "EXPIRED":
      return !succeeded && !failedFor;
    case "ACTION_REQUIRED":
      return charge.kind === "RENEWAL" && !succeeded && !has("FAILED");
    case "VOIDED":
      return succeeded ? !has("REFUNDED") : !failedFor;
    case "REFUNDED":
      return succeeded && (!has("REFUNDED") || sumOf(charge.events, "REFUND_REQUESTED") > sumOf(charge.events, "REFUNDED"));
    case "CHARGEBACK_OPENED":
      return !has("CHARGEBACK");
    case "CHARGEBACK_LOST":
      return !has("CHARGEBACK_RESOLVED");
    case "CHARGEBACK_REPRESENTED":
      return !has("CHARGEBACK_REPRESENTED");
    case "UNCLEAR":
      return true;
    case "PENDING":
      return false;
    default:
      return exhaustive(report.state);
  }
}

/** How long a checkout's or a card check's hosted page stays open before an unpaid one is closed (the 24-hour close). */
function hostedPageLifeMs(): number {
  return 24 * 3_600_000;
}

/**
 * Spec §2.10 and the 24-hour close: an OPEN hosted charge with no outcome is closed when its read shows nothing paid or
 * on its way (§2.6.3's first row) and it is past its life: an upgrade past its quote's lifetime, a checkout or a card
 * check past 24 hours. A renewal is never closed here (N11's window owns it).
 */
export function hostedChargeLapsed(input: Readonly<{
  kind: ChargeKind; schedule: StatusReadSchedule; createdAt: Date; quoteExpiresAt: Date | null;
  events: ReadonlyArray<Pick<ChargeEventRow, "kind">>; answer: PaymentReport | "NO_SUCH_ORDER"; now: Date;
}>): boolean {
  if (input.schedule !== "OPEN" || input.events.some((event) => event.kind === "SUCCEEDED" || event.kind === "FAILED")) return false;
  if (input.answer !== "NO_SUCH_ORDER" && paidOrAlmost(input.answer)) return false;
  switch (input.kind) {
    case "UPGRADE":
      return input.quoteExpiresAt !== null && input.now.getTime() >= input.quoteExpiresAt.getTime();
    case "INITIAL":
    case "CARD_CHECK":
      return input.now.getTime() - input.createdAt.getTime() >= hostedPageLifeMs();
    case "RENEWAL":
      return false;
    default:
      return exhaustive(input.kind);
  }
}

const HOUR_MS = 3_600_000;

export class BillingReconciler {
  /** The last daily pass that COMPLETED; a failed one never counts, or the owner's counts would be silent for a day. */
  private lastDailyAt: number | null = null;
  private lastDailyAttemptAt: number | null = null;
  private statusCursor: StatusReadCursor | null = null;

  constructor(private readonly deps: ReconcileDeps) {}

  /**
   * The timer's one entry point. N16 (spec §2.14): NETOPIA's status pass runs on every tick, in its own try; then, once
   * a day (a failed day tried again an hour later), the owner's counts. Neither's failure stops the other; either one
   * still fails the tick (BILLING_RECONCILIATION_PENDING).
   */
  async tick(): Promise<ReconcileReport> {
    const now = this.deps.clock();
    let checks: StatusCheckReport = Object.freeze({ read: 0, queued: 0, closed: 0, failed: 0 });
    let checksFailed = false;
    let checksError: unknown = null;
    try {
      checks = await this.runStatusChecks(now);
    } catch (error) {
      checksFailed = true;
      checksError = error;
    }
    const at = now.getTime();
    const due = this.lastDailyAt === null || at - this.lastDailyAt >= 24 * HOUR_MS;
    const retryOpen = this.lastDailyAttemptAt === null || at - this.lastDailyAttemptAt >= HOUR_MS;
    let counts: Readonly<{ deadRefunds: number; expired: number }> = Object.freeze({ deadRefunds: 0, expired: 0 });
    if (due && retryOpen) {
      this.lastDailyAttemptAt = at;
      counts = await this.runDaily(now);
      this.lastDailyAt = at;
    }
    if (checksFailed) throw checksError;
    return Object.freeze({ ...counts, statusChecks: checks });
  }

  /** The owner's daily counts, content-free (P16b's summary lists the charges). */
  async runDaily(now: Date): Promise<Readonly<{ deadRefunds: number; expired: number }>> {
    const deadRefunds = (await this.deps.billing.deadRefunds()).length;
    if (deadRefunds > 0) this.deps.audit("billing.refund.dead", { count: deadRefunds });
    const expired = (await this.deps.billing.longUnsettledCharges(
      ["UPGRADE", "RENEWAL"], new Date(now.getTime() - 30 * 24 * HOUR_MS), this.deps.netopia.paymentEnvironment
    )).length;
    if (expired > 0) this.deps.audit("billing.reconcile.expired", { count: expired });
    return Object.freeze({ deadRefunds, expired });
  }

  /**
   * One charge's step, isolated: a charge that throws (a history that does not fold, D5 5d; an owner lock that timed
   * out) is counted and skipped, so it never stops the pass for every other customer. Undefined when it threw.
   */
  private async isolated<T>(errors: ChargeErrors, step: () => Promise<T>): Promise<T | undefined> {
    try {
      return await step();
    } catch (error) {
      errors.count += 1;
      errors.codes.add(failureCode(error));
      return undefined;
    }
  }

  /** Content-free (R-25): one line per loop whose charges threw; the count and the distinct codes, never an id. */
  private reportErrors(errors: ChargeErrors, pass: "STATUS"): void {
    if (errors.count > 0) {
      this.deps.audit("billing.reconcile.errors", { pass, count: errors.count, codes: [...errors.codes].sort().join(",") });
    }
  }

  /**
   * N16 (spec §2.14, SR-21): one frequent pass over the NETOPIA charges whose next read is due, newest due first, after
   * this pass's cursor, at most `statusReadsPerPass()`; the next pass resumes after the last row read, and a short page
   * wraps the cursor. Each read is isolated.
   */
  async runStatusChecks(now: Date): Promise<StatusCheckReport> {
    const netopia = this.deps.netopia;
    const page = await netopia.jobs.dueStatusReads(netopia.pool, now, this.statusCursor, statusReadsPerPass(), netopia.paymentEnvironment);
    this.statusCursor = page.next;
    const counts = { read: 0, queued: 0, closed: 0, failed: 0 };
    const errors: ChargeErrors = { count: 0, codes: new Set() };
    for (const due of page.rows) {
      const outcome = await this.isolated(errors, () => this.checkOne(netopia, due, now));
      if (outcome === undefined) continue;
      counts.read += 1;
      if (outcome === "FAILED_READ") counts.failed += 1;
      if (outcome === "QUEUED") counts.queued += 1;
      if (outcome === "CLOSED") counts.closed += 1;
    }
    this.reportErrors(errors, "STATUS");
    if (counts.queued > 0) this.deps.kick();
    return Object.freeze({ ...counts });
  }

  /** One read (its `status_read` row written by `readPaymentStatus`), then VERIFY_PAYMENT now, a close, or nothing. */
  private async checkOne(
    netopia: NetopiaReconcileDeps, due: DueStatusRead, now: Date
  ): Promise<"QUEUED" | "CLOSED" | "FAILED_READ" | "NONE"> {
    const read = await readPaymentStatus({ billing: this.deps.billing, payments: netopia.payments, audit: this.deps.audit }, {
      chargeId: due.chargeId, providerPaymentId: due.providerPaymentId, operation: "reconcile", now
    });
    if (read.answer === "UNREADABLE") {
      this.deps.audit("billing.reconcile.status_failed", { code: read.outcome });
      return "FAILED_READ";
    }
    const answer = read.answer;
    const charge = await this.deps.billing.charge(due.chargeId);
    if (charge === null) return "NONE";
    if (answer !== "NO_SUCH_ORDER" && statusNeedsVerify(charge, answer)) {
      await this.deps.billing.withTransaction((client) => queueVerifyNow({ repository: this.deps.billing, jobs: netopia.jobs }, client, due.chargeId, now));
      return "QUEUED";
    }
    const quote = due.kind === "UPGRADE" && due.quoteId !== null ? await this.deps.billing.quote(due.quoteId, due.ownerRef) : null;
    const lapsed = hostedChargeLapsed({
      kind: due.kind, schedule: due.schedule, createdAt: due.createdAt, quoteExpiresAt: quote?.expiresAt ?? null,
      events: charge.events, answer, now
    });
    if (!lapsed) return "NONE";
    const closed = await closeUnpaidHostedCharge({ billing: this.deps.billing, jobs: this.deps.jobs, audit: this.deps.audit }, {
      chargeId: due.chargeId, ownerRef: due.ownerRef, now
    });
    return closed ? "CLOSED" : "NONE";
  }
}
