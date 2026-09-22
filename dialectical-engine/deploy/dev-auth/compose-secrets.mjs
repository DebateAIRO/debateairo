// Credentials the development compose file interpolates (L7-F2, L7-F3, L7-F4, V-21a).
//
// Every one of them is generated once into a 0600 file under the dev key-custody root and
// reaches compose through `--env-file`, so the repository never carries a service credential
// and a plain `docker compose up` refuses instead of booting a default-credentialled Hatchet,
// an unauthenticated vLLM, or a PostgreSQL superuser with a password anyone can read.
//
// It lives beside custody-root.mjs rather than inside one application because two of them read
// it: the runner's dev data plane, and the observation agent's provisioning command, which may
// not import from apps/runner (obs-agent-01-boundaries).
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join, resolve } from "node:path";

const PRIVATE_FILE_MODE = 0o600;
const MAX_SECRET_FILE_BYTES = 4 * 1024;
const SECRET_FILE_NAME = "compose-secrets.env";

export const DEVELOPMENT_COMPOSE_SECRET_KEYS = Object.freeze([
  "POSTGRES_SUPERUSER_PASSWORD",
  "HATCHET_DATABASE_PASSWORD",
  "HATCHET_ADMIN_EMAIL",
  "HATCHET_ADMIN_PASSWORD",
  "VLLM_API_KEY"
]);

export class DevelopmentComposeSecretsError extends Error {
  constructor(code, cause) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "DevelopmentComposeSecretsError";
    this.code = code;
  }
}

function currentUid() {
  if (typeof process.getuid !== "function") {
    throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_OWNER_UNVERIFIED");
  }
  return process.getuid();
}

function isFileSystemError(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}

function generatedValue(key) {
  return key === "HATCHET_ADMIN_EMAIL"
    ? `debateai-dev-${randomBytes(6).toString("hex")}@localhost.invalid`
    : randomBytes(24).toString("base64url");
}

function serialiseSecrets(values) {
  return [...values].map(([key, value]) => `${key}=${value}\n`).join("");
}

function parseSecrets(source) {
  if (source.includes("\r") || source.includes("\0") || !source.endsWith("\n")) {
    throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_FILE_INVALID");
  }
  const values = new Map();
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

export function developmentComposeSecretsPath(custodyRoot) {
  return join(resolve(custodyRoot), SECRET_FILE_NAME);
}

async function createSecretFile(path) {
  const values = new Map(
    DEVELOPMENT_COMPOSE_SECRET_KEYS.map((key) => [key, generatedValue(key)])
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
 * The complete secret set, or undefined when the file does not exist yet. A file whose mode,
 * owner, or link count drifted is refused, never repaired: an exposure event must surface
 * rather than be narrowed back (L7-F10).
 */
async function readValidatedSecrets(path) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) return undefined;
    throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_CUSTODY_INVALID", error);
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
    return values;
  } finally {
    await handle.close();
  }
}

/**
 * Returns the path of the custody secret file, creating it on first use.
 */
export async function ensureDevelopmentComposeSecrets(custodyRoot) {
  const path = developmentComposeSecretsPath(custodyRoot);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await readValidatedSecrets(path) !== undefined) return path;
    if (attempt === 0) await createSecretFile(path);
  }
  throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_PUBLISH_FAILED");
}

/**
 * One generated credential, for the commands that must USE it rather than only hand the file
 * to compose. Never creates the file: a caller that reads before the data plane generated it
 * is refused, because inventing a second password would silently diverge from the database.
 *
 * Two faults, two codes, because the remedies differ. NOT_GENERATED means the data plane has
 * not run on this custody root yet — run `pnpm dev:auth:up`. INCOMPLETE means a file exists
 * but predates a key, so the database it belongs to already holds the older credentials —
 * that needs the volume rebuilt, not another run.
 */
export async function readDevelopmentComposeSecret(custodyRoot, key) {
  const values = await readValidatedSecrets(developmentComposeSecretsPath(custodyRoot));
  if (values === undefined) {
    throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_NOT_GENERATED");
  }
  const value = values.get(key);
  if (value === undefined || value.length === 0) {
    throw new DevelopmentComposeSecretsError("DEV_COMPOSE_SECRETS_INCOMPLETE");
  }
  return value;
}
