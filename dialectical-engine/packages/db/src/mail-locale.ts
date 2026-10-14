import type { Pool, PoolClient } from "pg";

// The transaction setting that carries the mail language to the queue-row writers (R-11, D-56).
export const MAIL_LOCALE_SETTING = "debateai.mail_locale";

// The 37 values R-06 accepts: the 35 catalogue codes plus en-US and en-GB. The same list as
// packages/contract/src/locale.ts (LocaleCodeSchema); tests/unit/mail-locale-transaction.test.ts pins the two together.
const MAIL_LOCALES: ReadonlySet<string> = new Set([
  "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "ga", "it",
  "lv", "lt", "mt", "pl", "pt", "ro", "ru", "sk", "sl", "es", "sv", "uk", "zh", "hi",
  "id", "ja", "ko", "vi", "ar", "he", "tr", "en-US", "en-GB"
]);

// Refuses any value outside the 37 before anything is written.
export function assertMailLocale(value: string): string {
  if (!MAIL_LOCALES.has(value)) throw new TypeError("MAIL_LOCALE_INVALID");
  return value;
}

// Runs one mail-triggering write on a single connection inside one transaction that first
// sets the mail language for that transaction only (is_local = true).
export async function withMailLocale<T>(
  pool: Pool,
  mailLocale: string,
  run: (client: PoolClient) => Promise<T>
): Promise<T> {
  const value = assertMailLocale(mailLocale);
  const client = await pool.connect();
  // Set when ROLLBACK fails: the connection's transaction state is unknown, so the client must leave the pool.
  let discard: Error | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config($1, $2, true)", [MAIL_LOCALE_SETTING, value]);
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // A failed ROLLBACK must not replace the original error. release(err) removes the client from the pool
    // (pg-pool 3.14.0, _release), so the next borrower never inherits an open or failed transaction.
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      discard = rollbackError instanceof Error ? rollbackError : new Error("ROLLBACK failed");
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
