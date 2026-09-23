import { describe, expect, it } from "vitest";

import { createSupportCaseAccessService } from "../../apps/api/src/support/cases.js";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import {
  SUPPORT_LOCALES,
  isSupportLanguage,
  supportLocaleNames,
} from "../../packages/support-kb/src/locale.js";

describe("support interface locales", () => {
  it("stays locked to the UI locale codes and native names", () => {
    expect(SUPPORT_LOCALES).toEqual(LOCALES.map(({ code }) => code));

    for (const { code, nativeName } of LOCALES) {
      expect(supportLocaleNames(code)).toEqual({
        english: new Intl.DisplayNames("en", { type: "language" }).of(code),
        native: nativeName,
      });
    }
  });

  it("returns the required English and native display-name pairs", () => {
    expect(supportLocaleNames("ro")).toEqual({ english: "Romanian", native: "Română" });
    expect(supportLocaleNames("ja")).toEqual({ english: "Japanese", native: "日本語" });
    expect(supportLocaleNames("ar")).toEqual({ english: "Arabic", native: "العربية" });
  });

  it("accepts exactly the registered interface locale codes", () => {
    for (const { code } of LOCALES) expect(isSupportLanguage(code)).toBe(true);
    for (const value of ["jp", "en-US", "", null, undefined, 35]) {
      expect(isSupportLanguage(value)).toBe(false);
    }
  });
});

function caseAccessWithLanguage(language: string) {
  return createSupportCaseAccessService({
    repository: {
      listOwnCases: async () => [{
        case_id: "case-id",
        state: "NEW",
        language,
        created_at: "2026-09-23T00:00:00.000Z",
      }],
      readCaseEncrypted: async () => null,
      appendCaseMessage: async () => null,
    },
    keys: {
      unwrapDataKey: async () => Buffer.alloc(32),
      openContent: () => Buffer.from("[]", "utf8"),
      sealContent: () => Buffer.alloc(29),
    },
  });
}

describe("stored support interface locales", () => {
  it("preserves a registered non-corpus locale when reading a case", async () => {
    await expect(caseAccessWithLanguage("ja").listOwn("owner-id")).resolves.toEqual([{
      caseId: "case-id",
      state: "NEW",
      language: "ja",
      createdAt: new Date("2026-09-23T00:00:00.000Z"),
    }]);
  });

  it("fails the read instead of coercing an unknown stored locale to English", async () => {
    await expect(caseAccessWithLanguage("jp").listOwn("owner-id"))
      .rejects.toThrow("SUPPORT_LANGUAGE_INVALID");
  });
});
