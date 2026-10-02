import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { XMoneyClient } from "@debateai/payments-xmoney";
import {
  StageShiftedXMoneyClient,
  assertStageInvoicersAreSandboxes,
  billingClock
} from "../../apps/api/src/billing/stage-clock.js";
import { startFakeXMoney, type FakeXMoney } from "../support/fake-xmoney.js";

const FIXED = new Date("2026-10-01T00:00:00.000Z");
const DAY = 86_400_000;
const STAGE = "https://api-stage.xmoney.com";
const codeOf = (run: () => unknown): string => {
  try { run(); } catch (error) { if (error instanceof TypedDomainError) return error.code; throw error; }
  throw new Error("expected a refusal");
};

let fake: FakeXMoney;
beforeAll(async () => { fake = await startFakeXMoney(); });
afterAll(async () => { await fake?.stop(); });

describe("P23 the stage clock (spec §2.8: renew by advancing the clock)", () => {
  it("is the real clock, with no offset, when none is set, on stage and on live", () => {
    for (const apiBaseUrl of [STAGE, "https://api.xmoney.com", null]) {
      const stage = billingClock({ apiBaseUrl, offsetDays: null, now: () => FIXED });
      expect(stage.clock()).toEqual(FIXED);
      expect(stage.offsetMs).toBe(0);
    }
  });

  it("moves the billing clock forward by whole days against xMoney's stage API only, and says by how much", () => {
    const stage = billingClock({ apiBaseUrl: STAGE, offsetDays: 31, now: () => FIXED });
    expect(stage.clock().toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(stage.offsetMs).toBe(31 * DAY);
  });

  it("talks to xMoney in real time under a moved clock: a transaction made now is found from the moved side", async () => {
    const real = new XMoneyClient({ baseUrl: fake.baseUrl, privateKey: fake.privateKey, siteId: fake.siteId, timeoutMs: 5_000 });
    const shifted = new StageShiftedXMoneyClient(real, () => 31 * DAY);
    const identifier = "b".repeat(32);
    await shifted.createCustomer({ identifier, email: "person@example.test", country: "RO" });
    const before = Date.now();
    const paid = await fake.completeOrder({
      externalOrderId: "a".repeat(32), amountDecimal: "24.20", cardCountry: "RO", succeed: true, customerIdentifier: identifier
    });
    // The billing runtime asks from ITS clock (31 days ahead), as A2's adoption check does from charge.created_at.
    const ahead = { from: new Date(before + 31 * DAY - 60_000), to: new Date(Date.now() + 31 * DAY + 60_000) };
    expect((await real.listTransactions(ahead)).map((found) => found.transactionId)).not.toContain(paid.transactionId);
    const listed = await shifted.listTransactions(ahead);
    const found = listed.find((transaction) => transaction.transactionId === paid.transactionId);
    expect(found).toBeDefined();
    // ... and reads the transaction's time on its own clock, so "not older than the charge" still holds.
    expect(found!.createdAt!.getTime()).toBeGreaterThanOrEqual(before + 31 * DAY - 1_000);
    expect((await shifted.getTransaction(paid.transactionId)).createdAt!.getTime()).toBe(found!.createdAt!.getTime());
    expect(await shifted.getOrder(paid.orderId)).toEqual(await real.getOrder(paid.orderId));
  });

  it("finds a refund made now from the moved side, and reads its time on the moved clock", async () => {
    const real = new XMoneyClient({ baseUrl: fake.baseUrl, privateKey: fake.privateKey, siteId: fake.siteId, timeoutMs: 5_000 });
    const shifted = new StageShiftedXMoneyClient(real, () => 31 * DAY);
    const identifier = "c".repeat(32);
    await shifted.createCustomer({ identifier, email: "refund@example.test", country: "RO" });
    const before = Date.now();
    const paid = await fake.completeOrder({
      externalOrderId: "d".repeat(32), amountDecimal: "24.20", cardCountry: "RO", succeed: true, customerIdentifier: identifier
    });
    await shifted.refund({ transactionId: paid.transactionId, amountDecimal: null, reason: "customer-demand", message: "stage clock" });
    // RefundDesk asks from ITS clock (31 days ahead) whether the refund already landed.
    const ahead = {
      transactionId: paid.transactionId, orderId: paid.orderId,
      from: new Date(before + 31 * DAY - 60_000), to: new Date(Date.now() + 31 * DAY + 60_000)
    };
    expect(await real.refundsOf(ahead)).toBeNull();
    const seen = await shifted.refundsOf(ahead);
    expect(seen).not.toBeNull();
    expect(seen!.refundedDecimal).toBe("24.20");
    expect(seen!.rows[0]!.createdAt!.getTime()).toBeGreaterThanOrEqual(before + 31 * DAY - 1_000);
  });

  // XMoneyClient's public methods are createCustomer, getTransaction, getOrder, getCard, rebill, refund,
  // listTransactions and refundsOf (P3b); its #call and #transportFailure are private and not on the prototype list.
  it("overrides every public XMoneyClient method, so none can reach xMoney untranslated", () => {
    const methods = Object.getOwnPropertyNames(XMoneyClient.prototype).filter((name) => name !== "constructor");
    expect(methods.length).toBeGreaterThan(0);
    for (const name of methods) {
      expect(Object.hasOwn(StageShiftedXMoneyClient.prototype, name), name).toBe(true);
    }
  });

  it("never lets a stage payment reach a live invoicing service, whatever the clock", () => {
    const sandboxes = {
      xmoneyApiBaseUrl: STAGE,
      quadernoApiBaseUrl: "https://debateai.sandbox-quadernoapp.com/api",
      smartbillApiBaseUrl: "https://smartbill.invalid"
    };
    expect(() => assertStageInvoicersAreSandboxes(sandboxes)).not.toThrow();
    expect(codeOf(() => assertStageInvoicersAreSandboxes({ ...sandboxes, quadernoApiBaseUrl: "https://debateai.quadernoapp.com/api" })))
      .toBe("BILLING_STAGE_LIVE_INVOICER_REFUSED");
    expect(codeOf(() => assertStageInvoicersAreSandboxes({ ...sandboxes, smartbillApiBaseUrl: "https://ws.smartbill.ro/SBORO/api" })))
      .toBe("BILLING_STAGE_LIVE_INVOICER_REFUSED");
    expect(codeOf(() => assertStageInvoicersAreSandboxes({ ...sandboxes, quadernoApiBaseUrl: null })))
      .toBe("BILLING_STAGE_LIVE_INVOICER_REFUSED");
    // Live payments with live invoicing is the ordinary production setting.
    expect(() => assertStageInvoicersAreSandboxes({
      xmoneyApiBaseUrl: "https://api.xmoney.com",
      quadernoApiBaseUrl: "https://debateai.quadernoapp.com/api",
      smartbillApiBaseUrl: "https://ws.smartbill.ro/SBORO/api"
    })).not.toThrow();
  });

  it("refuses to move the clock against live money, or by a senseless amount", () => {
    expect(codeOf(() => billingClock({ apiBaseUrl: "https://api.xmoney.com", offsetDays: 31 }))).toBe("BILLING_STAGE_CLOCK_LIVE_REFUSED");
    expect(codeOf(() => billingClock({ apiBaseUrl: null, offsetDays: 1 }))).toBe("BILLING_STAGE_CLOCK_LIVE_REFUSED");
    expect(codeOf(() => billingClock({ apiBaseUrl: "https://api-stage.xmoney.com.evil.test", offsetDays: 1 }))).toBe("BILLING_STAGE_CLOCK_LIVE_REFUSED");
    for (const offsetDays of [0, -1, 401, 1.5]) {
      expect(codeOf(() => billingClock({ apiBaseUrl: "https://api-stage.xmoney.com", offsetDays })), String(offsetDays))
        .toBe("BILLING_STAGE_CLOCK_OFFSET_INVALID");
    }
  });
});
