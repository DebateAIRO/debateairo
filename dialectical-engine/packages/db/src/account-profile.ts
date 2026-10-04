import type { Pool, PoolClient } from "pg";
import type { AuditContextHasher, CryptoEnvelope } from "@debateai/crypto";
import type { AuthSourceContext } from "./identity.js";
export interface ProfileSession {
  readonly userId: string;
  readonly sessionId: string;
  readonly tokenHash: string;
}
export interface PhoneProfileRecord {
  readonly ciphertext: CryptoEnvelope | null;
  readonly updatedAt: Date | null;
}
/** KDF work finishes before a connection/lock is acquired. */
export class ProfileTransactions {
  constructor(private readonly pool: Pool, private readonly audit: AuditContextHasher) {
  }
  async audited<T>(source: AuthSourceContext, operation: (client: PoolClient, context: string) => Promise<T>): Promise<T> {
    const digest = (value: string) => {
      if (!/^[0-9a-f]{64}$/.test(value))
        throw new TypeError("AUDIT_CONTEXT_DIGEST_INVALID");
      return `argon2id-audit:v1:${value}`;
    };
    const normalize = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim() : "unknown").slice(0, max);
    const context = JSON.stringify({
      ipArgon2id: digest(await this.audit.hashSourceIp(normalize(source?.ip, 64))), userAgentArgon2id: digest(await this.audit.hashUserAgent(normalize(source?.userAgent, 256)))
    });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT identity.begin_runtime_audit_attempt()");
      const result = await operation(client, context);
      await client.query("COMMIT");
      return result;
    }
    catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    finally {
      client.release();
    }
  }
}
export class PostgresAccountProfileRepository {
  private readonly transactions: ProfileTransactions;
  constructor(private readonly pool: Pool, audit: AuditContextHasher) {
    this.transactions = new ProfileTransactions(pool, audit);
  }
  async read(session: ProfileSession): Promise<PhoneProfileRecord | null> {
    const row = (await this.pool.query<{
      phone_ciphertext: CryptoEnvelope | null;
      phone_updated_at: Date | null;
    }>("SELECT * FROM identity.read_phone_profile($1,$2,$3)", [session.userId, session.sessionId, session.tokenHash])).rows[0];
    return row === undefined ? null : {
      ciphertext: row.phone_ciphertext, updatedAt: row.phone_updated_at
    };
  }
  async use(session: ProfileSession, input: Readonly<{
    action: "READ_PHONE_PROFILE" | "CHANGE_PHONE_PROFILE";
    grantTokenHash: string;
    ciphertext?: CryptoEnvelope;
  }>, source: AuthSourceContext): Promise<PhoneProfileRecord | null> {
    return this.transactions.audited(source, async (client, context) => {
      const row = (await client.query<{
        phone_ciphertext: CryptoEnvelope | null;
        phone_updated_at: Date | null;
      }>("SELECT * FROM identity.use_phone_profile_with_audit($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)", [session.userId, session.sessionId, session.tokenHash, input.action, input.grantTokenHash, input.ciphertext === undefined ? null : JSON.stringify(input.ciphertext), context])).rows[0];
      return row === undefined ? null : {
        ciphertext: row.phone_ciphertext, updatedAt: row.phone_updated_at
      };
    });
  }
  async hasPhone(ownerRef: string): Promise<boolean> {
    return (await this.pool.query<{
      present: boolean;
    }>("SELECT identity.has_phone_profile($1) AS present", [ownerRef])).rows[0]?.present === true;
  }
}
