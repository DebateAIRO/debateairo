import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { isSerializedSafeEnvelope } from "../envelope-contract.js";
import type { PostRedactionEnvelope } from "../redactor.js";
import {
  SPOOL_FILE_MAX_BYTES,
  SPOOL_RECORD_MAX_BYTES,
} from "../safe-metadata.js";
import { readIndexedSpoolPage } from "../spool-index.js";
import type { CaptureRuntimeName } from "./index.js";
import type { PostgresCaptureSink } from "./sink.js";

const MAX_ELIGIBLE_FILES_PER_START = 64;
const MAX_TRANSACTIONS_PER_START = 128;
const RUNTIME_NAMES: ReadonlySet<string> = new Set([
  "api",
  "runner",
  "scheduler",
  "evaluator-lib",
  "ui-client",
  "listener",
  "watchdog",
  "ingest",
]);
const SPOOL_NAME = /^(api|runner|scheduler|evaluator-lib|ui-client|listener|watchdog|ingest)-([1-9][0-9]*)-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.spool$/u;

interface ParsedSpoolName {
  readonly runtime: CaptureRuntimeName;
  readonly pid: number;
}

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}

interface DrainBudget {
  remainingFiles: number;
  remainingTransactions: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSpoolName(name: string): ParsedSpoolName | undefined {
  const match = SPOOL_NAME.exec(name);
  if (match === null) return undefined;
  const runtime = match[1];
  const pid = Number(match[2]);
  if (
    runtime === undefined
    || !RUNTIME_NAMES.has(runtime)
    || !Number.isSafeInteger(pid)
  ) {
    return undefined;
  }
  return { runtime: runtime as CaptureRuntimeName, pid };
}

function ownerMayBeAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(isRecord(error) && error.code === "ESRCH");
  }
}

function sameIdentity(
  actual: Readonly<FileIdentity>,
  expected: Readonly<FileIdentity>,
): boolean {
  return actual.dev === expected.dev && actual.ino === expected.ino;
}

async function readExactBytes(
  handle: FileHandle,
  byteLength: number,
): Promise<Buffer | undefined> {
  const bytes = Buffer.alloc(byteLength);
  let offset = 0;
  while (offset < byteLength) {
    const result = await handle.read(bytes, offset, byteLength - offset, offset);
    if (result.bytesRead === 0) return undefined;
    offset += result.bytesRead;
  }
  const probe = Buffer.alloc(1);
  const result = await handle.read(probe, 0, 1, byteLength);
  return result.bytesRead === 0 ? bytes : undefined;
}

async function writeExactBytes(handle: FileHandle, bytes: Buffer): Promise<void> {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.write(bytes, offset, bytes.length - offset, offset);
    if (result.bytesWritten <= 0) throw new Error("SPOOL_COMPLETION_WRITE_FAILED");
    offset += result.bytesWritten;
  }
  await handle.sync();
}

async function snapshotStillMatches(
  handle: FileHandle,
  path: string,
  expected: Readonly<FileIdentity>,
  bytes: Buffer,
): Promise<boolean> {
  const descriptorStat = await handle.stat();
  if (
    !descriptorStat.isFile()
    || !sameIdentity(descriptorStat, expected)
    || descriptorStat.size !== bytes.length
  ) {
    return false;
  }
  const currentBytes = await readExactBytes(handle, bytes.length);
  if (currentBytes === undefined || !currentBytes.equals(bytes)) return false;
  const pathStat = await lstat(path);
  return pathStat.isFile() && sameIdentity(pathStat, expected);
}

async function exactCompletionExists(
  destination: string,
  bytes: Buffer,
): Promise<boolean> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      destination,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const descriptorStat = await handle.stat();
    if (!descriptorStat.isFile() || descriptorStat.size !== bytes.length) {
      return false;
    }
    const completionBytes = await readExactBytes(handle, bytes.length);
    if (completionBytes === undefined || !completionBytes.equals(bytes)) {
      return false;
    }
    const pathStat = await lstat(destination);
    return pathStat.isFile() && sameIdentity(pathStat, descriptorStat);
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function materializeCompletion(
  sourceHandle: FileHandle,
  sourcePath: string,
  destination: string,
  sourceIdentity: Readonly<FileIdentity>,
  bytes: Buffer,
): Promise<boolean> {
  if (
    !(await snapshotStillMatches(
      sourceHandle,
      sourcePath,
      sourceIdentity,
      bytes,
    ))
  ) {
    return false;
  }
  if (await exactCompletionExists(destination, bytes)) return true;
  const digest = createHash("sha256").update(bytes).digest("hex");
  const stagePath = join(
    dirname(sourcePath),
    `.${basename(sourcePath)}.completion-${digest}.stage`,
  );
  let stageHandle: FileHandle | undefined;
  try {
    let created = false;
    try {
      stageHandle = await open(
        stagePath,
        constants.O_CREAT
          | constants.O_EXCL
          | constants.O_NOFOLLOW
          | constants.O_RDWR,
        0o600,
      );
      created = true;
    } catch (error) {
      if (!isRecord(error) || error.code !== "EEXIST") return false;
      stageHandle = await open(
        stagePath,
        constants.O_NOFOLLOW | constants.O_NONBLOCK | constants.O_RDWR,
      );
    }
    if (created) await writeExactBytes(stageHandle, bytes);
    else await stageHandle.sync();
    const stageStat = await stageHandle.stat();
    const staged = await readExactBytes(stageHandle, bytes.length);
    const stagePathStat = await lstat(stagePath);
    if (
      !stageStat.isFile()
      || stageStat.size !== bytes.length
      || staged === undefined
      || !staged.equals(bytes)
      || !stagePathStat.isFile()
      || !sameIdentity(stagePathStat, stageStat)
    ) {
      return false;
    }
    if (
      !(await snapshotStillMatches(
        sourceHandle,
        sourcePath,
        sourceIdentity,
        bytes,
      ))
    ) {
      return false;
    }
    // R4-03: Node exposes no held-fd linkat primitive. The surrounding checks
    // detect namespace changes but are not race-free against an active same-UID
    // writer after the final observation. Exact bytes plus DB state are proof;
    // a completion pathname by itself never is.
    try {
      await link(stagePath, destination);
    } catch (error) {
      return isRecord(error)
        && error.code === "EEXIST"
        && await exactCompletionExists(destination, bytes);
    }
    const destinationStat = await lstat(destination);
    const currentStageStat = await lstat(stagePath);
    return destinationStat.isFile()
      && currentStageStat.isFile()
      && sameIdentity(destinationStat, stageStat)
      && sameIdentity(currentStageStat, stageStat)
      && await exactCompletionExists(destination, bytes);
  } catch {
    return false;
  } finally {
    await stageHandle?.close().catch(() => undefined);
  }
}

function boundedLines(bytes: Buffer): readonly string[] | undefined {
  if (bytes.length === 0 || bytes[bytes.length - 1] !== 0x0a) return undefined;
  const lines: string[] = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0x0a) continue;
    const lineBytes = index - start;
    if (lineBytes === 0 || lineBytes + 1 > SPOOL_RECORD_MAX_BYTES) {
      return undefined;
    }
    lines.push(bytes.subarray(start, index).toString("utf8"));
    start = index + 1;
  }
  return start === bytes.length ? lines : undefined;
}

async function drainFile(
  directory: string,
  name: string,
  parsed: ParsedSpoolName,
  databaseSink: PostgresCaptureSink,
  budget: DrainBudget,
): Promise<boolean> {
  if (ownerMayBeAlive(parsed.pid)) return false;
  const path = join(directory, name);
  const pathStat = await lstat(path);
  if (!pathStat.isFile()) return false;
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const fileStat = await handle.stat();
    if (
      !fileStat.isFile()
      || !sameIdentity(fileStat, pathStat)
      || !Number.isSafeInteger(fileStat.size)
      || fileStat.size < 0
      || fileStat.size > SPOOL_FILE_MAX_BYTES
    ) {
      return false;
    }
    const bytes = await readExactBytes(handle, fileStat.size);
    if (bytes === undefined) return false;
    const completionPath = `${path}.${bytes.length === 0 ? "empty" : "ingested"}`;
    if (bytes.length === 0) {
      return await materializeCompletion(
        handle,
        path,
        completionPath,
        fileStat,
        bytes,
      );
    }
    const lines = boundedLines(bytes);
    if (lines === undefined || lines.length > budget.remainingTransactions) {
      return false;
    }
    const envelopes: PostRedactionEnvelope[] = [];
    for (const line of lines) {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        return false;
      }
      if (!isSerializedSafeEnvelope(value, parsed.runtime)) return false;
      envelopes.push(value as unknown as PostRedactionEnvelope);
    }
    for (const envelope of envelopes) {
      budget.remainingTransactions -= 1;
      await databaseSink.ingestSpooledOccurrence(envelope);
    }
    return await materializeCompletion(
      handle,
      path,
      completionPath,
      fileStat,
      bytes,
    );
  } finally {
    await handle.close();
  }
}

export async function drainDeadSpoolFiles(options: {
  readonly spoolDirectory: string | undefined;
  readonly databaseSink: PostgresCaptureSink;
}): Promise<void> {
  if (options.spoolDirectory === undefined) return;
  const budget: DrainBudget = {
    remainingFiles: MAX_ELIGIBLE_FILES_PER_START,
    remainingTransactions: MAX_TRANSACTIONS_PER_START,
  };
  try {
    const basenames = await readIndexedSpoolPage(options.spoolDirectory);
    for (const name of basenames) {
      if (budget.remainingFiles === 0 || budget.remainingTransactions === 0) {
        break;
      }
      budget.remainingFiles -= 1;
      const parsed = parseSpoolName(name);
      if (parsed === undefined) continue;
      await drainFile(
        options.spoolDirectory,
        name,
        parsed,
        options.databaseSink,
        budget,
      ).catch(() => false);
    }
  } catch {
    // Draining is fail-open; every uncompleted source remains retryable.
  }
}
