import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tPlural } from "../../apps/ui/lib/i18n/translate.js";
import { shortVoteCount, upvoteMessageCatalog } from "../../apps/ui/lib/upvoteWords.js";

type Catalog = Record<string, string>;
const messagesRoot = join(process.cwd(), "apps/ui/messages");
const home = (locale: string): Catalog =>
  JSON.parse(readFileSync(join(messagesRoot, locale, "home.json"), "utf8")) as Catalog;
const LOCALES = readdirSync(messagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const ROOT = "home.upvote.label";
const PLAIN = ["home.upvote.signedOut", "home.upvote.failed"];
const COUNTS = [0, 1, 2, 3, 5, 11, 21, 100, 101, 1000];
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

describe("the upvote button's words (design 4 and 9.4)", () => {
  it("covers the 35 shipped locales", () => {
    expect(LOCALES).toHaveLength(35);
  });

  it("English and Romanian are the owner's wording, exactly", () => {
    expect(upvoteMessageCatalog(home("en"))).toEqual({
      "home.upvote.label.one": "Upvote. {count} vote",
      "home.upvote.label.other": "Upvote. {count} votes",
      "home.upvote.signedOut": "Sign in to upvote",
      "home.upvote.failed": "Your vote could not be saved. Try again."
    });
    expect(upvoteMessageCatalog(home("ro"))).toEqual({
      "home.upvote.label.one": "Votați. {count} vot",
      "home.upvote.label.few": "Votați. {count} voturi",
      "home.upvote.label.other": "Votați. {count} de voturi",
      "home.upvote.signedOut": "Autentificați-vă pentru a vota",
      "home.upvote.failed": "Votul dvs. nu a putut fi salvat. Încercați din nou."
    });
  });

  it("the picker hands over exactly each language's home.upvote keys, frozen", () => {
    for (const locale of LOCALES) {
      const catalog = home(locale);
      const picked = upvoteMessageCatalog(catalog);
      const forms = new Intl.PluralRules(locale).resolvedOptions().pluralCategories.map((category) => `${ROOT}.${category}`);
      expect(Object.keys(picked).sort(), locale).toEqual([...forms, ...PLAIN].sort());
      for (const [key, value] of Object.entries(picked)) expect(value, `${locale}: ${key}`).toBe(catalog[key]);
      expect(Object.isFrozen(picked), locale).toBe(true);
    }
    expect(upvoteMessageCatalog({ "home.title": "x", "home.upvoted": "x", "chrome.logIn": "x" })).toEqual({});
  });

  it("every form of the name keeps {count} once, and no value carries another brace or a direction mark", () => {
    for (const locale of LOCALES) {
      const catalog = home(locale);
      for (const key of Object.keys(catalog).filter((name) => name.startsWith("home.upvote."))) {
        const value = catalog[key]!;
        const where = `${locale}: ${key}`;
        expect(value, where).toBe(value.trim());
        expect(BIDI_CONTROLS.test(value), where).toBe(false);
        expect(value.match(/\{[^{}]*\}|[{}]/gu) ?? [], where).toEqual(key.startsWith(`${ROOT}.`) ? ["{count}"] : []);
      }
      expect(Object.keys(catalog).filter((name) => name.startsWith(`${ROOT}.`)).length, locale).toBeGreaterThan(0);
    }
  });

  it("the name holds the number in every language and is never the English sentence", () => {
    const english = home("en");
    for (const locale of LOCALES) {
      const picked = upvoteMessageCatalog(home(locale));
      for (const count of COUNTS) {
        const name = tPlural(picked, ROOT, count, locale);
        expect(name, `${locale} ${count}`).toContain(String(count));
        expect(name, `${locale} ${count}`).not.toMatch(/[{}]/u);
        if (locale !== "en") expect(name, `${locale} ${count}`).not.toBe(tPlural(english, ROOT, count, "en"));
      }
      if (locale !== "en") for (const key of PLAIN) expect(picked[key], `${locale}: ${key}`).not.toBe(english[key]);
    }
  });
});

describe("shortVoteCount (design 4: counts of 1000 and more)", () => {
  it("writes the design's examples in English, never rounding up", () => {
    const table: ReadonlyArray<readonly [number, string]> = [
      [0, "0"], [1, "1"], [999, "999"], [1000, "1k"], [1049, "1k"], [1100, "1.1k"], [1249, "1.2k"], [1999, "1.9k"],
      [12_345, "12.3k"], [99_999, "99.9k"], [100_000, "100k"], [123_456, "123k"], [999_999, "999k"],
      [1_000_000, "1M"], [1_234_567, "1.2M"], [12_345_678, "12.3M"]
    ];
    for (const [count, shown] of table) expect(shortVoteCount("en", count), String(count)).toBe(shown);
  });

  it("takes the reader's decimal mark and keeps Latin digits in every language", () => {
    expect([999, 1000, 1249, 12_345, 123_456, 1_234_567].map((count) => shortVoteCount("ro", count)))
      .toEqual(["999", "1k", "1,2k", "12,3k", "123k", "1,2M"]);
    expect(shortVoteCount("en-GB", 1249)).toBe("1.2k");
    for (const locale of LOCALES) {
      for (const count of [7, 1000, 1249, 12_345, 99_999, 123_456, 1_234_567]) {
        expect(shortVoteCount(locale, count), `${locale} ${count}`).toMatch(/^[0-9]+(?:[.,][0-9])?[kM]?$/u);
      }
    }
  });

  it("answers a count that is not a whole number of votes without a broken number", () => {
    expect([-3, 2.9, Number.NaN].map((count) => shortVoteCount("en", count))).toEqual(["0", "2", "0"]);
  });
});
