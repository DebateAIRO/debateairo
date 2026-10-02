import type { Pool, PoolClient } from "pg";
import type { CustomerXMoneyEnvironment } from "./billing.js";

const SUBSCRIPTION_LEASE_NAMESPACE = "debateai.billing.subscription:";

/**
 * The billing SQL that is not a table write: advisory locks and the "has this job ever existed" probe (later tasks
 * add their read queries here). `BillingRepository` (P1b) owns every billing.* table write, the outbox claim and its
 * fenced re-assert (`renewClaim`) included.
 */
export class BillingJobQueries {
  constructor(private readonly pool: Pool) {}

  /**
   * A3(b): checkout and every state change for one owner serialize on this transaction-scoped lock. The wait is
   * bounded first: a transaction that holds its pool connection while it waits must never wait for ever (production's
   * database-wide `statement_timeout` of 30 s caps it too; the dev and test databases have none). `SET LOCAL` ends
   * with the transaction, so the pooled connection goes back with its default. Every read the caller then makes
   * under the lock passes this `client` as P1b's trailing executor (P8c's architecture test holds it).
   */
  async lockOwner(client: PoolClient, ownerRef: string): Promise<void> {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('debateai.billing.owner:'||$1,0))", [ownerRef]);
  }

  /**
   * The subscription's session lease (a rebill, a dunning retry, a period-end ending, an upgrade). `use` receives the
   * lease's own connection (P12c), so a holder can run its transactions on it without a second pool connection.
   */
  async withSubscriptionLease<T>(
    subscriptionId: string, use: (client: PoolClient) => Promise<T>
  ): Promise<Readonly<{ kind: "RAN"; value: T }> | Readonly<{ kind: "BUSY" }>> {
    return this.withLease(`${SUBSCRIPTION_LEASE_NAMESPACE}${subscriptionId}`, use);
  }

  /**
   * A session-level try-lock on `key`, held across an external call (a rebill, a refund call). Two API processes
   * sharing the database never both make the call: the loser gets BUSY and moves on. The lock is released before the
   * connection returns to the pool; a connection that cannot confirm the release is destroyed. `use` is handed the
   * connection that holds the lock (P12c: `withTransactionOn` runs a holder's writes on it); the lock is released only
   * after `use` has finished with it.
   */
  async withLease<T>(
    key: string, use: (client: PoolClient) => Promise<T>
  ): Promise<Readonly<{ kind: "RAN"; value: T }> | Readonly<{ kind: "BUSY" }>> {
    const client = await this.pool.connect();
    let failure: unknown;
    try {
      const locked = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [key]
      );
      if (locked.rows[0]?.locked !== true) return Object.freeze({ kind: "BUSY" as const });
      try {
        return Object.freeze({ kind: "RAN" as const, value: await use(client) });
      } finally {
        const unlocked = await client.query<{ unlocked: boolean }>(
          "SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked", [key]
        ).catch((error: unknown) => { failure = error; return null; });
        if (unlocked !== null && unlocked.rows[0]?.unlocked !== true) {
          failure = new TypeError("BILLING_LEASE_UNLOCK_FAILED");
        }
      }
    } finally {
      client.release(failure === undefined ? undefined : failure instanceof Error ? failure : new Error("BILLING_LEASE_UNLOCK_FAILED"));
    }
  }

  /**
   * The stage an external call reached, kept in the open job's own `last_error_code` (A19 grants UPDATE on that
   * column). A later attempt tells "the call may have moved money / created the document" (the stage is still there:
   * the process died mid-call) from "the call proved nothing was sent" (the worker overwrote it with that code).
   * RefundDesk (P9b) and the SmartBill jobs (P10b, A17b) use it.
   */
  async markJobStage(jobId: string, code: string): Promise<void> {
    await this.pool.query(
      "UPDATE billing.outbox SET last_error_code=$2 WHERE job_id=$1 AND done_at IS NULL AND dead_at IS NULL", [jobId, code]
    );
  }

  async jobStage(jobId: string): Promise<string | null> {
    const result = await this.pool.query<{ last_error_code: string | null }>(
      "SELECT last_error_code FROM billing.outbox WHERE job_id=$1", [jobId]
    );
    return result.rows[0]?.last_error_code ?? null;
  }

  /** A SmartBill document (an invoice or a credit note) by the series and number SmartBill printed on it. */
  async smartBillDocument(series: string, number: string): Promise<Readonly<{
    invoiceId: string; chargeId: string; kind: "INVOICE" | "CREDIT_NOTE";
  }> | null> {
    const result = await this.pool.query<{ invoice_id: string; charge_id: string; kind: "INVOICE" | "CREDIT_NOTE" }>(
      `SELECT invoice_id, charge_id, kind FROM billing.invoice
        WHERE issuer = 'SMARTBILL' AND series = $1 AND number = $2
        ORDER BY at DESC, invoice_id LIMIT 1`,
      [series, number]
    );
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({ invoiceId: row.invoice_id, chargeId: row.charge_id, kind: row.kind });
  }

  /**
   * Spec §2.5.4 / A21: the SmartBill documents issued in [from, to) whose latest e-Factura status is not ACCEPTED
   * (none recorded, SENT_BY_ACCOUNT_SETTING, or REJECTED), oldest first. P16b's owner summary lists them, so a Romanian
   * legal document ANAF has not accepted always reaches the owner.
   */
  async smartBillDocumentsNotAccepted(from: Date, to: Date): Promise<Array<Readonly<{
    invoiceId: string; chargeId: string; kind: "INVOICE" | "CREDIT_NOTE"; series: string | null; number: string;
    at: Date; status: string | null;
  }>>> {
    const result = await this.pool.query<{
      invoice_id: string; charge_id: string; kind: "INVOICE" | "CREDIT_NOTE"; series: string | null; number: string;
      at: Date; efactura_status: string | null;
    }>(
      `SELECT i.invoice_id, i.charge_id, i.kind, i.series, i.number, i.at, latest.efactura_status
         FROM billing.invoice AS i
         LEFT JOIN LATERAL (
           SELECT s.efactura_status FROM billing.invoice_status_event AS s
            WHERE s.invoice_id = i.invoice_id ORDER BY s.at DESC, s.status_event_id DESC LIMIT 1
         ) AS latest ON true
        WHERE i.issuer = 'SMARTBILL' AND i.at >= $1 AND i.at < $2
          AND (latest.efactura_status IS NULL OR latest.efactura_status <> 'ACCEPTED')
        ORDER BY i.at, i.invoice_id`,
      [from, to]
    );
    return result.rows.map((row) => Object.freeze({
      invoiceId: row.invoice_id, chargeId: row.charge_id, kind: row.kind, series: row.series, number: row.number,
      at: row.at, status: row.efactura_status
    }));
  }

  /**
   * A1(1): the charge that recorded this xMoney transaction in an event of `kind` (any kind when null), in ONE xMoney
   * system (D5 5h): stage and live number their transactions separately, so a live id never matches a stage row.
   * The event's `xmoney_environment` is its charge's (P1a's foreign key on `(charge_id, xmoney_environment)`).
   */
  async chargeIdForTransaction(
    transactionId: string, kind: string | null, environment: CustomerXMoneyEnvironment
  ): Promise<string | null> {
    const result = await this.pool.query<{ charge_id: string }>(
      `SELECT charge_id FROM billing.charge_event
        WHERE xmoney_transaction_id=$1 AND ($2::text IS NULL OR kind=$2) AND xmoney_environment=$3
        ORDER BY at LIMIT 1`,
      [transactionId, kind, environment]
    );
    return result.rows[0]?.charge_id ?? null;
  }

  /**
   * A2: charges of these kinds, in this xMoney system (D5 5h), that were requested but carry no transaction and no
   * outcome yet: one keyset page after `after`, oldest first (D6b: paged like P14a's `adoptionCandidates`, so old
   * charges never starve fresh ones). A charge holding two or more SUBMIT_UNKNOWN events has spent A2's one extra
   * submission and is only adopted (P14a's daily pass does that too): it is left out until its close can be due,
   * when P11a lists it once more and closes it — a renewal's own charge (attempt 1) once it was created at or before
   * `renewalCloseBefore` (Q-1: 72 hours; P11a's `renewalPendingUntil` decides the exact instant, which a notice
   * postponement can make later), a dunning retry once its latest SUBMIT_UNKNOWN is at or before `closeBefore`.
   */
  async openCharges(input: Readonly<{
    environment: CustomerXMoneyEnvironment;
    kinds: ReadonlyArray<string>;
    after: Readonly<{ createdAt: Date; chargeId: string }> | null;
    closeBefore: Date;
    renewalCloseBefore: Date;
    limit: number;
  }>): Promise<Array<Readonly<{ chargeId: string; subscriptionId: string; createdAt: Date }>>> {
    const result = await this.pool.query<{ charge_id: string; subscription_id: string; created_at: Date }>(
      `SELECT c.charge_id, c.subscription_id, c.created_at FROM billing.charge c
        WHERE c.xmoney_environment = $1 AND c.kind = ANY($2::text[])
          AND ($3::timestamptz IS NULL OR (c.created_at, c.charge_id) > ($3::timestamptz, $4::text))
          AND NOT EXISTS (SELECT 1 FROM billing.charge_event e
                           WHERE e.charge_id = c.charge_id AND e.kind IN ('SUBMITTED', 'SUCCEEDED', 'FAILED'))
          AND (
            (SELECT count(*) FROM billing.charge_event u WHERE u.charge_id = c.charge_id AND u.kind = 'SUBMIT_UNKNOWN') < 2
            OR (c.attempt = 1 AND c.created_at <= $6)
            OR (c.attempt > 1
                AND (SELECT max(u.at) FROM billing.charge_event u WHERE u.charge_id = c.charge_id AND u.kind = 'SUBMIT_UNKNOWN') <= $5)
          )
        ORDER BY c.created_at, c.charge_id LIMIT $7`,
      [
        input.environment, [...input.kinds], input.after?.createdAt ?? null, input.after?.chargeId ?? null,
        input.closeBefore, input.renewalCloseBefore, input.limit
      ]
    );
    return result.rows.map((row) => Object.freeze({
      chargeId: row.charge_id, subscriptionId: row.subscription_id, createdAt: row.created_at
    }));
  }

  /**
   * Q-1 ("a rebill outcome still unknown"): the renewals of this xMoney system whose rebill answered (SUBMITTED, at
   * or before `submittedBefore`) and whose VERIFY_PAYMENT has not settled them (no SUCCEEDED, no FAILED), for a period
   * that started in `(periodStartFrom, periodStartTo]`. Only a renewal's own charge (attempt 1): a dunning retry
   * already runs on its grace. One keyset page on `(created_at, charge_id)`, like `openCharges`.
   */
  async unverifiedRenewals(input: Readonly<{
    environment: CustomerXMoneyEnvironment;
    periodStartFrom: Date;
    periodStartTo: Date;
    submittedBefore: Date;
    after: Readonly<{ createdAt: Date; chargeId: string }> | null;
    limit: number;
  }>): Promise<Array<Readonly<{ chargeId: string; subscriptionId: string; periodStart: Date; createdAt: Date }>>> {
    const result = await this.pool.query<{ charge_id: string; subscription_id: string; period_start: Date; created_at: Date }>(
      `SELECT c.charge_id, c.subscription_id, c.period_start, c.created_at FROM billing.charge c
        WHERE c.xmoney_environment = $1 AND c.kind = 'RENEWAL' AND c.attempt = 1
          AND c.period_start > $2 AND c.period_start <= $3
          AND ($5::timestamptz IS NULL OR (c.created_at, c.charge_id) > ($5::timestamptz, $6::text))
          AND EXISTS (SELECT 1 FROM billing.charge_event s
                       WHERE s.charge_id = c.charge_id AND s.kind = 'SUBMITTED' AND s.at <= $4)
          AND NOT EXISTS (SELECT 1 FROM billing.charge_event e
                           WHERE e.charge_id = c.charge_id AND e.kind IN ('SUCCEEDED', 'FAILED'))
        ORDER BY c.created_at, c.charge_id LIMIT $7`,
      [
        input.environment, input.periodStartFrom, input.periodStartTo, input.submittedBefore,
        input.after?.createdAt ?? null, input.after?.chargeId ?? null, input.limit
      ]
    );
    return result.rows.map((row) => Object.freeze({
      chargeId: row.charge_id, subscriptionId: row.subscription_id, periodStart: row.period_start, createdAt: row.created_at
    }));
  }

  /** Subscriptions whose latest event is not terminal, in id order, one page after `after`. */
  async liveSubscriptionIds(after: string | null, limit: number): Promise<string[]> {
    const result = await this.pool.query<{ subscription_id: string }>(
      `SELECT subscription_id FROM billing.subscription_latest_v
        WHERE kind NOT IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED')
          AND ($1::uuid IS NULL OR subscription_id > $1::uuid)
        ORDER BY subscription_id LIMIT $2`,
      [after, limit]
    );
    return result.rows.map((row) => row.subscription_id);
  }

  async outboxJobExists(client: PoolClient, kind: string, ref: string): Promise<boolean> {
    const result = await client.query("SELECT 1 FROM billing.outbox WHERE kind=$1 AND ref=$2 LIMIT 1", [kind, ref]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * D7 #5: whether our own rows say a payment for this INITIAL charge may be on its way: a stored notice naming it
   * (as `externalOrderId`) that is not `complete-failed` and whose transaction the charge has not recorded as FAILED,
   * or an open VERIFY_PAYMENT job for it (a notice's job names it as `external_order_id`, a rebill's as `charge_id`).
   * A not-final attempt (`start`, `in-progress`, `3d-pending`) counts only while it is fresh: a notice with such a
   * status only when received at or after `notFinalSince`, and a job the check last retried as PAYMENT_NOT_FINAL only
   * when its notice (else the job itself) is that recent. A job not run yet, and any other status, always count.
   * Read in the checkout's transaction, under the owner lock.
   */
  async checkoutPaymentSignals(
    client: PoolClient, chargeId: string, environment: CustomerXMoneyEnvironment, notFinalSince: Date
  ): Promise<boolean> {
    const result = await client.query<{ pending: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM billing.xmoney_notice AS notice
        WHERE notice.external_order_id = $1 AND notice.xmoney_environment = $2 AND notice.status <> 'complete-failed'
          AND (notice.status NOT IN ('start', 'in-progress', '3d-pending') OR notice.received_at >= $3)
          AND NOT EXISTS (
            SELECT 1 FROM billing.charge_event AS failed
            WHERE failed.charge_id = $1 AND failed.kind = 'FAILED' AND failed.xmoney_transaction_id = notice.transaction_id
          )
      ) OR EXISTS (
        SELECT 1 FROM billing.outbox AS job
        LEFT JOIN billing.xmoney_notice AS origin ON origin.notice_id::text = job.payload->>'notice_id'
        WHERE job.kind = 'VERIFY_PAYMENT' AND job.done_at IS NULL AND job.dead_at IS NULL
          AND (job.payload->>'external_order_id' = $1 OR job.payload->>'charge_id' = $1)
          AND (job.last_error_code IS DISTINCT FROM 'PAYMENT_NOT_FINAL' OR COALESCE(origin.received_at, job.created_at) >= $3)
      ) AS pending
    `, [chargeId, environment, notFinalSince]);
    return result.rows[0]?.pending === true;
  }
}
