import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// FIX-SF-S02-p1-W (REV-S02-p1 translation B2/B3, product B8): S02 prints the four categories and the
// flagged state in S01's own words. The catalogue tests pin keys and placeholders only, so a re-coined
// category or label word passed them (REV-S02-p1-translation frame 8m); this file pins the words.
type Catalog = Record<string, string>;
const root = process.cwd();
const messages = (locale: string, namespace: string): Catalog =>
  JSON.parse(readFileSync(join(root, "apps/ui/messages", locale, `${namespace}.json`), "utf8"));
const archive = (locale: string): Catalog =>
  JSON.parse(readFileSync(join(root, "apps/api/src/data-export/archive-messages", `${locale}.json`), "utf8"));
const LOCALES = readdirSync(join(root, "apps/ui/messages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const STAFF_LOCALES = ["en", "ro"];
// S02's category enum → S01's archive key (apps/api/src/data-export/archive-messages/<l>.json).
const CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ["TERRORISM", "archive.category.terrorism"],
  ["HATE_SPEECH", "archive.category.hateSpeech"],
  ["SUICIDE_OR_HARM_TO_OTHERS", "archive.category.suicideOrHarm"],
  ["WEAPONS_OR_DRUGS", "archive.category.weaponsOrDrugs"]
];
const word = (catalog: Catalog, key: string, where: string): string => {
  const value = catalog[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${where}: ${key} is missing`);
  return value;
};

describe("S02 publication review words are S01's words", () => {
  it("covers the 35 shipped locales", () => {
    expect(LOCALES).toHaveLength(35);
  });

  it("owner page: every category value is S01's archive.category word, verbatim, in every locale", () => {
    for (const locale of LOCALES) {
      const s01 = archive(locale); const owner = messages(locale, "public");
      for (const [category, s01Key] of CATEGORIES) {
        expect(word(owner, `public.publicationReview.category.${category}`, `${locale}/public`), `${locale}: ${category}`)
          .toBe(word(s01, s01Key, `${locale}/archive`));
      }
    }
  });

  it("staff page (en, ro): every category chip is S01's archive.category word, verbatim", () => {
    for (const locale of STAFF_LOCALES) {
      const s01 = archive(locale); const staff = messages(locale, "staff");
      for (const [category, s01Key] of CATEGORIES) {
        expect(word(staff, `staff.reviews.category.${category}`, `${locale}/staff`), `${locale}: ${category}`)
          .toBe(word(s01, s01Key, `${locale}/archive`));
      }
    }
  });

  it("the UNDER REVIEW card label opens with S01's FLAGGED label word in every locale", () => {
    for (const locale of LOCALES) {
      const home = messages(locale, "home");
      const flagged = word(home, "home.flag.flagged", `${locale}/home`);
      const label = word(home, "home.flag.underReview", `${locale}/home`);
      expect(label.startsWith(`${flagged} · `), `${locale}: "${label}" does not open with "${flagged} · "`).toBe(true);
      expect(label.slice(flagged.length + 3).trim(), `${locale}: the under-review half is empty`).not.toBe("");
    }
  });
});
