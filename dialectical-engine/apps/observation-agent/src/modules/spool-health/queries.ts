import pg from "pg";

export type SpoolReceiptSnapshot = Readonly<{
  state: "CURRENT" | "UNKNOWN";
  refs: readonly string[];
}>;

type QueryClient = Readonly<{
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<Readonly<{ rows: readonly Row[] }>>;
}>;

export const SPOOL_RECEIPTS_SELECT = `SELECT spool_ref
FROM obs.spool_receipt
WHERE spool_ref=ANY($1::text[])
ORDER BY spool_ref`;

export async function readSpoolReceiptsFromClient(
  client: QueryClient,
  refs: readonly string[]
): Promise<SpoolReceiptSnapshot> {
  try {
    await client.query("SET statement_timeout = 2000");
    if (refs.length === 0) {
      return Object.freeze({ state: "CURRENT", refs: Object.freeze([]) });
    }
    const result = await client.query<{ spool_ref: string }>(SPOOL_RECEIPTS_SELECT, [refs]);
    return Object.freeze({
      state: "CURRENT",
      refs: Object.freeze(result.rows.map((row) => row.spool_ref))
    });
  } catch {
    return Object.freeze({ state: "UNKNOWN", refs: Object.freeze([]) });
  }
}

export async function readSpoolReceipts(
  databaseUrl: string,
  refs: readonly string[]
): Promise<SpoolReceiptSnapshot> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      return await readSpoolReceiptsFromClient(client, refs);
    } finally {
      client.release();
    }
  } catch {
    return Object.freeze({ state: "UNKNOWN", refs: Object.freeze([]) });
  } finally {
    await pool.end();
  }
}
