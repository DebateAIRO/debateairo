import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const directory = join(process.cwd(), "packages/mail-templates/messages");
const locales = readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const keys = [
  "mail.export.subject", "mail.export.requested", "mail.export.linkLead",
  "mail.export.validity", "mail.export.notYou"
] as const;
const expectedPlaceholders: Record<(typeof keys)[number], readonly string[]> = {
  "mail.export.subject": [],
  "mail.export.requested": ["{requested}"],
  "mail.export.linkLead": ["{downloadUrl}"],
  "mail.export.validity": ["{expires}"],
  "mail.export.notYou": []
};
const catalogues = Object.fromEntries(locales.map((locale) => [
  locale, JSON.parse(readFileSync(join(directory, locale, "mail.json"), "utf8")) as Record<string, string>
]));
const placeholders = (value: string) => [...value.matchAll(/\{[A-Za-z][A-Za-z0-9_]*\}/g)]
  .map((match) => match[0]).sort();
// Entries may be added only with a DECISIONS.md line explaining the identical translation.
const SAME_AS_ENGLISH: readonly string[] = [];

describe("K-MAIL export copy", () => {
  it("KM-1 has five non-empty export strings in all 35 mail catalogues", () => {
    expect(locales).toHaveLength(35);
    for (const locale of locales) for (const key of keys) {
      expect(catalogues[locale]?.[key]?.trim(), `${locale}:${key}`).toBeTruthy();
    }
  });

  it("KM-2 preserves each English placeholder set in every translation", () => {
    for (const key of keys) expect(placeholders(catalogues.en?.[key] ?? ""), `en:${key}`)
      .toEqual(expectedPlaceholders[key]);
    for (const locale of locales) for (const key of keys) {
      expect(placeholders(catalogues[locale]?.[key] ?? ""), `${locale}:${key}`)
        .toEqual(expectedPlaceholders[key]);
    }
  });

  it("KM-3 translates every non-English string unless DECISIONS records an exception", () => {
    for (const locale of locales.filter((candidate) => candidate !== "en")) for (const key of keys) {
      if (SAME_AS_ENGLISH.includes(`${locale}:${key}`)) continue;
      expect(catalogues[locale]?.[key], `${locale}:${key}`).not.toBe(catalogues.en?.[key]);
    }
  });

  it("KM-4 contains exactly the five named export keys per catalogue", () => {
    for (const locale of locales) {
      expect(Object.keys(catalogues[locale] ?? {}).filter((key) => key.startsWith("mail.export.")).sort(), locale)
        .toEqual([...keys].sort());
    }
  });

  it("KM-5 keeps the expiry and UTC label adjacent in each language", () => {
    for (const locale of locales) {
      expect(catalogues[locale]?.["mail.export.validity"], locale).toContain("{expires} UTC");
    }
  });
});
