import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CATALOG_DIR = join(process.cwd(), "apps/ui/messages");
const LOCALES = readdirSync(CATALOG_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const SUFFIXES = [
  "title", "hint", "request", "requesting", "checking", "preparing", "sent",
  "requestAgain", "supersedes", "failed", "inProgress", "rateLimited",
  "erasing", "held", "emailRequired", "notAuthorized", "sessionExpired",
  "unavailable", "statusUnavailable", "noMethod", "download.title",
  "download.starting", "download.button", "download.invalid", "download.reopenFromEmail",
  "download.wrongAccount", "download.backToSettings",
] as const;
const KEYS = SUFFIXES.map((suffix) => `settings.export.${suffix}`);
const SAME_AS_ENGLISH: readonly string[] = [];

function catalog(locale: string): Record<string, string> {
  return JSON.parse(readFileSync(join(CATALOG_DIR, locale, "settings.json"), "utf8")) as Record<string, string>;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{[^{}]+\}/g)].map(([token]) => token).sort();
}

describe("data export settings copy (K-UI)", () => {
  it("KU-1: all 27 keys are present and non-empty in all 35 locales", () => {
    expect(LOCALES).toHaveLength(35);
    expect(KEYS).toHaveLength(27);
    for (const locale of LOCALES) {
      const messages = catalog(locale);
      for (const key of KEYS) {
        expect(messages[key], `${locale}: ${key}`).toBeTypeOf("string");
        expect(messages[key]?.trim(), `${locale}: ${key}`).not.toBe("");
      }
    }
  });

  it("KU-2: every placeholder matches the English value", () => {
    const english = catalog("en");
    for (const locale of LOCALES) {
      const messages = catalog(locale);
      for (const key of KEYS) {
        expect(english[key], `en: ${key}`).toBeTypeOf("string");
        expect(messages[key], `${locale}: ${key}`).toBeTypeOf("string");
        expect(placeholders(messages[key]!), `${locale}: ${key}`).toEqual(placeholders(english[key]!));
      }
    }
  });

  it("KU-3: non-English copy is translated unless expressly exempted", () => {
    const english = catalog("en");
    for (const locale of LOCALES.filter((locale) => locale !== "en")) {
      const messages = catalog(locale);
      for (const key of KEYS.filter((key) => !SAME_AS_ENGLISH.includes(key))) {
        expect(messages[key], `${locale}: ${key}`).not.toBe(english[key]);
      }
    }
  });

  it("KU-4: each locale has exactly the 27 export keys", () => {
    for (const locale of LOCALES) {
      expect(Object.keys(catalog(locale)).filter((key) => key.startsWith("settings.export.")).sort(), locale)
        .toEqual([...KEYS].sort());
    }
  });
});
