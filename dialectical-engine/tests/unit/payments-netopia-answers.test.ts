// tests/unit/payments-netopia-answers.test.ts
// N2 (spec 2026-10-05 §2.4.3): every answer is parsed as the client parses it (parseJsonKeepingNumberText), so amounts,
// statuses and codes reach the readers as text.
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import type { PaymentReport } from "@debateai/billing-core";
import { NETOPIA_FACTS, parseJsonKeepingNumberText } from "@debateai/payments-netopia";
import { isNotFoundAnswer, readPaymentAnswer, readStartAnswer, type PaymentAnswer } from "../../packages/payments-netopia/src/answers.js";

const ORDER = "ab".repeat(16);
const NOW = new Date("2026-10-06T10:00:00.000Z");
const TOKEN_TEXT = ["tok", "n2", "answers", "0001"].join("-");
const OTHER_TOKEN = ["tok", "n2", "answers", "0002"].join("-");
const CHARGE = Object.freeze({ orderId: ORDER, now: NOW, purpose: "CHARGE" as const });
const STATUS = Object.freeze({ orderId: ORDER, now: NOW, purpose: "STATUS" as const });
const parse = (value: unknown): unknown => parseJsonKeepingNumberText(JSON.stringify(value));
const codeOf = (run: () => unknown): string => {
  try { run(); } catch (error) { if (error instanceof TypedDomainError) return error.code; throw error; }
  throw new Error("expected a refusal");
};
function reportOf(answer: PaymentAnswer): PaymentReport {
  if (answer.kind !== "REPORT") throw new Error(`expected a report, got ${answer.kind}`);
  return answer.report;
}
const payment = (extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ status: 3, ntpID: "7654321", amount: 24.2, currency: "USD", operationDate: "2026-10-06T09:59:00Z", ...extra });
const charged = (body: unknown): PaymentReport => reportOf(readPaymentAnswer(parse(body), CHARGE));

describe("N2 — the hosted start's answer (spec §2.4.3: 101)", () => {
  const started = {
    error: { code: "101", message: "Redirect user to payment page" },
    payment: { status: 1, ntpID: "1234567", amount: 24.2, currency: "USD", operationDate: "0001-01-01T00:00:00",
      paymentURL: "https://secure-sandbox.netopia-payments.com/ui/card?p=ABC", binding: { expireMonth: 0, expireYear: 0 }, instrument: { country: 0 } }
  };
  const withUrl = (paymentURL: unknown) => parse({ ...started, payment: { ...started.payment, paymentURL } });

  it("keeps NETOPIA's ntpID from the JSON and the payment URL", () => {
    expect(readStartAnswer(parse(started), { sameOriginAllowed: null }))
      .toEqual({ providerPaymentId: "1234567", redirectUrl: "https://secure-sandbox.netopia-payments.com/ui/card?p=ABC" });
  });

  it("refuses a payment URL off NETOPIA's hosts; a loopback origin only when the client allows exactly it", () => {
    for (const url of ["http://secure-sandbox.netopia-payments.com/ui/card?p=1", "https://evil.test/ui/card?p=1", "https://u:p@secure.netopia-payments.com/x", 7, null]) {
      expect(codeOf(() => readStartAnswer(withUrl(url), { sameOriginAllowed: null })), String(url)).toBe("PAYMENT_RESPONSE_INVALID:paymentURL");
    }
    const loopback = withUrl("http://127.0.0.1:8802/ui/card?p=1");
    expect(readStartAnswer(loopback, { sameOriginAllowed: "http://127.0.0.1:8802" }).redirectUrl).toBe("http://127.0.0.1:8802/ui/card?p=1");
    expect(codeOf(() => readStartAnswer(loopback, { sameOriginAllowed: "http://127.0.0.1:9999" }))).toBe("PAYMENT_RESPONSE_INVALID:paymentURL");
  });

  it("reads a reused order, a merchant code and an unknown code as our configuration; any other shape as invalid", () => {
    for (const code of ["56", "32", "33", "99", "777"]) {
      expect(codeOf(() => readStartAnswer(parse({ error: { code } }), { sameOriginAllowed: null })), code).toBe(`PAYMENT_CONFIGURATION_REFUSED:${code}`);
    }
    for (const answer of [{ payment: started.payment }, { error: { code: "00" }, payment: started.payment }, { error: { code: "100" } },
      { error: { code: "20" } }, [], "text", { error: { code: "has space" } }]) {
      expect(codeOf(() => readStartAnswer(parse(answer), { sameOriginAllowed: null })).startsWith("PAYMENT_RESPONSE_INVALID"), JSON.stringify(answer)).toBe(true);
    }
    expect(codeOf(() => readStartAnswer(parse({ ...started, payment: { ...started.payment, ntpID: "has space" } }), { sameOriginAllowed: null })))
      .toBe("PAYMENT_RESPONSE_INVALID:ntpID");
  });
});

describe("N2 — a saved-card charge's answer (spec §2.4.3 table)", () => {
  it("reads 00 with status 3 as PAID, with every member we use, ignoring members we do not", () => {
    const answer = readPaymentAnswer(parse({
      error: { code: "00", message: "Approved" },
      payment: payment({ binding: { token: TOKEN_TEXT, expireMonth: 12, expireYear: 2030 }, instrument: { panMasked: "9****5098", country: 642 },
        data: { ISSUER_COUNTRY: "642", BIN: "411111" } }),
      order: { orderID: ORDER }, card: { anything: "NETOPIA added later" }
    }), CHARGE);
    const report = reportOf(answer);
    expect({ ...report, savedCard: null }).toEqual({
      orderId: ORDER, providerPaymentId: "7654321", state: "PAID", providerStatus: "3", amountMicros: 24_200_000, currency: "USD",
      cardCountry: "RO", savedCard: null, declineCode: null, declineSide: null, bankDeclined: false,
      occurredAt: new Date("2026-10-06T09:59:00.000Z"), clientId: null
    });
    expect(report.savedCard?.token.reveal()).toBe(TOKEN_TEXT);
    expect(report.savedCard).toMatchObject({ expMonth: 12, expYear: 2030, last4: "5098" });
    expect(JSON.stringify(report)).not.toContain(TOKEN_TEXT);
    expect(answer.kind === "REPORT" && answer.orderReused).toBe(false);
    expect(charged({ payment: payment({ status: 5 }) }).state).toBe("PAID");
    expect(charged({ error: { code: 0 }, payment: payment() }).state).toBe("PAID");
  });

  it("reads a card-side decline, with or without status 12, as DECLINED on the card", () => {
    expect(charged({ error: { code: "20" }, payment: payment({ status: 12 }) }))
      .toMatchObject({ state: "DECLINED", declineCode: "20", declineSide: "CARD", bankDeclined: true, providerStatus: "12" });
    expect(charged({ error: { code: "36" }, payment: { ntpID: "7654321" } }))
      .toMatchObject({ state: "DECLINED", declineCode: "36", declineSide: "CARD", bankDeclined: false, providerStatus: "12" });
    expect(charged({ payment: payment({ status: 12 }) })).toMatchObject({ state: "DECLINED", declineCode: null, declineSide: "CARD", bankDeclined: false });
  });

  it("reads 100 or a status 15 as ACTION_REQUIRED, and 102 as PENDING", () => {
    expect(charged({ error: { code: "100" }, payment: payment({ status: 15 }) }).state).toBe("ACTION_REQUIRED");
    expect(charged({ error: { code: "100" }, payment: { ntpID: "7654321" } })).toMatchObject({ state: "ACTION_REQUIRED", providerStatus: "15", declineSide: null });
    expect(charged({ error: { code: "00" }, payment: payment({ status: 15 }) }).state).toBe("ACTION_REQUIRED");
    expect(charged({ error: { code: "102" }, payment: { ntpID: "7654321" } })).toMatchObject({ state: "PENDING", providerStatus: "1" });
  });

  it("reads 56 as the existing payment when the answer has one, else asks for a status read", () => {
    const reused = readPaymentAnswer(parse({ error: { code: "56", message: "Order closed" }, payment: payment() }), CHARGE);
    expect(reused.kind === "REPORT" && reused.orderReused).toBe(true);
    expect(reportOf(reused).state).toBe("PAID");
    expect(readPaymentAnswer(parse({ error: { code: "56" } }), CHARGE)).toEqual({ kind: "ORDER_REUSED_WITHOUT_PAYMENT" });
    expect(readPaymentAnswer(parse({ error: { code: "56" }, payment: { status: 3 } }), CHARGE)).toEqual({ kind: "ORDER_REUSED_WITHOUT_PAYMENT" });
  });

  it("reads 32, 33, 99 and any unknown code as our configuration, never a decline (ruling C-8)", () => {
    for (const code of ["32", "33", "99", "777", "61443"]) {
      expect(codeOf(() => charged({ error: { code }, payment: payment({ status: 12 }) })), code).toBe(`PAYMENT_CONFIGURATION_REFUSED:${code}`);
    }
  });

  it("checks strictly the members it uses", () => {
    for (const [member, code] of [[{ status: 24 }, "status"], [{ status: 0 }, "status"], [{ status: "3.5" }, "status"],
      [{ ntpID: "x".repeat(65) }, "ntpID"], [{ ntpID: "" }, "ntpID"], [{ ntpID: undefined }, "ntpID"], [{ amount: 24.205 }, "amount"],
      [{ amount: -1 }, "amount"], [{ currency: "usd" }, "currency"]] as ReadonlyArray<readonly [Record<string, unknown>, string]>) {
      expect(codeOf(() => charged({ error: { code: "00" }, payment: payment(member) })), JSON.stringify(member)).toBe(`PAYMENT_RESPONSE_INVALID:${code}`);
    }
    expect(codeOf(() => charged({ error: { code: "00" }, payment: payment(), order: { orderID: "cd".repeat(16) } }))).toBe("PAYMENT_RESPONSE_INVALID:orderID");
    expect(codeOf(() => charged({ error: { code: "00" } }))).toBe("PAYMENT_RESPONSE_INVALID");
    expect(codeOf(() => charged([]))).toBe("PAYMENT_RESPONSE_INVALID");
  });

  it("finds the saved card at the first pinned path present, and keeps only the last four digits", () => {
    for (const path of NETOPIA_FACTS.tokenPaths) {
      const [, holder, leaf] = path.split(".") as [string, string, string | undefined];
      const member = leaf === undefined ? { [holder]: TOKEN_TEXT } : { [holder]: { [leaf]: TOKEN_TEXT } };
      expect(charged({ error: { code: "00" }, payment: payment(member) }).savedCard?.token.reveal(), path).toBe(TOKEN_TEXT);
    }
    expect(charged({ payment: payment({ binding: { token: TOKEN_TEXT }, token: OTHER_TOKEN }) }).savedCard?.token.reveal()).toBe(TOKEN_TEXT);
    expect(charged({ payment: payment({ binding: { token: TOKEN_TEXT, expireMonth: 0, expireYear: 0 }, instrument: { panMasked: "411111******" } }) }).savedCard)
      .toMatchObject({ expMonth: null, expYear: null, last4: null });
    for (const token of ["abc", "has space inside", "x".repeat(1025), true]) {
      expect(charged({ payment: payment({ binding: { token } }) }).savedCard, String(token).slice(0, 12)).toBeNull();
    }
    expect(charged({ payment: payment({ binding: { expireMonth: 13 } }) }).savedCard).toBeNull();
  });

  it("reads the card's country from the instrument, else ISSUER_COUNTRY; the time rule; the echoed client id", () => {
    const countryOf = (extra: Record<string, unknown>) => charged({ payment: payment(extra) }).cardCountry;
    expect([countryOf({ instrument: { country: 276 } }), countryOf({ instrument: { country: 0 }, data: { ISSUER_COUNTRY: "DE" } }),
      countryOf({ data: { ISSUER_COUNTRY: "276" } }), countryOf({ instrument: { country: 0 }, data: { ISSUER_COUNTRY: "0" } }), countryOf({})])
      .toEqual(["DE", "DE", "DE", null, null]);
    for (const operationDate of ["0001-01-01T00:00:00", "2026-10-06T09:59:00", "2026-10-07T10:00:00Z", undefined]) {
      expect(charged({ payment: payment({ operationDate }) }).occurredAt, String(operationDate)).toBeNull();
    }
    expect(charged({ payment: payment(), order: { orderID: ORDER, clientID: "ef".repeat(16) } }).clientId).toBe("ef".repeat(16));
    expect(charged({ payment: payment({ instrument: { clientID: "12".repeat(16) } }) }).clientId).toBe("12".repeat(16));
  });
});

describe("N2 — a status read's answer (spec §2.3 NO_SUCH_ORDER, §2.4.4)", () => {
  const notFound = NETOPIA_FACTS.notFoundCodes[0]!;
  const read = (body: unknown): PaymentAnswer => readPaymentAnswer(parse(body), STATUS);

  it("says NO_SUCH_ORDER only for the pinned not-found code with no payment", () => {
    expect(isNotFoundAnswer(parse({ error: { code: notFound, message: "order not found" } }))).toBe(true);
    expect(read({ error: { code: notFound } })).toEqual({ kind: "NO_SUCH_ORDER" });
    expect(isNotFoundAnswer(parse({ error: { code: notFound }, payment: payment() }))).toBe(false);
    expect(reportOf(read({ error: { code: notFound }, payment: payment() })).state).toBe("PAID");
    expect(isNotFoundAnswer(parse({ error: { code: "99" } }))).toBe(false);
  });

  it("reads every later status from the table, and a merchant code beside a declined status as MERCHANT", () => {
    const states = [8, 9, 10, 16, 17, 4, 23, 2].map((status) => reportOf(read({ error: { code: "00" }, payment: payment({ status }) })).state);
    expect(states).toEqual(["REFUNDED", "CHARGEBACK_OPENED", "CHARGEBACK_LOST", "CHARGEBACK_REPRESENTED", "UNCLEAR", "VOIDED", "EXPIRED", "AUTHORIZED"]);
    expect(reportOf(read({ error: { code: "99" }, payment: payment({ status: 12 }) })))
      .toMatchObject({ state: "DECLINED", declineCode: "99", declineSide: "MERCHANT", bankDeclined: false });
  });

  it("refuses a code with no payment, and a reused-order answer, as their own errors", () => {
    expect(codeOf(() => read({ error: { code: "99" } }))).toBe("PAYMENT_CONFIGURATION_REFUSED:99");
    expect(codeOf(() => read({ error: { code: "56" } }))).toBe("PAYMENT_RESPONSE_INVALID");
    expect(codeOf(() => read({}))).toBe("PAYMENT_RESPONSE_INVALID");
  });
});
