import { describe, expect, it } from "vitest";
import * as locales from "../../apps/ui/lib/i18n/locales.js";
import { resolveDobLocale } from "../../apps/ui/lib/dob/dobLocale.js";
import { languageOfferLocale, questionLocale } from "../../apps/ui/lib/i18n/questionLocale.js";

// These boundaries catch treating a formatting preference as a new translation catalog,
// or letting a browser region override a reader's explicit formatting choice.
describe("regional English preferences", () => {
  it("serves 35 catalogs through 36 visible choices while keeping old en cookies valid", () => {
    expect(locales.LOCALES).toHaveLength(35);
    expect(locales.LOCALE_PREFERENCES).toHaveLength(36);
    expect(locales.filterLocales("English").map(({ code }) => code)).toEqual(["en-US", "en-GB"]);
    expect(locales.filterLocales("")).toHaveLength(36);
    for (const code of ["en", "en-US", "en-GB"]) expect(locales.isLocale(code)).toBe(true);
    expect(locales.getLocale("en")).toMatchObject({ code: "en", nativeName: "English" });
    expect(locales.getLocale("en-US").code).toBe("en-US");
    expect(locales.getLocale("en-GB").code).toBe("en-GB");
    expect(locales.isLocale("en-AU")).toBe(false);
  });

  it("maps both regional choices to the existing English catalog and legal language", () => {
    expect(locales.legalLocale?.("en-US")).toBe("en");
    expect(locales.catalogLocale?.("en-GB")).toBe("en");
    expect(locales.legalLocale?.("en-GB")).toBe("en");
    expect(locales.catalogLocale?.("en-US")).toBe("en");
    expect(locales.catalogLocale?.("ro")).toBe("ro");
  });

  it("loads the same translated text and English legal evidence for both regions", async () => {
    // Server-only UI modules are compiled with the UI tsconfig, not root NodeNext.
    const namespaceModule = "../../apps/ui/lib/i18n/server.js";
    const legalModule = "../../apps/ui/lib/legal/server.js";
    const { loadNamespace } = await import(namespaceModule);
    const { loadLegalDocument } = await import(legalModule);
    for (const code of ["en-US", "en-GB"] as const) {
      expect(await loadNamespace(code, "auth")).toEqual(await loadNamespace("en", "auth"));
      for (const key of ["terms", "privacy"] as const) {
        const regional = await loadLegalDocument(code, key);
        const english = await loadLegalDocument("en", key);
        expect(regional.sha256).toBe(english.sha256);
        expect(regional.version).toBe(english.version);
      }
    }
  });

  it.each([
    ["en-US", "en-GB,en;q=0.9", "en-US", ["m", "d", "y"]],
    ["en-GB", "en-US,en;q=0.9", "en-GB", ["d", "m", "y"]],
    ["en", "en-US,en;q=0.9", "en-US", ["m", "d", "y"]],
    ["en", "en-GB,en;q=0.9", "en-GB", ["d", "m", "y"]]
  ] as const)("uses %s with browser %s for formatting", (locale, browser, tag, order) => {
    expect(resolveDobLocale(locale, browser)).toEqual({ tag, order, dir: "ltr" });
  });

  it("offers question-language changes only across catalog languages", () => {
    expect(languageOfferLocale("en", "en-US")).toBeNull();
    expect(languageOfferLocale("en-GB", "en-US")).toBeNull();
    expect(languageOfferLocale("ro", "en-GB")).toMatchObject({ code: "ro" });
    expect(questionLocale("en-GB", "en-US")).toBe("en");
  });
});
