import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW, countryRule } from "@debateai/register";
import { startBillingStack, TEST_IPS, type BillingPerson, type BillingStack } from "../support/billingStack.js";
import { everyCountryClosedPolicyValue, testEveryCountryClosedPolicy } from "../support/billingFixtures.js";

/**
 * NETOPIA's check of the public main site, with purchases off (the owner's choice of 24 October 2026): billing ON and
 * a countryPolicy that closes payment in every country (`pay: false` everywhere). On the fake stack (the real routes,
 * runtime and jobs over embedded Postgres and the NETOPIA protocol fake), this proves that the plans are still shown
 * with their prices and that every way to pay is refused with COUNTRY_PAYMENT_UNAVAILABLE, for a Romanian, a German
 * and a US buyer, before any charge row or NETOPIA request exists.
 *
 * The subscribers (for the upgrade and the card change) and the checkout quotes are made first, while the stack's
 * test countries can pay: on the public site they stand for anything made before the version closing every country
 * was published. Then the stack takes the closed policy, as the API reads it after a restart on the new version over
 * the same database. The cases share one stack, and the last one counts what the others made, so their order matters.
 */
const COUNTRIES = ["RO", "DE", "US"] as const;
type Country = (typeof COUNTRIES)[number];
/** The card page's corrected payer for each country (spec §2.11): every field NETOPIA needs, the phone in E.164. */
const CARD_DETAILS: Readonly<Record<Country, Readonly<Record<string, string>>>> = Object.freeze({
  RO: { first_name: "Ana", last_name: "Pop", phone: "+40712345678", street: "Strada Memorandumului 1", city: "Cluj-Napoca", postal_code: "400114" },
  DE: { first_name: "Anna", last_name: "Schmidt", phone: "+4915112345678", street: "Invalidenstrasse 1", city: "Berlin", postal_code: "10115" },
  US: { first_name: "Ann", last_name: "Smith", phone: "+12125550123", street: "1 Main Street", city: "New York", postal_code: "10001" }
});

let stack: BillingStack;
const subscribers = new Map<Country, BillingPerson>();
const quotedBuyers = new Map<Country, Readonly<{ person: BillingPerson; quoteRef: string }>>();

type Counts = Readonly<Record<"charges" | "chargeEvents" | "hostedPayments" | "quotes" | "subscriptionEvents" | "outbox" | "netopiaRequests", number>>;
async function counts(): Promise<Counts> {
  const count = async (table: string): Promise<number> =>
    Number((await stack.database.pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0]!.n);
  return Object.freeze({
    charges: await count("billing.charge"), chargeEvents: await count("billing.charge_event"),
    hostedPayments: await count("billing.hosted_payment"), quotes: await count("billing.quote"),
    subscriptionEvents: await count("billing.subscription_event"), outbox: await count("billing.outbox"),
    netopiaRequests: stack.netopia.lastRequests.length
  });
}
let closedAt: Counts;

beforeAll(async () => {
  stack = await startBillingStack();
  for (const country of COUNTRIES) {
    const subscriber = await stack.signUp(`closed.subscriber.${country.toLowerCase()}@example.test`, country);
    await stack.subscribe(subscriber, "PLUS", country);
    subscribers.set(country, subscriber);
    const buyer = await stack.signUp(`closed.quoted.${country.toLowerCase()}@example.test`, country);
    const quote = await stack.quote(buyer, "PLUS");
    if (quote.status !== 200) throw new Error(`SETUP_QUOTE_${country}_${quote.status}_${String(quote.body.error)}`);
    quotedBuyers.set(country, { person: buyer, quoteRef: String(quote.body.quote_ref) });
  }
  stack.useCountryPolicy(testEveryCountryClosedPolicy);
  closedAt = await counts();
}, 600_000);
afterAll(async () => { await stack?.stop(); });

const refusedForCountry = (answer: Readonly<{ status: number; body: Record<string, unknown> }>) =>
  expect({ status: answer.status, error: answer.body.error }).toEqual({ status: 403, error: "COUNTRY_PAYMENT_UNAVAILABLE" });

describe("NETOPIA's check: billing on with every country closed for payment", () => {
  it("billing on with every country closed: the register's parser accepts a policy where no country can pay, and sign-up stays as it was", () => {
    const policy = testEveryCountryClosedPolicy;
    expect(policy.defaultRule.pay).toBe(false);
    expect(Object.values(policy.countries).every((rule) => !rule.pay)).toBe(true);
    expect(Object.values(policy.usStates).every((rule) => !rule.pay)).toBe(true);
    expect(Object.keys(policy.countries)).toEqual(Object.keys(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value.countries));
    for (const country of COUNTRIES) expect(countryRule(policy, country), country).toMatchObject({ signup: true, pay: false });
    // The always-blocked countries stay blocked, and the sealed regions stay closed.
    expect(countryRule(policy, "RU")).toMatchObject({ signup: false, pay: false, blocked: true });
    expect(everyCountryClosedPolicyValue().regions).toEqual(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value.regions);
  });

  it("billing on with every country closed: GET /v1/billing/plans is public and answers the four plans with their prices, in Romania, Germany and the US", async () => {
    for (const country of COUNTRIES) {
      const plans = await stack.get(null, "/v1/billing/plans", TEST_IPS[country]);
      expect(plans.status, country).toBe(200);
      expect((plans.body.plans as Array<{ plan_id: string }>).map((plan) => plan.plan_id), country)
        .toEqual(["FREE", "PLUS", "PRO", "MAX"]);
      expect(plans.body, country).toMatchObject({
        currency: "USD",
        plans: [
          { plan_id: "FREE", net_prices: { USD: "0.00" } },
          { plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" } },
          { plan_id: "PRO", net_prices: { USD: "50.00", EUR: "50.00", RON: "250.00" } },
          { plan_id: "MAX", net_prices: { USD: "200.00", EUR: "200.00", RON: "1000.00" } }
        ]
      });
    }
  });

  it("billing on with every country closed: a quote answers 403 COUNTRY_PAYMENT_UNAVAILABLE for a Romanian, a German and a US buyer", async () => {
    for (const country of COUNTRIES) {
      const buyer = await stack.signUp(`closed.buyer.${country.toLowerCase()}@example.test`, country);
      refusedForCountry(await stack.quote(buyer, "PLUS"));
      // The pricing page's first quote, with no country sent (the connection's country decides), is refused alike.
      refusedForCountry(await stack.post(buyer, "/v1/billing/quote", { plan_id: "PRO" }));
    }
  });

  it("billing on with every country closed: a checkout start answers 403 COUNTRY_PAYMENT_UNAVAILABLE, even with a quote priced before the countries closed", async () => {
    for (const country of COUNTRIES) {
      const { person, quoteRef } = quotedBuyers.get(country)!;
      refusedForCountry(await stack.checkout(person, quoteRef));
    }
  });

  it("billing on with every country closed: an upgrade answers 403 COUNTRY_PAYMENT_UNAVAILABLE for a Romanian, a German and a US subscriber", async () => {
    for (const country of COUNTRIES) {
      refusedForCountry(await stack.post(subscribers.get(country)!, "/v1/billing/subscription/upgrade-quote", { plan_id: "PRO" }));
    }
  });

  it("billing on with every country closed: a card change answers 403 COUNTRY_PAYMENT_UNAVAILABLE for a Romanian, a German and a US subscriber", async () => {
    for (const country of COUNTRIES) {
      refusedForCountry(await stack.post(subscribers.get(country)!, "/v1/billing/subscription/card", {
        locale: "en", renewal_terms: stack.consents("en").renewal_terms, ...CARD_DETAILS[country]
      }));
    }
  });

  it("billing on with every country closed: the refusals made no charge, no quote, no subscription event, no job and no NETOPIA request", async () => {
    await stack.runJobs();
    expect(await counts()).toEqual(closedAt);
    for (const country of COUNTRIES) {
      expect(await stack.subscriptionStatus(subscribers.get(country)!.ownerRef), country).toBe("ACTIVE");
      expect(await stack.entitlementPlan(subscribers.get(country)!.ownerRef), country).toBe("PLUS");
    }
  });
});
