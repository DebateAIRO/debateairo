import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomFillSync,
  randomInt,
  timingSafeEqual
} from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync
} from "node:fs";
import type { Dirent } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { parseEncodedArgon2id } from "./argon2-worker-pool.js";
import type {
  Argon2AuditParameters,
  Argon2PasswordParameters
} from "./argon2-worker-pool.js";

// This module deliberately does NOT import hash-wasm. Argon2 is reachable only
// through an injected executor backed by ./argon2-worker-pool.ts, whose worker
// thread is the single production importer. Importing hash-wasm here would put
// a memory-hard KDF back on the request/event-loop thread.
//
// The re-export below is value-safe: argon2-worker-pool.ts imports the worker's
// types with `import type`, which is erased, so nothing here can pull hash-wasm
// onto the main thread.
export {
  ARGON2_PROVISIONAL_BOUNDS,
  ARGON2ID_ENCODING_BOUNDS,
  Argon2InfrastructureError,
  Argon2WorkerPool,
  argon2EnvelopeRefusal,
  parseEncodedArgon2id,
  type Argon2idEncodingParameters,
  type Argon2AuditParameters,
  type Argon2FailureCode,
  type Argon2Lane,
  type Argon2PasswordParameters,
  type Argon2PoolStats,
  type Argon2WorkerHandle,
  type Argon2WorkerPoolOptions
} from "./argon2-worker-pool.js";

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export type AeadAad = readonly [
  schema: string,
  table: string,
  primaryKey: string,
  runId: string,
  ownerUserId: string,
  keyId: string,
  envelopeVersion: "1"
];

export interface CryptoEnvelope {
  readonly v: 1;
  readonly keyId: string;
  readonly nonce: string;
  readonly ct: string;
  readonly tag: string;
}

const CONTENT_ATTESTATION_SECRET_DOMAIN = "debateai:run-content:db-envelope-attestation-secret:v1\0";
const CONTENT_ATTESTATION_BINDING_DOMAIN = "debateai:content-envelope-attestation:v2";

function encodeAttestationField(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([
    Buffer.from(bytes.byteLength.toString().padStart(10, "0") + ":", "ascii"),
    bytes
  ]);
}

export function canonicalContentEnvelopeAttestationBytes(input: {
  readonly runId: string;
  readonly carrier: string;
  readonly primaryKey: string;
  readonly purpose: string;
  readonly envelope: CryptoEnvelope;
}): Buffer {
  const fields = [
    CONTENT_ATTESTATION_BINDING_DOMAIN,
    "2",
    input.runId.toLowerCase(),
    input.carrier,
    input.primaryKey,
    input.purpose,
    String(input.envelope.v),
    input.envelope.keyId,
    input.envelope.nonce,
    input.envelope.ct,
    input.envelope.tag
  ];
  return Buffer.concat(fields.map(encodeAttestationField));
}

export class CryptoError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

export class CryptoAuthenticationError extends CryptoError {
  constructor() {
    super("CRYPTO_AUTHENTICATION_FAILED", "CRYPTO_AUTHENTICATION_FAILED");
    this.name = "CryptoAuthenticationError";
  }
}

export class KekUnresolvedError extends CryptoError {
  constructor() {
    super("KEK_UNRESOLVED", "KEK_UNRESOLVED");
    this.name = "KekUnresolvedError";
  }
}

/**
 * A key file that exists but does not satisfy the custody contract. Distinct
 * from KEK_UNRESOLVED (nothing is configured at that path) so an operator can
 * tell "you did not provision this" from "this file is not safe to trust".
 */
export class CryptoCustodyError extends CryptoError {
  constructor(code: "KEK_CUSTODY_INVALID" | "SECRET_CUSTODY_INVALID") {
    super(code, code);
    this.name = "CryptoCustodyError";
  }
}

/**
 * `DEBATEAI_CUSTODY_GROUP` is configured but does not name a group this host
 * knows. Deliberately NOT a silent fall-back to the single-owner contract:
 * an operator who mistypes the group would otherwise get a deployment that
 * boots and then refuses every key file for an unrelated-looking reason.
 */
export class CustodyGroupUnresolvedError extends CryptoError {
  constructor() {
    super("CUSTODY_GROUP_UNRESOLVED", "CUSTODY_GROUP_UNRESOLVED");
    this.name = "CustodyGroupUnresolvedError";
  }
}

/** The handle's master copy has been zeroed; it can never be revived. */
export class KekDestroyedError extends CryptoError {
  constructor() {
    super("KEK_DESTROYED", "KEK_DESTROYED");
    this.name = "KekDestroyedError";
  }
}

class CryptoInputError extends CryptoError {
  constructor(code:
    | "CRYPTO_AAD_INVALID"
    | "CRYPTO_AUDIT_CHAIN_INVALID"
    | "CRYPTO_CANONICAL_VALUE_INVALID"
    | "CRYPTO_EMAIL_INVALID"
    | "CRYPTO_KEY_INVALID"
    | "CRYPTO_TOKEN_KIND_INVALID") {
    super(code, code);
    this.name = "CryptoInputError";
  }
}

declare const kekHandleBrand: unique symbol;
export interface KekHandle {
  readonly [kekHandleBrand]: true;
}

const kekMaterials = new WeakMap<KekHandle, Buffer>();
const destroyedKekHandles = new WeakSet<KekHandle>();

/**
 * Short-lived working copy for one encrypt/decrypt. Pooled on purpose: this is
 * the per-message path, and every caller zeroes it in a `finally`.
 */
function copyKey(material: Uint8Array): Buffer {
  const key = Buffer.from(material);
  if (key.byteLength !== KEY_BYTES) {
    key.fill(0);
    throw new CryptoInputError("CRYPTO_KEY_INVALID");
  }
  return key;
}

/**
 * L2-F7: `Buffer.from` of a 32-byte source is served from Node's shared 8 KiB
 * pool slab, so the copy sits adjacent to unrelated allocations and `fill(0)`
 * erases only the view — the bytes stay in the slab until it is reused.
 * `allocUnsafeSlow` gives the key its own exactly-sized allocation that zeroing
 * really erases. Reserved for the long-lived master copies and the key-file
 * reads: a non-pooled allocation per message would cost RSS and GC for no
 * benefit, since those copies are zeroed immediately anyway.
 */
function isolatedKeyCopy(material: Uint8Array): Buffer {
  if (material.byteLength !== KEY_BYTES) throw new CryptoInputError("CRYPTO_KEY_INVALID");
  const key = Buffer.allocUnsafeSlow(KEY_BYTES);
  key.set(material);
  return key;
}

function makeKekHandle(material: Uint8Array): KekHandle {
  const key = isolatedKeyCopy(material);
  const handle = Object.freeze(Object.create(null)) as KekHandle;
  kekMaterials.set(handle, key);
  return handle;
}

function readKek(handle: KekHandle): Buffer {
  const material = kekMaterials.get(handle);
  if (material === undefined) {
    // A destroyed handle is a shutdown-ordering fault, not a missing config.
    if (destroyedKekHandles.has(handle)) throw new KekDestroyedError();
    throw new KekUnresolvedError();
  }
  return copyKey(material);
}

const KEK_ID_DOMAIN = "debateai:kek-id:v1\0";
const KEK_ID_BYTES = 8;

/**
 * V-3. A stable, NON-SECRET label for a KEK, written into every wrapped-key
 * record so a rotation can tell which master key wrapped it without trying to
 * decrypt. Eight bytes of a domain-separated SHA-256 over the 32-byte key, the
 * same shape every key-management system uses for a key id: a 64-bit truncation
 * of a hash of a high-entropy secret is not a practical route back to it, and
 * the domain string keeps this digest from colliding with any other use of the
 * same bytes.
 */
export function kekId(kek: KekHandle): string {
  const material = readKek(kek);
  try {
    return createHash("sha256")
      .update(KEK_ID_DOMAIN, "utf8")
      .update(material)
      .digest()
      .subarray(0, KEK_ID_BYTES)
      .toString("hex");
  } finally {
    material.fill(0);
  }
}

/**
 * The keys a process may unwrap with during a changeover. `previous` is absent
 * in the steady state, which is the whole point: an operator retires the old
 * KEK by deleting the setting once a verification pass is clean.
 */
export interface KekRing {
  readonly current: KekHandle;
  readonly previous?: KekHandle | undefined;
}

/** Every store still accepts a bare handle, which means "current, no previous". */
export type KekSource = KekHandle | KekRing;

function toKekRing(source: KekSource): KekRing {
  if (!("current" in source)) return { current: source };
  if (source.previous !== undefined) {
    // A "previous" key that IS the current one is not a changeover. Every
    // record would look already-current whichever key really wrapped it, and a
    // verification pass over it would mean nothing. The support port refuses
    // the same shape; the file stores used to accept it silently.
    const current = readKek(source.current);
    const previous = readKek(source.previous);
    try {
      if (current.byteLength === previous.byteLength
        && timingSafeEqual(current, previous)) {
        throw new CryptoError("KEK_RING_NOT_A_CHANGEOVER", "KEK_RING_NOT_A_CHANGEOVER");
      }
    } finally {
      current.fill(0);
      previous.fill(0);
    }
  }
  return source;
}

/**
 * Chooses the KEK for one record and unwraps with it.
 *
 * A LABELLED record is authoritative: the label names exactly one key, and a
 * process holding neither that key nor a previous one refuses rather than
 * try-decrypting its way in. An UNLABELLED record — everything written before
 * V-3 — is "wrapped by the original KEK", which during a changeover may be
 * either key, so those two are tried in turn. That fallback is bounded to the
 * two keys the process already holds and disappears record by record as the
 * rotation re-writes each one labelled.
 */
function unwrapUnderRing(
  ring: KekRing,
  label: string | undefined,
  envelope: CryptoEnvelope,
  aad: AeadAad
): Buffer {
  if (label === undefined) {
    try {
      return unwrapDek(ring.current, envelope, aad);
    } catch (error) {
      if (ring.previous === undefined) throw error;
      return unwrapDek(ring.previous, envelope, aad);
    }
  }
  if (label === kekId(ring.current)) return unwrapDek(ring.current, envelope, aad);
  if (ring.previous !== undefined && label === kekId(ring.previous)) {
    return unwrapDek(ring.previous, envelope, aad);
  }
  throw new KekUnresolvedError();
}

/**
 * Zeroes the KEK master copy and forgets the handle (L2-F7). Idempotent, so the
 * shutdown lifecycle may run it on both the signal and the controller path.
 * Every later wrap/unwrap through this handle fails closed with KEK_DESTROYED.
 */
export function destroyKek(handle: KekHandle): void {
  const material = kekMaterials.get(handle);
  if (material !== undefined) {
    material.fill(0);
    kekMaterials.delete(handle);
  }
  destroyedKekHandles.add(handle);
}

function canonicalCandidatePath(candidate: string): string {
  let cursor = resolve(candidate);
  const suffix: string[] = [];
  while (true) {
    try {
      return join(realpathSync(cursor), ...suffix);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      suffix.unshift(basename(cursor));
      cursor = parent;
    }
  }
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}${sep}`) || right.startsWith(`${left}${sep}`);
}

/**
 * Fail closed if any configured secret path or store root aliases another.
 *
 * L2-F8: this ran only when publication was enabled, so a private-only
 * deployment could point KEK_PATH and BLIND_INDEX_KEY_PATH at one file and
 * silently make the KEK the email HMAC key — after which "rotating the blind
 * index" would be a KEK rotation. The corpus KEK and publication store are now
 * optional and every other domain is checked unconditionally. A private-only
 * violation reports SECRET_DOMAIN_MUST_BE_SEPARATE; the publication pair keeps
 * its established PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE code.
 */
export function assertPublicationSecretDomains(input: Readonly<{
  privateKek: KekHandle;
  corpusKek?: KekHandle | undefined;
  privateKekPath: string;
  corpusKekPath?: string | undefined;
  privateStorePath: string;
  publicationStorePath?: string | undefined;
  additionalSecrets?: readonly Readonly<{
    path: string;
    material: Uint8Array;
  }>[];
  additionalStorePaths?: readonly string[];
}>): void {
  const code = input.corpusKek === undefined
    ? "SECRET_DOMAIN_MUST_BE_SEPARATE"
    : "PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE";
  const materials: Buffer[] = [];
  try {
    materials.push(readKek(input.privateKek));
    if (input.corpusKek !== undefined) materials.push(readKek(input.corpusKek));
    for (const secret of input.additionalSecrets ?? []) {
      materials.push(copyKey(secret.material));
    }
    for (let leftIndex = 0; leftIndex < materials.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < materials.length; rightIndex += 1) {
        if (timingSafeEqual(materials[leftIndex]!, materials[rightIndex]!)) {
          throw new TypeError(code);
        }
      }
    }
  } finally {
    for (const material of materials) material.fill(0);
  }
  const paths = [
    canonicalCandidatePath(input.privateKekPath),
    canonicalCandidatePath(input.privateStorePath),
    ...(input.corpusKekPath === undefined ? [] : [canonicalCandidatePath(input.corpusKekPath)]),
    ...(input.publicationStorePath === undefined
      ? [] : [canonicalCandidatePath(input.publicationStorePath)]),
    ...(input.additionalSecrets ?? []).map((secret) => canonicalCandidatePath(secret.path)),
    ...(input.additionalStorePaths ?? []).map(canonicalCandidatePath)
  ];
  for (let leftIndex = 0; leftIndex < paths.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < paths.length; rightIndex += 1) {
      const left = paths[leftIndex]!;
      const right = paths[rightIndex]!;
      if (pathsOverlap(left, right)) {
        throw new TypeError(code);
      }
      try {
        const leftStat = statSync(left);
        const rightStat = statSync(right);
        if (leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino) {
          throw new TypeError(code);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

function validateAad(aad: AeadAad): void {
  if (!Array.isArray(aad) || aad.length !== 7 || aad[6] !== "1"
    || aad.some((component) => typeof component !== "string" || component.length === 0)) {
    throw new CryptoInputError("CRYPTO_AAD_INVALID");
  }
}

function authenticatedData(envelopeVersion: 1, envelopeKeyId: string, aad: AeadAad): Buffer {
  validateAad(aad);
  return Buffer.from(JSON.stringify([envelopeVersion, envelopeKeyId, aad]), "utf8");
}

function decodeBase64(value: string): Buffer {
  if (typeof value !== "string") throw new CryptoAuthenticationError();
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new CryptoAuthenticationError();
  return decoded;
}

export function generateDek(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function encrypt(dek: Uint8Array, plaintext: Uint8Array, aad: AeadAad): CryptoEnvelope {
  const key = copyKey(dek);
  try {
    validateAad(aad);
    const envelopeKeyId = aad[5];
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: AUTH_TAG_BYTES });
    cipher.setAAD(authenticatedData(1, envelopeKeyId, aad));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Accepted residual: AES-GCM-SIV/XChaCha20 would add nonce-misuse resistance.
    // Until that upgrade, every call draws a fresh 96-bit nonce and per-DEK use
    // must remain well below the nonce birthday bound.
    return Object.freeze({
      v: 1,
      keyId: envelopeKeyId,
      nonce: nonce.toString("base64"),
      ct: ciphertext.toString("base64"),
      tag: tag.toString("base64")
    });
  } finally {
    key.fill(0);
  }
}

export function decrypt(dek: Uint8Array, envelope: CryptoEnvelope, aad: AeadAad): Buffer {
  let key: Buffer | undefined;
  try {
    key = copyKey(dek);
    validateAad(aad);
    if (envelope.v !== 1 || envelope.keyId !== aad[5]) {
      throw new CryptoAuthenticationError();
    }
    const nonce = decodeBase64(envelope.nonce);
    const ciphertext = decodeBase64(envelope.ct);
    const tag = decodeBase64(envelope.tag);
    if (nonce.byteLength !== NONCE_BYTES || tag.byteLength !== AUTH_TAG_BYTES) {
      throw new CryptoAuthenticationError();
    }
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: AUTH_TAG_BYTES });
    decipher.setAAD(authenticatedData(envelope.v, envelope.keyId, aad));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    if (error instanceof CryptoInputError && error.code === "CRYPTO_KEY_INVALID") throw error;
    if (error instanceof CryptoAuthenticationError) throw error;
    throw new CryptoAuthenticationError();
  } finally {
    key?.fill(0);
  }
}

/**
 * The POSIX group database. Not a one-computer path (constraint 7): it is the
 * same location on every Unix host, and a deployment that does not have one can
 * configure the gid as a decimal number instead, which is resolved without
 * reading any file at all.
 */
const POSIX_GROUP_DATABASE = "/etc/group";

/** `name:password:gid:members` — POSIX group-database name grammar. */
const GROUP_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*\$?$/;

/**
 * Finds `name`'s gid in the text of a POSIX group database. Pure, so the whole
 * grammar is testable without a host that happens to have the group.
 */
export function parseGroupDatabaseGid(database: string, name: string): number | undefined {
  if (typeof database !== "string" || typeof name !== "string" || name === "") return undefined;
  for (const line of database.split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    const fields = line.split(":");
    if (fields.length < 3 || fields[0] !== name) continue;
    const gid = fields[2]!;
    if (!/^[0-9]+$/.test(gid)) return undefined;
    const parsed = Number(gid);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Resolves the configured custody group to a gid. `undefined` means the group
 * mode is OFF and the contract is exactly the single-owner one. Anything that
 * is configured but cannot be resolved throws: a custody rule must never be
 * decided by a value nobody could read.
 */
export function resolveCustodyGroupGid(
  configured: string | undefined,
  readGroupDatabase: () => string
): number | undefined {
  if (configured === undefined) return undefined;
  const value = configured.trim();
  if (value === "") return undefined;
  if (/^[0-9]+$/.test(value)) {
    const gid = Number(value);
    if (!Number.isSafeInteger(gid)) throw new CustodyGroupUnresolvedError();
    return gid;
  }
  if (!GROUP_NAME.test(value)) throw new CustodyGroupUnresolvedError();
  let database: string;
  try {
    database = readGroupDatabase();
  } catch {
    throw new CustodyGroupUnresolvedError();
  }
  const gid = parseGroupDatabaseGid(database, value);
  if (gid === undefined) throw new CustodyGroupUnresolvedError();
  return gid;
}

// Default: no group, so the contract is the single-owner one until a
// composition root says otherwise. A process that never configures anything
// therefore gets the STRICTER rule, which is the right way round.
let custodyGroupGid: number | undefined;

/**
 * V-19. The composition root hands the value of `DEBATEAI_CUSTODY_GROUP`
 * through, already parsed by the register loader — this package never reads the
 * process environment itself (the structural purity law), and the group is
 * resolved ONCE here rather than on every record read, which matters because
 * the wrapped-key stores consult the contract per request and a group NAME
 * would otherwise re-read the group database every time.
 *
 * Resolving eagerly is also what makes a misconfigured group a boot failure:
 * `CUSTODY_GROUP_UNRESOLVED` is thrown here, before the first key is opened.
 * Call it with `undefined` to return to the single-owner contract.
 */
export function configureCustodyGroup(configured: string | undefined): void {
  // Cleared first, so a resolution that throws leaves the STRICTEST contract
  // behind rather than whatever group happened to be configured before it.
  custodyGroupGid = undefined;
  custodyGroupGid = resolveCustodyGroupGid(
    configured,
    () => readFileSync(POSIX_GROUP_DATABASE, "utf8")
  );
}

function currentCustodyGid(): number | undefined {
  return custodyGroupGid;
}

export type CustodyFileFacts = Readonly<{
  isFile: boolean;
  nlink: number;
  mode: number;
  uid: number;
  gid: number;
  size: number;
}>;

export type CustodyParentFacts = Readonly<{
  isDirectory: boolean;
  mode: number;
  uid: number;
  gid: number;
}>;

export type CustodyContract = Readonly<{
  /** `undefined` on a platform without uids, exactly as the uid rule has always been. */
  callerUid: number | undefined;
  /** `undefined` = the group mode is off and the contract is the single-owner one. */
  custodyGid: number | undefined;
  /** `undefined` for the JSON wrapped-key records, which are not 32-byte keys. */
  expectedSize: number | undefined;
}>;

/**
 * One accepted mode owned by the caller, or — only while a custody group is
 * configured — one accepted mode whose gid is that group's. Exact equality, so
 * a world bit, a group-write bit, an execute bit or a stranger's gid can never
 * pass: the refusals are consequences of the equality, not separate branches
 * that could drift apart from it.
 */
function custodyMemberAccepts(
  facts: Readonly<{ mode: number;uid: number;gid: number }>,
  ownerMode: number,
  groupMode: number,
  contract: CustodyContract
): boolean {
  const permissions = facts.mode & 0o777;
  if (permissions === ownerMode) {
    return contract.callerUid === undefined || facts.uid === contract.callerUid;
  }
  if (contract.custodyGid !== undefined && permissions === groupMode) {
    return facts.gid === contract.custodyGid;
  }
  return false;
}

/**
 * The V-19 custody contract, as one decision over facts already taken from the
 * opened descriptor. With `custodyGid: undefined` it decides byte-for-byte what
 * the single-owner rule decided before the group mode existed:
 * 0600 file owned by the caller, one link, exact size, inside a 0700 directory
 * owned by the caller. With a custody group configured it additionally accepts
 * a 0640 file whose gid is that group's inside a 0750 directory whose gid is
 * that group's — which is how a second read-only principal reads the store
 * without ever being able to replace what is in it.
 */
export function custodyAccepts(
  file: CustodyFileFacts,
  parent: CustodyParentFacts,
  contract: CustodyContract
): boolean {
  if (!file.isFile || file.nlink !== 1) return false;
  if (contract.expectedSize !== undefined && file.size !== contract.expectedSize) return false;
  if (!parent.isDirectory) return false;
  // One owner for the record and the directory holding it. In the single-owner
  // contract this is already implied (both must be the caller); in group mode
  // the FILE's uid is deliberately free, and without this a directory owned by
  // some other principal — who could therefore replace the record — would pass.
  if (file.uid !== parent.uid) return false;
  if (!custodyMemberAccepts(file, 0o600, 0o640, contract)) return false;
  return custodyMemberAccepts(parent, 0o700, 0o750, contract);
}

/**
 * The production custody contract for a raw 32-byte secret file (L2-F6). It is
 * the discipline `apps/runner/src/dev-secret-files.ts` already enforced for dev
 * secrets, which the production loaders did not:
 *
 * - `O_NOFOLLOW` so a symlinked key path is refused rather than followed;
 * - every check taken from `fstat` on the descriptor actually read, so there is
 *   no stat -> read window another process can slip through;
 * - `uid` owned by this process, `nlink === 1` (no second name for the key),
 *   exact 0600, exact 32 bytes;
 * - a 0700 parent owned by the same uid, because a key anyone may replace is
 *   not a key.
 *
 * The bytes land in an exactly-sized `allocUnsafeSlow` buffer (L2-F7) so the
 * caller's `fill(0)` really erases them instead of a shared pool slab.
 */
function readCustodyKey(
  path: string,
  code: "KEK_CUSTODY_INVALID" | "SECRET_CUSTODY_INVALID"
): Buffer {
  let descriptor: number;
  try {
    descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    // Nothing provisioned at all stays the configuration code. ELOOP means the
    // path WAS a symlink, which is a custody decision, not a missing file.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new KekUnresolvedError();
    throw new CryptoCustodyError(code);
  }
  let material: Buffer | undefined;
  try {
    const metadata = fstatSync(descriptor);
    const parent = statSync(dirname(resolve(path)));
    if (!custodyAccepts(
      {
        isFile: metadata.isFile(),
        nlink: metadata.nlink,
        mode: metadata.mode,
        uid: metadata.uid,
        gid: metadata.gid,
        size: metadata.size
      },
      {
        isDirectory: parent.isDirectory(),
        mode: parent.mode,
        uid: parent.uid,
        gid: parent.gid
      },
      {
        callerUid: typeof process.getuid === "function" ? process.getuid() : undefined,
        custodyGid: currentCustodyGid(),
        expectedSize: KEY_BYTES
      }
    )) {
      throw new CryptoCustodyError(code);
    }
    material = Buffer.allocUnsafeSlow(KEY_BYTES);
    if (readSync(descriptor, material, 0, KEY_BYTES, 0) !== KEY_BYTES) {
      throw new CryptoCustodyError(code);
    }
    return material;
  } catch (error) {
    material?.fill(0);
    // A misconfigured custody group is an operator error, not an unsafe key:
    // it keeps its own code all the way out so the boot message names it.
    if (error instanceof CustodyGroupUnresolvedError) throw error;
    if (error instanceof CryptoCustodyError || error instanceof KekUnresolvedError) throw error;
    throw new CryptoCustodyError(code);
  } finally {
    try {
      closeSync(descriptor);
    } catch {
      // The key is already read or already refused; a failed close must not
      // turn a good load into a custody refusal.
    }
  }
}

export function loadKek(pathOrBuffer: string | Uint8Array): KekHandle {
  if (typeof pathOrBuffer !== "string") {
    try {
      return makeKekHandle(pathOrBuffer);
    } catch {
      throw new KekUnresolvedError();
    }
  }
  const material = readCustodyKey(pathOrBuffer, "KEK_CUSTODY_INVALID");
  try {
    return makeKekHandle(material);
  } catch {
    throw new KekUnresolvedError();
  } finally {
    material.fill(0);
  }
}

export function loadSecretKey(path: string): Buffer {
  const material = readCustodyKey(path, "SECRET_CUSTODY_INVALID");
  try {
    return copyKey(material);
  } catch (error) {
    if (error instanceof CryptoInputError) throw error;
    throw new KekUnresolvedError();
  } finally {
    material.fill(0);
  }
}

export function wrapDek(kek: KekHandle, dek: Uint8Array, aad: AeadAad): CryptoEnvelope {
  const key = readKek(kek);
  try {
    return encrypt(key, dek, aad);
  } finally {
    key.fill(0);
  }
}

export function unwrapDek(kek: KekHandle, envelope: CryptoEnvelope, aad: AeadAad): Buffer {
  const key = readKek(kek);
  try {
    const dek = decrypt(key, envelope, aad);
    if (dek.byteLength !== KEY_BYTES) {
      dek.fill(0);
      throw new CryptoAuthenticationError();
    }
    return dek;
  } finally {
    key.fill(0);
  }
}

export type AuditEventPayload = Readonly<Record<string, unknown>>;

export type ChainedAuditEvent<T extends AuditEventPayload = AuditEventPayload> = Readonly<T & {
  readonly prevHash: string | null;
  readonly thisHash: string;
}>;

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CryptoInputError("CRYPTO_CANONICAL_VALUE_INVALID");
    return JSON.stringify(value);
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return canonicalJson({ $bytes: Buffer.from(value).toString("base64") });
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CryptoInputError("CRYPTO_CANONICAL_VALUE_INVALID");
    }
    const entries = Object.entries(value as Readonly<Record<string, unknown>>)
      // UTF-16 code-unit order: locale-independent and identical to the SQL
      // chain's COLLATE "C" order for the ASCII keys the audit rows use (L2-F4).
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) =>
      `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new CryptoInputError("CRYPTO_CANONICAL_VALUE_INVALID");
}

function validateAuditHash(hash: string): void {
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new CryptoInputError("CRYPTO_AUDIT_CHAIN_INVALID");
  }
}

function auditHash(prevHash: string | null, payload: AuditEventPayload): string {
  if (prevHash !== null) validateAuditHash(prevHash);
  if (Object.hasOwn(payload, "prevHash") || Object.hasOwn(payload, "thisHash")) {
    throw new CryptoInputError("CRYPTO_AUDIT_CHAIN_INVALID");
  }
  const digest = createHash("sha256");
  if (prevHash !== null) digest.update(Buffer.from(prevHash, "hex"));
  digest.update(canonicalJson(payload), "utf8");
  return digest.digest("hex");
}

/**
 * Appends one logical audit row with this_hash = H(prev_hash || canonical(payload)).
 * The payload deliberately excludes both hash columns; prev_hash comes solely
 * from the verified predecessor, so callers cannot construct a fork by accident.
 */
export function appendAuditEvent<T extends AuditEventPayload>(
  previous: ChainedAuditEvent | string | null,
  payload: T
): ChainedAuditEvent<T> {
  const prevHash = typeof previous === "string" ? previous : previous?.thisHash ?? null;
  const thisHash = auditHash(prevHash, payload);
  return Object.freeze({ ...payload, prevHash, thisHash });
}

/**
 * Verifies genesis, every predecessor link, and every row digest. Supplying an
 * externally retained expected head additionally detects tail truncation.
 */
export function verifyChain(
  chain: readonly ChainedAuditEvent[],
  expectedHeadHash?: string
): boolean {
  try {
    let expectedPrev: string | null = null;
    for (const event of chain) {
      if (event.prevHash !== expectedPrev) return false;
      validateAuditHash(event.thisHash);
      const { prevHash: _prevHash, thisHash: _thisHash, ...payload } = event;
      if (auditHash(expectedPrev, payload) !== event.thisHash) return false;
      expectedPrev = event.thisHash;
    }
    if (expectedHeadHash !== undefined) {
      validateAuditHash(expectedHeadHash);
      return expectedPrev === expectedHeadHash;
    }
    return true;
  } catch {
    return false;
  }
}

export function normalizeEmailForBlindIndex(email: string): string {
  const normalized = email.normalize("NFKC").trim().toLowerCase();
  if (normalized.length === 0 || !normalized.includes("@")) {
    throw new CryptoInputError("CRYPTO_EMAIL_INVALID");
  }
  return normalized;
}

/**
 * Deterministic login lookup only. The key is global, separate from the KEK,
 * and independently rotatable. If an attacker compromises both the database
 * and this key, email's small domain permits offline enumeration; callers must
 * never treat the blind index as encryption or expose the key to the database.
 */
export function createEmailBlindIndex(key: Uint8Array, email: string): Buffer {
  const material = copyKey(key);
  try {
    return createHmac("sha256", material)
      .update(normalizeEmailForBlindIndex(email), "utf8")
      .digest();
  } finally {
    material.fill(0);
  }
}

export const emailBlindIndex = createEmailBlindIndex;

export interface Argon2idParameters {
  readonly memoryCostKiB: number;
  readonly timeCost: number;
  readonly parallelism: number;
  readonly hashLength: number;
}

export interface AuditSourceIpKdfParameters {
  readonly algorithm: "argon2id";
  readonly memoryCostKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly hashLength: 32;
}

const AUDIT_SOURCE_IP_KDF_DOMAIN = "debateai:audit-source-ip:v1\0";
const AUDIT_USER_AGENT_KDF_DOMAIN = "debateai:audit-user-agent:v1\0";

/**
 * The off-thread Argon2 surface. `Argon2WorkerPool` satisfies it structurally;
 * tests inject deterministic fakes. Nothing in this module may compute Argon2
 * itself.
 */
export interface Argon2Executor {
  hashPassword(
    password: Uint8Array,
    salt: Uint8Array,
    parameters: Argon2PasswordParameters
  ): Promise<string>;
  verifyPassword(password: Uint8Array, encodedHash: string): Promise<boolean>;
  hashAuditContext(
    value: Uint8Array,
    salt: Uint8Array,
    parameters: Argon2AuditParameters
  ): Promise<string>;
}

/**
 * UTF-8 bytes in a freshly allocated, exactly-sized ArrayBuffer.
 *
 * `Buffer.from(string)` would draw from Node's shared allocation pool, and the
 * pool transfers these buffers to the worker thread — detaching a shared pool
 * buffer would corrupt unrelated live Buffers. TextEncoder always allocates its
 * own exact-size buffer.
 *
 * hash-wasm hashes a Uint8Array password exactly as it hashes the equivalent
 * UTF-8 string, so moving to byte transfer leaves every digest byte-identical.
 */
function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** A detachable, zeroable copy, so the caller's long-lived salt is never transferred. */
function copyBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

function validateAuditKdfParameters(
  value: string,
  salt: Uint8Array,
  parameters: AuditSourceIpKdfParameters
): void {
  if (value.length === 0 || salt.byteLength < 32 || parameters.algorithm !== "argon2id"
    || !Number.isInteger(parameters.memoryCostKiB) || parameters.memoryCostKiB < 19_456
    || !Number.isInteger(parameters.iterations) || parameters.iterations < 2
    || !Number.isInteger(parameters.parallelism) || parameters.parallelism < 1
    || parameters.hashLength !== 32) {
    throw new CryptoInputError("CRYPTO_KEY_INVALID");
  }
}

async function hashAuditContextValue(
  executor: Argon2Executor,
  value: string,
  salt: Uint8Array,
  parameters: AuditSourceIpKdfParameters,
  domain: string
): Promise<string> {
  validateAuditKdfParameters(value, salt, parameters);
  return executor.hashAuditContext(utf8Bytes(`${domain}${value}`), copyBytes(salt), {
    memoryCostKiB: parameters.memoryCostKiB,
    iterations: parameters.iterations,
    parallelism: parameters.parallelism,
    hashLength: parameters.hashLength
  });
}

export async function hashAuditSourceIp(
  executor: Argon2Executor,
  sourceIp: string,
  salt: Uint8Array,
  parameters: AuditSourceIpKdfParameters
): Promise<string> {
  return hashAuditContextValue(executor, sourceIp, salt, parameters, AUDIT_SOURCE_IP_KDF_DOMAIN);
}

export async function hashAuditUserAgent(
  executor: Argon2Executor,
  userAgent: string,
  salt: Uint8Array,
  parameters: AuditSourceIpKdfParameters
): Promise<string> {
  return hashAuditContextValue(executor, userAgent, salt, parameters, AUDIT_USER_AGENT_KDF_DOMAIN);
}

export async function hashPassword(
  executor: Argon2Executor,
  password: string,
  parameters: Argon2idParameters
): Promise<string> {
  if (typeof password !== "string" || password.length === 0
    || !Number.isInteger(parameters.memoryCostKiB) || parameters.memoryCostKiB < 19_456
    || !Number.isInteger(parameters.timeCost) || parameters.timeCost < 2
    || !Number.isInteger(parameters.parallelism) || parameters.parallelism < 1
    || !Number.isInteger(parameters.hashLength) || parameters.hashLength < 32) {
    throw new CryptoInputError("CRYPTO_KEY_INVALID");
  }
  const salt = new Uint8Array(16);
  randomFillSync(salt);
  return executor.hashPassword(utf8Bytes(password), salt, {
    memoryCostKiB: parameters.memoryCostKiB,
    timeCost: parameters.timeCost,
    parallelism: parameters.parallelism,
    hashLength: parameters.hashLength
  });
}

/**
 * A wrong password, or a stored encoding that is malformed, of another
 * algorithm/version, or outside the accepted cost envelope, is `false` — and
 * the out-of-envelope cases are decided HERE, before any memory-hard work, so
 * corrupted or hostile stored data can never drive an Argon2 allocation.
 *
 * Everything past that check is a real verification: infrastructure failure
 * (worker crash, job timeout, capacity exhaustion, closed pool, a compute path
 * that throws) propagates as a typed rejection and is never converted into
 * `false`, because `false` is indistinguishable from a wrong password and would
 * become a 401 for a user whose credentials are correct.
 */
export async function verifyPassword(
  executor: Argon2Executor,
  encodedHash: string,
  password: string
): Promise<boolean> {
  if (parseEncodedArgon2id(encodedHash) === undefined) return false;
  return executor.verifyPassword(utf8Bytes(password), encodedHash);
}

/**
 * The one launch TOTP profile. These values are deliberately not caller
 * options: allowing an algorithm, digit or period choice creates provisioning
 * URIs that mainstream authenticator applications silently misinterpret.
 */
export const TOTP_PROFILE = Object.freeze({
  algorithm: "SHA1" as const,
  digits: 6 as const,
  periodSeconds: 30 as const,
  secretBytes: 20 as const
});

const RFC4648_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_BASE32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function encodeBase32(input: Uint8Array): string {
  let bits = 0;
  let accumulator = 0;
  let encoded = "";
  for (const byte of input) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += RFC4648_BASE32[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) encoded += RFC4648_BASE32[(accumulator << (5 - bits)) & 31];
  return encoded;
}

export function decodeBase32(input: string): Buffer {
  const normalized = input.trim().toUpperCase();
  if (normalized === "" || normalized.includes("=") || !/^[A-Z2-7]+$/.test(normalized)) {
    throw new CryptoInputError("CRYPTO_CANONICAL_VALUE_INVALID");
  }
  let bits = 0;
  let accumulator = 0;
  const output: number[] = [];
  for (const symbol of normalized) {
    accumulator = (accumulator << 5) | RFC4648_BASE32.indexOf(symbol);
    bits += 5;
    if (bits >= 8) {
      output.push((accumulator >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (bits > 0 && (accumulator & ((1 << bits) - 1)) !== 0) {
    throw new CryptoInputError("CRYPTO_CANONICAL_VALUE_INVALID");
  }
  return Buffer.from(output);
}

export function generateTotpSecret(): Buffer {
  return randomBytes(TOTP_PROFILE.secretBytes);
}

function validTotpSecret(secret: Uint8Array): Buffer {
  const copy = Buffer.from(secret);
  if (copy.byteLength !== TOTP_PROFILE.secretBytes) {
    copy.fill(0);
    throw new CryptoInputError("CRYPTO_KEY_INVALID");
  }
  return copy;
}

export function totpCodeAtStep(secret: Uint8Array, step: number): string {
  if (!Number.isSafeInteger(step) || step < 0) {
    throw new CryptoInputError("CRYPTO_CANONICAL_VALUE_INVALID");
  }
  const material = validTotpSecret(secret);
  try {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const digest = createHmac("sha1", material).update(counter).digest();
    const offset = digest[digest.byteLength - 1]! & 0x0f;
    const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    return String(binary).padStart(TOTP_PROFILE.digits, "0");
  } finally {
    material.fill(0);
  }
}

export type TotpMatch =
  | Readonly<{ status: "accepted"; step: number }>
  | Readonly<{ status: "replayed" }>
  | Readonly<{ status: "invalid" }>;

export function matchTotpStep(
  secret: Uint8Array,
  code: string,
  currentStep: number,
  lastAcceptedStep: number | null
): TotpMatch {
  if (!/^\d{6}$/.test(code) || !Number.isSafeInteger(currentStep) || currentStep < 0
    || (lastAcceptedStep !== null && (!Number.isSafeInteger(lastAcceptedStep) || lastAcceptedStep < 0))) {
    return Object.freeze({ status: "invalid" as const });
  }
  const supplied = Buffer.from(code, "ascii");
  let replay = false;
  for (const candidate of [currentStep - 1, currentStep, currentStep + 1]) {
    if (candidate < 0) continue;
    const expected = Buffer.from(totpCodeAtStep(secret, candidate), "ascii");
    if (!timingSafeEqual(supplied, expected)) continue;
    if (lastAcceptedStep !== null && candidate <= lastAcceptedStep) replay = true;
    else return Object.freeze({ status: "accepted" as const, step: candidate });
  }
  return Object.freeze({ status: replay ? "replayed" as const : "invalid" as const });
}

export function totpProvisioningUri(
  secret: Uint8Array,
  input: { readonly issuer: string; readonly accountLabel: string }
): string {
  const issuer = input.issuer.trim();
  const accountLabel = input.accountLabel.trim();
  if (issuer === "" || accountLabel === "" || issuer.includes(":") || issuer.length > 64
    || accountLabel.length > 128) {
    throw new CryptoInputError("CRYPTO_CANONICAL_VALUE_INVALID");
  }
  const material = validTotpSecret(secret);
  try {
    const parameters = new URLSearchParams({
      secret: encodeBase32(material),
      issuer,
      algorithm: TOTP_PROFILE.algorithm,
      digits: String(TOTP_PROFILE.digits),
      period: String(TOTP_PROFILE.periodSeconds)
    });
    return `otpauth://totp/${encodeURIComponent(`${issuer}:${accountLabel}`)}?${parameters.toString()}`;
  } finally {
    material.fill(0);
  }
}

function recoverySymbols(random: Uint8Array): string {
  // RECOVERY_BASE32 has exactly 32 members, so every random 5-bit value maps
  // without modulo bias. Sixteen random bytes become 26 symbols (130 rendered
  // bits, with the final two padding bits carrying no entropy): 128 real bits.
  let bits = 0;
  let accumulator = 0;
  let encoded = "";
  for (const byte of random) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += RECOVERY_BASE32[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) encoded += RECOVERY_BASE32[(accumulator << (5 - bits)) & 31];
  return encoded;
}

export function generateRecoveryCode(slot: number): string {
  if (!Number.isInteger(slot) || slot < 1 || slot > 10) {
    throw new CryptoInputError("CRYPTO_CANONICAL_VALUE_INVALID");
  }
  const material = randomBytes(16);
  try {
    const symbols = recoverySymbols(material);
    const groups = symbols.match(/.{1,4}/g)!;
    return `${String(slot).padStart(2, "0")}-${groups.join("-")}`;
  } finally {
    material.fill(0);
  }
}

export function generateRecoveryCodes(): readonly string[] {
  return Object.freeze(Array.from({ length: 10 }, (_, index) => generateRecoveryCode(index + 1)));
}

export function normalizeRecoveryCode(code: string): string {
  const normalized = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!/^\d{2}-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){5}-[A-HJ-NP-Z2-9]{2}$/.test(normalized)) {
    throw new CryptoInputError("CRYPTO_CANONICAL_VALUE_INVALID");
  }
  const slot = Number(normalized.slice(0, 2));
  if (!Number.isInteger(slot) || slot < 1 || slot > 10) {
    throw new CryptoInputError("CRYPTO_CANONICAL_VALUE_INVALID");
  }
  return normalized;
}

export function recoveryCodeSlot(code: string): number {
  return Number(normalizeRecoveryCode(code).slice(0, 2));
}

const RECOVERY_CODE_KDF_DOMAIN = "debateai:recovery-code:v1\0";

export async function hashRecoveryCode(
  executor: Argon2Executor,
  code: string,
  parameters: Argon2idParameters
): Promise<string> {
  return hashPassword(executor, `${RECOVERY_CODE_KDF_DOMAIN}${normalizeRecoveryCode(code)}`, parameters);
}

export async function verifyRecoveryCode(
  executor: Argon2Executor,
  encodedHash: string,
  code: string
): Promise<boolean> {
  try {
    return await verifyPassword(
      executor, encodedHash, `${RECOVERY_CODE_KDF_DOMAIN}${normalizeRecoveryCode(code)}`
    );
  } catch (error) {
    if (error instanceof CryptoInputError) return false;
    throw error;
  }
}

/**
 * PROVISIONAL cache bounds, pending V ratification against measured evidence.
 */
export const AUDIT_SOURCE_IP_CACHE_BOUNDS = Object.freeze({
  capacity: 4_096,
  ttlMs: 60_000
});

const AUDIT_SOURCE_IP_CACHE_DOMAIN = "debateai:audit-source-ip-cache:v1";

interface AuditIpCacheEntry {
  digest: string | undefined;
  promise: Promise<string> | undefined;
  /** Absolute, on the MONOTONIC clock; set at insertion, never extended by a hit. */
  readonly expiresAt: number;
  /**
   * Strictly increasing per-hasher use counter, not a timestamp. Two hits in
   * the same millisecond still order deterministically, so eviction is true
   * LRU rather than whatever the map happened to iterate first.
   */
  useSequence: number;
}

export interface AuditContextHasherOptions {
  readonly capacity?: number;
  readonly ttlMs?: number;
  readonly now?: () => number;
}

/**
 * Owns the audit-context derivations for ONE salt/parameter epoch, plus the
 * ticket-authorized bounded per-IP cache.
 *
 * Privacy contract: only the normalized source IP derivation is cached. User
 * agents use the worker but are never cached — T1 authorizes a per-IP cache,
 * not broader retained UA state. Passwords, password verification, tokens,
 * email, request IDs and raw IP values are never cached.
 *
 * The map key is an HMAC under a fresh random process-local key over a
 * domain-separated canonical input that binds the normalized IP, a salt
 * fingerprint and the full KDF parameter tuple. It is a locator only and is
 * never persisted as the audit digest; a salt, parameter or domain change
 * necessarily misses, preserving VR-7 domain separation and rotation.
 */
export class AuditContextHasher {
  private readonly executor: Argon2Executor;
  private readonly salt: Buffer;
  private readonly parameters: AuditSourceIpKdfParameters;
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly cacheKey: Buffer;
  private readonly saltFingerprint: string;
  private readonly entries = new Map<string, AuditIpCacheEntry>();
  private useCounter = 0;
  private closed = false;

  constructor(
    executor: Argon2Executor,
    salt: Uint8Array,
    parameters: AuditSourceIpKdfParameters,
    options: AuditContextHasherOptions = {}
  ) {
    if (salt.byteLength < 32) throw new CryptoInputError("CRYPTO_KEY_INVALID");
    this.executor = executor;
    this.salt = Buffer.from(salt);
    this.parameters = Object.freeze({ ...parameters });
    this.capacity = options.capacity ?? AUDIT_SOURCE_IP_CACHE_BOUNDS.capacity;
    this.ttlMs = options.ttlMs ?? AUDIT_SOURCE_IP_CACHE_BOUNDS.ttlMs;
    // TTL correctness is a duration question, so the default clock is the
    // monotonic one. `Date.now` steps with NTP and manual clock changes: a
    // backward step makes an absolute expiry unreachable and keeps a derived
    // value past its ruled lifetime, a forward step discards fresh entries.
    this.now = options.now ?? (() => performance.now());
    this.cacheKey = randomBytes(32);
    this.saltFingerprint = createHash("sha256").update(this.salt).digest("hex");
  }

  /** Opaque keyed locator. Never plaintext, never an unkeyed digest. */
  private locator(normalizedIp: string): string {
    const canonical = JSON.stringify([
      AUDIT_SOURCE_IP_CACHE_DOMAIN,
      AUDIT_SOURCE_IP_KDF_DOMAIN,
      normalizedIp,
      this.saltFingerprint,
      this.parameters.algorithm,
      this.parameters.memoryCostKiB,
      this.parameters.iterations,
      this.parameters.parallelism,
      this.parameters.hashLength
    ]);
    return createHmac("sha256", this.cacheKey).update(canonical, "utf8").digest("hex");
  }

  /** Lazy, timer-free reclamation: expired first, then settled LRU. */
  private reclaim(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    while (this.entries.size >= this.capacity) {
      let oldestKey: string | undefined;
      let oldestSequence = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.entries) {
        // In-flight entries are never evicted: they are the coalescing point
        // for their own awaiters.
        if (entry.digest === undefined) continue;
        if (entry.useSequence < oldestSequence) {
          oldestSequence = entry.useSequence;
          oldestKey = key;
        }
      }
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }

  async hashSourceIp(normalizedIp: string): Promise<string> {
    if (this.closed) throw new CryptoInputError("CRYPTO_KEY_INVALID");
    validateAuditKdfParameters(normalizedIp, this.salt, this.parameters);
    const key = this.locator(normalizedIp);
    const now = this.now();
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      if (existing.expiresAt > now) {
        if (existing.digest !== undefined) {
          this.useCounter += 1;
          existing.useSequence = this.useCounter;
          // Byte-identical to a miss: the same Argon2 digest string.
          return existing.digest;
        }
        if (existing.promise !== undefined) return existing.promise;
      }
      this.entries.delete(key);
    }

    const promise = hashAuditContextValue(
      this.executor, normalizedIp, this.salt, this.parameters, AUDIT_SOURCE_IP_KDF_DOMAIN
    );

    this.reclaim();
    if (this.entries.size >= this.capacity) {
      // Capacity is entirely in-flight. Bypass insertion rather than exceed the
      // cap; the derivation still runs and still returns a correct digest.
      return promise;
    }
    this.useCounter += 1;
    const entry: AuditIpCacheEntry = {
      digest: undefined,
      promise,
      expiresAt: now + this.ttlMs,
      useSequence: this.useCounter
    };
    this.entries.set(key, entry);
    // In-flight entries count toward the cap from this moment.
    return promise.then((digest) => {
      if (this.entries.get(key) === entry) {
        entry.digest = digest;
        entry.promise = undefined;
        this.useCounter += 1;
        entry.useSequence = this.useCounter;
      }
      return digest;
    }, (error: unknown) => {
      // Never cache an error, and never leave a rejected in-flight entry
      // occupying capacity or coalescing later callers onto a failure.
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
  }

  /** Worker-backed but deliberately uncached. */
  async hashUserAgent(normalizedUserAgent: string): Promise<string> {
    if (this.closed) throw new CryptoInputError("CRYPTO_KEY_INVALID");
    return hashAuditContextValue(
      this.executor, normalizedUserAgent, this.salt, this.parameters, AUDIT_USER_AGENT_KDF_DOMAIN
    );
  }

  cacheSize(): number {
    return this.entries.size;
  }

  /** Idempotent. Clears cached entries and zeroes the HMAC key and salt copy. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.entries.clear();
    this.cacheKey.fill(0);
    this.salt.fill(0);
  }
}

export function generateVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

export type TokenKind = "session" | "csrf" | "login-challenge" | "step-up-grant" | "verification";

const TOKEN_KINDS: ReadonlySet<string> = new Set<TokenKind>([
  "session", "csrf", "login-challenge", "step-up-grant", "verification"
]);

/**
 * Purpose-bound opaque-token hash: `sha256("debateai:token:<kind>:v1\0" || token)`,
 * rendered in the `sha256:<hex>` grammar every token-hash column CHECKs. A token
 * presented as one kind can never match a hash stored for another kind (L2-F12).
 * The MFA enrolment token is the consumed verification credential (looked up by
 * `channel_binding.verification_token_hash`), so it hashes as "verification".
 */
export function hashToken(kind: TokenKind, token: string): string {
  if (typeof kind !== "string" || !TOKEN_KINDS.has(kind)) {
    throw new CryptoInputError("CRYPTO_TOKEN_KIND_INVALID");
  }
  if (typeof token !== "string" || token.length < 32) {
    throw new CryptoInputError("CRYPTO_KEY_INVALID");
  }
  return `sha256:${createHash("sha256")
    .update(`debateai:token:${kind}:v1\0`, "utf8")
    .update(token, "utf8")
    .digest("hex")}`;
}

/**
 * @deprecated Unkeyed, purpose-free digest. No production call site uses it;
 * it remains only for fixtures that need an opaque `sha256:<hex>` value.
 * Use `hashToken(kind, token)` for every stored or compared token hash.
 */
export function hashVerificationToken(token: string): string {
  if (typeof token !== "string" || token.length < 32) {
    throw new CryptoInputError("CRYPTO_KEY_INVALID");
  }
  return `sha256:${createHash("sha256").update(token, "utf8").digest("hex")}`;
}

const PSEUDONYM_ADJECTIVES = Object.freeze([
  "amber", "brisk", "calm", "clear", "cobalt", "coral", "crisp", "daring",
  "ember", "gentle", "golden", "honest", "indigo", "lucid", "mellow", "nimble",
  "open", "patient", "quiet", "rapid", "silver", "steady", "verdant", "vivid"
]);
const PSEUDONYM_NOUNS = Object.freeze([
  "badger", "cedar", "comet", "dolphin", "falcon", "forest", "harbor", "heron",
  "island", "lantern", "maple", "meadow", "otter", "pebble", "quartz", "raven",
  "river", "sparrow", "summit", "thistle", "tiger", "willow", "wren", "zephyr"
]);

export function generatePseudonym(): string {
  const adjective = PSEUDONYM_ADJECTIVES[randomInt(PSEUDONYM_ADJECTIVES.length)]!;
  const noun = PSEUDONYM_NOUNS[randomInt(PSEUDONYM_NOUNS.length)]!;
  return `${adjective}-${noun}-${randomBytes(3).toString("hex")}`;
}

export interface UserDekStore {
  store(userId: string, dek: Uint8Array): Promise<void>;
  /** Idempotently removes the wrapped user DEK and durably publishes the removal. */
  destroy(userId: string): Promise<KeyDestroyResult>;
}

export interface ReadableUserDekStore extends UserDekStore {
  load(userId: string): Promise<Buffer>;
  exists(userId: string): Promise<boolean>;
}

export type KeyDestroyResult = "DESTROYED" | "ALREADY_ABSENT";

export interface UserDekStoreFileSystem {
  readonly mkdir: typeof mkdir;
  readonly chmod: typeof chmod;
  readonly open: typeof open;
  readonly readFile: typeof readFile;
  readonly lstat: typeof lstat;
  /** V-3: only the rotation enumerates the store; ordinary reads are by id. */
  readonly readdir: typeof readdir;
  readonly rename: typeof rename;
  readonly rm: typeof rm;
  readonly stat: typeof stat;
}

const defaultUserDekStoreFileSystem: UserDekStoreFileSystem = Object.freeze({
  mkdir,
  chmod,
  open,
  readFile,
  lstat,
  readdir,
  rename,
  rm,
  stat
});

/** What one record's re-wrap did. See `RotatableKeyStore`. */
export type KeyRotationOutcome = "REWRAPPED" | "ALREADY_CURRENT";

/**
 * V-3. The three operations a KEK rotation needs from a key store, and nothing
 * else. `verifyUnderCurrentKek` deliberately returns nothing: the rotation must
 * never hold plaintext key material, so each store opens its own record, proves
 * it opens, and zeroes what it read before returning.
 */
export interface RotatableKeyStore {
  listKeyRefs(): Promise<readonly string[]>;
  rewrapUnderCurrentKek(ref: string): Promise<KeyRotationOutcome>;
  verifyUnderCurrentKek(ref: string): Promise<void>;
}

/**
 * Replaces one already-published record in place. The directory exists, so this
 * is deliberately NOT the create path: write a temporary beside it, fsync,
 * rename over the old name, fsync the directory. The rename is atomic, so an
 * interrupted rotation leaves the ORIGINAL record intact and the pass simply
 * re-does that record — which is what "resumable" means here.
 */
async function republishRecord(
  root: string,
  directory: string,
  location: string,
  payload: string,
  fileSystem: Pick<UserDekStoreFileSystem, "chmod" | "open" | "rename" | "rm" | "stat">
): Promise<void> {
  const modes = await custodyWriteModes(root, fileSystem);
  // A distinct suffix from the create path's, so a rotation and a concurrent
  // first write can never contend for one temporary name.
  const temporary = `${location}.rotate.tmp`;
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await fileSystem.rm(temporary, { force: true });
    file = await fileSystem.open(temporary, "wx", modes.file);
    await file.writeFile(payload, "utf8");
    await fileSystem.chmod(temporary, modes.file);
    await file.sync();
    await file.close();
    file = undefined;
    await fileSystem.rename(temporary, location);
    const directoryHandle = await fileSystem.open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    if (file !== undefined) {
      try { await file.close(); } catch { /* the throw below is the real fault */ }
    }
    try { await fileSystem.rm(temporary, { force: true }); } catch { /* as above */ }
    throw error;
  }
}

/**
 * The sub-directory names of `parent` that are canonical UUIDs, sorted.
 *
 * The store ROOT must exist: "not there" is never "empty". A rotation that read
 * a mistyped store path as an empty store would report a clean pass, and the
 * runbook keys key-retirement to that pass. The container INSIDE the root may
 * legitimately be absent — that is a provisioned store nothing has been written
 * into yet — and only that case answers an empty list.
 */
async function listRecordRefs(
  root: string,
  absentCode: string,
  parent: string,
  fileSystem: Pick<UserDekStoreFileSystem, "readdir" | "stat">,
  accepts: (name: string) => boolean
): Promise<readonly string[]> {
  try {
    if (!(await fileSystem.stat(root)).isDirectory()) {
      throw new CryptoError(absentCode, absentCode);
    }
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    throw new CryptoError(absentCode, absentCode);
  }
  let entries: Dirent<string>[];
  try {
    entries = await fileSystem.readdir(parent, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return Object.freeze([]);
    throw error;
  }
  return Object.freeze(entries
    .filter((entry) => typeof entry !== "string" && entry.isDirectory() && accepts(entry.name))
    .map((entry) => entry.name)
    .sort());
}

/**
 * The async half of the custody contract (L2-F6), for the wrapped-key JSON
 * records the three file stores hold. Same discipline as `readCustodyKey`
 * minus the 32-byte size rule, because these records are JSON envelopes:
 * O_NOFOLLOW, decisions taken from the opened descriptor, exactly one link,
 * 0600 inside a 0700 directory, both owned by this process.
 *
 * It throws `CryptoCustodyError("SECRET_CUSTODY_INVALID")`, and every store's
 * `load` lets that code through rather than collapsing it into its own
 * `*_UNRESOLVED`. The two mean different things to an operator — "nothing is
 * provisioned at that path" versus "this exists but is not safe to trust" —
 * and V-19 makes the second the likelier failure on a first deploy.
 */
async function readCustodyRecord(
  location: string,
  fileSystem: Pick<UserDekStoreFileSystem, "open" | "stat">
): Promise<unknown> {
  const handle = await fileSystem.open(location, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    const parent = await fileSystem.stat(dirname(location));
    if (!custodyAccepts(
      {
        isFile: metadata.isFile(),
        nlink: metadata.nlink,
        mode: metadata.mode,
        uid: metadata.uid,
        gid: metadata.gid,
        size: metadata.size
      },
      {
        isDirectory: parent.isDirectory(),
        mode: parent.mode,
        uid: parent.uid,
        gid: parent.gid
      },
      {
        callerUid: typeof process.getuid === "function" ? process.getuid() : undefined,
        custodyGid: currentCustodyGid(),
        // A wrapped-key record is a JSON envelope, not a 32-byte key.
        expectedSize: undefined
      }
    )) {
      throw new CryptoCustodyError("SECRET_CUSTODY_INVALID");
    }
    return JSON.parse(await handle.readFile("utf8")) as unknown;
  } finally {
    await handle.close();
  }
}

/**
 * V-19, the write half. The read relaxation is inert unless the writer produces
 * records the second principal can read, and the store used to impose 0700/0600
 * on every directory and record it created — including the store root an
 * operator had just provisioned for the custody group.
 *
 * The decision follows the store ROOT rather than the setting alone, so one
 * setting cannot widen a store that no second principal reads: the user-DEK
 * store's root carries the custody group and gets the group modes, while the
 * publication-key store's root (group `debateai-api`) keeps the single-owner
 * modes even with the same setting on.
 *
 * The directory mode carries setgid on purpose. A new file in a non-setgid
 * directory takes the WRITING process's primary group on Linux, which is the
 * API's own group, not the custody group; with setgid it takes the directory's.
 * `mode & 0o777` is still 0o750, which is what the read contract checks.
 */
type CustodyWriteModes = Readonly<{ directory: number;file: number }>;

const OWNER_CUSTODY_MODES: CustodyWriteModes = Object.freeze({
  directory: 0o700, file: 0o600
});
const GROUP_CUSTODY_MODES: CustodyWriteModes = Object.freeze({
  directory: 0o2750, file: 0o640
});

async function custodyWriteModes(
  root: string,
  fileSystem: Pick<UserDekStoreFileSystem, "stat">
): Promise<CustodyWriteModes> {
  const custodyGid = currentCustodyGid();
  if (custodyGid === undefined) return OWNER_CUSTODY_MODES;
  try {
    const metadata = await fileSystem.stat(root);
    // The gid ALONE is not enough. A store may TIGHTEN a root it writes into
    // but must never LOOSEN one: after a `chgrp -R` with no matching `chmod` —
    // a half-done repair — the group matches while the mode is still 0700, and
    // widening on the gid alone would make the key store group-readable with no
    // operator action at all. The root must already BE group mode.
    if (metadata.isDirectory()
      && metadata.gid === custodyGid
      && (metadata.mode & 0o777) === (GROUP_CUSTODY_MODES.directory & 0o777)) {
      return GROUP_CUSTODY_MODES;
    }
  } catch {
    // No store root yet. The operator provisions the group ON the root, so a
    // tree this process creates out of nothing stays single-owner.
  }
  return OWNER_CUSTODY_MODES;
}

/**
 * V-3. `undefined` means "this record carries no label" (a v1 record); a present
 * label must be exactly the 16 hex characters `kekId` produces, because a record
 * whose label is malformed is a record whose provenance is unknown.
 */
function parseRecordKekId(record: Readonly<Record<string, unknown>>): string | undefined {
  const label = record.kek_id;
  if (label === undefined) return undefined;
  if (typeof label !== "string" || !/^[0-9a-f]{16}$/.test(label)) {
    throw new KekUnresolvedError();
  }
  return label;
}

const USER_DEK_STORE_USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUserDekStoreUserId(userId: string): void {
  if (!USER_DEK_STORE_USER_ID.test(userId)) {
    throw new TypeError("USER_DEK_STORE_USER_ID_INVALID");
  }
}

async function durableRemoveDirectory(
  directory: string,
  parent: string,
  fileSystem: Pick<UserDekStoreFileSystem, "lstat" | "rm" | "open"> = defaultUserDekStoreFileSystem
): Promise<KeyDestroyResult> {
  let existed = true;
  try {
    await fileSystem.lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    existed = false;
  }
  await fileSystem.rm(directory, { recursive: true, force: true });
  try {
    const parentHandle = await fileSystem.open(parent, "r");
    try {
      await parentHandle.sync();
    } finally {
      await parentHandle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await fileSystem.lstat(directory);
    throw new CryptoError(
      "KEY_DESTROY_READBACK_FAILED",
      "Secret-store directory still exists after durable removal"
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return existed ? "DESTROYED" : "ALREADY_ABSENT";
}

function userDekAad(userId: string): AeadAad {
  return [
    "secret-store", "user-dek", userId, "run:none", userId, `user-dek:${userId}`, "1"
  ];
}

type StoredUserDek = Readonly<{
  /** Absent on v1 records, which are read as wrapped by the original KEK. */
  kek_id: string | undefined;
  wrapped_dek: CryptoEnvelope;
}>;

/**
 * One parser for the user-DEK record, used by the read path and by the
 * rotation, so the two can never disagree about what a valid record is.
 */
function parseStoredUserDek(value: unknown, userId: string): StoredUserDek {
  if (typeof value !== "object" || value === null) throw new KekUnresolvedError();
  const record = value as Record<string, unknown>;
  const envelope = record.wrapped_dek;
  const label = parseRecordKekId(record);
  // v1 carries no kek_id and is read as "wrapped by the original KEK"; v2 names
  // its KEK. Any other version is a record this build does not understand, and
  // a key store fails closed on those.
  if ((record.version !== 1 && record.version !== 2)
    || record.user_id !== userId || record.key_id !== `user-dek:${userId}`
    || typeof envelope !== "object" || envelope === null) {
    throw new KekUnresolvedError();
  }
  const candidate = envelope as Record<string, unknown>;
  if (candidate.v !== 1 || candidate.keyId !== `user-dek:${userId}`
    || typeof candidate.nonce !== "string" || typeof candidate.ct !== "string"
    || typeof candidate.tag !== "string") {
    throw new KekUnresolvedError();
  }
  return Object.freeze({
    kek_id: label,
    wrapped_dek: candidate as unknown as CryptoEnvelope
  });
}

function userDekRecordJson(
  userId: string,
  kek: KekHandle,
  envelope: CryptoEnvelope
): string {
  return JSON.stringify({
    version: 2,
    user_id: userId,
    key_id: envelope.keyId,
    kek_id: kekId(kek),
    wrapped_dek: envelope
  });
}

export class FileUserDekStore implements ReadableUserDekStore {
  private readonly keks: KekRing;

  constructor(
    private readonly root: string,
    kek: KekSource,
    private readonly fileSystem: UserDekStoreFileSystem = defaultUserDekStoreFileSystem
  ) {
    if (root.trim() === "") throw new TypeError("USER_DEK_STORE_PATH_REQUIRED");
    this.keks = toKekRing(kek);
  }

  async store(userId: string, dek: Uint8Array): Promise<void> {
    assertUserDekStoreUserId(userId);
    const aad = userDekAad(userId);
    const envelope = wrapDek(this.keks.current, dek, aad);
    const users = join(this.root, "users");
    const directory = join(users, userId);
    const location = join(directory, "dek.v1.json");
    const temporary = join(directory, "dek.v1.json.tmp");
    let file: Awaited<ReturnType<typeof open>> | undefined;
    let directoryHandle: Awaited<ReturnType<typeof open>> | undefined;
    let parentHandle: Awaited<ReturnType<typeof open>> | undefined;
    let directoryCreated = false;
    let published = false;
    const modes = await custodyWriteModes(this.root, this.fileSystem);
    try {
      await this.fileSystem.mkdir(this.root, { recursive: true, mode: modes.directory });
      await this.fileSystem.chmod(this.root, modes.directory);
      await this.fileSystem.mkdir(users, { recursive: true, mode: modes.directory });
      await this.fileSystem.chmod(users, modes.directory);
      await this.fileSystem.mkdir(directory, { recursive: false, mode: modes.directory });
      directoryCreated = true;
      // The units run with UMask=0077, which would strip a mode passed to
      // mkdir/open down to 0700/0600 and leave the second principal locked out.
      // Widening after the restrictive creation never exposes an open moment.
      await this.fileSystem.chmod(directory, modes.directory);
      file = await this.fileSystem.open(temporary, "wx", modes.file);
      await file.writeFile(userDekRecordJson(userId, this.keks.current, envelope), "utf8");
      await this.fileSystem.chmod(temporary, modes.file);
      await file.sync();
      await file.close();
      file = undefined;
      await this.fileSystem.rename(temporary, location);
      published = true;
      directoryHandle = await this.fileSystem.open(directory, "r");
      await directoryHandle.sync();
      await directoryHandle.close();
      directoryHandle = undefined;
      parentHandle = await this.fileSystem.open(users, "r");
      await parentHandle.sync();
      await parentHandle.close();
      parentHandle = undefined;
    } catch (error) {
      const cleanupFailures: unknown[] = [];
      for (const handle of [file,directoryHandle,parentHandle]) {
        if (handle !== undefined) {
          try { await handle.close(); } catch (closeError) { cleanupFailures.push(closeError); }
        }
      }
      if (!published) {
        try {
          await this.fileSystem.lstat(location);
          published = true;
        } catch (readbackError) {
          if ((readbackError as NodeJS.ErrnoException).code !== "ENOENT") published = true;
        }
      }
      if (published) {
        throw new CryptoError(
          "USER_DEK_STORE_DURABILITY_UNCERTAIN",
          "User DEK durability could not be confirmed"
        );
      }
      if (directoryCreated) {
        try {
          await durableRemoveDirectory(directory,users,this.fileSystem);
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
      }
      if (cleanupFailures.length>0) {
        throw new CryptoError(
          "USER_DEK_STORE_CLEANUP_FAILED",
          "User DEK publication cleanup did not complete"
        );
      }
      throw error;
    }
  }

  async load(userId: string): Promise<Buffer> {
    assertUserDekStoreUserId(userId);
    const location = join(this.root, "users", userId, "dek.v1.json");
    try {
      const record = parseStoredUserDek(
        await readCustodyRecord(location, this.fileSystem), userId
      );
      return unwrapUnderRing(
        this.keks, record.kek_id, record.wrapped_dek, userDekAad(userId)
      );
    } catch (error) {
      if (error instanceof CryptoCustodyError) throw error;
      if (error instanceof KekUnresolvedError || error instanceof CryptoAuthenticationError) throw error;
      throw new KekUnresolvedError();
    }
  }

  async listKeyRefs(): Promise<readonly string[]> {
    return listRecordRefs(
      this.root,
      "USER_DEK_STORE_ROOT_ABSENT",
      join(this.root, "users"),
      this.fileSystem,
      (name) => USER_DEK_STORE_USER_ID.test(name)
    );
  }

  async rewrapUnderCurrentKek(userId: string): Promise<KeyRotationOutcome> {
    assertUserDekStoreUserId(userId);
    const directory = join(this.root, "users", userId);
    const location = join(directory, "dek.v1.json");
    const record = parseStoredUserDek(
      await readCustodyRecord(location, this.fileSystem), userId
    );
    // A record already labelled with the current KEK needs no work and is not
    // even decrypted: the label is authoritative, and the verification pass at
    // the end of the rotation opens every record anyway.
    if (record.kek_id === kekId(this.keks.current)) return "ALREADY_CURRENT";
    const dek = unwrapUnderRing(
      this.keks, record.kek_id, record.wrapped_dek, userDekAad(userId)
    );
    try {
      const envelope = wrapDek(this.keks.current, dek, userDekAad(userId));
      await republishRecord(
        this.root, directory, location,
        userDekRecordJson(userId, this.keks.current, envelope),
        this.fileSystem
      );
      return "REWRAPPED";
    } finally {
      dek.fill(0);
    }
  }

  async verifyUnderCurrentKek(userId: string): Promise<void> {
    assertUserDekStoreUserId(userId);
    const location = join(this.root, "users", userId, "dek.v1.json");
    const record = parseStoredUserDek(
      await readCustodyRecord(location, this.fileSystem), userId
    );
    // The CURRENT key alone. Accepting the previous one here would certify a
    // rotation that had not happened.
    const dek = unwrapUnderRing(
      { current: this.keks.current }, record.kek_id, record.wrapped_dek, userDekAad(userId)
    );
    dek.fill(0);
  }

  async exists(userId: string): Promise<boolean> {
    assertUserDekStoreUserId(userId);
    try {
      await this.fileSystem.lstat(join(this.root, "users", userId));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async destroy(userId: string): Promise<KeyDestroyResult> {
    assertUserDekStoreUserId(userId);
    const users = join(this.root, "users");
    return durableRemoveDirectory(join(users, userId), users, this.fileSystem);
  }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CONTENT_CARRIERS = Object.freeze([
  "core.run",
  "core.node",
  "core.stranger_restatement",
  "ledger.raw_artifact",
  "serve.fact_bundle",
  "serve.composed_text",
  "ledger.node_review",
  "memory.question_key",
  "memory.pull_record",
  "core.investigation_request",
  "evidence.query_set",
  "evidence.query_amendment",
  "evidence.evidence_item",
  "evidence.absence_row",
  "serve.answer"
] as const);

export type ContentCarrier = typeof CONTENT_CARRIERS[number];
export type OwnerRefResolver = (ownerRef: string) => Promise<string>;

export interface RunContentKeyIdentity {
  readonly userId: string;
  readonly ownerRef: string;
}

export interface LoadedRunContentKey {
  readonly runId: string;
  readonly ownerRef: string;
  readonly key: Buffer;
}

export interface RunContentKeyStore {
  store(runId: string, identity: RunContentKeyIdentity, contentKey: Uint8Array): Promise<void>;
  load(runId: string): Promise<LoadedRunContentKey>;
  exists(runId: string): Promise<boolean>;
  ownerRef(runId: string): Promise<string>;
  listByOwner(ownerRef: string): Promise<readonly string[]>;
  destroy(runId: string): Promise<KeyDestroyResult>;
}

export interface RunContentKeyFileSystem {
  readonly mkdir: typeof mkdir;
  readonly chmod: typeof chmod;
  readonly open: typeof open;
  readonly readFile: typeof readFile;
  readonly lstat: typeof lstat;
  readonly readdir: typeof readdir;
  readonly rename: typeof rename;
  readonly rm: typeof rm;
  readonly stat: typeof stat;
}

const defaultRunContentKeyFileSystem: RunContentKeyFileSystem = Object.freeze({
  mkdir,
  chmod,
  open,
  readFile,
  lstat,
  readdir,
  rename,
  rm,
  stat
});

export class RunContentKeyUnresolvedError extends CryptoError {
  constructor() {
    super("RUN_CONTENT_KEY_UNRESOLVED", "RUN_CONTENT_KEY_UNRESOLVED");
    this.name = "RunContentKeyUnresolvedError";
  }
}

type StoredRunContentKey = Readonly<{
  version: 1;
  run_id: string;
  owner_ref: string;
  key_id: string;
  wrapped_content_key: CryptoEnvelope;
}>;

function assertRunContentIdentity(runId: string, identity: RunContentKeyIdentity): void {
  if (!UUID_V4.test(runId)) throw new TypeError("RUN_CONTENT_KEY_RUN_ID_INVALID");
  if (!UUID_V4.test(identity.userId)) throw new TypeError("RUN_CONTENT_KEY_USER_ID_INVALID");
  if (!UUID_V4.test(identity.ownerRef)) throw new TypeError("RUN_CONTENT_KEY_OWNER_REF_INVALID");
}

function runContentKeyAad(runId: string, ownerRef: string): AeadAad {
  const keyId = `run-content:${runId}:v1`;
  return ["secret-store", "run-content-key", runId, runId, ownerRef, keyId, "1"];
}

function parseStoredRunContentKey(value: unknown, runId: string): StoredRunContentKey {
  if (typeof value !== "object" || value === null) throw new RunContentKeyUnresolvedError();
  const record = value as Record<string, unknown>;
  const envelope = record.wrapped_content_key;
  if (record.version !== 1 || record.run_id !== runId || !UUID_V4.test(String(record.owner_ref))
    || record.key_id !== `run-content:${runId}:v1`
    || typeof envelope !== "object" || envelope === null) {
    throw new RunContentKeyUnresolvedError();
  }
  const candidate = envelope as Record<string, unknown>;
  if (candidate.v !== 1 || candidate.keyId !== record.key_id
    || typeof candidate.nonce !== "string" || typeof candidate.ct !== "string"
    || typeof candidate.tag !== "string") {
    throw new RunContentKeyUnresolvedError();
  }
  return Object.freeze({
    version: 1,
    run_id: runId,
    owner_ref: String(record.owner_ref),
    key_id: String(record.key_id),
    wrapped_content_key: candidate as unknown as CryptoEnvelope
  });
}

async function wrapRunContentKey(
  users: ReadableUserDekStore,
  runId: string,
  identity: RunContentKeyIdentity,
  contentKey: Uint8Array
): Promise<StoredRunContentKey> {
  assertRunContentIdentity(runId, identity);
  const userDek = await users.load(identity.userId);
  try {
    const envelope = encrypt(userDek, contentKey, runContentKeyAad(runId, identity.ownerRef));
    return Object.freeze({
      version: 1,
      run_id: runId,
      owner_ref: identity.ownerRef,
      key_id: envelope.keyId,
      wrapped_content_key: envelope
    });
  } finally {
    userDek.fill(0);
  }
}

async function unwrapRunContentKey(
  users: ReadableUserDekStore,
  resolveUserId: OwnerRefResolver,
  record: StoredRunContentKey
): Promise<LoadedRunContentKey> {
  let userDek: Buffer | undefined;
  try {
    const userId = await resolveUserId(record.owner_ref);
    if (!UUID_V4.test(userId)) throw new RunContentKeyUnresolvedError();
    userDek = await users.load(userId);
    const key = decrypt(
      userDek,
      record.wrapped_content_key,
      runContentKeyAad(record.run_id, record.owner_ref)
    );
    if (key.byteLength !== KEY_BYTES) {
      key.fill(0);
      throw new RunContentKeyUnresolvedError();
    }
    return Object.freeze({ runId: record.run_id, ownerRef: record.owner_ref, key });
  } catch (error) {
    if (error instanceof RunContentKeyUnresolvedError) throw error;
    throw new RunContentKeyUnresolvedError();
  } finally {
    userDek?.fill(0);
  }
}

export class MemoryRunContentKeyStore implements RunContentKeyStore {
  readonly #records = new Map<string, StoredRunContentKey>();

  constructor(
    private readonly users: ReadableUserDekStore,
    private readonly resolveUserId: OwnerRefResolver
  ) {}

  async store(runId: string, identity: RunContentKeyIdentity, contentKey: Uint8Array): Promise<void> {
    if (this.#records.has(runId)) throw new TypeError("RUN_CONTENT_KEY_EXISTS");
    this.#records.set(runId, await wrapRunContentKey(this.users, runId, identity, contentKey));
  }

  async load(runId: string): Promise<LoadedRunContentKey> {
    const record = this.#records.get(runId);
    if (record === undefined) throw new RunContentKeyUnresolvedError();
    return unwrapRunContentKey(this.users, this.resolveUserId, record);
  }

  async exists(runId: string): Promise<boolean> {
    if (!UUID_V4.test(runId)) throw new RunContentKeyUnresolvedError();
    return this.#records.has(runId);
  }

  async ownerRef(runId: string): Promise<string> {
    const record = this.#records.get(runId);
    if (record === undefined) throw new RunContentKeyUnresolvedError();
    return record.owner_ref;
  }

  async listByOwner(ownerRef: string): Promise<readonly string[]> {
    if (!UUID_V4.test(ownerRef)) throw new RunContentKeyUnresolvedError();
    return Object.freeze([...this.#records.entries()]
      .filter(([, record]) => record.owner_ref === ownerRef)
      .map(([runId]) => runId)
      .sort());
  }

  async destroy(runId: string): Promise<KeyDestroyResult> {
    return this.#records.delete(runId) ? "DESTROYED" : "ALREADY_ABSENT";
  }
}

export class FileRunContentKeyStore implements RunContentKeyStore {
  constructor(
    private readonly root: string,
    private readonly users: ReadableUserDekStore,
    private readonly resolveUserId: OwnerRefResolver,
    private readonly fileSystem: RunContentKeyFileSystem = defaultRunContentKeyFileSystem
  ) {
    if (root.trim() === "") throw new TypeError("RUN_CONTENT_KEY_STORE_PATH_REQUIRED");
  }

  async store(runId: string, identity: RunContentKeyIdentity, contentKey: Uint8Array): Promise<void> {
    const record = await wrapRunContentKey(this.users, runId, identity, contentKey);
    const runs = join(this.root, "runs");
    const directory = join(runs, runId);
    const location = join(directory, "content-key.v1.json");
    const temporary = join(directory, "content-key.v1.json.tmp");
    let file: Awaited<ReturnType<typeof open>> | undefined;
    let directoryHandle: Awaited<ReturnType<typeof open>> | undefined;
    let parentHandle: Awaited<ReturnType<typeof open>> | undefined;
    let directoryCreated = false;
    let published = false;
    const modes = await custodyWriteModes(this.root, this.fileSystem);
    try {
      await this.fileSystem.mkdir(this.root, { recursive: true, mode: modes.directory });
      await this.fileSystem.chmod(this.root, modes.directory);
      await this.fileSystem.mkdir(runs, { recursive: true, mode: modes.directory });
      await this.fileSystem.chmod(runs, modes.directory);
      await this.fileSystem.mkdir(directory, { recursive: false, mode: modes.directory });
      directoryCreated = true;
      await this.fileSystem.chmod(directory, modes.directory);
      file = await this.fileSystem.open(temporary, "wx", modes.file);
      await file.writeFile(JSON.stringify(record), "utf8");
      await this.fileSystem.chmod(temporary, modes.file);
      await file.sync();
      await file.close();
      file = undefined;
      await this.fileSystem.rename(temporary, location);
      published = true;
      directoryHandle = await this.fileSystem.open(directory, "r");
      await directoryHandle.sync();
      await directoryHandle.close();
      directoryHandle = undefined;
      parentHandle = await this.fileSystem.open(runs, "r");
      await parentHandle.sync();
      await parentHandle.close();
      parentHandle = undefined;
    } catch (error) {
      const cleanupFailures: unknown[] = [];
      if (file !== undefined) {
        try {
          await file.close();
        } catch (closeError) {
          cleanupFailures.push(closeError);
        }
        file = undefined;
      }
      if (directoryHandle !== undefined) {
        try {
          await directoryHandle.close();
        } catch (closeError) {
          cleanupFailures.push(closeError);
        }
        directoryHandle = undefined;
      }
      if (parentHandle !== undefined) {
        try {
          await parentHandle.close();
        } catch (closeError) {
          cleanupFailures.push(closeError);
        }
        parentHandle = undefined;
      }
      if (!published) {
        try {
          await this.fileSystem.lstat(location);
          published = true;
        } catch (readbackError) {
          if ((readbackError as NodeJS.ErrnoException).code !== "ENOENT") published = true;
        }
      }
      if (published) {
        throw new CryptoError(
          "RUN_CONTENT_KEY_STORE_DURABILITY_UNCERTAIN",
          "Run content-key durability could not be confirmed"
        );
      }
      if (directoryCreated) {
        try {
          await durableRemoveDirectory(directory,runs,this.fileSystem);
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
      }
      if (cleanupFailures.length > 0) {
        throw new CryptoError(
          "RUN_CONTENT_KEY_STORE_CLEANUP_FAILED",
          "Run content-key publication cleanup did not complete"
        );
      }
      throw error;
    }
  }

  async load(runId: string): Promise<LoadedRunContentKey> {
    if (!UUID_V4.test(runId)) throw new RunContentKeyUnresolvedError();
    const location = join(this.root, "runs", runId, "content-key.v1.json");
    try {
      const record = parseStoredRunContentKey(
        await readCustodyRecord(location, this.fileSystem), runId
      );
      return await unwrapRunContentKey(this.users, this.resolveUserId, record);
    } catch (error) {
      if (error instanceof CryptoCustodyError) throw error;
      if (error instanceof RunContentKeyUnresolvedError) throw error;
      throw new RunContentKeyUnresolvedError();
    }
  }

  async exists(runId: string): Promise<boolean> {
    if (!UUID_V4.test(runId)) throw new RunContentKeyUnresolvedError();
    try {
      await this.fileSystem.lstat(join(this.root, "runs", runId));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async ownerRef(runId: string): Promise<string> {
    if (!UUID_V4.test(runId)) throw new RunContentKeyUnresolvedError();
    try {
      const location = join(this.root, "runs", runId, "content-key.v1.json");
      return parseStoredRunContentKey(
        await readCustodyRecord(location, this.fileSystem),
        runId
      ).owner_ref;
    } catch (error) {
      if (error instanceof CryptoCustodyError) throw error;
      if (error instanceof RunContentKeyUnresolvedError) throw error;
      throw new RunContentKeyUnresolvedError();
    }
  }

  async listByOwner(ownerRef: string): Promise<readonly string[]> {
    if (!UUID_V4.test(ownerRef)) throw new RunContentKeyUnresolvedError();
    const runs = join(this.root, "runs");
    let entries: Dirent<string>[];
    try {
      entries = await this.fileSystem.readdir(runs, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return Object.freeze([]);
      throw new RunContentKeyUnresolvedError();
    }
    const owned: string[] = [];
    for (const entry of entries) {
      if (typeof entry === "string" || !entry.isDirectory() || !UUID_V4.test(entry.name)) {
        throw new RunContentKeyUnresolvedError();
      }
      if (await this.ownerRef(entry.name) === ownerRef) owned.push(entry.name);
    }
    return Object.freeze(owned.sort());
  }

  async destroy(runId: string): Promise<KeyDestroyResult> {
    if (!UUID_V4.test(runId)) throw new RunContentKeyUnresolvedError();
    const runs = join(this.root, "runs");
    return durableRemoveDirectory(join(runs,runId),runs,this.fileSystem);
  }
}

export interface PreparedRunContentCipher {
  readonly runId: string;
  encrypt(carrier: ContentCarrier, primaryKey: string, value: unknown): CryptoEnvelope;
  decrypt<T = unknown>(carrier: ContentCarrier, primaryKey: string, envelope: CryptoEnvelope): T;
  databaseAttestationSecret(): Buffer;
  attestEnvelope(
    carrier: ContentCarrier,
    primaryKey: string,
    purpose: string,
    envelope: CryptoEnvelope
  ): Buffer;
  close(): void;
}

class PreparedRunContentCipherImpl implements PreparedRunContentCipher {
  #key: Buffer | undefined;

  constructor(
    readonly runId: string,
    private readonly ownerRef: string,
    key: Buffer
  ) {
    this.#key = key;
  }

  encrypt(carrier: ContentCarrier, primaryKey: string, value: unknown): CryptoEnvelope {
    const key = this.#key;
    if (key === undefined) throw new RunContentKeyUnresolvedError();
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    try {
      const [schema, table] = carrier.split(".") as [string, string];
      return encrypt(key, plaintext, [
        schema, table, primaryKey, this.runId, this.ownerRef,
        `run-content:${this.runId}:v1`, "1"
      ]);
    } finally {
      plaintext.fill(0);
    }
  }

  decrypt<T = unknown>(carrier: ContentCarrier, primaryKey: string, envelope: CryptoEnvelope): T {
    const key = this.#key;
    if (key === undefined) throw new RunContentKeyUnresolvedError();
    let plaintext: Buffer | undefined;
    try {
      const [schema, table] = carrier.split(".") as [string, string];
      plaintext = decrypt(key, envelope, [
        schema, table, primaryKey, this.runId, this.ownerRef,
        `run-content:${this.runId}:v1`, "1"
      ]);
      return JSON.parse(plaintext.toString("utf8")) as T;
    } catch (error) {
      if (error instanceof SyntaxError) throw new CryptoAuthenticationError();
      throw error;
    } finally {
      plaintext?.fill(0);
    }
  }

  databaseAttestationSecret(): Buffer {
    const key = this.#key;
    if (key === undefined) throw new RunContentKeyUnresolvedError();
    return createHmac("sha256", key)
      .update(CONTENT_ATTESTATION_SECRET_DOMAIN, "utf8")
      .update(this.runId.toLowerCase(), "utf8")
      .digest();
  }

  attestEnvelope(
    carrier: ContentCarrier,
    primaryKey: string,
    purpose: string,
    envelope: CryptoEnvelope
  ): Buffer {
    const secret = this.databaseAttestationSecret();
    const bytes = canonicalContentEnvelopeAttestationBytes({
      runId: this.runId,carrier,primaryKey,purpose,envelope
    });
    try {
      return createHmac("sha256",secret).update(bytes).digest();
    } finally {
      bytes.fill(0);
      secret.fill(0);
    }
  }

  close(): void {
    this.#key?.fill(0);
    this.#key = undefined;
  }
}

export class ContentCipher {
  constructor(private readonly keys: RunContentKeyStore) {}

  async provisionRun(runId: string, identity: RunContentKeyIdentity): Promise<void> {
    const contentKey = generateDek();
    try {
      await this.keys.store(runId, identity, contentKey);
    } finally {
      contentKey.fill(0);
    }
  }

  async encrypt(
    runId: string,
    carrier: ContentCarrier,
    primaryKey: string,
    value: unknown
  ): Promise<CryptoEnvelope> {
    const prepared = await this.prepareRun(runId);
    try {
      return prepared.encrypt(carrier, primaryKey, value);
    } finally {
      prepared.close();
    }
  }

  async prepareRun(runId: string): Promise<PreparedRunContentCipher> {
    const loaded = await this.keys.load(runId);
    return new PreparedRunContentCipherImpl(runId, loaded.ownerRef, loaded.key);
  }

  async decrypt<T = unknown>(
    runId: string,
    carrier: ContentCarrier,
    primaryKey: string,
    envelope: CryptoEnvelope
  ): Promise<T> {
    const prepared = await this.prepareRun(runId);
    try {
      return prepared.decrypt<T>(carrier, primaryKey, envelope);
    } finally {
      prepared.close();
    }
  }

  destroyRunKey(runId: string): Promise<KeyDestroyResult> {
    return this.keys.destroy(runId);
  }
}

export interface LoadedPublicationKey {
  readonly publicationRef: string;
  readonly key: Buffer;
}

export interface PublicationKeyStore {
  store(publicationRef: string, key: Uint8Array): Promise<void>;
  load(publicationRef: string): Promise<LoadedPublicationKey>;
  exists(publicationRef: string): Promise<boolean>;
  destroy(publicationRef: string): Promise<KeyDestroyResult>;
}

export type PublicationKeyFileSystem = RunContentKeyFileSystem;

export class PublicationKeyUnresolvedError extends CryptoError {
  constructor() {
    super("PUBLICATION_KEY_UNRESOLVED", "PUBLICATION_KEY_UNRESOLVED");
    this.name = "PublicationKeyUnresolvedError";
  }
}

type StoredPublicationKey = Readonly<{
  version: 1 | 2;
  publication_ref: string;
  key_id: string;
  /** Absent on v1 records, which are read as wrapped by the original corpus KEK. */
  kek_id: string | undefined;
  wrapped_publication_key: CryptoEnvelope;
}>;

function assertPublicationRef(publicationRef: string): void {
  if (!UUID_V4.test(publicationRef)) throw new PublicationKeyUnresolvedError();
}

function publicationKeyAad(publicationRef: string): AeadAad {
  const keyId = `publication-key:${publicationRef}:v1`;
  return [
    "secret-store", "publication-key", publicationRef,
    `publication:${publicationRef}`, "public-corpus", keyId, "1"
  ];
}

function publicationSnapshotAad(publicationRef: string, runId: string): AeadAad {
  if (!UUID_V4.test(runId)) throw new PublicationKeyUnresolvedError();
  const keyId = `publication-snapshot:${publicationRef}:v1`;
  return [
    "serve", "publication_snapshot", publicationRef,
    runId, "public-corpus", keyId, "1"
  ];
}

function wrapPublicationKey(
  corpusKek: KekHandle,
  publicationRef: string,
  key: Uint8Array
): StoredPublicationKey {
  assertPublicationRef(publicationRef);
  const envelope = wrapDek(corpusKek, key, publicationKeyAad(publicationRef));
  return Object.freeze({
    version: 2,
    publication_ref: publicationRef,
    key_id: envelope.keyId,
    kek_id: kekId(corpusKek),
    wrapped_publication_key: envelope
  });
}

function parseStoredPublicationKey(value: unknown, publicationRef: string): StoredPublicationKey {
  assertPublicationRef(publicationRef);
  if (typeof value !== "object" || value === null) throw new PublicationKeyUnresolvedError();
  const record = value as Record<string, unknown>;
  const envelope = record.wrapped_publication_key;
  let label: string | undefined;
  try {
    label = parseRecordKekId(record);
  } catch {
    throw new PublicationKeyUnresolvedError();
  }
  if ((record.version !== 1 && record.version !== 2)
    || record.publication_ref !== publicationRef
    || record.key_id !== `publication-key:${publicationRef}:v1`
    || typeof envelope !== "object" || envelope === null) {
    throw new PublicationKeyUnresolvedError();
  }
  const candidate = envelope as Record<string, unknown>;
  if (candidate.v !== 1 || candidate.keyId !== record.key_id
    || typeof candidate.nonce !== "string" || typeof candidate.ct !== "string"
    || typeof candidate.tag !== "string") {
    throw new PublicationKeyUnresolvedError();
  }
  return Object.freeze({
    version: record.version,
    publication_ref: publicationRef,
    key_id: String(record.key_id),
    kek_id: label,
    wrapped_publication_key: candidate as unknown as CryptoEnvelope
  });
}

function unwrapPublicationKey(
  corpusKek: KekRing,
  record: StoredPublicationKey
): LoadedPublicationKey {
  try {
    const key = unwrapUnderRing(
      corpusKek,
      record.kek_id,
      record.wrapped_publication_key,
      publicationKeyAad(record.publication_ref)
    );
    return Object.freeze({ publicationRef: record.publication_ref, key });
  } catch (error) {
    if (error instanceof PublicationKeyUnresolvedError) throw error;
    throw new PublicationKeyUnresolvedError();
  }
}

export class MemoryPublicationKeyStore implements PublicationKeyStore {
  readonly #records = new Map<string, StoredPublicationKey>();
  readonly #keks: KekRing;

  constructor(corpusKek: KekSource) {
    this.#keks = toKekRing(corpusKek);
  }

  async store(publicationRef: string, key: Uint8Array): Promise<void> {
    if (this.#records.has(publicationRef)) throw new TypeError("PUBLICATION_KEY_EXISTS");
    this.#records.set(
      publicationRef, wrapPublicationKey(this.#keks.current, publicationRef, key)
    );
  }

  async load(publicationRef: string): Promise<LoadedPublicationKey> {
    const record = this.#records.get(publicationRef);
    if (record === undefined) throw new PublicationKeyUnresolvedError();
    return unwrapPublicationKey(this.#keks, record);
  }

  async exists(publicationRef: string): Promise<boolean> {
    assertPublicationRef(publicationRef);
    return this.#records.has(publicationRef);
  }

  async destroy(publicationRef: string): Promise<KeyDestroyResult> {
    assertPublicationRef(publicationRef);
    return this.#records.delete(publicationRef) ? "DESTROYED" : "ALREADY_ABSENT";
  }
}

export class FilePublicationKeyStore implements PublicationKeyStore {
  private readonly keks: KekRing;

  constructor(
    private readonly root: string,
    corpusKek: KekSource,
    private readonly fileSystem: PublicationKeyFileSystem = defaultRunContentKeyFileSystem
  ) {
    if (root.trim() === "") throw new TypeError("PUBLICATION_KEY_STORE_PATH_REQUIRED");
    this.keks = toKekRing(corpusKek);
  }

  async store(publicationRef: string, key: Uint8Array): Promise<void> {
    const record = wrapPublicationKey(this.keks.current, publicationRef, key);
    const publications = join(this.root, "publications");
    const directory = join(publications, publicationRef);
    const location = join(directory, "publication-key.v1.json");
    const temporary = join(directory, "publication-key.v1.json.tmp");
    let file: Awaited<ReturnType<typeof open>> | undefined;
    let directoryHandle: Awaited<ReturnType<typeof open>> | undefined;
    let parentHandle: Awaited<ReturnType<typeof open>> | undefined;
    let directoryCreated = false;
    let published = false;
    const modes = await custodyWriteModes(this.root, this.fileSystem);
    try {
      await this.fileSystem.mkdir(this.root, { recursive: true, mode: modes.directory });
      await this.fileSystem.chmod(this.root, modes.directory);
      await this.fileSystem.mkdir(publications, { recursive: true, mode: modes.directory });
      await this.fileSystem.chmod(publications, modes.directory);
      await this.fileSystem.mkdir(directory, { recursive: false, mode: modes.directory });
      directoryCreated = true;
      await this.fileSystem.chmod(directory, modes.directory);
      file = await this.fileSystem.open(temporary, "wx", modes.file);
      await file.writeFile(JSON.stringify(record), "utf8");
      await this.fileSystem.chmod(temporary, modes.file);
      await file.sync();
      await file.close();
      file = undefined;
      await this.fileSystem.rename(temporary, location);
      published = true;
      directoryHandle = await this.fileSystem.open(directory, "r");
      await directoryHandle.sync();
      await directoryHandle.close();
      directoryHandle = undefined;
      parentHandle = await this.fileSystem.open(publications, "r");
      await parentHandle.sync();
      await parentHandle.close();
      parentHandle = undefined;
    } catch (error) {
      const cleanupFailures: unknown[] = [];
      if (file !== undefined) {
        try { await file.close(); } catch (closeError) { cleanupFailures.push(closeError); }
        file = undefined;
      }
      if (directoryHandle !== undefined) {
        try { await directoryHandle.close(); } catch (closeError) { cleanupFailures.push(closeError); }
        directoryHandle = undefined;
      }
      if (parentHandle !== undefined) {
        try { await parentHandle.close(); } catch (closeError) { cleanupFailures.push(closeError); }
        parentHandle = undefined;
      }
      if (!published) {
        try {
          await this.fileSystem.lstat(location);
          published = true;
        } catch (readbackError) {
          if ((readbackError as NodeJS.ErrnoException).code !== "ENOENT") published = true;
        }
      }
      if (published) {
        throw new CryptoError(
          "PUBLICATION_KEY_STORE_DURABILITY_UNCERTAIN",
          "Publication key durability could not be confirmed"
        );
      }
      if (directoryCreated) {
        try {
          await durableRemoveDirectory(directory,publications,this.fileSystem);
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
      }
      if (cleanupFailures.length > 0) {
        throw new CryptoError(
          "PUBLICATION_KEY_STORE_CLEANUP_FAILED",
          "Publication key publication cleanup did not complete"
        );
      }
      throw error;
    }
  }

  async load(publicationRef: string): Promise<LoadedPublicationKey> {
    assertPublicationRef(publicationRef);
    const location = join(this.root, "publications", publicationRef, "publication-key.v1.json");
    try {
      const record = parseStoredPublicationKey(
        await readCustodyRecord(location, this.fileSystem),
        publicationRef
      );
      return unwrapPublicationKey(this.keks, record);
    } catch (error) {
      if (error instanceof CryptoCustodyError) throw error;
      if (error instanceof PublicationKeyUnresolvedError) throw error;
      throw new PublicationKeyUnresolvedError();
    }
  }

  async exists(publicationRef: string): Promise<boolean> {
    assertPublicationRef(publicationRef);
    try {
      await this.fileSystem.lstat(join(this.root, "publications", publicationRef));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async destroy(publicationRef: string): Promise<KeyDestroyResult> {
    assertPublicationRef(publicationRef);
    const publications = join(this.root, "publications");
    return durableRemoveDirectory(
      join(publications, publicationRef),publications,this.fileSystem
    );
  }

  async listKeyRefs(): Promise<readonly string[]> {
    return listRecordRefs(
      this.root,
      "PUBLICATION_KEY_STORE_ROOT_ABSENT",
      join(this.root, "publications"),
      this.fileSystem,
      (name) => UUID_V4.test(name)
    );
  }

  async #read(publicationRef: string): Promise<StoredPublicationKey> {
    assertPublicationRef(publicationRef);
    const location = join(
      this.root, "publications", publicationRef, "publication-key.v1.json"
    );
    return parseStoredPublicationKey(
      await readCustodyRecord(location, this.fileSystem), publicationRef
    );
  }

  async rewrapUnderCurrentKek(publicationRef: string): Promise<KeyRotationOutcome> {
    const record = await this.#read(publicationRef);
    if (record.kek_id === kekId(this.keks.current)) return "ALREADY_CURRENT";
    const key = unwrapUnderRing(
      this.keks, record.kek_id, record.wrapped_publication_key,
      publicationKeyAad(publicationRef)
    );
    try {
      const directory = join(this.root, "publications", publicationRef);
      await republishRecord(
        this.root, directory, join(directory, "publication-key.v1.json"),
        JSON.stringify(wrapPublicationKey(this.keks.current, publicationRef, key)),
        this.fileSystem
      );
      return "REWRAPPED";
    } finally {
      key.fill(0);
    }
  }

  async verifyUnderCurrentKek(publicationRef: string): Promise<void> {
    const record = await this.#read(publicationRef);
    const key = unwrapUnderRing(
      { current: this.keks.current }, record.kek_id, record.wrapped_publication_key,
      publicationKeyAad(publicationRef)
    );
    key.fill(0);
  }
}

export interface PreparedPublicationCipher {
  readonly publicationRef: string;
  readonly runId: string;
  encrypt(value: unknown): CryptoEnvelope;
  decrypt<T = unknown>(envelope: CryptoEnvelope): T;
  close(): void;
}

class PreparedPublicationCipherImpl implements PreparedPublicationCipher {
  #key: Buffer | undefined;

  constructor(readonly publicationRef: string, readonly runId: string, key: Buffer) {
    this.#key = key;
  }

  encrypt(value: unknown): CryptoEnvelope {
    const key = this.#key;
    if (key === undefined) throw new PublicationKeyUnresolvedError();
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    try {
      return encrypt(key, plaintext, publicationSnapshotAad(this.publicationRef, this.runId));
    } finally {
      plaintext.fill(0);
    }
  }

  decrypt<T = unknown>(envelope: CryptoEnvelope): T {
    const key = this.#key;
    if (key === undefined) throw new PublicationKeyUnresolvedError();
    let plaintext: Buffer | undefined;
    try {
      plaintext = decrypt(key, envelope, publicationSnapshotAad(this.publicationRef, this.runId));
      return JSON.parse(plaintext.toString("utf8")) as T;
    } catch (error) {
      if (error instanceof SyntaxError) throw new CryptoAuthenticationError();
      throw error;
    } finally {
      plaintext?.fill(0);
    }
  }

  close(): void {
    this.#key?.fill(0);
    this.#key = undefined;
  }
}

export class PublicationCipher {
  constructor(private readonly keys: PublicationKeyStore) {}

  async create(publicationRef: string, runId: string): Promise<PreparedPublicationCipher> {
    assertPublicationRef(publicationRef);
    if (!UUID_V4.test(runId)) throw new PublicationKeyUnresolvedError();
    const key = generateDek();
    try {
      await this.keys.store(publicationRef, key);
      return new PreparedPublicationCipherImpl(publicationRef, runId, key);
    } catch (error) {
      key.fill(0);
      throw error;
    }
  }

  async open(publicationRef: string, runId: string): Promise<PreparedPublicationCipher> {
    if (!UUID_V4.test(runId)) throw new PublicationKeyUnresolvedError();
    const loaded = await this.keys.load(publicationRef);
    return new PreparedPublicationCipherImpl(publicationRef, runId, loaded.key);
  }

  exists(publicationRef: string): Promise<boolean> {
    return this.keys.exists(publicationRef);
  }

  async keyReadable(publicationRef: string): Promise<boolean> {
    try {
      const loaded = await this.keys.load(publicationRef);
      loaded.key.fill(0);
      return true;
    } catch {
      return false;
    }
  }

  destroy(publicationRef: string): Promise<KeyDestroyResult> {
    return this.keys.destroy(publicationRef);
  }
}
