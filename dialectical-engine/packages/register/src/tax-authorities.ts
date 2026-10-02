import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { Pool } from "pg";

/**
 * Paid plans (spec 2026-09-29 §2.5.9) — WHERE AND WHEN EACH TAX IS PAID, as data. The owner's tax summary
 * (`pnpm billing:tax-summary`, the quarterly O1 email) prints these lines under each country. They are the
 * research of 29 September 2026 for the accountant to confirm; correcting one is a NEW version of this row
 * (a hosted file may carry its own `taxAuthorities`), never an edit of a sealed one.
 */
export const TAX_AUTHORITIES_ROW_KEY = "taxAuthorities" as const;

export type TaxAuthorityStatus = "TAXABLE" | "NON_TAXABLE" | "NOT_REGISTERED" | "REVERSE_CHARGE";
export type TaxAuthorityRegistration = "REGISTERED" | "FROM_FIRST_SALE" | "AFTER_THRESHOLD";
export type TaxDueRule =
  | Readonly<{ rule: "QUARTER_FOLLOWING_MONTH_END" }>
  | Readonly<{ rule: "FOLLOWING_MONTH_DAY"; day: number }>
  | Readonly<{ rule: "NONE" }>;

export type TaxAuthorityEntry = Readonly<{
  scheme: string;
  countries: ReadonlyArray<string>;
  /** null = every status; otherwise only these (the EU reverse charge versus the One-Stop Shop). */
  taxStatuses: ReadonlyArray<TaxAuthorityStatus> | null;
  registration: TaxAuthorityRegistration;
  where: string;
  when: string;
  due: TaxDueRule;
}>;

export type TaxAuthorities = Readonly<{
  entries: ReadonlyArray<TaxAuthorityEntry>;
  fallback: Readonly<{ where: string; when: string }>;
  sourceRef: string;
}>;

const iso2 = z.string().regex(/^[A-Z]{2}$/u);
const line = z.string().trim().min(1).max(600);
const dueSchema = z.discriminatedUnion("rule", [
  z.object({ rule: z.literal("QUARTER_FOLLOWING_MONTH_END") }).strict(),
  z.object({ rule: z.literal("FOLLOWING_MONTH_DAY"), day: z.number().int().min(1).max(28) }).strict(),
  z.object({ rule: z.literal("NONE") }).strict()
]);
const entrySchema = z.object({
  scheme: z.string().regex(/^[A-Z][A-Z0-9_]{1,47}$/u),
  countries: z.array(iso2).min(1).max(64),
  tax_statuses: z.array(z.enum(["TAXABLE", "NON_TAXABLE", "NOT_REGISTERED", "REVERSE_CHARGE"])).min(1).nullable(),
  registration: z.enum(["REGISTERED", "FROM_FIRST_SALE", "AFTER_THRESHOLD"]),
  where: line,
  when: line,
  due: dueSchema
}).strict();
const taxAuthoritiesValueSchema = z.object({
  kind: z.literal("TAX_AUTHORITIES"),
  entries: z.array(entrySchema).min(1).max(64),
  fallback: z.object({ where: line, when: line }).strict()
}).strict().superRefine((value, ctx) => {
  const schemes = value.entries.map((entry) => entry.scheme);
  if (new Set(schemes).size !== schemes.length) {
    ctx.addIssue({ code: "custom", path: ["entries"], message: "every scheme is named once" });
  }
  value.entries.forEach((entry, index) => {
    if (new Set(entry.countries).size !== entry.countries.length) {
      ctx.addIssue({ code: "custom", path: ["entries", index, "countries"], message: "a country is listed once per entry" });
    }
  });
});

export type TaxAuthoritiesValue = z.infer<typeof taxAuthoritiesValueSchema>;

export function taxAuthoritiesFromValue(value: unknown, sourceRef: string): TaxAuthorities {
  const parsed = taxAuthoritiesValueSchema.safeParse(value);
  if (!parsed.success || sourceRef.trim() === "") {
    throw new TypedDomainError("TAX_AUTHORITIES_INVALID", "The sealed tax-authorities row is absent or malformed");
  }
  return Object.freeze({
    entries: Object.freeze(parsed.data.entries.map((entry) => Object.freeze({
      scheme: entry.scheme,
      countries: Object.freeze([...entry.countries]),
      taxStatuses: entry.tax_statuses === null ? null : Object.freeze([...entry.tax_statuses]),
      registration: entry.registration,
      where: entry.where,
      when: entry.when,
      due: Object.freeze({ ...entry.due })
    }))),
    fallback: Object.freeze({ ...parsed.data.fallback }),
    sourceRef
  });
}

/** The first entry covering this tax country and status, or null (the summary then prints the fallback). */
export function taxAuthorityFor(
  authorities: TaxAuthorities, taxCountry: string, taxStatus: TaxAuthorityStatus
): TaxAuthorityEntry | null {
  return authorities.entries.find((entry) => entry.countries.includes(taxCountry)
    && (entry.taxStatuses === null || entry.taxStatuses.includes(taxStatus))) ?? null;
}

/** The row at a register version; null when the version carries none (the summary refuses to guess). */
export async function readTaxAuthorities(pool: Pick<Pool, "query">, registerVersion: number): Promise<TaxAuthorities | null> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, TAX_AUTHORITIES_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : taxAuthoritiesFromValue(row.value_json, row.source_ref);
}

const EU_EXCEPT_RO = Object.freeze([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
  "MT", "NL", "PL", "PT", "SK", "SI", "ES", "SE"
] as const);

const noDueDate = Object.freeze({ rule: "NONE" as const });

function afterThreshold(scheme: string, country: string, place: string, authority: string, threshold: string) {
  return Object.freeze({
    scheme, countries: Object.freeze([country]), tax_statuses: null, registration: "AFTER_THRESHOLD" as const,
    where: `Nothing until your sales to ${place} pass ${threshold}; after that, register with ${authority} and pay`
      + " there. Quaderno watches the threshold and warns you.",
    when: `After registration: the returns and payment dates ${authority} gives you.`,
    due: noDueDate
  });
}

function fromFirstSale(scheme: string, country: string, place: string, authority: string) {
  return Object.freeze({
    scheme, countries: Object.freeze([country]), tax_statuses: null, registration: "FROM_FIRST_SALE" as const,
    where: `${authority}. Tax is due there from the first sale, so payment stays switched off for ${place} until you`
      + " register there and mark it done in the country settings.",
    when: `After registration: the returns and payment dates ${authority} gives you.`,
    due: noDueDate
  });
}

export const TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: TAX_AUTHORITIES_ROW_KEY,
  sourceRef: "Paid plans spec 2026-09-29 §1.4 and §2.5.9: where and when to pay, research of 29 September 2026,"
    + " for the accountant to confirm",
  value: Object.freeze({
    kind: "TAX_AUTHORITIES" as const,
    entries: Object.freeze([
      Object.freeze({
        scheme: "RO_D300", countries: Object.freeze(["RO"]), tax_statuses: null, registration: "REGISTERED" as const,
        where: "ANAF, in your normal Romanian VAT return (form D300). The accountant uses SmartBill's data.",
        when: "By the 25th of the month after each VAT period (monthly or quarterly, as you are registered).",
        due: Object.freeze({ rule: "FOLLOWING_MONTH_DAY" as const, day: 25 })
      }),
      Object.freeze({
        scheme: "EU_REVERSE_CHARGE_D390", countries: EU_EXCEPT_RO, tax_statuses: Object.freeze(["REVERSE_CHARGE" as const]),
        registration: "REGISTERED" as const,
        where: "Nothing to pay: the invoice says \"Reverse charge\" and the buying company accounts for the VAT."
          + " Declare these sales to ANAF in the recapitulative statement (form D390); the accountant uses Quaderno's list.",
        when: "By the 25th of the month after the month of the sale.",
        due: Object.freeze({ rule: "FOLLOWING_MONTH_DAY" as const, day: 25 })
      }),
      Object.freeze({
        scheme: "EU_OSS", countries: EU_EXCEPT_RO, tax_statuses: null, registration: "REGISTERED" as const,
        where: "ANAF, once for all EU countries, through the EU One-Stop Shop return (form 398), in euro at the"
          + " ECB rate of the quarter's last day. ANAF passes each country its share. Quaderno's \"EU OSS report\""
          + " has the figures.",
        when: "Every quarter, by the end of the following month (30 April, 31 July, 31 October, 31 January).",
        due: Object.freeze({ rule: "QUARTER_FOLLOWING_MONTH_END" as const })
      }),
      afterThreshold("NO_VOEC", "NO", "Norway", "Norway's VOEC scheme (Skatteetaten)", "NOK 50,000 in a year"),
      afterThreshold("IS_VOES", "IS", "Iceland", "Iceland's VOES scheme (Skatturinn)", "ISK 2,000,000 in a year"),
      fromFirstSale("GB_HMRC", "GB", "the UK", "HM Revenue & Customs (HMRC), for UK VAT"),
      Object.freeze({
        scheme: "US_STATE", countries: Object.freeze(["US"]), tax_statuses: null, registration: "AFTER_THRESHOLD" as const,
        where: "Nothing until your sales into a state pass that state's threshold; after that, register with that"
          + " state's tax department and pay there. Quaderno watches every state's threshold and warns you.",
        when: "After registration: the filing calendar that state gives you.",
        due: noDueDate
      }),
      afterThreshold("CA_GST", "CA", "Canada", "the Canada Revenue Agency (GST/HST) and, for Quebec, Revenu Québec (QST)",
        "CAD 30,000 in a year"),
      afterThreshold("AU_GST", "AU", "Australia", "the Australian Taxation Office (GST)", "AUD 75,000 in a year"),
      afterThreshold("NZ_GST", "NZ", "New Zealand", "Inland Revenue (GST)", "NZD 60,000 in a year"),
      afterThreshold("SG_GST", "SG", "Singapore", "the Inland Revenue Authority of Singapore (GST)",
        "Singapore's threshold for overseas sellers"),
      afterThreshold("JP_CONSUMPTION_TAX", "JP", "Japan", "Japan's National Tax Agency (consumption tax)",
        "Japan's threshold for foreign sellers"),
      fromFirstSale("KR_VAT", "KR", "South Korea", "South Korea's National Tax Service, for VAT on electronic services"),
      fromFirstSale("IN_GST", "IN", "India", "India's GST authorities, for GST on online services"),
      fromFirstSale("AE_VAT", "AE", "the United Arab Emirates", "the UAE Federal Tax Authority, for VAT"),
      fromFirstSale("SA_VAT", "SA", "Saudi Arabia", "Saudi Arabia's Zakat, Tax and Customs Authority, for VAT"),
      fromFirstSale("MX_IVA", "MX", "Mexico", "Mexico's Tax Administration Service (SAT), for IVA on digital services"),
      fromFirstSale("AR_IVA", "AR", "Argentina", "Argentina's federal tax authority (ARCA), for IVA on digital services"),
      fromFirstSale("CO_IVA", "CO", "Colombia", "Colombia's tax authority (DIAN), for IVA on digital services"),
      fromFirstSale("CL_IVA", "CL", "Chile", "Chile's Internal Revenue Service (SII), for IVA on digital services"),
      fromFirstSale("TH_VAT", "TH", "Thailand", "Thailand's Revenue Department, for VAT on e-services"),
      fromFirstSale("PH_VAT", "PH", "the Philippines", "the Philippines' Bureau of Internal Revenue, for VAT on digital services")
    ]),
    fallback: Object.freeze({
      where: "No entry for this place yet: ask the accountant before paying anything.",
      when: "Ask the accountant."
    })
  })
});
