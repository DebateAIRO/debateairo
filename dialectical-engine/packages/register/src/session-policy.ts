import type { Pool } from "pg";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import { canonicalDecimal, canonicalRegisterJson } from "./register-publication.js";

export const SESSION_POLICY_ROW_KEY = "sessionPolicy" as const;

const sessionPolicyValueSchema = z.object({
  kind: z.literal("SESSION_POLICY"),
  token_bytes: z.literal(32),
  csrf_token_bytes: z.literal(32),
  login_challenge_ttl_ms: z.number().int().positive(),
  idle_ttl_ms: z.number().int().positive(),
  absolute_ttl_ms: z.number().int().positive(),
  cookie: z.object({
    session_name: z.literal("__Host-debateai-session"),
    csrf_name: z.literal("__Host-debateai-csrf"),
    path: z.literal("/"),
    secure: z.literal(true),
    http_only: z.literal(true),
    same_site: z.literal("Lax")
  }).strict(),
  step_up_freshness_ms: z.number().int().positive()
}).strict().superRefine((value, context) => {
  if (value.idle_ttl_ms >= value.absolute_ttl_ms) {
    context.addIssue({ code: "custom", message: "Session idle lifetime must be shorter than its absolute lifetime" });
  }
});

export type SessionPolicyValue = z.infer<typeof sessionPolicyValueSchema>;

export type SessionPolicy = Readonly<{
  tokenBytes: 32;
  csrfTokenBytes: 32;
  loginChallengeTtlMs: number;
  idleTtlMs: number;
  absoluteTtlMs: number;
  sessionCookieName: "__Host-debateai-session";
  csrfCookieName: "__Host-debateai-csrf";
  cookiePath: "/";
  secure: true;
  httpOnly: true;
  sameSite: "Lax";
  stepUpFreshnessMs: number;
  sourceRef: string;
}>;

const SESSION_POLICY_PUBLICATION_ROW = Object.freeze({
  "rowKey": "sessionPolicy",
  "sourceRef": "DR-179; wave-2-target-architecture:session-security; S5-binding-contract",
  "value": Object.freeze({
    "kind": "SESSION_POLICY",
    "token_bytes": canonicalDecimal("32"),
    "csrf_token_bytes": canonicalDecimal("32"),
    "login_challenge_ttl_ms": canonicalDecimal("300000"),
    "idle_ttl_ms": canonicalDecimal("1209600000"),
    "absolute_ttl_ms": canonicalDecimal("7776000000"),
    "cookie": Object.freeze({
      "session_name": "__Host-debateai-session",
      "csrf_name": "__Host-debateai-csrf",
      "path": "/",
      "secure": true,
      "http_only": true,
      "same_site": "Lax"
    }),
    "step_up_freshness_ms": canonicalDecimal("300000")
  })
});

export const SESSION_POLICY_REGISTER_ROW = Object.freeze({
  rowKey: SESSION_POLICY_PUBLICATION_ROW.rowKey,
  valueAst: SESSION_POLICY_PUBLICATION_ROW.value,
  value: JSON.parse(canonicalRegisterJson(SESSION_POLICY_PUBLICATION_ROW.value)) as SessionPolicyValue,
  sourceRef: SESSION_POLICY_PUBLICATION_ROW.sourceRef
});

export function sessionPolicyFromValue(value: unknown, sourceRef: string): SessionPolicy {
  const parsed = sessionPolicyValueSchema.safeParse(value);
  if (!parsed.success || sourceRef.trim() === "") {
    throw new TypedDomainError("SESSION_POLICY_INVALID", "The sealed session policy is absent or malformed");
  }
  const policy = parsed.data;
  return Object.freeze({
    tokenBytes: policy.token_bytes,
    csrfTokenBytes: policy.csrf_token_bytes,
    loginChallengeTtlMs: policy.login_challenge_ttl_ms,
    idleTtlMs: policy.idle_ttl_ms,
    absoluteTtlMs: policy.absolute_ttl_ms,
    sessionCookieName: policy.cookie.session_name,
    csrfCookieName: policy.cookie.csrf_name,
    cookiePath: policy.cookie.path,
    secure: policy.cookie.secure,
    httpOnly: policy.cookie.http_only,
    sameSite: policy.cookie.same_site,
    stepUpFreshnessMs: policy.step_up_freshness_ms,
    sourceRef
  });
}

export async function readSessionPolicy(pool: Pool, registerVersion: number): Promise<SessionPolicy> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, SESSION_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError("SESSION_POLICY_UNRESOLVED", `No ${SESSION_POLICY_ROW_KEY}@${registerVersion} exists`);
  }
  return sessionPolicyFromValue(row.value_json, row.source_ref);
}

export const ADMISSION_POLICY_ROW_KEY = "admissionPolicy" as const;

const admissionScopeValueSchema = <K extends "owner" | "source">(key: K) => z.object({
  key: z.literal(key),
  limit: z.number().int().positive().max(1_000_000),
  window_ms: z.number().int().positive().max(24 * 60 * 60_000),
  capacity: z.number().int().positive().max(1_048_576)
}).strict();

/**
 * DL1-F2. `support_reads` and `support_sessions` are OPTIONAL members: the
 * sealed row carries neither, and a host still serving it must boot and behave
 * exactly as it does today rather than refuse. A deployment that publishes the
 * superseding row below gets the two budgets, and `AdmissionLimiter.configured`
 * is how a caller tells "this deployment has no such budget" from "refused".
 */
const admissionPolicyValueSchema = z.object({
  kind: z.literal("ADMISSION_POLICY"),
  asks: admissionScopeValueSchema("owner"),
  public_reads: admissionScopeValueSchema("source"),
  recovery_start: admissionScopeValueSchema("source"),
  support_reads: admissionScopeValueSchema("source").optional(),
  support_sessions: admissionScopeValueSchema("owner").optional(),
  support_model_calls: admissionScopeValueSchema("source").optional()
}).strict();

export type AdmissionPolicyValue = z.infer<typeof admissionPolicyValueSchema>;

export type AdmissionScopePolicy<K extends "owner" | "source"> = Readonly<{
  key: K;
  limit: number;
  windowMs: number;
  capacity: number;
}>;

export type AdmissionPolicy = Readonly<{
  asks: AdmissionScopePolicy<"owner">;
  publicReads: AdmissionScopePolicy<"source">;
  recoveryStart: AdmissionScopePolicy<"source">;
  /** DL1-F2. `null` when the resolved register version carries no such budget. */
  supportReads: AdmissionScopePolicy<"source"> | null;
  supportSessions: AdmissionScopePolicy<"owner"> | null;
  /** DL1-F7. One source's share of the global daily model-call cap. */
  supportModelCalls: AdmissionScopePolicy<"source"> | null;
  sourceRef: string;
}>;

/**
 * B10 admission budgets. The mechanism is ruled by the plan; the numbers are
 * proposals until V rules on V-1, after which a new versioned row carries the
 * ratified values. `capacity` bounds the distinct keys a process tracks per
 * scope; beyond it new keys are refused, never admitted unbounded.
 */
export const ADMISSION_POLICY_REGISTER_ROW = Object.freeze({
  rowKey: ADMISSION_POLICY_ROW_KEY,
  sourceRef: "PLAN B10 proposed values, V ratification pending (V-1); L1-F1; L1-F2"
    + " + PLAN B25a recovery_start, V ratification pending (V-12); L1-F3",
  value: Object.freeze({
    kind: "ADMISSION_POLICY" as const,
    // Model spend per authenticated user: 20 asks per hour per owner.
    asks: Object.freeze({ key: "owner" as const, limit: 20, window_ms: 60 * 60_000, capacity: 8_192 }),
    // Anonymous corpus decryption: 120 public reads per 15 minutes per source.
    public_reads: Object.freeze({ key: "source" as const, limit: 120, window_ms: 15 * 60_000, capacity: 65_536 }),
    // Unauthenticated recovery starts: 15 per hour per source, mirroring the
    // sealed resend per-IP ceiling. Keyed by source and never by address, so
    // the refusal carries no signal about whether an account exists.
    recovery_start: Object.freeze({ key: "source" as const, limit: 15, window_ms: 60 * 60_000, capacity: 65_536 })
  })
});

/**
 * DL1-F2. The SUPERSEDING admission row: the sealed values above, republished
 * byte for byte, plus the two budgets the support surface had none of. It is a
 * new DEPLOYMENT version and never an edit (constraint 5).
 *
 * Why these numbers, for the owner to rule on with V-1:
 *
 * `support_reads` — 240 per 15 minutes per source, the same window and key
 * table as `public_reads` and twice its limit. One help-page visit makes
 * several support reads (the status poll, a session read, a case read) where a
 * library visit makes one, so half of a per-read budget would refuse an
 * ordinary visitor. At 16 reads a minute a person is never touched, while a
 * flood that used to run the uncached `/status` aggregate without bound now
 * costs one refusal per extra call.
 *
 * `support_sessions` — 10 per hour per owner, the same key table size as
 * `asks`. A signed-in account that opens a support conversation opens one, or a
 * few after a mistake; ten an hour is far past any real use and stops the loop
 * that made a KEK wrap plus two inserts per call with nothing in the way.
 * Anonymous creation keeps its own per-IP window (`admitIpSession`), so this
 * budget is about the authenticated path the finding names.
 *
 * `support_model_calls` — DL1-F7. 40 per rolling 24 hours per source, against a
 * sealed global daily cap of 500 (`support_daily_call_cap`). The global cap is
 * one bucket, so about five determined sources could take a whole day's calls
 * and leave everyone else DEGRADED until the UTC day turned. A share of 8%
 * means it takes at least thirteen distinct sources to exhaust the day, while
 * forty model answers is far past what one person asks a help widget. The
 * window is a rolling 24 hours rather than the UTC day the durable cap uses,
 * because this budget is a per-process fairness rule, not the spend ledger; the
 * spend ledger is untouched and still authoritative.
 */
export const ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: ADMISSION_POLICY_ROW_KEY,
  sourceRef: `${ADMISSION_POLICY_REGISTER_ROW.sourceRef}`
    + " + DL1-F2 support_reads/support_sessions and DL1-F7 support_model_calls,"
    + " V ratification pending (V-1)",
  value: Object.freeze({
    ...ADMISSION_POLICY_REGISTER_ROW.value,
    support_reads: Object.freeze({
      key: "source" as const, limit: 240, window_ms: 15 * 60_000, capacity: 65_536
    }),
    support_sessions: Object.freeze({
      key: "owner" as const, limit: 10, window_ms: 60 * 60_000, capacity: 8_192
    }),
    support_model_calls: Object.freeze({
      key: "source" as const, limit: 40, window_ms: 24 * 60 * 60_000, capacity: 65_536
    })
  })
});

export function admissionPolicyFromValue(value: unknown, sourceRef: string): AdmissionPolicy {
  const parsed = admissionPolicyValueSchema.safeParse(value);
  if (!parsed.success || sourceRef.trim() === "") {
    throw new TypedDomainError("ADMISSION_POLICY_INVALID", "The sealed admission policy is absent or malformed");
  }
  const policy = parsed.data;
  return Object.freeze({
    asks: Object.freeze({
      key: policy.asks.key,
      limit: policy.asks.limit,
      windowMs: policy.asks.window_ms,
      capacity: policy.asks.capacity
    }),
    publicReads: Object.freeze({
      key: policy.public_reads.key,
      limit: policy.public_reads.limit,
      windowMs: policy.public_reads.window_ms,
      capacity: policy.public_reads.capacity
    }),
    recoveryStart: Object.freeze({
      key: policy.recovery_start.key,
      limit: policy.recovery_start.limit,
      windowMs: policy.recovery_start.window_ms,
      capacity: policy.recovery_start.capacity
    }),
    supportReads: policy.support_reads === undefined ? null : Object.freeze({
      key: policy.support_reads.key,
      limit: policy.support_reads.limit,
      windowMs: policy.support_reads.window_ms,
      capacity: policy.support_reads.capacity
    }),
    supportSessions: policy.support_sessions === undefined ? null : Object.freeze({
      key: policy.support_sessions.key,
      limit: policy.support_sessions.limit,
      windowMs: policy.support_sessions.window_ms,
      capacity: policy.support_sessions.capacity
    }),
    supportModelCalls: policy.support_model_calls === undefined ? null : Object.freeze({
      key: policy.support_model_calls.key,
      limit: policy.support_model_calls.limit,
      windowMs: policy.support_model_calls.window_ms,
      capacity: policy.support_model_calls.capacity
    }),
    sourceRef
  });
}

export async function readAdmissionPolicy(pool: Pool, registerVersion: number): Promise<AdmissionPolicy> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, ADMISSION_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError("ADMISSION_POLICY_UNRESOLVED", `No ${ADMISSION_POLICY_ROW_KEY}@${registerVersion} exists`);
  }
  return admissionPolicyFromValue(row.value_json, row.source_ref);
}
