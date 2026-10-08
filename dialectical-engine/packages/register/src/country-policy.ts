import { z } from "zod";
import { TypedDomainError, US_STATE_CODES, type DeclaredRegion } from "@debateai/kernel";
import type { Pool } from "pg";

/**
 * Paid plans G2 (spec 2026-09-29 §1.5, §2.3.3) — WHICH COUNTRIES MAY SIGN UP, AND WHICH MAY PAY.
 *
 * Two switches per country — `signup` (sign up and use Free) and `pay` — and the reason a switch
 * is off: the Terms (NOT_OFFERED, TERMS_EXCLUDED), tax registration not yet done (TAX_NOT_READY),
 * sanctions (SANCTIONS) or an AI provider's own country list (PROVIDER_UNSUPPORTED). `blocked`
 * marks the always-blocked countries: no new debate is started from there either.
 *
 * `us_states` (optional) narrows the United States by the state a person DECLARES at sign-up: the
 * address lookup knows countries only, so a state rule is never IP evidence and is never `blocked`.
 *
 * A sealed register row like every policy value: changing a country is publishing a NEW version,
 * never an edit. The row is OPTIONAL: a register version that never published it has no country
 * gate (amendment A14), and hosted mode gates only when it is present.
 */
export const COUNTRY_POLICY_ROW_KEY = "countryPolicy" as const;

export type CountryReason = "OFFERED" | "NOT_OFFERED" | "TAX_NOT_READY" | "SANCTIONS" | "PROVIDER_UNSUPPORTED" | "TERMS_EXCLUDED";
export type CountryRule = Readonly<{ signup: boolean; pay: boolean; reason: CountryReason; blocked: boolean }>;
export type CountryPolicy = Readonly<{
  defaultRule: CountryRule;
  countries: Readonly<Record<string, CountryRule>>;
  usStates: Readonly<Record<string, CountryRule>>;
  unknownIp: "REFUSE";
  tor: "REFUSE";
  sourceRef: string;
}>;

const reasonSchema = z.enum(["OFFERED", "NOT_OFFERED", "TAX_NOT_READY", "SANCTIONS", "PROVIDER_UNSUPPORTED", "TERMS_EXCLUDED"]);
const ruleSchema = z.object({
  signup: z.boolean(),
  pay: z.boolean(),
  reason: reasonSchema,
  blocked: z.literal(true).optional()
}).strict();
/** ISO 3166-1 alpha-2, upper case; "XX" is the lookup's own "no country" and never a key. */
const isoCountrySchema = z.string().regex(/^[A-Z]{2}$/u).refine((code) => code !== "XX");
/** A state of the region picker's closed list (kernel region.ts). */
const usStateSchema = z.string().refine((code) => US_STATE_CODES.includes(code));

const countryPolicyValueSchema = z.object({
  kind: z.literal("COUNTRY_POLICY"),
  default_rule: ruleSchema,
  countries: z.record(isoCountrySchema, ruleSchema),
  us_states: z.record(usStateSchema, ruleSchema).optional(),
  unknown_ip: z.literal("REFUSE"),
  tor: z.literal("REFUSE")
}).strict().superRefine((value, context) => {
  const rules: ReadonlyArray<readonly [string, z.infer<typeof ruleSchema>]> = [
    ["default_rule", value.default_rule], ...Object.entries(value.countries),
    ...Object.entries(value.us_states ?? {}).map(([state, rule]) => [`US-${state}`, rule] as const)
  ];
  for (const [state, rule] of Object.entries(value.us_states ?? {})) {
    if (rule.blocked === true) context.addIssue({ code: "custom", message: `US-${state}: a state is never blocked` });
  }
  for (const [where, rule] of rules) {
    if (rule.pay && !rule.signup) {
      context.addIssue({ code: "custom", message: `${where}: pay without sign-up` });
    }
    if (rule.blocked === true && (rule.signup || rule.pay)) {
      context.addIssue({ code: "custom", message: `${where}: a blocked country with a switch on` });
    }
  }
  if (value.default_rule.blocked === true) {
    context.addIssue({ code: "custom", message: "default_rule: blocked" });
  }
});
export type CountryPolicyValue = z.infer<typeof countryPolicyValueSchema>;

type RuleValue = z.infer<typeof ruleSchema>;
const OFFERED: RuleValue = Object.freeze({ signup: true, pay: true, reason: "OFFERED" });
const SIGN_UP_ONLY: RuleValue = Object.freeze({ signup: true, pay: false, reason: "TAX_NOT_READY" });
const NOT_YET: RuleValue = Object.freeze({ signup: false, pay: false, reason: "NOT_OFFERED" });
const EXCLUDED: RuleValue = Object.freeze({ signup: false, pay: false, reason: "TERMS_EXCLUDED" });
const SANCTIONED: RuleValue = Object.freeze({ signup: false, pay: false, reason: "SANCTIONS", blocked: true });
const PROVIDERS_REFUSE: RuleValue = Object.freeze({ signup: false, pay: false, reason: "PROVIDER_UNSUPPORTED", blocked: true });

/**
 * The §1.5 table, every code spelled out. EU 27 + Norway and Iceland (Terms Annex A.1; one EU
 * return for the whole EU); US, Canada, Australia, New Zealand, Singapore, Japan (tax only past
 * thresholds Quaderno watches); Liechtenstein (shares Switzerland's VAT, which needs a Swiss tax
 * representative), the tax-from-first-sale country the Terms list, South Korea, and,
 * since the owner's amendment of 1 October 2026, Switzerland, Israel, Taiwan and Moldova (Terms
 * Annex A.6, A.9, A.10, A.7; each has its own tax rule for foreign digital sellers, not yet checked):
 * sign-up yes, pay not until the owner registers there; Ukraine: closed until the occupied regions
 * can be blocked; since the owner's amendment of 2 October 2026, the United Kingdom: not offered for
 * now, to open after launch; Turkey, Brazil, Indonesia and,
 * since the owner's amendment of 1 October 2026 (high risk, low benefit), Saudi Arabia, India, the
 * UAE, Mexico, Argentina, Colombia, Chile, Thailand and the Philippines: kept out by the Terms until
 * a local annex exists — not offered, not blocked (none is sanctioned, and the AI providers serve
 * them). Always blocked: Russia, Belarus and North Korea for sanctions; China, Hong Kong,
 * Macau, Iran, Cuba, Syria, Venezuela and Vietnam as the AI providers' and the Terms' commercial
 * scope — Cuba and Iran deliberately NOT worded as compliance with US sanctions (the EU Blocking
 * Statute, spec §2.12 item 7). Every country not listed takes `default_rule`: closed.
 * Since the owner's amendment of 8 October 2026, Tennessee is kept out by the Terms (section 2,
 * Annex A.3): its HB 1891 may require an age check of every account wherever account holders
 * publish (docs/legal-research, US state by state compliance). Every other state takes the US rule.
 */
const US_STATE_GROUPS: ReadonlyArray<readonly [readonly string[], RuleValue]> = Object.freeze([
  [["TN"], EXCLUDED]
]);
const COUNTRY_GROUPS: ReadonlyArray<readonly [readonly string[], RuleValue]> = Object.freeze([
  [["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT",
    "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "NO", "IS"], OFFERED],
  [["LI"], SIGN_UP_ONLY],
  [["US", "CA", "AU", "NZ", "SG", "JP"], OFFERED],
  [["KR", "CH", "IL", "TW", "MD"], SIGN_UP_ONLY],
  [["GB", "UA"], NOT_YET],
  [["TR", "BR", "ID", "SA", "IN", "AE", "MX", "AR", "CO", "CL", "TH", "PH"], EXCLUDED],
  [["RU", "BY", "KP"], SANCTIONED],
  [["CN", "HK", "MO", "IR", "CU", "SY", "VE", "VN"], PROVIDERS_REFUSE]
]);

export const COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: COUNTRY_POLICY_ROW_KEY,
  sourceRef: "Paid plans spec 2026-09-29 §1.5 country switches (owner decisions 29 September 2026, amended 1, 2 and 8 October 2026):"
    + " the Terms Annex A, sanctions and the AI providers' country lists",
  value: Object.freeze({
    kind: "COUNTRY_POLICY" as const,
    default_rule: NOT_YET,
    countries: Object.freeze(Object.fromEntries(
      COUNTRY_GROUPS.flatMap(([codes, rule]) => codes.map((code) => [code, rule] as const))
    )),
    us_states: Object.freeze(Object.fromEntries(
      US_STATE_GROUPS.flatMap(([codes, rule]) => codes.map((code) => [code, rule] as const))
    )),
    unknown_ip: "REFUSE" as const,
    tor: "REFUSE" as const
  })
});

function ruleOf(value: RuleValue): CountryRule {
  return Object.freeze({ signup: value.signup, pay: value.pay, reason: value.reason, blocked: value.blocked === true });
}

export function countryPolicyFromValue(value: unknown, sourceRef: string): CountryPolicy {
  const parsed = countryPolicyValueSchema.safeParse(value);
  if (!parsed.success || sourceRef.trim() === "") {
    throw new TypedDomainError("COUNTRY_POLICY_INVALID", "The sealed country policy is absent or malformed");
  }
  return Object.freeze({
    defaultRule: ruleOf(parsed.data.default_rule),
    countries: Object.freeze(Object.fromEntries(
      Object.entries(parsed.data.countries).map(([code, rule]) => [code, ruleOf(rule)])
    )),
    usStates: Object.freeze(Object.fromEntries(
      Object.entries(parsed.data.us_states ?? {}).map(([code, rule]) => [code, ruleOf(rule)])
    )),
    unknownIp: parsed.data.unknown_ip,
    tor: parsed.data.tor,
    sourceRef
  });
}

/** The rule for one ISO code (either case); an unlisted code takes the default rule. */
export function countryRule(policy: CountryPolicy, iso2: string): CountryRule {
  const code = typeof iso2 === "string" ? iso2.toUpperCase() : "";
  return Object.hasOwn(policy.countries, code) ? policy.countries[code]! : policy.defaultRule;
}

/** The rule for a declared region: a listed US state's own rule, else the country's. */
export function declaredRegionRule(policy: CountryPolicy, region: DeclaredRegion): CountryRule {
  const state = region.country.toUpperCase() === "US" ? region.usState : null;
  return state !== null && Object.hasOwn(policy.usStates, state) ? policy.usStates[state]! : countryRule(policy, region.country);
}

/** The row IN FORCE at a register version, or null when that version never published one. */
export async function readCountryPolicy(pool: Pool, registerVersion: number): Promise<CountryPolicy | null> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, COUNTRY_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : countryPolicyFromValue(row.value_json, row.source_ref);
}
