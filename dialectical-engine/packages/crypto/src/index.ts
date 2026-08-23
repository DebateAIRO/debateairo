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
import { readFileSync, statSync } from "node:fs";
import { chmod, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
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

export function loadSecretKey(path: string): Buffer {
  try {
    const metadata = statSync(path);
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
      throw new KekUnresolvedError();
    }
    return copyKey(readFileSync(path));
  } catch (error) {
    if (error instanceof KekUnresolvedError || error instanceof CryptoInputError) throw error;
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
}

export interface ReadableUserDekStore extends UserDekStore {
  load(userId: string): Promise<Buffer>;
}

export class FileUserDekStore implements ReadableUserDekStore {
  constructor(
    private readonly root: string,
    private readonly kek: KekHandle
  ) {
    if (root.trim() === "") throw new TypeError("USER_DEK_STORE_PATH_REQUIRED");
  }

  async store(userId: string, dek: Uint8Array): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      throw new TypeError("USER_DEK_STORE_USER_ID_INVALID");
    }
    const aad = [
      "secret-store", "user-dek", userId, "run:none", userId,
      `user-dek:${userId}`, "1"
    ] as const;
    const envelope = wrapDek(this.kek, dek, aad);
    const users = join(this.root, "users");
    const directory = join(users, userId);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await chmod(this.root, 0o700);
    await mkdir(users, { recursive: true, mode: 0o700 });
    await chmod(users, 0o700);
    await mkdir(directory, { recursive: false, mode: 0o700 });
    const location = join(directory, "dek.v1.json");
    const file = await open(location, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify({
        version: 1,
        user_id: userId,
        key_id: envelope.keyId,
        wrapped_dek: envelope
      }), "utf8");
    } finally {
      await file.close();
    }
  }

  async load(userId: string): Promise<Buffer> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      throw new TypeError("USER_DEK_STORE_USER_ID_INVALID");
    }
    const location = join(this.root, "users", userId, "dek.v1.json");
    try {
      const metadata = await stat(location);
      if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) throw new KekUnresolvedError();
      const parsed = JSON.parse(await readFile(location, "utf8")) as unknown;
      if (typeof parsed !== "object" || parsed === null) throw new KekUnresolvedError();
      const record = parsed as Record<string, unknown>;
      const envelope = record.wrapped_dek;
      if (record.version !== 1 || record.user_id !== userId || record.key_id !== `user-dek:${userId}`
        || typeof envelope !== "object" || envelope === null) {
        throw new KekUnresolvedError();
      }
      const candidate = envelope as Record<string, unknown>;
      if (candidate.v !== 1 || candidate.keyId !== `user-dek:${userId}`
        || typeof candidate.nonce !== "string" || typeof candidate.ct !== "string"
        || typeof candidate.tag !== "string") {
        throw new KekUnresolvedError();
      }
      return unwrapDek(this.kek, candidate as unknown as CryptoEnvelope, [
        "secret-store", "user-dek", userId, "run:none", userId,
        `user-dek:${userId}`, "1"
      ]);
    } catch (error) {
      if (error instanceof KekUnresolvedError || error instanceof CryptoAuthenticationError) throw error;
      throw new KekUnresolvedError();
    }
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
  "evidence.absence_row"
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
  destroy(runId: string): Promise<void>;
}

export interface RunContentKeyFileSystem {
  readonly mkdir: typeof mkdir;
  readonly chmod: typeof chmod;
  readonly open: typeof open;
  readonly readFile: typeof readFile;
  readonly rename: typeof rename;
  readonly rm: typeof rm;
  readonly stat: typeof stat;
}

const defaultRunContentKeyFileSystem: RunContentKeyFileSystem = Object.freeze({
  mkdir,
  chmod,
  open,
  readFile,
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

  async destroy(runId: string): Promise<void> {
    this.#records.delete(runId);
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
    let directoryCreated = false;
    let published = false;
    try {
      await this.fileSystem.mkdir(this.root, { recursive: true, mode: 0o700 });
      await this.fileSystem.chmod(this.root, 0o700);
      await this.fileSystem.mkdir(runs, { recursive: true, mode: 0o700 });
      await this.fileSystem.chmod(runs, 0o700);
      await this.fileSystem.mkdir(directory, { recursive: false, mode: 0o700 });
      directoryCreated = true;
      file = await this.fileSystem.open(temporary, "wx", 0o600);
      await file.writeFile(JSON.stringify(record), "utf8");
      await file.sync();
      await file.close();
      file = undefined;
      await this.fileSystem.rename(temporary, location);
      published = true;
      directoryHandle = await this.fileSystem.open(directory, "r");
      await directoryHandle.sync();
      await directoryHandle.close();
      directoryHandle = undefined;
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
      if (published) {
        throw new CryptoError(
          "RUN_CONTENT_KEY_STORE_DURABILITY_UNCERTAIN",
          "Run content-key durability could not be confirmed"
        );
      }
      if (directoryCreated) {
        try {
          await this.fileSystem.rm(directory, { recursive: true, force: true });
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
      const metadata = await this.fileSystem.stat(location);
      if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
        throw new RunContentKeyUnresolvedError();
      }
      const record = parseStoredRunContentKey(JSON.parse(await this.fileSystem.readFile(location, "utf8")), runId);
      return await unwrapRunContentKey(this.users, this.resolveUserId, record);
    } catch (error) {
      if (error instanceof RunContentKeyUnresolvedError) throw error;
      throw new RunContentKeyUnresolvedError();
    }
  }

  async destroy(runId: string): Promise<void> {
    if (!UUID_V4.test(runId)) throw new RunContentKeyUnresolvedError();
    await this.fileSystem.rm(join(this.root, "runs", runId), { recursive: true, force: true });
  }
}

export interface PreparedRunContentCipher {
  readonly runId: string;
  encrypt(carrier: ContentCarrier, primaryKey: string, value: unknown): CryptoEnvelope;
  decrypt<T = unknown>(carrier: ContentCarrier, primaryKey: string, envelope: CryptoEnvelope): T;
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

  close(): void {
    this.#key?.fill(0);
    this.#key = undefined;
  }
}

export class ContentCipher {
  readonly #blindIndexKey: Buffer;

  constructor(
    private readonly keys: RunContentKeyStore,
    blindIndexKey: Uint8Array
  ) {
    if (!(blindIndexKey instanceof Uint8Array) || blindIndexKey.byteLength !== KEY_BYTES) {
      throw new TypeError("CONTENT_BLIND_INDEX_KEY_INVALID");
    }
    this.#blindIndexKey = Buffer.from(blindIndexKey);
  }

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

  questionBlindIndex(ownerRef: string, question: string): Buffer {
    if (!UUID_V4.test(ownerRef) || typeof question !== "string" || question.trim() === "") {
      throw new TypeError("CONTENT_BLIND_INDEX_INPUT_INVALID");
    }
    const normalized = question.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
    return createHmac("sha256", this.#blindIndexKey)
      .update("debateai:content-question:v1\0", "utf8")
      .update(ownerRef.toLowerCase(), "utf8")
      .update("\0", "utf8")
      .update(normalized, "utf8")
      .digest();
  }

  destroyRunKey(runId: string): Promise<void> {
    return this.keys.destroy(runId);
  }
}
