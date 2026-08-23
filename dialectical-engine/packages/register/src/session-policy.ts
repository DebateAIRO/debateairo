import type { Pool } from "pg";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";

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

export const SESSION_POLICY_REGISTER_ROW = Object.freeze({
  rowKey: SESSION_POLICY_ROW_KEY,
  sourceRef: "DR-179; wave-2-target-architecture:session-security; S5-binding-contract",
  value: Object.freeze({
    kind: "SESSION_POLICY" as const,
    token_bytes: 32 as const,
    csrf_token_bytes: 32 as const,
    login_challenge_ttl_ms: 5 * 60 * 1_000,
    idle_ttl_ms: 14 * 24 * 60 * 60 * 1_000,
    absolute_ttl_ms: 90 * 24 * 60 * 60 * 1_000,
    cookie: Object.freeze({
      session_name: "__Host-debateai-session" as const,
      csrf_name: "__Host-debateai-csrf" as const,
      path: "/" as const,
      secure: true as const,
      http_only: true as const,
      same_site: "Lax" as const
    }),
    // Step-up creates a new session/CSRF generation. S7 may require this
    // timestamp for a sensitive route but cannot extend it at the caller.
    step_up_freshness_ms: 5 * 60 * 1_000
  })
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
