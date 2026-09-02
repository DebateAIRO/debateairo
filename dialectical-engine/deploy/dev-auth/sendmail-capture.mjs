#!/usr/bin/env node

import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  rename,
  unlink
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const CAPTURE_DIRECTORY_ENV = "DEBATEAI_DEV_MAIL_CAPTURE_DIR";
const MAX_MESSAGE_BYTES = 256 * 1024;
const DIRECTORY_MODE = 0o700;
const MESSAGE_MODE = 0o600;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;
// The mailer emits exactly one `To:` holding one bare address. A display name,
// angle brackets, a second address, a folded continuation or a `Cc:`/`Bcc:`
// would each hand a real MTA a recipient this sink never saw, so all are
// refused rather than guessed at (L7-F7).
const RECIPIENT_GRAMMAR =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const FANOUT_HEADER = /^(?:cc|bcc|resent-to|resent-cc|resent-bcc):/i;

class CaptureError extends Error {
  constructor(code) {
    super(code);
    this.name = "CaptureError";
  }
}

function requireInvocation(argv) {
  // `-i -t -f <envelope sender>` and nothing else: with `-t` the recipient
  // rides in the header block on stdin instead of argv, where every local user
  // could read it out of `ps` (L7-F7).
  if (argv.length !== 4
    || argv[0] !== "-i"
    || argv[1] !== "-t"
    || argv[2] !== "-f"
    || !EMAIL_SHAPE.test(argv[3] ?? "")
    || /[\r\n]/.test(argv[3] ?? "")) {
    throw new CaptureError("DEV_MAIL_CAPTURE_INVOCATION_INVALID");
  }
}

function requireSingleRecipient(message) {
  const text = message.toString("utf8");
  const separator = text.indexOf("\r\n\r\n");
  if (separator < 0) throw new CaptureError("DEV_MAIL_CAPTURE_RECIPIENT_INVALID");
  let recipient = null;
  for (const header of text.slice(0, separator).split("\r\n")) {
    // An obs-fold continuation line could hide a second address behind a
    // header that already passed.
    if (/^[ \t]/.test(header) || FANOUT_HEADER.test(header)) {
      throw new CaptureError("DEV_MAIL_CAPTURE_RECIPIENT_INVALID");
    }
    if (!/^to:/i.test(header)) continue;
    if (recipient !== null) throw new CaptureError("DEV_MAIL_CAPTURE_RECIPIENT_INVALID");
    recipient = header.slice(3).trim();
  }
  if (recipient === null || !RECIPIENT_GRAMMAR.test(recipient)) {
    throw new CaptureError("DEV_MAIL_CAPTURE_RECIPIENT_INVALID");
  }
  return recipient;
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
    throw new CaptureError("DEV_MAIL_CAPTURE_CUSTODY_INVALID");
  }
}

async function readBoundedMessage() {
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_MESSAGE_BYTES) {
      throw new CaptureError("DEV_MAIL_CAPTURE_MESSAGE_TOO_LARGE");
    }
    chunks.push(bytes);
  }
  if (total === 0) throw new CaptureError("DEV_MAIL_CAPTURE_MESSAGE_EMPTY");
  return Buffer.concat(chunks, total);
}

async function captureMessage(directory, message) {
  const messageId = randomUUID();
  const temporaryPath = resolve(directory, `.${messageId}.${process.pid}.tmp`);
  const finalPath = resolve(directory, `${messageId}.eml`);
  let temporaryExists = false;
  try {
    const file = await open(
      temporaryPath,
      constants.O_CREAT
        | constants.O_EXCL
        | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      MESSAGE_MODE
    );
    temporaryExists = true;
    try {
      await file.chmod(MESSAGE_MODE);
      await file.writeFile(message);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporaryPath, finalPath);
    temporaryExists = false;
    const directoryHandle = await open(directory, constants.O_RDONLY);
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    if (temporaryExists) await unlink(temporaryPath).catch(() => undefined);
  }
}

async function main() {
  const invocation = process.argv.slice(2);
  const preflight = invocation.length === 1 && invocation[0] === "--preflight";
  if (!preflight) requireInvocation(invocation);
  const configuredDirectory = process.env[CAPTURE_DIRECTORY_ENV];
  if (configuredDirectory === undefined || configuredDirectory.trim() === "") {
    throw new CaptureError("DEV_MAIL_CAPTURE_DIRECTORY_REQUIRED");
  }
  const directory = resolve(configuredDirectory);
  await requirePrivateDirectory(directory);
  if (process.argv[2] === "--preflight") return;
  const message = await readBoundedMessage();
  requireSingleRecipient(message);
  await captureMessage(directory, message);
}

try {
  await main();
} catch (error) {
  const code = error instanceof CaptureError
    ? error.message
    : "DEV_MAIL_CAPTURE_WRITE_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
