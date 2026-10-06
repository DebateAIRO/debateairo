import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const locales = "ar bg cs da de el en es et fi fr ga he hi hr hu id it ja ko lt lv mt nl pl pt ro ru sk sl sv tr uk vi zh".split(" ");
const english = {
  "auth.region.label": "Region",
  "auth.region.placeholder": "Select your region",
  "auth.region.continentHeader": "CONTINENT",
  "auth.region.continent.africa": "Africa",
  "auth.region.continent.asia": "Asia",
  "auth.region.continent.europe": "Europe",
  "auth.region.continent.middleEast": "Middle East",
  "auth.region.continent.northAmerica": "North America",
  "auth.region.continent.southAmerica": "South America",
  "auth.region.continent.oceania": "Oceania",
  "auth.region.back": "‹ Continents",
  "auth.region.stateLabel": "State",
  "auth.region.statePlaceholder": "Select a state",
  "auth.region.stateMissing": "✗ Select your state.",
  "auth.region.complete": "✓ Region complete"
} as const;

function catalog(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`apps/ui/messages/${locale}/auth.json`, "utf8")) as Record<string, unknown>;
}

describe("region picker catalog", () => {
  it("ships every region key in all 35 catalogs and the exact English oracle", () => {
    expect(locales).toHaveLength(35);
    for (const locale of locales) {
      const values = catalog(locale);
      for (const key of Object.keys(english)) {
        expect(typeof values[key], `${locale} ${key}`).toBe("string");
        expect((values[key] as string).trim().length, `${locale} ${key}`).toBeGreaterThan(0);
      }
    }
    expect(Object.fromEntries(Object.keys(english).map((key) => [key, catalog("en")[key]]))).toEqual(english);
  });

  it("translates the four action and status lines in every non-English catalog", () => {
    const keys = ["auth.region.placeholder", "auth.region.statePlaceholder", "auth.region.stateMissing", "auth.region.complete"];
    for (const locale of locales.filter((entry) => entry !== "en")) {
      const values = catalog(locale);
      for (const key of keys) expect(values[key], `${locale} ${key}`).not.toBe(english[key as keyof typeof english]);
    }
  });

  it("keeps the status glyphs and mirrors the RTL back chevron", () => {
    for (const locale of locales) {
      const values = catalog(locale);
      expect(values["auth.region.stateMissing"], locale).toMatch(/^✗ /);
      expect(values["auth.region.complete"], locale).toMatch(/^✓ /);
      expect(values["auth.region.back"], locale).toMatch(locale === "ar" || locale === "he" ? /^› / : /^‹ /);
    }
  });
});
