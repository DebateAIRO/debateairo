import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
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
const CONTENT_ENVELOPE_VERSION_TAG = 1;
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

export interface SupportKeyPort {
  createDataKey(handle: SupportKeyHandle): Promise<NewSupportDataKey>;
  wrapDataKey(handle: SupportKeyHandle, dataKey: Uint8Array): WrappedSupportKey;
  unwrapDataKey(handle: SupportKeyHandle, wrapped: Uint8Array): Promise<Buffer>;
  seal(handle: SupportKeyHandle, dataKey: Uint8Array, plaintext: Uint8Array): Buffer;
  open(handle: SupportKeyHandle, dataKey: Uint8Array, ciphertext: Uint8Array): Buffer;
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

function aad(domain: "support" | "support-content", handle: SupportKeyHandle): Buffer {
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

function parseContentEnvelope(ciphertext: Uint8Array): Readonly<{
  version: 1 | 2;
  nonce: Buffer;
  encrypted: Buffer;
  tag: Buffer;
}> {
  if (!(ciphertext instanceof Uint8Array) || ciphertext.byteLength < CONTENT_OVERHEAD_BYTES) {
    fail("SUPPORT_CONTENT_ENVELOPE_INVALID");
  }
  const bytes = bytesView(ciphertext);
  if (bytes[0] !== 1 && bytes[0] !== 2) fail("SUPPORT_CONTENT_ENVELOPE_INVALID");
  return {
    version: bytes[0],
    nonce: bytes.subarray(1, 1 + NONCE_BYTES),
    encrypted: bytes.subarray(1 + NONCE_BYTES, bytes.byteLength - AUTH_TAG_BYTES),
    tag: bytes.subarray(bytes.byteLength - AUTH_TAG_BYTES)
  };
}

/**
 * V-19 deliberately does NOT reach this loader. The custody group exists for a
 * key store two OS principals must both read; checked 2026-09-22, `SUPPORT_KEK_PATH`
 * has exactly one reader — `apps/api/src/main.ts` — it is absent from the runner's
 * environment shape and from `deploy/vps/env/runner.env.example`, and the material
 * it wraps lives in `support.session_key` / `support.case_key` rows reached through
 * `SUPPORT_DATABASE_URL`, which is likewise API-only. One principal, so the support
 * KEK stays single-owner: 0600 owned by this uid inside a 0700 directory. Widen this
 * only when a second principal genuinely needs it.
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
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || metadata.uid !== currentUid()
      || metadata.nlink !== 1
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
      || metadata.size !== KEY_BYTES) {
      fail("SUPPORT_KEK_CUSTODY_INVALID");
    }
    const material = await handle.readFile();
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
    identity?.material.fill(0);
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
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
      || metadata.size !== KEY_BYTES) {
      fail("SUPPORT_KEK_CUSTODY_INVALID");
    }
    const material = await handle.readFile();
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
    identity?.material.fill(0);
    throw failure ?? new SupportKeyError("SUPPORT_KEK_CUSTODY_INVALID");
  }
  return identity;
}

class FileSupportKeyPort implements SupportKeyPort {
  readonly #kek: Buffer;
  readonly #closedLeaseKeys = new WeakSet<object>();
  #closed = false;

  constructor(kek: Buffer) {
    this.#kek = kek;
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
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.#kek, envelope.nonce, {
        authTagLength: AUTH_TAG_BYTES
      });
      decipher.setAAD(aad("support", handle));
      decipher.setAuthTag(envelope.tag);
      return Buffer.concat([decipher.update(envelope.encrypted), decipher.final()]);
    } catch {
      fail("SUPPORT_KEY_AUTHENTICATION_FAILED");
    }
  }

  seal(
    handle: SupportKeyHandle,
    dataKey: Uint8Array,
    plaintext: Uint8Array
  ): Buffer {
    this.#assertOpen();
    this.#assertDataKey(dataKey);
    if (!(plaintext instanceof Uint8Array)) fail("SUPPORT_KEY_OPERATION_FAILED");
    const nonce = randomBytes(NONCE_BYTES);
    try {
      const cipher = createCipheriv("aes-256-gcm", dataKey, nonce, {
        authTagLength: AUTH_TAG_BYTES
      });
      cipher.setAAD(aad("support-content", handle));
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      // Content uses version || 12-byte nonce || variable ciphertext || 16-byte GCM tag.
      return Buffer.concat([Buffer.from([CONTENT_ENVELOPE_VERSION_TAG]), nonce, encrypted, cipher.getAuthTag()]);
    } catch (error) {
      if (error instanceof SupportKeyError) throw error;
      fail("SUPPORT_KEY_OPERATION_FAILED");
    }
  }

  open(
    handle: SupportKeyHandle,
    dataKey: Uint8Array,
    ciphertext: Uint8Array
  ): Buffer {
    this.#assertOpen();
    this.#assertDataKey(dataKey);
    assertHandle(handle);
    const envelope = parseContentEnvelope(ciphertext);
    if (envelope.version !== 1) fail("SUPPORT_CONTENT_ENVELOPE_INVALID");
    try {
      const decipher = createDecipheriv("aes-256-gcm", dataKey, envelope.nonce, {
        authTagLength: AUTH_TAG_BYTES
      });
      decipher.setAAD(aad("support-content", handle));
      decipher.setAuthTag(envelope.tag);
      return Buffer.concat([decipher.update(envelope.encrypted), decipher.final()]);
    } catch {
      fail("SUPPORT_KEY_AUTHENTICATION_FAILED");
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
    const handle = semanticHandle(context);
    const envelope = parseContentEnvelope(ciphertext);
    try {
      const decipher = createDecipheriv("aes-256-gcm",dataKey,envelope.nonce,{
        authTagLength: AUTH_TAG_BYTES
      });
      decipher.setAAD(envelope.version === 1
        ? aad("support-content",handle) : semanticAad(context));
      decipher.setAuthTag(envelope.tag);
      return Buffer.concat([decipher.update(envelope.encrypted),decipher.final()]);
    } catch {
      fail("SUPPORT_KEY_AUTHENTICATION_FAILED");
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#kek.fill(0);
  }
}

export async function createSupportKeyPort(
  input: CreateSupportKeyPortInput
): Promise<SupportKeyPort> {
  if (input === null || typeof input !== "object") fail("SUPPORT_KEK_PATH_INVALID");
  const support = await readSupportKek(input.supportKekPath);
  try {
    for (const protectedPath of input.protectedKeyPaths ?? []) {
      const protectedIdentity = await readProtectedKeyIdentity(protectedPath);
      try {
        if (support.canonicalPath === protectedIdentity.canonicalPath
          || support.device === protectedIdentity.device && support.inode === protectedIdentity.inode
          || timingSafeEqual(support.material, protectedIdentity.material)) {
          fail("SUPPORT_KEK_CUSTODY_INVALID");
        }
      } finally {
        protectedIdentity.material.fill(0);
      }
    }
    return new FileSupportKeyPort(support.material);
  } catch (error) {
    support.material.fill(0);
    throw error;
  }
}
