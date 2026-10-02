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
import { recordingAudit, seedActiveSubscription, TEST_RECORDS_KEY } from "../support/billingSubscriptionFixtures.js";
import { BillingErasureHook, erasurePendingOf } from "../../apps/api/src/billing/erasure-hook.js";
import { openBillingProfile, openQuoteLocation } from "../../apps/api/src/billing/records.js";
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
  it("stops the subscription, survives finalize, still opens with the records key, and still blocks a rebill", async () => {
    // P1b's fixture: user, both verified channels, one live session, an erasure request already due.
    const account = await createBillingTestAccount(database.pool, "p15-stop");
    const seeded = await seedActiveSubscription(database.pool, {
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
    expect(await hook.stop(account.ownerRef)).toBe("STOPPED");
    expect(await hook.stop(account.ownerRef)).toBe("NOTHING");
    const stopped = await billing.subscriptionEvents(seeded.subscriptionId);
    expect(stopped.at(-1)?.kind).toBe("ERASURE_STOPPED");
    // An erasure's stop carries no mark and says "erasure" (R3-2 keeps the age gate's stop apart from it).
    expect(stopped.at(-1)?.data).toEqual({});
    expect(audit.events.map((line) => line.event)).toEqual(["billing.erasure.stopped"]);
    expect(foldSubscription(stopped)).toMatchObject({ status: "ENDED", endedCause: "ERASURE" });
    expect(await new EntitlementRepository(database.pool).current(account.ownerRef, new Date()))
      .toMatchObject({ planId: "FREE", cause: "ERASURE_STOPPED" });
    // Nothing live is left, so the sweep no longer lists this owner.
    expect(await billing.pendingErasureOwnerRefs(null, 1_000)).not.toContain(account.ownerRef);

    const before = {
      events: stopped.length,
      charges: await count("SELECT count(*)::text AS n FROM billing.charge WHERE subscription_id=$1", [seeded.subscriptionId]),
      acceptances: await count("SELECT count(*)::text AS n FROM legal.acceptance WHERE owner_ref=$1", [account.ownerRef]),
      entitlements: await count("SELECT count(*)::text AS n FROM billing.entitlement_event WHERE owner_ref=$1", [account.ownerRef])
    };
    // Prepare, acknowledge the completion mail, finalize as the erasure principal (P1b's helper).
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
    // The account row is gone, but the owner is in legal.account_closure: P11a's guard still refuses a rebill.
    expect(await billing.ownerErasurePending(account.ownerRef)).toBe(true);
    expect(await erasurePendingOf(billing)(account.ownerRef)).toBe(true);
  });

  it("ends a live plan left behind after finalize: the guard still blocks it and the sweep ends it", async () => {
    const account = await createBillingTestAccount(database.pool, "p15-left-behind");
    const seeded = await seedActiveSubscription(database.pool, {
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

  it("sweeps every owner with an erasure and a live plan, page after page, and no one else", async () => {
    const billing = new BillingRepository(database.pool);
    const live: Array<Awaited<ReturnType<typeof seedActiveSubscription>>> = [];
    const free: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const paying = await createBillingTestAccount(database.pool, `p15-page-${String(index)}`);
      live.push(await seedActiveSubscription(database.pool, {
        ownerRef: paying.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 86_400_000), taxCountry: "RO"
      }));
      // A Free account being erased too: never listed, so it never takes a page's place.
      free.push((await createBillingTestAccount(database.pool, `p15-free-${String(index)}`)).ownerRef);
    }
    const bystander = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PRO", activatedAt: new Date(Date.now() - 86_400_000), taxCountry: "DE"
    });
    const listed = await billing.pendingErasureOwnerRefs(null, 1_000);
    expect(listed).toEqual(expect.arrayContaining(live.map((seeded) => seeded.ownerRef)));
    expect(listed.filter((ownerRef) => free.includes(ownerRef))).toEqual([]);
    // One owner per page: the sweep must walk the pages to reach all three.
    expect(await hookOn(billing).sweep(1)).toBeGreaterThanOrEqual(3);
    for (const seeded of live) {
      expect(foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId)).status).toBe("ENDED");
    }
    expect(foldSubscription(await billing.subscriptionEvents(bystander.subscriptionId)).status).toBe("ACTIVE");
  });

  it("ends the live plan of an account the age gate froze, never as an erasure, and names no other state (R3-2)", async () => {
    const billing = new BillingRepository(database.pool);
    const paying = await accountWithoutErasure();
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: paying.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 86_400_000), taxCountry: "RO"
    });
    // A control in another non-active state, with a live plan of its own: only age_frozen is named, never "not active".
    const other = await accountWithoutErasure();
    const otherPlan = await seedActiveSubscription(database.pool, {
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
    expect(lines.filter((event) => event === "billing.erasure.stopped")).toHaveLength(swept - 1);
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
    for (const [kind, data] of [["CREATED", { xmoney_environment: "stage" }], ["RESUMED", {}]] as const) {
      await database.pool.query(`
        INSERT INTO billing.subscription_event (event_id, subscription_id, owner_ref, kind, at, plan_id, data)
        VALUES ($1, $2, $3, $4, clock_timestamp(), 'PLUS', $5::jsonb)
      `, [randomUUID(), broken, brokenAccount.ownerRef, kind, JSON.stringify(data)]);
    }
    const healthyAccount = await createBillingTestAccount(database.pool, "p15-healthy");
    const healthy = await seedActiveSubscription(database.pool, {
      ownerRef: healthyAccount.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 86_400_000), taxCountry: "RO"
    });
    expect(await billing.pendingErasureOwnerRefs(null, 1_000))
      .toEqual(expect.arrayContaining([brokenAccount.ownerRef, healthyAccount.ownerRef]));
    // The loop goes on past the failing owner, whichever comes first, and throws only at the end.
    await expect(hookOn(billing).sweep(1)).rejects.toMatchObject({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" });
    expect(foldSubscription(await billing.subscriptionEvents(healthy.subscriptionId))).toMatchObject({
      status: "ENDED", endedCause: "ERASURE"
    });
    expect(await billing.pendingErasureOwnerRefs(null, 1_000)).not.toContain(healthyAccount.ownerRef);
  });
});
