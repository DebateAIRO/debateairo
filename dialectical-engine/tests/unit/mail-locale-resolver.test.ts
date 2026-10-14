import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LocaleCodeSchema } from "@debateai/contract/locale";
import { RegisterRequestFieldsSchema, ResendVerificationRequestSchema } from "../../packages/contract/src/consumer-auth.js";
import {
  LOCALE_COOKIE_NAME,
  MAIL_LOCALE_VALUES,
  catalogLocaleOf,
  mailLocaleOfCookieHeader,
  resolveMailLocale,
  resolveSourceMailLocale
} from "../../apps/api/src/mail-locale.js";

// C03.2 (R-05 to R-08) and C03.3 (R-09, D-54): the mail-language resolver and its carrier into sourceFor.

describe("C03.2 mail-locale values (R-06, R-07)", () => {
  it("holds the 37 values of the contract, in the contract's order", () => {
    const contract = LocaleCodeSchema.options.flatMap((member) => [...member.options]);
    expect(MAIL_LOCALE_VALUES).toHaveLength(37);
    expect([...MAIL_LOCALE_VALUES]).toEqual(contract);
  });

  it("keeps each of the 37 values unchanged", () => {
    for (const value of MAIL_LOCALE_VALUES) {
      expect(resolveMailLocale(value)).toBe(value);
    }
  });

  it("resolves a value outside the 37, an absent value and an old or malformed cookie to en", () => {
    for (const value of ["zz", "EN", "", "ro ", "en_US", "ro-RO", 42, null, undefined, {}]) {
      expect(resolveMailLocale(value)).toBe("en");
    }
  });

  it("maps en-US and en-GB to the catalogue code en and keeps every other value", () => {
    expect(catalogLocaleOf("en-US")).toBe("en");
    expect(catalogLocaleOf("en-GB")).toBe("en");
    expect(catalogLocaleOf("en")).toBe("en");
    expect(catalogLocaleOf("ro")).toBe("ro");
    expect(catalogLocaleOf("de")).toBe("de");
  });
});

describe("C03.2 cookie reader (R-06)", () => {
  it("reads the cookie named debateai.locale and resolves it", () => {
    expect(mailLocaleOfCookieHeader("debateai.locale=ro")).toBe("ro");
    expect(mailLocaleOfCookieHeader("a=1;  debateai.locale=de")).toBe("de");
    expect(mailLocaleOfCookieHeader("debateai.locale=en-US")).toBe("en-US");
    expect(mailLocaleOfCookieHeader("debateai.locale=en")).toBe("en");
  });

  it("takes the first occurrence of the cookie", () => {
    expect(mailLocaleOfCookieHeader("debateai.locale=ro; debateai.locale=de")).toBe("ro");
  });

  it("gives en when the cookie is absent, malformed, outside the 37, or under another name", () => {
    expect(mailLocaleOfCookieHeader(undefined)).toBe("en");
    expect(mailLocaleOfCookieHeader("")).toBe("en");
    expect(mailLocaleOfCookieHeader("debateai.locale=zz")).toBe("en");
    expect(mailLocaleOfCookieHeader("debateai.locale=russian")).toBe("en");
    expect(mailLocaleOfCookieHeader("x-debateai.locale=ro")).toBe("en");
  });

  it("names the cookie the browser writes (apps/ui/lib/i18n/locales.ts:1)", () => {
    const source = readFileSync(new URL("../../apps/ui/lib/i18n/locales.ts", import.meta.url), "utf8");
    const written = /export const LOCALE_COOKIE = "([^"]+)";/.exec(source)?.[1];
    expect(written).toBe("debateai.locale");
    expect(LOCALE_COOKIE_NAME).toBe(written);
  });
});

describe("C03.3 source mail locale precedence (R-09, D-54: body over cookie over en)", () => {
  it("returns the register or resend body value when one is supplied", () => {
    expect(resolveSourceMailLocale("debateai.locale=de", "ro")).toBe("ro");
    expect(resolveSourceMailLocale("debateai.locale=de", "en-GB")).toBe("en-GB");
    expect(resolveSourceMailLocale(undefined, "en-US")).toBe("en-US");
  });

  it("falls back to the cookie, then to en", () => {
    expect(resolveSourceMailLocale("debateai.locale=de", undefined)).toBe("de");
    expect(resolveSourceMailLocale(undefined, undefined)).toBe("en");
    expect(resolveSourceMailLocale("debateai.locale=zz", undefined)).toBe("en");
  });

  it("is carried into sourceFor as the mailLocale field (apps/api/src/index.ts)", () => {
    const source = readFileSync(new URL("../../apps/api/src/index.ts", import.meta.url), "utf8");
    const start = source.indexOf("const sourceFor = (request: {");
    const end = source.indexOf("const admissionRefusalAuditedUntil", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(source.slice(start, end)).toContain(
      "mailLocale: resolveSourceMailLocale(request.headers.cookie as string | undefined, mailDisplays.get(request)?.locale)"
    );
  });
});

describe("C03.6 register and resend keep their ui_locale schema (R-08 carve-out)", () => {
  it("refuses an unknown ui_locale on register and on resend, and accepts each of the 37", () => {
    expect(RegisterRequestFieldsSchema.shape.ui_locale.safeParse("zz").success).toBe(false);
    expect(ResendVerificationRequestSchema.shape.ui_locale.safeParse("zz").success).toBe(false);
    for (const value of MAIL_LOCALE_VALUES) {
      expect(RegisterRequestFieldsSchema.shape.ui_locale.safeParse(value).success).toBe(true);
      expect(ResendVerificationRequestSchema.shape.ui_locale.safeParse(value).success).toBe(true);
    }
  });
});
