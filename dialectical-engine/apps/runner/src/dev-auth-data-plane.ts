import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import type { DevelopmentProviderPanel } from "./dev-provider-panel.js";
import { resolveDevCustodyRoot } from "../../../deploy/dev-auth/custody-root.mjs";

const DATA_PLANE_SERVICES = Object.freeze(["postgres", "hatchet-lite"] as const);
const LOCAL_MIGRATOR_DATABASE_URL =
  "postgresql://debateai:debateai-dev-only@127.0.0.1:55432/debateai";
const MAX_CHILD_OUTPUT_BYTES = 128 * 1024;

export type DevelopmentAuthDataPlaneReceipt = Readonly<{
  postgres: "READY";
  hatchet: "READY";
  migrations: "APPLIED";
  principals: "ATTESTED";
  register: "SEALED";
  secrets: "ATTESTED";
  mailCapture: "ATTESTED";
}>;

export type DevelopmentAuthDataPlane = Readonly<{
  receipt: DevelopmentAuthDataPlaneReceipt;
  stop(): Promise<void>;
}>;

export type DevelopmentAuthDependencyStart = Readonly<{
  startedServices: readonly string[];
}>;

export type DevelopmentAuthDataPlaneOperations = Readonly<{
  prepareComposeEnvironment(): Promise<void>;
  resolveDockerExecutable(): Promise<string>;
  assertDockerEngine(dockerExecutable: string): Promise<void>;
  startDependencies(dockerExecutable: string): Promise<DevelopmentAuthDependencyStart>;
  waitForPostgres(dockerExecutable: string): Promise<void>;
  migrate(): Promise<void>;
  provisionPrincipals(): Promise<void>;
  seedRegister(): Promise<void>;
  generateSecrets(): Promise<void>;
  verifyMailCapture(): Promise<void>;
  stopDependencies(dockerExecutable: string, services: readonly string[]): Promise<void>;
}>;

export class DevelopmentAuthDataPlaneError extends Error {
  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "DevelopmentAuthDataPlaneError";
  }
}

async function fixedStep<T>(code: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new DevelopmentAuthDataPlaneError(code, error);
  }
}

export async function startDevelopmentAuthDataPlane(
  operations: DevelopmentAuthDataPlaneOperations
): Promise<DevelopmentAuthDataPlane> {
  let dockerExecutable: string | undefined;
  let startedServices: readonly string[] = Object.freeze([]);
  try {
    await fixedStep(
      "DEV_AUTH_DATA_PLANE_COMPOSE_ENV_FAILED",
      () => operations.prepareComposeEnvironment()
    );
    dockerExecutable = await fixedStep(
      "DEV_AUTH_DATA_PLANE_DOCKER_UNAVAILABLE",
      () => operations.resolveDockerExecutable()
    );
    await fixedStep(
      "DEV_AUTH_DATA_PLANE_DOCKER_ENGINE_UNAVAILABLE",
      () => operations.assertDockerEngine(dockerExecutable!)
    );
    const started = await fixedStep(
      "DEV_AUTH_DATA_PLANE_DEPENDENCY_START_FAILED",
      () => operations.startDependencies(dockerExecutable!)
    );
    startedServices = Object.freeze([...started.startedServices]);
    await fixedStep(
      "DEV_AUTH_DATA_PLANE_POSTGRES_UNAVAILABLE",
      () => operations.waitForPostgres(dockerExecutable!)
    );
    await fixedStep("DEV_AUTH_DATA_PLANE_MIGRATION_FAILED", () => operations.migrate());
    await fixedStep(
      "DEV_AUTH_DATA_PLANE_PRINCIPAL_FAILED",
      () => operations.provisionPrincipals()
    );
    await fixedStep("DEV_AUTH_DATA_PLANE_REGISTER_FAILED", () => operations.seedRegister());
    await fixedStep("DEV_AUTH_DATA_PLANE_SECRET_FAILED", () => operations.generateSecrets());
    await fixedStep("DEV_AUTH_DATA_PLANE_MAIL_FAILED", () => operations.verifyMailCapture());
    const receipt = Object.freeze({
      postgres: "READY",
      hatchet: "READY",
      migrations: "APPLIED",
      principals: "ATTESTED",
      register: "SEALED",
      secrets: "ATTESTED",
      mailCapture: "ATTESTED"
    } as const);
    const ownedServices = Object.freeze([...startedServices].reverse());
    let stopPromise: Promise<void> | undefined;
    return Object.freeze({
      receipt,
      stop() {
        stopPromise ??= (async () => {
          if (ownedServices.length === 0) return;
          try {
            await operations.stopDependencies(dockerExecutable!, ownedServices);
          } catch (error) {
            throw new DevelopmentAuthDataPlaneError(
              "DEV_AUTH_DATA_PLANE_CLEANUP_FAILED",
              error
            );
          }
        })();
        return stopPromise;
      }
    });
  } catch (error) {
    if (dockerExecutable !== undefined && startedServices.length > 0) {
      try {
        await operations.stopDependencies(dockerExecutable, [...startedServices].reverse());
      } catch (cleanupError) {
        throw new DevelopmentAuthDataPlaneError(
          "DEV_AUTH_DATA_PLANE_CLEANUP_FAILED",
          cleanupError
        );
      }
    }
    throw error;
  }
}

export async function bootstrapDevelopmentAuthDataPlane(
  operations: DevelopmentAuthDataPlaneOperations
): Promise<DevelopmentAuthDataPlaneReceipt> {
  return (await startDevelopmentAuthDataPlane(operations)).receipt;
}

type CommandInput = Readonly<{
  executable: string;
  arguments: readonly string[];
  cwd: string;
  baseEnvironment: Readonly<Record<string, string>>;
  environment?: Readonly<Record<string, string>>;
  failureCode: string;
  timeoutMs?: number;
}>;

function runCommand(input: CommandInput): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(input.executable, input.arguments, {
      cwd: input.cwd,
      env: { ...input.baseEnvironment, ...input.environment },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const standardOutput: Buffer[] = [];
    let outputBytes = 0;
    let outputOverflow = false;
    let settled = false;
    const settleFailure = (cause?: unknown) => {
      if (settled) return;
      settled = true;
      rejectPromise(new DevelopmentAuthDataPlaneError(input.failureCode, cause));
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
      settleFailure();
    }, input.timeoutMs ?? 120_000);
    timeout.unref();
    const capture = (chunk: Buffer | string, retain: boolean) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      outputBytes += bytes.byteLength;
      if (outputBytes > MAX_CHILD_OUTPUT_BYTES) {
        outputOverflow = true;
        child.kill("SIGTERM");
        return;
      }
      if (retain) standardOutput.push(bytes);
    };
    child.stdout.on("data", (chunk: Buffer | string) => capture(chunk, true));
    child.stderr.on("data", (chunk: Buffer | string) => capture(chunk, false));
    child.once("error", (error) => {
      clearTimeout(timeout);
      settleFailure(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (settled) return;
      if (code === 0 && signal === null && !outputOverflow) {
        settled = true;
        resolvePromise(Buffer.concat(standardOutput).toString("utf8").trim());
      } else {
        settleFailure();
      }
    });
  });
}

async function executableExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveDockerExecutable(
  commandEnvironment: Readonly<Record<string, string>>
): Promise<string> {
  const configured = commandEnvironment.DEBATEAI_DEV_DOCKER_BIN?.trim();
  const pathCandidates = (commandEnvironment.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry.length > 0)
    .map((entry) => join(entry, "docker"));
  const candidates = [
    ...(configured === undefined || configured.length === 0 ? [] : [resolve(configured)]),
    ...pathCandidates,
    "/Applications/Docker.app/Contents/Resources/bin/docker"
  ];
  for (const candidate of candidates) {
    if (await executableExists(candidate)) return candidate;
  }
  throw new DevelopmentAuthDataPlaneError("DEV_AUTH_DATA_PLANE_DOCKER_UNAVAILABLE");
}

function composeArguments(...arguments_: readonly string[]): readonly string[] {
  return Object.freeze([
    "compose",
    "--progress", "quiet",
    "--env-file", ".env.compose",
    "-f", "compose.dev.yaml",
    ...arguments_
  ]);
}

export function createDevelopmentAuthDataPlaneOperations(
  repositoryRoot: string,
  commandEnvironment: Readonly<Record<string, string>>,
  providerPanel: DevelopmentProviderPanel
): DevelopmentAuthDataPlaneOperations {
  const cwd = resolve(repositoryRoot);
  const composeEnvironment = Object.freeze({ VLLM_MODEL: "dev-auth-not-started" });
  const migrationEnvironment = Object.freeze({
    MIGRATION_DATABASE_URL: LOCAL_MIGRATOR_DATABASE_URL
  });
  const pnpm = commandEnvironment.PNPM_EXECUTABLE?.trim() || "pnpm";
  const runPnpm = (arguments_: readonly string[], failureCode: string, environment = {}) =>
    runCommand({
      executable: pnpm,
      arguments: arguments_,
      cwd,
      baseEnvironment: commandEnvironment,
      environment,
      failureCode
    });
  const runDocker = (
    dockerExecutable: string,
    arguments_: readonly string[],
    failureCode: string
  ) => runCommand({
    executable: dockerExecutable,
    arguments: composeArguments(...arguments_),
    cwd,
    baseEnvironment: commandEnvironment,
    environment: composeEnvironment,
    failureCode
  });

  return Object.freeze({
    async prepareComposeEnvironment() {
      await runPnpm(["compose:env"], "DEV_AUTH_DATA_PLANE_COMPOSE_ENV_FAILED");
    },
    async resolveDockerExecutable() {
      return resolveDockerExecutable(commandEnvironment);
    },
    async assertDockerEngine(dockerExecutable) {
      const version = await runCommand({
        executable: dockerExecutable,
        arguments: ["info", "--format", "{{.ServerVersion}}"],
        cwd,
        baseEnvironment: commandEnvironment,
        failureCode: "DEV_AUTH_DATA_PLANE_DOCKER_ENGINE_UNAVAILABLE",
        timeoutMs: 15_000
      });
      if (!/^\d+\.\d+(?:\.\d+)?$/u.test(version)) {
        throw new DevelopmentAuthDataPlaneError(
          "DEV_AUTH_DATA_PLANE_DOCKER_ENGINE_UNAVAILABLE"
        );
      }
    },
    async startDependencies(dockerExecutable) {
      const output = await runDocker(
        dockerExecutable,
        ["ps", "--status", "running", "--services"],
        "DEV_AUTH_DATA_PLANE_DEPENDENCY_STATUS_FAILED"
      );
      const running = new Set(output.split(/\r?\n/u).filter(Boolean));
      const missing = DATA_PLANE_SERVICES.filter((service) => !running.has(service));
      if (missing.length === 0) {
        return Object.freeze({ startedServices: Object.freeze([]) });
      }
      try {
        await runDocker(
          dockerExecutable,
          ["up", "-d", ...missing],
          "DEV_AUTH_DATA_PLANE_DEPENDENCY_START_FAILED"
        );
      } catch (error) {
        await runDocker(
          dockerExecutable,
          ["stop", ...[...missing].reverse()],
          "DEV_AUTH_DATA_PLANE_DEPENDENCY_CLEANUP_FAILED"
        ).catch(() => undefined);
        throw error;
      }
      return Object.freeze({ startedServices: Object.freeze([...missing]) });
    },
    async waitForPostgres(dockerExecutable) {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
          await runDocker(
            dockerExecutable,
            ["exec", "-T", "postgres", "pg_isready", "-U", "debateai", "-d", "debateai"],
            "DEV_AUTH_DATA_PLANE_POSTGRES_UNAVAILABLE"
          );
          return;
        } catch {
          if (attempt === 59) break;
          await delay(1_000);
        }
      }
      throw new DevelopmentAuthDataPlaneError("DEV_AUTH_DATA_PLANE_POSTGRES_UNAVAILABLE");
    },
    async migrate() {
      await runPnpm(["db:migrate"], "DEV_AUTH_DATA_PLANE_MIGRATION_FAILED", migrationEnvironment);
    },
    async provisionPrincipals() {
      await runPnpm(
        ["dev:auth:provision-principals"],
        "DEV_AUTH_DATA_PLANE_PRINCIPAL_FAILED",
        migrationEnvironment
      );
    },
    async seedRegister() {
      await runPnpm(
        ["dev:auth:seed-register"],
        "DEV_AUTH_DATA_PLANE_REGISTER_FAILED",
        {
          ...migrationEnvironment,
          DEBATEAI_DEV_PROVIDER_TARGETS_JSON: providerPanel.targetsJson
        }
      );
    },
    async generateSecrets() {
      await runPnpm(["dev:auth:generate-secrets"], "DEV_AUTH_DATA_PLANE_SECRET_FAILED");
    },
    async verifyMailCapture() {
      await runCommand({
        executable: process.execPath,
        arguments: ["deploy/dev-auth/sendmail-capture.mjs", "--preflight"],
        cwd,
        baseEnvironment: commandEnvironment,
        environment: {
          DEBATEAI_DEV_MAIL_CAPTURE_DIR: join(resolveDevCustodyRoot(cwd, commandEnvironment), "mail")
        },
        failureCode: "DEV_AUTH_DATA_PLANE_MAIL_FAILED"
      });
    },
    async stopDependencies(dockerExecutable, services) {
      if (services.length === 0) return;
      await runDocker(
        dockerExecutable,
        ["stop", ...services],
        "DEV_AUTH_DATA_PLANE_CLEANUP_FAILED"
      );
    }
  });
}
