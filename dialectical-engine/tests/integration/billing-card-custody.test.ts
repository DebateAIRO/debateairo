import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription } from "@debateai/billing-core";
import { BillingJobQueries, BillingRepository, EntitlementRepository, migrate } from "@debateai/db";
import { createSecretToken } from "@debateai/payments-netopia";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testBillingPolicy } from "../support/billingFixtures.js";
import {
  recordingAudit, seedNetopiaSubscription, TEST_PUBLIC_APP_URL, TEST_RECORDS_KEY
} from "../support/billingSubscriptionFixtures.js";
import { writeCardSaved } from "../../apps/api/src/billing/card-adoption.js";
import { CardCustody } from "../../apps/api/src/billing/card-custody.js";
import { BillingErasureHook } from "../../apps/api/src/billing/erasure-hook.js";
import { BillingMaintenance } from "../../apps/api/src/billing/maintenance.js";
import { OwnerJobs } from "../../apps/api/src/billing/owner-jobs.js";
import { sealCardToken } from "../../apps/api/src/billing/records.js";
import { chargeEvent, newChargeId, subscriptionEvent } from "../../apps/api/src/billing/rows.js";

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
const custodyOf = (audit = recordingAudit()) => new CardCustody({
  repository, jobs, paymentEnvironment: "sandbox", publicAppUrl: TEST_PUBLIC_APP_URL, audit
});
const plan = (activatedAt: Date) => seedNetopiaSubscription(database.pool, {
  ownerRef: randomUUID(), planId: "PLUS", activatedAt, taxCountry: "DE"
});

/** A saved card as N9's intake stores it, `age` days old, from `chargeId` (null: a tool order's). */
async function storeToken(input: Readonly<{
  customerId: string | null; chargeId: string | null; ageDays: number; environment?: "sandbox" | "live"; exp?: [number, number];
}>): Promise<string> {
  const tokenId = randomUUID();
  const at = new Date(Date.now() - input.ageDays * DAY);
  const sealed = sealCardToken(TEST_RECORDS_KEY, tokenId, createSecretToken(["tok", "n17", randomUUID().slice(0, 8)].join("-")));
  await repository.withTransaction((client) => repository.insertCardToken(client, {
    tokenId, customerId: input.customerId, paymentProvider: "netopia", paymentEnvironment: input.environment ?? "sandbox",
    sourceChargeId: input.chargeId, sourceToolOrder: input.chargeId === null ? `t-${randomUUID().replaceAll("-", "").slice(0, 30)}` : null,
    sourceNoticeId: null, sourcePaidAt: at, tokenCiphertext: sealed.ciphertext, keyId: sealed.keyId,
    expMonth: input.exp?.[0] ?? 12, expYear: input.exp?.[1] ?? 2031, last4: "4242", cardCountry: "DE", createdAt: at
  }));
  return tokenId;
}
const revocation = async (tokenId: string) => (await database.pool.query<{ reason: string }>(
  "SELECT reason FROM billing.card_token_revocation WHERE token_id = $1", [tokenId]
)).rows[0]?.reason ?? null;
const state = async (subscriptionId: string) => foldSubscription(await repository.subscriptionEvents(subscriptionId));
async function adopt(subscriptionId: string, ownerRef: string, tokenId: string): Promise<void> {
  const token = (await repository.withTransaction((client) => repository.cardTokenById(client, tokenId)))!;
  await repository.withTransaction(async (client) => {
    await jobs.lockOwner(client, ownerRef);
    await writeCardSaved({ repository }, client, { state: await state(subscriptionId), token, at: new Date() });
  });
}

describe("N17 the daily sweep (spec §2.15.4)", () => {
  it("keeps the live plan's card and revokes each other token with its reason", async () => {
    const seeded = await plan(new Date(Date.now() - 3 * DAY));
    const replacedId = seeded.cardTokenId;
    const newer = await storeToken({ customerId: seeded.customerId, chargeId: seeded.initialChargeId, ageDays: 2 });
    await adopt(seeded.subscriptionId, seeded.ownerRef, newer);
    const neverAdopted = await storeToken({ customerId: seeded.customerId, chargeId: seeded.initialChargeId, ageDays: 2 });
    const otherSystem = await storeToken({ customerId: seeded.customerId, chargeId: seeded.initialChargeId, ageDays: 2, environment: "live" });
    const toolOrder = await storeToken({ customerId: null, chargeId: null, ageDays: 2 });
    const fresh = await storeToken({ customerId: seeded.customerId, chargeId: seeded.initialChargeId, ageDays: 0 });
    const audit = recordingAudit();
    const report = await custodyOf(audit).sweep(new Date());
    expect(await revocation(newer)).toBeNull();
    expect(await revocation(replacedId)).toBe("REPLACED");
    expect(await revocation(neverAdopted)).toBe("NOT_ADOPTED");
    expect(await revocation(otherSystem)).toBe("OTHER_SYSTEM");
    expect(await revocation(toolOrder)).toBe("TOOL_ORDER");
    // A token younger than a day is not swept yet (its adoption may still be under way).
    expect(await revocation(fresh)).toBeNull();
    expect(report.byReason).toMatchObject({ REPLACED: 1, NOT_ADOPTED: 1, OTHER_SYSTEM: 1, TOOL_ORDER: 1 });
    expect(audit.events).toContainEqual({ event: "billing.card.revoked", fields: { reason: "REPLACED", count: 1 } });
    // Sweeping again revokes nothing twice.
    expect((await custodyOf().sweep(new Date())).revoked).toBe(0);
  });

  it("keeps an undecided checkout's token for 30 days, then revokes it NOT_ADOPTED", async () => {
    const seeded = await plan(new Date(Date.now() - 40 * DAY));
    const pending = newChargeId();
    await repository.withTransaction(async (client) => {
      await repository.insertCharge(client, {
        chargeId: pending, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: "INITIAL", attempt: 3,
        periodStart: seeded.periodStart, periodEnd: seeded.periodEnd, quoteId: seeded.initialQuoteId, netMicros: 20_000_000,
        taxMicros: seeded.totalMicros - 20_000_000, totalMicros: seeded.totalMicros, currency: "USD", createdAt: new Date(),
        paymentProvider: "netopia", paymentEnvironment: "sandbox"
      });
      await repository.appendChargeEvent(client, chargeEvent(pending, "REQUESTED", new Date(), { providerPaymentId: null, amountMicros: seeded.totalMicros, errorCode: null }));
    });
    const young = await storeToken({ customerId: seeded.customerId, chargeId: pending, ageDays: 29 });
    const old = await storeToken({ customerId: seeded.customerId, chargeId: pending, ageDays: 31 });
    await custodyOf().sweep(new Date());
    expect(await revocation(young)).toBeNull();
    expect(await revocation(old)).toBe("NOT_ADOPTED");
  });

  it("revokes a withdrawn plan's card PLAN_ENDED, and both purges then delete what is due", async () => {
    const seeded = await plan(new Date(Date.now() - 5 * DAY));
    const withdrewAt = new Date();
    await repository.withTransaction(async (client) => {
      await jobs.lockOwner(client, seeded.ownerRef);
      await repository.appendSubscriptionEvent(client, subscriptionEvent(await state(seeded.subscriptionId), "WITHDRAWN", withdrewAt, {
        withdrew_at: withdrewAt.toISOString()
      }));
    });
    // 0096's purge deletes a token one day after its revocation by the database's own clock (it never trusts a later
    // `now`: LEAST(p_now, clock_timestamp())), so this sweep runs as of two days ago and the purge runs now.
    await custodyOf().sweep(new Date(Date.now() - 2 * DAY));
    expect(await revocation(seeded.cardTokenId)).toBe("PLAN_ENDED");
    const audit = recordingAudit();
    expect(await custodyOf(audit).purge(new Date())).toBeGreaterThanOrEqual(1);
    expect(await repository.withTransaction((client) => repository.cardTokenById(client, seeded.cardTokenId))).toBeNull();
    expect(audit.events.find((entry) => entry.event === "billing.card.purged")?.fields.tokens).toBeGreaterThanOrEqual(1);
  });
});

describe("N17 the erasure commit (spec §2.15.4)", () => {
  it("revokes every token of the owner at once when the erasure hook ends the plan at the commit", async () => {
    const seeded = await plan(new Date(Date.now() - 3 * DAY));
    const second = await storeToken({ customerId: seeded.customerId, chargeId: seeded.initialChargeId, ageDays: 0 });
    await database.pool.query("INSERT INTO legal.account_closure (owner_ref, closed_at) VALUES ($1, clock_timestamp())", [seeded.ownerRef]);
    const hook = new BillingErasureHook({
      billing: repository, jobs, entitlements, audit: recordingAudit(), clock: () => new Date(), custody: custodyOf()
    });
    expect(await hook.stop(seeded.ownerRef)).toBe("STOPPED");
    expect(await revocation(seeded.cardTokenId)).toBe("ERASURE");
    expect(await revocation(second)).toBe("ERASURE");
    // An erased owner's token the hook never reached is caught by the daily sweep with the same reason.
    const late = await storeToken({ customerId: seeded.customerId, chargeId: seeded.initialChargeId, ageDays: 2 });
    await custodyOf().sweep(new Date());
    expect(await revocation(late)).toBe("ERASURE");
  });
});

describe("N17 asking for a card before it is needed (spec §2.15.3, M12)", () => {
  /** A plan renewing in about four days: its month started 26 or 27 days ago. */
  const renewingSoon = () => plan(new Date(Date.now() - 26 * DAY));
  const m12 = async (customerId: string) => (await database.pool.query<{ payload: Record<string, string> }>(
    "SELECT payload FROM billing.outbox WHERE kind = 'EMAIL' AND payload->>'template' = 'M12' AND payload->>'customer_id' = $1", [customerId]
  )).rows.map((row) => row.payload);

  it("says nothing while the card will still be good at the renewal", async () => {
    const seeded = await renewingSoon();
    expect(await custodyOf().askForCard(await state(seeded.subscriptionId), new Date())).toBe(false);
    expect(await m12(seeded.customerId)).toHaveLength(0);
  });

  it("says the card expires before then, once per period", async () => {
    const seeded = await renewingSoon();
    const renewAt = (await state(seeded.subscriptionId)).currentPeriodEnd!;
    // A card whose expiry month ends before the renewal (the month before the renewal's month).
    const before = new Date(Date.UTC(renewAt.getUTCFullYear(), renewAt.getUTCMonth() - 1, 1));
    const expiring = await storeToken({
      customerId: seeded.customerId, chargeId: seeded.initialChargeId, ageDays: 0, exp: [before.getUTCMonth() + 1, before.getUTCFullYear()]
    });
    await adopt(seeded.subscriptionId, seeded.ownerRef, expiring);
    const custody = custodyOf();
    expect(await custody.askForCard(await state(seeded.subscriptionId), new Date())).toBe(true);
    expect(await custody.askForCard(await state(seeded.subscriptionId), new Date())).toBe(false);
    const [mail] = await m12(seeded.customerId);
    expect(mail).toMatchObject({
      "param.cardExpiring": "true", "param.plan": "PLUS", "param.renewDate": renewAt.toISOString(),
      "param.cardPageUrl": `${TEST_PUBLIC_APP_URL}/settings/card`
    });
  });

  it("says the card could not be kept when the plan holds none, and the look-ahead sends it", async () => {
    const seeded = await renewingSoon();
    await repository.withTransaction((client) => repository.revokeCardToken(client, { tokenId: seeded.cardTokenId, at: new Date(), reason: "OWNER" }));
    const unused = async (): Promise<never> => { throw new Error("NOT_USED_BY_THE_LOOK_AHEAD"); };
    const maintenance = new BillingMaintenance({
      repository, jobs, entitlements,
      renewal: { submit: unused, createRetryCharge: unused, retryPrice: unused, failUnpricedAttempt: unused, taxRefused: unused, erasureBlocks: unused } as never,
      policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL, paymentEnvironment: "sandbox",
      audit: recordingAudit(), clock: () => new Date(), custody: custodyOf()
    });
    await maintenance.runOnce();
    const [mail] = await m12(seeded.customerId);
    expect(mail).toMatchObject({ "param.cardExpiring": "false" });
  });

  it("names the plan the renewal charges: a scheduled downgrade's plan, never the current one (spec §2.15.3, P2-M14)", async () => {
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PRO", activatedAt: new Date(Date.now() - 26 * DAY), taxCountry: "DE"
    });
    // DOWNGRADE_SCHEDULED (P12b): the plan renews at the lower plan from the next period, so that is what M12 is about.
    await repository.withTransaction(async (client) => {
      await jobs.lockOwner(client, seeded.ownerRef);
      await repository.appendSubscriptionEvent(client, subscriptionEvent(await state(seeded.subscriptionId), "DOWNGRADE_SCHEDULED", new Date(), {
        announced_total_micros: 24_200_000, recurring_net_micros: 20_000_000
      }, { planId: "PLUS" }));
    });
    await repository.withTransaction((client) => repository.revokeCardToken(client, { tokenId: seeded.cardTokenId, at: new Date(), reason: "OWNER" }));
    expect(await custodyOf().askForCard(await state(seeded.subscriptionId), new Date())).toBe(true);
    const [mail] = await m12(seeded.customerId);
    expect(mail).toMatchObject({ "param.plan": "PLUS", "param.cardExpiring": "false" });
  });

  it("runs the sweep and both purges in the daily owner job, after the tax summary", async () => {
    const steps: string[] = [];
    const owner = new OwnerJobs({
      billing: repository, jobs, taxAuthorities: [] as never, audit: recordingAudit(), clock: () => new Date(),
      custody: {
        sweep: async () => { steps.push("sweep"); return { revoked: 0, kept: 0, byReason: {} }; },
        purge: async () => { steps.push("purge"); return 0; }
      }
    });
    await owner.schedule();
    expect(steps).toEqual(["sweep", "purge"]);
  });
});
