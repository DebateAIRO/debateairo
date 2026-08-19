import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes
} from "node:crypto";
import { readFileSync, statSync } from "node:fs";

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

class CryptoInputError extends CryptoError {
  constructor(code:
    | "CRYPTO_AAD_INVALID"
    | "CRYPTO_AUDIT_CHAIN_INVALID"
    | "CRYPTO_CANONICAL_VALUE_INVALID"
    | "CRYPTO_EMAIL_INVALID"
    | "CRYPTO_KEY_INVALID") {
    super(code, code);
    this.name = "CryptoInputError";
  }
}

declare const kekHandleBrand: unique symbol;
export interface KekHandle {
  readonly [kekHandleBrand]: true;
}

const kekMaterials = new WeakMap<KekHandle, Buffer>();

function copyKey(material: Uint8Array): Buffer {
  const key = Buffer.from(material);
  if (key.byteLength !== KEY_BYTES) {
    key.fill(0);
    throw new CryptoInputError("CRYPTO_KEY_INVALID");
  }
  return key;
}

function makeKekHandle(material: Uint8Array): KekHandle {
  const key = copyKey(material);
  const handle = Object.freeze(Object.create(null)) as KekHandle;
  kekMaterials.set(handle, key);
  return handle;
}

function readKek(handle: KekHandle): Buffer {
  const material = kekMaterials.get(handle);
  if (material === undefined) throw new KekUnresolvedError();
  return Buffer.from(material);
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

export function loadKek(pathOrBuffer: string | Uint8Array): KekHandle {
  try {
    if (typeof pathOrBuffer !== "string") return makeKekHandle(pathOrBuffer);
    const metadata = statSync(pathOrBuffer);
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
      throw new KekUnresolvedError();
    }
    return makeKekHandle(readFileSync(pathOrBuffer));
  } catch (error) {
    if (error instanceof KekUnresolvedError) throw error;
    throw new KekUnresolvedError();
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
      .sort(([left], [right]) => left.localeCompare(right));
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
