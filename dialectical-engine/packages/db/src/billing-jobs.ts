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

  /** The subscription's session lease (a rebill, a dunning retry, a period-end ending). */
  async withSubscriptionLease<T>(
    subscriptionId: string, use: () => Promise<T>
  ): Promise<Readonly<{ kind: "RAN"; value: T }> | Readonly<{ kind: "BUSY" }>> {
    return this.withLease(`${SUBSCRIPTION_LEASE_NAMESPACE}${subscriptionId}`, use);
  }

  /**
   * A session-level try-lock on `key`, held across an external call (a rebill, a refund call). Two API processes
   * sharing the database never both make the call: the loser gets BUSY and moves on. The lock is released before the
   * connection returns to the pool; a connection that cannot confirm the release is destroyed.
   */
  async withLease<T>(
    key: string, use: () => Promise<T>
  ): Promise<Readonly<{ kind: "RAN"; value: T }> | Readonly<{ kind: "BUSY" }>> {
    const client = await this.pool.connect();
    let failure: unknown;
    try {
      const locked = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [key]
      );
      if (locked.rows[0]?.locked !== true) return Object.freeze({ kind: "BUSY" as const });
      try {
        return Object.freeze({ kind: "RAN" as const, value: await use() });
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
