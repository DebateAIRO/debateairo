import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  open,
  readdir,
  realpath,
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
  appendSpoolIndexBasename,
  isIndexedSpoolBasename,
  SPOOL_CURSOR_NAME,
  SPOOL_INDEX_NAME,
} from "../packages/obs-capture/src/spool-index.js";

const VERIFIER_VERSION = "fix01-release-admission-v1";
const IMMUTABLE_BUILD_REF = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SPOOL_RUNTIME = /^(api|runner|scheduler|evaluator-lib|ui-client|listener|watchdog|ingest)-/u;
const INDEX_LINE_MAX_BYTES = 127;
const IO_CHUNK_BYTES = 64 * 1024;

type Classification =
  | "lawful_empty"
  | "lawful_envelopes"
  | "retained_invalid_bytes"
  | "reserved_metadata"
  | "rejected_unsafe_path";

type EntryKind = "candidate" | "reserved" | "rejected_unsafe_path";

interface ManifestEntry {
  readonly basename: string;
  readonly kind: EntryKind;
  readonly dev: string | null;
  readonly ino: string | null;
  readonly nlink: number | null;
  readonly size: number | null;
  readonly mtime_ms: number | null;
  readonly sha256: string | null;
  readonly classification: Classification;
  readonly indexed: boolean;
  readonly reason: string | null;
}

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

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    ).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail("FAIL_MANIFEST_VALUE");
  return encoded;
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
    && left.mtimeMs === right.mtimeMs;
}

function statFields(stat: BigIntStats): Pick<
  ManifestEntry,
  "dev" | "ino" | "nlink" | "size" | "mtime_ms"
> {
  return {
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    nlink: safeNumber(stat.nlink, "FAIL_UNREPRESENTABLE_NLINK"),
    size: safeNumber(stat.size, "FAIL_UNREPRESENTABLE_SIZE"),
    mtime_ms: safeNumber(stat.mtimeMs, "FAIL_UNREPRESENTABLE_MTIME"),
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
    mtime_ms: entry.mtime_ms,
    nlink: entry.nlink,
    sha256: entry.sha256,
    size: entry.size,
  }));
}

async function sourceSnapshot(directory: string): Promise<SourceSnapshot> {
  let names: string[];
  try {
    names = (await readdir(directory)).sort();
  } catch {
    fail("FAIL_UNREADABLE_DIRECTORY");
  }
  if (new Set(names).size !== names.length) fail("FAIL_DUPLICATE_NAME");
  const entries: ManifestEntry[] = [];
  for (const name of names) {
    if (name === SPOOL_INDEX_NAME || name === SPOOL_CURSOR_NAME) continue;
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

async function readIndex(directory: string): Promise<IndexState | undefined> {
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
  let line = Buffer.alloc(0);
  let overlong = false;
  const result = await readStableFile(filePath, pathStat, (chunk) => {
    for (let index = 0; index < chunk.length; index += 1) {
      const byte = chunk[index];
      if (byte === 0x0a) {
        if (!overlong && line.length > 0) {
          const candidate = line.toString("utf8");
          if (isIndexedSpoolBasename(candidate)) basenames.add(candidate);
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
  });
  return { ...result, basenames };
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

async function repairIndex(
  directory: string,
  source: SourceSnapshot,
  initialIndex: IndexState | undefined,
): Promise<IndexState> {
  const candidates = source.entries.filter((entry) => entry.kind === "candidate");
  const rejectedCanonical = source.entries.filter((entry) =>
    entry.kind === "rejected_unsafe_path"
    && isIndexedSpoolBasename(entry.basename)
  );
  for (const rejected of rejectedCanonical) {
    if (initialIndex?.basenames.has(rejected.basename)) {
      fail("FAIL_UNSAFE_INDEX_MEMBER");
    }
  }
  let indexed = initialIndex?.basenames ?? new Set<string>();
  for (const candidate of candidates) {
    if (indexed.has(candidate.basename)) continue;
    try {
      appendSpoolIndexBasename({
        directory,
        basename: candidate.basename,
      });
    } catch {
      fail("FAIL_INDEX_REPAIR");
    }
    indexed = (await readIndex(directory))?.basenames ?? new Set<string>();
    if (!indexed.has(candidate.basename)) fail("FAIL_INDEX_REPAIR");
  }
  if (await readIndex(directory) === undefined) await createEmptyIndex(directory);
  const finalIndex = await readIndex(directory);
  if (finalIndex === undefined) fail("FAIL_INDEX_REPAIR");
  for (const candidate of candidates) {
    if (!finalIndex.basenames.has(candidate.basename)) fail("FAIL_INDEX_COVERAGE");
  }
  return finalIndex;
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
  const initialIndex = await readIndex(options.spoolDirectory);
  const initialCursor = await readReserved(options.spoolDirectory, SPOOL_CURSOR_NAME);
  const first = await sourceSnapshot(options.spoolDirectory);
  const physicallyEmpty = first.entries.length === 0
    && initialIndex === undefined
    && initialCursor === undefined;

  let finalIndex: IndexState | undefined;
  if (!physicallyEmpty) {
    finalIndex = await repairIndex(options.spoolDirectory, first, initialIndex);
  }
  const second = await sourceSnapshot(options.spoolDirectory);
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
    version: 1,
    verdict,
    phase: "before_first_indexed_launch",
    spool_directory_realpath: options.spoolDirectory,
    target_build_ref: options.buildRef,
    verified_at: new Date().toISOString(),
    verifier_version: VERIFIER_VERSION,
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
  } as const;
  if (
    verdict === "PASS_EMPTY"
    && (
      manifest.source_entry_count !== 0
      || manifest.candidate_count !== 0
      || manifest.entries.length !== 0
      || manifest.index !== null
    )
  ) {
    fail("FAIL_EMPTY_RELATION");
  }
  if (
    verdict === "PASS_INDEXED"
    && (
      manifest.index === null
      || manifest.index.nlink !== 1
      || lawfulCount > candidateCount
      || candidateCount !== indexedCandidateCount
      || lawfulCount !== manifest.index.covered_lawful_count
    )
  ) {
    fail("FAIL_INDEX_RELATION");
  }
  const bytes = Buffer.from(canonicalJson(manifest), "utf8");
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
