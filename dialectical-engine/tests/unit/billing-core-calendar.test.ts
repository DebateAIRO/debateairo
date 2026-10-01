import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  businessDaysBetween,
  computeWindows,
  invoiceIssuerFor,
  periodBoundary
} from "@debateai/billing-core";

describe("P2 — anchored periods", () => {
  it("clamps a day-31 anchor to each month's last day and keeps the time of day", () => {
    const anchor = new Date("2026-01-31T18:45:10.250Z");
    expect(periodBoundary(anchor, 0).toISOString()).toBe("2026-01-31T18:45:10.250Z");
    expect(periodBoundary(anchor, 1).toISOString()).toBe("2026-02-28T18:45:10.250Z");
    expect(periodBoundary(anchor, 2).toISOString()).toBe("2026-03-31T18:45:10.250Z");
    expect(periodBoundary(anchor, 3).toISOString()).toBe("2026-04-30T18:45:10.250Z");
    expect(periodBoundary(anchor, 11).toISOString()).toBe("2026-12-31T18:45:10.250Z");
    expect(periodBoundary(anchor, 12).toISOString()).toBe("2027-01-31T18:45:10.250Z");
    expect(periodBoundary(new Date("2028-01-30T00:00:00.000Z"), 1).toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("agrees with B4b's month window for every anchor day (one rule, two call sites)", () => {
    for (const anchorText of ["2026-01-31T10:00:00Z", "2026-03-15T23:59:59Z", "2027-02-28T00:00:00Z", "2028-02-29T12:00:00Z"]) {
      const anchor = new Date(anchorText);
      for (let index = 0; index < 14; index += 1) {
        const inside = new Date(periodBoundary(anchor, index).getTime() + 3_600_000);
        const month = computeWindows(anchor, inside).month;
        expect(month.start.toISOString(), `${anchorText}#${index}`).toBe(periodBoundary(anchor, index).toISOString());
        expect(month.end.toISOString(), `${anchorText}#${index}`).toBe(periodBoundary(anchor, index + 1).toISOString());
      }
    }
  });
});

describe("P2 — business days (Monday to Friday, UTC; holidays ignored on purpose)", () => {
  const friday = new Date("2026-10-02T10:00:00.000Z");
  it("skips weekends", () => {
    expect(addBusinessDays(friday, 0).toISOString()).toBe("2026-10-02T10:00:00.000Z");
    expect(addBusinessDays(friday, 1).toISOString()).toBe("2026-10-05T10:00:00.000Z");
    expect(addBusinessDays(new Date("2026-10-03T08:00:00.000Z"), 1).toISOString()).toBe("2026-10-05T08:00:00.000Z");
    expect(addBusinessDays(new Date("2026-10-05T08:00:00.000Z"), 7).toISOString()).toBe("2026-10-14T08:00:00.000Z");
    expect(businessDaysBetween(friday, new Date("2026-10-05T09:59:59.999Z"))).toBe(0);
    expect(businessDaysBetween(friday, new Date("2026-10-05T10:00:00.000Z"))).toBe(1);
    expect(businessDaysBetween(new Date("2026-10-14T08:00:00.000Z"), new Date("2026-10-05T08:00:00.000Z"))).toBe(-7);
  });
  it("counts back exactly what it added", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 3_650 }), fc.integer({ min: 0, max: 40 }),
      (dayOffset, days) => {
        const from = new Date(Date.UTC(2026, 0, 1, 7) + dayOffset * 86_400_000);
        expect(businessDaysBetween(from, addBusinessDays(from, days))).toBe(days);
      }
    ));
  });
  it("refuses negative or fractional day counts", () => {
    expect(() => addBusinessDays(friday, -1)).toThrow(expect.objectContaining({ code: "BILLING_BUSINESS_DAYS_INVALID" }));
    expect(() => addBusinessDays(friday, 1.5)).toThrow(expect.objectContaining({ code: "BILLING_BUSINESS_DAYS_INVALID" }));
  });
});

describe("P2 — which issuer writes the legal invoice", () => {
  const rules = { RO: "SMARTBILL", "*": "QUADERNO" } as const;
  it("sends Romania to SmartBill and everything else to Quaderno", () => {
    expect(invoiceIssuerFor("RO", rules)).toBe("SMARTBILL");
    expect(invoiceIssuerFor("ro", rules)).toBe("SMARTBILL");
    expect(invoiceIssuerFor("DE", rules)).toBe("QUADERNO");
    expect(invoiceIssuerFor("US", rules)).toBe("QUADERNO");
  });
  it("refuses when no rule and no wildcard names an issuer", () => {
    expect(() => invoiceIssuerFor("DE", { RO: "SMARTBILL" }))
      .toThrow(expect.objectContaining({ code: "BILLING_INVOICE_ISSUER_UNRESOLVED" }));
  });
});
