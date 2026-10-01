import { describe, expect, it } from "vitest";
import {
  CRISIS_LINES,
  crisisCountryOptions,
  formatCrisisHours,
  readCrisisCountryHint,
  resolveCrisisCountry
} from "../../apps/ui/lib/crisisLines.js";

/* The helplines the crisis screen offers (V, 2026-09-30). A wrong or undialable entry is worse
   than none, so the directory is checked for shape; the numbers themselves were confirmed on
   each line's `sourceUrl` on the research date. */

describe("the helpline directory", () => {
  const countries = Object.entries(CRISIS_LINES);

  it("covers the home market and every EU country", () => {
    for (const code of ["RO", "MD", "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
      "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "SK", "SI", "ES", "SE", "GB", "US"]) {
      expect(CRISIS_LINES[code], code).toBeDefined();
    }
  });

  it("gives every country an emergency number and every line a way to reach it", () => {
    for (const [code, country] of countries) {
      expect(country.emergency, code).toMatch(/^\d{2,4}$/u);
      for (const line of country.lines) {
        expect(line.tel !== null || line.sms !== null || line.chatUrl !== null, `${code} ${line.name}`).toBe(true);
        if (line.tel !== null) {
          expect(line.tel, `${code} ${line.name}`).toMatch(/^[*+]?\d{3,15}$/u);
          expect(line.phone, `${code} ${line.name}`).not.toBeNull();
        }
        expect(line.website, `${code} ${line.name}`).toMatch(/^https:\/\//u);
        expect(line.sourceUrl, `${code} ${line.name}`).toMatch(/^https:\/\//u);
        if (line.chatUrl !== null) expect(line.chatUrl).toMatch(/^https:\/\//u);
        if (line.open247) expect(line.hours, `${code} ${line.name}`).toBeNull();
      }
    }
  });

  it("puts the lines open around the clock first", () => {
    for (const [code, country] of countries) {
      const order = country.lines.map((line) => line.open247);
      expect(order, code).toEqual([...order].sort((left, right) => Number(right) - Number(left)));
    }
  });
});

describe("choosing the country", () => {
  it("prefers the edge's country, then the browser's region, then the interface language", () => {
    expect(resolveCrisisCountry({ hint: "RO", browserLanguages: ["en-GB"], locale: "de" })).toBe("RO");
    expect(resolveCrisisCountry({ hint: "ZZ", browserLanguages: ["en-IE", "en"], locale: "de" })).toBe("IE");
    expect(resolveCrisisCountry({ hint: null, browserLanguages: ["en"], locale: "de" })).toBe("DE");
    expect(resolveCrisisCountry({ hint: null, browserLanguages: [], locale: "ar" })).toBeNull();
  });

  it("reads a two-letter edge country and ignores the unknown and Tor codes", () => {
    const headers = (value: string | null) => ({ get: () => value });
    expect(readCrisisCountryHint(headers("RO"))).toBe("RO");
    expect(readCrisisCountryHint(headers("XX"))).toBeNull();
    expect(readCrisisCountryHint(headers("T1"))).toBeNull();
    expect(readCrisisCountryHint(headers("ro"))).toBeNull();
    expect(readCrisisCountryHint(headers(null))).toBeNull();
  });

  it("names the countries in the reader's language", () => {
    const romanian = crisisCountryOptions("ro");
    expect(romanian.find((option) => option.code === "DE")?.name).toBe("Germania");
    expect(romanian.length).toBe(Object.keys(CRISIS_LINES).length);
  });
});

describe("opening hours", () => {
  it("names the weekdays in the reader's language", () => {
    const weekendNights = [{ days: ["fri", "sat", "sun"] as const, from: "19:00", to: "07:00" }];
    expect(formatCrisisHours(weekendNights, "en")).toBe("Fri, Sat, Sun 19:00–07:00");
    expect(formatCrisisHours(weekendNights, "ro")).toMatch(/^vin\.?, s[aâ]m\.?, dum\.? 19:00–07:00$/u);
    expect(formatCrisisHours([{ from: "08:00", to: "00:00" }], "en")).toBe("08:00–00:00");
  });
});
