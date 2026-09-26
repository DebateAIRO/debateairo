import { describe, expect, it, vi } from "vitest";
import {
  OUTCOMES,
  readSupportContent,
  SUPPORT_TEMPLATE_IDS,
  SUPPORT_TEMPLATES
} from "../../apps/api/src/support/templates.js";
import { SUPPORT_LOCALES } from "../../packages/support-kb/src/locale.js";

describe("SUP-01 closed support copy", () => {
  it("exports the exact outcome vocabulary", () => {
    expect(OUTCOMES).toEqual([
      "ANSWER_GROUNDED", "NO_SOURCE", "REFUSE_ZONE", "REFUSE_INJECTION",
      "REFUSE_SAFETY", "DEGRADED", "DISABLED", "RATE_LIMITED", "CASE_OPENED",
      "CONSENT_NEEDED", "ANON_CONTEXT", "REFUSE_OTHER_USER", "ANSWER_OWN_STATE",
      "ANSWER_INCIDENT", "NO_INCIDENT"
    ]);
    expect(Object.isFrozen(OUTCOMES)).toBe(true);
  });

  it("has one frozen non-empty value in every support locale for every fixed template", () => {
    expect(SUPPORT_TEMPLATE_IDS).toEqual([
      "DISCLOSURE", "NO_SOURCE", "REFUSE_ZONE", "REFUSE_INJECTION", "REFUSE_SAFETY",
      "DEGRADED", "DISABLED", "RATE_LIMITED", "RATING", "CASE_OPENED_MINIMAL", "CASE_OPENED",
      "HUMAN_LABEL", "NOT_FOUND", "CLOSED_LABEL", "SUMMARY_LABEL", "SOURCE_LINE",
      "INCIDENT_ACTIVE", "NO_INCIDENT", "INCIDENT_NOTICE", "QUEUED",
      "SUMMARY_REPLACED", "SHREDDED_NOTICE", "INCIDENT_SURFACE_DEBATES",
      "INCIDENT_SURFACE_PUBLISHING", "INCIDENT_SURFACE_SIGN_IN", "INCIDENT_SURFACE_WHOLE_SITE"
    ]);
    for (const id of SUPPORT_TEMPLATE_IDS) {
      expect(Object.keys(SUPPORT_TEMPLATES[id])).toEqual(SUPPORT_LOCALES);
      for (const locale of SUPPORT_LOCALES) {
        expect(SUPPORT_TEMPLATES[id][locale].length).toBeGreaterThan(0);
      }
      expect(Object.isFrozen(SUPPORT_TEMPLATES[id])).toBe(true);
    }
  });

  it("pins the frozen bilingual shredded-notice template as exact UTF-8 bytes", () => {
    const shreddedNotice = SUPPORT_TEMPLATES.SHREDDED_NOTICE;
    expect({ en:shreddedNotice.en,ro:shreddedNotice.ro }).toEqual({
      en: "This conversation was erased at the owner's request.",
      ro: "Această conversație a fost ștearsă la cererea proprietarului."
    });
    expect(Object.isFrozen(shreddedNotice)).toBe(true);
    expect(Buffer.from(shreddedNotice.en, "utf8").toString("hex")).toBe(
      "5468697320636f6e766572736174696f6e207761732065726173656420617420746865206f776e6572277320726571756573742e"
    );
    expect(Buffer.from(shreddedNotice.ro, "utf8").toString("hex")).toBe(
      "416365617374c48320636f6e7665727361c89b6965206120666f737420c8997465617273c483206c6120636572657265612070726f70726965746172756c75692e"
    );
  });

  it.each([
    [new Date("2026-09-07T10:00:00.000Z"), null],
    [null, new Date("2026-09-07T10:00:00.000Z")],
    [new Date("2026-09-07T10:00:00.000Z"), new Date("2026-09-07T10:00:00.000Z")]
  ])("returns terminal shredded content without invoking the lazy reader", async (
    shreddedAt,
    destroyedAt
  ) => {
    const read = vi.fn(async () => { throw new Error("DECRYPT_MUST_NOT_RUN"); });
    await expect(readSupportContent({ shreddedAt, destroyedAt, language: "ro", read }))
      .resolves.toEqual({
        kind: "SHREDDED",
        terminal: "[SHREDDED]",
        notice: "Această conversație a fost ștearsă la cererea proprietarului."
      });
    expect(read).not.toHaveBeenCalled();
  });

  it("invokes the lazy content reader exactly once only when both markers are null", async () => {
    const read = vi.fn(async () => "decrypted support content");
    await expect(readSupportContent({
      shreddedAt: null,
      destroyedAt: null,
      language: "en",
      read
    })).resolves.toEqual({ kind: "READABLE", content: "decrypted support content" });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
