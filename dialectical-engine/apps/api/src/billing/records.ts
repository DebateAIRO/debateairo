import { openRecord, sealRecord, type RecordAad } from "@debateai/crypto";
import type { TaxLocation } from "@debateai/billing-core";
import { z } from "zod";

/**
 * The personal fields that must outlive an account (spec §2.2 rule 5), sealed under the records key (L1). The AAD
 * names the table, the column and the row, so a ciphertext copied into another row does not open.
 */
const Iso2 = z.string().regex(/^[A-Z]{2}$/);
const CompanySchema = z.object({
  name: z.string().trim().min(1).max(256),
  vatId: z.string().trim().min(2).max(32),
  address: z.string().trim().min(1).max(512),
  vatValidated: z.boolean()
}).strict();

const BillingProfileSchema = z.object({
  email: z.string().min(3).max(320).regex(/^[^\s@]+@[^\s@]+$/),
  locale: z.string().regex(/^[a-z]{2}$/),
  name: z.string().max(256).nullable(),
  country: Iso2,
  region: z.string().max(64).nullable(),
  postalCode: z.string().max(16).nullable(),
  city: z.string().max(128).nullable(),
  street: z.string().max(256).nullable(),
  company: CompanySchema.nullable()
}).strict();
export type BillingProfile = z.infer<typeof BillingProfileSchema>;

const QuoteLocationSchema = z.object({
  /** The buyer's own name; R-15: required when the invoice issuer is SmartBill (Romania), optional elsewhere. */
  name: z.string().trim().min(1).max(256).nullable(),
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

export function sealBillingProfile(key: Buffer, customerId: string, profile: BillingProfile): { ciphertext: Buffer; keyId: string } {
  return seal(key, profileAad(customerId), BillingProfileSchema.parse(profile));
}

export function openBillingProfile(key: Buffer, customerId: string, ciphertext: Buffer): BillingProfile {
  return open(key, profileAad(customerId), ciphertext, BillingProfileSchema);
}

export function sealQuoteLocation(key: Buffer, quoteId: string, location: QuoteLocation): { ciphertext: Buffer; keyId: string } {
  return seal(key, locationAad(quoteId), QuoteLocationSchema.parse(location));
}

export function openQuoteLocation(key: Buffer, quoteId: string, ciphertext: Buffer): QuoteLocation {
  return open(key, locationAad(quoteId), ciphertext, QuoteLocationSchema);
}

/** `billing.location_evidence.ip_ciphertext`, one row per charge. */
export function sealIpEvidence(key: Buffer, chargeId: string, ip: string | null): { ciphertext: Buffer; keyId: string } {
  return seal(key, { table: "billing.location_evidence", column: "ip_ciphertext", rowId: chargeId }, { ip });
}

export function taxLocationOf(location: QuoteLocation): TaxLocation {
  return Object.freeze({
    country: location.country, region: location.region, postalCode: location.postalCode,
    city: location.city, street: location.street, ip: location.ip
  });
}
