#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  X509Certificate,
  createPrivateKey
} from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const DEFAULT_TLS_DIRECTORY = resolve(".local/dev-auth/tls");
const CERTIFICATE_NAME = "localhost.pem";
const PRIVATE_KEY_NAME = "localhost-key.pem";

class DevCertificateError extends Error {
  constructor(code) {
    super(code);
    this.name = "DevCertificateError";
  }
}

async function requirePrivateDirectory(path) {
  const created = await mkdir(path, { recursive: true, mode: DIRECTORY_MODE });
  if (created !== undefined) await chmod(path, DIRECTORY_MODE);
  const metadata = await lstat(path);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!metadata.isDirectory()
    || metadata.isSymbolicLink()
    || (metadata.mode & 0o777) !== DIRECTORY_MODE
    || (currentUid !== null && metadata.uid !== currentUid)) {
    throw new DevCertificateError("DEV_TLS_DIRECTORY_CUSTODY_INVALID");
  }
}

async function requirePrivateFile(path) {
  const metadata = await lstat(path).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (metadata === null) return false;
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!metadata.isFile()
    || metadata.isSymbolicLink()
    || (metadata.mode & 0o777) !== FILE_MODE
    || (currentUid !== null && metadata.uid !== currentUid)) {
    throw new DevCertificateError("DEV_TLS_FILE_CUSTODY_INVALID");
  }
  return true;
}

async function validateCertificatePair(certificatePath, privateKeyPath) {
  const [certificateBytes, privateKeyBytes] = await Promise.all([
    readFile(certificatePath),
    readFile(privateKeyPath)
  ]);
  let certificate;
  let privateKey;
  try {
    certificate = new X509Certificate(certificateBytes);
    privateKey = createPrivateKey(privateKeyBytes);
  } catch {
    throw new DevCertificateError("DEV_TLS_CERTIFICATE_INVALID");
  }
  const now = Date.now();
  if (certificate.checkHost("localhost") !== "localhost"
    || certificate.checkIP("127.0.0.1") !== "127.0.0.1"
    || certificate.checkIP("::1") !== "::1"
    || Date.parse(certificate.validFrom) > now
    || Date.parse(certificate.validTo) <= now
    || !certificate.checkPrivateKey(privateKey)) {
    throw new DevCertificateError("DEV_TLS_CERTIFICATE_INVALID");
  }
}

function runMkcert(executable, certificatePath, privateKeyPath) {
  const arguments_ = [
    "-cert-file", certificatePath,
    "-key-file", privateKeyPath,
    "localhost", "127.0.0.1", "::1"
  ];
  const environment = { PATH: process.env.PATH ?? "/usr/bin:/bin" };
  if (process.env.HOME !== undefined) environment.HOME = process.env.HOME;
  if (process.env.CAROOT !== undefined) environment.CAROOT = process.env.CAROOT;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, arguments_, {
      env: environment,
      stdio: "ignore"
    });
    child.once("error", () => rejectPromise(new DevCertificateError("DEV_TLS_MKCERT_UNAVAILABLE")));
    child.once("exit", (code, signal) => {
      if (code === 0 && signal === null) resolvePromise();
      else rejectPromise(new DevCertificateError("DEV_TLS_MKCERT_FAILED"));
    });
  });
}

export async function ensureDevLocalCertificate(options = {}) {
  const tlsDirectory = resolve(options.tlsDirectory ?? DEFAULT_TLS_DIRECTORY);
  const mkcertExecutable = options.mkcertExecutable ?? "mkcert";
  await requirePrivateDirectory(tlsDirectory);
  const certificatePath = resolve(tlsDirectory, CERTIFICATE_NAME);
  const privateKeyPath = resolve(tlsDirectory, PRIVATE_KEY_NAME);
  if (dirname(certificatePath) !== tlsDirectory || dirname(privateKeyPath) !== tlsDirectory) {
    throw new DevCertificateError("DEV_TLS_PATH_INVALID");
  }

  const present = await Promise.all([
    requirePrivateFile(certificatePath),
    requirePrivateFile(privateKeyPath)
  ]);
  if (present.every(Boolean)) {
    await validateCertificatePair(certificatePath, privateKeyPath);
    return { certificatePath, privateKeyPath, reused: true };
  }
  if (present.some(Boolean)) throw new DevCertificateError("DEV_TLS_CERTIFICATE_PARTIAL");

  const lockPath = resolve(tlsDirectory, ".certificate.lock");
  const lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, FILE_MODE);
  try {
    await runMkcert(mkcertExecutable, certificatePath, privateKeyPath);
    await Promise.all([chmod(certificatePath, FILE_MODE), chmod(privateKeyPath, FILE_MODE)]);
    await Promise.all([requirePrivateFile(certificatePath), requirePrivateFile(privateKeyPath)]);
    await validateCertificatePair(certificatePath, privateKeyPath);
  } catch (error) {
    await Promise.all([
      unlink(certificatePath).catch(() => undefined),
      unlink(privateKeyPath).catch(() => undefined)
    ]);
    throw error;
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => undefined);
  }
  return { certificatePath, privateKeyPath, reused: false };
}

async function main() {
  await ensureDevLocalCertificate();
  process.stdout.write("DEV_TLS_CERTIFICATE_READY\n");
}

if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof DevCertificateError
      ? error.message
      : "DEV_TLS_CERTIFICATE_SETUP_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
