import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DEVELOPMENT_DATABASE_PRINCIPALS } from "./dev-database-principals.js";

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const MAX_DEVELOPMENT_CREDENTIAL_FILE_BYTES = 64 * 1024;
const SUPPORT_CONFIG_OPERATOR_DATABASE_URL = "SUPPORT_CONFIG_OPERATOR_DATABASE_URL";
const SUPPORT_CONFIG_OPERATOR_ROLE = "debateai_dev_support_config_operator";
const LOCAL_DATABASE_HOST = "127.0.0.1";
const LOCAL_DATABASE_PORT = "55432";
const LOCAL_DATABASE_NAME = "/debateai";

export type DevelopmentSupportConfigCliCredentials = Readonly<{
  databaseUrl: string;
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

async function readBoundedPrivateFile(path: string): Promise<string> {
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
      || metadata.size > MAX_DEVELOPMENT_CREDENTIAL_FILE_BYTES) {
      throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
    }
    return await handle.readFile("utf8");
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

function assertSupportConfigDatabaseUrl(raw: string): void {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(raw);
  } catch {
    throw new TypeError("SUPPORT_CONFIG_DATABASE_URL_INVALID");
  }
  if ((databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:")
    || databaseUrl.hostname !== LOCAL_DATABASE_HOST
    || databaseUrl.port !== LOCAL_DATABASE_PORT
    || databaseUrl.pathname !== LOCAL_DATABASE_NAME
    || databaseUrl.search !== ""
    || databaseUrl.hash !== ""
    || databaseUrl.username !== SUPPORT_CONFIG_OPERATOR_ROLE
    || databaseUrl.password.length === 0) {
    throw new TypeError("SUPPORT_CONFIG_DATABASE_URL_INVALID");
  }
}

export async function loadDevelopmentSupportConfigCliCredentials(
  credentialFilePath: string
): Promise<DevelopmentSupportConfigCliCredentials> {
  const resolvedPath = resolve(credentialFilePath);
  await assertPrivateDirectory(dirname(resolvedPath));
  const credentials = parseExactDevelopmentCredentials(
    await readBoundedPrivateFile(resolvedPath)
  );
  const databaseUrl = credentials.get(SUPPORT_CONFIG_OPERATOR_DATABASE_URL);
  if (databaseUrl === undefined) {
    throw new TypeError("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");
  }
  assertSupportConfigDatabaseUrl(databaseUrl);
  return Object.freeze({ databaseUrl });
}
