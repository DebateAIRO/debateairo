import { TypedDomainError } from "@debateai/kernel";
import type { SupportConfigurationPort,SupportConfigurationValues } from "@debateai/register";

export const SUPPORT_LIMIT_KEYS = Object.freeze([
  "support_limit_anon_msgs_10m","support_limit_anon_msgs_24h",
  "support_limit_anon_sessions_1h","support_limit_session_msgs",
  "support_limit_msg_chars","support_limit_account_msgs_10m",
  "support_limit_account_msgs_24h","support_relay_concurrency",
  "support_queue_depth","support_daily_call_cap",
  "support_lock_after_injections","support_ip_cooldown_minutes"
] as const);

export type SupportLimitKey = typeof SUPPORT_LIMIT_KEYS[number];
export type SupportLimits = Readonly<Record<SupportLimitKey,number>>;

export const SUPPORT_LIMIT_DEFAULTS: SupportLimits = Object.freeze({
  support_limit_anon_msgs_10m: 20,support_limit_anon_msgs_24h: 100,
  support_limit_anon_sessions_1h: 5,support_limit_session_msgs: 40,
  support_limit_msg_chars: 2_000,support_limit_account_msgs_10m: 60,
  support_limit_account_msgs_24h: 300,support_relay_concurrency: 2,
  support_queue_depth: 10,support_daily_call_cap: 500,
  support_lock_after_injections: 3,support_ip_cooldown_minutes: 60
});

export class SupportLimitsError extends TypedDomainError {
  constructor(code: string,message: string) {
    super(code,message);
    this.name = "SupportLimitsError";
  }
}

function limitsFrom(values: SupportConfigurationValues): SupportLimits {
  return Object.freeze({
    support_limit_anon_msgs_10m: values.supportLimitAnonMessages10m,
    support_limit_anon_msgs_24h: values.supportLimitAnonMessages24h,
    support_limit_anon_sessions_1h: values.supportLimitAnonSessions1h,
    support_limit_session_msgs: values.supportLimitSessionMessages,
    support_limit_msg_chars: values.supportLimitMessageCharacters,
    support_limit_account_msgs_10m: values.supportLimitAccountMessages10m,
    support_limit_account_msgs_24h: values.supportLimitAccountMessages24h,
    support_relay_concurrency: values.supportRelayConcurrency,
    support_queue_depth: values.supportQueueDepth,
    support_daily_call_cap: values.supportDailyCallCap,
    support_lock_after_injections: values.supportLockAfterInjections,
    support_ip_cooldown_minutes: values.supportIpCooldownMinutes
  });
}

export async function readLimits(
  configuration: Pick<SupportConfigurationPort,"current">
): Promise<SupportLimits> {
  const state = await configuration.current();
  if (state.kind === "DISABLED") {
    throw new SupportLimitsError(
      "SUPPORT_LIMITS_UNAVAILABLE","Support limits are unavailable"
    );
  }
  return limitsFrom(state.snapshot.values);
}

export function checkLimit(
  limits: SupportLimits,key: SupportLimitKey,observed: number
): boolean {
  if (!Number.isSafeInteger(observed) || observed < 0) {
    throw new SupportLimitsError("SUPPORT_LIMIT_COUNT_INVALID","Support limit count is invalid");
  }
  return observed < limits[key];
}
