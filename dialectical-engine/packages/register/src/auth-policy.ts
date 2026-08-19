import type { Pool } from "pg";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";

export const AUTH_POLICY_ROW_KEYS = [
  "passwordPolicy", "auditSourceIpKdfPolicy", "verificationPolicy", "rateLimitPolicy", "channelPolicy"
] as const;

const passwordPolicySchema = z.object({
  kind: z.literal("PASSWORD_POLICY"),
  minimum_length: z.literal(8),
  composition_rules: z.literal(false),
  forced_rotation: z.literal(false),
  argon2id: z.object({
    memory_cost_kib: z.number().int().min(19_456),
    time_cost: z.number().int().min(2),
    parallelism: z.number().int().positive(),
    hash_length: z.number().int().min(32)
  }).strict()
}).strict();

const auditSourceIpKdfPolicySchema = z.object({
  kind: z.literal("AUDIT_SOURCE_IP_KDF_POLICY"),
  algorithm: z.literal("argon2id"),
  memory_cost_kib: z.number().int().min(19_456).max(262_144),
  iterations: z.number().int().min(2).max(10),
  parallelism: z.number().int().positive(),
  hash_length: z.literal(32)
}).strict();

const verificationPolicySchema = z.object({
  kind: z.literal("VERIFICATION_POLICY"),
  token_ttl_ms: z.number().int().positive().max(24 * 60 * 60 * 1_000),
  resend_cooldown_ms: z.number().int().positive(),
  enumeration_response_floor_ms: z.number().int().positive(),
  enumeration_tolerance_ms: z.number().int().positive()
}).strict();

const routeLimitSchema = z.object({
  window_ms: z.number().int().positive(),
  per_ip: z.number().int().positive(),
  per_address: z.number().int().positive()
}).strict();

const rateLimitPolicySchema = z.object({
  kind: z.literal("AUTH_RATE_LIMIT_POLICY"),
  bucket_capacity: z.number().int().positive(),
  refusal_audit_interval_ms: z.number().int().positive(),
  routes: z.object({
    register: routeLimitSchema,
    verify: routeLimitSchema,
    resend: routeLimitSchema
  }).strict()
}).strict();

const channelPolicySchema = z.object({
  kind: z.literal("CHANNEL_POLICY"),
  transport: z.literal("own_sendmail"),
  sender_local_part: z.literal("noreply"),
  transport_timeout_ms: z.number().int().positive(),
  spam_notice: z.string().regex(/spam/i)
}).strict();

export interface AuthPolicyRegisterRow {
  readonly rowKey: typeof AUTH_POLICY_ROW_KEYS[number];
  readonly value: Readonly<Record<string, unknown>>;
  readonly sourceRef: string;
}

export const AUTH_POLICY_REGISTER_ROWS = Object.freeze([
  Object.freeze({
    rowKey: "passwordPolicy" as const,
    value: Object.freeze({
      kind: "PASSWORD_POLICY",
      minimum_length: 8,
      composition_rules: false,
      forced_rotation: false,
      argon2id: Object.freeze({
        memory_cost_kib: 65_536,
        time_cost: 3,
        parallelism: 1,
        hash_length: 32
      })
    }),
    sourceRef: "wave-2-target-architecture.md#10.1 + VR-3/VR-4/VR-5 (2026-08-19)"
  }),
  Object.freeze({
    rowKey: "auditSourceIpKdfPolicy" as const,
    value: Object.freeze({
      kind: "AUDIT_SOURCE_IP_KDF_POLICY",
      algorithm: "argon2id",
      memory_cost_kib: 19_456,
      iterations: 2,
      parallelism: 1,
      hash_length: 32
    }),
    sourceRef: "AMENDMENTS.md#VR-7 memory-hard immutable audit source-IP hashing (2026-08-19)"
  }),
  Object.freeze({
    rowKey: "verificationPolicy" as const,
    value: Object.freeze({
      kind: "VERIFICATION_POLICY",
      token_ttl_ms: 24 * 60 * 60 * 1_000,
      resend_cooldown_ms: 60_000,
      enumeration_response_floor_ms: 500,
      enumeration_tolerance_ms: 100
    }),
    sourceRef: "wave-2-target-architecture.md#10.7 + VR-5 (2026-08-19)"
  }),
  Object.freeze({
    rowKey: "rateLimitPolicy" as const,
    value: Object.freeze({
      kind: "AUTH_RATE_LIMIT_POLICY",
      bucket_capacity: 4_096,
      refusal_audit_interval_ms: 60_000,
      routes: Object.freeze({
        register: Object.freeze({ window_ms: 15 * 60_000, per_ip: 20, per_address: 5 }),
        verify: Object.freeze({ window_ms: 15 * 60_000, per_ip: 30, per_address: 10 }),
        resend: Object.freeze({ window_ms: 60 * 60_000, per_ip: 15, per_address: 3 })
      })
    }),
    sourceRef: "AMENDMENTS.md#A3-10 + S3 packet rate-limit ownership (2026-08-19)"
  }),
  Object.freeze({
    rowKey: "channelPolicy" as const,
    value: Object.freeze({
      kind: "CHANNEL_POLICY",
      transport: "own_sendmail",
      sender_local_part: "noreply",
      transport_timeout_ms: 5_000,
      spam_notice: "Check your spam folder if the verification message does not arrive."
    }),
    sourceRef: "AMENDMENTS.md#VR-5 own mail service, no relays (2026-08-19)"
  })
] satisfies readonly AuthPolicyRegisterRow[]);

export interface AuthRouteLimit {
  readonly windowMs: number;
  readonly perIp: number;
  readonly perAddress: number;
}

export interface AuthPolicy {
  readonly password: {
    readonly minimumLength: 8;
    readonly argon2id: {
      readonly memoryCostKiB: number;
      readonly timeCost: number;
      readonly parallelism: number;
      readonly hashLength: number;
    };
  };
  readonly auditSourceIpKdf: {
    readonly algorithm: "argon2id";
    readonly memoryCostKiB: number;
    readonly iterations: number;
    readonly parallelism: number;
    readonly hashLength: 32;
  };
  readonly verification: {
    readonly tokenTtlMs: number;
    readonly resendCooldownMs: number;
    readonly enumerationResponseFloorMs: number;
    readonly enumerationToleranceMs: number;
  };
  readonly rateLimits: Readonly<Record<"register" | "verify" | "resend", AuthRouteLimit>>;
  readonly rateLimitBucketCapacity: number;
  readonly rateLimitRefusalAuditIntervalMs: number;
  readonly channel: {
    readonly transport: "own_sendmail";
    readonly senderLocalPart: "noreply";
    readonly transportTimeoutMs: number;
    readonly spamNotice: string;
  };
}

export function authPolicyFromRegisterRows(rows: readonly AuthPolicyRegisterRow[]): AuthPolicy {
  const byKey = new Map(rows.map((row) => [row.rowKey, row]));
  for (const key of AUTH_POLICY_ROW_KEYS) {
    const row = byKey.get(key);
    if (row === undefined || row.sourceRef.trim() === "") {
      throw new TypedDomainError("AUTH_POLICY_UNRESOLVED", `Missing ruled ${key}`);
    }
  }
  const password = passwordPolicySchema.safeParse(byKey.get("passwordPolicy")!.value);
  const auditSourceIpKdf = auditSourceIpKdfPolicySchema.safeParse(
    byKey.get("auditSourceIpKdfPolicy")!.value
  );
  const verification = verificationPolicySchema.safeParse(byKey.get("verificationPolicy")!.value);
  const rateLimits = rateLimitPolicySchema.safeParse(byKey.get("rateLimitPolicy")!.value);
  const channel = channelPolicySchema.safeParse(byKey.get("channelPolicy")!.value);
  if (!password.success || !auditSourceIpKdf.success || !verification.success
    || !rateLimits.success || !channel.success) {
    throw new TypedDomainError("AUTH_POLICY_INVALID", "An authentication register row violates its ruled member type");
  }
  const routePolicy = (route: keyof typeof rateLimits.data.routes): AuthRouteLimit => Object.freeze({
    windowMs: rateLimits.data.routes[route].window_ms,
    perIp: rateLimits.data.routes[route].per_ip,
    perAddress: rateLimits.data.routes[route].per_address
  });
  return Object.freeze({
    password: Object.freeze({
      minimumLength: password.data.minimum_length,
      argon2id: Object.freeze({
        memoryCostKiB: password.data.argon2id.memory_cost_kib,
        timeCost: password.data.argon2id.time_cost,
        parallelism: password.data.argon2id.parallelism,
        hashLength: password.data.argon2id.hash_length
      })
    }),
    auditSourceIpKdf: Object.freeze({
      algorithm: auditSourceIpKdf.data.algorithm,
      memoryCostKiB: auditSourceIpKdf.data.memory_cost_kib,
      iterations: auditSourceIpKdf.data.iterations,
      parallelism: auditSourceIpKdf.data.parallelism,
      hashLength: auditSourceIpKdf.data.hash_length
    }),
    verification: Object.freeze({
      tokenTtlMs: verification.data.token_ttl_ms,
      resendCooldownMs: verification.data.resend_cooldown_ms,
      enumerationResponseFloorMs: verification.data.enumeration_response_floor_ms,
      enumerationToleranceMs: verification.data.enumeration_tolerance_ms
    }),
    rateLimits: Object.freeze({
      register: routePolicy("register"),
      verify: routePolicy("verify"),
      resend: routePolicy("resend")
    }),
    rateLimitBucketCapacity: rateLimits.data.bucket_capacity,
    rateLimitRefusalAuditIntervalMs: rateLimits.data.refusal_audit_interval_ms,
    channel: Object.freeze({
      transport: channel.data.transport,
      senderLocalPart: channel.data.sender_local_part,
      transportTimeoutMs: channel.data.transport_timeout_ms,
      spamNotice: channel.data.spam_notice
    })
  });
}

export async function readAuthPolicy(pool: Pool, registerVersion: number): Promise<AuthPolicy> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("A positive register version is required for auth policy");
  }
  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(`
    SELECT row_key,value_json,source_ref FROM register.register_row
    WHERE register_version=$1 AND row_key=ANY($2::text[])
  `, [registerVersion, AUTH_POLICY_ROW_KEYS]);
  return authPolicyFromRegisterRows(result.rows.map((row) => ({
    rowKey: row.row_key as AuthPolicyRegisterRow["rowKey"],
    value: row.value_json as Readonly<Record<string, unknown>>,
    sourceRef: row.source_ref
  })));
}
