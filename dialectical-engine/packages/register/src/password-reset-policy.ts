import type { Pool } from "pg";
import { z } from "zod";
import { canonicalDecimal, canonicalRegisterJson } from "./register-publication.js";
export const PASSWORD_RESET_POLICY_ROW_KEY = "passwordResetPolicy" as const;
const schema = z.object({
  kind: z.literal("PASSWORD_RESET_POLICY"), policy_version: z.literal(1),
  proof: z.literal("VERIFIED_PRIMARY_EMAIL_AND_CURRENT_AUTHENTICATOR"),
  preserve_factor: z.literal(true), preserve_unused_recovery_codes: z.literal(true),
  maximum_elapsed_ms: z.literal(1800000), proof_failures_per_attempt: z.literal(5),
  per_source_across_accounts: z.literal(20), source_window_ms: z.literal(300000), cleanup_batch_max: z.literal(1000),
  public_response: z.literal("ENUMERATION_RESISTANT_GENERIC"),
  notification: z.literal("ALL_HISTORICALLY_BOUND_SUPPORTED_EMAIL_CHANNELS"), primary_proof_only: z.literal(true)
}).strict();
export type PasswordResetPolicyValue = z.infer<typeof schema>;
export type PasswordResetPolicy = Readonly<{
  maximumElapsedMs: 1800000;
  proofFailuresPerAttempt: 5;
  perSourceAcrossAccounts: 20;
  sourceWindowMs: 300000;
  cleanupBatchMax: 1000;
  sourceRef: string;
}>;
const valueAst = Object.freeze({ kind: "PASSWORD_RESET_POLICY", policy_version: canonicalDecimal("1"), proof: "VERIFIED_PRIMARY_EMAIL_AND_CURRENT_AUTHENTICATOR", preserve_factor: true, preserve_unused_recovery_codes: true, maximum_elapsed_ms: canonicalDecimal("1800000"), proof_failures_per_attempt: canonicalDecimal("5"), per_source_across_accounts: canonicalDecimal("20"), source_window_ms: canonicalDecimal("300000"), cleanup_batch_max: canonicalDecimal("1000"), public_response: "ENUMERATION_RESISTANT_GENERIC", notification: "ALL_HISTORICALLY_BOUND_SUPPORTED_EMAIL_CHANNELS", primary_proof_only: true });
export const PASSWORD_RESET_POLICY_REGISTER_ROW = Object.freeze({ rowKey: PASSWORD_RESET_POLICY_ROW_KEY, valueAst, value: JSON.parse(canonicalRegisterJson(valueAst)) as PasswordResetPolicyValue, sourceRef: "docs/operations/password-only-reset-2026-10-05/implementation-brief.json; verified-primary-email-and-current-authenticator" });
export function passwordResetPolicyFromValue(value: unknown, sourceRef: string): PasswordResetPolicy {
  const parsed = schema.safeParse(value);
  if (!parsed.success || typeof sourceRef !== "string" || !sourceRef.trim())
    throw new TypeError("PASSWORD_RESET_POLICY_INVALID");
  const v = parsed.data;
  return Object.freeze({ maximumElapsedMs: v.maximum_elapsed_ms, proofFailuresPerAttempt: v.proof_failures_per_attempt, perSourceAcrossAccounts: v.per_source_across_accounts, sourceWindowMs: v.source_window_ms, cleanupBatchMax: v.cleanup_batch_max, sourceRef });
}
/** Legacy sealed General publications remain usable, with this feature disabled. */
export async function readPasswordResetPolicy(pool: Pool, registerVersion: number): Promise<PasswordResetPolicy | null> {
  if (!Number.isSafeInteger(registerVersion) || registerVersion < 1)
    throw new TypeError("PASSWORD_RESET_POLICY_REGISTER_INVALID");
  const result = await pool.query<{
    value_json: unknown;
    source_ref: string;
    sealed: boolean;
    row_count: number;
    actual_count: string;
  }>(`SELECT r.value_json,r.source_ref,v.sealed,v.row_count,(SELECT count(*)::text FROM register.register_row x WHERE x.register_version=v.register_version) AS actual_count FROM register.register_row r JOIN register.register_version v USING(register_version) WHERE r.register_version=$1 AND r.row_key=$2`, [registerVersion, PASSWORD_RESET_POLICY_ROW_KEY]);
  if (result.rows.length === 0)
    return null;
  const row = result.rows[0]!;
  if (result.rows.length !== 1 || !row.sealed || row.row_count !== Number(row.actual_count))
    throw new TypeError("PASSWORD_RESET_POLICY_REGISTER_UNSEALED");
  return passwordResetPolicyFromValue(row.value_json, row.source_ref);
}
