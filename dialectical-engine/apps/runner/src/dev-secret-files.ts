import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { resolveDevCustodyRoot } from "../../../deploy/dev-auth/custody-root.mjs";

export type DevelopmentSecretFile = Readonly<{
  id: string;
  relativePath: string;
}>;

export type DevelopmentSecretStore = Readonly<{
  id: string;
  relativePath: string;
}>;

export const DEVELOPMENT_SECRET_FILES = Object.freeze([
  Object.freeze({ id: "kek", relativePath: "secrets/kek.bin" }),
  Object.freeze({ id: "corpus-kek", relativePath: "secrets/corpus-kek.bin" }),
  Object.freeze({ id: "blind-index", relativePath: "secrets/blind-index-key.bin" }),
  Object.freeze({
    id: "audit-source-ip-salt",
    relativePath: "secrets/audit-source-ip-salt.bin"
  })
] satisfies readonly DevelopmentSecretFile[]);

export const DEVELOPMENT_SECRET_STORES = Object.freeze([
  Object.freeze({ id: "audit-keys", relativePath: "audit-keys" }),
  Object.freeze({ id: "user-deks", relativePath: "user-deks" }),
  Object.freeze({ id: "publication-keys", relativePath: "publication-keys" })
] satisfies readonly DevelopmentSecretStore[]);

export type DevelopmentSecretReceipt = Readonly<{
  custodyRoot: string;
  generatedSecretCount: number;
  secretFileCount: number;
  secretStoreCount: number;
}>;

type GenerateDevelopmentSecretFilesInput = Readonly<{
  repositoryRoot: string;
}>;

type ValidatedSecret = Readonly<{
  material: Buffer;
  dev: number;
  ino: number;
}>;

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    throw new TypeError("DEV_AUTH_SECRET_OWNER_UNVERIFIED");
  }
  return process.getuid();
}

function isFileSystemError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

async function ensureDirectory(
  directoryPath: string,
  requirePrivateMode: boolean,
  errorCode: string
): Promise<void> {
  try {
    await mkdir(directoryPath, { mode: 0o700 });
  } catch (error) {
    if (!isFileSystemError(error, "EEXIST")) throw error;
  }
  const metadata = await lstat(directoryPath);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()
    || metadata.uid !== currentUid()
    || (requirePrivateMode && (metadata.mode & 0o777) !== 0o700)) {
    throw new TypeError(errorCode);
  }
}

async function readValidatedSecret(secretPath: string): Promise<ValidatedSecret | undefined> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let handle;
    try {
      handle = await open(secretPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if (isFileSystemError(error, "ENOENT")) return undefined;
      throw new TypeError("DEV_AUTH_SECRET_FILE_INVALID");
    }
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile() || metadata.uid !== currentUid()
        || (metadata.mode & 0o777) !== 0o600 || metadata.size !== 32) {
        throw new TypeError("DEV_AUTH_SECRET_FILE_INVALID");
      }
      const material = await handle.readFile();
      if (material.byteLength !== 32) {
        material.fill(0);
        throw new TypeError("DEV_AUTH_SECRET_FILE_INVALID");
      }
      if (metadata.nlink === 1) {
        return { material, dev: metadata.dev, ino: metadata.ino };
      }
      material.fill(0);
      if (attempt === 49) throw new TypeError("DEV_AUTH_SECRET_FILE_INVALID");
    } finally {
      await handle.close();
    }
    await delay(2);
  }
  throw new TypeError("DEV_AUTH_SECRET_FILE_INVALID");
}

function assertDistinctSecretDomains(secrets: readonly ValidatedSecret[]): void {
  try {
    for (let leftIndex = 0; leftIndex < secrets.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < secrets.length; rightIndex += 1) {
        const left = secrets[leftIndex]!;
        const right = secrets[rightIndex]!;
        if ((left.dev === right.dev && left.ino === right.ino)
          || timingSafeEqual(left.material, right.material)) {
          throw new TypeError("DEV_AUTH_SECRET_DOMAIN_INVALID");
        }
      }
    }
  } finally {
    for (const secret of secrets) secret.material.fill(0);
  }
}

async function validateSecretSet(
  custodyRoot: string,
  allowMissing: boolean
): Promise<readonly string[]> {
  const missing: string[] = [];
  const validated: ValidatedSecret[] = [];
  try {
    for (const { relativePath } of DEVELOPMENT_SECRET_FILES) {
      const secretPath = join(custodyRoot, relativePath);
      const secret = await readValidatedSecret(secretPath);
      if (secret === undefined) {
        if (!allowMissing) throw new TypeError("DEV_AUTH_SECRET_FILE_INVALID");
        missing.push(secretPath);
      } else {
        validated.push(secret);
      }
    }
    assertDistinctSecretDomains(validated);
    return missing;
  } catch (error) {
    for (const secret of validated) secret.material.fill(0);
    throw error;
  }
}

async function publishSecret(secretPath: string): Promise<boolean> {
  const temporaryPath = join(
    dirname(secretPath),
    `.${basename(secretPath)}.${randomUUID()}.tmp`
  );
  const material = randomBytes(32);
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(material);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporaryPath, secretPath);
      return true;
    } catch (error) {
      if (isFileSystemError(error, "EEXIST")) return false;
      throw error;
    }
  } finally {
    material.fill(0);
    try {
      await unlink(temporaryPath);
    } catch (error) {
      if (!isFileSystemError(error, "ENOENT")) throw error;
    }
  }
}

export async function generateDevelopmentSecretFiles(
  input: GenerateDevelopmentSecretFilesInput
): Promise<DevelopmentSecretReceipt> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const custodyRoot = resolveDevCustodyRoot(repositoryRoot);
  const localRoot = dirname(custodyRoot);
  await ensureDirectory(localRoot, true, "DEV_AUTH_CUSTODY_ROOT_INVALID");
  await ensureDirectory(custodyRoot, true, "DEV_AUTH_CUSTODY_ROOT_INVALID");
  await ensureDirectory(join(custodyRoot, "secrets"), true, "DEV_AUTH_SECRET_STORE_INVALID");
  for (const { relativePath } of DEVELOPMENT_SECRET_STORES) {
    await ensureDirectory(
      join(custodyRoot, relativePath),
      true,
      "DEV_AUTH_SECRET_STORE_INVALID"
    );
  }

  const missingSecretPaths = await validateSecretSet(custodyRoot, true);
  let generatedSecretCount = 0;
  for (const secretPath of missingSecretPaths) {
    if (await publishSecret(secretPath)) generatedSecretCount += 1;
  }
  await validateSecretSet(custodyRoot, false);
  return Object.freeze({
    custodyRoot,
    generatedSecretCount,
    secretFileCount: DEVELOPMENT_SECRET_FILES.length,
    secretStoreCount: DEVELOPMENT_SECRET_STORES.length
  });
}
