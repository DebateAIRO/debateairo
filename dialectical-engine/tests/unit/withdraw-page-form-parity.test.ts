import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * /withdraw shows the model withdrawal form (Directive 2011/83/EU Annex I(B)) before anyone buys; the confirmation
 * email attaches the same form. The page reads its lines from the website's billing catalogue and the email from the
 * mail catalogue, so in every language each line of the page must be the email's line, word for word, with the same
 * company placeholders, which both fill from the one company record.
 */
const UI = resolve("apps/ui/messages");
const MAIL = resolve("packages/mail-templates/messages");
const LINES = ["title", "instruction", "to", "notice", "orderedOn", "name", "address", "signature", "date"] as const;
const read = (path: string): Record<string, string> => JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
const locales = readdirSync(UI, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

describe("the model withdrawal form on /withdraw is the one the confirmation email attaches", () => {
  it("covers every catalogue language", () => {
    expect(locales).toHaveLength(35);
    expect(readdirSync(MAIL, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort())
      .toEqual(locales);
  });

  it("holds each line equal to the email's, in every language", () => {
    for (const locale of locales) {
      const billing = read(join(UI, locale, "billing.json"));
      const mail = read(join(MAIL, locale, "mail.json"));
      for (const line of LINES) {
        const pageKey = line === "title" ? "billing.withdrawPage.formTitle" : `billing.withdrawPage.form.${line}`;
        expect(billing[pageKey], `${locale}: ${pageKey}`).toBe(mail[`mail.withdrawalForm.${line}`]);
      }
    }
  });

  it("addresses the form to the company by the placeholders the page fills", () => {
    const english = read(join(UI, "en", "billing.json"));
    expect(english["billing.withdrawPage.form.to"]).toBe("To: {merchantName}, {merchantAddress}, {merchantEmail}");
  });
});
