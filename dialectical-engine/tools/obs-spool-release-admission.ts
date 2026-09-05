import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  lstat,
  open,
  readdir,
  realpath,
  unlink,
} from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { isSerializedSafeEnvelope } from "../packages/obs-capture/src/envelope-contract.js";
import {
  SPOOL_FILE_MAX_BYTES,
  SPOOL_RECORD_MAX_BYTES,
  type SafeRuntimeName,
} from "../packages/obs-capture/src/safe-metadata.js";
import {
  appendSpoolIndexRecoveryBytes,
  createSpoolAdmissionProof,
  encodeSpoolAdmissionIndexRecord,
  encodeSpoolReleaseLock,
  isIndexedSpoolBasename,
  parseSpoolAdmissionIndexRecord,
  readSpoolReleaseLock,
  SPOOL_CURSOR_NAME,
  SPOOL_INDEX_NAME,
  SPOOL_RELEASE_LOCK_NAME,
  type SpoolReleaseLock,
} from "../packages/obs-capture/src/spool-index.js";
import {
  canonicalFix01ReleaseJson as canonicalJson,
  FIX01_RELEASE_MANIFEST_MAX_BYTES,
  FIX01_RELEASE_MANIFEST_VERSION,
  FIX01_RELEASE_VERIFIER_VERSION,
  type Fix01ReleaseClassification as Classification,
  type Fix01ReleaseManifestEntryV2 as ManifestEntry,
} from "./obs-spool-release-contract.js";

const IMMUTABLE_BUILD_REF = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SPOOL_RUNTIME = /^(api|runner|scheduler|evaluator-lib|ui-client|listener|watchdog|ingest)-/u;
const SPOOL_PID = /^(?:api|runner|scheduler|evaluator-lib|ui-client|listener|watchdog|ingest)-([1-9][0-9]*)-/u;
const INDEX_LINE_MAX_BYTES = 174;
const IO_CHUNK_BYTES = 64 * 1024;
const PROSPECTIVE_STAT_DIGITS = "9".repeat(32);
const PROSPECTIVE_UINT64 = "18446744073709551615";
const PROSPECTIVE_SHA256 = "f".repeat(64);
const PROSPECTIVE_VERIFIED_AT = "9999-12-31T23:59:59.999Z";
const RELEASE_LOCK_STAGE_PREFIX = ".obs-spool-release-lock-stage-v1-";
const RELEASE_LOCK_STAGE_NAME =
  /^\.obs-spool-release-lock-stage-v1-([0-9a-f]{64})$/u;

interface SourceSnapshot {
  readonly entries: readonly ManifestEntry[];
  readonly sha256: string;
}

interface ReadFileResult {
  readonly stat: BigIntStats;
  readonly sha256: string;
}

interface IndexState extends ReadFileResult {
  readonly basenames: ReadonlySet<string>;
  readonly admissionRecords: readonly Readonly<{
    basename: string;
    proof: string;
  }>[];
  readonly unterminatedBasename: string | undefined;
}

interface ReleaseLockStage {
  readonly basename: string;
  readonly path: string;
  readonly admissionRef: string;
  readonly stat: BigIntStats;
}

interface Arguments {
  readonly spoolDirectory: string;
  readonly buildRef: string;
  readonly manifestPath: string;
}

class AdmissionFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AdmissionFailure";
  }
}

function fail(code: string): never {
  throw new AdmissionFailure(code);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string"
    ? error.code
    : undefined;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeNumber(value: bigint, code: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail(code);
  return number;
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameSnapshot(left: BigIntStats, right: BigIntStats): boolean {
  return sameIdentity(left, right)
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function statFields(stat: BigIntStats): Pick<
  ManifestEntry,
  "dev" | "ino" | "nlink" | "size" | "mtime_ms"
  | "mtime_ns" | "ctime_ns"
> {
  return {
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    nlink: safeNumber(stat.nlink, "FAIL_UNREPRESENTABLE_NLINK"),
    size: safeNumber(stat.size, "FAIL_UNREPRESENTABLE_SIZE"),
    mtime_ms: safeNumber(stat.mtimeMs, "FAIL_UNREPRESENTABLE_MTIME"),
    mtime_ns: stat.mtimeNs.toString(),
    ctime_ns: stat.ctimeNs.toString(),
  };
}

function parseArguments(argv: readonly string[]): Arguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined
      || value === undefined
      || !["--spool-dir", "--build-ref", "--manifest"].includes(flag)
      || values.has(flag)
    ) {
      fail("FAIL_ARGUMENTS");
    }
    values.set(flag, value);
  }
  if (values.size !== 3) fail("FAIL_ARGUMENTS");
  const spoolDirectory = values.get("--spool-dir");
  const buildRef = values.get("--build-ref");
  const manifestPath = values.get("--manifest");
  if (
    spoolDirectory === undefined
    || buildRef === undefined
    || manifestPath === undefined
    || !isAbsolute(spoolDirectory)
    || !isAbsolute(manifestPath)
    || !IMMUTABLE_BUILD_REF.test(buildRef)
  ) {
    fail("FAIL_ARGUMENTS");
  }
  return { spoolDirectory, buildRef, manifestPath };
}

function isInside(parent: string, child: string): boolean {
  const fromParent = relative(parent, child);
  return fromParent === ""
    || (!fromParent.startsWith("..") && !isAbsolute(fromParent));
}

async function validatePaths(arguments_: Arguments): Promise<Arguments> {
  const normalizedSpool = resolve(arguments_.spoolDirectory);
  let spoolPathStat: BigIntStats;
  let spoolRealpath: string;
  try {
    spoolPathStat = await lstat(normalizedSpool, { bigint: true });
    spoolRealpath = await realpath(normalizedSpool);
  } catch {
    fail("FAIL_UNSAFE_SPOOL_DIRECTORY");
  }
  if (
    !spoolPathStat.isDirectory()
    || spoolPathStat.isSymbolicLink()
    || spoolRealpath !== normalizedSpool
    || arguments_.spoolDirectory !== normalizedSpool
  ) {
    fail("FAIL_UNSAFE_SPOOL_DIRECTORY");
  }

  const normalizedManifest = resolve(arguments_.manifestPath);
  const normalizedParent = dirname(normalizedManifest);
  let realParent: string;
  try {
    realParent = await realpath(normalizedParent);
  } catch {
    fail("FAIL_UNSAFE_OUTPUT_PATH");
  }
  const physicalManifest = join(realParent, basename(normalizedManifest));
  if (
    arguments_.manifestPath !== normalizedManifest
    || isInside(spoolRealpath, physicalManifest)
  ) {
    fail("FAIL_UNSAFE_OUTPUT_PATH");
  }
  try {
    await lstat(physicalManifest, { bigint: true });
    fail("FAIL_UNSAFE_OUTPUT_PATH");
  } catch (error) {
    if (error instanceof AdmissionFailure) throw error;
    if (errorCode(error) !== "ENOENT") fail("FAIL_UNSAFE_OUTPUT_PATH");
  }
  return {
    spoolDirectory: spoolRealpath,
    buildRef: arguments_.buildRef,
    manifestPath: physicalManifest,
  };
}

async function verifyOpenFile(
  filePath: string,
  beforePath: BigIntStats,
  handle: FileHandle,
): Promise<BigIntStats> {
  const descriptor = await handle.stat({ bigint: true });
  if (
    !descriptor.isFile()
    || descriptor.nlink !== 1n
    || !sameSnapshot(beforePath, descriptor)
  ) {
    fail("FAIL_CHANGED");
  }
  return descriptor;
}

async function verifyAfterRead(
  filePath: string,
  expected: BigIntStats,
  handle: FileHandle,
): Promise<void> {
  let descriptor: BigIntStats;
  let pathStat: BigIntStats;
  try {
    descriptor = await handle.stat({ bigint: true });
    pathStat = await lstat(filePath, { bigint: true });
  } catch {
    fail("FAIL_CHANGED");
  }
  if (
    !descriptor.isFile()
    || !pathStat.isFile()
    || descriptor.nlink !== 1n
    || pathStat.nlink !== 1n
    || !sameSnapshot(expected, descriptor)
    || !sameSnapshot(expected, pathStat)
  ) {
    fail("FAIL_CHANGED");
  }
}

async function readStableFile(
  filePath: string,
  beforePath: BigIntStats,
  consume: (chunk: Buffer) => void,
): Promise<ReadFileResult> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const expected = await verifyOpenFile(filePath, beforePath, handle);
    const digest = createHash("sha256");
    const buffer = Buffer.alloc(IO_CHUNK_BYTES);
    let position = 0;
    while (position < safeNumber(expected.size, "FAIL_UNREPRESENTABLE_SIZE")) {
      const requested = Math.min(buffer.length, Number(expected.size) - position);
      const result = await handle.read(buffer, 0, requested, position);
      if (result.bytesRead <= 0) fail("FAIL_CHANGED");
      const chunk = buffer.subarray(0, result.bytesRead);
      digest.update(chunk);
      consume(chunk);
      position += result.bytesRead;
    }
    const probe = Buffer.alloc(1);
    const trailing = await handle.read(probe, 0, 1, position);
    if (trailing.bytesRead !== 0) fail("FAIL_CHANGED");
    await verifyAfterRead(filePath, expected, handle);
    return { stat: expected, sha256: digest.digest("hex") };
  } catch (error) {
    if (error instanceof AdmissionFailure) throw error;
    throw new AdmissionFailure("FAIL_UNREADABLE_CANDIDATE");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function runtimeFromBasename(name: string): SafeRuntimeName {
  const runtime = SPOOL_RUNTIME.exec(name)?.[1];
  if (runtime === undefined) fail("FAIL_NON_CANONICAL_NAME");
  return runtime as SafeRuntimeName;
}

function pidFromBasename(name: string): number {
  const pid = Number(SPOOL_PID.exec(name)?.[1]);
  if (!Number.isSafeInteger(pid) || pid <= 0) fail("FAIL_UNSAFE_PID");
  return pid;
}

function ownerMayBeAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

async function readCandidate(
  filePath: string,
  name: string,
  pathStat: BigIntStats,
): Promise<ManifestEntry> {
  if ((pathStat.mode & 0o444n) === 0n) fail("FAIL_UNREADABLE_CANDIDATE");
  const runtime = runtimeFromBasename(name);
  const fileWithinCap = pathStat.size <= BigInt(SPOOL_FILE_MAX_BYTES);
  let valid = pathStat.size > 0n && fileWithinCap;
  let lineBytes = 0;
  let lineParts: Buffer[] = [];
  const result = await readStableFile(filePath, pathStat, (chunk) => {
    for (let index = 0; index < chunk.length; index += 1) {
      const byte = chunk[index];
      if (byte !== 0x0a) {
        lineBytes += 1;
        if (lineBytes + 1 <= SPOOL_RECORD_MAX_BYTES && valid) {
          lineParts.push(chunk.subarray(index, index + 1));
        } else {
          valid = false;
          lineParts = [];
        }
        continue;
      }
      if (lineBytes === 0 || lineBytes + 1 > SPOOL_RECORD_MAX_BYTES) {
        valid = false;
      } else if (valid) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(Buffer.concat(lineParts).toString("utf8"));
        } catch {
          valid = false;
          parsed = undefined;
        }
        if (valid && !isSerializedSafeEnvelope(parsed, runtime)) valid = false;
      }
      lineBytes = 0;
      lineParts = [];
    }
  });
  if (lineBytes !== 0) valid = false;
  const classification: Classification = pathStat.size === 0n
    ? "lawful_empty"
    : valid
    ? "lawful_envelopes"
    : "retained_invalid_bytes";
  return {
    basename: name,
    kind: "candidate",
    ...statFields(result.stat),
    sha256: result.sha256,
    classification,
    indexed: false,
    reason: null,
  };
}

function rejectedEntry(
  name: string,
  stat: BigIntStats,
  reason: string,
): ManifestEntry {
  const evidenceName = reason === "NON_CANONICAL_BASENAME"
    ? `noncanonical-name-sha256:${sha256(Buffer.from(name, "utf8"))}`
    : name;
  return {
    basename: evidenceName,
    kind: "rejected_unsafe_path",
    ...statFields(stat),
    sha256: null,
    classification: "rejected_unsafe_path",
    indexed: false,
    reason,
  };
}

function snapshotEvidence(entries: readonly ManifestEntry[]): unknown {
  return entries.map((entry) => ({
    basename: entry.basename,
    classification: entry.classification,
    dev: entry.dev,
    ino: entry.ino,
    kind: entry.kind,
    ctime_ns: entry.ctime_ns,
    mtime_ms: entry.mtime_ms,
    mtime_ns: entry.mtime_ns,
    nlink: entry.nlink,
    sha256: entry.sha256,
    size: entry.size,
  }));
}

async function discoverReleaseLockStage(
  directory: string,
): Promise<ReleaseLockStage | undefined> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    fail("FAIL_UNREADABLE_DIRECTORY");
  }
  const reserved = names.filter((name) =>
    name.startsWith(RELEASE_LOCK_STAGE_PREFIX)
  );
  if (reserved.length === 0) return undefined;
  if (reserved.length !== 1) fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
  const name = reserved[0]!;
  const match = RELEASE_LOCK_STAGE_NAME.exec(name);
  if (match === null) fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
  const path = join(directory, name);
  let stat: BigIntStats;
  try {
    stat = await lstat(path, { bigint: true });
  } catch {
    fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
  }
  if (!stat.isFile() || (stat.nlink !== 1n && stat.nlink !== 2n)) {
    fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
  }
  return Object.freeze({
    basename: name,
    path,
    admissionRef: match[1]!,
    stat,
  });
}

async function sourceSnapshot(
  directory: string,
  probeOwners: boolean,
  releaseStageName: string | undefined,
): Promise<SourceSnapshot> {
  let names: string[];
  try {
    names = (await readdir(directory)).sort();
  } catch {
    fail("FAIL_UNREADABLE_DIRECTORY");
  }
  if (new Set(names).size !== names.length) fail("FAIL_DUPLICATE_NAME");
  const entries: ManifestEntry[] = [];
  for (const name of names) {
    if (name.startsWith(RELEASE_LOCK_STAGE_PREFIX)) {
      if (name !== releaseStageName) fail("FAIL_CHANGED");
      continue;
    }
    if (
      name === SPOOL_INDEX_NAME
      || name === SPOOL_CURSOR_NAME
      || name === SPOOL_RELEASE_LOCK_NAME
    ) continue;
    const filePath = join(directory, name);
    let pathStat: BigIntStats;
    try {
      pathStat = await lstat(filePath, { bigint: true });
    } catch {
      fail("FAIL_CHANGED");
    }
    if (
      isIndexedSpoolBasename(name)
      && pathStat.isFile()
      && pathStat.nlink === 1n
    ) {
      if (probeOwners && ownerMayBeAlive(pidFromBasename(name))) {
        fail("FAIL_LIVE_OWNER");
      }
      entries.push(await readCandidate(filePath, name, pathStat));
      continue;
    }
    const reason = !isIndexedSpoolBasename(name)
      ? "NON_CANONICAL_BASENAME"
      : pathStat.isSymbolicLink()
      ? "SYMLINK"
      : !pathStat.isFile()
      ? "NOT_REGULAR_FILE"
      : "HARDLINK";
    entries.push(rejectedEntry(name, pathStat, reason));
  }
  entries.sort((left, right) =>
    left.basename < right.basename ? -1 : left.basename > right.basename ? 1 : 0
  );
  const frozen = Object.freeze(entries);
  return {
    entries: frozen,
    sha256: sha256(canonicalJson(snapshotEvidence(frozen))),
  };
}

async function readIndex(
  directory: string,
  options: Readonly<{
    basePrefixBytes: number;
    plannedAppend?: Buffer;
  }> | undefined = undefined,
): Promise<IndexState | undefined> {
  const filePath = join(directory, SPOOL_INDEX_NAME);
  let pathStat: BigIntStats;
  try {
    pathStat = await lstat(filePath, { bigint: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    fail("FAIL_UNSAFE_INDEX");
  }
  if (!pathStat.isFile() || pathStat.nlink !== 1n) fail("FAIL_UNSAFE_INDEX");
  const basenames = new Set<string>();
  const admissionRecords: Array<Readonly<{ basename: string; proof: string }>> = [];
  let line = Buffer.alloc(0);
  let overlong = false;
  const fileSize = safeNumber(pathStat.size, "FAIL_UNREPRESENTABLE_SIZE");
  const basePrefixBytes = options?.basePrefixBytes ?? fileSize;
  if (
    !Number.isSafeInteger(basePrefixBytes)
    || basePrefixBytes < 0
    || basePrefixBytes > fileSize
    || (
      options?.plannedAppend !== undefined
      && fileSize - basePrefixBytes > options.plannedAppend.length
    )
  ) {
    fail("FAIL_RELEASE_LOCK_PLAN");
  }
  let streamOffset = 0;
  let suffixMatches = true;
  const result = await readStableFile(filePath, pathStat, (chunk) => {
    const chunkStart = streamOffset;
    const chunkEnd = chunkStart + chunk.length;
    const prefixEnd = Math.max(
      0,
      Math.min(chunk.length, basePrefixBytes - chunkStart),
    );
    for (let index = 0; index < prefixEnd; index += 1) {
      const byte = chunk[index];
      if (byte === 0x0a) {
        if (!overlong && line.length > 0) {
          const candidate = line.toString("utf8");
          if (isIndexedSpoolBasename(candidate)) {
            basenames.add(candidate);
          } else {
            const admission = parseSpoolAdmissionIndexRecord(candidate);
            if (admission !== undefined) admissionRecords.push(admission);
          }
        }
        line = Buffer.alloc(0);
        overlong = false;
        continue;
      }
      if (!overlong) {
        if (line.length >= INDEX_LINE_MAX_BYTES) {
          line = Buffer.alloc(0);
          overlong = true;
        } else {
          line = Buffer.concat([line, chunk.subarray(index, index + 1)]);
        }
      }
    }
    if (options?.plannedAppend !== undefined && chunkEnd > basePrefixBytes) {
      const suffixStartInChunk = Math.max(0, basePrefixBytes - chunkStart);
      const suffixStartInPlan = Math.max(0, chunkStart - basePrefixBytes);
      const observed = chunk.subarray(suffixStartInChunk);
      const expected = options.plannedAppend.subarray(
        suffixStartInPlan,
        suffixStartInPlan + observed.length,
      );
      if (!observed.equals(expected)) suffixMatches = false;
    }
    streamOffset = chunkEnd;
  });
  if (!suffixMatches) fail("FAIL_RELEASE_LOCK_PLAN");
  const unterminatedBasename = !overlong && line.length > 0
    && isIndexedSpoolBasename(line.toString("utf8"))
    ? line.toString("utf8")
    : undefined;
  return {
    ...result,
    basenames,
    admissionRecords: Object.freeze(admissionRecords),
    unterminatedBasename,
  };
}

async function readReserved(
  directory: string,
  name: typeof SPOOL_CURSOR_NAME,
): Promise<ReadFileResult | undefined> {
  const filePath = join(directory, name);
  let pathStat: BigIntStats;
  try {
    pathStat = await lstat(filePath, { bigint: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    fail("FAIL_UNSAFE_CURSOR");
  }
  if (!pathStat.isFile() || pathStat.nlink !== 1n) fail("FAIL_UNSAFE_CURSOR");
  return readStableFile(filePath, pathStat, () => undefined).catch((error) => {
    if (error instanceof AdmissionFailure && error.code === "FAIL_CHANGED") {
      fail("FAIL_CHANGED");
    }
    fail("FAIL_UNSAFE_CURSOR");
  });
}

async function createEmptyIndex(directory: string): Promise<void> {
  const filePath = join(directory, SPOOL_INDEX_NAME);
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      filePath,
      constants.O_CREAT
        | constants.O_EXCL
        | constants.O_NOFOLLOW
        | constants.O_RDWR,
      0o600,
    );
    const descriptor = await handle.stat({ bigint: true });
    const pathStat = await lstat(filePath, { bigint: true });
    if (
      !descriptor.isFile()
      || !pathStat.isFile()
      || descriptor.nlink !== 1n
      || pathStat.nlink !== 1n
      || !sameIdentity(descriptor, pathStat)
    ) {
      fail("FAIL_UNSAFE_INDEX");
    }
    await handle.sync();
  } catch (error) {
    if (error instanceof AdmissionFailure) throw error;
    if (errorCode(error) !== "EEXIST") fail("FAIL_UNSAFE_INDEX");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function plannedIndexAppend(
  source: SourceSnapshot,
  index: IndexState | undefined,
  admissionRef: string,
): Buffer {
  const parts: Buffer[] = [];
  const candidates = source.entries.filter((entry) => entry.kind === "candidate");
  const completedTail = index?.unterminatedBasename;
  if (
    completedTail !== undefined
    && index?.basenames.has(completedTail)
    && candidates.some((candidate) => candidate.basename === completedTail)
  ) {
    fail("FAIL_INDEX_RECORD_DUPLICATE");
  }
  if (
    completedTail !== undefined
    && !index?.basenames.has(completedTail)
    && candidates.some((candidate) => candidate.basename === completedTail)
  ) {
    parts.push(Buffer.from("\n", "utf8"));
  }
  for (const candidate of candidates) {
    if (
      !index?.basenames.has(candidate.basename)
      && candidate.basename !== completedTail
    ) {
      parts.push(Buffer.from(`\n${candidate.basename}\n`, "utf8"));
    }
  }
  for (const candidate of candidates) {
    const proof = admissionProofForEntry(admissionRef, candidate);
    const matches = index?.admissionRecords.filter((record) =>
      record.basename === candidate.basename && record.proof === proof
    ).length ?? 0;
    if (matches > 1) fail("FAIL_ADMISSION_RECORD_DUPLICATE");
    if (matches === 0) {
      const record = encodeSpoolAdmissionIndexRecord({
        basename: candidate.basename,
        proof,
      });
      parts.push(Buffer.from(`\n${record}\n`, "utf8"));
    }
  }
  return Buffer.concat(parts);
}

function releasePlan(
  source: SourceSnapshot,
  baseIndex: IndexState | undefined,
  admissionRef: string,
  basePrefixBytes: number,
): Readonly<{
  bytes: Buffer;
  basePrefixBytes: number;
  plannedAppendBytes: number;
  plannedAppendSha256: string;
  finalPrefixBytes: number;
}> {
  const bytes = plannedIndexAppend(source, baseIndex, admissionRef);
  const finalPrefixBytes = basePrefixBytes + bytes.length;
  if (
    bytes.length <= 0
    || !Number.isSafeInteger(finalPrefixBytes)
    || finalPrefixBytes <= 0
  ) {
    fail("FAIL_RELEASE_LOCK_PLAN");
  }
  return Object.freeze({
    bytes,
    basePrefixBytes,
    plannedAppendBytes: bytes.length,
    plannedAppendSha256: sha256(bytes),
    finalPrefixBytes,
  });
}

type ReleaseLockOptions = Readonly<{
  readonly directory: string;
  readonly admissionRef: string;
  readonly indexDev: string;
  readonly indexIno: string;
  readonly basePrefixBytes: number;
  readonly plannedAppendBytes: number;
  readonly plannedAppendSha256: string;
  readonly finalPrefixBytes: number;
}>;

function releaseLockMatchesOptions(
  lock: SpoolReleaseLock,
  options: ReleaseLockOptions,
): boolean {
  return lock.admissionRef === options.admissionRef
    && lock.indexDev === options.indexDev
    && lock.indexIno === options.indexIno
    && lock.basePrefixBytes === options.basePrefixBytes
    && lock.plannedAppendBytes === options.plannedAppendBytes
    && lock.plannedAppendSha256 === options.plannedAppendSha256
    && lock.finalPrefixBytes === options.finalPrefixBytes;
}

async function createReleaseLockStage(
  options: ReleaseLockOptions,
): Promise<ReleaseLockStage> {
  const basename = `${RELEASE_LOCK_STAGE_PREFIX}${options.admissionRef}`;
  const path = join(options.directory, basename);
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      path,
      constants.O_CREAT
        | constants.O_EXCL
        | constants.O_NOFOLLOW
        | constants.O_RDWR,
      0o600,
    );
    const descriptor = await handle.stat({ bigint: true });
    const pathStat = await lstat(path, { bigint: true });
    if (
      !descriptor.isFile()
      || !pathStat.isFile()
      || descriptor.nlink !== 1n
      || pathStat.nlink !== 1n
      || !sameSnapshot(descriptor, pathStat)
    ) {
      fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
    }
    return Object.freeze({
      basename,
      path,
      admissionRef: options.admissionRef,
      stat: descriptor,
    });
  } catch (error) {
    if (error instanceof AdmissionFailure) throw error;
    fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
  } finally {
    await handle?.close().catch(() => undefined);
  }
  fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
}

async function completeReleaseLockStage(
  stage: ReleaseLockStage,
  expectedBytes: Buffer,
): Promise<BigIntStats> {
  let handle: FileHandle | undefined;
  try {
    const before = await lstat(stage.path, { bigint: true });
    if (
      !before.isFile()
      || before.nlink !== 1n
      || !sameSnapshot(stage.stat, before)
      || before.size > BigInt(expectedBytes.length)
    ) {
      fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
    }
    handle = await open(
      stage.path,
      constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const descriptor = await handle.stat({ bigint: true });
    if (
      !descriptor.isFile()
      || descriptor.nlink !== 1n
      || !sameSnapshot(before, descriptor)
    ) {
      fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
    }
    const retainedBytes = safeNumber(
      descriptor.size,
      "FAIL_UNSAFE_RELEASE_LOCK_STAGE",
    );
    const retained = Buffer.alloc(retainedBytes);
    if (retainedBytes > 0) {
      const read = await handle.read(retained, 0, retained.length, 0);
      if (read.bytesRead !== retained.length) fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
    }
    if (!retained.equals(expectedBytes.subarray(0, retainedBytes))) {
      fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
    }
    const missing = expectedBytes.subarray(retainedBytes);
    if (missing.length > 0) {
      const written = await handle.write(missing, 0, missing.length, retainedBytes);
      if (written.bytesWritten !== missing.length) fail("FAIL_RELEASE_LOCK_WRITE");
    }
    await handle.sync();
    const finalDescriptor = await handle.stat({ bigint: true });
    const finalPath = await lstat(stage.path, { bigint: true });
    if (
      !finalDescriptor.isFile()
      || !finalPath.isFile()
      || finalDescriptor.nlink !== 1n
      || finalPath.nlink !== 1n
      || finalDescriptor.size !== BigInt(expectedBytes.length)
      || !sameSnapshot(finalDescriptor, finalPath)
      || !sameIdentity(descriptor, finalDescriptor)
    ) {
      fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
    }
    const observed = Buffer.alloc(expectedBytes.length);
    const read = await handle.read(observed, 0, observed.length, 0);
    if (read.bytesRead !== observed.length || !observed.equals(expectedBytes)) {
      fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
    }
    return finalDescriptor;
  } catch (error) {
    if (error instanceof AdmissionFailure) throw error;
    fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
  } finally {
    await handle?.close().catch(() => undefined);
  }
  fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
}

async function verifyPublishedReleaseLockPair(options: {
  readonly directory: string;
  readonly stage: ReleaseLockStage;
  readonly expectedStage: BigIntStats;
  readonly expectedBytes: Buffer;
}): Promise<void> {
  const finalPath = join(options.directory, SPOOL_RELEASE_LOCK_NAME);
  let handle: FileHandle | undefined;
  try {
    const stagePath = await lstat(options.stage.path, { bigint: true });
    const authorityPath = await lstat(finalPath, { bigint: true });
    if (
      !stagePath.isFile()
      || !authorityPath.isFile()
      || stagePath.nlink !== 2n
      || authorityPath.nlink !== 2n
      || stagePath.size !== BigInt(options.expectedBytes.length)
      || !sameIdentity(stagePath, authorityPath)
      || !sameIdentity(stagePath, options.expectedStage)
    ) {
      fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
    }
    handle = await open(
      options.stage.path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const descriptor = await handle.stat({ bigint: true });
    if (
      !descriptor.isFile()
      || descriptor.nlink !== 2n
      || !sameSnapshot(stagePath, descriptor)
    ) {
      fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
    }
    const observed = Buffer.alloc(options.expectedBytes.length);
    const read = await handle.read(observed, 0, observed.length, 0);
    const probe = Buffer.alloc(1);
    const trailing = await handle.read(probe, 0, 1, observed.length);
    if (
      read.bytesRead !== observed.length
      || trailing.bytesRead !== 0
      || !observed.equals(options.expectedBytes)
    ) {
      fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
    }
    const finalDescriptor = await handle.stat({ bigint: true });
    const finalStagePath = await lstat(options.stage.path, { bigint: true });
    const finalAuthorityPath = await lstat(finalPath, { bigint: true });
    if (
      !sameSnapshot(descriptor, finalDescriptor)
      || !sameSnapshot(descriptor, finalStagePath)
      || !sameSnapshot(descriptor, finalAuthorityPath)
    ) {
      fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
    }
  } catch (error) {
    if (error instanceof AdmissionFailure) throw error;
    fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function syncDirectory(directory: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    const before = await lstat(directory, { bigint: true });
    handle = await open(
      directory,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY,
    );
    const descriptor = await handle.stat({ bigint: true });
    if (
      !before.isDirectory()
      || before.isSymbolicLink()
      || !descriptor.isDirectory()
      || !sameIdentity(before, descriptor)
    ) {
      fail("FAIL_RELEASE_LOCK_DIRECTORY_SYNC");
    }
    await handle.sync();
    const afterDescriptor = await handle.stat({ bigint: true });
    const afterPath = await lstat(directory, { bigint: true });
    if (
      !afterDescriptor.isDirectory()
      || !afterPath.isDirectory()
      || afterPath.isSymbolicLink()
      || !sameIdentity(descriptor, afterDescriptor)
      || !sameIdentity(descriptor, afterPath)
    ) {
      fail("FAIL_RELEASE_LOCK_DIRECTORY_SYNC");
    }
  } catch (error) {
    if (error instanceof AdmissionFailure) throw error;
    fail("FAIL_RELEASE_LOCK_DIRECTORY_SYNC");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function finishPublishedReleaseLock(options: {
  readonly lockOptions: ReleaseLockOptions;
  readonly stage: ReleaseLockStage;
  readonly expectedStage: BigIntStats;
  readonly expectedBytes: Buffer;
}): Promise<SpoolReleaseLock> {
  await verifyPublishedReleaseLockPair({
    directory: options.lockOptions.directory,
    stage: options.stage,
    expectedStage: options.expectedStage,
    expectedBytes: options.expectedBytes,
  });
  await syncDirectory(options.lockOptions.directory);
  await verifyPublishedReleaseLockPair({
    directory: options.lockOptions.directory,
    stage: options.stage,
    expectedStage: options.expectedStage,
    expectedBytes: options.expectedBytes,
  });
  try {
    await unlink(options.stage.path);
  } catch {
    fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
  }
  await syncDirectory(options.lockOptions.directory);
  const observed = await readSpoolReleaseLock(options.lockOptions.directory);
  if (
    observed.status !== "valid"
    || !releaseLockMatchesOptions(observed.lock, options.lockOptions)
    || observed.lock.dev !== options.expectedStage.dev.toString()
    || observed.lock.ino !== options.expectedStage.ino.toString()
  ) {
    fail("FAIL_UNSAFE_RELEASE_LOCK");
  }
  return observed.lock;
}

async function prepareReleaseLock(options: {
  readonly directory: string;
  readonly observed: Awaited<ReturnType<typeof readSpoolReleaseLock>>;
  readonly stage: ReleaseLockStage | undefined;
  readonly admissionRef: string;
  readonly indexDev: string;
  readonly indexIno: string;
  readonly basePrefixBytes: number;
  readonly plannedAppendBytes: number;
  readonly plannedAppendSha256: string;
  readonly finalPrefixBytes: number;
}): Promise<SpoolReleaseLock> {
  if (options.observed.status === "valid") {
    if (options.stage !== undefined) fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
    if (!releaseLockMatchesOptions(options.observed.lock, options)) {
      fail("FAIL_RELEASE_LOCK_PLAN");
    }
    return options.observed.lock;
  }
  const expectedBytes = encodeSpoolReleaseLock(options);
  if (options.observed.status === "invalid") {
    if (
      options.stage === undefined
      || options.stage.admissionRef !== options.admissionRef
      || options.stage.stat.nlink !== 2n
      || options.stage.stat.size !== BigInt(expectedBytes.length)
    ) {
      fail("FAIL_UNSAFE_RELEASE_LOCK");
    }
    return finishPublishedReleaseLock({
      lockOptions: options,
      stage: options.stage,
      expectedStage: options.stage.stat,
      expectedBytes,
    });
  }
  let stage = options.stage;
  if (stage === undefined) {
    stage = await createReleaseLockStage(options);
  } else if (
    stage.admissionRef !== options.admissionRef
    || stage.stat.nlink !== 1n
  ) {
    fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
  }
  const completeStage = await completeReleaseLockStage(stage, expectedBytes);
  const finalPath = join(options.directory, SPOOL_RELEASE_LOCK_NAME);
  try {
    await link(stage.path, finalPath);
  } catch {
    fail("FAIL_UNSAFE_RELEASE_LOCK");
  }
  return finishPublishedReleaseLock({
    lockOptions: options,
    stage,
    expectedStage: completeStage,
    expectedBytes,
  });
}

function sameReleaseLock(
  left: SpoolReleaseLock,
  right: SpoolReleaseLock,
): boolean {
  return left.admissionRef === right.admissionRef
    && left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.sha256 === right.sha256
    && left.indexDev === right.indexDev
    && left.indexIno === right.indexIno
    && left.basePrefixBytes === right.basePrefixBytes
    && left.plannedAppendBytes === right.plannedAppendBytes
    && left.plannedAppendSha256 === right.plannedAppendSha256
    && left.finalPrefixBytes === right.finalPrefixBytes;
}

async function syncReleaseLockDirectory(
  directory: string,
  expectedLock: SpoolReleaseLock,
): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    const before = await lstat(directory, { bigint: true });
    handle = await open(
      directory,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY,
    );
    const descriptor = await handle.stat({ bigint: true });
    if (
      !before.isDirectory()
      || before.isSymbolicLink()
      || !descriptor.isDirectory()
      || !sameIdentity(before, descriptor)
    ) {
      fail("FAIL_RELEASE_LOCK_DIRECTORY_SYNC");
    }
    await handle.sync();
    const afterDescriptor = await handle.stat({ bigint: true });
    const afterPath = await lstat(directory, { bigint: true });
    if (
      !afterDescriptor.isDirectory()
      || !afterPath.isDirectory()
      || afterPath.isSymbolicLink()
      || !sameIdentity(descriptor, afterDescriptor)
      || !sameIdentity(descriptor, afterPath)
    ) {
      fail("FAIL_RELEASE_LOCK_DIRECTORY_SYNC");
    }
    const observedLock = await readSpoolReleaseLock(directory);
    if (
      observedLock.status !== "valid"
      || !sameReleaseLock(expectedLock, observedLock.lock)
    ) {
      fail("FAIL_UNSAFE_RELEASE_LOCK");
    }
  } catch (error) {
    if (error instanceof AdmissionFailure) throw error;
    fail("FAIL_RELEASE_LOCK_DIRECTORY_SYNC");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function admissionProofForEntry(
  admissionRef: string,
  entry: ManifestEntry,
): string {
  if (
    entry.kind !== "candidate"
    || entry.dev === null
    || entry.ino === null
    || entry.nlink !== 1
    || entry.size === null
    || entry.mtime_ns === null
    || entry.ctime_ns === null
    || entry.sha256 === null
  ) {
    fail("FAIL_ADMISSION_PROOF");
  }
  try {
    return createSpoolAdmissionProof({
      admissionRef,
      basename: entry.basename,
      dev: entry.dev,
      ino: entry.ino,
      nlink: "1",
      size: String(entry.size),
      mtimeNs: entry.mtime_ns,
      ctimeNs: entry.ctime_ns,
      sourceSha256: entry.sha256,
    });
  } catch {
    fail("FAIL_ADMISSION_PROOF");
  }
}

function countCurrentAdmissionRecords(
  source: SourceSnapshot,
  index: IndexState,
  admissionRef: string,
): number {
  let count = 0;
  for (const candidate of source.entries.filter((entry) =>
    entry.kind === "candidate"
  )) {
    const expectedProof = admissionProofForEntry(admissionRef, candidate);
    const matches = index.admissionRecords.filter((record) =>
      record.basename === candidate.basename && record.proof === expectedProof
    ).length;
    if (matches > 1) fail("FAIL_ADMISSION_RECORD_DUPLICATE");
    count += matches;
  }
  return count;
}

function assertNoRejectedIndexMembers(
  source: SourceSnapshot,
  index: IndexState | undefined,
): void {
  if (index === undefined) return;
  const rejectedCanonical = new Set(source.entries
    .filter((entry) =>
      entry.kind === "rejected_unsafe_path"
      && isIndexedSpoolBasename(entry.basename)
    )
    .map((entry) => entry.basename));
  for (const rejected of rejectedCanonical) {
    if (
      index.basenames.has(rejected)
      || index.unterminatedBasename === rejected
    ) {
      fail("FAIL_UNSAFE_INDEX_MEMBER");
    }
  }
}

async function revalidateIndex(
  directory: string,
  expected: IndexState | undefined,
): Promise<IndexState | undefined> {
  const observed = await readIndex(directory);
  if ((expected === undefined) !== (observed === undefined)) fail("FAIL_CHANGED");
  if (
    expected !== undefined
    && observed !== undefined
    && (
      !sameSnapshot(expected.stat, observed.stat)
      || expected.sha256 !== observed.sha256
    )
  ) {
    fail("FAIL_CHANGED");
  }
  return observed;
}

function reservedManifestEntry(
  name: typeof SPOOL_INDEX_NAME | typeof SPOOL_CURSOR_NAME,
  file: ReadFileResult,
): ManifestEntry {
  return {
    basename: name,
    kind: "reserved",
    ...statFields(file.stat),
    sha256: file.sha256,
    classification: "reserved_metadata",
    indexed: false,
    reason: null,
  };
}

function prospectiveReservedEntry(
  name: typeof SPOOL_INDEX_NAME,
  size: number,
): ManifestEntry {
  return {
    basename: name,
    kind: "reserved",
    dev: PROSPECTIVE_STAT_DIGITS,
    ino: PROSPECTIVE_STAT_DIGITS,
    nlink: 1,
    size,
    mtime_ms: Number.MAX_SAFE_INTEGER,
    mtime_ns: PROSPECTIVE_STAT_DIGITS,
    ctime_ns: PROSPECTIVE_STAT_DIGITS,
    sha256: PROSPECTIVE_SHA256,
    classification: "reserved_metadata",
    indexed: false,
    reason: null,
  };
}

function assertProspectiveManifestWithinLimit(options: {
  readonly arguments: Arguments;
  readonly source: SourceSnapshot;
  readonly cursor: ReadFileResult | undefined;
  readonly physicallyEmpty: boolean;
  readonly admissionRef: string;
  readonly releasePlan: Readonly<{
    basePrefixBytes: number;
    plannedAppendBytes: number;
    plannedAppendSha256: string;
    finalPrefixBytes: number;
  }> | undefined;
  readonly initialIndex: IndexState | undefined;
}): void {
  const sourceEntries = options.source.entries.map((entry): ManifestEntry => ({
    ...entry,
    indexed: entry.kind === "candidate",
  }));
  const candidateCount = sourceEntries.filter((entry) =>
    entry.kind === "candidate"
  ).length;
  const lawfulCount = sourceEntries.filter((entry) =>
    entry.classification === "lawful_empty"
    || entry.classification === "lawful_envelopes"
  ).length;
  const rejectedCount = sourceEntries.filter((entry) =>
    entry.kind === "rejected_unsafe_path"
  ).length;
  const prospectiveIndexSize = options.physicallyEmpty
    ? undefined
    : options.releasePlan?.finalPrefixBytes
      ?? (options.initialIndex === undefined
        ? 0
        : safeNumber(options.initialIndex.stat.size, "FAIL_UNREPRESENTABLE_SIZE"));
  const entries = [
    ...sourceEntries,
    ...(prospectiveIndexSize === undefined
      ? []
      : [prospectiveReservedEntry(SPOOL_INDEX_NAME, prospectiveIndexSize)]),
    ...(options.cursor === undefined
      ? []
      : [reservedManifestEntry(SPOOL_CURSOR_NAME, options.cursor)]),
  ].sort((left, right) =>
    left.basename < right.basename ? -1 : left.basename > right.basename ? 1 : 0
  );
  const prospectiveLock = options.releasePlan === undefined
    ? null
    : {
      basename: SPOOL_RELEASE_LOCK_NAME,
      version: 2,
      admission_ref: options.admissionRef,
      dev: PROSPECTIVE_STAT_DIGITS,
      ino: PROSPECTIVE_STAT_DIGITS,
      nlink: 1,
      size: encodeSpoolReleaseLock({
        admissionRef: options.admissionRef,
        indexDev: PROSPECTIVE_UINT64,
        indexIno: PROSPECTIVE_UINT64,
        basePrefixBytes: options.releasePlan.basePrefixBytes,
        plannedAppendBytes: options.releasePlan.plannedAppendBytes,
        plannedAppendSha256: options.releasePlan.plannedAppendSha256,
        finalPrefixBytes: options.releasePlan.finalPrefixBytes,
      }).length,
      sha256: PROSPECTIVE_SHA256,
      index_dev: PROSPECTIVE_STAT_DIGITS,
      index_ino: PROSPECTIVE_STAT_DIGITS,
      base_prefix_bytes: options.releasePlan.basePrefixBytes,
      planned_append_bytes: options.releasePlan.plannedAppendBytes,
      planned_append_sha256: options.releasePlan.plannedAppendSha256,
      final_prefix_bytes: options.releasePlan.finalPrefixBytes,
    } as const;
  const prospectiveManifest = {
    version: FIX01_RELEASE_MANIFEST_VERSION,
    verdict: options.physicallyEmpty ? "PASS_EMPTY" : "PASS_INDEXED",
    phase: "before_first_indexed_launch",
    spool_directory_realpath: options.arguments.spoolDirectory,
    target_build_ref: options.arguments.buildRef,
    verified_at: PROSPECTIVE_VERIFIED_AT,
    verifier_version: FIX01_RELEASE_VERIFIER_VERSION,
    admission_ref: options.admissionRef,
    admission_record_count: candidateCount,
    first_snapshot_sha256: options.source.sha256,
    second_snapshot_sha256: options.source.sha256,
    source_entry_count: sourceEntries.length,
    candidate_count: candidateCount,
    lawful_count: lawfulCount,
    indexed_candidate_count: candidateCount,
    rejected_count: rejectedCount,
    requires_v_review: rejectedCount > 0,
    entries,
    index: prospectiveIndexSize === undefined
      ? null
      : {
        basename: SPOOL_INDEX_NAME,
        dev: PROSPECTIVE_STAT_DIGITS,
        ino: PROSPECTIVE_STAT_DIGITS,
        nlink: 1,
        size: prospectiveIndexSize,
        sha256: PROSPECTIVE_SHA256,
        covered_lawful_count: lawfulCount,
      },
    release_lock: prospectiveLock,
  } as const;
  if (
    Buffer.byteLength(canonicalJson(prospectiveManifest), "utf8")
      > FIX01_RELEASE_MANIFEST_MAX_BYTES
  ) {
    fail("FAIL_MANIFEST_TOO_LARGE");
  }
}

async function writeManifest(path: string, bytes: Buffer): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      path,
      constants.O_CREAT
        | constants.O_EXCL
        | constants.O_NOFOLLOW
        | constants.O_RDWR,
      0o600,
    );
    const original = await handle.stat({ bigint: true });
    const pathStat = await lstat(path, { bigint: true });
    if (
      !original.isFile()
      || original.nlink !== 1n
      || !pathStat.isFile()
      || pathStat.nlink !== 1n
      || !sameIdentity(original, pathStat)
    ) {
      fail("FAIL_UNSAFE_OUTPUT_PATH");
    }
    let position = 0;
    while (position < bytes.length) {
      const result = await handle.write(bytes, position, bytes.length - position, position);
      if (result.bytesWritten <= 0) fail("FAIL_MANIFEST_WRITE");
      position += result.bytesWritten;
    }
    await handle.sync();
    const finalStat = await handle.stat({ bigint: true });
    const finalPathStat = await lstat(path, { bigint: true });
    if (
      finalStat.nlink !== 1n
      || finalPathStat.nlink !== 1n
      || !sameIdentity(finalStat, original)
      || !sameIdentity(finalPathStat, original)
      || finalStat.size !== BigInt(bytes.length)
    ) {
      fail("FAIL_UNSAFE_OUTPUT_PATH");
    }
    const observed = Buffer.alloc(bytes.length);
    let readPosition = 0;
    while (readPosition < bytes.length) {
      const result = await handle.read(
        observed,
        readPosition,
        bytes.length - readPosition,
        readPosition,
      );
      if (result.bytesRead <= 0) fail("FAIL_MANIFEST_WRITE");
      readPosition += result.bytesRead;
    }
    if (!observed.equals(bytes)) fail("FAIL_MANIFEST_WRITE");
  } catch (error) {
    if (error instanceof AdmissionFailure) throw error;
    fail("FAIL_UNSAFE_OUTPUT_PATH");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function run(arguments_: Arguments): Promise<Readonly<{
  verdict: "PASS_EMPTY" | "PASS_INDEXED";
  manifestSha256: string;
}>> {
  const options = await validatePaths(arguments_);
  const initialReleaseStage = await discoverReleaseLockStage(options.spoolDirectory);
  const initialReleaseLock = await readSpoolReleaseLock(options.spoolDirectory);
  if (
    initialReleaseStage !== undefined
    && (
      initialReleaseLock.status === "valid"
      || (
        initialReleaseLock.status === "absent"
        && initialReleaseStage.stat.nlink !== 1n
      )
      || (
        initialReleaseLock.status === "invalid"
        && initialReleaseStage.stat.nlink !== 2n
      )
    )
  ) {
    fail("FAIL_UNSAFE_RELEASE_LOCK_STAGE");
  }
  const admissionRef = initialReleaseLock.status === "valid"
    ? initialReleaseLock.lock.admissionRef
    : initialReleaseStage?.admissionRef
      ?? randomBytes(32).toString("hex");
  const initialIndex = await readIndex(
    options.spoolDirectory,
    initialReleaseLock.status === "valid"
      ? { basePrefixBytes: initialReleaseLock.lock.basePrefixBytes }
      : undefined,
  );
  const initialCursor = await readReserved(options.spoolDirectory, SPOOL_CURSOR_NAME);
  const first = await sourceSnapshot(
    options.spoolDirectory,
    true,
    initialReleaseStage?.basename,
  );
  const physicallyEmpty = first.entries.length === 0
    && initialIndex === undefined
    && initialCursor === undefined
    && initialReleaseLock.status === "absent"
    && initialReleaseStage === undefined;
  const firstCandidates = first.entries.filter((entry) =>
    entry.kind === "candidate"
  );

  let finalIndex: IndexState | undefined;
  let releaseLock: SpoolReleaseLock | undefined;
  if (
    initialReleaseLock.status === "invalid"
    && initialReleaseStage === undefined
  ) {
    fail("FAIL_UNSAFE_RELEASE_LOCK");
  }
  if (
    firstCandidates.length === 0
    && (
      initialReleaseLock.status !== "absent"
      || initialReleaseStage !== undefined
    )
  ) {
    fail("FAIL_RELEASE_LOCK_ORPHANED");
  }
  assertNoRejectedIndexMembers(first, initialIndex);

  let baseIndex = initialIndex;
  let plan: ReturnType<typeof releasePlan> | undefined;
  if (firstCandidates.length > 0) {
    if (initialReleaseLock.status === "valid") {
      if (
        initialIndex === undefined
        || initialIndex.stat.dev.toString() !== initialReleaseLock.lock.indexDev
        || initialIndex.stat.ino.toString() !== initialReleaseLock.lock.indexIno
      ) {
        fail("FAIL_RELEASE_LOCK_PLAN");
      }
      baseIndex = initialIndex;
      if (baseIndex === undefined) fail("FAIL_RELEASE_LOCK_PLAN");
      assertNoRejectedIndexMembers(first, baseIndex);
      plan = releasePlan(
        first,
        baseIndex,
        admissionRef,
        initialReleaseLock.lock.basePrefixBytes,
      );
      if (
        initialReleaseLock.lock.plannedAppendBytes !== plan.plannedAppendBytes
        || initialReleaseLock.lock.plannedAppendSha256
          !== plan.plannedAppendSha256
        || initialReleaseLock.lock.finalPrefixBytes !== plan.finalPrefixBytes
        || safeNumber(initialIndex.stat.size, "FAIL_UNREPRESENTABLE_SIZE")
          < plan.basePrefixBytes
        || safeNumber(initialIndex.stat.size, "FAIL_UNREPRESENTABLE_SIZE")
          > plan.finalPrefixBytes
      ) {
        fail("FAIL_RELEASE_LOCK_PLAN");
      }
      baseIndex = await readIndex(options.spoolDirectory, {
        basePrefixBytes: plan.basePrefixBytes,
        plannedAppend: plan.bytes,
      });
      if (baseIndex === undefined) fail("FAIL_RELEASE_LOCK_PLAN");
    } else {
      const basePrefixBytes = initialIndex === undefined
        ? 0
        : safeNumber(initialIndex.stat.size, "FAIL_UNREPRESENTABLE_SIZE");
      plan = releasePlan(first, initialIndex, admissionRef, basePrefixBytes);
    }
  }
  assertProspectiveManifestWithinLimit({
    arguments: options,
    source: first,
    cursor: initialCursor,
    physicallyEmpty,
    admissionRef,
    releasePlan: plan,
    initialIndex,
  });
  if (firstCandidates.length > 0) {
    if (plan === undefined) fail("FAIL_RELEASE_LOCK_PLAN");
    if (initialReleaseLock.status === "absent" && baseIndex === undefined) {
      await createEmptyIndex(options.spoolDirectory);
      baseIndex = await readIndex(options.spoolDirectory);
      if (baseIndex === undefined) fail("FAIL_INDEX_REPAIR");
      const exactPlan = releasePlan(first, baseIndex, admissionRef, 0);
      if (
        exactPlan.plannedAppendBytes !== plan.plannedAppendBytes
        || exactPlan.plannedAppendSha256 !== plan.plannedAppendSha256
        || exactPlan.finalPrefixBytes !== plan.finalPrefixBytes
      ) {
        fail("FAIL_RELEASE_LOCK_PLAN");
      }
      plan = exactPlan;
    }
    if (baseIndex === undefined) fail("FAIL_INDEX_REPAIR");
    releaseLock = await prepareReleaseLock({
      directory: options.spoolDirectory,
      observed: initialReleaseLock,
      stage: initialReleaseStage,
      admissionRef,
      indexDev: baseIndex.stat.dev.toString(),
      indexIno: baseIndex.stat.ino.toString(),
      basePrefixBytes: plan.basePrefixBytes,
      plannedAppendBytes: plan.plannedAppendBytes,
      plannedAppendSha256: plan.plannedAppendSha256,
      finalPrefixBytes: plan.finalPrefixBytes,
    });
    await syncReleaseLockDirectory(options.spoolDirectory, releaseLock);
    const currentIndexSize = safeNumber(
      baseIndex.stat.size,
      "FAIL_UNREPRESENTABLE_SIZE",
    );
    const retainedPlanBytes = currentIndexSize - plan.basePrefixBytes;
    const missingTail = plan.bytes.subarray(retainedPlanBytes);
    if (missingTail.length > 0) {
      try {
        appendSpoolIndexRecoveryBytes({
          directory: options.spoolDirectory,
          bytes: missingTail,
          expectedIndexDev: releaseLock.indexDev,
          expectedIndexIno: releaseLock.indexIno,
          expectedIndexSize: currentIndexSize,
        });
      } catch {
        fail("FAIL_INDEX_REPAIR");
      }
    }
    const verifiedPlan = await readIndex(options.spoolDirectory, {
      basePrefixBytes: plan.basePrefixBytes,
      plannedAppend: plan.bytes,
    });
    if (
      verifiedPlan === undefined
      || safeNumber(verifiedPlan.stat.size, "FAIL_UNREPRESENTABLE_SIZE")
        !== plan.finalPrefixBytes
      || verifiedPlan.stat.dev.toString() !== releaseLock.indexDev
      || verifiedPlan.stat.ino.toString() !== releaseLock.indexIno
    ) {
      fail("FAIL_RELEASE_LOCK_PLAN");
    }
    finalIndex = await readIndex(options.spoolDirectory);
    if (finalIndex === undefined) fail("FAIL_INDEX_REPAIR");
    for (const candidate of firstCandidates) {
      if (!finalIndex.basenames.has(candidate.basename)) {
        fail("FAIL_INDEX_COVERAGE");
      }
    }
    assertNoRejectedIndexMembers(first, finalIndex);
    if (
      countCurrentAdmissionRecords(first, finalIndex, admissionRef)
        !== firstCandidates.length
    ) {
      fail("FAIL_ADMISSION_RECORD_COVERAGE");
    }
  } else if (!physicallyEmpty) {
    if (initialIndex === undefined) await createEmptyIndex(options.spoolDirectory);
    finalIndex = await readIndex(options.spoolDirectory);
    if (finalIndex === undefined) fail("FAIL_INDEX_REPAIR");
    assertNoRejectedIndexMembers(first, finalIndex);
  }
  const second = await sourceSnapshot(
    options.spoolDirectory,
    false,
    initialReleaseStage?.basename,
  );
  if (first.sha256 !== second.sha256) fail("FAIL_CHANGED");

  const finalCursor = await readReserved(options.spoolDirectory, SPOOL_CURSOR_NAME);
  if (
    (initialCursor === undefined) !== (finalCursor === undefined)
    || (
      initialCursor !== undefined
      && finalCursor !== undefined
      && (
        !sameSnapshot(initialCursor.stat, finalCursor.stat)
        || initialCursor.sha256 !== finalCursor.sha256
      )
    )
  ) {
    fail("FAIL_CHANGED");
  }

  const candidateNames = new Set(
    second.entries
      .filter((entry) => entry.kind === "candidate")
      .map((entry) => entry.basename),
  );
  const sourceEntries = second.entries.map((entry): ManifestEntry => ({
    ...entry,
    indexed: entry.kind === "candidate"
      && finalIndex?.basenames.has(entry.basename) === true,
  }));
  const candidateCount = candidateNames.size;
  const lawfulCount = sourceEntries.filter((entry) =>
    entry.classification === "lawful_empty"
    || entry.classification === "lawful_envelopes"
  ).length;
  const indexedCandidateCount = sourceEntries.filter((entry) =>
    entry.kind === "candidate" && entry.indexed
  ).length;
  const rejectedCount = sourceEntries.filter((entry) =>
    entry.kind === "rejected_unsafe_path"
  ).length;
  if (candidateCount !== indexedCandidateCount) fail("FAIL_INDEX_COVERAGE");

  finalIndex = await revalidateIndex(options.spoolDirectory, finalIndex);
  assertNoRejectedIndexMembers(second, finalIndex);
  const finalReleaseLock = await readSpoolReleaseLock(options.spoolDirectory);
  if (
    releaseLock === undefined
      ? finalReleaseLock.status !== "absent"
      : finalReleaseLock.status !== "valid"
        || !sameReleaseLock(releaseLock, finalReleaseLock.lock)
  ) {
    fail("FAIL_CHANGED");
  }
  const admissionRecordCount = finalIndex === undefined
    ? 0
    : countCurrentAdmissionRecords(second, finalIndex, admissionRef);
  if (admissionRecordCount !== candidateCount) {
    fail("FAIL_ADMISSION_RECORD_COVERAGE");
  }

  const reservedEntries: ManifestEntry[] = [];
  if (finalIndex !== undefined) {
    reservedEntries.push(reservedManifestEntry(SPOOL_INDEX_NAME, finalIndex));
  }
  if (finalCursor !== undefined) {
    reservedEntries.push(reservedManifestEntry(SPOOL_CURSOR_NAME, finalCursor));
  }
  const entries = [...sourceEntries, ...reservedEntries].sort((left, right) =>
    left.basename < right.basename ? -1 : left.basename > right.basename ? 1 : 0
  );
  const verdict = physicallyEmpty ? "PASS_EMPTY" : "PASS_INDEXED";
  const manifest = {
    version: FIX01_RELEASE_MANIFEST_VERSION,
    verdict,
    phase: "before_first_indexed_launch",
    spool_directory_realpath: options.spoolDirectory,
    target_build_ref: options.buildRef,
    verified_at: new Date().toISOString(),
    verifier_version: FIX01_RELEASE_VERIFIER_VERSION,
    admission_ref: admissionRef,
    admission_record_count: admissionRecordCount,
    first_snapshot_sha256: first.sha256,
    second_snapshot_sha256: second.sha256,
    source_entry_count: second.entries.length,
    candidate_count: candidateCount,
    lawful_count: lawfulCount,
    indexed_candidate_count: indexedCandidateCount,
    rejected_count: rejectedCount,
    requires_v_review: rejectedCount > 0,
    entries,
    index: finalIndex === undefined
      ? null
      : {
        basename: SPOOL_INDEX_NAME,
        dev: finalIndex.stat.dev.toString(),
        ino: finalIndex.stat.ino.toString(),
        nlink: 1,
        size: safeNumber(finalIndex.stat.size, "FAIL_UNREPRESENTABLE_SIZE"),
        sha256: finalIndex.sha256,
        covered_lawful_count: sourceEntries.filter((entry) =>
          entry.indexed
          && (
            entry.classification === "lawful_empty"
            || entry.classification === "lawful_envelopes"
          )
        ).length,
      },
    release_lock: releaseLock === undefined
      ? null
      : {
        basename: SPOOL_RELEASE_LOCK_NAME,
        version: 2,
        admission_ref: releaseLock.admissionRef,
        dev: releaseLock.dev,
        ino: releaseLock.ino,
        nlink: 1,
        size: releaseLock.size,
        sha256: releaseLock.sha256,
        index_dev: releaseLock.indexDev,
        index_ino: releaseLock.indexIno,
        base_prefix_bytes: releaseLock.basePrefixBytes,
        planned_append_bytes: releaseLock.plannedAppendBytes,
        planned_append_sha256: releaseLock.plannedAppendSha256,
        final_prefix_bytes: releaseLock.finalPrefixBytes,
      },
  } as const;
  if (
    verdict === "PASS_EMPTY"
    && (
      manifest.source_entry_count !== 0
      || manifest.candidate_count !== 0
      || manifest.entries.length !== 0
      || manifest.index !== null
      || manifest.release_lock !== null
    )
  ) {
    fail("FAIL_EMPTY_RELATION");
  }
  if (
    verdict === "PASS_INDEXED"
    && (
      manifest.index === null
      || (candidateCount > 0 && manifest.release_lock === null)
      || (candidateCount === 0 && manifest.release_lock !== null)
      || manifest.index.nlink !== 1
      || lawfulCount > candidateCount
      || candidateCount !== indexedCandidateCount
      || lawfulCount !== manifest.index.covered_lawful_count
    )
  ) {
    fail("FAIL_INDEX_RELATION");
  }
  const bytes = Buffer.from(canonicalJson(manifest), "utf8");
  if (bytes.length > FIX01_RELEASE_MANIFEST_MAX_BYTES) {
    fail("FAIL_MANIFEST_TOO_LARGE");
  }
  const manifestSha256 = sha256(bytes);
  await writeManifest(options.manifestPath, bytes);
  return { verdict, manifestSha256 };
}

async function main(): Promise<void> {
  try {
    const arguments_ = parseArguments(process.argv.slice(2));
    const result = await run(arguments_);
    process.stdout.write(
      `FIX01_RELEASE_ADMISSION ${result.verdict} manifest_sha256=${result.manifestSha256}\n`,
    );
  } catch (error) {
    const code = error instanceof AdmissionFailure
      ? error.code
      : "FAIL_INTERNAL";
    process.stderr.write(`FIX01_RELEASE_ADMISSION_FAIL ${code}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined
  && import.meta.url === pathToFileURL(resolve(invokedPath)).href
) {
  await main();
}
