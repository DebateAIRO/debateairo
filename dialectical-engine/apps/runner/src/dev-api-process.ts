import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { get } from "node:http";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseApiEnvironment } from "@debateai/register";
import { DEVELOPMENT_API_ENVIRONMENT_KEYS } from "./dev-api-environment.js";
import {
  DEVELOPMENT_CLI_CALL_TIMEOUT_MS,
  parseDevelopmentProviderPanelTargets
} from "./dev-provider-panel.js";

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const MAX_ENVIRONMENT_BYTES = 64 * 1024;
const MAX_PROBE_BODY_BYTES = 1_024;
const LOCAL_API_HOST = "127.0.0.1";
const LOCAL_API_PORT = 8_790;
const LOCAL_API_SESSION_PATH = "/v1/session";
const LOCAL_DATABASE_PORT = "55432";
const LOCAL_DATABASE_NAME = "/debateai";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type DevelopmentApiProbe = Readonly<{
  statusCode: number;
  contentType: string;
  body: string;
}>;

export type DevelopmentApiChildExit = Readonly<{
  code: number | null;
  signal: NodeJS.Signals | null;
}>;

export type DevelopmentApiChild = Readonly<{
  exited: Promise<DevelopmentApiChildExit>;
  terminate(): Promise<void>;
}>;

export type DevelopmentApiProcessOperations = Readonly<{
  probe(): Promise<DevelopmentApiProbe | null>;
  startApi(environment: Readonly<Record<string, string>>): DevelopmentApiChild;
  delay(milliseconds: number): Promise<void>;
}>;

export type DevelopmentApiProcess = Readonly<{
  receipt: Readonly<{ host: "127.0.0.1"; port: 8790; auth: "DENY_DEFAULT" }>;
  exited: Promise<DevelopmentApiChildExit>;
  stop(): Promise<void>;
}>;

export class DevelopmentApiProcessError extends Error {
  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "DevelopmentApiProcessError";
  }
}

export async function loadDevelopmentApiProcessEnvironment(
  repositoryRoot: string
): Promise<Readonly<Record<string, string>>> {
  const root = resolve(repositoryRoot);
  const custodyRoot = join(root, ".local", "dev-auth");
  await assertPrivateDirectory(dirname(custodyRoot));
  await assertPrivateDirectory(custodyRoot);
  const values = parseExactEnvironment(
    await readPrivateEnvironment(join(custodyRoot, "api.env"))
  );
  validateExactEnvironment(values, root);
  return values;
}

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    throw new DevelopmentApiProcessError("DEV_API_PROCESS_OWNER_UNVERIFIED");
  }
  return process.getuid();
}

async function assertPrivateDirectory(path: string): Promise<void> {
  const metadata = await lstat(path).catch(() => null);
  if (metadata === null
    || metadata.isSymbolicLink()
    || !metadata.isDirectory()
    || metadata.uid !== currentUid()
    || (metadata.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
    throw new DevelopmentApiProcessError("DEV_API_PROCESS_CUSTODY_INVALID");
  }
}

async function readPrivateEnvironment(path: string): Promise<string> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    throw new DevelopmentApiProcessError("DEV_API_PROCESS_CUSTODY_INVALID", error);
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || metadata.uid !== currentUid()
      || metadata.nlink !== 1
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
      || metadata.size < 1
      || metadata.size > MAX_ENVIRONMENT_BYTES) {
      throw new DevelopmentApiProcessError("DEV_API_PROCESS_CUSTODY_INVALID");
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

function parseExactEnvironment(source: string): Readonly<Record<string, string>> {
  if (!source.endsWith("\n") || source.includes("\r") || source.includes("\0")) {
    throw new DevelopmentApiProcessError("DEV_API_PROCESS_ENVIRONMENT_INVALID");
  }
  const lines = source.slice(0, -1).split("\n");
  if (lines.length !== DEVELOPMENT_API_ENVIRONMENT_KEYS.length) {
    throw new DevelopmentApiProcessError("DEV_API_PROCESS_ENVIRONMENT_INVALID");
  }
  const values: Record<string, string> = {};
  for (const [index, key] of DEVELOPMENT_API_ENVIRONMENT_KEYS.entries()) {
    const line = lines[index]!;
    if (!line.startsWith(`${key}=`)) {
      throw new DevelopmentApiProcessError("DEV_API_PROCESS_ENVIRONMENT_INVALID");
    }
    const value = line.slice(key.length + 1);
    if (value.length === 0) {
      throw new DevelopmentApiProcessError("DEV_API_PROCESS_ENVIRONMENT_INVALID");
    }
    values[key] = value;
  }
  return Object.freeze(values);
}

function assertLocalDatabaseUrl(value: string, expectedUser: string): void {
  const url = new URL(value);
  if (url.protocol !== "postgresql:"
    || url.hostname !== LOCAL_API_HOST
    || url.port !== LOCAL_DATABASE_PORT
    || url.pathname !== LOCAL_DATABASE_NAME
    || url.username !== expectedUser
    || url.password.length === 0
    || url.search.length > 0
    || url.hash.length > 0) {
    throw new DevelopmentApiProcessError("DEV_API_PROCESS_ENVIRONMENT_INVALID");
  }
}

function validateExactEnvironment(
  values: Readonly<Record<string, string>>,
  repositoryRoot: string
): void {
  try {
    parseApiEnvironment(values);
    const providerPanel = parseDevelopmentProviderPanelTargets(
      values.PROVIDER_DISCOVERY_TARGETS_JSON!
    );
    const custodyRoot = join(repositoryRoot, ".local", "dev-auth");
    const exact = new Map<string, string>([
      ["KEK_PATH", join(custodyRoot, "secrets", "kek.bin")],
      ["BLIND_INDEX_KEY_PATH", join(custodyRoot, "secrets", "blind-index-key.bin")],
      ["AUDIT_KEY_STORE_PATH", join(custodyRoot, "audit-keys")],
      ["AUDIT_SOURCE_IP_SALT_PATH", join(custodyRoot, "secrets", "audit-source-ip-salt.bin")],
      ["USER_DEK_STORE_PATH", join(custodyRoot, "user-deks")],
      ["CORPUS_KEK_PATH", join(custodyRoot, "secrets", "corpus-kek.bin")],
      ["PUBLICATION_KEY_STORE_PATH", join(custodyRoot, "publication-keys")],
      ["MAIL_SENDMAIL_PATH", join(repositoryRoot, "deploy", "dev-auth", "sendmail-capture.mjs")],
      ["DEBATEAI_DEV_MAIL_CAPTURE_DIR", join(custodyRoot, "mail")],
      ["CONTENT_ENCRYPTION_ENABLED", "true"],
      ["PUBLICATION_ENABLED", "true"],
      ["ACCOUNT_ERASURE_GRACE_MS", "604800000"],
      ["MAIL_FROM", "noreply@localhost.test"],
      ["PUBLIC_APP_URL", "https://localhost:3000"],
      ["API_HOST", LOCAL_API_HOST],
      ["API_PORT", String(LOCAL_API_PORT)],
      ["STRANGER_SAMPLE_RATE", "0"],
      ["REGISTER_VERSION", "4"],
      ["BATTERY_VERSION", "dev-auth-v1"],
      ["SETTLEMENT_WATCH_HANDLE", "dev-auth:settlement-watch"],
      ["PROVIDER_DISCOVERY_TARGETS_JSON", providerPanel.targetsJson],
      ["PROVIDER_PROBE_TIMEOUT_MS", String(DEVELOPMENT_CLI_CALL_TIMEOUT_MS)],
      ["NODE_ENV", "development"],
      ["EVALUATOR_DEV_MENU_ENABLED", "false"],
      ["HATCHET_HOST_PORT", "127.0.0.1:7077"],
      ["HATCHET_API_URL", "http://127.0.0.1:8888"],
      ["HATCHET_WORKFLOW_NAME", "debateai-dev"],
      ["HATCHET_TLS_STRATEGY", "none"]
    ]);
    for (const [key, expected] of exact) {
      if (values[key] !== expected) {
        throw new DevelopmentApiProcessError("DEV_API_PROCESS_ENVIRONMENT_INVALID");
      }
    }
    if (!UUID_PATTERN.test(values.HATCHET_TENANT_ID!)) {
      throw new DevelopmentApiProcessError("DEV_API_PROCESS_ENVIRONMENT_INVALID");
    }
    assertLocalDatabaseUrl(values.DATABASE_URL!, "debateai_dev_runtime");
    assertLocalDatabaseUrl(
      values.CONTENT_PROVISION_DATABASE_URL!,
      "debateai_dev_content_provision"
    );
    assertLocalDatabaseUrl(
      values.AUTHORIZATION_DATABASE_URL!,
      "debateai_dev_authorization"
    );
    assertLocalDatabaseUrl(
      values.PUBLICATION_CLEANUP_DATABASE_URL!,
      "debateai_dev_publication_cleanup"
    );
    assertLocalDatabaseUrl(values.ERASURE_DATABASE_URL!, "debateai_dev_erasure");
    assertLocalDatabaseUrl(
      values.EVALUATOR_DEV_MENU_DATABASE_URL!,
      "debateai_dev_evaluator_api"
    );
  } catch (error) {
    if (error instanceof DevelopmentApiProcessError) throw error;
    throw new DevelopmentApiProcessError("DEV_API_PROCESS_ENVIRONMENT_INVALID", error);
  }
}

function isExactReadiness(response: DevelopmentApiProbe): boolean {
  return response.statusCode === 401
    && response.contentType.toLowerCase().startsWith("application/json")
    && response.body === '{"error":"SESSION_REQUIRED"}';
}

async function terminateAfterFailure(child: DevelopmentApiChild): Promise<void> {
  try {
    await child.terminate();
  } catch (error) {
    throw new DevelopmentApiProcessError("DEV_API_PROCESS_CLEANUP_FAILED", error);
  }
}

export async function startDevelopmentApiProcess(input: Readonly<{
  repositoryRoot: string;
  commandEnvironment: Readonly<Record<string, string>>;
  operations: DevelopmentApiProcessOperations;
  maximumProbeAttempts?: number;
}>): Promise<DevelopmentApiProcess> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const values = await loadDevelopmentApiProcessEnvironment(repositoryRoot);
  const preexisting = await input.operations.probe();
  if (preexisting !== null) {
    throw new DevelopmentApiProcessError("DEV_API_PROCESS_PORT_OCCUPIED");
  }
  let child: DevelopmentApiChild;
  try {
    child = input.operations.startApi(Object.freeze({
      ...input.commandEnvironment,
      ...values
    }));
  } catch (error) {
    throw new DevelopmentApiProcessError("DEV_API_PROCESS_START_FAILED", error);
  }
  try {
    const maximumProbeAttempts = input.maximumProbeAttempts ?? 100;
    if (!Number.isInteger(maximumProbeAttempts)
      || maximumProbeAttempts < 1
      || maximumProbeAttempts > 300) {
      throw new DevelopmentApiProcessError("DEV_API_PROCESS_PROBE_BOUND_INVALID");
    }
    for (let attempt = 0; attempt < maximumProbeAttempts; attempt += 1) {
      const outcome = await Promise.race([
        child.exited.then((exit) => Object.freeze({ kind: "exit" as const, exit })),
        input.operations.probe().then((probe) => Object.freeze({ kind: "probe" as const, probe }))
      ]);
      if (outcome.kind === "exit") {
        throw new DevelopmentApiProcessError("DEV_API_PROCESS_EXITED");
      }
      if (outcome.probe !== null) {
        if (!isExactReadiness(outcome.probe)) {
          throw new DevelopmentApiProcessError("DEV_API_PROCESS_READINESS_INVALID");
        }
        let stopped = false;
        return Object.freeze({
          receipt: Object.freeze({ host: LOCAL_API_HOST, port: LOCAL_API_PORT, auth: "DENY_DEFAULT" }),
          exited: child.exited,
          async stop() {
            if (stopped) return;
            stopped = true;
            await child.terminate();
          }
        });
      }
      if (attempt + 1 < maximumProbeAttempts) await input.operations.delay(100);
    }
    throw new DevelopmentApiProcessError("DEV_API_PROCESS_READINESS_TIMEOUT");
  } catch (error) {
    await terminateAfterFailure(child);
    throw error;
  }
}

function probeLocalApi(): Promise<DevelopmentApiProbe | null> {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = get({
      host: LOCAL_API_HOST,
      port: LOCAL_API_PORT,
      path: LOCAL_API_SESSION_PATH,
      agent: false,
      timeout: 500
    }, (response) => {
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.byteLength;
        if (total > MAX_PROBE_BODY_BYTES) {
          request.destroy(new Error("DEV_API_PROCESS_PROBE_BODY_TOO_LARGE"));
          return;
        }
        chunks.push(bytes);
      });
      response.once("end", () => resolvePromise(Object.freeze({
        statusCode: response.statusCode ?? 0,
        contentType: String(response.headers["content-type"] ?? ""),
        body: Buffer.concat(chunks).toString("utf8")
      })));
    });
    request.once("timeout", () => request.destroy(new Error("DEV_API_PROCESS_PROBE_TIMEOUT")));
    request.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED") resolvePromise(null);
      else rejectPromise(new DevelopmentApiProcessError("DEV_API_PROCESS_PROBE_FAILED", error));
    });
  });
}

export function createDevelopmentApiProcessOperations(
  repositoryRoot: string
): DevelopmentApiProcessOperations {
  const cwd = resolve(repositoryRoot);
  return Object.freeze({
    probe: probeLocalApi,
    startApi(environment) {
      const child = spawn(
        process.execPath,
        [join(cwd, "node_modules", "tsx", "dist", "cli.mjs"), "apps/api/src/main.ts"],
        { cwd, env: { ...environment }, shell: false, stdio: ["ignore", "ignore", "inherit"] }
      );
      let exitSettled = false;
      const exited = new Promise<DevelopmentApiChildExit>((resolveExit, rejectExit) => {
        child.once("error", (error) => {
          exitSettled = true;
          rejectExit(error);
        });
        child.once("exit", (code, signal) => {
          exitSettled = true;
          resolveExit(Object.freeze({ code, signal }));
        });
      });
      return Object.freeze({
        exited,
        async terminate() {
          if (exitSettled || child.exitCode !== null || child.signalCode !== null) {
            await exited.catch(() => undefined);
            return;
          }
          child.kill("SIGTERM");
          const ended = await Promise.race([
            exited.then(() => true),
            delay(5_000).then(() => false)
          ]);
          if (!ended) {
            child.kill("SIGKILL");
            await exited.catch(() => undefined);
          }
        }
      });
    },
    delay: async (milliseconds) => delay(milliseconds)
  });
}
