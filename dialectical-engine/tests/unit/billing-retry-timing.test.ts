import { describe, expect, it, vi } from "vitest";
import { foldSubscription, type PaymentReport, type SubscriptionEvent } from "@debateai/billing-core";
import type { BillingRepository, ChargeEventInput, ChargeRow } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { BillingMaintenance, type MaintenanceDeps } from "../../apps/api/src/billing/maintenance.js";
import { englishOrderText } from "../../apps/api/src/billing/order-text.js";
import { sealBillingProfile, sealCardToken, sealQuoteLocation } from "../../apps/api/src/billing/records.js";
import { RenewalService, type NetopiaRenewalDeps, type RenewalDeps } from "../../apps/api/src/billing/renewal.js";
import { subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import type { ChargeSettlement } from "../../apps/api/src/billing/settlement.js";
import { activeSubscriptionEvents, testBillingPlans, testBillingPolicy } from "../support/billingFixtures.js";
import { testCardToken } from "../support/billingSubscriptionFixtures.js";

const MINUTE = 60_000;
const DAY = 86_400_000;
const ACTIVATED = new Date("2026-10-01T10:00:00.000Z");

/** A clock that moves only when a test moves it, so a call that "takes time" can be modelled exactly. */
function movingClock(start: Date) {
  let at = start;
  return { read: () => at, advance: (ms: number) => { at = new Date(at.getTime() + ms); } };
}

/**
 * A NETOPIA sandbox plan (the API below serves the sandbox) whose renewal (attempt 1) failed a minute after its period
 * end: PAST_DUE, first retry due a day later. Its ACTIVATED adopted the saved card `CARD_TOKEN_ID`.
 */
function pastDueHistory(): { events: SubscriptionEvent[]; periodStart: Date; failedAt: Date } {
  const active = activeSubscriptionEvents("o-timing", ACTIVATED, "PLUS", { provider: "netopia", environment: "sandbox" });
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
      // Spec §2.9.3 step 5 (N11): a NETOPIA retry first asks whether an earlier attempt of the period holds a payment.
      earlierAttemptPaid: vi.fn(async () => "NONE" as const),
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
      policy: testBillingPolicy, publicAppUrl: "https://dezbatere.test", paymentEnvironment: "sandbox",
      audit: vi.fn(), clock: clock.read
    });

    expect(await maintenance.runOnce()).toMatchObject({ retried: 1, failed: 0 });
    expect(renewal.retryPrice).toHaveBeenCalledWith(expect.objectContaining({ status: "PAST_DUE" }), periodStart, 2, leaseTime);
    expect(renewal.earlierAttemptPaid).toHaveBeenCalledWith(expect.objectContaining({ status: "PAST_DUE" }), periodStart, 2, leaseTime);
    expect(renewal.createRetryCharge.mock.calls[0]![4]).toEqual(leaseTime);
    expect(renewal.submit).toHaveBeenCalledWith(charge, expect.objectContaining({ status: "PAST_DUE" }));
  });
});

describe("P2-I7 a saved-card charge's outcome rows are dated when the call returned, so A2's waits start then", () => {
  const RECORDS_KEY = Buffer.alloc(32, 9);
  // activeSubscriptionEvents' ACTIVATED adopts this card (a fixed uuid), and the charge's INITIAL quote and customer.
  const CARD_TOKEN_ID = ["5b7e1c2a", "4d3f", "4a6b", "9c8d", "0e1f2a3b4c5d"].join("-");
  const QUOTE_ID = "6c8f2d3b-5e4a-4b7c-8d9e-1f2a3b4c5d6e";
  const CUSTOMER_ID = "7d9a3e4c-6f5b-4c8d-9e0f-2a3b4c5d6e7f";

  /** The sealed records `preparedCharge` opens: the saved card, the checkout's location and the payer's profile. */
  function storedRecords() {
    const card = sealCardToken(RECORDS_KEY, CARD_TOKEN_ID, testCardToken(["timing", "card", "token"].join("-")));
    const payer = { firstName: "Test", lastName: "Subscriber", phone: "+40712345678" } as const;
    const location = sealQuoteLocation(RECORDS_KEY, QUOTE_ID, {
      name: "Test Subscriber", ...payer, country: "RO", region: null, postalCode: "010101", city: "Bucuresti",
      street: "Strada Exemplu 1", ip: "192.0.2.10", ipCountry: "RO", company: null
    });
    const profile = sealBillingProfile(RECORDS_KEY, CUSTOMER_ID, {
      email: "timing@example.test", locale: "en", name: "Test Subscriber", ...payer, paymentIp: "192.0.2.10", country: "RO",
      region: null, postalCode: "010101", city: "Bucuresti", street: "Strada Exemplu 1", company: null
    });
    return { card, location, profile };
  }

  function service(chargeSavedCard: NetopiaRenewalDeps["payments"]["chargeSavedCard"], clock: ReturnType<typeof movingClock>) {
    const appended: ChargeEventInput[] = [];
    const enqueued: Array<{ kind: string; notBefore: Date }> = [];
    const client = {};
    const { card, location, profile } = storedRecords();
    const unused = async (): Promise<never> => { throw new Error("not read by a first send"); };
    const renewal = new RenewalService({
      repository: {
        withTransaction: async (use: (client: unknown) => Promise<unknown>) => use(client),
        appendChargeEvent: async (_client: unknown, event: ChargeEventInput) => { appended.push(event); return "INSERTED"; },
        enqueue: async (_client: unknown, job: { kind: string; notBefore: Date }) => { enqueued.push(job); },
        cardTokenById: async () => ({
          tokenId: CARD_TOKEN_ID, paymentProvider: "netopia", paymentEnvironment: "sandbox", revokedAt: null, expMonth: 12,
          expYear: 2029, tokenCiphertext: card.ciphertext, keyId: card.keyId
        }),
        chargesForSubscription: async () => [{ kind: "INITIAL", quoteId: QUOTE_ID }],
        quote: async () => ({ quoteId: QUOTE_ID, planId: "PLUS", locationCiphertext: location.ciphertext, keyId: location.keyId }),
        customerByOwner: async () => ({ customerId: CUSTOMER_ID }),
        latestProfile: async () => ({ profileCiphertext: profile.ciphertext, keyId: profile.keyId })
      } as unknown as BillingRepository,
      jobs: { bringForward: vi.fn() } as unknown as RenewalDeps["jobs"],
      entitlements: { append: vi.fn(), current: vi.fn() } as unknown as RenewalDeps["entitlements"],
      tax: { quote: vi.fn() } as unknown as RenewalDeps["tax"], settlement: {} as ChargeSettlement, policy: testBillingPolicy,
      plans: testBillingPlans, recordsKey: RECORDS_KEY, publicAppUrl: "https://dezbatere.test", audit: vi.fn(),
      clock: clock.read, kick: () => undefined,
      netopia: {
        payments: { chargeSavedCard, status: unused }, paymentEnvironment: "sandbox",
        recipients: { currentAddress: async () => "timing@example.test" }, orderText: englishOrderText
      }
    });
    return { renewal, appended, enqueued };
  }

  const { events, periodStart } = pastDueHistory();
  const state = foldSubscription(events);
  // A dunning retry (attempt 2) of the NETOPIA sandbox: its outcome writes no RENEWAL_PENDING hold, so only the
  // charge's rows are seen.
  const charge = {
    chargeId: "c".repeat(32), ownerRef: "o-timing", subscriptionId: state.subscriptionId, kind: "RENEWAL", attempt: 2,
    periodStart, quoteId: null, totalMicros: 24_200_000, paymentProvider: "netopia", paymentEnvironment: "sandbox"
  } as unknown as ChargeRow;
  const callerNow = new Date(periodStart.getTime() + DAY + 2 * MINUTE);
  const answered = new Date(callerNow.getTime() + 7 * MINUTE);

  it.each([
    ["an answer lost on the way (SUBMIT_UNKNOWN)", new Error("socket hang up"), "SUBMIT_UNKNOWN", "CHARGE_OUTCOME_UNKNOWN"],
    ["a call NETOPIA never processed (the not-sent REQUESTED)", new TypedDomainError("PAYMENT_PROVIDER_UNAVAILABLE", "x"), "REQUESTED", "CHARGE_NOT_SENT"]
  ] as const)("stamps %s with the clock read after the call", async (_name, failure, kind, errorCode) => {
    const clock = movingClock(callerNow);
    const chargeSavedCard = vi.fn(async () => { clock.advance(7 * MINUTE); throw failure; });
    const run = service(chargeSavedCard as unknown as NetopiaRenewalDeps["payments"]["chargeSavedCard"], clock);
    await run.renewal.submit(charge, state);
    expect(chargeSavedCard).toHaveBeenCalledTimes(1);
    expect(run.appended).toHaveLength(1);
    expect(run.appended[0]).toMatchObject({ kind, errorCode, at: answered });
  });

  it("stamps SUBMITTED, and the check it queues, with the clock read after the call", async () => {
    const clock = movingClock(callerNow);
    const report: PaymentReport = Object.freeze({
      orderId: charge.chargeId, providerPaymentId: "t-retry", state: "PAID", providerStatus: "3", amountMicros: 24_200_000,
      currency: "USD", cardCountry: "RO", savedCard: null, declineCode: null, declineSide: null, bankDeclined: false,
      occurredAt: null, clientId: null
    });
    const chargeSavedCard = vi.fn(async () => { clock.advance(7 * MINUTE); return report; });
    const run = service(chargeSavedCard as unknown as NetopiaRenewalDeps["payments"]["chargeSavedCard"], clock);
    await run.renewal.submit(charge, state);
    expect(chargeSavedCard).toHaveBeenCalledWith(expect.objectContaining({ orderId: charge.chargeId, amountMicros: 24_200_000 }));
    expect(run.appended).toEqual([expect.objectContaining({ kind: "SUBMITTED", providerPaymentId: "t-retry", at: answered })]);
    expect(run.enqueued).toEqual([expect.objectContaining({ kind: "VERIFY_PAYMENT", notBefore: answered })]);
  });
});
