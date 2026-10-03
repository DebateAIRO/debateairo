// tests/unit/payments-xmoney-client.test.ts
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  XMoneyClient,
  XMoneyPaymentFailedError,
  decryptNotice,
  parseXMoneyTransaction,
  signOrderPayload
} from "@debateai/payments-xmoney";
import { startFakeXMoney, type FakeXMoney } from "../support/fake-xmoney.js";

let fake: FakeXMoney;
let client: XMoneyClient;
beforeAll(async () => {
  fake = await startFakeXMoney({ maxPerPage: 2 });
  client = new XMoneyClient({ baseUrl: fake.baseUrl, privateKey: fake.privateKey, siteId: fake.siteId, timeoutMs: 1_000 });
});
afterAll(async () => { await fake?.stop(); });

const chargeId = (): string => randomBytes(16).toString("hex");

async function closedPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function paidInitialOrder(country = "RO") {
  const identifier = randomBytes(16).toString("hex");
  const { customerId } = await client.createCustomer({ identifier, email: "person@example.test", country });
  const externalOrderId = chargeId();
  const signed = signOrderPayload({
    publicKey: fake.publicKey, siteId: fake.siteId,
    customer: { identifier, email: "person@example.test", country },
    order: { orderId: externalOrderId, type: "managed", amount: "24.20", currency: "USD", description: "Plus plan" },
    cardTransactionMode: "authAndCapture", saveCard: true, backUrl: "https://debateai.test/checkout/return"
  }, fake.privateKey);
  const notice = await fake.completeSignedOrder({
    orderPayload: signed.payload, orderChecksum: signed.checksum, cardCountry: country, succeed: true
  });
  return { customerId, externalOrderId, notice };
}

describe("P3b — xMoney client against the fake", () => {
  it("creates a customer once per identifier", async () => {
    const identifier = randomBytes(16).toString("hex");
    const first = await client.createCustomer({ identifier, email: "person@example.test", country: "RO" });
    const again = await client.createCustomer({ identifier, email: "person@example.test", country: null });
    expect(first.customerId).toMatch(/^[0-9]+$/u);
    expect(again.customerId).toBe(first.customerId);
  });

  it("reads back what an embedded payment produced: notice, transaction, order and card country", async () => {
    const { customerId, externalOrderId, notice } = await paidInitialOrder("RO");
    expect(decryptNotice(notice.opensslResult, fake.privateKey)).toEqual({
      transactionStatus: notice.transactionStatus, orderId: notice.orderId, externalOrderId: notice.externalOrderId,
      transactionId: notice.transactionId, customerId: notice.customerId, amountDecimal: notice.amountDecimal,
      currency: notice.currency, cardId: notice.cardId, timestamp: notice.timestamp
    });
    expect(notice).toMatchObject({ transactionStatus: "complete-ok", externalOrderId, customerId, currency: "USD" });
    const transaction = await client.getTransaction(notice.transactionId);
    expect(transaction).toMatchObject({
      transactionId: notice.transactionId, orderId: notice.orderId, customerId, status: "complete-ok",
      amountDecimal: "24.20", currency: "USD", transactionSource: "service-call", transactionType: "deposit"
    });
    expect(await client.getOrder(notice.orderId)).toEqual({ orderId: notice.orderId, externalOrderId });
    expect(await client.getCard(notice.cardId!, customerId)).toEqual({ cardId: notice.cardId, countryCode: "RO" });
    fake.setCardCountry(notice.cardId!, "RU");
    expect((await client.getCard(notice.cardId!, customerId)).countryCode).toBe("RU");
  });

  it("rejects an order payload whose checksum was not made with the site key", async () => {
    const signed = signOrderPayload({
      publicKey: fake.publicKey, siteId: fake.siteId,
      customer: { identifier: "someone", email: "person@example.test", country: "RO" },
      order: { orderId: chargeId(), type: "managed", amount: "24.20", currency: "USD", description: "Plus plan" },
      cardTransactionMode: "authAndCapture", saveCard: true, backUrl: "https://debateai.test/checkout/return"
    }, Buffer.alloc(32, 7));
    await expect(fake.completeSignedOrder({ orderPayload: signed.payload, orderChecksum: signed.checksum, cardCountry: "RO", succeed: true }))
      .rejects.toThrow("FAKE_XMONEY_CHECKSUM_INVALID");
  });

  it("rebills a managed order, and reports a declined rebill with its transaction", async () => {
    const { customerId, notice } = await paidInitialOrder();
    const rebilled = await client.rebill({ orderId: notice.orderId, customerId, amountDecimal: "24.20" });
    expect(rebilled.orderId).toBe(notice.orderId);
    expect((await client.getTransaction(rebilled.transactionId))).toMatchObject({ status: "complete-ok", transactionSource: "re-bill" });
    fake.failNextRebill(1234);
    const failure = await client.rebill({ orderId: notice.orderId, customerId, amountDecimal: "24.20" }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(XMoneyPaymentFailedError);
    expect(failure).toMatchObject({ code: "XMONEY_PAYMENT_FAILED", xmoneyErrorCode: "1234" });
    const failedId = (failure as XMoneyPaymentFailedError).transactionId!;
    expect((await client.getTransaction(failedId)).status).toBe("complete-failed");
    // P23's whole-flow harness declines with a word; the client keeps only numeric xMoney codes.
    fake.failNextRebill("insufficient-funds");
    await expect(client.rebill({ orderId: notice.orderId, customerId, amountDecimal: "24.20" }))
      .rejects.toMatchObject({ code: "XMONEY_PAYMENT_FAILED", xmoneyErrorCode: null });
  });

  it("calls a rebill whose answer never came OUTCOME_UNKNOWN, and a refused connection UNAVAILABLE", async () => {
    const { customerId, notice } = await paidInitialOrder();
    fake.stallNextRebill();
    await expect(client.rebill({ orderId: notice.orderId, customerId, amountDecimal: "24.20" }))
      .rejects.toMatchObject({ code: "XMONEY_OUTCOME_UNKNOWN" });
    const offline = new XMoneyClient({ baseUrl: `http://127.0.0.1:${await closedPort()}`, privateKey: fake.privateKey, siteId: fake.siteId, timeoutMs: 500 });
    await expect(offline.rebill({ orderId: notice.orderId, customerId, amountDecimal: "24.20" }))
      .rejects.toMatchObject({ code: "XMONEY_UNAVAILABLE" });
    await expect(offline.getTransaction(notice.transactionId)).rejects.toMatchObject({ code: "XMONEY_UNAVAILABLE" });
  });

  it("refunds a payment in parts as linked refund transactions, and releases a card-check hold (A4 (c), A12)", async () => {
    const { notice } = await paidInitialOrder();
    const payment = notice.transactionId;
    const from = new Date(Date.now() - 3_600_000);
    const to = new Date(Date.now() + 3_600_000);
    await client.refund({ transactionId: payment, amountDecimal: "12.10", reason: "customer-demand", message: "withdrawal" });
    // The careful model: part of the money back is NOT a refunded payment. A retry that only looked for refund-ok
    // here would refund 12.10 a second time.
    expect((await client.getTransaction(payment)).status).toBe("complete-ok");
    const refunds = await client.listTransactions({ from, to, dateType: "refund", transactionType: "refund" });
    const first = refunds.find((transaction) => transaction.relatedTransactionIds.includes(payment));
    expect(first).toMatchObject({ transactionType: "refund", status: "complete-ok", amountDecimal: "12.10", relatedTransactionIds: [payment] });
    expect((await client.getTransaction(first!.transactionId)).relatedTransactionIds).toEqual([payment]);
    await client.refund({ transactionId: payment, amountDecimal: null, reason: "customer-demand", message: "withdrawal" });
    expect((await client.getTransaction(payment)).status).toBe("refund-ok");
    const linked = (await client.listTransactions({ from, to, dateType: "refund", transactionType: "refund" }))
      .filter((transaction) => transaction.relatedTransactionIds.includes(payment));
    expect(linked.map((transaction) => transaction.amountDecimal).sort()).toEqual(["12.10", "12.10"]);
    await expect(client.refund({ transactionId: payment, amountDecimal: "0.01", reason: "customer-demand", message: "extra" }))
      .rejects.toMatchObject({ code: "XMONEY_REFUSED" });
    const identifier = randomBytes(16).toString("hex");
    await client.createCustomer({ identifier, email: "person@example.test", country: "RO" });
    const hold = signOrderPayload({
      publicKey: fake.publicKey, siteId: fake.siteId, customer: { identifier, email: "person@example.test", country: "RO" },
      order: { orderId: chargeId(), type: "managed", amount: "1.00", currency: "USD", description: "Card check" },
      cardTransactionMode: "auth", saveCard: true, backUrl: "https://debateai.test/settings/card"
    }, fake.privateKey);
    const held = await fake.completeSignedOrder({ orderPayload: hold.payload, orderChecksum: hold.checksum, cardCountry: "RO", succeed: true });
    await client.refund({ transactionId: held.transactionId, amountDecimal: null, reason: "customer-demand", message: "card check" });
    expect((await client.getTransaction(held.transactionId)).status).toBe("void-ok");
  });

  it("reports the refunds xMoney lists against a payment, and null when it lists none (X0 (g), A4 (c))", async () => {
    const { notice } = await paidInitialOrder();
    const payment = notice.transactionId;
    const window = { from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 3_600_000) };
    const seen = () => client.refundsOf({ transactionId: payment, orderId: notice.orderId, ...window });
    // Nothing listed is "unknown", never "0.00": a retry that read it as nothing refunded could refund twice.
    expect(await seen()).toBeNull();
    await client.refund({ transactionId: payment, amountDecimal: "12.10", reason: "customer-demand", message: "withdrawal" });
    expect(await seen()).toMatchObject({ refundedDecimal: "12.10", rows: [expect.objectContaining({ amountDecimal: "12.10" })] });
    // A second partial refund (ours or the owner's in the dashboard) is a second row with its own id.
    await client.refund({ transactionId: payment, amountDecimal: "5.05", reason: "customer-demand", message: "dashboard" });
    const twice = await seen();
    expect(twice?.refundedDecimal).toBe("17.15");
    expect(twice?.rows.map((row) => row.amountDecimal).sort()).toEqual(["12.10", "5.05"]);
    expect(new Set(twice?.rows.map((row) => row.transactionId)).size).toBe(2);
    expect(twice?.rows.every((row) => row.transactionId !== payment && row.createdAt instanceof Date)).toBe(true);
    // Another payment's refund never counts here.
    const other = await paidInitialOrder();
    await client.refund({ transactionId: other.notice.transactionId, amountDecimal: "1.00", reason: "customer-demand", message: "other" });
    expect((await seen())?.refundedDecimal).toBe("17.15");
  });

  it("lists transactions across pages, by order and by chargeback date (A2, A10)", async () => {
    const { customerId, notice } = await paidInitialOrder();
    await client.rebill({ orderId: notice.orderId, customerId, amountDecimal: "24.20" });
    await client.rebill({ orderId: notice.orderId, customerId, amountDecimal: "24.20" });
    const from = new Date(Date.now() - 3_600_000);
    const to = new Date(Date.now() + 3_600_000);
    const byOrder = await client.listTransactions({ from, to, orderId: notice.orderId });
    expect(byOrder.map((transaction) => transaction.orderId)).toEqual([notice.orderId, notice.orderId, notice.orderId]);
    const disputeId = fake.chargeback(notice.transactionId);
    const disputes = await client.listTransactions({ from, to, dateType: "charge-back", transactionType: "chargeback" });
    expect(disputes.map((transaction) => transaction.transactionId)).toContain(disputeId);
    expect((await client.getTransaction(notice.transactionId)).status).toBe("charge-back");
  });

  it("keeps listing past a row it cannot read, and names the row it skipped", async () => {
    const { notice } = await paidInitialOrder();
    fake.injectMalformedTransaction(notice.orderId);
    const rejected: Array<string | null> = [];
    const listed = await client.listTransactions({
      from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 3_600_000), orderId: notice.orderId,
      onRejected: (transactionId) => rejected.push(transactionId)
    });
    expect(listed.map((transaction) => transaction.transactionId)).toEqual([notice.transactionId]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatch(/^[0-9]+$/u);
  });

  it("reads a rate limit or a timeout as nothing decided, and a refused key as ours — never as a decline", async () => {
    const { customerId, notice } = await paidInitialOrder();
    const rebill = () => client.rebill({ orderId: notice.orderId, customerId, amountDecimal: "24.20" });
    fake.failNextStatus(429);
    await expect(client.getTransaction(notice.transactionId)).rejects.toMatchObject({ code: "XMONEY_UNAVAILABLE" });
    fake.failNextStatus(429);
    await expect(rebill()).rejects.toMatchObject({ code: "XMONEY_UNAVAILABLE" });
    fake.failNextStatus(408);
    await expect(client.getTransaction(notice.transactionId)).rejects.toMatchObject({ code: "XMONEY_UNAVAILABLE" });
    fake.failNextStatus(408);
    await expect(rebill()).rejects.toMatchObject({ code: "XMONEY_OUTCOME_UNKNOWN" });
    fake.failNextStatus(403);
    await expect(rebill()).rejects.toMatchObject({ code: "XMONEY_CREDENTIALS_REFUSED", message: "XMONEY_CREDENTIALS_REFUSED:403" });
    // None of those created a transaction: only the successful payment is on the order.
    const onOrder = await client.listTransactions({
      from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 3_600_000), orderId: notice.orderId
    });
    expect(onOrder.map((transaction) => transaction.transactionId)).toEqual([notice.transactionId]);
  });

  it("is refused with the wrong key as a credentials problem", async () => {
    const stranger = new XMoneyClient({ baseUrl: fake.baseUrl, privateKey: Buffer.alloc(32, 9), siteId: fake.siteId });
    await expect(stranger.getTransaction("1"))
      .rejects.toMatchObject({ code: "XMONEY_CREDENTIALS_REFUSED", message: "XMONEY_CREDENTIALS_REFUSED:401" });
  });

  it("takes an empty 2xx reply to a refund as done", async () => {
    const quiet = new XMoneyClient({
      baseUrl: "https://stage.invalid", privateKey: Buffer.alloc(32, 1), siteId: "1",
      fetch: async () => new Response("", { status: 200 })
    });
    await expect(quiet.refund({ transactionId: "1", amountDecimal: null, reason: "customer-demand", message: "x" }))
      .resolves.toBeUndefined();
    await expect(quiet.getTransaction("1")).rejects.toMatchObject({ code: "XMONEY_RESPONSE_INVALID" });
  });

  it("adopts a customer only when the lookup lists exactly the identifier asked for", async () => {
    const identifier = randomBytes(16).toString("hex");
    const stub = (post: Response, listed: ReadonlyArray<Record<string, unknown>>) => new XMoneyClient({
      baseUrl: "https://stage.invalid", privateKey: Buffer.alloc(32, 1), siteId: "1",
      fetch: async (_url, init) => init?.method === "POST"
        ? post
        : new Response(JSON.stringify({ code: 200, message: "ok", data: listed }), { status: 200 })
    });
    // A 409 whose lookup lists someone else's customer is the 409, never that stranger's id.
    const conflict = new Response(JSON.stringify({ code: 409, message: "conflict", error: [{ code: 1627, message: "exists" }] }), { status: 409 });
    await expect(stub(conflict, [{ id: 777, identifier: randomBytes(16).toString("hex") }])
      .createCustomer({ identifier, email: "person@example.test", country: "RO" }))
      .rejects.toMatchObject({ code: "XMONEY_REFUSED", message: "XMONEY_REFUSED:409:1627" });
    // Any refusal (xMoney's real duplicate status is not recorded) is answered by the exact-identifier lookup.
    const refused = new Response(JSON.stringify({ code: 400, message: "bad request", error: [{ code: 1001, message: "x" }] }), { status: 400 });
    await expect(stub(refused, [{ id: 555, identifier }])
      .createCustomer({ identifier, email: "person@example.test", country: "RO" }))
      .resolves.toEqual({ customerId: "555" });
  });

  it("reads a refund listing with any row it cannot read as unknown, never as a smaller sum", async () => {
    const row = (id: number, amount: string) => ({
      id, orderId: 1, customerId: 1, transactionType: "refund", transactionStatus: "complete-ok", amount,
      currency: "USD", creationDate: "2026-09-30T10:00:00+00:00", relatedTransactionIds: [1]
    });
    const listing = (rows: ReadonlyArray<Record<string, unknown>>) => new XMoneyClient({
      baseUrl: "https://stage.invalid", privateKey: Buffer.alloc(32, 1), siteId: "1",
      fetch: async () => new Response(JSON.stringify({ code: 200, message: "ok", data: rows }), { status: 200 })
    });
    const window = { transactionId: "1", orderId: "1", from: new Date("2026-09-30T00:00:00Z"), to: new Date("2026-10-01T00:00:00Z") };
    // Control: one readable row is summed.
    expect((await listing([row(11, "5.05")]).refundsOf(window))?.refundedDecimal).toBe("5.05");
    // The refused row may be one of this payment's refunds: the sum is unknown, and the caller still hears it once.
    const rejected: Array<string | null> = [];
    const both = [row(11, "5.05"), row(12, "-12.10")];
    expect(await listing(both).refundsOf({ ...window, onRejected: (id) => rejected.push(id) })).toBeNull();
    expect(rejected).toEqual(["12"]);
    expect(await listing(both).refundsOf(window)).toBeNull();
  });

  it("reads a transaction's time only with its zone: an offset-less creationDate falls back to creationTimestamp (P2-M3)", () => {
    const row = (dates: Readonly<Record<string, unknown>>) => parseXMoneyTransaction({
      id: "11", orderId: "1", customerId: "1", transactionType: "deposit", transactionStatus: "complete-ok", amount: "24.20",
      currency: "USD", ...dates
    }).createdAt;
    const instant = new Date("2026-10-02T10:00:00.000Z");
    expect(row({ creationDate: "2026-10-02T10:00:00Z" })).toEqual(instant);
    expect(row({ creationDate: "2026-10-02T13:00:00+03:00" })).toEqual(instant);
    expect(row({ creationDate: "2026-10-02 10:00:00+00:00" })).toEqual(instant);
    // Offset-less, it would be read in the server's own zone: never taken. The unambiguous timestamp is read instead.
    expect(row({ creationDate: "2026-10-02 13:00:00" })).toBeNull();
    expect(row({ creationDate: "2026-10-02T13:00:00" })).toBeNull();
    expect(row({ creationDate: "2026-10-02 13:00:00", creationTimestamp: instant.getTime() / 1_000 })).toEqual(instant);
    expect(row({ creationTimestamp: String(instant.getTime() / 1_000) })).toEqual(instant);
    expect(row({ creationTimestamp: "soon" })).toBeNull();
    expect(row({ creationTimestamp: -5 })).toBeNull();
    expect(row({})).toBeNull();
    // A millisecond timestamp, read as seconds, would anchor a plan in year 58722: refused in both forms, never taken.
    expect(row({ creationDate: "2026-10-02 10:00:00", creationTimestamp: instant.getTime() })).toBeNull();
    expect(row({ creationTimestamp: String(instant.getTime()) })).toBeNull();
    expect(row({ creationTimestamp: String(instant.getTime()).slice(0, 12) })).toBeNull();
    // Control: the same instant in seconds, numeric, is still read.
    expect(row({ creationDate: "2026-10-02 10:00:00", creationTimestamp: 1_759_399_200 })).toEqual(new Date(1_759_399_200_000));
  });
});
