// tests/unit/payments-netopia-client.test.ts
// N3 (spec 2026-10-05 §2.3 errors, §2.4.1–2.4.3, §2.20.2 "redirects refused"): the NETOPIA client over a scripted fetch, plus three
// real loopback servers for what only a socket shows (a refused connection, a redirect that must not be followed, a cut connection).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { paymentErrorCode, paymentNothingSent, type HostedPaymentStart, type Payer, type PaymentReport, type SavedCardCharge } from "@debateai/billing-core";
import { NETOPIA_FACTS, answeredOrderReused, createNetopiaPayments, createSecretToken } from "@debateai/payments-netopia";
import { NETOPIA_TIMEOUTS_MS, createNetopiaPaymentsForRecording } from "../../packages/payments-netopia/src/client.js";
import { buildHostedStartBody, buildSavedCardChargeBody, buildStatusBody } from "../../packages/payments-netopia/src/requests.js";

/** Made-up values built from pieces (spec §2.2 rule 2; the leak scanner reads long key-like strings). */
const POS = ["AB12", "CD34", "EF56", "GH78", "IJ90"].join("-");
const API_KEY = ["test", "netopia", "api", "key", "0001"].join("-");
const TOKEN_TEXT = ["tok", "n3", "client", "0001"].join("-");
const NEW_TOKEN = ["tok", "n3", "client", "0002"].join("-");
const BASE = "https://secure-sandbox.netopia-payments.com";
const NOW = new Date("2026-10-06T10:00:00.000Z");
const ORDER = "ab".repeat(16);
const PAYER: Payer = Object.freeze({
  firstName: "Ana", lastName: "Pop", email: "ana@example.test", phone: "+40712345678", country: "RO",
  region: "Cluj", city: "Cluj-Napoca", postalCode: "400001", street: "Strada Exemplu 1"
});
const START: HostedPaymentStart = Object.freeze({
  orderId: ORDER, amountMicros: 24_200_000, currency: "USD", description: "DebateAI Plus, one month", payer: PAYER,
  clientId: "ef".repeat(16), returnUrl: `https://debateai.test/checkout/return?charge=${ORDER}`,
  notifyUrl: "https://debateai.test/api/v1/billing/netopia/notify", language: "ro"
});
const CHARGE: SavedCardCharge = Object.freeze({
  orderId: ORDER, amountMicros: 24_200_000, currency: "USD", description: "DebateAI Plus, one month", payer: PAYER,
  cardToken: createSecretToken(TOKEN_TEXT), payerIp: "203.0.113.7", returnUrl: START.returnUrl, notifyUrl: START.notifyUrl, language: "ro"
});
const STARTED = {
  error: { code: "101", message: "Redirect user to payment page" },
  payment: { status: 1, ntpID: "1234567", amount: 24.2, currency: "USD", operationDate: "0001-01-01T00:00:00",
    paymentURL: "https://secure-sandbox.netopia-payments.com/ui/card?p=ABC" }
};
const PAID = {
  error: { code: "00", message: "Approved" },
  payment: { status: 3, ntpID: "7654321", amount: 24.2, currency: "USD", operationDate: "2026-10-06T09:59:30Z",
    binding: { token: NEW_TOKEN, expireMonth: 12, expireYear: 2030 }, instrument: { panMasked: "9****5098", country: 642 } },
  order: { orderID: ORDER }
};

type Call = Readonly<{ url: string; init: RequestInit }>;
type Answer = () => Response | Error;
function scripted(...answers: Answer[]): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = answers.shift();
    if (next === undefined) throw new Error("an unscripted fetch");
    const value = next();
    if (value instanceof Error) throw value;
    return value;
  };
  return { fetch: fake as typeof fetch, calls };
}
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const client = (fetchFn: typeof fetch, baseUrl = BASE) =>
  createNetopiaPayments({ baseUrl, apiKey: API_KEY, posSignature: POS }, { fetch: fetchFn, now: () => NOW });
/** undici's shape: TypeError("fetch failed") whose cause carries the system code. */
const transport = (code: string): Error => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(`connect ${code}`), { code }) });
const ourTimeout = (): Error => new DOMException("The operation was aborted due to timeout", "TimeoutError");
const opaqueRedirect = (): Response => ({ type: "opaqueredirect", status: 0, body: null, text: async () => "" }) as unknown as Response;
const cutBody = (): Response => new Response(new ReadableStream({ start(controller) { controller.error(new Error("cut")); } }), { status: 200 });

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { if (error instanceof TypedDomainError) return error.code; throw error; }
  throw new Error("expected a refusal");
}
const servers: Server[] = [];
async function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

describe("N3 — constructing the client (spec §2.4.1)", () => {
  it("takes its environment from the base, a loopback base as the sandbox, and has no refund until N-10", () => {
    const { fetch } = scripted();
    for (const [baseUrl, environment] of [["https://secure.netopia-payments.com/api", "live"], ["https://secure.mobilpay.ro/pay", "live"],
      ["https://secure-sandbox.netopia-payments.com", "sandbox"], ["https://secure.sandbox.netopia-payments.com", "sandbox"],
      ["http://127.0.0.1:8802", "sandbox"], ["http://localhost:8802", "sandbox"]] as const) {
      const payments = client(fetch, baseUrl);
      expect(payments.environment, baseUrl).toBe(environment);
      expect(payments.provider).toBe("netopia");
      expect("refund" in payments).toBe(false);
    }
  });

  it("refuses another base, a malformed POS signature and an unprintable key", () => {
    const { fetch } = scripted();
    for (const baseUrl of ["https://example.test", "https://secure.netopia-payments.com/api/", "http://192.168.1.10:8802", "http://127.0.0.1:8802/x"]) {
      expect(() => client(fetch, baseUrl), baseUrl).toThrow("PAYMENT_CONFIGURATION_REFUSED:baseUrl");
    }
    expect(() => createNetopiaPayments({ baseUrl: BASE, apiKey: API_KEY, posSignature: "abc" })).toThrow("PAYMENT_CONFIGURATION_REFUSED:posSignature");
    for (const apiKey of ["", "has space", "line\nbreak"]) {
      expect(() => createNetopiaPayments({ baseUrl: BASE, apiKey, posSignature: POS }), JSON.stringify(apiKey)).toThrow("PAYMENT_CONFIGURATION_REFUSED:apiKey");
    }
  });
});

describe("N3 — the requests on the wire (spec §2.4.1, §2.4.2)", () => {
  it("posts the exact hosted-start body with the raw key, JSON headers, no redirect and the 15 s timeout", async () => {
    const timeouts = vi.spyOn(AbortSignal, "timeout");
    const { fetch, calls } = scripted(() => json(STARTED));
    expect(await client(fetch).startHostedPayment(START))
      .toEqual({ providerPaymentId: "1234567", redirectUrl: "https://secure-sandbox.netopia-payments.com/ui/card?p=ABC" });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe(`${BASE}/payment/card/start`);
    expect(call!.init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(call!.init.headers).toEqual({ authorization: API_KEY, "content-type": "application/json", accept: "application/json" });
    expect(call!.init.body).toBe(buildHostedStartBody(START, { posSignature: POS, now: NOW }));
    expect(call!.init.signal).toBeInstanceOf(AbortSignal);
    expect(timeouts).toHaveBeenLastCalledWith(NETOPIA_TIMEOUTS_MS.start);
    expect(NETOPIA_TIMEOUTS_MS).toEqual({ start: 15_000, charge: 30_000, status: 10_000 });
  });

  it("posts the saved-card charge (30 s) and the status read (10 s) to their routes, with their exact bodies", async () => {
    const timeouts = vi.spyOn(AbortSignal, "timeout");
    const { fetch, calls } = scripted(() => json(PAID), () => json(PAID));
    const payments = client(fetch);
    await payments.chargeSavedCard(CHARGE);
    expect(timeouts).toHaveBeenLastCalledWith(NETOPIA_TIMEOUTS_MS.charge);
    await payments.status({ orderId: ORDER, providerPaymentId: "7654321" });
    expect(timeouts).toHaveBeenLastCalledWith(NETOPIA_TIMEOUTS_MS.status);
    expect(calls.map((call) => call.url)).toEqual([`${BASE}/payment/card/start`, `${BASE}/operation/status`]);
    expect(calls[0]!.init.body).toBe(buildSavedCardChargeBody(CHARGE, { posSignature: POS, now: NOW }));
    expect(calls[1]!.init.body).toBe(buildStatusBody({ orderId: ORDER, providerPaymentId: "7654321" }, POS));
  });

  it("sends nothing when the payer or the amount is refused before the call", async () => {
    const { fetch, calls } = scripted();
    expect(await codeOf(client(fetch).chargeSavedCard({ ...CHARGE, payer: { ...PAYER, lastName: "" } }))).toBe("PAYMENT_PAYER_INCOMPLETE:lastName");
    expect(await codeOf(client(fetch).startHostedPayment({ ...START, amountMicros: 5_000 }))).toBe("PAYMENT_CONFIGURATION_REFUSED:amount");
    expect(calls).toHaveLength(0);
  });

  it("lets the recording override the request facts (N22), and nothing else", async () => {
    const { fetch, calls } = scripted(() => json(STARTED));
    const recording = createNetopiaPaymentsForRecording({ baseUrl: BASE, apiKey: API_KEY, posSignature: POS }, { fetch, now: () => NOW },
      { clientIdLocation: "instrument", installments: 1 });
    await recording.startHostedPayment(START);
    expect(calls[0]!.init.body).toBe(buildHostedStartBody(START, { posSignature: POS, now: NOW }, { clientIdLocation: "instrument", installments: 1 }));
  });
});

describe("N3 — the error table (spec §2.3)", () => {
  const TABLE: ReadonlyArray<readonly [string, Answer, string]> = [
    ["connection refused", () => transport("ECONNREFUSED"), "PAYMENT_PROVIDER_UNAVAILABLE:ECONNREFUSED"],
    ["DNS failure", () => transport("ENOTFOUND"), "PAYMENT_PROVIDER_UNAVAILABLE:ENOTFOUND"],
    ["host unreachable", () => transport("EHOSTUNREACH"), "PAYMENT_PROVIDER_UNAVAILABLE:EHOSTUNREACH"],
    ["network unreachable", () => transport("ENETUNREACH"), "PAYMENT_PROVIDER_UNAVAILABLE:ENETUNREACH"],
    ["connect timeout", () => transport("UND_ERR_CONNECT_TIMEOUT"), "PAYMENT_PROVIDER_UNAVAILABLE:UND_ERR_CONNECT_TIMEOUT"],
    ["TLS handshake", () => transport("ERR_TLS_CERT_ALTNAME_INVALID"), "PAYMENT_PROVIDER_UNAVAILABLE:ERR_TLS_CERT_ALTNAME_INVALID"],
    ["our timeout", ourTimeout, "PAYMENT_OUTCOME_UNKNOWN:timeout"],
    ["a reset connection", () => transport("ECONNRESET"), "PAYMENT_OUTCOME_UNKNOWN:ECONNRESET"],
    ["a closed socket", () => transport("UND_ERR_SOCKET"), "PAYMENT_OUTCOME_UNKNOWN:UND_ERR_SOCKET"],
    ["an error with no code", () => new TypeError("fetch failed"), "PAYMENT_OUTCOME_UNKNOWN:transport"],
    ["HTTP 429", () => json({}, 429), "PAYMENT_PROVIDER_UNAVAILABLE:429"],
    ["HTTP 408", () => json({}, 408), "PAYMENT_OUTCOME_UNKNOWN:408"],
    ["HTTP 500", () => json({}, 500), "PAYMENT_OUTCOME_UNKNOWN:500"],
    ["HTTP 503", () => json({}, 503), "PAYMENT_OUTCOME_UNKNOWN:503"],
    ["HTTP 401", () => json({ code: "401", message: "Unauthorized" }, 401), "PAYMENT_CREDENTIALS_REFUSED:401"],
    ["HTTP 403", () => json({}, 403), "PAYMENT_CREDENTIALS_REFUSED:403"],
    ["HTTP 400", () => json({ code: "400", message: "bad request" }, 400), "PAYMENT_CONFIGURATION_REFUSED:400"],
    ["HTTP 404", () => json({}, 404), "PAYMENT_CONFIGURATION_REFUSED:404"],
    ["HTTP 405", () => json({}, 405), "PAYMENT_CONFIGURATION_REFUSED:405"],
    ["HTTP 409", () => json({}, 409), "PAYMENT_CONFIGURATION_REFUSED:409"],
    ["HTTP 301", () => new Response(null, { status: 301, headers: { location: "https://elsewhere.test/" } }), "PAYMENT_CONFIGURATION_REFUSED:redirect"],
    ["HTTP 302", () => new Response(null, { status: 302, headers: { location: "https://elsewhere.test/" } }), "PAYMENT_CONFIGURATION_REFUSED:redirect"],
    ["HTTP 307", () => new Response(null, { status: 307, headers: { location: "https://elsewhere.test/" } }), "PAYMENT_CONFIGURATION_REFUSED:redirect"],
    ["an opaque redirect", opaqueRedirect, "PAYMENT_CONFIGURATION_REFUSED:redirect"],
    ["HTTP 201", () => new Response("{}", { status: 201 }), "PAYMENT_RESPONSE_INVALID:201"],
    ["a body that is not JSON", () => new Response("<html>maintenance</html>", { status: 200 }), "PAYMENT_RESPONSE_INVALID:json"],
    ["a JSON array", () => json([]), "PAYMENT_RESPONSE_INVALID:json"],
    ["a body over 1 MiB", () => new Response(`"${"x".repeat(1_048_577)}"`, { status: 200 }), "PAYMENT_RESPONSE_INVALID:size"],
    ["the body cut after the head", cutBody, "PAYMENT_OUTCOME_UNKNOWN:transport"]
  ];
  const NOTHING_SENT = new Set(["PAYMENT_PROVIDER_UNAVAILABLE", "PAYMENT_CREDENTIALS_REFUSED", "PAYMENT_CONFIGURATION_REFUSED"]);

  it("maps every failure of a write (start and charge) to its code, after exactly one request", async () => {
    for (const [label, answer, code] of TABLE) {
      for (const run of [(payments: ReturnType<typeof client>) => payments.startHostedPayment(START),
        (payments: ReturnType<typeof client>) => payments.chargeSavedCard(CHARGE)]) {
        const { fetch, calls } = scripted(answer);
        let caught: unknown = null;
        try { await run(client(fetch)); } catch (error) { caught = error; }
        expect((caught as TypedDomainError).code, label).toBe(code);
        expect((caught as TypedDomainError).message, label).toBe(code);
        expect(paymentNothingSent(caught), label).toBe(NOTHING_SENT.has(paymentErrorCode(caught)!));
        expect(calls, label).toHaveLength(1);
      }
    }
  });

  it("maps every failure of a read the same way, except that nothing a read does is an unknown outcome", async () => {
    for (const [label, answer, code] of TABLE) {
      const { fetch, calls } = scripted(answer);
      expect(await codeOf(client(fetch).status({ orderId: ORDER, providerPaymentId: null })), label)
        .toBe(code.replace("PAYMENT_OUTCOME_UNKNOWN", "PAYMENT_PROVIDER_UNAVAILABLE"));
      expect(calls, label).toHaveLength(1);
    }
  });

  it("never carries NETOPIA's answer text, the token or a cause on an error", async () => {
    const { fetch } = scripted(() => json({ error: { code: "400", message: `token ${TOKEN_TEXT} was refused for ana@example.test` } }, 400));
    let caught: unknown = null;
    try { await client(fetch).chargeSavedCard(CHARGE); } catch (error) { caught = error; }
    const error = caught as TypedDomainError;
    expect(error.code).toBe("PAYMENT_CONFIGURATION_REFUSED:400");
    for (const text of [error.message, String(error.stack), JSON.stringify(error)]) {
      expect(text).not.toContain(TOKEN_TEXT);
      expect(text).not.toContain("ana@example.test");
    }
    expect((error as { cause?: unknown }).cause).toBeUndefined();
  });
});

describe("N3 — answers on HTTP 200 (spec §2.4.3)", () => {
  it("returns a saved-card charge's report with its new card, dated by the client's clock rule", async () => {
    const { fetch } = scripted(() => json(PAID));
    const report = await client(fetch).chargeSavedCard(CHARGE);
    expect(report).toMatchObject({ orderId: ORDER, providerPaymentId: "7654321", state: "PAID", providerStatus: "3", amountMicros: 24_200_000, cardCountry: "RO" });
    expect(report.occurredAt?.toISOString()).toBe("2026-10-06T09:59:30.000Z");
    expect(report.savedCard?.token.reveal()).toBe(NEW_TOKEN);
    expect(answeredOrderReused(report)).toBe(false);
    const late = scripted(() => json({ ...PAID, payment: { ...PAID.payment, operationDate: "2026-10-06T10:10:00Z" } }));
    expect((await client(late.fetch).chargeSavedCard(CHARGE)).occurredAt).toBeNull();
  });

  it("reads a decline as a report, never an error", async () => {
    const { fetch } = scripted(() => json({ error: { code: "20", message: "Insufficient funds" }, payment: { status: 12, ntpID: "7654321" } }));
    expect(await client(fetch).chargeSavedCard(CHARGE)).toMatchObject({ state: "DECLINED", declineSide: "CARD", bankDeclined: true, declineCode: "20" });
  });

  it("reads 56 with the existing payment as that payment, flagged as an order reused", async () => {
    const { fetch, calls } = scripted(() => json({ ...PAID, error: { code: "56", message: "Order closed" } }));
    const report = await client(fetch).chargeSavedCard(CHARGE);
    expect(report.state).toBe("PAID");
    expect(answeredOrderReused(report)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("reads 56 without the payment through ONE status read by orderID, still flagged", async () => {
    const { fetch, calls } = scripted(() => json({ error: { code: "56", message: "Order closed" } }), () => json(PAID));
    const report = await client(fetch).chargeSavedCard(CHARGE);
    expect(report).toMatchObject({ state: "PAID", providerPaymentId: "7654321" });
    expect(answeredOrderReused(report)).toBe(true);
    expect(calls.map((call) => call.url)).toEqual([`${BASE}/payment/card/start`, `${BASE}/operation/status`]);
    expect(calls[1]!.init.body).toBe(buildStatusBody({ orderId: ORDER, providerPaymentId: null }, POS));
  });

  it("calls a 56 whose status read cannot answer, or says no such order, an unknown outcome (the order exists)", async () => {
    const notFound = { error: { code: NETOPIA_FACTS.notFoundCodes[0]!, message: "order not found" } };
    for (const second of [() => json(notFound), () => json({}, 503), () => transport("ECONNREFUSED")] as Answer[]) {
      const { fetch } = scripted(() => json({ error: { code: "56" } }), second);
      expect(await codeOf(client(fetch).chargeSavedCard(CHARGE))).toBe("PAYMENT_OUTCOME_UNKNOWN:56");
    }
  });

  it("answers NO_SUCH_ORDER only for NETOPIA's pinned not-found answer, on HTTP 200 or 400", async () => {
    const notFound = { error: { code: NETOPIA_FACTS.notFoundCodes[0]!, message: "order not found" } };
    for (const status of [200, 400]) {
      const { fetch } = scripted(() => json(notFound, status));
      expect(await client(fetch).status({ orderId: ORDER, providerPaymentId: null }), String(status)).toBe("NO_SUCH_ORDER");
    }
    const other = scripted(() => json({ error: { code: "99", message: "general error" } }));
    expect(await codeOf(client(other.fetch).status({ orderId: ORDER, providerPaymentId: null }))).toBe("PAYMENT_CONFIGURATION_REFUSED:99");
    const refused = scripted(() => json({ error: { code: "99" } }, 400));
    expect(await codeOf(client(refused.fetch).status({ orderId: ORDER, providerPaymentId: null }))).toBe("PAYMENT_CONFIGURATION_REFUSED:400");
    const report = scripted(() => json({ ...PAID, payment: { ...PAID.payment, status: 8 } }));
    expect(((await client(report.fetch).status({ orderId: ORDER, providerPaymentId: "7654321" })) as PaymentReport).state).toBe("REFUNDED");
  });

  it("stores a payment URL only on NETOPIA's hosts; a loopback base may name its own origin", async () => {
    const elsewhere = scripted(() => json({ ...STARTED, payment: { ...STARTED.payment, paymentURL: "https://evil.test/ui/card?p=1" } }));
    expect(await codeOf(client(elsewhere.fetch).startHostedPayment(START))).toBe("PAYMENT_RESPONSE_INVALID:paymentURL");
    const ownOrigin = () => json({ ...STARTED, payment: { ...STARTED.payment, paymentURL: "http://127.0.0.1:8802/ui/card?p=1" } });
    expect((await client(scripted(ownOrigin).fetch, "http://127.0.0.1:8802").startHostedPayment(START)).redirectUrl).toBe("http://127.0.0.1:8802/ui/card?p=1");
    expect(await codeOf(client(scripted(ownOrigin).fetch).startHostedPayment(START))).toBe("PAYMENT_RESPONSE_INVALID:paymentURL");
  });
});

describe("N3 — over a real socket", () => {
  it("reads a refused connection as unavailable: nothing was sent", async () => {
    const base = await serve((_request, response) => response.end());
    const server = servers.pop()!;
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    const payments = createNetopiaPayments({ baseUrl: base, apiKey: API_KEY, posSignature: POS });
    const code = await codeOf(payments.chargeSavedCard(CHARGE));
    expect(paymentErrorCode(new TypedDomainError(code, code))).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
  });

  it("never follows a redirect (spec §2.2 rule 10)", async () => {
    let followed = 0;
    const base = await serve((request, response) => {
      if (request.url === "/followed") { followed += 1; response.end(JSON.stringify(STARTED)); return; }
      request.resume();
      response.writeHead(302, { location: "/followed" }).end();
    });
    const payments = createNetopiaPayments({ baseUrl: base, apiKey: API_KEY, posSignature: POS });
    expect(await codeOf(payments.startHostedPayment(START))).toBe("PAYMENT_CONFIGURATION_REFUSED:redirect");
    expect(followed).toBe(0);
  });

  it("reads a connection cut after the request as an unknown outcome for a write, unavailable for a read", async () => {
    const base = await serve((request) => { request.resume(); request.on("end", () => request.socket.destroy()); });
    const payments = createNetopiaPayments({ baseUrl: base, apiKey: API_KEY, posSignature: POS });
    const write = await codeOf(payments.chargeSavedCard(CHARGE));
    expect(write.startsWith("PAYMENT_OUTCOME_UNKNOWN"), write).toBe(true);
    const read = await codeOf(payments.status({ orderId: ORDER, providerPaymentId: null }));
    expect(read.startsWith("PAYMENT_PROVIDER_UNAVAILABLE"), read).toBe(true);
  });
});
