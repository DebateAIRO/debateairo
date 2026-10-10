import { describe, expect, it } from "vitest";
import type { TaxSummaryRow } from "@debateai/db";
import { MailTemplateError, renderMail } from "@debateai/mail-templates";
import { TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW, taxAuthoritiesFromValue } from "@debateai/register";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };
import { buildTaxSummary, parseTaxQuarter, renderTaxSummary } from "../../apps/api/src/billing/tax-summary.js";
import { formatMoney, taxLabel } from "../../apps/ui/lib/billing/format.js";

/** Spec 2026-10-05 §2.16.5: every amount is shown in its own currency (emails, pages, the owner's tax summary). */
const money = (locale: string, amount: number, currency: string): string =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
const M1 = {
  plan: "PLUS", totalAmount: "24.20", renewDate: "2026-12-02", cancelPageUrl: "https://dezbatere.test/cancel",
  termsUrl: "https://dezbatere.test/terms"
} as const;
const O2_REFUND_DUE = {
  chargeRef: "0123456789abcdef0123456789abcdef", paymentRef: "ntp-1234567890", refundAmount: "120.98", currency: "RON",
  refundReason: "WITHDRAWAL", whole: "true", doneCommand: "pnpm billing:refund-done --charge 0123456789abcdef0123456789abcdef"
} as const;
const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (error instanceof MailTemplateError) return error.code;
    throw error;
  }
  throw new Error("expected a MailTemplateError");
};

describe("C3 the emails show an amount in its charge's currency", () => {
  it("renders the amount in params.currency, in the reader's locale", () => {
    expect(renderMail("M1", "de", { ...M1, currency: "EUR" }).text).toContain(money("de", 24.2, "EUR"));
    expect(renderMail("M1", "ro", { ...M1, currency: "RON" }).text).toContain(money("ro", 24.2, "RON"));
    expect(renderMail("M1", "en", { ...M1, currency: "USD" }).text).toContain("$24.20");
  });

  it("renders an email queued before Part C, with no currency, in US dollars", () => {
    expect(renderMail("M1", "en", M1).text).toContain("$24.20");
  });

  it("refuses another currency, and a currency on an email that shows no amount", () => {
    expect(codeOf(() => renderMail("M1", "en", { ...M1, currency: "GBP" }))).toBe("MAIL_TEMPLATE_PARAM_INVALID");
    expect(codeOf(() => renderMail("M9", "en", { cancelLinkUrl: "https://dezbatere.test/cancel?x=1", currency: "EUR" })))
      .toBe("MAIL_TEMPLATE_PARAM_UNKNOWN");
  });

  it("shows the owner's refund in lei when the code it prints is RON, and still prints the code", () => {
    const text = renderMail("O2_REFUND_DUE", "en", O2_REFUND_DUE).text;
    expect(text).toContain(`${money("en", 120.98, "RON")} (RON)`);
    expect(text).not.toContain("$120.98");
  });
});

describe("C3 the pages show an amount in its currency", () => {
  it("formats a decimal in the currency it is in, and leaves anything else untouched", () => {
    expect(formatMoney("en", "20.00", "USD")).toBe("$20.00");
    expect(formatMoney("en", "20.00", "EUR")).toBe("€20.00");
    expect(formatMoney("de", "20.00", "EUR")).toBe(money("de", 20, "EUR"));
    expect(formatMoney("ro", "99.99", "RON")).toBe(money("ro", 99.99, "RON"));
    expect(formatMoney("en", "20", "EUR")).toBe("20");
  });

  it("builds the tax label in the quote's currency", () => {
    expect(taxLabel(billingEnglish, "en", {
      status: "TAXABLE", taxAmount: "3.80", taxName: "VAT", rateBasisPoints: 1900, country: "DE", currency: "EUR"
    })).toBe("€3.80 VAT (19%, Germany)");
  });
});

describe("C3 the owner's tax summary prints each currency separately", () => {
  const authorities = taxAuthoritiesFromValue(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value, "test");
  const Q4 = parseTaxQuarter("2026-Q4");
  const at = new Date("2026-11-03T10:00:00.000Z");
  const row = (overrides: Partial<TaxSummaryRow>): TaxSummaryRow => Object.freeze({
    type: "SALE", chargeId: "c".repeat(32), at, taxCountry: "RO", taxRegion: null, taxStatus: "TAXABLE",
    chargeNetMicros: 20_000_000, chargeTaxMicros: 4_200_000, chargeTotalMicros: 24_200_000, amountMicros: 24_200_000,
    amountKnown: true, saleRecorded: true, locationVerdict: "AGREED", currency: "USD", ...overrides
  }) as TaxSummaryRow;

  it("keeps one block per country, scheme and currency, and names each amount's currency", () => {
    const summary = buildTaxSummary({
      quarter: Q4, authorities, invoiceUnknown: [], efactura: [], paymentsToCheck: [], deadEmails: [],
      rows: [
        row({ chargeId: "a".repeat(32) }),
        row({ chargeId: "b".repeat(32), currency: "RON", chargeNetMicros: 99_990_000, chargeTaxMicros: 20_990_000,
          chargeTotalMicros: 120_980_000, amountMicros: 120_980_000 }),
        row({ chargeId: "d".repeat(32), type: "CHARGEBACK", currency: "RON", chargeNetMicros: 99_990_000,
          chargeTaxMicros: 20_990_000, chargeTotalMicros: 120_980_000, amountMicros: 120_980_000 }),
        row({ chargeId: "e".repeat(32), type: "REFUND", currency: "RON", amountKnown: false, amountMicros: 120_980_000 })
      ]
    });
    const romania = summary.lines.filter((line) => line.taxCountry === "RO");
    expect(romania.map((line) => [line.currency, line.netMicros, line.taxMicros])).toEqual([
      ["RON", 99_990_000, 20_990_000], ["USD", 20_000_000, 4_200_000]
    ]);
    expect(summary.chargebacks[0]).toMatchObject({ currency: "RON", amountMicros: 120_980_000 });
    expect(summary.unknownRefunds[0]).toMatchObject({ currency: "RON", upToMicros: 120_980_000 });
    const text = renderTaxSummary(summary);
    expect(text).toContain("Net sales 99.99 RON, tax collected 20.99 RON,");
    expect(text).toContain("Net sales 20.00 USD, tax collected 4.20 USD,");
    expect(text).toContain(`charge ${"d".repeat(32)}, RO, 120.98 RON, on `);
    expect(text).toContain(`charge ${"e".repeat(32)}, RO, up to 120.98 RON, on `);
    expect(text).toContain("Each amount is in the currency it was charged in; one block per country or state, tax scheme and currency.");
    expect(text).not.toContain("Amounts are US dollars");
  });
});
