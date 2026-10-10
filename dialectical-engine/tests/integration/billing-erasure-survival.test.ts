import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AcceptanceRepository,
  BillingJobQueries,
  BillingRepository,
  EntitlementRepository,
  migrate
} from "@debateai/db";
import { foldSubscription } from "@debateai/billing-core";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { createBillingTestAccount, eraseBillingTestAccount } from "../support/billingAccountFixture.js";
import {
  recordingAudit,
  seedNetopiaSubscription,
  subscriptionDeps,
  TEST_RECORDS_KEY
} from "../support/billingSubscriptionFixtures.js";
import { BillingErasureHook, erasurePendingOf } from "../../apps/api/src/billing/erasure-hook.js";
import { openBillingProfile, openQuoteLocation } from "../../apps/api/src/billing/records.js";
import { revokeCancelForOwner } from "../../apps/api/src/billing/subscription-actions.js";
import { subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { readSubscriptionView } from "../../apps/api/src/billing/subscription-view.js";
import { recordWithdrawal } from "../../apps/api/src/billing/withdrawal.js";
import { sealAcceptanceEvidence } from "../../apps/api/src/legal.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const count = async (sql: string, values: readonly unknown[]): Promise<number> =>
  Number((await database.pool.query<{ n: string }>(sql, [...values])).rows[0]!.n);

const hookOn = (billing: BillingRepository, audit = recordingAudit()) => new BillingErasureHook({
  billing, jobs: new BillingJobQueries(database.pool), entitlements: new EntitlementRepository(database.pool),
  audit, clock: () => new Date()
});

/** The person cancels the deletion in Settings before it begins (0040's CHECK: not prepared, not committed). */
const cancelDeletion = async (erasureId: string): Promise<void> => {
  await database.pool.query(
    "UPDATE identity.account_erasure_request SET cancelled_at=clock_timestamp() WHERE erasure_id=$1", [erasureId]
  );
};

/** M7 (the cancel confirmation) queued for this subscription, if any. */
const m7Of = async (subscriptionId: string) => (await database.pool.query<{ ref: string }>(
  "SELECT ref FROM billing.outbox WHERE kind='EMAIL' AND ref LIKE $1", [`M7:${subscriptionId}%`]
)).rows;

const PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/**
 * An account row with NO erasure request (P1a's fixture always schedules one), created `active` like
 * billing-erasure-guard's `scheduleErasure` writes it; `setState` then moves it the way 0077's refused age check does
 * (`UPDATE identity."user" SET state='age_frozen'`), or to any other state a control needs.
 */
async function accountWithoutErasure(): Promise<Readonly<{
  ownerRef: string; setState: (state: "age_frozen" | "pending_mfa") => Promise<void>;
}>> {
  const ownerRef = randomUUID();
  const userId = randomUUID();
  await database.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,password_hash,
      pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}','{}',NULL,$3,$4,$5,$6,'active',clock_timestamp(),clock_timestamp())
  `, [userId, randomBytes(32), PASSWORD_HASH, `p15-${randomUUID()}`, randomUUID(), ownerRef]);
  return Object.freeze({
    ownerRef,
    setState: async (state: "age_frozen" | "pending_mfa") => {
      await database.pool.query(`UPDATE identity."user" SET state=$2 WHERE user_id=$1`, [userId, state]);
    }
  });
}

describe("P15 erasure stops billing and keeps the money and legal records", () => {
  it("W7: scheduling stops the renewal and keeps the plan; the erasure's commit ends it; the records survive", async () => {
    // P1b's fixture: user, both verified channels, one live session, an erasure request already due (not yet run).
    const account = await createBillingTestAccount(database.pool, "p15-stop");
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: account.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 3 * 86_400_000),
      taxCountry: "RO", email: "keep-for-ten-years@example.test"
    });
    const acceptances = new AcceptanceRepository(database.pool);
    const acceptanceId = randomUUID();
    const evidence = sealAcceptanceEvidence(TEST_RECORDS_KEY, acceptanceId, { ip: "192.0.2.10", userAgent: "p15" });
    const billing = new BillingRepository(database.pool);
    await billing.withTransaction((client) => acceptances.record(client, [{
      acceptanceId, ownerRef: account.ownerRef, kind: "TERMS", documentVersion: "2.0", documentSha256: "a".repeat(64),
      locale: "en", surface: "SIGN_UP", acceptedAt: new Date(), evidenceCiphertext: evidence.evidenceCiphertext,
      keyId: evidence.keyId
    }]));
    const audit = recordingAudit();
    const hook = hookOn(billing, audit);
    expect(await billing.ownerErasurePending(account.ownerRef)).toBe(true);
    expect(await billing.ownerAgeFrozen(account.ownerRef)).toBe(false);
    expect(await billing.pendingErasureOwnerRefs(null, 1_000)).toContain(account.ownerRef);

    // Scheduled (the DELETE /v1/account hook): the renewal stops at once, the paid plan goes on.
    expect(await hook.stop(account.ownerRef)).toBe("RENEWAL_STOPPED");
    expect(await hook.stop(account.ownerRef)).toBe("NOTHING");
    const scheduled = await billing.subscriptionEvents(seeded.subscriptionId);
    expect(scheduled.at(-1)).toMatchObject({ kind: "CANCEL_REQUESTED", data: { source: "ACCOUNT_ERASURE" } });
    expect(foldSubscription(scheduled)).toMatchObject({
      status: "ACTIVE", cancelRequested: true, currentPeriodEnd: seeded.periodEnd
    });
    expect(await new EntitlementRepository(database.pool).current(account.ownerRef, new Date()))
      .toMatchObject({ planId: "PLUS" });
    expect(audit.events).toEqual([{ event: "billing.cancel", fields: { source: "ACCOUNT_ERASURE" } }]);
    // The deletion screen said so: no M7 ("your plan ends on …") is mailed to an account being deleted.
    expect(await m7Of(seeded.subscriptionId)).toEqual([]);
    // No rebill while the deletion is pending (P11a's guard), and the sweep keeps the owner until the commit.
    expect(await erasurePendingOf(billing)(account.ownerRef)).toBe(true);
    expect(await billing.pendingErasureOwnerRefs(null, 1_000)).toContain(account.ownerRef);
    await hook.sweep(1_000);
    expect(foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId)).status).toBe("ACTIVE");

    const before = {
      events: scheduled.length,
      charges: await count("SELECT count(*)::text AS n FROM billing.charge WHERE subscription_id=$1", [seeded.subscriptionId]),
      acceptances: await count("SELECT count(*)::text AS n FROM legal.acceptance WHERE owner_ref=$1", [account.ownerRef]),
      entitlements: await count("SELECT count(*)::text AS n FROM billing.entitlement_event WHERE owner_ref=$1", [account.ownerRef])
    };
    // Prepare, acknowledge the completion mail, finalize as the erasure principal (P1b's helper): the commit.
    expect(await eraseBillingTestAccount(database.pool, account)).toBe("COMMITTED");

    expect(await count(`SELECT count(*)::text AS n FROM identity."user" WHERE user_id=$1`, [account.userId])).toBe(0);
    expect((await billing.subscriptionEvents(seeded.subscriptionId)).length).toBe(before.events);
    expect(await count("SELECT count(*)::text AS n FROM billing.charge WHERE subscription_id=$1", [seeded.subscriptionId])).toBe(before.charges);
    expect(await count("SELECT count(*)::text AS n FROM legal.acceptance WHERE owner_ref=$1", [account.ownerRef])).toBe(before.acceptances);
    expect(await count("SELECT count(*)::text AS n FROM billing.entitlement_event WHERE owner_ref=$1", [account.ownerRef])).toBe(before.entitlements);
    const profile = await billing.latestProfile(seeded.customerId);
    expect(openBillingProfile(TEST_RECORDS_KEY, seeded.customerId, profile!.profileCiphertext).email)
      .toBe("keep-for-ten-years@example.test");
    const quote = await billing.quote(seeded.initialQuoteId, account.ownerRef);
    expect(openQuoteLocation(TEST_RECORDS_KEY, seeded.initialQuoteId, quote!.locationCiphertext).country).toBe("RO");

    // Committed: billing ends as P15 does (ERASURE_STOPPED, no mark, FREE), from the sweep.
    expect(await billing.ownerErasureCommitted(account.ownerRef)).toBe(true);
    expect(await hook.sweep(1_000)).toBeGreaterThanOrEqual(1);
    const stopped = await billing.subscriptionEvents(seeded.subscriptionId);
    expect(stopped.at(-1)).toMatchObject({ kind: "ERASURE_STOPPED", data: {} });
    expect(foldSubscription(stopped)).toMatchObject({ status: "ENDED", endedCause: "ERASURE" });
    expect(await new EntitlementRepository(database.pool).current(account.ownerRef, new Date()))
      .toMatchObject({ planId: "FREE", cause: "ERASURE_STOPPED" });
    expect(audit.events.map((line) => line.event)).toContain("billing.erasure.stopped");
    expect(await billing.pendingErasureOwnerRefs(null, 1_000)).not.toContain(account.ownerRef);
    // The account row is gone, but the owner is in legal.account_closure: P11a's guard still refuses a rebill.
    expect(await billing.ownerErasurePending(account.ownerRef)).toBe(true);
    expect(await erasurePendingOf(billing)(account.ownerRef)).toBe(true);
    // And the withdrawal right ends with the plan: a statement run after the commit has nothing to withdraw.
    await expect(recordWithdrawal(subscriptionDeps(database.pool, { billing }), {
      ownerRef: account.ownerRef, withdrewAt: new Date(), source: "OWNER", authorize: async () => undefined
    })).rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
  });

  it("W7: cancelling the deletion keeps the paid month and does not renew unless the person undoes the cancel", async () => {
    const account = await createBillingTestAccount(database.pool, "w7-cancel");
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: account.ownerRef, planId: "MAX", activatedAt: new Date(Date.now() - 86_400_000), taxCountry: "DE"
    });
    const billing = new BillingRepository(database.pool);
    const deps = subscriptionDeps(database.pool, { billing });
    const hook = hookOn(billing);
    expect(await hook.stop(account.ownerRef)).toBe("RENEWAL_STOPPED");
    // While the deletion is pending, the renewal cannot be switched back on.
    await expect(revokeCancelForOwner(deps, account.ownerRef)).rejects.toMatchObject({ code: "ACCOUNT_ERASURE_PENDING" });

    await cancelDeletion(account.erasureId);
    expect(await billing.ownerErasurePending(account.ownerRef)).toBe(false);
    expect(await billing.pendingErasureOwnerRefs(null, 1_000)).not.toContain(account.ownerRef);
    expect(await hook.stop(account.ownerRef)).toBe("NOTHING");
    // The plan runs to the end of the month it was paid for, and no renewal is announced.
    const state = foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId));
    expect(state).toMatchObject({ status: "ACTIVE", planId: "MAX", cancelRequested: true, currentPeriodEnd: seeded.periodEnd });
    expect(await new EntitlementRepository(database.pool).current(account.ownerRef, new Date()))
      .toMatchObject({ planId: "MAX" });
    expect(await readSubscriptionView(deps, account.ownerRef, new Date())).toMatchObject({
      status: "ACTIVE", cancel_requested: true, renews_on: null, current_period_end: seeded.periodEnd.toISOString()
    });
    // The person chooses to renew: the cancel is undone like any other.
    await revokeCancelForOwner(deps, account.ownerRef);
    expect(foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId))).toMatchObject({
      status: "ACTIVE", cancelRequested: false
    });
  });

  it("W7: a past-due plan ends at scheduling (its next charge is a retry); a suspended one keeps the stop for a resume", async () => {
    const billing = new BillingRepository(database.pool);
    const seedIn = async (label: string, kind: "PAST_DUE" | "SUSPENDED") => {
      const account = await createBillingTestAccount(database.pool, label);
      const seeded = await seedNetopiaSubscription(database.pool, {
        ownerRef: account.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 86_400_000), taxCountry: "RO"
      });
      const state = foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId));
      await billing.withTransaction((client) => billing.appendSubscriptionEvent(client, subscriptionEvent(state, kind, new Date(), {})));
      return { account, seeded };
    };
    const pastDue = await seedIn("w7-past-due", "PAST_DUE");
    expect(await hookOn(billing).stop(pastDue.account.ownerRef)).toBe("RENEWAL_STOPPED");
    // As the person's own cancel while past due: no dunning retry can charge the card again.
    expect(foldSubscription(await billing.subscriptionEvents(pastDue.seeded.subscriptionId)))
      .toMatchObject({ status: "ENDED", endedCause: "CANCEL" });
    expect(await new EntitlementRepository(database.pool).current(pastDue.account.ownerRef, new Date()))
      .toMatchObject({ planId: "FREE", cause: "ENDED_CANCEL" });

    const suspended = await seedIn("w7-suspended", "SUSPENDED");
    expect(await hookOn(billing).stop(suspended.account.ownerRef)).toBe("RENEWAL_STOPPED");
    expect(foldSubscription(await billing.subscriptionEvents(suspended.seeded.subscriptionId)))
      .toMatchObject({ status: "SUSPENDED", cancelRequested: true });
    expect(await hookOn(billing).stop(suspended.account.ownerRef)).toBe("NOTHING");
  });

  it("W7: a withdrawal while the deletion is scheduled is still offered in Settings and is carried out until the commit", async () => {
    const account = await createBillingTestAccount(database.pool, "w7-withdraw");
    const now = new Date();
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: account.ownerRef, planId: "PLUS", activatedAt: new Date(now.getTime() - 3 * 86_400_000), taxCountry: "RO"
    });
    const billing = new BillingRepository(database.pool);
    const deps = subscriptionDeps(database.pool, { billing, clock: () => now });
    expect(await hookOn(billing).stop(account.ownerRef)).toBe("RENEWAL_STOPPED");
    // Settings still offers it: the window is open while the deletion is pending.
    const view = await readSubscriptionView(deps, account.ownerRef, now);
    expect(view?.withdrawal_open_until).not.toBeNull();
    const outcome = await recordWithdrawal(deps, {
      ownerRef: account.ownerRef, withdrewAt: now, source: "OWNER", authorize: async () => undefined
    });
    expect(outcome.refundMicros).toBeGreaterThan(0);
    const withdrawn = await billing.subscriptionEvents(seeded.subscriptionId);
    expect(withdrawn.at(-1)).toMatchObject({ kind: "WITHDRAWN", data: { refund_micros: outcome.refundMicros } });
    expect(await new EntitlementRepository(database.pool).current(account.ownerRef, new Date()))
      .toMatchObject({ planId: "FREE", cause: "ENDED_WITHDRAWAL" });
    const requested = (await billing.charge(seeded.initialChargeId))!.events
      .filter((event) => event.kind === "REFUND_REQUESTED" && event.errorCode === "WITHDRAWAL")
      .map((event) => event.amountMicros);
    expect(requested).toEqual([outcome.refundMicros]);
    // The commit later finds nothing live: the withdrawal stands as the plan's end.
    expect(await eraseBillingTestAccount(database.pool, account)).toBe("COMMITTED");
    expect(await billing.pendingErasureOwnerRefs(null, 1_000)).not.toContain(account.ownerRef);
    expect(await hookOn(billing).stop(account.ownerRef)).toBe("NOTHING");
    expect((await billing.subscriptionEvents(seeded.subscriptionId)).at(-1)?.kind).toBe("WITHDRAWN");
  });

  it("ends a live plan left behind after finalize: the guard still blocks it and the sweep ends it", async () => {
    const account = await createBillingTestAccount(database.pool, "p15-left-behind");
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: account.ownerRef, planId: "PRO", activatedAt: new Date(Date.now() - 86_400_000), taxCountry: "DE"
    });
    // The hook failed and the account was finalized before any sweep ran.
    expect(await eraseBillingTestAccount(database.pool, account)).toBe("COMMITTED");
    const billing = new BillingRepository(database.pool);
    expect(await erasurePendingOf(billing)(account.ownerRef)).toBe(true);
    expect(await billing.pendingErasureOwnerRefs(null, 1_000)).toContain(account.ownerRef);
    expect(await hookOn(billing).sweep(100)).toBeGreaterThanOrEqual(1);
    expect(foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId))).toMatchObject({
      status: "ENDED", endedCause: "ERASURE"
    });
  });

  it("sweeps every owner with an erasure and a live plan, page after page, and no one else (W7: pending stops the renewal)", async () => {
    const billing = new BillingRepository(database.pool);
    const live: Array<Awaited<ReturnType<typeof seedNetopiaSubscription>>> = [];
    const free: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const paying = await createBillingTestAccount(database.pool, `p15-page-${String(index)}`);
      live.push(await seedNetopiaSubscription(database.pool, {
        ownerRef: paying.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 86_400_000), taxCountry: "RO"
      }));
      // A Free account being erased too: never listed, so it never takes a page's place.
      free.push((await createBillingTestAccount(database.pool, `p15-free-${String(index)}`)).ownerRef);
    }
    const bystander = await seedNetopiaSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PRO", activatedAt: new Date(Date.now() - 86_400_000), taxCountry: "DE"
    });
    const listed = await billing.pendingErasureOwnerRefs(null, 1_000);
    expect(listed).toEqual(expect.arrayContaining(live.map((seeded) => seeded.ownerRef)));
    expect(listed.filter((ownerRef) => free.includes(ownerRef))).toEqual([]);
    // One owner per page: the sweep must walk the pages to reach all three. Their deletions are pending, not run, so
    // the sweep repeats the scheduling's renewal stop (W7) and the paid plans go on.
    expect(await hookOn(billing).sweep(1)).toBeGreaterThanOrEqual(3);
    for (const seeded of live) {
      expect(foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId)))
        .toMatchObject({ status: "ACTIVE", cancelRequested: true });
    }
    expect(foldSubscription(await billing.subscriptionEvents(bystander.subscriptionId)))
      .toMatchObject({ status: "ACTIVE", cancelRequested: false });
  });

  it("ends the live plan of an account the age gate froze, never as an erasure, and names no other state (R3-2)", async () => {
    const billing = new BillingRepository(database.pool);
    const paying = await accountWithoutErasure();
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: paying.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 86_400_000), taxCountry: "RO"
    });
    // A control in another non-active state, with a live plan of its own: only age_frozen is named, never "not active".
    const other = await accountWithoutErasure();
    const otherPlan = await seedNetopiaSubscription(database.pool, {
      ownerRef: other.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 86_400_000), taxCountry: "RO"
    });
    await other.setState("pending_mfa");
    // Active, with no erasure: billing goes on.
    expect(await erasurePendingOf(billing)(paying.ownerRef)).toBe(false);
    expect(await billing.pendingErasureOwnerRefs(null, 1_000)).not.toContain(paying.ownerRef);

    // The one-time check answered under 18 (0077's identity.confirm_account_age_with_audit sets the state).
    await paying.setState("age_frozen");
    expect(await billing.ownerErasurePending(paying.ownerRef)).toBe(true);
    expect(await erasurePendingOf(billing)(paying.ownerRef)).toBe(true);
    expect(await billing.ownerAgeFrozen(paying.ownerRef)).toBe(true);
    const listed = await billing.pendingErasureOwnerRefs(null, 1_000);
    expect(listed).toContain(paying.ownerRef);
    expect(listed).not.toContain(other.ownerRef);
    expect(await billing.ownerErasurePending(other.ownerRef)).toBe(false);

    const audit = recordingAudit();
    const swept = await hookOn(billing, audit).sweep(100);
    expect(swept).toBeGreaterThanOrEqual(1);
    const events = await billing.subscriptionEvents(seeded.subscriptionId);
    expect(events.at(-1)?.kind).toBe("ERASURE_STOPPED");
    expect(events.at(-1)?.data).toEqual({ stopped_for: "AGE_FROZEN" });
    expect(foldSubscription(events)).toMatchObject({ status: "ENDED", endedCause: "ERASURE" });
    expect(await new EntitlementRepository(database.pool).current(paying.ownerRef, new Date()))
      .toMatchObject({ planId: "FREE", cause: "ERASURE_STOPPED" });
    // Its audit line is its own: every other stop of this sweep, if any, is an erasure's.
    const lines = audit.events.map((line) => line.event);
    expect(lines.filter((event) => event === "billing.age_frozen.stopped")).toHaveLength(1);
    expect(lines.filter((event) => event !== "billing.age_frozen.stopped")).toHaveLength(swept - 1);
    // Nothing live is left, so it is no longer listed; P11a's guard still refuses a rebill while the account is frozen.
    expect(await billing.pendingErasureOwnerRefs(null, 1_000)).not.toContain(paying.ownerRef);
    expect(await erasurePendingOf(billing)(paying.ownerRef)).toBe(true);
    expect(foldSubscription(await billing.subscriptionEvents(otherPlan.subscriptionId)).status).toBe("ACTIVE");
  });

  // Last in this file: the broken owner stays listed, so every later sweep of this database would throw.
  it("keeps stopping the other owners when one owner's history does not fold, then reports that one", async () => {
    const billing = new BillingRepository(database.pool);
    const brokenAccount = await createBillingTestAccount(database.pool, "p15-broken");
    // An illegal history (RESUMED straight after CREATED) written past P1b's fold check, the way P16b's test writes
    // one: its latest kind is live, so the sweep lists the owner, and P1b's strict read refuses every stop.
    const broken = randomUUID();
    for (const [kind, data] of [["CREATED", { payment_provider: "netopia", payment_environment: "sandbox" }], ["RESUMED", {}]] as const) {
      await database.pool.query(`
        INSERT INTO billing.subscription_event (event_id, subscription_id, owner_ref, kind, at, plan_id, data)
        VALUES ($1, $2, $3, $4, clock_timestamp(), 'PLUS', $5::jsonb)
      `, [randomUUID(), broken, brokenAccount.ownerRef, kind, JSON.stringify(data)]);
    }
    const healthyAccount = await createBillingTestAccount(database.pool, "p15-healthy");
    const healthy = await seedNetopiaSubscription(database.pool, {
      ownerRef: healthyAccount.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 86_400_000), taxCountry: "RO"
    });
    expect(await billing.pendingErasureOwnerRefs(null, 1_000))
      .toEqual(expect.arrayContaining([brokenAccount.ownerRef, healthyAccount.ownerRef]));
    // The loop goes on past the failing owner, whichever comes first, and throws only at the end.
    await expect(hookOn(billing).sweep(1)).rejects.toMatchObject({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" });
    // W7: the healthy owner's deletion is pending, so its renewal stop is written; the commit ends the plan later.
    expect(foldSubscription(await billing.subscriptionEvents(healthy.subscriptionId))).toMatchObject({
      status: "ACTIVE", cancelRequested: true
    });
  });
});
