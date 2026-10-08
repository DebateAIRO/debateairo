import { CatalogLocaleCodeSchema } from "../../packages/contract/src/consumer-auth.js";
import { ACCOUNT_MAIL_LOCALES } from "../../apps/api/src/account-mail-template.mjs";
import { describe, expect, it } from "vitest";
import { renderVerificationEmail } from "../../apps/api/src/verification-email.js";
import { MemoryMailSender } from "../../apps/api/src/mail-channel.js";
const token = "Z".repeat(43);
const verificationUrl = new URL(`https://v3-preview.dezbatere.ro/verify-email#token=${token}`);
const expiresAt = new Date("2026-10-05T07:41:00.000Z");
function render(locale = "en-GB", timeZone: string | null = "Europe/Bucharest") {
  return renderVerificationEmail({ recipient: "person@example.test", verificationUrl, expiresAt, display: { locale, timeZone } });
}
describe("branded verification alternatives", () => {
  it("renders the authoritative 5 October 10:41 Bucharest expiry and 24 hour lifetime", () => {
    const mail = render();
    expect(mail.subject).toBe("Verify your email for Dialectical Engine");
    expect(mail.text).toContain("5 October 2026"); expect(mail.text).toContain("10:41");
    expect(mail.text).toContain("Europe/Bucharest"); expect(mail.text).toContain("24 hours");
    expect(mail.html).toContain("5 October 2026"); expect(mail.html).toContain("10:41");
    expect(mail.text).not.toContain(expiresAt.toISOString());
    expect(mail.html).toContain('href="' + verificationUrl.href + '"');
    expect(mail.html.match(new RegExp(verificationUrl.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(3);
    expect(mail.text).toContain(verificationUrl.href);
    expect(mail.html).toContain("#f7f3e8"); expect(mail.html).toContain("#242424"); expect(mail.html).toContain("#b89b5e");
    expect(mail.html).not.toMatch(/<img|<script|<iframe|src=|https?:\/\/(?!v3-preview\.dezbatere\.ro)/i);
  });
  it.each([null, "Mars/Olympus", "+03:00", "Europe/Bucharest\r\nBcc:bad"])("uses explicit UTC fallback for %s", timeZone => {
    const mail = render("en-GB", timeZone);
    expect(mail.text).toContain("07:41"); expect(mail.text).toContain("UTC");
  });
  it("uses served locale for date ordering without inferring timezone", () => {
    expect(render("en-US", null).text).toContain("October 5, 2026");
    expect(render("en-GB", null).text).toContain("5 October 2026");
    expect(render("ro", "Europe/Bucharest").text).toContain("5 octombrie 2026");
  });
  it.each([
    ["2026-03-29T00:41:00Z", "02:41"], ["2026-03-29T01:41:00Z", "04:41"],
    ["2026-10-25T00:41:00Z", "03:41"], ["2026-10-25T01:41:00Z", "03:41"],
    ["2026-10-04T22:41:00Z", "01:41"]
  ])("uses actual zone rules for %s", (date, time) => {
    const mail = renderVerificationEmail({ recipient: "person@example.test", verificationUrl, expiresAt: new Date(date), display: { locale: "en-GB", timeZone: "Europe/Bucharest" } });
    expect(mail.text).toContain(time);
    if (date === "2026-10-04T22:41:00Z") expect(mail.text).toContain("5 October 2026");
    if (date === "2026-10-25T00:41:00Z") expect(mail.text).toContain("GMT+3");
    if (date === "2026-10-25T01:41:00Z") expect(mail.text).toContain("GMT+2");
  });
  it("escapes recipient text including HTML metacharacters without creating markup", () => {
    const mail = renderVerificationEmail({ recipient: "a<&\"'@example.test", verificationUrl, expiresAt, display: { locale: "en", timeZone: null } });
    expect(mail.text).toContain("a<&\"'@example.test"); expect(mail.html).toContain("a&lt;&amp;&quot;&#39;@example.test");
    expect(mail.html).not.toContain("a<&");
  });
  it.each(["http://v3-preview.dezbatere.ro/verify-email#token=", "https://user:pass@v3-preview.dezbatere.ro/verify-email#token=", "https://v3-preview.dezbatere.ro/verify-email?token=", "https://v3-preview.dezbatere.ro/settings#token="])("rejects unsafe credential URL %s", prefix => {
    expect(() => renderVerificationEmail({ recipient: "person@example.test", verificationUrl: new URL(prefix + token), expiresAt, display: { locale: "en", timeZone: null } })).toThrow("MAIL_INPUT_INVALID");
  });
  it("rejects invalid expiry, unsupported locale and header injection", () => {
    for (const override of [{ expiresAt: new Date(NaN) }, { recipient: "a@b.test\r\nBcc: x@y.test" }, { display: { locale: "en\r\nCC:x", timeZone: null } }]) {
      expect(() => renderVerificationEmail({ recipient: "person@example.test", verificationUrl, expiresAt, display: { locale: "en", timeZone: null }, ...override })).toThrow("MAIL_INPUT_INVALID");
    }
  });
  it("copies and freezes nested display metadata in memory deliveries", async () => {
    const sender = new MemoryMailSender(), display = { locale: "ro", timeZone: "Europe/Bucharest" };
    await sender.sendVerification({ attemptId: "opaque", recipient: "person@example.test", token, expiresAt, display });
    display.locale = "en"; display.timeZone = "Asia/Tokyo";
    expect(sender.messages[0]!.display).toEqual({ locale: "ro", timeZone: "Europe/Bucharest" });
    expect(Object.isFrozen(sender.messages[0]!.display)).toBe(true); expect(sender.messages[0]!.expiresAt).toEqual(expiresAt);
  });
});

it("supports exactly the served UI locale catalog", () => {
  expect(ACCOUNT_MAIL_LOCALES).toEqual([...CatalogLocaleCodeSchema.options, "en-US", "en-GB"]);
  for (const locale of ACCOUNT_MAIL_LOCALES) expect(render(locale, "Europe/Bucharest").text).toMatch(/10[:.]41/);
});
