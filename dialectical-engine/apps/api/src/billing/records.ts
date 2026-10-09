import { openRecord, sealRecord, type RecordAad } from "@debateai/crypto";
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

/** `billing.payment_notice.allowed_ciphertext`: §2.5.2's allow-list of a verified message (never the token). */
export function sealNoticeAllowed(
  key: Buffer, noticeId: string, allowed: Readonly<Record<string, string | number | null>>
): { ciphertext: Buffer; keyId: string } {
  return seal(key, { table: "billing.payment_notice", column: "allowed_ciphertext", rowId: noticeId }, allowed);
}

/** `billing.payment_notice_raw.raw_ciphertext`: the verified bytes as received (token included), kept 14 days. */
export function sealNoticeRaw(key: Buffer, noticeId: string, rawBody: Buffer): { ciphertext: Buffer; keyId: string } {
  return sealRecord(key, { table: "billing.payment_notice_raw", column: "raw_ciphertext", rowId: noticeId }, rawBody);
}

const quarantineAad = (quarantineId: string, column: "raw_ciphertext" | "header_ciphertext"): RecordAad =>
  ({ table: "billing.notice_quarantine", column, rowId: quarantineId });

/** §2.7.4: a message that failed verification, its bytes and its header sealed apart (14 days, never acted on). */
export function sealQuarantined(
  key: Buffer, quarantineId: string, rawBody: Buffer, header: string | undefined
): Readonly<{ rawCiphertext: Buffer; headerCiphertext: Buffer | null; keyId: string }> {
  const raw = sealRecord(key, quarantineAad(quarantineId, "raw_ciphertext"), rawBody);
  if (header === undefined) return Object.freeze({ rawCiphertext: raw.ciphertext, headerCiphertext: null, keyId: raw.keyId });
  const bytes = Buffer.from(header, "utf8");
  try {
    const sealed = sealRecord(key, quarantineAad(quarantineId, "header_ciphertext"), bytes);
    return Object.freeze({ rawCiphertext: raw.ciphertext, headerCiphertext: sealed.ciphertext, keyId: raw.keyId });
  } finally {
    bytes.fill(0);
  }
}

/** The re-check at every start (§2.7.4 step 2): the caller owns `rawBody` and wipes it when done. */
export function openQuarantined(
  key: Buffer, row: Pick<NoticeQuarantineRow, "quarantineId" | "rawCiphertext" | "headerCiphertext">
): Readonly<{ rawBody: Buffer; header: string | undefined }> {
  const rawBody = openRecord(key, quarantineAad(row.quarantineId, "raw_ciphertext"), row.rawCiphertext);
  if (row.headerCiphertext === null) return Object.freeze({ rawBody, header: undefined });
  let header: Buffer;
  try {
    header = openRecord(key, quarantineAad(row.quarantineId, "header_ciphertext"), row.headerCiphertext);
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
