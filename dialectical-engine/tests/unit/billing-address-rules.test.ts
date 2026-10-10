import { describe, expect, it } from "vitest";
import { e164Phone, postcodeOptional } from "@debateai/contract";
import { addressRequired } from "../../apps/api/src/billing/quote.js";
import type { QuoteLocation } from "../../apps/api/src/billing/records.js";
import { testBillingPolicy } from "../support/billingFixtures.js";

/** A whole German buyer: every field NETOPIA needs (spec §2.3 Payer), Quaderno's issuer. */
const WHOLE: QuoteLocation = Object.freeze({
  name: "Anna Schmidt", firstName: "Anna", lastName: "Schmidt", phone: "+4915112345678", country: "DE", region: null,
  postalCode: "10115", city: "Berlin", street: "Invalidenstrasse 1", ip: null, ipCountry: "DE", company: null
});
const at = (overrides: Partial<QuoteLocation>, taxCountry = overrides.country ?? "DE"): boolean =>
  addressRequired({ ...WHOLE, ...overrides }, taxCountry, testBillingPolicy);

describe("N18 spec §2.6.1: every paid checkout gives NETOPIA's cardholder fields", () => {
  it("asks nothing more of a whole buyer, and asks for each missing name, phone, street, city or postal code", () => {
    expect(at({})).toBe(false);
    for (const field of ["firstName", "lastName", "phone", "street", "city", "postalCode"] as const) {
      expect(at({ [field]: null }), field).toBe(true);
    }
  });

  it("lets a country of the no-postcode list go without a postal code (Ireland), and no other", () => {
    expect(postcodeOptional("IE")).toBe(true);
    expect(postcodeOptional("DE")).toBe(false);
    expect(at({ country: "IE", postalCode: null, ipCountry: "IE" })).toBe(false);
    expect(at({ country: "FR", postalCode: null, ipCountry: "FR" })).toBe(true);
  });

  it.each(["US", "CA", "RO"])("asks %s for the region too (A31 (h), R-15)", (country) => {
    const city = country === "RO" ? "Cluj-Napoca" : "Springfield";
    expect(at({ country, region: null, city, ipCountry: country })).toBe(true);
    expect(at({ country, region: country === "RO" ? "Cluj" : country === "US" ? "IL" : "ON", city, ipCountry: country })).toBe(false);
  });
});

describe("N18 the phone NETOPIA receives is E.164", () => {
  it("keeps + and 8 to 15 digits, drops spaces, dashes, dots and brackets, reads 00 as +, and refuses the rest", () => {
    expect(e164Phone("+40 712-345 678")).toBe("+40712345678");
    expect(e164Phone("(+1) 212.555.0100")).toBe("+12125550100");
    expect(e164Phone("0040712345678")).toBe("+40712345678");
    // Refused: no country code, too short, too long, letters, a leading zero, nothing.
    for (const bad of ["0712 345 678", "+4071", "+1234567890123456", "+40 712 ABC 678", "+0712345678", ""]) {
      expect(e164Phone(bad), bad).toBeNull();
    }
  });
});
