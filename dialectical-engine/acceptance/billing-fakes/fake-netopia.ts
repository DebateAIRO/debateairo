// acceptance/billing-fakes/fake-netopia.ts
// A loopback stand-in for NETOPIA Payments API v2 (spec 2026-10-05 §2.20.1): `payment/card/start` (hosted starts and
// saved-card charges), `operation/status`, the payment page's outcomes, the signed message (the IPN) and failure controls.
// Deliberately an INDEPENDENT implementation (node: modules only, never @debateai/payments-netopia), written from NETOPIA's
// OpenAPI file and the research notes, so it can catch the client's mistakes. It also backs the dev stack (N8, N24).
import { createHash, generateKeyPairSync, randomBytes, randomInt, sign, type KeyObject } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type FakeNetopiaOutcome = "APPROVE" | "DECLINE" | "THREE_DS_PENDING" | "WALLET_NO_TOKEN";
export type FakeNetopiaChargeOutcome = "APPROVE" | "DECLINE" | "THREE_DS";
export type FakeNetopiaRoute = "START" | "CHARGE" | "STATUS";
export type FakeNetopiaFailure = "UNAVAILABLE" | "OUTCOME_UNKNOWN" | "CREDENTIALS" | "MERCHANT_SETTINGS";
export type FakeNetopiaOptions = Readonly<{
  port?: number; apiKey?: string; posSignature?: string;
  /** NETOPIA's numeric issuer country on paid cards (default 642, Romania). */
  cardCountry?: number;
  /** Where a saved card's token rides (N-4): `payment.binding.token` (default), `payment.instrument.token` or `payment.token`. */
  tokenAt?: "binding" | "instrument" | "payment";
  noticeContentType?: string;
  /** N-16: a status read without ntpID is answered (default) or reads as no such order. */
  statusWithoutNtpId?: "ANSWER" | "NOT_FOUND";
  /** N-11: the status of an approved 0 card check (default 2, authorized: nothing is captured at 0). */
  zeroCheckStatus?: 2 | 3;
  now?: () => Date;
}>;
export type FakeNetopiaOrder = Readonly<{
  orderId: string; ntpId: string; amountText: string; currency: string; clientId: string | null; tokenPayment: boolean;
  status: number; notifyUrl: string; returnUrl: string; token: string | null; refundedMicros: number; cardCountry: number; updatedAt: Date;
}>;
export type FakeNetopiaRequest = Readonly<{ route: FakeNetopiaRoute | "UNKNOWN"; path: string; authorization: string | null; bodyText: string }>;
export type FakeNetopiaDelivery = Readonly<{ orderId: string; status: number; httpStatus: number; responseText: string; lost: boolean }>;
export type FakeNetopia = Readonly<{
  baseUrl: string; apiKey: string; posSignature: string; trustedKeysPem: string;
  readonly orders: ReadonlyMap<string, FakeNetopiaOrder>;
  readonly lastRequests: ReadonlyArray<FakeNetopiaRequest>;
  pendingNotices(): number;
  /** `cardCountry`: NETOPIA's numeric issuer country this payment was made with (default: the fake's `cardCountry`). */
  pay(orderId: string, outcome: FakeNetopiaOutcome, code?: string, cardCountry?: number): void;
  nextCharge(outcome: FakeNetopiaChargeOutcome, code?: string): void;
  deliverNotices(notifyUrl?: string): Promise<ReadonlyArray<FakeNetopiaDelivery>>;
  resendLastNotice(orderId: string, notifyUrl?: string): Promise<FakeNetopiaDelivery>;
  refundInAdmin(orderId: string, amountMicros: number | "WHOLE"): void;
  setStatus(orderId: string, status: number): void;
  chargeback(orderId: string, status: 9 | 10 | 16): void;
  failNext(failure: FakeNetopiaFailure, route: FakeNetopiaRoute): void;
  loseNextNotice(): void;
  signNextNoticeWithUnknownKey(): void;
  close(): Promise<void>;
}>;

type Order = {
  orderId: string; ntpId: string; amountText: string; currency: string; clientId: string | null; tokenPayment: boolean;
  status: number; notifyUrl: string; returnUrl: string; token: string | null; refundedMicros: number; cardCountry: number; updatedAt: Date;
};
type Notice = Readonly<{ orderId: string; status: number; bodyText: string }>;
type Result = Readonly<{ status: number; text: string }>;

const APPROVED_MESSAGE = "Tranzacție aprobată";
const AMOUNT_TEXT = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/u;
const NUMERIC_COUNTRY = /^[0-9]{1,3}$/u;
const POS_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MAX_REQUEST_BYTES = 65_536;
const AMOUNT_SLOT = '"__AMOUNT__"';
const MERCHANT_SETTINGS: Result = Object.freeze({ status: 200, text: '{"error":{"code":"32","message":"Incorrect merchant settings"}}' });
const NOT_FOUND: Result = Object.freeze({ status: 200, text: '{"error":{"code":"404","message":"Order not found"}}' });

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const filledText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

function cents(amountText: string): number {
  const match = AMOUNT_TEXT.exec(amountText);
  if (match === null) throw new TypeError("FAKE_NETOPIA_AMOUNT_INVALID");
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** NETOPIA's request as parsed by a server that keeps each number's own digits (so "24.2" is compared as written). */
function parseRequest(text: string): unknown {
  try {
    return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) =>
      typeof value === "number" ? context?.source ?? String(value) : value);
  } catch {
    return undefined;
  }
}

/** JSON text whose one amount is the order's own digits, as NETOPIA writes a number. */
function withAmount(value: unknown, amountText: string): string {
  return JSON.stringify(value).replace(AMOUNT_SLOT, amountText);
}

/** Five dash-separated groups of four; randomInt picks each character evenly (a byte modulo 36 favours some). */
function randomPosSignature(): string {
  return Array.from({ length: 5 }, () =>
    Array.from({ length: 4 }, () => POS_ALPHABET.charAt(randomInt(POS_ALPHABET.length))).join("")).join("-");
}

/** The first field a request lacks or must not carry (NETOPIA's required lists, spec §2.4.2), else null. */
function refusedField(json: unknown, route: "START" | "CHARGE"): string | null {
  const root = record(json);
  const config = record(root.config);
  const payment = record(root.payment);
  const instrument = record(payment.instrument);
  const order = record(root.order);
  const billing = record(order.billing);
  for (const [name, value] of [["config.notifyUrl", config.notifyUrl], ["config.redirectUrl", config.redirectUrl],
    ["config.language", config.language], ["order.posSignature", order.posSignature], ["order.dateTime", order.dateTime],
    ["order.description", order.description], ["order.orderID", order.orderID], ["order.currency", order.currency]] as const) {
    if (!filledText(value)) return name;
  }
  if (typeof order.amount !== "string" || !AMOUNT_TEXT.test(order.amount)) return "order.amount";
  for (const field of ["email", "phone", "firstName", "lastName", "city", "countryName", "state", "details"]) {
    if (!filledText(billing[field])) return `billing.${field}`;
  }
  if (typeof billing.postalCode !== "string") return "billing.postalCode";
  if (typeof billing.country !== "string" || !NUMERIC_COUNTRY.test(billing.country)) return "billing.country";
  if (instrument.type !== "card") return "instrument.type";
  for (const cardField of ["account", "expMonth", "expYear", "secretCode"]) if (Object.hasOwn(instrument, cardField)) return `instrument.${cardField}`;
  if (route === "CHARGE") {
    if (!filledText(instrument.token)) return "instrument.token";
    if (!filledText(record(payment.data).IP_ADDRESS)) return "data.IP_ADDRESS";
    if (order.scaExemptionInd !== "MIT") return "order.scaExemptionInd";
    if (Object.hasOwn(order, "clientID") || Object.hasOwn(instrument, "clientID")) return "clientID";
    if (cents(order.amount) === 0) return "order.amount";
  }
  return null;
}

export async function startFakeNetopia(options: FakeNetopiaOptions = {}): Promise<FakeNetopia> {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const trustedKeysPem = String(publicKey.export({ type: "spki", format: "pem" }));
  const apiKey = options.apiKey ?? ["fake", "netopia", randomBytes(12).toString("hex")].join("-");
  const posSignature = options.posSignature ?? randomPosSignature();
  const cardCountry = options.cardCountry ?? 642;
  const tokenAt = options.tokenAt ?? "binding";
  const noticeContentType = options.noticeContentType ?? "application/json";
  const statusWithoutNtpId = options.statusWithoutNtpId ?? "ANSWER";
  const zeroCheckStatus = options.zeroCheckStatus ?? 2;
  const clock = options.now ?? (() => new Date());
  const orders = new Map<string, Order>();
  const issuedTokens = new Set<string>();
  const queue: Notice[] = [];
  const lastSent = new Map<string, Readonly<{ bodyText: string; jwt: string; status: number }>>();
  const requests: FakeNetopiaRequest[] = [];
  const failures = new Map<FakeNetopiaRoute, FakeNetopiaFailure>();
  const chargeOutcomes: Array<Readonly<{ outcome: FakeNetopiaChargeOutcome; code: string | null }>> = [];
  let ntpSequence = 7_000_000;
  let loseNext = false;
  let unknownKeyNext = false;
  let baseUrl = "";

  const nextNtpId = (): string => { ntpSequence += 1; return String(ntpSequence); };
  const issueToken = (): string => {
    const token = ["fake", "tok", randomBytes(24).toString("base64url")].join("-");
    issuedTokens.add(token);
    return token;
  };
  const orderOf = (orderId: string): Order => {
    const order = orders.get(orderId);
    if (order === undefined) throw new TypeError("FAKE_NETOPIA_ORDER_UNKNOWN");
    return order;
  };
  const operationDate = (order: Order): string => (order.status === 1 ? "0001-01-01T00:00:00" : order.updatedAt.toISOString());

  /** The card members of a payment: the token where `tokenAt` puts it, the card's expiry, its masked number and country. */
  const cardMembers = (country: number, token: string | null): Record<string, unknown> => {
    const instrument = { panMasked: "9****5098", country };
    const expiry = { expireMonth: 12, expireYear: 2030 };
    if (token === null) return { instrument };
    if (tokenAt === "binding") return { binding: { token, ...expiry }, instrument };
    if (tokenAt === "instrument") return { binding: expiry, instrument: { ...instrument, token } };
    return { token, binding: expiry, instrument };
  };
  const paymentMembers = (order: Order): Record<string, unknown> =>
    ({ method: "card", ntpID: order.ntpId, status: order.status, amount: "__AMOUNT__", currency: order.currency });

  const queueNotice = (order: Order, token: string | null, code: string, message: string): void => {
    const body = {
      payment: { ...paymentMembers(order), ...cardMembers(order.cardCountry, token), code, message, operationDate: operationDate(order) },
      order: { orderID: order.orderId }
    };
    queue.push(Object.freeze({ orderId: order.orderId, status: order.status, bodyText: withAmount(body, order.amountText) }));
  };

  /** NETOPIA's message: RS512 over `header.payload`, iss "NETOPIA Payments", aud an array, sub = base64(SHA-512(bytes)). */
  const jwtFor = (bodyText: string, key: KeyObject): string => {
    const header = Buffer.from(JSON.stringify({ alg: "RS512", typ: "JWT" })).toString("base64url");
    const claims = Buffer.from(JSON.stringify({
      iss: "NETOPIA Payments", aud: [posSignature], iat: Math.floor(clock().getTime() / 1000),
      sub: createHash("sha512").update(Buffer.from(bodyText, "utf8")).digest("base64")
    })).toString("base64url");
    return `${header}.${claims}.${sign("sha512", Buffer.from(`${header}.${claims}`), key).toString("base64url")}`;
  };

  const deliver = async (orderId: string, bodyText: string, status: number, jwt: string, notifyUrl: string | undefined): Promise<FakeNetopiaDelivery> => {
    lastSent.set(orderId, Object.freeze({ bodyText, jwt, status }));
    const reply = await fetch(notifyUrl ?? orderOf(orderId).notifyUrl, {
      method: "POST", headers: { "content-type": noticeContentType, "Verification-token": jwt },
      body: Buffer.from(bodyText, "utf8"), redirect: "manual"
    });
    return Object.freeze({ orderId, status, httpStatus: reply.status, responseText: await reply.text(), lost: false });
  };

  const reused = (existing: Order, amountText: string): Result => cents(amountText) !== cents(existing.amountText)
    ? { status: 200, text: '{"error":{"code":"99","message":"There is another order with a different price"}}' }
    : { status: 200, text: withAmount({ error: { code: "56", message: "Order closed" },
      payment: { ...paymentMembers(existing) }, order: { orderID: existing.orderId } }, existing.amountText) };

  const newOrder = (json: unknown, tokenPayment: boolean): Order => {
    const root = record(json);
    const order = record(root.order);
    const instrument = record(record(root.payment).instrument);
    const config = record(root.config);
    const clientId = typeof order.clientID === "string" ? order.clientID : typeof instrument.clientID === "string" ? instrument.clientID : null;
    const created: Order = {
      orderId: String(order.orderID), ntpId: nextNtpId(), amountText: String(order.amount), currency: String(order.currency),
      clientId: tokenPayment ? null : clientId, tokenPayment, status: 1, notifyUrl: String(config.notifyUrl),
      returnUrl: String(config.redirectUrl), token: null, refundedMicros: 0, cardCountry, updatedAt: clock()
    };
    orders.set(created.orderId, created);
    return created;
  };

  const startAnswer = (json: unknown): Result => {
    const refused = refusedField(json, "START");
    if (refused !== null) return { status: 400, text: JSON.stringify({ code: "400", message: `Bad Request: ${refused}` }) };
    const order = record(record(json).order);
    if (order.posSignature !== posSignature) return MERCHANT_SETTINGS;
    const existing = orders.get(String(order.orderID));
    if (existing !== undefined) return reused(existing, String(order.amount));
    const created = newOrder(json, false);
    return { status: 200, text: withAmount({
      error: { code: "101", message: "Redirect user to payment page" },
      payment: { ...paymentMembers(created), operationDate: "0001-01-01T00:00:00",
        paymentURL: `${baseUrl}/ui/card?p=${randomBytes(9).toString("base64url")}`, binding: { expireMonth: 0, expireYear: 0 }, instrument: { country: 0 } }
    }, created.amountText) };
  };

  const chargeAnswer = (json: unknown): Result => {
    const refused = refusedField(json, "CHARGE");
    if (refused !== null) return { status: 400, text: JSON.stringify({ code: "400", message: `Bad Request: ${refused}` }) };
    const order = record(record(json).order);
    if (order.posSignature !== posSignature) return MERCHANT_SETTINGS;
    const existing = orders.get(String(order.orderID));
    if (existing !== undefined) return reused(existing, String(order.amount));
    if (!issuedTokens.has(String(record(record(record(json).payment).instrument).token))) {
      return { status: 200, text: '{"error":{"code":"99","message":"Invalid token"}}' };
    }
    const created = newOrder(json, true);
    const next = chargeOutcomes.shift() ?? { outcome: "APPROVE" as const, code: null };
    if (next.outcome === "DECLINE") {
      created.status = 12;
      const code = next.code ?? "20";
      queueNotice(created, null, code, "Declined");
      return { status: 200, text: withAmount({ error: { code, message: "Declined" }, payment: paymentMembers(created), order: { orderID: created.orderId } }, created.amountText) };
    }
    if (next.outcome === "THREE_DS") {
      created.status = 15;
      queueNotice(created, null, "100", "3-D Secure authentication required");
      return { status: 200, text: withAmount({ error: { code: "100", message: "3-D Secure authentication required" }, payment: paymentMembers(created), order: { orderID: created.orderId } }, created.amountText) };
    }
    created.status = 3;
    created.token = issueToken();
    queueNotice(created, created.token, "00", APPROVED_MESSAGE);
    return { status: 200, text: withAmount({
      error: { code: "00", message: "Approved" },
      payment: { ...paymentMembers(created), ...cardMembers(created.cardCountry, created.token), operationDate: operationDate(created) },
      order: { orderID: created.orderId }
    }, created.amountText) };
  };

  const statusAnswer = (json: unknown): Result => {
    const body = record(json);
    if (body.posID !== posSignature) return MERCHANT_SETTINGS;
    const order = typeof body.orderID === "string" ? orders.get(body.orderID) : undefined;
    const ntpId = typeof body.ntpID === "string" ? body.ntpID : "";
    if (order === undefined || (ntpId === "" ? statusWithoutNtpId === "NOT_FOUND" : ntpId !== order.ntpId)) return NOT_FOUND;
    const touched = order.status !== 1;
    return { status: 200, text: withAmount({
      merchant: { posID: 1, posName: "fake" }, card: {}, error: { code: "00", message: "OK" },
      payment: { ...paymentMembers(order), operationDate: operationDate(order),
        binding: { expireMonth: order.token === null ? 0 : 12, expireYear: order.token === null ? 0 : 2030 },
        instrument: { panMasked: touched ? "9****5098" : "", country: touched ? order.cardCountry : 0 } },
      order: { orderID: order.orderId, ...(order.clientId === null ? {} : { clientID: order.clientId }) }
    }, order.amountText) };
  };

  const answer = (response: ServerResponse, result: Result): void => {
    response.writeHead(result.status, { "content-type": "application/json" }).end(result.text);
  };

  const handle = (request: IncomingMessage, response: ServerResponse, raw: Buffer): void => {
    const path = (request.url ?? "/").split("?")[0] ?? "/";
    if (request.method === "GET" && path === "/ui/card") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<!doctype html><title>NETOPIA fake</title><p>The test pays this order.</p>");
      return;
    }
    const bodyText = raw.toString("utf8");
    const json = parseRequest(bodyText);
    const hasToken = typeof record(record(record(json).payment).instrument).token === "string";
    const route: FakeNetopiaRoute | "UNKNOWN" = request.method !== "POST" ? "UNKNOWN"
      : path === "/payment/card/start" ? (hasToken ? "CHARGE" : "START") : path === "/operation/status" ? "STATUS" : "UNKNOWN";
    const authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : null;
    requests.push(Object.freeze({ route, path, authorization, bodyText }));
    if (route === "UNKNOWN") return answer(response, { status: 404, text: '{"code":"404","message":"Not Found"}' });
    const failure = failures.get(route);
    failures.delete(route);
    if (failure === "CREDENTIALS" || authorization !== apiKey) return answer(response, { status: 401, text: '{"code":"401","message":"Unauthorized"}' });
    if (failure === "UNAVAILABLE") return answer(response, { status: 429, text: '{"code":"429","message":"Too Many Requests"}' });
    if (failure === "MERCHANT_SETTINGS") return answer(response, MERCHANT_SETTINGS);
    if (json === undefined) return answer(response, { status: 400, text: '{"code":"400","message":"Bad Request"}' });
    const result = route === "STATUS" ? statusAnswer(json) : route === "CHARGE" ? chargeAnswer(json) : startAnswer(json);
    // OUTCOME_UNKNOWN: everything above happened (a charge is made); only the answer is lost.
    if (failure === "OUTCOME_UNKNOWN") {
      request.socket.destroy();
      return;
    }
    answer(response, result);
  };

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size <= MAX_REQUEST_BYTES) chunks.push(chunk);
    });
    request.on("end", () => {
      if (size > MAX_REQUEST_BYTES) return answer(response, { status: 413, text: '{"code":"413","message":"Payload Too Large"}' });
      handle(request, response, Buffer.concat(chunks));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return Object.freeze({
    baseUrl, apiKey, posSignature, trustedKeysPem,
    get orders(): ReadonlyMap<string, FakeNetopiaOrder> {
      return new Map([...orders].map(([orderId, order]) => [orderId, Object.freeze({ ...order })] as const));
    },
    get lastRequests(): ReadonlyArray<FakeNetopiaRequest> {
      return Object.freeze([...requests]);
    },
    pendingNotices: () => queue.length,
    pay(orderId: string, outcome: FakeNetopiaOutcome, code?: string, country?: number) {
      const order = orderOf(orderId);
      if (order.tokenPayment) throw new TypeError("FAKE_NETOPIA_NOT_A_PAGE_ORDER");
      if (country !== undefined) {
        if (!Number.isInteger(country) || country < 1 || country > 999) throw new TypeError("FAKE_NETOPIA_COUNTRY_INVALID");
        order.cardCountry = country;
      }
      order.updatedAt = clock();
      if (outcome === "DECLINE") {
        order.status = 12;
        queueNotice(order, null, code ?? "35", "Declined");
        return;
      }
      if (outcome === "THREE_DS_PENDING") {
        order.status = 15;
        queueNotice(order, null, "100", "3-D Secure authentication required");
        return;
      }
      order.status = cents(order.amountText) === 0 ? zeroCheckStatus : 3;
      // The token comes once: on the first paid message of an order started with a client id (never for a wallet).
      const token = outcome === "APPROVE" && order.clientId !== null && order.token === null ? issueToken() : null;
      if (token !== null) order.token = token;
      queueNotice(order, token, "00", APPROVED_MESSAGE);
    },
    nextCharge(outcome: FakeNetopiaChargeOutcome, code?: string) {
      chargeOutcomes.push(Object.freeze({ outcome, code: code ?? null }));
    },
    async deliverNotices(notifyUrl?: string) {
      const deliveries: FakeNetopiaDelivery[] = [];
      while (queue.length > 0) {
        const notice = queue.shift()!;
        if (loseNext) {
          loseNext = false;
          deliveries.push(Object.freeze({ orderId: notice.orderId, status: notice.status, httpStatus: 0, responseText: "", lost: true }));
          continue;
        }
        const signer = unknownKeyNext ? generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey : privateKey;
        unknownKeyNext = false;
        deliveries.push(await deliver(notice.orderId, notice.bodyText, notice.status, jwtFor(notice.bodyText, signer), notifyUrl));
      }
      return Object.freeze(deliveries);
    },
    async resendLastNotice(orderId: string, notifyUrl?: string) {
      const last = lastSent.get(orderId);
      if (last === undefined) throw new TypeError("FAKE_NETOPIA_NOTHING_SENT");
      return deliver(orderId, last.bodyText, last.status, last.jwt, notifyUrl);
    },
    refundInAdmin(orderId: string, amountMicros: number | "WHOLE") {
      const order = orderOf(orderId);
      const total = cents(order.amountText) * 10_000;
      order.refundedMicros = amountMicros === "WHOLE" ? total : Math.min(total, order.refundedMicros + amountMicros);
      order.status = 8;
      order.updatedAt = clock();
      queueNotice(order, null, "00", "Refunded");
    },
    setStatus(orderId: string, status: number) {
      const order = orderOf(orderId);
      order.status = status;
      order.updatedAt = clock();
      queueNotice(order, null, "00", `Status ${status}`);
    },
    chargeback(orderId: string, status: 9 | 10 | 16) {
      const order = orderOf(orderId);
      order.status = status;
      order.updatedAt = clock();
      queueNotice(order, null, "00", `Chargeback ${status}`);
    },
    failNext(failure: FakeNetopiaFailure, route: FakeNetopiaRoute) {
      failures.set(route, failure);
    },
    loseNextNotice() { loseNext = true; },
    signNextNoticeWithUnknownKey() { unknownKeyNext = true; },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
}
