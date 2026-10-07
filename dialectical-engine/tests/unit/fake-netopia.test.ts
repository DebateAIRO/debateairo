// tests/unit/fake-netopia.test.ts
// N5 (spec 2026-10-05 §2.20.1): the NETOPIA protocol fake, driven through the REAL client (N3) and checked with the REAL
// verifier and parser (N4) — the two sides were written apart, so each catches the other's mistakes. Plus the port stub
// and the signed-notice helper the later suites use.
import { randomBytes } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { paymentError, type HostedPaymentStart, type Payer, type PaymentReport, type SavedCardCharge } from "@debateai/billing-core";
import {
  answeredOrderReused, createNetopiaPayments, createSecretToken, loadTrustedKeys, parseNetopiaNotice, verifyNetopiaNotice
} from "@debateai/payments-netopia";
import { startFakeNetopia, type FakeNetopia, type FakeNetopiaOptions } from "../support/fake-netopia.js";
import { buildHostedStartBody } from "../../packages/payments-netopia/src/requests.js";
import { StubCardPayments, stubPaymentReport } from "../support/stub-card-payments.js";
import { signedNetopiaNotice, testNetopiaKeys } from "../support/netopia-notice.js";

const CLIENT = "ef".repeat(16);
const PAYER: Payer = Object.freeze({
  firstName: "Ana", lastName: "Pop", email: "ana@example.test", phone: "+40712345678", country: "RO",
  region: "Cluj", city: "Cluj-Napoca", postalCode: "400001", street: "Strada Exemplu 1"
});
const hex = (): string => randomBytes(16).toString("hex");
const OK_BODY = '{"errorType":0,"errorCode":0,"errorMessage":"OK"}';

type Received = Readonly<{ rawBody: Buffer; headers: IncomingHttpHeaders }>;
const servers: Server[] = [];
const fakes: FakeNetopia[] = [];
afterEach(async () => {
  for (const fake of fakes.splice(0)) await fake.close();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

/** Our notify route's stand-in: keeps the exact bytes and headers, answers NETOPIA's success body. */
async function receiver(): Promise<Readonly<{ url: string; received: Received[] }>> {
  const received: Received[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({ rawBody: Buffer.concat(chunks), headers: request.headers });
      response.writeHead(200, { "content-type": "application/json" }).end(OK_BODY);
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/billing/netopia/notify`, received };
}

async function setup(options: FakeNetopiaOptions = {}) {
  const fake = await startFakeNetopia(options);
  fakes.push(fake);
  const sink = await receiver();
  const payments = createNetopiaPayments({ baseUrl: fake.baseUrl, apiKey: fake.apiKey, posSignature: fake.posSignature });
  const trust = Object.freeze({ posSignature: fake.posSignature, keys: loadTrustedKeys(fake.trustedKeysPem) });
  const startOf = (orderId: string, amountMicros = 24_200_000): HostedPaymentStart => Object.freeze({
    orderId, amountMicros, currency: "USD", description: "DebateAI Plus, one month", payer: PAYER, clientId: CLIENT,
    returnUrl: `https://debateai.test/checkout/return?charge=${orderId}`, notifyUrl: sink.url, language: "ro"
  });
  const chargeOf = (orderId: string, token: string, amountMicros = 24_200_000): SavedCardCharge => Object.freeze({
    orderId, amountMicros, currency: "USD", description: "DebateAI Plus, one month", payer: PAYER, cardToken: createSecretToken(token),
    payerIp: "203.0.113.7", returnUrl: `https://debateai.test/checkout/return?charge=${orderId}`, notifyUrl: sink.url, language: "ro"
  });
  /** A started order paid on the fake's page, its first message delivered: the token the fake issued is returned. */
  const paidWithCard = async (): Promise<Readonly<{ orderId: string; ntpId: string; token: string }>> => {
    const orderId = hex();
    const started = await payments.startHostedPayment(startOf(orderId));
    fake.pay(orderId, "APPROVE");
    await fake.deliverNotices();
    return { orderId, ntpId: started.providerPaymentId, token: fake.orders.get(orderId)!.token! };
  };
  return { fake, sink, payments, trust, startOf, chargeOf, paidWithCard };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { if (error instanceof TypedDomainError) return error.code; throw error; }
  throw new Error("expected a refusal");
}
const asReport = (value: PaymentReport | "NO_SUCH_ORDER"): PaymentReport => {
  if (value === "NO_SUCH_ORDER") throw new Error("expected a report");
  return value;
};
const headerOf = (notice: Received): string => notice.headers["verification-token"] as string;

describe("N5 — the fake's hosted payments, through the real client (spec §2.20.1)", () => {
  it("starts a hosted payment: a page on the fake's own origin, the order and the request recorded", async () => {
    const { fake, payments, startOf } = await setup();
    const orderId = hex();
    const started = await payments.startHostedPayment(startOf(orderId));
    expect(started.redirectUrl.startsWith(`${fake.baseUrl}/ui/card?p=`)).toBe(true);
    expect(fake.orders.get(orderId)).toMatchObject({ ntpId: started.providerPaymentId, status: 1, amountText: "24.2", clientId: CLIENT, tokenPayment: false });
    expect(fake.lastRequests.at(-1)).toMatchObject({ route: "START", path: "/payment/card/start", authorization: fake.apiKey });
    expect((await fetch(started.redirectUrl)).status).toBe(200);
    expect(fake.posSignature).toMatch(/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){4}$/u);
  });

  it("sends one signed message for an approved payment, carrying the token, over the exact non-ASCII bytes", async () => {
    const { fake, sink, payments, trust, startOf } = await setup();
    const orderId = hex();
    const started = await payments.startHostedPayment(startOf(orderId));
    fake.pay(orderId, "APPROVE");
    expect(fake.pendingNotices()).toBe(1);
    expect(await fake.deliverNotices()).toEqual([{ orderId, status: 3, httpStatus: 200, responseText: OK_BODY, lost: false }]);
    const [notice] = sink.received;
    expect(notice!.headers["content-type"]).toBe("application/json");
    expect(notice!.rawBody.toString("utf8")).toContain("Tranzacție aprobată");
    expect(verifyNetopiaNotice(notice!.rawBody, headerOf(notice!), trust)).toMatchObject({ ok: true, keyFingerprint: trust.keys[0]!.fingerprint });
    const claims = JSON.parse(Buffer.from(headerOf(notice!).split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
    expect(claims).toMatchObject({ iss: "NETOPIA Payments", aud: [fake.posSignature] });
    const parsed = parseNetopiaNotice(notice!.rawBody, new Date());
    expect(parsed).toMatchObject({ readable: true, orderId, providerPaymentId: started.providerPaymentId, providerStatus: 3, amountText: "24.2", currency: "USD", cardCountry: "RO" });
    expect(parsed.savedCard?.token.reveal()).toBe(fake.orders.get(orderId)!.token);
    expect(asReport(await payments.status({ orderId, providerPaymentId: started.providerPaymentId })))
      .toMatchObject({ state: "PAID", amountMicros: 24_200_000, cardCountry: "RO", savedCard: null, clientId: CLIENT });
  });

  it("lets the person retry a declined card on the same order; the token rides on the first PAID message only", async () => {
    const { fake, sink, payments, startOf } = await setup();
    const orderId = hex();
    await payments.startHostedPayment(startOf(orderId));
    fake.pay(orderId, "DECLINE", "20");
    fake.pay(orderId, "APPROVE");
    expect((await fake.deliverNotices()).map((delivery) => delivery.status)).toEqual([12, 3]);
    const [declined, paid] = sink.received.map((notice) => parseNetopiaNotice(notice.rawBody, new Date()));
    expect(declined).toMatchObject({ providerStatus: 12, code: "20", savedCard: null });
    expect(paid?.savedCard).not.toBeNull();
    expect(asReport(await payments.status({ orderId, providerPaymentId: null })).state).toBe("PAID");
  });

  it("holds 3-D Secure pending, pays a wallet with no saved card, and authorizes a 0 card check with one", async () => {
    const { fake, sink, payments, startOf } = await setup();
    const pending = hex();
    await payments.startHostedPayment(startOf(pending));
    fake.pay(pending, "THREE_DS_PENDING");
    expect(asReport(await payments.status({ orderId: pending, providerPaymentId: null })).state).toBe("ACTION_REQUIRED");
    const wallet = hex();
    await payments.startHostedPayment(startOf(wallet));
    fake.pay(wallet, "WALLET_NO_TOKEN");
    const check = hex();
    await payments.startHostedPayment(startOf(check, 0));
    fake.pay(check, "APPROVE");
    await fake.deliverNotices();
    const parsed = sink.received.map((notice) => parseNetopiaNotice(notice.rawBody, new Date()));
    expect(parsed.map((notice) => [notice.orderId, notice.providerStatus, notice.savedCard === null]))
      .toEqual([[pending, 15, true], [wallet, 3, true], [check, 2, false]]);
    expect(asReport(await payments.status({ orderId: check, providerPaymentId: null })).state).toBe("AUTHORIZED");
  });

  it("refuses card data in a hosted start (the page collects it), an incomplete request and an unknown route", async () => {
    const { fake, startOf } = await setup();
    const post = (body: unknown, path = "/payment/card/start") =>
      fetch(`${fake.baseUrl}${path}`, { method: "POST", headers: { authorization: fake.apiKey }, body: JSON.stringify(body) });
    const valid = JSON.parse(buildHostedStartBody(startOf(hex()), { posSignature: fake.posSignature, now: new Date() }));
    const withCard = JSON.parse(buildHostedStartBody(startOf(hex()), { posSignature: fake.posSignature, now: new Date() }));
    withCard.payment.instrument.account = "4111";
    const refused = await post(withCard);
    expect([refused.status, await refused.text()]).toEqual([400, JSON.stringify({ code: "400", message: "Bad Request: instrument.account" })]);
    expect((await post(valid)).status).toBe(200);
    expect((await post({ config: {}, payment: {}, order: {} })).status).toBe(400);
    expect((await post({}, "/nowhere")).status).toBe(404);
  });
});

describe("N5 — saved-card charges (spec §2.4.2, §2.9)", () => {
  it("charges the issued token at once, with a NEW token in its answer and in its message", async () => {
    const { fake, sink, payments, chargeOf, paidWithCard } = await setup();
    const first = await paidWithCard();
    const orderId = hex();
    const report = await payments.chargeSavedCard(chargeOf(orderId, first.token));
    expect(report).toMatchObject({ orderId, state: "PAID", amountMicros: 24_200_000 });
    expect(report.savedCard?.token.reveal()).not.toBe(first.token);
    expect(fake.lastRequests.at(-1)?.route).toBe("CHARGE");
    expect(fake.orders.get(orderId)).toMatchObject({ tokenPayment: true, status: 3 });
    await fake.deliverNotices();
    expect(parseNetopiaNotice(sink.received.at(-1)!.rawBody, new Date()).savedCard?.token.reveal()).toBe(report.savedCard?.token.reveal());
  });

  it("answers a repeated orderID with the existing payment (56), and with another amount 99", async () => {
    const { payments, chargeOf, paidWithCard } = await setup();
    const { token } = await paidWithCard();
    const orderId = hex();
    const first = await payments.chargeSavedCard(chargeOf(orderId, token));
    const again = await payments.chargeSavedCard(chargeOf(orderId, token));
    expect(again).toMatchObject({ state: "PAID", providerPaymentId: first.providerPaymentId });
    expect(answeredOrderReused(again)).toBe(true);
    expect(await codeOf(payments.chargeSavedCard(chargeOf(orderId, token, 30_000_000)))).toBe("PAYMENT_CONFIGURATION_REFUSED:99");
    expect(await codeOf(payments.chargeSavedCard(chargeOf(hex(), ["not", "issued", "token"].join("-"))))).toBe("PAYMENT_CONFIGURATION_REFUSED:99");
  });

  it("declines on the card, or asks for 3-D Secure, when the next charge is told to", async () => {
    const { fake, payments, chargeOf, paidWithCard } = await setup();
    const { token } = await paidWithCard();
    fake.nextCharge("DECLINE", "20");
    expect(await payments.chargeSavedCard(chargeOf(hex(), token))).toMatchObject({ state: "DECLINED", declineSide: "CARD", bankDeclined: true, savedCard: null });
    fake.nextCharge("THREE_DS");
    expect((await payments.chargeSavedCard(chargeOf(hex(), token))).state).toBe("ACTION_REQUIRED");
  });

  it("puts the token where the recording may find it: binding, instrument or payment (N-4)", async () => {
    for (const tokenAt of ["binding", "instrument", "payment"] as const) {
      const { payments, chargeOf, paidWithCard } = await setup({ tokenAt });
      const { token } = await paidWithCard();
      expect((await payments.chargeSavedCard(chargeOf(hex(), token))).savedCard, tokenAt).not.toBeNull();
    }
  });
});

describe("N5 — status reads, refunds and disputes (spec §2.12, §2.13, §2.14)", () => {
  it("reads with and without ntpID, and says no such order plainly", async () => {
    const { payments, paidWithCard } = await setup();
    const { orderId, ntpId } = await paidWithCard();
    expect(await payments.status({ orderId: hex(), providerPaymentId: null })).toBe("NO_SUCH_ORDER");
    expect(asReport(await payments.status({ orderId, providerPaymentId: null })).state).toBe("PAID");
    expect(asReport(await payments.status({ orderId, providerPaymentId: ntpId })).state).toBe("PAID");
    expect(await payments.status({ orderId, providerPaymentId: "999999999" })).toBe("NO_SUCH_ORDER");
    const strict = await setup({ statusWithoutNtpId: "NOT_FOUND" });
    const paid = await strict.paidWithCard();
    expect(await strict.payments.status({ orderId: paid.orderId, providerPaymentId: null })).toBe("NO_SUCH_ORDER");
    expect(asReport(await strict.payments.status({ orderId: paid.orderId, providerPaymentId: paid.ntpId })).state).toBe("PAID");
  });

  it("reports admin refunds (whole and partial), the three charge-back statuses and status 17, each with a message", async () => {
    const { fake, payments, paidWithCard } = await setup();
    const stateOf = async (orderId: string) => asReport(await payments.status({ orderId, providerPaymentId: null })).state;
    const [whole, part, disputed] = [await paidWithCard(), await paidWithCard(), await paidWithCard()];
    fake.refundInAdmin(whole!.orderId, "WHOLE");
    expect([await stateOf(whole!.orderId), fake.orders.get(whole!.orderId)!.refundedMicros]).toEqual(["REFUNDED", 24_200_000]);
    fake.refundInAdmin(part!.orderId, 10_000_000);
    expect([await stateOf(part!.orderId), fake.orders.get(part!.orderId)!.refundedMicros]).toEqual(["REFUNDED", 10_000_000]);
    const states: string[] = [];
    for (const status of [9, 10, 16] as const) {
      fake.chargeback(disputed!.orderId, status);
      states.push(await stateOf(disputed!.orderId));
    }
    fake.setStatus(disputed!.orderId, 17);
    states.push(await stateOf(disputed!.orderId));
    expect(states).toEqual(["CHARGEBACK_OPENED", "CHARGEBACK_LOST", "CHARGEBACK_REPRESENTED", "UNCLEAR"]);
    expect((await fake.deliverNotices()).map((delivery) => delivery.status)).toEqual([8, 8, 9, 10, 16, 17]);
  });
});

describe("N5 — the failure controls (spec §2.20.1)", () => {
  it("maps each failure to the client's code, for one request only", async () => {
    const { fake, payments, startOf, chargeOf, paidWithCard } = await setup();
    fake.failNext("UNAVAILABLE", "START");
    expect(await codeOf(payments.startHostedPayment(startOf(hex())))).toBe("PAYMENT_PROVIDER_UNAVAILABLE:429");
    await payments.startHostedPayment(startOf(hex()));
    fake.failNext("MERCHANT_SETTINGS", "START");
    expect(await codeOf(payments.startHostedPayment(startOf(hex())))).toBe("PAYMENT_CONFIGURATION_REFUSED:32");
    fake.failNext("CREDENTIALS", "STATUS");
    expect(await codeOf(payments.status({ orderId: hex(), providerPaymentId: null }))).toBe("PAYMENT_CREDENTIALS_REFUSED:401");
    const wrongKey = createNetopiaPayments({ baseUrl: fake.baseUrl, apiKey: ["wrong", "key", "0001"].join("-"), posSignature: fake.posSignature });
    expect(await codeOf(wrongKey.status({ orderId: hex(), providerPaymentId: null }))).toBe("PAYMENT_CREDENTIALS_REFUSED:401");
    const { token } = await paidWithCard();
    const lost = hex();
    fake.failNext("OUTCOME_UNKNOWN", "CHARGE");
    expect((await codeOf(payments.chargeSavedCard(chargeOf(lost, token)))).startsWith("PAYMENT_OUTCOME_UNKNOWN")).toBe(true);
    // The charge happened; only its answer was lost (spec §2.9.3's probe finds it).
    expect(asReport(await payments.status({ orderId: lost, providerPaymentId: null })).state).toBe("PAID");
  });

  it("loses a first message, signs one with a key nobody trusts, repeats a delivery, and sends any content type", async () => {
    const { fake, sink, payments, trust, startOf } = await setup({ noticeContentType: "text/plain;charset=UTF-8" });
    const lostOrder = hex();
    await payments.startHostedPayment(startOf(lostOrder));
    fake.pay(lostOrder, "APPROVE");
    fake.loseNextNotice();
    expect(await fake.deliverNotices()).toEqual([{ orderId: lostOrder, status: 3, httpStatus: 0, responseText: "", lost: true }]);
    expect([sink.received.length, fake.pendingNotices()]).toEqual([0, 0]);
    const forged = hex();
    await payments.startHostedPayment(startOf(forged));
    fake.pay(forged, "APPROVE");
    fake.signNextNoticeWithUnknownKey();
    await fake.deliverNotices();
    expect(verifyNetopiaNotice(sink.received[0]!.rawBody, headerOf(sink.received[0]!), trust)).toEqual({ ok: false, reason: "NOTICE_SIGNATURE_INVALID" });
    const repeated = hex();
    await payments.startHostedPayment(startOf(repeated));
    fake.pay(repeated, "APPROVE");
    await fake.deliverNotices();
    await fake.resendLastNotice(repeated);
    const [once, twice] = sink.received.slice(1);
    expect(twice!.rawBody.equals(once!.rawBody)).toBe(true);
    expect(headerOf(twice!)).toBe(headerOf(once!));
    expect(once!.headers["content-type"]).toBe("text/plain;charset=UTF-8");
    expect(verifyNetopiaNotice(twice!.rawBody, headerOf(twice!), trust).ok).toBe(true);
  });
});

describe("N5 — StubCardPayments, the port-level stub", () => {
  it("answers what each test scripts, in order, and records every call", async () => {
    const stub = new StubCardPayments();
    expect([stub.provider, stub.environment, "refund" in stub]).toEqual(["netopia", "sandbox", false]);
    const orderId = hex();
    const start: HostedPaymentStart = (await setupless()).startOf(orderId);
    expect(await stub.startHostedPayment(start)).toEqual({ providerPaymentId: `ntp-${orderId.slice(0, 12)}`, redirectUrl: `https://secure-sandbox.netopia-payments.com/ui/card?p=${orderId}` });
    stub.scriptStart(orderId, paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "429"));
    expect(await codeOf(stub.startHostedPayment(start))).toBe("PAYMENT_PROVIDER_UNAVAILABLE:429");
    expect(await stub.status({ orderId, providerPaymentId: null })).toBe("NO_SUCH_ORDER");
    stub.scriptStatus(orderId, stubPaymentReport(orderId, "PENDING"), paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "503"), "NO_SUCH_ORDER");
    expect(asReport(await stub.status({ orderId, providerPaymentId: null })).state).toBe("PENDING");
    expect(await codeOf(stub.status({ orderId, providerPaymentId: null }))).toBe("PAYMENT_PROVIDER_UNAVAILABLE:503");
    expect(await stub.status({ orderId, providerPaymentId: null })).toBe("NO_SUCH_ORDER");
    expect(asReport(await stub.status({ orderId, providerPaymentId: null })).state).toBe("PENDING");
    expect([stub.startCalls, stub.statusCalls, stub.hosted[0]]).toEqual([2, 5, start]);
  });

  it("charges into the order's report, which later status reads answer", async () => {
    const stub = new StubCardPayments();
    const orderId = hex();
    const charge = (await setupless()).chargeOf(orderId);
    expect((await stub.chargeSavedCard(charge)).state).toBe("PENDING");
    stub.scriptCharge(orderId, stubPaymentReport(orderId, "PAID", { providerStatus: "3" }));
    expect((await stub.chargeSavedCard(charge)).state).toBe("PAID");
    expect(asReport(await stub.status({ orderId, providerPaymentId: null })).state).toBe("PAID");
    expect([stub.chargeCalls, stub.charges[1]]).toEqual([2, charge]);
  });

  it("has refund only when asked, and records it", async () => {
    const stub = new StubCardPayments({ environment: "live", withRefund: true });
    expect(stub.environment).toBe("live");
    const refunded = await stub.refund!({ orderId: "ab".repeat(16), providerPaymentId: "7654321", amountMicros: 10_000_000 });
    expect(refunded).toMatchObject({ state: "REFUNDED", providerStatus: "8", providerPaymentId: "7654321" });
    expect(stub.refundCalls).toEqual([{ orderId: "ab".repeat(16), providerPaymentId: "7654321", amountMicros: 10_000_000 }]);
  });
});

describe("N5 — the signed-notice helper, against the real verifier (spec §2.4.6)", () => {
  const POS = ["AB12", "CD34", "EF56", "GH78", "IJ90"].join("-");
  const body = { payment: { ntpID: "7654321", status: 3, amount: 24.2, currency: "USD", message: "Tranzacție aprobată" }, order: { orderID: "ab".repeat(16) } };

  it("signs a genuine message the verifier accepts, with aud as an array or a string", () => {
    const keys = testNetopiaKeys();
    const genuine = signedNetopiaNotice({ privateKey: keys.privateKey, posSignature: POS, body });
    expect(genuine.rawBody.toString("utf8")).toBe(JSON.stringify(body));
    expect(verifyNetopiaNotice(genuine.rawBody, genuine.header, keys.trust(POS))).toMatchObject({ ok: true, keyFingerprint: keys.trust(POS).keys[0]!.fingerprint });
    const asString = signedNetopiaNotice({ privateKey: keys.privateKey, posSignature: POS, body, aud: POS });
    expect(verifyNetopiaNotice(asString.rawBody, asString.header, keys.trust(POS)).ok).toBe(true);
    const bytes = Buffer.from([0x7b, 0x7d, 0xff]);
    expect(signedNetopiaNotice({ privateKey: keys.privateKey, posSignature: POS, body: bytes }).rawBody).toBe(bytes);
  });

  it("makes each refused shape the verifier must refuse", () => {
    const keys = testNetopiaKeys();
    const trust = keys.trust(POS);
    const reasonOf = (notice: Readonly<{ rawBody: Buffer; header: string }>) => {
      const result = verifyNetopiaNotice(notice.rawBody, notice.header, trust);
      return result.ok ? "OK" : result.reason;
    };
    for (const alg of ["none", "HS512", "RS256"] as const) {
      expect(reasonOf(signedNetopiaNotice({ privateKey: keys.privateKey, posSignature: POS, body, alg })), alg).toBe("NOTICE_ALG_REFUSED");
    }
    expect(reasonOf(signedNetopiaNotice({ privateKey: keys.privateKey, posSignature: POS, body, iss: "Someone Else" }))).toBe("NOTICE_ISSUER_INVALID");
    expect(reasonOf(signedNetopiaNotice({ privateKey: keys.privateKey, posSignature: POS, body, aud: ["ZZ12-CD34-EF56-GH78-IJ90"] }))).toBe("NOTICE_AUDIENCE_INVALID");
    const genuine = signedNetopiaNotice({ privateKey: keys.privateKey, posSignature: POS, body });
    expect(reasonOf({ rawBody: Buffer.concat([genuine.rawBody, Buffer.from(" ")]), header: genuine.header })).toBe("NOTICE_BODY_HASH_INVALID");
    expect(reasonOf(signedNetopiaNotice({ privateKey: testNetopiaKeys().privateKey, posSignature: POS, body }))).toBe("NOTICE_SIGNATURE_INVALID");
  });
});

/** The two input builders without a fake (the stub's tests need no server). */
async function setupless() {
  const startOf = (orderId: string): HostedPaymentStart => Object.freeze({
    orderId, amountMicros: 24_200_000, currency: "USD", description: "DebateAI Plus, one month", payer: PAYER, clientId: CLIENT,
    returnUrl: `https://debateai.test/checkout/return?charge=${orderId}`, notifyUrl: "https://debateai.test/api/v1/billing/netopia/notify", language: "ro"
  });
  const chargeOf = (orderId: string): SavedCardCharge => Object.freeze({
    ...startOf(orderId), cardToken: createSecretToken(["tok", "stub", "0001"].join("-")), payerIp: "203.0.113.7"
  });
  return { startOf, chargeOf };
}
