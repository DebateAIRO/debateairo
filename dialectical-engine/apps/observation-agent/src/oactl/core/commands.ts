import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { z } from "zod";
import { normalizeObservationError, ObservationError } from "../../core/errors.js";
import { discoverObservationModules } from "../../core/modules.js";
import { OBSERVATION_COMPONENTS } from "../../core/types.js";
import type { OactlVerbContribution } from "../../core/types.js";
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

export const CORE_VERB_NAMES = Object.freeze([
  "provision", "install", "uninstall", "start", "kill", "status", "mute",
  "unmute", "thresholds"
] as const);

export type OactlIo = Readonly<{
  stdout(value: string): void;
  stderr(value: string): void;
}>;

export function assertNoCoreVerbCollisions(contributions: readonly OactlVerbContribution[]): void {
  if (contributions.some((contribution) => CORE_VERB_NAMES.includes(contribution.verb as never))) {
    throw new ObservationError("OBSERVATION_DUPLICATE_VERB");
  }
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
  const path = join(repoRoot, ".local", "dev-auth", "observation-agent.env");
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

function requireNoArgs(args: readonly string[]): void {
  if (args.length !== 0) throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
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

async function withRepository<T>(repoRoot: string, operation: (repository: ThresholdRepository) => Promise<T>): Promise<T> {
  const environment = await readProvisionedEnvironment(repoRoot);
  const pool = new pg.Pool({
    connectionString: environment.OBSERVATION_DATABASE_URL,
    max: 1
  });
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
      requireNoArgs(args);
      io.stdout(await renderStatus(stateDir));
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
        const current = await withRepository(context.repoRoot, (repository) => repository.readCurrent());
        io.stdout(`THRESHOLDS v${current.version}\n${JSON.stringify(current.value, null, 2)}`);
        return 0;
      }
      if (subcommand === "apply") {
        const file = args[1];
        const sourceRef = optionValue(args, "--source-ref");
        if (file === undefined || sourceRef === undefined || args.length !== 4) {
          throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
        }
        const value = await loadMergedThresholdPolicy({
          defaultsDirectory: join(context.repoRoot, "deploy", "observation-agent", "thresholds", "defaults"),
          overrideFile: resolve(context.repoRoot, file)
        });
        const applied = await withRepository(context.repoRoot, (repository) =>
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
    const catalog = await discoverObservationModules(
      join(context.repoRoot, "apps", "observation-agent", "src", "modules")
    );
    assertNoCoreVerbCollisions(catalog.verbs);
    if (CORE_VERB_NAMES.includes(verb as never)) {
      return await runCoreVerb(verb as typeof CORE_VERB_NAMES[number], argv.slice(1), io, context);
    }
    const contribution = catalog.verbs.find((candidate) => candidate.verb === verb);
    if (contribution === undefined) throw new ObservationError("OBSERVATION_VERB_UNKNOWN");
    const code = await contribution.run(argv.slice(1));
    return Number.isInteger(code) ? code : 1;
  } catch (error) {
    io.stderr(normalizeObservationError(error));
    return 2;
  }
}
