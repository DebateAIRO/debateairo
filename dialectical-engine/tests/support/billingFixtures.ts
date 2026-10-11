import { randomUUID } from "node:crypto";
import type { AskApplication } from "@debateai/api";
import type { SubscriptionEvent } from "@debateai/billing-core";
import type { GeoLookup } from "@debateai/geo";
import { TypedDomainError } from "@debateai/kernel";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW,
  billingPlansFromValue,
  planById,
  planNetPrice,
  type BillingPlans,
  type BillingPolicy,
  type CountryPolicy,
  type CountryRule
} from "@debateai/register";
import type { BillingRecipientReader } from "../../apps/api/src/billing/account-email.js";
// R-16: tests import the fakes through tests/support/ (P4's fake-tax-engine.ts re-exports the tax rules).
import { FakeTaxEngine, fakeTaxMicros } from "./fake-tax-engine.js";

/**
 * W8 (P2-I12): the account-address port for suites about something else. Their accounts hold no readable address, so
 * it answers as for an erased account and billing uses the billing profile's address. The address rule itself is
 * tests/integration/billing-email-change.test.ts's and billing-cancel-link.test.ts's.
 */
export const PROFILE_ADDRESS_ONLY: BillingRecipientReader = Object.freeze({ currentAddress: async () => null });

/**
 * The engine's plans in the v2 shape (spec 2026-10-05 §2.16.2). Suites about something else keep their dollar amounts:
 * every country pays in USD here. Part C's suites use `testRegionalPlans`, the engine's own rule (spec 2026-10-05
 * §2.16.1).
 */
export const testBillingPlans: BillingPlans = Object.freeze({
  creditCurrency: "USD",
  currencyByCountry: Object.freeze({ defaultCurrency: "USD", countries: Object.freeze({}) }),
  sourceRef: "test:billing-plans",
  plans: Object.freeze([
    // R-11: Free's fixed risk tier is "standard", what apps/ui/app/new/defaults.tsx sends today.
    { planId: "FREE", tier: "free", netPrices: { USD: 0, EUR: 0, RON: 0 }, monthlyCreditMicros: 200_000, dayBasisPoints: null,
      weekBasisPoints: null, finishBasisPoints: 11_000, fixedGauges: { riskTier: "standard", compositionBudgetTier: "low", depth: 1 } },
    { planId: "PLUS", tier: "premium", netPrices: { USD: 20_000_000, EUR: 20_000_000, RON: 100_000_000 },
      monthlyCreditMicros: 5_000_000, dayBasisPoints: 2_000, weekBasisPoints: 5_000, finishBasisPoints: 11_000, fixedGauges: null },
    { planId: "PRO", tier: "premium", netPrices: { USD: 50_000_000, EUR: 50_000_000, RON: 250_000_000 },
      monthlyCreditMicros: 20_000_000, dayBasisPoints: 2_000, weekBasisPoints: 5_000, finishBasisPoints: 11_000, fixedGauges: null },
    { planId: "MAX", tier: "premium", netPrices: { USD: 200_000_000, EUR: 200_000_000, RON: 1_000_000_000 },
      monthlyCreditMicros: 150_000_000, dayBasisPoints: 2_000, weekBasisPoints: 5_000, finishBasisPoints: 11_000, fixedGauges: null }
  ])
}) as BillingPlans;

/** Spec 2026-10-05 §2.16.1: testBillingPlans' plans under the engine's own region rule (RO RON, 31 countries EUR, else USD). */
export const testRegionalPlans: BillingPlans = Object.freeze({
  ...testBillingPlans,
  currencyByCountry: billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test").currencyByCountry,
  sourceRef: "test:billing-plans-regional"
});

export const testBillingPolicy: BillingPolicy = Object.freeze({
  enabled: true,
  dunningRetryDays: [1, 3, 7],
  withdrawalDays: 14,
  renewalNoticeBusinessDays: 7,
  lookAheadBusinessDays: 10,
  confirmationBusinessDays: 2,
  quoteTtlSeconds: 1_800,
  taxCode: "saas",
  invoiceIssuerRules: { RO: "SMARTBILL", "*": "QUADERNO" },
  withdrawalCountries: [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
    "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB"
  ],
  sourceRef: "test:billing-policy"
}) as BillingPolicy;

const rule = (signup: boolean, pay: boolean, reason: CountryRule["reason"], blocked = false): CountryRule =>
  Object.freeze({ signup, pay, reason, blocked });

export const testCountryPolicy: CountryPolicy = Object.freeze({
  defaultRule: rule(false, false, "NOT_OFFERED"),
  countries: Object.freeze({
    RO: rule(true, true, "OFFERED"),
    DE: rule(true, true, "OFFERED"),
    US: rule(true, true, "OFFERED"),
    GB: rule(true, false, "TAX_NOT_READY"),
    RU: rule(false, false, "SANCTIONS", true)
  }),
  usStates: Object.freeze({}),
  unknownIp: "REFUSE",
  tor: "REFUSE",
  sourceRef: "test:country-policy"
});

/** An AskApplication no billing test ever reaches. */
export function unusedAskApplication(): AskApplication {
  const unused = async (): Promise<never> => { throw new Error("NOT_USED_BY_BILLING_TESTS"); };
  return {
    withContentLease: async (_runId, use) => use(), submit: unused, readAnswer: unused, readRunAnswer: unused,
    readRun: unused, readAnswerIndex: unused, readInspection: unused, readLedgerDigest: unused, readNode: unused,
    recordInvestigation: unused, unlinkMemoryLink: unused, readDeployment: unused,
    events: async function* () { yield* []; }
  };
}

/** The payment system a subscription was created in: NETOPIA's sandbox unless a test names its live system. */
export type TestPaymentSystem = Readonly<{ provider: "netopia"; environment: "sandbox" | "live" }>;

/**
 * CREATED then ACTIVATED for one owner: the smallest live subscription the fold accepts. CREATED names its payment
 * system (0111's CHECK, N7's fold); ACTIVATED carries the recurring net price the subscriber keeps (Terms §12) and, on
 * NETOPIA, the saved card it adopted (a fixed uuid: no card_token row backs it, so only the fold reads it).
 */
export function activeSubscriptionEvents(
  ownerRef: string, at: Date, planId: "PLUS" | "PRO" | "MAX" = "PLUS",
  system: TestPaymentSystem = { provider: "netopia", environment: "sandbox" }
): SubscriptionEvent[] {
  const subscriptionId = randomUUID();
  const netMicros = planNetPrice(planById(testBillingPlans, planId), "USD");
  const base = { subscriptionId, ownerRef, planId, cardTokenId: null } as const;
  const created = { payment_provider: system.provider, payment_environment: system.environment };
  return [
    { ...base, eventId: randomUUID(), kind: "CREATED", at, periodAnchorAt: null,
      data: { country_confirmed: false, ip_country: "RO", quote_id: randomUUID(), ...created } },
    { ...base, eventId: randomUUID(), kind: "ACTIVATED", at, periodAnchorAt: at,
      cardTokenId: ["5b7e1c2a", "4d3f", "4a6b", "9c8d", "0e1f2a3b4c5d"].join("-"), data: {
        charge_id: "0".repeat(32), announced_total_micros: Math.round(netMicros * 1.21), recurring_net_micros: netMicros,
        reactivated: false
      } }
  ];
}

/**
 * P4's in-memory FakeTaxEngine (fixed rates RO 21 %, DE 19 %, FR 20 %, the VALID reverse-charge rule, idempotent
 * records), plus three test levers: a per-country rate override, so a renewal can find a changed total (A7); a
 * one-shot hook run inside the next quote, so a test can land a cancel or an erasure between a renewal's first look
 * and its charge; and a per-country outage (every quote for a listed country fails TAX_SERVICE_UNAVAILABLE, as P4's
 * client does on a 5xx), so a test's outage in a shared harness never lands on another test's subscription.
 */
export class AdjustableTaxEngine extends FakeTaxEngine {
  readonly rateOverride = new Map<string, number>();
  readonly unavailableCountries = new Set<string>();
  beforeQuote: (() => Promise<void>) | null = null;

  override async quote(input: Parameters<FakeTaxEngine["quote"]>[0]): ReturnType<FakeTaxEngine["quote"]> {
    const hook = this.beforeQuote;
    this.beforeQuote = null;
    if (hook !== null) await hook();
    if (this.unavailableCountries.has(input.location.country)) {
      throw new TypedDomainError("TAX_SERVICE_UNAVAILABLE", "fake tax engine outage");
    }
    const base = await super.quote(input);
    const rate = this.rateOverride.get(base.taxCountry);
    if (rate === undefined || base.status !== "TAXABLE") return base;
    const taxMicros = fakeTaxMicros(input.netMicros, rate);
    return Object.freeze({ ...base, taxMicros, totalMicros: input.netMicros + taxMicros, taxRateBasisPoints: rate });
  }
}

export class StubGeo implements GeoLookup {
  country = "RO";
  tor = false;
  lookup(_ip: string): { country: string; tor: boolean } { return { country: this.country, tor: this.tor }; }
  close(): void {}
}
