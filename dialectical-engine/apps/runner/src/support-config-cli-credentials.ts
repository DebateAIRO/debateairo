import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg, { type Pool, type PoolClient } from "pg";
import { DEVELOPMENT_DATABASE_PRINCIPALS } from "./dev-database-principals.js";
import { acceptsProductionDatabaseUrlQuery } from "./production-database-url.js";

const { Pool: PgPool } = pg;

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const MAX_DEVELOPMENT_CREDENTIAL_FILE_BYTES = 64 * 1024;
const MAX_PRODUCTION_CREDENTIAL_FILE_BYTES = 4 * 1024;
const SUPPORT_CONFIG_OPERATOR_DATABASE_URL = "SUPPORT_CONFIG_OPERATOR_DATABASE_URL";
const DEVELOPMENT_SUPPORT_CONFIG_OPERATOR_ROLE = "debateai_dev_support_config_operator";
const PRODUCTION_SUPPORT_CONFIG_OPERATOR_ROLE = "debateai_prod_support_config_operator";
const LOCAL_DATABASE_HOST = "127.0.0.1";
const LOCAL_DATABASE_NAME = "/debateai";
const DEVELOPMENT_INITIALIZATION_DEADLINE_MILLISECONDS = 5_000;

export type DevelopmentSupportConfigCliCredentials = Readonly<{
  databaseUrl: string;
}>;

export type ProductionSupportConfigCliCredentials = Readonly<{
  databaseUrl: string;
  validUntil: string;
}>;

export type ValidatedProductionSupportConfigCredentialFile = Readonly<{
  credentials: ProductionSupportConfigCliCredentials;
  resolvedPath: string;
  device: number;
  inode: number;
}>;

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
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
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
  }
}

async function readBoundedPrivateFile(
  path: string,
  maximumBytes: number
): Promise<Readonly<{ source: string; device: number; inode: number }>> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || metadata.uid !== currentUid()
      || metadata.nlink !== 1
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
      || metadata.size < 1
      || metadata.size > maximumBytes) {
      throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
    }
    const bounded = Buffer.alloc(maximumBytes + 1);
    let offset = 0;
    while (offset < bounded.length) {
      const { bytesRead } = await handle.read(
        bounded,
        offset,
        bounded.length - offset,
        null
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > maximumBytes) {
      throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
    }
    return Object.freeze({
      source: bounded.subarray(0, offset).toString("utf8"),
      device: metadata.dev,
      inode: metadata.ino
    });
  } finally {
    await handle.close();
  }
}

function parseExactDevelopmentCredentials(source: string): ReadonlyMap<string, string> {
  if (!source.endsWith("\n") || source.includes("\r") || source.includes("\0")) {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");
  }
  const rows = source.slice(0, -1).split("\n");
  if (rows.length !== DEVELOPMENT_DATABASE_PRINCIPALS.length) {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");
  }
  const parsed = new Map<string, string>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const separator = row.indexOf("=");
    const key = row.slice(0, separator);
    const value = row.slice(separator + 1);
    if (separator < 1
      || key !== DEVELOPMENT_DATABASE_PRINCIPALS[index]?.environmentKey
      || value.length === 0
      || parsed.has(key)) {
      throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");
    }
    parsed.set(key, value);
  }
  return parsed;
}

function assertDevelopmentSupportConfigDatabaseUrl(raw: string, expectedPort: string): void {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(raw);
  } catch {
    throw new TypeError("SUPPORT_CONFIG_DATABASE_URL_INVALID");
  }
  if ((databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:")
    || databaseUrl.hostname !== LOCAL_DATABASE_HOST
    || databaseUrl.port !== expectedPort
    || databaseUrl.pathname !== LOCAL_DATABASE_NAME
    || databaseUrl.search !== ""
    || databaseUrl.hash !== ""
    || databaseUrl.username !== DEVELOPMENT_SUPPORT_CONFIG_OPERATOR_ROLE
    || databaseUrl.password.length === 0) {
    throw new TypeError("SUPPORT_CONFIG_DATABASE_URL_INVALID");
  }
}

function parseExactProductionCredentials(
  source: string,
  allowExpired: boolean
): ProductionSupportConfigCliCredentials {
  if (source.includes("\0") || source.includes("\r") || source.includes("\n")) {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");
  }
  if (typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(["databaseUrl", "validUntil"])) {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.databaseUrl !== "string" || typeof record.validUntil !== "string") {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");
  }
  const validUntil = new Date(record.validUntil);
  const remainingMilliseconds = validUntil.getTime() - Date.now();
  if (!Number.isFinite(validUntil.getTime())
    || validUntil.toISOString() !== record.validUntil
    || (!allowExpired && remainingMilliseconds <= 1_000)
    || remainingMilliseconds > 15 * 60 * 1_000) {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_EXPIRY_INVALID");
  }
  let parsedUrl: URL;
  let password: string;
  try {
    parsedUrl = new URL(record.databaseUrl);
    password = decodeURIComponent(parsedUrl.password);
  } catch {
    throw new TypeError("SUPPORT_CONFIG_DATABASE_URL_INVALID");
  }
  const passwordBytes = Buffer.byteLength(password, "utf8");
  if ((parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:")
    || parsedUrl.hostname.length === 0
    || parsedUrl.pathname !== "/debateai"
    // DL7-F6: the two shapes the VPS pg_hba admits (socket, verified TLS) need a query.
    || !acceptsProductionDatabaseUrlQuery(parsedUrl)
    || parsedUrl.hash !== ""
    || parsedUrl.username !== PRODUCTION_SUPPORT_CONFIG_OPERATOR_ROLE
    || passwordBytes < 32
    || passwordBytes > 1_024
    || /[\0\r\n]/u.test(password)) {
    throw new TypeError("SUPPORT_CONFIG_DATABASE_URL_INVALID");
  }
  const credentials = Object.freeze({
    databaseUrl: record.databaseUrl,
    validUntil: record.validUntil
  });
  if (JSON.stringify(credentials) !== source) {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");
  }
  return credentials;
}

export async function loadDevelopmentSupportConfigCliCredentials(
  credentialFilePath: string,
  expectedPort = "55432"
): Promise<DevelopmentSupportConfigCliCredentials> {
  const resolvedPath = resolve(credentialFilePath);
  await assertPrivateDirectory(dirname(resolvedPath));
  const credentials = parseExactDevelopmentCredentials((await readBoundedPrivateFile(
    resolvedPath,
    MAX_DEVELOPMENT_CREDENTIAL_FILE_BYTES
  )).source);
  const databaseUrl = credentials.get(SUPPORT_CONFIG_OPERATOR_DATABASE_URL);
  if (databaseUrl === undefined) {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");
  }
  assertDevelopmentSupportConfigDatabaseUrl(databaseUrl, expectedPort);
  return Object.freeze({ databaseUrl });
}

export async function createDevelopmentSupportConfigInitializationPool(
  credentialFilePath: string,
  expectedPort = "55432"
): Promise<Pool> {
  const credentials = await loadDevelopmentSupportConfigCliCredentials(
    credentialFilePath,
    expectedPort
  );
  const pool = new PgPool({
    connectionString: credentials.databaseUrl,
    max: 1,
    connectionTimeoutMillis: DEVELOPMENT_INITIALIZATION_DEADLINE_MILLISECONDS,
    statement_timeout: DEVELOPMENT_INITIALIZATION_DEADLINE_MILLISECONDS,
    query_timeout: DEVELOPMENT_INITIALIZATION_DEADLINE_MILLISECONDS
  });
  pool.on("error", () => undefined);
  return pool;
}

async function validateProductionSupportConfigCredentialFile(
  credentialFilePath: string,
  allowExpired: boolean
): Promise<ValidatedProductionSupportConfigCredentialFile> {
  const resolvedPath = resolve(credentialFilePath);
  await assertPrivateDirectory(dirname(resolvedPath));
  const file = await readBoundedPrivateFile(
    resolvedPath,
    MAX_PRODUCTION_CREDENTIAL_FILE_BYTES
  );
  return Object.freeze({
    credentials: parseExactProductionCredentials(file.source, allowExpired),
    resolvedPath,
    device: file.device,
    inode: file.inode
  });
}

export async function loadProductionSupportConfigCliCredentials(
  credentialFilePath: string
): Promise<ProductionSupportConfigCliCredentials> {
  return (await validateProductionSupportConfigCredentialFile(
    credentialFilePath,
    false
  )).credentials;
}

export async function validateProductionSupportConfigCredentialFileForCleanup(
  credentialFilePath: string
): Promise<ValidatedProductionSupportConfigCredentialFile> {
  return validateProductionSupportConfigCredentialFile(credentialFilePath, true);
}

export async function withProductionSupportConfigCliConnection<T>(
  credentialFilePath: string,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const credentials = await loadProductionSupportConfigCliCredentials(credentialFilePath);
  const remainingMilliseconds = new Date(credentials.validUntil).getTime() - Date.now();
  if (remainingMilliseconds <= 1_000) {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_EXPIRY_INVALID");
  }
  const phaseDeadlineMilliseconds = Math.min(5_000, Math.floor(remainingMilliseconds - 1));
  const pool = new PgPool({
    connectionString: credentials.databaseUrl,
    max: 1,
    connectionTimeoutMillis: phaseDeadlineMilliseconds,
    statement_timeout: phaseDeadlineMilliseconds,
    query_timeout: phaseDeadlineMilliseconds
  });
  pool.on("error", () => undefined);
  try {
    const client = await pool.connect();
    try {
      return await operation(client);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
