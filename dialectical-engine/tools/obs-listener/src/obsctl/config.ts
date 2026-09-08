import { isAbsolute, join, normalize } from "node:path";
import { computeProofWindow } from "./proof-gap-window.js";

export interface Principal { readonly uid: number; readonly gid: number }
export interface ControlConfig {
  readonly root: string;
  readonly postgresDeviceId: string;
  readonly armedHmacKeyFile: string;
  readonly armedTokenStalenessMs: number;
  readonly authorityProofStalenessMs: number;
  readonly authorityProofRefreshIntervalMs: number;
  readonly skewToleranceMs: number;
  readonly flushIntervalMs: number;
  readonly captureGapQuietWindowMs: number;
  readonly killPollIntervalMs: number;
  readonly killLatencyMs: number;
  readonly spoolDir: string;
  readonly policyBundlePath: string;
  readonly principals: Readonly<{
    provisioner: Principal; obsctl: Principal; daemon: Principal; watchdog: Principal;
    publicReadGid: number; chainPublicGid: number;
  }>;
}

function required(environment: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = environment[name];
  if (value === undefined || value.length === 0 || value.includes("\0")) throw new TypeError("FIX10_CONFIG_MISSING");
  return value;
}

function positive(value: string, code = "FIX10_CONFIG_INTEGER"): number {
  if (!/^[1-9][0-9]*$/u.test(value)) throw new TypeError(code);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new TypeError(code);
  return number;
}

function absolute(environment: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = required(environment, name);
  if (!isAbsolute(value) || normalize(value) !== value || value === "/") throw new TypeError("FIX10_CONFIG_PATH");
  return value;
}

export function parseControlConfig(environment: Readonly<Record<string, string | undefined>>): ControlConfig {
  const root = absolute(environment, "OBS_CONTROL_DIR");
  const armedHmacKeyFile = absolute(environment, "OBS_ARMED_HMAC_KEY_FILE");
  if (armedHmacKeyFile !== join(root, "keys", "armed-marker.hmac")) throw new TypeError("FIX10_ARMED_KEY_PATH");
  const principal = (prefix: string): Principal => Object.freeze({
    uid: positive(required(environment, `${prefix}_UID`)), gid: positive(required(environment, `${prefix}_GID`)),
  });
  const provisioner = principal("V_PROVISIONER");
  const obsctl = principal("OBSCTL");
  const daemon = principal("DAEMON");
  const watchdog = principal("WATCHDOG");
  const publicReadGid = positive(required(environment, "OBS_PUBLIC_READ_GID"));
  const chainPublicGid = positive(required(environment, "OBS_CHAIN_PUBLIC_GID"));
  const allIds = [provisioner.uid, obsctl.uid, daemon.uid, watchdog.uid];
  if (new Set(allIds).size !== allIds.length || new Set([publicReadGid, chainPublicGid]).size !== 2) {
    throw new TypeError("FIX10_PRINCIPAL_DISTINCT");
  }
  const killPollIntervalMs = positive(required(environment, "OBS_KILL_POLL_INTERVAL_MS"));
  const killLatencyMs = positive(required(environment, "OBS_KILL_LATENCY_MS"));
  if (killLatencyMs < killPollIntervalMs) throw new TypeError("FIX10_KILL_LATENCY");
  const authorityProofStalenessMs = positive(required(environment, "OBS_AUTHORITY_PROOF_STALENESS_MS"));
  const authorityProofRefreshIntervalMs = positive(required(environment, "OBS_AUTHORITY_PROOF_REFRESH_INTERVAL_MS"));
  const skewToleranceMs = positive(required(environment, "OBS_SKEW_TOLERANCE_MS"));
  const flushIntervalMs = positive(required(environment, "OBS_FLUSH_INTERVAL_MS"));
  const captureGapQuietWindowMs = positive(required(environment, "OBS_CAPTURE_GAP_QUIET_WINDOW_MS"));
  computeProofWindow({ proofStalenessMs: authorityProofStalenessMs, refreshIntervalMs: authorityProofRefreshIntervalMs,
    skewToleranceMs, flushIntervalMs, quietWindowMs: captureGapQuietWindowMs });
  return Object.freeze({
    root,
    postgresDeviceId: required(environment, "OBS_POSTGRES_DATA_DEVICE_ID"),
    armedHmacKeyFile,
    armedTokenStalenessMs: positive(required(environment, "OBS_ARMED_TOKEN_STALENESS_MS")),
    authorityProofStalenessMs,
    authorityProofRefreshIntervalMs,
    skewToleranceMs,
    flushIntervalMs,
    captureGapQuietWindowMs,
    killPollIntervalMs,
    killLatencyMs,
    spoolDir: absolute(environment, "OBS_SPOOL_DIR"),
    policyBundlePath: absolute(environment, "OBS_POLICY_BUNDLE_PATH"),
    principals: Object.freeze({ provisioner, obsctl, daemon, watchdog, publicReadGid, chainPublicGid }),
  });
}
