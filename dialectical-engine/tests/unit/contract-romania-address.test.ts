import { describe, expect, it } from "vitest";
import {
  BUCHAREST_COUNTY, BUCHAREST_SECTORS, isRomanianInvoiceLocality, ROMANIA_COUNTIES
} from "@debateai/contract";

describe("Romania's invoice localities, as SmartBill names them (smartbill-api-facts.md row 3)", () => {
  it("lists 41 counties plus Bucuresti, each once, in ASCII, frozen", () => {
    expect(ROMANIA_COUNTIES).toHaveLength(42);
    expect(new Set(ROMANIA_COUNTIES).size).toBe(42);
    expect(ROMANIA_COUNTIES).toContain("Bucuresti");
    expect(BUCHAREST_COUNTY).toBe("Bucuresti");
    for (const county of ROMANIA_COUNTIES) expect(county, county).toMatch(/^[A-Z][a-z]+(?:[- ][A-Z][a-z]+)?$/);
    expect(Object.isFrozen(ROMANIA_COUNTIES)).toBe(true);
  });

  it("lists exactly the six Bucharest sectors, frozen", () => {
    expect(BUCHAREST_SECTORS).toEqual(["Sector 1", "Sector 2", "Sector 3", "Sector 4", "Sector 5", "Sector 6"]);
    expect(Object.isFrozen(BUCHAREST_SECTORS)).toBe(true);
  });

  it("accepts a listed county with a city, and Bucharest only by sector", () => {
    expect(isRomanianInvoiceLocality("Cluj", "Cluj-Napoca")).toBe(true);
    expect(isRomanianInvoiceLocality("Cluj", " ")).toBe(false);
    expect(isRomanianInvoiceLocality("Bucuresti", "Sector 3")).toBe(true);
    expect(isRomanianInvoiceLocality("Bucuresti", "Bucuresti")).toBe(false);
    expect(isRomanianInvoiceLocality("B", "Sector 3")).toBe(false);
    expect(isRomanianInvoiceLocality("Berlin", "Berlin")).toBe(false);
  });
});
