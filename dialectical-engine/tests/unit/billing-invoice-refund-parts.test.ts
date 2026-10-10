import { describe, expect, it } from "vitest";
import type { BillingRepository, ChargeEventRow, ChargeRow, InvoiceRow, OutboxJob, QuoteRow } from "@debateai/db";
import { creditNoteContext, saleRefundOf, type CreditNoteContext } from "../../apps/api/src/billing/invoice-common.js";
import { sealBillingProfile, sealQuoteLocation } from "../../apps/api/src/billing/records.js";
import { testBillingPolicy } from "../support/billingFixtures.js";

/*
 * Ruling PR-39 (spec §2.12.2 item 4, ruling PR-20): the owner may record a NETOPIA refund in parts, several REFUNDED rows
 * of one request on one payment. The credit note credits their sum, dated by the last part (the one that closed the
 * request): `saleRefundOf` reads it, and `creditNoteContext` hands that sum to Quaderno or SmartBill.
 */

const RECORDS_KEY = Buffer.alloc(32, 5);
const CHARGE_ID = "d".repeat(32);
const OWNER_REF = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const CUSTOMER_ID = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";
const QUOTE_ID = "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b";
const PAYMENT = "8812345";
const PAID_AT = new Date("2026-10-01T09:00:00.000Z");
const FIRST_PART_AT = new Date("2026-10-04T10:00:00.000Z");
const LAST_PART_AT = new Date("2026-10-06T15:30:00.000Z");

const event = (kind: ChargeEventRow["kind"], at: Date, amountMicros: number, errorCode: string | null = null): ChargeEventRow => ({
  eventId: `${kind}-${at.toISOString()}`, chargeId: CHARGE_ID, kind, at, providerPaymentId: PAYMENT, amountMicros, errorCode,
  paymentProvider: "netopia", paymentEnvironment: "sandbox", refundsTransactionId: null
});

/** A paid NETOPIA sandbox charge whose 12.10 refund request the owner recorded as 5.00, then the 7.10 that closed it. */
function refundedInParts(): ChargeRow & { events: ChargeEventRow[] } {
  return {
    chargeId: CHARGE_ID, ownerRef: OWNER_REF, subscriptionId: "4f5a6b7c-8d9e-4f0a-9b2c-3d4e5f6a7b8c", kind: "INITIAL",
    attempt: 1, periodStart: PAID_AT, periodEnd: new Date("2026-11-01T09:00:00.000Z"), quoteId: QUOTE_ID,
    netMicros: 20_000_000, taxMicros: 4_200_000, totalMicros: 24_200_000, currency: "USD", createdAt: PAID_AT,
    paymentProvider: "netopia", paymentEnvironment: "sandbox",
    events: [
      event("SUCCEEDED", PAID_AT, 24_200_000),
      event("REFUND_REQUESTED", new Date("2026-10-03T08:00:00.000Z"), 12_100_000, "WITHDRAWAL"),
      event("REFUNDED", FIRST_PART_AT, 5_000_000, "WITHDRAWAL"),
      event("REFUNDED", LAST_PART_AT, 7_100_000, "WITHDRAWAL")
    ]
  };
}

describe("PR-39 the NETOPIA credit note of a refund recorded in parts", () => {
  it("reads the parts of one payment as one BACKED refund: their sum, dated by the last part", () => {
    const charge = refundedInParts();
    const paid = charge.events[0]!;
    const sale = saleRefundOf(charge, paid, PAYMENT);
    expect(sale).toMatchObject({ kind: "BACKED", amountMicros: 12_100_000 });
    expect(sale.kind === "BACKED" ? sale.refunded.at : null).toEqual(LAST_PART_AT);
    // Control: the first part alone (before the owner recorded the rest) is that part, never the request.
    const firstOnly = { events: charge.events.slice(0, 3) };
    expect(saleRefundOf(firstOnly, paid, PAYMENT)).toMatchObject({ kind: "BACKED", amountMicros: 5_000_000 });
    // Another payment's id is not the sale's: nothing backs it.
    expect(saleRefundOf(charge, paid, "8899999")).toEqual({ kind: "MISSING" });
  });

  it("credits that sum on the credit note, dated by the last part (creditNoteContext)", async () => {
    const charge = refundedInParts();
    const location = sealQuoteLocation(RECORDS_KEY, QUOTE_ID, {
      name: "Test Subscriber", firstName: "Test", lastName: "Subscriber", phone: "+40712345678", country: "RO", region: null,
      postalCode: "010101", city: "Bucuresti", street: "Strada Exemplu 1", ip: "192.0.2.10", ipCountry: "RO", company: null
    });
    const profile = sealBillingProfile(RECORDS_KEY, CUSTOMER_ID, {
      email: "parts@example.test", locale: "en", name: "Test Subscriber", country: "RO", region: null, postalCode: "010101",
      city: "Bucuresti", street: "Strada Exemplu 1", company: null
    });
    const original = {
      invoiceId: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d", chargeId: CHARGE_ID, issuer: "SMARTBILL", kind: "INVOICE",
      externalRef: "sb-original", series: "DBAI", number: "0042", url: null, totalMicros: 24_200_000, at: PAID_AT
    } as unknown as InvoiceRow;
    const repository = {
      charge: async () => charge,
      quote: async () => ({ quoteId: QUOTE_ID, planId: "PLUS", locationCiphertext: location.ciphertext, keyId: location.keyId } as unknown as QuoteRow),
      customerByOwner: async () => ({ customerId: CUSTOMER_ID }),
      latestProfile: async () => ({ profileCiphertext: profile.ciphertext, keyId: profile.keyId }),
      invoicesForOwner: async () => [original],
      subscriptionEvents: async () => []
    } as unknown as BillingRepository;
    const job = {
      jobId: "6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e", kind: "SMARTBILL_STORNO", ref: `${CHARGE_ID}:${PAYMENT}`,
      // The job names the whole request; the credit note credits what the charge records.
      payload: { charge_id: CHARGE_ID, transaction_id: PAYMENT, refund_micros: 12_100_000 },
      createdAt: LAST_PART_AT, notBefore: LAST_PART_AT, attempts: 1, claimedBy: "w", claimedAt: LAST_PART_AT
    } as OutboxJob;
    const context = await creditNoteContext({
      repository, recordsKey: RECORDS_KEY, recipients: { currentAddress: async () => "parts@example.test" },
      policy: testBillingPolicy, publicAppUrl: "https://debate.example.test", paymentEnvironment: "sandbox", audit: () => undefined
    }, job, LAST_PART_AT, "SMARTBILL");
    expect(context).toHaveProperty("refund");
    const { refund } = context as CreditNoteContext;
    expect(refund).toMatchObject({
      chargeId: CHARGE_ID, transactionId: PAYMENT, refundTotalMicros: 12_100_000, issuedOn: LAST_PART_AT,
      original: { documentId: "sb-original", number: "0042" }, processor: "netopia"
    });
  });
});
