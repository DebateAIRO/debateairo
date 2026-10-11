import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription, microsToDecimal, type PriceCurrency, type SaleRecord } from "@debateai/billing-core";
import { SmartBillInvoiceIssuer } from "@debateai/invoice-smartbill";
import { TypedDomainError } from "@debateai/kernel";
import { renderMail } from "@debateai/mail-templates";
import type { BillingPlans } from "@debateai/register";
import { createQuadernoSaleHandler } from "../../apps/api/src/billing/invoice-quaderno.js";
import { createSmartBillInvoiceHandler, type SmartBillPort } from "../../apps/api/src/billing/invoice-smartbill.js";
import { scheduleDowngrade } from "../../apps/api/src/billing/subscription-actions.js";
import { quoteUpgrade } from "../../apps/api/src/billing/upgrade.js";
import { PROFILE_ADDRESS_ONLY, testBillingPolicy, testRegionalPlans } from "../support/billingFixtures.js";
import { startBillingHarness, TEST_PUBLIC_APP_URL, type BillingHarness } from "../support/billingHarness.js";
import { subscriptionDeps } from "../support/billingSubscriptionFixtures.js";
import { fakeTaxMicros } from "../support/fake-tax-engine.js";

/**
 * Part C end to end (spec 2026-10-05 §2.16 and §2.20.2, ruling PR-60): one register version sells RON, EUR and USD at
 * once, by the buyer's tax country, and a subscription keeps its currency for good. Three buyers go through one price
 * list (`testRegionalPlans`, the engine's prices and region rule) on N24's harness: the quote, the charge, NETOPIA's
 * page, the invoice (SmartBill in RON with no exchange rate, Quaderno in EUR and USD), the emails, the renewal on the
 * saved card, a plan change, and a later rule that moves Germany to USD. The cases share one harness and one clock, so
 * their order matters: cases 2 to 4 follow case 1's three subscriptions; cases 5 and 6 activate their own.
 */
const MINUTE = 60_000;
const BUYER_IP = "198.51.100.7";

type Buyer = Readonly<{
  country: "RO" | "DE" | "US"; postalCode: string; region?: string; currency: PriceCurrency;
  /** Plus's net in the buyer's currency, and the fake tax engine's rate there (New York: not registered, 0). */
  plusNetMicros: number; taxBasisPoints: number;
  /** The language the buyer's emails are checked in. */
  locale: "ro" | "de" | "en";
}>;

const ROMANIAN: Buyer = Object.freeze({
  country: "RO", postalCode: "010011", region: "Bucuresti", currency: "RON", plusNetMicros: 100_000_000, taxBasisPoints: 2_100, locale: "ro"
});
const GERMAN: Buyer = Object.freeze({
  country: "DE", postalCode: "10115", currency: "EUR", plusNetMicros: 20_000_000, taxBasisPoints: 1_900, locale: "de"
});
const AMERICAN: Buyer = Object.freeze({
  country: "US", postalCode: "10001", currency: "USD", plusNetMicros: 20_000_000, taxBasisPoints: 0, locale: "en"
});
const BUYERS = [ROMANIAN, GERMAN, AMERICAN] as const;

/** A net plus the fake engine's tax on it, as the quote prices it. */
const grossOf = (netMicros: number, basisPoints: number): number =>
  netMicros + (basisPoints === 0 ? 0 : fakeTaxMicros(netMicros, basisPoints));
const plusTotalOf = (buyer: Buyer): number => grossOf(buyer.plusNetMicros, buyer.taxBasisPoints);

/**
 * SmartBill as P5's real client speaks it, over a recording `fetch`: `issue` goes through
 * `packages/invoice-smartbill`'s request builder (so the document's own `currency` is what this suite reads) and is
 * answered with a numbered document; `storno` is refused; `pdf` answers a few bytes. `issued` holds the sales handed to
 * the port, `documents` the request bodies SmartBill would have received.
 */
class RecordingSmartBill {
  readonly issued: SaleRecord[] = [];
  readonly documents: Array<Readonly<Record<string, unknown>>> = [];
  #counter = 0;
  readonly #issuer = new SmartBillInvoiceIssuer({
    // Built from pieces: never a key-like literal.
    baseUrl: "https://smartbill.test/SBORO/api", username: "billing@example.test", token: ["recording", "only"].join("-"),
    companyCif: "RO1234567", series: "DBAI", minGapMs: 0,
    fetch: (async (_input: unknown, init?: RequestInit) => {
      this.documents.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      this.#counter += 1;
      return new Response(JSON.stringify({ errorText: "", series: "DBAI", number: String(this.#counter).padStart(4, "0") }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }) as typeof fetch
  });

  port(): SmartBillPort {
    return {
      issue: async (sale) => {
        this.issued.push(sale);
        return this.#issuer.issue(sale);
      },
      storno: async () => { throw new TypedDomainError("INVOICE_SERVICE_REFUSED", "the recording SmartBill issues no storno"); },
      pdf: async ({ series, number }) => Buffer.from(`%PDF ${series} ${number}`)
    };
  }

  /** The request body of this charge's invoice (the client writes our charge id into `mentions`). */
  documentsFor(chargeId: string): Array<Readonly<Record<string, unknown>>> {
    return this.documents.filter((document) => document.mentions === `debateai-charge:${chargeId}`);
  }
}

let h: BillingHarness;
let smartbill: RecordingSmartBill;
beforeAll(async () => {
  h = await startBillingHarness();
  smartbill = new RecordingSmartBill();
  const invoiceDeps = {
    repository: h.repository, recordsKey: h.recordsKey, recipients: PROFILE_ADDRESS_ONLY, policy: testBillingPolicy,
    publicAppUrl: TEST_PUBLIC_APP_URL, audit: h.audit, paymentEnvironment: "sandbox" as const
  };
  h.worker.register("QUADERNO_RECORD_SALE", createQuadernoSaleHandler({ ...invoiceDeps, tax: h.tax }));
  h.worker.register("SMARTBILL_INVOICE", createSmartBillInvoiceHandler({ ...invoiceDeps, jobs: h.jobs, issuer: smartbill.port() }));
}, 600_000);
afterAll(async () => { await h?.stop(); });

type Sold = Awaited<ReturnType<typeof subscribe>>;

/**
 * The buyer's checkout under the regional price list, paid on NETOPIA's page with the card saved, verified, and the
 * document jobs run. `quotedCurrencies`: what the tax engine was asked in during the purchase.
 */
async function subscribe(buyer: Buyer, planId: "PLUS" | "MAX" = "PLUS") {
  h.geo.country = buyer.country;
  const asked = h.tax.quotedCurrencies.length;
  const paid = await h.activate({
    country: buyer.country, postalCode: buyer.postalCode, ...(buyer.region === undefined ? {} : { region: buyer.region }),
    planId, plans: testRegionalPlans, cardCountry: buyer.country
  });
  const quotedCurrencies = h.tax.quotedCurrencies.slice(asked);
  // The saved card's renewals are reported from the buyer's own country.
  h.payments.cardCountryFor(paid.subscriptionId, buyer.country);
  await h.worker.drain(20);
  return { ...paid, buyer, quotedCurrencies };
}

const chargesOfKind = async (subscriptionId: string, kind: "INITIAL" | "RENEWAL") =>
  (await h.repository.chargesForSubscription(subscriptionId)).filter((charge) => charge.kind === kind);
const payerAddress = (sold: Sold): string => `buyer-${sold.userId.slice(0, 8)}@example.test`;
const formatted = (locale: string, currency: PriceCurrency, micros: number): string =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(microsToDecimal(micros)));

/** Case 1's three subscriptions, in BUYERS' order. */
const sold: Sold[] = [];

describe("RON, EUR and USD end to end under one price list (Part C)", () => {
  it("sells one price list in three currencies at once, by the buyer's tax country", async () => {
    for (const buyer of BUYERS) sold.push(await subscribe(buyer));
    for (const sale of sold) {
      const { currency } = sale.buyer;
      const total = plusTotalOf(sale.buyer);
      const quote = await h.repository.quote(sale.quoteId, sale.ownerRef);
      expect(quote, currency).toMatchObject({ kind: "SUBSCRIBE", currency, netMicros: sale.buyer.plusNetMicros, totalMicros: total });
      const initial = await chargesOfKind(sale.subscriptionId, "INITIAL");
      expect(initial, currency).toEqual([expect.objectContaining({ chargeId: sale.chargeId, currency, totalMicros: total })]);
      expect(h.payments.hosted.filter((start) => start.orderId === sale.chargeId), currency).toEqual([
        expect.objectContaining({ currency, amountMicros: total })
      ]);
      const events = await h.repository.subscriptionEvents(sale.subscriptionId);
      expect(foldSubscription(events), currency).toMatchObject({ status: "ACTIVE", currency });
      expect(events.find((event) => event.kind === "CREATED")?.data, currency).toMatchObject({ currency });
      expect(sale.quotedCurrencies, currency).toEqual([currency]);
    }
  });

  it("invoices each sale in its own currency: SmartBill in RON with no exchange rate, Quaderno in EUR and USD", async () => {
    const [romanian, german, american] = sold as [Sold, Sold, Sold];
    // Romania: one SmartBill invoice, the sale and the document both in RON, with no exchange rate sent.
    expect(smartbill.issued.filter((sale) => sale.chargeId === romanian.chargeId)).toEqual([expect.objectContaining({
      currency: "RON", lines: [expect.objectContaining({ netMicros: 100_000_000, taxMicros: 21_000_000, taxRateBasisPoints: 2_100 })]
    })]);
    const documents = smartbill.documentsFor(romanian.chargeId);
    expect(documents).toEqual([expect.objectContaining({
      currency: "RON", products: [expect.objectContaining({ currency: "RON", price: 121 })]
    })]);
    expect(documents[0]).not.toHaveProperty("exchangeRate");
    expect(h.tax.sales.filter((sale) => sale.chargeId === romanian.chargeId)).toEqual([]);
    // Germany and the US: Quaderno records in EUR and USD, and nothing at SmartBill.
    for (const [sale, currency] of [[german, "EUR"], [american, "USD"]] as const) {
      expect(h.tax.sales.filter((recorded) => recorded.chargeId === sale.chargeId), currency).toEqual([
        expect.objectContaining({ currency })
      ]);
      expect(smartbill.issued.filter((issued) => issued.chargeId === sale.chargeId), currency).toEqual([]);
    }
  });

  it("mails each buyer in their own currency", async () => {
    await h.mail.drain();
    for (const sale of sold) {
      const { currency, locale } = sale.buyer;
      const mails = h.mail.sent.filter((mail) => mail.to === payerAddress(sale));
      const m1 = mails.find((mail) => mail.templateId === "M1");
      expect(m1?.params.currency, currency).toBe(currency);
      expect(renderMail("M1", locale, m1!.params).text, currency).toContain(formatted(locale, currency, plusTotalOf(sale.buyer)));
      const m2Template = sale.buyer.country === "RO" ? "M2_INVOICE_ATTACHED" : "M2_INVOICE_LINK";
      expect(mails.find((mail) => mail.templateId === m2Template)?.params.currency, currency).toBe(currency);
    }
  });

  it("renews each subscription with the saved card in its own currency, at its own price", async () => {
    const ends = await Promise.all(sold.map((sale) => h.periodEndOf(sale.subscriptionId)));
    h.clock.now = new Date(Math.max(...ends.map((end) => end.getTime())) + MINUTE);
    for (const sale of sold) expect(await h.renewal.renew(sale.subscriptionId), sale.buyer.currency).toBe("charged");
    const renewals = new Map<string, string>();
    for (const sale of sold) {
      const { currency } = sale.buyer;
      const total = plusTotalOf(sale.buyer);
      const [renewal, ...more] = await chargesOfKind(sale.subscriptionId, "RENEWAL");
      expect(more, currency).toEqual([]);
      expect(renewal, currency).toMatchObject({ currency, netMicros: sale.buyer.plusNetMicros, totalMicros: total });
      expect(await h.repository.quote(renewal!.quoteId!, sale.ownerRef), currency).toMatchObject({ kind: "RENEWAL", currency });
      expect(h.payments.charges.filter((charge) => charge.orderId === renewal!.chargeId), currency).toEqual([
        expect.objectContaining({ currency, amountMicros: total })
      ]);
      renewals.set(sale.subscriptionId, renewal!.chargeId);
    }
    await h.worker.drain(30);
    for (const sale of sold) {
      const { currency } = sale.buyer;
      const chargeId = renewals.get(sale.subscriptionId)!;
      expect((await h.repository.subscriptionEvents(sale.subscriptionId)).map((event) => event.kind), currency).toContain("RENEWED");
      if (sale.buyer.country === "RO") {
        expect(smartbill.issued.filter((issued) => issued.chargeId === chargeId)).toEqual([expect.objectContaining({ currency: "RON" })]);
        expect(smartbill.documentsFor(chargeId)).toEqual([expect.objectContaining({ currency: "RON" })]);
      } else {
        expect(h.tax.sales.filter((recorded) => recorded.chargeId === chargeId), currency).toEqual([expect.objectContaining({ currency })]);
        expect(smartbill.issued.filter((issued) => issued.chargeId === chargeId), currency).toEqual([]);
      }
    }
  });

  it("keeps a subscription's currency for good after the owner changes the rule", async () => {
    // A later register version: Germany now pays in USD. Only new checkouts follow it.
    const changed: BillingPlans = Object.freeze({
      ...testRegionalPlans,
      sourceRef: "test:billing-plans-regional-de-usd",
      currencyByCountry: Object.freeze({
        ...testRegionalPlans.currencyByCountry,
        countries: Object.freeze({ ...testRegionalPlans.currencyByCountry.countries, DE: "USD" as const })
      })
    }) as BillingPlans;
    const german = await subscribe(GERMAN);
    expect(foldSubscription(await h.repository.subscriptionEvents(german.subscriptionId))).toMatchObject({ status: "ACTIVE", currency: "EUR" });

    const deps = subscriptionDeps(h.database.pool, {
      billing: h.repository, plans: changed, tax: h.tax, recordsKey: h.recordsKey, clock: h.clock.read
    });
    const asked = h.tax.quotedCurrencies.length;
    const upgrade = await quoteUpgrade(deps, { ownerRef: german.ownerRef, planId: "PRO", ip: BUYER_IP, now: h.clock.now });
    // PRO's EUR price (50.00) with Germany's 19 %, and the prorated part asked in EUR too.
    expect(upgrade).toMatchObject({ currency: "EUR", recurring_total: microsToDecimal(grossOf(50_000_000, 1_900)) });
    expect(h.tax.quotedCurrencies.slice(asked)).toEqual(["EUR", "EUR"]);
    expect(await h.repository.quote(upgrade.quote_ref, german.ownerRef)).toMatchObject({ kind: "UPGRADE", currency: "EUR" });

    h.clock.now = new Date((await h.periodEndOf(german.subscriptionId)).getTime() + MINUTE);
    expect(await h.renewalWith({ plans: changed }).renew(german.subscriptionId)).toBe("charged");
    const [renewal, ...more] = await chargesOfKind(german.subscriptionId, "RENEWAL");
    expect(more).toEqual([]);
    expect(renewal).toMatchObject({ currency: "EUR", netMicros: 20_000_000, totalMicros: plusTotalOf(GERMAN) });
    expect(h.payments.charges.filter((charge) => charge.orderId === renewal!.chargeId)).toEqual([
      expect.objectContaining({ currency: "EUR", amountMicros: plusTotalOf(GERMAN) })
    ]);

    // A new German buyer under the changed rule is quoted in USD, at Plus's USD price.
    h.geo.country = "DE";
    const ownerRef = randomUUID();
    const quoted = await h.quotesWith(changed).create({
      ownerRef, ip: BUYER_IP, planId: "PLUS", country: "DE", name: null, firstName: "Test", lastName: "Buyer",
      phone: "+40712345678", street: "Strada Test 1", region: null, postalCode: GERMAN.postalCode, city: "Berlin",
      company: null, now: h.clock.now
    });
    expect(await h.repository.quote(quoted.quote.quoteId, ownerRef)).toMatchObject({
      kind: "SUBSCRIBE", currency: "USD", netMicros: 20_000_000
    });
    expect(h.tax.quotedCurrencies.at(-1)).toBe("USD");
  });

  it("changes plans inside the subscription's own currency", async () => {
    const deps = subscriptionDeps(h.database.pool, {
      billing: h.repository, plans: testRegionalPlans, tax: h.tax, recordsKey: h.recordsKey, clock: h.clock.read
    });
    const max = await subscribe(ROMANIAN, "MAX");
    expect(await chargesOfKind(max.subscriptionId, "INITIAL")).toEqual([
      expect.objectContaining({ currency: "RON", netMicros: 1_000_000_000 })
    ]);
    await scheduleDowngrade(deps, max.ownerRef, "PRO");
    const scheduled = (await h.repository.subscriptionEvents(max.subscriptionId)).find((event) => event.kind === "DOWNGRADE_SCHEDULED");
    expect(scheduled?.data).toMatchObject({ recurring_net_micros: 250_000_000 });
    expect(h.tax.quotedCurrencies.at(-1)).toBe("RON");

    // A Romanian Plus subscription of this case's own (case 5 moved the clock past case 1's periods).
    const plus = await subscribe(ROMANIAN);
    const asked = h.tax.quotedCurrencies.length;
    const upgrade = await quoteUpgrade(deps, { ownerRef: plus.ownerRef, planId: "PRO", ip: BUYER_IP, now: h.clock.now });
    // PRO's 250.00 RON with Romania's 21 %.
    expect(upgrade).toMatchObject({ currency: "RON", recurring_total: microsToDecimal(grossOf(250_000_000, 2_100)) });
    expect(h.tax.quotedCurrencies.slice(asked)).toEqual(["RON", "RON"]);
  });

  it("refuses a NETOPIA answer in another currency than the charge's", async () => {
    h.geo.country = "DE";
    const bought = await h.buy({ country: "DE", postalCode: GERMAN.postalCode, plans: testRegionalPlans });
    const charge = await h.repository.charge(bought.chargeId);
    expect(charge).toMatchObject({ kind: "INITIAL", currency: "EUR", totalMicros: plusTotalOf(GERMAN) });
    expect(h.payments.hosted.filter((start) => start.orderId === bought.chargeId)).toEqual([
      expect.objectContaining({ currency: "EUR", amountMicros: plusTotalOf(GERMAN) })
    ]);
    // The start stored NETOPIA's report of the order; it now says PAID, for the right amount, in USD.
    h.payments.setState(bought.chargeId, "PAID", { currency: "USD" });
    await h.settle(bought.chargeId);
    const verify = (await h.outboxRows(bought.chargeId)).filter((row) => row.kind === "VERIFY_PAYMENT");
    expect(verify).toEqual([expect.objectContaining({ dead: true, lastErrorCode: "PAYMENT_AMOUNT_MISMATCH" })]);
    const events = await h.repository.subscriptionEvents(bought.subscriptionId);
    expect(events.map((event) => event.kind)).not.toContain("ACTIVATED");
    expect(foldSubscription(events).status).toBe("CREATED");
  });
});
