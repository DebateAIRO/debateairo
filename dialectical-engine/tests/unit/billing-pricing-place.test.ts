import { describe, expect, it } from "vitest";
import type { GeoLookup } from "@debateai/geo";
import { pricingPlace } from "../../apps/api/src/billing/place.js";

describe("pricingPlace", () => {
  const PLACES: Record<string, { country: string; tor: boolean }> = {
    "198.51.100.20": { country: "DE", tor: false }, "198.51.100.40": { country: "DE", tor: true }
  };
  const geo: GeoLookup = { lookup: (ip) => PLACES[ip] ?? { country: "XX", tor: false }, close: () => undefined };
  const place = (over: Partial<Parameters<typeof pricingPlace>[0]>) =>
    pricingPlace({ geo, ip: "198.51.100.20", country: undefined, postalCode: undefined, ...over });

  it("takes the chosen country, else the account's, else the connection's, else none", () => {
    expect(place({ country: "FR", accountCountry: "RO" })).toEqual({ country: "FR", postalCode: null, status: "READY" });
    expect(place({ accountCountry: "RO" })).toEqual({ country: "RO", postalCode: null, status: "READY" });
    expect(place({ accountCountry: null })).toEqual({ country: "DE", postalCode: null, status: "READY" });
    expect(place({})).toEqual({ country: "DE", postalCode: null, status: "READY" });
    expect(place({ ip: "203.0.113.9" })).toEqual({ country: null, postalCode: null, status: "COUNTRY_NEEDED" });
  });

  it("prices an account country where the connection says nothing: Tor, an unknown address, no lookup", () => {
    for (const over of [{ ip: "198.51.100.40" }, { ip: "203.0.113.9" }, { ip: "not-an-address" }, { geo: undefined }]) {
      expect(place({ ...over, accountCountry: "RO" })).toEqual({ country: "RO", postalCode: null, status: "READY" });
    }
  });

  it("asks a US or Canadian account for the postal code, and uses one sent without a country", () => {
    expect(place({ accountCountry: "US" })).toEqual({ country: "US", postalCode: null, status: "POSTAL_CODE_NEEDED" });
    expect(place({ accountCountry: "US", postalCode: "75201" })).toEqual({ country: "US", postalCode: "75201", status: "READY" });
    expect(place({ accountCountry: "CA", postalCode: "k1a0b1" })).toEqual({ country: "CA", postalCode: "K1A 0B1", status: "READY" });
    expect(place({ accountCountry: "US", postalCode: "7520" })).toEqual({ country: "US", postalCode: null, status: "POSTAL_CODE_INVALID" });
  });
});
