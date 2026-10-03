import { exhaustive } from "@debateai/kernel";
import { decimalToMicros } from "@debateai/billing-core";
import type {
  BillingJobQueries,
  BillingRepository,
  ChargeEventKind,
  ChargeEventRow,
  ChargeRow,
  CustomerXMoneyEnvironment
} from "@debateai/db";
import type { XMoneyClient, XMoneyStatus, XMoneyTransaction, XMoneyTransactionListQuery } from "@debateai/payments-xmoney";
import { credentialsRefused, type BillingAudit } from "./audit.js";
import { failureCode } from "./renewal.js";
import { ordersHoldingCharge } from "./renewal-rules.js";
import { chargeEvent, transactionRoute } from "./rows.js";

type OpenCharge = ChargeRow & { events: ChargeEventRow[] };

export type ReconcileDeps = Readonly<{
  billing: BillingRepository;
  jobs: Pick<BillingJobQueries, "lockOwner" | "withSubscriptionLease">;
  xmoney: Pick<XMoneyClient, "listTransactions" | "getOrder">;
  /**
   * P6a's `connectors.xmoneyEnvironment`: the xMoney system `xmoney` talks to. Every charge this pass reads, fails or
   * adopts belongs to it (D5 5h): the two systems number their ids separately.
   */
  environment: CustomerXMoneyEnvironment;
  audit: BillingAudit;
  clock: () => Date;
  /** The runtime's outbox kick: queued verifications run now, not at the next outbox tick. */
  kick: () => void;
}>;

export type ReconcileReport = Readonly<{
  listed: number; enqueued: number; adopted: number; failed: number;
  /** An order lookup failed, so no checkout charge was failed this pass. */
  uncertain: boolean;
  /** Refunds xMoney refused, still owed (P16b lists them). */
  deadRefunds: number;
  /** UPGRADE/RENEWAL charges past the 30-day horizon with no outcome, no longer looked up (P16b lists them). */
  expired: number;
  /** Listed rows the parser refused and skipped (D5 5i), over the listings and the adoption look-ups. */
  rejected: number;
  /**
   * W13 (P2-I18): the daily listings that failed on this pass, each also written as its own
   * `billing.reconcile.listing_failed` line; the others were read and acted on. Retried alone, hourly.
   */
  refusedListings: ReadonlyArray<DailyListing>;
}>;

/**
 * A10's three daily listings, by xMoney's `dateType`. W13 (P2-I18): each runs on its own, so one xMoney refuses (or an
 * outage of one) never stops the other two or the rest of the daily pass.
 */
export type DailyListing = "creation" | "charge-back" | "refund";
const DAILY_LISTINGS: ReadonlyArray<DailyListing> = Object.freeze(["creation", "charge-back", "refund"]);
const NO_LISTINGS: ReadonlyArray<DailyListing> = Object.freeze([]);

/**
 * FREQUENT: every 10 minutes, leaving out renewals with two unknowns (P11a has stopped with those). DAILY: every
 * waiting charge. Each keeps its own cursor between passes.
 */
export type AdoptionScope = "FREQUENT" | "DAILY";

/** The per-charge errors of one loop: how many charges threw, and their distinct codes (`failureCode`). */
type ChargeErrors = { count: number; codes: Set<string> };

/** A refund that is its own xMoney transaction (D5 5g): only REFUNDED can settle it, and only once it is final. */
function refundTransactionKinds(status: XMoneyStatus): readonly ChargeEventKind[] | null {
  switch (status) {
    case "complete-ok":
    case "refund-ok":
      return ["REFUNDED"];
    case "start":
    case "in-progress":
    case "3d-pending":
    // A refund that failed or was reversed records nothing of ours: RefundDesk's A4(c) look-up and P14a's
    // dead-refund count cover a refund that did not happen.
    case "complete-failed":
    case "void-ok":
    case "cancel-ok":
    case "charge-back":
      return null;
    default:
      return exhaustive(status);
  }
}

/**
 * A dispute that is its own xMoney transaction (P2-I2): only the CHARGEBACK of the payment it names can settle it,
 * once it is final and happened. A dispute still in flight, or one that failed or was withdrawn, records nothing.
 */
function disputeTransactionKinds(status: XMoneyStatus): readonly ChargeEventKind[] | null {
  switch (status) {
    case "charge-back":
    case "complete-ok":
    case "refund-ok":
      return ["CHARGEBACK"];
    case "start":
    case "in-progress":
    case "3d-pending":
    case "complete-failed":
    case "void-ok":
    case "cancel-ok":
      return null;
    default:
      return exhaustive(status);
  }
}

/**
 * The event kinds of ours that already settle a listed transaction (A9's status table, which VERIFY_PAYMENT
 * applies). `null`: nothing of ours is expected (yet): the payment is not final, or the refund or the dispute did not
 * happen.
 */
export function expectedChargeEventKinds(
  transaction: Pick<XMoneyTransaction, "status" | "transactionType">
): readonly ChargeEventKind[] | null {
  const route = transactionRoute(transaction.transactionType);
  switch (route) {
    case "REPRESENTMENT":
      return ["CHARGEBACK_REPRESENTED"];
    // P2-I2: never SUCCEEDED for a dispute, whatever status xMoney reports it with.
    case "DISPUTE":
      return disputeTransactionKinds(transaction.status);
    // D5 5g: never SUCCEEDED for a refund, whatever status xMoney reports it with.
    case "REFUND":
      return refundTransactionKinds(transaction.status);
    case "PAYMENT":
      break;
    default:
      return exhaustive(route);
  }
  switch (transaction.status) {
    case "start":
    case "in-progress":
    case "3d-pending":
      return null;
    case "complete-ok":
      // D5 5f: a second payment of an order already paid is recorded as DUPLICATE_PAYMENT (and refunded, P9b).
      return ["SUCCEEDED", "DUPLICATE_PAYMENT"];
    case "complete-failed":
      return ["FAILED"];
    case "refund-ok":
      return ["REFUNDED"];
    case "void-ok":
    case "cancel-ok":
      return ["FAILED", "REFUNDED"];
    case "charge-back":
      return ["CHARGEBACK"];
    default:
      return exhaustive(transaction.status);
  }
}

/**
 * Whether our rows already hold this transaction's final outcome. A refund that is its own transaction is also
 * settled by a REFUNDED of the same amount on a payment it names (`relatedTransactionIds`, D5 5g): RefundDesk records
 * our own refund on the payment it refunded, and P9c a provider refund read from the payment's own status. P2-M1: a
 * REFUNDED of another amount never settles it (a dashboard refund after our partial one would go unrecorded, with
 * no credit note and no owner item); VERIFY_PAYMENT then records it or hands it to the owner. `refunded` holds those
 * amounts by payment id. A dispute that is its own transaction is settled by the CHARGEBACK of a payment it names
 * (P2-I2): VERIFY_PAYMENT records one dispute once, under the payment's id. `recorded` holds the kinds by transaction
 * id, the related payments' included.
 */
export function transactionSettled(
  transaction: Pick<XMoneyTransaction, "transactionId" | "status" | "transactionType" | "relatedTransactionIds" | "amountDecimal">,
  recorded: ReadonlyMap<string, ReadonlySet<ChargeEventKind>>,
  refunded: ReadonlyMap<string, ReadonlyArray<number>>
): boolean {
  const expected = expectedChargeEventKinds(transaction);
  if (expected === null) return false;
  const own = recorded.get(transaction.transactionId);
  if (own !== undefined && expected.some((kind) => own.has(kind))) return true;
  const route = transactionRoute(transaction.transactionType);
  if (route === "REFUND") {
    const amount = amountOf(transaction);
    return amount !== null
      && transaction.relatedTransactionIds.some((paymentId) => refunded.get(paymentId)?.includes(amount) ?? false);
  }
  return route === "DISPUTE"
    && transaction.relatedTransactionIds.some((paymentId) => recorded.get(paymentId)?.has("CHARGEBACK") ?? false);
}

/** A payment that can be a rebill's: never a refund, a dispute or a representment (D5 5g, P2-I2). */
function isPayment(transaction: XMoneyTransaction): boolean {
  return transactionRoute(transaction.transactionType) === "PAYMENT";
}

function amountOf(transaction: Pick<XMoneyTransaction, "amountDecimal">): number | null {
  try {
    return decimalToMicros(transaction.amountDecimal);
  } catch {
    return null;
  }
}

/**
 * The earliest creation instant a rebill of a charge made at `createdAt` can carry, as P11a's `adopt` reads it:
 * xMoney stamps creation to the whole second and its clock may run a few seconds behind ours, so the look starts at
 * the charge's whole second minus 5 s (a listing from the charge's own instant could drop its own rebill).
 */
function adoptionFloor(createdAt: Date): Date {
  return new Date(Math.floor(createdAt.getTime() / 1_000) * 1_000 - 5_000);
}

const HOUR_MS = 3_600_000;
/** How long a daily pass that failed waits before it is tried again; the frequent pass runs on meanwhile. */
const DAILY_RETRY_MS = HOUR_MS;
/** A2's wait before an unknown submit is looked up, and the page each adoption pass walks. */
const ADOPTION_WAIT_MS = 30 * 60_000;
const ADOPTION_PAGE = 200;

export class BillingReconciler {
  /** The last daily pass that COMPLETED; a failed one never counts, or the money check would be silent for a day. */
  private lastDailyAt: number | null = null;
  private lastDailyAttemptAt: number | null = null;
  /** W13: the listings the last daily pass (or its last retry) could not read; retried alone after `DAILY_RETRY_MS`. */
  private pendingListings: ReadonlyArray<DailyListing> = NO_LISTINGS;
  private readonly cursors = new Map<AdoptionScope, Readonly<{ createdAt: Date; chargeId: string }>>();

  constructor(private readonly deps: ReconcileDeps) {}

  /**
   * The timer's one entry point: the full pass once a day, the frequent adoption pass on the ticks between. A daily
   * pass that fails (the database, a charge loop that could not start) is retried after `DAILY_RETRY_MS`, and never
   * stops A2: the frequent adoption pass runs in its place, then the daily error goes on to the single-flight's pending
   * report. W13 (P2-I18): a listing xMoney refuses no longer fails the pass. The pass completes with the other
   * listings, and the refused ones alone are retried after `DAILY_RETRY_MS`, beside the frequent pass, until each is
   * read or the next full pass comes.
   */
  async tick(): Promise<ReconcileReport> {
    const now = this.deps.clock();
    const at = now.getTime();
    const due = this.lastDailyAt === null || at - this.lastDailyAt >= 24 * HOUR_MS;
    const retryOpen = this.lastDailyAttemptAt === null || at - this.lastDailyAttemptAt >= DAILY_RETRY_MS;
    if (due && retryOpen) {
      this.lastDailyAttemptAt = at;
      const report = await this.withAdoptionOnFailure(now, () => this.runDaily(now));
      this.lastDailyAt = at;
      this.pendingListings = report.refusedListings;
      return report;
    }
    if (this.pendingListings.length > 0 && retryOpen) {
      this.lastDailyAttemptAt = at;
      const listings = this.pendingListings;
      const report = await this.withAdoptionOnFailure(now, () => this.runListings(now, listings, "FREQUENT"));
      this.pendingListings = report.refusedListings;
      return report;
    }
    const adoption = await this.runAdoption(now, "FREQUENT");
    return Object.freeze({
      listed: 0, enqueued: 0, ...adoption, uncertain: false, deadRefunds: 0, expired: 0, refusedListings: NO_LISTINGS
    });
  }

  /** A2 does not wait for A10: when `pass` throws, the frequent adoption pass still runs on this tick. */
  private async withAdoptionOnFailure(now: Date, pass: () => Promise<ReconcileReport>): Promise<ReconcileReport> {
    try {
      return await pass();
    } catch (dailyError) {
      try {
        await this.runAdoption(now, "FREQUENT");
      } catch {
        // The daily error is the one reported; the adoption pass is tried again on the next tick.
      }
      throw dailyError;
    }
  }

  /**
   * One listing with the parser's refused rows counted into `rejected` (D5 5i: `onRejected`, the row skipped). A
   * refused key raises P7's operator alarm before the error goes on.
   */
  private async listed(
    query: Omit<XMoneyTransactionListQuery, "onRejected">, rejected: { count: number }
  ): Promise<ReadonlyArray<XMoneyTransaction>> {
    try {
      return await this.deps.xmoney.listTransactions({ ...query, onRejected: () => { rejected.count += 1; } });
    } catch (error) {
      credentialsRefused(this.deps.audit, error, "list");
      throw error;
    }
  }

  /** Content-free (R-25): how many rows one pass could not read, never which. */
  private reportRejected(rejected: { count: number }, pass: "LISTING" | "ADOPTION"): void {
    if (rejected.count > 0) this.deps.audit("billing.reconcile.rows_rejected", { count: rejected.count, pass });
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
  private reportErrors(errors: ChargeErrors, pass: AdoptionScope | "CHECKOUT"): void {
    if (errors.count > 0) {
      this.deps.audit("billing.reconcile.errors", { pass, count: errors.count, codes: [...errors.codes].sort().join(",") });
    }
  }

  /** The order's merchant id for a listed transaction: its own, else GET /order; "UNKNOWN" when the lookup failed. */
  private async externalOrderOf(transaction: XMoneyTransaction): Promise<string | null | "UNKNOWN"> {
    if (transaction.externalOrderId !== null) return transaction.externalOrderId;
    try {
      return (await this.deps.xmoney.getOrder(transaction.orderId)).externalOrderId;
    } catch {
      return "UNKNOWN";
    }
  }

  /**
   * One daily listing, on its own (W13, P2-I18): a failure is written as `billing.reconcile.listing_failed` with the
   * listing and its code (content-free), recorded in `refused`, and read as no rows, so the pass goes on.
   */
  private async dailyListing(
    listing: DailyListing, from: Date, to: Date, rejected: { count: number }, refused: DailyListing[]
  ): Promise<ReadonlyArray<XMoneyTransaction>> {
    try {
      return await this.listed({ dateType: listing, from, to }, rejected);
    } catch (error) {
      refused.push(listing);
      this.deps.audit("billing.reconcile.listing_failed", { listing, code: failureCode(error) });
      return [];
    }
  }

  /** The full pass: the three listings, A2's daily adoption, the 24-hour checkouts and the owner's counts. */
  async runDaily(now: Date): Promise<ReconcileReport> {
    return this.runListings(now, DAILY_LISTINGS, "DAILY");
  }

  /**
   * `listings` (all three on the full pass; on an hourly retry, only those the last try could not read), then the
   * adoption pass of `scope`. The 24-hour checkouts are failed only when this pass READ the creation listing: without
   * it, a checkout whose payment exists cannot be told from an abandoned one. The owner's counts belong to the full
   * pass alone.
   */
  private async runListings(
    now: Date, listings: ReadonlyArray<DailyListing>, scope: AdoptionScope
  ): Promise<ReconcileReport> {
    const environment = this.deps.environment;
    const withCreation = listings.includes("creation");
    const stale = withCreation
      ? await this.deps.billing.unsettledCharges(
        ["INITIAL", "CARD_CHECK"], new Date(now.getTime() - 24 * HOUR_MS), 500, environment
      )
      : [];
    const oldest = stale.reduce((earliest, charge) => Math.min(earliest, charge.createdAt.getTime()), now.getTime() - 72 * HOUR_MS);
    const windowFrom: Readonly<Record<DailyListing, Date>> = {
      creation: new Date(Math.max(now.getTime() - 30 * 24 * HOUR_MS, oldest)),
      "charge-back": new Date(now.getTime() - 120 * 24 * HOUR_MS),
      refund: new Date(now.getTime() - 120 * 24 * HOUR_MS)
    };
    const rejected = { count: 0 };
    const refused: DailyListing[] = [];
    const read: Array<ReadonlyArray<XMoneyTransaction>> = [];
    for (const listing of DAILY_LISTINGS) {
      if (!listings.includes(listing)) continue;
      read.push(await this.dailyListing(listing, windowFrom[listing], now, rejected, refused));
    }
    this.reportRejected(rejected, "LISTING");
    const decideCheckouts = withCreation && !refused.includes("creation") && stale.length > 0;
    const byId = new Map<string, XMoneyTransaction>();
    for (const listing of read) for (const transaction of listing) byId.set(transaction.transactionId, transaction);
    // The kinds of every listed transaction and of every payment a listed refund names.
    const ids = [...byId.values()].flatMap((transaction) => [transaction.transactionId, ...transaction.relatedTransactionIds]);
    const recorded = await this.deps.billing.chargeEventKindsByTransaction(ids, environment);
    const refunded = await this.deps.billing.refundedAmountsByPayment(
      [...byId.values()].filter((transaction) => transactionRoute(transaction.transactionType) === "REFUND")
        .flatMap((transaction) => transaction.relatedTransactionIds),
      environment
    );
    const touched = new Set<string>();
    let enqueued = 0;
    let uncertain = false;
    for (const transaction of byId.values()) {
      const settled = transactionSettled(transaction, recorded, refunded);
      // Any payment not yet settled on our side — final or still in flight — marks its order as reached, so its
      // checkout charge is never failed as "no transaction". The lookups run only when a charge could be failed. A
      // refund is matched through the payment it names, never through its order (D5 5g).
      if (!settled && decideCheckouts && transaction.transactionType !== "refund") {
        const external = await this.externalOrderOf(transaction);
        if (external === "UNKNOWN") uncertain = true;
        else if (external !== null) touched.add(external);
      }
      if (expectedChargeEventKinds(transaction) === null || settled) continue;
      await this.deps.billing.withTransaction((client) => this.deps.billing.enqueue(client, {
        kind: "VERIFY_PAYMENT", ref: transaction.transactionId, notBefore: now, payload: {}
      }));
      enqueued += 1;
    }
    const adoption = await this.runAdoption(now, scope);
    let failed = adoption.failed;
    if (decideCheckouts && !uncertain) {
      const errors: ChargeErrors = { count: 0, codes: new Set() };
      for (const charge of stale) {
        if (touched.has(charge.chargeId) || charge.events.some((event) => event.xmoneyTransactionId !== null)) continue;
        if (await this.isolated(errors, () => this.failWithoutTransaction(charge, now)) === true) failed += 1;
      }
      this.reportErrors(errors, "CHECKOUT");
    }
    // For the owner, content-free: counts only, once a day; P16b's summary lists the charges.
    let deadRefunds = 0;
    let expired = 0;
    if (scope === "DAILY") {
      deadRefunds = (await this.deps.billing.deadRefunds()).length;
      if (deadRefunds > 0) this.deps.audit("billing.refund.dead", { count: deadRefunds });
      expired = (await this.deps.billing.longUnsettledCharges(
        ["UPGRADE", "RENEWAL"], new Date(now.getTime() - 30 * 24 * HOUR_MS), environment
      )).length;
      if (expired > 0) this.deps.audit("billing.reconcile.expired", { count: expired });
    }
    if (enqueued > 0 || adoption.adopted > 0) this.deps.kick();
    return Object.freeze({
      listed: byId.size, enqueued, adopted: adoption.adopted, failed, uncertain, deadRefunds, expired,
      rejected: rejected.count + adoption.rejected, refusedListings: Object.freeze(refused)
    });
  }

  /**
   * A2: adopt the transaction of a submit whose outcome is unknown, or settle an upgrade that never happened (or
   * whose rebill never left, P12c). The candidates come from SQL (this xMoney system only, never a SUBMITTED charge,
   * never older than 30 days) one page after this scope's cursor; a short page wraps the cursor, so every candidate
   * is visited within ceil(N / 200) passes. Each charge is handled under P7's subscription lease, the one P11a's
   * recovery takes, so the two never both act on it; a busy subscription is simply looked at on a later pass. A
   * charge that throws is counted into one `billing.reconcile.errors` line and skipped, never rethrown: it would stop
   * every candidate after it, on every pass, until it left the 30-day horizon.
   */
  async runAdoption(
    now: Date, scope: AdoptionScope = "FREQUENT"
  ): Promise<Readonly<{ adopted: number; failed: number; rejected: number }>> {
    const page = await this.deps.billing.adoptionCandidates({
      kinds: ["UPGRADE", "RENEWAL"], environment: this.deps.environment,
      createdFrom: new Date(now.getTime() - 30 * 24 * HOUR_MS),
      createdBefore: new Date(now.getTime() - ADOPTION_WAIT_MS), after: this.cursors.get(scope) ?? null,
      maxUnknowns: scope === "FREQUENT" ? 1 : null, limit: ADOPTION_PAGE
    });
    const last = page.at(-1);
    if (page.length < ADOPTION_PAGE || last === undefined) this.cursors.delete(scope);
    else this.cursors.set(scope, Object.freeze({ createdAt: last.createdAt, chargeId: last.chargeId }));
    let adopted = 0;
    let failed = 0;
    const rejected = { count: 0 };
    const errors: ChargeErrors = { count: 0, codes: new Set() };
    for (const charge of page) {
      const submits = charge.events.filter((event) => event.kind === "SUBMITTED" || event.kind === "SUBMIT_UNKNOWN");
      const latest = submits.at(-1);
      if (latest?.kind === "SUBMITTED") continue;
      if (now.getTime() - (latest?.at ?? charge.createdAt).getTime() < ADOPTION_WAIT_MS) continue;
      const leased = await this.isolated(errors, () =>
        this.deps.jobs.withSubscriptionLease(charge.subscriptionId, () => this.adoptOne(charge, now, rejected)));
      if (leased === undefined || leased.kind === "BUSY") continue;
      if (leased.value === "ADOPTED") adopted += 1;
      if (leased.value === "FAILED") failed += 1;
    }
    this.reportRejected(rejected, "ADOPTION");
    this.reportErrors(errors, scope);
    return Object.freeze({ adopted, failed, rejected: rejected.count });
  }

  private async adoptOne(charge: OpenCharge, now: Date, rejected: { count: number }): Promise<"ADOPTED" | "FAILED" | "NONE"> {
    // A2 with A12: every order that could hold the payment, the same list P11a's `adopt` reads — the order in force
    // when the charge was made, then each order a later card change set (a resubmission after one went there).
    const orders = ordersHoldingCharge(await this.deps.billing.subscriptionEvents(charge.subscriptionId), charge.createdAt);
    if (orders.length === 0) return "NONE";
    const earliest = adoptionFloor(charge.createdAt);
    const listed: XMoneyTransaction[] = [];
    for (const orderId of orders) {
      try {
        listed.push(...await this.listed({ dateType: "creation", orderId, from: earliest, to: now }, rejected));
      } catch {
        // Could not look at one of them: no decision on this pass.
        return "NONE";
      }
    }
    const claimed = await this.deps.billing.chargeEventKindsByTransaction(
      listed.map((transaction) => transaction.transactionId), this.deps.environment
    );
    // P11a's check: a USD payment of the charge's amount, made since the charge, that no charge of ours has recorded in
    // any event yet — never a refund of the same amount (D5 5g).
    const match = listed.find((transaction) => isPayment(transaction)
      && (transaction.createdAt === null || transaction.createdAt.getTime() >= earliest.getTime())
      && transaction.currency === "USD" && amountOf(transaction) === charge.totalMicros
      && (claimed.get(transaction.transactionId)?.size ?? 0) === 0);
    if (match !== undefined) {
      const written = await this.deps.billing.withTransaction(async (client) => {
        const inserted = await this.deps.billing.appendChargeEvent(client, chargeEvent(charge.chargeId, "SUBMITTED", now, {
          xmoneyTransactionId: match.transactionId, amountMicros: charge.totalMicros, errorCode: null
        }));
        if (inserted === "INSERTED") {
          await this.deps.billing.enqueue(client, {
            kind: "VERIFY_PAYMENT", ref: match.transactionId, notBefore: now, payload: { charge_id: charge.chargeId }
          });
        }
        return inserted === "INSERTED";
      });
      if (!written) return "NONE";
      this.deps.audit("billing.reconcile.adopted", { kind: charge.kind });
      return "ADOPTED";
    }
    // An upgrade that never reached xMoney changed nothing: settle it. A renewal is P11a's to resubmit once.
    return charge.kind === "UPGRADE" && await this.failWithoutTransaction(charge, now) ? "FAILED" : "NONE";
  }

  /** FAILED(NO_TRANSACTION) under the owner lock, and only if the charge is still unsettled once the lock is held. */
  private async failWithoutTransaction(charge: OpenCharge, now: Date): Promise<boolean> {
    const first = (await this.deps.billing.subscriptionEvents(charge.subscriptionId))[0];
    if (first === undefined) return false;
    const written = await this.deps.billing.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, first.ownerRef);
      // Anything written to the charge since it was read (a verification, an adoption) wins over this; read on
      // the connection that holds the lock.
      const current = await this.deps.billing.charge(charge.chargeId, client);
      if (current === null || current.events.length !== charge.events.length) return false;
      await this.deps.billing.appendChargeEvent(client, chargeEvent(charge.chargeId, "FAILED", now, {
        xmoneyTransactionId: null, amountMicros: charge.totalMicros, errorCode: "NO_TRANSACTION"
      }));
      return true;
    });
    if (written) this.deps.audit("billing.reconcile.no_transaction", { kind: charge.kind });
    return written;
  }
}
