import { describe, expect, it } from "vitest";
import { locationVerdict } from "../../apps/api/src/billing/location-verdict.js";

const base = { declaredCountry: "RO", ipCountry: "RO", cardCountry: "RO", countryConfirmed: false, card: "OK" as const };

describe("P9b the location verdict (spec §2.5.4 step 3)", () => {
  it("is BLOCKED whenever the card is from an always-blocked country, whatever else agrees", () => {
    expect(locationVerdict({ ...base, cardCountry: "RU", card: "BLOCKED" })).toBe("BLOCKED");
  });
  it("is AGREED when the declared country is backed by the address or by the card", () => {
    expect(locationVerdict(base)).toBe("AGREED");
    expect(locationVerdict({ ...base, cardCountry: "DE", card: "MISMATCH" })).toBe("AGREED");
    expect(locationVerdict({ ...base, ipCountry: "DE" })).toBe("AGREED");
  });
  it("is CONFIRMED_BY_PERSON when the person confirmed and the card agrees", () => {
    expect(locationVerdict({ ...base, ipCountry: "DE", countryConfirmed: true })).toBe("CONFIRMED_BY_PERSON");
  });
  it("is CONFLICTING when neither the address nor the card backs the declared country", () => {
    expect(locationVerdict({ ...base, ipCountry: "DE", cardCountry: "FR", card: "MISMATCH" })).toBe("CONFLICTING");
    expect(locationVerdict({ ...base, ipCountry: "DE", cardCountry: null, countryConfirmed: true })).toBe("CONFLICTING");
  });
});
