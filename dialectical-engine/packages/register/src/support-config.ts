import type { Pool } from "pg";
import {
  SUPPORT_CONFIGURATION_KEYS,
  computeRegisterSnapshotSha256,
  createPostgresRegisterPublicationPort,
  parseCanonicalRegisterJson,
  validateSupportConfigurationValue,
  type CanonicalRegisterJson,
  type RegisterPublicationRow,
  type RegisterVersionText,
  type SupportConfigurationKey,
  type SupportConfigurationStatus
} from "./register-publication.js";

export { SUPPORT_CONFIGURATION_KEYS } from "./register-publication.js";
export type { SupportConfigurationKey } from "./register-publication.js";

export const SUPPORT_CONFIG_CACHE_MAX_AGE_MS = 1_000 as const;
export const SUPPORT_CONFIG_REFRESH_DEADLINE_MS = 1_000 as const;

export interface SupportConfigurationValues {
  readonly supportEnabled: boolean;
  readonly supportModelRef: string;
  readonly supportRelayConcurrency: number;
  readonly supportDailyCallCap: number;
  readonly supportLimitAnonMessages10m: number;
  readonly supportLimitAnonMessages24h: number;
  readonly supportLimitAnonSessions1h: number;
  readonly supportLimitSessionMessages: number;
  readonly supportLimitMessageCharacters: number;
  readonly supportLimitAccountMessages10m: number;
  readonly supportLimitAccountMessages24h: number;
  readonly supportQueueDepth: number;
  readonly supportLockAfterInjections: number;
  readonly supportIpCooldownMinutes: number;
  readonly supportRetentionPolicy: "keep" | `shred-after-days:${number}`;
  readonly supportRetentionRatifiedBy: "V" | null;
}

export interface SupportConfigurationSnapshot {
  readonly supportRegisterVersion: RegisterVersionText;
  readonly schemaVersion: 1;
  readonly recordedAt: Date;
  readonly supportSnapshotSha256: string;
  readonly fullSnapshotSha256: string;
  readonly values: Readonly<SupportConfigurationValues>;
}

export interface SupportConfigurationPort {
  current(): Promise<SupportConfigurationState>;
  close(): Promise<void>;
}

export type SupportConfigurationState =
  | Readonly<{ kind: "AVAILABLE"; snapshot: SupportConfigurationSnapshot }>
  | Readonly<{ kind: "DISABLED"; code:
      "SUPPORT_CONFIG_UNINITIALIZED" | "SUPPORT_CONFIG_REFRESH_DEADLINE" |
      "SUPPORT_CONFIG_SNAPSHOT_INVALID" | "SUPPORT_CONFIG_SCHEMA_UNSUPPORTED" }>;

export interface SupportConfigurationPortOptions {
  readonly monotonicNow?: () => number;
}

type ConfigurationEnvelope = Readonly<{
  row_key: string;
  value_json_text: string;
  source_ref: string;
}>;

const SUPPORT_KEY_SET = new Set<string>(SUPPORT_CONFIGURATION_KEYS);

function disabled(code: Extract<SupportConfigurationState, { kind: "DISABLED" }>["code"]): SupportConfigurationState {
  return Object.freeze({ kind: "DISABLED", code });
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function decodeConfiguration(configurationText: string): readonly ConfigurationEnvelope[] {
  // This bounded raw-token validation deliberately precedes JSON.parse.
  const canonicalOuter = parseCanonicalRegisterJson(Buffer.from(configurationText, "utf8"));
  const decoded = JSON.parse(canonicalOuter) as unknown;
  if (!Array.isArray(decoded) || decoded.length !== SUPPORT_CONFIGURATION_KEYS.length) {
    throw new TypeError("SUPPORT_CONFIG_SNAPSHOT_INVALID");
  }
  const keys = new Set<string>();
  const rows: ConfigurationEnvelope[] = [];
  for (const candidate of decoded) {
    if (!exactObject(candidate, ["row_key", "value_json_text", "source_ref"])
        || typeof candidate.row_key !== "string" || !SUPPORT_KEY_SET.has(candidate.row_key)
        || keys.has(candidate.row_key) || typeof candidate.value_json_text !== "string"
        || typeof candidate.source_ref !== "string" || candidate.source_ref.length < 1
        || candidate.source_ref.length > 256 || candidate.source_ref.trim() !== candidate.source_ref
        || /[\u0000-\u001f\u007f]/u.test(candidate.source_ref)) {
      throw new TypeError("SUPPORT_CONFIG_SNAPSHOT_INVALID");
    }
    const canonicalValue = parseCanonicalRegisterJson(Buffer.from(candidate.value_json_text, "utf8"));
    if (canonicalValue !== candidate.value_json_text) throw new TypeError("SUPPORT_CONFIG_SNAPSHOT_INVALID");
    keys.add(candidate.row_key);
    rows.push(Object.freeze({
      row_key: candidate.row_key,
      value_json_text: candidate.value_json_text,
      source_ref: candidate.source_ref
    }));
  }
  if (SUPPORT_CONFIGURATION_KEYS.some((key) => !keys.has(key))) {
    throw new TypeError("SUPPORT_CONFIG_SNAPSHOT_INVALID");
  }
  return Object.freeze(rows);
}

function asNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError("SUPPORT_CONFIG_SNAPSHOT_INVALID");
  }
  return value;
}

function configurationValues(rows: readonly ConfigurationEnvelope[]): Readonly<SupportConfigurationValues> {
  const parsed = new Map<SupportConfigurationKey, unknown>();
  try {
    for (const row of rows) {
      const key = row.row_key as SupportConfigurationKey;
      parsed.set(key, validateSupportConfigurationValue(key, row.value_json_text as CanonicalRegisterJson));
    }
  } catch {
    throw new TypeError("SUPPORT_CONFIG_SNAPSHOT_INVALID");
  }
  const enabled = parsed.get("support_enabled");
  const modelRef = parsed.get("support_model_ref");
  const retention = parsed.get("support_retention_policy");
  const ratifier = parsed.get("support_retention_ratified_by");
  if (typeof enabled !== "boolean" || typeof modelRef !== "string"
      || (retention !== "keep" && (typeof retention !== "string" || !retention.startsWith("shred-after-days:")))
      || (ratifier !== null && ratifier !== "V")) {
    throw new TypeError("SUPPORT_CONFIG_SNAPSHOT_INVALID");
  }
  return Object.freeze({
    supportEnabled: enabled,
    supportModelRef: modelRef,
    supportRelayConcurrency: asNumber(parsed.get("support_relay_concurrency")),
    supportDailyCallCap: asNumber(parsed.get("support_daily_call_cap")),
    supportLimitAnonMessages10m: asNumber(parsed.get("support_limit_anon_msgs_10m")),
    supportLimitAnonMessages24h: asNumber(parsed.get("support_limit_anon_msgs_24h")),
    supportLimitAnonSessions1h: asNumber(parsed.get("support_limit_anon_sessions_1h")),
    supportLimitSessionMessages: asNumber(parsed.get("support_limit_session_msgs")),
    supportLimitMessageCharacters: asNumber(parsed.get("support_limit_msg_chars")),
    supportLimitAccountMessages10m: asNumber(parsed.get("support_limit_account_msgs_10m")),
    supportLimitAccountMessages24h: asNumber(parsed.get("support_limit_account_msgs_24h")),
    supportQueueDepth: asNumber(parsed.get("support_queue_depth")),
    supportLockAfterInjections: asNumber(parsed.get("support_lock_after_injections")),
    supportIpCooldownMinutes: asNumber(parsed.get("support_ip_cooldown_minutes")),
    supportRetentionPolicy: retention as SupportConfigurationValues["supportRetentionPolicy"],
    supportRetentionRatifiedBy: ratifier
  });
}

function validateStatus(status: SupportConfigurationStatus): SupportConfigurationState {
  if (status === null) return disabled("SUPPORT_CONFIG_UNINITIALIZED");
  if (status.schemaVersion !== 1) return disabled("SUPPORT_CONFIG_SCHEMA_UNSUPPORTED");
  try {
    const rows = decodeConfiguration(status.configurationText);
    const hashRows: RegisterPublicationRow[] = rows.map((row) => ({
      rowKey: row.row_key,
      valueJsonText: row.value_json_text as CanonicalRegisterJson,
      sourceRef: row.source_ref
    }));
    if (computeRegisterSnapshotSha256(hashRows) !== status.supportSnapshotSha256) {
      return disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID");
    }
    if (status.changedKeys.length < 1 || status.changedKeys.some((key) => !SUPPORT_KEY_SET.has(key))) {
      return disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID");
    }
    return Object.freeze({
      kind: "AVAILABLE" as const,
      snapshot: Object.freeze({
        supportRegisterVersion: status.supportRegisterVersion,
        schemaVersion: 1 as const,
        recordedAt: new Date(status.recordedAt.getTime()),
        supportSnapshotSha256: status.supportSnapshotSha256,
        fullSnapshotSha256: status.snapshotSha256,
        values: configurationValues(rows)
      })
    });
  } catch {
    return disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID");
  }
}

export function createSupportConfigurationPort(
  pool: Pool,
  options: SupportConfigurationPortOptions = {}
): SupportConfigurationPort {
  const register = createPostgresRegisterPublicationPort(pool);
  const now = options.monotonicNow ?? (() => performance.now());
  let cache: Readonly<{ installedAt: number; state: SupportConfigurationState }> | undefined;
  let greatestAvailableGeneration: bigint | undefined;
  let activeAttempt: Readonly<{
    result: Promise<SupportConfigurationState>;
    completion: Promise<void>;
  }> | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;

  const startRefresh = (): Promise<SupportConfigurationState> => {
    const startedAt = now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resultSettled = false;
    let resolveResult!: (state: SupportConfigurationState) => void;
    const result = new Promise<SupportConfigurationState>((resolve) => {
      resolveResult = resolve;
    });

    const settle = (state: SupportConfigurationState, installedAt: number): void => {
      if (resultSettled) return;
      resultSettled = true;
      cache = Object.freeze({ installedAt, state });
      resolveResult(state);
    };
    const settleCompletedAcquisition = (
      state: SupportConfigurationState,
      installedAt: number
    ): void => {
      if (resultSettled) return;
      if (activeAttempt?.result === result) activeAttempt = undefined;
      settle(state, installedAt);
    };
    const settleDeadline = (observedAt: number): void => {
      settle(disabled("SUPPORT_CONFIG_REFRESH_DEADLINE"), observedAt);
    };
    const settleCompletedAcquisitionDeadline = (observedAt: number): void => {
      settleCompletedAcquisition(disabled("SUPPORT_CONFIG_REFRESH_DEADLINE"), observedAt);
    };
    const deadlineReached = (observedAt: number): boolean => (
      observedAt < startedAt || observedAt - startedAt >= SUPPORT_CONFIG_REFRESH_DEADLINE_MS
    );

    timer = setTimeout(() => {
      settleDeadline(now());
    }, SUPPORT_CONFIG_REFRESH_DEADLINE_MS);

    const acquisition = register.readSupportStatus();
    const completion = acquisition.then((status) => {
      if (resultSettled) return;
      const afterTransfer = now();
      if (deadlineReached(afterTransfer)) {
        settleCompletedAcquisitionDeadline(afterTransfer);
        return;
      }
      const state = validateStatus(status);
      const afterValidation = now();
      if (deadlineReached(afterValidation)) {
        settleCompletedAcquisitionDeadline(afterValidation);
        return;
      }
      if (closed) {
        settleCompletedAcquisition(disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID"), afterValidation);
        return;
      }
      if (state.kind === "AVAILABLE") {
        const generation = BigInt(state.snapshot.supportRegisterVersion);
        if (greatestAvailableGeneration !== undefined && generation < greatestAvailableGeneration) {
          settleCompletedAcquisition(disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID"), afterValidation);
          return;
        }
        const beforeInstall = now();
        if (deadlineReached(beforeInstall)) {
          settleCompletedAcquisitionDeadline(beforeInstall);
          return;
        }
        if (greatestAvailableGeneration === undefined || generation > greatestAvailableGeneration) {
          greatestAvailableGeneration = generation;
        }
        settleCompletedAcquisition(state, beforeInstall);
        return;
      }
      settleCompletedAcquisition(state, afterValidation);
    }, () => {
      if (resultSettled) return;
      const observedAt = now();
      if (deadlineReached(observedAt)) settleCompletedAcquisitionDeadline(observedAt);
      else settleCompletedAcquisition(disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID"), observedAt);
    }).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
      if (activeAttempt?.completion === completion) activeAttempt = undefined;
    });

    activeAttempt = Object.freeze({ result, completion });
    return result;
  };

  return Object.freeze({
    current() {
      if (closed) return Promise.resolve(disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID"));
      if (activeAttempt !== undefined) return activeAttempt.result;
      const observedAt = now();
      if (cache !== undefined && observedAt >= cache.installedAt
          && observedAt - cache.installedAt < SUPPORT_CONFIG_CACHE_MAX_AGE_MS) {
        return Promise.resolve(cache.state);
      }
      return startRefresh();
    },
    close() {
      if (closing !== undefined) return closing;
      closed = true;
      cache = Object.freeze({ installedAt: now(), state: disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID") });
      const liveCompletion = activeAttempt?.completion ?? Promise.resolve();
      const poolEnd = Promise.resolve().then(() => pool.end());
      closing = Promise.all([
        liveCompletion,
        poolEnd.then(
          () => Object.freeze({ ok: true as const }),
          (error: unknown) => Object.freeze({ ok: false as const, error })
        )
      ]).then(([, endResult]) => {
        if (!endResult.ok) throw endResult.error;
      });
      return closing;
    }
  });
}
