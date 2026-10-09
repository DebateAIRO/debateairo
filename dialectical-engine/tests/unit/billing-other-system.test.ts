import { describe, expect, it } from "vitest";
import type { SubscriptionEvent, SubscriptionState } from "@debateai/billing-core";
import type { BillingRepository, ChargeEventRow, ChargeRow, OutboxJob } from "@debateai/db";
import type { BillingAuditEvent } from "../../apps/api/src/billing/audit.js";
import { createQuadernoRefundHandler, createQuadernoSaleHandler } from "../../apps/api/src/billing/invoice-quaderno.js";
import { createSmartBillInvoiceHandler, createSmartBillStornoHandler } from "../../apps/api/src/billing/invoice-smartbill.js";
import { BillingMaintenance, type MaintenanceDeps } from "../../apps/api/src/billing/maintenance.js";
import type { OutboxHandler } from "../../apps/api/src/billing/outbox.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { createRenewalNoticeHandler } from "../../apps/api/src/billing/renewal-notice-job.js";
import { subscriptionView, withdrawalOpenUntil } from "../../apps/api/src/billing/subscription-view.js";
import { VerifyPaymentHandler } from "../../apps/api/src/billing/verify-payment.js";
import { recordWithdrawal, type WithdrawalDeps } from "../../apps/api/src/billing/withdrawal.js";
import { activeSubscriptionEvents, testBillingPolicy } from "../support/billingFixtures.js";

/*
 * P2-I4 (D5 5h): after §14.8's same-host switch, the database still holds the sandbox's records. Every refund,
 * invoice and credit-note job of a charge paid in another payment system ends DEAD before any vendor call, and a
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

/** A paid NETOPIA sandbox charge (the connectors below talk to live), with its payment and a refund of it. */
function sandboxCharge(
  system: Pick<ChargeRow, "paymentProvider" | "paymentEnvironment"> = { paymentProvider: "netopia", paymentEnvironment: "sandbox" }
): ChargeRow & { events: ChargeEventRow[] } {
  const event = (kind: ChargeEventRow["kind"], amountMicros: number, errorCode: string | null = null): ChargeEventRow => ({
    eventId: `${kind}-1`, chargeId: CHARGE_ID, kind, at: ACTIVATED, providerPaymentId: "61001", amountMicros, errorCode,
    ...system, refundsTransactionId: null
  });
  return {
    chargeId: CHARGE_ID, ownerRef: "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93", subscriptionId: "5d0a1c2b-3e4f-4a5b-8c6d-7e8f9a0b1c2d",
    kind: "INITIAL", attempt: 1, periodStart: ACTIVATED, periodEnd: new Date("2026-11-08T09:00:00.000Z"), quoteId: "q-1",
    netMicros: 20_000_000, taxMicros: 4_200_000, totalMicros: 24_200_000, currency: "USD", createdAt: ACTIVATED,
    ...system,
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

describe("P2-I4 a job of another payment system never reaches a vendor", () => {
  it("ends RefundDesk's job DEAD with O2 and one audit line, before any call to NETOPIA", async () => {
    const { lines, audit } = recorder();
    const enqueued: Array<Readonly<{ kind: string; ref: string }>> = [];
    const repository = only<ConstructorParameters<typeof RefundDesk>[0]["repository"]>({
      charge: async () => sandboxCharge(),
      withTransaction: async (work: (client: unknown) => Promise<unknown>) => work({}),
      enqueue: async (_client: unknown, queued: Readonly<{ kind: string; ref: string }>) => { enqueued.push(queued); return "queued"; },
      // W9 (P2-M8): a dead WITHDRAWAL refund's O2 looks up the withdrawal for its deadline; none is recorded here.
      subscriptionEvents: async () => []
    }, "repository");
    const desk = new RefundDesk({
      repository,
      jobs: only({ withLease: async (_key: string, work: () => Promise<unknown>) => ({ kind: "RAN", value: await work() }) }, "jobs"),
      policy: testBillingPolicy, audit, clock: () => NOW,
      netopia: { payments: only({}, "payments"), paymentEnvironment: "live", jobs: only({}, "netopia.jobs") }
    });
    const refund = job("PAYMENT_REFUND", `${CHARGE_ID}:61002`, {
      charge_id: CHARGE_ID, transaction_id: "61002", amount_micros: 5_000_000, whole: false,
      owner_ref: sandboxCharge().ownerRef, reason: "WITHDRAWAL"
    });
    expect(await desk.handle(refund, NOW)).toEqual({ kind: "DEAD", code: "OTHER_PAYMENT_SYSTEM" });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({ kind: "EMAIL", payload: expect.objectContaining({ template: "O2", "param.reasonCode": "OTHER_PAYMENT_SYSTEM" }) });
    expect(lines).toEqual([{ event: "billing.outbox.other_system", fields: { kind: "PAYMENT_REFUND", code: "OTHER_PAYMENT_SYSTEM" } }]);
  });

  it("ends a payment check that names the other system's charge DEAD with one audit line, before any status read", async () => {
    const { lines, audit } = recorder();
    const handler = new VerifyPaymentHandler(only<ConstructorParameters<typeof VerifyPaymentHandler>[0]>({
      repository: only({ charge: async () => sandboxCharge() }, "repository"),
      jobs: only({}, "jobs"), refunds: only({}, "refunds"), entitlements: only({}, "entitlements"),
      audit, netopia: { payments: only({}, "payments"), paymentEnvironment: "live", jobs: only({}, "netopia.jobs") }
    }, "deps"));
    const verify = job("VERIFY_PAYMENT", CHARGE_ID, { charge_id: CHARGE_ID });
    expect(await handler.handle(verify, NOW)).toEqual({ kind: "DEAD", code: "OTHER_PAYMENT_SYSTEM" });
    expect(lines).toEqual([{ event: "billing.outbox.other_system", fields: { kind: "VERIFY_PAYMENT", code: "OTHER_PAYMENT_SYSTEM" } }]);
  });

  it("ends each of the four invoice and credit-note jobs of a NETOPIA charge of the other environment DEAD OTHER_PAYMENT_SYSTEM (PR-38)", async () => {
    // A NETOPIA sandbox charge, on an API serving NETOPIA live: the invoice guard (`otherSystemOutcome`) refuses it
    // before Quaderno or SmartBill, with one audit line.
    const deps = (audit: ReturnType<typeof recorder>["audit"], paymentEnvironment: "live") => ({
      repository: only<never>({ charge: async () => sandboxCharge() }, "repository"),
      jobs: only<never>({}, "jobs"), issuer: only<never>({}, "issuer"), tax: only<never>({}, "tax"),
      recipients: only<never>({}, "recipients"),
      recordsKey: Buffer.alloc(32), policy: testBillingPolicy, publicAppUrl: "https://debate.example.test", audit,
      paymentEnvironment
    });
    const credit = { charge_id: CHARGE_ID, transaction_id: "61001", refund_micros: 24_200_000 };
    const cases: Array<readonly [OutboxJob["kind"], (made: ReturnType<typeof deps>) => OutboxHandler, OutboxJob]> = [
      ["QUADERNO_RECORD_SALE", createQuadernoSaleHandler, job("QUADERNO_RECORD_SALE", CHARGE_ID, { card_country: "DE" })],
      ["QUADERNO_RECORD_REFUND", createQuadernoRefundHandler, job("QUADERNO_RECORD_REFUND", `${CHARGE_ID}:61001`, credit)],
      ["SMARTBILL_INVOICE", createSmartBillInvoiceHandler, job("SMARTBILL_INVOICE", CHARGE_ID, { card_country: "RO" })],
      ["SMARTBILL_STORNO", createSmartBillStornoHandler, job("SMARTBILL_STORNO", `${CHARGE_ID}:61001`, credit)]
    ];
    for (const served of ["live"] as const) {
      for (const [kind, create, queued] of cases) {
        const { lines, audit } = recorder();
        expect(await create(deps(audit, served))(queued, NOW), `${kind} on ${String(served)}`)
          .toEqual({ kind: "DEAD", code: "OTHER_PAYMENT_SYSTEM" });
        expect(lines, kind).toEqual([{ event: "billing.outbox.other_system", fields: { kind, code: "OTHER_PAYMENT_SYSTEM" } }]);
      }
    }
  });
});

function state(overrides: Partial<SubscriptionState> = {}): SubscriptionState {
  return Object.freeze({
    subscriptionId: "5d0a1c2b-3e4f-4a5b-8c6d-7e8f9a0b1c2d", ownerRef: "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93", planId: "PLUS",
    status: "ACTIVE", periodAnchorAt: ACTIVATED, currentPeriodStart: ACTIVATED, currentPeriodEnd: new Date("2026-11-08T09:00:00.000Z"),
    cancelRequested: true, scheduledDowngradePlanId: null,
    activatedAt: ACTIVATED, endedCause: null, pastDueSince: null, retryIndex: 0, renewalPostponedUntil: null,
    announcedTotalMicros: 24_200_000, lastNoticeAt: null, paymentProvider: "netopia", paymentEnvironment: "sandbox",
    cardTokenId: null,
    ...overrides
  });
}

describe("P2-I4 a plan of another payment system offers no withdrawal and cannot be withdrawn", () => {
  it("hides the withdrawal window of a sandbox plan on live, and shows it in its own system", () => {
    const input = (paymentEnvironment: "sandbox" | "live") => ({
      state: state(), taxCountry: "RO", policy: testBillingPolicy, now: NOW, paymentEnvironment
    });
    expect(subscriptionView(input("live"))).toMatchObject({ withdrawal_open_until: null, withdrawal_last_day: null });
    expect(withdrawalOpenUntil(input("live"))).toBeNull();
    expect(subscriptionView(input("sandbox")).withdrawal_open_until).not.toBeNull();
  });

  it("refuses the withdrawal NOT_SUBSCRIBED before reading anything else or writing", async () => {
    const deps = only<WithdrawalDeps>({
      billing: only({ subscriptionForOwner: async () => state() }, "billing"),
      clock: () => NOW, paymentEnvironment: "live"
    }, "deps");
    await expect(recordWithdrawal(deps, {
      ownerRef: state().ownerRef, withdrewAt: NOW, source: "SETTINGS", authorize: async () => undefined
    })).rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
  });
});

/**
 * A plan of NETOPIA's live environment (rule 4 of N24b: the OTHER environment of an API serving the sandbox), activated
 * at `at`, folded by the handlers below.
 */
function liveSubscription(at: Date): Readonly<{ events: SubscriptionEvent[]; subscriptionId: string; ownerRef: string }> {
  const events = activeSubscriptionEvents("0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93", at, "PLUS", { provider: "netopia", environment: "live" });
  return { events, subscriptionId: events[0]!.subscriptionId, ownerRef: events[0]!.ownerRef };
}

describe("P2-W3 (b) a renewal notice or yearly reminder of the other payment system is never priced or sent", () => {
  // Activated 1 October: the period ends 1 November, inside the 10-business-day look-ahead from 20 October.
  const activated = new Date("2026-10-01T09:00:00.000Z");
  const periodEnd = "2026-11-01T09:00:00.000Z";
  const noticeAt = new Date("2026-10-20T12:00:00.000Z");

  function noticeRun(api: "sandbox" | "live") {
    const { lines, audit } = recorder();
    const subscription = liveSubscription(activated);
    const priced: string[] = [];
    const written: string[] = [];
    const handler = createRenewalNoticeHandler({
      repository: only({
        subscriptionEvents: async () => subscription.events,
        withTransaction: async (work: (client: unknown) => Promise<unknown>) => work({})
      }, "repository"),
      jobs: only({ lockOwner: async () => undefined }, "jobs"),
      renewal: only({
        freshQuote: async () => { priced.push("quote"); return { tax: { totalMicros: 30_000_000 } }; },
        writeNotice: async () => { written.push("notice"); }
      }, "renewal"),
      policy: testBillingPolicy, paymentEnvironment: api, audit
    });
    const notice = job("RENEWAL_NOTICE", `${subscription.subscriptionId}:${periodEnd}`, {});
    return { run: () => handler(notice, noticeAt), lines, priced, written };
  }

  it("ends a live plan's RENEWAL_NOTICE on a sandbox API DEAD OTHER_PAYMENT_SYSTEM before any quote, with one audit line", async () => {
    const sandbox = noticeRun("sandbox");
    expect(await sandbox.run()).toEqual({ kind: "DEAD", code: "OTHER_PAYMENT_SYSTEM" });
    expect(sandbox.priced).toEqual([]);
    expect(sandbox.written).toEqual([]);
    expect(sandbox.lines).toEqual([{ event: "billing.outbox.other_system", fields: { kind: "RENEWAL_NOTICE", code: "OTHER_PAYMENT_SYSTEM" } }]);
  });

  it("still prices and writes the notice in the plan's own system (control)", async () => {
    const live = noticeRun("live");
    expect(await live.run()).toEqual({ kind: "DONE" });
    expect(live.priced).toEqual(["quote"]);
    expect(live.written).toEqual(["notice"]);
    expect(live.lines).toEqual([]);
  });

  async function reminderPass(api: "sandbox" | "live") {
    // M4: a plan activated a year ago, visited inside the 7 days after its anniversary.
    const subscription = liveSubscription(new Date("2025-10-01T09:00:00.000Z"));
    const enqueued: Array<Readonly<{ kind: string; ref: string; payload: Readonly<Record<string, unknown>> }>> = [];
    const maintenance = new BillingMaintenance({
      repository: only<BillingRepository>({
        subscriptionEvents: async () => subscription.events,
        customerByOwner: async () => ({ customerId: "7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918" }),
        withTransaction: async (work: (client: unknown) => Promise<unknown>) => work({}),
        enqueue: async (_client: unknown, queued: Readonly<{ kind: string; ref: string; payload: Readonly<Record<string, unknown>> }>) => {
          enqueued.push(queued);
          return "queued";
        }
      }, "repository"),
      jobs: only<MaintenanceDeps["jobs"]>({
        liveSubscriptionIds: async (after: string | null) => after === null ? [subscription.subscriptionId] : [],
        outboxJobExists: async () => false
      }, "jobs"),
      entitlements: only({}, "entitlements"), renewal: only({}, "renewal"),
      policy: testBillingPolicy, publicAppUrl: "https://debate.example.test", paymentEnvironment: api,
      audit: () => undefined, clock: () => new Date("2026-10-03T12:00:00.000Z")
    });
    const report = await maintenance.runOnce();
    return { report, enqueued };
  }

  it("sends no yearly reminder (M4) for a live plan on a sandbox API", async () => {
    const sandbox = await reminderPass("sandbox");
    expect(sandbox.enqueued).toEqual([]);
    expect(sandbox.report).toMatchObject({ visited: 1, reminded: 0, failed: 0 });
  });

  it("sends the yearly reminder in the plan's own system (control)", async () => {
    const live = await reminderPass("live");
    expect(live.enqueued).toEqual([expect.objectContaining({ kind: "EMAIL", payload: expect.objectContaining({ template: "M4" }) })]);
    expect(live.report).toMatchObject({ visited: 1, reminded: 1, failed: 0 });
  });
});
