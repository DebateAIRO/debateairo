/**
 * Preview practice: the start checks and the operator's inputs.
 *
 * Plain words: before a practice spends a cent it refuses unless
 *  - both forwarded gate sockets exist on this computer (PRACTICE_DEEPINFRA_SOCKET, PRACTICE_ANTHROPIC_SOCKET),
 *  - the operator has written PRACTICE_ACK=spends-real-money,
 *  - the live settings file holds only the allowed, non-secret runner/API settings and nothing key-shaped (a hosted
 *    preview's billing and country-file settings are set aside unread: see PRACTICE_HOSTED_SET_ASIDE_KEYS),
 *  - root's fresh `status` of each gate says it is active and has fewer than three connection failures in a row
 *    (the gate halts at five). "Too busy" refusals and cool-offs do not count: the gate never halts on them.
 * The gates' read-only "what is left today" answer is checked separately, once the sockets are known to work.
 */
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { PREVIEW_THINKING_LEVELS_INVALID, parsePreviewEnvironmentConfig, parsePreviewProviderTestConfig, type PreviewProviderTestConfig } from "@debateai/providers";
import { developmentReleaseKey, parseReleaseKey, TypedDomainError } from "@debateai/kernel";
import { assertReleaseKeyForRegister, resolveDeploymentMode, type DeploymentMode } from "@debateai/register";
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
  "STRANGER_SAMPLE_RATE", "BATTERY_VERSION", "SETTLEMENT_WATCH_HANDLE", "RELEASE_KEY"
] as const);
type SettingsKey = typeof PRACTICE_SETTINGS_KEYS[number];
/**
 * A HOSTED preview's API-only settings (deploy/preview-auth-dev/v1/environment.mjs: the country files and NETOPIA's,
 * Quaderno's, SmartBill's and the owner report's settings; tests/unit/preview-practice-hosted.test.ts pins this list
 * against that file). The practice never needs them: it boots no billing route, no country gate and no mail, and its
 * ask goes straight to the ask application, never through the API's routes. Their values are server paths of files the
 * Mac does not have (key files among them) and sandbox addresses the practice must never call. So a hosted settings
 * file may carry them and they are SET ASIDE: screened for a key shape like every value, then never read again, never
 * opened, never sent; the practice prints their names (never a value). In local mode they stay refused exactly as
 * before (PRACTICE_SETTINGS_KEY_REFUSED): local mode has no billing (environment.mjs refuses them there too).
 */
export const PRACTICE_HOSTED_SET_ASIDE_KEYS = Object.freeze([
  "GEOIP_COUNTRY_DB_PATH", "TOR_EXIT_LIST_PATH",
  "NETOPIA_API_BASE_URL", "NETOPIA_POS_SIGNATURE", "NETOPIA_API_KEY_PATH", "NETOPIA_IPN_KEYS_PATH",
  "QUADERNO_API_KEY_PATH", "QUADERNO_API_BASE_URL", "SMARTBILL_CREDENTIALS_PATH", "SMARTBILL_API_BASE_URL", "SMARTBILL_SERIES",
  "OWNER_REPORT_EMAIL_PATH"
] as const);
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
  /** Hosted only: the names (never the values) of the server-only settings set aside unread, in file order. */
  setAsideKeys: readonly string[];
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

/** A full git commit id: what `git rev-parse --verify HEAD` prints. */
const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/u;

/**
 * Side-by-side spec §1, §3: the ONE release key of a practice. Its runner is composed in this process (no RELEASE_KEY is
 * booted), and its ask stamps every run with the same key, so a practice debate is never NO_WORK to its own runner. A
 * RELEASE_KEY settings line wins (README step S-2 does not copy the live one; an operator may add one by hand); else
 * the checkout's revision names it (`r<REGISTER_VERSION>-<first 12 hex>`); else, locally only, the development key; a
 * hosted practice with neither refuses (a hosted release always names its source revision). Every key passes
 * assertReleaseKeyForRegister.
 */
function practiceReleaseKey(line: string | undefined, registerVersion: number, mode: DeploymentMode,
  sourceRevision: string | null | undefined): string {
  const key = line ?? (sourceRevision !== undefined && sourceRevision !== null && SOURCE_REVISION_PATTERN.test(sourceRevision)
    ? `r${String(registerVersion)}-${sourceRevision.slice(0, 12)}`
    : mode === "hosted" ? undefined : developmentReleaseKey(registerVersion));
  if (key === undefined) throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", "RELEASE_KEY");
  return checkedPracticeReleaseKey(key, registerVersion, mode);
}

/** assertReleaseKeyForRegister as a practice refusal. Content-free: the check's own code, never the value. */
function checkedPracticeReleaseKey(key: string, registerVersion: number, mode: DeploymentMode): string {
  try { return assertReleaseKeyForRegister(key, registerVersion, mode); } catch (error) {
    throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID",
      `RELEASE_KEY${error instanceof TypedDomainError ? `: ${error.code}` : ""}`);
  }
}

/**
 * The practice's key at another register version (practice-debate.ts runs on the live version + 1 with --register-next
 * or its own override version): the same code part, the new number, so the key still names the version both
 * compositions read (side-by-side spec §1) and the ask and the runner still share it. Checked again against the mode
 * the practice finally runs in (B6 review): --register-next with a kit v3 composer switches it to hosted, where a local
 * development key is refused exactly as parsePracticeSettings refuses it.
 */
export function practiceReleaseKeyAt(releaseKey: string, registerVersion: number, mode: DeploymentMode): string {
  return checkedPracticeReleaseKey(
    parseReleaseKey(`r${String(registerVersion)}-${parseReleaseKey(releaseKey).codeRevision12}`).releaseKey,
    registerVersion, mode);
}

/**
 * KEY=value lines, as root writes them with grep from runner.env and api.env (README step S-2). Values are never
 * quoted in those files. A blank line or a # comment is skipped. Anything outside the allow-list refuses, and so does
 * a value that holds anything key-shaped (the long-run rule is not applied: a scope id is long but not a key).
 */
export function parsePracticeSettings(text: string, context?: Readonly<{ sourceRevision?: string | null }>): PracticeSettings {
  const values = new Map<string, string>();
  // Hosted only: each set-aside key and its line number (its value is dropped here, after the key-shape screen). Only
  // a file that says DEBATEAI_DEPLOYMENT_MODE=hosted may carry them; in any other file they are refused at their own
  // line, exactly as before hosted practice existed.
  const setAside = new Map<string, number>();
  const declaresHosted = text.split(/\r?\n/u).some((raw) => raw.trim() === "DEBATEAI_DEPLOYMENT_MODE=hosted");
  for (const [index, raw] of text.split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals < 1) throw new PracticeRefusal("PRACTICE_SETTINGS_LINE_INVALID", `line ${String(index + 1)}`);
    const key = line.slice(0, equals);
    const value = line.slice(equals + 1);
    if (declaresHosted && (PRACTICE_HOSTED_SET_ASIDE_KEYS as readonly string[]).includes(key)) {
      if (setAside.has(key)) throw new PracticeRefusal("PRACTICE_SETTINGS_KEY_DUPLICATE", key);
      if (settingsValueIsKeyShaped(value)) throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_KEY_SHAPED", key);
      setAside.set(key, index + 1);
      continue;
    }
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
  // Addition D14-D16: the runner's two preview keys too, exactly as the runner's environment parses the same value (one
  // key check behind both parsers: its gate part and its line-up), inside the same refusal so a disagreement is a
  // PracticeRefusal, never a raw error.
  let previewEnvironment: ReturnType<typeof parsePreviewEnvironmentConfig>;
  try {
    previewConfig = parsePreviewProviderTestConfig(get("PREVIEW_PROVIDER_TEST_CONFIG_JSON"));
    previewEnvironment = parsePreviewEnvironmentConfig(get("PREVIEW_PROVIDER_TEST_CONFIG_JSON"));
  } catch (error) {
    // Spec 2026-10-12 §4.2: the parser's own code is kept, and a bad table's detail with it, so a practice on a bad table
    // says why. The detail can repeat an unreviewed table key or step word verbatim, and the key-shape screen above skips
    // the long-run rules, so every key shape (a bare long token too) is blanked before it is shown.
    const message = error instanceof Error ? error.message : "";
    const parserSays = message.startsWith(`${PREVIEW_THINKING_LEVELS_INVALID}:`) ? redactKeyShapes(message).slice(0, 200)
      : "PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID";
    throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", `PREVIEW_PROVIDER_TEST_CONFIG_JSON: ${parserSays}`);
  }
  if (previewConfig === undefined || previewEnvironment === undefined || previewConfig.anthropic_budget_socket === undefined) {
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
  // Hosted is practised too (owner rulings 2026-10-13: the preview switches to hosted mode with NETOPIA's sandbox): the
  // runner and the ask path are then composed as the two main.ts files compose them in hosted mode, with billing kept
  // off in the practice (practice-ask-composition.ts says why). environment.mjs admits hosted on the preview only with
  // the preview configuration, which the practice requires above.
  const rate = Number(get("STRANGER_SAMPLE_RATE"));
  if (!(rate >= 0 && rate <= 1)) throw new PracticeRefusal("PRACTICE_SETTINGS_VALUE_INVALID", "STRANGER_SAMPLE_RATE");
  const registerVersion = integer("REGISTER_VERSION", 1);
  const runner: PracticeRunnerSettings = Object.freeze({
    REGISTER_VERSION: registerVersion,
    RELEASE_KEY: practiceReleaseKey(values.get("RELEASE_KEY"), registerVersion, mode, context?.sourceRevision),
    PREVIEW_GATE_SETTINGS: previewEnvironment.gate,
    PREVIEW_ENV_LINE_UP: previewEnvironment.envLineUp,
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
    batteryVersion: get("BATTERY_VERSION"), settlementWatchHandle: get("SETTLEMENT_WATCH_HANDLE"),
    setAsideKeys: Object.freeze([...setAside.entries()].sort((a, b) => a[1] - b[1]).map(([key]) => key)) });
}

/** `sourceRevision`: the checkout's `git rev-parse --verify HEAD`, or null when git cannot answer (practiceReleaseKey). */
export function readPracticeSettings(path: string, sourceRevision: string | null): PracticeSettings {
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { throw new PracticeRefusal("PRACTICE_SETTINGS_UNREADABLE"); }
  return parsePracticeSettings(text, { sourceRevision });
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
