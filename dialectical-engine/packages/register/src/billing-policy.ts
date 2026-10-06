import type { Pool } from "pg";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { BillingPlans } from "./billing-plans.js";

/**
 * PAID PLANS (spec 2026-09-29 §2.5.1; amendment R1 A22) — THE BILLING SWITCH
 * AND ITS RULES.
 *
 * `enabled: false` is the resting state. Nothing about billing runs until the
 * owner publishes a version with `enabled: true`, and only in hosted mode (§2.2
 * rule 1). A22 removed two members:
 *  - the xMoney environment, which follows `XMONEY_API_BASE_URL`;
 *  - the owner's report address, which is `OWNER_REPORT_EMAIL_PATH`.
 * Each setting therefore has one source. The row is strict, so a row that still
 * carries either of them is refused.
 */
export const BILLING_POLICY_ROW_KEY = "billingPolicy" as const;

export type BillingPolicy = Readonly<{
  enabled: boolean;
  dunningRetryDays: ReadonlyArray<number>;
  withdrawalDays: number;
  renewalNoticeBusinessDays: number;
  lookAheadBusinessDays: number;
  confirmationBusinessDays: number;
  quoteTtlSeconds: number;
  taxCode: "saas" | "eservice";
  invoiceIssuerRules: Readonly<Record<string, "QUADERNO" | "SMARTBILL">>;
  withdrawalCountries: ReadonlyArray<string>;
  sourceRef: string;
}>;

const ISO2 = /^[A-Z]{2}$/u;
const wholeDays = (most: number) => z.number().int().positive().max(most);

/**
 * The consumer withdrawal right's legal floor (spec §2.5.1; EU Directive
 * 2011/83/EU art. 9, which the EEA applies, and the UK's 2013 regulations): at
 * least 14 days, for buyers in the EU 27, Iceland, Liechtenstein, Norway and
 * the UK. A row may be more generous (longer, more countries), never less, so a
 * hosted operator row that shortens the period or drops a country is refused
 * by name before it can be sealed and enforced.
 */
const WITHDRAWAL_LAW = Object.freeze({
  leastDays: 14,
  countries: Object.freeze([
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
    "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB"
  ])
});

/**
 * The notice a CHANGED renewal needs (spec §1.10 and the global constraints:
 * M3 at least 7 business days, Monday to Friday UTC, before the charge, as
 * xMoney's merchant rules require). P11 applies the sealed value directly, so
 * a row that shortens the notice is refused by name before it can be sealed;
 * a longer notice is allowed (final review Part 1b, Minor 6).
 */
const RENEWAL_NOTICE_RULE = Object.freeze({ leastBusinessDays: 7 });

/**
 * Spec §1.4: Romanian buyers get SmartBill's e-Factura, every other buyer Quaderno's document. The one issuer map a
 * row may seal (P2-M23).
 */
const INVOICE_ISSUER_SPLIT = Object.freeze({ RO: "SMARTBILL" as const, "*": "QUADERNO" as const });

const billingPolicyValueSchema = z.object({
  kind: z.literal("BILLING_POLICY"),
  enabled: z.boolean(),
  // at most 3 retries, so attempts stay 1..4 (A2), the range 0084's billing.charge.attempt CHECK allows
  dunning_retry_days: z.array(wholeDays(60)).min(1).max(3),
  withdrawal_days: z.number().int().min(WITHDRAWAL_LAW.leastDays).max(60),
  renewal_notice_business_days: z.number().int().min(RENEWAL_NOTICE_RULE.leastBusinessDays).max(30),
  look_ahead_business_days: wholeDays(60),
  confirmation_business_days: wholeDays(10),
  quote_ttl_seconds: z.number().int().min(60).max(86_400),
  tax_code: z.enum(["saas", "eservice"]),
  invoice_issuer_rules: z.record(z.string(), z.enum(["QUADERNO", "SMARTBILL"])),
  withdrawal_countries: z.array(z.string().regex(ISO2)).min(1)
}).strict().superRefine((value, ctx) => {
  const refuse = (path: string, message: string): void => { ctx.addIssue({ code: "custom", path: [path], message }); };
  if (value.dunning_retry_days.some((day, index) => index > 0 && day <= value.dunning_retry_days[index - 1]!)) {
    refuse("dunning_retry_days", "retry days rise strictly");
  }
  if (value.look_ahead_business_days < value.renewal_notice_business_days) {
    refuse("look_ahead_business_days", "the look-ahead covers at least the renewal notice");
  }
  const ruleKeys = Object.keys(value.invoice_issuer_rules);
  if (!ruleKeys.includes("*") || ruleKeys.some((key) => key !== "*" && !ISO2.test(key))) {
    refuse("invoice_issuer_rules", "rules are ISO-3166 alpha-2 upper case plus the catch-all *");
  }
  // P2-M23 (spec §1.4): the split is fixed, so the map is exactly INVOICE_ISSUER_SPLIT. SmartBill writes every buyer
  // as Romanian (a catch-all SmartBill would place foreign buyers in Romania) and Quaderno issues no e-Factura (RO to
  // Quaderno would leave Romanian invoices outside ANAF's SPV). A fixed map also means a credit note's issuer, read
  // from today's rules (P2-M22), is always the issuer of the invoice it credits.
  const splitKeys = Object.keys(INVOICE_ISSUER_SPLIT) as Array<keyof typeof INVOICE_ISSUER_SPLIT>;
  if (ruleKeys.length !== splitKeys.length
    || splitKeys.some((key) => value.invoice_issuer_rules[key] !== INVOICE_ISSUER_SPLIT[key])) {
    refuse("invoice_issuer_rules", "rules are exactly RO to SMARTBILL and every other country (*) to QUADERNO");
  }
  if (new Set(value.withdrawal_countries).size !== value.withdrawal_countries.length) {
    refuse("withdrawal_countries", "each country once");
  }
  if (WITHDRAWAL_LAW.countries.some((country) => !value.withdrawal_countries.includes(country))) {
    refuse("withdrawal_countries", "every EU/EEA country and the UK keeps its withdrawal right");
  }
});

/** Billing OFF. The owner switches it on by publishing a new version of this row (§1.7 step 7). */
export const BILLING_POLICY_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: BILLING_POLICY_ROW_KEY,
  sourceRef: "paid-plans-and-payments-design-2026-09-29#2.5.1 billingPolicy v1"
    + " (billing OFF until the owner publishes enabled: true)",
  value: Object.freeze({
    kind: "BILLING_POLICY" as const,
    enabled: false,
    dunning_retry_days: Object.freeze([1, 3, 7]),
    withdrawal_days: 14,
    renewal_notice_business_days: 7,
    look_ahead_business_days: 10,
    confirmation_business_days: 2,
    quote_ttl_seconds: 1_800,
    tax_code: "saas" as const,
    invoice_issuer_rules: Object.freeze({ RO: "SMARTBILL" as const, "*": "QUADERNO" as const }),
    // Exactly the legal set (WITHDRAWAL_LAW above); the sealed row is data, so it is spelled out.
    withdrawal_countries: Object.freeze([
      "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
      "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB"
    ])
  })
});

export function billingPolicyFromValue(value: unknown, sourceRef: string): BillingPolicy {
  const parsed = billingPolicyValueSchema.safeParse(value);
  if (!parsed.success || typeof sourceRef !== "string" || sourceRef.trim() === "") {
    throw new TypedDomainError("BILLING_POLICY_INVALID", "The sealed billing policy row is malformed");
  }
  const data = parsed.data;
  return Object.freeze({
    enabled: data.enabled,
    dunningRetryDays: Object.freeze([...data.dunning_retry_days]),
    withdrawalDays: data.withdrawal_days,
    renewalNoticeBusinessDays: data.renewal_notice_business_days,
    lookAheadBusinessDays: data.look_ahead_business_days,
    confirmationBusinessDays: data.confirmation_business_days,
    quoteTtlSeconds: data.quote_ttl_seconds,
    taxCode: data.tax_code,
    invoiceIssuerRules: Object.freeze({ ...data.invoice_issuer_rules }),
    withdrawalCountries: Object.freeze([...data.withdrawal_countries]),
    sourceRef
  });
}

/** The row in force, or `null` when the version sealed none: billing is then off. */
export async function readBillingPolicy(pool: Pool, registerVersion: number): Promise<BillingPolicy | null> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, BILLING_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : billingPolicyFromValue(row.value_json, row.source_ref);
}

/** The budget members of the cost-envelope policy in force (B1), read structurally. */
export type BillingReadinessEnvelope = Readonly<{
  closeBasisPoints: number | null;
  finishBasisPoints: number | null;
  waitingLinePerPerson: number | null;
}>;

/**
 * THE ONE READINESS QUESTION (reconciliation ruling R-5), asked at publish and
 * at the publish command's boot-readiness check (B11a), at the API's boot
 * (B6b's `ask-room` step, whose composition B8 reuses) and by P6a's billing
 * boot. The runner never asks it: it reads no billingPolicy (A20). It returns
 * `null` when billing is off. When billing is on, it returns the plans, or
 * refuses by name:
 *  - `BILLING_PLANS_UNRESOLVED` — the version seals no plans row;
 *  - `BILLING_REQUIRES_ENVELOPE_MEMBERS` (A22) — the cost-envelope policy lacks
 *    the three budget members. Person windows without the waiting line and the
 *    running wall would stop debates, which the budget rule forbids.
 */
export function assertBillingReady(input: Readonly<{
  policy: BillingPolicy | null;
  plans: BillingPlans | null;
  envelope: BillingReadinessEnvelope;
}>): BillingPlans | null {
  if (input.policy === null || !input.policy.enabled) return null;
  if (input.plans === null) {
    throw new TypedDomainError("BILLING_PLANS_UNRESOLVED", "Billing is enabled, but this register version seals no billingPlans row");
  }
  const { closeBasisPoints, finishBasisPoints, waitingLinePerPerson } = input.envelope;
  if (closeBasisPoints === null || finishBasisPoints === null || waitingLinePerPerson === null) {
    throw new TypedDomainError(
      "BILLING_REQUIRES_ENVELOPE_MEMBERS",
      "Billing is enabled, but the cost-envelope policy in force carries none of the budget members"
    );
  }
  return input.plans;
}
