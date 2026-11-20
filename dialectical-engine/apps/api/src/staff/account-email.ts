import type { Pool } from "pg";
import { decrypt, type CryptoEnvelope, type ReadableUserDekStore } from "@debateai/crypto";

/**
 * Opens a live account's address with the user DEK and identity.user.email_ciphertext AAD, for the staff notice loops
 * (team limit, allowances, public review, public flags). main.ts gives it crossAccountPool(pool, "X27"): the loops run
 * outside any request, on the API's system login, and read another account's identity row. A missing row is null.
 */
export function accountEmailReader(
  pool: Pick<Pool, "query">, keys: Pick<ReadableUserDekStore, "load">
): (userId: string) => Promise<string | null> {
  return async userId => {
    const row = (await pool.query<{ email_ciphertext: CryptoEnvelope }>(
      'SELECT email_ciphertext FROM identity."user" WHERE user_id=$1', [userId]
    )).rows[0];
    if (row === undefined) return null;
    const key = await keys.load(userId);
    try {
      const plain = decrypt(key, row.email_ciphertext,
        ["identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"]);
      try { return plain.toString("utf8"); }
      finally { plain.fill(0); }
    } finally { key.fill(0); }
  };
}
