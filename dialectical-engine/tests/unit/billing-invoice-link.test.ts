import { describe, expect, it } from "vitest";
import { mailLinkOf, renderMail } from "@debateai/mail-templates";
import { quadernoInvoiceLink } from "../../apps/api/src/billing/invoice-quaderno.js";

const PUBLIC_APP_URL = "https://dezbatere.ro";
const SETTINGS = "https://dezbatere.ro/settings";

/** Quaderno's link as it may come back (P4 only checks the https:// prefix), and the link the receipt email gets. */
const CASES: ReadonlyArray<readonly [string | null, string]> = Object.freeze([
  ["https://QuadernoApp.com/i/abc", "https://quadernoapp.com/i/abc"],
  ["https://quadernoapp.com:443/i/abc", "https://quadernoapp.com/i/abc"],
  ["https://quadernoapp.com", "https://quadernoapp.com/"],
  ["https://quadernoapp.com/i/abc?x=é", "https://quadernoapp.com/i/abc?x=%C3%A9"],
  [null, SETTINGS],
  ["http://quadernoapp.com/i/abc", SETTINGS],
  ["https://user:pw@quadernoapp.com/i/abc", SETTINGS],
  ["https://[bad", SETTINGS],
  [`https://quadernoapp.com/i/${"a".repeat(2_048)}`, SETTINGS]
] as const);
const shown = (documentUrl: string | null): string =>
  documentUrl === null ? "null" : documentUrl.length > 80 ? `an https link of ${documentUrl.length} characters` : documentUrl;

describe("P17 M2_INVOICE_LINK receipt link (spec §2.5.10: a receipt on every successful charge)", () => {
  it.each(CASES.map(([documentUrl, expected]) => [shown(documentUrl), documentUrl, expected] as const))(
    "maps Quaderno's %s to a link the mail renderer accepts", (_shown, documentUrl, expected) => {
    const link = quadernoInvoiceLink(documentUrl, PUBLIC_APP_URL);
    expect(link).toBe(expected);
    const mail = renderMail("M2_INVOICE_LINK", "en", {
      plan: "PLUS", totalAmount: "24.20", chargeDate: "2026-10-29T10:00:00.000Z", invoiceUrl: link
    });
    expect(mail.html).toContain(`<a href="${link}">`);
  });

  it("keeps the renderer's url rule in one place: mailLinkOf accepts exactly its own canonical output", () => {
    expect(mailLinkOf("https://quadernoapp.com/i/abc")).toBe("https://quadernoapp.com/i/abc");
    expect(mailLinkOf("https://quadernoapp.com/i/a b")).toBe("https://quadernoapp.com/i/a%20b");
    expect(mailLinkOf("http://quadernoapp.com/i/abc")).toBeNull();
    expect(mailLinkOf("not a url")).toBeNull();
    expect(() => renderMail("M2_INVOICE_LINK", "en", {
      plan: "PLUS", totalAmount: "24.20", chargeDate: "2026-10-29T10:00:00.000Z", invoiceUrl: "https://QuadernoApp.com/i/abc"
    })).toThrow(expect.objectContaining({ code: "MAIL_TEMPLATE_PARAM_INVALID" }));
  });
});
