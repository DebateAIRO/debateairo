import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { GeoLookup, GeoLookupResult } from "@debateai/geo";
import { TypedDomainError } from "@debateai/kernel";
import { composeGeoLookup, decideItalyApproval, italyIpLeg } from "../../apps/api/src/italy-approval.js";

/**
 * Italy clause approval S01, P15 + P18 (R14-R17): the decision the sign-up routes make, the IP leg's skip line, the
 * boot composition of the one GeoLookup, and main.ts's wiring of it. Every line is compared EXACTLY, so a line that
 * carried the address or the country would fail.
 */
const answering = (answer: GeoLookupResult) => {
  const lookup = vi.fn((_ip: string): GeoLookupResult => answer);
  return { lookup, close: () => undefined } satisfies GeoLookup;
};
const throwing = () => {
  const lookup = vi.fn((_ip: string): GeoLookupResult => { throw new Error("controlled lookup failure for 151.1.1.1"); });
  return { lookup, close: () => undefined } satisfies GeoLookup;
};
const logger = () => vi.fn((_line: string): void => undefined);

describe("the IP leg (P15, R15)", () => {
  it("P-L1: no lookup composed is false and logs one NO_LOOKUP line", () => {
    const log = logger();
    expect(italyIpLeg({ lookup: undefined, ip: "151.1.1.1", surface: "register", log })).toBe(false);
    expect(log.mock.calls).toEqual([['{"event":"italy_approval.ip_leg_skipped","surface":"register","reason":"NO_LOOKUP"}']]);
  });

  it("P-L2: a lookup that throws is false and logs one LOOKUP_FAILED line", () => {
    const log = logger();
    const lookup = throwing();
    expect(italyIpLeg({ lookup, ip: "151.1.1.1", surface: "social_complete", log })).toBe(false);
    expect(lookup.lookup).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([
      ['{"event":"italy_approval.ip_leg_skipped","surface":"social_complete","reason":"LOOKUP_FAILED"}']
    ]);
  });

  it("P-L3: an address with no country (XX) is false and logs one NO_COUNTRY line", () => {
    const log = logger();
    expect(italyIpLeg({ lookup: answering({ country: "XX", tor: false }), ip: "10.0.0.1", surface: "register", log }))
      .toBe(false);
    expect(log.mock.calls).toEqual([['{"event":"italy_approval.ip_leg_skipped","surface":"register","reason":"NO_COUNTRY"}']]);
  });

  it("P-L4: an Italian address is true even from a Tor exit, another country is false, and neither logs", () => {
    const log = logger();
    expect(italyIpLeg({ lookup: answering({ country: "IT", tor: true }), ip: "185.220.101.7", surface: "register", log }))
      .toBe(true);
    expect(italyIpLeg({ lookup: answering({ country: "FR", tor: false }), ip: "90.1.1.1", surface: "social_complete", log }))
      .toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
});

describe("the decision (P15, R14)", () => {
  it.each([
    ["IT", "IT", "BOTH"],
    ["IT", "FR", "PICKED"],
    ["FR", "IT", "IP"],
    ["FR", "FR", null]
  ] as const)("P-D1: picked %s with an IP in %s decides %s, asking the lookup once with that IP", (picked, ipCountry, leg) => {
    const log = logger();
    const lookup = answering({ country: ipCountry, tor: false });
    expect(decideItalyApproval({ pickedCountry: picked, lookup, ip: "198.51.100.7", surface: "register", log })).toBe(leg);
    expect(lookup.lookup.mock.calls).toEqual([["198.51.100.7"]]);
    expect(log).not.toHaveBeenCalled();
  });

  it("P-D1: a US-state pick is not Italy; only the IP can make it so", () => {
    const log = logger();
    expect(decideItalyApproval({ pickedCountry: "US", lookup: answering({ country: "IT", tor: false }), ip: "151.1.1.1", surface: "register", log }))
      .toBe("IP");
    expect(decideItalyApproval({ pickedCountry: "US", lookup: answering({ country: "US", tor: false }), ip: "8.8.8.8", surface: "register", log }))
      .toBeNull();
  });

  it("P-D1: the picked leg still decides when the IP leg is skipped", () => {
    const log = logger();
    expect(decideItalyApproval({ pickedCountry: "IT", lookup: undefined, ip: "151.1.1.1", surface: "register", log })).toBe("PICKED");
    expect(decideItalyApproval({ pickedCountry: "FR", lookup: throwing(), ip: "151.1.1.1", surface: "social_complete", log })).toBeNull();
    expect(log.mock.calls).toEqual([
      ['{"event":"italy_approval.ip_leg_skipped","surface":"register","reason":"NO_LOOKUP"}'],
      ['{"event":"italy_approval.ip_leg_skipped","surface":"social_complete","reason":"LOOKUP_FAILED"}']
    ]);
  });
});

describe("the boot composition of the one GeoLookup (P15, R14, R16, R17)", () => {
  it("P-C1: local mode opens nothing and logs nothing, whatever the gate says", () => {
    for (const gateComposed of [false, true]) {
      const open = vi.fn(() => answering({ country: "IT", tor: false }));
      const log = logger();
      expect(composeGeoLookup({ mode: "local", gateComposed, open, log })).toBeUndefined();
      expect(open).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    }
  });

  it("P-C2: hosted without a gate turns the IP leg off on a failed open, with one boot line, and never refuses the boot", () => {
    const log = logger();
    const open = vi.fn((): GeoLookup => {
      throw new TypedDomainError("GEOIP_COUNTRY_DB_UNAVAILABLE", "the country file is missing");
    });
    expect(composeGeoLookup({ mode: "hosted", gateComposed: false, open, log })).toBeUndefined();
    expect(open).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([['{"event":"italy_approval.ip_leg_off","code":"GEOIP_COUNTRY_DB_UNAVAILABLE"}']]);
  });

  it("P-C2: an untyped open failure is reported under the one fallback code", () => {
    const log = logger();
    expect(composeGeoLookup({ mode: "hosted", gateComposed: false, open: () => { throw new Error("/var/geo/dbip.mmdb"); }, log }))
      .toBeUndefined();
    expect(log.mock.calls).toEqual([['{"event":"italy_approval.ip_leg_off","code":"GEO_LOOKUP_OPEN_FAILED"}']]);
  });

  it("P-C2: hosted without a gate returns the opened lookup itself and logs nothing", () => {
    const log = logger();
    const opened = answering({ country: "IT", tor: false });
    expect(composeGeoLookup({ mode: "hosted", gateComposed: false, open: () => opened, log })).toBe(opened);
    expect(log).not.toHaveBeenCalled();
  });

  it("P-C3: hosted with the gate composed lets a failed open refuse the boot, as today", () => {
    const log = logger();
    const failure = new TypedDomainError("GEOIP_COUNTRY_DB_UNAVAILABLE", "the country file is missing");
    let thrown: unknown;
    try {
      composeGeoLookup({ mode: "hosted", gateComposed: true, open: () => { throw failure; }, log });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
    expect(log).not.toHaveBeenCalled();
    const opened = answering({ country: "IT", tor: false });
    expect(composeGeoLookup({ mode: "hosted", gateComposed: true, open: () => opened, log })).toBe(opened);
    expect(log).not.toHaveBeenCalled();
  });
});

describe("main.ts composes one lookup for the gate and the IP leg (P18)", () => {
  it("P-M1: one openGeoLookup, opened whatever the gate, handed to buildApi; the gate line is unchanged", () => {
    const main = readFileSync("apps/api/src/main.ts", "utf8");
    expect(main.split("openGeoLookup(").length - 1).toBe(1);
    expect(main).toContain("gateComposed: countryPolicy !== null");
    const start = main.indexOf("const api = buildApi({");
    expect(start).toBeGreaterThan(-1);
    const call = main.slice(start, main.indexOf("\n});", start));
    expect(call).toContain("italyApproval:");
    expect(call).toContain("lookup: geoLookup");
    expect(main).toContain("const countryGate = countryPolicy === null || geoLookup === undefined ? undefined : new CountryGate({");
  });
});
