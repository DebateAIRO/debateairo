import { randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  encrypt,
  type AeadAad,
  type AuditContextHasher,
  type ReadableUserDekStore
} from "@debateai/crypto";
import type { AuthSourceContext } from "./identity.js";

function normalizedSource(source: AuthSourceContext): AuthSourceContext {
  const ip = typeof source?.ip === "string" ? source.ip.trim().slice(0, 64) : "";
  const userAgent = typeof source?.userAgent === "string"
    ? source.userAgent.trim().slice(0, 256) : "";
  const requestId = typeof source?.requestId === "string"
    ? source.requestId.trim().slice(0, 128) : "";
  return Object.freeze({
    ip: ip === "" ? "unknown" : ip,
    userAgent: userAgent === "" ? "unknown" : userAgent,
    requestId: requestId === "" ? "unknown" : requestId
  });
}

function versionedDigest(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError("AUDIT_CONTEXT_DIGEST_INVALID");
  return `argon2id-audit:v1:${value}`;
}

export function accountRecoveryChannelRefsAad(userId: string): AeadAad {
  return Object.freeze([
    "identity",
    "account_recovery_request.channel_refs_ciphertext",
    userId,
    "run:none",
    userId,
    `user-dek:${userId}`,
    "1"
  ] as const);
}

export class PostgresRecoveryStartRepository {
  constructor(
    private readonly pool: Pool,
    private readonly auditContext: AuditContextHasher,
    private readonly users: ReadableUserDekStore
  ) {}

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT identity.begin_runtime_audit_attempt()");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async start(input: Readonly<{
    emailBlindIndex: Buffer;
    source: AuthSourceContext;
  }>): Promise<
    | Readonly<{status:"created";publicHandle:string}>
    | Readonly<{status:"not_created"}>
  > {
    const source = normalizedSource(input.source);
    const [ipDigest,userAgentDigest,candidateResult] = await Promise.all([
      this.auditContext.hashSourceIp(source.ip).then(versionedDigest),
      this.auditContext.hashUserAgent(source.userAgent).then(versionedDigest),
      this.pool.query<{ user_id: string; channel_binding_ids: string[] }>(
        "SELECT * FROM identity.prepare_account_recovery_start($1)",
        [input.emailBlindIndex]
      )
    ]);
    if (candidateResult.rows.length > 1) {
      throw new TypeError("RECOVERY_START_CANDIDATE_AMBIGUOUS");
    }
    const candidate = candidateResult.rows[0];
    const envelopeUserId = candidate?.user_id ?? randomUUID();
    const channelBindingIds = candidate?.channel_binding_ids ?? [];
    const key = candidate === undefined
      ? randomBytes(32)
      : await this.users.load(candidate.user_id);
    try {
      const channelRefsCiphertext = encrypt(
        key,
        Buffer.from(JSON.stringify({ v: 1, channelBindingIds }), "utf8"),
        accountRecoveryChannelRefsAad(envelopeUserId)
      );
      const result = await this.transaction(async (client) => client.query<{
        start_status: "CREATED" | "NOT_CREATED";
        public_handle:string|null;
      }>(`SELECT * FROM identity.start_account_recovery(
        $1,$2,$3::uuid[],$4::jsonb,$5::jsonb
      )`, [
        input.emailBlindIndex,
        candidate?.user_id ?? null,
        channelBindingIds,
        JSON.stringify(channelRefsCiphertext),
        JSON.stringify({ ipArgon2id: ipDigest, userAgentArgon2id: userAgentDigest })
      ]));
      const status = result.rows[0]?.start_status;
      const publicHandle=result.rows[0]?.public_handle;
      if (status === "CREATED" && typeof publicHandle==="string") {
        return Object.freeze({status:"created" as const,publicHandle});
      }
      if (status === "NOT_CREATED" && publicHandle===null) {
        return Object.freeze({status:"not_created" as const});
      }
      throw new TypeError("RECOVERY_START_OUTCOME_INVALID");
    } finally {
      key.fill(0);
    }
  }
}
