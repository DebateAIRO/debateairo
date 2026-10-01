import type { Pool, PoolClient } from "pg";

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
}
