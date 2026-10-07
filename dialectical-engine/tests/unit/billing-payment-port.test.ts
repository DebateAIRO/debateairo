import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  paymentError,
  paymentErrorCode,
  paymentNothingSent,
  type CardPayments,
  type HostedPaymentStart,
  type Payer,
  type PaymentErrorCode,
  type PaymentReport,
  type SavedCard,
  type SavedCardCharge,
  type SecretToken
} from "@debateai/billing-core";
import { TimeShiftedCardPayments } from "../../apps/api/src/billing/time-shifted-payments.js";

const ORDER = "a".repeat(32);
const PAID_AT = new Date("2026-10-01T10:00:00.000Z");
const ALL_CODES: ReadonlyArray<PaymentErrorCode> = Object.freeze([
  "PAYMENT_PROVIDER_UNAVAILABLE", "PAYMENT_OUTCOME_UNKNOWN", "PAYMENT_CREDENTIALS_REFUSED",
  "PAYMENT_CONFIGURATION_REFUSED", "PAYMENT_RESPONSE_INVALID", "PAYMENT_PAYER_INCOMPLETE"
]);

const codeOf = (run: () => unknown): string => {
  try { run(); } catch (error) { if (error instanceof TypedDomainError) return error.code; throw error; }
  throw new Error("expected a refusal");
};

/** A stand-in for N2's createSecretToken: billing-core only knows the interface. */
const fakeToken = (label: string): SecretToken => Object.freeze({
  reveal: () => label, fingerprint: `fp-${label}`, toString: () => "[token]", toJSON: () => "[token]"
});

const PAYER: Payer = Object.freeze({
  firstName: "Ana", lastName: "Pop", email: "ana@example.test", phone: "+40712345678", country: "RO",
  region: "Cluj", city: "Cluj-Napoca", postalCode: "400001", street: "Strada Exemplu 1"
});
const HOSTED_START: HostedPaymentStart = Object.freeze({
  orderId: ORDER, amountMicros: 24_200_000, currency: "USD", description: "DebateAI Plus, one month", payer: PAYER,
  clientId: "c".repeat(32), returnUrl: `https://debateai.test/checkout/return?charge=${ORDER}`,
  notifyUrl: "https://debateai.test/api/v1/billing/netopia/notify", language: "ro"
});
const SAVED_CARD_CHARGE: SavedCardCharge = Object.freeze({
  orderId: ORDER, amountMicros: 24_200_000, currency: "USD", description: "DebateAI Plus, one month", payer: PAYER,
  cardToken: fakeToken("old-card"), payerIp: "203.0.113.7", returnUrl: `https://debateai.test/checkout/return?charge=${ORDER}`,
  notifyUrl: "https://debateai.test/api/v1/billing/netopia/notify", language: "ro"
});
const NEW_CARD: SavedCard = Object.freeze({ token: fakeToken("new-card"), expMonth: 12, expYear: 2030, last4: "5098" });

function report(overrides: Partial<PaymentReport> = {}): PaymentReport {
  return Object.freeze({
    orderId: ORDER, providerPaymentId: "1234567", state: "PAID", providerStatus: "3", amountMicros: 24_200_000,
    currency: "USD", cardCountry: "RO", savedCard: NEW_CARD, declineCode: null, declineSide: null, bankDeclined: false,
    occurredAt: PAID_AT, clientId: null, ...overrides
  });
}

type Calls = {
  start: HostedPaymentStart[];
  charge: SavedCardCharge[];
  status: Array<Readonly<{ orderId: string; providerPaymentId: string | null }>>;
  refund: Array<Readonly<{ orderId: string; providerPaymentId: string; amountMicros: number }>>;
};

function recordingInner(o: Readonly<{
  environment?: "sandbox" | "live"; withRefund?: boolean; statusAnswer?: PaymentReport | "NO_SUCH_ORDER";
  occurredAt?: Date | null; fail?: Error;
}> = {}): { inner: CardPayments; calls: Calls } {
  const calls: Calls = { start: [], charge: [], status: [], refund: [] };
  const occurredAt = o.occurredAt === undefined ? PAID_AT : o.occurredAt;
  const base: CardPayments = {
    provider: "netopia",
    environment: o.environment ?? "sandbox",
    async startHostedPayment(i) {
      calls.start.push(i);
      if (o.fail !== undefined) throw o.fail;
      return { providerPaymentId: "ntp-start", redirectUrl: "https://secure-sandbox.netopia-payments.com/ui/card?p=x" };
    },
    async chargeSavedCard(i) {
      calls.charge.push(i);
      if (o.fail !== undefined) throw o.fail;
      return report({ orderId: i.orderId, occurredAt });
    },
    async status(i) {
      calls.status.push(i);
      if (o.fail !== undefined) throw o.fail;
      return o.statusAnswer ?? report({ orderId: i.orderId, occurredAt });
    }
  };
  if (o.withRefund !== true) return { inner: base, calls };
  return {
    inner: {
      ...base,
      async refund(i) {
        calls.refund.push(i);
        return report({ orderId: i.orderId, state: "REFUNDED", providerStatus: "8", occurredAt });
      }
    },
    calls
  };
}

/** Every method of the port. `satisfies` makes the typecheck fail when CardPayments gains or loses one. */
type PortMethod = {
  [K in keyof CardPayments]-?: NonNullable<CardPayments[K]> extends (...args: never[]) => unknown ? K : never
}[keyof CardPayments];
const EVERY_PORT_METHOD = {
  startHostedPayment: true, chargeSavedCard: true, status: true, refund: true
} as const satisfies Record<PortMethod, true>;
const INVOKE: Readonly<Record<PortMethod, (port: CardPayments) => Promise<unknown>>> = {
  startHostedPayment: (port) => port.startHostedPayment(HOSTED_START),
  chargeSavedCard: (port) => port.chargeSavedCard(SAVED_CARD_CHARGE),
  status: (port) => port.status({ orderId: ORDER, providerPaymentId: "1234567" }),
  refund: (port) => port.refund!({ orderId: ORDER, providerPaymentId: "1234567", amountMicros: 24_200_000 })
};
const CALLS_OF: Readonly<Record<PortMethod, keyof Calls>> = {
  startHostedPayment: "start", chargeSavedCard: "charge", status: "status", refund: "refund"
};

describe("N1 — the payment error vocabulary (spec §2.3)", () => {
  it("names the code, then the detail after a colon, in both the code and the message", () => {
    const refused = paymentError("PAYMENT_CONFIGURATION_REFUSED", "32");
    expect(refused).toBeInstanceOf(TypedDomainError);
    expect(refused.code).toBe("PAYMENT_CONFIGURATION_REFUSED:32");
    expect(refused.message).toBe("PAYMENT_CONFIGURATION_REFUSED:32");
    expect(paymentError("PAYMENT_OUTCOME_UNKNOWN").code).toBe("PAYMENT_OUTCOME_UNKNOWN");
    expect(paymentError("PAYMENT_CREDENTIALS_REFUSED", "401").code).toBe("PAYMENT_CREDENTIALS_REFUSED:401");
    expect(paymentError("PAYMENT_CONFIGURATION_REFUSED", "redirect").code).toBe("PAYMENT_CONFIGURATION_REFUSED:redirect");
    expect(paymentError("PAYMENT_PAYER_INCOMPLETE", "lastName").message).toBe("PAYMENT_PAYER_INCOMPLETE:lastName");
  });

  it("drops a detail that is not a short code, so no answer text, address or token rides on an error", () => {
    for (const detail of ["ana@example.test", "two words", "x".repeat(33), "", "line\nbreak", "{\"token\":\"t\"}"]) {
      const error = paymentError("PAYMENT_CONFIGURATION_REFUSED", detail);
      expect(error.code, JSON.stringify(detail)).toBe("PAYMENT_CONFIGURATION_REFUSED");
      expect(error.message, JSON.stringify(detail)).toBe("PAYMENT_CONFIGURATION_REFUSED");
    }
    expect(paymentError("PAYMENT_CONFIGURATION_REFUSED", "x".repeat(32)).code).toBe(`PAYMENT_CONFIGURATION_REFUSED:${"x".repeat(32)}`);
  });

  it("reads the base code back, and nothing for any other error or value", () => {
    for (const code of ALL_CODES) {
      expect(paymentErrorCode(paymentError(code))).toBe(code);
      expect(paymentErrorCode(paymentError(code, "400"))).toBe(code);
    }
    expect(paymentErrorCode(new TypedDomainError("XMONEY_UNAVAILABLE", "x"))).toBeNull();
    expect(paymentErrorCode(new TypedDomainError("PAYMENT_OUTCOME_UNKNOWNX", "x"))).toBeNull();
    expect(paymentErrorCode(new TypedDomainError("PAYMENT_DECLINED:20", "x"))).toBeNull();
    expect(paymentErrorCode(new Error("PAYMENT_OUTCOME_UNKNOWN"))).toBeNull();
    for (const value of [null, undefined, "PAYMENT_OUTCOME_UNKNOWN", { code: "PAYMENT_OUTCOME_UNKNOWN" }]) {
      expect(paymentErrorCode(value)).toBeNull();
    }
  });

  it("says nothing was sent only for the three codes that prove it", () => {
    const expected = {
      PAYMENT_PROVIDER_UNAVAILABLE: true,
      PAYMENT_CREDENTIALS_REFUSED: true,
      PAYMENT_CONFIGURATION_REFUSED: true,
      PAYMENT_OUTCOME_UNKNOWN: false,
      PAYMENT_RESPONSE_INVALID: false,
      PAYMENT_PAYER_INCOMPLETE: false
    } as const satisfies Record<PaymentErrorCode, boolean>;
    expect(Object.keys(expected).sort()).toEqual([...ALL_CODES].sort());
    for (const [code, nothingSent] of Object.entries(expected)) {
      expect(paymentNothingSent(paymentError(code as PaymentErrorCode)), code).toBe(nothingSent);
      expect(paymentNothingSent(paymentError(code as PaymentErrorCode, "x1")), `${code}:x1`).toBe(nothingSent);
    }
    expect(paymentNothingSent(new Error("boom"))).toBe(false);
    expect(paymentNothingSent(new TypedDomainError("XMONEY_UNAVAILABLE", "x"))).toBe(false);
    expect(paymentNothingSent(undefined)).toBe(false);
  });

  it("keeps billing-core free of node: imports, with kernel as its one dependency", () => {
    const directory = resolve(import.meta.dirname, "../../packages/billing-core/src");
    const offenders = readdirSync(directory)
      .filter((name) => name.endsWith(".ts"))
      .filter((name) => /(?:from\s+|import\s*\(\s*)["']node:/u.test(readFileSync(resolve(directory, name), "utf8")));
    expect(offenders).toEqual([]);
    const manifest = JSON.parse(readFileSync(resolve(directory, "../package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies)).toEqual(["@debateai/kernel"]);
    expect(readdirSync(directory)).toContain("payments.ts");
  });
});

describe("N1 — TimeShiftedCardPayments, the sandbox clock over the port (spec §2.3, §2.17.1)", () => {
  it("moves every time read back forward by the offset, and hands every input over unchanged", async () => {
    const { inner, calls } = recordingInner({ withRefund: true });
    const shifted = new TimeShiftedCardPayments(inner, 31);
    expect(shifted.provider).toBe("netopia");
    expect(shifted.environment).toBe("sandbox");

    const started = await shifted.startHostedPayment(HOSTED_START);
    expect(started).toEqual({ providerPaymentId: "ntp-start", redirectUrl: "https://secure-sandbox.netopia-payments.com/ui/card?p=x" });
    expect(calls.start[0]).toBe(HOSTED_START);

    const charged = await shifted.chargeSavedCard(SAVED_CARD_CHARGE);
    expect(calls.charge[0]).toBe(SAVED_CARD_CHARGE);
    expect(charged.occurredAt?.toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(charged.savedCard).toBe(NEW_CARD);
    expect({ ...charged, occurredAt: null }).toEqual({ ...report(), occurredAt: null });

    const read = await shifted.status({ orderId: ORDER, providerPaymentId: "1234567" });
    expect(calls.status[0]).toEqual({ orderId: ORDER, providerPaymentId: "1234567" });
    expect(read !== "NO_SUCH_ORDER" && read.occurredAt?.toISOString()).toBe("2026-11-01T10:00:00.000Z");

    const refunded = await shifted.refund!({ orderId: ORDER, providerPaymentId: "1234567", amountMicros: 24_200_000 });
    expect(calls.refund[0]).toEqual({ orderId: ORDER, providerPaymentId: "1234567", amountMicros: 24_200_000 });
    expect(refunded.state).toBe("REFUNDED");
    expect(refunded.occurredAt?.toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(PAID_AT.toISOString()).toBe("2026-10-01T10:00:00.000Z");
  });

  it("keeps an unknown time unknown, and passes NO_SUCH_ORDER and every error through unchanged", async () => {
    const unknownTime = new TimeShiftedCardPayments(recordingInner({ occurredAt: null }).inner, 31);
    expect((await unknownTime.chargeSavedCard(SAVED_CARD_CHARGE)).occurredAt).toBeNull();

    const missing = new TimeShiftedCardPayments(recordingInner({ statusAnswer: "NO_SUCH_ORDER" }).inner, 31);
    expect(await missing.status({ orderId: ORDER, providerPaymentId: null })).toBe("NO_SUCH_ORDER");

    const failure = paymentError("PAYMENT_OUTCOME_UNKNOWN");
    const failing = new TimeShiftedCardPayments(recordingInner({ fail: failure }).inner, 31);
    await expect(failing.chargeSavedCard(SAVED_CARD_CHARGE)).rejects.toBe(failure);
    await expect(failing.startHostedPayment(HOSTED_START)).rejects.toBe(failure);
    await expect(failing.status({ orderId: ORDER, providerPaymentId: null })).rejects.toBe(failure);
  });

  it("has refund exactly when the inner port has one (RefundDesk's owner mode needs it absent)", () => {
    const without = new TimeShiftedCardPayments(recordingInner().inner, 31);
    expect(without.refund).toBeUndefined();
    expect("refund" in without).toBe(false);
    const withRefund = new TimeShiftedCardPayments(recordingInner({ withRefund: true }).inner, 31);
    expect(typeof withRefund.refund).toBe("function");
    expect(Object.hasOwn(withRefund, "refund")).toBe(true);
  });

  it("wraps every port method: each one reaches the inner port through the wrapper", async () => {
    expect(Object.keys(EVERY_PORT_METHOD).sort()).toEqual(Object.keys(INVOKE).sort());
    for (const name of Object.keys(EVERY_PORT_METHOD) as PortMethod[]) {
      const { inner, calls } = recordingInner({ withRefund: true });
      const shifted = new TimeShiftedCardPayments(inner, 31);
      const own = name === "refund" ? Object.hasOwn(shifted, name) : Object.hasOwn(TimeShiftedCardPayments.prototype, name);
      expect(own, name).toBe(true);
      await INVOKE[name](shifted);
      expect(calls[CALLS_OF[name]], name).toHaveLength(1);
    }
  });

  it("refuses a live port, and an offset that is not a whole number of days from 1 to 400", () => {
    expect(codeOf(() => new TimeShiftedCardPayments(recordingInner({ environment: "live" }).inner, 31)))
      .toBe("BILLING_STAGE_CLOCK_LIVE_REFUSED");
    for (const offset of [0, -1, 1.5, 401, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(codeOf(() => new TimeShiftedCardPayments(recordingInner().inner, offset)), String(offset))
        .toBe("BILLING_STAGE_CLOCK_OFFSET_INVALID");
    }
    expect(() => new TimeShiftedCardPayments(recordingInner().inner, 1)).not.toThrow();
    expect(() => new TimeShiftedCardPayments(recordingInner().inner, 400)).not.toThrow();
  });
});
