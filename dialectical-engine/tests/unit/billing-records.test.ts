import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SecretToken } from "@debateai/billing-core";
import { openRecord, sealRecord } from "@debateai/crypto";
import {
  openBillingProfile,
  openQuoteLocation,
  sealBillingProfile,
  sealCardToken,
  sealQuoteLocation,
  taxLocationOf,
  type BillingProfile,
  type QuoteLocation
} from "../../apps/api/src/billing/records.js";

const KEY = randomBytes(32);
const CUSTOMER = randomUUID();
const QUOTE = randomUUID();
const PROFILE: BillingProfile = Object.freeze({
  email: "person@example.test", locale: "ro", name: "Ana Pop", firstName: "Ana", lastName: "Pop", phone: "+40712345678",
  paymentIp: "198.51.100.7", country: "RO", region: null, postalCode: "010101", city: "Sector 1", street: null,
  company: null
});
const LOCATION: QuoteLocation = Object.freeze({
  name: "Ana Pop", firstName: "Ana", lastName: "Pop", phone: "+40712345678", country: "RO", region: "Bucuresti",
  postalCode: "010101", city: "Sector 1", street: null, ip: "198.51.100.7", ipCountry: "RO",
  company: { name: "SC Test SRL", vatId: "RO123VALID", address: "Str. 1", vatValidated: true }
});
/** A made-up token (tests never hold a real one) that counts how often its text is read. */
function countingToken(plaintext: string): SecretToken & { readonly reads: () => number } {
  let reads = 0;
  const token = {
    reveal: (): string => { reads += 1; return plaintext; },
    fingerprint: "test-fingerprint",
    toString: (): string => "[token]",
    toJSON: (): string => "[token]",
    reads: (): number => reads
  };
  return token;
}

describe("P7 billing records under the records key", () => {
  it("opens what it sealed, and only for the same row", () => {
    const sealed = sealBillingProfile(KEY, CUSTOMER, PROFILE);
    expect(sealed.ciphertext.includes(Buffer.from("person@example.test"))).toBe(false);
    expect(openBillingProfile(KEY, CUSTOMER, sealed.ciphertext)).toEqual(PROFILE);
    expect(() => openBillingProfile(KEY, randomUUID(), sealed.ciphertext)).toThrow();
    expect(() => openBillingProfile(randomBytes(32), CUSTOMER, sealed.ciphertext)).toThrow();
  });

  it("binds a quote location to its quote id and maps it to the tax connector's location", () => {
    const sealed = sealQuoteLocation(KEY, QUOTE, LOCATION);
    expect(openQuoteLocation(KEY, QUOTE, sealed.ciphertext)).toEqual(LOCATION);
    expect(() => openQuoteLocation(KEY, randomUUID(), sealed.ciphertext)).toThrow();
    expect(taxLocationOf(LOCATION)).toEqual({
      country: "RO", region: "Bucuresti", postalCode: "010101", city: "Sector 1", street: null, ip: "198.51.100.7"
    });
  });

  it("refuses to seal a profile or a location outside its closed shape", () => {
    expect(() => sealBillingProfile(KEY, CUSTOMER, { ...PROFILE, country: "ro" })).toThrow();
    expect(() => sealBillingProfile(KEY, CUSTOMER, { ...PROFILE, extra: "x" } as unknown as BillingProfile)).toThrow();
    expect(() => sealQuoteLocation(KEY, QUOTE, { ...LOCATION, name: "" })).toThrow();
  });
});

describe("N7 the payer's fields (spec 2026-10-05 §2.5.3)", () => {
  it("opens a profile and a location sealed before NETOPIA, their new fields null", () => {
    const older = { email: "old@example.test", locale: "en", name: null, country: "DE", region: null, postalCode: null,
      city: null, street: null, company: null };
    const profile = sealRecord(KEY, { table: "billing.customer_profile_event", column: "profile_ciphertext", rowId: CUSTOMER },
      Buffer.from(JSON.stringify(older), "utf8"));
    expect(openBillingProfile(KEY, CUSTOMER, profile.ciphertext))
      .toEqual({ ...older, firstName: null, lastName: null, phone: null, paymentIp: null });
    const olderLocation = { name: null, country: "DE", region: null, postalCode: null, city: null, street: null,
      ip: null, ipCountry: "DE", company: null };
    const location = sealRecord(KEY, { table: "billing.quote", column: "location_ciphertext", rowId: QUOTE },
      Buffer.from(JSON.stringify(olderLocation), "utf8"));
    expect(openQuoteLocation(KEY, QUOTE, location.ciphertext)).toEqual({ ...olderLocation, firstName: null, lastName: null, phone: null });
  });

  it("seals a profile written without the new fields with them null (a pre-NETOPIA writer)", () => {
    const sealed = sealBillingProfile(KEY, CUSTOMER, {
      email: "w@example.test", locale: "en", name: null, country: "RO", region: null, postalCode: null, city: null,
      street: null, company: null
    });
    expect(openBillingProfile(KEY, CUSTOMER, sealed.ciphertext)).toMatchObject({ firstName: null, phone: null, paymentIp: null });
  });

  it("takes a phone only in E.164 and a name only when it has a letter's worth of text", () => {
    for (const phone of ["0712345678", "+0712345678", "+4071234567890123", "+40 712 345 678"]) {
      expect(() => sealBillingProfile(KEY, CUSTOMER, { ...PROFILE, phone }), phone).toThrow();
    }
    expect(() => sealBillingProfile(KEY, CUSTOMER, { ...PROFILE, firstName: "  " })).toThrow();
    expect(() => sealQuoteLocation(KEY, QUOTE, { ...LOCATION, lastName: "" })).toThrow();
    expect(() => sealQuoteLocation(KEY, QUOTE, { ...LOCATION, phone: "+40712345678" })).not.toThrow();
  });
});

describe("N7 the saved card's seal (spec 2026-10-05 §2.15.1, §2.2 rule 5)", () => {
  it("seals the token under its own row, reads its text once, and never carries it in the clear", () => {
    const tokenId = randomUUID();
    const plaintext = ["test", "card", "token", tokenId.slice(0, 8)].join("-");
    const token = countingToken(plaintext);
    const sealed = sealCardToken(KEY, tokenId, token);
    expect(token.reads()).toBe(1);
    expect(sealed.keyId).toMatch(/^[0-9a-f]{16}$/u);
    expect(sealed.ciphertext.includes(Buffer.from(plaintext, "utf8"))).toBe(false);
    const aad = { table: "billing.card_token", column: "token_ciphertext", rowId: tokenId } as const;
    expect(openRecord(KEY, aad, sealed.ciphertext).toString("utf8")).toBe(plaintext);
    expect(() => openRecord(KEY, { ...aad, rowId: randomUUID() }, sealed.ciphertext)).toThrow();
    expect(() => openRecord(KEY, { ...aad, column: "profile_ciphertext" }, sealed.ciphertext)).toThrow();
  });
});
