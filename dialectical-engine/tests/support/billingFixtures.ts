import { randomUUID } from "node:crypto";
import type { AskApplication } from "@debateai/api";
import type { SubscriptionEvent } from "@debateai/billing-core";
import type { BillingPlans, BillingPolicy, CountryPolicy, CountryRule } from "@debateai/register";

export const testBillingPlans: BillingPlans = Object.freeze({
  currency: "USD",
  sourceRef: "test:billing-plans",
  plans: Object.freeze([
    // R-11: Free's fixed risk tier is "standard", what apps/ui/app/new/defaults.tsx sends today.
    { planId: "FREE", tier: "free", netPriceMicros: 0, monthlyCreditMicros: 200_000, dayBasisPoints: null,
      weekBasisPoints: null, finishBasisPoints: 11_000, fixedGauges: { riskTier: "standard", compositionBudgetTier: "low", depth: 1 } },
    { planId: "PLUS", tier: "premium", netPriceMicros: 20_000_000, monthlyCreditMicros: 5_000_000, dayBasisPoints: 2_000,
      weekBasisPoints: 5_000, finishBasisPoints: 11_000, fixedGauges: null },
    { planId: "PRO", tier: "premium", netPriceMicros: 50_000_000, monthlyCreditMicros: 20_000_000, dayBasisPoints: 2_000,
      weekBasisPoints: 5_000, finishBasisPoints: 11_000, fixedGauges: null },
    { planId: "MAX", tier: "premium", netPriceMicros: 200_000_000, monthlyCreditMicros: 150_000_000, dayBasisPoints: 2_000,
      weekBasisPoints: 5_000, finishBasisPoints: 11_000, fixedGauges: null }
  ])
}) as BillingPlans;

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

/**
 * CREATED then ACTIVATED for one owner: the smallest live subscription the fold accepts. CREATED names its xMoney
 * system (P1a's CHECK, P2's fold); ACTIVATED carries the recurring net price the subscriber keeps (Terms §12).
 */
export function activeSubscriptionEvents(ownerRef: string, at: Date, planId: "PLUS" | "PRO" | "MAX" = "PLUS"): SubscriptionEvent[] {
  const subscriptionId = randomUUID();
  const base = { subscriptionId, ownerRef, planId, xmoneyCustomerId: "9001", cardRef: null } as const;
  const netMicros = testBillingPlans.plans.find((plan) => plan.planId === planId)!.netPriceMicros;
  return [
    { ...base, eventId: randomUUID(), kind: "CREATED", at, periodAnchorAt: null, xmoneyOrderId: null,
      data: { country_confirmed: false, ip_country: "RO", quote_id: randomUUID(), xmoney_environment: "stage" } },
    { ...base, eventId: randomUUID(), kind: "ACTIVATED", at, periodAnchorAt: at, xmoneyOrderId: "9002",
      cardRef: "9003", data: {
        charge_id: "0".repeat(32), announced_total_micros: Math.round(netMicros * 1.21), recurring_net_micros: netMicros,
        reactivated: false
      } }
  ];
}
