export type LocalAuthorityState = "INVALID" | "KILLED_COMPLETE" | "KILLED_PARTIAL" |
  "CAPTURE_DISABLED" | "TRIPPED" | "ARMING" | "READY";

export function deriveLocalAuthorityState(input: Readonly<{
  rootValid: boolean; captureOff: boolean; killed: boolean; armed: boolean; proof: boolean;
}>): LocalAuthorityState {
  if (!input.rootValid) return "INVALID";
  if (input.captureOff && input.killed) return "KILLED_COMPLETE";
  if (input.killed) return "KILLED_PARTIAL";
  if (input.captureOff) return "CAPTURE_DISABLED";
  if (!input.armed) return "TRIPPED";
  return input.proof ? "READY" : "ARMING";
}

export interface FallbackStatus {
  readonly schema: "obsctl-status/v3";
  readonly observed_at_ms: string;
  readonly local_state: "INVALID";
  readonly markers: null;
  readonly capture_switch: Readonly<{ effective: "ON" | "OFF"; reason: "UNDEFINED_PATH" | "MARKER_READ_ERROR" }>;
  readonly armed: null;
  readonly proof: null;
  readonly capture_runtimes: readonly Readonly<Record<string, unknown>>[];
  readonly daemon: null;
  readonly watchdog: null;
  readonly outbox: null;
  readonly v_journal: null;
  readonly watchdog_journal: null;
  readonly database: null;
  readonly cursor_lag: null;
  readonly capture_gaps: CaptureGapsStatus;
  readonly spool: null;
  readonly mutation: Readonly<{ configured: null; effective: "OFF"; reason: "FIX10_FORCED_OFF" }>;
  readonly quick_arm: Readonly<{
    configured: "OFF";
    effective: "OFF";
    reason: "FIX14_POLICY_DEFAULT_OFF";
  }>;
  readonly policy_bundle_sha256: null;
  readonly activation_manifest_sha256: null;
  readonly keyring_sha256: null;
  readonly custodian: "V";
}

export interface CaptureGapsStatus {
  readonly open_rows: string | null;
  readonly recent_rows: string | null;
  readonly authority_proof_staleness_ms: string | null;
  readonly refresh_interval_ms: string | null;
  readonly skew_tolerance_ms: string | null;
  readonly flush_interval_ms: string | null;
  readonly quiet_window_ms: string | null;
  readonly query_window_ms: string | null;
  readonly reason: "NONE" | "DB_UNAVAILABLE" | "QUERY_FAILURE" | "TIMING_INVALID";
}

export function renderFallbackStatus(captureEffective: "ON" | "OFF", observedAtMs = Date.now()): FallbackStatus {
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs <= 0) throw new TypeError("FIX10_STATUS_TIME");
  const forced = Object.freeze({ configured: null, effective: "OFF" as const, reason: "FIX10_FORCED_OFF" as const });
  const quickArm = Object.freeze({
    configured: "OFF" as const,
    effective: "OFF" as const,
    reason: "FIX14_POLICY_DEFAULT_OFF" as const,
  });
  const captureRuntimes = Object.freeze(["api", "runner", "scheduler"].map((runtime) => Object.freeze({
    component: `capture:${runtime}`, state: null, heartbeat_age_ms: null, reason: "DB_UNAVAILABLE",
  })));
  return Object.freeze({
    schema: "obsctl-status/v3", observed_at_ms: String(observedAtMs), local_state: "INVALID",
    markers: null, capture_switch: Object.freeze({ effective: captureEffective,
      reason: captureEffective === "ON" ? "UNDEFINED_PATH" : "MARKER_READ_ERROR" }),
    armed: null, proof: null, capture_runtimes: captureRuntimes, daemon: null, watchdog: null,
    database: null, cursor_lag: null, capture_gaps: Object.freeze({ open_rows: null, recent_rows: null,
      authority_proof_staleness_ms: null, refresh_interval_ms: null, skew_tolerance_ms: null,
      flush_interval_ms: null, quiet_window_ms: null, query_window_ms: null, reason: "TIMING_INVALID" as const }),
    spool: null, outbox: null, v_journal: null, watchdog_journal: null, mutation: forced, quick_arm: quickArm,
    policy_bundle_sha256: null, activation_manifest_sha256: null, keyring_sha256: null, custodian: "V",
  });
}

export interface LocalStatusInput {
  readonly observedAtMs: number;
  readonly captureSwitch: Readonly<{ effective: "ON" | "OFF"; reason: string }>;
  readonly captureOff: boolean;
  readonly killed: boolean;
  readonly armed: Readonly<{ state: "VALID" | "MISSING" | "INVALID" | "STALE"; age_ms: string | null; expires_at_ms: string | null }>;
  readonly proof: Readonly<{ state: "VALID" | "MISSING" | "INVALID" | "STALE" | "MISMATCH"; age_ms: string | null; proof_id: string | null }>;
  readonly outboxPending: string;
  readonly outboxTailHash: string | null;
  readonly journalTailHash: string | null;
  readonly policyBundleSha256: string | null;
  readonly activationManifestSha256: string | null;
  readonly keyringSha256: string | null;
  readonly databaseState: "RECONCILED" | "UNREACHABLE" | "REJECTED" | "NOT_ATTEMPTED";
  readonly databaseReason: string;
  readonly databaseActionId: string | null;
  readonly captureGaps: CaptureGapsStatus;
}

export function renderLocalStatus(input: LocalStatusInput): Readonly<Record<string, unknown>> {
  if (!Number.isSafeInteger(input.observedAtMs) || input.observedAtMs <= 0) throw new TypeError("FIX10_STATUS_TIME");
  const localState = deriveLocalAuthorityState({ rootValid: true, captureOff: input.captureOff, killed: input.killed,
    armed: input.armed.state === "VALID", proof: input.proof.state === "VALID" });
  const forced = Object.freeze({ configured: null, effective: "OFF", reason: "FIX10_FORCED_OFF" });
  const quickArm = Object.freeze({
    configured: "OFF",
    effective: "OFF",
    reason: "FIX14_POLICY_DEFAULT_OFF",
  });
  return Object.freeze({
    schema: "obsctl-status/v3", observed_at_ms: String(input.observedAtMs), local_state: localState,
    markers: Object.freeze({ capture_off: input.captureOff ? "PRESENT" : "ABSENT", kill: input.killed ? "PRESENT" : "ABSENT" }),
    capture_switch: Object.freeze(input.captureSwitch), armed: Object.freeze(input.armed), proof: Object.freeze(input.proof),
    capture_runtimes: Object.freeze(["api", "runner", "scheduler"].map((runtime) => Object.freeze({ component: `capture:${runtime}`,
      state: null, heartbeat_age_ms: null, reason: "DB_UNAVAILABLE" }))),
    daemon: Object.freeze({ state: input.killed ? "STOPPED" : "UNKNOWN", proof_age_ms: input.proof.age_ms, reason: input.proof.state }),
    watchdog: Object.freeze({ state: "UNAVAILABLE", heartbeat_age_ms: null, witness_seq: null, result: null, reason: "DB_UNAVAILABLE" }),
    database: Object.freeze({ state: input.databaseState, reason: input.databaseReason,
      current_user: input.databaseState === "RECONCILED" ? "debateai_obs_listener" : null, action_id: input.databaseActionId }),
    cursor_lag: null, capture_gaps: Object.freeze(input.captureGaps),
    spool: Object.freeze({ files: null, lines: null, reason: "UNAVAILABLE" }),
    outbox: Object.freeze({ pending: input.outboxPending, tail_hash: input.outboxTailHash }),
    v_journal: Object.freeze({ tail_hash: input.journalTailHash }), watchdog_journal: Object.freeze({ tail_hash: null }),
    mutation: forced, quick_arm: quickArm, policy_bundle_sha256: input.policyBundleSha256,
    activation_manifest_sha256: input.activationManifestSha256, keyring_sha256: input.keyringSha256, custodian: "V",
  });
}
