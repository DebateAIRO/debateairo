import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SELLER_COMPANY } from "@debateai/billing-core";
import { AcceptanceRepository, BillingJobQueries, BillingRepository, createPool } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { signOrderPayload, XMoneyClient } from "@debateai/payments-xmoney";
import { inFlightAttemptLifeMs, type CheckoutInput } from "../../apps/api/src/billing/checkout.js";
import { englishOrderText, planName, type BillingOrderText } from "../../apps/api/src/billing/order-text.js";
import { openBillingProfile } from "../../apps/api/src/billing/records.js";
import { activeSubscriptionEvents } from "../support/billingFixtures.js";
import {
  endPoolWithin, startBillingHarness, testConsentDocuments, within, type BillingHarness
} from "../support/billingHarness.js";
import { startFakeXMoney } from "../support/fake-xmoney.js";

let h: BillingHarness;
beforeAll(async () => { h = await startBillingHarness(); });
afterAll(async () => { await h?.stop(); });
beforeEach(() => { h.geo.country = "RO"; h.geo.tor = false; });

const consents = () => ({
  renewal: testConsentDocuments("CONSENT_RENEWAL", "en")!, immediateStart: testConsentDocuments("CONSENT_IMMEDIATE_START", "en")!
});
const quoteFor = (ownerRef: string, address: Readonly<{ name: string | null; city: string | null }> = { name: "Test Buyer", city: "Bucuresti" }) => h.quotes.create({
  ownerRef, ip: "198.51.100.7", planId: "PLUS", country: "RO", region: "B", postalCode: null, company: null, now: h.clock.now,
  ...address
});
const startWith = (ownerRef: string, quoteRef: string, overrides: Partial<CheckoutInput> = {}) =>
  h.checkoutWith({}).start({
    ownerRef, userId: randomUUID(), ip: "198.51.100.7", userAgent: "test", quoteRef, locale: "en", consents: consents(),
    countryConfirmed: false, now: h.clock.now, ...overrides
  });

describe("P8c the checkout", () => {
  it("records both consents, the customer, the profile, CREATED and an INITIAL charge, and signs the order", async () => {
    const bought = await h.buy();
    const acceptance = await h.database.pool.query(
      "SELECT kind, surface, document_sha256 FROM legal.acceptance WHERE owner_ref=$1 ORDER BY kind", [bought.ownerRef]
    );
    expect(acceptance.rows).toEqual([
      { kind: "IMMEDIATE_START", surface: "CHECKOUT", document_sha256: consents().immediateStart.sha256 },
      { kind: "RENEWAL_TERMS", surface: "CHECKOUT", document_sha256: consents().renewal.sha256 }
    ]);
    const used = await h.database.pool.query("SELECT charge_id FROM billing.quote_use WHERE quote_id=$1", [bought.quoteId]);
    expect(used.rows).toEqual([{ charge_id: bought.chargeId }]);
    expect((await h.repository.subscriptionEvents(bought.subscriptionId)).map((event) => event.kind)).toEqual(["CREATED"]);
    const charge = await h.repository.charge(bought.chargeId);
    expect(charge).toMatchObject({ kind: "INITIAL", attempt: 1, totalMicros: 24_200_000, quoteId: bought.quoteId, xmoneyEnvironment: "stage" });
    expect(charge!.events.map((event) => event.kind)).toEqual(["REQUESTED"]);
    const customer = await h.repository.customerByOwner(bought.ownerRef);
    const profile = await h.repository.latestProfile(customer!.customerId);
    expect(openBillingProfile(h.recordsKey, customer!.customerId, profile!.profileCiphertext))
      .toMatchObject({ email: `buyer-${bought.userId.slice(0, 8)}@example.test`, locale: "en", country: "RO", name: "Test Buyer", city: "Bucuresti", region: "B" });
    const order = JSON.parse(Buffer.from(bought.orderPayload, "base64").toString("utf8")) as Parameters<typeof signOrderPayload>[0];
    expect(order).toMatchObject({
      publicKey: "pk_test_harness", siteId: "site-test", saveCard: true, cardTransactionMode: "authAndCapture",
      customer: { identifier: customer!.customerId, country: "RO" },
      order: { orderId: bought.chargeId, type: "managed", amount: "24.20", currency: "USD", description: "DebateAI Plus monthly plan" },
      backUrl: `https://dezbatere.test/checkout/return?charge=${bought.chargeId}`
    });
    expect(bought.orderChecksum).toBe(signOrderPayload(order, h.xmoneyPrivateKey).checksum);
    expect(bought.orderChecksum).not.toBe(signOrderPayload(order, randomBytes(32)).checksum);
  });

  it("returns the same charge for a second checkout within 30 minutes, and abandons an older one", async () => {
    const ownerRef = randomUUID();
    const first = await h.buy({ ownerRef });
    const again = await h.buy({ ownerRef });
    expect([again.chargeId, again.reused]).toEqual([first.chargeId, true]);
    expect(await h.repository.chargesForSubscription(first.subscriptionId)).toHaveLength(1);
    const secondQuoteUse = await h.database.pool.query("SELECT 1 FROM billing.quote_use WHERE quote_id=$1", [again.quoteId]);
    expect(secondQuoteUse.rowCount).toBe(0);
    // Spec §2.5.3 step 2, §2.3: the reused checkout's consents are recorded too.
    const acceptances = await h.database.pool.query("SELECT kind FROM legal.acceptance WHERE owner_ref=$1 ORDER BY kind", [ownerRef]);
    expect(acceptances.rows.map((row: { kind: string }) => row.kind))
      .toEqual(["IMMEDIATE_START", "IMMEDIATE_START", "RENEWAL_TERMS", "RENEWAL_TERMS"]);
    h.clock.advance(31 * 60_000);
    const later = await h.buy({ ownerRef });
    expect(later.chargeId).not.toBe(first.chargeId);
    const ended = (await h.repository.subscriptionEvents(first.subscriptionId)).at(-1);
    expect(ended).toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED" } });
  });

  it("makes a new charge, from the new quote, when the buyer's details changed within 30 minutes (A3(b))", async () => {
    const ownerRef = randomUUID();
    const first = await h.buy({ ownerRef });
    const moved = await quoteFor(ownerRef, { name: "Test Buyer", city: "Cluj-Napoca" });
    const again = await startWith(ownerRef, moved.quote.quoteId);
    expect(again.reused).toBe(false);
    expect(again.chargeId).not.toBe(first.chargeId);
    expect(await h.repository.charge(again.chargeId)).toMatchObject({ quoteId: moved.quote.quoteId });
    expect((await h.repository.subscriptionEvents(first.subscriptionId)).at(-1))
      .toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED", reason: "NEW_CHECKOUT" } });
    const customer = await h.repository.customerByOwner(ownerRef);
    const profile = await h.repository.latestProfile(customer!.customerId);
    expect(openBillingProfile(h.recordsKey, customer!.customerId, profile!.profileCiphertext)).toMatchObject({ city: "Cluj-Napoca" });
  });

  it("makes one charge for two concurrent checkouts by one owner, and one xMoney customer", async () => {
    const ownerRef = randomUUID();
    const customersBefore = h.xmoney.customers;
    const [a, b] = await Promise.all([h.buy({ ownerRef }), h.buy({ ownerRef })]);
    expect(a.chargeId).toBe(b.chargeId);
    expect([a.reused, b.reused].sort()).toEqual([false, true]);
    expect(h.xmoney.customers - customersBefore).toBe(1);
  });

  it("refuses a stale consent, an unconfirmed country, an expired quote and a live subscription, writing nothing", async () => {
    const ownerRef = randomUUID();
    const quoted = await quoteFor(ownerRef);
    await expect(startWith(ownerRef, quoted.quote.quoteId, {
      consents: { ...consents(), renewal: { version: "sha256-000000000000", sha256: "0".repeat(64) } }
    })).rejects.toMatchObject({ status: 409, code: "LEGAL_DOCUMENT_STALE" });
    h.geo.country = "DE";
    await expect(startWith(ownerRef, quoted.quote.quoteId)).rejects.toMatchObject({ status: 409, code: "COUNTRY_CONFIRMATION_REQUIRED" });
    h.geo.country = "RO";
    expect(await h.repository.subscriptionForOwner(ownerRef)).toBeNull();
    h.clock.advance(1_801_000);
    await expect(startWith(ownerRef, quoted.quote.quoteId)).rejects.toMatchObject({ status: 409, code: "QUOTE_EXPIRED" });
    const liveOwner = randomUUID();
    const liveQuote = await quoteFor(liveOwner);
    await h.repository.withTransaction(async (client) => {
      for (const event of activeSubscriptionEvents(liveOwner, h.clock.now)) await h.repository.appendSubscriptionEvent(client, event);
    });
    await expect(startWith(liveOwner, liveQuote.quote.quoteId)).rejects.toMatchObject({ status: 409, code: "ALREADY_SUBSCRIBED" });
  });

  it("refuses a Romanian checkout without the buyer's name and city (R-15)", async () => {
    const ownerRef = randomUUID();
    const quoted = await quoteFor(ownerRef, { name: null, city: null });
    await expect(startWith(ownerRef, quoted.quote.quoteId)).rejects.toMatchObject({ status: 422, code: "BILLING_ADDRESS_REQUIRED" });
    expect(await h.repository.subscriptionForOwner(ownerRef)).toBeNull();
  });

  it("keeps a confirmed country on CREATED so the card country is weighed later", async () => {
    h.geo.country = "DE";
    const bought = await h.buy({ countryConfirmed: true });
    const [created] = await h.repository.subscriptionEvents(bought.subscriptionId);
    expect(created?.data).toMatchObject({ country_confirmed: true, ip_country: "DE" });
  });

  it("answers PAYMENT_PROVIDER_UNAVAILABLE when xMoney cannot create the customer, and rolls everything back", async () => {
    const ownerRef = randomUUID();
    const quoted = await quoteFor(ownerRef);
    const down = h.checkoutWith({ xmoney: {
      createCustomer: async () => { throw new TypedDomainError("XMONEY_UNAVAILABLE", "down"); }, listTransactions: async () => [],
      getOrder: async () => { throw new TypedDomainError("XMONEY_UNAVAILABLE", "down"); }
    } });
    await expect(down.start({
      ownerRef, userId: randomUUID(), ip: "198.51.100.7", userAgent: "test", quoteRef: quoted.quote.quoteId, locale: "en",
      consents: consents(), countryConfirmed: false, now: h.clock.now
    })).rejects.toMatchObject({ status: 503, code: "PAYMENT_PROVIDER_UNAVAILABLE" });
    expect(await h.repository.subscriptionForOwner(ownerRef)).toBeNull();
    expect((await h.database.pool.query("SELECT 1 FROM billing.quote_use WHERE quote_id=$1", [quoted.quote.quoteId])).rowCount).toBe(0);
    expect((await h.database.pool.query("SELECT 1 FROM legal.acceptance WHERE owner_ref=$1", [ownerRef])).rowCount).toBe(0);
  });

  it("creates a fresh xMoney customer for another xMoney environment (R-14)", async () => {
    const ownerRef = randomUUID();
    await h.buy({ ownerRef });
    h.clock.advance(31 * 60_000);
    const before = h.xmoney.customers;
    const quoted = await quoteFor(ownerRef);
    await h.checkoutWith({ xmoneyEnvironment: "live" }).start({
      ownerRef, userId: randomUUID(), ip: "198.51.100.7", userAgent: "test", quoteRef: quoted.quote.quoteId, locale: "en",
      consents: consents(), countryConfirmed: false, now: h.clock.now
    });
    expect(h.xmoney.customers - before).toBe(1);
  });

  it("signs a card-check order for P12e with the auth mode and the card page as its return", async () => {
    const signed = h.checkoutWith({}).signEmbeddedOrder({
      chargeId: "a".repeat(32), customerIdentifier: randomUUID(), email: "p@example.test", country: "RO",
      amountMicros: 1_000_000, purpose: { kind: "CARD_CHECK" }, locale: "en", cardTransactionMode: "auth",
      returnPath: "/settings/card"
    });
    const order = JSON.parse(Buffer.from(signed.orderPayload, "base64").toString("utf8")) as Parameters<typeof signOrderPayload>[0];
    expect(order).toMatchObject({
      cardTransactionMode: "auth", order: { amount: "1.00", type: "managed", description: "DebateAI card check" },
      backUrl: `https://dezbatere.test/settings/card?charge=${"a".repeat(32)}`
    });
    expect(signed).toMatchObject({ publicKey: "pk_test_harness", xmoneyEnvironment: "stage" });
    expect(signed.orderChecksum).toBe(signOrderPayload(order, h.xmoneyPrivateKey).checksum);
  });

  it("words the order line in the checkout's locale through the order-text port (spec §2.5.3 step 5)", async () => {
    const romanian: BillingOrderText = (kind, locale, params) => locale !== "ro" ? englishOrderText(kind, locale, params)
      : kind === "ORDER_PLAN" ? `DebateAI ${params.plan ?? ""}, abonament lunar`
        : kind === "CARD_CHECK" ? "Verificare card DebateAI" : englishOrderText(kind, locale, params);
    const ownerRef = randomUUID();
    const quoted = await quoteFor(ownerRef);
    const service = h.checkoutWith({ orderText: romanian, consentDocuments: (kind) => testConsentDocuments(kind, "en") });
    const started = await service.start({
      ownerRef, userId: randomUUID(), ip: "198.51.100.7", userAgent: "test", quoteRef: quoted.quote.quoteId, locale: "ro",
      consents: consents(), countryConfirmed: false, now: h.clock.now
    });
    const decode = (payload: string) => JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as Parameters<typeof signOrderPayload>[0];
    expect(decode(started.orderPayload).order.description).toBe("DebateAI Plus, abonament lunar");
    // P12e's card check is worded the same way.
    const check = service.signEmbeddedOrder({
      chargeId: "b".repeat(32), customerIdentifier: randomUUID(), email: "p@example.test", country: "RO",
      amountMicros: 1_000_000, purpose: { kind: "CARD_CHECK" }, locale: "ro", cardTransactionMode: "auth",
      returnPath: "/settings/card"
    });
    expect(decode(check.orderPayload).order.description).toBe("Verificare card DebateAI");
    expect(englishOrderText("ORDER_PLAN", "en", { plan: planName("PLUS") })).toBe("DebateAI Plus monthly plan");
    // The brand is the legal notice's first trading name, read through P6a's mirror (RULINGS-R3 R3-4). Every
    // literal "DebateAI" in the billing tests assumes it; after a rename this line says why those literals fail.
    expect(SELLER_COMPANY.tradingNames[0]).toBe("DebateAI");
  });

  it("refuses a US checkout that names neither a state nor a postal code (spec §1.3)", async () => {
    h.geo.country = "US";
    const ownerRef = randomUUID();
    const quoted = await h.quotes.create({
      ownerRef, ip: "198.51.100.7", planId: "PLUS", country: "US", name: null, region: null, postalCode: null,
      city: null, company: null, now: h.clock.now
    });
    await expect(startWith(ownerRef, quoted.quote.quoteId)).rejects.toMatchObject({ status: 422, code: "BILLING_ADDRESS_REQUIRED" });
    expect(await h.repository.subscriptionForOwner(ownerRef)).toBeNull();
  });

  it("names its xMoney system on CREATED and on the charge (D5 5h)", async () => {
    const bought = await h.buy();
    expect((await h.repository.subscriptionEvents(bought.subscriptionId))[0]?.data).toMatchObject({ xmoney_environment: "stage" });
    expect(await h.repository.charge(bought.chargeId)).toMatchObject({ xmoneyEnvironment: "stage" });
  });

  it("answers CHECKOUT_PENDING while the open checkout's payment is on its way, and neither reuses nor abandons it (D7 #5)", async () => {
    // xMoney holds a transaction for the charge, still in 3-D Secure (paid in another tab, the notice not in yet).
    const ownerRef = randomUUID();
    const first = await h.buy({ ownerRef });
    h.xmoney.pay({ externalOrderId: first.chargeId, amountDecimal: first.totalDecimal, cardCountry: "RO", status: "3d-pending" });
    await expect(h.buy({ ownerRef })).rejects.toMatchObject({ status: 409, code: "CHECKOUT_PENDING", chargeRef: first.chargeId });
    // A minute short of the attempt's life it is still on its way (the step is set against the limit function).
    h.clock.advance(inFlightAttemptLifeMs() - 60_000);
    await expect(h.buy({ ownerRef })).rejects.toMatchObject({ code: "CHECKOUT_PENDING", chargeRef: first.chargeId });
    expect((await h.repository.subscriptionEvents(first.subscriptionId)).map((event) => event.kind)).toEqual(["CREATED"]);
    expect(await h.repository.chargesForSubscription(first.subscriptionId)).toHaveLength(1);

    // A payment that completed (its notice not in yet) is on its way however old: past the 30-minute reuse window
    // the checkout is still neither signed again nor abandoned; the payment decides what happens to it.
    const paidOwner = randomUUID();
    const paid = await h.buy({ ownerRef: paidOwner });
    h.xmoney.pay({ externalOrderId: paid.chargeId, amountDecimal: paid.totalDecimal, cardCountry: "RO", status: "complete-ok" });
    h.clock.advance(31 * 60_000);
    await expect(h.buy({ ownerRef: paidOwner })).rejects.toMatchObject({ code: "CHECKOUT_PENDING", chargeRef: paid.chargeId });
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).map((event) => event.kind)).toEqual(["CREATED"]);

    // An open check alone is enough.
    const checking = randomUUID();
    const second = await h.buy({ ownerRef: checking });
    await h.repository.withTransaction((client) => h.repository.enqueue(client, {
      kind: "VERIFY_PAYMENT", ref: "7700001", notBefore: h.clock.now,
      payload: { notice_id: null, order_id: "7700002", external_order_id: second.chargeId }
    }));
    await expect(h.buy({ ownerRef: checking })).rejects.toMatchObject({ code: "CHECKOUT_PENDING", chargeRef: second.chargeId });

    // A declined payment is not on its way: the person may pay again, and the young checkout is reused.
    const declined = randomUUID();
    const third = await h.buy({ ownerRef: declined });
    h.xmoney.pay({ externalOrderId: third.chargeId, amountDecimal: third.totalDecimal, cardCountry: "RO", status: "complete-failed" });
    expect(await h.buy({ ownerRef: declined })).toMatchObject({ chargeId: third.chargeId, reused: true });
  });

  it("matches a listed payment by the checkout's own xMoney customer and asks GET /order once per order (P2-I6)", async () => {
    // A person whose earlier checkout was abandoned: two late attempts on its old order are theirs, but not this
    // checkout's. Another person's attempt in the same seconds is never even looked up.
    const ownerRef = randomUUID();
    const old = await h.buy({ ownerRef });
    h.clock.advance(31 * 60_000);
    const current = await h.buy({ ownerRef });
    expect(current.chargeId).not.toBe(old.chargeId);
    const stranger = await h.buy();
    h.xmoney.pay({ externalOrderId: stranger.chargeId, amountDecimal: stranger.totalDecimal, cardCountry: "RO", status: "3d-pending" });
    h.xmoney.pay({ externalOrderId: old.chargeId, amountDecimal: old.totalDecimal, cardCountry: "RO", status: "3d-pending" });
    h.xmoney.pay({ externalOrderId: old.chargeId, amountDecimal: old.totalDecimal, cardCountry: "RO", status: "complete-ok" });
    const calls = h.xmoney.getOrderCalls;
    expect(await h.buy({ ownerRef })).toMatchObject({ chargeId: current.chargeId, reused: true });
    expect(h.xmoney.getOrderCalls - calls).toBe(1);
    // Their attempt on THIS checkout's order is on its way.
    h.xmoney.pay({ externalOrderId: current.chargeId, amountDecimal: current.totalDecimal, cardCountry: "RO", status: "3d-pending" });
    await expect(h.buy({ ownerRef })).rejects.toMatchObject({ status: 409, code: "CHECKOUT_PENDING", chargeRef: current.chargeId });
  });

  it("lists xMoney before it takes the owner lock, and re-checks our own rows under it (P2-I6)", async () => {
    const ownerRef = randomUUID();
    const first = await h.buy({ ownerRef });
    const lockFree: boolean[] = [];
    const listing = h.checkoutWith({ xmoney: {
      createCustomer: (input) => h.xmoney.createCustomer(input),
      getOrder: (orderId) => h.xmoney.getOrder(orderId),
      listTransactions: async (input) => {
        // A try on the owner's lock from another connection: it is free while the listing runs.
        const tried = await h.database.pool.query<{ got: boolean }>(
          "SELECT pg_try_advisory_xact_lock(hashtextextended('debateai.billing.owner:'||$1,0)) AS got", [ownerRef]
        );
        lockFree.push(tried.rows[0]!.got);
        // The notice comes in while the person is still checking out: only the re-check under the lock can see it.
        const noticeId = randomUUID();
        await h.repository.withTransaction((client) => h.repository.insertNotice(client, {
          noticeId, receivedAt: h.clock.now, payloadSha256: createHash("sha256").update(noticeId).digest("hex"),
          transactionId: "7710001", orderId: "7710002", externalOrderId: first.chargeId, status: "complete-ok",
          xmoneyEnvironment: "stage"
        }));
        return h.xmoney.listTransactions(input);
      }
    } });
    const quoted = await quoteFor(ownerRef);
    await expect(listing.start({
      ownerRef, userId: randomUUID(), ip: "198.51.100.7", userAgent: "test", quoteRef: quoted.quote.quoteId, locale: "en",
      consents: consents(), countryConfirmed: false, now: h.clock.now
    })).rejects.toMatchObject({ status: 409, code: "CHECKOUT_PENDING", chargeRef: first.chargeId });
    expect(lockFree).toEqual([true]);
  });

  it("answers CHECKOUT_PENDING through xMoney's own API while the first payment is in 3-D Secure (the protocol fake, P2-I6)", async () => {
    const fake = await startFakeXMoney();
    try {
      // The fake stamps transactions with the real clock, so this checkout runs on it too.
      const now = new Date();
      const service = h.checkoutWith({
        xmoney: new XMoneyClient({ baseUrl: fake.baseUrl, privateKey: fake.privateKey, siteId: fake.siteId, timeoutMs: 5_000 }),
        xmoneyPrivateKey: fake.privateKey, xmoneyPublicKey: fake.publicKey, siteId: fake.siteId
      });
      const ownerRef = randomUUID();
      const quote = (at: Date) => h.quotes.create({
        ownerRef, ip: "198.51.100.7", planId: "PLUS", country: "RO", region: "B", postalCode: null, company: null, now: at,
        name: "Test Buyer", city: "Bucuresti"
      });
      const checkout = async (at: Date) => service.start({
        ownerRef, userId: randomUUID(), ip: "198.51.100.7", userAgent: "test", quoteRef: (await quote(at)).quote.quoteId,
        locale: "en", consents: consents(), countryConfirmed: false, now: at
      });
      const first = await checkout(now);
      // The person is at the bank's check: xMoney has the transaction, no notice has been sent.
      await fake.completeSignedOrder({
        orderPayload: first.orderPayload, orderChecksum: first.orderChecksum, cardCountry: "RO", succeed: true, status: "3d-pending"
      });
      await expect(checkout(new Date(Math.max(Date.now(), now.getTime() + 1_000))))
        .rejects.toMatchObject({ status: 409, code: "CHECKOUT_PENDING", chargeRef: first.chargeId });
    } finally {
      await fake.stop();
    }
  });

  it("answers PAYMENT_PROVIDER_UNAVAILABLE and raises the operator alarm when xMoney refuses our credentials (D5 5i)", async () => {
    const ownerRef = randomUUID();
    const quoted = await quoteFor(ownerRef);
    const refused = h.checkoutWith({ xmoney: {
      createCustomer: async () => { throw new TypedDomainError("XMONEY_CREDENTIALS_REFUSED", "XMONEY_CREDENTIALS_REFUSED:401"); },
      listTransactions: async () => [],
      getOrder: async () => { throw new TypedDomainError("XMONEY_CREDENTIALS_REFUSED", "XMONEY_CREDENTIALS_REFUSED:401"); }
    } });
    await expect(refused.start({
      ownerRef, userId: randomUUID(), ip: "198.51.100.7", userAgent: "test", quoteRef: quoted.quote.quoteId, locale: "en",
      consents: consents(), countryConfirmed: false, now: h.clock.now
    })).rejects.toMatchObject({ status: 503, code: "PAYMENT_PROVIDER_UNAVAILABLE" });
    expect(h.auditLines).toContainEqual({ event: "billing.xmoney.credentials_refused", operation: "checkout" });
  });

  it("drops a stale not-final attempt (a closed 3-D Secure window): reused within 30 minutes, abandoned after", async () => {
    const life = inFlightAttemptLifeMs();
    // The limit sits below the reuse window, so a stale attempt on a young checkout can happen at all.
    expect(life).toBeLessThan(30 * 60_000);
    const young = randomUUID();
    const first = await h.buy({ ownerRef: young });
    h.xmoney.pay({ externalOrderId: first.chargeId, amountDecimal: first.totalDecimal, cardCountry: "RO", status: "3d-pending" });
    h.clock.advance(life + 60_000);
    expect(await h.buy({ ownerRef: young })).toMatchObject({ chargeId: first.chargeId, reused: true });

    const old = randomUUID();
    const second = await h.buy({ ownerRef: old });
    h.xmoney.pay({ externalOrderId: second.chargeId, amountDecimal: second.totalDecimal, cardCountry: "RO", status: "3d-pending" });
    h.clock.advance(31 * 60_000);
    const later = await h.buy({ ownerRef: old });
    expect([later.chargeId === second.chargeId, later.reused]).toEqual([false, false]);
    expect((await h.repository.subscriptionEvents(second.subscriptionId)).at(-1))
      .toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED", reason: "NEW_CHECKOUT" } });
  });

  it("drops a stale not-final notice and a check retrying as PAYMENT_NOT_FINAL; fresh ones still block", async () => {
    const ownerRef = randomUUID();
    const first = await h.buy({ ownerRef });
    const pending = h.xmoney.pay({ externalOrderId: first.chargeId, amountDecimal: first.totalDecimal, cardCountry: "RO", status: "3d-pending" });
    const noticeId = randomUUID();
    const jobId = await h.repository.withTransaction(async (client) => {
      await h.repository.insertNotice(client, {
        noticeId, receivedAt: h.clock.now, payloadSha256: createHash("sha256").update(noticeId).digest("hex"),
        transactionId: pending.transactionId, orderId: pending.orderId, externalOrderId: first.chargeId,
        status: "3d-pending", xmoneyEnvironment: "stage"
      });
      return h.repository.enqueue(client, {
        kind: "VERIFY_PAYMENT", ref: pending.transactionId, notBefore: h.clock.now,
        payload: { notice_id: noticeId, order_id: pending.orderId, external_order_id: first.chargeId }
      });
    });
    // The check ran and found the payment still in 3-D Secure: P9b retries it with exactly this code.
    await h.repository.fail(jobId, "PAYMENT_NOT_FINAL", new Date(h.clock.now.getTime() + 60_000), h.clock.now);
    await expect(h.buy({ ownerRef })).rejects.toMatchObject({ code: "CHECKOUT_PENDING", chargeRef: first.chargeId });
    // The person closed the bank's window. Past the attempt's life neither the notice, the check nor the listed
    // transaction blocks, and the young checkout is signed again (a late completion of the old attempt is then P9b's
    // duplicate payment on this reused order, refunded).
    h.clock.advance(inFlightAttemptLifeMs() + 60_000);
    expect(await h.buy({ ownerRef })).toMatchObject({ chargeId: first.chargeId, reused: true });
  });

  it("never starves its pool: eleven concurrent checkouts on a two-connection pool all finish", async () => {
    const owners = Array.from({ length: 11 }, () => randomUUID());
    // Each owner already has a young open checkout, so each start takes the reuse path: the most reads under the lock.
    const firsts: Array<Awaited<ReturnType<BillingHarness["buy"]>>> = [];
    for (const ownerRef of owners) firsts.push(await h.buy({ ownerRef }));
    const quotes: Array<Awaited<ReturnType<typeof quoteFor>>> = [];
    for (const ownerRef of owners) quotes.push(await quoteFor(ownerRef));
    // Two connections: a read on the pool inside the owner lock would wait for ever for a second one.
    const narrow = createPool(h.database.connectionString, { max: 2 });
    try {
      const service = h.checkoutWith({
        repository: new BillingRepository(narrow), jobs: new BillingJobQueries(narrow), acceptances: new AcceptanceRepository(narrow)
      });
      const started = await within(Promise.all(owners.map((ownerRef, index) => service.start({
        ownerRef, userId: randomUUID(), ip: "198.51.100.7", userAgent: "test", quoteRef: quotes[index]!.quote.quoteId,
        locale: "en", consents: consents(), countryConfirmed: false, now: h.clock.now
      }))), 5_000);
      expect(started.map((result) => [result.chargeId, result.reused])).toEqual(firsts.map((first) => [first.chargeId, true]));
    } finally {
      await endPoolWithin(narrow);
    }
  }, 20_000);
});
