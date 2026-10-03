import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  openBillingProfile,
  openQuoteLocation,
  sealBillingProfile,
  sealQuoteLocation,
  taxLocationOf,
  type BillingProfile,
  type QuoteLocation
} from "../../apps/api/src/billing/records.js";

const KEY = randomBytes(32);
const CUSTOMER = randomUUID();
const QUOTE = randomUUID();
const PROFILE: BillingProfile = Object.freeze({
  email: "person@example.test", locale: "ro", name: null, country: "RO", region: null,
  postalCode: "010101", city: "Sector 1", street: null, company: null
});
const LOCATION: QuoteLocation = Object.freeze({
  name: "Ana Pop", country: "RO", region: "Bucuresti", postalCode: "010101", city: "Sector 1", street: null,
  ip: "198.51.100.7", ipCountry: "RO", company: { name: "SC Test SRL", vatId: "RO123VALID", address: "Str. 1", vatValidated: true }
});

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
