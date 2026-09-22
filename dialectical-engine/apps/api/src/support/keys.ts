import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual
} from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { TypedDomainError } from "@debateai/kernel";

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const VERSION_BYTES = 1;
const WRAPPED_KEY_BYTES = VERSION_BYTES + NONCE_BYTES + KEY_BYTES + AUTH_TAG_BYTES;
const CONTENT_OVERHEAD_BYTES = VERSION_BYTES + NONCE_BYTES + AUTH_TAG_BYTES;
/**
 * The envelope version TAGS written as byte 0, one per envelope this module
 * produces. Distinct from VERSION_BYTES above, which is that prefix's LENGTH.
 *
 * They are named rather than inlined because the S1-1 single-source oracle
 * reports every numeric-array occurrence in shipped code whose value it cannot
 * evaluate, and an array literal holding a bare number consumed by an
 * unmodelled call is exactly that shape. A named element is not a candidate.
 */
const WRAPPED_KEY_VERSION_TAG = 1;
// DL2-F3: the retired content-envelope version 1 has no writer and no reader.
const SEMANTIC_ENVELOPE_VERSION_TAG = 2;
const SUPPORT_KEK_FILENAME = "support-kek.bin";
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export type SupportKeyKind = "session" | "case";

export type SupportKeyHandle = Readonly<{
  kind: SupportKeyKind;
  ref: string;
}>;

export type SupportContentContext =
  | Readonly<{
    kind: "session-message";
    sessionId: string;
    messageId: string;
    role: "user" | "assistant";
    outcome: string;
    purpose: "content";
  }>
  | Readonly<{ kind: "case-snapshot";caseId: string;purpose: "transcript" }>
  | Readonly<{
    kind: "case-message";
    caseId: string;
    messageId: string;
    role: "user" | "V";
    purpose: "content";
  }>
  | Readonly<{ kind: "case-summary";caseId: string;purpose: "summary" }>;

export type WrappedSupportKey = Readonly<{
  version: 1;
  bytes: Buffer;
}>;

export type NewSupportDataKey = Readonly<{
  wrapped: WrappedSupportKey;
  dataKey: Buffer;
  close(): void;
}>;

/**
 * V-3. What one row's re-wrap did. `ALREADY_CURRENT` is what makes the rotation
 * idempotent and resumable — a row the current KEK already opens is left alone,
 * so re-running an interrupted pass costs one unwrap per finished row and
 * changes nothing. `TOMBSTONE` is a destroyed key (SUP-07's 61 zero bytes): it
 * is skipped, never re-wrapped, and never counted as a failure.
 */
export type SupportKeyRewrap =
  | Readonly<{ outcome: "REWRAPPED";wrapped: WrappedSupportKey }>
  | Readonly<{ outcome: "ALREADY_CURRENT" }>
  | Readonly<{ outcome: "TOMBSTONE" }>;

export interface SupportKeyPort {
  createDataKey(handle: SupportKeyHandle): Promise<NewSupportDataKey>;
  wrapDataKey(handle: SupportKeyHandle, dataKey: Uint8Array): WrappedSupportKey;
  unwrapDataKey(handle: SupportKeyHandle, wrapped: Uint8Array): Promise<Buffer>;
  /**
   * Re-wraps one stored key under the CURRENT support KEK. The envelope shape
   * is unchanged — 61 bytes, version byte 1 — because `support.session_key` and
   * `support.case_key` pin exactly that in a CHECK constraint.
   */
  rewrapDataKey(handle: SupportKeyHandle, wrapped: Uint8Array): Promise<SupportKeyRewrap>;
  /**
   * Proves one stored key opens under the CURRENT KEK **alone**, ignoring the
   * previous one entirely. `unwrapDataKey` is current-then-previous by
   * construction, so a rotation that verified through it would certify a row
   * still wrapped by the old key — and the operator would then retire that key.
   * Resolves on success and raises SUPPORT_KEY_AUTHENTICATION_FAILED otherwise;
   * it returns nothing, so no data key escapes to the caller.
   */
  verifyUnderCurrentKek(handle: SupportKeyHandle, wrapped: Uint8Array): Promise<void>;
  /** A non-secret label for the current KEK, for the rotation's own report. */
  currentKekId(): string;
  /**
   * DL5-F3. An unlinkable pseudonym for one source value, under a key nobody
   * outside this host holds. The two append-only support tables that record a
   * caller's network used to store a bare `sha256` of it: 2^32 digests for the
   * whole IPv4 space, so every row inverted to an address for anyone who could
   * read the schema or a backup. Rendered as bare hex, the grammar
   * `support.abuse_event.ip_sha256` and `support.admission_event.ip_sha256`
   * CHECK.
   */
  sourcePseudonym(value: string): string;
  sealContent(context: SupportContentContext,dataKey: Uint8Array,plaintext: Uint8Array): Buffer;
  openContent(context: SupportContentContext,dataKey: Uint8Array,ciphertext: Uint8Array): Buffer;
  close(): Promise<void>;
}

export type SupportKeyErrorCode =
  | "SUPPORT_CONTENT_ENVELOPE_INVALID"
  | "SUPPORT_DATA_KEY_CLOSED"
  | "SUPPORT_DATA_KEY_INVALID"
  | "SUPPORT_KEY_AUTHENTICATION_FAILED"
  | "SUPPORT_KEY_HANDLE_INVALID"
  | "SUPPORT_KEY_OPERATION_FAILED"
  | "SUPPORT_KEY_DESTROYED"
  | "SUPPORT_KEY_PORT_CLOSED"
  | "SUPPORT_SOURCE_VALUE_INVALID"
  | "SUPPORT_KEK_CUSTODY_INVALID"
  | "SUPPORT_KEK_PATH_INVALID"
  | "SUPPORT_WRAPPED_KEY_INVALID";

export class SupportKeyError extends TypedDomainError {
  constructor(override readonly code: SupportKeyErrorCode) {
    super(code,code);
    this.name = "SupportKeyError";
  }
}

export type CreateSupportKeyPortInput = Readonly<{
  supportKekPath: string;
  /**
   * V-3. The support KEK that was current before a rotation. Absent in the
   * steady state; set only for the length of a changeover, so that rows not yet
   * re-wrapped still open. It is held to the SAME basename as the current key
   * (SUPPORT_KEK_FILENAME above), so it lives in its own 0700 directory.
   */
  previousSupportKekPath?: string | undefined;
  protectedKeyPaths?: readonly string[];
}>;

type KeyFileIdentity = Readonly<{
  canonicalPath: string;
  device: number;
  inode: number;
  material: Buffer;
}>;

function fail(code: SupportKeyErrorCode): never {
  throw new SupportKeyError(code);
}

function currentUid(): number {
  if (typeof process.getuid !== "function") fail("SUPPORT_KEK_CUSTODY_INVALID");
  return process.getuid();
}

function assertHandle(handle: SupportKeyHandle): void {
  if (handle === null
    || typeof handle !== "object"
    || (handle.kind !== "session" && handle.kind !== "case")
    || typeof handle.ref !== "string"
    || handle.ref.length === 0
    || Buffer.byteLength(handle.ref, "utf8") > 0xffff_ffff) {
    fail("SUPPORT_KEY_HANDLE_INVALID");
  }
}

function lengthPrefixed(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.byteLength);
  return Buffer.concat([length, bytes]);
}

function aad(domain: "support", handle: SupportKeyHandle): Buffer {
  assertHandle(handle);
  return Buffer.concat([
    lengthPrefixed("domain"),
    lengthPrefixed(domain),
    lengthPrefixed("kind"),
    lengthPrefixed(handle.kind),
    lengthPrefixed("ref"),
    lengthPrefixed(handle.ref)
  ]);
}

function assertContextValue(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0
    || Buffer.byteLength(value,"utf8") > 0xffff_ffff) {
    fail("SUPPORT_KEY_HANDLE_INVALID");
  }
}

function semanticHandle(context: SupportContentContext): SupportKeyHandle {
  if (context === null || typeof context !== "object") fail("SUPPORT_KEY_HANDLE_INVALID");
  if (context.kind === "session-message") {
    for (const value of [context.sessionId,context.messageId,context.outcome]) {
      assertContextValue(value);
    }
    if ((context.role !== "user" && context.role !== "assistant")
      || context.purpose !== "content") fail("SUPPORT_KEY_HANDLE_INVALID");
    return Object.freeze({ kind: "session",ref: context.sessionId });
  }
  if (context.kind === "case-snapshot") {
    assertContextValue(context.caseId);
    if (context.purpose !== "transcript") fail("SUPPORT_KEY_HANDLE_INVALID");
    return Object.freeze({ kind: "case",ref: context.caseId });
  }
  if (context.kind === "case-message") {
    for (const value of [context.caseId,context.messageId]) assertContextValue(value);
    if ((context.role !== "user" && context.role !== "V")
      || context.purpose !== "content") fail("SUPPORT_KEY_HANDLE_INVALID");
    return Object.freeze({ kind: "case",ref: context.caseId });
  }
  if (context.kind === "case-summary") {
    assertContextValue(context.caseId);
    if (context.purpose !== "summary") fail("SUPPORT_KEY_HANDLE_INVALID");
    return Object.freeze({ kind: "case",ref: context.caseId });
  }
  fail("SUPPORT_KEY_HANDLE_INVALID");
}

function semanticAad(context: SupportContentContext): Buffer {
  semanticHandle(context);
  const entries: readonly (readonly [string,string])[] = context.kind === "session-message"
    ? [["domain","support-content-v2"],["kind",context.kind],["session",context.sessionId],
      ["message",context.messageId],["role",context.role],["outcome",context.outcome],
      ["purpose",context.purpose]]
    : context.kind === "case-snapshot"
      ? [["domain","support-content-v2"],["kind",context.kind],["case",context.caseId],
        ["purpose",context.purpose]]
      : context.kind === "case-message"
        ? [["domain","support-content-v2"],["kind",context.kind],["case",context.caseId],
          ["message",context.messageId],["role",context.role],["purpose",context.purpose]]
        : [["domain","support-content-v2"],["kind",context.kind],["case",context.caseId],
          ["purpose",context.purpose]];
  return Buffer.concat(entries.flatMap(([name,value]) => [
    lengthPrefixed(name),lengthPrefixed(value)
  ]));
}

function bytesView(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * DL2-F7. Decrypts into an allocation of its own and leaves nothing behind.
 *
 * `Buffer.concat` of small pieces answers from Node's shared 8 KiB slab and
 * copies from two cipher outputs that live in that same slab. Those two copies
 * were never zeroed, so every unwrapped data key and every decrypted support
 * message existed in memory the caller could not reach — its own `fill(0)`
 * erased only the view it was handed. The pieces are zeroed here, on the
 * authentication-failure path as well, and the result is `allocUnsafeSlow`, so
 * the caller's buffer owns its bytes and zeroing it is the whole erasure.
 */
function decryptSecret(
  decipher: Readonly<{ update(data: Buffer): Buffer;final(): Buffer }>,
  encrypted: Buffer
): Buffer {
  const pieces: Buffer[] = [];
  try {
    pieces.push(decipher.update(encrypted));
    pieces.push(decipher.final());
    const plaintext = Buffer.allocUnsafeSlow(
      pieces.reduce((total,piece) => total + piece.byteLength,0)
    );
    let offset = 0;
    for (const piece of pieces) offset += piece.copy(plaintext,offset);
    return plaintext;
  } finally {
    for (const piece of pieces) piece.fill(0);
  }
}

function parseWrappedEnvelope(wrapped: Uint8Array): Readonly<{
  nonce: Buffer;
  encrypted: Buffer;
  tag: Buffer;
}> {
  if (!(wrapped instanceof Uint8Array) || wrapped.byteLength !== WRAPPED_KEY_BYTES) {
    fail("SUPPORT_WRAPPED_KEY_INVALID");
  }
  const bytes = bytesView(wrapped);
  if (bytes.every((byte) => byte === 0)) fail("SUPPORT_KEY_DESTROYED");
  if (bytes[0] !== 1) fail("SUPPORT_WRAPPED_KEY_INVALID");
  return {
    nonce: bytes.subarray(1, 1 + NONCE_BYTES),
    encrypted: bytes.subarray(1 + NONCE_BYTES, 1 + NONCE_BYTES + KEY_BYTES),
    tag: bytes.subarray(1 + NONCE_BYTES + KEY_BYTES)
  };
}

/**
 * DL2-F3. The accepted version set is the WRITTEN one: version 2 alone. The
 * retired version 1 bound only {domain, kind, ref}, so one of its ciphertexts
 * opened under any semantic context of that handle — a downgrade path that no
 * shipped writer ever produced (v1 and v2 landed together in `b300ee91`) and
 * that migration `0054_support_keys_audit.sql` already refuses on every content
 * column. Reading it was the last thing keeping it alive.
 */
function parseContentEnvelope(ciphertext: Uint8Array): Readonly<{
  version: 2;
  nonce: Buffer;
  encrypted: Buffer;
  tag: Buffer;
}> {
  if (!(ciphertext instanceof Uint8Array) || ciphertext.byteLength < CONTENT_OVERHEAD_BYTES) {
    fail("SUPPORT_CONTENT_ENVELOPE_INVALID");
  }
  const bytes = bytesView(ciphertext);
  if (bytes[0] !== SEMANTIC_ENVELOPE_VERSION_TAG) fail("SUPPORT_CONTENT_ENVELOPE_INVALID");
  return {
    version: SEMANTIC_ENVELOPE_VERSION_TAG,
    nonce: bytes.subarray(1, 1 + NONCE_BYTES),
    encrypted: bytes.subarray(1 + NONCE_BYTES, bytes.byteLength - AUTH_TAG_BYTES),
    tag: bytes.subarray(bytes.byteLength - AUTH_TAG_BYTES)
  };
}

/**
 * V-19 deliberately does NOT reach this loader. The custody group exists for a
 * key store two OS PRINCIPALS must both read, and this KEK has only one.
 *
 * Checked 2026-09-22. `createSupportKeyPort` has three call sites:
 * `apps/api/src/main.ts` (the API service), `apps/runner/src/support-inbox-cli.ts`
 * and `apps/runner/src/rotate-kek-cli.ts`. The last two are operator commands,
 * not a second service: they are run BY the custodian against the same custody
 * root, so the file is still opened by one uid. `SUPPORT_KEK_PATH` is absent
 * from the runner service's environment shape and from
 * `deploy/vps/env/runner.env.example`, so `debateai-runner` cannot be configured
 * with it at all; the rows it wraps live in `support.session_key` /
 * `support.case_key`, reached through `SUPPORT_DATABASE_URL` and the
 * `debateai_support` role, which is likewise not the runner service's.
 *
 * So the support KEK stays single-owner: 0600 owned by this uid inside a 0700
 * directory. Widen it only when a second SERVICE principal genuinely needs it.
 */
async function readSupportKek(supportKekPath: string): Promise<KeyFileIdentity> {
  if (typeof supportKekPath !== "string") fail("SUPPORT_KEK_PATH_INVALID");
  let resolvedPath: string;
  try {
    resolvedPath = resolve(supportKekPath);
  } catch {
    fail("SUPPORT_KEK_PATH_INVALID");
  }
  if (basename(resolvedPath) !== SUPPORT_KEK_FILENAME) fail("SUPPORT_KEK_PATH_INVALID");

  let parentMetadata;
  try {
    parentMetadata = await lstat(dirname(resolvedPath));
  } catch {
    fail("SUPPORT_KEK_CUSTODY_INVALID");
  }
  if (parentMetadata.isSymbolicLink()
    || !parentMetadata.isDirectory()
    || parentMetadata.uid !== currentUid()
    || (parentMetadata.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
    fail("SUPPORT_KEK_CUSTODY_INVALID");
  }

  let handle;
  try {
    handle = await open(resolvedPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    fail("SUPPORT_KEK_CUSTODY_INVALID");
  }

  let identity: KeyFileIdentity | undefined;
  let failure: SupportKeyError | undefined;
  // DL2-F7: the bytes read are named OUTSIDE the try. `realpath` runs after the
  // read, so a rejection there — or any later throw — used to drop 32 live KEK
  // bytes un-zeroed, because only the record that was never built held them.
  let material: Buffer | undefined;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || metadata.uid !== currentUid()
      || metadata.nlink !== 1
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
      || metadata.size !== KEY_BYTES) {
      fail("SUPPORT_KEK_CUSTODY_INVALID");
    }
    material = await handle.readFile();
    if (material.byteLength !== KEY_BYTES) fail("SUPPORT_KEK_CUSTODY_INVALID");
    identity = Object.freeze({
      canonicalPath: await realpath(resolvedPath),
      device: metadata.dev,
      inode: metadata.ino,
      material
    });
  } catch (error) {
    failure = error instanceof SupportKeyError
      ? error
      : new SupportKeyError("SUPPORT_KEK_CUSTODY_INVALID");
  }
  try {
    await handle.close();
  } catch {
    failure ??= new SupportKeyError("SUPPORT_KEK_CUSTODY_INVALID");
  }
  if (failure !== undefined || identity === undefined) {
    material?.fill(0);
    throw failure ?? new SupportKeyError("SUPPORT_KEK_CUSTODY_INVALID");
  }
  return identity;
}

async function readProtectedKeyIdentity(path: string): Promise<KeyFileIdentity> {
  let canonicalPath: string;
  let handle;
  try {
    canonicalPath = await realpath(resolve(path));
    handle = await open(canonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    fail("SUPPORT_KEK_CUSTODY_INVALID");
  }
  let identity: KeyFileIdentity | undefined;
  let failure: SupportKeyError | undefined;
  // DL2-F7, as in `readSupportKek`: zeroed whether or not it became the record.
  let material: Buffer | undefined;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
      || metadata.size !== KEY_BYTES) {
      fail("SUPPORT_KEK_CUSTODY_INVALID");
    }
    material = await handle.readFile();
    if (material.byteLength !== KEY_BYTES) fail("SUPPORT_KEK_CUSTODY_INVALID");
    identity = Object.freeze({
      canonicalPath,
      device: metadata.dev,
      inode: metadata.ino,
      material
    });
  } catch (error) {
    failure = error instanceof SupportKeyError
      ? error
      : new SupportKeyError("SUPPORT_KEK_CUSTODY_INVALID");
  }
  try {
    await handle.close();
  } catch {
    failure ??= new SupportKeyError("SUPPORT_KEK_CUSTODY_INVALID");
  }
  if (failure !== undefined || identity === undefined) {
    material?.fill(0);
    throw failure ?? new SupportKeyError("SUPPORT_KEK_CUSTODY_INVALID");
  }
  return identity;
}

const SUPPORT_KEK_ID_DOMAIN = "debateai:kek-id:v1\0";
/**
 * DL5-F3. The pseudonym key is DERIVED from the support KEK rather than loaded
 * from a file of its own.
 *
 * The finding proposes a dedicated `SUPPORT_IP_SALT_PATH` under the same
 * custody rules as `AUDIT_SOURCE_IP_SALT_PATH`. That would need a new required
 * key in the API's strict environment shape
 * (`packages/register/src/runtime-environment.ts`), which another task owns —
 * so this derives a separate MAC key from custody material the support module
 * already holds, under its own domain label. B13 key-domain separation holds:
 * the audit salt is untouched and unreachable from here, this key never wraps
 * or unwraps anything, and the KEK is never itself the MAC key over
 * caller-supplied bytes. Consequence for the operator, and the reason a
 * dedicated salt file may still be worth sealing: rotating the support KEK
 * rotates this pseudonym too, so the per-source windows (all 24 hours or less)
 * restart once at the changeover.
 */
const SUPPORT_SOURCE_PSEUDONYM_DOMAIN = "debateai:support-source-pseudonym:v1\0";

class FileSupportKeyPort implements SupportKeyPort {
  readonly #kek: Buffer;
  readonly #previousKek: Buffer | undefined;
  readonly #sourceKey: Buffer;
  readonly #closedLeaseKeys = new WeakSet<object>();
  #closed = false;

  constructor(kek: Buffer, previousKek?: Buffer) {
    this.#kek = kek;
    this.#previousKek = previousKek;
    this.#sourceKey = createHmac("sha256", kek)
      .update(SUPPORT_SOURCE_PSEUDONYM_DOMAIN, "utf8")
      .digest();
  }

  sourcePseudonym(value: string): string {
    this.#assertOpen();
    if (typeof value !== "string" || value.length === 0) fail("SUPPORT_SOURCE_VALUE_INVALID");
    return createHmac("sha256", this.#sourceKey).update(value, "utf8").digest("hex");
  }

  /**
   * The same construction `@debateai/crypto`'s `kekId` uses — eight bytes of a
   * domain-separated SHA-256 — so an operator reads one vocabulary of key ids
   * across all three KEKs. Nothing is stored under it: the support envelope has
   * no room for a label, which is exactly why unwrapping tries both keys.
   */
  currentKekId(): string {
    this.#assertOpen();
    return createHash("sha256")
      .update(SUPPORT_KEK_ID_DOMAIN, "utf8")
      .update(this.#kek)
      .digest()
      .subarray(0, 8)
      .toString("hex");
  }

  /** Decrypts under `kek`, or returns undefined if that key does not open it. */
  #openUnder(
    kek: Buffer,
    handle: SupportKeyHandle,
    envelope: Readonly<{ nonce: Buffer;encrypted: Buffer;tag: Buffer }>
  ): Buffer | undefined {
    try {
      const decipher = createDecipheriv("aes-256-gcm", kek, envelope.nonce, {
        authTagLength: AUTH_TAG_BYTES
      });
      decipher.setAAD(aad("support", handle));
      decipher.setAuthTag(envelope.tag);
      return decryptSecret(decipher, envelope.encrypted);
    } catch {
      return undefined;
    }
  }

  #assertOpen(): void {
    if (this.#closed) fail("SUPPORT_KEY_PORT_CLOSED");
  }

  #assertDataKey(dataKey: Uint8Array): void {
    if (typeof dataKey === "object" && dataKey !== null && this.#closedLeaseKeys.has(dataKey)) {
      fail("SUPPORT_DATA_KEY_CLOSED");
    }
    if (!(dataKey instanceof Uint8Array) || dataKey.byteLength !== KEY_BYTES) {
      fail("SUPPORT_DATA_KEY_INVALID");
    }
  }

  async createDataKey(handle: SupportKeyHandle): Promise<NewSupportDataKey> {
    this.#assertOpen();
    assertHandle(handle);
    const dataKey = randomBytes(KEY_BYTES);
    let closed = false;
    try {
      const wrapped = this.wrapDataKey(handle, dataKey);
      return Object.freeze({
        wrapped,
        dataKey,
        close: () => {
          if (closed) return;
          closed = true;
          this.#closedLeaseKeys.add(dataKey);
          dataKey.fill(0);
        }
      });
    } catch (error) {
      dataKey.fill(0);
      throw error;
    }
  }

  wrapDataKey(handle: SupportKeyHandle, dataKey: Uint8Array): WrappedSupportKey {
    this.#assertOpen();
    this.#assertDataKey(dataKey);
    const nonce = randomBytes(NONCE_BYTES);
    try {
      const cipher = createCipheriv("aes-256-gcm", this.#kek, nonce, {
        authTagLength: AUTH_TAG_BYTES
      });
      cipher.setAAD(aad("support", handle));
      const encrypted = Buffer.concat([cipher.update(dataKey), cipher.final()]);
      const tag = cipher.getAuthTag();
      // Wrapped DEK envelope:
      // byte 0       version = 1
      // bytes 1..12  nonce
      // bytes 13..44 encrypted 32-byte DEK
      // bytes 45..60 GCM tag
      return Object.freeze({
        version: 1,
        bytes: Buffer.concat([Buffer.from([WRAPPED_KEY_VERSION_TAG]), nonce, encrypted, tag])
      });
    } catch (error) {
      if (error instanceof SupportKeyError) throw error;
      fail("SUPPORT_KEY_OPERATION_FAILED");
    }
  }

  async unwrapDataKey(handle: SupportKeyHandle, wrapped: Uint8Array): Promise<Buffer> {
    this.#assertOpen();
    assertHandle(handle);
    const envelope = parseWrappedEnvelope(wrapped);
    // V-3: the envelope carries no key label — its 61 bytes are pinned by a
    // database CHECK — so a row wrapped before a rotation is found by trying the
    // current KEK and then the previous one. Bounded to the two keys this
    // process holds, and the previous one is absent outside a changeover.
    const opened = this.#openUnder(this.#kek, handle, envelope)
      ?? (this.#previousKek === undefined
        ? undefined
        : this.#openUnder(this.#previousKek, handle, envelope));
    if (opened === undefined) fail("SUPPORT_KEY_AUTHENTICATION_FAILED");
    return opened;
  }

  async verifyUnderCurrentKek(
    handle: SupportKeyHandle,
    wrapped: Uint8Array
  ): Promise<void> {
    this.#assertOpen();
    assertHandle(handle);
    const opened = this.#openUnder(this.#kek, handle, parseWrappedEnvelope(wrapped));
    if (opened === undefined) fail("SUPPORT_KEY_AUTHENTICATION_FAILED");
    opened.fill(0);
  }

  async rewrapDataKey(
    handle: SupportKeyHandle,
    wrapped: Uint8Array
  ): Promise<SupportKeyRewrap> {
    this.#assertOpen();
    assertHandle(handle);
    if (!(wrapped instanceof Uint8Array) || wrapped.byteLength !== WRAPPED_KEY_BYTES) {
      fail("SUPPORT_WRAPPED_KEY_INVALID");
    }
    // A destroyed key is an irreversible tombstone (SUP-07). Re-wrapping it
    // would manufacture a key where the shred removed one, so it is recognised
    // before the envelope is parsed at all and left exactly as it is.
    if (bytesView(wrapped).every((byte) => byte === 0)) {
      return Object.freeze({ outcome: "TOMBSTONE" as const });
    }
    const envelope = parseWrappedEnvelope(wrapped);
    // Current first: a row already re-wrapped opens here and is left untouched,
    // which is what makes the pass idempotent and an interrupted one resumable.
    //
    // DL2-F7: the data key that decision is taken on is zeroed, exactly as
    // `verifyUnderCurrentKek` zeroes its own. `decryptSecret` hands it back on
    // an allocation of its own so that this `fill(0)` is the whole erasure;
    // dropping it left one unwrapped support data key on the heap per
    // already-current row — a whole resumed pass of them.
    const current = this.#openUnder(this.#kek, handle, envelope);
    if (current !== undefined) {
      current.fill(0);
      return Object.freeze({ outcome: "ALREADY_CURRENT" as const });
    }
    if (this.#previousKek === undefined) fail("SUPPORT_KEY_AUTHENTICATION_FAILED");
    const dataKey = this.#openUnder(this.#previousKek, handle, envelope);
    if (dataKey === undefined) fail("SUPPORT_KEY_AUTHENTICATION_FAILED");
    try {
      return Object.freeze({
        outcome: "REWRAPPED" as const,
        wrapped: this.wrapDataKey(handle, dataKey)
      });
    } finally {
      dataKey.fill(0);
    }
  }

  sealContent(
    context: SupportContentContext,
    dataKey: Uint8Array,
    plaintext: Uint8Array
  ): Buffer {
    this.#assertOpen();
    this.#assertDataKey(dataKey);
    semanticHandle(context);
    if (!(plaintext instanceof Uint8Array)) fail("SUPPORT_KEY_OPERATION_FAILED");
    const nonce = randomBytes(NONCE_BYTES);
    try {
      const cipher = createCipheriv("aes-256-gcm",dataKey,nonce,{
        authTagLength: AUTH_TAG_BYTES
      });
      cipher.setAAD(semanticAad(context));
      const encrypted = Buffer.concat([cipher.update(plaintext),cipher.final()]);
      return Buffer.concat([Buffer.from([SEMANTIC_ENVELOPE_VERSION_TAG]),nonce,encrypted,cipher.getAuthTag()]);
    } catch (error) {
      if (error instanceof SupportKeyError) throw error;
      fail("SUPPORT_KEY_OPERATION_FAILED");
    }
  }

  openContent(
    context: SupportContentContext,
    dataKey: Uint8Array,
    ciphertext: Uint8Array
  ): Buffer {
    this.#assertOpen();
    this.#assertDataKey(dataKey);
    semanticHandle(context);
    const envelope = parseContentEnvelope(ciphertext);
    try {
      const decipher = createDecipheriv("aes-256-gcm",dataKey,envelope.nonce,{
        authTagLength: AUTH_TAG_BYTES
      });
      decipher.setAAD(semanticAad(context));
      decipher.setAuthTag(envelope.tag);
      return decryptSecret(decipher,envelope.encrypted);
    } catch {
      fail("SUPPORT_KEY_AUTHENTICATION_FAILED");
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#kek.fill(0);
    this.#previousKek?.fill(0);
    this.#sourceKey.fill(0);
  }
}

/** Same file, same inode, or the same 32 bytes under two names. */
function sameKeyFile(left: KeyFileIdentity, right: KeyFileIdentity): boolean {
  return left.canonicalPath === right.canonicalPath
    || left.device === right.device && left.inode === right.inode
    || timingSafeEqual(left.material, right.material);
}

export async function createSupportKeyPort(
  input: CreateSupportKeyPortInput
): Promise<SupportKeyPort> {
  if (input === null || typeof input !== "object") fail("SUPPORT_KEK_PATH_INVALID");
  const support = await readSupportKek(input.supportKekPath);
  let previous: KeyFileIdentity | undefined;
  try {
    if (input.previousSupportKekPath !== undefined) {
      previous = await readSupportKek(input.previousSupportKekPath);
      // A "previous" key that is the current one is not a changeover — it is a
      // misconfiguration that would make a verification pass meaningless, since
      // every row would look already-current whichever key really wrapped it.
      if (sameKeyFile(support, previous)) fail("SUPPORT_KEK_CUSTODY_INVALID");
    }
    // Both keys this port will hold are checked against every protected key
    // (fix round 1). The previous one used to be exempt, so a changeover could
    // hand the support domain the user-DEK or corpus KEK as its previous key
    // and nothing would say so. The basename rule already refuses a path that
    // is not `support-kek.bin`; what it cannot see is a correctly named file
    // whose 32 bytes are another domain's key.
    const held = previous === undefined ? [support] : [support, previous];
    for (const protectedPath of input.protectedKeyPaths ?? []) {
      const protectedIdentity = await readProtectedKeyIdentity(protectedPath);
      try {
        for (const key of held) {
          if (sameKeyFile(key, protectedIdentity)) fail("SUPPORT_KEK_CUSTODY_INVALID");
        }
      } finally {
        protectedIdentity.material.fill(0);
      }
    }
    return new FileSupportKeyPort(support.material, previous?.material);
  } catch (error) {
    support.material.fill(0);
    previous?.material.fill(0);
    throw error;
  }
}
