import { countryRule, type CountryPolicy } from "@debateai/register";
import { UNKNOWN_COUNTRY } from "./lookup.js";

/**
 * Paid plans G2 (spec 2026-09-29 §2.3.3) — the four country decisions, pure. `policy.unknownIp` and
 * `policy.tor` have exactly one legal value today ("REFUSE"), so an unknown address and a Tor exit
 * refuse wherever the table says they do.
 */
export type GeoRefusalCode =
  | "COUNTRY_SIGNUP_UNAVAILABLE"
  | "COUNTRY_PAYMENT_UNAVAILABLE"
  | "COUNTRY_UNKNOWN"
  | "TOR_REFUSED"
  | "COUNTRY_BLOCKED"
  | "COUNTRY_ASK_BLOCKED";

type Allow = Readonly<{ kind: "ALLOW" }>;
type ConfirmCountry = Readonly<{ kind: "CONFIRM_COUNTRY" }>;
type Refuse<C extends GeoRefusalCode> = Readonly<{ kind: "REFUSE"; code: C }>;

export type GeoDecision = Allow | ConfirmCountry | Refuse<GeoRefusalCode>;
export type SignupDecision = Allow | Refuse<"COUNTRY_SIGNUP_UNAVAILABLE" | "COUNTRY_UNKNOWN" | "TOR_REFUSED">;
export type PaymentDecision = Allow | ConfirmCountry
  | Refuse<"COUNTRY_PAYMENT_UNAVAILABLE" | "COUNTRY_UNKNOWN" | "TOR_REFUSED" | "COUNTRY_BLOCKED">;
export type AskDecision = Allow | Refuse<"COUNTRY_ASK_BLOCKED">;
export type CardCountryDecision = "OK" | "MISMATCH" | "BLOCKED";
export type GeoEvidence = Readonly<{ ipCountry: string; tor: boolean }>;

const ALLOW: Allow = Object.freeze({ kind: "ALLOW" });
const CONFIRM_COUNTRY: ConfirmCountry = Object.freeze({ kind: "CONFIRM_COUNTRY" });

function refuse<C extends GeoRefusalCode>(code: C): Refuse<C> {
  return Object.freeze({ kind: "REFUSE", code });
}

/** Sign-up: a Tor exit, then an unknown address, then the address's country switch. */
export function decideSignup(policy: CountryPolicy, evidence: GeoEvidence): SignupDecision {
  if (evidence.tor) return refuse("TOR_REFUSED");
  if (evidence.ipCountry === UNKNOWN_COUNTRY) return refuse("COUNTRY_UNKNOWN");
  return countryRule(policy, evidence.ipCountry).signup ? ALLOW : refuse("COUNTRY_SIGNUP_UNAVAILABLE");
}

/** Payment: the spec's five rules, in order; the first that matches decides. */
export function decidePayment(
  policy: CountryPolicy,
  input: Readonly<{ ipCountry: string; tor: boolean; declaredCountry: string }>
): PaymentDecision {
  if (!countryRule(policy, input.declaredCountry).pay) return refuse("COUNTRY_PAYMENT_UNAVAILABLE");
  if (input.tor) return refuse("TOR_REFUSED");
  if (input.ipCountry === UNKNOWN_COUNTRY) return refuse("COUNTRY_UNKNOWN");
  if (countryRule(policy, input.ipCountry).blocked) return refuse("COUNTRY_BLOCKED");
  if (input.ipCountry === input.declaredCountry.toUpperCase()) return ALLOW;
  return CONFIRM_COUNTRY;
}

/**
 * The card's issuing country, after payment. Never a refusal on a mismatch alone (§2.5.4 settles the
 * evidence); an unknown card country is a MISMATCH — nothing corroborates the declared one.
 */
export function decideCardCountry(
  policy: CountryPolicy,
  input: Readonly<{ declaredCountry: string; cardCountry: string | null }>
): CardCountryDecision {
  if (input.cardCountry !== null && countryRule(policy, input.cardCountry).blocked) return "BLOCKED";
  return input.cardCountry !== null && input.cardCountry.toUpperCase() === input.declaredCountry.toUpperCase()
    ? "OK" : "MISMATCH";
}

/** A new debate: only the always-blocked countries refuse (reading one's debates is never gated). */
export function decideAsk(policy: CountryPolicy, evidence: Readonly<{ ipCountry: string }>): AskDecision {
  return countryRule(policy, evidence.ipCountry).blocked ? refuse("COUNTRY_ASK_BLOCKED") : ALLOW;
}
