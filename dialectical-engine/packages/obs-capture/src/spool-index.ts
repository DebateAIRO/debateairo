import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  writeSync,
} from "node:fs";
import type { BigIntStats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";

export const SPOOL_INDEX_NAME = ".obs-spool-index-v1";
export const SPOOL_CURSOR_NAME = ".obs-spool-cursor-v1";
export const SPOOL_RELEASE_LOCK_NAME = ".obs-spool-release-lock-v1";

const INDEX_PAGE_MAX_BYTES = 8_192;
const INDEX_PAGE_MAX_RECORDS = 64;
const PLAIN_INDEX_RECORD_MAX_BYTES = 128;
const INDEX_RECORD_MAX_BYTES = 175;
const INDEX_APPEND_MAX_BYTES = INDEX_RECORD_MAX_BYTES + 1;
const CURSOR_SLOT_BYTES = 512;
const CURSOR_FILE_BYTES = CURSOR_SLOT_BYTES * 2;
const CURSOR_VERSION = 1;
const CURSOR_SEQUENCE_RESET_AT = 1_000_000_000;
const SPOOL_BASENAME = /^(api|runner|scheduler|evaluator-lib|ui-client|listener|watchdog|ingest)-[1-9][0-9]*-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.spool$/u;
const LOWER_HEX_256 = /^[0-9a-f]{64}$/u;
const BASE64URL_SHA256 = /^[A-Za-z0-9_-]{43}$/u;
const CANONICAL_DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const MAX_UINT64 = 18_446_744_073_709_551_615n;
const ADMISSION_PROOF_DOMAIN = "FIX01-SPOOL-ADMISSION-PROOF-V1";
const ADMISSION_RECORD_PREFIX = "A1\t";
const ADMISSION_SEAL_MAX_BYTES = 512;
const RELEASE_LOCK_VERSION_LINE = "FIX01_RELEASE_LOCK_V2";
const RELEASE_LOCK_CHECKSUM_DOMAIN = "FIX01-RELEASE-LOCK-V2";
const RELEASE_LOCK_BYTES = Buffer.byteLength(
  `${RELEASE_LOCK_VERSION_LINE}\n${"0".repeat(64)}\n${"0".repeat(16)}\n${"0".repeat(16)}\n${"0".repeat(16)}\n${"0".repeat(16)}\n${"0".repeat(64)}\n${"0".repeat(16)}\n${"0".repeat(64)}\n`,
  "utf8",
);

interface FileIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

export interface SpoolAdmissionProofEvidence {
  readonly admissionRef: string;
  readonly basename: string;
  readonly dev: string;
  readonly ino: string;
  readonly nlink: "1";
  readonly size: string;
  readonly mtimeNs: string;
  readonly ctimeNs: string;
  readonly sourceSha256: string;
}

export interface SpoolAdmissionSeal {
  readonly version: 2;
  readonly admissionRef: string;
  readonly manifestSha256: string;
  readonly indexDev: string;
  readonly indexIno: string;
  readonly prefixBytes: number;
  readonly lockDev: string;
  readonly lockIno: string;
  readonly lockSha256: string;
}

export interface SpoolReleaseLock {
  readonly version: 2;
  readonly admissionRef: string;
  readonly dev: string;
  readonly ino: string;
  readonly size: number;
  readonly sha256: string;
  readonly indexDev: string;
  readonly indexIno: string;
  readonly basePrefixBytes: number;
  readonly plannedAppendBytes: number;
  readonly plannedAppendSha256: string;
  readonly finalPrefixBytes: number;
}

export type SpoolReleaseLockState =
  | Readonly<{ status: "absent" }>
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "valid"; lock: SpoolReleaseLock }>;

export interface WriterSpoolIndexRecord {
  readonly kind: "writer";
  readonly basename: string;
  readonly recordEndOffset: number;
}

export interface AdmissionSpoolIndexRecord {
  readonly kind: "admission";
  readonly basename: string;
  readonly proof: string;
  readonly recordEndOffset: number;
}

export type SpoolIndexRecord =
  | WriterSpoolIndexRecord
  | AdmissionSpoolIndexRecord;

export interface TypedSpoolIndexPage {
  readonly indexDev: string;
  readonly indexIno: string;
  readonly indexSize: number;
  readonly records: readonly SpoolIndexRecord[];
}

export interface TypedSpoolIndexExpectation {
  readonly indexDev: string;
  readonly indexIno: string;
  readonly prefixBytes: number;
}

interface CursorRecord {
  readonly version: typeof CURSOR_VERSION;
  readonly sequence: number;
  readonly index_dev: string;
  readonly index_ino: string;
  readonly offset: number;
  readonly checksum: string;
}

interface SelectedCursor {
  readonly record: CursorRecord;
  readonly slot: 0 | 1;
}

function sameIdentity(
  actual: Readonly<FileIdentity>,
  expected: Readonly<FileIdentity>,
): boolean {
  return actual.dev === expected.dev && actual.ino === expected.ino;
}

function cursorChecksum(value: Omit<CursorRecord, "checksum">): string {
  return createHash("sha256")
    .update([
      String(value.version),
      String(value.sequence),
      value.index_dev,
      value.index_ino,
      String(value.offset),
    ].join("\n"))
    .digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalDecimal(value: string): boolean {
  if (!CANONICAL_DECIMAL.test(value)) return false;
  try {
    return BigInt(value) <= MAX_UINT64;
  } catch {
    return false;
  }
}

function isCanonicalSha256Base64Url(value: string): boolean {
  if (!BASE64URL_SHA256.test(value)) return false;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === 32 && decoded.toString("base64url") === value;
  } catch {
    return false;
  }
}

function isSpoolAdmissionProofEvidence(
  value: SpoolAdmissionProofEvidence,
): boolean {
  return LOWER_HEX_256.test(value.admissionRef)
    && isIndexedSpoolBasename(value.basename)
    && isCanonicalDecimal(value.dev)
    && isCanonicalDecimal(value.ino)
    && value.nlink === "1"
    && isCanonicalDecimal(value.size)
    && isCanonicalDecimal(value.mtimeNs)
    && isCanonicalDecimal(value.ctimeNs)
    && LOWER_HEX_256.test(value.sourceSha256);
}

export function createSpoolAdmissionProof(
  evidence: SpoolAdmissionProofEvidence,
): string {
  if (!isSpoolAdmissionProofEvidence(evidence)) {
    throw new TypeError("SPOOL_ADMISSION_PROOF_EVIDENCE_INVALID");
  }
  return createHash("sha256")
    .update([
      ADMISSION_PROOF_DOMAIN,
      evidence.admissionRef,
      evidence.basename,
      evidence.dev,
      evidence.ino,
      evidence.nlink,
      evidence.size,
      evidence.mtimeNs,
      evidence.ctimeNs,
      evidence.sourceSha256,
    ].join("\0"))
    .digest("base64url");
}

export function encodeSpoolAdmissionIndexRecord(options: {
  readonly basename: string;
  readonly proof: string;
}): string {
  if (
    !isIndexedSpoolBasename(options.basename)
    || !isCanonicalSha256Base64Url(options.proof)
  ) {
    throw new TypeError("SPOOL_ADMISSION_INDEX_RECORD_INVALID");
  }
  const record = `${ADMISSION_RECORD_PREFIX}${options.basename}\t${options.proof}`;
  if (Buffer.byteLength(record, "utf8") + 1 > INDEX_RECORD_MAX_BYTES) {
    throw new TypeError("SPOOL_INDEX_RECORD_TOO_LARGE");
  }
  return record;
}

export function parseSpoolAdmissionIndexRecord(
  value: string,
): Readonly<{ basename: string; proof: string }> | undefined {
  const fields = value.split("\t");
  if (fields.length !== 3 || fields[0] !== "A1") return undefined;
  const basename = fields[1];
  const proof = fields[2];
  if (
    basename === undefined
    || proof === undefined
    || !isIndexedSpoolBasename(basename)
    || !isCanonicalSha256Base64Url(proof)
    || Buffer.byteLength(value, "utf8") + 1 > INDEX_RECORD_MAX_BYTES
  ) {
    return undefined;
  }
  return Object.freeze({ basename, proof });
}

export function parseSpoolAdmissionSeal(
  value: string | undefined,
): SpoolAdmissionSeal | undefined {
  if (
    value === undefined
    || value.length === 0
    || Buffer.byteLength(value, "utf8") > ADMISSION_SEAL_MAX_BYTES
  ) {
    return undefined;
  }
  const fields = value.split(".");
  if (fields.length !== 9) return undefined;
  const [
    version,
    admissionRef,
    manifestSha256,
    indexDev,
    indexIno,
    prefix,
    lockDev,
    lockIno,
    lockSha256,
  ] = fields;
  if (
    version !== "2"
    || admissionRef === undefined
    || !LOWER_HEX_256.test(admissionRef)
    || manifestSha256 === undefined
    || !LOWER_HEX_256.test(manifestSha256)
    || indexDev === undefined
    || !isCanonicalDecimal(indexDev)
    || indexIno === undefined
    || !isCanonicalDecimal(indexIno)
    || prefix === undefined
    || !CANONICAL_DECIMAL.test(prefix)
    || lockDev === undefined
    || !isCanonicalDecimal(lockDev)
    || lockIno === undefined
    || !isCanonicalDecimal(lockIno)
    || lockSha256 === undefined
    || !LOWER_HEX_256.test(lockSha256)
  ) {
    return undefined;
  }
  const prefixBytes = Number(prefix);
  if (!Number.isSafeInteger(prefixBytes) || prefixBytes <= 0) return undefined;
  return Object.freeze({
    version: 2,
    admissionRef,
    manifestSha256,
    indexDev,
    indexIno,
    prefixBytes,
    lockDev,
    lockIno,
    lockSha256,
  });
}

export function encodeSpoolAdmissionSeal(seal: SpoolAdmissionSeal): string {
  const value = [
    String(seal.version),
    seal.admissionRef,
    seal.manifestSha256,
    seal.indexDev,
    seal.indexIno,
    String(seal.prefixBytes),
    seal.lockDev,
    seal.lockIno,
    seal.lockSha256,
  ].join(".");
  const parsed = parseSpoolAdmissionSeal(value);
  if (
    parsed === undefined
    || parsed.admissionRef !== seal.admissionRef
    || parsed.manifestSha256 !== seal.manifestSha256
    || parsed.indexDev !== seal.indexDev
    || parsed.indexIno !== seal.indexIno
    || parsed.prefixBytes !== seal.prefixBytes
    || parsed.lockDev !== seal.lockDev
    || parsed.lockIno !== seal.lockIno
    || parsed.lockSha256 !== seal.lockSha256
  ) {
    throw new TypeError("SPOOL_ADMISSION_SEAL_INVALID");
  }
  return value;
}

export function encodeSpoolReleaseLock(options: {
  readonly admissionRef: string;
  readonly indexDev: string;
  readonly indexIno: string;
  readonly basePrefixBytes: number;
  readonly plannedAppendBytes: number;
  readonly plannedAppendSha256: string;
  readonly finalPrefixBytes: number;
}): Buffer {
  if (
    !LOWER_HEX_256.test(options.admissionRef)
    || !isCanonicalDecimal(options.indexDev)
    || !isCanonicalDecimal(options.indexIno)
    || !Number.isSafeInteger(options.basePrefixBytes)
    || options.basePrefixBytes < 0
    || !Number.isSafeInteger(options.plannedAppendBytes)
    || options.plannedAppendBytes <= 0
    || !LOWER_HEX_256.test(options.plannedAppendSha256)
    || !Number.isSafeInteger(options.finalPrefixBytes)
    || options.finalPrefixBytes <= 0
    || !Number.isSafeInteger(
      options.basePrefixBytes + options.plannedAppendBytes,
    )
    || options.basePrefixBytes + options.plannedAppendBytes
      !== options.finalPrefixBytes
  ) {
    throw new TypeError("SPOOL_RELEASE_LOCK_REF_INVALID");
  }
  const indexDev = BigInt(options.indexDev).toString(16).padStart(16, "0");
  const indexIno = BigInt(options.indexIno).toString(16).padStart(16, "0");
  const basePrefix = options.basePrefixBytes.toString(16).padStart(16, "0");
  const plannedAppend = options.plannedAppendBytes.toString(16).padStart(16, "0");
  const finalPrefix = options.finalPrefixBytes.toString(16).padStart(16, "0");
  const checksum = createHash("sha256").update([
    RELEASE_LOCK_CHECKSUM_DOMAIN,
    options.admissionRef,
    options.indexDev,
    options.indexIno,
    String(options.basePrefixBytes),
    String(options.plannedAppendBytes),
    options.plannedAppendSha256,
    String(options.finalPrefixBytes),
  ].join("\0")).digest("hex");
  return Buffer.from(
    `${RELEASE_LOCK_VERSION_LINE}\n${options.admissionRef}\n${indexDev}\n${indexIno}\n${basePrefix}\n${plannedAppend}\n${options.plannedAppendSha256}\n${finalPrefix}\n${checksum}\n`,
    "utf8",
  );
}

function sameStableFileSnapshot(
  left: BigIntStats,
  right: BigIntStats,
): boolean {
  return sameIdentity(left, right)
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function parseReleaseLock(bytes: Buffer): Readonly<{
  admissionRef: string;
  indexDev: string;
  indexIno: string;
  basePrefixBytes: number;
  plannedAppendBytes: number;
  plannedAppendSha256: string;
  finalPrefixBytes: number;
}> | undefined {
  if (bytes.length !== RELEASE_LOCK_BYTES) return undefined;
  const match = /^FIX01_RELEASE_LOCK_V2\n([0-9a-f]{64})\n([0-9a-f]{16})\n([0-9a-f]{16})\n([0-9a-f]{16})\n([0-9a-f]{16})\n([0-9a-f]{64})\n([0-9a-f]{16})\n([0-9a-f]{64})\n$/u.exec(
    bytes.toString("utf8"),
  );
  const admissionRef = match?.[1];
  const indexDevHex = match?.[2];
  const indexInoHex = match?.[3];
  const basePrefixHex = match?.[4];
  const plannedAppendHex = match?.[5];
  const plannedAppendSha256 = match?.[6];
  const finalPrefixHex = match?.[7];
  const checksum = match?.[8];
  if (
    admissionRef === undefined
    || indexDevHex === undefined
    || indexInoHex === undefined
    || basePrefixHex === undefined
    || plannedAppendHex === undefined
    || plannedAppendSha256 === undefined
    || finalPrefixHex === undefined
    || checksum === undefined
  ) {
    return undefined;
  }
  const indexDevValue = BigInt(`0x${indexDevHex}`);
  const indexInoValue = BigInt(`0x${indexInoHex}`);
  const basePrefixValue = BigInt(`0x${basePrefixHex}`);
  const plannedAppendValue = BigInt(`0x${plannedAppendHex}`);
  const finalPrefixValue = BigInt(`0x${finalPrefixHex}`);
  if (
    basePrefixValue > BigInt(Number.MAX_SAFE_INTEGER)
    || plannedAppendValue <= 0n
    || plannedAppendValue > BigInt(Number.MAX_SAFE_INTEGER)
    || finalPrefixValue <= 0n
    || finalPrefixValue > BigInt(Number.MAX_SAFE_INTEGER)
    || basePrefixValue + plannedAppendValue !== finalPrefixValue
  ) {
    return undefined;
  }
  const indexDev = indexDevValue.toString();
  const indexIno = indexInoValue.toString();
  const basePrefixBytes = Number(basePrefixValue);
  const plannedAppendBytes = Number(plannedAppendValue);
  const finalPrefixBytes = Number(finalPrefixValue);
  const expectedChecksum = createHash("sha256").update([
    RELEASE_LOCK_CHECKSUM_DOMAIN,
    admissionRef,
    indexDev,
    indexIno,
    String(basePrefixBytes),
    String(plannedAppendBytes),
    plannedAppendSha256,
    String(finalPrefixBytes),
  ].join("\0")).digest("hex");
  return checksum === expectedChecksum
    ? Object.freeze({
      admissionRef,
      indexDev,
      indexIno,
      basePrefixBytes,
      plannedAppendBytes,
      plannedAppendSha256,
      finalPrefixBytes,
    })
    : undefined;
}

export async function readSpoolReleaseLock(
  directory: string,
): Promise<SpoolReleaseLockState> {
  const path = join(directory, SPOOL_RELEASE_LOCK_NAME);
  let before: BigIntStats;
  try {
    before = await lstat(path, { bigint: true });
  } catch (error) {
    return isRecord(error) && error.code === "ENOENT"
      ? Object.freeze({ status: "absent" })
      : Object.freeze({ status: "invalid" });
  }
  if (
    !before.isFile()
    || before.nlink !== 1n
    || before.size !== BigInt(RELEASE_LOCK_BYTES)
  ) {
    return Object.freeze({ status: "invalid" });
  }
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const descriptor = await handle.stat({ bigint: true });
    if (
      !descriptor.isFile()
      || descriptor.nlink !== 1n
      || !sameStableFileSnapshot(before, descriptor)
    ) {
      return Object.freeze({ status: "invalid" });
    }
    const bytes = await readFixedBytes(handle, RELEASE_LOCK_BYTES, 0);
    if (bytes === undefined) return Object.freeze({ status: "invalid" });
    const probe = Buffer.alloc(1);
    if (
      (await handle.read(probe, 0, 1, RELEASE_LOCK_BYTES)).bytesRead !== 0
    ) {
      return Object.freeze({ status: "invalid" });
    }
    const afterDescriptor = await handle.stat({ bigint: true });
    const afterPath = await lstat(path, { bigint: true });
    if (
      !afterDescriptor.isFile()
      || !afterPath.isFile()
      || afterDescriptor.nlink !== 1n
      || afterPath.nlink !== 1n
      || !sameStableFileSnapshot(descriptor, afterDescriptor)
      || !sameStableFileSnapshot(descriptor, afterPath)
    ) {
      return Object.freeze({ status: "invalid" });
    }
    const parsed = parseReleaseLock(bytes);
    if (parsed === undefined) {
      return Object.freeze({ status: "invalid" });
    }
    return Object.freeze({
      status: "valid",
      lock: Object.freeze({
        version: 2,
        admissionRef: parsed.admissionRef,
        dev: descriptor.dev.toString(),
        ino: descriptor.ino.toString(),
        size: RELEASE_LOCK_BYTES,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        indexDev: parsed.indexDev,
        indexIno: parsed.indexIno,
        basePrefixBytes: parsed.basePrefixBytes,
        plannedAppendBytes: parsed.plannedAppendBytes,
        plannedAppendSha256: parsed.plannedAppendSha256,
        finalPrefixBytes: parsed.finalPrefixBytes,
      }),
    });
  } catch {
    return Object.freeze({ status: "invalid" });
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function parseCursorSlot(
  bytes: Buffer,
  indexIdentity: Readonly<FileIdentity>,
  indexSize: number,
): CursorRecord | undefined {
  const end = bytes.indexOf(0);
  const encoded = bytes.subarray(0, end < 0 ? bytes.length : end).toString("utf8");
  if (encoded.length === 0) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    return undefined;
  }
  if (
    !isRecord(value)
    || value.version !== CURSOR_VERSION
    || !Number.isSafeInteger(value.sequence)
    || (value.sequence as number) < 0
    || (value.sequence as number) > CURSOR_SEQUENCE_RESET_AT
    || value.index_dev !== indexIdentity.dev.toString()
    || value.index_ino !== indexIdentity.ino.toString()
    || !Number.isSafeInteger(value.offset)
    || (value.offset as number) < 0
    || (value.offset as number) > indexSize
    || typeof value.checksum !== "string"
    || !/^[0-9a-f]{64}$/u.test(value.checksum)
  ) {
    return undefined;
  }
  const record: CursorRecord = {
    version: CURSOR_VERSION,
    sequence: value.sequence as number,
    index_dev: value.index_dev,
    index_ino: value.index_ino,
    offset: value.offset as number,
    checksum: value.checksum,
  };
  return cursorChecksum(record) === record.checksum ? record : undefined;
}

async function readFixedBytes(
  handle: FileHandle,
  byteLength: number,
  position: number,
): Promise<Buffer | undefined> {
  const bytes = Buffer.alloc(byteLength);
  let filled = 0;
  while (filled < byteLength) {
    const result = await handle.read(
      bytes,
      filled,
      byteLength - filled,
      position + filled,
    );
    if (result.bytesRead <= 0) return undefined;
    filled += result.bytesRead;
  }
  return bytes;
}

async function verifiedRegularHandle(
  handle: FileHandle,
  path: string,
): Promise<FileIdentity | undefined> {
  // These checks reject planted hardlinks and detect namespace changes between
  // observations. Portable Node cannot make a pathname check atomic with the
  // later descriptor mutation; active same-UID changes after the last check
  // are outside the controller-ratified R4-03 threat boundary.
  const descriptor = await handle.stat({ bigint: true });
  if (!descriptor.isFile() || descriptor.nlink !== 1n) return undefined;
  const pathStat = await lstat(path, { bigint: true });
  if (
    !pathStat.isFile()
    || pathStat.nlink !== 1n
    || !sameIdentity(pathStat, descriptor)
  ) {
    return undefined;
  }
  return { dev: descriptor.dev, ino: descriptor.ino };
}

async function stillVerifiedRegularHandle(
  handle: FileHandle,
  path: string,
  expected: Readonly<FileIdentity>,
): Promise<boolean> {
  const current = await verifiedRegularHandle(handle, path);
  return current !== undefined && sameIdentity(current, expected);
}

async function openCursor(
  directory: string,
): Promise<Readonly<{ handle: FileHandle; identity: FileIdentity }> | undefined> {
  const path = join(directory, SPOOL_CURSOR_NAME);
  let handle: FileHandle | undefined;
  try {
    try {
      handle = await open(
        path,
        constants.O_CREAT
          | constants.O_EXCL
          | constants.O_NOFOLLOW
          | constants.O_NONBLOCK
          | constants.O_RDWR,
        0o600,
      );
    } catch (error) {
      if (!isRecord(error) || error.code !== "EEXIST") throw error;
      handle = await open(
        path,
        constants.O_NOFOLLOW | constants.O_NONBLOCK | constants.O_RDWR,
      );
    }
    const identity = await verifiedRegularHandle(handle, path);
    if (identity === undefined) throw new Error("SPOOL_CURSOR_NOT_REGULAR");
    const stat = await handle.stat({ bigint: true });
    if (stat.size !== BigInt(CURSOR_FILE_BYTES)) {
      if (!(await stillVerifiedRegularHandle(handle, path, identity))) {
        throw new Error("SPOOL_CURSOR_IDENTITY_CHANGED");
      }
      await handle.truncate(CURSOR_FILE_BYTES);
      await handle.sync();
      if (!(await stillVerifiedRegularHandle(handle, path, identity))) {
        throw new Error("SPOOL_CURSOR_IDENTITY_CHANGED");
      }
    }
    return { handle, identity };
  } catch {
    await handle?.close().catch(() => undefined);
    return undefined;
  }
}

async function selectCursor(
  handle: FileHandle,
  indexIdentity: Readonly<FileIdentity>,
  indexSize: number,
): Promise<SelectedCursor | undefined> {
  const bytes = await readFixedBytes(handle, CURSOR_FILE_BYTES, 0);
  if (bytes === undefined) return undefined;
  const candidates: SelectedCursor[] = [];
  for (const slot of [0, 1] as const) {
    const record = parseCursorSlot(
      bytes.subarray(slot * CURSOR_SLOT_BYTES, (slot + 1) * CURSOR_SLOT_BYTES),
      indexIdentity,
      indexSize,
    );
    if (record !== undefined) candidates.push({ record, slot });
  }
  return candidates.sort((left, right) =>
    right.record.sequence - left.record.sequence
  )[0];
}

function encodeCursor(record: CursorRecord): Buffer {
  const encoded = Buffer.from(JSON.stringify(record), "utf8");
  if (encoded.length >= CURSOR_SLOT_BYTES) {
    throw new Error("SPOOL_CURSOR_RECORD_TOO_LARGE");
  }
  const slot = Buffer.alloc(CURSOR_SLOT_BYTES);
  encoded.copy(slot);
  return slot;
}

async function persistCursor(
  handle: FileHandle,
  cursorPath: string,
  cursorIdentity: Readonly<FileIdentity>,
  selected: SelectedCursor | undefined,
  indexIdentity: Readonly<FileIdentity>,
  nextOffset: number,
): Promise<boolean> {
  let current = selected;
  if (
    current !== undefined
    && current.record.sequence >= CURSOR_SEQUENCE_RESET_AT - 1
  ) {
    if (!(await stillVerifiedRegularHandle(handle, cursorPath, cursorIdentity))) {
      return false;
    }
    const cleared = Buffer.alloc(CURSOR_FILE_BYTES);
    const reset = await handle.write(cleared, 0, cleared.length, 0);
    await handle.sync();
    if (!(await stillVerifiedRegularHandle(handle, cursorPath, cursorIdentity))) {
      return false;
    }
    if (reset.bytesWritten !== cleared.length) return false;
    current = undefined;
  }
  const sequence = (current?.record.sequence ?? -1) + 1;
  if (!Number.isSafeInteger(sequence)) return false;
  const incomplete = {
    version: CURSOR_VERSION,
    sequence,
    index_dev: indexIdentity.dev.toString(),
    index_ino: indexIdentity.ino.toString(),
    offset: nextOffset,
  } as const;
  const record: CursorRecord = {
    ...incomplete,
    checksum: cursorChecksum(incomplete),
  };
  const slot: 0 | 1 = current?.slot === 0 ? 1 : 0;
  const encoded = encodeCursor(record);
  if (!(await stillVerifiedRegularHandle(handle, cursorPath, cursorIdentity))) {
    return false;
  }
  const result = await handle.write(
    encoded,
    0,
    encoded.length,
    slot * CURSOR_SLOT_BYTES,
  );
  await handle.sync();
  if (!(await stillVerifiedRegularHandle(handle, cursorPath, cursorIdentity))) {
    return false;
  }
  if (result.bytesWritten !== encoded.length) return false;
  const written = await readFixedBytes(
    handle,
    CURSOR_SLOT_BYTES,
    slot * CURSOR_SLOT_BYTES,
  );
  return written !== undefined
    && parseCursorSlot(written, indexIdentity, nextOffset)?.checksum === record.checksum;
}

export function isIndexedSpoolBasename(value: string): boolean {
  return Buffer.byteLength(value, "utf8") <= PLAIN_INDEX_RECORD_MAX_BYTES - 1
    && SPOOL_BASENAME.test(value);
}

function appendSpoolIndexRecord(directory: string, recordText: string): void {
  const path = join(directory, SPOOL_INDEX_NAME);
  // The leading delimiter makes the next successful atomic append recoverable
  // after every possible retained prefix of an earlier failed append.
  const record = Buffer.from(`\n${recordText}\n`, "utf8");
  if (record.byteLength > INDEX_APPEND_MAX_BYTES) {
    throw new TypeError("SPOOL_INDEX_RECORD_TOO_LARGE");
  }
  let fd: number | undefined;
  try {
    fd = openSync(
      path,
      constants.O_APPEND
        | constants.O_CREAT
        | constants.O_NOFOLLOW
        | constants.O_RDWR,
      0o600,
    );
    const descriptor = fstatSync(fd, { bigint: true });
    const pathStat = lstatSync(path, { bigint: true });
    if (
      !descriptor.isFile()
      || !pathStat.isFile()
      || !sameIdentity(descriptor, pathStat)
    ) {
      throw new Error("SPOOL_INDEX_NOT_REGULAR");
    }
    if (descriptor.nlink !== 1n || pathStat.nlink !== 1n) {
      throw new Error("SPOOL_INDEX_NOT_UNIQUE");
    }
    const written = writeSync(fd, record, 0, record.length);
    fsyncSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (
      !after.isFile()
      || !afterPath.isFile()
      || after.nlink !== 1n
      || afterPath.nlink !== 1n
      || !sameIdentity(after, descriptor)
      || !sameIdentity(afterPath, descriptor)
    ) {
      throw new Error("SPOOL_INDEX_IDENTITY_CHANGED");
    }
    if (written !== record.length) throw new Error("SPOOL_INDEX_WRITE_INCOMPLETE");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function appendSpoolIndexBasename(options: {
  readonly directory: string;
  readonly basename: string;
}): void {
  if (!isIndexedSpoolBasename(options.basename)) {
    throw new TypeError("SPOOL_INDEX_BASENAME_INVALID");
  }
  appendSpoolIndexRecord(options.directory, options.basename);
}

export function appendSpoolIndexAdmissionRecord(options: {
  readonly directory: string;
  readonly basename: string;
  readonly proof: string;
}): void {
  appendSpoolIndexRecord(
    options.directory,
    encodeSpoolAdmissionIndexRecord(options),
  );
}

export function appendSpoolIndexRecoveryBytes(options: {
  readonly directory: string;
  readonly bytes: Buffer;
  readonly expectedIndexDev: string;
  readonly expectedIndexIno: string;
  readonly expectedIndexSize: number;
}): void {
  if (
    options.bytes.length <= 0
    || !isCanonicalDecimal(options.expectedIndexDev)
    || !isCanonicalDecimal(options.expectedIndexIno)
    || !Number.isSafeInteger(options.expectedIndexSize)
    || options.expectedIndexSize < 0
  ) {
    throw new TypeError("SPOOL_INDEX_RECOVERY_APPEND_INVALID");
  }
  const path = join(options.directory, SPOOL_INDEX_NAME);
  let fd: number | undefined;
  try {
    fd = openSync(
      path,
      constants.O_APPEND
        | constants.O_NOFOLLOW
        | constants.O_RDWR,
    );
    const descriptor = fstatSync(fd, { bigint: true });
    const pathStat = lstatSync(path, { bigint: true });
    if (
      !descriptor.isFile()
      || !pathStat.isFile()
      || descriptor.nlink !== 1n
      || pathStat.nlink !== 1n
      || !sameIdentity(descriptor, pathStat)
      || descriptor.dev.toString() !== options.expectedIndexDev
      || descriptor.ino.toString() !== options.expectedIndexIno
      || descriptor.size !== BigInt(options.expectedIndexSize)
    ) {
      throw new Error("SPOOL_INDEX_RECOVERY_BASE_CHANGED");
    }
    const written = writeSync(fd, options.bytes, 0, options.bytes.length);
    fsyncSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (
      !after.isFile()
      || !afterPath.isFile()
      || after.nlink !== 1n
      || afterPath.nlink !== 1n
      || !sameIdentity(after, descriptor)
      || !sameIdentity(afterPath, descriptor)
      || after.size !== descriptor.size + BigInt(written)
    ) {
      throw new Error("SPOOL_INDEX_RECOVERY_IDENTITY_CHANGED");
    }
    if (written !== options.bytes.length) {
      throw new Error("SPOOL_INDEX_RECOVERY_WRITE_INCOMPLETE");
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export async function readTypedIndexedSpoolPage(
  directory: string,
  expected?: TypedSpoolIndexExpectation,
): Promise<TypedSpoolIndexPage | undefined> {
  const indexPath = join(directory, SPOOL_INDEX_NAME);
  const cursorPath = join(directory, SPOOL_CURSOR_NAME);
  let indexHandle: FileHandle | undefined;
  let cursorHandle: FileHandle | undefined;
  try {
    indexHandle = await open(
      indexPath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const indexIdentity = await verifiedRegularHandle(indexHandle, indexPath);
    if (indexIdentity === undefined) return undefined;
    const indexStat = await indexHandle.stat();
    if (
      !Number.isSafeInteger(indexStat.size)
      || indexStat.size <= 0
    ) {
      return undefined;
    }
    if (
      expected !== undefined
      && (
        !isCanonicalDecimal(expected.indexDev)
        || !isCanonicalDecimal(expected.indexIno)
        || !Number.isSafeInteger(expected.prefixBytes)
        || expected.prefixBytes <= 0
        || indexIdentity.dev.toString() !== expected.indexDev
        || indexIdentity.ino.toString() !== expected.indexIno
        || indexStat.size < expected.prefixBytes
      )
    ) {
      return undefined;
    }
    if (!(await stillVerifiedRegularHandle(indexHandle, indexPath, indexIdentity))) {
      return undefined;
    }
    const cursor = await openCursor(directory);
    if (cursor === undefined) return undefined;
    cursorHandle = cursor.handle;
    const selected = await selectCursor(
      cursorHandle,
      indexIdentity,
      indexStat.size,
    );
    const offset = selected === undefined || selected.record.offset >= indexStat.size
      ? 0
      : selected.record.offset;
    let discardingContinuation = false;
    if (offset > 0) {
      const predecessor = Buffer.alloc(1);
      const prior = await indexHandle.read(predecessor, 0, 1, offset - 1);
      if (prior.bytesRead !== 1) return undefined;
      discardingContinuation = predecessor[0] !== 0x0a;
    }
    const maximumRead = Math.min(INDEX_PAGE_MAX_BYTES, indexStat.size - offset);
    const page = Buffer.alloc(maximumRead);
    const result = await indexHandle.read(page, 0, maximumRead, offset);
    if (result.bytesRead <= 0) return undefined;
    const parsedRecords: SpoolIndexRecord[] = [];
    let recordStart = 0;
    let records = 0;
    let consumed = 0;
    for (let position = 0; position < result.bytesRead; position += 1) {
      if (page[position] !== 0x0a) continue;
      if (discardingContinuation) {
        discardingContinuation = false;
        records += 1;
        consumed = position + 1;
        recordStart = consumed;
        if (records === INDEX_PAGE_MAX_RECORDS) break;
        continue;
      }
      const recordBytes = position - recordStart;
      const candidate = page.subarray(recordStart, position).toString("utf8");
      if (
        recordBytes > 0
        && recordBytes + 1 <= INDEX_RECORD_MAX_BYTES
      ) {
        const recordEndOffset = offset + position + 1;
        if (isIndexedSpoolBasename(candidate)) {
          parsedRecords.push(Object.freeze({
            kind: "writer",
            basename: candidate,
            recordEndOffset,
          }));
        } else {
          const admission = parseSpoolAdmissionIndexRecord(candidate);
          if (admission !== undefined) {
            parsedRecords.push(Object.freeze({
              kind: "admission",
              basename: admission.basename,
              proof: admission.proof,
              recordEndOffset,
            }));
          }
        }
      }
      records += 1;
      consumed = position + 1;
      recordStart = consumed;
      if (records === INDEX_PAGE_MAX_RECORDS) break;
    }
    if (
      records < INDEX_PAGE_MAX_RECORDS
      && (offset + result.bytesRead >= indexStat.size || consumed === 0)
    ) {
      // A current writer appends a complete bounded record in one syscall. Any
      // remaining fragment at the observed EOF, or a full page with no newline,
      // is a failed/hostile legacy append and must not pin the cursor. A partial
      // record before EOF is retained for the next bounded page.
      consumed = result.bytesRead;
    }
    const nextOffset = offset + consumed;
    if (
      consumed <= 0
      || !(await stillVerifiedRegularHandle(indexHandle, indexPath, indexIdentity))
      || !(await persistCursor(
        cursorHandle,
        cursorPath,
        cursor.identity,
        selected,
        indexIdentity,
        nextOffset,
      ))
    ) {
      return undefined;
    }
    return Object.freeze({
      indexDev: indexIdentity.dev.toString(),
      indexIno: indexIdentity.ino.toString(),
      indexSize: indexStat.size,
      records: Object.freeze(parsedRecords),
    });
  } catch {
    return undefined;
  } finally {
    await cursorHandle?.close().catch(() => undefined);
    await indexHandle?.close().catch(() => undefined);
  }
}

export async function readIndexedSpoolPage(
  directory: string,
): Promise<readonly string[]> {
  const page = await readTypedIndexedSpoolPage(directory);
  if (page === undefined) return [];
  return Object.freeze(page.records
    .filter((record): record is WriterSpoolIndexRecord => record.kind === "writer")
    .map((record) => record.basename));
}
