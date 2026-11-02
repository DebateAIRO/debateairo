import { createHmac } from "node:crypto";
import { openRecord, recordsKeyId, sealRecord, type RecordAad } from "@debateai/crypto";
import type { SecretToken, TaxLocation } from "@debateai/billing-core";
import type { CardTokenRow, NoticeQuarantineRow } from "@debateai/db";
import { createSecretToken } from "@debateai/payments-netopia";
import { z } from "zod";

/**
 * The personal fields that must outlive an account (spec §2.2 rule 5), sealed under the records key (L1). The AAD
 * names the table, the column and the row, so a ciphertext copied into another row does not open.
 */
const Iso2 = z.string().regex(/^[A-Z]{2}$/);
/** Spec 2026-10-05 §2.3: NETOPIA takes the payer's phone in E.164. */
const E164 = z.string().regex(/^\+[1-9][0-9]{6,14}$/);
const PersonName = z.string().trim().min(1).max(128);
const CompanySchema = z.object({
  name: z.string().trim().min(1).max(256),
  vatId: z.string().trim().min(2).max(32),
  address: z.string().trim().min(1).max(512),
  vatValidated: z.boolean()
}).strict();

const BillingProfileSchema = z.object({
  email: z.string().min(3).max(320).regex(/^[^\s@]+@[^\s@]+$/),
  locale: z.string().regex(/^[a-z]{2}$/),
  /** The single name of a profile sealed before NETOPIA (kept for older profiles). */
  name: z.string().max(256).nullable(),
  /**
   * Spec 2026-10-05 §2.5.3: NETOPIA's payer. Null by default, so a profile sealed before them still opens; a NETOPIA
   * checkout always writes them.
   */
  firstName: PersonName.nullable().default(null),
  lastName: PersonName.nullable().default(null),
  phone: E164.nullable().default(null),
  /** The internet address of the person's latest payment made in person (a checkout, an upgrade or a card change). */
  paymentIp: z.string().max(64).nullable().default(null),
  country: Iso2,
  region: z.string().max(64).nullable(),
  postalCode: z.string().max(16).nullable(),
  city: z.string().max(128).nullable(),
  street: z.string().max(256).nullable(),
  company: CompanySchema.nullable()
}).strict();
/** What a reader gets: every field present, the payer's fields null on an older profile. */
export type BillingProfile = z.infer<typeof BillingProfileSchema>;
/** What a writer may hand in: the payer's fields may be left out (they are sealed as null). */
export type BillingProfileInput = z.input<typeof BillingProfileSchema>;

const QuoteLocationSchema = z.object({
  /**
   * The buyer's own name; R-15: required when the invoice issuer is SmartBill (Romania), optional elsewhere. Spec
   * 2026-10-05 §2.5.3: a NETOPIA checkout writes it as "first + last", so the invoice issuers read it unchanged.
   */
  name: z.string().trim().min(1).max(256).nullable(),
  firstName: PersonName.nullable().default(null),
  lastName: PersonName.nullable().default(null),
  phone: E164.nullable().default(null),
  country: Iso2,
  region: z.string().max(64).nullable(),
  postalCode: z.string().max(16).nullable(),
  city: z.string().max(128).nullable(),
  street: z.string().max(256).nullable(),
  ip: z.string().max(64).nullable(),
  /** The country of `ip` at quote time ("XX" when unknown); the first piece of location evidence. */
  ipCountry: z.string().regex(/^(?:[A-Z]{2})$/),
  company: CompanySchema.nullable()
}).strict();
export type QuoteLocation = z.infer<typeof QuoteLocationSchema>;
export type QuoteLocationInput = z.input<typeof QuoteLocationSchema>;

function seal(key: Buffer, aad: RecordAad, value: unknown): { ciphertext: Buffer; keyId: string } {
  return sealRecord(key, aad, Buffer.from(JSON.stringify(value), "utf8"));
}

function open<T>(key: Buffer, aad: RecordAad, ciphertext: Buffer, schema: { parse(value: unknown): T }): T {
  const plaintext = openRecord(key, aad, ciphertext);
  try {
    return schema.parse(JSON.parse(plaintext.toString("utf8")));
  } finally {
    plaintext.fill(0);
  }
}

const profileAad = (customerId: string): RecordAad =>
  ({ table: "billing.customer_profile_event", column: "profile_ciphertext", rowId: customerId });
const locationAad = (quoteId: string): RecordAad =>
  ({ table: "billing.quote", column: "location_ciphertext", rowId: quoteId });
/** Spec 2026-10-05 §2.15.1: N9's `openCardToken` opens with this same AAD. */
const cardTokenAad = (tokenId: string): RecordAad =>
  ({ table: "billing.card_token", column: "token_ciphertext", rowId: tokenId });

export function sealBillingProfile(key: Buffer, customerId: string, profile: BillingProfileInput): { ciphertext: Buffer; keyId: string } {
  return seal(key, profileAad(customerId), BillingProfileSchema.parse(profile));
}

export function openBillingProfile(key: Buffer, customerId: string, ciphertext: Buffer): BillingProfile {
  return open(key, profileAad(customerId), ciphertext, BillingProfileSchema);
}

export function sealQuoteLocation(key: Buffer, quoteId: string, location: QuoteLocationInput): { ciphertext: Buffer; keyId: string } {
  return seal(key, locationAad(quoteId), QuoteLocationSchema.parse(location));
}

export function openQuoteLocation(key: Buffer, quoteId: string, ciphertext: Buffer): QuoteLocation {
  return open(key, locationAad(quoteId), ciphertext, QuoteLocationSchema);
}

/** `billing.location_evidence.ip_ciphertext`, one row per charge. */
export function sealIpEvidence(key: Buffer, chargeId: string, ip: string | null): { ciphertext: Buffer; keyId: string } {
  return seal(key, { table: "billing.location_evidence", column: "ip_ciphertext", rowId: chargeId }, { ip });
}

/**
 * `billing.card_token.token_ciphertext` (spec 2026-10-05 §2.15.1, §2.2 rule 5): the token's UTF-8 bytes under the
 * records key, the AAD naming this row. Its text is read once, through the token's one explicit method, and the
 * buffer that held it is wiped; nothing here logs, returns or throws it.
 */
export function sealCardToken(key: Buffer, tokenId: string, token: SecretToken): { ciphertext: Buffer; keyId: string } {
  const plaintext = Buffer.from(token.reveal(), "utf8");
  try {
    return sealRecord(key, cardTokenAad(tokenId), plaintext);
  } finally {
    plaintext.fill(0);
  }
}

/**
 * Spec 2026-10-05 §2.15.1: a saved card opened for the one request that sends it. The text goes straight into a
 * SecretToken (which prints `[token]` everywhere) and the buffer that held it is wiped.
 */
export function openCardToken(key: Buffer, row: Pick<CardTokenRow, "tokenId" | "tokenCiphertext">): SecretToken {
  const plaintext = openRecord(key, cardTokenAad(row.tokenId), row.tokenCiphertext);
  try {
    return createSecretToken(plaintext.toString("utf8"));
  } finally {
    plaintext.fill(0);
  }
}

const noticeAllowedAad = (noticeId: string): RecordAad =>
  ({ table: "billing.payment_notice", column: "allowed_ciphertext", rowId: noticeId });
const NoticeAllowedSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

/** `billing.payment_notice.allowed_ciphertext`: §2.5.2's allow-list of a verified message (never the token). */
export function sealNoticeAllowed(
  key: Buffer, noticeId: string, allowed: Readonly<Record<string, string | number | null>>
): { ciphertext: Buffer; keyId: string } {
  return seal(key, noticeAllowedAad(noticeId), allowed);
}

/**
 * The counterpart of `sealNoticeAllowed`: a stored message's allow-list, opened for VERIFY_PAYMENT's decision from the
 * notice (B2: NETOPIA's refusal `code`). Throws when the ciphertext does not open under this key and row, or does not
 * hold a flat record of strings, numbers and nulls.
 */
export function openNoticeAllowed(
  key: Buffer, noticeId: string, ciphertext: Buffer
): Readonly<Record<string, string | number | null>> {
  return Object.freeze(open(key, noticeAllowedAad(noticeId), ciphertext, NoticeAllowedSchema));
}

/** `billing.payment_notice_raw.raw_ciphertext`: the verified bytes as received (token included), kept 14 days. */
export function sealNoticeRaw(key: Buffer, noticeId: string, rawBody: Buffer): { ciphertext: Buffer; keyId: string } {
  return sealRecord(key, { table: "billing.payment_notice_raw", column: "raw_ciphertext", rowId: noticeId }, rawBody);
}

const quarantineAad = (quarantineId: string, column: "raw_ciphertext" | "header_ciphertext"): RecordAad =>
  ({ table: "billing.notice_quarantine", column, rowId: quarantineId });

/** A NETOPIA message's bytes and its `Verification-token` header, each sealed under its own AAD. */
type SealedMessage = Readonly<{ rawCiphertext: Buffer; headerCiphertext: Buffer | null; keyId: string }>;

function sealMessage(key: Buffer, rawAad: RecordAad, headerAad: RecordAad, rawBody: Buffer, header: string | undefined): SealedMessage {
  const raw = sealRecord(key, rawAad, rawBody);
  if (header === undefined) return Object.freeze({ rawCiphertext: raw.ciphertext, headerCiphertext: null, keyId: raw.keyId });
  const bytes = Buffer.from(header, "utf8");
  try {
    const sealed = sealRecord(key, headerAad, bytes);
    return Object.freeze({ rawCiphertext: raw.ciphertext, headerCiphertext: sealed.ciphertext, keyId: raw.keyId });
  } finally {
    bytes.fill(0);
  }
}

/** The counterpart of `sealMessage`: the caller owns `rawBody` and wipes it when done; a refusal wipes it here. */
function openMessage(
  key: Buffer, rawAad: RecordAad, headerAad: RecordAad, sealed: Pick<SealedMessage, "rawCiphertext" | "headerCiphertext">
): Readonly<{ rawBody: Buffer; header: string | undefined }> {
  const rawBody = openRecord(key, rawAad, sealed.rawCiphertext);
  if (sealed.headerCiphertext === null) return Object.freeze({ rawBody, header: undefined });
  let header: Buffer;
  try {
    header = openRecord(key, headerAad, sealed.headerCiphertext);
  } catch (error) {
    rawBody.fill(0);
    throw error;
  }
  try {
    return Object.freeze({ rawBody, header: header.toString("utf8") });
  } finally {
    header.fill(0);
  }
}

/** §2.7.4: a message that failed verification, its bytes and its header sealed apart (14 days, never acted on). */
export function sealQuarantined(
  key: Buffer, quarantineId: string, rawBody: Buffer, header: string | undefined
): SealedMessage {
  return sealMessage(key, quarantineAad(quarantineId, "raw_ciphertext"), quarantineAad(quarantineId, "header_ciphertext"),
    rawBody, header);
}

const QUARANTINE_ID_DOMAIN = "debateai.billing.notice-quarantine-id.v1";
/** The header's presence byte in the id's MAC input: absent, or present and followed by its UTF-8 bytes. */
const HEADER_ABSENT = 0x00;
const HEADER_PRESENT = 0x01;

/**
 * NV-44: the quarantine's content key, its row id. HMAC-SHA-256 under a subkey of the records key over the body's
 * length, the body, then the header (absent or present, and its UTF-8 bytes), cut to 128 bits and stamped as an
 * RFC 9562 version-8 UUID: the same bytes always name the same row. Keyed, so the clear-text id reveals nothing about
 * the sealed content. A wrong-size key throws RECORD_KEY_INVALID, as every seal does.
 */
export function noticeQuarantineIdOf(key: Buffer, rawBody: Buffer, header: string | undefined): string {
  recordsKeyId(key);
  const subkey = createHmac("sha256", key).update(QUARANTINE_ID_DOMAIN, "utf8").digest();
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(rawBody.byteLength));
  const mac = createHmac("sha256", subkey).update(length).update(rawBody);
  subkey.fill(0);
  if (header === undefined) mac.update(Buffer.alloc(1, HEADER_ABSENT));
  else mac.update(Buffer.alloc(1, HEADER_PRESENT)).update(header, "utf8");
  const bytes = mac.digest().subarray(0, 16);
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x80, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The re-check at every start (§2.7.4 step 2): the caller owns `rawBody` and wipes it when done. */
export function openQuarantined(
  key: Buffer, row: Pick<NoticeQuarantineRow, "quarantineId" | "rawCiphertext" | "headerCiphertext">
): Readonly<{ rawBody: Buffer; header: string | undefined }> {
  return openMessage(key, quarantineAad(row.quarantineId, "raw_ciphertext"),
    quarantineAad(row.quarantineId, "header_ciphertext"), row);
}

/**
 * B3a (NETOPIA answers 2026-10-21): a spool file is no table row, so its AAD names the file family under a schema no
 * database has (`file.`), the field and the file's own spool id; a seal copied into another file, or from a database
 * column, does not open. (@debateai/crypto admits only `schema.table` names, so `file:` reads `file.` here.)
 */
const spoolAad = (spoolId: string, column: "raw" | "header"): RecordAad =>
  ({ table: "file.billing_notice_spool", column, rowId: spoolId });

/** B3a: a verified message the database could not take, its bytes (token included) and its header sealed apart. */
export function sealSpooledNotice(key: Buffer, spoolId: string, rawBody: Buffer, header: string | undefined): SealedMessage {
  return sealMessage(key, spoolAad(spoolId, "raw"), spoolAad(spoolId, "header"), rawBody, header);
}

/** B3a's replay: the caller owns `rawBody` and wipes it when done. Throws for another key, file or a changed byte. */
export function openSpooledNotice(
  key: Buffer, spoolId: string, sealed: Readonly<{ rawCiphertext: Buffer; headerCiphertext: Buffer | null }>
): Readonly<{ rawBody: Buffer; header: string | undefined }> {
  return openMessage(key, spoolAad(spoolId, "raw"), spoolAad(spoolId, "header"), sealed);
}

export function taxLocationOf(location: QuoteLocation): TaxLocation {
  return Object.freeze({
    country: location.country, region: location.region, postalCode: location.postalCode,
    city: location.city, street: location.street, ip: location.ip
  });
}

const paymentUrlAad = (chargeId: string): RecordAad =>
  ({ table: "billing.hosted_payment", column: "redirect_ciphertext", rowId: chargeId });

/** Spec §2.5.2: NETOPIA's payment URL lets anyone pay our order, so it is sealed under the records key. */
export function sealPaymentUrl(key: Buffer, chargeId: string, url: string): { ciphertext: Buffer; keyId: string } {
  return sealRecord(key, paymentUrlAad(chargeId), Buffer.from(url, "utf8"));
}

export function openPaymentUrl(key: Buffer, chargeId: string, ciphertext: Buffer): string {
  const plaintext = openRecord(key, paymentUrlAad(chargeId), ciphertext);
  try {
    return plaintext.toString("utf8");
  } finally {
    plaintext.fill(0);
  }
}
