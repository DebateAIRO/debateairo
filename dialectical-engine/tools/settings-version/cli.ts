/**
 * Side-by-side spec §13, §11 (S15) — THE SETTINGS OPERATOR COMMANDS.
 *
 *   cli.ts verdict --runner <file> --api <file>          record check-version's verdict (both halves' lines)
 *   cli.ts activate <v> --by <name> --reason <text> [--gate-remaining <gate>=<file>]…
 *   cli.ts status                                        the current release, the pointer, what new asks use, what passed
 *   cli.ts latest-passed <releaseKey>                    the version a rollback to that release activates
 *   cli.ts switch-plan <releaseKey> [--activate <v> | --latest-passed]   the release switch's settings step (read-only)
 *
 * (`pnpm settings:verdict|settings:activate|settings:status …` run the same file.) Every decision lives in
 * ./settings-operator.ts; this file reads arguments and files, opens one database connection and prints one line.
 *
 * The connection is the release writers' principal, never a runtime login: libpq's own environment (PGHOST, PGPORT,
 * PGDATABASE, PGUSER), which the root wiring sets to the server's local socket as `postgres`
 * (deploy/preview-lifecycle/v1/settings-version.mjs). No password, no URL on a command line.
 *
 * Output: one stdout line on success — `DEBATEAI_SETTINGS_VERDICT`, `DEBATEAI_SETTINGS_ACTIVATED`,
 * `SETTINGS_ACTIVATION_UNCHANGED`, `DEBATEAI_SETTINGS_STATUS`, `DEBATEAI_SETTINGS_LATEST_PASSED`,
 * `DEBATEAI_SETTINGS_SWITCH_PLAN`, each `<kind> <json>` with versions as decimal strings — or one stderr line,
 * `DEBATEAI_SETTINGS_REFUSED <json>` ({command, code, codes?, passed?}). Content-free: codes, keys, versions, digests.
 * Exit codes: 0 done (a PASS verdict, an activation, an unchanged activation, a read); 1 a FAIL verdict recorded, or an
 * activation refused by condition 6 or by the version's kind; 2 usage, a bad report, or the database could not be asked;
 * 3 SETTINGS_ACTIVATION_CONFLICT; 4 SETTINGS_VERSION_NOT_PASSED.
 */
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { TypedDomainError } from "@debateai/kernel";
import { parsePreviewGateRemaining } from "@debateai/providers";
import {
  ACTIVATION_READERS,
  SettingsOperatorRefusal,
  activateSettingsVersion,
  assertActivationLabels,
  latestPassedSettingsVersion,
  parseSettingsCheckOutput,
  readSettingsStatus,
  recordSettingsVerdict,
  settingsForSwitch,
  settingsVerdictCodes,
  settingsVerdictOf,
  siteVersionOfRelease,
  type ActivationReaders,
  type GateEnabledModels,
  type SettingsOperatorClient
} from "./settings-operator.js";

export type SettingsCliOutput = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
/** One connection for one command; `close` always runs. */
export type SettingsCliConnection = Readonly<{ client: SettingsOperatorClient; close(): Promise<void> }>;
export type SettingsCliDeps = Readonly<{
  connect: () => Promise<SettingsCliConnection>;
  readText: (path: string) => Promise<string>;
  /** The live condition 6's reads (settings-operator.ts; SA10 widens them to the seatable set). */
  activationReaders: ActivationReaders;
}>;

/** A file the commands read: at most this many bytes (a half's line, a gate's answer). */
const MAX_INPUT_BYTES = 64 * 1024;
const POSITIVE = /^[1-9][0-9]{0,15}$/u;
const GATE_NAME = /^[a-z][a-z0-9-]{0,31}$/u;
const KEY = /^r[1-9][0-9]*-[0-9a-f]{12}$/u;

/** libpq's environment names the server and the principal (the root wiring's PGHOST/PGPORT/PGDATABASE/PGUSER). */
export async function connectOperatorDatabase(): Promise<SettingsCliConnection> {
  const client = new pg.Client({ application_name: "operator:settings-version", connectionTimeoutMillis: 5000, statement_timeout: 30000 });
  await client.connect();
  return Object.freeze({ client, close: () => client.end().catch(() => undefined) });
}

async function readBoundedText(path: string): Promise<string> {
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_INPUT_BYTES) throw new TypedDomainError("SETTINGS_OPERATOR_USAGE", "An input file is not a small regular file");
  return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
}

export const SETTINGS_CLI_DEPS: SettingsCliDeps = Object.freeze({
  connect: connectOperatorDatabase, readText: readBoundedText, activationReaders: ACTIVATION_READERS
});

const versionText = (value: number | null): string | null => (value === null ? null : String(value));
const line = (kind: string, value: unknown): string => `${kind} ${JSON.stringify(value)}\n`;
const usage = (message: string): SettingsOperatorRefusal => new SettingsOperatorRefusal("SETTINGS_OPERATOR_USAGE", message);
const positive = (text: string | undefined): number => {
  const value = text !== undefined && POSITIVE.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(value)) throw usage("a settings version is a positive integer");
  return value;
};
const releaseKey = (text: string | undefined): string => {
  if (text === undefined || !KEY.test(text)) throw usage("a release key is r<site settings version>-<12 lowercase hex>");
  return text;
};

/** Pairs `--name value` after the positional arguments; each name at most once unless `repeatable`. */
function options(args: readonly string[], allowed: readonly string[], repeatable: readonly string[] = []): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]!, value = args[index + 1];
    if (!allowed.includes(name) || value === undefined) throw usage(`unexpected argument ${allowed.includes(name) ? "end" : "name"}`);
    const values = found.get(name) ?? [];
    if (values.length > 0 && !repeatable.includes(name)) throw usage("an option was given twice");
    found.set(name, [...values, value]);
  }
  return found;
}
const only = (found: Map<string, string[]>, name: string): string | undefined => found.get(name)?.[0];

async function withConnection<T>(deps: SettingsCliDeps, work: (client: SettingsOperatorClient) => Promise<T>): Promise<T> {
  const connection = await deps.connect();
  try { return await work(connection.client); } finally { await connection.close(); }
}

/** `--gate-remaining <gate>=<file>`: each file is one gate's raw `/remaining` answer; an unreadable or invalid one is no answer. */
async function gateAnswers(values: readonly string[] | undefined, deps: SettingsCliDeps): Promise<GateEnabledModels | undefined> {
  if (values === undefined) return undefined;
  const answers: Record<string, readonly string[]> = {};
  for (const value of values) {
    const at = value.indexOf("=");
    const gate = value.slice(0, at), path = value.slice(at + 1);
    if (at < 1 || !GATE_NAME.test(gate) || path.length === 0 || Object.hasOwn(answers, gate)) throw usage("--gate-remaining is <gate>=<file>, once per gate");
    let parsed: unknown;
    try { parsed = JSON.parse(await deps.readText(path)); } catch { continue; }
    const remaining = parsePreviewGateRemaining(parsed);
    if (remaining !== undefined) answers[gate] = remaining.enabledModels;
  }
  return Object.freeze(answers);
}

type Command = (args: readonly string[], deps: SettingsCliDeps, output: SettingsCliOutput) => Promise<number>;

const COMMANDS: Readonly<Record<string, Command>> = Object.freeze({
  verdict: async (args, deps, output) => {
    const found = options(args, ["--runner", "--api"]);
    const runnerPath = only(found, "--runner"), apiPath = only(found, "--api");
    if (runnerPath === undefined || apiPath === undefined) throw usage("verdict --runner <file> --api <file>");
    const runner = parseSettingsCheckOutput(await deps.readText(runnerPath));
    const api = parseSettingsCheckOutput(await deps.readText(apiPath));
    const verdict = settingsVerdictOf(runner, api);
    await withConnection(deps, (client) => recordSettingsVerdict(client, verdict));
    output.stdout(line("DEBATEAI_SETTINGS_VERDICT", {
      releaseKey: verdict.releaseKey, version: String(verdict.version), verdict: verdict.verdict, digest: verdict.digest,
      codes: settingsVerdictCodes(runner, api)
    }));
    return verdict.verdict === "PASS" ? 0 : 1;
  },
  activate: async (args, deps, output) => {
    const version = positive(args[0]);
    const found = options(args.slice(1), ["--by", "--reason", "--gate-remaining"], ["--gate-remaining"]);
    const activatedBy = only(found, "--by"), reason = only(found, "--reason");
    if (activatedBy === undefined || reason === undefined) throw usage("activate <v> --by <name> --reason <text>");
    assertActivationLabels(activatedBy, reason);
    const gateEnabledModels = await gateAnswers(found.get("--gate-remaining"), deps);
    try {
      const done = await withConnection(deps, (client) => activateSettingsVersion(client, {
        version, activatedBy, reason, ...(gateEnabledModels === undefined ? {} : { gateEnabledModels })
      }, deps.activationReaders));
      output.stdout(line("DEBATEAI_SETTINGS_ACTIVATED", {
        version: String(version), previous: versionText(done.previous), releaseKey: done.releaseKey, activationSeq: done.activationSeq
      }));
    } catch (error) {
      if (!(error instanceof SettingsOperatorRefusal) || error.code !== "SETTINGS_ACTIVATION_UNCHANGED") throw error;
      output.stdout(line("SETTINGS_ACTIVATION_UNCHANGED", { version: String(version) }));
    }
    return 0;
  },
  status: async (args, deps, output) => {
    if (args.length !== 0) throw usage("status takes no argument");
    const status = await withConnection(deps, readSettingsStatus);
    output.stdout(line("DEBATEAI_SETTINGS_STATUS", {
      currentRelease: status.currentRelease, pointer: versionText(status.pointer), effectiveActive: versionText(status.effectiveActive),
      passed: status.passed.map(String)
    }));
    return 0;
  },
  "latest-passed": async (args, deps, output) => {
    if (args.length !== 1) throw usage("latest-passed <releaseKey>");
    const key = releaseKey(args[0]);
    const version = await withConnection(deps, (client) => latestPassedSettingsVersion(client, key));
    output.stdout(line("DEBATEAI_SETTINGS_LATEST_PASSED", { releaseKey: key, version: String(version), siteVersion: String(siteVersionOfRelease(key)) }));
    return 0;
  },
  "switch-plan": async (args, deps, output) => {
    const key = releaseKey(args[0]);
    const rest = args.slice(1);
    let mode: "pointer" | "activate" | "latest" = "pointer";
    let activate: number | undefined;
    if (rest.length === 2 && rest[0] === "--activate") { mode = "activate"; activate = positive(rest[1]); }
    else if (rest.length === 1 && rest[0] === "--latest-passed") mode = "latest";
    else if (rest.length !== 0) throw usage("switch-plan <releaseKey> [--activate <v> | --latest-passed]");
    const plan = await withConnection(deps, async (client) => {
      const chosen = mode === "latest" ? await latestPassedSettingsVersion(client, key) : activate;
      return settingsForSwitch(client, { newRelease: key, ...(chosen === undefined ? {} : { activate: chosen }) });
    });
    output.stdout(line("DEBATEAI_SETTINGS_SWITCH_PLAN", {
      releaseKey: key, expectedActiveSettings: versionText(plan.expectedActiveSettings), activate: versionText(plan.activate)
    }));
    return 0;
  }
});

/** The exit code of a refusal (the header's table); anything untyped is 2 (the database could not be asked). */
function exitOf(code: string): number {
  if (code === "SETTINGS_ACTIVATION_CONFLICT") return 3;
  if (code === "SETTINGS_VERSION_NOT_PASSED") return 4;
  if (code === "SETTINGS_GATE_LIVE_CHECK_FAILED" || code === "SETTINGS_VERSION_KIND_INVALID") return 1;
  return 2;
}
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/u;

/** The whole command, its outputs and connection injected (tests); returns the exit code. */
export async function runSettingsCli(args: readonly string[], output: SettingsCliOutput, deps: SettingsCliDeps = SETTINGS_CLI_DEPS): Promise<number> {
  const name = args[0] ?? "";
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  try {
    if (command === undefined) throw usage("commands: verdict, activate, status, latest-passed, switch-plan");
    return await command(args.slice(1), deps, output);
  } catch (error) {
    const typed = error instanceof TypedDomainError && CODE.test(error.code);
    const code = typed ? error.code : "SETTINGS_OPERATOR_UNAVAILABLE";
    const refusal = error instanceof SettingsOperatorRefusal ? error : undefined;
    output.stderr(line("DEBATEAI_SETTINGS_REFUSED", {
      command: command === undefined ? null : name,
      code,
      ...(refusal !== undefined && refusal.codes.length > 0 ? { codes: refusal.codes } : {}),
      ...(refusal?.passed !== undefined ? { passed: refusal.passed.map(String) } : {})
    }));
    return exitOf(code);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runSettingsCli(process.argv.slice(2), {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); }
  });
}
