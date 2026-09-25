import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DEVELOPMENT_DATABASE_PRINCIPALS } from "./dev-database-principals.js";
import { acceptsProductionDatabaseUrlQuery } from "./production-database-url.js";

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const MAX_DEVELOPMENT_BYTES = 64 * 1024;
const MAX_PRODUCTION_BYTES = 4 * 1024;
const CREDENTIAL_FORMAT = "debateai.production-database-principal-credentials.v1";
const CONFIGURATION_KEY = "SUPPORT_CONFIG_OPERATOR_DATABASE_URL";
const SUPPORT_KEY = "SUPPORT_DATABASE_URL";

export type DevelopmentSupportStatusCliCredentials = Readonly<{
  configurationDatabaseUrl: string;
  supportDatabaseUrl: string;
}>;

export type ProductionSupportStatusCliCredentials = Readonly<{
  supportDatabaseUrl: string;
}>;

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    throw new TypeError("SUPPORT_STATUS_CREDENTIAL_CUSTODY_INVALID");
  }
  return process.getuid();
}

async function readPrivateFile(path: string, maximumBytes: number): Promise<string> {
  const resolved = resolve(path);
  const directory = await lstat(dirname(resolved)).catch(() => null);
  if (directory === null || directory.isSymbolicLink() || !directory.isDirectory()
    || directory.uid !== currentUid() || (directory.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
    throw new TypeError("SUPPORT_STATUS_CREDENTIAL_CUSTODY_INVALID");
  }
  let handle;
  try {
    handle = await open(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new TypeError("SUPPORT_STATUS_CREDENTIAL_CUSTODY_INVALID");
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.uid !== currentUid() || metadata.nlink !== 1
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
      || metadata.size < 1 || metadata.size > maximumBytes) {
      throw new TypeError("SUPPORT_STATUS_CREDENTIAL_CUSTODY_INVALID");
    }
    const buffer = Buffer.alloc(maximumBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > maximumBytes) {
      throw new TypeError("SUPPORT_STATUS_CREDENTIAL_CUSTODY_INVALID");
    }
    return buffer.subarray(0, offset).toString("utf8");
  } finally {
    await handle.close();
  }
}

function parseDevelopment(source: string): ReadonlyMap<string, string> {
  if (!source.endsWith("\n") || source.includes("\r") || source.includes("\0")) {
    throw new TypeError("SUPPORT_STATUS_CREDENTIAL_FILE_INVALID");
  }
  const rows = source.slice(0, -1).split("\n");
  if (rows.length !== DEVELOPMENT_DATABASE_PRINCIPALS.length) {
    throw new TypeError("SUPPORT_STATUS_CREDENTIAL_FILE_INVALID");
  }
  const result = new Map<string, string>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const separator = row.indexOf("=");
    const key = row.slice(0, separator);
    const value = row.slice(separator + 1);
    if (separator < 1 || key !== DEVELOPMENT_DATABASE_PRINCIPALS[index]?.environmentKey
      || value.length === 0 || result.has(key)) {
      throw new TypeError("SUPPORT_STATUS_CREDENTIAL_FILE_INVALID");
    }
    result.set(key, value);
  }
  return result;
}

function assertUrl(raw: string, roleName: string, development: boolean): void {
  let url: URL;
  let password: string;
  try {
    url = new URL(raw);
    password = decodeURIComponent(url.password);
  } catch {
    throw new TypeError("SUPPORT_STATUS_DATABASE_URL_INVALID");
  }
  const passwordBytes = Buffer.byteLength(password, "utf8");
  if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    || url.pathname !== "/debateai" || url.hash !== ""
    || url.username !== roleName || /[\0\r\n]/u.test(password)
    || (development
      ? url.search !== "" || url.hostname !== "127.0.0.1" || url.port !== "55432"
        || passwordBytes < 1
      // DL7-F6: the two shapes the VPS pg_hba admits (socket, verified TLS) need a query.
      : !acceptsProductionDatabaseUrlQuery(url) || url.hostname.length === 0
        || passwordBytes < 32 || passwordBytes > 1_024)) {
    throw new TypeError("SUPPORT_STATUS_DATABASE_URL_INVALID");
  }
}

export async function loadDevelopmentSupportStatusCliCredentials(
  credentialFilePath: string
): Promise<DevelopmentSupportStatusCliCredentials> {
  const values = parseDevelopment(await readPrivateFile(
    credentialFilePath, MAX_DEVELOPMENT_BYTES
  ));
  const configurationDatabaseUrl = values.get(CONFIGURATION_KEY);
  const supportDatabaseUrl = values.get(SUPPORT_KEY);
  if (configurationDatabaseUrl === undefined || supportDatabaseUrl === undefined
    || configurationDatabaseUrl === supportDatabaseUrl) {
    throw new TypeError("SUPPORT_STATUS_CREDENTIAL_FILE_INVALID");
  }
  assertUrl(configurationDatabaseUrl, "debateai_dev_support_config_operator", true);
  assertUrl(supportDatabaseUrl, "debateai_dev_support", true);
  return Object.freeze({ configurationDatabaseUrl, supportDatabaseUrl });
}

export async function loadProductionSupportStatusCliCredentials(
  credentialFilePath: string
): Promise<ProductionSupportStatusCliCredentials> {
  const source = await readPrivateFile(credentialFilePath, MAX_PRODUCTION_BYTES);
  if (source.includes("\0") || source.includes("\r") || source.includes("\n")) {
    throw new TypeError("SUPPORT_STATUS_CREDENTIAL_FILE_INVALID");
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new TypeError("SUPPORT_STATUS_CREDENTIAL_FILE_INVALID");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(["format", "credentials"])) {
    throw new TypeError("SUPPORT_STATUS_CREDENTIAL_FILE_INVALID");
  }
  const envelope = value as Record<string, unknown>;
  if (envelope.format !== CREDENTIAL_FORMAT || !Array.isArray(envelope.credentials)
    || envelope.credentials.length !== 1) {
    throw new TypeError("SUPPORT_STATUS_CREDENTIAL_FILE_INVALID");
  }
  const credential = envelope.credentials[0];
  if (typeof credential !== "object" || credential === null || Array.isArray(credential)
    || JSON.stringify(Object.keys(credential)) !== JSON.stringify(["principalId", "databaseUrl"])) {
    throw new TypeError("SUPPORT_STATUS_CREDENTIAL_FILE_INVALID");
  }
  const record = credential as Record<string, unknown>;
  if (record.principalId !== "api-support" || typeof record.databaseUrl !== "string"
    || JSON.stringify(value) !== source) {
    throw new TypeError("SUPPORT_STATUS_CREDENTIAL_FILE_INVALID");
  }
  assertUrl(record.databaseUrl, "debateai_prod_api_support", false);
  return Object.freeze({ supportDatabaseUrl: record.databaseUrl });
}
