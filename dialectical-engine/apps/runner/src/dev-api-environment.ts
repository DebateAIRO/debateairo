import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DEVELOPMENT_DATABASE_PRINCIPALS } from "./dev-database-principals.js";
import {
  DEVELOPMENT_CLI_CALL_TIMEOUT_MS,
  parseDevelopmentProviderPanelTargets,
  type DevelopmentProviderPanel,
  REMOVED_DEVELOPMENT_SCAFFOLD_TARGETS_JSON
} from "./dev-provider-panel.js";
import { resolveDevCustodyRoot } from "../../../deploy/dev-auth/custody-root.mjs";

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const MAX_CREDENTIAL_FILE_BYTES = 64 * 1024;
const LOCAL_DATABASE_HOST = "127.0.0.1";
const LOCAL_DATABASE_PORT = "55432";
const LOCAL_DATABASE_NAME = "/debateai";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const DEVELOPMENT_API_ENVIRONMENT_KEYS = Object.freeze([
  "KEK_PATH",
  "BLIND_INDEX_KEY_PATH",
  "AUDIT_KEY_STORE_PATH",
  "AUDIT_SOURCE_IP_SALT_PATH",
  "USER_DEK_STORE_PATH",
  "CONTENT_ENCRYPTION_ENABLED",
  "CONTENT_PROVISION_DATABASE_URL",
  "AUTHORIZATION_DATABASE_URL",
  "PUBLICATION_ENABLED",
  "CORPUS_KEK_PATH",
  "PUBLICATION_KEY_STORE_PATH",
  "PUBLICATION_CLEANUP_DATABASE_URL",
  "ERASURE_DATABASE_URL",
  "ACCOUNT_ERASURE_GRACE_MS",
  "MAIL_SENDMAIL_PATH",
  "MAIL_FROM",
  "PUBLIC_APP_URL",
  "DATABASE_URL",
  "API_HOST",
  "API_PORT",
  "STRANGER_SAMPLE_RATE",
  "REGISTER_VERSION",
  "BATTERY_VERSION",
  "SETTLEMENT_WATCH_HANDLE",
  "PROVIDER_DISCOVERY_TARGETS_JSON",
  "PROVIDER_PROBE_TIMEOUT_MS",
  "NODE_ENV",
  "EVALUATOR_DEV_MENU_ENABLED",
  "EVALUATOR_DEV_MENU_DATABASE_URL",
  "HATCHET_CLIENT_TOKEN",
  "HATCHET_HOST_PORT",
  "HATCHET_API_URL",
  "HATCHET_TENANT_ID",
  "HATCHET_WORKFLOW_NAME",
  "HATCHET_TLS_STRATEGY",
  "DEBATEAI_DEV_MAIL_CAPTURE_DIR"
] as const);

export type DevelopmentApiEnvironmentReceipt = Readonly<{
  keyCount: number;
  reused: boolean;
}>;

type AssembleDevelopmentApiEnvironmentInput = Readonly<{
  repositoryRoot: string;
  providerPanel: DevelopmentProviderPanel;
}>;

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    throw new TypeError("DEV_API_ENVIRONMENT_OWNER_UNVERIFIED");
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
    throw new TypeError("DEV_API_ENVIRONMENT_CUSTODY_ROOT_INVALID");
  }
}

async function readPrivateFile(path: string): Promise<string | undefined> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) return undefined;
    throw new TypeError("DEV_API_ENVIRONMENT_CREDENTIAL_CUSTODY_INVALID");
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || metadata.uid !== currentUid()
      || metadata.nlink !== 1
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
      || metadata.size < 1
      || metadata.size > MAX_CREDENTIAL_FILE_BYTES) {
      throw new TypeError("DEV_API_ENVIRONMENT_CREDENTIAL_CUSTODY_INVALID");
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

async function assertSecretFile(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new TypeError("DEV_API_ENVIRONMENT_SECRET_CUSTODY_INVALID");
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || metadata.uid !== currentUid()
      || metadata.nlink !== 1
      || metadata.size !== 32
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE) {
      throw new TypeError("DEV_API_ENVIRONMENT_SECRET_CUSTODY_INVALID");
    }
  } finally {
    await handle.close();
  }
}

function parseExactEnvironment(source: string, expectedKeys: readonly string[]): Map<string, string> {
  if (!source.endsWith("\n") || source.includes("\r") || source.includes("\0")) {
    throw new TypeError("DEV_API_ENVIRONMENT_CREDENTIAL_FILE_INVALID");
  }
  const rows = source.slice(0, -1).split("\n");
  if (rows.length !== expectedKeys.length) {
    throw new TypeError("DEV_API_ENVIRONMENT_CREDENTIAL_FILE_INVALID");
  }
  const parsed = new Map<string, string>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const separator = row.indexOf("=");
    const key = row.slice(0, separator);
    const value = row.slice(separator + 1);
    if (separator < 1 || key !== expectedKeys[index] || value.length === 0
      || /[\n\r\0]/u.test(value) || parsed.has(key)) {
      throw new TypeError("DEV_API_ENVIRONMENT_CREDENTIAL_FILE_INVALID");
    }
    parsed.set(key, value);
  }
  return parsed;
}

function readDatabaseCredentials(source: string): Map<string, string> {
  const expectedKeys = DEVELOPMENT_DATABASE_PRINCIPALS.map(({ environmentKey }) => environmentKey);
  const parsed = parseExactEnvironment(source, expectedKeys);
  const identities = new Set<string>();
  const passwords = new Set<string>();
  for (const principal of DEVELOPMENT_DATABASE_PRINCIPALS) {
    const raw = parsed.get(principal.environmentKey)!;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new TypeError("DEV_API_ENVIRONMENT_DATABASE_CREDENTIAL_INVALID");
    }
    if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:")
      || url.hostname !== LOCAL_DATABASE_HOST
      || url.port !== LOCAL_DATABASE_PORT
      || url.pathname !== LOCAL_DATABASE_NAME
      || url.search !== ""
      || url.hash !== ""
      || url.username !== principal.roleName
      || url.password.length < 32
      || identities.has(url.username)
      || passwords.has(url.password)) {
      throw new TypeError("DEV_API_ENVIRONMENT_DATABASE_CREDENTIAL_INVALID");
    }
    identities.add(url.username);
    passwords.add(url.password);
  }
  return parsed;
}

function tenantIdFromToken(token: string): string {
  if (token.length > 8_192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) {
    throw new TypeError("DEV_API_ENVIRONMENT_HATCHET_TOKEN_INVALID");
  }
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as {
      sub?: unknown;
      server_url?: unknown;
      grpc_broadcast_address?: unknown;
    };
    if (typeof payload.sub !== "string"
      || !UUID_PATTERN.test(payload.sub)
      || payload.server_url !== "http://localhost:8888"
      || payload.grpc_broadcast_address !== "localhost:7077") {
      throw new TypeError("DEV_API_ENVIRONMENT_HATCHET_TOKEN_INVALID");
    }
    return payload.sub;
  } catch (error) {
    if (error instanceof TypeError && error.message === "DEV_API_ENVIRONMENT_HATCHET_TOKEN_INVALID") {
      throw error;
    }
    throw new TypeError("DEV_API_ENVIRONMENT_HATCHET_TOKEN_INVALID");
  }
}

function environmentSource(values: ReadonlyMap<string, string>): string {
  return DEVELOPMENT_API_ENVIRONMENT_KEYS.map((key) => {
    const value = values.get(key);
    if (value === undefined || value.length === 0 || /[\n\r\0]/u.test(value)) {
      throw new TypeError("DEV_API_ENVIRONMENT_DEFINITION_INVALID");
    }
    return `${key}=${value}`;
  }).join("\n") + "\n";
}

async function publishExactFile(
  path: string,
  source: string,
  acceptedPreviousSources: readonly string[] = [],
  acceptPreviousSource?: (existing: string) => boolean
): Promise<boolean> {
  const lockPath = `${path}.lock`;
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
      if (!isFileSystemError(error, "EEXIST")) throw error;
      await delay(5);
    }
  }
  if (lock === undefined) throw new TypeError("DEV_API_ENVIRONMENT_CONCURRENT_LOCKED");
  try {
    const existing = await readPrivateFile(path);
    if (existing !== undefined) {
      if (existing === source) return true;
      if (!acceptedPreviousSources.includes(existing)
        && acceptPreviousSource?.(existing) !== true) {
        throw new TypeError("DEV_API_ENVIRONMENT_DRIFT");
      }
    }
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
    const published = await readPrivateFile(path);
    if (published !== source) throw new TypeError("DEV_API_ENVIRONMENT_PUBLISH_FAILED");
    return false;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

function isExactProviderRuntimeRefresh(existing: string, expected: string): boolean {
  try {
    const existingValues = parseExactEnvironment(existing, DEVELOPMENT_API_ENVIRONMENT_KEYS);
    const expectedValues = parseExactEnvironment(expected, DEVELOPMENT_API_ENVIRONMENT_KEYS);
    for (const key of DEVELOPMENT_API_ENVIRONMENT_KEYS) {
      if (key === "PROVIDER_DISCOVERY_TARGETS_JSON") continue;
      if (existingValues.get(key) !== expectedValues.get(key)) return false;
    }
    parseDevelopmentProviderPanelTargets(existingValues.get("PROVIDER_DISCOVERY_TARGETS_JSON")!);
    return true;
  } catch {
    return false;
  }
}

function isExactProviderRuntimeRefreshWithLegacyProbeTimeout(
  existing: string,
  expected: string
): boolean {
  const upgraded = existing.replace(
    "PROVIDER_PROBE_TIMEOUT_MS=5000\n",
    `PROVIDER_PROBE_TIMEOUT_MS=${DEVELOPMENT_CLI_CALL_TIMEOUT_MS}\n`
  );
  return upgraded !== existing && isExactProviderRuntimeRefresh(upgraded, expected);
}

export async function assembleDevelopmentApiEnvironment(
  input: AssembleDevelopmentApiEnvironmentInput
): Promise<DevelopmentApiEnvironmentReceipt> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const custodyRoot = resolveDevCustodyRoot(repositoryRoot);
  const localRoot = dirname(custodyRoot);
  await assertPrivateDirectory(localRoot);
  await assertPrivateDirectory(custodyRoot);
  await Promise.all([
    assertPrivateDirectory(join(custodyRoot, "secrets")),
    assertPrivateDirectory(join(custodyRoot, "audit-keys")),
    assertPrivateDirectory(join(custodyRoot, "user-deks")),
    assertPrivateDirectory(join(custodyRoot, "publication-keys")),
    assertPrivateDirectory(join(custodyRoot, "mail")),
    assertSecretFile(join(custodyRoot, "secrets", "kek.bin")),
    assertSecretFile(join(custodyRoot, "secrets", "corpus-kek.bin")),
    assertSecretFile(join(custodyRoot, "secrets", "blind-index-key.bin")),
    assertSecretFile(join(custodyRoot, "secrets", "audit-source-ip-salt.bin"))
  ]);
  const databaseSource = await readPrivateFile(join(custodyRoot, "database-principals.env"));
  const hatchetSource = await readPrivateFile(join(custodyRoot, "hatchet.env"));
  if (databaseSource === undefined || hatchetSource === undefined) {
    throw new TypeError("DEV_API_ENVIRONMENT_CREDENTIAL_REQUIRED");
  }
  const databases = readDatabaseCredentials(databaseSource);
  const hatchet = parseExactEnvironment(hatchetSource, ["HATCHET_CLIENT_TOKEN"]);
  const token = hatchet.get("HATCHET_CLIENT_TOKEN")!;
  const tenantId = tenantIdFromToken(token);
  const providerPanel = input.providerPanel;
  const values = new Map<string, string>([
    ["KEK_PATH", join(custodyRoot, "secrets", "kek.bin")],
    ["BLIND_INDEX_KEY_PATH", join(custodyRoot, "secrets", "blind-index-key.bin")],
    ["AUDIT_KEY_STORE_PATH", join(custodyRoot, "audit-keys")],
    ["AUDIT_SOURCE_IP_SALT_PATH", join(custodyRoot, "secrets", "audit-source-ip-salt.bin")],
    ["USER_DEK_STORE_PATH", join(custodyRoot, "user-deks")],
    ["CONTENT_ENCRYPTION_ENABLED", "true"],
    ["CONTENT_PROVISION_DATABASE_URL", databases.get("CONTENT_PROVISION_DATABASE_URL")!],
    ["AUTHORIZATION_DATABASE_URL", databases.get("AUTHORIZATION_DATABASE_URL")!],
    ["PUBLICATION_ENABLED", "true"],
    ["CORPUS_KEK_PATH", join(custodyRoot, "secrets", "corpus-kek.bin")],
    ["PUBLICATION_KEY_STORE_PATH", join(custodyRoot, "publication-keys")],
    ["PUBLICATION_CLEANUP_DATABASE_URL", databases.get("PUBLICATION_CLEANUP_DATABASE_URL")!],
    ["ERASURE_DATABASE_URL", databases.get("ERASURE_DATABASE_URL")!],
    ["ACCOUNT_ERASURE_GRACE_MS", "604800000"],
    ["MAIL_SENDMAIL_PATH", join(repositoryRoot, "deploy", "dev-auth", "sendmail-capture.mjs")],
    ["MAIL_FROM", "noreply@localhost.test"],
    ["PUBLIC_APP_URL", "https://localhost:3000"],
    ["DATABASE_URL", databases.get("DATABASE_URL")!],
    ["API_HOST", "127.0.0.1"],
    ["API_PORT", "8790"],
    ["STRANGER_SAMPLE_RATE", "0"],
    ["REGISTER_VERSION", "4"],
    ["BATTERY_VERSION", "dev-auth-v1"],
    ["SETTLEMENT_WATCH_HANDLE", "dev-auth:settlement-watch"],
    ["PROVIDER_DISCOVERY_TARGETS_JSON", providerPanel.targetsJson],
    ["PROVIDER_PROBE_TIMEOUT_MS", String(DEVELOPMENT_CLI_CALL_TIMEOUT_MS)],
    ["NODE_ENV", "development"],
    ["EVALUATOR_DEV_MENU_ENABLED", "false"],
    ["EVALUATOR_DEV_MENU_DATABASE_URL", databases.get("EVALUATOR_DEV_MENU_DATABASE_URL")!],
    ["HATCHET_CLIENT_TOKEN", token],
    ["HATCHET_HOST_PORT", "127.0.0.1:7077"],
    ["HATCHET_API_URL", "http://127.0.0.1:8888"],
    ["HATCHET_TENANT_ID", tenantId],
    ["HATCHET_WORKFLOW_NAME", "debateai-dev"],
    ["HATCHET_TLS_STRATEGY", "none"],
    ["DEBATEAI_DEV_MAIL_CAPTURE_DIR", join(custodyRoot, "mail")]
  ]);
  const source = environmentSource(values);
  const publicationDisabledSource = source
    .replace("PUBLICATION_ENABLED=true\n", "PUBLICATION_ENABLED=false\n")
    .split("\n")
    .filter((row) => !row.startsWith("CORPUS_KEK_PATH=")
      && !row.startsWith("PUBLICATION_KEY_STORE_PATH=")
      && !row.startsWith("PUBLICATION_CLEANUP_DATABASE_URL="))
    .join("\n");
  const registerV3Source = source.replace("REGISTER_VERSION=4\n", "REGISTER_VERSION=3\n");
  const registerV2Source = source.replace("REGISTER_VERSION=4\n", "REGISTER_VERSION=2\n");
  const registerV1Source = source.replace("REGISTER_VERSION=4\n", "REGISTER_VERSION=1\n");
  const preDiscoverySource = registerV1Source
    .split("\n")
    .filter((row) => !row.startsWith("PROVIDER_DISCOVERY_TARGETS_JSON=")
      && !row.startsWith("PROVIDER_PROBE_TIMEOUT_MS="))
    .join("\n");
  const preEvaluatorPrincipalSource = source
    .split("\n")
    .filter((row) => !row.startsWith("EVALUATOR_DEV_MENU_DATABASE_URL="))
    .join("\n");
  const removedScaffoldSource = registerV3Source.replace(
    `PROVIDER_DISCOVERY_TARGETS_JSON=${providerPanel.targetsJson}\n`,
    `PROVIDER_DISCOVERY_TARGETS_JSON=${REMOVED_DEVELOPMENT_SCAFFOLD_TARGETS_JSON}\n`
  );
  const reused = await publishExactFile(
    join(custodyRoot, "api.env"),
    source,
    [
      publicationDisabledSource,
      registerV3Source,
      registerV2Source,
      registerV1Source,
      preDiscoverySource,
      preEvaluatorPrincipalSource,
      removedScaffoldSource
    ],
    (existing) => isExactProviderRuntimeRefresh(existing, source)
      || isExactProviderRuntimeRefreshWithLegacyProbeTimeout(existing, source)
  );
  return Object.freeze({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused });
}
