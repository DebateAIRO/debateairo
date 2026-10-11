import { describe, expect, it } from "vitest";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };
import {
  allowanceText,
  countryName,
  formatLongDate,
  formatMoney,
  planName,
  renewDayLabel,
  taxLabel
} from "../../apps/ui/lib/billing/format.js";
import { isBillingPlanId, isPaidPlanId } from "../../apps/ui/lib/billing/plans.js";

describe("P18 billing formatting helpers", () => {
  it("shows a decimal price in its currency in the reader's locale and leaves anything else untouched", () => {
    expect(formatMoney("en", "20.00", "USD")).toBe("$20.00");
    expect(formatMoney("de", "20.00", "USD")).toMatch(/^20,00\s\$$/u);
    expect(formatMoney("en", "20", "USD")).toBe("20");
  });

  it("names plans from the catalogue and words the allowance as a multiple, never as credit", () => {
    expect(planName(billingEnglish, "PRO")).toBe("Pro");
    expect(allowanceText(billingEnglish, "en", "FREE", "0.04")).toBe("A small monthly allowance");
    expect(allowanceText(billingEnglish, "en", "PLUS", "1")).toBe("The Plus allowance");
    expect(allowanceText(billingEnglish, "en", "PRO", "4")).toBe("4× the Plus allowance");
    expect(allowanceText(billingEnglish, "en", "MAX", "30")).toBe("30× the Plus allowance");
  });

  it("builds the tax label from its parts, the amount first as spec §1.3 shows it, and handles the untaxed cases", () => {
    expect(taxLabel(billingEnglish, "en", { status: "TAXABLE", taxAmount: "4.20", currency: "USD", taxName: "VAT", rateBasisPoints: 2100, country: "RO" }))
      .toBe("$4.20 VAT (21%, Romania)");
    expect(taxLabel(billingEnglish, "en", { status: "TAXABLE", taxAmount: "1.77", currency: "USD", taxName: "Sales tax", rateBasisPoints: 887, country: "US" }))
      .toBe("$1.77 Sales tax (8.87%, United States)");
    // P8b's tax_rate_bp may be fractional: New York's 8.875 % is 887.5 basis points.
    expect(taxLabel(billingEnglish, "en", { status: "TAXABLE", taxAmount: "1.78", currency: "USD", taxName: "Sales tax", rateBasisPoints: 887.5, country: "US" }))
      .toBe("$1.78 Sales tax (8.875%, United States)");
    expect(taxLabel(billingEnglish, "en", { status: "REVERSE_CHARGE", taxAmount: "0.00", currency: "USD", taxName: "VAT", rateBasisPoints: 0, country: "DE" }))
      .toBe("VAT reverse charge");
    expect(taxLabel(billingEnglish, "en", { status: "NOT_REGISTERED", taxAmount: "0.00", currency: "USD", taxName: "", rateBasisPoints: 0, country: "AU" }))
      .toBe("no tax");
  });

  it("says the renewal day as an English ordinal and as a number elsewhere", () => {
    expect(renewDayLabel("en", "2026-10-01T00:00:00.000Z")).toBe("1st");
    expect(renewDayLabel("en", "2026-10-22T00:00:00.000Z")).toBe("22nd");
    expect(renewDayLabel("en", "2026-10-23T00:00:00.000Z")).toBe("23rd");
    expect(renewDayLabel("en", "2026-10-29T00:00:00.000Z")).toBe("29th");
    expect(renewDayLabel("de", "2026-10-29T00:00:00.000Z")).toBe("29");
  });

  it("names countries and long dates in the reader's language", () => {
    expect(countryName("en", "RO")).toBe("Romania");
    expect(countryName("de", "RO")).toBe("Rumänien");
    expect(formatLongDate("en", "2026-10-29T23:30:00.000Z")).toBe("October 29, 2026");
  });

  it("knows the four plan ids and which are paid", () => {
    expect(["FREE", "PLUS", "PRO", "MAX", "GOLD"].map(isBillingPlanId)).toEqual([true, true, true, true, false]);
    expect(["FREE", "PLUS", "PRO", "MAX"].map(isPaidPlanId)).toEqual([false, true, true, true]);
  });
});
