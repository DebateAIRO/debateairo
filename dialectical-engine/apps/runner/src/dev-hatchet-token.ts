import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, open, rename, unlink } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { HatchetClient } from "@hatchet-dev/typescript-sdk/v1/client/client.js";

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const MAX_TOKEN_BYTES = 16 * 1024;
const MAX_CHILD_OUTPUT_BYTES = 16 * 1024;
const MIN_REMAINING_TOKEN_SECONDS = 30 * 24 * 60 * 60;
const LOCAL_SERVER_URL = "http://localhost:8888";
const LOCAL_API_URL = "http://127.0.0.1:8888";
const LOCAL_GRPC_BROADCAST_ADDRESS = "localhost:7077";
const LOCAL_GRPC_HOST_PORT = "127.0.0.1:7077";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const TOKEN_COMMAND = Object.freeze([
  "./hatchet-admin", "--config", "/config", "token", "create",
  "--name", "debateai-local-auth", "--expiresIn", "8760h"
] as const);

export type DevelopmentHatchetTokenReceipt = Readonly<{
  reused: boolean;
  authority: "ATTESTED";
  workflowApi: "REACHABLE";
}>;

export type DevelopmentHatchetTokenOperations = Readonly<{
  issueToken(): Promise<string>;
  attestToken(token: string, tenantId: string): Promise<void>;
}>;

export type ProvisionDevelopmentHatchetTokenInput = Readonly<{
  repositoryRoot: string;
  operations: DevelopmentHatchetTokenOperations;
}>;

export class DevelopmentHatchetTokenError extends Error {
  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "DevelopmentHatchetTokenError";
  }
}

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_OWNER_UNVERIFIED");
  }
  return process.getuid();
}

function isFileSystemError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

async function assertPrivateDirectory(path: string): Promise<void> {
  const metadata = await lstat(path).catch(() => null);
  if (metadata === null
    || metadata.isSymbolicLink()
    || !metadata.isDirectory()
    || metadata.uid !== currentUid()
    || (metadata.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
    throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_CUSTODY_INVALID");
  }
}

async function readPrivateTokenFile(path: string): Promise<string | undefined> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) return undefined;
    throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_CUSTODY_INVALID");
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || metadata.uid !== currentUid()
      || metadata.nlink !== 1
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
      || metadata.size < 1
      || metadata.size > MAX_TOKEN_BYTES) {
      throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_CUSTODY_INVALID");
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

function parseTokenFile(source: string): string {
  const prefix = "HATCHET_CLIENT_TOKEN=";
  if (!source.endsWith("\n")
    || source.includes("\r")
    || source.includes("\0")
    || source.slice(0, -1).includes("\n")
    || !source.startsWith(prefix)) {
    throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_CUSTODY_INVALID");
  }
  const token = source.slice(prefix.length, -1);
  if (token.length === 0) {
    throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_CUSTODY_INVALID");
  }
  return token;
}

function decodeJsonPart(part: string): Readonly<Record<string, unknown>> {
  const parsed = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("invalid JWT object");
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function tenantIdFromToken(token: string, now: Date = new Date()): string {
  if (Buffer.byteLength(token, "utf8") > MAX_TOKEN_BYTES || !TOKEN_PATTERN.test(token)) {
    throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_INVALID");
  }
  try {
    const [headerPart, payloadPart] = token.split(".");
    const header = decodeJsonPart(headerPart!);
    const payload = decodeJsonPart(payloadPart!);
    const nowSeconds = Math.floor(now.getTime() / 1_000);
    if (header.alg !== "ES256"
      || typeof header.kid !== "string"
      || header.kid.length === 0
      || typeof payload.sub !== "string"
      || !UUID_PATTERN.test(payload.sub)
      || typeof payload.token_id !== "string"
      || !UUID_PATTERN.test(payload.token_id)
      || payload.aud !== LOCAL_SERVER_URL
      || payload.iss !== LOCAL_SERVER_URL
      || payload.server_url !== LOCAL_SERVER_URL
      || payload.grpc_broadcast_address !== LOCAL_GRPC_BROADCAST_ADDRESS
      || typeof payload.iat !== "number"
      || !Number.isInteger(payload.iat)
      || payload.iat > nowSeconds + 300
      || typeof payload.exp !== "number"
      || !Number.isInteger(payload.exp)
      || payload.exp - nowSeconds < MIN_REMAINING_TOKEN_SECONDS
      || payload.exp <= payload.iat) {
      throw new TypeError("invalid JWT authority");
    }
    return payload.sub;
  } catch (error) {
    if (error instanceof DevelopmentHatchetTokenError) throw error;
    throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_INVALID");
  }
}

async function publishTokenFile(path: string, token: string): Promise<void> {
  const source = `HATCHET_CLIENT_TOKEN=${token}\n`;
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  let temporaryExists = false;
  try {
    const handle = await open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      PRIVATE_FILE_MODE
    );
    temporaryExists = true;
    try {
      await handle.chmod(PRIVATE_FILE_MODE);
      await handle.writeFile(source, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, path);
    temporaryExists = false;
  } finally {
    if (temporaryExists) await unlink(temporaryPath);
  }
  const directory = await open(dirname(path), constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  if (await readPrivateTokenFile(path) !== source) {
    throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_PUBLISH_FAILED");
  }
}

async function fixedStep<T>(code: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DevelopmentHatchetTokenError) throw error;
    throw new DevelopmentHatchetTokenError(code, error);
  }
}

export async function provisionDevelopmentHatchetToken(
  input: ProvisionDevelopmentHatchetTokenInput
): Promise<DevelopmentHatchetTokenReceipt> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const localRoot = join(repositoryRoot, ".local");
  const custodyRoot = join(localRoot, "dev-auth");
  const tokenPath = join(custodyRoot, "hatchet.env");
  const lockPath = `${tokenPath}.lock`;
  await assertPrivateDirectory(localRoot);
  await assertPrivateDirectory(custodyRoot);

  let lock;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      lock = await open(
        lockPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
        PRIVATE_FILE_MODE
      );
      break;
    } catch (error) {
      if (!isFileSystemError(error, "EEXIST")) {
        throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_LOCK_FAILED", error);
      }
      await delay(5);
    }
  }
  if (lock === undefined) {
    throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_CONCURRENT_LOCKED");
  }

  try {
    const existingSource = await readPrivateTokenFile(tokenPath);
    const reused = existingSource !== undefined;
    const token = reused
      ? parseTokenFile(existingSource)
      : await fixedStep("DEV_HATCHET_TOKEN_ISSUE_FAILED", () => input.operations.issueToken());
    const tenantId = tenantIdFromToken(token);
    await fixedStep(
      "DEV_HATCHET_TOKEN_ATTESTATION_FAILED",
      () => input.operations.attestToken(token, tenantId)
    );
    if (!reused) await publishTokenFile(tokenPath, token);
    return Object.freeze({ reused, authority: "ATTESTED", workflowApi: "REACHABLE" });
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
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
    const output: Buffer[] = [];
    let outputBytes = 0;
    let overflow = false;
    let settled = false;
    const reject = (cause?: unknown) => {
      if (settled) return;
      settled = true;
      rejectPromise(new DevelopmentHatchetTokenError(input.failureCode, cause));
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
      reject();
    }, input.timeoutMs ?? 30_000);
    timeout.unref();
    const capture = (chunk: Buffer | string, retain: boolean) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      outputBytes += bytes.byteLength;
      if (outputBytes > MAX_CHILD_OUTPUT_BYTES) {
        overflow = true;
        child.kill("SIGTERM");
        return;
      }
      if (retain) output.push(bytes);
    };
    child.stdout.on("data", (chunk: Buffer | string) => capture(chunk, true));
    child.stderr.on("data", (chunk: Buffer | string) => capture(chunk, false));
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (settled) return;
      if (code === 0 && signal === null && !overflow) {
        settled = true;
        resolvePromise(Buffer.concat(output).toString("utf8").trim());
      } else {
        reject();
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
    .filter(Boolean)
    .map((entry) => join(entry, "docker"));
  const candidates = [
    ...(configured === undefined || configured.length === 0 ? [] : [resolve(configured)]),
    ...pathCandidates,
    "/Applications/Docker.app/Contents/Resources/bin/docker"
  ];
  for (const candidate of candidates) {
    if (await executableExists(candidate)) return candidate;
  }
  throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_DOCKER_UNAVAILABLE");
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

export function createDevelopmentHatchetTokenOperations(
  repositoryRoot: string,
  commandEnvironment: Readonly<Record<string, string>>
): DevelopmentHatchetTokenOperations {
  const cwd = resolve(repositoryRoot);
  let dockerExecutable: string | undefined;
  const docker = async (): Promise<string> => {
    if (dockerExecutable !== undefined) return dockerExecutable;
    dockerExecutable = await resolveDockerExecutable(commandEnvironment);
    const version = await runCommand({
      executable: dockerExecutable,
      arguments: ["info", "--format", "{{.ServerVersion}}"],
      cwd,
      baseEnvironment: commandEnvironment,
      failureCode: "DEV_HATCHET_TOKEN_DOCKER_ENGINE_UNAVAILABLE",
      timeoutMs: 15_000
    });
    if (!/^\d+\.\d+(?:\.\d+)?$/u.test(version)) {
      throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_DOCKER_ENGINE_UNAVAILABLE");
    }
    return dockerExecutable;
  };

  return Object.freeze({
    async issueToken() {
      const executable = await docker();
      const running = await runCommand({
        executable,
        arguments: composeArguments("ps", "--status", "running", "--services"),
        cwd,
        baseEnvironment: commandEnvironment,
        environment: { VLLM_MODEL: "dev-auth-not-started" },
        failureCode: "DEV_HATCHET_TOKEN_SERVICE_UNAVAILABLE"
      });
      if (!running.split(/\r?\n/u).includes("hatchet-lite")) {
        throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_SERVICE_UNAVAILABLE");
      }
      return runCommand({
        executable,
        arguments: composeArguments("exec", "-T", "hatchet-lite", ...TOKEN_COMMAND),
        cwd,
        baseEnvironment: commandEnvironment,
        environment: { VLLM_MODEL: "dev-auth-not-started" },
        failureCode: "DEV_HATCHET_TOKEN_ISSUE_FAILED"
      });
    },
    async attestToken(token, tenantId) {
      const client = new HatchetClient({
        token,
        host_port: LOCAL_GRPC_HOST_PORT,
        api_url: LOCAL_API_URL,
        tenant_id: tenantId,
        tls_config: { tls_strategy: "none" }
      });
      const [tenant, workflows] = await Promise.all([
        client.tenant.get(),
        client.workflows.list()
      ]);
      if (tenant.metadata.id !== tenantId || !Array.isArray(workflows.rows)) {
        throw new DevelopmentHatchetTokenError("DEV_HATCHET_TOKEN_ATTESTATION_FAILED");
      }
    }
  });
}
