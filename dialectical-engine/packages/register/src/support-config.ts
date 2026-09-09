import type { Pool, PoolClient } from "pg";
import {
  SUPPORT_CONFIGURATION_KEYS,
  computeRegisterSnapshotSha256,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
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
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SUPPORT_STATUS_COLUMNS = Object.freeze([
  "support_register_version", "schema_version", "integrity_valid",
  "base_register_version", "publication_id",
  "request_sha256", "snapshot_sha256", "support_snapshot_sha256", "changed_keys",
  "source_ref", "recorded_at", "configuration_text"
] as const);
const SUPPORT_STATUS_SQL = `
  SELECT support_register_version,schema_version,integrity_valid,
    base_register_version,publication_id,
    request_sha256,snapshot_sha256,support_snapshot_sha256,changed_keys,
    source_ref,recorded_at,configuration::text AS configuration_text
  FROM register.read_support_configuration_status()
`;

function disabled(code: Extract<SupportConfigurationState, { kind: "DISABLED" }>["code"]): SupportConfigurationState {
  return Object.freeze({ kind: "DISABLED", code });
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

type ParsedSupportConfigurationStatus =
  | (NonNullable<SupportConfigurationStatus> & Readonly<{ integrityValid: boolean }>)
  | null;

function parseSupportStatusRows(rows: unknown): ParsedSupportConfigurationStatus {
  if (!Array.isArray(rows)) throw new TypeError("SUPPORT_CONFIG_SNAPSHOT_INVALID");
  if (rows.length === 0) return null;
  if (rows.length !== 1 || !exactObject(rows[0], SUPPORT_STATUS_COLUMNS)) {
    throw new TypeError("SUPPORT_CONFIG_SNAPSHOT_INVALID");
  }
  const row = rows[0];
  const publicationId = row.publication_id;
  const requestSha256 = row.request_sha256;
  const snapshotSha256 = row.snapshot_sha256;
  const supportSnapshotSha256 = row.support_snapshot_sha256;
  const changedKeys = row.changed_keys;
  const schemaVersion = row.schema_version;
  const integrityValid = row.integrity_valid;
  const sourceRef = row.source_ref;
  const recordedAt = row.recorded_at;
  const configurationText = row.configuration_text;
  if (typeof publicationId !== "string" || !UUID_PATTERN.test(publicationId)
      || typeof requestSha256 !== "string" || !SHA256_PATTERN.test(requestSha256)
      || typeof snapshotSha256 !== "string" || !SHA256_PATTERN.test(snapshotSha256)
      || typeof supportSnapshotSha256 !== "string" || !SHA256_PATTERN.test(supportSnapshotSha256)
      || !Array.isArray(changedKeys) || changedKeys.length < 1
      || changedKeys.some((key) => typeof key !== "string" || !SUPPORT_KEY_SET.has(key))
      || new Set(changedKeys).size !== changedKeys.length
      || typeof schemaVersion !== "number" || !Number.isSafeInteger(schemaVersion) || schemaVersion < 1
      || typeof integrityValid !== "boolean"
      || typeof sourceRef !== "string" || sourceRef.length < 1 || sourceRef.length > 1024
      || sourceRef.trim() !== sourceRef || /[\u0000-\u001f\u007f]/u.test(sourceRef)
      || !(recordedAt instanceof Date) || !Number.isFinite(recordedAt.getTime())
      || typeof configurationText !== "string") {
    throw new TypeError("SUPPORT_CONFIG_SNAPSHOT_INVALID");
  }
  return Object.freeze({
    supportRegisterVersion: parseRegisterVersionText(row.support_register_version),
    schemaVersion,
    integrityValid,
    baseRegisterVersion: parseRegisterVersionText(row.base_register_version),
    publicationId,
    requestSha256,
    snapshotSha256,
    supportSnapshotSha256,
    changedKeys: Object.freeze([...changedKeys]) as readonly SupportConfigurationKey[],
    sourceRef,
    recordedAt: new Date(recordedAt.getTime()),
    configurationText
  });
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
        || candidate.source_ref.length > 1024 || candidate.source_ref.trim() !== candidate.source_ref
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

function validateStatus(status: ParsedSupportConfigurationStatus): SupportConfigurationState {
  if (status === null) return disabled("SUPPORT_CONFIG_UNINITIALIZED");
  if (status.schemaVersion !== 1) return disabled("SUPPORT_CONFIG_SCHEMA_UNSUPPORTED");
  if (!status.integrityValid) return disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID");
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
  const now = options.monotonicNow ?? (() => performance.now());
  let cache: Readonly<{ installedAt: number; state: SupportConfigurationState }> | undefined;
  let greatestObservedGeneration: bigint | undefined;
  let lastObservedAt: number | undefined;
  let clockFailed = false;
  let activeAttempt: Readonly<{
    result: Promise<SupportConfigurationState>;
    cancel(): void;
  }> | undefined;
  const pendingCompletions = new Set<Promise<void>>();
  let closed = false;
  let closing: Promise<void> | undefined;

  const observeClock = (): number | undefined => {
    if (clockFailed) return undefined;
    let observedAt: number;
    try {
      observedAt = now();
    } catch {
      clockFailed = true;
      return undefined;
    }
    if (!Number.isFinite(observedAt)
        || (lastObservedAt !== undefined && observedAt < lastObservedAt)) {
      clockFailed = true;
      return undefined;
    }
    lastObservedAt = observedAt;
    return observedAt;
  };

  const startRefresh = (startedAt: number): Promise<SupportConfigurationState> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resultSettled = false;
    let resolveResult!: (state: SupportConfigurationState) => void;
    const result = new Promise<SupportConfigurationState>((resolve) => {
      resolveResult = resolve;
    });

    const settle = (state: SupportConfigurationState, installedAt: number): void => {
      if (resultSettled) return;
      resultSettled = true;
      if (timer !== undefined) clearTimeout(timer);
      cache = Object.freeze({ installedAt, state });
      resolveResult(state);
    };
    const deadlineReached = (observedAt: number | undefined): boolean =>
      observedAt === undefined || observedAt - startedAt >= SUPPORT_CONFIG_REFRESH_DEADLINE_MS;
    const settleDeadline = (observedAt: number | undefined): void => {
      settle(disabled("SUPPORT_CONFIG_REFRESH_DEADLINE"), observedAt ?? lastObservedAt ?? startedAt);
    };

    timer = setTimeout(() => {
      settleDeadline(observeClock());
    }, SUPPORT_CONFIG_REFRESH_DEADLINE_MS);

    let acquisition: Promise<PoolClient>;
    try {
      acquisition = pool.connect();
    } catch (error) {
      acquisition = Promise.reject(error);
    }
    let attempt!: Readonly<{
      result: Promise<SupportConfigurationState>;
      cancel(): void;
    }>;
    const completion = (async (): Promise<void> => {
      let client: PoolClient | undefined;
      let released = false;
      const release = (destroy: boolean): void => {
        if (client === undefined || released) return;
        released = true;
        if (destroy) client.release(true);
        else client.release();
      };
      try {
        client = await acquisition;
        if (closed || resultSettled) {
          release(true);
          return;
        }
        const queryResult = await client.query<Record<string, unknown>>(SUPPORT_STATUS_SQL);
        if (closed || resultSettled) {
          release(true);
          return;
        }
        const afterTransfer = observeClock();
        if (deadlineReached(afterTransfer)) {
          release(false);
          settleDeadline(afterTransfer);
          return;
        }
        const status = parseSupportStatusRows(queryResult.rows);
        const state = validateStatus(status);
        const afterValidation = observeClock();
        if (deadlineReached(afterValidation)) {
          release(false);
          settleDeadline(afterValidation);
          return;
        }
        if (status !== null) {
          const generation = BigInt(status.supportRegisterVersion);
          if (greatestObservedGeneration !== undefined && generation < greatestObservedGeneration) {
            release(false);
            settle(disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID"), afterValidation!);
            return;
          }
          if (greatestObservedGeneration === undefined || generation > greatestObservedGeneration) {
            greatestObservedGeneration = generation;
          }
        }
        const beforeInstall = observeClock();
        if (closed) {
          release(true);
          settle(disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID"), beforeInstall ?? lastObservedAt ?? startedAt);
          return;
        }
        if (deadlineReached(beforeInstall)) {
          release(false);
          settleDeadline(beforeInstall);
          return;
        }
        release(false);
        const afterRelease = observeClock();
        if (closed) {
          settle(
            disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID"),
            afterRelease ?? lastObservedAt ?? startedAt
          );
          return;
        }
        if (deadlineReached(afterRelease)) {
          settleDeadline(afterRelease);
          return;
        }
        settle(state, afterRelease!);
      } catch {
        try {
          release(true);
        } catch {
          // A failed release is still one release attempt; the reader must fail closed.
        }
        if (!resultSettled) {
          const observedAt = observeClock();
          if (deadlineReached(observedAt)) settleDeadline(observedAt);
          else settle(disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID"), observedAt!);
        }
      } finally {
        if (!released) {
          try {
            release(true);
          } catch {
            // The client is already unusable and the public state is fail closed.
          }
        }
        if (activeAttempt === attempt) activeAttempt = undefined;
      }
    })();
    pendingCompletions.add(completion);
    attempt = Object.freeze({
      result,
      cancel: () => settle(
        disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID"),
        observeClock() ?? lastObservedAt ?? startedAt
      )
    });
    activeAttempt = attempt;
    void completion.then(() => pendingCompletions.delete(completion));
    return result;
  };

  return Object.freeze({
    current() {
      if (closed) return Promise.resolve(disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID"));
      if (activeAttempt !== undefined) return activeAttempt.result;
      const observedAt = observeClock();
      if (observedAt === undefined) {
        return Promise.resolve(disabled("SUPPORT_CONFIG_REFRESH_DEADLINE"));
      }
      if (cache !== undefined && observedAt - cache.installedAt < SUPPORT_CONFIG_CACHE_MAX_AGE_MS) {
        return Promise.resolve(cache.state);
      }
      return startRefresh(observedAt);
    },
    close() {
      if (closing !== undefined) return closing;
      closed = true;
      activeAttempt?.cancel();
      cache = Object.freeze({
        installedAt: lastObservedAt ?? 0,
        state: disabled("SUPPORT_CONFIG_SNAPSHOT_INVALID")
      });
      const liveCompletions = Promise.all([...pendingCompletions]);
      const poolEnd = Promise.resolve().then(() => pool.end());
      closing = Promise.all([
        liveCompletions,
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
