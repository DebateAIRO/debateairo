import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { InternalAllowancePolicy } from "@debateai/kernel";

const finitePositive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const enabledInternalAllowancePolicyValueSchema = z.object({
  enabled: z.literal(true),
  funding_policy_version: z.literal(1),
  currency: z.literal("USD"),
  maximum_grant_micros: finitePositive,
  maximum_day_micros: finitePositive,
  maximum_week_micros: finitePositive,
  maximum_lifetime_ms: finitePositive.max(2678400000),
  finish_allowance_bp: z.literal(10000)
}).strict().refine(value => value.maximum_day_micros <= value.maximum_week_micros
  && value.maximum_week_micros <= value.maximum_grant_micros, "Finite daily, weekly and total limits must be ordered");
const policyValueSchema = z.union([
  z.object({ enabled: z.literal(false) }).strict(),
  enabledInternalAllowancePolicyValueSchema
]);

export function internalAllowancePolicyFromValue(value: unknown, sourceRef: string): InternalAllowancePolicy {
  const parsed = policyValueSchema.safeParse(value);
  if (!parsed.success) {
    throw new TypedDomainError("INTERNAL_ALLOWANCE_POLICY_INVALID", "The internal allowance policy is malformed");
  }
  if (typeof sourceRef !== "string" || sourceRef.trim() === "") {
    throw new TypedDomainError("INTERNAL_ALLOWANCE_POLICY_PROVENANCE_MISSING", "The internal allowance policy has no source_ref");
  }
  if (!parsed.data.enabled) return Object.freeze({ enabled: false, sourceRef });
  const policy = parsed.data;
  return Object.freeze({
    enabled: true, fundingPolicyVersion: 1, currency: "USD",
    maximumGrantMicros: policy.maximum_grant_micros,
    maximumDayMicros: policy.maximum_day_micros,
    maximumWeekMicros: policy.maximum_week_micros,
    maximumLifetimeMs: policy.maximum_lifetime_ms,
    finishAllowanceBp: 10000, sourceRef
  });
}

/** Explicit proposal input only; there is no enabled deployment amount or default. */
export function internalAllowancePolicyValue(policy: Extract<InternalAllowancePolicy, { enabled: true }>) {
  const value = {
    enabled: true, funding_policy_version: policy.fundingPolicyVersion, currency: policy.currency,
    maximum_grant_micros: policy.maximumGrantMicros, maximum_day_micros: policy.maximumDayMicros,
    maximum_week_micros: policy.maximumWeekMicros, maximum_lifetime_ms: policy.maximumLifetimeMs,
    finish_allowance_bp: policy.finishAllowanceBp
  };
  internalAllowancePolicyFromValue(value, policy.sourceRef);
  return Object.freeze(value);
}
