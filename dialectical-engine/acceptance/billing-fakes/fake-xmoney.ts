// acceptance/billing-fakes/fake-xmoney.ts
// A loopback stand-in for xMoney's REST API (the endpoints XMoneyClient calls, shapes from the OpenAPI copy),
// plus the browser half of an embedded payment (completeOrder / completeSignedOrder) and encrypted notices.
// Deliberately an INDEPENDENT implementation (node:crypto directly), so it can catch the client's mistakes.
import { createCipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { XMoneyNotice, XMoneyStatus } from "@debateai/payments-xmoney";

export type FakeXMoneyTransaction = {
  id: number; orderId: number; customerId: number; cardId: number | null;
  transactionType: "deposit" | "chargeback" | "refund"; transactionStatus: XMoneyStatus;
  transactionSource: "service-call" | "re-bill"; mode: "authAndCapture" | "auth";
  amountCents: number; refundedCents: number; currency: string; ip: string;
  createdAt: Date; refundedAt: Date | null; chargedBackAt: Date | null; relatedTransactionIds: number[];
};
type FakeOrder = { id: number; customerId: number; externalOrderId: string; orderType: "managed"; currency: string };
type FakeCustomer = { id: number; identifier: string; email: string; country: string | null };
type FakeCard = { id: number; customerId: number; countryCode: string | null };
type SentNotice = XMoneyNotice & { opensslResult: string };

export type FakeXMoneyOptions = Readonly<{
  privateKey?: Buffer; publicKey?: string; siteId?: string; port?: number; maxPerPage?: number;
}>;

export type FakeXMoney = Readonly<{
  baseUrl: string;
  privateKey: Buffer;
  publicKey: string;
  siteId: string;
  transactions: ReadonlyMap<string, FakeXMoneyTransaction>;
  /** `status` leaves the payment at that status instead (`3d-pending`: the person is still at the bank's check). */
  completeOrder(i: Readonly<{
    externalOrderId: string; amountDecimal: string; cardCountry: string | null; succeed: boolean;
    customerIdentifier?: string; cardTransactionMode?: "authAndCapture" | "auth"; status?: XMoneyStatus;
  }>): Promise<SentNotice>;
  completeSignedOrder(i: Readonly<{
    orderPayload: string; orderChecksum: string; cardCountry: string | null; succeed: boolean; status?: XMoneyStatus;
  }>): Promise<SentNotice>;
  noticeFor(transactionId: string): SentNotice;
  setCardCountry(cardId: string, iso2: string | null): void;
  /** The next rebill is declined with this error code (xMoney sends numbers; a word such as "insufficient-funds" reads as no code). */
  failNextRebill(code: number | string): void;
  stallNextRebill(): void;
  /** The next call of any kind is answered with this HTTP status and processes nothing (429, 408, 401, 403 …). */
  failNextStatus(status: number): void;
  /** Adds a row to this order's creation-date listings that the client's parser must refuse (a negative amount). */
  injectMalformedTransaction(orderId: string): string;
  chargeback(transactionId: string): string;
  stop(): Promise<void>;
}>;

const CENTS = /^([0-9]+)(?:\.([0-9]{1,2}))?$/u;
function cents(decimal: string): number {
  const match = CENTS.exec(decimal);
  if (match === null) throw new TypeError("FAKE_XMONEY_AMOUNT_INVALID");
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}
const decimal = (value: number): string => `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;

export async function startFakeXMoney(options: FakeXMoneyOptions = {}): Promise<FakeXMoney> {
  const privateKey = options.privateKey ?? Buffer.from(randomBytes(16).toString("hex"), "latin1");
  const publicKey = options.publicKey ?? `pk_fake_${randomBytes(8).toString("hex")}`;
  const siteId = options.siteId ?? "1";
  const maxPerPage = options.maxPerPage ?? 100;
  const customers = new Map<number, FakeCustomer>();
  const orders = new Map<number, FakeOrder>();
  const cards = new Map<number, FakeCard>();
  const transactions = new Map<string, FakeXMoneyTransaction>();
  let nextId = 1000;
  let failRebillCode: number | string | null = null;
  let stallRebill = false;
  let failStatus: number | null = null;
  const malformedRows: Array<{ id: number; orderId: number; customerId: number; createdAt: Date }> = [];
  const allocate = (): number => { nextId += 1; return nextId; };

  const transactionJson = (transaction: FakeXMoneyTransaction) => ({
    id: transaction.id, siteId: Number(siteId), orderId: transaction.orderId, customerId: transaction.customerId,
    transactionType: transaction.transactionType, transactionMethod: "card", transactionStatus: transaction.transactionStatus,
    ip: transaction.ip, amount: decimal(transaction.amountCents), currency: transaction.currency,
    creationDate: transaction.createdAt.toISOString(), creationTimestamp: Math.floor(transaction.createdAt.getTime() / 1000),
    transactionSource: transaction.transactionSource, cardId: transaction.cardId,
    relatedTransactionIds: transaction.relatedTransactionIds
  });

  const encrypt = (plaintext: string): string => {
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", privateKey, iv);
    return `${iv.toString("base64")},${Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]).toString("base64")}`;
  };

  const noticeFor = (transactionId: string): SentNotice => {
    const transaction = transactions.get(transactionId);
    if (transaction === undefined) throw new TypeError("FAKE_XMONEY_TRANSACTION_UNKNOWN");
    const order = orders.get(transaction.orderId)!;
    const customer = customers.get(transaction.customerId)!;
    const timestamp = Math.floor(Date.now() / 1000);
    const body = {
      transactionStatus: transaction.transactionStatus, orderId: transaction.orderId,
      externalOrderId: order.externalOrderId, transactionId: transaction.id, customerId: transaction.customerId,
      identifier: customer.identifier, amount: transaction.amountCents / 100, currency: transaction.currency,
      cardId: transaction.cardId, transactionMethod: "card", timestamp, customData: null
    };
    return Object.freeze({
      transactionStatus: transaction.transactionStatus, orderId: String(transaction.orderId),
      externalOrderId: order.externalOrderId, transactionId: String(transaction.id),
      customerId: String(transaction.customerId), amountDecimal: String(transaction.amountCents / 100),
      currency: transaction.currency, cardId: transaction.cardId === null ? null : String(transaction.cardId),
      timestamp, opensslResult: encrypt(JSON.stringify(body))
    });
  };

  const addTransaction = (i: Omit<FakeXMoneyTransaction, "id" | "refundedCents" | "refundedAt" | "chargedBackAt" | "relatedTransactionIds" | "createdAt"> & { relatedTransactionIds?: number[] }): FakeXMoneyTransaction => {
    const transaction: FakeXMoneyTransaction = {
      ...i, id: allocate(), refundedCents: 0, refundedAt: null, chargedBackAt: null, createdAt: new Date(),
      relatedTransactionIds: i.relatedTransactionIds ?? []
    };
    transactions.set(String(transaction.id), transaction);
    return transaction;
  };

  const completeOrder: FakeXMoney["completeOrder"] = async (i) => {
    const customer = i.customerIdentifier === undefined
      ? [...customers.values()].at(-1)
      : [...customers.values()].find((candidate) => candidate.identifier === i.customerIdentifier);
    if (customer === undefined) throw new TypeError("FAKE_XMONEY_CUSTOMER_UNKNOWN");
    let order = [...orders.values()].find((candidate) => candidate.externalOrderId === i.externalOrderId);
    if (order === undefined) {
      order = { id: allocate(), customerId: customer.id, externalOrderId: i.externalOrderId, orderType: "managed", currency: "USD" };
      orders.set(order.id, order);
    }
    const card: FakeCard = { id: allocate(), customerId: customer.id, countryCode: i.cardCountry };
    cards.set(card.id, card);
    const transaction = addTransaction({
      orderId: order.id, customerId: customer.id, cardId: card.id, transactionType: "deposit",
      transactionStatus: i.status ?? (i.succeed ? "complete-ok" : "complete-failed"), transactionSource: "service-call",
      mode: i.cardTransactionMode ?? "authAndCapture", amountCents: cents(i.amountDecimal), currency: "USD",
      ip: "203.0.113.10"
    });
    return noticeFor(String(transaction.id));
  };

  const completeSignedOrder: FakeXMoney["completeSignedOrder"] = async (i) => {
    const json = Buffer.from(i.orderPayload, "base64").toString("utf8");
    const expected = createHmac("sha512", privateKey).update(json, "utf8").digest();
    const given = Buffer.from(i.orderChecksum, "base64");
    if (given.byteLength !== expected.byteLength || !timingSafeEqual(given, expected)) {
      throw new TypeError("FAKE_XMONEY_CHECKSUM_INVALID");
    }
    const order = JSON.parse(json) as {
      customer: { identifier: string }; order: { orderId: string; amount: string }; cardTransactionMode: "authAndCapture" | "auth";
    };
    return completeOrder({
      externalOrderId: order.order.orderId, amountDecimal: order.order.amount, cardCountry: i.cardCountry,
      succeed: i.succeed, customerIdentifier: order.customer.identifier, cardTransactionMode: order.cardTransactionMode,
      ...(i.status === undefined ? {} : { status: i.status })
    });
  };

  const send = (response: ServerResponse, status: number, body: unknown): void => {
    response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  };
  const notFound = (response: ServerResponse, code: number, message: string): void =>
    send(response, 404, { code: 404, message: "Not Found", error: [{ code, message, type: "Exception" }] });
  const badRequest = (response: ServerResponse, message: string): void =>
    send(response, 400, { code: 400, message: "Bad Request", error: [{ code: 400, message, type: "Validation" }] });

  const handle = (request: IncomingMessage, response: ServerResponse, raw: string): void => {
    if (request.headers.authorization !== `Bearer ${privateKey.toString("latin1")}`) {
      send(response, 401, { code: 401, message: "Unauthorized" });
      return;
    }
    if (failStatus !== null) {
      const status = failStatus;
      failStatus = null;
      send(response, status, { code: status, message: "Fake failure" });
      return;
    }
    const url = new URL(request.url ?? "/", "http://fake.xmoney.test");
    const form = new URLSearchParams(raw);
    const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
    const [resource, id] = segments;
    if (request.method === "POST" && resource === "customer" && id === undefined) {
      const identifier = form.get("identifier");
      const email = form.get("email");
      if (identifier === null || email === null) { badRequest(response, "identifier and email are required"); return; }
      if ([...customers.values()].some((customer) => customer.identifier === identifier)) {
        send(response, 409, { code: 409, message: "Conflict", error: [{ code: 1627, message: "Customer already exists", type: "Exception" }] });
        return;
      }
      const customer: FakeCustomer = { id: allocate(), identifier, email, country: form.get("country") };
      customers.set(customer.id, customer);
      send(response, 201, { code: 201, message: "Created", data: { id: customer.id } });
      return;
    }
    if (request.method === "GET" && resource === "customer" && id === undefined) {
      const identifier = url.searchParams.get("identifier");
      const data = [...customers.values()].filter((customer) => identifier === null || customer.identifier === identifier)
        .map((customer) => ({ id: customer.id, identifier: customer.identifier, email: customer.email, country: customer.country }));
      send(response, 200, { code: 200, message: "Success", data });
      return;
    }
    if (request.method === "GET" && resource === "order" && id !== undefined) {
      const order = orders.get(Number(id));
      if (order === undefined) { notFound(response, 1100, "Order not found"); return; }
      send(response, 200, { code: 200, message: "Success", data: {
        id: order.id, siteId: Number(siteId), customerId: order.customerId, externalOrderId: order.externalOrderId,
        orderType: order.orderType, orderStatus: "complete-ok", currency: order.currency
      } });
      return;
    }
    if (request.method === "GET" && resource === "card" && id !== undefined) {
      const card = cards.get(Number(id));
      if (card === undefined || String(card.customerId) !== url.searchParams.get("customerId")) { notFound(response, 902, "Card not found"); return; }
      send(response, 200, { code: 200, message: "Success", data: {
        id: card.id, customerId: card.customerId, type: "visa", cardNumber: "411111******1111", cardStatus: "active",
        binInfo: { bin: "411111", brand: "VISA", type: "CREDIT", countryCode: card.countryCode, bank: "Fake Bank" }
      } });
      return;
    }
    if (request.method === "GET" && resource === "transaction" && id !== undefined) {
      const transaction = transactions.get(id);
      if (transaction === undefined) { notFound(response, 824, "Transaction not found"); return; }
      send(response, 200, { code: 200, message: "Success", data: transactionJson(transaction) });
      return;
    }
    if (request.method === "GET" && resource === "transaction" && id === undefined) {
      const dateType = url.searchParams.get("dateType") ?? "creation";
      const from = new Date(url.searchParams.get("createdAtFrom") ?? 0).getTime();
      const to = new Date(url.searchParams.get("createdAtTo") ?? "9999-12-31T00:00:00Z").getTime();
      const orderId = url.searchParams.get("orderId");
      const type = url.searchParams.get("transactionType");
      const perPage = Math.min(Number(url.searchParams.get("perPage") ?? "100"), maxPerPage);
      const page = Number(url.searchParams.get("page") ?? "1");
      const matching: Array<{ id: number; json: Record<string, unknown> }> = [...transactions.values()].filter((transaction) => {
        const at = dateType === "refund" ? transaction.refundedAt
          : dateType === "charge-back" ? transaction.chargedBackAt : transaction.createdAt;
        return at !== null && at.getTime() >= from && at.getTime() <= to
          && (orderId === null || String(transaction.orderId) === orderId)
          && (type === null || transaction.transactionType === type);
      }).map((transaction) => ({ id: transaction.id, json: transactionJson(transaction) }));
      if (dateType === "creation" && (type === null || type === "deposit")) {
        for (const row of malformedRows) {
          if (row.createdAt.getTime() < from || row.createdAt.getTime() > to) continue;
          if (orderId !== null && String(row.orderId) !== orderId) continue;
          matching.push({ id: row.id, json: {
            id: row.id, siteId: Number(siteId), orderId: row.orderId, customerId: row.customerId, transactionType: "deposit",
            transactionMethod: "card", transactionStatus: "complete-ok", amount: "-1.00", currency: "USD",
            creationDate: row.createdAt.toISOString()
          } });
        }
      }
      matching.sort((left, right) => left.id - right.id);
      const pageCount = Math.max(1, Math.ceil(matching.length / perPage));
      const data = matching.slice((page - 1) * perPage, page * perPage).map((row) => row.json);
      send(response, 200, { code: 200, message: "Success", pagination: {
        currentPageNumber: page, totalItemCount: matching.length, itemCountPerPage: perPage,
        currentItemCount: data.length, pageCount
      }, data });
      return;
    }
    if (request.method === "PATCH" && resource === "order-rebill" && id !== undefined) {
      const order = orders.get(Number(id));
      const customerId = form.get("customerId");
      const amount = form.get("amount");
      if (order === undefined || customerId !== String(order.customerId) || amount === null) { badRequest(response, "unknown order or customer"); return; }
      const previous = [...transactions.values()].filter((transaction) => transaction.orderId === order.id).at(-1);
      const failing = failRebillCode;
      failRebillCode = null;
      const transaction = addTransaction({
        orderId: order.id, customerId: order.customerId, cardId: previous?.cardId ?? null, transactionType: "deposit",
        transactionStatus: failing === null ? "complete-ok" : "complete-failed", transactionSource: "re-bill",
        mode: "authAndCapture", amountCents: cents(amount), currency: order.currency, ip: "203.0.113.10"
      });
      if (stallRebill) { stallRebill = false; return; }
      if (failing !== null) {
        send(response, 402, { code: 402, message: "Payment Required", data: { orderId: order.id, transactionId: transaction.id },
          error: [{ code: failing, message: "Transaction declined", type: "Exception" }] });
        return;
      }
      send(response, 200, { code: 200, message: "Success", data: { id: order.id, transactionId: transaction.id, cardId: transaction.cardId } });
      return;
    }
    if (request.method === "DELETE" && resource === "transaction" && id !== undefined) {
      const transaction = transactions.get(id);
      if (transaction === undefined) { notFound(response, 824, "Transaction not found"); return; }
      if (transaction.mode === "auth") {
        // Releasing an uncaptured hold (A12): no money moved, so nothing is refunded and no refund transaction exists.
        if (transaction.transactionStatus !== "complete-ok") { badRequest(response, "the hold is not open"); return; }
        transaction.transactionStatus = "void-ok";
        send(response, 200, { code: 200, message: "Success" });
        return;
      }
      const amount = form.get("amount");
      const refund = amount === null ? transaction.amountCents - transaction.refundedCents : cents(amount);
      if (transaction.transactionType !== "deposit" || refund <= 0 || transaction.refundedCents + refund > transaction.amountCents) {
        badRequest(response, "refund exceeds the transaction");
        return;
      }
      transaction.refundedCents += refund;
      transaction.refundedAt = new Date();
      // The careful model (task text): every refund is its own transaction linked to the payment, and the payment
      // reads refund-ok only once nothing is left to refund — a partial refund leaves it complete-ok.
      const refundTransaction = addTransaction({
        orderId: transaction.orderId, customerId: transaction.customerId, cardId: transaction.cardId,
        transactionType: "refund", transactionStatus: "complete-ok", transactionSource: transaction.transactionSource,
        mode: transaction.mode, amountCents: refund, currency: transaction.currency, ip: transaction.ip,
        relatedTransactionIds: [transaction.id]
      });
      refundTransaction.refundedAt = new Date();
      if (transaction.refundedCents === transaction.amountCents) transaction.transactionStatus = "refund-ok";
      send(response, 200, { code: 200, message: "Success" });
      return;
    }
    send(response, 404, { code: 404, message: "Not Found" });
  };

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => handle(request, response, Buffer.concat(chunks).toString("utf8")));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;

  return Object.freeze({
    baseUrl: `http://127.0.0.1:${port}`,
    privateKey,
    publicKey,
    siteId,
    transactions,
    completeOrder,
    completeSignedOrder,
    noticeFor,
    setCardCountry(cardId: string, iso2: string | null) {
      const card = cards.get(Number(cardId));
      if (card === undefined) throw new TypeError("FAKE_XMONEY_CARD_UNKNOWN");
      card.countryCode = iso2;
    },
    failNextRebill(code: number | string) { failRebillCode = code; },
    stallNextRebill() { stallRebill = true; },
    failNextStatus(status: number) { failStatus = status; },
    injectMalformedTransaction(orderId: string) {
      const order = orders.get(Number(orderId));
      if (order === undefined) throw new TypeError("FAKE_XMONEY_ORDER_UNKNOWN");
      const row = { id: allocate(), orderId: order.id, customerId: order.customerId, createdAt: new Date() };
      malformedRows.push(row);
      return String(row.id);
    },
    chargeback(transactionId: string) {
      const original = transactions.get(transactionId);
      if (original === undefined) throw new TypeError("FAKE_XMONEY_TRANSACTION_UNKNOWN");
      original.transactionStatus = "charge-back";
      original.chargedBackAt = new Date();
      const dispute = addTransaction({
        orderId: original.orderId, customerId: original.customerId, cardId: original.cardId, transactionType: "chargeback",
        transactionStatus: "charge-back", transactionSource: original.transactionSource, mode: original.mode,
        amountCents: original.amountCents, currency: original.currency, ip: original.ip,
        relatedTransactionIds: [original.id]
      });
      dispute.chargedBackAt = new Date();
      return String(dispute.id);
    },
    async stop() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
}
