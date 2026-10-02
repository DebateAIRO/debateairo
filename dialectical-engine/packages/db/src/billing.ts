import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import {
  foldSubscription,
  type PlanId,
  type SubscriptionEvent,
  type SubscriptionEventKind,
  type SubscriptionState,
  type TaxStatus
} from "@debateai/billing-core";
import { withWriteTransaction, withWriteTransactionOn } from "./index.js";

/**
 * PAID PLANS (spec 2026-09-29 §2.5.2; amendments R1 A2/A3/A17/A21) — every SQL statement over
 * billing.* except the entitlement (B5's EntitlementRepository). Migrations 0085–0087. The tables are
 * append-only; the outbox changes only its claim/finish columns. Money is integer micros end to end.
 */
export type OutboxKind =
  | "VERIFY_PAYMENT" | "QUADERNO_RECORD_SALE" | "QUADERNO_RECORD_REFUND" | "SMARTBILL_INVOICE"
  | "SMARTBILL_STORNO" | "EMAIL" | "RENEWAL_NOTICE" | "OWNER_TAX_SUMMARY"
  // R-30: the durable refund executor (P9b/P12d) and the yearly retention purge (P16c).
  | "XMONEY_REFUND" | "RETENTION_PURGE";
/** R-14: an xMoney customer lives in one environment; the connectors' `xmoneyEnvironment` names it. */
export type CustomerXMoneyEnvironment = "stage" | "live";
export type ChargeKind = "INITIAL" | "RENEWAL" | "UPGRADE" | "CARD_CHECK";
export type ChargeEventKind =
  | "REQUESTED" | "SUBMITTED" | "SUBMIT_UNKNOWN" | "SUCCEEDED" | "FAILED" | "REFUND_REQUESTED" | "REFUNDED"
  | "CHARGEBACK" | "CHARGEBACK_REPRESENTED" | "CHARGEBACK_RESOLVED"
  // A second successful payment of the same charge (two checkout tabs, or a resubmitted rebill that had gone
  // through): money we hold and must return, refundable like the SUCCEEDED payment (P1a's refund guard).
  | "DUPLICATE_PAYMENT";
export type QuoteKind = "SUBSCRIBE" | "UPGRADE" | "RENEWAL";
export type LocationVerdict = "AGREED" | "CONFIRMED_BY_PERSON" | "CONFLICTING" | "BLOCKED";
export type InvoiceIssuerName = "QUADERNO" | "SMARTBILL";
export type InvoiceKind = "INVOICE" | "CREDIT_NOTE";
export type OutboxPayload = Readonly<Record<string, string | number | boolean | null>>;

export type QuoteRow = Readonly<{
  quoteId: string; ownerRef: string; planId: PlanId; kind: QuoteKind;
  netMicros: number; taxMicros: number; totalMicros: number;
  taxCountry: string; taxRegion: string | null; taxRateBasisPoints: number; taxStatus: TaxStatus; taxName: string;
  quadernoRef: string | null; createdAt: Date; expiresAt: Date; locationCiphertext: Buffer; keyId: string;
  /** A7 / R-31: an UPGRADE quote's new full-month total (the announced total UPGRADED records); else null. */
  recurringTotalMicros: number | null;
}>;
export type ChargeRow = Readonly<{
  chargeId: string; ownerRef: string; subscriptionId: string; kind: ChargeKind; attempt: number;
  periodStart: Date; periodEnd: Date; quoteId: string | null;
  netMicros: number; taxMicros: number; totalMicros: number; currency: "USD"; createdAt: Date;
  /** The xMoney system (connectors.xmoneyEnvironment) this charge is paid in; its events inherit it. */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
}>;
export type ChargeEventRow = Readonly<{
  eventId: string; chargeId: string; kind: ChargeEventKind; at: Date;
  xmoneyTransactionId: string | null; amountMicros: number | null; errorCode: string | null;
  xmoneyEnvironment: CustomerXMoneyEnvironment;
  /** REFUND_REQUESTED/REFUNDED only: the PAID transaction refunded, when it is not the row's own transaction. */
  refundsTransactionId: string | null;
}>;
/**
 * What a caller appends: the repository mints `eventId` when it is left out, takes `xmoneyEnvironment` from the
 * charge (so the two can never disagree), and `refundsTransactionId` defaults to null. `xmoneyCreatedAt` is the
 * xMoney transaction's own `creationDate` (VERIFY_PAYMENT passes `transaction.createdAt`); the tax summary dates the
 * row by it. Only a row that IS that xMoney transaction may carry it (P1a's constraint): a SUCCEEDED, a
 * DUPLICATE_PAYMENT, or a REFUNDED on its own refund transaction (`refundsTransactionId` set). A REFUNDED or
 * CHARGEBACK written for a status change of the payment itself carries none — that transaction's createdAt is the
 * payment's — and is dated by `at`.
 */
export type ChargeEventInput = Omit<ChargeEventRow, "eventId" | "xmoneyEnvironment" | "refundsTransactionId">
  & Readonly<{ eventId?: string; refundsTransactionId?: string | null; xmoneyCreatedAt?: Date | null }>;
/**
 * Where a read runs: the pool (the default), or the client of a transaction the caller holds (D6b) — the shape
 * packages/db/src/index.ts:668 already uses.
 */
export type BillingReadExecutor = Pick<Pool, "query"> | PoolClient;
export type LocationEvidenceRow = Readonly<{
  chargeId: string; ipCountry: string; declaredCountry: string; cardCountry: string | null;
  verdict: LocationVerdict; ipCiphertext: Buffer; keyId: string; at: Date;
}>;
export type InvoiceIntentRow = Readonly<{ chargeId: string; kind: InvoiceKind; issuer: InvoiceIssuerName; requestedAt: Date }>;
export type InvoiceRow = Readonly<{
  invoiceId: string; chargeId: string; issuer: InvoiceIssuerName; kind: InvoiceKind; externalRef: string;
  series: string | null; number: string; url: string | null; totalMicros: number; at: Date;
}>;
export type NoticeRow = Readonly<{
  noticeId: string; receivedAt: Date; payloadSha256: string; transactionId: string; orderId: string;
  externalOrderId: string | null; status: string;
  /** The xMoney system whose key decrypted the notice (connectors.xmoneyEnvironment). */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
}>;
export type OutboxJob = Readonly<{
  jobId: string; kind: OutboxKind; ref: string; payload: OutboxPayload; createdAt: Date; notBefore: Date;
  attempts: number; claimedBy: string | null; claimedAt: Date | null;
}>;
/**
 * P16b's row (R-31): one SALE per SUCCEEDED event of an INITIAL, RENEWAL or UPGRADE charge (`amountMicros` = the
 * charge total), one REFUND per REFUNDED event (`amountMicros` = the refunded amount), one CHARGEBACK per CHARGEBACK
 * event on a charge with no CHARGEBACK_RESOLVED (`amountMicros` = the event's amount, else the charge total). Only
 * charges of the xMoney system `quarterSummaryRows` is asked for: a sandbox payment is never a sale. `at` is when
 * xMoney says the money moved (the event's `xmoney_created_at`, present only on a SUCCEEDED or on a REFUNDED that is
 * its own refund transaction), else when it was recorded — so a refund or charge-back of the payment itself is dated
 * when it was recorded, never by the payment's date. Tax fields come from the charge's quote, money fields from the
 * charge, the verdict from its location evidence (null when none). `amountKnown` is false on exactly one shape: a
 * REFUND that D6a's P9c recorded for a refund made in the xMoney dashboard on the payment itself (error code
 * `PROVIDER_REFUND`, no `refunds_transaction_id`), because xMoney's read named no amount and P9c wrote what was left
 * of the charge, an upper bound — P16b lists such a row instead of subtracting it. Every other row is true, a
 * `PROVIDER_REFUND` on xMoney's own refund transaction and a `PROVIDER_VOID` included.
 */
export type TaxSummaryRow = Readonly<{
  type: "SALE" | "REFUND" | "CHARGEBACK"; chargeId: string; at: Date;
  taxCountry: string; taxRegion: string | null; taxStatus: TaxStatus;
  chargeNetMicros: number; chargeTaxMicros: number; chargeTotalMicros: number; amountMicros: number;
  amountKnown: boolean;
  locationVerdict: LocationVerdict | null;
}>;
/** Where the previous page of due renewals ended: the order is (currentPeriodEnd, subscriptionId). */
export type DueRenewalCursor = Readonly<{ periodEnd: Date; subscriptionId: string }>;
export type DueRenewalsOptions = Readonly<{
  /** REQUIRED: stage and live are two xMoney systems; a renewal pass only ever rebills its own system's orders. */
  environment: CustomerXMoneyEnvironment;
  after?: DueRenewalCursor | null;
  /** Called once per subscription whose history does not fold (the id only); it is left out, the rest go on. */
  onInvalid?: (subscriptionId: string) => void;
}>;
/** The claim a worker holds: its id and the attempt number `claim` gave it. */
export type OutboxClaimFence = Readonly<{ workerId: string; attempts: number }>;

const CLAIM_LEASE_MS = 300_000;
const TERMINAL_KINDS = ["ENDED", "WITHDRAWN", "ERASURE_STOPPED"] as const;

function micros(value: string | number | null | undefined): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed)) {
    throw new TypedDomainError("BILLING_ROW_INVALID", "a billing amount is not a safe integer");
  }
  return parsed;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

function refundRefusal(error: unknown): boolean {
  return typeof error === "object" && error !== null
    && (error as { code?: unknown }).code === "23514"
    && (error as { message?: unknown }).message === "REFUND_EXCEEDS_CHARGE";
}

type SubscriptionEventRaw = {
  event_id: string; seq: string; subscription_id: string; owner_ref: string; kind: SubscriptionEventKind; at: Date;
  plan_id: PlanId; period_anchor_at: Date | null; xmoney_order_id: string | null; xmoney_customer_id: string | null;
  card_ref: string | null; data: Record<string, string | number | boolean | null>;
};
type ChargeRaw = {
  charge_id: string; owner_ref: string; subscription_id: string; kind: ChargeKind; attempt: number;
  period_start: Date; period_end: Date; quote_id: string | null; net_micros: string; tax_micros: string;
  total_micros: string; currency: "USD"; created_at: Date; xmoney_environment: CustomerXMoneyEnvironment;
};
type ChargeEventRaw = {
  event_id: string; charge_id: string; kind: ChargeEventKind; at: Date; xmoney_transaction_id: string | null;
  amount_micros: string | null; error_code: string | null; xmoney_environment: CustomerXMoneyEnvironment;
  refunds_transaction_id: string | null;
};
type QuoteRaw = {
  quote_id: string; owner_ref: string; plan_id: PlanId; kind: QuoteKind; net_micros: string; tax_micros: string;
  total_micros: string; tax_country: string; tax_region: string | null; tax_rate_bp: string; tax_status: TaxStatus;
  tax_name: string; quaderno_ref: string | null; created_at: Date; expires_at: Date; location_ciphertext: Buffer;
  key_id: string; recurring_total_micros: string | null;
};
type OutboxRaw = {
  job_id: string; kind: OutboxKind; ref: string; payload: Record<string, string | number | boolean | null>;
  created_at: Date; not_before: Date; attempts: number; claimed_by: string | null; claimed_at: Date | null;
};
type InvoiceRaw = {
  invoice_id: string; charge_id: string; issuer: InvoiceIssuerName; kind: InvoiceKind; external_ref: string;
  series: string | null; number: string; url: string | null; total_micros: string; at: Date;
};

const SUBSCRIPTION_EVENT_COLUMNS = `event.event_id, event.seq, event.subscription_id, event.owner_ref, event.kind,
  event.at, event.plan_id, event.period_anchor_at, event.xmoney_order_id, event.xmoney_customer_id, event.card_ref,
  event.data`;
const CHARGE_COLUMNS = `charge.charge_id, charge.owner_ref, charge.subscription_id, charge.kind, charge.attempt,
  charge.period_start, charge.period_end, charge.quote_id, charge.net_micros, charge.tax_micros, charge.total_micros,
  charge.currency, charge.created_at, charge.xmoney_environment`;

function toSubscriptionEvent(row: SubscriptionEventRaw): SubscriptionEvent {
  return Object.freeze({
    eventId: row.event_id, subscriptionId: row.subscription_id, ownerRef: row.owner_ref, kind: row.kind, at: row.at,
    planId: row.plan_id, periodAnchorAt: row.period_anchor_at, xmoneyOrderId: row.xmoney_order_id,
    xmoneyCustomerId: row.xmoney_customer_id, cardRef: row.card_ref, data: Object.freeze({ ...row.data })
  });
}
function toCharge(row: ChargeRaw): ChargeRow {
  return Object.freeze({
    chargeId: row.charge_id, ownerRef: row.owner_ref, subscriptionId: row.subscription_id, kind: row.kind,
    attempt: row.attempt, periodStart: row.period_start, periodEnd: row.period_end, quoteId: row.quote_id,
    netMicros: micros(row.net_micros), taxMicros: micros(row.tax_micros), totalMicros: micros(row.total_micros),
    currency: row.currency, createdAt: row.created_at, xmoneyEnvironment: row.xmoney_environment
  });
}
function toChargeEvent(row: ChargeEventRaw): ChargeEventRow {
  return Object.freeze({
    eventId: row.event_id, chargeId: row.charge_id, kind: row.kind, at: row.at,
    xmoneyTransactionId: row.xmoney_transaction_id,
    amountMicros: row.amount_micros === null ? null : micros(row.amount_micros), errorCode: row.error_code,
    xmoneyEnvironment: row.xmoney_environment, refundsTransactionId: row.refunds_transaction_id
  });
}
function toOutboxJob(row: OutboxRaw): OutboxJob {
  return Object.freeze({
    jobId: row.job_id, kind: row.kind, ref: row.ref, payload: Object.freeze({ ...row.payload }),
    createdAt: row.created_at, notBefore: row.not_before, attempts: row.attempts, claimedBy: row.claimed_by,
    claimedAt: row.claimed_at
  });
}

function groupBySubscription(rows: ReadonlyArray<SubscriptionEventRaw>): SubscriptionEventRaw[][] {
  const groups = new Map<string, SubscriptionEventRaw[]>();
  for (const row of rows) {
    const group = groups.get(row.subscription_id);
    if (group === undefined) groups.set(row.subscription_id, [row]);
    else group.push(row);
  }
  return [...groups.values()];
}

/** STRICT: groups rows ordered by (subscription_id, seq) and folds each; an illegal history throws. */
function foldAll(rows: ReadonlyArray<SubscriptionEventRaw>): Array<{ state: SubscriptionState; lastSeq: bigint }> {
  return groupBySubscription(rows).map((group) => ({
    state: foldSubscription(group.map(toSubscriptionEvent)),
    lastSeq: BigInt(group[group.length - 1]!.seq)
  }));
}

/**
 * TOLERANT, for the passes over everyone (renewals, the stage-to-live check): a subscription whose history does
 * not fold is handed to `onInvalid` and left out; any other error still throws.
 */
function foldEach(
  rows: ReadonlyArray<SubscriptionEventRaw>, onInvalid: (subscriptionId: string) => void
): SubscriptionState[] {
  const states: SubscriptionState[] = [];
  for (const group of groupBySubscription(rows)) {
    try {
      states.push(foldSubscription(group.map(toSubscriptionEvent)));
    } catch (error) {
      if (!(error instanceof TypedDomainError && error.code === "BILLING_SUBSCRIPTION_EVENTS_INVALID")) throw error;
      onInvalid(group[0]!.subscription_id);
    }
  }
  return states;
}

export class BillingRepository {
  /** `private`, not `#`: later tasks add methods to this class that query `this.pool` (P12a, P13, P14a, P15, P16b). */
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  withTransaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return withWriteTransaction(this.pool, fn);
  }

  /**
   * `withTransaction` on a connection the caller already holds (P12c: the subscription lease's own), so a lease
   * holder never waits on the pool for a second connection. The caller keeps and releases the connection.
   */
  withTransactionOn<T>(client: PoolClient, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return withWriteTransactionOn(client, fn);
  }

  /**
   * P12c/P14b (A6): the month-credit override in force for this subscription's plan in the current period — the
   * one on its latest entitlement event of that plan effective in [since, until] — or null (the plan's own credit).
   * A settlement reads it on VERIFY_PAYMENT's own connection (`executor`).
   */
  async periodCreditOverride(
    input: Readonly<{ subscriptionId: string; planId: string; since: Date; until: Date }>,
    executor: BillingReadExecutor = this.pool
  ): Promise<number | null> {
    const row = (await executor.query<{ override: string | null }>(`
      SELECT month_credit_override_micros::text AS override
      FROM billing.entitlement_event
      WHERE subscription_id = $1 AND plan_id = $2 AND effective_at >= $3 AND effective_at <= $4
      ORDER BY effective_at DESC, recorded_at DESC
      LIMIT 1
    `, [input.subscriptionId, input.planId, input.since, input.until])).rows[0];
    return row === undefined || row.override === null ? null : micros(row.override);
  }

  /**
   * P12a (A18). Consumes one WITHDRAW_SUBSCRIPTION grant for this account and
   * session, inside the caller's transaction, so the grant is spent exactly when
   * WITHDRAWN is written and never otherwise.
   */
  async consumeWithdrawalGrant(client: PoolClient, input: Readonly<{
    userId: string; ownerRef: string; sessionId: string; grantTokenHash: string;
  }>): Promise<boolean> {
    const result = await client.query<{ consumed: boolean }>(
      "SELECT billing.consume_withdrawal_grant($1,$2,$3,$4) AS consumed",
      [input.userId, input.ownerRef, input.sessionId, input.grantTokenHash]
    );
    return result.rows[0]?.consumed === true;
  }

  /**
   * The one customer row per owner, and the xMoney customer linked in `environment` — `null` when that environment
   * has none yet (a fresh start, or the first live checkout after stage), so the caller creates one there (R-14).
   */
  async ensureCustomer(
    c: PoolClient,
    i: Readonly<{ ownerRef: string; locale: string; now: Date; environment: CustomerXMoneyEnvironment }>
  ): Promise<{ customerId: string; xmoneyCustomerId: string | null }> {
    await c.query(`
      INSERT INTO billing.customer (customer_id, owner_ref, created_at, created_locale)
      VALUES ($1, $2, $3, $4) ON CONFLICT (owner_ref) DO NOTHING
    `, [randomUUID(), i.ownerRef, i.now, i.locale]);
    const row = (await c.query<{ customer_id: string; xmoney_customer_id: string | null }>(`
      SELECT customer.customer_id,
        (SELECT link.xmoney_customer_id FROM billing.customer_xmoney AS link
          WHERE link.customer_id = customer.customer_id AND link.environment = $2) AS xmoney_customer_id
      FROM billing.customer AS customer WHERE customer.owner_ref = $1
    `, [i.ownerRef, i.environment])).rows[0];
    if (row === undefined) throw new TypedDomainError("BILLING_CUSTOMER_UNRESOLVED", "the billing customer was not created");
    return Object.freeze({ customerId: row.customer_id, xmoneyCustomerId: row.xmoney_customer_id });
  }

  /** R-14: the first link per environment wins; a repeat of the same link is a no-op. */
  async setXMoneyCustomerId(
    c: PoolClient, customerId: string, xmoneyCustomerId: string, environment: CustomerXMoneyEnvironment
  ): Promise<void> {
    await c.query(`
      INSERT INTO billing.customer_xmoney (customer_id, environment, xmoney_customer_id, at)
      VALUES ($1, $2, $3, clock_timestamp()) ON CONFLICT (customer_id, environment) DO NOTHING
    `, [customerId, environment, xmoneyCustomerId]);
  }

  async appendProfile(c: PoolClient, i: Readonly<{
    customerId: string; at: Date; locale: string; profileCiphertext: Buffer; keyId: string;
  }>): Promise<void> {
    await c.query(`
      INSERT INTO billing.customer_profile_event (customer_id, at, locale, profile_ciphertext, key_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [i.customerId, i.at, i.locale, i.profileCiphertext, i.keyId]);
  }

  async latestProfile(
    customerId: string, executor: BillingReadExecutor = this.pool
  ): Promise<{ profileCiphertext: Buffer; keyId: string; at: Date; locale: string } | null> {
    const row = (await executor.query<{ profile_ciphertext: Buffer; key_id: string; at: Date; locale: string }>(`
      SELECT profile.profile_ciphertext, profile.key_id, profile.at, profile.locale
      FROM billing.customer_profile_event AS profile
      WHERE profile.customer_id = $1 ORDER BY profile.seq DESC LIMIT 1
    `, [customerId])).rows[0];
    return row === undefined ? null : Object.freeze({
      profileCiphertext: row.profile_ciphertext, keyId: row.key_id, at: row.at, locale: row.locale
    });
  }

  /**
   * `xmoneyCustomerId` is the link in `environment`; without `environment`, the most recent link of any
   * environment (for callers that need only `customerId` and `locale`).
   */
  async customerByOwner(
    ownerRef: string, environment?: CustomerXMoneyEnvironment, executor: BillingReadExecutor = this.pool
  ): Promise<{ customerId: string; xmoneyCustomerId: string | null; locale: string } | null> {
    const row = (await executor.query<{ customer_id: string; xmoney_customer_id: string | null; locale: string }>(`
      SELECT customer.customer_id,
        (SELECT link.xmoney_customer_id FROM billing.customer_xmoney AS link
          WHERE link.customer_id = customer.customer_id AND ($2::text IS NULL OR link.environment = $2::text)
          ORDER BY link.at DESC LIMIT 1) AS xmoney_customer_id,
        COALESCE((SELECT profile.locale FROM billing.customer_profile_event AS profile
          WHERE profile.customer_id = customer.customer_id ORDER BY profile.seq DESC LIMIT 1),
          customer.created_locale) AS locale
      FROM billing.customer AS customer WHERE customer.owner_ref = $1
    `, [ownerRef, environment ?? null])).rows[0];
    return row === undefined ? null : Object.freeze({
      customerId: row.customer_id, xmoneyCustomerId: row.xmoney_customer_id, locale: row.locale
    });
  }

  async insertQuote(c: PoolClient, q: QuoteRow): Promise<void> {
    await c.query(`
      INSERT INTO billing.quote (quote_id, owner_ref, plan_id, kind, net_micros, tax_micros, total_micros,
        tax_country, tax_region, tax_rate_bp, tax_status, tax_name, quaderno_ref, created_at, expires_at,
        location_ciphertext, key_id, recurring_total_micros)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    `, [q.quoteId, q.ownerRef, q.planId, q.kind, q.netMicros, q.taxMicros, q.totalMicros, q.taxCountry,
      q.taxRegion, q.taxRateBasisPoints, q.taxStatus, q.taxName, q.quadernoRef, q.createdAt, q.expiresAt,
      q.locationCiphertext, q.keyId, q.recurringTotalMicros ?? null]);
  }

  async quote(quoteId: string, ownerRef: string, executor: BillingReadExecutor = this.pool): Promise<QuoteRow | null> {
    const row = (await executor.query<QuoteRaw>(`
      SELECT quote_id, owner_ref, plan_id, kind, net_micros, tax_micros, total_micros, tax_country, tax_region,
        tax_rate_bp, tax_status, tax_name, quaderno_ref, created_at, expires_at, location_ciphertext, key_id,
        recurring_total_micros
      FROM billing.quote WHERE quote_id = $1 AND owner_ref = $2
    `, [quoteId, ownerRef])).rows[0];
    if (row === undefined) return null;
    return Object.freeze({
      quoteId: row.quote_id, ownerRef: row.owner_ref, planId: row.plan_id, kind: row.kind,
      netMicros: micros(row.net_micros), taxMicros: micros(row.tax_micros), totalMicros: micros(row.total_micros),
      taxCountry: row.tax_country, taxRegion: row.tax_region, taxRateBasisPoints: Number(row.tax_rate_bp),
      taxStatus: row.tax_status, taxName: row.tax_name, quadernoRef: row.quaderno_ref, createdAt: row.created_at,
      expiresAt: row.expires_at, locationCiphertext: row.location_ciphertext, keyId: row.key_id,
      recurringTotalMicros: row.recurring_total_micros === null ? null : micros(row.recurring_total_micros)
    });
  }

  /** A3a: a quote pays for exactly one checkout. */
  async useQuote(c: PoolClient, i: Readonly<{ quoteId: string; usedAt: Date; chargeId: string }>): Promise<"USED" | "ALREADY_USED"> {
    const result = await c.query(`
      INSERT INTO billing.quote_use (quote_id, used_at, charge_id) VALUES ($1, $2, $3)
      ON CONFLICT (quote_id) DO NOTHING RETURNING quote_id
    `, [i.quoteId, i.usedAt, i.chargeId]);
    return result.rowCount === 1 ? "USED" : "ALREADY_USED";
  }

  /**
   * Appends only what the history can take. Under the owner lock every billing writer already holds (A3(b);
   * re-entrant within the transaction), the committed events are read THROUGH `c` — so several events of one
   * transaction are checked together — and folded with the new one; BILLING_SUBSCRIPTION_EVENTS_INVALID propagates
   * before anything is written. The table is append-only: an illegal event written once could never be removed.
   */
  async appendSubscriptionEvent(c: PoolClient, e: SubscriptionEvent): Promise<void> {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('debateai.billing.owner:' || $1::text, 0))", [e.ownerRef]);
    const stored = (await c.query<SubscriptionEventRaw>(`
      SELECT ${SUBSCRIPTION_EVENT_COLUMNS} FROM billing.subscription_event AS event
      WHERE event.subscription_id = $1 ORDER BY event.seq
    `, [e.subscriptionId])).rows.map(toSubscriptionEvent);
    foldSubscription([...stored, e]);
    await c.query(`
      INSERT INTO billing.subscription_event (event_id, subscription_id, owner_ref, kind, at, plan_id,
        period_anchor_at, xmoney_order_id, xmoney_customer_id, card_ref, data)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
    `, [e.eventId, e.subscriptionId, e.ownerRef, e.kind, e.at, e.planId, e.periodAnchorAt, e.xmoneyOrderId,
      e.xmoneyCustomerId, e.cardRef, JSON.stringify(e.data)]);
  }

  async subscriptionEvents(subscriptionId: string, executor: BillingReadExecutor = this.pool): Promise<SubscriptionEvent[]> {
    const rows = (await executor.query<SubscriptionEventRaw>(`
      SELECT ${SUBSCRIPTION_EVENT_COLUMNS} FROM billing.subscription_event AS event
      WHERE event.subscription_id = $1 ORDER BY event.seq
    `, [subscriptionId])).rows;
    return rows.map(toSubscriptionEvent);
  }

  /**
   * EVERY subscription of the owner, folded, newest first (highest last event `seq`). STRICT like
   * `subscriptionForOwner`: a history that does not fold is refused (BILLING_SUBSCRIPTION_EVENTS_INVALID). D6a's
   * INITIAL settlement reads it: a newer CREATED checkout must not hide an ACTIVE subscription.
   */
  async subscriptionsForOwner(ownerRef: string, executor: BillingReadExecutor = this.pool): Promise<SubscriptionState[]> {
    const rows = (await executor.query<SubscriptionEventRaw>(`
      SELECT ${SUBSCRIPTION_EVENT_COLUMNS} FROM billing.subscription_event AS event
      WHERE event.owner_ref = $1 ORDER BY event.subscription_id, event.seq
    `, [ownerRef])).rows;
    return foldAll(rows)
      .sort((left, right) => (left.lastSeq < right.lastSeq ? 1 : left.lastSeq > right.lastSeq ? -1 : 0))
      .map((entry) => entry.state);
  }

  /**
   * STRICT on purpose: an owner whose history does not fold is refused (BILLING_SUBSCRIPTION_EVENTS_INVALID), so
   * that one owner fails closed and is never offered a second subscription beside a broken one.
   */
  async subscriptionForOwner(ownerRef: string, executor: BillingReadExecutor = this.pool): Promise<SubscriptionState | null> {
    const folded = await this.subscriptionsForOwner(ownerRef, executor);
    const live = folded.find((state) => state.status !== "ENDED" && state.status !== "WITHDRAWN");
    return live ?? folded[0] ?? null;
  }

  /**
   * TOLERANT: one subscription whose history does not fold is reported through `onInvalid` and left out before any
   * filter or limit, so it can neither stop the pass nor take a slot. Ordered by (currentPeriodEnd, subscriptionId);
   * `after` continues from the previous page (the caller pages until a page is shorter than `limit`).
   */
  async dueRenewals(now: Date, horizonMs: number, limit: number, options: DueRenewalsOptions): Promise<SubscriptionState[]> {
    const rows = (await this.pool.query<SubscriptionEventRaw>(`
      SELECT ${SUBSCRIPTION_EVENT_COLUMNS} FROM billing.subscription_event AS event
      WHERE event.subscription_id IN (
        SELECT latest.subscription_id FROM billing.subscription_latest_v AS latest
        WHERE latest.kind <> ALL($1::text[])
      )
      AND event.subscription_id IN (
        SELECT created.subscription_id FROM billing.subscription_event AS created
        WHERE created.kind = 'CREATED' AND created.data ->> 'xmoney_environment' = $2
      )
      ORDER BY event.subscription_id, event.seq
    `, [[...TERMINAL_KINDS], options.environment])).rows;
    const edge = now.getTime() + horizonMs;
    const after = options.after ?? null;
    const candidates = foldEach(rows, (subscriptionId) => options.onInvalid?.(subscriptionId)).filter((state) => {
      if (state.xmoneyEnvironment !== options.environment) return false;
      if (state.status !== "ACTIVE" || state.cancelRequested || state.currentPeriodEnd === null) return false;
      const dueAt = Math.max(state.currentPeriodEnd.getTime(), state.renewalPostponedUntil?.getTime() ?? 0);
      return dueAt <= edge;
    });
    if (candidates.length === 0) return [];
    const charged = new Set((await this.pool.query<{ subscription_id: string; period_start: Date }>(`
      SELECT charge.subscription_id, charge.period_start FROM billing.charge AS charge
      WHERE charge.kind = 'RENEWAL' AND charge.subscription_id = ANY($1::uuid[])
    `, [candidates.map((state) => state.subscriptionId)])).rows
      .map((row) => `${row.subscription_id}@${row.period_start.getTime()}`));
    return candidates
      .filter((state) => !charged.has(`${state.subscriptionId}@${state.currentPeriodEnd!.getTime()}`))
      .filter((state) => after === null || state.currentPeriodEnd!.getTime() > after.periodEnd.getTime()
        || (state.currentPeriodEnd!.getTime() === after.periodEnd.getTime() && state.subscriptionId > after.subscriptionId))
      .sort((left, right) => left.currentPeriodEnd!.getTime() - right.currentPeriodEnd!.getTime()
        || (left.subscriptionId < right.subscriptionId ? -1 : left.subscriptionId > right.subscriptionId ? 1 : 0))
      .slice(0, Math.max(0, limit));
  }

  /**
   * What is still open in one xMoney system: subscriptions not ENDED/WITHDRAWN and not ACTIVE with a cancel pending
   * (one whose history does not fold counts as open), and charges with no SUCCEEDED/FAILED event whose subscription
   * is not ENDED/WITHDRAWN. P6a refuses a live boot while anything stage is open.
   */
  async openRecordCounts(environment: CustomerXMoneyEnvironment): Promise<{ subscriptions: number; charges: number }> {
    const rows = (await this.pool.query<SubscriptionEventRaw>(`
      SELECT ${SUBSCRIPTION_EVENT_COLUMNS} FROM billing.subscription_event AS event
      WHERE event.subscription_id IN (
        SELECT created.subscription_id FROM billing.subscription_event AS created
        WHERE created.kind = 'CREATED' AND created.data ->> 'xmoney_environment' = $1
      )
      ORDER BY event.subscription_id, event.seq
    `, [environment])).rows;
    let subscriptions = 0;
    const settled = new Set<string>();
    for (const state of foldEach(rows, () => { subscriptions += 1; })) {
      if (state.status === "ENDED" || state.status === "WITHDRAWN") settled.add(state.subscriptionId);
      else if (!(state.status === "ACTIVE" && state.cancelRequested)) subscriptions += 1;
    }
    const open = (await this.pool.query<{ subscription_id: string }>(`
      SELECT charge.subscription_id FROM billing.charge AS charge
      WHERE charge.xmoney_environment = $1
        AND NOT EXISTS (
          SELECT 1 FROM billing.charge_event AS final
          WHERE final.charge_id = charge.charge_id AND final.kind IN ('SUCCEEDED','FAILED')
        )
    `, [environment])).rows;
    return { subscriptions, charges: open.filter((row) => !settled.has(row.subscription_id)).length };
  }

  async insertCharge(c: PoolClient, ch: ChargeRow): Promise<void> {
    try {
      await c.query(`
        INSERT INTO billing.charge (charge_id, owner_ref, subscription_id, kind, attempt, period_start, period_end,
          quote_id, net_micros, tax_micros, total_micros, currency, created_at, xmoney_environment)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [ch.chargeId, ch.ownerRef, ch.subscriptionId, ch.kind, ch.attempt, ch.periodStart, ch.periodEnd, ch.quoteId,
        ch.netMicros, ch.taxMicros, ch.totalMicros, ch.currency, ch.createdAt, ch.xmoneyEnvironment]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TypedDomainError("BILLING_CHARGE_DUPLICATE", "this charge or this attempt already exists");
      }
      throw error;
    }
  }

  /**
   * DUPLICATE for any unique conflict: a replay of (system, transaction, kind), a second SUCCEEDED of the charge, or
   * a transaction that already paid. After a DUPLICATE to a SUCCEEDED, `succeededTransaction` says which payment is
   * the recorded one. The event's xMoney system is the charge's.
   */
  async appendChargeEvent(c: PoolClient, e: ChargeEventInput): Promise<"INSERTED" | "DUPLICATE"> {
    const charge = (await c.query<{ xmoney_environment: CustomerXMoneyEnvironment }>(
      "SELECT xmoney_environment FROM billing.charge WHERE charge_id = $1", [e.chargeId]
    )).rows[0];
    if (charge === undefined) throw new TypedDomainError("BILLING_CHARGE_UNKNOWN", "a charge event names no known charge");
    try {
      const result = await c.query(`
        INSERT INTO billing.charge_event (event_id, charge_id, kind, at, xmoney_transaction_id, amount_micros, error_code,
          xmoney_environment, refunds_transaction_id, xmoney_created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING event_id
      `, [e.eventId ?? randomUUID(), e.chargeId, e.kind, e.at, e.xmoneyTransactionId, e.amountMicros, e.errorCode,
        charge.xmoney_environment, e.refundsTransactionId ?? null, e.xmoneyCreatedAt ?? null]);
      return result.rowCount === 1 ? "INSERTED" : "DUPLICATE";
    } catch (error) {
      if (refundRefusal(error)) {
        throw new TypedDomainError("REFUND_EXCEEDS_CHARGE", "the refunds of this charge would exceed what it took");
      }
      throw error;
    }
  }

  /** The recorded SUCCEEDED payment's transaction, read in the caller's transaction (after a DUPLICATE answer). */
  async succeededTransaction(c: PoolClient, chargeId: string): Promise<string | null> {
    const row = (await c.query<{ xmoney_transaction_id: string }>(`
      SELECT xmoney_transaction_id FROM billing.charge_event WHERE charge_id = $1 AND kind = 'SUCCEEDED'
    `, [chargeId])).rows[0];
    return row?.xmoney_transaction_id ?? null;
  }

  /** Both queries run on `executor`, so a caller inside its transaction reads one consistent view. */
  async charge(chargeId: string, executor: BillingReadExecutor = this.pool): Promise<(ChargeRow & { events: ChargeEventRow[] }) | null> {
    const row = (await executor.query<ChargeRaw>(`
      SELECT ${CHARGE_COLUMNS} FROM billing.charge AS charge WHERE charge.charge_id = $1
    `, [chargeId])).rows[0];
    if (row === undefined) return null;
    const events = (await executor.query<ChargeEventRaw>(`
      SELECT event_id, charge_id, kind, at, xmoney_transaction_id, amount_micros, error_code, xmoney_environment,
        refunds_transaction_id
      FROM billing.charge_event WHERE charge_id = $1 ORDER BY seq
    `, [chargeId])).rows.map(toChargeEvent);
    return Object.freeze({ ...toCharge(row), events });
  }

  async chargesForSubscription(subscriptionId: string, executor: BillingReadExecutor = this.pool): Promise<ChargeRow[]> {
    return (await executor.query<ChargeRaw>(`
      SELECT ${CHARGE_COLUMNS} FROM billing.charge AS charge
      WHERE charge.subscription_id = $1 ORDER BY charge.created_at, charge.charge_id
    `, [subscriptionId])).rows.map(toCharge);
  }

  async insertLocationEvidence(c: PoolClient, e: LocationEvidenceRow): Promise<void> {
    await c.query(`
      INSERT INTO billing.location_evidence (charge_id, ip_country, declared_country, card_country, verdict,
        ip_ciphertext, key_id, at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [e.chargeId, e.ipCountry, e.declaredCountry, e.cardCountry, e.verdict, e.ipCiphertext, e.keyId, e.at]);
  }

  /** A17a: the intent is committed BEFORE the issuer is called. */
  async insertInvoiceIntent(c: PoolClient, i: InvoiceIntentRow): Promise<"INSERTED" | "DUPLICATE"> {
    const result = await c.query(`
      INSERT INTO billing.invoice_intent (charge_id, kind, issuer, requested_at) VALUES ($1,$2,$3,$4)
      ON CONFLICT (charge_id, kind) DO NOTHING RETURNING charge_id
    `, [i.chargeId, i.kind, i.issuer, i.requestedAt]);
    return result.rowCount === 1 ? "INSERTED" : "DUPLICATE";
  }

  async insertInvoice(c: PoolClient, i: InvoiceRow): Promise<void> {
    await c.query(`
      INSERT INTO billing.invoice (invoice_id, charge_id, kind, issuer, external_ref, series, number, url,
        total_micros, at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [i.invoiceId, i.chargeId, i.kind, i.issuer, i.externalRef, i.series, i.number, i.url, i.totalMicros, i.at]);
  }

  /** A21: the e-Factura status is its own event, never a later UPDATE. */
  async appendInvoiceStatus(c: PoolClient, i: Readonly<{ invoiceId: string; at: Date; efacturaStatus: string }>): Promise<void> {
    await c.query(`
      INSERT INTO billing.invoice_status_event (invoice_id, at, efactura_status) VALUES ($1,$2,$3)
    `, [i.invoiceId, i.at, i.efacturaStatus]);
  }

  async invoicesForOwner(ownerRef: string): Promise<InvoiceRow[]> {
    return (await this.pool.query<InvoiceRaw>(`
      SELECT invoice.invoice_id, invoice.charge_id, invoice.issuer, invoice.kind, invoice.external_ref,
        invoice.series, invoice.number, invoice.url, invoice.total_micros, invoice.at
      FROM billing.invoice AS invoice JOIN billing.charge AS charge ON charge.charge_id = invoice.charge_id
      WHERE charge.owner_ref = $1 ORDER BY invoice.at DESC, invoice.invoice_id
    `, [ownerRef])).rows.map((row) => Object.freeze({
      invoiceId: row.invoice_id, chargeId: row.charge_id, issuer: row.issuer, kind: row.kind,
      externalRef: row.external_ref, series: row.series, number: row.number, url: row.url,
      totalMicros: micros(row.total_micros), at: row.at
    }));
  }

  async insertNotice(c: PoolClient, n: NoticeRow): Promise<"INSERTED" | "DUPLICATE"> {
    const result = await c.query(`
      INSERT INTO billing.xmoney_notice (notice_id, received_at, payload_sha256, transaction_id, order_id,
        external_order_id, status, xmoney_environment)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (payload_sha256) DO NOTHING RETURNING notice_id
    `, [n.noticeId, n.receivedAt, n.payloadSha256, n.transactionId, n.orderId, n.externalOrderId, n.status,
      n.xmoneyEnvironment]);
    return result.rowCount === 1 ? "INSERTED" : "DUPLICATE";
  }

  /** A21: processing a notice is recorded as a following row. */
  async recordNoticeOutcome(c: PoolClient, i: Readonly<{ noticeId: string; at: Date; outcome: string }>): Promise<void> {
    await c.query(`
      INSERT INTO billing.xmoney_notice_outcome (notice_id, at, outcome) VALUES ($1,$2,$3)
      ON CONFLICT (notice_id) DO NOTHING
    `, [i.noticeId, i.at, i.outcome]);
  }

  async enqueue(c: PoolClient, j: Readonly<{
    kind: OutboxKind; ref: string; notBefore: Date; payload: OutboxPayload;
  }>): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const inserted = await c.query<{ job_id: string }>(`
        INSERT INTO billing.outbox (job_id, kind, ref, payload, created_at, not_before)
        VALUES ($1, $2, $3, $4::jsonb, clock_timestamp(), $5)
        ON CONFLICT (kind, ref) WHERE done_at IS NULL AND dead_at IS NULL DO NOTHING
        RETURNING job_id
      `, [randomUUID(), j.kind, j.ref, JSON.stringify(j.payload), j.notBefore]);
      if (inserted.rows[0] !== undefined) return inserted.rows[0].job_id;
      const live = (await c.query<{ job_id: string }>(`
        SELECT job_id FROM billing.outbox WHERE kind = $1 AND ref = $2 AND done_at IS NULL AND dead_at IS NULL
      `, [j.kind, j.ref])).rows[0];
      if (live !== undefined) return live.job_id;
    }
    throw new TypedDomainError("BILLING_OUTBOX_ENQUEUE_RACED", "the live job changed twice while it was enqueued");
  }

  async claim(kinds: ReadonlyArray<OutboxKind>, limit: number, workerId: string, now: Date): Promise<OutboxJob[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new TypedDomainError("BILLING_OUTBOX_LIMIT_INVALID", "a claim takes between 1 and 100 jobs");
    }
    const rows = (await this.pool.query<OutboxRaw>(`
      WITH candidate AS (
        SELECT job.job_id FROM billing.outbox AS job
        WHERE job.kind = ANY($1::text[]) AND job.done_at IS NULL AND job.dead_at IS NULL
          AND job.not_before <= $4
          AND (job.claimed_at IS NULL OR job.claimed_at <= $4::timestamptz - ($5::bigint * interval '1 millisecond'))
        ORDER BY job.not_before, job.created_at, job.job_id
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      )
      UPDATE billing.outbox AS job
      SET claimed_by = $3, claimed_at = $4, attempts = job.attempts + 1
      FROM candidate WHERE job.job_id = candidate.job_id
      RETURNING job.job_id, job.kind, job.ref, job.payload, job.created_at, job.not_before, job.attempts,
        job.claimed_by, job.claimed_at
    `, [[...kinds], limit, workerId, now, CLAIM_LEASE_MS])).rows;
    return rows.map(toOutboxJob).sort((left, right) => left.notBefore.getTime() - right.notBefore.getTime());
  }

  /**
   * Restarts the lease of a job its worker is about to run, only while the job is still that worker's claim at
   * that attempt; false means the job was reclaimed after its lease and the caller must not run it.
   */
  async renewClaim(jobId: string, workerId: string, attempts: number, now: Date): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE billing.outbox SET claimed_at = $4
      WHERE job_id = $1 AND claimed_by = $2 AND attempts = $3 AND done_at IS NULL AND dead_at IS NULL
    `, [jobId, workerId, attempts, now]);
    return result.rowCount === 1;
  }

  /** With `claim`, only the worker still holding that attempt may finish the job; false otherwise. */
  async complete(jobId: string, now: Date, claim?: OutboxClaimFence): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE billing.outbox SET done_at = $2 WHERE job_id = $1 AND done_at IS NULL AND dead_at IS NULL
        AND ($3::text IS NULL OR (claimed_by = $3 AND attempts = $4::integer))
    `, [jobId, now, claim?.workerId ?? null, claim?.attempts ?? null]);
    return result.rowCount === 1;
  }

  /** With `claim`, a stale worker cannot release or kill the job a newer worker now holds; false then. */
  async fail(jobId: string, code: string, retryAt: Date | null, now: Date, claim?: OutboxClaimFence): Promise<boolean> {
    const fence = [claim?.workerId ?? null, claim?.attempts ?? null];
    if (retryAt === null) {
      const dead = await this.pool.query(`
        UPDATE billing.outbox SET dead_at = $3, last_error_code = $2
        WHERE job_id = $1 AND done_at IS NULL AND dead_at IS NULL
          AND ($4::text IS NULL OR (claimed_by = $4 AND attempts = $5::integer))
      `, [jobId, code, now, ...fence]);
      return dead.rowCount === 1;
    }
    const released = await this.pool.query(`
      UPDATE billing.outbox SET not_before = $3, claimed_by = NULL, claimed_at = NULL, last_error_code = $2
      WHERE job_id = $1 AND done_at IS NULL AND dead_at IS NULL
        AND ($4::text IS NULL OR (claimed_by = $4 AND attempts = $5::integer))
    `, [jobId, code, retryAt, ...fence]);
    return released.rowCount === 1;
  }

  async insertCancelToken(c: PoolClient, i: Readonly<{
    tokenSha256: string; subscriptionId: string; issuedAt: Date; expiresAt: Date;
  }>): Promise<void> {
    await c.query(`
      INSERT INTO billing.cancel_token (token_sha256, subscription_id, issued_at, expires_at) VALUES ($1,$2,$3,$4)
    `, [i.tokenSha256, i.subscriptionId, i.issuedAt, i.expiresAt]);
  }

  /**
   * P13 (A25): how many cancel links one account was sent since `since` — every token of every subscription this
   * owner ever had, so a new checkout does not reset the limit.
   */
  async cancelTokensIssuedForOwnerSince(
    ownerRef: string, since: Date, executor: BillingReadExecutor = this.pool
  ): Promise<number> {
    const result = await executor.query<{ issued: string }>(`
      SELECT count(*)::text AS issued
      FROM billing.cancel_token AS token
      WHERE token.issued_at >= $2
        AND token.subscription_id IN (
          SELECT event.subscription_id FROM billing.subscription_event AS event WHERE event.owner_ref = $1
        )
    `, [ownerRef, since]);
    return Number(result.rows[0]?.issued ?? "0");
  }

  async useCancelToken(c: PoolClient, tokenSha256: string, now: Date): Promise<{ subscriptionId: string } | null> {
    const row = (await c.query<{ subscription_id: string }>(`
      WITH usable AS (
        SELECT token.token_sha256, token.subscription_id FROM billing.cancel_token AS token
        WHERE token.token_sha256 = $1 AND token.expires_at > $2
      ), used AS (
        INSERT INTO billing.cancel_token_use (token_sha256, used_at)
        SELECT usable.token_sha256, $2 FROM usable
        ON CONFLICT (token_sha256) DO NOTHING
        RETURNING token_sha256
      )
      SELECT usable.subscription_id FROM usable JOIN used ON used.token_sha256 = usable.token_sha256
    `, [tokenSha256, now])).rows[0];
    return row === undefined ? null : Object.freeze({ subscriptionId: row.subscription_id });
  }

  /**
   * The quarter's tax rows of ONE xMoney system. The environment is required: stage and live share this database
   * across the switch, and a sandbox payment is never a sale.
   */
  async quarterSummaryRows(from: Date, to: Date, environment: CustomerXMoneyEnvironment): Promise<TaxSummaryRow[]> {
    const rows = (await this.pool.query<{
      type: "SALE" | "REFUND" | "CHARGEBACK"; charge_id: string; at: Date; tax_country: string; tax_region: string | null;
      tax_status: TaxStatus; net_micros: string; tax_micros: string; total_micros: string; amount_micros: string;
      amount_known: boolean; verdict: LocationVerdict | null;
    }>(`
      WITH dated AS (
        -- When xMoney says the money moved; a row recorded without it falls back to when we recorded it.
        SELECT event.*, COALESCE(event.xmoney_created_at, event.at) AS money_at FROM billing.charge_event AS event
        WHERE event.kind IN ('SUCCEEDED','REFUNDED','CHARGEBACK')
      )
      SELECT CASE dated.kind WHEN 'SUCCEEDED' THEN 'SALE' WHEN 'REFUNDED' THEN 'REFUND' ELSE 'CHARGEBACK' END AS type,
        charge.charge_id, dated.money_at AS at, quote.tax_country, quote.tax_region, quote.tax_status,
        charge.net_micros, charge.tax_micros, charge.total_micros,
        CASE dated.kind WHEN 'SUCCEEDED' THEN charge.total_micros WHEN 'REFUNDED' THEN dated.amount_micros
          ELSE COALESCE(dated.amount_micros, charge.total_micros) END AS amount_micros,
        -- False only for P9c's dashboard refund recorded on the payment itself, whose amount is an upper bound.
        -- IS NOT DISTINCT FROM keeps a NULL error code a plain false here, so the column is never NULL.
        NOT (dated.kind = 'REFUNDED' AND dated.error_code IS NOT DISTINCT FROM 'PROVIDER_REFUND'
          AND dated.refunds_transaction_id IS NULL) AS amount_known,
        evidence.verdict
      FROM dated
      JOIN billing.charge AS charge ON charge.charge_id = dated.charge_id
      JOIN billing.quote AS quote ON quote.quote_id = charge.quote_id
      LEFT JOIN billing.location_evidence AS evidence ON evidence.charge_id = charge.charge_id
      WHERE dated.money_at >= $1 AND dated.money_at < $2
        -- Only that xMoney system's charges; the event inherits the charge's system through its foreign key.
        AND charge.xmoney_environment = $3
        AND charge.kind IN ('INITIAL','RENEWAL','UPGRADE')
        -- A refund or a charge-back of a second payment (DUPLICATE_PAYMENT) moves money that was never a sale: no
        -- tax row for it.
        AND NOT EXISTS (
          SELECT 1 FROM billing.charge_event AS duplicate
          WHERE dated.kind IN ('REFUNDED','CHARGEBACK') AND duplicate.charge_id = dated.charge_id
            AND duplicate.kind = 'DUPLICATE_PAYMENT'
            AND duplicate.xmoney_transaction_id = COALESCE(dated.refunds_transaction_id, dated.xmoney_transaction_id)
        )
        -- A charge-back a dispute has won back (CHARGEBACK_RESOLVED, the owner's billing:dispute) is no longer one.
        AND NOT EXISTS (
          SELECT 1 FROM billing.charge_event AS resolved
          WHERE dated.kind = 'CHARGEBACK' AND resolved.charge_id = dated.charge_id AND resolved.kind = 'CHARGEBACK_RESOLVED'
        )
      ORDER BY dated.money_at, charge.charge_id, dated.seq
    `, [from, to, environment])).rows;
    return rows.map((row) => Object.freeze({
      type: row.type, chargeId: row.charge_id, at: row.at, taxCountry: row.tax_country, taxRegion: row.tax_region,
      taxStatus: row.tax_status, chargeNetMicros: micros(row.net_micros), chargeTaxMicros: micros(row.tax_micros),
      chargeTotalMicros: micros(row.total_micros), amountMicros: micros(row.amount_micros),
      amountKnown: row.amount_known, locationVerdict: row.verdict
    }));
  }
}
