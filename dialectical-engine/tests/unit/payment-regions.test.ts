import { describe, expect, it } from "vitest";
import { PAYMENT_REGION_IDS, POSTCODE_CHECKED_COUNTRIES, paymentRegionsOf } from "@debateai/kernel";

/*
 * Payment region blocks, Task 1: which closed-list region a billing address is in, from its postal code and the
 * typed region. The expected ranges below are written from the sources (USPS L002 + Census ZCTA for the US, Canada
 * Post first letters, the national postal sources for the EU territories), not read back from the module.
 */

const at = (country: string, postalCode: string | null, region: string | null = null) =>
  paymentRegionsOf({ country, postalCode, region });

const regionsAt = (country: string, postalCode: string | null, region: string | null = null) => {
  const result = at(country, postalCode, region);
  expect(result.kind).toBe("REGIONS");
  return result.regions;
};

const zip3 = (prefix: number) => `${String(prefix).padStart(3, "0")}01`;

describe("the closed list of region ids", () => {
  it("has 51 US + 12 Canadian + 14 EU-territory ids, sorted and unique", () => {
    expect(PAYMENT_REGION_IDS).toHaveLength(77);
    expect(new Set(PAYMENT_REGION_IDS).size).toBe(77);
    expect([...PAYMENT_REGION_IDS]).toEqual([...PAYMENT_REGION_IDS].sort());
    expect(PAYMENT_REGION_IDS.filter((id) => id.startsWith("US-"))).toHaveLength(51);
    expect(PAYMENT_REGION_IDS.filter((id) => id.startsWith("CA-"))).toHaveLength(12);
    expect(PAYMENT_REGION_IDS.filter((id) => !id.startsWith("US-") && !id.startsWith("CA-")).sort()).toEqual([
      "DE-BUESINGEN", "DE-HELGOLAND", "ES-CE", "ES-CN", "ES-ML", "FI-01",
      "FR-971", "FR-972", "FR-973", "FR-974", "FR-976", "GR-69", "IT-CAMPIONE", "IT-LIVIGNO"
    ]);
    expect(PAYMENT_REGION_IDS).toContain("CA-NT-NU");
    expect(PAYMENT_REGION_IDS).toContain("US-DC");
    expect(PAYMENT_REGION_IDS).not.toContain("CA-NT");
    expect(PAYMENT_REGION_IDS).not.toContain("CA-NU");
  });

  it("checks postal codes in exactly the eight countries with a table", () => {
    expect([...POSTCODE_CHECKED_COUNTRIES].sort()).toEqual(["CA", "DE", "ES", "FI", "FR", "GR", "IT", "US"]);
  });

  it("never returns an id outside the list: every US ZIP3, every Canadian letter, every EU prefix", () => {
    const ids = new Set(PAYMENT_REGION_IDS);
    const seen = new Set<string>();
    const collect = (country: string, postalCode: string | null, region: string | null = null) => {
      for (const id of at(country, postalCode, region).regions) { expect(ids.has(id)).toBe(true); seen.add(id); }
    };
    for (let prefix = 0; prefix < 1000; prefix += 1) collect("US", zip3(prefix));
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") collect("CA", `${letter}1A1A1`);
    for (const country of ["ES", "FR", "FI", "GR", "IT", "DE"]) {
      for (let prefix = 0; prefix < 1000; prefix += 1) collect(country, `${String(prefix).padStart(3, "0")}00`);
    }
    for (const code of ["63086", "63087", "23041", "22061", "27498", "78266"]) {
      for (const country of ["GR", "IT", "DE"]) collect(country, code);
    }
    for (const id of PAYMENT_REGION_IDS) {
      const [country, code] = [id.slice(0, 2), id.slice(3)];
      if (country === "US" || country === "CA") collect(country, null, code === "NT-NU" ? "NT" : code);
    }
    // The tables cover every place in the list, not only the ones closed at launch.
    expect([...seen].sort()).toEqual([...PAYMENT_REGION_IDS]);
  });
});

describe("postal code normalisation", () => {
  it.each([
    ["CA", "s4p 3y2", "CA-SK"],
    ["CA", "  s4p-3y2 ", "CA-SK"],
    ["US", "21201-1234", "US-MD"],
    ["US", "21201 1234", "US-MD"],
    ["FR", "F-97100", "FR-971"],
    ["FR", "f-97100", "FR-971"],
    ["FR", "F - 97200", "FR-972"],
    ["ES", "E-35001", "ES-CN"],
    ["DE", "D-27498", "DE-HELGOLAND"],
    ["IT", "I-23041", "IT-LIVIGNO"],
    ["GR", "GR-63086", "GR-69"],
    ["GR", "630 86", "GR-69"],
    ["FI", "AX-22100", "FI-01"],
    ["FI", "FI-22100", "FI-01"],
    ["FI", "ax-22100", "FI-01"]
  ])("%s %j → %s", (country, postalCode, region) => {
    expect(regionsAt(country, postalCode)).toEqual([region]);
  });

  it("strips a prefix only when the dash follows it", () => {
    expect(at("DE", "D27498").kind).toBe("POSTCODE_INVALID");
  });
});

describe("postal code formats", () => {
  it.each([
    ["US", "21201"], ["US", "212011234"], ["US", "21201-1234"],
    ["CA", "T5J0N3"], ["CA", "t5j 0n3"],
    ["ES", "28001"], ["FR", "75001"], ["FI", "00100"], ["GR", "10557"], ["IT", "00184"], ["DE", "10115"]
  ])("%s %j fits", (country, postalCode) => {
    expect(at(country, postalCode).kind).toBe("REGIONS");
  });

  it.each([
    ["US", "2903"], ["US", "123456"], ["US", "2120112"], ["US", "21201-12345"], ["US", "ABCDE"],
    ["CA", "S4P3Y"], ["CA", "S4P3Y22"], ["CA", "123456"], ["CA", "SS4P3Y"],
    ["ES", "2903"], ["ES", "123456"],
    ["FR", "9710"], ["FR", "971000"], ["FR", "2A004"],
    ["FI", "2210"], ["FI", "221000"],
    ["GR", "6308"], ["GR", "630866"],
    ["IT", "2304"], ["IT", "230410"],
    ["DE", "2749"], ["DE", "274980"], ["DE", "ABCDE"]
  ])("%s %j → POSTCODE_INVALID", (country, postalCode) => {
    expect(at(country, postalCode)).toEqual({ kind: "POSTCODE_INVALID", regions: [] });
  });

  it.each([
    ["IE", null], ["IE", "D02 X285"], ["RO", "010011"], ["GB", "SW1A 1AA"], ["NL", "1012 AB"], ["AT", "1010"]
  ])("%s %j is never POSTCODE_INVALID and names no region", (country, postalCode) => {
    expect(at(country, postalCode)).toEqual({ kind: "REGIONS", regions: [] });
  });

  it("an address without a postal code or region (the pricing page's first quote) is never refused", () => {
    for (const country of ["US", "CA", "ES", "FR", "FI", "GR", "IT", "DE"]) {
      expect(at(country, null, null)).toEqual({ kind: "REGIONS", regions: [] });
      expect(at(country, "   ", null)).toEqual({ kind: "REGIONS", regions: [] });
    }
  });

  it.each(["-", "--", " - "])("a postal code of only dashes %j is present but empty after normalisation → POSTCODE_INVALID", (postalCode) => {
    for (const country of ["US", "CA", "ES", "FR", "FI", "GR", "IT", "DE"]) {
      expect(at(country, postalCode, null)).toEqual({ kind: "POSTCODE_INVALID", regions: [] });
    }
    expect(at("CA", postalCode, "Sask.")).toEqual({ kind: "POSTCODE_INVALID", regions: [] });
    expect(at("CA", postalCode, "Saskatchewan")).toEqual({ kind: "POSTCODE_INVALID", regions: ["CA-SK"] });
    expect(at("RO", postalCode, null)).toEqual({ kind: "REGIONS", regions: [] });
  });
});

describe("Canada: the postal code's first letter (Canada Post)", () => {
  it.each([
    ["A", "CA-NL"], ["B", "CA-NS"], ["C", "CA-PE"], ["E", "CA-NB"],
    ["G", "CA-QC"], ["H", "CA-QC"], ["J", "CA-QC"],
    ["K", "CA-ON"], ["L", "CA-ON"], ["M", "CA-ON"], ["N", "CA-ON"], ["P", "CA-ON"],
    ["R", "CA-MB"], ["S", "CA-SK"], ["T", "CA-AB"], ["V", "CA-BC"], ["X", "CA-NT-NU"], ["Y", "CA-YT"]
  ])("%s → %s", (letter, region) => {
    expect(regionsAt("CA", `${letter}1A1A1`)).toEqual([region]);
  });

  it.each(["D", "F", "I", "O", "Q", "U", "W", "Z"])("%s is not a first letter → POSTCODE_INVALID", (letter) => {
    expect(at("CA", `${letter}1A1A1`).kind).toBe("POSTCODE_INVALID");
  });
});

describe("US: ZIP3 ranges of the owner-listed states (USPS L002 2026-10-01, Census 2020 ZCTA)", () => {
  const ranges: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
    DC: [[200, 200], [202, 205]],
    HI: [[967, 968]],
    MD: [[206, 212], [214, 219]],
    RI: [[28, 29]],
    VT: [[50, 54], [56, 59]],
    WV: [[247, 268]],
    NJ: [[70, 89]],
    OH: [[430, 459]]
  };

  for (const [state, stateRanges] of Object.entries(ranges)) {
    it(`${state}: ${stateRanges.map(([a, b]) => `${a}–${b}`).join(", ")}`, () => {
      for (const [first, last] of stateRanges) {
        expect(regionsAt("US", zip3(first))).toEqual([`US-${state}`]);
        expect(regionsAt("US", zip3(last))).toEqual([`US-${state}`]);
        expect(regionsAt("US", zip3(first - 1))).not.toContain(`US-${state}`);
        expect(regionsAt("US", zip3(last + 1))).not.toContain(`US-${state}`);
      }
    });
  }

  it("no ZIP3 outside those ranges maps to one of the eight states, and none inside maps elsewhere", () => {
    for (let prefix = 0; prefix < 1000; prefix += 1) {
      const owner = Object.entries(ranges).find(([, list]) => list.some(([a, b]) => prefix >= a && prefix <= b))?.[0];
      const regions = regionsAt("US", zip3(prefix));
      if (owner === undefined) for (const state of Object.keys(ranges)) expect(regions).not.toContain(`US-${state}`);
      else expect(regions).toEqual([`US-${owner}`]);
    }
  });

  it("follows geography, not the USPS sorting facility (L002 labels these to another state)", () => {
    expect(regionsAt("US", "25401")).toEqual(["US-WV"]); // Martinsburg WV, labelled to Baltimore MD
    expect(regionsAt("US", "26003")).toEqual(["US-WV"]); // Wheeling WV, labelled to Pittsburgh PA
    expect(regionsAt("US", "43952")).toEqual(["US-OH"]); // Steubenville OH, labelled to Pittsburgh PA
    expect(regionsAt("US", "24605")).toEqual(["US-VA"]); // Bluefield VA, labelled to Charleston WV
    expect(regionsAt("US", "02720")).toEqual(["US-MA"]); // Fall River MA, labelled to Providence RI
  });

  it("territories, military mail and unassigned prefixes name no state", () => {
    // Puerto Rico, Virgin Islands, Guam, APO AE, APO AA, APO AP, unassigned 000, 213, 569.
    for (const code of ["00901", "00801", "96910", "09001", "34001", "96201", "00001", "21301", "56901"]) {
      expect(regionsAt("US", code)).toEqual([]);
    }
  });

  it("works by ZIP3: American Samoa's single ZIP shares Hawaii's prefix, so it reads as Hawaii (errs toward refusing)", () => {
    expect(regionsAt("US", "96799")).toEqual(["US-HI"]);
  });
});

describe("EU territories outside EU VAT", () => {
  it.each([
    ["ES", "35001", ["ES-CN"]], ["ES", "38001", ["ES-CN"]], ["ES", "51001", ["ES-CE"]], ["ES", "52001", ["ES-ML"]],
    ["ES", "28001", []], ["ES", "36001", []], ["ES", "50001", []],
    ["FR", "97100", ["FR-971"]], ["FR", "97133", ["FR-971"]], ["FR", "97150", ["FR-971"]],
    ["FR", "97200", ["FR-972"]], ["FR", "97300", ["FR-973"]], ["FR", "97400", ["FR-974"]], ["FR", "97600", ["FR-976"]],
    ["FR", "75001", []], ["FR", "97500", []], ["FR", "97000", []], ["FR", "97700", []],
    ["FI", "22100", ["FI-01"]], ["FI", "22950", ["FI-01"]], ["FI", "21100", []], ["FI", "23100", []],
    ["GR", "63086", ["GR-69"]], ["GR", "63087", ["GR-69"]], ["GR", "63085", []], ["GR", "63075", []],
    ["IT", "23041", ["IT-LIVIGNO"]], ["IT", "22061", ["IT-CAMPIONE"]], ["IT", "23040", []], ["IT", "22060", []],
    ["DE", "27498", ["DE-HELGOLAND"]], ["DE", "78266", ["DE-BUESINGEN"]], ["DE", "27499", []], ["DE", "78265", []]
  ])("%s %s → %j", (country, postalCode, regions) => {
    expect(regionsAt(country, postalCode)).toEqual(regions);
  });

  it("a postcode only counts in its own country", () => {
    expect(regionsAt("FR", "35001")).toEqual([]);
    expect(regionsAt("ES", "97100")).toEqual([]);
    expect(regionsAt("DE", "23041")).toEqual([]);
  });
});

describe("the typed region (US and Canada only, exact code or full name)", () => {
  it.each([
    ["CA", "Saskatchewan", "CA-SK"], ["CA", "sk", "CA-SK"], ["CA", "  SASKATCHEWAN  ", "CA-SK"],
    ["CA", "Manitoba", "CA-MB"], ["CA", "Québec", "CA-QC"], ["CA", "quebec", "CA-QC"], ["CA", "QC", "CA-QC"],
    ["CA", "Colombie-Britannique", "CA-BC"], ["CA", "British Columbia", "CA-BC"],
    ["CA", "Nouvelle-Écosse", "CA-NS"], ["CA", "nouvelle-ecosse", "CA-NS"], ["CA", "Nova Scotia", "CA-NS"],
    ["CA", "Nouveau-Brunswick", "CA-NB"], ["CA", "New Brunswick", "CA-NB"],
    ["CA", "Terre-Neuve-et-Labrador", "CA-NL"], ["CA", "Newfoundland and Labrador", "CA-NL"],
    ["CA", "Île-du-Prince-Édouard", "CA-PE"], ["CA", "ile-du-prince-edouard", "CA-PE"], ["CA", "Prince Edward Island", "CA-PE"],
    ["CA", "Territoires du Nord-Ouest", "CA-NT-NU"], ["CA", "Northwest Territories", "CA-NT-NU"],
    ["CA", "Nunavut", "CA-NT-NU"], ["CA", "NT", "CA-NT-NU"], ["CA", "NU", "CA-NT-NU"],
    ["CA", "Alberta", "CA-AB"], ["CA", "Ontario", "CA-ON"], ["CA", "Yukon", "CA-YT"], ["CA", "YT", "CA-YT"],
    ["US", "maryland", "US-MD"], ["US", "MD", "US-MD"], ["US", "md", "US-MD"],
    ["US", "District of Columbia", "US-DC"], ["US", "DC", "US-DC"], ["US", "Hawaii", "US-HI"],
    ["US", "Rhode Island", "US-RI"], ["US", "West Virginia", "US-WV"], ["US", "Washington", "US-WA"],
    ["US", "New Jersey", "US-NJ"], ["US", "Ohio", "US-OH"], ["US", "Vermont", "US-VT"]
  ])("%s %j → %s", (country, region, id) => {
    expect(regionsAt(country, null, region)).toEqual([id]);
  });

  it.each([
    ["US", "Maine St"], ["US", "Hawaiian Gardens"], ["US", "Washington DC area"],
    ["US", "Maryland Heights"], ["US", "Virginia Beach"], ["US", "M.D."], ["US", "Sask."],
    ["CA", "Sask."], ["CA", "Saskatoon"], ["CA", "Nunavut Territory"], ["CA", "Maryland"], ["US", "Saskatchewan"],
    ["US", ""], ["CA", "   "]
  ])("%s %j → no region (no substrings, no other country's names)", (country, region) => {
    expect(regionsAt(country, null, region)).toEqual([]);
  });

  it.each([
    ["US", "New  Jersey", "US-NJ"], ["US", "Rhode-Island", "US-RI"],
    ["US", "Hawaiʻi", "US-HI"], ["US", "Hawai'i", "US-HI"], ["US", "Hawai’i", "US-HI"],
    ["CA", "Nouvelle Écosse", "CA-NS"], ["CA", "Colombie Britannique", "CA-BC"],
    ["CA", "Terre Neuve et Labrador", "CA-NL"], ["CA", "Île du Prince Édouard", "CA-PE"],
    ["CA", "Terre‑Neuve–et—Labrador", "CA-NL"], ["CA", "Colombie‐Britannique", "CA-BC"]
  ])("%s %j → %s (spacing and punctuation variants of the whole name)", (country, region, id) => {
    expect(regionsAt(country, null, region)).toEqual([id]);
  });

  it.each([
    ["US", "New Jersey City"], ["US", "Maryland Heights"], ["CA", "Saskatoon"], ["US", "Washington DC area"]
  ])("%s %j → still no region: the tolerance never matches a part of the text", (country, region) => {
    expect(regionsAt(country, null, region)).toEqual([]);
  });

  it("matches the whole name: Indiana is Indiana, never Iowa (IA) by substring", () => {
    expect(regionsAt("US", null, "Indiana")).toEqual(["US-IN"]);
  });

  it("is ignored outside the US and Canada", () => {
    expect(regionsAt("FR", "75001", "Maryland")).toEqual([]);
    expect(regionsAt("ES", "28001", "Canarias")).toEqual([]);
  });
});

describe("both signals", () => {
  it("names every region either signal names, de-duplicated", () => {
    expect([...regionsAt("CA", "T5J0N3", "Saskatchewan")].sort()).toEqual(["CA-AB", "CA-SK"]);
    expect(regionsAt("CA", "S4P3Y2", "Saskatchewan")).toEqual(["CA-SK"]);
    expect([...regionsAt("US", "21201", "Ohio")].sort()).toEqual(["US-MD", "US-OH"]);
  });

  it("a bad postal code keeps the typed region's regions (ruling R1)", () => {
    expect(at("US", "2903", "Rhode Island")).toEqual({ kind: "POSTCODE_INVALID", regions: ["US-RI"] });
    expect(at("CA", "S4P3Y", "Sask")).toEqual({ kind: "POSTCODE_INVALID", regions: [] });
    expect(at("CA", "W1A1A1", "Manitoba")).toEqual({ kind: "POSTCODE_INVALID", regions: ["CA-MB"] });
  });

  it("a typed region alone, with no postal code, still names its region", () => {
    expect(at("US", null, "New Jersey")).toEqual({ kind: "REGIONS", regions: ["US-NJ"] });
  });
});
