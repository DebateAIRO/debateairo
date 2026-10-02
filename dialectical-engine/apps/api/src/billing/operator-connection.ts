import { createPool, type Pool } from "@debateai/db";

/** The API's own database principal on the host (deploy/vps/README.md:178). */
const API_RUNTIME_PRINCIPAL = "debateai_prod_api_runtime";

/**
 * The billing commands read and write as the API does, and in production as no one else; a read-only command
 * also proves every transaction it opens is read-only (the serve-disclosure precedent).
 */
export async function assertBillingOperatorConnection(
  pool: Pick<Pool, "query">, options: Readonly<{ production: boolean; readOnly: boolean }>
): Promise<void> {
  const row = (await pool.query<{ role: string; read_only: string }>(
    "SELECT current_user::text AS role, current_setting('default_transaction_read_only') AS read_only"
  )).rows[0];
  if (row === undefined) throw new TypeError("BILLING_OPERATOR_CONNECTION_INVALID");
  if (options.readOnly && row.read_only !== "on") throw new TypeError("BILLING_OPERATOR_CONNECTION_NOT_READ_ONLY");
  if (options.production && row.role !== API_RUNTIME_PRINCIPAL) throw new TypeError("BILLING_OPERATOR_PRINCIPAL_INVALID");
}

/**
 * The operator pool, checked before any row is read and closed again on a refusal. One connection is enough for
 * every command today: the dispute command's reads before its transaction finish before the transaction starts, and
 * every read inside it uses the transaction's client (tests/architecture/billing-transaction-reads.test.ts). The
 * dispute command's second connection (`max: 2`) is spare capacity; the read-only tax summary keeps one. Every
 * connection is the same URL, so the principal check holds for each. A connection wait is bounded, so an exhausted
 * pool (a future read that waits on its own transaction) fails as DATABASE_POOL_FAILED instead of hanging.
 */
export async function openBillingOperatorPool(
  databaseUrl: string, options: Readonly<{ production: boolean; readOnly: boolean; max: 1 | 2 }>
): Promise<Pool> {
  const pool = createPool(databaseUrl, { max: options.max, connectionTimeoutMillis: 10_000 });
  if (options.readOnly) {
    pool.on("connect", (client) => {
      client.query("SET default_transaction_read_only = on").catch(() => undefined);
    });
  }
  try {
    await assertBillingOperatorConnection(pool, options);
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
  return pool;
}
