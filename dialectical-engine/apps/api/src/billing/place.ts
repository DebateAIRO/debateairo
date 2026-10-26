import { isIP } from "node:net";
import { decidePayment, UNKNOWN_COUNTRY, type GeoLookup, type GeoRefusalCode } from "@debateai/geo";
import { exhaustive, paymentRegionsOf, type PaymentRegionId } from "@debateai/kernel";
import type { BillingCurrency } from "@debateai/contract";
import { priceCurrencyFor, regionRule, type BillingPlans, type CountryPolicy } from "@debateai/register";
import type { BillingAudit } from "./audit.js";
import { BillingRefusal, type BillingRefusalCode } from "./refusal.js";

export type PaymentPlace =
  | Readonly<{ kind: "ALLOW" | "CONFIRM_COUNTRY"; declaredCountry: string; ipCountry: string }>
  | Readonly<{ kind: "REFUSE"; code: GeoRefusalCode; declaredCountry: string; ipCountry: string }>;

/**
 * Spec §2.3.3: the quote and the checkout apply `decidePayment` to the caller's address and declared country.
 * With no declared country (P19's first quote), the connection's country is the declared one; an unknown
 * connection then has nothing to pay from, so it is COUNTRY_UNKNOWN (or TOR_REFUSED over Tor).
 */
export function decidePaymentPlace(input: Readonly<{
  geo: GeoLookup; policy: CountryPolicy; ip: string; declaredCountry: string | null;
}>): PaymentPlace {
  const located = isIP(input.ip) === 0 ? { country: UNKNOWN_COUNTRY, tor: false } : input.geo.lookup(input.ip);
  const declaredCountry = input.declaredCountry ?? located.country;
  if (input.declaredCountry === null && located.country === UNKNOWN_COUNTRY) {
    return Object.freeze({
      kind: "REFUSE" as const, code: located.tor ? "TOR_REFUSED" as const : "COUNTRY_UNKNOWN" as const,
      declaredCountry, ipCountry: located.country
    });
  }
  const decision = decidePayment(input.policy, { ipCountry: located.country, tor: located.tor, declaredCountry });
  switch (decision.kind) {
    case "ALLOW":
    case "CONFIRM_COUNTRY":
      return Object.freeze({ kind: decision.kind, declaredCountry, ipCountry: located.country });
    case "REFUSE":
      return Object.freeze({ kind: "REFUSE" as const, code: decision.code, declaredCountry, ipCountry: located.country });
    default:
      return exhaustive(decision);
  }
}

/**
 * Spec 2026-10-05 §2.16.1: the currency a visitor's connection pays in, from the same lookup the quote uses when no
 * country is declared. An address that is not an IP, the lookup's "XX" and a Tor exit say nothing about where the
 * person is billed: the rule's default.
 */
export function connectionCurrency(input: Readonly<{ geo: GeoLookup | undefined; plans: BillingPlans; ip: string }>): BillingCurrency {
  if (input.geo === undefined || isIP(input.ip) === 0) return priceCurrencyFor(input.plans, null);
  const located = input.geo.lookup(input.ip);
  return priceCurrencyFor(input.plans, located.tor || located.country === UNKNOWN_COUNTRY ? null : located.country);
}

function paymentRefusalCode(code: GeoRefusalCode): BillingRefusalCode {
  switch (code) {
    case "COUNTRY_PAYMENT_UNAVAILABLE":
    case "COUNTRY_UNKNOWN":
    case "TOR_REFUSED":
    case "COUNTRY_BLOCKED":
      return code;
    case "COUNTRY_SIGNUP_UNAVAILABLE":
    case "COUNTRY_ASK_BLOCKED":
      return "COUNTRY_PAYMENT_UNAVAILABLE";
    default:
      return exhaustive(code);
  }
}

/** One content-free audit line (the code and two country codes; never the address), then the 403. */
export function placeRefusal(place: Extract<PaymentPlace, { kind: "REFUSE" }>, audit: BillingAudit): BillingRefusal {
  audit("billing.country.refused", { code: place.code, country: place.declaredCountry, ipCountry: place.ipCountry });
  return new BillingRefusal(403, paymentRefusalCode(place.code));
}

export type PaymentRegionDecision =
  | Readonly<{ kind: "ALLOW" }>
  | Readonly<{ kind: "REFUSE"; code: "REGION_PAYMENT_UNAVAILABLE"; region: PaymentRegionId }>
  | Readonly<{ kind: "POSTCODE_INVALID" }>;

const REGION_ALLOW: PaymentRegionDecision = Object.freeze({ kind: "ALLOW" });
const REGION_POSTCODE_INVALID: PaymentRegionDecision = Object.freeze({ kind: "POSTCODE_INVALID" });

/**
 * Payment region blocks (spec 2026-10-20 §6, §8): may a buyer at this billing address pay? A region refuses when its
 * rule says `pay: false` for all buyers, or for business buyers and the location has a company; `pay: true` is open,
 * like no rule. Preflight ruling R1's order: a refusing region among the address's regions refuses, even when the
 * postal code doesn't fit (several: the first in sorted order); else a postal code that doesn't fit is sent back
 * for correction when `postcodeMustFit`, and only in a country the policy closes somewhere (where it could hide a
 * closed region); else ALLOW.
 */
export function decidePaymentRegion(input: Readonly<{
  policy: CountryPolicy;
  location: Readonly<{ country: string; postalCode: string | null; region: string | null; company: unknown | null }>;
  postcodeMustFit: boolean;
}>): PaymentRegionDecision {
  const { policy, location } = input;
  const geography = paymentRegionsOf(location);
  const refused = [...geography.regions].sort().find((region) => {
    const rule = regionRule(policy, region);
    return rule !== null && !rule.pay && (rule.buyers === "all" || location.company !== null);
  });
  if (refused !== undefined) {
    return Object.freeze({ kind: "REFUSE", code: "REGION_PAYMENT_UNAVAILABLE", region: refused });
  }
  const prefix = `${location.country.trim().toUpperCase()}-`;
  const closesInCountry = Object.entries(policy.regions).some(([region, rule]) => !rule.pay && region.startsWith(prefix));
  return geography.kind === "POSTCODE_INVALID" && input.postcodeMustFit && closesInCountry
    ? REGION_POSTCODE_INVALID : REGION_ALLOW;
}

/**
 * One content-free audit line (the code, the country and the region id; never the postal code, the address or the
 * typed region), then the 403.
 */
export function regionRefusal(
  decision: Extract<PaymentRegionDecision, { kind: "REFUSE" }>, country: string, audit: BillingAudit
): BillingRefusal {
  audit("billing.region.refused", { code: decision.code, country, region: decision.region });
  return new BillingRefusal(403, decision.code);
}
