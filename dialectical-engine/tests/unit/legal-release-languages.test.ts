import { describe, expect, it } from "vitest";
import { LOCALES, OFFERED_LOCALE_CODES } from "../../apps/ui/lib/i18n/locales.js";
import { RELEASE_LEGAL_LOCALES } from "../../apps/ui/scripts/generate-legal-data.mjs";
import { isLegalTextLocale, LEGAL_TEXT_LOCALE_CODES } from "../../apps/ui/lib/legal/legalTextLocales.js";
import { legalText } from "../support/legalText.js";

/**
 * Which languages a release checks, archives and shows the legal texts in, and that no Terms text still carries a
 * number of the drafts written before launch (2.0 to 2.19, never offered to the public).
 */

describe("the languages of the legal texts", () => {
  it.each(LOCALES.map(({ code }) => [code]))("%s: the Terms name no 2.x version", (code) => {
    expect(legalText("TERMS", code), code).not.toMatch(/(^|\D)2\.(1?\d)(\D|$)/u);
  });

  it("checks and archives the legal texts of every interface language the site offers, and French for Canada", () => {
    // A person can only be shown and accept a legal text in an offered interface language, or in French when they pick
    // Canada at sign-up. Each of those must be in the release check, or a text nobody checked or archived could be accepted.
    for (const code of OFFERED_LOCALE_CODES) expect(RELEASE_LEGAL_LOCALES).toContain(code);
    expect(RELEASE_LEGAL_LOCALES).toContain("fr");
  });

  it("the site shows legal texts in exactly the languages the release checks and archives", () => {
    // LEGAL_TEXT_LOCALE_CODES is the site's copy (a page cannot load the release script): the offered interface
    // languages and the Canada rule's languages. An explicit /terms?lang= or /privacy?lang= counts only for these.
    expect([...LEGAL_TEXT_LOCALE_CODES].sort()).toEqual([...RELEASE_LEGAL_LOCALES].sort());
    for (const code of ["en", "en-GB", "en-US", "ro", "fr"]) expect(isLegalTextLocale(code), code).toBe(true);
    for (const value of ["de", "pl", "es", "zh", "RO", "fr-CA", "xx", "", null, undefined]) {
      expect(isLegalTextLocale(value), String(value)).toBe(false);
    }
  });
});
