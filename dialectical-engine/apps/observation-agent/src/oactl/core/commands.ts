import { execFile } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { z } from "zod";
import { readCustodiedSecretFile } from "../../core/custody.js";
import { normalizeObservationError, ObservationError } from "../../core/errors.js";
import { discoverObservationRuntimeModules } from "../../core/modules.js";
import { OBSERVATION_COMPONENTS, STATUS_VIEW_PATTERN } from "../../core/types.js";
import {
  installLaunchAgent,
  killLaunchAgent,
  launchAgentPath,
  startLaunchAgent,
  stopLaunchAgent,
  uninstallLaunchAgent,
  type CommandExecutor
} from "./launchd.js";
import { provisionObservationAgent } from "./provision.js";
import { fixedStateDirectory, removeMute, writeMute } from "./state.js";
import { renderStatus } from "./status.js";
import { loadMergedThresholdPolicy, ThresholdRepository } from "./thresholds.js";
import { resolveDevCustodyRoot } from "../../../../../deploy/dev-auth/custody-root.mjs";

export const CORE_VERB_NAMES = Object.freeze([
  "provision", "install", "uninstall", "start", "kill", "status", "mute",
  "unmute", "thresholds"
] as const);

export type OactlIo = Readonly<{
  stdout(value: string): void;
  stderr(value: string): void;
}>;

export type OactlVerbContribution = Readonly<{
  verb: string;
  run(args: readonly string[]): Promise<number>;
}>;

export function assertNoCoreVerbCollisions(contributions: readonly OactlVerbContribution[]): void {
  if (contributions.some((contribution) => CORE_VERB_NAMES.includes(contribution.verb as never))) {
    throw new ObservationError("OBSERVATION_DUPLICATE_VERB");
  }
}

function requireVerb(candidate: unknown): OactlVerbContribution {
  if (candidate === null || typeof candidate !== "object") {
    throw new ObservationError("OBSERVATION_VERB_INVALID");
  }
  const contribution = candidate as Partial<OactlVerbContribution>;
  if (typeof contribution.verb !== "string"
    || !/^[a-z][a-z0-9-]*$/u.test(contribution.verb)
    || typeof contribution.run !== "function") {
    throw new ObservationError("OBSERVATION_VERB_INVALID");
  }
  return Object.freeze(contribution as OactlVerbContribution);
}

async function importDefault(path: string): Promise<unknown> {
  const imported = await import(pathToFileURL(path).href) as Readonly<{ default?: unknown }>;
  return imported.default;
}

async function moduleVerbFiles(moduleRoot: string): Promise<readonly string[]> {
  const root = join(moduleRoot, "oactl");
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => join(root, entry.name))
      .sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function discoverObservationCommandVerbs(
  modulesRoot: string
): Promise<readonly OactlVerbContribution[]> {
  await discoverObservationRuntimeModules(modulesRoot);
  const directories = (await readdir(modulesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const verbs: OactlVerbContribution[] = [];
  const verbNames = new Set<string>();

  for (const directory of directories) {
    const moduleRoot = join(modulesRoot, directory);
    const modulePath = join(moduleRoot, "module.ts");
    try {
      await access(modulePath);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    const candidates = await Promise.all((await moduleVerbFiles(moduleRoot)).map(importDefault));
    for (const candidate of candidates) {
      const contribution = requireVerb(candidate);
      if (verbNames.has(contribution.verb)) {
        throw new ObservationError("OBSERVATION_DUPLICATE_VERB");
      }
      verbNames.add(contribution.verb);
      verbs.push(contribution);
    }
  }

  return Object.freeze(verbs);
}

type Context = Readonly<{
  repoRoot: string;
  home: string;
  uid: number;
  execute: CommandExecutor;
}>;

const environmentSchema = z.object({
  OBSERVATION_DATABASE_URL: z.string().url(),
  OBSERVATION_STATE_DIR: z.string().startsWith("/"),
  OBSERVATION_TARGETS_PATH: z.string().startsWith("/"),
  OBSERVATION_HATCHET_TOKEN_PATH: z.string().min(1)
}).strict();

function defaultContext(): Context {
  return Object.freeze({
    repoRoot: resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.."),
    home: homedir(),
    uid: userInfo().uid,
    execute: executeFile
  });
}

async function executeFile(file: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    execFile(file, [...args], { timeout: 5_000 }, (error) => {
      if (error === null) resolvePromise();
      else reject(error);
    });
  });
}

function unquote(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("'\\''", "'");
  }
  return value;
}

async function readProvisionedEnvironment(repoRoot: string): Promise<z.infer<typeof environmentSchema>> {
  // DL7-F4: read the env file where custody actually is, not where the repository is.
  const path = join(resolveDevCustodyRoot(repoRoot), "observation-agent.env");
  try {
    const entries = (await readFile(path, "utf8")).trim().split("\n").map((line) => {
      const separator = line.indexOf("=");
      if (separator <= 0) throw new Error("bad environment row");
      return [line.slice(0, separator), unquote(line.slice(separator + 1))] as const;
    });
    return environmentSchema.parse(Object.fromEntries(entries));
  } catch (error) {
    throw new ObservationError("OBSERVATION_ENV_FILE_INVALID", error);
  }
}

/**
 * DL7-F9. `oactl thresholds apply` writes the policy the daemon obeys, so it must never run on
 * the daemon's own credential: migration 0071 moved that INSERT to a second principal,
 * `debateai_observation_threshold_operator`, and this is the only place its credential is read.
 * It lives in its own file beside the daemon's, read through the agent's custody loader (a
 * private, singly-linked, non-symlink 0600 file in a 0700 directory, both this uid's), holds
 * exactly one key, and must name that principal and no other. Any deviation refuses before a
 * connection is opened.
 */
export const THRESHOLD_OPERATOR_ENVIRONMENT_FILE = "observation-threshold-operator.env";
const THRESHOLD_OPERATOR_ENVIRONMENT_KEY = "OBSERVATION_THRESHOLD_OPERATOR_DATABASE_URL";
const THRESHOLD_OPERATOR_ROLE = "debateai_observation_threshold_operator";

export async function readThresholdOperatorDatabaseUrl(repoRoot: string): Promise<string> {
  const path = join(resolveDevCustodyRoot(repoRoot), THRESHOLD_OPERATOR_ENVIRONMENT_FILE);
  try {
    const source = await readCustodiedSecretFile(path);
    if (!source.endsWith("\n") || source.includes("\r")) throw new Error("bad file");
    const rows = source.slice(0, -1).split("\n");
    const row = rows[0] ?? "";
    const separator = row.indexOf("=");
    if (rows.length !== 1 || row.slice(0, separator) !== THRESHOLD_OPERATOR_ENVIRONMENT_KEY) {
      throw new Error("bad row");
    }
    const value = unquote(row.slice(separator + 1));
    const url = new URL(value);
    if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:")
      || url.username !== THRESHOLD_OPERATOR_ROLE || url.password === "") {
      throw new Error("bad url");
    }
    return value;
  } catch (error) {
    throw new ObservationError("OBSERVATION_THRESHOLD_OPERATOR_ENV_INVALID", error);
  }
}

function requireNoArgs(args: readonly string[]): void {
  if (args.length !== 0) throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
}

function statusView(args: readonly string[]): string | undefined {
  if (args.length === 0) return undefined;
  const selector = args[0];
  if (args.length !== 1 || selector === undefined || !selector.startsWith("--")) {
    throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
  }
  const view = selector.slice(2);
  if (!STATUS_VIEW_PATTERN.test(view)) {
    throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
  }
  return view;
}

function exhaustive(value: never): never {
  throw new ObservationError("OBSERVATION_VERB_UNKNOWN", value);
}

function optionValue(args: readonly string[], option: string): string | undefined {
  const position = args.indexOf(option);
  if (position === -1) return undefined;
  const value = args[position + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
  }
  return value;
}

async function withRepository<T>(
  connectionString: string,
  operation: (repository: ThresholdRepository) => Promise<T>
): Promise<T> {
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    return await operation(new ThresholdRepository(pool));
  } finally {
    await pool.end();
  }
}

async function runCoreVerb(
  verb: typeof CORE_VERB_NAMES[number],
  args: readonly string[],
  io: OactlIo,
  context: Context
): Promise<number> {
  const stateDir = fixedStateDirectory(context.home);
  switch (verb) {
    case "provision": {
      requireNoArgs(args);
      const result = await provisionObservationAgent({ repoRoot: context.repoRoot, home: context.home });
      io.stdout(result.output);
      return 0;
    }
    case "install": {
      requireNoArgs(args);
      const path = await installLaunchAgent({
        home: context.home,
        uid: context.uid,
        stateDir,
        launchScript: join(context.repoRoot, "apps", "observation-agent", "bin", "launch.sh"),
        execute: context.execute
      });
      io.stdout(`INSTALLED ${path}`);
      return 0;
    }
    case "uninstall":
      requireNoArgs(args);
      await uninstallLaunchAgent({ home: context.home, uid: context.uid, execute: context.execute });
      io.stdout("UNINSTALLED");
      return 0;
    case "start":
      requireNoArgs(args);
      await startLaunchAgent({
        uid: context.uid,
        execute: context.execute,
        fallbackPlistPath: launchAgentPath(context.home)
      });
      io.stdout("STARTED");
      return 0;
    case "kill":
      requireNoArgs(args);
      await killLaunchAgent({ uid: context.uid, execute: context.execute });
      io.stdout("KILLED");
      return 0;
    case "status":
      io.stdout(await renderStatus(stateDir, statusView(args)));
      return 0;
    case "mute": {
      const duration = args[0];
      if (duration === undefined) throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
      const componentValue = optionValue(args, "--component");
      const expectedLength = componentValue === undefined ? 1 : 3;
      if (args.length !== expectedLength || (componentValue !== undefined
        && !OBSERVATION_COMPONENTS.includes(componentValue as never))) {
        throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
      }
      const mute = await writeMute({
        stateDir,
        duration,
        ...(componentValue === undefined ? {} : { component: componentValue as typeof OBSERVATION_COMPONENTS[number] })
      });
      io.stdout(`MUTED until ${mute.expires_at}`);
      return 0;
    }
    case "unmute":
      requireNoArgs(args);
      await removeMute(stateDir);
      io.stdout("UNMUTED");
      return 0;
    case "thresholds": {
      const subcommand = args[0];
      if (subcommand === "show") {
        if (args.length !== 1) throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
        // Reading is the daemon's own right (it keeps SELECT), so `show` uses its credential.
        const environment = await readProvisionedEnvironment(context.repoRoot);
        const current = await withRepository(
          environment.OBSERVATION_DATABASE_URL,
          (repository) => repository.readCurrent()
        );
        io.stdout(`THRESHOLDS v${current.version}\n${JSON.stringify(current.value, null, 2)}`);
        return 0;
      }
      if (subcommand === "apply") {
        const file = args[1];
        const sourceRef = optionValue(args, "--source-ref");
        if (file === undefined || sourceRef === undefined || args.length !== 4) {
          throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
        }
        // DL7-F9: the operator's credential, read first, so a missing or unsafe one refuses
        // before anything else is loaded or any connection is opened.
        const operatorDatabaseUrl = await readThresholdOperatorDatabaseUrl(context.repoRoot);
        const value = await loadMergedThresholdPolicy({
          defaultsDirectory: join(context.repoRoot, "deploy", "observation-agent", "thresholds", "defaults"),
          overrideFile: resolve(context.repoRoot, file)
        });
        const applied = await withRepository(operatorDatabaseUrl, (repository) =>
          repository.apply(value, sourceRef, userInfo().username));
        for (const row of applied.diff) io.stdout(row);
        io.stdout(`THRESHOLDS v${applied.version} APPLIED`);
        return 0;
      }
      throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
    }
    default: return exhaustive(verb);
  }
}

export async function runOactl(
  argv: readonly string[],
  io: OactlIo,
  contextInput?: Context
): Promise<number> {
  const verb = argv[0];
  try {
    if (verb === undefined) throw new ObservationError("OBSERVATION_VERB_REQUIRED");
    const context = contextInput ?? defaultContext();
    const contributions = await discoverObservationCommandVerbs(
      join(context.repoRoot, "apps", "observation-agent", "src", "modules")
    );
    assertNoCoreVerbCollisions(contributions);
    if (CORE_VERB_NAMES.includes(verb as never)) {
      return await runCoreVerb(verb as typeof CORE_VERB_NAMES[number], argv.slice(1), io, context);
    }
    const contribution = contributions.find((candidate) => candidate.verb === verb);
    if (contribution === undefined) throw new ObservationError("OBSERVATION_VERB_UNKNOWN");
    const code = await contribution.run(argv.slice(1));
    return Number.isInteger(code) ? code : 1;
  } catch (error) {
    io.stderr(normalizeObservationError(error));
    return 2;
  }
}
