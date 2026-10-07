import { openRecord, sealRecord, type RecordAad } from "@debateai/crypto";
import type { SecretToken, TaxLocation } from "@debateai/billing-core";
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

export function taxLocationOf(location: QuoteLocation): TaxLocation {
  return Object.freeze({
    country: location.country, region: location.region, postalCode: location.postalCode,
    city: location.city, street: location.street, ip: location.ip
  });
}
