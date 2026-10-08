import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { AuditContextHasher, CryptoEnvelope } from "@debateai/crypto";
import type { AuthSourceContext } from "./identity.js";
import { ProfileTransactions, type ProfileSession } from "./account-profile.js";
export interface RecoveryEmailRecord {
  readonly ciphertext: CryptoEnvelope | null;
  readonly pending: Readonly<{
    ciphertext: CryptoEnvelope;
    expiresAt: Date;
  }> | null;
}
export class PostgresRecoveryEmailRepository {
  private readonly transactions: ProfileTransactions;
  constructor(private readonly pool: Pool, audit: AuditContextHasher) {
    this.transactions = new ProfileTransactions(pool, audit);
  }
  async read(session: ProfileSession): Promise<RecoveryEmailRecord | null> {
    const row = (await this.pool.query<{
      ciphertext: CryptoEnvelope | null;
      pending_ciphertext: CryptoEnvelope | null;
      expires_at: Date | null;
    }>("SELECT * FROM identity.read_recovery_email($1,$2,$3)", [session.userId, session.sessionId, session.tokenHash])).rows[0];
    return row === undefined ? null : {
      ciphertext: row.ciphertext, pending: row.pending_ciphertext === null || row.expires_at === null ? null : {
        ciphertext: row.pending_ciphertext, expiresAt: row.expires_at
      }
    };
  }
  async request(session: ProfileSession, input: Readonly<{
    grantTokenHash: string;
    emailBlindIndex: Uint8Array;
    ciphertext: CryptoEnvelope;
    confirmTokenHash: string;
    expiresAt: Date;
  }>, source: AuthSourceContext): Promise<string> {
    return this.transactions.audited(source, async (client, context) => (await client.query<{
      outcome: string;
    }>("SELECT identity.request_recovery_email_with_audit($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb) AS outcome", [session.userId, session.sessionId, session.tokenHash, input.grantTokenHash, randomUUID(), Buffer.from(input.emailBlindIndex), JSON.stringify(input.ciphertext), input.confirmTokenHash, input.expiresAt, context])).rows[0]?.outcome ?? "DENIED");
  }
  async confirm(confirmTokenHash: string, source: AuthSourceContext): Promise<string> {
    return this.transactions.audited(source, async (client, context) => (await client.query<{
      outcome: string;
    }>("SELECT identity.confirm_recovery_email_with_audit($1,$2::jsonb) AS outcome", [confirmTokenHash, context])).rows[0]?.outcome ?? "INVALID");
  }
  async remove(session: ProfileSession, grantTokenHash: string, source: AuthSourceContext): Promise<boolean> {
    return this.transactions.audited(source, async (client, context) => (await client.query<{
      removed: boolean;
    }>("SELECT identity.remove_recovery_email_with_audit($1,$2,$3,$4,$5::jsonb) AS removed", [session.userId, session.sessionId, session.tokenHash, grantTokenHash, context])).rows[0]?.removed === true);
  }
}
