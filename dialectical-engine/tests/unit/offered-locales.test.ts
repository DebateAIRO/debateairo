import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import * as route from "../../apps/ui/app/api/[...path]/route.js";
import {
  filterLocales,
  getLocale,
  isCatalogLocale,
  isLocale,
  LOCALE_PREFERENCES,
  LOCALES,
  OFFERED_LOCALE_CODES,
  OFFERED_LOCALE_PREFERENCES
} from "../../apps/ui/lib/i18n/locales.js";
import { languageOfferLocale, localeDirection, questionLocale } from "../../apps/ui/lib/i18n/questionLocale.js";

/**
 * The site offers every one of the 35 catalogue languages as an interface language (owner's decision of 24 November
 * 2026; from 19 November until then it offered English and Romanian only). The language list shows 36 rows, English as
 * its two regional choices; a locale cookie naming any of them is the visitor's choice, for the pages and the mails
 * alike. A value that names no catalogue language (an unknown code, a wrong case, an unlisted region such as en-AU) is
 * still no choice: English, or the browser's own language for a browser that prefers an offered one.
 */
const codes = (definitions: readonly { code: string }[]) => definitions.map(({ code }) => code);
const CATALOGUE_CODES = LOCALES.map(({ code }) => code);
/** Values that name no offered language: the paths the site still has for a cookie or a tag it cannot read. */
const NOT_OFFERED = ["RO", "DE", "ro-RO", "de-DE", "en-AU", "xx", "zz"] as const;
const messagesDir = fileURLToPath(new URL("../../apps/ui/messages/", import.meta.url));

describe("the offered interface languages", () => {
  it("are all 35 catalogue languages, in the catalogue's order", () => {
    expect(OFFERED_LOCALE_CODES).toEqual(CATALOGUE_CODES);
    expect(OFFERED_LOCALE_CODES).toHaveLength(35);
    expect(new Set(OFFERED_LOCALE_CODES).size).toBe(35);
    for (const code of ["en", "ro", "de", "fr", "ar", "he", "zh", "ga", "mt"]) expect(OFFERED_LOCALE_CODES, code).toContain(code);
    expect(Object.isFrozen(OFFERED_LOCALE_CODES)).toBe(true);
  });

  it("isLocale accepts every catalogue language and the regional English choices, and nothing else", () => {
    for (const code of [...CATALOGUE_CODES, "en-US", "en-GB"]) {
      expect(isLocale(code), code).toBe(true);
      expect(isCatalogLocale(code), code).toBe(true);
    }
    for (const value of [...NOT_OFFERED, "", " ro", "ro ", null, undefined, 7]) {
      expect(isLocale(value), String(value)).toBe(false);
      expect(isCatalogLocale(value), String(value)).toBe(false);
    }
    expect(LOCALES.filter(({ code }) => isCatalogLocale(code))).toHaveLength(35);
  });

  it("the language list shows 36 rows: every catalogue language, English as English (United States) and English (United Kingdom)", () => {
    expect(OFFERED_LOCALE_PREFERENCES).toHaveLength(36);
    expect(codes(OFFERED_LOCALE_PREFERENCES)).toEqual(codes(LOCALE_PREFERENCES));
    expect(codes(OFFERED_LOCALE_PREFERENCES)).toEqual(CATALOGUE_CODES.flatMap((code) => code === "en" ? ["en-US", "en-GB"] : [code]));
    expect(codes(OFFERED_LOCALE_PREFERENCES)).not.toContain("en");
    const names = OFFERED_LOCALE_PREFERENCES.map(({ nativeName }) => nativeName);
    for (const name of ["English (United States)", "English (United Kingdom)", "Română", "Deutsch", "Français", "العربية", "עברית", "中文"]) {
      expect(names, name).toContain(name);
    }
    expect(codes(filterLocales("", OFFERED_LOCALE_PREFERENCES))).toEqual(codes(OFFERED_LOCALE_PREFERENCES));
    expect(codes(filterLocales("rom", OFFERED_LOCALE_PREFERENCES))).toEqual(["ro"]);
    expect(codes(filterLocales("Deutsch", OFFERED_LOCALE_PREFERENCES))).toEqual(["de"]);
    expect(codes(filterLocales("english", OFFERED_LOCALE_PREFERENCES))).toEqual(["en-US", "en-GB"]);
    expect(codes(filterLocales("Klingon", OFFERED_LOCALE_PREFERENCES))).toEqual([]);
    expect(LOCALES).toHaveLength(35);
    expect(LOCALE_PREFERENCES).toHaveLength(36);
  });

  it("every offered language has its own interface catalogues; the team-only catalogue stays English and Romanian", () => {
    const interfaceFiles = readdirSync(`${messagesDir}en`).filter((file) => file !== "staff.json" && file !== "_notes.json").sort();
    expect(interfaceFiles).toContain("v4.json");
    expect(interfaceFiles).toContain("password-reset.json");
    for (const code of OFFERED_LOCALE_CODES) {
      const files = readdirSync(`${messagesDir}${code}`);
      for (const file of interfaceFiles) expect(files, `${code}/${file}`).toContain(file);
      expect(files.includes("staff.json"), `${code}/staff.json`).toBe(code === "en" || code === "ro");
    }
    // A German reader gets German words, not the English ones.
    const v4 = (code: string) => JSON.parse(readFileSync(`${messagesDir}${code}/v4.json`, "utf8")) as Record<string, string>;
    expect(v4("en")["v4.trust.SURE"]).toBe("Sure");
    expect(v4("de")["v4.trust.SURE"]).toBe("Sicher");
    expect(v4("de")["v4.brand.badge"]).toBe("V4-Vorschau");
    expect(v4("ro")["v4.trust.SURE"]).toBe("Sigur");
  });
});

describe("a debate's own language stays free", () => {
  it("getLocale still knows every catalogue language, so Arabic and Hebrew text stays right to left", () => {
    expect(getLocale("ar").dir).toBe("rtl");
    expect(getLocale("he").dir).toBe("rtl");
    expect(getLocale("de")).toMatchObject({ code: "de", nativeName: "Deutsch" });
    expect(getLocale("xx").code).toBe("en");
    expect(localeDirection("ar")).toBe("rtl");
  });

  it("questionLocale tags a German debate as German on an English or a Romanian page", () => {
    expect(questionLocale("de", "en")).toBe("de");
    expect(questionLocale("de-AT", "ro")).toBe("de");
    expect(questionLocale("ar", "en-GB")).toBe("ar");
    expect(questionLocale("und", "ro")).toBe("ro");
  });

  it("the page offers a switch to the debate's language whenever it differs from the page's, every catalogue language included", () => {
    expect(languageOfferLocale("de", "en")).toMatchObject({ code: "de", nativeName: "Deutsch" });
    expect(languageOfferLocale("ar", "ro")).toMatchObject({ code: "ar", nativeName: "العربية", dir: "rtl" });
    expect(languageOfferLocale("ro", "en")).toMatchObject({ code: "ro" });
    expect(languageOfferLocale("ro", "en-GB")).toMatchObject({ code: "ro" });
    expect(languageOfferLocale("en", "ro")).toMatchObject({ code: "en" });
    expect(languageOfferLocale("fr", "de")).toMatchObject({ code: "fr", nativeName: "Français" });
    for (const code of CATALOGUE_CODES.filter((code) => code !== "en")) {
      expect(languageOfferLocale(code as never, "en"), code).toMatchObject({ code });
    }
    // No offer when the debate is already in the page's language (English in any region counts as English) or has none.
    expect(languageOfferLocale("de", "de")).toBeNull();
    expect(languageOfferLocale("en", "en-GB")).toBeNull();
    expect(languageOfferLocale("en-US", "en-GB")).toBeNull();
    expect(languageOfferLocale(null, "en")).toBeNull();
    // A value that names no offered language is still never proposed.
    for (const value of NOT_OFFERED) expect(languageOfferLocale(value as never, "en"), value).toBeNull();
  });
  // loadNamespace (server-only) keeps reading every catalogue language too: tests/render/debate-page-catalogs.test.tsx
  // loads the Hebrew compose catalogue through it.
});

describe("the /api proxy forwards the locale cookie only for an offered language, so mails match the page", () => {
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.DIALECTICAL_API_BASE;
  const SESSION = "s".repeat(43);
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.DIALECTICAL_API_BASE;
    else process.env.DIALECTICAL_API_BASE = originalBase;
  });

  async function forwardedCookie(cookie: string | null, acceptLanguage?: string): Promise<string | null> {
    process.env.DIALECTICAL_API_BASE = "http://acceptance.local:8790";
    let forwarded = new Headers();
    globalThis.fetch = (async (_url, init) => {
      forwarded = new Headers(init?.headers);
      return new Response("{}", { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const headers = new Headers();
    if (cookie !== null) headers.set("cookie", cookie);
    if (acceptLanguage !== undefined) headers.set("accept-language", acceptLanguage);
    const response = await route.GET(new Request("https://ui.example.test/api/v1/public/debates", { headers }),
      { params: Promise.resolve({ path: ["v1", "public", "debates"] }) });
    expect(response.status).toBe(200);
    return forwarded.get("cookie");
  }

  it("forwards every offered language beside the session: all 35, en-US and en-GB", async () => {
    const offered = [...CATALOGUE_CODES, "en-US", "en-GB"];
    expect(offered).toHaveLength(37);
    for (const locale of offered) {
      expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; debateai.locale=${locale}`), locale)
        .toBe(`__Host-debateai-session=${SESSION}; debateai.locale=${locale}`);
    }
    expect(await forwardedCookie("debateai.locale=de")).toBe("debateai.locale=de");
  });

  it("drops a value that names no offered language, and the request still goes through", async () => {
    for (const locale of NOT_OFFERED) {
      expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; debateai.locale=${locale}`), locale)
        .toBe(`__Host-debateai-session=${SESSION}`);
    }
    expect(await forwardedCookie("debateai.locale=xx")).toBeNull();
  });

  // A visitor who has not picked a language sees the pages in the offered language the browser prefers (middleware.ts);
  // the mails a public page sends, the cancel link's for one, must then be in that language too.
  it("forwards the browser's language for a browser with no language cookie, as the pages show it", async () => {
    for (const acceptLanguage of ["ro", "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7", "ro-MD"]) {
      expect(await forwardedCookie(null, acceptLanguage), acceptLanguage).toBe("debateai.locale=ro");
      expect(await forwardedCookie(`__Host-debateai-session=${SESSION}`, acceptLanguage), acceptLanguage)
        .toBe(`__Host-debateai-session=${SESSION}; debateai.locale=ro`);
      // A cookie naming no offered language counts as no choice, as on the pages.
      expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; debateai.locale=en-AU`, acceptLanguage), acceptLanguage)
        .toBe(`__Host-debateai-session=${SESSION}; debateai.locale=ro`);
    }
    for (const [acceptLanguage, locale] of [
      ["de-DE,de;q=0.9,en;q=0.8", "de"],
      ["de-DE,de;q=0.9,ro;q=0.8", "de"],
      ["fr-CA", "fr"],
      ["he-IL,he;q=0.9", "he"],
      ["zh-Hant-TW", "zh"],
      ["ca-ES,ca;q=0.9,ro;q=0.8", "ro"]
    ] as const) {
      expect(await forwardedCookie(null, acceptLanguage), acceptLanguage).toBe(`debateai.locale=${locale}`);
      expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; debateai.locale=xx`, acceptLanguage), acceptLanguage)
        .toBe(`__Host-debateai-session=${SESSION}; debateai.locale=${locale}`);
    }
  });

  // "*" (any language) and a crawler's empty header both mean the site's default, English.
  it("adds nothing for an English browser, a browser that names no offered language, or a crawler", async () => {
    for (const acceptLanguage of [undefined, "en-US,en;q=0.9,ro;q=0.8", "en", "en-GB,de;q=0.9", "ca-ES,ca", "nb", "*", "ro;q=0", "ro;q=bad"]) {
      expect(await forwardedCookie(null, acceptLanguage), String(acceptLanguage)).toBeNull();
      expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; debateai.locale=xx`, acceptLanguage), String(acceptLanguage))
        .toBe(`__Host-debateai-session=${SESSION}`);
    }
  });

  it("never overrides the language the visitor picked in the language list", async () => {
    for (const locale of ["en", "en-US", "en-GB", "de", "fr", "he"]) {
      expect(await forwardedCookie(`debateai.locale=${locale}`, "ro-RO,ro"), locale).toBe(`debateai.locale=${locale}`);
    }
    expect(await forwardedCookie("debateai.locale=ro", "en-US,en")).toBe("debateai.locale=ro");
    expect(await forwardedCookie("debateai.locale=de", "fr-FR,fr")).toBe("debateai.locale=de");
    expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; debateai.locale=ar`, "ro"))
      .toBe(`__Host-debateai-session=${SESSION}; debateai.locale=ar`);
  });

  // The middleware asks the same question for the pages (tests/unit/ui-middleware-locale.test.ts): one offered copy
  // anywhere is a choice, so neither adds the browser's language. The proxy forwards the FIRST copy when it is offered and
  // nothing when the first is not; the pages read the LAST copy.
  it("adds nothing when any copy of a doubled locale cookie names an offered language", async () => {
    expect(await forwardedCookie("debateai.locale=en; debateai.locale=de", "ro-RO,ro")).toBe("debateai.locale=en");
    expect(await forwardedCookie("debateai.locale=de; debateai.locale=en", "ro-RO,ro")).toBe("debateai.locale=de");
    expect(await forwardedCookie("debateai.locale=de; debateai.locale=fr", "ro")).toBe("debateai.locale=de");
    expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; debateai.locale=de; debateai.locale= en-GB `, "ro"))
      .toBe(`__Host-debateai-session=${SESSION}; debateai.locale=de`);
    // An unreadable first copy is dropped and so is the offered one after it: the mails stay English, as the pages
    // reading the last copy (en) are.
    expect(await forwardedCookie("debateai.locale=xx; debateai.locale=en", "ro-RO,ro")).toBeNull();
    expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; debateai.locale=en-AU; debateai.locale= en-GB `, "ro"))
      .toBe(`__Host-debateai-session=${SESSION}`);
  });

  it("forwards the browser's language when no copy of a doubled locale cookie names an offered language", async () => {
    expect(await forwardedCookie("debateai.locale=xx; debateai.locale=en-AU", "ro")).toBe("debateai.locale=ro");
    expect(await forwardedCookie("debateai.locale=RO; debateai.locale=zz", "de-DE")).toBe("debateai.locale=de");
    expect(await forwardedCookie("xdebateai.locale=en", "ro")).toBe("debateai.locale=ro");
  });

  it("forwards no cookie at all for a cookie header the proxy refuses, whatever the browser's language", async () => {
    expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; __Host-debateai-session=${SESSION}`, "ro")).toBeNull();
    expect(await forwardedCookie("__Host-debateai-session=short", "ro")).toBeNull();
  });
});
