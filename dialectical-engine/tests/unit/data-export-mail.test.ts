import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { MailTemplateError, renderMail } from "../../packages/mail-templates/src/render.js";

const downloadUrl = `https://app.test/export#${"A".repeat(43)}`;
const params = {
  requested: "2026-10-08T10:00:00.000Z",
  expires: "2026-10-09T10:02:00.000Z",
  downloadUrl
};
const locales = readdirSync(join(process.cwd(), "packages/mail-templates/messages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

describe("DATA_EXPORT mail", () => {
  it("M-1 names the export and keeps the request, link, expiry and safety paragraphs in order", () => {
    const mail = renderMail("DATA_EXPORT", "en", params);
    expect(mail.subject).toBe("Your data export is ready");
    const positions = [
      "You asked for a copy of your data on October 8, 2026.",
      `Download it here: ${downloadUrl}`,
      "The link works until October 9, 2026, 10:02 UTC",
      "If you did not ask for this"
    ].map((sentence) => mail.text.indexOf(sentence));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("M-2 prints the UTC expiry date and 24-hour time while the request stays date-only", () => {
    const en = renderMail("DATA_EXPORT", "en", params).text;
    const ro = renderMail("DATA_EXPORT", "ro", params).text;
    expect(en).toContain("The link works until October 9, 2026, 10:02 UTC");
    expect(ro).toContain("9 octombrie 2026, 10:02 UTC");
    expect(en).toContain("You asked for a copy of your data on October 8, 2026.");
    expect(en).not.toContain("October 8, 2026, 10:00");
  });

  it("M-3 renders one download link in text and HTML in every mail locale", () => {
    expect(locales).toHaveLength(35);
    for (const locale of locales) {
      const mail = renderMail("DATA_EXPORT", locale, params);
      expect(mail.text.split(downloadUrl)).toHaveLength(2);
      expect(mail.html.match(/<a href=/g)).toHaveLength(1);
      expect(mail.html).toContain(`<a href="${downloadUrl}">${downloadUrl}</a>`);
    }
  });

  it("M-4 rejects a missing download URL with the template error", () => {
    expect(() => renderMail("DATA_EXPORT", "en", {
      requested: params.requested, expires: params.expires
    })).toThrowError(MailTemplateError);
    expect(() => renderMail("DATA_EXPORT", "en", {
      requested: params.requested, expires: params.expires
    })).toThrowError("MAIL_TEMPLATE_PARAM_MISSING:downloadUrl");
  });
});
