import type { Pool } from "pg";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";

export const RECOVERY_POLICY_ROW_KEY = "recoveryPolicy" as const;

const recoveryPolicyValueSchema = z.object({
  kind: z.literal("RECOVERY_POLICY"),
  policy_version: z.literal(1),
  duration_basis: z.literal("PROVISIONAL_ENGINEERING_JUDGEMENT_WITHIN_RATIFIED_BOUNDS"),
  tier_thresholds: z.object({
    T1: z.object({ maximum_elapsed_ms_exclusive: z.literal(300_000) }).strict(),
    T2: z.object({ maximum_elapsed_ms_exclusive: z.literal(1_800_000) }).strict(),
    T3: z.object({
      minimum_freeze_ms: z.literal(604_800_000),
      maximum_freeze_ms: z.literal(1_209_600_000),
      selection: z.literal("SERVER_PINNED_WITHIN_RANGE")
    }).strict()
  }).strict(),
  retry: z.object({
    maximum_active_attempts_per_account: z.literal(1),
    proof_failures_per_attempt: z.literal(5),
    per_source_across_accounts: z.literal(20),
    window_ms: z.literal(300_000),
    temporary_lock_ms: z.literal(300_000),
    permanent_remote_lockout: z.literal(false),
    preserve_original_delay_anchor: z.literal(true)
  }).strict(),
  risk_signals: z.object({
    raw_signal_retention_ms: z.literal(7_776_000_000),
    maximum_evaluator_signals:z.literal(128),
    cleanup_batch_max:z.literal(1_000)
  }).strict(),
  notification: z.object({
    recipients: z.tuple([
      z.literal("EVERY_HISTORICALLY_BOUND_SUPPORTED_CHANNEL"),
      z.literal("IN_PRODUCT_SECURITY_FEED")
    ]),
    events: z.tuple([
      z.literal("STARTED"),
      z.literal("DELAY_STARTED"),
      z.literal("DELAY_MIDPOINT"),
      z.literal("DELAY_24H_REMAINING"),
      z.literal("CANCELLED"),
      z.literal("REFUSED"),
      z.literal("COMPLETED")
    ]),
    delay_schedule: z.tuple([
      z.literal("DAY_ZERO"),
      z.literal("MIDPOINT"),
      z.literal("TWENTY_FOUR_HOURS_BEFORE_DUE")
    ]),
    start_ordering: z.literal("DURABLY_ENQUEUE_BEFORE_PROOF_OUTCOME_OR_TIER_DISCLOSURE"),
    payload_forbidden: z.tuple([
      z.literal("PASSWORD"),
      z.literal("AUTHENTICATOR_SECRET"),
      z.literal("RECOVERY_CODE"),
      z.literal("ISSUED_CODE"),
      z.literal("INTERNAL_ACCOUNT_ID"),
      z.literal("PROOF_ANSWER")
    ])
  }).strict(),
  degradation: z.object({
    post_cancel_recovery_lock_ms: z.literal(86_400_000),
    last_factor_removal_hold: z.object({
      minimum_ms: z.literal(86_400_000),
      maximum_ms: z.literal(259_200_000),
      selection: z.literal("SERVER_PINNED_WITHIN_RANGE")
    }).strict(),
    T2_heightened_monitoring_ms: z.literal(604_800_000),
    T3_heightened_monitoring_ms: z.literal(2_592_000_000),
    T3_restriction_ms: z.literal(2_592_000_000),
    restricted_allowed: z.tuple([
      z.literal("READ"),
      z.literal("CREATE_PRIVATE_DEBATE")
    ]),
    restricted_denied: z.tuple([
      z.literal("PUBLISH"),
      z.literal("DELETE"),
      z.literal("EXPORT"),
      z.literal("CHANGE_CONTACT"),
      z.literal("CHANGE_FACTOR"),
      z.literal("PRIVILEGED_ROUTE")
    ]),
    restoration_conditions: z.tuple([
      z.literal("T3_RESTRICTION_MS_ELAPSED"),
      z.literal("STRONGER_PROOF_COMPLETED")
    ])
  }).strict(),
  public_response: z.literal("ENUMERATION_RESISTANT_GENERIC")
}).strict();

export type RecoveryPolicyValue = z.infer<typeof recoveryPolicyValueSchema>;

export type RecoveryPolicyRegisterRow = Readonly<{
  rowKey: typeof RECOVERY_POLICY_ROW_KEY;
  value: unknown;
  sourceRef: string;
}>;

export type RecoveryPolicy = Readonly<{
  policyVersion: 1;
  durationBasis: "PROVISIONAL_ENGINEERING_JUDGEMENT_WITHIN_RATIFIED_BOUNDS";
  tierThresholds: Readonly<{
    T1: Readonly<{ maximumElapsedMsExclusive: 300_000 }>;
    T2: Readonly<{ maximumElapsedMsExclusive: 1_800_000 }>;
    T3: Readonly<{
      minimumFreezeMs: 604_800_000;
      maximumFreezeMs: 1_209_600_000;
      selection: "SERVER_PINNED_WITHIN_RANGE";
    }>;
  }>;
  retry: Readonly<{
    maximumActiveAttemptsPerAccount: 1;
    proofFailuresPerAttempt: 5;
    perSourceAcrossAccounts: 20;
    windowMs: 300_000;
    temporaryLockMs: 300_000;
    permanentRemoteLockout: false;
    preserveOriginalDelayAnchor: true;
  }>;
  riskSignals: Readonly<{
    rawSignalRetentionMs:7_776_000_000;
    maximumEvaluatorSignals:128;
    cleanupBatchMax:1_000;
  }>;
  notification: Readonly<{
    recipients: readonly ["EVERY_HISTORICALLY_BOUND_SUPPORTED_CHANNEL", "IN_PRODUCT_SECURITY_FEED"];
    events: readonly ["STARTED", "DELAY_STARTED", "DELAY_MIDPOINT", "DELAY_24H_REMAINING", "CANCELLED", "REFUSED", "COMPLETED"];
    delaySchedule: readonly ["DAY_ZERO", "MIDPOINT", "TWENTY_FOUR_HOURS_BEFORE_DUE"];
    startOrdering: "DURABLY_ENQUEUE_BEFORE_PROOF_OUTCOME_OR_TIER_DISCLOSURE";
    payloadForbidden: readonly ["PASSWORD", "AUTHENTICATOR_SECRET", "RECOVERY_CODE", "ISSUED_CODE", "INTERNAL_ACCOUNT_ID", "PROOF_ANSWER"];
  }>;
  degradation: Readonly<{
    postCancelRecoveryLockMs: 86_400_000;
    lastFactorRemovalHold: Readonly<{
      minimumMs: 86_400_000;
      maximumMs: 259_200_000;
      selection: "SERVER_PINNED_WITHIN_RANGE";
    }>;
    T2HeightenedMonitoringMs: 604_800_000;
    T3HeightenedMonitoringMs: 2_592_000_000;
    T3RestrictionMs: 2_592_000_000;
    restrictedAllowed: readonly ["READ", "CREATE_PRIVATE_DEBATE"];
    restrictedDenied: readonly ["PUBLISH", "DELETE", "EXPORT", "CHANGE_CONTACT", "CHANGE_FACTOR", "PRIVILEGED_ROUTE"];
    restorationConditions: readonly ["T3_RESTRICTION_MS_ELAPSED", "STRONGER_PROOF_COMPLETED"];
  }>;
  publicResponse: "ENUMERATION_RESISTANT_GENERIC";
  sourceRef: string;
}>;

export const RECOVERY_POLICY_REGISTER_ROW = Object.freeze({
  rowKey: RECOVERY_POLICY_ROW_KEY,
  value: Object.freeze({
    kind: "RECOVERY_POLICY" as const,
    policy_version: 1 as const,
    duration_basis: "PROVISIONAL_ENGINEERING_JUDGEMENT_WITHIN_RATIFIED_BOUNDS" as const,
    tier_thresholds: Object.freeze({
      T1: Object.freeze({ maximum_elapsed_ms_exclusive: 300_000 as const }),
      T2: Object.freeze({ maximum_elapsed_ms_exclusive: 1_800_000 as const }),
      T3: Object.freeze({
        minimum_freeze_ms: 604_800_000 as const,
        maximum_freeze_ms: 1_209_600_000 as const,
        selection: "SERVER_PINNED_WITHIN_RANGE" as const
      })
    }),
    retry: Object.freeze({
      maximum_active_attempts_per_account: 1 as const,
      proof_failures_per_attempt: 5 as const,
      per_source_across_accounts: 20 as const,
      window_ms: 300_000 as const,
      temporary_lock_ms: 300_000 as const,
      permanent_remote_lockout: false as const,
      preserve_original_delay_anchor: true as const
    }),
    risk_signals:Object.freeze({
      raw_signal_retention_ms:7_776_000_000 as const,
      maximum_evaluator_signals:128 as const,
      cleanup_batch_max:1_000 as const
    }),
    notification: Object.freeze({
      recipients: Object.freeze([
        "EVERY_HISTORICALLY_BOUND_SUPPORTED_CHANNEL",
        "IN_PRODUCT_SECURITY_FEED"
      ] as const),
      events: Object.freeze([
        "STARTED", "DELAY_STARTED", "DELAY_MIDPOINT", "DELAY_24H_REMAINING",
        "CANCELLED", "REFUSED", "COMPLETED"
      ] as const),
      delay_schedule: Object.freeze([
        "DAY_ZERO", "MIDPOINT", "TWENTY_FOUR_HOURS_BEFORE_DUE"
      ] as const),
      start_ordering: "DURABLY_ENQUEUE_BEFORE_PROOF_OUTCOME_OR_TIER_DISCLOSURE" as const,
      payload_forbidden: Object.freeze([
        "PASSWORD", "AUTHENTICATOR_SECRET", "RECOVERY_CODE", "ISSUED_CODE",
        "INTERNAL_ACCOUNT_ID", "PROOF_ANSWER"
      ] as const)
    }),
    degradation: Object.freeze({
      post_cancel_recovery_lock_ms: 86_400_000 as const,
      last_factor_removal_hold: Object.freeze({
        minimum_ms: 86_400_000 as const,
        maximum_ms: 259_200_000 as const,
        selection: "SERVER_PINNED_WITHIN_RANGE" as const
      }),
      T2_heightened_monitoring_ms: 604_800_000 as const,
      T3_heightened_monitoring_ms: 2_592_000_000 as const,
      T3_restriction_ms: 2_592_000_000 as const,
      restricted_allowed: Object.freeze(["READ", "CREATE_PRIVATE_DEBATE"] as const),
      restricted_denied: Object.freeze([
        "PUBLISH", "DELETE", "EXPORT", "CHANGE_CONTACT", "CHANGE_FACTOR", "PRIVILEGED_ROUTE"
      ] as const),
      restoration_conditions: Object.freeze([
        "T3_RESTRICTION_MS_ELAPSED", "STRONGER_PROOF_COMPLETED"
      ] as const)
    }),
    public_response: "ENUMERATION_RESISTANT_GENERIC" as const
  }),
  sourceRef: "P2-01-account-recovery-state-machine.json; wave-2-target-architecture.md#10.3; MFA recovery research M15/M23"
} satisfies RecoveryPolicyRegisterRow);

function immutableTuple<T extends readonly unknown[]>(value: T): T {
  return Object.freeze([...value]) as unknown as T;
}

export function recoveryPolicyFromRegisterRows(
  rows: readonly RecoveryPolicyRegisterRow[]
): RecoveryPolicy {
  if (rows.length === 0) {
    throw new TypedDomainError("RECOVERY_POLICY_UNRESOLVED", "The sealed recovery policy is absent");
  }
  if (rows.length > 1) {
    throw new TypedDomainError("RECOVERY_POLICY_DUPLICATE", "The sealed recovery policy is duplicated");
  }
  const row = rows[0]!;
  if (row.rowKey !== RECOVERY_POLICY_ROW_KEY) {
    throw new TypedDomainError("RECOVERY_POLICY_INVALID", "The sealed recovery policy row key is invalid");
  }
  const parsed = recoveryPolicyValueSchema.safeParse(row.value);
  if (!parsed.success) {
    throw new TypedDomainError("RECOVERY_POLICY_INVALID", "The sealed recovery policy is malformed");
  }
  if (row.sourceRef.trim() === "") {
    throw new TypedDomainError("RECOVERY_POLICY_PROVENANCE_MISSING", "The sealed recovery policy has no source_ref");
  }
  const value = parsed.data;
  return Object.freeze({
    policyVersion: value.policy_version,
    durationBasis: value.duration_basis,
    tierThresholds: Object.freeze({
      T1: Object.freeze({ maximumElapsedMsExclusive: value.tier_thresholds.T1.maximum_elapsed_ms_exclusive }),
      T2: Object.freeze({ maximumElapsedMsExclusive: value.tier_thresholds.T2.maximum_elapsed_ms_exclusive }),
      T3: Object.freeze({
        minimumFreezeMs: value.tier_thresholds.T3.minimum_freeze_ms,
        maximumFreezeMs: value.tier_thresholds.T3.maximum_freeze_ms,
        selection: value.tier_thresholds.T3.selection
      })
    }),
    retry: Object.freeze({
      maximumActiveAttemptsPerAccount: value.retry.maximum_active_attempts_per_account,
      proofFailuresPerAttempt: value.retry.proof_failures_per_attempt,
      perSourceAcrossAccounts: value.retry.per_source_across_accounts,
      windowMs: value.retry.window_ms,
      temporaryLockMs: value.retry.temporary_lock_ms,
      permanentRemoteLockout: value.retry.permanent_remote_lockout,
      preserveOriginalDelayAnchor: value.retry.preserve_original_delay_anchor
    }),
    riskSignals:Object.freeze({
      rawSignalRetentionMs:value.risk_signals.raw_signal_retention_ms,
      maximumEvaluatorSignals:value.risk_signals.maximum_evaluator_signals,
      cleanupBatchMax:value.risk_signals.cleanup_batch_max
    }),
    notification: Object.freeze({
      recipients: immutableTuple(value.notification.recipients),
      events: immutableTuple(value.notification.events),
      delaySchedule: immutableTuple(value.notification.delay_schedule),
      startOrdering: value.notification.start_ordering,
      payloadForbidden: immutableTuple(value.notification.payload_forbidden)
    }),
    degradation: Object.freeze({
      postCancelRecoveryLockMs: value.degradation.post_cancel_recovery_lock_ms,
      lastFactorRemovalHold: Object.freeze({
        minimumMs: value.degradation.last_factor_removal_hold.minimum_ms,
        maximumMs: value.degradation.last_factor_removal_hold.maximum_ms,
        selection: value.degradation.last_factor_removal_hold.selection
      }),
      T2HeightenedMonitoringMs: value.degradation.T2_heightened_monitoring_ms,
      T3HeightenedMonitoringMs: value.degradation.T3_heightened_monitoring_ms,
      T3RestrictionMs: value.degradation.T3_restriction_ms,
      restrictedAllowed: immutableTuple(value.degradation.restricted_allowed),
      restrictedDenied: immutableTuple(value.degradation.restricted_denied),
      restorationConditions: immutableTuple(value.degradation.restoration_conditions)
    }),
    publicResponse: value.public_response,
    sourceRef: row.sourceRef
  });
}

export async function readRecoveryPolicy(pool: Pool, registerVersion: number): Promise<RecoveryPolicy> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("A positive register version is required for recovery policy");
  }
  const result = await pool.query<{
    row_key: string;
    value_json: unknown;
    source_ref: string;
    sealed: boolean;
    declared_row_count: number;
    actual_row_count: string;
  }>(
    `SELECT row.row_key,row.value_json,row.source_ref,version.sealed,
            version.row_count AS declared_row_count,
            (SELECT count(*)::text FROM register.register_row AS counted
             WHERE counted.register_version=row.register_version) AS actual_row_count
     FROM register.register_row AS row
     JOIN register.register_version AS version USING (register_version)
     WHERE row.register_version=$1 AND row.row_key=$2`,
    [registerVersion, RECOVERY_POLICY_ROW_KEY]
  );
  if (result.rows.some((row) => !row.sealed)) {
    throw new TypedDomainError(
      "RECOVERY_POLICY_REGISTER_UNSEALED",
      `Register version ${registerVersion} is not sealed`
    );
  }
  if (result.rows.some((row) => Number(row.declared_row_count) !== Number(row.actual_row_count))) {
    throw new TypedDomainError(
      "RECOVERY_POLICY_REGISTER_COUNT_MISMATCH",
      `Register version ${registerVersion} does not match its sealed row count`
    );
  }
  return recoveryPolicyFromRegisterRows(result.rows.map((row) => ({
    rowKey: row.row_key as typeof RECOVERY_POLICY_ROW_KEY,
    value: row.value_json,
    sourceRef: row.source_ref
  })));
}
