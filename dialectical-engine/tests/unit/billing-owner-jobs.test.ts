import { describe, expect, it, vi } from "vitest";
import type { OutboxJob, TaxSummaryRow } from "@debateai/db";
import { renderMail } from "@debateai/mail-templates";
import { TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW, taxAuthoritiesFromValue } from "@debateai/register";
import { OwnerJobs, taxSummaryJobFor } from "../../apps/api/src/billing/owner-jobs.js";
import { recordingAudit } from "../support/billingSubscriptionFixtures.js";
import { BARE_BILLING_COMMAND, ON_HOST } from "../support/runbookHostCommands.js";

const authorities = taxAuthoritiesFromValue(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value, "test");
const job = (kind: OutboxJob["kind"], ref: string): OutboxJob =>
  ({ jobId: "11111111-1111-4111-8111-111111111111", kind, ref, notBefore: new Date(0), attempts: 1, payload: {} }) as unknown as OutboxJob;

function fakes(rows: TaxSummaryRow[] = []) {
  const enqueued: Array<Readonly<{ kind: string; ref: string; payload: Readonly<Record<string, unknown>> }>> = [];
  const billing = {
    withTransaction: async <T>(work: (client: never) => Promise<T>) => work({} as never),
    enqueue: async (_client: unknown, entry: { kind: string; ref: string; payload: Readonly<Record<string, unknown>> }) => {
      enqueued.push(entry);
      return "job";
    },
    quarterSummaryRows: vi.fn(async () => rows),
    invoiceUnknownItems: async () => [],
    // W12 (P2-I16): the dead emails of the last 120 days.
    deadEmails: vi.fn(async (_since: Date) => [{
      ref: `M3:${"5".repeat(32)}`, template: "M3", recipient: "CUSTOMER", code: "OUTBOX_HANDLER_FAILED",
      since: new Date("2026-12-21T00:00:00.000Z")
    }]),
    // N9: the quarantined NETOPIA messages the summary counts by day.
    quarantineSince: vi.fn(async (_client: unknown, _since: Date) => []),
    deadRefunds: async () => [{
      chargeId: "7".repeat(32), transactionId: "1", reason: "WITHDRAWAL", code: "PAYMENT_CONFIGURATION_REFUSED",
      since: new Date("2026-12-20T00:00:00.000Z")
    }],
    withdrawalsAwaitingOwner: async () => [],
    unfoldableSubscriptions: async () => [],
    stuckRenewals: async () => [],
    longUnsettledCharges: async () => [],
    chargelessDunning: async () => [],
    blockedRenewals: async () => []
  };
  const jobs = {
    outboxJobExists: async () => false,
    // P10b's read of the quarter's SmartBill documents ANAF has not accepted.
    smartBillDocumentsNotAccepted: vi.fn(async () => [{
      invoiceId: "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93", chargeId: "a".repeat(32), kind: "INVOICE" as const,
      series: "DBAI", number: "0042", at: new Date("2026-11-03T00:05:00.000Z"), status: null
    }])
  };
  return { enqueued, billing, jobs };
}

describe("P16c the owner's tax-summary job", () => {
  it("dates the tax summary on the 5th day after each quarter", () => {
    expect(taxSummaryJobFor(new Date("2027-01-03T12:00:00.000Z"))).toMatchObject({
      kind: "OWNER_TAX_SUMMARY", ref: "tax-summary:2026-Q4", notBefore: new Date("2027-01-05T06:00:00.000Z")
    });
    expect(taxSummaryJobFor(new Date("2027-02-20T00:00:00.000Z")).ref).toBe("tax-summary:2026-Q4");
    expect(taxSummaryJobFor(new Date("2026-11-15T00:00:00.000Z"))).toMatchObject({
      ref: "tax-summary:2026-Q3", notBefore: new Date("2026-10-05T06:00:00.000Z")
    });
  });

  it("queues the quarter's summary as email O1 to the owner, in English, built from our rows and the payments to check", async () => {
    const { enqueued, billing, jobs } = fakes([{
      type: "SALE", chargeId: "a".repeat(32), at: new Date("2026-11-03T00:00:00.000Z"), taxCountry: "RO", taxRegion: null,
      taxStatus: "TAXABLE", chargeNetMicros: 20_000_000, chargeTaxMicros: 4_200_000, chargeTotalMicros: 24_200_000,
      amountMicros: 24_200_000, amountKnown: true, locationVerdict: "AGREED"
    } as TaxSummaryRow]);
    const owner = new OwnerJobs({
      billing: billing as never, jobs,
      taxAuthorities: authorities, audit: recordingAudit(), clock: () => new Date("2027-01-05T06:00:00.000Z")
    });
    expect(await owner.taxSummary(job("OWNER_TAX_SUMMARY", "tax-summary:2026-Q4"), new Date("2027-01-05T06:00:00.000Z")))
      .toEqual({ kind: "DONE" });
    // NETOPIA's live system only (a sandbox payment is never a sale), and P10b's e-Factura read of the same quarter.
    expect(billing.quarterSummaryRows).toHaveBeenCalledWith(new Date("2026-10-01T00:00:00.000Z"), new Date("2027-01-01T00:00:00.000Z"), { provider: "netopia", environment: "live" });
    expect(jobs.smartBillDocumentsNotAccepted).toHaveBeenCalledWith(new Date("2027-01-01T00:00:00.000Z"));
    const o1 = enqueued.find((entry) => entry.kind === "EMAIL");
    expect(o1).toMatchObject({ ref: "O1:2026-Q4", payload: { template: "O1", recipient: "OWNER", "param.quarter": "2026-Q4" } });
    expect(String(o1!.payload["param.summaryText"])).toContain("Romania (RO_D300)");
    expect(String(o1!.payload["param.summaryText"]))
      .toContain(`charge ${"7".repeat(32)}: REFUND_REFUSED (WITHDRAWAL), since 2026-12-20`);
    expect(String(o1!.payload["param.summaryText"]))
      .toContain(`invoice DBAI-0042 (charge ${"a".repeat(32)}), issued 2026-11-03: no status recorded`);
    expect(String(o1!.payload["param.summaryText"]))
      .toContain(`M3 (job M3:${"5".repeat(32)}): OUTBOX_HANDLER_FAILED, since 2026-12-21`);
    expect(billing.deadEmails).toHaveBeenCalledWith(new Date(new Date("2027-01-05T06:00:00.000Z").getTime() - 120 * 86_400_000));
    expect(await owner.taxSummary(job("OWNER_TAX_SUMMARY", "tax-summary:not-a-quarter"), new Date()))
      .toEqual({ kind: "DEAD", code: "BILLING_TAX_SUMMARY_USAGE" });
  });

  it("keeps O1 inside one email in a mass failure: hundreds of dead documents, emails and refunds (W12 fix I-1)", async () => {
    // A Quaderno outage over 14.6 hours, a revoked key and a relay outage at once: hundreds of lines of each list. O1
    // is one `block` param (at most 65,536 characters), so a longer text would make every send throw and O1 die.
    const { enqueued, billing, jobs } = fakes();
    const hex = (index: number): string => index.toString(16).padStart(32, "0");
    const codes = ["TAX_SERVICE_UNAVAILABLE", "TAX_SERVICE_REFUSED", "INVOICE_UNKNOWN", "INVOICE_ORIGINAL_MISSING"];
    const kinds = ["QUADERNO_RECORD_SALE", "QUADERNO_RECORD_REFUND", "SMARTBILL_INVOICE", "SMARTBILL_STORNO"];
    const mass = {
      ...billing,
      invoiceUnknownItems: async () => Array.from({ length: 400 }, (_, index) => ({
        chargeId: hex(index), jobKind: kinds[index % 4]!, code: codes[index % 4]!, since: new Date("2026-11-04T00:00:00.000Z")
      })),
      deadEmails: vi.fn(async (_since: Date) => Array.from({ length: 300 }, (_, index) => ({
        ref: `M2_INVOICE_LINK:${hex(index)}`, template: index % 2 === 0 ? "M2_INVOICE_LINK" : "M1", recipient: "CUSTOMER",
        code: "MAIL_RELAY_UNAVAILABLE", since: new Date("2026-12-21T00:00:00.000Z")
      }))),
      deadRefunds: async () => Array.from({ length: 300 }, (_, index) => ({
        chargeId: hex(index), transactionId: String(index), reason: "WITHDRAWAL", code: "PAYMENT_CONFIGURATION_REFUSED",
        since: new Date("2026-12-20T00:00:00.000Z")
      }))
    };
    const owner = new OwnerJobs({
      billing: mass as never, jobs, taxAuthorities: authorities, audit: recordingAudit(),
      clock: () => new Date("2027-01-05T06:00:00.000Z")
    });
    expect(await owner.taxSummary(job("OWNER_TAX_SUMMARY", "tax-summary:2026-Q4"), new Date("2027-01-05T06:00:00.000Z")))
      .toEqual({ kind: "DONE" });
    const text = String(enqueued.find((entry) => entry.kind === "EMAIL")!.payload["param.summaryText"]);
    expect(text.length).toBeLessThanOrEqual(60_000);
    // The mail renderer takes it: the send would not throw on the block's limit.
    expect(() => renderMail("O1", "en", { quarter: "2026-Q4", summaryText: text })).not.toThrow();
    // Each list shows its first 40 lines, then says how many more there are and where the whole list is.
    // The command is README §14.8's host form, on its own line (a bare `pnpm billing:…` fails in a root shell).
    const whole = `run the command below as root on the server for the whole list\n    ${ON_HOST} billing:tax-summary --quarter 2026-Q4\n`;
    expect(text).toContain(`  - and 360 more: ${whole}`);
    expect(text).toContain(`  - and 260 more: ${whole}`);
    expect(text).not.toMatch(BARE_BILLING_COMMAND);
    // What to do is said once per job kind and code, not on every line.
    expect(text.split("SmartBill never confirmed it").length - 1).toBe(1);
    expect(text).toContain(`charge ${hex(0)}: QUADERNO_RECORD_SALE (TAX_SERVICE_UNAVAILABLE), since 2026-11-04\n`);
    expect(text).not.toContain(`charge ${hex(40)}: QUADERNO_RECORD_SALE`);
    expect(text).toContain("Romanian e-Factura documents to confirm");
    expect(text).toContain("Payments to check by hand in NETOPIA's admin");
  });

  it("queues O1 at most once per quarter: a re-run after the quarter's O1 exists mails nobody and audits nothing", async () => {
    const { enqueued, billing, jobs } = fakes();
    const outboxJobExists = vi.fn(async (_client: unknown, kind: string, ref: string) => kind === "EMAIL" && ref === "O1:2026-Q4");
    const audit = recordingAudit();
    const owner = new OwnerJobs({
      billing: billing as never, jobs: { ...jobs, outboxJobExists },
      taxAuthorities: authorities, audit, clock: () => new Date("2027-01-05T06:00:00.000Z")
    });
    expect(await owner.taxSummary(job("OWNER_TAX_SUMMARY", "tax-summary:2026-Q4"), new Date("2027-01-05T06:00:00.000Z")))
      .toEqual({ kind: "DONE" });
    expect(outboxJobExists).toHaveBeenCalledWith(expect.anything(), "EMAIL", "O1:2026-Q4");
    expect(enqueued.filter((entry) => entry.kind === "EMAIL")).toEqual([]);
    expect(audit.events).toEqual([]);
  });
});
