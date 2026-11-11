import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openGeoLookup } from "@debateai/geo";
import { COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW, countryPolicyFromValue } from "@debateai/register";
import { CountryGate } from "../../apps/api/src/country-gate.js";
import { writeCountryMmdb } from "../support/mmdb-writer.js";

/**
 * C1 — DB-IP gives the EU's own overseas parts their own ISO codes (Réunion RE, Guadeloupe GP,
 * Martinique MQ, French Guiana GF, Mayotte YT, Saint-Martin MF, Åland AX). The country policy keys
 * France and Finland only, so those codes fell to the closed default rule and sign-up AND sign-in
 * were refused COUNTRY_SIGNUP_UNAVAILABLE for people who live in France or Finland. The lookup now
 * answers the member state; a place outside the EU (Saint-Barthélemy BL, New Caledonia NC) keeps
 * its own code and its own rule.
 */
const TERRITORIES = [
  { network: "102.35.0.0/16", code: "RE", parent: "FR", ip: "102.35.1.2" },
  { network: "104.36.0.0/16", code: "GP", parent: "FR", ip: "104.36.1.2" },
  { network: "109.24.0.0/16", code: "MQ", parent: "FR", ip: "109.24.1.2" },
  { network: "143.255.0.0/16", code: "GF", parent: "FR", ip: "143.255.1.2" },
  { network: "152.89.0.0/16", code: "YT", parent: "FR", ip: "152.89.1.2" },
  { network: "185.123.0.0/16", code: "MF", parent: "FR", ip: "185.123.1.2" },
  { network: "62.236.0.0/16", code: "AX", parent: "FI", ip: "62.236.1.2" },
  { network: "2a01:cb00::/32", code: "RE", parent: "FR", ip: "2a01:cb00::7" }
] as const;
const OUTSIDE_THE_EU = [
  { network: "193.251.0.0/16", code: "BL", ip: "193.251.1.2" },
  { network: "203.0.0.0/16", code: "NC", ip: "203.0.1.2" }
] as const;
const MAINLAND = [
  { network: "81.196.0.0/16", country: "RO" },
  { network: "90.0.0.0/16", country: "FR" },
  { network: "85.76.0.0/16", country: "FI" }
];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function geo() {
  const root = await mkdtemp(join(tmpdir(), "geo-territories-"));
  roots.push(root);
  const countryDbPath = join(root, "country.mmdb");
  const torListPath = join(root, "tor.txt");
  await writeFile(countryDbPath, writeCountryMmdb([
    ...MAINLAND,
    ...TERRITORIES.map(({ network, code }) => ({ network, country: code })),
    ...OUTSIDE_THE_EU.map(({ network, code }) => ({ network, country: code }))
  ]));
  await writeFile(torListPath, "185.220.101.7\n");
  return openGeoLookup({ countryDbPath, torListPath });
}

describe("C1: the EU's overseas parts are their member state", () => {
  it("answers FR for the overseas departments and Saint-Martin, FI for Åland", async () => {
    const lookup = await geo();
    for (const place of TERRITORIES) {
      expect(lookup.lookup(place.ip), place.code).toEqual({ country: place.parent, tor: false });
      expect(lookup.lookupRegion(place.ip).country, place.code).toBe(place.parent);
    }
    expect(lookup.lookup("90.0.1.2").country).toBe("FR");
    expect(lookup.lookup("85.76.1.2").country).toBe("FI");
    lookup.close();
  });

  it("keeps the code of a place outside the EU", async () => {
    const lookup = await geo();
    for (const place of OUTSIDE_THE_EU) expect(lookup.lookup(place.ip).country, place.code).toBe(place.code);
    lookup.close();
  });

  it("lets people there sign up AND sign in under the deployment policy", async () => {
    const lookup = await geo();
    const policy = countryPolicyFromValue(
      COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value, COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
    );
    const audit = { recordCountryGateRefusal: vi.fn(async () => undefined) };
    const gate = new CountryGate({ policy, lookup, audit });
    for (const place of TERRITORIES) {
      const source = { ip: place.ip } as Parameters<CountryGate["signup"]>[0];
      expect(gate.signup(source), `${place.code} sign-up`).toBeNull();
      expect(gate.service(source), `${place.code} sign-in`).toBeNull();
      expect(gate.availability(place.ip), place.code).toMatchObject({ signup: true, service: true });
      expect(gate.recordedCountry(place.ip), place.code).toBe(place.parent);
    }
    expect(audit.recordCountryGateRefusal).not.toHaveBeenCalled();
    lookup.close();
  });
});
