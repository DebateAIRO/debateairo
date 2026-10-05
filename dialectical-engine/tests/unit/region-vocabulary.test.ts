import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  REGION_CONTINENTS, REGION_COUNTRIES, REGION_COUNTRY_CODES, US_STATES, US_STATE_CODES,
  parseDeclaredRegion, isDeclaredRegion, declaredRegionFromPick, regionFlag,
  regionCountryName, regionCountriesOf
} from "@debateai/kernel";

const design = readFileSync(new URL("../fixtures/region-picker/turn-8a-region-logic.js", import.meta.url), "utf8");
const continents = ["Africa", "Asia", "Europe", "Middle East", "North America", "South America", "Oceania"] as const;
const triples = continents.flatMap((continent) => {
  const escaped = continent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = design.match(new RegExp(`^\\s*(?:'${escaped}'|${escaped}): '([^']+)'`, "m"));
  if (!line) throw new Error(`design continent missing: ${continent}`);
  return line[1]!.split(",").map((item) => [continent, item.slice(0, 2), item.slice(3)]);
});
const stateNames = design.match(/const STATES = '([^']+)'/)?.[1]?.split(",");
const stateCodes = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

describe("region vocabulary", () => {
  it("A1 preserves each design country, its continent, and its order", () => {
    expect(REGION_CONTINENTS).toEqual(continents);
    expect(REGION_COUNTRIES.map(({ continent, code, englishName }) => [continent, code, englishName])).toEqual(triples);
    expect(REGION_COUNTRIES).toHaveLength(82);
    expect(new Set(REGION_COUNTRY_CODES).size).toBe(82);
    expect(REGION_CONTINENTS.map((c) => REGION_COUNTRIES.filter((x) => x.continent === c).length)).toEqual([12, 12, 33, 10, 5, 7, 3]);
  });
  it("A2 preserves design state names and USPS codes in order", () => {
    expect(US_STATES.map((s) => s.name)).toEqual(stateNames);
    expect(US_STATE_CODES).toEqual(stateCodes);
  });
  it("A3 accepts every listed country and every US state", () => {
    for (const country of REGION_COUNTRY_CODES) {
      if (country === "US") for (const us_state of US_STATE_CODES) expect(parseDeclaredRegion({ country, us_state })).toEqual({ country, usState: us_state });
      else expect(parseDeclaredRegion({ country })).toEqual({ country, usState: null });
    }
    expect(parseDeclaredRegion({ country: "RO", us_state: null })).toEqual({ country: "RO", usState: null });
  });
  it("A4 refuses absent, unlisted, malformed, and contradictory picks", () => {
    for (const body of [{}, { country: 7 }, { country: "ro" }, { country: "XX" }, { country: "US" },
      { country: "US", us_state: "Texas" }, { country: "US", us_state: "tx" }, { country: "US", us_state: null },
      { country: "RO", us_state: "CA" }, { country: "RO", us_state: "" }]) expect(parseDeclaredRegion(body)).toBeNull();
  });
  it("A5 guards service values and identifies complete UI picks", () => {
    expect(isDeclaredRegion({ country: "RO", usState: null })).toBe(true);
    expect(isDeclaredRegion({ country: "US", usState: "TX" })).toBe(true);
    for (const value of [null, "RO", { country: "RO", usState: "CA" }, { country: "US", usState: null }, { country: "XX", usState: null }]) expect(isDeclaredRegion(value)).toBe(false);
    expect(declaredRegionFromPick(null, "")).toBeNull();
    expect(declaredRegionFromPick("US", "")).toBeNull();
    expect(declaredRegionFromPick("XX", "")).toBeNull();
    expect(declaredRegionFromPick("RO", "")).toEqual({ country: "RO", usState: null });
    expect(declaredRegionFromPick("US", "TX")).toEqual({ country: "US", usState: "TX" });
  });
  it("A6 renders regional indicator flags", () => {
    expect(regionFlag("RO")).toBe("\u{1F1F7}\u{1F1F4}");
    expect(regionFlag("US")).toBe("\u{1F1FA}\u{1F1F8}");
  });
  it("A7 gives English design names and order", () => {
    for (const { code, englishName } of REGION_COUNTRIES) expect(regionCountryName(code, "en")).toBe(englishName);
    for (const continent of REGION_CONTINENTS) expect(regionCountriesOf(continent, "en").map((c) => c.code)).toEqual(REGION_COUNTRIES.filter((c) => c.continent === continent).map((c) => c.code));
  });
  it("A8 localizes and sorts country names", () => {
    expect(regionCountryName("DE", "ro")).toBe("Germania");
    expect(regionCountryName("US", "ro")).toBe("Statele Unite ale Americii");
    const collator = new Intl.Collator("ro");
    for (const continent of REGION_CONTINENTS) {
      const names = regionCountriesOf(continent, "ro").map((c) => regionCountryName(c.code, "ro"));
      for (let i = 1; i < names.length; i++) expect(collator.compare(names[i - 1]!, names[i]!)).toBeLessThanOrEqual(0);
    }
  });
  it("A9 falls back to design names when Intl cannot name a country", () => {
    const spy = vi.spyOn(Intl, "DisplayNames").mockImplementation(() => { throw new RangeError("locale"); });
    expect(regionCountryName("TR", "en")).toBe("Türkiye");
    spy.mockImplementation(() => ({ of: () => undefined }) as unknown as Intl.DisplayNames);
    expect(regionCountryName("CZ", "en")).toBe("Czechia");
    spy.mockRestore();
  });
});
