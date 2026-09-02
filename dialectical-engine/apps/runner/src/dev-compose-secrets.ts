import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join, resolve } from "node:path";

const PRIVATE_FILE_MODE = 0o600;
const MAX_SECRET_FILE_BYTES = 4 * 1024;
const SECRET_FILE_NAME = "compose-secrets.env";

/**
 * Credentials the development compose file interpolates. Every one of them is
 * generated once into a 0600 file under the dev key-custody root and reaches
 * compose through `--env-file`, so the repository never carries a service
 * credential and a plain `docker compose up` refuses instead of booting a
 * default-credentialled Hatchet or an unauthenticated vLLM (L7-F2, L7-F3, L7-F4).
 */
export const DEVELOPMENT_COMPOSE_SECRET_KEYS = Object.freeze([
  "HATCHET_DATABASE_PASSWORD"
] as const);

export class DevelopmentComposeSecretsError extends Error {
  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "DevelopmentComposeSecretsError";
  }
}

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_OWNER_UNVERIFIED");
  }
  return process.getuid();
}

function isFileSystemError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function generatedValue(key: string): string {
  return key === "HATCHET_ADMIN_EMAIL"
    ? `debateai-dev-${randomBytes(6).toString("hex")}@localhost.invalid`
    : randomBytes(24).toString("base64url");
}

function serialiseSecrets(values: ReadonlyMap<string, string>): string {
  return [...values].map(([key, value]) => `${key}=${value}\n`).join("");
}

function parseSecrets(source: string): ReadonlyMap<string, string> {
  if (source.includes("\r") || source.includes("\0") || !source.endsWith("\n")) {
    throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_FILE_INVALID");
  }
  const values = new Map<string, string>();
  for (const row of source.slice(0, -1).split("\n")) {
    const separator = row.indexOf("=");
    const key = row.slice(0, separator);
    const value = row.slice(separator + 1);
    if (separator < 1 || value.length === 0 || values.has(key)) {
      throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_FILE_INVALID");
    }
    values.set(key, value);
  }
  return values;
}

export function developmentComposeSecretsPath(custodyRoot: string): string {
  return join(resolve(custodyRoot), SECRET_FILE_NAME);
}

async function createSecretFile(path: string): Promise<void> {
  const values = new Map(
    DEVELOPMENT_COMPOSE_SECRET_KEYS.map((key) => [key, generatedValue(key)] as const)
  );
  let handle;
  try {
    handle = await open(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      PRIVATE_FILE_MODE
    );
  } catch (error) {
    // A concurrent creator won the race; the next read validates its file.
    if (isFileSystemError(error, "EEXIST")) return;
    throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_PUBLISH_FAILED", error);
  }
  try {
    await handle.chmod(PRIVATE_FILE_MODE);
    await handle.writeFile(serialiseSecrets(values), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Returns the path of the custody secret file, creating it on first use.
 * A file whose mode, owner, or link count drifted is refused, never repaired:
 * an exposure event must surface rather than be narrowed back (L7-F10).
 */
export async function ensureDevelopmentComposeSecrets(custodyRoot: string): Promise<string> {
  const path = developmentComposeSecretsPath(custodyRoot);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle;
    try {
      handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch (error) {
      if (!isFileSystemError(error, "ENOENT")) {
        throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_CUSTODY_INVALID", error);
      }
      await createSecretFile(path);
      continue;
    }
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile()
        || metadata.uid !== currentUid()
        || metadata.nlink !== 1
        || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
        || metadata.size < 1
        || metadata.size > MAX_SECRET_FILE_BYTES) {
        throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_CUSTODY_INVALID");
      }
      const values = parseSecrets(await handle.readFile("utf8"));
      if (DEVELOPMENT_COMPOSE_SECRET_KEYS.some((key) => !values.has(key))) {
        throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_INCOMPLETE");
      }
      return path;
    } finally {
      await handle.close();
    }
  }
  throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_PUBLISH_FAILED");
}
