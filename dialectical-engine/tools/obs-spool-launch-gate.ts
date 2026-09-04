import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createSpoolAdmissionProof,
  encodeSpoolAdmissionSeal,
  isIndexedSpoolBasename,
  parseSpoolAdmissionIndexRecord,
  SPOOL_CURSOR_NAME,
  SPOOL_INDEX_NAME,
} from "../packages/obs-capture/src/spool-index.js";
import {
  canonicalFix01ReleaseJson as canonicalJson,
  FIX01_RELEASE_ENTRY_KEYS as ENTRY_KEYS,
  FIX01_RELEASE_INDEX_KEYS as INDEX_KEYS,
  FIX01_RELEASE_MANIFEST_KEYS as MANIFEST_KEYS,
  FIX01_RELEASE_MANIFEST_VERSION as MANIFEST_VERSION,
  FIX01_RELEASE_VERIFIER_VERSION as VERIFIER_VERSION,
  type Fix01ReleaseAdmissionManifestV2,
  type Fix01ReleaseManifestIndexV2,
} from "./obs-spool-release-contract.js";

const IMMUTABLE_BUILD_REF = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const LOWER_HEX_256 = /^[0-9a-f]{64}$/u;
const CANONICAL_DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const VERIFIED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_UINT64 = 18_446_744_073_709_551_615n;
const IO_CHUNK_BYTES = 64 * 1024;
const INDEX_LINE_MAX_BYTES = 174;
const MANIFEST_MAX_BYTES = 8 * 1024 * 1024;

interface Arguments {
  readonly spoolDirectory: string;
  readonly buildRef: string;
  readonly manifestPath: string;
  readonly manifestSha256: string;
}

interface StableFile {
  readonly stat: BigIntStats;
  readonly bytes: Buffer;
}

interface CandidateEntry {
  readonly basename: string;
  readonly kind: "candidate";
  readonly dev: string;
  readonly ino: string;
  readonly nlink: 1;
  readonly size: number;
  readonly mtime_ms: number;
  readonly mtime_ns: string;
  readonly ctime_ns: string;
  readonly sha256: string;
  readonly classification:
    | "lawful_empty"
    | "lawful_envelopes"
    | "retained_invalid_bytes";
  readonly indexed: true;
  readonly reason: null;
}

type AdmissionManifest = Omit<Fix01ReleaseAdmissionManifestV2, "index" | "verdict">
  & Readonly<{
    verdict: "PASS_INDEXED";
    index: Fix01ReleaseManifestIndexV2;
  }>;

class GateFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "GateFailure";
  }
}

function fail(code: string): never {
  throw new GateFailure(code);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isSafeNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isCanonicalUint64(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_DECIMAL.test(value)) return false;
  try {
    return BigInt(value) <= MAX_UINT64;
  } catch {
    return false;
  }
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

function parseArguments(argv: readonly string[]): Arguments {
  const values = new Map<string, string>();
  const allowed = new Set([
    "--spool-dir",
    "--build-ref",
    "--manifest",
    "--manifest-sha256",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined
      || value === undefined
      || !allowed.has(flag)
      || values.has(flag)
    ) {
      fail("FAIL_ARGUMENTS");
    }
    values.set(flag, value);
  }
  if (values.size !== allowed.size) fail("FAIL_ARGUMENTS");
  const spoolDirectory = values.get("--spool-dir");
  const buildRef = values.get("--build-ref");
  const manifestPath = values.get("--manifest");
  const manifestSha256 = values.get("--manifest-sha256");
  if (
    spoolDirectory === undefined
    || buildRef === undefined
    || manifestPath === undefined
    || manifestSha256 === undefined
    || !isAbsolute(spoolDirectory)
    || !isAbsolute(manifestPath)
    || !IMMUTABLE_BUILD_REF.test(buildRef)
    || !LOWER_HEX_256.test(manifestSha256)
  ) {
    fail("FAIL_ARGUMENTS");
  }
  return { spoolDirectory, buildRef, manifestPath, manifestSha256 };
}

async function validateSpoolPath(value: string): Promise<string> {
  const normalized = resolve(value);
  let pathStat: BigIntStats;
  let physical: string;
  try {
    pathStat = await lstat(normalized, { bigint: true });
    physical = await realpath(normalized);
  } catch {
    fail("FAIL_UNSAFE_SPOOL_DIRECTORY");
  }
  if (
    value !== normalized
    || physical !== normalized
    || !pathStat.isDirectory()
    || pathStat.isSymbolicLink()
  ) {
    fail("FAIL_UNSAFE_SPOOL_DIRECTORY");
  }
  return physical;
}

async function readStableRegular(path: string, failureCode: string): Promise<StableFile> {
  const chunks: Buffer[] = [];
  const stat = await streamStableRegular(
    path,
    failureCode,
    (chunk) => {
      chunks.push(Buffer.from(chunk));
    },
    {
      maximumBytes: MANIFEST_MAX_BYTES,
      tooLargeCode: "FAIL_MANIFEST_TOO_LARGE",
    },
  );
  return { stat, bytes: Buffer.concat(chunks) };
}

async function streamStableRegular(
  path: string,
  failureCode: string,
  consume: (chunk: Buffer, offset: number) => void,
  limit?: Readonly<{ maximumBytes: number; tooLargeCode: string }>,
): Promise<BigIntStats> {
  let pathStat: BigIntStats;
  let handle: FileHandle | undefined;
  try {
    pathStat = await lstat(path, { bigint: true });
    if (!pathStat.isFile() || pathStat.nlink !== 1n) fail(failureCode);
    handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const descriptor = await handle.stat({ bigint: true });
    const size = Number(descriptor.size);
    if (
      !descriptor.isFile()
      || descriptor.nlink !== 1n
      || !sameSnapshot(pathStat, descriptor)
      || !Number.isSafeInteger(size)
      || size < 0
    ) {
      fail(failureCode);
    }
    if (limit !== undefined && size > limit.maximumBytes) {
      fail(limit.tooLargeCode);
    }
    const buffer = Buffer.alloc(Math.min(IO_CHUNK_BYTES, Math.max(size, 1)));
    let position = 0;
    while (position < size) {
      const length = Math.min(buffer.length, size - position);
      const result = await handle.read(buffer, 0, length, position);
      if (result.bytesRead <= 0) fail(failureCode);
      consume(buffer.subarray(0, result.bytesRead), position);
      position += result.bytesRead;
    }
    const probe = Buffer.alloc(1);
    if ((await handle.read(probe, 0, 1, size)).bytesRead !== 0) fail(failureCode);
    const afterDescriptor = await handle.stat({ bigint: true });
    const afterPath = await lstat(path, { bigint: true });
    if (
      !afterDescriptor.isFile()
      || !afterPath.isFile()
      || afterDescriptor.nlink !== 1n
      || afterPath.nlink !== 1n
      || !sameSnapshot(descriptor, afterDescriptor)
      || !sameSnapshot(descriptor, afterPath)
    ) {
      fail(failureCode);
    }
    return descriptor;
  } catch (error) {
    if (error instanceof GateFailure) throw error;
    throw new GateFailure(failureCode);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function hasStatEvidence(value: Readonly<Record<string, unknown>>): boolean {
  return isCanonicalUint64(value.dev)
    && isCanonicalUint64(value.ino)
    && isSafeNonnegativeInteger(value.nlink)
    && isSafeNonnegativeInteger(value.size)
    && isSafeNonnegativeInteger(value.mtime_ms)
    && isCanonicalUint64(value.mtime_ns)
    && isCanonicalUint64(value.ctime_ns);
}

function candidateEntry(
  value: Readonly<Record<string, unknown>>,
): CandidateEntry | undefined {
  if (
    !exactKeys(value, ENTRY_KEYS)
    || value.kind !== "candidate"
    || typeof value.basename !== "string"
    || !isIndexedSpoolBasename(value.basename)
    || !hasStatEvidence(value)
    || value.nlink !== 1
    || typeof value.sha256 !== "string"
    || !LOWER_HEX_256.test(value.sha256)
    || ![
      "lawful_empty",
      "lawful_envelopes",
      "retained_invalid_bytes",
    ].includes(value.classification as string)
    || value.indexed !== true
    || value.reason !== null
  ) {
    return undefined;
  }
  return value as unknown as CandidateEntry;
}

function validateOtherEntry(value: Readonly<Record<string, unknown>>): boolean {
  if (!exactKeys(value, ENTRY_KEYS) || !hasStatEvidence(value)) return false;
  if (value.kind === "reserved") {
    return (value.basename === SPOOL_INDEX_NAME || value.basename === SPOOL_CURSOR_NAME)
      && typeof value.sha256 === "string"
      && LOWER_HEX_256.test(value.sha256)
      && value.classification === "reserved_metadata"
      && value.indexed === false
      && value.reason === null;
  }
  return value.kind === "rejected_unsafe_path"
    && typeof value.basename === "string"
    && value.basename.length > 0
    && value.sha256 === null
    && value.classification === "rejected_unsafe_path"
    && value.indexed === false
    && ["NON_CANONICAL_BASENAME", "SYMLINK", "NOT_REGULAR_FILE", "HARDLINK"]
      .includes(value.reason as string);
}

function parseManifest(
  bytes: Buffer,
  options: Readonly<Arguments> & Readonly<{ spoolDirectory: string }>,
): AdmissionManifest {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("FAIL_MANIFEST_SCHEMA");
  }
  if (
    !isRecord(value)
    || !exactKeys(value, MANIFEST_KEYS)
    || canonicalJson(value) !== bytes.toString("utf8")
    || value.version !== MANIFEST_VERSION
    || value.verdict !== "PASS_INDEXED"
    || value.phase !== "before_first_indexed_launch"
    || value.spool_directory_realpath !== options.spoolDirectory
    || value.target_build_ref !== options.buildRef
    || typeof value.verified_at !== "string"
    || !VERIFIED_AT.test(value.verified_at)
    || value.verifier_version !== VERIFIER_VERSION
    || typeof value.admission_ref !== "string"
    || !LOWER_HEX_256.test(value.admission_ref)
    || typeof value.first_snapshot_sha256 !== "string"
    || !LOWER_HEX_256.test(value.first_snapshot_sha256)
    || value.second_snapshot_sha256 !== value.first_snapshot_sha256
    || !isSafeNonnegativeInteger(value.source_entry_count)
    || !isSafeNonnegativeInteger(value.candidate_count)
    || !isSafeNonnegativeInteger(value.lawful_count)
    || !isSafeNonnegativeInteger(value.indexed_candidate_count)
    || !isSafeNonnegativeInteger(value.rejected_count)
    || !isSafeNonnegativeInteger(value.admission_record_count)
    || typeof value.requires_v_review !== "boolean"
    || !Array.isArray(value.entries)
    || !isRecord(value.index)
    || !exactKeys(value.index, INDEX_KEYS)
  ) {
    fail("FAIL_MANIFEST_SCHEMA");
  }

  const entries = value.entries;
  const candidates: CandidateEntry[] = [];
  let rejectedCount = 0;
  let reservedIndex: Readonly<Record<string, unknown>> | undefined;
  let priorBasename: string | undefined;
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.basename !== "string") {
      fail("FAIL_MANIFEST_SCHEMA");
    }
    if (priorBasename !== undefined && priorBasename >= entry.basename) {
      fail("FAIL_MANIFEST_SCHEMA");
    }
    priorBasename = entry.basename;
    const candidate = candidateEntry(entry);
    if (candidate !== undefined) candidates.push(candidate);
    else if (!validateOtherEntry(entry)) fail("FAIL_MANIFEST_SCHEMA");
    if (entry.kind === "rejected_unsafe_path") rejectedCount += 1;
    if (entry.kind === "reserved" && entry.basename === SPOOL_INDEX_NAME) {
      if (reservedIndex !== undefined) fail("FAIL_MANIFEST_SCHEMA");
      reservedIndex = entry;
    }
  }

  const index = value.index;
  if (
    index.basename !== SPOOL_INDEX_NAME
    || !isCanonicalUint64(index.dev)
    || !isCanonicalUint64(index.ino)
    || index.nlink !== 1
    || !isSafeNonnegativeInteger(index.size)
    || index.size <= 0
    || typeof index.sha256 !== "string"
    || !LOWER_HEX_256.test(index.sha256)
    || !isSafeNonnegativeInteger(index.covered_lawful_count)
    || reservedIndex === undefined
    || reservedIndex.dev !== index.dev
    || reservedIndex.ino !== index.ino
    || reservedIndex.nlink !== index.nlink
    || reservedIndex.size !== index.size
    || reservedIndex.sha256 !== index.sha256
  ) {
    fail("FAIL_MANIFEST_SCHEMA");
  }

  const sourceEntries = entries.filter((entry) => entry.kind !== "reserved");
  const snapshotEvidence = sourceEntries.map((entry) => ({
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
  const snapshotSha256 = sha256(canonicalJson(snapshotEvidence));
  const lawfulCount = candidates.filter((entry) =>
    entry.classification === "lawful_empty"
    || entry.classification === "lawful_envelopes"
  ).length;
  if (
    snapshotSha256 !== value.first_snapshot_sha256
    || value.source_entry_count !== sourceEntries.length
    || value.candidate_count !== candidates.length
    || value.indexed_candidate_count !== candidates.length
    || value.admission_record_count !== candidates.length
    || value.admission_record_count <= 0
    || value.lawful_count !== lawfulCount
    || value.rejected_count !== rejectedCount
    || value.requires_v_review !== (rejectedCount > 0)
    || index.covered_lawful_count !== lawfulCount
  ) {
    fail("FAIL_MANIFEST_RELATION");
  }
  return value as unknown as AdmissionManifest;
}

async function verifyIndexPrefix(
  manifest: AdmissionManifest,
  indexPath: string,
): Promise<void> {
  const prefixBytes = manifest.index.size;
  const candidates = manifest.entries
    .map((entry) => candidateEntry(entry as unknown as Readonly<Record<string, unknown>>))
    .filter((entry): entry is CandidateEntry => entry !== undefined);
  const expectedAdmissions = new Map<string, string>();
  for (const entry of candidates) {
    const proof = createSpoolAdmissionProof({
      admissionRef: manifest.admission_ref,
      basename: entry.basename,
      dev: entry.dev,
      ino: entry.ino,
      nlink: "1",
      size: String(entry.size),
      mtimeNs: entry.mtime_ns,
      ctimeNs: entry.ctime_ns,
      sourceSha256: entry.sha256,
    });
    expectedAdmissions.set(entry.basename, proof);
  }
  const admissionCounts = new Map<string, number>();
  const writerBasenames = new Set<string>();
  const prefixDigest = createHash("sha256");
  let lastPrefixByte: number | undefined;
  let line: number[] = [];
  let overlong = false;
  let suffixLinePosition = 0;

  function finishPrefixLine(): void {
    if (!overlong && line.length > 0) {
      const rawLine = Buffer.from(line).toString("utf8");
      if (isIndexedSpoolBasename(rawLine)) writerBasenames.add(rawLine);
      const parsed = parseSpoolAdmissionIndexRecord(rawLine);
      if (
        parsed !== undefined
        && expectedAdmissions.get(parsed.basename) === parsed.proof
      ) {
        admissionCounts.set(
          parsed.basename,
          (admissionCounts.get(parsed.basename) ?? 0) + 1,
        );
      }
    }
    line = [];
    overlong = false;
  }

  const indexStat = await streamStableRegular(
    indexPath,
    "FAIL_UNSAFE_INDEX",
    (chunk, offset) => {
      const withinPrefix = Math.max(
        0,
        Math.min(chunk.length, prefixBytes - offset),
      );
      if (withinPrefix > 0) {
        prefixDigest.update(chunk.subarray(0, withinPrefix));
      }
      for (let position = 0; position < withinPrefix; position += 1) {
        const byte = chunk[position]!;
        lastPrefixByte = byte;
        if (byte === 0x0a) {
          finishPrefixLine();
        } else if (!overlong) {
          if (line.length >= INDEX_LINE_MAX_BYTES) {
            line = [];
            overlong = true;
          } else {
            line.push(byte);
          }
        }
      }
      for (let position = withinPrefix; position < chunk.length; position += 1) {
        const byte = chunk[position]!;
        if (suffixLinePosition === 0) {
          if (byte === 0x41) fail("FAIL_A1_OUTSIDE_PREFIX");
          suffixLinePosition = byte === 0x0a ? 0 : -1;
        } else if (byte === 0x0a) {
          suffixLinePosition = 0;
        }
      }
    },
  );
  if (
    indexStat.dev.toString() !== manifest.index.dev
    || indexStat.ino.toString() !== manifest.index.ino
  ) {
    fail("FAIL_INDEX_IDENTITY");
  }
  if (
    indexStat.size < BigInt(prefixBytes)
    || lastPrefixByte !== 0x0a
    || line.length !== 0
    || overlong
    || prefixDigest.digest("hex") !== manifest.index.sha256
  ) {
    fail("FAIL_INDEX_PREFIX");
  }
  for (const entry of candidates) {
    if (
      !writerBasenames.has(entry.basename)
      || admissionCounts.get(entry.basename) !== 1
    ) {
      fail("FAIL_ADMISSION_COVERAGE");
    }
  }
  const admittedCount = [...admissionCounts.values()]
    .reduce((sum, count) => sum + count, 0);
  if (admittedCount !== manifest.admission_record_count) {
    fail("FAIL_ADMISSION_COVERAGE");
  }
}

async function run(arguments_: Arguments): Promise<string> {
  const spoolDirectory = await validateSpoolPath(arguments_.spoolDirectory);
  const manifestPath = resolve(arguments_.manifestPath);
  if (manifestPath !== arguments_.manifestPath) fail("FAIL_ARGUMENTS");
  const manifestFile = await readStableRegular(
    manifestPath,
    "FAIL_UNSAFE_MANIFEST",
  );
  if (sha256(manifestFile.bytes) !== arguments_.manifestSha256) {
    fail("FAIL_MANIFEST_DIGEST");
  }
  const options = { ...arguments_, spoolDirectory };
  const manifest = parseManifest(manifestFile.bytes, options);
  await verifyIndexPrefix(manifest, join(spoolDirectory, SPOOL_INDEX_NAME));
  return encodeSpoolAdmissionSeal({
    version: 1,
    admissionRef: manifest.admission_ref,
    manifestSha256: arguments_.manifestSha256,
    indexDev: manifest.index.dev,
    indexIno: manifest.index.ino,
    prefixBytes: manifest.index.size,
  });
}

async function main(): Promise<void> {
  try {
    const seal = await run(parseArguments(process.argv.slice(2)));
    process.stdout.write(`FIX01_SPOOL_LAUNCH_GATE PASS seal=${seal}\n`);
  } catch (error) {
    const code = error instanceof GateFailure ? error.code : "FAIL_INTERNAL";
    process.stderr.write(`FIX01_SPOOL_LAUNCH_GATE_FAIL ${code}\n`);
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
