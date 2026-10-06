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
    return openAccountEmail(this.users, userId, envelope);
  }
}

/**
 * W8 (P2-I12, the owner's ruling of 2 October 2026): receipts, notices, cancel links and invoices go to the account's
 * CURRENT email at the time of sending, so a change of address in Settings (turn 14, which tells billing nothing)
 * reaches billing by itself. The address kept with the billing profile, and on the invoices already issued, is used
 * only after the account is erased.
 */
export interface BillingRecipientReader {
  /**
   * The current address of the account behind a billing customer, or `null` once that account is erased: its row is
   * gone (the erasure committed), or its key was already destroyed on the way there. Any account still standing
   * answers, whatever its state (`age_frozen`, or `suspended` while an erasure is prepared), because it still owns
   * that mailbox. Throws when the address cannot be read or is not one mailbox, so the mail waits for a retry rather
   * than going to an address the account no longer has.
   */
  currentAddress(customerId: string): Promise<string | null>;
}

export class DekBillingRecipientReader implements BillingRecipientReader {
  constructor(private readonly pool: Pool, private readonly users: ReadableUserDekStore) {}

  async currentAddress(customerId: string): Promise<string | null> {
    const result = await this.pool.query<{ user_id: string; email_ciphertext: CryptoEnvelope }>(`
      SELECT account.user_id::text AS user_id, account.email_ciphertext
      FROM billing.customer AS customer
      JOIN identity."user" AS account ON account.owner_ref = customer.owner_ref
      WHERE customer.customer_id = $1
    `, [customerId]);
    const row = result.rows[0];
    if (row === undefined || !await this.users.exists(row.user_id)) return null;
    return openAccountEmail(this.users, row.user_id, row.email_ciphertext);
  }
}

/** The address under the person's DEK, with the AAD registration wrote it under; every buffer is zeroed. */
async function openAccountEmail(users: ReadableUserDekStore, userId: string, envelope: CryptoEnvelope): Promise<string> {
  let dek: Buffer | undefined;
  let plaintext: Buffer | undefined;
  try {
    dek = await users.load(userId);
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
