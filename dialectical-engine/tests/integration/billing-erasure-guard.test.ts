import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decimalToMicros, foldSubscription } from "@debateai/billing-core";
import type { Pool } from "@debateai/db";
import { startBillingHarness, testConsentDocuments, type BillingHarness } from "../support/billingHarness.js";
import { StubGeo, testBillingPlans } from "../support/billingFixtures.js";
import { testHttpIdentity } from "../support/httpSession.js";
import {
  mountSubscriptionRoutes, seedNetopiaSubscription, subscriptionDeps, testAgreement
} from "../support/billingSubscriptionFixtures.js";
import { netopiaVerifyHandler, verifyJob } from "../support/netopia-verify.js";
import { StubCardPayments, stubPaymentReport } from "../support/stub-card-payments.js";
import { createUpgradeSettlement, quoteUpgrade, startUpgrade } from "../../apps/api/src/billing/upgrade.js";

let h: BillingHarness;
beforeAll(async () => {
  h = await startBillingHarness();
  h.verify.registerSettlement("UPGRADE", createUpgradeSettlement({
    repository: h.repository, entitlements: h.entitlements, plans: testBillingPlans
  }));
}, 120_000);
afterAll(async () => { await h?.stop(); });

const IP = "198.51.100.7";
const PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** The owner's account row and the erasure request `identity.schedule_account_erasure` would have written. */
async function scheduleErasure(pool: Pool, ownerRef: string): Promise<void> {
  const userId = randomUUID();
  await pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,password_hash,
      pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}','{}',NULL,$3,$4,$5,$6,'active',clock_timestamp(),clock_timestamp())
  `, [userId, randomBytes(32), PASSWORD_HASH, `p15-${randomUUID()}`, randomUUID(), ownerRef]);
  await pool.query(`
    INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at)
    VALUES ($1,$2,clock_timestamp(),clock_timestamp()+interval '7 days')
  `, [randomUUID(), userId]);
}

const quoteInput = (ownerRef: string) => ({
  ownerRef, ip: IP, planId: "PLUS" as const, country: "RO", name: null, firstName: "Test", lastName: "Buyer",
  phone: "+40712345678", street: "Strada Test 1", region: "Bucuresti", postalCode: "010011", city: "Sector 1",
  company: null, now: h.clock.now
});

describe("P15 no new money while an account erasure is pending", () => {
  it("refuses a SUBSCRIBE quote and a checkout", async () => {
    const ownerRef = randomUUID();
    const quoted = await h.quotes.create(quoteInput(ownerRef));
    await scheduleErasure(h.database.pool, ownerRef);
    await expect(h.quotes.create(quoteInput(ownerRef))).rejects.toMatchObject({ code: "ACCOUNT_ERASURE_PENDING" });
    await expect(h.checkoutWith({}).start({
      ownerRef, userId: randomUUID(), ip: IP, userAgent: "p15-guard", quoteRef: quoted.quote.quoteId, locale: "en",
      consents: {
        renewal: testConsentDocuments("CONSENT_RENEWAL", "en")!,
        immediateStart: testConsentDocuments("CONSENT_IMMEDIATE_START", "en")!
      },
      countryConfirmed: false, now: h.clock.now
    })).rejects.toMatchObject({ code: "ACCOUNT_ERASURE_PENDING" });
  });

  it("refuses the upgrade quote, the upgrade and the card change routes, and writes no charge", async () => {
    const identity = testHttpIdentity("p15-guard-routes");
    const paid = await h.activate({ ownerRef: identity.authenticated.ownerRef });
    const deps = subscriptionDeps(h.database.pool, {
      recordsKey: h.recordsKey, tax: h.tax, payments: h.payments, geo: h.geo, clock: h.clock.read,
      accountEmail: { read: async () => "erasing@example.test" }
    });
    const api = await mountSubscriptionRoutes(deps, identity);
    const headers = { "x-test-session": identity.rawSessionToken };
    const quoted = await api.inject({
      method: "POST", url: "/v1/billing/subscription/upgrade-quote", headers, payload: { plan_id: "PRO" }
    });
    expect(quoted.statusCode).toBe(200);
    await scheduleErasure(h.database.pool, paid.ownerRef);
    for (const [url, payload] of [
      ["/v1/billing/subscription/upgrade-quote", { plan_id: "PRO" }],
      ["/v1/billing/subscription/upgrade", {
        plan_id: "PRO", quote_ref: quoted.json().quote_ref as string, locale: "en", renewal_terms: testAgreement("en")
      }],
      ["/v1/billing/subscription/card", {
        locale: "en", renewal_terms: testAgreement("en"), first_name: "Erin", last_name: "Rasure", phone: "+40712345678",
        street: "Strada Exemplu 1", city: "Bucuresti"
      }]
    ] as const) {
      const response = await api.inject({ method: "POST", url, headers, ...(payload === undefined ? {} : { payload }) });
      expect(response.statusCode, url).toBe(409);
      expect(response.json().error, url).toBe("ACCOUNT_ERASURE_PENDING");
    }
    expect((await h.repository.chargesForSubscription(paid.subscriptionId)).map((charge) => charge.kind)).toEqual(["INITIAL"]);
    await api.close();
  });

  it("refunds a first payment that lands after the erasure was scheduled, and never activates the plan", async () => {
    const ownerRef = randomUUID();
    const bought = await h.buy({ ownerRef });
    // The checkout was open when the erasure was scheduled, and the hook failed: nothing ended the CREATED plan.
    await scheduleErasure(h.database.pool, ownerRef);
    h.payments.pay(bought.chargeId, { amountMicros: decimalToMicros(bought.totalDecimal), cardCountry: "RO" });
    await h.settle(bought.chargeId);
    const kinds = (await h.repository.charge(bought.chargeId))!.events.map((event) => [event.kind, event.errorCode]);
    expect(kinds).toEqual(expect.arrayContaining([["SUCCEEDED", null], ["REFUND_REQUESTED", "SUBSCRIPTION_ENDED"]]));
    const events = await h.repository.subscriptionEvents(bought.subscriptionId);
    expect(events.map((event) => event.kind)).not.toContain("ACTIVATED");
    expect(foldSubscription(events)).toMatchObject({ status: "ENDED", endedCause: "ABANDONED" });
  });

  it("refunds an upgrade paid after the erasure was scheduled, and leaves the plan as it was", async () => {
    const ownerRef = randomUUID();
    const seeded = await seedNetopiaSubscription(h.database.pool, {
      ownerRef, planId: "PLUS", activatedAt: new Date(h.clock.now.getTime() - 5 * 86_400_000), taxCountry: "RO"
    });
    const payments = new StubCardPayments();
    const deps = subscriptionDeps(h.database.pool, { tax: h.tax, geo: new StubGeo(), clock: h.clock.read, payments });
    const quoted = await quoteUpgrade(deps, { ownerRef, planId: "PRO", ip: IP, now: h.clock.now });
    const started = await startUpgrade(deps, {
      ownerRef, userId: randomUUID(), planId: "PRO", quoteRef: quoted.quote_ref, ip: IP, userAgent: "p15-guard",
      locale: "en", agreement: testAgreement("en")!
    });
    await scheduleErasure(h.database.pool, ownerRef);
    const charge = (await h.repository.charge(started.charge_ref))!;
    payments.scriptStatus(started.charge_ref, stubPaymentReport(started.charge_ref, "PAID", { amountMicros: charge.totalMicros }));
    const { verify } = netopiaVerifyHandler(h.database.pool, { payments, clock: h.clock.read });
    await verify.handle(verifyJob(started.charge_ref, h.clock.now), h.clock.now);
    const kinds = (await h.repository.charge(started.charge_ref))!.events.map((event) => [event.kind, event.errorCode]);
    expect(kinds).toEqual(expect.arrayContaining([["REFUND_REQUESTED", "SUBSCRIPTION_ENDED"]]));
    expect(foldSubscription(await h.repository.subscriptionEvents(seeded.subscriptionId)).planId).toBe("PLUS");
  });
});
