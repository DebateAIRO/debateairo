import { describe, expect, it, vi } from "vitest";
import { buildApi } from "@debateai/api";
import { BillingCheckoutPendingErrorSchema, createContractClient } from "@debateai/contract";
import type { ChargeEventRow } from "@debateai/db";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { chargeStatusOf, type ChargeStatusPort } from "../../apps/api/src/billing/charge-status.js";
import type { CheckoutResult, CheckoutServicePort } from "../../apps/api/src/billing/checkout.js";
import type { BillingRouteOptions } from "../../apps/api/src/billing/index.js";
import { BillingRefusal } from "../../apps/api/src/billing/refusal.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
import { testBillingPlans, unusedAskApplication } from "../support/billingFixtures.js";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const OWNER = testHttpIdentity("billing-checkout-owner");
const CHARGE = "0123456789abcdef0123456789abcdef";
const PAIR = { version: "sha256-aaaaaaaaaaaa", sha256: "a".repeat(64) };
const BODY = { quote_ref: "5f0c2a8e-8a61-4d1f-9a55-0d6f3a1b2c4d", locale: "en", consents: { renewal_terms: PAIR, immediate_start: PAIR } };
const RESULT: CheckoutResult = { chargeId: CHARGE, publicKey: "pk_test", orderPayload: "eyJ9", orderChecksum: "c2ln", sdkEnvironment: "stage", reused: false };
const REFUSED = Object.freeze({ allowed: false, reason: "LIMIT", retryAfterMs: 1_000, windowMs: 3_600_000 });

/** The age gate's answer for a session (`SessionApplication.readAgeConfirmation`, apps/api/src/sessions.ts:77). */
type AgeRead = (session: AuthenticatedSession) => Promise<"required" | "confirmed">;
const AGE_CONFIRMED: AgeRead = async () => "confirmed";

/** `age`: the age gate's reader; `null` is a session application without one (the dev helper as it stands). */
function harness(
  checkout: CheckoutServicePort, charges: ChargeStatusPort = { read: async () => null }, admission?: AdmissionLimiter,
  age: AgeRead | null = AGE_CONFIRMED
) {
  const billing: BillingRouteOptions = {
    plans: testBillingPlans, clock: () => NOW, legal: { requiresReacceptance: async () => false }, checkout, charges,
    quotes: { create: async () => { throw new Error("NOT_REACHED"); } }
  };
  // The reader is added the way tests/unit/age-gate-api.test.ts:202-203 adds it. It answers through `this`, as
  // SessionService.readAgeConfirmation does (apps/api/src/sessions.ts:561-564), so a reader buildApi hands the
  // routes detached fails its read (503) and the "confirmed" case below catches it.
  const sessions = age === null ? testSessionApplication([OWNER]) : {
    ...testSessionApplication([OWNER]),
    ageAnswer: age,
    // The return type is written out: inferring it through `this` (the literal's own type) would be circular.
    readAgeConfirmation(session: AuthenticatedSession): Promise<"required" | "confirmed"> { return this.ageAnswer(session); }
  };
  return buildApi({
    application: unusedAskApplication(), sessions, allowedOrigin: TEST_APP_ORIGIN, billing,
    ...(admission === undefined ? {} : { admission })
  });
}

const postCheckout = (api: ReturnType<typeof harness>, payload: unknown = BODY) => api.inject({
  method: "POST", url: "/v1/billing/checkout",
  headers: { ...testSessionHeaders(OWNER, true), "content-type": "application/json" }, payload: JSON.stringify(payload)
});

const event = (kind: string, errorCode: string | null = null) =>
  ({ eventId: "e", chargeId: CHARGE, kind, at: NOW, xmoneyTransactionId: "1", amountMicros: 24_200_000, errorCode }) as unknown as ChargeEventRow;

describe("P8c POST /v1/billing/checkout", () => {
  it("starts the embedded payment and answers only what the browser needs", async () => {
    const checkout = { start: vi.fn(async () => RESULT) };
    const api = harness(checkout);
    const response = await api.inject({
      method: "POST", url: "/v1/billing/checkout",
      headers: { ...testSessionHeaders(OWNER, true), "content-type": "application/json" }, payload: JSON.stringify({ ...BODY, country_confirmed: true })
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ public_key: "pk_test", order_payload: "eyJ9", order_checksum: "c2ln", charge_ref: CHARGE, sdk_environment: "stage" });
    expect(checkout.start).toHaveBeenCalledWith(expect.objectContaining({
      ownerRef: OWNER.authenticated.ownerRef, userId: OWNER.authenticated.userId, quoteRef: BODY.quote_ref, locale: "en",
      consents: { renewal: PAIR, immediateStart: PAIR }, countryConfirmed: true, now: NOW
    }));
    await api.close();
  });

  it("maps each refusal to its status and code, and refuses a body without both consents or a locale", async () => {
    for (const [status, code] of [[409, "LEGAL_DOCUMENT_STALE"], [409, "QUOTE_EXPIRED"], [409, "COUNTRY_CONFIRMATION_REQUIRED"], [422, "BILLING_ADDRESS_REQUIRED"], [503, "PAYMENT_PROVIDER_UNAVAILABLE"], [404, "NOT_FOUND"]] as const) {
      const api = harness({ start: async () => { throw new BillingRefusal(status, code); } });
      const response = await api.inject({ method: "POST", url: "/v1/billing/checkout", headers: { ...testSessionHeaders(OWNER, true), "content-type": "application/json" }, payload: JSON.stringify(BODY) });
      expect([response.statusCode, response.json()]).toEqual([status, { error: code, message: code }]);
      await api.close();
    }
    const api = harness({ start: vi.fn() });
    for (const payload of [{ ...BODY, consents: { renewal_terms: PAIR } }, { quote_ref: BODY.quote_ref, consents: BODY.consents }]) {
      const missing = await api.inject({ method: "POST", url: "/v1/billing/checkout", headers: { ...testSessionHeaders(OWNER, true), "content-type": "application/json" }, payload: JSON.stringify(payload) });
      expect(missing.statusCode).toBe(400);
    }
    await api.close();
  });

  it("answers CHECKOUT_PENDING with the charge the page must wait on, and the client reads it as data (D7 #5)", async () => {
    const api = harness({ start: async () => { throw new BillingRefusal(409, "CHECKOUT_PENDING", CHARGE); } });
    const response = await postCheckout(api);
    expect([response.statusCode, response.json()]).toEqual([409, { error: "CHECKOUT_PENDING", message: "CHECKOUT_PENDING", charge_ref: CHARGE }]);
    expect(BillingCheckoutPendingErrorSchema.safeParse(response.json()).success).toBe(true);
    await api.close();
    const answering = (status: number, body: unknown): typeof fetch => async () =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const request = { quote_ref: BODY.quote_ref, locale: "en", consents: BODY.consents };
    const pending = createContractClient("https://api.debateai.test", answering(409, response.json()));
    expect(await pending.startBillingCheckout(request)).toEqual({ state: "PENDING", charge_ref: CHARGE });
    const expired = createContractClient("https://api.debateai.test", answering(409, { error: "QUOTE_EXPIRED", message: "QUOTE_EXPIRED" }));
    await expect(expired.startBillingCheckout(request)).rejects.toMatchObject({ status: 409, serverCode: "QUOTE_EXPIRED" });
    const signed = createContractClient("https://api.debateai.test", answering(200, {
      public_key: "pk_test", order_payload: "eyJ9", order_checksum: "c2ln", charge_ref: CHARGE, sdk_environment: "stage"
    }));
    expect(await signed.startBillingCheckout(request)).toMatchObject({ charge_ref: CHARGE, sdk_environment: "stage" });
  });

  it("charges its own owner-keyed checkout budget (spec §2.7), not the quote's", async () => {
    const decide = vi.fn(() => REFUSED);
    const checkout = { start: vi.fn(async () => RESULT) };
    const limited = harness(checkout, undefined, { configured: () => true, decide } as unknown as AdmissionLimiter);
    const refused = await postCheckout(limited);
    expect([refused.statusCode, refused.json()]).toEqual([429, { error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" }]);
    expect(decide).toHaveBeenCalledWith("billingCheckout", OWNER.authenticated.ownerRef, expect.any(Date));
    expect(decide).not.toHaveBeenCalledWith("billingQuote", expect.anything(), expect.anything());
    expect(checkout.start).not.toHaveBeenCalled();
    await limited.close();
  });

  it("still lets the person pay when the quote budget is spent", async () => {
    const decide = vi.fn((scope: string) => (scope === "billingQuote" ? REFUSED : { allowed: true as const }));
    const api = harness({ start: vi.fn(async () => RESULT) }, undefined, { configured: () => true, decide } as unknown as AdmissionLimiter);
    const quote = await api.inject({
      method: "POST", url: "/v1/billing/quote",
      headers: { ...testSessionHeaders(OWNER, true), "content-type": "application/json" },
      payload: JSON.stringify({ plan_id: "PLUS", country: "RO" })
    });
    expect(quote.statusCode).toBe(429);
    expect((await postCheckout(api)).statusCode).toBe(200);
    await api.close();
  });

  it("takes no payment while the account still owes its one-time age check (R3-2: the age gate would freeze it later)", async () => {
    const checkout = { start: vi.fn(async () => RESULT) };
    const owed = vi.fn(async (_session: AuthenticatedSession) => "required" as const);
    const api = harness(checkout, undefined, undefined, owed);
    const refused = await postCheckout(api);
    expect([refused.statusCode, refused.json()]).toEqual([403, { error: "AGE_CONFIRMATION_REQUIRED", message: "AGE_CONFIRMATION_REQUIRED" }]);
    expect(owed).toHaveBeenCalledWith(OWNER.authenticated);
    expect(checkout.start).not.toHaveBeenCalled();
    await api.close();
  });

  it("goes on once the age check is confirmed, and fails closed when the check cannot be read", async () => {
    const confirmed = { start: vi.fn(async () => RESULT) };
    const on = harness(confirmed, undefined, undefined, async () => "confirmed");
    expect((await postCheckout(on)).statusCode).toBe(200);
    expect(confirmed.start).toHaveBeenCalledTimes(1);
    await on.close();
    // A read that throws, and a session application with no reader at all: the age gate's own 503, and no payment.
    for (const age of [async (): Promise<never> => { throw new Error("AGE_READ_FAILED"); }, null]) {
      const checkout = { start: vi.fn(async () => RESULT) };
      const api = harness(checkout, undefined, undefined, age);
      const response = await postCheckout(api);
      expect([response.statusCode, response.json()]).toEqual([503, { error: "AGE_CHECK_UNAVAILABLE", message: "AGE_CHECK_UNAVAILABLE" }]);
      expect(checkout.start).not.toHaveBeenCalled();
      await api.close();
    }
  });
});

describe("P8c GET /v1/billing/charges/{chargeRef}", () => {
  it("reads the state of the caller's own charge, and 404s anything else", async () => {
    const read = vi.fn(async (ref: string, ownerRef: string) => ref === CHARGE && ownerRef === OWNER.authenticated.ownerRef
      ? { state: "SUCCEEDED" as const, reasonCode: null } : null);
    const api = harness({ start: vi.fn() }, { read });
    const own = await api.inject({ method: "GET", url: `/v1/billing/charges/${CHARGE}`, headers: testSessionHeaders(OWNER) });
    expect([own.statusCode, own.json()]).toEqual([200, { state: "SUCCEEDED", reason_code: null }]);
    const other = await api.inject({ method: "GET", url: `/v1/billing/charges/${"f".repeat(32)}`, headers: testSessionHeaders(OWNER) });
    expect(other.statusCode).toBe(404);
    const anonymous = await api.inject({ method: "GET", url: `/v1/billing/charges/${CHARGE}` });
    expect(anonymous.statusCode).toBe(401);
    await api.close();
  });

  it("derives the state from the charge's events: a decline can be retried, a refused card cannot", () => {
    expect(chargeStatusOf([event("REQUESTED")])).toEqual({ state: "PENDING", reasonCode: null });
    expect(chargeStatusOf([event("REQUESTED"), event("SUCCEEDED")])).toEqual({ state: "SUCCEEDED", reasonCode: null });
    expect(chargeStatusOf([event("REQUESTED"), event("FAILED", "PAYMENT_DECLINED")])).toEqual({ state: "NEEDS_ACTION", reasonCode: "PAYMENT_DECLINED" });
    expect(chargeStatusOf([event("REQUESTED"), event("FAILED", "VOIDED")])).toEqual({ state: "FAILED", reasonCode: "VOIDED" });
    expect(chargeStatusOf([event("REQUESTED"), event("SUCCEEDED"), event("REFUND_REQUESTED", "CARD_COUNTRY_BLOCKED")]))
      .toEqual({ state: "FAILED", reasonCode: "CARD_COUNTRY_BLOCKED" });
    expect(chargeStatusOf([event("REQUESTED"), event("SUCCEEDED"), event("REFUND_REQUESTED", "PROVIDER_REFUND")]))
      .toEqual({ state: "SUCCEEDED", reasonCode: null });
    expect(chargeStatusOf([event("REQUESTED"), event("SUCCEEDED"), event("REFUND_REQUESTED", "CARD_CHECK_RELEASE")]))
      .toEqual({ state: "SUCCEEDED", reasonCode: null });
    // A second payment refunded on a charge its first payment settled: the charge is still paid (D5 5f).
    expect(chargeStatusOf([event("REQUESTED"), event("SUCCEEDED"), event("DUPLICATE_PAYMENT"), event("REFUND_REQUESTED", "DUPLICATE_PAYMENT")]))
      .toEqual({ state: "SUCCEEDED", reasonCode: null });
    // P12e's refused new card: the hold is released and the card change reads FAILED.
    expect(chargeStatusOf([event("REQUESTED"), event("SUCCEEDED"), event("REFUND_REQUESTED", "CARD_CHECK_REFUSED")]))
      .toEqual({ state: "FAILED", reasonCode: "CARD_CHECK_REFUSED" });
  });
});
