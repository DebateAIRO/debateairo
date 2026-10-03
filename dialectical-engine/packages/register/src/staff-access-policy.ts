import type { Pool } from "pg";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { InternalAllowancePolicy, StaffAccessPolicy } from "@debateai/kernel";
import { internalAllowancePolicyFromValue, internalAllowancePolicyValue } from "./internal-allowance-policy.js";
export { internalAllowancePolicyFromValue } from "./internal-allowance-policy.js";
import { canonicalDecimal, canonicalRegisterJson } from "./register-publication.js";
import { PRODUCT_ROLE_POLICY_REGISTER_ROW, PRODUCT_ROLE_POLICY_V2_REGISTER_ROW, PRODUCT_ROLE_POLICY_FUNDED_V2_REGISTER_ROW, PRODUCT_ROLE_POLICY_ROW_KEY } from "./product-role-policy.js";
import type { CanonicalJsonAst, RegisterPublicationRow } from "./register-publication.js";

export const STAFF_ACCESS_POLICY_ROW_KEY = "staffAccessPolicy" as const;
export const INTERNAL_ALLOWANCE_POLICY_ROW_KEY = "internalAllowancePolicy" as const;
export const STAFF_POLICY_SOURCE_REF = "v3-owner-access-runbook.md#step6c1-one-key-owner-amendment";

const staffAccessPolicyValueSchema = z.object({
  kind: z.literal("STAFF_ACCESS_POLICY"), policy_version: z.literal(2),
  cookie_name: z.literal("__Host-debateai-staff"),
  csrf_cookie_name: z.literal("__Host-debateai-staff-csrf"),
  token_bytes: z.literal(32),
  cookie_http_only: z.literal(true),
  csrf_cookie_http_only: z.literal(false),
  cookie_secure: z.literal(true),
  cookie_path: z.literal("/"),
  cookie_same_site: z.literal("Strict"),
  token_storage: z.literal("HASH_ONLY"),
  challenge_single_use: z.literal(true),
  action_proof_single_use: z.literal(true),
  prerequisite_single_use: z.literal(true),
  invitation_single_use: z.literal(true),
  owner_command_single_use: z.literal(true),
  ordinary_session_required: z.literal(true),
  positive_authority_cache: z.literal(false),
  attestation: z.literal("none"),
  cross_origin: z.literal("DENIED"),
  origin_policy: z.literal("EXACT_PUBLIC_APP_URL_ORIGIN"),
  rp_id_policy: z.literal("EXACT_PUBLIC_APP_URL_HOSTNAME"),
  independent_alert_required: z.literal(true),
  idle_lifetime_ms: z.literal(900000), absolute_lifetime_ms: z.literal(28800000),
  challenge_lifetime_ms: z.literal(300000), action_proof_lifetime_ms: z.literal(300000),
  prerequisite_lifetime_ms: z.literal(300000), owner_command_lifetime_ms: z.literal(300000),
  invitation_lifetime_ms: z.literal(86400000), epoch_poll_interval_ms: z.literal(1000),
  external_operation_timeout_ms: z.literal(5000), owner_credential_minimum: z.literal(1),
  delegated_credential_minimum: z.literal(1), user_verification: z.literal("required"),
  backup_eligible: z.literal(false), backed_up: z.literal(false),
  algorithms: z.tuple([z.literal(-7), z.literal(-257)]),
  ceremony_body_max_bytes: z.literal(32768), challenge_max_failures: z.literal(5),
  active_capabilities: z.tuple([z.literal("TEAM_READ"), z.literal("TEAM_INVITE"), z.literal("TEAM_GRANT"),
    z.literal("TEAM_DISABLE"), z.literal("AUDIT_READ"), z.literal("EMERGENCY_DISABLE")]),
  delegated_capabilities: z.tuple([z.literal("TEAM_READ"), z.literal("AUDIT_READ"), z.literal("EMERGENCY_DISABLE")])
}).strict();

const fundedStaffAccessPolicyValueSchema = staffAccessPolicyValueSchema.extend({
  funding_policy_version: z.literal(1),
  active_capabilities: z.tuple([
    z.literal("TEAM_READ"), z.literal("TEAM_INVITE"), z.literal("TEAM_GRANT"), z.literal("TEAM_DISABLE"),
    z.literal("AUDIT_READ"), z.literal("EMERGENCY_DISABLE"), z.literal("ALLOWANCE_WRITE")
  ])
}).strict();

function publicationAst(value: unknown): CanonicalJsonAst {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return canonicalDecimal(String(value));
  if (Array.isArray(value)) return Object.freeze(value.map(publicationAst));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, member]) => [key, publicationAst(member)])));
  }
  throw new TypeError("STAFF_POLICY_PUBLICATION_INVALID");
}
function publicationRow<Key extends string>(rowKey: Key, value: unknown) {
  const valueAst = publicationAst(value);
  return Object.freeze({ rowKey, valueAst, value: JSON.parse(canonicalRegisterJson(valueAst)) as unknown, sourceRef: STAFF_POLICY_SOURCE_REF });
}
export const STAFF_ACCESS_POLICY_REGISTER_ROW = publicationRow(STAFF_ACCESS_POLICY_ROW_KEY, {
  kind: "STAFF_ACCESS_POLICY", policy_version: 2,
  cookie_name: "__Host-debateai-staff",
  csrf_cookie_name: "__Host-debateai-staff-csrf",
  token_bytes: 32,
  cookie_http_only: true,
  csrf_cookie_http_only: false,
  cookie_secure: true,
  cookie_path: "/",
  cookie_same_site: "Strict",
  token_storage: "HASH_ONLY",
  challenge_single_use: true,
  action_proof_single_use: true,
  prerequisite_single_use: true,
  invitation_single_use: true,
  owner_command_single_use: true,
  ordinary_session_required: true,
  positive_authority_cache: false,
  attestation: "none",
  cross_origin: "DENIED",
  origin_policy: "EXACT_PUBLIC_APP_URL_ORIGIN",
  rp_id_policy: "EXACT_PUBLIC_APP_URL_HOSTNAME",
  independent_alert_required: true,
  idle_lifetime_ms: 900000, absolute_lifetime_ms: 28800000,
  challenge_lifetime_ms: 300000, action_proof_lifetime_ms: 300000,
  prerequisite_lifetime_ms: 300000, owner_command_lifetime_ms: 300000,
  invitation_lifetime_ms: 86400000, epoch_poll_interval_ms: 1000,
  external_operation_timeout_ms: 5000, owner_credential_minimum: 1,
  delegated_credential_minimum: 1, user_verification: "required", backup_eligible: false, backed_up: false,
  algorithms: [-7, -257], ceremony_body_max_bytes: 32768, challenge_max_failures: 5,
  active_capabilities: ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE"],
  delegated_capabilities: ["TEAM_READ", "AUDIT_READ", "EMERGENCY_DISABLE"]
});
export const INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW = publicationRow(INTERNAL_ALLOWANCE_POLICY_ROW_KEY, { enabled: false });

export function staffAccessPolicyFromValue(value: unknown, sourceRef: string): StaffAccessPolicy {
  const parsed = z.union([staffAccessPolicyValueSchema, fundedStaffAccessPolicyValueSchema]).safeParse(value);
  if (!parsed.success) throw new TypedDomainError("STAFF_ACCESS_POLICY_INVALID", "The staff access policy is malformed");
  if (sourceRef.trim() === "") throw new TypedDomainError("STAFF_ACCESS_POLICY_PROVENANCE_MISSING", "The staff access policy has no source_ref");
  const policy = parsed.data;
  return Object.freeze({
    policyVersion: policy.policy_version,
    ...('funding_policy_version' in policy ? { fundingPolicyVersion: 1 as const } : {}),
    cookieName: policy.cookie_name,
    csrfCookieName: policy.csrf_cookie_name,
    tokenBytes: policy.token_bytes,
    cookieHttpOnly: policy.cookie_http_only,
    csrfCookieHttpOnly: policy.csrf_cookie_http_only,
    cookieSecure: policy.cookie_secure,
    cookiePath: policy.cookie_path,
    cookieSameSite: policy.cookie_same_site,
    tokenStorage: policy.token_storage,
    challengeSingleUse: policy.challenge_single_use,
    actionProofSingleUse: policy.action_proof_single_use,
    prerequisiteSingleUse: policy.prerequisite_single_use,
    invitationSingleUse: policy.invitation_single_use,
    ownerCommandSingleUse: policy.owner_command_single_use,
    ordinarySessionRequired: policy.ordinary_session_required,
    positiveAuthorityCache: policy.positive_authority_cache,
    attestation: policy.attestation,
    crossOrigin: policy.cross_origin,
    originPolicy: policy.origin_policy,
    rpIdPolicy: policy.rp_id_policy,
    independentAlertRequired: policy.independent_alert_required,
    idleLifetimeMs: policy.idle_lifetime_ms, absoluteLifetimeMs: policy.absolute_lifetime_ms,
    challengeLifetimeMs: policy.challenge_lifetime_ms, actionProofLifetimeMs: policy.action_proof_lifetime_ms,
    prerequisiteLifetimeMs: policy.prerequisite_lifetime_ms, ownerCommandLifetimeMs: policy.owner_command_lifetime_ms,
    invitationLifetimeMs: policy.invitation_lifetime_ms, epochPollIntervalMs: policy.epoch_poll_interval_ms,
    externalOperationTimeoutMs: policy.external_operation_timeout_ms, ownerCredentialMinimum: policy.owner_credential_minimum,
    delegatedCredentialMinimum: policy.delegated_credential_minimum, userVerification: policy.user_verification,
    backupEligible: policy.backup_eligible, backedUp: policy.backed_up, algorithms: Object.freeze(policy.algorithms),
    ceremonyBodyMaxBytes: policy.ceremony_body_max_bytes, challengeMaxFailures: policy.challenge_max_failures,
    activeCapabilities: Object.freeze(policy.active_capabilities), delegatedCapabilities: Object.freeze(policy.delegated_capabilities), sourceRef
  }) as StaffAccessPolicy;
}

type PolicyRow = { row_key: string; value_json: unknown; source_ref: string; sealed: boolean; declared_row_count: number; actual_row_count: string };
async function readSealedPolicy(pool: Pool, registerVersion: number, rowKey: string, prefix: string): Promise<PolicyRow> {
  if (!Number.isSafeInteger(registerVersion) || registerVersion < 1) throw new TypeError("A positive safe register version is required for staff policy");
  const result = await pool.query<PolicyRow>(
    `SELECT row.row_key,row.value_json,row.source_ref,version.sealed,
            version.row_count AS declared_row_count,
            (SELECT count(*)::text FROM register.register_row AS counted
             WHERE counted.register_version=row.register_version) AS actual_row_count
     FROM register.register_row AS row
     JOIN register.register_version AS version USING (register_version)
     WHERE row.register_version=$1 AND row.row_key=$2`, [registerVersion, rowKey]);
  if (result.rows.length === 0) throw new TypedDomainError(`${prefix}_UNRESOLVED`, "The sealed staff policy is absent");
  if (result.rows.length !== 1) throw new TypedDomainError(`${prefix}_DUPLICATE`, "The sealed staff policy is duplicated");
  const row = result.rows[0]!;
  if (row.row_key !== rowKey) throw new TypedDomainError(`${prefix}_INVALID`, "The staff policy row key is invalid");
  if (row.sealed !== true) throw new TypedDomainError(`${prefix}_REGISTER_UNSEALED`, "The staff policy register is unsealed");
  if (!Number.isSafeInteger(row.declared_row_count) || row.declared_row_count < 1
    || !/^[1-9][0-9]*$/u.test(row.actual_row_count) || BigInt(row.declared_row_count) !== BigInt(row.actual_row_count)) {
    throw new TypedDomainError(`${prefix}_REGISTER_COUNT_MISMATCH`, "The staff policy register count does not match its seal");
  }
  return row;
}
export async function readStaffAccessPolicy(pool: Pool, registerVersion: number, fundingPolicyVersion?: 1): Promise<StaffAccessPolicy> {
  const row = await readSealedPolicy(pool, registerVersion, STAFF_ACCESS_POLICY_ROW_KEY, "STAFF_ACCESS_POLICY");
  const policy = staffAccessPolicyFromValue(row.value_json, row.source_ref);
  if (policy.fundingPolicyVersion !== fundingPolicyVersion) throw new TypedDomainError("STAFF_ACCESS_POLICY_VARIANT_MISMATCH", "The selected staff policy variant does not match");
  return policy;
}
export async function readInternalAllowancePolicy(pool: Pool, registerVersion: number): Promise<InternalAllowancePolicy> {
  const row = await readSealedPolicy(pool, registerVersion, INTERNAL_ALLOWANCE_POLICY_ROW_KEY, "INTERNAL_ALLOWANCE_POLICY");
  return internalAllowancePolicyFromValue(row.value_json, row.source_ref);
}

/** Produces proposal rows only. Historical bootstrap and default deployment composers keep v1. */
export function composeStaffPolicyRegisterPublicationRows(
  rows: readonly RegisterPublicationRow[], selection: Readonly<{ policyVersion: 1 | 2; internalAllowance?: Extract<InternalAllowancePolicy, { enabled: true }> }>
): readonly RegisterPublicationRow[] {
  if (selection.policyVersion === 1) {
    if (selection.internalAllowance !== undefined) throw new TypeError("STAFF_POLICY_PUBLICATION_VERSION_INVALID");
    return rows;
  }
  if (selection.policyVersion !== 2) throw new TypeError("STAFF_POLICY_PUBLICATION_VERSION_INVALID");
  const originals = rows.filter((row) => row.rowKey === PRODUCT_ROLE_POLICY_ROW_KEY);
  if (originals.length !== 1 || new Set(rows.map((row) => row.rowKey)).size !== rows.length
    || originals[0]!.valueJsonText !== canonicalRegisterJson(PRODUCT_ROLE_POLICY_REGISTER_ROW.valueAst)
    || originals[0]!.sourceRef !== PRODUCT_ROLE_POLICY_REGISTER_ROW.sourceRef
    || rows.some((row) => row.rowKey === STAFF_ACCESS_POLICY_ROW_KEY || row.rowKey === INTERNAL_ALLOWANCE_POLICY_ROW_KEY)) {
    throw new TypeError("STAFF_POLICY_PUBLICATION_BASE_INVALID");
  }
  const publication = (row: Readonly<{ rowKey: string; valueAst: CanonicalJsonAst; sourceRef: string }>): RegisterPublicationRow => Object.freeze({
    rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef
  });
  if (selection.internalAllowance === undefined) return Object.freeze([
    ...rows.map((row) => row.rowKey === PRODUCT_ROLE_POLICY_ROW_KEY ? publication(PRODUCT_ROLE_POLICY_V2_REGISTER_ROW) : row),
    publication(STAFF_ACCESS_POLICY_REGISTER_ROW), publication(INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW)
  ]);
  const allowance = internalAllowancePolicyValue(selection.internalAllowance);
  const staff = publicationRow(STAFF_ACCESS_POLICY_ROW_KEY, {
    ...(STAFF_ACCESS_POLICY_REGISTER_ROW.value as Record<string, unknown>), funding_policy_version: 1,
    active_capabilities: [...(STAFF_ACCESS_POLICY_REGISTER_ROW.value as { active_capabilities: string[] }).active_capabilities, "ALLOWANCE_WRITE"]
  });
  return Object.freeze([
    ...rows.map(row => row.rowKey === PRODUCT_ROLE_POLICY_ROW_KEY ? publication(PRODUCT_ROLE_POLICY_FUNDED_V2_REGISTER_ROW) : row),
    publication(staff), publication({ ...publicationRow(INTERNAL_ALLOWANCE_POLICY_ROW_KEY, allowance), sourceRef: selection.internalAllowance.sourceRef })
  ]);
}
