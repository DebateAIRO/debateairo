import type { Pool } from "pg";
import { z } from "zod";
import { canonicalDecimal, canonicalRegisterJson } from "./register-publication.js";

export const MFA_POLICY_ROW_KEY = "mfaPolicy" as const;

const mfaPolicySchema = z.object({
  kind: z.literal("MFA_POLICY"),
  issuer: z.string().trim().min(1).max(64),
  enrollment_credential_ttl_ms: z.literal(24 * 60 * 60 * 1_000),
  totp: z.object({
    algorithm: z.literal("SHA1"),
    digits: z.literal(6),
    period_seconds: z.literal(30),
    secret_bits: z.literal(160),
    drift_steps: z.literal(1)
  }).strict(),
  recovery_codes: z.object({
    count: z.literal(10),
    entropy_bits: z.literal(128),
    storage: z.literal("ARGON2ID_HASH_ONLY"),
    argon2id: z.object({
      memory_cost_kib: z.number().int().min(19_456).max(262_144),
      time_cost: z.number().int().min(2).max(10),
      parallelism: z.number().int().min(1).max(4),
      hash_length: z.number().int().min(32).max(64)
    }).strict()
  }).strict(),
  verification_limits: z.object({
    window_ms: z.literal(5 * 60_000),
    per_enrollment: z.literal(5),
    per_source_across_accounts: z.literal(20),
    temporary_lock_ms: z.literal(5 * 60_000),
    capacity: z.literal(8_192)
  }).strict()
}).strict();

export type MfaPolicyValue = z.infer<typeof mfaPolicySchema>;

export interface MfaPolicy {
  readonly issuer: string;
  readonly enrollmentCredentialTtlMs: number;
  readonly totp: Readonly<{
    algorithm: "SHA1";
    digits: 6;
    periodSeconds: 30;
    secretBits: 160;
    driftSteps: 1;
  }>;
  readonly recoveryCodes: Readonly<{
    count: 10;
    entropyBits: 128;
    storage: "ARGON2ID_HASH_ONLY";
    argon2id: Readonly<{
      memoryCostKiB: number;
      timeCost: number;
      parallelism: number;
      hashLength: number;
    }>;
  }>;
  readonly verificationLimits: Readonly<{
    windowMs: number;
    perEnrollment: number;
    perSourceAcrossAccounts: number;
    temporaryLockMs: number;
    capacity: number;
  }>;
}

const MFA_POLICY_PUBLICATION_ROW = Object.freeze({
  "rowKey": "mfaPolicy",
  "value": Object.freeze({
    "kind": "MFA_POLICY",
    "issuer": "DebateAIRO",
    "enrollment_credential_ttl_ms": canonicalDecimal("86400000"),
    "totp": Object.freeze({
      "algorithm": "SHA1",
      "digits": canonicalDecimal("6"),
      "period_seconds": canonicalDecimal("30"),
      "secret_bits": canonicalDecimal("160"),
      "drift_steps": canonicalDecimal("1")
    }),
    "recovery_codes": Object.freeze({
      "count": canonicalDecimal("10"),
      "entropy_bits": canonicalDecimal("128"),
      "storage": "ARGON2ID_HASH_ONLY",
      "argon2id": Object.freeze({
        "memory_cost_kib": canonicalDecimal("19456"),
        "time_cost": canonicalDecimal("2"),
        "parallelism": canonicalDecimal("1"),
        "hash_length": canonicalDecimal("32")
      })
    }),
    "verification_limits": Object.freeze({
      "window_ms": canonicalDecimal("300000"),
      "per_enrollment": canonicalDecimal("5"),
      "per_source_across_accounts": canonicalDecimal("20"),
      "temporary_lock_ms": canonicalDecimal("300000"),
      "capacity": canonicalDecimal("8192")
    })
  }),
  "sourceRef": "AMENDMENTS.md A3-7 + MFA RESEARCH M4/M5/M6/M11 + wave-3 P1-S4"
});

export const MFA_POLICY_REGISTER_ROW = Object.freeze({
  rowKey: MFA_POLICY_PUBLICATION_ROW.rowKey,
  valueAst: MFA_POLICY_PUBLICATION_ROW.value,
  value: JSON.parse(canonicalRegisterJson(MFA_POLICY_PUBLICATION_ROW.value)) as MfaPolicyValue,
  sourceRef: MFA_POLICY_PUBLICATION_ROW.sourceRef
});

export function mfaPolicyFromValue(candidate: unknown): MfaPolicy {
  const value = mfaPolicySchema.parse(candidate);
  return Object.freeze({
    issuer: value.issuer,
    enrollmentCredentialTtlMs: value.enrollment_credential_ttl_ms,
    totp: Object.freeze({
      algorithm: value.totp.algorithm,
      digits: value.totp.digits,
      periodSeconds: value.totp.period_seconds,
      secretBits: value.totp.secret_bits,
      driftSteps: value.totp.drift_steps
    }),
    recoveryCodes: Object.freeze({
      count: value.recovery_codes.count,
      entropyBits: value.recovery_codes.entropy_bits,
      storage: value.recovery_codes.storage,
      argon2id: Object.freeze({
        memoryCostKiB: value.recovery_codes.argon2id.memory_cost_kib,
        timeCost: value.recovery_codes.argon2id.time_cost,
        parallelism: value.recovery_codes.argon2id.parallelism,
        hashLength: value.recovery_codes.argon2id.hash_length
      })
    }),
    verificationLimits: Object.freeze({
      windowMs: value.verification_limits.window_ms,
      perEnrollment: value.verification_limits.per_enrollment,
      perSourceAcrossAccounts: value.verification_limits.per_source_across_accounts,
      temporaryLockMs: value.verification_limits.temporary_lock_ms,
      capacity: value.verification_limits.capacity
    })
  });
}

export async function readMfaPolicy(pool: Pool, registerVersion: number): Promise<MfaPolicy> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("A positive register version is required for MFA policy");
  }
  const result = await pool.query<{ value_json: unknown }>(`
    SELECT value_json FROM register.register_row
    WHERE register_version=$1 AND row_key=$2
  `, [registerVersion, MFA_POLICY_ROW_KEY]);
  const row = result.rows[0];
  if (row === undefined) throw new Error("MFA_POLICY_UNRESOLVED");
  return mfaPolicyFromValue(row.value_json);
}
