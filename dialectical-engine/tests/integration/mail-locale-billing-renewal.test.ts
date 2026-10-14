import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CardPayments, HostedPaymentStart, HostedPaymentStarted, PaymentReport } from "@debateai/billing-core";
import { AcceptanceRepository, BillingJobQueries, BillingRepository, migrate, type OutboxJob } from "@debateai/db";
import { CheckoutService, type CheckoutDeps, type ConsentKind } from "../../apps/api/src/billing/checkout.js";
import { createEmailJobHandler, emailJob, type BillingMail } from "../../apps/api/src/billing/email-job.js";
import { QuoteService } from "../../apps/api/src/billing/quote.js";
import { consentDocument } from "../../apps/ui/scripts/legal-consent-manifest.mjs";
import {
  AdjustableTaxEngine, PROFILE_ADDRESS_ONLY, StubGeo, testBillingPlans, testBillingPolicy, testCountryPolicy
} from "../support/billingFixtures.js";
import { recordingAudit, TEST_PUBLIC_APP_URL, TEST_RECORDS_KEY } from "../support/billingSubscriptionFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// S01-C13 (A-6f, R-18, R-47): after a checkout in ja, the M3 renewal row (written as renewal.ts writes it: a system row,
// no language key) is sent in ja, the language the checkout stored on the billing profile. The spool half of A-6f is
// UNVERIFIED (SPEC-v3 Appendix C item 8) and is not asserted here.

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const TEXT = Object.freeze({
  CONSENT_RENEWAL: "I agree that NETOPIA Payments keeps my card and that {total} is charged to it every month until I cancel.",
  CONSENT_IMMEDIATE_START: "Start my plan now. I understand that if I withdraw within 14 days, I pay for the part already used."
});
const consents = () => ({ renewal: consentDocument(TEXT.CONSENT_RENEWAL), immediateStart: consentDocument(TEXT.CONSENT_IMMEDIATE_START) });

/** The port: a start opens a page; nothing is paid in this suite, so no status is ever read. */
class OpenPagePayments implements CardPayments {
  readonly provider = "netopia" as const;
  readonly environment = "sandbox" as const;
  async startHostedPayment(input: HostedPaymentStart): Promise<HostedPaymentStarted> {
    return Object.freeze({
      providerPaymentId: `ntp-${input.orderId.slice(0, 12)}`, redirectUrl: `https://secure-sandbox.netopia-payments.com/ui/card?p=${input.orderId.slice(0, 12)}`
    });
  }
  async chargeSavedCard(): Promise<PaymentReport> { throw new Error("NOT_IN_THIS_SUITE"); }
  async status(): Promise<PaymentReport | "NO_SUCH_ORDER"> { return "NO_SUCH_ORDER"; }
}

/** A checkout in `locale` through CheckoutService.start, as the API runs it. */
async function checkoutIn(locale: string, now: Date) {
  const repository = new BillingRepository(database.pool);
  const jobs = new BillingJobQueries(database.pool);
  const audit = recordingAudit();
  const geo = new StubGeo();
  geo.country = "RO";
  const quotes = new QuoteService({
    repository, tax: new AdjustableTaxEngine(), geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy,
    plans: testBillingPlans, recordsKey: TEST_RECORDS_KEY, audit
  });
  const deps: CheckoutDeps = {
    repository, jobs, acceptances: new AcceptanceRepository(database.pool), payments: new OpenPagePayments(),
    accountEmail: { read: async () => "buyer@example.test" }, geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy,
    consentDocuments: (kind: ConsentKind) => consentDocument(TEXT[kind]), recordsKey: TEST_RECORDS_KEY,
    publicAppUrl: TEST_PUBLIC_APP_URL, audit, kick: () => undefined
  };
  const ownerRef = randomUUID();
  const { quote } = await quotes.create({
    ownerRef, ip: "198.51.100.7", planId: "PLUS", country: "RO", name: null, firstName: "Ana", lastName: "Pop",
    phone: "+40 712 345 678", street: "Strada Memorandumului 1", region: "Cluj", postalCode: "400001", city: "Cluj-Napoca",
    company: null, now
  });
  await new CheckoutService(deps).start({
    ownerRef, userId: randomUUID(), ip: "198.51.100.7", userAgent: "s01-c13", quoteRef: quote.quoteId, locale,
    consents: consents(), countryConfirmed: false, now
  });
  const subscription = (await repository.subscriptionForOwner(ownerRef))!;
  const customer = (await repository.customerByOwner(ownerRef))!;
  return { repository, subscription, customerId: customer.customerId };
}

describe("S01-C13 A-6f: the billing renewal mail after a checkout in ja (DB half)", () => {
  it("the M3 renewal row is sent in ja, the language the checkout stored, with no language key of its own", async () => {
    const now = new Date();
    const { repository, subscription, customerId } = await checkoutIn("ja", now);
    const request = emailJob({
      template: "M3", recipient: { kind: "CUSTOMER", customerId }, dedupeRef: `${subscription.subscriptionId}:renewal`,
      params: { plan: "PLUS", totalAmount: "24.20", currency: "USD", cancelPageUrl: `${TEST_PUBLIC_APP_URL}/cancel` },
      notBefore: now
    });
    await repository.withTransaction((client) => repository.enqueue(client, request));
    const row = (await database.pool.query<{ job_id: string; ref: string; payload: Record<string, unknown>; not_before: Date }>(
      "SELECT job_id, ref, payload, not_before FROM billing.outbox WHERE kind = 'EMAIL' AND ref = $1", [request.ref]
    )).rows[0]!;
    expect(row.payload).not.toHaveProperty("locale");
    const sent: BillingMail[] = [];
    const handler = createEmailJobHandler({
      repository, recipients: PROFILE_ADDRESS_ONLY, recordsKey: TEST_RECORDS_KEY, ownerReportEmail: "owner@example.test",
      mail: { sendTemplated: async (mail) => { sent.push(mail); } }, attachments: new Map()
    });
    const job = { jobId: row.job_id, kind: "EMAIL", ref: row.ref, notBefore: row.not_before, attempts: 1, payload: row.payload } as unknown as OutboxJob;
    expect(await handler(job, now)).toEqual({ kind: "DONE" });
    expect(sent).toEqual([expect.objectContaining({ templateId: "M3", locale: "ja" })]);
  });
});
