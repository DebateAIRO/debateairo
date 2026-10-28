import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ARCHIVE_KEYS, loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { DATA_EXPORT_LOCALES } from "../../packages/contract/src/index.js";

const SAME_AS_ENGLISH = new Set<string>([]);
const catalogue = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(join(process.cwd(), "apps/api/src/data-export/archive-messages", `${locale}.json`), "utf8"));
const home = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(join(process.cwd(), "apps/ui/messages", locale, "home.json"), "utf8"));
const placeholders = (value: string): string[] => [...value.matchAll(/\{[^{}]+\}/g)].map(([token]) => token).sort();
const required = (value: string | undefined, locale: string, key: string): string => {
  if (typeof value !== "string") throw new Error(`${locale}: ${key} is missing`);
  return value;
};

describe("K-ARCHIVE copy", () => {
  it("KA-1 has every non-empty archive key in all 35 locales", () => {
    expect(ARCHIVE_KEYS).toHaveLength(32);
    expect(DATA_EXPORT_LOCALES).toHaveLength(35);
    for (const locale of DATA_EXPORT_LOCALES) {
      const values = catalogue(locale);
      for (const key of ARCHIVE_KEYS) {
        expect(required(values[key], locale, key).trim(), `${locale}: ${key}`).not.toBe("");
      }
    }
  });

  it("KA-2 preserves each English placeholder", () => {
    const english = catalogue("en");
    for (const locale of DATA_EXPORT_LOCALES) {
      const values = catalogue(locale);
      for (const key of ARCHIVE_KEYS) {
        expect(placeholders(required(values[key], locale, key)), `${locale}: ${key}`).toEqual(placeholders(required(english[key], "en", key)));
      }
    }
  });

  it("KA-3 translates every non-English value", () => {
    const english = catalogue("en");
    for (const locale of DATA_EXPORT_LOCALES.filter((value) => value !== "en")) {
      const values = catalogue(locale);
      for (const key of ARCHIVE_KEYS) {
        if (!SAME_AS_ENGLISH.has(`${locale}:${key}`)) {
          expect(values[key], `${locale}: ${key}`).not.toBe(english[key]);
        }
      }
    }
  });

  it("KA-4 has exactly the 32 archive keys per file", () => {
    for (const locale of DATA_EXPORT_LOCALES) {
      expect(Object.keys(catalogue(locale)).sort(), locale).toEqual([...ARCHIVE_KEYS].sort());
    }
  });

  it("KA-5 loads every declared locale", () => {
    for (const locale of DATA_EXPORT_LOCALES) {
      expect(Object.keys(loadArchiveCatalog(locale)).sort(), locale).toEqual([...ARCHIVE_KEYS].sort());
    }
  });

  it("KA-6 the deletion notice quotes the export's own category words, unchanged (S01-R35, review B3/N8)", () => {
    for (const locale of DATA_EXPORT_LOCALES) {
      const category = required(catalogue(locale)["archive.category.suicideOrHarm"], locale, "archive.category.suicideOrHarm");
      const facts = home(locale)["home.removal.facts"] ?? "";
      const escaped = category.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
      const quoted = new RegExp(`[“„«»「”"]\\s?${escaped}\\s?[”“»«」"]`, "u");
      expect(quoted.test(facts), `${locale}: home.removal.facts must quote "${category}": ${facts}`).toBe(true);
    }
  });

  it("KA-7 the card label is the export's flagged word, in capitals where the script has them (V-110, review N1i)", () => {
    for (const locale of DATA_EXPORT_LOCALES) {
      const word = required(catalogue(locale)["archive.verdict.flagged"], locale, "archive.verdict.flagged");
      const cased = [...word].some((character) => character.toLowerCase() !== character.toUpperCase());
      expect(home(locale)["home.flag.flagged"], `${locale}: home.flag.flagged`).toBe(cased ? word.toLocaleUpperCase(locale) : word);
    }
  });
});
