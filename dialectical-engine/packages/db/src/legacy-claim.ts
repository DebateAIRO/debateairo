import type { Pool } from "pg";
import type { AuditContextHasher } from "@debateai/crypto";
import type { AuthSourceContext } from "./identity.js";

export type LegacyRunClaimOutcome = Readonly<{
  status: "CLAIMED" | "NO_MATCH" | "SESSION_INVALID";
  claimedCount: number;
}>;

function normalized(value: unknown, maximumLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return (text === "" ? "unknown" : text).slice(0, maximumLength);
}

function versionedAuditDigest(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError("AUDIT_CONTEXT_DIGEST_INVALID");
  return `argon2id-audit:v1:${value}`;
}

export class PostgresLegacyRunClaimRepository {
  constructor(
    private readonly pool: Pool,
    private readonly auditContext: AuditContextHasher
  ) {}

  async claim(input: Readonly<{
    userId: string;
    ownerRef: string;
    sessionId: string;
    sessionTokenHash: string;
    legacyToken: string;
    source: AuthSourceContext;
  }>): Promise<LegacyRunClaimOutcome> {
    const sourceContext = Object.freeze({
      ipArgon2id: versionedAuditDigest(await this.auditContext.hashSourceIp(
        normalized(input.source.ip,64)
      )),
      userAgentArgon2id: versionedAuditDigest(await this.auditContext.hashUserAgent(
        normalized(input.source.userAgent,256)
      ))
    });
    const result = await this.pool.query<{
      claim_status: "CLAIMED" | "NO_MATCH" | "SESSION_INVALID";
      claimed_count: number;
    }>(
      "SELECT * FROM core.claim_legacy_runs($1,$2,$3,$4,$5,$6::jsonb)",
      [input.userId,input.ownerRef,input.sessionId,input.sessionTokenHash,
        input.legacyToken,JSON.stringify(sourceContext)]
    );
    const row = result.rows[0];
    if (row === undefined || !Number.isInteger(row.claimed_count) || row.claimed_count<0) {
      throw new TypeError("LEGACY_RUN_CLAIM_RESULT_INVALID");
    }
    return Object.freeze({ status:row.claim_status,claimedCount:row.claimed_count });
  }

  /** NV-01: charges one claim attempt to the account's budget (0131's core.legacy_claim_admit), before any claim work. */
  async admit(
    userId: string,
    policy: Readonly<{ maxAttempts: number; windowMs: number; lockMs: number }>
  ): Promise<Readonly<{ admitted: boolean; retryAfterMs: number }>> {
    const result = await this.pool.query<{ admitted: unknown; retry_after_ms: unknown }>(
      "SELECT admitted,retry_after_ms FROM core.legacy_claim_admit($1,$2,$3,$4)",
      [userId,policy.windowMs,policy.maxAttempts,policy.lockMs]
    );
    const row = result.rows[0];
    // pg answers bigint as a string.
    const retryAfterMs = typeof row?.retry_after_ms === "string" || typeof row?.retry_after_ms === "number"
      ? Number(row.retry_after_ms) : Number.NaN;
    if (result.rows.length !== 1 || typeof row?.admitted !== "boolean"
      || !Number.isSafeInteger(retryAfterMs) || retryAfterMs < 0) {
      throw new TypeError("LEGACY_RUN_CLAIM_ADMIT_INVALID");
    }
    return Object.freeze({ admitted:row.admitted,retryAfterMs });
  }

  /** NV-01: after a CLAIMED outcome, drops the account's count unless a lock is active (0131's core.legacy_claim_clear). */
  async clearAttempts(userId: string): Promise<void> {
    await this.pool.query("SELECT core.legacy_claim_clear($1)",[userId]);
  }
}
