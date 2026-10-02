import { decrypt, type CryptoEnvelope, type ReadableUserDekStore } from "@debateai/crypto";
import { TypedDomainError } from "@debateai/kernel";
import type { Pool } from "pg";

export interface AccountEmailReader {
  read(userId: string): Promise<string>;
}

/**
 * Spec §2.5.3 step 3: xMoney's customer gets the account email, decrypted with the person's DEK inside the API,
 * with the AAD registration wrote it under (apps/api/src/registration.ts:1271-1273). Buffers are zeroed.
 * Only an `active` account has an address to give: `age_frozen` (0077), `pending_mfa`, `suspended` and `deleted`
 * accounts answer BILLING_ACCOUNT_EMAIL_UNAVAILABLE.
 */
export class DekAccountEmailReader implements AccountEmailReader {
  constructor(private readonly pool: Pool, private readonly users: ReadableUserDekStore) {}

  async read(userId: string): Promise<string> {
    const result = await this.pool.query<{ email_ciphertext: CryptoEnvelope }>(
      `SELECT email_ciphertext FROM identity."user" WHERE user_id=$1 AND state='active'`, [userId]
    );
    const envelope = result.rows[0]?.email_ciphertext;
    if (envelope === undefined) throw new TypedDomainError("BILLING_ACCOUNT_EMAIL_UNAVAILABLE", "no active account");
    let dek: Buffer | undefined;
    let plaintext: Buffer | undefined;
    try {
      dek = await this.users.load(userId);
      plaintext = decrypt(dek, envelope, [
        "identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"
      ] as const);
      const email = plaintext.toString("utf8");
      if (!/^[^\s@,;]+@[^\s@,;]+$/.test(email)) {
        throw new TypedDomainError("BILLING_ACCOUNT_EMAIL_UNAVAILABLE", "the stored address is not one mailbox");
      }
      return email;
    } finally {
      plaintext?.fill(0);
      dek?.fill(0);
    }
  }
}
