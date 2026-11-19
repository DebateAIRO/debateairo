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
 * The site offers English and Romanian as interface languages. The other 33 catalogues stay in the repository: they
 * are not listed, a locale cookie naming one counts as no choice (pages and mails alike: English, or Romanian for a
 * browser that prefers it), but a debate argued in one of those languages is still tagged, drawn and worded in it.
 */
const codes = (definitions: readonly { code: string }[]) => definitions.map(({ code }) => code);

describe("the offered interface languages", () => {
  it("are English and Romanian", () => {
    expect(OFFERED_LOCALE_CODES).toEqual(["en", "ro"]);
    expect(Object.isFrozen(OFFERED_LOCALE_CODES)).toBe(true);
  });

  it("isLocale accepts only the offered languages; isCatalogLocale keeps all 35 and the regional English choices", () => {
    for (const code of ["en", "en-US", "en-GB", "ro"]) {
      expect(isLocale(code), code).toBe(true);
      expect(isCatalogLocale(code), code).toBe(true);
    }
    for (const code of ["de", "fr", "he", "ar", "zh"]) {
      expect(isLocale(code), code).toBe(false);
      expect(isCatalogLocale(code), code).toBe(true);
    }
    for (const value of ["RO", "ro-RO", "en-AU", "xx", "", null, undefined, 7]) {
      expect(isLocale(value), String(value)).toBe(false);
      expect(isCatalogLocale(value), String(value)).toBe(false);
    }
    expect(LOCALES.filter(({ code }) => isCatalogLocale(code))).toHaveLength(35);
  });

  it("the language list shows three rows: English (United States), English (United Kingdom), Română", () => {
    expect(codes(OFFERED_LOCALE_PREFERENCES)).toEqual(["en-US", "en-GB", "ro"]);
    expect(OFFERED_LOCALE_PREFERENCES.map(({ nativeName }) => nativeName))
      .toEqual(["English (United States)", "English (United Kingdom)", "Română"]);
    expect(codes(filterLocales("", OFFERED_LOCALE_PREFERENCES))).toEqual(["en-US", "en-GB", "ro"]);
    expect(codes(filterLocales("rom", OFFERED_LOCALE_PREFERENCES))).toEqual(["ro"]);
    expect(codes(filterLocales("Deutsch", OFFERED_LOCALE_PREFERENCES))).toEqual([]);
    // The full lists are kept as they are, for the places that need every catalogue language.
    expect(LOCALES).toHaveLength(35);
    expect(LOCALE_PREFERENCES).toHaveLength(36);
    expect(codes(filterLocales("Deutsch"))).toEqual(["de"]);
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

  it("the page offers a switch only to an offered language", () => {
    expect(languageOfferLocale("de", "en")).toBeNull();
    expect(languageOfferLocale("ar", "ro")).toBeNull();
    expect(languageOfferLocale("ro", "en")).toMatchObject({ code: "ro" });
    expect(languageOfferLocale("ro", "en-GB")).toMatchObject({ code: "ro" });
    expect(languageOfferLocale("en", "ro")).toMatchObject({ code: "en" });
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

  it("forwards ro, en, en-US and en-GB beside the session", async () => {
    for (const locale of ["ro", "en", "en-US", "en-GB"]) {
      expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; debateai.locale=${locale}`), locale)
        .toBe(`__Host-debateai-session=${SESSION}; debateai.locale=${locale}`);
    }
  });

  it("drops de and the other unoffered languages, and the request still goes through", async () => {
    for (const locale of ["de", "fr", "he", "RO", "zz"]) {
      expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; debateai.locale=${locale}`), locale)
        .toBe(`__Host-debateai-session=${SESSION}`);
    }
    expect(await forwardedCookie("debateai.locale=de")).toBeNull();
  });

  // A visitor who has not picked a language sees Romanian pages when the browser prefers Romanian (middleware.ts); the
  // mails a public page sends, the cancel link's for one, must then be Romanian too.
  it("forwards Romanian for a Romanian browser with no language cookie, as the pages show it", async () => {
    for (const acceptLanguage of ["ro", "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7", "ro-MD"]) {
      expect(await forwardedCookie(null, acceptLanguage), acceptLanguage).toBe("debateai.locale=ro");
      expect(await forwardedCookie(`__Host-debateai-session=${SESSION}`, acceptLanguage), acceptLanguage)
        .toBe(`__Host-debateai-session=${SESSION}; debateai.locale=ro`);
      // An older cookie naming a language the site no longer offers counts as no choice, as on the pages.
      expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; debateai.locale=de`, acceptLanguage), acceptLanguage)
        .toBe(`__Host-debateai-session=${SESSION}; debateai.locale=ro`);
    }
  });

  it("adds nothing for an English browser, a browser that names no offered language, or a crawler", async () => {
    for (const acceptLanguage of [undefined, "en-US,en;q=0.9,ro;q=0.8", "en", "de-DE,de", "*", "ro;q=0", "ro;q=bad"]) {
      expect(await forwardedCookie(null, acceptLanguage), String(acceptLanguage)).toBeNull();
      expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; debateai.locale=de`, acceptLanguage), String(acceptLanguage))
        .toBe(`__Host-debateai-session=${SESSION}`);
    }
  });

  it("never overrides the language the visitor picked in the language list", async () => {
    for (const locale of ["en", "en-US", "en-GB"]) {
      expect(await forwardedCookie(`debateai.locale=${locale}`, "ro-RO,ro"), locale).toBe(`debateai.locale=${locale}`);
    }
    expect(await forwardedCookie("debateai.locale=ro", "en-US,en")).toBe("debateai.locale=ro");
  });

  it("forwards no cookie at all for a cookie header the proxy refuses, whatever the browser's language", async () => {
    expect(await forwardedCookie(`__Host-debateai-session=${SESSION}; __Host-debateai-session=${SESSION}`, "ro")).toBeNull();
    expect(await forwardedCookie("__Host-debateai-session=short", "ro")).toBeNull();
  });
});
