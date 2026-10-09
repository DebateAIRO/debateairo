import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription, type CardPayments, type PaymentReport, type PaymentState } from "@debateai/billing-core";
import { BillingJobQueries, BillingRepository, EntitlementRepository, migrate, type OutboxJob } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testBillingPolicy, testCountryPolicy } from "../support/billingFixtures.js";
import { recordingAudit, seedNetopiaSubscription, TEST_RECORDS_KEY } from "../support/billingSubscriptionFixtures.js";
import { recordDisputeOutcome } from "../../apps/api/src/billing/dispute-cli.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { chargeEvent, newChargeId } from "../../apps/api/src/billing/rows.js";
import { VerifyPaymentHandler } from "../../apps/api/src/billing/verify-payment.js";

let database: TestDatabase;
let repository: BillingRepository;
let jobs: BillingJobQueries;
let entitlements: EntitlementRepository;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  repository = new BillingRepository(database.pool);
  jobs = new BillingJobQueries(database.pool);
  entitlements = new EntitlementRepository(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const DAY = 86_400_000;
const STATUS: Partial<Record<PaymentState, string>> = { CHARGEBACK_OPENED: "9", CHARGEBACK_LOST: "10", CHARGEBACK_REPRESENTED: "16", PAID: "3" };

/** NETOPIA's status of each order, set by the test before each check. */
class Statuses implements Pick<CardPayments, "status"> {
  readonly now = new Map<string, PaymentReport>();
  async status(input: Readonly<{ orderId: string; providerPaymentId: string | null }>): Promise<PaymentReport | "NO_SUCH_ORDER"> {
    return this.now.get(input.orderId) ?? "NO_SUCH_ORDER";
  }
  set(orderId: string, providerPaymentId: string, state: PaymentState, amountMicros: number): void {
    this.now.set(orderId, Object.freeze({
      orderId, providerPaymentId, state, providerStatus: STATUS[state] ?? "0", amountMicros, currency: "USD", cardCountry: "DE",
      savedCard: null, declineCode: null, declineSide: null, bankDeclined: false, occurredAt: null, clientId: null
    }));
  }
}

function handler(statuses: Statuses) {
  const audit = recordingAudit();
  const refunds = new RefundDesk({
    repository, jobs, policy: testBillingPolicy, audit, clock: () => new Date(),
    netopia: { payments: statuses, paymentEnvironment: "sandbox", jobs }
  });
  const verify = new VerifyPaymentHandler({
    repository, jobs, refunds, entitlements, countryPolicy: testCountryPolicy, policy: testBillingPolicy,
    recordsKey: TEST_RECORDS_KEY, audit, netopia: { payments: statuses, paymentEnvironment: "sandbox", jobs }
  });
  const check = (chargeId: string) => verify.handle({
    jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: chargeId, payload: {}, attempts: 1, notBefore: new Date(),
    createdAt: new Date(), claimedBy: "n15", claimedAt: new Date()
  } as unknown as OutboxJob, new Date());
  return { check, audit };
}

const plan = (_label: string) => seedNetopiaSubscription(database.pool, {
  ownerRef: randomUUID() /* billing owner_ref is a uuid (0085) */, planId: "PLUS", activatedAt: new Date(Date.now() - 3 * DAY), taxCountry: "DE"
});
const chargeKinds = async (chargeId: string) => (await repository.charge(chargeId))!.events.map((event) => event.kind);
const subscriptionKinds = async (subscriptionId: string) => (await repository.subscriptionEvents(subscriptionId)).map((event) => event.kind);
const status = async (subscriptionId: string) => foldSubscription(await repository.subscriptionEvents(subscriptionId)).status;
const ownerAlerts = async (chargeId: string) => (await database.pool.query<{ payload: Record<string, string> }>(
  "SELECT payload FROM billing.outbox WHERE kind = 'EMAIL' AND payload->>'template' = 'O3' AND payload->>'param.reference' = $1",
  [`charge ${chargeId}`]
)).rows.map((row) => row.payload);
const m10 = async (chargeId: string) => (await database.pool.query("SELECT 1 FROM billing.outbox WHERE kind = 'EMAIL' AND ref = $1", [`M10:${chargeId}`])).rowCount;
const stores = () => Object.freeze({ billing: repository, jobs, entitlements, clock: () => new Date() });

describe("N15 charge-backs on NETOPIA's statuses (spec §2.13)", () => {
  it("pauses a live plan at status 9: CHARGEBACK, SUSPENDED, Free and M10, once", async () => {
    const seeded = await plan("opened");
    const statuses = new Statuses();
    const { check, audit } = handler(statuses);
    statuses.set(seeded.initialChargeId, seeded.providerPaymentId, "CHARGEBACK_OPENED", seeded.totalMicros);
    expect(await check(seeded.initialChargeId)).toEqual({ kind: "DONE" });
    expect(await check(seeded.initialChargeId)).toEqual({ kind: "DONE" });
    expect((await chargeKinds(seeded.initialChargeId)).filter((kind) => kind === "CHARGEBACK")).toHaveLength(1);
    expect(await status(seeded.subscriptionId)).toBe("SUSPENDED");
    expect((await entitlements.current(seeded.ownerRef, new Date())).planId).toBe("FREE");
    expect(await m10(seeded.initialChargeId)).toBe(1);
    expect(audit.events.filter((entry) => entry.event === "billing.chargeback")).toHaveLength(1);
    expect(audit.events.find((entry) => entry.event === "billing.chargeback")!.fields).toEqual({ chargeKind: "INITIAL" });
    const chargeback = (await repository.charge(seeded.initialChargeId))!.events.find((event) => event.kind === "CHARGEBACK")!;
    expect(chargeback).toMatchObject({ providerPaymentId: seeded.providerPaymentId, amountMicros: seeded.totalMicros, errorCode: null });
  });

  it("records a lost dispute (status 10) never seen opened as CHARGEBACK and SUSPENDED, and hands the end to the owner", async () => {
    const seeded = await plan("lost");
    const statuses = new Statuses();
    const { check } = handler(statuses);
    statuses.set(seeded.initialChargeId, seeded.providerPaymentId, "CHARGEBACK_LOST", seeded.totalMicros);
    await check(seeded.initialChargeId);
    await check(seeded.initialChargeId);
    expect((await chargeKinds(seeded.initialChargeId)).filter((kind) => kind === "CHARGEBACK")).toHaveLength(1);
    // Never ENDED by itself (N-8): the plan stays paused until the owner's command.
    expect(await status(seeded.subscriptionId)).toBe("SUSPENDED");
    const alerts = await ownerAlerts(seeded.initialChargeId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ "param.reasonCode": "OWNER_REVIEW", "param.paymentAlert": "true" });
    expect(alerts[0]!["param.nextSteps"]).toContain(`pnpm billing:dispute --charge ${seeded.initialChargeId} --outcome lost`);
    // F6a (ui-3): the M10 queued with the pause is named, since O3's intro leaves what the customer was told to the steps.
    expect(alerts[0]!["param.nextSteps"]).toContain("The paid features are paused. The customer was emailed that the plan is paused (M10).");
    expect(await m10(seeded.initialChargeId)).toBe(1);
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "lost" })).toBe("ENDED_DISPUTE");
    expect(await status(seeded.subscriptionId)).toBe("ENDED");
  });

  it("records a representment (status 16) never seen opened: CHARGEBACK and SUSPENDED first, then CHARGEBACK_REPRESENTED", async () => {
    const seeded = await plan("represented");
    const statuses = new Statuses();
    const { check } = handler(statuses);
    statuses.set(seeded.initialChargeId, seeded.providerPaymentId, "CHARGEBACK_REPRESENTED", seeded.totalMicros);
    await check(seeded.initialChargeId);
    await check(seeded.initialChargeId);
    const kinds = await chargeKinds(seeded.initialChargeId);
    expect(kinds.filter((kind) => kind === "CHARGEBACK")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "CHARGEBACK_REPRESENTED")).toHaveLength(1);
    expect(kinds.indexOf("CHARGEBACK")).toBeLessThan(kinds.indexOf("CHARGEBACK_REPRESENTED"));
    expect(await status(seeded.subscriptionId)).toBe("SUSPENDED");
    expect(await ownerAlerts(seeded.initialChargeId)).toHaveLength(0);
  });

  it("adds the representment to an opened dispute without a second suspension, and a won dispute resumes the plan", async () => {
    const seeded = await plan("opened-then-represented");
    const statuses = new Statuses();
    const { check } = handler(statuses);
    statuses.set(seeded.initialChargeId, seeded.providerPaymentId, "CHARGEBACK_OPENED", seeded.totalMicros);
    await check(seeded.initialChargeId);
    statuses.set(seeded.initialChargeId, seeded.providerPaymentId, "CHARGEBACK_REPRESENTED", seeded.totalMicros);
    await check(seeded.initialChargeId);
    expect((await subscriptionKinds(seeded.subscriptionId)).filter((kind) => kind === "SUSPENDED")).toHaveLength(1);
    expect((await chargeKinds(seeded.initialChargeId)).filter((kind) => kind === "CHARGEBACK_REPRESENTED")).toHaveLength(1);
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("RESUMED");
    expect(await status(seeded.subscriptionId)).toBe("ACTIVE");
    // NETOPIA's later PAID read of the same payment changes nothing.
    statuses.set(seeded.initialChargeId, seeded.providerPaymentId, "PAID", seeded.totalMicros);
    expect(await check(seeded.initialChargeId)).toEqual({ kind: "DONE" });
    expect(await status(seeded.subscriptionId)).toBe("ACTIVE");
  });

  it("never pauses the live plan for a charge-back of a payment that bought nothing, and the command reads it so", async () => {
    const seeded = await plan("bought-nothing");
    const second = newChargeId();
    const paymentId = `ntp-second-${second.slice(0, 8)}`;
    await repository.withTransaction(async (client) => {
      const first = (await repository.charge(seeded.initialChargeId, client))!;
      await repository.insertCharge(client, {
        chargeId: second, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: "INITIAL", attempt: 2,
        periodStart: first.periodStart, periodEnd: first.periodEnd, quoteId: first.quoteId, netMicros: first.netMicros,
        taxMicros: first.taxMicros, totalMicros: first.totalMicros, currency: "USD", createdAt: new Date(),
        paymentProvider: "netopia", paymentEnvironment: "sandbox"
      });
      for (const [kind, errorCode] of [["REQUESTED", null], ["SUCCEEDED", null], ["REFUND_REQUESTED", "SUBSCRIPTION_ENDED"]] as const) {
        await repository.appendChargeEvent(client, chargeEvent(second, kind, new Date(), {
          providerPaymentId: kind === "REQUESTED" ? null : paymentId, amountMicros: first.totalMicros, errorCode
        }));
      }
    });
    const statuses = new Statuses();
    const { check, audit } = handler(statuses);
    statuses.set(second, paymentId, "CHARGEBACK_OPENED", seeded.totalMicros);
    await check(second);
    const chargeback = (await repository.charge(second))!.events.find((event) => event.kind === "CHARGEBACK")!;
    expect(chargeback.errorCode).toBe("DUPLICATE_PAYMENT");
    expect(audit.events.filter((entry) => entry.event === "billing.chargeback").map((entry) => entry.fields))
      .toEqual([{ chargeKind: "INITIAL", code: "DUPLICATE_PAYMENT" }]);
    expect(await status(seeded.subscriptionId)).toBe("ACTIVE");
    expect(await m10(second)).toBe(0);
    expect(await recordDisputeOutcome(stores(), { chargeRef: second, outcome: "won" })).toBe("SECOND_PAYMENT");
    expect(await recordDisputeOutcome(stores(), { chargeRef: second, outcome: "lost" })).toBe("ALREADY_SETTLED");
    expect(await status(seeded.subscriptionId)).toBe("ACTIVE");
  });

  it("never pauses the live plan for a charge-back of a payment never seen paid, and tells the owner nothing was paused", async () => {
    const seeded = await plan("never-paid");
    const upgrade = newChargeId();
    const paymentId = `ntp-upgrade-${upgrade.slice(0, 8)}`;
    await repository.withTransaction(async (client) => {
      const first = (await repository.charge(seeded.initialChargeId, client))!;
      await repository.insertCharge(client, {
        chargeId: upgrade, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: "UPGRADE", attempt: 1,
        periodStart: new Date(), periodEnd: seeded.periodEnd, quoteId: first.quoteId, netMicros: first.netMicros,
        taxMicros: first.taxMicros, totalMicros: first.totalMicros, currency: "USD", createdAt: new Date(),
        paymentProvider: "netopia", paymentEnvironment: "sandbox"
      });
      for (const kind of ["REQUESTED", "SUBMITTED"] as const) {
        await repository.appendChargeEvent(client, chargeEvent(upgrade, kind, new Date(), {
          providerPaymentId: kind === "REQUESTED" ? null : paymentId, amountMicros: first.totalMicros, errorCode: null
        }));
      }
    });
    const statuses = new Statuses();
    const { check, audit } = handler(statuses);
    statuses.set(upgrade, paymentId, "CHARGEBACK_OPENED", seeded.totalMicros);
    expect(await check(upgrade)).toEqual({ kind: "DONE" });
    expect(await check(upgrade)).toEqual({ kind: "DONE" });
    statuses.set(upgrade, paymentId, "CHARGEBACK_LOST", seeded.totalMicros);
    expect(await check(upgrade)).toEqual({ kind: "DONE" });
    expect(await check(upgrade)).toEqual({ kind: "DONE" });
    const chargebacks = (await repository.charge(upgrade))!.events.filter((event) => event.kind === "CHARGEBACK");
    expect(chargebacks).toHaveLength(1);
    expect(chargebacks[0]!.errorCode).toBe("DUPLICATE_PAYMENT");
    expect(await chargeKinds(upgrade)).not.toContain("SUCCEEDED");
    expect(await subscriptionKinds(seeded.subscriptionId)).not.toContain("SUSPENDED");
    expect(await status(seeded.subscriptionId)).toBe("ACTIVE");
    expect((await entitlements.current(seeded.ownerRef, new Date())).planId).toBe("PLUS");
    expect(await m10(upgrade)).toBe(0);
    expect(audit.events.filter((entry) => entry.event === "billing.chargeback").map((entry) => entry.fields))
      .toEqual([{ chargeKind: "UPGRADE", code: "DUPLICATE_PAYMENT" }]);
    const alerts = await ownerAlerts(upgrade);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!["param.nextSteps"]).toContain("No plan was paused");
    expect(alerts[0]!["param.nextSteps"]).not.toContain("The paid features are paused");
    expect(alerts[0]!["param.nextSteps"]).not.toContain("(M10)");
    expect(await recordDisputeOutcome(stores(), { chargeRef: upgrade, outcome: "lost" })).toBe("SECOND_PAYMENT");
    expect(await status(seeded.subscriptionId)).toBe("ACTIVE");
  });
});
