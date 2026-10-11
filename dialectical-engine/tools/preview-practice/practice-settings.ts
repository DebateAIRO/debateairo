/**
 * Preview practice: the start checks and the operator's inputs.
 *
 * Plain words: before a practice spends a cent it refuses unless
 *  - both forwarded gate sockets exist on this computer (PRACTICE_DEEPINFRA_SOCKET, PRACTICE_ANTHROPIC_SOCKET),
 *  - the operator has written PRACTICE_ACK=spends-real-money,
 *  - the live settings file holds only the allowed, non-secret runner/API settings and nothing key-shaped,
 *  - root's fresh `status` of each gate says it is active and has had at most 10 "too busy" refusals today
 *    (the gate halts at 20, and the live site needs the room).
 * The gates' read-only "what is left today" answer is checked separately, once the sockets are known to work.
 */
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { parsePreviewProviderTestConfig, type PreviewProviderTestConfig } from "@debateai/providers";
import { resolveDeploymentMode } from "@debateai/register";
import { redactKeyShapes } from "./practice-redaction.js";
import type { PracticeRunnerSettings } from "./practice-runner-composition.js";

export const PRACTICE_ACK_VALUE = "spends-real-money" as const;
/** Root's `status` may show at most this many unbilled refusals today on a gate before a practice may start. */
const PRACTICE_MAX_UNBILLED_TODAY = 10;

export class PracticeRefusal extends Error {
  constructor(readonly code: string, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "PracticeRefusal";
  }
}

export type PracticeSockets = Readonly<{ deepinfra: string; anthropic: string }>;

/** The environment check: both sockets exist (as sockets) and the acknowledgement is written out. */
export function practiceSocketsFromEnvironment(env: Readonly<Record<string, string | undefined>>,
  isSocket: (path: string) => boolean = (path) => {
    try { return lstatSync(path).isSocket(); } catch { return false; }
  }): PracticeSockets {
  if (env.PRACTICE_ACK !== PRACTICE_ACK_VALUE) {
    throw new PracticeRefusal("PRACTICE_ACK_REQUIRED", `set PRACTICE_ACK=${PRACTICE_ACK_VALUE}`);
  }
  const socket = (name: "PRACTICE_DEEPINFRA_SOCKET" | "PRACTICE_ANTHROPIC_SOCKET"): string => {
    const path = env[name];
    if (path === undefined || path.trim() === "") throw new PracticeRefusal("PRACTICE_SOCKET_MISSING", name);
    if (!isAbsolute(path)) throw new PracticeRefusal("PRACTICE_SOCKET_NOT_ABSOLUTE", name);
    if (!isSocket(path)) throw new PracticeRefusal("PRACTICE_SOCKET_NOT_FOUND", name);
    return path;
  };
  const deepinfra = socket("PRACTICE_DEEPINFRA_SOCKET");
  const anthropic = socket("PRACTICE_ANTHROPIC_SOCKET");
  if (deepinfra === anthropic) throw new PracticeRefusal("PRACTICE_SOCKETS_SAME");
  return Object.freeze({ deepinfra, anthropic });
}

/** The only keys a settings file may hold: non-secret settings of the live runner.env and api.env. */
export const PRACTICE_SETTINGS_KEYS = Object.freeze([
  "PREVIEW_PROVIDER_TEST_CONFIG_JSON", "PROVIDER_DISCOVERY_TARGETS_JSON", "REGISTER_VERSION", "DEBATEAI_DEPLOYMENT_MODE",
  "NODE_ENV", "CLAIM_MS", "CLAIM_MARGIN_MS", "MAX_RECOMPOSE", "JUDGEMENT_NUMBER_KIND", "JUDGEMENT_PRODUCER",
  "PROPAGATION_NUMBER_KIND", "PROPAGATION_PRODUCER", "PROVIDER_PROBE_TIMEOUT_MS", "PROVIDER_REF",
  "VLLM_BASE_URL", "VLLM_MODEL", "VLLM_MAKER",
  "STRANGER_SAMPLE_RATE", "BATTERY_VERSION", "SETTLEMENT_WATCH_HANDLE"
] as const);
type SettingsKey = typeof PRACTICE_SETTINGS_KEYS[number];
const REQUIRED_KEYS: readonly SettingsKey[] = Object.freeze([
  "PREVIEW_PROVIDER_TEST_CONFIG_JSON", "PROVIDER_DISCOVERY_TARGETS_JSON", "REGISTER_VERSION", "CLAIM_MS", "CLAIM_MARGIN_MS",
  "MAX_RECOMPOSE", "JUDGEMENT_NUMBER_KIND", "JUDGEMENT_PRODUCER", "PROPAGATION_NUMBER_KIND", "PROPAGATION_PRODUCER",
  "PROVIDER_REF", "STRANGER_SAMPLE_RATE", "BATTERY_VERSION", "SETTLEMENT_WATCH_HANDLE"
]);

export type PracticeSettings = Readonly<{
  runner: PracticeRunnerSettings;
  previewConfig: PreviewProviderTestConfig;
  strangerSampleRate: number;
  batteryVersion: string;
  settlementWatchHandle: string;
}>;

/**
 * KEY=value lines, as root writes them with grep from runner.env and api.env (README step S-2). Values are never
 * quoted in those files. A blank line or a # comment is skipped. Anything outside the allow-list refuses, and so does
 * a value that holds anything key-shaped (the long-run rule is not applied: a scope id is long but not a key).
 */
export function parsePracticeSettings(text: string): PracticeSettings {
  const values = new Map<string, string>();
  for (const [index, raw] of text.split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals < 1) throw new PracticeRefusal("PRACTICE_SETTINGS_LINE_INVALID", `line ${String(index + 1)}`);
    const key = line.slice(0, equals);
    const value = line.slice(equals + 1);
    if (!(PRACTICE_SETTINGS_KEYS as readonly string[]).includes(key)) {
      throw new PracticeRefusal("PRACTICE_SETTINGS_KEY_REFUSED", `line ${String(index + 1)}`);
    }
    if (values.has(key)) throw new PracticeRefusal("PRACTICE_SETTINGS_KEY_DUPLICATE", key);
    const blanked = redactKeyShapes(value).replace(/\[REDACTED:long-run\]|\[REDACTED:long-hex\]/gu, "");
    const unblanked = value.replace(/[A-Za-z0-9_-]{32,}/gu, "").replace(/\b[0-9a-fA-F]{32,}\b/gu, "");
    if (blanked !== unblanked) throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_KEY_SHAPED", key);
    values.set(key, value);
  }
  for (const key of REQUIRED_KEYS) if (!values.has(key)) throw new PracticeRefusal("PRACTICE_SETTINGS_KEY_MISSING", key);
  const get = (key: SettingsKey): string => values.get(key)!;
  const integer = (key: SettingsKey, minimum: number): number => {
    const parsed = Number(get(key));
    if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", key);
    return parsed;
  };
  let previewConfig: PreviewProviderTestConfig | undefined;
  try { previewConfig = parsePreviewProviderTestConfig(get("PREVIEW_PROVIDER_TEST_CONFIG_JSON")); } catch {
    throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", "PREVIEW_PROVIDER_TEST_CONFIG_JSON");
  }
  if (previewConfig === undefined || previewConfig.anthropic_budget_socket === undefined) {
    throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", "PREVIEW_PROVIDER_TEST_CONFIG_JSON names no Anthropic gate");
  }
  // The preview declares no credential: a target with an inline header or a credential file is refused.
  let targets: unknown;
  try { targets = JSON.parse(get("PROVIDER_DISCOVERY_TARGETS_JSON")); } catch {
    throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", "PROVIDER_DISCOVERY_TARGETS_JSON");
  }
  if (!Array.isArray(targets) || targets.some((target) => typeof target !== "object" || target === null
    || Object.keys(target as object).some((member) => /authori[sz]ation|credential|api[_-]?key/iu.test(member)))) {
    throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", "PROVIDER_DISCOVERY_TARGETS_JSON declares a credential");
  }
  const nodeEnv = values.get("NODE_ENV");
  if (nodeEnv !== undefined && nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
    throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", "NODE_ENV");
  }
  let mode;
  try { mode = resolveDeploymentMode(values.get("DEBATEAI_DEPLOYMENT_MODE"), nodeEnv); } catch {
    throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", "DEBATEAI_DEPLOYMENT_MODE");
  }
  if (mode !== "local") throw new PracticeRefusal("PRACTICE_REQUIRES_LOCAL_MODE");
  const rate = Number(get("STRANGER_SAMPLE_RATE"));
  if (!(rate >= 0 && rate <= 1)) throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", "STRANGER_SAMPLE_RATE");
  const runner: PracticeRunnerSettings = Object.freeze({
    REGISTER_VERSION: integer("REGISTER_VERSION", 1),
    PREVIEW_PROVIDER_TEST_CONFIG: previewConfig,
    PROVIDER_DISCOVERY_TARGETS_JSON: get("PROVIDER_DISCOVERY_TARGETS_JSON"),
    DEPLOYMENT_MODE: mode,
    NODE_ENV: nodeEnv as PracticeRunnerSettings["NODE_ENV"],
    PROVIDER_PROBE_TIMEOUT_MS: values.has("PROVIDER_PROBE_TIMEOUT_MS") ? integer("PROVIDER_PROBE_TIMEOUT_MS", 1) : 5_000,
    RUNNER_WORKER_ID: "runner:preview-practice",
    CLAIM_MS: integer("CLAIM_MS", 1),
    CLAIM_MARGIN_MS: integer("CLAIM_MARGIN_MS", 0),
    MAX_RECOMPOSE: integer("MAX_RECOMPOSE", 1),
    JUDGEMENT_NUMBER_KIND: get("JUDGEMENT_NUMBER_KIND"),
    JUDGEMENT_PRODUCER: get("JUDGEMENT_PRODUCER"),
    PROPAGATION_NUMBER_KIND: get("PROPAGATION_NUMBER_KIND"),
    PROPAGATION_PRODUCER: get("PROPAGATION_PRODUCER"),
    PROVIDER_REF: get("PROVIDER_REF"),
    VLLM_BASE_URL: values.get("VLLM_BASE_URL"),
    VLLM_MODEL: values.get("VLLM_MODEL"),
    VLLM_MAKER: values.get("VLLM_MAKER")
  });
  return Object.freeze({ runner, previewConfig, strangerSampleRate: rate,
    batteryVersion: get("BATTERY_VERSION"), settlementWatchHandle: get("SETTLEMENT_WATCH_HANDLE") });
}

export function readPracticeSettings(path: string): PracticeSettings {
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { throw new PracticeRefusal("PRACTICE_SETTINGS_UNREADABLE"); }
  return parsePracticeSettings(text);
}

export type PracticeGateStatus = Readonly<{ state: string; todayUnbilled: number; halts: number | null }>;

/** Root's `status` output of one gate (JSON). Only three members are read; the file is never copied into a report. */
export function parseGateStatus(gate: string, text: string): PracticeGateStatus {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new PracticeRefusal("PRACTICE_GATE_STATUS_INVALID", gate); }
  const row = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const unbilled = row.today_unbilled_releases;
  if (typeof row.state !== "string" || typeof unbilled !== "number" || !Number.isSafeInteger(unbilled) || unbilled < 0) {
    throw new PracticeRefusal("PRACTICE_GATE_STATUS_INVALID", gate);
  }
  const halts = typeof row.halts === "number" ? row.halts : Array.isArray(row.halts) ? row.halts.length : null;
  return Object.freeze({ state: row.state, todayUnbilled: unbilled, halts });
}

/** The start rule on root's status: active, and at most 10 unbilled refusals today. */
export function assertGateStatusAllowsPractice(gate: string, status: PracticeGateStatus): void {
  if (status.state !== "active") throw new PracticeRefusal("PRACTICE_GATE_NOT_ACTIVE", `${gate}: ${status.state}`);
  if (status.todayUnbilled > PRACTICE_MAX_UNBILLED_TODAY) {
    throw new PracticeRefusal("PRACTICE_GATE_TOO_MANY_UNBILLED_TODAY", `${gate}: ${String(status.todayUnbilled)}`);
  }
}

export function readGateStatus(gate: string, path: string): PracticeGateStatus {
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { throw new PracticeRefusal("PRACTICE_GATE_STATUS_UNREADABLE", gate); }
  return parseGateStatus(gate, text);
}
