import { describe, expect, it } from "vitest";

import {
  createAdvisorySummaryService,
  createSupportCaseAccessService,
} from "../../apps/api/src/support/cases.js";
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
    // Scope audit C4: a typed domain error like the rest of the support code.
    await expect(caseAccessWithLanguage("jp").listOwn("owner-id"))
      .rejects.toMatchObject({ name: "SupportCaseError", code: "SUPPORT_LANGUAGE_INVALID" });
  });

  it("uses the interface locale when an unsafe generated advisory summary is replaced", async () => {
    const sealed: string[] = [];
    const service = createAdvisorySummaryService({
      complete: async () => JSON.stringify({
        kind: "case_summary",
        text: "Open //invalid.example/reset with password syntheticvalue7.",
        sourceIds: [],
        actionIds: [],
      }),
      seal: async (_caseId, summary) => {
        sealed.push(summary);
        return Buffer.from(summary, "utf8");
      },
      persist: async () => undefined,
      clock: () => new Date("2026-09-23T00:00:01.000Z"),
    });

    await service.summarize({
      caseId: "case-id",
      language: "ja",
      transcript: "USER> Help",
      createdAt: new Date("2026-09-23T00:00:00.000Z"),
    });

    expect(sealed).toEqual([
      "助言用の要約は、サポートの安全性チェックに合格しなかったため省略されました。",
    ]);
  });

  it("uses the interface locale when an unsafe stored advisory summary is replaced", async () => {
    const service = createSupportCaseAccessService({
      repository: {
        listOwnCases: async () => [],
        readCaseEncrypted: async () => ({
          case_id: "case-id",
          created_at: new Date(),
          identity_owner_ref: null,
          language: "ja",
          state: "NEW",
          sla_hours: 48,
          shredded_at: null,
          destroyed_at: null,
          wrapped_key: Buffer.from("wrapped"),
          transcript_snapshot_ciphertext: Buffer.from("transcript"),
          summary_ciphertext: Buffer.from("summary"),
          case_message_next_cursor: null,
          case_messages: [],
        }),
        appendCaseMessage: async () => null,
      },
      keys: {
        unwrapDataKey: async () => Buffer.alloc(32),
        openContent: (description) => description.kind === "case-snapshot"
          ? Buffer.from("[]", "utf8")
          : Buffer.from("Open //invalid.example/reset with password syntheticvalue7.", "utf8"),
        sealContent: () => Buffer.alloc(29),
      },
    });

    await expect(service.readByToken("token")).resolves.toMatchObject({
      kind: "READABLE",
      summary: "助言用の要約は、サポートの安全性チェックに合格しなかったため省略されました。",
    });
  });

  it("uses the interface locale for a shredded case notice", async () => {
    const service = createSupportCaseAccessService({
      repository: {
        listOwnCases: async () => [],
        readCaseEncrypted: async () => ({
          case_id: "case-id",
          created_at: new Date(),
          identity_owner_ref: null,
          language: "ja",
          state: "NEW",
          sla_hours: 48,
          shredded_at: new Date("2026-09-23T00:00:00.000Z"),
          destroyed_at: null,
        }),
        appendCaseMessage: async () => null,
      },
      keys: {
        unwrapDataKey: async () => { throw new Error("must not unwrap"); },
        openContent: () => { throw new Error("must not open"); },
        sealContent: () => { throw new Error("must not seal"); },
      },
    });

    await expect(service.readByToken("token")).resolves.toMatchObject({
      kind: "SHREDDED",
      notice: "この会話は、所有者の依頼により消去されました。",
    });
  });
});
