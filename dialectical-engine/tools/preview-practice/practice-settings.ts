/**
 * Preview practice: the start checks and the operator's inputs.
 *
 * Plain words: before a practice spends a cent it refuses unless
 *  - both forwarded gate sockets exist on this computer (PRACTICE_DEEPINFRA_SOCKET, PRACTICE_ANTHROPIC_SOCKET),
 *  - the operator has written PRACTICE_ACK=spends-real-money,
 *  - the live settings file holds only the allowed, non-secret runner/API settings and nothing key-shaped,
 *  - root's fresh `status` of each gate says it is active and has fewer than three connection failures in a row
 *    (the gate halts at five). "Too busy" refusals and cool-offs do not count: the gate never halts on them.
 * The gates' read-only "what is left today" answer is checked separately, once the sockets are known to work.
 */
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { PREVIEW_THINKING_LEVELS_INVALID, parsePreviewProviderTestConfig, type PreviewProviderTestConfig } from "@debateai/providers";
import { resolveDeploymentMode } from "@debateai/register";
import { redactKeyShapes } from "./practice-redaction.js";
import type { PracticeRunnerSettings } from "./practice-runner-composition.js";

export const PRACTICE_ACK_VALUE = "spends-real-money" as const;
/**
 * A practice refuses to start on a gate whose connection-failure streak (root's `status` `unsent_streak`) has reached
 * this many: the gate halts at five in a row, and the live site needs the room.
 */
const PRACTICE_REFUSE_UNSENT_STREAK_AT = 3;

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
 * A settings value holds something key-shaped (a vendor key, bearer header, JWT, `secret=` pair, PEM block). The two
 * generic long-run rules are left out: a scope id or a fingerprint is long but not a key. The offline thinking-levels
 * check (check-thinking-levels.ts) uses the same rule.
 */
export function settingsValueIsKeyShaped(value: string): boolean {
  const blanked = redactKeyShapes(value).replace(/\[REDACTED:long-run\]|\[REDACTED:long-hex\]/gu, "");
  const unblanked = value.replace(/[A-Za-z0-9_-]{32,}/gu, "").replace(/\b[0-9a-fA-F]{32,}\b/gu, "");
  return blanked !== unblanked;
}

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
    if (settingsValueIsKeyShaped(value)) throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_KEY_SHAPED", key);
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
  try { previewConfig = parsePreviewProviderTestConfig(get("PREVIEW_PROVIDER_TEST_CONFIG_JSON")); } catch (error) {
    // Spec 2026-10-12 §4.2: the parser's own code is kept, and a bad table's detail with it, so a practice on a bad table
    // says why. The detail can repeat an unreviewed table key or step word verbatim, and the key-shape screen above skips
    // the long-run rules, so every key shape (a bare long token too) is blanked before it is shown.
    const message = error instanceof Error ? error.message : "";
    const parserSays = message.startsWith(`${PREVIEW_THINKING_LEVELS_INVALID}:`) ? redactKeyShapes(message).slice(0, 200)
      : "PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID";
    throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", `PREVIEW_PROVIDER_TEST_CONFIG_JSON: ${parserSays}`);
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

export type PracticeGateStatus = Readonly<{
  state: string;
  unsentStreak: number;
  halts: number | null;
  /** The gate's own limit of calls at once, when the status names it (top level or under `limits`); else null. */
  maxConcurrentCalls: number | null;
}>;

/**
 * Root's `status` output of one gate (JSON). Only four members are read (state, unsent_streak, halts,
 * max_concurrent_calls); the file is never copied into a report. The day's unbilled count is not read: the gate no
 * longer halts on it.
 */
export function parseGateStatus(gate: string, text: string): PracticeGateStatus {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new PracticeRefusal("PRACTICE_GATE_STATUS_INVALID", gate); }
  const row = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const streak = row.unsent_streak;
  if (typeof row.state !== "string" || typeof streak !== "number" || !Number.isSafeInteger(streak) || streak < 0) {
    throw new PracticeRefusal("PRACTICE_GATE_STATUS_INVALID", gate);
  }
  const halts = typeof row.halts === "number" ? row.halts : Array.isArray(row.halts) ? row.halts.length : null;
  const limits = typeof row.limits === "object" && row.limits !== null ? row.limits as Record<string, unknown> : {};
  const named = row.max_concurrent_calls ?? limits.max_concurrent_calls;
  const maxConcurrentCalls = typeof named === "number" && Number.isSafeInteger(named) && named >= 1 ? named : null;
  return Object.freeze({ state: row.state, unsentStreak: streak, halts, maxConcurrentCalls });
}

/** The start rule on root's status: active, and fewer than three connection failures in a row (no daily cap). */
export function assertGateStatusAllowsPractice(gate: string, status: PracticeGateStatus): void {
  if (status.state !== "active") throw new PracticeRefusal("PRACTICE_GATE_NOT_ACTIVE", `${gate}: ${status.state}`);
  if (status.unsentStreak >= PRACTICE_REFUSE_UNSENT_STREAK_AT) {
    throw new PracticeRefusal("PRACTICE_GATE_UNSENT_STREAK_TOO_HIGH", `${gate}: ${String(status.unsentStreak)}`);
  }
}

export function readGateStatus(gate: string, path: string): PracticeGateStatus {
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { throw new PracticeRefusal("PRACTICE_GATE_STATUS_UNREADABLE", gate); }
  return parseGateStatus(gate, text);
}
