import { describe, expect, it, vi } from "vitest";
import { foldSubscription, type SubscriptionEvent } from "@debateai/billing-core";
import type { BillingRepository, ChargeEventInput, ChargeRow } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { BillingMaintenance, type MaintenanceDeps } from "../../apps/api/src/billing/maintenance.js";
import { RenewalService, type RenewalDeps } from "../../apps/api/src/billing/renewal.js";
import { subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import type { ChargeSettlement } from "../../apps/api/src/billing/settlement.js";
import { activeSubscriptionEvents, testBillingPlans, testBillingPolicy } from "../support/billingFixtures.js";

const MINUTE = 60_000;
const DAY = 86_400_000;
const ACTIVATED = new Date("2026-10-01T10:00:00.000Z");

/** A clock that moves only when a test moves it, so a call that "takes time" can be modelled exactly. */
function movingClock(start: Date) {
  let at = start;
  return { read: () => at, advance: (ms: number) => { at = new Date(at.getTime() + ms); } };
}

/** A plan whose renewal (attempt 1) failed a minute after its period end: PAST_DUE, first retry due a day later. */
function pastDueHistory(): { events: SubscriptionEvent[]; periodStart: Date; failedAt: Date } {
  const active = activeSubscriptionEvents("o-timing", ACTIVATED);
  const periodStart = foldSubscription(active).currentPeriodEnd!;
  const failedAt = new Date(periodStart.getTime() + MINUTE);
  const pastDue = subscriptionEvent(foldSubscription(active), "PAST_DUE", failedAt, {
    charge_id: "c-attempt-1", attempt: 1, next_retry_at: new Date(failedAt.getTime() + DAY).toISOString(),
    first_failed_at: failedAt.toISOString()
  });
  return { events: [...active, pastDue], periodStart, failedAt };
}

describe("P2-I7 a dunning retry is dated by the clock inside its lease, never by the pass's start", () => {
  it("prices, writes and submits the retry at the time the lease was taken", async () => {
    const { events, periodStart, failedAt } = pastDueHistory();
    const passStart = new Date(failedAt.getTime() + DAY + MINUTE);
    const clock = movingClock(passStart);
    // The pass reaches this subscription 20 minutes after it started (slow vendors on earlier visits).
    const withSubscriptionLease = vi.fn(async (_subscriptionId: string, use: () => Promise<unknown>) => {
      clock.advance(20 * MINUTE);
      return { kind: "RAN" as const, value: await use() };
    });
    const leaseTime = new Date(passStart.getTime() + 20 * MINUTE);
    const charge = { chargeId: "c-attempt-2", attempt: 2, periodStart } as ChargeRow;
    const renewal = {
      erasureBlocks: vi.fn(async () => false),
      retryPrice: vi.fn(async () => ({ kind: "PRICED" as const, priced: {} as never })),
      createRetryCharge: vi.fn(async (_state: unknown, _periodStart: Date, _attempt: number, _priced: unknown, _now: Date) =>
        ({ charge, state: foldSubscription(events) })),
      submit: vi.fn(async (_charge: ChargeRow, _state: unknown) => undefined),
      failUnpricedAttempt: vi.fn(), taxRefused: vi.fn()
    };
    const maintenance = new BillingMaintenance({
      repository: {
        subscriptionEvents: async () => events,
        chargesForSubscription: async () => [{ kind: "RENEWAL", periodStart, attempt: 1 }]
      } as unknown as BillingRepository,
      jobs: {
        liveSubscriptionIds: vi.fn(async () => [events[0]!.subscriptionId]), lockOwner: vi.fn(), withSubscriptionLease,
        outboxJobExists: vi.fn()
      } as unknown as MaintenanceDeps["jobs"],
      entitlements: { append: vi.fn() },
      renewal: renewal as unknown as MaintenanceDeps["renewal"],
      policy: testBillingPolicy, publicAppUrl: "https://dezbatere.test", xmoneyEnvironment: "stage", audit: vi.fn(),
      clock: clock.read
    });

    expect(await maintenance.runOnce()).toMatchObject({ retried: 1, failed: 0 });
    expect(renewal.retryPrice).toHaveBeenCalledWith(expect.objectContaining({ status: "PAST_DUE" }), periodStart, 2, leaseTime);
    expect(renewal.createRetryCharge.mock.calls[0]![4]).toEqual(leaseTime);
    expect(renewal.submit).toHaveBeenCalledWith(charge, expect.objectContaining({ status: "PAST_DUE" }));
  });
});

describe("P2-I7 a rebill's outcome rows are dated when the call returned, so A2's waits start then", () => {
  function service(rebill: RenewalDeps["xmoney"]["rebill"], clock: ReturnType<typeof movingClock>) {
    const appended: ChargeEventInput[] = [];
    const enqueued: Array<{ kind: string; notBefore: Date }> = [];
    const client = {};
    const renewal = new RenewalService({
      repository: {
        withTransaction: async (use: (client: unknown) => Promise<unknown>) => use(client),
        appendChargeEvent: async (_client: unknown, event: ChargeEventInput) => { appended.push(event); return "INSERTED"; },
        enqueue: async (_client: unknown, job: { kind: string; notBefore: Date }) => { enqueued.push(job); }
      } as unknown as BillingRepository,
      jobs: {} as RenewalDeps["jobs"],
      entitlements: { append: vi.fn(), current: vi.fn() } as unknown as RenewalDeps["entitlements"],
      xmoney: { rebill, listTransactions: vi.fn() } as unknown as RenewalDeps["xmoney"],
      tax: { quote: vi.fn() } as unknown as RenewalDeps["tax"], settlement: {} as ChargeSettlement, policy: testBillingPolicy,
      plans: testBillingPlans, recordsKey: Buffer.alloc(32), publicAppUrl: "https://dezbatere.test", audit: vi.fn(),
      clock: clock.read, kick: () => undefined, xmoneyEnvironment: "stage"
    });
    return { renewal, appended, enqueued };
  }

  const { events, periodStart } = pastDueHistory();
  const state = foldSubscription(events);
  // A dunning retry (attempt 2): its outcome writes no RENEWAL_PENDING hold, so only the charge's rows are seen.
  const charge = { chargeId: "c-attempt-2", ownerRef: "o-timing", attempt: 2, periodStart, totalMicros: 24_200_000 } as ChargeRow;
  const callerNow = new Date(periodStart.getTime() + DAY + 2 * MINUTE);
  const answered = new Date(callerNow.getTime() + 7 * MINUTE);

  it.each([
    ["an answer lost on the way (SUBMIT_UNKNOWN)", new Error("socket hang up"), "SUBMIT_UNKNOWN", "REBILL_OUTCOME_UNKNOWN"],
    ["a call xMoney never processed (the not-sent REQUESTED)", new TypedDomainError("XMONEY_UNAVAILABLE", "x"), "REQUESTED", "REBILL_NOT_SENT"]
  ] as const)("stamps %s with the clock read after the call", async (_name, failure, kind, errorCode) => {
    const clock = movingClock(callerNow);
    const rebill = vi.fn(async () => { clock.advance(7 * MINUTE); throw failure; });
    const run = service(rebill as unknown as RenewalDeps["xmoney"]["rebill"], clock);
    await run.renewal.submit(charge, state);
    expect(run.appended).toHaveLength(1);
    expect(run.appended[0]).toMatchObject({ kind, errorCode, at: answered });
  });

  it("stamps SUBMITTED, and the check it queues, with the clock read after the call", async () => {
    const clock = movingClock(callerNow);
    const rebill = vi.fn(async () => { clock.advance(7 * MINUTE); return { transactionId: "t-retry" }; });
    const run = service(rebill as unknown as RenewalDeps["xmoney"]["rebill"], clock);
    await run.renewal.submit(charge, state);
    expect(run.appended).toEqual([expect.objectContaining({ kind: "SUBMITTED", providerPaymentId: "t-retry", at: answered })]);
    expect(run.enqueued).toEqual([expect.objectContaining({ kind: "VERIFY_PAYMENT", notBefore: answered })]);
  });
});
