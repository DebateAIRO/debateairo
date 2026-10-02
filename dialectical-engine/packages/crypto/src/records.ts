import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Paid plans L1 (spec 2026-09-29 §2.3.1) — THE RECORDS KEY.
 *
 * A 32-byte key the API alone holds (RECORDS_KEY_PATH, loaded with `loadSecretKey`). It seals the
 * personal fields that must OUTLIVE an account — acceptance evidence, the billing profile, location
 * evidence — which is exactly why they are never under the user DEK: erasure destroys that key.
 *
 * AES-256-GCM, a fresh 96-bit nonce per record, and an AAD that names the table, the column and the
 * row, the way user-DEK AADs name theirs (apps/api/src/registration.ts:1262-1270): a ciphertext
 * copied into another row, column or table does not open. The key id travels with every ciphertext
 * so a rotation can be added later without guessing which key sealed a row.
 *
 * Wire format (bytea): 0x01 || nonce(12) || tag(16) || ciphertext.
 */
export type RecordAad = Readonly<{ table: string; column: string; rowId: string }>;

const RECORDS_KEY_BYTES = 32;
const RECORD_NONCE_BYTES = 12;
const RECORD_TAG_BYTES = 16;
const RECORD_FORMAT_V1 = 0x01;
const RECORD_HEADER_BYTES = 1 + RECORD_NONCE_BYTES + RECORD_TAG_BYTES;
const RECORDS_KEY_ID_DOMAIN = "debateai.records.v1";
const RECORD_AAD_DOMAIN = "debateai.records.aad.v1";
const TABLE_NAME = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/u;
const COLUMN_NAME = /^[a-z_][a-z0-9_]*$/u;
const ROW_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/u;

export type RecordCryptoErrorCode = "RECORD_KEY_INVALID" | "RECORD_AAD_INVALID" | "RECORD_DECRYPT_FAILED";

/** Code-only, like every crypto refusal: the message is the code and never carries a value. */
export class RecordCryptoError extends Error {
  constructor(readonly code: RecordCryptoErrorCode) {
    super(code);
    this.name = "RecordCryptoError";
  }
}

function assertRecordsKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.byteLength !== RECORDS_KEY_BYTES) {
    throw new RecordCryptoError("RECORD_KEY_INVALID");
  }
}

function recordAadBytes(aad: RecordAad, keyId: string): Buffer {
  if (typeof aad?.table !== "string" || !TABLE_NAME.test(aad.table)
    || typeof aad.column !== "string" || !COLUMN_NAME.test(aad.column)
    || typeof aad.rowId !== "string" || !ROW_ID.test(aad.rowId)) {
    throw new RecordCryptoError("RECORD_AAD_INVALID");
  }
  return Buffer.from(JSON.stringify([RECORD_AAD_DOMAIN, keyId, aad.table, aad.column, aad.rowId]), "utf8");
}

/** A stable, non-secret label: the first 16 hex of sha256("debateai.records.v1" || key). */
export function recordsKeyId(key: Buffer): string {
  assertRecordsKey(key);
  return createHash("sha256")
    .update(RECORDS_KEY_ID_DOMAIN, "utf8")
    .update(key)
    .digest("hex")
    .slice(0, 16);
}

export function sealRecord(
  key: Buffer,
  aad: RecordAad,
  plaintext: Uint8Array
): { ciphertext: Buffer; keyId: string } {
  assertRecordsKey(key);
  const keyId = recordsKeyId(key);
  const authenticated = recordAadBytes(aad, keyId);
  const nonce = randomBytes(RECORD_NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: RECORD_TAG_BYTES });
  cipher.setAAD(authenticated);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: Buffer.concat([Buffer.from([RECORD_FORMAT_V1]), nonce, cipher.getAuthTag(), body]),
    keyId
  };
}

/** Any refusal — wrong key, wrong row, a flipped bit, a truncated value — is RECORD_DECRYPT_FAILED. */
export function openRecord(key: Buffer, aad: RecordAad, ciphertext: Buffer): Buffer {
  try {
    assertRecordsKey(key);
    if (!Buffer.isBuffer(ciphertext) || ciphertext.byteLength < RECORD_HEADER_BYTES
      || ciphertext[0] !== RECORD_FORMAT_V1) {
      throw new RecordCryptoError("RECORD_DECRYPT_FAILED");
    }
    const nonce = ciphertext.subarray(1, 1 + RECORD_NONCE_BYTES);
    const tag = ciphertext.subarray(1 + RECORD_NONCE_BYTES, RECORD_HEADER_BYTES);
    const body = ciphertext.subarray(RECORD_HEADER_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: RECORD_TAG_BYTES });
    decipher.setAAD(recordAadBytes(aad, recordsKeyId(key)));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new RecordCryptoError("RECORD_DECRYPT_FAILED");
  }
}
