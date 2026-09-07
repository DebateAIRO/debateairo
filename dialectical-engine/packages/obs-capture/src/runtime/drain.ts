import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { normalizeSerializedSafeEnvelope } from "../envelope-contract.js";
import {
  resolveSafeTemplate,
  resolveTaxonomyClass,
} from "../registry/index.js";
import type { PostRedactionEnvelope } from "../redactor.js";
import {
  SPOOL_FILE_MAX_BYTES,
  SPOOL_RECORD_MAX_BYTES,
} from "../safe-metadata.js";
import {
  createSpoolAdmissionProof,
  encodeSpoolAdmissionSeal,
  readSpoolReleaseLock,
  readTypedIndexedSpoolPage,
  type AdmissionSpoolIndexRecord,
  type SpoolAdmissionSeal,
  type SpoolIndexRecord,
} from "../spool-index.js";
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
  readonly dev: bigint;
  readonly ino: bigint;
}

interface DrainBudget {
  remainingFiles: number;
  remainingTransactions: number;
}

function isCanonicalAdmissionSeal(seal: SpoolAdmissionSeal): boolean {
  try {
    encodeSpoolAdmissionSeal(seal);
    return true;
  } catch {
    return false;
  }
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

function sameExactSourceSnapshot(left: BigIntStats, right: BigIntStats): boolean {
  return sameIdentity(left, right)
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

async function matchingSourceSnapshot(
  handle: FileHandle,
  path: string,
  expected: BigIntStats,
  bytes: Buffer,
  requireExactMetadata: boolean,
): Promise<BigIntStats | undefined> {
  const descriptorStat = await handle.stat({ bigint: true });
  if (
    !descriptorStat.isFile()
    || descriptorStat.nlink !== 1n
    || !sameIdentity(descriptorStat, expected)
    || descriptorStat.size !== BigInt(bytes.length)
    || (requireExactMetadata && !sameExactSourceSnapshot(descriptorStat, expected))
  ) {
    return undefined;
  }
  const currentBytes = await readExactBytes(handle, bytes.length);
  if (currentBytes === undefined || !currentBytes.equals(bytes)) return undefined;
  const pathStat = await lstat(path, { bigint: true });
  if (
    !pathStat.isFile()
    || pathStat.nlink !== 1n
    || !sameIdentity(pathStat, expected)
    || pathStat.size !== BigInt(bytes.length)
    || (requireExactMetadata && !sameExactSourceSnapshot(pathStat, expected))
  ) {
    return undefined;
  }
  return descriptorStat;
}

function admissionProofMatches(
  admissionRef: string,
  record: AdmissionSpoolIndexRecord,
  stat: BigIntStats,
  bytes: Buffer,
): boolean {
  try {
    const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
    return createSpoolAdmissionProof({
      admissionRef,
      basename: record.basename,
      dev: stat.dev.toString(),
      ino: stat.ino.toString(),
      nlink: "1",
      size: stat.size.toString(),
      mtimeNs: stat.mtimeNs.toString(),
      ctimeNs: stat.ctimeNs.toString(),
      sourceSha256,
    }) === record.proof;
  } catch {
    return false;
  }
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
    const descriptorStat = await handle.stat({ bigint: true });
    if (!descriptorStat.isFile() || descriptorStat.size !== BigInt(bytes.length)) {
      return false;
    }
    const completionBytes = await readExactBytes(handle, bytes.length);
    if (completionBytes === undefined || !completionBytes.equals(bytes)) {
      return false;
    }
    const pathStat = await lstat(destination, { bigint: true });
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
  sourceIdentity: BigIntStats,
  bytes: Buffer,
  requireExactSourceMetadata: boolean,
): Promise<boolean> {
  if (
    (await matchingSourceSnapshot(
      sourceHandle,
      sourcePath,
      sourceIdentity,
      bytes,
      requireExactSourceMetadata,
    )) === undefined
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
    const stageStat = await stageHandle.stat({ bigint: true });
    const staged = await readExactBytes(stageHandle, bytes.length);
    const stagePathStat = await lstat(stagePath, { bigint: true });
    if (
      !stageStat.isFile()
      || stageStat.nlink !== 1n
      || stageStat.size !== BigInt(bytes.length)
      || staged === undefined
      || !staged.equals(bytes)
      || !stagePathStat.isFile()
      || stagePathStat.nlink !== 1n
      || !sameIdentity(stagePathStat, stageStat)
    ) {
      return false;
    }
    if (
      (await matchingSourceSnapshot(
        sourceHandle,
        sourcePath,
        sourceIdentity,
        bytes,
        requireExactSourceMetadata,
      )) === undefined
    ) {
      return false;
    }
    const finalStageStat = await stageHandle.stat({ bigint: true });
    const finalStaged = await readExactBytes(stageHandle, bytes.length);
    const finalStagePathStat = await lstat(stagePath, { bigint: true });
    if (
      !finalStageStat.isFile()
      || finalStageStat.nlink !== 1n
      || finalStageStat.size !== BigInt(bytes.length)
      || finalStaged === undefined
      || !finalStaged.equals(bytes)
      || !finalStagePathStat.isFile()
      || finalStagePathStat.nlink !== 1n
      || !sameIdentity(finalStagePathStat, finalStageStat)
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
    const destinationStat = await lstat(destination, { bigint: true });
    const currentStageStat = await lstat(stagePath, { bigint: true });
    const currentStageDescriptor = await stageHandle.stat({ bigint: true });
    return currentStageDescriptor.isFile()
      && currentStageDescriptor.nlink === 2n
      && destinationStat.isFile()
      && destinationStat.nlink === 2n
      && currentStageStat.isFile()
      && currentStageStat.nlink === 2n
      && sameIdentity(currentStageDescriptor, stageStat)
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
  record: SpoolIndexRecord,
  parsed: ParsedSpoolName,
  databaseSink: PostgresCaptureSink,
  budget: DrainBudget,
  admissionSeal: SpoolAdmissionSeal | undefined,
): Promise<boolean> {
  if (record.kind === "writer" && ownerMayBeAlive(parsed.pid)) return false;
  if (record.kind === "admission" && admissionSeal === undefined) return false;
  const path = join(directory, record.basename);
  const pathStat = await lstat(path, { bigint: true });
  if (!pathStat.isFile() || pathStat.nlink !== 1n) return false;
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const fileStat = await handle.stat({ bigint: true });
    const fileSize = Number(fileStat.size);
    if (
      !fileStat.isFile()
      || fileStat.nlink !== 1n
      || !sameIdentity(fileStat, pathStat)
      || !Number.isSafeInteger(fileSize)
      || fileSize < 0
      || fileSize > SPOOL_FILE_MAX_BYTES
      || (
        record.kind === "admission"
        && !sameExactSourceSnapshot(fileStat, pathStat)
      )
    ) {
      return false;
    }
    const bytes = await readExactBytes(handle, fileSize);
    if (bytes === undefined) return false;
    if (
      record.kind === "admission"
      && (
        admissionSeal === undefined
        || !admissionProofMatches(
          admissionSeal.admissionRef,
          record,
          fileStat,
          bytes,
        )
      )
    ) {
      return false;
    }
    const completionPath = `${path}.${bytes.length === 0 ? "empty" : "ingested"}`;
    if (bytes.length === 0) {
      return await materializeCompletion(
        handle,
        path,
        completionPath,
        fileStat,
        bytes,
        record.kind === "admission",
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
      const envelope = normalizeSerializedSafeEnvelope(value, parsed.runtime);
      if (envelope === undefined) return false;
      const taxonomy = typeof envelope.taxonomy_class === "string"
        ? resolveTaxonomyClass(envelope.taxonomy_class)
        : undefined;
      const template = typeof envelope.code === "string"
        ? resolveSafeTemplate(envelope.code)
        : undefined;
      if (
        taxonomy === undefined
        || template === undefined
        || (template.binding !== undefined
          && Object.entries(template.binding).some(
            ([field, expected]) =>
              envelope[field as keyof PostRedactionEnvelope] !== expected,
          ))
      ) return false;
      envelopes.push(envelope);
    }
    const finalSnapshot = await matchingSourceSnapshot(
      handle,
      path,
      fileStat,
      bytes,
      record.kind === "admission",
    );
    if (
      finalSnapshot === undefined
      || (
        record.kind === "admission"
        && (
          admissionSeal === undefined
          || !admissionProofMatches(
            admissionSeal.admissionRef,
            record,
            finalSnapshot,
            bytes,
          )
        )
      )
    ) {
      return false;
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
      record.kind === "admission",
    );
  } finally {
    await handle.close();
  }
}

export async function drainDeadSpoolFiles(options: {
  readonly spoolDirectory: string | undefined;
  readonly admissionSeal?: SpoolAdmissionSeal | undefined;
  readonly databaseSink: PostgresCaptureSink;
}): Promise<void> {
  if (options.spoolDirectory === undefined) return;
  const budget: DrainBudget = {
    remainingFiles: MAX_ELIGIBLE_FILES_PER_START,
    remainingTransactions: MAX_TRANSACTIONS_PER_START,
  };
  try {
    const releaseLock = await readSpoolReleaseLock(options.spoolDirectory);
    if (releaseLock.status === "invalid") return;
    const activeSeal = releaseLock.status === "valid"
      && options.admissionSeal !== undefined
      && isCanonicalAdmissionSeal(options.admissionSeal)
      && releaseLock.lock.admissionRef === options.admissionSeal.admissionRef
      && releaseLock.lock.dev === options.admissionSeal.lockDev
      && releaseLock.lock.ino === options.admissionSeal.lockIno
      && releaseLock.lock.sha256 === options.admissionSeal.lockSha256
      && releaseLock.lock.indexDev === options.admissionSeal.indexDev
      && releaseLock.lock.indexIno === options.admissionSeal.indexIno
      && releaseLock.lock.finalPrefixBytes === options.admissionSeal.prefixBytes
      ? options.admissionSeal
      : undefined;
    if (releaseLock.status === "valid" && activeSeal === undefined) return;
    const page = await readTypedIndexedSpoolPage(
      options.spoolDirectory,
      activeSeal === undefined
        ? undefined
        : {
          indexDev: activeSeal.indexDev,
          indexIno: activeSeal.indexIno,
          prefixBytes: activeSeal.prefixBytes,
        },
    );
    if (page === undefined) return;
    if (
      activeSeal !== undefined
      && (
        page.indexDev !== activeSeal.indexDev
        || page.indexIno !== activeSeal.indexIno
        || activeSeal.prefixBytes > page.indexSize
      )
    ) {
      return;
    }
    const sealedPrefixBytes = activeSeal?.prefixBytes;
    for (const record of page.records) {
      if (budget.remainingFiles === 0 || budget.remainingTransactions === 0) {
        break;
      }
      budget.remainingFiles -= 1;
      const parsed = parseSpoolName(record.basename);
      if (parsed === undefined) continue;
      if (
        record.kind === "writer"
        && sealedPrefixBytes !== undefined
        && record.recordEndOffset <= sealedPrefixBytes
      ) {
        continue;
      }
      const admissionSeal = record.kind === "admission"
        && activeSeal !== undefined
        && sealedPrefixBytes !== undefined
        && record.recordEndOffset <= sealedPrefixBytes
        ? activeSeal
        : undefined;
      if (record.kind === "admission" && admissionSeal === undefined) continue;
      await drainFile(
        options.spoolDirectory,
        record,
        parsed,
        options.databaseSink,
        budget,
        admissionSeal,
      ).catch(() => false);
    }
  } catch {
    // Draining is fail-open; every uncompleted source remains retryable.
  }
}
