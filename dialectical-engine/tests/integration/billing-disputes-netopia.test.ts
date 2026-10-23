import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription, type CardPayments, type PaymentReport, type PaymentState } from "@debateai/billing-core";
import { BillingJobQueries, BillingRepository, EntitlementRepository, migrate, type OutboxJob } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testBillingPolicy, testCountryPolicy } from "../support/billingFixtures.js";
import { recordingAudit, seedNetopiaSubscription, TEST_RECORDS_KEY } from "../support/billingSubscriptionFixtures.js";
import { recordDisputeOutcome } from "../../apps/api/src/billing/dispute-cli.js";
import { heldByChargeback, RefundDesk } from "../../apps/api/src/billing/refunds.js";
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
  return { check, audit, refunds };
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
const mails = async (template: string, chargeId: string) => (await database.pool.query(
  "SELECT 1 FROM billing.outbox WHERE kind = 'EMAIL' AND ref = $1", [`${template}:${chargeId}`]
)).rowCount;
const m10 = (chargeId: string) => mails("M10", chargeId);
const m10Ended = (chargeId: string) => mails("M10_ENDED", chargeId);
/** Every outbox row about the charge: the emails and the refund job (a repeated notification adds none). */
const outboxRows = async (chargeId: string) => (await database.pool.query(
  "SELECT 1 FROM billing.outbox WHERE ref LIKE $1 OR payload->>'param.reference' = $2", [`%${chargeId}%`, `charge ${chargeId}`]
)).rowCount;
const lostLines = (audit: ReturnType<typeof recordingAudit>) =>
  audit.events.filter((entry) => entry.event === "billing.chargeback.lost").map((entry) => entry.fields);
const LOST_HEAD = "the dispute on it is lost (status 10).";
const NO_COMMAND = "No command is needed.\nAsk your accountant whether a cancelling invoice (storno) is needed for this payment.";
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

  it("ends a live plan at status 10 by itself (the owner's decision of 24 October 2026): Free, one M10_ENDED, one O3, once", async () => {
    const seeded = await plan("lost");
    const statuses = new Statuses();
    const { check, audit } = handler(statuses);
    statuses.set(seeded.initialChargeId, seeded.providerPaymentId, "CHARGEBACK_LOST", seeded.totalMicros);
    expect(await check(seeded.initialChargeId)).toEqual({ kind: "DONE" });
    expect((await chargeKinds(seeded.initialChargeId)).filter((kind) => kind === "CHARGEBACK")).toHaveLength(1);
    // The same end as `pnpm billing:dispute --outcome lost`: SUSPENDED (with the Free entitlement), then ENDED(DISPUTE).
    expect((await subscriptionKinds(seeded.subscriptionId)).slice(-2)).toEqual(["SUSPENDED", "ENDED"]);
    const folded = foldSubscription(await repository.subscriptionEvents(seeded.subscriptionId));
    expect(folded).toMatchObject({ status: "ENDED", endedCause: "DISPUTE" });
    expect((await entitlements.current(seeded.ownerRef, new Date())).planId).toBe("FREE");
    expect(await m10Ended(seeded.initialChargeId)).toBe(1);
    expect(await m10(seeded.initialChargeId)).toBe(0);
    const ended = (await database.pool.query<{ payload: Record<string, string> }>(
      "SELECT payload FROM billing.outbox WHERE ref = $1", [`M10_ENDED:${seeded.initialChargeId}`]
    )).rows[0]!.payload;
    expect(ended).toMatchObject({ template: "M10_ENDED", "param.plan": "PLUS" });
    const alerts = await ownerAlerts(seeded.initialChargeId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ "param.reasonCode": "CHARGEBACK_LOST", "param.paymentAlert": "true" });
    expect(alerts[0]!["param.nextSteps"]).toContain(LOST_HEAD);
    expect(alerts[0]!["param.nextSteps"]).toContain("The site has ended the plan, the person is on Free, and the customer was"
      + " emailed that the plan has ended (M10_ENDED).");
    expect(alerts[0]!["param.nextSteps"]).toContain(NO_COMMAND);
    expect(alerts[0]!["param.nextSteps"]).not.toContain("billing:dispute");
    expect(lostLines(audit)).toEqual([{ chargeKind: "INITIAL", ended: true }]);
    expect(audit.events.filter((entry) => entry.event === "billing.payment.owner_review")).toEqual([]);

    // NETOPIA resends the same notification: nothing more is written or sent.
    const rows = await outboxRows(seeded.initialChargeId);
    const events = await subscriptionKinds(seeded.subscriptionId);
    expect(await check(seeded.initialChargeId)).toEqual({ kind: "DONE" });
    expect(await outboxRows(seeded.initialChargeId)).toBe(rows);
    expect(await subscriptionKinds(seeded.subscriptionId)).toEqual(events);
    expect(await m10Ended(seeded.initialChargeId)).toBe(1);
    expect(await ownerAlerts(seeded.initialChargeId)).toHaveLength(1);
    expect(lostLines(audit)).toEqual([{ chargeKind: "INITIAL", ended: true }, { chargeKind: "INITIAL", ended: false }]);
    // The owner's command after the automatic end: already settled, nothing changes.
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "lost" })).toBe("ALREADY_SETTLED");
    expect(await subscriptionKinds(seeded.subscriptionId)).toEqual(events);
  });

  it("ends a plan paused by status 9 when status 10 follows, and a won outcome recorded afterwards gives RESOLVED_AFTER_END", async () => {
    const seeded = await plan("opened-then-lost");
    const statuses = new Statuses();
    const { check } = handler(statuses);
    statuses.set(seeded.initialChargeId, seeded.providerPaymentId, "CHARGEBACK_OPENED", seeded.totalMicros);
    await check(seeded.initialChargeId);
    expect(await status(seeded.subscriptionId)).toBe("SUSPENDED");
    expect(await m10(seeded.initialChargeId)).toBe(1);
    statuses.set(seeded.initialChargeId, seeded.providerPaymentId, "CHARGEBACK_LOST", seeded.totalMicros);
    await check(seeded.initialChargeId);
    await check(seeded.initialChargeId);
    expect((await chargeKinds(seeded.initialChargeId)).filter((kind) => kind === "CHARGEBACK")).toHaveLength(1);
    expect((await subscriptionKinds(seeded.subscriptionId)).filter((kind) => kind === "SUSPENDED")).toHaveLength(1);
    expect(foldSubscription(await repository.subscriptionEvents(seeded.subscriptionId))).toMatchObject({
      status: "ENDED", endedCause: "DISPUTE"
    });
    expect((await entitlements.current(seeded.ownerRef, new Date())).planId).toBe("FREE");
    expect(await m10(seeded.initialChargeId)).toBe(1);
    expect(await m10Ended(seeded.initialChargeId)).toBe(1);
    expect(await ownerAlerts(seeded.initialChargeId)).toHaveLength(1);
    // NETOPIA's admin later shows the dispute won: the money is recorded, the ended plan is not resumed.
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("RESOLVED_AFTER_END");
    expect((await chargeKinds(seeded.initialChargeId)).filter((kind) => kind === "CHARGEBACK_RESOLVED")).toHaveLength(1);
    expect(await status(seeded.subscriptionId)).toBe("ENDED");
    expect((await entitlements.current(seeded.ownerRef, new Date())).planId).toBe("FREE");
  });

  it("closes a refund the lost dispute holds as --outcome lost does: held for good, named in the one O3", async () => {
    const seeded = await plan("lost-held-refund");
    const statuses = new Statuses();
    const { check, audit, refunds } = handler(statuses);
    await repository.withTransaction(async (client) => {
      await jobs.lockOwner(client, seeded.ownerRef);
      await refunds.request(client, {
        chargeId: seeded.initialChargeId, transactionId: seeded.providerPaymentId, amountMicros: 12_100_000, whole: false,
        ownerRef: seeded.ownerRef, reason: "WITHDRAWAL"
      }, new Date());
    });
    statuses.set(seeded.initialChargeId, seeded.providerPaymentId, "CHARGEBACK_LOST", seeded.totalMicros);
    await check(seeded.initialChargeId);
    await check(seeded.initialChargeId);
    expect(await status(seeded.subscriptionId)).toBe("ENDED");
    const charge = (await repository.charge(seeded.initialChargeId))!;
    expect(heldByChargeback(charge, seeded.providerPaymentId)).toBe(true);
    expect(charge.events.map((event) => event.kind)).not.toContain("REFUNDED");
    expect(charge.events.map((event) => event.kind)).not.toContain("CHARGEBACK_RESOLVED");
    // Never listed as due again: the reminder and `pnpm billing:refund-done` leave it out.
    expect((await repository.openOwnerRefunds("sandbox", ["WITHDRAWAL"])).filter((row) => row.chargeId === seeded.initialChargeId))
      .toEqual([]);
    await expect(refunds.planOwnerRefund(seeded.initialChargeId, 12_100_000)).rejects.toThrow("BILLING_REFUND_DONE_HELD_BY_CHARGEBACK");
    // One O3 for the owner: the lost dispute's, which says nothing is left to refund (no REFUND_HELD_BY_CHARGEBACK).
    const alerts = await ownerAlerts(seeded.initialChargeId);
    expect(alerts.map((alert) => alert["param.reasonCode"])).toEqual(["CHARGEBACK_LOST"]);
    expect(alerts[0]!["param.nextSteps"]).toContain("A refund of 12.10 USD (reason WITHDRAWAL) was held on this payment"
      + " because of the dispute. The bank has taken the money back, so nothing is left to refund: do not refund it in"
      + " NETOPIA's admin.");
    expect(audit.events.filter((entry) => entry.event === "billing.refund.held_by_chargeback")).toEqual([]);
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "lost" })).toBe("ALREADY_SETTLED");
    expect(heldByChargeback((await repository.charge(seeded.initialChargeId))!, seeded.providerPaymentId)).toBe(true);
  });

  it("only tells the owner of a status 10 on the payment of a plan already ended: no plan change, no customer email", async () => {
    const seeded = await plan("ended-then-lost");
    const statuses = new Statuses();
    const { check, audit } = handler(statuses);
    statuses.set(seeded.initialChargeId, seeded.providerPaymentId, "CHARGEBACK_OPENED", seeded.totalMicros);
    await check(seeded.initialChargeId);
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "lost" })).toBe("ENDED_DISPUTE");
    const events = await subscriptionKinds(seeded.subscriptionId);
    statuses.set(seeded.initialChargeId, seeded.providerPaymentId, "CHARGEBACK_LOST", seeded.totalMicros);
    expect(await check(seeded.initialChargeId)).toEqual({ kind: "DONE" });
    expect(await subscriptionKinds(seeded.subscriptionId)).toEqual(events);
    expect(await m10Ended(seeded.initialChargeId)).toBe(0);
    const alerts = await ownerAlerts(seeded.initialChargeId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ "param.reasonCode": "CHARGEBACK_LOST" });
    expect(alerts[0]!["param.nextSteps"]).toContain("No plan changed: the payment bought nothing, or its plan had already"
      + " ended, was not active, or its dispute was already recorded.");
    expect(alerts[0]!["param.nextSteps"]).toContain(NO_COMMAND);
    expect(lostLines(audit)).toEqual([{ chargeKind: "INITIAL", ended: false }]);
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

  it("never pauses or ends the live plan for a charge-back of a payment never seen paid, and tells the owner nothing changed", async () => {
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
    expect(alerts[0]).toMatchObject({ "param.reasonCode": "CHARGEBACK_LOST" });
    expect(alerts[0]!["param.nextSteps"]).toContain("No plan changed");
    expect(alerts[0]!["param.nextSteps"]).not.toContain("ended the plan");
    expect(alerts[0]!["param.nextSteps"]).not.toContain("(M10");
    expect(await m10Ended(upgrade)).toBe(0);
    expect(await recordDisputeOutcome(stores(), { chargeRef: upgrade, outcome: "lost" })).toBe("SECOND_PAYMENT");
    expect(await status(seeded.subscriptionId)).toBe("ACTIVE");
  });
});
