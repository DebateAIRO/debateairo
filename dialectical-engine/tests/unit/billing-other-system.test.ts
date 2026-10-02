import { describe, expect, it } from "vitest";
import type { SubscriptionState } from "@debateai/billing-core";
import type { ChargeEventRow, ChargeRow, OutboxJob } from "@debateai/db";
import type { BillingAuditEvent } from "../../apps/api/src/billing/audit.js";
import { createQuadernoRefundHandler, createQuadernoSaleHandler } from "../../apps/api/src/billing/invoice-quaderno.js";
import { createSmartBillInvoiceHandler, createSmartBillStornoHandler } from "../../apps/api/src/billing/invoice-smartbill.js";
import type { OutboxHandler } from "../../apps/api/src/billing/outbox.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { subscriptionView, withdrawalOpenUntil } from "../../apps/api/src/billing/subscription-view.js";
import { recordWithdrawal, type WithdrawalDeps } from "../../apps/api/src/billing/withdrawal.js";
import { testBillingPolicy } from "../support/billingFixtures.js";

/*
 * P2-I4 (D5 5h): after §14.8's same-host switch, the database still holds the sandbox's records. Every refund,
 * invoice and credit-note job of a charge paid in the other xMoney system ends DEAD before any vendor call, and a
 * withdrawal of a plan created there is refused, as P12c and P12e refuse an upgrade and a card change.
 */

const NOW = new Date("2026-10-10T12:00:00.000Z");
const ACTIVATED = new Date("2026-10-08T09:00:00.000Z");
const CHARGE_ID = "c".repeat(32);

/** Any member a test did not give throws, so a handler that reaches a vendor, a lease or a write fails loudly. */
function only<T extends object>(members: Partial<Record<string, unknown>>, name: string): T {
  return new Proxy(members, {
    get(target, property) {
      if (typeof property === "string" && property in target) return target[property];
      if (property === "then") return undefined;
      return () => { throw new Error(`${name}.${String(property)} must not be called`); };
    }
  }) as T;
}

/** A paid sandbox charge (the connectors below talk to live), with its payment and a refund of it. */
function stageCharge(): ChargeRow & { events: ChargeEventRow[] } {
  const event = (kind: ChargeEventRow["kind"], amountMicros: number, errorCode: string | null = null): ChargeEventRow => ({
    eventId: `${kind}-1`, chargeId: CHARGE_ID, kind, at: ACTIVATED, xmoneyTransactionId: "61001", amountMicros, errorCode,
    xmoneyEnvironment: "stage", refundsTransactionId: null
  });
  return {
    chargeId: CHARGE_ID, ownerRef: "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93", subscriptionId: "5d0a1c2b-3e4f-4a5b-8c6d-7e8f9a0b1c2d",
    kind: "INITIAL", attempt: 1, periodStart: ACTIVATED, periodEnd: new Date("2026-11-08T09:00:00.000Z"), quoteId: "q-1",
    netMicros: 20_000_000, taxMicros: 4_200_000, totalMicros: 24_200_000, currency: "USD", createdAt: ACTIVATED,
    xmoneyEnvironment: "stage",
    events: [event("SUCCEEDED", 24_200_000), event("REFUND_REQUESTED", 24_200_000, "WITHDRAWAL"), event("REFUNDED", 24_200_000)]
  };
}

function job(kind: OutboxJob["kind"], ref: string, payload: OutboxJob["payload"]): OutboxJob {
  return { jobId: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d", kind, ref, payload, createdAt: NOW, notBefore: NOW, attempts: 1,
    claimedBy: "w", claimedAt: NOW };
}

function recorder() {
  const lines: Array<Readonly<{ event: BillingAuditEvent; fields: Readonly<Record<string, unknown>> }>> = [];
  return { lines, audit: (event: BillingAuditEvent, fields: Readonly<Record<string, unknown>>) => { lines.push({ event, fields }); } };
}

describe("P2-I4 a job of the other xMoney system never reaches a vendor", () => {
  it("ends RefundDesk's job DEAD with O2 and one audit line, before any xMoney call", async () => {
    const { lines, audit } = recorder();
    const enqueued: Array<Readonly<{ kind: string; ref: string }>> = [];
    const repository = only<ConstructorParameters<typeof RefundDesk>[0]["repository"]>({
      charge: async () => stageCharge(),
      withTransaction: async (work: (client: unknown) => Promise<unknown>) => work({}),
      enqueue: async (_client: unknown, queued: Readonly<{ kind: string; ref: string }>) => { enqueued.push(queued); return "queued"; }
    }, "repository");
    const desk = new RefundDesk({
      repository,
      jobs: only({ withLease: async (_key: string, work: () => Promise<unknown>) => ({ kind: "RAN", value: await work() }) }, "jobs"),
      xmoney: only({}, "xmoney"), policy: testBillingPolicy, audit, clock: () => NOW, xmoneyEnvironment: "live"
    });
    const refund = job("XMONEY_REFUND", `${CHARGE_ID}:61002`, {
      charge_id: CHARGE_ID, transaction_id: "61002", amount_micros: 5_000_000, whole: false,
      owner_ref: stageCharge().ownerRef, reason: "WITHDRAWAL"
    });
    expect(await desk.handle(refund, NOW)).toEqual({ kind: "DEAD", code: "OTHER_XMONEY_SYSTEM" });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({ kind: "EMAIL", payload: expect.objectContaining({ template: "O2", "param.reasonCode": "OTHER_XMONEY_SYSTEM" }) });
    expect(lines).toEqual([{ event: "billing.outbox.other_system", fields: { kind: "XMONEY_REFUND", code: "OTHER_XMONEY_SYSTEM" } }]);
  });

  it("ends each of the four invoice and credit-note jobs DEAD with one audit line, before Quaderno or SmartBill", async () => {
    const deps = (audit: ReturnType<typeof recorder>["audit"]) => ({
      repository: only<never>({ charge: async () => stageCharge() }, "repository"),
      jobs: only<never>({}, "jobs"), issuer: only<never>({}, "issuer"), tax: only<never>({}, "tax"),
      recordsKey: Buffer.alloc(32), policy: testBillingPolicy, publicAppUrl: "https://debate.example.test", audit,
      xmoneyEnvironment: "live" as const
    });
    const credit = { charge_id: CHARGE_ID, transaction_id: "61001", refund_micros: 24_200_000 };
    const cases: Array<readonly [OutboxJob["kind"], (made: ReturnType<typeof deps>) => OutboxHandler, OutboxJob]> = [
      ["QUADERNO_RECORD_SALE", createQuadernoSaleHandler, job("QUADERNO_RECORD_SALE", CHARGE_ID, { card_country: "DE" })],
      ["QUADERNO_RECORD_REFUND", createQuadernoRefundHandler, job("QUADERNO_RECORD_REFUND", `${CHARGE_ID}:61001`, credit)],
      ["SMARTBILL_INVOICE", createSmartBillInvoiceHandler, job("SMARTBILL_INVOICE", CHARGE_ID, { card_country: "RO" })],
      ["SMARTBILL_STORNO", createSmartBillStornoHandler, job("SMARTBILL_STORNO", `${CHARGE_ID}:61001`, credit)]
    ];
    for (const [kind, create, queued] of cases) {
      const { lines, audit } = recorder();
      expect(await create(deps(audit))(queued, NOW), kind).toEqual({ kind: "DEAD", code: "OTHER_XMONEY_SYSTEM" });
      expect(lines, kind).toEqual([{ event: "billing.outbox.other_system", fields: { kind, code: "OTHER_XMONEY_SYSTEM" } }]);
    }
  });
});

function state(overrides: Partial<SubscriptionState> = {}): SubscriptionState {
  return Object.freeze({
    subscriptionId: "5d0a1c2b-3e4f-4a5b-8c6d-7e8f9a0b1c2d", ownerRef: "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93", planId: "PLUS",
    status: "ACTIVE", periodAnchorAt: ACTIVATED, currentPeriodStart: ACTIVATED, currentPeriodEnd: new Date("2026-11-08T09:00:00.000Z"),
    cancelRequested: true, scheduledDowngradePlanId: null, xmoneyOrderId: "901", xmoneyCustomerId: "77", cardRef: "4242",
    activatedAt: ACTIVATED, endedCause: null, pastDueSince: null, retryIndex: 0, renewalPostponedUntil: null,
    announcedTotalMicros: 24_200_000, lastNoticeAt: null, xmoneyEnvironment: "stage",
    ...overrides
  });
}

describe("P2-I4 a plan of the other xMoney system offers no withdrawal and cannot be withdrawn", () => {
  it("hides the withdrawal window of a sandbox plan on live, and shows it in its own system", () => {
    const input = (xmoneyEnvironment: "stage" | "live") => ({
      state: state(), taxCountry: "RO", policy: testBillingPolicy, now: NOW, xmoneyEnvironment
    });
    expect(subscriptionView(input("live"))).toMatchObject({ withdrawal_open_until: null, withdrawal_last_day: null });
    expect(withdrawalOpenUntil(input("live"))).toBeNull();
    expect(subscriptionView(input("stage")).withdrawal_open_until).not.toBeNull();
  });

  it("refuses the withdrawal NOT_SUBSCRIBED before reading anything else or writing", async () => {
    const deps = only<WithdrawalDeps>({
      billing: only({ subscriptionForOwner: async () => state() }, "billing"),
      clock: () => NOW, xmoneyEnvironment: "live"
    }, "deps");
    await expect(recordWithdrawal(deps, {
      ownerRef: state().ownerRef, withdrewAt: NOW, source: "SETTINGS", authorize: async () => undefined
    })).rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
  });
});
