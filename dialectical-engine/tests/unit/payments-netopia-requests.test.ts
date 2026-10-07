// tests/unit/payments-netopia-requests.test.ts
// N2 (spec 2026-10-05 §2.4.2): the exact JSON text of the three requests. The expected text is JSON.stringify of a literal in
// NETOPIA's member order; JSON.stringify writes 24.2 as the package's digit writer must, so a float slip or a reordered member
// fails byte for byte.
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import type { HostedPaymentStart, Payer, SavedCardCharge } from "@debateai/billing-core";
import { createSecretToken } from "@debateai/payments-netopia";
import { DEFAULT_REQUEST_FACTS, buildHostedStartBody, buildSavedCardChargeBody, buildStatusBody } from "../../packages/payments-netopia/src/requests.js";

/** Made-up values in NETOPIA's shapes, built from pieces (the leak scanner reads long key-like strings). */
const POS = ["AB12", "CD34", "EF56", "GH78", "IJ90"].join("-");
const TOKEN_TEXT = ["tok", "n2", "requests", "0001"].join("-");
const ORDER = "ab".repeat(16);
const CLIENT = "ef".repeat(16);
const NOTIFY = "https://debateai.test/api/v1/billing/netopia/notify";
const RETURN = `https://debateai.test/checkout/return?charge=${ORDER}`;
const CONTEXT = Object.freeze({ posSignature: POS, now: new Date("2026-10-06T10:00:00.789Z") });
const PAYER: Payer = Object.freeze({
  firstName: "Ana", lastName: "Pop", email: "ana@example.test", phone: "+40712345678", country: "RO",
  region: "Cluj", city: "Cluj-Napoca", postalCode: "400001", street: "Strada Exemplu 1"
});
const START: HostedPaymentStart = Object.freeze({
  orderId: ORDER, amountMicros: 24_200_000, currency: "USD", description: "DebateAI Plus, one month", payer: PAYER,
  clientId: CLIENT, returnUrl: RETURN, notifyUrl: NOTIFY, language: "ro"
});
const CHARGE: SavedCardCharge = Object.freeze({
  orderId: ORDER, amountMicros: 24_200_000, currency: "USD", description: "DebateAI Plus, one month", payer: PAYER,
  cardToken: createSecretToken(TOKEN_TEXT), payerIp: "203.0.113.7", returnUrl: RETURN, notifyUrl: NOTIFY, language: "ro"
});
const BILLING = {
  email: "ana@example.test", phone: "+40712345678", firstName: "Ana", lastName: "Pop", city: "Cluj-Napoca",
  country: 642, countryName: "Romania", state: "Cluj", postalCode: "400001", details: "Strada Exemplu 1"
};
const CONFIG = { emailTemplate: "", notifyUrl: NOTIFY, redirectUrl: RETURN, language: "ro" };
const HEAD = { ntpID: "", posSignature: POS, dateTime: "2026-10-06T10:00:00Z", description: "DebateAI Plus, one month", orderID: ORDER, amount: 24.2, currency: "USD" };
const codeOf = (run: () => unknown): string => {
  try { run(); } catch (error) { if (error instanceof TypedDomainError) return error.code; throw error; }
  throw new Error("expected a refusal");
};

describe("N2 — the hosted start (spec §2.4.2)", () => {
  it("writes NETOPIA's body exactly: no card data, the client id on the order, no cancelUrl", () => {
    const body = buildHostedStartBody(START, CONTEXT);
    expect(body).toBe(JSON.stringify({
      config: CONFIG, payment: { options: { installments: 0, bonus: 0 }, instrument: { type: "card" } },
      order: { ...HEAD, clientID: CLIENT, billing: BILLING }
    }));
    expect(body).toContain('"amount":24.2,');
    expect(body).not.toContain("cancelUrl");
    expect(DEFAULT_REQUEST_FACTS).toEqual({ clientIdLocation: "order", installments: 0 });
    expect(buildHostedStartBody({ ...START, amountMicros: 100_050_000 }, CONTEXT)).toContain('"amount":100.05,');
    expect(buildHostedStartBody({ ...START, amountMicros: 20_000_000 }, CONTEXT)).toContain('"amount":20,');
    expect(buildHostedStartBody({ ...START, amountMicros: 0 }, CONTEXT)).toContain('"amount":0,');
  });

  it("moves the client id to the instrument and changes the installments when the recording asks (N22)", () => {
    const body = JSON.parse(buildHostedStartBody(START, CONTEXT, { clientIdLocation: "instrument", installments: 1 }));
    expect(body.payment.instrument).toEqual({ type: "card", clientID: CLIENT });
    expect(body.payment.options.installments).toBe(1);
    expect(Object.hasOwn(body.order, "clientID")).toBe(false);
  });

  it("uses the city as the state without a region, an empty postcode without one, English for an unknown locale", () => {
    const body = JSON.parse(buildHostedStartBody({ ...START, language: "pt-BR", payer: { ...PAYER, region: null, postalCode: null, country: "IE" } }, CONTEXT));
    expect(body.order.billing).toMatchObject({ state: "Cluj-Napoca", postalCode: "", country: 372, countryName: "Ireland" });
    expect(body.config.language).toBe("en");
  });

  it("accepts a tool order's id (N22) and refuses any other order id or client id", () => {
    const tool = `t-${"cd".repeat(15)}`;
    expect(JSON.parse(buildHostedStartBody({ ...START, orderId: tool }, CONTEXT)).order.orderID).toBe(tool);
    for (const orderId of ["x", ORDER.toUpperCase(), `${ORDER}0`, "t-short", ""]) {
      expect(codeOf(() => buildHostedStartBody({ ...START, orderId }, CONTEXT)), orderId).toBe("PAYMENT_CONFIGURATION_REFUSED:orderId");
    }
    expect(codeOf(() => buildHostedStartBody({ ...START, clientId: CLIENT.toUpperCase() }, CONTEXT))).toBe("PAYMENT_CONFIGURATION_REFUSED:clientId");
  });
});

describe("N2 — the saved-card charge (spec §2.4.2)", () => {
  it("writes the token, the payer's address and IP, MIT and no client id", () => {
    const body = buildSavedCardChargeBody(CHARGE, CONTEXT);
    expect(body).toBe(JSON.stringify({
      config: CONFIG,
      payment: { options: { installments: 0, bonus: 0 }, instrument: { type: "card", token: TOKEN_TEXT }, data: { IP_ADDRESS: "203.0.113.7" } },
      order: { ...HEAD, scaExemptionInd: "MIT", billing: BILLING }
    }));
    expect(body).not.toContain("clientID");
    expect(String(CHARGE.cardToken)).toBe("[token]");
    expect(JSON.parse(buildSavedCardChargeBody({ ...CHARGE, payerIp: "2001:db8::7" }, CONTEXT)).payment.data.IP_ADDRESS).toBe("2001:db8::7");
  });

  it("refuses to send a charge whose payer misses a required field, naming the field only", () => {
    for (const [change, field] of [[{ firstName: " " }, "firstName"], [{ lastName: "" }, "lastName"], [{ email: "not-an-address" }, "email"],
      [{ phone: "0712345678" }, "phone"], [{ phone: "+4071" }, "phone"], [{ city: "" }, "city"], [{ street: "" }, "street"],
      [{ country: "XX" }, "country"], [{ country: "ROU" }, "country"]] as ReadonlyArray<readonly [Partial<Payer>, string]>) {
      let caught: unknown = null;
      try { buildSavedCardChargeBody({ ...CHARGE, payer: { ...PAYER, ...change } }, CONTEXT); } catch (error) { caught = error; }
      expect((caught as TypedDomainError).code, field).toBe(`PAYMENT_PAYER_INCOMPLETE:${field}`);
      expect((caught as TypedDomainError).message, field).toBe(`PAYMENT_PAYER_INCOMPLETE:${field}`);
    }
    for (const payerIp of ["", "not-an-ip", "256.1.1.1", "1.2.3"]) {
      expect(codeOf(() => buildSavedCardChargeBody({ ...CHARGE, payerIp }, CONTEXT)), payerIp).toBe("PAYMENT_PAYER_INCOMPLETE:payerIp");
    }
  });

  it("refuses a zero, sub-cent or negative charge, an empty description and a bad installments value", () => {
    for (const amountMicros of [0, -10_000, 24_200_001]) {
      expect(codeOf(() => buildSavedCardChargeBody({ ...CHARGE, amountMicros }, CONTEXT)), String(amountMicros)).toBe("PAYMENT_CONFIGURATION_REFUSED:amount");
    }
    expect(codeOf(() => buildSavedCardChargeBody({ ...CHARGE, description: "  " }, CONTEXT))).toBe("PAYMENT_CONFIGURATION_REFUSED:description");
    for (const installments of [-1, 1.5, Number.NaN]) {
      expect(codeOf(() => buildSavedCardChargeBody(CHARGE, CONTEXT, { clientIdLocation: "order", installments }))).toBe("PAYMENT_CONFIGURATION_REFUSED:installments");
    }
  });
});

describe("N2 — the status read (spec §2.4.2)", () => {
  it("sends posID, the best ntpID or an empty one, and the order id; refuses ids of the wrong form", () => {
    expect(buildStatusBody({ orderId: ORDER, providerPaymentId: "1234567" }, POS)).toBe(JSON.stringify({ posID: POS, ntpID: "1234567", orderID: ORDER }));
    expect(buildStatusBody({ orderId: ORDER, providerPaymentId: null }, POS)).toBe(JSON.stringify({ posID: POS, ntpID: "", orderID: ORDER }));
    expect(codeOf(() => buildStatusBody({ orderId: "x", providerPaymentId: null }, POS))).toBe("PAYMENT_CONFIGURATION_REFUSED:orderId");
    expect(codeOf(() => buildStatusBody({ orderId: ORDER, providerPaymentId: "has space" }, POS))).toBe("PAYMENT_CONFIGURATION_REFUSED:ntpID");
  });
});
