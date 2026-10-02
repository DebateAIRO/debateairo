import { describe, expect, it, vi } from "vitest";
import type { OutboxJob, TaxSummaryRow } from "@debateai/db";
import { TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW, taxAuthoritiesFromValue } from "@debateai/register";
import { OwnerJobs, taxSummaryJobFor } from "../../apps/api/src/billing/owner-jobs.js";
import { recordingAudit } from "../support/billingSubscriptionFixtures.js";

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
    deadRefunds: async () => [{
      chargeId: "7".repeat(32), transactionId: "1", reason: "WITHDRAWAL", code: "XMONEY_REFUSED",
      since: new Date("2026-12-20T00:00:00.000Z")
    }],
    unrecordedRefunds: async () => [],
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
    // The live xMoney system only (a sandbox payment is never a sale), and P10b's e-Factura read of the same quarter.
    expect(billing.quarterSummaryRows).toHaveBeenCalledWith(new Date("2026-10-01T00:00:00.000Z"), new Date("2027-01-01T00:00:00.000Z"), "live");
    expect(jobs.smartBillDocumentsNotAccepted).toHaveBeenCalledWith(new Date("2026-10-01T00:00:00.000Z"), new Date("2027-01-01T00:00:00.000Z"));
    const o1 = enqueued.find((entry) => entry.kind === "EMAIL");
    expect(o1).toMatchObject({ ref: "O1:2026-Q4", payload: { template: "O1", recipient: "OWNER", "param.quarter": "2026-Q4" } });
    expect(String(o1!.payload["param.summaryText"])).toContain("Romania (RO_D300)");
    expect(String(o1!.payload["param.summaryText"]))
      .toContain(`charge ${"7".repeat(32)}: REFUND_REFUSED (WITHDRAWAL), since 2026-12-20`);
    expect(String(o1!.payload["param.summaryText"]))
      .toContain(`invoice DBAI-0042 (charge ${"a".repeat(32)}), issued 2026-11-03: no status recorded`);
    expect(await owner.taxSummary(job("OWNER_TAX_SUMMARY", "tax-summary:not-a-quarter"), new Date()))
      .toEqual({ kind: "DEAD", code: "BILLING_TAX_SUMMARY_USAGE" });
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
