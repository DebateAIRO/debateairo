import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BillingRepository, createPool, EntitlementRepository, migrate } from "@debateai/db";
import { foldSubscription, withdrawalDeadline, type TaxEngine } from "@debateai/billing-core";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { AdjustableTaxEngine, testBillingPolicy } from "../support/billingFixtures.js";
import {
  holdOwnerLock,
  mountSubscriptionRoutes,
  recordingAudit,
  seedNetopiaSubscription,
  subscriptionDeps,
  suspendForChargeback,
  TEST_PUBLIC_APP_URL
} from "../support/billingSubscriptionFixtures.js";
import { recurringNetOf } from "../../apps/api/src/billing/renewal-rules.js";
import { cancelForOwner } from "../../apps/api/src/billing/subscription-actions.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const DAY = 86_400_000;
const events = (subscriptionId: string) => new BillingRepository(database.pool).subscriptionEvents(subscriptionId);

async function outbox(kind: string, refPrefix: string) {
  return (await database.pool.query<{ ref: string; payload: Record<string, unknown> }>(
    "SELECT ref,payload FROM billing.outbox WHERE kind=$1 AND ref LIKE $2 ORDER BY ref", [kind, `${refPrefix}%`]
  )).rows;
}

describe("P12b subscription reads and plain actions on real PostgreSQL", () => {
  it("answers the closed 404 on every route while billing is off or local", async () => {
    const identity = testHttpIdentity("p12b-off");
    const api = await mountSubscriptionRoutes(undefined, identity);
    const headers = { "x-test-session": identity.rawSessionToken };
    for (const [method, url] of [
      ["GET", "/v1/billing/subscription"], ["GET", "/v1/billing/invoices"],
      ["POST", "/v1/billing/subscription/cancel"], ["POST", "/v1/billing/subscription/cancel-revoke"],
      ["POST", "/v1/billing/subscription/downgrade"]
    ] as const) {
      const response = await api.inject({ method, url, headers, ...(method === "POST" ? { payload: {} } : {}) });
      expect(response.statusCode, url).toBe(404);
      expect(response.json(), url).toEqual({ error: "NOT_FOUND", message: "NOT_FOUND" });
    }
    await api.close();
  });

  it("reads null without a subscription, then the plan with its renewal and withdrawal window", async () => {
    const identity = testHttpIdentity("p12b-read");
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool), identity);
    const headers = { "x-test-session": identity.rawSessionToken };
    expect((await api.inject({ method: "GET", url: "/v1/billing/subscription", headers })).json())
      .toEqual({ subscription: null });
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PLUS",
      activatedAt: new Date(Date.now() - 2 * DAY), taxCountry: "RO"
    });
    const deadline = withdrawalDeadline({
      activatedAt: seeded.periodStart, taxCountry: "RO", withdrawalDays: testBillingPolicy.withdrawalDays
    });
    const read = await api.inject({ method: "GET", url: "/v1/billing/subscription", headers });
    expect(read.statusCode).toBe(200);
    expect(read.json().subscription).toMatchObject({
      plan_id: "PLUS", status: "ACTIVE", cancel_requested: false,
      renews_on: seeded.periodEnd.toISOString(), renewal_total: "24.20",
      withdrawal_open_until: deadline.closesAt.toISOString(), withdrawal_last_day: deadline.lastDay
    });
    await api.close();
  });

  it("cancels once with one M7 per period, then revokes before the period ends", async () => {
    const identity = testHttpIdentity("p12b-cancel");
    const audit = recordingAudit();
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool, { audit }), identity);
    const headers = { "x-test-session": identity.rawSessionToken };
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PRO",
      activatedAt: new Date(Date.now() - 3 * DAY), taxCountry: "DE"
    });
    const cancel = () => api.inject({ method: "POST", url: "/v1/billing/subscription/cancel", headers });
    const revoke = () => api.inject({ method: "POST", url: "/v1/billing/subscription/cancel-revoke", headers });
    expect((await cancel()).statusCode).toBe(204);
    expect((await cancel()).statusCode).toBe(204);
    const afterCancel = await events(seeded.subscriptionId);
    const requested = afterCancel.filter((event) => event.kind === "CANCEL_REQUESTED");
    expect(requested).toHaveLength(1);
    expect(foldSubscription(afterCancel).cancelRequested).toBe(true);
    // The dedupe ref is the subscription and the day access ends: one M7 per period, however often it is cancelled.
    const m7Ref = `M7:${seeded.subscriptionId}:${seeded.periodEnd.toISOString()}`;
    expect(await outbox("EMAIL", `M7:${seeded.subscriptionId}`)).toEqual([{
      ref: m7Ref,
      payload: expect.objectContaining({
        template: "M7", recipient: "CUSTOMER", customer_id: seeded.customerId, "param.plan": "PRO",
        "param.accessEndDate": seeded.periodEnd.toISOString().slice(0, 10),
        // R2 Q-4: Settings, the one place that undoes a cancel; the access runs on, so the undo is offered.
        "param.settingsUrl": `${TEST_PUBLIC_APP_URL}/settings`, "param.canUndo": "true"
      })
    }]);
    expect(audit.events.map(({ event }) => event)).toEqual(["billing.cancel"]);
    expect((await revoke()).statusCode).toBe(204);
    const afterRevoke = await events(seeded.subscriptionId);
    expect(afterRevoke.at(-1)?.kind).toBe("CANCEL_REVOKED");
    expect(foldSubscription(afterRevoke).cancelRequested).toBe(false);
    expect((await revoke()).statusCode).toBe(204);
    expect(await events(seeded.subscriptionId)).toHaveLength(afterRevoke.length);
    expect((await cancel()).statusCode).toBe(204);
    expect((await events(seeded.subscriptionId)).filter((event) => event.kind === "CANCEL_REQUESTED")).toHaveLength(2);
    expect((await outbox("EMAIL", `M7:${seeded.subscriptionId}`)).map((row) => row.ref)).toEqual([m7Ref]);
    await api.close();
  });

  it("dates the cancel after the owner lock it waited for, never before a row written meanwhile (P2-M12)", async () => {
    const ownerRef = randomUUID();
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 3 * DAY), taxCountry: "DE"
    });
    const clock = { now: new Date() };
    const deps = subscriptionDeps(database.pool, { clock: () => clock.now });
    // A renewal settlement (or any owner-locked writer) holds the lock; the cancel waits for it.
    const lock = await holdOwnerLock(database.pool, ownerRef);
    const cancelled = cancelForOwner(deps, ownerRef);
    await lock.waiter();
    clock.now = new Date(clock.now.getTime() + 60_000);
    await lock.release();
    await cancelled;
    // Dated after the wait: a grace or hold row the lock holder wrote meanwhile can never outrank its FREE row.
    expect((await events(seeded.subscriptionId)).find((event) => event.kind === "CANCEL_REQUESTED")?.at).toEqual(clock.now);
  });

  it("lets a plan of the other NETOPIA environment be cancelled, but never revoked or offered a withdrawal (P2-I4, spec §2.5.4)", async () => {
    const identity = testHttpIdentity("p2i4-other-system");
    const audit = recordingAudit();
    // The fixture's connectors serve NETOPIA's sandbox; this plan was created in live (or the other way round after §14.8).
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool, { audit }), identity);
    const headers = { "x-test-session": identity.rawSessionToken };
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PRO",
      activatedAt: new Date(Date.now() - 3 * DAY), taxCountry: "DE", paymentEnvironment: "live"
    });
    const read = await api.inject({ method: "GET", url: "/v1/billing/subscription", headers });
    expect(read.json().subscription).toMatchObject({ status: "ACTIVE", withdrawal_open_until: null, withdrawal_last_day: null });
    expect((await api.inject({ method: "POST", url: "/v1/billing/subscription/cancel", headers })).statusCode).toBe(204);
    const revoke = await api.inject({ method: "POST", url: "/v1/billing/subscription/cancel-revoke", headers });
    expect(revoke.statusCode).toBe(409);
    expect(revoke.json()).toEqual({ error: "NOT_SUBSCRIBED", message: "NOT_SUBSCRIBED" });
    const after = await events(seeded.subscriptionId);
    expect(after.at(-1)?.kind).toBe("CANCEL_REQUESTED");
    expect(foldSubscription(after).cancelRequested).toBe(true);
    expect(audit.events.map(({ event }) => event)).toEqual(["billing.cancel"]);
    await api.close();
  });

  it("cancels a plan paused by a card dispute: no renewal, nothing ends now, and M7's paused words (P2-W10)", async () => {
    const identity = testHttpIdentity("p2w10-suspended");
    const audit = recordingAudit();
    const now = new Date();
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool, { audit, clock: () => now }), identity);
    const headers = { "x-test-session": identity.rawSessionToken };
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PRO", activatedAt: new Date(now.getTime() - 3 * DAY), taxCountry: "DE"
    });
    await suspendForChargeback(database.pool, seeded, new Date(now.getTime() - DAY));
    const entitlementRows = async () => (await database.pool.query(
      "SELECT count(*)::int AS n FROM billing.entitlement_event WHERE owner_ref=$1", [seeded.ownerRef]
    )).rows[0].n as number;
    const rowsBefore = await entitlementRows();
    expect((await api.inject({ method: "POST", url: "/v1/billing/subscription/cancel", headers })).statusCode).toBe(204);
    const written = await events(seeded.subscriptionId);
    expect(written.at(-1)).toMatchObject({ kind: "CANCEL_REQUESTED", data: { source: "SETTINGS" } });
    // Nothing ends at once: the suspension already wrote Free, and the dispute or the period-end sweep decides the end.
    expect(written.map((event) => event.kind)).not.toContain("ENDED");
    expect(foldSubscription(written)).toMatchObject({ status: "SUSPENDED", cancelRequested: true });
    expect(await entitlementRows()).toBe(rowsBefore);
    expect(await new EntitlementRepository(database.pool).current(seeded.ownerRef, now)).toMatchObject({
      planId: "FREE", cause: "SUSPENDED_CHARGEBACK"
    });
    // M7's paused variant: no undo line (the undo is refused while paused) and the period end as the latest date.
    expect(await outbox("EMAIL", `M7:${seeded.subscriptionId}`)).toEqual([{
      ref: `M7:${seeded.subscriptionId}:${seeded.periodEnd.toISOString()}`,
      payload: expect.objectContaining({
        template: "M7", "param.plan": "PRO", "param.accessEndDate": seeded.periodEnd.toISOString().slice(0, 10),
        "param.canUndo": "false", "param.paused": "true"
      })
    }]);
    expect(audit.events.map(({ event }) => event)).toEqual(["billing.cancel"]);
    // A second press is a quiet success; the undo stays refused while the plan is paused (C5).
    expect((await api.inject({ method: "POST", url: "/v1/billing/subscription/cancel", headers })).statusCode).toBe(204);
    expect((await events(seeded.subscriptionId)).filter((event) => event.kind === "CANCEL_REQUESTED")).toHaveLength(1);
    const revoke = await api.inject({ method: "POST", url: "/v1/billing/subscription/cancel-revoke", headers });
    expect(revoke.statusCode).toBe(409);
    expect(revoke.json().error).toBe("NOT_SUBSCRIBED");
    expect(foldSubscription(await events(seeded.subscriptionId)).cancelRequested).toBe(true);
    await api.close();
  });

  it("never marks an ACTIVE plan's M7 as paused (P2-W10 control)", async () => {
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(Date.now() - 2 * DAY), taxCountry: "RO"
    });
    await cancelForOwner(subscriptionDeps(database.pool), seeded.ownerRef);
    const [m7] = await outbox("EMAIL", `M7:${seeded.subscriptionId}`);
    expect(m7?.payload).toMatchObject({ "param.canUndo": "true" });
    expect(m7?.payload).not.toHaveProperty("param.paused");
  });

  it("refuses cancel and revoke with NOT_SUBSCRIBED when there is nothing to cancel", async () => {
    const identity = testHttpIdentity("p12b-none");
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool), identity);
    const headers = { "x-test-session": identity.rawSessionToken };
    for (const url of ["/v1/billing/subscription/cancel", "/v1/billing/subscription/cancel-revoke"]) {
      const response = await api.inject({ method: "POST", url, headers });
      expect(response.statusCode, url).toBe(409);
      expect(response.json(), url).toEqual({ error: "NOT_SUBSCRIBED", message: "NOT_SUBSCRIBED" });
    }
    await api.close();
  });

  it("ends the plan at once, M7 dated today with no undo, when the period already ended and the renewal is waiting out an outage (R2 Q-1)", async () => {
    const identity = testHttpIdentity("p12b-pending-renewal");
    const now = new Date();
    // Still ACTIVE, its period end behind it: P11a keeps it so (RENEWAL_PENDING) while NETOPIA or the tax service is down.
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(now.getTime() - 40 * DAY),
      taxCountry: "RO"
    });
    expect(seeded.periodEnd.getTime()).toBeLessThan(now.getTime());
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool, { clock: () => now }), identity);
    const headers = { "x-test-session": identity.rawSessionToken };
    expect((await api.inject({ method: "POST", url: "/v1/billing/subscription/cancel", headers })).statusCode).toBe(204);
    // The renewal has been reached, so the cancel flag alone could not stop it: the cancel ends the plan itself.
    const written = await events(seeded.subscriptionId);
    expect(written.slice(-2).map((event) => [event.kind, event.data.cause ?? null])).toEqual([
      ["CANCEL_REQUESTED", null], ["ENDED", "CANCEL"]
    ]);
    expect(foldSubscription(written)).toMatchObject({ status: "ENDED", endedCause: "CANCEL" });
    // FREE effective now, anchored where the paid period ended (P11b's anchor from ACTIVE).
    expect(await new EntitlementRepository(database.pool).current(seeded.ownerRef, now)).toMatchObject({
      planId: "FREE", cause: "ENDED_CANCEL", periodAnchorAt: seeded.periodEnd
    });
    expect(await outbox("EMAIL", `M7:${seeded.subscriptionId}`)).toEqual([{
      ref: `M7:${seeded.subscriptionId}:${now.toISOString()}`,
      payload: expect.objectContaining({
        "param.accessEndDate": now.toISOString().slice(0, 10), "param.canUndo": "false"
      })
    }]);
    // The access cannot come back: the plan has ended.
    const revoke = await api.inject({ method: "POST", url: "/v1/billing/subscription/cancel-revoke", headers });
    expect(revoke.statusCode).toBe(409);
    expect(revoke.json().error).toBe("NOT_SUBSCRIBED");
    await api.close();
  });

  it("schedules a downgrade with the lower plan's quoted total, and refuses one that is not lower", async () => {
    const identity = testHttpIdentity("p12b-downgrade");
    const tax = new AdjustableTaxEngine();
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool, { tax }), identity);
    const headers = { "x-test-session": identity.rawSessionToken };
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PRO",
      activatedAt: new Date(Date.now() - 4 * DAY), taxCountry: "RO"
    });
    const downgrade = (plan: string) => api.inject({
      method: "POST", url: "/v1/billing/subscription/downgrade", headers, payload: { plan_id: plan }
    });
    const notLower = await downgrade("PRO");
    expect(notLower.statusCode).toBe(422);
    expect(notLower.json().error).toBe("DOWNGRADE_NOT_LOWER");
    expect((await downgrade("FREE")).statusCode).toBe(400);
    tax.failNext("TAX_SERVICE_UNAVAILABLE");
    const outage = await downgrade("PLUS");
    expect(outage.statusCode).toBe(503);
    expect(outage.json().error).toBe("TAX_SERVICE_UNAVAILABLE");
    expect((await downgrade("PLUS")).statusCode).toBe(204);
    const written = await events(seeded.subscriptionId);
    // Terms §12: the lower plan's own net is recorded now; P11a's `recurringNetOf` makes it the next renewal's price.
    expect(written.at(-1)).toMatchObject({
      kind: "DOWNGRADE_SCHEDULED", planId: "PLUS",
      data: { announced_total_micros: 24_200_000, recurring_net_micros: 20_000_000 }
    });
    expect(recurringNetOf(written)).toEqual({ currentMicros: 50_000_000, nextRenewalMicros: 20_000_000 });
    expect(foldSubscription(written)).toMatchObject({ planId: "PRO", scheduledDowngradePlanId: "PLUS" });
    expect((await downgrade("PLUS")).statusCode).toBe(204);
    expect(await events(seeded.subscriptionId)).toHaveLength(written.length);
    await api.close();
  });

  it("charges the per-owner quote budget for a downgrade and a revoke, and never refuses a cancel", async () => {
    const identity = testHttpIdentity("p12b-budget");
    const quote = vi.fn<TaxEngine["quote"]>(async () => { throw new Error("the tax engine must not be called"); });
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool, { tax: { quote } }), identity, () => false);
    const headers = { "x-test-session": identity.rawSessionToken };
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "MAX",
      activatedAt: new Date(Date.now() - 2 * DAY), taxCountry: "RO"
    });
    const downgrade = await api.inject({
      method: "POST", url: "/v1/billing/subscription/downgrade", headers, payload: { plan_id: "PLUS" }
    });
    expect(downgrade.statusCode).toBe(429);
    expect(quote).not.toHaveBeenCalled();
    expect((await api.inject({ method: "POST", url: "/v1/billing/subscription/cancel", headers })).statusCode).toBe(204);
    expect((await api.inject({ method: "POST", url: "/v1/billing/subscription/cancel-revoke", headers })).statusCode)
      .toBe(429);
    expect(foldSubscription(await events(seeded.subscriptionId))).toMatchObject({
      cancelRequested: true, scheduledDowngradePlanId: null
    });
    await api.close();
  });

  it("refuses a downgrade and a revoke until the updated Terms are accepted, and never refuses the cancel (spec §2.3.2)", async () => {
    const identity = testHttpIdentity("p12b-reaccept");
    const quote = vi.fn<TaxEngine["quote"]>(async () => { throw new Error("a refused downgrade pays for no quote"); });
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool, {
      tax: { quote }, legal: { requiresReacceptance: async () => true }
    }), identity);
    const headers = { "x-test-session": identity.rawSessionToken };
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "MAX",
      activatedAt: new Date(Date.now() - 2 * DAY), taxCountry: "RO"
    });
    const refusal = { error: "LEGAL_REACCEPTANCE_REQUIRED", message: "LEGAL_REACCEPTANCE_REQUIRED" };
    const downgrade = await api.inject({
      method: "POST", url: "/v1/billing/subscription/downgrade", headers, payload: { plan_id: "PLUS" }
    });
    expect(downgrade.statusCode).toBe(403);
    expect(downgrade.json()).toEqual(refusal);
    expect(quote).not.toHaveBeenCalled();
    expect((await events(seeded.subscriptionId)).map((event) => event.kind)).not.toContain("DOWNGRADE_SCHEDULED");
    // The one-click cancel (Terms §12) is never gated.
    expect((await api.inject({ method: "POST", url: "/v1/billing/subscription/cancel", headers })).statusCode).toBe(204);
    expect((await events(seeded.subscriptionId)).at(-1)?.kind).toBe("CANCEL_REQUESTED");
    const revoke = await api.inject({ method: "POST", url: "/v1/billing/subscription/cancel-revoke", headers });
    expect(revoke.statusCode).toBe(403);
    expect(revoke.json()).toEqual(refusal);
    expect((await events(seeded.subscriptionId)).map((event) => event.kind)).not.toContain("CANCEL_REVOKED");
    expect(foldSubscription(await events(seeded.subscriptionId)).cancelRequested).toBe(true);
    await api.close();
  });

  it("cancels on a pool of ONE connection: every read under the owner lock uses the transaction's own", async () => {
    const small = createPool(database.connectionString, { max: 1 });
    try {
      const seeded = await seedNetopiaSubscription(database.pool, {
        ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(Date.now() - DAY), taxCountry: "RO"
      });
      // A read through the pool while the transaction holds its only connection would wait here for ever.
      await cancelForOwner(subscriptionDeps(small), seeded.ownerRef);
      expect(foldSubscription(await events(seeded.subscriptionId)).cancelRequested).toBe(true);
    } finally {
      await small.end();
    }
  }, 10_000);

  it("lists invoices newest first with whole-cent totals and the series in the number", async () => {
    const identity = testHttpIdentity("p12b-invoices");
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool), identity);
    const headers = { "x-test-session": identity.rawSessionToken };
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PLUS",
      activatedAt: new Date(Date.now() - 5 * DAY), taxCountry: "RO"
    });
    const billing = new BillingRepository(database.pool);
    const issued: Record<string, string> = {};
    await billing.withTransaction(async (client) => {
      for (const [kind, number, totalMicros, minutes] of [
        ["INVOICE", "0042", seeded.totalMicros, 1], ["CREDIT_NOTE", "0043", 12_100_000, 2]
      ] as const) {
        const at = new Date(seeded.periodStart.getTime() + minutes * 60_000);
        // Each invoice's own UTC day: a run in the last minutes of a day puts them on the next date.
        issued[number] = at.toISOString().slice(0, 10);
        // A17(a): the intent comes first; the invoice row names it (0086 invoice_names_its_intent).
        await billing.insertInvoiceIntent(client, { chargeId: seeded.initialChargeId, kind, issuer: "SMARTBILL", requestedAt: at });
        await billing.insertInvoice(client, {
          invoiceId: randomUUID(), chargeId: seeded.initialChargeId, issuer: "SMARTBILL", kind,
          externalRef: `sb-${randomUUID()}`, series: "DBAI", number, url: null, totalMicros, at
        });
      }
    });
    const listed = await api.inject({ method: "GET", url: "/v1/billing/invoices", headers });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({ invoices: [
      { number: "DBAI-0043", issued_on: issued["0043"], total: "12.10", kind: "CREDIT_NOTE", url: null },
      { number: "DBAI-0042", issued_on: issued["0042"], total: "24.20", kind: "INVOICE", url: null }
    ] });
    await api.close();
  });
});
