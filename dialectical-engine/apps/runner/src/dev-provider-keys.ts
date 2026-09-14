import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join, resolve } from "node:path";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MODE_MASK = 0o777;

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    throw new TypeError("DEV_PROVIDER_KEYS_CUSTODY_INVALID");
  }
  return process.getuid();
}

export async function readProviderKeys(
  repositoryRoot: string
): Promise<ReadonlyMap<string, string>> {
  const custodyRoot = join(resolve(repositoryRoot), ".local", "dev-auth");
  let directory;
  try {
    directory = await lstat(custodyRoot);
  } catch (error) {
    if (isMissing(error)) return new Map();
    throw new TypeError("DEV_PROVIDER_KEYS_CUSTODY_INVALID", { cause: error });
  }
  const uid = currentUid();
  if (!directory.isDirectory()
    || directory.isSymbolicLink()
    || directory.uid !== uid
    || (directory.mode & MODE_MASK) !== PRIVATE_DIRECTORY_MODE) {
    throw new TypeError("DEV_PROVIDER_KEYS_CUSTODY_INVALID");
  }

  const path = join(custodyRoot, "provider-keys.env");
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (isMissing(error)) return new Map();
    throw new TypeError("DEV_PROVIDER_KEYS_CUSTODY_INVALID", { cause: error });
  }
  let source: string;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || metadata.uid !== uid
      || metadata.nlink !== 1
      || (metadata.mode & MODE_MASK) !== PRIVATE_FILE_MODE) {
      throw new TypeError("DEV_PROVIDER_KEYS_CUSTODY_INVALID");
    }
    source = await handle.readFile("utf8");
  } finally {
    await handle.close();
  }

  const keys = new Map<string, string>();
  for (const rawLine of source.split(/\r?\n/u)) {
    if (rawLine.trim() === "" || rawLine.trimStart().startsWith("#")) continue;
    const separator = rawLine.indexOf("=");
    const name = rawLine.slice(0, separator).trim();
    if (separator < 1 || !/^[A-Z][A-Z0-9_]*$/u.test(name) || keys.has(name)) {
      throw new TypeError("DEV_PROVIDER_KEYS_FORMAT_INVALID");
    }
    keys.set(name, rawLine.slice(separator + 1));
  }
  return keys;
}
