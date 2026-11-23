/**
 * What the breach-notice command reads from the database (docs/operations/breach-runbook.md part 6), as the API's system
 * login, the one login that reads across accounts outside a request (apps/api/src/billing/operator-connection.ts).
 *
 * Two reads, both of tables that login reads already; the command needs no right the API does not have:
 *
 *  1. For the plan: each chosen account's state, and the language its mail is written in. The language is the site's
 *     own rule for mail that no request of the person's started (identity.moderation_mail_locale, migration 0157): the
 *     language of the Terms they last accepted, among the languages mail is written in; English when there is none.
 *  2. For each mail, at the moment it is sent: the account's address as it is NOW, opened with the account's own key.
 *     So a person who changed their address since the list was made is written to at the new one, and an account
 *     erased since is not written to at all.
 *
 * Nothing here prints or logs an address or an account id.
 */
import type { CryptoEnvelope, ReadableUserDekStore } from "@debateai/crypto";
import { MAIL_LOCALES } from "@debateai/mail-templates";
import type { Pool } from "pg";
import { openAccountEmail } from "../billing/account-email.js";
import type { AccountFacts, BreachNoticeAccounts } from "./run.js";

/** Accounts asked for in one statement. */
const FACTS_BATCH = 1000;

export class PostgresBreachNoticeAccounts implements BreachNoticeAccounts {
  constructor(private readonly pool: Pick<Pool, "query">, private readonly users: ReadableUserDekStore) {}

  async facts(userIds: readonly string[]): Promise<ReadonlyMap<string, AccountFacts>> {
    const facts = new Map<string, AccountFacts>();
    for (let start = 0; start < userIds.length; start += FACTS_BATCH) {
      const result = await this.pool.query<{ user_id: string; state: string; language: string }>(`
        SELECT account.user_id::text AS user_id, account.state,
          COALESCE((SELECT acceptance.locale FROM legal.acceptance AS acceptance
            WHERE acceptance.owner_ref = account.owner_ref AND acceptance.kind = 'TERMS' AND acceptance.locale = ANY($2::text[])
            ORDER BY acceptance.accepted_at DESC, acceptance.recorded_at DESC LIMIT 1), 'en') AS language
        FROM identity."user" AS account
        WHERE account.user_id = ANY($1::uuid[])
      `, [userIds.slice(start, start + FACTS_BATCH), [...MAIL_LOCALES]]);
      for (const row of result.rows) facts.set(row.user_id, Object.freeze({ state: row.state, language: row.language }));
    }
    return facts;
  }

  async address(userId: string): Promise<string | null> {
    const result = await this.pool.query<{ email_ciphertext: CryptoEnvelope }>(
      `SELECT email_ciphertext FROM identity."user" WHERE user_id = $1 AND state <> 'deleted'`, [userId]
    );
    const envelope = result.rows[0]?.email_ciphertext;
    // No row, or no key left: the account was erased, or is on its way there with its key already destroyed.
    if (envelope === undefined || !await this.users.exists(userId)) return null;
    return openAccountEmail(this.users, userId, envelope);
  }
}
