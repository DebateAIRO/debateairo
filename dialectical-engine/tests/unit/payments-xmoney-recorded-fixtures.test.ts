// tests/unit/payments-xmoney-recorded-fixtures.test.ts
// X0's recorded stage fixtures, run through the REAL client and the real notice decoder. Until the owner records
// them this suite is skipped BY NAME (the describe says so) — the one test here that can be inert, and the go-live
// checklist's row 14 (written by P22) lists "all 26 required X0 kinds present and the X0 suites green" so the skip
// cannot be forgotten.
// Once any fixture exists, every required kind must: a missing one fails loudly, never silently passes.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  XMONEY_STATUSES,
  XMoneyClient,
  decryptNotice,
  signOrderPayload,
  type XMoneyTransaction
} from "@debateai/payments-xmoney";
import {
  XMONEY_OPTIONAL_FIXTURE_KINDS,
  XMONEY_REQUIRED_FIXTURE_KINDS
} from "../../tools/billing/scrub-xmoney-fixture.js";
import { startFakeXMoney } from "../support/fake-xmoney.js";

const DIRECTORY = resolve(import.meta.dirname, "../fixtures/xmoney");
const FORMAT = "debateai.xmoney-fixture.v1";
const TEST_KEY = Buffer.from("0123456789abcdef0123456789abcdef", "latin1");
type Framing = { ivBytes: number; alphabet: string; padded: boolean; lineBreaks: boolean; plusArrivedAsSpace: boolean };
type Fixture = { format: string; kind: string; body: unknown; testKeyOpensslResult: string | null; framing: Framing | null };
const fixtures: Fixture[] = existsSync(DIRECTORY)
  ? readdirSync(DIRECTORY).filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(DIRECTORY, name), "utf8")) as Fixture)
  : [];

function fixture(kind: string): Fixture {
  const found = fixtures.find((candidate) => candidate.kind === kind);
  if (found === undefined) throw new Error(`X0 fixture missing: ${kind}`);
  return found;
}
const dataOf = (kind: string): Record<string, unknown> => (fixture(kind).body as { data: Record<string, unknown> }).data;
const recordedStatus = (kind: string): unknown => dataOf(kind).transactionStatus;

/**
 * Runs `use` against a real XMoneyClient whose every call is answered with `body` (a later page with an empty
 * page), then checks the method and path it called — outside the stub, so a wrong path fails as itself and is
 * never swallowed as a transport error by the client.
 */
async function answeredWith<T>(
  body: unknown, expected: Readonly<{ method: string; path: RegExp }>, use: (client: XMoneyClient) => Promise<T>
): Promise<T> {
  const calls: Array<{ method: string; path: string }> = [];
  const client = new XMoneyClient({
    baseUrl: "https://stage.invalid", privateKey: Buffer.alloc(32, 1), siteId: "1",
    fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      calls.push({ method: init?.method ?? "GET", path: url.pathname });
      const page = Number(url.searchParams.get("page") ?? "1");
      return new Response(JSON.stringify(page > 1 ? { code: 200, message: "ok", data: [] } : body), { status: 200 });
    }
  });
  const result = await use(client);
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call.method).toBe(expected.method);
    expect(call.path).toMatch(expected.path);
  }
  return result;
}

const SINGLE_TRANSACTION_KINDS = [
  "transaction-initial", "transaction-rebill", "transaction-auth", "transaction-auth-released",
  "transaction-refund-partial", "transaction-refund-second-partial", "transaction-refund-full",
  "transaction-rebill-auth-order"
] as const;
const LIST_KINDS = [
  "transaction-list", "transaction-list-after-refund", "transaction-list-refund-after-partial",
  "transaction-list-refund-after-second-partial", "transaction-list-refund"
] as const;

describe.runIf(fixtures.length > 0)("P3b — recorded xMoney stage fixtures (X0)", () => {
  it("hold every required kind, in the v1 format", () => {
    const present = new Set(fixtures.map((candidate) => candidate.kind));
    expect(XMONEY_REQUIRED_FIXTURE_KINDS.filter((kind) => !present.has(kind)), "missing X0 fixture kinds").toEqual([]);
    const known = new Set<string>([...XMONEY_REQUIRED_FIXTURE_KINDS, ...XMONEY_OPTIONAL_FIXTURE_KINDS]);
    expect([...present].filter((kind) => !known.has(kind)), "unknown X0 fixture kinds").toEqual([]);
    expect(fixtures.every((candidate) => candidate.format === FORMAT)).toBe(true);
  });

  it("decrypt to their own scrubbed body, in the framing xMoney really used", () => {
    for (const notice of fixtures.filter((candidate) => candidate.kind.startsWith("notice-"))) {
      // What P3a's strict decoder accepts: the standard alphabet, a 16-byte IV, no line breaks.
      expect(notice.framing, notice.kind).toMatchObject({ ivBytes: 16, alphabet: "standard", lineBreaks: false });
      const decrypted = decryptNotice(notice.testKeyOpensslResult!, TEST_KEY);
      const body = notice.body as Record<string, unknown>;
      expect(decrypted.transactionStatus, notice.kind).toBe(body.transactionStatus);
      expect(decrypted.transactionId, notice.kind).toBe(String(body.transactionId));
      if (notice.framing!.plusArrivedAsSpace) {
        // The arrival form xMoney really used: a form decoder turned every + into a space.
        expect(decryptNotice(notice.testKeyOpensslResult!.replaceAll("+", " "), TEST_KEY).transactionId, notice.kind)
          .toBe(decrypted.transactionId);
      }
    }
    expect(decryptNotice(fixture("notice-success").testKeyOpensslResult!, TEST_KEY).externalOrderId).not.toBeNull();
  });

  it("parse as transactions through the real client", async () => {
    const optional = XMONEY_OPTIONAL_FIXTURE_KINDS.filter((kind) => kind.startsWith("transaction-")
      && fixtures.some((candidate) => candidate.kind === kind));
    for (const kind of [...SINGLE_TRANSACTION_KINDS, ...optional]) {
      const parsed = await answeredWith(fixture(kind).body, { method: "GET", path: /^\/transaction\/[0-9]+$/u },
        (client) => client.getTransaction("1"));
      expect((XMONEY_STATUSES as ReadonlyArray<string>).includes(parsed.status), kind).toBe(true);
    }
  });

  it("read the order, the card and the rebill reply the way A1 matching needs", async () => {
    const order = await answeredWith(fixture("order").body, { method: "GET", path: /^\/order\/[0-9]+$/u },
      (client) => client.getOrder("1"));
    expect(order.orderId).toMatch(/^[0-9]+$/u);
    expect(order.externalOrderId).toMatch(/^[0-9a-f]{32}$/u);
    const card = await answeredWith(fixture("card").body, { method: "GET", path: /^\/card\/[0-9]+$/u },
      (client) => client.getCard("1", "1"));
    expect(card.cardId).toMatch(/^[0-9]+$/u);
    expect(card.countryCode).toMatch(/^[A-Z]{2}$/u);
    const rebilled = await answeredWith(fixture("rebill-response").body, { method: "PATCH", path: /^\/order-rebill\/[0-9]+$/u },
      (client) => client.rebill({ orderId: "1", customerId: "1", amountDecimal: "1.00" }));
    expect(rebilled.transactionId).toMatch(/^[0-9]+$/u);
    expect(rebilled.orderId).toMatch(/^[0-9]+$/u);
  });

  it("list every recorded row, and say how many pages there are", async () => {
    for (const kind of LIST_KINDS) {
      expect(typeof (fixture(kind).body as { pagination?: { pageCount?: unknown } }).pagination?.pageCount, kind).toBe("number");
      const rejected: Array<string | null> = [];
      const listed = await answeredWith(fixture(kind).body, { method: "GET", path: /^\/transaction$/u },
        (client) => client.listTransactions({ from: new Date(0), to: new Date(), onRejected: (transactionId) => rejected.push(transactionId) }));
      expect(rejected, kind).toEqual([]);
      expect(listed.length, kind).toBe(((fixture(kind).body as { data: unknown[] }).data).length);
    }
  });

  it("name the same order across the notice, the order read and the rebill (one scrub run keeps equalities)", () => {
    expect(dataOf("order").externalOrderId).toBe((fixture("notice-success").body as { externalOrderId: unknown }).externalOrderId);
    expect(dataOf("rebill-response").id).toBe(dataOf("order").id);
  });

  // W1 (P2-I1, P2-I6) depends on this fact: VERIFY_PAYMENT's CUSTOMER_MISMATCH check requires a first payment's
  // customerId to be the subscription's CREATED xmoneyCustomerId (POST /customer's reply), and the checkout's listing
  // matches deposits by that customer. X0 creates the customer the way production does and pays for it (`serve
  // --identifier`); one scrub run keeps the equality. If this fails, both checks change before billing is on.
  it("W1's customer check: the frictionless payment is made by the customer POST /customer created", async () => {
    const created = await answeredWith(fixture("customer-response").body, { method: "POST", path: /^\/customer$/u },
      (client) => client.createCustomer({ identifier: "x0-recorded", email: "person@example.test", country: "RO" }));
    const paid = await answeredWith(fixture("transaction-initial").body, { method: "GET", path: /^\/transaction\/[0-9]+$/u },
      (client) => client.getTransaction("1"));
    expect(paid.customerId, "the paying customer is the created one").toBe(created.customerId);
    expect(String(dataOf("transaction-initial").customerId)).toBe(String(dataOf("customer-response").id));
  });

  // Optional: what a second POST /customer with the same identifier answers, and the lookup by identifier after it.
  // The CREATED customer and createCustomer's adopt-by-identifier path depend on it: the client must end with the
  // customer the first POST created, whether xMoney answers the repeat itself or refuses it and lists the original.
  it.runIf(fixtures.some((candidate) => candidate.kind === "customer-response-repeat"))(
    "adopt the customer the first POST created when the same identifier is posted again (W1)", async () => {
      const recorded = fixture("customer-response-repeat").body as {
        httpStatus: number; reply: unknown; lookup: { httpStatus: number; reply: unknown };
      };
      const identifier = (fixture("order-payload").body as { order: { customer: { identifier: string } } }).order.customer.identifier;
      const replay = new XMoneyClient({
        baseUrl: "https://stage.invalid", privateKey: Buffer.alloc(32, 1), siteId: "1",
        fetch: async (_input, init) => (init?.method === "POST"
          ? new Response(JSON.stringify(recorded.reply), { status: recorded.httpStatus })
          : new Response(JSON.stringify(recorded.lookup.reply), { status: recorded.lookup.httpStatus }))
      });
      const again = await replay.createCustomer({ identifier, email: "person@example.test", country: "RO" });
      expect(again.customerId, "a repeated identifier keeps its first customer").toBe(String(dataOf("customer-response").id));
    }
  );

  it("the fake answers each recorded step as xMoney did: refunds, the hold, its release and the auth-order rebill", async () => {
    const fake = await startFakeXMoney();
    try {
      const client = new XMoneyClient({ baseUrl: fake.baseUrl, privateKey: fake.privateKey, siteId: fake.siteId });
      const from = new Date(Date.now() - 3_600_000);
      const to = new Date(Date.now() + 3_600_000);
      const pay = async (mode: "authAndCapture" | "auth") => {
        const identifier = `x0-replay-${mode}`;
        const { customerId } = await client.createCustomer({ identifier, email: "person@example.test", country: "RO" });
        const signed = signOrderPayload({
          publicKey: fake.publicKey, siteId: fake.siteId, customer: { identifier, email: "person@example.test", country: "RO" },
          order: { orderId: (mode === "auth" ? "b" : "a").repeat(32), type: "managed", amount: "1.00", currency: "USD", description: "X0 replay" },
          cardTransactionMode: mode, saveCard: true, backUrl: "https://debateai.test/checkout/return"
        }, fake.privateKey);
        const notice = await fake.completeSignedOrder({ orderPayload: signed.payload, orderChecksum: signed.checksum, cardCountry: "RO", succeed: true });
        return { customerId, notice };
      };
      // Step (g): 0.40 of 1.00, then a second partial refund of 0.30, then the rest (0.30). After each partial refund
      // the payment itself (status, amount) and the refund listing (through refundsOf) must read as xMoney's did.
      const paid = await pay("authAndCapture");
      const payment = paid.notice.transactionId;
      const recordedPayment = String(dataOf("transaction-refund-partial").id);
      const recordedRefunds = (kind: string) => answeredWith(fixture(kind).body, { method: "GET", path: /^\/transaction$/u },
        (replay) => replay.refundsOf({ transactionId: recordedPayment, orderId: "1", from, to }));
      const fakeRefunds = () => client.refundsOf({ transactionId: payment, orderId: paid.notice.orderId, from, to });
      await client.refund({ transactionId: payment, amountDecimal: "0.40", reason: "customer-demand", message: "x0" });
      const afterFirst = await client.getTransaction(payment);
      expect(recordedStatus("transaction-refund-partial"), "after a partial refund").toBe(afterFirst.status);
      expect(String(dataOf("transaction-refund-partial").amount), "the payment's amount after a partial refund")
        .toBe(afterFirst.amountDecimal);
      const fakeLinked = (await client.listTransactions({ from, to, orderId: paid.notice.orderId }))
        .some((transaction: XMoneyTransaction) => transaction.transactionType === "refund" && transaction.relatedTransactionIds.includes(payment));
      const recordedLinked = ((fixture("transaction-list-after-refund").body as { data: Array<Record<string, unknown>> }).data)
        .some((row) => row.transactionType === "refund"
          && Array.isArray(row.relatedTransactionIds) && row.relatedTransactionIds.map(String).includes(recordedPayment));
      expect(recordedLinked, "a partial refund is its own linked transaction").toBe(fakeLinked);
      const recordedFirst = await recordedRefunds("transaction-list-refund-after-partial");
      const fakeFirst = await fakeRefunds();
      expect(recordedFirst?.refundedDecimal ?? null, "the refund listing after a partial refund")
        .toBe(fakeFirst?.refundedDecimal ?? null);
      await client.refund({ transactionId: payment, amountDecimal: "0.30", reason: "customer-demand", message: "x0" });
      const afterSecond = await client.getTransaction(payment);
      expect(recordedStatus("transaction-refund-second-partial"), "after a second partial refund").toBe(afterSecond.status);
      expect(String(dataOf("transaction-refund-second-partial").amount), "the payment's amount after a second partial refund")
        .toBe(afterSecond.amountDecimal);
      const recordedSecond = await recordedRefunds("transaction-list-refund-after-second-partial");
      const fakeSecond = await fakeRefunds();
      expect(recordedSecond?.refundedDecimal ?? null, "the refund listing after a second partial refund")
        .toBe(fakeSecond?.refundedDecimal ?? null);
      expect(recordedSecond?.rows.length ?? 0, "one listed row per partial refund").toBe(fakeSecond?.rows.length ?? 0);
      await client.refund({ transactionId: payment, amountDecimal: "0.30", reason: "customer-demand", message: "x0" });
      expect(recordedStatus("transaction-refund-full"), "after the full refund").toBe((await client.getTransaction(payment)).status);
      // Step (h): the hold, its release, and a rebill of the auth-mode order.
      const held = await pay("auth");
      expect(recordedStatus("transaction-auth"), "an uncaptured hold").toBe((await client.getTransaction(held.notice.transactionId)).status);
      await client.refund({ transactionId: held.notice.transactionId, amountDecimal: null, reason: "customer-demand", message: "x0" });
      expect(recordedStatus("transaction-auth-released"), "a released hold").toBe((await client.getTransaction(held.notice.transactionId)).status);
      const rebilled = await client.rebill({ orderId: held.notice.orderId, customerId: held.customerId, amountDecimal: "1.00" });
      expect(recordedStatus("transaction-rebill-auth-order"), "a rebill of the auth-mode order")
        .toBe((await client.getTransaction(rebilled.transactionId)).status);
    } finally {
      await fake.stop();
    }
  });

  // X0 (i) is optional: xMoney may name no test amount that declines a rebill. When it was recorded, the real reply
  // (its HTTP status and body) must read as a decline — never as an outage, an unknown outcome or our key refused.
  it.runIf(fixtures.some((candidate) => candidate.kind === "rebill-declined-response"))(
    "read a rebill declined by a stage test amount as a decline (X0 (i))", async () => {
      const recorded = fixture("rebill-declined-response").body as { httpStatus: number; reply: unknown };
      const replay = new XMoneyClient({
        baseUrl: "https://stage.invalid", privateKey: Buffer.alloc(32, 1), siteId: "1",
        fetch: async () => new Response(JSON.stringify(recorded.reply), { status: recorded.httpStatus })
      });
      const outcome = await replay.rebill({ orderId: "1", customerId: "1", amountDecimal: "0.02" })
        .then(() => "ACCEPTED", (error: unknown) => (error as { code?: unknown }).code);
      if (outcome === "ACCEPTED") {
        // xMoney took the call and declined on the transaction: the renewal learns it from the transaction's status.
        expect(recordedStatus("transaction-rebill-declined"), "a declined rebill's transaction").toBe("complete-failed");
      } else {
        expect(["XMONEY_PAYMENT_FAILED", "XMONEY_REFUSED"], "a declined rebill's reply").toContain(outcome);
      }
    }
  );
});
