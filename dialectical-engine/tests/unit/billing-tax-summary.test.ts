import { describe, expect, it, vi } from "vitest";
import type { TaxSummaryRow } from "@debateai/db";
import { TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW, taxAuthoritiesFromValue } from "@debateai/register";
import {
  buildTaxSummary,
  dueDatesFor,
  efacturaChecksFrom,
  lastEndedQuarter,
  liveQuarterSummaryRows,
  parseTaxQuarter,
  paymentsToCheckFrom,
  renderTaxSummary
} from "../../apps/api/src/billing/tax-summary.js";

const authorities = taxAuthoritiesFromValue(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value, "test");
const Q4 = parseTaxQuarter("2026-Q4");
const at = new Date("2026-11-03T10:00:00.000Z");

function row(overrides: Partial<TaxSummaryRow>): TaxSummaryRow {
  return Object.freeze({
    type: "SALE", chargeId: "c".repeat(32), at, taxCountry: "RO", taxRegion: null, taxStatus: "TAXABLE",
    chargeNetMicros: 20_000_000, chargeTaxMicros: 4_200_000, chargeTotalMicros: 24_200_000, amountMicros: 24_200_000,
    amountKnown: true, locationVerdict: "AGREED", ...overrides
  }) as TaxSummaryRow;
}

describe("P16b the quarter", () => {
  it("parses YYYY-Qn into its UTC bounds and refuses anything else", () => {
    expect(Q4).toMatchObject({ year: 2026, quarter: 4, label: "2026-Q4",
      from: new Date("2026-10-01T00:00:00.000Z"), to: new Date("2027-01-01T00:00:00.000Z") });
    for (const bad of ["2026-Q5", "2026Q4", "26-Q1", "2026-q1", ""]) {
      expect(() => parseTaxQuarter(bad), bad).toThrow("BILLING_TAX_SUMMARY_USAGE");
    }
    expect(lastEndedQuarter(new Date("2027-01-03T00:00:00.000Z")).label).toBe("2026-Q4");
    expect(lastEndedQuarter(new Date("2026-11-15T00:00:00.000Z")).label).toBe("2026-Q3");
    expect(lastEndedQuarter(new Date("2026-01-01T00:00:00.000Z")).label).toBe("2025-Q4");
  });

  it("turns each due rule into the quarter's dates", () => {
    expect(dueDatesFor({ rule: "QUARTER_FOLLOWING_MONTH_END" }, Q4)).toEqual([new Date("2027-01-31T00:00:00.000Z")]);
    expect(dueDatesFor({ rule: "QUARTER_FOLLOWING_MONTH_END" }, parseTaxQuarter("2026-Q1"))).toEqual([new Date("2026-04-30T00:00:00.000Z")]);
    expect(dueDatesFor({ rule: "FOLLOWING_MONTH_DAY", day: 25 }, Q4)).toEqual([
      new Date("2026-11-25T00:00:00.000Z"), new Date("2026-12-25T00:00:00.000Z"), new Date("2027-01-25T00:00:00.000Z")
    ]);
    expect(dueDatesFor({ rule: "NONE" }, Q4)).toEqual([]);
  });
});

describe("P16b the summary", () => {
  const rows = [
    row({ chargeId: "a".repeat(32) }),
    row({ chargeId: "b".repeat(32), type: "REFUND", amountMicros: 12_100_000 }),
    row({ chargeId: "d".repeat(32), taxCountry: "DE", chargeNetMicros: 50_000_000, chargeTaxMicros: 9_500_000,
      chargeTotalMicros: 59_500_000, amountMicros: 59_500_000, locationVerdict: "CONFLICTING" }),
    row({ chargeId: "e".repeat(32), taxCountry: "DE", taxStatus: "REVERSE_CHARGE", chargeTaxMicros: 0,
      chargeTotalMicros: 20_000_000, amountMicros: 20_000_000 }),
    row({ chargeId: "f".repeat(32), taxCountry: "US", taxRegion: "CA", taxStatus: "NOT_REGISTERED", chargeTaxMicros: 0,
      chargeTotalMicros: 20_000_000, amountMicros: 20_000_000 }),
    row({ chargeId: "9".repeat(32), type: "CHARGEBACK", taxCountry: "DE", chargeNetMicros: 50_000_000,
      chargeTaxMicros: 9_500_000, chargeTotalMicros: 59_500_000, amountMicros: 59_500_000,
      at: new Date("2026-12-01T08:00:00.000Z") })
  ];
  const summary = buildTaxSummary({
    quarter: Q4, rows, authorities,
    efactura: [
      { document: "DBAI-0042", kind: "INVOICE", chargeId: "a".repeat(32), issuedAt: new Date("2026-11-03T10:05:00.000Z"), status: null },
      { document: "DBAI-0043", kind: "CREDIT_NOTE", chargeId: "b".repeat(32), issuedAt: new Date("2026-11-04T09:00:00.000Z"), status: "SENT_BY_ACCOUNT_SETTING" }
    ],
    invoiceUnknown: [
      { chargeId: "a".repeat(32), jobKind: "SMARTBILL_INVOICE", code: "INVOICE_UNKNOWN", since: new Date("2026-11-04T00:00:00.000Z") },
      { chargeId: "b".repeat(32), jobKind: "SMARTBILL_STORNO", code: "CREDIT_NOTE_MANUAL", since: new Date("2026-11-05T00:00:00.000Z") },
      { chargeId: "c".repeat(32), jobKind: "SMARTBILL_INVOICE", code: "INVOICE_SERVICE_REFUSED", since: new Date("2026-11-07T00:00:00.000Z") },
      { chargeId: "e".repeat(32), jobKind: "DASHBOARD_REFUND", code: "CREDIT_NOTE_MANUAL", since: new Date("2026-11-08T00:00:00.000Z") },
      // W12 (P2-I16): every code is listed, with what to do.
      { chargeId: "d".repeat(32), jobKind: "QUADERNO_RECORD_SALE", code: "TAX_SERVICE_REFUSED", since: new Date("2026-11-09T00:00:00.000Z") },
      { chargeId: "f".repeat(32), jobKind: "QUADERNO_RECORD_REFUND", code: "CREDIT_NOTE_REFUND_MISSING", since: new Date("2026-11-10T00:00:00.000Z") }
    ],
    deadEmails: [
      { ref: `M1:${"a".repeat(32)}`, template: "M1", recipient: "CUSTOMER", code: "BILLING_PROFILE_UNREADABLE", since: new Date("2026-11-19T00:00:00.000Z") }
    ],
    paymentsToCheck: [
      { what: "REFUND_REFUSED", ref: "7".repeat(32), reason: null, since: new Date("2026-11-06T00:00:00.000Z") },
      { what: "REFUND_OUTCOME_UNKNOWN", ref: "6".repeat(32), reason: "WITHDRAWAL", since: new Date("2026-11-09T00:00:00.000Z") },
      { what: "REFUND_NOT_REQUESTED", ref: "4".repeat(32), reason: null, since: new Date("2026-11-17T00:00:00.000Z") },
      { what: "REFUND_OTHER_SYSTEM", ref: "2".repeat(32), reason: null, since: new Date("2026-11-20T00:00:00.000Z") },
      { what: "REFUND_UNRECORDED", ref: "9912345", reason: null, since: new Date("2026-11-11T00:00:00.000Z") },
      { what: "WITHDRAWAL_BY_OWNER", ref: "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93", reason: null, since: new Date("2026-11-10T00:00:00.000Z") },
      { what: "RENEWAL_STUCK", ref: "5".repeat(32), reason: null, since: new Date("2026-11-12T00:00:00.000Z") },
      { what: "PAYMENT_UNSETTLED", ref: "8".repeat(32), reason: null, since: new Date("2026-10-02T00:00:00.000Z") },
      { what: "DUNNING_UNPRICED", ref: "5b8e1f2a-3c4d-4e5f-8a6b-7c8d9e0f1a2b", reason: "TAX_SERVICE_UNAVAILABLE", since: new Date("2026-11-14T00:00:00.000Z") },
      { what: "ENDED_UNPRICED", ref: "6c9f2a3b-4d5e-4f6a-9b7c-8d9e0f1a2b3c", reason: "TAX_SERVICE_UNAVAILABLE", since: new Date("2026-11-15T00:00:00.000Z") },
      { what: "DUNNING_UNPRICED", ref: "8e1a4b5c-6d7e-4f8a-9b0c-1d2e3f4a5b6c", reason: "RETRY_TOTAL_CHANGED", since: new Date("2026-11-18T00:00:00.000Z") },
      { what: "RENEWAL_BLOCKED", ref: "7d0a3b4c-5e6f-4a7b-8c8d-9e0f1a2b3c4d", reason: null, since: new Date("2026-11-16T00:00:00.000Z") },
      { what: "SUBSCRIPTION_HISTORY_INVALID", ref: "3c9d2b1a-5e4f-4a6b-8c7d-9e0f1a2b3c4d", reason: null, since: new Date("2026-11-13T00:00:00.000Z") }
    ]
  });

  it("groups by country, region and scheme, takes a refund's share of tax back, and never counts a charge-back as a sale", () => {
    const byKey = new Map(summary.lines.map((line) => [`${line.taxCountry}/${line.taxRegion ?? ""}/${line.scheme ?? ""}`, line]));
    expect(byKey.get("RO//RO_D300")).toMatchObject({ netMicros: 20_000_000 - 10_000_000, taxMicros: 4_200_000 - 2_100_000, sales: 1, refunds: 1 });
    expect(byKey.get("DE//EU_OSS")).toMatchObject({ netMicros: 50_000_000, taxMicros: 9_500_000, sales: 1 });
    expect(byKey.get("DE//EU_REVERSE_CHARGE_D390")).toMatchObject({ netMicros: 20_000_000, taxMicros: 0 });
    expect(byKey.get("US/CA/US_STATE")?.statusCounts.NOT_REGISTERED).toBe(1);
    expect(summary).toMatchObject({ sales: 4, refunds: 1 });
    expect(summary.conflicting).toEqual([{ chargeId: "d".repeat(32), taxCountry: "DE", at }]);
    expect(summary.notRegistered).toEqual([{ chargeId: "f".repeat(32), taxCountry: "US", taxRegion: "CA", at }]);
    expect(summary.chargebacks).toEqual([{
      chargeId: "9".repeat(32), taxCountry: "DE", amountMicros: 59_500_000, at: new Date("2026-12-01T08:00:00.000Z")
    }]);
  });

  it("reads in plain words, with registration, the where, the when, the dates and every list, and no personal data", () => {
    const text = renderTaxSummary(summary);
    expect(text).toContain("DebateAI tax summary for 2026-Q4 (1 October 2026 to 31 December 2026, UTC)");
    expect(text).toContain("4 sales and 1 refund");
    expect(text).toContain("Germany (EU_OSS)");
    expect(text).toContain("Net sales 50.00 USD, tax collected 9.50 USD");
    expect(text).toContain("  Registration: registered.");
    expect(text).toContain("For 2026-Q4: 31 January 2027.");
    expect(text).toContain("Romania (RO_D300)");
    expect(text).toContain("For 2026-Q4: 25 November 2026, 25 December 2026 and 25 January 2027.");
    expect(text).toContain("United States, CA (US_STATE)");
    expect(text).toContain("  Registration: needed only after the threshold.");
    expect(text).toContain("not registered, no tax collected: 1");
    expect(text).toContain(`charge ${"d".repeat(32)}, declared DE, on 2026-11-03`);
    expect(text).toContain(`charge ${"f".repeat(32)}, US, CA, on 2026-11-03`);
    expect(text).toContain(`charge ${"9".repeat(32)}, DE, 59.50 USD, on 2026-12-01`);
    expect(text).toContain(`charge ${"a".repeat(32)}: SMARTBILL_INVOICE (INVOICE_UNKNOWN), since 2026-11-04`);
    expect(text).toContain(`charge ${"b".repeat(32)}: SMARTBILL_STORNO (CREDIT_NOTE_MANUAL), since 2026-11-05`);
    expect(text).toContain(`charge ${"c".repeat(32)}: SMARTBILL_INVOICE (INVOICE_SERVICE_REFUSED), since 2026-11-07`);
    expect(text).toContain(`charge ${"e".repeat(32)}: DASHBOARD_REFUND (CREDIT_NOTE_MANUAL), since 2026-11-08`);
    // W12 (P2-I16, P2-I17): what to do is said once per job kind and code below the list (fix I-1), with the command
    // to copy (<charge> for the line's charge); a job our records do not back is nothing to issue or re-queue (the W4
    // judge's forward).
    expect(text).toContain(`charge ${"a".repeat(32)}: SMARTBILL_INVOICE (INVOICE_UNKNOWN), since 2026-11-04\n`);
    expect(text).toContain(`charge ${"d".repeat(32)}: QUADERNO_RECORD_SALE (TAX_SERVICE_REFUSED), since 2026-11-09\n`);
    expect(text).toContain(`charge ${"f".repeat(32)}: QUADERNO_RECORD_REFUND (CREDIT_NOTE_REFUND_MISSING), since 2026-11-10\n`);
    expect(text).toContain("where <charge> stands for the line's charge");
    expect(text).toContain("  What to do:\n  * SMARTBILL_INVOICE (INVOICE_UNKNOWN): SmartBill never confirmed it: look for it in"
      + " SmartBill; if it is there, record it with pnpm billing:invoice --charge <charge> --kind INVOICE --record"
      + " <series>-<number>;");
    expect(text).toContain("  * QUADERNO_RECORD_SALE (TAX_SERVICE_REFUSED): Quaderno refused it");
    expect(text).toContain("pnpm billing:invoice --charge <charge> --kind INVOICE --requeue");
    expect(text).toContain("  * QUADERNO_RECORD_REFUND (CREDIT_NOTE_REFUND_MISSING): no refund is recorded for this sale:"
      + " nothing to issue or re-queue; tell whoever runs the server");
    // F4: the job itself is not tried again; only M3 is sent again, by the renewal.
    expect(text).toContain("Emails that never went out (the last 120 days; a dead email job is not tried again, and only the"
      + " notice of a changed renewal amount, M3, is sent again, by the renewal; what each one means is said once for each"
      + " email below the list):");
    expect(text).not.toContain("nothing sends them again by itself");
    expect(text).toContain(`M1 (job M1:${"a".repeat(32)}): BILLING_PROFILE_UNREADABLE, since 2026-11-19\n`);
    expect(text).toContain("  * M1 to the customer: the customer never got the confirmation with the Terms and the model"
      + " withdrawal form");
    expect(text).toContain(`charge ${"7".repeat(32)}: REFUND_REFUSED, since 2026-11-06`);
    expect(text).toContain(`charge ${"6".repeat(32)}: REFUND_OUTCOME_UNKNOWN (WITHDRAWAL), since 2026-11-09`);
    // P2-I5: a refund job the charge records no request for moved no money; the help text says it is no refund to make.
    expect(text).toContain(`charge ${"4".repeat(32)}: REFUND_NOT_REQUESTED, since 2026-11-17`);
    expect(text).toContain("REFUND_NOT_REQUESTED: a refund job that matches no refund request our records hold for this"
      + " payment, so nothing was sent to xMoney and it is no refund to make; do not refund it: something able to write to"
      + " the billing database queued it, so tell whoever runs the server, who checks this charge's own refund requests"
      + " (one never refunded is still owed);");
    // P2-W4: a refund job of the other xMoney system sent nothing and is owed nothing on this server (C2's legend).
    expect(text).toContain(`charge ${"2".repeat(32)}: REFUND_OTHER_SYSTEM, since 2026-11-20`);
    expect(text).toContain("REFUND_OTHER_SYSTEM: a refund job for a payment of the other xMoney system (sandbox or live):"
      + " nothing was sent, and nothing is owed on this server;");
    // The two real dead ends keep their own words.
    expect(text).toContain("(REFUND_REFUSED: xMoney refused our refund, the money is still owed, refund it from the dashboard;"
      + " REFUND_OUTCOME_UNKNOWN: a partial refund whose outcome is unknown, check the dashboard before refunding again;"
      + " a WITHDRAWAL refund is due within 14 days of the withdrawal; REFUND_NOT_REQUESTED:");
    // P9c's second refund made elsewhere: named by the xMoney transaction the owner opens in the dashboard.
    expect(text).toContain("xMoney transaction 9912345: REFUND_UNRECORDED, since 2026-11-11");
    expect(text).toContain("REFUND_UNRECORDED: a second refund made in the xMoney dashboard");
    expect(text).toContain("owner 0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93: WITHDRAWAL_BY_OWNER, since 2026-11-10");
    expect(text).toContain(`charge ${"5".repeat(32)}: RENEWAL_STUCK, since 2026-11-12`);
    expect(text).toContain(`charge ${"8".repeat(32)}: PAYMENT_UNSETTLED, since 2026-10-02`);
    expect(text).toContain("subscription 3c9d2b1a-5e4f-4a6b-8c7d-9e0f1a2b3c4d: SUBSCRIPTION_HISTORY_INVALID, since 2026-11-13");
    // R2 Q-1's renewals with no charge (D6a's 4b): named by subscription, with the code that stopped the pricing.
    expect(text).toContain("subscription 5b8e1f2a-3c4d-4e5f-8a6b-7c8d9e0f1a2b: DUNNING_UNPRICED (TAX_SERVICE_UNAVAILABLE), since 2026-11-14");
    expect(text).toContain("subscription 6c9f2a3b-4d5e-4f6a-9b7c-8d9e0f1a2b3c: ENDED_UNPRICED (TAX_SERVICE_UNAVAILABLE), since 2026-11-15");
    // W5 (P2-M10): a retry priced afresh at a total the person was never told about is charged nothing; the help text
    // says why, and that the tax service needs no fix.
    expect(text).toContain("subscription 8e1a4b5c-6d7e-4f8a-9b0c-1d2e3f4a5b6c: DUNNING_UNPRICED (RETRY_TOTAL_CHANGED), since 2026-11-18");
    expect(text).toContain("RETRY_TOTAL_CHANGED (named after DUNNING_UNPRICED or ENDED_UNPRICED): the tax service priced a"
      + " retry again, but at a total the person was never told about (a tax change), so nothing is charged and the plan"
      + " ends after its last retry day unless a later retry prices at the announced total again; there is nothing to fix"
      + " in the tax service, and the person can subscribe again at the new price;");
    expect(text).toContain("subscription 7d0a3b4c-5e6f-4a7b-8c8d-9e0f1a2b3c4d: RENEWAL_BLOCKED, since 2026-11-16");
    expect(text).toContain("pnpm billing:withdraw --owner <ref> --refund <amount>");
    expect(text).toContain("Romanian e-Factura documents to confirm in SmartBill or the ANAF SPV");
    expect(text).toContain("pnpm billing:efactura-status --invoice <series>-<number> --status ACCEPTED|REJECTED");
    expect(text).toContain(`invoice DBAI-0042 (charge ${"a".repeat(32)}), issued 2026-11-03: no status recorded`);
    expect(text).toContain(`credit note DBAI-0043 (charge ${"b".repeat(32)}), issued 2026-11-04: last status SENT_BY_ACCOUNT_SETTING`);
    expect(text).not.toMatch(/@/);
  });

  it("never subtracts a dashboard refund of unknown amount, lists it with its upper bound, and still subtracts a known one", () => {
    const sale = row({ chargeId: "a".repeat(32) });
    // P9c's record on the payment itself: 24.20 is only what was left of the charge, the true amount is unknown.
    const unknown = row({ chargeId: "a".repeat(32), type: "REFUND", amountMicros: 24_200_000, amountKnown: false,
      at: new Date("2026-11-20T09:00:00.000Z") });
    const alone = buildTaxSummary({
      quarter: Q4, rows: [sale, unknown], authorities, invoiceUnknown: [], efactura: [], paymentsToCheck: [], deadEmails: []
    });
    const ro = alone.lines.find((line) => line.taxCountry === "RO")!;
    expect(ro).toMatchObject({ netMicros: 20_000_000, taxMicros: 4_200_000, sales: 1, refunds: 0, unknownRefunds: 1 });
    expect(alone.unknownRefunds).toEqual([{
      chargeId: "a".repeat(32), taxCountry: "RO", taxRegion: null, upToMicros: 24_200_000, at: new Date("2026-11-20T09:00:00.000Z")
    }]);
    const text = renderTaxSummary(alone);
    expect(text).toContain("Net sales 20.00 USD, tax collected 4.20 USD, from 1 sale and 0 refunds.");
    expect(text).toContain("Not subtracted: 1 refund made in the xMoney dashboard, amount unknown (listed below).");
    expect(text).toContain("Refunds made in the xMoney dashboard, amount unknown (not subtracted above;");
    // P4-K (P2-W12): the owner records the hand-made credit note with its amount, and the summary then subtracts it.
    expect(text).toContain("issue its credit note by hand and record it with its amount (pnpm billing:invoice --amount, as"
      + " its line under the invoices and credit notes to check by hand says), and the summary then subtracts it at that"
      + " amount; until then, adjust that country's net sales and tax by hand, at most the amount shown):");
    expect(text).toContain(`charge ${"a".repeat(32)}, RO, up to 24.20 USD, on 2026-11-20`);
    // A refund whose amount is known (ours, or one xMoney reported as its own transaction) is still subtracted.
    const known = row({ chargeId: "a".repeat(32), type: "REFUND", amountMicros: 12_100_000, amountKnown: true });
    const both = buildTaxSummary({
      quarter: Q4, rows: [sale, unknown, known], authorities, invoiceUnknown: [], efactura: [], paymentsToCheck: [], deadEmails: []
    });
    expect(both.lines.find((line) => line.taxCountry === "RO")).toMatchObject({
      netMicros: 10_000_000, taxMicros: 2_100_000, refunds: 1, unknownRefunds: 1
    });
  });

  it("caps each list and cuts the whole text at a line boundary only when a limit is given (O1; W12 fix I-1)", () => {
    const full = renderTaxSummary(summary);
    expect(full).not.toContain("more: run pnpm billing:tax-summary");
    const capped = renderTaxSummary(summary, { itemsPerSection: 2, maxChars: 1_000_000 });
    expect(capped).toContain(`charge ${"b".repeat(32)}: SMARTBILL_STORNO (CREDIT_NOTE_MANUAL), since 2026-11-05\n`
      + "  - and 4 more: run pnpm billing:tax-summary --quarter 2026-Q4 on the host for the whole list\n  What to do:");
    // The legend names only what the printed lines need.
    expect(capped).not.toContain("  * QUADERNO_RECORD_SALE (TAX_SERVICE_REFUSED):");
    const cut = renderTaxSummary(summary, { itemsPerSection: 40, maxChars: 2_000 });
    expect(cut.length).toBeLessThanOrEqual(2_000);
    expect(cut.endsWith("The summary is cut here: it is longer than one email holds. Run pnpm billing:tax-summary --quarter"
      + " 2026-Q4 on the host for the whole of it.\n")).toBe(true);
    expect(full.startsWith(cut.slice(0, cut.lastIndexOf("\nThe summary is cut here")))).toBe(true);
  });

  it("prints the fallback for a country the row does not cover, and says when there is nothing to list", () => {
    const text = renderTaxSummary(buildTaxSummary({
      quarter: Q4, rows: [row({ taxCountry: "CH" })], authorities, invoiceUnknown: [], efactura: [], paymentsToCheck: [], deadEmails: []
    }));
    expect(text).toContain("Switzerland");
    expect(text).toContain("No entry for this place yet: ask the accountant before paying anything.");
    expect(text).toContain("  Registration: unknown; ask the accountant.");
    expect(text).toContain("Charges with conflicting location evidence: none.");
    expect(text).toContain("Sales where we are not registered: none.");
    expect(text).toContain("Charge-backs this quarter: none.");
    expect(text).toContain("Refunds made in the xMoney dashboard, amount unknown: none.");
    expect(text).toContain("Invoices and credit notes to check by hand: none.");
    expect(text).toContain("Emails that never went out: none.");
    expect(text).toContain("Romanian e-Factura documents to confirm: none.");
    expect(text).toContain("Payments to check by hand in xMoney: none.");
  });

  it("gathers the payments to check from every list the owner must act on", async () => {
    const now = new Date("2027-01-05T06:00:00.000Z");
    const owner = "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93";
    const items = await paymentsToCheckFrom({
      deadRefunds: async () => [
        { chargeId: "7".repeat(32), transactionId: "1", reason: "WITHDRAWAL", code: "XMONEY_REFUSED", since: now },
        { chargeId: "6".repeat(32), transactionId: "2", reason: "WITHDRAWAL", code: "REFUND_OUTCOME_UNKNOWN", since: now },
        // P2-I5: a forged job's payload reason is only its claim, so the line carries none.
        { chargeId: "4".repeat(32), transactionId: "3", reason: "CARD_CHECK_RELEASE", code: "REFUND_NOT_REQUESTED", since: now },
        // P2-W4: neither reached xMoney, so neither is a refund xMoney refused. A job naming a charge we do not have is
        // no refund to make; a job of the other xMoney system is owed nothing here. Neither payload reason is verified.
        { chargeId: "3".repeat(32), transactionId: "4", reason: "WITHDRAWAL", code: "REFUND_CHARGE_MISSING", since: now },
        { chargeId: "2".repeat(32), transactionId: "5", reason: "WITHDRAWAL", code: "OTHER_XMONEY_SYSTEM", since: now }
      ],
      unrecordedRefunds: async (since) => {
        // P9c's second refunds made elsewhere, as far back as A10's refund listing reaches.
        expect(since).toEqual(new Date(now.getTime() - 120 * 86_400_000));
        return [{ transactionId: "9912345", since: now }];
      },
      withdrawalsAwaitingOwner: async () => [{ ownerRef: owner, subscriptionId: "s", planId: "PRO", since: now }],
      unfoldableSubscriptions: async () => [{ subscriptionId: "3c9d2b1a-5e4f-4a6b-8c7d-9e0f1a2b3c4d", since: now }],
      stuckRenewals: async (since) => {
        // The last 120 days: as far back as a card's charge-back or refund listing reaches (A10).
        expect(since).toEqual(new Date(now.getTime() - 120 * 86_400_000));
        return [{ chargeId: "5".repeat(32), since: now }];
      },
      longUnsettledCharges: async (kinds, createdBefore) => {
        expect(kinds).toEqual(["UPGRADE", "RENEWAL"]);
        expect(createdBefore).toEqual(new Date(now.getTime() - 30 * 86_400_000));
        return [{ chargeId: "8".repeat(32), kind: "RENEWAL", createdAt: new Date("2026-11-01T00:00:00.000Z") }];
      },
      chargelessDunning: async (since) => {
        // An ended one is listed as far back as a stuck renewal is; a PAST_DUE one while it lasts.
        expect(since).toEqual(new Date(now.getTime() - 120 * 86_400_000));
        return [
          { subscriptionId: "5b8e1f2a-3c4d-4e5f-8a6b-7c8d9e0f1a2b", ended: false, reason: "TAX_SERVICE_UNAVAILABLE", since: now },
          { subscriptionId: "6c9f2a3b-4d5e-4f6a-9b7c-8d9e0f1a2b3c", ended: true, reason: "TAX_SERVICE_UNAVAILABLE", since: now }
        ];
      },
      blockedRenewals: async (at) => {
        expect(at).toEqual(now);
        return [{ subscriptionId: "7d0a3b4c-5e6f-4a7b-8c8d-9e0f1a2b3c4d", since: new Date("2027-01-01T00:00:00.000Z") }];
      }
    }, now);
    expect(items).toEqual([
      { what: "REFUND_REFUSED", ref: "7".repeat(32), reason: "WITHDRAWAL", since: now },
      { what: "REFUND_OUTCOME_UNKNOWN", ref: "6".repeat(32), reason: "WITHDRAWAL", since: now },
      { what: "REFUND_NOT_REQUESTED", ref: "4".repeat(32), reason: null, since: now },
      { what: "REFUND_NOT_REQUESTED", ref: "3".repeat(32), reason: null, since: now },
      { what: "REFUND_OTHER_SYSTEM", ref: "2".repeat(32), reason: null, since: now },
      { what: "REFUND_UNRECORDED", ref: "9912345", reason: null, since: now },
      { what: "WITHDRAWAL_BY_OWNER", ref: owner, reason: null, since: now },
      { what: "RENEWAL_STUCK", ref: "5".repeat(32), reason: null, since: now },
      { what: "PAYMENT_UNSETTLED", ref: "8".repeat(32), reason: null, since: new Date("2026-11-01T00:00:00.000Z") },
      { what: "DUNNING_UNPRICED", ref: "5b8e1f2a-3c4d-4e5f-8a6b-7c8d9e0f1a2b", reason: "TAX_SERVICE_UNAVAILABLE", since: now },
      { what: "ENDED_UNPRICED", ref: "6c9f2a3b-4d5e-4f6a-9b7c-8d9e0f1a2b3c", reason: "TAX_SERVICE_UNAVAILABLE", since: now },
      { what: "RENEWAL_BLOCKED", ref: "7d0a3b4c-5e6f-4a7b-8c8d-9e0f1a2b3c4d", reason: null, since: new Date("2027-01-01T00:00:00.000Z") },
      { what: "SUBSCRIPTION_HISTORY_INVALID", ref: "3c9d2b1a-5e4f-4a6b-8c7d-9e0f1a2b3c4d", reason: null, since: now }
    ]);
  });
});

describe("P16b the rows it reads", () => {
  it("reads only the live xMoney system's rows: a sandbox payment is never a sale (D5's third argument)", async () => {
    const quarterSummaryRows = vi.fn(async () => [row({})]);
    expect(await liveQuarterSummaryRows({ quarterSummaryRows }, Q4.from, Q4.to)).toHaveLength(1);
    expect(quarterSummaryRows).toHaveBeenCalledWith(Q4.from, Q4.to, "live");
  });

  it("names each e-Factura document P10b lists by its printed series and number", async () => {
    const smartBillDocumentsNotAccepted = vi.fn(async () => [
      { invoiceId: "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93", chargeId: "a".repeat(32), kind: "INVOICE" as const,
        series: "DBAI", number: "0042", at, status: null },
      { invoiceId: "1c5f3b0d-7a2e-4d4f-8b8c-3e6a9f2d1b04", chargeId: "b".repeat(32), kind: "CREDIT_NOTE" as const,
        series: null, number: "0043", at, status: "REJECTED" }
    ]);
    expect(await efacturaChecksFrom({ smartBillDocumentsNotAccepted }, Q4.to)).toEqual([
      { document: "DBAI-0042", kind: "INVOICE", chargeId: "a".repeat(32), issuedAt: at, status: null },
      { document: "0043", kind: "CREDIT_NOTE", chargeId: "b".repeat(32), issuedAt: at, status: "REJECTED" }
    ]);
    expect(smartBillDocumentsNotAccepted).toHaveBeenCalledWith(Q4.to);
  });
});
